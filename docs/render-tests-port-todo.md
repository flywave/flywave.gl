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
