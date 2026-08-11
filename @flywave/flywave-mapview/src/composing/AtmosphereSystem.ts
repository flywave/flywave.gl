// @ts-nocheck
/* Copyright (C) 2025 flywave.gl contributors */

import {
    AtmosphereContext,
    type AtmosphereCelestialUniforms,
    AtmosphereLUTNode,
    AtmosphereLight,
    AtmosphereLightNode,
    AtmosphereParameters,
    SkyNode,
    sky,
    skyEnvironment,
    updateCelestialDirections,
    registerAtmosphereContext,
    resolveResourceUrl
} from "@flywave/flywave-atmosphere";
import * as THREE from "three/webgpu";
import type { Renderer } from "three/webgpu";
import { texture } from "three/tsl";

import { CascadedShadowMapsNode } from "@flywave/flywave-atmosphere";
import {
    type AtmosphereThemeConfig,
    type CloudConfig,
    type AerialPerspectiveConfig,
    type ToneMappingMode
} from "@flywave/flywave-datasource-protocol";
import { ProjectionType } from "@flywave/flywave-geoutils";

import { ViewRenderManager } from "./vrm/ViewRenderManager";
import { TranslucentLayerEffect, TRANSLUCENT_LAYER_BIT } from "./vrm/TranslucentLayerEffect";
import { type MapView } from "../MapView";
import { EarthCelestialDirections } from "./celestial/EarthCelestialDirections";
import { JulianDate } from "./celestial/JulianDate";
import { Simon1994PlanetaryPositions } from "./celestial/Simon1994PlanetaryPositions";

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

export class AtmosphereSystem {
    private static readonly MOON_RADIUS = 1737400;
    private static readonly SHADOW_DISABLE_DISTANCE = 2e5;

    private currentDate?: Date;
    private targetDate?: Date;
    private m_sunTimeTransitionDuration: number = 2000;
    private m_lastSunTimeUpdateMs: number = 0;
    private readonly m_celestialDirections: EarthCelestialDirections;
    private m_atmosphereContext?: AtmosphereContext;
    private m_skyNode?: SkyNode;
    private m_atmosphereLight?: AtmosphereLight;
    private m_csmShadowNode?: CascadedShadowMapsNode;
    private m_atmosphereEnabled: boolean = true;
    private m_sunCastShadow: boolean = true;
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
    private m_atmosphereOverrides: {
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
    private m_rebuildScheduled: boolean = false;
    private m_toneMappingExposure: number = 3;
    private m_toneMappingMode?: ToneMappingMode;
    private m_lastCsmMaxFar: number = 0;
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
        this.m_skyNode = sky();
        this.m_skyNode.showSun = true;
        this.m_skyNode.showMoon = true;
        this.m_skyNode.showStars = true;
        this.m_skyNode.moonNode.intensity.value = 10;
        this.loadMoonTextures();

        this.m_atmosphereLight = new AtmosphereLight(1e5, "sun");
        this.m_atmosphereLight.intensity = 1;
        this.m_atmosphereLight.castShadow = true;
        this.m_atmosphereLight.shadow.mapSize.set(2048, 2048);
        this.m_atmosphereLight.shadow.bias = -0.0005;
        this.m_atmosphereLight.shadow.normalBias = 0.1;
        this.m_atmosphereLight.shadow.camera.near = 0;
        this.m_atmosphereLight.shadow.camera.far = 3e5;
        this.m_atmosphereLight.shadow.camera.left = -1e5;
        this.m_atmosphereLight.shadow.camera.right = 1e5;
        this.m_atmosphereLight.shadow.camera.top = 1e5;
        this.m_atmosphereLight.shadow.camera.bottom = -1e5;

        this.m_csmShadowNode = new CascadedShadowMapsNode(this.m_atmosphereLight);
        this.m_csmShadowNode.cascades = 4;
        this.m_csmShadowNode.maxFar = 1e5;
        this.m_csmShadowNode.fade = false;
        this.m_atmosphereLight.shadow.shadowNode = this.m_csmShadowNode;

        this.mapView.ready.then(() => {
            const renderer = this.mapView.renderer as Renderer & {
                contextNode?: { value: Record<string, unknown> };
                library: {
                    addLight: (
                        nodeClass: typeof AtmosphereLightNode,
                        lightClass: typeof AtmosphereLight
                    ) => void;
                };
            };
            if (renderer.contextNode != null) {
                renderer.contextNode.value[AtmosphereSystem.CONTEXT_KEY] = () =>
                    this.m_atmosphereContext;
            }

            renderer.library.addLight(AtmosphereLightNode, AtmosphereLight);

            const scene = this.mapView.scene as THREE.Scene & {
                backgroundNode?: THREE.Scene["backgroundNode"];
                environmentNode?: THREE.Scene["environmentNode"];
            };

            if (!this.isSpherical) {
                this.m_toneMappingExposure = 1;
                this.m_toneMappingMode = "aces";
            }

            const vrm = new ViewRenderManager(renderer);
            vrm.csmShadowNode = this.m_csmShadowNode;
            const canvas = renderer.domElement as HTMLCanvasElement;
            vrm.setSize(canvas.clientWidth || 1, canvas.clientHeight || 1);
            vrm.exposure.value = this.m_toneMappingExposure;
            renderer.toneMapping = THREE.NoToneMapping;
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
            this.m_sunCastShadow = options.sunCastShadow;
        }
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
            if (ap.rayleighScale != null && ap.rayleighScale !== this.m_atmosphereOverrides.rayleighScale) {
                this.m_atmosphereOverrides.rayleighScale = ap.rayleighScale;
                needsAtmosphereRebuild = true;
            }
            if (ap.mieScale != null && ap.mieScale !== this.m_atmosphereOverrides.mieScale) {
                this.m_atmosphereOverrides.mieScale = ap.mieScale;
                needsAtmosphereRebuild = true;
            }
            if (ap.groundAlbedo != null && ap.groundAlbedo !== this.m_atmosphereOverrides.groundAlbedo) {
                this.m_atmosphereOverrides.groundAlbedo = ap.groundAlbedo;
                needsAtmosphereRebuild = true;
            }
            if (ap.miePhaseFunctionG != null && ap.miePhaseFunctionG !== this.m_atmosphereOverrides.miePhaseFunctionG) {
                this.m_atmosphereOverrides.miePhaseFunctionG = ap.miePhaseFunctionG;
                needsAtmosphereRebuild = true;
            }
            if (ap.luminanceScale != null && ap.luminanceScale !== this.m_atmosphereOverrides.luminanceScale) {
                this.m_atmosphereOverrides.luminanceScale = ap.luminanceScale;
                needsAtmosphereRebuild = true;
            }
        }
        if (needsAtmosphereRebuild) this.rebuildAtmosphere();
        this.applyAtmosphereEnabled();
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
        vrm.onCloudNodeReady = () => this.applyCloudConfig();
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

        const viewFar = this.mapView.viewRanges.far;

        if (viewFar > AtmosphereSystem.SHADOW_DISABLE_DISTANCE) {
            if (light.castShadow) {
                light.castShadow = false;
            }
            return;
        }

        if (!light.castShadow && this.m_atmosphereEnabled && this.m_sunCastShadow) {
            light.castShadow = true;
        }

        csm.lightMargin = viewFar;

        const desiredMaxFar = viewFar;
        const ratio = this.m_lastCsmMaxFar > 0 ? desiredMaxFar / this.m_lastCsmMaxFar : Infinity;

        if (ratio > 1.1 || ratio < 0.9) {
            if (csm.camera != null) {
                csm.maxFar = desiredMaxFar;
                csm.updateFrustums();
                this.m_lastCsmMaxFar = desiredMaxFar;
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
                this.m_atmosphereLight.castShadow !== (effective && this.m_sunCastShadow));

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
            this.m_atmosphereLight.castShadow = effective && this.m_sunCastShadow;
        }

        if (sceneNeedsUpdate) {
            if (effective) {
                scene.background = null;
                scene.backgroundNode = this.m_skyNode as THREE.Scene["backgroundNode"];
                scene.environmentNode = skyEnvironment() as unknown as THREE.Scene["environmentNode"];
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
