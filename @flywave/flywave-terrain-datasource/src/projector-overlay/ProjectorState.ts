/* Copyright (C) 2025 flywave.gl contributors */

import * as THREE from "three";

/**
 * Maximum number of simultaneous projector layers per TerrainSource.
 *
 * Fixed at compile time because TSL unrolls the per-layer sampling loop in
 * the DEM tile shader. Capacity is per-source — each {@link TerrainSource}
 * owns its own {@link ProjectorState} instance.
 */
export const MAX_PROJECTOR_LAYERS = 8;

/**
 * Per-TerrainSource mutable state shared between a {@link ProjectorOverlayManager}
 * and every tile mesh that belongs to that source.
 *
 * A tile mesh holds a stable reference to its source's ProjectorState; the
 * DEM tile material reads from that reference every frame via TSL
 * `onObjectUpdate`. When the manager mutates this object (add/remove/update
 * layer, camera position for RTE correction), every bound tile sees the new
 * values on the next render without any re-binding.
 *
 * This object is intentionally a plain data holder — all lifecycle logic
 * lives in {@link ProjectorOverlayManager}.
 */
export class ProjectorState {
    /** Per-slot textures. `null` slots are skipped during sampling. */
    readonly textures: Array<THREE.Texture | null> = new Array(MAX_PROJECTOR_LAYERS).fill(null);

    /** Per-slot projector matrices (projection × view, world-space). */
    readonly matrices: THREE.Matrix4[] = Array.from(
        { length: MAX_PROJECTOR_LAYERS },
        () => new THREE.Matrix4()
    );

    /** Per-slot opacity multipliers in [0, 1]. */
    readonly opacities: number[] = new Array(MAX_PROJECTOR_LAYERS).fill(0);

    /** Number of active layers currently populating slots `[0, count)`. */
    count: number = 0;

    /**
     * Main camera world position for RTE (camera-relative-to-earth) correction.
     *
     * flywave renders terrain vertices in camera-relative space, but projector
     * matrices operate in absolute world space. The shader reconstructs
     * absolute coordinates as `positionWorld + cameraPos`, so this value must
     * be refreshed every frame (typically by {@link ProjectorOverlayManager.attachToMapView}).
     */
    readonly cameraPos: THREE.Vector3 = new THREE.Vector3();
}
