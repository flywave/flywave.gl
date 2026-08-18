---
name: flywave-dev
description: >
  flywave.gl 3D 地图引擎（three/webgpu + TSL）的架构知识与开发工作流。
  在本仓库做任何读码、改码、排障、扩展任务之前使用——涉及渲染循环
  (render loop)、数据源 (DataSource)、主题 (Theme)、瓦片 (Tile)、拾取
  (picking)、相机 (camera)、坐标系 (RTE/geo)、WebGPU/TSL、Worker 解码、
  测试或构建的任务都必须先读本 skill。
---

# flywave.gl 引擎开发

面向「在本仓库修改 `@flywave/` 源码」的场景。本文件是**路由器 + 铁律**（触发时
全文载入，保持精简）；细节知识在 `references/` 下按任务**按需读取**。
用 flywave.gl 写上层应用的 API 用法不在此范围（看 `docs/` 与
`@flywave/flywave-examples/`）。

## 心智模型（读代码前先建立这个）

flywave.gl 是基于 **three/webgpu**（`WebGPURenderer` + TSL 节点材质，可
`forceWebGL` 回退 WebGL2）的 3D 地图引擎，monorepo，架构是 harp.gl 的自研演进。
理解一切代码的四个支柱：

1. **按需渲染**：MapView 不常驻 rAF。改任何视觉状态后必须调
   `mapView.update()`，否则画面不动。帧结束时只有存在动画/挂起更新
   （`isDynamicFrame`）才继续下一帧 rAF。
2. **双相机 / 双坐标系**：`m_camera` 是 geo 世界坐标相机；实际场景渲染用
   relative-to-eye（RTE）相机 `m_rteCamera`（position 归零），规避地球尺度的
   浮点精度丢失。GPU 深度/拾取结果都在 RTE 帧，消费前必须平移回 geo 帧。
3. **场景图每帧重建**：`MapView.render()` 每帧清空 `m_sceneRoot.children`
   再把可见瓦片对象重新挂上。持久对象一律走 `MapAnchor`
   （`mapView.mapAnchors` / overlay anchor）。
4. **数据与渲染分离**：数据在 Web Worker 解码（`DataProvider` 拉原始数据 →
   `ITileDecoder` 产出 `DecodedTile`，纯 ArrayBuffer），主线程在帧外
   （TaskScheduler 的 CREATE 任务组）创建 three 几何。写新数据源两侧都要动。

## 八条铁律

违反任何一条都会产生难查的 bug。锚点 = 文件 + 符号名，可自行 grep 验证。

1. **RTE → geo 平移**：任何 unproject / GPU 深度读数都在 camera-relative
   render camera 帧里，必须平移回 geo 帧再用（误差是地球半径量级）。
   权威注释：`@flywave/flywave-map-controls/src/MapControls.ts` 的
   `buildGpuPoint`；`@flywave/flywave-mapview/src/PickHandler.ts` 的
   `intersectMapObjects`；3DTile 侧契约见
   `@flywave/flywave-3dtile-datasource/src/TilesRenderer.ts` 的 `raycast`
   （"只信射线方向，不信原点坐标系"）。
2. **永不把持久对象挂到场景根**：场景根每帧清空重建。用户/持久对象必须走
   `MapAnchor`。证据：`@flywave/flywave-mapview/src/MapView.ts` 的 `render()`
   开头 `m_sceneRoot.children.length = 0`。
3. **改视觉状态后调 `update()`**：渲染循环是按需的。静态帧下不调
   `update()` 就不重绘。证据：`MapView.ts` 的 `update()` / `renderLoop()`。
4. **数据源名全局唯一；如实上报缓存与几何高度**：tile LRU 键含数据源名
   （`VisibleTileSet.ts` 的 `DataSourceCache`），`addDataSource` 重名抛错；
   `memoryUsage` / `maxGeometryHeight` 虚报会破坏 clip plane 与阴影视锥
   （实例：`TileRenderDataSource.ts` 的 `RootTile` 几何高度 10000→1 修复阴影消失）。
5. **新解码型数据源 = 主线程 DataSource + Worker Service 两侧都要动**：
   Worker 侧解码器必须在 `@flywave/flywave.gl/src/DecoderBundleMain.ts` 注册
   并打进 decoder bundle，漏注册是**静默**连不上（无报错）。
6. **材质/后处理只用 TSL，禁用旧 WebGL shader 体系**；`WebGPURenderer` 的
   `init()` 是异步的，构造后立刻渲染会撞未初始化。参考：
   `@flywave/flywave-mapview/src/composing/vrm/ViewRenderManager.ts` 的
   `buildNodeGraph`（注意该文件顶部 `@ts-nocheck`，类型保护弱，改动要格外小心）。
7. **GPU 拾取结果绑定"上一帧渲染内容"**：pickId 是渲染期分配的稠密 id，
   相机移动后惰性细节字段（intersection/userData/featureId/technique）可能
   变 undefined；`useGpuPick: true` 时 miss **不回退** CPU。见
   `@flywave/flywave-mapview/src/IntersectParams.ts` 与 `PickHandler.ts`
   顶部大注释（PickResult 惰性细节设计）。
8. **主题同步改用 `patchTheme`，异步段只能走 `setTheme`**：`patchTheme`
   是同步深合并但禁止改 images/styles/fontCatalogs/extends 等异步段；
   theme 未加载完成时调任一同步 API 直接 throw。见
   `@flywave/flywave-mapview/src/MapViewThemeManager.ts`。

## 任务路由

| 你要做什么 | 先读 |
|---|---|
| 渲染不刷新 / 瓦片不显示 / 帧流程 / 性能 / Tile 生命周期 / Worker 模型 | `references/architecture.md` |
| 坐标换算 / 放置持久对象 / RTE 与 geo 帧转换 | `references/coordinates.md`（配合铁律 1/2） |
| 新增或修改数据源（DataProvider / Decoder / 栅格源 / 地形） | `references/datasource-guide.md`；从零新建用 `assets/datasource-template/` 四件套 |
| 主题 / 样式 / Expr / patchTheme | `references/theming.md` |
| 拾取 / 相机碰撞 / GPU 深度 / 阴影 | `references/picking-collision.md`（配合铁律 1/7） |
| 跑测试 / 验证改动 / lint / 渲染回归 / 贡献流程 | `references/testing-workflow.md`；先跑 `scripts/check-env.sh` 看实时可用链路 |
| 新增示例 demo | `assets/example-template/`（glob 自动发现，无需注册） |
| 3D Tiles 样式 / batch 属性配色 / 动态高亮 | `references/3dtile-styling.md`（不走 styleSet 解码管线，是独立机制） |
| 文字/POI 不显示 / 字体 / FontCatalog / 标注排障 | `references/text-rendering.md` |
| 后处理 / bloom / 抗锯齿 / 大气云太阳 / 改 ViewRenderManager | `references/postprocessing-vrm.md` |
| 性能 / 卡顿 / 帧统计 / 缓存与 LOD 调参 | `references/performance-tuning.md` |
| 地形开挖 / 刷高程 / 投影贴图 / 地层 / HeightmapPainter | `references/terrain-features.md` |
| **聚合包 `@flywave/flywave.gl`**（对外使用核心）：re-export 面 / decoder bundle / 双格式构建 / 发布 / 外部应用接入 | `references/aggregate-package.md` |
| 资源 404 / 字体图标天空盒不显示 / decoder 脚本找不到 / `FLYWAVE_BASE_URL` / 资源部署 | `references/asset-paths.md` |
| 用引擎写应用（非本仓库源码开发） | `references/aggregate-package.md` 的接入指引 + `docs/docs/` 用户指南 + `@flywave/flywave-examples/src/`（46 个示例） |

## 包拓扑速查

依赖方向（左依赖右）：`datasource-protocol` ← `geoutils`/`utils` ← `mapview`
← 各数据源/控件 ← `flywave.gl`（顶层聚合包）。

- **底座（无 @flywave 运行时依赖）**：utils、lrucache、transfer-manager、fetch、
  geoutils、geometry、materials、text-canvas、datasource-protocol、atmosphere、
  lines、mapview-decoder
- **核心**：`flywave-mapview`（MapView/Tile/渲染循环，改动最常发生地）
- **中间层**：各数据源（vectortile/geojson/webtile/terrain/3dtile/features/debug）、
  map-controls、draw-controls、inspector、gltf、splats、topo、heightmap-painter、react
- **聚合出口（对外使用核心）**：`@flywave/flywave.gl` —— 全仓唯一发布包。
  re-export 几乎所有包 + 包装版 `MapView`（自动注入 `mapAssetsUriResolver`）
  + decoder worker bundle。**改公共 API 后记得**：顶层包 re-export 是否要加、
  `pnpm docs` 重新生成（`docs/docs/api/` 是机器生成的，勿手改）。细节见
  `references/aggregate-package.md`。

## 代码规范速查

- 跨包 import 只能写 `@flywave/xxx`，禁止跨包相对路径；包级循环依赖会被
  `test/ImportTest.ts`（Tarjan SCC）拦截。
- three 一律从 `three/webgpu` 导入（不要裸 `three`，不要旧 WebGL 体系）。
- 私有成员 `m_` 前缀；接口 `I` 前缀；事件名枚举 `*EventNames`。
- 新 `.ts` 文件要加 Apache 版权头（`test/LicenseHeaderTest.ts` 校验）。
- prettier：printWidth 100、4 空格；eslint：`simple-import-sort`、
  `no-console`、`max-len 100` 是硬规则。修复命令见
  `references/testing-workflow.md`。
- 注释与提交信息中英混排是仓库惯例，中文注释集中在相机/坐标变换模块。

## 维护本 skill

- 锚点用「文件 + 符号名」而非行号（行号会腐烂）；重构后 grep 验证锚点仍存在。
- 架构行为变化后同步更新对应 reference；测试链路修复/断裂后更新
  `references/testing-workflow.md` 的命令诚实性清单。
- 仍可扩展：package-map 详细版、verify-anchors.sh（批量校验本 skill 引用的
  符号仍存在于源码）。写新 reference 前先确认内容量大到值得拆分。
