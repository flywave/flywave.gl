// sun-light.ts
import * as THREE from "three";
import { JulianDate } from "../utils/JulianDate";
import { Simon1994PlanetaryPositions } from "../utils/simon1994planetarypositions";
import { computeTemeToPseudoFixedMatrix } from "../utils/CoordinateTransforms";
import { MapView } from "../../MapView";
import { MapViewAtmosphere } from "../../MapViewAtmosphere";

const points = [
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
    public lightType = "sun-light";
    public direction: THREE.Vector3;
    public startColor: string;
    public intensity: number;
    public debug: boolean;

    private _directionalLightHelper: THREE.DirectionalLightHelper;
    private _mapView: MapView;

    // 新增成员变量
    private _sunElevation: number = 0; // 太阳高度角(弧度)
    private _baseIntensity: number = 1.0; // 基础强度
    private _userColor: THREE.Color = new THREE.Color(0xffffff); // 用户自定义颜色
    private _userIntensityFactor: number = 1.0; // 用户自定义强度因子
    private _seasonFactor: number = 1.0; // 季节因子(0.8-1.2)

    // 太阳颜色配置
    private readonly _sunColors = {
        noon: new THREE.Color(0xffffff),
        morningEvening: new THREE.Color(0xffcc99),
        sunriseSunset: new THREE.Color(0xff8855),
        belowHorizon: new THREE.Color(0x332211)
    };

    // 大气散射配置
    private readonly _atmosphereSettings = {
        rayleigh: 2.0, // 瑞利散射系数
        mie: 0.5, // 米氏散射系数
        turbidity: 2.0 // 大气浑浊度
    };

    constructor(mapView: MapView, private atmosphere: MapViewAtmosphere) {
        super();

        this._mapView = mapView;
        this.direction = new THREE.Vector3();

        // 创建平行光模拟太阳
        this.light = new THREE.DirectionalLight(new THREE.Color(0xffffff), 0.005);
        this.add(this.light);

        // 设置阴影参数
        this.light.castShadow = false;
        this.light.shadow.mapSize.set(4096, 4096);

        // 添加辅助工具
        this._directionalLightHelper = new THREE.DirectionalLightHelper(this.light, 10000);
        this._directionalLightHelper.visible = this.debug;
        // this.add(this._directionalLightHelper);

        this.startColor = "#ffffff";
        this.intensity = 1.0;
        this.debug = false;
    }

    private viewToLightSpace(viewPos: THREE.Vector3, camera: THREE.Camera): THREE.Vector3 {
        return viewPos.applyMatrix4(camera.matrixWorldInverse);
    }

    // 计算太阳高度角(弧度)
    private calculateSunElevation(position: THREE.Vector3): number {
        const normalizedPos = position.clone().normalize();
        // 假设世界目标在地球表面，计算太阳相对于地平线的高度
        return Math.asin(normalizedPos.y);
    }

    // 基于太阳高度计算颜色
    private calculateSunColor(elevation: number): THREE.Color {
        const color = new THREE.Color();

        if (elevation > 0.3) {
            // 正午
            color.copy(this._sunColors.noon);
        } else if (elevation > 0.1) {
            // 上午/下午
            color.copy(this._sunColors.morningEvening);
        } else if (elevation > 0) {
            // 日出/日落
            color.copy(this._sunColors.sunriseSunset);
        } else {
            // 地平线下
            color.copy(this._sunColors.belowHorizon);
        }

        // 应用大气散射效果
        this.applyAtmosphericEffects(color, elevation);

        return color;
    }

    // 应用大气散射效果
    private applyAtmosphericEffects(color: THREE.Color, elevation: number) {
        if (elevation <= 0) return;

        const { rayleigh, mie, turbidity } = this._atmosphereSettings;
        const opticalDepth = Math.exp(-turbidity / Math.sin(elevation));

        // 瑞利散射(蓝色光)
        const rayleighFactor = 1.0 - Math.exp(-rayleigh * opticalDepth);
        color.r *= 1.0 - 0.5 * rayleighFactor;
        color.g *= 1.0 - 0.3 * rayleighFactor;

        // 米氏散射(红色光)
        const mieFactor = 1.0 - Math.exp(-mie * opticalDepth);
        color.b *= 1.0 - 0.8 * mieFactor;
    }

    // 基于太阳高度计算强度
    private calculateSunIntensity(elevation: number): number {
        if (elevation <= 0) return 0.001; // 夜晚最低强度

        // 使用修正的正弦曲线模拟强度变化
        const intensity =
            this._baseIntensity * Math.pow(Math.sin(elevation), 0.8) * this._seasonFactor;

        // 确保最小强度
        return Math.max(intensity, 0.001);
    }

    // 更新季节因子(1=夏至, -1=冬至)
    private updateSeasonFactor(date: Date) {
        const dayOfYear = this.getDayOfYear(date);
        // 使用余弦函数模拟季节变化
        this._seasonFactor = 0.2 * Math.cos(((dayOfYear - 172) / 365) * Math.PI * 2) + 1.0;
    }

    // 获取一年中的第几天
    private getDayOfYear(date: Date): number {
        const start = new Date(date.getFullYear(), 0, 0);
        const diff = date.getTime() - start.getTime();
        return Math.floor(diff / (1000 * 60 * 60 * 24));
    }

    // 设置用户自定义颜色
    public setUserColor(color: THREE.Color | string | number): void {
        if (typeof color === "string" || typeof color === "number") {
            this._userColor.set(color);
        } else {
            this._userColor.copy(color);
        }
    }

    // 设置用户自定义强度因子
    public setUserIntensityFactor(factor: number): void {
        this._userIntensityFactor = THREE.MathUtils.clamp(factor, 0, 2);
    }

    // 更新光照
    public update = (date: Date): void => {
        // 计算太阳位置(现有代码)
        const t = JulianDate.fromDate(date);
        const position = Simon1994PlanetaryPositions.computeSunPositionInEarthInertialFrame(
            t,
            new THREE.Vector3()
        );

        const transformMatrix = new THREE.Matrix3();
        computeTemeToPseudoFixedMatrix(t, transformMatrix);
        position.applyMatrix3(transformMatrix);

        // 更新光照位置(现有代码)
        this.light.target.position
            .copy(this._mapView.worldTarget)
            .sub(this._mapView.camera.position);
        this.light.position
            .copy(this._mapView.worldTarget)
            .addScaledVector(position.normalize(), 10000)
            .sub(this._mapView.camera.position);

        this.direction = this.light.position.clone().normalize();
        this.atmosphere.lightDirection.copy(position.normalize());

        this._mapView.mapRenderingManager?.updateSunPosition(this.light.position);

        // 计算太阳高度
        this._sunElevation = this.calculateSunElevation(position);

        // 更新季节因子
        this.updateSeasonFactor(date);

        // 计算基础颜色和强度
        const baseColor = this.calculateSunColor(this._sunElevation);
        const baseIntensity = this.calculateSunIntensity(this._sunElevation);

        // 应用用户自定义
        const finalColor = baseColor.clone().multiply(this._userColor);
        const finalIntensity = baseIntensity * this._userIntensityFactor;

        // 设置光照属性
        this.light.color.copy(finalColor);
        this.light.intensity = finalIntensity;

        // 更新阴影相机等(现有代码)
        this.light.updateMatrixWorld();
        this.light.target.updateMatrixWorld();
        this.light.shadow.updateMatrices(this.light);

        const camera = this.light.shadow.camera;
        const transformedPoints = points.map(p =>
            this._mapView.ndcToView(new THREE.Vector3(p.x, p.y, p.z), new THREE.Vector3())
        );

        const pointsInLightSpace = transformedPoints.map(p =>
            this.viewToLightSpace(p.clone(), camera)
        );

        const box = new THREE.Box3();
        pointsInLightSpace.forEach(point => {
            box.expandByPoint(point);
        });

        const distance = this._mapView.camera.position.distanceTo(this._mapView.worldTarget);
        const min = distance * ((this._mapView.camera.fov * Math.PI) / 180);

        camera.left = Math.max(box.min.x, -min);
        camera.right = Math.min(box.max.x, min);
        camera.top = Math.min(box.max.y, min);
        camera.bottom = Math.max(box.min.y, -min);
        camera.near = -box.max.z * 0.95;
        camera.far = -box.min.z;

        camera.updateProjectionMatrix();
    };
}
