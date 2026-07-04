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
import { type Renderer } from "three/webgpu";

import { ViewRenderManager } from "./vrm/ViewRenderManager";
import { TranslucentLayerEffect } from "./vrm/TranslucentLayerEffect";
import { type MapView } from "../MapView";
import { EarthCelestialDirections } from "./celestial/EarthCelestialDirections";

export interface AtmosphereSystemOptions {
    sunTime?: number;
}

export class AtmosphereSystem {
    private currentDate?: Date;
    private readonly m_celestialDirections: EarthCelestialDirections;
    private m_atmosphereContext?: AtmosphereContext;
    private m_skyNode?: SkyNode;
    private m_atmosphereLight?: AtmosphereLight;

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
            vrm.config.lensFlare.enabled = true;
            vrm.config.aerialPerspective.enabled = true;
            vrm.config.taa.enabled = true;
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
        this.currentDate = options?.sunTime ? new Date(options.sunTime) : undefined;
    }

    getCurrentDate(): Date {
        return this.currentDate ?? new Date();
    }

    setCurrentDate(date: Date): void {
        this.currentDate = date;
        this.update();
    }
}
