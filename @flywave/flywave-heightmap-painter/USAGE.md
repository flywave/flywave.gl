# Heightmap Painter - 使用说明

## 功能概述

`flywave-heightmap-painter` 是一个完备的地形高度图绘制工具，支持两种使用模式：

## 两种使用模式

### 模式 1：交互式选择区域

不传入 `paintAreaGeoBox` 参数，用户可以在地图上拖拽选择绘制区域。

```typescript
const painter = new HeightmapPainter({
    width: 1024,
    height: 1024,
    initialCenter: [39.9, 116.4],
    initialZoom: 13,
    basemap: "satellite"
    // 不传入 paintAreaGeoBox
});
```

**使用流程**：

1. 打开页面，显示地图导航界面
2. 在地图上**拖拽绘制矩形区域**
3. 松开鼠标后，出现"确认选择区域"按钮
4. 点击确认，地图**自动锁定**，禁用所有导航操作
5. Canvas 覆盖层显示在选中的地图区域上
6. 左侧显示画笔工具，右上角显示尺寸设置
7. 开始绘制

### 模式 2：预设区域

传入 `paintAreaGeoBox` 参数，直接跳过选择步骤。

```typescript
const painter = new HeightmapPainter({
    width: 1024,
    height: 1024,
    initialCenter: [39.9, 116.4],
    initialZoom: 13,
    basemap: "satellite",
    paintAreaGeoBox: {
        minLon: 118.09,
        minLat: 36.39,
        maxLon: 118.11,
        maxLat: 36.41
    }
});
```

**使用流程**：

1. 直接进入绘制模式
2. 地图已锁定，Canvas 已显示
3. 开始绘制

## 核心功能

### 1. 区域选择和地图锁定

-   **区域选择**：拖拽矩形选择绘制区域
-   **地图锁定**：确认选择后自动锁定，禁用：
    -   拖拽平移
    -   滚轮缩放
    -   双击缩放
    -   键盘导航
    -   触摸缩放

### 2. 输出尺寸设置

-   **位置**：右上角面板
-   **功能**：
    -   设置输出图片的宽度和高度（256-4096，步进 64）
    -   修改尺寸时如果有绘制数据，会**弹出警告提示**
    -   确认后会清除当前绘制数据

### 3. 画笔配置

-   **位置**：左侧面板
-   **功能**：
    -   画笔类型：提升、降低、平滑、平整、噪声
    -   画笔大小：5-200px
    -   画笔强度：0-100%
    -   画笔硬度：0-100%
    -   平整高度：0-100%（仅平整笔刷）

### 4. Canvas 图层

-   **位置**：覆盖在选中的地图区域上
-   **透明度**：70%，可同时看到地图和绘制内容
-   **实时预览**：绘制时实时显示灰度高度图

## 组件结构

```
HeightmapPainter
├── App (主容器，管理流程)
│   ├── AreaSelector (区域选择，仅模式1)
│   ├── MapPainter (地图和绘制)
│   ├── SizePanel (尺寸设置)
│   ├── BrushToolbar (画笔工具)
│   ├── ExportPanel (导出功能)
│   └── MapInfoPanel (地图信息)
```

## 事件

```typescript
painter.on("ready", () => {
    console.log("Painter is ready");
});

painter.on("heightmapChange", data => {
    console.log("Heightmap changed:", data.length);
});

painter.on("brushStart", (x, y) => {
    console.log("Brush started at:", x, y);
});

painter.on("brushMove", (x, y) => {
    console.log("Brush moved to:", x, y);
});

painter.on("brushEnd", () => {
    console.log("Brush ended");
});
```

## 导出功能

```typescript
// 导出为 PNG
const data = painter.exportHeightmap();
// data.imageData 是 HTMLCanvasElement
// data.geoBox 是地理范围
```

## 注意事项

1. **Leaflet CSS**：使用时需要引入 Leaflet CSS

    ```html
    <link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css" />
    ```

2. **地图锁定**：锁定后无法通过 UI 解锁，需要重新创建实例

3. **尺寸修改**：修改尺寸会清除绘制数据，请谨慎操作

4. **Canvas 坐标**：画笔坐标是相对于 Canvas 的像素坐标，已自动转换为地理坐标
