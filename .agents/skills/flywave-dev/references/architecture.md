# 架构：渲染循环、瓦片与线程

核心包 `@flywave/flywave-mapview`（`MapView.ts` 约 4300 行，绝对核心）。
本文给数据流与因果链；具体符号用 grep 定位。

## 渲染循环（按需驱动）

- `MapView.update()` 只置 `m_updatePending = true` 并 `startRenderLoop()`。
- `renderLoop()` → `render(frameStartTime)`；帧结束仅在 `isDynamicFrame`
  （有动画/挂起更新）时继续 `requestAnimationFrame`，否则**停摆**。
  `maxFps` 用跳帧限速。
- 渲染器初始化异步：构造 `new WebGPURenderer(...)`（`reversedDepthBuffer: true`）
  后还需 `m_renderer.init()` 完成，未就绪前 renderLoop 空转。

## 单帧流程（`render()` 内部顺序）

1. `m_tileObjectRenderer.prepareRender()`、统计重置
2. `updateCameras()` / `updateEnv()`：**双相机**——`m_camera`（geo 世界坐标）
   与 `m_rteCamera`（RTE，拷贝参数后 position 归零）；实际渲染用 RTE 相机
3. 清空场景根 `m_sceneRoot.children.length = 0`（每帧重建，铁律 2）
4. `m_visibleTiles.updateRenderList(storageLevel, zoomLevel, ...)`（见下）
5. 逐瓦片把瓦片对象挂到 `m_sceneRoot`
6. `m_mapAnchors.update()`、`m_animatedExtrusionHandler.update()`
7. 文本排布 `m_textElementsRenderer.placeText(renderList, ...)`
   （仅无 pointOfView 时）
8. `mapRenderingManager.render(...)`：有 ViewRenderManager（VRM）时走
   WebGPU RenderPipeline（TSL 后处理链），否则裸 renderer.render
9. 文本 / overlayScene 二次绘制（工作色彩空间切换）
10. 帧后：`disposePendingTiles()`；`setTimeout(0)` 调度
    `m_taskScheduler.processPending()`（几何创建在帧外做）；发 `FRAME_COMPLETE`

## 事件体系

- 事件名：`MapViewEventNames`（Update/Render/WillRender/AfterRender/
  FirstFrame/FrameComplete/ThemeLoaded/AnimationStarted/MovementStarted/
  ContextLost/Dispose 等）。
- **事件对象复用单例**避免 GC——监听器里**不要持有事件对象的引用**，
  下一次分发会被覆写。

## Tile 管理与 LOD

- 瓦片身份 = `TileKey`（莫顿码，四叉树，定义在
  `@flywave/flywave-geoutools/src/tiling/TileKey.ts`）+ offset。
- `Tile`（`Tile.ts`）implements `CachedResource`：持有 `tileKey`、
  `dependencies: TileKey[]`、`decodedTile`（setter 内更新包围盒与几何高度）、
  `tileLoader`、`objects`。
- `VisibleTileSet` + 内部 `DataSourceCache`：LRU 缓存，键
  `${dataSource.name}_${mortonCode}_${offset}`（所以数据源名必须唯一）；
  容量按 MB 或条数（`ResourceComputationType`）；仅在
  `tile.isVisible === false` 时可驱逐。
- 可见集计算：`updateRenderList()` → 遍历启用数据源 → `FrustumIntersection`
  求 visible keys → 按距离排序 → 可见 + dependent 两轮处理 → 几何创建。
  **Mixed LOD**：`enableMixedLod` 默认 true；细分终止条件在
  `FrustumIntersection`（达到最高可见 level / 瓦片面积小于目标面积）。
- 几何管线（`src/geometry/`）：`TileGeometryManager`（入口）→
  `TileGeometryLoader`（状态机 + 异步创建）→ `TileGeometryCreator`；
  地形位移走 `DisplacedBufferGeometry`/`DisplacedMesh`；`VertexCache`
  是临时变换的紧凑 LRU。
- 任务调度：`MapViewTaskScheduler` 基于 TaskQueue，两组：
  `FETCH_AND_DECODE` 与 `CREATE`。

## 线程模型（Worker 解码）

分层：**主线程 facade → worker 池 → worker 内 Service**。

- `ConcurrentDecoderFacade`（静态单例注册表）：按 scriptUrl 复用
  `ConcurrentWorkerSet`；`getTileDecoder(serviceType, ...)` 返回
  `WorkerBasedDecoder`。
- `ConcurrentWorkerSet`：worker 数默认 `clamp(hardwareConcurrency-1, 1, 2)`；
  引用计数自动销毁；请求排队 + 空闲 worker **LIFO** 派发。
- `WorkerBasedDecoder implements ITileDecoder`：`connect()` 先连
  WorkerServiceManager 再 CreateService 广播；`decodeTile()` 把 tileKey 转
  莫顿码、ArrayBuffer 进 transferList 零拷贝传输。
- Worker 侧（`@flywave/flywave-mapview-decoder`）：`WorkerServiceManager` +
  `WorkerService` 通用服务框架；`TileDecoderService` 处理解码请求并收集
  vertex/index buffer 零拷贝回传。
- 协议定义：`@flywave/flywave-datasource-protocol/src/` 的
  `WorkerServiceProtocol.ts` / `WorkerDecoderProtocol.ts` /
  `WorkerTilerProtocol.ts`。
- DataSource 侧组装：`TileDataSource`（mapview-decoder）构造时取
  `WorkerBasedDecoder`；`TileLoader` = `dataProvider`（拉二进制）+ decoder。
  主线程侧 `BaseTileLoader` 提供状态机（Loading/Decoding/Ready/Failed/
  Canceled）与 AbortController 取消。
- **特例**：3D Tiles 不走 worker 解码管线——`TileRenderDataSource` 自带内嵌
  TilesRenderer（fork 自 3DTilesRendererJS），LOD/加载完全自治，
  `cacheable = false`。

## 排障速查

| 症状 | 第一怀疑点 |
|---|---|
| 画面不动 | 忘调 `update()`（按需渲染） |
| 加的对象下一帧消失 | 挂到了场景根（每帧清空）——改用 MapAnchor |
| 坐标偏差地球半径量级 | 混用 RTE / geo 帧（铁律 1） |
| 瓦片闪断/内存暴涨 | `memoryUsage` / `cacheable` 上报不实，LRU 行为异常 |
| Worker 静默连不上 | 解码 Service 没在 `DecoderBundleMain.ts` 注册（铁律 5） |
| 阴影消失 | 瓦片几何高度声明虚报破坏 clip plane / 阴影视锥（铁律 4） |
| GPU 拾取偶发 miss | 结果绑定上一帧渲染；相机移动后惰性字段失效（铁律 7） |
