/* Copyright (C) 2025 flywave.gl contributors */

import * as THREE from "three";

import { MapObjectAdapter } from "../MapObjectAdapter";
import { type MapView } from "../MapView";
import { AtmosphereLightMode, MapViewAtmosphere } from "../MapViewAtmosphere";
import { type MapViewEnvironmentOptions } from "../MapViewEnvironment";
import { SunLight } from "./sun/SunLight";

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

        // 初始化太阳和月亮
        this.sun = new SunLight(mapView, this.mapViewAtmosphere);
        this.toggleSun(true);
        // if (options?.moon) {
        //     this.moon = this.createMoon();
        //     this.toggleMoon(this.enabled.moon);
        // }

        mapView.scene.add(this);
    }

    public update() {
        this.sun?.update(this.currentDate || new Date());
        // if (this.mapView.mapRenderingManager && !this.ignoreAtmosphereBloom) {
        //     // this.mapView.mapRenderingManager.addIgnoreBloomObject(
        //     //     this.mapViewAtmosphere.groundMesh
        //     // );
        //     // this.mapView.mapRenderingManager.addIgnoreBloomObject(this.mapViewAtmosphere.skyMesh); 
        //     this.ignoreAtmosphereBloom = true;
        // }

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

    // 创建月亮模型
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

    // 控制太阳显示/隐藏
    public toggleSun(enable: boolean): void {
        this.enabled.sun = enable;
        if (enable && !this.getObjectByName("Sun")) {
            this.add(this.sun);
        } else if (!enable && this.getObjectByName("Sun")) {
            this.remove(this.sun);
        }
    }

    // 控制月亮显示/隐藏
    public toggleMoon(enable: boolean): void {
        this.enabled.moon = enable;
        if (enable && !this.getObjectByName("Moon")) {
            this.add(this.moon);
        } else if (!enable && this.getObjectByName("Moon")) {
            this.remove(this.moon);
        }
    }

    // 获取当前日期
    public getCurrentDate(): Date {
        return this.currentDate;
    }

    // 设置当前日期
    public setCurrentDate(date: Date): void {
        this.currentDate = date;
        this.update();
    }
}
