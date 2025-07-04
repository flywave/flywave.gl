// CLASSES
export { default as Tile3DFeatureTable } from "./classes/tile-3d-feature-table";
export { default as Tile3DBatchTable } from "./classes/tile-3d-batch-table";

export { Tiles3DLoader, load3DTiles } from "./Loader";
export { Tile3DSubtreeLoader, loadSubtree } from "./SubtreeLoader";

export type {
    FeatureTableJson,
    B3DMContent,
    Tile3DBoundingVolume,
    Tiles3DTileJSON,
    Tiles3DTileJSONPostprocessed,
    Tiles3DTilesetJSON,
    Tiles3DTilesetJSONPostprocessed,
    Tiles3DTileContent,
    ImplicitTilingExensionData
} from "./types";

export type { Tiles3DLoaderOptions } from "./Loader";
export { TILE3D_TYPE } from "./constants";
