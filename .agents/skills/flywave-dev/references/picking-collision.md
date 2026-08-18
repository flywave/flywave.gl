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

## 相机碰撞（MapControls 的 GPU 深度）

`@flywave/flywave-map-controls/src/MapControls.ts`：

- 滚轮缩放前 `rayCastGpuDepth` 读光标像素深度 → `buildGpuPoint` unproject +
  平移回 geo 帧（见 `references/coordinates.md` 范式 B）。
- 读失败走异步重读；**"GPU 明确回答虚空"才允许 CPU 兜底**
  （`m_gpuEmptyX/Y` 记忆机制）。
- 碰撞锁 `m_collisionLock`：光标 2px 内复用上次结果。
- CPU 兜底路径：对实现 `ICameraCollidable`
  （`@flywave/flywave-mapview/src/ICameraCollidable.ts`）的数据源 raycast。

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
