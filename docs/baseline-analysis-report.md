# mbstyle 渲染测试未对齐项分析报告（2026-08-29）

> 数据源：`rendering-test-results/mbstyle-baseline8/web-Edge-150.0.0.0-Linux`（807 例，641 FAIL）
> + 重跑 `rendering-test-results/mbstyle-rerun-3di-ml`（filter=3d-intersections model-layer，195 例，当前代码）
> 根因调研：4 个并行代码级调研 + 既有 docs（render-tests-port-todo.md § 编号）核对。

## 一、baseline8 过时性结论（重要）

对 `3d-intersections` + `model-layer` 用当前代码重跑后：

| 模块 | baseline8 | 重跑 | 变化 |
|---|---|---|---|
| 3d-intersections | 74/75 FAIL，925.8 万 px | 74/75 FAIL，600.3 万 px | **−325 万 px**（guard-rail-split 161675→1302、elevated-line-labels-multi-level 165476→24161、shadows-junction 144219→18312 等 §550-§553 修复已兑现） |
| model-layer | 41/41 FAIL，587.4 万 px | **117/117 FAIL，1855.6 万 px** | **79 例为 baseline8 中不存在的新用例**（landmark-part-styling-indirect-* 家族 86/82/62/61 万 px、landmark-mbx-meshopt-quantization 家族、landmark-mbx-shadows 家族），baseline8 快照早于该批次夹具 |
| 共同 116 例 | — | 无一转 PASS | 个别回归：**landmark-z-offset-munich-3d-hidden 8962→50607**、-lod 9021→28859（需排查，疑 §553 接线副作用）；tile-cover-extension-no-shadows 69041→30250 改善 |

结论：model-layer 的真实差距远大于 baseline8 所示，头部在**新 indirect-update / meshopt 家族**（现象：模型上屏但 part 外观错误——黑/蓝条带材质、颜色域整体失配，属 §553 meshopt 黑材质与 part-styling 更新链的延续问题）。

## 二、全量未对齐项按像素差分类排序（类别级汇总）

| # | 分类 | 失败例数 | 像素差合计 | 一级根因 | 难度 |
|---|---|---|---|---|---|
| 1 | model-layer（重跑值） | 117 | 1855.6 万 | batched-model part 外观域：indirect part-styling 更新链、meshopt 量化/黑材质（缺 NORMAL→flatShading、求值失败黑兜底）、shadows/fog 标定 | 大（延续 §550-§553） |
| 2 | globe 系 | 84 | 947.5 万 | 引擎 sphere 管线 zoom→相机距离系统性偏差（zoom0 dc=5.7R vs mgl 4.5R，globe 偏小 26%）+ globe raster colorization/TerrainDraping bail → 白球；symbol 投影域残差 | 大（引擎专项，port-todo :2673/2679） |
| 3 | 3d-intersections（重跑值） | 74 | 600.3 万 | drape 依赖链 + elevated 照明/symbol 方向 + 阴影双着色；重跑已大幅收敛 | 大 |
| 4 | hillshade 家族（highlight/accent/shadow-color、buffer、maxzoom） | 30+ | ~130 万 | 色调/对比校准（高光尾部过强）+ zoom-function 求值位差；buffer 族 drape 零栅格化（bake 正交相机材质投影分歧，docs :5851） | 色调中低；buffer 高 |
| 5 | map-projections | 7 | 102.1 万 | mercator↔globe 硬切换无插值（MBStyleDataSource.ts:4108-4126 自注释）；自定义投影 raster/sprite draping 未做 | 中（morph 插值）/高（draping） |
| 6 | custom-layer-js | 6 | 86.8 万 | `addCustomLayer` 无 case → no-op，层被静默丢弃（MBStyleDataSource.ts:1619-1681 无 custom 分支）；§549 定性引擎级"普通子树不绘制"；**正规 DataSource 通道已被 §553 验证可行** | 大 |
| 7 | fog | 45 | 81.5 万 | THREE.FogExp2 近似 + kFog=3.7 全局常数在低 pitch/阴影雾场景过浓（§12.76-8）；mgl 逐内容深度 fog 语义未对齐（冻结，port-todo :3041） | 大（引擎） |
| 8 | background-pitch-alignment | 5 | 70.7 万 | 纯色 + viewport 对齐 background 走不到 quad 通道：`applyBackgroundPattern` 仅在 background-pattern 存在时调用（MBStyleDataSource.ts:2008-2035）；半透明 viewport 覆盖层无从呈现（docs :127 误标 ✅） | **低（数据源层单点改动，可收敛 5 例）** |
| 9 | measure-light | 15 | 58.9 万 | 亮度公式已修（MBEnvironmentManager.ts:326）；残差 = 字形 AA + globe atmosphere 连带 | 受牵制 |
| 10 | fill-extrusion 家族 | 15+ | ~62 万 | 平面域已 PASS（§12.84 曾 92/92）；残余为 terrain 相机-地形标度（mgl pixelsPerMeter 链未移植，§128-141 冻结） | terrain 高 |
| 11 | fit-screen-coordinates | 3 | 47.2 万 | **harness 缺陷**：fitScreenCoordinates 用 haversine 近似反推 zoom + 强制 pitch=0 + 不含地形高程（MBStyleCompatRenderTest.ts:972-1020）→ 相机放错/入地，白屏 | 低-中（纯 harness） |
| 12 | extent/1024-symbol | 1 | 26.5 万 | extent 帧不统一：setExtents 逐要素惰性（MBStyleDecoder.ts:271-283），首要素前 emitter 默认 4096，同一要素两套坐标帧各发一次 → 标签双影 | **中（入口明确）** |
| 13 | symbol-opacity/hide-transparent | 1 | 26.1 万 | fixture 带 `showOverdrawInspector:true`，expected 是 overdraw 计数着色帧；我方无 overdraw 可视化通道 | 中高（引擎 pass） |
| 14 | raster-color | 2 | 24.2 万 | rgba 字符串 stop 不插值致 ramp 退化——**已在 HEAD 修复**（MBExpressionEngine.ts:214-331），重跑即收敛（expression→0，nearest→323 不再追） | 已修 |
| 15 | video | 2 | 23.0 万 | 双重：无 VideoSource 源分支（源分派无 'video'）+ drone.mp4 资产未 vendored | 中 |
| 16 | lighting-3d-mode | 5 | 22.6 万 | hillshade 照明硬编码 azimuth=315°（MBMaterialPatchManager.ts:3766），不读 illumination-direction、不随 directional light 联动；无 hillshade-emissive-strength 消费者 | 中 |
| 17 | dynamic-filter/symbols | 25 | 20.6 万 | 线标签已放置但文字未渲染：text 沿线只发单条 TextPathGeometry，m_textPathGeometries 分支不触发（MBTileDataEmitter.ts:4016-4037；docs :273）；锚点相位/overscale 遗留（docs :5863-5873） | 中大 |
| 18 | free-camera | 6 | 31.9 万 | harness lookAtPoint alt→zoom 换算不含地形高程 → terrain 夹具相机在 DEM 内部白屏（:926-969；P3.18） | 中（需引擎 elevation API） |
| 19 | context-restore | 2 | 15.3 万 | 恢复链未实现：onWebGLContextRestored 只恢复文字渲染器+clearColor（MapView.ts:4012-4021），tile GPU 资源不重传 → 黑屏；数据源层无 ContextRestored 监听 | 中高 |
| 20 | occlusion | 5 | 13.9 万 | 幽灵图标（我方多放 mgl 已淘汰者）+ 碰撞盒 anchor-offset 语义（§455-464 已收敛 88%，剩余需 MBGLIconDump 真值对拍） | 高 |
| 21 | depth-occlusion | 13 | 9.5 万 | mgl 双 pass 遮挡淡出 vs 我方 ribbon depthTest=false painter's 序；datasource 层四挂载路径已穷尽冻结，需引擎 post-render API（§107-111） | 大（引擎） |
| 22 | image-source | 2 | 7.8 万 | quad 已上屏；残差 = 2 三角形近似 vs mgl 逐坐标网格三角化（MBEnvironmentManager.ts:2940-2962） | 中 |
| 23 | appearance | 55 | 7.4 万 | **icon-offset y 符号反向**（mgl y-up 未翻转，MBStyleSymbolPlacement.ts:886-935）；头部 6 例占 60% 像素 | **低（两处方向修正 ~2.5 万 px）** |
| 24 | line/elevated-line 域 | 40+ | ~20 万 | gap-width：emitter 不产 secondaryWidth，native 不消费；triangulation：ribbon 恒无限 miter 近似；cap round 圆角 SDF AA 差；大 offset(>20px) 瓦片截断 | cap/pitch 低；gap/triangulation 高 |
| 25 | 文字小项族（cross-fade/pitch-scaling/halo-blur/max-angle/radial-offset/no-cross-source-collision 等） | 30+ | ~5 万 | 字形资源不缺（本地 glyphs PBF 完整）；缺口 = SDF atlas 走 FontCatalog canvas 光栅化（冻结深水区）+ 属性无消费者（cross-fade/pitch-scaling grep 无）+ crossSourceCollisions 分组未实现 | 属性类小-中；光栅化大（冻结） |
| 26 | 其余近失带（sort-key/translate/opacity/visibility/filter 等） | 200+ | 各 <1 万 | AA/半像素/精度带，多为阈值边缘 | 低优先级 |

## 三、按 ROI 的修复建议（数据源层可动、非引擎冻结项）

1. **background-pitch-aligation viewport 纯色 quad**（#8，⭐，5 例 70 万 px）——纯色 background 接入 applyBackgroundPattern 通道。
2. **appearance icon-offset/rotate y 方向**（#23，⭐，~2.5 万 px）。
3. **extent/1024-symbol setExtents 提前到解码入口**（#12，⭐⭐，26.5 万 px）。
4. **raster-color 重跑确认**（#14，已在 HEAD，0 成本）。
5. **fit-screen-coordinates / free-camera harness 相机精解**（#11/#18，⭐⭐，79 万 px；terrain 高程需引擎 API）。
6. **hillshade illumination-direction/emissive-strength 接线**（#16，⭐⭐）。
7. **crossSourceCollisions 分组**（⭐⭐）；**video vendored mp4 + VideoTexture 链**（⭐⭐）。
8. **model-layer 新家族（indirect-update/meshopt）延续 §553 路线**（大头，但属既有专项）。
9. 排查回归：landmark-z-offset-munich-3d-hidden（8962→50607）。
