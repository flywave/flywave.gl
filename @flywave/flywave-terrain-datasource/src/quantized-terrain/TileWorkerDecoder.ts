/* Copyright (C) 2025 flywave.gl contributors */

// TileDecoderUtils.ts
import { type GeoBoxArray, type Projection, GeoBox, TileKey } from "@flywave/flywave-geoutils";

import {
    type SerializedGroundModificationPolygon,
    deserializeGroundModificationPolygon
} from "../ground-modification-manager";
import {
    type QuantizedMeshClipperOptions,
    QuantizedMeshClipper
} from "./quantized-mesh/QuantizedMeshClipper";
import {
    type QuantizedMeshLoaderOptions,
    QuantizedMeshLoader
} from "./quantized-mesh/QuantizedMeshLoader";
import {
    type QuantizedTerrainMeshData,
    QuantizedTerrainMesh
} from "./quantized-mesh/QuantizedTerrainMesh";
import { createStratumTileFromBuffer } from "./quantized-stratum-mesh/stratum-tile";
import { type DecodedStratumTileData } from "./quantized-stratum-mesh/stratum-tile/StratumTileData";
import { SerializableGeometryData } from "@flywave/flywave-utils/bufferGeometryTransfer";
import { Vector3 } from "three";
import { getProjection, getProjectionName } from "@flywave/flywave-datasource-protocol";

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
export const processQuantizedMesh = (
    data: { buffer: ArrayBuffer } & QuantizedMeshLoaderOptions,
    projection: Projection
): QuantizedTerrainMeshData => {
    // Convert geoBox array to GeoBox object
    data.geoBox = GeoBox.fromArray(data.geoBox as unknown as GeoBoxArray);

    // Load and parse the quantized mesh
    const quantizedMeshLoader = new QuantizedMeshLoader(projection, data);
    const quantizedTerrainMesh = quantizedMeshLoader.parse(data.buffer);

    quantizedTerrainMesh.generateAndProcessTerrain({
        heightMap: data.elevationMapEnabled
            ? {
                geoBox: data.geoBox,
                flipY: data.elevationMapFlipY
            }
            : undefined,
        clip: data.groundModificationPolygons?.map(deserializeGroundModificationPolygon),
        projection
    });

    return quantizedTerrainMesh.toQuantizedTerrainMeshData();
};

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
export const processUpsampledMesh = (
    data: {
        quantizedTerrainMeshData: QuantizedTerrainMeshData;
        tileKey: ArrayLike<number>;
        parentTileKey: ArrayLike<number>;
    } & QuantizedMeshClipperOptions,
    projection: Projection
): QuantizedTerrainMeshData => {
    // Convert geoBox array to GeoBox object
    data.geoBox = GeoBox.fromArray(data.geoBox as unknown as GeoBoxArray);
    data.targetGeoBox = GeoBox.fromArray(data.targetGeoBox as unknown as GeoBoxArray);
    data.projection = projection;

    // Parse tile keys from array format
    const targetTileKey = TileKey.fromArray(data.tileKey);
    const parentTileKey = TileKey.fromArray(data.parentTileKey);

    if (targetTileKey.level === parentTileKey.level) {
        return data.quantizedTerrainMeshData;
    }

    if (targetTileKey.level - parentTileKey.level !== 1) {
        throw new Error("Invalid tile key levels");
    }

    const isLeft = targetTileKey.column <= parentTileKey.column * 2;
    const isBottom = targetTileKey.row <= parentTileKey.row * 2;

    // Clip parent mesh to target tile resolution
    const quantizedMeshClipper = new QuantizedMeshClipper(data);
    const quantizedTerrainMesh = quantizedMeshClipper.clipToQuadrant(
        QuantizedTerrainMesh.fromQuantizedTerrainMeshData(data.quantizedTerrainMeshData),
        isLeft,
        isBottom
    );

    // Render heightmap for clipped mesh
    quantizedTerrainMesh.generateAndProcessTerrain({
        heightMap: data.elevationMapEnabled
            ? {
                geoBox: data.targetGeoBox,
                flipY: data.elevationMapFlipY
            }
            : undefined,
        clip: data.groundModificationPolygons?.map(deserializeGroundModificationPolygon),
        projection: data.projection
    });

    return quantizedTerrainMesh.toQuantizedTerrainMeshData();
};

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
export const processStratumTile = (params: DecodeStratumTileParams): DecodedStratumTileData => {
    const stratumTile = createStratumTileFromBuffer(
        params.geoBox,
        params.buffer,
        params.projection,
        params.groundModificationPolygons?.map(deserializeGroundModificationPolygon)
    );

    if (params.elevationMapEnabled) {
        // Render heightmap for clipped mesh
        stratumTile.drawHeightMap(
            params.geoBox,
            params.groundModificationPolygons?.map(deserializeGroundModificationPolygon),
            params.elevationMapFlipY
        );
    }

    return stratumTile.toDecodedStratumTileData();
};


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
export const processReProjectTileGeometry = (
    params: TileGeometryReprojectionParams,
    targetProjection: Projection
): TileGeometryReprojectionData => {
    const { position, center, targetTileCenter, sourceProjectionName } = params;

    let sourceProjection = getProjection(sourceProjectionName);
    // Validate input data
    if (position.itemSize !== 3) {
        throw new Error("Position data must have itemSize of 3 for 3D coordinates");
    }

    if (position.array.length % 3 !== 0) {
        throw new Error("Position array length must be divisible by 3");
    }

    // Create output array with same length as input
    const reprojectedArray = new Float32Array(position.array.length);
    const vertexCount = position.array.length / 3;

    // Reproject each vertex
    for (let i = 0; i < vertexCount; i++) {
        const baseIndex = i * 3;

        // Get original vertex position relative to tile center
        const x = position.array[baseIndex];
        const y = position.array[baseIndex + 1];
        const z = position.array[baseIndex + 2];

        // Calculate absolute position in source projection
        const absolutePosition = new Vector3(x, y, z).add(center);

        // Reproject to target coordinate system
        const reprojectedPosition = targetProjection.reprojectPoint(
            sourceProjection,
            absolutePosition,
            new Vector3
        );

        // Convert back to relative position by subtracting tile center
        const relativeReprojected = reprojectedPosition.sub(targetTileCenter);

        // Store reprojected coordinates
        reprojectedArray[baseIndex] = relativeReprojected.x;
        reprojectedArray[baseIndex + 1] = relativeReprojected.y;
        reprojectedArray[baseIndex + 2] = relativeReprojected.z;
    }

    return {
        position: {
            array: reprojectedArray,
            itemSize: 3
        },
        targetProjectionName:getProjectionName(targetProjection),
        sourceProjectionName:sourceProjectionName
    };
};