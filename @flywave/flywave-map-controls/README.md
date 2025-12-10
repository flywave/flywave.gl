# @flywave/flywave-map-controls

`@flywave/flywave-map-controls` 是 flywave.gl 库的地图控制器模块，实现了地图上下文中常用的一组默认相机功能。该模块提供相机交互控制（平移、缩放、旋转）、动画、坐标转换等功能。

## 安装

```bash
npm install @flywave/flywave-map-controls
```

## 核心功能

### 1. MapControls

`MapControls` 是地图控制器的主要类，提供相机交互控制功能，包括平移、缩放、旋转等。

#### 基本用法

```typescript
import { MapControls } from "@flywave/flywave-map-controls";
import { MapView, GeoCoordinates, mercatorProjection } from "@flywave/flywave-mapview";

// 创建 MapView
const mapView = new MapView({
    canvas: document.getElementById("mapCanvas") as HTMLCanvasElement,
    projection: mercatorProjection,
    target: new GeoCoordinates(39.9042, 116.4074),
    zoomLevel: 15
});

// 创建并实例化地图控制器
const controls = new MapControls(mapView);

// 通过控制器可以访问地图视图
console.log(controls.mapView);
```

#### 配置选项和属性

- `enabled: boolean` - 控制器是否启用（默认为 true）
- `tiltEnabled: boolean` - 是否启用倾斜功能（默认为 true）
- `smoothPan: boolean` - 是否启用平滑平移（默认为 true）
- `maxTiltAngle: number` - 最大倾斜角度（度）
- `maxZoomLevel: number` - 最大缩放级别

#### API 参考

**控制功能:**
- `panVelocityX: number` - X 方向平移速度
- `panVelocityY: number` - Y 方向平移速度  
- `zoomVelocity: number` - 缩放速度
- `tiltVelocity: number` - 倾斜速度
- `headingVelocity: number` - 方位角速度

**动画控制:**
- `animatePan(x: number, y: number)` - 动画平移
- `animateHeading(v: number)` - 动画旋转方位角
- `animateTilt(v: number)` - 动画倾斜
- `animateZoom(v: number)` - 动画缩放
- `setHeading(v: number)` - 设置方位角
- `setTilt(v: number)` - 设置倾斜角度
- `setZoomLevel(zoom: number)` - 设置缩放级别
- `toggleTilt()` - 切换倾斜状态

**查询功能:**
- `getHeading(): number` - 获取当前方位角
- `getTilt(): number` - 获取当前倾斜角度
- `isPanning(): boolean` - 检查是否正在平移
- `zoomLevelTargeted: number` - 获取目标缩放级别

**控制禁用:**
- `disableTilt()` - 禁用倾斜功能
- `disableHeading()` - 禁用方位角功能
- `destroy()` - 销毁控制器并清理资源

### 2. MapControlsUI

`MapControlsUI` 提供地图控制的用户界面元素。

#### 基本用法

```typescript
import { MapControlsUI, MapControls } from "@flywave/flywave-map-controls";

// 创建 UI 控制器
const ui = new MapControlsUI(controls, {
    zoomLevel: "input",      // 显示缩放级别输入框
    projectionSwitch: true   // 启用投影切换按钮
});

// 将 UI 添加到页面
document.body.appendChild(ui.domElement);
```

#### MapControlsUIOptions 配置选项

- `zoomLevel?: "show" | "input"` - 缩放级别的显示方式：
  - `"show"` - 显示缩放级别
  - `"input"` - 显示缩放级别输入框
- `projectionSwitch?: boolean` - 是否启用投影切换按钮
- `disableDefaultStyle?: boolean` - 是否禁用默认 CSS 样式

### 3. 相机动画

MapControls 模块提供了强大的相机动画功能。

#### CameraKeyTrackAnimation

`CameraKeyTrackAnimation` 用于创建基于关键帧的相机动画。

```typescript
import { 
    CameraKeyTrackAnimation, 
    CameraAnimationBuilder, 
    ControlPoint 
} from "@flywave/flywave-map-controls";

// 创建控制点
const controlPoint1 = new ControlPoint({
    target: new GeoCoordinates(39.9042, 116.4074),
    distance: 1000,
    tilt: 45,
    heading: 0,
    timestamp: 0
});

const controlPoint2 = new ControlPoint({
    target: new GeoCoordinates(31.2304, 121.4737),
    distance: 2000,
    tilt: 30,
    heading: 90,
    timestamp: 10
});

// 创建动画选项
const animationOptions = {
    controlPoints: [controlPoint1, controlPoint2],
    interpolation: THREE.InterpolateSmooth,
    loop: THREE.LoopOnce,
    repetitions: 1
};

// 创建并启动动画
const cameraAnimation = new CameraKeyTrackAnimation(mapView, animationOptions);
cameraAnimation.start();

// 停止动画
// cameraAnimation.stop();
```

#### CameraAnimationBuilder

`CameraAnimationBuilder` 提供了创建相机动画的工具方法。

```typescript
// 从当前视图获取 LookAt 参数
const currentView = CameraAnimationBuilder.getLookAtFromView(mapView);
console.log("当前视图参数:", currentView);

// 创建飞向动画选项
const flyToOptions = CameraAnimationBuilder.createBowFlyToOptions(
    mapView,
    new ControlPoint({
        ...CameraAnimationBuilder.getLookAtFromView(mapView),
        timestamp: 0
    }),
    new ControlPoint({
        target: new GeoCoordinates(39.9042, 116.4074),
        distance: 800,
        tilt: 25,
        heading: 45,
        timestamp: 10
    })
);

// 创建轨道动画选项
const orbitOptions = CameraAnimationBuilder.createOrbitOptions(
    new ControlPoint({
        ...CameraAnimationBuilder.getLookAtFromView(mapView),
        timestamp: 0
    }),
    3  // 绕目标旋转3圈
);
```

### 4. 事件系统

MapControls 使用事件系统来通知各种操作：

```typescript
import { EventNames } from "@flywave/flywave-map-controls";

// 监听地图控制事件
controls.addEventListener(EventNames.Update, (event) => {
    console.log("地图视图已更新");
});

controls.addEventListener(EventNames.BeginInteraction, (event) => {
    console.log("开始交互");
});

controls.addEventListener(EventNames.EndInteraction, (event) => {
    console.log("结束交互");
});
```

### 5. 坐标变换

MapControls 支持坐标变换功能：

```typescript
// 选取屏幕坐标点对应的 3D 世界坐标点
const worldPoint = controls.pickPoint(mouseX, mouseY);
if (worldPoint) {
    console.log("选中的世界坐标:", worldPoint);
}
```

## 示例

### 完整的地图控制示例

```typescript
import { 
    MapControls, 
    MapControlsUI,
    EventNames
} from "@flywave/flywave-map-controls";
import { 
    MapView, 
    GeoCoordinates, 
    mercatorProjection,
    sphereProjection 
} from "@flywave/flywave-mapview";

// 创建 MapView
const canvas = document.getElementById("mapCanvas") as HTMLCanvasElement;
const mapView = new MapView({
    canvas,
    projection: sphereProjection,
    target: new GeoCoordinates(39.9042, 116.4074),
    zoomLevel: 15
});

// 创建地图控制器
const controls = new MapControls(mapView);

// 配置控制器参数
controls.maxTiltAngle = 80;  // 最大倾斜角度 80 度
controls.maxZoomLevel = 20;   // 最大缩放级别 20

// 创建 UI 控制器
const ui = new MapControlsUI(controls, {
    zoomLevel: "input",       // 显示缩放级别输入框
    projectionSwitch: true    // 启用投影切换
});

// 将 UI 添加到页面
canvas.parentElement!.appendChild(ui.domElement);

// 监听控制事件
controls.addEventListener(EventNames.Update, () => {
    console.log("地图视图已更新");
});

controls.addEventListener(EventNames.BeginInteraction, () => {
    console.log("开始交互");
});

controls.addEventListener(EventNames.EndInteraction, () => {
    console.log("结束交互");
});

## 高级功能

### 长按处理

模块提供长按事件处理功能：

```typescript
import { LongPressHandler } from "@flywave/flywave-map-controls";

const longPressHandler = new LongPressHandler(element, {
    onLongPress: () => console.log("长按事件"),
    onShortPress: () => console.log("短按事件")
});
```

### 鼠标光标管理

模块内置鼠标光标管理功能，根据不同的交互状态自动切换光标样式。

## 许可证

Apache-2.0 License