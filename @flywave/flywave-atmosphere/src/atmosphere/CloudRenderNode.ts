// @ts-nocheck
/* Copyright (C) 2025 flywave.gl contributors */

import {
    dot,
    Fn,
    float,
    floor,
    frameId,
    If,
    ivec2,
    max,
    mix,
    mrt,
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
    reference,
    Return
} from "three/tsl";
import {
    type NodeBuilder,
    type NodeFrame,
    type Renderer,
    type TextureNode,
    HalfFloatType,
    LinearFilter,
    NearestFilter,
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
const _cloudResolveCountNode = uniform(0);
const _cloudFrameNode = uniform(0);

const SHADOW_CASCADE_COUNT = 3;
const SHADOW_MAX_FAR = 100000;
// Per-cascade resolution: near cascades need detail, far ones don't.
// This reduces total BSM pixels by ~55% vs uniform 1024.
const SHADOW_MAP_SIZES = [1024, 512, 256];
const SHADOW_MAP_SIZE = SHADOW_MAP_SIZES[0];

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
let _prevFrameTime = 0;

// Previous view-projection matrix for velocity reprojection
const prevViewProjectionUniform = new Uniform(new Matrix4());
let hasPrevViewProjection = false;
let _nextPrevViewProjection: Matrix4 | null = null;
// Previous frame's jittered view-projection (includes Halton jitter shift)
let _prevJitteredVP: Matrix4 | null = null;

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
    private shadowRTs: RenderTarget[] = [];
    private shadowHistoryRTs: RenderTarget[] = [];
    private shadowResolvedRTs: RenderTarget[] = [];

    private readonly lowResMaterial = new NodeMaterial();
    private readonly resolveMaterial = new NodeMaterial();
    private readonly blitMaterial = new NodeMaterial();
    private readonly shadowMaterials: NodeMaterial[] = [];
    private readonly shadowResolveMaterials: NodeMaterial[] = [];
    private readonly shadowBlitMaterials: NodeMaterial[] = [];
    private readonly shadowRawBlitMaterials: NodeMaterial[] = [];

    private _resolveFrameCount = 0;
    private _cloudResolveFrameCount = 0;

    private readonly mesh = new QuadMesh();
    private _rendererState?: RendererUtils.RendererState;

    private readonly lowResNode: TextureNode;
    private readonly velocityLowResNode: TextureNode;
    private readonly historyNode: TextureNode;
    private readonly resolveNodeTex: TextureNode;
    private readonly shadowNodes: TextureNode[] = [];
    private readonly shadowHistoryNodes: TextureNode[] = [];

    /** Cloud overlay texture (RGBA: color + alpha) for atmosphere composition */
    get overlayTexture(): Texture {
        return this.resolveRT.texture;
    }

    /** Resolved BSM textures per cascade for atmosphere shadow composition */
    get shadowTextures(): Texture[] {
        return this.shadowResolvedRTs.map(rt => rt.texture);
    }

    /** Shadow matrices per cascade (world→clip) for atmosphere shadow composition */
    get shadowMatricesOut(): readonly Matrix4[] {
        return this.prevShadowMatrices;
    }

    /** Cascade split intervals for atmosphere shadow composition */
    get shadowIntervalsOut(): readonly Vector2[] {
        return _cloudUniforms.shadowIntervals.map(u => u.value as Vector2);
    }

    // Previous-frame shadow matrices for BSM temporal reprojection
    private prevShadowMatrices: Matrix4[] = [
        new Matrix4(),
        new Matrix4(),
        new Matrix4(),
        new Matrix4()
    ];

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
        // LowRes RT uses MRT: [0]=color(RGBA), [1]=velocity(RG padded to RGBA)
        this.lowResRT = new RenderTarget(1, 1, {
            depthBuffer: false,
            type: HalfFloatType,
            count: 2
        });
        this.lowResRT.textures[0].name = "color";
        this.lowResRT.textures[0].minFilter = LinearFilter;
        this.lowResRT.textures[0].magFilter = LinearFilter;
        this.lowResRT.textures[1].name = "velocity";
        this.lowResRT.textures[1].minFilter = LinearFilter;
        this.lowResRT.textures[1].magFilter = LinearFilter;

        this.historyRT = new RenderTarget(1, 1, { depthBuffer: false, type: HalfFloatType });
        this.historyRT.texture.name = "Clouds [History]";
        this.historyRT.texture.minFilter = LinearFilter;
        this.historyRT.texture.magFilter = LinearFilter;

        this.resolveRT = new RenderTarget(1, 1, { depthBuffer: false, type: HalfFloatType });
        this.resolveRT.texture.name = "Clouds [Resolve]";
        this.resolveRT.texture.minFilter = LinearFilter;
        this.resolveRT.texture.magFilter = LinearFilter;

        // Shadow RTs (BSM - Beer Shadow Map): one per cascade with decreasing resolution
        for (let i = 0; i < SHADOW_CASCADE_COUNT; i++) {
            const sz = SHADOW_MAP_SIZES[i];
            const rt = new RenderTarget(sz, sz, {
                depthBuffer: false,
                type: HalfFloatType
            });
            rt.texture.name = `Clouds [Shadow ${i}]`;
            rt.texture.minFilter = LinearFilter;
            rt.texture.magFilter = LinearFilter;
            this.shadowRTs.push(rt);

            // History + resolved RTs for BSM temporal accumulation
            const resRT = new RenderTarget(sz, sz, { depthBuffer: false, type: HalfFloatType });
            resRT.texture.name = `Clouds [Shadow Res ${i}]`;
            resRT.texture.minFilter = LinearFilter;
            resRT.texture.magFilter = LinearFilter;
            this.shadowResolvedRTs.push(resRT);

            // shadowNodes point to resolved RTs (main march samples resolved BSM)
            this.shadowNodes.push(outputTexture(this, resRT.texture));

            const mat = new NodeMaterial();
            mat.name = `Clouds [Shadow ${i}]`;
            this.shadowMaterials.push(mat);

            const histRT = new RenderTarget(sz, sz, { depthBuffer: false, type: HalfFloatType });
            histRT.texture.name = `Clouds [Shadow Hist ${i}]`;
            histRT.texture.minFilter = LinearFilter;
            histRT.texture.magFilter = LinearFilter;
            this.shadowHistoryRTs.push(histRT);
            this.shadowHistoryNodes.push(outputTexture(this, histRT.texture));

            const resMat = new NodeMaterial();
            resMat.name = `Clouds [Shadow Resolve ${i}]`;
            this.shadowResolveMaterials.push(resMat);

            const blitMat = new NodeMaterial();
            blitMat.name = `Clouds [Shadow Blit ${i}]`;
            this.shadowBlitMaterials.push(blitMat);

            const rawBlitMat = new NodeMaterial();
            rawBlitMat.name = `Clouds [Shadow Raw Blit ${i}]`;
            this.shadowRawBlitMaterials.push(rawBlitMat);
        }

        this.lowResNode = outputTexture(this, this.lowResRT.textures[0]);
        this.velocityLowResNode = outputTexture(this, this.lowResRT.textures[1]);
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
        // Full resolution (matched reference temporalUpscale=false)
        const lowWidth = Math.max(Math.ceil(fullWidth), 1);
        const lowHeight = Math.max(Math.ceil(fullHeight), 1);

        this.lowResRT.setSize(lowWidth, lowHeight);
        this.historyRT.setSize(fullWidth, fullHeight);
        this.resolveRT.setSize(fullWidth, fullHeight);

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
                    // Use cascade 0 texel size for PCF (fine-grained; far cascades
                    // have coarser texels but PCF radius is small relative to them)
                    _cloudUniforms.shadowTexelSize.value.set(
                        1 / SHADOW_MAP_SIZES[0],
                        1 / SHADOW_MAP_SIZES[0]
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

                    // Init prev matrices = current on first frame (no reprojection velocity)
                    if (this._resolveFrameCount === 0) {
                        for (let i = 0; i < SHADOW_CASCADE_COUNT; i++) {
                            this.prevShadowMatrices[i].copy(_cloudUniforms.shadowMatrices[i].value);
                        }
                    }

                    // BSM temporal resolve: blend current BSM with history
                    if (this._resolveFrameCount < 3) {
                        // Bootstrap: copy raw BSM to resolved + history
                        // Avoids garbage history contaminating the temporal resolve loop
                        for (let i = 0; i < SHADOW_CASCADE_COUNT; i++) {
                            renderer.setRenderTarget(this.shadowResolvedRTs[i]);
                            this.mesh.material = this.shadowRawBlitMaterials[i];
                            this.mesh.render(renderer);
                        }
                        for (let i = 0; i < SHADOW_CASCADE_COUNT; i++) {
                            renderer.setRenderTarget(this.shadowHistoryRTs[i]);
                            this.mesh.material = this.shadowRawBlitMaterials[i];
                            this.mesh.render(renderer);
                        }
                    } else {
                        for (let i = 0; i < SHADOW_CASCADE_COUNT; i++) {
                            renderer.setRenderTarget(this.shadowResolvedRTs[i]);
                            this.mesh.material = this.shadowResolveMaterials[i];
                            this.mesh.render(renderer);
                        }
                        // Copy resolved → history for next frame (blit pass)
                        for (let i = 0; i < SHADOW_CASCADE_COUNT; i++) {
                            renderer.setRenderTarget(this.shadowHistoryRTs[i]);
                            this.mesh.material = this.shadowBlitMaterials[i];
                            this.mesh.render(renderer);
                        }
                    }
                    this._resolveFrameCount++;

                    // Save shadow matrices for next frame's reprojection
                    for (let i = 0; i < SHADOW_CASCADE_COUNT; i++) {
                        this.prevShadowMatrices[i].copy(_cloudUniforms.shadowMatrices[i].value);
                    }
                }
            }
        }

        // Ensure camera matrices are up-to-date before QuadMesh render
        // (getAtmosphereContext doesn't work with renderer arg, so we rely on
        // updateCloudUniforms having been called first)

        // Temporal jitter for super-resolution upscale (disabled during pixel-comparison
        // testing; enable once rendering matches reference).
        const _enableJitter = (globalThis as any).__enableCloudJitter;
        let jitterCamera: any = null,
            savedProj: any = null,
            savedProjInv: any = null;
        if (_enableJitter) {
            const jitterAtmoCtx = getAtmosphereContext(renderer);
            jitterCamera = jitterAtmoCtx.camera;
            savedProj = jitterCamera.projectionMatrix.clone();
            savedProjInv = jitterCamera.projectionMatrixInverse.clone();
            const jx = (haltonBase2[_frameIndex % 16] - 0.5) * (2 / lowWidth);
            const jy = (haltonBase3[_frameIndex % 16] - 0.5) * (2 / lowHeight);
            const jitterMat = new Matrix4().makeTranslation(jx, jy, 0);
            jitterCamera.projectionMatrix.multiply(jitterMat);
            jitterCamera.projectionMatrixInverse.copy(jitterCamera.projectionMatrix).invert();

            if (_prevJitteredVP) {
                prevViewProjectionUniform.value.copy(_prevJitteredVP);
                _cloudUniforms.prevViewProjection.value.copy(_prevJitteredVP);
                hasPrevViewProjection = true;
            }
        }

        // Pass 1: Render clouds at 1/4 resolution for temporal upscale
        renderer.setRenderTarget(this.lowResRT);
        this.mesh.material = this.lowResMaterial;
        this.mesh.render(renderer);

        if (_enableJitter) {
            _prevJitteredVP = new Matrix4().multiplyMatrices(
                jitterCamera.projectionMatrix,
                jitterCamera.matrixWorldInverse
            );
            jitterCamera.projectionMatrix.copy(savedProj);
            jitterCamera.projectionMatrixInverse.copy(savedProjInv);
            _nextPrevViewProjection = null;
        }

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

        // Update resolve frame count for bootstrapping (before resolve pass)
        _cloudResolveCountNode.value = this._cloudResolveFrameCount;
        _cloudFrameNode.value = this._cloudResolveFrameCount % 16;
        this._cloudResolveFrameCount++;

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

        // Accumulate wind velocity into texture offsets (Euler integration)
        // DISABLED FOR EXCLUSION TEST:
        // const now = (typeof performance !== "undefined" ? performance.now() : Date.now()) * 0.001;
        // const dt = _prevFrameTime > 0 ? Math.min(now - _prevFrameTime, 0.1) : 0;
        // _prevFrameTime = now;
        // if (dt > 0) {
        //     _cloudUniforms.localWeatherOffset.value.x +=
        //         _cloudUniforms.localWeatherVelocity.value.x * dt;
        //     _cloudUniforms.localWeatherOffset.value.y +=
        //         _cloudUniforms.localWeatherVelocity.value.y * dt;
        //     _cloudUniforms.shapeOffset.value.x += _cloudUniforms.shapeVelocity.value.x * dt;
        //     _cloudUniforms.shapeOffset.value.y += _cloudUniforms.shapeVelocity.value.y * dt;
        //     _cloudUniforms.shapeOffset.value.z += _cloudUniforms.shapeVelocity.value.z * dt;
        //     _cloudUniforms.shapeDetailOffset.value.x +=
        //         _cloudUniforms.shapeDetailVelocity.value.x * dt;
        //     _cloudUniforms.shapeDetailOffset.value.y +=
        //         _cloudUniforms.shapeDetailVelocity.value.y * dt;
        //     _cloudUniforms.shapeDetailOffset.value.z +=
        //         _cloudUniforms.shapeDetailVelocity.value.z * dt;
        // }

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

        const debugMode = _cloudUniforms.debugMode;

        const debugOutput = Fn(() => {
            // Default: blend resolved clouds over the color node
            const resolvedClouds = texture(this.resolveNodeTex, screenUV);
            const result = mix(this._colorNode.rgb, resolvedClouds.rgb, resolvedClouds.a);

            // Mode 100-102: show BSM cascade resolved buffer (maxOD channel b)
            If(debugMode.equal(100), () => {
                const shadow = texture(this.shadowNodes[0], screenUV);
                Return(vec4(shadow.bbb, 1));
            });
            If(debugMode.equal(101), () => {
                const shadow = texture(this.shadowNodes[1], screenUV);
                Return(vec4(shadow.bbb, 1));
            });
            If(debugMode.equal(102), () => {
                const shadow = texture(this.shadowNodes[2], screenUV);
                Return(vec4(shadow.bbb, 1));
            });

            // Mode 103: show velocity buffer (dx,dy mapped to color)
            If(debugMode.equal(103), () => {
                const vel = texture(this.velocityLowResNode, screenUV);
                Return(vec4(vel.xy.mul(10).add(0.5), 0, 1));
            });

            Return(result);
        })();

        return debugOutput;
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
            // MRT output: color (target[0]) + velocity (target[1])
            this.lowResMaterial.fragmentNode = mrt({
                color: clouds.get("color"),
                velocity: vec4(clouds.get("velocity"), 0, 0)
            });
            this.lowResMaterial.needsUpdate = true;
        }

        // Setup resolve pass: Catmull-Rom upscale + temporal blend.
        // Velocity is sampled from the MRT second output (1/4 res, computed per-pixel
        // in the cloud shader from actual front depth, matching the reference).
        {
            const resolveNode = Fn(() => {
                return texture(this.lowResNode, screenUV);
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

                // Shadow resolve: temporal accumulation per cascade
                const resMat = this.shadowResolveMaterials[i];
                const currentTex = outputTexture(this, this.shadowRTs[i].texture);
                const historyTex = this.shadowHistoryNodes[i];
                const invMat = _cloudUniforms.inverseShadowMatrices[i];
                const prevMat = uniform(this.prevShadowMatrices[i]);

                resMat.fragmentNode = Fn(() => {
                    const uv = screenUV;
                    const current = texture(currentTex, uv);

                    // Reproject: reconstruct clip-space from UV, unproject via inverse
                    // shadow matrix to get world pos, reproject with prev shadow matrix
                    const clip = vec4(uv.mul(2).sub(1), float(-1), float(1));
                    const worldPoint = invMat.mul(clip);
                    const wpDiv = worldPoint.xyz.div(worldPoint.w);
                    const prevClip = prevMat.mul(vec4(wpDiv, 1));
                    const prevUv = prevClip.xy.div(prevClip.w).mul(0.5).add(0.5);

                    // Bounds check
                    const inBounds = step(float(0), prevUv.x)
                        .mul(step(prevUv.x, float(1)))
                        .mul(step(float(0), prevUv.y))
                        .mul(step(prevUv.y, float(1)));

                    const history = texture(historyTex, prevUv);

                    // 3×3 neighborhood variance clipping on current
                    const texSize = vec2(
                        float(this.shadowRTs[i].width),
                        float(this.shadowRTs[i].height)
                    );
                    const texel = vec2(float(1).div(texSize.x), float(1).div(texSize.y));
                    let moment1 = current;
                    let moment2 = current.mul(current);
                    // 4 diagonal neighbors (sufficient for 4-channel BSM)
                    moment1.addAssign(texture(currentTex, uv.add(vec2(texel.x, texel.y))));
                    moment2.addAssign(texture(currentTex, uv.add(vec2(texel.x, texel.y))).pow(2));
                    moment1.addAssign(texture(currentTex, uv.add(vec2(texel.x.negate(), texel.y))));
                    moment2.addAssign(
                        texture(currentTex, uv.add(vec2(texel.x.negate(), texel.y))).pow(2)
                    );
                    moment1.addAssign(texture(currentTex, uv.add(vec2(texel.x, texel.y.negate()))));
                    moment2.addAssign(
                        texture(currentTex, uv.add(vec2(texel.x, texel.y.negate()))).pow(2)
                    );
                    moment1.addAssign(
                        texture(currentTex, uv.add(vec2(texel.x.negate(), texel.y.negate())))
                    );
                    moment2.addAssign(
                        texture(currentTex, uv.add(vec2(texel.x.negate(), texel.y.negate()))).pow(2)
                    );
                    const N = float(5);
                    const mean = moment1.div(N);
                    const variance = moment2.div(N).sub(mean.mul(mean)).max(0).sqrt();
                    const gamma = float(1);
                    const minC = mean.sub(variance.mul(gamma));
                    const maxC = mean.add(variance.mul(gamma));
                    // clipAABB
                    const pClip = maxC.add(minC).mul(0.5);
                    const eClip = maxC.sub(minC).mul(0.5).add(1e-7);
                    const vClip = history.sub(pClip);
                    const vUnit = vClip.div(eClip);
                    const aUnit = vUnit.abs();
                    const maUnit = max(aUnit.x, max(aUnit.y, max(aUnit.z, aUnit.w)));
                    const clippedHistory = maUnit
                        .greaterThan(1)
                        .select(pClip.add(vClip.div(maUnit)), history);

                    // Very slow EMA for shadow stability (matches reference)
                    const alpha = float(0.01);
                    const blended = mix(clippedHistory, current, alpha);
                    return inBounds.greaterThan(0.5).select(blended, current);
                })();
                resMat.needsUpdate = true;

                // Blit material: copy resolved RT → history RT
                const resolvedTex = outputTexture(this, this.shadowResolvedRTs[i].texture);
                this.shadowBlitMaterials[i].fragmentNode = texture(resolvedTex, screenUV);
                this.shadowBlitMaterials[i].needsUpdate = true;

                // Raw blit material: copy raw BSM → resolved/history (bootstrapping)
                const rawTex = outputTexture(this, this.shadowRTs[i].texture);
                this.shadowRawBlitMaterials[i].fragmentNode = texture(rawTex, screenUV);
                this.shadowRawBlitMaterials[i].needsUpdate = true;
            }
            _cloudUniforms.shadowCascadeCount.value = SHADOW_CASCADE_COUNT;
        }
    }

    override dispose(): void {
        this.lowResRT.dispose();
        this.historyRT.dispose();
        this.resolveRT.dispose();
        for (const rt of this.shadowRTs) rt.dispose();
        for (const rt of this.shadowHistoryRTs) rt.dispose();
        for (const rt of this.shadowResolvedRTs) rt.dispose();
        this.lowResMaterial.dispose();
        for (const m of this.shadowMaterials) m.dispose();
        for (const m of this.shadowResolveMaterials) m.dispose();
        for (const m of this.shadowBlitMaterials) m.dispose();
        for (const m of this.shadowRawBlitMaterials) m.dispose();
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
