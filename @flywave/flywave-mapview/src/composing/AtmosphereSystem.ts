/* Copyright (C) 2025 flywave.gl contributors */

import {
    AtmosphereContext,
    type AtmosphereCelestialUniforms,
    AtmosphereLUTNode,
    AtmosphereLight,
    AtmosphereLightNode,
    AtmosphereParameters,
    SkyNode,
    skyBackground,
    skyEnvironment,
    updateCelestialDirections,
    registerAtmosphereContext
} from "@flywave/flywave-atmosphere";
import * as THREE from "three";
import { texture } from "three/tsl";
import { type Renderer } from "three/webgpu";
import { CSMShadowNode } from "three/examples/jsm/csm/CSMShadowNode.js";

import { ViewRenderManager } from "./vrm/ViewRenderManager";
import { TranslucentLayerEffect } from "./vrm/TranslucentLayerEffect";
import { type MapView } from "../MapView";
import { EarthCelestialDirections } from "./celestial/EarthCelestialDirections";
import { JulianDate } from "./celestial/JulianDate";
import { Simon1994PlanetaryPositions } from "./celestial/Simon1994PlanetaryPositions";

export interface AtmosphereSystemOptions {
    atmosphere?: boolean;
    sunTime?: number;
    sunCastShadow?: boolean;
}

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
    private m_csmShadowNode?: CSMShadowNode;
    private m_atmosphereEnabled: boolean = true;
    private m_sunCastShadow: boolean = true;
    private m_lastCsmMaxFar: number = 0;
    private readonly m_scratchMoonPos = new THREE.Vector3();

    private static readonly CONTEXT_KEY = "getAtmosphere";

    constructor(private readonly mapView: MapView) {
        this.m_celestialDirections = new EarthCelestialDirections();
        this.init();
    }

    private init(): void {
        const parameters = new AtmosphereParameters();
        const lutNode = new AtmosphereLUTNode(parameters);
        this.m_atmosphereContext = new AtmosphereContext(parameters, lutNode);
        this.m_atmosphereContext.camera = this.mapView.camera;
        this.m_atmosphereContext._overrideCameraPositionECEF = this.mapView.camera.position;
        registerAtmosphereContext(this.m_atmosphereContext);

        this.m_skyNode = skyBackground();
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

        this.m_csmShadowNode = new CSMShadowNode(this.m_atmosphereLight);
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
            scene.background = null;
            scene.backgroundNode = this.m_skyNode as THREE.Scene["backgroundNode"];
            scene.environmentNode = skyEnvironment() as unknown as THREE.Scene["environmentNode"];

            const vrm = new ViewRenderManager(renderer);
            vrm.csmShadowNode = this.m_csmShadowNode;
            const canvas = renderer.domElement as HTMLCanvasElement;
            vrm.setSize(canvas.clientWidth || 1, canvas.clientHeight || 1);
            renderer.toneMapping = THREE.NoToneMapping;
            this.mapView.mapRenderingManager.viewRenderManager = vrm;
            this.mapView.mapRenderingManager.syncPostEffectsToVRM();

            const cam = this.mapView.getRteCamera();
            this.mapView.mapRenderingManager.setTranslucentRenderer(
                renderer,
                this.mapView.scene,
                cam
            );

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

    updateOptions(options?: AtmosphereSystemOptions): void {
        if (options?.sunTime !== undefined) {
            this.currentDate = new Date(options.sunTime);
        }
        if (options?.atmosphere !== undefined) {
            this.m_atmosphereEnabled = options.atmosphere;
        }
        if (options?.sunCastShadow !== undefined) {
            this.m_sunCastShadow = options.sunCastShadow;
        }
        this.applyAtmosphereEnabled();
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

        const colorTex = loader.load("resources/moon/color.jpg", tex => {
            tex.colorSpace = THREE.SRGBColorSpace;
            tex.anisotropy = 16;
        });
        skyNode.moonNode.colorNode = texture(colorTex);

        const displacementTex = loader.load("resources/moon/displacement.jpg", tex => {
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
        skyNode.moonNode.angularRadius.value = AtmosphereSystem.MOON_RADIUS / distance;
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
        const enabled = this.m_atmosphereEnabled;

        if (this.m_atmosphereLight != null) {
            this.m_atmosphereLight.visible = enabled;
            this.m_atmosphereLight.castShadow = enabled && this.m_sunCastShadow;
        }

        const scene = this.mapView.scene as THREE.Scene & {
            backgroundNode?: THREE.Scene["backgroundNode"];
            environmentNode?: THREE.Scene["environmentNode"];
        };
        if (enabled) {
            scene.backgroundNode = this.m_skyNode as THREE.Scene["backgroundNode"];
            scene.environmentNode = skyEnvironment() as unknown as THREE.Scene["environmentNode"];
        } else {
            scene.backgroundNode = null;
            scene.environmentNode = null;
        }

        const vrm = this.mapView.mapRenderingManager.viewRenderManager;
        if (vrm != null) {
            vrm.config.lensFlare.enabled = enabled;
            vrm.config.aerialPerspective.enabled = enabled;
            vrm.needsUpdate = true;
        }
    }
}
