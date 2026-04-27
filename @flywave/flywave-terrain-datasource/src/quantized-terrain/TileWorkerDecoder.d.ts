import { type Projection, GeoBox } from "@flywave/flywave-geoutils";
import { type SerializedGroundModificationPolygon } from "../ground-modification-manager";
import { type QuantizedMeshClipperOptions } from "./quantized-mesh/QuantizedMeshClipper";
import { type QuantizedMeshLoaderOptions } from "./quantized-mesh/QuantizedMeshLoader";
import { type QuantizedTerrainMeshData } from "./quantized-mesh/QuantizedTerrainMesh";
import { type DecodedStratumTileData } from "./quantized-stratum-mesh/stratum-tile/StratumTileData";
import { Vector3 } from "three";
/**
 * Processes raw quantized mesh data into terrain mesh format
 *
 * This function takes raw quantized mesh buffer data and processes it into
 * a format suitable for terrain rendering. It handles elevation map generation
 * and ground modification clipping as needed.
 *
 * @param data - The raw quantized mesh data and processing options
 * @param projection - The map projection to use for coordinate transformations
 * @returns Processed quantized terrain mesh data
 */
export declare const processQuantizedMesh: (data: {
    buffer: ArrayBuffer;
} & QuantizedMeshLoaderOptions, projection: Projection) => QuantizedTerrainMeshData;
/**
 * Processes upsampled/clipped quantized mesh data from parent tiles
 *
 * This function takes quantized mesh data from a parent tile and clips
 * it to match the resolution and boundaries of a child tile. This is
 * used when higher resolution data needs to be generated from lower
 * resolution parents.
 *
 * @param data - The parent mesh data and clipping options
 * @param projection - The map projection to use for coordinate transformations
 * @returns Clipped and processed quantized terrain mesh data
 */
export declare const processUpsampledMesh: (data: {
    quantizedTerrainMeshData: QuantizedTerrainMeshData;
    tileKey: ArrayLike<number>;
    parentTileKey: ArrayLike<number>;
} & QuantizedMeshClipperOptions, projection: Projection) => QuantizedTerrainMeshData;
/**
 * Parameters for decoding stratum-based terrain tile data
 */
export interface DecodeStratumTileParams {
    /** Raw buffer containing the stratum tile data */
    buffer: ArrayBuffer;
    /** Geographic bounding box of the tile */
    geoBox: GeoBox;
    /** Map projection to use for coordinate transformations */
    projection: Projection;
    /** Optional ground modification polygons to apply */
    groundModificationPolygons?: SerializedGroundModificationPolygon[];
    /** Whether to flip the Y axis for elevation maps */
    elevationMapFlipY?: boolean;
    /** Whether to enable elevation map generation */
    elevationMapEnabled?: boolean;
}
/**
 * Initializes stratum-based terrain tile from buffer data
 *
 * This function processes raw stratum tile buffer data into a format
 * suitable for terrain rendering. It handles elevation map generation
 * and ground modification clipping as needed for stratum data.
 *
 * @param params - Parameters for decoding the stratum tile
 * @returns Processed stratum tile data
 */
export declare const processStratumTile: (params: DecodeStratumTileParams) => DecodedStratumTileData;
/**
 * Parameters for reprojecting tile geometry between coordinate systems
 */
export interface TileGeometryReprojectionParams {
    /** Center of the tile in the source projection system */
    center: Vector3;
    /** Center of the tile in the target projection system */
    targetTileCenter: Vector3;
    /** position data to reproject */
    position: {
        array: Float32Array;
        itemSize: 3;
    };
    /** normal data to reproject */
    normal: {
        array: Float32Array;
        itemSize: 3;
    };
    /** Source projection system of the input geometry */
    sourceProjectionName: string;
    /** Target projection system to reproject to */
    targetProjectionName: string;
}
/**
 * Result data from tile geometry reprojection process
 */
export interface TileGeometryReprojectionData {
    /** Reprojected geometry data in the target coordinate system */
    position: {
        array: Float32Array;
        itemSize: 3;
    };
    targetProjectionName: string;
    sourceProjectionName: string;
}
/**
 * Reprojects tile geometry from one coordinate system to another
 *
 * This function transforms geometry data between different map projections,
 * ensuring proper coordinate conversion for accurate spatial representation
 * across different coordinate reference systems.
 *
 * @param params - Parameters containing geometry data and projection information
 * @returns Reprojected geometry data in the target coordinate system
 */
export declare const processReProjectTileGeometry: (params: TileGeometryReprojectionParams, targetProjection: Projection) => TileGeometryReprojectionData;
