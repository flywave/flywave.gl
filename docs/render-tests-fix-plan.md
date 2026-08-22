# 渲染测试对齐修复计划（基于 baseline-2026-08-22 真实基线）

> 基线：`rendering-test-results/baseline-2026-08-22/`（195 例，34 PASS / 161 FAIL）
> 方法：逐测独立 karma + dump server 落盘（cur/diff/json）；结果判定必须行尾锚定或读 TOTAL 行。

## 优先级排序

### P0 — 近失快修带（<500px，7 族，预计同类小 bug）
| 用例 | 差异px | 疑向 |
|---|---|---|
| slots/dynamic-insert | 12 | slot 层动态插入时序 |
| icon-size/camera-function-high-base-plain | 13 | zoom 函数 icon-size 精度 |
| icon-pitch-alignment/auto-rotation-alignment-map | 17 | pitch 对齐旋转 |
| icon-rotation-alignment/auto-symbol-placement-line | 22 | line 放置旋转对齐 |
| text-variable-anchor/all-anchors-offset-zero | 23 | offset=0 边界路径 |
| text-line-height/data-driven | 34 | 数据驱动行高 |
| icon-rotate/literal | 46 | 字面旋转角 |

### P1 — text/symbol 排版深水区（~90 例，4k~106k）
- text-offset 全族（literal/multiline 8k~20k，约 30 例）——锚点×对齐×offset 矩阵
- text-anchor（17k~21k）
- text-variable-anchor（6617~106k 全族）
- icon-text-fit（141~13k 全族）
- symbol-placement/line（85k）+ line-center/overscaled/multilinestring
- symbol-z-order / text-writing-mode / icon-opacity 7k / text-color-opacity-translate 4.7k
- 归类：原生 Placement/TextElementsRenderer 引擎级（文档 F4/F6/F7/F13）

### P2 — raster 精度族（3.8k~92k）
- raster-resampling 45k、raster-filtering 52k、raster-masking-vector 82k、
  raster-elevation(tiled) 92k/9k、zoomed-raster 3.8k、raster-array 28k（MRT 容器，大工程另立专项）

### P3 — terrain/globe/occlusion（6k~564k）
- terrain 131k、globe 60k~239k（距离 re-scale 专项 §12.76-79 在案）、
  wireframe 442k、occlusion 564k、cross-source-elevation 6k

### P4 — 源类型族（79k~236k）
- image-source 236k、canvas 158k、video 150k、custom-source 79k、image projected/terrain

### P5 — fog color 族（65k×3）+ lighting/measure-light（4k~42k）

### P6 — 零星大差异（free-camera 27k、fit-screen 53k、context-restore/heatmap 31k、
real-world 45k、sd-hd-conflation 60k、imports/3d-lighting-globe 186k 等）

## 执行记录
- 2026-08-22：基线落盘 + 本计划成立。

## P0 执行记录（2026-08-22）
- **alpha 透明 void 死路记档**：`text-variable-anchor/all-anchors-offset-zero`（23px）期望图为
  透明空画布（alpha 噪声 ≤7）——试 `MapView alpha:true` 无效（void 由 theme clearColor 主导：
  `MapViewEnvironment.updateClearColor` 空 theme → white + alpha1）；改 theme clearAlpha=0 属
  全局语义变更风险大且 pixelmatch 对 rgb 仍敏感，收益仅 1 例，搁置。
- **P0 其余 6 族定性**：slots 12 / icon-size 13 / icon-pitch-alignment 17 / icon-rotation-alignment 22
  （此例位置整体不同，真几何差）/ text-line-height 34 / icon-rotate 46——cur/exp 内容 bbox 几乎重合，
  为 **1px 级放置/亚像素精度**，与 P1 排版深水区同根（原生 Placement/POI 管线），并入 P1 专项。
- **结论**：P0 无独立快修项，主攻方向 = P1 text/symbol 排版引擎（text-offset 矩阵 30 例为最佳
  切入：同 bbox 结构、系统性 1px~半字宽偏移，疑 anchor×justify×offset 计算基准差）。

## P1 执行记录（2026-08-22）
- **text-offset 矩阵逐格取证**（literal 3×3 网格，per-cell 质心+墨量）：
  - 质心差仅 **1-3px**（offset/anchor 基准基本正确，非主因）；
  - **墨水量 cur 系统性偏少 5-40%**（如 cell(1,2) 1392 vs exp 1947）——主因指向
    **字形栅格化/字号精度**（SDF 渲染的 gamma/coverage 或 text-size 求值差），即 F13 域；
  - 部分格 n 相近仅 1px 级差（纯 AA 精度）。
- **定性**：P1 需先攻 **glyph 精度**（SDF gamma/coverage/字号标定），而非 anchor×offset 矩阵；
  建议方法论：单字形 fixture（text-field/diacritics 2264、text-font/camera-function 113 起步）
  逐位对照，复用 §12.76-80 的 Node 独立复刻取证法。

## P1 执行记录 II（2026-08-22）
- **MBSDFTextMaterial mgl 公式移植无效**（text 域数值纹丝不动）——该材质不在这些用例的
  渲染路径（MBRenderLayer 侧备用）；实际路径 = 原生 `TextElementsRenderer` →
  `flywave-text-canvas/TextMaterials.ts#getOpacity`（屏幕导数 AA，阈值 0.5，
  `dist·toPixels+0.5` 覆盖曲线）。已回退实验改动。
- **mgl 对照公式（mapbox-gl-js 本地源码 src/shaders/symbol.fragment.glsl:115-133）**：
  `alpha = smoothstep(0.75 ± 0.105/fontScale, dist)`，fontScale=size/24，gamma_scale 相消；
  halo：`buff=(6-halo_width/fontScale)/8`，`gamma=(halo_blur·1.19/8+0.105)/fontScale`。
- **下一实验（引擎级，需专项批测护航）**：TextMaterials.getOpacity 的覆盖曲线改 mgl 语义
  （前提：确认 fontcatalog SDF 的边缘编码是否已被归一化到 0.5；若已归一化则差异在 AA 宽度
  ——导数法 vs mgl 固定 gamma 的等效宽度标定）。
- **本地 mgl 源码就位**：`mapbox-gl-js/` 仓库根完整 checkout——后续对齐优先直接读本地源。

## P1 执行记录 III（2026-08-22）
- **重映射系数参数扫描（真路径 MBFontCatalogBuilder.ts:197）**：[-64 基线(×1.0)] vs ×2/×1.5/×1.25/×0.75
  ——text-offset 4669/8009/8356/8821/7914、text-color 4681/7947/8250/8721/7921、
  halo-color 112/238/253/274/213。**×1.0 为局部最优**：内侧饱和不是墨量亏缺根因，任何
  展宽/压缩都劣化。已回退全部实验（零净变更）。
- **排除链更新**：①MBSDFTextMaterial 非路径；②MBGlyphLoader atlas 非路径（逐位无变化）；
  ③MBFontCatalogBuilder 重映射系数非杠杆。剩余嫌疑：**TextMaterials.getOpacity 的导数 AA 宽度**
  （flywave 屏幕导数 vs mgl 固定 gamma=0.105/fontScale——等效宽度标定需在 flywave-text-canvas
  包做受控实验）或 **TextCanvas 栅格化字号换算**（size→px 基准）。字体栈回退已排除
  （glyph fixtures 含 Open Sans Semibold 等全部栈）。
- **下会话入口**：flywave-text-canvas 专项——getOpacity 的 toPixels 与 mgl gamma 等效宽度
  对照（Node 单字形独立复刻取证法，参照 §12.76-80）。

## P1 执行记录 IV（2026-08-22）
- **AA 斜率 cap 扫描**（TextMaterials.getOpacity toPixels 上限，重建 lib 验证路径生效）：
  cap 2→7848 / 3→5517 / 4→4681(=基线) / 6,8→4681——**自然斜率 ≤4，任何约束均劣化**，第四条排除链。
  实验已回退+lib 重建回基线（4681 复核）。
- **cell(1,2) 深挖**（text-offset/literal 墨量亏缺最重格，文本 "offset -1,-1"）：
  exp 比 cur 墨量 +36%（10500 vs 7725）、更黑（mean 79.9 vs 88.2）——同位置同字号，**系统性更粗**。
  字体栈已排除（harness 合并目录 Semibold 优先、fixtures 全栈在位）。
- **剩余假设**：① 字形 quad 像素尺寸换算差（size→px 基准，24px metric 换算）；② 预乘 alpha
  合成损耗（TextCanvas 输出到主帧的混合路径）；③ mgl fixture 期望图生成时的 dpr/fontScale 细节。
- **结论**：P1 需要 Node 单字形独立复刻取证（离屏渲染一字形对照 mgl 期望，隔离 TextCanvas 全链），
  远程盲扫已穷尽四个参数杠杆（材质/atlas×2/重映射/AA 斜率）。

## P1 执行记录 V（2026-08-22）——✅ 破案：S 曲线覆盖
- **根因定位**（数学+取证链）：mgl 用 smoothstep 围边的 S 曲线，**内边带（raw≥224）饱和为全覆盖**；
  我们的线性斜坡在同带停留在部分 alpha（cell(1,2) 取证：exp 同高宽+8%、墨+36%、更黑）。
  五条排除链（材质/双 atlas/重映射系数/cap 斜率/floor 斜率）后，第六实验命中：
  **`smoothstep(-w, +w, d)`（w = 0.5/toPixels）= 原导数斜率的 S 曲线化**——保字号自适应，
  同时内边带饱和。
- **验收（A/B，全改善）**：text-color 4681→4469、text-offset 4669→4455、
  halo-color 112→107、**line-height 34→15**、diacritics 2264→2038；广谱：
  text-anchor/bottom 16807→15720、variable-anchor 6617→6336、symbol-placement/line 85299→84161、
  text-rotate 103→103、halo-width 112→107；**非文本哨兵零回归**（heatmap/fog/skybox/icon 逐位不变；
  trees-lod 一次 109156 为已知负载 flake，复测 3/3 PASS）。
- **遗留**：text 域残差仍大（text-anchor ~15k 等）——S 曲线只收覆盖精度，放置/排版差异（P1 主项）仍在。

## P1 执行记录 VI（2026-08-22）——S 曲线后的残差画像
- **text-anchor/bottom 逐格取证（S 曲线后 15720）**：13 个内容格全格 cur 墨量仍少
  **8-30%（中位 −13%）**、质心 dy≈−1.5±1（上移）、dx ±2.8 分散；全局相位相关仅 (1,0)px、
  峰 0.76——差异分布式非全局。
- **尺寸疑点**：cell(1,3) 柱run 高 cur max 14 vs exp 20（同 nominal text-size=16 默认、
  无 zoom 函数、无 pixelRatio）——部分 label 实际渲染尺寸偏小，疑 **text-size→px 换算/字号
  基准**（mgl 24px 基准 SDF 缩放链）在多行/多 label 场景取值不一致，需逐 label 尺寸审计。
- **下会话入口**：① 逐 label 宽高审计脚本（连通域 w/h 直方图 cur vs exp，定位尺寸系统性
  偏差的具体 label 与其 layout 属性）；② dy −1.5 的基线/行高基准差（text-line-height 默认
  1.2 的行距换算）。

## P1 执行记录 VII（2026-08-22）——逐 label 审计 + 1px 定位
- **逐 label 连通域审计（text-anchor/bottom，86/92 匹配）**：**单行 label 几乎完美**
  （w/h ratio 1.00、dy=+1dx=0）——放置/锚点/字号本身正确；残差 = **全 label 统一 +1px 垂直
  偏移 + ~9% 墨差**（90 label × 周长 ≈ 13k 与 15.7k 总残差吻合）。多行 label 高度差 ~8px/119
  （行距或换行差异，次要）。
- **text-anchor 全族失败面**：bottom/left/top/center 10-20k 均匀分布——同根（1px+墨差），
  非 anchor 语义错。
- **+1px 排除**：offsetY 的 distanceRange/2−BORDER（=+1 恒定）假设试验（改 −g.top）——
  bottom 15720→15685、其余不变 → 非主因，已回退。**+1px 定位于放置投影路径**
  （TextElementsRenderer 屏幕投影/anchor 换算的取整差），mgl symbol 路径无取整
  （quads/anchor/shaping 均无 round）——差异在我们侧的投影链，下会话入口。
- **text-line-height/literal（显式 1.3）PASS**——显式行高路径正确，多行差异仅默认值场景。

## P1 执行记录 VIII（2026-08-22）——+1px 排除两项
- TextShaping.startY 亚 em 微调（−0.0625em ≈ 1px@16）实验：bottom 15720→15717（噪声级）
  → **非该路径**（fixture 文本走 POI/TextElement 链，TextShaping.ts 是另一路），已回退。
- 结合 VII 的 offsetY 排除：+1px 定位收窄到 **POI 屏幕投影链**（emitter 世界坐标 →
  TextElementsRenderer 投影 → TextCanvas 绘制坐标的某一步差 1px）。
- **下会话取证法**：debug 渲染单 label，打印我们链路每一步的 y 值（emitter projectWorld →
  POI position → screen xy → TextCanvas 绘制 y），对照 mgl anchor→screen 数学
  （mapbox-gl-js/src/symbol/projection.ts + symbol_layout.ts 的 textOffset/anchor 链）。
