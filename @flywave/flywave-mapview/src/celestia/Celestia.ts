/* Copyright (C) 2025 flywave.gl contributors */

import * as THREE from "three";

import { MapObjectAdapter } from "../MapObjectAdapter";
import { type MapView } from "../MapView";
import { AtmosphereLightMode, MapViewAtmosphere } from "../MapViewAtmosphere";
import { type MapViewEnvironmentOptions } from "../MapViewEnvironment";
import { SunLight } from "./sun/SunLight";
import {
    AerialPerspectiveEffect,
    DEFAULT_PRECOMPUTED_TEXTURES_URL,
    TRANSMITTANCE_TEXTURE_WIDTH,
    TRANSMITTANCE_TEXTURE_HEIGHT,
    IRRADIANCE_TEXTURE_WIDTH,
    IRRADIANCE_TEXTURE_HEIGHT,
    SCATTERING_TEXTURE_WIDTH,
    SCATTERING_TEXTURE_HEIGHT,
    SCATTERING_TEXTURE_DEPTH
} from "../thirdparty/three-atmosphere";
import { EXRTextureLoader, EXR3DTextureLoader } from "../thirdparty/three-geospatial";
import type { PrecomputedTextures } from "../thirdparty/three-atmosphere";
import type { Texture } from "three";

class BaseMapObjectAdapter extends MapObjectAdapter {
    isPickable() {
        return false;
    }
}

export interface CelestiaOptions {
    atmosphere?: boolean;

    enableSunLight?: boolean;

    sunTime?: number;

    sunCastShadow?: boolean;

    sunIntensity?: number;

    sunColor?: string;
}

export class Celestia extends THREE.Object3D {
    private readonly sun: SunLight;
    private readonly moon: THREE.Object3D;
    private readonly enabled: { sun: boolean; moon: boolean };
    private currentDate?: Date;
    private readonly mapViewAtmosphere: MapViewAtmosphere;
    private ignoreAtmosphereBloom: boolean;
    private aerialPerspectiveEffect?: AerialPerspectiveEffect;
    private aerialPerspectiveAdded = false;
    private texturesLoaded = false;

    constructor(
        private readonly mapView: MapView,
        envOptions: MapViewEnvironmentOptions,
        options?: CelestiaOptions
    ) {
        super();
        this.enabled = { sun: false, moon: false };

        this.mapViewAtmosphere = new MapViewAtmosphere(
            mapView.mapAnchors,
            mapView.camera,
            mapView.projection,
            mapView.renderer.capabilities
        );

        const mapAdapter = new BaseMapObjectAdapter(new THREE.Object3D(), {});

        this.mapViewAtmosphere.groundMesh.userData.mapAdapter = mapAdapter;
        this.mapViewAtmosphere.skyMesh.userData.mapAdapter = mapAdapter;
        this.mapViewAtmosphere.lightMode = AtmosphereLightMode.LightDynamic;

        this.mapViewAtmosphere.enabled = options?.atmosphere ?? false;

        this.sun = new SunLight(mapView, this.mapViewAtmosphere);
        this.toggleSun(true);

        mapView.scene.add(this);
    }

    public update() {
        this.sun?.update(this.currentDate || new Date());

        if (
            this.mapViewAtmosphere.enabled &&
            !this.aerialPerspectiveAdded &&
            !this.texturesLoaded
        ) {
            this.loadTexturesAndCreateEffect();
        }

        if (this.aerialPerspectiveEffect) {
            const mainCamera = this.mapView.camera;
            const ecefPos = mainCamera.position;
            this.aerialPerspectiveEffect.uniforms
                .get("worldToECEFMatrix")
                .value.makeTranslation(ecefPos.x, ecefPos.y, ecefPos.z);
            this.aerialPerspectiveEffect.uniforms
                .get("sunDirection")
                .value.copy(this.sun.direction);
        }
    }

    private loadTexturesAndCreateEffect(): void {
        if (this.aerialPerspectiveAdded || this.texturesLoaded) return;
        this.aerialPerspectiveAdded = true;

        const baseUrl = DEFAULT_PRECOMPUTED_TEXTURES_URL;
        let loaded = 0;
        const total = 3;
        const textures: Partial<PrecomputedTextures> = {};

        const tryCreate = () => {
            if (++loaded < total) return;
            this.texturesLoaded = true;
            console.log("Atmosphere textures loaded:", Object.keys(textures));
            try {
                this.createAerialPerspectiveEffect(textures as PrecomputedTextures);
            } catch (e) {
                console.error("Failed to create aerial perspective effect:", e);
            }
        };

        const transmittanceLoader = new EXRTextureLoader({
            width: TRANSMITTANCE_TEXTURE_WIDTH,
            height: TRANSMITTANCE_TEXTURE_HEIGHT
        });
        transmittanceLoader.load(
            `${baseUrl}/transmittance.exr`,
            tex => {
                console.log("transmittance loaded");
                textures.transmittanceTexture = tex;
                tryCreate();
            },
            undefined,
            err => {
                console.error("Failed to load transmittance texture:", err);
                tryCreate();
            }
        );

        const scatteringLoader = new EXR3DTextureLoader({
            width: SCATTERING_TEXTURE_WIDTH,
            height: SCATTERING_TEXTURE_HEIGHT,
            depth: SCATTERING_TEXTURE_DEPTH
        });
        scatteringLoader.load(
            `${baseUrl}/scattering.exr`,
            tex => {
                console.log("scattering loaded");
                textures.scatteringTexture = tex as any;
                tryCreate();
            },
            undefined,
            err => {
                console.error("Failed to load scattering texture:", err);
                tryCreate();
            }
        );

        const irradianceLoader = new EXRTextureLoader({
            width: IRRADIANCE_TEXTURE_WIDTH,
            height: IRRADIANCE_TEXTURE_HEIGHT
        });
        irradianceLoader.load(
            `${baseUrl}/irradiance.exr`,
            tex => {
                console.log("irradiance loaded");
                textures.irradianceTexture = tex;
                tryCreate();
            },
            undefined,
            err => {
                console.error("Failed to load irradiance texture:", err);
                tryCreate();
            }
        );
    }

    private createAerialPerspectiveEffect(textures: PrecomputedTextures): void {
        this.aerialPerspectiveEffect = new AerialPerspectiveEffect(undefined, {
            transmittanceTexture: textures.transmittanceTexture,
            scatteringTexture: textures.scatteringTexture as any,
            irradianceTexture: textures.irradianceTexture,
            singleMieScatteringTexture: textures.singleMieScatteringTexture as any,
            higherOrderScatteringTexture: textures.higherOrderScatteringTexture as any
        }) as AerialPerspectiveEffect & { enabled: boolean };

        (this.aerialPerspectiveEffect as any).enabled = true;
        this.aerialPerspectiveEffect.transmittance = true;
        this.aerialPerspectiveEffect.inscatter = true;
        this.aerialPerspectiveEffect.reconstructNormal = true;
        this.aerialPerspectiveEffect.sky = true;
        this.aerialPerspectiveEffect.combinedScatteringTextures = true;

        this.mapView.mapRenderingManager.addCustomEffect({
            id: "aerial-perspective",
            effect: this.aerialPerspectiveEffect,
            enabled: true,
            order: -100
        });
    }

    public updateOptions(options?: CelestiaOptions) {
        this.mapViewAtmosphere.enabled = options?.atmosphere ?? false;

        this.currentDate = options?.sunTime ? new Date(options.sunTime) : undefined;
        if (options?.sunColor) this.sun.setUserColor(options.sunColor);
        if (options?.sunIntensity) this.sun.setUserIntensityFactor(options.sunIntensity);

        if (options?.sunCastShadow !== undefined) this.sun.setUserCastShadow(options.sunCastShadow);

        if (options?.sunTime !== undefined) this.currentDate = new Date(options.sunTime);

        if (options?.enableSunLight !== undefined) this.sun.enableSunLight = options.enableSunLight;
    }

    private createMoon(): THREE.Object3D {
        const moonGeometry = new THREE.SphereGeometry(0.2, 32, 32);
        const moonMaterial = new THREE.MeshStandardMaterial({
            color: 0xdddddd,
            roughness: 1.0,
            metalness: 0.0
        });
        const moonMesh = new THREE.Mesh(moonGeometry, moonMaterial);
        moonMesh.name = "Moon";
        return moonMesh;
    }

    public toggleSun(enable: boolean): void {
        this.enabled.sun = enable;
        if (enable && !this.getObjectByName("Sun")) {
            this.add(this.sun);
        } else if (!enable && this.getObjectByName("Sun")) {
            this.remove(this.sun);
        }
    }

    public toggleMoon(enable: boolean): void {
        this.enabled.moon = enable;
        if (enable && !this.getObjectByName("Moon")) {
            this.add(this.moon);
        } else if (!enable && this.getObjectByName("Moon")) {
            this.remove(this.moon);
        }
    }

    public getCurrentDate(): Date {
        return this.currentDate;
    }

    public setCurrentDate(date: Date): void {
        this.currentDate = date;
        this.update();
    }
}
