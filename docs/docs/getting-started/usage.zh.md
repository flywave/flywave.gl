# 基本使用

本指南将介绍如何使用 flywave.gl 创建基本的 3D 地图应用。

## 基础路径配置

在使用 flywave.gl 之前，您可能需要配置基础路径来正确加载资源文件。

### 设置基础路径

```html
<script>
  // 设置全局基础路径
  window.FLYWAVE_BASE_URL = "https://flywave.github.io/flywave.gl/resources/";
</script>
```

或者在您的应用代码中设置：

```typescript
// 在初始化 MapView 之前设置基础路径
window.FLYWAVE_BASE_URL = "https://flywave.github.io/flywave.gl/resources/";

import { MapView, GeoCoordinates, MapControls, sphereProjection } from "@flywave/flywave.gl";
```

更多关于基础路径配置的信息，请参阅 [基础路径配置指南](../configuration/base-url)。

## 核心概念

flywave.gl 提供了以下核心功能：

- 3D 地图渲染：开发视觉上吸引人的 3D 地图
- WebGL 渲染：使用 WebGL 创建高度动画和动态的地图可视化效果
- 动态主题：创建可动态切换的主题地图
- 高性能渲染：通过高性能的地图渲染和解码创建流畅的地图体验
- 模块化设计：可以根据需要交换模块和数据提供者

## 快速开始示例

### 基本球面地图

创建一个基本的球面地图：

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

// 获取 canvas 元素
const canvas = document.getElementById("mapCanvas") as HTMLCanvasElement;

// 初始化地图视图
const mapView = new MapView({
    projection: sphereProjection,      // 使用球面投影
    target: new GeoCoordinates(36, 118), // 设置中心坐标
    zoomLevel: 6,                      // 设置缩放级别
    tilt: 45,                          // 设置倾斜角度
    heading: 1.5413763202653008,      // 设置航向角
    canvas,                            // 指定渲染 canvas
    theme: {
        extends: "resources/tilezen_base_globe.json", // 使用基础主题
        "celestia": {
            "atmosphere": true,        // 启用大气效果
        }
    }
});

// 添加地图控制
const control = new MapControls(mapView);
const ui = new MapControlsUI(control, {
    "screenshotButton": {
        "width": 512,
        "height": 512,
    },
});
canvas.parentElement!.appendChild(ui.domElement);

// 添加地形数据源
const demTerrain = new DEMTerrainSource({
    source: "dem_terrain/source.json",
});
mapView.setElevationSource(demTerrain);

// 添加瓦片数据源
demTerrain.addWebTileDataSource(new ArcGISTileProvider());
```

:::note
使用 `@flywave/flywave.gl` 包时，所有核心功能都已包含在内，无需单独安装其他子模块。
:::

### 平面地图

创建一个使用墨卡托投影的平面地图：

```typescript
import {
    MapView,
    GeoCoordinates, 
    MapControls,
    DEMTerrainSource,
    ArcGISTileProvider, 
    MapControlsUI, 
    mercatorProjection
} from "@flywave/flywave.gl";

const canvas = document.getElementById("mapCanvas") as HTMLCanvasElement;
 
const mapView = new MapView({
    projection: mercatorProjection,    // 使用墨卡托投影
    target: new GeoCoordinates(36, 118),
    zoomLevel: 6, 
    tilt: 45,
    heading: 1.5413763202653008,
    canvas,
    theme: {
        extends: "resources/tilezen_base.json" // 使用平面地图主题
    }
});

const control = new MapControls(mapView);
const ui = new MapControlsUI(control);
canvas.parentElement!.appendChild(ui.domElement);

const demTerrain = new DEMTerrainSource({
    source: "dem_terrain/source.json",
});

mapView.setElevationSource(demTerrain);
demTerrain.addWebTileDataSource(new ArcGISTileProvider());
```

## 核心 API 概念

### MapView
地图视图的核心类，负责渲染和管理地图视图。主要配置选项包括：
- `projection`: 地图投影方式
- `target`: 地图中心坐标
- `zoomLevel`: 缩放级别
- `tilt`: 倾斜角度
- `heading`: 航向角
- `canvas`: 渲染目标 canvas
- `theme`: 地图主题配置

### 投影类型
- `sphereProjection`: 球面投影，用于地球地图
- `mercatorProjection`: 墨卡托投影，用于平面地图
- `ellipsoidProjection`: 椭球投影，用于精确地理计算

### 控制组件
- `MapControls`: 地图控制组件，处理用户交互
- `MapControlsUI`: 地图控制UI组件，提供用户界面元素

### 数据源
- `DEMTerrainSource`: 数字高程模型地形数据源
- `ArcGISTileProvider`: ArcGIS 瓦片数据提供者
- 支持多种数据源类型，包括 3D Tiles、矢量瓦片等

## 主要特性

- 高性能渲染: 利用 WebGL 和现代图形技术实现流畅的 3D 地图渲染
- 模块化设计: 可以根据需要选择和组合不同的功能模块
- 可扩展主题: 支持动态切换和自定义地图主题
- 多数据源支持: 支持多种地图数据源格式
- 丰富的交互功能: 提供完整的地图交互和控制功能
- 多种投影方式: 支持球面、平面和椭球投影
- 地形支持: 内置数字高程模型 (DEM) 支持

## 下一步

- [查看示例指南](./examples) - 探索更多高级功能示例
- [环境搭建](../development/setup) - 了解如何设置开发环境