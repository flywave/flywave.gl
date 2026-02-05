# Flywave.gl 完整使用和 API 文档

## 1. 库的基本介绍和核心概念

### 1.1 库概述

Flywave.gl 是一个高性能的 3D 地图可视化库，基于 Three.js 构建，提供了丰富的地理空间数据可视化功能。它支持多种数据源、地形渲染、3D Tiles、大气效果等高级特性，适用于构建交互式 3D 地图应用。

### 1.2 核心组件

- **MapView**: 核心渲染组件，负责管理相机、场景和渲染循环
- **DataSource**: 数据源基类，用于加载和管理地图数据
- **MapControls**: 地图交互控制器，处理用户输入和相机控制
- **GeoCoordinates**: 地理坐标类，用于表示和转换地理坐标
- **Projection**: 投影系统，处理地理坐标到屏幕坐标的转换
- **TerrainSource**: 地形数据源，用于加载和渲染地形数据
- **TileKey**: 瓦片坐标类，用于标识地图瓦片

### 1.3 关键特性

- 支持多种投影系统（球体、椭球体等）
- 地形渲染和编辑
- 3D Tiles 支持
- 大气效果和光照系统
- 丰富的数据源支持（WMTS、GeoJSON、3D Tiles 等）
- 高性能瓦片加载和缓存
- 交互式地图控制
- 可扩展的主题系统

## 2. 快速开始指南

### 2.1 安装设置

```bash
npm install @flywave/flywave.gl
```

### 2.2 基本地图初始化

```typescript
import {
    MapView,
    GeoCoordinates,
    MapControls,
    DEMTerrainSource,
    ArcGISTileProvider,
    MapControlsUI,
    sphereProjection
} from "@flywave/flywave.gl";

// 获取地图画布元素
const canvas = document.getElementById("mapCanvas") as HTMLCanvasElement;

// 初始化地图视图
const mapView = new MapView({
    projection: sphereProjection,
    target: new GeoCoordinates(36, 118),
    zoomLevel: 6,
    tilt: 45,
    heading: 1.5413763202653008,
    logarithmicDepthBuffer: true,
    canvas: canvas,
    theme: {
        extends: "resources/tilezen_base_globe.json",
        celestia: {
            atmosphere: true
        }
    }
});

// 初始化地图控制
const controls = new MapControls(mapView);
const ui = new MapControlsUI(controls, {
    screenshotButton: {
        width: 512,
        height: 512
    }
});
canvas.parentElement!.appendChild(ui.domElement);

// 配置 DEM 地形数据源
const demTerrain = new DEMTerrainSource({
    source: "dem_terrain/source.json"
});

mapView.setElevationSource(demTerrain);
demTerrain.addWebTileDataSource(
    new ArcGISTileProvider({
        minDataLevel: 0,
        maxDataLevel: 18
    })
);
```

### 2.3 添加 3D Tiles 数据源

```typescript
import {
    MapView,
    GeoCoordinates,
    ellipsoidProjection,
    MapControls,
    CesiumIonDataSource,
    MapControlsUI
} from "@flywave/flywave.gl";

// 初始化地图视图
const mapView = new MapView({
    projection: ellipsoidProjection,
    target: new GeoCoordinates(40.6959, -74.0162),
    zoomLevel: 18,
    tilt: 70,
    heading: 35.1,
    canvas: canvas,
    theme: {
        extends: "resources/tilezen_base_globe.json"
    }
});

// 创建 Cesium Ion 数据源
const cesiumIonDataSource = new CesiumIonDataSource({
    accessToken: "your-cesium-ion-token",
    assetId: 75343
});

mapView.addDataSource(cesiumIonDataSource);
```

## 3. 核心类详细文档

### 3.1 MapView

```typescript
export declare class MapView extends MapView_2 {
    constructor(options: MapViewOptions);
    
    // 相机控制
    setTarget(target: GeoCoordinates, duration?: number): void;
    setZoomLevel(zoomLevel: number, duration?: number): void;
    setTilt(tilt: number, duration?: number): void;
    setHeading(heading: number, duration?: number): void;
    flyTo(target: GeoCoordinates, options?: FlyToOptions): Promise<void>;
    
    // 数据源管理
    addDataSource(dataSource: DataSource): void;
    removeDataSource(dataSource: DataSource): void;
    setElevationSource(elevationSource: ElevationSource): void;
    getElevationSource(): ElevationSource | undefined;
    
    // 渲染控制
    render(): void;
    resize(): void;
    setTheme(theme: Theme | FlatTheme, languages?: string[]): Promise<void>;
    getTheme(): Theme | FlatTheme | undefined;
    
    // 拾取和交互
    unprojectScreenPosition(screenPosition: Vector2, result?: GeoCoordinates): GeoCoordinates | undefined;
    projectPoint(point: GeoCoordinates, result?: Vector2): Vector2 | undefined;
    pickObjects(screenPosition: Vector2, radius?: number): PickResult[];
    getAltitude(lon: number, lat: number, defaultHeight?: number): number;
    
    // 事件系统
    addEventListener(type: string, listener: (event: Event) => void): void;
    removeEventListener(type: string, listener: (event: Event) => void): void;
}

interface MapViewOptions extends TextElementsRendererOptions, Partial<LookAtParams> {
    canvas: HTMLCanvasElement;
    projection?: Projection;
    target?: GeoCoordinates;
    zoomLevel?: number;
    tilt?: number;
    heading?: number;
    logarithmicDepthBuffer?: boolean;
    theme?: Theme | FlatTheme;
    maxZoomLevel?: number;
    minZoomLevel?: number;
    nearPlane?: number;
    farPlane?: number;
    fog?: boolean;
    atmosphere?: boolean;
    sky?: boolean;
    shadowMapEnabled?: boolean;
    shadowMapType?: ShadowMapType;
    shadowMapSize?: number;
    renderMode?: RenderMode;
    terrainExaggeration?: number;
    terrainSmoothing?: boolean;
    enableFrustumCulling?: boolean;
    enableLevelOfDetail?: boolean;
    maxVisibleTiles?: number;
    tileCacheSize?: number;
    workerCount?: number;
    requestScheduler?: RequestScheduler;
    textureLoader?: TextureLoader;
    fontCatalog?: FontCatalog;
    textCanvas?: TextCanvas;
    debug?: boolean;
    statistics?: boolean;
}
```

### 3.2 GeoCoordinates

```typescript
export declare class GeoCoordinates implements GeoCoordinatesLike {
    constructor(latitude: number, longitude: number, altitude?: number);
    
    latitude: number;
    longitude: number;
    altitude: number;
    
    clone(): GeoCoordinates;
    copy(other: GeoCoordinates): this;
    distanceTo(other: GeoCoordinates): number;
    move(distance: number, bearing: number): this;
}
```

### 3.3 MapControls

```typescript
export declare class MapControls extends BaseMapControls {
    constructor(mapView: MapView, options?: BaseMapControlsOptions);
    
    enabled: boolean;
    zoomEnabled: boolean;
    tiltEnabled: boolean;
    maxTiltAngle: number;
    
    disableTilt(): void;
    disableHeading(): void;
    animatePan(x: number, y: number): void;
    animateHeading(v: number): void;
    setHeading(v: number): void;
    animateTilt(v: number): void;
    setTilt(v: number): void;
    animateZoom(v: number): void;
    destroy(): void;
}

interface BaseMapControlsOptions {
    zoomEnabled?: boolean;
    tiltEnabled?: boolean;
    maxTiltAngle?: number;
}
```

### 3.4 MapControlsUI

```typescript
export declare class MapControlsUI {
    constructor(controls: MapControls, options?: MapControlsUIOptions);
    
    domElement: HTMLElement;
}
```

### 3.5 DataSource (基类)

```typescript
export declare class DataSource {
    setTheme(theme: Theme | FlatTheme, languages?: string[]): Promise<void>;
    getTheme(): Theme | FlatTheme | undefined;
    setLanguages(languages?: string[]): void;
    getLanguages(): string[];
    getTile(tileKey: TileKey): Tile | undefined;
    getTilingScheme(): TilingScheme;
    setTilingScheme(tilingScheme: TilingScheme): void;
    updateStorageLevelOffset(): void;
}
```

### 3.6 TileKey

```typescript
export declare class TileKey {
    constructor(level: number, x: number, y: number);
    
    level: number;
    x: number;
    y: number;
    
    clone(): TileKey;
    getParent(): TileKey;
    getChild(index: number): TileKey;
    getNeighbor(direction: Direction): TileKey | undefined;
    getGeoBox(): GeoBox;
}
```

## 4. 数据源相关类和使用方法

### 4.1 ArcGISWebTileDataSource

```typescript
export declare class ArcGISWebTileDataSource extends WebTileDataSource {
    constructor(options?: ArcGISWebTileDataSourceParameters);
    setLanguages(languages?: string[]): void;
}

interface ArcGISWebTileDataSourceParameters {
    tileUrlTemplate?: string;
    subdomains?: string[];
    gatherCopyrightInfo?: boolean;
    token?: string;
}
```

### 4.2 ArcGISTileProvider

```typescript
export declare class ArcGISTileProvider extends WebTileDataProvider {
    constructor(options?: ArcGISWebTileDataSourceParameters);
    get minDataLevel(): number;
    get maxDataLevel(): number;
    getTexture(tile: Tile, abortSignal?: AbortSignal): Promise<[Texture, CopyrightInfo[]]>;
    mapIsoLanguageToWebTile(languages: string[]): void;
}
```

### 4.3 BingWebTileDataSource

```typescript
export declare class BingWebTileDataSource extends WebTileDataSource {
    constructor(options?: BingWebTileDataSourceParameters);
    setLanguages(languages?: string[]): void;
}

interface BingWebTileDataSourceParameters {
    imagerySet?: string;
    culture?: string;
    mapTypeId?: string;
    subdomains?: string[];
}
```

### 4.4 BingTileProvider

```typescript
export declare class BingTileProvider extends WebTileDataProvider {
    constructor(options?: BingWebTileDataSourceParameters);
    getTexture(tile: Tile, abortSignal?: AbortSignal): Promise<[Texture, CopyrightInfo[]]>;
}
```

### 4.5 DEMTerrainSource

```typescript
export declare class DEMTerrainSource extends TerrainSource<DEMTerrainProvider> {
    constructor(options: DEMTerrainSourceOptions);
    addWebTileDataSource(provider: WebTileDataProvider): void;
}

interface DEMTerrainSourceOptions {
    source: string;
    maxDisplayLevel?: number;
    scriptUrl?: string;
}
```

### 4.6 CesiumIonDataSource

```typescript
export declare class CesiumIonDataSource extends DataSource {
    constructor(options: CesiumIonDataSourceOptions);
}

interface CesiumIonDataSourceOptions {
    accessToken: string;
    assetId: number;
}
```

### 4.7 BackgroundDataSource

```typescript
export declare class BackgroundDataSource extends DataSource {
    constructor();
    updateStorageLevelOffset(): void;
    setTheme(theme: Theme | FlatTheme, languages?: string[]): Promise<void>;
    setTilingScheme(tilingScheme?: TilingScheme): void;
    getTilingScheme(): TilingScheme;
    getTile(tileKey: TileKey): Tile | undefined;
}
```

## 5. 地图控制和交互相关类

### 5.1 MapControls

```typescript
// 创建地图控制器
const controls = new MapControls(mapView, {
    zoomEnabled: true,
    tiltEnabled: true,
    maxTiltAngle: 85
});

// 启用/禁用控制器
controls.enabled = true;

// 启用/禁用缩放
controls.zoomEnabled = true;

// 启用/禁用倾斜
controls.tiltEnabled = true;

// 设置最大倾斜角度
controls.maxTiltAngle = 85;

// 禁用倾斜
controls.disableTilt();

// 禁用航向
controls.disableHeading();

// 动画平移
controls.animatePan(x: number, y: number): void;

// 动画航向
controls.animateHeading(v: number): void;

// 设置航向
controls.setHeading(v: number): void;

// 动画倾斜
controls.animateTilt(v: number): void;

// 设置倾斜
controls.setTilt(v: number): void;

// 动画缩放
controls.animateZoom(v: number): void;

// 销毁控制器
controls.destroy();
```

### 5.2 MapControlsUI

```typescript
// 创建地图控制 UI
const ui = new MapControlsUI(controls, {
    zoomButtons: true,
    tiltButtons: true,
    headingButtons: true,
    resetButton: true,
    screenshotButton: {
        width: 512,
        height: 512
    },
    fullscreenButton: true
});

// 添加到 DOM
canvas.parentElement!.appendChild(ui.domElement);
```

### 5.3 事件处理

```typescript
// 监听地图事件
mapView.addEventListener("frameend", () => {
    // 每帧渲染结束时执行
});

mapView.addEventListener("zoom", (event) => {
    // 缩放级别变化时执行
    console.log("Zoom level:", mapView.getZoomLevel());
});

mapView.addEventListener("move", (event) => {
    // 地图位置变化时执行
    console.log("Target:", mapView.getTarget());
});
```

## 6. 投影系统和坐标转换

### 6.1 内置投影

```typescript
// 球体投影
import { sphereProjection } from "@flywave/flywave.gl";

// 椭球体投影
import { ellipsoidProjection } from "@flywave/flywave.gl";

// 平面投影
import { planarProjection } from "@flywave/flywave.gl";

// 使用投影
const mapView = new MapView({
    projection: sphereProjection,
    // 其他配置...
});
```

### 6.2 坐标转换

```typescript
// 屏幕坐标转地理坐标
const geoCoord = mapView.unprojectScreenPosition(new Vector2(mouseX, mouseY));

// 地理坐标转屏幕坐标
const screenCoord = mapView.projectPoint(new GeoCoordinates(lat, lon));

// 地理坐标转世界坐标
const worldPos = mapView.projection.project(geoCoord);

// 世界坐标转地理坐标
const geoCoord2 = mapView.projection.unproject(worldPos);
```

## 7. 认证和 API 格式相关内容

### 7.1 APIFormat 枚举

```typescript
export declare enum APIFormat {
    HereV1 = 0,
    MapboxV4 = 1,
    XYZMVT = 2,
    XYZJson = 3,
    XYZOMV = 4,
    TomtomV1 = 5,
    XYZSpace = 6
}
```

### 7.2 认证方法

```typescript
// 认证方法信息
export declare interface AuthenticationMethodInfo {
    method: AuthenticationMethod;
    name?: string;
}

// 认证方法枚举
export declare enum AuthenticationMethod {
    QueryString = 0,
    AuthorizationHeader = 1
}

// 预定义认证类型
export declare const AuthenticationTypeAccessToken: AuthenticationMethodInfo;
export declare const AuthenticationTypeBearer: AuthenticationMethodInfo;
export declare const AuthenticationTypeTomTomV1: AuthenticationMethodInfo;
```

### 7.3 认证接口

```typescript
// API Key 认证
export declare interface ApiKeyAuthentication {
    apikey: string;
}

// App ID 认证
export declare interface AppIdAuthentication {
    appId: string;
    appCode: string;
}

// 认证码提供者
export declare type AuthenticationCodeProvider = () => Promise<string>;

// 认证提供者
export declare type AuthenticationProvider = () => Promise<string>;
```

## 8. 工具类和函数

### 8.1 工具函数

```typescript
// 添加缓冲区到传输列表
export declare function addBuffersToTransferList(technique: Technique, transferList: ArrayBuffer[]): void;

// 添加地面平面
export declare function addGroundPlane(tile: Tile, renderOrder: number, materialOrColor?: THREE.Material | THREE.Material[] | number, opacity?: number, createTexCoords?: boolean, receiveShadow?: boolean, createMultiLod?: boolean): THREE.Mesh;

// 应用基础颜色到材质
export declare function applyBaseColorToMaterial(material: THREE.Material, materialColor: THREE.Color, technique: Technique, techniqueColor: Value, env?: Env): void;

// 应用混合
export declare function applyMixins(derivedCtor: any, baseCtors: any[]): void;

// 应用次要颜色到材质
export declare function applySecondaryColorToMaterial(materialColor: THREE.Color, techniqueColor: Value | Expr, env?: Env): void;

// 计算方位角和高度到方向向量
export declare function azimuthAltitudeToDirection(azimuth: number, altitude: number): Vector3;

// 获取基础URL
export declare function baseUrl(url: string | undefined): string;

// 线性插值数组
export declare function array(from: number[], to: number[], t: number): number[];

// ArrayBuffer转Image
export declare function arrayBufferToImage(data: ArrayBuffer, callback: Callback<HTMLImageElement>): void;

// ArrayBuffer转ImageBitmap
export declare function arrayBufferToImageBitmap(data: ArrayBuffer, callback: Callback<ImageBitmap>): void;

// 断言
export declare function assert(condition: boolean, message?: string): void;

// 断言存在
export declare function assertExists<T>(element: T | undefined, message?: string): T;

// 计算重心坐标
export declare function barycentricCoordTriangle(p: Vector2, pt0: Vector2, pt1: Vector2, pt2: Vector2): { s: number; t: number; u: number };

// 计算归一化设备坐标
export declare function calculateNormalizedDeviceCoordinates(screenCoordinateX: number, screenCoordinateY: number, screenSizeX: number, screenSizeY: number): Vector2;

// 构建度量值评估器
export declare function buildMetricValueEvaluator(value: Expr | Value | undefined, metricUnit: string | undefined): Value;

// 构建对象
export declare function buildObject(technique: Technique, geometry: THREE.BufferGeometry, material: THREE.Material | THREE.Material[], tile: Tile, elevationEnabled: boolean): THREE.Object3D;

// 二分搜索
export declare function binarySearch<T, C>(array: T[], itemToFind: C, comparator: BinarySearchComparator<T, C>): number;

// 画笔操作转序列化修改
export declare function brushOperationsToSerializedModifications(operations: BrushOperation[], operationIds: string[], boundingBoxes: GeoBox[]): SerializedGroundModificationData[];
```

### 8.2 工具类

```typescript
// Alpha图像
export declare class AlphaImage {
    constructor(size: Size, data?: Uint8Array | Uint8ClampedArray);
    width: number;
    height: number;
    data: Uint8Array;
    colorSpace: PredefinedColorSpace;
    resize(size: Size): void;
    clone(): AlphaImage;
    static copy(srcImg: AlphaImage, dstImg: AlphaImage, srcPt: Point_2, dstPt: Point_2, size: Size): void;
}

// 轴对齐包围盒
export declare class AxisAlignedBox3 {
    constructor(minimum?: Vector3, maximum?: Vector3);
    readonly minimum: Vector3;
    readonly maximum: Vector3;
    readonly center: Vector3;
    static fromPoints(points: Vector3[]): AxisAlignedBox3;
    clone(): AxisAlignedBox3;
    copy(box: AxisAlignedBox3): this;
    equals(box: AxisAlignedBox3): boolean;
    getSize(target?: Vector3): Vector3;
    intersectsPlane(plane: Plane_2): Intersect;
    containsPoint(point: Vector3): boolean;
    distanceToPoint(point: Vector3): number;
    distanceToPointSquared(point: Vector3): number;
    expandByPoint(point: Vector3): this;
    expandByScalar(scalar: number): this;
}

// 动画挤出处理器
export declare class AnimatedExtrusionHandler {
    constructor(mapView: MapView);
    enabled: boolean;
    duration: number;
    get forceEnabled(): boolean;
    set forceEnabled(force: boolean);
    get minZoomLevel(): number;
    get isAnimating(): boolean;
}

// 动画模块
export declare class AnimationModule {
    constructor(mapView: MapView);
    setupFolder(gui: GUI): GUI;
    createData(): AnimationData;
    updateData(data: AnimationData): void;
    bindControls(folder: GUI, data: AnimationData): void;
}

// 画笔处理器
export declare class BrushProcessor {
    constructor(mapView: MapView);
    applyBrush(brush: Brush, tile: Tile, operationId: string): void;
    applyBrushOperations(operations: BrushOperation[], operationIds: string[], boundingBoxes: GeoBox[]): void;
    clearModifications(): void;
    getSerializedModifications(): SerializedGroundModificationData[];
}

// 批处理样式处理器
export declare class BatchStyleProcessor extends StyleSetEvaluator {
    constructor(theme: Theme | FlatTheme);
    evaluateStyleSet(layers: string[], feature: any): { [styleSetId: string]: Style[] };
}

// 边界生成器
export declare class BoundsGenerator {
    constructor(tile: Tile);
    getBounds(): GeoBox;
}

// 相机动画构建器
export declare class CameraAnimationBuilder {
    constructor(mapView: MapView);
    addKeyframe(time: number, position: GeoCoordinates, zoomLevel: number, tilt: number, heading: number): this;
    setInterpolation(interpolation: InterpolationType): this;
    build(): CameraAnimation;
}

// 相机模块
export declare class CameraModule {
    constructor(mapView: MapView);
    setupFolder(gui: GUI): GUI;
    createData(): CameraData;
    updateData(data: CameraData): void;
    bindControls(folder: GUI, data: CameraData): void;
}

// 相机移动检测器
export declare class CameraMovementDetector {
    constructor(mapView: MapView);
    isCameraMoving(): boolean;
}

// 地图视图大气效果
export declare class MapViewAtmosphere {
    constructor(mapView: MapView);
    update(deltaTime: number): void;
}

// 地图视图环境
export declare class MapViewEnvironment {
    constructor(mapView: MapView, options?: MapViewEnvironmentOptions);
}

// 地图视图雾效
export declare class MapViewFog {
    constructor(mapView: MapView);
    update(): void;
}

// 地图视图图像缓存
export declare class MapViewImageCache {
    constructor(mapView: MapView);
}

// 地图视图监视器
export declare class MapViewMonitor {
    constructor(mapView: MapView);
    update(): void;
}

// 地图视图主题管理器
export declare class MapViewThemeManager {
    constructor(mapView: MapView);
    loadTheme(theme: Theme | FlatTheme): Promise<void>;
    getTheme(): Theme | FlatTheme | undefined;
}
```

## 9. 枚举类型

### 9.1 APIFormat

```typescript
export declare enum APIFormat {
    HereV1 = 0,
    MapboxV4 = 1,
    XYZMVT = 2,
    XYZJson = 3,
    XYZOMV = 4,
    TomtomV1 = 5,
    XYZSpace = 6
}
```

### 9.2 AuthenticationMethod

```typescript
export declare enum AuthenticationMethod {
    QueryString = 0,
    AuthorizationHeader = 1
}
```

### 9.3 AnimatedExtrusionState

```typescript
export declare enum AnimatedExtrusionState {
    None = 0,
    Started = 1,
    Finished = 2
}
```

### 9.4 AtmosphereLightMode

```typescript
export declare enum AtmosphereLightMode {
    LightOverhead = 0,
    LightDynamic = 1
}
```

### 9.5 AtmosphereShadingVariant

```typescript
export declare enum AtmosphereShadingVariant {
    ScatteringShader = 0,
    SimpleColor = 1,
    Wireframe = 2
}
```

### 9.6 AtmosphereVariant

```typescript
export declare enum AtmosphereVariant {
    Ground = 1,
    Sky = 2,
    SkyAndGround = 3
}
```

### 9.7 BrushType

```typescript
export declare enum BrushType {
    Raise = 0,
    Lower = 1,
    Smooth = 2,
    Flatten = 3,
    Noise = 4,
    Erode = 5
}
```

### 9.8 CalculationStatus

```typescript
export declare enum CalculationStatus {
    Success = 0,
    Error = 1,
    InvalidInput = 2
}
```

### 9.9 MapViewEventNames

```typescript
export declare enum MapViewEventNames {
    FrameEnd = "frameend",
    Zoom = "zoom",
    Move = "move",
    Tilt = "tilt",
    Heading = "heading",
    Resize = "resize",
    Pick = "pick"
}
```

### 9.10 MapViewPowerPreference

```typescript
export declare enum MapViewPowerPreference {
    Default = "default",
    LowPower = "low-power",
    HighPerformance = "high-performance"
}
```

## 10. 接口和类型定义

### 10.1 核心接口

```typescript
// 地理坐标类似物
export declare interface GeoCoordinatesLike {
    latitude: number;
    longitude: number;
    altitude?: number;
}

// 瓦片类似物
export declare interface TileKeyLike {
    level: number;
    x: number;
    y: number;
}

// 盒子类似物
export declare interface Box3Like {
    min: Vector3;
    max: Vector3;
}

// 点类似物
export declare interface Point_2 {
    x: number;
    y: number;
}

// 大小类似物
export declare interface Size {
    width: number;
    height: number;
}

// 回调函数
export declare type Callback<T> = (error: Error | null, result: T) => void;

// 任何数组
export declare type AnyArray = any[] | TypedArray;

// 大类型数组
export declare type BigTypedArray = TypedArray | BigInt64Array | BigUint64Array;

// 大类型数组构造函数
export declare type BigTypedArrayConstructor = TypedArrayConstructor | BigInt64ArrayConstructor | BigUint64ArrayConstructor;

// 属性映射
export declare type AttributeMap = Record<string, unknown> | string | number;

// 认证码提供者
export declare type AuthenticationCodeProvider = () => Promise<string>;

// 认证提供者
export declare type AuthenticationProvider = () => Promise<string>;

// 异步协程
export declare type AsyncCoroutine<T> = CoroutineBase<void | Promise<void>, T>;

// 基本样式
export declare type BaseStyle<Technique, Params> = StyleAttributes<Technique, Params> & Partial<Params>;

// 缓冲几何类型
export declare type BufferElementType = "float" | "uint8" | "uint16" | "uint32" | "int8" | "int16" | "int32";

// 画笔设置
export declare type BrushSettings = RaiseSettings | LowerSettings | SmoothSettings | FlattenSettings | NoiseSettings | ErodeSettings;

// 画笔形状
export declare type BrushShape = "circle" | "square" | "diamond" | "soft";
```

### 10.2 认证接口

```typescript
// API Key 认证
export declare interface ApiKeyAuthentication {
    apikey: string;
}

// App ID 认证
export declare interface AppIdAuthentication {
    appId: string;
    appCode: string;
}

// 认证方法信息
export declare interface AuthenticationMethodInfo {
    method: AuthenticationMethod;
    name?: string;
}
```

### 10.3 动画接口

```typescript
// 动画数据
export declare interface AnimationData {
    animating: boolean;
    animationCount: number;
    frameNumber: number;
}

// 相机数据
export declare interface CameraData {
    position: GeoCoordinates;
    zoomLevel: number;
    tilt: number;
    heading: number;
}
```

### 10.4 光照接口

```typescript
// 环境光
export declare interface AmbientLight extends BaseLight {
    type: "ambient";
    color: string;
    intensity?: number;
}

// 基础光
export declare interface BaseLight {
    type: string;
    name: string;
}
```

### 10.5 画笔接口

```typescript
// 基础画笔设置
export declare interface BaseBrushSettings {
    radius: number;
    hardness: number;
    shape?: BrushShape;
}

// 画笔操作
export declare interface BrushOperation {
    type: BrushType;
    settings: BrushSettings;
    position: GeoCoordinates;
}
```

### 10.6 数据源接口

```typescript
// 数据源数据
export declare interface DataSourceData {
    dataSources: DataSource[];
}

// 数据源选项
export declare interface DataSourceOptions {
    name?: string;
    tilingScheme?: TilingScheme;
    storageLevelOffset?: number;
}

// 数据源瓦片列表
export declare interface DataSourceTileList {
    tiles: Tile[];
}
```

### 10.7 地图视图接口

```typescript
// 地图视图环境选项
export declare type MapViewEnvironmentOptions = Pick<MapViewOptions, "addBackgroundDatasource" | "backgroundTilingScheme" | "celestiaOptions">;
```

### 10.8 版权信息接口

```typescript
// 区域版权信息
export declare interface AreaCopyrightInfo {
    minLevel?: number;
    maxLevel?: number;
    label: string;
    alt?: string;
    boxes?: Array<[number, number, number, number]>;
}
```

### 10.9 二进制图像接口

```typescript
// 二进制图像元数据
export declare interface BinaryImageMetadata {
    width: number;
    height: number;
    format: string;
    data: ArrayBuffer;
}
```

### 10.10 附件接口

```typescript
// 附件
export declare interface Attachment {
    uuid?: string;
    name?: string;
    index?: BufferAttribute;
    edgeIndex?: BufferAttribute;
    groups: Group[];
}
```

## 11. 常量和预定义值

```typescript
// 大气地面渲染顺序
export declare const ATMOSPHERE_GROUND_RENDER_ORDER: number;

// 大气天空渲染顺序
export declare const ATMOSPHERE_SKY_RENDER_ORDER: number;

// 基础技术非材质属性
export declare const BASE_TECHNIQUE_NON_MATERIAL_PROPS: string[];

// 浏览器信息
export declare const browser: {
    name: string;
    version: string;
    os: string;
    mobile: boolean;
    webgl: boolean;
    webgl2: boolean;
};

// 认证类型 - Access Token
export declare const AuthenticationTypeAccessToken: AuthenticationMethodInfo;

// 认证类型 - Bearer
export declare const AuthenticationTypeBearer: AuthenticationMethodInfo;

// 认证类型 - TomTom V1
export declare const AuthenticationTypeTomTomV1: AuthenticationMethodInfo;
```

## 12. 主题相关

```typescript
// 主题
export declare type Theme = Theme_2;

// 平面主题
export declare type FlatTheme = FlatTheme_2;

// 样式属性
export declare type StyleAttributes<Technique, Params> = {
    when?: string;
    technique: Technique;
    attr?: Attr<Params>;
};

// 属性
export declare type Attr<T> = {
    [P in keyof T]?: T[P] | JsonExpr;
};
```

## 13. 类型别名

```typescript
// 基本挤出线样式
export declare type BasicExtrudedLineStyle = BaseStyle<"extruded-line", BasicExtrudedLineTechniqueParams>;

// 基本挤出线技术
export declare interface BasicExtrudedLineTechnique extends MakeTechniqueAttrs<BasicExtrudedLineTechniqueParams> {
    type: "extruded-line";
}

// 基本挤出线技术参数
export declare interface BasicExtrudedLineTechniqueParams extends BaseTechniqueParams, PolygonalTechniqueParams {
    height?: DynamicProperty<number>;
    color?: DynamicProperty<Color>;
    lineWidth?: DynamicProperty<number>;
}
```

## 14. 常见问题和注意事项

### 14.1 性能优化

- **瓦片缓存**: 合理设置 `tileCacheSize` 以平衡内存使用和性能
- **LOD 控制**: 启用 `enableLevelOfDetail` 以优化远处物体的渲染
- **视锥体剔除**: 启用 `enableFrustumCulling` 以减少绘制调用
- **阴影设置**: 根据性能需求调整 `shadowMapSize` 和 `shadowMapType`
- **请求调度**: 使用 `requestScheduler` 控制并发请求数量

### 14.2 浏览器兼容性

- 支持所有现代浏览器（Chrome、Firefox、Safari、Edge）
- 需要 WebGL 2.0 支持
- 移动设备上可能需要降低渲染质量以保证性能

### 14.3 数据加载问题

- **跨域请求**: 确保数据源支持 CORS
- **认证问题**: 正确配置 `accessToken` 或其他认证信息
- **网络错误**: 实现错误处理和重试机制
- **数据格式**: 确保数据源格式与使用的数据源类匹配

### 14.4 常见错误及解决方案

- **"Map canvas element not found"**: 确保 HTML 中存在带有正确 ID 的 canvas 元素
- **"Cesium Ion token is required"**: 提供有效的 Cesium Ion access token
- **"Failed to load tile"**: 检查网络连接和数据源 URL
- **"WebGL context lost"**: 减少内存使用，检查是否有内存泄漏
- **"Invalid tile key"**: 确保使用有效的 TileKey 对象

### 14.5 最佳实践

- **模块化代码**: 将地图初始化、数据源配置等分离为不同函数
- **错误处理**: 实现全面的错误处理机制
- **资源管理**: 及时销毁不再使用的对象以避免内存泄漏
- **响应式设计**: 监听窗口大小变化并调用 `mapView.resize()`
- **渐进式加载**: 先加载低分辨率数据，再逐步加载高分辨率数据
- **用户体验**: 提供加载指示器和错误提示

## 15. 示例代码汇总

### 15.1 基本地图初始化

```typescript
import {
    MapView,
    GeoCoordinates,
    MapControls,
    DEMTerrainSource,
    ArcGISTileProvider,
    MapControlsUI,
    sphereProjection
} from "@flywave/flywave.gl";

// 获取地图画布元素
const getMapCanvas = (): HTMLCanvasElement => {
    const canvas = document.getElementById("mapCanvas") as HTMLCanvasElement;
    if (!canvas) {
        throw new Error("Map canvas element not found");
    }
    return canvas;
};

// 初始化地图视图
const initializeMapView = (canvas: HTMLCanvasElement): MapView => {
    const initialLocation = new GeoCoordinates(36, 118);
    
    return new MapView({
        projection: sphereProjection,
        target: initialLocation,
        zoomLevel: 6,
        tilt: 45,
        heading: 1.5413763202653008,
        logarithmicDepthBuffer: true,
        canvas: canvas,
        theme: {
            extends: "resources/tilezen_base_globe.json",
            celestia: {
                atmosphere: true
            }
        }
    });
};

// 初始化地图控制
const initializeMapControls = (mapView: MapView, canvas: HTMLCanvasElement): void => {
    const controls = new MapControls(mapView);
    const ui = new MapControlsUI(controls, {
        screenshotButton: {
            width: 512,
            height: 512
        }
    });
    canvas.parentElement!.appendChild(ui.domElement);
};

// 配置 DEM 地形数据源
const configureDEMTerrainSource = (mapView: MapView): void => {
    const demTerrain = new DEMTerrainSource({
        source: "dem_terrain/source.json"
    });
    
    mapView.setElevationSource(demTerrain);
    demTerrain.addWebTileDataSource(
        new ArcGISTileProvider({
            minDataLevel: 0,
            maxDataLevel: 18
        })
    );
};

// 主执行流程
try {
    const canvas = getMapCanvas();
    const mapView = initializeMapView(canvas);
    initializeMapControls(mapView, canvas);
    configureDEMTerrainSource(mapView);
    console.log("Map initialized successfully");
} catch (error) {
    console.error("Error initializing map:", error);
}
```

### 15.2 添加 3D Tiles 数据源

```typescript
import {
    MapView,
    GeoCoordinates,
    ellipsoidProjection,
    MapControls,
    CesiumIonDataSource,
    MapControlsUI
} from "@flywave/flywave.gl";

// 初始化地图视图
const mapView = new MapView({
    projection: ellipsoidProjection,
    target: new GeoCoordinates(40.6959, -74.0162),
    zoomLevel: 18,
    tilt: 70,
    heading: 35.1,
    canvas: canvas,
    theme: {
        extends: "resources/tilezen_base_globe.json"
    }
});

// 初始化地图控制
const controls = new MapControls(mapView);
const ui = new MapControlsUI(controls);
canvas.parentElement!.appendChild(ui.domElement);

// 创建 Cesium Ion 数据源
const cesiumIonDataSource = new CesiumIonDataSource({
    accessToken: "your-cesium-ion-token",
    assetId: 75343
});

mapView.addDataSource(cesiumIonDataSource);
```

### 15.3 相机动画

```typescript
// 飞行到指定位置
mapView.flyTo(new GeoCoordinates(39.9042, 116.4074), {
    duration: 5000,
    zoomLevel: 12,
    tilt: 60,
    heading: 0
}).then(() => {
    console.log("Fly to completed");
});

// 平滑过渡到新位置
mapView.setTarget(new GeoCoordinates(39.9042, 116.4074), 2000);
mapView.setZoomLevel(14, 2000);
mapView.setTilt(45, 2000);
mapView.setHeading(0, 2000);
```

### 15.4 事件监听

```typescript
// 监听地图移动
mapView.addEventListener("move", () => {
    const target = mapView.getTarget();
    console.log(`Map moved to: ${target.latitude.toFixed(4)}, ${target.longitude.toFixed(4)}`);
});

// 监听缩放变化
mapView.addEventListener("zoom", () => {
    console.log(`Zoom level: ${mapView.getZoomLevel().toFixed(2)}`);
});

// 监听每帧渲染结束
mapView.addEventListener("frameend", () => {
    // 执行每帧需要的操作
});
```

### 15.5 拾取操作

```typescript
// 拾取鼠标位置的对象
const pickResults = mapView.pickObjects(new Vector2(mouseX, mouseY), 5);

if (pickResults.length > 0) {
    const firstResult = pickResults[0];
    console.log("Picked object:", firstResult.object);
    console.log("Picked position:", firstResult.position);
    console.log("Picked distance:", firstResult.distance);
}

// 获取地形高度
const altitude = mapView.getAltitude(lon, lat, 0);
console.log("Terrain altitude at", lon, lat, ":", altitude);
```

## 16. 总结

Flywave.gl 是一个功能强大的 3D 地图可视化库，提供了丰富的地理空间数据可视化能力。通过本文档，您应该已经了解了：

1. 库的基本架构和核心组件
2. 如何快速开始使用 Flywave.gl
3. 核心类的详细配置和使用方法
4. 数据源相关类和使用方法
5. 地图控制和交互的实现
6. 投影系统和坐标转换
7. 认证和 API 格式相关内容
8. 工具类和函数
9. 枚举类型和接口定义
10. 常见问题和最佳实践
11. 实用示例代码

Flywave.gl 的 API 设计清晰，功能丰富，适用于从简单的 3D 地图展示到复杂的地理空间分析应用。通过合理使用其提供的组件和功能，您可以构建高性能、交互式的 3D 地图应用。

如需更详细的信息，建议参考官方文档和示例代码库。