// @ts-nocheck
/* Copyright (C) 2025 flywave.gl contributors */

import {
    dot,
    Fn,
    float,
    frameId,
    ivec2,
    max,
    mix,
    positionGeometry,
    screenCoordinate,
    screenUV,
    sqrt,
    step,
    texture,
    uniform,
    vec2,
    vec3,
    vec4,
    reference
} from "three/tsl";
import {
    type NodeBuilder,
    type NodeFrame,
    type Renderer,
    type TextureNode,
    HalfFloatType,
    LinearFilter,
    NodeMaterial,
    NodeUpdateType,
    QuadMesh,
    RenderTarget,
    RendererUtils,
    TempNode,
    Vector2,
    Matrix4,
    Uniform
} from "three/webgpu";

import { inverseProjectionMatrix } from "../tsl/accessors";
import { depthToViewZ } from "../tsl/transformations";
import type { Node } from "../tsl/node";
import { outputTexture } from "../tsl/OutputTextureNode";
import { convertToTexture } from "../tsl/RenderTargetNode";
import { getAtmosphereContext } from "./AtmosphereContext";

import { CloudTextures } from "../clouds/CloudTextures";
import { CloudLayers } from "../clouds/CloudLayer";
import { CloudUniforms } from "../clouds/CloudUniforms";
import { createCloudRenderer } from "../clouds/cloudTsl";
import { CascadedShadowMaps } from "../clouds/CascadedShadowMaps";
import { stbn } from "../tsl/STBNTextureNode";

const _cloudTextures = new CloudTextures();
const _cloudUniforms = new CloudUniforms(new CloudLayers(CloudLayers.DEFAULT));
let _cloudInitialized = false;
let _cloudRenderReady = false;
let _renderClouds: ((a: any, b: any, c: any) => any) | null = null;
let _shadowMarch: ((cascadeIndex?: number) => any) | null = null;
let _onReadyCallback: (() => void) | null = null;

const SHADOW_CASCADE_COUNT = 3;
const SHADOW_MAP_SIZE = 1024;
const SHADOW_MAX_FAR = 60000;

const _cascadedShadowMaps = new CascadedShadowMaps({
    cascadeCount: SHADOW_CASCADE_COUNT,
    mapSize: new Vector2(SHADOW_MAP_SIZE, SHADOW_MAP_SIZE),
    maxFar: SHADOW_MAX_FAR,
    splitLambda: 0.5,
    fade: false
});

export function setCloudReadyCallback(cb: () => void): void {
    _onReadyCallback = cb;
}

export function getCloudUniforms(): CloudUniforms | null {
    return _cloudInitialized ? _cloudUniforms : null;
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
        _cloudUniforms.bottomRadius.value = 6360000.0;
        _cloudUniforms.scatteringCoefficient.value = 1;
        _cloudUniforms.absorptionCoefficient.value = 0;
        _cloudUniforms.localWeatherRepeat.value.setScalar(100);
        _cloudUniforms.shapeRepeat.value.setScalar(0.0003);
        _cloudUniforms.shapeDetailRepeat.value.setScalar(0.006);
        _cloudUniforms.turbulenceRepeat.value = 20;
        _cloudUniforms.turbulenceDisplacement.value = 350;
        _cloudUniforms.minDensity.value = 1e-5;
        _cloudUniforms.minExtinction.value = 1e-5;
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

        if (
            typeof _renderClouds === "object" &&
            _renderClouds !== null &&
            "render" in _renderClouds
        ) {
            const cr = _renderClouds as any;
            _renderClouds = cr.render;
            _shadowMarch = cr.shadowMarch;
            _cloudUniforms.shadowCascadeCount.value = 1;
        }
        console.log("[CloudRenderNode] Cloud system initialized and ready");

        if (_onReadyCallback) {
            _onReadyCallback();
        }
    } catch (err) {
        console.error("[CloudRenderNode] Init failed:", err);
        _cloudInitialized = false;
    }
}

// Previous frame camera position for velocity calculation
let _prevCamX = 0,
    _prevCamY = 0,
    _prevCamZ = 0;
let _hasPrevCam = false;

export function updateCloudUniforms(atmosphereContext: any): void {
    if (!_cloudInitialized) return;
    _cloudUniforms.sunDirection.value.copy(atmosphereContext.sunDirectionECEF.value);
    _cloudUniforms.bottomRadius.value = atmosphereContext.parameters.bottomRadius;

    // prevViewProjection = previous frame's projection × matrixWorldInverse.
    // This maps world-space positions to clip space. The velocity pass converts
    // ECEF positions to world via matrixECEFToWorld before applying this.
    const cam = atmosphereContext.camera;
    if (cam) {
        _nextPrevViewProjection = new Matrix4().multiplyMatrices(
            cam.projectionMatrix,
            cam.matrixWorldInverse
        );
    }

    const pos = atmosphereContext.cameraPositionECEF?.value;
    const corr = atmosphereContext.altitudeCorrectionECEF?.value;
    if (corr) {
        _cloudUniforms.altitudeCorrection.value.copy(corr);
    }
    const sr = _cloudUniforms.shapeRepeat.value;
    if (pos) {
        const cx = pos.x + (corr?.x ?? 0);
        const cy = pos.y + (corr?.y ?? 0);
        const cz = pos.z + (corr?.z ?? 0);
        _cloudUniforms.cameraShapeOffset.value.set(cx * sr.x, cy * sr.y, cz * sr.z);
        const len = Math.sqrt(cx * cx + cy * cy + cz * cz);
        _cloudUniforms.cameraHeight.value = len - atmosphereContext.parameters.bottomRadius;
        _cloudUniforms.cameraPosition.value.set(cx, cy, cz);

        // Velocity = frame-to-frame camera displacement magnitude
        if (_hasPrevCam) {
            const dx = cx - _prevCamX;
            const dy = cy - _prevCamY;
            const dz = cz - _prevCamZ;
            _cloudUniforms.cameraVelocity.value = Math.sqrt(dx * dx + dy * dy + dz * dz);
        }
        _prevCamX = cx;
        _prevCamY = cy;
        _prevCamZ = cz;
        _hasPrevCam = true;
    }
}

const { resetRendererState, restoreRendererState } = RendererUtils;
const sizeScratch = /*#__PURE__*/ new Vector2();

// Bayer 4x4 pattern for temporal upscale (1=render this frame, 0=use history)
const bayerIndices = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];

// Halton sequence for temporal jitter (base 2, base 3)
const haltonBase2 = [
    0.5, 0.25, 0.75, 0.125, 0.625, 0.375, 0.875, 0.0625, 0.5625, 0.3125, 0.8125, 0.1875, 0.6875,
    0.4375, 0.9375, 0.03125
];
const haltonBase3 = [
    0.333333, 0.666667, 0.111111, 0.444444, 0.777778, 0.222222, 0.555556, 0.888889, 0.037037,
    0.37037, 0.703704, 0.148148, 0.481481, 0.814815, 0.259259, 0.592593
];

let _frameIndex = 0;

// Previous view-projection matrix for velocity reprojection
const prevViewProjectionUniform = new Uniform(new Matrix4());
let hasPrevViewProjection = false;
let _nextPrevViewProjection: Matrix4 | null = null;

export class CloudRenderNode extends TempNode {
    static override get type(): string {
        return "CloudRenderNode";
    }

    _colorNode: Node<"vec4">;
    _depthNode: Node | null = null;
    _renderer: Renderer | null = null;

    // Low-res render targets (1/4 resolution) for cloud rendering
    private lowResRT: RenderTarget;
    private historyRT: RenderTarget;
    private resolveRT: RenderTarget;
    private velocityRT: RenderTarget;
    private shadowRTs: RenderTarget[] = [];

    private readonly lowResMaterial = new NodeMaterial();
    private readonly resolveMaterial = new NodeMaterial();
    private readonly velocityMaterial = new NodeMaterial();
    private readonly blitMaterial = new NodeMaterial();
    private readonly shadowMaterials: NodeMaterial[] = [];

    private readonly mesh = new QuadMesh();
    private _rendererState?: RendererUtils.RendererState;

    private readonly lowResNode: TextureNode;
    private readonly historyNode: TextureNode;
    private readonly velocityNode: TextureNode;
    private readonly resolveNodeTex: TextureNode;
    private readonly shadowNodes: TextureNode[] = [];

    private prevViewProjection: Matrix4 | null = null;
    private currentViewProjection: Matrix4 = new Matrix4();

    constructor(colorNode: Node<"vec4">, depthNode?: Node | null, renderer?: Renderer) {
        super("vec4");
        this.updateBeforeType = NodeUpdateType.FRAME;
        this._colorNode = colorNode;
        this._depthNode = depthNode ?? null;
        this._renderer = renderer ?? null;

        this.lowResMaterial.name = "Clouds [LowRes]";
        this.resolveMaterial.name = "Clouds [Resolve]";
        this.mesh.name = "Clouds";

        // Create render targets
        this.lowResRT = new RenderTarget(1, 1, { depthBuffer: false, type: HalfFloatType });
        this.lowResRT.texture.name = "Clouds [LowRes]";
        this.lowResRT.texture.minFilter = LinearFilter;
        this.lowResRT.texture.magFilter = LinearFilter;

        this.historyRT = new RenderTarget(1, 1, { depthBuffer: false, type: HalfFloatType });
        this.historyRT.texture.name = "Clouds [History]";
        this.historyRT.texture.minFilter = LinearFilter;
        this.historyRT.texture.magFilter = LinearFilter;

        this.resolveRT = new RenderTarget(1, 1, { depthBuffer: false, type: HalfFloatType });
        this.resolveRT.texture.name = "Clouds [Resolve]";
        this.resolveRT.texture.minFilter = LinearFilter;
        this.resolveRT.texture.magFilter = LinearFilter;

        // Velocity RT (1/4 res, same as lowRes) stores per-pixel velocity in RG.
        // Velocity = screenUV - prevUv (reprojected from depth-buffer-derived world pos).
        this.velocityRT = new RenderTarget(1, 1, { depthBuffer: false, type: HalfFloatType });
        this.velocityRT.texture.name = "Clouds [Velocity]";
        this.velocityRT.texture.minFilter = LinearFilter;
        this.velocityRT.texture.magFilter = LinearFilter;

        this.historyRT = new RenderTarget(1, 1, { depthBuffer: false, type: HalfFloatType });
        this.historyRT.texture.name = "Clouds [History]";
        this.historyRT.texture.minFilter = LinearFilter;
        this.historyRT.texture.magFilter = LinearFilter;

        this.resolveRT = new RenderTarget(1, 1, { depthBuffer: false, type: HalfFloatType });
        this.resolveRT.texture.name = "Clouds [Resolve]";
        this.resolveRT.texture.minFilter = LinearFilter;
        this.resolveRT.texture.magFilter = LinearFilter;

        // Shadow RTs (BSM - Beer Shadow Map): one per cascade
        for (let i = 0; i < SHADOW_CASCADE_COUNT; i++) {
            const rt = new RenderTarget(SHADOW_MAP_SIZE, SHADOW_MAP_SIZE, {
                depthBuffer: false,
                type: HalfFloatType
            });
            rt.texture.name = `Clouds [Shadow ${i}]`;
            rt.texture.minFilter = LinearFilter;
            rt.texture.magFilter = LinearFilter;
            this.shadowRTs.push(rt);
            this.shadowNodes.push(outputTexture(this, rt.texture));
            const mat = new NodeMaterial();
            mat.name = `Clouds [Shadow ${i}]`;
            this.shadowMaterials.push(mat);
        }

        this.lowResNode = outputTexture(this, this.lowResRT.texture);
        this.velocityNode = outputTexture(this, this.velocityRT.texture);
        this.historyNode = outputTexture(this, this.historyRT.texture);
        this.resolveNodeTex = outputTexture(this, this.resolveRT.texture);

        if (renderer != null) {
            ensureCloudInit(renderer).catch(err =>
                console.error("[CloudRenderNode] init failed:", err)
            );
        }
    }

    override customCacheKey(): number {
        return this._colorNode.customCacheKey?.() ?? 0;
    }

    private swapHistoryResolve(): void {
        // No swap: resolveRT keeps its texture identity (so direct references
        // from main material remain valid). Instead we blit resolveRT into
        // historyRT at the end of the frame.
        // (Blit happens in updateBefore — see BlitNode below.)
    }

    private _fragmentNodesBuilt = false;

    override updateBefore({ renderer }: NodeFrame): void {
        if (renderer == null || !_cloudRenderReady || _renderClouds == null) {
            return;
        }

        // First frame after becoming ready: build fragment nodes for low-res pass.
        // setup() ran while still initializing so we do it here instead.
        if (!this._fragmentNodesBuilt) {
            this._buildFragmentNodes(renderer);
            this._fragmentNodesBuilt = true;
        }

        const fullSize = renderer.getDrawingBufferSize(sizeScratch);
        const fullWidth = fullSize.x;
        const fullHeight = fullSize.y;
        const lowWidth = Math.max(Math.ceil(fullWidth / 4), 1);
        const lowHeight = Math.max(Math.ceil(fullHeight / 4), 1);

        this.lowResRT.setSize(lowWidth, lowHeight);
        this.historyRT.setSize(fullWidth, fullHeight);
        this.resolveRT.setSize(fullWidth, fullHeight);
        this.velocityRT.setSize(fullWidth, fullHeight);

        // getMipLevel() uses resolution uniform for screen-space derivative
        // magnitude. It runs inside the low-res pass, so the resolution must
        // match the low-res render target (matching reference CloudsMaterial).
        _cloudUniforms.resolution.value.set(lowWidth, lowHeight);

        this._rendererState = resetRendererState(renderer, this._rendererState);

        // BSM pass: update cascade matrices and render shadow map before main pass
        if (_shadowMarch != null) {
            const ready = this.shadowMaterials.every(m => (m as any).fragmentNode != null);
            if (ready) {
                const atmoCtx = getAtmosphereContext(renderer);
                const cam = atmoCtx.camera as any;
                const matV2E = atmoCtx.matrixViewToECEF;
                if (cam && matV2E) {
                    _cascadedShadowMaps.update(
                        cam,
                        _cloudUniforms.sunDirection.value,
                        matV2E.value ?? matV2E
                    );
                    _cloudUniforms.shadowFar.value = _cascadedShadowMaps.far;
                    _cloudUniforms.shadowTexelSize.value.set(
                        1 / SHADOW_MAP_SIZE,
                        1 / SHADOW_MAP_SIZE
                    );

                    for (let i = 0; i < SHADOW_CASCADE_COUNT; i++) {
                        const cascade = _cascadedShadowMaps.cascades[i];
                        _cloudUniforms.shadowMatrices[i].value.copy(cascade.matrix);
                        _cloudUniforms.inverseShadowMatrices[i].value.copy(cascade.inverseMatrix);
                        _cloudUniforms.shadowIntervals[i].value.copy(cascade.interval);

                        renderer.setRenderTarget(this.shadowRTs[i]);
                        this.mesh.material = this.shadowMaterials[i];
                        this.mesh.render(renderer);
                    }
                }
            }
        }

        // Ensure camera matrices are up-to-date before QuadMesh render
        // (getAtmosphereContext doesn't work with renderer arg, so we rely on
        // updateCloudUniforms having been called first)

        // Temporal jitter disabled (was breaking rendering)
        const jitterIndex = _frameIndex % 16;

        // Pass 1: Render clouds at 1/4 resolution with jittered projection
        renderer.setRenderTarget(this.lowResRT);
        this.mesh.material = this.lowResMaterial;
        this.mesh.render(renderer);

        // DEBUG: snapshot low-res RT for cross-project pixel comparison, throttled.
        if (
            ((globalThis as any).__cloudsDebugFrame =
                (((globalThis as any).__cloudsDebugFrame ?? 0) + 1) % 30) === 0
        ) {
            try {
                const W = this.lowResRT.width,
                    H = this.lowResRT.height;
                (renderer as any)
                    .readRenderTargetPixelsAsync(this.lowResRT, 0, 0, W, H, 0)
                    .then((buf: any) => {
                        // WebGPU readback aligns rows to 256 bytes; compute actual stride
                        const bytesPerPixel = 4 * 2; // RGBA HalfFloat
                        const stridePixels =
                            (Math.ceil((W * bytesPerPixel) / 256) * 256) / bytesPerPixel;
                        (globalThis as any).__cloudsDebugSnapshot = {
                            w: W,
                            h: H,
                            buf,
                            stride: stridePixels
                        };
                    })
                    .catch((e: Error) => {
                        (globalThis as any).__cloudsDebugError = e.message;
                    });
                // Also snapshot velocity RT
                const Vw = this.velocityRT.width,
                    Vh = this.velocityRT.height;
                (renderer as any)
                    .readRenderTargetPixelsAsync(this.velocityRT, 0, 0, Vw, Vh, 0)
                    .then((buf: any) => {
                        (globalThis as any).__cloudsVelocitySnapshot = { w: Vw, h: Vh, buf };
                    })
                    .catch((e: Error) => {
                        (globalThis as any).__cloudsVelocityError = e.message;
                    });
            } catch (e) {
                (globalThis as any).__cloudsDebugError = (e as Error).message + " (sync)";
            }
        }

        // DEBUG: snapshot shadow RT
        if (
            ((globalThis as any).__cloudsShadowFrame =
                (((globalThis as any).__cloudsShadowFrame ?? 0) + 1) % 30) === 0
        ) {
            try {
                // Snapshot cascade based on debug flag
                const cascadeIdx = (globalThis as any).__cloudsShadowCascade ?? 0;
                const W = this.shadowRTs[cascadeIdx].width,
                    H = this.shadowRTs[cascadeIdx].height;
                (renderer as any)
                    .readRenderTargetPixelsAsync(this.shadowRTs[cascadeIdx], 0, 0, W, H, 0)
                    .then((buf: any) => {
                        (globalThis as any).__cloudsShadowSnapshot = {
                            w: W,
                            h: H,
                            buf,
                            cascade: cascadeIdx
                        };
                    })
                    .catch((e: Error) => {
                        (globalThis as any).__cloudsShadowError = e.message;
                    });
            } catch (e) {}
        }

        // Pass 1b: Render velocity at full resolution (depth-based reprojection)
        renderer.setRenderTarget(this.velocityRT);
        this.mesh.material = this.velocityMaterial;
        this.mesh.render(renderer);

        // Pass 2: Resolve (TAA + Catmull-Rom upsample) at full resolution
        renderer.setRenderTarget(this.resolveRT);
        this.mesh.material = this.resolveMaterial;
        this.mesh.render(renderer);

        // DEBUG: snapshot resolve RT
        if (
            ((globalThis as any).__cloudsResolveFrame =
                (((globalThis as any).__cloudsResolveFrame ?? 0) + 1) % 60) === 0
        ) {
            try {
                const W = this.resolveRT.width,
                    H = this.resolveRT.height;
                (renderer as any)
                    .readRenderTargetPixelsAsync(this.resolveRT, 0, 0, W, H, 0)
                    .then((buf: any) => {
                        (globalThis as any).__cloudsResolveSnapshot = { w: W, h: H, buf };
                    })
                    .catch((e: Error) => {
                        (globalThis as any).__cloudsResolveError = e.message;
                    });
            } catch (e) {}
        }

        restoreRendererState(renderer, this._rendererState);

        // Blit resolveRT → historyRT so history is ready for next frame.
        // This replaces the old swap (which broke direct texture references).
        renderer.setRenderTarget(this.historyRT);
        this.mesh.material = this.blitMaterial;
        this.mesh.render(renderer);

        _frameIndex++;

        // Swap prevViewProjection for next frame.
        // CRITICAL: this must happen AFTER all passes that use prevViewProjection
        // (lowRes, velocity, resolve) have rendered. We swap at the very end of
        // updateBefore so next frame sees this frame's VP as "previous".
        if (_nextPrevViewProjection) {
            prevViewProjectionUniform.value.copy(_nextPrevViewProjection);
            _cloudUniforms.prevViewProjection.value.copy(_nextPrevViewProjection);
            hasPrevViewProjection = true;
        }

        this.swapHistoryResolve();
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

        // Build fragment nodes (also re-built in updateBefore on first ready frame)
        if (!this._fragmentNodesBuilt) {
            this._buildFragmentNodes(builder);
            this._fragmentNodesBuilt = true;
        }

        // Output: blend resolved clouds over the color node
        const resolvedClouds = texture(this.resolveNodeTex, screenUV);
        const result = mix(this._colorNode.rgb, resolvedClouds.rgb, resolvedClouds.a);

        return vec4(result, 1);
    }

    private _buildFragmentNodes(host: NodeBuilder | Renderer): void {
        const atmosphereContext = getAtmosphereContext(host);
        const {
            camera,
            matrixViewToECEF,
            matrixECEFToWorld,
            cameraPositionECEF,
            altitudeCorrectionECEF,
            parameters
        } = atmosphereContext;

        _cloudUniforms.bottomRadius.value = parameters.bottomRadius;

        // Bind shadow texture nodes early — low-res pass references them via
        // sampleShadowOpticalDepth, so they must be non-null before that shader
        // is built (otherwise TSL texture() call fails).
        for (let i = 0; i < SHADOW_CASCADE_COUNT; i++) {
            _cloudUniforms.shadowTextureNodes[i] = this.shadowNodes[i];
        }
        _cloudUniforms.shadowCascadeCount.value = SHADOW_CASCADE_COUNT;

        // Setup low-res pass: render clouds with STBN jitter
        {
            const geo = positionGeometry;
            const positionView = inverseProjectionMatrix(camera).mul(vec4(geo, 1)).xyz;
            const rayDirection = matrixViewToECEF.mul(vec4(positionView, float(0))).xyz.normalize();
            const camPosCorrected = cameraPositionECEF.add(altitudeCorrectionECEF);

            // Depth occlusion
            let sceneDistance;
            if (this._depthNode != null) {
                const depthTex = convertToTexture(this._depthNode);
                const depthVal = depthTex.sample(screenUV).r;
                const viewZ = depthToViewZ(depthVal, camera);
                const camForwardView = vec3(float(0), float(0), float(-1));
                const camForwardECEF = matrixViewToECEF.mul(vec4(camForwardView, float(0))).xyz;
                const sceneDist = viewZ.negate().div(dot(rayDirection, camForwardECEF.normalize()));
                sceneDistance = mix(
                    sceneDist,
                    float(1e10),
                    depthVal.greaterThan(float(1).sub(1e-7)).toFloat()
                );
            } else {
                sceneDistance = float(1e10);
            }

            const jitter = stbn;

            // Compute sun/sky irradiance from atmosphere LUT at cloud layer heights.
            // The atmosphere runtime expects positions in the same unit as
            // parametersNode.bottomRadius/topRadius (i.e. km). Cloud uniforms
            // hold positions in meters, so multiply by worldToUnit here.
            const worldToUnit = parameters.worldToUnit;
            _cloudUniforms.worldToUnit.value = worldToUnit;

            const clouds = _renderClouds(camPosCorrected, rayDirection, sceneDistance);
            this.lowResMaterial.fragmentNode = clouds.get("color");
            this.lowResMaterial.needsUpdate = true;
        }

        // Setup velocity pass: reproject pixel world position from a representative
        // cloud-layer depth using GPU-side matrices (avoids CPU matrix composition
        // bugs). Chain: ECEF-corrected → ECEF (−altCorr) → world (matrixECEFToWorld)
        // → clip (prevViewProjection).
        {
            const velocityNode = Fn(() => {
                const fullUv = screenUV;

                const geo = positionGeometry;
                const positionView = inverseProjectionMatrix(camera).mul(vec4(geo, 1)).xyz;
                const rayDir = matrixViewToECEF.mul(vec4(positionView, float(0))).xyz.normalize();
                const camPos = cameraPositionECEF.add(altitudeCorrectionECEF);

                // Ray-sphere intersection with cloud-layer midpoint sphere
                const midHeight = _cloudUniforms.minHeight
                    .add(_cloudUniforms.maxHeight)
                    .mul(float(0.5));
                const midR = _cloudUniforms.bottomRadius.add(midHeight);
                const b = dot(rayDir, camPos).mul(2);
                const c = dot(camPos, camPos).sub(midR.mul(midR));
                const disc = b.mul(b).sub(c.mul(4));
                const tNear = b
                    .negate()
                    .sub(sqrt(disc.max(0)))
                    .mul(0.5);

                // hitPos is in altitudeCorrection-adjusted ECEF → subtract altCorr → ECEF
                const hitPos = camPos.add(rayDir.mul(tNear.max(0)));
                const ecefPos = hitPos.sub(altitudeCorrectionECEF);
                // ECEF → world via matrixECEFToWorld (GPU uniform)
                const worldPos = matrixECEFToWorld.mul(vec4(ecefPos, 1));
                // world → clip via prevViewProjection
                const prevClip = _cloudUniforms.prevViewProjection.mul(worldPos);
                const prevUv = prevClip.xy.div(prevClip.w).mul(0.5).add(0.5);
                const velocity = fullUv.sub(prevUv);

                const hasHit = disc.greaterThan(0);
                return hasHit.select(vec4(velocity, 0, 1), vec4(0, 0, 0, 1));
            })();

            this.velocityMaterial.fragmentNode = velocityNode;
            this.velocityMaterial.needsUpdate = true;
        }

        // Setup resolve pass: Catmull-Rom upscale + temporal blend
        {
            const resolveNode = Fn(() => {
                const fullUv = screenUV;

                // Catmull-Rom 9-tap upscale (from MJP's implementation)
                const texSize = vec2(float(this.lowResRT.width), float(this.lowResRT.height));
                const samplePos = fullUv.mul(texSize);
                const texPos1 = samplePos.sub(0.5).floor().add(0.5);
                const f = samplePos.sub(texPos1);

                // Catmull-Rom weights (expanded spline)
                const w0 = f.mul(f.mul(f.mul(-0.5).add(1)).sub(0.5));
                const w1 = float(1).add(f.mul(f).mul(f.mul(1.5).sub(2.5)));
                const w2 = f.mul(f.mul(f.mul(-1.5).add(2)).add(0.5));
                const w3 = f.mul(f).mul(f.mul(0.5).sub(0.5));

                const w12 = w1.add(w2);
                const offset12 = w2.div(w12);

                const texPos0 = texPos1.sub(1);
                const texPos3 = texPos1.add(2);
                const texPos12 = texPos1.add(offset12);
                const invTexSize = float(1).div(texSize);

                const currentColor = vec4(0).toVar();
                // Row 0 (y = texPos0.y)
                currentColor.addAssign(
                    texture(this.lowResNode, vec2(texPos0.x, texPos0.y).mul(invTexSize)).mul(
                        w0.x.mul(w0.y)
                    )
                );
                currentColor.addAssign(
                    texture(this.lowResNode, vec2(texPos12.x, texPos0.y).mul(invTexSize)).mul(
                        w12.x.mul(w0.y)
                    )
                );
                currentColor.addAssign(
                    texture(this.lowResNode, vec2(texPos3.x, texPos0.y).mul(invTexSize)).mul(
                        w3.x.mul(w0.y)
                    )
                );
                // Row 1 (y = texPos12.y)
                currentColor.addAssign(
                    texture(this.lowResNode, vec2(texPos0.x, texPos12.y).mul(invTexSize)).mul(
                        w0.x.mul(w12.y)
                    )
                );
                currentColor.addAssign(
                    texture(this.lowResNode, vec2(texPos12.x, texPos12.y).mul(invTexSize)).mul(
                        w12.x.mul(w12.y)
                    )
                );
                currentColor.addAssign(
                    texture(this.lowResNode, vec2(texPos3.x, texPos12.y).mul(invTexSize)).mul(
                        w3.x.mul(w12.y)
                    )
                );
                // Row 2 (y = texPos3.y)
                currentColor.addAssign(
                    texture(this.lowResNode, vec2(texPos0.x, texPos3.y).mul(invTexSize)).mul(
                        w0.x.mul(w3.y)
                    )
                );
                currentColor.addAssign(
                    texture(this.lowResNode, vec2(texPos12.x, texPos3.y).mul(invTexSize)).mul(
                        w12.x.mul(w3.y)
                    )
                );
                currentColor.addAssign(
                    texture(this.lowResNode, vec2(texPos3.x, texPos3.y).mul(invTexSize)).mul(
                        w3.x.mul(w3.y)
                    )
                );

                // Variance clipping: compute neighborhood statistics in low-res buffer
                // 4-neighborhood variance for ghost suppression
                const texel = float(1).div(texSize);
                const moment1 = currentColor.toVar();
                const moment2 = currentColor.mul(currentColor).toVar();

                // Unrolled 4-neighborhood
                {
                    const n = texture(
                        this.lowResNode,
                        fullUv.add(vec2(texel.x, float(0)))
                    ).toConst();
                    moment1.addAssign(n);
                    moment2.addAssign(n.mul(n));
                }
                {
                    const n = texture(
                        this.lowResNode,
                        fullUv.add(vec2(float(0), texel.y))
                    ).toConst();
                    moment1.addAssign(n);
                    moment2.addAssign(n.mul(n));
                }
                {
                    const n = texture(
                        this.lowResNode,
                        fullUv.sub(vec2(texel.x, float(0)))
                    ).toConst();
                    moment1.addAssign(n);
                    moment2.addAssign(n.mul(n));
                }
                {
                    const n = texture(
                        this.lowResNode,
                        fullUv.sub(vec2(float(0), texel.y))
                    ).toConst();
                    moment1.addAssign(n);
                    moment2.addAssign(n.mul(n));
                }

                const N = float(5);
                const mean = moment1.div(N);
                const variance = moment2.div(N).sub(mean.mul(mean)).max(0).sqrt().mul(float(2));
                const minColor = mean.sub(variance);
                const maxColor = mean.add(variance);

                // Bayer 4x4 temporal upscale: every 16 frames, each pixel gets a fresh sample
                const coord = ivec2(screenCoordinate);
                // Bayer 4x4 pattern (matches three-geospatial bayerIndices):
                //   0  8  2 10
                //  12  4 14  6
                //   3 11  1  9
                //  15  7 13  5
                // currentFrame when bayerValue == frameId % 16.
                const bayerX = coord.x.mod(4);
                const bayerY = coord.y.mod(4);
                // Compute bayer index via nested selects
                // row 0: 0,8,2,10 / row 1: 12,4,14,6 / row 2: 3,11,1,9 / row 3: 15,7,13,5
                const row0 = bayerX
                    .equal(0)
                    .select(
                        float(0),
                        bayerX
                            .equal(1)
                            .select(float(8), bayerX.equal(2).select(float(2), float(10)))
                    );
                const row1 = bayerX
                    .equal(0)
                    .select(
                        float(12),
                        bayerX
                            .equal(1)
                            .select(float(4), bayerX.equal(2).select(float(14), float(6)))
                    );
                const row2 = bayerX
                    .equal(0)
                    .select(
                        float(3),
                        bayerX
                            .equal(1)
                            .select(float(11), bayerX.equal(2).select(float(1), float(9)))
                    );
                const row3 = bayerX
                    .equal(0)
                    .select(
                        float(15),
                        bayerX
                            .equal(1)
                            .select(float(7), bayerX.equal(2).select(float(13), float(5)))
                    );
                const bayerValue = bayerY
                    .equal(0)
                    .select(row0, bayerY.equal(1).select(row1, bayerY.equal(2).select(row2, row3)));
                const currentFrame = bayerValue.equal(frameId.mod(16).toFloat());

                const result = currentColor.toVar();

                // Velocity-aware history reprojection.
                // velocity is stored in lowResRT.textures[1] at 1/4 resolution.
                // Sampling it at fullUv gives bilinear-interpolated velocity.
                // History was written at full resolution last frame, so sample
                // at fullUv - velocity.
                const velocity = texture(this.velocityNode, fullUv).xy;
                const historyUV = fullUv.sub(velocity);
                const historyColor = texture(this.historyNode, historyUV);

                // Reject history when reprojected UV leaves the screen
                const outOfBounds = step(float(0), historyUV.x)
                    .mul(step(historyUV.x, float(1)))
                    .mul(step(float(0), historyUV.y))
                    .mul(step(historyUV.y, float(1)));
                // If out of bounds, fall back to current color (no history blend)
                const safeHistory = outOfBounds.greaterThan(0.5).select(historyColor, currentColor);

                // clipAABB: clip history color to neighborhood bounding box
                const pClip = maxColor.rgb.add(minColor.rgb).mul(0.5);
                const eClip = maxColor.rgb.sub(minColor.rgb).mul(0.5).add(1e-7);
                const vClip = safeHistory.sub(vec4(pClip, currentColor.a));
                const vUnit = vClip.xyz.div(eClip);
                const aUnit = vUnit.abs();
                const maUnit = max(aUnit.x, max(aUnit.y, aUnit.z));
                const clippedHistory = maUnit
                    .greaterThan(1)
                    .select(vec4(pClip, currentColor.a).add(vClip.div(maUnit)), safeHistory);

                // Exponential accumulation: 90% history, 10% current.
                // This is what the reference does in temporalAntialiasing mode
                // (cloudsResolve.frag line ~133).
                const temporalAlpha = float(0.1);
                result.assign(mix(clippedHistory, currentColor, temporalAlpha));

                return result;
            })();

            this.resolveMaterial.fragmentNode = resolveNode;
            this.resolveMaterial.needsUpdate = true;
        }

        // Blit pass: copy resolveRT → historyRT (replaces swap)
        {
            this.blitMaterial.name = "Clouds [Blit]";
            this.blitMaterial.fragmentNode = texture(this.resolveNodeTex, screenUV);
            this.blitMaterial.needsUpdate = true;
        }

        // Shadow pass: render BSM from sun's POV, one material per cascade
        if (_shadowMarch != null) {
            for (let i = 0; i < SHADOW_CASCADE_COUNT; i++) {
                const mat = this.shadowMaterials[i];
                mat.name = `Clouds [Shadow ${i}]`;
                mat.fragmentNode = _shadowMarch(i)();
                mat.needsUpdate = true;
                _cloudUniforms.shadowTextureNodes[i] = this.shadowNodes[i];
            }
            _cloudUniforms.shadowCascadeCount.value = SHADOW_CASCADE_COUNT;
        }
    }

    override dispose(): void {
        this.lowResRT.dispose();
        this.historyRT.dispose();
        this.resolveRT.dispose();
        for (const rt of this.shadowRTs) rt.dispose();
        this.lowResMaterial.dispose();
        for (const m of this.shadowMaterials) m.dispose();
        this.resolveMaterial.dispose();
        this.mesh.geometry.dispose();
        super.dispose();
    }
}

export const cloudRender = (
    colorNode: Node<"vec4">,
    depthNode?: Node | null,
    renderer?: Renderer
): CloudRenderNode => new CloudRenderNode(colorNode, depthNode, renderer);
