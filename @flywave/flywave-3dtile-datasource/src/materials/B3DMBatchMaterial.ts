/* Copyright (C) 2025 flywave.gl contributors */

import {
    type Tile3DBatchMeshTechniqueParams,
    type TransitionValue
} from "@flywave/flywave-datasource-protocol";
import * as THREE from "three";

import { type BatchAnimation } from "../TileRenderDataSource";
import { BatchAnimationManager } from "./BatchAnimationManager";

/**
 * Interface for custom uniforms used in the shader
 */
interface B3DMBatchMaterialUniforms {
    styleTexture: { value: THREE.DataTexture | null };
    textureWidth: { value: number };
    textureHeight: { value: number };
    animationTexture: { value: THREE.DataTexture | null };
    animationTextureWidth: { value: number };
    animationTextureHeight: { value: number };
}

/**
 * Extended batch style with animation value
 */
interface ExtendedBatchStyle extends Tile3DBatchMeshTechniqueParams {
    highlighted?: boolean;
    highlightColor?: THREE.Color;
    visible?: boolean; 
}

/**
 * Visual style structure for shader processing
 */
interface VisualStyle {
    startColor: THREE.Color;
    endColor: THREE.Color;
    startOffset: THREE.Vector3;
    endOffset: THREE.Vector3;
    startOpacity: number;
    endOpacity: number;
    startMetalness: number;
    endMetalness: number;
    startRoughness: number;
    endRoughness: number;
    startEmissive: THREE.Color;
    endEmissive: THREE.Color;
    visible: boolean;
    hasTransition: boolean;
    hasMaterialTransition: boolean;
    value: number; // Animation value from 0 to 1
}

/**
 * Custom material for B3DM format batch rendering
 * Based on MeshStandardMaterial with specialized handling for B3DM batchId attribute
 */
class B3DMBatchMaterial extends THREE.MeshStandardMaterial {
    private _batchStyles: Map<number, ExtendedBatchStyle> = new Map();
    private _styleTexture: THREE.DataTexture | null = null;
    private readonly _idAttributeName: string;
    private readonly _animationManager: BatchAnimationManager;

    /**
     * Custom uniforms for shader
     */
    public uniforms: B3DMBatchMaterialUniforms = {
        styleTexture: { value: null },
        textureWidth: { value: 0 },
        textureHeight: { value: 0 },
        animationTexture: { value: null },
        animationTextureWidth: { value: 0 },
        animationTextureHeight: { value: 0 }
    };

    constructor(
        params: {
            /** Base material parameters */
            materialParams?: THREE.MeshStandardMaterialParameters;
            /** BatchId attribute name (default: _BATCHID) */
            batchIdAttributeName?: string;
            /** Animation configuration */
            animation?: BatchAnimation;
        } = {}
    ) {
        const { materialParams = {}, batchIdAttributeName = "_batchid", animation } = params;

        super(materialParams);
        this._idAttributeName = batchIdAttributeName;

        // Initialize animation manager
        this._animationManager = new BatchAnimationManager(animation);

        // Set up shader compilation
        this.onBeforeCompile = this.setupShaders.bind(this);
    }

    /**
     * Set batch style for a specific batch
     * Only updates if the style has actually changed
     */
    setBatchStyle(batchId: number, style: ExtendedBatchStyle): void {
        const currentStyle = this._batchStyles.get(batchId);

        // Check if style has actually changed (excluding value changes)
        const styleChanged = this._hasStyleChanged(currentStyle, style);

        if (styleChanged) {
            this._batchStyles.set(batchId, { ...style });
            this._updateStyleTexture();
        }

        // Always update value through animation manager
        if (style.value !== undefined) {
            this._animationManager.ensureBatchState(batchId);
            this._animationManager.setBatchProgress(batchId, style.value);
        }
    }

    /**
     * Set batch styles for multiple batches
     */
    setBatchStyles(batchStyles: Map<number, ExtendedBatchStyle>): void {
        let needsTextureUpdate = false;

        batchStyles.forEach((newStyle, batchId) => {
            const currentStyle = this._batchStyles.get(batchId);

            // Check if style has changed
            if (this._hasStyleChanged(currentStyle, newStyle)) {
                this._batchStyles.set(batchId, { ...newStyle });
                needsTextureUpdate = true;
            }

            // Update value through animation manager
            if (newStyle.value !== undefined) {
                this._animationManager.ensureBatchState(batchId);
                this._animationManager.setBatchProgress(batchId, newStyle.value);
            }
        });

        if (needsTextureUpdate) {
            this._updateStyleTexture();
        }
    }

    /**
     * Check if style has changed (excluding value)
     */
    private _hasStyleChanged(oldStyle: ExtendedBatchStyle | undefined, newStyle: ExtendedBatchStyle): boolean {
        if (!oldStyle && !newStyle) return false;
        if (!oldStyle || !newStyle) return true;

        // Compare all style properties except value
        return (
            oldStyle.color !== newStyle.color ||
            oldStyle.opacity !== newStyle.opacity ||
            oldStyle.offset !== newStyle.offset ||
            oldStyle.direction !== newStyle.direction ||
            oldStyle.metalness !== newStyle.metalness ||
            oldStyle.roughness !== newStyle.roughness ||
            oldStyle.emissive !== newStyle.emissive ||
            oldStyle.visible !== newStyle.visible ||
            oldStyle.highlighted !== newStyle.highlighted ||
            oldStyle.highlightColor !== newStyle.highlightColor ||
            oldStyle.useAnimation !== newStyle.useAnimation
        );
    }

    /**
     * Reset all batch styles to default
     */
    resetBatchStyles(): void {
        this._batchStyles.clear();
        this._animationManager.reset();
        this._updateStyleTexture();
    }

    /**
     * Called before rendering to update animations
     */
    onBeforeRender(
        renderer: THREE.WebGLRenderer,
        scene: THREE.Scene,
        camera: THREE.Camera,
        geometry: THREE.BufferGeometry,
        object: THREE.Object3D,
        group: THREE.Group
    ): void {
        // Update animation manager
        if (this._animationManager.isPlaying) {
            this._animationManager.update();
            this._updateAnimationUniforms();
        }
    }

    /**
     * Set up shader definitions and uniforms
     */
    protected setupShaders(
        parameters: THREE.WebGLProgramParametersWithUniforms,
        renderer: THREE.WebGLRenderer
    ): void {
        // Set up shader definitions
        parameters.defines = {
            ...(parameters.defines || {}),
            USE_VISUAL_BATCH: 1,
            USE_BATCH_ANIMATION: 1
        };

        // Add custom uniforms
        Object.assign(parameters.uniforms, this.uniforms);

        this._setupShaderCode(parameters);
    }

    /**
     * Set up shader code replacements
     */
    private _setupShaderCode(parameters: THREE.WebGLProgramParametersWithUniforms): void {
        // Vertex shader replacements
        parameters.vertexShader = parameters.vertexShader.replace(
            "#include <color_pars_vertex>",
            `#include <color_pars_vertex>
            ${this._getVertexParsShaderReplacement()}`
        );

        parameters.vertexShader = parameters.vertexShader.replace(
            "#include <begin_vertex>",
            `#include <begin_vertex>
            ${this._getVertexShaderReplacement()}`
        );

        // Fragment shader replacements
        parameters.fragmentShader = parameters.fragmentShader.replace(
            "#include <color_pars_fragment>",
            `#include <color_pars_fragment>
            ${this._getFragmentParsShaderReplacement()}`
        );

        parameters.fragmentShader = parameters.fragmentShader.replace(
            "#include <color_fragment>",
            `#include <color_fragment>
            ${this._getFragmentShaderReplacement()}`
        );

        // Metalness replacement
        parameters.fragmentShader = parameters.fragmentShader.replace(
            "#include <metalnessmap_fragment>",
            `${this._getMetalnessShaderReplacement()}`
        );

        // Roughness replacement
        parameters.fragmentShader = parameters.fragmentShader.replace(
            "#include <roughnessmap_fragment>",
            `${this._getRoughnessShaderReplacement()}`
        );

        // Emissive replacement
        parameters.fragmentShader = parameters.fragmentShader.replace(
            "#include <map_fragment>",
            `${this._getEmissiveShaderReplacement()}
            #include <map_fragment>`
        );
    }

    /**
     * Get fragment shader parsing replacement
     */
    private _getFragmentParsShaderReplacement(): string {
        return `
            struct BatchStyle {
                vec3 color;
                float opacity;
                vec3 offset;
                float visible;
                float metalness;
                float roughness;
                vec3 emissive;
            };
            varying BatchStyle vBatchStyle;
            uniform sampler2D styleTexture;
        `;
    }

    /**
     * Get fragment shader main replacement
     */
    private _getFragmentShaderReplacement(): string {
        return `
            #ifdef USE_VISUAL_BATCH
                
                // Apply visibility
                if (vBatchStyle.visible < 0.5) {
                    discard;
                }
                
                // Apply color and opacity
                if (vBatchStyle.color.rgb != vec3(0.0)) {
                    diffuseColor.rgb = vBatchStyle.color.rgb;
                }
                diffuseColor.a *= vBatchStyle.opacity;
                  
            #endif 
        `;
    }

    /**
     * Get metalness shader replacement
     */
    private _getMetalnessShaderReplacement(): string {
        return `
            #ifdef USE_VISUAL_BATCH
            float metalnessFactor = vBatchStyle.metalness;
            #else
            float metalnessFactor = metalness;
            #endif
        `;
    }

    /**
     * Get roughness shader replacement
     */
    private _getRoughnessShaderReplacement(): string {
        return `
            #ifdef USE_VISUAL_BATCH
            float roughnessFactor = vBatchStyle.roughness;
            #else
            float roughnessFactor = roughness;
            #endif
        `;
    }

    /**
     * Get emissive shader replacement
     */
    private _getEmissiveShaderReplacement(): string {
        return `
            #ifdef USE_VISUAL_BATCH
                totalEmissiveRadiance = vBatchStyle.emissive;
            #endif
        `;
    }

    /**
     * Get vertex shader main replacement
     */
    private _getVertexShaderReplacement(): string {
        return `
            #ifdef USE_VISUAL_BATCH
                float batchId = round(${this._idAttributeName}); 
                
                // Unpack style from texture and apply offset transformation (explosion effect)
                BatchStyle style = unpackStyle(batchId);
                if (style.visible >= 0.5) {
                    transformed += style.offset;
                }
                vBatchStyle = style;
            #endif
        `;
    }

    /**
     * Get vertex shader parsing replacement
     */
    private _getVertexParsShaderReplacement(): string {
        return ` 
          /**
             * Unpack style information from style texture
             */
            struct BatchStyle {
                vec3 color;
                float opacity;
                vec3 offset;
                float visible;
                float metalness;
                float roughness;
                vec3 emissive;
            };

            uniform sampler2D styleTexture;
            uniform float textureWidth;
            uniform float textureHeight;
            uniform sampler2D animationTexture;
            uniform float animationTextureWidth;
            uniform float animationTextureHeight;
            varying BatchStyle vBatchStyle;

            attribute float ${this._idAttributeName};

            /**
             * Get batch animation progress from animation texture
             */
            float getBatchAnimationProgress(float batchId) {
                float u = (0.5) / animationTextureWidth;
                float v = (batchId + 0.5) / animationTextureHeight;
                return texture2D(animationTexture, vec2(u, v)).r;
            }

            BatchStyle unpackStyle(float batchId) {
                BatchStyle style;
                
                // Get independent animation progress for this batch
                float animationProgress = getBatchAnimationProgress(batchId);
                
                // Calculate UV coordinates
                float u = (0.5) / textureWidth;  // First column center
                float v = (batchId + 0.5) / textureHeight; // Corresponding row
                
                // First column: Start color (RGBA)
                vec4 colorData = texture2D(styleTexture, vec2(u, v));
                style.color = colorData.rgb;
                style.opacity = colorData.a;
                
                // Second column: Start offset (XYZ) + End offset X
                u = (1.0 + 0.5) / textureWidth;
                vec4 offsetData1 = texture2D(styleTexture, vec2(u, v));
                style.offset = offsetData1.xyz;
                
                // Third column: End offset (YZ) + End opacity + Visibility
                u = (2.0 + 0.5) / textureWidth;
                vec4 metaData = texture2D(styleTexture, vec2(u, v));
                style.visible = metaData.a;
                
                // Fourth column: End color (RGB) + Has transition animation
                u = (3.0 + 0.5) / textureWidth;
                vec4 endColorData = texture2D(styleTexture, vec2(u, v));
                
                // Fifth column: Start metalness + Start roughness + End metalness + End roughness
                u = (4.0 + 0.5) / textureWidth;
                vec4 metalnessRoughnessData = texture2D(styleTexture, vec2(u, v));
                style.metalness = metalnessRoughnessData.r;
                style.roughness = metalnessRoughnessData.g;
                
                // Sixth column: Start emissive (RGB) + Has material transition
                u = (5.0 + 0.5) / textureWidth;
                vec4 startEmissiveData = texture2D(styleTexture, vec2(u, v));
                style.emissive = startEmissiveData.rgb;
                
                // Seventh column: End emissive (RGB) + Reserved field
                u = (6.0 + 0.5) / textureWidth;
                vec4 endEmissiveData = texture2D(styleTexture, vec2(u, v));
                
                // Apply animation transition
                if (endColorData.a > 0.5) {
                    vec3 endOffset = vec3(offsetData1.a, metaData.xy); // End offset (X from offsetData1.a, YZ from metaData.xy)
                    float endOpacity = metaData.z; // End opacity
                    float endMetalness = metalnessRoughnessData.b; // End metalness
                    float endRoughness = metalnessRoughnessData.a; // End roughness
                    vec3 endEmissive = endEmissiveData.rgb; // End emissive
                    
                    float progress = clamp(animationProgress, 0.0, 1.0);
                    style.color = mix(style.color, endColorData.rgb, progress);
                    style.offset = mix(style.offset, endOffset, progress);
                    style.opacity = mix(style.opacity, endOpacity, progress);
                    style.metalness = mix(style.metalness, endMetalness, progress);
                    style.roughness = mix(style.roughness, endRoughness, progress);
                    style.emissive = mix(style.emissive, endEmissive, progress);
                }
                
                return style;
            }
        `;
    }

    /**
     * Update animation-related uniforms
     */
    private _updateAnimationUniforms(): void {
        const batchProgresses = this._animationManager.getBatchProgresses();
        const textureWidth = 1; // 1 texel per row
        const textureHeight = Math.max(batchProgresses.length, 1);

        // Create animation texture data
        const textureData = new Float32Array(textureWidth * textureHeight * 4);

        for (let i = 0; i < batchProgresses.length; i++) {
            const index = i * 4;
            textureData[index] = batchProgresses[i]; // R channel stores progress
            textureData[index + 1] = 0; // G channel unused
            textureData[index + 2] = 0; // B channel unused
            textureData[index + 3] = 1; // A channel fixed at 1
        }

        // Create or update animation texture
        let animationTexture = this.uniforms.animationTexture.value;
        if (!animationTexture ||
            animationTexture.image.width !== textureWidth ||
            animationTexture.image.height !== textureHeight) {

            if (animationTexture) {
                animationTexture.dispose();
            }

            animationTexture = new THREE.DataTexture(
                textureData,
                textureWidth,
                textureHeight,
                THREE.RGBAFormat,
                THREE.FloatType
            );
            animationTexture.needsUpdate = true;
            this.uniforms.animationTexture.value = animationTexture;
        } else {
            (animationTexture.image.data as Float32Array).set(textureData);
            animationTexture.needsUpdate = true;
        }

        // Update texture dimension uniforms
        this.uniforms.animationTextureWidth.value = textureWidth;
        this.uniforms.animationTextureHeight.value = textureHeight;
    }

    /**
     * Update style texture - extended layout to include material properties
     */
    private _updateStyleTexture(): void {
        // Calculate texture size - each row stores all properties for one batchId
        const batchCount = Math.max(this._batchStyles.size, 1);
        const textureWidth = 7; // 7 texels per row: color, offset, visibility/opacity, end values, metalness/roughness, start emissive, end emissive
        const textureHeight = batchCount; // One batchId per row

        // Create texture data
        const textureData = new Float32Array(textureWidth * textureHeight * 4);
        textureData.fill(0);

        // Fill texture data - each row contains all properties for one batchId
        this._batchStyles.forEach((batchStyle: ExtendedBatchStyle, batchId: number) => {
            const visualStyle: VisualStyle = this._convertToVisualStyle(batchStyle, batchId);
            const row = batchId;

            // First column: Start color (RGBA)
            const colorIndex = row * textureWidth * 4;
            textureData[colorIndex] = visualStyle.startColor.r;
            textureData[colorIndex + 1] = visualStyle.startColor.g;
            textureData[colorIndex + 2] = visualStyle.startColor.b;
            textureData[colorIndex + 3] = visualStyle.startOpacity;

            // Second column: Start offset (XYZ) + End offset X
            const offsetIndex = colorIndex + 4;
            textureData[offsetIndex] = visualStyle.startOffset.x;
            textureData[offsetIndex + 1] = visualStyle.startOffset.y;
            textureData[offsetIndex + 2] = visualStyle.startOffset.z;
            textureData[offsetIndex + 3] = visualStyle.endOffset.x;

            // Third column: End offset (YZ) + End opacity + Visibility
            const metaIndex = offsetIndex + 4;
            textureData[metaIndex] = visualStyle.endOffset.y;
            textureData[metaIndex + 1] = visualStyle.endOffset.z;
            textureData[metaIndex + 2] = visualStyle.endOpacity;
            textureData[metaIndex + 3] = visualStyle.visible ? 1.0 : 0.0;

            // Fourth column: End color (RGB) + Has transition animation
            const endIndex = metaIndex + 4;
            textureData[endIndex] = visualStyle.endColor.r;
            textureData[endIndex + 1] = visualStyle.endColor.g;
            textureData[endIndex + 2] = visualStyle.endColor.b;
            textureData[endIndex + 3] = visualStyle.hasTransition ? 1.0 : 0.0;

            // Fifth column: Start metalness + Start roughness + End metalness + End roughness
            const metalnessRoughnessIndex = endIndex + 4;
            textureData[metalnessRoughnessIndex] = visualStyle.startMetalness;
            textureData[metalnessRoughnessIndex + 1] = visualStyle.startRoughness;
            textureData[metalnessRoughnessIndex + 2] = visualStyle.endMetalness;
            textureData[metalnessRoughnessIndex + 3] = visualStyle.endRoughness;

            // Sixth column: Start emissive (RGB) + Has material transition
            const startEmissiveIndex = metalnessRoughnessIndex + 4;
            textureData[startEmissiveIndex] = visualStyle.startEmissive.r;
            textureData[startEmissiveIndex + 1] = visualStyle.startEmissive.g;
            textureData[startEmissiveIndex + 2] = visualStyle.startEmissive.b;
            textureData[startEmissiveIndex + 3] = visualStyle.hasMaterialTransition ? 1.0 : 0.0;

            // Seventh column: End emissive (RGB) + Reserved field
            const endEmissiveIndex = startEmissiveIndex + 4;
            textureData[endEmissiveIndex] = visualStyle.endEmissive.r;
            textureData[endEmissiveIndex + 1] = visualStyle.endEmissive.g;
            textureData[endEmissiveIndex + 2] = visualStyle.endEmissive.b;
            textureData[endEmissiveIndex + 3] = 0.0; // Reserved field
        });

        // Create or update texture
        if (this._styleTexture) {
            this._styleTexture.dispose();
        }

        this._styleTexture = new THREE.DataTexture(
            textureData,
            textureWidth,
            textureHeight,
            THREE.RGBAFormat,
            THREE.FloatType
        );
        this._styleTexture.needsUpdate = true;

        // Update uniforms
        this.uniforms.styleTexture.value = this._styleTexture;
        this.uniforms.textureWidth.value = textureWidth;
        this.uniforms.textureHeight.value = textureHeight;
    }

    /**
     * Convert B3DM style to VisualStyle structure
     */
    private _convertToVisualStyle(batchStyle: ExtendedBatchStyle, batchId: number): VisualStyle {
        // Process color
        let startColor: THREE.Color = new THREE.Color(0, 0, 0);
        let endColor: THREE.Color = new THREE.Color(0, 0, 0);
        let hasColorTransition: boolean = false;

        if (batchStyle.color !== undefined) {
            if (
                typeof batchStyle.color === "object" &&
                "from" in batchStyle.color &&
                "to" in batchStyle.color
            ) {
                // TransitionValue<StyleColor>
                const colorTransition = batchStyle.color as TransitionValue<string | number>;
                startColor = new THREE.Color(colorTransition.from as string | number);
                endColor = new THREE.Color(colorTransition.to as string | number);
                hasColorTransition = true;
            } else if (typeof batchStyle.color === "string") {
                startColor = new THREE.Color(batchStyle.color);
                endColor = startColor.clone();
            } else if (typeof batchStyle.color === "number") {
                startColor = new THREE.Color(batchStyle.color);
                endColor = startColor.clone();
            }
        }

        // Process highlight color (if exists)
        let highlightColor: THREE.Color = startColor.clone();
        if (batchStyle.highlightColor) {
            if (batchStyle.highlightColor instanceof THREE.Color) {
                highlightColor = batchStyle.highlightColor.clone();
            } else if (typeof batchStyle.highlightColor === "string") {
                highlightColor = new THREE.Color(batchStyle.highlightColor);
            } else if (typeof batchStyle.highlightColor === "number") {
                highlightColor = new THREE.Color(batchStyle.highlightColor);
            }
        }

        // Select color based on highlight status
        const finalStartColor: THREE.Color = batchStyle.highlighted ? highlightColor : startColor;
        const finalEndColor: THREE.Color = batchStyle.highlighted ? highlightColor : endColor;

        // Process opacity
        let startOpacity: number = batchStyle.visible !== false ? 1 : 0;
        let endOpacity: number = startOpacity;
        let hasOpacityTransition: boolean = false;

        if (batchStyle.opacity !== undefined) {
            if (
                typeof batchStyle.opacity === "object" &&
                "from" in batchStyle.opacity &&
                "to" in batchStyle.opacity
            ) {
                // TransitionValue<number>
                const opacityTransition = batchStyle.opacity as TransitionValue<number>;
                startOpacity = batchStyle.visible !== false ? opacityTransition.from : 0;
                endOpacity = batchStyle.visible !== false ? opacityTransition.to : 0;
                hasOpacityTransition = true;
            } else if (typeof batchStyle.opacity === "number") {
                startOpacity = batchStyle.visible !== false ? batchStyle.opacity : 0;
                endOpacity = startOpacity;
            }
        }

        // Process offset
        let startOffset: THREE.Vector3 = new THREE.Vector3();
        let endOffset: THREE.Vector3 = new THREE.Vector3();
        let hasOffsetTransition: boolean = false;

        if (batchStyle.offset !== undefined) {
            if (
                typeof batchStyle.offset === "object" &&
                "from" in batchStyle.offset &&
                "to" in batchStyle.offset
            ) {
                // TransitionValue<number>
                const offsetTransition = batchStyle.offset as TransitionValue<number>;
                // Simplified as Y-axis offset
                startOffset = new THREE.Vector3(0, offsetTransition.from, 0);
                endOffset = new THREE.Vector3(0, offsetTransition.to, 0);
                hasOffsetTransition = true;
            } else if (typeof batchStyle.offset === "number") {
                // Single number, simplified as Y-axis offset
                startOffset = new THREE.Vector3(0, batchStyle.offset, 0);
                endOffset = startOffset.clone();
            } else if (this._isVector3(batchStyle.offset)) {
                startOffset = batchStyle.offset as THREE.Vector3;
                endOffset = startOffset.clone();
            }
        }

        // Process metalness
        let startMetalness: number = this.metalness;
        let endMetalness: number = this.metalness;
        let hasMetalnessTransition: boolean = false;

        if (batchStyle.metalness !== undefined) {
            if (
                typeof batchStyle.metalness === "object" &&
                "from" in batchStyle.metalness &&
                "to" in batchStyle.metalness
            ) {
                const metalnessTransition = batchStyle.metalness as TransitionValue<number>;
                startMetalness = metalnessTransition.from;
                endMetalness = metalnessTransition.to;
                hasMetalnessTransition = true;
            } else if (typeof batchStyle.metalness === "number") {
                startMetalness = batchStyle.metalness;
                endMetalness = startMetalness;
            }
        }

        // Process roughness
        let startRoughness: number = this.roughness;
        let endRoughness: number = this.roughness;
        let hasRoughnessTransition: boolean = false;

        if (batchStyle.roughness !== undefined) {
            if (
                typeof batchStyle.roughness === "object" &&
                "from" in batchStyle.roughness &&
                "to" in batchStyle.roughness
            ) {
                const roughnessTransition = batchStyle.roughness as TransitionValue<number>;
                startRoughness = roughnessTransition.from;
                endRoughness = roughnessTransition.to;
                hasRoughnessTransition = true;
            } else if (typeof batchStyle.roughness === "number") {
                startRoughness = batchStyle.roughness;
                endRoughness = startRoughness;
            }
        }

        // Process emissive
        let startEmissive: THREE.Color = this.emissive.clone().multiplyScalar(this.emissiveIntensity);
        let endEmissive: THREE.Color = this.emissive.clone().multiplyScalar(this.emissiveIntensity);
        let hasEmissiveTransition: boolean = false;

        if (batchStyle.emissive !== undefined) {
            if (
                typeof batchStyle.emissive === "object" &&
                "from" in batchStyle.emissive &&
                "to" in batchStyle.emissive
            ) {
                const emissiveTransition = batchStyle.emissive as TransitionValue<string | number>;
                startEmissive = new THREE.Color(emissiveTransition.from as string | number);
                endEmissive = new THREE.Color(emissiveTransition.to as string | number);
                hasEmissiveTransition = true;
            } else if (typeof batchStyle.emissive === "string") {
                startEmissive = new THREE.Color(batchStyle.emissive);
                endEmissive = startEmissive.clone();
            } else if (typeof batchStyle.emissive === "number") {
                startEmissive = new THREE.Color(batchStyle.emissive);
                endEmissive = startEmissive.clone();
            }
        }

        // Process animation properties - if useAnimation is false, don't apply transition animations
        const useAnimation: boolean = batchStyle.useAnimation !== false; // true or undefined both mean respond to animation

        // Get current value from animation manager
        const currentValue = batchStyle.value !== undefined ?
            batchStyle.value : this._animationManager.getBatchProgress(batchId);

        return {
            startColor: finalStartColor.clone(),
            endColor: finalEndColor.clone(),
            startOffset: startOffset.clone(),
            endOffset: endOffset.clone(),
            startOpacity,
            endOpacity,
            startMetalness,
            endMetalness,
            startRoughness,
            endRoughness,
            startEmissive: startEmissive.clone(),
            endEmissive: endEmissive.clone(),
            visible: batchStyle.visible !== false,
            hasTransition: useAnimation
                ? hasColorTransition || hasOpacityTransition || hasOffsetTransition
                : false,
            hasMaterialTransition: useAnimation
                ? hasMetalnessTransition || hasRoughnessTransition || hasEmissiveTransition
                : false,
            value: currentValue
        };
    }

    /**
     * Check if object is a THREE.Vector3 instance
     */
    private _isVector3(obj: any): obj is THREE.Vector3 {
        return obj && typeof obj === "object" && "x" in obj && "y" in obj && "z" in obj;
    }

    /**
     * Create default style
     */
    private _createDefaultStyle(): ExtendedBatchStyle {
        return {
            visible: true,
            color: "#ffffff",
            opacity: 1,
            metalness: 0,
            roughness: 1,
            emissive: "#000000",
            value: 0
        };
    }

    /**
     * Clean up resources
     */
    dispose(): void {
        if (this._styleTexture) {
            this._styleTexture.dispose();
            this._styleTexture = null;
        }

        // Clean up animation texture
        if (this.uniforms.animationTexture.value) {
            this.uniforms.animationTexture.value.dispose();
            this.uniforms.animationTexture.value = null;
        }

        super.dispose();
    }
}

export { B3DMBatchMaterial };