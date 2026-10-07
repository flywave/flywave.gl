# 数据源开发指南

协议核心：`@flywave/flywave-datasource-protocol`（UI 线程与 Worker 共享的
解码/样式化协议）。注意 `DataSource` 抽象类与 `Tile` 类不在 protocol 包里，
在 `@flywave/flywave-mapview/src/DataSource.ts`。

## 先决策：走哪条路线？

| 路线 | 基类 | 适用 | 参考实现 |
|---|---|---|---|
| **A：解码型** | `TileDataSource`（`@flywave/flywave-mapview-decoder/src/TileDataSource.ts`） | 下载 → Worker 解码 → 主题风格化的结构化数据（矢量/GeoJSON/DEM） | `flywave-geojson-datasource`（最薄）+ `flywave-vectortile-datasource` 的 Decoder/Service |
| **B：直连型** | `DataSource`（mapview） | 栅格直出 / 自治 LOD 树 / 调试覆盖 | 栅格：`flywave-webtile-datasource`；自治：`flywave-3dtile-datasource`；最小范例：`flywave-debug-datasource`（约 150 行，最干净的直接继承示例） |

**照抄矩阵**：新增解码型 → 抄 geojson-datasource；栅格 → 抄 webtile 的
Provider+DataSource 成对结构（或零代码用 `CustomWebTileDataSource` URL 模板
`{z}/{x}/{y}/{-y}/{s}`，见该包 `CUSTOM_WEBTILE.md`）；自治 LOD → 抄
3dtile；调试覆盖 → 抄 debug。

## 路线 A 配方（checklist，顺序执行）

1. **XxxDataProvider extends DataProvider**（mapview-decoder 的
   `DataProvider.ts`）：只负责按 TileKey 拉原始数据
   （`getTile(tileKey) → Promise<TileData>`）。
2. **XxxDecoder extends ThemedTileDecoder**（Worker 侧，mapview-decoder）：
   把原始数据解码为 `DecodedTile`（techniques + 纯 ArrayBuffer 几何 +
   textGeometries/poiGeometries + boundingBox）。
3. **XxxDecoderService**：仿 `flywave-vectortile-datasource/src/` 的
   `VectorTileDecoderService`，提供 `start()` 静态注册。
4. **注册进 decoder bundle**：`@flywave/flywave.gl/src/DecoderBundleMain.ts`
   import 并启动。漏了这步 = 静默连不上（铁律 5）。
5. **数据源构造**：传 `concurrentDecoderServiceName` + `tilingScheme` +
   `styleSetName`（仿 `VectorTileDataSource` 构造，其默认 styleSetName
   "omv"、maxDataLevel 17、storageLevelOffset -1 可作参照）。
6. **主题侧**：theme JSON 的 `styles["<你的styleSetName>"]` 加 StyleSet，
   模板用 `@flywave/flywave-map-theme/resources/tilezen_base.json`。
7. **挂载**：普通层 `mapView.addDataSource(ds)`；地形层
   `mapView.setElevationSource(terrainSource)`（要求实现
   `TerrainDataSource` 接口：`getElevationProvider()` +
   `getElevationRangeSource()`，见 `DataSource.ts`）。
8. **导出链**：包 `src/index.ts` 导出 → 需要对外则再在
   `@flywave/flywave.gl/src/index.ts` re-export → `pnpm docs` 重新生成。

## 关键类型速查

- `DataSourceOptions`（`DataSource.ts`）：`name`（全局唯一）、`styleSetName`、
  `languages`、`min/maxDataLevel`、`min/maxDisplayLevel`、
  `storageLevelOffset`、`enablePicking`、`maxGeometryHeight`（如实上报，
  铁律 4）、`dataSourceOrder`。
- `DataSource` 抽象类必实现：`getTilingScheme()`、`getTile(tileKey)`；
  常用钩子：`connect()/attach()/detach()`、`setTheme()`、`requestUpdate()`、
  `canGetTile()/shouldSubdivide()/isVisible()/getDataZoomLevel()`。
- `Tile`：`objects: TileObject[]`、`geoBox`、`copyrightInfo`、`tileLoader`。

## 各数据源包速览

| 包 | 基类/路线 | 接什么数据 | 默认 styleSetName |
|---|---|---|---|
| flywave-vectortile-datasource | A（TileDataSource） | MVT 矢量瓦片 / GeoJSON tiles | `"omv"`（HERE 默认 baseUrl 时 `"tilezen"`） |
| flywave-geojson-datasource | A（继承 VectorTileDataSource） | 静态 GeoJSON | `"geojson"` |
| flywave-features-datasource | A（继承 VectorTileDataSource） | 程序化要素：add/remove/clear + RBushTiler 空间索引 | 继承 `"omv"`（示例显式传） |
| flywave-terrain-datasource | A（TerrainSource implements ITerrainSource+TerrainDataSource） | DEM、quantized-mesh（Cesium Ion）、地层；开挖/刷高程、投影贴图 | —（主题不参与） |
| flywave-webtile-datasource | B（DataSource） | 栅格影像瓦片：OSM/Mapbox/ArcGIS/Bing + Custom 模板 | —（无样式） |
| flywave-3dtile-datasource | B（DataSource + ICameraCollidable） | OGC 3D Tiles / Cesium Ion / Google Photorealistic | 自定键，`technique:"tile3d"` |
| flywave-debug-datasource | B（DataSource） | 无数据调试覆盖层（瓦片网格 + 坐标文本） | — |

Worker 服务注册现状（`DecoderBundleMain.ts`）：`VectorTileDecoderService`、
`GeoJsonTilerService`、`TerrainTileDecoderService` 三个。

## 逐源接口明细

### vectortile（`flywave-vectortile-datasource`）

- 入口类 `VectorTileDataSource`（`src/VectorTileDataSource.ts`）；参数
  `VectorTileDataSourceParameters = DataSourceOptions & TileDataSourceOptions 子集
  + {dataProvider?, showMissingTechniques?, gatherFeatureAttributes?, skipShortLabels?,
  filterDescr?, tileFactory?, featureModifierId?, politicalView?, enableElevationOverlay?,
  addGroundPlane?, roundUpCoordinatesIfNeeded?}` ∪ `OmvRestClientParameters`
  （`url|baseUrl`、`authenticationCode`、`apiFormat`、`authenticationMethod`）。
  `url|baseUrl|dataProvider` 三选一，否则构造抛错。
- 构造默认：`styleSetName ?? "omv"`、decoder `"vector-tile-decoder"`、
  `minDataLevel 1`/`maxDataLevel 17`、`storageLevelOffset -1`、强制
  `webMercatorTilingScheme`、`cacheable=true`。HERE 默认 URL 命中
  `hereVectorTileDefaultOptions` → `styleSetName: "tilezen"`。
- REST 入口 `OmvRestClient`（`src/OmvRestClient.ts`）：`APIFormat.HereV1/XYZOMV/
  XYZMVT/XYZJson/XYZSpace/MapboxV4/MapboxV7/TomtomV1` + `AuthenticationMethod`。
- 运行时可改：`setDataFilter(filterDescr)/removeDataFilter()`（`OmvFeatureFilterDescriptionBuilder`）、
  `setPoliticalView(country)`、`setEnableElevationOverlay(bool)`、`storageLevelOffset`——
  每项都清缓存 + `markTilesDirty`。Worker 服务可被多源共享，`configureDecoder` 只清本源缓存。
- GeoJSON 索引路线：`GeoJsonDataProvider(name, URL|GeoJson, opts)` + `RBushTiler`
  （implements `ITiler`；Worker 侧 `GeoJsonTilerService`）。
- ⚠️ 废弃但仍在：`createTileInfo`、`gatherRoadSegments`、`gatherFeatureIds`；
  `roundUpCoordinatesIfNeeded` 仅 HERE baseUrl 默认 true（180° 经线毛刺修复）。

### geojson / features

- `GeoJsonDataSource`（`src/GeoJsonDataSource.ts`）extends VectorTileDataSource，
  构造注入 `{styleSetName: "geojson", ...params}`。最薄的路线 A 抄写模板。
  Worker 侧 `GeoJsonTileDecoderService.start()` 打印 deprecated 提示（真实符号是
  `VectorTileDecoderService`）。
- `FeaturesDataSource`（`src/FeaturesDataSource.ts`，`FeatureDataSourceOptions`）：
  `add(...MapViewFeature)/remove/clear/setFromGeojson(FC|Feature|GC)`（**整体替换**）；
  构造快捷 `options.features`/`options.geojson`。要素类型族 `MapViewPointFeature/
  MultiPoint/Line/MultiLine/Polygon/MultiPolygon`（`src/Features.ts`）。
  身份键 `properties.__mapViewUuid`（取自 `feature.uuid`）——remove 未命中静默无操作；
  每次变更 `dataProvider.updateInput()` + `markTilesDirty`（attach 前是 no-op）。
  强制 `gatherFeatureAttributes: true`、`addGroundPlane: false`。

### webtile（栅格影像）

- `WebTileDataSource`（`src/WebTileDataSource.ts`）extends DataSource；
  `WebTileDataSourceOptions = Omit<DataSourceOptions,"enablePicking"|"styleSetName">
  + {dataProvider, resolution?: 256|512（默认 512）, renderingOptions?: {opacity,
  transparent, renderOrder?}}`。`WebTileDataProvider.getTexture(tile, AbortSignal)
  → [Texture|undefined, CopyrightInfo[]]`：reject = 瞬时失败（重试），resolve
  undefined = 无数据（瓦片算加载完）。
- `CustomWebTileDataSource`（`src/CustomWebTileDataSource.ts`）：`tileUrlTemplate`
  必填（缺则**构造抛错**），占位符 `{z} {x} {y} {-y}(TMS) {s}`，可配 `subdomains/
  headers/minZoomLevel/maxZoomLevel/copyrightInfo`。详见包内 `CUSTOM_WEBTILE.md`。
- ⚠️ `set opacity` 只影响未加载瓦片——对已缓存的生效需 `clearCache()` +
  `mapView.markTilesDirty(ds)`；`renderingOptions.renderOrder` @deprecated →
  `DataSource.dataSourceOrder`。
- 另有 `VectorTileRendererProvider`：把 OMV 矢量瓦片渲染成栅格纹理（矢量样式当影像用）。

### terrain（详见 `terrain-features.md`）

- 抽象层 `TerrainSource`（`src/TerrainSource.ts`）implements `ITerrainSource,
  TerrainDataSource`；`TerrainSourceOptions = Omit<TileDataSourceOptions,"tilingScheme"|
  "dataProvider"> + {tilingScheme?, maxJobs?, projectionSwitchOptions?, loadingStages?
  （默认 6）, showDebugInfo?, enableCameraCollision?（默认 true）}`。
  decoder id `"terrain-tile-decoder"`（`src/Constants.ts`）。
- 三个源：`DEMTerrainSource({source: DemSourceDescription, encoding})`（栅格 DEM，
  mapbox/terrarium 编码）、`QuantizedTerrainSource({url, requestWaterMask,
  requestVertexNormals, requestMetadata})` + `CesiumWorldTerrainSource({accessToken,
  assetId=1, apiEndpoint})`、`QuantizedStratumSource({url})`（地层地质体）。
- 影像叠加 `addWebTileDataSource(provider, {tilingScheme?})`/`removeWebTileDataSource`
  （≤5 provider，跨瓦片拼接，ImageBitmap LRU）；排除区 `addExclusionZone/
  removeExclusionZone`（`ExclusionManager`）；`raycast()` 供相机碰撞（命中是占位
  `terrainCollisionObject`，**不进拾取结果**）。
- `getGroundModificationManager() → HeightMapModifierManager`（注意真实类名，README
  的 `GroundModificationManager` 是幻觉）；`getProjectorOverlayManager() →
  ProjectorOverlayManager`。API 明细见 `terrain-features.md`。
- `QuantizedStratumSource` 运行时刷高程抛 "not implemented"（只有 DEM 路径是 GPU
  实时位移）；`clipTerrainMesh`（`src/quantized-terrain/quantized-mesh/QuantizedMeshCSG.ts`）
  是无调用方的试验性 CSG 减法工具。

### 3dtile（样式细节见 `3dtile-styling.md`）

- `TileRenderDataSource`（`src/TileRenderDataSource.ts`）implements `ICameraCollidable`；
  `TileRenderDataSourceOptions = DataSourceOptions + {url, transform?, headers?,
  enableDebug?, tilingScheme?, maxConcurrentRequests?, errorTarget?（默认 100）,
  customAttributeConfig?, animation?, debugBoundingVolume?, matrixTransformCallback?,
  castShadow?, receiveShadow?, wireframe?, shadowCastErrorThreshold?, postEffects?,
  enableCameraCollision?（默认 false）}`。
- `CesiumIonDataSource({accessToken, assetId, apiEndpoint})`——connect 时解析 Ion 端点
  再初始化 renderer。Google Photorealistic 用 `TileRenderDataSource({url:
  ".../google/photorealistic/tiles.json"})`（`GooglePhotorealistic3DTilesDataSource`
  **不存在**，别信 index 注释）。
- 自带加载/LOD（`src/base/TilesRendererBase.ts`，fork 结构，3D Tiles 1.1+ 支持有限）；
  `getGeoExtent()/getRootTile()/setVisible()/tilesRenderer`；批表查询
  `getBatchProperties(intersection, batchName="_BATCHID")`；批动画
  `BatchAnimation{duration, easing}`。
- 双层 renderer：`src/renderer/TilesRenderer.ts`（three 侧，`parseTile` 内经
  flywave-gltf 的 `createThreeSceneFromGLTF` 转场景）+ `src/TilesRenderer.ts`（implements
  `ITilesRenderer`，绑 MapView 相机）。`Observe3DTileChange` 按 content URI 永久去重。
- ⚠️ 激活/停用瓦片时**禁止**翻 `mesh.material`/`material.needsUpdate`（WebGPU 全管线
  重编译，见 `3dtile-styling.md` 铁律）；README 的 `when: "batchId === 0"` 示例语法
  不对（语法是 `==`，且列名区分大小写）。

### debug

`DebugTileDataSource(tilingScheme, name="debug", maxDbgZoomLevel=20)`（
`src/DebugTileDataSource.ts`）：红色瓦片网格（`depthTest:false`）+ 瓦片键文字。
`enablePicking=false`、`cacheable=true`。新增调试覆盖层就抄它。

## 效果/工具包挂接方式（改这些包时先确认挂接层）

- `flywave-atmosphere`（天空/大气/云/CSM 阴影，TSL 节点体系）：不直接实例化，
  由 `MapViewEnvironment` → `AtmosphereSystem` 创建，配置走
  `theme.atmosphere` 或 `MapViewOptions.atmosphereOptions`，API 在
  `mapView.environment.atmosphere`。
- `flywave-splats`（高斯泼溅）：作为 GLTF SPLAT 扩展被 `flywave-gltf`
  加载，再由 3dtile 数据源消费。
- `flywave-lines`（高精度线渲染）：底层库，被 mapview 的 TileGeometry 与
  vectortile 的 DataEmitter 使用。
- 地形笔刷：无独立 UI 包——算法在 `flywave-terrain-datasource` 包根的
  `heightmap-core.ts`（`BrushEngine`），写入口是
  `HeightMapModifierManager.updateModifierTexture()`（见 `terrain-features.md`）。

## 新示例的规范

骨架模板：`.agents/skills/flywave-dev/assets/example-template/`。
`@flywave/flywave-examples/src/<name>/`：`index.ts`（MapView → MapControls →
数据源 → `beginAnimation()` 固定流程）+ `config.ts`（title/titleZh/
description/descriptionZh/thumbnail/code(分类码)/order）+ `thumbnail.png`。
webpack 按 glob 自动收录，无需注册。
