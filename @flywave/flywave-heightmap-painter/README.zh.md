# @flywave/heightmap-painter

一个交互式高程绘制工具库，支持在 Leaflet 地图上绘制地形并导出高度图数据。

## 特性

-   🎨 **多种笔刷类型**: 提升、降低、平滑、平整、噪声
-   🗺️ **多底图支持**: 卫星图、街道图、地形图
-   📐 **精确地理坐标**: 自动记录绘制区域的 GeoBox
-   💾 **多种导出格式**: PNG 图片 + JSON 数据
-   🔄 **实时预览**: 边绘制边预览效果
-   🎯 **双模式操作**: 绘制模式与导航模式分离
-   🔧 **事件系统**: 监听笔刷和导出事件
-   📦 **TypeScript**: 完整的类型定义
-   🎁 **零配置**: 开箱即用
-   🎨 **完全控制**: 由外部管理 DOM 放置

## 安装

```bash
npm install @flywave/heightmap-painter
```

## Peer 依赖

此库需要以下 peer dependencies:

```bash
npm install leaflet react react-dom styled-components
```

## 使用方法

### 基础使用

```typescript
import { HeightmapPainter } from "@flywave/heightmap-painter";

const painter = new HeightmapPainter({
    width: 1024,
    height: 1024
});

const element = painter.getElement();
document.body.appendChild(element);

painter.on("ready", () => {
    console.log("高度图绘制器已就绪");
});

const data = painter.exportHeightmap();
console.log("导出数据:", data);

painter.destroy();
```

### 完整示例

```html
<!DOCTYPE html>
<html>
    <head>
        <link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css" />
        <style>
            body {
                margin: 0;
                padding: 0;
            }

            #my-container {
                width: 100vw;
                height: 100vh;
                display: flex;
                justify-content: center;
                align-items: center;
                background: #f0f0f0;
            }

            .painter-wrapper {
                border: 2px solid #333;
                box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
            }
        </style>
    </head>
    <body>
        <div id="my-container"></div>

        <script type="module">
            import { HeightmapPainter } from "@flywave/heightmap-painter";

            const painter = new HeightmapPainter({
                width: 1920,
                height: 1080,
                initialCenter: [39.9, 116.4],
                initialZoom: 13,
                basemap: "satellite"
            });

            const element = painter.getElement();
            element.className = "painter-wrapper";

            const container = document.getElementById("my-container");
            container.appendChild(element);

            painter.on("ready", () => {
                console.log("绘制器初始化完成");
            });

            painter.on("brushStart", (x, y) => {
                console.log(`笔刷开始: ${x}, ${y}`);
            });

            painter.on("heightmapChange", data => {
                console.log(`高度图已更新, 大小: ${data.length}`);
            });

            painter.on("export", data => {
                console.log("已导出:", {
                    宽度: data.width,
                    高度: data.height,
                    地理范围: data.geoBox
                });
            });

            window.exportPNG = () => {
                const data = painter.exportHeightmap();
                if (data) {
                    data.imageData.toBlob(blob => {
                        const url = URL.createObjectURL(blob);
                        const a = document.createElement("a");
                        a.href = url;
                        a.download = `heightmap_${Date.now()}.png`;
                        a.click();
                        URL.revokeObjectURL(url);
                    });
                }
            };

            window.setBrushType = type => {
                painter.updateBrushSettings({ type });
            };

            window.clearCanvas = () => {
                painter.clearCanvas();
            };
        </script>
    </body>
</html>
```

### 高级 DOM 管理

```typescript
import { HeightmapPainter } from "@flywave/heightmap-painter";

class HeightmapEditor {
    private painter: HeightmapPainter;
    private container: HTMLElement;

    constructor(parentElement: HTMLElement) {
        this.painter = new HeightmapPainter({
            width: 1024,
            height: 1024,
            initialCenter: [39.9, 116.4],
            initialZoom: 13,
            basemap: "satellite"
        });

        const element = this.painter.getElement();

        this.container = document.createElement("div");
        this.container.className = "heightmap-editor";
        this.container.appendChild(element);

        parentElement.appendChild(this.container);

        this.setupEvents();
    }

    private setupEvents(): void {
        this.painter.on("ready", () => {
            console.log("编辑器就绪");
        });

        this.painter.on("heightmapChange", data => {
            this.onHeightmapChanged(data);
        });
    }

    private onHeightmapChanged(data: Float32Array): void {
        // 处理高度图变化
    }

    public export(format: "png" | "json"): void {
        const data = this.painter.exportHeightmap();
        // 导出逻辑
    }

    public destroy(): void {
        this.painter.destroy();
        if (this.container.parentNode) {
            this.container.parentNode.removeChild(this.container);
        }
    }
}
```

## API

### HeightmapPainter

管理高度图绘制工具的主类。

#### 构造函数

```typescript
new HeightmapPainter(options: HeightmapPainterOptions)
```

**选项:**

```typescript
interface HeightmapPainterOptions {
    width?: number; // 画布宽度 (默认: 1024)
    height?: number; // 画布高度 (默认: 1024)
    initialCenter?: [number, number]; // 初始中心 [纬度, 经度] (默认: [39.9, 116.4])
    initialZoom?: number; // 初始缩放级别 (默认: 13)
    basemap?: "satellite" | "street" | "terrain"; // 底图类型 (默认: "satellite")
}
```

#### 方法

##### getElement()

获取绘制器的根 DOM 元素。你可以将此元素追加到任何你想要的位置。

```typescript
const element = painter.getElement();
document.body.appendChild(element);
// 或追加到任意容器
myContainer.appendChild(element);
```

##### on(event, callback)

注册事件监听器。

```typescript
painter.on("brushStart", (x: number, y: number) => {
    console.log("笔刷开始于:", x, y);
});
```

##### off(event, callback)

移除事件监听器。

```typescript
const callback = (x, y) => console.log(x, y);
painter.on("brushStart", callback);
painter.off("brushStart", callback);
```

##### exportHeightmap()

导出当前高度图数据。

```typescript
const data = painter.exportHeightmap();
// 返回: HeightmapExport | null
```

**HeightmapExport:**

```typescript
interface HeightmapExport {
    imageData: HTMLCanvasElement;
    geoBox: {
        minLon: number;
        minLat: number;
        maxLon: number;
        maxLat: number;
    };
    width: number;
    height: number;
}
```

##### clearCanvas()

清空所有绘制数据。

```typescript
painter.clearCanvas();
```

##### updateBrushSettings(settings)

更新笔刷设置。

```typescript
painter.updateBrushSettings({
    type: BrushType.RAISE,
    size: 50,
    strength: 0.5,
    hardness: 0.5
});
```

##### getBrushSettings()

获取当前笔刷设置。

```typescript
const settings = painter.getBrushSettings();
```

##### setMode(mode)

设置绘制器模式。

```typescript
painter.setMode("draw"); // 启用绘制
painter.setMode("navigate"); // 启用地图导航
```

##### getMap()

获取底层 Leaflet 地图实例。

```typescript
const map = painter.getMap();
```

##### getBrushEngine()

获取笔刷引擎实例。

```typescript
const engine = painter.getBrushEngine();
```

##### destroy()

销毁绘制器实例并清理资源。

```typescript
painter.destroy();
```

### 事件

所有可用事件:

```typescript
interface HeightmapPainterEvents {
    ready: () => void; // 绘制器就绪时触发
    destroy: () => void; // 绘制器销毁时触发
    brushStart: (x: number, y: number) => void; // 笔划开始
    brushMove: (x: number, y: number) => void; // 笔刷移动
    brushEnd: () => void; // 笔划结束
    heightmapChange: (heightData: Float32Array) => void; // 高度图数据改变
    export: (data: HeightmapExport) => void; // 数据导出
}
```

### 类型定义

```typescript
enum BrushType {
    RAISE = "raise", // 提升
    LOWER = "lower", // 降低
    SMOOTH = "smooth", // 平滑
    FLATTEN = "flatten", // 平整
    NOISE = "noise" // 噪声
}

interface BrushSettings {
    type: BrushType;
    size: number; // 笔刷大小 (5-200px)
    strength: number; // 笔刷强度 (0.01-1.0)
    hardness: number; // 笔刷硬度 (0.0-1.0)
    flattenHeight?: number; // 平整高度 (仅平整笔刷)
}
```

## 与 flywave.gl 集成

```typescript
import { HeightmapPainter } from "@flywave/heightmap-painter";
import { GeoBox, GeoCoordinates, HeightMapBlendMode } from "@flywave/flywave.gl";

const painter = new HeightmapPainter({
    width: 1024,
    height: 1024
});

document.body.appendChild(painter.getElement());

painter.on("export", exportData => {
    const geoBox = new GeoBox(
        new GeoCoordinates(exportData.geoBox.minLat, exportData.geoBox.minLon),
        new GeoCoordinates(exportData.geoBox.maxLat, exportData.geoBox.maxLon)
    );

    const modifierId = manager.addModifier(
        { type: "image", image: exportData.imageData },
        geoBox,
        HeightMapBlendMode.ADD,
        1.0,
        { min: 0, max: 1000 }
    );
});
```

## 开发

```bash
# 安装依赖
npm install

# 构建
npm run build

# 监听模式
npm run build:watch
```

## 许可证

Apache-2.0
