/* Copyright (C) 2025 flywave.gl contributors */

import { GeoBox, GeoCoordinates } from "@flywave/flywave-geoutils";
import { CoordinateUtils } from "../utils/coordinate-utils";
import * as THREE from "three";
import { type HeightMapModifier } from "../../ground-modification-manager/HeightMapModifierTypes";
import { GROUND_MODIFICATION_HEIGHT, GROUND_MODIFICATION_WIDTH } from "../constants";
import { type RenderEnvironment, getGlobalRenderEnvironment } from "../core/RenderEnvironment";
import { type GroundModificationResult, type RenderOptions } from "../core/types";

const MODIFIERS_PER_PASS = 4;

interface ModifierTextureData {
    texture: THREE.DataTexture;
    geoBox: GeoBox;
    enabled: boolean;
}

export class GroundModificationProcessor {
    private environment?: RenderEnvironment;
    private textureCache = new Map<string, THREE.DataTexture>();

    constructor(environment?: RenderEnvironment) {
        this.environment = environment;
    }

    async renderHeightMap(
        enabledModifiers: HeightMapModifier[],
        tileGeoBox: GeoBox,
        baseDemTexture: THREE.Texture | undefined,
        options: RenderOptions = {}
    ): Promise<GroundModificationResult | undefined> {
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
            renderEnv.setupCamera(0, width, height, 0);
        } else {
            renderEnv.setupCamera(0, width, 0, height);
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
                enabled: modifier.enabled
            });
        }

        return results;
    }

    private async getModifierTexture(modifier: HeightMapModifier): Promise<THREE.DataTexture> {
        const cacheKey = `${modifier.id}`;

        if (this.textureCache.has(cacheKey)) {
            return this.textureCache.get(cacheKey)!;
        }

        let width: number;
        let height: number;
        let data: Uint8Array | Uint8ClampedArray;

        if (modifier.source.type === "image") {
            ({ data, width, height } = await this.extractImageData(modifier.source.image));
        } else if (modifier.source.type === "data") {
            const sourceData = modifier.source.data;
            width = modifier.source.width;
            height = modifier.source.height;

            if (sourceData instanceof Uint8Array) {
                data = sourceData;
            } else if (sourceData instanceof Float32Array) {
                data = this.encodeMapboxRGB(sourceData, width, height);
            } else {
                throw new Error(`Unsupported data type`);
            }
        } else {
            throw new Error(`Unsupported source type: ${modifier.source.type}`);
        }

        const texture = new THREE.DataTexture(
            data,
            width,
            height,
            THREE.RGBAFormat,
            THREE.UnsignedByteType
        );
        texture.needsUpdate = true;

        this.textureCache.set(cacheKey, texture);

        return texture;
    }

    private encodeMapboxRGB(heightData: Float32Array, width: number, height: number): Uint8Array {
        const data = new Uint8Array(width * height * 4);
        for (let i = 0; i < width * height; i++) {
            const height = heightData[i];
            const [r, g, b, a] = this.encodeMapboxHeight(height);
            data[i * 4] = r;
            data[i * 4 + 1] = g;
            data[i * 4 + 2] = b;
            data[i * 4 + 3] = a;
        }
        return data;
    }

    private encodeMapboxHeight(height: number): [number, number, number, number] {
        const vector = [6553.6, 25.6, 0.1, 10000.0];
        let v = Math.floor((height + vector[3]) / vector[2]);
        const b = v % 256;
        v = Math.floor(v / 256);
        const g = v % 256;
        v = Math.floor(v / 256);
        const r = v;
        return [r, g, b, 255];
    }

    private async extractImageData(
        image: ImageData | HTMLImageElement | HTMLCanvasElement | ImageBitmap
    ): Promise<{ data: Uint8ClampedArray; width: number; height: number }> {
        let imageData: ImageData;

        if (image instanceof ImageData) {
            imageData = image;
        } else {
            const canvas = new OffscreenCanvas(image.width, image.height);
            const ctx = canvas.getContext("2d")!;
            ctx.drawImage(image as any, 0, 0);
            imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
        }

        return { data: imageData.data, width: imageData.width, height: imageData.height };
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
            // 使用 tileGeoBox 创建空的 modifier，确保坐标系统一致
            paddedModifiers.push({
                texture: this.createEmptyTexture(),
                geoBox: tileGeoBox,
                enabled: false
            });
        }

        const m0 = paddedModifiers[0];
        const m1 = paddedModifiers[1];
        const m2 = paddedModifiers[2];
        const m3 = paddedModifiers[3];

        const uvBounds0 = m0.enabled
            ? this.geoBoxToUVBounds(m0.geoBox, tileGeoBox, width, height)
            : new THREE.Vector4();
        const uvBounds1 = m1.enabled
            ? this.geoBoxToUVBounds(m1.geoBox, tileGeoBox, width, height)
            : new THREE.Vector4();
        const uvBounds2 = m2.enabled
            ? this.geoBoxToUVBounds(m2.geoBox, tileGeoBox, width, height)
            : new THREE.Vector4();
        const uvBounds3 = m3.enabled
            ? this.geoBoxToUVBounds(m3.geoBox, tileGeoBox, width, height)
            : new THREE.Vector4();

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

            void main() {
                vec4 baseColor = texture2D(u_baseTexture, vUv);
                float height = unpackAltitude(baseColor);
                vec4 uvBounds[4];
                uvBounds[0] = u_uvBounds0;
                uvBounds[1] = u_uvBounds1;
                uvBounds[2] = u_uvBounds2;
                uvBounds[3] = u_uvBounds3;

                for (int i = 0; i < 4; i++) {
                    if (!isInUVBounds(vUv, uvBounds[i])) continue;

                    vec2 modUV = tileUVToModifierUV(vUv, uvBounds[i]);
                    
                    vec4 modifierColor;
                    if (i == 0) modifierColor = texture2D(u_tex0, modUV);
                    else if (i == 1) modifierColor = texture2D(u_tex1, modUV);
                    else if (i == 2) modifierColor = texture2D(u_tex2, modUV);
                    else modifierColor = texture2D(u_tex3, modUV);
                    
                    float deltaHeight = unpackAltitude(modifierColor);

                    height = height + deltaHeight;
                }

                gl_FragColor = packAltitude(height);
            }
        `;

        const uniforms = {
            u_baseTexture: { value: baseTexture },
            u_tex0: { value: m0.texture },
            u_tex1: { value: m1.texture },
            u_tex2: { value: m2.texture },
            u_tex3: { value: m3.texture },
            u_uvBounds0: { value: uvBounds0 },
            u_uvBounds1: { value: uvBounds1 },
            u_uvBounds2: { value: uvBounds2 },
            u_uvBounds3: { value: uvBounds3 }
        };

        return new THREE.ShaderMaterial({
            vertexShader,
            fragmentShader,
            side: THREE.DoubleSide,
            uniforms
        });
    }

    private geoBoxToUVBounds(
        geoBox: GeoBox,
        tileGeoBox: GeoBox,
        width: number,
        height: number
    ): THREE.Vector4 {
        const southWest = CoordinateUtils.geoToTileSpace(
            geoBox.southWest,
            tileGeoBox,
            width,
            height
        );
        const northEast = CoordinateUtils.geoToTileSpace(
            geoBox.northEast,
            tileGeoBox,
            width,
            height
        );

        const uMin = southWest.x / width;
        const uMax = northEast.x / width;
        const vMin = northEast.y / height;
        const vMax = southWest.y / height;

        return new THREE.Vector4(uMin, vMin, uMax, vMax);
    }

    private createEmptyTexture(): THREE.DataTexture {
        const size = 1;
        // 编码高度 0 为 RGB
        const vector = [6553.6, 25.6, 0.1, 10000.0];
        let v = Math.floor((0 + vector[3]) / vector[2]);
        const b = v % 256;
        v = Math.floor(v / 256);
        const g = v % 256;
        v = Math.floor(v / 256);
        const r = v;
        const data = new Uint8Array([r, g, b, 255]);
        return new THREE.DataTexture(data, size, size, THREE.RGBAFormat, THREE.UnsignedByteType);
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
