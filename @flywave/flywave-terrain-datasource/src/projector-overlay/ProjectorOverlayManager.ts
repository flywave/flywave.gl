/* Copyright (C) 2025 flywave.gl contributors */

import { GeoBox, type Projection } from "@flywave/flywave-geoutils";
import { type MapView, MapViewEventNames } from "@flywave/flywave-mapview";
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

/**
 * Internal layer record. The `matrix` field is derived from `geoBox` and the
 * owning source's projection. It is a LIVE shared instance: every tile
 * material of this layer wraps the same Matrix4 in a uniform node, so
 * recomputing it in place (matrix.copy) updates all tiles with zero rebuilds.
 */
export interface ProjectorLayer {
    readonly id: number;
    texture: THREE.Texture;
    geoBox: GeoBox;
    opacity: number;
    blendMode: ProjectorBlendMode;
    /** Derived projection × view matrix from the current geoBox + projection. */
    readonly matrix: THREE.Matrix4;
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
 * Mutations split into two cost tiers:
 *  - Zero-rebuild: cameraPos refresh (every frame) and projector-matrix
 *    updates, which mutate shared instances read live by material uniforms.
 *  - Filtered rebuild: add / remove / texture / opacity / blendMode / geoBox
 *    changes invalidate the provider's tile resources and re-create only the
 *    tiles intersecting the affected geoBox (mesh/material cache makes the
 *    rebuild itself a uniform write).
 */
export class ProjectorOverlayManager {
    /**
     * Main camera world position for RTE (camera-relative-to-earth) correction.
     *
     * Shared instance wrapped by every projector layer material uniform;
     * refreshed every frame when {@link attachToMapView} is active.
     */
    readonly cameraPos: THREE.Vector3 = new THREE.Vector3();

    /** Feeds layers into the terrain resource pipeline. */
    readonly provider: ProjectorImageryProvider;

    private readonly layers = new Map<number, ProjectorLayer>();
    private nextId = 1;

    /**
     * @param projection - Geographic → world-space projection used by the
     *                     owning TerrainSource. May be `undefined` if the
     *                     manager is created before its source is connected
     *                     to a MapView; in that case projector matrices are
     *                     computed lazily once {@link setProjection} is called
     *                     (typically from {@link TerrainSource.connect}).
     */
    constructor(private projection?: Projection) {
        this.provider = new ProjectorImageryProvider();
        this.provider.layerSource = () => this.getAllLayers();
    }

    /**
     * Late-bind the geographic projection.
     *
     * Recomputes every existing layer's projector matrix in place (live
     * shared instances — no tile rebuilds needed).
     */
    setProjection(projection: Projection): void {
        if (this.projection === projection) return;
        this.projection = projection;
        for (const layer of this.layers.values()) {
            layer.matrix.copy(this._computeMatrix(layer.geoBox));
        }
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
            blendMode: opts.blendMode ?? "normal",
            matrix: this.projection ? this._computeMatrix(opts.geoBox) : new THREE.Matrix4()
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
     * Changing `geoBox` recomputes the projector matrix in place (zero
     * rebuild for unaffected uniforms) and refreshes tiles intersecting the
     * union of the old and new bounds; other field changes refresh tiles
     * intersecting the layer box.
     */
    updateLayer(id: number, partial: Partial<ProjectorLayerOptions>): boolean {
        const layer = this.layers.get(id);
        if (!layer) return false;

        let affected: GeoBox | undefined;
        if (partial.geoBox !== undefined) {
            const previousBox = layer.geoBox;
            (layer as { geoBox: GeoBox }).geoBox = partial.geoBox;
            if (this.projection) {
                layer.matrix.copy(this._computeMatrix(partial.geoBox));
            }
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

    /**
     * Push the current main-camera world position into {@link cameraPos}.
     *
     * flywave renders terrain in camera-relative space (RTE), so projector
     * matrices — which are in absolute world space — need the camera position
     * each frame to reconstruct absolute vertex coordinates inside the shader.
     *
     * Prefer {@link attachToMapView} for automatic updates.
     */
    updateCameraPos(pos: THREE.Vector3): void {
        this.cameraPos.copy(pos);
    }

    /**
     * Convenience wrapper: subscribe to `WillRender` and keep RTE correction
     * in sync automatically. Called once by the owning TerrainSource during
     * its `connect()` phase — user code does not normally need to call this.
     */
    attachToMapView(mapView: MapView): void {
        mapView.addEventListener(MapViewEventNames.WillRender, () => {
            this.updateCameraPos(mapView.camera.position);
        });
    }

    /**
     * Compute the orthographic projector matrix for a geographic region.
     *
     * The projector is placed along the surface normal at the geoBox center,
     * looking at the world origin, with an ortho frustum exactly enclosing
     * the geoBox's world-space extent. This matches the convention used by
     * the DEM tile shader.
     */
    private _computeMatrix(geoBox: GeoBox): THREE.Matrix4 {
        if (!this.projection) {
            throw new Error(
                "ProjectorOverlayManager: cannot compute projector matrix before projection is set (call setProjection after connect)."
            );
        }
        const sw = this.projection.projectPoint(geoBox.southWest, new THREE.Vector3());
        const ne = this.projection.projectPoint(geoBox.northEast, new THREE.Vector3());
        const center = this.projection.projectPoint(geoBox.center, new THREE.Vector3());

        const halfW = Math.abs(ne.x - sw.x) / 2;
        const halfH = Math.abs(ne.y - sw.y) / 2;
        const dist = Math.max(halfW, halfH) * 2;

        const normal = center.clone().normalize();

        const cam = new THREE.OrthographicCamera(-halfW, halfW, halfH, -halfH, 0.1, dist * 5);
        cam.position.copy(normal).multiplyScalar(dist);
        cam.lookAt(0, 0, 0);
        cam.updateMatrixWorld();
        cam.updateProjectionMatrix();

        const m = new THREE.Matrix4();
        m.multiplyMatrices(cam.projectionMatrix, cam.matrixWorldInverse);
        return m;
    }
}
