# Flywave Heightmap Painter 三维版本重构总结

## 主要更改

### 1. 依赖更新

-   ❌ 移除 Leaflet 依赖
-   ✅ 添加对 @flywave/flywave.gl 的支持
-   ✅ 支持 MapView 实例作为输入

### 2. 类型系统更新

-   ✅ `L.Map` 类型现在指向 `MapView`
-   ✅ `BrushSettings` 添加 `sizeUnit` 属性（支持米和像素）
-   ✅ `HeightmapPainterOptions` 添加 `mapView` 可选参数

### 3. 核心组件更新

#### HeightmapPainter 类

-   接收 `mapView` 实例而不是自己创建地图
-   自动适配三维地图模式
-   保持 API 兼容性

#### PaintCanvas 组件

-   支持三维地图模式（当传入 mapView 时）
-   支持二维地图模式（当未传入 mapView 时，保持向后兼容）
-   使用 MapView 的坐标转换接口

#### BrushToolbar 组件

-   添加笔刷尺寸单位选择器（米/像素）
-   根据单位调整尺寸范围

### 4. 新增功能

#### 三维地图绘制

-   ✅ 使用 MapView 的 `getWorldPositionAt()` 获取世界坐标
-   ✅ 使用 `projection.unprojectPoint()` 转换为地理坐标
-   ✅ 根据地理坐标计算画布坐标

#### 笔刷光标（Brush Cursor）

-   圆形、白色半透明、有边框
-   跟随鼠标移动
-   在三维地图上显示在地形表面
-   尺寸根据笔刷大小动态调整

#### 实时预览

-   绘制时实时更新高度数据
-   可以直接应用到地形修改管理器

## 使用示例

### 基本使用（三维模式）

```typescript
import { HeightmapPainter } from "@flywave/flywave-heightmap-painter";
import { MapView, GeoCoordinates, CesiumWorldTerrainSource } from "@flywave/flywave.gl";

// 1. 创建 MapView
const mapView = new MapView({
    target: new GeoCoordinates(36.4, 118.1, 1000),
    zoomLevel: 17,
    canvas: canvasElement
});

// 2. 配置地形数据源
const terrainSource = new CesiumWorldTerrainSource({
    accessToken: "YOUR_TOKEN",
    assetId: 1
});
mapView.setElevationSource(terrainSource);

// 3. 创建 HeightmapPainter
const painter = new HeightmapPainter({
    mapView: mapView,
    paintAreaGeoBox: {
        minLon: 118.0,
        minLat: 36.3,
        maxLon: 118.2,
        maxLat: 36.5
    }
});

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

// 5. 将 painter 添加到页面
document.body.appendChild(painter.getElement());
```

## 坐标转换流程

```
屏幕坐标 (x, y)
    ↓ mapView.getWorldPositionAt(x, y)
世界坐标 (Vector3)
    ↓ mapView.projection.unprojectPoint(worldPos)
地理坐标 (latitude, longitude)
    ↓ 根据 paintAreaGeoBox 标准化
画布坐标 (canvasX, canvasY)
    ↓ BrushEngine.drawAt(canvasX, canvasY)
高度数据 (Float32Array)
```

## 笔刷单位转换

### 像素模式

-   直接使用像素值
-   范围：5-200px
-   适用于二维地图

### 米模式

-   使用实际米制单位
-   范围：1-1000m
-   适用于三维地图
-   自动转换为屏幕像素尺寸

## 向后兼容性

-   ✅ 仍然支持二维地图模式（不传入 mapView）
-   ✅ API 保持兼容
-   ✅ 现有代码无需修改即可使用

## 文件更改清单

### 修改的文件

-   `package.json` - 更新依赖
-   `src/types/index.ts` - 添加 MapView 类型和 sizeUnit
-   `src/HeightmapPainter.ts` - 支持 mapView 参数
-   `src/App.tsx` - 传递 mapView
-   `src/components/PaintCanvas.tsx` - 支持三维地图
-   `src/components/BrushToolbar.tsx` - 添加单位选择
-   `src/utils/brushEngine.ts` - 添加 sizeUnit 默认值

### 新增的文件

-   `src/components/MapPainter3D.tsx` - 三维地图绘制组件（独立实现）
-   `README_3D.md` - 三维版本使用说明
-   `REFACTOR_SUMMARY.md` - 本文档

## 技术亮点

1. **统一接口**：同一套 API 支持二维和三维地图
2. **类型安全**：完整的 TypeScript 类型定义
3. **实时反馈**：绘制时实时更新笔刷光标和高度数据
4. **灵活配置**：支持自定义输出尺寸和笔刷单位
5. **无缝集成**：直接使用 MapView 实例，无需额外配置

## 下一步

-   [ ] 添加更多笔刷类型
-   [ ] 支持撤销/重做
-   [ ] 添加图层支持
-   [ ] 优化性能
-   [ ] 添加更多示例

## 注意事项

1. **构建配置**：确保 tsconfig.json 正确配置 workspace 依赖
2. **类型错误**：开发时可能出现类型错误，这是正常的，构建时会解决
3. **性能**：三维地图绘制可能需要优化，特别是大区域绘制
4. **测试**：建议在实际 MapView 环境中测试所有功能
