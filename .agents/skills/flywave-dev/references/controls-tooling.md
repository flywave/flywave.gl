# 控件、React 封装、模型栈与 CLI 工具

交互层（相机/绘制/测量）、React 接入、glTF/泼溅模型栈、构建与图集 CLI。
引擎本体看 `api-surface.md`；数据源看 `datasource-guide.md`。

## flywave-map-controls（相机控制器）

- `MapControls(mapView, options?)`（`src/MapControls.ts`，extends `BaseMapControls`）：
  平移/缩放/俯仰/旋转 + 惯性；`animatePan/animateZoom/animateTilt/animateHeading`、
  `setHeading/setTilt/setZoomLevel`、`toggleTilt`、`pickPoint(x,y)`、`destroy()`。
  按 `mapView.projection.type` 自动选 `PlanarCameraTransform`（文件名拼写是
  `PlanerCameraTransform.ts`）或 `EllipsoidCameraTransform`。
- 选项 `BaseMapControlsOptions {zoomEnabled, tiltEnabled, maxTiltAngle,
  pivotIndicator?: PivotIndicatorOptions|boolean}`（默认显示枢轴点）。
  事件 `EventNames.Update|BeginInteraction|EndInteraction`（"update"/"begin-interaction"/
  "end-interaction"）；`BeginInteraction` 自动 `mapView.stopCameraAnimation()`。
- 相机碰撞两级射线（`src/MapControls.ts` 的 `rayCastWorld`）：① 数据源 `raycast`
  （仅 `enableCameraCollision` 的源）② `mapView.getWorldPositionAt` GPU 深度兜底；
  滚轮缩放有碰撞锁（光标 ±2px 内复用锁定点，免重复 raycast）。
- `MapControlsUI(controls, opts)`（`src/MapControlsUI.ts`）：DOM 面板——zoom 显示/输入、
  mercator↔球面切换、geoCenter 显示、截图按钮。**截图按钮默认开启**；
  `ScreenshotConfig {width,height,quality,filename}` 支持 `{timestamp}/{width}/{height}` 占位。
- `MapThumbnailGenerator`（`src/MapThumbnailGenerator.ts`）：`generateThumbnailDataURL()`
  ——**临时改画布尺寸 + `renderSync()` + 硬编码 setTimeout(500)** 再还原，会有闪烁与时序脆弱。
- 其他：`MouseCursorManager`（内联 SVG 光标）、`PivotIndicator`（canvas 需有 parentElement）、
  `LongPressHandler(element, onLongPress, onTap?)`（timeout=500/moveThreshold=5 是公开字段）。
- 坑：控件内部鼠标坐标被画布尺寸翻转；`getWorldPositionAt` 需要真实 screen 坐标——
  只有 `pickPoint` 转换正确。右键旋转是 Google Earth 式：按下时一次 CPU 射线锁定枢轴。

## flywave-draw-controls（绘制/测量）

- 构造都是 `(mapView: MapView, mapControls: MapControls)`；内部挂 `rootObject` 到
  `mapView.scene` 并每帧 `Render` 事件里反向平移补偿相机（RTE 式）。绘制中强制
  `mapControls.enabled=false`。
- `MapDrawControls`（`src/MapDrawControls.ts`）：`setMode/getMode`、`removeObject`、
  `clearAll`、`getObjects`、`addObjects`、`exportToGeoJSON`、`undo`、`dispose`。
  `DrawMode = NONE|POINT|LINE|POLYGON|EDIT|DELETE`。
- 事件 `DrawEventNames`（`src/DrawEventNames.ts`）：`drawstart/drawend/objectadded/
  objectremoved/objectselected/objectmodified/objectmodifiedend/modechanged`
  （`DrawEvent{type, object?, mode?}`）。
- `GeoJSONDrawControls`（`src/GeoJSONDrawControls.ts`）：`addGeoJSON/updateGeoJSON/
  createObjectsFromGeoJSON`（FeatureCollection|Feature|裸 Geometry）。
- `MeasureToolControls`（`src/MeasureToolControls.ts`）：`toggleMeasureMode`、
  `createMeasureLine(vertices)`、`getMeasureLineDistance`、`MeasureLine.formatDistance`；
  距离标签是 `flywave-text-canvas` 的 `TextElement`。
- 顶点手柄：`VertexHandle`/`HeightHandle`（`VertexHandleOptions{mapView, windowHandler,
  mapControls?, colors, size, draggable, autoHeightHandle}`；事件 dragStart/drag/dragWorld/
  dragEnd/heightChange/…）；`HeightAdjustManager.attachToPoint()` 把手柄对齐地表法线
  （球面）或 +Z（平面）。
- 坑：5px `DRAG_THRESHOLD` 区分点击/拖拽；`PointObject` 有纹理缓存但
  `clearPointTextureCache` 未从 index 导出；`DrawableObject`/`HeightAdjustManager`
  等深路径符号走子路径导入。

## flywave-inspector（调试面板）

- `ModularMapViewMonitor(mapView, parentGui?)`（`src/monitor/ModularMapViewMonitor.ts`，
  推荐）——19 个可混搭模块：Performance（FPS）、Camera、Rendering（draw calls）、
  Memory、Tile、EnhancedTile、VisibleTileSet、DataSource、Text、Animation、Environment、
  Atmosphere、ToneMapping、PostProcessing、Fog、Elevation、FrustumCulling 等；
  `open/close/dispose/getGUI` + 逐 folder getter。读 `PerformanceStatistics.instance`。
- `MapViewMonitor` 是旧一体式面板。两者默认 `gui.close()`。README 提到的
  "GroundModificationModule" 不存在。依赖 `dat.gui`。

## flywave-react（React 封装）

- `MapProvider`（`src/MapProvider.tsx`）+ `MapCanvas` + hooks：
  `useMap(): MapView|null`、`useMapContext`、`useMapControls`、`useMapEffect(effect,deps)`、
  `hooks/advanced.ts` 的 `useMapZoom/useMapCamera/useDataSource/useMapStatistics/
  useMapEvents/useMapTheme/useMapPicking`。
- `MapProviderProps = MapProviderOptions & MapCanvasProps`：`{theme?, decoderUrl?,
  enableControls?=true, enableStatistics?=false, decoderCount?=1}` + `onMapInitialized/
  onMapDisposed/onResize`。默认 `theme:"resources/tilezen_base.json"`、
  `decoderUrl:"./decoder.bundle.js"`；`enableControls` 时自动 `new MapControls(mapView)`。
- 坑：`src/hooks/useMap.ts` 也导出 `useMap` 但 **index 不 re-export**（真正的在
  `MapProvider.tsx`）；`PATH_ALIASES.md` 的 tsconfig 别名仅工作区开发用；
  react/react-dom 是 peerDeps。

## 模型栈（gltf / draco / splats）

- **flywave-gltf**：`GLTFLoader`/`loadGLTF`（`GLTFLoaderOptions{uri, gltf, draco:{decompress}}`，
  默认 normalize/loadBuffers/loadImages/decompressMeshes=true）、`GLBLoader`/`loadGLB`、
  `GLTFWriter`/`GLBWriter`（**只编码 GLB 二进制**，不写 JSON gltf）、
  `createThreeSceneFromGLTF(gltf, ConversionOptions)` → `{scene, animations, nodes, textures}`
  （3DTile 瓦片解析用的就是它）、`GLTFScenegraph`、`postProcessGLTF`。
  支持 KHR_draco/meshopt/basisu、EXT_texture_webp、EXT_gaussian_splatting（spz）、
  EXT_structural_metadata/EXT_mesh_features（3D Tiles 元数据，带 create*Builder）。
  加载时这些扩展会从解析结果中剥离（`options.gltf.excludeExtensions` 可关）。
  meshopt/webp 内部符号不在 index 导出——用子路径。
- **flywave-draco**：`DracoLoader`/`loadDraco`、`DracoWriter`（`method:
  MESH_EDGEBREAKER|MESH_SEQUENTIAL`、`speed:[enc,dec]`、逐属性 quantization、pointcloud 模式）、
  worker 变体 `DracoWorkerLoader`/`DracoWriterWorker`。`DracoLoaderOptions.workerUrl`
  默认 unpkg——离线/FLYWAVE_BASE_URL 部署必须覆盖（见 `asset-paths.md`）；
  `decoderType`/`libraryPath` @deprecated。
- **flywave-splats**：高斯泼溅渲染原语。`SplatMesh extends Mesh`（`updateData/
  updateDataFromGeometry`、`shDegree`、逐泼溅 `raycast → SplatIntersection`）、
  `SplatGeometry`（实例化 quad）、`SplatMaterial`（TSL 泼溅着色器）、`SplatTree`
  （排序/LOD 层级，含 worker 传输类型）。**不是 DataSource**：经 glTF
  `EXT_gaussian_splatting` 扩展 → `createSplatMesh()` → 通常由 3D Tiles 内容送达。

## CLI / 构建工具

- **flywave-atlas-tools**：两个 CLI（package.json bin）——
  `flywave-atlas-generator -i <glob> -o <basename> [-p padding -w -h -m -v -j -c
  processConfig.json]`（输出 `.png`+`.json` 两文件，**不要给 --out 带 .png**）与
  `flywave-sprites-generator`（导出散图目录）。程序化 API：
  `generateSprites(options)`/`generateSpritesAtlas(AtlasOptions)`（`src/AtlasGenerator.ts`）。
  预处理步骤（processConfig）：InvertColor/Grayscale/Colorize/AddBackground/AddForeground/
  MaskImage/BlendImages/CombineImages；混合模式 Alpha/Multiply/Screen/Overlay 等。
- **flywave-theme-tools**：单一 CLI `flywave-theme-optimizer -i <glob> [-o ./resources -m]`——
  把 theme 的 `extends` 链内联成单 JSON 省请求。若存在 `unified-definitions/` 兄弟文件，
  会拆出 `<name>private.json` + 公开 FlatTheme（遗留兼容机制）。
- **flywave-webpack-utils**（private，工作区内部）：`addWebpackConfig(config?,
  flywaveConfig?)`（模块 `scripts/WebpackConfig`）——合并浏览器包 + decoder worker 包 +
  HTML 模板 + 资源拷贝。`FlywaveWebpackConfig{mainEntry, decoderEntry, htmlTemplate,
  themePath, fontResourcesPath, threeDracoPath, projectRoot, outputPath, devServerPort,
  enableTsconfigPaths, additionalAssets...}`。
- **flywave-topo**：大型计算几何内核（衍生自 Bentley iTwin.js core-geometry，命名沿用
  `XYZ`/`Angle`/`AngleSweep`）。能力域：bspline（NURBS/拟合）、curve（求交/圆角）、
  geometry3d/4d、numerics（带状求解器/Newton）、polyface（网格构建/多裁剪）、
  primitives、solid（扫掠/解析实体）、topology（半边图/链合并/三角化）、clipping
  （布尔裁剪树）、serialization（bgfb 平坦缓冲读写）、render（与 three 无关的图形构建器）。
  纯库无 MapView 耦合；语义参考上游 iTwin 文档。
- **flywave-test-utils**：见 `testing-workflow.md`。核心是 IBCT 图像回归：
  `RenderingTestHelper.assertCanvasMatchesReference(canvas, name, TestOptions{maxMismatchedPixels,
  threshold})`、`RenderingTestResultCli`（`html-report`/`approve`/`save-reference`）。
  缺参考图时测试**跳过**而非失败。

## 示例库（flywave-examples）

- 结构：`src/<name>/index.ts`（入口：MapView → MapControls → 数据源 → `beginAnimation()`
  固定流程）+ `config.ts` + `thumbnail.png`。webpack glob 自动发现（`src/*/index.ts`），
  无需注册；`FILTER_EXAMPLE=<name> pnpm --filter @flywave/flywave-examples start` 单跑。
- `config.ts` 字段：`{title, titleZh, description, descriptionZh, thumbnail, code, order}`；
  `code` 全集在 `src/example-categories.ts`（8 分类：getting-started、3dtiles-model-rendering、
  terrain-elevation、advanced-rendering、text-display、third-party-integration、
  threejs-integration、real-world-applications）。模板：`assets/example-template/`。
- 已知不一致：部分 `config.ts` 用 `export default`，模板用 `export const config`——
  加示例时二选一；约 12 个目录无 `config.ts`（cloud-*、terrain-tools、demo-* 等）不进分类；
  `scripts/generate-example-index.js` 读的是 `config.json`（与 config.ts 不同步）。
- 辅助：`src/common-webgl-debug.ts` 的 `shouldForceWebGL`（强制 WebGL2 调试）、
  `src/token-config.ts`（API token）；`scripts/` 有 mapbox-terrain/cesium-3dtile 下载器。
