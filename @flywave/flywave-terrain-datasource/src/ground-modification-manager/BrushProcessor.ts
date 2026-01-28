/* Copyright (C) 2025 flywave.gl contributors */

import type { GeoBox, GeoCoordinates } from "@flywave/flywave-geoutils";
import * as THREE from "three";

import type { BrushOperation, BrushSettings, BrushType } from "./BrushTypes";
import type { RenderEnvironment } from "../terrain-processor/core/RenderEnvironment";

class NoiseGenerator {
    private seed: number;

    constructor(seed: number = 1) {
        this.seed = seed;
    }

    private random(): number {
        this.seed = (this.seed * 9301 + 49297) % 233280;
        return this.seed / 233280;
    }

    public perlinNoise(x: number, y: number, scale: number = 1): number {
        const scaledX = x / scale;
        const scaledY = y / scale;

        const gridX = Math.floor(scaledX);
        const gridY = Math.floor(scaledY);

        const fracX = scaledX - gridX;
        const fracY = scaledY - gridY;

        const u = this.fade(fracX);
        const v = this.fade(fracY);

        const a = this.hash(gridX, gridY);
        const b = this.hash(gridX + 1, gridY);
        const c = this.hash(gridX, gridY + 1);
        const d = this.hash(gridX + 1, gridY + 1);

        return this.lerp(this.lerp(a, b, u), this.lerp(c, d, u), v);
    }

    private fade(t: number): number {
        return t * t * t * (t * (t * 6 - 15) + 10);
    }

    private lerp(a: number, b: number, t: number): number {
        return a + t * (b - a);
    }

    private hash(x: number, y: number): number {
        const hash = x * 12.9898 + y * 78.233;
        return Math.abs(Math.sin(hash) * 43758.5453) % 1;
    }
}

export class BrushProcessor {
    private environment?: RenderEnvironment;
    private ownedRenderer?: THREE.WebGLRenderer;
    private noiseGen: NoiseGenerator;

    constructor(environment?: RenderEnvironment) {
        this.environment = environment;
        this.noiseGen = new NoiseGenerator(1);
    }

    public applyBrushOperationsToTexture(
        operations: BrushOperation[],
        tileGeoBox: GeoBox,
        width: number,
        height: number,
        baseTexture: THREE.Texture
    ): THREE.WebGLRenderTarget {
        const renderer = this.getRenderer();
        const renderTarget = new THREE.WebGLRenderTarget(width, height, {
            minFilter: THREE.LinearFilter,
            magFilter: THREE.LinearFilter,
            format: THREE.RGBAFormat,
            type: THREE.FloatType
        });

        const geometry = new THREE.PlaneGeometry(width, height);
        const material = this.createBrushMaterial(
            operations,
            tileGeoBox,
            baseTexture,
            width,
            height
        );
        const mesh = new THREE.Mesh(geometry, material);

        const scene = new THREE.Scene();
        scene.add(mesh);

        const camera = new THREE.OrthographicCamera(0, width, 0, height, 0.1, 100);
        camera.position.set(0, 0, 1);
        camera.lookAt(0, 0, 0);

        if (this.environment) {
            const originalRenderTarget = renderer.getRenderTarget();
            renderer.setRenderTarget(renderTarget);
            renderer.render(scene, camera);
            renderer.setRenderTarget(originalRenderTarget);
        } else {
            renderer.setRenderTarget(renderTarget);
            renderer.render(scene, camera);
        }

        geometry.dispose();
        material.dispose();
        scene.remove(mesh);

        return renderTarget;
    }

    private createBrushMaterial(
        operations: BrushOperation[],
        tileGeoBox: GeoBox,
        baseTexture: THREE.Texture,
        width: number,
        height: number
    ): THREE.ShaderMaterial {
        const brushData = this.prepareBrushData(operations, tileGeoBox, width, height);

        const vertexShader = `
            precision highp float;
            precision highp int;

            uniform mat4 modelViewMatrix;
            uniform mat4 projectionMatrix;

            in vec3 position;
            in vec2 uv;
            out vec2 vUv;

            void main() {
                gl_Position = projectionMatrix * modelViewMatrix * vec4(position.xy, 0.0, 1.0);
                vUv = uv;
            }
        `;

        const fragmentShader = `
            precision highp float;
            precision highp int;

            const int MAX_BRUSHES = ${operations.length};

            uniform vec2 u_tileMin;
            uniform vec2 u_tileMax;
            uniform sampler2D u_baseTexture;
            
            uniform vec2 u_brushPositions[MAX_BRUSHES];
            uniform float u_brushSizes[MAX_BRUSHES];
            uniform float u_brushStrengths[MAX_BRUSHES];
            uniform float u_brushHardness[MAX_BRUSHES];
            uniform int u_brushTypes[MAX_BRUSHES];
            uniform float u_flattenTargets[MAX_BRUSHES];
            uniform float u_noiseScales[MAX_BRUSHES];
            uniform float u_noisePersistences[MAX_BRUSHES];

            out vec4 fragColor;
            in vec2 vUv;

            float unpackAltitudeFromColor(vec4 v) {
                vec4 uDemUnpack = vec4(6553.6, 25.6, 0.1, 10000.0);
                return dot(vec4(v.xyz * 255.0, -1.0), uDemUnpack);
            }

            float hash(vec2 p) {
                p = 50.0 * fract(p * 0.3183099 + vec2(0.71, 0.113));
                return -1.0 + 2.0 * fract(p.x * p.y * (p.x + p.y));
            }

            float noise(vec2 p, float scale) {
                vec2 i = floor(p * scale);
                vec2 f = fract(p * scale);
                vec2 u = f * f * (3.0 - 2.0 * f);
                return mix(mix(hash(i + vec2(0.0, 0.0)), hash(i + vec2(1.0, 0.0)), u.x),
                           mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x), u.y);
            }

            float calculateBrushWeight(float distance, float size, float hardness) {
                float normalizedDistance = distance / (size * 0.5);
                if (normalizedDistance >= 1.0) return 0.0;
                
                float softness = 0.2 + (1.0 - hardness) * 0.8;
                float weight = 1.0 - (normalizedDistance / softness);
                weight = clamp(weight, 0.0, 1.0);
                weight = weight * weight * (3.0 - 2.0 * weight);
                
                return weight;
            }

            float applySmooth(vec2 uv, float radius, sampler2D texture) {
                float sum = 0.0;
                float count = 0.0;
                float texelSize = 1.0 / ${width.toFixed(1)};
                
                for (float dy = -3.0; dy <= 3.0; dy += 1.0) {
                    for (float dx = -3.0; dx <= 3.0; dx += 1.0) {
                        vec2 offset = vec2(dx, dy) * texelSize;
                        vec4 color = texture(texture, uv + offset);
                        sum += unpackAltitudeFromColor(color);
                        count += 1.0;
                    }
                }
                
                return sum / count;
            }

            float applyErosion(vec2 uv, float radius, sampler2D texture) {
                float sum = 0.0;
                float count = 0.0;
                float texelSize = 1.0 / ${width.toFixed(1)};
                
                for (float dy = -1.0; dy <= 1.0; dy += 1.0) {
                    for (float dx = -1.0; dx <= 1.0; dx += 1.0) {
                        if (abs(dx) + abs(dy) > 0.0) {
                            vec2 offset = vec2(dx, dy) * texelSize;
                            vec4 color = texture(texture, uv + offset);
                            sum += unpackAltitudeFromColor(color);
                            count += 1.0;
                        }
                    }
                }
                
                return sum / count;
            }

            vec4 packAltitudeToColor(float altitude) {
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

            void main() {
                vec2 worldPos = mix(u_tileMin, u_tileMax, vUv);
                vec2 worldSize = u_tileMax - u_tileMin;
                vec2 texPos = (worldPos - u_tileMin) / worldSize;
                
                vec4 baseColor = texture(u_baseTexture, vec2(vUv.x, 1.0 - vUv.y));
                float baseHeight = unpackAltitudeFromColor(baseColor);
                float height = baseHeight;
                
                for (int i = 0; i < MAX_BRUSHES; i++) {
                    vec2 brushPos = u_brushPositions[i];
                    float size = u_brushSizes[i];
                    float strength = u_brushStrengths[i];
                    float hardness = u_brushHardness[i];
                    int type = u_brushTypes[i];
                    
                    float distance = length(worldPos - brushPos);
                    float weight = calculateBrushWeight(distance, size, hardness);
                    
                    if (weight > 0.001) {
                        if (type == 0) { // raise
                            height += weight * strength;
                        } else if (type == 1) { // lower
                            height -= weight * strength;
                        } else if (type == 2) { // smooth
                            float avgHeight = applySmooth(vUv, size, u_baseTexture);
                            height = mix(height, avgHeight, weight * strength);
                        } else if (type == 3) { // flatten
                            float targetHeight = u_flattenTargets[i];
                            height = mix(height, targetHeight, weight * strength);
                        } else if (type == 4) { // noise
                            float noiseVal = noise(vUv, u_noiseScales[i]);
                            float adjustedNoise = (noiseVal - 0.5) * 2.0 * u_noisePersistences[i];
                            height += weight * strength * adjustedNoise;
                        } else if (type == 5) { // erode
                            float avgHeight = applyErosion(vUv, size, u_baseTexture);
                            if (height > avgHeight) {
                                height -= weight * strength * (height - avgHeight);
                            } else {
                                height += weight * strength * (avgHeight - height);
                            }
                        }
                    }
                }
                
                fragColor = packAltitudeToColor(height);
            }
        `;

        const material = new THREE.ShaderMaterial({
            vertexShader,
            fragmentShader,
            uniforms: {
                u_tileMin: {
                    value: new THREE.Vector2(
                        tileGeoBox.southWest.longitude,
                        tileGeoBox.southWest.latitude
                    )
                },
                u_tileMax: {
                    value: new THREE.Vector2(
                        tileGeoBox.northEast.longitude,
                        tileGeoBox.northEast.latitude
                    )
                },
                u_baseTexture: { value: baseTexture },
                u_brushPositions: { value: brushData.positions },
                u_brushSizes: { value: brushData.sizes },
                u_brushStrengths: { value: brushData.strengths },
                u_brushHardness: { value: brushData.hardness },
                u_brushTypes: { value: brushData.types },
                u_flattenTargets: { value: brushData.flattenTargets },
                u_noiseScales: { value: brushData.noiseScales },
                u_noisePersistences: { value: brushData.noisePersistences }
            }
        });

        return material;
    }

    private prepareBrushData(
        operations: BrushOperation[],
        tileGeoBox: GeoBox,
        width: number,
        height: number
    ): {
        positions: Float32Array;
        sizes: Float32Array;
        strengths: Float32Array;
        hardness: Float32Array;
        types: Float32Array;
        flattenTargets: Float32Array;
        noiseScales: Float32Array;
        noisePersistences: Float32Array;
    } {
        const maxBrushes = operations.length;
        const positions = new Float32Array(maxBrushes * 2);
        const sizes = new Float32Array(maxBrushes);
        const strengths = new Float32Array(maxBrushes);
        const hardness = new Float32Array(maxBrushes);
        const types = new Float32Array(maxBrushes);
        const flattenTargets = new Float32Array(maxBrushes);
        const noiseScales = new Float32Array(maxBrushes);
        const noisePersistences = new Float32Array(maxBrushes);

        for (let i = 0; i < operations.length; i++) {
            const op = operations[i];
            positions[i * 2] = op.position.lng;
            positions[i * 2 + 1] = op.position.lat;
            sizes[i] = op.settings.size;
            strengths[i] = op.settings.strength;
            hardness[i] = op.settings.hardness;
            types[i] = this.brushTypeToInt(op.settings.type);
            flattenTargets[i] = op.settings.flattenTargetHeight ?? 0.5;
            noiseScales[i] = op.settings.noiseScale ?? 10.0;
            noisePersistences[i] = op.settings.noisePersistence ?? 0.5;
        }

        return {
            positions,
            sizes,
            strengths,
            hardness,
            types,
            flattenTargets,
            noiseScales,
            noisePersistences
        };
    }

    private brushTypeToInt(type: BrushType): number {
        switch (type) {
            case "raise":
                return 0;
            case "lower":
                return 1;
            case "smooth":
                return 2;
            case "flatten":
                return 3;
            case "noise":
                return 4;
            case "erode":
                return 5;
            default:
                return 0;
        }
    }

    private getRenderer(): THREE.WebGLRenderer {
        if (this.environment) {
            return this.environment.getRenderer();
        }
        if (!this.ownedRenderer) {
            const canvas = new OffscreenCanvas(512, 512);
            this.ownedRenderer = new THREE.WebGLRenderer({
                canvas: canvas,
                antialias: false,
                alpha: false,
                preserveDrawingBuffer: true
            });
        }
        return this.ownedRenderer;
    }

    public dispose(): void {
        if (this.ownedRenderer) {
            this.ownedRenderer.dispose();
            this.ownedRenderer = undefined;
        }
    }
}
