/* Copyright (C) 2025 flywave.gl contributors */

import { type GeoBox } from "@flywave/flywave-geoutils";
import * as THREE from "three";
import { type GroundModificationData } from "../../ground-modification-manager";
import { GROUND_MODIFICATION_HEIGHT, GROUND_MODIFICATION_WIDTH } from "../constants";
import { type RenderEnvironment, getGlobalRenderEnvironment } from "../core/RenderEnvironment";
import { type GroundModificationResult, type RenderOptions } from "../core/types";
import { BrushProcessor } from "../../ground-modification-manager/BrushProcessor";

export class GroundModificationProcessor {
    private environment?: RenderEnvironment;
    private brushProcessor: BrushProcessor;

    constructor(environment?: RenderEnvironment) {
        this.environment = environment;
        this.brushProcessor = new BrushProcessor();
    }

    renderHeightMap(
        modifications: GroundModificationData[],
        tileGeoBox: GeoBox,
        baseDemTexture: THREE.Texture | undefined,
        options: RenderOptions = {}
    ): GroundModificationResult | undefined {
        const allOperations = modifications.flatMap(mod => mod.operations);

        if (allOperations.length === 0) {
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
 

        const brushWeights = this.brushProcessor.applyBrushOperations(
            allOperations,
            tileGeoBox,
            width,
            height
        );

        const brushTexture = this.floatArrayToTexture(brushWeights, width, height);

        const renderEnv = this.environment || getGlobalRenderEnvironment();
        renderEnv.clearScene();

        if (flipY) {
            renderEnv.setupCamera(0, width, 0, height);
        } else {
            renderEnv.setupCamera(0, width, height, 0);
        }

        const geometry = new THREE.PlaneGeometry(width, height);
        geometry.translate(width / 2, height / 2, 0);

        const material = this.createMaterial(baseDemTexture, brushTexture);
        material.side = THREE.DoubleSide;
        const mesh = new THREE.Mesh(geometry, material);

        renderEnv.getScene().add(mesh);

        const data = renderEnv.render(width, height);
        const imageData = new ImageData(data as Uint8ClampedArray<ArrayBuffer>, width, height);
 
        brushTexture.dispose();
        geometry.dispose();
        material.dispose();
        renderEnv.getScene().remove(mesh);

        return { image: imageData };
    }
 
    private floatArrayToTexture(
        weights: Float32Array,
        width: number,
        height: number
    ): THREE.Texture {
        const texture = new THREE.DataTexture(
            weights,
            width,
            height,
            THREE.RedFormat,
            THREE.FloatType
        );
        texture.needsUpdate = true;
        return texture;
    }

    private createMaterial(
        baseTexture: THREE.Texture,
        brushTexture: THREE.Texture
    ): THREE.ShaderMaterial {
        const vertexShader = `
            precision highp float;
            precision highp int;

            varying vec2 vUv;

            void main() {
                gl_Position = projectionMatrix * modelViewMatrix * vec4(position.xy, 0.0, 1.0);
                vUv = uv;
            }
        `;

        const fragmentShader = `
            precision highp float;
            precision highp int;

            uniform sampler2D u_baseTexture;
            uniform sampler2D u_brushTexture;

            varying vec2 vUv;

            float unpackAltitudeFromColor(vec4 v) {
                vec4 uDemUnpack = vec4(6553.6, 25.6, 0.1, 10000.0);
                return dot(vec4(v.xyz * 255.0, -1.0), uDemUnpack);
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
                vec4 baseColor = texture2D(u_baseTexture, vec2(vUv.x, vUv.y));
                float baseHeight = unpackAltitudeFromColor(baseColor);

                float brushWeight = texture2D(u_brushTexture, vec2(vUv.x,1.0- vUv.y)).r; 

                float finalHeight = baseHeight + brushWeight;
                gl_FragColor = packAltitudeToColor(finalHeight);
            }
        `;

        baseTexture.needsUpdate = true;
        return new THREE.ShaderMaterial({
            vertexShader,
            fragmentShader,
            uniforms: {
                u_baseTexture: { value: baseTexture },
                u_brushTexture: { value: brushTexture }
            }
        });
    }

    setEnvironment(environment: RenderEnvironment): void {
        this.environment = environment;
    }

    getEnvironment(): RenderEnvironment | undefined {
        return this.environment;
    }
}

export function renderGroundModificationHeightMap(
    modifications: GroundModificationData[],
    tileGeoBox: GeoBox,
    baseDemTexture: THREE.Texture | undefined,
    width: number = 512,
    height: number = 512,
    flipY: boolean = true,
    environment?: RenderEnvironment
): GroundModificationResult | undefined {
    const processor = new GroundModificationProcessor(environment);
    return processor.renderHeightMap(modifications, tileGeoBox, baseDemTexture, {
        width,
        height,
        flipY
    });
}
