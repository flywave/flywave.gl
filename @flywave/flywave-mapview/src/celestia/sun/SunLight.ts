/* Copyright (C) 2025 flywave.gl contributors */

import * as THREE from "three";

import { type MapView } from "../../MapView";
import { type MapViewAtmosphere } from "../../MapViewAtmosphere";
import { computeTemeToPseudoFixedMatrix } from "../utils/CoordinateTransforms";
import { JulianDate } from "../utils/JulianDate";
import { Simon1994PlanetaryPositions } from "../utils/simon1994planetarypositions";

const POINTS = [
    // near plane points
    { x: -1, y: -1, z: -1 },
    { x: 1, y: -1, z: -1 },
    { x: -1, y: 1, z: -1 },
    { x: 1, y: 1, z: -1 },
    // far planes points
    { x: -1, y: -1, z: 1 },
    { x: 1, y: -1, z: 1 },
    { x: -1, y: 1, z: 1 },
    { x: 1, y: 1, z: 1 }
];

export class SunLight extends THREE.Object3D {
    public readonly light: THREE.DirectionalLight;
    public readonly lightType = "sun-light";
    public readonly direction: THREE.Vector3;
    public startColor: string;
    public intensity: number;
    public debug: boolean;

    private readonly m_directionalLightHelper: THREE.DirectionalLightHelper;
    private readonly m_mapView: MapView;
    private readonly m_atmosphere: MapViewAtmosphere;

    private readonly m_userColor: THREE.Color = new THREE.Color(0xffffff); // 用户自定义颜色
    private m_userIntensityFactor: number = 1.0; // 用户自定义强度因子

    // 大气散射配置
    private readonly m_atmosphereSettings = {
        rayleigh: 2.0, // 瑞利散射系数
        mie: 0.5, // 米氏散射系数
        turbidity: 2.0 // 大气浑浊度
    };

    constructor(mapView: MapView, atmosphere: MapViewAtmosphere) {
        super();

        this.m_mapView = mapView;
        this.m_atmosphere = atmosphere;
        this.direction = new THREE.Vector3();

        // 创建平行光模拟太阳
        this.light = new THREE.DirectionalLight(new THREE.Color(0xffffff), 0.005);
        this.add(this.light);
        this.light.layers.enableAll();

        // 设置阴影参数
        this.light.castShadow = false;
        this.light.shadow.mapSize.set(4096, 4096);

        // 添加辅助工具
        this.m_directionalLightHelper = new THREE.DirectionalLightHelper(this.light, 10000);
        this.m_directionalLightHelper.visible = this.debug;
        // this.add(this.m_directionalLightHelper);

        this.startColor = "#ffffff";
        this.intensity = 1.0;
        this.debug = false;
    }

    public get enableSunLight(): boolean {
        return this.light.visible;
    }

    public set enableSunLight(enable: boolean) {
        this.light.visible = enable;
    }

    // 设置用户自定义颜色
    public setUserColor(color: THREE.Color | string | number): void {
        if (typeof color === "string" || typeof color === "number") {
            this.m_userColor.set(color);
        } else {
            this.m_userColor.copy(color);
        }
    }

    // 设置用户自定义强度因子
    public setUserIntensityFactor(factor: number): void {
        this.m_userIntensityFactor = factor;
    }

    // 设置用户自定义阴影投射
    public setUserCastShadow(castShadow: boolean): void {
        this.light.castShadow = castShadow;
    }

    // 更新光照
    public update(date: Date): void {
        // 计算太阳位置
        const t = JulianDate.fromDate(date);
        const position = Simon1994PlanetaryPositions.computeSunPositionInEarthInertialFrame(
            t,
            new THREE.Vector3()
        );

        const transformMatrix = new THREE.Matrix3();
        computeTemeToPseudoFixedMatrix(t, transformMatrix);
        position.applyMatrix3(transformMatrix);

        // 更新光照位置
        this.light.target.position
            .copy(this.m_mapView.worldTarget)
            .sub(this.m_mapView.camera.position);
        this.light.position
            .copy(this.m_mapView.worldTarget)
            .addScaledVector(position.normalize(), 10000)
            .sub(this.m_mapView.camera.position);

        this.direction.copy(this.light.position).normalize();
        this.m_atmosphere.lightDirection.copy(position).normalize();

        // 应用用户自定义
        const finalColor = this.m_userColor;
        const finalIntensity = this.m_userIntensityFactor;

        // 设置光照属性
        this.light.color.copy(finalColor);
        this.light.intensity = finalIntensity;

        // 更新阴影相机等
        this.updateShadowCamera();
    }

    // 更新阴影相机
    private updateShadowCamera(): void {
        this.light.updateMatrixWorld();
        this.light.target.updateMatrixWorld();
        this.light.shadow.updateMatrices(this.light);

        const camera = this.light.shadow.camera;
        const transformedPoints = POINTS.map(p =>
            this.m_mapView.ndcToView(new THREE.Vector3(p.x, p.y, p.z), new THREE.Vector3())
        );

        const pointsInLightSpace = transformedPoints.map(p =>
            this.viewToLightSpace(p.clone(), camera)
        );

        const box = new THREE.Box3();
        pointsInLightSpace.forEach(point => {
            box.expandByPoint(point);
        });

        const distance = this.m_mapView.camera.position.distanceTo(this.m_mapView.worldTarget);
        const min = distance * ((this.m_mapView.camera.fov * Math.PI) / 180);

        camera.left = Math.max(box.min.x, -min);
        camera.right = Math.min(box.max.x, min);
        camera.top = Math.min(box.max.y, min);
        camera.bottom = Math.max(box.min.y, -min);
        camera.near = -box.max.z * 0.95;
        camera.far = -box.min.z;

        camera.updateProjectionMatrix();
    }

    // 视图空间转光照空间
    private viewToLightSpace(viewPos: THREE.Vector3, camera: THREE.Camera): THREE.Vector3 {
        return viewPos.applyMatrix4(camera.matrixWorldInverse);
    }
}