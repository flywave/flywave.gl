# 地面修改控制面板使用说明

## 简介

地面修改控制面板是 flywave-inspector 的一个新模块，用于控制 GroundModificationManager 中的 kriging 插值选项。该面板允许用户实时调整克里金插值参数，以改变地形修改的视觉效果。

## 功能特性

### Kriging 插值参数控制

控制面板提供了以下可调节的 kriging 参数：

1. **Model（模型）** - 插值模型类型：
   - `gaussian`：高斯模型，产生平滑的插值效果，衰减迅速
   - `exponential`：指数模型，中等平滑度，指数衰减
   - `spherical`：球面模型，具有有限范围，紧支撑

2. **Variance (σ²)（方差）** - 方差参数：
   - 控制插值模型的整体方差
   - 较高的值会产生更多变化的插值表面

3. **Smoothing (α)（平滑度）** - 平滑参数：
   - 控制插值的平滑度
   - 较低的值产生更平滑的表面，较高的值允许更多的局部变化

4. **Points（点数）** - 插值点数：
   - 指定插值过程中使用的点数
   - 更多的点通常会产生更准确的结果，但需要更多的计算资源

## 使用方法

### 在项目中集成

要在项目中使用地面修改控制面板，首先需要确保已安装 `@flywave/flywave-inspector` 包：

```bash
pnpm add @flywave/flywave-inspector
```

然后在代码中导入并初始化：

```typescript
import { MapView } from "@flywave/flywave-mapview";
import { ModularMapViewMonitor } from "@flywave/flywave-inspector";

// 创建 MapView 实例
const mapView = new MapView({
    // ... 配置选项
});

// 初始化监控面板
const monitor = new ModularMapViewMonitor(mapView);
monitor.open(); // 显示监控面板
```

### 与地形源配合使用

要使用地面修改功能，需要确保地图视图中已添加了支持地面修改的地形源：

```typescript
import { DEMTerrainSource } from "@flywave/flywave-terrain-datasource";

const terrainSource = new DEMTerrainSource({
    // ... 配置选项
});

// 添加地形源到地图
mapView.setElevationSource(
    terrainSource,
    terrainSource.getElevationRangeSource(),
    terrainSource.getElevationProvider()
);

// 添加地面修改
terrainSource.getGroundModificationManager().addModification(
    {
        heightOperation: "replace",
        vertexSource: "fixed"
    },
    geoArea,
    slopeWidth,
    depthOrHeight
);
```

## 自定义控制面板

如果需要自定义控制面板的位置或样式，可以传入现有的 dat.GUI 实例：

```typescript
import * as dat from "dat.gui";
import { ModularMapViewMonitor } from "@flywave/flywave-inspector";

const gui = new dat.GUI();
const monitor = new ModularMapViewMonitor(mapView, gui);

// 获取地面修改文件夹进行自定义
const groundModificationFolder = monitor.getGroundModificationFolder();
groundModificationFolder.open(); // 默认打开地面修改面板
```

## 参数调整建议

### 不同场景下的参数设置

1. **平滑地形修改**：
   - Model: `gaussian`
   - Variance (σ²): 10-30
   - Smoothing (α): 0.01-0.1
   - Points: 50-100

2. **细节丰富的地形修改**：
   - Model: `exponential`
   - Variance (σ²): 20-50
   - Smoothing (α): 0.05-0.2
   - Points: 100-200

3. **局部精确修改**：
   - Model: `spherical`
   - Variance (σ²): 30-100
   - Smoothing (α): 0.1-0.5
   - Points: 200-500

## 注意事项

1. 调整 kriging 参数会立即影响所有现有的地面修改效果
2. 增加插值点数会提高计算精度但可能影响性能
3. 不同的插值模型适用于不同的应用场景，建议根据实际需求进行选择
4. 在移动设备上使用时，过多的插值点可能会影响渲染性能