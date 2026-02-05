/* Copyright (C) 2025 flywave.gl contributors */

import { GeoBox, GeoCoordinates } from "@flywave/flywave-geoutils";
import { CoordinateUtils } from "../utils/coordinate-utils";
import * as THREE from "three";
import {
    HeightMapBlendMode,
    type HeightMapModifier
} from "../../ground-modification-manager/HeightMapModifierTypes";
import { GROUND_MODIFICATION_HEIGHT, GROUND_MODIFICATION_WIDTH } from "../constants";
import { type RenderEnvironment, getGlobalRenderEnvironment } from "../core/RenderEnvironment";
import { type GroundModificationResult, type RenderOptions } from "../core/types";

const MODIFIERS_PER_PASS = 4;

interface ModifierTextureData {
    texture: THREE.DataTexture;
    geoBox: GeoBox;
    blendMode: HeightMapBlendMode;
    opacity: number;
    enabled: boolean;
    heightScale?: { min: number; max: number };
}

export class GroundModificationProcessor {
    private environment?: RenderEnvironment;
    private textureCache = new Map<string, THREE.DataTexture>();

    constructor(environment?: RenderEnvironment) {
        this.environment = environment;
    }

    async renderHeightMap(
        modifiers: HeightMapModifier[],
        tileGeoBox: GeoBox,
        baseDemTexture: THREE.Texture | undefined,
        options: RenderOptions = {}
    ): Promise<GroundModificationResult | undefined> {
        const enabledModifiers = modifiers.filter(
            m => m.enabled && m.geoBox.intersectsBox(tileGeoBox)
        );

        if (enabledModifiers.length === 0) {
            return undefined;
        }

        let {
            width = GROUND_MODIFICATION_WIDTH,
            height = GROUND_MODIFICATION_HEIGHT,
            flipY = true
        } = options;

        if (baseDemTexture?.image) {
            width = baseDemTexture.image.width;
            height = baseDemTexture.image.height;
        }

        const renderEnv = this.environment || getGlobalRenderEnvironment();

        if (flipY) {
            renderEnv.setupCamera(0, width, 0, height);
        } else {
            renderEnv.setupCamera(0, width, height, 0);
        }

        let currentTexture = baseDemTexture || this.createEmptyTexture();
        let finalImageData: ImageData;
        currentTexture.needsUpdate = true;
        for (let i = 0; i < enabledModifiers.length; i += MODIFIERS_PER_PASS) {
            const batch = enabledModifiers.slice(i, i + MODIFIERS_PER_PASS);
            const batchTextures = await this.prepareModifierTextures(batch, width, height);

            renderEnv.clearScene();

            const geometry = new THREE.PlaneGeometry(width, height);
            geometry.translate(width / 2, height / 2, 0);

            const material = this.createBatchMaterial(
                currentTexture,
                batchTextures,
                tileGeoBox,
                width,
                height
            );

            const mesh = new THREE.Mesh(geometry, material);
            renderEnv.getScene().add(mesh);

            const data = renderEnv.render(width, height);
            finalImageData = new ImageData(data, width, height);

            currentTexture = new THREE.DataTexture(
                finalImageData.data,
                width,
                height,
                THREE.RGBAFormat,
                THREE.UnsignedByteType
            );
            currentTexture.needsUpdate = true;
            currentTexture.flipY = true;

            material.dispose();
            geometry.dispose();
            renderEnv.getScene().remove(mesh);
        }

        return { image: finalImageData };
    }

    private async prepareModifierTextures(
        modifiers: HeightMapModifier[],
        targetWidth: number,
        targetHeight: number
    ): Promise<ModifierTextureData[]> {
        const results: ModifierTextureData[] = [];

        for (const modifier of modifiers) {
            const texture = await this.getModifierTexture(modifier);
            results.push({
                texture,
                geoBox: modifier.geoBox,
                blendMode: modifier.blendMode,
                opacity: modifier.opacity,
                enabled: modifier.enabled,
                heightScale: modifier.heightScale
            });
        }

        return results;
    }

    private async getModifierTexture(modifier: HeightMapModifier): Promise<THREE.DataTexture> {
        const cacheKey = `${modifier.id}`;

        if (this.textureCache.has(cacheKey)) {
            return this.textureCache.get(cacheKey)!;
        }

        let data: Float32Array;
        let width: number;
        let height: number;

        if (modifier.source.type === "image") {
            ({ data, width, height } = await this.extractImageData(modifier.source.image));
        } else if (modifier.source.type === "data") {
            const sourceData = modifier.source.data;
            width = modifier.source.width;
            height = modifier.source.height;

            if (sourceData instanceof Uint8Array) {
                data = new Float32Array(sourceData.length);
                for (let i = 0; i < sourceData.length; i++) {
                    data[i] = sourceData[i] / 255.0;
                }
            } else {
                data = sourceData;
            }
        } else {
            throw new Error(`Unsupported source type: ${modifier.source.type}`);
        }

        const texture = new THREE.DataTexture(
            data,
            width,
            height,
            THREE.RedFormat,
            THREE.FloatType
        );
        texture.needsUpdate = true;

        this.textureCache.set(cacheKey, texture);

        return texture;
    }

    private async extractImageData(
        image: ImageData | HTMLImageElement | HTMLCanvasElement
    ): Promise<{ data: Float32Array; width: number; height: number }> {
        let imageData: ImageData;

        if (image instanceof ImageData) {
            imageData = image;
        } else {
            const canvas = new OffscreenCanvas(image.width, image.height);
            const ctx = canvas.getContext("2d")!;
            ctx.drawImage(image as any, 0, 0);
            imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
        }

        const data = new Float32Array(imageData.data.length / 4);

        for (let i = 0; i < data.length; i++) {
            const r = imageData.data[i * 4];
            const g = imageData.data[i * 4 + 1];
            const b = imageData.data[i * 4 + 2];
            data[i] = (r + g + b) / (3 * 255);
        }

        return { data, width: imageData.width, height: imageData.height };
    }

    private createBatchMaterial(
        baseTexture: THREE.Texture,
        modifiers: ModifierTextureData[],
        tileGeoBox: GeoBox,
        width: number,
        height: number
    ): THREE.ShaderMaterial {
        const padding = MODIFIERS_PER_PASS - modifiers.length;

        const paddedModifiers = [...modifiers];
        for (let i = 0; i < padding; i++) {
            paddedModifiers.push({
                texture: this.createEmptyTexture(),
                geoBox: new GeoBox(new GeoCoordinates(0, 0), new GeoCoordinates(0, 0)),
                blendMode: HeightMapBlendMode.ADD,
                opacity: 0,
                enabled: false
            });
        }

        const m0 = paddedModifiers[0];
        const m1 = paddedModifiers[1];
        const m2 = paddedModifiers[2];
        const m3 = paddedModifiers[3];

        const uvBounds0 = this.geoBoxToUVBounds(m0.geoBox, tileGeoBox, width, height);
        const uvBounds1 = this.geoBoxToUVBounds(m1.geoBox, tileGeoBox, width, height);
        const uvBounds2 = this.geoBoxToUVBounds(m2.geoBox, tileGeoBox, width, height);
        const uvBounds3 = this.geoBoxToUVBounds(m3.geoBox, tileGeoBox, width, height);

        const vertexShader = `
            varying vec2 vUv;
            void main() {
                vUv = uv;
                gl_Position = projectionMatrix * modelViewMatrix * vec4(position.xy, 0.0, 1.0);
            }
        `;

        const fragmentShader = `
            precision highp float;
            uniform sampler2D u_baseTexture;
            uniform sampler2D u_tex0;
            uniform sampler2D u_tex1;
            uniform sampler2D u_tex2;
            uniform sampler2D u_tex3;
            uniform vec4 u_uvBounds0;
            uniform vec4 u_uvBounds1;
            uniform vec4 u_uvBounds2;
            uniform vec4 u_uvBounds3;
            uniform float u_opacity0;
            uniform float u_opacity1;
            uniform float u_opacity2;
            uniform float u_opacity3;
            uniform int u_blendMode0;
            uniform int u_blendMode1;
            uniform int u_blendMode2;
            uniform int u_blendMode3;
            uniform vec2 u_heightScale0;
            uniform vec2 u_heightScale1;
            uniform vec2 u_heightScale2;
            uniform vec2 u_heightScale3;
            varying vec2 vUv;

            float unpackAltitude(vec4 v) {
                vec4 uDemUnpack = vec4(6553.6, 25.6, 0.1, 10000.0);
                return dot(vec4(v.xyz * 255.0, -1.0), uDemUnpack);
            }

            vec4 packAltitude(float altitude) {
                vec4 vector = vec4(6553.6, 25.6, 0.1, 10000.0);
                vec4 color = vec4(0.0, 0.0, 0.0, 255.0);
                float v = floor((altitude + vector.w) / vector.z);
                color.b = mod(v, 256.0);
                v = floor(v / 256.0);
                color.g = mod(v, 256.0);
                v = floor(v / 256.0);
                color.r = v;
                return color / 255.0;
            }

            bool isInUVBounds(vec2 uv, vec4 bounds) {
                return uv.x >= bounds.x && uv.x <= bounds.z &&
                       uv.y >= bounds.y && uv.y <= bounds.w;
            }

            vec2 tileUVToModifierUV(vec2 tileUV, vec4 uvBounds) {
                vec2 size = uvBounds.zw - uvBounds.xy;
                return (tileUV - uvBounds.xy) / size;
            }

            float blend(float base, float mod, int mode, float opacity) {
                if (mode == 0) return base + mod * opacity;
                if (mode == 1) return base - mod * opacity;
                if (mode == 2) return base * (1.0 - (1.0 - mod) * opacity);
                if (mode == 3) return mod > 0.001 ? base / (mod * opacity + 0.001) : base;
                if (mode == 4) return min(base, mod * opacity);
                if (mode == 5) return max(base, mod * opacity);
                if (mode == 6) return mod;
                if (mode == 7) return mix(base, mod, opacity * 0.5);
                if (mode == 8) return abs(base - mod * opacity);
                if (mode == 9) return 1.0 - (1.0 - base) * (1.0 - mod * opacity);
                if (mode == 10) {
                    float a = base;
                    float b = mod * opacity;
                    return a < 0.5 ? 2.0 * a * b : 1.0 - 2.0 * (1.0 - a) * (1.0 - b);
                }
                return base + mod * opacity;
            }

            void main() {
                vec4 baseColor = texture2D(u_baseTexture, vUv);
                float height = unpackAltitude(baseColor); 
                vec4 uvBounds[4];
                uvBounds[0] = u_uvBounds0;
                uvBounds[1] = u_uvBounds1;
                uvBounds[2] = u_uvBounds2;
                uvBounds[3] = u_uvBounds3;

                float opacities[4];
                opacities[0] = u_opacity0;
                opacities[1] = u_opacity1;
                opacities[2] = u_opacity2;
                opacities[3] = u_opacity3;

                int blendModes[4];
                blendModes[0] = u_blendMode0;
                blendModes[1] = u_blendMode1;
                blendModes[2] = u_blendMode2;
                blendModes[3] = u_blendMode3;

                vec2 heightScales[4];
                heightScales[0] = u_heightScale0;
                heightScales[1] = u_heightScale1;
                heightScales[2] = u_heightScale2;
                heightScales[3] = u_heightScale3;

                for (int i = 0; i < 4; i++) {
                    if (opacities[i] <= 0.0) continue;
                    if (!isInUVBounds(vUv, uvBounds[i])) continue;

                    vec2 modUV = tileUVToModifierUV(vUv, uvBounds[i]);
                    
                    float modification;
                    if (i == 0) modification = texture2D(u_tex0, modUV).r;
                    else if (i == 1) modification = texture2D(u_tex1, modUV).r;
                    else if (i == 2) modification = texture2D(u_tex2, modUV).r;
                    else modification = texture2D(u_tex3, modUV).r;

                    vec2 heightScale = heightScales[i];
                    if (heightScale.x != 0.0 || heightScale.y != 1.0) {
                        modification = heightScale.x + modification * (heightScale.y - heightScale.x);
                    }

                    float blended = blend(height, modification, blendModes[i], opacities[i]);
                    height = blended;
                }

                gl_FragColor = packAltitude(height);
            }
        `;

        return new THREE.ShaderMaterial({
            vertexShader,
            fragmentShader,
            side: THREE.DoubleSide,
            uniforms: {
                u_baseTexture: { value: baseTexture },
                u_tex0: { value: m0.texture },
                u_tex1: { value: m1.texture },
                u_tex2: { value: m2.texture },
                u_tex3: { value: m3.texture },
                u_uvBounds0: { value: uvBounds0 },
                u_uvBounds1: { value: uvBounds1 },
                u_uvBounds2: { value: uvBounds2 },
                u_uvBounds3: { value: uvBounds3 },
                u_opacity0: { value: m0.opacity },
                u_opacity1: { value: m1.opacity },
                u_opacity2: { value: m2.opacity },
                u_opacity3: { value: m3.opacity },
                u_blendMode0: { value: this.blendModeToNumber(m0.blendMode) },
                u_blendMode1: { value: this.blendModeToNumber(m1.blendMode) },
                u_blendMode2: { value: this.blendModeToNumber(m2.blendMode) },
                u_blendMode3: { value: this.blendModeToNumber(m3.blendMode) },
                u_heightScale0: {
                    value: new THREE.Vector2(m0.heightScale?.min || 0, m0.heightScale?.max || 1)
                },
                u_heightScale1: {
                    value: new THREE.Vector2(m1.heightScale?.min || 0, m1.heightScale?.max || 1)
                },
                u_heightScale2: {
                    value: new THREE.Vector2(m2.heightScale?.min || 0, m2.heightScale?.max || 1)
                },
                u_heightScale3: {
                    value: new THREE.Vector2(m3.heightScale?.min || 0, m3.heightScale?.max || 1)
                }
            }
        });
    }

    private blendModeToNumber(mode: HeightMapBlendMode): number {
        return mode as unknown as number;
    }

    private geoBoxToUVBounds(
        geoBox: GeoBox,
        tileGeoBox: GeoBox,
        width: number,
        height: number
    ): THREE.Vector4 {
        // Calculate normalized UV coordinates directly (0-1 range)
        const lonMin =
            (geoBox.southWest.longitude - tileGeoBox.southWest.longitude) /
            (tileGeoBox.northEast.longitude - tileGeoBox.southWest.longitude);
        const lonMax =
            (geoBox.northEast.longitude - tileGeoBox.southWest.longitude) /
            (tileGeoBox.northEast.longitude - tileGeoBox.southWest.longitude);

        const latMin =
            (geoBox.southWest.latitude - tileGeoBox.southWest.latitude) /
            (tileGeoBox.northEast.latitude - tileGeoBox.southWest.latitude);
        const latMax =
            (geoBox.northEast.latitude - tileGeoBox.southWest.latitude) /
            (tileGeoBox.northEast.latitude - tileGeoBox.southWest.latitude);

        // UV space: (0,1) is top-left, (1,1) is bottom-right
        // Lat increases south to north, so we need to invert Y
        return new THREE.Vector4(lonMin, 1.0 - latMax, lonMax, 1.0 - latMin);
    }

    private createEmptyTexture(): THREE.DataTexture {
        const size = 1;
        const data = new Float32Array([0]);
        return new THREE.DataTexture(data, size, size, THREE.RedFormat, THREE.FloatType);
    }
}

export async function renderGroundModificationHeightMap(
    modifiers: HeightMapModifier[],
    tileGeoBox: GeoBox,
    baseDemTexture: THREE.Texture | undefined,
    width: number = 512,
    height: number = 512,
    flipY: boolean = true,
    environment?: RenderEnvironment
): Promise<GroundModificationResult | undefined> {
    const processor = new GroundModificationProcessor(environment);
    return processor.renderHeightMap(modifiers, tileGeoBox, baseDemTexture, {
        width,
        height,
        flipY
    });
}
