# @flywave/flywave-mapview

`@flywave/flywave-mapview` 是 flywave.gl 库的地图视图模块，提供了渲染地图所需的所有核心功能。该模块包含地图视图管理、数据源处理、相机控制、文本渲染、拾取交互、主题管理、瓦片管理等功能。

## 安装

```bash
npm install @flywave/flywave-mapview
```

## 核心功能

### 1. MapView

`MapView` 是地图渲染的核心组件，提供了地图显示、交互和渲染调度的功能。

#### 基本用法

```typescript
import { MapView, GeoCoordinates, mercatorProjection } from "@flywave/flywave-mapview";

// 创建 HTML canvas 元素
const canvas = document.createElement("canvas");
canvas.width = 800;
canvas.height = 600;

// 初始化 MapView
const mapView = new MapView({
    canvas,
    projection: mercatorProjection, // 使用墨卡托投影
    target: new GeoCoordinates(39.9042, 116.4074, 1000), // 目标位置：北京，高度1000米
    zoomLevel: 15, // 缩放级别
    theme: "resources/theme.json" // 主题配置
});

// 调整视图大小
mapView.resize(window.innerWidth, window.innerHeight);

// 监听窗口大小变化事件
window.addEventListener("resize", () => {
    mapView.resize(window.innerWidth, window.innerHeight);
});
```

#### MapViewOptions 配置选项

- `canvas: HTMLCanvasElement` - 用于渲染的 canvas 元素
- `context?: WebGLRenderingContext` - 可选的 WebGL 渲染上下文
- `alpha?: boolean` - canvas 是否包含透明缓冲区（默认为 false）
- `addBackgroundDatasource?: boolean` - 是否为每个瓦片添加背景网格（默认为 false）
- `enableNativeWebglAntialias?: boolean` - 是否启用原生 WebGL 抗锯齿（默认为 `pixelRatio` < 2.0 时为 true）
- `customAntialiasSettings?: IMapAntialiasSettings` - 自定义抗锯齿设置
- `projection?: Projection` - 地图投影（默认为墨卡托投影）
- `decoderUrl?: string` - 解码器工作线程脚本 URL（默认为 `./decoder.bundle.js`）
- `decoderCount?: number` - 解码器工作线程数量
- `theme?: string | Theme | FlatTheme | Promise<Theme>` - 地图主题配置
- `minZoomLevel?: number` - 最小缩放级别（默认为 1）
- `maxZoomLevel?: number` - 最大缩放级别（默认为 14）
- `minCameraHeight?: number` - 最小相机高度（米）
- `clipPlanesEvaluator?: ClipPlanesEvaluator` - 相机裁剪平面评估器
- `extendedFrustumCulling?: boolean` - 是否扩展视锥体剔除（默认为 true）
- `maxVisibleDataSourceTiles?: number` - 单个数据源的最大可见瓦片数量
- `tileCacheSize?: number` - 单个数据源的瓦片缓存大小
- `resourceComputationType?: ResourceComputationType` - 缓存计数方式（按瓦片数或按内存大小）
- `celestiaOptions?: CelestiaOptions` - 天体系统配置（太阳、大气等）

#### API 参考

- `addDataSource(dataSource: DataSource): Promise<void>` - 添加数据源
- `removeDataSource(dataSource: DataSource): void` - 移除数据源
- `setElevationSource(elevationSource: DataSource, elevationRangeSource: ElevationRangeSource, elevationProvider: ElevationProvider)` - 设置高程数据源
- `resize(width: number, height: number)` - 调整视图大小
- `update()` - 更新地图视图
- `lookAt(lookAtParams: LookAtParams)` - 调整视图到指定位置
- `getScreenPosition(geoPos: GeoCoordinates): THREE.Vector2` - 获取地理坐标在屏幕上的位置
- `intersectMapObjects(x: number, y: number, ...intersects: IntersectParams[])` - 拾取地图对象
- `dispose()` - 释放地图视图资源

### 2. DataSource

`DataSource` 是地图数据源的基类，用于加载和渲染地图数据。

#### 基本用法

```typescript
import { DataSource } from "@flywave/flywave-mapview";

// 自定义数据源
class CustomDataSource extends DataSource {
    constructor(name: string) {
        super(name);
    }

    // 实现数据加载逻辑
    async connect() {
        // 连接数据源
    }

    // 实现瓦片加载逻辑
    getTile(tileKey: TileKey) {
        // 返回瓦片数据
    }
}

// 添加数据源到地图视图
const customDataSource = new CustomDataSource("custom-data");
mapView.addDataSource(customDataSource);
```

### 3. MapAnchors (锚点对象)

`MapAnchors` 允许在地图上添加基于地理坐标的 3D 对象。

#### 基本用法

```typescript
import { GeoCoordinates } from "@flywave/flywave-geoutils";
import { BoxGeometry, Mesh, MeshBasicMaterial } from "three";

// 创建一个 3D 对象
const geometry = new BoxGeometry(100, 100, 100);
const material = new MeshBasicMaterial({ color: 0xff0000 });
const mesh = new Mesh(geometry, material);

// 设置锚点位置（地理坐标）
mesh.anchor = new GeoCoordinates(39.9042, 116.4074, 100); // 北京坐标，高度100米

// 添加到地图锚点系统
mapView.mapAnchors.add(mesh);

// 移除锚点对象
// mapView.mapAnchors.remove(mesh);
```

### 4. Celestia (天体系统)

`Celestia` 管理太阳、大气、天空等环境效果。

#### 基本用法

```typescript
// 初始化时配置天体系统
const mapView = new MapView({
    canvas,
    projection: sphereProjection, // 通常在球面投影中使用
    celestiaOptions: {
        atmosphere: true,           // 启用大气效果
        sunTime: Date.now(),        // 太阳时间
        sunCastShadow: true,        // 太阳光是否投射阴影
        sunIntensity: 1.0,          // 太阳光强度
        sunColor: "#ffffff"         // 太阳光颜色
    }
});

// 运行时控制太阳
mapView.sceneEnvironment.celestia.toggleSun(true);

// 设置日期时间
const date = new Date();
date.setHours(10); // 上午10点
mapView.sceneEnvironment.celestia.setCurrentDate(date);

// 更新天体系统配置
mapView.sceneEnvironment.celestia.updateOptions({
    atmosphere: true,
    sunTime: Date.now(),
    sunColor: "#ffaa00" // 橙色阳光
});
```

### 5. 后处理特效

MapView 集成了后处理特效系统，提供多种视觉增强效果。

#### 后处理特效配置

```typescript
const mapView = new MapView({
    canvas,
    theme: {
        extends: "resources/tilezen_base.json",
        toneMappingExposure: 10,
        clearAlpha: 0.0,
        celestia: {
            atmosphere: true
        },
        postEffects: {
            bloom: {
                enabled: true,
                strength: 2,
                radius: 2,
                levels: 4,
                ignoreBackground: true,
                luminancePassEnabled: true,
                luminancePassThreshold: 0.55,
                luminancePassSmoothing: 0.3
            },
            hueSaturation: {
                enabled: true,
                hue: 0,
                saturation: 0.21
            },
            brightnessContrast: {
                enabled: true,
                brightness: -0.15,
                contrast: 0.57
            },
            sepia: {
                enabled: false
            },
            vignette: {
                enabled: false
            }
        }
    }
});

// 运行时控制后处理效果
const effects = mapView.mapRenderingManager;
effects.bloom.enabled = true;
effects.brightnessContrast.enabled = true;
```

### 6. 主题管理

MapView 通过主题配置来设置全局属性，包括颜色、渲染参数、字体、后处理效果等。

#### 全局属性配置

```typescript
// 创建完整的主题配置
const theme = {
    extends: "resources/base-theme.json",  // 继承基础主题
    
    // 全局渲染参数
    clearColor: "#ffffff",                // 清除颜色
    clearAlpha: 0.0,                      // 清除透明度
    fontCatalogs: [                       // 字体目录列表
        {
            url: "resources/fonts.json",
            name: "default-font"
        }
    ],
    
    definitions: {                        // 可重用的定义
        "defaultColor": {
            type: "color",
            value: "#4a90e2"
        }
    },
    
    // 色调映射参数
    toneMappingExposure: 1.0,             // 曝光值
    
    // 后处理效果
    postEffects: {
        bloom: {
            enabled: true,
            strength: 1.5,
            radius: 1.2,
            threshold: 0.85
        },
        hueSaturation: {
            enabled: true,
            hue: 0,
            saturation: 0.5
        },
        brightnessContrast: {
            enabled: true,
            brightness: 0,
            contrast: 0
        }
    },
    
    // 天体系统配置
    celestia: {
        atmosphere: true,
        sunTime: Date.now(),
        sunCastShadow: false
    },
    
    // 雾效果配置
    fog: {
        color: "#ffffff",
        density: 0.00025
    },
    
    // 灯光配置
    lights: [
        {
            type: "ambient",
            name: "ambientLight",
            color: "#ffffff",
            intensity: 0.5
        }
    ],
    
    // 天空配置
    sky: {
        type: "gradient",
        topColor: "#2659dd",
        bottomColor: "#ffffff"
    },
    
    // 样式定义
    styles: {
        "tile": [
            {
                "technique": "fill",
                "when": "kind == 'water'",
                "attr": {
                    "color": "#4a90e2"
                }
            },
            {
                "technique": "solid-line",
                "when": "kind == 'road'",
                "attr": {
                    "color": "#ffffff",
                    "lineWidth": 2
                }
            }
        ]
    },
    
    // 文本样式
    textStyles: [
        {
            name: "default-label",
            fontCatalog: "default-font",
            size: 14,
            color: "#000000"
        }
    ],
    
    // 图像定义
    images: {
        "marker-icon": {
            url: "resources/icons/marker.png",
            preload: true
        }
    },
    
    // 环境贴图
    environment: {
        urls: [
            "resources/env/posx.jpg",
            "resources/env/negx.jpg", 
            "resources/env/posy.jpg",
            "resources/env/negy.jpg",
            "resources/env/posz.jpg",
            "resources/env/negz.jpg"
        ]
    },
    
    // 标签优先级
    labelPriorities: [
        "continent-labels",
        "country-labels", 
        "state-labels"
    ],
    
    // 对象优先级
    priorities: [
        { group: "tilezen", category: "outline-1" }
    ]
};

// 应用主题
const mapView = new MapView({
    canvas,
    theme
});
```

### 7. 文本渲染

MapView 提供了强大的文本渲染功能。

#### 文本渲染用法

```typescript
import { TextElement, TextRenderStyle, TextLayoutStyle, FontUnit } from "@flywave/flywave-mapview";

// 创建文本元素
const textElement = new TextElement(
    "示例文本",
    [new THREE.Vector3(0, 0, 0)], // 位置
    new TextRenderStyle({
        fontSize: {
            unit: FontUnit.Pixel,
            size: 16
        },
        color: new THREE.Color(0xffffff) // 白色
    }),
    new TextLayoutStyle()
);

// 添加到地图视图
mapView.addOverlayText([textElement]);
```

### 8. 拾取和交互

MapView 提供了拾取和交互功能。

#### 拾取示例

```typescript
// 设置拾取处理器
const canvas = mapView.canvas;
canvas.addEventListener("click", (event) => {
    const { x, y } = getCanvasPosition(event, canvas);
    const intersectResults = mapView.intersectMapObjects(x, y);
    
    if (intersectResults.length > 0) {
        console.log("拾取到对象:", intersectResults[0]);
    }
});

function getCanvasPosition(event: MouseEvent, canvas: HTMLCanvasElement) {
    const { left, top } = canvas.getBoundingClientRect();
    return { x: event.clientX - Math.floor(left), y: event.clientY - Math.floor(top) };
}
```

### 9. 相机控制和动画

MapView 支持多种相机控制和动画功能。

#### 相机控制示例

```typescript
// 设置视图到特定位置
mapView.lookAt({
    target: new GeoCoordinates(39.9042, 116.4074), // 北京坐标
    distance: 1000, // 距离（米）
    tilt: 45,       // 倾斜角度
    heading: 0      // 方位角
});

// 获取当前视图参数
const viewParams = mapView.getLookAtParams();
console.log("当前视图:", viewParams);
```

## 事件系统

MapView 使用事件系统来通知各种操作：

```typescript
import { MapViewEventNames } from "@flywave/flywave-mapview";

// 监听地图视图事件
mapView.addEventListener(MapViewEventNames.FrameComplete, (event) => {
    console.log("帧渲染完成");
});

mapView.addEventListener(MapViewEventNames.Resize, (event) => {
    console.log("视图大小已调整");
});

mapView.addEventListener(MapViewEventNames.CameraPositionChanged, (event) => {
    console.log("相机位置已改变");
});
```

## 示例

### 完整的地图应用示例

```typescript
import {
    MapView,
    GeoCoordinates,
    mercatorProjection,
    MapViewEventNames
} from "@flywave/flywave-mapview";

// 创建地图视图
const canvas = document.getElementById("mapCanvas") as HTMLCanvasElement;
const mapView = new MapView({
    canvas,
    projection: sphereProjection,
    target: new GeoCoordinates(39.9042, 116.4074, 1000),
    zoomLevel: 15,
    theme: {
        extends: "resources/tilezen_base_globe.json",
        toneMappingExposure: 10,
        clearAlpha: 0.0,
        celestia: {
            atmosphere: true
        },
        postEffects: {
            bloom: {
                enabled: true,
                strength: 2,
                radius: 2
            },
            hueSaturation: {
                enabled: true,
                saturation: 0.21
            }
        }
    }
});

// 初始化太阳和大气效果
mapView.sceneEnvironment.celestia.toggleSun(true);
const date = new Date();
date.setHours(10);
mapView.sceneEnvironment.celestia.setCurrentDate(date);

// 调整视图大小
mapView.resize(window.innerWidth, window.innerHeight);
window.addEventListener("resize", () => {
    mapView.resize(window.innerWidth, window.innerHeight);
});

// 监听相机位置变化事件
mapView.addEventListener(MapViewEventNames.CameraPositionChanged, (event) => {
    console.log("新相机位置:", event.latitude, event.longitude);
});

// 添加锚点对象
const geometry = new THREE.BoxGeometry(100, 100, 100);
const material = new THREE.MeshBasicMaterial({ color: 0xff0000 });
const mesh = new THREE.Mesh(geometry, material);
mesh.anchor = new GeoCoordinates(39.9042, 116.4074, 100);
mapView.mapAnchors.add(mesh);

// 更新循环
function update() {
    mapView.update();
    requestAnimationFrame(update);
}
update();
```

## 高级功能

### 地形高程

MapView 支持地形高程数据，可以实现 3D 地形渲染：

```typescript
// 设置高程数据源（地形）
mapView.setElevationSource(
    terrainDataSource,
    terrainDataSource.getElevationRangeSource(),
    terrainDataSource.getElevationProvider()
);
```

### 瓦片管理

MapView 提供了高效的瓦片管理系统，包括缓存、加载和渲染优化。

### 图片缓存

MapView 包含图片缓存管理器，用于优化图片资源的加载和使用。

## 许可证

Apache-2.0 License