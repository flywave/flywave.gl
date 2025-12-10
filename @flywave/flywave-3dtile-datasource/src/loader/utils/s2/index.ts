/* Copyright (C) 2025 flywave.gl contributors */

export { getS2CellIdFromToken, getS2TokenFromCellId, getS2ChildCellId } from "./S2TokenFunctions";
export { getS2BoundaryFlat, getS2LngLat } from "./S2GeometryFunctions";

export { getS2Cell, getS2QuadKey } from "./s2geometry/S2CellUtils";
export {
    getS2QuadkeyFromCellId,
    getS2CellFromQuadKey,
    getS2CellIdFromQuadkey,
    getS2LngLatFromS2Cell
} from "./s2geometry/S2Geometry";

export { getS2Region } from "./converters/S2ToRegion";

export type { S2HeightInfo } from "./converters/S2ToObbPoints";
export { getS2OrientedBoundingBoxCornerPoints } from "./converters/S2ToObbPoints";
