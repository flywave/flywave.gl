# 拾取、相机碰撞与阴影（GPU 管线）

这是 `feature/webgpu-support` 分支的活跃开发区，契约细节多，改前必读。
可运行的调试示例：`@flywave/flywave-examples/src/gpu-pick-test/` 与
`gpu-depth-picking/`。

## 拾取入口与策略

- API：`mapView.intersectMapObjects(x, y, params)`（`MapView.ts`）→
  `PickHandler.intersectMapObjects`。
- `IntersectParams.useGpuPick`（`@flywave/flywave-mapview/src/IntersectParams.ts`）：
  - `"auto"`（默认）：GPU 深度优先，miss 回退 CPU raycast
  - `true`：GPU-only，miss **不回退**（结果可能是 undefined）
  - `false`：CPU-only

## GPU 拾取渲染端（ViewRenderManager）

`@flywave/flywave-mapview/src/composing/vrm/ViewRenderManager.ts`：

- **pickDepth MRT**：R 通道 = `1/w` 纯视深；G/B = 稠密 pickId 拆成两个
  11-bit half（`pickId = G + B*2048`）；天空球写 0。
- pickId 是**渲染期**按"每个被绘制的对象"经 `uniform(0).onUpdate(...,
  NodeUpdateType.OBJECT)` 分配的稠密 id（`gpuPickIds` WeakMap +
  `gpuPickRegistry`）——不是 mesh.id，不是稳定 hash。
- `getPickedObject(pickId)`：带场景连通性校验，清理已卸载对象。
- 单像素回读：`readPickSync` / `readDepth` / `readDepthAsync`
  （`readRenderTargetPixelsAsync`）。

## PickResult 惰性细节（重要契约）

GPU 命中先返回**廉价字段**（点/距离/对象/瓦片归属）；
`intersection`（face normal/UV）、`userData`、`featureId`、`technique` 四个
字段是**惰性**的——首次读取时用"冻结的拾取射线"对单个对象做 targeted
raycast 并缓存。含义：相机移动后这些字段可能变 undefined（对象已不在当前
渲染集）。权威注释：`PickHandler.ts` 的 `intersectMapObjects` 顶部大注释。

## 相机碰撞（数据源 raycast + MapView 屏幕取点兜底）

入口：滚轮/点击 → `BaseMapControls.handleMouseInteractions` →
`rayCastZoomPoint` → `MapControls.rayCastWorld`
（`@flywave/flywave-map-controls/src/MapControls.ts`）。两级求交顺序：

1. **数据源 raycast**：对实现 `ICameraCollidable`
   （`@flywave/flywave-mapview/src/ICameraCollidable.ts`）且
   `enableCameraCollision` 的数据源逐个 raycast，按距离取最近命中；
   命中点是 render 空间，消费方 `.add(camera.position)` 平移回 geo 帧
   （铁律 1，范式 C）。
   - **地形碰撞住在 terrain-datasource**：`TerrainSource.raycast`
     （`@flywave/flywave-terrain-datasource/src/TerrainSource.ts`）沿射线
     对 `elevationProvider` 做自适应步进采样（步长 `clamp(离地高, 1, 50)`
     米，命中判定 `海拔 <= 地形高 + 1mm`；`zoomLevel >= 13` 才参与）。
     该源的 `enableCameraCollision` 默认 **true**（地面本身）。
   - 3D Tiles 经 `TileRenderDataSource.raycast` 参与，默认 false。
2. **兜底 = `mapView.getWorldPositionAt(x, y, false)`**：GPU 深度命中
   上一帧渲染表面（含地形/建筑网格）；手势期间深度槽因相机移动而冷 →
   自动退化为数学表面（球面 / z=0 平面）求交。返回 geo 帧坐标；两层
   全 miss 才返回 -1。
   - **坐标约定坑**：`getWorldPositionAt` 要"真实屏幕" client 坐标
     （`lastMouseX/Y`）；controls 内部流转的 mouseX/Y 是
     canvasWidth/Height 翻转后的坐标，勿透传（显式坐标仅 pickPoint 这类
     自带换算的入口提供）。

- **碰撞锁 `m_collisionLock`**：滚轮连拍期间光标 ±2px 内直接复用上次
  命中点（零射线）；只有滚轮路径写入与消费，点击/拖拽不走锁。
- 缩放 = 相机朝命中点插值逼近（`CameraTransform.zoom`）；平移穿地防护
  = `EllipsoidCameraTransform.pan` 的 `collisionTo` 球面求交 + 沿面
  滑动；`minCameraHeight` 法线钳制与 GPU 中心像素深度在
  `MapView.updateLookAtSettings`（反转深度，`depth > 0` 才算命中）。
- `CameraTransform.rayCastTerrain` 仍保留，但只服务平面投影 pan 的
  `collisionTo` 链路；缩放路径的地形求交已由 TerrainSource.raycast
  承担。GPU 深度读数只出现在 getWorldPositionAt 与
  updateLookAtSettings，历史文档所写 `rayCastGpuDepth` / `buildGpuPoint`
  / `m_gpuEmptyX/Y` 符号不存在。

## 3DTile 碰撞契约（"方向可信 / 原点重建"）

`@flywave/flywave-3dtile-datasource/src/TilesRenderer.ts` 的 `raycast`：

- 只信调用方射线方向，不信原点坐标系——origin 统一重置 `(0,0,0)`，事后恢复；
  输出 render 空间点，消费方 `.add(camera.position)`。
- `TileRenderDataSource` implements `ICameraCollidable`，`enableCameraCollision`
  选项控制是否参与相机地面钳制/缩放命中。
- `RootTile` 声明几何高度 ±1：虚报（曾用 10000）会破坏 clip plane / 阴影
  视锥——铁律 4 的实际事故案例。

## 阴影

- **CSM**：`@flywave/flywave-atmosphere` 的 `CascadedShadowMapsNode`；由
  mapview 的 `AtmosphereSystem` 创建（4 cascade、maxFar 1e5）挂到
  `vrm.csmShadowNode`。
- **3DTile 自适应阴影 LOD**：`TilesRenderer` 的 `shadowCastErrorThreshold > 0`
  时按 SSE（包围球直径 → 屏幕像素）动态开关 `castShadow`；`= 0` 一刀切。
- **后处理链顺序**（`ViewRenderManager.buildNodeGraph`）：
  cloud → aerialPerspective（shadowLength）→ lensFlare → bloom →
  toneMapping（agx-punchy）→ TAA/SMAA → outline/调色。

## 改动注意

- `MapRenderingManager.gpuPicking` 开关切换会 `needsUpdate` 重建整个节点图
  （成本高，不要每帧切）。
- `ViewRenderManager.ts` 顶部 `@ts-nocheck`：类型不保护，改动必须运行验证。
- 任何深度回读的 unproject 都要遵守 `references/coordinates.md` 范式 B。
