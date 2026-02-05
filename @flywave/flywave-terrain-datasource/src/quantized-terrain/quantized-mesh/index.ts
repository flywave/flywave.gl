/* Copyright (C) 2025 flywave.gl contributors */

import {
    type TileKey,
    EarthConstants,
    Projection,
    GeoBox,
    GeoCoordinates
} from "@flywave/flywave-geoutils";

import { TaskType } from "../../Constants";
import { type DecodedTerrainTile } from "../../TerrainDecoderWorker";
import { type ITerrainSource } from "../../TerrainSource";
import { type ILayerStrategy } from "../layer-strategy/LayerStrategy";
import { type QuantizedTerrainMeshData, QuantizedTerrainMesh } from "./QuantizedTerrainMesh";
import { serializeHeightMapModifier } from "../../ground-modification-manager";

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

            // Check for height map modifiers in this tile's area
            const foundModifiers = dataSource
                .getGroundModificationManager()
                .findModifiersInBoundingBox(geobox);
            const heightMapModifiers = foundModifiers.map(m => serializeHeightMapModifier(m));

            let skirtHeight = Math.min((rootGeometricError / (1 << tileKey.level)) * 4.0, 1000);

            return dataSource.decoder.decodeTile(
                {
                    buffer,
                    type: TaskType.QuantizedMesh,
                    geoBox: geobox.toArray(),
                    skirtLength: skirtHeight,
                    heightMapModifiers,
                    isWebMercator: true,
                    smoothSkirtNormals: true,
                    solid: false,

                    /*
                     * Critical elevation map control logic:
                     * Elevation maps are REQUIRED in two cases:
                     * 1. When explicitly enabled via elevationMapEnabled parameter (global setting)
                     * 2. When ANY height map modifiers exist in this tile (!!heightMapModifiers?.length)
                     */
                    elevationMapEnabled: elevationMapEnabled || !!heightMapModifiers?.length,
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

    // Find and serialize height map modifiers in current tile area
    const foundModifiers = dataSource
        .getGroundModificationManager()
        .findModifiersInBoundingBox(targetGeoBox);
    const heightMapModifiers = foundModifiers.map(m => ({
        id: m.id,
        source: m.source,
        geoBox: m.geoBox.toArray(),
        blendMode: m.blendMode,
        opacity: m.opacity,
        enabled: m.enabled,
        heightScale: m.heightScale
    }));

    let projection = dataSource.projection;
    const maxRadius = EarthConstants.EQUATORIAL_RADIUS;
    const tileCountX = dataSource.getTilingScheme().subdivisionScheme.getLevelDimensionX(0);

    const rootGeometricError = (maxRadius * 2 * Math.PI * 0.25) / (65 * tileCountX);

    let skirtHeight = Math.min((rootGeometricError / (1 << tileKey.level)) * 4.0, 1000);
    // Use decoder for terrain data upsampling
    return dataSource.decoder
        .decodeTile(
            {
                type: TaskType.QuantizedUpsample,
                quantizedTerrainMeshData: parentQuantizedMesh.toQuantizedTerrainMeshData(),
                smoothSkirtNormals: true,
                skirtHeight,
                geoBox: layerStrategy.tilingScheme.getGeoBox(parentTileKey).toArray(),
                targetGeoBox: targetGeoBox.toArray(),
                heightMapModifiers,
                tileKey: tileKey.toArray(),
                isWebMercator: true,
                parentTileKey: parentTileKey.toArray(),
                solid: false,

                /**
                 * Elevation map enable logic:
                 * Enable elevation map when either condition is met:
                 * 1. Global elevationMapEnabled parameter is true
                 * 2. Height map modifiers exist in current tile area (!!heightMapModifiers?.length is true)
                 */
                elevationMapEnabled: elevationMapEnabled || !!heightMapModifiers?.length,
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
