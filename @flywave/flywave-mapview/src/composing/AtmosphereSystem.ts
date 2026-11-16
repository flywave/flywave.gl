// @ts-nocheck
/* Copyright (C) 2025 flywave.gl contributors */

import {
    type AtmosphereCelestialUniforms,
    type SkyNode,
    AtmosphereContext,
    AtmosphereLight,
    AtmosphereLightNode,
    AtmosphereLUTNode,
    AtmosphereParameters,
    registerAtmosphereContext,
    resolveResourceUrl,
    sky,
    skyEnvironment,
    updateCelestialDirections
} from "@flywave/flywave-atmosphere";
import { CascadedShadowMapsNode } from "@flywave/flywave-atmosphere";
import {
    type AerialPerspectiveConfig,
    type AtmosphereThemeConfig,
    type CloudConfig,
    type ToneMappingMode
} from "@flywave/flywave-datasource-protocol";
import { ProjectionType } from "@flywave/flywave-geoutils";
import { texture } from "three/tsl";
import type { Renderer } from "three/webgpu";
import * as THREE from "three/webgpu";

import { TiltViewClipPlanesEvaluator } from "../ClipPlanesEvaluator";
import { type MapView } from "../MapView";
import { EarthCelestialDirections } from "./celestial/EarthCelestialDirections";
import { JulianDate } from "./celestial/JulianDate";
import { Simon1994PlanetaryPositions } from "./celestial/Simon1994PlanetaryPositions";
import { TRANSLUCENT_LAYER_BIT, TranslucentLayerEffect } from "./vrm/TranslucentLayerEffect";
import { ViewRenderManager } from "./vrm/ViewRenderManager";

const FRUSTUM_CORNERS = [
    { x: -1, y: -1, z: -1 },
    { x: 1, y: -1, z: -1 },
    { x: -1, y: 1, z: -1 },
    { x: 1, y: 1, z: -1 },
    { x: -1, y: -1, z: 1 },
    { x: 1, y: -1, z: 1 },
    { x: -1, y: 1, z: 1 },
    { x: 1, y: 1, z: 1 }
];

/** Clamp a theme cascade count into the range the CSM split scheme supports. */
function clampShadowCascades(value: number): number {
    return Math.min(4, Math.max(2, Math.round(value)));
}

/** Clamp a theme shadow-map size into [256, 4096] and snap it to a power of two. */
function clampShadowMapSize(value: number): number {
    const size = Math.min(4096, Math.max(256, Math.round(value)));
    return 2 ** Math.round(Math.log2(size));
}

export class AtmosphereSystem {
    private static readonly MOON_RADIUS = 1737400;
    private static readonly SHADOW_DISABLE_DISTANCE = 2e5;
    /**
     * Upper bound for the adaptive shadow-range floor (m). The shadow far must never
     * collapse below a floor, or the cut-off line where shadows stop lands inside the
     * typical tilted view as a hard brightness step (low-sun long-shadow views make it
     * obvious — a near-horizontal seam across the terrain). The floor now scales with the
     * camera height above terrain (3 km–20 km) instead of always being 20 km, so a
     * street-level view does not pay for a 20 km cascade-3 footprint.
     */
    private static readonly SHADOW_MINIMUM_DISTANCE = 20000;

    /**
     * Faint sky fill so the night side of the globe keeps a natural (moonlit) look instead of
     * going pitch black — the same role the ambient night light plays in other globe engines.
     * The sun dominates the day side, so the fill is barely perceptible there.
     */
    private static readonly NIGHT_AMBIENT_INTENSITY = 0.4;

    private currentDate?: Date;
    private targetDate?: Date;
    private m_sunTimeTransitionDuration: number = 2000;
    private m_lastSunTimeUpdateMs: number = 0;
    private readonly m_celestialDirections: EarthCelestialDirections;
    private m_atmosphereContext?: AtmosphereContext;
    private m_skyNode?: SkyNode;
    private m_atmosphereLight?: AtmosphereLight;
    private m_nightAmbientLight?: THREE.HemisphereLight;
    private m_csmShadowNode?: CascadedShadowMapsNode;
    private m_atmosphereEnabled: boolean = true;
    private m_cloudsEnabled: boolean = false;
    // Full cloud config (including quality preset + per-parameter overrides).
    // Kept here because the VRM/cloudNode may not exist yet when updateOptions
    // runs; applyCloudConfig() pushes it to the cloudNode once it is ready.
    private m_cloudConfig: Record<string, unknown> | null = null;
    private m_showGround: boolean = true;
    private m_raymarchScattering: boolean = true;
    private m_higherOrderScatteringTexture: boolean = true;
    private m_accurateShadowScattering: boolean = true;
    private m_correctAltitude: boolean = true;
    private m_constrainCamera: boolean = true;
    // Shadow configuration (theme: atmosphere.sunShadow*). Applied by
    // applyShadowOptions(); changing the cascade count rebuilds the CSM node and
    // forces shadow materials to recompile.
    private m_shadowCascades = 4;
    private m_shadowMapSize = 2048;
    private m_shadowFilter: "pcf" | "pcf-soft" = "pcf-soft";
    private m_shadowMaxDistance?: number;
    private readonly m_atmosphereOverrides: {
        rayleighScale: number;
        mieScale: number;
        groundAlbedo: number;
        miePhaseFunctionG: number;
        luminanceScale: number;
    } = {
        rayleighScale: 1,
        mieScale: 1,
        groundAlbedo: 0.3,
        miePhaseFunctionG: 0.8,
        luminanceScale: 0
    };

    private readonly m_rebuildScheduled: boolean = false;
    private m_toneMappingExposure: number = 3;
    private m_toneMappingMode?: ToneMappingMode;
    private m_lastCsmMaxFar: number = 0;
    private m_lastCsmClosest: number = 0;
    private readonly m_scratchMoonPos = new THREE.Vector3();

    private static readonly CONTEXT_KEY = "getAtmosphere";

    constructor(private readonly mapView: MapView) {
        this.m_celestialDirections = new EarthCelestialDirections();
        this.init();
    }

    private get isSpherical(): boolean {
        return this.mapView.projection.type === ProjectionType.Spherical;
    }

    private init(): void {
        this.buildAtmosphereContext();
        this.init2();
    }

    private buildAtmosphereContext(): void {
        const baseParams = new AtmosphereParameters();
        const o = this.m_atmosphereOverrides;

        baseParams.rayleighScattering.multiplyScalar(o.rayleighScale);
        baseParams.mieScattering.multiplyScalar(o.mieScale);
        baseParams.mieExtinction.multiplyScalar(o.mieScale);
        baseParams.groundAlbedo.setScalar(o.groundAlbedo);
        baseParams.miePhaseFunctionG = o.miePhaseFunctionG;
        if (o.luminanceScale > 0) baseParams.luminanceScale = o.luminanceScale;

        const lutNode = new AtmosphereLUTNode(baseParams);
        this.m_atmosphereContext = new AtmosphereContext(baseParams, lutNode);
        this.m_atmosphereContext.camera = this.mapView.camera;
        this.m_atmosphereContext._overrideCameraPositionECEF = this.mapView.camera.position;
        this.m_atmosphereContext.showGround = this.m_showGround;
        this.m_atmosphereContext.raymarchScattering = this.m_raymarchScattering;
        this.m_atmosphereContext.accurateShadowScattering = this.m_accurateShadowScattering;
        this.m_atmosphereContext.correctAltitude = this.m_correctAltitude;
        this.m_atmosphereContext.constrainCamera = this.m_constrainCamera;
        registerAtmosphereContext(this.m_atmosphereContext);
    }

    private rebuildAtmosphere(): void {
        if (!this.m_atmosphereContext) return;
        this.m_atmosphereContext.dispose();
        this.buildAtmosphereContext();

        const renderer = this.mapView.renderer as Renderer & {
            contextNode?: { value: Record<string, unknown> };
        };
        if (renderer?.contextNode?.value) {
            renderer.contextNode.value[AtmosphereSystem.CONTEXT_KEY] = () =>
                this.m_atmosphereContext;
        }

        const vrm = this.mapView?.mapRenderingManager?.viewRenderManager;
        if (vrm) vrm.needsUpdate = true;
    }

    private init2(): void {
        // Shadow budget from the constructor-time MapView options. These cannot be
        // changed after the first shadow pass (the CSM node's per-cascade lights are
        // created then), so they must be read before any material compiles.
        this.m_shadowCascades = clampShadowCascades(this.mapView.shadowCascades);
        this.m_shadowMapSize = clampShadowMapSize(this.mapView.shadowMapSize);
        this.m_shadowFilter = this.mapView.shadowFilter;
        this.m_shadowMaxDistance = this.mapView.shadowMaxDistance;

        this.m_skyNode = sky();
        this.m_skyNode.showSun = true;
        this.m_skyNode.showMoon = true;
        this.m_skyNode.showStars = true;
        this.m_skyNode.moonNode.intensity.value = 10;
        this.loadMoonTextures();

        this.m_atmosphereLight = new AtmosphereLight(1e5, "sun");
        this.m_atmosphereLight.intensity = 1;
        this.m_atmosphereLight.castShadow = true;
        this.m_atmosphereLight.shadow.mapSize.set(this.m_shadowMapSize, this.m_shadowMapSize);
        // Default filter for the sun shadows; the theme can override it at runtime
        // through `atmosphere.sunShadowFilter` (see applyShadowOptions). three r186
        // removed PCFSoftShadowMap for WebGPURenderer, so both "pcf" and "pcf-soft"
        // resolve to PCFShadowMap (which now provides the soft filter).
        this.mapView.renderer.shadowMap.type = THREE.PCFShadowMap;
        // Constant NDC bias must stay 0 here: the cascade depth shell spans ±lightMargin
        // (≈20 km), so even -0.0005 maps to ~20 m of world depth offset — enough to
        // peter-pan a meter-scale model's whole shadow off its receiver (shadows appear
        // halved/absent). Depth comparison relies on the world-space normalBias instead.
        this.m_atmosphereLight.shadow.bias = 0;
        this.m_atmosphereLight.shadow.normalBias = 0.02;
        this.m_atmosphereLight.shadow.camera.near = 0;
        this.m_atmosphereLight.shadow.camera.far = 3e5;
        this.m_atmosphereLight.shadow.camera.left = -1e5;
        this.m_atmosphereLight.shadow.camera.right = 1e5;
        this.m_atmosphereLight.shadow.camera.top = 1e5;
        this.m_atmosphereLight.shadow.camera.bottom = -1e5;

        this.m_csmShadowNode = new CascadedShadowMapsNode(this.m_atmosphereLight);
        this.m_csmShadowNode.cascades = this.m_shadowCascades;
        this.m_csmShadowNode.maxFar = 1e5;
        this.m_csmShadowNode.fade = false;
        this.m_atmosphereLight.shadow.shadowNode = this.m_csmShadowNode;

        // Night-side sky fill: a faint bluish hemisphere light keeps the unlit hemisphere
        // readable (moonlit look) instead of rendering pure black.
        this.m_nightAmbientLight = new THREE.HemisphereLight(
            0x33455e,
            0x0a0c10,
            AtmosphereSystem.NIGHT_AMBIENT_INTENSITY
        );

        this.mapView.ready.then(() => {
            const renderer = this.mapView.renderer as Renderer & {
                contextNode?: { value: Record<string, unknown> };
            };
            if (renderer.contextNode != null) {
                renderer.contextNode.value[AtmosphereSystem.CONTEXT_KEY] = () =>
                    this.m_atmosphereContext;
            }

            // three r187 registers the custom light node on the light class
            // itself (`Light.registerNode`). Host bundles still shipping an
            // older three only expose the legacy `renderer.library.addLight`,
            // so detect at runtime: a planar map never renders the atmosphere
            // light, and must not die during startup because of a version
            // mismatch in this optional registration.
            const registrableLight = AtmosphereLight as typeof AtmosphereLight & {
                registerNode?: (nodeClass: typeof AtmosphereLightNode) => void;
            };
            const lightLibrary = (
                renderer as {
                    library?: {
                        addLight?: (
                            lightClass: typeof AtmosphereLight,
                            nodeClass: typeof AtmosphereLightNode
                        ) => void;
                    };
                }
            ).library;
            if (typeof registrableLight.registerNode === "function") {
                registrableLight.registerNode(AtmosphereLightNode);
            } else if (typeof lightLibrary?.addLight === "function") {
                lightLibrary.addLight(AtmosphereLight, AtmosphereLightNode);
            }

            const scene = this.mapView.scene as THREE.Scene & {
                backgroundNode?: THREE.Scene["backgroundNode"];
                environmentNode?: THREE.Scene["environmentNode"];
            };

            if (!this.isSpherical) {
                this.m_toneMappingExposure = 1;
                // Planar default; a mode the theme set explicitly wins.
                if (this.m_toneMappingMode === undefined) {
                    this.m_toneMappingMode = "aces";
                }
            }

            const vrm = new ViewRenderManager(renderer);
            vrm.csmShadowNode = this.m_csmShadowNode;
            const canvas = renderer.domElement as HTMLCanvasElement;
            vrm.setSize(canvas.clientWidth || 1, canvas.clientHeight || 1);
            vrm.exposure.value = this.m_toneMappingExposure;
            renderer.toneMapping = THREE.NoToneMapping;
            // Async effect loads (e.g. LUT textures) request a frame through
            // this hook once their needsUpdate flag is set.
            vrm.onNeedsRender = () => {
                this.mapView.update();
            };
            this.mapView.mapRenderingManager.viewRenderManager = vrm;
            this.mapView.mapRenderingManager.syncPostEffectsToVRM();
            // VRM now exists — push any cloud config that updateOptions()
            // received earlier (it had no VRM to apply to at that time).
            this.applyCloudConfig();

            const cam = this.mapView.getRteCamera();
            this.mapView.mapRenderingManager.setTranslucentRenderer(
                renderer,
                this.mapView.scene,
                cam
            );
            this.applyToneMappingMode();

            this.m_atmosphereLight.layers.enable(TRANSLUCENT_LAYER_BIT);
            this.mapView.scene.add(this.m_atmosphereLight);

            if (this.m_nightAmbientLight != null) {
                this.m_nightAmbientLight.layers.enable(TRANSLUCENT_LAYER_BIT);
                this.mapView.scene.add(this.m_nightAmbientLight);
            }

            this.applyAtmosphereEnabled();
        });
    }

    get atmosphereContext(): AtmosphereContext | undefined {
        return this.m_atmosphereContext;
    }

    get isSunTimeAnimating(): boolean {
        return this.targetDate !== undefined;
    }

    update(date?: Date): void {
        if (date !== undefined) {
            this.currentDate = date;
            this.targetDate = undefined;
        } else {
            this.interpolateSunTime();
        }

        const d = this.currentDate ?? new Date();

        if (this.m_atmosphereContext != null) {
            updateCelestialDirections(
                this.m_atmosphereContext as unknown as AtmosphereCelestialUniforms,
                this.m_celestialDirections,
                d
            );

            this.updateMoonAngularRadius(d);
            this.updateCsmMaxFar();

            if (this.m_atmosphereLight != null) {
                this.m_atmosphereLight.target.position.set(0, 0, 0);
                this.m_atmosphereLight.target.updateMatrixWorld();
            }
        }
    }

    updateOptions(options?: AtmosphereThemeConfig): void {
        if (options?.sunTime !== undefined) {
            this.targetDate = new Date(options.sunTime);
            if (this.currentDate === undefined) {
                this.currentDate = new Date(options.sunTime);
                this.targetDate = undefined;
            }
        }
        if (options?.sunTimeTransitionDuration !== undefined) {
            this.m_sunTimeTransitionDuration = options.sunTimeTransitionDuration;
        }
        if (options?.enabled !== undefined) {
            this.m_atmosphereEnabled = options.enabled;
        }
        if (options?.sunCastShadow !== undefined) {
            this.mapView.shadowsEnabled = options.sunCastShadow;
        }
        this.applyShadowOptions(options);
        if (options?.clouds !== undefined) {
            this.m_cloudsEnabled = typeof options.clouds === "boolean" ? options.clouds : true;
            if (typeof options.clouds === "object") {
                this.m_cloudConfig = { ...this.m_cloudConfig, ...options.clouds };
                this.applyCloudConfig();
            }
        }
        if (
            options?.aerialPerspective !== undefined &&
            typeof options.aerialPerspective === "object"
        ) {
            const vrm = this.mapView?.mapRenderingManager?.viewRenderManager;
            if (vrm) {
                vrm.config.aerialPerspective = {
                    ...vrm.config.aerialPerspective,
                    ...options.aerialPerspective
                };
                if (vrm.aerialNode != null) {
                    vrm.aerialNode.setConfig(options.aerialPerspective);
                }
                vrm.needsUpdate = true;
            }
        }
        const ctx = this.m_atmosphereContext;
        let needsPipelineRebuild = false;
        if (ctx != null) {
            if (options?.showGround !== undefined && options.showGround !== this.m_showGround) {
                this.m_showGround = options.showGround;
                ctx.showGround = this.m_showGround;
                needsPipelineRebuild = true;
            }
            if (
                options?.raymarchScattering !== undefined &&
                options.raymarchScattering !== this.m_raymarchScattering
            ) {
                this.m_raymarchScattering = options.raymarchScattering;
                ctx.raymarchScattering = this.m_raymarchScattering;
                needsPipelineRebuild = true;
            }
            if (
                options?.higherOrderScatteringTexture !== undefined &&
                options.higherOrderScatteringTexture !== this.m_higherOrderScatteringTexture
            ) {
                this.m_higherOrderScatteringTexture = options.higherOrderScatteringTexture;
                ctx.parameters.higherOrderScatteringTexture = this.m_higherOrderScatteringTexture;
                needsPipelineRebuild = true;
            }
            if (
                options?.accurateShadowScattering !== undefined &&
                options.accurateShadowScattering !== this.m_accurateShadowScattering
            ) {
                this.m_accurateShadowScattering = options.accurateShadowScattering;
                ctx.accurateShadowScattering = this.m_accurateShadowScattering;
                needsPipelineRebuild = true;
            }
            if (
                options?.correctAltitude !== undefined &&
                options.correctAltitude !== this.m_correctAltitude
            ) {
                this.m_correctAltitude = options.correctAltitude;
                ctx.correctAltitude = this.m_correctAltitude;
                needsPipelineRebuild = true;
            }
            if (
                options?.constrainCamera !== undefined &&
                options.constrainCamera !== this.m_constrainCamera
            ) {
                this.m_constrainCamera = options.constrainCamera;
                ctx.constrainCamera = this.m_constrainCamera;
                needsPipelineRebuild = true;
            }
        }
        if (needsPipelineRebuild) {
            const vrm = this.mapView?.mapRenderingManager?.viewRenderManager;
            if (vrm != null) vrm.needsUpdate = true;
        }
        let needsAtmosphereRebuild = false;
        const ap = options?.atmosphereParams;
        if (ap != null && typeof ap === "object") {
            if (
                ap.rayleighScale != null &&
                ap.rayleighScale !== this.m_atmosphereOverrides.rayleighScale
            ) {
                this.m_atmosphereOverrides.rayleighScale = ap.rayleighScale;
                needsAtmosphereRebuild = true;
            }
            if (ap.mieScale != null && ap.mieScale !== this.m_atmosphereOverrides.mieScale) {
                this.m_atmosphereOverrides.mieScale = ap.mieScale;
                needsAtmosphereRebuild = true;
            }
            if (
                ap.groundAlbedo != null &&
                ap.groundAlbedo !== this.m_atmosphereOverrides.groundAlbedo
            ) {
                this.m_atmosphereOverrides.groundAlbedo = ap.groundAlbedo;
                needsAtmosphereRebuild = true;
            }
            if (
                ap.miePhaseFunctionG != null &&
                ap.miePhaseFunctionG !== this.m_atmosphereOverrides.miePhaseFunctionG
            ) {
                this.m_atmosphereOverrides.miePhaseFunctionG = ap.miePhaseFunctionG;
                needsAtmosphereRebuild = true;
            }
            if (
                ap.luminanceScale != null &&
                ap.luminanceScale !== this.m_atmosphereOverrides.luminanceScale
            ) {
                this.m_atmosphereOverrides.luminanceScale = ap.luminanceScale;
                needsAtmosphereRebuild = true;
            }
        }
        if (needsAtmosphereRebuild) this.rebuildAtmosphere();
        this.applyAtmosphereEnabled();
    }

    /**
     * Apply the `atmosphere.sunShadow*` theme knobs.
     *
     * Cascades and map size are baked into the CSM node on the first shadow pass
     * (the per-cascade lights and depth targets are created then). Swapping the
     * node afterwards crashes `CSMShadowNode.updateBefore` (its camera is still
     * null) and disposing the old maps silently leaves stale shadow textures, so
     * those two knobs are constructor-time only ({@link MapViewOptions}), and a
     * late theme change is ignored with a warning. The filter (a program cache
     * key) and the maximum distance stay live.
     */
    private applyShadowOptions(options?: AtmosphereThemeConfig): void {
        if (options == null) return;

        const csmInitialized =
            this.m_csmShadowNode != null && this.m_csmShadowNode.lights.length > 0;
        const requestedCascades = clampShadowCascades(
            options.sunShadowCascades ?? this.m_shadowCascades
        );
        const requestedMapSize = clampShadowMapSize(
            options.sunShadowMapSize ?? this.m_shadowMapSize
        );
        const nextFilter = options.sunShadowFilter ?? this.m_shadowFilter;
        const nextMaxDistance =
            options.sunShadowMaxDistance !== undefined
                ? options.sunShadowMaxDistance > 0
                    ? Math.min(
                          options.sunShadowMaxDistance,
                          AtmosphereSystem.SHADOW_DISABLE_DISTANCE
                      )
                    : undefined
                : this.m_shadowMaxDistance;

        // Cascades/map size only before the first shadow render.
        const nextCascades = csmInitialized ? this.m_shadowCascades : requestedCascades;
        const nextMapSize = csmInitialized ? this.m_shadowMapSize : requestedMapSize;
        if (
            csmInitialized &&
            (requestedCascades !== nextCascades || requestedMapSize !== nextMapSize)
        ) {
            logger.warn(
                "atmosphere.sunShadowCascades/sunShadowMapSize changed after shadow rendering " +
                    "started; set MapViewOptions.shadowCascades/shadowMapSize (or reload) instead."
            );
        }

        const cascadesChanged = nextCascades !== this.m_shadowCascades;
        const mapSizeChanged = nextMapSize !== this.m_shadowMapSize;
        const filterChanged = nextFilter !== this.m_shadowFilter;
        const maxDistanceChanged = nextMaxDistance !== this.m_shadowMaxDistance;
        if (!cascadesChanged && !mapSizeChanged && !filterChanged && !maxDistanceChanged) {
            return;
        }

        this.m_shadowCascades = nextCascades;
        this.m_shadowMapSize = nextMapSize;
        this.m_shadowFilter = nextFilter;
        this.m_shadowMaxDistance = nextMaxDistance;

        const light = this.m_atmosphereLight;
        if (light != null) {
            if (mapSizeChanged) {
                light.shadow.mapSize.set(nextMapSize, nextMapSize);
            }
            if (filterChanged) {
                // r186: PCFSoftShadowMap is gone; PCFShadowMap is the soft filter.
                this.mapView.renderer.shadowMap.type = THREE.PCFShadowMap;
            }
            if (cascadesChanged) {
                this.rebuildCsmShadowNode(nextCascades);
            }
            // Force a fresh split/layout pass with the new settings.
            this.m_lastCsmMaxFar = 0;
            this.m_lastCsmClosest = 0;
        }

        this.mapView.update();
    }

    /**
     * Replace the CSM node. Only safe before the first shadow pass: the new node
     * starts with `camera === null` and `lights.length === 0`, and its
     * `updateBefore` would throw if it were plugged into a running light graph.
     */
    private rebuildCsmShadowNode(cascades: number): void {
        const light = this.m_atmosphereLight;
        if (light == null) return;

        const previous = this.m_csmShadowNode;
        if (previous != null) {
            previous.dispose();
        }

        const csm = new CascadedShadowMapsNode(light);
        csm.cascades = cascades;
        csm.maxFar = 1e5;
        csm.fade = false;
        light.shadow.shadowNode = csm;
        this.m_csmShadowNode = csm;
    }

    updateToneMapping(exposure?: number, mode?: ToneMappingMode): void {
        if (exposure !== undefined) {
            this.m_toneMappingExposure = exposure;
            const renderer = this.mapView.renderer as import("three/webgpu").Renderer | null;
            if (renderer != null) renderer.toneMappingExposure = this.m_toneMappingExposure;
            const vrm = this.mapView.mapRenderingManager.viewRenderManager;
            if (vrm != null) {
                vrm.exposure.value = this.m_toneMappingExposure;
            }
        }
        if (mode !== undefined) {
            this.m_toneMappingMode = mode;
            this.applyToneMappingMode();
        }
    }

    /**
     * Push the persisted cloud config (quality preset + overrides) to the
     * cloudNode. Called from updateOptions() and re-callable later once the
     * VRM/cloudNode has been created by the first render.
     */
    private applyCloudConfig(): void {
        if (this.m_cloudConfig == null) return;
        const vrm = this.mapView?.mapRenderingManager?.viewRenderManager;
        if (vrm == null) return;
        // Re-apply whenever the cloud node finishes its async init, in case
        // updateOptions ran before the node existed.
        vrm.onCloudNodeReady = () => {
            this.applyCloudConfig();
        };
        if (vrm.cloudNode != null) {
            vrm.cloudNode.setConfig(this.m_cloudConfig as any);
        } else {
            // CloudNode is created lazily in buildNodeGraph; hand the config
            // over via the VRM's pending slot so it is applied on creation.
            vrm.pendingCloudConfig = this.m_cloudConfig;
        }
    }

    private applyToneMappingMode(): void {
        const mode = this.m_toneMappingMode;
        if (mode == null) return;
        const renderer = this.mapView.renderer as import("three/webgpu").Renderer | null;
        if (renderer == null) return;
        const vrm = this.mapView.mapRenderingManager.viewRenderManager;
        renderer.toneMapping = THREE.NoToneMapping;
        renderer.toneMappingExposure = this.m_toneMappingExposure;
        if (vrm != null) {
            vrm.config.toneMappingMode = mode;
            vrm.exposure.value = this.m_toneMappingExposure;
            vrm.needsUpdate = true;
        }
    }

    getCurrentDate(): Date {
        return this.currentDate ?? this.targetDate ?? new Date();
    }

    setCurrentDate(date: Date, instant: boolean = false): void {
        if (instant || this.m_sunTimeTransitionDuration <= 0) {
            this.currentDate = date;
            this.targetDate = undefined;
        } else {
            this.targetDate = date;
            if (this.currentDate === undefined) {
                this.currentDate = new Date(date.getTime());
                this.targetDate = undefined;
            }
        }
        this.update();
        this.mapView.update();
    }

    private static readonly MS_PER_DAY = 86400000;

    private timeOfDayMs(d: Date): number {
        return (
            ((d.getHours() * 60 + d.getMinutes()) * 60 + d.getSeconds()) * 1000 +
            d.getMilliseconds()
        );
    }

    private interpolateSunTime(): void {
        if (this.targetDate === undefined || this.currentDate === undefined) {
            return;
        }

        const now = performance.now();
        if (this.m_lastSunTimeUpdateMs === 0) {
            this.m_lastSunTimeUpdateMs = now;
        }
        const deltaMs = Math.min(now - this.m_lastSunTimeUpdateMs, 100);
        this.m_lastSunTimeUpdateMs = now;

        const target = this.targetDate;
        const duration = this.m_sunTimeTransitionDuration;

        if (duration <= 0) {
            this.currentDate = new Date(target.getTime());
            this.targetDate = undefined;
            this.m_lastSunTimeUpdateMs = 0;
            return;
        }

        // Step 1: Instantly snap calendar date (year/month/day) to target
        const cur = this.currentDate;
        if (
            cur.getFullYear() !== target.getFullYear() ||
            cur.getMonth() !== target.getMonth() ||
            cur.getDate() !== target.getDate()
        ) {
            this.currentDate = new Date(
                target.getFullYear(),
                target.getMonth(),
                target.getDate(),
                cur.getHours(),
                cur.getMinutes(),
                cur.getSeconds(),
                cur.getMilliseconds()
            );
        }

        if (deltaMs <= 0) return;

        // Step 2: Interpolate time-of-day (ms since midnight) using shortest path
        const curTod = this.timeOfDayMs(this.currentDate);
        const tgtTod = this.timeOfDayMs(target);

        let diff = tgtTod - curTod;
        if (diff > AtmosphereSystem.MS_PER_DAY / 2) diff -= AtmosphereSystem.MS_PER_DAY;
        if (diff < -AtmosphereSystem.MS_PER_DAY / 2) diff += AtmosphereSystem.MS_PER_DAY;

        if (Math.abs(diff) < 1) {
            this.currentDate = new Date(target.getTime());
            this.targetDate = undefined;
            this.m_lastSunTimeUpdateMs = 0;
            return;
        }

        const timeConstant = duration / 5;
        const alpha = 1 - Math.exp(-deltaMs / timeConstant);
        const newTod = curTod + diff * alpha;

        // Wrap into [0, MS_PER_DAY) and construct date on target's calendar day
        const wrappedTod =
            ((newTod % AtmosphereSystem.MS_PER_DAY) + AtmosphereSystem.MS_PER_DAY) %
            AtmosphereSystem.MS_PER_DAY;
        const totalSec = Math.floor(wrappedTod / 1000);
        this.currentDate = new Date(
            target.getFullYear(),
            target.getMonth(),
            target.getDate(),
            Math.floor(totalSec / 3600),
            Math.floor((totalSec % 3600) / 60),
            totalSec % 60,
            Math.round(wrappedTod % 1000)
        );
    }

    private loadMoonTextures(): void {
        const skyNode = this.m_skyNode;
        if (skyNode == null) return;

        const loader = new THREE.TextureLoader();
        const resolve = (uri: string) => resolveResourceUrl(uri);

        const colorTex = loader.load(resolve("resources/moon/color.jpg"), tex => {
            tex.colorSpace = THREE.SRGBColorSpace;
            tex.anisotropy = 16;
        });
        skyNode.moonNode.colorNode = texture(colorTex);

        const displacementTex = loader.load(resolve("resources/moon/displacement.jpg"), tex => {
            tex.colorSpace = THREE.NoColorSpace;
            tex.generateMipmaps = false;
        });
        skyNode.moonNode.displacementNode = texture(displacementTex);
    }

    private updateMoonAngularRadius(date: Date): void {
        const skyNode = this.m_skyNode;
        if (skyNode == null) return;

        const jd = JulianDate.fromDate(date);
        Simon1994PlanetaryPositions.computeMoonPositionInEarthInertialFrame(
            jd,
            this.m_scratchMoonPos
        );
        const distance = this.m_scratchMoonPos.length();
        const angularRadius = AtmosphereSystem.MOON_RADIUS / distance;
        skyNode.moonNode.angularRadius.value = angularRadius;
    }

    private updateCsmMaxFar(): void {
        const csm = this.m_csmShadowNode;
        const light = this.m_atmosphereLight;
        if (csm == null || light == null) return;

        // The far PLANE stays globe-spanning (d + r + maxElev, reversed depth — nothing visible
        // is ever clipped, so looking far away costs nothing). But the CSM cascades need the
        // SCENE extent: fed the planetary far they spread over 200 km and shadow resolution
        // collapses to sub-texel mush (a 100 m caster under a single ~12 m texel). Give them
        // the tight, view-dependent scene far (the pre-globe-coverage formula) instead; the
        // disable branch below still switches shadows off at horizon-scale ranges.
        const projection = this.mapView.projection;
        const sceneFar =
            projection.type === ProjectionType.Spherical
                ? (this.mapView.clipPlanesEvaluator as TiltViewClipPlanesEvaluator).computeSceneFar(
                      this.mapView.camera,
                      projection,
                      this.mapView.elevationProvider
                  )
                : Number(this.mapView.viewRanges.far);

        // Cesium-style closest-object proxy: the camera height above TERRAIN stands in for the
        // nearest receiver size (a camera skimming 20 m above the ground observes meter-scale
        // receivers; a satellite view only needs block-scale shadows). NOTE this must be the
        // height above the elevation surface, NOT the ellipsoid altitude — terrain at 300 m
        // would otherwise make a street-level camera read "large objects" and never clamp.
        // Below the small-object threshold the CascadedShadowMapsNode clamps each cascade's
        // depth extent, decoupling near resolution from the total range.
        const groundDistance = projection.groundDistance(this.mapView.camera.position);
        const terrainElevation = this.mapView.elevationProvider?.getHeight(
            this.mapView.projection.unprojectPoint(this.mapView.camera.position),
            14
        );
        const heightAboveTerrain =
            terrainElevation !== undefined ? groundDistance - terrainElevation : groundDistance;
        csm.closestObjectSize = Math.max(heightAboveTerrain, 1);

        // Planetary kill-switch: judged on the UNCLAMPED scene estimate. The previous code
        // compared the already-clamped `viewFar` against the limit, so the branch could never
        // fire and shadows stayed enabled at horizon/globe scale.
        const userMaxDistance = this.m_shadowMaxDistance;
        if (userMaxDistance === undefined && sceneFar > AtmosphereSystem.SHADOW_DISABLE_DISTANCE) {
            if (light.castShadow) {
                light.castShadow = false;
            }
            return;
        }

        // Adaptive shadow-range floor: keep the full 20 km only for high/aerial cameras; a
        // street-level view scales the floor with the camera height (3 km–20 km) so the
        // cascade split distances — and the footprint each cascade re-renders — stay small.
        // Measured on the stress demo: a 4-cascade 20 km range put the whole caster set into
        // cascades 2 and 3; capping the range to 3 km cut shadow draw calls by ~26% at the
        // same load. An explicit `sunShadowMaxDistance` wins over both the scene estimate and
        // the floor. ×10 matches the visible ground footprint at a 55° tilt.
        const adaptiveFloor = Math.min(
            AtmosphereSystem.SHADOW_MINIMUM_DISTANCE,
            Math.max(3000, heightAboveTerrain * 10)
        );
        const viewFar =
            userMaxDistance !== undefined
                ? Math.min(userMaxDistance, AtmosphereSystem.SHADOW_DISABLE_DISTANCE)
                : Math.min(
                      Math.max(sceneFar, adaptiveFloor),
                      AtmosphereSystem.SHADOW_DISABLE_DISTANCE
                  );

        if (!light.castShadow && this.m_atmosphereEnabled && this.mapView.shadowsEnabled) {
            light.castShadow = true;
        }

        csm.lightMargin = viewFar;

        // Sun elevation drives the per-cascade caster sweep length (shadow length is
        // casterHeight / sin(elevation)). The scene is RTE (a translation of ECEF), so
        // the camera's radial direction is the local up and the light position points
        // towards the sun in the same frame.
        const up = this.mapView.camera.position.clone().normalize();
        const sunDirection = light.position.clone().normalize();
        csm.sunElevationSin = THREE.MathUtils.clamp(Math.abs(sunDirection.dot(up)), 0.05, 1);

        const desiredMaxFar = viewFar;
        const ratio = this.m_lastCsmMaxFar > 0 ? desiredMaxFar / this.m_lastCsmMaxFar : Infinity;
        // Rebuild splits when the scene range changes by >10%, and when the closest-object
        // proxy changes by >4%. The tighter closest gate keeps the (now smoothly blended)
        // clamp transition small from frame to frame: a 10% step near the 200 m threshold
        // would still move the cascade splits by tens of metres at once, which the
        // per-cascade caster culling turns into a visible shadow pop.
        const closestRatio =
            this.m_lastCsmClosest > 0 ? csm.closestObjectSize / this.m_lastCsmClosest : Infinity;

        if (ratio > 1.1 || ratio < 0.9 || closestRatio > 1.04 || closestRatio < 0.96) {
            if (csm.camera != null) {
                csm.maxFar = desiredMaxFar;
                csm.updateFrustums();
                this.m_lastCsmMaxFar = desiredMaxFar;
                this.m_lastCsmClosest = csm.closestObjectSize;
            }
        }

        for (let i = 0; i < csm.lights.length; i++) {
            const sc = csm.lights[i].shadow.camera;
            sc.near = 0;
            sc.far = viewFar * 3;
            sc.updateProjectionMatrix();
        }
    }

    private applyAtmosphereEnabled(): void {
        const effective = this.m_atmosphereEnabled && this.isSpherical;

        const vrm = this.mapView.mapRenderingManager.viewRenderManager;
        const desiredLensFlare = effective;
        const desiredAerial = effective;
        const desiredClouds = effective && this.m_cloudsEnabled;

        const vrmChanged =
            vrm == null ||
            vrm.config.lensFlare.enabled !== desiredLensFlare ||
            vrm.config.aerialPerspective.enabled !== desiredAerial ||
            (vrm.config.clouds != null && vrm.config.clouds.enabled !== desiredClouds);

        const lightNeedsUpdate =
            this.m_atmosphereLight != null &&
            (this.m_atmosphereLight.visible !== effective ||
                this.m_atmosphereLight.castShadow !== (effective && this.mapView.shadowsEnabled));

        const scene = this.mapView.scene as THREE.Scene & {
            backgroundNode?: THREE.Scene["backgroundNode"];
            environmentNode?: THREE.Scene["environmentNode"];
        };
        const sceneNeedsUpdate = effective
            ? scene.backgroundNode !== (this.m_skyNode as THREE.Scene["backgroundNode"])
            : scene.backgroundNode != null || scene.environmentNode != null;

        if (!vrmChanged && !lightNeedsUpdate && !sceneNeedsUpdate) {
            return;
        }

        if (lightNeedsUpdate && this.m_atmosphereLight != null) {
            this.m_atmosphereLight.visible = effective;
            this.m_atmosphereLight.castShadow = effective && this.mapView.shadowsEnabled;
            // Without the atmosphere there is no sun; theme lights take over, so the night
            // fill must not double up with them.
            if (this.m_nightAmbientLight != null) {
                this.m_nightAmbientLight.visible = effective;
            }
        }

        if (sceneNeedsUpdate) {
            if (effective) {
                scene.background = null;
                scene.backgroundNode = this.m_skyNode as THREE.Scene["backgroundNode"];
                scene.environmentNode =
                    skyEnvironment() as unknown as THREE.Scene["environmentNode"];
            } else {
                scene.backgroundNode = null;
                scene.environmentNode = null;
            }
        }

        if (vrmChanged && vrm != null) {
            vrm.config.lensFlare.enabled = desiredLensFlare;
            vrm.config.aerialPerspective.enabled = desiredAerial;
            if (vrm.config.clouds != null) {
                vrm.config.clouds.enabled = desiredClouds;
            }
            vrm.needsUpdate = true;
        }
    }
}
