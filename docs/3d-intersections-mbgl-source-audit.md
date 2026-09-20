# 3d-intersections mbgl 源码级对齐审计（g53 起点）

> 2026-09-20。方法变更：停止盲调 A/B 旋钮，改为以仓库内 `mapbox-gl-js/`（mbgl 参照源码）为权威逐行对齐。
> 本文档固化两路并行审计的完整差异清单，后续每轮修复须引用条目编号，修复 = 让我方代码与 mbgl 源码字面/数值一致，而非经验调参。

参照：`mapbox-gl-js/3d-style/elevation/*`、`mapbox-gl-js/3d-style/render/*`、`mapbox-gl-js/3d-style/shaders/*`、`mapbox-gl-js/src/shaders/_prelude_lighting.glsl`
我方：`@flywave/flywave-mbstyle-datasource/src/`

## A. 几何构建（elevated_structures.ts ↔ MBElevatedStructures.ts）

| # | 条目 | 性质 | mbgl | 我方 | 状态 |
|---|------|------|------|------|------|
| G1 | shadow caster segment（隧道三角形 +TUNNEL_ENTERANCE_HEIGHT=4 抬升后第三份索引入 mesh） | 缺失 | elevated_structures.ts:165,409-411 | 无第三份索引；ElevatedStructuresMesh 无 shadowCaster 字段 | TODO |
| G2 | 护栏边选择仅 `guardRailEnabled` 门，无共享边抑制 | 我方多出 | elevated_structures.ts:590-592 | :906-948 coarse-grid 抑制（__mbRailSuppress）+flip/lift 旋钮 | TODO（移除，g52w2 已证零像素贡献） |
| G3 | 渲染环 safeArea bounds 过滤（`edgeIntersectsBox`） | 缺失 | elevated_structures.ts:230-252 | 仅 isOnBorder | TODO |
| G4 | 结构高度烘焙 zOffset（m_currentZOffset level 补偿折入高度） | 刻意偏离 | 无 | :659-706 | 保留（帧对齐补偿，验收渲染测试） |
| G5 | intersectionsAttributes：a_pos Int16 + a_height Float32；法线 quantize `trunc(n*2^14)` | 编码不同 | fill_attributes.ts:13-20; es.ts:98-100 | 全精度 float THREE attributes | 等价性可接受（渲染器不同），量化差异仅影响精度 |
| G6 | 单 mesh 五段 [bridge\|tunnel\|非隧道道路\|隧道道路\|隧道顶盖]；道路三角形在 structures 顶点缓冲（零法线） | 结构不同 | es.ts:346-417 | 仅 [bridge\|tunnel]，deck 独立渲染 | 部分对齐（deck 分离是渲染器约束，但 caster 三角形须补，见 G1） |
| G7 | `unevaluatedGroup` 为空 → 返回空 ElevationPortalGraph（portal 全丢弃） | 我方偏离 | elevation_graph.ts:62-65 | MBElevationGraph.ts:95-101 保留 evaluated | TODO |
| G8 | portal 与 edge 共用单一 `computePosHash`（`p.x & 0xFFFF` int32 截断）+ bigint edgeHash | 两套量化 | es.ts:905-920 | portal `Math.round(v*64)` 字符串 vs edge `Math.round & 0xFFFF` | TODO |
| G9 | addPortalCandidates 遍历 MultiPolygon 全部外环 | 缺失 | es.ts:283-332 | 仅 clippedRingsCanonical[0]（MBTileDataEmitter.ts:2013-2015） | TODO |
| G10 | polygonSubdivision 用 SUBDIVISION_EDGE_EXTENSION=0.1 延伸细长裁剪四边形 | 未生效 | fill_hd_extension.ts:281; elevation_constants.ts:20 | MBPolygonClippingHD.ts:125-131 void 丢弃，无限半平面替代 | TODO（需验证等价性后替换） |
| G11 | flat-feature 快捷路径 / hole 质心重挂 | 我方多出 | 无 | :373-381, :427-451 | 保留（clip 库差异的桥接，验收为准） |
| G12 | depth/mask prepass 门控 `underground`（h<1.0）+ 地面拍平 mesh | 机制近似 | shader DEPTH_RECONSTRUCTION + drawDepthPrepass | 拍平 z=0 + renderOrder 9.55/9.56 | 见 S2 |
| G13 | ProgramConfigurationSet 双套 paint + FeatureSection populate | 机制不同 | es.ts:192-196,422-475 | decode 时静态求值分桶 | 缺 feature-state 更新路径（渲染测试暂不需要） |
| G14 | 高度米↔tile 往返（scale=0.5*metersToTile 等） | 等价 | es.ts:526-529,83-87 | :892,:955-956,:1018-1019 | 已验证一致 |
| G15 | prepareEdgePoints/computeFwd/截面/端帽/隧道墙 | 等价 | es.ts:537-813 | :984-1330 | 已验证逐行一致 |
| G16 | 常量表（zLevel/CLIP_MARGIN=1/MARKUP_BIAS=0.05/TUNNEL_THRESHOLD=5/ENTRANCE=4） | 等价 | elevation_constants.ts | MBElevationConstants.ts | 已验证一致（ELEVATION_EXTENT=4096 为我方补，同值） |
| G17 | unevalEdges 原地 sortSubarray vs 副本排序 | 等价 | es.ts:572,899-903 | :935-936 | 无影响 |
| G18 | 遗留简化实现 src/ElevatedStructures.ts（边界挤墙、#666666） | 并行旧路径 | — | 疑似废弃 | 确认无引用后删除 |

## B. GLSL 与渲染路径（draw_elevated_fill / shaders ↔ MBMaterialPatchManager / MBShadowRenderer）

| # | 条目 | 性质 | mbgl | 我方 | 状态 |
|---|------|------|------|------|------|
| S1 | linearProduct：`srgbIn * pow(k, 1/2.2)`（先加和系数再 gamma 压缩）；directional_factor_min 为 uniform | 公式不同 | _prelude_lighting.glsl:20-39,45-50 | :1382 直接线性乘；dirFactorMin=1-0.3*lum 亮度函数 | TODO |
| S2 | 地下遮挡：`v_height<0 → penetration=max(h+7.5,0); occlusion=1-acos(1-pen/4)/PI; color *= 1-pow(occ,2)*0.3` | 缺失 | elevated_structures_model.fragment.glsl:64-70 | 无 | TODO（高优，直接关系 tunnel 家族） |
| S3 | toSun 水平取反的校准轴折衷 | 等价性依赖校准 | 直接 u_lighting_directional_dir | :1280-1291 | 帧桥固化后再归一（遗留主项） |
| S4 | emissive 链（strength 硬编码 0）| 等价 | :49-54 | 未实现 | 无需 |
| S5 | INDICATOR_CUTOUT / FEATURE_CUTOUT | 缺失 | :41-44,56-57,76-82 | 无 | 渲染测试涉及 cutout 用例时再补 |
| S6 | depth_reconstruct：`vpos -= (u_camera_pos-vpos)*(vpos.z/(u_camera_pos.z-vpos.z))` 相机投影到 z=0；reset pass `gl_Position.z=w`（GREATER）；u_depth_bias（0.01 + lerp(easeIn) + ×2 GL 补偿） | 机制不同 | ds_reconstruct vertex:14-30; draw_elevated_fill.ts:182-193 | 解析拍平 z=0，无相机项、无 bias | TODO（隧道遮挡根因） |
| S7 | shadowDirection = 球坐标 clamp(polar,0,75°)（源向量直取 light direction） | 等价（实测一致） | shadow_utils.ts:9-25 | :1129-1136 | 已证一致 |
| S8 | 级联矩阵：mercator 球心 `camToWorldMerc*[0,0,-centerDepth*wsInv]`、frustum padding、Ti(pitch,bearing) roll、texel-snap 1e6 | 多项偏差 | shadow_renderer.ts:678-798 | RTE 球心、无 padding、three lookAt、snap 仅 RAW | 遗留主项（geo↔RTE 帧桥） |
| S9 | 级联 far：cascade1 far = cutout=3×cameraToCenterDistance；u_fade_range=[far1*0.75,far1] | 数值不同 | shadow_renderer.ts:333-363 | far=radius/dir.z | TODO |
| S10 | 深度图 DEPTH_COMPONENT16 + sampler2DShadow 硬件 GREATER 比较 + vec3 bias（offset 模式 [0.00010,0.0012,0.012]） | 机制不同 | shadow_renderer.ts:298-309,519,546 | RGBA 打包 + 软件 PCF + span ramp | TODO（three 侧可做 sampler2DShadow 等价近似） |
| S11 | normal offset：顶点级、沿法线（xy 取反+tileInMeters*n.z）、dotScale=(1-dot(n,dir))*0.5+0.5、per-cascade `2/tileSize*EXTENT/res*r*(vec?1:3)*lerpClamp(zoom)` | 公式不同 | _prelude_shadow.vertex.glsl:6-14; shadow_renderer.ts:533-546 | 接收端 world-up 0.03125 常数 + ground +10 hack | TODO |
| S12 | ground shadow：stencil mask pass + ColorMode.multiply sRGB 域 + plane_bias dFdx/dFdy；groundShadowFactor=A/(A+D) sRGB | 机制不同 | draw_elevated_fill.ts:296-329; _prelude_shadow.frag:106-125 | 全屏 quad、linear 域、alpha 0.7 近似路径 | TODO（MB_SHADOW_OVERLAY=1 路径废弃后归一） |
| S13 | 结构接收：逐顶点 u_light_matrix_0/1 → v_pos_light_view，v_depth=gl_Position.w，shadowed_light_factor_normal | 机制不同 | model.vertex.glsl:33-44 | fragment 反投影射线 | TODO |
| S14 | 主 pass DepthMode(LEQUAL,ReadOnly) + CullFaceMode.backCCW（有背面剔除） | 我方 DoubleSide | draw_elevated_fill.ts:51,108 | :716-721 DoubleSide（注释误称 mgl disabled） | TODO（改 FrontSide/CCW 需绕序验证） |
| S15 | fog v_fog_pos 注入 elevated model shader | 未证实 | model vertex:46-48; frag:72-74 | 通用 fog 链 | 待专项核 |

## 本轮修复顺序（源码字面优先，逐项可回退）

1. **S2** 地下遮挡公式 —— mgl 字面 GLSL，tunnel 家族直接受益。
2. **S1** linearProduct + directional_factor_min uniform 化。
3. **G8/G9/G7** portal hash 统一 + 多 polygon + 空组丢弃（mbgl 字面）。
4. **G2** 移除共享边抑制（mbgl 无此逻辑，g52w2 已证零像素影响）。
5. **G1** shadow caster 第三份索引（+4m 隧道顶盖）。
6. **G3** safeArea/edgeIntersectsBox。
7. S6/S9/S14 依次推进，每项落地前后跑 3d-intersections 全量 diff 对比。

## g53 实测结论（2026-09-20，逐旋钮新鲜 mtime 验证）

- **关键发现：g52 校准基线 18,161/18,170 是静默崩溃产物。** g52u 引入的共享边抑制代码引用了不存在的字段 `m_unevalVertices`（实际为 `m_unevalPositions`），`constructBridgeStructures` 每次抛 TypeError，被 `MBStyleDecoder.ts:1372` 的 `try { emitElevatedStructures(); } catch {}` 静默吞掉 → 护栏/隧道墙**从未被构建**。HEAD 的 18,170 = 无任何结构网格的残缺画面。g52w2 的"ON/OFF 逐位一致(18,161)"结论是同一假象（ON=崩溃）。教训：校准度量必须先验证构建路径真的执行。
- g53 修复后（mbgl 字面构建全部 guardRailEnabled 护栏，es.ts:590-592 无任何抑制门）：
  - shadows-junction 22,897（vs 崩溃基线 18,170，+4.7k = 内部护栏真实可见；mgl 同样构建这些护栏，靠渲染期深度重建遮挡——S6 未对齐前的预期过渡态）
  - shadows-tunnel 54,413（vs 校准态 56,530，−2.1k 改善，隧道墙真实构建后隧道族更接近 mgl）
- 单变量归因（junction）：G2/G7/S1/S2/G1 均非 junction 变化源（旧抑制等价重建后同样 22,897）；**G8 新 hash 反而 −2.2k**（旧 1/64 字符串 hash 25,121 → mbgl 字面 posHash 22,897）。
- 结构光照注入（injectStructure3DLighting）对 junction 夹具无像素贡献（structpow=0 零变化）——junction 结构材质疑似走 injectExtrusion3DLighting 路径，待核。
- 渲染度量基础设施陷阱：karma 结果文件可能陈旧（Executed 0 / SwiftShader 断连时不覆写），一切 A/B 必须以 mtime 新鲜度为准。

## g54 实测结论（2026-09-20 第二轮）

- **TS1128 已修复**：根因是 g52ab2 在 run() 的 model-raw 阴影块内拼接 uv-probe 块时，吞掉了 if 的 then 块收尾 `}`（与 g51p2 同期区域的编辑混淆所致），run() 体吞掉后续成员声明，`private renderDepthLayer2` 处报"Declaration or statement expected"。补回该花括号后 tsc TS1128 清零（karma webpack 不再带错 emit）。
- **S6 深度重建已按 mgl 字面落地**：①emitter 发射真实 3D 世界坐标 prepass 几何（弃用发射期解析拍平）；②ground(initialize) 顶点着色器做相机→地面 z=0 投影（`uMBEye.z > mbpW.z` 门控，mgl 字面）+ clip 空间 `z += u_depth_bias`；③mask(reset) 同投影后 `gl_Position.z = gl_Position.w` + GREATER；④u_depth_bias = computeDepthBias 字面（0.01；ortho lerp(0.0001,0.01,x^5) ×2）；⑤发射门控改 mgl heightRange.min 语义（initialize<1.0 / reset<0.0）。uMBEye 走既有 patchTileMaterials 逐帧刷新链。
- **注入路径核查结论**：护栏/隧道墙材质确实走 injectStructure3DLighting(:746)；deck 走 injectExtrusion3DLighting。junction 对结构光照公式旋钮（structpow）零像素响应的原因：mismatch 语义是"护栏存在 vs 不存在"的二元差异，明暗微调不改变 mismatch 计数。
- **S6 实测**：junction 22,897 / tunnel 54,413 / ortho-camera-tunnel 1,271（g53 态持平或微改善）——S6 语义是地下遮挡，与"内部护栏可见"是两个问题。内部护栏的 mgl 隐藏机制（g52h 悬案）不是 S6，归入下一轮绘制顺序/深度写入专项（mgl 主 pass 的 depth segment LEQUAL 语义 vs 我们 renderOrder 序列）。
- ortho-camera 用例在 SwiftShader 下浏览器崩溃无法取新值（g53 全量值 64,131 供参考，属于"护栏真实构建"的既有差异）。

## g55 实测结论（2026-09-21）

- **G3 safeArea 环过滤落地 = junction 悬案收敛**：`addRenderableRing` 增加 mgl 字面过滤（es.ts:240-252：两端点均不在 elevation.safeArea 内且边不与 bounds 盒相交则剪除；edgeIntersectsBox/isCounterClockwise 逐行移植），emitter 传入 `plan.feature.safeArea`。实测：
  - **shadows-junction 22,897 → 18,170**（回到历史最优值，且首次以 mbgl 字面机制达成——此前同数值是构建崩溃的假象）。g52h"mgl 全建护栏却只见外缘"的悬案大部分由 safeArea 裁剪解释：junction 夹具的内部边大多在 safeArea 之外。
  - **shadows-tunnel 54,413 → 50,866**（−3.5k，校准态 56,530 → 累计 −9.3%）。
- mgl 主 pass 结构确认（draw_elevated_fill.ts:41-131）：renderable 段只含护栏/隧道墙（道路三角形走普通 fill 路径+depth prepass），LEQUAL/**ReadOnly**，CullFaceMode.backCCW；护栏不写深度。我们护栏材质 DoubleSide+depthTest=true 与 ReadOnly 语义的对应关系留待下轮核。
- **S9 未盲改**：mgl u_fade_range 语义在像素空间（cascade far=cameraToCenterDistance 的倍数，mgl 光矩阵工作在 pixel 空间），我们 uMBFadeRange 在世界米制（shadowCamera.far=radius/dir.z）——直接套 4.5×ctcd 需先做 ppm（≈20.65）单位换算分析，盲改风险高，留待下轮专项。
- 遗留类型错误（MBModelRenderer texel1/map1、MBEnvironmentManager atmosphereTail 等）确认为 HEAD 既有（文件未改动，--force 全量检查才浮现），不影响 lib emit 与 karma（transpileOnly）。

## g56 实测结论（2026-09-21 第二轮）

- **S9 落地（单位分析完成）**：mgl ctcd 为像素（光/clip 空间 pixel-uniform），ctcd_px/ppm == targetDistance（米）——故 mgl `u_fade_range far = 4.5×ctcd_px` 的米制等价即 **4.5×targetDistance**，无需逐帧 ppm 换算。shadowState 新增 `fadeFar`，ground quad `uMBFadeRange` 与接收端 `uMBShadowFar` 两处消费者均切换到该语义（原值 m_shadowCamera.far 为光正交 far，与 mgl cascade far 不同源）。
- **S11 落地**：渲染端暴露 per-cascade 乘数 `normalOffset0/1 = 2·radius_m(i)/res × lerpClamp(zoom,22→0.125,0→4)`（mgl `2/tileSize·EXTENT/res·radius_px·tileInMeters` 在米制系的坍缩形；vector-tile multiplier 1.0）；接收端片元改为 mgl 字面全法线偏移 `n·(clamp(1−dot(n,shadowDir),0,1)·0.5+0.5)·multiplier_i`，且**逐 cascade 先偏移再投影**（model.vertex.glsl:37-39 结构），uv0/uv1 各用各的偏移位置；法线经 vMBOffN varying 与 vMBLightWPos 同条件注入（缺法线几何回退 up）。`noffmode=0` 旋钮保留 z-only 旧径。
- **S10 未盲动**：真硬件比较需 DEPTH_COMPONENT16 深度纹理 + sampler2DShadow 全链替换（MBShadowRenderer 深度打包格式 + 全部接收端采样 + three 无原生 sampler2DShadow 暴露），软件 PCF 目前近似硬件 GREATER 比较；列为独立专项（渲染器级重做），不与本轮混合。
- **护栏深度语义核查（S14 部分）**：mgl 主 pass renderable 段 LEQUAL/**ReadOnly**（护栏不写深度）、backCCW 剔除；我们结构材质 DoubleSide+depthTest=true+depthWrite 默认开。差异在静态渲染器约束内（renderOrder 序列替代 mgl 帧内分相），完整对齐需 depthWrite=false 验证——未盲改，挂账。
- **实测（mtime 验证）**：junction 18,170 持平；tunnel 50,866 → **50,630**；全量 3d-intersections 58 例总计 **1,958,110 px**（对照历史全量 407 万/600 万档）。TS1128 修复后 TS 全量检查暴露 MBShadowRenderer 两个潜伏未声明字段（m_shadRadius/m_analyticTex）已补声明。
- 遗留类型错误（MBModelRenderer/MBEnvironmentManager/mapview）均为 HEAD 既有、文件未动。

## g57 实测结论（2026-09-21 第三轮）

- **S14 落地**：①构建期翻转全部 renderable 三角形绕序（y-flip 镜像补偿，与 deck fill 的终三一九绕序修复同一惯例），材质 FrontSide = mgl `CullFaceMode.backCCW` 字面对应；②材质 `depthWrite=false` = mgl `DepthMode.ReadOnly` 字面对应（护栏永不拥有深度缓冲）。`structwind=0` 旋钮回退两者。
- **实测**：junction 18,170 持平；tunnel 在 S14 开/关两态均为 56,195（像素级中性）——与 g56 的 50,630 的差异属已记录的 tunnel 双稳态模式漂移，非 S14 回归。
- **S10 专项评估（未启动大改）**：硬件深度纹理路径已存在（`__mbShadowHW`→`m_hwRT.depthTexture`，UnsignedInt DepthFormat，接收端 `.r` 直读），剩余差距 = true `sampler2DShadow` 硬件 GREATER 比较——需 GLSL3（`texture(sampler2DShadow, vec3)`）迁移全部接收端材质（three 接收端均为 GLSL1 注入，无 EXT_shadow_samplers 可用），渲染器级专项确认。
- **环境告警**：机器累积数百个外部（非本用户）僵尸 chrome 进程无法清理，SwiftShader 显著变慢 → mocha 180s 超时 + GL Error 1282/1281 刷屏，结果服务端一度被旧实例占口（8081）。A/B 度量在本机恢复前不可信；建议会话边界执行内存纪律（杀 karma chrome）并考虑清理系统级僵尸进程。

## g58 实测结论（2026-09-21 第四轮）

- **环境恢复**：450 个本用户僵尸 karma chrome 定位为 snap chromium 的 systemd user scope 单元，`systemctl --user stop 'snap.chromium.*.scope'` 全清（load 144→4.5）。注意 pkill 对跨会话进程 EPERM，须走 systemd。
- **复核结论**：junction 18,170 稳定复现；tunnel 双稳态证实——g56 语义（structwind=0）两次测量 50,630/55,600，S14 开 56,195 / 关 55,600（Δ595≈1%，远小于 ~5k 的模式摆幅），S14 中性成立。
- **S10 管线已铺设、默认关闭**（shadow2d=1 + shadowhw=1 启用）：compare-mode DepthTexture（GreaterCompare+LINEAR=硬件双线性 PCF）独立于 m_hwRT（m_hwRT 纹理保持 plain——TEXTURE_COMPARE_MODE 绑定会毒化所有 sampler2D 读），caster 场景双渲染；ground quad/extrusion 接收端 GLSL3（glslVersion+pc_fragColor out）+ sampler2DShadow 单点硬件比较。经验教训（三条 GLSL 约束）：①ES 1.00 无 sampler2DShadow 类型，uniform 声明必须与模式同门控；②`#if 宏` 文本残留即使宏未定义也在 ANGLE 触发预处理错误（已移除结构接收端第三处，回退 2 站点）；③sampler2DShadow 读取的纹理不可再作 sampler2D 读。
- **HW+2D 组合挂账**：shadowhw=1+shadow2d=1 时 HW 覆盖物路径（scene.overrideMaterial=m_depthMaterial）下 vMBOffN/vMbAttrN varying 声明缺失 → 编译失败。默认态（两者皆关）已验证无害。
- **S10 实测**：tunnel shadow2d 开/关均 56,195（默认 HW 关 → mapS0=null → 管线未激活，符合设计）；激活态（hw+2d）修复上述注入问题后才有意义。

## g59 实测结论（2026-09-21 第五轮）

- **HW+2D 组合可编译**。三处修复：①S11 块以 `MB_SH_VOK`（顶点注入成功标志，区别于 VLIGHT）门控，材质缺 project_vertex 时回退 z-only；②`mbWP0/1` 无条件声明（NOFF 编译外仍被 cascade uv 装配引用）；③结构光照注入原子化——顶点补丁失败（anchor 缺失）时置 `MB_STRUCTLIT_V=0` 跳过片段依赖，`aMBElev` 声明与 elev-plane 注入去重。
- **hw+2d 激活态 A/B（testtimeout=900s）**：junction **18,167**（历史最优，−3 vs 默认）；tunnel **168,919**（+112k 域不匹配退步）——硬件 DEPTH16 比较域与校准的 packed-16bit 窗口域量化不同（§716 账本早有记录），隧道内腔/地下链最敏感。**默认保持 shadow2d 关**；激活管线保留供 GPU 环境与域校准后复用。
- 度量基建：karma webpack 缓存在 /tmp/_karma_webpack_*（排查时清过）；testtimeout 参数已接 MBSTYLE_TESTTIMEOUT。

## g60 实测结论（2026-09-21 第六轮）

- **重大修复（g59 引入的默认态回归根因）**：g59 的 `structVOk` 在两次顶点 replace 之间检测（恒 false）→ 结构光照片段注入被静默整体跳过 → 隧道 168,919/172,695。已改为在 begin_vertex replace 之后检测（`vMbAttrN` 写回 + `varying float vMBHeight` 声明双条件）。同时补上片段主函数缺失的 `varying vec3 vMbAttrN;` 声明（g57 起就有 12 处编译失败的潜伏缺陷）。`aMBElev` 声明按 includes 双向去重。
- **修复后默认态（最优）**：junction **18,284** / tunnel **54,224**（历史最优档）。
- **S10 激活态域校准排查**：干净基线上二分（noext/quadsw/双关/结构 define 关四组配置）—— tunnel 全部 **169,209** 恒定，与 tap 开关无关；排除 extrusion GLSL3（shadow2d 不开 hw 时 54,488 正常）。回归源收敛为 HW 上下文中的**双渲染/GL 状态副作用**（SwiftShader 下 sampler2DShadow 绑定 + 场景二次栅格化的状态干扰），非比较语义本身——需 GPU 环境或对 hw 渲染路径做状态隔离审计后才能收敛。默认 shadow2d 维持关闭。
- S8/G10 未动（见下）。

## 下一轮主攻（按 mgl 源码字面）

- **S10 续**：GPU 环境复测 hw+2d；或审计 SwiftShader 双渲染的 GL 状态隔离（独立 context/渲染顺序）。
- **S8** 级联矩阵 mercator 球心/Ti(pitch,bearing) roll/texel-snap（遗留主项，依赖 geo↔RTE 帧桥）。
- **G10** SUBDIVISION_EDGE_EXTENSION 生效化（MBPolygonClippingHD 当前 void 丢弃）。
- 遗留：MBEnvironmentManager/mapview/MBModelRenderer 的 TS 类型错误（HEAD 既有）。
