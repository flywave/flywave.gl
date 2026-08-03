# render-tests 实现进度（2025-08-03）

## 一、已完成

### 1. 测试基础设施（从零搭建，可复用）

之前 `MBStyleCompatRenderTest` 无法在 karma 中运行（依赖外部 result server、fs 在浏览器不可用、资源 404、worker 无法加载）。已全部修复：

- **karma 接入**：`karma.options.js` 加入 compat 测试文件 + 资源 pattern；新增 `ChromeHeadlessNoSandbox` launcher（SwiftShader WebGL）。
- **资源本地化**：mapbox-gl-js/test/integration 的 tiles/sprites/glyphs/data/image/styles（94M）拷贝到 `test/rendering/integration/`（git 可管理）；所有 `local://` → `/base/@flywave/.../rendering/integration`。
- **进程内解码器**：`MBStyleDataSource` 支持 `decoder?: ITileDecoder` 选项，compat runner 传 `new MBStyleDecoder()` 绕过 worker bundle。
- **测试列表生成**：`scripts/generate-mbstyle-test-index.js` 扫描 render-tests 生成静态 `render-tests-index.ts`（浏览器无法用 fs）。
- **参考图解析**：`setReferenceImageResolver` → 本地 `expected.png`（不再依赖 `/reference-image` server）。
- **筛选**：`KARMA_ARGS="filter=<name>"` 支持按分类运行（多 filter）。
- **polyfill**：url/path-browserify/process 加到 webpack fallback。

运行示例：
```bash
CHROME_BIN=~/.cache/puppeteer/chrome-headless-shell/.../chrome-headless-shell \
KARMA_ARGS="filter=zoom-history/in" \
npx karma start --browsers ChromeHeadlessNoSandbox
```

### 2. 源码 bug 修复（已提交，HEAD 包含）

- **GeoJSON 裸几何归一化**（`MBStyleDecoder.normalizeGeoJson`）：mapbox 测试常用裸 `LineString`/`Polygon`（非 FeatureCollection），原 `GeoJsonDataAdapter.canProcess` 拒绝 → 空 decoded tile。现归一化为 FeatureCollection。
- **相机默认 center**（`MBStyleDataSource.applyCameraSettings`）：style 只有 `zoom` 无 `center` 时原跳过相机设置 → mapview 停在世界角落。现 center 默认 `[0,0]`。
- **legacy `{stops}` 表达式**（`MBExpressionEngine.evaluateLegacyStops` + `MBLayerEvaluator.isExpr`）：旧版 `{base,type,stops}` 对象形式未被识别为表达式 → `line-width` 变 NaN（线条零宽消失）。现按 exponential/interval/categorical 求值。
- **line-width metricUnit='Pixel'**（`MBTileDataEmitter`）：mapbox 线宽是 CSS 像素，SolidLineMaterial 需 `metricUnit:'Pixel'` 才能换算到世界单位，否则线宽被当作米 → 不可见。
- **symbol-z-order**（`MBStyleSymbolPlacement.applyZOrder`）：viewport-y 的 renderOrder 方向修正；auto 在 canOverlap 时等同 viewport-y。

## 二、阻塞点（5 个功能全部无法验证通过）

**根因：`SolidLineMaterial`（flywave-materials）在 headless SwiftShader 环境下完全不渲染线条。**

通过隔离实验确认（在 compat runner 里用 `isolated-render` 诊断）：
- ✅ WebGL 本身工作：手画一个 OrthographicCamera + 三角形 → readPixels 得到绿色。
- ✅ 地图几何正确创建：decoded tile 有 techniques/geometries；tile objects=2；scene 里有 14 个 mesh（含 8 个 solid-line mesh），顶点数=8，材质 color/lineWidth 正确，位置在 RTE 帧 z=-38928068（地图平面，在 near/far 内）。
- ✅ 相机正确：geoCenter=(0,0) zoom=1；rteCam 在原点、forward=(0,0,-1)、near/far 包含地图平面深度。
- ✅ 用同一个 rteCam 在地图平面深度画一个大四边形 → 绿色（说明相机+深度 OK）。
- ✅ **把场景里所有 mesh 换成 `MeshBasicMaterial` 再用 rteCam 渲染 → 全屏绿色（green=4096）**，几何完全可见。
- ❌ **保持原 `SolidLineMaterial`（含或不含 stencilTest）→ 0 个线条像素**。

即：**几何、相机、深度都没问题；唯独 SolidLineMaterial 的自定义 shader（RawShaderMaterial, GLSL 300 es，用 extrusionCoord/tangent/biTangent 做线宽挤出）在 SwiftShader 下不产生可见像素。** 可能原因：shader 的 line-progress/distToEdge 计算在当前几何数据下 discard 了所有片元，或对 SwiftShader 的 GLSL 实现有兼容问题。

这导致**所有依赖线条/符号渲染的测试都是空白白屏**（zoom-history、symbol-z-order、symbol-cross-fade、hillshade、raster-masking 全部 32/32 失败，且 mismatch 数与修复前完全一致——因为画布始终是 clear 色）。

> 注：这不是 5 个功能本身的问题，而是 flywave 渲染引擎在 headless 环境的一个底层阻断。在**真实 GPU 浏览器**里 SolidLineMaterial 很可能正常，届时 5 个功能的验证才能进行。

## 三、盲写功能实现（2025-08-03，待渲染环境验证）

由于 SolidLineMaterial 在 headless 渲染空白，无法用 karma pixel-diff 验证。经授权按 mapbox 源码盲写了功能逻辑，全部通过 typecheck + 259 单元测试。**待真机 GPU 环境验证**。

### 已实现（代码就绪）

| 功能 | 测试 | 实现 | 文件 |
|------|------|------|------|
| **symbol-z-order source/auto** | 11 | viewport-y renderOrder 方向修正；auto 在 canOverlap 时等同 viewport-y；source 保持源序 | `MBStyleSymbolPlacement.applyZOrder` |
| **hillshade-buffer** | 3 | DEM 图像 border/buffer 自动探测（256→buffer0, 258→buffer1, 260→buffer2）；tile UV 映射到 DEM 内部数据区，单像素有限差分采样到 border → 边缘法线正确 | `MBMaterialPatchManager.patchHillshadeMaterial`、`HillshadeTileDataProvider`(_tileSize)、`MBTileDataEmitter`(_hillshadeTileSize) |
| **raster-masking** | 4 | canvas 默认尺寸改 512×512（mapbox 默认，修复 "Image sizes do not match"）；raster-opacity/hue-rotate/fade-duration 已在 `MapRasterMaterial`/`patchRasterMaterial` 实现 | `MBStyleCompatRenderTest`(canvas 默认) |
| **zoom-history** | 2 | line-width 的 legacy `{stops}` 表达式求值（exponential/interval/categorical）；line-width `metricUnit:'Pixel'` 换算世界单位；line-dasharray 按 line-width 倍数缩放（随 zoom 变化） | `MBExpressionEngine.evaluateLegacyStops`、`MBLayerEvaluator.isExpr`、`MBTileDataEmitter`(metricUnit + dash×lw) |

### 部分/待完善

| 功能 | 测试 | 状态 |
|------|------|------|
| **symbol-cross-fade** | 2 | fade 计时已支持（`setFadeDuration(metadata.fadeDuration)`）；但**瓦片级 cross-fade**（缩放时旧 zoom 标签淡出、新 zoom 标签淡入，需保留旧 tile 对象）未实现——这是 mapbox 的 tile cross-fade 机制，较复杂且需要可见渲染才能验证。`zoom-history` 的 dash 跨整数 zoom 的 posA/posB 淡入淡出同理，依赖 SolidLineMaterial 的 dash 渲染（当前 `vCoords.x` 取值疑似不对，需修） |

### 顺带修复的真实 bug（与功能无关，但阻碍所有测试）

- 裸 GeoJSON（`LineString`/`Polygon` 非 FeatureCollection）归一化 → 否则 decoded tile 为空
- style 只有 zoom 无 center 时相机默认 `[0,0]` → 否则 mapview 停在世界角落

## 四、后续建议

1. **优先在真机 GPU 浏览器验证**：`KARMA_ARGS="filter=zoom-history/in" pnpm karma-browser`。若线条能渲染，则上述盲写实现可逐项用 pixel-diff 校验、修正。
2. 若真机也空白 → SolidLineMaterial 与 three@0.178 兼容性问题，需查 `vCoords` varying 的 along-line 取值（当前 dash 用 `vCoords.x` 疑似应为 along-line 进度）。
3. symbol-cross-fade 的 tile cross-fade 机制需在可见渲染后实现（保留旧 zoom 的 symbol 对象做淡出）。

