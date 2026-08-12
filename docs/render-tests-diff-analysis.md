# Render-Tests 基线差异根因分析与修复方案（2026-08-12）

> 基于 §10 全量基线（182/2775 通过，6.56%）的差异调查。结论均有代码行 / 运行日志 / actual 图实证。
> 基线结果目录：`rendering-test-results/mbstyle/`；日志：`chunked-render-tests.log`。

## 0. 结论总览

失败**不是**"精度不足"，而是 6 个代码 bug + 2 个模型/语义不匹配 + 1 个横切基建问题。**之前 `render-tests-final-report.md` §三 的"SwiftShader 三层渲染阻塞"结论被证伪**：fill/circle/background 在同一管线（同一 MapView/EffectComposer/canvas 捕获）下正常渲染，line/text/raster 等全空白——composer 与 toBlob 不可能选择性只吞掉某些图层。逐域空白都有具体的代码级原因，**headless 环境本身不是主要障碍**，修复后大部分域在 headless 即可验证。

| # | 根因 | 影响面 | 类型 |
|---|------|--------|------|
| R1 | text/icon 坐标空间错误（tile 中心相对 vs 绝对世界） | text/icon/symbol ~450+ 用例 | 代码 bug |
| R2 | line 预挤出宽度计算错误（mpp 为垃圾值） | line/elevated-line ~280 用例 | 代码 bug |
| R3 | extruded-polygon shader 编译失败（extrusion 动画默认开启） | fill-extrusion/building ~143 用例 | 代码 bug |
| R4 | 瓦片请求集合错位（level −1、tileSize:512、DEM maxzoom） | ~4700 次 404，~100+ 分类 | 语义未实现 |
| R5 | raster 双路径都断（uv 缺失、404 静默、无重渲） | raster ~85 用例 | 代码 bug |
| R6 | heatmap shader 替换目标串不存在（replace no-op） | heatmap 18 用例 | 代码 bug |
| R7 | hillshade DEM 寻址（zoom 偏移/514→512 未实现） | hillshade 20 用例 | 语义未实现 |
| R8 | fog 模型不匹配（米制世界 FogExp2 瞬间饱和） | fog 63 用例 | 模型不匹配 |
| R9 | 异步纹理加载后不触发重渲（横切） | raster/hillshade/icon pattern 等 | 基建缺陷 |
| R10 | model-layer 批浏览器崩溃（180/212 未上报） | model-layer 212 用例 | 待查 |

---

## R1. text/icon/symbol 全空白 —— 坐标空间错误（最大单域，~450+ 用例）

**现象**：text-size/default（text-field "ABC"）actual 为纯白 64×64；icon-image/literal（geojson 点 + 本地 sprite）actual 纯白。glyph fixtures 存在且请求成功（无 404），排除字体加载问题。

**根因**：`MBTileDataEmitter.ts:130-160` 的 `tile2world` 末尾 `target.sub(decodeInfo.center)`，产出 **tile 中心相对**坐标——这对 mesh 是对的（`TileObjectsRenderer.ts:63` 给 mesh 设 `object.position.copy(tile.center)`），但同一个 `project()` 结果同时用于 mesh（`:948`）和 `emitTextGeometry`（`:952`）/ `emitPoiGeometry`（`:958`）/ line-placement 路径（`:922`）。而原生 `TileGeometryCreator.createTextElements:501-551` 和 `PoiManager.addPois:150-190` 把 position 当**绝对世界坐标**使用。对照原生 `VectorTileDataEmitter.ts:360-378`：text/poi technique 特意用 `webMercatorTile2TargetWorld`（不减 center，注释明说 "otherwise the following POIs will be misplaced"）。

**后果**：text/icon 被放到世界原点附近，离相机约 2×10⁷ 世界单位 → 投影出屏 → 一个像素都不画。

**次要因素**：
- 文字 fade-in `RenderState.DEFAULT_FADE_TIME=800ms`，harness 只渲染 ~100ms → opacity ~10%；`TextElementsRenderer.disableFading`（`TextElementsRenderer.ts:429`）harness 未调。
- `MBFontCatalogBuilder.ts:97` `advance: g.advance / size`——`GlyphData.advanceX` 语义是像素，除以 24 会让字形严重重叠；`offsetY` 与 flywave `top = lineHeight - offsetY` 语义不完全对齐。

**修复方案**：
1. `MBTileDataEmitter.ts` 给 text/poi/line-placement 加不做 `sub(center)` 的投影（`projectWorld(p) = project(p).add(decodeInfo.center)`），`:922/:952/:958` 三处改用；mesh 路径 `:948` 保持不变。
2. `MBStyleCompatRenderTest.ts` MapView 创建后设 `textElementsRenderer.disableFading = true`。
3. （精度项）`MBFontCatalogBuilder.ts:97-99` advance 不除 size、offsetY 按 lineHeight 语义校准。

**预期收益**：text-\*（~273）+ icon-\*（~150）+ symbol/placement（~60）+ debug/collision（~51）大部分从空白变为可比状态，再进入像素级调优。

---

## R2. line/elevated-line 全空白 —— 预挤出宽度计算错误（~280 用例）

**现象**：line-color/default（期望黑色粗线路网）actual 纯白；域内仅 `zero-width`/`visibility:none` 这类**期望本身就是空白**的用例通过——反向证明 actual 恒空白。

**根因**（commit `c537647a` 引入，两处共谋）：

1. **mpp 垃圾值**（主因）`MBTileDataEmitter.ts:707-711`：
```ts
const lat = center.y > 0 ? 0 : 0; // 死变量
const metersPerPixel = EarthConstants.EQUATORIAL_CIRCUMFERENCE *
    Math.max(Math.cos((this.m_decodeInfo.projectedBoundingBox?.extents?.y ?? 0) * Math.PI / 180), 0.01) /
    (256 * Math.pow(2, this.m_zoom));
```
`projectedBoundingBox` 是 `OrientedBox3`，`extents` 是**米制世界半尺寸**（z14/15 瓦片 ≈611~1223），不是纬度。`cos(1223°)≈-0.80` → 钳到 0.01 → mpp≈0.1 → 10px 线宽烘成 ~1 米（屏幕上 ~0.1px）→ 光栅化等于没有。`cos(米数值°)` 是 [-1,1] 随机值，解释了为何个别 zoom 下 elevated-line 偶有内容而柏林 z14 整域空白。
2. **shader 挤出被关死**（共谋）`:576-580` 强制 `technique.lineWidth = 0.0001` → `SolidLineMaterial` 的 `extrusionWidth = lineWidth/2 ≈ 0`。`_preExtrudedLines` 标志（`:562,573,576`）无任何消费者，是死代码。

**排除项**：line-color/default 无 cap/join/gradient → patcher 不做 onBeforeCompile 注入，排除注入坏 GLSL；RawShaderMaterial 问题已由 `9c884e1e` 修复。

**修复方案**：
1. 最小修复：mpp 改为 `EQUATORIAL_CIRCUMFERENCE / (256 * 2^zoom)`（去掉伪 cos；像素→墨卡托米是线性的，无需纬度项）。
2. 二选一收口：恢复真实 `lineWidth`（删 `:576-580` 的 0.0001）并给 `_preExtrudedLines` 补真正关闭 GLSL 挤出的消费者；或保留烘焙路径删死标志。建议前者——真机 GPU 上原生 SolidLineMaterial 才是正确路径，JS 烘焙只作兜底。

**预期收益**：line-\*（~80）+ elevated-line-\*（~200）从空白变为可比状态。

---

## R3. fill-extrusion/building 全空白 —— extruded-polygon shader 编译失败（~143 用例）

**现象**：fill-extrusion-color/default、building/conflation actual 只剩背景色。日志实证：**434 次** `THREE.WebGLProgram: Shader Error ... 'nonPerturbedNormal': undeclared / 'geometryNormal': redefinition`，位置紧邻 fill-extrusion 用例。

**根因**（两层）：
1. **直接杀手 —— extrusion 动画默认开启导致 shader 编译失败**：`AnimatedExtrusionHandler.enabled = true`（`AnimatedExtrusionHandler.ts:48`）；MB technique 不设 `animateExtrusion` 时 `getPropertyValue(undefined)` 返回 null（`PropertyValue.ts:54-55`）→ `setAnimationProperties` 落到 `return this.enabled`（`:117-121`）→ **每个 MB extruded-polygon technique 都开动画** → 注入旧 extrusion chunks（`MapMeshMaterials.ts:781-821`），其中 `extrusion_normal_fragment_begin`（`ExtrusionChunks.ts:44-74`，声明 `geometryNormal`）与当前 three 的 `normal_fragment_begin`（用 `nonPerturbedNormal`）冲突 → fragment 编译失败 → mesh 完全不栅格化。
2. **结构性缺口**：`processFillFeature`（`MBTileDataEmitter.ts:586-659`）只 earcut 出 z=0 平面 footprint（position+index），原生 extruded-polygon 需要烘焙好的屋顶/墙面三角形和 `extrusionAxis` 顶点属性（原生 `VectorTileDataEmitter.ts:1336-1600`；shader `ExtrusionChunks.ts:17,36`）。

**修复方案**：
1. 短期：MB 的 extruded-polygon technique 显式 `animateExtrusion: false`；把 `ExtrusionChunks` 更新到当前 three 的 chunk API（`geometryNormal` → `nonPerturbedNormal`）。
2. 长期：emitter 按原生格式烘焙墙面/屋顶/extrusionAxis（屋顶加盖 + 墙面条带 + `vertexHeight` attribute）。

**预期收益**：fill-extrusion（~91）+ building（53）出图；vertical-gradient/pattern/terrain 等 patcher 增强随之可验证。

---

## R4. 瓦片请求集合错位 —— ~4700 次 404（~100+ 分类）

**关键事实**：`test/rendering/integration/tiles` 与 `mapbox-gl-js/test/integration/tiles` **逐文件完全一致**（777 个文件）——不是漏拷，上游就只有这些瓦片。真正原因是 **flywave 请求的瓦片集合与 mapbox 不同**：

1. **瓦片级别 −1 错位**：`applyCameraSettings`（`MBStyleDataSource.ts:1473`）的 zoom+1 只补偿了相机，MapView 瓦片级别选择仍低 1 级。例：icon-pitch-scaling（zoom 14 柏林）mapbox 请求 `14-8802-5374.mvt`（fixture 存在），flywave 请求 `13-4401-2687.mvt`（不存在）。
2. **vector source `tileSize: 512` 语义未实现**：mapbox 语义 = 按 zoom−1 取瓦片；`OmvRestClient.ts:438-443` 直接用 `tileKey.level` 无偏移（3d-intersections 等 73 个 style 受影响；z15 瓦片 fixtures 根本没有，全域 75 用例在无数据下渲染）。
3. **raster-dem 不按 source `maxzoom` 钳制**：`const/` 只有 z0/z1/z12/z13 DEM，flywave 请求 z3/z9/z12。
4. **高 pitch 视锥请求范围过大**：3d-intersections 请求了 z14–z19 共 508 个去重坐标，远超 fixture 的 73 个文件。
5. 部分 404 是 mapbox 故意的缺瓦片测试（`no/` 目录），上游 harness 同样 404，属正常噪声。

**修复方案**（治本，无需新瓦片）：
1. 修瓦片级别选择，消除 −1 错位（核对 MapView storageLevel/tileLevel 与相机 zoom 的换算）。
2. `tileSize: 512` → zoom−1 语义（`OmvRestClient.dataUrl` 或 MBStyleDataSource 侧）。
3. raster-dem 按 source maxzoom 钳制，超出复用 maxzoom 父瓦片（`TerrainController.ts:266` / `MBEnvironmentManager.ts:484,550`）。
4. 收敛高 pitch 视锥请求范围。
5. 少量补充：把 `mapbox-gl-js/test/integration/models/vector/*.vector.pbf`（27 个）和 `models/dem/*.terrain.png`（8 个）拷入 fixtures，补 model-layer 部分缺口。
6. harness 把瓦片 404 降级为 debug 日志（"缺失=空瓦片"语义与 mapbox 一致）。

**预期收益**：heatmap/measure-light/real-world/regressions/combinations 等依赖 mvt 的 ~100+ 分类从"无数据"变为有数据渲染；这是 R1–R3 修完后最大的解锁项。

---

## R5. raster 全空白 —— 双路径都断（~85 用例）

**现象**：raster-opacity/default 纯白；zoomed-raster/overzoom（z17 fixture 存在且瓦片角像素非白）actual 仍纯白 → 纹理从未附着。

**根因**：
- **env quad 路径**：`MBStyleDataSource.ts:882-887` 把 zoom 钳到 `min(floor(zoom),12)` → 请求 z12 瓦片（fixture 只有 z1/z12-SF/z14-SF/z17-Berlin）→ 404 → `MBEnvironmentManager.ts:554-580` 的 `catch {}` 静默吞掉 → quad 不进场景。
- **逐瓦片路径**：(a) `processFillFeature`（`MBTileDataEmitter.ts:612-644`）只发 position+index **不发 uv** → `material.map` 附着后 `vUv=(0,0)`，整片只剩角像素颜色；(b) emitter 硬编码 `color:'#ffffff'`（`:503`）→ 未附着时纯白；(c) 纹理 load 回调（`MBMaterialPatchManager.ts:448-453`）**不触发 `mapView.update()`** → 截图时纹理未上屏。

**修复方案**：emitter 为 raster/hillshade 合成多边形发 uv（覆盖整个瓦片 [0,1]²）；纹理回调补 `mapView.update()`；去掉 z≤12 钳制按 overzoom 取瓦片；env quad 与逐瓦片路径二选一（quad 无视 visibility/paint，建议弃用）。

---

## R6. heatmap 全空白 —— shader 替换 no-op（18 用例）

**现象**：heatmap-radius/default（geojson 点，不依赖瓦片）纯白。

**根因**：emitter 发 `circles` technique + `_isHeatmap`（`MBTileDataEmitter.ts:470-483`），圆点对象建出来了；但 `patchHeatmapMaterial`（`MBMaterialPatchManager.ts:1317-1325`）的 shader 替换目标是 `'gl_FragColor = vec4( diffuse, opacity );'`，而 `CirclePointsMaterial` fragment 实际是 `gl_FragColor = vec4(diffuseColor, alpha);`（`CirclePointsMaterial.ts:56`）→ **replace 全部 no-op**，ramp 从未注入；圆点保持蓝色 + `AdditiveBlending`（`:1298-1300`）→ 白底 + 蓝 = 白 → 空白。

**修复方案**：替换串改成实际的 `vec4(diffuseColor, alpha)`；中期实现真正的双 pass（离屏密度纹理 + ramp quad），或至少 NormalBlending + 按密度着色的 point shader。

---

## R7. hillshade 全空白 —— DEM 寻址语义未实现（20 用例）

**根因**：fixture 只 ship z14 DEM（对应 zoom 16 测试，mapbox 按 zoom−2 取 DEM）；`HillshadeTileDataProvider`（`MBStyleDataSource.ts:171-233`）按 flywave 级别填 `{z}` → 请求不存在的 z16 DEM。且日志里连该 404 请求都没有 → `patchHillshadeMaterial` 的纹理加载未触发（错误回调 `:1416` 静默）。raster-dem 的 tileSize 514→512 语义与原生 DEM overscale 完全未实现。

**修复方案**：DEM URL 解析实现 `zoom − log2(tileSize/256)`（核对原生 −2 overscale）；纹理加载后触发重渲；未 patched 时给 hillshade fill 合理 fallback。

---

## R8. fog 全失败 —— 雾模型与米制世界不匹配（63 用例）

**现象**：fog/color-opacity actual 为全屏饱和红色，expected 是红→米黄地平线渐变。

**根因**：`MBEnvironmentManager.applyFog:170-173` 用 `density = 1/range[1] * 0.3` 喂 `THREE.FogExp2`。flywave 世界是米制，zoom 17 视距数公里 → fog 因子 ≈1 → 全屏饱和成雾色。`range[0]`、雾色 alpha（rgba 0.8）被忽略，无 mapbox 地平线相对雾模型。

**修复方案**：改用线性 `THREE.Fog`，near/far 由相机地平线距离与 range 比例推算；雾色 alpha 作为最大不透明度上限；后续补 horizon-blend。

---

## R9. 异步纹理加载后不触发重渲（横切基建缺陷）

raster（`MBMaterialPatchManager.ts:448-453`）、hillshade（`:1411-1416`）等 patcher 纹理回调都不调用 `mapView.update()`。render-test 是静态截图模型（渲染 N 帧后 capture），纹理异步到达后**没有新帧** → 永远看不到纹理。**所有 patcher 纹理/异步资源回调都应补 `mapView.update()`。**

---

## R10. model-layer 批浏览器崩溃（180/212 未上报）

model-layer 批在第 25 个用例处浏览器崩溃（重连 3 次失败），批超时 20min 终止。模型资源 `local://models/*` 部分缺失（上游 `models/vector/*.vector.pbf` 未拷贝，见 R4-5）。崩溃的具体用例和原因（GLTF 加载 OOM？SwiftShader 大场景？）待单独排查；建议把 model-layer 拆成小批重跑定位崩溃点。

---

## 修复优先级与预期收益

| 优先级 | 项 | 改动量 | 预期解锁 |
|--------|-----|--------|----------|
| **P0-1** | R1 text/icon 坐标空间 + disableFading | 小（~10 行） | ~450 用例从空白变可比 |
| **P0-2** | R2 line mpp 修复 | 极小（~3 行） | ~280 用例从空白变可比 |
| **P0-3** | R3 extrusion shader 编译失败 | 小（technique 标志 + chunk 更新） | ~143 用例出图 |
| **P0-4** | R9 纹理回调补 `mapView.update()` | 极小 | raster/hillshade 前置 |
| **P1-1** | R4 瓦片级别/tileSize/maxzoom | 中 | ~100+ 分类有数据 |
| **P1-2** | R5 raster uv + 路径收口 | 中 | ~85 用例 |
| **P1-3** | R6 heatmap shader 串 + 混合模式 | 小 | 18 用例 |
| **P1-4** | R7 hillshade DEM 寻址 | 中 | 20 用例 |
| **P1-5** | R8 fog 线性雾模型 | 中 | 63 用例 |
| **P2-1** | R10 model-layer 崩溃定位 + fixtures 补充 | 中 | 212 用例 |
| **P2-2** | R3-长期 extrusion 几何烘焙 | 大 | extrusion 精度 |
| **P2-3** | 真机 GPU 基线复核 | 无（跑一次） | 区分残留 SwiftShader 问题 |

**预估**：P0 四项修完后，"空白俱乐部"（line/text/icon/extrusion/raster/heatmap ~1200 用例）大部分进入"有内容可比"状态；叠加 R4 瓦片修复后，通过率有望从 6.56% 提升到 30–50% 量级（之后才是逐分类像素精度工作）。

**文档更正**：`docs/render-tests-final-report.md` §三的"三层阻断均为 SwiftShader 缺陷、真机不受影响"结论应修正——line 空白的直接原因是宽度计算 bug；层 2/3（composer/toBlob）与 fill/circle 正常渲染的事实矛盾。

---

## 11. 补充根因（2026-08-12，A2 排查中发现，R4 未覆盖）

> 排查 line 空白时实证发现两个比 mpp 更底层的 bug，已修复（commit `9bf3469a`）。二者共同解释了 §7/§10.4 的"mvt 矢量瓦片渲染阻塞"——**不是瓦片集合错位，而是瓦片根本没解码、解码后又整体离屏**。

| # | 根因 | 证据 | 修复 |
|---|------|------|------|
| B1 | **MVT 解码分支顺序 bug**：`MBStyleDecoder.decodeThemedTile` 中 `typeof (new ArrayBuffer) === 'object'`，ArrayBuffer 先命中"GeoJSON 对象"分支被静默吞掉（`normalizeGeoJson` 原样返回 → `canProcess` false → 无操作），`instanceof ArrayBuffer` 分支**永远不可达** → 所有 vector 瓦片 never decoded | 瓦片 fetch 成功（4 个 mvt，字节数与 fixture 一致）但 `processLineFeature`/`processFillFeature` 从未被调用、decode 无任何输出 | 二进制分支提到对象分支之前（`MBStyleDecoder.ts`） |
| B2 | **mvt y 坐标约定错位**：`MapView.projection` 默认是 base `MercatorProjection`（下原点，y 向北增；Berlin 相机/tile.center ≈ 26.9M），而 OMV 原始 mapbox 像素（y 向下）经原始 `tile2world` 得到上原点（≈ 13.1M）→ 几何世界坐标在相机 ~13.7M 之外，全部屏幕外 | 浏览器探针：`projName=MercatorProjection`、`projectPoint(52.499,13.418)=21531200,26928398`（=相机位置，下原点）；对象世界坐标 13.1M vs 相机 26.9M | MB processor 对 mvt 数据 `py' = (scale − 2·top) − py`（转成与 GeoJSON/world2tile 一致约定，仅 ArrayBuffer 分支开启；geojson 填充保持基线行为不变） |

**验证**：line-color 从全空白（0 黑像素）变为有内容（~75 黑像素）；fill-color 经 `git stash` 对照确认与基线一致（784px，非回归）。剩余 ~100px 残差偏移（相机焦点/瓦片选择细节）待继续排查。
