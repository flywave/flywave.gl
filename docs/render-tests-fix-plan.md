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
