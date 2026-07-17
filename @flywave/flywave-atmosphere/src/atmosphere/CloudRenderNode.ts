// @ts-nocheck
/* Copyright (C) 2025 flywave.gl contributors */

import {
    dot,
    Fn,
    float,
    mix,
    normalize,
    positionGeometry,
    screenCoordinate,
    uv as uvTsl,
    vec3,
    vec4
} from "three/tsl";
import { type NodeBuilder, type NodeFrame, TempNode, NodeUpdateType, Renderer } from "three/webgpu";

import { inverseProjectionMatrix, projectionMatrix } from "../tsl/accessors";
import { depthToViewZ } from "../tsl/transformations";
import type { Node } from "../tsl/node";
import { convertToTexture } from "../tsl/RenderTargetNode";
import { getAtmosphereContext } from "./AtmosphereContext";

import { CloudTextures } from "../clouds/CloudTextures";
import { CloudLayers } from "../clouds/CloudLayer";
import { CloudUniforms } from "../clouds/CloudUniforms";
import { createCloudRenderer } from "../clouds/cloudTsl";

const _cloudTextures = new CloudTextures();
const _cloudUniforms = new CloudUniforms(new CloudLayers(CloudLayers.DEFAULT));
let _cloudInitialized = false;
let _cloudRenderReady = false;
let _renderClouds: ((a: any, b: any, c: any) => any) | null = null;
let _onReadyCallback: (() => void) | null = null;

export function setCloudReadyCallback(cb: () => void): void {
    _onReadyCallback = cb;
}

async function ensureCloudInit(renderer: Renderer): Promise<void> {
    if (_cloudInitialized) return;
    _cloudInitialized = true;

    try {
        await _cloudTextures.load(renderer);

        _cloudUniforms.localWeatherTexture = _cloudTextures.localWeatherTexture;
        _cloudUniforms.shapeTexture = _cloudTextures.shapeTexture;
        _cloudUniforms.shapeDetailTexture = _cloudTextures.shapeDetailTexture;
        _cloudUniforms.turbulenceTexture = _cloudTextures.turbulenceTexture;

        _cloudUniforms.coverage.value = 0.3;
        _cloudUniforms.scatteringCoefficient.value = 1;
        _cloudUniforms.absorptionCoefficient.value = 0;
        _cloudUniforms.localWeatherRepeat.value.setScalar(100);
        _cloudUniforms.shapeRepeat.value.setScalar(0.0003);
        _cloudUniforms.shapeDetailRepeat.value.setScalar(0.006);
        _cloudUniforms.turbulenceRepeat.value = 20;
        _cloudUniforms.turbulenceDisplacement.value = 350;
        _cloudUniforms.minDensity.value = 1e-4;
        _cloudUniforms.minExtinction.value = 1e-4;
        _cloudUniforms.minTransmittance.value = 1e-2;
        _cloudUniforms.minStepSize.value = 50;
        _cloudUniforms.maxStepSize.value = 1000;
        _cloudUniforms.maxRayDistance.value = 2e5;
        _cloudUniforms.perspectiveStepScale.value = 1.01;
        _cloudUniforms.maxIterationCountToSun.value = 2;
        _cloudUniforms.minSecondaryStepSize.value = 100;
        _cloudUniforms.secondaryStepScale.value = 2;
        _cloudUniforms.skyLightScale.value = 1;
        _cloudUniforms.powderScale.value = 0.8;
        _cloudUniforms.powderExponent.value = 150;
        _cloudUniforms.sunIrradianceMin.value.set(2.0, 2.0, 2.0);
        _cloudUniforms.sunIrradianceMax.value.set(2.5, 2.5, 2.5);
        _cloudUniforms.skyIrradianceMin.value.set(0.2, 0.4, 0.8);
        _cloudUniforms.skyIrradianceMax.value.set(0.4, 0.6, 1.0);

        _renderClouds = createCloudRenderer(_cloudUniforms);
        _cloudRenderReady = true;
        console.log("[CloudRenderNode] Cloud system initialized and ready");

        if (_onReadyCallback) {
            _onReadyCallback();
        }
    } catch (err) {
        console.error("[CloudRenderNode] Init failed:", err);
        _cloudInitialized = false;
    }
}

export function updateCloudUniforms(atmosphereContext: any): void {
    if (!_cloudInitialized) return;
    _cloudUniforms.sunDirection.value.copy(atmosphereContext.sunDirectionECEF.value);
    _cloudUniforms.bottomRadius.value = atmosphereContext.parameters.bottomRadius;

    const pos = atmosphereContext.cameraPositionECEF?.value;
    const corr = atmosphereContext.altitudeCorrectionECEF?.value;
    const sr = _cloudUniforms.shapeRepeat.value;
    if (pos) {
        const cx = pos.x + (corr?.x ?? 0);
        const cy = pos.y + (corr?.y ?? 0);
        const cz = pos.z + (corr?.z ?? 0);
        _cloudUniforms.cameraShapeOffset.value.set(cx * sr.x, cy * sr.y, cz * sr.z);
        const len = Math.sqrt(cx * cx + cy * cy + cz * cz);
        _cloudUniforms.cameraHeight.value = len - atmosphereContext.parameters.bottomRadius;
    }
}

export class CloudRenderNode extends TempNode {
    static override get type(): string {
        return "CloudRenderNode";
    }

    _colorNode: Node<"vec4">;
    _depthNode: Node | null = null;

    constructor(colorNode: Node<"vec4">, depthNode?: Node | null, renderer?: Renderer) {
        super("vec4");
        this._colorNode = colorNode;
        this._depthNode = depthNode ?? null;
        if (renderer != null) {
            ensureCloudInit(renderer).catch(err =>
                console.error("[CloudRenderNode] init failed:", err)
            );
        }
    }

    override setup(builder: NodeBuilder): unknown {
        if (!_cloudRenderReady) {
            if (!_cloudInitialized && builder.renderer != null) {
                ensureCloudInit(builder.renderer);
            }
            return this._colorNode;
        }

        if (_renderClouds == null) {
            return this._colorNode;
        }

        const atmosphereContext = getAtmosphereContext(builder);
        const { camera, matrixViewToECEF, cameraPositionECEF, altitudeCorrectionECEF, parameters } =
            atmosphereContext;

        _cloudUniforms.bottomRadius.value = parameters.bottomRadius;

        const positionView = inverseProjectionMatrix(camera).mul(vec4(positionGeometry, 1)).xyz;
        const rayDirection = matrixViewToECEF.mul(vec4(positionView, 0)).xyz.normalize();

        const camPosCorrected = cameraPositionECEF.add(altitudeCorrectionECEF);

        // Depth occlusion: read depth buffer and convert to scene distance
        let sceneDistance;
        if (this._depthNode != null) {
            const depthTex = convertToTexture(this._depthNode);
            const depthVal = depthTex.sample(uvTsl()).r;
            const viewZ = depthToViewZ(depthVal, camera);
            // camera forward direction in ECEF
            const camForwardView = vec3(0, 0, -1);
            const camForwardECEF = matrixViewToECEF.mul(vec4(camForwardView, 0)).xyz;
            const sceneDist = viewZ.negate().div(dot(rayDirection, camForwardECEF.normalize()));
            // If depth is far (sky), use large distance
            sceneDistance = mix(
                sceneDist,
                float(1e10),
                depthVal.greaterThan(float(1).sub(1e-7)).toFloat()
            );
        } else {
            sceneDistance = float(1e10);
        }

        const clouds = _renderClouds(camPosCorrected, rayDirection, sceneDistance);

        const result = mix(this._colorNode.rgb, clouds.rgb, clouds.a);

        return vec4(result, 1);
    }
}
export const cloudRender = (
    colorNode: Node<"vec4">,
    depthNode?: Node | null,
    renderer?: Renderer
): CloudRenderNode => new CloudRenderNode(colorNode, depthNode, renderer);
