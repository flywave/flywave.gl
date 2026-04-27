import { type IVisualBatchMaterialParams, VisualBatchMaterial } from "@flywave/flywave-materials";
import * as THREE from "three";
/**
 * Parameters for constructing a StratumMaterial instance
 * @property {THREE.Texture[]} [imageryTextures] - Array of terrain imagery textures
 * @property {THREE.Vector4[]} [imageryTransforms] - UV transforms for each texture (scaleX, scaleY, offsetX, offsetY)
 */
interface IStratumMaterialParams extends IVisualBatchMaterialParams {
    imageryTextures?: THREE.Texture[];
    imageryTransforms?: THREE.Vector4[];
}
/**
 * Enhanced terrain material supporting:
 * - Face type filtering using bitwise operations
 * - Multi-texture blending with individual UV transforms
 * - Material ID based styling
 *
 * @extends VisualBatchMaterial
 */
declare class StratumMaterial extends VisualBatchMaterial {
    /**
     * Material uniforms including terrain-specific parameters
     * @property {THREE.IUniform<number>} faceVisible - Bitmask for visible face types
     * @property {THREE.IUniform<THREE.Vector4[]>} imageryPatchTransform - UV transforms for each texture
     * @property {THREE.IUniform<THREE.Texture[]>} imageryPatchArray - Texture array for terrain imagery
     * @property {THREE.IUniform<number>} imageryPatchCount - Number of active texture patches
     * @property {THREE.IUniform<THREE.Vector4>} clipPatchTransform - UV transform for clip patch
     */
    uniforms: {
        faceVisible: THREE.IUniform<number>;
        imageryPatchTransform: THREE.IUniform<THREE.Vector4[]>;
        imageryPatchArray: THREE.IUniform<THREE.Texture[]>;
        imageryPatchCount: THREE.IUniform<number>;
        clipPatchTransform: THREE.IUniform<THREE.Vector4>;
        uCurrentGeometryProjectionType: THREE.IUniform<number>;
        uTargetProjectionType: THREE.IUniform<number>;
        uProjectionFactor: THREE.IUniform<number>;
        uEarthRadius: THREE.IUniform<number>;
    } & VisualBatchMaterial["uniforms"];
    /**
     * Creates a new StratumMaterial instance
     * @param {IStratumMaterialParams} [params={}] - Material configuration parameters
     */
    constructor(params?: IStratumMaterialParams);
    setupOverlayerTexture(overlayer?: {
        transform: THREE.Vector4;
        texture: THREE.Texture;
    }): void;
    /**
     * Sets the face visibility bitmask
     * @param {number} value - Bitmask representing visible face types
     */
    set faceVisible(value: number);
    /**
     * Gets the current face visibility bitmask
     * @returns {number} Current face visibility bitmask
     */
    get faceVisible(): number;
    /**
     * Configures imagery textures and their UV transforms
     * @param {THREE.Texture[]} textures - Array of textures to apply
     * @param {THREE.Vector4[]} transforms - Corresponding UV transforms for each texture
     * @throws {Error} If textures and transforms arrays don't match in length
     * @throws {Error} If exceeding maximum texture count
     */
    private setImageryTextures;
    /**
     * Sets the image UV transform parameters
     * Used for proper texture mapping and alignment
     */
    set imageryPatchs(value: Array<{
        transform: THREE.Vector4;
        texture: THREE.Texture;
    }>);
    set clipPatch(transform: THREE.Vector4);
    /**
     * Cleans up material resources
     */
    dispose(): void;
    /**
     * Gets custom uniforms for terrain rendering
     * @returns {Object} Custom uniform definitions
     * @protected
     */
    protected _getCustomUniforms(): {
        faceVisible: {
            value: number;
        };
        imageryPatchTransform: {
            value: any[];
        };
        imageryPatchArray: {
            value: any[];
        };
        imageryPatchCount: {
            value: number;
        };
        clipPatchTransform: {
            value: THREE.Vector4;
        };
        overlayerImageryTransform: {
            value: THREE.Vector4;
        };
        overlayerImagery: {
            value: any;
        };
        uCurrentGeometryProjectionType: {
            value: number;
        };
        uTargetProjectionType: {
            value: number;
        };
        uProjectionFactor: {
            value: number;
        };
        uEarthRadius: {
            value: number;
        };
    };
    /**
     * Sets the projection uniforms for terrain projection switching animation
     *
     * @param currentProjectionType - Current geometry projection type
     * @param targetProjectionType - Target projection type
     * @param projectionFactor - Interpolation factor between 0.0 and 1.0
     */
    setProjectionUniforms(currentProjectionType: number, targetProjectionType: number, projectionFactor: number): void;
    /**
     * Gets custom vertex shader chunks
     * @returns {string} GLSL code to inject in vertex shader
     * @protected
     */
    protected _getCustomVertexShaderChunks(): string;
    /**
     * Gets custom fragment shader chunks
     * @returns {string} GLSL code to inject in fragment shader
     * @protected
     */
    protected _getCustomFragmentShaderChunks(): string;
    /**
     * Gets vertex shader replacement code
     * @returns {string} GLSL code to replace in vertex shader
     * @protected
     */
    protected _getVertexShaderReplacement(): string;
    /**
     * Gets fragment shader replacement code
     * @returns {string} GLSL code to replace in fragment shader
     * @protected
     */
    protected _getFragmentShaderReplacement(): string;
}
export { StratumMaterial, type IStratumMaterialParams };
