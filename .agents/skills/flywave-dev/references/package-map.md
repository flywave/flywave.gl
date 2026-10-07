# 包地图（逐包能力与接口清单）

37 个 `@flywave/*` 包的「这个包能干什么、入口在哪、接哪一层」。
架构因果链看 `architecture.md`；数据源细节看 `datasource-guide.md`；
控件/工具看 `controls-tooling.md`。本文件回答"能力 X 在哪个包"。

依赖方向（左依赖右）：`datasource-protocol` ← `geoutils`/`utils` ← `mapview`
← 各数据源/控件 ← `flywave.gl`。

## 底座（无 @flywave 运行时依赖）

| 包 | 能力（动词） | 关键导出 / 入口 |
|---|---|---|
| **flywave-utils** | 记日志、调度优先级任务、解析资源 URI、数学/图像辅助、协程分片 | `LoggerManager.instance.create(name)`、`TaskQueue`（组优先级拉取队列；**最高优先级放数组末尾**）、`composeUriResolvers`/`PrefixMapUriResolver`、`GroupedPriorityList`、`runCoroutine*`、`getOptionValue`、`assert`；入口 `src/index-common.ts` |
| **flywave-lrucache** | 通用 LRU 缓存（瓦片缓存的内核） | `LRUCache(cacheCapacity, sizeMeasure?)`：`set/get/delete/setCapacity/shrinkToCapacity`、`evictionCallback`/`canEvict`；`map` getter 泄漏内部（源码 TODO 标注） |
| **flywave-transfer-manager** | 编排静态资源下载：JSON 去重、并发上限 16、503 线性退避重试 | `ITransferManager {downloadJson, downloadArrayBuffer, download}`、`TransferManager.instance()`；4xx 不重试 |
| **flywave-fetch** | Node 侧 fetch 垫片（支持 `file:` / cwd 相对路径）——**仅供测试** | `FetchFunction`；双入口 index.ts（node）/index.web.ts |
| **flywave-geoutils** | 坐标/投影/瓦片键/包围盒数学 | `GeoCoordinates`/`GeoBox`/`GeoPolygon`、`MercatorProjection`/`TransverseMercatorProjection`/`SphericalEarthProjection` 等 `Projection` 族、`TileKey`（莫顿码四叉树地址）/`TileKeyUtils`/`WebMercatorTilingScheme`/`PolarTilingScheme`/`QuadTree`、`OrientedBox3`（DecodedTile.boundingBox 的类型）、`FrustumTester` |
| **flywave-geometry** | 三角化、裁剪、瓦片网格构建、细分、BVH | `TileGeometryBuilder` 族、`triangulate`/`triangulateWithEarcut`、`weilerAthertonClip`、`cdt`（约束 Delaunay）、`wrapPolygon`（跨反经线）、`TerrainAdaptedSubdivisionModifier`、BVH `HybridBuilder`（拾取加速） |
| **flywave-materials** | TSL 节点材质：瓦片填充/线/图标/点/大气地表 | `MapMeshMaterials`（`MapMeshBasicMaterial`/`MapMeshDepthMaterial` + fading/extrusion/shadow mixin）、`SolidLineMaterial`（虚线帽/接头）、`VisualBatchMaterial`、`IconMaterial`、`EdgeMaterial`、`CirclePointsMaterial`（SDF 圆点）、`GroundAtmosphereMaterial`/`SkyAtmosphereMaterial`、`DisplacementMap`。⚠️ 多数文件 `@ts-nocheck` |
| **flywave-lines** | 粗线三角化 + 高精度（RTE 免抖）线/点对象 | `createLineGeometry`/`LineGroup`、`triangulateLine`（宽度→圆帽点数）、`HighPrecisionLine`/`HighPrecisionUtils` |
| **flywave-text-canvas** | SDF 文字：字形图集、排版（含 RTL/阿拉伯）、文字缓冲 | `TextCanvas`（`measure`/buffer 生成）、`FontCatalog`、`TextStyle`（`FontUnit/FontStyle/VerticalAlignment/...`）、`TextBufferObject`、`TypesettingUtils`/`UnicodeUtils`；`TextMaterials` 是 `@ts-nocheck` |
| **flywave-datasource-protocol** | 主线程/Worker 共享协议：主题样式模型、Expr、DecodedTile、Worker 消息 | 见下节展开 |
| **flywave-atmosphere** | 物理大气/天空/云/CSM/星月 + 通用 TSL 效果库（bloom/TAA/SMAA/模糊/镜头光晕） | `SkyNode`/`AtmosphereContext`/`AtmosphereLUTTextures`、`AerialPerspectiveNode`、`SunNode`/`MoonNode`/`StarsNode`、`CascadedShadowMapsNode`、`createCloudRenderer`/`CloudRenderNode`/`qualityPresets`、效果库 `BloomNode`/`temporalAntialias`/`smaaWrapped`/`LensFlareNode`/`agxPunchyToneMapping`；`resolveResourceUrl`、`capabilities.isFloatLinearSupported`。⚠️ 约 60 文件 `@ts-nocheck`；云的 StorageTexture 需手动生成 mipmap |
| **flywave-mapview-decoder** | Worker 解码管线底座：数据拉取、瓦片加载、TileDataSource 基类、Worker 服务框架 | 主线程入口 `src/index.ts`：`DataProvider`（abstract `getTile(tileKey)`）、`TileDataSource`+`TileDataSourceOptions`、`TileLoader`；Worker 入口 `src/index-worker.ts`：`ThemedTileDecoder`（abstract `decodeThemedTile`）、`TileDecoderService`/`TilerService`/`WorkerService(Manager)`、`GeoJsonTiler`。⚠️ 未配置 styleSet 时 decode 静默返回 undefined |
| **flywave-map-theme** | **纯资源包**（≈136MB）：主题 JSON、字体、LUT、图标、天空/云/月纹理 | `resources/`：tilezen 主题 13 份（`tilezen_base.json` 等）、`fonts/Default_FontCatalog.json`（11 字族）、`lut/` 11 个调色预设（.png strip/.cube/.3dl）、`atmosphere/stars.bin`、`clouds/*.bin`+png、`moon/`、`polar/`、maki 图标表。`index.js` 空——当静态资源用 |

## flywave-datasource-protocol 展开（协议核心）

- **Theme/FlatTheme**（`src/Theme.ts`）：`extends`（可数组/内联/FlatTheme）、`styles:
  Record<styleSetName, StyleSet>`、`definitions`（`["ref", name]` 引用）、`lights`、
  `sky`（Gradient/Cubemap）、`atmosphere: AtmosphereThemeConfig`、`fog`、`fontCatalogs`、
  `images`/`imageTextures`、`environment`、`poiTables`、`priorities`/`labelPriorities`、
  `postEffects`、`toneMappingExposure`/`toneMappingMode`（默认 `"agx-punchy"`）、`lensFlare`。
  `FlatTheme` = styles 变单数组。`StyleAttributes`：`when`（string|JsonExpr）、`technique`
  （必填）、`layer`、`final`、`category`、`renderOrder`、`min/maxZoomLevel`、`transient`。
- **Technique 联合**（`src/Techniques.ts`）：fill/solidLine/line/segments/squares/circles/
  poi/lineMarker/basicExtrudedLine/standardExtrudedLine/extrudedPolygon/text/shader/
  terrain/labelRejectionLine/tile3d 等；每种一个 `isXxxTechnique` 守卫 +
  `*TechniqueParams`（`TechniqueParams.ts`，大量废弃字段：字符串编码过滤属性 →
  `["get", …]`）。
- **Expr**（`src/Expr.ts` + `ExprEvaluator/Parser/Instantiator/Pool`）：
  `Expr.fromJSON(json, definitions?, styleSet?)`（字符串编码形式 @deprecated）、
  `evaluate(env, scope?, cache?)`、`ExprScope.Value|Condition|Dynamic`；
  AST：Literal/Var/HasAttribute/Call/Lookup/Match/Case/Step/Interpolate；
  操作符族在 `src/operators/`（Math/Color/String/Comparison/Flow/…）。
- **Env/MapEnv**（`src/Env.ts`）：feature 属性 + `$zoom` 等内建变量，parent 链查找；
  MapView 的 `setDynamicProperty` 写进这里。
- **DecodedTile**（`src/DecodedTile.ts`）Worker→主线程交接物：`techniques:
  IndexedTechnique[]`、`geometries: Geometry[]`（纯 ArrayBuffer `BufferAttribute`）、
  `textGeometries?`（@deprecated）/`textPathGeometries?`/`poiGeometries?`/`pathGeometries?`、
  `boundingBox?: OrientedBox3`、`max/minGeometryHeight`、`dependencies?`（莫顿码）、
  `tileInfo?`、`decodeTime?`。
- **Worker 协议**：`WorkerServiceProtocol`（ServiceMessage/Request/Response、
  CreateService/DestroyService）、`WorkerDecoderProtocol`（`DecodeTileRequest{tileKey,
  data, projection}`、`ConfigurationMessage{styleSet,definitions,priorities,languages}`、
  `RequestController`）、`WorkerTilerProtocol`（RegisterIndex/UpdateIndex/TileRequest）。
- **ITileDecoder**（`src/ITileDecoder.ts`）：`connect/decodeTile/getTileInfo/configure/dispose`；
  `DecoderOptions{styleSet,definitions,priorities,labelPriorities,languages}`。
  **`configure(undefined)` 不重置**。
- **StyleSetEvaluator**（`src/StyleSetEvaluator.ts`，Worker 侧）：
  `getMatchingTechniques(env, layer?, geometryType?)` —— 结果复用缓存，**禁止 mutate**；
  `when` 解析失败 fail-closed（不匹配任何样式）。
- **PostEffects**（`src/PostEffects.ts`）：`bloom/outline/vignette/sepia/hueSaturation/
  brightnessContrast/colorGradingLUT/fogLight/ssr/antialiasing("none"|"taa"|"smaa")`；
  `taa?: boolean` @deprecated。`IColorGradingLUTEffect.url` 支持 .cube/.3dl/png strip。

## 核心（改动最频繁）

| 包 | 能力 | 详见 |
|---|---|---|
| **flywave-mapview** | MapView/Tile/渲染循环/拾取/主题/合成层/Worker facade——引擎本体 | `api-surface.md`（API 面）、`architecture.md`（因果链） |

## 中间层（数据源 / 控件 / 模型）

| 包 | 能力 | 详见 |
|---|---|---|
| flywave-vectortile-datasource | MVT/OMV 矢量瓦片解码渲染 | `datasource-guide.md` |
| flywave-geojson-datasource | 静态 GeoJSON | 同上 |
| flywave-features-datasource | 运行时增删的程序化要素层 | 同上 |
| flywave-webtile-datasource | 栅格影像瓦片（OSM/Mapbox/ArcGIS/Bing/自定义模板） | 同上 |
| flywave-terrain-datasource | DEM / quantized-mesh / 地层 + 开挖刷高程/投影贴图 | `datasource-guide.md` + `terrain-features.md` |
| flywave-3dtile-datasource | OGC 3D Tiles（内嵌 TilesRenderer fork） | `datasource-guide.md` + `3dtile-styling.md` |
| flywave-debug-datasource | 瓦片网格调试覆盖（最小 DataSource 范例，~150 行） | `datasource-guide.md` |
| flywave-gltf / flywave-draco | glTF/GLB 解析转 three Scene / Draco 编解码（自带 worker） | `controls-tooling.md` 模型栈 |
| flywave-splats | 高斯泼溅 Mesh/Material/树（经 glTF 扩展消费） | 同上 |
| flywave-map-controls | 地图相机控制器 + UI 面板 + 缩略图 | `controls-tooling.md` |
| flywave-draw-controls | 交互绘制/编辑/测量/GeoJSON 导入导出 | 同上 |
| flywave-inspector | dat.GUI 调试监控面板（模块化） | 同上 |
| flywave-react | React 封装（MapProvider/MapCanvas/hooks） | 同上 |
| flywave-topo | 计算几何/拓扑内核（B 样条/polyface/solid/半边图/裁剪） | 同上 |
| flywave-atlas-tools | 图标集图集 CLI | 同上 |
| flywave-theme-tools | 主题合并优化 CLI | `theming.md` 工具节 + `controls-tooling.md` |

## 工具/测试

| 包 | 能力 | 详见 |
|---|---|---|
| flywave-webpack-utils | webpack 预设 `addWebpackConfig`（浏览器包 + decoder 包 + 资源拷贝） | `controls-tooling.md` |
| flywave-test-utils | 测试工具 + IBCT 图像回归框架（RenderingTestHelper/CLI） | `testing-workflow.md` |
| flywave-examples | 示例库（45 个示例目录，8 分类，glob 自动发现） | `controls-tooling.md` 示例节 |

## 不存在/空壳（防幻觉清单）

- `flywave-clouds`：目录只有 `lib/` 构建残留，**无 package.json 无源码**；
  云渲染真实位置是 `flywave-atmosphere/src/clouds/`。不要引用 `@flywave/flywave-clouds`。
- `flywave-heightmap-painter`：**本仓不存在**。地形笔刷的真实实现是
  `@flywave/flywave-terrain-datasource/heightmap-core.ts`（`BrushEngine`/`HeightmapGenerator`，
  注意该文件在包根目录不在 src/，也未被 src 引用——现状如此）+
  `HeightMapModifierManager`（`src/ground-modification-manager/`）。
- `GooglePhotorealistic3DTilesDataSource`：3dtile 包 `src/index.ts` 注释提到但**类不存在**；
  用 `TileRenderDataSource({url: ".../google/photorealistic/tiles.json"})`。
- terrain README 的 `GroundModificationManager`/`GroundModificationType`/`krigingOptions`
  **不存在**；真实 API 是 `HeightMapModifierManager`（入口 `terrainSource.getGroundModificationManager()`）。
- map-controls README 的 `CameraKeyTrackAnimation`/`CameraAnimationBuilder` 在
  `flywave-mapview/src/camera/`，不在 map-controls。`LongPressHandler` 真实签名是
  `(element, onLongPress, onTap?)`，不是 options 对象。
- webpack-utils README 的 `HarpWebpackConfig`/`addFlywaveWebpackConfig` 是 harp 时代残留；
  真实入口 `scripts/WebpackConfig` 导出 `addWebpackConfig`。

## 双入口模式（写跨线程代码时）

`flywave-datasource-protocol` 与 `flywave-mapview-decoder` 各有主线程/Worker 两个入口：
`index.ts` vs `index-decoder.ts` / `index-worker.ts`。Worker 构建必须 import `-decoder`/
`-worker` 变体，打包进 decoder bundle（`@flywave/flywave.gl/src/DecoderBundleMain.ts`
注册，铁律 5）。

## @ts-nocheck 低类型安全区（改动格外小心）

`flywave-materials` 多数文件、`flywave-text-canvas` 的 `TextMaterials`、
`flywave-atmosphere` 约 60 个文件（src/tsl/ 与 src/atmosphere/ 几乎全部）、
`flywave-mapview` 的 `composing/vrm/ViewRenderManager.ts`。
