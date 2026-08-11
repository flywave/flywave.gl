// @ts-nocheck
/* Copyright (C) 2025 flywave.gl contributors */

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
import {
    dot,
    Fn,
    float,
    floor,
    If,
    ivec2,
    int,
    Loop,
    max,
    min,
    mix,
    mrt,
    not,
    positionGeometry,
    screenCoordinate,
    screenUV,
    sqrt,
    texture,
    uniform,
    uniformTexture,
    vec2,
    vec3,
    vec4,
    struct
} from "three/tsl";

import { inverseProjectionMatrix } from "../tsl/accessors";
import { depthToViewZ } from "../tsl/transformations";
import type { Node } from "../tsl/node";
import { outputTexture } from "../tsl/OutputTextureNode";
import { convertToTexture } from "../tsl/RenderTargetNode";

import { getAtmosphereContext } from "./AtmosphereContext";

import { CloudTextures } from "../clouds/CloudTextures";
import { CloudLayers, type CloudLayerLike } from "../clouds/CloudLayer";
import { CloudUniforms } from "../clouds/CloudUniforms";
import { createCloudRenderer } from "../clouds/cloudTsl";
import { CascadedShadowMaps } from "../clouds/CascadedShadowMaps";
import { type QualityPreset } from "../clouds/QualityPresets";
import { stbn, stbnTexture, stbnFrameUniform } from "../tsl/STBNTextureNode";
import { resolveResourceUrl } from "../resourceResolver";

const SHADOW_CASCADE_COUNT = 3;
const SHADOW_MAX_FAR = 100000;
const SHADOW_MAP_SIZE = 512;

const _varianceGamma = uniform(2.0);
const _shadowVarianceGamma = uniform(1.0);

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

const _varianceClippingResolve = Fn(([inputNode, coord, current, history, gamma]: any) => {
    const moment1 = current.toVar();
    const moment2 = current.pow2().toVar();
    for (const [x, y] of _varianceOffsets8) {
        const neighbor = inputNode.load(coord.add(ivec2(x, y))).toConst();
        moment1.addAssign(neighbor);
        moment2.addAssign(neighbor.pow2());
    }
    const N = _varianceOffsets8.length + 1;
    const mean = moment1.div(N).toConst();
    const g = gamma ?? _varianceGamma;
    const variance = sqrt(moment2.div(N).sub(mean.pow2()).max(0)).mul(g).toConst();
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
    private readonly _depthTexUniform = uniformTexture();
    _renderer: Renderer | null = null;

    onReady: (() => void) | null = null;

    private cloudTextures: CloudTextures | null = null;
    private readonly cloudUniforms = new CloudUniforms(new CloudLayers(CloudLayers.DEFAULT));
    // Runtime-tunable rendering switches (JS-side; drive RT sizing, jitter,
    // shadow TAA and shadow-length via CloudRenderNode logic, not uniforms).
    private m_temporalUpscale = true;
    private m_resolutionScale = 4;
    private m_shadowTemporalPass = true;
    private m_lightShafts = true;
    private cloudInitialized = false;
    private cloudRenderReady = false;
    // Config passed to setConfig() before textures finished loading
    // (cloudRenderReady == false). Applied at the end of ensureCloudInit so
    // user-supplied quality/parameters take effect over the "high" default.
    private pendingConfig: Record<string, unknown> | null = null;
    private renderCloudsFn: ((a: any, b: any, c: any) => any) | null = null;
    private shadowMarchFn: ((cascadeIndex?: number) => any) | null = null;

    private readonly cascadedShadowMaps = new CascadedShadowMaps({
        cascadeCount: SHADOW_CASCADE_COUNT,
        mapSize: new Vector2(SHADOW_MAP_SIZE, SHADOW_MAP_SIZE),
        maxFar: SHADOW_MAX_FAR,
        splitLambda: 0.6,
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

    // Single MRT RT for all shadow cascades: count = CASCADES
    private shadowMRT!: RenderTarget;
    private shadowResolvedMRT!: RenderTarget;
    private shadowHistoryMRT!: RenderTarget;

    // Combined array texture: all cascade shadows in a single binding (for AtmosphereLightNode).
    private shadowArrayTexture!: RenderTarget;
    private shadowArrayNode!: TextureNode;

    private readonly lowResMaterial = new NodeMaterial();
    private readonly resolveMaterial = new NodeMaterial();
    private readonly shadowMaterial = new NodeMaterial();
    private readonly shadowResolveMaterial = new NodeMaterial();

    private _shadowResolveFrameCount = 0;
    private _cloudResolveFrameCount = 0;
    private _fragmentNodesBuilt = false;
    onTexturesSwapped?: () => void;

    private readonly mesh = new QuadMesh();
    private _rendererState?: RendererUtils.RendererState;

    private readonly lowResNode: TextureNode;
    private readonly velocityLowResNode: TextureNode;
    private readonly shadowLengthLowResNode: TextureNode;
    private historyNode: TextureNode;
    private historyShadowLengthNode: TextureNode;
    private resolveNodeTex: TextureNode;
    private compositeNode: TextureNode;
    private compositeShadowLengthNode: TextureNode;
    private readonly shadowNodes: TextureNode[] = [];
    private readonly shadowHistoryNodes: TextureNode[] = [];

    private readonly _tmpAtlasOffset = new Vector3();
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
        return Array.from(
            { length: SHADOW_CASCADE_COUNT },
            (_, i) => this.shadowResolvedMRT.textures[i]
        );
    }

    get shadowMatricesOut(): readonly Matrix4[] {
        return this.prevShadowMatrices;
    }

    get shadowIntervalsOut(): readonly Vector2[] {
        return this.cloudUniforms.shadowIntervals.map(u => u.value as Vector2);
    }

    get shadowLengthTexture(): Texture {
        return this.resolveRT.textures[1];
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
            count: 3
        });
        this.lowResRT.textures[0].name = "color";
        this.lowResRT.textures[0].minFilter = LinearFilter;
        this.lowResRT.textures[0].magFilter = LinearFilter;
        this.lowResRT.textures[1].name = "velocity";
        this.lowResRT.textures[1].minFilter = LinearFilter;
        this.lowResRT.textures[1].magFilter = LinearFilter;
        this.lowResRT.textures[2].name = "shadowLength";
        this.lowResRT.textures[2].minFilter = LinearFilter;
        this.lowResRT.textures[2].magFilter = LinearFilter;

        // 2-attachment MRT: color + shadowLength. Texture names MUST match mrt()
        // keys (MRTNode.setup matches by texture.name).
        this.resolveRT = new RenderTarget(1, 1, {
            depthBuffer: false,
            type: HalfFloatType,
            count: 2
        });
        this.resolveRT.textures[0].name = "color";
        this.resolveRT.textures[0].minFilter = LinearFilter;
        this.resolveRT.textures[0].magFilter = LinearFilter;
        this.resolveRT.textures[1].name = "shadowLength";
        this.resolveRT.textures[1].minFilter = LinearFilter;
        this.resolveRT.textures[1].magFilter = LinearFilter;

        this.historyRT = new RenderTarget(1, 1, {
            depthBuffer: false,
            type: HalfFloatType,
            count: 2
        });
        this.historyRT.textures[0].name = "color";
        this.historyRT.textures[0].minFilter = LinearFilter;
        this.historyRT.textures[0].magFilter = LinearFilter;
        this.historyRT.textures[1].name = "shadowLength";
        this.historyRT.textures[1].minFilter = LinearFilter;
        this.historyRT.textures[1].magFilter = LinearFilter;
        // Single MRT RT for all shadow cascades
        {
            const sz = SHADOW_MAP_SIZE;
            this.shadowMRT = new RenderTarget(sz, sz, {
                depthBuffer: false,
                type: HalfFloatType,
                count: SHADOW_CASCADE_COUNT
            });
            this.shadowResolvedMRT = new RenderTarget(sz, sz, {
                depthBuffer: false,
                type: HalfFloatType,
                count: SHADOW_CASCADE_COUNT
            });
            this.shadowHistoryMRT = new RenderTarget(sz, sz, {
                depthBuffer: false,
                type: HalfFloatType,
                count: SHADOW_CASCADE_COUNT
            });
            for (let i = 0; i < SHADOW_CASCADE_COUNT; i++) {
                for (const rt of [this.shadowMRT, this.shadowResolvedMRT, this.shadowHistoryMRT]) {
                    rt.textures[i].name = `c${i}`;
                    rt.textures[i].minFilter = LinearFilter;
                    rt.textures[i].magFilter = LinearFilter;
                }
                this.shadowNodes.push(texture(this.shadowResolvedMRT.textures[i]));
                this.shadowHistoryNodes.push(texture(this.shadowHistoryMRT.textures[i]));
            }
        }

        // Combined shadow atlas: cascades stacked vertically (for AtmosphereLightNode).
        this.shadowArrayTexture = new RenderTarget(
            SHADOW_MAP_SIZE,
            SHADOW_MAP_SIZE * SHADOW_CASCADE_COUNT,
            { depthBuffer: false, type: HalfFloatType }
        );
        this.shadowArrayTexture.texture.minFilter = LinearFilter;
        this.shadowArrayTexture.texture.magFilter = LinearFilter;
        this.shadowArrayTexture.texture.name = "Clouds [Shadow Atlas]";
        this.shadowArrayNode = texture(this.shadowArrayTexture.texture);

        this.shadowMaterial.name = "Clouds [Shadow]";

        this.lowResNode = outputTexture(this, this.lowResRT.textures[0]);
        this.velocityLowResNode = outputTexture(this, this.lowResRT.textures[1]);
        this.shadowLengthLowResNode = outputTexture(this, this.lowResRT.textures[2]);
        this.historyNode = texture(this.historyRT.texture);
        this.historyShadowLengthNode = texture(this.historyRT.textures[1]);
        this.resolveNodeTex = texture(this.resolveRT.texture);
        this.compositeNode = texture(this.resolveRT.texture);
        this.compositeShadowLengthNode = texture(this.resolveRT.textures[1]);

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

    setConfig(
        config: Partial<{
            quality: QualityPreset;
            coverage: number;
            layers: CloudLayerLike[];
            scatteringCoefficient: number;
            absorptionCoefficient: number;
            scatterAnisotropy1: number;
            scatterAnisotropy2: number;
            scatterAnisotropyMix: number;
            accuratePhaseFunction: boolean;
            skyLightScale: number;
            groundBounceScale: number;
            powderScale: number;
            powderExponent: number;
            maxIterationCount: number;
            minStepSize: number;
            maxStepSize: number;
            maxRayDistance: number;
            perspectiveStepScale: number;
            minDensity: number;
            minExtinction: number;
            minTransmittance: number;
            maxIterationCountToSun: number;
            maxIterationCountToGround: number;
            minSecondaryStepSize: number;
            secondaryStepScale: number;
            shadowCascadeCount: number;
            maxShadowFilterRadius: number;
            hazeEnabled: boolean;
            hazeDensityScale: number;
            hazeExponent: number;
            hazeScatteringCoefficient: number;
            hazeAbsorptionCoefficient: number;
            localWeatherRepeat: number;
            localWeatherVelocity: [number, number];
            shapeRepeat: number;
            shapeVelocity: [number, number, number];
            shapeDetailRepeat: number;
            shapeDetailVelocity: [number, number, number];
            turbulenceRepeat: number;
            turbulenceDisplacement: number;
            sunAngularRadius: number;
            // ── Added for reference-implementation parity ──
            temporalUpscale: boolean;
            resolutionScale: number;
            accurateSunSkyLight: boolean;
            multiScatteringOctaves: number;
            turbulence: boolean;
            shapeDetail: boolean;
            lightShafts: boolean;
            shadowTemporalPass: boolean;
            shadowSplitMode: "uniform" | "logarithmic" | "practical";
            shadowSplitLambda: number;
            opticalDepthTailScale: number;
        }>
    ): void {
        if (!this.cloudRenderReady) {
            // Cloud textures are still loading. Stash the config and apply it
            // once ensureCloudInit finishes, otherwise the user's quality
            // preset is silently lost (the "high" default would win).
            this.pendingConfig = config as Record<string, unknown>;
            return;
        }
        const u = this.cloudUniforms;

        if (config.quality != null) u.applyQualityPreset(config.quality);
        if (config.coverage != null) u.coverage.value = config.coverage;
        if (config.scatteringCoefficient != null)
            u.scatteringCoefficient.value = config.scatteringCoefficient;
        if (config.absorptionCoefficient != null)
            u.absorptionCoefficient.value = config.absorptionCoefficient;
        if (config.scatterAnisotropy1 != null)
            u.scatterAnisotropy1.value = config.scatterAnisotropy1;
        if (config.scatterAnisotropy2 != null)
            u.scatterAnisotropy2.value = config.scatterAnisotropy2;
        if (config.scatterAnisotropyMix != null)
            u.scatterAnisotropyMix.value = config.scatterAnisotropyMix;
        if (config.accuratePhaseFunction != null)
            u.accuratePhaseFunction.value = config.accuratePhaseFunction ? 1 : 0;
        if (config.skyLightScale != null) u.skyLightScale.value = config.skyLightScale;
        if (config.groundBounceScale != null) u.groundBounceScale.value = config.groundBounceScale;
        if (config.powderScale != null) u.powderScale.value = config.powderScale;
        if (config.powderExponent != null) u.powderExponent.value = config.powderExponent;

        if (config.maxIterationCount != null) u.maxIterationCount.value = config.maxIterationCount;
        if (config.minStepSize != null) u.minStepSize.value = config.minStepSize;
        if (config.maxStepSize != null) u.maxStepSize.value = config.maxStepSize;
        if (config.maxRayDistance != null) u.maxRayDistance.value = config.maxRayDistance;
        if (config.perspectiveStepScale != null)
            u.perspectiveStepScale.value = config.perspectiveStepScale;
        if (config.minDensity != null) u.minDensity.value = config.minDensity;
        if (config.minExtinction != null) u.minExtinction.value = config.minExtinction;
        if (config.minTransmittance != null) u.minTransmittance.value = config.minTransmittance;

        if (config.maxIterationCountToSun != null)
            u.maxIterationCountToSun.value = config.maxIterationCountToSun;
        if (config.maxIterationCountToGround != null)
            u.maxIterationCountToGround.value = config.maxIterationCountToGround;
        if (config.minSecondaryStepSize != null)
            u.minSecondaryStepSize.value = config.minSecondaryStepSize;
        if (config.secondaryStepScale != null)
            u.secondaryStepScale.value = config.secondaryStepScale;

        if (config.shadowCascadeCount != null)
            u.shadowCascadeCount.value = config.shadowCascadeCount;
        if (config.maxShadowFilterRadius != null)
            u.maxShadowFilterRadius.value = config.maxShadowFilterRadius;

        if (config.hazeEnabled != null) u.hazeEnabled.value = config.hazeEnabled ? 1 : 0;
        if (config.hazeDensityScale != null) u.hazeDensityScale.value = config.hazeDensityScale;
        if (config.hazeExponent != null) u.hazeExponent.value = config.hazeExponent;
        if (config.hazeScatteringCoefficient != null)
            u.hazeScatteringCoefficient.value = config.hazeScatteringCoefficient;
        if (config.hazeAbsorptionCoefficient != null)
            u.hazeAbsorptionCoefficient.value = config.hazeAbsorptionCoefficient;

        if (config.localWeatherRepeat != null)
            u.localWeatherRepeat.value.setScalar(config.localWeatherRepeat);
        if (config.localWeatherVelocity != null)
            u.localWeatherVelocity.value.fromArray(config.localWeatherVelocity);
        if (config.shapeRepeat != null) u.shapeRepeat.value.setScalar(config.shapeRepeat);
        if (config.shapeVelocity != null) u.shapeVelocity.value.fromArray(config.shapeVelocity);
        if (config.shapeDetailRepeat != null)
            u.shapeDetailRepeat.value.setScalar(config.shapeDetailRepeat);
        if (config.shapeDetailVelocity != null)
            u.shapeDetailVelocity.value.fromArray(config.shapeDetailVelocity);
        if (config.turbulenceRepeat != null) u.turbulenceRepeat.value = config.turbulenceRepeat;
        if (config.turbulenceDisplacement != null)
            u.turbulenceDisplacement.value = config.turbulenceDisplacement;

        if (config.sunAngularRadius != null) u.sunAngularRadius.value = config.sunAngularRadius;

        // ── Reference-parity fields ───────────────────────────────────────
        // JS-side switches persisted on the node; consumed in updateBefore.
        if (config.temporalUpscale != null) {
            this.m_temporalUpscale = config.temporalUpscale;
            // The resolve Fn bakes BLOCK (= m_resolutionScale or 1) as a build-
            // time constant, so switching temporalUpscale needs a rebuild.
            this._fragmentNodesBuilt = false;
        }
        if (config.resolutionScale != null) {
            this.m_resolutionScale = Math.max(1, Math.floor(config.resolutionScale));
            this._fragmentNodesBuilt = false;
        }
        if (config.lightShafts != null) {
            this.m_lightShafts = config.lightShafts;
            // lightShafts is implemented as maxShadowLengthIterationCount > 0.
            // When disabling, force the count to 0; when (re-)enabling, restore
            // the current preset's value if it had been zeroed.
            if (config.lightShafts) {
                if (u.maxShadowLengthIterationCount.value === 0) {
                    u.maxShadowLengthIterationCount.value = 500; // "high" default
                }
            } else {
                u.maxShadowLengthIterationCount.value = 0;
            }
        }
        if (config.shadowTemporalPass != null) {
            this.m_shadowTemporalPass = config.shadowTemporalPass;
            // Reset bootstrap so the new mode takes effect immediately.
            this._shadowResolveFrameCount = 0;
        }
        if (config.shadowSplitLambda != null) {
            this.cascadedShadowMaps.splitLambda = config.shadowSplitLambda;
        }
        if (config.shadowSplitMode != null) {
            this.cascadedShadowMaps.splitMode = config.shadowSplitMode;
        }
        // Shader-side uniforms.
        if (config.accurateSunSkyLight != null)
            u.accurateSunSkyLight.value = config.accurateSunSkyLight ? 1 : 0;
        if (config.multiScatteringOctaves != null)
            u.multiScatteringOctaves.value = Math.max(
                1,
                Math.min(8, Math.floor(config.multiScatteringOctaves))
            );
        if (config.turbulence != null) u.turbulenceEnabled.value = config.turbulence ? 1 : 0;
        if (config.opticalDepthTailScale != null)
            u.opticalDepthTailScale.value = config.opticalDepthTailScale;
        if (config.shapeDetail != null && !config.shapeDetail) {
            // Override every layer's shapeDetailAmount to 0 (the shader's
            // If(sum(shapeDetailAmounts) > 0) guard then skips detail sampling).
            for (const layer of u.layers) layer.shapeDetailAmount = 0;
            u.updateLayers();
        }

        if (config.layers != null) {
            u.layers.set(config.layers);
            u.updateLayers();
        }
    }

    setLayer(index: number, config: CloudLayerLike): void {
        this.cloudUniforms.layers[index].set(config);
        this.cloudUniforms.updateLayers();
    }

    setQuality(preset: QualityPreset): void {
        this.cloudUniforms.applyQualityPreset(preset);
    }

    async ensureCloudInit(renderer: Renderer): Promise<void> {
        if (this.cloudInitialized) return;
        this.cloudInitialized = true;

        try {
            stbnTexture.url = resolveResourceUrl("resources/clouds/stbn.bin");
            this.cloudTextures = await CloudTextures.load(resolveResourceUrl("resources/clouds/"));

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
            // Default wind so enabled clouds drift visibly without an explicit
            // velocity config. User-supplied values (including [0,0] to freeze)
            // override these via pendingConfig -> setConfig below.
            this.cloudUniforms.localWeatherVelocity.value.set(0.001, 0);
            this.cloudUniforms.shapeVelocity.value.set(0.001, 0, 0);
            // Detail texture repeats ~20x more often than shape, so scale its
            // velocity down to keep the visual drift proportionate.
            this.cloudUniforms.shapeDetailVelocity.value.set(0.0003, 0, 0);
            this.cloudUniforms.applyQualityPreset("high");
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

            // Apply any config that arrived while textures were still loading,
            // so user-supplied quality/parameters override the "high" default.
            if (this.pendingConfig != null) {
                this.setConfig(this.pendingConfig as any);
                this.pendingConfig = null;
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

        // Prevent onRenderUpdate from overwriting with RTE camera position (0,0,0).
        // RTE cameras have matrixWorld.position = origin, so the automatic onRenderUpdate
        // would compute wrong ECEF values. Store copies that onRenderUpdate can safely read.
        if (!ctx._overrideCameraPositionECEF) ctx._overrideCameraPositionECEF = new Vector3();
        if (!ctx._overrideAltitudeCorrectionECEF)
            ctx._overrideAltitudeCorrectionECEF = new Vector3();
        ctx._overrideCameraPositionECEF.copy(pos);
        ctx._overrideAltitudeCorrectionECEF.set(corrX, corrY, corrZ);

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
        // temporalUpscale=false → full-resolution render every frame (UPSCALE=1).
        // temporalUpscale=true  → render at 1/m_resolutionScale and upscale.
        const UPSCALE = this.m_temporalUpscale ? this.m_resolutionScale : 1;
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
        // mipLevelScale scales weather-texture LOD to match the reduced pixel
        // density. 0.25 matches a 4× downsample; 1.0 at full resolution.
        this.cloudUniforms.mipLevelScale.value = this.m_temporalUpscale
            ? 1 / UPSCALE
            : 1.0;

        const atmoCtx = getAtmosphereContext(renderer);
        const w2eVal = atmoCtx.matrixWorldToECEF.value;
        if (w2eVal) {
            this.cloudUniforms.ecefToWorld.value.copy(w2eVal).invert();
            this.cloudUniforms.worldToECEF.value.copy(w2eVal);
        }

        this._rendererState = resetRendererState(renderer, this._rendererState);

        if (this._depthNode != null) {
            const dt = (this._depthNode as any).value ?? (this._depthNode as any).texture;
            if (dt) this._depthTexUniform.value = dt;
        }

        this.cloudUniforms.frame.value = this._cloudResolveFrameCount % 64;
        stbnFrameUniform.value = this._cloudResolveFrameCount % 64;

        if (this.shadowMarchFn != null && this.shadowMaterial.fragmentNode != null) {
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
                for (let i = 0; i < SHADOW_CASCADE_COUNT; i++) {
                    this.cloudUniforms.reprojectionMatrices[i].value.copy(
                        this.prevShadowMatrices[i]
                    );
                }

                for (let i = 0; i < SHADOW_CASCADE_COUNT; i++) {
                    const cascade = this.cascadedShadowMaps.cascades[i];
                    this.cloudUniforms.shadowMatrices[i].value.copy(cascade.matrix);
                    this.cloudUniforms.inverseShadowMatrices[i].value.copy(cascade.inverseMatrix);
                    this.cloudUniforms.shadowIntervals[i].value.copy(cascade.interval);
                }

                // Single MRT pass: all cascades at once
                this.shadowMRT.setSize(SHADOW_MAP_SIZE, SHADOW_MAP_SIZE);
                renderer.setRenderTarget(this.shadowMRT);
                this.mesh.material = this.shadowMaterial;
                this.mesh.render(renderer);

                if (!this.m_shadowTemporalPass || this._shadowResolveFrameCount < 3) {
                    // Bootstrap (or shadow TAA disabled): copy raw directly to
                    // resolved. When shadowTemporalPass is off, this raw copy
                    // runs every frame — faster, but noisier shadows.
                    for (let i = 0; i < SHADOW_CASCADE_COUNT; i++) {
                        renderer.copyTextureToTexture(
                            this.shadowMRT.textures[i],
                            this.shadowResolvedMRT.textures[i]
                        );
                    }
                } else {
                    // Temporal resolve: 1 MRT pass, all cascades
                    renderer.setRenderTarget(this.shadowResolvedMRT);
                    this.mesh.material = this.shadowResolveMaterial;
                    this.mesh.render(renderer);
                }
                // Only advance the TAA frame counter while the pass is enabled;
                // when disabled we stay in the bootstrap branch indefinitely.
                if (this.m_shadowTemporalPass) {
                    this._shadowResolveFrameCount++;
                }

                // Copy resolved to atlas for AtmosphereLightNode
                for (let i = 0; i < SHADOW_CASCADE_COUNT; i++) {
                    this._tmpAtlasOffset.set(0, i * SHADOW_MAP_SIZE, 0);
                    renderer.copyTextureToTexture(
                        this.shadowResolvedMRT.textures[i],
                        this.shadowArrayTexture.texture,
                        null,
                        this._tmpAtlasOffset
                    );
                }

                for (let i = 0; i < SHADOW_CASCADE_COUNT; i++) {
                    this.prevShadowMatrices[i].copy(this.cloudUniforms.shadowMatrices[i].value);
                }

                // Push shadow data to AtmosphereContext for ground shadow projection.
                atmoCtx.cloudShadowEnabled = true;
                atmoCtx.cloudShadowCascadeCount = SHADOW_CASCADE_COUNT;
                atmoCtx.cloudShadowFar = this.cascadedShadowMaps.far;
                atmoCtx.cloudShadowTopHeight = this.cloudUniforms.shadowTopHeight.value;
                atmoCtx.cloudShadowArrayNode = this.shadowArrayNode;
                for (let i = 0; i < SHADOW_CASCADE_COUNT; i++) {
                    atmoCtx.cloudShadowMatrices[i].copy(this.cloudUniforms.shadowMatrices[i].value);
                    atmoCtx.cloudShadowIntervals[i].copy(
                        this.cloudUniforms.shadowIntervals[i].value as Vector2
                    );
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
        if (this.m_temporalUpscale) {
            const [ox, oy] = bayerOffsets[frame];
            jitterDx = ((ox - 0.5) / virtualWidth) * 4;
            jitterDy = -((oy - 0.5) / virtualHeight) * 4;
        }
        this.temporalJitter.value.set(jitterDx, jitterDy);
        this.cloudUniforms.temporalJitter.value.set(jitterDx, jitterDy);
        this.jitteredInverseProjection.value.copy(jitterCamera.projectionMatrix);
        if (this.m_temporalUpscale) {
            this.jitteredInverseProjection.value.elements[8] += jitterDx * 2;
            this.jitteredInverseProjection.value.elements[9] += jitterDy * 2;
        }
        this.jitteredInverseProjection.value.invert();

        const jitteredProj = this._tmpJitteredProj.copy(jitterCamera.projectionMatrix);
        if (this.m_temporalUpscale) {
            jitteredProj.elements[8] += jitterDx * 2;
            jitteredProj.elements[9] += jitterDy * 2;
        }
        const curVP = this._tmpCurVP.multiplyMatrices(
            jitteredProj,
            jitterCamera.matrixWorldInverse
        );
        this.cloudUniforms.viewProjection.value.copy(curVP);

        if (this.hasPrevCamTransform) {
            const reprojection = this._tmpReprojection.copy(this.prevProjectionMatrix);
            if (this.m_temporalUpscale) {
                reprojection.elements[8] += jitterDx * 2;
                reprojection.elements[9] += jitterDy * 2;
            }
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

        renderer.setRenderTarget(this.lowResRT);
        this.mesh.material = this.lowResMaterial;
        this.mesh.render(renderer);

        // Shadow ping-pong: swap AFTER cloud lowRes (which samples shadowNodes),
        // BEFORE cloud resolve (which samples historyNode). Skipped when shadow
        // TAA is disabled — history is unused, so no need to rotate the buffers.
        if (
            this.shadowMarchFn != null &&
            this.shadowMaterial.fragmentNode != null &&
            this.m_shadowTemporalPass
        ) {
            const tmpShadow = this.shadowResolvedMRT;
            this.shadowResolvedMRT = this.shadowHistoryMRT;
            this.shadowHistoryMRT = tmpShadow;
            for (let i = 0; i < SHADOW_CASCADE_COUNT; i++) {
                this.shadowNodes[i].value = this.shadowResolvedMRT.textures[i];
                this.shadowHistoryNodes[i].value = this.shadowHistoryMRT.textures[i];
            }
        }

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

        // Ping-pong: swap resolve ↔ history for next frame (no blit pass needed)
        this.compositeNode.value = this.resolveRT.texture;
        this.compositeShadowLengthNode.value = this.resolveRT.textures[1];
        const tmp = this.resolveRT;
        this.resolveRT = this.historyRT;
        this.historyRT = tmp;
        this.resolveNodeTex.value = this.resolveRT.texture;
        this.historyNode.value = this.historyRT.texture;
        this.historyShadowLengthNode.value = this.historyRT.textures[1];

        // Notify external consumers (AerialPerspectiveNode) that RT textures
        // changed due to ping-pong swap, so they update their texture references.
        this.onTexturesSwapped?.();

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

        // Match reference: CloudRenderNode does NOT composite clouds into the
        // scene (skipRendering). It only produces the cloud color texture; the
        // actual compositing happens in AerialPerspectiveNode (overlay mechanism).
        // CloudRenderNode passes the scene color through unchanged.
        return this._colorNode;
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

        // BLOCK = low-res pixel block size. When temporalUpscale is on, this
        // equals m_resolutionScale (e.g. 4 → each low-res texel maps a 4×4
        // full-res block). When off, BLOCK = 1: low-res == full-res, the Bayer
        // pattern degenerates (every pixel is "current"), and history
        // reprojection is skipped — yielding a full-res direct path.
        // Read once at Fn build time; changes require _fragmentNodesBuilt
        // reset (see setConfig).
        const BLOCK = this.m_temporalUpscale ? this.m_resolutionScale : 1;

        {
            const lowResResult = struct(
                { color: "vec4", velocity: "vec4", shadowLength: "float" },
                "LowResResult"
            );
            const lowResData = Fn(() => {
                const geo = positionGeometry;
                const positionView = this.jitteredInverseProjection.mul(vec4(geo, 1)).xyz;
                const rayDirection = matrixViewToECEF
                    .mul(vec4(positionView, float(0)))
                    .xyz.normalize();
                const camPosCorrected = u.cameraPosition; // u.cameraPosition already has altitudeCorrection applied

                let sceneDistance;
                const depthViewZ = float(4e5).toVar();
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
                    const sceneDist = viewZ
                        .negate()
                        .div(dot(rayDirection, camForwardECEF.normalize()));
                    sceneDistance = mix(
                        sceneDist,
                        float(1e10),
                        depthVal.greaterThan(float(1).sub(1e-7)).toFloat()
                    );
                } else {
                    sceneDistance = float(1e10);
                }

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

                return lowResResult(
                    clouds.get("color"),
                    vec4(finalDepth, finalVelocity.x, finalVelocity.y, 0),
                    clouds.get("shadowLength")
                );
            })();

            this.lowResMaterial.fragmentNode = mrt({
                color: lowResData.get("color"),
                velocity: lowResData.get("velocity"),
                shadowLength: vec4(lowResData.get("shadowLength").mul(u.worldToUnit), 0, 0, 0)
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

                const lowCoordX = fx.div(BLOCK).floor();
                const lowCoordY = fy.div(BLOCK).floor();
                const lowUv = vec2(
                    lowCoordX.add(0.5).div(lowResSize.x),
                    lowCoordY.add(0.5).div(lowResSize.y)
                );
                // Use texel() (unfiltered, like GLSL texelFetch) instead of
                // texture() (bilinear filtered). The reference uses
                // texelFetch(colorBuffer, lowResCoord, 0) which preserves
                // sharp 4×4 pixel blocks at cloud edges — bilinear smears
                // them into smooth ramps that SMAA cannot detect.
                const lowCoord = ivec2(lowCoordX, lowCoordY);
                const currentColor = this.lowResNode.load(lowCoord);

                const b0 = vec4(0, 12, 3, 15);
                const b1 = vec4(8, 4, 11, 7);
                const b2 = vec4(2, 14, 1, 13);
                const b3 = vec4(10, 6, 9, 5);

                const iPixX = screenCoordinate.x.floor().toInt();
                const iPixY = screenCoordinate.y.floor().toInt();
                const mx = iPixX.mod(BLOCK).toFloat();
                const my = iPixY.mod(BLOCK).toFloat();

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
                const currentShadowLen = texture(this.shadowLengthLowResNode, lowUv).r.toVar();
                const resultShadowLen = currentShadowLen.toVar();

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
                            ivec2(lowCoordX, lowCoordY),
                            currentColor,
                            historyColor
                        );
                        result.assign(clipped);

                        // Shadow length: variance clipping (matches reference cloudsResolve.frag)
                        const historyShadowLen = texture(this.historyShadowLengthNode, prevUv).r;
                        const shadowClipped = _varianceClippingResolve(
                            this.shadowLengthLowResNode,
                            ivec2(lowCoordX, lowCoordY),
                            vec4(currentShadowLen, float(0), float(0), float(1)),
                            vec4(historyShadowLen, float(0), float(0), float(1))
                        );
                        resultShadowLen.assign(shadowClipped.r);
                    });
                });

                return result;
            })();

            // shadowLength resolve: shares temporal logic with color resolve above
            const resolveShadowLength = Fn(() => {
                const lowResSize = vec2(
                    float(1).div(this.lowResTexelSize.x),
                    float(1).div(this.lowResTexelSize.y)
                );
                const fx2 = screenCoordinate.x.floor();
                const fy2 = screenCoordinate.y.floor();
                const lowCoordX2 = fx2.div(BLOCK).floor();
                const lowCoordY2 = fy2.div(BLOCK).floor();
                const lowUv2 = vec2(
                    lowCoordX2.add(0.5).div(lowResSize.x),
                    lowCoordY2.add(0.5).div(lowResSize.y)
                );
                const currentLen = this.shadowLengthLowResNode
                    .load(ivec2(lowCoordX2, lowCoordY2))
                    .r.toVar();

                // Same Bayer pattern as color resolve
                const b0 = vec4(0, 12, 3, 15);
                const b1 = vec4(8, 4, 11, 7);
                const b2 = vec4(2, 14, 1, 13);
                const b3 = vec4(10, 6, 9, 5);
                const iPixX2 = screenCoordinate.x.floor().toInt();
                const iPixY2 = screenCoordinate.y.floor().toInt();
                const mx2 = iPixX2.mod(BLOCK).toFloat();
                const my2 = iPixY2.mod(BLOCK).toFloat();
                const row2 = mx2
                    .lessThan(1)
                    .select(b0, mx2.lessThan(2).select(b1, mx2.lessThan(3).select(b2, b3)));
                const bayerVal2 = my2
                    .lessThan(1)
                    .select(
                        row2.x,
                        my2.lessThan(2).select(row2.y, my2.lessThan(3).select(row2.z, row2.w))
                    );
                const frameMod2 = this.cloudResolveCountNode.mod(16);
                const isCurrent2 = bayerVal2.sub(frameMod2).abs().lessThan(0.5);

                const resultLen = currentLen.toVar();

                If(isCurrent2.not(), () => {
                    const lowCoord = ivec2(lowCoordX2, lowCoordY2);
                    const velocityData = _getClosestFragment(this.velocityLowResNode, lowCoord);
                    const velocity = velocityData.yz;
                    const prevUv = screenUV.sub(velocity);

                    const inBounds = prevUv.x
                        .greaterThanEqual(0)
                        .and(prevUv.x.lessThanEqual(1))
                        .and(prevUv.y.greaterThanEqual(0))
                        .and(prevUv.y.lessThanEqual(1));

                    If(inBounds, () => {
                        const historyLen = texture(this.historyShadowLengthNode, prevUv).r;
                        const shadowClipped = _varianceClippingResolve(
                            this.shadowLengthLowResNode,
                            ivec2(lowCoordX2, lowCoordY2),
                            vec4(currentLen, float(0), float(0), float(1)),
                            vec4(historyLen, float(0), float(0), float(1))
                        );
                        resultLen.assign(shadowClipped.r);
                    });
                });

                return vec4(resultLen, float(0), float(0), float(0));
            })();

            this.resolveMaterial.fragmentNode = mrt({
                color: resolveNode,
                shadowLength: resolveShadowLength
            });
            this.resolveMaterial.needsUpdate = true;
        }

        // Combined shadow MRT: all cascades in 1 pass
        if (this.shadowMarchFn != null) {
            this.cloudUniforms.shadowCascadeCount.value = SHADOW_CASCADE_COUNT;

            // Shadow render: 1 MRT pass, all cascades
            {
                const mrtEntries: Record<string, any> = {};
                for (let i = 0; i < SHADOW_CASCADE_COUNT; i++) {
                    mrtEntries[`c${i}`] = this.shadowMarchFn(i)();
                }
                this.shadowMaterial.fragmentNode = mrt(mrtEntries);
                this.shadowMaterial.needsUpdate = true;
            }

            // Shadow temporal resolve: 1 MRT pass, all cascades
            // Velocity computed analytically from frontDepth + current/prev matrices
            this.shadowResolveMaterial.name = "Clouds [Shadow Resolve]";
            {
                const resolveEntries: Record<string, any> = {};
                for (let i = 0; i < SHADOW_CASCADE_COUNT; i++) {
                    const shadowColorTex = texture(this.shadowMRT.textures[i]);
                    const shadowHistoryTex = this.shadowHistoryNodes[i];

                    const perCascade = Fn(() => {
                        const coord = ivec2(screenCoordinate);
                        const currentColor = shadowColorTex.load(coord).toVar();

                        // 9-tap closest fragment: find minimum frontDepth in 3x3 neighborhood
                        const closestDepth = float(1e7).toVar();
                        const ox = int(-1).toVar();
                        Loop({ start: -1, end: 2, type: "int" }, () => {
                            const oy = int(-1).toVar();
                            Loop({ start: -1, end: 2, type: "int" }, () => {
                                const neighbor = shadowColorTex.load(coord.add(ivec2(ox, oy)));
                                closestDepth.assign(min(closestDepth, neighbor.x));
                                oy.addAssign(int(1));
                            });
                            ox.addAssign(int(1));
                        });

                        // Use closest-fragment frontDepth for velocity
                        const frontDepth = closestDepth;
                        const invMat = this.cloudUniforms.inverseShadowMatrices[i];
                        const clip = vec3(screenUV.mul(2).sub(1), float(-1));
                        const point = invMat.mul(vec4(clip, float(1)));
                        const pDiv = point.xyz.div(point.w);
                        const sunPos = this.cloudUniforms.worldToECEF
                            .mul(vec4(pDiv, float(1)))
                            .xyz.add(this.cloudUniforms.altitudeCorrection);
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
                            disc.lessThan(0).select(float(0), b.negate().sub(sqrt(disc)).mul(0.5))
                        );
                        const rayOrigin = rayNear.mul(rayDir).add(sunPos);

                        const frontPosition = frontDepth.mul(rayDir).add(rayOrigin);
                        const frontWorld = this.cloudUniforms.ecefToWorld.mul(
                            vec4(frontPosition.sub(this.cloudUniforms.altitudeCorrection), 1)
                        ).xyz;
                        const prevClip = this.cloudUniforms.reprojectionMatrices[i].mul(
                            vec4(frontWorld, 1)
                        );
                        const prevUv = prevClip.xy.div(prevClip.w).mul(0.5).add(0.5);

                        const result = currentColor.toVar();

                        {
                            const inBounds = prevUv.x
                                .greaterThanEqual(0)
                                .and(prevUv.x.lessThanEqual(1))
                                .and(prevUv.y.greaterThanEqual(0))
                                .and(prevUv.y.lessThanEqual(1));

                            If(inBounds, () => {
                                const historyColor = texture(shadowHistoryTex, prevUv);
                                const clipped = _varianceClippingResolve(
                                    shadowColorTex,
                                    coord,
                                    currentColor,
                                    historyColor,
                                    _shadowVarianceGamma
                                );
                                result.assign(mix(clipped, currentColor, float(0.01)));
                            });
                        }

                        return result;
                    })();

                    resolveEntries[`c${i}`] = perCascade;
                }
                this.shadowResolveMaterial.fragmentNode = mrt(resolveEntries);
                this.shadowResolveMaterial.needsUpdate = true;
            }
        }
    }

    override dispose(): void {
        this.lowResRT.dispose();
        this.historyRT.dispose();
        this.resolveRT.dispose();
        this.shadowMRT.dispose();
        this.shadowResolvedMRT.dispose();
        this.shadowHistoryMRT.dispose();
        this.shadowArrayTexture.dispose();
        this.lowResMaterial.dispose();
        this.resolveMaterial.dispose();
        this.shadowMaterial.dispose();
        this.shadowResolveMaterial.dispose();
        this.mesh.geometry.dispose();
        super.dispose();
    }
}

export const cloudRender = (
    colorNode: Node<"vec4">,
    depthNode?: Node | null,
    renderer?: Renderer
): CloudRenderNode => new CloudRenderNode(colorNode, depthNode, renderer);
