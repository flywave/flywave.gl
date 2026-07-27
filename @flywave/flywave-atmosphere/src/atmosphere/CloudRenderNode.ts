// @ts-nocheck
/* Copyright (C) 2025 flywave.gl contributors */

import {
    dot,
    Fn,
    float,
    floor,
    frameId,
    If,
    int,
    ivec2,
    max,
    mix,
    mrt,
    not,
    or,
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
    Texture,
    Vector2,
    Matrix4,
    Uniform,
    Vector3
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
const _resolveTexelSize = uniform(new Vector2(1, 1));
const _jitteredInverseProjection = uniform(new Matrix4());
const _temporalJitter = uniform(new Vector2());
const _viewReprojectionMatrix = uniform(new Matrix4());
const _reprojectionMatrix = uniform(new Matrix4());

const _varianceGamma = uniform(2.0);
const _temporalAlpha = uniform(0.05);

const _neighborOffsets9 = [
    [-1, -1],
    [-1, 0],
    [-1, 1],
    [0, -1],
    [0, 0],
    [0, 1],
    [1, -1],
    [1, 0],
    [1, 1]
];

// Get closest fragment: search 3x3 neighborhood for minimum front depth,
// return its velocity. This handles the case where cloud edges move between
// frames and the center pixel may not have the best velocity.
const _getClosestFragment = Fn(([velocityTex, coord]: any) => {
    const result = velocityTex.load(coord).toVar();
    for (const [x, y] of _neighborOffsets9) {
        if (x === 0 && y === 0) continue;
        const neighbor = velocityTex.load(coord.add(ivec2(x, y))).toConst();
        result.assign(neighbor.r.lessThan(result.r).select(neighbor, result));
    }
    return result;
});

const _varianceOffsets8 = [
    [-1, -1],
    [-1, 1],
    [1, -1],
    [1, 1],
    [1, 0],
    [0, -1],
    [0, 1],
    [-1, 0]
];

const _clipAABBResolve = Fn(([cur, hist, minC, maxC]: any) => {
    const pClip = maxC.rgb.add(minC.rgb).mul(0.5).toConst();
    const eClip = maxC.rgb.sub(minC.rgb).mul(0.5).add(1e-7);
    const vClip = hist.sub(vec4(pClip, cur.a)).toConst();
    const vUnit = vClip.xyz.div(eClip);
    const absUnit = vUnit.abs().toConst();
    const maxUnit = max(absUnit.x, absUnit.y, absUnit.z).toConst();
    return maxUnit.greaterThan(1).select(vec4(pClip, cur.a).add(vClip.div(maxUnit)), hist);
});

const _varianceClippingResolve = Fn(([inputNode, coord, current, history]: any) => {
    const moment1 = current.toVar();
    const moment2 = current.pow2().toVar();
    for (const [x, y] of _varianceOffsets8) {
        const neighbor = inputNode.load(coord.add(ivec2(x, y))).toConst();
        moment1.addAssign(neighbor);
        moment2.addAssign(neighbor.pow2());
    }
    const N = _varianceOffsets8.length + 1;
    const mean = moment1.div(N).toConst();
    const variance = sqrt(moment2.div(N).sub(mean.pow2()).max(0)).mul(_varianceGamma).toConst();
    const minColor = mean.sub(variance).toConst();
    const maxColor = mean.add(variance).toConst();
    return _clipAABBResolve(mean.clamp(minColor, maxColor), history, minColor, maxColor);
});

// UV-based variance clipping: samples low-res buffer at full-res UV with bilinear
// interpolation, matching reference's textureOffset(colorBuffer, vUv, offset)
const _lowResTexelSize = uniform(new Vector2(1, 1));

const _varianceClippingUV = Fn(([inputNode, uv, current, history]: any) => {
    const moment1 = current.toVar();
    const moment2 = current.pow2().toVar();
    for (const [x, y] of _varianceOffsets8) {
        const sampleUv = uv.add(vec2(float(x), float(y)).mul(_lowResTexelSize));
        const neighbor = texture(inputNode, sampleUv).toConst();
        moment1.addAssign(neighbor);
        moment2.addAssign(neighbor.pow2());
    }
    const N = _varianceOffsets8.length + 1;
    const mean = moment1.div(N).toConst();
    const variance = sqrt(moment2.div(N).sub(mean.pow2()).max(0)).mul(_varianceGamma).toConst();
    const minColor = mean.sub(variance).toConst();
    const maxColor = mean.add(variance).toConst();
    return _clipAABBResolve(mean.clamp(minColor, maxColor), history, minColor, maxColor);
});

// Catmull-Rom texture sampling for sharper upscaling (5-tap bilinear optimization)
const _historyTexSize = uniform(new Vector2(1, 1));

const _textureCatmullRom = Fn(([texNode, uv]: any) => {
    const texSize = _historyTexSize.toVar();
    const samplePos = uv.mul(texSize);
    const texPos1 = floor(samplePos.sub(0.5)).add(0.5);
    const f = samplePos.sub(texPos1).toVar();
    // Catmull-Rom spline weights: f * (-0.5 + f * (1.0 - 0.5*f)), etc.
    const w0 = f.mul(float(-0.5).add(f.mul(float(1.0).sub(f.mul(0.5)))));
    const w1 = float(1.0).add(f.mul(f).mul(float(-2.5).add(f.mul(1.5))));
    const w2 = f.mul(float(0.5).add(f.mul(float(2.0).sub(f.mul(1.5)))));
    const w3 = f.mul(f).mul(float(-0.5).add(f.mul(0.5)));
    const w12 = w1.add(w2);
    const offset12 = w2.div(w1.add(w2));
    const texPos0 = texPos1.sub(1.0).div(texSize);
    const texPos3 = texPos1.add(2.0).div(texSize);
    const texPos12 = texPos1.add(offset12).div(texSize);
    const result = vec4(0).toVar();
    result.addAssign(texture(texNode, vec2(texPos0.x, texPos0.y)).mul(w0.x).mul(w0.y));
    result.addAssign(texture(texNode, vec2(texPos12.x, texPos0.y)).mul(w12.x).mul(w0.y));
    result.addAssign(texture(texNode, vec2(texPos3.x, texPos0.y)).mul(w3.x).mul(w0.y));
    result.addAssign(texture(texNode, vec2(texPos0.x, texPos12.y)).mul(w0.x).mul(w12.y));
    result.addAssign(texture(texNode, vec2(texPos12.x, texPos12.y)).mul(w12.x).mul(w12.y));
    result.addAssign(texture(texNode, vec2(texPos3.x, texPos12.y)).mul(w3.x).mul(w12.y));
    result.addAssign(texture(texNode, vec2(texPos0.x, texPos3.y)).mul(w0.x).mul(w3.y));
    result.addAssign(texture(texNode, vec2(texPos12.x, texPos3.y)).mul(w12.x).mul(w3.y));
    result.addAssign(texture(texNode, vec2(texPos3.x, texPos3.y)).mul(w3.x).mul(w3.y));
    return result;
});

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

    const cam = atmosphereContext.camera;
    if (cam) {
        if (!_prevProjectionMatrix) {
            _prevProjectionMatrix = cam.projectionMatrix.clone();
            _prevViewMatrix = cam.matrixWorldInverse.clone();
        }
    }

    // Manually compute cameraPositionECEF and altitudeCorrectionECEF from the live
    // camera matrix. onRenderUpdate hasn't fired yet (fires during main render),
    // so .value would be stale — causing jitter during camera movement in MapView.
    let cx = 0,
        cy = 0,
        cz = 0;
    if (cam) {
        const w2e = atmosphereContext.matrixWorldToECEF.value;
        const pos = new Vector3().setFromMatrixPosition(cam.matrixWorld);
        if (w2e) pos.applyMatrix4(w2e);

        // Altitude correction (exact copy of AtmosphereContext.onRenderUpdate logic)
        const a = 6378137.0,
            b = 6356752.314245;
        const a2 = a * a,
            b2 = b * b;
        const rx = 1 / a2,
            ry = 1 / a2,
            rz = 1 / b2;
        const x2 = pos.x * pos.x * rx,
            y2 = pos.y * pos.y * ry,
            z2 = pos.z * pos.z * rz;
        const normSq = x2 + y2 + z2;
        let corrX = 0,
            corrY = 0,
            corrZ = 0;
        if (Number.isFinite(normSq) && normSq >= 0.1) {
            const ratio = Math.sqrt(1 / normSq);
            const ix = pos.x * ratio,
                iy = pos.y * ratio,
                iz = pos.z * ratio;
            const gx = ix * rx * 2,
                gy = iy * ry * 2,
                gz = iz * rz * 2;
            const gLen = Math.sqrt(gx * gx + gy * gy + gz * gz);
            let lambda = ((1 - ratio) * pos.length()) / (gLen / 2);
            let correction = 0;
            let sx: number, sy: number, sz: number, error: number;
            do {
                lambda -= correction;
                sx = 1 / (1 + lambda * rx);
                sy = 1 / (1 + lambda * ry);
                sz = 1 / (1 + lambda * rz);
                const sx2 = sx * sx,
                    sy2 = sy * sy,
                    sz2 = sz * sz;
                const sx3 = sx2 * sx,
                    sy3 = sy2 * sy,
                    sz3 = sz2 * sz;
                error = x2 * sx2 + y2 * sy2 + z2 * sz2 - 1;
                correction = error / ((x2 * sx3 * rx + y2 * sy3 * ry + z2 * sz3 * rz) * -2);
            } while (Math.abs(error) > 1e-12);

            const surfX = pos.x * sx,
                surfY = pos.y * sy,
                surfZ = pos.z * sz;
            const nx = surfX / a2,
                ny = surfY / a2,
                nz = surfZ / b2;
            const nLen = 1 / Math.sqrt(nx * nx + ny * ny + nz * nz);
            const br = atmosphereContext.parameters.bottomRadius;
            corrX = nx * nLen * br - surfX;
            corrY = ny * nLen * br - surfY;
            corrZ = nz * nLen * br - surfZ;
        }
        _cloudUniforms.altitudeCorrection.value.set(corrX, corrY, corrZ);
        cx = pos.x + corrX;
        cy = pos.y + corrY;
        cz = pos.z + corrZ;

        // CRITICAL: update atmosphereContext uniforms — shader uses these directly
        // (cameraPositionECEF/altitudeCorrectionECEF). onRenderUpdate hasn't fired yet.
        if (atmosphereContext.cameraPositionECEF) {
            atmosphereContext.cameraPositionECEF.value.copy(pos);
        }
        if (atmosphereContext.altitudeCorrectionECEF) {
            atmosphereContext.altitudeCorrectionECEF.value.set(corrX, corrY, corrZ);
        }
    }

    const sr = _cloudUniforms.shapeRepeat.value;
    // cameraShapeOffset not used by reference — shape texture follows absolute ECEF position
    // Camera geodetic altitude: length(cameraPositionECEF) - atmosphereParameters.bottomRadius
    // This matches reference's Geodetic.height = 300m for current test camera
    _cloudUniforms.cameraHeight.value =
        Math.sqrt(cx * cx + cy * cy + cz * cz) - atmosphereContext.parameters.bottomRadius;
    _cloudUniforms.cameraPosition.value.set(cx, cy, cz);

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

const { resetRendererState, restoreRendererState } = RendererUtils;
const sizeScratch = /*#__PURE__*/ new Vector2();

// Bayer 4x4 dither pattern (row-major: index = y*4+x)
const bayerIndices = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];

// Precomputed sub-pixel offsets for each frame (0-15).
// offset = ((i%4 + 0.5)/4, (floor(i/4) + 0.5)/4) where bayerIndices[i] === frame
const bayerOffsets: [number, number][] = Array.from({ length: 16 }, (_, frame) => {
    for (let i = 0; i < 16; i++) {
        if (bayerIndices[i] === frame) {
            return [((i % 4) + 0.5) / 4, (Math.floor(i / 4) + 0.5) / 4];
        }
    }
    return [0, 0];
});

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
// Previous frame's NON-jittered projection and view matrices
let _prevProjectionMatrix: Matrix4 | null = null;
let _prevViewMatrix: Matrix4 | null = null;

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
    private readonly _resolveTexUniform = uniform(new Texture());
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
        this.historyNode = texture(this.historyRT.texture);
        this.resolveNodeTex = texture(this.resolveRT.texture);

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
        const UPSCALE = 4;
        const lowWidth = Math.max(Math.ceil(fullWidth / UPSCALE), 1);
        const lowHeight = Math.max(Math.ceil(fullHeight / UPSCALE), 1);
        const virtualWidth = lowWidth * UPSCALE;
        const virtualHeight = lowHeight * UPSCALE;

        this.lowResRT.setSize(lowWidth, lowHeight);
        this.historyRT.setSize(fullWidth, fullHeight);
        this.resolveRT.setSize(fullWidth, fullHeight);
        _resolveTexelSize.value.set(1 / fullWidth, 1 / fullHeight);
        _lowResTexelSize.value.set(1 / lowWidth, 1 / lowHeight);
        _historyTexSize.value.set(fullWidth, fullHeight);

        // getMipLevel() uses resolution for screen-space derivative magnitude.
        // Virtual resolution = lowRes * 4 (what reference CloudsMaterial.setSize does)
        _cloudUniforms.resolution.value.set(virtualWidth, virtualHeight);
        _cloudUniforms.mipLevelScale.value = 0.25;

        // ECEF→World: inverse of matrixWorldToECEF (updated every frame)
        const atmoCtx = getAtmosphereContext(renderer);
        const w2eVal = atmoCtx.matrixWorldToECEF.value;
        if (w2eVal) {
            _cloudUniforms.ecefToWorld.value.copy(w2eVal).invert();
        }

        this._rendererState = resetRendererState(renderer, this._rendererState);

        // BSM pass: update cascade matrices and render shadow map before main pass
        if (_shadowMarch != null) {
            const ready = this.shadowMaterials.every(m => (m as any).fragmentNode != null);
            if (ready) {
                const cam = atmoCtx.camera as any;
                const matV2E = atmoCtx.matrixViewToECEF;
                if (cam && matV2E) {
                    _cascadedShadowMaps.update(
                        cam,
                        _cloudUniforms.sunDirection.value,
                        matV2E.value ?? matV2E
                    );
                    _cloudUniforms.shadowFar.value = _cascadedShadowMaps.far;
                    _cloudUniforms.shadowViewMatrix.value.copy(cam.matrixWorldInverse);
                    _cloudUniforms.shadowCameraNear.value = cam.near;
                    _cloudUniforms.shadowCameraFar.value = cam.far;
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

        // Manually update atmosphere matrix uniforms before cloud passes render.
        // onRenderUpdate fires during main render (after updateBefore), so without this
        // cloud passes see last frame's matrices → "ghosting" when camera moves.
        {
            const atmoCtx = getAtmosphereContext(renderer);
            const cam = atmoCtx.camera;
            const w2e = atmoCtx.matrixWorldToECEF.value;
            if (cam && w2e) {
                atmoCtx.matrixViewToECEF.value.multiplyMatrices(w2e, cam.matrixWorld);
                atmoCtx.matrixECEFToWorld.value.copy(w2e).invert();
                _cloudUniforms.ecefToWorld.value.copy(w2e).invert();
            }
        }

        // Camera jitter: sub-pixel offset based on Bayer 4x4 pattern.
        // Following reference approach: don't modify camera projection matrix.
        // Instead, compute jittered inverse projection for ray direction, and
        // apply same jitter to previous projection for reprojection.
        const _enableJitter = true;

        const atmoCtx2 = getAtmosphereContext(renderer);
        const jitterCamera = atmoCtx2.camera;

        // Override near/far/fov — MapView's updateCameras() resets them dynamically
        if (jitterCamera && jitterCamera.isPerspectiveCamera) {
            jitterCamera.near = 1;
            jitterCamera.far = 4e5;
            jitterCamera.fov = 75;
            const drawingBufferSize = renderer.getDrawingBufferSize(sizeScratch);
            jitterCamera.aspect = drawingBufferSize.x / drawingBufferSize.y;
            jitterCamera.updateProjectionMatrix();
        }

        let jitterDx = 0,
            jitterDy = 0;
        if (_enableJitter) {
            const frame = this._cloudResolveFrameCount % 16;
            const [ox, oy] = bayerOffsets[frame];
            jitterDx = ((ox - 0.5) / virtualWidth) * 4;
            jitterDy = -((oy - 0.5) / virtualHeight) * 4;
            _temporalJitter.value.set(jitterDx, jitterDy);
            _jitteredInverseProjection.value.copy(jitterCamera.projectionMatrix);
            _jitteredInverseProjection.value.elements[8] += jitterDx * 2;
            _jitteredInverseProjection.value.elements[9] += jitterDy * 2;
            _jitteredInverseProjection.value.invert();
        } else {
            _jitteredInverseProjection.value.copy(jitterCamera.projectionMatrixInverse);
            _temporalJitter.value.set(0, 0);
        }

        // viewProjection = (curProj + jitter) × curView — jittered to match ray direction
        // prevViewProjection = (prevProj + jitter) × prevView — same jitter
        // velocity = curUv - prevUv, jitter cancels in subtraction
        const jitteredProj = jitterCamera.projectionMatrix.clone();
        jitteredProj.elements[8] += jitterDx * 2;
        jitteredProj.elements[9] += jitterDy * 2;
        const curVP = new Matrix4().multiplyMatrices(jitteredProj, jitterCamera.matrixWorldInverse);
        _cloudUniforms.viewProjection.value.copy(curVP);

        if (_prevProjectionMatrix && _prevViewMatrix) {
            const reprojection = new Matrix4().copy(_prevProjectionMatrix);
            reprojection.elements[8] += jitterDx * 2;
            reprojection.elements[9] += jitterDy * 2;
            // Strip translation from prevView (RTE-compatible)
            const prevViewRot = _prevViewMatrix.clone();
            prevViewRot.elements[12] = 0;
            prevViewRot.elements[13] = 0;
            prevViewRot.elements[14] = 0;
            reprojection.multiply(prevViewRot);
            _cloudUniforms.prevViewProjection.value.copy(reprojection);
            // viewReprojectionMatrix = reprojection × inverseView (rotation only)
            // Strip translation to work in any camera space (RTE or ECEF)
            const inverseViewRot = jitterCamera.matrixWorld.clone();
            inverseViewRot.elements[12] = 0;
            inverseViewRot.elements[13] = 0;
            inverseViewRot.elements[14] = 0;
            _viewReprojectionMatrix.value.copy(reprojection).multiply(inverseViewRot);
            hasPrevViewProjection = true;
        }

        // Deferred blit from previous frame: resolveRT → historyRT
        if (this._cloudResolveFrameCount > 0) {
            renderer.setRenderTarget(this.historyRT);
            this.mesh.material = this.blitMaterial;
            this.mesh.render(renderer);
        }

        // Pass 1: Render clouds at 1/4 resolution for temporal upscale
        renderer.setRenderTarget(this.lowResRT);
        this.mesh.material = this.lowResMaterial;
        this.mesh.render(renderer);

        // Save non-jittered projection + view for next frame's reprojection
        _prevProjectionMatrix = jitterCamera.projectionMatrix.clone();
        _prevViewMatrix = jitterCamera.matrixWorldInverse.clone();

        // Update resolve frame count for bootstrapping (before resolve pass)
        _cloudResolveCountNode.value = this._cloudResolveFrameCount;
        _cloudFrameNode.value = this._cloudResolveFrameCount % 16;
        this._cloudResolveFrameCount++;

        // Pass 2: Resolve into resolveRT
        renderer.setRenderTarget(this.resolveRT);
        this.mesh.material = this.resolveMaterial;
        this.mesh.render(renderer);

        restoreRendererState(renderer, this._rendererState);

        // Accumulate wind velocity into texture offsets (Euler integration)
        const now = (typeof performance !== "undefined" ? performance.now() : Date.now()) * 0.001;
        const dt = _prevFrameTime > 0 ? Math.min(now - _prevFrameTime, 0.1) : 0;
        _prevFrameTime = now;
        if (dt > 0) {
            _cloudUniforms.localWeatherOffset.value.x +=
                _cloudUniforms.localWeatherVelocity.value.x * dt;
            _cloudUniforms.localWeatherOffset.value.y +=
                _cloudUniforms.localWeatherVelocity.value.y * dt;
            _cloudUniforms.shapeOffset.value.x += _cloudUniforms.shapeVelocity.value.x * dt;
            _cloudUniforms.shapeOffset.value.y += _cloudUniforms.shapeVelocity.value.y * dt;
            _cloudUniforms.shapeOffset.value.z += _cloudUniforms.shapeVelocity.value.z * dt;
            _cloudUniforms.shapeDetailOffset.value.x +=
                _cloudUniforms.shapeDetailVelocity.value.x * dt;
            _cloudUniforms.shapeDetailOffset.value.y +=
                _cloudUniforms.shapeDetailVelocity.value.y * dt;
            _cloudUniforms.shapeDetailOffset.value.z +=
                _cloudUniforms.shapeDetailVelocity.value.z * dt;
        }

        _frameIndex++;

        // Debug: check for window.__cloudDebugMode every frame
        if (typeof window !== "undefined" && (window as any).__cloudDebugMode !== undefined) {
            _cloudUniforms.debugMode.value = (window as any).__cloudDebugMode;
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

        const resolvedClouds = texture(this.resolveNodeTex, screenUV);
        const result = resolvedClouds.rgb;
        return vec4(result, 1); // black background
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
            // Reference: viewPosition = inverseProjectionMatrix(jittered) * position
            const positionView = _jitteredInverseProjection.mul(vec4(geo, 1)).xyz;
            const rayDirection = matrixViewToECEF.mul(vec4(positionView, float(0))).xyz.normalize();
            const camPosCorrected = cameraPositionECEF.add(altitudeCorrectionECEF);

            // Depth occlusion: add temporalJitter to depth UV (matches reference)
            let sceneDistance;
            let depthViewZ = float(4e5).toVar();
            if (this._depthNode != null) {
                const depthTex = convertToTexture(this._depthNode);
                const depthUv = screenUV.add(_temporalJitter);
                const depthVal = depthTex.sample(depthUv).r;
                const viewZ = depthToViewZ(depthVal, camera);
                depthViewZ.assign(
                    depthVal.greaterThan(float(1).sub(1e-7)).select(float(4e5), viewZ.negate())
                );
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
            // View-space velocity using scene depth (matches reference clouds.frag:966-973)
            const frontView = positionView.mul(depthViewZ);
            const prevClip = _viewReprojectionMatrix.mul(vec4(frontView, 1));
            // WebGPU screenUV is top-down but clip space Y is bottom-up — flip Y
            const prevUv = vec2(
                prevClip.x.div(prevClip.w).mul(0.5).add(0.5),
                float(1).sub(prevClip.y.div(prevClip.w).mul(0.5).add(0.5))
            );
            const velocity = screenUV.sub(prevUv);
            this.lowResMaterial.fragmentNode = mrt({
                color: clouds.get("color"),
                velocity: vec4(depthViewZ, velocity, 0)
            });
            this.lowResMaterial.needsUpdate = true;
        }

        // Setup resolve pass: temporal upscale (Bayer + reprojection + variance clipping)
        // Matches reference: cloudsResolve.frag → temporalUpscale()
        {
            const bayerRows = [
                vec4(0, 12, 3, 15),
                vec4(8, 4, 11, 7),
                vec4(2, 14, 1, 13),
                vec4(10, 6, 9, 5)
            ];

            const resolveNode = Fn(() => {
                // Low-res size from texel uniform
                const lowResSize = vec2(
                    float(1).div(_lowResTexelSize.x),
                    float(1).div(_lowResTexelSize.y)
                );
                // Full-res size from resolve texel uniform
                const fullResSize = vec2(
                    float(1).div(_resolveTexelSize.x),
                    float(1).div(_resolveTexelSize.y)
                );

                // Full-res pixel coordinate from screenCoordinate (matches gl_FragCoord)
                const fx = screenCoordinate.x.floor();
                const fy = screenCoordinate.y.floor();

                // Sample low-res color using nearest texel
                const lowCoordX = fx.div(4).floor();
                const lowCoordY = fy.div(4).floor();
                const lowUv = vec2(
                    lowCoordX.add(0.5).div(lowResSize.x),
                    lowCoordY.add(0.5).div(lowResSize.y)
                );
                const currentColor = texture(this.lowResNode, lowUv);

                // Bayer pattern entirely in float
                const b0 = vec4(0, 12, 3, 15);
                const b1 = vec4(8, 4, 11, 7);
                const b2 = vec4(2, 14, 1, 13);
                const b3 = vec4(10, 6, 9, 5);

                const iPixX = screenCoordinate.x.floor().toInt();
                const iPixY = screenCoordinate.y.floor().toInt();
                const mx = iPixX.mod(4).toFloat();
                const my = iPixY.mod(4).toFloat();

                const row = mx
                    .lessThan(1)
                    .select(b0, mx.lessThan(2).select(b1, mx.lessThan(3).select(b2, b3)));

                const bayerVal = my
                    .lessThan(1)
                    .select(
                        row.x,
                        my.lessThan(2).select(row.y, my.lessThan(3).select(row.z, row.w))
                    );

                const frameMod = _cloudResolveCountNode.mod(16);
                const isCurrent = bayerVal.sub(frameMod).abs().lessThan(0.5);

                // Full temporal resolve
                // Full temporal resolve
                const result = currentColor.toVar();

                If(isCurrent.not(), () => {
                    const lowCoord = ivec2(lowCoordX, lowCoordY);
                    const velocityData = _getClosestFragment(this.velocityLowResNode, lowCoord);
                    const velocity = velocityData.yz;
                    const prevUv = screenUV.sub(velocity);

                    const inBounds = prevUv.x
                        .greaterThanEqual(0)
                        .and(prevUv.x.lessThanEqual(1))
                        .and(prevUv.y.greaterThanEqual(0))
                        .and(prevUv.y.lessThanEqual(1));

                    If(inBounds, () => {
                        const historyColor = texture(this.historyNode, prevUv);
                        const clipped = _varianceClippingResolve(
                            this.lowResNode,
                            lowCoord,
                            currentColor,
                            historyColor
                        );
                        result.assign(clipped);
                    });
                });

                return result;

                If(isCurrent.not(), () => {
                    const lowCoord = ivec2(lowCoordX, lowCoordY);
                    const velocityData = _getClosestFragment(this.velocityLowResNode, lowCoord);
                    const velocity = velocityData.yz;
                    const prevUv = screenUV.sub(velocity);

                    const inBounds = prevUv.x
                        .greaterThanEqual(0)
                        .and(prevUv.x.lessThanEqual(1))
                        .and(prevUv.y.greaterThanEqual(0))
                        .and(prevUv.y.lessThanEqual(1));

                    If(inBounds, () => {
                        const historyColor = texture(this.historyNode, prevUv);
                        const clipped = _varianceClippingResolve(
                            this.lowResNode,
                            lowCoord,
                            currentColor,
                            historyColor
                        );
                        result.assign(clipped);
                    });
                });

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

        // Shadow pass setup (BSM)
        if (_shadowMarch != null) {
            _cloudUniforms.shadowCascadeCount.value = SHADOW_CASCADE_COUNT;

            for (let i = 0; i < SHADOW_CASCADE_COUNT; i++) {
                // Shadow march: renders BSM from sun's viewpoint
                this.shadowMaterials[i].fragmentNode = _shadowMarch(i)();
                this.shadowMaterials[i].needsUpdate = true;

                // Raw blit: copy raw shadow RT → resolved/history (bootstrap)
                this.shadowRawBlitMaterials[i].fragmentNode = texture(
                    outputTexture(this, this.shadowRTs[i].texture),
                    screenUV
                );
                this.shadowRawBlitMaterials[i].needsUpdate = true;

                // Blit: copy resolved RT → history RT
                this.shadowBlitMaterials[i].fragmentNode = texture(
                    outputTexture(this, this.shadowResolvedRTs[i].texture),
                    screenUV
                );
                this.shadowBlitMaterials[i].needsUpdate = true;

                // Resolve: temporal accumulation (current + history + variance clipping)
                const shadowRTTex = outputTexture(this, this.shadowRTs[i].texture);
                const shadowResolveNode = Fn(() => {
                    const coord = ivec2(screenCoordinate);
                    const currentColor = shadowRTTex.load(coord);
                    const historyColor = texture(this.shadowHistoryNodes[i], screenUV);
                    const clippedColor = _varianceClippingResolve(
                        shadowRTTex,
                        coord,
                        currentColor,
                        historyColor
                    );
                    return mix(clippedColor, currentColor, float(0.01));
                })();
                this.shadowResolveMaterials[i].fragmentNode = shadowResolveNode;
                this.shadowResolveMaterials[i].needsUpdate = true;
            }
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
