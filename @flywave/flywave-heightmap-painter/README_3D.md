# Flywave Heightmap Painter - 三维地图版本

## 概述

`flywave-heightmap-painter` 现已支持三维地图（基于 flywave.gl）。这个版本可以直接在 flywave.gl 的 MapView 上进行地形绘制，实现实时可见的地形修改效果。

## 主要特性

-   ✨ **三维地图支持**：直接在 flywave.gl 的 MapView 上绘制
-   🎨 **实时笔刷 UI**：圆形、白色半透明、有边框的笔刷光标
-   📏 **米制单位**：笔刷尺寸支持米和像素两种单位
-   🖼️ **自定义输出**：可以自由设置输出图片的尺寸
-   🌍 **地理坐标转换**：利用 MapView 的屏幕坐标到地理坐标转换
-   🔄 **实时预览**：绘制过程中实时更新地形

## 基本使用

### 1. 使用 MapView 实例

```typescript
import { HeightmapPainter } from "@flywave/flywave-heightmap-painter";
import { MapView, GeoCoordinates, CesiumWorldTerrainSource } from "@flywave/flywave.gl";

// 创建 MapView
const mapView = new MapView({
    target: new GeoCoordinates(36.4, 118.1, 1000),
    zoomLevel: 17,
    canvas: canvasElement
});

// 配置地形数据源
const terrainSource = new CesiumWorldTerrainSource({
    accessToken: "YOUR_TOKEN",
    assetId: 1
});
mapView.setElevationSource(terrainSource);

// 创建 HeightmapPainter，传入 mapView
const painter = new HeightmapPainter({
    mapView: mapView,
    paintAreaGeoBox: {
        minLon: 118.0,
        minLat: 36.3,
        maxLon: 118.2,
        maxLat: 36.5
    }
});

// 将 painter 的元素添加到页面
document.body.appendChild(painter.getElement());
```

### 2. 监听导出事件

```typescript
painter.on("export", data => {
    console.log("导出的高度图:", data);

    // 获取地形修改管理器
    const manager = terrainSource.getGroundModificationManager();

    // 创建 GeoBox
    const geoBox = new GeoBox(
        new GeoCoordinates(data.geoBox.minLat, data.geoBox.minLon),
        new GeoCoordinates(data.geoBox.maxLat, data.geoBox.maxLon)
    );

    // 添加地形修改器
    manager.addModifier(
        { type: "image", image: data.imageData },
        geoBox,
        HeightMapBlendMode.ADD,
        1.0,
        { min: 0, max: 500 }
    );
});
```

## API

### HeightmapPainterOptions

```typescript
interface HeightmapPainterOptions {
    mapView?: MapView; // MapView 实例（推荐）
    width?: number; // 宽度（像素）
    height?: number; // 高度（像素）
    initialCenter?: [number, number]; // 初始中心点 [纬度, 经度]
    initialZoom?: number; // 初始缩放级别
    basemap?: "satellite" | "street" | "terrain"; // 底图类型
    paintAreaGeoBox?: {
        // 绘制区域
        minLon: number;
        minLat: number;
        maxLon: number;
        maxLat: number;
    };
}
```

### BrushSettings

```typescript
interface BrushSettings {
    type: BrushType; // 笔刷类型
    size: number; // 笔刷大小
    sizeUnit: "meters" | "pixels"; // 尺寸单位
    strength: number; // 笔刷强度 (0-1)
    hardness: number; // 笔刷硬度 (0-1)
    flattenHeight?: number; // 平整高度 (仅 FLATTEN 类型)
}
```

## 笔刷类型

-   **RAISE**: 提升 - 增加地形高度
-   **LOWER**: 降低 - 减少地形高度
-   **SMOOTH**: 平滑 - 平滑地形
-   **FLATTEN**: 平整 - 将地形平整到指定高度
-   **NOISE**: 噪声 - 添加随机噪声

## 坐标系统

### 屏幕坐标 → 地理坐标 → 画布坐标

1. **屏幕坐标**: 鼠标在 MapView canvas 上的位置
2. **地理坐标**: 使用 `mapView.getWorldPositionAt(x, y)` 和 `mapView.projection.unprojectPoint(worldPos)` 转换
3. **画布坐标**: 根据 `paintAreaGeoBox` 标准化到画布坐标

```typescript
// 获取地理坐标
const worldPos = mapView.getWorldPositionAt(screenX, screenY);
const geoPos = mapView.projection.unprojectPoint(worldPos);

// 转换为画布坐标
const normalizedX = (geoPos.longitude - minLon) / (maxLon - minLon);
const normalizedY = 1 - (geoPos.latitude - minLat) / (maxLat - minLat);
const canvasX = normalizedX * canvasWidth;
const canvasY = normalizedY * canvasHeight;
```

## 实时地形修改

绘制的高度图可以直接应用到地形上，实现实时预览：

```typescript
painter.on("heightmapChange", (heightData: Float32Array) => {
    // 高度数据发生变化时的回调
    // 可以用于实时预览或其他处理
});
```

## 笔刷光标

在三维地图上绘制时，会显示一个圆形的笔刷光标：

-   中心：白色半透明
-   边框：2px 白色边框
-   尺寸：根据笔刷大小动态调整
-   位置：跟随鼠标，显示在地形表面

## 输出尺寸

可以自由设置输出图片的尺寸，通过图片的 geobox 范围和宽高计算对应的像素：

```typescript
const exportData = painter.exportHeightmap();
console.log(exportData.width, exportData.height); // 输出图片尺寸
console.log(exportData.geoBox); // 地理范围
```

## 迁移指南

### 从二维（Leaflet）迁移到三维（flywave.gl）

**旧版本（二维）：**

```typescript
const painter = new HeightmapPainter({
    width: 1024,
    height: 1024,
    initialCenter: [36.4, 118.1],
    initialZoom: 13,
    basemap: "satellite"
});
```

**新版本（三维）：**

```typescript
const painter = new HeightmapPainter({
    mapView: mapView, // 传入 MapView 实例
    paintAreaGeoBox: {
        minLon: 118.0,
        minLat: 36.3,
        maxLon: 118.2,
        maxLat: 36.5
    }
});
```

## 注意事项

1. **MapView 必须已初始化**: 确保传入的 MapView 实例已经完成初始化
2. **地形数据源**: MapView 需要配置地形数据源才能正确获取高度信息
3. **绘制区域**: paintAreaGeoBox 必须在可见范围内
4. **笔刷单位**: 使用"米"作为单位时，笔刷大小会根据地图比例自动调整

## 示例

完整示例请参考 `@flywave/flywave-examples/src/heightmap-painter/index.ts`
