/* Copyright (C) 2025 flywave.gl contributors */
// @ts-nocheck

import {
    type Tile3DBatchMeshTechniqueParams,
    type TransitionValue
} from "@flywave/flywave-datasource-protocol";
import * as THREE from "three";
import { MeshStandardNodeMaterial } from "three/webgpu";
import {
    Fn,
    attribute,
    float,
    texture,
    uniform,
    vec2,
    vec3,
    vec4,
    varying,
    positionLocal,
    mix,
    clamp,
    greaterThanEqual
} from "three/tsl";

import { type BatchAnimation } from "../TileRenderDataSource";
import { BatchAnimationManager } from "./BatchAnimationManager";

// ====================================================================
// Module-level dummy texture
// ====================================================================

/** Default dummy texture: white with full opacity, zero offset */
const _dummyTex = new THREE.DataTexture(
    new Float32Array([1, 1, 1, 1, 0, 0, 0, 1, 1, 1, 1, 1]),
    1,
    1,
    THREE.RGBAFormat,
    THREE.FloatType
);
_dummyTex.needsUpdate = true;

// ====================================================================
// Module-level shared TSL nodes with onObjectUpdate
// ====================================================================

const _styleTex = texture(_dummyTex);
_styleTex.onObjectUpdate(({ material }) => material.styleTexture);

const _animTex = texture(_dummyTex);
_animTex.onObjectUpdate(({ material }) => material.animationTexture);

const _texW = uniform(1).onObjectUpdate(({ material }) => material.textureWidth);
const _texH = uniform(1).onObjectUpdate(({ material }) => material.textureHeight);
const _animTexW = uniform(1).onObjectUpdate(({ material }) => material.animationTextureWidth);
const _animTexH = uniform(1).onObjectUpdate(({ material }) => material.animationTextureHeight);

// ====================================================================
// Shared shader nodes (built once, reused by all instances)
// ====================================================================

const vBatchColor = varying(vec3(1), "vBatchColor");
const vBatchOpacity = varying(float(1), "vBatchOpacity");
const vBatchMetalness = varying(float(0), "vBatchMetalness");
const vBatchRoughness = varying(float(1), "vBatchRoughness");
const vBatchEmissive = varying(vec3(0), "vBatchEmissive");
const vBatchVisible = varying(float(1), "vBatchVisible");

const batchOffsetNode = Fn(() => {
    const batchId = attribute("_BATCHID").round();

    const animU = float(0.5).div(_animTexW);
    const animV = batchId.add(0.5).div(_animTexH);
    const progress = texture(_animTex, vec2(animU, animV)).r;

    const v = batchId.add(0.5).div(_texH);

    const col0 = texture(_styleTex, vec2(float(0.5).div(_texW), v));
    const col1 = texture(_styleTex, vec2(float(1.5).div(_texW), v));
    const col2 = texture(_styleTex, vec2(float(2.5).div(_texW), v));
    const col3 = texture(_styleTex, vec2(float(3.5).div(_texW), v));
    const col4 = texture(_styleTex, vec2(float(4.5).div(_texW), v));
    const col5 = texture(_styleTex, vec2(float(5.5).div(_texW), v));
    const col6 = texture(_styleTex, vec2(float(6.5).div(_texW), v));

    const startColor = col0.rgb;
    const startOpacity = col0.a;
    const startOffset = col1.xyz;
    const endOffsetX = col1.w;
    const endOffsetYZ = col2.xy;
    const endOpacity = col2.z;
    const visible = col2.w;
    const endColor = col3.rgb;
    const hasTransition = col3.a;
    const startMetalness = col4.r;
    const startRoughness = col4.g;
    const endMetalness = col4.b;
    const endRoughness = col4.a;
    const startEmissive = col5.rgb;
    const endEmissive = col6.rgb;

    const endOffset = vec3(endOffsetX, endOffsetYZ.x, endOffsetYZ.y);

    const p = clamp(progress, float(0), float(1));
    const tMask = greaterThanEqual(hasTransition, float(0.5)).toFloat();

    const blendedColor = mix(startColor, endColor, p);
    const blendedOffset = mix(startOffset, endOffset, p);
    const blendedOpacity = mix(startOpacity, endOpacity, p);
    const blendedMetalness = mix(startMetalness, endMetalness, p);
    const blendedRoughness = mix(startRoughness, endRoughness, p);
    const blendedEmissive = mix(startEmissive, endEmissive, p);

    const finalColor = mix(startColor, blendedColor, tMask);
    const finalOffset = mix(startOffset, blendedOffset, tMask);
    const finalOpacity = mix(startOpacity, blendedOpacity, tMask);
    const finalMetalness = mix(startMetalness, blendedMetalness, tMask);
    const finalRoughness = mix(startRoughness, blendedRoughness, tMask);
    const finalEmissive = mix(startEmissive, blendedEmissive, tMask);

    vBatchColor.assign(finalColor);
    vBatchOpacity.assign(finalOpacity);
    vBatchMetalness.assign(finalMetalness);
    vBatchRoughness.assign(finalRoughness);
    vBatchEmissive.assign(finalEmissive);
    vBatchVisible.assign(visible);

    return finalOffset;
})();

const _positionNode = positionLocal.add(batchOffsetNode.toVertexStage());
const _colorNode = vec4(vBatchColor, vBatchOpacity);
const _metalnessNode = vBatchMetalness;
const _roughnessNode = vBatchRoughness;
const _emissiveNode = vBatchEmissive;

// ====================================================================
// Types
// ====================================================================

interface ExtendedBatchStyle extends Tile3DBatchMeshTechniqueParams {
    highlighted?: boolean;
    highlightColor?: THREE.Color;
    visible?: boolean;
}

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
    value: number;
}

// ====================================================================
// B3DMBatchMaterial
// ====================================================================

/**
 * Batch material for B3DM (Batched 3D Model) rendering with per-batch styling.
 *
 * Uses module-level shared TSL nodes with onObjectUpdate to ensure the shader
 * is compiled only once regardless of how many material instances exist.
 * Per-instance data (style texture, animation texture, dimensions) is read
 * from public properties at render time.
 */
class B3DMBatchMaterial extends MeshStandardNodeMaterial {
    private _batchStyles: Map<number, ExtendedBatchStyle> = new Map();
    private _styleTexture: THREE.DataTexture | null = null;
    private _animationTexture: THREE.DataTexture | null = null;
    private readonly _animationManager: BatchAnimationManager;

    // --- Properties read by onObjectUpdate callbacks ---
    public styleTexture: THREE.Texture = _dummyTex;
    public animationTexture: THREE.Texture = _dummyTex;
    public textureWidth: number = 1;
    public textureHeight: number = 1;
    public animationTextureWidth: number = 1;
    public animationTextureHeight: number = 1;

    constructor(
        params: {
            materialParams?: ConstructorParameters<typeof MeshStandardNodeMaterial>[0];
            batchIdAttributeName?: string;
            animation?: BatchAnimation;
        } = {}
    ) {
        const { materialParams = {}, animation } = params;
        super(materialParams);
        this._animationManager = new BatchAnimationManager(animation);

        this.positionNode = _positionNode;
        this.colorNode = _colorNode;
        this.metalnessNode = _metalnessNode;
        this.roughnessNode = _roughnessNode;
        this.emissiveNode = _emissiveNode;
    }

    setBatchStyle(batchId: number, style: ExtendedBatchStyle): void {
        const currentStyle = this._batchStyles.get(batchId);
        const styleChanged = this._hasStyleChanged(currentStyle, style);

        if (styleChanged) {
            this._batchStyles.set(batchId, { ...style });
            this._updateStyleTexture();
        }

        if (style.value !== undefined) {
            this._animationManager.ensureBatchState(batchId);
            this._animationManager.setBatchProgress(batchId, style.value);
        }
    }

    setBatchStyles(batchStyles: Map<number, ExtendedBatchStyle>): void {
        let needsTextureUpdate = false;

        batchStyles.forEach((newStyle, batchId) => {
            const currentStyle = this._batchStyles.get(batchId);
            if (this._hasStyleChanged(currentStyle, newStyle)) {
                this._batchStyles.set(batchId, { ...newStyle });
                needsTextureUpdate = true;
            }
            if (newStyle.value !== undefined) {
                this._animationManager.ensureBatchState(batchId);
                this._animationManager.setBatchProgress(batchId, newStyle.value);
            }
        });

        if (needsTextureUpdate) {
            this._updateStyleTexture();
        }
    }

    private _hasStyleChanged(
        oldStyle: ExtendedBatchStyle | undefined,
        newStyle: ExtendedBatchStyle
    ): boolean {
        if (!oldStyle && !newStyle) return false;
        if (!oldStyle || !newStyle) return true;
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

    resetBatchStyles(): void {
        this._batchStyles.clear();
        this._animationManager.reset();
        this._updateStyleTexture();
    }

    onBeforeRender(
        renderer: THREE.WebGLRenderer,
        scene: THREE.Scene,
        camera: THREE.Camera,
        geometry: THREE.BufferGeometry,
        object: THREE.Object3D,
        group: THREE.Group
    ): void {
        if (this._animationManager.isPlaying) {
            this._animationManager.update();
            this._updateAnimationTexture();
        }
    }

    private _updateAnimationTexture(): void {
        const batchProgresses = this._animationManager.getBatchProgresses();
        const textureWidth = 1;
        const textureHeight = Math.max(batchProgresses.length, 1);

        const textureData = new Float32Array(textureWidth * textureHeight * 4);
        for (let i = 0; i < batchProgresses.length; i++) {
            const index = i * 4;
            textureData[index] = batchProgresses[i];
            textureData[index + 1] = 0;
            textureData[index + 2] = 0;
            textureData[index + 3] = 1;
        }

        if (
            !this._animationTexture ||
            this._animationTexture.image.width !== textureWidth ||
            this._animationTexture.image.height !== textureHeight
        ) {
            if (this._animationTexture) this._animationTexture.dispose();
            this._animationTexture = new THREE.DataTexture(
                textureData,
                textureWidth,
                textureHeight,
                THREE.RGBAFormat,
                THREE.FloatType
            );
        } else {
            (this._animationTexture.image.data as Float32Array).set(textureData);
        }
        this._animationTexture.needsUpdate = true;

        this.animationTexture = this._animationTexture;
        this.animationTextureWidth = textureWidth;
        this.animationTextureHeight = textureHeight;
    }

    private _updateStyleTexture(): void {
        const batchCount = Math.max(this._batchStyles.size, 1);
        const textureWidth = 7;
        const textureHeight = batchCount;

        const textureData = new Float32Array(textureWidth * textureHeight * 4);

        this._batchStyles.forEach((batchStyle: ExtendedBatchStyle, batchId: number) => {
            const visualStyle: VisualStyle = this._convertToVisualStyle(batchStyle, batchId);
            const row = batchId;

            const colorIndex = row * textureWidth * 4;
            textureData[colorIndex] = visualStyle.startColor.r;
            textureData[colorIndex + 1] = visualStyle.startColor.g;
            textureData[colorIndex + 2] = visualStyle.startColor.b;
            textureData[colorIndex + 3] = visualStyle.startOpacity;

            const offsetIndex = colorIndex + 4;
            textureData[offsetIndex] = visualStyle.startOffset.x;
            textureData[offsetIndex + 1] = visualStyle.startOffset.y;
            textureData[offsetIndex + 2] = visualStyle.startOffset.z;
            textureData[offsetIndex + 3] = visualStyle.endOffset.x;

            const metaIndex = offsetIndex + 4;
            textureData[metaIndex] = visualStyle.endOffset.y;
            textureData[metaIndex + 1] = visualStyle.endOffset.z;
            textureData[metaIndex + 2] = visualStyle.endOpacity;
            textureData[metaIndex + 3] = visualStyle.visible ? 1.0 : 0.0;

            const endIndex = metaIndex + 4;
            textureData[endIndex] = visualStyle.endColor.r;
            textureData[endIndex + 1] = visualStyle.endColor.g;
            textureData[endIndex + 2] = visualStyle.endColor.b;
            textureData[endIndex + 3] = visualStyle.hasTransition ? 1.0 : 0.0;

            const mrIndex = endIndex + 4;
            textureData[mrIndex] = visualStyle.startMetalness;
            textureData[mrIndex + 1] = visualStyle.startRoughness;
            textureData[mrIndex + 2] = visualStyle.endMetalness;
            textureData[mrIndex + 3] = visualStyle.endRoughness;

            const seIndex = mrIndex + 4;
            textureData[seIndex] = visualStyle.startEmissive.r;
            textureData[seIndex + 1] = visualStyle.startEmissive.g;
            textureData[seIndex + 2] = visualStyle.startEmissive.b;
            textureData[seIndex + 3] = visualStyle.hasMaterialTransition ? 1.0 : 0.0;

            const eeIndex = seIndex + 4;
            textureData[eeIndex] = visualStyle.endEmissive.r;
            textureData[eeIndex + 1] = visualStyle.endEmissive.g;
            textureData[eeIndex + 2] = visualStyle.endEmissive.b;
            textureData[eeIndex + 3] = 0.0;
        });

        if (this._styleTexture) this._styleTexture.dispose();

        this._styleTexture = new THREE.DataTexture(
            textureData,
            textureWidth,
            textureHeight,
            THREE.RGBAFormat,
            THREE.FloatType
        );
        this._styleTexture.needsUpdate = true;

        this.styleTexture = this._styleTexture;
        this.textureWidth = textureWidth;
        this.textureHeight = textureHeight;
    }

    private _convertToVisualStyle(batchStyle: ExtendedBatchStyle, batchId: number): VisualStyle {
        let startColor = new THREE.Color(1, 1, 1);
        let endColor = new THREE.Color(1, 1, 1);
        let hasColorTransition = false;

        if (batchStyle.color !== undefined) {
            if (
                typeof batchStyle.color === "object" &&
                "from" in batchStyle.color &&
                "to" in batchStyle.color
            ) {
                const ct = batchStyle.color as TransitionValue<string | number>;
                startColor = new THREE.Color(ct.from as string | number);
                endColor = new THREE.Color(ct.to as string | number);
                hasColorTransition = true;
            } else if (typeof batchStyle.color === "string") {
                startColor = new THREE.Color(batchStyle.color);
                endColor = startColor.clone();
            } else if (typeof batchStyle.color === "number") {
                startColor = new THREE.Color(batchStyle.color);
                endColor = startColor.clone();
            }
        }

        let highlightColor = startColor.clone();
        if (batchStyle.highlightColor) {
            if (batchStyle.highlightColor instanceof THREE.Color)
                highlightColor = batchStyle.highlightColor.clone();
            else if (typeof batchStyle.highlightColor === "string")
                highlightColor = new THREE.Color(batchStyle.highlightColor);
            else if (typeof batchStyle.highlightColor === "number")
                highlightColor = new THREE.Color(batchStyle.highlightColor);
        }

        const finalStartColor = batchStyle.highlighted ? highlightColor : startColor;
        const finalEndColor = batchStyle.highlighted ? highlightColor : endColor;

        let startOpacity = batchStyle.visible !== false ? 1 : 0;
        let endOpacity = startOpacity;
        let hasOpacityTransition = false;

        if (batchStyle.opacity !== undefined) {
            if (
                typeof batchStyle.opacity === "object" &&
                "from" in batchStyle.opacity &&
                "to" in batchStyle.opacity
            ) {
                const ot = batchStyle.opacity as TransitionValue<number>;
                startOpacity = batchStyle.visible !== false ? ot.from : 0;
                endOpacity = batchStyle.visible !== false ? ot.to : 0;
                hasOpacityTransition = true;
            } else if (typeof batchStyle.opacity === "number") {
                startOpacity = batchStyle.visible !== false ? batchStyle.opacity : 0;
                endOpacity = startOpacity;
            }
        }

        let startOffset = new THREE.Vector3();
        let endOffset = new THREE.Vector3();
        let hasOffsetTransition = false;

        if (batchStyle.offset !== undefined) {
            if (
                typeof batchStyle.offset === "object" &&
                "from" in batchStyle.offset &&
                "to" in batchStyle.offset
            ) {
                const ot = batchStyle.offset as TransitionValue<number>;
                startOffset = new THREE.Vector3(0, ot.from, 0);
                endOffset = new THREE.Vector3(0, ot.to, 0);
                hasOffsetTransition = true;
            } else if (typeof batchStyle.offset === "number") {
                startOffset = new THREE.Vector3(0, batchStyle.offset, 0);
                endOffset = startOffset.clone();
            } else if (this._isVector3(batchStyle.offset)) {
                startOffset = batchStyle.offset as THREE.Vector3;
                endOffset = startOffset.clone();
            }
        }

        let startMetalness = this.metalness;
        let endMetalness = this.metalness;
        let hasMetalnessTransition = false;

        if (batchStyle.metalness !== undefined) {
            if (
                typeof batchStyle.metalness === "object" &&
                "from" in batchStyle.metalness &&
                "to" in batchStyle.metalness
            ) {
                const mt = batchStyle.metalness as TransitionValue<number>;
                startMetalness = mt.from;
                endMetalness = mt.to;
                hasMetalnessTransition = true;
            } else if (typeof batchStyle.metalness === "number") {
                startMetalness = batchStyle.metalness;
                endMetalness = startMetalness;
            }
        }

        let startRoughness = this.roughness;
        let endRoughness = this.roughness;
        let hasRoughnessTransition = false;

        if (batchStyle.roughness !== undefined) {
            if (
                typeof batchStyle.roughness === "object" &&
                "from" in batchStyle.roughness &&
                "to" in batchStyle.roughness
            ) {
                const rt = batchStyle.roughness as TransitionValue<number>;
                startRoughness = rt.from;
                endRoughness = rt.to;
                hasRoughnessTransition = true;
            } else if (typeof batchStyle.roughness === "number") {
                startRoughness = batchStyle.roughness;
                endRoughness = startRoughness;
            }
        }

        let startEmissive = this.emissive.clone().multiplyScalar(this.emissiveIntensity);
        let endEmissive = this.emissive.clone().multiplyScalar(this.emissiveIntensity);
        let hasEmissiveTransition = false;

        if (batchStyle.emissive !== undefined) {
            if (
                typeof batchStyle.emissive === "object" &&
                "from" in batchStyle.emissive &&
                "to" in batchStyle.emissive
            ) {
                const et = batchStyle.emissive as TransitionValue<string | number>;
                startEmissive = new THREE.Color(et.from as string | number);
                endEmissive = new THREE.Color(et.to as string | number);
                hasEmissiveTransition = true;
            } else if (typeof batchStyle.emissive === "string") {
                startEmissive = new THREE.Color(batchStyle.emissive);
                endEmissive = startEmissive.clone();
            } else if (typeof batchStyle.emissive === "number") {
                startEmissive = new THREE.Color(batchStyle.emissive);
                endEmissive = startEmissive.clone();
            }
        }

        const useAnimation = batchStyle.useAnimation !== false;
        const currentValue =
            batchStyle.value !== undefined
                ? batchStyle.value
                : this._animationManager.getBatchProgress(batchId);

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

    private _isVector3(obj: any): obj is THREE.Vector3 {
        return obj && typeof obj === "object" && "x" in obj && "y" in obj && "z" in obj;
    }

    dispose(): void {
        if (this._styleTexture) {
            this._styleTexture.dispose();
            this._styleTexture = null;
        }
        if (this._animationTexture) {
            this._animationTexture.dispose();
            this._animationTexture = null;
        }
        super.dispose();
    }
}

export { B3DMBatchMaterial };
