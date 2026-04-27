import "./Shader";
import { type TilingScheme, GeoBox } from "@flywave/flywave-geoutils";
import { MapView } from "@flywave/flywave-mapview";
import * as THREE from "three";
import { type GroundOverlayTextureResource } from "../../ground-overlay-provider";
import { type WebTile } from "../../WebImageryTileProvider";
import { type QuantizedTerrainMesh } from "./QuantizedTerrainMesh";
import { ProjectionSwitchController } from "../../ProjectionSwitchController";
export declare class QuantizedMeshMaterial extends THREE.MeshStandardMaterial {
    private readonly commonUniform;
    defines: Record<string, any>;
    /**
     * Creates a new QuantizedMeshMaterial instance
     *
     * @param parameters - Optional standard material parameters
     */
    constructor(parameters?: THREE.MeshStandardMaterialParameters);
    /**
     * Sets up custom shader modifications for terrain rendering
     *
     * This method injects custom shader chunks and uniforms to enable:
     * - UV coordinate transformations
     * - Water mask rendering with animated waves
     * - Clip UV functionality for texture clamping
     *
     * @param shader - The shader parameters to modify
     * @private
     */
    private _setupShader;
    /**
     * Sets the clip UV transform parameters
     * Used for texture coordinate clamping and clipping
     */
    set clipUvTransform(value: THREE.Vector3);
    /**
     * Sets the image UV transform parameters
     * Used for proper texture mapping and alignment
     */
    set imageryPatchs(value: Array<{
        transform: THREE.Vector4;
        texture: THREE.Texture;
    }>);
    setupOverlayerTexture(overlayer?: {
        transform: THREE.Vector4;
        texture: THREE.Texture;
    }): void;
    /**
     * Sets the water mask translation and scale parameters
     * Controls positioning and scaling of water mask texture
     */
    set waterMaskTranslationAndScale(value: THREE.Vector4);
    /**
     * Sets the water mask noisy translation and scale parameters
     * Controls positioning and scaling of noisy water effect
     */
    set waterMaskNoisyTranslationAndScale(value: THREE.Vector4);
    /**
     * Sets the water mask texture
     * Used for detecting ocean/sea areas for water rendering
     */
    set waterMaskTexture(value: THREE.Texture);
    /**
     * Sets the normal sampler texture
     * Used for water surface wave normal mapping effects
     */
    set normalSampler(value: THREE.Texture);
    /**
     * Sets the current frame number for animation purposes
     * Controls timing of water wave animations
     */
    set frameNumber(value: number);
}
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
export declare class QuantizedMesh extends THREE.Mesh {
    private readonly selfGeoBox;
    private readonly quantizedTerrainMesh;
    protected readonly projectionSwitchController: ProjectionSwitchController;
    protected readonly mapView?: MapView;
    /**
     * Creates a new QuantizedMesh instance
     *
     * @param tileKey - The tile key identifying this mesh
     * @param tileScheme - The tiling scheme used for coordinate calculations
     */
    constructor(selfGeoBox: GeoBox, quantizedTerrainMesh: QuantizedTerrainMesh, projectionSwitchController: ProjectionSwitchController, mapView?: MapView);
    /**
     * Sets up the mesh from quantized terrain mesh data
     *
     * This method configures the mesh geometry, transforms, and associated
     * textures from quantized terrain data including:
     * - Geometry and spatial transforms
     * - Parent tile key for clip UV calculations
     * - Water mask data for ocean rendering
     *
     * @param quantizedData - The quantized terrain mesh data
     */
    private setupFromQuantizedTerrainMesh;
    /**
     * Sets up the imagery texture for this mesh with proper UV coordinate transformation
     *
     * @param imageryResource - The imagery resource containing tile key and texture
     */
    setupImageryTexture(webTiles: WebTile[], webTingScheme: TilingScheme, quantizedTilingScheme: TilingScheme): void;
    setupOverlayerTexture(groundOverlay: GroundOverlayTextureResource | null, webTingScheme: TilingScheme, quantizedTilingScheme: TilingScheme): void;
    /**
     * Sets up the water mask for ocean/sea area rendering with animated wave effects
     *
     * @param waterResource - The water mask resource containing tile key and terrain data
     */
    private setupWaterMask;
    /**
     * Sets up the parent tile key for clip UV calculations
     * Used to determine texture coordinate clamping boundaries
     *
     * @param parentTileKey - The parent tile key for reference
     */
    private setupParentTileKey;
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
    /**
     * Computes the clip UV transform between parent and current tiles
     * Used for texture coordinate clamping to prevent bleeding
     *
     * @param parentTileKey - The parent tile key for reference
     * @param currentTileKey - The current tile key for target coordinates
     * @returns The computed clip UV transform as a Vector3 (scale, offsetX, offsetY)
     */
    private _computeClipUvTransform;
    /**
     * Computes the water mask transform between water and quantized tiles
     * Ensures proper positioning and scaling of water mask textures
     *
     * @param waterGeoBox - The geographic bounding box of the water mask
     * @param quantizedTileKey - The quantized mesh tile key for target coordinates
     * @param tilingScheme - The tiling scheme for coordinate calculations
     * @returns The computed water mask transform as a Vector4 (offsetX, offsetY, scaleX, scaleY)
     */
    private _computeWaterMaskTransform;
    /**
     * Computes the noisy water mask transform for animated wave effects
     * Provides proper positioning and scaling for water surface animations
     *
     * @param quantizedTileKey - The quantized mesh tile key for target coordinates
     * @param tilingScheme - The tiling scheme for coordinate calculations
     * @returns The computed noisy water mask transform as a Vector4 (offsetX, offsetY, scaleX, scaleY)
     */
    private _computeWaterMaskNoisyTransform;
}
