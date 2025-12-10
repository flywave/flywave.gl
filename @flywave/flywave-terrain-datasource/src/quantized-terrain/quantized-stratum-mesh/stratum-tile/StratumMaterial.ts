/* Copyright (C) 2025 flywave.gl contributors */

import { type IVisualBatchMaterialParams, VisualBatchMaterial } from "@flywave/flywave-materials";
import * as THREE from "three";

import { FaceTypes } from "../decoder";

/** Maximum number of texture patches supported by the material */
const MAX_TEXTURE_PATCHES = 4;

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
class StratumMaterial extends VisualBatchMaterial {
    /**
     * Material uniforms including terrain-specific parameters
     * @property {THREE.IUniform<number>} faceVisible - Bitmask for visible face types
     * @property {THREE.IUniform<THREE.Vector4[]>} imageryPatchTransform - UV transforms for each texture
     * @property {THREE.IUniform<THREE.Texture[]>} imageryPatchArray - Texture array for terrain imagery
     * @property {THREE.IUniform<number>} imageryPatchCount - Number of active texture patches
     * @property {THREE.IUniform<THREE.Vector4>} clipPatchTransform - UV transform for clip patch
     */
    declare uniforms: {
        faceVisible: THREE.IUniform<number>;
        imageryPatchTransform: THREE.IUniform<THREE.Vector4[]>;
        imageryPatchArray: THREE.IUniform<THREE.Texture[]>;
        imageryPatchCount: THREE.IUniform<number>;
        clipPatchTransform: THREE.IUniform<THREE.Vector4>;
        
        // Projection switching uniforms
        uCurrentGeometryProjectionType: THREE.IUniform<number>;
        uTargetProjectionType: THREE.IUniform<number>;
        uProjectionFactor: THREE.IUniform<number>;
        uEarthRadius: THREE.IUniform<number>;
    } & VisualBatchMaterial["uniforms"];

    /**
     * Creates a new StratumMaterial instance
     * @param {IStratumMaterialParams} [params={}] - Material configuration parameters
     */
    constructor(params: IStratumMaterialParams = {}) {
        super({
            ...params,
            idAttributeName: params.idAttributeName ?? "materialId"
        });

        // Initialize terrain-specific uniforms
        this.uniforms = THREE.UniformsUtils.merge([
            this.uniforms,
            this._getCustomUniforms()
        ]) as typeof this.uniforms;

        // Set default transforms if textures are provided without transforms
        if (params.imageryTextures && !params.imageryTransforms) {
            params.imageryTransforms = params.imageryTextures.map(
                () => new THREE.Vector4(1, 1, 0, 0)
            );
        }

        // Configure textures if provided
        if (params.imageryTextures && params.imageryTransforms) {
            this.setImageryTextures(params.imageryTextures, params.imageryTransforms);
        }
    }

    public setupOverlayerTexture(overlayer?: {
        transform: THREE.Vector4;
        texture: THREE.Texture;
    }): void {
        const USE_OVERLAYER = this.defines.USE_OVERLAYER;
        if (overlayer) {
            this.uniforms.overlayerImagery.value = overlayer.texture;
            this.uniforms.overlayerImageryTransform.value = overlayer.transform;
            this.defines.USE_OVERLAYER = true;
        } else {
            this.uniforms.overlayerImagery.value = null;
            this.uniforms.overlayerImageryTransform.value = null;
            this.defines.USE_OVERLAYER = false;
        }

        this.needsUpdate = USE_OVERLAYER == this.defines.USE_OVERLAYER;
    }

    /**
     * Sets the face visibility bitmask
     * @param {number} value - Bitmask representing visible face types
     */
    set faceVisible(value: number) {
        this.uniforms.faceVisible.value = value;
    }

    /**
     * Gets the current face visibility bitmask
     * @returns {number} Current face visibility bitmask
     */
    get faceVisible(): number {
        return this.uniforms.faceVisible.value;
    }

    /**
     * Configures imagery textures and their UV transforms
     * @param {THREE.Texture[]} textures - Array of textures to apply
     * @param {THREE.Vector4[]} transforms - Corresponding UV transforms for each texture
     * @throws {Error} If textures and transforms arrays don't match in length
     * @throws {Error} If exceeding maximum texture count
     */
    private setImageryTextures(textures: THREE.Texture[], transforms: THREE.Vector4[]): void {
        if (textures.length !== transforms.length) {
            throw new Error("Texture and transform arrays must have equal length");
        }
        if (textures.length > MAX_TEXTURE_PATCHES) {
            throw new Error(`Maximum ${MAX_TEXTURE_PATCHES} textures supported`);
        }

        // Update texture-related uniforms
        this.uniforms.imageryPatchCount.value = textures.length;
        for (let i = 0; i < textures.length; i++) {
            this.uniforms.imageryPatchArray.value[i] = textures[i];
            this.uniforms.imageryPatchTransform.value[i] = transforms[i];
        }
    }

    /**
     * Sets the image UV transform parameters
     * Used for proper texture mapping and alignment
     */
    public set imageryPatchs(
        value: Array<{
            transform: THREE.Vector4;
            texture: THREE.Texture;
        }>
    ) {
        value.forEach((item, index) => {
            this.uniforms.imageryPatchArray.value[index] = item.texture;
            this.uniforms.imageryPatchTransform.value[index] = item.transform;
        });
        this.uniforms.imageryPatchCount.value = value.length;
    }

    public set clipPatch(transform: THREE.Vector4) {
        this.uniforms.clipPatchTransform.value.copy(transform);
    }

    /**
     * Cleans up material resources
     */
    dispose(): void {
        super.dispose();

        // Dispose all texture resources
        this.uniforms.imageryPatchArray.value.forEach(texture => {
            if (texture) {
                texture.dispose();
            }
        });
    }

    // --- Protected Methods ---

    /**
     * Gets custom uniforms for terrain rendering
     * @returns {Object} Custom uniform definitions
     * @protected
     */
    protected _getCustomUniforms() {
        return {
            faceVisible: { value: 0 },
            imageryPatchTransform: {
                value: new Array(MAX_TEXTURE_PATCHES).fill(new THREE.Vector4())
            },
            imageryPatchArray: {
                value: new Array(MAX_TEXTURE_PATCHES).fill(null)
            },
            imageryPatchCount: { value: 0 },

            clipPatchTransform: { value: new THREE.Vector4() },

            overlayerImageryTransform: { value: new THREE.Vector4() },
            overlayerImagery: { value: null },
            
            // Projection switching uniforms
            uCurrentGeometryProjectionType: { value: 0 },
            uTargetProjectionType: { value: 0 },
            uProjectionFactor: { value: 0.0 },
            uEarthRadius: { value: 6378137.0 }
        };
    }
    
    /**
     * Sets the projection uniforms for terrain projection switching animation
     *
     * @param currentProjectionType - Current geometry projection type
     * @param targetProjectionType - Target projection type
     * @param projectionFactor - Interpolation factor between 0.0 and 1.0
     */
    public setProjectionUniforms(
        currentProjectionType: number,
        targetProjectionType: number,
        projectionFactor: number
    ): void {
        this.uniforms.uCurrentGeometryProjectionType.value = currentProjectionType;
        this.uniforms.uTargetProjectionType.value = targetProjectionType;
        this.uniforms.uProjectionFactor.value = projectionFactor;
    }

    /**
     * Gets custom vertex shader chunks
     * @returns {string} GLSL code to inject in vertex shader
     * @protected
     */
    protected _getCustomVertexShaderChunks(): string {
        return `
            // Face type attribute passed to fragment shader
            attribute float faceType;
            varying float vFaceType;
            attribute float voxelIndex;
            varying float vvoxelIndex;
            
            // Projection switching uniforms
            uniform int uCurrentGeometryProjectionType;  // 0 = Planar, 1 = Spherical
            uniform int uTargetProjectionType;          // 0 = Planar, 1 = Spherical  
            uniform float uProjectionFactor;            // 0.0-1.0 插值因子
            uniform float uEarthRadius;                 // 地球半径 6378137.0

            // 从 Web Mercator 到球面坐标
            vec3 webMercatorToSphere(vec3 planarPos) {
                float mx = planarPos.x / uEarthRadius - 3.141592653589793;
                float my = planarPos.y / uEarthRadius - 3.141592653589793;
                float w = exp(my);
                float d = w * w;
                float gx = (2.0 * w) / (d + 1.0);
                float gy = (d - 1.0) / (d + 1.0);
                float scale = uEarthRadius + planarPos.z;
                
                vec3 spherePos;
                spherePos.x = cos(mx) * gx * scale;
                spherePos.y = sin(mx) * gx * scale;
                spherePos.z = gy * scale;
                
                return spherePos;
            }
            
            // 从球面到 Web Mercator 坐标
            vec3 sphereToWebMercator(vec3 spherePos) {
                // 将球面坐标转换为经纬度
                float lat = asin(spherePos.z / uEarthRadius);
                float lon = atan(spherePos.y, spherePos.x);
                
                // 转换为 Web Mercator 坐标
                float x = (lon / 3.141592653589793 + 1.0) * 0.5 * uEarthRadius;
                float y = (log(tan(3.141592653589793 * 0.25 + lat * 0.5)) / 3.141592653589793 + 1.0) * 0.5 * uEarthRadius;
                float z = spherePos.z;
                
                return vec3(x, y, z);
            }

            // 投影重投影和插值
            vec3 reprojectAndInterpolate(vec3 currentPos) {
                // 如果投影类型相同，无需变换
                if (uCurrentGeometryProjectionType == uTargetProjectionType) {
                    return currentPos;
                }
                
                // 投影类型不同，需要变换
                vec3 transformedPos = currentPos;
                
                // 从球面到平面
                if (uCurrentGeometryProjectionType == 1 && uTargetProjectionType == 0) {
                    transformedPos = sphereToWebMercator(currentPos);
                }
                // 从平面到球面
                else if (uCurrentGeometryProjectionType == 0 && uTargetProjectionType == 1) {
                    transformedPos = webMercatorToSphere(currentPos);
                }
                
                // 插值混合
                return mix(currentPos, transformedPos, uProjectionFactor);
            }
        `;
    }

    /**
     * Gets custom fragment shader chunks
     * @returns {string} GLSL code to inject in fragment shader
     * @protected
     */
    protected _getCustomFragmentShaderChunks(): string {
        return `
            // Face visibility and texture mapping uniforms
            uniform int faceVisible;
            varying float vFaceType;
            varying float vvoxelIndex;
             
            uniform vec4 clipPatchTransform;
            
            uniform int imageryPatchCount;
            uniform vec4 imageryPatchTransform[${MAX_TEXTURE_PATCHES}];
            uniform sampler2D imageryPatchArray[${MAX_TEXTURE_PATCHES}];
            

            #ifndef USE_OVERLAYER_MAP
            uniform sampler2D overlayerImagery;
            uniform vec4 overlayerImageryTransform;
            #endif
            /**
             * Samples all active textures with UV transforms
             * @returns {vec4} Combined texture color
             */
            vec4 getTextureColor() {
                vec4 color = vec4(1.0);
                
                // Only apply textures to top faces
                if (int(vFaceType) == ${FaceTypes.TopGroundFace}) {
                    for (int i = 0; i < ${MAX_TEXTURE_PATCHES}; i++) {
                        if (i >= imageryPatchCount) break;
                        
                        // Apply UV transformation
                        vec2 transformedUv = vec2(
                            vUv.x * imageryPatchTransform[i].x + imageryPatchTransform[i].z,
                            vUv.y * imageryPatchTransform[i].y + imageryPatchTransform[i].w
                        );
                        
                        // Only sample if within UV bounds
                        if (all(greaterThanEqual(transformedUv, vec2(0.0))) && 
                            all(lessThanEqual(transformedUv, vec2(1.0)))) {
                            
                            // Manual texture array lookup (WebGL 1.0 compatible)
                            if (i == 0) color = texture2D(imageryPatchArray[0], transformedUv);
                            else if (i == 1) color = texture2D(imageryPatchArray[1], transformedUv);
                            else if (i == 2) color = texture2D(imageryPatchArray[2], transformedUv);
                            else if (i == 3) color = texture2D(imageryPatchArray[3], transformedUv);
                        }
                    }
                }
                
                #ifndef USE_OVERLAYER_MAP
                    vec2 overLayertransformedUv = vec2(
                        vUv.x * overlayerImageryTransform.x + overlayerImageryTransform.z,
                        vUv.y * overlayerImageryTransform.y + overlayerImageryTransform.w
                    ); 
                    if (overLayertransformedUv.x >= 0.0 && overLayertransformedUv.x <= 1.0 && 
                        overLayertransformedUv.y >= 0.0 && overLayertransformedUv.y <= 1.0) {
                        vec4 overLayerColor = texture2D(overlayerImagery, overLayertransformedUv);
                        if(overLayerColor.a > 0.0){
                            color = mix(color, overLayerColor, overLayerColor.a);
                        }
                    }
                #endif
                return color;
            }
        `;
    }

    /**
     * Gets vertex shader replacement code
     * @returns {string} GLSL code to replace in vertex shader
     * @protected
     */
    protected _getVertexShaderReplacement(): string {
        return `
            #include <begin_vertex>
            
            // Process visual interpolation
            float visualId = ${this._idAttributeName};
            v${this._idAttributeName} = visualId;
            vVisualValue = getVisualValue(visualId);
            VisualStyle style = unpackStyle(visualId);
            
            // Apply position offset based on style
            transformed += mix(style.startOffset, style.endOffset, vVisualValue);

            // 投影变换和插值
            transformed = reprojectAndInterpolate(transformed);

            // Pass face type to fragment shader
            vFaceType = faceType;
            vvoxelIndex = voxelIndex;
        `;
    }

    /**
     * Gets fragment shader replacement code
     * @returns {string} GLSL code to replace in fragment shader
     * @protected
     */
    protected _getFragmentShaderReplacement(): string {
        return `
            // Face visibility culling
            // if (faceVisible!=0 && (int(faceVisible) & (1 << int(vFaceType))) == 0) {
            //     discard;
            // }

            //   vec2 clipPatchTransformUv = vec2(
            //             vUv.x * clipPatchTransform.x + clipPatchTransform.z,
            //             vUv.y * clipPatchTransform.y + clipPatchTransform.w
            //         ); 
            // if (clipPatchTransformUv.x < 0.0 || clipPatchTransformUv.x > 1.0 || 
            //     clipPatchTransformUv.y < 0.0 || clipPatchTransformUv.y > 1.0) {
            //     discard;
            // }
            
            // Sample texture color (only applies to top faces)
            vec4 texColor = getTextureColor();
            
            #ifdef USE_VISUAL_BATCH
                // Apply style interpolation
                float visualId = v${this._idAttributeName};
                VisualStyle style = unpackStyle(visualId);
                
                diffuseColor.rgb *= style.startColor;
                diffuseColor.a *= mix(style.startOpacity, style.endOpacity, vVisualValue);
                
            #endif
            
            // Blend texture with base color
             if (int(vFaceType) != ${FaceTypes.TopGroundFace}) {
                diffuseColor = mix(texColor, diffuseColor, 0.5);
             }else{
             diffuseColor = texColor;
            } 
            #include <color_fragment>
        `;
    }
}

export { StratumMaterial, type IStratumMaterialParams };
