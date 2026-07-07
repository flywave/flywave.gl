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

export class AtmosphereSystem {
    private static readonly MOON_RADIUS = 1737400;

    private currentDate?: Date;
    private readonly m_celestialDirections: EarthCelestialDirections;
    private m_atmosphereContext?: AtmosphereContext;
    private m_skyNode?: SkyNode;
    private m_atmosphereLight?: AtmosphereLight;
    private m_atmosphereEnabled: boolean = true;
    private m_sunCastShadow: boolean = true;
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

        this.m_atmosphereLight = new AtmosphereLight(this.mapView.camera.position.length(), "sun");
        this.m_atmosphereLight.intensity = 1;
        this.m_atmosphereLight.castShadow = true;
        this.m_atmosphereLight.shadow.mapSize.set(2048, 2048);
        this.m_atmosphereLight.shadow.bias = -0.0005;
        this.m_atmosphereLight.shadow.normalBias = 0.1;

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

            if (this.m_atmosphereLight != null) {
                const sunDir = this.m_atmosphereContext.sunDirectionECEF
                    .value as unknown as THREE.Vector3;
                this.m_atmosphereLight.position.copy(sunDir).multiplyScalar(-1);
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
