# Flywave Heightmap Painter 三维版本 - 使用指南

## ✨ 新功能概览

现在 `flywave-heightmap-painter` 已经完全重构为**纯三维版本**！

### 主要特性

1. ✅ **直接在三维地图上绘制** - 无需二维地图
2. ✅ **接收 MapView 实例** - 无需自己创建地图
3. ✅ **实时笔刷光标** - 圆形、白色半透明、带边框，显示在地形表面
4. ✅ **米制单位** - 笔刷尺寸以米为单位，更直观
5. ✅ **实时地形修改** - 绘制后可直接应用到地形
6. ✅ **自定义输出尺寸** - 自由设置输出图片的宽高

## 📦 安装

```bash
npm install @flywave/flywave-heightmap-painter
```

## 🚀 快速开始

### 1. 创建 MapView

```typescript
import {
    MapView,
    GeoCoordinates,
    CesiumWorldTerrainSource,
    ellipsoidProjection
} from "@flywave/flywave.gl";

const canvas = document.createElement("canvas");
canvas.style.width = "100%";
canvas.style.height = "100%";
document.body.appendChild(canvas);

const map = new MapView({
    target: new GeoCoordinates(36.4, 118.1, 2000),
    zoomLevel: 16,
    projection: ellipsoidProjection,
    canvas: canvas
});

// 配置地形数据源
const terrainSource = new CesiumWorldTerrainSource({
    accessToken: "YOUR_TOKEN",
    assetId: 1
});
map.setElevationSource(terrainSource);
```

### 2. 创建 HeightmapPainter

```typescript
import { HeightmapPainter } from "@flywave/flywave-heightmap-painter";

// 定义绘制区域
const paintAreaGeoBox = {
    minLon: 118.05,
    minLat: 36.35,
    maxLon: 118.15,
    maxLat: 36.45
};

// 创建 painter，传入 mapView
const painter = new HeightmapPainter({
    mapView: map, // ⚠️ 必须传入 mapView
    width: 1024, // 输出图片宽度
    height: 1024, // 输出图片高度
    paintAreaGeoBox: paintAreaGeoBox // 绘制区域
});

// 将 painter 添加到页面
document.body.appendChild(painter.getElement());
```

### 3. 监听事件

```typescript
// 监听导出事件，应用到地形
painter.on("export", data => {
    const manager = terrainSource.getGroundModificationManager();

    const geoBox = new GeoBox(
        new GeoCoordinates(data.geoBox.minLat, data.geoBox.minLon),
        new GeoCoordinates(data.geoBox.maxLat, data.geoBox.maxLon)
    );

    manager.addModifier(
        { type: "image", image: data.imageData },
        geoBox,
        HeightMapBlendMode.ADD,
        1.0,
        { min: 0, max: 500 }
    );
});

// 监听绘制事件
painter.on("brushStart", (x, y) => {
    console.log("开始绘制:", x, y);
});

painter.on("brushMove", (x, y) => {
    console.log("绘制中:", x, y);
});

painter.on("heightmapChange", heightData => {
    console.log("高度数据变化:", heightData.length);
});
```

## 🎨 笔刷功能

### 笔刷类型

-   ⬆️ **提升** (RAISE) - 增加地形高度
-   ⬇️ **降低** (LOWER) - 减少地形高度
-   〰️ **平滑** (SMOOTH) - 平滑地形
-   ▬ **平整** (FLATTEN) - 将地形平整到指定高度
-   ✖️ **噪声** (NOISE) - 添加随机噪声

### 笔刷设置

```typescript
// 更新笔刷设置
painter.updateBrushSettings({
    type: BrushType.RAISE,
    size: 100, // 尺寸（米）
    sizeUnit: "meters", // 单位：米
    strength: 0.5, // 强度 (0-1)
    hardness: 0.5 // 硬度 (0-1)
});
```

### 笔刷光标

-   **形状**: 圆形
-   **样式**: 白色半透明，带边框
-   **位置**: 跟随鼠标，显示在地形表面
-   **尺寸**: 根据笔刷大小动态调整（米 → 像素转换）

## 📐 坐标转换

绘制过程自动完成以下坐标转换：

```
屏幕坐标 (鼠标位置)
    ↓ mapView.getWorldPositionAt(x, y)
世界坐标 (Vector3)
    ↓ mapView.projection.unprojectPoint(worldPos)
地理坐标 (latitude, longitude)
    ↓ 根据 paintAreaGeoBox 标准化
画布坐标 (0-width, 0-height)
    ↓ BrushEngine.drawAt()
高度数据 (Float32Array)
```

## 🖼️ 输出格式

导出的数据包含：

```typescript
interface HeightmapExport {
    imageData: HTMLCanvasElement; // 高度图数据
    geoBox: {
        minLon: number;
        minLat: number;
        maxLon: number;
        maxLat: number;
    };
    width: number; // 输出图片宽度
    height: number; // 输出图片高度
}
```

## 🔧 API

### HeightmapPainterOptions

```typescript
interface HeightmapPainterOptions {
    mapView: MapView; // MapView 实例（必需）
    width: number; // 输出图片宽度
    height: number; // 输出图片高度
    paintAreaGeoBox: {
        minLon: number;
        minLat: number;
        maxLon: number;
        maxLat: number;
    };
}
```

### 方法

-   `getElement()` - 获取 DOM 元素
-   `exportHeightmap()` - 导出高度图
-   `clearCanvas()` - 清空画布
-   `updateBrushSettings(settings)` - 更新笔刷设置
-   `getBrushSettings()` - 获取当前笔刷设置
-   `on(event, callback)` - 监听事件
-   `off(event, callback)` - 取消监听
-   `destroy()` - 销毁实例

### 事件

-   `ready` - Painter 初始化完成
-   `brushStart` - 开始绘制
-   `brushMove` - 绘制中
-   `brushEnd` - 结束绘制
-   `heightmapChange` - 高度数据变化
-   `export` - 导出高度图
-   `destroy` - Painter 销毁

## 📝 完整示例

```typescript
import {
    MapView,
    GeoCoordinates,
    GeoBox,
    CesiumWorldTerrainSource,
    HeightMapBlendMode,
    ellipsoidProjection
} from "@flywave/flywave.gl";

import { HeightmapPainter } from "@flywave/flywave-heightmap-painter";

// 1. 创建 MapView
const canvas = document.createElement("canvas");
document.body.appendChild(canvas);

const map = new MapView({
    target: new GeoCoordinates(36.4, 118.1, 2000),
    zoomLevel: 16,
    projection: ellipsoidProjection,
    canvas: canvas
});

// 2. 配置地形
const terrainSource = new CesiumWorldTerrainSource({
    accessToken: "YOUR_TOKEN",
    assetId: 1
});
map.setElevationSource(terrainSource);

// 3. 创建 Painter
const painter = new HeightmapPainter({
    mapView: map,
    width: 1024,
    height: 1024,
    paintAreaGeoBox: {
        minLon: 118.05,
        minLat: 36.35,
        maxLon: 118.15,
        maxLat: 36.45
    }
});

document.body.appendChild(painter.getElement());

// 4. 监听导出事件
painter.on("export", data => {
    const manager = terrainSource.getGroundModificationManager();
    const geoBox = new GeoBox(
        new GeoCoordinates(data.geoBox.minLat, data.geoBox.minLon),
        new GeoCoordinates(data.geoBox.maxLat, data.geoBox.maxLon)
    );

    manager.addModifier(
        { type: "image", image: data.imageData },
        geoBox,
        HeightMapBlendMode.ADD,
        1.0,
        { min: 0, max: 500 }
    );
});

map.beginAnimation();
```

## 🎯 与旧版本的区别

### ❌ 旧版本（已移除）

-   使用 Leaflet 二维地图
-   需要自己创建地图实例
-   在 canvas 上绘制
-   笔刷单位是像素

### ✅ 新版本

-   使用 flywave.gl 三维地图
-   接收 MapView 实例
-   直接在三维地图上绘制
-   笔刷单位是米
-   实时笔刷光标 UI

## ⚠️ 注意事项

1. **MapView 必须已初始化** - 传入的 MapView 必须已经完成初始化
2. **地形数据源** - MapView 需要配置地形数据源才能正确获取高度信息
3. **绘制区域** - paintAreaGeoBox 必须在可见范围内
4. **笔刷单位** - 笔刷尺寸单位固定为"米"，会自动转换为屏幕像素

## 🐛 问题反馈

如有问题，请提交 issue 到：https://github.com/flywave/flywave.gl/issues
