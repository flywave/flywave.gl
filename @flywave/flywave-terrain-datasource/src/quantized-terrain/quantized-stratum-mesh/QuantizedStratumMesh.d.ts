import "../quantized-mesh/Shader";
import { type GeoBox, type TilingScheme } from "@flywave/flywave-geoutils";
import { MapView } from "@flywave/flywave-mapview";
import * as THREE from "three";
import { type GroundOverlayTextureResource } from "../../ground-overlay-provider";
import { type WebTile } from "../../WebImageryTileProvider";
import { type StratumTileData } from "./stratum-tile/StratumTileData";
/**
 * Mesh class for rendering quantized terrain data with specialized texture handling
 *
 * This mesh class provides comprehensive support for:
 * - Quantized terrain geometry rendering
 * - Multi-layer texture mapping (imagery, water masks)
 * - UV coordinate transformations for proper texture alignment
 * - Water rendering with animated wave effects
 * - Clip UV functionality for texture clamping
 *
 * The mesh handles both terrain geometry and associated textures, providing a
 * complete solution for 3D terrain visualization.
 */
export declare class QuantizedStratumMesh extends THREE.Mesh {
    private readonly quantizedTerrainMesh;
    private readonly mapView;
    /**
     * Creates a new QuantizedMesh instance
     *
     * @param tileKey - The tile key identifying this mesh
     * @param tileScheme - The tiling scheme used for coordinate calculations
     */
    constructor(quantizedTerrainMesh: StratumTileData, mapView: MapView);
    private setupStratumStylesValues;
    private setupStratumStyles;
    setUpClipGeoBox(geoBox: GeoBox, quantizedTilingScheme: TilingScheme): void;
    /**
     * Sets up the imagery texture for this mesh with proper UV coordinate transformation
     *
     * @param imageryResource - The imagery resource containing tile key and texture
     */
    setupImageryTexture(webTiles: WebTile[], webTingScheme: TilingScheme, quantizedTilingScheme: TilingScheme): void;
    setupOverlayerTexture(groundOverlay: GroundOverlayTextureResource | null, webTingScheme: TilingScheme, quantizedTilingScheme: TilingScheme): void;
    /**
     * Computes the texture UV transform between imagery and quantized tiles
     * Ensures proper alignment and scaling of imagery textures
     *
     * @param imageryTileKey - The imagery tile key for source coordinates
     * @param quantizedTileKey - The quantized mesh tile key for target coordinates
     * @param tilingScheme - The tiling scheme for coordinate calculations
     * @returns The computed UV transform as a Vector4 (scaleX, scaleY, offsetX, offsetY)
     */
    private computeTextureUvTransform;
}
