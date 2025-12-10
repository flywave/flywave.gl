/* Copyright (C) 2025 flywave.gl contributors */

import "./Shader";

import { MapView } from "@flywave/flywave-mapview";
import * as THREE from "three";

/**
 * Empty texture used as a placeholder for uninitialized textures
 */
const emptyTexture = new THREE.DataTexture();

/**
 * Interface defining the common uniforms used by the DEM tile mesh material
 *
 * These uniforms provide the shader with necessary data for rendering terrain
 * including height maps, texture transforms, and overlay information.
 */
interface CommonUniforms {
    /** Height map texture containing elevation data */
    uHeighMapTexture: { value: THREE.Texture };
    /** Packing matrix for various terrain parameters */
    pack: { value: THREE.Matrix4 };
    /** Patch position matrix for simple terrain patches */
    uPatchPos: { value: THREE.Matrix4 };

    /** Depth packing value for depth buffer encoding */
    depth_packing_value: { value: number };

    /** Transform matrix for overlay imagery UV coordinates */
    overlayerImageryTransform: { value: THREE.Matrix3 };
    /** Overlay imagery texture */
    overlayerImagery: { value: THREE.Texture };

    /**
     * Transform parameters for UV coordinate mapping
     * @private
     */
    imageryPatchTransform: { value: THREE.Vector4[] };
    /**
     * Array of image textures for patch mapping
     * @private
     */
    imageryPatchArray: { value: THREE.Texture[] };

    /** Number of imagery patches */
    imageryPatchCount: { value: number };

    uProjectionFactor: { value: number };
    /** The skirt height for the mesh */
    uSkirtHeight: { value: number };
}

/**
 * Cache for compiled GLSL shaders to avoid recompilation
 */
const glslCache: Record<string, string> = {};

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
export class DEMTileMeshMaterial extends THREE.MeshStandardMaterial {
    /** Flag indicating if the material allows overrides */
    public m_allowOverride: boolean = false;

    /** Common uniforms used by the material's shaders */
    public m_commonUniform: CommonUniforms = {
        uHeighMapTexture: {
            value: emptyTexture
        },
        pack: {
            value: new THREE.Matrix4()
        },
        uPatchPos: {
            value: new THREE.Matrix4()
        },

        depth_packing_value: {
            value: 0
        },

        overlayerImageryTransform: { value: new THREE.Matrix3() },
        overlayerImagery: { value: new THREE.Texture() },

        imageryPatchTransform: { value: new Array(5).fill(new THREE.Vector4()) },
        imageryPatchArray: { value: new Array(5).fill(new THREE.Texture()) },
        imageryPatchCount: { value: 0 },
        uSkirtHeight: { value: 0.0 },
        uProjectionFactor: { value: 0.0 },
    };

    /** Shader defines that control compilation variants */
    public m_defines: Record<string, any> = {};

    /**
     * Creates a new DEM tile mesh material
     *
     * @param parameters - Optional material parameters to initialize with
     */
    constructor(parameters?: THREE.MeshStandardMaterialParameters) {
        super(parameters);
    }

    /**
     * Callback executed before shader compilation
     *
     * This method modifies the standard Three.js shaders to include terrain-specific
     * functionality by replacing shader chunks and adding custom uniforms and defines.
     *
     * @param shader - The shader parameters to modify
     */
    public onBeforeCompile = (shader: THREE.WebGLProgramParametersWithUniforms) => {
        // Use cached shaders if available
        if (glslCache["vertexShader"]) {
            shader.vertexShader = glslCache["vertexShader"];
        }

        if (glslCache["fragmentShader"]) {
            shader.fragmentShader = glslCache["fragmentShader"];
        }

        // Compile and cache shaders if not already cached
        if (!glslCache["vertexShader"] || !glslCache["fragmentShader"]) {
            // Add terrain normal computation
            shader.vertexShader = shader.vertexShader.replace(
                `#include <beginnormal_vertex>`,
                `#include <beginnormal_vertex>
             #include <beginnormal_terrain_vertex>`
            );

            // Add terrain vertex displacement
            shader.vertexShader = shader.vertexShader.replace(
                `#include <begin_vertex>`,
                `#include <begin_vertex>
             #include <terrain_simple_vert>`
            );

            // Add terrain color processing in fragment shader
            shader.fragmentShader = shader.fragmentShader.replace(
                `#include <color_pars_fragment>`,
                `#include <color_pars_fragment>
            #include <terrain_common>
             #include <dem_color_pars_fragment>`
            );

            shader.fragmentShader = shader.fragmentShader.replace(
                `#include <color_fragment>`,
                `#include <color_fragment>
             #include <dem_color_fragment>`
            );

            // Add depth packing functionality
            shader.vertexShader = shader.vertexShader.replace(
                `#include <common>`,
                `#include <common>
             #include <depth_packing_pars_vertex>`
            );
            shader.vertexShader = shader.vertexShader.replace(
                `#include <fog_vertex>`,
                `#include <fog_vertex>
             #include <depth_packing_vertex>`
            );
            shader.fragmentShader = shader.fragmentShader.replace(
                `#include <packing>`,
                `#include <packing>
             #include <depth_packing_pars_fragment>`
            );
            shader.fragmentShader = shader.fragmentShader.replace(
                `#include <dithering_fragment>`,
                `#include <dithering_fragment>
             #include <depth_packing_fragment>`
            );

            // Add terrain projection
            shader.vertexShader = shader.vertexShader.replace(
                `#include <project_vertex>`,
                `#include <terrain_proj>`
            );

            // Add terrain common parameters and functions
            shader.vertexShader = shader.vertexShader.replace(
                `#include <uv_pars_vertex>`,
                `#include <uv_pars_vertex>
                #include <terrain_common_pars>
                #include <terrain_common>
                #include <terrain_pars_vert>`
            );

            // Cache the compiled shaders
            glslCache["vertexShader"] = shader.vertexShader;
            glslCache["fragmentShader"] = shader.fragmentShader;
        }

        // Initialize shader defines if not present
        if (!shader.defines) {
            shader.defines = {};
        }
        shader.defines["USE_UV"] = false;

        // Handle Three.js version specific defines
        const threeVersion = parseInt(THREE.REVISION);
        if (!isNaN(threeVersion) && threeVersion >= 151) {
            shader.defines["USE_GT_151"] = true;
            shader.defines["USE_UV"] = true;
        }

        // Assign uniforms and defines to the shader
        Object.assign(shader.uniforms, this.m_commonUniform);
        Object.assign(shader.defines, this.m_defines);
    };

    /**
     * Copies properties from another DEM tile mesh material
     *
     * @param source - The source material to copy from
     * @returns This material for chaining
     */
    public copy(source: DEMTileMeshMaterial): this {
        super.copy(source);
        this.m_commonUniform = { ...source.m_commonUniform };
        this.m_allowOverride = source.m_allowOverride;
        this.m_defines = { ...source.m_defines };
        return this;
    }

    /**
     * Sets the image UV transform parameters for imagery patches
     * Used for proper texture mapping and alignment of multiple imagery sources
     */
    public set imageryPatchs(
        value: Array<{
            transform: THREE.Vector4;
            texture: THREE.Texture;
        }>
    ) {
        value.forEach((item, index) => {
            this.m_commonUniform.imageryPatchArray.value[index] = item.texture;
            this.m_commonUniform.imageryPatchTransform.value[index] = item.transform;
        });
        this.m_commonUniform.imageryPatchCount.value = value.length;
    }


    get commonUniform() {
        return this.m_commonUniform;
    }

    /**
     * Sets up the overlay texture for this material
     *
     * This method configures an overlay texture that will be rendered on top
     * of the base terrain imagery, with appropriate UV transformation.
     *
     * @param overlayer - Optional overlay configuration with transform and texture
     */
    public setupOverlayerTexture(overlayer?: {
        transform: THREE.Vector4;
        texture: THREE.Texture;
    }): void {
        // let USE_OVERLAYER = this.m_defines.USE_OVERLAYER;
        if (overlayer) {
            this.m_commonUniform.overlayerImagery.value = overlayer.texture;
            this.m_commonUniform.overlayerImageryTransform.value.setUvTransform(
                overlayer.transform.z,
                overlayer.transform.w,
                overlayer.transform.x,
                overlayer.transform.y,
                0,
                0,
                0
            );
            // this.m_defines.USE_OVERLAYER = true;
        } else {
            this.m_commonUniform.overlayerImagery.value = null;
            this.m_commonUniform.overlayerImageryTransform.value = null;
            // this.m_defines.USE_OVERLAYER = false;
        }

        // this.needsUpdate = USE_OVERLAYER == this.m_defines.USE_OVERLAYER;
    }

    /**
     * Sets the projection uniforms for terrain projection switching animation
     *
     * @param currentProjectionType - Current geometry projection type
     * @param targetProjectionType - Target projection type
     * @param projectionFactor - Interpolation factor between 0.0 and 1.0
     */
    public setProjectionUniforms(
        projectionFactor: number
    ): void {
        this.m_commonUniform.uProjectionFactor.value = projectionFactor;
    }
}
