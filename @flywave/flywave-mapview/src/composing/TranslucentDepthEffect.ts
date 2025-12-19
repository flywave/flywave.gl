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
    Material,
    Object3D,
    Mesh
} from "three";

/**
 * Configuration options for the translucent layer effect.
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
 */
export class TranslucentLayerEffect extends Effect {
    // ================ Private Properties ================
    
    /** Selection of objects that belong to translucent layers. */
    private readonly selection: Selection;
    
    /** Render target for intermediate rendering passes. */
    private readonly targetRenderTarget: WebGLRenderTarget;
    
    /** Render target for color buffer. */
    private readonly colorRenderTarget: WebGLRenderTarget;
    
    /** Texture storing layer configuration data. */
    private layerDataTexture: DataTexture;
    
    /** Material used for rendering layer IDs. */
    private readonly layerIDMaterial: ShaderMaterial;
    
    /** Map of layer configurations by layer ID. */
    private readonly layers: Map<string, InternalLayerConfig> = new Map();
    
    /** Map of layer indices by layer ID. */
    private readonly layerIndices: Map<string, number> = new Map();
    
    /** Index counter for assigning new layer indices. */
    private nextLayerIndex: number = 0;
    
    /** Maximum number of layers per row in the layer data texture. */
    private layersPerRow: number = 128;
    
    /** Storage for original material states to restore after effect rendering. */
    private readonly originalMaterialStates: Map<Object3D, MaterialState> = new Map();
    
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
                ["tLayerID", new Uniform(null)],
                ["tLayerColor", new Uniform(null)],
                ["tLayerDepth", new Uniform(null)],
                ["tLayerData", new Uniform(null)],
                ["layerCount", new Uniform(0)],
                ["layersPerRow", new Uniform(128.0)],
                ["cameraNear", new Uniform(0.1)],
                ["cameraFar", new Uniform(1000.0)]
            ])
        });

        this.selection = new Selection();
        
        // Create render targets
        const renderTargetOptions = {
            minFilter: LinearFilter,
            magFilter: LinearFilter,
            format: RGBAFormat,
            depthTexture: new DepthTexture(1, 1, UnsignedShortType)
        };

        this.targetRenderTarget = new WebGLRenderTarget(1, 1, {
            minFilter: LinearFilter,
            magFilter: LinearFilter,
            format: RGBAFormat,
        });
        
        this.colorRenderTarget = new WebGLRenderTarget(1, 1, renderTargetOptions);
        
        // Create layer data texture
        this.layerDataTexture = this.createLayerDataTexture();
        this.uniforms.get("tLayerData")!.value = this.layerDataTexture;
        
        // Create layer ID material - 保持与原代码相同的逻辑
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
                layerIndex: { value: 0 }
            },
            vertexShader: `
                uniform float layerIndex;
                varying vec3 vColor;
                void main() {
	                #include <begin_vertex>
                    vColor = vec3(layerIndex / 256.0, 0.0, 0.0);
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

        // 保持与原代码相同的 onBeforeRender 逻辑
        customMaterial.onBeforeRender = (renderer, scene, camera, geometry, object) => {
            const layerIndex = object.userData.__layerIndex;
            customMaterial.uniforms.layerIndex.value = layerIndex;
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
     * Resizes the layer data texture when capacity is exceeded.
     */
    private resizeLayerTexture(): void {
        // Double the capacity each time
        this.layersPerRow *= 2;

        const newTexture = this.createLayerDataTexture();
        const oldArray = this.layerDataTexture.image.data as Float32Array;
        const newArray = newTexture.image.data as Float32Array;

        // Copy old data (maintaining the same pixel layout)
        const oldPixelsPerLayer = TranslucentLayerEffect.PIXELS_PER_LAYER;
        const newPixelsPerLayer = TranslucentLayerEffect.PIXELS_PER_LAYER;

        // Rearrange data into the new texture - 保持与原代码相同的逻辑
        for (let layerIdx = 0; layerIdx < this.nextLayerIndex; layerIdx++) {
            const oldPixelOffset = layerIdx * oldPixelsPerLayer * 4;
            const newPixelOffset = layerIdx * newPixelsPerLayer * 4;

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
        this.layerDataTexture.dispose();
        this.layerDataTexture = newTexture;
        this.uniforms.get("tLayerData")!.value = this.layerDataTexture;
        this.needsLayerTextureUpdate = true;
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
     * 注意：必须保持与原代码完全相同的着色器逻辑
     */
    private static getFragmentShaderSource(): string {
        return `
            uniform sampler2D tLayerID;
            uniform sampler2D tLayerColor;
            uniform sampler2D tLayerDepth;
            uniform sampler2D tLayerData;
            uniform float layerCount;
            uniform float layersPerRow;
            uniform float cameraNear;
            uniform float cameraFar;
            
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
            
            // Blend functions - 保持与原代码相同
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
            
            // Get layer configuration from layer data texture - 保持与原代码相同的逻辑
            LayerData getLayerData(int layerIndex) {
                LayerData data;
                
                // Each layer occupies 2 pixels
                float pixelsPerLayer = 2.0;
                float textureWidth = layersPerRow * pixelsPerLayer;
                
                // Calculate texture coordinates
                float u0 = (float(layerIndex) * pixelsPerLayer + 0.5) / textureWidth;
                float u1 = (float(layerIndex) * pixelsPerLayer + 1.5) / textureWidth;
                
                // First pixel: basic configuration
                vec4 pixel0 = texture2D(tLayerData, vec2(u0, 0.5));
                data.mixFactor = pixel0.r;
                data.blendMode = pixel0.g;
                data.color = vec3(pixel0.b, pixel0.a, 0.0);
                
                // Second pixel: additional configuration
                vec4 pixel1 = texture2D(tLayerData, vec2(u1, 0.5));
                data.color.b = pixel1.r;
                data.occlusionDistance = pixel1.g;
                
                // Unpack useObjectColor and objectColorMix - 保持与原代码相同的解包逻辑
                float packedValue = pixel1.a;
                data.useObjectColor = (packedValue >= 1.0);
                data.objectColorMix = (packedValue - floor(packedValue)) * 10000.0;
                
                return data;
            }
            
            void mainImage(const in vec4 inputColor, const in vec2 uv, const in float depth, out vec4 outputColor) {
                vec4 layerID = texture2D(tLayerID, uv);
                float layerDepth = texture2D(tLayerDepth, uv).r;
                vec4 objectColor = texture2D(tLayerColor, uv);
                float encodedIndex = layerID.r * 256.0;
                int layerIndex = int(encodedIndex);
                
                // Get layer configuration
                LayerData layer = getLayerData(layerIndex);
                
                // Read object's original color and blend - 保持与原代码相同的逻辑
                vec3 finalHighlightColor = layer.color;
                
                if (layer.useObjectColor && layer.objectColorMix > 0.0) {
                    finalHighlightColor = mix(layer.color, objectColor.rgb, layer.objectColorMix);
                }
                
                // 关键：保持与原代码完全相同的深度比较逻辑
                bool isLayerInFront = (layerDepth - depth) < 0.0001;
                bool isBackground = depth >= 0.999;
                
                float actualLayerDepth = getLinearDistance(layerDepth);
                float actualCurrentDepth = getLinearDistance(depth);
                float depthDifference = abs(actualCurrentDepth - actualLayerDepth);

                // 关键：保持与原代码完全相同的遮挡判断逻辑
                if(depthDifference > layer.occlusionDistance && !isLayerInFront) {
                    outputColor = inputColor;
                    return;
                }
                
                // Original logic: if layer is in front or is background, don't show effect
                if (isLayerInFront || isBackground) {
                    outputColor = objectColor;
                } else {
                    // Apply translucent effect (original logic)
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
                    
                    outputColor = vec4(resultColor, objectColor.a);
                }
            }
        `;
    }

    // ================ Material State Management ================
    
    /**
     * Saves the original material state of an object.
     * @param object - The 3D object whose material state should be saved.
     */
    private saveOriginalMaterialState(object: Object3D): void {
        if (!(object as any).isMesh) return;

        const mesh = object as Mesh;
        if (mesh.material) {
            const material = Array.isArray(mesh.material) ? mesh.material[0] : mesh.material;

            this.originalMaterialStates.set(object, {
                depthTest: material.depthTest,
                depthWrite: material.depthWrite,
                colorWrite: material.colorWrite,
                transparent: material.transparent
            });
        }
    }
    
    /**
     * Restores the original material state of an object.
     * @param object - The 3D object whose material state should be restored.
     */
    private restoreOriginalMaterialState(object: Object3D): void {
        if (!(object as any).isMesh) return;

        const originalState = this.originalMaterialStates.get(object);
        if (!originalState) return;

        const mesh = object as Mesh;
        if (mesh.material) {
            const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];

            materials.forEach(material => {
                material.depthTest = originalState.depthTest;
                material.depthWrite = originalState.depthWrite;
                material.colorWrite = originalState.colorWrite;
                material.transparent = originalState.transparent;
                material.needsUpdate = true;
            });
        }

        this.originalMaterialStates.delete(object);
    }
    
    /**
     * Sets specific rendering states for selected objects.
     * @param enableDepthWrite - Whether to enable depth buffer writing.
     * @param enableColorWrite - Whether to enable color buffer writing.
     */
    private setSelectedObjectsRenderState(enableDepthWrite: boolean, enableColorWrite: boolean): void {
        this.selection.forEach(object => {
            if (!(object as any).isMesh) return;

            const mesh = object as Mesh;
            if (mesh.material) {
                const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];

                materials.forEach(material => {
                    // Save original state if not already saved
                    if (!this.originalMaterialStates.has(object)) {
                        this.saveOriginalMaterialState(object);
                    }

                    // Set new rendering state
                    // material.depthWrite = enableDepthWrite;
                    material.colorWrite = enableColorWrite;
                    material.needsUpdate = true;
                });
            }
        });
    }
    
    /**
     * Restores the original rendering states for all selected objects.
     */
    private restoreAllSelectedObjectsRenderState(): void {
        const objectsToRestore = Array.from(this.originalMaterialStates.keys());

        objectsToRestore.forEach(object => {
            this.restoreOriginalMaterialState(object);
        });
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

        // Check if resize is needed
        if (this.nextLayerIndex >= this.layersPerRow) {
            this.resizeLayerTexture();
        }

        const defaultColor = TranslucentLayerEffect.DEFAULT_LAYER_COLOR.clone();
        const parsedColor = config.color ? new Color(config.color) : defaultColor;

        this.layers.set(layerId, {
            mixFactor: config.mixFactor !== undefined ? config.mixFactor : 0.3,
            blendMode: config.blendMode || 'mix',
            color: config.color || '#ff802a',
            occlusionDistance: config.occlusionDistance !== undefined ? config.occlusionDistance : 10.0,
            useObjectColor: config.useObjectColor !== undefined ? config.useObjectColor : true,
            objectColorMix: config.objectColorMix !== undefined ? config.objectColorMix : 0.5,
            parsedColor
        });

        this.layerIndices.set(layerId, this.nextLayerIndex);
        this.nextLayerIndex++;

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
            parsedColor
        };

        this.layers.set(layerId, updatedConfig);
        this.needsLayerTextureUpdate = true;
    }
    
    /**
     * Removes a layer and all associated objects.
     * @param layerId - Identifier of the layer to remove.
     */
    public removeLayer(layerId: string): void {
        if (this.layers.has(layerId)) {
            this.layers.delete(layerId);
            this.layerIndices.delete(layerId);

            this.reindexLayers();
            this.needsLayerTextureUpdate = true;
        }
    }
    
    /**
     * Reindexes all layers to maintain contiguous indices.
     */
    private reindexLayers(): void {
        const sortedLayerIds = Array.from(this.layers.keys())
            .sort((a, b) => (this.layerIndices.get(a) || 0) - (this.layerIndices.get(b) || 0));

        this.layerIndices.clear();
        this.nextLayerIndex = 0;

        for (const layerId of sortedLayerIds) {
            this.layerIndices.set(layerId, this.nextLayerIndex);
            this.nextLayerIndex++;
        }

        this.selection.forEach((object) => {
            const layerId = object.userData.__layerId;
            if (layerId && this.layerIndices.has(layerId)) {
                object.userData.__layerIndex = this.layerIndices.get(layerId);
            }
        });
    }
    
    /**
     * Updates the layer data texture with current layer configurations.
     */
    private updateLayerDataTexture(): void {
        if (!this.needsLayerTextureUpdate) return;
        
        const array = this.layerDataTexture.image.data as Float32Array;
        const pixelsPerLayer = TranslucentLayerEffect.PIXELS_PER_LAYER;

        // Clear texture data
        array.fill(0);

        for (const [layerId, config] of this.layers) {
            const layerIndex = this.layerIndices.get(layerId)!;
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
            // RGBA: [color.b, occlusionDistance, useObjectColor + objectColorMix]
            array[pixelOffset + 4] = color.b;

            // 确保遮挡距离正确存储（默认10.0，如果设为0则禁用距离检查）
            array[pixelOffset + 5] = config.occlusionDistance !== undefined ? config.occlusionDistance : 10.0;
            array[pixelOffset + 6] = 0;

            // Pack useObjectColor and objectColorMix into a single float
            // High 16 bits: useObjectColor (0 or 1), Low 16 bits: objectColorMix
            const useObjectColor = config.useObjectColor !== false ? 1.0 : 0.0;
            const objectColorMix = config.objectColorMix !== undefined ? config.objectColorMix : 0.5;
            array[pixelOffset + 7] = useObjectColor + objectColorMix * 0.0001;
        }

        this.layerDataTexture.needsUpdate = true;
        this.uniforms.get("layerCount")!.value = this.layers.size;
        this.needsLayerTextureUpdate = false;
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

        this.selection.add(object);

        const layerIndex = this.layerIndices.get(layerId)!;
        object.userData.__layerId = layerId;
        object.userData.__layerIndex = layerIndex;
    }
    
    /**
     * Removes an object from its current layer.
     * @param object - The 3D object to remove.
     */
    public removeFromLayer(object: Object3D): void {
        // Restore object's original rendering state
        this.restoreOriginalMaterialState(object);

        this.selection.delete(object);
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

        if (this.selection.has(object)) {
            const layerIndex = this.layerIndices.get(newLayerId)!;
            object.userData.__layerId = newLayerId;
            object.userData.__layerIndex = layerIndex;
        }
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
        if (this.selection.size === 0) return;

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

            // ============ First pass: Layer ID rendering ============
            // Enable depth and color writing
            this.setSelectedObjectsRenderState(true, true);

            this.camera.layers.set(this.selection.layer);
            this.scene.background = null;
            this.scene.overrideMaterial = this.layerIDMaterial;

            renderer.setRenderTarget(this.targetRenderTarget);
            renderer.autoClear = true;
            renderer.setClearColor(0x000000, 0);
            renderer.setClearAlpha(0);
            renderer.clear();

            renderer.render(this.scene, this.camera);

            this.scene.overrideMaterial = null;

            renderer.setRenderTarget(this.colorRenderTarget);
            renderer.clear();

            renderer.render(this.scene, this.camera);

            // ============ After rendering: Disable depth and color writing ============
            this.setSelectedObjectsRenderState(false, false);

        } finally {
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
        
        if (this.selection.size > 0) {
            this.renderSelectedObjects(renderer);
            this.uniforms.get("tLayerID")!.value = this.targetRenderTarget.texture;
            this.uniforms.get("tLayerColor")!.value = this.colorRenderTarget.texture;
            this.uniforms.get("tLayerDepth")!.value = this.colorRenderTarget.depthTexture;
        } else {
            this.uniforms.get("tLayerID")!.value = null;
            this.uniforms.get("tLayerColor")!.value = null;
            this.uniforms.get("tLayerDepth")!.value = null;
        }

        super.update(renderer, inputBuffer, deltaTime);
    }
    
    /**
     * Updates render target sizes when the viewport is resized.
     * @param width - New width.
     * @param height - New height.
     */
    public setSize(width: number, height: number): void {
        this.targetRenderTarget.setSize(width, height);
        this.colorRenderTarget.setSize(width, height);
    }
    
    /**
     * Disposes of all resources used by the effect.
     */
    public override dispose(): void {
        // Restore all selected objects' original rendering states
        this.restoreAllSelectedObjectsRenderState();

        super.dispose();
        this.targetRenderTarget.dispose();
        this.colorRenderTarget.dispose();
        this.layerDataTexture.dispose();
        this.layerIDMaterial.dispose();
        this.selection.clear();
        this.layers.clear();
        this.layerIndices.clear();
        this.originalMaterialStates.clear();
    }
}