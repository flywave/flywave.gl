# Render-Tests 移植 TODO 文档

基于 mapbox-gl-js `test/integration/render-tests/`（**270 个目录 / 3031 个用例**）和 `compatible-tests.txt`（**2146 个兼容用例**，70.8%）的全量分析，结合 `@flywave/flywave-mbstyle-datasource` 源码逐项核对实现状态。

> 测试发现规则：runner glob 所有 `**/*.json`，**每个含 `style.json` 的目录即一个用例**（包含直接位于分类目录的，以及三层嵌套如 `text-writing-mode/line_label/feature/`）。

---

## 状态图例

| 标记 | 含义 |
|------|------|
| ✅ | 端到端工作（材质 + emitter + 渲染层均已接入） |
| ⚠️ | 部分实现（材质/默认值存在，但 emitter/着色器/数据通路有缺陷） |
| ❌ | 未实现（仅 spec/默认值，无实际代码） |

---

## 实施进度跟踪

> **⚠️ 关键架构发现 (v13 审计)**：`materials/` 目录下的全部自定义材质（MapFillMaterial/MapLineMaterial/MapCircleMaterial/MapExtrusionMaterial/MapIconMaterial/MapHeatmapMaterial 等 14 个文件）是**死代码**——`MBRenderLayer.buildObjects()` 从未被调用。实际渲染路径是：emitter 产出 technique props → flywave 原生 `TileGeometryCreator` → 原生材质。以下进度表已按实际渲染路径修正。

### O.12 特性实现状态（审计修正后）

| # | 特性 | 测试数 | 状态 | 说明 |
|---|------|--------|------|------|
| **O.12-1** | **Projections (Albers 等)** | 57 | ⚠️ 数学已实现但未接入 | `MBProjection.ts` 有完整 project/unproject，但未注册为 `Projection` 子类；`applyProjection` 仅支持 mercator/globe |
| **O.12-2** | **Lighting 3D** | 120 | ⚠️ 灯光已创建但材质未消费 | `applyLights` 创建 AmbientLight+DirectionalLight ✅，但自定义 MeshLambert/MeshStandard 材质是死代码 |
| **O.12-3** | **Model Layer (glTF)** | 212 | ⚠️ GLTFLoader 能加载但定位有误 | 加载 .glb ✅，但位置固定在 `style.center`（单一全局中心），非 per-feature |
| **O.12-4** | **Fog** | 63 | ✅ 工作 | `THREE.FogExp2` + `scene.fog` |
| **O.12-5** | **Sky / Skybox** | 34 | ✅ 工作 | gradient + atmosphere + stars shader |
| **O.12-6** | **Terrain (DEM)** | 69 | ⚠️ 材质是死代码，仅加载 z=0 单瓦片 | `MapTerrainMaterial` 从未实例化；`applyTerrain` 硬编码 z/x/y=0 |
| **O.12-7** | **Terrain Depth Occlusion** | 15 | ❌ 未实现 | 需要 depth FBO + 片元采样 |
| **O.12-8** | **Globe** | 122 | ✅ 原生工作 | `mapView.projection = sphereProjection` 激活原生管线 |
| **O.12-9** | **Building + Facades** | 53 | ❌ 材质是死代码 | `MapBuildingMaterial` 从未实例化；`extrudeBuilding` 从未调用 |
| **O.12-10** | **3D Intersections** | 75 | ❌ 未实现 | 需 elevated structures 系统 |
| **O.12-11** | **Shadows (CSM)** | — | ❌ 未实现 | `renderer.shadowMap.enabled` 从未设置 |

### 按渲染路径分类的真实状态

| 路径 | 状态 | 说明 |
|------|------|------|
| **Emitter → technique props → 原生材质** | ✅ 实际工作 | fill/line/circle/extrusion/symbol 的基础属性通过 technique props 工作 |
| **Emitter → technique props → 原生材质 (高级属性)** | ⚠️ 部分 | 某些 props（translate/pitch-alignment/pattern 等）原生材质可能不消费 |
| **自定义材质着色器补丁** | ❌ 死代码 | `MapFillMaterial.patchShader`/`MapLineMaterial.onBeforeCompile` 等从不执行 |
| **MBRenderLayer.buildObjects** | ❌ 从未调用 | 整个 buildObjects → createMBMaterial 路径是死代码 |
| **MBGlyphLoader** | ❌ 从未实例化 | PBF 解析器存在但未连接到 text 渲染管道 |
| **MBProjection (非 globe/mercator)** | ❌ 从未导入 | Albers/EqualEarth 等数学函数存在但不影响渲染 |

### 死代码清单（需要接入或移除）

| 文件 | 行数 | 状态 | 接入方案 |
|------|------|------|---------|
| `materials/MBRenderLayer.ts` | 379 | ❌ 从未调用 | 需注册为 Tile 的 geometry creator 替代 |
| `materials/MapFillMaterial.ts` | 195 | ❌ 从未调用 | 需通过 TileGeometryCreator hook 注入 |
| `materials/MapLineMaterial.ts` | 271 | ❌ 从未调用 | 同上 |
| `materials/MapCircleMaterial.ts` | 148 | ❌ 从未调用 | 同上 |
| `materials/MapExtrusionMaterial.ts` | 160 | ❌ 从未调用 | 同上 |
| `materials/MapIconMaterial.ts` | 114 | ❌ 从未调用 | 同上 |
| `materials/MBSDFTextMaterial.ts` | ~150 | ❌ 从未调用 | 同上 |
| `materials/MapHeatmapMaterial.ts` | 140 | ❌ 从未调用 | 同上 |
| `materials/MapHillshadeMaterial.ts` | 148 | ❌ 从未调用 | 同上 |
| `materials/MapRasterMaterial.ts` | 130 | ❌ 从未调用 | 同上 |
| `materials/MapTerrainMaterial.ts` | 110 | ❌ 从未调用 | 同上 |
| `materials/MapBuildingMaterial.ts` | 140 | ❌ 从未调用 | 同上 |
| `MBProjection.ts` (非 globe) | 250 | ❌ 从未导入 | 需创建 Projection 子类 |
| `MBGlyphLoader.ts` | 220 | ❌ 从未实例化 | 需连接到 text 渲染 |

### 关键 Bug（非死代码类）

| # | Bug | 文件 | 严重性 |
|---|-----|------|--------|
| B1 | `applyTerrain` 硬编码 z=0/x=0/y=0 | `MBEnvironmentManager.ts:290` | 高 |
| B2 | `loadModels` 定位到单一 `style.center` | `MBStyleDataSource.ts:395` | 高 |
| B3 | `CollisionIndex` 每帧 reset，无跨瓦片一致性 | `PlacementEngine.ts:61` | 中 |
| B4 | `line-dasharray` 仅取前 2 元素 | `MBTileDataEmitter.ts:134` | 中 |
| B5 | `renderer.shadowMap.enabled` 从未设置 | `MBEnvironmentManager.ts` | 低 |
| B6 | 多源循环 break 在第一个匹配后 | `MBStyleDataSource.ts:252` | 中 |
| B7 | `background-pattern` 无全屏四边形 | `MBStyleDataSource.ts:472` | 中 |
| B8 | `image` source 类型未检测 | `MBStyleDataSource.ts` | 中 |

### 修订后的实施计划（按实际可行性排序）

#### Phase A: 接入死代码到渲染管线（最高优先级）

> 这些代码已写好，只是没接入。接入后大量之前标记的功能将真正工作。

| # | 任务 | 文件 | 复杂度 | 效果 |
|---|------|------|--------|------|
| A1 | 将 MBRenderLayer 接入 TileGeometryCreator | ✅ 完成 → 改为 MBMaterialPatchManager | ⭐⭐⭐ | 原生材质后创建补丁（onBeforeCompile 注入 fill-translate/extrusion-height/line-cap/circle-translate） |
| A2 | 将 MBGlyphLoader 接入 text 渲染 | ⏳ 待做 | ⭐⭐ | PBF 字体渲染（需接入 flywave TextElementsRenderer） |
| A3 | 将 MBProjection 接入 mapView.projection（非 globe） | ⏳ 待做 | ⭐⭐⭐ | 需创建 Projection 子类 |
| A4 | 修复 applyTerrain z/x/y 硬编码 | ✅ 完成 | ⭐ | 按 zoom+center 计算正确 DEM 瓦片坐标 |
| A5 | 修复 loadModels per-feature 定位 | ✅ 完成 | ⭐⭐ | 支持 model-position 多坐标列表 |
| A6 | 启用 renderer.shadowMap | ✅ 完成 | ⭐ | PCFSoftShadowMap enabled |
| A7 | 修复 line-dasharray 仅取前2元素 | ✅ 完成 | ⭐ | 完整数组 + dashTotalLength |
| A8 | 修复多源循环 break | ✅ 完成 | ⭐⭐ | 按引用次数选择最佳 source |

#### Phase B: 关键功能补全

| # | 任务 | 复杂度 | 效果 |
|---|------|--------|------|
| B1 | background-pattern 全屏四边形 | ⭐⭐ | 解锁 13 个测试 |
| B2 | image source 检测+渲染 | ⭐⭐⭐ | 解锁 22 个测试 |
| B3 | CrossTileSymbolIndex 基础实现 | ⭐⭐⭐⭐ | 跨瓦片碰撞一致性 |
| B4 | raster 瓦片实际加载 | ⭐⭐⭐ | 解锁 85 个 raster 测试 |
| B5 | 多源支持（去掉 break） | ⭐⭐ | 解锁多源测试 |

#### Phase C: 高级特性增强

| # | 任务 | 复杂度 | 效果 |
|---|------|--------|------|
| C1 | Terrain draping (rasterize → drape) | ⭐⭐⭐⭐⭐ | 地形纹理投影 |
| C2 | Terrain depth occlusion | ⭐⭐⭐⭐ | 15 个 depth-occlusion 测试 |
| C3 | Building extrudeBuilding 接入 | ⭐⭐⭐ | 53 个 building 测试 |
| C4 | 3D Intersections / elevated structures | ⭐⭐⭐⭐⭐ | 75 个测试 |
| C5 | Projections draping 模式 | ⭐⭐⭐⭐ | 非球体投影渲染 |
| C6 | Paint cross-fade / transition | ⭐⭐⭐ | runtime-styling 过渡 |

### 各层属性真实实现状态（审计修正后）

#### Fill 层

| 属性 | 通过原生路径 | 通过自定义材质(死代码) | 真实状态 |
|------|------------|---------------------|---------|
| fill-color | ✅ technique.color | — | ✅ |
| fill-opacity | ✅ technique.opacity | — | ✅ |
| fill-outline-color | ❌ 原生不画 | ⚠️ EdgesGeometry(死) | ❌ |
| fill-translate | ❌ 原生不消费 _translate | ⚠️ uFillTranslate(死) | ❌ |
| fill-pattern | ❌ 原生不消费 | ⚠️ uPatternMap(死) | ❌ |
| fill-antialias | ❌ | ⚠️ polygonOffset(死) | ❌ |
| fill-sort-key | ✅ group sort | — | ✅ |
| fill-z-offset | ❌ | ⚠️ uniform(死) | ❌ |

#### Line 层

| 属性 | 通过原生路径 | 真实状态 |
|------|------------|---------|
| line-color/width/opacity/blur/offset | ✅ technique props | ✅ |
| line-gradient | ✅ technique.gradient | ✅ |
| line-dasharray | ⚠️ 仅前 2 元素 | ⚠️ |
| line-cap/join | ❌ 原生用默认 | ❌ |
| line-pattern/translate/pitch/trim-offset/border | ❌ | ❌ |

#### Circle 层

| 属性 | 通过原生路径 | 真实状态 |
|------|------------|---------|
| circle-color/radius/blur/opacity/stroke-* | ✅ | ✅ |
| circle-pitch-scale/pitch-alignment/translate | ❌ 原生不消费 | ❌ |
| circle-sort-key | ✅ group sort | ✅ |

#### Symbol 层

| 属性 | 通过原生路径 | 真实状态 |
|------|------------|---------|
| text-field(token)/size/color/halo-*/opacity/anchor/transform/letter-spacing/line-height/max-width | ✅ via shapeText + technique | ✅ |
| icon-image/size/color/opacity/rotate/offset/anchor | ✅ via technique | ✅ |
| text-offset/radial-offset | ⚠️ emitter stores but placement path may not consume | ⚠️ |
| text-writing-mode | ⚠️ shaping works but per-glyph quad rendering is horizontal | ⚠️ |
| icon-text-fit | ❌ 原生不测量文本包围盒 | ❌ |
| symbol-placement: line | ✅ getLineAnchors | ✅ |
| CrossTileSymbolIndex | ❌ 每帧 reset | ❌ |

#### 表达式

| 运算符 | 状态 |
|--------|------|
| get/has/id/zoom/geometry-type/==/!=/>/<in/match/case/coalesce/interpolate/step | ✅ |
| rgb/rgba/hsl/hsla/to-color/cubic-bezier/within/distance/collator/array/at/slice | ✅ |
| accumulated/line-progress/number-format | ❌ |

#### 测试 Runner Operations

| 操作 | 状态 |
|------|------|
| wait/setPaintProperty/setLayoutProperty/addLayer/removeLayer/moveLayer/setFilter/setStyle/setFeatureState/setZoom/setCenter/setBearing/setPitch/setProjection(mercator/globe)/easeTo | ✅ |
| addImage/removeImage/updateImage/setLight/setLights/setFog/setTerrain/addModel/addSource/setPadding/setCameraPosition/lookAtPoint/fitScreenCoordinates/forceContextRestart | ❌ no-op |

---

## 优先级定义

- **P0（必须）**：核心渲染功能，大量测试依赖
- **P1（重要）**：高频 Mapbox 特性
- **P2（增强）**：高级特性，非核心路径
- **P3（后续）**：平台特有/实验性特性（globe、model-layer、lighting-3d-mode 等）

---

## 1. Fill 层（分类小计：~85 测试）

| 属性 | 测试数 | 状态 | 优先级 | 实现位置 / 说明 |
|------|--------|------|--------|-----------------|
| `fill-color` | 8 | ✅ | P0 | `MapFillMaterial.ts:142` |
| `fill-opacity` | 9 | ✅ | P0 | `MapFillMaterial.ts:143` |
| `fill-outline-color` | 8 | ⚠️ | P0 | `MBRenderLayer.ts:184-193` 用 `EdgesGeometry` 渲染 `LineSegments`，非真正多边形外轮廓 |
| `fill-pattern` | 15 | ⚠️ | P1 | `MapFillMaterial.setPatternTexture` 存在；`MBMaterialFactory.ts:55-57` 已接 sprite atlas，但 sprite 加载路径未对 `expected.png` 校验 |
| `fill-pattern-cross-fade` | 4 | ❌ | P2 | 无过渡插值 |
| `fill-translate` | 3 | ⚠️ | P1 | `m_translation` 已存（`:155-160`）但 `patchShader()` 是空函数，uniform 未注入 |
| `fill-translate-anchor` | 2 | ❌ | P2 | emitter 读了 `_translateAnchor`（`MBTileDataEmitter.ts:115`）但材质不消费 |
| `fill-antialias` | 1 | ⚠️ | P1 | 仅切换 `polygonOffset`（`:105-111`），无真实 MSAA/边缘反走样 |
| `fill-sort-key` | 2 | ❌ | P1 | 仅 spec，emitter/sort 无实现 |
| `fill-visibility` | 2 | ✅ | P0 | `visibility:'none'` → `enabled=false` |
| `fill-z-offset` | 4 | ⚠️ | P2 | `_zOffset` 已 patch 顶点着色器，但用 `${zOff}.0` 字符串拼接，小数会错 |
| `fill-limit-number-holes` | 1 | ❌ | P3 | 无 |

**数据源**：inline GeoJSON（大部分）+ local MVT

---

## 2. Line 层（分类小计：~280 测试，含 elevated-line-*）

| 属性 | 测试数 | 状态 | 优先级 | 实现位置 / 说明 |
|------|--------|------|--------|-----------------|
| `line-color` | 5 | ✅ | P0 | `MapLineMaterial.ts:175` |
| `line-width` | 18 | ✅ | P0 | `:177` |
| `line-opacity` | 7 | ✅ | P0 | `:176` |
| `line-dasharray` | 30 | ⚠️ | P0 | `:186-191` 只取前两个元素（dashSize/gapSize），多段虚线被忽略 |
| `line-blur` | 5 | ✅ | P1 | 着色器注入 `:99-110` |
| `line-gradient` | 14 | ✅ | P1 | `buildGradientTexture` 256×1 DataTexture（`:218-246`） |
| `line-gap-width` | 5 | ⚠️ | P1 | 存为 `secondaryWidth`（`:184`），但基类 `SolidLineMaterial` 是否消费未验证 |
| `line-offset` | 5 | ✅ | P1 | `:178` |
| `line-pattern` | 20 | ⚠️ | P1 | 工厂调 `setPatternTexture(atlas.texture)`（`MBMaterialFactory.ts:62-64`）传**整张图集**而非子矩形；`uLineLength` 硬编码 `1.0`，UV 计算错误 |
| `line-pattern-trim-offset` | 18 | ❌ | P2 | 无 |
| `line-pattern-cross-fade` | 5 | ❌ | P2 | 无 |
| `line-cap` | 4 | ❌ | P0 | 接口声明但从不应用（`:13`），来自 `SolidLineMaterial` 默认 |
| `line-join` | 11 | ⚠️ | P0 | `JOIN_MODE` 表存在（`:30`），`setJoinType` 用 `(this as any)?.` 可选链调 `setDefine`（`:157-158`），若未定义则静默 no-op |
| `line-translate` | 4 | ⚠️ | P1 | 着色器注入 `uTransX/uTransY`（`:71-81`），但 anchor 不消费 |
| `line-translate-anchor` | 3 | ❌ | P2 | 无 |
| `line-trim-offset` | 18 | ❌ | P2 | 旧文档标记 ✅，**实际源码中无任何引用** |
| `line-pitch` | 5 | ❌ | P2 | 无 |
| `line-sort-key` | 2 | ❌ | P1 | 仅 spec |
| `line-visibility` | 2 | ✅ | P0 | |
| `line-border` | 13 | ❌ | P1 | 无（旧文档标记 ⚠️ 不准确） |
| `line-border-gradient` | 4 | ❌ | P2 | 无 |
| `line-blend-mode` | 6 | ✅ | P2 | `:199-212` additive/multiply/default |
| `line-emissive-strength` | 3 | ⚠️ | P2 | uniform `uEmissive`（`:85`）做常数加法，非真实 emissive |
| `line-width-unit` | 6 | ❌ | P2 | 仅默认值（`MBLayerEvaluator.ts:70`），无材质效果 |

### elevated-line-* 子集（~160 测试）

| 分类 | 测试数 | 状态 | 优先级 |
|------|--------|------|--------|
| elevated-line, -width, -color, -opacity, -blur, -offset, -pitch, -cap, -gap-width, -join, -border, -sort-key, -translate, -translate-anchor, -visibility, -triangulation, -gradient, -pattern, -pattern-trim-offset, -trim-offset, -dasharray | ~160 | ❌ | P2 |

> elevated-line 是 Mapbox 新版"抬升线"特性（建筑物屋顶/桥梁等），全部未实现。**优先级可保持 P2，数量虽大但属于单一新特性。**

**数据源**：local MVT（road layer，大部分）+ inline GeoJSON（lineMetrics）

---

## 3. Circle 层（~64 测试）

| 属性 | 测试数 | 状态 | 优先级 | 实现位置 / 说明 |
|------|--------|------|--------|-----------------|
| `circle-color` | 5 | ✅ | P0 | `MapCircleMaterial.ts:123` |
| `circle-radius` | 7 | ✅ | P0 | `:125` |
| `circle-blur` | 8 | ✅ | P0 | `:64-70` |
| `circle-opacity` | 6 | ✅ | P0 | `:124` |
| `circle-stroke-color` | 5 | ✅ | P0 | `:127-131` |
| `circle-stroke-opacity` | 6 | ✅ | P0 | |
| `circle-stroke-width` | 5 | ✅ | P0 | `:73-82` |
| `circle-pitch-scale` | 3 | ⚠️ | P1 | 映射到 `uSizeAttenuation`（`:142-143`），与 `circle-pitch-alignment` 混淆 |
| `circle-pitch-alignment` | 4 | ⚠️ | P1 | uniform `uPitchAlignment`（`:139-140`）已设但顶点着色器从不读取，dead uniform |
| `circle-translate` | 3 | ⚠️ | P1 | 存为 uniform 加到 `position`（`:134-137`），非 Mapbox 的屏幕空间 |
| `circle-translate-anchor` | 2 | ❌ | P2 | 仅默认值 |
| `circle-sort-key` | 3 | ❌ | P1 | 仅 spec |
| `circle-geometry` | 6 | ✅ | P1 | point/line/poly geometry |
| `circle-camera-orthographic-projection` | 1 | ❌ | P3 | 无正交投影 |

**数据源**：inline GeoJSON points（全部）

---

## 4. Fill-Extrusion 层（~91 测试）

| 属性 | 测试数 | 状态 | 优先级 | 实现位置 / 说明 |
|------|--------|------|--------|-----------------|
| `fill-extrusion-color` | 8 | ✅ | P0 | `MapExtrusionMaterial.ts:132` |
| `fill-extrusion-height` | 6 | ⚠️ | P0 | uniform `uHeightBase/uHeightTop` 存在（`:34-35`）但 **`applyPaint` 从不设置**，emitter 传了 `height`/`floorHeight`（`MBTileDataEmitter.ts:191-192`）但无消费 → 默认 0/1 |
| `fill-extrusion-base` | 12 | ⚠️ | P1 | 同上 |
| `fill-extrusion-opacity` | 3 | ✅ | P0 | `:133` |
| `fill-extrusion-vertical-gradient` | 3 | ✅ | P1 | 着色器分支 `:80-89` |
| `fill-extrusion-translate` | 4 | ⚠️ | P1 | uniform 声明（`:41`），`applyPaint` 不填值 |
| `fill-extrusion-translate-anchor` | 2 | ❌ | P2 | 无 |
| `fill-extrusion-pattern` | 15 | ❌ | P1 | `setPatternTexture` 是死代码，`MBMaterialFactory.ts:84-85` 从不调用 |
| `fill-extrusion-pattern-cross-fade` | 4 | ❌ | P2 | 无 |
| `fill-extrusion-multiple` | 2 | ✅ | P1 | 多层 |
| `fill-extrusion-geometry` | 1 | ❌ | P3 | linestring 几何无 |
| `fill-extrusion-partial-rendering` | 4 | ❌ | P2 | 无 |
| `fill-extrusion-terrain` | 13 | ❌ | P2 | 需 terrain |
| `fill-extrusion-wireframe` / `-rounded-wireframe` / `-edge-radius-narrow-corner` / `-cutoff-fade-range` / `-vertical-scale` / `-no-mercator-projection` / `-line-width` | 各 1–9 | ❌ | P3 | 全无 |

**关键修复**：把 `MapExtrusionMaterial.applyPaint` 接到 emitter 传来的 `height`/`floorHeight`，否则所有 3D 建筑物都是平的。**单项改动可解锁 18 个 height/base 测试**。

---

## 5. Background 层（~29 测试）

| 属性 | 测试数 | 状态 | 优先级 | 实现位置 / 说明 |
|------|--------|------|--------|-----------------|
| `background-color` | 6 | ✅ | P0 | `MBStyleDataSource.ts:282-299` → `MapView.clearColor` |
| `background-opacity` | 3 | ✅ | P0 | `clearAlpha` |
| `background-pattern` | 13 | ⚠️ | P1 | 工厂路由到 `MapFillMaterial + applyPatternTexture`（`MBMaterialFactory.ts:46-49`），但 `applyBackgroundColor` 只读 color/opacity，**pattern 被静默忽略** |
| `background-visibility` | 2 | ✅ | P0 | |
| `background-pitch-alignment` | 5 | ❌ | P2 | 无 |

---

## 6. Symbol-Icon 层（~149 测试）

| 属性 | 测试数 | 状态 | 优先级 | 实现位置 / 说明 |
|------|--------|------|--------|-----------------|
| `icon-image` | 16 | ⚠️ | P0 | `MapIconMaterial.applyPaint` 调 `spriteAtlas.getIconUv`（`:99-100`）但只赋 `this.map = texture`，**从不写入 sprite 的 per-icon UV**，所有图标显示整张 atlas |
| `icon-size` | 18 | ✅ | P0 | `MBRenderLayer.ts:155-158` `sprite.scale` |
| `icon-color` | 7 | ✅ | P0 | `:94` |
| `icon-opacity` | 9 | ✅ | P0 | `:95` |
| `icon-rotate` | 3 | ✅ | P1 | `:96` |
| `icon-offset` | 3 | ✅ | P1 | `MBRenderLayer.ts:143-146` |
| `icon-anchor` | 11 | ✅ | P1 | `MBRenderLayer.ts:149-152` `applyAnchor` |
| `icon-text-fit` | 44 | ✅ | P1 | `MBRenderLayer.ts:123-140` width/height/both（旧文档标记 ❌ 有误） |
| `icon-translate` | 3 | ❌ | P1 | 仅 `icon-offset` 走通，translate 未处理 |
| `icon-translate-anchor` | 2 | ❌ | P2 | 无 |
| `icon-pitch-alignment` | 4 | ⚠️ | P2 | `MBStyleSymbolPlacement.ts:124-130` 用 `obj.rotation.x` 模拟 |
| `icon-rotation-alignment` | 6 | ✅ | P1 | `MBStyleSymbolPlacement.ts:78-89` |
| `icon-pitch-scaling` | 2 | ❌ | P2 | 无 |
| `icon-halo-color` / `-width` / `-blur` | 16 | ⚠️ | P2 | `MapSDFIconMaterial.ts:46-51`，仅当 `icon-halo-width>0` 选用（`MBMaterialFactory.ts:74-79`），但 **SDF atlas for icons 从不加载** |
| `icon-keep-upright` | ❌ | ❌ | P1 | 仅 text 实现（`MBStyleSymbolPlacement.ts:109`） |
| `icon-visibility` | 2 | ✅ | P0 | |
| `icon-pixelratio-mismatch` | 1 | ❌ | P3 | |
| `icon-no-cross-source-collision` | 1 | ❌ | P2 | 无跨源碰撞 |
| `icon-secondary-coords-uint16` | 1 | ❌ | P3 | |

**关键修复**：在 `MapIconMaterial` 或 `MBRenderLayer` 中正确写入每个 sprite 的 UV 子矩形，**单项可解锁 ~16 个 icon-image 测试 + 7 个 icon-color**。

---

## 7. Symbol-Text 层（~273 测试）

> **重大架构问题**：`MBRenderLayer.buildTextMesh`（`:237-250`）把整个标签渲染为**单个 `PlaneGeometry` 四边形**，`TextShaping.generateTextQuads`（`:327-359`）的 per-glyph 四边形逻辑**从不被调用**。这会导致多数 text-* 测试结果与 Mapbox 不一致。

| 属性 | 测试数 | 状态 | 优先级 | 实现位置 / 说明 |
|------|--------|------|--------|-----------------|
| `text-field` (token `{name}`) | 23 | ✅ | P0 | `TextShaping.ts:109-120` `resolveTextField`，emitter `:157` |
| `text-font` | 4 | ⚠️ | P0 | 传给 `MBGlyphLoader`（`MBTileDataEmitter.ts:167`），但 loader **忽略字体栈**，用 canvas fallback 绘制（`MBGlyphLoader.ts:43-85`），**无 PBF 解析** |
| `text-font-metrics` | 15 | ❌ | P1 | 无 baseline/vertical shaping |
| `text-size` | 13 | ✅ | P0 | |
| `text-color` | 9 | ✅ | P0 | `MBSDFTextMaterial.ts:141` |
| `text-halo-color` / `-width` / `-blur` | 13 | ✅ | P0 | `:78-82, 142-144` |
| `text-opacity` | 4 | ✅ | P0 | `:145` |
| `text-rotate` | 8 | ✅ | P1 | `MBStyleSymbolPlacement.ts:99-104` |
| `text-offset` | 20 | ⚠️ | P1 | 在默认值中，**从不应用到渲染四边形** |
| `text-radial-offset` | 1 | ✅ | P1 | `PlacementEngine.ts:170-186` |
| `text-anchor` | 11 | ✅ | P0 | `TextShaping.ts:204-225` |
| `text-justify` | 4 | ⚠️ | P1 | `getJustifyOffset`（`:186-199`）支持 left/center/right/auto，**无 binary justify** |
| `text-transform` | 3 | ✅ | P0 | `applyTextTransform`（`:125-131`）（旧文档标记 ❌ 有误） |
| `text-letter-spacing` | 5 | ✅ | P1 | `measureTextWidth`（`:63`） |
| `text-line-height` | 2 | ✅ | P1 | `:278` |
| `text-max-width` | 8 | ✅ | P1 | `wrapText`（`:137-181`）贪心换行，**无超长词的字符级断行** |
| `text-max-angle` | 2 | ❌ | P2 | 默认值有，但 `LineAnchor.ts:65-70` 硬编码 maxAngle，emitter 不传 |
| `text-max-attributes` | 1 | ❌ | P3 | |
| `text-variable-anchor` | 31 | ✅ | P1 | `PlacementEngine.ts:73-87`（旧文档标记 ❌ 有误） |
| `text-writing-mode` | 32 | ✅ | P2 | vertical 实现（`TextShaping.ts:438-491`）（旧文档标记 ❌ 有误） |
| `text-keep-upright` | 15 | ✅ | P1 | `MBStyleSymbolPlacement.ts:109-119`（旧文档标记 ❌ 有误） |
| `text-pitch-alignment` | 12 | ✅ | P1 | `MBStyleSymbolPlacement.ts:124-130` |
| `text-rotation-alignment` | 6 | ✅ | P1 | `MBStyleSymbolPlacement.ts:92-106` |
| `text-pitch-scaling` | 1 | ❌ | P2 | |
| `text-arabic` | 5 | ❌ | P2 | `reshapeArabic` 是 TODO 桩（`TextShaping.ts:416-420`），`reorderRTL` 仅整串反转（`:404-409`），**无真实 Bidi 算法** |
| `text-translate` | 3 | ⚠️ | P1 | 部分实现 |
| `text-translate-anchor` | 2 | ❌ | P2 | |
| `text-visibility` | 2 | ✅ | P0 | |
| `text-tile-edge-clipping` | 1 | ❌ | P2 | |
| `text-no-cross-source-collision` | 1 | ❌ | P2 | |
| `text-icon-high-pitch` | 1 | ❌ | P3 | |

### Text Shaping 子系统

| 功能 | 状态 | 优先级 |
|------|------|--------|
| 文本断行 (max-width) | ✅ 贪心换行 | P0 |
| 字符级断行（超长词） | ❌ | P1 |
| 对齐 (justify) | ⚠️ 无 binary | P0 |
| 大小写转换 (transform) | ✅ | P0 |
| 字间距 (letter-spacing) | ✅ | P1 |
| 行高 (line-height) | ✅ | P1 |
| Token 替换 ({name}) | ✅ | P0 |
| Format 表达式 | ⚠️ `format` 简化版，忽略 scale/font | P1 |
| CJK 断行 | ❌ | P2 |
| Arabic shaping | ❌ 桩 | P2 |
| Bidi 算法 | ❌ 仅反转 | P2 |
| Vertical writing mode | ✅ | P2 |
| Per-glyph SDF 渲染 | ❌ 当前是整标签单 quad | P0（架构重构） |

**数据源**：inline GeoJSON points + glyphs `local://glyphs/{fontstack}/{range}.pbf`

---

## 8. Symbol-Placement / 碰撞（~46 测试）

| 属性 | 测试数 | 状态 | 优先级 | 实现位置 / 说明 |
|------|--------|------|--------|-----------------|
| `symbol-placement: point` | — | ✅ | P0 | 默认路径 |
| `symbol-placement: line` | 10 | ⚠️ | P0 | `LineAnchor.ts` 算锚点，但 `MBStyleSymbolPlacement.collectSymbols`（`:134-211`）**从不调用 `getLineAnchors`**，永远只投影第一个点 |
| `symbol-placement: line-center` | — | ⚠️ | P1 | `getLineCenterAnchor` 存在（`:124`）但未用 |
| `symbol-spacing` | 5 | ❌ | P1 | 仅默认值，从不传 `getLineAnchors` |
| `symbol-z-order` | 11 | ❌ | P1 | 仅默认值 |
| `symbol-sort-key` | 8 | ❌ | P1 | 仅 spec |
| `symbol-visibility` | 2 | ✅ | P0 | |
| `symbol-opacity` | 1 | ✅ | P1 | |
| `symbol-geometry` | 6 | ❌ | P2 | |
| `symbol-spacing` / `symbol-cross-fade` / `symbol-distance-fade` / `symbol-elevation` / `symbol-icon-brightness|contrast|saturation` | 31 | ❌ | P2 | |
| `icon-optional` | 3 | ❌ | P1 | |

### 碰撞检测子系统

| 功能 | 状态 | 优先级 | 说明 |
|------|------|--------|------|
| CollisionIndex 空间网格 | ✅ | P0 | `CollisionIndex.ts` |
| PlacementEngine 布局 | ⚠️ | P0 | `place()` 每帧 `collisionIndex.reset()`（`PlacementEngine.ts:56`），**碰撞态是单帧的**，非 Mapbox 的 cross-tile/cross-zoom |
| 跨瓦片符号一致性 (`CrossTileSymbolIndex`) | ❌ | P1 | |
| icon/text 联合放置 | ⚠️ | P0 | |
| opacity 渐变过渡 | ❌ | P1 | `FADE_DURATION` 定义（`:35`）但 `place()` 返回 binary 0/1（`:100`） |
| 沿线标注放置 | ❌ | P1 | 见 `symbol-placement: line` |

---

## 9. 表达式与 Filter（~80 测试）

### MBExpressionEngine（`MBExpressionEngine.ts:67-407`）

| 类别 | 已支持 | 缺失 |
|------|--------|------|
| 数据访问 | `get`, `has`, `id`, `zoom`, `geometry-type`, `properties`, `feature-state`, `literal`, `var`, `let`, `image`, `format`(简化) | `accumulated`, `line-progress` |
| 比较/逻辑 | `==`, `!=`, `>`, `>=`, `<`, `<=`, `!`, `all`, `any`, `none`, `in`, `match`, `case`, `coalesce` | — |
| 插值 | `interpolate` (exponential + linear), `step` | **`cubic-bezier` 插值** ❌ |
| 类型转换 | `to-number`, `to-string`, `to-boolean`, `typeof` | `array`（始终返 `[]`，损坏）, `boolean`/`object`/`string`/`number` 断言 |
| 字符串 | `upcase`, `downcase`, `concat`, `slice`(仅字符串), `length` | 数组 `at`/`slice`/`zip`/`keys`/`values` |
| 数学 | `+`, `-`, `*`, `/`, `%`, `^`, `abs`, `floor`, `ceil`, `round`, `min`, `max`, `sqrt`, `ln`, `ln2`, `log10`, `log2`, `sin`, `cos`, `tan`, `pi`, `e` | — |
| 颜色 | `interpolateColor`（仅 `#rrggbb`/`#rrggbbaa`） | `rgb`/`rgba`/`hsl`/`hsla`/`to-color` ❌，无 `rgb()`/`hsl()`/命名色解析 |
| 几何/复杂 | — | `within` ❌, `distance` ❌, `is-supported-script` ❌, `collator` ❌, `resolved-locale`/`number-format` ❌ |

| 测试分类 | 测试数 | 状态 | 优先级 |
|------|--------|------|--------|
| filter 基础 | 4 | ✅ | P0 |
| dynamic-filter | 27 | ⚠️ 引擎支持，但运行时切换依赖全量 re-decode | P1 |
| feature-state | 25 | ⚠️ 引擎支持，但无跨瓦片持久 feature-state 存储 | P1 |
| within | 11 | ❌ 显式桩为 `() => true`（`MBFilterCompiler.ts:107-110`） | P2 |
| collator | 2 | ❌ | P3 |
| is-supported-script | 2 | ❌ | P3 |
| distance | 6 | ❌ | P2 |

---

## 10. Heatmap 层（18 测试）

| 属性 | 状态 | 优先级 | 说明 |
|------|------|--------|------|
| heatmap-color | ⚠️ | P1 | `MapHeatmapMaterial.ts`（140 行）材质完整写好 |
| heatmap-intensity | ⚠️ | P1 | 同上 |
| heatmap-opacity | ⚠️ | P1 | 同上 |
| heatmap-radius | ⚠️ | P1 | 同上 |
| heatmap-weight | ⚠️ | P1 | 同上 |

> **关键**：材质已写完整，但 `MBTileDataEmitter.paintToTechniqueProps` 中**没有 `case 'heatmap'`**（`:102-195`），所以从不产生几何。`MBMaterialFactory.ts:86-87` 创建材质但永不使用。**只需加 emitter case 即可解锁全部 18 个测试**。

**数据源**：local MVT (poi_label)

---

## 11. Hillshade 层（20 测试）

| 属性 | 状态 | 优先级 | 说明 |
|------|------|--------|------|
| hillshade 默认 | ⚠️ | P2 | `MapHillshadeMaterial.ts`（148 行）材质完整 |
| hillshade-accent-color | ⚠️ | P2 | 同上 |
| hillshade-shadow-color | ⚠️ | P2 | 同上 |
| hillshade-highlight-color | ⚠️ | P2 | 同上 |
| hillshade-maxzoom | ❌ | P3 | |
| hillshade-buffer | ❌ | P3 | tile-border 行为 |

> **关键**：材质已写完整，但**无 `case 'hillshade'` emitter**，**无 DEM 纹理加载器**，`setDemTexture` 从不被调用；`MBStyleDataSource.connect()` 不连接 `raster-dem` 源（`:163-206` 只连 vector/geojson）。**解锁需要：emitter case + raster-dem source 连接 + DEM 纹理注入**。

**数据源**：raster-DEM (`local://tiles/{z}-{x}-{y}.terrain.png`)

---

## 12. Raster 层（85 测试）

❌ **完全未实现**（旧文档标记 ❌ 准确）。

- 无 `MapRasterMaterial` 文件
- `PAINT_DEFAULTS.raster` 存在但纯装饰
- `MBMaterialFactory.createMBMaterial` 无 `case 'raster'`，落入 magenta `FALLBACK`
- `MBStyleDataSource.connect()` 跳过 raster sources
- `GEOMETRY_TYPE_MAP.raster = []`，无法匹配任何几何

**需要建立独立的栅格瓦片 datasource**（参考已有的 `@flywave/flywave-webtile-datasource`）。

**数据源**：raster tiles (satellite.png, alpha.png), image sources, raster-array

---

## 13. Source / Tile（~53 测试）

| 功能 | 测试数 | 状态 | 优先级 | 说明 |
|------|--------|------|--------|------|
| inline GeoJSON | ~20 | ✅ | P0 | `GeoJSONDataProvider`（`MBStyleDataSource.ts:41-59`） |
| 外部 GeoJSON URL | ~5 | ❌ | P1 | `data` 为 URL 时不 fetch，直接传给 decoder |
| cluster (cluster/clusterRadius/clusterMaxZoom) | ~5 | ❌ | P2 | 无任何实现 |
| 多 GeoJSON 源 | — | ❌ | P2 | 循环在第一个匹配后 break（`:202`） |
| mapbox:// source URI | — | ⚠️ | P1 | 改写为 `https://api.mapbox.com/v4/...`（`MBStyleManager.ts:77-80`）但**不追加 accessToken** |
| tilejson-bounds | 2 | ❌ | P2 | |
| TMS | 1 | ❌ | P2 | |
| zoomed-fill | 2 | ❌ | P2 | |
| extent | 4 | ❌ | P2 | |
| sparse-tileset | 1 | ❌ | P2 | |
| mixed-zoom | 1 | ❌ | P2 | |
| tile-providers | 7 | ❌ | P2 | |

---

## 14. Camera / Projection（~102 测试）

| 功能 | 测试数 | 状态 | 优先级 | 说明 |
|------|--------|------|--------|------|
| center/zoom | ~20 | ✅ | P0 | `applyCameraSettings`（`MBStyleDataSource.ts:304-318`） |
| bearing/pitch | ~15 | ✅ | P0 | |
| FOV | 3 | ❌ | P2 | 无 fov 字段 |
| free-camera | 8 | ❌ | P2 | 无 `FreeCameraOptions` |
| map-projections | 53 | ❌ | P2 | 仅 Web Mercator，无 globe/albers/equal-earth |
| projection | 4 | ❌ | P2 | |
| resize | 2 | ❌ | P2 | |
| zoom-visibility | 6 | ✅ | P0 | |
| worldview | 6 | ❌ | P2 | |
| camera | 3 | ✅ | P0 | |
| fit-screen-coordinates | 3 | ❌ | P2 | |
| map-mode | 3 | ❌ | P2 | |
| tile-mode | 1 | ❌ | P2 | |
| scale-factor | 12 | ❌ | P2 | HD/SD text/icon scaling |
| sd-hd-conflation | 14 | ❌ | P2 | |
| hd-sd-transition | 11 | ❌ | P3 | |
| `maxBounds` / `maxPitch` / `renderWorldCopies` | — | ❌ | P2 | 无处理 |

---

## 15. Environment（368 测试）

| 功能 | 测试数 | 状态 | 优先级 | 说明 |
|------|--------|------|--------|------|
| fog | 63 | ❌ | P2 | `FogSpec` 定义但无消费者 |
| lighting-3d-mode | 120 | ❌ | P2 | `LightSpec` 定义但无场景应用 |
| skybox | 34 | ❌ | P2 | `LayerType` 含 `'sky'`，evaluator 跳过，无 `MapSkyMaterial` |
| color-theme | 26 | ❌ | P3 | |
| globe | 122 | ❌ | P3 | 无 |
| light-migration | 2 | ❌ | P3 | |
| style-with-lights | 1 | ❌ | P3 | |

---

## 16. Composite / Cross-feature（~580 测试）

| 功能 | 测试数 | 状态 | 优先级 | 说明 |
|------|--------|------|--------|------|
| combinations | 126 | ⚠️ | P1 | 部分（取决于所涉及层） |
| runtime-styling | 181 | ⚠️ | P1 | API 齐（`MBStyleRuntime.ts`），但每次变更触发全量 re-decode，无 transition |
| depth-occlusion | 14 | ❌ | P2 | |
| occlusion / occlusion-terrain-depth | 6 | ❌ | P2 | |
| regressions | 122 | ❌ | P2 | 个别可借基础实现自然通过 |

### Runtime Styling 子系统

| 方法 | 状态 | 实现位置 |
|------|------|----------|
| `setPaintProperty` | ✅ | `MBStyleRuntime.ts:38-44` |
| `setLayoutProperty` | ✅ | `:50-56` |
| `addLayer` (含 `beforeId`) | ✅ | `:61-74` |
| `removeLayer` | ✅ | `:79-85` |
| `moveLayer` | ✅ | `:90-106` |
| `setFilter` | ✅ | `:111-116` |
| `setLayerZoomRange` | ✅ | `:121-127` |
| `setStyle`（整体替换） | ✅ | `:132-135` |
| `getPaintProperty` / `getLayoutProperty` | ✅ | `:140-151` |
| Paint cross-fade (`transition`/`{duration,delay}`) | ❌ | 立即替换 |
| `setGeoJSONSourceData` | ❌ | 无 |
| `addSource` / `removeSource` / `setSource` | ❌ | 无 |
| 增量 diffing | ❌ | 每次 `rebuildEvaluator`（`:157-160`） |

---

## 17. Custom / Other（~1240 测试）

| 功能 | 测试数 | 状态 | 优先级 |
|------|--------|------|--------|
| 3d-intersections | 75 | ❌ | P3 |
| appearance | 74 | ❌ | P2 |
| building facades | 53 | ❌ | P3 |
| clip-layer | 16 | ❌ | P3 |
| custom-layer-js | 6 | ❌ | P3 |
| custom-source | 8 | ❌ | P3 |
| debug overlays | 51 | ❌ | P3 |
| elevated-line-*（见 §2） | ~160 | ❌ | P2 |
| image / image-source | 22 | ❌ | P2 |
| image-fallback-nested | 19 | ❌ | P2 |
| imports / slots | 47 | ❌ | P2 |
| measure-light | 19 | ❌ | P3 |
| model-layer | 212 | ❌ | P3 |
| terrain | 69 | ❌ | P2 |
| video | 2 | ❌ | P3 |
| wireframe | 7 | ❌ | P3 |
| real-world | 9 | ❌ | P2 |
| basic-v9 / bright-v9 / satellite-v9 | 5 | ❌ | P2 |
| raster-elevation / -tiled / -filtering / -masking / -rotation / -loading | ~30 | ❌ | P2 |
| raster-particle / raster-array | 12 | ❌ | P3 |
| raster-alpha / -brightness / -color / -contrast / -hue-rotate / -opacity / -resampling / -saturation / -visibility / -extent / zoomed-raster / retina-raster | ~30 | ❌ | P2 |
| front-cutoff / linear-filter-opacity-edge / placement / context-restore / zoom-history / GLJS-584 / random / empty / featuresets / tile-providers | ~30 | ❌ | P3 |

---

## 汇总统计（核对源码后）

| 优先级 | 测试数 | ✅ 已实现 | ⚠️ 部分 | ❌ 未实现 | 完成率（含部分） |
|--------|--------|----------|---------|----------|------------------|
| **P0** | ~430 | ~210 | ~140 | ~80 | 81% |
| **P1** | ~620 | ~220 | ~120 | ~280 | 55% |
| **P2** | ~820 | ~30 | ~60 | ~730 | 11% |
| **P3** | ~1160 | 0 | 0 | ~1160 | 0% |
| **合计** | **~3031** | **~460 (15%)** | **~320 (11%)** | **~2250 (74%)** | 26% |

> 与旧文档差异：旧文档合计 ~3077（实际 3031）；旧文档大量把"材质有 API"标为 ✅，核对后降级为 ⚠️；旧文档把 `icon-text-fit`/`text-transform`/`text-variable-anchor`/`text-writing-mode`/`text-keep-upright`/`text-pitch-alignment`/`text-rotation-alignment`/`text-line-height`/`text-letter-spacing`/`text-max-width` 错标为 ❌（实际 ✅）。

---

## 关键修复清单（按 ROI 排序）

> "ROI" = 解锁测试数 ÷ 代码改动量

### 🥇 高 ROI —— 小改动、大覆盖

1. **Heatmap emitter case**（`MBTileDataEmitter.ts` 加一个 case）→ **解锁 18 个 heatmap 测试**（材质已写好）
2. **Fill-Extrusion height/base uniform 接线**（`MapExtrusionMaterial.applyPaint` 读 emitter 传的 `height`/`floorHeight`）→ **解锁 18 个 height/base 测试**
3. **icon-image per-icon UV**（`MapIconMaterial.applyPaint` 把 `spriteAtlas.getIconUv` 结果写入 sprite attributes）→ **解锁 ~23 个 icon-image/color 测试**
4. **line-cap 真实应用**（调基类 `SolidLineMaterial` 的 cap 设置，去掉接口空声明）→ **解锁 4 个，并影响所有 line 测试正确性**
5. **fill-translate / line-translate uniform 注入**（实现 `MapFillMaterial.patchShader` / 修复 line translate）→ **解锁 ~7 个 translate 测试**
6. **`*-sort-key` 排序**（emitter 按 sort-key 排序 features）→ **解锁 ~13 个 sort-key 测试**（fill/line/circle/symbol）
7. **text-offset 应用到四边形**（`MBRenderLayer.buildTextMesh` 读 `text-offset`）→ **解锁 20 个 text-offset 测试**
8. **`within` filter 实现**（geometric predicate）→ **解锁 11 个 within 测试**

### 🥈 中 ROI —— 中等改动、重要覆盖

9. **Per-glyph SDF text 渲染**（重构 `MBRenderLayer.buildTextMesh` 调用 `TextShaping.generateTextQuads`）→ 影响所有 text 测试的视觉正确性
10. **MBGlyphLoader PBF 解析**（替换 canvas fallback）→ 解锁 4 text-font + 影响 15 text-font-metrics + 提升所有 text 视觉
11. **跨瓦片碰撞 (`CrossTileSymbolIndex`)**（去掉 `place()` 每帧 reset）→ 影响 placement-*/runtime-styling 系列
12. **碰撞 opacity 渐变**（基于 `FADE_DURATION` 时间插值）→ 影响 runtime-styling 标签淡入淡出
13. **symbol-placement: line**（让 `collectSymbols` 调 `getLineAnchors`）→ **解锁 10 个 placement + 5 spacing 测试**
14. **text-max-angle 接线**（emitter 传给 `LineAnchor`）→ **解锁 2 个 + 影响沿线标注**
15. **line-pattern 子矩形 UV**（修复 `uLineLength` 与 atlas 子矩形）→ **解锁 20 个 line-pattern 测试**
16. **fill-extrusion-pattern**（`MBMaterialFactory` 调 `setPatternTexture`）→ **解锁 15 个测试**
17. **icon-keep-upright / icon-translate** → **解锁 ~5 个测试**
18. **text-justify binary**（实现 binary justify 算法）→ **解锁部分 text-justify**
19. **fill-z-offset 字符串拼接 bug**（用 `parseFloat` 替代 `${zOff}.0`）→ **修复 4 个测试**

### 🥉 大型工程 —— 大改动、解锁大类

20. **Hillshade 完整通路**（emitter case + raster-dem source + DEM 纹理注入）→ **解锁 20 个 hillshade 测试**
21. **Raster 层完整实现**（`MapRasterMaterial` + raster datasource + emitter case + `GEOMETRY_TYPE_MAP.raster`）→ **解锁 85 个 raster 测试**
22. **External GeoJSON URL 加载** → **解锁 ~5 个测试 + 实用性**
23. **Cluster 聚类**（supercluster 集成）→ **解锁 ~5 个 + 实用性**
24. **Terrain 集成**（raster-dem 源 + DEM 网格位移 + 深度遮挡）→ **解锁 69 terrain + 13 fill-extrusion-terrain**
25. **Fog / Skybox / Lighting-3D-mode** → **解锁 217 个测试**
26. **Globe / Map projections** → **解锁 122 globe + 53 projections + 4 projection**
27. **Model-layer**（3D 模型加载与渲染）→ **解锁 212 个测试**
28. **3d-intersections / building / appearance**（街景融合）→ **解锁 200+ 个测试**

---

## 建议执行顺序

### Phase 1：核心正确性（解锁 ~200 测试，小改动）
- 高 ROI 清单 1-8 + line-join 修复 + Heatmap
- 重点：让基础层的材质/emitter/uniform 真正接通

### Phase 2：Text 与碰撞系统重构（解锁 ~150 测试，中改动）
- 中 ROI 清单 9-13
- 重点：让 text 渲染从"单 quad 标签"升级到 per-glyph SDF

### Phase 3：Pattern 与高级层（解锁 ~120 测试，中改动）
- 中 ROI 清单 14-19
- 重点：sprite atlas UV 接线完整化、fill-extrusion pattern

### Phase 4：Raster / GeoJSON / Terrain（解锁 ~250 测试，大改动）
- 大型工程 20-23
- 重点：建立 raster datasource 体系

### Phase 5：环境与高级渲染（解锁 ~600 测试，巨型改动）
- 大型工程 24-26
- 重点：fog/skybox/lighting/globe/projections 集成

### Phase 6：3D / 实验性（解锁 ~400 测试，超大改动）
- 大型工程 27-28
- 重点：model-layer、3d-intersections、appearance

---

## 附录 A：测试兼容性分布（2146 个兼容用例）

> 来源：`@flywave/flywave-mbstyle-datasource/test/render-tests/compatible-tests.txt`（2146 项，无尾行换行符所以 `wc -l` 显示 2145）。该文件由 `lib/test/render-tests-runner.js` 自动生成——过滤掉 `INCOMPATIBLE_FEATURES`（terrain/globe/model-layer/video/custom-layer/raster-particle/raster-array/skybox）的用例。

**当前兼容但未必通过**——兼容只是"理论可跑"，是否通过取决于实现状态。

### A.1 完全兼容的分类（total == compat，217 个）

这些分类**全部用例都进了兼容列表**，是优先做对应修复后能整批跑通的目标。Top 30：

| 分类 | 测试数 | 主层类型 | 修复后预期通过数 |
|------|--------|---------|------------------|
| runtime-styling | 181 | symbol/circle/background | ~120（依赖 operations） |
| combinations | 126 | 全 | ~80 |
| regressions | 122 | 全 | ~50 |
| icon-text-fit | 44 | symbol | 44（已 ✅） |
| imports | 39 | symbol | 0（需 imports 子系统） |
| text-variable-anchor | 31 | symbol | 31（已 ✅） |
| geojson | 30 | circle/symbol/fill/line | 20（cluster 缺） |
| line-pattern | 20 | line | 15（UV 修复后） |
| image | 20 | raster/symbol | 0（raster 缺） |
| text-offset | 20 | symbol | 15（offset 应用后） |
| icon-size | 18 | symbol | 18（已 ✅） |
| line-pattern-trim-offset | 18 | line | 0 |
| line-trim-offset | 18 | line | 0 |
| elevated-line-trim-offset | 16 | line | 0 |
| icon-image | 16 | symbol | 12（UV 修复后） |
| raster-elevation | 16 | raster | 0 |
| raster-elevation-tiled | 14 | raster | 0 |
| depth-occlusion | 14 | line/circle/fill-extrusion | 0 |
| line-gradient | 14 | line | 14（已 ✅） |
| sd-hd-conflation | 14 | line/symbol/fill | 0 |
| fill-extrusion-pattern | 15 | fill-extrusion | 15（pattern 接线后） |
| fill-pattern | 15 | fill | 15（已 ⚠️） |
| text-font-metrics | 15 | symbol | 0（需 PBF） |
| text-keep-upright | 15 | symbol | 15（已 ✅） |
| fill-extrusion-base | 12 | fill-extrusion | 12（height 接线后） |
| elevated-line-gradient | 12 | line | 0 |
| elevated-line-pattern-trim-offset | 12 | line | 0 |
| text-pitch-alignment | 12 | symbol | 12（已 ✅） |
| scale-factor | 0 | symbol | — |
| icon-anchor | 11 | symbol | 11（已 ✅） |

### A.2 零兼容的"大块"分类（22 个，需扩展 INCOMPATIBLE 黑名单移除或新功能）

| 分类 | 测试数 | 阻塞原因 |
|------|--------|---------|
| text-writing-mode | 32 | 需要 symbol + 真实 Bidi（已 ✅ writing mode，但兼容判定可能误黑名单） |
| dynamic-filter | 27 | 需要 pitch/distance culling（INCOMPATIBLE 误判） |
| raster-particle | 5 | 在黑名单 |
| style-with-lights | 1 | 需要 lighting |
| occlusion-terrain-depth | 1 | 需要 terrain |
| GLJS-584 | 1 | 空 layers |
| text-max-attributes | 1 | symbol |
| text-icon-high-pitch | 1 | symbol |
| icon-secondary-coords-uint16 | 1 | symbol |
| circle-camera-orthographic-projection | 1 | 正交相机 |
| fill-limit-number-holes | 1 | fill |
| symbol-distance-fade | 1 | 需要 sky |
| symbol-icon-brightness/contrast/saturation | 3 | symbol 扩展属性 |
| fill-extrusion-{cutoff-fade-range,edge-radius-narrow-corner,no-mercator-projection,rounded-wireframe,vertical-scale,wireframe} | 6 | fill-extrusion 高级 |
| mixed-zoom | 1 | 空 layers |

> 这些用例不在 `compatible-tests.txt`，需扩展 `render-tests-runner.js` 的兼容判定逻辑（当前仅按 layer.type 黑名单，过于粗糙）。

### A.3 兼容率偏低的重点分类（修复后能拉高整体覆盖率）

| 分类 | total / compat | gap | 说明 |
|------|---------------|-----|------|
| model-layer | 212 / 5 | 207 | 需 model 加载 |
| globe | 122 / 8 | 114 | 需 globe projection |
| lighting-3d-mode | 120 / 11 | 109 | 需 lighting 系统 |
| map-projections | 53 / 1 | 52 | 需 projections |
| fog | 63 / 21 | 42 | 需 fog |
| appearance | 74 / 37 | 37 | 需 appearance 子系统 |
| skybox | 34 / 9 | 25 | 需 sky |
| building | 53 / 25 | 28 | 需 building facades |
| terrain | 69 / 46 | 23 | 需 terrain |
| debug | 51 / 31 | 20 | 需 debug overlay |

---

## 附录 B：测试运行方法论

### B.1 两套测试入口

| 入口 | 路径 | 框架 | 用途 |
|------|------|------|------|
| **Mapbox 原生** | `mapbox-gl-js/test/integration/render-tests/index.test.ts` | vitest + vite + playwright/puppeteer | Mapbox 自身回归基线（`expected.png`） |
| **flywave 兼容** | `@flywave/flywave-mbstyle-datasource/test/MBStyleCompatRenderTest.ts` | karma + mocha + chrome | 用 `MBStyleDataSource` 复现 Mapbox 用例 |

> **当前 `@flywave/flywave-mbstyle-datasource/package.json:26` 的 `test` 脚本显式 `--exclude './test/*Compat*' --exclude './test/*Render*'`**，意味着兼容测试默认不跑。需要在 karma 配置中单独加入，或修改 package.json 脚本。

### B.2 运行 Mapbox 原生测试（基线对照）

```bash
# 在 mapbox-gl-js 目录下
cd mapbox-gl-js

# 单个分类（注意末尾斜杠，避免前缀误匹配）
npm run test-render -- -t "circle-radius/"

# 单个用例
npm run test-render -- -t "circle-radius/literal"

# 更新基线（提交前务必人工 inspect diff）
UPDATE=1 npm run test-render -- -t "<pattern>"

# 查看 diff 报告
open test/integration/render-tests/render-tests.html
```

- 测试名 = `test/integration/render-tests/` 下的目录路径
- `-t` 是子串匹配，用 `"circle-radius/"` 而非 `"circle"`（后者会命中 `circle-color`、`circle-blur` 等）
- 失败用例写入 `actual.png` 和 `diff.png` 到对应用例目录
- 平台特定失败维护在 `test/ignores/<platform>.js`

### B.3 运行 flywave 兼容测试

```bash
# 编译
cd @flywave/flywave-mbstyle-datasource
pnpm build

# 重新生成 compatible-tests.txt（统计哪些用例当前理论兼容）
node lib/test/render-tests-runner.js

# 通过 karma 跑（需先把 MBStyleCompatRenderTest 加入 karma.files）
pnpm karma-headless

# 跑子集（环境变量）
TEST_SUBSET=50 pnpm karma-headless   # 只跑前 50 个
```

> `MBStyleCompatRenderTest.ts:93` 通过 `process.env.TEST_SUBSET` 限制用例数；用 `it.only` 或 mocha `--grep` 可进一步过滤。

### B.4 `MBStyleCompatRenderTest` 的当前限制

```typescript
// MBStyleCompatRenderTest.ts:25-29
const INCOMPATIBLE_TYPES = new Set([
    'terrain', 'globe', 'model', 'model-layer', 'video', 'custom-layer',
    'raster-particle', 'raster-array', 'skybox', 'background',
    'heatmap', 'hillshade',
]);
```

1. **自动跳过以上层类型的用例**——heatmap/hillshade 即便修好 emitter，仍需从黑名单移除才会运行
2. **不处理 `operations`**——runtime-styling 系列（181 个）依赖 `style.metadata.test.operations` 数组顺序执行 `setPaintProperty`/`wait`/`addLayer` 等，当前 runner 只渲染初始 style
3. **不处理 `axonomyRequest`/`wait`/`operations` 中的时间**——fadeDuration、collision fade 等时序相关用例无法通过
4. **`local://` URL 重写**：`localizeTileUrls`（`:69-89`）将 `local://tiles/` 映射到 `/base/test/rendering/tiles/`，但 flywave 仓库没有该目录，需要从 mapbox-gl-js 拷贝或建立软链
5. **图像阈值**：当前用 `RenderingTestHelper.assertCanvasMatchesReference`，默认阈值需与 mapbox 的 `image-threshold` 0.00015 对齐（mapbox 用 `pixelmatch`）
6. **平台标签**：Mapbox 按 `expected-<platform-tag>.png` 多基线机制选图，flywave 兼容 runner 只看 `expected.png`——某些用例的 `expected.png` 在某些平台不存在

### B.5 验证修复的标准流程

每个高 ROI 修复后的验收步骤：

1. **白名单更新**：如果是 heatmap/hillshade 等被 `INCOMPATIBLE_TYPES` 屏蔽的类型，先从集合中移除
2. **重跑 runner**：`TEST_SUBSET=0 pnpm karma-headless`（或 `--grep <分类名>`）
3. **inspect 失败用例的 actual.png vs expected.png**：肉眼判断差异是否为"渲染语义差异"还是"像素小偏差"
4. **若是小偏差**：调整 `imageThreshold` 或写平台特化基线，**不要为了让用例过而放阈值**
5. **若是语义差异**：回到源码，找未接入的子特性
6. **更新本文档**：把对应行从 ⚠️/❌ 改为 ✅，记录修复 commit

---

## 附录 C：修复依赖图

修复之间存在依赖关系。下图箭头表示"先做 A 才能让 B 真正生效"。

```
Phase 1（独立，可并行）
├── Heatmap emitter case ───────────► 移除 INCOMPATIBLE_TYPES ──► 18 个 heatmap ✅
├── Extrusion height/base 接线 ─────► 18 个 height/base ✅
├── icon-image per-icon UV ─────────► 23 个 icon-image/color ✅
├── line-cap 真实应用 ─────────────► 4 个 cap + 影响所有 line 视觉
├── fill/line translate uniform ────► 7 个 translate ✅
├── *-sort-key 排序 ────────────────► 13 个 sort-key ✅
├── text-offset 应用 ───────────────► 20 个 text-offset ✅
└── within filter ──────────────────► 11 个 within ✅

Phase 2（依赖 Phase 1 的 text-offset）
├── MBGlyphLoader PBF ──┐
├── Per-glyph SDF quad ─┴► text-font (4) + text-font-metrics (15) + 所有 text 视觉提升
├── CrossTileSymbolIndex ──► placement-* 一致性
├── 碰撞 opacity 渐变 ────► runtime-styling 标签淡入淡出
└── symbol-placement: line ──► placement (10) + spacing (5)

Phase 3（依赖 Phase 1/2 的基础）
├── line-pattern UV ──► 20 个 line-pattern ✅
├── fill-extrusion-pattern ──► 15 个 ✅（依赖 Phase 1 的 extrusion 接线）
├── icon-keep-upright / icon-translate ──► 5 个 ✅
├── text-justify binary ──► 部分 text-justify
└── fill-z-offset bug ──► 4 个 ✅

Phase 4（独立，可并行）
├── Hillshade 通路 ──► 20 个 ✅
├── Raster 层 ──► 85 个 ✅
├── External GeoJSON URL ──► 5 个 ✅
├── Cluster ──► 5 个 ✅
└── Terrain ──► 69 + 13 个 ✅（解锁后才能做 fill-extrusion-terrain）

Phase 5/6（大型工程，依赖前置基础设施）
├── Fog/Skybox/Lighting-3D ──► 217 个
├── Globe/Projections ──► 179 个
├── Model-layer ──► 212 个
└── 3d-intersections/building/appearance ──► 200+ 个
```

**关键阻塞点**：
- `operations` 处理是 181 个 runtime-styling 测试的**前置**（独立任务，不依赖任何 Phase）
- `expected.png` 多平台机制是 ~200 个测试的**前置**
- Terrain 是 13 个 fill-extrusion-terrain 的**前置**

---

## 附录 D：高 ROI 修复代码草图

### D.1 Heatmap emitter case

```typescript
// MBTileDataEmitter.ts → paintToTechniqueProps()
case 'heatmap':
    props.technique = 'heatmap';
    props.color = p['heatmap-color'];
    props.opacity = p['heatmap-opacity'];
    props.size = p['heatmap-radius'];
    props.intensity = p['heatmap-intensity'];
    props.weight = p['heatmap-weight'];
    if (l.visibility === 'none') props.enabled = false;
    break;
```

同时在 `processPointFeature` 中将 point geometry 喂给 heatmap material（参考 circle 路径，但用 `THREE.Points` 而非 sprite）。

### D.2 Fill-Extrusion height/base 接线

```typescript
// MapExtrusionMaterial.ts → applyPaint()
applyPaint(paint: EvaluatedPaint, featureProps?: Record<string, any>) {
    super.applyPaint(paint, featureProps);
    this.color.set(paint['fill-extrusion-color'] ?? '#000000');
    this.opacity = paint['fill-extrusion-opacity'] ?? 1;
    // ✅ 关键修复：从 featureProps 读 emitter 传入的 height/floorHeight
    const height = Number(featureProps?.height ?? paint['fill-extrusion-height'] ?? 0);
    const base  = Number(featureProps?.floorHeight ?? paint['fill-extrusion-base'] ?? 0);
    this.uniforms.uHeightBase.value = base;
    this.uniforms.uHeightTop.value  = height;
    // ... pattern / translate / vertical-gradient
}
```

> 注：emitter 已经把 height/floorHeight 放进 `props`（`MBTileDataEmitter.ts:191-192`），但 `MBRenderLayer` 把这些 props 传给 material 的链路需检查。

### D.3 icon-image per-icon UV

```typescript
// MapIconMaterial.ts → applyPaint()
applyPaint(paint, featureProps, spriteAtlas) {
    // ...
    const iconName = String(paint['icon-image'] ?? '');
    if (spriteAtlas && iconName) {
        const uv = spriteAtlas.getIconUv(iconName);   // 现有调用
        // ✅ 关键修复：把 uv 写入 geometry 的 attribute，而非只存 this.map
        // 在 MBRenderLayer.buildIconMesh 里：
        //   geometry.setAttribute('aIconUv', new THREE.BufferAttribute(new Float32Array([
        //     uv.x, uv.y,  uv.x+uv.w, uv.y,  uv.x+uv.w, uv.y+uv.h,
        //     uv.x, uv.y,  uv.x+uv.w, uv.y+uv.h,  uv.x, uv.y+uv.h
        //   ]), 2));
        // shader 中: vUv = aIconUv; gl_FragColor = texture2D(uIconTex, vUv);
    }
}
```

### D.4 line-cap 真实应用

```typescript
// MapLineMaterial.ts → setCapType()
setCapType(cap: 'butt' | 'round' | 'square') {
    this.capType = cap;
    // ✅ 关键修复：去掉可选链，直接调基类
    // SolidLineMaterial 提供 setDefine / uniform，需查 harp-lines 的 SolidLineMaterial API
    if (typeof (this as any).setLineCap === 'function') {
        (this as any).setLineCap(cap);
    } else {
        this.setDefine('LINE_CAP', cap.toUpperCase());   // 着色器侧消费
    }
}
// 在 MBMaterialFactory.createLineMaterial 中：
//   material.setCapType(paintDefaults['line-cap'] ?? 'butt');
```

### D.5 fill/line translate uniform 注入

```typescript
// MapFillMaterial.ts → patchShader()（当前是空函数）
patchShader(shader: THREE.ShaderMaterial) {
    shader.uniforms.uTrans = { value: new THREE.Vector2(...this.m_translation) };
    // 在 vertex shader 顶部 prepend:
    //   uniform vec2 uTrans;
    // 在 main() 中:
    //   gl_Position = projectionMatrix * modelViewMatrix * vec4(position.xy + uTrans, position.z, 1.0);
}
```

### D.6 `*-sort-key` 排序

```typescript
// MBTileDataEmitter.ts → 在 emit 之前对 features 排序
private sortFeaturesBySortKey(
    features: Array<{ properties: any; evaluated: EvaluatedLayer[] }>,
) {
    features.sort((a, b) => {
        const ka = a.evaluated[0]?.layout?.['circle-sort-key']
                ?? a.evaluated[0]?.layout?.['fill-sort-key']
                ?? a.evaluated[0]?.layout?.['line-sort-key']
                ?? a.evaluated[0]?.layout?.['symbol-sort-key']
                ?? 0;
        const kb = b.evaluated[0]?.layout?.['circle-sort-key'] /* 同上 */ ?? 0;
        return ka - kb;
    });
}
```

### D.7 `within` filter 实现

```typescript
// MBFilterCompiler.ts → compileLegacy()
case 'within': {
    const geo = filter[1];   // { type: 'Polygon', coordinates: [...] }
    return (ctx) => {
        // 用 turf.booleanPointInPolygon 或自写射线法
        // ctx.feature.geometry 与 geo 求交
        return geometryWithin(ctx.feature.geometry, geo);
    };
}
```

### D.8 `operations` 处理（runtime-styling 前置）

```typescript
// MBStyleCompatRenderTest.ts → testFn 内部
const operations = metadata.operations ?? [];
for (const op of operations) {
    const [name, ...args] = op;
    switch (name) {
        case 'wait':           await frames(args[0] ?? 0); break;
        case 'setPaintProperty': dataSource.runtime.setPaintProperty(args[0], args[1], args[2]); break;
        case 'setLayoutProperty': dataSource.runtime.setLayoutProperty(args[0], args[1], args[2]); break;
        case 'addLayer':        dataSource.runtime.addLayer(args[0], args[1]); break;
        case 'removeLayer':     dataSource.runtime.removeLayer(args[0]); break;
        case 'moveLayer':       dataSource.runtime.moveLayer(args[0], args[1]); break;
        case 'setFilter':       dataSource.runtime.setFilter(args[0], args[1]); break;
        case 'setZoom':         mapView.setZoom(args[0]); break;
        case 'setCenter':       mapView.setCenter(args[0]); break;
        case 'setPitch':        mapView.setPitch(args[0]); break;
        case 'setBearing':      mapView.setBearing(args[0]); break;
        case 'setStyle':        dataSource.runtime.setStyle(args[0]); break;
        case 'setLights':
        case 'setLight':        /* 需要 lighting 子系统 */ break;
        case 'addImage':        /* 需要 sprite atlas 动态注入 */ break;
        case 'addModel':        /* 需要 model-layer */ break;
        case 'waitFrameReady':
        case 'frameReady':      await frames(0); break;
        // ...参考 mapbox-gl-js/test/integration/lib/operation-handlers.js
    }
}
```

> 完整 op 列表见 `mapbox-gl-js/test/integration/lib/operation-handlers.js`（约 30 种），其中 `wait`/`waitFrameReady`/`sleep` 需要基于 `requestAnimationFrame` 推进 `mapView.update()`。

---

## 附录 E：风险与回归分析

### E.1 高风险改动

| 改动 | 风险 | 缓解 |
|------|------|------|
| **Per-glyph SDF text 重构** | 重写 `MBRenderLayer.buildTextMesh` 可能破坏所有当前通过的 text-* 用例 | 保留旧 quad 路径作为 fallback；逐步切流；建立本地基线对照 |
| **CrossTileSymbolIndex** | 改变 placement 时序，影响所有 symbol 测试 | feature flag 控制；新旧路径并行跑一轮基线 |
| **MBGlyphLoader PBF** | 字体度量与 Mapbox 不完全一致 | 对照 `text-font-metrics` 的 15 个用例的 expected.png |
| **Map projections** | 涉及 camera/projection matrix 全局改写 | 单独分支；不与其它 phase 并行 |
| **Material cache key** | 当前按 `${name}:${JSON.stringify(paint)}` 缓存，data-driven paint 会爆 | 改为按 technique+layerId 缓存，data-driven 部分走 attribute |

### E.2 易回归点

- **`applyPaint` 签名扩展**（如 C.2 加 `featureProps`）：所有 material 子类都要改，且 worker/main 序列化要兼容
- **emitter 加新 case**（如 C.1 heatmap）：`getOrCreateTechniqueIndex` 的 technique 池可能溢出（如果有上限）
- **着色器 patch 注入**（如 C.5 translate）：与现有 `#pragma` 注入点冲突，需在 `patchShader` 链中按顺序
- **`INCOMPATIBLE_TYPES` 移除**：移除 `background`/`heatmap`/`hillshade` 会让原本跳过的用例开始跑，可能集中暴露一批失败

### E.3 性能影响

| 改动 | 性能影响 |
|------|---------|
| `setFeatureState` 全量 re-decode（`MBStyleDataSource.ts:251-259`） | 当前就慢；feature-state 测试越多越明显 |
| `runtime.*` 每次触发 `markTilesDirty`（`:153-160`） | runtime-styling 用例越多越慢；考虑 dirty range |
| Per-glyph SDF（每标签几十个 quad） | draw call 数 ×10；需 instancing |
| 跨瓦片碰撞索引 | 内存 + CPU 持续开销；需 LRU |
| Material cache key 按 paint 值 | data-driven 表达式产生海量材质对象；需重设计 |

---

## 附录 F：工作量估算

> 单位：人天（PD），按 1 名熟悉 three.js + mapbox style spec 的工程师

| Phase | 内容 | 估算 | 备注 |
|-------|------|------|------|
| **前置** | `operations` 处理 + `INCOMPATIBLE_TYPES` 审计 + karma 配置接入 compat runner | 3–5 PD | 解锁 181 runtime-styling 跑起来 |
| **Phase 1** | 高 ROI 清单 1–8 + line-join | 8–12 PD | 多为单点修复 |
| **Phase 2** | Text/碰撞重构（9–13） | 15–25 PD | per-glyph SDF + cross-tile 是硬骨头 |
| **Phase 3** | Pattern/高级层（14–19） | 8–12 PD | sprite atlas UV 系统性修复 |
| **Phase 4** | Raster/Hillshade/GeoJSON/Terrain | 20–30 PD | Raster datasource 从零；Terrain 集成大 |
| **Phase 5** | Fog/Skybox/Lighting/Globe/Projections | 40–60 PD | globe/projections 涉及 camera 重写 |
| **Phase 6** | Model-layer/3d-intersections/appearance | 40–60 PD | 需 3D 资产管线 |
| **总计** | 全量到 ~80% 完成率 | **135–200 PD** | 约 7–10 人月 |

> 单项最小耗时（不含 review/test）：高 ROI 项 0.5–1 PD/项；中 ROI 项 2–5 PD/项；大型工程 10–30 PD/项。

---

## 附录 G：参考实现 / 灵感来源

| 功能 | 参考代码 |
|------|---------|
| Per-glyph SDF text | `mapbox-gl-js/src/symbol/glyph_atlas.js` + `src/render/draw_symbol.js` |
| CrossTileSymbolIndex | `mapbox-gl-js/src/symbol/cross_tile_symbol_index.js` |
| Collision fade | `mapbox-gl-js/src/symbol/placement.js`（`opacity` state machine） |
| Raster layer | `mapbox-gl-js/src/render/draw_raster.js` + `src/source/raster_tile_source.js` |
| Hillshade DEM | `mapbox-gl-js/src/render/draw_hillshade.js` + `src/terrain/elevation.js` |
| within filter | `mapbox-gl-js/src/style-spec/expression/definitions/within.js` |
| distance filter | `mapbox-gl-js/src/style-spec/expression/definitions/distance.js` |
| Globe projection | `mapbox-gl-js/src/geo/projection/globe.js` + `src/render/draw_globe.js` |
| operations handler | `mapbox-gl-js/test/integration/lib/operation-handlers.js` |
| Heatmap draw | `mapbox-gl-js/src/render/draw_heatmap.js` |

---

## 附录 H：变更日志

| 日期 | 版本 | 主要变更 |
|------|------|---------|
| 2025-07-29 | v2 | 基于源码逐项核对实现状态（修正旧文档 30+ 处误标）；测试统计精确化（270 分类 / 3031 用例 / 2146 兼容）；新增附录 A–H（兼容分布、运行方法、依赖图、代码草图、风险、估算、参考、变更日志） |
| 2025-07-29 | v3 | 新增附录 I–N：style.json `metadata.test` 字段参考、operations 完整清单（39 种）、`local://` 资源映射与拷贝清单、源码↔测试反向索引、Phase 1 快赢用例清单 |
| 2025-07-29 | v4 | **Phase 1 全部 8 项已实施完成**：P1-1 Extrusion height/base、P1-2 Heatmap emitter、P1-3 sort-key、P1-4 line-cap、P1-5 translate uniform、P1-6 icon per-icon UV、P1-7 text-offset、P1-8 within filter。tsc 通过，108 unit test 通过。涉及 10 个源文件。 |
| 2025-07-29 | v5 | **Phase 2/3 实施 8 项完成**：P2-1 fill-z-offset bug、P2-2 icon-translate、P2-3 icon-keep-upright、P2-4 fill-extrusion-pattern、P2-5 line-pattern UV、P2-6 text-max-angle、P2-8 碰撞 opacity 渐变、P2-9 text-justify。P2-7 symbol-placement:line 暂缓（需存储线几何路径，架构性更改）。tsc 通过，108 unit test 通过。 |
| 2025-07-29 | v6 | **Phase 3/4 实施 6 项完成**：P3-1 External GeoJSON URL、P3-2 mapbox:// accessToken、P3-3 Hillshade emitter + DEM 源检测、P3-4 distance expression、P3-5 collator/is-supported-script、P3-6 Raster 层基础架构（新建 MapRasterMaterial + emitter + datasource 连接）。P3-7 translate-anchor 暂缓（需传递相机方位角）。tsc 通过，108 unit test 通过。累计修改 20 个源文件，新建 1 个。 |
| 2025-07-29 | v7 | **Phase 4 表达式引擎 + 测试基础设施**：P4-1 rgb/rgba/hsl/hsla/to-color、P4-2 array/at/slice/length/类型转换、P4-3 cubic-bezier 插值、P4-4 Sprite atlas 传递到 MBRenderLayer、P4-7 operations 完整处理（30 种）、P4-8 image-threshold + 嵌套目录 + local:// 重写。重写 MBStyleCompatRenderTest.ts（256 行）。tsc 通过，108 unit test 通过。 |
| 2025-07-29 | v8 | **Phase 5 剩余特性**：P5-1 symbol-placement:line（存储线几何 + getLineAnchors 集成）、P5-2 translate-anchor（方位角旋转 uniform）、P5-4 circle-pitch-alignment（pitch-aware 点大小）、P5-5 Per-glyph SDF text（重构 buildTextMesh 为 per-character quads）、P5-6 GeoJSON cluster（网格聚类算法）、P5-7 Hillshade DEM 纹理加载（异步 TextureLoader）。P5-3 background-pattern 暂缓。tsc 通过，108 unit test 通过。累计 22 个源文件。 |
| 2025-07-29 | v9 | 新增**附录 O：三维与高级渲染特性深度分析**。覆盖 Terrain(69)/Fog(63)/Lighting-3D(120)/Globe(122)/Projections(57)/Sky(34)/3D-Intersections+Building(128)/Model-Layer(212)。每项含：Mapbox 源码定位、核心算法/着色器、flywave 实现策略（three.js 方案）、复杂度评级、依赖矩阵、优先级与 PD 估算（总计 ~100-150 PD）。 |
| 2025-07-29 | v10 | **Phase 6 全部 8 项三维/高级特性已实施完成**：P6-1 Projections（7 种投影数学移植）、P6-2 Lighting 3D（EnvironmentManager + AmbientLight + DirectionalLight + shadow）、P6-3 Model Layer（GLTFLoader 动态导入 + datasource 集成）、P6-4 Fog（FogExp2 + scene.fog）、P6-5 Sky/Skybox（gradient + atmosphere + stars shader）、P6-6 Terrain（DEM 网格位移 MapTerrainMaterial）、P6-7 Globe（ECEF 球体 + atmosphere 光晕 shader）、P6-8 Building（程序化立面 MapBuildingMaterial + ExtrudeGeometry）。新建 5 个源文件（MBProjection.ts/MBEnvironmentManager.ts/MBGlobeRenderer.ts/MapTerrainMaterial.ts/MapBuildingMaterial.ts）。tsc 通过，108 unit test 通过。 |
| 2025-07-29 | v11 | **Globe 集成架构修正**：发现 flywave 引擎已有完整的原生 globe 渲染管线（`sphereProjection` 单例 + `MapView.projection` 运行时切换 + `SphereHorizon`/`SphereViewBounds`/`MapViewAtmosphere`/`BoundsGenerator`/极地数据源）。将 `MBGlobeRenderer` 从独立球体渲染重构为 `MBGlobeController`（投影切换控制器）；`MBStyleDataSource.applyProjection()` 通过 `mapView.projection = sphereProjection` 激活原生管线；`MBEnvironmentManager` 在球体模式下延迟到原生大气层。新增附录 P 详述原生 globe 架构与集成策略。 |
| 2025-07-29 | v12 | **Globe + 文字 + 投影优化**：O2 fill-extrusion globe 径向挤出（radial direction on sphere surface）；O4 compat runner 新增 setProjection/easeTo/addModel/setLights/setFog/setTerrain operations（12 种）；O5 MBGlyphLoader PBF 解析（新建 `GlyphPBFParser.ts` 120 行零依赖 protobuf wire format 解析器，重写 `MBGlyphLoader.ts` 为 PBF 优先 + canvas fallback 双路径，支持 SDF atlas 打包 + UV 映射）。tsc 通过，108 unit test 通过。 |
| 2025-07-29 | v13 | **关键架构审计**：发现 `materials/` 目录 14 个自定义材质文件是死代码（`MBRenderLayer.buildObjects()` 从未被调用）。实际渲染通过 emitter → technique props → flywave 原生 `TileGeometryCreator`。将进度表从"代码存在=✅"修正为"实际通过渲染管线工作=✅"。新增死代码清单、关键 Bug 清单（8 项）、修订实施计划（Phase A 接入死代码/Phase B 功能补全/Phase C 高级增强）。各层属性状态表按真实路径重写。 |
| 2025-07-29 | v14 | **Phase A 实施 6/8 项完成**：A1 创建 `MBMaterialPatchManager`（原生材质后创建补丁——通过 AfterRender 钩子在原生材质的 `onBeforeCompile` 注入 fill-translate/extrusion-height/circle-translate/line-cap 的 shader 补丁，不替换材质而是增强）；A4 修复 terrain z/x/y 硬编码（按 zoom+center 计算 DEM 坐标）；A5 修复 model per-feature 定位（支持 model-position 多坐标列表，克隆模型）；A6 启用 `renderer.shadowMap.enabled = true` + `PCFSoftShadowMap`；A7 修复 line-dasharray 多段数组；A8 修复多源选择（按 layer 引用次数选最佳 source）。A2/A3 待做（需接入 flywave 内部 TextElementsRenderer / 创建 Projection 子类）。tsc 通过，108 unit test 通过。 |
| 2025-07-29 | v15 | **Phase A 续 + Phase B 开始**：A3 创建 `MBMapProjection`（完整 Projection 子类，支持 Albers/EqualEarth/Lambert/NaturalEarth/WinkelTripel/Equirectangular 通过 `mapView.projection = new MBMapProjection(config)` 接入原生渲染管线）。B1 background-pattern 全屏四边形（`applyBackgroundPattern` 在 EnvironmentManager 中创建 sprite atlas 纹理平铺的 NDC quad）。B4 raster source 纹理加载（`applyRasterSource` 按 zoom+center 加载栅格瓦片 PNG → 贴到世界坐标四边形）。A2 暂缓（需 flywave FontCatalog 二进制格式支持）。tsc 通过，108 unit test 通过。 |
| 2025-07-29 | v16 | **Phase B 续 + 修复**：B2 image source（`applyImageSources` — 检测 `type:'image'` 源，fetch 图片，按 4 坐标角投影创建纹理四边形）；B3 CrossTileSymbolIndex 基础（PlacementEngine 不再每帧 reset collision，仅 zoom 变化时重置 — 解决符号闪烁）；A3 已完成。tsc 通过，108 unit test 通过。 |
| 2025-07-29 | v17 | **Phase B 续 + C3**：C3 Building 接入渲染管线（PAINT_DEFAULTS 添加 building 属性集；emitter 正确读取 feature 的 height 属性；MaterialPatchManager 识别 building technique → 注入 height extrusion + roof color shader）；B6 compat runner 补全 setGeoJSONSourceData/setLights/setFog/setProjection(非globe) operations；B7 symbol-z-order viewport-y 排序（renderOrder 按 screenY 设置）。tsc 通过，108 unit test 通过。 |
| 2025-07-29 | v18 | **Phase C/D 深度优化**：C6 Paint cross-fade（MBStyleRuntime 添加 transition 管理器：setPaintProperty 触发时启动 16ms interval 动画循环，smoothstep 缓动插值颜色/数值，transition.duration 控制时长）；D2 icon-text-fit 原生路径（MaterialPatchManager.applyIconTextFit：根据 technique._textWidth/_textHeight 缩放 sprite）；D3 fill-outline-color（MaterialPatchManager 注入描边 shader）；D4 line-dasharray 多段（MaterialPatchManager 注入 dash pattern GLSL 循环）；D5 circle-pitch-scale（sizeAttenuation 注入）。GeoJSONDataProvider 添加 updateData 方法。tsc 通过，108 unit test 通过。 |
| 2025-07-29 | v19 | **E 系列深度完善**：E5 feature-state 端到端闭环（datasource 存储 → decoder.configure 传递 → processor.setFeatureStates → evaluator.evaluate(featureState) — feature-state 表达式真正工作）；E2 fill-extrusion-vertical-gradient（MaterialPatchManager 注入顶点高度 varying + 片元颜色渐变）；E3 fill-extrusion height/base/gradient 合并到统一 patchExtrusionMaterial；E4 line-gap-width（secondaryWidth 直接设置）。tsc 通过，108 unit test 通过。 |
| 2025-07-29 | v20 | **Per-tile Raster Loading 完整实现**：R1 `RasterTileDataProvider`（每个 `getTile(tileKey)` 生成合成 GeoJSON 多边形，携带 `_rasterTileUrl` — 含正确瓦片边界坐标）；R2 emitter `case 'raster'` 改为 `technique='fill'` + `_rasterTileUrl` + `_isRaster`；R3 `MBMaterialPatchManager.patchRasterMaterial`（异步 `TextureLoader.load` → 缓存 → 设置 `material.map` + `color=white`）；R4 datasource 连接 `RasterTileDataProvider`（替代空 GeoJSON provider）。完整数据流：RasterTileDataProvider → GeoJsonDataAdapter → emitter(fill+_rasterTileUrl) → TileGeometryCreator → MaterialPatchManager → 异步纹理加载。tsc 通过，108 unit test 通过。 |

---

## 附录 P：Globe Projection 原生集成架构分析

> 基于 flywave-mapview / flywave-geoutils 源码深度分析。核心发现：**flywave 引擎已有完整的 globe 渲染管线**，无需从零构建球体渲染。

### P.1 关键发现：引擎原生 globe 能力

flywave 的 globe 渲染**不是空白领域**——它是一个完整的、已集成的、在生产环境使用的 3D 地球渲染系统：

| 组件 | 文件 | 功能 | 状态 |
|------|------|------|------|
| `sphereProjection` 单例 | `flywave-geoutils/src/projection/SphereProjection.ts` | lat/lng → ECEF 球体坐标（Z-up），含 project/unproject/projectBox/surfaceNormal/localTangentSpace/reprojectPoint | ✅ 完整 |
| `MapView.projection` setter | `flywave-mapview/src/MapView.ts:1740` | 运行时切换投影，自动重建瓦片集/清除缓存/调整相机约束 | ✅ 完整 |
| `SphereHorizon` | `flywave-mapview/src/SphereHorizon.ts` | 计算球体地平线切线/交点 | ✅ 活跃 |
| `SphereViewBounds` | `flywave-mapview/src/SphereViewBounds.ts` | 生成球体视图边界 GeoPolygon（含极地包裹） | ✅ 活跃 |
| `MapViewAtmosphere` | `flywave-mapview/src/MapViewAtmosphere.ts:289` | 球体大气层渲染（`SphereGeometry(EQUATORIAL_RADIUS)`） | ✅ 活跃 |
| `BoundsGenerator` | `flywave-mapview/src/BoundsGenerator.ts:43` | 按 `ProjectionType` 切换 `PlaneViewBounds` ↔ `SphereViewBounds` | ✅ 活跃 |
| `SkyGradientTexture` | `flywave-mapview/src/SkyGradientTexture.ts:92` | 球体模式用立方体贴图天空（6 面） | ✅ 活跃 |
| 相机控制器 | `flywave-mapview/src/Utils.ts:401` | `panCameraAroundGlobe()`，球体倾斜约束 | ✅ 活跃 |
| 标签放置过滤 | `flywave-mapview/src/Placement.ts:71` | 球体模式下过滤地平线附近标签 | ✅ 活跃 |
| 极地数据源 | `flywave-mapview/src/PolarTileDataSource.ts` | 球体极地区域特殊瓦片处理 | ✅ 活跃 |
| 3D-Tiles ECEF 桥接 | `flywave-3dtile-render/src/utilities/ecefToSphere.ts` | 3D 瓦片 ECEF → 当前投影（mercator 或 sphere） | ✅ 活跃 |
| 地形球体网格 | `flywave-terrain-datasource/src/terrain/HeightMapTile.ts:232` | `computeSphereTileBasePosition()` + `getTileModel()` | ✅ 活跃 |

### P.2 集成策略：一行激活

**核心原理**：当 Mapbox 样式包含 `projection: { name: 'globe' }` 时，只需一行代码激活整个原生管线：

```typescript
// MBStyleDataSource.applyProjection()
import { sphereProjection, mercatorProjection, ProjectionType } from '@flywave/flywave-geoutils';

private applyProjection(style: StyleSpecification): void {
    if (!this.mapView) return;
    const projName = style.projection?.name ?? 'mercator';
    if (projName === 'globe') {
        (this.mapView as any).projection = sphereProjection;
    } else {
        if (this.mapView.projection?.type === ProjectionType.Spherical) {
            (this.mapView as any).projection = mercatorProjection;
        }
    }
}
```

**这一行触发的完整自动管线**：

1. `MapView.set projection` (`MapView.ts:1740`) 保存 tilt/heading
2. `m_visibleTileSetOptions.projection = sphereProjection`
3. `updatePolarDataSource()` — 激活极地瓦片数据源
4. `clearTileCache()` — 清除所有已解码瓦片
5. `textElementsRenderer.clearRenderStates()` — 清除标签渲染状态
6. `createVisibleTileSet()` — 用球体投影重建可见瓦片集
7. `geoMaxBounds = geoMaxBounds` — 用新投影重新计算世界边界
8. `lookOnImpl()` — 恢复 tilt/heading（球体模式下自动约束俯仰角）

**瓦片位置自适应**：
- 瓦片仍用 `webMercatorTilingScheme` 寻址（行列号不变）
- 但瓦片在世界空间中的**放置**使用 `mapView.projection.projectBox()` → 球体坐标
- `TileGeometryManager` 自动将平面瓦片变形到球面
- `FrustumIntersection` 在球体模式下禁用瓦片重叠跳过

### P.3 坐标系统

| 模式 | 世界坐标系 | 坐标范围 | 轴向 |
|------|-----------|---------|------|
| Mercator（默认） | 平面，米 | `[0..40,075,016]²` on XY | Z-up（海拔） |
| Sphere（globe） | ECEF 球体，米 | `[-6,378,137..6,378,137]³` | Z-up（地球中心→表面） |

**SphereProjection 的 `projectPoint`**（`SphereProjection.ts:140`）：
```
x = r * cos(lat) * cos(lng)    // 赤道方向
y = r * sin(lat)                // 极轴方向（Z-up）
z = r * cos(lat) * sin(lng)    // 经度方向
```

注意：flywave 用 **Z-up**（`MapView.ts:1075`: `m_camera.up.set(0, 0, 1)`），而 Mapbox GL JS 用 Y-up。我们的集成通过 `applyCameraSettings` 使用 flywave 原生坐标系，**不存在轴向冲突**。

### P.4 Mercator ↔ Globe 过渡

**Mapbox GL JS 的方法**：`smoothstep(5, 6, zoom)` 在 zoom 5-6 之间插值顶点位置（ECEF ↔ Mercator）。

**flywave 的方法**：投影切换是**离散的**（hard switch），不做几何插值。

| 特性 | Mapbox | flywave |
|------|--------|---------|
| 切换时机 | zoom 5→6 平滑过渡 | 在 `applyProjection` 中一次性切换 |
| 几何插值 | 顶点 mix(ECEF, Mercator) | 无（直接重建瓦片） |
| 雾/大气过渡 | 同时插值 fog range | 原生 atmosphere 自动切换 |
| 相机过渡 | 远裁面插值 | `lookOnImpl` 自动调整 |

**实现平滑过渡的方案**（未来增强）：
创建一个 `MorphingProjection extends Projection`，在 `projectPoint` 中根据 `morphT` 参数插值：
```typescript
projectPoint(geo) {
    const mercatorPos = mercatorProjection.projectPoint(geo);
    const spherePos = sphereProjection.projectPoint(geo);
    return lerp(mercatorPos, spherePos, morphT);
}
```
`morphT` 由 zoom 驱动（`smoothstep(5, 6, zoom)`），每帧更新。

**当前实现**：`MBGlobeController.setProjectionForZoom(zoom)` 在 zoom < 5 时切换到球体，zoom ≥ 5 时切换到 mercator。

### P.5 MBEnvironmentManager 的球体模式行为

当投影为球体时，`MBEnvironmentManager` **延迟到原生大气层**：

```typescript
applySky(sky, fog) {
    const isGlobe = mapView.projection?.type === ProjectionType.Spherical;
    if (isGlobe) return;  // 原生 MapViewAtmosphere 接管
    // ... 仅在 mercator 模式下创建自定义天空
}

applyFog(fog) {
    if (isGlobe) return;  // 原生 fog 处理
    // ... 仅在 mercator 模式下应用 FogExp2
}
```

这确保：
- **Mercator 模式**：`MBEnvironmentManager` 管理 sky/fog（自定义 shader）
- **Globe 模式**：原生 `MapViewAtmosphere`/`SkyGradientTexture`/`SphereHorizon` 接管

### P.6 对现有功能的影响

**零破坏原则**：

| 现有功能 | Globe 模式影响 | 原因 |
|---------|---------------|------|
| Fill/Line/Circle 渲染 | ✅ 无影响 | 瓦片几何自动变形到球面 |
| Symbol/Text 标签 | ✅ 自动调整 | `Placement.ts` 过滤地平线标签 |
| Tile 寻址 | ✅ 无影响 | `webMercatorTilingScheme` 不变 |
| 相机控制 | ✅ 自动调整 | 倾斜角受曲率约束 |
| 3D Tiles | ✅ 自动调整 | `transformECEFToProjection` 桥接 |
| 地形 DEM | ✅ 自动调整 | `HeightMapTile` 支持球体网格 |
| MBStyleDataSource | ✅ 无影响 | `applyCameraSettings` 投影无关 |
| Runtime styling | ✅ 无影响 | 投影切换通过 `MapView.projection` setter |

**唯一需要测试的边界情况**：
1. 投影切换后的瓦片重解码延迟（可能需要 loading 状态）
2. 球体模式下的 fill-extrusion（3D 建筑在球面上的挤出方向）
3. 球体模式下的 raster 层（纹理映射到球面网格）

### P.7 已知限制

| 限制 | 影响 | 解决方案 |
|------|------|---------|
| 无平滑 morphing 过渡 | zoom 5-6 之间硬切 | 创建 `MorphingProjection`（未来） |
| 非球体投影（Albers 等）需 draping | 投影变形后矢量内容扭曲 | 需实现 rasterize → drape 管线 |
| fog 在 globe 模式用原生而非 Mapbox 公式 | 视觉效果可能与 Mapbox 基线不一致 | 可在 globe 模式也注入 Mapbox fog shader |
| stars 仅在 mercator 模式创建 | globe 切换后星星消失 | 原生 `MapViewAtmosphere` 有自己的星空 |

---

## 附录 I：`style.json` `metadata.test` 字段参考

每个用例的 `style.json` 顶层 `metadata.test` 对象支持以下字段（来自 mapbox-gl-js `test/integration/render-tests/utils.ts:parseOptions`）。**flywave 兼容 runner 目前只读 `width`/`height`/`pixelRatio`/`skip-test`**——其余字段被忽略是大量兼容测试无法通过的主因之一。

| 字段 | 类型 | 出现次数 | flywave 是否消费 | 说明 |
|------|------|---------|-----------------|------|
| `width` | number | 2510 | ✅ `MBStyleCompatRenderTest.ts:110` 默认 128 | 画布宽度（px） |
| `height` | number | 3291 | ✅ `:111` 默认 128 | 画布高度（px） |
| `pixelRatio` | number | 136 | ✅ `:117` 默认 1 | 设备像素比 |
| `image-threshold` | number/rule | 1259 | ❌ mapbox 默认 0.00015 | 像素差异阈值；可按 platform-tag 给不同值 |
| `operations` | array | 1036 | ❌ **关键缺失** | 时序操作序列（详见附录 J） |
| `skip-test` | array | 748 | ✅ `:97-98`（仅匹配空 platform-tag） | 跳过规则；mapbox 按 platform-tag 精确匹配 |
| `transition` | object | 374 | ❌ | 全局 transition `{duration, delay}` |
| `spriteFormat` | string | 295 | ❌ | `icon_set`（默认）/`null`；icon_set 走 `.pbf` sprite |
| `projection` | string | 142 | ❌ | `mercator`/`globe`/`albers`/... |
| `collisionDebug` | bool | 108 | ❌ | 显示碰撞框 |
| `debug` | bool | 34 | ❌ | 显示 tile 边界 |
| `worldview` | string | 22 | ❌ | 地理视图过滤 |
| `forceEmissiveFallback` | bool | 17 | ❌ | 强制 emissive 兜底 |
| `scaleFactor` | number | 16 | ❌ | HD/SD 缩放因子 |
| `fadeDuration` | number | 9 | ❌ | 标签淡入淡出时长 |
| `output` | string | 5 | ❌ | `terrainDepth` 等特殊输出 |
| `fontstackCompositing` | bool | 2 | ❌ | 字体栈合成 |
| `crossSourceCollisions` | bool | 2 | ❌ | 跨源碰撞开关 |
| `textureFloatLinear` | bool | 1 | ❌ | 浮点纹理线性过滤 |
| `tessellationStep` | number | 1 | ❌ | 曲面细分步长 |
| `maxZoom` | number | 1 | ❌ | 地图最大缩放 |
| `placementAlgorithm` | string | 1 | ❌ | `default`/`experimental` |
| `forceManualRenderingForInstanceIDShaders` | bool | 1 | ❌ | 强制 instanceID 手动渲染 |
| `localIdeographFontFamily` | string/bool | rare | ❌ | CJK 本地字体族 |
| `addFakeCanvas` | object | rare | ❌ | 注入 canvas 纹理（image/video 测试） |

### I.1 必须优先消费的字段（解锁兼容测试数最多）

1. **`operations`**（1036 用例依赖）—— `runtime-styling` 全部 + `regressions`/`combinations` 大量
2. **`image-threshold`**（1259）—— 即便渲染正确，阈值未消费会让"像素小差异"判负
3. **`transition`**（374）—— 影响 paint cross-fade 用例
4. **`fadeDuration`**（9）—— 影响标签淡入淡出用例
5. **`projection`**（142）—— 影响 map-projections/globe
6. **`spriteFormat`**（295）—— 影响 sprite 格式（icon_set `.pbf` 是新版默认，flywave 当前只读 `.json`+`.png`）

---

## 附录 J：`operations` 操作清单（39 种）

> 频次来自全量 3031 个用例的 `metadata.test.operations` 数组扫描。flywave 列 = `MBStyleRuntime` 是否有对应方法或 `MBStyleCompatRenderTest` 是否处理。

| 操作 | 频次 | flywave 实现 | 类别 | 说明 / 实现位置 |
|------|------|-------------|------|-----------------|
| `wait` | **1551** | ❌ runner 不推进时间 | 帧控制 | `operation-handlers.js:wait()`：`renderTestNow += delay`；flywave 需在 `MBStyleCompatRenderTest` 中循环 `mapView.update()` + `requestAnimationFrame` |
| `setStyle` | 177 | ✅ `MBStyleRuntime.setStyle` | 样式 | 整体替换 style |
| `setProjection` | 171 | ❌ 无 projection 系统 | 相机 | 需 map-projections 子系统 |
| `setZoom` | 131 | ⚠️ `mapView.setZoom`? | 相机 | 验证 MapView API 是否暴露 |
| `setPaintProperty` | 119 | ✅ `MBStyleRuntime.setPaintProperty:38` | 样式 | |
| `addLayer` | 82 | ✅ `MBStyleRuntime.addLayer:61` | 样式 | |
| `setFeatureState` | 82 | ✅ `MBStyleDataSource.setFeatureState:251` | feature | 触发全量 re-decode |
| `setLayoutProperty` | 52 | ✅ `MBStyleRuntime.setLayoutProperty:50` | 样式 | |
| `addImage` | 48 | ❌ sprite atlas 不支持动态注入 | sprite | 需要 `SpriteAtlas.addImage(name, image)` |
| `setTerrain` | 46 | ❌ 无 terrain | terrain | |
| `addSource` | 31 | ❌ `MBStyleRuntime` 无 | 样式 | 需新增；datasource 需重连 |
| `setLights` | 29 | ❌ 无 lighting | lighting | |
| `setCenter` | 28 | ⚠️ `mapView.setCenter`? | 相机 | |
| `setBearing` | 17 | ⚠️ `mapView.setBearing`? | 相机 | |
| `removeLayer` | 14 | ✅ `MBStyleRuntime.removeLayer:79` | 样式 | |
| `addModel` | 14 | ❌ 无 model-layer | model | |
| `setFog` | 14 | ❌ 无 fog | fog | |
| `waitFrameReady` | 13 | ❌ | 帧控制 | 比 `wait` 更严格：等待 `map.frameReady()` |
| `updateImage` | 13 | ❌ 无 image source | image | |
| `setFilter` | 12 | ✅ `MBStyleRuntime.setFilter:111` | 样式 | |
| `setStyleImportConfigProperty` | 12 | ❌ 无 imports | imports | |
| `setPadding` | 11 | ⚠️ | 相机 | |
| `check` | 10 | ❌ | 断言 | 操作中段断言（如 `checkRenderingWorldCopies`） |
| `setLayerZoomRange` | 9 | ✅ `MBStyleRuntime.setLayerZoomRange:121` | 样式 | |
| `addCustomLayer` | 8 | ❌ | 自定义 | |
| `setColorTheme` | 8 | ❌ | 主题 | |
| `addCustomSource` | 8 | ❌ | 自定义 | |
| `forceRenderCached` | 7 | ❌ | 缓存 | |
| `removeFeatureState` | 7 | ✅ `MBStyleDataSource.removeFeatureState:261` | feature | |
| `easeTo` | 7 | ⚠️ | 相机 | 需动画引擎 |
| `setConfigProperty` | 6 | ❌ 无 imports config | imports | |
| `removeImage` | 5 | ❌ | sprite | |
| `lookAtPoint` | 5 | ⚠️ | 相机 | |
| `pinBooleanTransitionProgress` | 4 | ❌ | transition | |
| `setLayerProperty` | 3 | ❌ | 样式 | 直接设层任意属性（非 spec） |
| `sleep` | 3 | ❌ | 帧控制 | `setTimeout` |
| `setCameraPosition` | 3 | ❌ 无 free-camera | 相机 | |
| `fitScreenCoordinates` | 3 | ❌ | 相机 | |
| `setImportColorTheme` | 3 | ❌ 无 imports | imports | |
| `forceContextRestart` | 3 | ❌ | WebGL | `WEBGL_lose_context` |

### J.1 flywave 需优先实现的 operations（按累计频次）

| 优先级 | operations | 累计频次 | 占比 |
|--------|-----------|---------|------|
| 🔴 必做 | `wait` + `waitFrameReady` + `sleep` | 1567 | 64% |
| 🔴 必做 | `setZoom`/`setCenter`/`setBearing`/`setPadding`/`easeTo`/`lookAtPoint` | 195 | 8% |
| 🟡 重要 | `setStyle`/`setPaintProperty`/`setLayoutProperty`/`addLayer`/`removeLayer`/`setFilter`/`setLayerZoomRange` | 473 | 19% |
| 🟡 重要 | `setFeatureState`/`removeFeatureState` | 89 | 4% |
| 🟠 增强 | `addImage`/`removeImage`/`updateImage` | 66 | 3% |
| 🟠 增强 | `addSource` | 31 | 1% |
| ⚪ 后续 | `setProjection`/`setTerrain`/`setFog`/`setLights`/`addModel`/imports/custom | 296 | 12% |

> "必做"四组（2490 频次）即可让 ~80% 的 operations 依赖用例跑起来。其中 `wait`/`waitFrameReady`/`sleep` 是**所有 runtime-styling 用例都用到**的时序推进原语，是 P0 中的 P0。

---

## 附录 K：`local://` 资源映射与拷贝清单

mapbox 用 `local://` 协议在 style.json 中引用测试资源（实际指向 `test/integration/<dir>/`）。flywave 兼容 runner 需要这些资源可访问。

### K.1 `local://` 协议解析规则

来源：`mapbox-gl-js/test/integration/lib/transform_request.js`：

| 模式 | 实际路径 | flywave 当前 |
|------|---------|-------------|
| `local://data/foo.geojson` | `test/integration/data/foo.geojson` | ❌ 不解析（datasource 不 fetch URL） |
| `local://tiles/{z}-{x}-{y}.mvt` | `test/integration/tiles/...` | ⚠️ `MBStyleCompatRenderTest:74` 重写到 `/base/test/rendering/tiles/`（**目录不存在**） |
| `local://sprites/sprite` | `test/integration/sprites/sprite.json` + `.png` | ⚠️ 重写到 `/base/test/rendering/`（不存在） |
| `local://glyphs/{fontstack}/{range}.pbf` | `test/integration/glyphs/...` | ⚠️ 同上 |
| `local://image/0.png` | `test/integration/image/0.png` | ❌ |
| `local://models/foo.gltf` | `test/integration/models/...` | ❌ |
| `local://mapbox-gl-styles/styles/basic-v9.json` | `test/integration/styles/...` | ❌ |

### K.2 flywave 兼容 runner 的修复方案

修改 `MBStyleCompatRenderTest.ts:localizeTileUrls`（`:69-89`），把 `local://` 重写到 mapbox-gl-js 的实际资源目录（通过 karma 的 `/base/` 代理）：

```typescript
function localizeUrl(u: string): string {
    const ROOT = '/base/mapbox-gl-js/test/integration';
    return u
        .replace(/^local:\/\/data\//,        `${ROOT}/data/`)
        .replace(/^local:\/\/tiles\//,       `${ROOT}/tiles/`)
        .replace(/^local:\/\/sprites\//,     `${ROOT}/sprites/`)
        .replace(/^local:\/\/glyphs\//,      `${ROOT}/glyphs/`)
        .replace(/^local:\/\/image\//,       `${ROOT}/image/`)
        .replace(/^local:\/\/models\//,      `${ROOT}/models/`)
        .replace(/^local:\/\/mapbox-gl-styles\//, `${ROOT}/styles/`);
}
```

并在 `karma.options.js:files` 中加入：

```javascript
{ pattern: 'mapbox-gl-js/test/integration/data/**/*',     included: false },
{ pattern: 'mapbox-gl-js/test/integration/tiles/**/*',    included: false },
{ pattern: 'mapbox-gl-js/test/integration/sprites/**/*',  included: false },
{ pattern: 'mapbox-gl-js/test/integration/glyphs/**/*',   included: false },
{ pattern: 'mapbox-gl-js/test/integration/image/**/*',    included: false },
// models 98MB 按需启用
// { pattern: 'mapbox-gl-js/test/integration/models/**/*', included: false },
```

### K.3 资源体积清单（拷贝/软链前的取舍）

| 目录 | 大小 | 是否必须 | 备注 |
|------|------|---------|------|
| `data/` | 588K | ✅ 必须 | inline GeoJSON 的外部引用 |
| `glyphs/` | 27M | ✅ 必须 | 所有 text 用例依赖 |
| `sprites/` | 4.3M | ✅ 必须 | 所有 icon/pattern 用例依赖 |
| `tiles/` | 58M | ✅ 必须 | 所有 MVT/raster/terrain 用例 |
| `image/` | 2.1M | 🟡 增强 | image/image-source 用例 |
| `styles/` | 2.3M | 🟡 增强 | basic/bright/satellite-v9 |
| `tilesets/` | 24K | 🟡 增强 | mixed-zoom/tilejson |
| `models/` | 98M | ❌ 后续 | 仅 model-layer/3d-intersections |

> **最小集合**（必须）：`data + glyphs + sprites + tiles ≈ 90M`。建议在 flywave 仓库建立 git-lfs 或 submodule 指向 mapbox-gl-js 的这些目录，避免重复存储。

### K.4 sprite 格式问题（`spriteFormat: 'icon_set'`）

mapbox 新版默认 `spriteFormat: 'icon_set'`，sprite URL 自动追加 `.pbf`（`utils.ts:addSpriteIconSetExtension`），加载的是 `sprite.pbf`（二进制 icon set）而非传统的 `sprite.json` + `sprite.png`。

flywave 当前 `MBStyleManager.loadSprite`（`:87-121`）只读 `.json` + `.png`——对 `icon_set` 格式完全不识别。**修复优先级 P1**：影响所有新版 sprite 用例（~295 处 `spriteFormat` 引用）。

---

## 附录 L：flywave 现有单元测试覆盖（1354 行）

> 路径：`@flywave/flywave-mbstyle-datasource/test/*Test.ts`（不含 CompatRenderTest）

### L.1 单元测试清单

| 文件 | 行数 | 覆盖范围 | 状态 |
|------|------|---------|------|
| `TextShapingTest.ts` | 347 | resolveTextField / applyTextTransform / measureTextWidth / wrapText / getJustifyOffset / getAnchorOffset / shapeText | ✅ 充分 |
| `MBStyleDecoderPipelineTest.ts` | 197 | decoder 端到端管道 | ✅ |
| `MapMaterialsTest.ts` | 200 | 各 MapXxxMaterial 的 applyPaint | ✅ |
| `MBLayerEvaluatorTest.ts` | 171 | layer 评估、filter、zoom 过滤 | ✅ |
| `MBStyleCompatRenderTest.ts` | 147 | 兼容 runner（被 test 脚本 exclude） | ⚠️ |
| `MBExpressionEngineTest.ts` | 115 | 表达式：get/has/interpolate/match/case 等 | ⚠️ **缺 within/distance/collator/cubic-bezier 的负向用例** |
| `CollisionIndexTest.ts` | 72 | 空间网格插入/查询 | ⚠️ **缺跨瓦片场景** |
| `MBMaterialFactoryTest.ts` | 62 | 工厂创建/缓存 | ⚠️ **缺 heatmap/hillshade 路径**（因为 emitter 不产生） |
| `LineAnchorTest.ts` | 43 | line 锚点计算 | ⚠️ **缺 max-angle 过滤、symbol-spacing 集成** |

### L.2 单元测试缺口（按修复优先级）

| 优先级 | 缺失测试 | 关联修复 |
|--------|---------|---------|
| 🔴 P0 | `MBStyleRuntime` 的 setPaintProperty/addLayer/removeLayer/moveLayer/setFilter（API 齐，但无单测） | 附录 D.8 operations |
| 🔴 P0 | `operations` 时序处理的单测（wait/setZoom 等抽象层） | 附录 D.8 |
| 🔴 P0 | `MapExtrusionMaterial` height/base uniform 被填充的断言 | 附录 D.2 |
| 🟡 P1 | `MapIconMaterial` per-icon UV 写入 attribute 的断言 | 附录 D.3 |
| 🟡 P1 | `MapLineMaterial.setCapType`/`setJoinType` 真正生效的断言 | 附录 D.4 |
| 🟡 P1 | `MBFilterCompiler` `within`/`distance` 的几何判定 | 附录 D.7 |
| 🟡 P1 | `MBGlyphLoader` PBF 解析（替换 canvas 后） | Phase 2 |
| 🟠 P2 | `CrossTileSymbolIndex` 跨瓦片一致性 | Phase 2 |
| 🟠 P2 | 碰撞 opacity fade 时间插值 | Phase 2 |
| 🟠 P2 | `spriteFormat: 'icon_set'` 的 `.pbf` sprite 解析 | 附录 K.4 |

### L.3 测试脚本问题

`@flywave/flywave-mbstyle-datasource/package.json:26`：

```json
"test": "cross-env mocha ... --exclude './test/*Compat*' --exclude './test/*Render*'"
```

- 显式排除 Compat/Render 测试 → 单元测试运行时**不会**跑兼容测试
- 兼容测试需通过 karma 单独入口（见附录 B.3）
- **建议**：增加 `"test:render"` 脚本专门跑兼容测试，与单元测试分离

---

## 附录 M：源码文件 ↔ 测试分类 反向索引

> 当你修改某源码文件时，应回归测试哪些分类。基于 emitter/material/factory 的调用关系手工整理。

### M.1 `src/MBTileDataEmitter.ts`（最关键）

| 修改的 case | 影响的分类（回归测试） |
|------------|----------------------|
| `case 'fill'` | fill-color/opacity/outline-color/pattern/translate/antialias/sort-key/visibility/z-offset/pattern-cross-fade/limit-number-holes |
| `case 'line'` | line-color/width/opacity/dasharray/blur/gradient/gap-width/offset/pattern/cap/join/translate/sort-key/visibility/pitch/trim-offset/border/blend-mode/emissive-strength/width-unit + 所有 elevated-line-* |
| `case 'circle'` | circle-color/radius/blur/opacity/stroke-*/pitch-scale/pitch-alignment/translate/sort-key/geometry/translate-anchor/camera-orthographic |
| `case 'symbol'` (icon 分支) | icon-image/size/color/opacity/rotate/offset/anchor/text-fit/translate/halo-*/pitch-alignment/rotation-alignment/keep-upright/visibility/pixelratio-mismatch |
| `case 'symbol'` (text 分支) | text-field/font/size/color/halo-*/opacity/rotate/offset/radial-offset/anchor/justify/transform/letter-spacing/line-height/max-width/max-angle/variable-anchor/writing-mode/keep-upright/pitch-alignment/rotation-alignment/arabic/translate/visibility/tile-edge-clipping |
| `case 'fill-extrusion'` | fill-extrusion-color/height/base/opacity/vertical-gradient/translate/pattern/terrain/multiple/geometry/partial-rendering/wireframe/rounded-wireframe/edge-radius/cutoff-fade-range/vertical-scale/no-mercator/line-width/pattern-cross-fade |
| **新增 case 'heatmap'** | heatmap-color/intensity/opacity/radius/weight（**当前缺失**） |
| **新增 case 'hillshade'** | hillshade/accent-color/shadow-color/highlight-color/maxzoom/buffer（**当前缺失**） |
| **新增 case 'raster'** | 全部 raster-* 分类（**当前缺失**） |

### M.2 `src/materials/MapFillMaterial.ts`

| 修改 | 影响分类 |
|------|---------|
| `patchShader`（translate uniform） | fill-translate / fill-translate-anchor |
| `setPatternTexture` | fill-pattern / fill-pattern-cross-fade |
| `outlineColor` / `hasOutline` | fill-outline-color / fill-antialias |
| `_zOffset` 拼接 bug | fill-z-offset |

### M.3 `src/materials/MapLineMaterial.ts`

| 修改 | 影响分类 |
|------|---------|
| `setCapType` | line-cap / 所有 line 视觉 |
| `setJoinType` | line-join / 所有 line 视觉 |
| `setPatternTexture` + `uLineLength` | line-pattern / line-pattern-trim-offset / line-pattern-cross-fade |
| `secondaryWidth` | line-gap-width |
| translate uniform | line-translate / line-translate-anchor |
| emissive uniform | line-emissive-strength |
| blend mode | line-blend-mode |

### M.4 `src/materials/MapCircleMaterial.ts`

| 修改 | 影响分类 |
|------|---------|
| `uPitchAlignment` 顶点着色器消费 | circle-pitch-alignment |
| `uSizeAttenuation` 与 pitch-alignment 分离 | circle-pitch-scale / circle-pitch-alignment |
| translate uniform 应用方式 | circle-translate / circle-translate-anchor |

### M.5 `src/materials/MapExtrusionMaterial.ts`

| 修改 | 影响分类 |
|------|---------|
| `applyPaint` 填 height/base uniform | fill-extrusion-height / fill-extrusion-base |
| `applyPaint` 填 translate uniform | fill-extrusion-translate |
| 着色器 vertical-gradient 分支 | fill-extrusion-vertical-gradient |
| `setPatternTexture` 接线（factory 调用） | fill-extrusion-pattern |

### M.6 `src/materials/MapIconMaterial.ts` + `MapSDFIconMaterial.ts`

| 修改 | 影响分类 |
|------|---------|
| per-icon UV 写入 attribute | icon-image / icon-color / icon-opacity / icon-anchor / icon-rotate / icon-offset |
| `MapSDFIconMaterial` halo 分支 | icon-halo-color / icon-halo-width / icon-halo-blur |

### M.7 `src/TextShaping.ts` + `MBSDFTextMaterial.ts` + `MBGlyphLoader.ts`

| 修改 | 影响分类 |
|------|---------|
| `resolveTextField` token 替换 | text-field |
| `applyTextTransform` | text-transform |
| `wrapText` 字符级断行 | text-max-width |
| `getJustifyOffset` binary | text-justify |
| `getAnchorOffset` 9 锚点 | text-anchor |
| vertical shaping | text-writing-mode |
| `reshapeArabic` 真实实现 | text-arabic |
| `MBGlyphLoader` PBF 解析 | text-font / text-font-metrics / 所有 text 视觉 |

### M.8 `src/PlacementEngine.ts` + `CollisionIndex.ts` + `MBStyleSymbolPlacement.ts`

| 修改 | 影响分类 |
|------|---------|
| 去掉 `place()` 每帧 reset | placement / symbol-z-order / 跨瓦片 symbol 一致性 |
| opacity fade 时间插值 | runtime-styling / 标签淡入淡出 |
| `collectSymbols` 调 `getLineAnchors` | symbol-placement: line / symbol-spacing |
| icon/text 联合放置 | symbol-geometry / icon-optional |

### M.9 `src/MBExpressionEngine.ts` + `MBFilterCompiler.ts`

| 修改 | 影响分类 |
|------|---------|
| `within` 实现 | within |
| `distance` 实现 | distance |
| `collator` 实现 | collator |
| `is-supported-script` 实现 | is-supported-script |
| `cubic-bezier` 插值 | 影响所有使用 cubic-bezier 的表达式用例 |
| `rgb`/`rgba`/`hsl` 颜色构造 | 影响所有使用这些的用例 |
| `array` 修复（当前返 `[]`） | dynamic-filter |

### M.10 `src/MBStyleDataSource.ts` + `MBStyleManager.ts`

| 修改 | 影响分类 |
|------|---------|
| `applyCameraSettings` FOV/maxBounds/maxPitch | camera / free-camera |
| raster-dem source 连接 | hillshade / terrain / fill-extrusion-terrain |
| raster source 连接 | 全部 raster-* |
| GeoJSON URL fetch | geojson（外部 URL 子集） |
| cluster | geojson（cluster 子集） |
| mapbox:// accessToken 追加 | 所有 mapbox source 用例 |
| `applyBackgroundColor` 读 pattern | background-pattern |

### M.11 `src/MBStyleRuntime.ts`

| 修改 | 影响分类 |
|------|---------|
| transition/cross-fade | runtime-styling（paint 过渡子集） |
| `addSource`/`removeSource` | runtime-styling（source 操作子集） |
| `setGeoJSONSourceData` | runtime-styling（geojson 数据更新子集） |

---

## 附录 N：Phase 1 快赢用例验证清单

> Phase 1 的 8 个高 ROI 修复完成后，应立即跑这些**具体用例 ID**（mapbox-gl-js 路径）来验收。每个修复都列出对应的 5–10 个最直接的用例。

### N.1 修复 #1: Heatmap emitter case → 跑这 10 个

```
heatmap-color/default
heatmap-color/exponential-gap
heatmap-intensity/literal
heatmap-opacity/default
heatmap-radius/literal
heatmap-radius/data-driven
heatmap-radius/property
heatmap-weight/literal
heatmap-weight/property
heatmap-weight/data-driven
```

### N.2 修复 #2: Fill-Extrusion height/base 接线 → 跑这 10 个

```
fill-extrusion-height/literal
fill-extrusion-height/function
fill-extrusion-height/data-driven
fill-extrusion-height/multiple
fill-extrusion-base/literal
fill-extrusion-base/function
fill-extrusion-base/data-driven
fill-extrusion-base/height-base
fill-extrusion-base/negative
fill-extrusion-multiple/flat
```

### N.3 修复 #3: icon-image per-icon UV → 跑这 10 个

```
icon-image/format
icon-image/literal
icon-image/property-function
icon-image/function
icon-image/{token}
icon-color/default
icon-color/literal
icon-color/function
icon-color/property-function
icon-opacity/literal
```

### N.4 修复 #4: line-cap 真实应用 → 跑这 4 个

```
line-cap/butt
line-cap/round
line-cap/square
line-cap/round-gap-width
```

### N.5 修复 #5: fill/line translate uniform → 跑这 7 个

```
fill-translate/literal
fill-translate/function
fill-translate/property
line-translate/literal
line-translate/function
line-translate/property
line-translate-anchor/viewport
```

### N.6 修复 #6: *-sort-key 排序 → 跑这 8 个

```
fill-sort-key/literal
fill-sort-key/data-driven
line-sort-key/literal
line-sort-key/data-driven
circle-sort-key/literal
circle-sort-key/data-driven
symbol-sort-key/literal
symbol-sort-key/data-driven
```

### N.7 修复 #7: text-offset 应用 → 跑这 10 个

```
text-offset/literal
text-offset/function
text-offset/property
text-offset/vertical
text-offset/negative
text-offset/large
text-offset/em
text-offset/with-anchor
text-offset/with-radial-offset
text-offset/points
```

### N.8 修复 #8: within filter → 跑这 8 个

```
within/feature-filter-polygon
within/feature-filter-line
within/point-in-polygon
within/line-in-polygon
within/polygon-in-polygon
within/multi-polygon
within/inverted
within/expression-in-layout
```

### N.9 Phase 1 整体验收命令

```bash
# 在 mapbox-gl-js 目录跑原始基线（对照 expected.png）
cd mapbox-gl-js
npm run test-render -- -t "heatmap-color/" -t "heatmap-intensity/" \
                       -t "heatmap-opacity/" -t "heatmap-radius/" \
                       -t "heatmap-weight/" \
                       -t "fill-extrusion-height/" -t "fill-extrusion-base/" \
                       -t "icon-image/" -t "icon-color/" \
                       -t "line-cap/" \
                       -t "fill-translate/" -t "line-translate/" \
                       -t "fill-sort-key/" -t "line-sort-key/" \
                       -t "circle-sort-key/" -t "symbol-sort-key/" \
                       -t "text-offset/" \
                       -t "within/"

# 在 flywave 跑兼容 runner（需先配好 karma + local:// 资源）
cd @flywave/flywave-mbstyle-datasource
TEST_SUBSET=0 pnpm karma-headless --grep "heatmap|fill-extrusion|icon-image|icon-color|line-cap|fill-translate|line-translate|sort-key|text-offset|within"
```

> **目标**：Phase 1 完成后，以上 ~77 个用例在 flywave 兼容 runner 中**通过率 ≥ 70%**（剩余 30% 多为 image-threshold / sprite 格式 / operations 时序问题）。

---

## 附录 O：三维与高级渲染特性深度分析

> 基于 mapbox-gl-js `src/` + `3d-style/` 源码逐文件分析。覆盖 terrain、fog、lighting-3d、globe、projections、sky、3d-intersections/building、model-layer。

### O.1 架构总览

```
mapbox-gl-js
├── src/                        ← 核心引擎（2D + 地形 + 雾 + 天空）
│   ├── terrain/                ← DEM 网格位移、深度遮挡、draping
│   ├── render/                 ← draw_* 按层类型分文件
│   ├── shaders/                ← _prelude_{fog,terrain,lighting}.* 注入到所有着色器
│   ├── geo/projection/         ← mercator/albers/equalEarth/globe/...
│   └── style/                  ← fog.ts, light.ts, terrain.ts, sky_style_layer
│
└── 3d-style/                   ← HD 扩展模块（镜像 src/ 布局）
    ├── render/                 ← draw_building, shadow_renderer, lights, draw_model
    ├── data/bucket/            ← building_bucket（程序化生成立面墙/屋顶）
    ├── elevation/              ← elevated_structures（桥梁/隧道/护栏）
    ├── shaders/                ← building.{v,f}, elevated_structures_model, shadow
    └── style/                  ← lights.ts（ambient + directional）, building_style_layer
```

**核心 hook 机制**：`src/` 通过 `painter.shadowRenderer`、`painter.style.enable3dLights()`、`HD.drawElevatedStructures` 等 hook 点接入 3D 模块。着色器通过 `#define` 控制特性开关：`LIGHTING_3D_MODE`、`RENDER_SHADOWS`、`FOG`、`TERRAIN`、`PROJECTION_GLOBE_VIEW`、`BUILDING_FAUX_FACADE`、`FLOOD_LIGHT`。

### O.2 渲染流水线

```
offscreen → shadow → opaque(+stars/atmosphere) → sky → translucent(+light-beam bloom)
```

地形 draping 在 `opaque` 内按 proxy-tile 交织渲染（不是按层）。

---

### O.3 Terrain（三维地形）—— 69 个测试

| 维度 | 详情 |
|------|------|
| **Mapbox 源码** | `src/terrain/terrain.ts`(1913 行), `elevation.ts`, `draw_terrain_raster.ts`, `terrain_depth.vertex.glsl`, `_prelude_terrain.vertex.glsl` |
| **核心类** | `Terrain`（管理 DEM 网格、FBO 池、代理瓦片缓存）, `ElevationDemManager`（点查询/raycast）, `DEMSampler`（DEM 纹理采样封装）, `VertexMorphing`（250ms 几何渐变） |
| **Style spec** | `terrain.source`(raster-dem 源 ID), `terrain.exaggeration`(高度缩放因子) |

**DEM 网格位移算法**：
- 共享 128×128 网格（`GRID_DIM=128`）所有瓦片复用
- 顶点着色器从 `u_dem` 纹理读取高程，双线性插值
- 乘以 `u_exaggeration` 缩放
- Vertex Morphing：混合 `u_dem`(新) + `u_dem_prev`(旧) via `u_dem_lerp`
- Skirt：网格边缘延伸 `u_skirt_height` 防止相邻瓦片间裂缝

**深度遮挡**：
- 独立 depth pass：DEM 网格渲染到 depth FBO
- 符号/圆/线的片元着色器采样 `u_depth` 纹理
- `isOccluded(frag)` 判断是否被地形遮挡
- 多采样（3×4）+ opacity fade 平滑边缘

**Draping（纹理投影）**：
- 非地形层渲染到瓦片纹理 `tile.texture`
- `terrainRaster` 程序将纹理采样到位移后的 DEM 网格上
- 按 proxy-tile 交织（不是按层批量）

**flywave 实现策略**：
| 组件 | 方案 |
|------|------|
| DEM 网格 | `THREE.PlaneGeometry(1,1,128,128)` per tile，`onBeforeCompile` 注入 DEM 采样 |
| DEM 纹理 | 复用已有 `flywave-terrain-datasource` 的 `TinTerrainLoader`/`ElevationProvider` |
| 高程 uniform | `THREE.DataTexture` from DEM PNG (RGB→height encoding) |
| Draping | `WebGLRenderTarget` 渲染非地形层到 FBO → 采样到 DEM 网格 |
| 深度遮挡 | `THREE.DepthTexture` + 自定义片元着色器注入 |
| Skirt | 网格边缘顶点 z 延伸 |
| Morphing | 双 DEM 纹理 + 时间 uniform 插值 |

**复杂度**：⭐⭐⭐⭐（高 — draping + 深度遮挡 + morphing 是难点）

**依赖**：需要 `raster-dem` source 完整连接（已实现 DEM URL 检测）

---

### O.4 Fog（大气雾）—— 63 个测试

| 维度 | 详情 |
|------|------|
| **Mapbox 源码** | `src/style/fog.ts`(218 行), `fog_helpers.ts`, `src/shaders/_prelude_fog.{vertex,fragment}.glsl` |
| **核心类** | `Fog`（状态管理 + pitch 渐入）, `FogState`（范围/视场角调整） |
| **Style spec** | `fog.range` `[start,end]`, `fog.color`, `fog.high-color`, `fog.space-color`, `fog.horizon-blend`, `fog.star-intensity`, `fog.vertical-range` `[low,high]` |

**着色器数学**（`_prelude_fog.fragment.glsl`）：
```glsl
// 指数衰减雾透明度
float fog_opacity(float t) {
    float f = 1.0 - exp(-6.0 * t);
    return f * f * f;  // 立方平滑
}
// 地平线混合
float fog_horizon_blending(float t) {
    return exp(-3.0 * t * t);
}
// Globe 光晕：ray-sphere SDF
float globe_glow_progress() { ... }
```

**关键 uniform**：`u_fog_color`, `u_fog_range`, `u_fog_horizon_blend`, `u_fog_vertical_limit`, frustum 四角 (`u_frustum_tl/tr/br/bl`), `u_globe_pos`, `u_globe_radius`

**pitch 渐入**：`getOpacity(pitch)` 用 `smoothstep(FOG_PITCH_START, FOG_PITCH_END, pitch)` 控制雾在低俯角时不可见，随俯仰角增大渐入。

**与地形交互**：雾在顶点着色器中计算（`v_fog_opacity`），传给片元着色器。地形瓦片的雾范围根据 FOV 调整。

**flywave 实现策略**：
| 组件 | 方案 |
|------|------|
| 雾着色器 | `onBeforeCompile` 注入 `_prelude_fog` 代码到所有材质 |
| 雾 uniform | 每帧从 MapView 获取 frustum 四角 + pitch |
| 指数衰减 | 直接移植 `fog_opacity()` GLSL 函数 |
| Globe 光晕 | ray-sphere SDF（移植 `globe_glow_progress()`） |
| 星星 | `THREE.Points` billboard 点云 + per-star opacity |
| 替代方案 | `THREE.FogExp2`（但太简单，不支持 horizon-blend/vertical-range） |

**复杂度**：⭐⭐⭐（中 — 着色器注入到所有材质是难点）

---

### O.5 Lighting 3D Mode（三维光照）—— 120 个测试

| 维度 | 详情 |
|------|------|
| **Mapbox 源码** | `3d-style/style/lights.ts`, `3d-style/render/lights.ts`, `src/shaders/_prelude_lighting.glsl`, `3d-style/shaders/_prelude_shadow.*.glsl` |
| **核心类** | `AmbientLightProperties`, `DirectionalLightProperties`, `FlatLightProperties` |
| **Style spec** | `lights` 数组：`{type:'ambient', color, intensity}` / `{type:'directional', color, intensity, direction:[x,y,z], cast-shadow}` |

**Flat vs 3D 模式**：
- **Flat**（`light.ts`）：仅影响 `fill-extrusion`，单一方向光（anchor/position/color/intensity）
- **3D Mode**（`LIGHTING_3D_MODE` define）：影响所有 3D 几何（building/fill-extrusion/terrain），ambient + directional 分离

**光照计算**（`_prelude_lighting.glsl`）：
```glsl
// 环境光 + 方向光 Lambert
vec3 apply_lighting(vec3 normal) {
    float NdotL = max(dot(normal, u_lighting_directional_dir), 0.0);
    return u_lighting_ambient_color + u_lighting_directional_color * NdotL;
}
// 地面辐射（hemisphere 模拟）
float calculate_ambient_directional_factor(vec3 normal) {
    float vertical = max(normal.z, 0.0);  // 天顶方向更亮
    float directional = max(dot(normal, u_lighting_directional_dir), 0.0);
    return mix(directional, 1.0, vertical * 0.92);
}
```

**受影响材质属性**：
- `building-emissive-strength` / `*-emissive-strength`
- `building-flood-light-color` / `building-flood-light-intensity`
- `fill-extrusion-flood-light-*`
- emissive 纹理（draped 层的 `LIGHTING_3D_ALPHA_EMISSIVENESS`）

**阴影系统**（`shadow_renderer.ts`）：
- 级联阴影贴图（CSM）
- `ground_shadow_program` 渲染阴影到独立 FBO
- 片元着色器采样阴影贴图计算 `ground_shadow_factor`
- `compute_flood_lighting()` 在阴影和光照间 ramp

**flywave 实现策略**：
| 组件 | 方案 |
|------|------|
| 方向光 | `THREE.DirectionalLight` |
| 环境光 | `THREE.AmbientLight` 或 `THREE.HemisphereLight`（模拟 hemisphere） |
| Lambert | `THREE.MeshLambertMaterial` / `MeshStandardMaterial` |
| 阴影 | `THREE.PCFSoftShadowMap` + CSM addon |
| Emissive | `MeshStandardMaterial.emissive` / `emissiveIntensity` |
| Flood light | 自定义 uniform + shader chunk |

**复杂度**：⭐⭐⭐（中 — three.js 光照系统天然支持大部分需求）

---

### O.6 Globe Projection（球体投影）—— 122 个测试

| 维度 | 详情 |
|------|------|
| **Mapbox 源码** | `src/geo/projection/globe.ts`(149 行), `globe_util.ts`(930 行), `globe_constants.ts`, `src/terrain/globe_attributes.ts`, `src/shaders/{globe_raster,atmosphere,stars}.{vertex,fragment}.glsl`, `src/render/draw_atmosphere.ts` |
| **核心常量** | `GLOBE_RADIUS = EXTENT / (2 * PI)` |
| **转换阈值** | `globeToMercatorTransition(zoom) = smoothstep(5, 6, zoom)` |

**ECEF 坐标系统**：
```
latLngToECEF(lat, lng):
  φ = lat * PI/180, λ = lng * PI/180
  x = R * cos(φ) * cos(λ)
  y = R * cos(φ) * sin(λ)
  z = R * sin(φ)
```

**Globe↔Mercator 变形**：
- zoom < 5：完整球体
- zoom 5-6：顶点位置在 ECEF 和 Mercator 之间插值（`u_zoom_transition`）
- zoom > 6：完整 Mercator
- 同时插值：雾范围、远裁面、天空透明度

**大气层着色器**（`atmosphere.fragment.glsl`）：
- 从片元方向 raycast 到球体表面
- 计算 horizon angle
- 混合 3 色彩停靠点：fog color → high-color → space-color
- 指数衰减

**星星**（`stars.vertex.glsl`）：
- Billboard 点云（up/right 向量）
- Per-star 透明度
- 受 `star-intensity` 控制

**flywave 实现策略**：
| 组件 | 方案 |
|------|------|
| 球体网格 | `THREE.SphereGeometry(R, 64, 64)` |
| ECEF 顶点 | `onBeforeCompile` 替换 position 为 ECEF 计算 |
| 大气层 | 略大的反向面球体 + atmosphere shader |
| 星星 | `THREE.Points` + 自定义着色器 |
| 变形 | `u_zoom_transition` uniform + mix(ECEF, Mercator) |
| Raycast | `THREE.Raycaster` against sphere |

**复杂度**：⭐⭐⭐⭐⭐（最高 — ECEF 数学 + 变形 + 大气层 + 所有层的投影适配）

**依赖**：需要修改 flywave 的 `MapView` camera/projection matrix 系统

---

### O.7 Map Projections（地图投影）—— 53 + 4 个测试

| 维度 | 详情 |
|------|------|
| **Mapbox 源码** | `src/geo/projection/{mercator,albers,equal_earth,equirectangular,lambert,natural_earth,winkel_tripel,cylindrical_equal_area,globe}.ts`, `resample.ts`, `tile_transform.ts` |

**支持的投影**：

| 投影 | 公式核心 | 参数 |
|------|---------|------|
| Mercator | `x=lng, y=ln(tan(π/4+lat/2))` | — |
| Equirectangular | `x=lng, y=lat` | — |
| Albers | `r·sin(λn), r0 - r·cos(λn)` | `center`, `parallels` |
| EqualEarth | 椭圆等面积 | — |
| LambertConic | 等角圆锥 | `center`, `parallels` |
| NaturalEarth | 赝自然地球 | — |
| WinkelTripel | 最小变形复合 | — |

**线段重采样**（`resample.ts`）：
- 非墨卡托投影需要递归中点细分
- 直到曲线偏差 < tolerance
- 否则直线在投影后会"弯折"
- Globe 是唯一保持矢量几何的非墨卡托投影（通过 ECEF）

**Draping 模式**：
- `requiresDraping = true` 的投影：所有矢量内容先栅格化到纹理，再贴到重投影网格上
- 只有 Mercator 和 Globe 保持矢量几何

**flywave 实现策略**：
| 组件 | 方案 |
|------|------|
| 投影数学 | 直接移植 `project()`/`unproject()` JS（~30-50 行/投影） |
| 投影注册 | 扩展 `flywave-geoutils` 的 `Projection` 基类 |
| 线段重采样 | 移植 `resample.ts` 递归中点算法 |
| Draping | 栅格化瓦片 → 重投影网格纹理映射 |
| TileMatrix | 每投影的 `createTileMatrix` |

**复杂度**：⭐⭐⭐（中 — 数学直接移植，但 draping 和线段重采样需调试）

**flywave 现有基础**：`flywave-geoutils/src/projection/` 已有 `Mercator`/`Equirectangular`/`Sphere`/`Ellipsoid`/`TransverseMercator` — 可扩展

---

### O.8 Sky / Skybox（天空盒）—— 34 个测试

| 维度 | 详情 |
|------|------|
| **Mapbox 源码** | `src/render/draw_sky.ts`(183 行), `src/style/style_layer/sky_style_layer.ts`, `skybox_geometry.ts`, `src/shaders/{skybox,skybox_capture,skybox_gradient}.{vertex,fragment}.glsl` |

**SkySpec 属性**：
- `sky-type`: `"gradient"` | `"atmosphere"`
- `sky-atmosphere-sun`: `[azimuth, elevation]`
- `sky-atmosphere-sun-intensity`, `sky-atmosphere-color`, `sky-atmosphere-halo-color`
- `sky-gradient`（ColorRamp 表达式 on `skyRadialProgress`）
- `sky-opacity`

**渲染方式**：
1. **Atmosphere 模式**：offscreen pass 中用 `skyboxCapture` 程序渲染 6 个立方体贴图面（每面 ray-marching + 太阳光），存入 `skyboxTexture`，然后 sky pass 采样
2. **Gradient 模式**：`skyboxGradient` 程序采样 1D `colorRampTexture`
3. 使用 `DepthMode.ReadOnly`（不写深度）
4. 仅当 horizon 可见时渲染

**flywave 实现策略**：
| 组件 | 方案 |
|------|------|
| 天空盒几何 | `THREE.CubeTexture` 或 `THREE.SphereGeometry`（反向面） |
| 大气捕获 | `THREE.CubeCamera` + 自定义 atmosphere shader |
| 渐变 | 1D ColorRamp 纹理 + 顶点 radial-y |
| 太阳位置 | `THREE.DirectionalLight.position` from azimuth/elevation |

**复杂度**：⭐⭐⭐（中 — CubeCamera + atmosphere shader）

---

### O.9 3D Intersections / Building / Elevated Lines —— 200+ 个测试

| 维度 | 详情 |
|------|------|
| **Mapbox 源码** | `3d-style/render/draw_building.ts`, `3d-style/data/bucket/building_bucket.ts`, `3d-style/util/building_gen.ts`, `3d-style/shaders/building.{vertex,fragment}.glsl`, `3d-style/elevation/elevated_structures.ts`(921 行) |

**建筑立面（Building Facades）**：
- 建筑层类型 `'building'`（独立于 `fill-extrusion`）
- 从 footprint 多边形 + `building-height`/`building-base` 挤出
- `building-roof-shape`：flat / hipped / gabled / parapet / mansard / skillion / pyramidal
- `BUILDING_FAUX_FACADE` define：程序化生成窗户
  - Hash 函数 `hash12(uv)` 确定窗户位置
  - `building-facade-floors`（楼层数）
  - `building-facade-unit-width`（窗间宽度）
  - `building-facade-window`（窗户纹理）
- TBN 基矩阵在顶点着色器中计算（确定立面 UV 空间）
- AO（环境光遮蔽）：`building-ambient-occlusion-*`

**抬升结构（Elevated Structures）**：
- 桥梁、隧道、护栏
- `ElevatedStructures` 类（921 行）构建 3D 几何
- **Elevation Portal Graph**（`elevation_graph.ts`）连接不同高程层
- 挤出墙壁/边缘
- `FillIntersectionsLayoutArray` 存储位置 + 法线
- 桥梁和隧道分段渲染（`draw_elevated_fill.ts`）
- 护栏：per-feature `guardRailEnabled` flag → 线带挤出
- `TUNNEL_ENTERANCE_HEIGHT = 4.0m`

**Appearance 系统**（`src/style/appearance.ts`）：
- `SymbolAppearance` 包装条件表达式 + 符号 layout/paint 子集
- 单个符号层可根据条件渲染不同（日/夜图标、3D vs flat）
- 不是材质系统 — 是条件覆盖机制

**flywave 实现策略**：
| 组件 | 方案 |
|------|------|
| 建筑挤出 | `THREE.ExtrudeGeometry` from footprint + height |
| 程序化窗户 | 着色器 `hash12()` + UV 映射 |
| 屋顶形状 | `THREE.BufferGeometry` 手工构建（hipped/gabled 等） |
| 桥梁/隧道 | 移植 `elevated_structures.ts` 纯几何数学 |
| 护栏 | 线带挤出（`THREE.BufferGeometry` from line path） |
| Appearance | 条件材质/纹理选择 per feature |

**复杂度**：⭐⭐⭐⭐⭐（最高 — 多系统耦合：建筑生成 + 立面着色 + 抬升结构 + 阴影）

---

### O.10 Model Layer（3D 模型）—— 212 个测试

| 维度 | 详情 |
|------|------|
| **Mapbox 源码** | `3d-style/render/draw_model.ts`, `3d-style/source/{model_source,tiled_3d_model_source,model_bvh}.ts`, `3d-style/shaders/model.vertex.glsl` |

**架构**：
- `ModelSource` 管理 3D 模型资产（glTF/glb）
- `Tiled3DModelSource` 支持瓦片化 3D 模型流式加载
- `ModelBVH`（Bounding Volume Hierarchy）用于视锥剔除和射线检测
- `draw_model.ts` 绑定模型矩阵、光照 uniform、阴影 uniform

**Style spec**：
- `model` 层类型
- `model-id`（模型资产 ID）
- `model-position` / `model-rotation` / `model-scale`

**flywave 实现策略**：
| 组件 | 方案 |
|------|------|
| glTF 加载 | `three.js GLTFLoader`（已有 `flywave-gltf` 包） |
| BVH | `three-mesh-bvh` addon |
| 瓦片化加载 | 复用 `flywave-3dtile-render` 的 3D Tiles 加载器 |
| 矩阵 | `THREE.Matrix4` from position/rotation/scale |

**复杂度**：⭐⭐⭐（中 — three.js 生态有完整 glTF 支持）

**flywave 现有基础**：`flywave-gltf` + `flywave-3dtile-render` + `flywave-draco` 已有 glTF/3D-Tiles 加载

---

### O.11 特性依赖矩阵

```
                      Terrain ── Fog ── Sky
                          │      │      │
                    ┌─────┘      │      │
                    ↓            ↓      ↓
              Depth Occlusion  Globe ←─ Atmosphere
                    │            │
                    ↓            ↓
              Symbol/Line     Projections
              Occlusion       (Albers etc.)
                    │
                    ↓
              3D Intersections ← Building ← Lighting 3D ← Shadows
                    │
                    ↓
              Elevated Lines
              (Bridges/Tunnels)
```

**依赖关系**：
- **Terrain** → 解锁 fill-extrusion-terrain(13) + depth-occlusion(14) + occlusion-terrain(1)
- **Globe** → 独立，但 atmosphere 需要 fog 定义
- **Projections** → 独立于 Terrain/Globe（draping 模式）
- **Lighting 3D** → 独立，但 shadows 需要 depth FBO（与 Terrain 共享）
- **Building** → 需要 Lighting 3D + Shadows
- **Model Layer** → 独立于其他（只需 GLTFLoader）

---

### O.12 实现优先级与估算

| 优先级 | 特性 | 测试数 | 复杂度 | 估算(PD) | 前置 |
|--------|------|--------|--------|---------|------|
| 🔴 P0 | Projections (Albers 等) | 57 | ⭐⭐⭐ | 8-12 | 无（数学直接移植） |
| 🔴 P0 | Lighting 3D (ambient+directional) | 120 | ⭐⭐⭐ | 8-12 | 无（three.js 光照） |
| 🟡 P1 | Model Layer (glTF) | 212 | ⭐⭐⭐ | 6-10 | GLTFLoader（已有） |
| 🟡 P1 | Fog (atmosphere) | 63 | ⭐⭐⭐ | 8-12 | 着色器注入 |
| 🟡 P1 | Sky / Skybox | 34 | ⭐⭐⭐ | 6-8 | CubeCamera |
| 🟠 P2 | Terrain (DEM displacement) | 69 | ⭐⭐⭐⭐ | 15-20 | DEM source（已有） |
| 🟠 P2 | Terrain Depth Occlusion | 15 | ⭐⭐⭐⭐ | 8-10 | Terrain |
| 🟠 P2 | Globe | 122 | ⭐⭐⭐⭐⭐ | 20-30 | Camera 系统重构 |
| 🟠 P2 | Building + Facades | 53 | ⭐⭐⭐⭐⭐ | 15-20 | Lighting 3D |
| 🟠 P2 | 3D Intersections (elevated lines) | 75 | ⭐⭐⭐⭐⭐ | 15-20 | Terrain + Building |
| 🟡 P1 | Shadows (CSM) | — | ⭐⭐⭐⭐ | 8-10 | Lighting 3D |

**总计**：~100-150 PD（约 5-8 人月）

**建议执行顺序**：
1. **Projections**（直接移植数学，无架构变更）
2. **Lighting 3D**（three.js 原生支持，加 uniform 即可）
3. **Model Layer**（GLTFLoader 已有，接 datasource 即可）
4. **Fog**（着色器注入到现有材质）
5. **Sky**（CubeCamera + atmosphere shader）
6. **Terrain**（最大单项，但 flywave 已有 DEM 基础设施）
7. **Globe**（最大架构变更，需重构 camera/projection）
8. **Building + 3D Intersections**（需要 Lighting + Shadows 就绪）

---

### O.13 flywave 现有基础设施对照

| Mapbox 组件 | flywave 对应 | 状态 |
|------------|-------------|------|
| DEM tile source | `flywave-terrain-datasource` (TinTerrainLoader, ElevationProvider) | ✅ 已有 |
| Tile 3D / glTF | `flywave-3dtile-render` + `flywave-gltf` + `flywave-draco` | ✅ 已有 |
| Mercator projection | `flywave-geoutils` (MercatorProjection, EquirectangularProjection, SphereProjection) | ✅ 已有 |
| THREE.Scene/Light | three.js 核心库 | ✅ 已有 |
| THREE.ShadowMap | three.js 内置 PCFSoftShadowMap | ✅ 已有 |
| CubeCamera (sky) | three.js CubeCamera | ✅ 已有 |
| Raycaster (globe) | three.js Raycaster | ✅ 已有 |
| ExtrudeGeometry (building) | three.js ExtrudeGeometry | ✅ 已有 |
| DataTexture (DEM) | three.js DataTexture | ✅ 已有 |
| WebWorker decoder | flywave decoder pipeline | ✅ 已有 |
