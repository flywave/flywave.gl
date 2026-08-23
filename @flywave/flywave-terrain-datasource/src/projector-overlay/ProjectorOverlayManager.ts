/* Copyright (C) 2025 flywave.gl contributors */

import { GeoBox } from "@flywave/flywave-geoutils";
import * as THREE from "three/webgpu";

import { ProjectorImageryProvider } from "./ProjectorImageryProvider";

/**
 * Blend mode for compositing a projector layer over the base terrain color.
 *
 * - `normal`: standard alpha blend (source-over)
 * - `multiply`: multiply source with destination (good for shadows / darkening)
 * - `add`: additive blend (good for glow / highlights)
 */
export type ProjectorBlendMode = "normal" | "multiply" | "add";

const BLENDING_BY_MODE: Record<ProjectorBlendMode, THREE.Blending> = {
    normal: THREE.NormalBlending,
    multiply: THREE.MultiplyBlending,
    add: THREE.AdditiveBlending
};

/** Map a projector blend mode to a three blending constant. */
export function projectorBlending(mode: ProjectorBlendMode): THREE.Blending {
    return BLENDING_BY_MODE[mode] ?? THREE.NormalBlending;
}

/**
 * Options for {@link ProjectorOverlayManager.addLayer}.
 */
export interface ProjectorLayerOptions {
    /** Texture to project. */
    texture: THREE.Texture;
    /** Geographic bounding box the texture should cover. */
    geoBox: GeoBox;
    /** Opacity in [0, 1]. @default 1 */
    opacity?: number;
    /** Blend mode. @default "normal" */
    blendMode?: ProjectorBlendMode;
}

/** Internal layer record. */
export interface ProjectorLayer {
    readonly id: number;
    texture: import("three/webgpu").Texture;
    geoBox: GeoBox;
    opacity: number;
    blendMode: ProjectorBlendMode;
}

function unionGeoBox(a: GeoBox, b: GeoBox): GeoBox {
    const sw = new GeoBox(a.southWest.clone(), a.northEast.clone());
    if (b.southWest.latitude < sw.southWest.latitude) {
        sw.southWest.latitude = b.southWest.latitude;
    }
    if (b.southWest.longitude < sw.southWest.longitude) {
        sw.southWest.longitude = b.southWest.longitude;
    }
    if (b.northEast.latitude > sw.northEast.latitude) {
        sw.northEast.latitude = b.northEast.latitude;
    }
    if (b.northEast.longitude > sw.northEast.longitude) {
        sw.northEast.longitude = b.northEast.longitude;
    }
    return sw;
}

/**
 * Owns the lifecycle of all projector layers for a single {@link TerrainSource}.
 *
 * Layers flow through the same per-tile resource pipeline as web imagery:
 * {@link ProjectorImageryProvider} evaluates geoBox intersections per tile and
 * the terrain loader renders one unlit decal mesh per intersecting layer
 * (see DEMTileOverlayMaterial's `projector` variant). There is no compile-time
 * layer cap.
 *
 * All layer mutations (add / remove / texture / opacity / blendMode / geoBox)
 * invalidate the provider's tile resources and re-create only the tiles
 * intersecting the affected geoBox (the mesh/material cache makes the rebuild
 * itself a uniform write).
 */
export class ProjectorOverlayManager {
    /** Feeds layers into the terrain resource pipeline. */
    readonly provider: ProjectorImageryProvider;

    private readonly layers = new Map<number, ProjectorLayer>();
    private nextId = 1;

    constructor() {
        this.provider = new ProjectorImageryProvider();
        this.provider.layerSource = () => this.getAllLayers();
    }

    /**
     * Add a new projector layer.
     *
     * @returns the new layer id.
     */
    addLayer(opts: ProjectorLayerOptions): number {
        const id = this.nextId++;
        const layer: ProjectorLayer = {
            id,
            texture: opts.texture,
            geoBox: opts.geoBox,
            opacity: opts.opacity ?? 1,
            blendMode: opts.blendMode ?? "normal"
        };
        this.layers.set(id, layer);
        this.provider.requestInvalidate(opts.geoBox);
        return id;
    }

    /** Remove a layer by id. @returns `true` if the layer existed. */
    removeLayer(id: number): boolean {
        const layer = this.layers.get(id);
        if (!layer) return false;
        this.layers.delete(id);
        this.provider.requestInvalidate(layer.geoBox);
        return true;
    }

    /**
     * Update one or more properties of an existing layer.
     *
     * Changing `geoBox` refreshes tiles intersecting the union of the old
     * and new bounds; other field changes refresh tiles intersecting the
     * layer box.
     */
    updateLayer(id: number, partial: Partial<ProjectorLayerOptions>): boolean {
        const layer = this.layers.get(id);
        if (!layer) return false;

        let affected: GeoBox | undefined;
        if (partial.geoBox !== undefined) {
            const previousBox = layer.geoBox;
            (layer as { geoBox: GeoBox }).geoBox = partial.geoBox;
            affected = unionGeoBox(previousBox, partial.geoBox);
        }
        if (partial.texture !== undefined && partial.texture !== layer.texture) {
            layer.texture = partial.texture;
            affected = affected ?? layer.geoBox;
        }
        if (partial.opacity !== undefined && partial.opacity !== layer.opacity) {
            layer.opacity = partial.opacity;
            affected = affected ?? layer.geoBox;
        }
        if (partial.blendMode !== undefined && partial.blendMode !== layer.blendMode) {
            layer.blendMode = partial.blendMode;
            affected = affected ?? layer.geoBox;
        }

        if (affected) {
            this.provider.requestInvalidate(affected);
        }
        return true;
    }

    hasLayer(id: number): boolean {
        return this.layers.has(id);
    }

    getLayer(id: number): ProjectorLayer | undefined {
        return this.layers.get(id);
    }

    /** Snapshot of all layers in insertion order. */
    getAllLayers(): ProjectorLayer[] {
        return [...this.layers.values()];
    }

    /** Current layer count. */
    get count(): number {
        return this.layers.size;
    }

    /** Remove every layer. */
    clear(): void {
        if (this.layers.size === 0) return;
        this.layers.clear();
        this.provider.requestInvalidate();
    }

}
