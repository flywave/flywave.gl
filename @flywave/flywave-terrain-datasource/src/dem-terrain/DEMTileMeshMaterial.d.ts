import "./Shader";
import * as THREE from "three";
/**
 * Interface defining the common uniforms used by the DEM tile mesh material
 *
 * These uniforms provide the shader with necessary data for rendering terrain
 * including height maps, texture transforms, and overlay information.
 */
interface CommonUniforms {
    /** Height map texture containing elevation data */
    uHeighMapTexture: {
        value: THREE.Texture;
    };
    /** Packing matrix for various terrain parameters */
    pack: {
        value: THREE.Matrix4;
    };
    /** Patch position matrix for simple terrain patches */
    uPatchPos: {
        value: THREE.Matrix4;
    };
    /** Depth packing value for depth buffer encoding */
    depth_packing_value: {
        value: number;
    };
    /** Transform matrix for overlay imagery UV coordinates */
    overlayerImageryTransform: {
        value: THREE.Matrix3;
    };
    /** Overlay imagery texture */
    overlayerImagery: {
        value: THREE.Texture;
    };
    /**
     * Transform parameters for UV coordinate mapping
     * @private
     */
    imageryPatchTransform: {
        value: THREE.Vector4[];
    };
    /**
     * Array of image textures for patch mapping
     * @private
     */
    imageryPatchArray: {
        value: THREE.Texture[];
    };
    /** Number of imagery patches */
    imageryPatchCount: {
        value: number;
    };
    uProjectionFactor: {
        value: number;
    };
    /** The skirt height for the mesh */
    uSkirtHeight: {
        value: number;
    };
}
/**
 * Custom material for rendering DEM (Digital Elevation Model) terrain tiles
 *
 * This material extends THREE.MeshStandardMaterial to provide specialized
 * rendering capabilities for terrain data. It incorporates height mapping,
 * texture overlays, and custom shader modifications for terrain visualization.
 *
 * The material uses a set of custom uniforms and shader includes to implement
 * terrain-specific rendering features like elevation-based displacement,
 * texture overlays, and depth packing.
 */
export declare class DEMTileMeshMaterial extends THREE.MeshStandardMaterial {
    /** Flag indicating if the material allows overrides */
    m_allowOverride: boolean;
    /** Common uniforms used by the material's shaders */
    m_commonUniform: CommonUniforms;
    /** Shader defines that control compilation variants */
    m_defines: Record<string, any>;
    /**
     * Creates a new DEM tile mesh material
     *
     * @param parameters - Optional material parameters to initialize with
     */
    constructor(parameters?: THREE.MeshStandardMaterialParameters);
    /**
     * Callback executed before shader compilation
     *
     * This method modifies the standard Three.js shaders to include terrain-specific
     * functionality by replacing shader chunks and adding custom uniforms and defines.
     *
     * @param shader - The shader parameters to modify
     */
    onBeforeCompile: (shader: THREE.WebGLProgramParametersWithUniforms) => void;
    /**
     * Copies properties from another DEM tile mesh material
     *
     * @param source - The source material to copy from
     * @returns This material for chaining
     */
    copy(source: DEMTileMeshMaterial): this;
    /**
     * Sets the image UV transform parameters for imagery patches
     * Used for proper texture mapping and alignment of multiple imagery sources
     */
    set imageryPatchs(value: Array<{
        transform: THREE.Vector4;
        texture: THREE.Texture;
    }>);
    get commonUniform(): CommonUniforms;
    /**
     * Sets up the overlay texture for this material
     *
     * This method configures an overlay texture that will be rendered on top
     * of the base terrain imagery, with appropriate UV transformation.
     *
     * @param overlayer - Optional overlay configuration with transform and texture
     */
    setupOverlayerTexture(overlayer?: {
        transform: THREE.Vector4;
        texture: THREE.Texture;
    }): void;
    /**
     * Sets the projection uniforms for terrain projection switching animation
     *
     * @param currentProjectionType - Current geometry projection type
     * @param targetProjectionType - Target projection type
     * @param projectionFactor - Interpolation factor between 0.0 and 1.0
     */
    setProjectionUniforms(projectionFactor: number): void;
}
export {};
