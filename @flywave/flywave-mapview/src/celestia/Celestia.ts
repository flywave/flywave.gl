/* Copyright (C) 2025 flywave.gl contributors */

import * as THREE from "three";

import { MapObjectAdapter } from "../MapObjectAdapter";
import { type MapView } from "../MapView";
import { AtmosphereBackend, AtmosphereLightMode, MapViewAtmosphere } from "../MapViewAtmosphere";
import { type MapViewEnvironmentOptions } from "../MapViewEnvironment";

export interface CelestiaOptions {
    atmosphere?: boolean;
    atmosphereEngine?: "legacy" | "bruneton";
    sunTime?: number;
    sunColor?: THREE.ColorRepresentation;
    sunIntensity?: number;
    sunCastShadow?: boolean;
    enableSunLight?: boolean;
}
import { SunLight } from "./sun/SunLight";

import {
    AerialPerspectiveEffect,
    SunDirectionalLight,
    SkyLightProbe,
    type PrecomputedTextures,
    PrecomputedTexturesGenerator,
    getAltitudeCorrectionOffset,
    AtmosphereParameters,
    Ellipsoid
} from "@flywave/flywave-atmosphere";

import { computeTemeToPseudoFixedMatrix } from "./utils/CoordinateTransforms";
import { Simon1994PlanetaryPositions } from "./utils/simon1994planetarypositions";
import { JulianDate } from "./utils/JulianDate";

class BaseMapObjectAdapter extends MapObjectAdapter {
    isPickable() {
        return false;
    }
}

export class Celestia extends THREE.Object3D {
    private readonly sun: SunLight;
    private readonly moon: THREE.Object3D;
    private readonly enabled: { sun: boolean; moon: boolean };
    private currentDate?: Date;
    private readonly mapViewAtmosphere: MapViewAtmosphere;
    private ignoreAtmosphereBloom: boolean;

    private aerialPerspectiveEffect?: AerialPerspectiveEffect;
    private sunDirectionalLight?: SunDirectionalLight;
    private skyLightProbe?: SkyLightProbe;
    private precomputedTextures?: PrecomputedTextures;
    private generator?: PrecomputedTexturesGenerator;

    private readonly altitudeCorrectionScratch = new THREE.Vector3();

    private readonly worldToECEFMatrix = new THREE.Matrix4();
    private readonly sunDirectionECEF = new THREE.Vector3();
    private readonly moonDirectionECEF = new THREE.Vector3(0, 1, 0);

    private texturesReady: boolean = false;
    private texturesReadyPromise?: Promise<void>;

    constructor(
        private readonly mapView: MapView,
        envOptions: MapViewEnvironmentOptions,
        options?: CelestiaOptions
    ) {
        super();
        this.enabled = { sun: false, moon: false };

        const useBruneton = options?.atmosphereEngine !== "legacy" && options?.atmosphere !== false;

        this.mapViewAtmosphere = new MapViewAtmosphere(
            mapView.mapAnchors,
            mapView.camera,
            mapView.projection,
            mapView.renderer.capabilities,
            undefined,
            undefined,
            undefined,
            AtmosphereBackend.Bruneton
        );

        const mapAdapter = new BaseMapObjectAdapter(new THREE.Object3D(), {});

        if (!useBruneton) {
            this.mapViewAtmosphere.groundMesh.userData.mapAdapter = mapAdapter;
            this.mapViewAtmosphere.skyMesh.userData.mapAdapter = mapAdapter;
        }
        this.mapViewAtmosphere.lightMode = AtmosphereLightMode.LightDynamic;

        this.mapViewAtmosphere.enabled = options?.atmosphere ?? false; 

        mapView.scene.add(this);
    }

    async initializeAtmosphere(renderer: THREE.WebGLRenderer): Promise<void> {
        if (this.texturesReadyPromise) {
            return this.texturesReadyPromise;
        }

        this.texturesReadyPromise = (async () => {
            try {
                this.generator = new PrecomputedTexturesGenerator(renderer);
                this.precomputedTextures = await this.generator.update();
                this.setupAerialPerspective();
                this.setupSunDirectionalLight();
                this.setupSkyLightProbe();
                this.texturesReady = true;
            } catch (error) {
                console.warn(
                    "Failed to generate atmosphere textures, falling back to legacy mode:",
                    error
                );
                this.texturesReady = false;
            }
        })();

        return this.texturesReadyPromise;
    }

    private setupAerialPerspective(): void {
        if (!this.precomputedTextures) return;

        const camera = this.mapView.camera;
        this.aerialPerspectiveEffect = new AerialPerspectiveEffect(this.mapView.getRteCamera(), {
            sunDirection: this.sunDirectionECEF,
            moonDirection: this.moonDirectionECEF
        });

        this.aerialPerspectiveEffect.sky = true;
        this.aerialPerspectiveEffect.sun = true;
        this.aerialPerspectiveEffect.moon = false;

        this.aerialPerspectiveEffect.transmittanceTexture =
            this.precomputedTextures.transmittanceTexture;
        this.aerialPerspectiveEffect.scatteringTexture = this.precomputedTextures.scatteringTexture;
        this.aerialPerspectiveEffect.irradianceTexture = this.precomputedTextures.irradianceTexture;
        this.aerialPerspectiveEffect.singleMieScatteringTexture =
            this.precomputedTextures.singleMieScatteringTexture;

        if (this.precomputedTextures.higherOrderScatteringTexture) {
            this.aerialPerspectiveEffect.higherOrderScatteringTexture =
                this.precomputedTextures.higherOrderScatteringTexture;
        }

        this.aerialPerspectiveEffect.albedoScale = 1.0;
        this.aerialPerspectiveEffect.lunarRadianceScale = 1.0;

        this.updateAltitudeCorrection();

        this.mapView.mapRenderingManager.addCustomEffect({
            id: "aerial-perspective",
            effect: this.aerialPerspectiveEffect,
            enabled: true,
            order: -10
        });
    }

    private setupSunDirectionalLight(): void {
        if (!this.precomputedTextures) return;

        this.sunDirectionalLight = new SunDirectionalLight({
            transmittanceTexture: this.precomputedTextures.transmittanceTexture,
            sunDirection: this.sunDirectionECEF
        });
        this.sunDirectionalLight.worldToECEFMatrix.copy(this.worldToECEFMatrix);
        this.mapView.scene.add(this.sunDirectionalLight);
        this.mapView.scene.add(this.sunDirectionalLight.target);
    }

    private setupSkyLightProbe(): void {
        if (!this.precomputedTextures) return;

        this.skyLightProbe = new SkyLightProbe({
            irradianceTexture: this.precomputedTextures.irradianceTexture,
            sunDirection: this.sunDirectionECEF
        });
        this.skyLightProbe.worldToECEFMatrix.copy(this.worldToECEFMatrix);
        this.skyLightProbe.position.set(0, 0, 0);
        this.mapView.scene.add(this.skyLightProbe);
    }

    private updateAltitudeCorrection(): void {
        if (!this.aerialPerspectiveEffect) return;

        const camera = this.mapView.camera;
        const bottomRadius = AtmosphereParameters.DEFAULT.bottomRadius;
        getAltitudeCorrectionOffset(
            camera.position,
            bottomRadius,
            Ellipsoid.WGS84,
            this.altitudeCorrectionScratch
        );
        this.aerialPerspectiveEffect.altitudeCorrection.copy(this.altitudeCorrectionScratch);
    }

    updateWorldToECEFMatrix(): void {
        const camera = this.mapView.camera;

        // RTE is pure translation from ECEF: P_rte = P_ecef - cam_ecef
        // So worldToECEFMatrix = [I | cam_ecef] (identity rotation, camera position translation)
        // NOT [R | cam_ecef] — that would cause double-rotation of directions
        this.worldToECEFMatrix.identity();
        this.worldToECEFMatrix.setPosition(camera.position.x, camera.position.y, camera.position.z);

        if (this.aerialPerspectiveEffect) {
            this.aerialPerspectiveEffect.worldToECEFMatrix.copy(this.worldToECEFMatrix);
        }
    }

    public update() {
        const date = this.currentDate || new Date();

        this.sun?.update(date);

        if (this.texturesReady) {
            this.updateWorldToECEFMatrix();
            this.updateAltitudeCorrection();
            this.computeCelestialDirections(date);
            this.updateAtmosphereUniforms();
            this.updateSunDirectionalLight();
            this.updateSkyLightProbe();
        }
    }

    private computeCelestialDirections(date: Date): void {
        const t = JulianDate.fromDate(date);
        const position = Simon1994PlanetaryPositions.computeSunPositionInEarthInertialFrame(
            t,
            new THREE.Vector3()
        );

        const transformMatrix = new THREE.Matrix3();
        computeTemeToPseudoFixedMatrix(t, transformMatrix);
        position.applyMatrix3(transformMatrix);
        position.normalize();

        this.sunDirectionECEF.copy(position);

        this.moonDirectionECEF.set(0, 1, 0);
    }

    private updateAtmosphereUniforms(): void {
        if (this.aerialPerspectiveEffect) {
            this.aerialPerspectiveEffect.sunDirection.copy(this.sunDirectionECEF);
            this.aerialPerspectiveEffect.worldToECEFMatrix.copy(this.worldToECEFMatrix);
        }
    }

    private updateSunDirectionalLight(): void {
        if (this.sunDirectionalLight) {
            this.sunDirectionalLight.worldToECEFMatrix.copy(this.worldToECEFMatrix);
            this.sunDirectionalLight.sunDirection.copy(this.sunDirectionECEF);
            this.sunDirectionalLight.update();
        }
    }

    private updateSkyLightProbe(): void {
        if (this.skyLightProbe) {
            this.skyLightProbe.worldToECEFMatrix.copy(this.worldToECEFMatrix);
            this.skyLightProbe.sunDirection.copy(this.sunDirectionECEF);
            this.skyLightProbe.position.set(0, 0, 0);
            this.skyLightProbe.update();
        }
    }

    get isTexturesReady(): boolean {
        return this.texturesReady;
    }

    get aerialPerspective(): AerialPerspectiveEffect | undefined {
        return this.aerialPerspectiveEffect;
    }

    get sunLight(): SunDirectionalLight | undefined {
        return this.sunDirectionalLight;
    }

    get skyLight(): SkyLightProbe | undefined {
        return this.skyLightProbe;
    }

    get precomputedTexturesData(): PrecomputedTextures | undefined {
        return this.precomputedTextures;
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

    dispose() {
        if (this.mapViewAtmosphere) {
            this.mapViewAtmosphere.dispose();
        }
        if (this.aerialPerspectiveEffect) {
            this.mapView.mapRenderingManager.removeCustomEffect("aerial-perspective");
            this.aerialPerspectiveEffect.dispose();
        }
        if (this.sunDirectionalLight) {
            this.mapView.scene.remove(this.sunDirectionalLight);
            this.mapView.scene.remove(this.sunDirectionalLight.target);
        }
        if (this.skyLightProbe) {
            this.mapView.scene.remove(this.skyLightProbe);
        }
        this.generator?.dispose();
    }
}
