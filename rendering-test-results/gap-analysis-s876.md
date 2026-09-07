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
