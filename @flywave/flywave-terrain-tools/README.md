# @flywave/flywave-terrain-tools

地形修改工具库，提供交互式的地形编辑功能和数据导出功能。

## 特性

-   ✅ **双模式操作**: 笔刷模式和控制点模式
-   ✅ **6 种笔刷类型**: 抬升、降低、平滑、平整、噪声、侵蚀
-   ✅ **实时预览**: 笔刷预览和控制点可视化
-   ✅ **统一 dat.gui 风格**: 所有 UI 使用 dat.gui，风格一致专业
-   ✅ **双面板设计**: 工具面板（右上）+ 控制点配置面板（左上）
-   ✅ **数据导出**: JSON 格式导出和剪贴板复制
-   ✅ **事件系统**: 完整的事件监听和回调

## UI 布局

### 🔧 工具面板（右上角）

包含所有地形工具的设置：

-   🎮 **控制面板**: 启用/禁用工具、显示操作数
-   🖌️ **笔刷类型**: 选择 6 种笔刷类型
-   📐 **基础参数**: 半径、硬度（所有笔刷）
-   📏 **高度变化**: 抬升/降低模式专用
-   💪 **强度**: 平滑/噪声/侵蚀模式专用
-   🎯 **目标高度**: 平整模式专用
-   📊 **缩放** & 🔁 **持久性**: 噪声模式专用
-   🔧 **操作**: 导出 JSON、复制到剪贴板、清除操作

### 📍 控制点配置面板（左上角）

当选中控制点时自动显示：

-   📍 **控制点信息**: ID、经纬度、高度
-   ⚙️ **参数配置**: 实时调整控制点参数
-   🔧 **操作**: 删除控制点

## 安装

```bash
pnpm install @flywave/flywave-terrain-tools
```

## 使用示例

```typescript
import {
    MapView,
    DEMTerrainSource,
    TerrainTools,
    TerrainControlPointUI
} from "@flywave/flywave.gl";

// 创建地图
const mapView = new MapView({
    target: new GeoCoordinates(36.4, 118.1, 1000),
    zoomLevel: 17,
    projection: ellipsoidProjection,
    canvas: canvas
});

// 创建地形源
const demTerrain = new DEMTerrainSource({
    source: "dem_terrain/source.json"
});
mapView.setElevationSource(demTerrain);

// 创建控制点UI（左上角 dat.gui 面板）
const controlPointUI = new TerrainControlPointUI();

// 创建地形工具（右上角 dat.gui 面板）
const terrainTools = new TerrainTools({
    mapView: mapView,
    demTerrainSource: demTerrain,
    showUI: true,
    defaultBrush: {
        type: "raise",
        radius: 80,
        hardness: 0.5,
        heightDelta: 10
    },
    defaultMode: "brush",
    onControlPointSelected: point => {
        if (point) {
            controlPointUI.show(point);
        } else {
            controlPointUI.hide();
        }
    }
});

// 启用工具
terrainTools.enable();

// 切换到控制点模式
terrainTools.setMode("control");

// 批量应用控制点
terrainTools.applyControlPointsToTerrain();
```

## 工作流程

### 1. 笔刷模式（默认）

```typescript
// 工具默认启用，直接点击地图即可
// 在右上角 dat.gui 面板调整参数：
// - 切换笔刷类型
// - 调整半径、硬度
// - 根据笔刷类型调整特定参数
```

**操作步骤**：

1. 确保工具已启用（右上角面板的"启用工具"开关）
2. 在右上角面板选择笔刷类型和参数
3. 点击地图应用笔刷效果
4. 拖动鼠标可连续绘制

### 2. 控制点模式

```typescript
// 按 C 键或通过代码切换
terrainTools.setMode("control");

// 点击地图添加控制点
// 点击现有控制点选中它
// 左上角自动显示配置面板
```

**操作步骤**：

1. 按 `C` 键切换到控制点模式
2. 点击地图添加控制点（显示为黄色标记）
3. 点击控制点选中它
4. 左上角自动显示 dat.gui 配置面板
5. 实时调整参数
6. 按 `A` 键批量应用所有控制点到地形
7. 按 `Delete` 键删除选中的控制点

### 3. 快捷键

| 快捷键                 | 功能                |
| ---------------------- | ------------------- |
| `C`                    | 切换笔刷/控制点模式 |
| `Delete` / `Backspace` | 删除选中的控制点    |
| `A`                    | 批量应用所有控制点  |

## API

### TerrainTools

主工具类，管理地形修改功能。

#### 构造函数

```typescript
new TerrainTools(options: TerrainToolsOptions)
```

**选项:**

-   `mapView`: MapView - 地图实例（必需）
-   `demTerrainSource`: DEMTerrainSource - 地形数据源（必需）
-   `uiContainer`: HTMLElement | string - UI 容器（可选，已弃用，dat.gui 自动定位）
-   `showUI`: boolean - 是否显示 UI（可选，默认 true）
-   `defaultEnabled`: boolean - 默认是否启用（可选，默认 true）
-   `defaultBrush`: Partial<BrushConfig> - 默认笔刷配置（可选）
-   `defaultMode`: ToolMode - 默认模式（可选，默认 "brush"）
-   `onOperationAdded`: (id: string, operation: BrushOperation) => void - 操作添加回调
-   `onOperationRemoved`: (id: string) => void - 操作移除回调
-   `onControlPointAdded`: (point: any) => void - 控制点添加回调
-   `onControlPointRemoved`: (id: number) => void - 控制点移除回调
-   `onControlPointSelected`: (point: any | null) => void - 控制点选中回调

#### 方法

**工具控制**

-   `enable(): void` - 启用工具
-   `disable(): void` - 禁用工具
-   `setMode(mode: ToolMode): void` - 设置模式 ("brush" | "control")
-   `getMode(): ToolMode` - 获取当前模式

**笔刷管理**

-   `setBrush(brush: Partial<BrushConfig>): void` - 设置笔刷
-   `getBrush(): Partial<BrushConfig>` - 获取当前笔刷配置

**操作管理**

-   `addOperation(operation: BrushOperation): string` - 添加操作
-   `removeOperation(id: string): boolean` - 移除操作
-   `clearOperations(): void` - 清除所有操作
-   `getOperationCount(): number` - 获取操作数量
-   `getAllOperations(): BrushOperation[]` - 获取所有操作
-   `getOperationIds(): string[]` - 获取所有操作 ID

**控制点管理**

-   `getControlPointManager(): TerrainControlPointManager` - 获取控制点管理器
-   `getSelectedControlPoint(): any` - 获取选中的控制点
-   `removeSelectedControlPoint(): boolean` - 删除选中的控制点
-   `updateSelectedControlPointConfig(config: any): void` - 更新选中控制点的配置
-   `applyControlPointsToTerrain(): void` - 批量应用控制点到地形

**UI**

-   `getUI(): TerrainToolsGUI | null` - 获取 UI 实例

## 笔刷类型

| 类型      | 说明     | 颜色         | 专用参数           |
| --------- | -------- | ------------ | ------------------ |
| `raise`   | 抬升地形 | 绿色 #00ff00 | 高度变化           |
| `lower`   | 降低地形 | 红色 #ff0000 | 高度变化           |
| `smooth`  | 平滑地形 | 蓝色 #0088ff | 强度               |
| `flatten` | 平整地形 | 黄色 #ffff00 | 目标高度           |
| `noise`   | 添加噪声 | 紫色 #8800ff | 强度、缩放、持久性 |
| `erode`   | 侵蚀地形 | 橙色 #ff8800 | 强度               |

## 笔刷参数

### 基础参数（所有笔刷）

-   **radius**: `number` - 影响半径（10-500m）
-   **hardness**: `number` - 边缘硬度（0-1）

### 特定参数

-   **heightDelta**: `number` - 高度变化（抬升/降低模式，-100 到 100m）
-   **strength**: `number` - 作用强度（平滑/噪声/侵蚀模式，0-1）
-   **targetAltitude**: `number` - 目标高度（平整模式，0-1000m）
-   **scale**: `number` - 噪声缩放（噪声模式，1-100）
-   **persistence**: `number` - 噪声持久性（噪声模式，0-1）

## UI 组件

### TerrainToolsGUI

主工具 UI（基于 dat.gui），位于右上角。

```typescript
import { TerrainToolsGUI } from "@flywave/flywave-terrain-tools";

const gui = new TerrainToolsGUI({
    onBrushChange: brush => console.log("笔刷变化", brush),
    onExport: format => console.log("导出", format),
    onClear: () => console.log("清除"),
    onToggle: enabled => console.log("切换", enabled),
    defaultBrush: { type: "raise", radius: 80 }
});
```

### ControlPointConfigUI

控制点配置 UI（基于 dat.gui），位于左上角。

```typescript
import { ControlPointConfigUI } from "@flywave/flywave-terrain-tools";

const cpGUI = new ControlPointConfigUI({
    width: 300
});

// 选中控制点时显示
cpGUI.show(controlPoint);

// 取消选中时隐藏
cpGUI.hide();
```

### TerrainControlPointUI（向后兼容）

对 `ControlPointConfigUI` 的简单封装，API 保持不变。

## 数据格式

导出的 JSON 格式：

```json
{
    "version": "1.0.0",
    "timestamp": "2025-01-29T12:00:00Z",
    "metadata": {
        "totalOperations": 5,
        "bounds": {
            "minLat": 36.39,
            "maxLat": 36.41,
            "minLon": 118.09,
            "maxLon": 118.11
        }
    },
    "operations": [
        {
            "id": "op-001",
            "position": { "lat": 36.4, "lon": 118.1, "alt": 0 },
            "settings": {
                "type": "raise",
                "radius": 50,
                "hardness": 0.5,
                "heightDelta": 10
            }
        }
    ]
}
```

## 开发示例

完整示例请参考 `@flywave/flywave-examples/src/terrain-tools/`

## 技术栈

-   **Three.js**: 3D 渲染引擎
-   **dat.gui**: 参数配置界面
-   **Flywave.gl**: 地图渲染引擎

## 许可证

Apache-2.0
