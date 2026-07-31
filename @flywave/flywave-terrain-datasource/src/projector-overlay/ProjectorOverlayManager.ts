/* Copyright (C) 2025 flywave.gl contributors */

import { type GeoBox, type Projection, sphereProjection } from "@flywave/flywave-geoutils";
import { type MapView, MapViewEventNames } from "@flywave/flywave-mapview";
import * as THREE from "three/webgpu";

import { MAX_PROJECTOR_LAYERS, ProjectorState } from "./ProjectorState";

/**
 * Blend mode for compositing a projector layer over the base terrain color.
 *
 * - `normal`: standard alpha blend (source-over)
 * - `multiply`: multiply source with destination (good for shadows / darkening)
 * - `add`: additive blend (good for glow / highlights)
 *
 * @note Blend mode is currently a per-layer metadata field; the DEM tile
 * shader implements `normal`-style alpha blending today. Multiply / add
 * modes will be wired into the shader in a follow-up.
 */
export type ProjectorBlendMode = "normal" | "multiply" | "add";

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
 * owning source's projection; callers mutate `geoBox` via
 * {@link ProjectorOverlayManager.updateLayer} and the matrix is recomputed.
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

/**
 * Owns the lifecycle of all projector layers for a single {@link TerrainSource}.
 *
 * Each TerrainSource instance holds one ProjectorOverlayManager. The manager
 * owns a {@link ProjectorState} object; tile meshes created by that source
 * carry a stable reference to the same state object, and the DEM tile material
 * reads from it every frame via TSL `onObjectUpdate`. As a result, every
 * mutation (add / remove / update layer, camera-position refresh for RTE)
 * propagates to all bound tiles on the next render without any re-binding.
 *
 * Capacity is capped by {@link MAX_PROJECTOR_LAYERS} because the DEM tile
 * shader unrolls the per-layer sampling loop at compile time.
 *
 * Future layer types (canvas-drawn polylines, polygons, GeoJSON drapes,
 * vector tiles, heatmaps, …) can be added by giving them a texture + geoBox
 * pair; everything downstream is identical to a plain image layer.
 */
export class ProjectorOverlayManager {
    /** Shared mutable state read by the DEM tile shader. */
    readonly state: ProjectorState = new ProjectorState();

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
    constructor(private projection?: Projection) {}

    /**
     * Late-bind the geographic projection.
     *
     * Called by the owning TerrainSource once it has been attached to a
     * MapView. If the projection was already set this is a no-op; otherwise
     * it recomputes every existing layer's projector matrix.
     */
    setProjection(projection: Projection): void {
        if (this.projection === projection) return;
        this.projection = projection;
        for (const layer of this.layers.values()) {
            layer.matrix.copy(this._computeMatrix(layer.geoBox));
        }
        this._sync();
    }

    /**
     * Add a new projector layer.
     *
     * @returns the new layer id, or `-1` if the capacity has been reached.
     */
    addLayer(opts: ProjectorLayerOptions): number {
        if (this.layers.size >= MAX_PROJECTOR_LAYERS) {
            console.warn(
                `[ProjectorOverlayManager] MAX_PROJECTOR_LAYERS (${MAX_PROJECTOR_LAYERS}) reached; ignoring addLayer.`
            );
            return -1;
        }
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
        this._sync();
        return id;
    }

    /** Remove a layer by id. @returns `true` if the layer existed. */
    removeLayer(id: number): boolean {
        const ok = this.layers.delete(id);
        if (ok) this._sync();
        return ok;
    }

    /**
     * Update one or more properties of an existing layer.
     *
     * Changing `geoBox` recomputes the projector matrix; changing other
     * fields is a cheap uniform write.
     */
    updateLayer(id: number, partial: Partial<ProjectorLayerOptions>): boolean {
        const layer = this.layers.get(id);
        if (!layer) return false;
        if (partial.texture !== undefined) layer.texture = partial.texture;
        if (partial.geoBox !== undefined) {
            (layer as { geoBox: GeoBox }).geoBox = partial.geoBox;
            if (this.projection) {
                layer.matrix.copy(this._computeMatrix(partial.geoBox));
            }
        }
        if (partial.opacity !== undefined) layer.opacity = partial.opacity;
        if (partial.blendMode !== undefined) layer.blendMode = partial.blendMode;
        this._sync();
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
        this.layers.clear();
        this._sync();
    }

    /**
     * Push the current main-camera world position into the projector state.
     *
     * flywave renders terrain in camera-relative space (RTE), so projector
     * matrices — which are in absolute world space — need the camera position
     * each frame to reconstruct absolute vertex coordinates inside the shader.
     *
     * Prefer {@link attachToMapView} for automatic updates.
     */
    updateCameraPos(pos: THREE.Vector3): void {
        this.state.cameraPos.copy(pos);
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

    /**
     * Sync the layer list into {@link state} which the DEM tile shader samples.
     * Called after every mutation.
     */
    private _sync(): void {
        const arr = [...this.layers.values()];
        const count = Math.min(arr.length, MAX_PROJECTOR_LAYERS);

        for (let i = 0; i < count; i++) {
            this.state.textures[i] = arr[i].texture;
            this.state.matrices[i].copy(arr[i].matrix);
            this.state.opacities[i] = arr[i].opacity;
        }
        // Clear stale slots beyond current count so residual textures from a
        // removed layer don't leak into the shader.
        for (let i = count; i < MAX_PROJECTOR_LAYERS; i++) {
            this.state.textures[i] = null;
            this.state.opacities[i] = 0;
        }
        this.state.count = count;
    }
}
