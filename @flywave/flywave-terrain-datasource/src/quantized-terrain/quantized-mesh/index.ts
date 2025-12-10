/* Copyright (C) 2025 flywave.gl contributors */

import { type TileKey, EarthConstants, Projection } from "@flywave/flywave-geoutils";

import { TaskType } from "../../Constants";
import { serializeGroundModificationPolygon } from "../../ground-modification-manager";
import { type DecodedTerrainTile } from "../../TerrainDecoderWorker";
import { type ITerrainSource } from "../../TerrainSource";
import { type ILayerStrategy } from "../layer-strategy/LayerStrategy";
import { type QuantizedTerrainMeshData, QuantizedTerrainMesh } from "./QuantizedTerrainMesh";


/**
 * Fetches and processes quantized mesh terrain data for a specific tile
 *
 * @param layerStrategy - The layer strategy handling tile requests
 * @param dataSource - Terrain data source containing elevation data
 * @param tileKey - Identifier for the requested tile
 * @param elevationMapEnabled - Global flag indicating if elevation maps should be generated
 * @param elevationMapFlipY - Whether to flip the elevation map Y-coordinate
 * @returns Promise resolving to processed quantized terrain mesh
 *
 * Note: When ground modifications exist, DEM rendering is required for precise elevation adjustments,
 * hence elevation maps are auto-enabled regardless of the global setting.
 */
export async function getQuantizedMeshTerrain(
    layerStrategy: ILayerStrategy,
    dataSource: ITerrainSource,
    tileKey: TileKey,
    elevationMapEnabled: boolean,
    elevationMapFlipY: boolean
): Promise<QuantizedTerrainMesh> {
    let projection = dataSource.projection;
    return await layerStrategy
        .requestTileBuffer(tileKey)
        .then((buffer: ArrayBuffer) => {
            // Calculate base geometric error for LOD calculations
            const tileCountX = dataSource.getTilingScheme().subdivisionScheme.getLevelDimensionX(0);
            const maxRadius = EarthConstants.EQUATORIAL_RADIUS;
            const rootGeometricError = (maxRadius * 2 * Math.PI * 0.25) / (65 * tileCountX);

            // Get geographic bounds of the tile
            const geobox = layerStrategy.tilingScheme.getGeoBox(tileKey);

            // Check for ground modifications in this tile's area
            const groundModificationPolygons = dataSource
                .getGroundModificationManager()
                .findModificationsInBoundingBox(geobox)
                .map(serializeGroundModificationPolygon);

            let skirtHeight = Math.min((rootGeometricError / (1 << tileKey.level)) * 4.0, 1000);

            return dataSource.decoder.decodeTile(
                {
                    buffer,
                    type: TaskType.QuantizedMesh,
                    geoBox: geobox.toArray(),
                    skirtLength: skirtHeight, // Vertical skirt length in meters
                    groundModificationPolygons, // Serialized modification data
                    isWebMercator: true, // Using Web Mercator projection
                    smoothSkirtNormals: true, // Smooth shading for tile edges
                    solid: false, // Not solid geometry

                    /*
                     * Critical elevation map control logic:
                     * Elevation maps are REQUIRED in two cases:
                     * 1. When explicitly enabled via elevationMapEnabled parameter (global setting)
                     * 2. When ANY ground modifications exist in this tile (!!groundModificationPolygons?.length)
                     *
                     * Reason: Ground modifications require DEM-based rendering for:
                     * - Precise elevation adjustments (excavation/elevation)
                     * - Accurate blending with original terrain
                     * - Correct physics/collision calculations
                     * The DEM provides higher precision than standard mesh rendering
                     */
                    elevationMapEnabled: elevationMapEnabled || !!groundModificationPolygons?.length,
                    elevationMapFlipY
                },
                tileKey,
                projection
            );
        })
        .then((data: DecodedTerrainTile) => {
            // Convert raw decoded data to optimized quantized mesh format
            return QuantizedTerrainMesh.fromQuantizedTerrainMeshData(
                data.tileTerrain as QuantizedTerrainMeshData
            );
        });
}

/**
 * Fetches upsampled quantized mesh terrain data (generates higher resolution child terrain from parent terrain data)
 *
 * @param layerStrategy - Layer strategy processor
 * @param dataSource - Terrain data source
 * @param parentQuantizedMesh - Parent quantized mesh data
 * @param parentTileKey - Parent tile identifier
 * @param tileKey - Target tile identifier
 * @param elevationMapEnabled - Global elevation map enabled flag
 * @param elevationMapFlipY - Whether to flip the elevation map Y-coordinate
 * @returns Processed quantized terrain mesh
 *
 * Note: When ground modifications exist, elevation maps are automatically enabled to ensure precise terrain modification effects,
 * which is consistent with the base getQuantizedMeshTerrain function logic.
 */
export async function getUpSamplQuantizedMeshTerrain(
    layerStrategy: ILayerStrategy,
    dataSource: ITerrainSource,
    parentQuantizedMesh: QuantizedTerrainMesh,
    parentTileKey: TileKey,
    tileKey: TileKey,
    elevationMapEnabled: boolean,
    elevationMapFlipY: boolean
): Promise<QuantizedTerrainMesh> {
    // Get geographic bounding box of target tile
    const targetGeoBox = layerStrategy.tilingScheme.getGeoBox(tileKey);

    // Find and serialize terrain modification polygons in current tile area
    const groundModificationPolygons = dataSource
        .getGroundModificationManager()
        .findModificationsInBoundingBox(targetGeoBox)
        .map(serializeGroundModificationPolygon);

    let projection = dataSource.projection;
    const maxRadius = EarthConstants.EQUATORIAL_RADIUS;
    const tileCountX = dataSource.getTilingScheme().subdivisionScheme.getLevelDimensionX(0);

    const rootGeometricError = (maxRadius * 2 * Math.PI * 0.25) / (65 * tileCountX);

    let skirtHeight = Math.min((rootGeometricError / (1 << tileKey.level)) * 4.0, 1000);
    // Use decoder for terrain data upsampling
    return dataSource.decoder
        .decodeTile(
            {
                type: TaskType.QuantizedUpsample, // Specify as upsampling task type
                quantizedTerrainMeshData: parentQuantizedMesh.toQuantizedTerrainMeshData(), // Parent mesh data
                smoothSkirtNormals: true, // Enable edge normal smoothing
                skirtHeight, // Inherit from parent or use default skirt length
                geoBox: layerStrategy.tilingScheme.getGeoBox(parentTileKey).toArray(), // Parent geographic bounds
                targetGeoBox: targetGeoBox.toArray(), // Target tile geographic bounds
                groundModificationPolygons, // Current area terrain modification data
                tileKey: tileKey.toArray(), // Current tile identifier
                isWebMercator: true, // Use Web Mercator projection
                parentTileKey: parentTileKey.toArray(), // Parent tile identifier
                solid: false, // Not solid geometry

                /**
                 * Elevation map enable logic (identical to base function):
                 * Enable elevation map when either condition is met:
                 * 1. Global elevationMapEnabled parameter is true
                 * 2. Terrain modification polygons exist in current tile area (!!groundModificationPolygons?.length is true)
                 *
                 * Technical note: The upsampling process also requires DEM data to ensure:
                 * - Precise edge transitions in terrain modification areas
                 * - Elevation continuity between modified areas and surrounding terrain
                 * - Avoid seam issues between different LOD levels
                 */
                elevationMapEnabled: elevationMapEnabled || !!groundModificationPolygons?.length,
                elevationMapFlipY
            },
            tileKey,
            projection
        )
        .then((data: DecodedTerrainTile) => {
            // Convert decoded data to quantized mesh object
            return QuantizedTerrainMesh.fromQuantizedTerrainMeshData(
                data.tileTerrain as QuantizedTerrainMeshData
            );
        });
}