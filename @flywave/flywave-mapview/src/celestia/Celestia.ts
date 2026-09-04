import * as THREE from "three";
import { SunLight } from "./sun/SunLight";
import { MapView } from "../MapView";
import { AtmosphereLightMode, MapViewAtmosphere } from "../MapViewAtmosphere";
import { MapObjectAdapter } from "../MapObjectAdapter";

class BaseMapObjectAdapter extends MapObjectAdapter {
    isPickable() {
        return false;
    }
}

export class Celestia extends THREE.Object3D {
    private sun: SunLight;
    private moon: THREE.Object3D;
    private enabled: { sun: boolean; moon: boolean };
    private currentDate: Date;
    // §809: exposed for the mgl-globe parity gate in MapViewEnvironment.
    mapViewAtmosphere: MapViewAtmosphere;

    constructor(mapView: MapView) {
        super();
        this.currentDate = new Date("2021 11 23 17:00");
        this.enabled = { sun: true, moon: true };

        this.mapViewAtmosphere = new MapViewAtmosphere(
            mapView.mapAnchors,
            mapView.camera,
            mapView.projection,
            mapView.renderer.capabilities
        );
        var mapAdapter = new BaseMapObjectAdapter(new THREE.Object3D(), {});

        this.mapViewAtmosphere.groundMesh.userData.mapAdapter = mapAdapter;
        this.mapViewAtmosphere.skyMesh.userData.mapAdapter = mapAdapter;
        this.mapViewAtmosphere.lightMode = AtmosphereLightMode.LightDynamic;

        // 初始化太阳和月亮
        this.sun = new SunLight(mapView, this.mapViewAtmosphere);
        this.moon = this.createMoon();

        // 添加到场景
        this.toggleSun(this.enabled.sun);
        this.toggleMoon(this.enabled.moon);

        mapView.scene.add(this);
    }

    public update() {
        this.sun.update(this.currentDate);
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
