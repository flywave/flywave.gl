# Heightmap Painter - 使用说明

## 概述

`flywave-heightmap-painter` 是一个用于绘制和导出高程图的专业工具。

## 核心功能

-   **配置阶段**：设置输出尺寸和地图范围
-   **绘制阶段**：在锁定的地图上绘制高程图
-   **导出功能**：输出高程图数据 + GeoBox 范围

## 使用流程

### 第一步：配置

打开工具后，会看到配置面板：

1. **设置输出尺寸**

    - 输入宽度（512-4096）
    - 输入高度（512-4096）
    - 建议：1024x1024 或 2048x2048

2. **设置地图范围**

    - 在下方的地图上导航（拖拽、缩放）
    - 移动到你要绘制的目标区域
    - 底部会实时显示当前地图的 GeoBox 范围

3. **开始绘制**
    - 点击"✓ 开始绘制"按钮
    - 进入绘制阶段

### 第二步：绘制

进入绘制阶段后：

1. **地图已锁定**

    - 地图固定在配置的 GeoBox 范围
    - 红色矩形框表示绘制区域
    - Canvas 覆盖层显示在地图上

2. **使用画笔工具**

    - 左侧有画笔工具面板
    - 选择画笔类型（提升、降低、平滑、平整、噪声）
    - 调整画笔大小、强度、硬度
    - 在红色框内绘制

3. **导出**

    - 点击顶部的"导出"按钮
    - 输出数据包含：
        - `imageData`: Canvas 图像
        - `geoBox`: 地理范围
        - `width`, `height`: 尺寸

4. **重新配置**
    - 点击"重新配置"按钮
    - 返回配置阶段，可以调整尺寸或地图范围

## 代码示例

```typescript
import { HeightmapPainter } from "@flywave/flywave-heightmap-painter";

// 创建画笔
const painter = new HeightmapPainter({
    width: 1024,
    height: 1024,
    initialCenter: [39.9, 116.4],
    initialZoom: 13,
    basemap: "satellite"
    // 不传入 paintAreaGeoBox，让用户自己配置
});

// 添加到页面
const element = painter.getElement();
element.style.position = "absolute";
element.style.top = "50%";
element.style.left = "50%";
element.style.transform = "translate(-50%, -50%)";
document.body.appendChild(element);

// 监听导出事件
painter.on("export", data => {
    console.log("GeoBox:", data.geoBox);
    console.log("尺寸:", `${data.width}x${data.height}`);
    console.log("图像:", data.imageData);

    // data.imageData 是 HTMLCanvasElement
    // 可以转换为图片、Blob 等
    const url = data.imageData.toDataURL("image/png");
    console.log("图片 URL:", url);
});

// 监听其他事件
painter.on("heightmapChange", data => {
    console.log("绘制数据变化:", data.length);
});

// 手动导出
const exportData = painter.exportHeightmap();
```

## 输出数据结构

```typescript
{
    imageData: HTMLCanvasElement,  // 灰度高度图
    geoBox: {
        minLon: number,  // 最小经度
        minLat: number,  // 最小纬度
        maxLon: number,  // 最大经度
        maxLat: number   // 最大纬度
    },
    width: number,      // 输出宽度
    height: number      // 输出高度
}
```

## API 参考

### 构造函数

```typescript
new HeightmapPainter({
    width: 1024, // 初始宽度
    height: 1024, // 初始高度
    initialCenter: [39.9, 116.4], // 地图中心
    initialZoom: 13, // 地图缩放
    basemap: "satellite" // 底图类型
});
```

### 方法

-   `getElement()`: 获取 DOM 元素
-   `exportHeightmap()`: 导出高程图数据
-   `clearCanvas()`: 清空画布
-   `updateBrushSettings(settings)`: 更新画笔设置
-   `getBrushSettings()`: 获取当前画笔设置

### 事件

-   `ready`: 工具初始化完成
-   `export`: 导出数据
-   `heightmapChange`: 高程数据变化
-   `brushStart`: 开始绘制
-   `brushMove`: 绘制中
-   `brushEnd`: 结束绘制

## 注意事项

1. **安装依赖**: 确保已安装 leaflet

    ```bash
    npm install leaflet
    # 或
    pnpm install leaflet
    ```

2. **Leaflet CSS**: CSS 已在组件内自动引入，无需手动引入

3. **地图锁定**: 绘制阶段地图完全锁定，无法移动。如需调整，点击"重新配置"

4. **尺寸范围**: 输出尺寸必须在 512-4096 之间，步进为 64

5. **坐标系统**: GeoBox 使用经纬度坐标，与标准地图坐标一致
