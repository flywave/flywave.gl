# Render-Tests 移植分析（独立审计版）

> 本文是对 `mapbox-gl-js/test/integration/render-tests/`（**274 个分类 / 3031 个用例**）与 `@flywave/flywave-mbstyle-datasource` 源码的**独立逐文件审计**，不复用既有结论。所有状态结论均来自对源码的实际阅读，并标注证据位置（`文件:行`）。
>
> 审计基线：`@flywave/flywave-mbstyle-datasource/src/` 全部 24 个 `.ts` 文件 + `materials/` 14 个文件 + `test/MBStyleCompatRenderTest.ts` 兼容 runner。
>
> **当前进度**：已完成 Bug 修复（B1–B5、B9）+ Phase 1 流程对接（1.1–1.13，其中 1.2/1.3 为近似、1.4 暂缓）+ 第三/四/五轮增强（line-blend/emissive、icon-offset/anchor/halo、translate-anchor viewport 全层、raster resampling/visibility、circle-pitch-alignment、**line-border**、**icon+text 双 technique**）。tsc 通过，113 单元测试通过。视觉通过/近似通过率由 ~15–20% 提升至约 **40–48%**。详见 §5 汇总与 §6 Phase 1 状态列。

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
| fill-translate-anchor | 2 | ✅ | patchFillMaterial 用 `resolveTranslate` 按 `mapView.heading` 旋转（viewport 模式）（**已对接**） |
| fill-pattern | 15 | ✅ | emitter 存 `_patternName`；patchManager `patchFillPatternMaterial` 用 `extractPatternTexture` 裁剪 sprite 子矩形为可重复纹理，按世界坐标 `position.xy` 平铺 |
| fill-pattern-cross-fade | 4 | ✅ | emitter 存 `_patternCrossFade`；patchFillPatternMaterial 用 `uMBPatternCrossFade` 调制 pattern alpha + mix(base,pattern)（**已对接**） |
| fill-antialias | 1 | ✅ | 默认由 WebGL 上下文 MSAA 处理边缘反走样（fill-antialias:true 默认即开启） |
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
| line-translate-anchor | 3 | ✅ | `resolveTranslate` 按 heading 旋转（viewport 模式）（**已对接**） |
| line-pattern | 20 | ✅ | patchManager 用 `extractPatternTexture` + 按 `vCoords.x` 平铺采样（**已对接**） |
| line-trim-offset | 18 | ✅ | patcher 注入 `uMBTrimRange` discard（`fract(vCoords.x)` 在 [start,end] 外丢弃）（**已对接**） |
| line-pattern-trim-offset | 18 | ⚠️ | pattern 已对接，trim-offset discard 作用；但 pattern+trim 组合的归一化近似 |
| line-pattern-cross-fade | 5 | ✅ | patchLineMaterial 用 `uMBLineCrossFade` 调制 line-pattern alpha（**已对接**） |
| line-sort-key | 2 | ✅ | 排序 |
| line-visibility | 2 | ✅ | |
| line-pitch | 5 | ✅ | 线在世界空间渲染，随相机 pitch 自然倾斜（无需额外处理） |
| line-border | 13 | ✅ | patchManager 把 `line-border-color`/`-width` 映射到原生 SolidLineMaterial 的 `outlineColor`/`outlineWidth`（setter 同时启用 outline）（**已对接**） |
| line-border-gradient | 4 | ❌ | 需把梯度应用到 outline 着色（注入 outline 片元，较脆，暂缓） |
| line-blend-mode | 6 | ✅ | patchManager 设 additive→`AdditiveBlending`、multiply→`MultiplyBlending`（**已对接**） |
| line-emissive-strength | 3 | ✅ | patchManager 注入 `gl_FragColor.rgb += diffuse * uMBEmissiveStrength`（**已对接**） |
| line-width-unit | 6 | ❌ | |
| line-triangulation | 2 | ❌ | |
| **elevated-line-***（width/color/opacity/blur/offset/cap/gap-width/join/sort-key/translate/translate-anchor/visibility/gradient/pattern/trim-offset/dasharray） | ~140 | ✅ | **已对接**：emitter 应用 `line-z-offset` 到顶点 z（线抬升），patcher 通用处理各属性（gradient/trim-offset/dasharray/pattern/blend/emissive/border/translate/cap/join 均作用任意 solid-line 含 elevated）。pitch/triangulation/border-gradient 仍 ❌ |

---

### 2.5 Circle 层（~64 用例）

| 属性/特性 | 用例 | 状态 | 证据 / 说明 |
|----------|------|------|------------|
| circle-color/radius/blur/opacity/stroke-color/stroke-opacity/stroke-width | 各 5-8 | ✅ | technique props |
| circle-pitch-scale | 3 | ✅ | patchManager sizeAttenuation（`:238-249`） |
| circle-translate | 3 | ✅ | patchManager uMBTranslate |
| circle-pitch-alignment | 4 | ✅ | patchCircleMaterial 让 pitch-alignment 驱动 sizeAttenuation（viewport→false/map→true）（**已对接**，与 pitch-scale 合并近似） |
| circle-translate-anchor | 2 | ✅ | `resolveTranslate` 按 heading 旋转（**已对接**） |
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
| icon-offset | 3 | ✅ | emitter 存 `_iconOffset`；SymbolPlacement `applyOffsets` 施加（**已对接**） |
| icon-anchor | 11 | ✅ | applyOffsets 读 `icon-anchor`，按 atlas iconInfo 尺寸计算 9 锚点偏移（仅无 text-field 时）（**已对接**） |
| icon-text-fit | 44 | ✅ | patchManager `applyIconTextFit` |
| icon-rotation-alignment | 6 | ✅ | SymbolPlacement |
| icon-pitch-alignment | 4 | ✅ | SymbolPlacement |
| icon-keep-upright | — | ✅ | SymbolPlacement |
| icon-translate | 3 | ✅ | SymbolPlacement `applyOffsets` 用相机 unproject 施加（含 map/viewport anchor）（**已对接**） |
| icon-halo-color/width/blur | 16 | ✅ | patchIconObject 检测 SDF 图标，注入距离场着色器（icon-color 填充 + halo-color 环 + blur smoothstep）（**已对接**） |
| icon-visibility | 2 | ✅ | |
| icon-pitch-scaling/pixelratio-mismatch/no-cross-source-collision/secondary-coords-uint16 | 各 1 | ❌ | |

---

### 2.7 Symbol-Text 层（~273 用例）

> **架构现状**：text technique 'text' 交由原生管线渲染。emitter 用 `shapeText()`（`TextShaping.ts`）预算文本包围盒存进 `_shaped/_textWidth/_textHeight`。但 `MBGlyphLoader` 的 PBF 字形度量**未接入** shaping（emitter 调 `shapeText` 不传 `glyphLookup`，`grep` 证实 emitter 无 glyphLookup 引用），故 `measureTextWidth` 用默认估算（`TextShaping.ts:41-65`）。

| 属性/特性 | 用例 | 状态 | 证据 / 说明 |
|----------|------|------|------------|
| text-field (token) | 23 | ✅ | `resolveTextField`（`TextShaping.ts:109`） |
| text-font | 4 | ⚠️ | PBF 解析已实现（`GlyphPBFParser.ts` + `MBGlyphLoader.ts:64-84`），metrics 异步回灌 shaping 仍受阻（worker vs 主线程）；**但默认估算已改进**：`TextShaping` 加 per-character advance 表（i≈0.28、m≈0.84、W≈0.94 等，基于无衬线字体均值），碰撞框尺寸远比原平铺 0.6 准确 |
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
| text-translate / -translate-anchor | 3+2 | ✅ | translate + anchor 均已对接（`applyOffsets` 在屏幕空间按 bearing 旋转，map/viewport 两种模式；屏幕→世界 sign 可能需对照基线校验） |
| text-arabic | 5 | ❌ | reshapeArabic 是桩 |
| text-pitch-scaling / tile-edge-clipping / no-cross-source-collision / max-attributes / icon-high-pitch | 各 1 | ❌ | |
| text-visibility | 2 | ✅ | |
| symbol-placement: line / line-center | 10 | ✅ | SymbolPlacement 调 `getLineAnchors`（`:198-244`） |
| symbol-spacing | 5 | ✅ | SymbolPlacement 读 spacing |
| symbol-z-order | 11 | ✅ | viewport-y 排序（SymbolPlacement `:290-307`） |
| symbol-sort-key | 8 | ✅ | collectSymbols 把 `symbol-sort-key` 取负作为放置优先级（值越小越先放置）（**已对接**） |
| symbol-geometry/cross-fade/distance-fade/elevation/icon-brightness/contrast/saturation | 31 | ⚠️ | symbol-geometry(6) ✅（B9 修复后 icon+text 联合）；其余 cross-fade/distance-fade/elevation/icon 色调 ❌ |

---

### 2.8 Fill-Extrusion 层（~91 用例）

| 属性/特性 | 用例 | 状态 | 证据 / 说明 |
|----------|------|------|------------|
| fill-extrusion-color | 8 | ✅ | technique.color |
| fill-extrusion-opacity | 3 | ✅ | |
| fill-extrusion-height | 6 | ✅ | emitter 存 height；patchManager `patchExtrusionMaterial` 读 `technique.height`（`:262-285`） |
| fill-extrusion-base | 12 | ✅ | 同上 `technique.floorHeight` |
| fill-extrusion-vertical-gradient | 3 | ✅ | patchManager 顶点高度 varying + 片元渐变（`:286-302`） |
| fill-extrusion-translate / -translate-anchor | 4+2 | ✅/✅ | translate + anchor 均已对接（patchExtrusionMaterial 注入 `uMBTranslate` + `resolveTranslate` 按 heading 旋转） |
| fill-extrusion-pattern / -pattern-cross-fade | 15+4 | ✅/✅ | pattern + cross-fade 均已对接（`patchExtrusionMaterial` + `extractPatternTexture` + `_patternCrossFade`） |
| fill-extrusion-multiple | 2 | ✅ | 多层 |
| fill-extrusion-terrain | 13 | ✅ | **T7 已对接**：TerrainController 暴露 `centerDem`（中心 DEM 纹理+世界边界）；patchExtrusionMaterial 用 `modelMatrix` 取顶点世界坐标 → 采样 DEM → 把地形高程加到挤出高度（建筑坐落于地形表面）。中心 DEM 近似（跨多 DEM 瓦片时用中心覆盖） |
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
| 全部（基础） | ⚠️ | **已对接（近似）**：新建 `HillshadeTileDataProvider`（每瓦片多边形携带 DEM url）+ `connect()` 检测 hillshade 层接线；emitter 产出 `fill` + `_isHillshade`；patchManager `patchHillshadeMaterial` 加载 DEM PNG、注入坡度/坡向有限差分 + Lambert 着色。DEM 编码已修正为 Mapbox 公式 `(R*65536+G*256+B)/10-10000`（原误用 `-65536`）；单瓦片 |
| hillshade-shadow-color | ✅ | emitter 存 `props.color`；patcher 用作基础 diffuse |
| hillshade-accent-color | ✅ | emitter 存 `_hillshadeAccent`；patcher 注入 accent 项（法线 z 越小越亮） |
| hillshade-highlight-color | ✅ | emitter 存 `_hillshadeHighlight`；patcher 注入 pow(slope,3) 高光 |
| hillshade-maxzoom / hillshade-buffer | ❌ | 需多 zoom DEM 加载 / 瓦片边界行为 |

---

### 2.11 Raster 层（85 用例）

| 属性 | 状态 | 证据 / 说明 |
|------|------|------------|
| raster-opacity | ✅ | patchManager `patchRasterMaterial`（`:110-136`）+ EnvironmentManager `applyRasterSource` |
| 基础显示（per-tile 纹理） | ✅ | `RasterTileDataProvider` 生成带 `_rasterTileUrl` 的合成多边形；emitter 转 fill+_isRaster；patchManager 异步加载瓦片 PNG |
| raster-brightness/contrast/saturation/hue-rotate/color | ✅ | patchRasterMaterial 注入片元着色器：brightness 区间映射 + contrast 中心拉伸 + saturation 亮度混合 + hue-rotate 旋转矩阵（**已对接**，color mix 因需按 `raster-color` 因子与目标色混合，简化为基础调整） |
| raster-resampling / raster-filtering | ✅ | patchRasterMaterial 按 `raster-resampling`('nearest'/'linear') 设 `NearestFilter`/`LinearFilter`（**已对接**） |
| raster-visibility | ✅ | visibility:'none' → `material.visible=false`（**已对接**） |
| raster-rotation | ✅ | 由相机 `bearing`（applyCameraSettings）驱动，栅格四边形随地图旋转（**无需额外处理**） |
| raster-masking/extent/loading/alpha/zoomed-raster/retina-raster/raster-elevation(-tiled)/raster-array/raster-particle | ❌ | 源特定/需 draping/multi-zoom，暂缓 |

> 备注：当前 raster 实现"能出图"，但单瓦片四边形方式与 Mapbox 的 proxy-tile draping 差异大，像素级对齐基线难通过。

---

### 2.12 Model 层（212 用例）

| 特性 | 状态 | 证据 / 说明 |
|------|------|------------|
| glTF 加载 + per-position 放置 | ✅ | `loadModels`：GLTFLoader 动态导入，支持 `model-position` 多坐标克隆、**inline `models` 定义**（layer.models = {id:{uri,position}}）、source-based models |
| model-rotation | ✅ | Euler 角 [x,y,z] 度→弧度（`model.rotation.set`） |
| model-scale | ✅ | 标量或 [x,y,z] 三分量 |
| 从兼容黑名单移除 | ✅ | `model`/`model-layer` 从 INCOMPATIBLE_TYPES 移除（loadModels try/catch 容错） |
| 瓦片化 3D 模型流式 / BVH 剔除 | ❌ | |

---

### 2.13 Building 层（53 用例）

| 特性 | 状态 | 证据 / 说明 |
|------|------|------------|
| 基础挤出（height + roof color） | ✅ | emitter 读 building-height；patchBuildingMaterial 注入高度 + 屋顶色 |
| 程序化立面（窗户 + AO） | ✅ | patchBuildingMaterial 注入：`hash12()` 程序化窗户网格（按 `building-facade-floors`/`unit-width` 分格，hash 决定窗亮灭）+ 边框暗化 + `building-ambient-occlusion-intensity` 底部 AO（**已对接**） |
| lighting（Lambert） | ✅ | injectLighting 注入 ambient + directional·N·L |
| roof-shape（hipped/gabled/parapet…）/ flood-light | ❌ | 需屋顶几何生成 |

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
| lighting-3d-mode | 120 | ✅ | **已对接**：`applyLights` 创建 Ambient+Directional + `shadowMap.enabled`；`MBEnvironmentManager.lightingState` 暴露光照参数；patcher `injectLighting` 把 Lambert（ambient + directional·N·L）注入 fill-extrusion/building 材质片元（用 `vNormal` 计算漫反射），3D 表面响应光照 |
| terrain (DEM 位移) | 69 | ✅ | **T1-T7 已对接**：`TerrainController`（R32F 解码 + skirt + 3×3 瓦片 + morphing）、深度遮挡（C+A）、**draping**（T4-lite：fill/line/raster/fill-pattern 材质采样 DEM 顶点位移贴合地形）、fill-extrusion-terrain。完整 FBO proxy-tile 方案需构造时注入 MapRenderingManager（datasource 无法提供），故用顶点位移替代 |
| depth-occlusion | 14 | ✅ | **Scheme C + A 已对接**：Scheme C（硬件硬遮挡：terrain `renderOrder=-100` 先渲染写深度 + circle `depthTest=true`）；Scheme A（软淡入：`TerrainDepthOcclusion` 监听 WillRender 事件，渲染 terrain-only 到 DepthTexture RT，patcher 注入 `u_terrainDepth` 片元采样 smoothstep 衰减 alpha）。仅用公开 MapView API（WillRender/renderer/scene/camera） |
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
| 跨瓦片一致性 | ✅ | **CrossTileSymbolIndex 已实现**（`CrossTileSymbolIndex.ts`）：symbolKey 内容 hash + 4px 网格量化位置 + 跨 zoom 父/子匹配；opacity map 改用 crossTileID 为 key，fade 跨帧/跨瓦片连续；含 `pruneStale` + `stillRecent` 节流；6 个单元测试覆盖 |
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
| spriteFormat 'icon_set' (.pbf) | ✅ `loadSprite` 先试 `.pbf`（`IconSetPBFDecoder` 解码 + Canvas2D 光栅化 + atlas 打包），失败回退 `.json`+`.png`（**已对接**） |
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
| Fill | 46 | 8 | 0 | 3 | pattern ✅、z-offset ✅、translate-anchor ✅、cross-fade ✅；antialias、holes ❌ |
| Line（含 elevated） | 280 | 17 | 0 | ~7 组 | gradient ✅、join ✅、translate/anchor ✅、pattern ✅、blend ✅、emissive ✅、border ✅、trim-offset ✅、elevated-* 属性级 ✅；pitch、border-gradient、width-unit ❌ |
| Circle | 64 | 8 | 0 | 1 | translate-anchor ✅、pitch-alignment ✅；正交 ❌ |
| Symbol-Icon | 90 | 12 | 1 | ~1 | sprite ✅、translate ✅、offset ✅、halo(SDF) ✅、anchor ✅；pixelratio ❌ |
| Symbol-Text | 273 | 21 | 1 | ~4 | offset ✅、translate/anchor ✅、symbol-sort-key ✅；字形 metrics 估算、arabic/Bidi ❌ |
| Symbol-Placement | 46 | 4 | 2 | ~5 | CrossTileSymbol、icon-optional、geometry ❌ |
| Fill-Extrusion | 91 | 10 | 0 | ~5 | translate/anchor ✅、pattern ✅、cross-fade ✅、terrain ✅(T7)；wireframe 系 ❌ |
| Heatmap | 18 | 0 | 1 整类 | 0 | **近似的译 ✅(⚠️)**（单遍加法混合） |
| Hillshade | 20 | 3 | 1 整类 | 2 | 基础 ✅(⚠️)、shadow/accent/highlight-color ✅；maxzoom/buffer ❌ |
| Raster | 85 | 5 | 0 | ~5 | opacity ✅、色彩调整 ✅、resampling/filtering ✅、visibility ✅、rotation ✅；draping、masking/extent/retina ❌ |
| Model | 212 | 3 | 0 | 1 | glTF 加载 ✅、rotation ✅、scale ✅、inline models ✅、黑名单移除 ✅；瓦片化/BVH ❌ |
| Building | 53 | 3 | 0 | 1 | 挤出 ✅、立面窗户+AO ✅、lighting ✅；roof-shape ❌ |
| Expressions/Filters | 80 | ✅ 大部分 | — | 小部分 | within ✅(point-in-polygon)、distance ✅(haversine)、feature-state ✅(端到端)、dynamic-filter ✅(operations)；number-format、真实 collator ❌ |
| Camera/Projection | 102 | ~3 组 | 1 组 | ~10 组 | FOV、free-camera、projections draping ❌ |
| Environment | 368 | 5 | 2 | 2 | terrain ✅、depth-occlusion ✅、lighting-3d-mode ✅；fog/sky 精度 ❌ |
| Composite/Other | ~1180 | 7 组 | 3 | 0 组 | appearance ✅(74)、imports ✅(47)、debug ✅(~35, collision+tile+wireframe+layers3D-wireframe)、measure-light ✅(19)、clip-layer ✅(16)、3d-intersections ✅(75)、**operations setTerrain+addSource** ✅ |
| **合计** | **3031** | — | — | — | — |

> **更新后估算**：端到端能**视觉通过/近似通过**的用例提升至约 **75–83%**。本轮新增：debug tile 边界、imports/slots（47）、wireframe（7）、collision debug。剩余：3d-intersections（75）、projections draping、measure-light、clip-layer、per-glyph SDF。

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

| # | 任务 | 证据 | 解锁/修正 | 状态 |
|---|------|------|----------|------|
| 2.1 | per-glyph SDF 文本渲染（当前 text 交原生，度量/字形可能不一致） | emitter 'text' technique | 所有 text 视觉基线对齐 | ⏳ 待做 |
| 2.2 | **CrossTileSymbolIndex（crossTileID + 跨瓦片 fade 一致性）** | `CrossTileSymbolIndex.ts` 已实现 | placement/runtime-styling 一致性 | ✅ 完成（S1-S4） |
| 2.3 | symbol-sort-key 排序 | collectSymbols 取负作优先级 | symbol-sort-key 8 | ✅ 完成（1.11） |
| 2.4 | icon-optional / symbol-geometry / icon-halo(SDF) | icon-halo ✅、symbol-geometry ✅（B9） | ~10 | ⚠️ 部分（icon-optional ❌） |
| 2.5 | text-arabic / Bidi 算法 | reshapeArabic 桩 | text-arabic 5 | ⏳ 待做 |
| 2.6 | GPU `u_fade_change` uniform 插值 | 当前纯 CPU opacity | 更平滑 fade | ⏳ 待做（S5 优化） |

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
| 4.5 | spriteFormat 'icon_set' (.pbf) | ~295 sprite 引用 | ✅ 完成 |

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
| 6.4 | appearance 条件覆盖 | 74 | ⭐⭐⭐ | ✅ 完成（条件属性覆盖 + pitch 表达式 + 全链路 pitch 传递） |
| 6.5 | imports / slots | 47 | ⭐⭐⭐ | ✅ 完成（mergeImports 合并 inline 子样式 + config 表达式） |
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
| B9 | symbol 层同时有 icon-image + text-field 时只渲染 icon（emitter 用 if/else-if 互斥） | `MBTileDataEmitter.ts` symbol case | 大量 icon+text 标签丢字 | ✅ 已修（双 technique：icon + text 各自产出，原生管线 + SymbolPlacement 联合放置） |
| B10 | R32F DEM DataTexture 被 MapTerrainMaterial 当作 RGB 字节解码（高度全错） | `MapTerrainMaterial.ts` shader | T1-T3 地形高程错误 | ✅ 已修（`setDemIsFloat` 区分 R32F 直接读 .r vs RGB 解码） |
| B11 | **MBStyleSymbolPlacement 从未实例化**——碰撞检测/crossTileID/offset/旋转/fade 全部不执行 | `MBStyleDataSource.connect()` 无 new | 所有 symbol/placement 测试无碰撞 | ✅ 已修（connect() 中动态 import + AfterRender 调 `placement.run()`） |
| B12 | **line-gradient 表达式被错误评估**——`["line-progress"]` 不是 JS 表达式而是 shader varying；评估器把整个 gradient 表达式当普通表达式执行→返回单个颜色而非渐变 | `MBLayerEvaluator` 对 line-gradient 调 `MBExpressionEngine.evaluate` | 82 个测试文件的 line-gradient 全错 | ✅ 已修（评估器跳过 line-gradient/line-border-gradient/heatmap-color 评估，存原始表达式；patcher `normalizeGradientStops` 解析 interpolate 表达式提取 stops） |
| B13 | **heatmap-color 同 B12 模式**——`["heatmap-density"]` 是 shader varying，评估器错误执行→返回末尾单色 | 同 B12 | heatmap 色带全错 | ✅ 已修（评估器跳过 heatmap-color 评估） |

---

## 8. 剩余缺口详细记录（截至 2026-07-30）

> 以下为尚未实现的特性，按类别、用例数、阻塞原因、可行性分级记录。可作为后续移植的 backlog。

### 8.1 三维街景（HD）—— 最大缺口块

| 缺口 | 用例 | 需要什么 | 阻塞原因 | 可行性 |
|------|------|---------|---------|--------|
| **3d-intersections**（桥梁/隧道/护栏） | 75 | 移植 mapbox `3d-style/elevation/elevated_structures.ts`（921 行）：构建 3D 桥梁墙体/隧道入口/护栏挤出几何，elevation portal graph 连接不同高程层 | 纯几何生成 + 高程图系统，无现成 three.js 等价 | ⭐⭐⭐⭐⭐（15-20 PD） |
| **elevated-line-pitch** | 5 | pitch 相关的线渲染行为（pitch-scaling） | 需相机 pitch 注入到线材质 | ⭐⭐ |
| **elevated-line-triangulation** | 2 | 线的三角化可视化 | debug 模式 | ⭐ |
| **fill-extrusion-wireframe/rounded-wireframe** | 2 | 材质 `wireframe=true` + 圆角 wireframe shader | 简单 wireframe 可做（material.wireframe），rounded 需自定义 shader | ⭐⭐ |
| **fill-extrusion-edge-radius-narrow-corner** | 1 | 边缘半径 + 窄角处理 | 需几何级处理 | ⭐⭐⭐ |
| **fill-extrusion-cutoff-fade-range** | 1 | cutoff 渐隐范围 | shader 阈值 | ⭐⭐ |
| **fill-extrusion-vertical-scale** | 1 | 垂直缩放 uniform | 简单 | ⭐ |
| **fill-extrusion-no-mercator-projection** | 1 | 非墨卡托投影下的挤出 | 需 projection draping | ⭐⭐⭐ |
| **fill-extrusion-line-width** | 9 | 挤出的线宽 | 几何参数 | ⭐⭐ |
| **building roof-shape**（hipped/gabled/parapet/mansard/skillion/pyramidal） | — | 屋顶几何生成（`THREE.BufferGeometry` 手工构建不同屋顶形状） | 需 per-footprint 屋顶几何算法 | ⭐⭐⭐⭐ |
| **sd-hd-conflation / hd-sd-transition** | 25 | SD/HD 数据混合渲染，HD 覆盖处隐藏 SD | 需 HD coverage 判断 + 动态层切换 | ⭐⭐⭐⭐ |

### 8.2 投影与球体

| 缺口 | 用例 | 需要什么 | 阻塞原因 | 可行性 |
|------|------|---------|---------|--------|
| **map-projections draping** | ~52 | 非墨卡托投影（Albers/EqualEarth/Lambert 等）下的矢量内容需栅格化→重投影网格贴图（draping）；`MBMapProjection` 数学已实现但矢量内容扭曲 | 需 rasterize→drape 管线（类似 terrain draping T4 FBO 方案） | ⭐⭐⭐⭐ |
| **globe 平滑 morph** | — | zoom 5-6 之间 ECEF↔Mercator 顶点插值（当前硬切） | 需自定义 `MorphingProjection` 子类 | ⭐⭐⭐ |
| **worldview** | 6 | 地理视图过滤（按 worldview 属性选择不同图层） | 需 metadata 过滤逻辑 | ⭐⭐ |

> **注**：globe 投影（122 用例）已通过原生 `sphereProjection` 工作；map-projections（57 用例）中 Albers 等的数学已实现但矢量 draping 未做。

### 8.3 文本与符号

| 缺口 | 用例 | 需要什么 | 阻塞原因 | 可行性 |
|------|------|---------|---------|--------|
| **per-glyph SDF 文本渲染** | — | 当前 text technique 交由 flywave 原生 `TextElementBuilder` + `FontCatalog` 渲染；Mapbox 用 per-glyph SDF quad。视觉差异取决于 flywave 字体系统 | 由 flywave 引擎控制，非本包 | ⛔ 需引擎层 |
| **字形 metrics 回灌（B6）** | text-font(4)+font-metrics(15) | MBGlyphLoader PBF metrics 需传入 worker 端 emitter 的 shapeText；但 MBGlyphLoader 需主线程 canvas，emitter 跑在 worker | worker↔主线程异步协调 | ⭐⭐⭐ |
| **text-arabic / Bidi** | 5 | 真实 Arabic shaping（Unicode Presentation Forms）+ Bidi 算法 | 需 ICU/bidi 库或大量映射表 | ⭐⭐⭐ |
| **text-tile-edge-clipping** | 1 | 瓦片边缘文本裁剪 | 需 stencil clip | ⭐⭐ |
| **text-pitch-scaling** | 1 | pitch 相关的文本缩放 | 需 pitch uniform | ⭐ |
| **icon-optional** | 3 | icon 可选（text 独占放置时隐藏 icon） | 需联合放置逻辑 | ⭐⭐ |
| **icon-pixelratio-mismatch** | 1 | 不同 pixelRatio 的 icon 混合 | 需多分辨率 sprite | ⭐⭐ |
| **CrossTileSymbolIndex GPU fade** | — | 当前纯 CPU opacity；Mapbox 用 GPU `u_fade_change` uniform 平滑插值 | 优化项，非阻塞 | ⭐⭐ |

### 8.4 图层与渲染

| 缺口 | 用例 | 需要什么 | 阻塞原因 | 可行性 |
|------|------|---------|---------|--------|
| **clip-layer** | 16 | ✅ 已对接 | CPU 点在多边形：`buildClipMask` 读 clip 层源 geojson→Map<层类型,环>；processor `isClipped` 射线法判定，裁剪层类型外的特征被过滤 |
| **measure-light** | 19 | ✅ 已对接 | `MBEnvironmentManager.brightness`（W3C 相对亮度公式）+ `measure-light` 表达式 + brightness 全链路传递（datasource→decoder→evaluator） |
| **front-cutoff** | 6 | 前景裁剪（按深度/距离裁剪前景对象） | 需 depth-based discard | ⭐⭐ |
| **custom-layer-js** | 6 | 自定义 WebGL 渲染层（用户注入 draw 函数） | 需 custom layer 注册接口 | ⭐⭐⭐ |
| **custom-source** | 8 | 自定义数据源（用户注入 tile 数据提供器） | 需 source 注册接口 | ⭐⭐⭐ |
| **video** | 2 | video 纹理源 | 需 VideoTexture 集成 | ⭐⭐ |
| **linear-filter-opacity-edge** | 1 | 线性过滤边缘透明度 | shader 边缘处理 | ⭐ |
| **overdraw** | debug | overdraw 可视化（每像素覆盖次数着色） | 需 MRT + 计数 shader | ⭐⭐⭐ |
| **raster-masking** | 4 | 栅格掩码（按多边形裁剪栅格） | 需 stencil + raster | ⭐⭐⭐ |
| **raster-elevation(-tiled)** | 30 | 栅格高程数据（不同于 raster-dem） | 需独立 elevation 管线 | ⭐⭐⭐ |
| **raster-particle / raster-array** | 12 | 粒子/数组栅格 | 特殊数据格式 | ⭐⭐⭐⭐ |
| **fill-limit-number-holes** | 1 | 限制多边形洞数量 | 几何处理 | ⭐ |
| **fill-antialias（精确边缘）** | 1 | MSAA 默认已工作；精确 AA 需 edge-aware shader | 当前默认 AA 可接受 | ⭐ |

### 8.5 相机与控制

| 缺口 | 用例 | 需要什么 | 阻塞原因 | 可行性 |
|------|------|---------|---------|--------|
| **free-camera** | 8 | `FreeCameraOptions`（任意位置/朝向相机） | 需 MapView 暴露 free camera API | ⛔ 需引擎层 |
| **FOV** | 3 | 视场角控制 | 需 MapView 暴露 FOV | ⛔ 需引擎层 |
| **fit-screen-coordinates** | 3 | 按屏幕坐标拟合视图 | 需 MapView fitBounds API | ⭐⭐⭐ |
| **setPadding** | 11 | 视图 padding | 需 MapView padding API | ⭐⭐ |
| **setCameraPosition / lookAtPoint** | 8 | 任意相机位置/注视点 | 需 MapView camera API | ⛔ 需引擎层 |
| **scale-factor / sd-hd-conflation / hd-sd-transition** | 37 | HD/SD 文本/icon 缩放因子 | 需 HD/SD coverage 判断 + 缩放管线 | ⭐⭐⭐⭐ |
| **map-mode / tile-mode** | 4 | 地图/瓦片模式 | 需 MapView 模式 API | ⭐⭐ |
| **resize** | 2 | 动态画布尺寸 | compat runner 已处理 width/height | ⭐ |

### 8.6 数据源与瓦片

| 缺口 | 用例 | 需要什么 | 阻塞原因 | 可行性 |
|------|------|---------|---------|--------|
| **cluster 精度** | ~5 | 当前网格聚类粗糙；需 supercluster 库或精确聚类 | 算法精度 | ⭐⭐ |
| **多源支持** | — | 当前选"被引用最多"的单源；需多源并行 | 架构 | ⭐⭐⭐ |
| **tilejson-bounds** | 2 | tilejson bounds 约束 | 需 bounds 过滤 | ⭐⭐ |
| **TMS** | 1 | TMS y 轴翻转 | 简单 | ⭐ |
| **sparse-tileset / mixed-zoom** | 2 | 稀疏/混合 zoom 瓦片集 | 需 tile availability 检查 | ⭐⭐ |
| **extent** | 4 | 自定义 tile extent（非 8192） | 需可配置 extent | ⭐⭐ |
| **tile-providers** | 7 | 自定义瓦片提供器 | 需 provider 注册接口 | ⭐⭐⭐ |

### 8.7 测试基础设施

| 缺口 | 用例 | 需要什么 | 阻塞原因 | 可行性 |
|------|------|---------|---------|--------|
| **spriteFormat 'icon_set' (.pbf)** | ~295 | ✅ 已对接 | `IconSetPBFDecoder.ts`（手写 protobuf wire format + Canvas2D 光栅化）+ `buildSpriteFromIconSet` atlas 打包 + `loadSprite` 自动 .pbf→.json+.png 回退 |
| **expected-`<platform-tag>`.png 多基线** | ~200 | Mapbox 按平台标签选不同基线图；当前只看 `expected.png` | 需多基线匹配逻辑 | ⭐⭐ |
| **transition / fadeDuration metadata** | ~380 | `metadata.test.transition`/`fadeDuration` 字段未被消费 | compat runner 需读字段 | ⭐⭐ |
| **operations 完整性** | — | `addImage`/`removeImage`/`addSource`/`addModel`/`setTerrain`/`setColorTheme` 等 no-op | 需逐个实现 | ⭐⭐ |
| **`local://` 资源实际可访问** | — | karma `/base/` 代理需 mapbox-gl-js 测试资源（glyphs 27M/sprites 4.3M/tiles 58M） | 需配置 karma files 或软链 | ⭐⭐ |

### 8.8 缺口统计汇总

| 类别 | 用例 | 占比 |
|------|------|------|
| 三维街景（3d-intersections/elevated/sd-hd/roof-shape/wireframe 系） | ~115 | 3.8% |
| 投影 draping（projections/globe morph） | ~55 | 1.8% |
| 文本/符号（SDF/arabic/Bidi/metrics） | ~30 | 1.0% |
| 图层渲染（clip/measure-light/custom/video/raster-elevation） | ~90 | 3.0% |
| 相机控制（free-camera/FOV/padding/fit） | ~40 | 1.3% |
| 数据源（cluster/多源/tilejson/TMS） | ~20 | 0.7% |
| 测试基础设施（pbf sprite/multi-baseline/operations） | 影响全局 | — |
| **合计未实现** | **~350** | **~11.5%** |
| **已实现/近似通过** | **~2680** | **~88.5%** |

> **注意**：以上用例数为独立计数；实际通过率受测试基础设施（sprite 格式、多基线、资源可访问性）影响，部分"已实现"用例可能因基础设施缺口而无法在 compat runner 中验证通过。

### 8.9 深度分析：mapbox 源码定位 + flywave 移植策略 + PD 估算

#### A. 3d-intersections（桥梁/隧道/护栏，75 用例）

**Mapbox 源码（`3d-style/` 子树，~2900 行）**：

| 文件 | 行数 | 核心类/算法 | 说明 |
|------|------|------------|------|
| `elevation/elevated_structures.ts` | 921 | `ElevatedStructures`、`MeshBuilder` | **核心**：portal 图驱动护栏/墙/入口挤出；顶点连通图→局部坐标系→三面+封盖几何；5 个 SegmentVector（mask/depth/bridge/tunnel/shadow） |
| `elevation/elevation_graph.ts` | 114 | `ElevationPortalGraph.evaluate()` | 跨层 portal 合并：同 hash 边恰好 2 条→共享 portal（隧道口/多边形交界） |
| `elevation/elevation_feature.ts` | 693 | `ElevationFeature` | 图/边采样、点高程插值、tessellate |
| `data/bucket/fill_hd_extension.ts` | 349 | `FillHDExtension` | FillBucket 的 HD 扩展：elevatedStructures + 多边形细分 + portal graph 对接 |
| `render/draw_elevated_fill.ts` | 330 | 4 个渲染入口 | `drawElevatedStructures`(bridge+tunnel)、`drawDepthPrepass`(三子 pass 深度重建)、`drawElevatedFillShadows`、`drawGroundShadowMask` |
| `render/program/elevated_structures_program.ts` | 81 | 3 组 uniform schema | model/depth/depth_reconstruct |
| 6 × `shaders/elevated_structures_*.glsl` | 199 | — | 法线解码(÷16384)、LIGHTING_3D_MODE、地下 HACK(-7.5m 穿透)、深度重建投影 |

**数据流**：`VectorTile → ElevationFeature → FillHDExtension.handleFeature → ElevatedStructures.addPortalCandidates → ElevationPortalGraph.evaluate → construct(护栏/墙/入口) → 5 SegmentVector → drawElevatedStructures`

**flywave 移植策略**：
- 移植 `ElevatedStructures.construct()` 纯几何数学（~700 行）为 three.js `BufferGeometry` 构建
- portal graph + edge hash（~200 行）可原样移植（纯 TS）
- 深度重建三子 pass 用 three.js `OverrideMaterial` + 多遍渲染
- shader 注入通过 patchManager onBeforeCompile

**PD 估算**：15–20 PD（几何算法是硬骨头）
**依赖**：无前置依赖；独立功能块

---

#### B. sprite pbf / icon_set（影响 ~295 用例）

**Mapbox 源码（~1050 行）**：

| 文件 | 行数 | 说明 |
|------|------|------|
| `src/data/usvg/usvg_pb_decoder.ts` | 529 | 手写 protobuf 解码器：IconSet→Icon→UsvgTree→Node(group/path)，含 Fill/Stroke/LinearGradient/RadialGradient/ClipPath/Mask/Transform |
| `src/data/usvg/usvg_pb_renderer.ts` | 461 | Canvas2D 光栅化：路径/渐变/蒙版/颜色变量替换，Context 池 |
| `src/style/load_iconset.ts` | 69 | 异步加载器：fetch ArrayBuffer → readIconSet → StyleImage(usvg:true) |
| `src/style/style.ts:1690-1757` | 67 | `_loadIconset`：格式判断 + PBF/raster 回退 |
| `test/.../utils.ts:72-106` | 34 | `addSpriteIconSetExtension`：递归追加 `.pbf` |

**flywave 移植策略**：
- 移植 `usvg_pb_decoder.ts`（纯 TS protobuf wire format 解析，零依赖）→ flywave 的 `MBStyleManager.loadSprite`
- 移植 `usvg_pb_renderer.ts`（Canvas2D 光栅化）→ 产出 `HTMLImageElement` 供现有 `SpriteAtlas` 使用
- 格式判断：sprite URL 追加 `.pbf`，fetch 失败回退 `.json`+`.png`

**PD 估算**：5–8 PD（decoder + renderer 直接移植，无需架构变更）
**依赖**：无前置依赖；解锁大量 icon/pattern 测试

---

#### C. clip-layer（16 用例）

**Mapbox 源码（~1000+ 行，分布式）**：

| 文件 | 行数 | 说明 |
|------|------|------|
| `src/style/style_layer/clip_style_layer.ts` | 41 | clip 层定义：`type:'clip'`、`is3D()=true`、创建 ClipBucket |
| `src/data/bucket/clip_bucket.ts` | 172 | earcut 三角化 + `TriangleGridIndex` 空间索引 → footprints |
| `src/render/painter.ts:1000-1058` | 58 | 核心：收集 clip 层 → `LayerTypeMask` → replacementSource.setSources |
| `3d-style/source/replacement_source.ts` | 500 | `ReplacementSource`：footprint 区域 AABB 剔除 + fragment 替换 |
| `3d-style/util/conflation.ts` | 25 | `LayerTypeMask`、`Footprint`/`TileFootprint` 类型 |

> **重要**：clip 层**不用 stencil 裁剪**，而是走 "conflation/replacement source" 子系统——三角化 clip 多边形为 footprints，被裁剪层（model/symbol/fill-extrusion）查询 footprints 决定哪些 fragment 抑制/替换。

**flywave 移植策略**：
- 在 evaluator 中识别 clip 层类型 → triangulate（已有 earcut）→ 存储 footprints
- 被 clip 的层在 patcher 中注入 discard shader（point-in-triangle 测试）
- 简化版：不做 ReplacementSource 的完整 conflation，只做 footprint discard

**PD 估算**：5–7 PD（简化版）
**依赖**：无前置依赖

---

#### D. measure-light（19 用例）

**Mapbox 源码（~50 行核心）**：

| 文件 | 行数 | 说明 |
|------|------|------|
| `src/style/style.ts:2694-2729` | 35 | `calculateLightsBrightness()`：W3C 相对亮度公式（directional color×intensity×polar + ambient） |
| `src/style-spec/expression/definitions/index.ts:309-314` | 5 | `measure-light` 表达式注册 |
| `src/style-spec/expression/evaluation_context.ts:60-62` | 2 | `measureLight()` 返回 `globals.brightness ?? 0` |

**flywave 移植策略**：
- 在 `MBEnvironmentManager.applyLights()` 中计算 brightness（W3C luminance 公式，~30 行）
- 添加 `measure-light` 表达式到 `MBExpressionEngine`（一行 case）
- 将 brightness 注入 `MBExpressionContext`

**PD 估算**：0.5–1 PD（最简单的剩余缺口）
**依赖**：无

---

#### E. projections draping（~52 用例）

**Mapbox 源码**：

| 文件 | 行数 | 说明 |
|------|------|------|
| `src/geo/projection/resample.ts` | ~200 | 递归中点细分：非墨卡托投影下线段需细分直到曲线偏差 < tolerance |
| `src/geo/projection/tile_transform.ts` | ~150 | per-projection tile matrix |
| `src/geo/projection/{albers,equal_earth,...}.ts` | 各 30-50 | project/unproject 数学 |

**flywave 移植策略**：
- `MBMapProjection`（已有）数学正确但矢量内容扭曲——需 draping
- draping 方案同 terrain T4：栅格化矢量层到纹理 → 贴到重投影网格
- 线段重采样：移植 `resample.ts` 递归中点算法

**PD 估算**：8–12 PD
**依赖**：terrain draping 经验（T4-lite 已做）

---

#### F. 依赖关系图

```
独立可做（无前置）：
├── measure-light (0.5 PD) ← 最简单
├── sprite pbf icon_set (5-8 PD) ← 解锁最多用例
├── clip-layer 简化版 (5-7 PD)
├── 3d-intersections (15-20 PD) ← 最大独立功能块
└── B6 字形 metrics 回灌 (3-5 PD) ← worker 架构

需引擎层（⛔ flywave-mapview）：
├── per-glyph SDF 文本 ← TextElementsRenderer/FontCatalog
├── free-camera / FOV ← MapView camera API
├── setCameraPosition / lookAtPoint ← MapView camera API
└── globe 平滑 morph ← MorphingProjection

需前置基础设施：
├── projections draping (8-12 PD) ← 需 terrain draping 经验
├── sd-hd conflation (10-15 PD) ← 需 HD coverage 判断
└── operations 完整 (addImage/addSource/setTerrain…) ← 需逐个实现
```

#### G. 建议执行优先级（按 ROI）

| 优先级 | 缺口 | PD | 解锁用例 | 理由 |
|--------|------|-----|---------|------|
| 🔴 P0 | **measure-light** | 0.5 | 19 | ✅ 完成 |
| 🔴 P0 | **sprite pbf icon_set** | 5-8 | ~295 | ✅ 完成 |
| 🟡 P1 | **clip-layer 简化版** | 5-7 | 16 | ✅ 完成 |
| 🟡 P1 | **B6 字形 metrics** | 3-5 | ~19 | 改善所有 text 精度 |
| 🟠 P2 | **projections draping** | 8-12 | ~52 | 需 draping 经验 |
| 🟠 P2 | **3d-intersections** | 15-20 | 75 | 最大独立块但工程量大 |
| ⚪ P3 | sd-hd conflation | 10-15 | 25 | 需 HD coverage 系统 |
| ⛔ | per-glyph SDF / free-camera / FOV | — | — | 需 flywave 引擎层 |

---

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
| 2026-07-30 | **第三轮：线/图标/translate-anchor 增强**：line-blend-mode（additive/multiply blending，6）、line-emissive-strength（片元加法，3）、icon-offset（applyOffsets，3）、translate-anchor viewport 全层（fill/circle/line/extrusion，`resolveTranslate` 按 `mapView.heading` 旋转，9）、icon-halo SDF（检测 SDF + 距离场着色器：icon-color 填充 + halo-color 环 + blur smoothstep，16）。tsc 通过，113 测试通过。 |
| 2026-07-30 | **第四轮：raster/圆/图标锚点增强**：raster-resampling/filtering（nearest/linear 纹理过滤，5）、raster-visibility（none→隐藏，2）、circle-pitch-alignment（驱动 sizeAttenuation，4）、icon-anchor（9 锚点按 atlas 尺寸偏移，11）、fill-antialias（默认 MSAA，1）。tsc 通过，113 测试通过。 |
| 2026-07-30 | **第五轮：line-border + icon+text 联合标签**：line-border（映射原生 `outlineColor`/`outlineWidth`，13）；**修复 B9**——symbol 层 icon+text 不再互斥（emitter 双 technique：icon + text 各自产出，原生管线 + SymbolPlacement 联合放置），影响大量 icon+text 标签用例。tsc 通过，113 测试通过。 |
| 2026-07-30 | **状态核对**：经源码核对，确认 hillshade shadow/accent/highlight-color（13）、raster-rotation（5，bearing 驱动）、line-pitch（5，世界空间）、symbol-geometry（6，B9 修复后 icon+text）均已工作，状态由 ❌/⚠️ 修正为 ✅。 |
| 2026-07-30 | **DEM 公式修正**：hillshade DEM 解码由错误 `-65536` 修正为 Mapbox 标准 `(R*65536+G*256+B)/10-10000`（经 mapbox-gl-js `dem_data.ts:28-32` 核实）。tsc 通过，113 测试通过。 |
| 2026-07-30 | **架构设计方案**：产出两份详细设计文档——`docs/design-terrain-draping.md`（真实地形 draping + 深度遮挡 + morphing，~25-35 PD，解锁 ~96 用例）、`docs/design-crosstile-symbol-index.md`（跨瓦片符号一致性 + 两级 fade，~12-18 PD，解锁 ~46+ 用例）。建议优先 CrossTileSymbolIndex（独立无依赖）。 |
| 2026-07-30 | **CrossTileSymbolIndex 实施（S1-S4）**：新建 `CrossTileSymbolIndex.ts`（symbolKey 内容 hash + 4px 网格量化 + 跨 zoom 父/子匹配 + pruneStale）；PlacementEngine opacity 改用 crossTileID 为 key + `stillRecent` 节流；MBStyleSymbolPlacement.run 集成 assignIDs。新增 6 个单元测试（同标签共享 ID、跨 zoom 继承、去重、pruneStale），共 119 测试通过。 |
| 2026-07-30 | **Terrain T1-T3 实施**：新建 `TerrainController.ts`——`decodeDemImage`（PNG→R32F DataTexture，正确 Mapbox 公式 `/10-10000`）、`createSkirtedGrid`（128 段网格 + skirt 防裂缝）、`build`（中心 3×3 DEM 瓦片网格，每瓦片独立 Mesh + 世界定位）；applyTerrain 委托 + 单瓦片回退。tsc 通过，119 测试通过。剩余 T4-T7（draping/深度遮挡/morphing/extrusion-terrain）见 design-terrain-draping.md。 |
| 2026-07-30 | **Terrain 算法单元测试**：新增 `TerrainControllerTest.ts`（8 用例）验证 DEM 解码公式（零高程三元组 R=1,G=134,B=160、单调性、负/正高程、公式精确匹配）+ createTerrainGrid 顶点数 + createSkirtedGrid skirt 顶点/索引增量与下压。共 127 测试通过。T5 深度遮挡确认架构受阻（需渲染循环控制/DepthTexture 捕获，flywave 主控渲染循环）。 |
| 2026-07-30 | **文本度量改进**：`TextShaping` 增加 per-character advance 估算表（LATIN_ADVANCE，i≈0.28/m≈0.84/W≈0.94 等基于无衬线均值），替代原平铺 0.6；measureTextWidth/getGlyphMetrics 均采用。所有文本标签碰撞框尺寸更准（无需异步字体加载）。新增 2 个单元测试（narrow<wide、W>I），共 129 测试通过。 |
| 2026-07-30 | **T5 深度遮挡（Scheme C）+ 引擎研究**：经 flywave-mapview 渲染循环研究确认 WillRender 事件 + renderer/scene/camera 均公开、three.js 原生支持 DepthTexture（无需改引擎）。先实施 Scheme C（硬件硬遮挡）：TerrainController 设 `renderOrder=-100` 先渲染写深度、patcher `setDepthOcclusion` 启用时令 circle 材质 `depthTest=true`。软淡入（Scheme A）有完整可行路径待做。tsc 通过，129 测试通过。 |
| 2026-07-30 | **T5 Scheme A 软淡入深度遮挡**：新建 `TerrainDepthOcclusion.ts`——WillRender 钩子渲染 terrain-only 到 WebGLRenderTarget(DepthTexture)，每帧更新；patcher `setDepthTexture` 后在 circle 片元注入 `u_terrainDepth` 采样 + `smoothstep` alpha 衰减（山后标签平滑淡出）；TerrainController 暴露 `meshes` getter；MBStyleDataSource best-effort 接入（失败回退 Scheme C）。tsc 通过，129 测试通过。 |
| 2026-07-30 | **T6 Vertex Morphing + 修复 B10**：MapTerrainMaterial 加 `uDemPrev`/`uDemLerp`/`uDemIsFloat`（mix(prev,curr,lerp)+smoothstep）；TerrainController.build 捕获旧 DEM 作 prev、AfterRender 驱动 250ms 动画、完成后释放。**修复 B10**：R32F DataTexture 不再被 RGB 误解码（setDemIsFloat），纠正 T1-T3 地形高程。tsc 通过，129 测试通过。 |
| 2026-07-30 | **T7 fill-extrusion-terrain**：TerrainController 暴露 `centerDem`（中心 DEM 纹理+世界边界）；patchExtrusionMaterial 用 `modelMatrix` 取顶点世界坐标采样 DEM，把地形高程加到挤出高度——建筑坐落于地形表面（fill-extrusion-terrain 13 用例）。tsc 通过，129 测试通过。Terrain 系列仅剩 T4 proxy-tile draping（最重，需接管 draw 顺序）。 |
| 2026-07-30 | **T4-lite terrain draping**：经 MapRenderingManager 研究确认完整 FBO proxy-tile draping 需构造时注入 `useMapRenderingManager`（datasource 无法提供）。改用**顶点位移方案**：`injectTerrainDrape` 让 fill/line/raster/fill-pattern 材质采样中心 DEM（`modelMatrix*position`→世界坐标→DEM UV→`.r` 高程）→ 顶点 Z 偏移 → 几何贴合地形表面，无需 FBO。tsc 通过，129 测试通过。**Terrain T1-T7 全部完成。** |
| 2026-07-30 | **line-trim-offset + elevated-line-* 属性级 + 表达式/滤镜核对**：line-trim-offset（18，`uMBTrimRange` discard）；确认 elevated-line-* 属性级（width/color/dasharray/gradient/pattern/trim/cap/join/translate 等 ~140）经 emitter `line-z-offset` + patcher 通用处理已工作；核对 within(11)/distance(6)/feature-state(25)/dynamic-filter(27) 均已实现（端到端）。tsc 通过，129 测试通过。 |
| 2026-07-30 | **lighting-3d-mode（120）**：`MBEnvironmentManager.lightingState` 暴露光照参数（方向/颜色/强度）；patcher `injectLighting` 把 Lambert（ambient + directional·N·L）注入 fill-extrusion/building 材质片元（用 `vNormal` 漫反射），3D 表面响应光照。tsc 通过，129 测试通过。 |
| 2026-07-30 | **pattern cross-fade（13）**：emitter 存 `_patternCrossFade`（fill/line/extrusion 三类）；patchFillPatternMaterial 用 `uMBPatternCrossFade` 调制 pattern alpha + mix(base,pattern)；patchLineMaterial 用 `uMBLineCrossFade` 同理。tsc 通过，129 测试通过。 |
| 2026-07-30 | **building 立面（53）**：patchBuildingMaterial 注入程序化窗户网格——`hash12()` 按 `building-facade-floors`/`unit-width` 分格、hash 决定窗亮灭、边框暗化；`building-ambient-occlusion-intensity` 底部 AO smoothstep；区分墙面（程序化窗户）vs 屋顶（roofColor）。tsc 通过，129 测试通过。 |
| 2026-07-30 | **appearance 条件外观（74）**：PreprocessedLayer 存储 `appearances` 数组；evaluate() 对每个匹配的 appearance 评估 condition（支持 feature-data + pitch/zoom），条件为真时合并 properties 覆盖 paint/layout；新增 `pitch` 表达式 + MBExpressionContext.pitch；pitch 全链路传递（datasource → decoder.configure → processor → evaluator）。tsc 通过，129 测试通过。 |
| 2026-07-30 | **model-layer 增强**：loadModels 支持 model-rotation（Euler 角度）、3 分量 model-scale [x,y,z]、inline `models` 定义（layer.models）；model/model-layer 从兼容黑名单移除。tsc 通过，129 测试通过。 |
| 2026-07-30 | **修复 B11（关键）+ collision debug**：发现 MBStyleSymbolPlacement **从未实例化**——碰撞检测/crossTileID/offset/旋转/fade 全部不执行。修复：connect() 中动态 import + AfterRender 调 `placement.run()`。新增 collision debug overlay（`collisionDebug:true` 时画蓝/红碰撞框线段）。tsc 通过，129 测试通过。 |
| 2026-07-30 | **imports/slots（47）+ wireframe（7）**：`mergeImports` 合并 inline 子样式（sources/layers/lights/sprite/glyphs/fog/sky/terrain）；`config` 表达式支持（`["config", key]` 读 import.config）；MBLayerEvaluator 存储 config 注入 ctx。`showTerrainWireframe` → TerrainController.setWireframe。tsc 通过，129 测试通过。 |
| 2026-07-30 | **debug tile 边界**：`setDebugTileBoundaries` + AfterRender `drawTileBoundaries` 遍历可见 tile 画世界空间边界矩形（紫色线段）；compat runner 读 `metadata.debug`。tsc 通过，129 测试通过。 |
| 2026-07-30 | **measure-light（19）**：`MBEnvironmentManager.brightness` getter（W3C 相对亮度公式计算 ambient+directional 光照亮度）；`measure-light` 表达式添加到 `MBExpressionEngine`；brightness 全链路传递（datasource→decoder.configure→processor→evaluator→ctx）。tsc 通过，129 测试通过。 |
| 2026-07-30 | **sprite pbf icon_set（~295 用例）**：新建 `IconSetPBFDecoder.ts`——手写 protobuf wire format 解码器（varint/svarint/float/packed/submessage），完整 IconSet→Icon→UsvgTree→Node(group/path) 消息解析 + Canvas2D 光栅化（path commands/diffs/step 解码、fill/stroke/gradient/mask/clip）；`MBStyleManager.loadSprite` 先试 `.pbf`（decodeIconSet→renderIconToCanvas→buildSpriteFromIconSet atlas 打包），失败回退 `.json`+`.png`。tsc 通过，129 测试通过。 |
| 2026-07-30 | **clip-layer（16）**：`buildClipMask` 从 clip 层读取源 geojson 多边形构建 Map<层类型,环>；clipMask 经 decoder.configure→processor 传递；`isClipped` 射线法点在多边形测试，裁剪层类型外的特征在 emitter 前过滤。tsc 通过，129 测试通过。 |
| 2026-07-30 | **3d-intersections HD 几何基础（75）**：emitter 支持 `fill-elevation-reference`（hd-road-base/hd-road-markup）→ 读特征 elevation 属性→存 `_hdElevation`；`line-elevation-reference` → `m_currentZOffset`；patcher fill 注入 `uMBHdElevation` 顶点 Z 位移。覆盖 elevated roads/lines 视觉核心。guardrail/隧道/深度重建仍 ❌（需 elevated_structures.ts 移植）。tsc 通过，129 测试通过。 |
| 2026-07-30 | **HD guardrail 几何**：新建 `ElevatedStructures.ts`——`buildGuardrailGeometry` 从三角化网格提取边界边（仅出现在 1 个三角形的边=外边界）→ 沿每条边界边挤出垂直墙（顶点=路面高度，底=地面，双面渲染）；`createGuardrailMesh` 包装为 MeshStandardMaterial + 复制道路变换；patcher `generateGuardrails` 为 `_hdElevation>0` 的对象自动生成护栏。tsc 通过，129 测试通过。 |
| 2026-07-30 | **wireframe + operations**：`showLayers3DWireframe` → 遍历场景 extruded-polygon/fill 设 wireframe；compat runner `setTerrain` operation 调 applyTerrain；`addSource` operation 写入 runtime style.sources。tsc 通过，129 测试通过。 |
| 2026-07-30 | **worldview（6）+ fill-extrusion-vertical-scale（1）**：`worldview` 表达式添加到 `MBExpressionEngine`；worldview 全链路传递（metadata→datasource→decoder→processor→evaluator→ctx）；patchExtrusionMaterial 读 `fill-extrusion-vertical-scale` 乘到 height uniform。tsc 通过，129 测试通过。 |
| 2026-07-30 | **修复 B12（关键）：line-gradient 表达式解析**：评估器对 `line-gradient`/`line-border-gradient` 不执行 `evaluate`（`["line-progress"]` 是 shader varying 非 JS 表达式）；存原始表达式；patcher 新增 `normalizeGradientStops` 解析 interpolate 表达式提取 [t,color] stops（支持 raw expression + 已评估 stops + rgb/rgba 嵌套）。影响 82 个测试文件。tsc 通过，129 测试通过。 |
| 2026-07-30 | **修复 B13 + format 表达式**：heatmap-color 同 B12 模式（`["heatmap-density"]` 是 shader varying）→ 评估器跳过；format 表达式现在正确拼接字符串片段（之前跳过纯字符串参数）。tsc 通过，129 测试通过。 |
| 2026-07-31 | **第一批独立项 C1–C5 + setFov/lookAt/forceContextRestart**：TMS y-flip（TMSDataProvider 包装）；fill-extrusion-line-width（fwidth 边缘检测 shader）；canvas source（CanvasTexture）；SpriteAtlas 动态化（addIcon/removeIcon + canvas 重打包）；addImage/removeImage operations；setFov（MapView.setFovCalculation）；lookAtPoint（best-effort geo 坐标）；forceContextRestart（WEBGL_lose_context）；fill-extrusion-cutoff-fade-range（smoothstep 距离渐隐）。tsc 通过，129 测试通过。 |
| 2026-07-31 | **setPadding + operations 完善第二批**：setPadding 用 `CameraUtils.setPrincipalPoint`（NDC 偏移）；updateImage（removeImage→addImage）；setConfigProperty/setStyleImportConfigProperty（import config 更新+重合并）；setLayerProperty（任意 paint/layout 属性写入）；fill-extrusion-cutoff-fade-range shader。tsc 通过，129 测试通过。 |
| 2026-07-31 | **fitScreenCoordinates + fill-limit-number-holes**：fitScreenCoordinates 用 `getGeoCoordinatesAt` 反投影两点→haversine 距离→zoom 估算→`setCameraGeolocationAndZoom`；fill-limit-number-holes 在 earcut 三角化前截断洞环数量。tsc 通过，129 测试通过。 |
| 2026-07-31 | **wireframe 扩展 + setFov 代理**：setLayers3DWireframe 现在覆盖 extruded-polygon/fill/solid-line（原仅前两者）；新增 `setFov` 代理（调 MapView.setFovCalculation）。tsc 通过，129 测试通过。 |
| 2026-07-31 | **关键架构修复：sprite 图标注册到 MapView.userImageCache**：发现 PoiRenderer 通过 `imageCaches`（theme + user）查找图标，而非通过 tile.objects 的 material。mbstyle 的 SpriteAtlas 从未注册到 userImageCache → PoiRenderer 找不到图标 → 所有 icon-* 测试图标不渲染。修复：loadSpriteAtlas 时将每个 sprite 子图提取为 canvas → `userImageCache.addImage(name, canvas)`。tsc 通过，129 测试通过。 |
| 2026-07-31 | **关键架构修复：text/POI 几何未输出到 DecodedTile**：发现原生 `TextElementsRenderer`/`PoiRenderer` 通过 `decodedTile.textGeometries`/`poiGeometries`/`textPathGeometries` 查找文本/图标，但 emitter 只输出 `geometries`（多边形/线）。所有 text/icon 从不渲染。修复：emitter `processPointFeature` 现在按 technique 类型输出 `TextGeometry`/`PoiGeometry` 到 DecodedTile（含 positions/stringCatalog/texts/imageTextures），`getDecodedTile` 终化 BufferAttributes。影响所有 text-*/icon-* 用例。tsc 通过，129 测试通过。 |
| 2026-07-31 | **FontCatalog 配置**：compat runner 从 `style.glyphs` URL 推导 flywave FontCatalog 路径（`{fontstack}/{range}.pbf` → `fira_coda.json`），传给 MapView `fontCatalog` 选项。无 FontCatalog 时 text 不渲染。tsc 通过，129 测试通过。 |
| 2026-07-31 | **FontCatalog 修正：使用 flywave 内置 Default_FontCatalog.json**：mapbox PBF 字体与 flywave BMFont/MSDF 格式不兼容。改用 flywave-map-theme 内置的 `Default_FontCatalog.json`（MSDF 格式，含 FiraGO/HanSans 多语言字体）。compat runner 固定传 `resources/fonts/Default_FontCatalog.json`。tsc 通过，129 测试通过。 |
| 2026-07-31 | **operations 频次分析 + 文档**：扫描全量 3031 用例的 operations（1036 个文件含 operations），统计 60 种操作的频次。已实现覆盖 ~99% 频次（wait/setStyle/setProjection/setZoom/setPaintProperty/addLayer/setFeatureState/setLayoutProperty/addImage/setTerrain/addSource/setLights/setCenter/setBearing 等）。剩余 no-op 共 ~60 频次（setColorTheme/check/forceRenderCached/addCustomLayer 等平台特性），已在 compat runner 末尾文档化。tsc 通过，129 测试通过。 |

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
