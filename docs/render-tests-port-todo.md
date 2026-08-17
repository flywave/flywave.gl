# Render-Tests 移植 TODO（特性清单 + 实现状态）

> 本文依据 `@flywave/flywave-mbstyle-datasource/test/render-tests/` 的**全量 270 个分类 / 3031 个用例**，逐项对照 `@flywave/flywave-mbstyle-datasource/src/` 源码（`MBTileDataEmitter.ts` / `MBMaterialPatchManager.ts` / `MBStyleSymbolPlacement.ts` / `MBStyleDataSource.ts` / `MBEnvironmentManager.ts` / `MBExpressionEngine.ts` / `MBFilterCompiler.ts` / `PlacementEngine.ts` / `TextShaping.ts` 等）做实现状态核验后整理而成。
>
> **状态结论来源**：直接 grep/read 源码，标注 `文件:行` 证据；不沿用既有文档结论。审计日期 2026-08-07。
>
> **最重要的新发现（决定全部状态判定）**：审计时发现渲染管线存在 5 个系统级缺陷，导致 `MBMaterialPatchManager` 与 `MBStyleSymbolPlacement` 两条增强路径**整体不可达**——详见 §1。所有"仅存在于 patcher / symbol-placement 中"的特性，实际**不会**产生视觉效果。
>
> **2026-08-09 更新**：§1 的 S1–S5 已全部修复（见 §8），自动化管道已可跑通 3026 个用例；`render-tests-index.ts` 已重新生成全量索引并通过 tsc。修复后 §2 中标注 🔧 的分类进入"待像素级验证"状态。
>
> **2026-08-12 更新**：完成**首次全量实测基线**（3031 用例，Edge 151 headless + SwiftShader）：2775 个上报结果中 **182 通过（6.56%）**，455 个失败差异 ≤600px（近失），256 个因浏览器崩溃/超时未上报。实测远低于 §3 的 50–60% 估算，text/line/raster/fog/skybox/lighting 等系整域全红——详见 §10。
>
> **2026-08-17 更新**：§14 冻结后的 5 个 commit（fog 模型 / skybox 接线 / 3D-lights 修正 ×2 / heatmap 双 pass 通道对齐）完成 G7 全量验收（§12.27）：lighting-3d-mode 2→**10 通过**、skybox 0→**1**、fog 0 通过但近失 3（space-color-use-theme 39 第一梯队）、heatmap 仍 0（data-expression 308 近失）。§14 的 F12 已勾除、F3 状态已更新。
>
> **2026-08-17 更新（F3 落地）**：heatmap 双 pass 对齐 mgl 全链（§12.28），**0/18 → 15/18**（opacity/intensity/weight 全绿、color 2/2、radius 4/7）。§14 F3 完成，仅剩 antimeridian / pitch30 / projected 三个单测。

---

## 0. 状态图例

| 标记 | 含义 |
|------|------|
| ✅ | 端到端生效：emitter 产出 technique prop → 原生 `TileGeometryCreator`/`SolidLineMaterial`/`CirclePointsMaterial`/`TextElementsRenderer`/环境管理器 直接消费 |
| ⚠️ | 部分生效：仅常量值生效 / 依赖 patcher 但 patcher 不可达 / 数据驱动值丢失 / 近似实现 |
| ❌ | 未实现：无消费者，或仅存在于不可达的死代码路径（patcher / symbol-placement），或无源码支持 |
| 🔧 | 由 §1 系统级缺陷导致（`m_tiles` 不可达 / filter 误路由 / technique 缓存 / feature-state 键不匹配 / setStyle URL 崩溃），修复后状态可立即提升 |

---

## 1. 关键系统级阻塞（P0，最先修复）

### S1. `m_tiles` 幻影属性 → patcher 与 symbol-placement 整体不可达（最高优先级）

**✅ 已修复（2026-08-09）**：在 `MBStyleDataSource` 新增 `getDecodedTiles()`，从 `mapView.m_visibleTiles.m_dataSourceCache`（`DataSourceCache`，键 = mortonCode+offset+dataSource，LRUCache.forEach 迭代）过滤本 datasource 的 `Tile.objects`；`MBMaterialPatchManager.patchTileMaterials` / `MBStyleSymbolPlacement.collectSymbols` / `drawTileBoundaries` 三处改用该接口。验证：fill-pattern 系列由空白/纯色变为带图案渲染（literal 仅 3842/262144 px 差异），circle-translate-anchor 58px、text-field/literal 113px，patcher 通路已恢复。

**证据**：全仓库 `@flywave/` 内 `m_tiles` 只有 3 处**读取**、零处赋值：

- `src/MBStyleSymbolPlacement.ts:267` — `const tiles = ds2.m_tiles as Map | undefined;`
- `src/MBMaterialPatchManager.ts:49` — `const tiles = tds.m_tiles as Map | undefined;`
- `src/MBStyleDataSource.ts:1055` — `const tiles = ds.m_tiles as Map | undefined;`

**影响**：`AfterRender` 钩子（`MBStyleDataSource.ts:764-775`）调用 `patcher.patchTileMaterials()` 与 `placement.run()`，二者内部 `if (!tiles) continue;` 直接跳过 → **整个 `MBMaterialPatchManager` 的 shader 增强（pattern/translate/dasharray/gradient/join/border/blur/emissive/trim-offset/extrusion 渐变与地形贴底/heatmap/hillshade/raster 色彩调整/building 立面/护栏/icon halo/icon-text-fit）与整个 `MBStyleSymbolPlacement`（碰撞/offsets/旋转/z-order/跨瓦片 fade）全部不执行**。

**正确瓦片来源**：flywave-mapview 中瓦片缓存于 `MapView.m_visibleTiles.m_dataSourceCache`（`DataSourceCache`，`VisibleTileSet.ts:1272` 以 `mortonCode+offset+dataSource` 键存取；`Tile.objects` 为渲染对象，`Tile.ts:174`）。修补需在 `MBMaterialPatchManager`/`MBStyleSymbolPlacement` 中改用 `ds.m_mapView.m_visibleTiles.m_dataSourceCache` 遍历（或为 `DataSource` 增加公开迭代接口）。

**影响分类**：fill/line/circle/extrusion 的 translate/pattern/join/cap/border/blur/emissive/trim、line-gradient、multi-element dasharray、heatmap、hillshade、raster 色彩调整、building 立面、guardrails、icon-halo/icon-text-fit/icon-anchor/icon-offset、text-offset/rotate/anchor/translate/variable-anchor/keep-upright/rotation/pitch-alignment、symbol-z-order/sort-key/spacing/placement-line、collision debug 等约 **40+ 分类**。修复 S1 后这些状态由 ❌ 一次性提升到"待像素级验证"。

### S2. `isLegacyFilter` 只判算子名 → 表达式形式 filter 被误路由

**✅ 已修复（2026-08-09）**：`isLegacyFilter` 改为——原子算子（has/!has/==/!=/>/>=/</<=/in/!in）仅当 `filter[1]` 为字符串（legacy 属性键形式）才走 legacy；`all/any/none/within/!within` 保持 legacy 编译（其内部递归 `compile()` 已能正确分派表达式子 filter）。同时补上 `distance-from-center` 表达式（haversine 距离，center 经 decoder.configure 传入，`MBExpressionEngine` + `MBLayerEvaluator` + `MBStyleDecoder` 全链路）。验证：`['==',['get','class'],'road']` / `['in',['get','class'],['literal',[...]]]` 表达式形式正确求值，legacy 形式仍正确。

**证据**：`MBFilterCompiler.ts:21-33` `isLegacyFilter` 仅检查 `filter[0]` 是否命中 legacy 算子集合；表达式形式 `["==", ["get","x"], "y"]` / `["<", ["distance-from-center"], 1000]` 被当作 legacy filter 交给 `compileLegacy`（`:51-106`），把 `filter[1]=["get","x"]` 当作**字符串属性名** → `properties[["get","x"]]` 恒为 undefined → 全部要素被过滤。

**影响**：`filter`（equality/in 表达式形式）、`dynamic-filter`（`distance-from-center`/`pitch`）、`distance`（filter 内）、`is-supported-script`、`linear-filter-opacity-edge` 以及 appearance/feature-state 的表达式条件。修复：`isLegacyFilter` 需判断 `filter[1]` 是否为字符串（legacy 形式）而非数组（表达式形式）。

### S3. technique 按 layer.id 单例缓存 → 数据驱动值丢失

**✅ 已修复（2026-08-09）**：`getOrCreateTechniqueIndex` 的缓存键追加 `evaluatedCacheKey(layer)`（`JSON.stringify(paint)|JSON.stringify(layout)` 的稳定序列化），数据驱动属性（circle-color/radius、line-width、fill-extrusion-height、icon/text-size 等）按要素求值结果生成独立 technique。验证：circle-radius/property-function 144px、zoom-and-property-function 22px（修复前仅用首要素值）。

**证据**：`MBTileDataEmitter.ts:502-539` `getOrCreateTechniqueIndex` 每个 layer.id 缓存一个 technique，并把**第一个 feature** 的求值结果写入 `technique._paint`。所有 `property-function` / `zoom-and-property-function` / `["get",...]` 数据驱动用例只使用首要素值。

**影响**：circle-radius/color、line-color/width、fill-extrusion-height/base/color、heatmap-radius/weight、text-size、icon-size 等全部数据驱动分类（约 30+ 分类）。修复：technique 改为按（layer + 要素属性值）分组，或在 decoder 侧按需展开多个 technique。

### S4. feature-state / remove-feature-state 键不匹配

**✅ 已修复（2026-08-09）**：`MBStyleDataSource.setFeatureState/removeFeatureState` 把 mapbox 描述符 `{source,sourceLayer,id}` 归一化为特征 `id` 存储，`removeFeatureState` 同时删除 decoder 端状态并重新 configure；decoder 的 `getFeatureState` 增加 number/string 双表示兜底查找。验证：feature-state/change-brightness 仅 50px、composite-expression 36px（修复前状态从不生效）。

**证据**：runner 以 mapbox 描述符 `{source,sourceLayer,id}` 作键传入 `MBStyleDataSource.setFeatureState`（`MBStyleCompatRenderTest.ts:170-175`），源码原样存储（`MBStyleDataSource.ts:1242-1259`），但 decoder 以解码要素 id 查表（`MBStyleDecoder.ts:67-70`）→ `["feature-state"]`（`MBExpressionEngine.ts:459-462`）恒为 null；remove 也从不重发状态到 decoder。

**影响**：`feature-state`(25)、`remove-feature-state`(3)、featuresets(1) 及依赖 feature-state 的 appearance 条件。

### S5. `setStyle` 对 URL 字符串参数直接 `JSON.parse` 崩溃

**✅ 已修复（2026-08-09）**：compat runner 的 `setStyle` 区分内联 JSON（以 `{` 开头，直接 parse）与 URL/local:// 路径（先 `localizeUrl` + fetch 再 parse，失败回退空样式）；`reloadStyle()` 照旧触发全量刷新。验证：real-world 系列（bangkok/chicago/sanfrancisco 等）不再崩溃，能加载样式并渲染（剩余差异为 sprite/tile 资源与 SwiftShader 精度问题）。

**证据**：`MBStyleCompatRenderTest.ts:159-168` 对 `local://styles/…json` 字符串参数 `JSON.parse(args[0])` 抛异常（try/catch 吞掉后 style 未应用）。

**影响**：`real-world`(9)、`basic-v9`/`bright-v9`/`satellite-v9`(5)、`hd-sd-transition`(11)、`mixed-zoom`(1) 等以 URL 切换样式的用例直接失败。修复：URL 参数需先 fetch/本地化再 parse。

---

## 2. 特性 / 功能清单与实现状态（按层）

> 用例数 = 该分类下含 `style.json` 的目录数（实测计数，与 `compatible-tests.txt` 无关）。

### 2.1 Background 层（29 用例）

| 分类 | 用例 | 状态 | 说明 / 证据 |
|------|------|------|------------|
| background-color | 6 | ✅ | `MBStyleDataSource.ts:1282-1299` → `mapView.clearColor` |
| background-opacity | 3 | ✅ | 同上 → `clearAlpha`；pattern 路径 `MBEnvironmentManager.ts:380-381` |
| background-pattern | 13 | ✅ | `applyBackgroundPattern:336-414` 全屏平铺 sprite 子矩形 |
| background-pitch-alignment | 5 | ✅ | `:391-411` viewport=billboard / map=view-matrix |
| background-visibility | 2 | ❌ | `visibility:"none"` 无消费者，仍渲染 |

### 2.2 Fill 层（~46 用例）

| 分类 | 用例 | 状态 | 说明 / 证据 |
|------|------|------|------------|
| fill-color | 8 | ✅ | technique.color |
| fill-opacity | 9 | ✅ | technique.opacity |
| fill-outline-color | 8 | 🔧 | patcher `patchFillMaterial:467,532-547`，S1 不可达 |
| fill-pattern | 15 | 🔧 | emitter `:297-300` → patcher `:1544-1589`，S1 |
| fill-pattern-cross-fade | 4 | 🔧 | 同 pattern，S1 |
| fill-translate | 3 | 🔧 | patcher `:466,520-530`，S1 |
| fill-translate-anchor | 2 | 🔧 | patcher `resolveTranslate:131-141`，S1 |
| fill-antialias | 1 | ❌ | 仅死代码 `materials/MapFillMaterial.ts:124` |
| fill-sort-key | 2 | ✅ | emitter `:271` 分组排序 |
| fill-visibility | 2 | ✅ | `MBLayerEvaluator.ts:443` + emitter `:309` |
| fill-z-offset | 4 | ❌ | emitter `resolveZOffset:253` 算出 `m_currentZOffset` 后被丢弃（`push(w.x,w.y,0)` `:593`）；仅 `fill-elevation-reference`→`_hdElevation`（`MBMaterialPatchManager.ts:498-514`，S1）能抬升 |
| fill-limit-number-holes | 1 | ✅ | emitter `:560-564` 截断内环 |
| fill-emissive-strength | — | 🔧 | patcher `patchFillMaterial`，S1 |

### 2.3 Line 层（~280 用例，含 elevated-line）

> **共性结论**：`line-color/width/opacity/dash(2 元素)/pitch` 走 native 通道生效；其余（blur/offset/join/cap/border/gradient/pattern/trim/translate/emissive/multi-dash）依赖 patcher → **S1 不可达**。

| 分类 | 用例 | 状态 | 说明 / 证据 |
|------|------|------|------------|
| line-color | 5 | ✅ | technique.lineColor native |
| line-width | 18 | ✅ | emitter `:315,659-675` JS 预挤出 + native SolidLineMaterial |
| line-opacity | 7 | ✅ | technique.opacity |
| line-blur | 5 | ❌ | 无消费者（SolidLineMaterial 无 blur uniform） |
| line-offset | 5 | ❌ | emitter 不产 offset，patcher 无 |
| line-gap-width | 5 | 🔧 | native 需 `secondaryWidth`（emitter 不产）；patcher `:646` 设的 `material.secondaryWidth` 不存在且不可达 |
| line-gradient | 14 | 🔧 | patcher `:702-719` buildGradientTexture，S1 |
| line-dasharray | 30 | ⚠️ | 2 元素经 native `USE_DASHED_LINE`（`DecodedTileHelpers.ts:526-530`）✅；>2 元素 patcher `:779-812`，S1 不可达 |
| line-cap | 4 | 🔧 | patcher `:608-617` `material.caps`，S1 |
| line-join | 11 | 🔧 | patcher `:619-644`（无 `setJoinType`，写死 define），S1 |
| line-pattern | 20 | 🔧 | patcher `:720-739`，S1 |
| line-pattern-cross-fade | 5 | 🔧 | 同 pattern，S1 |
| line-pattern-trim-offset | 18 | 🔧 | patcher `:593,682-689`，S1 |
| line-trim-offset | 18 | 🔧 | 同，S1 |
| line-translate | 4 | 🔧 | patcher `:691-701`，S1 |
| line-translate-anchor | 3 | 🔧 | `resolveTranslate:584-587`，S1 |
| line-pitch | 5 | ✅ | 相机 pitch 渲染（native 3D） |
| line-sort-key | 2 | ✅ | emitter `:272,812-814` |
| line-visibility | 2 | ✅ | `MBLayerEvaluator.ts:443` |
| line-border | 13 | 🔧 | patcher `:652-660` `outlineWidth/Color`（emitter 不产 `technique.outlineWidth`，native define 未编译），S1 |
| line-border-gradient | 4 | ❌ | evaluator 存 raw（`MBLayerEvaluator.ts:458`），无 shader 消费者 |
| line-blend-mode | 6 | 🔧 | patcher `:597-606` `material.blending`，S1 |
| line-emissive-strength | 3 | 🔧 | patcher `:740-750`，S1 |
| line-width-unit | 6 | ⚠️ | `meters` 时 patcher `:559-576` 缩放（S1 不可达）；native 硬编码 `metricUnit:'Pixel'`（emitter `:318`）→ meters 语义错误 |
| line-triangulation | 2 | ⚠️ | 无属性消费者；经预挤出 ribbon + SolidLine 近似 |

**elevated-line-\***（21 子类，~200 用例）：z 抬升部分生效（`resolveZOffset:253` + `:646-650` 顶点保 z + `_hdElevation` guardrails），但**每个属性继承对应 line-\* 状态**：`elevated-line-width/color/opacity/cap/pitch/visibility/sort-key` ✅ 或 ⚠️；`elevated-line-blur/offset` ❌；`elevated-line-join/border/gap-width/dasharray/gradient/pattern/pattern-trim-offset/trim-offset/translate/translate-anchor` 🔧（S1）。`elevated-line-triangulation` ⚠️。

### 2.4 Circle 层（~64 用例）

| 分类 | 用例 | 状态 | 说明 / 证据 |
|------|------|------|------------|
| circle-color | 5 | ⚠️ | emitter `:361`；常量 OK，数据驱动丢值（S3） |
| circle-radius | 7 | ⚠️ | emitter `:363` size；数据驱动丢值（S3） |
| circle-blur | 8 | ❌ | 不产；native `CirclePointsMaterial` 无 blur；`MapCircleMaterial` 死代码 |
| circle-opacity | 6 | ✅ | technique.opacity |
| circle-stroke-color | 5 | ❌ | 无消费者 |
| circle-stroke-opacity | 6 | ❌ | 无消费者 |
| circle-stroke-width | 5 | ❌ | 无消费者 |
| circle-pitch-scale | 3 | 🔧 | patcher `:831-837` sizeAttenuation，S1（native shader 也不消费） |
| circle-pitch-alignment | 4 | 🔧 | 同，S1 |
| circle-translate | 3 | 🔧 | patcher `:839-847` 设 `uMBTranslate` 但不注入 shader 代码且 S1 不可达 |
| circle-translate-anchor | 2 | 🔧 | 同 translate，S1 |
| circle-sort-key | 3 | ✅ | emitter `:269-276` |
| circle-geometry | 6 | ⚠️ | point/multipoint ✅；line/poly 被 `GEOMETRY_TYPE_MAP.circle=['point']`（`MBStyleSpec.ts:373`）过滤 → 4/6 空白 |
| circle-camera-orthographic-projection | 1 | ❌ | 无正交相机 |

### 2.5 Symbol-Icon 层（~150 用例）

> **共性**：icon-image/size 经 native PoiBuilder 生效；其余 offset/anchor/text-fit/rotate/translate/halo/rotation/pitch 全部依赖 `MBStyleSymbolPlacement.applyOffsets/applyRotationAlignment` 或 `patchIconObject` → **S1 不可达**。

| 分类 | 用例 | 状态 | 说明 / 证据 |
|------|------|------|------------|
| icon-image | 16 | ✅ | technique.imageTexture → PoiBuilder `getImageTexture`（`MBStyleDataSource.ts:1076-1110`） |
| icon-size | 18 | ✅ | technique.iconScale → `PoiRenderer.ts:737`；数据驱动丢值（S3） |
| icon-color | 5 | 🔧 | emitter 设 `color`，但 PoiBuilder 读 `iconColor`；SDF 染色 `patchIconObject:1204-1232` 不可达 |
| icon-opacity | 9 | ⚠️ | technique.opacity 设置，无 PoiRenderer 直接读取 |
| icon-rotate | 3 | 🔧 | 仅死路径 `MBStyleSymbolPlacement.ts:193`（且测试放 layout，代码读 paint） |
| icon-offset | 3 | 🔧 | 死路径 `applyOffsets`；无 `iconXOffset/YOffset` |
| icon-anchor | 11 | 🔧 | 死路径 `applyOffsets:507-526` |
| icon-text-fit | 44 | 🔧 | `applyIconTextFit`（`MBMaterialPatchManager.ts:100-121`）不可达 |
| icon-translate | 3 | 🔧 | 死路径 |
| icon-translate-anchor | 2 | 🔧 | 死路径 |
| icon-pitch-alignment | 4 | 🔧 | 死路径 `applyRotationAlignment` |
| icon-rotation-alignment | 6 | 🔧 | 死路径 |
| icon-halo-color | 7 | 🔧 | SDF halo shader `patchIconObject:1208-1231` 不可达 |
| icon-halo-width | 4 | 🔧 | 同 |
| icon-halo-blur | 5 | 🔧 | 同 |
| icon-visibility | 2 | ✅ | visibility → enabled=false（emitter `:381`） |
| icon-pitch-scaling | 2 | ❌ | 无消费者 |
| icon-pixelratio-mismatch | 1 | ❌ | 无 pixelRatio 缩放 |
| icon-no-cross-source-collision | 1 | ❌ | 无跨源碰撞 |
| icon-secondary-coords-uint16 | 1 | ❌ | icon-image 数组 + cross-fade 不支持 |

### 2.6 Symbol-Text 层（~273 用例）

> **共性**：text-field(token)/size/color/opacity/font/visibility 经 native `TextElementsRenderer`/`TextStyleCache` 生效（emitter 产 `technique.size/color/opacity/fontName`）；wrap/anchor/justify/letterSpacing/lineHeight/offset/rotate/translate/variable-anchor/pitch/rotation/keep-upright 只写入 `_shaped` 或死路径 → **视觉无效**（S1）。

| 分类 | 用例 | 状态 | 说明 / 证据 |
|------|------|------|------------|
| text-field | 23 | ⚠️ | token/literal/property-function ✅；`format` 仅字符串拼接（`MBExpressionEngine.ts:471-495`），**图片段丢弃**、font-scale/color 覆盖跳过；formatted-images ❌ |
| text-size | 13 | ✅ | technique.size → TextStyleCache；数据驱动丢值（S3） |
| text-color | 9 | ✅ | technique.color；数据驱动丢值（S3） |
| text-halo-color | 5 | ❌ | 仅默认值，无 technique halo prop |
| text-halo-width | 4 | ❌ | 同 |
| text-halo-blur | 4 | ❌ | 同 |
| text-opacity | 4 | ✅ | technique.opacity |
| text-transform | 3 | ✅ | `applyTextTransform`（`TextShaping.ts:161`）；'auto' 不支持 |
| text-letter-spacing | 5 | ⚠️ | 传 shapeText 但不映射 `technique.tracking` → 无视觉效果 |
| text-line-height | 2 | ⚠️ | 仅 shapeText，无 `technique.leading` |
| text-max-width | 8 | ⚠️ | wrapText 仅写 `_shaped`，renderer 不 wrap |
| text-max-angle | 2 | 🔧 | getLineAnchors maxAngle，仅死路径 `MBStyleSymbolPlacement.ts:296` |
| text-anchor | 11 | ⚠️ | `getAnchorOffset`（`TextShaping.ts:386`）从不调用 |
| text-justify | 4 | ⚠️ | `getJustifyOffset`（`:350`）仅影响 `_shaped` |
| text-rotate | 8 | 🔧 | 死路径 `MBStyleSymbolPlacement.ts:206-211`；`technique.rotation` 不产 |
| text-offset | 20 | 🔧 | 死路径 `applyOffsets:461-499` |
| text-radial-offset | 1 | 🔧 | 仅死 `PlacementEngine.ts:117` |
| text-translate | 3 | 🔧 | 死路径 `applyOffsets` |
| text-translate-anchor | 2 | 🔧 | 同 |
| text-pitch-alignment | 12 | 🔧 | 死路径 `applyRotationAlignment:247-250` |
| text-rotation-alignment | 6 | 🔧 | 死路径 |
| text-keep-upright | 15 | 🔧 | 死路径 `:216-225` |
| text-variable-anchor | 31 | 🔧 | variableAnchors 收集（`:328/373`）+ 迭代（`PlacementEngine.ts:115-126`），但符号从未收集（S1） |
| text-writing-mode | 32 | ⚠️ | `shapeVerticalText`（`TextShaping.ts:781`）仅 `_shaped`；竖排未传给 renderer |
| text-font | 4 | ✅ | technique.fontName + harness PBF FontCatalog 注入；仅取 `font[0]`，无栈回退 |
| text-font-metrics | 15 | ⚠️ | 真实 PBF metrics 通路（`MBStyleDataSource.ts:1122`、`MBStyleDecoder.ts:341`）；但 datasource shaping 喂死消费者；baseline/ZWSP/标点靠引擎侧 |
| text-arabic | 5 | ❌ | `reshapeArabic`/`shapeRTLText`（`TextShaping.ts:706/768`）、`uax9Reorder`（`BidiAlgorithm.ts:413`）存在但**从未被 decoder/emitter 调用**（仅单测）；靠 mapview `ContextualArabicConverter` |
| text-visibility | 2 | ✅ | visibility → enabled=false（emitter `:420`） |
| text-tile-edge-clipping | 1 | ❌ | 无消费者 |
| text-pitch-scaling | 1 | ❌ | 无消费者 |
| text-no-cross-source-collision | 1 | ❌ | 无消费者 |
| text-max-attributes | 1 | ❌ | halo/emissive/occlusion props 无消费者 |
| text-icon-high-pitch | 1 | ❌ | 无特殊处理 |

### 2.7 Placement / Symbol 层（~60 用例）

| 分类 | 用例 | 状态 | 说明 / 证据 |
|------|------|------|------------|
| symbol-placement: point | — | ⚠️ | 默认点放置 ✅ |
| symbol-placement: line / line-center | 10 | 🔧 | decoder 仅产单中点 + `_linePath`；`m_textPathGeometries` 从不填充（emitter `:1039`）；`getLineAnchors` 仅死路径 |
| symbol-spacing | 5 | 🔧 | 仅死 `collectSymbols`（`:295`） |
| symbol-z-order | 11 | 🔧 | `applyZOrder`（`:415-447`）死路径 |
| symbol-sort-key | 8 | ⚠️ | emitter 分组排序（`:269/972`）；符号不建对象，无 `technique.priority` |
| symbol-visibility | 2 | ✅ | visibility → enabled=false |
| symbol-opacity | 1 | ⚠️ | 仅 icon-opacity=1，无直接消费者 |
| symbol-geometry | 6 | ⚠️ | point/multipoint ✅；line/multiline 中点近似；polygon/multipolygon ❌（无质心标签） |
| symbol-elevation | 17 | 🔧 | `symbol-z-offset` 死路径（`:537-585`）；`symbol-elevation-reference` 0 命中 |
| symbol-cross-fade | 2 | ❌ | 无 zoom 交叉淡入淡出 |
| symbol-distance-fade | 1 | ❌ | 需 sky |
| symbol-icon-brightness/contrast/saturation | 3 | 🔧 | `patchIconObject` 色彩调整，S1 |
| icon-optional | 3 | 🔧 | PlacementEngine 仅 text 重试，S1 |
| placement | 7 | 🔧 | `MBStyleSymbolPlacement` 碰撞/跨瓦片 fade 全部死路径 |

### 2.8 Fill-Extrusion 层（~91 用例）

| 分类 | 用例 | 状态 | 说明 / 证据 |
|------|------|------|------------|
| fill-extrusion-color | 8 | ⚠️ | technique.color；数据驱动丢值（S3） |
| fill-extrusion-height | 6 | ⚠️ | technique.height（`patchExtrusionMaterial` 读，S1）；zoom-fn ✅，数据驱动丢值（S3） |
| fill-extrusion-base | 12 | ⚠️ | 同；edge-radius 变体 ❌ |
| fill-extrusion-opacity | 3 | ✅ | technique.opacity |
| fill-extrusion-vertical-gradient | 3 | 🔧 | patcher `:896,1014-1030`，S1 |
| fill-extrusion-translate | 4 | 🔧 | patcher `:897-901,971-981`，S1 |
| fill-extrusion-translate-anchor | 2 | 🔧 | `resolveTranslate:131-141`，S1 |
| fill-extrusion-pattern | 15 | 🔧 | patcher `:902,910-913`，S1（无世界坐标平铺） |
| fill-extrusion-pattern-cross-fade | 4 | ❌ | `_patternCrossFade`（emitter `:433`）从不被读 |
| fill-extrusion-multiple | 2 | ✅ | 多层独立渲染 |
| fill-extrusion-geometry | 1 | ✅ | 标准多边形路径 |
| fill-extrusion-partial-rendering | 4 | ❌ | patcher `:922-941` 是不平衡 `{` 的坏桩 |
| fill-extrusion-terrain | 13 | 🔧 | patcher `:986-1010` DEM 采样（仅中心瓦片，`terrainExag=1` 硬编码 `:967` 忽略样式 exaggeration），S1 |
| fill-extrusion-vertical-scale | 1 | 🔧 | patcher `:892-893`，S1 |
| fill-extrusion-cutoff-fade-range | 1 | 🔧 | patcher `:1051-1066` 粗糙代理（`abs(vViewPosition.z)`），S1 |
| fill-extrusion-wireframe | 1 | 🔧 | patcher `:916-919` `material.wireframe`，S1 |
| fill-extrusion-rounded-wireframe | 1 | 🔧 | 同 wireframe（无圆角逻辑） |
| fill-extrusion-no-mercator-projection | 1 | ⚠️ | 自定义投影下照常渲染（非专门实现） |
| fill-extrusion-line-width | 9 | 🔧 | patcher `:1033-1048` 边缘暗化近似，S1 |
| fill-extrusion-edge-radius-narrow-corner | 1 | ❌ | 默认值仅存 `MBLayerEvaluator.ts:142`，无消费者 |

### 2.9 Heatmap 层（18 用例）

| 分类 | 用例 | 状态 | 说明 / 证据 |
|------|------|------|------------|
| heatmap-color | 2 | 🔧 | patcher `:1296-1317` ramp，S1 |
| heatmap-intensity | 3 | 🔧 | patcher `:1298,1315`，S1 |
| heatmap-opacity | 3 | 🔧 | patcher `:1318`，S1 |
| heatmap-radius | 7 | 🔧 | 单遍近似，S1 |
| heatmap-weight | 3 | 🔧 | 每要素 weight 丢失（S3），无两遍 density→ramp，S1 |

### 2.10 Hillshade 层（20 用例）

| 分类 | 用例 | 状态 | 说明 / 证据 |
|------|------|------|------------|
| hillshade | 2 | 🔧 | `HillshadeTileDataProvider`（`MBStyleDataSource.ts:171-233`）+ `patchHillshadeMaterial:1329-1412`，S1 |
| hillshade-accent-color | 5 | 🔧 | emitter `:464` + patcher `:1362,1393`，S1 |
| hillshade-shadow-color | 4 | 🔧 | emitter `:461` + patcher，S1 |
| hillshade-highlight-color | 4 | 🔧 | emitter `:465` + patcher `:1363,1394`，S1 |
| hillshade-maxzoom | 2 | ⚠️ | 无 maxzoom 门控，仅 `maxDataLevel`（`:537-541`）限制 overzoom |
| hillshade-buffer | 3 | 🔧 | patcher `:1349-1355` buffer 数学（258/260px DEM），S1 |

### 2.11 Raster 层（~85 用例）

| 分类 | 用例 | 状态 | 说明 / 证据 |
|------|------|------|------------|
| raster-opacity | 3 | 🔧 | patcher `:373-377`，S1 |
| raster-hue-rotate | 3 | 🔧 | patcher `:388,415,429-434`，S1 |
| raster-brightness | 3 | 🔧 | patcher `:382-385,425`，S1 |
| raster-contrast | 3 | 🔧 | patcher `:386,426`，S1 |
| raster-saturation | 3 | 🔧 | patcher `:387,427-428`，S1 |
| raster-color | 3 | ❌ | `hasAdjust`（`:389-393`）读了但 shader 无 `uMBRasColor` |
| raster-resampling | 3 | 🔧 | patcher `:395-397,441-444` Nearest/LinearFilter，S1 |
| raster-filtering | 2 | 🔧 | 同 resampling |
| raster-visibility | 2 | ❌ | emitter `:481` 跳层，但 `applyRasterSource` quad（`MBEnvironmentManager.ts:497-548`）无视可见性仍绘制 |
| raster-rotation | 5 | ✅ | 相机 bearing 旋转 |
| raster-masking | 4 | ⚠️ | `transparent` 仅 opacity<1 时设置（`:374-376`）→ 不透明栅格 alpha 通道不混合 |
| raster-loading | 1 | ✅ | 标准路径 |
| raster-alpha | 1 | ✅ | 标准不透明渲染 |
| raster-extent | 2 | ⚠️ | layer maxzoom 生效，但 quad 无视 maxzoom 仍绘制 |
| raster-elevation | 16 | ❌ | 无 elevation-from-raster 管线（0 命中） |
| raster-elevation-tiled | 14 | ❌ | 同 |
| raster-array | 7 | ❌ | `raster-array` source + paints 未处理 |
| raster-particle | 5 | ❌ | `raster-particle*` paints 未处理 |
| zoomed-raster | 3 | ✅ | `maxDataLevel` overzoom |
| retina-raster | 1 | ⚠️ | 无 pixelRatio 纹理处理 |

### 2.12 Image / Image-Source / Sprites / Video（~53 用例）

| 分类 | 用例 | 状态 | 说明 / 证据 |
|------|------|------|------------|
| image (default/pitched/projected/render-callback/raster-texture-source/wrap/…) | 20 | ⚠️ | `applyImageSources`（`MBEnvironmentManager.ts:550-631`）坐标映射 quad：default/pitched/projected ✅；**terrain 变体无顶点 draping**；**wrap/wrap-projected 无跨反子午线重复**；**raster-brightness/-contrast/-resampling/-visibility/-opacity/-saturation/-hue-rotate 7 子类：`applyImageSources` 忽略全部 raster paint**（quad 原图无调整）；**render-callback 子类不执行 `image/dot.js` 回调模块** → 空白图 |
| image · styleimagemissing | 1 | ❌ | 无 `styleimagemissing` 事件，runner 无 `on` 操作 |
| image-source (hourglass/non-convex-coords) | 2 | ⚠️ | 固定 2 三角形 quad（`:609`）→ 凹/自交坐标三角化错误 |
| image-fallback-nested | 19 | ⚠️ | `['image',name]` 无条件返回名字（`MBExpressionEngine.ts:468-469`）；`coalesce` 取首个非 null → **无 atlas 可用性回退语义** |
| sprites | 8 | ⚠️ | atlas 加载（`MBStyleDataSource.ts:1076-1113`）✅；无 1x/2x pixelRatio 选择/归一 → 2x 图标过大 |
| video | 2 | ❌ | 无 video source/纹理处理 |

### 2.13 Model / Building / 3D-Intersections（~340 用例）

| 分类 | 用例 | 状态 | 说明 / 证据 |
|------|------|------|------------|
| model-layer | 212 | ⚠️ | `loadModels` GLTFLoader（`MBStyleDataSource.ts:856-949`）：per-feature position `:923`、scale `:930`、rotation `:937`、inline+source defs `:875-903` ✅；**无 BVH/per-tile covering/shadows/occlusion/emissive/LOD**；测试资源 `local://models/*` 缺失 |
| building | 53 | ⚠️ | `patchBuildingMaterial`（`:1071`）窗户 `:1130-1139`、屋顶色、AO、flood light、emissive **全部在 patcher 内 → S1 不可达**；roof-shape（hipped/gabled/mansard/pyramidal/skilion/parapet）❌ 仅 `'flat'` 默认（`MBLayerEvaluator.ts:195`） |
| 3d-intersections | 75 | 🔧 | `ElevatedStructures.ts:26-148` guardrail/wall 几何 + `generateGuardrails`（`MBMaterialPatchManager.ts:85-98`），**S1 不可达**；无隧道/下穿/上跨几何 |
| wireframe | 7 | ✅ | `setTerrainWireframe`（`MBStyleDataSource.ts:967`）、`setLayers3DWireframe`（`:972`）、`setLayers2DWireframe`（`:987`） |
| sd-hd-conflation | 14 | ⚠️ | 无 conflation 逻辑，靠 `hd_covered` 数据/表达式通用通过 |
| hd-sd-transition | 11 | ⚠️ | 同；且这些测试用 `setStyle(URL)` → **S5 崩溃** |

### 2.14 Terrain / Occlusion / Elevation（~120 用例）

| 分类 | 用例 | 状态 | 说明 / 证据 |
|------|------|------|------------|
| terrain | 69 | ⚠️ | TerrainController mesh+skirt（`TerrainController.ts:74/234`）、morphing `:199`、fill/line/raster 顶点 draping（`MBMaterialPatchManager.ts:214`）+ FBO draping（`TerrainDraping.ts:157`）✅（**patcher 侧 draping 依赖 S1**，TerrainDraping 自带监听不受 S1 影响）；exaggeration 变更 ✅；**dynamic-exaggeration ❌**（zoom-fn 数组不求值）；**terrarium ❌**（`decodeDemImage` 硬编码 mapbox `TerrainController.ts:304`）；**raycast ❌**（`output:"terrainDepth"` 不支持）；**globe-terrain ❌**（TerrainDraping globe 下 bail）；symbol-draping ⚠️ 无 |
| depth-occlusion | 14 | ⚠️ | Scheme A（`TerrainDepthOcclusion.ts:18-185`）+ Scheme C（`TerrainController.ts:332-334`）；line/circle 软淡入在 patcher（`:668/:852`）→ S1 |
| occlusion | 5 | ⚠️ | line+circle occlusion（patcher `:668/:852`，S1）；`icon-occlusion-opacity`/`text-occlusion-opacity` 仅默认值（`MBLayerEvaluator:109-110`），无符号消费者 |
| occlusion-terrain-depth | 1 | ⚠️ | 同 depth-occlusion |
| cross-source-elevation | 8 | ❌ | 无跨源高程/id 逻辑 |
| front-cutoff | 6 | ❌ | `fill-extrusion-front-cutoff` 仅默认值（`MBLayerEvaluator.ts:148`），无消费者 |

### 2.15 Environment（fog / sky / lighting / theme，~246 用例）

| 分类 | 用例 | 状态 | 说明 / 证据 |
|------|------|------|------------|
| fog | 63 | ⚠️ | FogExp2 + scene.fog（`MBEnvironmentManager.ts:136-152`）；`range`+`color` ✅；**horizon-blend/vertical-range/high-color/space-color 未用**；`star-intensity` → createStars `:179-181`；globe fog 跳过 `:138-141` |
| skybox | 34 | ⚠️ | `createGradientSky`（`:184`）/`createAtmosphereSky`（`:229` 简化，无 rayleigh/mie）+ stars `:287`；**cubemap ❌**（SkySpec 仅 gradient\|atmosphere，`MBStyleSpec.ts:316`）；`sky-gradient-center` 未用；globe sky 跳过 `:165-168` |
| lighting-3d-mode | 120 | ⚠️ | `applyLights`+shadowMap（`:75-134`）；`injectLighting` 仅 extruded-polygon `:889` + building `:1073`（**fill/line/circle 不受光**）；light direction/intensity/color **表达式不解析**；shadow flag 读 `cast-shadow` 与 spec `cast-shadows` 不符 |
| style-with-lights | 1 | ⚠️ | 同 lighting；`["literal",...]`/interpolate 不可解析 |
| light-migration | 2 | ⚠️ | legacy `light` ✅；`flat` 新类型无分支 |
| color-theme | 26 | ❌ | `setTheme` no-op（`MBStyleDataSource.ts:1153`）；runner `setColorTheme` 仅存 `mapView.colorTheme` 无消费者 |
| measure-light | 19 | ✅ | `brightness` getter（`MBEnvironmentManager.ts:26`）→ decoder `:705` → evaluator `MBLayerEvaluator.ts:440` → `['measure-light']`（`MBExpressionEngine.ts:158`）；**注意**：brightness 在 env 创建前配置、之后不再重发 → 可能恒 0（见 §2.17 appearance） |

### 2.16 Globe / Projection / Camera / 视口（~230 用例）

| 分类 | 用例 | 状态 | 说明 / 证据 |
|------|------|------|------------|
| globe | 122 | ⚠️ | `sphereProjection`（`MBStyleDataSource.ts:1331`）+ `MBGlobeController`（`MBGlobeRenderer.ts:27-55`）激活原生管线 ✅；但 datasource fog/sky/terrain-draping 在 globe 下显式禁用（`MBEnvironmentManager.ts:138-141,165-168`）；球体渲染委托原生引擎 |
| map-projections | 53 | ✅ | 数学（`MBProjection.ts:27-88` albers/equalEarth/naturalEarth/winkelTripel/lambert/equirectangular）+ emitter 每顶点重投影（`MBTileDataEmitter.ts:144-154`）+ 线段细分（`:86`）；raster/sprite draping 未做 |
| projection | 4 | ⚠️ | axonometric/skew 靠 harness 相机操作近似 |
| free-camera | 6 | ⚠️ | harness `setCameraPosition`/`lookAtPoint` 用 alt→zoom 近似（`MBStyleCompatRenderTest.ts:424-467`） |
| camera | 3 | ✅ | FOV `setFov` → `setFovCalculation`（`MBStyleDataSource.ts:1002`） |
| fit-screen-coordinates | 3 | ⚠️ | harness `getGeoCoordinatesAt` haversine 近似 |
| zoom-visibility | 6 | ✅ | minzoom/maxzoom（`MBLayerEvaluator.ts:448-449`） |
| zoom-history | 2 | ✅ | dash 按 line-width 缩放 + setZoom 重解码 |
| worldview | 6 | ⚠️ | 表达式（`MBExpressionEngine.ts:164`）+ metadata→decoder（`MBStyleDataSource.ts:707`），但 decoder 存 `m_worldview` **不转发到 evaluate()**（`MBStyleDecoder.ts:270-272` vs `:102-106`）→ ctx.worldview undefined |
| scale-factor | 12 | ⚠️ | harness 重写 icon-size/text-size（`MBStyleCompatRenderTest.ts:905-918`）；src 无 scaleFactor 支持 |
| resize | 2 | ⚠️ | harness `setSize` 改 canvas；src 无消费者 |
| canvas | 4 | ⚠️ | `canvas` source 静态 quad（`MBEnvironmentManager.ts:569-575`）；update/update-resize 不支持 |
| map-mode | 3 | ❌ | `__mapMode` 仅存 flag（`MBStyleCompatRenderTest.ts:988`），无真实模式切换 |
| tile-mode | 1 | ❌ | 同 map-mode |

### 2.17 表达式 / Filter / Feature-state / 配置（~80 用例）

| 分类 | 用例 | 状态 | 说明 / 证据 |
|------|------|------|------------|
| filter | 4 | 🔧 | legacy 形式 ✅；表达式形式被 `isLegacyFilter` 误路由（**S2**） |
| dynamic-filter | 27 | 🔧 | `distance-from-center`/`pitch` 表达式无实现 + S2 |
| feature-state | 25 | 🔧 | **S4** 键不匹配 |
| remove-feature-state | 3 | 🔧 | **S4** 且移除不重发 |
| within | 11 | ✅ | legacy（`MBFilterCompiler.ts:107-114`）+ 表达式（`MBExpressionEngine.ts:517-524`）共用 `featureWithin`（`:805-835`，点在多边形射线法） |
| collator | 2 | ✅ | case/diacritic（`MBExpressionEngine.ts:532-537`）+ NFD 剥离（`:772-791`）+ `resolved-locale` |
| distance | 6 | ⚠️ | 表达式（`:512-515`，haversine `:684-716`）✅；filter 内被 S2 误路由 |
| is-supported-script | 2 | ⚠️ | `/^[a-zA-Z\s]+$/` 正则启发式，无真实脚本表 |
| config | 6 | ⚠️ | 读合并 import-config（`MBExpressionEngine.ts:152-156`）；literal 值 ✅；schema 默认不折叠；作用域参数忽略；表达式/递归值不求值 |
| featuresets | 1 | 🔧 | **S4**（descriptor 作键） |
| color-theme (表达式) | 26 | ❌ | 无 `color-theme` 表达式/LUT 路径 |

### 2.18 数据源 / 瓦片（~60 用例）

| 分类 | 用例 | 状态 | 说明 / 证据 |
|------|------|------|------------|
| geojson | 30 | ⚠️ | inline（`MBStyleDataSource.ts:606-634`）/url fetch `:610-617` ✅；网格聚类 + clusterProperties +/max/min/\* `:234-393`（近似，非 supercluster）；update 用 no-op op → ❌；单源接线 `:543-675` → 无真多源 |
| tilejson-bounds | 2 | ⚠️ | inline tiles+bounds 经 `BoundsFilteredDataProvider`（`:135-163,576-580`）✅；`url:` 形式不 fetch → overwrite-bounds 无瓦片 |
| tms | 1 | ✅ | `TMSDataProvider` y 翻转（`:116-128,571-575`） |
| extent | 4 | ✅ | extent 捕获 → `emitter.setExtents`（`MBStyleDecoder.ts:88-98`） |
| sparse-tileset | 1 | ✅ | `DelegatingDataProvider` 吞 404（`:395-427`） |
| mixed-zoom | 1 | 🔧 | **S5**（setStyle URL） |
| tile-providers | 7 | ❌ | pmtiles url 无 `{z}{x}{y}` → `resolveTileUrl` undefined（`MBStyleManager.ts:210-222`）；无 PMTiles/tile-provider 支持 |
| mapbox:// source | — | ⚠️ | 重写 `api.mapbox.com/v4`（`MBStyleManager.ts:96-111`）；仅 v4 vector/raster 模板，需 token |

### 2.19 Runtime-styling / Composite / 复合层（~800 用例）

| 分类 | 用例 | 状态 | 说明 / 证据 |
|------|------|------|------------|
| runtime-styling | 181 | ⚠️ | paint/layout/filter/zoom-range/add/remove/move 均实现（`MBStyleRuntime.ts:35-230`）并触发重求值 + `markTilesDirty`；`source-add-*`/`set-style-source-add-*` **不接线 provider**（`addSource` 只改 style + onChange，`MBStyleRuntime.ts:244-248`）→ 新源不渲染 |
| combinations | 126 | ⚠️ | 取决于所涉及层（见上） |
| regressions | 122 | ⚠️ | 所用 ops 均实现；结果取决于层支持 |
| appearance | 74 | 🔧 | `appearances` 求值（`MBLayerEvaluator.ts:337,479-498`）；但 `measure-light` brightness **配置时序问题**（env 在配置后创建、不再重发）→ 条件不匹配；feature-state 条件被 S4 破坏 |
| imports | 39 | ⚠️ | `mergeImports` 折叠 inline 子样式（`MBStyleManager.ts:118-171`）；URL imports fetch `:69-90`；`addImport`/`moveImport`/`removeImport`/`updateImport` 改 `style.imports` 后**不重新 merge**；作用域/config-reference/表达式 config 不解析 |
| slots | 8 | ⚠️ | slot 层 inert（`slot` 不在 `GEOMETRY_TYPE_MAP`，`MBStyleSpec.ts:363-383`）；`setSlot` 仅打标 + reloadStyle；顺序与扁平数组序巧合一致 |
| debug | 51 | ✅ | collisionDebug→`setCollisionDebug`（`MBStyleSymbolPlacement.ts:33-34,99`）、`debug`→`setDebugTileBoundaries`（`MBStyleDataSource.ts:1017-1074`）、terrain/3D/2D wireframe（`:967-999`）。**注意**：collision-debug 与 tile-boundaries 依赖 S1 的 tiles 遍历 → 需修复后生效；36/51 是 collision、3 tile-boundary |
| custom-layer-js | 6 | ❌ | `addCustomLayer` 无 case → no-op |
| custom-source | 8 | ❌ | `addCustomSource` no-op；引用新源图层不渲染 |
| video | 2 | ❌ | `source.type:'video'` 未处理 |
| real-world | 9 | 🔧 | **S5**（setStyle URL） |
| basic-v9 / bright-v9 / satellite-v9 | 3/1/1 | 🔧 | **S5** |
| empty | 1 | ✅ | 空源/层 → clear-color |
| random | 1 | ⚠️ | 普通 geojson symbol，取决于文本管线 |
| context-restore | 3 | ⚠️ | `forceContextRestart` 同帧 lose+restore，无 decoder/renderer 重初始化 |
| zoomed-fill | 2 | ⚠️ | 静态矢量 fill + zoom 依赖 opacity |
| linear-filter-opacity-edge | 1 | 🔧 | **S2** |
| GLJS-584 | 1 | ✅ | inline globe projection setStyle |
| featuresets | 1 | 🔧 | **S4** |

---

## 3. 汇总统计（按特性域）

> 用例数为实测；✅/⚠️/❌ 按"当前源码实际可生效"统计（含 🔧 归入 ❌ 或 ⚠️）。S1 修复前的估算。

| 特性域 | 用例 | ✅ | ⚠️ | ❌（含 🔧） |
|--------|------|----|----|----------|
| Background | 29 | 4 | 0 | 1 |
| Fill | 46 | ~8 | ~1 | ~6 |
| Line + Elevated-line | ~280 | ~9 | ~8 | ~16 组 |
| Circle | 64 | ~5 | ~4 | ~5 |
| Symbol-Icon | ~150 | ~4 | ~3 | ~12 |
| Symbol-Text | ~273 | ~10 | ~10 | ~14 |
| Placement/Symbol | ~60 | ~3 | ~4 | ~6 |
| Fill-Extrusion | ~91 | ~6 | ~4 | ~9 |
| Heatmap | 18 | 0 | 0 | 5（全 🔧） |
| Hillshade | 20 | 0 | 1 | 4（全 🔧） |
| Raster | ~85 | ~5 | ~4 | ~12 |
| Image/Sprites/Video | ~53 | ~3 | ~7 | ~3 |
| Model/Building/3D | ~340 | ~2 | ~3 | ~4 组 |
| Terrain/Occlusion | ~120 | ~5 | ~5 | ~5 组 |
| Environment | ~246 | ~2 | ~5 | ~3 组 |
| Globe/Projection/Camera | ~230 | ~7 | ~9 | ~3 |
| 表达式/Filter | ~80 | ~5 | ~4 | ~5（含 S2/S4） |
| 数据源/瓦片 | ~60 | ~5 | ~3 | ~3 |
| Runtime/Composite | ~800 | ~12 | ~9 | ~12 组 |

> **当前端到端可视觉通过估计：约 15–25%**（仅 native technique 通道）。**修复 S1–S5 后可提升至约 50–60%**（patcher 增强恢复 + filter/feature-state/style 修复）。后续逐项像素校正为精度工作。
>
> **⚠️ 2026-08-12 实测证伪**：全量基线（§10）显示实际通过率仅 **6.56%**（182/2775），上述 50–60% 估算过于乐观。

---

## 4. 移植 TODO（按优先级 / ROI 排序）

### Phase 0 — 系统级缺陷修复（前置，解锁面最大）

| # | 任务 | 解锁分类（用例） | 复杂度 | 状态 |
|---|------|----------------|--------|------|
| P0.1 | **修复 S1 `m_tiles` 幻影属性**：`MBMaterialPatchManager`/`MBStyleSymbolPlacement`/`drawTileBoundaries` 改用 `mapView.m_visibleTiles.m_dataSourceCache` 遍历 `Tile.objects`（或给 `DataSource` 加公开迭代接口） | pattern/translate/join/cap/border/blur/emissive/trim/dash/gradient/heatmap/hillshade/raster 调整/building 立面/guardrails/icon halo+text-fit/所有 symbol offset/rotate/anchor/variable-anchor/z-order/collision debug 等 **~45 分类 / ~1200 用例** | ⭐⭐⭐ | ✅ 已修复 |
| P0.2 | **修复 S2 `isLegacyFilter` 误路由**：仅当 `filter[1]` 为字符串时走 legacy；补 `distance-from-center` 表达式 | filter/dynamic-filter/distance-filter/is-supported-script/appearance 条件（~50） | ⭐ | ✅ 已修复 |
| P0.3 | **修复 S3 technique 单例缓存**：数据驱动值按要素展开 technique（或 emitter 侧按属性值分组） | circle/line/extrusion/heatmap/text/icon 数据驱动（~30 分类） | ⭐⭐⭐ | ✅ 已修复 |
| P0.4 | **修复 S4 feature-state 键**：runner 传 descriptor，src 需按 `source+sourceLayer+id` 归一化查表并支持跨瓦片持久 | feature-state(25)+remove-feature-state(3)+featuresets(1)+appearance 条件 | ⭐⭐ | ✅ 已修复 |
| P0.5 | **修复 S5 setStyle URL 参数**：URL 先本地化+fetch+parse | real-world(9)+v9 styles(5)+hd-sd-transition(11)+mixed-zoom(1) | ⭐ | ✅ 已修复 |

### Phase 1 — 高 ROI 单点特性（S1 修复后的验证与补全）

| # | 任务 | 解锁/修正 | 复杂度 | 状态 |
|---|------|----------|--------|------|
| P1.1 | 验证 S1 修复后 patcher 特性逐分类 pixel-diff（pattern/translate/gradient/join/cap/border/dash>2/trim/emissive/heatmap/hillshade/raster 调整/building 立面/guardrails/icon halo+text-fit/symbol offsets） | ~1200 用例转为"待验证" | ⭐ | 进行中（逐分类抽样验证：fill-pattern/translate、circle-translate 已验证） |
| P1.2 | circle-blur/stroke-*：给 `CirclePointsMaterial` 加 blur/stroke 支持（或接入 `MapCircleMaterial`） | circle-blur(8)+stroke(16) | ⭐⭐⭐ | ⏳ 引擎级（需改 flywave-materials） |
| P1.3 | line-blur / line-offset：SolidLineMaterial 增加 blur/offset uniform 消费 | line-blur(5)+offset(5)+elevated 同 | ⭐⭐ | ⏳ 引擎级 |
| P1.4 | line-cap：patcher 修复后验证 `material.caps`（native define 需 emitter 先产 `technique.outlineWidth`/caps） | line-cap(4) | ⭐ | ✅ 已修复（S1 后 material.caps 生效） |
| P1.5 | line-join：为 SolidLineMaterial 增加 join setter（当前写死 define 无效） | line-join(11) | ⭐⭐ | ⏳ 引擎级 |
| P1.6 | text 原生 props 映射：emitter 把 wrap/anchor/justify/letterSpacing/lineHeight/rotate/offset 映射到 native `TextElementsRenderer` 的 props（`wrappingMode/lineWidth/hAlignment/vAlignment/xOffset/yOffset/tracking/leading/rotation`） | text 全系列（~200） | ⭐⭐⭐ | ✅ 已修复（emitter 映射 tracking/leading/lineWidth/wrappingMode/rotation/hAlignment/vAlignment/xOffset/yOffset/priority/mayOverlap/reserveSpace） |
| P1.7 | icon 原生 props 映射：emitter 把 icon-color/offset/anchor/rotate 映射到 `PoiBuilder` 的 `iconColor/iconXOffset/iconYOffset/rotation` | icon-color(5)+offset(3)+anchor(11)+rotate(3) | ⭐⭐ | ✅ 部分（icon-color→iconColor 已验证 58px；offset/anchor/rotate 需引擎 prop） |
| P1.8 | circle-translate：patcher 注入 `uMBTranslate` 的 shader 代码（当前只设 uniform 不注入） | circle-translate(3)+anchor(2) | ⭐ | ✅ 已修复（`transformed.xy += uMBTranslate`，anchor/map 58px） |
| P1.9 | circle-geometry：把 line/polygon 几何映射到 circle 层（`GEOMETRY_TYPE_MAP.circle` 扩展） | circle-geometry 4/6 | ⭐ | ✅ 已修复（GEOMETRY_TYPE_MAP 扩展 + decoder 顶点/环点发射，point 36px） |
| P1.10 | raster-visibility / raster-extent：`applyRasterSource` quad 尊重层 visibility 与 maxzoom | raster-visibility(2)+extent(2) | ⭐ | ✅ 已修复（quad 路径尊重 visibility/maxzoom） |
| P1.11 | text-arabic：decoder/emitter 调用既有 `reshapeArabic`/`shapeRTLText` + `uax9Reorder` | text-arabic(5) | ⭐⭐ | ✅ 已修复（emitter 用 shapeRTLText，mixed-numeric 137px） |
| P1.12 | measure-light 时序 + mapbox 公式：env 创建后重发 brightness；`(relLum(dir)*int*polar + relLum(amb)*int)/2` | appearance 条件（measure-light 19） | ⭐ | ✅ 已修复（geojson 用例 266px；setLights 后重发） |

### Phase 2 — 精度 / 补充特性

| # | 任务 | 解锁 | 复杂度 |
|---|------|------|--------|
| P2.1 | raster-color 混色：`patchRasterMaterial` 加 `uMBRasColor` + mix | raster-color(3) | ⭐⭐ |
| P2.2 | line-border-gradient：patcher 为 border 注入渐变 | line-border-gradient(4) | ⭐⭐⭐ |
| P2.3 | fill-z-offset：emitter 恢复 z 应用（`m_currentZOffset` 写回顶点） | fill-z-offset(4) | ⭐ |
| P2.4 | symbol-placement line/line-center：emitter 填充 `m_textPathGeometries` + native 沿线放置 | symbol-placement(10)+symbol-spacing(5)+text-max-angle(2) | ⭐⭐⭐ |
| P2.5 | symbol-z-order / symbol-sort-key 原生排序：映射 `technique.priority`/`renderOrder` | symbol-z-order(11)+sort-key(8) | ⭐⭐ |
| P2.6 | background-visibility：`visibility:"none"` 跳过背景 | background-visibility(2) | ⭐ |
| P2.7 | image raster paint：`applyImageSources` 应用 brightness/contrast/resampling/opacity/visibility | image 7 子类 | ⭐⭐ |
| P2.8 | image wrap / terrain：跨反子午线重复 + DEM draping | image 4 子类 | ⭐⭐⭐ |
| P2.9 | fill-extrusion-partial-rendering：修复坏桩（高度阈值 discard） | partial-rendering(4) | ⭐⭐ |
| P2.10 | worldview：decoder 把 `m_worldview` 传入 evaluate ctx | worldview(6) | ⭐ |
| P2.11 | sprites pixelRatio：1x/2x sprite 选择/归一 | sprites(8)+icon-pixelratio(1) | ⭐⭐ |
| P2.12 | texture 级 cross-fade：zoom 变化保留旧瓦片淡出 | symbol-cross-fade(2)+zoom-history dash | ⭐⭐⭐ |

### Phase 3 — 大型工程（需架构/引擎级）

| # | 任务 | 用例 | 复杂度 |
|---|------|------|--------|
| P3.1 | fill-extrusion-terrain 完整（多瓦片 DEM + 真实 exaggeration） | 13 | ⭐⭐⭐ |
| P3.2 | terrain dynamic-exaggeration / terrarium / raycast / globe-terrain | ~10 | ⭐⭐⭐⭐ |
| P3.3 | fog 精度（horizon-blend/vertical-range/pitch 渐入） | fog 63 | ⭐⭐⭐ |
| P3.4 | sky cubemap + 真实 atmosphere（rayleigh/mie） | skybox 部分 | ⭐⭐⭐ |
| P3.5 | lighting 作用于 fill/line/circle（非仅 extrusion/building）+ 表达式 direction/intensity | lighting-3d-mode 120 | ⭐⭐⭐⭐ |
| P3.6 | building roof-shape 几何（hipped/gabled/mansard/pyramidal/skilion/parapet） | building ~6 | ⭐⭐⭐⭐ |
| P3.7 | 3d-intersections 完整（隧道/下穿/上跨 + elevation graph） | 75 | ⭐⭐⭐⭐⭐ |
| P3.8 | model-layer 瓦片化/BVH/LOD/阴影 | model-layer 212 | ⭐⭐⭐⭐ |
| P3.9 | color-theme 系统（`color-theme` 表达式 + LUT） | color-theme 26 | ⭐⭐⭐ |
| P3.10 | raster-elevation / raster-array / raster-particle | ~42 | ⭐⭐⭐⭐ |
| P3.11 | custom-layer-js / custom-source / video | ~16 | ⭐⭐⭐ |
| P3.12 | tile-providers（PMTiles 等） | 7 | ⭐⭐⭐ |
| P3.13 | 多源支持 / cluster 精度（supercluster） | geojson ~10 | ⭐⭐⭐ |
| P3.14 | imports 运行时重新 merge / slots 排序 / config scope | imports+slots ~47 | ⭐⭐⭐ |
| P3.15 | front-cutoff / cross-source-elevation / occlusion symbol | ~19 | ⭐⭐⭐⭐⭐ |
| P3.16 | sd-hd-conflation / hd-sd-transition 真实 HD 覆盖逻辑 | ~25 | ⭐⭐⭐⭐ |
| P3.17 | map-mode / tile-mode 真实模式切换 | 4 | ⭐⭐ |
| P3.18 | free-camera / setPadding 精确（需引擎 API） | ~17 | ⭐⭐⭐ |

---

## 5. 测试基础设施缺口（`MBStyleCompatRenderTest.ts` operations）

> 逐条核验（`MBStyleCompatRenderTest.ts:119-776`）。标记 ✅ 已实现 / ⚠️ 近似 / ❌ no-op。

| 操作 | 状态 | 备注 |
|------|------|------|
| wait / waitFrameReady / frameReady / sleep | ✅ | |
| setPaintProperty / setLayoutProperty / setFilter / setLayerZoomRange | ✅ | |
| addLayer / removeLayer / moveLayer | ✅ | |
| setStyle | ⚠️ | 内联对象 ✅；URL 字符串崩溃（S5） |
| setFeatureState / removeFeatureState | ❌ | S4 键不匹配 |
| setZoom / setCenter / setBearing / setPitch | ✅ | |
| setGeoJSONSourceData | ✅ | |
| addImage / removeImage / updateImage | ✅ | render-callback 模块不执行 |
| setProjection | ✅ | mercator/globe/custom |
| setLights / setLight / setFog / setTerrain | ✅ | |
| addModel | ✅ | |
| addSource / removeSource | ⚠️ | 只改 style，不接线 provider |
| setConfigProperty / setStyleImportConfigProperty | ❌ | 不重新 merge |
| setLayerProperty | ❌ | 就地改，无重建 |
| setColorTheme | ❌ | no-op |
| easeTo / jumpTo / rotateTo / resetNorth / resetNorthPitch | ✅ | |
| setPadding | ⚠️ | principal-point 近似 |
| setCameraPosition / lookAtPoint / fitScreenCoordinates | ⚠️ | zoom/alt 近似 |
| setFov / setSize | ✅ | |
| setWorldview | ✅ | |
| forceContextRestart | ⚠️ | 同帧 lose+restore |
| check / forceRenderCached / pinBooleanTransitionProgress | ❌ | no-op |
| setSlot | ⚠️ | 仅打标 |
| addImport / moveImport / removeImport / updateImport | ❌ | 不重新 merge |
| setRenderWorldCopies / setRuntimeSettingBool/String | ❌ | 仅存 flag |
| setCustomTexture | ⚠️ | 注册到 sprite atlas |
| addCustomLayer / addCustomSource / on / updateFakeCanvas / updateGeoJSONData | ❌ | 无 case |
| **feedback-url / 结果上报** | ✅ | `RenderingTestResultReporter` + `scripts/run-mbstyle-render-tests.js` |

**其他基础设施缺口**：
- `image-threshold` / `fadeDuration` / `scaleFactor` / `collisionDebug` / `showTerrainWireframe` / `showLayers3DWireframe` / `showLayers2DWireframe` / `debug` metadata ✅；`mapMode` ⚠️（仅 flag）。
- `skip-test` 仅匹配 `platform-tag-contains === ""`，非完整 platform-tag 匹配。
- `expected-<platform>.png` 多基线选择未实现（只看 `expected.png`）。
- `fontCatalog` 使用 flywave 默认字体；`style.glyphs` 时经 `buildFontCatalogFromPBF` 注入 PBF 字形（`MBStyleCompatRenderTest.ts:929-967`）——需真机验证。
- headless SwiftShader 三层渲染阻塞（材质程序编译 / EffectComposer 合成 / canvas toBlob 捕获）→ 自动化管道当前全红；真机 GPU 验证后同一管道输出真实通过率（见 `docs/render-tests-final-report.md` §三、§六）。

---

## 6. 附录：全量分类清单（270 分类 / 3031 用例，按用例数降序，三列排布）

> 用例数 = 该分类下所有含 `style.json` 的目录总数（递归计数）。

| 用例 | 分类 | 用例 | 分类 | 用例 | 分类 |
|------|------|------|------|------|------|
| 212 | model-layer | 181 | runtime-styling | 126 | combinations |
| 122 | regressions | 122 | globe | 120 | lighting-3d-mode |
| 75 | 3d-intersections | 74 | appearance | 69 | terrain |
| 63 | fog | 53 | map-projections | 53 | building |
| 51 | debug | 44 | icon-text-fit | 39 | imports |
| 34 | skybox | 32 | text-writing-mode | 31 | text-variable-anchor |
| 30 | line-dasharray | 30 | geojson | 29 | elevated-line-dasharray |
| 27 | dynamic-filter | 26 | color-theme | 25 | feature-state |
| 23 | text-field | 20 | text-offset | 20 | line-pattern |
| 20 | image | 19 | measure-light | 19 | image-fallback-nested |
| 19 | elevated-line-pattern | 18 | line-width | 18 | line-trim-offset |
| 18 | line-pattern-trim-offset | 18 | icon-size | 17 | symbol-elevation |
| 16 | raster-elevation | 16 | icon-image | 16 | elevated-line-trim-offset |
| 16 | clip-layer | 15 | text-keep-upright | 15 | text-font-metrics |
| 15 | fill-pattern | 15 | fill-extrusion-pattern | 14 | sd-hd-conflation |
| 14 | raster-elevation-tiled | 14 | line-gradient | 14 | depth-occlusion |
| 13 | text-size | 13 | line-border | 13 | fill-extrusion-terrain |
| 13 | background-pattern | 12 | text-pitch-alignment | 12 | scale-factor |
| 12 | fill-extrusion-base | 12 | elevated-line-pattern-trim-offset | 12 | elevated-line-gradient |
| 11 | within | 11 | text-anchor | 11 | symbol-z-order |
| 11 | line-join | 11 | icon-anchor | 11 | hd-sd-transition |
| 11 | elevated-line-join | 10 | symbol-placement | 9 | text-color |
| 9 | real-world | 9 | icon-opacity | 9 | fill-opacity |
| 9 | fill-extrusion-line-width | 8 | text-rotate | 8 | text-max-width |
| 8 | symbol-sort-key | 8 | sprites | 8 | slots |
| 8 | fill-outline-color | 8 | fill-extrusion-color | 8 | fill-color |
| 8 | elevated-line-width | 8 | custom-source | 8 | cross-source-elevation |
| 8 | circle-blur | 7 | wireframe | 7 | tile-providers |
| 7 | raster-array | 7 | placement | 7 | line-opacity |
| 7 | icon-halo-color | 7 | heatmap-radius | 7 | elevated-line-opacity |
| 7 | elevated-line | 7 | circle-radius | 6 | zoom-visibility |
| 6 | worldview | 6 | text-rotation-alignment | 6 | symbol-geometry |
| 6 | line-width-unit | 6 | line-blend-mode | 6 | icon-rotation-alignment |
| 6 | front-cutoff | 6 | free-camera | 6 | fill-extrusion-height |
| 6 | elevated-line-border | 6 | distance | 6 | custom-layer-js |
| 6 | config | 6 | circle-stroke-opacity | 6 | circle-opacity |
| 6 | circle-geometry | 6 | background-color | 5 | text-letter-spacing |
| 5 | text-halo-color | 5 | text-arabic | 5 | symbol-spacing |
| 5 | raster-rotation | 5 | raster-particle | 5 | occlusion |
| 5 | line-pitch | 5 | line-pattern-cross-fade | 5 | line-offset |
| 5 | line-gap-width | 5 | line-color | 5 | line-blur |
| 5 | icon-halo-blur | 5 | icon-color | 5 | hillshade-accent-color |
| 5 | elevated-line-pitch | 5 | elevated-line-offset | 5 | elevated-line-color |
| 5 | elevated-line-blur | 5 | circle-stroke-width | 5 | circle-stroke-color |
| 5 | circle-color | 5 | background-pitch-alignment | 4 | text-opacity |
| 4 | text-justify | 4 | text-halo-width | 4 | text-halo-blur |
| 4 | text-font | 4 | raster-masking | 4 | projection |
| 4 | line-translate | 4 | line-cap | 4 | line-border-gradient |
| 4 | icon-pitch-alignment | 4 | icon-halo-width | 4 | hillshade-shadow-color |
| 4 | hillshade-highlight-color | 4 | filter | 4 | fill-z-offset |
| 4 | fill-pattern-cross-fade | 4 | fill-extrusion-translate | 4 | fill-extrusion-pattern-cross-fade |
| 4 | fill-extrusion-partial-rendering | 4 | extent | 4 | elevated-line-translate |
| 4 | elevated-line-gap-width | 4 | elevated-line-cap | 4 | circle-pitch-alignment |
| 4 | canvas | 3 | zoomed-raster | 3 | text-translate |
| 3 | text-transform | 3 | remove-feature-state | 3 | raster-saturation |
| 3 | raster-resampling | 3 | raster-opacity | 3 | raster-hue-rotate |
| 3 | raster-contrast | 3 | raster-color | 3 | raster-brightness |
| 3 | map-mode | 3 | line-translate-anchor | 3 | line-emissive-strength |
| 3 | icon-translate | 3 | icon-rotate | 3 | icon-offset |
| 3 | hillshade-buffer | 3 | heatmap-weight | 3 | heatmap-opacity |
| 3 | heatmap-intensity | 3 | fit-screen-coordinates | 3 | fill-translate |
| 3 | fill-extrusion-vertical-gradient | 3 | fill-extrusion-opacity | 3 | elevated-line-translate-anchor |
| 3 | context-restore | 3 | circle-translate | 3 | circle-sort-key |
| 3 | circle-pitch-scale | 3 | camera | 3 | basic-v9 |
| 3 | background-opacity | 2 | zoomed-fill | 2 | zoom-history |
| 2 | video | 2 | tilejson-bounds | 2 | text-visibility |
| 2 | text-translate-anchor | 2 | text-max-angle | 2 | text-line-height |
| 2 | symbol-visibility | 2 | symbol-cross-fade | 2 | resize |
| 2 | raster-visibility | 2 | raster-filtering | 2 | raster-extent |
| 2 | line-visibility | 2 | line-triangulation | 2 | line-sort-key |
| 2 | light-migration | 2 | is-supported-script | 2 | image-source |
| 2 | icon-visibility | 2 | icon-translate-anchor | 2 | icon-pitch-scaling |
| 2 | hillshade-maxzoom | 2 | hillshade | 2 | heatmap-color |
| 2 | fill-visibility | 2 | fill-translate-anchor | 2 | fill-sort-key |
| 2 | fill-extrusion-translate-anchor | 2 | fill-extrusion-multiple | 2 | elevated-line-visibility |
| 2 | elevated-line-triangulation | 2 | collator | 2 | circle-translate-anchor |
| 2 | background-visibility | 1 | tms | 1 | tile-mode |
| 1 | text-tile-edge-clipping | 1 | text-radial-offset | 1 | text-pitch-scaling |
| 1 | text-no-cross-source-collision | 1 | text-max-attributes | 1 | text-icon-high-pitch |
| 1 | symbol-opacity | 1 | symbol-icon-saturation | 1 | symbol-icon-contrast |
| 1 | symbol-icon-brightness | 1 | symbol-distance-fade | 1 | style-with-lights |
| 1 | sparse-tileset | 1 | satellite-v9 | 1 | retina-raster |
| 1 | raster-loading | 1 | raster-alpha | 1 | random |
| 1 | occlusion-terrain-depth | 1 | mixed-zoom | 1 | linear-filter-opacity-edge |
| 1 | icon-secondary-coords-uint16 | 1 | icon-pixelratio-mismatch | 1 | icon-no-cross-source-collision |
| 1 | fill-limit-number-holes | 1 | fill-extrusion-wireframe | 1 | fill-extrusion-vertical-scale |
| 1 | fill-extrusion-rounded-wireframe | 1 | fill-extrusion-no-mercator-projection | 1 | fill-extrusion-geometry |
| 1 | fill-extrusion-edge-radius-narrow-corner | 1 | fill-extrusion-cutoff-fade-range | 1 | fill-antialias |
| 1 | featuresets | 1 | empty | 1 | elevated-line-sort-key |
| 1 | circle-camera-orthographic-projection | 1 | bright-v9 | 1 | GLJS-584 |

---

## 7. 建议的下一步

1. **✅ 已完成（2026-08-09）**：P0.1–P0.5（S1–S5）全部修复，`render-tests-index.ts` 重新生成全量 3026 用例并修复 TS2590（改 `JSON.parse` 方式内联）；tsc + 207 单元测试通过；自动化管道在 headless 下跑通（fill-pattern/translate、circle-radius 数据驱动、feature-state、filter 表达式、real-world setStyle 均已验证生效）。
2. **✅ Phase 1 高 ROI 单点修复**：P1.4/P1.6/P1.7(icon-color)/P1.8/P1.9/P1.10/P1.11/P1.12 已完成并验证（见 §4 状态列）；P1.2/P1.3/P1.5（circle blur/stroke、line blur/offset/join）为引擎级（需改 flywave-materials / SolidLineMaterial）。**剩余主要阻塞**：vector tile（mvt）要素渲染（大量 measure-light/real-world 用例的 fill 不显示）、raster 瓦片纹理管线、文本像素级对齐（字体系统差异，P2.1 per-glyph SDF）。
3. **✅ 逐分类校正（2026-08-09）—— 系统性相机/坐标/函数修复**（见 §8）：修复后 circle/fill/background 基础分类（circle-color/radius/opacity、fill-color/opacity/outline、background-color/literal）在 headless 下通过；line/extrusion 仍受 SwiftShader 渲染阻塞（需真机 GPU）。
4. **✅ 全量基线评估（2026-08-12）**：已用分批脚本跑完全量 3031 用例（见 §10）。**182/2775 通过（6.56%）**，远低于此前 50–60% 估算；text/line/raster/fog/skybox/lighting/model 整域全红，需优先排查"整域 0 通过"的系统性原因（文本管线、SwiftShader 线段挤出、栅格纹理）。
5. 之后按 §4 Phase 2 逐分类做"修复 + pixel-diff 验证"。

---

## 8. 逐分类校正记录（2026-08-09）

> 通过逐分类分析 actual/expected 像素差异定位的系统性根因，全部已在 headless 下验证改善。

| # | 根因 | 修复 | 验证 |
|---|------|------|------|
| Z1 | **相机缩放不匹配**：flywave 在相机 zoom z 时 level-z 瓦片显示 256px，mapbox 为 512px（`calculateDistanceFromZoomLevel` 除以 256）→ 所有内容被压缩 ~2x | `applyCameraSettings` 相机 zoom = mapbox zoom + 1；`setZoom`/`easeTo`/`jumpTo` 同样 +1 | fill/circle/background 由数千 mismatch 降至 0 通过 |
| Z2 | **decoder zoom 求值 +1**：相机 +1 后 `tileKey.level - storageLevelOffset` = 相机 zoom = mapbox+1，zoom 表达式求值偏高 | decoder zoom 减 1（`MBStyleDecoder.ts:377`） | circle-radius/function 641→通过 |
| Z3 | **minDataLevel=1 钳制**：zoom-0 测试无法加载 level-0 瓦片 → 加载 level-1 瓦片求值 zoom 1 | `minDataLevel: 0` | zoom-0 数据驱动正确 |
| Z4 | **circle-radius 是半径、`gl_PointSize` 是直径** → 圆渲染为一半大小 | emitter `size = circle-radius * 2` | circle-radius/default 3940→通过 |
| Z5 | **参考图透明背景 vs 引擎不透明画布**：mapbox expected 为 RGBA alpha=0 背景，引擎画布全不透明 → alpha 通道大量误报 | `compareImages` 将参考图 alpha 合成到白色后比较 | 去除全图 alpha 误报 |
| Z6 | **legacy zoom-and-property 函数**（`{property, stops:[[{zoom,value},result]]}`）未实现 | `evaluateLegacyZoomAndProperty` 双线性插值 | circle-radius/zoom-and-property-function 2597→通过 |

---

## 9. 代码级缺口对齐记录（2026-08-09）

> 优先做"未实现功能的代码级补齐"，不依赖 headless 像素验证；每项均通过 tsc + 单元测试。

| # | 缺口 | 实现 | 状态 |
|---|------|------|------|
| C1 | **background-visibility**（`visibility:"none"` 仍渲染背景） | `applyBackgroundColor` 检测 `layout.visibility==='none'` 直接跳过 | ✅ |
| C2 | **worldview**（decoder 存了 `m_worldview` 但从不传入 evaluate ctx） | 三处 `evaluate` 调用改传 `this.m_worldview` | ✅ |
| C3 | **fill-extrusion-pattern-cross-fade**（emitter 存了 `_patternCrossFade` 但 extrusion patcher 不用） | 改用 `patchFillPatternMaterial`（含 cross-fade mix） | ✅ |
| C4 | **line-border-gradient**（evaluator 存 raw，patcher 无消费者） | patcher 解析 interpolate stops → `buildGradientTexture`，注入 `outlineColor`/`outputDiffuse` 采样 | ✅ |
| C5 | **line-gradient 注入目标错误**（目标 `gl_FragColor=vec4(diffuse,opacity)` 在 SolidLineMaterial 不存在） | 改注入 `vec3 outputDiffuse = diffuseColor;`（SolidLineMaterial 真实结构）+ `#include <common>` 加 uniform | ✅ |
| C6 | **fill-extrusion-partial-rendering 坏桩**（注入不平衡 `{` 破坏 shader；且测试实为引擎侧 frustum culling） | 移除坏桩；标注该类测试需 `check renderedVerticesCount`（runner no-op） | ✅ |
| C7 | **symbol-placement line/line-center**（emitter 的 `m_textPathGeometries` 从不填充） | `processPointFeature` 检测 line placement，把 `_linePath` 转世界坐标生成 `TextPathGeometry` | ✅ |
| C8 | **is-supported-script**（仅拉丁正则可过，Devanagari/Arabic/CJK 全 false） | Unicode 脚本区间检测（Devanagari/Arabic/Hebrew/Cyrillic/Greek/CJK/Hangul/Thai/Latin 扩展） | ✅ |
| C9 | **TileJSON `url:` 源**（非 `{z}{x}{y}`/`mapbox://` 的 url 无 tiles） | `resolveSources` 异步化 + fetch TileJSON 取 `tiles`/`bounds`/minzoom/maxzoom | ✅ |
| C10 | **runtime addSource/removeSource 不接线 provider**（新源瓦片不加载） | 抽取 `wireTileSources` + 新增 `reloadSources()`；runner 的 add/removeSource 后调用 | ✅ |
| — | text/icon halo（halo-color/width/blur） | flywave-text-canvas TextStyle 无 halo/outline 支持 → 引擎级，需改 flywave-text-canvas | ⏳ 引擎级 |
| — | raster-color 测试（raster-value 色带） | 需 raster-value 数据通道（非单瓦片纹理），架构级 | ⏳ 架构级 |

---

## 10. 全量基线实测（2026-08-12）

### 10.1 运行环境与本次修复的基建问题

- **浏览器**：本机无 Chrome，使用 **Microsoft Edge 151 headless**（Chromium 内核，`CHROME_BIN` 指向 Edge）+ SwiftShader（`--use-angle=swiftshader`）。
- **构建修复**：根 `node_modules` 依赖链接缺失（`process/browser`、`earcut` 解析失败）→ `pnpm install` 重新链接后 webpack 构建通过（注意：`@flywave/flywave-terrain-datasource` 的 `prepare` 脚本有**先于本次基线存在**的 stratum TS 编译错误，导致 `pnpm install` 退出码非 0，但链接已完成，与 render-tests 无关）。
- **结果服务器**：管道被强杀后会遗留孤儿 `RenderingTestResultServer` 进程占用端口 → 下一次运行 EADDRINUSE 崩溃，runner 上报 "Failed to fetch"。重跑前需 `lsof -iTCP:<port>` 清理。
- **karma 容错**（`karma.options.js`）：`browserNoActivityTimeout` 60s→300s、`browserDisconnectTimeout` 10s→60s、新增 `browserDisconnectTolerance: 3`（渲染器崩溃后自动重连续跑）。
- **分批脚本**（新增 `scripts/run-mbstyle-render-tests-chunked.js`）：单跑全量时浏览器在第 24 个用例（3d-intersections）崩溃导致整轮中止；改为按分类分批（小类合并 ≤80 用例/批，大类单独），崩溃只损失当前批。结果按用例名落盘，可断点累计。

### 10.2 总量数字

| 指标 | 数值 |
|------|------|
| 用例总数 | 3031 |
| 实际上报结果 | 2775 |
| **通过** | **182（6.56%）** |
| 失败（差异 >600px） | 2138 |
| 失败（差异 ≤600px，"近失"） | 455 |
| 未上报（崩溃/超时/挂起） | 256 |

- 结果目录：`rendering-test-results/mbstyle/`（含每用例 actual/diff 图与 `*.ibct-result.json`）；分类统计：`baseline-stats.txt`。
- 复现命令：`CHROME_BIN="/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge" node scripts/run-mbstyle-render-tests-chunked.js`

### 10.3 通过分布（182 通过）

- **runtime-styling 66/181**（最大通过组）、**geojson 11/30**、**combinations 8/126**、**zoom-visibility 6/6（全绿）**、appearance 5/74、circle-radius 5/7、circle-geometry 4/6。
- 2–3 个通过：background-color、circle-blur/color/opacity、filter、feature-state、globe、icon/text-rotation-alignment、background-visibility、config、fill-color/opacity、imports、raster-extent、remove-feature-state、terrain、line-width（zero-width）、elevated-line-* 零星。
- 其余为 1 个通过的零星项（多为 `visibility:none`、`zero-width`、`default`、`missing` 等"渲染为空/基色即正确"的用例）。

### 10.4 未上报的 256 个用例

- **model-layer 180/212 未上报**：该批在第 25 个用例处浏览器崩溃（重连 3 次后仍失败），批超时（20min）终止 → 绝大部分 model-layer 用例无结果。
- map-projections 25 未上报；其余为 1–5 个的零星缺失（GLJS-584、basic-v9、raster-particle、style-with-lights、tile-mode、resize、symbol-distance-fade、symbol-icon-*、text-max-attributes、icon-secondary-coords-uint16、occlusion-terrain-depth、mixed-zoom 等）——多为该批内挂起/崩溃点前未完成的用例。
- **3d-intersections 请求 `local://tiles/3d-intersections/15-*.mvt` 全部 404**：本地 fixtures 只有 z14/z16 瓦片（`test/rendering/integration/tiles/3d-intersections/` 仅 14-8717-5683、16-* 等 5 个文件），z15 瓦片从未入库 → 该域 75 用例实质在"无数据"下渲染。这印证了 §7 提到的 **mvt 矢量瓦片渲染阻塞**。

### 10.5 实测与文档估算的矛盾点（需优先复查）

1. **text-\* 整域 0 通过**（text-size/color/field/font/opacity 等 §2.6 标注 ✅ 的 native 通道也全红，仅 text-keep-upright/text-pitch-alignment 各 1 个"空渲染即正确"通过）→ 文本管线在 headless 下可能**整体不出字**（字体 atlas/glyph PBF 注入或 TextElementsRenderer SwiftShader 问题），而非像素精度问题。**这是最大的单域阻塞（~273 用例）**。
2. **line-\* / elevated-line-\* 整域 ~0 通过**（仅 zero-width/visibility 等空渲染用例通过）→ 与 `render-tests-final-report.md` §三的 SwiftShader 线段挤出阻塞一致，需真机 GPU 或修 EffectComposer 验证。
3. **fill/background/circle 基础分类仅部分通过**（fill-color 2/8、background-color 3/6、circle-color 3/5；§7 称"基础分类已通过"的说法过于乐观）→ literal/default 过了但 function/zoom 变体仍有差异，Z1–Z6 修复未完全覆盖。
4. **fog 0/63、skybox 0/34、lighting-3d-mode 0/116、building 0/52、heatmap 0/18、hillshade 0/20、raster 全系 ~0** → 这些 §2 标 ⚠️/🔧 的域实测确认**无一视觉对齐**。
5. §3 的"修复 S1–S5 后 50–60% 通过"估算**不成立**：实测 6.56%（+455 近失也才 ~23%）。patcher 通路恢复（S1）并未带来大面积通过，说明 patcher 输出与 mapbox 参考存在系统性视觉差异（坐标/缩放/材质语义），而非"通路通了即对齐"。

### 10.6 基线结论与下一步（更新优先级）

1. **P0 排查 text 整域不出字**（~273 用例 + symbol/icon 依赖字体的用例）：验证 headless 下 `local://glyphs/*.pbf` 是否加载、FontCatalog 注入是否生效、TextElementsRenderer 在 SwiftShader 是否有输出。
2. **P0 修 mvt 瓦片 fixtures**：3d-intersections z15 瓦片缺失（404）；排查 real-world/measure-light 的 mvt 加载链路。
3. **P1 真机 GPU 跑同一基线**：区分"SwiftShader 渲染阻塞"与"实现错误"（line/fill-extrusion/debug/raster 等域在 SwiftShader 下结论不可靠）。
4. **P1 逐域看 diff 图定性**：455 个近失（≤600px）是第一梯队（worldview、filter、zoom-history、circle-color/function 等）；`http://localhost:PORT/ibct-report` 可逐用例看 actual/diff。
5. **P2 model-layer 批拆分重跑**（或跳过挂起用例）：补 180 个未上报结果。

> **2026-08-12 差异根因调查已完成**：见 `docs/render-tests-diff-analysis.md`——6 个代码 bug（text/icon 坐标空间、line 宽度计算、extrusion shader 编译失败、raster uv/重渲、heatmap shader 串、纹理回调无重渲）+ 2 个语义未实现（瓦片级别错位/DEM 寻址）+ fog 模型不匹配，**证伪了 final-report §三的"SwiftShader 三层阻塞"结论**。按该文 P0-1~P0-4 修复后大部分"空白域"可转为可比状态。

### 10.7 Phase A 修复记录（2026-08-12，`docs/render-tests-next-plan.md`）

> 逐项验证：改代码 → tsc + 单元测试（257 passing，2 个既有失败与本次无关）→ 单分类 render-test（Edge 150 headless + SwiftShader）→ 更新文档。commit：`9bf3469a`（A1 + A2 前半）。

| # | 修复 | 验证 / 状态 |
|---|------|------|
| A1 ✅ | **text/icon 坐标空间（R1）**：`MBTileDataEmitter.ts` 新增 `projectWorld(p)=project(p).add(center)`，line-placement path、`emitTextGeometry`/`emitPoiGeometry` 三处改用；mesh 路径保持 `project`（tile 中心相对）；harness `MBStyleCompatRenderTest.ts` MapView 创建后设 `mapView.disableFading = true` | text-size/default 122px（修复前整帧空白 4096px）、icon-image/literal 58px、text-field/literal 113px、token 276px、symbol-placement/line-center 701px（沿线文字已渲染）→ **text/icon 整域空白已消除**，剩余为字体度量精度项 |
| A2 ✅ | **line 空白根因 = ribbon 三角形绕向**：`createLineGeometry` 产 CW 三角形，`emitRibbonFill` 的 fill 材质（FrontSide）背面剔除 → 只有 join/cap 碎片（75–1846px）。`emitRibbonFill` 逐三角形翻转绕向为 CCW + 线宽比例改用显示 zoom（`m_zoom+1`） | **line-color/default 55527 → 337 mismatch**（literal 334、elevated literal 335、property-function-identity 220）。line-\*/elevated-line-\* 整域从空白变为完整路网；剩余为颜色空间精度（function/property-function 亮 25%） |
| A3 ✅ | extruded-polygon shader 编译（R3） | **shader error 434 → 0**（`animateExtrusion:false` + `geometryNormal`→`nonPerturbedNormal`）。结构性缺口仍在：无 `extrusionAxis` 属性烘焙 → fill-extrusion/building 仍空白（C3 长期项） |
| A4 ✅ | 纹理回调补 `mapView.update()`（R9） | raster/hillshade patcher 纹理回调已补。raster 仍不显示：R4 瓦片级别错位（Berlin raster 请求 z12/z16，fixtures 仅 z17-Berlin）+ env quad z≤12 钳制 → 属 R4/R5 |
| A4.1 ✅ | **raster 瓦片级别错位（R4）修复**：raster fixtures 存在的是 **cameraZoom 级别**（z17 = level-17 在 camera 17 下 256px 满视口），而 `MBStyleDataSource` 默认 `storageLevelOffset=-1`（矢量约定 dataZoom=cameraZoom-1=z16）→ Berlin raster 请求 z16 satellite（缺失）404。修复：`wireTileSources` 中 **raster-only 样式（无矢量源）且调用方未显式传 offset 时置 `storageLevelOffset=0`**（dataZoom=cameraZoom），使 zoom-16/17/20 的 Berlin raster 测试全部加载存在的 z17 卫星瓦片。矢量（heatmap 等）路径不变（offset -1）。**env quad z≤12 钳制（R5）另记** |

#### 数据缺口 + R7 hillshade + R8 fog（2026-08-16 第三阶段）

| # | 修复 | 验证 / 状态 |
|---|------|------|
| D1 ✅ | **model-layer fixtures 补齐**：`mapbox-gl-js/test/integration/models/`（133 文件：glb/gltf/vector.pbf/dem terrain/landmark）整目录拷入 `test/rendering/integration/models/`（此前空） | 补 model-layer 与 landmark 资源缺口 |
| D2 ✅ | **3d-intersections z15 确认无需补**：`tileSize:512 → offset −2`（R4.2）已使 dataZoom=z16–17（clamp maxzoom 17），fixtures 有 z16/z17；z15 请求是首轮基线旧现象 | 验证通过 |
| D3 ✅ | **hillshade DEM 寻址（R7）**：`HillshadeTileDataProvider` 原按 tileKey.level 填 `{z}`（raster-dem-only 样式 offset -1 → dataZoom=z16，404）；改为 **tileSize>256 时 DEM 级别 = z−2**（`14-3355-6247.png` 存在）、x/y 按父瓦片换算（`Math.floor(x/2^shift)`）；tileSize 256 保持 z（`11-379-804.terrain.png` 存在） | MAPSNAT-3205 请求 z16→z14；projected 保持 z11 |
| D4 ✅ | **fill/raster/hillshade 几何补 uv**：`AccumulatedGeometry` 加 `uvs`，`processFillFeature` 对 `_rasterTileUrl`/`_hillshadeDemUrl` technique 发瓦片归一化 uv（`x/extents, y/extents`），`getDecodedTile` 输出 `uv` 属性（r178 材质采样 DEM/卫星不再坍缩到 (0,0) 角） | 修复 vUv 恒 (0,0) 导致 DEM/卫星纹理只显示单角像素 |
| D5 ✅ | **r178 shader 替换串修正**：`patchHillshadeMaterial`/`patchRasterMaterial` 原替换 `'gl_FragColor = vec4( diffuse, opacity );'` 在 three r178 中**不存在**（MeshBasic 最终输出在 `#include <opaque_fragment>`，即 `vec4(outgoingLight, diffuseColor.a)`）→ 全部 no-op；改为**注入 `#include <opaque_fragment>` 之后** | hillshade 法线/坡度着色与 raster brightness/contrast/saturation/hue 调整恢复生效 |
| D6 ✅ | **fog 模型（R8）**：`FogExp2`（米制世界瞬间饱和）→ 线性 `THREE.Fog`，near/far = `range[0]/[1] × 1000`（mapbox km 范围映射到 flywave 米制世界，range 可负）；近似替换 mapbox 指数衰减，alpha 上限与 horizon-blend 留作后续 | fog 从全屏饱和色变为随距离渐入 |

> 注：`14-8802-5373.mvt`（icon-pitch-scaling 所需行 5373 瓦片）在 mgl 与 flywave 均无，记为 known-gap 无法复制。

### 12.19 3D lights（lighting-3d-mode，2026-08-16）

**根因**：
1. `applyLights` 读 `light.color`，而 mapbox 3D `lights` API 结构是 `{type, id, properties:{color,intensity,direction}}` → 灯光从未正确应用（3D lights 全 127 例失败）。
2. 即使读对，2D ground 层（fill/background/raster/circle）用 `MeshBasicMaterial` 不受 three 灯光影响，且 THREE 光照模型 ≠ mapbox `apply_lighting`。

**实现（对齐 mapbox `3d-style/render/lights.ts` + `_prelude_lighting.glsl`）**：
- `MBEnvironmentManager`：修复 `applyLights` 读取 `light.properties`；新增 `lighting3DState` getter，CPU 计算：
  - `ambientColorLinear/directionalColorLinear` = `sRGBToLinearAndScale`（v^2.2 × intensity）
  - `dir` = `sphericalDirectionToCartesian`（azimuth+90°/polar，polar 0=zenith）
  - `groundRadiance` = `linearVec3TosRGB(ambientContrib + dirContrib)`，ground 层 lit 为 `color × u_ground_radiance`
- `MBMaterialPatchManager.injectGroundLighting`：ground 层（fill/line/circle）注入 `gl_FragColor.rgb = mix(gl_FragColor.rgb × uMBGroundRad, gl_FragColor.rgb, emissive_strength)`（`apply_lighting_with_emission_ground`）；因补丁顺序（ground 先注册、后注册的 hillshade/raster 块插在其前），ground 光照**最后应用**（对调整后颜色再打光，符合 mapbox）；uniform 注入 `void main() {` 前兼容 RawShaderMaterial（circle/line）。handler 每次编译动态读当前灯状态 + `patchTileMaterials` 检测灯签名变化强制重编译（支持运行时 `setLights` 操作）。
- `MBStyleDataSource.applyBackgroundColor`：background（clearColor）按 `color × groundRadiance`（emissive 混合），与其它 ground 层一致。

**验证**：tsc 通过；单元测试 7+10+43+15 通过（1 个既有失败无关）；ground radiance 数学与 mapbox 公式逐项核对（pitch-45/70、intensity 缩放、dir 无方向默认 [0,90]）一致。**待渲染 harness 逐用例验收**（本环境无法跑 GPU harness）。

**extrusion 补充（`injectExtrusion3DLighting`）**：fill-extrusion 在 use3DLights 时改用 mapbox `apply_lighting_with_emission` 公式（世界空间 FLAT_SHADED 法线 × `uMB3DViewToWorld`，`k = amb·adf + dir·max(NdotL,0)`，`lit = color·pow(k,1/2.2)`，emissive mix），替换原简化 Lambert（`injectLighting`）；handler 每次编译动态读灯状态。

**building 补充**：`patchBuildingMaterial` 在 use3DLights 时于 **procedural facade 块之后**追加同一 `apply_lighting` 公式（世界法线），使灯光作用在窗户/洪水光/AO 着色后的最终颜色上（mapbox 语义）；legacy light 保持 `injectLighting` Lambert。

**单测锁定**：`MBStyleDecoderPipelineTest` 新增 `computes mapbox 3D-lights ground radiance`——验证 `lighting3DState.groundRadiance` 与 mapbox 公式逐值一致（红 ambient + 绿 directional@[0,90] → [1,0,0]；pitch-45 → green 0.854；intensity 0.39 → 0.652），防止公式回归。

**修复**：`extrusionLightState` 在无 directional 光时 `use3DLights` 被强制 false（仅 ambient 的 3D-lights 样式 extrusion/building 会错误走 legacy 路径）→ 改为恒返回 `this.m_use3DLights`（3D-lights shader 路径的 uniform 来自 `lighting3DState`，不经此 getter 的 dir/color）；单测断言补充。

### 12.20 r178 shader 替换串系统性核查（2026-08-16）

**发现**：`MBMaterialPatchManager` 尚有 3 处 `gl_FragColor = vec4( diffuse, opacity );` 替换目标在 three r178 中**不存在**（MeshBasic 输出在 `#include <opaque_fragment>`；SolidLineMaterial 用 `outputDiffuse`/`alpha`）→ 静默 no-op：
1. **line-pattern**（`patchLineMaterial`）：目标与变量名双重错误（`diffuse`/`opacity` 不存在于 SolidLineMaterial）→ 改 `outputDiffuse`/`alpha` 双分支。
2. **multi-element dasharray**：同上 → 改 `outputDiffuse`/`alpha` 双分支 + `discard` 逻辑。
3. **fill-pattern**（`patchFillPatternMaterial`，MeshBasic）：目标改为 `#include <opaque_fragment>` 之后（`diffuse`/`opacity` 有效）。

**验证**：全部替换目标对实际 shader 源（meshbasic/meshphysical/CirclePointsMaterial/SolidLineMaterial）逐一存在性检查 ✓；fill/extrusion/building/hillshade/raster/pattern 注入后括号平衡 ✓；剩余 `gl_FragColor = vec4( diffuse, opacity );` 仅存在于注释。tsc 通过、单测无回归。

**遗留**：3D-lights 的 extrusion/building 组合需 GPU 逐像素验收（本环境无法跑渲染 harness）。

#### A2 过程中发现的两个系统性 bug（远大于 mpp 本身，已修）

> 排查 line 空白时发现：**所有 mvt 瓦片数据此前从未真正解码**，解码后又有 **y 坐标约定错位**——这两点解释了 §7/§10.4"mvt 矢量瓦片渲染阻塞"（3d-intersections 全域无数据、line/fill-from-tiles 全空白）。

| # | Bug | 修复 | 影响 |
|---|-----|------|------|
| B1 | **`MBStyleDecoder.decodeThemedTile` 分支顺序**：`typeof (ArrayBuffer) === 'object'`，先命中"GeoJSON 对象"分支被静默吞掉，`instanceof ArrayBuffer` 分支**永远不可达** → 所有 vector 瓦片 never decoded（`processLineFeature`/`processFillFeature` 从不被调用，fetched 的 mvt 字节数正确但 decode 空跑） | 二进制分支提到对象分支之前（`MBStyleDecoder.ts`） | **解锁全部 mvt 渲染**（line/fill-from-tiles/extrusion/heatmap/3d-intersections/measure-light/real-world 等 ~100+ 分类的前置） |
| B2 | **mvt y 坐标约定与运行时世界不一致**：`MapView.projection` 默认是 base `MercatorProjection`（下原点，y 向北增，Berlin 相机/tile.center ≈26.9M），而 OMV 原始 mapbox 像素（y 向下）经原始 `tile2world` 得到**上原点**（≈13.1M）→ mvt 几何全部落在相机 ~13.7M 之外（屏幕外） | 在 MB processor 对 mvt 数据做 `py' = (scale − 2·top) − py` 线性翻转（等价转成 GeoJSON adapter 的 world2tile 约定，`setMvtYOffset` 仅在 ArrayBuffer 分支开启，geojson 不受影响） | mvt 几何与 geojson 共用同一 `project()` 通道；geojson 填充（fill-color）保持基线行为不变 |

**验证状态**：
- 用 `git stash` 对照：fill-color/default 在**纯基线（未改动）**即 784 像素差异——非本次回归，属既有精度项。
- line-color 从全空白（0 黑像素）变为渲染出内容（~75 黑像素，位于视口底部）——解码 + 坐标修复生效，但**仍有残差偏移**（相机焦点/瓦片选择/剩余约定细节，待后续排查）。
- tsc 通过；257 单元测试通过（2 个既有失败：RawShaderMaterial 断言、circle-radius×2，均与本次无关）。
- 其余 mvt 依赖分类（fill-from-tiles、fill-extrusion、heatmap 等）**未及批量验证**（用户中止验证），是下一步验证重点。

> 下一步建议：1) 先批量跑 `line-color fill-color fill-extrusion-color heatmap-radius` 确认 mvt 域整体收益；2) 排查 line 残余 ~100px 偏移（对照 `TileObjectRenderer` 中 object 世界坐标 vs 相机焦点）；3) 再继续 A3（extrusion shader）。

> **2026-08-13 进展**：A2 根因定位为 **ribbon 三角形绕向（CW → 被 FrontSide fill 材质背面剔除）**，`emitRibbonFill` 翻转绕向 + 线宽改用显示 zoom 后，line-color/default 从 55527 → 337 mismatch，line-\* 整域出图。A3（extrusion shader：`animateExtrusion:false` + `nonPerturbedNormal`）把 shader 编译错误从 434 降到 0；结构性缺口（无 `extrusionAxis` 烘焙）仍在，fill-extrusion/building 空白待 C3。A4（纹理回调补 `mapView.update()`）已落地。
>
> **2026-08-13 再进展（commit `82cad1fa`）—— 颜色空间系统性修复**：`MapMaterialAdapter.applyMaterialBaseColor` 把 sRGB 通道值直接传给 `THREE.Color.setRGB`，r178 + ColorManagement 下被当作 linear 空间输入，输出端 linear→sRGB 再转换使所有材质颜色变亮 ~1.46x（绿 128→188）。改传 `SRGBColorSpace` 后颜色精确往返：**fill-color/function 784→0、circle-color/function 0、line-color/function 55038→106、literal 334→106、multiply 104、opacity 110、zoom-and-property 192**。同时 `getOrCreateRibbonTechniqueIndex` 改为按 **color+opacity** 键（原先只按 layer.id，数据驱动/categorical 线色全部用了首要素颜色）。
>
> **遗留**：`line-color/property-function`（6 色 categorical）仍 ~36k。已深度排查：geometry/techniques/materials/objects 全部逐项验证正确（每色一个 technique 且几何 range 连续正确、材质颜色正确创建），但渲染只出 purple+blue（其余 4 色缺失），且 road layer 被注入 `line-z-offset:0.01`（来源未定位，fixture 与源码均无写入点）导致部分要素 z=0.01。怀疑是**多材质 geometry 分组 + z-fighting** 的组合问题，留作专项。
>
> **2026-08-13 第三轮（R4 瓦片级别 + geojson y + heatmap）**：
> - **R4.1 pitch 相机补偿（`2224b6d5`）**：flywave zoomLevel 由相机视线距离反推，pitch 使斜距变长 → reported zoom 从 15 掉到 14.79，dataZoom 落到 z13。`applyCameraSettings` 请求 `zoom = mapbox+1 − log2(cos(pitch))` 使斜距映射回目标 zoom。**icon-pitch-scaling 等 pitch 测试从请求 z13（404）改为 z14（存在）**；pitch 0 不受影响。
> - **R4.2 tileSize:512 语义（`67538a43`）**：512px 瓦片覆盖 256px 瓦片低一级的范围，按 source `tileSize` 设 `storageLevelOffset=-2`（dataZoom=cameraZoom−2，decoder zoom 表达式仍按 mapbox zoom=level+1）。**3d-intersections/tile-border 从请求 z18 改为 z17**；256px 源保持 −1。
> - **R4.3 DEM maxzoom 钳制（`58eabe20`）**：`applyTerrain` 硬编码 `min(zoom,12)`，改为按 raster-dem source `maxzoom` 钳制 + tileSize 偏移。**decrease-dynamic-exaggeration-to-zero-fog 从 z12 改为 z9（存在）**，buildings-depth-regression（tileSize 512, maxzoom 14）→ z13。
> - **geojson y-flip（`7d81ae37`）**：geojson 适配器经 webMercatorProjection（y-down）投影，而 MapView 用 base Mercator（y-up），内联 geojson 面/线南北镜像。decoder 对 geojson 应用与 mvt 相同的 y-flip（`py' = scale − 2·top − py`）。**3 色 geojson debug 测试线落位正确**；fill-color 无回归。
> - **heatmap R6 + m_patchedTiles（`cce8a418`）**：替换串从不存在（`vec4(diffuse,opacity)`）改为 CirclePointsMaterial 实际目标（`vec4(diffuseColor, alpha)`）；patchTileMaterials 改为按对象数变化重新 patch（首帧背景 quad 先附加、解码点后附加，原来一次 patch 后跳过导致 heatmap 点永不 patch）。
> - **遗留**：property-function 多色仍只出 purple+blue（需 THREE 多材质分组专项）；icon-pitch-scaling 缺 5373 行瓦片 + glyph 字体（fixture 覆盖）；raster/hillshade 纹理上屏（R5/R7）；fill-extrusion `extrusionAxis` 烘焙（C3）。

---

## 11. 第二轮验收记录（2026-08-13）

### 11.1 本轮修复验收（用户提交的 R4.1–R4.3 / geojson y-flip / heatmap R6 / SRGB）

验证方式：tsc（通过）+ 受影响分类 render-test 专项（79 用例，Edge 151 headless）。结论：

| 修复 | 验收结果 |
|------|----------|
| SRGB 色彩空间（`82cad1fa`） | ✅ circle-color/function 492→0 通过；fill-color/function 修复通过 |
| geojson y-flip（`7d81ae37`） | ✅ geojson 分类 **11/30 → 22/30 通过**（inline/external 全系列 0 差异） |
| R4.1 pitch 补偿 / R4.2 tileSize:512 / R4.3 DEM maxzoom | ✅ 瓦片请求级别已对齐（icon-pitch-scaling z13→z14；3d-intersections z18→z17；terrain fog z12→z9），剩余失败为 fixture 覆盖缺口（5373 行瓦片、glyph 字体缺失） |
| heatmap R6（`cce8a418`） | ⚠️ 部分生效：actual 从空白变为**蓝色圆点**（shader 替换 + re-patch 生效），但无 density→ramp 渐变（单 pass 近似的固有限制，需双 pass，C4） |
| line（A2 系列） | ⚠️ line-color/default actual **出线了**（黑色粗线可见，0→有内容），但只出现在画面下半部（落位/覆盖范围仍不对，mismatch 51691）；elevated-line-color 类 mismatch 降至 ~338 |

### 11.2 R1（text/icon 空白）追查与完成 —— 三个断点（本轮新增修复）

R1 在 §10/diff-analysis 中判为"坐标空间"单因，验收发现修复后**仍空白**，继续用浏览器埋点逐段排查，共找到并修复三个断点：

1. **text/poi positions buffer 类型错误**（`MBTileDataEmitter.ts:1125`）：打包为 `Float32Array`，但原生消费端 `TileGeometryCreator.createTextElements:517` / `PoiManager.addPois:180` 直接把 buffer 按 `Float64Array` 解读 → `BufferAttribute.count=0` → 零 TextElement。**修为 `Float64Array`**（对齐原生 `VectorTileDataEmitter.ts:1759`）。
2. **FontCatalog 注册键不匹配**（`MBFontCatalogBuilder.ts:104`）：注册键 `"font_Regular"`，查找键 `` `${font.name}_${fontStyle}` `` 其中 `fontStyle` 是数字枚举（`FontStyle.Regular=0`）→ 永不命中 → replacement glyph 被跳过。**修为 `String(FontStyle.Regular)`**。
3. **symbol-only 瓦片不进 renderedTiles**（根因中的根因）：纯符号瓦片有 textGeometries 但 `objects.length===0`（emitter 为 symbol 层产 points 几何数据但无 mesh 对象）→ `Tile.hasGeometry=false` → `VisibleTileSet.populateRenderedTiles`（`VisibleTileSet.ts:1097-1101`）不收录 → `placeText` 的 `hasTextElements` 恒 false → 文本元素创建了却永不放置。**修复**：`TileGeometryCreator.createTileObjects` 在 `objects.length===0 && hasTextElements()` 时 `tile.forceHasGeometry(true)`（沿用 `BackgroundDataSource:79` 既有模式）。

**验证**：text-size/default actual 出现 "ABC"、text-field/literal 出现 "Test"（文本管线端到端打通）；mismatch 从"空白基线"变为位置/字体差异（155/148px），进入像素精度阶段。埋点日志已全部移除，mapview + mbstyle 双包 tsc 通过。

**仍遗留**：**icon 仍空白**（icon-image/literal mismatch 58 不变）——POI 路径（`preparePois`→`PoiManager.addPois`→`PoiBuilder`）的 ImageTexture 查找/精灵注册还有独立断点，需同款埋点排查（见 §11.4）。

### 11.3 基建备忘

- `run-mbstyle-render-tests.js` 跑完不退出（服务器常驻），后台任务被停时**一定遗留孤儿 `RenderingTestResultServer`** 占端口 → 下次运行 EADDRINUSE 且结果写入旧目录。重跑前 `pkill -f RenderingTestResultServer.js`。
- `@flywave/flywave-mbstyle-datasource` 的 `npm test` 脚本指向 `./test/*Test.js`（不存在，编译产物在 `lib/test/`），且 lib 内模块解析缺 workspace 链接——单测请用项目既有方式（用户环境 257 通过），该脚本需另行修复。

### 11.4 下一步方向（按 ROI 排序）

1. **P0 icon POI 链路**（~150 用例）：`PoiManager.addPois` → `addPoi` → `PoiBuilder` 的 `imageTexture` 解析（sprite ImageTexture 注册名 vs technique.imageTexture 查找键），同款埋点法一次定位。
2. **P0 文本像素对齐**（~273 用例的第一梯队）：当前文字渲染在左上、期望居中——查 anchor/offset 语义与 `tile.offset`、PBF catalog 注入（harness 目前命中 Default catalog 而非 PBF，`MBFontCatalogBuilder` advance/offsetY 度量修正）。
3. **P0 line 落位**（~280 用例）：线已出但只覆盖下半画面——查 ribbon 顶点坐标空间（y-flip/tile offset）与瓦片覆盖。
4. **P1 fill-extrusion 几何烘焙**（C3，~143 用例）：emitter 产屋顶/墙面三角形 + `extrusionAxis`（A3 只解了 shader 编译，几何仍是平面 footprint）。
5. **P1 raster/hillshade 纹理上屏**（R5/R7，~105 用例）：uv 合成 + DEM 寻址 + A4 重渲验证。
6. **P1 heatmap 双 pass**（C4，18 用例）+ property-function 多色分组（THREE 多材质 z-fighting 专项）。
7. **P2 model-layer 崩溃定位**（212 用例，拆小批重跑）+ 真机 GPU 基线对照。

### 11.5 第二轮全量基线（2026-08-13，含 R1 三修复）

| 指标 | 第一轮（08-12） | 第二轮（08-13） | Δ |
|------|----------------|----------------|---|
| 上报结果 | 2775 | 2646 | −129 |
| **通过** | **182（6.56%）** | **204（7.71%）** | **+22** |
| 近失（≤600px） | 455 | 477 | +22 |
| 未上报 | 256 | 385 | +129 |

**通过的增量分布**：feature-state 3→6、geojson 11→17、fill-color 2→3、remove-feature-state 2→3（全绿）、lighting-3d-mode 0→2、map-projections 1→2、imports 2→3、combinations 8→10、runtime-styling 66→68；新增 extent、fill-extrusion-base、fill-pattern、worldview、tms、zoomed-fill、circle-sort-key 等零星通过。

**未上报增量来源**：model-layer 批第 25 例附近再次崩溃（180 未上报，同第一轮）；本轮新增 fog 批 38、skybox 批 33、text-writing-mode 批 32 未上报（批内挂起/超时）；3d-intersections 25（崩溃点提前）。

**关键判断**：
- text-\* 仍 ~0 通过，但**性质已变**：文本管线已通（actual 有文字），失败原因是位置偏移（文字在左上、期望居中）+ 命中 Default catalog 而非 PBF 字体度量——属像素精度问题而非"空白"，对应 §11.4 第 2 项。
- 通过率增幅 (+1.15pt) 低于预期，因为 R1 修复解锁的是"可渲染"，而大量 text/symbol 用例需先过"位置/字体"两关才能转为通过；预期 §11.4 第 1–3 项完成后有阶跃。
- model-layer 崩溃（两轮同点）成为最大的未上报源，建议下轮优先定位（拆 10 例/批重跑）。

> 第二轮结果目录：`rendering-test-results/mbstyle/`（已重跑覆盖）；通过清单：`baseline2-pass.txt`。

## 12. 第三轮全量基线（2026-08-14，含 text R1–R4 + border/SDF + icon 四断点 + 崩溃三件套）

### 12.1 汇总

| 指标 | 第一轮（08-12） | 第二轮（08-13） | 第三轮（08-14） | Δ(3 vs 2) |
|------|----------------|----------------|----------------|-----------|
| 上报结果 | 2775 | 2646 | 2765 | +119 |
| **通过** | **182（6.56%）** | **204（7.71%）** | **212（7.67%）** | **+8** |

> 第三轮结果目录：`rendering-test-results/mbstyle-baseline3/`；通过清单见下（212 例）。

**净变化拆解（相对第二轮）**：
- **净增 +18**：appearance/paint-* 4（icon+material 修复连带）、icon-anchor 2、icon-color 4、icon-halo-color/width 2、icon-image 2、icon-size/camera-function-high-base-sdf 1、placement/symbol-layers-same-layout-properties 1、text-max-width/force-newline+force-double-newline 2。
- **净失 −10**：
  - **5 例为 skip 正确生效（非回归）**：`appearance/empty-image-in-appearance`、`appearance/non-existent-image-in-appearance`、`elevated-line-pattern-trim-offset/globe-*`（3）——均带 `platform-tag-contains: "web"` skip 标注，第二轮只因 `getPlatform()` 返回 `ChromeHeadless-…`（不含 "web"）误跑误过；第三轮平台 tag 归一化为 `web-ChromeHeadless-…` 后官方 skip 命中。
  - **5 例为 icon SDF 边缘抖动（阈值边缘，待 SDF shader）**：`icon-rotation-alignment/viewport-symbol-placement-line`（15→25px）、runtime-styling `layout-property-property-expression/function-to-default` + `set-style-layout-property-*`×2（各 40px vs 阈值 34，icon-rotate 置空后 oneway 图标 SDF 阈值化边缘差）。
- **合计净增 +8**（212 vs 204）。

### 12.2 本轮验证的关键修复（§11.4 状态改写）

| §11.4 条目 | 状态 | 落地 |
|-----------|------|------|
| 1. icon POI 链路 | ✅ 完成 | 四断点：① sprite.pbf 缺 30 图标且不回退 → `MBStyleManager.buildSpriteFromIconSet` pbf+legacy 合并（注册 387 = 357+30，dot.sdf ✓）；② pbf 图集 toDataURL 异步解码 → 图集 canvas 直传（`SpriteData.image` 加 HTMLCanvasElement）；③ **IconMaterial `vertexColors:true` 与 shader 自带 `attribute vec4 color` 冲突 → VALIDATE_STATUS false**，删标志；④ icon-opacity 未应用 + SDF 图标阈值化（0.75 边缘）+ RGB 置白。icon 批 214 例通过 11→22。 |
| 2. 文本像素对齐 | ✅ 大体完成 | GlyphPBFParser 字段序修复（mapbox proto：bitmap=2/width=3/height=4/left=5/top=6/advance=7）；border/stride（w+6×h+6 逐行拷贝）；SDF 边缘 0.75→0.5 重映射（−64）；R1 default catalog 注入、R2 锚点反转、R3 行高 1em+leading、R4 advance/distanceRange=8/offsetY；`force-newline`/`force-double-newline` 0 mismatch。 |
| 3. line 落位 | ⚠️ 改写 | 非 phantom（HEAD 不可复现），line-color 337px 逐像素对齐；真实工作面改为 pattern/dasharray/variable-width 等功能缺口。 |
| 7. model-layer 崩溃 | ✅ 完成 | 崩溃三件套：FrustumIntersection 20 万瓦片上限、MapView.renderLoop try/catch、平台 tag 归一化。model-layer 212 例 **192 全上报、0 DISCONNECTED**（第二轮 180 未上报）。 |

### 12.3 第三轮新的未上报源

- **`building/` 批第 3 例反复 DISCONNECTED（karma 重启 3 次同点挂，~48/53 例损失）**——全量里唯一硬阻塞批次，主线程阻塞 >60s，为 fill-extrusion 高频用例，直接指向 §11.4 第 4 项（C3 几何烘焙）待排查。
- 其余批次（含此前崩溃的 fog/skybox/text-writing-mode/3d-intersections）全部跑完 0 DISCONNECTED；385 未上报源清零。

### 12.4 第三轮通过清单（212 例，按分类）

runtime-styling 64、geojson 17、combinations 10、appearance 7、feature-state 6、zoom-visibility 6、circle-radius 5、circle-color 4、icon-color 4、circle-geometry 4、fill-color 3、remove-feature-state 3、circle-blur 3、background-color 3、circle-opacity 3、imports 3、globe 3、filter 3、fill-opacity 2、terrain 2、icon-rotation-alignment 2、icon-image 2、config 2、fill-visibility 2、text-max-width 2、raster-extent 2、icon-halo-color 2、lighting-3d-mode 2、background-visibility 2、map-projections 2、line-width 2、icon-anchor 2、elevated-line-width 2、sparse-tileset 1、zoomed-fill 1、line-visibility 1、icon-halo-width 1、circle-sort-key 1、icon-rotate 1、circle-translate 1、fill-translate 1、symbol-visibility 1、fill-pattern 1、text-visibility 1、circle-stroke-width 1、3d-intersections 1、elevated-line-visibility 1、clip-layer 1、icon-size 1、icon-pitch-alignment 1、fill-extrusion-pattern 1、extent 1、text-pitch-alignment 1、worldview 1、placement 1、fill-antialias 1、zoomed-raster 1、fill-extrusion-base 1、tms 1、raster-visibility 1、icon-visibility 1、icon-opacity 1、fill-outline-color 1、empty 1。

### 12.5 下一步

1. **C3 fill-extrusion 几何烘焙**（§11.4 第 4 项，~143 例）——进度见 §12.6。
2. **icon-halo SDF shader**——可再收 icon-halo-* + runtime-styling icon-rotate 近失带 ~10 例。
3. 之后回 §11.4 第 5 项（raster/hillshade）与第 6 项（heatmap）。

### 12.6 C3 fill-extrusion 进度（2026-08-14）

**已完成并验证（几何层 ✅）**
- `MBTileDataEmitter` 新增 `emitExtrudedPolygon`：每 footprint 顶点复制 bottom(z=floor)/top(z=height)，`extrusionAxis` bottom=(0,0,0,0)/top=(0,0,Δh,1)，屋顶用 top 顶点 earcut、墙面 perimeter quad、`edgeIndex` 屋顶轮廓。世界单位=米（R=赤道周长），`fill-extrusion-height/base` 直接作 z。`getDecodedTile` 输出 extrusionAxis 顶点属性 + edgeIndex/edgeFeatureStarts。mesh 创建/挂载/visible 均验证正常。

**多源修复 ✅（架构清晰、高 ROI）**
- 原 `wireTileSources` 只接一个源（vector 优先，其次 geojson）→ `rect`(fill)+`geojson`(fill-extrusion) 等样式里 geojson 数据根本不解码（debug 证实 `sourceId=rect layer=geojson`）。
- 新增 `CompositeGeoDataProvider`：合并所有 GeoJSON 格式源（geojson/raster/rect/hillshade），每 feature 打 `_sourceId`，decoder 按 feature 源评估（`properties._sourceId ?? m_sourceId`）。单源走原始 provider（避免重序列化回归）；裸几何（Polygon/LineString/Point）wrap 成 FeatureCollection。
- 实测：fill-extrusion 9 例 mismatch 显著下降（opacity/default 98801→82085、terrain/flat-roof-over-border 110660→102747 等），opacity 首次渲染出黑色建筑；12 个对照分类回归全 +0（fill-color 0 mismatch 保持）。

**遗留阻塞（渲染层，需专项）**
- **visible tile set 漏中心瓦片**（本轮最终定位）：含 lng0/lat0 的中心瓦片**已解码（willRender=true）但 objects 未进 sceneRoot**——pitch-60 + 1 级 overzoom 下 FrustumIntersection/visible tile 计算只返回周边瓦片，建筑只从邻瓦片的未裁剪重复几何部分上屏（opacity 部分可见、color/literal 完全离屏）。疑点：FrustumIntersection 200k 上限在极端 pitch 下提前返回、或 overzoom 瓦片 level 与相机 zoom 的换算。已排除：材质/颜色/背面剔除/NaN/几何/RTE 定位（全部验证正确）。
- 已通过数仍 2（与 base3 相同）；渲染内容已出但未过像素阈值。
- `building/` 批的 DISCONNECTED 是长时运行负载偶发（隔离跑 50/53 完成无挂起），非确定性 bug。

> 调试要点：karma webpack 配了 filesystem 缓存，worker bundle 会用到旧代码——调试时用 `HARP_NO_HARD_SOURCE_CACHE=true`。

### 12.21 icon-text-fit 接线（2026-08-16）

**背景**：icon-text-fit 是单分类最大空白（41 例全 0 通过，§13.2 G3）。`MBMaterialPatchManager.applyIconTextFit` 是粗糙桩（对 `tile.objects` 的 `isSprite` 缩放），而真实 POI 走 `PoiRenderer.computeIconScreenBox`——桩从未执行，功能整体未接线。

**实现（对齐 mgl `shaping_shared.fitIconToText` + `shaping.ts:712-715`）**：
1. `MBTileDataEmitter.ts` symbol-icon 分支：当 `icon-text-fit !== 'none'` 且有 text-field 时，用与 text 分支相同的 shapeText 计算文本，发射 **anchor 相对**的四边（`_iconFitTextL/R/T/B`，px = em×textSize；`L = -hAlign×W`，`T = -vAlign×H`，mgl 的 anchor 移位）+ `_iconTextFit`/`_iconTextFitPadding`（[top,right,bottom,left]）。
2. `PoiBuilder.build`：透传四个字段进 `PoiInfo`。
3. `PoiRenderer.computeIconScreenBox`：fit 时 box 精确按 mgl 公式定位（`left = textL - pad[3]`、`right = textR + pad[1]`、`top = textT - pad[0]`、`bottom = textB + pad[2]`），fit 维度拉伸、非 fit 维度以自然图标尺寸居中于文本；**忽略 icon-anchor**（mgl 注释：fit 时 anchor 不生效）；Y 轴取反（mapbox 屏幕向下 vs three 向上，与已验证的 icon-anchor 路径一致）。
4. **非 SDF 图标不再被 icon-color 染色**（`PoiRenderer.addPoi`）：mgl `symbol.fragment.glsl` 仅对 `u_is_sdf` 图标应用 `v_fill_np_color`；非 SDF 直接采样纹理。修复后默认黑 `icon-color` 不再把 `label` 等普通图标渲染成黑块。

**验证**（Edge 150 headless + SwiftShader，`rendering-test-results/mbstyle-itf3/`）：
- **icon-text-fit 分类 0 → 7/41 通过**：none/width/width-padding/height/height-padding/both/both-padding（117–184px）。`both` 312→141、`height` 940→118、`both-padding` 2033→142。
- **anchor 语义正确**：width-text-anchor 5383→1992、both-text-anchor 8095→2357、both-text-anchor-icon-anchor 8201→2357（9 锚点箱位正确铺开）。
- **零回归**：icon-anchor 10/11、icon-color 4/5（非 SDF 染色修复连带）、icon-image 2/12、icon-halo-color 3/7 保持；mbstyle 单测 206 passing（+2 新用例，1 既有 circle-radius×2 失败与本次无关）。

**遗留（引擎级）**：
- `*-2x`（both-2x 11878）：fitted box 需按 devicePixelRatio 缩放（期望 192×80 physical vs 当前 168×40，高度恰 2× 差）——DPR 在 screenBox 坐标系的传播。
- `stretch-*`（9 例，3147–11041）：需 mgl `scaleShapedIconImage` 的 stretchX/stretchY 九宫格重栅格化（非均匀拉伸）。
- `text-variable-anchor`（40206–62233）与 `placement-line`（95790）：variable anchor 放置 + line placement，独立引擎特性。
- `*-text-anchor` 残余（1992–4595）：icon 箱位已正确，残余为文本未随 anchor 渲染（text 管线）。

### 12.22 fill-outline-color 接线（2026-08-16）

**背景**：fill-outline-color 8 例中 7 例近失（12–192px）。`MBMaterialPatchManager` 用 `fwidth(gl_FragCoord.z)` 边缘 hack 注入——平坦 fill 的深度导数恒 0，从不触发，轮廓从未渲染（`literal` actual 恒白）。

**实现（对齐 mgl `draw_fill.ts` stroke pass + `fill_outline` shader）**：
- mgl 轮廓 = 沿多边形边界的 ~1px **屏幕空间 AA 描边**（`lineIndexBuffer` 边界线段 + `alpha = 1 - smoothstep(0,1,dist)`）。不透明度 = `fill-outline-color` 自带 alpha × `fill-opacity`（`outline_color`/`opacity` pragma）。
- `MBTileDataEmitter.processFillFeature`：当 `paint['fill-outline-color']` 存在时，对外环 + 内环（holes）发闭合 polyline；经 `createLineGeometry` 生成 ribbon，把 2px 线宽烘焙进 `position`（与 `processLineFeature`/`emitRibbonFill` 同机制，SolidLineMaterial 的 GLSL 挤出在 SwiftShader 不栅格化），以 **fill technique**（`color=outline-color`, `opacity=fill-opacity`, `renderOrder=layer+0.5`）写入独立 Polygon geometry 组。
- 首版走 SolidLine 管线失败：`_preExtrudedLines` 标志无人消费，SolidLine 路径实际不渲染；改为 ribbon-fill（与 line-color 同解法）后轮廓上屏。
- 2px 线宽：1px ribbon 经 MSAA 峰值 ~50% alpha，2px 使中心全饱和（mgl 视觉 ~1px）。

**验证**（`rendering-test-results/mbstyle-foc3/`）：
- **2/8 通过**（default、function），`fill` 34→27、`literal` 104→52、`property-function` 193→127（pixelmatch 0.00075×4096≈4px 阈值，残余为 AA 边缘像素级差异：蓝色 (0,0,255) vs 期望 (24,24,233)，绿色 function 因 AA 分布巧合完全对齐而 0 mismatch）。
- `opacity`（fill-opacity 0.5 × outline alpha 1 → ~42%）与 `multiply`（outline alpha 0.5）语义已实现（`opacity: paint['fill-opacity']`，颜色 alpha 由 material adapter 携带）。
- **零回归**：fill-color 4/8、fill-opacity 2/9、fill-visibility 2/2、background-color 3/6 与 baseline 持平；mbstyle 单测 207 passing（+1 outline 用例，1 既有 circle-radius×2 失败无关）。

**遗留**：残余 mismatch 均为 1–2px AA 边缘对齐（top-row white 被 pixelmatch 判 mismatch）；与 line-color 337px 同源（AA/线宽舍入）。

### 12.23 icon-size camera 函数求值修复（2026-08-16）

**背景**：icon-size 9/18 近失。`camera-function-*` 用例（`icon-size: {"stops":[...]}` zoom 函数）actual 恒为 ~0.9× 期望——排查（埋点确认）根因是**解码器用整数瓦片级别求值 zoom 函数**：style zoom 0.5 → 相机 zoom 1.5 → 数据 zoom 0.5 → 瓦片级别 floor 到 0 → 解码器 `zoom = tileKey.level - storageLevelOffset - 1 = 0`，`icon-size` 在 zoom 0 求值 = 1 而非 1.5。

**修复（对齐 mgl `symbol_size.getSizeData`——camera 函数在连续相机 zoom 求值）**：
1. `MBStyleDecoder` 新增 `m_mapboxZoom`（自定义选项），`decodeThemedTile` 用它代替整数瓦片级别推导（无则回退）。
2. `MBStyleDataSource` 新增 `pushMapboxZoom()`：`applyCameraSettings` 后 + 每次 `AfterRender` 把 `mapView.zoomLevel - 1`（mapbox zoom）configure 进解码器。
3. 顺带确认 harness 初始相机未设 style.zoom 的问题：`MBStyleCompatRenderTest` 在 MapView 创建后按 `style.zoom+1`/`style.center` 定位相机（`applyCameraSettings` 实际已处理，此条为防御）。

**验证**（`rendering-test-results/mbstyle-isize5/`）：
- **icon-size 4/18 → 9/18 通过**（+5）：camera-function-sdf/plain、composite-function-sdf/plain/both-scale 全部通过（0–1 mismatch），camera-function-high-base-sdf、default、small-stretch-area 保持。
- 近失：camera-function-high-base-plain 13、function 16、composite-function-both-scale 10。
- 尝试 raster-sprite 优先（对齐 mgl `_loadIconset` 对非 Mapbox URL 回退 raster）——icon-size 再 +2（plain 1→0），但 `icon-image/stretchable` 3060→11688 回归（pbf 渲染的 stretchable 图标更贴合基线），**已回退**。
- **零回归**：icon-color 4/5、icon-anchor 10/11、icon-image 2/12 持平；mbstyle 单测 208 passing（+1 camera-function iconScale 用例，1 既有 circle-radius×2 失败无关）。

**遗留**：
- `*-rasterized`（432–3793）：mgl 按 `getRasterizedIconSize` 在 maxSize 栅格化再缩放，单 atlas 位图无重栅格化。
- `property-function-*`（152–2092）：数据驱动 icon-size 按要素求值，多要素共享 technique 的装箱问题。
- `literal` 139 / `function` 16 / `depends-on-coalesce-image` 681：AA 边缘（icon 渲染 0.9× box，与 mgl 基线差 1–2px）。

### 12.24 icon-halo-blur SDF 公式对齐（2026-08-16）

**根因**：icon-halo-blur 5 例全近失（6–270px）。`IconMaterial` 的 halo 用 `smoothstep(edge - width - blur, edge - width, d)` 单侧扩展，blur 换算 `×0.094` 偏小——mgl `symbol.fragment.glsl` 是**居中 gamma**：`buff = (6 - halo_width)/SDF_PX`（SDF_PX=8）、`gamma = (halo_blur×1.19/SDF_PX + EDGE_GAMMA)/(fontScale×gamma_scale)`、`alpha = smoothstep(buff-gamma, buff+gamma, dist)`。旧公式 halo 环过窄、blur 过窄（0.094 vs 1.19/8=0.149）。

**修复**：
1. `flywave-materials/IconMaterial.ts` fragment：halo 改居中 smoothstep——`haloBuff = uEdge - uHaloWidth`、`haloGamma = uHaloBlur + uGamma`、`haloA = smoothstep(haloBuff-haloGamma, haloBuff+haloGamma, d) × (1-fillA)`。
2. `PoiRenderer` batch 换算对齐 mgl：`widthField = width/8`、`blurField = blur×1.19/8`（原 `×0.094`）。

**验证**（`rendering-test-results/mbstyle-hb2/`）：
- **icon-halo-blur 0/5 → 4/5 通过**：default/function/literal/powevr-workaround 全过（0–2px）。
- **icon-halo-width 3/4 → 4/4**（literal 从近失转通过）。
- **icon-halo-color 3/7 → 5/7**（同一 SDF halo 公式连带收益；multiply/opacity 98px 遗留为半透明 blend 边缘）。
- 遗留：`property-function`（数据驱动 blur，205px，双要素 halo 外缘差）。

### 12.25 icon-rotate 旋转接线（2026-08-16）

**实现（对齐 mgl `quads.getIconQuads`——tl/tr/bl/br 四角绕中心旋转 angle=iconRotate×PI/180）**：
1. `MBTileDataEmitter` symbol-icon 分支发 `_iconRotate`（`l['icon-rotate'] ?? 0`，布局属性）。
2. `PoiBuilder`/`PoiInfo` 透传 `iconRotate`。
3. `BoxBuffer.addBox` 新增可选 `rotateDeg`：4 个 box 角绕中心旋转（此前 axis-aligned）。

**验证**（`rendering-test-results/mbstyle-irot/`）：icon-rotate/literal 48→46、property-function 53→31（旋转已生效，残余为对角线 AA/箭头形状）；with-offset 107 PASS 保持。icon-color 4/5、icon-anchor 10/11、icon-size 8/18 零回归。

**遗留**：icon-rotate 残余 31–46px 为 oneway 图标 45° 对角 AA + 既有 icon-size 0.9× box 基线。

### 12.26 heatmap 双 pass 持久 kernel 缓存（2026-08-16）

**根因（heatmap 间歇性空白）**：`Tile.attachGeometryLoadedCallback`（`Tile.ts:1106-1111`）在几何加载完成即 `removeDecodedTile()` 清空 `m_decodedTile`。`MBHeatmapRenderer.run()` 每帧 `getDecodedTiles()` 读 `tile.decodedTile.heatmapPoints`——只在**加载中的短暂窗口**有 kernel，之后恒空 → heatmap 随机空白（hm5 有 blob、hm7/hm9 无）。

**修复**：
1. `MBHeatmapRenderer` 新增 `m_tileKernels: Map<Tile, {kernels, techniques}>`：run() 首见某 tile 时快照其 `decodedTile.heatmapPoints` + techniques 入缓存；每帧按 `getDecodedTiles()` 存活集修剪。
2. `buildGroups` 改收 `Array<{kernels, techniques}>`（不再读 `tile.decodedTile`）。
3. `dispose()` 清缓存。

**验证**（`rendering-test-results/mbstyle-hm10/`，mgl `ZERO=1/255/16` 对齐）：
- heatmap 从**间歇空白**变为**稳定渲染**：heatmap-radius/data-expression 324→308、opacity/default 3983→649、color/default 15675→9234、weight/default 31389→19547。
- 208 单测通过（heatmap 分组测试改新签名，1 既有 circle-radius×2 失败无关）。
- 遗留：data-expression blob 40×14 vs 期望 45×20（kernel/ramp 密度阈值校准，G6 精度项）。

### 12.27 G7 验收：fog / skybox / 3D-lights / heatmap 全量跑（2026-08-17，5 个 commit：1b1c5d34 → 23525745）

> §14 冻结后（08-16 `cce6f1f1`）新增的 5 个 commit 全部落地，本机 Edge 151 headless + SwiftShader 全量验收。运行命令：
> `CHROME_BIN=…/Microsoft Edge MBSTYLE_PORT=8099 MBSTYLE_REPORT=rendering-test-results/mbstyle-g7 node scripts/run-mbstyle-render-tests-chunked.js fog skybox lighting-3d-mode heatmap-color heatmap-intensity heatmap-opacity heatmap-radius heatmap-weight`
> 注：heatmap 是 5 个独立顶层分类（heatmap-color/intensity/opacity/radius/weight），无顶层 `heatmap` 目录——用 `heatmap` 单参数不命中。

**修复内容回顾**：`1b1c5d34` mapbox fog 模型（指数衰减 + atmosphere 渐变 dome）；`e80f71d8` skybox 径向渐变接线 + 命名色 parseColor；`fb111e14`/`2d56278e` lighting-3d-mode 3D lights（默认方向 + 背景光照时序 + ground radiance sRGB→linear）；`23525745` heatmap 双 pass 通道对齐（density 存 R、alpha 恒 1）。

**结果汇总（231 用例目标，235 上报含 model-layer/map-projections 子路径误命中的 8 例）**：

| 分类 | 上报 | 通过 | 近失（≤600px） | 未上报 |
|------|-----|-----|---------------|--------|
| lighting-3d-mode | 114 | **10** | 3 | 6（bright-v9 pitch-0/45/65/85、fill-extrusion rounded-flat-roof、shadow fill-extrusion-flat-roof——重型 3D 用例挂起） |
| fog | 62 | 0 | 3 | 1（dithering-runtime-off） |
| skybox | 33 | **1** | 0 | 1（atmosphere-padding） |
| heatmap（5 子类合计） | 18 | 0 | 1 | 0 |
| **合计（G7 四域）** | **227** | **11** | **7** | **8** |

**通过的用例（11）**：
- lighting-3d-mode 10：`background/color-ambient`、`color-ambient-directional`、`color-light-pitched-45`、`emissive-strength-draped-mrt/background|fill|fill-outline`、`emissive-strength/background|fill`、`fill`、`fill-outline` —— 3D-lights ground radiance 公式 + 颜色空间修复的直接收益（baseline4 中 lighting-3d-mode 为 2）。
- skybox 1：`gradient/default`（baseline4 0）。

**近失（7，第一梯队）**：`fog/space-color-use-theme` 39、`fog/2d/fill-outline` 418、`fog/2d/line-gradient` 591、`lighting-3d-mode/circle/stroke` 360、`emissive-strength-draped-mrt/fill-pattern` 291、`fill-outline-pattern` 98、`heatmap-radius/data-expression` 308。

**判定**：
- **lighting-3d-mode 整域从全红转绿**（2→10），ground 层光照（background/fill/emissive）已对齐，剩余为 fill-pattern/stroke 等子域 + 6 个重型 3D 未上报。
- **fog 模型已出效果**（不再全屏饱和错色），但 0 通过——`space-color-use-theme` 39px 最接近；fill-outline 418/line-gradient 591 为 fog 与 2D 层叠加的既有精度项。
- **skybox gradient 已对齐**（default 通过），atmosphere/其余子域仍差。
- **heatmap 通道对齐未带来新通过**（data-expression 308px 与 §12.26 相同）——density→ramp 阈值校准仍是 F3 主线。
- 单测 257 passing + 2 既有失败（RawShaderMaterial、circle-radius×2），tsc 全绿，5 个 commit 无回归。

### 12.28 heatmap 双 pass 对齐 mgl 全链（2026-08-17，commit `6fa78651`，§14 F3 落地）

**根因（§14 F3 三要素 + 2 个新发现 bug）**：
1. **密度 FBO 分辨率**：mgl 用 `painter.width*0.25` offscreen FBO（`draw_heatmap.ts:37-40`，RGBA16F）+ 双线性上采样回屏——点采样累积 + upsample 塑造可见密度场（peak 降至 0.13-0.31、尾部展宽）；我们全分辨率 RGBA8。
2. **默认 heatmap-color ramp 错误**：`MBLayerEvaluator.paintDefs` + emitter 默认 `[[0,rgba],[0.5,blue],[1,red]]`（只有蓝→红）；spec 默认是 `0/transparent, 0.1/royalblue, 0.3/cyan, 0.5/lime, 0.7/yellow, 1/red`。所有未显式设置 heatmap-color 的用例此前只渲蓝。
3. **命名色 parseColor 被 r178 ColorManagement 污染**：`new THREE.Color('royalblue')` 在 linear-srgb 工作空间返回 `(0.053,0.141,0.753)`，`Math.round(r*255)=13` → 命名色 ramp 全偏暗（royalblue→(13,36,192)，期望 (65,105,225)）。修 `convertLinearToSRGB()`。纯色（cyan/lime/red/yellow）不受影响故此前未暴露。
4. **heatmap-color 表达式 ramp 全黑**：`p['heatmap-color']` 为编译后表达式对象 `["memo",["interpolate",...]]`（`MemoCallExpr` 序列化），`normalizeGradientStops` 只认 `raw[0]==='interpolate'` → 返回空 → 黑 texture。修：JSON 规范化非 Array 对象 + 循环解包 `memo`。
5. **composite premultiplied blend**：mgl `gl_FragColor = color*u_opacity`（已预乘），`colorModeForRenderPass()` = `[ONE, ONE_MINUS_SRC_ALPHA]`；我们用 NormalBlending（`[SRC_ALPHA, ONE_MINUS_SRC_ALPHA]`）→ opacity<1 双重预乘偏暗（heatmap-opacity/literal act (191,128,128) vs 期望 (255,127,127)）。修 CustomBlending ONE/OneMinusSrcAlpha。

**额外**：反子午线 world copies（`projectToPx(k.x±R)`，R=赤道周长）——mgl offscreen pass 遍历 MultiTileID 含回绕副本；antimeridian 用例 x=0 处已出核但仍 4786px（密度峰值 cyan vs 期望 lime，深水区）。

**实施**：`MBHeatmapRenderer`（0.25× FBO + HalfFloat、composite blend、world copies）、`MBLayerEvaluator` + `MBTileDataEmitter`（默认 ramp）、`MBMaterialPatchManager`（parseColor sRGB + normalizeGradientStops memo 解包）。

**验证**（`rendering-test-results/mbstyle-hm20/`，Edge headless + SwiftShader，`HARP_NO_HARD_SOURCE_CACHE=true`）：
- **heatmap 0/18 → 15/18**：heatmap-opacity 3/3（default/function/literal）、heatmap-intensity 3/3、heatmap-weight 3/3、heatmap-color 2/2（default + expression 全黑修好）、heatmap-radius 4/7（default/literal/function/data-expression）。data-expression 从 308px 近失 → 通过，density 场与 mgl 逐 texel 一致（0.25× 模拟验证）。
- tsc 绿；单测 257 passing + 2 既有失败（RawShaderMaterial、circle-radius×2）无回归。
- **遗留**：`heatmap-radius/antimeridian`（4786px，回绕副本密度偏 cyan vs 期望 lime）、`pitch30`（16181px，俯仰地面平面 quad 椭圆化未实现）、`projected`（13060px，自定义投影）。

### 12.7 icon-halo SDF 渲染（2026-08-14）

**背景**：SDF 图标（dot.sdf 等）在 loadSpriteAtlas 注册时被二值化成硬边位图，SDF 场被销毁 → halo（需要距离场外扩轮廓）无法绘制。icon-halo-* 12 例近失（44–100px）与 icon-rotate/runtime-styling 边缘抖动同根因。

**5 步修复（全部落地）**
1. `MBTileDataEmitter.ts` icon 分支增发 `_iconHaloColor/_iconHaloWidth/_iconHaloBlur`（私有前缀，不动 protocol）。
2. `PoiBuilder` 仿 iconColor 用 `getPropertyValue` 读三个 halo 属性进 `PoiInfo`（新增 iconHaloColor/Width/Blur 字段）。
3. `MBStyleDataSource.loadSpriteAtlas`：sdf 图标保留原始 alpha 场（RGB 置白），`ImageItem` 加 `sdf?` 标志并在注册时设置。
4. `flywave-materials/IconMaterial` 加 SDF 模式：uniforms `uIsSdf/uEdge(0.75)/uGamma/uHaloColor/uHaloWidth/uHaloBlur`，fragment 分支：
   `fillA = smoothstep(edge±gamma, d)`，`haloA = smoothstep(edge-width-blur-gamma, edge-width+gamma, d)*(1-fillA)`，输出 `rgb = vColor.rgb*fillA + uHaloColor.rgb*vColor.a*haloA`（premultiplied）。
5. `PoiRenderer` batch 接线：sdf 图标 batchKey 追加 halo 签名（width/blur 换算 field 单位 ×0.094、haloColor hex），构造 `IconMaterial` 时按 `imageItem.sdf` + halo params 配置。

**实测**：icon 全批 18 分类 0 回归；净增 **+4 通过**（icon-halo-color/literal、icon-halo-width/function、icon-halo-width/property-function、runtime-styling/set-style-layer-change-source）。近失大幅下降：icon-halo-color/property-function 98→8、icon-halo-width/function 102→3、width/property-function 66→0、blur/default 44→6。icon-halo-blur 系列仍失败（104–270，blur 的 mapbox 单位换算待第二阶段）；icon-halo-color/multiply 44→98（半透明红 halo + multiply blend 边缘，黑引用）。

**遗留**：icon-halo-blur 系列、icon-halo-color/multiply 的 blend 处理；halo 的 icon-scale 补偿（第二阶段）；非 SDF 图标（pbf vector 357 个）不受影响。

### 12.8 轨道相机修复 + 高 pitch 挂起（2026-08-14）

**根因（用户排查）**：`MapView.setCameraGeolocationAndZoom` 用 `setRotation` 只转四元数不移机位 → pitch 60 时视点偏离 style 中心 ~91m → 中心瓦片落出视锥。此前「材质颜色正确但全白」「字面 vs 数据驱动」均为表象。已修：
- `MapView.ts`：改用 lookAtImpl 轨道语义（目标钉屏幕中心）；
- `MBStyleDataSource.ts`：删 `-log2(cos(pitch))` 补偿；
- 连带修复：`MBMaterialPatchManager.patchTile` 门控失效、高度重复缩放、共享 geometry 多 technique 颜色覆盖、FLAT_SHADED vNormal 编译错误、无光源补默认环境光、MapViewTest.ts:114 跳过测试重写。
- fill-extrusion 四用例 mismatch：38574→1375、28662→1439、31124→1011、40179→11315。vs baseline3 重叠 617 例：+8 通过、3 新失败（已修）。

**高 pitch 挂起（本轮修复）**：轨道相机在 pitch 73.5（dynamic-filter/symbols/point/combined-pitch-distance/high-pitch-far-hidden，zoom 10.85）下 >300s 挂起（每帧渲染/几何创建重，非 compute 本身）。修复：`FrustumIntersection` 的 area 细分停止（瓦片屏幕面积 < target 时停止细分，保留为低 zoom overzoom 瓦片）在 **pitch > 60° 时也生效**（原仅 m_enableMixedLod）。实测：该用例 9.6s 完成（原 >300s）；回归抽样 15 分类净 +2（fill-color +1、icon-halo-color +1），fill-extrusion 改善保持（1375/1439/1011/11315 与 fix1 一致）。

**后续**：全量套件现已可单趟跑完（此前提 575/3026 断开）。剩余 fill-extrusion 失败（opacity/*、vertical-gradient、zoom-function 颜色）属表达式求值/光照对齐，与本次阻塞无关。

### 12.9 第四轮全量基线（2026-08-15，轨道相机 + halo + 高 pitch 修复后）

| 指标 | 第二轮（08-13） | 第三轮（08-14） | 第四轮（08-15） | Δ(4 vs 3) |
|------|----------------|----------------|----------------|-----------|
| 上报结果 | 2646 | 2765 | 2827 | +62 |
| **通过** | **204（7.71%）** | **212（7.67%）** | **231（8.17%）** | **+19** |

> 第四轮结果目录：`rendering-test-results/mbstyle-baseline4/`；通过清单：`baseline4-pass.txt`。

**净变化（vs 第三轮）**：净增 +20、净失 1。
- **净增 20**（本轮修复直接收益）：
  - 轨道相机 + fill-extrusion：`combinations/fill-extrusion-translucent--*` 5 例、`fill-extrusion-edge-radius-narrow-corner`、`fill-color/zoom-and-property-function`、`dynamic-filter/symbols/point/combined-pitch-geojson-distance`
  - halo：`icon-halo-color/literal`、`icon-halo-width/function`、`icon-halo-width/property-function`、`runtime-styling/set-style-layer-change-source`
  - 其他（用户修复连带）：`circle-camera-orthographic-projection`、`circle-pitch-alignment/viewport-scale-viewport`、`circle-pitch-scale/viewport`、`line-sort-key/long-key-values`、`measure-light/*` 3 例、`slots/set-layer-imported-slot`
- **净失 1**：`appearance/paint-icon-and-text`（0→27px，阈值边缘，SDF/AA 亚像素差）。

**运行质量**：**0 新 DISCONNECTED**（此前 model-layer 批崩溃点已修复、building 批不再挂起、高 pitch 批 9.6s 完成）；全量 3026 用例**单趟跑完**（此前提 575/3026 断开）。仅 dynamic-filter 批因单个重测试主线程阻塞 >60s 触发 karma 重启重跑（最终仍完成，批内用例部分重算）。

**遗留**：fill-extrusion 仍 0 通过（近失 1011-11315 为表达式求值/光照对齐，需专项）；appearance/paint-icon-and-text 阈值边缘；dynamic-filter 批个别重测试的 ping 超时（负载相关）。

### 12.10 harness 竞态修复（2026-08-15）

**问题**：`renderFrames` 只等 N 个 AfterRender 帧即截图，瓦片可能仍在加载 → paint-icon-and-text（base4 0→27）、line-color 等 flake，基线数字不可信。

**修复**（`MBStyleCompatRenderTest.ts` renderFrames）：N 帧后若 `isDynamicFrame`（瓦片未全加载/有 pending 更新）为真，再等一个 `FrameComplete` 事件（瓦片全加载 + 无 pending 后触发）；若已 settle 直接返回——**不额外 update**（否则重排文本破坏 text-max-width/force-double-newline 这类像素完美用例，实测多 update 使其 0→全白）。

**验证**：paint-icon-and-text 恢复 0 mismatch 通过；force-double-newline 保持 0；回归 12 分类净 +2（appearance），其余 0 回归。

> 注：line-color/default 337px 是已知 AA/线宽舍入差（非竞态），与 elevated-line 338px 同源。

### 12.11 fill-extrusion 表达式求值 / 光照排查（2026-08-15）

**结论**：fill-extrusion 剩余失败分两类，均需专项：
1. **颜色 stops 求值**：`fill-extrusion-color/property-function`（11315）布局正确、红/绿/蓝三建筑颜色**已正确**；剩余差为**墙面光照明暗**（expected 墙 197-255 两档，current 全 255 均匀）——非颜色求值问题。
2. **光照模型/墙法线**（核心阻塞）：无光源 style 下补 DirectionalLight（intensity 0.5，mapbox 默认方位）+ 改 extrusionAxis.w=0（墙面用 FLAT_SHADED 导数法线）**均无效**——墙面颜色恒为 90/153=0.59（改光强度墙色不变），说明光照根本未作用于墙面，疑点指向 extrusion shader 的 FLAT_SHADED 法线计算（`cross(dFdx,dFdy)` 对所有墙片元产出同向法线）或材质未接场景光。已回退实验改动（保持 fix1 的 Math.PI ambient + w=1），需专项攻 `ExtrusionChunks.extrusion_normal_fragment_begin`。
3. 附带：部分 fill-extrusion expected 为黑底参考（透明合成黑），与 harness 白底 clear 色的背景差占 mismatch 一部分。

**已保持**：fill-extrusion 4 通过（combinations/fill-extrusion-translucent--* 3 + edge-radius）、harness 竞态修复（paint-icon-and-text 0、force-double-newline 0）、高 pitch area 停止。实验改动全部回退，代码库处于 fix1 + 本轮确定修复的干净状态。

### 12.12 dynamic-filter 批 ping 超时修复（2026-08-15）

**问题**：dynamic-filter 批（含 feature-state/color-theme，84 例）在全量长时运行下于 71/84 处 DISCONNECTED（主线程偶发阻塞 >60s，karma 默认 pingTimeout 误判）→ 整批重跑浪费 ~10min。

**修复**：
- `karma.options.js`：加 `pingTimeout: 180000`（浏览器响应 ping 超时 60s→180s），合法慢用例（SwiftShader 下重负载 3D）不再误判断开。
- `MBStyleCompatRenderTest.ts`：`this.timeout(60000)→180000`（与 pingTimeout 对齐，避免 mocha 先于 karma 掐断重用例）。

**验证**：feature-state+color-theme+dynamic-filter 批 **84/84 完成、0 DISCONNECTED**（9min47s，原 71/84 断开重跑）。隔离确认 dynamic-filter 27/27 均可完成（无真实挂起，仅负载慢）。

### 12.13 text 域 SDF 像素精度评估（2026-08-15）

近失（15-500px，真实引用）排查结论，三类阻塞：
1. **引用损坏（24%）**：63/258 text-* expected 为纯黑空图（text-size/*、text-halo-width/default 等）——参考数据未捕获文字，渲出字反而 mismatch，不可修。
2. **SDF 亚像素精度**：`text-line-height/data-driven`（34px，真实引用）diff 为多字形边缘抗锯齿差（非系统性）；行高求值已正确（0.8/2 的 pitch 12.8/32px 与 mapbox 一致）。属报告第二阶段深调。
3. **text halo 功能缺口**（text-halo-* 309-425）：全链路无 halo。与 icon halo（批级 uniform）不同，同一 canvas 内不同标签 halo 参数不同 → 需改 TextCanvas 顶点格式（vColor 后加 halo 属性），大幅改动。

**结论**：text SDF 精度短期 ROI 低（引用损坏占大头 + 深调/大改）。当前代码库 = fix1 + 本轮确定修复（harness 竞态、高 pitch area 停止、ping 超时），全量基线数字可信。建议下轮转 fill-extrusion 光照的 `ExtrusionChunks` 法线专项或 heatmap 双 pass（C4）。

### 12.14 fill-extrusion 光照专项排查 + 3-digit hex 修复（2026-08-15）

**发现 1：`parseStringEncodedColor` 不支持 3 位 hex**（`StringEncodedNumeral.ts`）：正则只匹配 `#RRGGBB`/`#RRGGBBAA`，`#999` 解析失败 → `applyMaterialBaseColor` 早退 → 材质保持默认白。已修复（`#RGB`/`#RGBA` 展开），零回归（9 分类净 0），是真实正确性 bug。

**发现 2：extrusion shader chunks 未注入**：`ExtrusionFeature.isEnabled` 要求 `extrusionRatio != DEFAULT_RATIO_MAX(=1)`；本管线 `animateExtrusion=false` → ratio=1 → **chunks 全部未注入** → 材质是普通 `MapMeshStandardMaterial`（无 extrusionAxis 用法、无 FLAT_SHADED 法线覆盖）→ 墙面 NdotL 恒定（光照不作用墙面）与墙体着色缺失的机制。

**发现 3：颜色管线**：材质色已正确应用（#999999，afterSetRGB 验证），但墙面渲染恒为 90（#999×0.59 或白×0.35 巧合相等）——亮度由 sRGB/linear/tone-mapping 管线 + 未注入 lighting 主导，非材质色问题。

**结论**：墙面着色需要 `isEnabled` 门控放开（让 extrusion chunks 注入）+ 颜色管线校准 + 法线计算验证，是渲染引擎深水区，专项需多轮迭代。当前代码库 = fix1 + 本轮确定修复（3-digit hex、harness 竞态、高 pitch、ping 超时）。

### 12.15 fill-extrusion 墙面光照落地（2026-08-16）

**方案（绕过 extrusion chunks 注入，直接在 patcher 实现 mapbox 公式）**：
- `MBEnvironmentManager` 新增 `extrusionLightState`：mapbox **默认光** `{position:[1.15,210,30] spherical, color:white, intensity:0.5}`（mapbox 无 `light` 时也恒有默认光），并记录 `use3DLights`（样式用 3D `lights` API 时为 true）。
- `MBMaterialPatchManager.patchExtrusionMaterial`：删掉原来错误的 `mix(0.6→1.0, vMBHeight)` 垂直渐变；改为按 `fill_extrusion.vertex.glsl` 公式在 fragment 注入：
  1. `colorvalue = luminance(paint)`；`color += 0.03`（ambient）。
  2. `NdotL = clamp(dot(worldFlatNormal, lightDirWorld), 0, 1)`（FLAT_SHADED 导数法线 × `camera.matrixWorld` 转世界系；光方向按 viewport anchor 旋转 `-bearing`）。
  3. `NdotL = mix(1-intensity, max(1-colorvalue+intensity, 1.0), NdotL)`。
  4. 侧面（`abs(worldN.z)<0.5`）：`NdotL *= (1-vg) + vg*clamp((vMBHeight+base)*pow(height/150,0.5), r, 1)`，`r=mix(0.7,0.98,1-intensity)`。
  5. `result = clamp((paint+0.03)*NdotL*lightColor, mix(0,0.3,1-lightColor), 1)`。
- **颜色空间**：mapview 渲染输出为 linear（`colorspace_fragment` 恒等），故注入在 fragment 里对 `gl_FragColor.rgb`（linear paint）先 `linearToSrgb` 再做 mapbox sRGB 算术，输出前 `srgbToLinear` 还原，使最终捕获结果 = mapbox 参考。
- 3D `lights` 样式（如 `data-driven-zero-alpha`/`no-alpha-no-multiply`，走 `LIGHTING_3D_MODE`）保持原 `injectLighting` Lambert 路径，不套 legacy 公式（避免双重重阴影）。

**验证**：`fill-extrusion-color/literal` 屋顶 `(11,11,255)`、墙面 `(6,6,212)` 与 expected **逐像素一致**（此前墙面为 `(0,0,250→211)` 错误渐变）。fill-extrusion-color 分类净 **−2487 px**：property-function 11315→9048、no-alpha-no-multiply 38341→38023、default 1427→1414、use-theme 1369→1408；data-driven-zero-alpha 15280→15313（3D-lights 路径保持基线）。3 个既有通过项（edge-radius-narrow-corner/tile-border/pattern-missing）无回归，组合分类既有通过无回归。残余 ~1400px 为**屋顶/墙面边界 2px 几何偏移**（预存在，非光照）。

**遗留**：fill-extrusion `function`/`zoom-and-property-function`（期望紫色/zoom 插值）仍全蓝——zoom 函数求值偏位（预存在 Z2 问题）；fill-extrusion-opacity 半透明叠加（translucent 组合）未对齐；屋顶/墙面边界偏移。3D `lights`（lighting-3d-mode 116 例）仍需专项。

### 12.16 icon-anchor 落地（2026-08-16）

- `MBEnvironmentManager`/`MBMaterialPatchManager` 之外，`flywave-mapview` 的 `PoiRenderer.computeIconScreenBox` 现在识别 `_iconAnchor`：按 mapbox `shapeIcon` 对齐语义 `(0.5 - hAlign)*w / (vAlign - 0.5)*h`（注意 mapbox Y 屏幕向下 vs three Y 向上，垂直方向取反）把图标盒移到锚点。
- `MBTileDataEmitter` symbol 分支：`props._iconAnchor = layout['icon-anchor']`；`icon-offset`（em 单位）→ `iconXOffset/iconYOffset`（px = em × icon-size，y 取反）；`icon-allow-overlap`/`icon-ignore-placement` → 原生 `iconMayOverlap`/`iconReserveSpace`（此前只设 `mayOverlap`/`reserveSpace`，PoiBuilder 读的是前者）。
- `MBExpressionEngine` 增加 legacy `{type:'identity', property:'x'}` 函数求值（返回 feature property）；`MBLayerEvaluator.isExpr` 同样识别 identity 对象，使其进入 per-feature 求值。

**验证**：icon-anchor 分类从 **2/11 → 9/11**（default/center/left/right/top/bottom/四角 全 0px 通过）；baseline4 既有通过项（icon-color/icon-image/icon-halo 等）零回归。剩余：property-function（identity 已求值但 9 个同点要素仅放置 1 个——原生 Placement 深水区）；icon-rotate（48-53px，引擎无 rotation 支持）；icon-translate（~8000px，mvt 符号源空白，同 R4 fixture/符号管线）。

### 12.17 line 数据驱动 ribbon 深化（2026-08-16）

- `MBTileDataEmitter` ribbon-fill technique 打 `_isLineRibbon` 标记；`MBMaterialPatchManager.patchFillMaterial` 对 ribbon-fill 关闭 depthTest/depthWrite（共面 ribbon 不互相深度裁剪，靠绘制顺序决定交叉处颜色）。
- 核对 `getOrCreateRibbonTechniqueIndex`（§8 `82cad1fa` 已按 color+opacity 分键）与 `emitRibbonFill` 逐 feature 发几何：categorical line-color 6 类全部正确分派（path→red/service→yellow/street→blue/main→purple 等，已逐类验证）。

**验证**：line-color/property-function 从 **~36k → 1088px**（§8 后进一步确认）；property-function-identity 160px；line-color/default 337px。baseline4 既有 line 通过项（line-width/visibility/dash 等）零回归。剩余 1088px 为**交叉处 per-color mesh 批量 vs per-feature 顺序**差异（mapbox 单 mesh 逐要素顶点色，我们按颜色分 mesh；交叉处红黄覆盖顺序不完全一致）——引擎级（需 vertex-color 或 per-feature object）。

### 12.18 legacy 颜色 stop 插值修复（2026-08-16）

**根因**：`MBExpressionEngine` 的 legacy `{stops:[[zoom,value],...]}`（zoom 函数）与 zoom-and-property 网格函数的颜色插值只处理 `#hex`（`a[0]==='#'`），命名色（'blue'/'red'/'yellow' 等）不插值 → `fill-extrusion-color/function` 在 zoom 18 恒返回首个 stop 的 blue（应 interpolate 成 purple）。

**修复**：新增 `MBExpressionEngine.isColorString()`（hex / rgba()/hsla() / 命名色）；`evaluateLegacyStops` 与 `evaluateLegacyZoomAndProperty`（zoom 插值 + property 插值两处）在两端都是颜色时一律 `interpolateColor`。

**验证**：
- `fill-extrusion-color/function`：**39393 → 1732px**，紫色 (184,10,184) vs 期望 (183,10,183) 逐像素对齐（残余为屋顶/墙面边界偏移）。
- `fill-extrusion-color/zoom-and-property-function`：**34125 → 8981px**，zoom 18 下 green/gray/purple 三色全部正确（134/135,135,135,182/184,10,182）。
- 表达式引擎回归：数值插值（@18→2）、hex 插值（#800080）、categorical、interval 均正确；identity 无回归。
- 回归套件（circle-color/radius、fill-color、line-color 17 通过）baseline4 零回归。

---

## 13. 测试空白主要原因分析与对齐排序（2026-08-16）

> 依据 §10–§12 全部修复记录 + 08-16 逐分类复跑结果（`rendering-test-results/mbstyle-*`，最新一轮，495 用例）整理。最新全量基线为 baseline4（08-15）：**231/2827 通过（8.17%）**，0 DISCONNECTED。

### 13.1 主要空白原因（按优先级）

| # | 原因 | 影响分类（用例） | 关键证据 |
|---|------|----------------|----------|
| G1 | **引擎级材质/shader 缺口**（SolidLineMaterial 无 blur/offset/join/cap、CirclePointsMaterial 无 blur/stroke、TextCanvas 无 halo、POI 无 rotation props） | line-blur/offset/join/cap、elevated-line-*、circle-blur/stroke、text-halo-*、icon-halo-blur、icon-rotate | line-join 6/11 近失、line-cap 2/4 近失、icon-halo-blur 5/5 全近失（6–270px）、line-color 已到 1088px；文档 P1.2/P1.3/P1.5、C7 |
| G2 | **fill-extrusion/building 渲染收口**（zoom 函数求值偏位 Z2、屋顶/墙面边界 2px、facades/roof-shape/conflation 未实现） | fill-extrusion-*（~143）、building（53） | fill-extrusion-color 1414–15313px（0 通过）、building 30 例 140k–253k 空白、depth-occlusion 0/14 |
| G3 | **icon-text-fit 0/41 未排查**（patcher applyIconTextFit 可达但未验证文本缩放进 icon 盒语义） | icon-text-fit（41） | 全 0 通过，仅 2 近失 |
| G4 | **text 域引用损坏 + SDF 亚像素精度**（63/258 期望图为纯黑空图不可修） | text-*（~273） | §12.13；text-line-height 34px、halo 需引擎级 |
| G5 | **raster/image 纹理仍未上屏**（双路径未收口） | raster（~85）、image（20） | raster-opacity 121k、image/raster-brightness 158k |
| G6 | **heatmap 双 pass 刚落地待微调** | heatmap（18） | **✅ 已对齐（08-17，§12.28）：0→15/18**（opacity/intensity/weight 全绿）；遗留 antimeridian/pitch30/projected 3 例 |
| G7 | **fog/skybox/lighting-3d 代码已落地未验收** | fog（63）、skybox（34）、lighting-3d-mode（116） | **✅ 已验收（08-17，§12.27）**：lighting 10 通过、skybox 1、fog 0（近失 3）；剩余为 fog 像素级对齐 + lighting fill-pattern/stroke 子域 |
| G8 | **model-layer 内容不对齐 / depth-occlusion** | model-layer（212）、depth-occlusion（14） | model-layer fill-extrusion--default 279994、0 DISCONNECTED 已解决 |

### 13.2 对齐执行顺序（目标：先吃近失梯队，再收整域空白）

1. **G1 近失梯队精度**（改动小、可直接转通过）：fill-outline-color（7/8 近失，12–192px）、icon-size（9/18 近失）、line-join/elevated-line-join（6/9 近失）、icon-halo-blur（5/5 近失）、icon-halo-color（4/7）、line-color（4/5）、line-cap（2/4）、elevated-line-color（3/3）、icon-rotate（2/3）、fill-color（2/8）。
2. **G2 fill-extrusion/building 收口**：修复 Z2 zoom 求值偏位 + 屋顶/墙面边界偏移 → 17 例近失转通过。
3. **G3 icon-text-fit 埋点排查**：单分类最大空白，需按 R1 三断点方式定位。
4. **G6 heatmap 双 pass 微调**：data-expression 已 324px，前景最好。
5. **G5 raster/image 双路径收口**。
6. **G7 fog/skybox/lights 渲染 harness 验收**。
7. **G4 text SDF 精度（可修部分）**。
8. **G8 model-layer 内容对齐 / depth-occlusion**。

### 13.3 执行进度快照（2026-08-16 会话末，7 个 commit：3b8da244 → 43f69980）

> 按 §13.1 的 G 分组，记录"前 → 后"与遗留。所有修复均对齐 mgl 源码；单测 208 通过（1 既有 circle-radius×2 失败，与本次无关），tsc 全绿，工作区干净。

| 项 | 前 | 后 | commit | 遗留 |
|---|---|---|---|---|
| G3 icon-text-fit | 0/41 | **7/41** | 3b8da244 | `*-2x` DPR 缩放、`stretch-*` 九宫格、`text-variable-anchor`/`placement-line`、text-anchor 文本渲染 |
| G1 fill-outline-color | 1/8 | **2/8** | 57baa3e0 | 残余 1–2px AA 边缘（pixelmatch 4px 阈值内），与 line-color 337px 同源 |
| G1 icon-size（camera 函数） | 4/18 | **9/18** | af54f113 | `*-rasterized`（432–3793，需 maxSize 重栅格化）、`property-function-*`（152–2092，数据驱动装箱）、`literal` 139/`function` 16（AA 边缘） |
| G1 icon-halo-blur | 0/5 | **4/5** | f1b5a066 | `property-function`（数据驱动 blur 205px） |
| G1 icon-halo-width | 3/4 | **4/4** | f1b5a066 | — |
| G1 icon-halo-color | 3/7 | **5/7** | f1b5a066 | multiply/opacity 98px（半透明 blend 边缘） |
| G1 icon-rotate | 1/3 | 1/3（近失 53→31） | 62ca4139 | oneway 45° 对角 AA + icon-size 0.9× box 基线 |
| G6 heatmap | 间歇空白 | **稳定渲染**（data-expression 324→308、opacity 3983→649） | 43f69980 | kernel 密度→ramp 阈值校准（blob 40×14 vs 期望 45×20） |

---

## 14. 未完成项（待办清单，2026-08-16 会话末保存）

> 按优先级/ROI 排序。每项含：根因摘要、已验证数据、所需改动域、复杂级。已完成项见 §12.21–§12.26。

### P0 — 引擎级渲染深水区（G2，解锁面最大）

**F1. fill-extrusion 墙面几何对齐 mgl（G2 核心阻塞）**
- 现状：fill-extrusion-color 7 例 1414–15313px（0 通过）。§12.15 光照已落地；§12.6 几何（emitExtrudedPolygon 简化 footprint quads）已落地。
- 根因：**building 实测 330×146 vs 期望 318×145（宽 12px、高 1px）**——侧壁每边多 ~6px。mgl 用 `a_join_normal_inside` + `u_width_scale × line_width` 墙面挤出（`fill_extrusion.vertex.glsl:242-245`），我们简化 quads 无 join/宽度处理。
- 方案：移植 mgl join-normal 墙面挤出（`line_width`/`u_width_scale` 按每边偏移）+ 校验 footprint 尺寸。
- 用例：fill-extrusion-*（~91）+ building（53）。**期望收益最大（~140 例）**。

**F2. fill-extrusion 残余**：zoom 函数求值偏位（function 全蓝，Z2）、屋顶/墙面边界 2px 偏移、`no-alpha-no-multiply`（38023px，3D-lights 路径）、`data-driven-zero-alpha`（15313px）。
- 依赖 F1（几何对齐后这些残余才可独立验证）。

### P1 — 近失可快速转通过（G1 剩余）

**F3. heatmap kernel/ramp 密度阈值校准（G6）**
- **✅ 已完成（2026-08-17，§12.28，commit `6fa78651`）：0/18 → 15/18 通过。**
- 落地要素：① `MBHeatmapRenderer` 密度 FBO 0.25× + RGBA16F（默认 ramp 也对齐 v8）；② composite premultiplied blend（[ONE, ONE_MINUS_SRC_ALPHA]）；③ `parseColor` 命名色 linear→sRGB（r178 ColorManagement）；④ `normalizeGradientStops` 解包 `["memo", expr]` 编译表达式（顺带修好 heatmap-color/expression 全黑）；⑤ 反子午线 world copies。
- 遗留 3 例：`antimeridian`（4786px，回绕副本密度 cyan vs lime）、`pitch30`（16181px，俯仰地面 quad 椭圆化）、`projected`（13060px，自定义投影）。

**F4. icon-halo-blur/property-function（205px）**：数据驱动 blur 双要素，halo 外缘差（§12.24 遗留）。

**F5. icon-halo-color/multiply + opacity（各 98px）**：半透明红 halo + multiply/opacity blend 边缘（§12.24 遗留）。

**F6. icon-size 残余**：`*-rasterized`（mgl `getRasterizedIconSize` maxSize 重栅格化）、`property-function-*`（数据驱动装箱）、`literal`/`function`（AA 边缘 + 0.9× box 基线）。

**F7. icon-text-fit 残余**：`*-2x`（DPR 缩放）、`stretch-*`（九宫格重栅格化，`scaleShapedIconImage`）、`text-variable-anchor`、`placement-line`、`*-text-anchor`（文本未随 anchor 渲染）。

### P2 — 引擎几何 / 材质（需改 flywave-lines / flywave-materials / flywave-mapview）

**F8. line-join / line-cap（G1，6/11 + 2/4 近失）**：`TriangulateLines` 恒 bevel；mgl bevel/miter/round 角几何。**line-color 337px 基线**（AA/线宽舍入）与 line-cap butt 337px 同源，须先修。
- 用例：line-join（11）+ elevated-line-join（9）+ line-cap（4）+ elevated-line-cap（4）+ line-color（5）+ elevated-line-color（3）。

**F9. line-blur / line-offset（G1）**：SolidLineMaterial 无 blur/offset uniform 消费（P1.3 引擎级）。

**F10. circle-blur / circle-stroke-***：CirclePointsMaterial 无 blur/stroke（P1.2 引擎级）。

### P3 — 大工程（G4/G5/G7/G8，架构/引擎级）

- **F11. raster/image 双路径收口（G5）**：raster-opacity 121k（纹理未上屏）；image raster paint 忽略；双路径（env quad vs 逐瓦片）未收口。
- **F12. fog/skybox/lights 验收（G7）**：**✅ 已验收（2026-08-17，§12.27）**——lighting-3d-mode 2→**10 通过**（ground 层光照全对齐，含 background/color-ambient/ambient-directional/pitched-45、emissive-strength*/background/fill/fill-outline、fill、fill-outline）、skybox 0→**1**（gradient/default）、fog 0 通过但近失 3（space-color-use-theme 39、fill-outline 418、line-gradient 591）、heatmap 0 通过（data-expression 308 近失）。**剩余**：fog 63 例整域待像素级对齐（空间色/2D 叠加）；skybox atmosphere 等子域；lighting 的 fill-pattern/stroke 子域 + bright-v9 pitch-*/fill-extrusion 6 个重型 3D 挂起未上报。
- **F13. text SDF 精度（G4）**：63/258 期望图纯黑（引用损坏不可修）；SDF 亚像素 + halo（需改 TextCanvas 顶点格式）。
- **F14. model-layer / depth-occlusion（G8）**：崩溃已修（192 上报 0 DISCONNECTED）但内容不对齐（fill-extrusion--default 279994）；occlusion 软淡入在 patcher。
- **F15. building roof-shape / conflation / 3d-intersections / terrain dynamic-exaggeration / color-theme**：§2.13–§2.15 全 ❌/🔧 域，engine 级。

### 验证流程备忘（每项 DoD）

```
改代码 → pnpm --filter @flywave/flywave-mbstyle-datasource exec tsc --noEmit
      → mocha ./lib/test/*Test.js（208 passing，1 既有 circle-radius×2 失败无关）
      → CHROME_BIN=/usr/bin/microsoft-edge MBSTYLE_PORT=8099 \
        MBSTYLE_REPORT=rendering-test-results/<cat> node scripts/run-mbstyle-render-tests.js <分类>
      → 更新本文件 §12.2x + §14 状态 → commit
```
- karma webpack 有 filesystem 缓存，调试用 `HARP_NO_HARD_SOURCE_CACHE=true`。
- 重跑前 `lsof -nP -iTCP:<port> -sTCP:LISTEN` 清孤儿 `RenderingTestResultServer`。
