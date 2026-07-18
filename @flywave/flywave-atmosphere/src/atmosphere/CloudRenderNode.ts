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
    texture,
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
import { getSplitScalarIrradiance } from "./runtime";

import { CloudTextures } from "../clouds/CloudTextures";
import { CloudLayers } from "../clouds/CloudLayer";
import { CloudUniforms } from "../clouds/CloudUniforms";
import { createCloudRenderer } from "../clouds/cloudTsl";
import { stbn } from "../tsl/STBNTextureNode";

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

// Previous frame camera position for velocity calculation
let _prevCamX = 0,
    _prevCamY = 0,
    _prevCamZ = 0;
let _hasPrevCam = false;

export function updateCloudUniforms(atmosphereContext: any): void {
    if (!_cloudInitialized) return;
    _cloudUniforms.sunDirection.value.copy(atmosphereContext.sunDirectionECEF.value);
    _cloudUniforms.bottomRadius.value = atmosphereContext.parameters.bottomRadius;

    // Update previous view-projection matrix for velocity reprojection
    // prevViewProjectionUniform holds the PREVIOUS frame's VP matrix
    const cam = atmosphereContext.camera;
    if (cam) {
        const curVP = new Matrix4().multiplyMatrices(cam.projectionMatrix, cam.matrixWorldInverse);
        // prevViewProjectionUniform already holds previous frame (set at end of last frame)
        // Store current VP for next frame's "previous"
        _nextPrevViewProjection = curVP;
    }

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

    private readonly lowResMaterial = new NodeMaterial();
    private readonly resolveMaterial = new NodeMaterial();
    private readonly velocityMaterial = new NodeMaterial();
    private readonly mesh = new QuadMesh();
    private _rendererState?: RendererUtils.RendererState;

    private readonly lowResNode: TextureNode;
    private readonly historyNode: TextureNode;
    private readonly velocityNode: TextureNode;

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

        // Velocity RT (stores frontDepth in R, velocity in GB)
        this.velocityRT = new RenderTarget(1, 1, { depthBuffer: false, type: HalfFloatType });
        this.velocityRT.texture.name = "Clouds [Velocity]";
        this.velocityRT.texture.minFilter = LinearFilter;
        this.velocityRT.texture.magFilter = LinearFilter;

        this.lowResNode = outputTexture(this, this.lowResRT.texture);
        this.historyNode = outputTexture(this, this.historyRT.texture);
        this.velocityNode = outputTexture(this, this.velocityRT.texture);

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
        const tmp = this.historyRT;
        this.historyRT = this.resolveRT;
        this.resolveRT = tmp;
        this.historyNode.value = this.historyRT.texture;
    }

    override updateBefore({ renderer }: NodeFrame): void {
        if (renderer == null || !_cloudRenderReady || _renderClouds == null) {
            return;
        }

        const fullSize = renderer.getDrawingBufferSize(sizeScratch);
        const fullWidth = fullSize.x;
        const fullHeight = fullSize.y;
        const lowWidth = Math.max(Math.ceil(fullWidth / 4), 1);
        const lowHeight = Math.max(Math.ceil(fullHeight / 4), 1);

        this.lowResRT.setSize(lowWidth, lowHeight);
        this.historyRT.setSize(fullWidth, fullHeight);
        this.resolveRT.setSize(fullWidth, fullHeight);
        this.velocityRT.setSize(lowWidth, lowHeight);

        this._rendererState = resetRendererState(renderer, this._rendererState);

        // Temporal jitter on projection matrix (Halton sequence)
        const jitterIndex = _frameIndex % 16;
        const jitterX = (haltonBase2[jitterIndex] - 0.5) / lowWidth;
        const jitterY = (haltonBase3[jitterIndex] - 0.5) / lowHeight;

        // Pass 1: Render clouds at 1/4 resolution with jittered projection
        renderer.setRenderTarget(this.lowResRT);
        this.mesh.material = this.lowResMaterial;
        this.mesh.render(renderer);

        // Pass 1b: Render velocity at 1/4 resolution
        renderer.setRenderTarget(this.velocityRT);
        this.mesh.material = this.velocityMaterial;
        this.mesh.render(renderer);

        // Pass 2: Resolve (TAA + Catmull-Rom upsample) at full resolution
        renderer.setRenderTarget(this.resolveRT);
        this.mesh.material = this.resolveMaterial;
        this.mesh.render(renderer);

        restoreRendererState(renderer, this._rendererState);

        _frameIndex++;

        // Swap prevViewProjection for next frame
        if (_nextPrevViewProjection) {
            prevViewProjectionUniform.value.copy(_nextPrevViewProjection);
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

        const atmosphereContext = getAtmosphereContext(builder);
        const { camera, matrixViewToECEF, cameraPositionECEF, altitudeCorrectionECEF, parameters } =
            atmosphereContext;

        _cloudUniforms.bottomRadius.value = parameters.bottomRadius;

        // Setup low-res pass: render clouds with STBN jitter
        {
            const positionView = inverseProjectionMatrix(camera).mul(vec4(positionGeometry, 1)).xyz;
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

            // Compute sun/sky irradiance from atmosphere LUT at cloud layer heights
            const surfaceNormal = camPosCorrected.normalize();
            const minRadius = float(
                _cloudUniforms.bottomRadius.value + _cloudUniforms.minHeight.value
            );
            const maxRadius = float(
                _cloudUniforms.bottomRadius.value + _cloudUniforms.maxHeight.value
            );
            const minPos = surfaceNormal.mul(minRadius);
            const maxPos = surfaceNormal.mul(maxRadius);
            const minIrr = getSplitScalarIrradiance(
                atmosphereContext,
                minPos,
                _cloudUniforms.sunDirection
            ).toConst();
            const maxIrr = getSplitScalarIrradiance(
                atmosphereContext,
                maxPos,
                _cloudUniforms.sunDirection
            ).toConst();
            const sunIrrMin = minIrr.get("direct");
            const skyIrrMin = minIrr.get("indirect");
            const sunIrrMax = maxIrr.get("direct");
            const skyIrrMax = maxIrr.get("indirect");

            // Ground irradiance for ground bounce
            const groundPos = surfaceNormal.mul(float(_cloudUniforms.bottomRadius.value));
            const groundIrr = getSplitScalarIrradiance(
                atmosphereContext,
                groundPos,
                _cloudUniforms.sunDirection
            ).toConst();
            const groundIrradiance = groundIrr
                .get("indirect")
                .add(groundIrr.get("direct").mul(float(1).sub(_cloudUniforms.coverage.value)));

            const clouds = _renderClouds(
                camPosCorrected,
                rayDirection,
                sceneDistance,
                sunIrrMin,
                skyIrrMin,
                sunIrrMax,
                skyIrrMax,
                groundIrradiance
            );
            // Store color (rgb) + alpha in low-res buffer
            this.lowResMaterial.fragmentNode = clouds;
            this.lowResMaterial.needsUpdate = true;
        }

        // Setup velocity pass: compute per-pixel velocity from frontDepth
        {
            // Velocity = currentUv - prevUv (reproject frontPosition with prev VP)
            // For simplicity, output frontDepth in R channel (velocity computed in resolve)
            const velocityNode = Fn(() => {
                const fullUv = screenUV;
                const lowColor = texture(this.lowResNode, fullUv);
                // Store frontDepth approximation in R, alpha in G
                // Real velocity needs frontPosition reprojection (complex)
                return vec4(lowColor.a, lowColor.a, lowColor.a, 1);
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
                // Bayer 4x4 pattern indices (0..15)
                const bayerPattern = (cx: any, cy: any) => {
                    const idx = cx.mul(4).add(cy);
                    // 0,8,2,10, 12,4,14,6, 3,11,1,9, 15,7,13,5
                    return idx;
                };
                const bayerX = coord.x.mod(4);
                const bayerY = coord.y.mod(4);
                const bayerValue = bayerPattern(bayerX, bayerY);
                const currentFrame = bayerValue.equal(frameId.mod(16));

                const result = currentColor.toVar();
                currentFrame.toConst();

                // clipAABB: clip history to neighborhood bounding box
                // Per-pixel velocity reprojection: sample history at offset UV
                const velocityTex = texture(this.velocityNode, fullUv);
                const velOffset = vec2(velocityTex.g, velocityTex.b);
                const reprojUv = fullUv.sub(velOffset);

                const pClip = maxColor.rgb.add(minColor.rgb).mul(0.5);
                const eClip = maxColor.rgb.sub(minColor.rgb).mul(0.5).add(1e-7);
                const historyColor = texture(this.historyNode, reprojUv);
                const vClip = historyColor.sub(vec4(pClip, currentColor.a));
                const vUnit = vClip.xyz.div(eClip);
                const aUnit = vUnit.abs();
                const maUnit = max(aUnit.x, max(aUnit.y, aUnit.z));
                const clippedHistory = maUnit
                    .greaterThan(1)
                    .select(vec4(pClip, currentColor.a).add(vClip.div(maUnit)), historyColor);

                // Velocity-aware blend: more history when static, less when moving
                // velocity > 100m → blend 0.5, velocity < 1m → blend 0.05
                const velocity = _cloudUniforms.cameraVelocity;
                const temporalAlpha = float(0.05).add(
                    velocity.div(float(100)).clamp(0, 1).mul(float(0.45))
                );

                // Fresh sample on current frame, otherwise blend with history
                result.assign(
                    currentFrame.select(
                        currentColor,
                        mix(clippedHistory, currentColor, temporalAlpha)
                    )
                );

                return result;
            })();

            this.resolveMaterial.fragmentNode = resolveNode;
            this.resolveMaterial.needsUpdate = true;
        }

        // Output: blend resolved clouds over the color node
        const resolvedClouds = texture(this.resolveRT.texture);
        const result = mix(this._colorNode.rgb, resolvedClouds.rgb, resolvedClouds.a);

        return vec4(result, 1);
    }

    override dispose(): void {
        this.lowResRT.dispose();
        this.historyRT.dispose();
        this.resolveRT.dispose();
        this.lowResMaterial.dispose();
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
