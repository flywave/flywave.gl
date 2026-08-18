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

| 包 | 基类/路线 | 接什么数据 |
|---|---|---|
| flywave-vectortile-datasource | A | MVT 矢量瓦片 / GeoJSON tiles（OmvRestClient 等入口） |
| flywave-geojson-datasource | A（继承 VectorTileDataSource） | 静态 GeoJSON，强制 styleSetName "geojson" |
| flywave-features-datasource | A（继承 VectorTileDataSource） | 程序化要素：add/remove/clear + RBushTiler 空间索引 |
| flywave-terrain-datasource | A（ITerrainSource） | DEM（DEMTerrainSource，配 ArcGISTileProvider 叠影像）、quantized-mesh（Cesium）、地层（QuantizedStratumSource）；附带地面开挖/刷高程、投影贴图 |
| flywave-webtile-datasource | B | 栅格影像瓦片：OSM/Mapbox/ArcGIS/Bing + Custom 模板 |
| flywave-3dtile-datasource | B | OGC 3D Tiles / Cesium Ion / Google Photorealistic；内嵌 TilesRenderer，implements ICameraCollidable |
| flywave-debug-datasource | B | 无数据调试覆盖层（瓦片网格 + 坐标文本） |

## 效果/工具包挂接方式（改这些包时先确认挂接层）

- `flywave-atmosphere`（天空/大气/云/CSM 阴影，TSL 节点体系）：不直接实例化，
  由 `MapViewEnvironment` → `AtmosphereSystem` 创建，配置走
  `theme.atmosphere` 或 `MapViewOptions.atmosphereOptions`，API 在
  `mapView.environment.atmosphere`。
- `flywave-splats`（高斯泼溅）：作为 GLTF SPLAT 扩展被 `flywave-gltf`
  加载，再由 3dtile 数据源消费。
- `flywave-lines`（高精度线渲染）：底层库，被 mapview 的 TileGeometry 与
  vectortile 的 DataEmitter 使用。
- `flywave-heightmap-painter`（地形雕刻刷）：独立 UI 组件，直接持有
  MapView + TerrainDataSource。

## 新示例的规范

骨架模板：`.agents/skills/flywave-dev/assets/example-template/`。
`@flywave/flywave-examples/src/<name>/`：`index.ts`（MapView → MapControls →
数据源 → `beginAnimation()` 固定流程）+ `config.ts`（title/titleZh/
description/descriptionZh/thumbnail/code(分类码)/order）+ `thumbnail.png`。
webpack 按 glob 自动收录，无需注册。
