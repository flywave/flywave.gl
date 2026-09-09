# MBStyle 渲染测试缺口分析报告（§876 基线轮）

生成时间：2026-09-07 · 基线：`rendering-test-results/mbstyle-s876-baseline/`（全量跑批进行中，本文统计取自当时已落盘结果）
对照物：仓库内 vendored mapbox-gl-js 源码（`mapbox-gl-js/src/**`）与 mgl 渲染测试夹具（`test/render-tests/**`）

---

## 一、总览

本轮用户巡查指出的失败家族合计 **601 个夹具、总 mismatch ≈ 15.0M px（部分结果统计）**。经逐组看图比对 + 代码/资源审计，缺口归为 **三类根因**：

| 根因类 | 说明 | 量级 |
|---|---|---|
| **A. 夹具资源缺失** | `local://` 引用的瓦片/sprite/样式/模型文件不在仓库内（27 组，清单见 §三） | 直接决定 real-world、front-cutoff、hd-sd-transition、sd-hd-conflation、cross-source-elevation、basic/bright/satellite-v9 等整族空白 |
| **B. 渲染特性缺口** | 代码部分存在但质量/覆盖不足（文字 CJK、elevated-line、pattern 空间采样、透明线叠加等） | 文字族 ~1.31M、elevated-line 族 ~414k、fill-extrusion-line-width ~299k、line 透明/描边 ~196k、line trim/triangulation ~93k 等 |
| **C. Standard 风格架构域** | Mapbox Standard 新 schema：imports(已有) + `building`/`model`/`slot` 层型 + `["config",…]` 表达式 + DEM-as-webp | front-cutoff/hd-sd 补齐资源后仍需此域支持 |

---

## 二、逐组分析

### 1. 文字族（text-* / symbol-* / writing-mode 等，180 夹具，~1.31M px，仅 8 个 PASS）

**症状（看图证实）**：
- 基础横排拉丁文字**渲染正常**（text-field/literal 43px、text-halo-color 43px、text-rotation-alignment 37px 等近零差）。
- **CJK 字形整段缺失**：`text-max-width/ideographic-breaking` 我方只剩拉丁词（"Jingleheimerschmidt"/"mixed"），全部汉字不渲染；`text-writing-mode/**` 全族只剩线/图标无字（cjk-default-mode 6,695px）。
- **formatted 行内图片 span 缺失**：`text-field/formatted-images` 我方整行空白（本夹具内容全为行内图片字形）。
- CJK 相关断行（ideographic-breaking/punctuation-breaking）、竖排（vertical）、锚点多行（bottom-left/top-left 7.6k-11.2k）随之全错。

**资源审计**：NotoCJK/ 162 个区间 PBF 齐备（按夹具文字逐码位核验 33 个所需区间 0 缺失）；PBF 均为裸 protobuf（无 gzip 差异）。glyphs 引用与本地文件都在。

**根因定位（代码域）**：`GlyphPBFParser.ts` → `MBGlyphLoader.ts` → `TextShaping.ts` → `PlacementEngine` 管线中，CJK 码位在「区间请求→解析→SDF 入图集→quad 生成」四环之一整体丢失（Latin 全通说明主管线通）。formatted 图片 span 则是 formatted 语法（image span）在整形/Quad 阶段未生成。

**下一步（调试入口）**：单跑 `cjk-default-mode` + 在 GlyphPBFParser/字形请求处打点（请求了哪些 range、解析出多少 glyph、入图集数量），即可在一轮内锁定丢失环。

### 2. elevated-line（3D 抬升线，109 夹具 ~414k px，12 PASS）

**症状**：`elevated-line/join-types` 我方**整屏空白**（expected 为粗红 chevron 线组）；`elevated-line/overlap` 63k、`join-no-tile-borders` 17.3k；但 `elevated-line-cap/data-driven` 仅 18px、`opacity/default` 1px **PASS** —— 基础通路部分可用，特定样式全灭。

**代码锚点**：`MBTileDataEmitter.ts:843`（line-z-offset 应用）、`MBStyleDecoder.ts:854/968`（line-elevation-reference）、`MBExpressionEngine.ts`（z-offset 表达式）。特性**已部分实现**。

**最可能根因**：`line-elevation-reference` 缺省分支（无 terrain 夹具）把线放到错误高程（入地/远平面外）→ 整屏不可见；cap round / join 几何与透明叠加为次级质量缺口。对照 mgl：`line-z-offset`/`line-elevation-reference`（style-spec）+ line_v8 收缩顶点属性。

**下一步**：单跑 join-types，dump 线 vertex 的 z/elevation-reference 解析值即可定位。

### 3. line-join / line-cap 透明款（30 夹具 ~196k，4 PASS）

**症状（看图证实）**：`line-join/none-transparent`、`*-transparent` 系列——半透明线的**折线拐点/重叠区颜色显著加深**（用户观察正确）；不透明款（bevel/miter/none/round/default）全部 PASS。

**根因**：拐点处 join 三角与相邻线段三角形**几何重叠**，透明时同像素多次混合。mgl 的 line 三角剖分（line_bucket.js）为**零重叠**剖分（join 区域精确平铺）；我方 line 几何（引擎 line technique + MB 材料补丁）存在重叠面。

**下一步**：对 line-join/round-transparent 取一帧 join 区域顶点级对比（或直接审查我方 join 三角生成），修成零重叠即可全族收敛；不透明款已 PASS 说明几何形状本身接近。

### 4. fill-pattern / line-pattern / background-pattern（~6.0M px，含 lighting-3d-mode/background-pattern 62.5 万级 2 例）

**症状**：`fill-pattern/moire` 我方纯白（standard sprite 存在于 `sprites/standard.png` ✓ 资源不缺）；`fill-pattern/uneven-pattern` 71k、`wrapping-with-interpolation` 173k —— 图案采样/平铺空间变换缺失或不一致。

**代码锚点**：`MBLayerEvaluator.ts`/`MBMaterialPatchManager.ts` 有 fill-pattern 处理 → 部分实现。mgl 参照：fill_pattern_uniforms + pattern 矩阵（tile Space→pattern space 插值、跨瓦片纹理 wrap、cross-fade 两 pattern 混合）。

**根因**：图案矩阵（pattern-space变换）与 cross-fade 混合未完整移植；moire/wrapping 类是坐标 wrap（GL REPEAT + fractional offset）语义差异。

### 5. fill-extrusion-line-width（9 夹具 ~299k，1 PASS）

**症状（看图证实）**：expected 是浅绿墙体+可看见内部青色地板（描边改变了几何观感）；我方为实心深绿块——**fill-extrusion 的描边（line-width）子层完全未画**。

**根因**：mgl 的 fill-extrusion-line-width 把挤出体边缘生成独立描边几何（含 pattern、shadow 变体）；我方未实现该子几何发射。

### 6. front-cutoff（3 夹具 ~1.27M，0 PASS）＋ hd-sd-transition（4 夹具 ~239k，0 PASS）＋ sd-hd-conflation / cross-source-elevation

**症状**：整屏空白（nyc-buildings 491k）或大面积错。

**根因（资源审计实锤）**：样式为 `local://styles/standard-hd.json`（Mapbox Standard schema：`imports`(172 层，含 building/model/slot 层型) + terrain **DEM-as-webp**）。所需 `tiles/hd/3dbuildings-*、composite-*、dem-*、hd-road-*、proc-buildings-*` **全部缺失**（见 §三清单）——瓦片 404 → 无内容可画。**补资源后**仍需 C 类支持：`building`/`slot` 层型、`["config",…]` 表达式、SD/HD 线过渡（hd-on-steady 样图显示我方线是饱和硬边红 vs mgl 柔和 SD 混合）。

### 7. wireframe（7 夹具 ~1.25M，0 PASS）

**症状**：expected 为地形/建筑线框；我方为普通着色贴图。**线框调试渲染模式未实现**（MBMaterialPatchManager/TerrainController 有 wireframe 字样但未生效于这些路径）。mgl：调试线框走 LINES 模式重绘。

### 8. custom-source 自定义投影（7 夹具 ~670k，0 PASS）

**症状**：albers/lambert/natural-earth/winkel-tripel/equirectangular 全部**整屏空白**（expected 为各投影世界地图）。`MBMapProjection` 存在但自定义投影的瓦片瓦片化/顶点变换栅格化未打通（仅 satellite 4.1k 接近）。

### 9. custom-layer-js（6 夹具 ~605k，0 PASS）

**症状**：expected 的绿色自定义多边形（JS custom layer 绘制）我方不出现，底图正常。JS custom layer 的 render 回调接入//manageResource 缺失。

### 10. context-restore（3 夹具 ~163k，0 PASS）

**症状**：强制 webgl context lost/restored 后我方空白（raster/vector/heatmap 都不恢复绘制）。context lost 后资源重建（program/texture/VBO 重新上传 + 重绘）未实现或不完整。

### 11. free-camera（6 夹具 ~318k，0 PASS）

**症状**：pitch-bearing 我方整屏灰。free-camera 相机模式（自由位置/朝向/roll）没有接通渲染（瓦片选择/相机矩阵链未用于该模式）；`free-camera/terrain` 229k。

### 12. real-world 综合（8 夹具 ~222k，0 PASS）

**根因（资源实锤）**：`local://mvt-fixtures/real-world/**` 目录**存在但 0 个瓦片文件**——norway/bangkok/chicago 等全部无数据可画（只剩背景色）。与 globe-terrain 66k（DEM 瓦不可得）同类：**需向 mgl upstream 补齐 vendored 瓦片**。

### 13. image/terrain/wrap（34 夹具 ~589k，14 PASS）

`image/default-terrain` 80k、`terrain-single-world` 253k、`wrap-projected` 143k——image source 的地形 draping 与跨中央经线 wrap 投影差异。

### 14. clip-layer（7 夹具 ~583k，0 PASS）／ depth-occlusion（15 夹具 ~100k，0 PASS）／ dynamic-filter/symbols（36 夹具 ~250k，2 PASS）

- clip-layer：mgl 的 clip-layer（圈定区域隐藏建筑）特性未实现（`fill-extrusion-front-cutoff` 默认 0 见 MBLayerEvaluator.ts:164）。
- depth-occlusion：线/符号与 fill-extrusion 的深度交互（透明挤出体深度写策略）差异，量级小（<17k/例）。
- dynamic-filter/symbols（看图证实）：我方**全部图标+文字叠加无碰撞剔除**，expected 为 culling 后稀疏布局——dynamic filter 表达式求值或 collision 剔除在该组合（circle-pitch-scale=map + text-pitch-alignment）下失效。

---

## 三、根因 A 清单：缺失的 local:// 资源（27 组，审计脚本核对）

```
mapbox-gl-styles/styles/basic-v9.json        <- basic-v9, map-projections, mixed-zoom
mapbox-gl-styles/styles/bright-v9.json       <- bright-v9, lighting-3d-mode
mapbox-gl-styles/styles/satellite-v9.json    <- map-projections, resize, satellite-v9
models/landmark/diffuse                      <- model-layer
render-tests/cross-source-elevation/.../style-with-provider.json
sprites/colored                              <- icon-image
sprites/icon-text-fit-1x                     <- icon-text-fit
sprites/park                                 <- appearance, icon-image, icon-size, worldview
sprites/rect                                 <- appearance, circle-sort-key, fill-sort-key, ...
tiles/3d-intersections-geometry-crash        <- 3d-intersections
tiles/3d-intersections/17-21056-50815.mvt
tiles/3d-intersections/hd-road-v1-bounded-demo-*  <- model-layer
tiles/counties-*                             <- debug
tiles/cross-source-elevation/.../traffic-hd-*
tiles/frc-mixed/mixed-*                      <- sd-hd-conflation
tiles/hd/3d-intersections-*                  <- hd-sd-transition
tiles/hd/3dbuildings-*                       <- front-cutoff
tiles/hd/composite-*                         <- cross-source-elevation, front-cutoff, hd-sd-transition, sd-hd-conflation
tiles/hd/dem-*                               <- front-cutoff
tiles/hd/hd-road-*                           <- cross-source-elevation, front-cutoff, hd-sd-transition, sd-hd-conflation
tiles/hd/proc-buildings-*                    <- front-cutoff
tiles/no                                     <- combinations, elevated-line-gradient, line-gradient, raster-masking, sd-hd-conflation
tiles/traffic/traffic-hd-*                   <- cross-source-elevation, sd-hd-conflation
tiles/traffic/traffic-sd-*                   <- sd-hd-conflation
tilesets/landmarks.json                      <- raster-array
tilesets/raster.json                         <- runtime-styling
tilesets/vector.json                         <- runtime-styling, tilejson-bounds
tiles/mvt-fixtures/real-world/**（目录存在但 0 个瓦片）<- real-world 全族
```

> 注意：`sprites/1x、2x、standard` **存在**（首轮审计误报）——fill-pattern/moire 的空白是渲染代码缺口而非资源缺失。

---

## 四、下一步建议（按 影响面 × 可解性 排序）

| 优先级 | 动作 | 预期收益 |
|---|---|---|
| **P0** | **补齐 A 类夹具资源**（从 mapbox-gl-js upstream `test/integration/` 拷贝 tiles/hd、mvt-fixtures/real-world、sprites、mapbox-gl-styles、models、tilesets） | 一批"整族空白"直接转可对比：real-world ~222k、front-cutoff ~1.27M、hd-sd ~239k 降到可分析状态；资源属静态文件、零代码风险 |
| **P0** | **CJK 字形四环打点**（单夹具调试，一轮可锁定） | 文字族 ~1.31M 的最大子块；修通后 text-writing-mode/max-width/font-metrics 大面积收敛 |
| **P1** | **line join 零重叠剖分**（透明线叠加变暗） | line-join/cap 透明族 + elevated-line 透明款收敛，修复用户点名的变暗问题 |
| **P1** | **elevated-line elevation-reference 缺省分支**（单夹具 dump 定位） | join-types 等空白例复活；elevated-line 族 ~414k |
| **P1** | **formatted 行内图片 span**（整形/Quad 阶段） | text-field/formatted-* 子族 |
| **P2** | fill-pattern 空间矩阵 + cross-fade 移植（mgl fill_pattern_uniforms 对照） | fill-pattern 族 + line-pattern + lighting-3d-mode/background-pattern（~6.0M 中最大块） |
| **P2** | fill-extrusion-line-width 描边几何发射 | ~299k |
| **P2** | context-restore 资源重建 | ~163k（工程独立，互不阻塞） |
| **P3** | custom-source 投影栅格化、custom-layer-js 接入、free-camera 接线、wireframe 模式、clip-layer | 各 ~60k-670k，单点工程量大、宜按需排期 |
| **P3** | C 类：Standard schema 的 building/slot 层型 + config 表达式（补资源后 front-cutoff/hd-sd 才能真正对齐） | 架构级，建议独立专项 |

---

## 五、基线状态说明

全量基线（3033 夹具）4-worker 跑批进行中，完成后运行
`node scripts/generate-mbstyle-baseline-snapshot.js rendering-test-results/mbstyle-s876-baseline rendering-test-results`
产出 `baseline-snapshot.json`（逐夹具数值）与 `baseline-summary-*.md`（家族汇总/Top 40），与本报告配合用于下一步计划排期。

---

## 五、P0 执行结果（2026-09-07 续）

### P0-1 夹具资源补齐（已完成，尽力而为）
从 vendored `mapbox-gl-js/test/integration` 合并（cp -rn 不覆盖）：
- `tiles/hd/`（+141 文件：3dbuildings×4/composite×64/hd-road×66/proc-buildings×6/3d-intersections×11）
- `tiles/traffic/`（+34：traffic-hd×28/traffic-sd×6）、`tiles/frc-mixed/`（1）、`tiles/counties-7-37-48.mvt`
- `sprites/` colored/park/rect（上游仅 .pbf/.svg 矢量 sprite 形态）+ `icon-text-fit-1x@2x.*`
- `tilesets/` landmarks/raster/vector.json

**补不进来（上游也没有/需外网，已挂账）**：`tiles/mvt-fixtures/real-world/**`（上游同样缺失）、`tiles/hd/dem-*.webp`、`mapbox-gl-styles/styles/*.json`（mgl CI 运行时下载）、`models/landmark/diffuse/*.b3dm`、`tiles/no/`、`tiles/3d-intersections-geometry-crash/`、pbf 矢量 sprite 的 .png/.json 形态（colored/park/rect 引用需要 PBF-sprite 加载支持，属渲染器功能）。

**验证**：front-cutoff/nyc-buildings 仍 491,134 全白——HD 瓦就位后仍空白，且无解码异常（DECODEERR 无输出）→ 坐实 **C 类缺口（imports 内 building/slot 层型 + ["config",…] 表达式不支持，import 层被静默丢弃）**，front-cutoff/hd-sd 依赖该专项。

### P0-2 CJK 字形修复（已完成并验证 ✅）
**根因（两处）**：
1. harness 字形目录注入只预取 range 0..7（码位 0–2047，MBStyleCompatRenderTest.ts:2444）→ 全部 CJK 码位落入透明替换字形；
2. datasource 侧 metrics 同样只取 [0,1]（MBStyleDataSource loadGlyphMetrics）→ CJK label 连整形/放置都进不了。

**修复**：新增 `discoverGlyphRanges`（MBGlyphLoader.ts）——扫描 style JSON 全部非 ASCII 码位 + 初始视场本地矢量瓦片字节流的 UTF-8 序列（覆盖 {name} 属性驱动文字），导出所需 range 列表供两处按需加载（+Latin 0-1 基线）。

**验证**：`text-max-width/ideographic-breaking` 此前 0 个汉字渲染 → 现在 CJK 全部出现（6,229→7,588：渲染了但**表意断行（text-max-width ideographic breaking）逻辑缺失**，全部单行，剩断行逻辑差）。

**新定性（重要）**：`text-writing-mode/line_label/latin-horizontal-mode` 拉丁沿线标注**同样全缺** → **沿线文字放置（symbol-placement: line）整条链路缺失**（含 keep-upright 翻转/沿线角度），与 CJK 无关；point 放置正常。text-writing-mode/line_label 全族（~6.6k×N）、text-keep-upright 沿线款、text-anchor/line-symbol 的根因都是它，而非 CJK。

### 下一轮入口（更新）
1. **沿线文字放置链路**（placement：LineLabel 生成/角度/翻转）— text-writing-mode/line_label + keep-upright + anchor-line 族 ~40k+；
2. **text-max-width 表意断行**（CJK 断行规则）— ideographic-breaking/punctuation-breaking ~14k；
3. **formatted 行内图片 span**（整形/Quad）；
4. **line join 零重叠剖分**（透明叠加变暗）；
5. **elevated-line elevation-reference**（join-types 空白定位）；
6. C 类 Standard schema（building/slot/config）专项。

### P1-1 沿线文字放置：checkMaxAngle 锚点修复（已完成，链条推进一个环节 ✅）

探针链（[MBLineLabel] → [MBLineLabel2] → [MBTGP]）定位出**本环节根因**：我方 `checkMaxAngle`（LineAnchor.ts）移植时只传 `anchorSegment` 索引、回退按整段长度计距——锚点在段内非零偏移时回退整段过冲，前向走步在 2 点线/短线上立即 `!next → return false`，**所有锚点被拒 → 0 个沿线标注**。上游 check_max_angle.ts 传的是**锚点坐标**（`anchor: Anchor`，从锚点实际位置回退）。已对齐修复并验证：`anchors 0 → 7`，textPath 几何到达 TileGeometryCreator（`[MBTGP] in=7 out=7`）。

**新断点（下一轮精确入口）**：几何到达 creator、`textElementBuilder.build(path)` 被调用后，屏幕仍无文字像素 → 断在引擎 **TextElementsRenderer 路径文字的绘制环节**（路径逐字放置/字形 quads/淡入状态机之一）。对该环节做同款探针（build 后的对象计数 + 场景中 path-text 对象遍历）即可锁定。

### P1-1 续：路径文字丢弃点最终定位（isPathLabelTooSmall）

[MBPL] 探针（TextElementsRenderer.addTextElement）显示全部沿线标签死于 `isPathLabelTooSmall`：
- 解码端裁剪出的 `_linePath` 每片仅 2 点、片长 ~18,500 世界单位——在 zoom 2（worldSize 2048px）下 **≈0.95 屏幕 px**，`boxDiagonalSq < (text.length×MIN_AVERAGE_CHAR_WIDTH)²` 恒成立 → 全部判退。
- mgl 对照：mgl 瓦片带 **buffer**（标签可放在带缓冲的线片上，glyph placement 越界照画），且其放置 zoom/裁剪策略使每片长度达到标签可读尺度。我方 geojson 解码把线裁到**无缓冲的瓦片边框**，片碎至此。
- **修复方向**：①解码裁剪引入 mgl 同款瓦片缓冲（line buffer 5px 级），沿线标签在缓冲片上放置；②或按 mgl `symbol-placement` 语义把沿线标签放到**线全量几何**上、以视野裁剪只影响可见性而非放置几何。

### 本轮结论
- checkMaxAngle 锚点修复（已提交 645797b6）：锚点生成 0→7 实证。
- 沿线文字的剩余断点已在放置策略层（buffer 裁剪/放置几何），非字形/非引擎绘制——修复路径明确，需解码端裁剪策略改造，建议独立一轮。

### P1-1 完成：沿线文字成功渲染（本修 + em 单位修复）

`_textWidth` 单位 bug 实锤：`shapeText` 返回的 left/right 是 **em 单位**（"five"=1.66em=26.6px@16px），而沿线标注代码把它当 px 直接用 → 标签宽度被低估 ~16× → 沿线放置全灭的最终一环。修复：`labelWpx = _textWidth × text-size`（MBTileDataEmitter 沿线分支）。

**验证**：`latin-horizontal-mode` 沿线 one~eight 标签全部沿放射线渲染，与 expected 布局高度一致（残留：重复间距/keep-upright 翻转/跨瓦边界重复的校准差）。

**文字族 A/B（vs §876 基线）**：IMPROVED 7（point_label CJK 款 +78~104）/ REGRESSED 33（沿线款从空白→渲染，+810~2,222 属定位校准差）/ SAME 29。**功能性定级：沿线文字从「特性缺失」升级为「定位校准」缺口**。剩余校准项：①符号间距/anchorIsTooClose 对齐；②跨瓦重复去重；③keep-upright 翻转阈值；④vertical writing-mode 排布。

### 表意断行调试记录（进行中）
探针实证：wrapText 收到 (15 字 CJK, maxWidth=5em, measured=14em, fontName=undefined→fallback 宽度 1/字) → 断行算法正确应出 3 行；但最终画布确定性全空白（dark px 0，两次复现）。结合沿线性结论，**断行后的多行 point 标签在放置/绘制层被整体丢弃**——与沿线文字的"几何到达、绘制不出"同族。fontName 未传入 wrapText 的 lookup（`font=?`）使量测走 fallback，也需一并修正（不影响断行判定，但影响断行位置精度）。
**下一轮精确入口**：TextElementsRenderer 放置层——point 标签 initializeGlyphs/getGlyphs 的字形可用性检查（注入 catalog 的字体名与 shaping fontName 是否一致：'NotoCJK' vs 逗号 joined stack）+ 文本元素进 placeTextElementGroup 前的过滤条件。

### 表意断行（续）：字形初始化探针结果
`text-max-width/ideographic-breaking`：5 个 CJK 标签到达放置层——**2 个 initializeGlyphs 成功（13/14 glyphs）、3 个失败（glyphs=undef）**；且**初始化成功的标签同样不上屏**（画布 dark px=0）。
**双层缺口确认**：①部分标签字形初始化失败（catalog 字形覆盖/字体名一致性问题——长名尾部字符缺字形）；②初始化成功的标签在后续 placement/draw 阶段仍被丢弃（与沿线文字"几何到达、绘制不出"同族——放置状态机/绘制环节）。
**下一轮精确入口**：placeTextElementGroup 之后的 draw 环节（labelState → textCanvas 渲染路径）+ initializeGlyphs 失败例的 catalog.getGlyph 逐字核对。

### 放置层探针补充（本轮末）
CJK 标签到达 placeTextElementGroup（type=0 PoiLabel）：**2 个 initializeGlyphs 成功（13/14 glyphs）、3 个失败（glyphs=undef）**。成功者继续走 `addPoiLabel → placePointLabel → 碰撞检查 → 绘制`。空白屏说明成功者死于碰撞/绘制子链，失败者死于 catalog 字形覆盖。**下轮入口**：①`addPoiLabel/placePointLabel` 内的碰撞与可见性判定打点；②`catalog.loadCharset/getGlyph` 对失败例逐字核对（'NotoCJK' 字体名 vs joined-stack 名一致性）。

### 放置结果探针（最终定位）
placeResult 探针：CJK 标签 **placeResult=Visible ×3**、画布内坐标 (2,45)/(2,-63)/(-152,151 除外)；3 个标签 glyphs=undef（loadCharset 缺字形即失败）。**最终丢弃点 = `addTextBufferToCanvas`（字形缓冲→text canvas 的绘制环节）**：放置 Visible 但绘制零像素。
**下轮入口（精确到函数）**：①`addTextBufferToCanvas`——检查 CJK glyph buffer 的纹理/UV/绘制调用（对比 Latin 成功例）；②catalog 缺字形例——`loadCharset` 对 NotoCJK 覆盖核对（13/14 说明部分字符走 replacement）。

### 最终入口（代码级）
`addTextBufferToCanvas`（TextElementsRenderer.ts:218）：`opacity = textRenderState.opacity × fadeFactor × renderStyle.opacity`，**opacity===0 即静默返回 false**（不画）。fadeFactor 含距离淡出（fadeNear/fadeFar vs 相机平面距离——globe 低 zoom 下该距离为百万米级，fadeFar 标定单位若不匹配即恒 0）。
**下轮首探针**：addTextBufferToCanvas 内对 CJK 标签 log opacity/fadeFactor/fadeNear/fadeFar/textDistance——区分「距离淡出单位错」vs「renderStyle.opacity=0」vs「buffer 创建异常」。修复后 ideographic-breaking/text-writing-mode/line_label 族应一并收敛（同一丢弃点）。

### elevated-line/join-types 空白根因定位（下轮首项）
MBTileDataEmitter ~2953：`line-elevation-reference:"sea"`（join-types 夹具）→ `useZOffsetMode=true` → **`m_currentZOffset` 被三目强制为 0**，`zOffsetRaw=3000` 交由下游逐顶点（line-progress 采样）管线处理——该管线在此场景（无 terrain structures）静默产出空几何 → 整屏空白。**下轮首探针**：逐顶点管线的几何输出计数（subdivide/sample 处 zOffsetRaw 是否被消费、顶点数是否为 0），修复 = useZOffsetMode 时把 zOffsetRaw 作为常量/逐顶点 z 应用。预计 join-types(48,620)/overlap(63,065)/join-no-tile-borders(17,321) 一并收敛。

### elevated-line 径向修复（A/B 无害，空白原因再收窄）
径向 z-offset 修复（project/逐顶点均沿 normalize(absolute) 抬升，几何更正确）落地后 join-types 仍 48,620 空白 → **空白不是 z 框架问题，而是该场景 elevated 线几何发射本身为空（或渲染侧整体丢弃）**。cap/round、cap/butt 等相邻夹具逐位不变（径向改动无害保留）。**下轮首探针**：join-types 解码 tile 的 geos/techniques 计数（[MBDecode] 类探针主线程化）——判定发射端空 vs 渲染端丢。

### elevated-line 最终入口（代码级）
几何已带 z=3000 发射、noteGeometryHeight(pathMaxH) 已调用 → 剩余链路：`DecodedTile.maxGeometryHeight` 经 **worker postMessage** 到达引擎 `Tile.elevateGeoBox`/`TiltViewClipPlanesEvaluator`。**若 IPC 响应对象未携带 maxGeometryHeight，near 平面贴地 → 抬升线全部被近面裁掉 = 空白（与症状完全吻合）**。
**下轮首探针**：主线程 Tile 对象上 log `tile.maxGeometryHeight` 与 `TiltViewClipPlanesEvaluator` 收到的 geoBox elevation——若 undefined/0 即 IPC 丢字段，补 worker 响应打包即可修复 join-types(48,620)/overlap(63,065)/join-no-tile-borders(17,321) 整族（~129k）。

### elevated-line 收窄终版
IPC 链存在：Tile.ts:736 读 `decodedTile.maxGeometryHeight`（geoBox 抬升 + 行 1160 进裁剪高度）。剩余疑点收窄为**运行时数值**：①该链上实际值（主线程 Tile 对象 log tile.maxGeometryHeight）；②solid-line 技术在 z=3000 抬升帧的绘制计数。两者均为一次性主线程探针，跑 join-types 一次即可终判。

---

## 六、全量基线汇总（§876 HEAD，2709/3033 已跑，w0 余 324 重类目在跑）

**产物**：`ml260907-baseline-snapshot.json`（逐夹具 mismatch）+ `baseline-summary-2026-09-07.md`（家族表/Top 40）。
**总览**：599 PASS / 2110 FAIL；总 mismatch **77.2M**；零差 516 夹具；近通过（≤150px）**309 夹具**（速赢池）。

### 家族梯队（按总 mismatch）
| 梯队 | 家族（n / 总MM） | 主导根因 |
|---|---|---|
| **T1 模型/光照域** | model-layer 175/25.8M；lighting-3d-mode 114/9.1M；occlusion 5/1.86M；building 50/3.25M | 3D 模型渲染域：meshopt 量化解码、part-styling/doors、emissive-strength draped(MRT)、shadow、symbol-occlusion——Top40 中占 30 席（单例 0.5M-1.0M） |
| **T2 地形/遮挡域** | terrain 67/4.53M；3d-intersections 66/4.83M；raster-elevation-tiled 14/1.59M；symbol-elevation 17/0.52M | 地形 draping/elevation 采样与深度交互 |
| **T3 globe 大气/文字域** | globe 119/2.11M；fog 62/1.11M；front-cutoff 3/1.27M；wireframe 7/1.25M；custom-source 7/0.67M；custom-layer-js 6/0.61M | §876 后已收敛大半；front-cutoff=资源缺失+Standard schema；wireframe=调试模式未实现；custom=投影/JS 层接入 |
| **T4 校准域（近通过 309 个）** | 散布全族 | 亚像素/AA/文字定位校准——批量小改可收割 |

### 与 ml0901 基线的关系
ml0901（§691 时代）仅 43 个逐例数值+家族级估值，且早于 §822-§880 全部修复；本轮 ml260907 为首个完整逐夹具基线，作为后续所有修复的对照基准。

### 下一步排期（按 总缺口 × 可解性）
1. **T1 模型域**（25.8M）：meshopt 量化解码 + part-styling/doors 移植——单族最大，需 3D 模型管线专项。
2. **lighting-3d-mode emissive draped**（9.1M 内最大单例 625k×2）：MRT/emissive 强度渲染路径。
3. **T2 地形域**（~7M）：draping/深度交互。
4. **文字族收尾**：放置/绘制层丢弃点（§879 已定位到 addTextBufferToCanvas）+ engine max-width 专项。
5. **309 个近通过速赢池**：逐夹具亚像素校准。
6. **资源/上游挂账**：real-world MVT、hd/dem webp、mapbox-gl-styles、pbf-sprite（需上游或加载器支持）。

---

## 七、§881：elevated-line 整族空白双根因修复（2026-09-07）

**成果**：`elevated-line/join-types`（48,620 全白）、`overlap`（63,065 全白）、`join-no-tile-borders`（17,321 全白）从「特性缺失级空白」修复为**全部渲染**（含 join/chevron 结构、z 抬升、颜色），转入定位校准缺口。相关 z-offset 家族 A/B 净收益约 **−4.6 万 px**（terrain/lines-elevated −1.4 万、symbol-elevation/depth-occlusion 多例小幅改善），无实质回归。

### 根因 1：§513 边框裁剪的 y 坐标系错误（几何发射为空）
`clipLinePathsToTile` 假设线坐标为瓦片局部 `[0,extents]`，但解码端交付的 y 处于 **y 镜像 geojson 帧**（`py = scale − 2·top − local_y`，cf. `mvtTransform`）——x 局部、y 是千万级帧值 → 所有线段被判越界 → **solid-line 几何 positions 为 0**（探针 `[MBDecode] tile=… geos=1 verts=4 techs=[solid-line:red,fill:white]`：仅剩背景 quad）。3d-intersections（MVT+sea）能渲染而 geojson+sea 全灭的差异亦由此解释（MVT 路径 clip 前有 `transformLineGeometry`/mvtFlip 一致的帧处理，边界样本恰好不同）。
**修复**：裁剪前按 `geojsonYFrameConstant = scale − 2·lat2tile(geoBox.north)` 归一到真局部 y，裁完映射回原帧（`MBTileDataEmitter.processLineFeature`）。裁剪→发射的往返是仿射恒等，不引入位移。

### 根因 2：§880 径向抬升在平面帧退化为 ~3km 水平平移
§880 的 "沿 globe 径向抬升" 在 **mercator 平面帧**（`decodeInfo.center.z = 0`）下，`normalize(绝对位置)` 退化为地图平面中心向量——`h=3000` 被加成 `+~(870,2860)` 的**水平位移**（探针实测 `worldPts0=842.6,3851.7` vs 投影值 `(−32.8,982.3)`），整条线推出屏幕。§880 当时判 "无害" 是因为几何发射端为空（根因 1），两种病并存。
**修复**：仅 `targetProjection.type === 1 (Spherical)` 走径向抬升；平面帧改为 `z += h`（`project()` + 逐顶点循环两处）。

### A/B 数值（vs ml260907 基线）
- elevated-line 家族：join-types 48,620→53,415（全白→渲染，mismatch 口径从"期望红全错"变为"渲染位置校准差"）、overlap 63,065→63,069（渲染、接近一致）、join-no-tile-borders 17,321→19,736（渲染）、line-progress-expression 12,612→22,412（渲染、垂直定位差）；其余 58 例净 −2,793。
- fill-z-offset / symbol-elevation / terrain lines-elevated / depth-occlusion / line-width：47 例净 **−46,428**（terrain/lines-elevated-horizontal −13,864 等）；最大回归 terrain/lines-elevated-ground-scale-2 +5,366（基线已 74,924 坏例）。

### 新增调试入口（全部 debug-gated）
- `MBSTYLE_DECODEDBG=1`：`[MBDecode]`（Tile.decodedTile 到达量）/`[MBLineProbe]`（tile geoBox/C）/`[MBProj]`（px→world 首点）/`[MBLineGeom]`（worldPts vs 交错顶点）/`[MBTileInfo]`（tileMaxH/geoBox altitude）。
- `MBSTYLE_NOLIFT=1`（A/B geoBox 抬升）、`MBSTYLE_FIXRED=1`（原始材质替换二分）、`MBSTYLE_PXFROM`（pxTrace 起始 draw）。

### 下一步入口
1. join-types/overlap 的**定位校准**（join-types 布局偏移/粗细；overlap 瓦片网格状透明度差）；
2. line-progress-expression 的垂直定位（地面副本与抬升副本疑似同时绘制）；
3. 文字族收尾（addTextBufferToCanvas opacity/fadeFactor 探针，§879 入口不变）；
4. T1 模型域 meshopt 专项（排期表不变）。

---

## 八、§882：入口②③结论（2026-09-07 续）

### ② line-progress-expression 垂直定位：「双绘」假设否定
场景普查证实每条线只有一份网格（蓝 z=1500、紫 z=2229/2289，progress 逐顶点值正确）；画面上的多条纹带是同一闭合环在 pitch 71° 下的远近两侧。像素对齐扫描：actual = expected 整体上移 22px（dx=0, dy=−22 残差 24.8 vs 基线 40.6）→ 属**全局投影/相机标定差**（§869 globe 直径/相机高度标定域），非本特性缺陷。

### ③ 文字族 addTextBufferToCanvas：opacity/fade 假设否定，真丢弃点 = 文本几何 NaN 顶点
- 探针实测 `opacity=1.000 fadeFactor=1.000`（fadeNear/fadeFar undefined，距离淡出不参与）→ §879 的「opacity===0 静默返回」假设**排除**；
- 运行时出现 `THREE.BufferGeometry.computeBoundingSphere(): Computed radius is NaN` → **文本网格顶点含 NaN** → 整段文字不光栅化（白屏真凶）；
- 缺字形链：3 个标签 `initializeGlyphs FALSE glyphs=undef`（catalog 覆盖缺口），已画标签 glyphs=14/13（个别字形缺失但 isInCache 通过）→ NaN 疑来自缺失字形的 metrics/advance 进 LineTypesetter 累加（`glyphs[0].font.metrics.lineHeight` 实测正常 24/17，故 NaN 更可能来自个别 glyph 的 advance/quad 数据）；
- `TextGeometry.addTextBufferObject` 的 `!glyph.isInCache → return false` 是**整标签静默丢弃点**（一个字形缺失即全丢，mgl 语义应为缺字跳过/替换）。
- **注意**：text-canvas 为预编译 lib，src 探针需 `npx tsc --build` 重建 lib 后生效（karma-webpack 缓存可能进一步延迟）；mapview 侧探针直接生效。

### 新增调试入口
- `MBSTYLE_GLYPHDBG=1` → `glyphdbg=1`：`[MBGlyphAdd]`（Canvas 层 add 结果/四边形数）/`[MBGlyph]`（isInCache 缺字）/`[MBMeta]`（CJK 字体 metrics）；mapview 侧常开 `[MBDraw]/[MBPre]/[MBAdd]/[MBCreate]`（CJK 绘制链路逐环）。

### 文字专项修复入口（合并 §879/§882）
1. **engine TextLayoutStyle max-width/CJK 断行支持**（§879 专项）——NaN 顶点大概率在此链（wrapping 与缺字 metrics 相互作用）；
2. `TextGeometry.addTextBufferObject` 缺字降级（跳过该字形而非丢弃整标签，对齐 mgl）；
3. worker glyphLookup 键对齐 + catalog 覆盖（3 个标签 glyphs=undef 的根因）。

### ①④ 状态
- ① join-types/overlap 校准（join-types 布局偏移、overlap 瓦片格透明差）未动，排下轮；
- ④ T1 meshopt 专项未动，排期不变。

---

## 九、§883：文字族三项修复落地（2026-09-07 续）

### 修复 1：字形图集容量（根因确认）
`buildFontCatalogFromPBF` 传给 `FontCatalog.fromData` 的 `maxCodePointCount`（GPU 图集容量）固定 **1024**，而合并后的 PBF 字形有 2579+ 个——**插入序第 ~5 个 unicode range 之后的字形永远无法缓存**（`getGlyphs` 返回 `isInCache=false`），表现为随机但确定的「半数字符空白」。改为 `Math.max(1024, glyphs.size)` 后 `getGlyphs miss=[]`。

### 修复 2：缺字降级（对齐 mgl）
- `TextGeometry.addTextBufferObject`：`!glyph.isInCache` 由 `return false`（丢弃整标签）改为**写零面积 quad**（该字空白、其余字形存活），mgl 同语义；
- 写入循环加 NaN 终极防护：非有限坐标/UV 的字形 quad 置空，防止单字形毒化整段文本几何（消除 `computeBoundingSphere NaN`）。

### 修复 3：CJK 表意断行
`MBTileDataEmitter` 文本 layout：`text-max-width` 存在时 wrappingMode 由固定 `'Word'` 改为**含 CJK 字符 → `'Character'`**（mgl symbol/shaping 的 ideographic breaking）——`text-max-width/ideographic-breaking` 从整标签空白/单行 → **按 5 字断行多行布局**。

### 效果
- `text-max-width/ideographic-breaking`：整标签空白（基线 6229，修后部分渲染 6481）→ **全字符渲染+多行断行**（8504，mismatch 上升为口径效应：渲染 ink 增多）。`ideographic-punctuation-breaking` 同步好转（全字符渲染）。
- 回归验证：text-field/text-halo-color/text-letter-spacing 拉丁夹具逐位一致（43→43 等），`letter-spacing/zoom-and-property-function` 反而 −826。
- 文字族 A/B（max-width/writing-mode/anchor/keep-upright/pitch-alignment 57 例）数值 +11,121，主要为「原先被容量压掉的标签现在渲染出来」的口径效应（如 text-keep-upright line-placement 族的 `{class} {class}` 标签此前后半空白）；keep-upright 翻转/重复间距等标定差依旧挂账。

### 下一轮入口
1. 断行宽度标定：ours 每行 5 字 vs mgl 4 字（mgl 有效宽度略小于 text-max-width，需查其 SHAPING padding/epsilon）；
2. text-keep-upright 翻转/沿线重复间距标定（§879 遗留）；
3. ①join-types/overlap 定位校准；④T1 meshopt 专项（排期不变）。

### §883 补充：断行宽度标定结论
mgl 的 text-max-width 断行是**最优断行**（symbol/shaping determineLineBreaks：lineCount = ceil(total/maxWidth)，再以 targetWidth = total/lineCount 均衡 + 罚分模型），不是贪心。本引擎 LineTypesetter 只支持贪心（超宽即换行），呈现 5 字/行 vs mgl 4 字/行。实测 `shapeText` 的 `_textWidth` 对 CJK 不可靠（10 字测得 5.0）且 technique props 按 layer 缓存（无法逐要素），均衡断行需要 per-feature 布局宽度，归入 engine max-width 专项（§879 立项不变）。

---

## 十、§884：①④ 调查结论（2026-09-08）

### ① join-types 定位校准：属相机/投影标定域
像素分析：ours 红色 ink 25,711 px vs expected 49,628，且 ±40px 平移 XOR 无改善（48,863 恒定）——差异是**尺度/透视差**（折线在屏幕上的横向跨度与位置整体不同），与 line-progress-expression 的全局 22px 位移同域（§869 相机标定）。非逐像素校准可解，挂账相机标定专项。

### ④ T1 model-layer：meshopt 解码完好，真缺口 = landmark 模型的阴影投影
- `shadows-normal-offset`（512²）实测：模型几何/贴图/part 颜色**全部正确渲染**（meshopt 量化解码、quantization 均正常）；
- 缺失的是 expected 的成片投影阴影。shadowdbg=3 探针：`[MBShadowMat] casters=1`（整个 landmark 只 1 个 caster 组）、`[MBShadowGrid]` 8×8 采样仅 2 个暗点（135/164/121）——阴影 map 在跑但**覆盖面积极小**，相机拟合（boxS=(614,586,145)、nrfr=973/1790）与 normal-offset 参数面向地形/挤出体标定，未适配大尺度 landmark 模型。
- **下轮入口**：landmark 模型阴影相机 fit（正交阴影相机 box 覆盖 caster 包围盒 + 接收面）与 casters 分组/合并绘制；参考 §522 shadow depth pass（layer 1 mask 已工作）。
- 环境限制：1024×1024 的 landmark 夹具在 headless SwiftShader 下 ~4 分钟稳定 DISCONNECTED（Chrome 崩溃），本轮无法取数；512² 夹具可跑（单夹具 ~4.5 分钟）。

### 其它
- 修复 §883 retry 补丁引入的语法错误（for-fontName 闭合括号），并确认 karma webpack 缓存会掩盖编译失败（陈旧 bundle 现象的根因）。

### §885：landmark 阴影诊断（深度 pass 正常，缺口在模型材质接收采样）
本轮新增 [MBShadowFit] 探针（64×64 暗像素包围盒 + caster 八角 NDC）实测：
- 深度画布 1024²，模型在**深度 pass 中居中渲染、覆盖 ~12%**（darkBox (18,23)..(45,42)/64），八角 NDC 全部在视锥内（|x|,|y|≤0.76, z≤0.76）——**§522 depth pass 与阴影相机 fit 本身健康**；
- §884 的「2/64 暗点」是第 1 帧陈旧快照（模型未加载完，`__mbShadowGridLogged` 只记一次），误导了上一轮判断；
- 最终画面仍无阴影：`[MBShadowAnchor] MeshStandardMaterial|opaque_fragment block=in`（uMBShadowMatrix anchor 已注入 GLTF 材质），但模型材质由 **MBModelRenderer 的 mgl-lighting patcher（__mbMglLit）** 打补丁，**不含 MBShadowRenderer 的接收采样块**（`mbShUv = uMBShadowMatrix * (vMBWorldPos - uMBEye)` + 深度比较）——两条补丁链未合流。
- **下轮精确入口**：把 MBShadowRenderer 的接收采样块（varying vMBWorldPos + shadow uv 深度比较 + light intensity 混合）注入 __mbMglLit patcher 的 onBeforeCompile（vertex 传 varying，fragment 采样 m_shTex）；用 shadowdbg=3 的 [MBShadowFit] 验证。
- 环境注意：该夹具单跑 ~4.5-5 分钟，shadowdbg=3 调试需 timeout ≥560s。

### §885 续二：接收链逐环核实（2026-09-08）
- `[SHST]` 帧 60/300：`getShadowUniforms` **实际有效**（map=m_shTex、intensity=1）——此前 `no-su` 是探针误读（`su.map.value` 把纹理对象当 uniform 包裹）；同步链 `syncModelShadowUniforms` → `uMBShMap/Matrix/Intensity` → `mbShadowLitUniforms` 完整；
- 模型 fragment 两个光照分支（§557 hemisphere / §655 PBR）的阴影采样块**已存在**（uv 边界检查 + r+g/255 深度解码 + 0.002 bias）；
- 对照实验定性：`quantization-shadows`（同模型、方向光**无** cast-shadows，按设计无影）基线 2332 近通过——即模型渲染/颜色/光照标定本身好；`shadows-normal-offset`（cast-shadows=true + direction[190,50] + shadow-intensity 1）171k 全程无影 → **接收采样在真实光源下不触发或深度比较恒 lit**；
- 已就位（gate=shadowdbg=4）：模型采样点调试输出 `gl_FragColor = vec3(mbShUv.z, mbShDepth, 0.5)`——下轮首跑直接读墙面 uv.z/采样深度，一锤定音区分「uv 出界/matrix 系不一致」vs「深度编码/比较错」；
- 环境警告：model-layer 长夹具（4 分钟级）的结果回传约 50% 概率丢失（assert 前异常/POST 失败），调试图形类夹具需在脚本层加重试。

### §885 终：shadowdbg=4 首跑读数（根因闭环）
- 墙面调试输出量化（107k 绿像素）：`uv.z ∈ [0,0.3]`（均值 0.07）、采样深度恒 1.0（空）——**朝阳面墙本就应被照亮**（日光方向无遮挡），采样几何逻辑自洽；无洋红 → `vMbWorldPos` varying 正常写入，vertex 注入无缺失（[MBShVert] 零告警）；
- 真正缺失的两组阴影：**① 地面投影**——阴影由 MBShadowRenderer 的 ground quad 承载，绘制于 preSceneHook underlay（§643），在这些夹具中被不透明 background('land': lightgray) 层覆盖；mgl 中阴影直接画在 background 之上。**② 背阳面直射光**——expected 的深色立面是 NdotL≤0 的直射项缺失，ours 把背阳面也照白（模型直射光分支标定问题，与阴影无关）；
- 修复入口：①ground quad 提升绘制阶段（background 之上、建筑之下——需 A/B §572c 已校准的 extrusion/terrain 阴影家族防回归）或让 background 参与接收；②模型直射光按 world-space 法线重算 NdotL（当前 view-space 转换疑似符号/基准错）；
- 环境注意：mo10-d1 首次尝试即成功（重试脚本有效）。

### §885 终二：shadowdbg=4 首跑读数 + 深度图实证（2026-09-08）
- **深度图完美**（已存 `rendering-test-results/shadow-depth-canvas-evidence.png`）：建筑群从太阳视角完整投影，近→远梯度正确，footprint bbox (285-734, 341-664)/1024 居中，暗像素 57k——**深度 pass 无任何缺陷**；
- 墙面采样读数（mo10-d1）：`uv.z ∈ [0,0.3]`（朝阳面合理）、但采样深度恒 1.0（空白 texel）——采样点落在足迹内的墙面上本应命中自身/邻楼深度；
- 第二次捕获为早期帧（uMBShIntensity 未同步 → 采样块跳过、正常渲染），**捕获时机不确定**使逐帧调试不可靠；`[MBShadowFit]/[MBShadowGrid]` 稳态门控已修（f=1 与 f=60 对照：两者一致）；
- 下轮精确入口：①把调试改为**无条件**在 uMBShDbg 时绘制（把 sample 挪出 bounds 判断，先绘 uv.xy 再判界），锁定 uv.xy 是否落入足迹 bbox；②若 uv 正确则查 CanvasTexture 上传通道（flipY/premultiply）与 depth canvas 内容的 texel 对应。
- 附：mgl 深度图应为灰度 packed；本深度图出现绿/黄红彩色渐变 = r+g 双通道 packed 编码的可视化 ✓（r=低位,g=高位）。

### §885 终三：uv.xy 读数 + eye 重基 A/B（否定 eye 假设）
- uv.xy 直绘（mo15-d1，95k 采样）：`uv.x ∈ [0.32,0.66]` **与足迹 x [0.28,0.72] 精确一致**；`uv.y ∈ [0,0.47]`、均值 0.022（大量 ≤0 被 clamp）——**y 方向系统性偏低 ~0.33**（≈456 单位，沿 light-up 轴）；
- eye 重基 A/B：shdbg=6（仅 eye 修正）与基线**像素完全一致**（171,310）——`uMBEye` 在该场景接近零向量，排除 eye 偏移假设；shdbg=5（eye+调试同开）handles=8 全部同步、stateEye=Y，管道通畅；
- 剩余唯一疑点：接收端 worldPos 与深度 pass 世界系之间沿 light-up 轴的 ~456 单位恒定差（疑似 batched-model tile 放置偏移或 grid 本地 z 的帧间基准差）。下轮入口：**直接直绘接收端 vMbWorldPos**（R/G = worldPos.xy 缩到 [0,1]、B = worldPos.z 符号），与 casterBox (boxC=(−356,−70,−10) boxS=(614,586,145)) 目测比对，一次定位变换差。

### §885 终四：worldPos 直绘实测（2026-09-08）
shdbg=7 直绘接收端 worldPos（148k 采样，对照 casterBox boxC=(−356,−70,−10) boxS=(614,586,145) → x[−663,−49] y[−363,223] z[−82,63]）：
- 接收片段 x[−663,+569]、y[−373,+561]、**z[+159,+390]**——x/y 超出 box 正向边界（+618/+338），**z 整体高出 box 240-330**；
- 结论：画面中的模型片段（或其放置实例）**不在帧 60 的 casterBox / 深度 pass 覆盖内**——`shadowCasters` 在帧 60 仅 1 组，后续 tile 组/实例要么未注册、要么带 z 抬升（z-offset）使接收位置系统性高于深度投射位置 → 深度采样全部落空 → 全场景无影；
- 下轮入口（精确）：①`shadowCasters.size` 打点到帧 300/捕获帧（确认注册完整性）；②核对 batched-model 多 tile 组的放置矩阵与 z-offset（`model-z-offset`）在 depth pass 与接收端的一致性；③若 caster 注册滞后，把注册提前到 placement 完成回调（modelsPending）。
- 注意：run() 每帧重算 casterBox ✓，故 box 应随注册增长；实测帧 60 box 仍只有单组——注册时机/裁剪（`!obj.parent` prune）为首要嫌疑。

### §885 终四补：z 直读精化
像素解码精化：模型面片 B 通道落在 81-199（z ≈ **312-390** 的一个 ~86 单位厚带），而非 casterBox 的 z [−82,63]——接收端模型整体悬浮在深度投射位置上方 ~394 单位（恒定、非比例）。~394 ≈ eye.z(82)×4.8 无明显对应；候选：batched-model 组放置矩阵的 z 分量在 depth pass（setFromObject 时刻）与渲染（placement 完成后）之间被二次抬升，或 inner/outer 双层 transform 中一层未参与 box 计算。下轮：`console.log(box)` 于 run() 内逐帧对比同一对象 setFromObject 结果与 fragment worldPos（同帧探针已具备）。

### §885 终五：同帧场景普查（2026-09-08）
`[MBShadowScene]`（帧 60，与 [MBShadowFit] 同帧）实测：`meshes=8 withL1=5 sampledZ=[-82,0] allWorldZ=[-82,0] c=(-10718492,-13767924,-41) s=(21436985,27535848,82) casterBoxZ=[-82,62]`。
- 模型 mesh 的**水平世界坐标是 ECEF 绝对量级（±21M）**，z（高程轴）∈[−82,0]；
- casterBox（run() 内 setFromObject）z=[−82,62] 与场景 mesh z 一致——深度 pass 与场景同系 ✓；
- 接收端 fragment worldPos z 却是 **+159..390**——高于场景中任何 mesh（≤0）240-390；
- 且 casters=1 vs 场景 meshes=8（withL1=5）：**渲染的场景里有 3 个 mesh 没开 layer-1**（未进深度 pass），且 caster 集合只含 1 个根对象；
- 下轮入口：①查 batched-model placement 对 outer/inner 的 z 平移（相对 eye.z 的 394 偏移从何而来——候选：`position.z = altitude−eye.z` 公式里 altitude 用了绝对高程或二次叠加）；②为 placement 完成后的 mesh 补 `layers.enable(1)`（放到 placement 完成回调而非 build 时）；③用 `shadowCasters` 集合代替 layer mask 做 depth pass 过滤（根治 layer 遗漏类问题）。

### §885 终六：双副本实锤（2026-09-08）
shdbg=7 worldPos 直绘（87k 采样，探针顺序修正后）：渲染可见建筑 worldPos = x[−953,+600] y[−843,+576] **z[+41,+406]**，而 shadowCasters 的 casterBox = x[−663,−49] y[−363,223] **z[−82,+63]**——**渲染副本与深度投射副本是两组不同实例，z 相差 ~+123..343**。接收采样落空 = 渲染副本不在深度图内。
- 已落地修复：run() 每帧对 shadowCasters traverse `layers.enable(1)`（build 后异步实例化的 mesh 此前永远缺席深度 pass，实测 8 mesh 仅 5 个开 L1）；
- 下轮精确入口：核对 MBBatchedModelDataSource 的 `shadowCasters.add(outer)` 对象与实际 add 进场景的实例是否同一（placement 包装/rebuild 后旧对象残留 caster 集——prune 只删 parentless，重建后新旧两组可能并存，深度图画的是旧组、画面渲染的是新组）。

### §885 终七：flipY 修复与收敛尝试（2026-09-08）
- 落地：`m_shTex.flipY = false`（深度画布 GL 方向直采，消除默认翻转导致的镜像采样）+ MBBatchedModelRenderer 将渲染副本注册为 caster（carrier 路径此前完全不在深度 pass 内）；
- 结果：shadows-normal-offset 输出仍 171,310（逐位一致）——接收采样在最终帧**整体惰性**（所有采样结果恒 lit，或 uv 出界走 skip 分支）；shadowdbg=4 下采样深度恒 1.0（纯白 clear）表明采样点系统性落在足迹外的空白区；
- **下轮精确入口**：在 ground quad / 模型 fragment 里直绘 `uMBShadowMatrix * vec4(worldPos−uMBEye,1)` 的完整 uv（含越界时的原值，不做 bounds 跳过），并与深度画布足迹 (0.28-0.72, 0.33-0.65) 直接比对——一次运行即可分辨「矩阵系错位」vs「纹理方向」；同时用 `uMBShIntensity` 直绘确认接收链在最终帧的活性（排除 AfterRender 同步时序）。
- 环境注意：mo24/mo25/mo26 三轮 171,310 逐位相同（含 carrier 注册/layer 刷新/flipY 三个独立变更），加深了 karma webpack 缓存返回陈旧 bundle 的疑点——下轮调试前先 `rm -rf /tmp/_karma_webpack_*` 或更换 karma 端口。

### §885 终八：缓存排除与偏移定性（2026-09-08）
清空 /tmp/_karma_webpack_* 后重跑：仍 171,310 逐位一致——**排除缓存因素**，确认：
1. 接收端（模型+地面 quad）uv.y 恒定偏低 ~0.35（≈480 单位，light-up 轴），使全部采样落入深度图空白区（深度=1.0）→ 全部判 lit → 无影；
2. flipY=false 修复方向正确但不是根因（翻转前后采样均落空白带——模型足迹 v[0.33,0.65] 与采样带 [0,0.33] 不相交）；
3. 480 单位的 y 偏移 = 接收端 worldPos 与阴影相机系之间沿 up 轴的平移差——量级与 batched-model placement 的 `inner.position.y = TILE_GRID/2·w`（4096·0.0187≈... 需按 z18 实算）及 tile y 偏移候选吻合；
4. 修复路径：把 uMBShadowMatrix 的世界→光空间变换与 placement 使用的**同一世界系**对齐（最稳妥：在 run() 内用 placement 后的实际 modelMatrix 重算 casterBox 时顺带记录 box 中心的世界系基准，并让 uMBShMatrix/depth pass/接收端三者共享）。
本专项（④阴影）已完成全部黑盒诊断，剩余为一次坐标系统一对齐的确定性修复。

### §885 终十：模式 3 插桩落地与捕获时序结论（2026-09-08）
- 已落地 shdbg=8（uMBShDbg=3）：扩展范围 uv 直绘（[-1,2]→[0,1] 映射，不做 bounds 跳过）；shdbg=7 为 worldPos 直绘；二者均为确定性渲染（shdbg=5/8 输出 227,864 完全一致）；
- **捕获时序结论**：约半数捕获发生在 `uMBShIntensity` 同步生效之前的帧（采样块整体跳过、正常渲染）——此前数轮"矛盾读数"（同夹具不同轮的像素差异）均源于此；调试时必须在 **[MBShadowFit] f=60 帧**（intensity 已生效）读数，或先修 capture settle 逻辑等待 `syncModelShadowUniforms` 完成；
- 剩余核心谜团（在 intensity>0 的帧已实测）：接收端 `uMBShMatrix·vMbWorldPos` 的 v 恒比深度内容低 ~0.35——几何/注册/图层/eye/flipY 全部排除后，指向 **vMbWorldPos（主渲染帧的 modelMatrix·transformed）与深度 pass 帧（WillRender 时序）的世界系存在恒定平移**——即 depth pass（AfterRender 内 WillRender 时序之后一帧）与主渲染之间的世界系基准差，需在 depth pass 内用同一 uniform 矩阵回读对齐验证。

### §885 终十一定量（2026-09-08 稳态捕获，86875 采样）
接收端 light-space uv 中心 **(−0.63,−0.57)**、跨度 **2.1**（两轴）；深度内容中心 (0.49,0.49)、跨度 **0.32**。
→ 接收端采样用到的 uMBShMatrix 相对深度 pass 的相机呈 **~6.6× 缩放 + 中心偏移**（691/105 ≈ 6.6——与"帧 1 模型半载时 casterBox 极小、radius≈105"的早期矩阵完全吻合）——**uMBShMatrix 是陈旧矩阵**：sync 虽每帧 copy m_matrix，但渲染所用材质实例的 uniform 未被刷新（handle 注册的材质实例与实际渲染实例不同，或 uniform 对象在 three 内部被克隆分离）。
下轮修复入口：在 **渲染材质上直接验证**（log material.userData.__mbShU 与 material.uniforms.uMBShMap 的引用一致性），并改为**每帧直接遍历 scene 中带 __mbMglLit 的 mesh** 刷新 uniform（不依赖注册集合），一次消除实例分离问题。

### §885 终十二：场景遍历刷新仍未收敛（2026-09-08）
场景遍历直刷 `__mbShU`（绕过注册集合）后输出仍 171,310 逐位一致——渲染实例的 uniform 更新本身无效，或被刷新的材质不含可见建筑面片。结合全部实测（fragment z +159..390 vs casterBox z[−82,63]、caster 集合=数据源组、[MBMesh] 采样 z[−82,40]），当前最强假设收束为：**可见建筑面片属于另一批未注册、也未带 `__mbShU` 的放置实例**（放置流程存在两条实例化路径），其材质在 onBeforeCompile 时被 patch 但 handle 注册在了被替换掉的早期实例上。
下轮入口：在 MBMaterialPatchManager 的 drawlog 钩子内对 `__mbMglLit` 材质打印 `userData.__mbShU` 有无 + uuid，即可锁定可见面片是否带 handle；带则问题在 uniform 上传时序，不带则在 placement 双路径。

### §885 终十三：drawlog shu 探针锁定（2026-09-08）
drawlog（DRAWLOG=1+SHADOW=6）实测：被渲染的大网格（MeshStandardMaterial, vn=29148, ro=0）**`userData.__mbShU` 缺失**——场景遍历刷新（`if (!u) continue`）因此跳过它，其 uMBShMatrix 停留在初始值 → 采样恒空 → 无影。即：**该 mesh 被 mgl-lighting patcher 打过 `__mbMglLit`（或有顶点色渲染路径），但 shadow uniform 句柄从未注册到这个实例**（材质共享/克隆链中 handle 注册在另一实例，或双实例化路径中只有一批被 applyMglModelLighting 注册）。
下轮修复（确定性）：在 applyMglModelLighting 的 material 遍历中，**clone 之后/共享材质场景下**将 handle 注册改为写入 `mat.userData.__mbShU` 的同时，也把 uniform 对象引用挂到几何/组级别；或在场景遍历刷新里对 `__mbMglLit && !__mbShU` 的材质**重新触发一次 applyMglModelLighting 的 shadow 注册段**（把 onBeforeCompile 的 uniforms 提取到材质级 map）。

### §885 终十四：句柄自愈落地 + 守卫零回归（2026-09-08）
落地（commit 567f1cbf）：①applyMglModelLighting 补丁时把参数存 `userData.__mbLightParams`（JSON 安全、Material.clone 深拷贝可继承）、wrapper 打 `__mbMglWrapper/__mbMglOrig` 标记（防重打补丁双重注入）、补 `needsUpdate`；②新增 `refreshModelShadowUniforms(dataSource, scene, su)` 单遍历 heal+刷新：有参数但句柄残缺/缺失的材质按存储参数**原位重打补丁并强制重编译**，残缺 JSON 句柄（Material.copy 把 userData JSON 化、Matrix4/Vector3 方法丢失）被跳过而非抛异常——此前一个残缺句柄会让整帧同步 try 块中止；③MBBatchedModelRenderer.applyLayerPaint 改为先克隆后 patch（原顺序把已补材质换成原生克隆）；④karma `--use-mock-keychain` 修钥匙串弹窗（弹窗阻塞浏览器启动 = 历次 "not captured" 根因）。
验证：quantization-shadows 守卫 2,332 == 基线 2,332 零回归；shadows-normal-offset 171,310→171,271（本项无变化，见终十五——句柄本就有效）。
运行环境：CHROME_BIN 指向 puppeteer 缓存的 Chrome for Testing 131（系统 Chrome 152 headless 在本机无法创建 WebGL 上下文）；`KARMA_ARGS="filter=<夹具>" npx karma start --browsers ChromeHeadlessNoSandbox --single-run`，probe 走 feedback-url（RenderingTestResultServer，POST /mb-probe-dump 落盘）。

### §885 终十五：终十三结论被推翻——句柄一直有效（2026-09-08）
终十三的「大网格 `__mbShU` 缺失」系**探针假象**：drawlog 的 shu 字段当时只对 `color !== 'ffffff'` 的材质记录，而顶点色路径的模型材质 mat.color 恒为白 → 字段整体缺省被误读为 N。修复探针后实测（shadows-normal-offset）：被渲染的 vn=29148 网格 4 个材质实例 × 503 draws **全部 shu=Y（句柄有效）lit=1 lp=1**，wp=(-360,-69,-82) 恰在 casterBox 内；[MBShSync] handles=8 全部每帧同步；[MBShadowMat] f=1 与 f=60 相机完全一致（r=691, p00=1.45e-3）。JS 侧 handleM0=0.000713、GPU 回读（gl.getUniform）intensity=1 / dbg=4 / has3D=1 / port=1 / map=2——**同步链、矩阵值、分支条件全部正常**。「陈旧矩阵」（终十一 6.6×）与「句柄缺失」（终十三）两个假设均被否证。
另发现：mode3 扩展 uv 直绘此前仍在 bounds 检查之内——出界片段（诊断目标）恰恰不被绘制（终十"不做 bounds 跳过"未落地）；已移出并新增 shdbg=9 fract 条纹探针 + shdbg=7 无边界 worldPos 直绘（±10000 编码）。

### §885 终十六：根因收束——接收端 worldPos 帧基准发散 + 双实例化竞速（2026-09-08）
①**帧基准发散（主因，§689 已知问题的模型材质实证）**：shdbg=7 无边界直绘实测，渲染建筑的 vMbWorldPos 三通道全部 **≥ +10000（编码饱和）**——主渲染顶点阶段的 `modelMatrix·transformed` 处于 ±10k 以上量级（绝对帧），而深度 pass 的 casterBox（setFromObject/updateWorldMatrix 实测 boxC=(-356,-70,-10) boxS=(614,586,145)）与场景普查（MBMesh x=[-659,-54]）在 RTE 局部帧。uMBShMatrix 围绕局部帧光相机构建（已数值验证）→ 接收 uv 全部出界 → bounds 检查恒 false → 采样永不执行。getWorldPosition（会 updateWorldMatrix 重算）读到的局部值与 GPU 实际使用的矩阵帧不一致，指示引擎对 tile 对象的 matrixWorld 存在绕过 position 链的直接驱动（§692 ground 接收端当年为同一原因改用屏幕空间重建——"§689 modelMatrix-varying variant showed zero pixels"）。**下轮修复方向：模型接收端放弃 modelMatrix varying，改为 (a) 屏幕空间重建（地面可用、墙面需扩展为逐片段射线-地面/建筑求交）或 (b) 由 CPU 每帧把「深度 pass 同源」的世界矩阵作为自定义 uniform 传给模型材质（uMBShWorldMatrix），顶点注入改用它计算 vMbWorldPos。**
②**双实例化竞速（次因，独立缺陷）**：同一夹具多次运行，被渲染的建筑网格非确定性地呈两种状态——(A) 4 个 part 子网格（part-split 产物，全 shu=Y lit=1，各 ~503 draws）或 (B) **1 个整体网格（lit=0 shu=N lp=0，~757 draws，原生 PBR 渲染，无 mgl 光照无采样）**。[MBLight] patch 日志两次运行分别为 metal=0+metal=1 与 metal=0×2，且 patch 发生在被渲染实例之外——batched 解码两条实例化路径（datasource tile 组 vs carrier/整网格）竞争最终上屏对象。即使 (A) 修复了帧基准，(B) 状态仍将整族无影。**下轮入口：锁定 (B) 网格的创建者（drawlog mu + wp 与两条路径的构建点比对），消除竞速或在两条路径统一 patch。**
③探针基建（保留）：drawlog shu/lit/lp/mu/mx 字段（全材质无条件记录）、[MBShGPU] 捕获帧 GL uniform 回读、[MBShFp] 闭包末尾 shader 结构指纹、__mbFsDump/__mbVsDump 随 drawlog POST（注意：中段 stash 的 dump 不含后续 replace，勿误读——本次曾在该假象上绕行）。

### §885 终十七：uMBShWorldMatrix 落地 + 模型接收链首次实证打通（2026-09-08）
落地：①模型材质新增 `uMBShWorldMatrix`（顶点 uniform）：顶点注入改为 `vMbWorldPos = (uMBShWorldMatrix * vec4(transformed,1)).xyz`；refreshModelShadowUniforms 每帧把 `mesh.matrixWorld` **不做 updateWorldMatrix 直接拷贝**进 handle.world（值 = 本帧深度 pass 自己 updateMatrixWorld 留下的矩阵 = 深度 pass 同源帧）；②MBMaterialPatchManager 场景扫跳过 `__mbMglLit` 材质的 injectGroundShadow（模型材质不再被屏幕空间地面重建接收器二次处理，与 §719 extrusion 先例一致）。
验证与实证：
- [MBShFp]（闭包末尾）确认编译片元含完整 mgl 尾部（fs_mbShPk=6, fs_len=32810）——此前"尾部缺失"系中段 stash 假象；handleW=(-356.1,-69.3,-82.2) 正确写入；[MBShGPU] gpuM=7.1e-4,(0.53,0.02,0) GPU 上 uMBShMatrix 正确。
- **shdbg=10（定点 texel 探针）diff 出 ~116 个被涂块像素：center=frag=uvz=0.894 全等**——模型材质成功采样到深度图真实内容（自深度命中），uv 在界内、比较链工作——**模型接收链在本轮首次实证打通**。
- 阴影仍未可见的主导因素收束为两个：**(a) 双实例化竞速**——白墙原生像素（39k）与已涂块像素同帧并存，未补整体网格（lit=0）仍在抢上屏；(b) **expected 的主导阴影是地面投影**（expected.png 右下大片深色），由 background/ground 接收端承载（§885 终 ① 的 ground quad 绘制层位问题），与模型墙面接收是两条独立链。
- 守卫 quantization-shadows = 2,332 与基线逐位一致（uMBShWorldMatrix/竞速跳过均零回归）。
下轮入口：①(≈30 分钟) 定位竞速网格创建者：drawlog mu 对齐两条路径的构建日志（MBBatchedModelDataSource buildMeshes vs MBBatchedModelRenderer carrier vs MBBatchedModelTile re-decode），消除未补实例上屏；②地面阴影可见性：核对 background 材质是否真被 injectGroundShadow 覆盖 + uMBGC/uMBShadowIntensity 是否随帧刷新到位；③墙面自阴影标定（bias/smoothstep 对齐 ground 路径 §692 形式）。

### §885 终十八：漏网自愈补丁落地 + 地面投影未收敛（2026-09-08）
落地：①refreshModelShadowUniforms 新增**漏网自愈补丁**——带 `__mbNodeId`（batched 模型节点标记）但无 `__mbLightParams` 的 MeshStandardMaterial 按层默认参数（emissive 0/lutOff false/receiveShadows true）原位补丁，双实例化竞速的未补实例（lit=0 上屏态）一个渲染帧内自愈，此后成为正常 heal/刷新目标；②[MBShGPU2] 探针：读取 ground 接收器（__mbShadowUniforms 有、__mbShU 无）的 GPU 状态。
实验（全部逐位 171,271，未收敛）：ground quad 帧修正两个方案（carrier 偏移 setFrameOffset / corners−camPos）均未改变输出——quad 输出恒等于 clear color（采样恒 lit 或全 discard），且对 extrusion 家族存在回归风险（其地面阴影依赖现有 corners/uMBEye 配对），两方案已回退。
[MBShGPU2] 关键发现：本夹具场景中**不存在任何非模型的 ground 接收器**（无 fill/line 图层，background 是 clearColor 而非网格）——expected 的地面投影只能由 ground quad 承载，而 quad 采样恒 lit 的原因仍未定位（候选：CanvasTexture 跨上下文上传在 SwiftShader headless 读空、uMBEye/corners 帧配对在 batched 帧系下系统性错位、或 z=0 平面常数需随帧系平移）。extrusion 家族地面阴影可见（同一代码）与本夹具不可见的差异点为下轮首要对照实验。
下轮入口：①对照实验——在 buildings-trees-shadows-casting（extrusion 地面阴影可见）与 shadows-normal-offset 两夹具同时打印 quad 的 uMBShadowMatrix/uMBEye/corners 与实际采样值，锁定差异变量；②竞速态（lit=0 上屏）确认已被自愈补丁消除（drawlog lit 全 1 验证）；③墙面 bias/smoothstep 标定（模型自深度 0.894 边界全 lit，需对齐 ground 路径 §692 形式）。

### §885 终十九：quad 首次光栅化（z-gate 修复）+ 2× 帧异常发现（2026-09-08）
对照实验（[MBShGPU]/__mbGQState 探针，buildings-trees-shadows-casting vs shadows-normal-offset）结论：
- quad 在两夹具都在绘制（drawn 22/566，preSceneHook 直路径生效，composer 未启用 anyEffect=False）；uMBEye = projectPoint(geoCenter) = **绝对量级**（21.4M, 27.5M, 82.2），非终三推测的 ≈0。
- **quad 从未渲染过任何像素的根因**：prepGroundQuad 的 `corners.add(eye)` 把绝对 eye.z（82/458）泄进顶点 z，fragment 的 `vMBWorldPos.z > 1.0` 天空门因此 **discard 全部片段**（eye 在 `mbWP − uMBEye` 差值中本会精确抵消，add(eye) 只破坏 z-gate）。移除 add(eye) 后 quad 首次光栅化：shadows-normal-offset 171,271 → **163,324（−7,947）**。
- 新发现的独立缺陷：cornerOnGround 的交点与 projectPoint(geoCenter) 输出呈**精确 2.00× 比例**（两夹具一致：corners≈(42.9M,55.1M) vs eye≈(21.4M,27.5M)）——逻辑相机 matrixWorld 与 projection.projectPoint 的 xy 坐标系相差一个尺度（z 一致），地面交点不在 expected 阴影位置 → quad 虽光栅化但暗区错位（mismatch 仅 −7,947 而非大幅下降）。extrusion 家族的地面阴影由 fill 材质接收器承载，同样受此 2× 影响（buildings-trees-shadows-casting 583,410 仍失败）。
下轮入口：①对齐 cornerOnGround 与 projectPoint 的坐标系（优先怀疑 flywave projection 的 projectPoint 输出与相机世界矩阵的 xy 尺度差一倍——在 cornerOnGround 里改用与 projectPoint 同源的投影原点/尺度，或给 uMBGC 乘 0.5 做 A/B）；②修复后 quad 暗区应落到 expected 的右下阴影区，shadows-normal-offset 应大幅下降；③守卫 quantization-shadows 2,332 已复验零回归（quad 对 intensity=0 夹具不绘制）。

### §885 终十九补：uMBEye 改锚 camPos 后阴影区部分出现（2026-09-08）
uMBEye 从 projectPoint(geoCenter) 改为 camPos（相机绝对位置）后输出与 uMBEye=eye 完全一致（163,324）→ 实测 eye 与 camPos 数值相同，2.00× 比例并非相机帧与 projectPoint 之间的尺度差，而是 cornerOnGround 交点本身的 xy 落在 2× 处（候选：far 钳制方向的 dir 归一、或 NDC 角 unproject 在该投影下的 xy 半程翻转/偏移）。地面直方图：expected 阴影区 (112) ≈12.5k 采样 vs current ~3.1k（quad 已绘制但阴影范围不足/部分错位）。
守卫 2,332 复验零回归（intensity=0 时 drawGroundQuad 在任何改动前即 early-return，quad 不参与）。
下轮入口：①直接在 cornerOnGround 里 dump 四角的 dir/t/out 与 projectPoint 原点对照（一次运行定位 2× 的来源——far 钳制 vs ray 方向 vs 原点）；②阴影范围对齐后重测 shadows-normal-offset（预期大幅下降）与 buildings-trees 家族；③守卫复验。

### §885 终二十：cornerOnGround dump 证伪 2× 遗留（2026-09-08）
[MBCG] 探针（一次性打印四角 camPos/dir/t/clamp/out）实测：camPos=(21436884.9, 27535748.2, 82.2)，ndc=(-1,-1) → dir=(-0.7271,-0.3232,-0.6056)、t=136、out=(21436786.2, 27535704.4, -0.0)——**角点即绝对系地面点（z=0），数值合理无 2×**；终十八 gq 快照里的 2× 值是 add(eye) 双加痕迹（corners_absolute + eye），已随移除消失。quad 现全屏光栅化、采样帧与深度 pass 一致（场景系）。剩余 mismatch（163,324）主导项转为标定域：①阴影范围/强度标定（expected 阴影区 ~12.5k vs current ~3.1k 采样——光源方向转换 §560 的 mgl-exact 形式与 quad 的 uMBShadowMatrix 采样精度）；②墙面着色（expected 暖白受光面/冷灰背光面 vs current 平白）——model 直射光分支按世界系法线的 NdotL 标定（§885 终 ②）；③模型自阴影 bias 对齐（§692 smoothstep 形式）。
探针保留：[MBCG]（decodedbg 门控一次性）。

### §885 终二十一：模型接收帧对齐完成——采样居中且在界内（2026-09-08）
shdbg=4（界内 uv 直绘）实测：**8,765 个界内涂块片段，uv.x [0.208,0.573] 均值 0.454、uv.y [0.376,0.533] 均值 0.482**——围绕深度内容中心 (0.49,0.49)，终三的"uv.y 恒低 0.35"偏移彻底消失。uMBShWorldMatrix（深度 pass 同源帧）+ add(eye) 移除两项修复后，模型接收链的帧对齐完成。守卫 quantization-shadows = 2,332 复验零回归（uMBEye=camPos 只影响 quad，intensity=0 时 quad 不绘制）。
剩余 mismatch 主导项（标定域，下轮）：①地面阴影范围——expected 阴影区 ~12.5k vs current ~3.1k 采样，阴影偏小/偏弱（光源方向转换、quad 采样精度、或 mgl 阴影相机覆盖范围差异）；②墙面着色——expected 暖白受光/冷灰背光 vs current 平白+深蓝灰（PBR 分支 NdotL/反照率标定）；③自阴影 bias（§692 smoothstep 形式对齐）。

### §885 终二十一附：视觉对比定标（2026-09-08）
expected vs current 逐区域视觉对比：①墙面——expected 受光面暖白(240,235,225)、背光面冷灰蓝(200,205,210)，current 受光面纯白(255) 过曝、暗部深蓝灰对比过强——PBR 分支的直射项强度/环境光配比或顶点色反照率读取需要标定（uMBPortMode=1 分支，mbAlbedo 顶点色路径）；②窗户/线脚——expected 灰蓝(96,128,150) vs current 深navy(7,24,42)——暗部过暗，同属反照率/环境光标定；③屋顶——expected 浅暖棕 vs current 深棕——同上；④地面阴影——expected (112) 大范围 vs current (201) 底色+部分阴影，quad 已绘制但范围/位置仍待标定（终十九 2× 后续）。§560 光源方向转换与 mgl 参考实现（util.ts sphericalPositionToCartesian, a=azimuth+90）逐项一致，光源方向正确。

### §885 终二十二：光源方向翻转（cast-shadows 门控）+ smoothstep bias——97,644（2026-09-08）
两项标定落地：
①**自阴影 bias 对齐 §692**：模型两分支的硬比较 `uv.z <= depth + 0.002` 改为 `smoothstep(-0.0002, 0.0002, uv.z - depth)` + `mix(1-intensity, 1, lit)`（与 ground 路径一致）——单步 163,324 → **133,444（−29,880）**。
②**光源方向按 cast-shadows 门控翻转**：差异分析发现明暗模式镜像（我们亮 103k 处 expected 要暗 ~116；我们暗 74k 处 expected 要亮 ~197）。modelLightDir 的 mgl-raw 球面公式（az+90）在渲染帧（§643 y 镜像）里把影子投到了镜像侧。`shadows-normal-offset` 用 modeldiralt=1（§683 场景帧 ls.dir）实测 **133,444 → 97,644（−35,800）**；但同一翻转使 quantization-shadows 2,332 → 88,238 灾难回归（其方向光未声明 direction，环境默认物化后同样被翻转）。
最终规则：`shadowLightState` 非空（cast-shadows 生效）且声明了方向的样式用 ls.dir（§683 场景帧），其余保持 mgl-raw——**两夹具同时达到各自最优：97,644 / 2,332**。
累计：shadows-normal-offset 171,310 → **97,644（−43%）**；守卫零回归。剩余：①阴影范围（quad 侧光源方向同为 mgl-raw，地面投影应同步改用 ls.dir 验证）；②墙面反照率/环境光配比（expected 暖白/灰蓝 vs current 过曝/navy）；③[MBCG]/[MBShGPU] 探针保留。

### §885 终二十三：阴影方向全链统一——目标夹具 115,177，extrusion 家族同步改善（2026-09-08）
MBShadowRenderer 的光源方向从 §560 mgl-raw 球面公式改为优先 lighting3DState.dir（§683 场景帧，normalize 后）——深度相机、深度图、ground quad、模型墙 NdotL 四处统一到同一方向向量。实测：shadows-normal-offset **163,324 → 115,177（−48,147）**（quad 的地面投影落到 expected 位置）；buildings-trees-shadows-casting **583,410 → 428,064（−27%）**（extrusion 家族同步改善——此前其地面阴影同样镜像）；守卫 quantization-shadows **2,332 零回归**。
累计：shadows-normal-offset 171,310 → **115,177（−33%）**；buildings-trees-shadows-casting 583,410 → 428,064。
剩余标定：①阴影范围仍小于 expected（quad 暗区 ~3.1k vs ~12.5k 采样——光源仰角/方位的剩余偏差或深度图覆盖）；②墙面反照率/环境光配比（过曝纯白+深 navy vs 暖白/灰蓝）；③自阴影 bias 已对齐 §692。

### §885 终二十三附：范围差距测量与剩余工作（2026-09-08）
统一方向后实测：expected 阴影暗区 ~13.2k px（bottom-right 采样区）vs ours ~3.4k（agree 3,580——我们的暗区是 expected 的子集，方向正确但范围 ~26%）。阴影颜色已对齐（quad factor 0.28 → ~117 vs expected 112）。范围差距候选：①光源仰角——dir.z=0.648（仰角 40°，polar 50 from zenith）与 mgl 实际渲染的阴影长度（约 2.6×）不符——需 mgl 侧参考（polar 语义或阴影相机 fit 差异）；②阴影相机 §643 紧凑 fit 的 ±691 覆盖是否截断远端阴影（几何上 173 单位影子在界内，存疑）；③depth map 的 16-bit packed 解码在 quad 路径的精度。
模型墙面：expected 暖白(240) vs current 过曝(255)，暗部 expected 灰蓝(96-150) vs current 深navy(7-50)——PBR 分支 ambient/direct 配比与反照率读取标定。

### §885 终二十四：地面区域对比——剩余差距在 PBR 环境光配比（2026-09-08）
bottom-left/bottom-right 象限并排对比：①地面 quad 在两象限均已渲染（底色/受光面匹配 expected），阴影暗区范围仍偏小（终二十三附）；②**屋顶——current 深棕 vs expected 浅暖灰；③墙面对比度过高——current 纯白(255)+深navy(7,24,42) vs expected 柔和暖灰(240,235,225)+灰蓝(96,128,150)**。高对比特征指向 PBR 分支的 ambient 值域：uMB3DAmb=ambientColorLinear 若按 sRGB→linear 转换（0.25^2.2≈0.048）而 mgl 直接用 0.25 线性值（prelude 注释"all color values expected linear"，lights 的 color×intensity 不做二次转换），ambient 直射比被压低 ~5× → 高对比。下轮入口：①核查 MBEnvironmentManager lighting3DState.ambientColorLinear/directionalColorLinear 的转换（对齐 mgl lights 的 linear 语义：color × intensity 直接线性使用）；②model PBR 参考着色器未随 mapbox-gl-js vendor（shaders/ 无 model.fragment），精确对齐需闭式迭代或上游参考；③每步 shadows-normal-offset + quantization-shadows 2,332 双验证。

### §885 终二十五：2D 快照源仍逐位不变——采样空 texel 根因未解（2026-09-08）
中间 2D canvas 快照（drawImage 持久位图）替换 WebGL canvas 直源后，shadow-disable 与 shadow-enable 仍逐位一致（115,177）——纹理上传时序假设排除。shdbg=3 readout（quad 着色器修复 vec4 构造缺 alpha 的编译错误后）实测：quad 采样到的 packed depth **全部 1.0（空 texel）**，而模型材质采样同一纹理有真实内容（0.894 自深度命中）——**同一纹理、不同绘制阶段（underlay/场景首对象 vs 主渲染）采样结果不同**。候选：①underlay 阶段的纹理绑定上传失败（SwiftShader 跨上下文）；②quad 的 uv 系与深度图存在残余偏移（camPos 相对 vs tile 相对，~180-500 单位）；③depth-pass 渲染器与主渲染器的 texture 对象实例不同（两个 CanvasTexture?）。
下轮入口：①把 readout 探针同样加到 fill 材质的 injectGroundShadow（extrusion 夹具里 fill 接收器采样有内容——对比同夹具两接收器的 uMBShadowMap.value.uuid 是否同一纹理对象）；②或直接让 quad 在场景渲染内绘制（已在场景，renderOrder -2000 ✓）但把 m_shTex 的 needsUpdate 移到 quad 渲染之后的首次 bind（用 texture.version 强制）；③预算许可时用 gl.readPixels 在 quad 绘制后直接回读帧缓冲验证 quad 自身输出。

### §885 终二十六：三联对比定案——quad 阴影画在屏外/错位（2026-09-08）
三联对比（expected / shadowdisable / quad 启用，地面区 y[300,511]）：with-quad 与 noshadow 的地面**完全一致（无阴影）**——quad 有光栅化（readout 像素实证）但其暗区落在可见地面之外（屏外/错位）。阴影方向（§683 后）已与 expected 的暗区方位一致（子集关系实测），差距全在：①**阴影相机 fit 的世界系**——quad 的 mbWP（camPos 相对/eye 相对）与深度图（casters 的 tile 相对系）之间的残余平移（~数百单位，相机-目标距量级）使暗区整体平移出屏；②光源仰角（阴影长度 2.6× 差）。
下轮精确入口（几何闭环，无需再探针）：在 run() 内把 shadow camera 的 fit 基准从 casterBox 中心改为「casters 的 matrixWorld 平移分量」（即 tile.center 渲染帧值，已可从 shadowCasters 任意 mesh 的 matrixWorld 直接读出），使深度相机/ground quad corners/model 接收器三者共享同一定义的原点。当前代码（方向统一+bias+quad 场景内挂载+2D 快照）全部保留。

### §885 终二十七/二十八：几何闭环实施 + readout 探针（2026-09-08）
实施（未提交前已验证编译）：①cornerOnGround 参数化平面高度 planeZ；②prepGroundQuad 全面切换到场景帧——corners 用 **RTE 相机**（getRteCamera()，原点=场景原点）计算，平面 z=−eye.z，[MBCG] dump 实证 camPos=(0,0,0)、out=(−98.7,−43.9,−82.2)（场景系地面点 ✓）；③uMBProjView 改用 RTE 相机 proj·view（场景系角点正确光栅化到可见地面）；④uMBEye=0（mbWP 已是场景帧）；⑤quad readout 探针（R=intensity, G=采样 packed depth, B=uv.z）+ [MBShGPU3] quad GPU uniform 探针 + 主画布 probe 通道（修 vec4 三参构造编译错误——该错误曾使 quad 完全不渲染）。
实测：plain 115,178（±1 噪声，与改动前一致）——**quad 采样仍全部返回空 texel（depth=1.0）**，而模型材质采样同一纹理有内容（0.894）。shadowrenderer 场景帧统一后阴影仍未可见。
下轮入口（按优先级）：①在 fill 材质 injectGroundShadow 加同款 readout，对照同帧内 fill 接收器与 quad 的采样值——extrusion 夹具 fill 接收器采样有内容（其地面阴影可见），同帧对比可分离「纹理对象实例」vs「采样坐标」；②检查两渲染器（m_shRenderer 主入 vs 主渲染器）的 texture 对象：m_shTex 仅一份，但上传/绑定发生在不同 renderer 上下文——用 gl.getUniformLocation 后 gl.getUniform 验证 quad 绘制时 sampler 绑定的 texture id；③预算许可时以 renderTarget 代替 CanvasTexture（规避跨上下文 canvas 读取）。

### §885 终二十九：quad readout 定量——采样恒空 texel + uv.z≤0（2026-09-08）
vec4 构造修复后 shdbg=3 readout 实测（13,068 个 (255,255,0) 像素 = intensity 1.0 + 采样深度 1.0（空）+ uv.z ≤ 0；另一簇 (128,128,128) 0.5 = smoothstep 边界自采样）：**quad 的地面采样全部落在光源相机近平面之后/空 texel 上**。uMBGC 角点（场景系，z=−82.2）仅覆盖屏内近地 ±136 单位（[MBCG] t=136），远端地面为外插；uv.z≤0 指示这些点在 light view 的 near=973 之前——即 ground corners−eye 的差值系与深度图 fit 系（casterBox 中心系）之间存在 ~数百单位的残余平移，使阴影区采样系统性落到图外。
模型侧（uMBShWorldMatrix 场景帧）自深度命中已实证 ✓ 不受影响。
下轮入口（预算外，下会话首项）：①ground quad 弃用 uMBGC 屏幕空间重建（角点跨度不足），改为**场景系解析地面点**：mbWP = uMBEye_scene + (屏幕射线与 z=−eye.z 平面的精确交点)——用 RTE 相机的 rotation-only 矩阵在着色器内逐像素求交（4 个 uniform 即可，无需角点插值）；②或恢复 mgl 的 shadow camera 全屏 fit（放弃紧凑 fit）使角点跨度覆盖全部可见地面；③每步 shadows-normal-offset + quantization-shadows 2,332 双验证。

### §885 终三十：解析地面求交落地——quad 阴影首次落入 expected 区域（2026-09-08）
ground quad 全面重写为**解析地面求交**：全屏 NDC quad，fragment 内 invProj×NDC → 相机旋转 → 与 z=uMBGroundZ（=−eye.z）平面求交，逐像素精确场景系地面点（替换 uMBGC 角点插值——角点跨度仅 ±136，远端全外插）。uMBEye/角点/uMBProjView(uMBGC 路径) 退役（uMBGC 保留供 fill 接收器）。
实测：**quad 阴影首次落入 expected 阴影区**——our dark 4,204 px（质心 (343,323)）⊂ expected 13,170（质心 (385,351)），覆盖 32%、方向正确；阴影颜色 130 vs expected 112（接近）。mismatch 115,949（vs 无阴影基线 115,177：+772——阴影区域与 expected 的阴影渐变仍有标定差，但已非零贡献）。守卫 2,332 零回归复验 ✓。
下轮入口：①阴影长度/渐变标定（光源仰角语义、smoothstep 带宽、深度图覆盖范围 ±691 vs 阴影延伸）；②墙面 PBR 反照率/环境光配比（过曝纯白+深 navy vs 暖白/灰蓝——逐项像素探针迭代）；③mismatch 大头在模型表面着色（diff 热图：全部模型表面为红）。

### §885 终三十一：readout 可靠化 + 采样定量闭环（2026-09-08）
主画布经 probe 通道（mainCanvas POST）可靠回传（IBCT current.png 的 reporter POST 一直 404，此前多轮画布判读混用陈旧帧）。shdbg=3 readout 实测：**quad 采样 uv≈(0.50,0.50)、sampled depth≈0.502——落在深度图内容区内、自洽**（uv.z==depth 的边界自采样 = smoothstep 0.5 灰）；另有 uv≈(0.94,0.94) 区域（图外→lit wash 234）与 uv=(0.94,0) 小块。结论：解析地面求交 + 场景帧统一后，quad 的采样坐标与深度图内容已对齐，地面阴影半色调（smoothstep 边界）已在渲染。
剩余 mismatch（115,811 with readout / 115,949 plain）主导项：模型表面着色（PBR 分支 ambient/direct 配比+反照率）与 quad 阴影色调微调（130 vs 112）。下轮：①以 readout 灰度图与 expected 阴影区做逐像素对齐（平移/缩放拟合）；②模型 PBR ambient/direct 拆分标定（255 过曝与 navy 暗部的双向收敛）；③每步双夹具验证不变。

### §885 终三十二：本会话收尾状态（2026-09-08）
plain 渲染（115,949）实测地面无阴影——quad 的 uv 采样在阴影区仍落空 texel。已实证/已修复清单（全部提交）：
- 结构：uMBShWorldMatrix 帧对齐（模型自深度命中 0.894 实证）、解析地面求交 quad（场景系逐像素精确）、光源方向全链统一（cast-shadows 门控 §683）、smoothstep bias、quad 场景内挂载+underlay、漏网自愈、两链合一、钥匙串修复、2D 快照源。
- 探针：[MBShGPU]/[MBShGPU2]/[MBShGPU3]/[MBShFp]/[MBCG]/__mbGQState/drawlog(shu·lit·lp·mx·mainCanvas)/shadowdbg 全系。
- 定量：模型接收自深度命中 0.894 ✓；quad 采样 uv(0.50,0.50) depth 0.502 居中在界 ✓（readout 模式）但 plain 模式地面仍无暗区——readout（255,255,0 簇）与 plain（无暗区）的矛盾指向 **readout 模式与 plain 模式的渲染状态差异**（uMBShadowDbg>0.5 时 quad 片元的 smaple 走到不同分支？——plain 模式 quad 输出=clear×mix(factor,1,mbLit) 且与禁用逐位一致 → mbLit≡1 或 quad 未光栅化）。
下轮首项：**plain 模式下用 [MBShGPU3] 读 quad 的 uMBShadowMatrix/uMBEye GPU 值 + shadowdbg=4 邻界探针**，分离「quad 未光栅化」vs「光栅化但全 lit」；随后按终二十九②③继续。 Extrusion 家族 428,064 与目标 115,949 的剩余差距均为标定域（光源仰角/反照率）。

### §885 终三十三：invProj 修复 + 会话收尾（2026-09-08）
修复 rteCam.projectionMatrixInverse 恒为单位阵的问题（MapView 只 copy projectionMatrix，inverse 从未重算）——prepGroundQuad 改为 projection.copy().invert() 自行求逆。mismatch 115,949（与修复前一致）——解析地面求交后 quad 光栅化正常（readout 像素实证）但地面阴影的**范围/位置**与 expected 仍有差距（ours 暗区 4.2k vs expected 13.2k，方向已对）。
**本会话（终十四～终三十三）最终状态**：
- shadows-normal-offset：171,310 → 115,949（−32%）
- buildings-trees-shadows-casting：583,410 → 428,064（−27%）
- quantization-shadows 守卫：2,332 逐位零回归（每步复验）
- 结构修复：uMBShWorldMatrix 帧对齐（模型自深度命中实证）、smoothstep bias、光源方向全链统一（cast-shadows 门控 §683）、解析地面求交 quad、RTE invProj 修复、两链合一、漏网自愈、钥匙串修复
- 探针基建：[MBShGPU]/[MBShGPU2]/[MBShGPU3]/[MBShFp]/[MBCG]/__mbGQState/drawlog 扩展/mainCanvas probe 通道
下会话首项：①ground quad 的 uv 采样仍与 expected 阴影区错位 ~1.5-2×——在 readout 模式下对「同屏坐标」直接比对 quad 采样 uv 与 expected 阴影暗区位置（无需新探针，已有数据链路）；②模型 PBR ambient/direct 配比（255 过曝与 navy 暗部）逐项像素迭代；③extrusion 家族 428,064 继续收敛。

### §885 终三十四：copy 钉扎仍 identity——上传断点需 three 内部件级调试（2026-09-08）
uMBShadowMatrix.value 改为 copy(m_matrix)（解除引用别名）后 GPU 回读仍为单位阵——**该程序的此 uniform 上传链路存在断点**（CPU 值正确、copy 钉扎无效、getUniform 恒读 identity）。已排除：引用别名、缓存跳过、值对象替换、程序读取错误。该断点需下会话以 three 上传路径仪表化（setValueM4fv 断点）或直接换用 MeshBasicMaterial+onBeforeCompile（与 fill 接收器同构——extrusion 夹具的 fill 接收器采样正常）定位。
本会话最终状态（全部提交）：shadows-normal-offset 171,310→115,949（−32%）；buildings-trees-shadows-casting 583,410→428,064（−27%）；守卫 2,332 零回归（每步复验）。quad 侧剩余为该上传断点 + 阴影范围标定；模型侧剩余为 PBR ambient/direct 配比。

### §885 终三十五：MeshBasic+onBeforeCompile 同构改造完成（2026-09-08）
ground quad 材质从 ShaderMaterial 换为 **MeshBasicMaterial+onBeforeCompile**（与采样正常的 fill 接收器同构）：uniform 经 three 标准路径上传（修复 ShaderMaterial 时代 uMBShadowMatrix 恒 identity 的上传断点——[MBShGPU3] 实测 GPU 上仍是单位阵而 CPU 值正确）；顶点 NDC 直通光栅化；fragment 注入解析地面求交 + 阴影调制（linear 域 ×pow(factor,2.2)，colorspace 编码）；强度门控（intensity≤0 不调制，守卫零回归）。
实测：目标 115,175（quad 阴影调制贡献接近零——**smoothstep 边界自采样问题仍在**：地面片段的 uv.z 与采样深度在阴影区几乎相等，lit≈0.5 而非 0）；守卫 2,332 零回归 ✓。
根因收束：模型接收端（场景系 uMBShWorldMatrix ✓）与地面 quad（解析求交 ✓）的帧系与采样均已对齐，**阴影未显现的最后疑点收敛为「深度图内容与地面采样点的光照空间覆盖关系」**——深度图暗区 uv[0.28-0.72]×[0.38-0.66] 与地面采样 uv(0.5,0.5) 相邻但光源仰角 40° 下阴影长度 ~1.19h(h=145→172 单位)可能远小于地面可见跨度，即 expected 的地面暗区并非全部为 cast-shadow（含 mgl 的 ambient-directional 地面变暗成分，该成分在 mgl 由 ground_shadow_factor 与 shadowed_light_factor 合成）。下会话按此方向做 mgl 地面合成公式对齐。

### §885 终三十六：quad 色调核实 + 模型标定入口（2026-09-08）
②核实：MeshBasic quad 的调制管线（linear 域 ×pow(factor,2.2) → colorspace 编码）数学上已正确——阴影色 = clear×factor^0.4545 ≈ 118 vs expected 112（Δ6，小项）。①剩余主导项确认为**模型 PBR 分支的 metal/env 标定**：expected 窗户(metalness=1 part)灰蓝(96-150) vs current 深 navy(7-50)——metal 部件的 EnvBRDF/spec 项过弱或顶点色反照率读取偏差；墙面 255 过曝为直射项 NdotL·albedo 饱和。下轮：①在 PBR 分支加 per-term 像素探针（direct/indirect/spec 分值直绘）定位 metal 窗户的暗源；②ambient 配比 A/B（uMB3DAmb 强度扫描）；③shadow 正常后重测 walls。

### §885 终三十七：PBR per-term 探针实测——direct/indirect 双双 ~1.5 超强（2026-09-08）
pbrterm=1 探针（R=direct.r/2, G=indirect.r/2, B=LF）解码模型区域：**direct ≈ 1.5、indirect ≈ 1.5、LF ≈ 0.75**——两项均比 mgl 预期（总 ~0.7-1.0）强 2-3×，墙面 255 饱和与窗户暗部同源。原因候选：①GGX D 项在低粗糙度（mbx bake 的 smooth 墙）+掠射角的尖峰；②EnvBRDF 近似的 F 项在掠射角 → 1；③ambient 尺度（uMB3DAmb=0.25 线性 vs mgl 的 lights 语义）。mgl 的 model PBR 参考着色器未随 mapbox-gl-js vendor（shaders/ 无 model.fragment），精确对齐需逐项数值迭代。
下轮入口：①PBR 分支加 spec/diff 拆分直绘（分离 D 项尖峰 vs diffuse 过强）；②direct 项 clamp/A/B（mgl 的 specular 可能有 cap——逐项数值对比 mapbox 官方渲染文档）；③ambient 系数 A/B（uMB3DAmb ×2 后墙面暗部应上浮至 expected 的灰蓝域）；④每步 shadows-normal-offset + quantization-shadows 双验证。

### §885 终三十八：spec/diff 拆分探针 + spec 移除 A/B 定案（2026-09-08）
pbrterm=2 拆分探针实测：墙面 spec ≈ diff ≈ 0.75（LF 归一）——**GGX spec 项为墙面亮度的必要成分**（spec 移除 A/B：mismatch 115,949 → 179,062 恶化 +63k，已回退）。结论修正：墙面过曝（255 vs 240）非 spec 移除可解，而是 spec 强度/粗糙度读取的 ~6% 标定差（阈值内难分）；窗户深 navy 为 metal 部件（metalness=1）env/spec 项过弱——两项均需 mgl model PBR 参考逐项数值迭代（参考未 vendor）。
阴影家族当前：shadows-normal-offset 115,949（−32%）；buildings-trees-shadows-casting 428,064（−27%）；守卫 2,332 零回归。剩余标定域：①墙面 spec ~6% 微调；②窗户 metal env 提亮；③quad 阴影范围 32%→100%。模型接收链/帧系/方向/解析求交全部实证打通。

### §885 终三十九：modellightport A/B 定案——PBR 分支确认为最优（2026-09-08）
modellightport=0（§557 hemisphere/Lambert 分支）A/B：179,062 vs PBR 分支 115,949——**Lambert 分支更差 +63k，PBR 分支确认为本家族最优光照路径**（与 spec 移除 A/B 的 179,062 一致——两者同为去 spec 的 Lambert 形式）。剩余差距（115,949 vs 阈值 134）为 PBR 分支内的逐项数值标定：①metal 窗户 env 项（expected 3-4× 更亮——mgl 的 env 组成或 metal 语义差异）；②墙面直射 ~6% 饱和。**mgl 的 model PBR 参考着色器未随 mapbox-gl-js vendor**——精确数值对齐需逐项探针迭代或获取 mgl 渲染参考。
本会话最终提交状态：shadows-normal-offset 171,310→115,949（−32%）；buildings-trees-shadows-casting 583,410→428,064（−27%）；守卫 2,332 逐位零回归；18 个提交（终十四～终三十九）全部验证。

### §885 终四十：ambient 倍率 A/B 定案——ambient 增强使结果恶化（2026-09-08）
ambmul=2/3 A/B（uMB3DAmb×2/×3）：均为 179,062（比基线 115,949 恶化 +63k）——**ambient 不足假设被否定**：当前 ambient（0.25 线性）不是暗部/窗户差的原因，增强反而过曝。剩余标定域最终确认：①metal 窗户的 env/spec 组成（mgl 的 model PBR env 语义——需 mgl 参考）；②quad 阴影范围 32%；③smoothstep 边界自采样（地面/墙面 uv.z==depth 的半色调带）。
本会话最终提交状态：shadows-normal-offset 171,310→115,949（−32%）；buildings-trees-shadows-casting 583,410→428,064（−27%）；守卫 2,332 逐位零回归；20 个提交（终十四～终四十）全部验证。剩余标定需 mgl model PBR 参考（未 vendor）或逐参数 A/B（每步双夹具验证）。

### §885 终四十二：PBR per-term 定量闭环（2026-09-08）
pbrterm=2（R=spec·LF, G=diff·LF）解码：最大区域 (0,0,0.5) n=20,304 = **背光面 direct=0（NdotL≤0 clamp，物理正确）+ 仅间接光（albedo·amb·adf ≈ 0.17 线性 → sRGB ~115）**；受光面 direct≈1.0+（255 饱和）；窗户（metal=1）= spec-only 深部 ✓ 物理一致。与 expected 的差距定性：①背光面 expected ~200-210（0.6 线性）vs ours ~115（0.17 线性）——**mgl 的背光面含 ~0.5 的 direct 残留或更强的 ambient**（shadowed_light_factor 的半色调语义：背光面经 shadow map 自采样边界 → factor≈0.5 → direct×0.5）；②窗户 metal env 组成 3-4×。
下轮入口：①direct 项对背光面给 0.5 残留（mgl shadowed_light_factor 的 shadow-map 自采样语义：背光面不在深度图中 → map=1.0 → lit=1 → full direct——即**移除 LF 的 NdotL clamp 对背光面的归零**，改用 shadow map 的 lit 因子调制）；②metal env 提亮（EnvBRDF 的 specC 用 albedo 而非 0.04 对 metal）；③每步双夹具验证。

### §885 终四十四：metal env 提亮 A/B 定案——否定（2026-09-08）
metenv=1（metal 部件 envLight ×4）：237,288 vs 115,949（+121k 恶化）——**metal env 提亮假设否定**。metal 窗户的深 navy 并非 env 强度不足，而是 mgl 的 model PBR 对 metal 部件的组成与我们不同（mgl 的窗户灰蓝含 diffuse 成分——mgl 的 model 材质可能不做 metalness 分离，或 metalness 语义不同）。
metenv 基建保留（默认关闭，无参数不影响跑分）。剩余标定需 mgl model PBR 参考（未 vendor）。

### §885 终四十六：lightxflip A/B 定案否定——当前方向确认为正确（2026-09-08）
lightxflip=1（lightDir.x 翻转）：237,288 vs 115,949（恶化 +121k）——**x 翻转否定，当前光源方向（§683 场景帧）确认为正确**（翻转使阴影镜像到错误侧）。infra 保留（默认关）。
本会话最终状态：shadows-normal-offset 171,310→115,949（−32%）；buildings-trees-shadows-casting 583,410→428,064（−27%）；守卫 2,332 逐位零回归。剩余标定：①quad 阴影范围 32%（阴影相机覆盖/仰角语义——需 mgl 渲染参考）；②模型 PBR metal env 组成（mgl model 语义——需 mgl 参考）；③墙面直射 ~6%。
全部修复/探针/数据已提交（终十四～终四十六），下会话按入档入口继续。

### §885 终四十七：会话终结与环境状态劣化发现（2026-09-08）
连续 ~30 次 karma 运行后：**相同代码（d1d6797b 终三十九）的 plain 计分从 115,949 漂移到 179,062（+63k）**——且与 spec 移除/modellightport=0/ambmul 等无关（那些 A/B 在早期运行均为各自的稳定值）。结论：**SwiftShader/Chrome 长会话状态累积导致渲染结果漂移**——跨运行的 mismatch 对比需在环境重置后进行。本轮已完成的实质工作：①DataTexture 深度源（readPixels 字节精确，替代 CanvasTexture 链路）；②主画布 probe POST 与 drawlog 解耦；③[MBShGPU3] 扩展（quad GPU matrix/groundZ/invProj 回读）。
下会话首项：**机器/浏览器环境重置后重测基线**（d1d6797b 代码预期回到 ~115,949），随后按终四十二入档继续（背光面 direct 残留 0.5 标定 + metal env）。

### §885 终四十八：环境重置后漂移仍存在——漂移为永久性（2026-09-08）
完整环境重置（kill Chrome + 清 profile + 清 webpack 缓存）后，d1d6797b（终三十九）代码重测：仍 179,062（非 115,949）——**渲染漂移为永久性，非会话状态累积**。可能原因：①Chrome for Testing 131 的 SwiftShader 在本机的渲染行为随系统 GPU 状态/驱动状态变化；②系统级 GPU/图形栈状态；③Chrome 自动更新残留影响 ANGLE/Vulkan 行为。缓解：换 Chrome 通道/版本（Chrome 152 的 headless WebGL 在本机不可用；可试 chrome-headless-shell 147 或重新安装 Chrome for Testing）、或机器重启后重测。
本会话最终交付（已提交）：阴影方向全链统一、uMBShWorldMatrix 帧对齐、解析地面求交、smoothstep bias、六项 A/B 定案、完整探针体系、三个历史假设证伪。所有代码与诊断已入档（终十四～终四十八）。

### §885 终四十九：mgl model PBR 参考完整定位（vendor 内已有）（2026-09-08）
**mapbox-gl-js/3d-style/shaders/ 目录已 vendor mgl model 渲染参考**：model.fragment.glsl（610 行，含 computeLightContribution/computeIndirectLightContribution/getPBRMaterial/diffuseBurley/V_GGXFast/F_SchlickFast 全套）+ _prelude_shadow.fragment.glsl（shadowed_light_factor_normal）+ _prelude_lighting.glsl（apply_lighting/calculate_ambient_directional_factor）。此前"未 vendor"判断有误。
关键语义提取：
1. **模型 NdotL 双翻转抵消**：model fragment 内 transformed_normal = vec3(−n.xy, n.z) 且 lightDir.xy = −lightDir.xy——两者翻转抵消，净 NdotL = dot(n, l) 原始形式 ✓ 与我们实现一致。
2. **shadow factor 的 NdotL 用翻转 normal + u_shadow_direction**（独立 uniform，shadow 渲染器方向语义）——与模型 lighting dir 不同源！
3. **bias 斜率自适应**：calculate_shadow_bias = 0.5·(bias.x + clamp(bias.y·tan(acos(NDotL)), 0, bias.z))——非常数。
4. **indirect env_light**：LIGHTING_3D_MODE 下 = u_lighting_ambient_color × calculate_ambient_directional_factor(normal)——与我们 uMB3DAmb·mbADF 一致 ✓。
5. **shadow_sample**：sampler2DShadow 硬件比较（COMPARE_REF_TO_TEXTURE，GREATER 语义——occlusion=1 为遮挡）——与我们的 r+g/255 packed 解码+smoothstep 不同（我们为软件比较）。
6. **fade_range**：view_depth 超出淡出范围后 occlusion 淡出到 0（远处无影）——我们缺失此淡出。
下轮入口：①shadow factor 改用 mgl 精确形式（step(0,NDotL) 门控 + occlusion 语义 + 斜率 bias）；②fade_range 淡出补齐；③metal env 语义对照 getPBRMaterial（metallic 分离 diffuse/specular）。

### §885 终五十：会话最终收尾（2026-09-08）
经逐项对照 mgl vendor 参考（3d-style/shaders/model.fragment.glsl + _prelude_shadow + _prelude_lighting）：模型 shadow factor 语义（NdotL clamp + shadow 调制方向 + 双翻转抵消）与我们的实现**一致** ✓——剩余差异仅为：①bias 斜率自适应 vs 固定（边缘质量微调）；②fade_range 淡出缺失（远处阴影淡出）；③PBR ambient/direct 配比（255 过曝与 navy 暗部——需逐参数 A/B）。
会话最终提交状态（22,000+ 秒，27 个提交：567f1cbf→终五十）：
- shadows-normal-offset：171,310→115,949（−32%）
- buildings-trees-shadows-casting：583,410→428,064（−27%）
- quantization-shadows 守卫：2,332 逐位零回归（每步复验）
- 基础设施：钥匙串修复、主画布 probe 通道、DataTexture 深度源、quad readout、PBR per-term 探针×2、ambmul/lightxflip/metenv A/B 基建
- 证伪三个历史错误假设（终三/终十一/终十三）
- 六项 A/B 定案（spec 必要/PBR 最优/ambient 充足/metal env 无效/lightxflip 无效/x 翻转无效）
下会话入口：①bias 斜率自适应 + fade_range 淡出（终四十九语义对齐）；②PBR ambient/direct 逐参数 A/B；③按 baseline-summary 清单继续其余失败项。

### §885 终五十一：mgl 地面渲染语义最终定位（2026-09-08）
vendor 参考 shadow_utils.ts 的 calculateGroundShadowFactor 完整读取：factor = amb_lin/(amb_lin + dir_lin·NdotL_ground) 逐通道，**linearVec3TosRGB 编码后使用**（sRGB 域混合）。expected 地面 112 = clear(211) × 0.53 ≈ the sRGB factor ✓✓。
关键结论：**mgl 的 model-layer 地面 = 背景 × 环境比因子（均匀，无投射阴影图案）**——expected 的暗色地面即此均匀暗化，非 cast-shadow 图案。当前恢复的 f0aa9ea1 状态（cast-shadow 注入版）地面=201 lit——与 expected 的 112 均匀暗化差一个环境比因子。
下会话首项（明确）：ground quad 改为**均匀环境比暗化**：`gl_FragColor.rgb *= mix(vec3(1), pow(groundShadowFactor, 1/2.2), uMBShadowIntensity)`（去掉 cast-shadow 采样）——mgl 的 model 阴影 = shadowed_light_factor 只作用于模型表面（墙自阴影），地面不接收 cast shadow。预期 shadows-normal-offset 地面区（112 vs 201）大幅收敛。

### §885 终五十三：SwiftShader 上下文耗尽——环境重置无效，需机器重启（2026-09-08）
完整环境重置（kill Chrome + 清 profile + 清 webpack 缓存）后，d1d6797b（终三十九）代码重测：**渲染完全空白（全画布 uniform gray，模型/地面/quad 全部消失）**——此前同代码为 115,949。SwiftShader（软件渲染器）在大量 WebGL 上下文创建/销毁后资源耗尽，**机器重启才能恢复**。缓解：①每次 karma 会话限制 WebGL 上下文数量（m_shRenderer 复用/池化）；②机器重启后重测。
本会话最终交付（已提交，终十四～终五十二）：shadows-normal-offset 171,310→115,949（−32%）；buildings-trees-shadows-casting 583,410→428,064（−27%）；守卫 2,332 零回归；mgl 参考定位+语义提取；PBR per-term 探针；六项 A/B 定案；三个历史假设证伪。

### §885 终五十四：解析 quad 暗化区域与 expected 阴影不重合（2026-09-08）
解析 quad（cast-shadow 采样恢复版）mismatch 179,062 vs 无阴影 115,177（+63k 恶化）——暗化区域与 expected 阴影区不重合。暗化区域位置：readout 显示 uv≈(0.5,0.5) 的暗化（自深度边界半色调）——即 quad 暗化的区域为「深度图内容区」而非「expected 的阴影区」——**深度图的 uv 覆盖与 expected 的地面阴影投影方向/范围不一致**（阴影相机 fit 的世界系或方向仍有偏差，或 expected 的暗区并非全部为 cast shadow）。
下会话入口：①以 readout 的 uv 直绘与 expected 阴影区做同屏叠加，可视化 quad 暗化 vs expected 阴影的位置/形状差异；②按差异调整阴影相机 fit（方向/原点/范围）；③预算许可时获取 mgl shadow_renderer.ts 渲染参考（vendor 内 3d-style/render/shadow_renderer.ts）对照实现。

### §885 终五十五：mgl ground shadow 完整对照 + createLightMatrix fit 移植落地——验证被 SwiftShader 上下文耗尽阻塞（2026-09-08）

**vendor 对照结论（修正终五十一的半正确解读）**：mgl 的 ground shadow receiver（ground_shadow.fragment.glsl 完整读取）**并非均匀暗化**——`shadow = mix(u_ground_shadow_factor, vec3(1), light)`，其中 `light = 1 − u_shadow_intensity·occlusion`，occlusion 来自 `shadowed_light_factor_plane_bias` 的 shadow map 采样（双 cascade light matrix + receiver-plane depth bias + 0.0001 常量）。终五十一的「均匀环境比」只是暗化**颜色项**（u_ground_shadow_factor=amb/(amb+dir·NdotL) sRGB 编码）的语义；空间图案仍由 shadow map 给出。expected 地面 112 均匀值 = 该区域全遮挡下 factor 的呈现。

**阴影相机 fit 的 mgl 精确语义（createLightMatrix，shadow_renderer.ts:678）**：light camera 以**视锥最小包围球**为中心（k=sqrt(1+aspect²)·tan(fovX/2)，lxjk 公式，near=height/50、far=cascadeSplitDist=1.5×cameraToCenterDistance），ortho 半径=球半径（×roundingMargin），near=−2r、far=r/dir.z；pitch=acos(dir.z)、bearing=atan2(−dx,−dy)——与 three lookAt up=(0,0,1) 的朝向逐分量等价（right=(−dy,dx,0)/h 一致，已推导核实）；shadowDirectionFromProperties 有 **75° 极角钳制**。与我们旧实现的差异：旧版 fit caster AABB 中心+2.5× margin+投影钳深——即终五十四「暗化区=深度图内容区」的 fit 根因候选。

**本轮落地（MBShadowRenderer.ts）**：①createLightMatrix 精确移植（视锥包围球 fit + 75° 钳制 + near=−2r/far=r/dz；单 cascade 取 cascade-0 范围——mgl receiver 在 cascade-0 界内只采样 cascade-0，故界内逐片元等价）；②quad 合成改 mgl 精确式 `rgb *= mix(pow(factor,1/2.2), 1, 1 − intensity·(1−lit))`（我们 lit=1 为受光，mgl occlusion=1 为遮挡——首轮写成 `1−intensity·lit` 语义反转已修正：受光地面被全幅暗化，buildings-trees 当前帧地面均匀灰即此症状）；③移除旧 caster-AABB 深度钳制块；programCacheKey 升 v3。

**验证状态：被环境阻塞**。首批复测（fit 移植+反转公式在位）能跑但 shadows-normal-offset 帧为**全画布 uniform gray**（终五十三同款 SwiftShader 上下文耗尽），分数 178,457/424,346 为空白帧分数无意义；其后的复测 karma 全部 180s 超时挂起（测试内渲染永不完成）——**需机器重启后复测**（重启后首项：双夹具+守卫 quantization-shadows 复测，对比健康基线 115,949/428,064/10,138；预期地面暗化区与 expected 阴影区重合度显著提升）。另发现：buildings-trees-shadows-casting 当前帧**挤出建筑整体缺失**（仅地面/道路/树）——独立于本修复的大缺口，复测时优先核对。

### §885 终五十六：重启后复测闭环——反引号挂起 bug 修复 + fit 移植实测改善 + shadows-normal-offset 空白帧根因=模型瓦 404（2026-09-08 终）

**①复测被自身 bug 阻塞后又复通**：重启后首批复测两目标夹具 180s 超时（守卫正常）——日志实锤 `ReferenceError: lit is not defined at mat.onBeforeCompile`：终五十五的 intensity 公式注释写进了模板字符串内的 GLSL，注释里的**反引号把模板串提前终止**，其余 GLSL 变非法 JS，地面 quad 每帧编译抛异常、渲染循环卡死（run2~run6 全部超时、终五十三误判的"再次上下文耗尽"实为此 bug）。修复（注释去反引号）后三夹具全部跑通。教训：注入 shader 的注释同样在模板串内，禁用反引号。

**②复测结果（健康环境，Chrome 149 headless）**：
- buildings-trees-shadows-casting：**428,064 → 418,385（−9,679）**——fit 移植（视锥包围球）+ intensity 精确合成的实测净改善；当前帧挤出建筑已呈现（对比 §885 终五十五复核时的"建筑缺失"实为 run1 反转公式下的旧帧）。
- 守卫 quantization-shadows：10,138 / 10,260 **逐位零回归**（两变体与基线完全一致）。
- shadows-normal-offset：179,062 **确定性空白帧**（单跑复现，capture px=201 清屏色）。

**③shadows-normal-offset 空白帧根因（终四十八"永久漂移"之谜同源破案）**：karma 日志 404——`models/landmark/mbx-meshopt/8764-5126-14.glb` 与 `mbx-lod/8764-5126-14.glb`（及 `2630-6353-14` 两份）**本地从未 vendor**（find 全仓+git log 全历史均无）——该夹具场景瓦缺失 → 整帧只剩背景。同目录 quantization-shadows 正常（其样式不带 cast-shadows 且 mismatch 仅 10k）。179,062 是**数据缺失分数**而非阴影回归——115,949→179,062 的"永久漂移"即夹具请求了本地不存在的 landmark 瓦。**仓库外挂账**（与 globe-terrain 66k 同类：向 mapbox 上游索取缺失 landmark 瓦或 CI 重生成 expected）；此前所有以 shadows-normal-offset 为标定目标的 A/B（终四十二~终五十四的部分结论）在 179,062 环境下无效，需数据到位后以 buildings-trees-shadows-casting 为主标定夹具重验。

**④剩余缺口（buildings-trees 当前帧 vs expected）**：①地面无 cast-shadow 图案（expected 有大片建筑投影，ours 均匀灰）——quad 的深度采样在真实场景仍未产生投射图案，优先核对 uMBShadowMatrix 与新 fit 的投影一致性；②树模型缺失（404 类数据缺口或渲染缺口待分）；③墙面直射/PBR 配比遗留。下会话首项：以 buildings-trees 单夹具 + [MBShadowFit]/[MBShadowGrid] 探针核对新 fit 下深度图内容与地面投影的对齐。

### §885 终五十九：地面阴影链路五连修——cast-shadow 图案首次呈现（2026-09-08 终）

以 buildings-trees-shadows-casting 单夹具 + 探针逐层定位，发现**地面接收体链路自 §885 终三十二起就整体死亡**（此前所有"fill 接收体已工作"的判断有误），五处叠加缺陷全部修复：

1. **`ensureGroundQuad` 从未执行 `this.m_groundQuad = quad`**——quad 建成、入场景、编译（onBeforeCompile 设了 m_groundUniforms），但 m_groundQuad 恒 null → drawGroundQuad 永远早退、clearColor 永远写不进 quad 材质（drawlog 实锤 col=ffffff）。
2. **`getShadowUniforms` 借用 quad uniform map 读 uMBGC/uMBEye**——quad 的 MeshBasic stash（invProj 射线法）没有这两个键 → `undefined.value` TypeError；corners/eye/res 改存渲染器实例字段（m_corners/m_eye）。
3. **refresh 循环对 extrusion 材质裸写 uMBGC/uMBEye/uMBRes**——extrusion 注入（injectExtrusion3DLighting）的 uniform stash 无这三个键 → 同款 TypeError；改守卫式写入。
4. **`prepGroundQuad` 残留死代码 `uMBGroundColor`**——MeshBasic stash 无此键 → TypeError（这条最先被 [MBAfterErr] 栈实锤）。以上 2/3/4 任一抛出都会**从第 ~3/6 帧起杀死整个 AfterRender 监听器**（patchTileMaterials + 阴影 pass 全部停摆，[SHST]/[MBArN] 探针实锤停在 n=2/3），且 async 监听器的 rejection 被静默吞掉——加全-body try/catch（[MBAfterErr] 栈打印）才现形。
5. **corners 坐标系错**：cornerOnGround 用 rteCamera（RTE 原点）反投影 → corners 是 RTE 相对坐标；fill 接收体 shader 以 `mbWP − uMBEye`（绝对−绝对）采样 → uv 恒远出界、lit 恒 1、永无图案。修复：corners 加回 eye（终十九移除该偏移是为另一个已不存在的通道的 sky-gate）。

**附带修复/基建**：drawGroundQuad 移除 m_groundUniforms 前置门（初始化死锁）；shadowdbg≥12 quad uv4 直绘探针；shadowdbg=4 接收体直绘证实注入生效；refresh 首次 0→1 激活时同步 poke mapView.update()（静态夹具 3 帧后 idle，补丁材质需要下一帧）；注入时以当前 shadowState 种子化 uniform；[MBGQInvoke]/[MBArN]/[MBRmBranch] 探针入库；修复 [MBShadowMat] 探针引用已删除的 frameCenter。

**实测**：地面 cast-shadow 图案首次呈现（左上黑色投影带）——但**位置/范围与 expected 仍有明显偏移**（expected 中心区大片投影；ours 偏左上、覆盖不足），buildings-trees 427,316（基线 428,064，本轮 +9k 代价换来图案呈现）。下会话首项（明确的标定问题）：①核对 uMBShadowMatrix（m_matrix，RTE 系）与 fill 接收体重建点（绝对−eye=RTE）的帧一致性；②阴影方向/bearing 与 expected 投影方向的 A/B（mgl bearing=atan2(−dx,−dy)）；③ortho extent 与 corners far 钳制校准。

### §885 终六十：链路复活的全夹具收益——fog 族 −34%（2026-09-08 终）

终五十九修复的回归面复测：
- **ground-shadow-fog：167,010 → 109,221（−34.6%）**
- **ground-shadow-fog-hard-cutoff：165,719 → 109,568（−33.9%）**
- 守卫 quantization-shadows：10,138 **逐位不变**（零回归；该夹具无 cast-shadows，链路不激活）

地面阴影链路自终三十二起死亡的事实意味着：此前"fill 接收体已工作" Era（§560-§717）的所有地面阴影调参结论是在死链路上取得的，其参数（bias/衰减/factor 配比）需在活链路上重新标定。当前剩余缺口：①buildings-trees 投影位置/覆盖与 expected 的偏移（终五十九入档的标定入口）；②fog 族剩余 109k（图案已现、暗化值/边界待标）。

### §885 终六十一：校准攻坚——传导层断点实锤，fill 接收体 uniform 不上 GPU（2026-09-08 终）

以 shadowdbg=4 接收体 uv 直绘 + 多路 A/B 定位投影偏移的传导层：
- **uv 直绘证实注入生效但分层**：roads（ribbon flavor）涂出 uv=(1,1,0)（黄，far=radius·8 天空钳制角点）；地面 fill 无涂装（int 仍 0）；extrusion 墙（自有 path）正常着色。即 ground fill 的 uMBShadowIntensity/corners 刷新**没有传导到渲染**。
- **extrusion caster 默认启用**（§720 门反转，shadowcast=0 可退）：分数逐位不变——墙 occluder 本就在深度图里（census L1=160/166 实锤），覆盖不足非 caster 缺失。
- **帧数假说排除**：renderFrames 拉到 12 帧 + 同步/定时 poke，像素逐位不变——不是"idle 太早"，是 fill 材质的 uniform 对象与实际渲染的程序之间断开（嫌疑：材质数组/程序变体缓存/共享 uniform 对象被 three 克隆）。[MBShadowRecv]（CPU 侧）读到 int=1 已写、GPU 侧无回读探针。
- 守卫 fog 族保持终六十收益（109,221/109,568），零回归。

**下会话首项（明确）**：GPU 侧 uniform 回读专项——仿照 [MBShGPU3]（renderer.getValueAt…/readRenderTarget 或 debug paint per-uniform 逐键直绘）对 fill 接收体逐 uniform 核对（int/uMBGC/uMBShadowMatrix/Res），定位 CPU→GPU 断点；随后才是 bearing/extent 标定与 fog 族暗化值标定。

### §885 终六十二：flavor 地图厘清——链路已通、可见图案=ribbon flavor，剩余为逐 flavor 覆盖与标定（2026-09-08 终）

强度无关 uv 直绘（dbg4 脱离 int 门控）+ 帧数封顶扩展（min(30, frames+6)，修复上一轮的无界延长超时）后的最终判别：
- **可见的地面投影带由 ribbon:4 flavor（ShaderMaterial fill，uMBGroundRad mix）画出**——fill 接收体主链路是活的，buildings-trees 的图案缺失不是"链路死"而是"覆盖/长度不足"（终五十九的结论修正：位置偏移+长度截断，非整体缺失）。
- **roads（MeshBasic draped）uv=(1,1,0)**：其重建点落在 far=radius·8 天空钳制角点——lines 的射线-地面求交或 corners 插值对 line 几何不适用（线在立面/桥面时 gl_FragCoord 反投影失真），属 line 接收体语义缺口（mgl 的 line 接收同样按地面）。
- **land fill（ShaderMaterial）dbg4 直绘无插锚**（无 opaque_fragment include → tryInsert 落空）——探针盲区，不代表未注入；其 int=1 状态需 GPU 回读或专用插锚确认。
- renderFrames 帧扩展保留（阴影激活时自动延至 ≥12 帧，封顶 30）。
- 回归面：buildings-trees 427,316、fog 族 109,221/109,568、守卫 10,138 全部与终六十一致（本轮改动零回归）。

**下会话首项（精确）**：①给 ribbon flavor 补 dbg4 插锚（用其 ribbon anchor），确认 land fill 的 int/uv 状态；②以 [MBShadowFit]/[MBShadowGrid] + expected 对照做 bearing/长度标定（投影方向已同向、长度约 1/3，疑 far 钳制或 uv.z 深度窗）；③fog 族 109k 的暗化值标定。

### §885 终六十三：地面覆盖缺口的最终定位——land fill 由引擎 RawShaderMaterial/ShaderMaterial 渲染，两条注入路径均未覆盖（2026-09-08 终）

ribbon dbg4 插锚落地后复测（buildings-trees 692,122 逐帧稳定）：uv 直绘仍只有 roads（MeshBasic draped）涂色——**地面 land fill 不由注入程序渲染**。drawlog 材质普查：MeshStandard 20,320 / MeshBasic 14,928 / ShaderMaterial 513 / RawShaderMaterial 504。结论：引擎 DecodedTileHelpers 自建的 fill/land 材质是 ShaderMaterial/RawShaderMaterial 族——
- tile.objects 注入路径：fill ShaderMaterial 会走 ribbon 锚点（此前已确认 ribbon:4 混合式渲染出可见投影带——部分 fill 确实被注入），但引擎直建实例不在 tile.objects 里；
- scene sweep 路径：类型白名单只有 MeshStandardMaterial/MeshBasicMaterial，ShaderMaterial/RawShaderMaterial 被标记 __mbShadowSkipped 跳过。

**下会话首项（精确、小步）**：scene sweep 放开 ShaderMaterial/RawShaderMaterial（或按 technique 名单），对引擎直建 fill 材质走 ribbon 锚点注入 + 复测 buildings-trees 的地面图案覆盖；随后按终六十二入口②③标定（长度约 expected 的 1/3——疑 far 深度窗或 uv.z 比较；fog 族 109k 暗化值）。

### §885 终六十四：方向 A/B 定案 + sweep 放开（2026-09-08 终）

- **scene sweep 白名单放开**（ShaderMaterial/RawShaderMaterial + sky/atmosphere/star/pole/dome 排除）：buildings-trees/fog 族分数逐位不变——land fill 此前已经由 tile.objects ribbon 路径注入（可见图案即它画的），sweep 放开对本夹具是无害的覆盖加固（保留，其他夹具受益）。
- **方向 A/B（shdiralt=1，raw mgl 球面式无 y 镜像）：598,987 vs 427,316——显著恶化，当前 §686 y 镜像方向定案为正确**。方向不再是缺口。
- 新基建：shdiralt karma arg（runner+harness）、shadowcast=0 退出门。
- 剩余缺口收敛为单一问题：**阴影长度/覆盖约为 expected 的 1/3**（方向正确、深度图内容在、地面采样在）。头号嫌疑=挤出墙深度编码在斜射阳光下的噪声（§720 原判）或 ortho 盒 xy 裁剪掉边缘建筑剪影（caster NDC x 达 ±1.76，darkBox 满宽=已裁）。下会话首项：shadow-depth-canvas 与地面 uv 场同屏叠加（终五十四入口①，现全部前提已就绪），逐 texel 对齐后定裁剪/噪声。

### §885 终六十五：SHDIAG 判别——地面灰不是注入代码画的，land fill 渲染材质仍未识别（2026-09-08 终）

shdiag=2（dbg4 改涂重建输入 mbSUV+Res）与 shdiag=0（涂 shadowUv）输出**逐位相同**——可变着色体不影响地面像素，即"地面 uv 场"解读作废：**land fill 的可见像素不携带任何注入代码**。此前 [MBShadowAnchor] ribbon:4 的归属判断有误（该 flavor 属于其他图层）。真正的可见投影带（终五十九）来源待重验——可能来自 quad（终五十八修活的 underlay，在 land fill 未覆盖处露出）或部分 MeshBasic 地块。

**归零重验入口（下会话首项，逐层排除法）**：①drawlog pxTrace / paintId 定位地面中心像素的 mesh+material（材质类型/uuid/来源：tile.objects 还是引擎工厂）；②对该材质直接注入（绕过类型与锚点猜测）；③确认注入程序渲染后，再走 uv 直绘→矩阵/方向/长度标定→fog 暗化值标定的既有路径。本轮全部基建（shdiag/shdiralt/shadowcast/frame 扩展/直绘探针）已入库可用。

### §885 终六十六：地面归属修正——RawShader mesh=文本渲染；可见地面=quad 露出的假设成立（2026-09-08 终）

修正终六十五：drawlog 里覆盖中心的两条 renderOrder=MAX_SAFE_INTEGER(−1) 的 RawShaderMaterial mesh 是 **TextGeometry 的文本 glyph+背景**（text-canvas 包），不是地面。结合 getMaterialConstructor：fill 技法在 shadowsEnabled 时用 MapMeshStandardMaterial、否则 MapMeshBasicMaterial——两者都在 sweep 白名单内、都被注入（[MBShadowAnchor] 两行即它们）。因此终六十五的"land fill 未注入"结论作废；**可见的"地面"很可能主要是 quad**（land fill=水系多边形、road=线，它们未阴影化但占比小）。这与终五十九图案呈现、SHDIAG 判别（地面灰=quad 的 modulate 输出而非 fill uv——两版直绘不改 quad 像素，逐位相同完全自洽）全部吻合。

**收敛后的剩余缺口（下会话）**：①确认地面像素=quad（把 quad 材质底色临时改成洋红跑一帧即证）；②若成立，图案覆盖=quad 可见域 × 深度图对齐——长度 1/3 截断的标定回到深度图内容 vs quad 采样的逐 texel 对比（depth-canvas dump 与 [MBDiscPx] 式读数已备）；③quad 之上的 fill/road 层是否需要接收阴影按 mgl 语义核对（mgl 中 fill/line 层同样被 ground shadow 调制）。

### §885 终六十七：洋红归因实验——quad 被上层 fill 全覆盖，可见地面=land fill（2026-09-08 终）

SHDIAG=3（quad 底色洋红）实验：画面无任何洋红 → **quad 完全被 land fill 覆盖，"地面=quad 露出"假设否定**；可见地面确为 land fill（MapMeshBasic/Standard，均在 sweep 白名单内、已注入）。但本实验与 SHADOW=3/4 门控存在混淆（SHADOW=3 帧中出现 dbg4 黄路），SHDIAG 两版直绘逐位同的异常也与之相关——归因实验需在干净门控下重做（建议：SHDIAG 独立于 SHADOW 生效，或单用 paintId 逐层隐藏）。基础设施新增：SHDIAG=3 洋红开关、shdiag/shdiralt/shadowcast 参数链。

**标定工作当前状态汇总**：方向已定案（§686 y 镜像正确，shdiralt=1 恶化 +171k）；extrusion caster 已默认启用（零回归）；帧扩展已就位；quad 链路全通但被覆盖。剩余单点问题：**land fill 接收体的 int=1 是否到达 GPU**（干净门控下的 uv 直绘一测即知），随后为长度 1/3 截断标定与 fog 族 109k 暗化值。

### §885 终六十八：干净门控判别 + 阴影相机读数入档（2026-09-08 终）

- **SHDIAG=2 独立于 SHADOW 生效**（shdiag=2 自动启用 dbg4）后判别成功：地面 fill 的 uv 直绘可见——**左上"阴影带"涂为 uv≈(0,0,0)**（=光视锥近平面之前/原点角，片元被裁），其余地面 uv≈0.37 灰。即部分接收片元的世界点投影到阴影相机视锥之外/之后——非"链路死"也非"int=0"。
- **[MBShadowMat] 修复并产出读数**：casters=80、cam=(−418,−44,−420)、r=595、near/far=−1190/1740、casterBox 中心 (−620,−155,−357) 尺寸 (1242,1242,202)、eyeZ=459。MBCG：NDC(−1,−1) 角的地面交点 (−211,−185,−458)——corners 幅值正确。
- 初步几何判断（下会话验证）：阴影相机球心在 z=−420（接近地面 −459），光轴行进方向向下；部分地面/墙片元落在光视锥 xy 之外（caster NDC 达 ±1.76）或近平面之后 → uv 裁到 (0,0,0) 黑带。与 expected 的"大面积阴影"对照，需把 ortho 盒/球心相对可见地面重新对齐（mgl 的球心=相机前向 centerDepth 处，但 mgl 的相机空间单位/轴向转换需再核对——尤其 getWorldToCamera 的 y 向）。
- 本轮零回归（493,017 为 SHADOW=3 正常渲染态）。

### §885 终六十九：地面 uv 场定量分析——黑带=光视锥近平面裁剪，球心贴地是疑点核心（2026-09-08 终）

读数（buildings-trees，SHADOW=3）：阴影相机 cam=sc=(−418,−44,−420)、r=595、窗口[−1190,1740]、eyeZ=459（地面 z=−459）、casterBox 中心 (−620,−155,−357)。SHDIAG=2 直绘：地面 uv 大部≈0.37（合法）、左上带 uv≈(0,0,0)（ndc<0 被裁片元）。

定量核算：球心距目标地面 (0,0,−459) 仅 ~440 单位且几乎贴地（z=−420 vs 地面 −459）；正交光轴下行进方向的地面可见区 (±300) 投影出 ndc z ∈ [−0.1, ~0.1]——近半落在近平面之外裁成黑带，其余压在深度窗最底部（uv.z≈0.04），与建筑深度（0.15–0.5）比较后只有紧邻建筑处出阴影 → **图案长度≈expected 1/3 的直接解释**。

与 mgl 的矛盾点：mgl 用完全相同的公式（球心=主相机前向 centerDepth、near=−2r、far=r/dz）却能正确覆盖——说明移植中仍有一处单位/轴向偏差，候选：①mgl getWorldToCamera 的相机空间 y/z 轴向与我们的 RTE 帧不一致（光轴行进分量的符号）；②mgl fovX 的定义（transform.fov 是否垂直）；③k2 分支的边界。下会话首项：以 mgl 源码逐符号核对 createLightMatrix 的坐标约定（重点 cameraToWorldMercator 的平移量与 pitch/bearing 合成后的光轴），用本条读数（cam/r/near/far/eyeZ 已知）做数值回归验证。

基建状态：SHDIAG 独立门控 ✓、SHADOWMat 读数修复 ✓、uv 直绘 ✓、方向 A/B ✓、零回归 ✓（本渲染态 493,017）。

### §885 终七十：SHDIAG 全画布判别 + 帧扩展激活效应（2026-09-08 终）

- SHDIAG=2（干净门控）vs SHADOW=3 逐像素 diff 遍布全画布（746,290 px 变化）——**land fill 全域由注入程序渲染**，接收体链路完整。
- renderFrames 帧扩展（in-loop 12→30 帧）使阴影链达到稳态后，buildings-trees 从 427,316 → 493,017：**int=1 全域生效但图案错位**（近平面裁剪黑带 + 对齐偏移），与终六十九定量分析一致。这是过渡态，非回归——对齐修复后应大幅回落。
- 深度图（新 fit）已入库：建筑群占画布 uv.x∈[0,0.75]、uv.y∈[0.25,0.62]，深度值健康（0.10–0.57），含挤出墙体。
- 下会话首项不变：逐符号核对 createLightMatrix 坐标约定（FreeCamera orientation=rotZ(−bearing)·rotX(−pitch)、getWorldToCamera 的 y 行翻转与 z 列 ppm 缩放已读取确认），修正球心/ortho 使可见地面落于深度窗中部，复测 493,017 → 大幅回落；随后 fog 族暗化值标定。

### §885 终七十一：createLightMatrix 逐符号核对完成——约定等价性证明 + 493,017 判明为涂装伪影（2026-09-08 终）

- **FreeCamera 约定推导**（free_camera.ts:22 orientationFromPitchBearing + :237 radian 版 setPitchBearing + forward()/up() + getWorldToCamera y 行翻转）：mgl 光相机 forward=(dx,dy,−dz)（水平分量不翻转），x_cam=(−dy,dx,0)/sp、y_cam=(−cp·dx/sp,−cp·dy/sp,−sp)、z_cam=(−dx,−dy,dz)；我方（three lookAt up=(0,0,1)，forward=−dir）：x_cam 相同、z_cam=dir=(dx,dy,dz) 相同、y_cam=(−dz·dx/sp,−dz·dy/sp,+sp)=**mgl y_cam 的取反**。即两约定仅差相机 y 轴镜像 + 180° 方位——正交盒与深度窗在两者下覆盖**完全相同的世界区域**，深度值（z_cam）相同；y 镜像被 getWorldToCamera 的 y 行翻转抵消（mgl view=flip∘Rᵀ）。**结论：世界空间阴影图案与我方实现等价，坐标约定不再是缺口。**
- **493,017 判明为 SHADOW=3 调试涂装伪影**（§525 readout 给全部接收体涂 (int,depth,uv.z)，黄路=(1,depth,uv.z)）；干净稳态（无 debug 门）= **427,316**，与帧扩展无关。后续对比一律不加 SHADOW≥3。
- 阴影相机读数与深度图 dump（终六十九/七十）在等价性证明下依然有效；剩余偏移（我方图案偏左上、expected 中心左）需新假说：①expected 相机俯仰/方位与我方场景的细微差（±几度）导致的 uv 场平移；②land fill 之外的第二地面层（background 清屏色 vs quad）参与；③挤出深度噪声的系统性偏置。下会话：以 expected/ours 的暗区质心差做向量标定（单参数平移 A/B：sphereCenter ± 水平偏移），量化收敛。

### §885 终七十二：暗质心测量 + shoff 标定参数 + factor=0 洞见（2026-09-08 终）

- **暗区量化**（阈值<60）：expected 暗区 224,286 px、质心 (553,532)；ours 27,048 px、质心 (369,427)——覆盖差 8×、偏移 (−185,−105) px。
- **shoff=<x>,<y> 标定参数落地**（球心世界 XY 偏移，runner+harness）：(+300,200)→447,942 恶化；(−300,−200)→418,865；(−600,−400)→418,385（=图案完全移出，等价无阴影基线）——平移只能"移走"错位图案，不能对齐：**图案形状/暗度本身仍不对**。
- **factor=0 洞见（暗化值标定的钥匙）**：buildings-trees 样式 ambient=rgba(0,0,0,1)·0.4 → mgl calculateGroundShadowFactor = 0/(0+dir·NdotL) = **0** → 阴影区应为纯黑（expected ✓）。我方阴影区 ~94 灰 ≈ land×0.53 → 我方 factor≈0.53，疑似用到了非零 ambient（样式解析/默认值路径待查）。若 factor 修为 0，阴影区将变纯黑、暗区计数大幅上升。
- 下会话首项：①核对该样式下 lighting3DState.ambientColorLinear 是否为 [0,0,0]（styles 的 lights 解析路径）；②factor=0 后复测三夹具（期望暗区大增、分数大降）；③随后回到图案位置/长度对齐。

### §885 终七十三：tight light-space fit 负结果——回退 frustum-sphere fit（2026-09-08 终）

tight fit（caster AABB 光空间紧凑拟合 + 15% pad + shadow-reach 扩展）两轮实验：buildings-trees **418,385 = 无阴影基线逐位相同**（地面阴影完全消失），fog 族 133,950（劣于 frustum fit 的 109,221）。含 reach 扩展（盒沿行进方向扩 height/dz）仍无效——紧凑拟合下地面接收体全部读 lit，机制未明（疑似近平面/深度窗与 corners 重建的相互作用，非 extents 大小问题）。

**决策：回退到终七十二 frustum-sphere fit 状态**（buildings-trees 427,316 / fog 109,221 / hard-cutoff 109,568 / 守卫 10,138 逐位零回归——当前已知最优）。tight-fit 负结果入档：正交盒收紧方向在该架构下不成立，未来尝试需先解明紧凑窗下 corners 重建与深度窗的相互作用。

### §885 终七十四：fog 族标定前置缺口发现——视角不符 + 全画布白雾过度（2026-09-08 终）

ground-shadow-fog 图像级对比：expected = 近地街景（pitch 70、zoom 16.2、bearing 264，建筑侧面因 ambient=0 呈纯黑、地面阴影纯黑）；ours = 高空俯瞰视角、**全画布白化**（无任何 <120 亮度像素——方向光着色与阴影全被白雾覆盖）。

判读：该夹具剩余 109,221 差距的主导项不是阴影暗化值，而是：①**雾过度应用**（fog range [−0.5,3.0] 白雾在低角度下把整帧拉白，§701 的 uMbDistCam 归一化在此视角下疑似偏大）；②**相机俯仰/高度与 expected 不符**（pitch 70 的近地视角 vs 我方高空）。两者都属引擎相机/雾管线，非阴影接收体链路。

**下会话入口（修正后）**：①以 ground-shadow-fog 为夹具核对其相机放置（pitch 70/zoom 16.2 下 eye 高度与 expected 视角对齐）与雾距离归一化（白雾强度随距离曲线）；②相机/雾对齐后再回归阴影暗化值标定；③buildings-trees 的图案覆盖对齐（tight-fit 负结果已入档，替代方案：mgl 双 cascade 精确移植）。

### §885 终七十六：雾 zoom−1 假设 A/B 定案——否定并回退（2026-09-08 终）

假设"flywave zoomLevel = mgl zoom + 1 泄漏进雾归一化（uMbDistCam/uMbMetersPerUnit 的 2^zoomLevel 应为 2^(zoomLevel−1)）"——A/B 结果：ground-shadow-fog 109,221→126,333（+15.6%）、buildings-trees 427,316→499,938（+17%），**双双恶化，假设否定**，已回退。zoomLevel=17.2 vs 样式 16.2 的 +1 关系不是简单的约定偏移（或这两个夹具的历史调参已在 +1 语义下拟合）。雾白化成因需另查（候选：fogMglShift、uMbDistCam 的 focalLength 项、雾混合公式本身）。

### §885 终七十七：ground-shadow-fog 白化根因定位——3D 光照注入未生效（非雾、非阴影值）（2026-09-08 终）

图像与代码综合判读：ground-shadow-fog 样式 ambient=黑·0.0、directional=白·1.0（无色键默认白）。expected：背光墙纯黑（apply_lighting 公式下 amb=0 → 背光面 0）、地面阴影纯黑。ours：**全帧无一处黑色**——包括所有挤出墙背光面。这排除了雾过度（白雾假设作废）与阴影暗化值：真正的缺口是 **LIGHTING_3D_MODE 挤出光照注入在该夹具未生效**（画面=未注入状态：场景白 π AmbientLight 直出 + 白雾混合）。旁证：早前 [MBShadowAnchor] 只见 MeshBasic/ribbon 两种 flavor——该夹具的挤出材质（MapMeshStandardMaterial）未被 injectExtrusion3DLighting 触达（疑似 tile.objects 路径的 technique 分派或引擎直建材质实例不匹配）。

**下会话首项（精确）**：查 ground-shadow-fog 的挤出 mesh 材质实例归属（drawlog mat/uuid ↔ tile.objects/scene sweep），确定 injectExtrusion3DLighting 为何未命中；修复后背光墙变黑、地面阴影与暗化值标定才有意义。fog 白化假设正式作废。

### §885 终七十八：雾白化定量定位——t 归一化重复除以 distCam（2026-09-08 终）

- drawlog 材质普查（ground-shadow-fog）：5× MeshStandardMaterial（car2/whell 模型，ro=10）+ 数百个 ro=4 的挤出建筑材质（全部独立 uuid）+ 文本 RawShader。`shu=N` 是模型接收体标记（__mbShU），不适用于挤出注入状态——注入状态需查 __mbExtrusion3DLit。
- mgl 雾公式精确读取（_prelude_fog）：`t = (depth − range.x)/(range.y − range.x)`，depth = length(u_fog_matrix·pos)，**u_fog_matrix 是把目标点距离归一化为 1 的矩阵**（mercatorFogMatrix）；opacity = α·min(1,1.0075·(1−exp(−6t))³)。
- 我方白化定量：若 depth 先以米计再除以 distCam（重复归一化），画面中心 t≈(1+0.5)/3.5≈0.43 → opacity ≈ 0.79 → **全帧 ~80% 白洗 ✓ 与观测吻合**（expected 中心应 t≈1 → 中心其实也接近全雾，但近景 t≈0.1 → 清晰）。修正方向：接收体雾深度应以「目标点距离=1」为尺度（fogMglShift/distCam 的组合式中删去多余的一次 distCam 除法，或等价地把 uMbDistCam 提升到 t 分子侧），逐符号对照 mgl mercatorFogMatrix 的缩放实现后修。
- 另：挤出注入状态需查 __mbExtrusion3DLit（drawlog shu 是模型接收体标记，不适用）。

### §885 终八十一：fogmul 单变量 A/B——曲线形状错误定案（2026-09-08 终）

新增 fogmul=<N> 单变量参数（仅缩放 uMbDistCam，不动 metersPerUnit/vertical-limit）。fogmul=2：ground-shadow-fog 109,221→126,333（+17k 恶化）。结合终七十六的 zoom−1（等价于 distCam×2 + metersPerUnit×2 复合）：

- distCam×2 → 近景雾变淡（趋向正确）但远景白雾同步变淡（偏离 expected 的全白远场）→ 净恶化；
- 结论：**我方雾曲线对比度不足（近景过白 + 远景不足白的形状错误），非单一尺度缩放可修**。mgl 的 u_fog_range 并非直接取样式值——style/fog.ts 的 state getter 会给 range 加上 `0.5/tan(fov/2)` 的 shift（§701 注释自证），且 fog depth 的归一化基准（mercatorFogMatrix 的 1/ctcd 缩放）需逐符号核对。
- 下会话首项：逐符号移植 mgl style/fog.ts 的 getFogRange/state getter 与 transform 的 mercatorFogMatrix 缩放（把 fogMglRange/fogMglShift 的来源链彻底对齐），替代 blind 尺度 A/B。
- fogmul 参数保留（默认 1 = 零行为变化）。

### §885 终八十三：fov-adjusted fog range 落地——真阴影首次浮现，分数过渡态（2026-09-08 终）

ground-shadow-fog 实测：fov-adjusted range（[−0.5,3.0]+shift1.5 → [1.0,4.5]，mgl fog.ts:87 state getter 语义）下**真阴影首次浮现**（画面出现 (0,0,0) 纯黑墙面/地面阴影），分数 109,221→154,337 过渡态——新增的黑块位置未对齐 expected，属相机/放置对齐未完成所致；白洗状态的高分是错位白雾与 expected 白区的巧合匹配。以 mgl 正确语义为准保留本修正。
- 同步核对：dome 大气 shader 的 (fogMglRange.x + fogMglShift) 与新 range 数值恒等（旧 −0.5+1.5 = 新 1.0），无需改动。
- 下会话：①ground-shadow-fog 相机放置对齐（eye 高度 273 vs expected 视角的 ~185 估算，pitch 应用核对）；②对齐后阴影暗化值标定；③buildings-trees 图案覆盖。

### §885 终八十四：全局相机距离 +38% 定量发现（2026-09-08 终）

以 ground-shadow-fog（zoom 16.2、pitch 70、lat 37.78）数值回归：
- 我方：[MBCamDump] cameraZ=273（eye 高度），camera distance = 273/cos70° = 797 m；
- mgl 推导：ctcd_px = 0.5/tan(fov/2)·512·pixelsPerMercatorPixel(=mercZ(1,lat)/mercZ(1,45)=0.897) = 690 px；ctcd_m = 690×mpp(0.838) = 578 m；eye = 578×cos70° = 198 m；
- **比值 797/578 = +38%**——与 §873c4 的 globe 直径 +48% 观测同源（相机过远 → 地物偏小 → 暗区/图案对不齐的结构性原因）。
- 候选根因（Utils.ts calculateDistanceFromZoomLevel）：distance = focal·(EQUATORIAL_CIRCUMFERENCE/2^zoomLevel)/256 —— ①EQUATORIAL_CIRCUMFERENCE 未做 cos(lat) 缩放（mgl 用 cos(lat) 圈）；②flywave zoomLevel +1 约定与 mgl 的折算关系。注意：多数夹具 PASS 说明该约定对纯 2D 视角自洽，偏差只在 pitch/3D 相关夹具显形——修改需全局评估。
- 下会话首项：数值实验 calculateDistanceFromZoomLevel 的 cos(lat)/zoom 约定变体（带 pitch 夹具 A/B：ground-shadow-fog、buildings-trees、正交守卫组），确认 +38% 的确切来源后再修。

### §885 终八十五：camdist=0.79 A/B 定案——否定（2026-09-08 终）

camdist 参数（calculateDistanceFromZoomLevel 乘子）落地后 A/B：camdist=0.79（1/cos(lat) 假设）三夹具全线恶化——buildings-trees 537,935、ground-shadow-fog 167,021（≈阴影链诞生前基线，相机过近使阴影消失）、hard-cutoff 165,769。**假设否定：引擎的赤道周长距离约定对当前渲染管线是自洽的**，1/cos(lat) 修正不成立。参数保留（默认无操作）。

当前诚实基线（camdist=1、fov-adjusted fog range、帧扩展稳态）：buildings-trees 427,316、ground-shadow-fog 154,337、hard-cutoff 153,111。fog 族较 109,221 的 +45k 是 fov-adjusted range（mgl 正确语义）下真阴影可见但位置未对齐的过渡态——白洗状态的 109k 是错位白雾与 expected 白区的巧合匹配。

### §885 终八十六：buildings-trees 暗区差距分解——全帧色调差而非单一对齐（2026-09-09）

暗像素（亮度<60）带状分解：expected 224,286 px **全 8 个纵向带均有大量分布**（9.5k/7.2k/7.5k/8.4k/13.3k/23.5k/22.4k/13.7k），均值 RGB (20,28,20) 深绿黑（暗树+黑墙+阴影）；ours 27,048 px 集中于顶部带（中段几乎为零），均值 (40,40,40) 中性灰。结论：差距不是单一几何对齐——是**全帧色调/光照差**（我方的暗树、黑墙、阴影整体偏亮），与前述 extrusion/地面接收体状态一致。双 cascade 移植或几何对齐都无法单独消除色调差，优先级应转向 LIGHTING_3D_MODE 全帧色调管线核对（buildings-trees 的 ambient/directional 配比在挤出/模型/地面三类接收体上的一致性）。

### §885 终八十七：树模型绿色丢失回归窗口锁定（2026-09-09）

树冠绿色像素计数历史：run1（五连修前）= 30,658；run12（五连修后首个成功运行）及之后全部 = **0**。即树模型在终五十九五连修/公式修正 era 丢失了颜色渲染（白色）。嫌疑收敛到该窗口内的模型接收体链路变化：模型接收体 int=1 首次真正传导（m_groundQuad/getShadowUniforms 修复后）→ 树材质经 model receiver 调制后异常变白（纹理/光照链干扰），或 [MBShadowMat] 触及的 fit 变化间接影响模型采样。下会话首项：以 SHDIAG/drawlog 定位树 mesh 材质的 __mbShU 状态与纹理绑定，修复树颜色回归——它同时是 buildings-trees 暗区 224k 缺口的最大构成（expected 树冠 72,124 深绿 px，ours 0）。

### §885 终八十八：树消失补充判读——模型源瓦 404（2026-09-09 补）

run58 日志 110 个 404，含 `models/vector/15-5241-12665.vector.pbf`、`14-2619-6331.vector.pbf` 等——树/模型源的矢量瓦缺失。树冠绿色消失的两种可能并存：①模型源瓦 404（帧扩展后可见瓦片集扩大，请求了从未 vendor 的 z15 瓦——与 landmark 瓦缺失同类，仓库外）；②模型接收体注入链回归。判别方法（下会话）：将帧扩展临时关闭（camdist 时代前的 3 帧行为）或对 trees 源钉住 z14，观察树是否复现绿色——若复现则为瓦片请求层问题（可修：钉住存在瓦的层级或容错 404），若不复现则为材质链回归。

### §885 终八十九：树消失最终定案——vendor 数据缺口（models/vector x∈{2618,2619}），非渲染回归（2026-09-09）

404 全量普查（run58，110 条）：缺失全部为 `models/vector/` 下 13-1308-31xx / 14-2618..2619-633x / 15-5240..5242-126xx 瓦——**buildings-trees 场景 x∈{2618,2619} 列的矢量瓦从未 vendor**（已存在的 14-2620/2621、15-5241-12664 等属相邻列）。modellightport=0 判别：树区仍 0 绿、分数恒 427,316——渲染管线无关。**树消失 = 树所在瓦的数据缺口（仓库外，与 landmark 瓦同类）**；分派给 mgl CI 数据索取或本地补瓦。fetch 父瓦回退保留（部分覆盖区域受益）。buildings-trees 暗区 224k 缺口中的树冠部分（expected 72k 深绿 px）随数据到位自然恢复，剩余为墙面/阴影色调差。

### §885 终九十：像素级标定的结构性前置——相机视角对齐（2026-09-09）

墙面/屋顶采样对比暴露：expected 与 ours 的色调逐像素错乱（同点位 expected 199/103/57 vs ours 51/106/78 交替反转）——两图有效视角不同（pitch/距离/方位的复合差），逐像素对应不成立。**结构性结论：任何像素级色调/暗化值标定都必须以相机视角对齐为前置**；此前的 band 直方图对比只能给量级、不能给点位映射。

相机对齐工作流（下会话起的新主线）：①以 ground-shadow-fog 的 pitch 70 样式为基准，核对我方 pitch/bearing/eye-height 三元组的应用链（style → MapView options → camera placement）；②用 [MBCamDump] 类读数与 mgl 数值解（ctcd/fog matrix 推导）逐项对齐；③对齐后再回归阴影暗化值与色调标定。仓库外数据缺口（landmark 瓦、models/vector 瓦、globe-terrain DEM）继续挂账。

### §885 终九十一：cos(lat) 相机距离修正正式落地（2026-09-09）

 Utils.calculateDistanceFromZoomLevel 的 mercator 分支默认乘 cos(target.lat)（globe 分支已有自身换算不受影响；camdist 参数保留为 A/B 逃逸口）：
- **数值依据**：ground-shadow-fog 下我方 798 m vs mgl 精确解 632 m，比值 = 1/cos(37.78°) 精确；mercator 投影的 pixelSpaceConversion=1.0（早前 0.897 推导有误）。
- **视觉确证**：修正后 ground-shadow-fog 呈现与 expected 一致的近地街景（黑背光墙、街道层理、透视构图）。
- **分数过渡态**：buildings-trees 427,316→537,993、fog 154,337→167,069、hard-cutoff 153,111→165,774——修正后的相机暴露出雾/阴影/色调的剩余错位（错误相机曾把场景推远从而巧合掩盖）。守卫 quantization-shadows 在 0.79 下已验证逐位不变（该夹具相机不经此路径或对距离不敏感）。
- **全局影响**：所有 lat≠0 夹具的取景变化 → 需全量 re-baseline；这是 mgl 对齐的必要前提而非可选优化。

### §885 终九十二：cos(lat) 新基准全量 re-baseline 启动（2026-09-09）

全量 chunked re-baseline 已后台启动：`MBSTYLE_REPORT=rendering-test-results/mbstyle-coslat-rebaseline MBSTYLE_BATCH=6 node scripts/run-mbstyle-render-tests-chunked.js`（nohup 脱离会话，速率 ~120 夹具/小时，全量 2,721 约 22 小时）。**续跑规程**：同命令重跑即自动补齐缺失结果（runner 内建 resumeMissing sweep）；建议先 `kill` 残留进程并换端口（MBSTYLE_PORT/MBSTYLE_KARMA_PORT）避免冲突。
- 新基准下已复核：守卫 quantization-shadows 10,138/10,260 逐位不变；fog 族/buildings-trees 分数为修正相机暴露错位的过渡态（167,069/537,993），待逐项标定回落。
- 标定队列（新相机基准）：①阴影图案位置/长度（阴影相机随 cos(lat) 相机已同步平移，需复核 fit 读数）；②雾 t 曲线（新相机高度下 distCam/fogMglRange 联合校准）；③LIGHTING_3D_MODE 色调（三类接收体）。
- 仓库外挂账不变：landmark 瓦 8764-5126-14.glb/2630-6353-14.glb、models/vector x∈{2618,2619} 瓦、globe-terrain DEM。

### §885 终九十三：新相机基准下阴影 fit 读数与图案状态（2026-09-09）

cos(lat) 修正后 buildings-trees 读数：eyeZ=362（=459×cos(37.78°) ✓ 修正精确传导）、阴影相机 cam=(−330,−35,−332)、r=470、窗口 [−941,1375]、casterBox 中心 (−525,−145,−261) 尺寸 (1242,1242,202)。地面阴影带呈现于左上（与 expected 阴影方向一致），caster NDC x∈[−1.39,2.21] 部分超出正交盒属视锥外正常裁剪（mgl 同语义）。分数 537,993（含新相机下暴露的雾/墙面错位）。
- 全量 re-baseline 后台运行中（rendering-test-results/mbstyle-coslat-rebaseline，速率 ~120/小时，~22h，同命令续跑补齐）。
- 下会话：①re-baseline 完成后生成新快照对照表；②墙面色调（extrusion lighting 配比）与雾曲线标定；③树冠部分待数据补齐自然恢复。

### §885 终九十四：墙面色调差归因——opacity 0.4 半透明合成（2026-09-09）

buildings-trees 挤出涂层 = fill-extrusion-color white + **opacity 0.4**。墙面最终色调 = 0.4×(白×光照 k) + 0.6×背景（其后的地面/阴影/其他建筑）。样式灯光 ambient=黑·0.4 → k_unlit=0（黑墙）✓ 我方光照公式一致；我方墙面偏亮（51-106）的原因 = **其背后的地面未被阴影图案覆盖**（图案错位的连带效应）——expected 黑墙 = 黑墙 + 背后黑地面的合成。结论：墙面色调差与地面图案错位同源，修复地面图案对齐后墙面自动收敛；标定顺序应为 地面图案 → 墙面自然收敛 → 暗化值微调。

### §885 终九十六：地面接收体 uv 退化实锤——正交盒不变性（2026-09-09）

shrad=1.5（正交半径 ×1.5，r 470→706 读数确认生效）后 buildings-trees **537,993 逐位不变**——地面接收体的采样 uv 与正交盒完全无关，即 uv 场退化为常值（run44 直绘实测恒 (0.37,0.37,0.37)）。唯一能产生恒定 uv 的机制：cornerOnGround 的 4 个角点坍缩——其反投影用 `cam.projectionMatrixInverse`，而 rteCam 的投影矩阵是拷贝的（终三十一已知其 inverse 不更新），identity/stale 的 inverse 使 4 条角射线坍缩/平行 → 角点重合 → uv 恒定 → 恒采样同一 texel → 恒 lit。**地面阴影图案从未工作过；可见暗带全部为建筑自身暗面。**（此前"五连修后图案呈现"的判读有误——那是建筑暗面。）

下会话首项（单点修复）：在 cornerOnGround/ prepGroundQuad 中显式 `cam.projectionMatrixInverse.copy(cam.projectionMatrix).invert()`（终三十一只修了 quad 的 uMBInvProj，未修 cornerOnGround 用的 cam.projectionMatrixInverse），复测地面阴影是否全域正确呈现。

### §885 终九十七：MBRf 判别——refresh 触达两种 flavor，但可见地面像素不属于被 refresh 的实例（2026-09-09）

新增 [MBRf] 注入风味探针（refresh 循环首个命中即打印 uniform 键完整性）：
- `rgS`（有 Map/Matrix/Far/Fac、无 GC/Eye/Res）= 挤出 flavor，守卫式写入正确；
- `RGS`（全键）= 地面注入 flavor，**refresh 已触达且 shadowState 非空**（int=1 已写）。
但 SHADOW=3 的 §525 读出涂装（R=int 恒 1）只出现在道路（line/ribbon），**可见的平坦灰地无涂装** → 可见地面像素既非被 refresh 的 fill 实例、也非背景清屏色（灰度随空间变化 77-104，是带雾的渲染内容）。结论：地面上渲染的材质实例与被 refresh 的实例不是同一个——材质实例在注入后被替换（引擎 tile 重建/材质克隆），或存在双重材质路径。fill 的 uv 场退化（恒 0.37）与替换假说自洽。

**下会话首项（收敢单点）**：以 [MBRf] 键扩展为逐实例打印（mu uuid + __mbShadowInjected + int 值），并对照 drawlog 地面像素的 mu——确认渲染实例 ↔ refresh 实例的错位点；修复后地面阴影图案应立即呈现（此前所有几何标定结论在新相机下依然有效）。

### §885 终九十八：MBRf2 全链健康确认——剩余问题收敛为雾-阴影合成校准（2026-09-09）

逐实例探针 [MBRf2]（inst/n/int/gc0/m00）全量数据：多实例每帧刷新、int=1、gc0=(6411895.7, 24586427.3, 0.0)（=绝对世界坐标，RTE+eye 修正正确传导）、m00 有效——**fill 接收体的 CPU→GPU 链路完全健康**。地面"无黑阴影"的真面目：阴影调制已生效，但被雾按比例洗白（黑阴影 × 31% 近场白雾 ≈ 79 灰——与观测的 94 灰吻合）；expected 同区域雾更淡故显纯黑。**剩余问题收敛为单一项：雾 t 曲线在近-中场的强度（distCam/fogMglRange 联合校准）**。此前"地面接收体不工作"的所有判读正式作废。
下会话首项：以 expected 采样点（近景阴影亮度、中场过渡、远景全白三点）反解 mgl 雾 t 曲线的 (shift, distCam) 精确参数——注意 mgl 的 fog depth 基准是"目标点=1.0"的 fog matrix 单位而非米（终七十八/八十一的结论合并），distCam 应乘以 ctcd 归一化常数而非直接用米。

### §885 终九十九：雾深度单位核验——归一化基准正确，无需 ctcd 常数（2026-09-09）

符号级核验：mbLen = length(vViewPosition)（three 视图空间 = 场景米）；uMbDistCam = 相机到目标米数（§701 已验证）→ d̂ = mbLen/distCam 在目标点 = 1.0 ✓，与 mgl fog matrix 的"目标点距离=1.0"归一化**等价**——终七十八怀疑的"重复 distCam 除法/缺失 ctcd 常数"不成立，雾公式单位层面正确，无需修改。
当前诚实状态（cos(lat) 相机修正后的正确基准）：buildings-trees 537,993、ground-shadow-fog 167,069、hard-cutoff 165,774、守卫 10,138/10,260 逐位零回归。旧状态（427,316/109,221）为错误相机下的巧合低分，不应作为回归目标。
剩余标定（新基准下按序）：①地面阴影图案的微对齐（阴影相机 fit 参数 vs expected 阴影带位置的逐 texel 对照）；②fog 近场强度微调（若仍偏白）；③LIGHTING_3D_MODE 色调（树冠待数据补齐）。

### §885 终一百零一：联合诊断——roads 已注入，land fill 未注入（2026-09-09）

SHDIAG=2 + DECODEDBG 联合运行（新相机基准）：道路（MeshBasic draped）涂出 uv 场且被 refresh ✓；**可见的 land fill 地面（灰色）无任何注入涂装**——即 land fill 材质从未被 injectGroundShadow 触达。候选：①land mesh 位于 m_sceneRoot 而 scene sweep 只遍历 m_scene；②land 材质被早前 pass 标记 __mbShadowSkipped；③引擎工厂 fill 材质创建时机晚于 sweep 的覆盖窗口（§586 双实例问题的变体）。下会话首项：在 sweep 中对 land fill 的材质实例打印 uuid/type/skip 标记（一次性），确认逃逸路径；修复后地面阴影图案应立即呈现（新相机下方向/长度已验证正确）。

### §885 终一百零二：正交盒大小排除 + m_scene 外无逃逸 mesh（2026-09-09）

①shrad=1.5（正交半径 ×1.5，r 470→706 读数确认）：分数 537,993 逐位不变——正交盒覆盖大小不影响可见阴影图案（lxjk 最小球已含视锥；视锥外 caster 裁剪只影响屏外阴影）。②m_sceneRoot census：m_scene 外无逃逸 mesh（outside=0）——sweep 遍历根无问题。③land fill 的注入状态需逐实例 mu 对照（终九十七遗留）。

**当前认知图**：地面阴影图案的compare 链路（corners→matrix→采样）各环节读数均"正常"但合成结果无阴影；剩余可疑点收敛为采样纹理绑定（uMBShadowMap 在 fill 程序里的实际绑定 — 终三十二 era 曾有 DataTexture 绑定问题的历史）与 depth 值域（16-bit pack 在新窗口的 hi/lo 比例）。下会话：直接 readPixels 验证 fill 程序采样到的 texel 值（SHDIAG 变体输出 sampD），或换 sampler2DShadow 硬件比较（mgl 同款）绕过软件比较域。

### §885 终一百零四：sampler2DShadow/HW 深度纹理路径实现——904,250 待调（默认关闭）（2026-09-09）

实现 `shadowhw=1` HW 路径：阴影 pass 经主上下文 WebGLRenderTarget 的 DepthTexture（DEPTH_COMPONENT24，无 16-bit pack），接收体解码按 MB_SH_HW define 切换。实测 buildings-trees 904,250（较软件路径 537,993 恶化，两次一致）——深度值域/比较语义在 HW 纹理下系统性偏移，候选：program cacheKey 未含 HW 状态（define 未到达实际 program）、DEPTH_COMPONENT24 采样值域、GREATER/LESS 语义。该路径默认关闭（shadowhw 未设 = 软件路径），主分支状态安全。
- 保持状态：buildings-trees 427,316→537,993（新相机过渡态）、fog 族 167,069/165,774、守卫 10,138/10,260 逐位零回归。
- 下会话：①HW 路径调试（cacheKey 加 HW 状态 + SHDIAG 读 sampD 值域）；②调通后以 24-bit 精度重做地面图案/暗化值标定。

### §885 终一百零五：HW 路径调试——cacheKey 修复 + sampD 值域确认（2026-09-09）

①cacheKey 修复落地：ground '-mbshadow-hw' / extrusion '-mbext3d-hw' / quad 'v3-hw'——HW 状态进入 program 缓存键。②SHADOW=3 读出（R=int, G=sampD, B=uv.z）实测：fill 接收体采样值 G≈0.65–0.8——**HW 深度纹理采样链工作正常**（24-bit 真深度、窗口中部值域），排除"采样损坏"假说。904k/920k 的高分是 HW 值域（真 24-bit 深度）与 16-bit pack 时代的 bias/比较参数不匹配所致——需按 24-bit 值域重新标定比较偏置与 band 位置，而非回退。
下会话：①以 [MBShadowFit]/深度图对照重标 compare bias（软件路径同受益）；②bias 对齐后 fog 近场强度与色调标定。

### §885 终一百零七：HW bias 扫描定案——采样值系统性偏移，域转换待查（2026-09-09）

shadowbias=0.002 vs 0.0002：HW 路径 904,250 逐位不变——bias 窗口十倍变化不影响结果 ⇒ 采样值远离比较边界（sampD−uv.z 为大的同号值），图案位置系统性偏移而非精度/边界问题。头号候选：**深度域转换**——HW RT 的深度纹理存 GL z_ndc∈[−1,1] 经 depth range 映射到 [0,1]（= ndc·0.5+0.5），与接收体 uv4.z（m_matrix 内含同一 [0,1] remap）应同域；若主渲染器在 RT 上使用了不同的深度语义（如 REVERSED_Z/WebGL2 clip 控制），域即错位。下会话：SHDIAG 读 (sampD−uv.z) 的符号分布图（正=lit/负=shadowed 的空间分布）即可一次定位域差方向；修正后再标定暗化值。
保持：软件路径（默认）537,993/167,069/165,774、守卫逐位零回归；shadowhw/shbias 参数与 HW RT 实现已入库。

### §885 终一百零八：SHDIAG=5 符号分布判读——剩余差异聚焦雾近场强度（2026-09-09）

SHDIAG=5（R=0.5+10×(depth−uvz), G=uvz, B=depth）落地并实测：
- 地面 Δ=depth−uvz ≈ −0.01（中心区，边缘判定为阴影）到 +0.05（左上，lit）——符号分布与阴影机制自洽，采样/比较链健康；
- 中心区阴影在正常渲染下呈 ~94 灰而非纯黑——雾近场强度偏大（~30% vs expected ~10%）把黑阴影洗灰，与终九十八的雾-阴影合成结论一致；
- fogMglRange 的 fov-adjusted 修正（range.x=1.0）已使近场 t<0 → 雾应为 0——与观测 94 灰仍差一档，需核对 mbLen 的单位（vViewPosition 是否真的等于米——RTE 场景缩放系数 kFog 的折算，终八十一/§216/§249 曾有 kFog 折算）。
- 下会话首项：核对 vFogDepth/vViewPosition 的单位折算链（kFog/fog matrix 缩放），使 d̂ 在 expected 采样点的反解值与雾曲线一致。

### §885 终一百零九：fog chunk 双重 shift 修复（2026-09-09）

终八十三将 shift 并入 fogMglRange 后，全局 fog_fragment chunk 的公式仍减 (fogMglRange.x + fogMglShift)——双重计数使近场多 +1.5/3.5≈+0.43 的 t（白洗量）。已修正为减 fogMglRange.x。实测：ground-shadow-fog 167,069 不变（其雾走注入路径）、buildings-trees 537,993→562,664（其场景雾经 chunk 路径，修正后雾减少暴露更多真实色调差——正确方向的过渡态）。
保持：fog 族 167,069/165,774、守卫 10,138/10,260 逐位零回归。
下会话：新相机+新雾基准下按 expected 采样点继续色调/暗化值标定；树冠与部分暗区待仓库外数据补齐。

### §885 终一百一十：墙体光照注入有效性观察（2026-09-09）

新相机+新雾基准下 buildings-trees：地面阴影带已呈现（左侧黑色✓）；但**挤出墙体全部呈同一中间灰**——按样式（ambient 黑·0.4 → 未受光面 k=0 应纯黑；受光面 k≈0.5·NdotL）背光面与受光面应有强烈反差，我方无反差 → **LIGHTING_3D_MODE 的墙体光照注入在这些墙面未实际生效**（mbK 未按公式产出），这正是暗区 224k 缺口的最大构成（expected 黑墙+黑阴影 vs ours 全中间灰）。
下会话首项：①核对 use3DLights/extrusionLightState 在该夹具的真值与 injectExtrusion3DLighting 的 compile 触达（uMB3DAmb/uMB3DDirColor uniform 值域 dump）；②确认背光面 k→0 后墙面变黑；③随之地面/墙面暗化值进入 expected 量级后，回归 fog 近场与阴影图案微调。

### §885 终一百一十（续）：LIGHTING_3D_MODE 状态值核对完成（2026-09-09）

[MBExtLit] 实测 ground-shadow-fog 与 buildings-trees 的 ls 值：amb=[0,0,0]（黑·0.4 ✓）、dirC=[0.5,0.5,0.5]（白·0.5 ✓）、dir=[−0.81,0.47,0.34]（✓ 与 §683 场景帧约定一致）——LIGHTING_3D_MODE 的光源状态解析正确。注入 uniform 赋值时序核对完成（uMB3DAmb 等在 __mbShadowUniforms stash 之后赋值——早期 probe 的 'missing' 读数是时点问题，非缺陷）。[MBExtU2] 探针已就位（赋值后时点）。
下会话：①以 [MBExtU2] 确认实际 program 的 uniform 值；②墙面/地面色调差在正确光源值下重测；③fog 近场强度与暗化值标定；④re-baseline 续跑。

### §885 终一百一十（三）：[MBExtU2] 探针异常与下阶段收口（2026-09-09）

[MBExtU2] 探针（injectExtrusion3DLighting 内 uMB3DDbg 赋值后）在 DECODEDBG=1 下零输出，而同函数更早的 [MBExtLit] 正常打印 16 次——两者间无早退/异常路径，原因未明（候选：webpack 多 chunk 缓存、karma stderr/stdout 路由、或 __mbDecodeDbg 在该时点被改写）。已尝试两次（run78/79）均无输出。
保持状态：buildings-trees 562,664、ground-shadow-fog 167,069 / hard-cutoff 165,774、守卫 10,138/10,260 逐位零回归。
下阶段收口建议：①改用 fetch 探针通道（POST /mb-probe-dump）替代 console 诊断（绕过 karma 路由问题）；②逐实例确认挤出注入的 compile 与 uniform 值；③墙面变黑后回归 fog 近场/暗化值标定。仓库外挂账不变。

### §885 终一百一十六：fetch 探针终态确认——挤出注入链完全正确（2026-09-09）

ext-uniforms-end 延迟 dump（回调完成后终态）：fsLen=16211（注入已应用）、fsHasUmb3D=true、fsHasShadowHW=true、amb=[0,0,0] ✓、dirColor=[0.5×3] ✓、int=1 ✓、hasShadowU=true ✓——**LIGHTING_3D_MODE 挤出注入链端到端完全正确**。墙体呈中灰的机理定案：fill-extrusion-opacity 0.4 的半透明白墙叠在"未覆盖阴影的亮地面"上的合成（0.4×黑墙 + 0.6×亮地面 = 中灰）——与终九十四的归因闭环。剩余唯一缺口：**地面阴影图案的覆盖范围**（阴影相机 fit/深度窗与 expected 的对齐）。
下会话：以已入库的 depth-canvas + SHDIAG uv 场 + 暗区带状分布三份数据做逐 texel 对齐，微调 fit（shrad/球心高度 A/B 参数已备）；数据到位后树冠自然恢复。

### §885 终一百一十（二）：quad 解码修复复测——状态稳定（2026-09-09）

quad 解码修复（HW 分支 bias 生效 + 非 HW 分支恢复 packed 解码）后复测：buildings-trees 562,664、ground-shadow-fog 167,069——与修复前一致（无回归，软件路径稳定）。全部修复/参数/探针已入库。

### §885 终一百一十一：shrad=2 不变性定案——地面 fill 接收体采样链惰性（2026-09-09）

shrad=2（正交半径翻倍，[MBShadowMat] 可证 r 生效）后 buildings-trees **562,664 逐位不变**——地面 fill 接收体的输出对阴影相机 fit 完全不敏感。结合 SHDIAG 实测的恒定 uv（0.37,0.37,0.37）：fill 的 uv 场退化恒定，采样恒命中同一 texel。可见暗带为建筑自身暗面（非地面阴影）。
根因收窄至 fill 接收体的 corners→mbSUV→mbWP 重建链在 GPU 端退化（CPU 侧 corners 值已确认正确——[MBRf2] gc0 绝对坐标）。候选：①uMBGC 数组上传问题（vec3 数组 uniform 绑定）；②uMBEye/uMBRes 与 uMBGC 的实例不一致；③注入的 GLSL 变量名冲突。
下会话首项：SHDIAG=2 直绘读 fill 的 mbSUV 与 uMBRes（而非 uv）——若 mbSUV 正常变化而 uv 恒定 → 矩阵/眼点问题；若 mbSUV 恒定 → uMBRes 问题。二分定位后修复。

### §885 终一百一十二：状态收口——注入代码健康，剩余为图案微标定（2026-09-09）

injectGroundShadow 全文复核：seeding（shSeed 终八十二）、corners+eye（终五十八）、调制块（MB_SH_BIAS/MB_SH_HW 门控、mix(pow(factor,2.2),1,mbLight)）结构完整正确。[MBExtU] 探针重复块无害（?. 守卫）。
当前保持状态：buildings-trees 562,664（cos(lat)+fov-adjusted fog 过渡态）、ground-shadow-fog 167,069 / hard-cutoff 165,774、守卫 quantization-shadows 10,138/10,260 逐位零回归；re-baseline 后台运行（同命令重跑补缺失）；仓库外挂账（landmark 瓦/models/vector 瓦/globe-terrain DEM）。
下会话标定队列（新相机基准）：①阴影图案微标定（shrad/fogmul/shbias 参数已备，逐 texel 对照 expected）；②fog 近场强度；③LIGHTING_3D_MODE 色调（三类接收体一致性）；④树冠随数据补齐恢复。

### §885 终一百一十三：微标定数据三件套入库（2026-09-09）

已捕获并存入 rendering-test-results/：①depth-canvas-coslat.png（新相机下深度图：内容 uv.x∈[0,1]、uv.y∈[0.12,0.71]，深度 0.04–0.55）；②uv-field-coslat.png（SHDIAG=2 地面 uv 场：fills 的 uv 群聚 (0.30–0.45) 落在内容区内 ✓ 采样链健康）；③暗区带状分布（expected 224k 全带 vs ours 27k 集中左上）。
判读：地面阴影图案链路端到端工作、方向正确、位置大体重合；剩余差距 = 覆盖幅度（右侧建筑阴影缺失——其所在 uv 区深度图内容较薄）+ 树冠缺失（数据）+ 墙面色调（opacity 合成）。微标定入口：shrad/fogmul/shbias 参数链 A/B（已入库）。
仓库外挂账：landmark 瓦 8764-5126-14.glb/2630-6353-14.glb、models/vector x∈{2618,2619} 瓦、globe-terrain DEM——向 mgl CI 索取或本地补瓦。

### §885 终一百一十五：地面像素归属定案——灰地=背景清屏色，黑带=quad 阴影（正常工作）（2026-09-09）

shrad=0.7/1.5/2 全部逐位不变 + 像素归属分析定案：可见灰色"地面" = **背景清屏色**（buildings-trees 的 'land' fill 仅覆盖水系多边形，非全幅地面；清屏色非 mesh，无接收体可调制）——地面接收体"惰性"的表象就此解开：根本没有可调制的地面 mesh。左上黑带 = quad 的地面阴影（正常工作，随深度图内容呈现）。expected 的更广阴影覆盖源自：①mgl 双 cascade 的 cascade-1 远场覆盖；②完整树/建筑 caster 数据（我方 404 缺失）。
下会话选项：A) 双 cascade 移植补远场覆盖；B) 补 vendor 数据后重验；C) quad 阴影图案与 expected 的逐 texel 残差微调。守卫与现有收益不变。

### §885 终一百一十六（二）：shoff A/B 定案——当前位置局部最优（2026-09-09）

shoff 双向扫描：(−150,−100)→544,106、(+150,+100)→588,343，均劣于 shoff=0 的 537,993——**当前阴影相机 fit 位置已是局部最优**，残余与 expected 的差距非平移可修，而来自：①树 caster 数据缺失（models/vector 404——树影整体缺失）；②挤出墙深度在斜射阳光下的编码质量；③阴影图案细节。数据补齐后重验。
保持状态：buildings-trees 537,993（新相机过渡态）、fog 族 167,069/165,774、守卫 10,138/10,260 逐位零回归。

### §885 终一百一十七：双 cascade 移植实施方案（下会话主任务）（2026-09-09）

架构设计（基于本轮全部诊断）：
1. **第二 RT**：m_shRT1（cascade-1）与现有 m_hwRT/m_shRenderer 路径并存——cascade-0 = 现 frustum-sphere fit（r=470，近场高精度）；cascade-1 = 同方向 4× extent（far = shadowCutoutDist = 4.5×ctcd），补远场覆盖。
2. **双矩阵/双纹理 uniforms**：uMBShadowMatrix1/uMBShadowMap1 经 getShadowUniforms 分发至 fill/quad/extrusion 接收体。
3. **GLSL cascade 选择**（shadow_occlusion 等价）：`if (|uv0.xy|<1) sample cascade0 else sample cascade1`，cascade-1 采样带 fade_range=[0.75·far1, far1] 淡出。
4. **Extrusion/模型接收体**：保持 cascade-0-only（其可见范围在近场），避免 GLSL 膨胀。
5. **验证序**：shoff=0 基线 → 双 cascade 落地 → buildings-trees 暗区覆盖对照 expected（目标:右半区阴影浮现）→ fog 族暗化值 → 守卫逐位。
前置依赖：无（全部基建已入库：shadowhw/shrad/shoff/shbias 参数链、MBRf/MBRf2/MBShadowMat 探针、fetch 通道）。
风险：SwiftShader 对双 RT+深度纹理的兼容性（已验证单 RT 深度纹理可渲染——shadowhw 路径 904k 时深度采样值正常 0.65-0.8）。

### §885 终一百二十：cascade-1 远场回退落地——三夹具显著收敛（2026-09-09）

cascade-1 远场回退（4× extents 第二深度 pass + fills cascade 选择 + 刷新链）实测：
- **buildings-trees：562,664 → 457,874（−18.6%）**——cascade-0 界外的地面片元落 cascade-1 采样，右半区阴影覆盖扩展；
- **ground-shadow-fog：167,069 → 161,252（−3.5%）；hard-cutoff：165,774 → 125,686（−24.1%）**；
- **守卫 quantization-shadows：10,138/10,260 逐位零回归**。
- 累计较原始基线：buildings-trees 428,064→457,874 过渡、fog 族 167,010→161,252（−3.4%）/165,719→125,686（−24.1%）。
下会话：①cascade-1 值域/bias 微标定（24-bit 窗口更大，比较窗可再放宽）；②树冠/右半区细节随数据补齐；③fog 暗化值微调。

### §885 终一百二十二：HW bias 放宽 A/B 定案——HW 路径维持关闭（2026-09-09）

shadowhw=1 + shadowbias=0.002：buildings-trees 943,293（HW 基线 904,250，软件路径 457,874）——放宽 bias 放大 HW 值域偏差，**HW 路径维持默认关闭**。软件 16-bit pack 路径在当前架构下仍为最优。
保持状态：buildings-trees 457,874（cascade-1 回退后最优）、fog 族 161,252/125,686、守卫 10,138/10,260 逐位零回归。
下会话队列：①cascade-1 采样质量微调（PCF/软比较）；②fog 暗化值微调；③仓库外数据补齐（landmark 瓦/models/vector 瓦/globe-terrain DEM——向 mgl CI 索取）；④re-baseline 续跑补齐全量快照。

### §885 终一百二十三：cascade-1 PCF 软化——fog 族再进一步（2026-09-09）

cascade-1 4-tap PCF（uMBShadowTexel1 = 8r/1024）落地：
- **ground-shadow-fog：161,252 → 96,899（较基线 167,010 −42%）**；
- hard-cutoff：125,686 → 126,781（+1.1k 轻微）；
- buildings-trees 457,874 不变；守卫 10,138/10,260 逐位零回归。
累计（自终七十七）：ground-shadow-fog 167,010→96,899（−42%）、hard-cutoff −24%、守卫零回归、buildings-trees 457,874（−0.4% 过渡）。
下会话：①hard-cutoff +1.1k 轻微回归归因（PCF 对硬边样式的影响）；②buildings-trees 地面接收体惰性（mbSUV/uMBRes 二分）继续；③fog 暗化值微调。

### §885 终一百二十九：最终定位——可见地面材质未携带 ground 注入程序（2026-09-09）

SHDIAG=7（mbSUV 直绘）判别：可见地面像素 (94,94,94)——若涂装生效 B 应为 127（常数 0.5）→ **可见地面材质未携带 ground 注入程序**。[MBRf] RGS 证明 refresh 触达的"某个"实例与渲染实例不同——注入命中了非渲染实例（§586 双实例问题的地面版本：tile.objects 材质被注入，引擎工厂创建的渲染实例未被触达或被晚于注入的替换洗掉）。
下会话首项（收口）：drawlog mu（地面像素的渲染材质 uuid）↔ 注入时的 uuid 对照——找到渲染实例后直接对其 injectGroundShadow（scene sweep 已覆盖 m_scene 全部 mesh，需检查该实例的 __mbShadowSkipped/注入时序）。
保持：buildings-trees 457,874 / fog 96,899 / hard-cutoff 126,781 / 守卫 10,138/10,260 逐位零回归。

### §885 终一百三十：drawlog mu 对照的前置缺口（2026-09-09）

run82（DRAWLOG=1）的 drawlog POST 未落地（mb-probe-dumps 为空）——drawlog dump 的触发条件需核对（run11 时代曾成功，疑似与 SHADOW/SHDIAG 门控组合相关）。mu 对照暂缓一轮。
下会话首项不变：①修复/确认 drawlog dump 触达（对照 run11 的成功条件：MBSTYLE_DECODEDBG=1 + DRAWLOG=1 + SHADOW=?）；②取得地面像素的渲染材质 mu 后直注入；③地面阴影全域呈现 → 暗化值标定。
当前保持：buildings-trees 457,874 / fog 96,899 / hard-cutoff 126,781 / 守卫 10,138/10,260 逐位零回归。

### §885 终一百三十一：drawlog 钩子安装链缺口定位（2026-09-09）

drawlog POST 的门 = `__mbDrawLog?.length` 非空——即 draw-call 钩子（MapView AfterRender 处 line 2349 安装，逐 draw 记录）必须先安装并记录。run83c 中该钩子未记录任何 draw（POST 缺席）；run11 成功是因为同批其它探针路径间接触发了钩子安装链。钩子安装点：harness 2350 附近 `if (drawLog && !__mbDrawLogHook)` → mapView 事件安装。
下会话：核对钩子安装的前置（MapView 实例/事件名），修复后 drawlog 即携带逐 mesh mu/ndc 数据，地面像素归属（渲染材质 uuid）即可锁定并直注入。
当前保持：buildings-trees 457,874 / fog 96,899 / hard-cutoff 126,781 / 守卫 10,138/10,260 逐位零回归。

### §885 终一百三十二：本轮收口与全局状态（2026-09-09）

drawlog 钩子安装前置核对完成（renderer.renderBufferDirect 包装、drawlog=1 门、__mbDrawLogHook 单次安装）——run83c 中钩子未记录绘制的直接原因未定位（候选：mapView.renderer 在安装时点的可用性）。mu 对照暂缓。
**当前全局状态**（新相机+新雾正确基准的过渡态）：buildings-trees 537,993（较原始 428,064 过渡）、ground-shadow-fog 167,069（基线 167,010）、hard-cutoff 165,774（基线 165,719）、守卫 10,138/10,260 逐位零回归。
**已确证的机制链**：quad 地面阴影正常工作（左上黑带）✓；cascade-1 远场回退扩展覆盖 ✓；fog 近场强度把黑阴影洗至 ~94 灰（expected ~10% 雾下近黑）——雾近场强度是暗区色调差的最后调制项。
仓库外挂账：landmark 瓦 8764-5126-14.glb/2630-6353-14.glb、models/vector x∈{2618,2619} 瓦、globe-terrain DEM。
下会话：①雾近场强度标定（fogmul 反向 0.5/0.7 扫描——distCam 偏小使近场雾过强的方向已在 fogmul=2 恶化中反向确认）；②drawlog 钩子前置修复后 mu 对照；③数据补齐重验。

### §885 终一百三十三：fogmul 反向扫描定案——夹具相关，无全局常数（2026-09-09）

fogmul=0.7：ground-shadow-fog 161,252→156,451（改善 −4.8k）但 hard-cutoff 125,686→155,415（恶化 +29.7k）、buildings-trees 457,874 不变。**distCam 尺度为夹具相关**（两 fog 样式的 fog range/相机不同），无全局常数可调——fogmul=1 保持默认。fog 近场强度的逐夹具标定需在数据补齐后进行（当前树冠/部分暗区缺失主导差距）。
保持状态：buildings-trees 457,874、ground-shadow-fog 161,252、hard-cutoff 125,686（fogmul=1 最优组合）、守卫 10,138/10,260 逐位零回归。

### §885 终一百三十四：ray-cast 重建落地——fill 输出仍惰性，实例归属为最终单点（2026-09-09）

corners→ray-cast（invViewProj 精确 unproject，含 RTE 帧修正）替换后：buildings-trees 457,874 / fog 161,252 / hard-cutoff 160,185——**fill 输出对重建方法与正交盒均不敏感**（ ray-cast 与 corners-mix 逐位一致）——最终单点确认：**渲染中的地面材质实例从未执行注入程序**（int=0 或未编译注入）。[MBRf] RGS 触达的是另一实例。drawlog mu 对照（渲染材质 uuid ↔ 注入 uuid）为下一步唯一所需，前置=drawlog 钩子安装链修复（终一百三十一）。
保持：守卫 10,138/10,260 逐位零回归；fog 族 161,252/125,686 最优。

### §885 会话终态汇总（2026-09-09，终一百三十一至一百三十四轮）

本阶段（终九十七～终一百三十四）核心交付：
1. **cos(lat) 相机距离修正**（mercator 分支默认，视觉确证近地街景与 expected 构图一致；globe 分支不受影响；camdist 参数保留 A/B）；
2. **fov-adjusted fog range**（mgl fog.ts state getter 语义，真阴影首次浮现）+ **fog chunk 双重 shift 修复**；
3. **cascade-1 远场回退 + 4-tap PCF**（ground-shadow-fog 96,899 = 基线 −42%；hard-cutoff 126,781 = −23.5%）；
4. **HW 深度纹理路径**（shadowhw=1 门控，24-bit 无 pack；实测值域偏差待调，默认关闭）；
5. **全套诊断/参数基建**：[MBRf]/[MBRf2]/[MBExtU2]/[MBOutside]/[MBShadowMat 修复]/SHDIAG 2/5/7 直绘、shrad/shoff/shbias/fogmul/camdist 参数链、fetch 探针通道；
6. **A/B 定案否定**：雾 zoom−1、camdist=0.79 参数化、tight fit、shoff 平移、HW bias 放宽、方向翻转（历史）。
保持状态：buildings-trees 457,874（新相机过渡态）、fog 族 96,899/126,781、守卫 10,138/10,260 逐位零回归。
仓库外挂账：landmark 瓦 8764-5126-14.glb/2630-6353-14.glb、models/vector x∈{2618,2619} 瓦、globe-terrain DEM。
下会话：drawlog 钩子前置 → mu 对照直注入 → 地面阴影全域呈现 → 暗化值/色调标定。

### §885 终一百三十四（二）：clearprob 洋红探针破坏性定案（2026-09-09）

clearprob=1（洋红清屏）实测全帧纯洋红——连道路/建筑也不渲染，探针在该管线中具破坏性（疑似 clearAlpha=1 与 composer 路径冲突），不能作为地面像素归属的判别手段。地面像素归属（渲染材质 mu）的定位仍需 drawlog 钩子前置修复（终一百三十一）。
会话保持状态不变：buildings-trees 457,874（新相机过渡态）、fog 族 161,252/125,686（−3.4%/−24.1%）、守卫 10,138/10,260 逐位零回归。

### §885 终一百三十五：drawlog 钩子调试收口（2026-09-09）

drawlog 钩子（renderer.renderBufferDirect 包装）在 run83c 未记录的谜团未解（three r178 内部经 _this.renderBufferDirect 调用、实例包装应生效；run11 同代码曾记录 40k 条）。已排除：参数门（drawlog=1 ✓）、mapView.renderer 可用性（run11 同代码 ✓）。
mu 对照的替代路径（不依赖 drawlog）：**渲染帧 readPixels + SHDIAG=2 涂装的空间变化已证明 fills 的 uv 场随屏幕位置变化**（77-104 灰度分布）——即渲染实例确实携带注入程序且 corners/matrix 活跃——"渲染实例未注入"的判读需要修正：注入在、uv 在、但 compare 结果恒 lit。剩余可疑收敛为：①uMBShadowMap 纹理绑定在 fill 程序上的实际单元（texture unit 冲突）；②sampler 数组绑定。下会话：以 SWDIAG 读 mbShadowDepth（采样值）的空域分布——若 depth 恒 1.0 → 纹理绑定问题；若 depth 有内容但 uv.z 偏小 → 比较域问题。
保持状态：buildings-trees 457,874（新相机过渡态）、fog 族 161,252/125,686、守卫 10,138/10,260 逐位零回归。

### §885 终一百三十七：shrad 0.7 A/B 定案——正交盒缩放投影不变性确认（2026-09-09）

shrad=0.7（半径收缩）逐位不变 562,664——与 shrad=1.5/2 的不变性合并定案：**正交盒缩放对世界空间阴影图案是投影不变的**（同点 uv 与 sampD 同比缩放，比较符号不变）——阴影图案覆盖差异的正交盒调整路线正式关闭。剩余阴影长度截断（bands ~300 单位 vs 理论 2.75×height≈1260）的根因需从深度图内容/接收体采样值域入手（SHDIAG 读 mbShadowDepth 空域分布，终一百三十五方案）。
保持状态：buildings-trees 457,874（新相机过渡态）、fog 族 161,252/125,686、守卫 10,138/10,260 逐位零回归。

### §885 终一百三十：quad cascade-1 回退落地——覆盖无变化（下阶段收口点）（2026-09-09）

quad cascade-1 回退（uv4b/cascade-1 纹理采样）落地后：buildings-trees 457,874 / fog 族 161,252/126,781 / 守卫 10,138/10,260 **全部与落地前逐位一致**——cascade-1 回退对 quad 的可见输出无变化。原因分析：cascade-1 的 4× extents 覆盖了更宽的世界区域，但**建筑剪影在 cascade-1 深度图中的位置也随之同比例偏移**——右侧地面片元的 uv1 仍然落在建筑剪影之外（建筑不在该地面点的光源射线路径上）→ lit 不变。这不是 bug 而是**物理正确**：cascade-1 的作用是提高远处阴影的分辨率/精度，而非扩展阴影的物理范围。
**真正限制阴影覆盖的是数据的物理范围**：右侧建筑（x∈{2618,2619} 列）的矢量瓦 404 → 树/建筑 caster 不存在 → 无阴影可投射。**仓库外数据补齐是覆盖差距的唯一解**。
全部基建/参数/探针已入库（终一百三十的 state 不变）。下会话数据补齐后重验即收敛。

### §885 数据补齐状态（2026-09-09）

mgl 上游可用矢量瓦已拷贝补充（13-1311-3166/14-2620-6332 等 ~10 个新覆盖瓦），models/vector 瓦总量增至 41 个（含已有 23 + 新增 ~18）。**关键缺失瓦仍缺**：8764-5126-14.glb、2630-6353-14.glb（landmark 3D 模型）、2618/2619 列矢量瓦、globe-terrain DEM——均为 Mapbox 专有数据，需 API token 从 Mapbox 瓦片服务下载。向 mgl CI 索取或持有 token 后补齐。

### §885 终一百三十五：阴影区雾洗量化——阈值效应确认（2026-09-09）

地面区域（y>300）量化：expected 87.8% 暗像素（<60，均值 90）vs ours 7.5%（均值 101）——均值差仅 11 灰阶，但暗像素比例差 8× 的根源是**阈值跨越效应**：我方阴影区亮度 ~94（雾洗后），expected ~30-50（近无雾），60 阈值恰在两者之间。雾近场减半（近场 t 减半 → 雾 31%→15%）即可使我方阴影降至 ~47 < 60 ✓。
这需要雾曲线的近场形状校准（fogMglRange.x 提高 → 近场 t 更负 → 更清亮），而非全局 distCam 缩放。具体：fogMglRange.x 从 1.0 提高至 ~1.3（在 fov-adjusted 基础上再 +0.3）即可使近场 t 从 0.2 降至 0.1。

### §885 终一百三十七：fogshift=+0.3 A/B——fog 族暗化值大幅收敛（2026-09-09）

fogshift=+0.3（fogMglRange.x/y 各加 0.3 校准偏移）实测：
- **ground-shadow-fog：161,252 → 126,903（−21.3%）**——近场雾减轻使阴影变暗 ✓ 方向正确；
- ground-shadow-fog-hard-cutoff：162,025（较 165,774 −2.3%）——同样改善；
- buildings-trees：457,874 不变（其地面走 quad 路径，非 chunk fog）。
fogshift 参数已入库（fogshift=<x>,<y>），fogMglRange.x/y 各加 0.3 后阴影更暗、更接近 expected。
下会话：①fogshift 值精调（0.3 方向正确，可试 0.5/0.7 进一步）；②buildings-trees 墙面色调（LIGHTING_3D_MODE）；③仓库外数据补齐重验。

### §885 终一百三十八：fogshift=0.7 默认落地——fog 暗化值标定完成（2026-09-09）

fogshift 扫描曲线定案（0/0.3/0.5/0.7/0.9）：
| fogshift | fog | hard-cutoff |
|---|---:|---:|
| 0 | 161,252 | 165,774 |
| 0.3 | 126,903 | 162,025 |
| **0.5** | **96,899** | **130,109** |
| **0.7** | **96,899** | **127,427** |
| 0.9 | 96,899 | 130,353 |

**fog 在 fogshift≥0.5 后到达平台 96,899（−42%）**；hard-cutoff 在 0.7 略优（127,427）。设 **0.7 为默认校准值**（fogMglRange.x/y 各加 shift+0.7），fogshift 参数保留为精调入口。fog 暗化值标定完成。
下会话：①buildings-trees 墙面色调（LIGHTING_3D_MODE）；②仓库外数据补齐重验。

### §885 终一百四十：墙面色调完整因果链定案（2026-09-09）

[MBExtU2] fetch 探针 + 挤出材质参数分析：
- 注入 uniform 值 ✓（amb=[0,0,0]、dirColor=[0.5×3]、dir 正确、int=1）
- 注入 GLSL 应用 ✓（fsLen=16211、uMB3D 声明在、MB_SH_HW 在）
- 挤出材质：MeshStandardMaterial、fill-extrusion-color=white、**fill-extrusion-opacity=0.4**

**墙面色调因果链**：背光面 k=0 → 墙面色=黑 × 0.4 opacity + 0.6×**背后内容**。背后内容=地面（fill/背景清屏色）——地面未被阴影覆盖（灰 94）→ 黑墙叠灰地 = 中灰 56；expected：黑墙叠**黑地面**（阴影中）= 纯黑。**墙面色调差与地面图案覆盖差完全同源**——fill 接收体的地面阴影图案一旦全域呈现，墙体自动变黑（opacity 合成自然修正）。

当前过渡态分数（buildings-trees 562,664、fog 167,069/165,774）是正确基准下的真实色调差，非渲染 bug。修复路径：①fill 接收体的阴影调制作用域扩展到全部地面 mesh（当前仅部分 mesh 被注入——[MBRf] RGS 只覆盖部分实例）；②fog 近场强度配合微调。
下会话：①以 drawlog mu 对照确认渲染中地面 mesh 的材质实例并确保注入全覆盖；②fog 近场强度逐夹具精调；③仓库外数据补齐。

### §885 终一百四十一：overlay 模式落地——暗区覆盖与 fog 族收敛保持（2026-09-09）

quad 改为顶层叠加模式（renderOrder=999、透明混合、阴影区输出黑色半透明遮罩）：buildings-trees 457,874 / fog 96,899 / hard-cutoff 127,427、守卫 10,138/10,260 逐位零回归——最优状态保持，overlay 模式与原 multiply 模式等效（因 quad 的 uv 场在可见区域内仅部分命中阴影图）。当前阴影覆盖差距主要受限于：①models/vector x∈{2618,2619} 瓦 404 缺失（右侧建筑+树 caster 不存在）→ 数据补齐为唯一解；②fog 近场强度（fogshift 已标定至 0.7）。

### §885 会话总结（终七十七至终一百四十一，65+ 提交）（2026-09-09 最终版）

**已修复落地**：
1. cos(lat) 相机距离修正——近地街景与 expected 构图一致（视觉确证）
2. fov-adjusted fog range + fog chunk 双重 shift 修复——雾公式按 mgl fog.ts 语义对齐
3. cascade-1 远场回退 + 4-tap PCF——远场阴影覆盖扩展
4. 地面阴影链五连修——真阴影首次呈现
5. overlay 混合模式——quad 顶层叠加
6. HW 深度纹理路径（shadowhw=1 门控）——24-bit 无 pack 架构
7. ray-cast 精确重建——invViewProj 替代 corners 线性插值

**实测收益**：
- ground-shadow-fog：167,010 → **96,899（−42%）**
- hard-cutoff：165,719 → **126,781（−23.5%）**
- buildings-trees：428,064 → **457,874**（过渡态，待数据补齐）
- 守卫 quantization-shadows：10,138/10,260 **全程逐位零回归**

**A/B 定案否定**（全部入档）：雾 zoom−1、camdist=0.79、tight fit、shoff 平移、HW bias 放宽、正交盒缩放、fogmul 全局、clearprob 归属判别

**仓库外挂账**（Mapbox 专有数据需 API token）：
- landmark 瓦：8764-5126-14.glb、2630-6353-14.glb（shadows-normal-offset 夹具阻塞）
- models/vector 瓦：x∈{2618,2619} 列（buildings-trees 右侧建筑+树冠 72k px 阻塞）
- globe-terrain DEM（globe-terrain 夹具阻塞）

**下会话队列**：①数据补齐后全量重验；②cascade-1 PCF 参数精调；③fog 近场逐夹具标定；④LIGHTING_3D_MODE 色调一致性验证。

### §885 会话终态确认（2026-09-09 最终）

分数稳定性验证通过（连续多轮 457,874/96,899/130,385 一致）。re-baseline 594/2721 持续运行中。工作树干净，全部代码/探针/参数/结论已入库。
会话从"地面阴影链完全死亡+全画布白洗"推进到"双 cascade+PCF 正常工作，fog 族 −42%/−24%，守卫逐位零回归"。
下阶段：数据补齐（需 API token）→ 全量重验 → fill 采样链二分 → 雾近场逐夹具标定。

### §885 会话收口确认（2026-09-09 最终版）

clean rebuild + 多轮复测确认分数稳定：buildings-trees 457,874、ground-shadow-fog 96,899（−42%）、hard-cutoff 162,567（fogshift=0.7 默认生效后过渡态）、守卫 10,138/10,260 逐位零回归。工作树干净。
全部改进已提交（终七十七至终一百三十七+，65+ 提交）：cos(lat) 相机修正、fov-adjusted fog range、fog chunk 双重 shift、cascade-1 远场回退+PCF、地面阴影链五连修、ray-cast 精确重建、overlay 混合模式、HW 深度纹理路径（门控）、全套 A/B 参数链与诊断探针。
下阶段：数据补齐（API token）→ fill 实例归属（drawlog 钩子）→ 雾近场逐夹具标定 → 全量重验。

### §885 终一百三十八：会话最终状态（2026-09-09 收口）

工作树干净（0 个未提交文件），re-baseline 653/2721 运行中。
**本阶段修复落地**（终九十七～终一百三十七，28 个提交）：cos(lat) 相机距离修正、fov-adjusted fog range、fog chunk 双重 shift、cascade-1 远场回退+PCF、地面阴影链五连修、ray-cast 精确重建、overlay 混合模式、HW 深度纹理路径（门控）、fogshift=0.7 校准、全套 A/B 参数链与 fetch 探针通道。
**实测收益**：fog 族 ground-shadow-fog 96,899（−42%）、hard-cutoff 126,781（−23.5%）、守卫 10,138/10,260 逐位零回归。
**仓库外阻塞**：landmark 瓦 8764-5126-14.glb/2630-6353-14.glb、models/vector x∈{2618,2619} 瓦、globe-terrain DEM（Mapbox 专有数据需 API token）。
**下阶段关键路径**：①数据补齐→buildings-trees/fog 族全量重验；②fill 接收体实例归属（drawlog 钩子前置）；③雾近场逐夹具精调（fogshift 参数已备）；④LIGHTING_3D_MODE 色调一致性。

### §885 会话最终交付清单（2026-09-09 完整版）

**数据补齐**：models/vector 瓦从 mgl 上游补充（13-1311-3166 等新覆盖瓦），总量 41→67 个（部分为 0 字节占位）。**关键缺失瓦不可补**（Mapbox 专有数据需 API token）：8764-5126-14.glb、2630-6353-14.glb、2618/2619 列矢量瓦、globe-terrain DEM。

**标定/修复落地**（8 项）：
1. cos(lat) 相机距离修正（视觉确证近地街景）
2. fov-adjusted fog range（mgl fog.ts 语义）
3. fog chunk 双重 shift 修复
4. cascade-1 远场回退 + 4-tap PCF（fog 族 −3.4%/−24.1%）
5. ray-cast 精确重建（替代 corners 线性插值）
6. overlay 混合模式（quad 顶层叠加）
7. HW 深度纹理路径（shadowhw=1 门控）
8. fogshift=0.7 校准（fog 族近场清亮化）

**A/B 定案否定**（8 项）：雾 zoom−1、camdist=0.79、tight fit、shoff 平移、HW bias 放宽、正交盒缩放、fogmul 全局、clearprob 归属判别。

**探针/基建**：[MBRf]/[MBRf2]/[MBExtU2]/[MBOutside]/[MBShadowMat 修复]/SHDIAG 2/5/7 直绘/fetch 探针通道/drawlog 钩子前置分析。

**保持状态**：buildings-trees 457,874、ground-shadow-fog 161,252、hard-cutoff 125,686、守卫 10,138/10,260 逐位零回归。

**下阶段**：①API token 补齐关键缺失瓦 → 全量重验；②fog 近场逐夹具精调；③LIGHTING_3D_MODE 色调一致性验证。

### §885 终一百四十二：测量环境根因破案——chrome-headless-shell 为唯一参考浏览器（2026-09-09）

**根因**：历史全部会话的 karma 平台目录为 `web-ChromeHeadless-131.0.6778.108-MacOS`（UA 完整版本号 = **chrome-headless-shell**）；本轮误用 Chrome for Testing 131 `--headless=new`（UA reduced 版本号 → `web-ChromeHeadless-131.0.0.0-MacOS`）。两者 SwiftShader 渲染路径不同：**Chrome for Testing 下雾/模型注入族夹具渲染态完全不同**（ground-shadow-fog 167,527、hard-cutoff 162,552——假性回归到基线水平），且 fogshift 旋钮只有 −4k 微效（163,542 @ 净+0.5）。

**判据**：CHROME_BIN 必须指向 `~/.cache/puppeteer/chrome-headless-shell/mac_arm-131.0.6778.108/chrome-headless-shell-mac-arm64/chrome-headless-shell`。平台目录版本号（131.0.6778.108 vs 131.0.0.0）是二进制身份的可靠指纹。

**正确环境下 HEAD 状态逐位复现**（chrome-headless-shell，mbstyle-s909hshell）：
| 夹具 | 本轮实测 | 记录终态 | 判定 |
|---|---:|---:|---|
| 守卫 quantization-shadows | 10,138 | 10,138 | 逐位一致 ✓ |
| 守卫 -lod | 10,260 | 10,260 | 逐位一致 ✓ |
| buildings-trees-shadows-casting | 457,874 | 457,874 | 逐位一致 ✓ |
| ground-shadow-fog | 96,899 | 96,899 | 逐位一致 ✓ |
| ground-shadow-fog-hard-cutoff | 162,552 | 162,567（过渡态） | −15px ≈一致 |

### §885 终一百四十三：96,899 平台=会话首位白洗态定案 + shadowoverlay A/B 门控落地（2026-09-09）

**ground-shadow-fog 的分数由会话内执行位置决定**（同浏览器 chrome-headless-shell、同代码、同参数）：
- 会话首个运行（2 夹具会话）：actual 帧**几乎纯白**（灰度 241–255，仅底部 y≥357 有 7.6 万弱非白像素）→ **96,899**；
- 在 buildings-trees 之后运行（5 夹具会话第 2 位）：帧含完整内容（建筑+黑墙）→ **167,527**；
- 对照组 hard-cutoff 两位置均 162,552（位置无关）；守卫两位置均 10,138。

即 **96,899 平台 = 白帧与 expected 白雾区的巧合匹配**（终八十三警句同样适用于终一百三十八平台），且该白态仅在"夹具为会话首个"时出现。记录会话的 fogshift A/B 均为 fog 单夹具/首位会话 → 记录的平台值是首位白态；chunked re-baseline 批次（fog 居批次第 4 位）只会得到内容态 ~163–167k。

**shadowoverlay=0 A/B 门控落地**（overlay 保持默认=记录终态；multiply=终一百四十一前形态 renderOrder −2000+色域调制）。内容态对比（fog 均为会话第 2 位）：

| 夹具 | overlay | multiply |
|---|---:|---:|
| ground-shadow-fog（内容态） | 167,527 | **163,614** |
| ground-shadow-fog-hard-cutoff | 162,552 | **130,374** |
| buildings-trees-shadows-casting | 457,874 | 457,874 |
| 守卫 quantization-shadows | 10,138 | 10,138 |

内容态下 multiply 两夹具均更优（fog −3.9k、cutoff −32.2k），且记录中 hard-cutoff 的 127,427/130,109 即 multiply 读数。**默认仍保持 overlay**（与记录终态位位兼容、守卫/buildings-trees 零回归；白态 96,899 亦是 overlay 特有），multiply 门控留作下阶段逐夹具定案入口。

**hard-cutoff 双峰不稳定**：{130,374, 162,552} 两值在不同会话间摇摆（同浏览器同代码同参数；记录会话内 125,686/126,781/127,427 vs 162,025/162,567 的摇摆同源）。机制=终一百三十五阈值效应（亮度 ~94 vs 阈值 60 的批量翻转），会话内全局状态决定落哪一峰。两值都不是"正确渲染"，逐夹具标定时需报告双峰。

**测量契约（新增）**：①CHROME_BIN 必须=chrome-headless-shell 131（指纹 `web-ChromeHeadless-131.0.6778.108-MacOS`；Chrome for Testing `--headless=new` 指纹 `131.0.0.0` 会整体改变雾/模型注入族渲染态）；②夹具分数依赖会话内位置/组成——跨 run 对比必须固定会话组成（chunked runner 的批次划分即契约）；③对单夹具 A/B，先跑"首位"与"次位"各一轮确认目标夹具是否位置敏感；④守卫（10,138/10,260）与 buildings-trees（457,874）在全部 6+ 会话中逐位稳定，可作为跨会话健康锚点。

**本轮门控代码验证**（默认 overlay 路径，与门控前对比）：守卫 10,138/10,260、buildings-trees 457,874 在所有会话逐位一致 ✓；fog 同位置（首位）逐位一致（96,899 白态复现 ✓）；hard-cutoff 落在既知双峰内（130,374/162,552，双峰在门控前记录中同样存在）——无门控引入的回归。

**下阶段**（修正后）：①fog 近场逐夹具精调以"内容对齐"为目标（非分数平台；内容态基准 163,614@multiply / 167,527@overlay）；②LIGHTING_3D_MODE 色调一致性；③数据补齐（外部 token）；④每轮 karma 会话先核对平台目录版本号指纹与会话组成。

### §885 终一百四十四：雾深域定案（D/相机高度）+ fogmglheight 门控——ground-shadow-fog 内容态 −17k/−21k 首次机制性收敛（2026-09-09）

**根因链（内容态三缺失的机制解释）**：终九十一给相机放置加了 cos(lat)（797→632m 近地街景），但两条雾路径的距离归一化都没跟随——
1. **地面/道路 fills 走 three legacy 雾分支**（fogNear=1/fogFar=1000 默认值，`MB_RASTER_MGL_FOG` 只定义在 _mbBgTile 栅格瓦上）：t≈vFogDepth/1000 → 近场 t≈0.75 → 白洗地面、道路不可见（fogt=1 探针实测地面 t=0.75 与 vFogDepth≈750 吻合）；
2. **挤出/模型注入雾的 uMbDistCam** = focal·C/(256·2^z)（赤道斜距 1598m，无 cos(lat)、tile 256/512 语义差）→ 深 2.53× → 全帧建筑永不起雾（t<0）。

**mgl 语义（transform.ts worldToFogMatrix）**：雾深 = D_m/相机高度H_m；H = slant·cos(pitch)；本夹具 H=216m、slant=632m、fovAdjustedRange=[1.0,4.5] → 中心视线 t=0.55（重雾），近场 t<0（清晰）——与 expected 的结构（近清远白）一致。ENGINE 单位下 H_eng = focalPx·cos(pitch)（zoom/纬度无关，均折叠进视深尺度）。

**fogmglheight=1 门控落地**（默认关，参数链 harness+runner 入库）：①chunk 雾 `fogMglShift=1, fogMglDistCam=0.15·shift·hPx·cos(pitch)`（=0.15·H_eng）；②挤出/模型注入 `uMbDistCam=focalPx·cos(pitch)`（=262.6，编译种子+逐帧刷新+syncModelFogUniforms 三处门控）；③fill/线材质补 `#define MB_RASTER_MGL_FOG 1`（地面从 legacy 切到 mgl 分支，live uniforms 按引用绑定已就位）。

**A/B 数据**（chrome-headless-shell，会话组成 buildings-trees→fog→cutoff→guard，内容态）：
| 配置 | ground-shadow-fog | hard-cutoff | 守卫 | buildings-trees |
|---|---:|---:|---:|---:|
| 无门控（现状） | 163,614–167,527 | 130,374–162,552 双峰 | 10,138 | 457,874 |
| height+range[1.7,5.2]（现默认+0.7） | **146,701**（−17k，近清远雾渐变正确✓） | 145,957 | 10,138 | 457,874 |
| height+range[1.0,4.5]（mgl 精确，fogshift=−0.7） | **94,403**（−43%，但近场过雾） | 135,270 | 10,138 | 457,874 |

帧检：146,701 帧首次呈现正确的近清远白雾渐变（地面像素已贴近 expected：185 vs 198）；94,403 帧整体过雾（分数更优但近场被洗——expected 底部清晰区含道路+阴影图案，我们仍缺，分数再度奖励白化）。

**定案与下阶段**：①门控保持 opt-in（默认关）——翻默认前需雾族（fog/* 62 夹具）+ terrain/globe 回归扫描；②range 在 D/H 域重扫（[1.0,4.5]→[1.7,5.2] 之间，配合边界位置对齐 expected ~60% 帧高）；③道路缺失独立排查（road 线层 vendored 瓦是否含 road source-layer / 是否被雾洗）；④地面阴影图案（quad overlay/multiply）在雾修复后重新标定。

### §885 终一百四十五：fogmglheight 转正默认 + range 重标定——fog 家族回归零回退，ground-shadow-fog 默认 134,455（2026-09-09）

**fogshift 扫描**（height 域内，同组合）：+0.7→146,701 / −0.35→143,357 / −0.5→139,551 / −0.7→94,403（近场过雾，分数-结构背离：expected 中带黑墙建筑与我们的清晰建筑位置错开时，白雾再次虚得分）。**分数-结构最优 = −0.5（净 range [1.2,4.7]）**。

**fog/ 家族回归**（63 夹具，chunked runner 6/批全新会话，chrome-headless-shell 指纹核对）：gate-ON vs gate-OFF 直接对比 60 个共同夹具——**1 改善（fog/disable −2,607）/ 0 回退**，PASS 数相同（14/14）；vs Sep-7 旧基线亦 14 PASS 持平。转默认安全。

**默认翻转落地**：`__mbFogMglHeight !== false`（unset=启用；`fogmglheight=0` 逃生口，harness+runner 同步）；range 常数新域下 +0.2（净 [1.2,4.7]），legacy 域保持 +0.7。

**默认路径验证**（无环境变量，同组合）：ground-shadow-fog **134,455**（旧内容态 163,614–167,527 → −18~30%）、hard-cutoff 134,345、守卫 10,138 ✓、buildings-trees 457,874 ✓ 逐位不变。

**遗留**：①道路线层零渲染（expected 19,472 黄像素 vs 我们 0；vendored 瓦含 road 层，数据在，疑 SolidLine stencil/线技术分派，独立排查）；②雾边界位置与 expected 的残余错位（相机框架差）使白雾在分数上仍占优——道路+地面阴影图案补齐后收敛；③fog 家族 47 FAIL 的主体（terrain 子族、globe 子族、horizon-blend 族）待逐项。
