# mbstyle 渲染测试未对齐项分析报告（2026-08-29；2026-08-31 增量见文末）

> 数据源：`rendering-test-results/mbstyle-baseline8/web-Edge-150.0.0.0-Linux`（807 例，641 FAIL）
> + 重跑 `rendering-test-results/mbstyle-rerun-3di-ml`（filter=3d-intersections model-layer，195 例，当前代码）
> + 增量：`rendering-test-results/mbstyle-fix-0831-all`（model-layer 全量重跑，feat/mbstyle-datasource + §659-§661 修复）
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

---

## 四、2026-08-31 增量：model-layer 逐例根因与已落地修复（§659-§661）

### 已修复（代码已入库，本分支）

> 全量对拍（24 例配对，mbstyle-ml-0831 vs mbstyle-fix-0831-all）：**净 −43,051 px**；最大受益 landmark-conflation-buckingham-lod 175139→137078（−38k，§659 真旋转修复）、default-orientation −11.5k。数值上"退化"的 add-layer（42596→54218）实为空白→正确渲染后更多树像素计入比对，视觉是改善。

| # | 修复 | 用例 | 效果 |
|---|---|---|---|
| §659 | **glTF→世界系转换改真旋转**：mgl COORD_SPACE_TRANSFORM (x,z,y) 是左手镜像半边；经渲染帧 y 镜像（§643）共轭后应为 Rx(+90°)=(x,−z,y)。MBStyleDataSource.loadModels + MBModelRenderer.instantiate 两处 flip 矩阵改 (0,0,−1) 行 | default-orientation 14343→2865 px（−80%，几何/朝向精确对齐）；y 不对称模型整体受益 | 残余 2865 px = 明暗标定（§661） |
| §660 | **运行时 addLayer 通知数据源**：MBStyleRuntime addLayer/removeLayer/moveLayer 补 m_onChange()（markTilesDirty 重解码）；onChange 回调补 updateModelRegistry（新 model 层 + expectPlacements） | geojson-source-with-schema-add-layer 从**整幅空白**→ 33 棵树全部渲染（几何正确） | 残余 54218→54912/61441 px 全为光照域 |
| — | harness addModel op 补 updateModelRegistry + reloadSources（addLayer 的重解码先于模型注册，需二次解码） | 同上 | — |

### 已定性、未收敛（下一步主攻）

1. **§661 模型光照过曝（全 model-layer 头号根因）**：无 `lights` 样式走 §557 半球分支时 uMB3DAmb/uMB3DDirColor 缺省 [1,1,1] → mbK = amb·(~1)+dir·NdotL ≥ 1 削顶。已试强制无灯样式走 legacy 分支（uMBPortMode<0.5 && uMBHas3DLights>0.5 才进半球）——**像素完全不变**（environment-test 17580 不动），证明 legacy 分支同样削顶：white albedo 下 clamp(direct)+0.65·indirect+intensityFactor 仍 ≥1。environment-test 实测：**33 球位置全部正确**（黑材质排与 expected 逐像素吻合），白/金属两排因过曝成纯白在浅背景上"消失" → 纯光照标定问题。mgl model.fragment.glsl 的 legacy intensityFactor/env_light 端到端数学需重新对照（§654 蓝图未完成的 indirect+direct 分路）。
2. **ground-shadow-fog 家族（17.1 万 px ×2）**：探针实证三处断层——(a) road 线层/water fill 完全未上屏（同源建筑正常，解码 67 geos 正常 → 渲染端丢线）; (b) ground-shadow 平面锚在**世界原点** (0,500,0)（ndc=NaN），未锚到场景下方 → 名字的"地面阴影"整体缺失; (c) ambient=0 时建筑呈黑剪影（extruded-polygon 光照未按 mgl direct-only 语义）。加上 pitch70 贴地取景偏远景，属复合场景，依赖 1+3d-intersections 链。
3. **density-reduction（4760 px）**：树排布/数量正确（allow-density-reduction 未实现但该例值为 false 不影响）；残差 = 同 §661 光照（期望深绿 vs 实际浅绿削顶）。

### 重开计划（按 ROI，2026-08-31 会话末更新）

1. ~~**§661 legacy 光照端到端对照**~~ → **已落地（§661，todo 文档）**：根 style.light 是 spherical [1.15, 210, 30]（intensity 缺省 **0.5**）→cartesian→lightPos=[−x,−y,z]；uMB3DLegacyPos 此前是死 uniform。修后 geojson-source-with-schema(-add-layer) **54912→43723（−20%）**；environment-test 逐位不变（需再核该夹具是否带 lights 块——带则归 §557 分支标定）。遗留：anchor viewport 的 −angle 旋转。
2. ⭐⭐⭐ **ground-shadow 地面锚定**：ground-shadow 平面跟随场景锚点（勿用世界原点），接 shadow-intensity 到 extruded/ground 层。
3. ⭐⭐ ground-shadow-fog 线层丢失：nvert=561 ShaderMaterial v0w=(0,500,0) 即第 2 条的同一错锚；修完后复查 road/water。
4. ⭐⭐ MAPS3D-1159 回归（7149→14108）：§659 后 y 镜像过矫正或该例 orientation 语义特殊，单独对拍。
5. ⭐ 三例 harness/杂项：add-layer 与 baseline 的 61441 vs 54912 差值（addLayer 触发的二次重解码可能重复放置模型，需查 MBModelRenderer 去重）。

---

## 五、2026-09-01 增量：ml-0901 全量基线（当前 HEAD=§686）+ §687-§690 修复批

> 数据源：`rendering-test-results/mbstyle/`（ml-0901 分批跑测，ChromeHeadless 131 本机；B1/B2 已完成，B3-B5 跑测中）
> 另：用户已解决 landmark-emission-strength(-lod)（-lod 88702→57295，−35%；主例 44153 与 §557 时代 41885 基本持平）。

### B1/B2 关键数值（当前代码）

| 家族 | 数值 | 定性 |
|---|---|---|
| **meshopt-quantization 家族（新最大头）** | high-zoom-model-quantization **101 万**（-lod 99 万）、z-offset-v2 48 万×2、-port 48/46 万、-station 34 万×2、highlights 30/31 万、castro 24/29 万、shadows-normal-offset 19 万×2 | **取景已对齐**（时钟塔例 ours/expected 位置逐像素吻合——§687 相机专项证伪的旁证）；残差 = 部件亮度域（整体暗约一档，实测墙 177 vs 231，≈ambient-only 缺 directional 项）+ 时钟表盘部件着色 + V2 meshopt AO/位偏移（§551 遗留③已有夹具） |
| buildings-trees-shadows 家族 | 61-82 万×5（合计 337 万） | 双根因：①道路 `line-emissive-strength:1` 未生效（§688 修复）；②地面投影缺失（§689 修复）；另有 trees z13/z14 瓦片 mgl 亦缺（双方 404，非资产缺口） |
| landmark-conflation | buckingham 22 万/16 万、index-overflow 9 万×2、其余 4-6 万 | 挤压碰撞域，未动 |
| landmark-duplicate-model-layer | 13.7 万×2 | 双层反向 filter（§550 定性），未动 |
| landmark-glb-tiles | 非 lod 3023 ✓ / **-lod 19 万** | lod 变体专项 |
| ground-shadow-fog 系 | 167009/165712（§686 后） | 相机取景已排除（§687），残差=墙面明暗+雾标定+阴影接收（§689 应收益） |
| fill-extrusion--default | 136125（§685 哨兵 100130 → §686 深度雾恢复代价，已知） | 待取景/雾域后续重评 |
| geojson-source-with-schema(-add-layer) | **48609 = 48609** | 重复放置已消解（§690 为加固） |
| 近绿带 | default 2916 / default-orientation 2865 / density-reduction 4762 / filter-runtime-styling 3725 | 光照标定边缘 |

### §687-§690 修复（本批，代码入库）

1. **§687 相机专项证伪**：mgl mercator `pixelSpaceConversion≡1`（基类实现）→ 现有 zoom+1 链 distance ≡ mgl ccd_m 逐项相等（focal 768 实测 = h_css/(2tan fov)）；mgl `_computeCameraPosition` ≡ flyway lookAtImpl orbit。**取景残差不在相机域**；§674/§675 偏移实测于 §681 前内容空窗期，属虚假位移峰。相机专项关闭。
2. **§688 line-emissive-strength 键映射**：ribbon 提升吞键 → 道路被 groundRadiance 压暗（实测 103 = lightyellow×0.40，expected 255 原色）。
3. **§689 ground-shadow 接收器 patch 时点投递**：§577-§588 悬案破壁——injectGroundLighting 同路径已证明可达渲染材质；公式改 mgl `mix(amb/(amb+dir·NdotL), 1, light)`（shadow_utils 正式语义，线性输出乘 ratio^2.2 落 sRGB 域）。
4. **§690 模型 placements 数组身份重建**：mgl tile 内容整体替换语义，防 runtime update 双份/残留。

### 下一步（按 ROI）

1. **meshopt-quantization 家族光照/部件标定**（新最大头 ~660 万 px）：模型 directional 项缺失（疑似 ambient-only，[MBLight] 探针在库）+ V2 meshopt 位偏移/AO 顶点色（§551 遗留③）。
2. §688/§689 复测 buildings-trees 家族（预期 −50%+）。
3. MAPS3D-1159 / landmark-z-offset-munich 家族对拍（B4 批次出数后）。
4. landmark-glb-tiles-lod（19 万 vs 非 lod 3023）单点排查。
