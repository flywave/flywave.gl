/* Copyright (C) 2025 flywave.gl contributors */

export {
    ProjectorOverlayManager,
    projectorBlending,
    type ProjectorLayerOptions,
    type ProjectorLayer,
    type ProjectorBlendMode
} from "./ProjectorOverlayManager";
export {
    ProjectorImageryProvider,
    ProjectorTileResource,
    type ProjectorTileEntry
} from "./ProjectorImageryProvider";

// Legacy 8-slot state consumed by the pre-refactor shared DEMTileMeshMaterial
// (still used by the quantized terrain path). The DEM layer-mesh pipeline no
// longer reads it.
export { ProjectorState, MAX_PROJECTOR_LAYERS } from "./ProjectorState";
