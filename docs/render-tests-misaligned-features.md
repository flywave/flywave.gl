# 真正未对齐功能清单

> 基于 2025-08-02 逐项源码核验（grep + 读码），不依赖文档历史标注。
> 目标：识别"文档声称状态 ≠ 实际代码状态"的真实差距，避免过度乐观标注。

---

## 一、文档低估（实际已实现，文档标 ❌/⚠️）

| 功能 | 测试数 | 文档状态 | 实际状态 | 证据 |
|------|--------|---------|---------|------|
| **fill-limit-number-holes** | 1 | ❌ | ✅ | `MBTileDataEmitter.ts:540-544` — `effectiveRings` 按 `maxHoles` 截断内环 |
| **symbol-sort-key** | 8 | ⚠️ | ✅ | `MBStyleSymbolPlacement.ts:323/368` — 映射为 priority 排序（负值 → 升序） |
| **line-border-gradient** | 4 | ❌ | ⚠️ | evaluator 跳过存储 `MBLayerEvaluator.ts:450`，**但 patcher 无 shader 消费者** |

---

## 二、文档高估（实际未实现或过度乐观）— 最重要

| 功能 | 测试数 | 文档状态 | 实际状态 | 证据 |
|------|--------|---------|---------|------|
| **symbol-cross-fade** | 2 | ❌（诚实） | ❌ 确实未实现 | grep 无 zoom 交叉淡入淡出代码 |
| **zoom-history** | 2 | ❌（诚实） | ❌ 确实未实现 | grep 零匹配 |
| **building 屋顶形状** | 6 | ⚠️ 立面已做 | ⚠️ **无消费者** — gabled/hipped/parapet/mansard/skillion/pyramidal 均只存默认 `'flat'` | `MBLayerEvaluator.ts:195` |
| **raster-color** | 3 | ⚠️ | ⚠️ **colorVal 读了但 shader 无 uMBRasColor** — 仅触发调整分支，未实际混色 | `MBMaterialPatchManager.ts:389` 读；`:424-435` shader 无 color 混色 |
| **raster-masking** | 4 | ⚠️ 靠合成 | ⚠️ 无专用 mask 逻辑，仅 opacity 叠加 | grep 无 mask/clip 处理 |
| **hillshade-buffer** | 3 | ⚠️ 无 padding | ⚠️ `HillshadeTileDataProvider` 无 DEM border padding | grep 无 padding |
| **raster-rotation** | 5 | ⚠️ 需验证 | ⚠️ **未验证** — 理论上相机 bearing 处理，但无测试确认 | — |
| **map-mode/tile-mode** | 4 | ⚠️ flag | ⚠️ 仅存 `__mapMode` flag，**无真实渲染模式切换** | compat runner 仅存储 |
| **free-camera** | 6 | ⚠️ | ⚠️ setCameraPosition/lookAtPoint 是**近似**（用 zoom 模拟距离） | compat runner 近似实现 |
| **symbol-z-order** | 11 | ⚠️ 部分 | ⚠️ 仅 `viewport-y` 生效；`source`/`auto` 是 no-op | `MBStyleSymbolPlacement.ts:415-432` |

---

## 三、历史上误报"已工作"（此前复盘纠正，需持续警惕）

| 功能 | 曾声称 | 实际 |
|------|--------|------|
| **hillshade-buffer** | ✅ TerrainController skirt 处理 | ❌ hillshade 走 `HillshadeTileDataProvider`（非 TerrainController），无 padding |
| **raster-masking** | ✅ 叠加合成 | ⚠️ 无真实 mask，仅 opacity |
| **zoomed-fill** | ✅ flywave 原生 overzoom | ⚠️ 已修复（v36 maxDataLevel）但**未浏览器验证** |
| **symbol-z-order 完整** | ⚠️ 部分 | ⚠️ 仅 viewport-y |

---

## 四、已确认真正实现（文档已正确）

| 功能 | 状态 |
|------|------|
| FontCatalog 注入（v36） | ✅ `MapView.setFontCatalog:3920` + `FontCatalog.fromData/registerGlyph` + compat 接线 |
| fill/line/extrusion pattern-cross-fade | ✅ emitter `_patternCrossFade` + shader |
| line-trim-offset / line-pattern-trim-offset | ✅ patcher shader discard |
| line-border / line-width-unit / line-emissive | ✅ |
| icon-translate / text-translate / translate-anchor | ✅ |
| background-pitch-alignment | ✅ |
| tilejson-bounds / extent / sparse-tileset / mixed-zoom | ✅ |
| measure-light | ✅ brightness getter |
| building facades / AO / flood-light | ✅ |
| clip-layer / wireframe | ✅ |
| symbol-geometry / icon-optional / symbol-icon-brightness-contrast-saturation | ✅ |
| fill-extrusion wireframe / line-width / emissive | ✅ |
| within / collator / distance / UAX#9 Bidi | ✅ |

---

## 五、需要浏览器验证的（单元测试无法覆盖）

| 功能 | 风险点 |
|------|--------|
| **FontCatalog 注入** | compat runner 已接线，但未在 karma 中验证真实渲染；fontStyle key（"Regular"）与 TextCanvas 使用是否匹配未确认 |
| **zoomed-fill overzoom** | maxDataLevel 修复逻辑正确，未验证 flywave `findUp` 实际触发父瓦片缩放 |
| **raster-rotation** | bearing 旋转未测试确认 |
| **hillshade shader 近似** | patchHillshadeMaterial 是近似实现，与 mapbox 基线可能有视觉差异 |

---

## 六、后续执行建议（按 ROI）

### 可直接补全（明确缺代码）

| # | 功能 | 测试 | 复杂度 | 方案 |
|---|------|------|--------|------|
| 1 | building 屋顶形状 | 6 | ⭐⭐⭐⭐ | 为 gabled/hipped/parapet/mansard/skillion/pyramidal 构建 BufferGeometry 顶点 |
| 2 | raster-color 混色 | 3 | ⭐⭐ | shader 加 `uMBRasColor` uniform + mix 到 `mbR` |
| 3 | line-border-gradient | 4 | ⭐⭐⭐ | patcher 为 border 渐变注入 shader（参考 line-gradient） |
| 4 | symbol-cross-fade | 2 | ⭐⭐ | PlacementEngine 中 zoom 变化时 icon/text opacity 过渡 |
| 5 | zoom-history | 2 | ⭐⭐ | 记录 zoom 变化序列，供 dasharray/透明度动画 |
| 6 | raster-masking | 4 | ⭐⭐ | 用 clip-layer 的 polygon 对 raster 瓦片做裁剪 |
| 7 | hillshade-buffer | 3 | ⭐⭐ | HillshadeTileDataProvider DEM 边缘 padding |
| 8 | symbol-z-order source/auto | 11 | ⭐ | source 模式按图层顺序，auto 按默认 |

### 需浏览器验证（暂不改码）

| # | 功能 | 测试 | 风险 |
|---|------|------|------|
| 9 | FontCatalog 注入 | 19+ | fontStyle key 匹配 |
| 10 | zoomed-fill overzoom | 5 | findUp 触发 |
| 11 | raster-rotation | 5 | bearing 旋转 |
| 12 | free-camera | 6 | 近似精度 |

### 大型工程（架构级）

| # | 功能 | 测试 | 复杂度 |
|---|------|------|--------|
| 13 | elevated-line HD 完整 | ~160 | ⭐⭐⭐⭐ |
| 14 | 3d-intersections 完整 | ~75 | ⭐⭐⭐⭐⭐ |
| 15 | model-layer per-feature | ~212 | ⭐⭐⭐⭐ |
| 16 | HD appearance / front-cutoff / sd-hd | ~100 | ⭐⭐⭐⭐⭐ |
| 17 | raster-elevation / raster-array | ~50 | ⭐⭐⭐⭐ |
| 18 | custom-layer / custom-source / video | ~16 | ⭐⭐⭐⭐ |
| 19 | tile-providers | 7 | ⭐⭐⭐ |
| 20 | symbol-elevation-reference | 17 | ⭐⭐⭐ |

---

## 七、统计核对

| 类别 | 数量 |
|------|------|
| 文档低估（实际已实现） | 3 |
| 文档高估（实际未实现/过度乐观） | 10 |
| 历史上误报 | 4 |
| 已确认真正实现 | 25+ |
| 需浏览器验证 | 4 |
| 可直接补全 | 8 |
| 大型工程 | 8 |
