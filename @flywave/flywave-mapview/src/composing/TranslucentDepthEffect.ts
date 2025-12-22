/* Copyright (C) 2025 flywave.gl contributors */

import { ITranslucentLayerConfig } from "@flywave/flywave-datasource-protocol";
import { type BlendFunction, Effect, EffectAttribute, Selection } from "postprocessing";
import {
    type Camera,
    type Scene,
    type WebGLRenderer,
    Color,
    DepthTexture,
    LinearFilter,
    RGBAFormat,
    Uniform,
    UnsignedShortType,
    WebGLRenderTarget,
    DataTexture,
    FloatType,
    NoBlending,
    ShaderMaterial,
    Object3D
} from "three";

/**
 * Configuration options for the translucent layer effect.
 * Note: Best results are achieved when using logarithmic depth buffers for depth buffering.
 */
export interface LayerHighlightEffectOptions {
    /** Blend function to use for the effect. */
    blendFunction?: BlendFunction;
    /** Base layer for the effect. */
    baseLayer?: number;
}

/**
 * Stores the original material state for restoration.
 */
interface MaterialState {
    depthTest: boolean;
    depthWrite: boolean;
    colorWrite: boolean;
    transparent: boolean;
}

/**
 * Internal layer configuration with parsed values.
 */
interface InternalLayerConfig extends ITranslucentLayerConfig {
    parsedColor?: Color;
}

/**
 * Effect class for rendering translucent layers with depth-based occlusion.
 * This effect allows objects to be rendered with translucency while properly handling
 * depth-based occlusion with other scene objects.
 * Note: Best results are achieved when using logarithmic depth buffers for depth buffering.
 */
export class TranslucentLayerEffect extends Effect {
    // ================ Private Properties ================

    /** Selection of normal mode objects. */
    private readonly normalSelection: Selection;

    /** Selection of background mode objects. */
    private readonly backgroundSelection: Selection;

    /** Render target for normal mode layer ID rendering. */
    private readonly normalTargetRenderTarget: WebGLRenderTarget;

    /** Render target for background mode layer ID rendering. */
    private readonly backgroundTargetRenderTarget: WebGLRenderTarget;

    /** Render target for normal mode color buffer. */
    private readonly normalColorRenderTarget: WebGLRenderTarget;

    /** Render target for background mode color buffer. */
    private readonly backgroundColorRenderTarget: WebGLRenderTarget;

    /** Texture storing normal layer configuration data. */
    private normalLayerDataTexture: DataTexture;

    /** Texture storing background layer configuration data. */
    private backgroundLayerDataTexture: DataTexture;

    /** Material used for rendering layer IDs. */
    private readonly layerIDMaterial: ShaderMaterial;

    /** Map of layer configurations by layer ID. */
    private readonly layers: Map<string, InternalLayerConfig> = new Map();

    /** Map of normal layer indices by layer ID. */
    private readonly normalLayerIndices: Map<string, number> = new Map();

    /** Map of background layer indices by layer ID. */
    private readonly backgroundLayerIndices: Map<string, number> = new Map();

    /** Index counter for assigning new normal layer indices. */
    private nextNormalLayerIndex: number = 0;

    /** Index counter for assigning new background layer indices. */
    private nextBackgroundLayerIndex: number = 0;

    /** Maximum number of layers per row in the layer data texture. */
    private layersPerRow: number = 128;

    /** Flag to prevent unnecessary texture updates. */
    private needsLayerTextureUpdate: boolean = false;

    /** Number of pixels occupied by each layer in the data texture. */
    private static readonly PIXELS_PER_LAYER: number = 2;

    /** Default layer color. */
    private static readonly DEFAULT_LAYER_COLOR: Color = new Color(1, 0.5, 0.2);

    /** Blend mode to float mapping. */
    private static readonly BLEND_MODE_MAP: Record<string, number> = {
        'mix': 0.0,
        'add': 1.0,
        'multiply': 2.0,
        'screen': 3.0
    };

    // ================ Constructor ================

    /**
     * Creates a new translucent layer effect.
     * @param scene - The Three.js scene to apply the effect to.
     * @param camera - The camera used for rendering.
     * @param options - Configuration options for the effect.
     */
    constructor(
        private readonly scene: Scene,
        private readonly camera: Camera,
        options: LayerHighlightEffectOptions = {}
    ) {
        super("TranslucentLayerEffect", TranslucentLayerEffect.getFragmentShaderSource(), {
            attributes: EffectAttribute.DEPTH,
            uniforms: new Map([
                ["tNormalLayerID", new Uniform(null)],
                ["tBackgroundLayerID", new Uniform(null)],
                ["tNormalLayerColor", new Uniform(null)],
                ["tBackgroundLayerColor", new Uniform(null)],
                ["tNormalLayerDepth", new Uniform(null)],
                ["tBackgroundLayerDepth", new Uniform(null)],
                ["tNormalLayerData", new Uniform(null)],
                ["tBackgroundLayerData", new Uniform(null)],
                ["normalLayerCount", new Uniform(0)],
                ["backgroundLayerCount", new Uniform(0)],
                ["layersPerRow", new Uniform(128.0)],
                ["cameraNear", new Uniform(0.1)],
                ["cameraFar", new Uniform(1000.0)],
                ["inactiveLayerColor", new Uniform(new Color(0, 0, 0))]
            ])
        });

        // 创建两个Selection，使用不同的render layer
        this.normalSelection = new Selection([], 10); // 使用层10
        this.backgroundSelection = new Selection([], 11); // 使用层11

        // 设置Selection为非独占模式，这样对象可以同时存在于多个Selection
        this.normalSelection.exclusive = false;
        this.backgroundSelection.exclusive = false;

        this.normalTargetRenderTarget = new WebGLRenderTarget(1, 1, {
            minFilter: LinearFilter,
            magFilter: LinearFilter,
            format: RGBAFormat,
        });

        this.backgroundTargetRenderTarget = new WebGLRenderTarget(1, 1, {
            minFilter: LinearFilter,
            magFilter: LinearFilter,
            format: RGBAFormat,
        });

        this.normalColorRenderTarget = new WebGLRenderTarget(1, 1, {
            minFilter: LinearFilter,
            magFilter: LinearFilter,
            format: RGBAFormat,
            depthTexture: new DepthTexture(1, 1, UnsignedShortType)
        });
        this.backgroundColorRenderTarget = new WebGLRenderTarget(1, 1, {
            minFilter: LinearFilter,
            magFilter: LinearFilter,
            format: RGBAFormat,
            depthTexture: new DepthTexture(1, 1, UnsignedShortType)
        });

        // Create layer data textures for both modes
        this.normalLayerDataTexture = this.createLayerDataTexture();
        this.backgroundLayerDataTexture = this.createLayerDataTexture();

        this.uniforms.get("tNormalLayerData")!.value = this.normalLayerDataTexture;
        this.uniforms.get("tBackgroundLayerData")!.value = this.backgroundLayerDataTexture;

        // Create layer ID material
        this.layerIDMaterial = this.createLayerIDMaterial();

        // Set camera parameters
        this.updateCameraParams();
    }

    // ================ Private Helper Methods ================

    /**
     * Creates a material for rendering layer IDs.
     * @returns A shader material configured for layer ID rendering.
     */
    private createLayerIDMaterial(): ShaderMaterial {
        const customMaterial = new ShaderMaterial({
            uniforms: {
                layerIndex: { value: -1.0 }
            },
            vertexShader: `
                uniform float layerIndex;
                varying vec3 vColor;
                void main() {
                    #include <begin_vertex>
                    if (layerIndex < 0.0) {
                        vColor = vec3(0.0, 0.0, 0.0);
                    } else {
                        vColor = vec3((layerIndex + 1.0) / 256.0, 0.0, 0.0);
                    }
                    #include <project_vertex>
                }
            `,
            fragmentShader: `
                varying vec3 vColor;
                void main() {
                    gl_FragColor = vec4(vColor, 1.0);
                }
            `,
            depthTest: true,
            depthWrite: true
        });

        customMaterial.onBeforeRender = (renderer, scene, camera, geometry, object) => {
            const layerIndex = object.userData.__layerIndex;
            customMaterial.uniforms.layerIndex.value = layerIndex !== undefined ? layerIndex : -1;
            customMaterial.uniformsNeedUpdate = true;
        };

        return customMaterial;
    }

    /**
     * Creates a data texture for storing layer configuration information.
     * @returns A data texture configured for layer data storage.
     */
    private createLayerDataTexture(): DataTexture {
        // Each layer occupies 2 pixels (8 floating point values)
        const pixelsPerLayer = TranslucentLayerEffect.PIXELS_PER_LAYER;
        const textureWidth = this.layersPerRow * pixelsPerLayer;
        const textureHeight = 1; // All layers in a single row

        // Calculate total pixel count
        const pixelCount = textureWidth * textureHeight;
        const layerDataArray = new Float32Array(pixelCount * 4);

        const texture = new DataTexture(
            layerDataArray,
            textureWidth,
            textureHeight,
            RGBAFormat,
            FloatType
        );

        texture.minFilter = LinearFilter;
        texture.magFilter = LinearFilter;
        texture.needsUpdate = true;

        // Update uniform
        this.uniforms.get("layersPerRow")!.value = this.layersPerRow;

        return texture;
    }

    /**
     * Resizes a layer data texture when capacity is exceeded.
     */
    private resizeLayerTexture(layerDataTexture: DataTexture, currentLayers: number): DataTexture {
        // Double the capacity each time
        this.layersPerRow *= 2;

        const newTexture = this.createLayerDataTexture();
        const oldArray = layerDataTexture.image.data as Float32Array;
        const newArray = newTexture.image.data as Float32Array;

        // Copy old data (maintaining the same pixel layout)
        const pixelsPerLayer = TranslucentLayerEffect.PIXELS_PER_LAYER;

        // Rearrange data into the new texture
        for (let layerIdx = 0; layerIdx < currentLayers; layerIdx++) {
            const oldPixelOffset = layerIdx * pixelsPerLayer * 4;
            const newPixelOffset = layerIdx * pixelsPerLayer * 4;

            // Copy first pixel
            for (let i = 0; i < 4; i++) {
                newArray[newPixelOffset + i] = oldArray[oldPixelOffset + i];
            }

            // Copy second pixel
            for (let i = 0; i < 4; i++) {
                newArray[newPixelOffset + 4 + i] = oldArray[oldPixelOffset + 4 + i];
            }
        }

        // Replace texture
        layerDataTexture.dispose();
        return newTexture;
    }

    /**
     * Updates camera parameters in the shader uniforms.
     */
    private updateCameraParams(): void {
        if (this.camera && (this.camera as any).near && (this.camera as any).far) {
            this.uniforms.get("cameraNear")!.value = (this.camera as any).near;
            this.uniforms.get("cameraFar")!.value = (this.camera as any).far;
        }
    }

    /**
     * Gets the fragment shader source code.
     */
    private static getFragmentShaderSource(): string {
        return `
            uniform sampler2D tNormalLayerID;
            uniform sampler2D tBackgroundLayerID;
            uniform sampler2D tNormalLayerColor;
            uniform sampler2D tBackgroundLayerColor;
            uniform sampler2D tNormalLayerDepth;
            uniform sampler2D tBackgroundLayerDepth;
            uniform sampler2D tNormalLayerData;
            uniform sampler2D tBackgroundLayerData;
            uniform float normalLayerCount;
            uniform float backgroundLayerCount;
            uniform float layersPerRow;
            uniform float cameraNear;
            uniform float cameraFar;
            uniform vec3 inactiveLayerColor;

            // Layer data structure
            struct LayerData {
                float mixFactor;
                float blendMode;
                vec3 color;
                float occlusionDistance;
                bool useObjectColor;
                float objectColorMix;
            };

            float linearizeDepth(float depth, float near, float far) {
                #ifdef USE_LOGDEPTHBUF
                    float logDepth = exp2(depth * log2(far + 1.0)) - 1.0;
                    return logDepth;
                #else
                    return (2.0 * near) / (far + near - depth * (far - near));
                #endif
            }

            float getLinearDistance(float depthValue) {
                return linearizeDepth(depthValue, cameraNear, cameraFar);
            }

            // Blend functions
            vec3 blendMix(vec3 base, vec3 blend, float opacity) {
                return mix(base, blend, opacity);
            }

            vec3 blendAdd(vec3 base, vec3 blend, float opacity) {
                return base + blend * opacity;
            }

            vec3 blendMultiply(vec3 base, vec3 blend, float opacity) {
                return mix(base, base * blend, opacity);
            }

            vec3 blendScreen(vec3 base, vec3 blend, float opacity) {
                return mix(base, 1.0 - (1.0 - base) * (1.0 - blend), opacity);
            }

            // Check if a pixel is inactive (no layer assigned)
            bool isInactivePixel(vec4 layerID) {
                // 检查是否为特殊颜色(0,0,0)标记的空区域
                return length(layerID.rgb - inactiveLayerColor) < 0.001;
            }

            // Get layer configuration from layer data texture
            LayerData getLayerData(sampler2D layerDataTexture, int layerIndex) {
                LayerData data;
                
                // Each layer occupies 2 pixels
                float pixelsPerLayer = 2.0;
                float textureWidth = layersPerRow * pixelsPerLayer;
                
                // Calculate texture coordinates
                float u0 = (float(layerIndex) * pixelsPerLayer + 0.5) / textureWidth;
                float u1 = (float(layerIndex) * pixelsPerLayer + 1.5) / textureWidth;
                
                // First pixel: basic configuration
                vec4 pixel0 = texture2D(layerDataTexture, vec2(u0, 0.5));
                data.mixFactor = pixel0.r;
                data.blendMode = pixel0.g;
                data.color = vec3(pixel0.b, pixel0.a, 0.0);
                
                // Second pixel: additional configuration
                vec4 pixel1 = texture2D(layerDataTexture, vec2(u1, 0.5));
                data.color.b = pixel1.r;
                data.occlusionDistance = pixel1.g;
                
                // Unpack useObjectColor and objectColorMix
                float packedValue = pixel1.a;
                data.useObjectColor = (packedValue >= 1.0);
                data.objectColorMix = (packedValue - floor(packedValue)) * 10000.0;
                
                return data;
            }

            // 应用混合效果的核心函数
            vec4 applyTranslucentEffect(vec4 inputColor, vec4 objectColor, float layerDepth, 
                                    LayerData layer, float currentDepth, sampler2D layerDataTexture) {
                // Read object's original color and blend
                vec3 finalHighlightColor = objectColor.rgb;
                
                if (layer.useObjectColor && layer.objectColorMix > 0.0) {
                    finalHighlightColor = mix(layer.color, objectColor.rgb, layer.objectColorMix);
                }
                
                // 深度比较逻辑
                bool isLayerInFront = (layerDepth - currentDepth) < 0.00001;
                bool isBackground = currentDepth >= 0.999;
                
                float actualLayerDepth = getLinearDistance(layerDepth);
                float actualCurrentDepth = getLinearDistance(currentDepth);
                float depthDifference = abs(actualCurrentDepth - actualLayerDepth);

                // 遮挡判断逻辑
                if(depthDifference > layer.occlusionDistance && !isLayerInFront) {
                    return vec4(vec3(0.0), 0.0);
                }
                
                // Original logic: if layer is in front or is background, don't show effect
                if (isLayerInFront || isBackground) {
                    return vec4(vec3(0.0), 0.0);
                } else { 
                    // Apply translucent effect
                    vec3 resultColor = inputColor.rgb;
                    
                    if (layer.blendMode < 0.5) {
                        resultColor = blendMix(inputColor.rgb, finalHighlightColor, layer.mixFactor);
                    } else if (layer.blendMode < 1.5) {
                        resultColor = blendAdd(inputColor.rgb, finalHighlightColor, layer.mixFactor);
                    } else if (layer.blendMode < 2.5) {
                        resultColor = blendMultiply(inputColor.rgb, finalHighlightColor, layer.mixFactor);
                    } else {
                        resultColor = blendScreen(inputColor.rgb, finalHighlightColor, layer.mixFactor);
                    }
                    
                    return vec4(resultColor, objectColor.a);
                }

            }

            void mainImage(const in vec4 inputColor, const in vec2 uv, const in float depth, out vec4 outputColor) {
                // 读取两种模式的层ID和深度
                vec4 normalLayerID = texture2D(tNormalLayerID, uv);
                vec4 backgroundLayerID = texture2D(tBackgroundLayerID, uv);
                
                float normalLayerDepth = texture2D(tNormalLayerDepth, uv).r;
                float backgroundLayerDepth = texture2D(tBackgroundLayerDepth, uv).r;
                
                vec4 normalObjectColor = texture2D(tNormalLayerColor, uv);
                vec4 backgroundObjectColor = texture2D(tBackgroundLayerColor, uv);
                
                // 检查当前像素属于哪种模式
                bool hasNormalLayer = !isInactivePixel(normalLayerID);
                bool hasBackgroundLayer = !isInactivePixel(backgroundLayerID);
 
                 
                // 情况1：没有层，直接返回原始颜色
                if (!hasNormalLayer && !hasBackgroundLayer) {
                    outputColor = inputColor;
                    return;
                }

                // 情况2：只有正常模式或只有背景模式
                if (hasNormalLayer && !hasBackgroundLayer) {
                    // 解码layerIndex
                    float encodedIndex = normalLayerID.r;
                    int layerIndex = int(encodedIndex * 256.0 - 1.0);
                    
                    // 检查索引是否有效
                    if (layerIndex < 0 || layerIndex >= int(normalLayerCount)) {
                        outputColor = inputColor;
                        return;
                    }
                    
                    // Get layer configuration
                    LayerData layer = getLayerData(tNormalLayerData, layerIndex);
                    
                    // 应用混合效果
                    outputColor = applyTranslucentEffect(inputColor, normalObjectColor, normalLayerDepth, layer, depth, tNormalLayerData);
                    
                    return;
                }

                
                
                if (!hasNormalLayer && hasBackgroundLayer) {
                    // 解码layerIndex
                    float encodedIndex = backgroundLayerID.r;
                    int layerIndex = int(encodedIndex * 256.0 - 1.0);

                    // 检查索引是否有效
                    if (layerIndex < 0 || layerIndex >= int(backgroundLayerCount)) {
                        outputColor = inputColor;
                        return;
                    }
                    
                    // Get layer configuration
                    LayerData layer = getLayerData(tBackgroundLayerData, layerIndex);
                    
                    // 应用混合效果
                    outputColor = applyTranslucentEffect(inputColor, backgroundObjectColor, backgroundLayerDepth, layer, depth, tBackgroundLayerData);
                    return;
                }
                
                // 情况3：同时有正常模式和背景模式（这种情况理论上不应该发生，但这里处理）
                if (hasNormalLayer && hasBackgroundLayer) {
                
                    // 解码两个layerIndex
                    float normalEncodedIndex = normalLayerID.r;
                    int normalLayerIndex = int(normalEncodedIndex * 256.0 - 1.0);
                    
                    float backgroundEncodedIndex = backgroundLayerID.r;
                    int backgroundLayerIndex = int(backgroundEncodedIndex * 256.0 - 1.0);
                    
                    // 检查索引是否有效
                    if (normalLayerIndex < 0 || normalLayerIndex >= int(normalLayerCount) ||
                        backgroundLayerIndex < 0 || backgroundLayerIndex >= int(backgroundLayerCount)) {
                        outputColor = inputColor;
                        return;
                    }
                    
                    // Get layer configurations
                    LayerData normalLayer = getLayerData(tNormalLayerData, normalLayerIndex);
                    LayerData backgroundLayer = getLayerData(tBackgroundLayerData, backgroundLayerIndex);
                    
                    // 情况3a：背景模式在前，正常模式在后
                    if (backgroundLayerDepth < normalLayerDepth) {

                    
                        // 先应用背景模式效果
                        vec4 backgroundResult = applyTranslucentEffect(backgroundObjectColor, backgroundObjectColor, 
                                                                    backgroundLayerDepth, backgroundLayer, depth, tBackgroundLayerData);
                        
                        // 如果背景效果返回的是原始颜色，直接应用正常模式效果
                        if (backgroundResult == inputColor) {
                            outputColor = applyTranslucentEffect(backgroundObjectColor, normalObjectColor, 
                                                            normalLayerDepth, normalLayer, depth, tNormalLayerData);
                        } else {
                            // 在背景效果的基础上应用正常模式效果
                            outputColor = applyTranslucentEffect(backgroundResult, normalObjectColor, 
                                                            normalLayerDepth, normalLayer, depth, tNormalLayerData);
                        }
                    }
                    // 情况3b：正常模式在前，背景模式在后
                    else {
                        // 先应用正常模式效果
                        vec4 normalResult = applyTranslucentEffect(inputColor, normalObjectColor, 
                                                                normalLayerDepth, normalLayer, depth, tNormalLayerData);
                        
                        // 如果正常效果返回的是原始颜色，直接应用背景模式效果
                        if (normalResult == inputColor) {
                            outputColor = applyTranslucentEffect(inputColor, backgroundObjectColor, 
                                                            backgroundLayerDepth, backgroundLayer, depth, tBackgroundLayerData);
                        } else {
                            // 在正常效果的基础上应用背景模式效果
                            outputColor = applyTranslucentEffect(normalResult, backgroundObjectColor, 
                                                            backgroundLayerDepth, backgroundLayer, depth, tBackgroundLayerData);
                        }
                    }
                    return;
                }
                
                // 默认情况：返回原始颜色
                outputColor = inputColor;
            }
        `;
    }


    // ================ Layer Management API ================

    /**
     * Creates a new translucent layer.
     * @param layerId - Unique identifier for the layer.
     * @param config - Configuration options for the layer.
     */
    public createLayer(layerId: string, config: ITranslucentLayerConfig = {}): void {
        if (this.layers.has(layerId)) {
            this.updateLayer(layerId, config);
            return;
        }

        const mode = config.mode || 'normal';
        const defaultColor = TranslucentLayerEffect.DEFAULT_LAYER_COLOR.clone();
        const parsedColor = config.color ? new Color(config.color) : defaultColor;

        this.layers.set(layerId, {
            mixFactor: config.mixFactor !== undefined ? config.mixFactor : 0.3,
            blendMode: config.blendMode || 'mix',
            color: config.color || '#ff802a',
            occlusionDistance: config.occlusionDistance !== undefined ? config.occlusionDistance : 10.0,
            useObjectColor: config.useObjectColor !== undefined ? config.useObjectColor : true,
            objectColorMix: config.objectColorMix !== undefined ? config.objectColorMix : 0.5,
            mode: mode,
            parsedColor
        });

        // Assign index based on mode
        if (mode === 'normal') {
            // Check if resize is needed
            if (this.nextNormalLayerIndex >= this.layersPerRow) {
                this.normalLayerDataTexture = this.resizeLayerTexture(this.normalLayerDataTexture, this.nextNormalLayerIndex);
                this.uniforms.get("tNormalLayerData")!.value = this.normalLayerDataTexture;
            }
            this.normalLayerIndices.set(layerId, this.nextNormalLayerIndex);
            this.nextNormalLayerIndex++;
        } else {
            // Check if resize is needed
            if (this.nextBackgroundLayerIndex >= this.layersPerRow) {
                this.backgroundLayerDataTexture = this.resizeLayerTexture(this.backgroundLayerDataTexture, this.nextBackgroundLayerIndex);
                this.uniforms.get("tBackgroundLayerData")!.value = this.backgroundLayerDataTexture;
            }
            this.backgroundLayerIndices.set(layerId, this.nextBackgroundLayerIndex);
            this.nextBackgroundLayerIndex++;
        }

        this.needsLayerTextureUpdate = true;
    }

    /**
     * Updates an existing layer's configuration.
     * @param layerId - Identifier of the layer to update.
     * @param config - New configuration options for the layer.
     */
    public updateLayer(layerId: string, config: ITranslucentLayerConfig): void {
        if (!this.layers.has(layerId)) {
            throw new Error(`Layer "${layerId}" does not exist`);
        }

        const existingConfig = this.layers.get(layerId)!;
        const oldMode = existingConfig.mode || 'normal';
        const newMode = config.mode || oldMode;

        // Check if mode changed
        if (oldMode !== newMode) {
            // Remove from old index map
            if (oldMode === 'normal') {
                this.normalLayerIndices.delete(layerId);
            } else {
                this.backgroundLayerIndices.delete(layerId);
            }

            // Reindex layers for the old mode
            if (oldMode === 'normal') {
                this.reindexLayers('normal');
            } else {
                this.reindexLayers('background');
            }

            // Add to new index map
            if (newMode === 'normal') {
                // Check if resize is needed
                if (this.nextNormalLayerIndex >= this.layersPerRow) {
                    this.normalLayerDataTexture = this.resizeLayerTexture(this.normalLayerDataTexture, this.nextNormalLayerIndex);
                    this.uniforms.get("tNormalLayerData")!.value = this.normalLayerDataTexture;
                }
                this.normalLayerIndices.set(layerId, this.nextNormalLayerIndex);
                this.nextNormalLayerIndex++;
            } else {
                // Check if resize is needed
                if (this.nextBackgroundLayerIndex >= this.layersPerRow) {
                    this.backgroundLayerDataTexture = this.resizeLayerTexture(this.backgroundLayerDataTexture, this.nextBackgroundLayerIndex);
                    this.uniforms.get("tBackgroundLayerData")!.value = this.backgroundLayerDataTexture;
                }
                this.backgroundLayerIndices.set(layerId, this.nextBackgroundLayerIndex);
                this.nextBackgroundLayerIndex++;
            }

            // 更新对象所属的Selection
            this.updateObjectsForLayerModeChange(layerId, oldMode, newMode);
        }

        // Only update parsed color if color changed
        let parsedColor = existingConfig.parsedColor;
        if (config.color && config.color !== existingConfig.color) {
            parsedColor = new Color(config.color);
        }

        const updatedConfig: InternalLayerConfig = {
            mixFactor: config.mixFactor !== undefined ? config.mixFactor : existingConfig.mixFactor,
            blendMode: config.blendMode || existingConfig.blendMode,
            color: config.color || existingConfig.color,
            occlusionDistance: config.occlusionDistance !== undefined ? config.occlusionDistance : existingConfig.occlusionDistance,
            useObjectColor: config.useObjectColor !== undefined ? config.useObjectColor : existingConfig.useObjectColor,
            objectColorMix: config.objectColorMix !== undefined ? config.objectColorMix : existingConfig.objectColorMix,
            mode: newMode,
            parsedColor
        };

        this.layers.set(layerId, updatedConfig);
        this.needsLayerTextureUpdate = true;
    }

    /**
     * Updates objects when their layer's mode changes.
     */
    private updateObjectsForLayerModeChange(layerId: string, oldMode: 'normal' | 'background', newMode: 'normal' | 'background'): void {
        // 找出所有属于这个层的对象
        if (oldMode === 'normal') {
            // 从normalSelection中移除并添加到backgroundSelection
            const objectsToMove: Object3D[] = [];
            this.normalSelection.forEach((object) => {
                if (object.userData.__layerId === layerId) {
                    objectsToMove.push(object);
                }
            });

            objectsToMove.forEach((object) => {
                this.normalSelection.delete(object);
                this.backgroundSelection.add(object);
                object.userData.__layerIndex = this.backgroundLayerIndices.get(layerId)!;
            });
        } else {
            // 从backgroundSelection中移除并添加到normalSelection
            const objectsToMove: Object3D[] = [];
            this.backgroundSelection.forEach((object) => {
                if (object.userData.__layerId === layerId) {
                    objectsToMove.push(object);
                }
            });

            objectsToMove.forEach((object) => {
                this.backgroundSelection.delete(object);
                this.normalSelection.add(object);
                object.userData.__layerIndex = this.normalLayerIndices.get(layerId)!;
            });
        }
    }

    /**
     * Removes a layer and all associated objects.
     * @param layerId - Identifier of the layer to remove.
     */
    public removeLayer(layerId: string): void {
        if (this.layers.has(layerId)) {
            const config = this.layers.get(layerId)!;
            const mode = config.mode || 'normal';

            // Remove all objects from this layer
            const objectsToRemove: Object3D[] = [];

            if (mode === 'normal') {
                this.normalSelection.forEach((object) => {
                    if (object.userData.__layerId === layerId) {
                        objectsToRemove.push(object);
                    }
                });
            } else {
                this.backgroundSelection.forEach((object) => {
                    if (object.userData.__layerId === layerId) {
                        objectsToRemove.push(object);
                    }
                });
            }

            // 移除对象
            objectsToRemove.forEach((object) => {
                this.removeFromLayer(object);
            });

            this.layers.delete(layerId);

            if (mode === 'normal') {
                this.normalLayerIndices.delete(layerId);
                this.reindexLayers('normal');
            } else {
                this.backgroundLayerIndices.delete(layerId);
                this.reindexLayers('background');
            }

            this.needsLayerTextureUpdate = true;
        }
    }

    /**
     * Reindexes layers for a specific mode to maintain contiguous indices.
     */
    private reindexLayers(mode: 'normal' | 'background'): void {
        if (mode === 'normal') {
            const sortedLayerIds = Array.from(this.layers.entries())
                .filter(([layerId, config]) => (config.mode || 'normal') === 'normal')
                .sort(([layerIdA, configA], [layerIdB, configB]) =>
                    (this.normalLayerIndices.get(layerIdA) || 0) - (this.normalLayerIndices.get(layerIdB) || 0))
                .map(([layerId, config]) => layerId);

            this.normalLayerIndices.clear();
            this.nextNormalLayerIndex = 0;

            for (const layerId of sortedLayerIds) {
                this.normalLayerIndices.set(layerId, this.nextNormalLayerIndex);
                this.nextNormalLayerIndex++;
            }

            // Update object layer indices
            this.normalSelection.forEach((object) => {
                const layerId = object.userData.__layerId;
                if (layerId && this.layers.has(layerId) && this.normalLayerIndices.has(layerId)) {
                    object.userData.__layerIndex = this.normalLayerIndices.get(layerId)!;
                }
            });
        } else {
            const sortedLayerIds = Array.from(this.layers.entries())
                .filter(([layerId, config]) => config.mode === 'background')
                .sort(([layerIdA, configA], [layerIdB, configB]) =>
                    (this.backgroundLayerIndices.get(layerIdA) || 0) - (this.backgroundLayerIndices.get(layerIdB) || 0))
                .map(([layerId, config]) => layerId);

            this.backgroundLayerIndices.clear();
            this.nextBackgroundLayerIndex = 0;

            for (const layerId of sortedLayerIds) {
                this.backgroundLayerIndices.set(layerId, this.nextBackgroundLayerIndex);
                this.nextBackgroundLayerIndex++;
            }

            // Update object layer indices
            this.backgroundSelection.forEach((object) => {
                const layerId = object.userData.__layerId;
                if (layerId && this.layers.has(layerId) && this.backgroundLayerIndices.has(layerId)) {
                    object.userData.__layerIndex = this.backgroundLayerIndices.get(layerId)!;
                }
            });
        }
    }

    /**
     * Updates the layer data textures with current layer configurations.
     */
    private updateLayerDataTexture(): void {
        if (!this.needsLayerTextureUpdate) return;

        // Update normal layer data texture
        const normalArray = this.normalLayerDataTexture.image.data as Float32Array;
        normalArray.fill(0);

        for (const [layerId, config] of this.layers) {
            if ((config.mode || 'normal') === 'normal') {
                const layerIndex = this.normalLayerIndices.get(layerId);
                if (layerIndex !== undefined) {
                    this.updateLayerDataTextureArray(normalArray, layerIndex, config);
                }
            }
        }
        this.normalLayerDataTexture.needsUpdate = true;
        this.uniforms.get("normalLayerCount")!.value = this.nextNormalLayerIndex;

        // Update background layer data texture
        const backgroundArray = this.backgroundLayerDataTexture.image.data as Float32Array;
        backgroundArray.fill(0);

        for (const [layerId, config] of this.layers) {
            if (config.mode === 'background') {
                const layerIndex = this.backgroundLayerIndices.get(layerId);
                if (layerIndex !== undefined) {
                    this.updateLayerDataTextureArray(backgroundArray, layerIndex, config);
                }
            }
        }
        this.backgroundLayerDataTexture.needsUpdate = true;
        this.uniforms.get("backgroundLayerCount")!.value = this.nextBackgroundLayerIndex;

        this.needsLayerTextureUpdate = false;
    }

    /**
     * Updates a specific layer's data in the texture array.
     */
    private updateLayerDataTextureArray(array: Float32Array, layerIndex: number, config: InternalLayerConfig): void {
        const pixelsPerLayer = TranslucentLayerEffect.PIXELS_PER_LAYER;
        const color = config.parsedColor!;

        // Calculate pixel offset
        const pixelOffset = layerIndex * pixelsPerLayer * 4;

        // First pixel: basic configuration
        // RGBA: [mixFactor, blendMode, color.r, color.g]
        array[pixelOffset] = config.mixFactor !== undefined ? config.mixFactor : 0.3;
        array[pixelOffset + 1] = TranslucentLayerEffect.BLEND_MODE_MAP[config.blendMode || 'mix'] ?? 0.0;
        array[pixelOffset + 2] = color.r;
        array[pixelOffset + 3] = color.g;

        // Second pixel: additional configuration
        // RGBA: [color.b, occlusionDistance, 0, useObjectColor + objectColorMix]
        array[pixelOffset + 4] = color.b;

        // 确保遮挡距离正确存储
        array[pixelOffset + 5] = config.occlusionDistance !== undefined ? config.occlusionDistance : 10.0;

        array[pixelOffset + 6] = 0; // Reserved for future use

        // Pack useObjectColor and objectColorMix into a single float
        const useObjectColor = config.useObjectColor !== false ? 1.0 : 0.0;
        const objectColorMix = config.objectColorMix !== undefined ? config.objectColorMix : 0.5;
        array[pixelOffset + 7] = useObjectColor + objectColorMix * 0.0001;
    }

    /**
     * Gets the configuration of a specific layer.
     * @param layerId - Identifier of the layer.
     * @returns The layer configuration or undefined if the layer doesn't exist.
     */
    public getLayerConfig(layerId: string): ITranslucentLayerConfig | undefined {
        const config = this.layers.get(layerId);
        if (!config) return undefined;

        // Return a copy without internal fields
        const { parsedColor, ...publicConfig } = config;
        return publicConfig;
    }

    /**
     * Gets all layer identifiers.
     * @returns Array of layer identifiers.
     */
    public getLayers(): string[] {
        return Array.from(this.layers.keys());
    }

    /**
     * Gets layer identifiers by mode.
     * @param mode - The mode to filter by.
     * @returns Array of layer identifiers for the specified mode.
     */
    public getLayersByMode(mode: 'normal' | 'background'): string[] {
        return Array.from(this.layers.entries())
            .filter(([layerId, config]) => (config.mode || 'normal') === mode)
            .map(([layerId, config]) => layerId);
    }

    // ================ Object Management API ================

    /**
     * Adds an object to a translucent layer.
     * @param object - The 3D object to add.
     * @param layerId - Identifier of the layer to add the object to.
     */
    public addToLayer(object: Object3D, layerId: string): void {
        if (!this.layers.has(layerId)) {
            this.createLayer(layerId);
        }

        const config = this.layers.get(layerId)!;
        const mode = config.mode || 'normal';

        object.userData.__layerId = layerId;

        if (mode === 'normal') {
            object.userData.__layerIndex = this.normalLayerIndices.get(layerId)!;
            this.normalSelection.add(object);
        } else {
            object.userData.__layerIndex = this.backgroundLayerIndices.get(layerId)!;
            this.backgroundSelection.add(object);
        }
    }

    /**
     * Removes an object from its current layer.
     * @param object - The 3D object to remove.
     */
    public removeFromLayer(object: Object3D): void {
        const layerId = object.userData.__layerId;
        if (!layerId) return;

        // 从两个Selection中都移除，确保对象完全移除
        this.normalSelection.delete(object);
        this.backgroundSelection.delete(object);

        delete object.userData.__layerId;
        delete object.userData.__layerIndex;
    }

    /**
     * Moves an object to a different layer.
     * @param object - The 3D object to move.
     * @param newLayerId - Identifier of the target layer.
     */
    public moveToLayer(object: Object3D, newLayerId: string): void {
        if (!this.layers.has(newLayerId)) {
            this.createLayer(newLayerId);
        }

        // Remove from current layer
        this.removeFromLayer(object);

        // Add to new layer
        this.addToLayer(object, newLayerId);
    }

    /**
     * Gets the layer identifier of an object.
     * @param object - The 3D object.
     * @returns The layer identifier or undefined if the object isn't in any layer.
     */
    public getObjectLayer(object: Object3D): string | undefined {
        return object.userData.__layerId;
    }

    /**
     * Gets the mode of the layer an object belongs to.
     * @param object - The 3D object.
     * @returns The layer mode or undefined if the object isn't in any layer.
     */
    public getObjectLayerMode(object: Object3D): 'normal' | 'background' | undefined {
        const layerId = this.getObjectLayer(object);
        if (!layerId || !this.layers.has(layerId)) return undefined;

        const config = this.layers.get(layerId)!;
        return config.mode || 'normal';
    }

    /**
     * Checks if an object belongs to a layer.
     * @param object - The 3D object to check.
     * @param layerId - Optional layer identifier to check against.
     * @returns True if the object belongs to the specified layer (or any layer if not specified).
     */
    public has(object: Object3D, layerId?: string): boolean {
        const objectLayer = object.userData.__layerId;
        if (!objectLayer) return false;

        if (layerId !== undefined) {
            return objectLayer === layerId;
        }

        return true;
    }

    /**
     * Toggles an object's membership in a layer.
     * @param object - The 3D object to toggle.
     * @param layerId - Optional layer identifier (required when adding).
     * @returns True if the object was added to a layer, false if removed.
     */
    public toggle(object: Object3D, layerId?: string): boolean {
        if (this.has(object)) {
            this.removeFromLayer(object);
            return false;
        } else {
            if (layerId === undefined) {
                throw new Error('Layer ID is required when adding an object');
            }
            this.addToLayer(object, layerId);
            return true;
        }
    }

    // ================ Rendering Logic ================

    /**
     * Renders selected objects with layer-specific materials.
     * @param renderer - The WebGL renderer.
     */
    private renderSelectedObjects(renderer: WebGLRenderer): void {
        const totalObjects = this.normalSelection.size + this.backgroundSelection.size;
        if (totalObjects === 0) return;

        const originalState = {
            renderTarget: renderer.getRenderTarget(),
            clearColor: new Color(),
            clearAlpha: renderer.getClearAlpha(),
            autoClear: renderer.autoClear,
            cameraLayers: this.camera.layers.mask,
            overrideMaterial: this.scene.overrideMaterial,
            background: this.scene.background,
            toneMapping: renderer.toneMapping,
            shadowMapEnabled: renderer.shadowMap.enabled
        };

        renderer.getClearColor(originalState.clearColor);

        try {
            renderer.toneMapping = NoBlending;
            renderer.shadowMap.enabled = false;

            // ============ First pass: Normal mode layer ID rendering ============
            if (this.normalSelection.size > 0) {
                // 隐藏backgroundSelection的对象
                this.backgroundSelection.setVisible(false);
                // 显示normalSelection的对象
                this.normalSelection.setVisible(true);

                this.scene.background = null;
                this.scene.overrideMaterial = this.layerIDMaterial;

                renderer.setRenderTarget(this.normalTargetRenderTarget);
                renderer.autoClear = true;
                renderer.setClearColor(0x000000, 0);
                renderer.setClearAlpha(0);
                renderer.clear();

                this.camera.layers.set(this.normalSelection.layer);
                renderer.render(this.scene, this.camera);

                this.scene.overrideMaterial = null;

                renderer.setRenderTarget(this.normalColorRenderTarget);
                renderer.clear();

                renderer.render(this.scene, this.camera);
            }

            // ============ Second pass: Background mode layer ID rendering ============
            if (this.backgroundSelection.size > 0) {
                // 隐藏normalSelection的对象
                this.normalSelection.setVisible(false);
                // 显示backgroundSelection的对象
                this.backgroundSelection.setVisible(true);

                this.scene.background = null;
                this.scene.overrideMaterial = this.layerIDMaterial;

                renderer.setRenderTarget(this.backgroundTargetRenderTarget);
                renderer.autoClear = true;
                renderer.setClearColor(0x000000, 0);
                renderer.setClearAlpha(0);
                renderer.clear();

                this.camera.layers.set(this.backgroundSelection.layer);
                renderer.render(this.scene, this.camera);

                this.scene.overrideMaterial = null;

                renderer.setRenderTarget(this.backgroundColorRenderTarget);
                renderer.clear();

                renderer.render(this.scene, this.camera);
            }

        } finally {
            // 恢复所有对象的可见性
            this.normalSelection.setVisible(true);
            this.backgroundSelection.setVisible(true);

            // Restore scene state
            this.scene.overrideMaterial = originalState.overrideMaterial;
            this.scene.background = originalState.background;
            this.camera.layers.mask = originalState.cameraLayers;
            renderer.setRenderTarget(originalState.renderTarget);
            renderer.autoClear = originalState.autoClear;
            renderer.setClearColor(originalState.clearColor, originalState.clearAlpha);
            renderer.toneMapping = originalState.toneMapping;
            renderer.shadowMap.enabled = originalState.shadowMapEnabled;
        }
    }

    /**
     * Updates the effect before each frame render.
     * @param renderer - The WebGL renderer.
     * @param inputBuffer - The input render target.
     * @param deltaTime - Time elapsed since the last frame.
     */
    public update(
        renderer: WebGLRenderer,
        inputBuffer: WebGLRenderTarget,
        deltaTime?: number
    ): void {
        this.updateCameraParams();

        if (this.needsLayerTextureUpdate) {
            this.updateLayerDataTexture();
        }

        const totalObjects = this.normalSelection.size + this.backgroundSelection.size;
        if (totalObjects > 0) {
            this.renderSelectedObjects(renderer);
            this.uniforms.get("tNormalLayerID")!.value = this.normalTargetRenderTarget.texture;
            this.uniforms.get("tNormalLayerColor")!.value = this.normalColorRenderTarget.texture;
            this.uniforms.get("tNormalLayerDepth")!.value = this.normalColorRenderTarget.depthTexture;
            this.uniforms.get("tBackgroundLayerID")!.value = this.backgroundTargetRenderTarget.texture;
            this.uniforms.get("tBackgroundLayerColor")!.value = this.backgroundColorRenderTarget.texture;
            this.uniforms.get("tBackgroundLayerDepth")!.value = this.backgroundColorRenderTarget.depthTexture;
        } else {
            this.uniforms.get("tNormalLayerID")!.value = null;
            this.uniforms.get("tNormalLayerColor")!.value = null;
            this.uniforms.get("tNormalLayerDepth")!.value = null;
            this.uniforms.get("tBackgroundLayerID")!.value = null;
            this.uniforms.get("tBackgroundLayerColor")!.value = null;
            this.uniforms.get("tBackgroundLayerDepth")!.value = null;
        }

        super.update(renderer, inputBuffer, deltaTime);
    }

    /**
     * Updates render target sizes when the viewport is resized.
     * @param width - New width.
     * @param height - New height.
     */
    public setSize(width: number, height: number): void {
        this.normalTargetRenderTarget.setSize(width, height);
        this.backgroundTargetRenderTarget.setSize(width, height);
        this.normalColorRenderTarget.setSize(width, height);
        this.backgroundColorRenderTarget.setSize(width, height);
    }

    /**
     * Disposes of all resources used by the effect.
     */
    public override dispose(): void {
        super.dispose();
        this.normalTargetRenderTarget.dispose();
        this.backgroundTargetRenderTarget.dispose();
        this.normalColorRenderTarget.dispose();
        this.backgroundColorRenderTarget.dispose();
        this.normalLayerDataTexture.dispose();
        this.backgroundLayerDataTexture.dispose();
        this.layerIDMaterial.dispose();
        this.normalSelection.clear();
        this.backgroundSelection.clear();
        this.layers.clear();
        this.normalLayerIndices.clear();
        this.backgroundLayerIndices.clear();
    }
}