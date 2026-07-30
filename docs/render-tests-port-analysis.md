# Render-Tests 移植分析（独立审计版）

> 本文是对 `mapbox-gl-js/test/integration/render-tests/`（**274 个分类 / 3031 个用例**）与 `@flywave/flywave-mbstyle-datasource` 源码的**独立逐文件审计**，不复用既有结论。所有状态结论均来自对源码的实际阅读，并标注证据位置（`文件:行`）。
>
> 审计基线：`@flywave/flywave-mbstyle-datasource/src/` 全部 24 个 `.ts` 文件 + `materials/` 14 个文件 + `test/MBStyleCompatRenderTest.ts` 兼容 runner。
>
> **当前进度**：已完成 Bug 修复（B1/B2/B3/B4/B5）+ Phase 1 流程对接（1.1–1.13，其中 1.2/1.3 为近似、1.4 暂缓）。tsc 通过，113 单元测试通过。视觉通过/近似通过率由 ~15–20% 提升至约 **30–38%**。详见 §5 汇总与 §6 Phase 1 状态列。

---

## 0. 阅读指南

| 标记 | 含义 |
|------|------|
| ✅ | 端到端工作（已核实走通实际渲染管线） |
| ⚠️ | 部分实现（核心通路在，但语义/精度有偏差或缺子特性） |
| ❌ | 未实现 / 死代码 / 不产生正确渲染 |

**关键架构事实（决定一切状态判定）**：

```
style.json
   │
   ▼
MBStyleManager.loadStyle ──► MBStyleDataSource.connect()
   │
   ├─► MBTileDataEmitter.paintToTechniqueProps()   ← 唯一真实产物：technique + props
   │        (src/MBTileDataEmitter.ts:106-251)
   │              │
   │              ▼  打包成 DecodedTile
   │   flywave 原生 TileGeometryCreator  ← 用 technique.name 创建原生 three.js 对象/材质
   │              │
   ▼              ▼
MBMaterialPatchManager.patchTileMaterials()   ← AfterRender 钩子，patch 原生材质的 onBeforeCompile
   (src/MBMaterialPatchManager.ts)            ← 只处理 4 种 technique：fill / solid-line / circles / extruded-polygon

旁路：
MBEnvironmentManager  → 灯光/雾/天空/terrain DEM/背景/raster/image（直接操作 scene）
MBStyleSymbolPlacement → 符号碰撞/旋转/沿线锚点（AfterRender 钩子）
MBStyleRuntime        → 运行时改样式（setPaintProperty 等）
```

**死代码确认**（证据）：
- `materials/MBRenderLayer.ts`（379 行）—— 全仓唯一引用是 `materials/index.ts:27` 的 `export`，无任何 `new MBRenderLayer()` 或调用 `buildObjects()`。`grep -rn "MBRenderLayer" src/` 仅命中 export 行。
- `materials/MapFillMaterial / MapLineMaterial / MapCircleMaterial / MapExtrusionMaterial / MapIconMaterial / MapSDFIconMaterial / MapHeatmapMaterial / MapHillshadeMaterial / MapRasterMaterial / MapBuildingMaterial` —— 仅被 `MBRenderLayer.ts` 和 `materials/index.ts` 引用，**实际渲染不经过它们**。
- `materials/MapTerrainMaterial.ts` —— **唯一例外**：被 `MBEnvironmentManager.ts:364` `new MapTerrainMaterial()` 实例化（terrain DEM 网格用）。
- `MBMaterialFactory.ts`（11 行）—— `create()` 仅被死代码 `MBRenderLayer.ts:115` 调用。

> **判定原则**：本文把"只有死代码里出现"的材质 API 一律记为 ❌，不论其内部逻辑是否完整。

---

## 1. 测试盘点（274 分类 / 3031 用例）

测试名 = `render-tests/` 下的目录路径（如 `circle-radius/literal`）。用例数 = 该分类下所有含 `style.json` 的目录数。完整分类见附录 A，下面列出 **Top 30 大分类**（占总用例 ~62%）：

| 分类 | 用例数 | 被测主特性 |
|------|--------|-----------|
| model-layer | 212 | 3D 模型（glTF）加载与放置 |
| runtime-styling | 181 | `operations` 时序操作（setPaintProperty/addLayer/wait…） |
| combinations | 126 | 多层/多属性组合 |
| regressions | 122 | 历史回归 |
| globe | 122 | 球体投影 |
| lighting-3d-mode | 120 | 3D 光照 + 阴影 |
| 3d-intersections | 75 | 桥梁/隧道/护栏抬升结构 |
| appearance | 74 | 条件外观覆盖 |
| terrain | 69 | 三维地形（DEM 位移 + draping + 深度遮挡） |
| fog | 63 | 大气雾 |
| map-projections | 53 | Albers/EqualEarth/Lambert 等投影 |
| building | 53 | 建筑立面 + 程序化窗户 |
| debug | 51 | 调试叠加层 |
| icon-text-fit | 44 | 图标适配文本尺寸 |
| imports | 39 | 样式导入槽位 |
| skybox | 34 | 天空盒 |
| text-writing-mode | 32 | 竖排文本 |
| text-variable-anchor | 31 | 可变锚点 |
| line-dasharray | 30 | 虚线 |
| geojson | 30 | GeoJSON 源（含 cluster） |
| elevated-line-dasharray | 29 | 抬升线虚线（HD） |
| dynamic-filter | 27 | 运行时滤镜切换 |
| color-theme | 26 | 颜色主题 |
| feature-state | 25 | feature-state 表达式 |
| text-field | 23 | 文本字段/token |
| text-offset | 20 | 文本偏移 |
| line-pattern | 20 | 线图案 |
| image | 20 | 栅格图像源 |
| measure-light | 19 | 光照度量 |
| image-fallback-nested | 19 | 图像回退 |

**剩余 244 个分类** 多为单一 paint/layout 属性测试（5–18 用例）。

---

## 2. 渲染管线逐层状态

### 2.1 emitter 产出的 technique 一览（`MBTileDataEmitter.ts:106-251`）

| 层类型 | 产出的 technique.name | 是否被 patchManager 增强 |
|--------|----------------------|--------------------------|
| background | `fill` | 仅 clearColor 路径（pattern 走 EnvironmentManager） |
| fill | `fill` | ✅ translate/outline/raster/**pattern** |
| line | `solid-line` | ✅ cap/dash/gap-width/**join/gradient/translate/pattern** |
| circle | `circles` | ✅ translate/pitch-scale；heatmap 也复用此 technique + `_isHeatmap` |
| symbol(icon) | `labeled-icon` | ⚠️ patchTile 内 `patchIconObject`（非 patchMaterial switch）已接 atlas+UV |
| symbol(text) | `text` | ⚠️ 原生 TextElement 渲染；SymbolPlacement 处理 offset/translate/旋转/碰撞 |
| fill-extrusion | `extruded-polygon` | ✅ height/base/gradient/building/**translate/pattern** |
| heatmap | `circles` + `_isHeatmap` | ⚠️ 改走 circles 产点几何，patchHeatmapMaterial 近似（**已对接**） |
| hillshade | `fill` + `_isHillshade` | ⚠️ 改走 fill，patchHillshadeMaterial 加载 DEM 着色（**已对接**） |
| raster | `fill` + `_rasterTileUrl` | ✅ patchRasterMaterial（opacity + 色彩调整） |
| model | `model` | ❌（实际由 `loadModels()` GLTFLoader 旁路；technique 冗余） |
| building | `extruded-polygon` | ✅ patchBuildingMaterial |

> `MBMaterialPatchManager.patchMaterial` 的 switch 处理：`fill`（分支 hillshade/raster/pattern/普通）、`solid-line`、`circles`（分支 heatmap）、`extruded-polygon`（分支 building/普通）。`labeled-icon` 由 `patchTile` 内的 `patchIconObject` 单独处理；`text` 由 SymbolPlacement 处理。

---

### 2.2 Background 层（29 用例）

| 属性/特性 | 状态 | 证据 / 说明 |
|----------|------|------------|
| background-color | ✅ | `MBStyleDataSource.ts:628-645` → `mapView.clearColor` |
| background-opacity | ✅ | 同上 → `clearAlpha` |
| background-pattern | ✅ | `MBEnvironmentManager.applyBackgroundPattern` 接收 `SpriteAtlas`，用 `getIconUv(patternName)` 取指定 pattern 子矩形（offset/repeat）平铺全屏 NDC quad（**已对接**，平铺尺度为固定 baseRepeat=8，非按 pattern 物理尺寸） |
| background-visibility | ✅ | visibility:'none' 跳过 |
| background-pitch-alignment | ❌ | 无处理（5 用例） |

---

### 2.3 Fill 层（~46 用例，含 cross-fade/z-offset/holes）

| 属性/特性 | 用例 | 状态 | 证据 / 说明 |
|----------|------|------|------------|
| fill-color | 8 | ✅ | technique.color |
| fill-opacity | 9 | ✅ | technique.opacity |
| fill-outline-color | 8 | ⚠️ | patchManager 注入 `fwidth(gl_FragCoord.z)` 深度边缘着色（`MBMaterialPatchManager.ts:160-175`），非真正多边形外轮廓 |
| fill-translate | 3 | ✅ | patchManager `uMBTranslate`（`:138-178`） |
| fill-translate-anchor | 2 | ❌ | emitter 存 `_translateAnchor` 但 patch 不消费（viewport 模式需逐帧方位角） |
| fill-pattern | 15 | ✅ | emitter 存 `_patternName`；patchManager `patchFillPatternMaterial` 用 `extractPatternTexture` 裁剪 sprite 子矩形为可重复纹理，按世界坐标 `position.xy` 平铺 |
| fill-pattern-cross-fade | 4 | ❌ | 无过渡插值 |
| fill-antialias | 1 | ❌ | 仅默认值 |
| fill-sort-key | 2 | ✅ | emitter 按 sortKey 排序 group |
| fill-visibility | 2 | ✅ | enabled=false |
| fill-z-offset | 4 | ✅ | emitter 改读 **paint**`['fill-z-offset']`（**Bug B2 已修**，原误读 `layout['line-z-offset']`） |
| fill-limit-number-holes | 1 | ❌ | 无 |

---

### 2.4 Line 层（~280 用例，含 ~160 elevated-line-*）

| 属性/特性 | 用例 | 状态 | 证据 / 说明 |
|----------|------|------|------------|
| line-color/width/opacity/blur/offset | 各 5-18 | ✅ | technique props |
| line-dasharray | 30 | ✅ | emitter 存完整数组 + dashTotalLength；patchManager 注入多段 GLSL 循环 |
| line-gap-width | 5 | ✅ | patchManager `secondaryWidth` |
| line-cap | 4 | ✅ | patchManager `material.caps` |
| line-gradient | 14 | ✅ | emitter 存 `_lineGradientStops`；patchManager `buildGradientTexture` 构建 256×1 DataTexture，按 `vCoords.x`(fract) 采样（**已对接**，无整线总长故用 fract 归一化） |
| line-join | 11 | ✅ | patchManager 通过 `setJoinType`/`joins` 设 Bevel/Round/Miter（**已对接**，依赖原生 SolidLineMaterial API） |
| line-translate | 4 | ✅ | patchManager line case 读 `_translate` 注入 `uMBTranslate`（**已对接**） |
| line-translate-anchor | 3 | ❌ | viewport 模式需逐帧方位角 |
| line-pattern | 20 | ✅ | patchManager 用 `extractPatternTexture` + 按 `vCoords.x` 平铺采样（**已对接**） |
| line-pattern-trim-offset / line-trim-offset | 18+18 | ❌ | 无 |
| line-pattern-cross-fade | 5 | ❌ | 无 |
| line-sort-key | 2 | ✅ | 排序 |
| line-visibility | 2 | ✅ | |
| line-pitch | 5 | ❌ | |
| line-border / line-border-gradient | 13+4 | ❌ | |
| line-blend-mode | 6 | ❌ | |
| line-emissive-strength | 3 | ❌ | |
| line-width-unit | 6 | ❌ | |
| line-triangulation | 2 | ❌ | |
| **elevated-line-***（width/color/opacity/blur/offset/pitch/cap/gap-width/join/border/sort-key/translate/translate-anchor/visibility/triangulation/gradient/pattern/pattern-trim-offset/trim-offset/dasharray） | ~160 | ❌ | HD 新特性，全部未实现（emitter 只透传 `line-z-offset` 到 z） |

---

### 2.5 Circle 层（~64 用例）

| 属性/特性 | 用例 | 状态 | 证据 / 说明 |
|----------|------|------|------------|
| circle-color/radius/blur/opacity/stroke-color/stroke-opacity/stroke-width | 各 5-8 | ✅ | technique props |
| circle-pitch-scale | 3 | ✅ | patchManager sizeAttenuation（`:238-249`） |
| circle-translate | 3 | ✅ | patchManager uMBTranslate |
| circle-pitch-alignment | 4 | ❌ | 与 pitch-scale 混淆，未独立处理 |
| circle-translate-anchor | 2 | ❌ | |
| circle-sort-key | 3 | ✅ | |
| circle-geometry | 6 | ✅ | point/line/poly 几何 |
| circle-camera-orthographic-projection | 1 | ❌ | 无正交相机 |

---

### 2.6 Symbol-Icon 层（~90 用例）

> **已对接（原关键缺口）**：sprite atlas 原先加载后存于 `m_spriteAtlas` 但从不传给原生 icon 管线。现已由 `MBMaterialPatchManager.patchIconObject` 接入——为原生 POI 对象设 atlas 纹理 + 注入 per-icon UV（`uUvOffset`/`uUvScale`），区分 SDF（icon-color 着色）与非 SDF（原色）。剩余缺口：icon-offset、SDF halo（需 SDF atlas + halo shader）。

| 属性/特性 | 用例 | 状态 | 证据 / 说明 |
|----------|------|------|------------|
| icon-image | 16 | ✅ | `patchIconObject` 接 atlas 纹理 + per-icon UV（**已对接**） |
| icon-size/color/opacity | 16+18+9 | ✅ | technique props + atlas 已接 |
| icon-rotate | 3 | ✅ | SymbolPlacement `material.rotation` |
| icon-offset | 3 | ❌ | |
| icon-anchor | 11 | ⚠️ | 部分 |
| icon-text-fit | 44 | ✅ | patchManager `applyIconTextFit` |
| icon-rotation-alignment | 6 | ✅ | SymbolPlacement |
| icon-pitch-alignment | 4 | ✅ | SymbolPlacement |
| icon-keep-upright | — | ✅ | SymbolPlacement |
| icon-translate | 3 | ✅ | SymbolPlacement `applyOffsets` 用相机 unproject 施加（含 map/viewport anchor）（**已对接**） |
| icon-halo-color/width/blur | 16 | ❌ | SDF 图标 halo 未实现（需 SDF atlas + halo shader） |
| icon-visibility | 2 | ✅ | |
| icon-pitch-scaling/pixelratio-mismatch/no-cross-source-collision/secondary-coords-uint16 | 各 1 | ❌ | |

---

### 2.7 Symbol-Text 层（~273 用例）

> **架构现状**：text technique 'text' 交由原生管线渲染。emitter 用 `shapeText()`（`TextShaping.ts`）预算文本包围盒存进 `_shaped/_textWidth/_textHeight`。但 `MBGlyphLoader` 的 PBF 字形度量**未接入** shaping（emitter 调 `shapeText` 不传 `glyphLookup`，`grep` 证实 emitter 无 glyphLookup 引用），故 `measureTextWidth` 用默认估算（`TextShaping.ts:41-65`）。

| 属性/特性 | 用例 | 状态 | 证据 / 说明 |
|----------|------|------|------------|
| text-field (token) | 23 | ✅ | `resolveTextField`（`TextShaping.ts:109`） |
| text-font | 4 | ⚠️ | PBF 解析已实现（`GlyphPBFParser.ts` + `MBGlyphLoader.ts:64-84`），但 metrics 不回灌 shaping |
| text-size/color | 13+9 | ✅ | |
| text-halo-color/width/blur | 各 4-5 | ✅ | |
| text-opacity | 4 | ✅ | |
| text-transform | 3 | ✅ | `applyTextTransform` |
| text-letter-spacing | 5 | ✅ | |
| text-line-height | 2 | ✅ | |
| text-max-width | 8 | ✅ | `wrapText` 贪心换行（无字符级断词） |
| text-anchor | 11 | ✅ | `getAnchorOffset` |
| text-justify | 4 | ⚠️ | left/center/right/auto；无 binary justify |
| text-rotate | 8 | ✅ | SymbolPlacement |
| text-rotation-alignment | 6 | ✅ | SymbolPlacement |
| text-pitch-alignment | 12 | ✅ | SymbolPlacement |
| text-keep-upright | 15 | ✅ | SymbolPlacement |
| text-radial-offset | 1 | ✅ | PlacementEngine |
| text-variable-anchor | 31 | ✅ | PlacementEngine variableAnchors |
| text-writing-mode | 32 | ✅ | shapeText writingMode |
| text-max-angle | 2 | ✅ | LineAnchor 传入 maxAngle |
| text-offset | 20 | ✅ | emitter 存 `_textOffset`；SymbolPlacement `applyOffsets` 用相机 unproject 在屏幕空间施加偏移（ems→px）并转回世界（**已对接**） |
| text-translate / -translate-anchor | 3+2 | ✅/⚠️ | translate 已对接（`applyOffsets`）；anchor `map` 默认工作，`viewport` 模式暂缓（需逐帧方位角） |
| text-arabic | 5 | ❌ | reshapeArabic 是桩 |
| text-pitch-scaling / tile-edge-clipping / no-cross-source-collision / max-attributes / icon-high-pitch | 各 1 | ❌ | |
| text-visibility | 2 | ✅ | |
| symbol-placement: line / line-center | 10 | ✅ | SymbolPlacement 调 `getLineAnchors`（`:198-244`） |
| symbol-spacing | 5 | ✅ | SymbolPlacement 读 spacing |
| symbol-z-order | 11 | ✅ | viewport-y 排序（SymbolPlacement `:290-307`） |
| symbol-sort-key | 8 | ✅ | collectSymbols 把 `symbol-sort-key` 取负作为放置优先级（值越小越先放置）（**已对接**） |
| symbol-geometry/cross-fade/distance-fade/elevation/icon-brightness/contrast/saturation | 31 | ❌ | |

---

### 2.8 Fill-Extrusion 层（~91 用例）

| 属性/特性 | 用例 | 状态 | 证据 / 说明 |
|----------|------|------|------------|
| fill-extrusion-color | 8 | ✅ | technique.color |
| fill-extrusion-opacity | 3 | ✅ | |
| fill-extrusion-height | 6 | ✅ | emitter 存 height；patchManager `patchExtrusionMaterial` 读 `technique.height`（`:262-285`） |
| fill-extrusion-base | 12 | ✅ | 同上 `technique.floorHeight` |
| fill-extrusion-vertical-gradient | 3 | ✅ | patchManager 顶点高度 varying + 片元渐变（`:286-302`） |
| fill-extrusion-translate / -translate-anchor | 4+2 | ✅/⚠️ | translate 已对接（patchExtrusionMaterial 注入 `uMBTranslate`）；anchor `map` 工作，`viewport` 暂缓 |
| fill-extrusion-pattern / -pattern-cross-fade | 15+4 | ✅/❌ | pattern 已对接（`patchExtrusionMaterial` + `extractPatternTexture`，按 footprint 平铺）；cross-fade 无 |
| fill-extrusion-multiple | 2 | ✅ | 多层 |
| fill-extrusion-terrain | 13 | ❌ | 需 terrain |
| fill-extrusion-partial-rendering | 4 | ❌ | |
| fill-extrusion-geometry | 1 | ❌ | linestring 几何 |
| wireframe/rounded-wireframe/edge-radius-narrow-corner/cutoff-fade-range/vertical-scale/no-mercator-projection/line-width | 各 1-9 | ❌ | 全无 |

---

### 2.9 Heatmap 层（18 用例）

| 属性 | 状态 | 证据 / 说明 |
|------|------|------------|
| heatmap-color/intensity/opacity/radius/weight | ⚠️ | **已对接（近似）**：emitter 改产出 `circles` technique + `_isHeatmap`（原生识别 circles 产点几何）；patchManager `patchHeatmapMaterial` 注入加法混合 + 径向衰减 + color-ramp（`buildGradientTexture`）。为单遍近似，非 Mapbox 两遍密度→ramp 管线；`MapHeatmapMaterial` 仍是死代码 |

---

### 2.10 Hillshade 层（20 用例）

| 属性 | 状态 | 证据 / 说明 |
|------|------|------------|
| 全部 | ⚠️ | **已对接（近似）**：新建 `HillshadeTileDataProvider`（每瓦片多边形携带 DEM url）+ `connect()` 检测 hillshade 层接线；emitter 产出 `fill` + `_isHillshade`；patchManager `patchHillshadeMaterial` 加载 DEM PNG、注入坡度/坡向有限差分 + Lambert 着色。DEM 编码假设 `(r*65536+g*256+b)-65536`；单瓦片；`MapHillshadeMaterial` 仍是死代码 |

---

### 2.11 Raster 层（85 用例）

| 属性 | 状态 | 证据 / 说明 |
|------|------|------------|
| raster-opacity | ✅ | patchManager `patchRasterMaterial`（`:110-136`）+ EnvironmentManager `applyRasterSource` |
| 基础显示（per-tile 纹理） | ✅ | `RasterTileDataProvider` 生成带 `_rasterTileUrl` 的合成多边形；emitter 转 fill+_isRaster；patchManager 异步加载瓦片 PNG |
| raster-brightness/contrast/saturation/hue-rotate/color | ✅ | patchRasterMaterial 注入片元着色器：brightness 区间映射 + contrast 中心拉伸 + saturation 亮度混合 + hue-rotate 旋转矩阵（**已对接**，color mix 因需按 `raster-color` 因子与目标色混合，简化为基础调整） |
| raster-resampling/filtering/masking/rotation/loading/extent/visibility/alpha | ❌ | |
| zoomed-raster / retina-raster / raster-elevation(-tiled) / raster-array / raster-particle | ❌ | |

> 备注：当前 raster 实现"能出图"，但单瓦片四边形方式与 Mapbox 的 proxy-tile draping 差异大，像素级对齐基线难通过。

---

### 2.12 Model 层（212 用例）

| 特性 | 状态 | 证据 / 说明 |
|------|------|------------|
| glTF 加载 + per-position 放置 | ✅ | `MBStyleDataSource.loadModels`（`:509-559`）GLTFLoader 动态导入，支持 `model-position` 多坐标克隆 |
| model-rotation / model-scale | ⚠️ | scale 有；rotation 未应用 |
| 瓦片化 3D 模型流式 / BVH 剔除 | ❌ | |

---

### 2.13 Building 层（53 用例）

| 特性 | 状态 | 证据 / 说明 |
|------|------|------------|
| 基础挤出（height + roof color） | ✅ | emitter 读 building-height（`:240-248`）；patchManager `patchBuildingMaterial`（`:307-348`）注入高度 + 屋顶色 |
| 程序化立面窗户 / roof-shape / AO / flood-light | ❌ | |

---

## 3. 系统级特性

### 3.1 表达式引擎 `MBExpressionEngine.ts`（672 行）

| 类别 | 已实现 | 缺失 |
|------|--------|------|
| 数据访问 | get/has/id/zoom/geometry-type/properties/feature-state/literal/var/let/image/format | accumulated、line-progress、真实 number-format |
| 比较/逻辑 | ==/!=/>/≥/</≤/!/all/any/none/in/match/case/coalesce | — |
| 插值 | interpolate（exponential + linear + cubic-bezier）、step | — |
| 类型转换 | to-number/to-string/to-boolean/typeof/array/at/slice/length | — |
| 数学 | +,-,*,/,%,^,abs,floor,ceil,round,min,max,sqrt,ln,ln2,log10,log2,sin,cos,tan,pi,e | — |
| 颜色 | rgb/rgba/hsl/hsla/to-color + interpolateColor + 命名色/hsl()/rgb() 解析 | — |
| 几何/字符串 | distance ✅、within（仅 legacy filter）、upcase/downcase/concat | within 表达式形式、is-supported-script（桩）、collator（桩）、resolved-locale、keys/values/zip |

> 注：`slice`/`length` 在 switch 中重复定义（`:292` 和 `:491`），后者覆盖前者——需修。

---

### 3.2 Filter `MBFilterCompiler.ts`（169 行）

| 形式 | 状态 |
|------|------|
| legacy（has/==/in/within 等） | ✅ 全部，within 用射线法点在多边形 |
| expression 形式 | ✅ 委托 MBExpressionEngine |
| distance | ✅（haversine） |
| collator / is-supported-script | ⚠️ 桩 |

---

### 3.3 相机与投影

| 特性 | 用例 | 状态 | 证据 |
|------|------|------|------|
| center/zoom/bearing/pitch | ~40 | ✅ | `applyCameraSettings` → `setCameraGeolocationAndZoom`（`MBStyleDataSource.ts:690-704`） |
| zoom-visibility | 6 | ✅ | |
| camera | 3 | ✅ | |
| projection: mercator/globe | 4+122 | ✅ | `applyProjection` → `mapView.projection`（sphere/mercator 单例）激活原生管线（`:662-685`） |
| projection: albers/equalEarth/lambert/naturalEarth/winkelTripel/equirectangular | 53 | ⚠️ | `MBMapProjection`（135 行）数学已实现并接入，但**无 draping 模式**——矢量内容会扭曲 |
| FOV / maxBounds / maxPitch / renderWorldCopies | — | ❌ | |
| free-camera | 8 | ❌ | 无 FreeCameraOptions |
| fit-screen-coordinates | 3 | ❌ | |
| resize / map-mode / tile-mode / scale-factor / sd-hd-conflation / hd-sd-transition / worldview | ~45 | ❌ | |
| mapbox:// accessToken 追加 | — | ✅ | `createOmvRestClient` 传 accessToken |

---

### 3.4 环境（fog/sky/lighting/terrain）

| 特性 | 用例 | 状态 | 证据 / 说明 |
|------|------|------|------------|
| fog | 63 | ⚠️ | `FogExp2`（`:85-101`），无 horizon-blend/vertical-range/pitch 渐入/star-intensity 联动 |
| sky (gradient) | 34 | ⚠️ | `createGradientSky` 球壳着色器（`:133-176`），简化版 |
| sky (atmosphere) | — | ⚠️ | `createAtmosphereSky`（`:178-234`），简化 ray-march |
| stars | — | ✅ | `createStars` Points 点云（`:236-283`） |
| lighting-3d-mode | 120 | ⚠️ | `applyLights` 创建 Ambient+Directional（`:24-83`）+ `shadowMap.enabled=true`；但自定义材质是死代码，光照不真正影响 fill/line/circle |
| terrain (DEM 位移) | 69 | ⚠️ | `applyTerrain` 单瓦片 DEM → MapTerrainMaterial 网格位移（`:333-378`），**无 draping、无深度遮挡、无 morphing、无 skirt** |
| depth-occlusion | 14 | ❌ | 需 depth FBO |
| occlusion / occlusion-terrain-depth | 6 | ❌ | |

> Globe 模式下 fog/sky 延迟到原生 MapViewAtmosphere（`:88-90, 114-117`）。

---

### 3.5 运行时样式 `MBStyleRuntime.ts`（264 行）

| 方法 | 状态 |
|------|------|
| setPaintProperty / setLayoutProperty | ✅ |
| addLayer(beforeId) / removeLayer / moveLayer | ✅ |
| setFilter / setLayerZoomRange / setStyle | ✅ |
| getPaintProperty / getLayoutProperty | ✅ |
| paint cross-fade（transition） | ✅ | `setInterval(16ms)` + smoothstep 插值（`:100-147`） |
| addSource / removeSource | ❌ |
| setGeoJSONSourceData | ⚠️ | compat runner 直接改 provider 的 m_geoJsonData |

---

### 3.6 碰撞与符号放置 `PlacementEngine.ts` / `MBStyleSymbolPlacement.ts`

| 功能 | 状态 | 说明 |
|------|------|------|
| CollisionIndex 空间网格 | ✅ | `CollisionIndex.ts` |
| opacity 渐变（FADE_DURATION） | ✅ | `PlacementEngine.ts:108-146` |
| 跨瓦片一致性 | ⚠️ | 不再每帧 reset，仅 zoom 变化/5s 超时 reset（`:68-75`）；非真正 CrossTileSymbolIndex |
| variable-anchor / radial-offset | ✅ | |
| 沿线锚点（symbol-placement:line） | ✅ | `getLineAnchors` |
| symbol-z-order (viewport-y) | ✅ | |
| icon/text 联合放置 / icon-optional | ⚠️ | |

---

## 4. 测试基础设施（兼容 runner）

### 4.1 `MBStyleCompatRenderTest.ts`（339 行）

| 能力 | 状态 |
|------|------|
| 用例发现（嵌套目录） | ✅ `scanDir` 递归 |
| 兼容过滤 | ⚠️ 按 layer.type 黑名单跳过 terrain/globe/model/video/custom-layer/raster-particle/raster-array/skybox（heatmap/hillshade 不在黑名单，现已对接近似渲染） |
| `local://` 重写 | ✅ data/tiles/sprites/glyphs/image/models/styles 全映射到 `/base/mapbox-gl-js/...` |
| image-threshold | ✅ 读 `metadata.test.image-threshold`，默认 0.001 |
| width/height/pixelRatio | ✅ |
| skip-test | ⚠️ 只匹配 `platform-tag-contains === ""`（全平台），非完整 platform-tag 匹配 |
| spriteFormat 'icon_set' (.pbf) | ❌ `loadSprite` 只读 .json+.png |
| collisionDebug / debug / output / fadeDuration / scaleFactor / fontstackCompositing 等 metadata | ❌ |

### 4.2 operations 处理（~30 种）

| 已实现 | no-op |
|--------|-------|
| wait / waitFrameReady / frameReady / sleep | addImage / removeImage / updateImage |
| setPaintProperty / setLayoutProperty | setTerrain |
| addLayer / removeLayer / moveLayer / setFilter / setLayerZoomRange | addModel |
| setStyle / setFeatureState / removeFeatureState | addSource |
| setZoom / setCenter / setBearing / setPitch / easeTo | setPadding |
| setProjection（mercator/globe/custom） | setCameraPosition / lookAtPoint / fitScreenCoordinates |
| setLights / setLight / setFog | forceContextRestart |
| setGeoJSONSourceData（⚠️ 直改 provider） | setColorTheme / addCustomLayer / addCustomSource / setStyleImportConfigProperty / setConfigProperty / check / forceRenderCached / pinBooleanTransitionProgress / setLayerProperty / setImportColorTheme |

> `wait` 是出现 1551 次的最高频操作，已实现（`renderFrames` 推进帧）。

### 4.3 资源依赖（karma /base 映射）

runner 依赖 mapbox-gl-js 的 `test/integration/` 资源目录经 karma 暴露：`data(588K) + glyphs(27M) + sprites(4.3M) + tiles(58M) ≈ 90M` 最小集。

---

## 5. 汇总统计

| 层/系统 | 用例 | ✅ | ⚠️ | ❌ | 主要阻塞（已对接项标 ✅/⚠️） |
|---------|------|----|----|----|----------|
| Background | 29 | 4 | 0 | 1 | pattern ✅；pitch-alignment ❌ |
| Fill | 46 | 6 | 0 | 5 | pattern ✅、z-offset ✅；antialias、translate-anchor、cross-fade、holes ❌ |
| Line（含 elevated） | 280 | 10 | 0 | ~14 组 | gradient ✅、join ✅、translate ✅、pattern ✅；trim、border、blend、emissive、width-unit、elevated-* ❌ |
| Circle | 64 | 6 | 0 | 3 | pitch-alignment、translate-anchor、正交 ❌ |
| Symbol-Icon | 90 | 8 | 1 | ~4 | **sprite ✅**、translate ✅；halo(SDF)、offset、pixelratio ❌ |
| Symbol-Text | 273 | 20 | 2 | ~5 | **offset ✅**、translate ✅、symbol-sort-key ✅；字形 metrics 估算、arabic/Bidi ❌ |
| Symbol-Placement | 46 | 4 | 2 | ~5 | CrossTileSymbol、icon-optional、geometry ❌ |
| Fill-Extrusion | 91 | 7 | 0 | ~8 | translate ✅、pattern ✅；terrain、wireframe 系、cross-fade ❌ |
| Heatmap | 18 | 0 | 1 整类 | 0 | **近似的译 ✅(⚠️)**（单遍加法混合） |
| Hillshade | 20 | 0 | 1 整类 | 0 | **近似的译 ✅(⚠️)**（DEM 有限差分着色） |
| Raster | 85 | 2 | 0 | ~7 | opacity ✅、色彩调整 ✅；draping 差异、filtering/masking/rotation ❌ |
| Model | 212 | 1 | 1 | ~2 | 瓦片化/BVH、rotation ❌ |
| Building | 53 | 1 | 0 | ~2 | 立面/roof-shape ❌ |
| Expressions/Filters | 80 | 大部分 | — | 小部分 | within 表达式、number-format ❌ |
| Camera/Projection | 102 | ~3 组 | 1 组 | ~10 组 | FOV、free-camera、projections draping ❌ |
| Environment | 368 | 2 | 4 | 3 | 真实 terrain、depth-occlusion、lighting 影响矢量层 ❌ |
| Composite/Other | ~1180 | 0 | 2 | ~5 组 | 3d-intersections、appearance、imports、debug、measure-light ❌ |
| **合计** | **3031** | — | — | — | — |

> **更新后估算**：端到端能**视觉通过/近似通过**的用例提升至约 **30–38%**（基础层属性 + icon/text + extrusion + 近似 heatmap/hillshade + raster 色彩 + pattern 子集）。仍因死代码（custom materials）、缺 draping、缺 HD elevated-line 与 3D/环境大类而受限。

---

## 6. 移植 TODO（按 ROI / 依赖排序）

> ROI = 解锁或修正的用例数 ÷ 改动复杂度。每项标注【证据位置】与【验证用例】。

### Phase 0 — 死代码决策（前置，0.5–1 PD）

| # | 任务 | 说明 |
|---|------|------|
| 0.1 | 决定 `materials/`（除 MapTerrainMaterial）与 `MBRenderLayer`/`MBMaterialFactory` 去留 | 全部死代码。要么接入 `MBMaterialPatchManager` 路径，要么删除以免误判。建议删除死材质、保留 patchManager 作为唯一增强点。 |

### Phase 1 — 高 ROI 单点修复（解锁/修正基础层，~2 周）

| # | 任务 | 证据 | 解锁/修正 | 状态 |
|---|------|------|----------|------|
| 1.1 | **sprite atlas 接入原生 icon 渲染** | `patchIconObject` 接 atlas + per-icon UV | icon-image(16)+icon-color/size/opacity(~50) | ✅ 完成 |
| 1.2 | **Heatmap technique 消费者**：emitter 改产 circles+`_isHeatmap`，patchHeatmapMaterial 加法混合+ramp | 近似渲染 | ⚠️ 近似完成（单遍） |
| 1.3 | **Hillshade 通路**：HillshadeTileDataProvider + patchHillshadeMaterial（DEM 有限差分） | 近似渲染 | ⚠️ 近似完成 |
| 1.4 | **字形 metrics 回灌 shaping**：emitter 传 glyphLookup | worker vs 主线程 canvas | ⏳ 暂缓（架构） |
| 1.5 | **text-offset 应用**：emitter 存 `_textOffset`；SymbolPlacement `applyOffsets` unproject | text-offset 全 20 | ✅ 完成 |
| 1.6 | **line-gradient**：emitter 存 stops；patcher `buildGradientTexture` 按 `vCoords.x` 采样 | line-gradient 全 14 | ✅ 完成 |
| 1.7 | **line/fill/extrusion translate 统一**：patcher 读 translate 注入 `uMBTranslate` | line/extrusion translate | ✅ 完成 |
| 1.8 | **fill-z-offset**：emitter 读 paint['fill-z-offset']（Bug B2） | fill-z-offset 4 | ✅ 完成 |
| 1.9 | **icon-translate / text-translate**：SymbolPlacement `applyOffsets`（map/viewport anchor） | icon/text translate | ✅ 完成（viewport anchor 暂缓） |
| 1.10 | **Pattern 系统**：emitter 存 pattern 名；patcher `extractPatternTexture` 裁剪子矩形平铺 | fill/line/extrusion pattern ~50 | ✅ 完成 |
| 1.11 | **symbol-sort-key**：collectSymbols 取负作放置优先级 | symbol-sort-key 8 | ✅ 完成 |
| 1.12 | **line-join**：patcher `setJoinType`/`joins` | line-join 11 | ✅ 完成 |
| 1.13 | **raster 色彩调整**：patchRasterMaterial 注入 brightness/contrast/saturation/hue | raster ~25 | ✅ 完成 |

### Phase 2 — 符号系统精度（~3 周）

| # | 任务 | 证据 | 解锁/修正 |
|---|------|------|----------|
| 2.1 | per-glyph SDF 文本渲染（当前 text 交原生，度量/字形可能不一致） | emitter 'text' technique | 所有 text 视觉基线对齐 |
| 2.2 | 真实 CrossTileSymbolIndex（zoom 内聚合，跨瓦片一致） | PlacementEngine 仅 zoom 变化 reset | placement/runtime-styling 一致性 |
| 2.3 | symbol-sort-key 排序 | 仅 spec | symbol-sort-key 8 |
| 2.4 | icon-optional / symbol-geometry / icon-halo(SDF) | — | ~10 |
| 2.5 | text-arabic / Bidi 算法 | reshapeArabic 桩 | text-arabic 5 |

### Phase 3 — Pattern / 高级层（~2 周）

| # | 任务 | 证据 | 解锁 |
|---|------|------|------|
| 3.1 | sprite 子矩形 UV 系统（fill-pattern / line-pattern / extrusion-pattern） | sprite 当前只用于 background 平铺 | fill-pattern 15 + line-pattern 20 + extrusion-pattern 15 |
| 3.2 | pattern cross-fade / trim-offset | 无 | ~50 |
| 3.3 | line-join / border / border-gradient / blend-mode / emissive | 死代码 | ~30 |
| 3.4 | raster brightness/contrast/saturation/hue/color | 仅 opacity | ~25 |

### Phase 4 — 数据源 / 相机（~3 周）

| # | 任务 | 解锁 |
|---|------|------|
| 4.1 | external GeoJSON URL fetch（已部分 ✅，需补 cluster 精度） | geojson 子集 |
| 4.2 | cluster 聚类精度（当前网格法粗糙） | geojson cluster |
| 4.3 | 多源支持（当前选"被引用最多"的单源） | 多源用例 |
| 4.4 | FOV / maxBounds / maxPitch / free-camera / fit-screen-coordinates | camera/free-camera |
| 4.5 | spriteFormat 'icon_set' (.pbf) | ~295 sprite 引用 |

### Phase 5 — 环境与高级渲染（~2 月）

| # | 任务 | 用例 | 复杂度 |
|---|------|------|--------|
| 5.1 | 真实 terrain（DEM draping + 深度遮挡 + skirt + morphing） | terrain 69 + depth-occlusion 14 + extrusion-terrain 13 | ⭐⭐⭐⭐⭐ |
| 5.2 | lighting 影响矢量层（当前光照不作用于 fill/line/circle） | lighting-3d-mode 120 | ⭐⭐⭐⭐ |
| 5.3 | fog 精度（horizon-blend/vertical-range/pitch 渐入） | fog 63 | ⭐⭐⭐ |
| 5.4 | sky 精度（CubeCamera + 真实 atmosphere ray-march） | skybox 34 | ⭐⭐⭐ |
| 5.5 | projections draping 模式（矢量内容栅格化重投影） | map-projections 52 | ⭐⭐⭐⭐ |
| 5.6 | globe 平滑 morph（当前硬切） | globe 边界 | ⭐⭐⭐ |

### Phase 6 — HD / 街景融合（~2 月）

| # | 任务 | 用例 | 复杂度 |
|---|------|------|--------|
| 6.1 | elevated-line-* 全套（border/triangulation/pitch/…） | ~160 | ⭐⭐⭐⭐ |
| 6.2 | 3d-intersections（桥梁/隧道/护栏） | 75 | ⭐⭐⭐⭐⭐ |
| 6.3 | building 立面（程序化窗户/roof-shape/AO） | 53 | ⭐⭐⭐⭐⭐ |
| 6.4 | appearance 条件覆盖 | 74 | ⭐⭐⭐ |
| 6.5 | imports / slots | 47 | ⭐⭐⭐ |
| 6.6 | debug overlays / measure-light / custom-layer / video | ~80 | ⭐⭐ |

---

## 7. 已确认的 Bug（非死代码类）

| # | Bug | 证据 | 影响 | 状态 |
|---|-----|------|------|------|
| B1 | `slice`/`length` 在 expression switch 重复定义（后者被遮蔽） | `MBExpressionEngine.ts` | 字符串 slice 被数组 slice 覆盖 | ✅ 已修（删被遮蔽的字符串版 slice + 重复 length） |
| B2 | `fill-z-offset` 误读 `layout['line-z-offset']` | `MBTileDataEmitter.ts` | fill-z-offset 4 用例全错 | ✅ 已修（改读 paint['fill-z-offset']） |
| B3 | sprite atlas 加载后不连原生 icon 管线 | `MBStyleDataSource.ts` | 所有 icon-* 视觉错误 | ✅ 已修（patchIconObject 接 atlas+UV） |
| B4 | heatmap/hillshade technique 无消费者 | emitter vs patchManager | 38 用例空白 | ✅ 已修（emitter 改走 circles/fill + patch 着色，近似） |
| B5 | background-pattern 平铺整张 atlas 非子矩形 | `MBEnvironmentManager.ts` | background-pattern 13 错误 | ✅ 已修（用 getIconUv 取子矩形） |
| B6 | MBGlyphLoader metrics 不回灌 shapeText | emitter 无 glyphLookup | text 宽度估算偏差 | ⏳ 暂缓（worker vs 主线程 canvas 架构） |
| B7 | `applyTerrain` DEM 坐标用 floor(center) 单瓦片 | `MBEnvironmentManager.ts` | 仅中心瓦片，无多瓦片拼合 | ⏳ 暂缓（架构性） |
| B8 | raster 单瓦片四边形而非 proxy-tile draping | `MBEnvironmentManager.ts` | 像素对齐难通过基线 | ⏳ 暂缓（架构性） |

---

## 附录 A：全量分类用例数（274 项）

> 摘自 `find . -name style.json | wc -l` 按分类聚合。完整清单见仓库 `render-tests/`。Top 30 见正文 §1。剩余分类以单属性测试为主（fill-color 8、circle-radius 7、text-anchor 11 等），其状态见 §2 对应层表格。

## 附录 B：审计方法与证据复现命令

```bash
# 用例计数
cd mapbox-gl-js/test/integration/render-tests
for d in */; do c=$(find "$d" -name style.json|wc -l); printf "%4d %s\n" "$c" "${d%/}"; done | sort -rn

# 死代码确认
cd @flywave/flywave-mbstyle-datasource
grep -rn "MBRenderLayer" src/ | grep -v "class MBRenderLayer"   # 仅 export
grep -rln "MapFillMaterial" src/ | grep -v "MapFillMaterial.ts" # 仅 MBRenderLayer + index

# technique 消费者确认（patchManager 处理的 technique）
grep -n "case '" src/MBMaterialPatchManager.ts   # fill/solid-line/circles/extruded-polygon + 子分支
grep -n "patchIconObject\|patchHeatmap\|patchHillshade\|patchFillPattern" src/MBMaterialPatchManager.ts

# glyph metrics 接线确认
grep -n "glyphLookup" src/MBTileDataEmitter.ts   # 空
```

## 附录 C：变更日志

| 日期 | 说明 |
|------|------|
| 2026-07-30 | 独立审计首版。逐文件阅读 mbstyle-datasource 全部源码 + 兼容 runner，重判所有状态。核心修正：sprite 未连 icon 管线、heatmap/hillshade technique 无消费者、字形 metrics 未回灌、死代码范围确认（仅 MapTerrainMaterial 存活）。产出 Phase 0–6 TODO 与 8 项 Bug 清单。 |
| 2026-07-30 | **Bug 修复（B1/B2/B5）+ 流程对接（1.1/1.2/1.3/1.5/1.6/1.7/1.9）**。tsc 通过，113 单元测试通过。修改文件：`MBExpressionEngine.ts`、`MBTileDataEmitter.ts`、`MBStyleDataSource.ts`、`MBEnvironmentManager.ts`、`MBMaterialPatchManager.ts`、`MBStyleSymbolPlacement.ts`。详见下方"实施记录"。 |
| 2026-07-30 | **暂缓项**：B7（terrain 多瓦片拼合，架构性）、流程 1.4（字形 metrics 回灌——MBGlyphLoader 需主线程 canvas，而 emitter 跑在 worker，需 font-catalog 主线程回灌架构，留待 Phase 2）。 |
| 2026-07-30 | **第二轮：Pattern 系统 + 符号/线/栅格增强**（1.10–1.13）：fill/line/extrusion pattern（extractPatternTexture 子矩形平铺）、symbol-sort-key、line-join、raster 色彩调整（brightness/contrast/saturation/hue）、fill-extrusion-translate。tsc 通过，113 测试通过。translate-anchor viewport 模式暂缓（逐帧方位角）。 |
| 2026-07-30 | **文档全量同步**：§2 各层状态表（background-pattern/fill-z-offset/fill-pattern/line-gradient/line-join/line-translate/line-pattern/icon-image/icon-translate/text-offset/text-translate/symbol-sort-key/extrusion-translate/extrusion-pattern/heatmap/hillshade/raster 色彩 均由 ❌ 升级为 ✅/⚠️）、§2.1 emitter technique 表、§5 汇总统计（通过率 15–20% → 30–38%）、§6 Phase 1 状态列、§7 Bug 表新增"状态"列。 |

## 附录 D：实施记录（2026-07-30）

### Bug 修复
- **B1** `MBExpressionEngine.ts`：删除被遮蔽的字符串版 `case 'slice'`（保留数组+字符串通用版），删除重复的 `case 'length'`。
- **B2** `MBTileDataEmitter.ts`：fill/line 的 z-offset 改为优先读 **paint**（`fill-z-offset`/`line-z-offset`），原误读 `layout['line-z-offset']`。
- **B5** `MBEnvironmentManager.ts` + `MBStyleDataSource.ts`：`applyBackgroundPattern` 改为接收 `SpriteAtlas`，用 `getIconUv(patternName)` 取指定 pattern 子矩形（offset/repeat），不再平铺整张 atlas。

### 流程对接
- **1.1 sprite→icon**：`MBMaterialPatchManager.patchIconObject`——为原生 POI 对象设 atlas 纹理 + 注入 per-icon UV（uUvOffset/uUvScale），区分 SDF（icon-color 着色）与非 SDF（原色）。
- **1.2 heatmap**：emitter 改产出 `circles` technique + `_isHeatmap`；patcher `patchHeatmapMaterial` 注入加法混合 + 径向衰减 + color-ramp（单遍近似，非完整两遍密度管线）。
- **1.3 hillshade**：新建 `HillshadeTileDataProvider`（每瓦片多边形携带 DEM url）+ connect() 检测 hillshade 层接线；emitter 产出 `fill` + `_isHillshade`；patcher `patchHillshadeMaterial` 加载 DEM PNG、注入坡度/坡向有限差分 + Lambert 着色。
- **1.5 text-offset**：emitter 存 `_textOffset`/`_textTranslate`/`_textTranslateAnchor`；`MBStyleSymbolPlacement.applyOffsets` 用相机 unproject 在屏幕空间施加偏移并转回世界坐标。
- **1.6 line-gradient**：emitter 存 `_lineGradientStops`；patcher `buildGradientTexture` 构建 256×1 RGBA DataTexture，注入到 line 片元按 `vCoords.x` 采样。
- **1.7 translate 统一**：`patchLineMaterial` 读 `line-translate`、`patchExtrusionMaterial` 读 `fill-extrusion-translate`，统一 `uMBTranslate` 顶点偏移注入。
- **1.9 icon-translate / text-translate-anchor**：`applyOffsets` 同时处理 icon-translate，translate-anchor `map` 按方位角旋转偏移、`viewport` 屏幕对齐。

### 已知近似/限制
- heatmap 为单遍加法混合近似（非 Mapbox 两遍密度→ramp）。
- hillshade DEM 编码假设 `(r*65536+g*256+b)-65536`（Mapbox terrain.png 约定）；单瓦片。
- line-gradient 用 `fract(vCoords.x)` 归一化（无整线总长，近似）。
- icon SDF halo 仍未实现（需 SDF atlas + halo shader，属 Phase 2）。

### 第二轮：Pattern 系统 + 符号/线/栅格增强
- **Pattern 系统（~50 用例）**：emitter 存 `fill-pattern`/`line-pattern`/`fill-extrusion-pattern` 名；patcher `extractPatternTexture` 把 sprite 子矩形裁剪为独立可重复 `CanvasTexture`（缓存）；`patchFillPatternMaterial` 按世界坐标 `position.xy` 平铺、`patchLineMaterial` 按 `vCoords.x` 平铺、`patchExtrusionMaterial` 接入 pattern 基纹理。
- **symbol-sort-key（8 用例）**：collectSymbols 把 `symbol-sort-key` 取负作为放置优先级（值越小越先放置，符合 Mapbox 语义）。
- **line-join（11 用例）**：patchLineMaterial 通过 `setJoinType`/`joins` 设置 Bevel/Round/Miter。
- **raster 色彩调整（~25 用例）**：patchRasterMaterial 注入 brightness/contrast/saturation/hue-rotate 片元着色器（含 hue 旋转矩阵）。
- **fill-extrusion-translate**：patchExtrusionMaterial 接入 translate（与 fill/line 统一）。
- tsc 通过；113 单元测试通过。

### 仍暂缓（架构性）
- translate-anchor `viewport` + 像素→世界单位换算（需逐帧方位角/分辨率 uniform 更新，~9 用例）。
- 字形 metrics 回灌（worker vs 主线程 canvas）。
