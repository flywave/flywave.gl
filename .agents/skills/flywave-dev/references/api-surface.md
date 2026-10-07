# MapView 公共 API 面（选项 / 方法 / 事件 / 核心类型）

回答「引擎对外提供什么能力」时先看本文。权威来源：
`input/flywave-mapview.api.md`（API Extractor 报告，导出面的真值）+
`@flywave/flywave-mapview/src/`。锚点用文件 + 符号名。

## MapViewOptions（构造选项，`src/MapView.ts` 的 `MapViewOptions`）

继承 `TextElementsRendererOptions`（`src/text/TextElementsRendererOptions.ts`）
+ `Partial<LookAtParams>`（相机初始姿态直接放顶层）。

| 组 | 代表字段 |
|---|---|
| 必填 | `canvas`；可选 `context` |
| 相机/视野 | `target/distance/tilt/heading/zoomLevel/bounds`、`min/maxZoomLevel`（默认 1/20）、`minCameraHeight`（20m）、`fovCalculation`（`"fixed"\|"dynamic"`）、`projection`、`maxBounds` |
| 渲染后端 | `forceWebGL`（WebGPU 优先回退 WebGL2）、`alpha`、`pixelRatio`、`dynamicPixelRatio`（移动中降采样）、`customAntialiasSettings`（MSAA 静/动态采样）、`synchronousRendering`（外置渲染循环 + `renderSync`）、`maxFps`、`enableShadows`、`powerPreference` |
| 瓦片/缓存/LOD | `tileCacheSize`（200）、`resourceComputationType`（MB 或条数）、`maxVisibleDataSourceTiles`（400）、`quadTreeSearchDistanceUp/Down`（3/2）、`extendedFrustumCulling`、`tileWrappingEnabled`、`clipPlanesEvaluator`、`enableMixedLod`、`max/minGeometryHeight` |
| 拾取 | `enableGpuPicking`（默认 true）、`enablePickTechnique`；`enableRoadPicking` **@deprecated** |
| Worker | `decoderUrl`（默认 `./decoder.bundle.js`）、`decoderCount`（默认 clamp(hwConcurrency-1,1,2)） |
| 主题/语言 | `theme`（string/Theme/FlatTheme/Promise）、`uriResolver`、`languages`、`politicalView` |
| 环境 | `atmosphereOptions`（`AtmosphereThemeConfig`）、`addBackgroundDatasource`、`backgroundTilingScheme`、`enablePolarDataSource` + `polarStyleSetName`（默认 "polar"） |
| 文本 | `fontCatalog`、`min/maxNumGlyphs`、`maxNumVisibleLabels`、`labelDistanceScaleMin/Max`、`disableFading`、`delayLabelsUntilMovementFinished`、`collisionDebugCanvas` |
| 工厂钩子 | `useMapRenderingManager(w,h,mv)`、`useThemeManager(mv,resolver)`、`useMapViewEnvironment(mv,opts)`——替换合成层实现的注入点 |

性能相关旋钮的调参含义见 `performance-tuning.md`。

## MapView 方法（按能力分组，`class MapView extends EventDispatcher`）

- **生命周期/帧**：`ready: Promise`（WebGPU init 异步，铁律 6）、`update()`（请求重绘，铁律 3）、`renderSync()`、`dispose()`、`resize()`、`beginAnimation()/endAnimation()`、`frameNumber`、`taskQueue`（FETCH_AND_DECODE / CREATE 两任务组）
- **相机**：`lookAt(Partial<LookAtParams>)`（旧位置参数重载 @deprecated）、`flyTo(FlyToOptions)` / `flyToBounds(FlyToBoundsOptions)`（`curve:"linear"|"bow"`）、`stopCameraAnimation()`、`cameraIsMoving`、`cameraMovementDetector`；get/set：`zoomLevel/tilt/heading/target/geoCenter/pointOfView/projection/geoMaxBounds`、`setFovCalculation()`；`camera`（geo 帧）、`getRteCamera()`（RTE 渲染相机，铁律 1）、`pixelToWorld/worldToPixel`
- **数据源**：`addDataSource(ds)`（重名抛错，铁律 4）、`removeDataSource`、`getDataSourceByName`、`getDataSourcesByStyleSetName`、`dataSources`、`clearTileCache(name?,filter?)`、`markTilesDirty(ds?,filter?)`、`forEachVisibleTile/forEachCachedTile`、`getCacheSize/setCacheSize`、`lockVisibleTileSet`、`visibleTileSet`、`setDynamicProperty(name,value)` / `removeDynamicProperty`（样式 `Expr` 的动态变量，读 `env`）
- **主题**：`setTheme(Theme|FlatTheme|string): Promise<Theme>`（异步段唯一入口）、`patchTheme(delta)`（同步深合并，禁改异步段，铁律 8）、`getTheme()/getThemeSync()`、`languages`/`politicalView`
- **锚点/对象**：`mapAnchors: MapAnchors`（持久对象，铁律 2）、`overlayScene`、`addOverlayText(TextElement[])` / `clearOverlayText()`
- **拾取/坐标查询**：`intersectMapObjects(x,y,IntersectParams?) → PickResult[]`（CSS 像素）、`getGeoCoordinatesAt(x,y,fallback?)`、`getWorldPositionAt`、`getScreenPosition`、`getNormalizedScreenCoordinates`、`pickHandler`；拾取契约见 `picking-collision.md`
- **高程**：`setElevationSource(elevationSource, elevationRangeSource?, elevationProvider?)`（要求 `TerrainDataSource`）、`clearElevationSource`、`elevationProvider`、`elevationSource`
- **文本**：`textElementsRenderer`、`renderLabels`、`updateFontCatalogs/updateTextStyles`（经 theme manager）
- **后处理/环境**：`postEffects` get/set、`loadPostEffects(url)`、`shadowsEnabled`、`lights`、`fog: MapViewFog`、`mapRenderingManager`（合成层，见 `postprocessing-vrm.md`）
- **调试/统计**：`enableStatistics`（喂 `Statistics.ts` 的 `PerformanceStatistics.instance`，无公开 statistics getter，采集方式见 `performance-tuning.md`）

## 事件（`MapViewEventNames`，18 个）

| 枚举 | 字符串 | 载荷备注 |
|---|---|---|
| Update | `update` | 每次请求更新 |
| Resize | `resize` | `size:{width,height}` |
| Render / WillRender | `render` / `will-render` | 帧前 |
| AfterRender | `didrender` | 帧后 |
| FirstFrame | `first-render` | 首帧 |
| FrameComplete | `frame-complete` | 所有瓦片资源就绪 |
| ThemeLoaded | `theme-loaded` | |
| AnimationStarted/Finished | `animation-started/finished` | `begin/endAnimation` |
| MovementStarted/Finished | `movement-started/finished` | 相机交互 |
| DataSourceConnect | `datasource-connect` | `dataSourceName`、可选 `error` |
| CopyrightChanged | `copyright-changed` | |
| ContextLost/Restored | `webglcontext-lost/restored` | |
| CameraPositionChanged | `camera-changed` | `latitude/longitude/altitude/yaw/pitch/roll/tilt/heading/zoom` |
| Dispose | `dispose` | 清理前 |

载荷类型 `RenderEvent`（`type` + `time` + 松散字段）。**事件对象是复用单例，监听器里不要持有引用**（架构铁律附注）。`DataSource` 自己发 `"update"` 事件（`DataSourceEventMap`）。

## 核心类型速查（导出面）

| 类型 | 位置 | 角色 |
|---|---|---|
| `DataSource` / `DataSourceOptions` | `src/DataSource.ts` | 一切图层基类：`getTile/getTilingScheme` 抽象，`attach/detach/connect/dispose/setTheme`，`cacheable`、`storageLevelOffset`、`styleSetName`、`enablePicking`、`enableCameraCollision`、feature-state CRUD（`set/get/removeFeatureState`）、`max/minGeometryHeight`（铁律 4） |
| `TerrainDataSource` | 同上 | = DataSource + `getElevationProvider()` + `getElevationRangeSource()` |
| `Tile`（implements `CachedResource`） | `src/Tile.ts` | `tileKey/geoBox/boundingBox/objects:TileObject[]/decodedTile/memoryUsage/isVisible/raycast/getResourceInfo` |
| `ITileLoader` / `TileLoaderState` | `src/ITileLoader.ts` | 状态机 Initialized→Loading→Loaded→Decoding→Ready→Canceled/Failed |
| `VisibleTileSet` | `src/VisibleTileSet.ts` | LRU 缓存 + 渲染列表；`updateRenderList/clearTileCache/markTilesDirty` |
| `MapAnchor` / `MapAnchors` | `src/MapAnchors.ts` | `anchor`（`geoPosition` @deprecated）、`pickable`、`styleSet`、`category`、`overlay` |
| `PickResult` / `PickObjectType` | `src/IntersectParams.ts` 等 | `point/distance/dataSourceName/featureId/tileKey/technique/userData/intersection`（惰性，铁律 7）；类型枚举 Point/Line/Area/Text/Icon/Object3D |
| `IntersectParams` | `src/IntersectParams.ts` | `useGpuPick: boolean\|"auto"`、`maxResultCount`、`pickAnchor`——**不在 index 导出**，走子路径 `@flywave/flywave-mapview/IntersectParams` |
| `ElevationProvider` / `ElevationRangeSource` | `src/ElevationProvider.ts` / `ElevationRangeSource.ts` | `getHeight/sampleHeight/raycast/getDisplacementMap`；`getElevationRange → {min/maxElevation, calculationStatus}` |
| `DisplacementMap` / `TileDisplacementMap` | 同上目录 | 高程位移纹理数据 |
| `ClipPlanesEvaluator` | `src/ClipPlanesEvaluator.ts` | `evaluateClipPlanes → ViewRanges`；实现：`TiltViewClipPlanesEvaluator`（默认）、`FixedClipPlanesEvaluator`；`TopViewClipPlanesEvaluator` **@deprecated** |
| `ICameraCollidable` | `src/ICameraCollidable.ts` | `enableCameraCollision` + `raycast(raycaster, intersections)`——数据源参与相机碰撞的契约 |
| `ITilesRenderer` | `src/ITilesRenderer.ts` | 3DTile 自治渲染器契约（不在 index，子路径导入）；由 3dtile 包的 `TilesRenderer` 实现 |
| `MapObjectAdapter` / `MapMaterialAdapter` | `src/MapObjectAdapter.ts` / `MapMaterialAdapter.ts` | Object3D/material 上的样式绑定（`userData.mapAdapter`），每帧一次 `ensureUpdated`（不在 index，子路径） |
| `TileDataAccessor` 族 | 源内 | 逐 feature 读写瓦片几何（BufferedGeometry*Accessor） |
| 相机动画 | `src/camera/` | `CameraAnimation`、`CameraPanAnimation`、`CameraRotationAnimation`、`CameraKeyTrackAnimation`+`ControlPoint`、`CameraAnimationBuilder`、`FlyToOptions` |
| `MapViewUtils` / `CameraUtils` | `src/Utils.ts` / `src/CameraUtils.ts` | 拾取射线、缩放、姿态解算；焦距时代 API 大量 @deprecated → `CameraUtils` |
| `TextElementsRenderer` | `src/text/` | `placeText/renderText/pickTextElements/addOverlayText` |
| Worker facade | `src/ConcurrentDecoderFacade.ts` 等 | `ConcurrentDecoderFacade/ConcurrentTilerFacade.getTileDecoder/getTiler(scriptUrl, workerCount)`、`WorkerBasedDecoder` |

## 合成层（`src/composing/`，大多不进包 index）

```
MapView
 ├─ mapRenderingManager: IMapRenderingManager（公开只读）
 │    ├─ extends IPassManager { render(); setSize() }
 │    ├─ MapRenderingManager（具体实现）：pass 编排、MSAA、
 │    │    对象注册表 add/removeBloomObject、addOutlineObject、
 │    │    addTranslucentObject/Layer、setDepthReadingFilter(ClassificationType)、
 │    │    readDepth(ndc)、syncPostEffectsToVRM()、antialiasing:"none"|"taa"|"smaa"
 │    └─ viewRenderManager?: IViewRenderManager（VRM 钩子，TSL 节点图）
 ├─ sceneEnvironment: MapViewEnvironment（@internal）
 │    ├─ fog: MapViewFog    ├─ atmosphere: AtmosphereSystem（update/updateOptions/
 │    │                       updateToneMapping/getCurrentDate，云/CSM/镜头光晕）
 │    └─ lights / skyBackground / backgroundDataSource，每帧 update()
 └─ themeManager: MapViewThemeManager（useThemeManager 注入）
```

- VRM 接口 `IViewRenderManager`（`src/composing/vrm/ViewRenderTypes.ts`）：
  `config`（bloom/vignette/ssr/taa/fogLight/colorGradingLUT/toneMapping/clouds）、
  `render(scene,camera)`、`readDepth/readDepthAsync`、`readPickSync(ndc) → {depth,pickId}|null`、
  `getPickedObject(pickId)`、`needsUpdate + onNeedsRender`（宿主须调 `mapView.update()`）。
- `composing/vrm/*` 与 `AtmosphereSystem` **不在包 index**，走子路径
  `@flywave/flywave-mapview/composing/vrm`、`.../composing/AtmosphereSystem`。
  细节见 `postprocessing-vrm.md`。

## 弃用/锐边清单（改动或写示例时避开）

- @deprecated：`focalLength`（→ `CameraUtils`）、`lookAt` 位置参数重载、
  `theme` get/set（→ `setTheme`）、`requestUpdateIfNeeded`（→ `update()`）、
  `MapViewOptions.enableRoadPicking`、`MapAnchor.geoPosition`（→ `anchor`）、
  `TopViewClipPlanesEvaluator`、`TileOffsetUtils`（→ `TileKeyUtils`）、
  `ThemeLoader.loadAsync`（→ `load`）、`Tile.addUserTextElement` 族、
  ~15 个 `MapViewUtils` 焦距/fov 函数。
- @beta：`CameraUtils` 大部分、`lodMinTilePixelSize`、`throttlingEnabled`、
  `VisibleTileSet.maxTilesPerFrame`。
- @internal（导出但非公共语义，共 71 处）：`PickHandler`、`Statistics` 族、
  `TextElement`、`sceneEnvironment`、`imageCache`、`poiManager`、`viewRanges` 等——
  可用但不承诺稳定。
- 公共面引用但未从 index 导出的类型（子路径 `@flywave/flywave-mapview/<file>` 导入，
  包 `exports` 已配 `"./*"`）：`IntersectParams`、`MapObjectAdapter`、`MapMaterialAdapter`、
  `ITilesRenderer`、`PickListener`、`FrustumIntersection`（类；index 只导出 `TileKeyEntry`）、
  `TextElementsRendererOptions`、`AtmosphereSystem`、`IViewRenderManager`。
- `input/flywave-mapview.api.md` 是导出面真值；与 jsdoc 默认值冲突时（如
  `addBackgroundDatasource`）以源码 `MapViewDefaults` 为准并注明存疑。
