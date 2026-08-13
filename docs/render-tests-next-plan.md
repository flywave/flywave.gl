# Render-Tests 对齐：下一步计划与实施细则（2026-08-12）

> 前置文档：进展与特性状态 `docs/render-tests-port-todo.md`（§10 全量基线）、差异根因 `docs/render-tests-diff-analysis.md`（R1–R10）。
> 当前基线：**182/2775 通过（6.56%）**，455 近失，256 未上报。目标：先消灭"整域空白"，再逐分类做像素级对齐。

## 0. 总体策略

1. **先修"空白俱乐部"**（R1/R2/R3/R9）：改动小、解锁面大（~1200 用例从"无内容"变"可比对"）。
2. **再修数据通路**（R4/R5/R6/R7/R8）：让依赖瓦片的 ~100+ 分类有数据、raster/heatmap/hillshade/fog 出正确内容。
3. **最后做精度**：逐分类 pixel-diff 调优（455 个近失是第一梯队），并跑真机 GPU 基线区分残留 SwiftShader 问题。
4. 每修一项：**改代码 → tsc + 单元测试 → 单分类 render-test 验证 → 更新 `render-tests-port-todo.md` 状态 → 提交**。

## 1. 通用流程细则

### 1.1 跑测试

```bash
# 单/多分类快速验证（1~3 分钟）
CHROME_BIN="/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge" \
  node scripts/run-mbstyle-render-tests.js text-size line-color

# 全量基线（分批，约 1.5~2 小时；结果累计在 rendering-test-results/mbstyle/）
CHROME_BIN="/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge" \
  MBSTYLE_PORT=8093 node scripts/run-mbstyle-render-tests-chunked.js
```

- 重跑前清理孤儿结果服务器：`lsof -nP -iTCP:<port> -sTCP:LISTEN`，有则 kill。
- 报告：`http://localhost:<port>/ibct-report`（逐用例 actual/diff 图）。
- 过滤是**子串匹配**：`line-color/` 也会命中 `elevated-line-color/`，重复无害（结果按用例名覆盖）。

### 1.2 验收门禁（每项 fix 的 Definition of Done）

- `pnpm --filter @flywave/flywave-mbstyle-datasource exec tsc --noEmit` 通过；
- 相关单元测试通过；
- 目标分类 render-test：**actual 不再空白**（有内容），且该分类通过数 ≥ 修复前；
- 无相邻分类回归（至少复跑 1~2 个相邻分类对照）；
- 更新 `docs/render-tests-port-todo.md` 对应行状态与 §10 数字。

---

## 2. Phase A —— 消灭整域空白（P0，预计 1~2 天）

### A1. text/icon 坐标空间修复（R1，~450 用例）

- **改动**：`@flywave/flywave-mbstyle-datasource/src/MBTileDataEmitter.ts`
  - 新增 `projectWorld(p)` = `project(p).add(this.m_decodeInfo.center)`（`tile2world` 在 `:130-160` 末尾 `sub(center)`，text/poi 需还原为绝对世界坐标）。
  - `:922-923`（line-placement path.push）、`:952`（emitTextGeometry）、`:958`（emitPoiGeometry）三处改用 `projectWorld`；`:948` 的 mesh 路径**不动**。
  - 参照：`@flywave/flywave-vectortile-datasource/src/VectorTileDataEmitter.ts:360-378` 的 `webMercatorTile2TargetWorld` 用法。
- **harness**：`test/MBStyleCompatRenderTest.ts` MapView 创建后设 `textElementsRenderer.disableFading = true`（消除 800ms fade-in 导致的偏淡）。
- **验证**：`run-mbstyle-render-tests.js text-size icon-image` → text-size/default 的 current.png 出现 "ABC"。
- **验收**：text-\*/icon-\* 不再整域空白；允许字体度量差异（后续精度项）。

### A2. line 预挤出宽度修复（R2，~280 用例）

> **2026-08-12 状态更新**：mpp 已改（`EQUATORIAL_CIRCUMFERENCE / (256 * 2^zoom)`，`MBTileDataEmitter.ts`），并顺带修复两个更大的系统性 bug（详见 `render-tests-diff-analysis.md` §11）：B1 mvt 解码分支顺序（ArrayBuffer 被对象分支吞掉，**所有 vector 瓦片从未解码**）、B2 mvt y 坐标约定错位（`MapView.projection` 默认 base `MercatorProjection` 下原点 vs OMV 上原点像素，几何整体离屏）。line-color 0/5 → 有内容（~75px 片段）。
>
> **2026-08-13 ✅ 已完成（commit `11ab47ac`）**：line 空白根因实际是**三角形绕向**——`createLineGeometry` 产出的 ribbon 三角形从上方（camera +Z）看是 **CW**，而 ribbon-fill 用的 `fill` technique 材质（`MapMeshBasicMaterial`，FrontSide 剔除）把 CW 三角形全部背面剔除 → 道路只剩 join/cap 处的碎片（75–1846px 而非 58813px）。`emitRibbonFill` 逐三角形翻转绕向为 CCW 后，**整条路网正常光栅化**。同时修正线宽烘焙的像素→米比例（相机在 mapbox zoom+1 显示，需用 `m_zoom+1`），路宽从 2 倍过粗校正。
> - 结果：**line-color/default 55527 → 337 mismatch**（literal 334、elevated-line-color/literal 335、property-function-identity 220）。
> - 剩余：line-color/function（zoom 色彩函数）与 property-function（categorical）**颜色比预期亮**（如绿路 0,160,0 vs 预期 0,128,0），为颜色空间精度项（C2）；`lineWidth=0.0001` 与 `_preExtrudedLines` 死标志仍保留（SwiftShader 兜底路径，双份渲染收口未做）。

### A3. extruded-polygon shader 编译失败（R3，~143 用例）

> **2026-08-13 ✅ 已完成（commit `92d8f07f`）**：
> - `MBTileDataEmitter.ts` 的 extruded-polygon technique 显式 `animateExtrusion: false`（阻断 `AnimatedExtrusionHandler` 默认开启动画的路径，`AnimatedExtrusionHandler.ts:48,117-121`）。
> - `@flywave/flywave-materials` 的 `ExtrusionChunks.ts:44-74`：`extrusion_normal_fragment_begin` 更新到当前 three 的 chunk API（`geometryNormal` → `nonPerturbedNormal`），**shader 编译错误 434 → 0**。
> - 结构性缺口仍在：emitter 只 earcut 出 z=0 平面 footprint，未烘焙 `extrusionAxis` 顶点属性（R3-长期），fill-extrusion-\*/building 仍为空白——待 C3（extrusion 几何烘焙）。

### A4. 异步纹理回调补重渲（R9，横切）

> **2026-08-13 ✅ 已完成（commit `9827d023`）**：`MBMaterialPatchManager.ts` 的 raster（`:448-453`）与 hillshade（`:1417-1422`）纹理 load 回调末尾补 `mapView.update()`。验证时 raster 仍不显示——因 R4 瓦片级别错位（Berlin raster 测试请求 z12/z16，fixtures 只有 z17-Berlin）+ env quad 的 z≤12 钳制，属 R4/R5 的 fixture/路径问题，非本项本身。

**Phase A 完成标志**：line/text/icon/fill-extrusion/building actual 整域有内容；重跑全量基线，通过率预计升到 15–25%。

---

## 3. Phase B —— 数据通路与路径收口（P1，预计 2~4 天）

### B1. 瓦片请求集合对齐（R4，~100+ 分类）

- **改动**：
  - 瓦片级别 −1 错位：核对 `MBStyleDataSource.applyCameraSettings:1473`（zoom+1）与 MapView 瓦片级别计算的换算链，使请求级别 = mapbox 级别（验证锚点：icon-pitch-scaling zoom14 柏林应请求 `14-8802-5374.mvt` 而非 `13-4401-2687.mvt`）。
  - `tileSize: 512` 语义：`@flywave/flywave-vectortile-datasource/src/OmvRestClient.ts:438-443` URL 构造按 `level − log2(tileSize/256)` 偏移（或 MBStyleDataSource 侧统一处理）。
  - raster-dem 按 source `maxzoom` 钳制并复用父瓦片：`TerrainController.ts:266`、`MBEnvironmentManager.ts:484,550`。
  - 高 pitch 视锥请求收敛（可与级别修复后重新评估，可能自然缓解）。
- **fixtures 补充**：拷 `mapbox-gl-js/test/integration/models/vector/*.vector.pbf`（27）与 `models/dem/*.terrain.png`（8）到 `test/rendering/integration/tiles/`（或建 `models/` 子目录并对齐 local:// 映射）。
- **harness**：瓦片 404 降为 debug 日志（"缺失=空瓦片"语义与上游一致）。
- **验证**：`run-mbstyle-render-tests.js heatmap measure-light real-world`；日志 404 总数应从 ~4700 降到 <500。

### B2. raster 出图（R5，~85 用例）

- **改动**：
  - `MBTileDataEmitter.ts:612-644`：raster/hillshade 合成多边形补 uv attribute（整瓦片 [0,1]²）。
  - `:503` 去掉硬编码 `color:'#ffffff'` 的副作用（纹理未附着时也应尊重 paint）。
  - `MBStyleDataSource.ts:882-887` 去掉 env quad 的 z≤12 钳制（按 overzoom 取瓦片）；**env quad 与逐瓦片路径二选一**——建议弃用 env quad（无视 visibility/paint），统一走逐瓦片 + patcher。
- **验证**：`run-mbstyle-render-tests.js raster-opacity zoomed-raster` → actual 出现卫星图。

### B3. heatmap 出图（R6，18 用例）

- **改动**：`MBMaterialPatchManager.ts:1317-1325` 替换串改为 `CirclePointsMaterial.ts:56` 实际的 `gl_FragColor = vec4(diffuseColor, alpha);`；混合模式改 NormalBlending（白底加法混合原理性不可见）。
- **中期**：双 pass（离屏密度纹理 + ramp quad），单独立项。

### B4. hillshade DEM 寻址（R7，20 用例）

- **改动**：`MBStyleDataSource.ts:171-233`（HillshadeTileDataProvider）DEM URL 实现 `zoom − log2(tileSize/256)` 并核对原生 −2 overscale；纹理加载后触发重渲（A4）；未 patched 时给 hillshade fill 合理 fallback 色。

### B5. fog 线性雾模型（R8，63 用例）

- **改动**：`MBEnvironmentManager.applyFog:170-173`：弃 `FogExp2(density=1/range*0.3)`，改线性 `THREE.Fog`，near/far 由相机地平线距离 × range 比例推算；雾色 alpha 作最大不透明度；`range[0]` 生效。
- **验证**：fog/color-opacity actual 从全屏饱和红变为地平线渐变。

**Phase B 完成标志**：重跑全量基线，404 大幅下降，raster/heatmap/hillshade/fog 出正确内容；通过率预计 30–50%。

---

## 4. Phase C —— 精度与工程项（P2，持续）

| 项 | 内容 | 依据 |
|----|------|------|
| C1 | **model-layer 崩溃定位**：拆小批重跑 212 用例，定位第 25 例附近的崩溃点（GLTF 加载/OOM/SwiftShader）；补 models fixtures | R10 |
| C2 | **近失梯队清零**：455 个 ≤600px 差异用例逐分类看 diff（worldview、filter、zoom-history、circle-color/function 等），主要是字体度量（`MBFontCatalogBuilder.ts:97-99` advance/offsetY）、颜色空间、阈值校准 | §10.2 |
| C3 | **extrusion 几何烘焙**（长期）：emitter 按原生格式产屋顶/墙面三角形 + `extrusionAxis` attribute（参照 `VectorTileDataEmitter.ts:1336-1600`） | R3-长期 |
| C4 | **heatmap 双 pass**（中期）：离屏密度纹理 + ramp quad | R6 |
| C5 | **真机 GPU 基线**：本机 Edge 非 SwiftShader 跑一次 chunked（去掉 `--use-angle=swiftshader` 的 launcher），与 headless 基线对比，区分残留 SwiftShader 问题 | §10.5 |
| C6 | **文档更正**：`render-tests-final-report.md` §三"三层阻塞均为 SwiftShader 缺陷"的结论需按 R1–R3 重写 | diff-analysis §0 |
| C7 | 引擎级缺口排期：circle blur/stroke、line blur/offset/join、text/icon halo（flywave-text-canvas）、icon offset/anchor/rotate props | progress-analysis §三 |

## 5. 风险与注意

- **双份渲染**：A2 恢复真实线宽后，若烘焙 ribbon 与 shader 挤出同时生效，线会变粗——必须在二选一上收口并复跑 line-width 全分类。
- **相邻回归**：R1 改坐标后，symbol-placement line（C7 已修的 `TextPathGeometry`）也要复验。
- **批次超时**：chunked 脚本单批 20min 上限；model-layer 这类大批修复后建议 `CHUNK_TIMEOUT_MS` 调大或再拆。
- **404 噪声**：修完 B1 后残留 404 多为上游故意的缺瓦片用例，不要追求 0。
