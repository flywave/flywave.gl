import { type TileKey } from "@flywave/flywave-geoutils";
import { type ITerrainSource } from "../../TerrainSource";
import { type ILayerStrategy } from "../layer-strategy/LayerStrategy";
import { QuantizedTerrainMesh } from "./QuantizedTerrainMesh";
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
export declare function getQuantizedMeshTerrain(layerStrategy: ILayerStrategy, dataSource: ITerrainSource, tileKey: TileKey, elevationMapEnabled: boolean, elevationMapFlipY: boolean): Promise<QuantizedTerrainMesh>;
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
export declare function getUpSamplQuantizedMeshTerrain(layerStrategy: ILayerStrategy, dataSource: ITerrainSource, parentQuantizedMesh: QuantizedTerrainMesh, parentTileKey: TileKey, tileKey: TileKey, elevationMapEnabled: boolean, elevationMapFlipY: boolean): Promise<QuantizedTerrainMesh>;
