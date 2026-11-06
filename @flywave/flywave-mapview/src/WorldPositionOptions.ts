/* Copyright (C) 2025 flywave.gl contributors */

import { type Object3D } from "three/webgpu";

/**
 * Parameters to customize {@link (MapView.getWorldPositionAt)}.
 */
export interface WorldPositionOptions {
    /**
     * Whether the GPU depth stage (pickDepth readback) may answer the query.
     * Default `true`.
     *
     * Turn it off when scene objects must not influence the result — e.g. a
     * placement ghost/drag preview following the cursor would otherwise be
     * the depth answer at the very pixel it is queried for.
     */
    useDepth?: boolean;

    /**
     * Objects (and their subtrees) that must not answer the query, applied to
     * BOTH query stages:
     *
     * - GPU depth stage: the rendered object behind the pixel is resolved
     *   through the pickId packed into the same pickDepth readback; a hit on
     *   an excluded subtree counts as a miss.
     * - CPU surface raycast stage: data sources raycast the scene's
     *   registered objects (the primitive data source walks every registered
     *   primitive), so intersections whose hit object belongs to an excluded
     *   subtree are dropped as well.
     *
     * The query then continues with the data sources' surface raycast (DEM
     * bisection) and finally the math model. Excluding objects costs no
     * extra render pass.
     *
     * Typical use: the placement preview mesh following the cursor.
     */
    excludeObjects?: readonly Object3D[];

    /**
     * Answer from terrain (elevation-providing) data sources only, skipping
     * every other raycasting data source — primitive data sources (placed
     * objects, drag previews), 3D tiles, anchors, etc.
     *
     * Implies `useDepth: false`: the GPU depth buffer contains every rendered
     * surface, so it cannot answer a terrain-only query. The query therefore
     * goes straight to the DEM surface raycast (and the math model fallback).
     *
     * Default `false` (all raycasting data sources participate).
     */
    terrainOnly?: boolean;
}
