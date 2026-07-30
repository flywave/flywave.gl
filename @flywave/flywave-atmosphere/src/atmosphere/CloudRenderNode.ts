// @ts-nocheck
/* Copyright (C) 2025 flywave.gl contributors */

import {
    dot,
    Fn,
    float,
    floor,
    If,
    ivec2,
    max,
    mix,
    mrt,
    not,
    positionGeometry,
    screenCoordinate,
    screenUV,
    sqrt,
    texture,
    uniform,
    vec2,
    vec3,
    vec4
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
    Texture,
    Vector2,
    Matrix4,
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
import { stbn, stbnTexture } from "../tsl/STBNTextureNode";

const SHADOW_CASCADE_COUNT = 3;
const SHADOW_MAX_FAR = 100000;
const SHADOW_MAP_SIZE = 512;

const _varianceGamma = uniform(2.0);

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

const { resetRendererState, restoreRendererState } = RendererUtils;
const sizeScratch = /*#__PURE__*/ new Vector2();

const bayerIndices = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];

const bayerOffsets: [number, number][] = Array.from({ length: 16 }, (_, frame) => {
    for (let i = 0; i < 16; i++) {
        if (bayerIndices[i] === frame) {
            return [((i % 4) + 0.5) / 4, (Math.floor(i / 4) + 0.5) / 4];
        }
    }
    return [0, 0];
});

export class CloudRenderNode extends TempNode {
    static override get type(): string {
        return "CloudRenderNode";
    }

    _colorNode: Node<"vec4">;
    _depthNode: Node | null = null;
    _renderer: Renderer | null = null;

    cloudAssetsPath = "resources/clouds/";
    onReady: (() => void) | null = null;

    private cloudTextures: CloudTextures | null = null;
    private readonly cloudUniforms = new CloudUniforms(new CloudLayers(CloudLayers.DEFAULT));
    private cloudInitialized = false;
    private cloudRenderReady = false;
    private renderCloudsFn: ((a: any, b: any, c: any) => any) | null = null;
    private shadowMarchFn: ((cascadeIndex?: number) => any) | null = null;

    private readonly cascadedShadowMaps = new CascadedShadowMaps({
        cascadeCount: SHADOW_CASCADE_COUNT,
        mapSize: new Vector2(SHADOW_MAP_SIZE, SHADOW_MAP_SIZE),
        maxFar: SHADOW_MAX_FAR,
        splitLambda: 0.5,
        fade: false
    });

    private readonly cloudResolveCountNode = uniform(0);
    private readonly cloudFrameNode = uniform(0);
    private readonly resolveTexelSize = uniform(new Vector2(1, 1));
    private readonly lowResTexelSize = uniform(new Vector2(1, 1));
    private readonly historyTexSize = uniform(new Vector2(1, 1));
    private readonly jitteredInverseProjection = uniform(new Matrix4());
    private readonly temporalJitter = uniform(new Vector2());
    private readonly viewReprojectionMatrix = uniform(new Matrix4());

    private frameIndex = 0;
    private prevFrameTime = 0;
    private prevProjectionMatrix: Matrix4 = new Matrix4();
    private prevViewMatrix: Matrix4 = new Matrix4();
    private readonly prevCamPos = new Vector3();
    private hasPrevCamTransform = false;

    private readonly _tmpJitteredProj = new Matrix4();
    private readonly _tmpCurVP = new Matrix4();
    private readonly _tmpReprojection = new Matrix4();
    private readonly _tmpDeltaRot = new Matrix4();
    private readonly _tmpDeltaTrans = new Matrix4();
    private readonly _tmpDelta = new Matrix4();
    private readonly _tmpE2wRot = new Matrix4();
    private readonly _tmpSurfaceNormal = new Vector3();
    private readonly _tmpSunWorld = new Vector3();
    private readonly _tmpPos = new Vector3();

    private prevCamX = 0;
    private prevCamY = 0;
    private prevCamZ = 0;
    private hasPrevCam = false;

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
    private _fragmentNodesBuilt = false;

    private readonly mesh = new QuadMesh();
    private _rendererState?: RendererUtils.RendererState;

    private readonly lowResNode: TextureNode;
    private readonly velocityLowResNode: TextureNode;
    private readonly historyNode: TextureNode;
    private readonly resolveNodeTex: TextureNode;
    private readonly shadowNodes: TextureNode[] = [];
    private readonly shadowRawNodes: TextureNode[] = [];
    private readonly shadowHistoryNodes: TextureNode[] = [];

    private prevShadowMatrices: Matrix4[] = [
        new Matrix4(),
        new Matrix4(),
        new Matrix4(),
        new Matrix4()
    ];

    get overlayTexture(): Texture {
        return this.resolveRT.texture;
    }

    get shadowTextures(): Texture[] {
        return this.shadowResolvedRTs.map(rt => rt.texture);
    }

    get shadowMatricesOut(): readonly Matrix4[] {
        return this.prevShadowMatrices;
    }

    get shadowIntervalsOut(): readonly Vector2[] {
        return this.cloudUniforms.shadowIntervals.map(u => u.value as Vector2);
    }

    constructor(colorNode: Node<"vec4">, depthNode?: Node | null, renderer?: Renderer) {
        super("vec4");
        this.updateBeforeType = NodeUpdateType.FRAME;
        this._colorNode = colorNode;
        this._depthNode = depthNode ?? null;
        this._renderer = renderer ?? null;

        this.lowResMaterial.name = "Clouds [LowRes]";
        this.resolveMaterial.name = "Clouds [Resolve]";
        this.mesh.name = "Clouds";

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

        for (let i = 0; i < SHADOW_CASCADE_COUNT; i++) {
            const sz = SHADOW_MAP_SIZE;
            const rt = new RenderTarget(sz, sz, {
                depthBuffer: false,
                type: HalfFloatType,
                count: 2
            });
            rt.texture.name = "color";
            rt.texture.minFilter = LinearFilter;
            rt.texture.magFilter = LinearFilter;
            rt.textures[1].name = "velocity";
            rt.textures[1].minFilter = LinearFilter;
            rt.textures[1].magFilter = LinearFilter;
            this.shadowRTs.push(rt);

            const resRT = new RenderTarget(sz, sz, { depthBuffer: false, type: HalfFloatType });
            resRT.texture.name = `Clouds [Shadow Res ${i}]`;
            resRT.texture.minFilter = LinearFilter;
            resRT.texture.magFilter = LinearFilter;
            this.shadowResolvedRTs.push(resRT);
            this.shadowNodes.push(texture(resRT.texture));
            this.shadowRawNodes.push(texture(this.shadowRTs[i].texture));

            const mat = new NodeMaterial();
            mat.name = `Clouds [Shadow ${i}]`;
            this.shadowMaterials.push(mat);

            const histRT = new RenderTarget(sz, sz, { depthBuffer: false, type: HalfFloatType });
            histRT.texture.name = `Clouds [Shadow Hist ${i}]`;
            histRT.texture.minFilter = LinearFilter;
            histRT.texture.magFilter = LinearFilter;
            this.shadowHistoryRTs.push(histRT);
            this.shadowHistoryNodes.push(texture(histRT.texture));

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
            this.ensureCloudInit(renderer).catch(() => {});
        }
    }

    // OPTIMIZATION: Include cloudRenderReady state in cache key.
    // Before: customCacheKey() returned this._colorNode.customCacheKey?.() ?? 0.
    //   When cloudRenderReady transitions from false→true (after async texture loading),
    //   setup() needs to rebuild fragment nodes, but the cache key didn't change,
    //   so the cached (pre-ready) shader was reused and clouds never rendered.
    // After: key = colorKey * 31 + (cloudRenderReady ? 1 : 0), forcing cache miss
    //   on the false→true transition.
    override customCacheKey(): number {
        const key = this._colorNode.customCacheKey?.() ?? 0;
        return key * 31 + (this.cloudRenderReady ? 1 : 0);
    }

    get uniforms(): CloudUniforms | null {
        return this.cloudInitialized ? this.cloudUniforms : null;
    }

    async ensureCloudInit(renderer: Renderer): Promise<void> {
        if (this.cloudInitialized) return;
        this.cloudInitialized = true;

        try {
            stbnTexture.url = this.cloudAssetsPath + "stbn.bin";
            this.cloudTextures = await CloudTextures.load(this.cloudAssetsPath);

            this.cloudUniforms.localWeatherTexture = this.cloudTextures.localWeatherTexture;
            this.cloudUniforms.shapeTexture = this.cloudTextures.shapeTexture;
            this.cloudUniforms.shapeDetailTexture = this.cloudTextures.shapeDetailTexture;
            this.cloudUniforms.turbulenceTexture = this.cloudTextures.turbulenceTexture;

            this.cloudUniforms.coverage.value = 0.3;
            this.cloudUniforms.hazeEnabled.value = 1;
            this.cloudUniforms.bottomRadius.value = 6360000.0;
            this.cloudUniforms.scatteringCoefficient.value = 1;
            this.cloudUniforms.absorptionCoefficient.value = 0;
            this.cloudUniforms.localWeatherRepeat.value.setScalar(100);
            this.cloudUniforms.shapeRepeat.value.setScalar(0.0003);
            this.cloudUniforms.shapeDetailRepeat.value.setScalar(0.006);
            this.cloudUniforms.turbulenceRepeat.value = 20;
            this.cloudUniforms.turbulenceDisplacement.value = 350;
            this.cloudUniforms.minDensity.value = 1e-5;
            this.cloudUniforms.minExtinction.value = 1e-5;
            this.cloudUniforms.minTransmittance.value = 1e-2;
            this.cloudUniforms.minStepSize.value = 50;
            this.cloudUniforms.maxStepSize.value = 1000;
            this.cloudUniforms.maxRayDistance.value = 2e5;
            this.cloudUniforms.perspectiveStepScale.value = 1.01;
            this.cloudUniforms.maxIterationCountToSun.value = 2;
            this.cloudUniforms.minSecondaryStepSize.value = 100;
            this.cloudUniforms.secondaryStepScale.value = 2;
            this.cloudUniforms.maxIterationCountToGround.value = 3;
            this.cloudUniforms.skyLightScale.value = 1;
            this.cloudUniforms.powderScale.value = 0.8;
            this.cloudUniforms.powderExponent.value = 150;
            this.cloudUniforms.sunIrradianceMin.value.set(2.0, 2.0, 2.0);
            this.cloudUniforms.sunIrradianceMax.value.set(2.5, 2.5, 2.5);
            this.cloudUniforms.skyIrradianceMin.value.set(0.2, 0.4, 0.8);
            this.cloudUniforms.skyIrradianceMax.value.set(0.4, 0.6, 1.0);

            const renderer2 = createCloudRenderer(this.cloudUniforms);
            this.cloudRenderReady = true;

            if (typeof renderer2 === "object" && renderer2 !== null && "render" in renderer2) {
                const cr = renderer2 as any;
                this.renderCloudsFn = cr.render;
                this.shadowMarchFn = cr.shadowMarch;
                this.cloudUniforms.shadowCascadeCount.value = SHADOW_CASCADE_COUNT;
            }

            if (this.onReady) {
                this.onReady();
            }
        } catch {
            this.cloudInitialized = false;
        }
    }

    private _updateAtmosphereUniforms(renderer: Renderer): void {
        const ctx = getAtmosphereContext(renderer);
        const cam = ctx.camera;
        if (!cam) return;

        this.cloudUniforms.sunDirection.value.copy(ctx.sunDirectionECEF.value);
        this.cloudUniforms.bottomRadius.value = ctx.parameters.bottomRadius;

        if (!this.hasPrevCamTransform) {
            this.prevProjectionMatrix.copy(cam.projectionMatrix);
            this.prevViewMatrix.copy(cam.matrixWorldInverse);
        }

        const w2e = ctx.matrixWorldToECEF.value;
        const pos = this._tmpPos.setFromMatrixPosition(cam.matrixWorld);
        if (w2e) pos.applyMatrix4(w2e);

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
            const br = ctx.parameters.bottomRadius;
            corrX = nx * nLen * br - surfX;
            corrY = ny * nLen * br - surfY;
            corrZ = nz * nLen * br - surfZ;
        }

        this.cloudUniforms.altitudeCorrection.value.set(corrX, corrY, corrZ);
        const cx = pos.x + corrX,
            cy = pos.y + corrY,
            cz = pos.z + corrZ;
        this.cloudUniforms.cameraPosition.value.set(cx, cy, cz);
        this.cloudUniforms.cameraHeight.value =
            Math.sqrt(cx * cx + cy * cy + cz * cz) - ctx.parameters.bottomRadius;

        if (ctx.cameraPositionECEF) ctx.cameraPositionECEF.value.copy(pos);
        if (ctx.altitudeCorrectionECEF) ctx.altitudeCorrectionECEF.value.set(corrX, corrY, corrZ);

        if (this.hasPrevCam) {
            const dx = cx - this.prevCamX,
                dy = cy - this.prevCamY,
                dz = cz - this.prevCamZ;
            this.cloudUniforms.cameraVelocity.value = Math.sqrt(dx * dx + dy * dy + dz * dz);
        }
        this.prevCamX = cx;
        this.prevCamY = cy;
        this.prevCamZ = cz;
        this.hasPrevCam = true;
    }

    override updateBefore({ renderer }: NodeFrame): void {
        if (renderer == null || !this.cloudRenderReady || this.renderCloudsFn == null) {
            return;
        }

        this._updateAtmosphereUniforms(renderer);

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
        this.resolveTexelSize.value.set(1 / fullWidth, 1 / fullHeight);
        this.lowResTexelSize.value.set(1 / lowWidth, 1 / lowHeight);
        this.historyTexSize.value.set(fullWidth, fullHeight);

        this.cloudUniforms.resolution.value.set(virtualWidth, virtualHeight);
        this.cloudUniforms.mipLevelScale.value = 0.25;

        const atmoCtx = getAtmosphereContext(renderer);
        const w2eVal = atmoCtx.matrixWorldToECEF.value;
        if (w2eVal) {
            this.cloudUniforms.ecefToWorld.value.copy(w2eVal).invert();
            this.cloudUniforms.worldToECEF.value.copy(w2eVal);
        }

        this._rendererState = resetRendererState(renderer, this._rendererState);

        if (this.shadowMarchFn != null) {
            const ready = this.shadowMaterials.every(m => (m as any).fragmentNode != null);
            if (ready) {
                this.cloudUniforms.frame.value = this._cloudResolveFrameCount % 8;
                const cam = atmoCtx.camera as any;
                const w2e = atmoCtx.matrixWorldToECEF.value;
                if (cam && w2e) {
                    const origFar = cam.far;
                    cam.far = Math.max(cam.far, 100000);
                    cam.updateProjectionMatrix();

                    this.cloudUniforms.worldToECEF.value.copy(w2e);
                    this.cloudUniforms.ecefToWorld.value.copy(w2e).invert();

                    const e2wRot = this._tmpE2wRot.copy(w2e).invert();
                    const sunWorld = this._tmpSunWorld
                        .copy(this.cloudUniforms.sunDirection.value)
                        .transformDirection(e2wRot)
                        .normalize();

                    const camPosECEF = atmoCtx.cameraPositionECEF.value;
                    const surfaceNormal = this._tmpSurfaceNormal.copy(camPosECEF).normalize();
                    const zenithAngle = this.cloudUniforms.sunDirection.value.dot(surfaceNormal);
                    const shadowDistance = 1e6 * (1 - zenithAngle) + 1e3 * zenithAngle;

                    this.cascadedShadowMaps.update(cam, sunWorld, undefined, shadowDistance);

                    this.cloudUniforms.shadowViewMatrix.value.copy(cam.matrixWorldInverse);
                    this.cloudUniforms.shadowCameraNear.value = cam.near;
                    this.cloudUniforms.shadowCameraFar.value = this.cascadedShadowMaps.far;
                    this.cloudUniforms.shadowFar.value = this.cascadedShadowMaps.far;
                    this.cloudUniforms.shadowTexelSize.value.set(
                        1 / SHADOW_MAP_SIZE,
                        1 / SHADOW_MAP_SIZE
                    );

                    cam.far = origFar;
                    cam.updateProjectionMatrix();

                    // Wire previous frame cascade matrices for velocity reprojection.
                    // reprojectionMatrices holds the matrices used in the LAST frame's
                    // shadow render, enabling the shader to compute UV offset between
                    // current and previous frame for temporal resolve.
                    for (let i = 0; i < SHADOW_CASCADE_COUNT; i++) {
                        this.cloudUniforms.reprojectionMatrices[i].value.copy(
                            this.prevShadowMatrices[i]
                        );
                    }

                    for (let i = 0; i < SHADOW_CASCADE_COUNT; i++) {
                        const cascade = this.cascadedShadowMaps.cascades[i];
                        this.cloudUniforms.shadowMatrices[i].value.copy(cascade.matrix);
                        this.cloudUniforms.inverseShadowMatrices[i].value.copy(
                            cascade.inverseMatrix
                        );
                        this.cloudUniforms.shadowIntervals[i].value.copy(cascade.interval);

                        renderer.setRenderTarget(this.shadowRTs[i]);
                        this.mesh.material = this.shadowMaterials[i];
                        this.mesh.render(renderer);
                    }

                    if (this._resolveFrameCount === 0) {
                        for (let i = 0; i < SHADOW_CASCADE_COUNT; i++) {
                            this.prevShadowMatrices[i].copy(
                                this.cloudUniforms.shadowMatrices[i].value
                            );
                        }
                    }

                    if (this._resolveFrameCount < 3) {
                        for (let i = 0; i < SHADOW_CASCADE_COUNT; i++) {
                            renderer.copyTextureToTexture(
                                this.shadowRTs[i].texture,
                                this.shadowResolvedRTs[i].texture
                            );
                            renderer.copyTextureToTexture(
                                this.shadowRTs[i].texture,
                                this.shadowHistoryRTs[i].texture
                            );
                        }
                    } else {
                        for (let i = 0; i < SHADOW_CASCADE_COUNT; i++) {
                            renderer.setRenderTarget(this.shadowResolvedRTs[i]);
                            this.mesh.material = this.shadowResolveMaterials[i];
                            this.mesh.render(renderer);
                        }
                        for (let i = 0; i < SHADOW_CASCADE_COUNT; i++) {
                            renderer.setRenderTarget(this.shadowHistoryRTs[i]);
                            this.mesh.material = this.shadowBlitMaterials[i];
                            this.mesh.render(renderer);
                        }
                    }
                    this._resolveFrameCount++;

                    for (let i = 0; i < SHADOW_CASCADE_COUNT; i++) {
                        this.prevShadowMatrices[i].copy(this.cloudUniforms.shadowMatrices[i].value);
                    }

                    // Push shadow data to AtmosphereContext for ground shadow projection.
                    atmoCtx.cloudShadowEnabled = true;
                    atmoCtx.cloudShadowCascadeCount = SHADOW_CASCADE_COUNT;
                    atmoCtx.cloudShadowFar = this.cascadedShadowMaps.far;
                    atmoCtx.cloudShadowTopHeight = this.cloudUniforms.shadowTopHeight.value;
                    for (let i = 0; i < SHADOW_CASCADE_COUNT; i++) {
                        atmoCtx.cloudShadowTextureNodes[i] = this.shadowNodes[i];
                        atmoCtx.cloudShadowRawTextureNodes[i] = this.shadowRawNodes[i];
                        atmoCtx.cloudShadowMatrices[i].copy(
                            this.cloudUniforms.shadowMatrices[i].value
                        );
                        atmoCtx.cloudShadowIntervals[i].copy(
                            this.cloudUniforms.shadowIntervals[i].value as Vector2
                        );
                    }
                }
            }
        }

        {
            const atmoCtx2 = getAtmosphereContext(renderer);
            const cam = atmoCtx2.camera;
            const w2e = atmoCtx2.matrixWorldToECEF.value;
            if (cam && w2e) {
                atmoCtx2.matrixViewToECEF.value.multiplyMatrices(w2e, cam.matrixWorld);
                atmoCtx2.matrixECEFToWorld.value.copy(w2e).invert();
                this.cloudUniforms.ecefToWorld.value.copy(w2e).invert();
                this.cloudUniforms.worldToECEF.value.copy(w2e);
            }
        }

        const jitterCamera = atmoCtx.camera;

        if (jitterCamera && jitterCamera.isPerspectiveCamera) {
            jitterCamera.far = Math.max(jitterCamera.far, 4e5);
            const drawingBufferSize = renderer.getDrawingBufferSize(sizeScratch);
            jitterCamera.aspect = drawingBufferSize.x / drawingBufferSize.y;
            jitterCamera.updateProjectionMatrix();
        }

        let jitterDx = 0,
            jitterDy = 0;
        const frame = this._cloudResolveFrameCount % 16;
        const [ox, oy] = bayerOffsets[frame];
        jitterDx = ((ox - 0.5) / virtualWidth) * 4;
        jitterDy = -((oy - 0.5) / virtualHeight) * 4;
        this.temporalJitter.value.set(jitterDx, jitterDy);
        this.jitteredInverseProjection.value.copy(jitterCamera.projectionMatrix);
        this.jitteredInverseProjection.value.elements[8] += jitterDx * 2;
        this.jitteredInverseProjection.value.elements[9] += jitterDy * 2;
        this.jitteredInverseProjection.value.invert();

        const jitteredProj = this._tmpJitteredProj.copy(jitterCamera.projectionMatrix);
        jitteredProj.elements[8] += jitterDx * 2;
        jitteredProj.elements[9] += jitterDy * 2;
        const curVP = this._tmpCurVP.multiplyMatrices(
            jitteredProj,
            jitterCamera.matrixWorldInverse
        );
        this.cloudUniforms.viewProjection.value.copy(curVP);

        if (this.hasPrevCamTransform) {
            const reprojection = this._tmpReprojection.copy(this.prevProjectionMatrix);
            reprojection.elements[8] += jitterDx * 2;
            reprojection.elements[9] += jitterDy * 2;
            reprojection.multiply(this.prevViewMatrix);
            this.cloudUniforms.prevViewProjection.value.copy(reprojection);

            const deltaRot = this._tmpDeltaRot.multiplyMatrices(
                this.prevViewMatrix,
                jitterCamera.matrixWorld
            );
            deltaRot.elements[12] = 0;
            deltaRot.elements[13] = 0;
            deltaRot.elements[14] = 0;
            const dx = jitterCamera.position.x - this.prevCamPos.x;
            const dy = jitterCamera.position.y - this.prevCamPos.y;
            const dz = jitterCamera.position.z - this.prevCamPos.z;
            const deltaTrans = this._tmpDeltaTrans.makeTranslation(
                this.prevViewMatrix.elements[0] * dx +
                    this.prevViewMatrix.elements[4] * dy +
                    this.prevViewMatrix.elements[8] * dz,
                this.prevViewMatrix.elements[1] * dx +
                    this.prevViewMatrix.elements[5] * dy +
                    this.prevViewMatrix.elements[9] * dz,
                this.prevViewMatrix.elements[2] * dx +
                    this.prevViewMatrix.elements[6] * dy +
                    this.prevViewMatrix.elements[10] * dz
            );
            const delta = this._tmpDelta.multiplyMatrices(deltaRot, deltaTrans);
            this.viewReprojectionMatrix.value.multiplyMatrices(reprojection, delta);
        }

        if (this._cloudResolveFrameCount > 0) {
            renderer.setRenderTarget(this.historyRT);
            this.mesh.material = this.blitMaterial;
            this.mesh.render(renderer);
        }

        renderer.setRenderTarget(this.lowResRT);
        this.mesh.material = this.lowResMaterial;
        this.mesh.render(renderer);

        this.prevProjectionMatrix.copy(jitterCamera.projectionMatrix);
        this.prevViewMatrix.copy(jitterCamera.matrixWorldInverse);
        this.prevCamPos.copy(jitterCamera.position);
        this.hasPrevCamTransform = true;

        this.cloudResolveCountNode.value = this._cloudResolveFrameCount;
        this.cloudFrameNode.value = this._cloudResolveFrameCount % 16;
        this._cloudResolveFrameCount++;

        renderer.setRenderTarget(this.resolveRT);
        this.mesh.material = this.resolveMaterial;
        this.mesh.render(renderer);

        restoreRendererState(renderer, this._rendererState);

        const now = (typeof performance !== "undefined" ? performance.now() : Date.now()) * 0.001;
        const dt = this.prevFrameTime > 0 ? Math.min(now - this.prevFrameTime, 0.1) : 0;
        this.prevFrameTime = now;
        if (dt > 0) {
            this.cloudUniforms.localWeatherOffset.value.x +=
                this.cloudUniforms.localWeatherVelocity.value.x * dt;
            this.cloudUniforms.localWeatherOffset.value.y +=
                this.cloudUniforms.localWeatherVelocity.value.y * dt;
            this.cloudUniforms.shapeOffset.value.x += this.cloudUniforms.shapeVelocity.value.x * dt;
            this.cloudUniforms.shapeOffset.value.y += this.cloudUniforms.shapeVelocity.value.y * dt;
            this.cloudUniforms.shapeOffset.value.z += this.cloudUniforms.shapeVelocity.value.z * dt;
            this.cloudUniforms.shapeDetailOffset.value.x +=
                this.cloudUniforms.shapeDetailVelocity.value.x * dt;
            this.cloudUniforms.shapeDetailOffset.value.y +=
                this.cloudUniforms.shapeDetailVelocity.value.y * dt;
            this.cloudUniforms.shapeDetailOffset.value.z +=
                this.cloudUniforms.shapeDetailVelocity.value.z * dt;
        }

        this.frameIndex++;
    }

    override setup(builder: NodeBuilder): unknown {
        if (!this.cloudRenderReady) {
            if (!this.cloudInitialized && builder.renderer != null) {
                this.ensureCloudInit(builder.renderer);
            }
            return this._colorNode;
        }

        if (this.renderCloudsFn == null) {
            return this._colorNode;
        }

        if (!this._fragmentNodesBuilt) {
            this._buildFragmentNodes(builder);
            this._fragmentNodesBuilt = true;
        }

        const resolvedClouds = texture(this.resolveNodeTex, screenUV);
        const cloudColor = convertToTexture(this._colorNode);
        return vec4(mix(cloudColor.rgb, resolvedClouds.rgb, resolvedClouds.a), 1);
    }

    private _buildFragmentNodes(host: NodeBuilder | Renderer): void {
        const atmosphereContext = getAtmosphereContext(host);
        const { camera, matrixViewToECEF, cameraPositionECEF, altitudeCorrectionECEF, parameters } =
            atmosphereContext;

        this.cloudUniforms.bottomRadius.value = parameters.bottomRadius;

        for (let i = 0; i < SHADOW_CASCADE_COUNT; i++) {
            this.cloudUniforms.shadowTextureNodes[i] = this.shadowNodes[i];
        }
        this.cloudUniforms.shadowCascadeCount.value = SHADOW_CASCADE_COUNT;

        const u = this.cloudUniforms;

        {
            const geo = positionGeometry;
            const positionView = this.jitteredInverseProjection.mul(vec4(geo, 1)).xyz;
            const rayDirection = matrixViewToECEF.mul(vec4(positionView, float(0))).xyz.normalize();
            const camPosCorrected = cameraPositionECEF.add(altitudeCorrectionECEF);

            let sceneDistance;
            let depthViewZ = float(4e5).toVar();
            if (this._depthNode != null) {
                const depthTex = convertToTexture(this._depthNode);
                const depthUv = screenUV.add(this.temporalJitter);
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
            u.worldToUnit.value = parameters.worldToUnit;

            const clouds = this.renderCloudsFn(camPosCorrected, rayDirection, sceneDistance);
            const frontView = positionView.mul(depthViewZ);
            const prevClip = this.viewReprojectionMatrix.mul(vec4(frontView, 1));
            const prevUv = vec2(
                prevClip.x.div(prevClip.w).mul(0.5).add(0.5),
                float(1).sub(prevClip.y.div(prevClip.w).mul(0.5).add(0.5))
            );
            const sceneVelocity = screenUV.sub(prevUv);
            const cloudVelocity = clouds.get("velocity");
            const cloudFrontDepth = clouds.get("frontDepth");
            const useCloudVelocity = clouds.get("color").a.greaterThan(0);
            const finalVelocity = useCloudVelocity.select(cloudVelocity, sceneVelocity);
            const finalDepth = useCloudVelocity.select(cloudFrontDepth, depthViewZ);
            this.lowResMaterial.fragmentNode = mrt({
                color: clouds.get("color"),
                velocity: vec4(finalDepth, finalVelocity, 0)
            });
            this.lowResMaterial.needsUpdate = true;
        }

        {
            const resolveNode = Fn(() => {
                const lowResSize = vec2(
                    float(1).div(this.lowResTexelSize.x),
                    float(1).div(this.lowResTexelSize.y)
                );
                const fullResSize = vec2(
                    float(1).div(this.resolveTexelSize.x),
                    float(1).div(this.resolveTexelSize.y)
                );

                const fx = screenCoordinate.x.floor();
                const fy = screenCoordinate.y.floor();

                const lowCoordX = fx.div(4).floor();
                const lowCoordY = fy.div(4).floor();
                const lowUv = vec2(
                    lowCoordX.add(0.5).div(lowResSize.x),
                    lowCoordY.add(0.5).div(lowResSize.y)
                );
                const currentColor = texture(this.lowResNode, lowUv);

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

                const frameMod = this.cloudResolveCountNode.mod(16);
                const isCurrent = bayerVal.sub(frameMod).abs().lessThan(0.5);

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
            })();

            this.resolveMaterial.fragmentNode = resolveNode;
            this.resolveMaterial.needsUpdate = true;
        }

        {
            this.blitMaterial.name = "Clouds [Blit]";
            this.blitMaterial.fragmentNode = texture(this.resolveNodeTex, screenUV);
            this.blitMaterial.needsUpdate = true;
        }

        if (this.shadowMarchFn != null) {
            this.cloudUniforms.shadowCascadeCount.value = SHADOW_CASCADE_COUNT;

            for (let i = 0; i < SHADOW_CASCADE_COUNT; i++) {
                const shadowColor = this.shadowMarchFn(i)();

                // Compute shadow velocity for temporal reprojection.
                // Must be outside Fn() because mrt() cannot be returned from inside Fn().
                // Uses the same ray math as createShadowMarchClouds.
                const invMat = this.cloudUniforms.inverseShadowMatrices[i];
                const clip = vec3(screenUV.mul(2).sub(1), float(1));
                const point = invMat.mul(vec4(clip, float(1)));
                const pDiv = point.xyz.div(point.w);
                const sunPos = pDiv.add(this.cloudUniforms.altitudeCorrection);
                const rayDir = this.cloudUniforms.sunDirection.negate().normalize();

                const a = sunPos;
                const b = dot(rayDir, a).mul(2);
                const shadowR = this.cloudUniforms.bottomRadius.add(
                    this.cloudUniforms.shadowTopHeight
                );
                const c = dot(a, a).sub(shadowR.mul(shadowR));
                const disc = b.mul(b).sub(c.mul(4));
                const rayNear = max(
                    float(0),
                    b
                        .negate()
                        .sub(sqrt(disc.max(0)))
                        .mul(0.5)
                );
                const rayOrigin = rayNear.mul(rayDir).add(sunPos);

                const frontDepth = shadowColor.x;
                const noSamples = shadowColor.y.equal(0);
                const frontPosition = frontDepth.mul(rayDir).add(rayOrigin);
                const frontWorld = this.cloudUniforms.ecefToWorld.mul(
                    vec4(frontPosition.sub(this.cloudUniforms.altitudeCorrection), 1)
                ).xyz;
                const prevClip = this.cloudUniforms.reprojectionMatrices[i].mul(
                    vec4(frontWorld, 1)
                );
                const prevUv = prevClip.xy.div(prevClip.w).mul(0.5).add(0.5);
                const velocity = noSamples.select(vec2(0), screenUV.sub(prevUv));

                this.shadowMaterials[i].fragmentNode = mrt({
                    color: shadowColor,
                    velocity: vec4(velocity, 0, 0)
                });
                this.shadowMaterials[i].needsUpdate = true;

                this.shadowRawBlitMaterials[i].fragmentNode = texture(
                    this.shadowRTs[i].texture,
                    screenUV
                );
                this.shadowRawBlitMaterials[i].needsUpdate = true;

                this.shadowBlitMaterials[i].fragmentNode = texture(
                    this.shadowResolvedRTs[i].texture,
                    screenUV
                );
                this.shadowBlitMaterials[i].needsUpdate = true;

                const shadowColorTex = texture(this.shadowRTs[i].texture);
                const shadowVelocityTex = texture(this.shadowRTs[i].textures[1]);
                const shadowResolveNode = Fn(() => {
                    const coord = ivec2(screenCoordinate);
                    const currentColor = shadowColorTex.load(coord);
                    const velocityData = shadowVelocityTex.load(coord);
                    const prevUv = screenUV.sub(velocityData.xy);
                    const inBounds = prevUv.x
                        .greaterThanEqual(0)
                        .and(prevUv.x.lessThanEqual(1))
                        .and(prevUv.y.greaterThanEqual(0))
                        .and(prevUv.y.lessThanEqual(1));
                    const result = currentColor.toVar();
                    If(inBounds, () => {
                        const historyColor = texture(this.shadowHistoryNodes[i], prevUv);
                        const clipped = _varianceClippingResolve(
                            shadowColorTex,
                            coord,
                            currentColor,
                            historyColor
                        );
                        result.assign(clipped);
                    });
                    // 1% EMA: matches original three-geospatial temporalAlpha.
                    // Slower convergence but keeps per-frame shadow edge movement
                    // below the visible threshold (~0.005 texels/frame) during
                    // cascade texel snapping. Cloud self-shadow's TAA handles noise.
                    return mix(result, currentColor, float(0.01));
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
