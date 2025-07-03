import parse3DTilesSubtree from "./parsers/helpers/parse-3d-tile-subtree";
import type { Subtree } from "./types";
import { VERSION } from "./utils/version";

/**
 * Loader for 3D Tiles Subtree
 */
export const Tile3DSubtreeLoader = {
    dataType: null as unknown as Subtree,
    batchType: null as never,
    id: "3d-tiles-subtree",
    name: "3D Tiles Subtree",
    module: "3d-tiles",
    version: VERSION,
    extensions: ["subtree"],
    mimeTypes: ["application/octet-stream"],
    tests: ["subtree"],
    parse: parse3DTilesSubtree,
    options: {}
} as const;
