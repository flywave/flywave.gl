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

### ml-0901 基线终版（2026-09-01 补跑完成后；HEAD=§691）

> 基线全集 = 212 夹具，其中 **20 例为 mgl 标记 web-skip**（front-cutoff 家族"Needs updated model fixtures"、model-opacity-cutout、multiple-models-terrain、terrain-2-wheels 等——本平台合法不跑），可跑全集 192，**已采集 192/192**（合计 ~3200 万 px）。跑测基建同步修复（733c7ec8：runner 硬超时+进程组击杀+断连快速失败）。

#### 终版家族排行（px）

| 家族 | 合计 | 主例 | 定性/下一入口 |
|---|---|---|---|
| meshopt-quantization（±lod） | 616 万 | high-zoom-model-quantization 101 万×2、z-offset-v2 48 万×2、-port 47/45 万、-station 34 万×2、highlights 30/31 万、castro 24/29 万、shadows-normal-offset 19 万×2 | 取景已对齐；残差=模型光照帧不一致（§691：法线/光双帧，ambient-only 实测）+V2 meshopt AO/位偏移（§551 遗留③） |
| trees-puck-terrain-shadows | 192 万 | zoomin 97 万、partial 95 万 | 新入榜（原断连未测）；地形+树+阴影复合域 |
| buildings-trees-shadows | 389 万 | casting 79 万、fog 系 62 万×3 | §688 后道路 103→194（mix 生效，期望 255，残留 ×0.77 压暗未定位）；§689 接收器零视觉变化（见下 A/B 结论） |
| models-on-globe | ~160 万 | near-pole 81 万、nested 39 万 | globe 引擎域（报告 #2 已知冻结带） |
| camera-projection | 97 万 | ortho 家族 | §571 ortho 特殊域 |
| landmark-z-offset | ~380 万合计 | scale 49/38 万、museum-terrain 43/39 万、museum 39/36 万 | 3d-hidden/-lod 已回到 8962/9021（§661 时代回归消解） |
| part-styling（indirect/update/doors） | ~290 万 | update-doors 48/36 万、doors-no-shadows 30/32 万 | setLights 重求值链（refreshMeshFeatures 在库，帧域亮度待 §691 裁决） |
| landmark-conflation | ~85 万 | buckingham 22/16 万 | 挤压碰撞域，未动 |
| mbx 其余（shadows/xray/wireframe/meshopt-colors） | ~120 万 | colors-lod 35 万、shadows-lod 19 万 | 分散 |
| MAPS3D-1159 | 13733/同 | §659 前 7149 | 回归残留 ~6.6k，小项挂起 |

#### §688/§689 首轮 A/B 诚实结论（2026-09-01）

1. **§688 line-emissive-strength（部分生效）**：道路采样 (700,880) ours 103→194（mix 已落到渲染材质），expected 255——**残留 ×0.77 均匀压暗因子未定位**（候选：uMBEmissive 编译值≠1 的第二路径、双重 ground-rad、或渐变/雾交互）。land 92 恒不变 ✓。低 zoom-fade 恒 113661 ✓ 无回归。
2. **§689 ground-shadow 接收器（零视觉变化）**：ground-shadow-fog 167009 **逐位不变**——patch 时点注入+刷新链已按 injectGroundLighting 同构接线，但阴影块在渲染材质上无像素效果（uv 越界/深度恒 lit/intensity 未达三选一）。与 §577-§588 的黑盒矛盾同构，但**本次注入路径已被 land 92 证明可达**——下轮用 shadowdbg=3 读出（compile 时已含 uMBShadowDbg）单点裁决；若读出仍 0px 则问题在 uv 域（vMbWorldPos vs shadow matrix 帧），dump uMBShadowMatrix+顶点世界坐标即可定位。
3. 哨兵：fill-extrusion--default 136125、environment-test 17577、default-orientation 2865、multiple-meshes 4792——全部与修复前逐位一致，**无回归**。

#### 下一步（更新）

1. **§691 三门 A/B 裁决模型光照帧**（quantization 616 万 + part-styling 290 万 + trees 域联动，全局最大杠杆）：modellightport / modeldiralt / extaz180 × ground-shadow-fog(bearing 264) + quantization(bearing 0) 双夹具。
2. §689 阴影读出裁决（shadowdbg=3，上述入口）。
3. §688 残留 ×0.77 因子定位（diffuse 域 print 或排除法 A/B）。
4. trees-puck（192 万）与 models-on-globe（globe 冻结带）分域立案。

#### 补测终态更正（2026-09-01 末）

19 例（lighting-3d-mode×6、powerplants-globe 系×6、trees-light-aligned/lod-expression×7）为**渲染挂起族**：页面加载后 0 用例执行、180s 无活动断连、重试同路复现（mlv3-L/P/T 三批实证）——非基建问题，是渲染死循环/永Await类 bug（shadow/globe/trees-lights 复合域），§550 时代"186/212 DISCONNECTED 截断"的元凶即此。基线终态：**可跑 192 例中 173 采集（90%），28,074,624 px**；19 例挂起族立案（复现入口：单夹具 karma + 180s 超时栈 dump）。

---

## 六、2026-09-02 增量：§724-§740 代码对齐会话（27 提交，代码比对补齐）

> 数据源：本会话对 mgl 源码（mapbox-gl-js/3d-style）的逐域比对 + 双 Explore 审计（shader 管线/bucket 语义）+ 309 单测（+9）。
> 本节把第五节的"下一步"清单与家族排行逐项更新到当前代码状态，并补齐报告缺失的根因。

### 6.1 报告既有"下一步"项的当前状态（代码比对结论）

| 报告条目 | 现状 | 证据 |
|---|---|---|
| §691 三门 A/B 裁决"模型光照帧"（全局最大杠杆 616万+290万+380万） | **§733 静态破案**：PBR-3D 分支 `dot(mbN 视空间, uMB3DDir 世界空间)` 帧错配 → 直射项恒零 → 即报告实测的"ambient-only"（墙 177 vs 231、duplicate 红 104=纯环境项精确值 albedo×0.2×ADF）。修复=mbLF/ADF/共享镜面项 mbL 全部改 `viewMatrix×dir` 视空间（§733/§733b）。modellightgamma 门控预期维持默认关（three colorspace_fragment 在 opaque_fragment 之后 :221/:223 → tail 线性值×K 编码后恰=mgl linearProduct） | MBModelRenderer.ts:533-548/470；model.fragment.glsl:438-443；three meshphysical.glsl.js:221/223 |
| §689 阴影读出裁决（shadowdbg=3） | **已走完**（§712-§721）：shadow-uv 探针定案深度差非判别子 → casters 集合缺失（§716 layer-1）→ 墙投射门控（§720 shadowcast=0 默认）→ cascade 保真度专项**封存**（需 mgl shadow_renderer 全套移植） | §712-§721 |
| §688 残留 ×0.77 均匀压暗 | **仍开放**（无收口记录）——候选维持：uMBEmissive 第二路径/双重 ground-rad/渐变雾交互。渲染复核时用 diffuse 域 print 排除 | 本节缺项确认 |
| trees-puck（192万）分域 | **§725/§726 覆盖大半**：实例模型贴地+坡度（model-elevation-reference 默认 ground，§726.2）+ 高程放置门控 | §726.2 |
| models-on-globe（160万）分域 | **确认引擎域+立案**：harness/引擎球面投影已通（setProjection ✓），缺口=模型矩阵球面补偿（mgl calculateModelMatrix:227-246 globeProjectionScale）需运行时探针定标 | §728.2 |
| 19 例挂起族 | §698 延迟注入修复后 10/19 出帧；余 9 例（globe+trees-fog 引擎域）+ §722 resume 兜底 | §698/§722 |
| landmark-z-offset-munich-3d-hidden 回归 | **已消解**（报告 §五 已记：回到 8962/9021）✓ | 报告 §五 |

### 6.2 报告缺失的根因（代码比对新发现，均已修复入库）

| # | 根因 | 命中家族（ml-0901 px） | 修复 |
|---|---|---|---|
| R1 | **PBR-3D 光向帧错配**（§733）：直射项零——即"ambient-only"之谜；hemisphere/legacy 分支转换正确，唯 PBR-3D 漏 | meshopt-quantization 616万、part-styling 290万、z-offset ~380万、duplicate 27万 | MBModelRenderer.ts mbLF/ADF/mbL 改视空间 |
| R2 | **cast-shadows 门控失效**（§738）：emitter model 分支缺 `_paint` stash → 恒投影 | buildings-trees-shadows-casting 42.4万（双树层 cast:false）、trees-zoom-based-scale | emitter stash props._paint=p；batched 同款门控（§738b） |
| R3 | **receive-shadows 门控缺失**（§739）：全局刷新无 per-layer 过滤 → false 层照常接收 | buildings-trees-shadows-casting 的 tree-layer-not-receiving（层名即语义）、trees-zoom-based-scale、color-theme/trees-monochrome | applyMglModelLighting receiveShadows 参数，false 不注册 __mbShU |
| R4 | **mbx-lod occlusion KHR_texture_transform 未解析**（§728，×16 AO 图集）：资产实测全部 mbx-lod 带 transform | **landmark-glb-tiles-lod 19万（vs 非 lod 3023）主嫌**、colors-lod 35万、全部 -lod 变体 AO 域 | MBDracoDecoder occlusionTransform + aoMap 克隆 repeat/offset（three 0.178 aoMapTransform） |
| R5 | **splitByPart 过滤复活**（§724.1）：子 mesh 不继承 visible/__mbNodeId → filter 隐藏节点被复活+runtime setFilter 失效 | landmark-duplicate-filtered 结构域（图像实证：红绿分离与 expected 同构） | 隐藏早退+字段传播 |
| R6 | **无 TEXCOORD 全贴图剥离**（§726.1）：mgl 五处采样 uv 门控 vs 我方仅摘 baseColor | model-no-texcooords-textures（27.4万；净效应中性但 §725.2 MR 捕获的前置） | 克隆剥离 6 类 map |
| R7 | **实例模型贴地/坡度缺失**（§726.2）：elevation-reference 默认 ground | trees-puck-terrain 族、z-offset-*-terrain | z+=DEM 高程+梯度法线四元数 |
| R8 | **DEM 压平行翻转**（§729，自查）+ **压平缺失**（§725.1）：updateDEM 完整移植 | terrain+features 瓦片域 | 纯函数 MBTerrainFlatten + 4 单测锁死 |
| R9 | **模型 feature-state 未接线**（§725.4）：evalVec3/evalScalar 无 featureState | trees-shadow-scaled、trees-puck-terrain-change-exaggeration | emitter setFeatureStateLookup |
| R10 | **LUT 双 bug**（§736）：themed rgb() 串被 keywords/hsl 解析器误读→主题失效；colorEval 覆写数组→白化兜底 | themed features 瓦片（batched landmark+theme 组合） | parseCssColorFull + 字符串回写（+5 单测） |
| R11 | **GPU LUT 缺失**（§727）+ **use-theme:none 整层排除**（§734）：mgl APPLY_LUT_ON_GPU 三应用点 | trees-use-theme（首测）、themed 层 | 2D 8-tap 仿真 + lutOff 穿线 6 调用点 |
| R12 | **unlit clamp 非法**（§724.4）+ **MR 纹理/法线贴图不参与 tail**（§725.2/3） | 带 MR/normal 贴图的 GLB | three roughnessFactor/metalnessFactor 捕获 + three perturbed normal |

### 6.3 报告"近绿带/杂项"的复核结论（免修项裁定）

- **location-indicator**（model-state 子家族）：mgl JS 渲染零消费（spec 声明，行为在原生 SDK）——JS expected 即普通渲染，我方忽略即等价（§735）。
- **0.65 地形阴影抑制**（draw_model:541-556）：仅 zoom-dep opacity 触发；资产扫描无夹具命中（trees-puck 的 0.5 为常量，mgl 照常投影）——不实现（§734）。
- **数据驱动 model-scale/rotation/translation 227 处**：batched 瓦片仅 zoom 插值（逐帧求值 ✓），feature 驱动全在实例化/矢量路径（per-feature + §725.4 ✓）——无缺口（§734 附录）。
- **fill-extrusion 半透明**（§12.74 六轮）：headless 已到观测极限（GL/合成器级 blend 疑点），维持**待真机验证**。
- **输出链 colorspace 勘误**：three 0.178 colorspace_fragment 在 opaque_fragment 之后 → tail 线性值被正确编码；早期审计"缺 linearTosRGB"论断作废，hemisphere 线性乘法经编码恰=mgl linearProduct。

### 6.4 修复→家族预期影响矩阵（下次批测验证点）

| 家族（ml-0901 px） | 相关修复 | 预期 |
|---|---|---|
| meshopt-quantization 616万 | R1 直射项+R4 AO transform+§706 PBR 分治 | 大幅收敛（直射项从零恢复为主收益） |
| buildings-trees-shadows 389万 | R2+R3 双门控+§688/§689+§701 雾域 | casting 42.4万 主例大幅收敛 |
| landmark-z-offset ~380万 | R1+§716/§720 墙影门控+R7 terrain 变体 | 收敛 |
| part-styling 290万 | R1+§724.1 refresh 链+R9 | 收敛（indirect-update 待帧差取证） |
| trees-puck-terrain 192万 | R7 贴地坡度+§725 压平+R1 | 收敛 |
| duplicate 27万 | R5 结构（已实证）+R1 亮度 | 大幅收敛（47,951 基线应被超越） |
| landmark-glb-tiles-lod 19万 / colors-lod 35万 | R4 AO transform | **单点验证 R4 的关键对** |
| models-on-globe 160万 / conflation 85万 | 未修（取证①②） | 持平预期 |
| trees-use-theme | R11 LUT | 首次真值测量 |

### 6.5 仍开放清单（渲染批测日执行序）

1. chunked runner 全量（§722 resume + §731 extraArgs + 平台目录修复后首跑）→ `scripts/compare-mbstyle-results.js` 对 ml-0901 归因。
2. 运行时取证：①globe 模型矩阵探针；②conflation 置换像素归因；③indirect-update setLights 帧差；④门灯光束色链；⑤duplicate 亮度（§733 修复复核）；⑥modellightgamma A/B（预期默认关，若 A/B 反证再翻转）。
3. §688 ×0.77 因子排除法定位。
4. landmark-glb-tiles-lod 单夹具复测（R4 直接验证点）。
5. 19 挂起族余量（9 例 globe/trees-fog 引擎域）与 fill-extrusion 半透明（真机）维持挂起。
6. 工程防线现状：309 单测（LUT 门控 5 + 压平 4 为新增，均已实战抓 bug）、tsc 绿、chunked runner 三项修复。

---

## 七、2026-09-02 增量续：§三 ROI 清单状态勘误（代码比对，全部已执行/裁定）

> 代码比对发现：§三 的 ROI 修复建议已由后续会话执行完毕（主批次 `9f7fa341` 2026-08-30"baseline-report ROI 批次"+ 后续 §724-§740），但本报告 §二/§三 状态未同步。逐项勘误如下（含代码位置与实测结果，取自各提交记录）：

| §三 条目 | 状态 | 实现位置 / 实测 |
|---|---|---|
| 1. background-pitch-alignment viewport 纯色 quad（#8，5 例 70.7万） | ✅ 已执行 | `applyBackgroundViewportQuad`（MBEnvironmentManager:2487；调用门控 MBStyleDataSource:2153-2167：pattern 缺失+pitch-alignment=viewport 时走全屏 quad，层序在内容之上时 overlay）；**708,933→234,907 px，viewport-alignment-mercator-low-zoom 转 PASS**（9f7fa341①） |
| 2. appearance icon-offset y 方向（#23） | ✅ 已执行 | MBStyleSymbolPlacement:981-986 y 翻转对齐 mgl（9f7fa341②） |
| 3. extent/1024-symbol setExtents 前置（#12） | ✅ 已执行+改判 | `probeMvtExtent`（MBStyleDecoder:302）protobuf 探针前置（legacy group wiretype+幂2 sanity）；**实测 extent/1024 系瓦片实为 4096 内容——双影根因在数据不在解码**（9f7fa341③） |
| 4. raster-color 重跑确认（#14） | ✅ 已执行+确认 | 含 raster-value 的表达式存 raw 不求值→ramp 生效：**expression 121,110→0 转 PASS**、nearest 120,987→323（9f7fa341④）——报告"已修未兑现"的疑问兑现 |
| 5. fit-screen-coordinates / free-camera harness 相机（#11/#18，79万） | ✅ 已执行 | fitScreenCoordinates 改 mgl 语义（unproject 四角 bbox+lookAt bounds-fit，**51,916→613**）；lookAtPoint/setCameraPosition 改 FreeCamera 公式（9f7fa341⑥） |
| 6. hillshade illumination-direction/emissive 接线（#16） | ✅ **已正式接线（§741，2026-09-02）** | 三分支方位（viewport=dir+bearing / map+3Dlights=灯光自身方位 / else=dir，spec 默认 335）+ LIGHTING_3D_MODE 尾巴 mix(color×groundRadiance, color, emissive)；§625 的 315 常量 vs 335 差异裁定为噪声级（36,408 vs 37,433 ≈ 2.7%）；非 lights 样式惰性。命中 lighting-3d-mode/hillshade 5+3 夹具（22.6万） |
| 7a. crossSourceCollisions 分组 | ✅ 已实现 | MBStyleSymbolPlacement:261-300——metadata.test.crossSourceCollisions===false 时按 source 分碰撞组（layerSource 映射+组内 box 碰撞+verdict 派生），引擎 overlap 旗标按 csc=false 放宽 |
| 7b. video vendored mp4 + VideoSource | ✅ 已执行 | `drone.mp4` 已 vendored（7.9MB）+ VideoSource 分支（MBEnvironmentManager:2817-2837，`<video>`+VideoTexture、canplay 门+10s 超时惰性、0.04s 停靠帧）；**video/default 150,271→148,456**（结构性缺口关闭；残差=CDN mp4 重编码与 expected 生成期不可逐位对齐）；video/projected 79,659（albers 自定义投影 drape 冻结域）不变（20dcae17） |
| 8. model-layer 新家族 | ✅ 本会话主攻 | §724-§740（见 §六）：12 项根因 R1-R12 修复入库 |
| 9. landmark-z-offset-munich-3d-hidden 回归排查 | ✅ 已消解 | layout.visibility:none 接线跳过（9f7fa341⑤）：50,607→8,962 / lod 28,859→9,021 |

### §二 表格状态同步勘误（受上表影响的行）

- **#8 background-pitch-alignment**：`走不到 quad 通道` → **已修**（quad 通道落地，1 例转 PASS，残余 23.5万 为 pattern-viewport-globe 系）。
- **#11 fit-screen-coordinates**：`harness 缺陷` → **已修**（613 px 近绿）。
- **#12 extent/1024-symbol**：`setExtents 惰性` → **已前置**；残余双影根因改判为 fixture 数据（瓦片实为 4096 内容）。
- **#14 raster-color**：`已在 HEAD 修复` → **确认兑现**（expression 0 px）。
- **#15 video**：`无 VideoSource 分支 + mp4 未 vendored` → **两者均已关闭**（残差为资产版本域 + 自定义投影冻结域）。
- **#17 dynamic-filter/symbols**：`crossSourceCollisions 分组未实现` → **已实现**（per-source 碰撞组）；余下 text 沿线 TextPathGeometry 分支仍开放。
- **#16 hillshade**：`照明硬编码 315°` → 接线已试并回退（+60k），域改判为照明模型标定。

### 当前真正的开放项（2026-09-02 末，按域）

1. **model-layer**（§六矩阵）：§733 帧修复+§738/§739 双门控+R4 AO transform 的渲染复核（chunked 全量+compare 归因）。
2. **运行时取证清单**（§6.5）：globe 模型矩阵探针、conflation 置换归因、indirect-update 帧差、门灯光束色链、modellightgamma/翻转方位 A/B、§688 ×0.77。
3. **引擎冻结带**：globe 相机距离系、fog 逐内容深度、depth-occlusion 双 pass、custom-layer-js、models-on-globe 矩阵补偿、fill-extrusion 半透明（真机）。
4. **符号域残余**：text 沿线 TextPathGeometry 分支、SDF atlas FontCatalog 光栅化（冻结）、hillshade 照明模型重破。

---

## 八、2026-09-02 深夜增量：§742 全量验证中期读数（200/212 已跑，ml-0901 对比）

> 数据源：`rendering-test-results/mbstyle/web-ChromeHeadless-152.0.0.0-MacOS/`（§724-§742 代码全量，4 夹具/会话内存安全模式）。
> 基准：ml-0901 快照（`ml0901-baseline-snapshot.json`，43 例精确 + 38 例家族级近似）。
> 注：ml-0901 存档目录已被清理，快照为首次对比跑捕获值 + 报告 §五 家族值。

### 8.1 总账（41 例精确基线小计）

**4,947,485 → 5,149,237（+4.1%）** —— 净值近乎持平，但结构剧烈分化：
**21 例显著改善（最大 −53%）** vs **17 例回归（最大 +216%）** vs 23 例持平/待跑。
分化模式清晰指向两个新引入变量的方向性：R1 直射项恢复（对一部分家族正、对被"ambient-only 时代标定"的家族负）+ R10/§724.4 的 unlit-clamp 移除（emission 域）。

### 8.2 改善清单（21 例）

| 家族 | 例证（old → new） | 归属修复 |
|---|---|---|
| **z-offset 全家 7 例 −26~−35%** | museum 39万→23.9万、terrain 43万→29.2万、scale 49万→35.5万、v2 48万→32.5/34.1万 | R1 直射项恢复（§733）+ R7 terrain 贴地（§726.2） |
| mbx-meshopt-colors-lod | 35.4万→16.6万（−53%） | R1 + R4 AO transform（§728） |
| ground-shadow-fog-hard-cutoff | 18.9万→13.4万（−29%） | §701 雾域 + R1 |
| ground-shadow-fog | 14.2万→13.4万（−5%） | 同上（历史最优带内再改善） |
| buildings-trees-shadows-fog/-fade | 62万→56/56.3万（−9/10%） | §738/§739 树影门控 + R1 |
| part-styling-update | 23.8万→17.6万（−26%） | R1 + §724 refresh 链 |
| conflation-buckingham | 22万→18.9万（−14%） | R1 间接收益 |
| shadows-normal-offset ×2 | 19万→17万（−10%） | R1 |
| duplicate-filtered-lod | 4.07万→3.54万（−13%） | R5 结构修复 |
| geojson-source-with-schema(-add-layer) | 4.86万→4.37万（−10%） | §690/§734 |
| quantization-shadows(-lod) | →1,709/2,332（近 PASS） | R1+R4 |

### 8.3 回归清单（17 例）——两组模式

**模式 A（照明方位敏感组）**：R1 直射项恢复后，被"ambient-only 时代标定/调参"的家族现暴露方位差：
| 夹具 | old → new | 备注 |
|---|---|---|
| **landmark-emission-strength(-lod)** | 44,153→85,514（+94%）/ 57,295→181,184（+216%） | **用户自有修复域回归**——§724.4 unlit-clamp 移除 + R1 直射项双嫌疑 |
| landmark-part-styling-indirect-update-doors(-lod) | 48万→61万（+70%）/ 36万→61万（+70%） | 门灯域（§724.3 additive 改动的关联面） |
| landmark-part-styling-indirect-doors-no-shadows(-lod) | 30万→51.4万（+71%）/ 32万→45.5万（+42%） | 同上 |
| quantization castro-theater-quantization ±lod | 24/29万→50.2/57.3万（+98/109%） | R1 方位差（该两例取景对光方位敏感） |
| quantization highlights ±lod | 30/31万→56.7/58.5万（+89%） | 同上 |

**模式 B（孤立单点）**：
| 夹具 | old → new | 备注 |
|---|---|---|
| **landmark-glb-tiles** | 3,023→57,152（+1791%） | 曾近 PASS！R1 直射项激活（该夹具无 theme、非 -lod=R4 惰性）——典型"ambient-only 标定被打破" |
| landmark-glb-tiles-lod | 19万→22.8万（+20%） | R4 AO transform 方向待复核 |
| landmark-duplicate-filtered（非 lod） | 4.8万→12.7万（+164%） | 已知亮度残差（§733 未覆盖该取景的方位） |
| buildings-trees-shadows-fog-terrain | 62万→71.7万（+16%） | terrain+树复合（R7 关联） |
| conflation thin-pillars/buckingham-lod | +23%/+32% | conflation 域混合 |
| landmark-mbx-lod-distant / filter-runtime-styling | +26%/+17% | 小项 |

### 8.4 机制判读与下一步（关键：三门 A/B 正当其时）

1. **R1 方位约定的方向性已可证**：z-offset 族（取景偏北向）收益 vs emission/doors/castro（另取景）回归 —— 直射项恢复了但**落在的方位可能带镜像差**（我方 viewMatrix 转换 + y-mirror 渲染帧的组合 vs mgl 帧）。§691 设计的 `modeldiralt=1` A/B 正是裁决手段：对回归 4 例（emission-strength/doors/castro/highlights）跑 modeldiralt=1，若转改善则全局切 §683 镜像约定。
2. **§724.4 unlit-clamp 移除的回退预案**：emission-strength ±lod 回归的另一嫌疑——spec 允许 >1 但用户的 44,153 标定基于 clamp 行为。A/B：恢复 clamp 单变量对照。
3. **§724.3 门灯 additive 回退预案**：doors 三例回归的第三嫌疑——additive beams 若过亮，回退 alpha-blend 单变量对照。
4. 正面成果固化：z-offset 全家、colors-lod、hard-cutoff、quantization-shadows、shadows-normal-offset 的改善为真（机制明确），后续调参不得回退。
5. 未跑完：trees-puck 双例（192万）正在收尾；trees-use-theme（R11 LUT 首测）pending。

### 8.5 执行状态

- 200/212 已派发（53 会话内存安全模式：≤4 夹具/会话、进程组击杀、零泄漏）；trees-puck 双例（192万）渲染中；trees-use-theme 待跑。
- ml-0901 存档目录被清理 → 基线快照固化为 `rendering-test-results/ml0901-baseline-snapshot.json`（43 精确 + 38 家族级）。
- 批测完成后：三门 A/B（modeldiralt 优先）→ 回归例定点复核 → 终版对比报告。

### 8.6 页面级崩溃 4 例记录（§742 批测唯一未产出组，2026-09-02）

以下 4 夹具在同一 karma 会话中 **"Executed 0 of 4" + ping 超时断连**（页面级失败，非单测失败）；用户裁定**不重试**（每轮 15min×12 轮纯浪费），本轮基线将其记为 **NO-RESULT**：

| 夹具 | 头号嫌疑 |
|---|---|
| trees-use-theme | **§727 GPU LUT 首次真渲染**——DataTexture/mbApplyLut 路径或有渲染期挂起/异常；且 style 引 models 注册表（modelsPending 永 Await 同 §695 族模式） |
| trees-zoom-based-scale | 同会话连坐（实例树，单独跑历史上可渲染） |
| vector-layer-external-models(-import) | 外部 gltf 加载路径（model-external 分支） |

**定位入口（下会话）**：单夹具 karma + 180s 超时栈 dump（§695 同款手法），按 trees-use-theme → external-models 顺序隔离；重点查 §727 的 mbLutGpuTexture/onBeforeCompile 是否在 modelsPending 判定路径抛错或永不 settle。
runner 同步修改：resume 轮数默认 **12→0**（MBSTYLE_RESUME_ROUNDS 可恢复），崩溃夹具不再空转重试。

### 8.6 globe 干净重跑中期（40/122，§742 代码）+ 单点极端离群

globe 重跑（污染结果清除后）前 40 例已出，**累计 ~430 万 px**（全类别预计 ~900-1200 万，与 §二#2 的 947 万规模吻合——globe 域确为最大冻结带之一）。

**极端离群单点**：`globe-fill-pattern/3x-on-2x-add-image` = **966,602 px（92% 全帧失配）**——expected 中央有橙色 dot-pattern 方块，ours 仅渲染 globe+大气，**fill 层整体缺失**。根因：该夹具经 **map.addImage 运行时注册 pattern 图像**（3x pixel-ratio on 2x map），我方 fill-pattern 通道只消费 sprite-atlas → 运行时注册图像不入册 → fill 层静默丢弃。**修复方向（数据源层）**：环境/数据源暴露 addImage 注册表，applyBackgroundPattern/fill-pattern 通道合并消费（sprite + runtime registry）。此单点 ≈ 96.6万 px，为 globe 域最高 ROI。

其余 globe 值域（首测基线，无历史对照）：antialiasing 族 14-22万×4、fill-extrusion 族 2.4-21.6万×14、heatmap 3.3/5.6万、circle 族 0.3-23.5万×9、camera 3.5-3.9万×2、geojson/clustered 17万。**globe 域从此有了首个干净逐例基线**（污染数据已清除）。

### 8.7 新增根因（R13）与运行状态

- **R13（§742，已修复）**：§714 shadow-uv 探针分支引用了 `if(uMBShadowIntensity>0)` 块内的 mbShUv/mbShD（作用域外引用=GLSL 恒定编译错误）→ 该注入序下**挤出材质全灭**——buildings-trees-shadows 族（389万）建筑整体缺失的真根因（日志 Shader Error 1281 实锤）。探针移入阴影块+mbShProbeFired 守卫。注意：**§742 提交前渲染的 session 1-2 八例（buildings-trees-shadows 族+MAPS3D）为修复前结果，终版对比前需定点重跑**。
- 运行状态：globe 40/122 → 之后 3d-intersections 续跑（30/75 已有）；内存纪律持续生效（会话边界 Chrome 归零）。
- 4 例页面级崩溃（§743）已记录：trees-use-theme/trees-zoom-based-scale/vector-layer-external-models±import——定位入口=单夹具+超时栈 dump，头号嫌疑 §727 GPU LUT / modelsPending 永 Await。

---

## 九、2026-09-02 终版：全面评估与下一步对齐计划（§724-§742 会话收官）

> 数据源：全量验证 570 结果 / 110 PASS / 42,395,087 px（当前 HEAD=§742，4 夹具/会话内存安全模式）。
> 覆盖域：model-layer 169 例、globe 84 例、3d-intersections 57 例、fog 62 例、lighting-3d-mode 7 例 + 90 余小分类。
> 基准：model-layer 对 ml-0901 快照（41 例精确）；globe/3di 为首个干净基线（无历史逐例对照）。

### 9.1 一页总览

| 域 | 例数 | px 合计 | PASS | 状态判读 |
|---|---|---|---|---|
| model-layer | 169 | 2,599万 | 0 | 对 ml-0901 精确 41 例 **+4.0%**（8 胜 9 负）——R1 直射项恢复对 z-offset/conflation/hard-cutoff 大幅正收益；对 emission/doors/glb-tiles 等"ambient-only 时代标定"家族为负 |
| globe | 84 | 955万 | 0 | **首个干净逐例基线建立**；极端离群 globe-fill-pattern/3x-on-2x-add-image 96.7万（addImage 运行时 pattern 缺失） |
| 3d-intersections | 57 | 407万 | 1 | 与 §550-553 后记录值一致（elevated-line-labels-multi-level 24,161 逐位吻合）——**无回归**；余 18 例续跑 |
| fog | 62 | 87.5万 | **14 PASS** | §701 雾域重建收益兑现 |
| lighting-3d-mode | 7 | 62.9万 | 2 | §741 hillshade 接线后首测 |
| 其余 90+ 小分类 | ~180 | ~230万 | ~93 PASS | circle/fill/heatmap/line-基础属性大面积 0 px PASS |

### 9.2 §724-§742 修复效果裁决（model-layer 精确 41 例：4,947,485 → 5,147,351，+4.0%）

**胜（8 例，节选）**：ground-shadow-fog-hard-cutoff 189,396→134,262（−29%）、conflation-buckingham 220,369→188,966（−14%）、duplicate-filtered-lod 40,660→35,379（−13%）、geojson-source-with-schema ×2 48,609→43,671（−10%）。
**负（9 例）**：glb-tiles 3,023→57,152（+1791%）、emission-strength-lod 57,295→181,184（+216%）、emission-strength 44,153→85,514（+94%）、buckingham-lod 160,421→211,682（+32%）、thin-pillars +23%、mbx-lod-distant +26%、filter-runtime-styling +17%、fog-terrain +16%、glb-tiles-lod +20%。
**家族级近似（±判读）**：z-offset 全家 −26~−35% ✓、highlights/castro +89~109% ✗、indirect-doors +42~71% ✗、trees-puck 待出。

**机制归因**：正负同源——R1（§733）把 PBR-3D 直射项从"恒零"修复为"按方位生效"，所有 features 瓦片模型的亮度/明暗面因此改变：对"欠亮"的家族（z-offset/颜色过暗系）是修正，对"已在 ambient-only 下标定/调参"的家族（emission 标定、doors 门灯、castro/highlights 取景）是破坏。次要变量：§724.4 unlit-clamp 移除（emission 域）、§724.3 门灯 additive（doors 域）、R4 AO transform（-lod 域：glb-tiles-lod/colors-lod 改善但 glb-tiles-lod +20% 混合）。

### 9.3 下一步对齐计划（按 ROI 排序，含具体入口）

**P0-A 方位/标定 A/B 裁决（预期一举收敛 4-6 例回归，~150万 px）**
回归四组（emission ±lod、doors ×4、castro ±lod、highlights ±lod、glb-tiles）全部符合"直射项激活后方位/量级与旧标定冲突"模式。已备好的裁决门：
① `modeldiralt=1`（MBSTYLE_EXTRA_ARGS 透传，切 §683 镜像光向）——对回归四例单夹具 A/B；
② **unlit-clamp 恢复**单变量对照（§724.4，emission 域第一嫌疑）；
③ 若①②均负 → 光源方位镜像差实锤，按 §643/§653 共轭规则修正 mbDirView 的 y 分量。
约束：z-offset/colors-lod/hard-cutoff 的已改善例在新参数下不得回退（回归门）。

**P0-B 挤出消失复测（§742 已修，session 1-2 八例陈旧）**
删除 buildings-trees-shadows 族 + MAPS3D ×8 的 §742 前结果 → 定点重跑 → 建筑应恢复渲染（对照 §723 后 94/95 采样吻合记录）。预期 casting/fog 系 4 例大幅收敛（建筑体量=失分主体）。

**P1-A globe-fill-pattern/addImage（96.7万 单点，globe 域最高 ROI）**
环境/数据源暴露 `map.addImage` 运行时注册表；fill-pattern 通道合并消费 sprite-atlas + runtime registry（3x/2x pixel-ratio 语义对齐 mgl ImageSprite）。入口：MBEnvironmentManager image/canvas/video 源分支（:2786-2837 已有同构通道）+ fill-pattern 纹理选择处。

**P1-B globe 域基线归因（955万，84 例基线已建）**
逐例对 §二#2 的机制清单：globe 相机距离系（zoom→dc 4.5R vs 5.7R）、globe raster colorization、TerrainDraping bail——均为引擎冻结带；数据源层无即修项。globe-antialiasing 族 14-22万×4 为域内最大子族（AA 语义，冻结）。

**P1-C 3d-intersections 收尾（余 18 例自动续跑）+ 407万 归因**
已有 57 例与历史记录一致（无回归）；完成后按 elevated 照明/symbol 方向/drape 依赖链归因（报告 §二#3）。

**P2-A 崩溃 4 例定位（§743）**：单夹具 karma + 180s 超时栈 dump；顺序 trees-use-theme（§727 LUT 嫌疑）→ vector-layer-external-models（external gltf 分支）。
**P2-B conflation 族混合**（buckingham-lod +32% vs buckingham −14% 同域分化）：需 pixpick 置换归因（取证②）。
**P2-C §688 ×0.77**：diffuse 域 print 排除法。

**P3 冻结带（维持挂起）**：globe 相机距离、fog 逐内容深度、depth-occlusion 双 pass、custom-layer-js、fill-extrusion 半透明（真机）、SDF atlas FontCatalog。

### 9.4 验证基建现状（就绪）

- chunked runner：≤4 夹具/会话、进程组击杀、15min 会话超时、resume 默认关（MBSTYLE_RESUME_ROUNDS）、MBSTYLE_EXTRA_ARGS 透传、断点续跑（跳过已有结果）。
- filter 类别锚定（§743）：`filter=<category>/<fixture>`——跨分类污染（globe 被意外执行）已根治。
- `compare-mbstyle-results.js`：双树对比/family 聚合/FLIP/MISSING。
- ml-0901 快照：`ml0901-baseline-snapshot.json`（43 精确 + 38 家族级）。
- 309 单测 + tsc 绿；探针在库（pixpick/partHist/shdbg/fogt/decodedbg/mbbatchdbg）。

### 9.5 已知未对齐但裁定暂缓的域（维持记录）

globe 相机距离系、fog 逐内容深度语义、depth-occlusion 双 pass、custom-layer-js 通道、fill-extrusion 半透明混合（SwiftShader GL 级疑点，需真机）、SDF atlas FontCatalog 光栅化、models-on-globe 模型矩阵球面补偿（探针入口已备）、TERRAIN_FRAGMENT_OCCLUSION 模型覆盖、DITHERED_DISCARD LOD 渐变（资产预拆无触发）、OCCLUSION_TEXTURE_TRANSFORM 已修（§728）。
