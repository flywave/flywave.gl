# 方案 B - Painter 渲染到 MapView 的父容器

## ✅ 已实现

### 架构说明

Painter 不再移动 MapView 的 DOM 元素，而是把自己渲染到 MapView 的父容器中。

### 使用方式

```typescript
// 1. 创建 MapView 的容器
const mapContainer = document.createElement("div");
mapContainer.style.width = "100%";
mapContainer.style.height = "100%";
mapContainer.style.position = "relative";  // 重要：需要是 relative 或 absolute
document.body.appendChild(mapContainer);

// 2. 创建 MapView
const canvas = document.createElement("canvas");
canvas.style.width = "100%";
canvas.style.height = "100%";
mapContainer.appendChild(canvas);

const map = new MapView({
    target: new GeoCoordinates(36.4, 118.1, 2000),
    zoomLevel: 16,
    canvas: canvas
});

const terrainSource = new CesiumWorldTerrainSource({...});
map.setElevationSource(terrainSource);

// 3. 创建 Painter，传入 container
const painter = new HeightmapPainter({
    mapView: map,
    container: mapContainer  // Painter 会自动添加到这个容器中
});

// 完成！不需要手动 appendChild
```

### 容器结构

```html
<div id="mapContainer" style="position: relative; width: 100%; height: 100%;">
    <!-- MapView 的 canvas -->
    <canvas />

    <!-- MapControlsUI (如果有) -->
    <div id="map-controls" />

    <!-- Painter 的容器（自动添加，z-index: 1000） -->
    <div style="position: absolute; top: 0; left: 0; width: 100%; height: 100%; z-index: 1000;">
        <!-- 配置阶段 -->
        <ConfigPanel />

        <!-- 绘制阶段 -->
        <Painter3D />
        <BrushToolbar />
        <TopBar />
    </div>
</div>
```

## API 变更

### HeightmapPainterOptions

```typescript
interface HeightmapPainterOptions {
    mapView: any; // MapView 实例（必需）
    container: HTMLElement; // MapView 的父容器（必需）
    width?: number; // 输出宽度（可选）
    height?: number; // 输出高度（可选）
    paintAreaGeoBox?: {
        // 绘制区域（可选）
        minLon: number;
        minLat: number;
        maxLon: number;
        maxLat: number;
    };
}
```

## 特性

1. ✅ **不移动 DOM** - MapView 的元素保持不变
2. ✅ **统一容器** - 所有元素都在同一个容器中
3. ✅ **自动管理** - Painter 自动添加到 container
4. ✅ **正确层级** - z-index: 1000 确保在 MapView 上方
5. ✅ **配置阶段** - Leaflet 地图选择包围盒
6. ✅ **绘制阶段** - 三维地图绘制，笔刷光标，工具栏
7. ✅ **暗色风格** - 配置面板使用暗色主题

## 完整流程

1. **配置阶段**：

    - 显示暗色风格的 ConfigPanel
    - 用户在 Leaflet 地图上拖拽选择包围盒
    - 用户手动输入输出宽高
    - 点击"开始绘制"

2. **绘制阶段**：

    - 显示三维地图
    - 显示笔刷光标（圆形、白色半透明、有边框）
    - 显示工具栏
    - 显示顶部栏（包含"应用到地形"按钮）

3. **导出**：
    - 点击"📥 应用到地形"
    - 调用 GroundModificationManager
    - 实时更新地形
