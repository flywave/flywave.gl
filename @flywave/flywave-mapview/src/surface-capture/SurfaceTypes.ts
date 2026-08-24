/* Copyright (C) 2026 flywave.gl contributors */

/**
 * Coarse per-pixel identity of a rendered surface, produced by the
 * [[SurfaceCapturePass]].
 *
 * The set is intentionally small and closed: each data source decides which
 * bucket its meshes belong to by tagging them (see {@link setCaptureSurfaceType}),
 * and draped primitives declare the buckets they are allowed to stick to.
 * When a genuinely new surface kind shows up, extend the enum here rather
 * than introducing per-source registries.
 */
export enum SurfaceType {
    /** Nothing captured at this pixel (sky or untagged geometry). */
    None = 0,
    /** Ground surfaces: DEM heightmap tiles, quantized mesh tiles, ... */
    Terrain = 1,
    /** Model surfaces standing above the ground (e.g. streamed tilesets). */
    Model = 2
}

/** Property assigned to Object3D instances to declare their surface type. */
export const CAPTURE_SURFACE_TYPE_PROPERTY = "captureSurfaceType";

/**
 * Tag an object so the surface capture pass picks it up. Only meshes with a
 * tag other than {@link SurfaceType.None} participate in the capture.
 */
export function setCaptureSurfaceType(object: unknown, type: SurfaceType): void {
    (object as { captureSurfaceType?: SurfaceType }).captureSurfaceType = type;
}

/** Read back the surface tag previously set with {@link setCaptureSurfaceType}. */
export function getCaptureSurfaceType(object: unknown): SurfaceType {
    const value = (object as { captureSurfaceType?: SurfaceType }).captureSurfaceType;
    return value ?? SurfaceType.None;
}
