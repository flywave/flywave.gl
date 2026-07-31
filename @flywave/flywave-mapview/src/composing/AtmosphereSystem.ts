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
    private readonly m_celestialDirections: EarthCelestialDirections;
    private m_atmosphereContext?: AtmosphereContext;
    private m_skyNode?: SkyNode;
    private m_atmosphereLight?: AtmosphereLight;
    private m_csmShadowNode?: CascadedShadowMapsNode;
    private m_atmosphereEnabled: boolean = true;
    private m_sunCastShadow: boolean = true;
    private m_cloudsEnabled: boolean = false;
    private m_showGround: boolean = true;
    private m_raymarchScattering: boolean = true;
    private m_higherOrderScatteringTexture: boolean = true;
    private m_accurateShadowScattering: boolean = true;
    private m_correctAltitude: boolean = true;
    private m_constrainCamera: boolean = true;
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
        const parameters = new AtmosphereParameters();
        const lutNode = new AtmosphereLUTNode(parameters);
        this.m_atmosphereContext = new AtmosphereContext(parameters, lutNode);
        this.m_atmosphereContext.camera = this.mapView.camera;
        this.m_atmosphereContext._overrideCameraPositionECEF = this.mapView.camera.position;
        this.m_atmosphereContext.showGround = this.m_showGround;
        this.m_atmosphereContext.raymarchScattering = this.m_raymarchScattering;
        this.m_atmosphereContext.accurateShadowScattering = this.m_accurateShadowScattering;
        this.m_atmosphereContext.correctAltitude = this.m_correctAltitude;
        this.m_atmosphereContext.constrainCamera = this.m_constrainCamera;
        registerAtmosphereContext(this.m_atmosphereContext);

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

            if (this.isSpherical) {
                const vrm = new ViewRenderManager(renderer);
                vrm.csmShadowNode = this.m_csmShadowNode;
                (scene as any).__atmosphereContext = this.m_atmosphereContext;
                const canvas = renderer.domElement as HTMLCanvasElement;
                vrm.setSize(canvas.clientWidth || 1, canvas.clientHeight || 1);
                vrm.exposure.value = this.m_toneMappingExposure;
                renderer.toneMapping = THREE.NoToneMapping;
                this.mapView.mapRenderingManager.viewRenderManager = vrm;
                this.mapView.mapRenderingManager.syncPostEffectsToVRM();
            } else {
                renderer.toneMapping = THREE.ACESFilmicToneMapping;
            }

            this.m_atmosphereLight.layers.enable(TRANSLUCENT_LAYER_BIT);
            this.mapView.scene.add(this.m_atmosphereLight);

            this.applyAtmosphereEnabled();
        });
    }

    get atmosphereContext(): AtmosphereContext | undefined {
        return this.m_atmosphereContext;
    }

    update(date?: Date): void {
        const d = date ?? this.currentDate ?? new Date();

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
            this.currentDate = new Date(options.sunTime);
        }
        if (options?.enabled !== undefined) {
            this.m_atmosphereEnabled = options.enabled;
        }
        if (options?.sunCastShadow !== undefined) {
            this.m_sunCastShadow = options.sunCastShadow;
        }
        if (options?.clouds !== undefined) {
            this.m_cloudsEnabled = typeof options.clouds === "boolean" ? options.clouds : true;
            const vrm = this.mapView?.mapRenderingManager?.viewRenderManager;
            if (typeof options.clouds === "object") {
                if (vrm?.cloudNode != null) {
                    vrm.cloudNode.setConfig(options.clouds);
                } else if (vrm != null) {
                    vrm.pendingCloudConfig = options.clouds;
                }
            }
        }
        if (
            options?.aerialPerspective !== undefined &&
            typeof options.aerialPerspective === "object"
        ) {
            const vrm = this.mapView?.mapRenderingManager?.viewRenderManager;
            if (vrm?.aerialNode != null) {
                vrm.aerialNode.setConfig(options.aerialPerspective);
            }
        }
        const ctx = this.m_atmosphereContext;
        if (ctx != null) {
            if (options?.showGround !== undefined) {
                this.m_showGround = options.showGround;
                ctx.showGround = this.m_showGround;
            }
            if (options?.raymarchScattering !== undefined) {
                this.m_raymarchScattering = options.raymarchScattering;
                ctx.raymarchScattering = this.m_raymarchScattering;
            }
            if (options?.higherOrderScatteringTexture !== undefined) {
                this.m_higherOrderScatteringTexture = options.higherOrderScatteringTexture;
                ctx.parameters.higherOrderScatteringTexture = this.m_higherOrderScatteringTexture;
            }
            if (options?.accurateShadowScattering !== undefined) {
                this.m_accurateShadowScattering = options.accurateShadowScattering;
                ctx.accurateShadowScattering = this.m_accurateShadowScattering;
            }
            if (options?.correctAltitude !== undefined) {
                this.m_correctAltitude = options.correctAltitude;
                ctx.correctAltitude = this.m_correctAltitude;
            }
            if (options?.constrainCamera !== undefined) {
                this.m_constrainCamera = options.constrainCamera;
                ctx.constrainCamera = this.m_constrainCamera;
            }
        }
        this.applyAtmosphereEnabled();
    }

    updateToneMapping(exposure?: number, mode?: ToneMappingMode): void {
        if (exposure !== undefined) {
            this.m_toneMappingExposure = exposure;
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

    private applyToneMappingMode(): void {
        const mode = this.m_toneMappingMode;
        if (mode == null) return;
        const renderer = this.mapView.renderer as import("three/webgpu").Renderer | null;
        if (renderer == null) return;
        const vrm = this.mapView.mapRenderingManager.viewRenderManager;
        if (mode === "agx-punchy") {
            renderer.toneMapping = THREE.NoToneMapping;
            if (vrm != null) vrm.config.toneMappingMode = "agx-punchy";
        } else {
            if (vrm != null) vrm.config.toneMappingMode = mode;
            switch (mode) {
                case "linear":
                    renderer.toneMapping = THREE.LinearToneMapping;
                    break;
                case "reinhard":
                    renderer.toneMapping = THREE.ReinhardToneMapping;
                    break;
                case "aces":
                    renderer.toneMapping = THREE.ACESFilmicToneMapping;
                    break;
                case "agx":
                    renderer.toneMapping = THREE.AgXToneMapping;
                    break;
                case "neutral":
                    renderer.toneMapping = THREE.NeutralToneMapping;
                    break;
            }
        }
    }

    getCurrentDate(): Date {
        return this.currentDate ?? new Date();
    }

    setCurrentDate(date: Date): void {
        this.currentDate = date;
        this.update();
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

        if (this.m_atmosphereLight != null) {
            this.m_atmosphereLight.visible = effective;
            this.m_atmosphereLight.castShadow = effective && this.m_sunCastShadow;
        }

        const scene = this.mapView.scene as THREE.Scene & {
            backgroundNode?: THREE.Scene["backgroundNode"];
            environmentNode?: THREE.Scene["environmentNode"];
        };
        if (effective) {
            scene.background = null;
            scene.backgroundNode = this.m_skyNode as THREE.Scene["backgroundNode"];
            scene.environmentNode = skyEnvironment() as unknown as THREE.Scene["environmentNode"];
        } else {
            scene.backgroundNode = null;
            scene.environmentNode = null;
        }

        const vrm = this.mapView.mapRenderingManager.viewRenderManager;
        if (vrm != null) {
            vrm.config.lensFlare.enabled = effective;
            vrm.config.aerialPerspective.enabled = effective;
            if (vrm.config.clouds != null) {
                vrm.config.clouds.enabled = effective && this.m_cloudsEnabled;
            }
            vrm.needsUpdate = true;
        }
    }
}
