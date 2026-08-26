# Phase 3 大型工程对齐计划

> 基于 2026-08-26 全仓探查（@flywave/* 引擎本体 vs mapbox-gl-js 参照 + 渲染测试夹具）。
> 目标：确认 18 个 P3 大项实现状态，按"夹具就绪度 × 实现集中度 × 风险"排序，依次代码级对齐。

## 一、实现状态盘点

| # | 任务 | 状态 | 关键证据 |
|---|------|------|---------|
| P3.1 | fill-extrusion-terrain | 部分 | 3×3 DEM 网格 + 真实 exaggeration（shader+CPU 一致含 secLat）已实现；proxy-tile drape/depth occlusion/morphing 为 T4–T7 deferred（`TerrainController.ts`） |
| P3.2 | terrain 进阶 | 大部分未实现 | dynamic-exaggeration 仅整体 rebuild；terrarium 解码器存在但主路径硬编码 `'mapbox'`（`TerrainController.ts:411`）；raycast 在 terrain-datasource 有（`DemTree.ts`）未接入 mbstyle；globe+terrain 完全未实现（`TerrainDraping.ts:96` 禁用） |
| P3.3 | fog 精度 | 基本已实现 | horizon-blend/vertical-range 按 mgl 公式；pitch 渐入为两点标定近似（`MBBackgroundFogRenderer.ts:21`） |
| P3.4 | sky cubemap + atmosphere | 已实现 | mgl skybox 逐面 capture 严格移植（rayleigh/mie + tonemap）；另有 SkyCubemapTexture/SkyAtmosphereMaterial |
| P3.5 | lighting 作用 2D 层 | 已实现 | `injectGroundLighting()` 覆盖 fill/line/circle/raster/pattern；direction/intensity/measure-light 支持；缺 intensity/color 通用表达式 |
| P3.6 | building roof-shape | **未实现** | paint key 已解析（默认 'flat'）但无消费者；hipped/gabled/mansard/pyramidal/skillion/parapet 几何零代码；夹具 6 组就位 |
| P3.7 | 3d-intersections | 部分 | z-offset/elevation-reference 已实现；ElevatedStructures 简化版；elevation graph 拓扑未实现 |
| P3.8 | model-layer | 部分 | model 图层（GLTF 实例化+阴影）与 3D Tiles LOD(SSE) 已实现；BVH 未实现 |
| P3.9 | color-theme | 已实现 | LUT 三线性 + config 表达式 + CLI + 20+ 测试 |
| P3.10 | raster 三件套 | 部分 | raster-elevation ✅、raster-array(.mrt) ✅；raster-particle 未实现 |
| P3.11 | custom-layer-js / video | **未实现** | src 零匹配，INCOMPATIBLE_TYPES 列表 |
| P3.12 | PMTiles tile-providers | **未实现** | 无解码代码；7 组夹具（`local://tiles/*.pmtiles`）就位 |
| P3.13 | 多源 / cluster | 部分 | 多源 ✅；cluster 为自研网格聚合（每 2 级 zoom 重算、无 KD-tree、无 cluster_id/expansionZoom），非 supercluster |
| P3.14 | imports / slots | 部分 | mergeImports + config 表达式 ✅；slots 排序无消费者；运行时重 merge 靠 setStyle 全量 |
| P3.15 | front-cutoff / cross-source / occlusion symbol | 大部分未实现 | front-cutoff 仅透传无消费者；cross-source 靠夹具 filter；icon/text-occlusion-opacity 仅默认值 |
| P3.16 | sd-hd-conflation / transition | 未实现（引擎级） | src 零命中；SD 隐藏靠夹具数据侧 filter |
| P3.17 | map-mode / tile-mode | **未实现** | 测试桩 `__mapMode` 无消费者 |
| P3.18 | free-camera / setPadding | **未实现** | 无 API；测试用 setPrincipalPoint 近似 |

**基本不需专项投入**：P3.3 / P3.4 / P3.5 / P3.9（已按 mgl 语义实现，仅剩标定微调，以渲染对拍驱动）。

## 二、对齐批次（执行顺序）

### 批次 1：夹具就绪 + 改动集中（纯欠账）
1. **P3.6 roof-shape**：在 `MBTileDataEmitter.ts` building 分支实现 6 种屋顶几何（hipped/gabled/mansard/pyramidal/skillion/parapet + flat），paint 属性 `building-roof-shape`（含数据驱动表达式）由 `MBLayerEvaluator` 求值传入 emitter。验证：`test/render-tests/building/{gabled,hipped,mansard,parapet,pyramidal,skillion}`。
2. **P3.2a terrarium 接线**：`MBStyleSpec.ts` terrain.encoding → `MBEnvironmentManager.applyTerrain` → `TerrainController.decodeDemImage`（去掉 `TerrainController.ts:411` 硬编码 'mapbox'）。验证：`terrain/terrarium` 夹具。
3. **P3.15a front-cutoff**：为 `fill-extrusion-front-cutoff` 实现消费者（相机侧近距裁剪，mgl 语义：投影后按 cutoff 平面丢弃/截断顶点）。验证：`test/render-tests/front-cutoff/*` 6 组。

### 批次 2：独立子系统（低耦合）
4. **P3.12 PMTiles**：实现 pmtiles 归档读取（目录/varint/zstd-if-needed 解码），注册 `local://` 或 pmtiles:// 协议 handler 接入 `MBStyleDataSource.resolveSources`。验证：`tile-providers/*` 7 组。注意夹具 URL 为 `local://`——需确认 harness 的 local 资源映射路径。
5. **P3.13 cluster**：以层级 KD-tree（supercluster 算法移植）替换 `MBStyleDataSource.ts` 内 `GeoJSONDataProvider.clusterAtZoom()`，补 cluster_id 稳定寻址、getClusterExpansionZoom/leaves 语义。

### 批次 3：引擎级新架构（单独立项）
6. P3.10 raster-particle（流场粒子管线）
7. P3.11 custom-layer-js / video
8. P3.17 map-mode、P3.18 free-camera/setPadding
9. P3.16 sd-hd-conflation 引擎级 coverage/淡出
10. P3.14 slots 排序消费、P3.2 globe-terrain / dynamic-exaggeration / raycast 接入
11. P3.7 elevation graph、P3.8 BVH

- [x] P3.17 map-mode 终定性=不适用（2026-08-26）：map-mode/{tile,static,
  tile-avoid-edges} 与 tile-mode/streets-v11 四例全部为上游
  skip-test(web)（『Mapbox-gl-js does not support tile-mode』/issue #5649）
  ——mgl web 端本身不支持 tile/static map mode，web 对齐无需实现，
  __mapMode 桩维持现状；测试索引已重生成（3027 例，四例入册即上游跳过）
- [x] 单测门禁全绿（80659fdb）：268 passing / 0 failing——
  setPaintProperty 立即回写目标值（mgl getPaintProperty 语义）代码修复
  + 5 处陈旧断言经 mgl 源码核对后随实现语义更新
- [x] occlusion/terrain 夹具数据离线入库（595deb5a）：用户 token 拉取
  z16 NYC streets-v8 mvt 1200+ 块、terrain-dem-v1、satellite、glyphs；
  渲染对拍按用户指示延后
- [~] occlusion 族数据补齐后首拍（2026-08-26）：24 例仍全 FAIL 但
  **性质已变**——地图主体渲染出来了（建筑+道路），缺口收敛为两点：
  ① **extrusion 3D 光照 no-op（重大发现，决定性证据链）**：
  injectExtrusion3DLighting 安装正常（use3DLights=true、amb 正确、
  handler 挂载、needsUpdate 置位），但 (a) handler 从未执行
  （onBeforeCompile 体内置探针零输出）；(b) 材质同一性 uuid 对拍：
  **场景渲染材质 153/306 确属补丁集**（补丁材质确实被渲染）；
  material.color×0.15 逐位不变应解释为引擎从 technique 每帧同步覆写
  color（该实验不具决定性）。**真正的 no-op 点=onBeforeCompile 重编译
  路径**：handler 已挂载+needsUpdate 已置位但从未执行——疑引擎 fork
  渲染器对 MapMeshStandardMaterial 的程序缓存绕过 onBeforeCompile，
  或材质 version 被引擎重置。**下一会话首要工程项：extrusion
  onBeforeCompile 失效根因**——**已破案（b29b41a0 取证链）**：
  ① 单测级最小复现证明 MapMeshStandardMaterial+标准渲染器 onBeforeCompile
  正常执行（引擎/渲染器无嫌疑）；② 同帧普查：306 extrusion 对象
  mbPatched=0——patchTile 在对象挂载前跑过即停；③ AfterRender 事件流
  仅 ~5 帧后停滞，extrusion 上传在 ~15/306 处停止=**引擎 upload 调度
  缺陷（§3930 既有问题）**；④ harness 侧 waitFrameReady 恒 2 帧 + 无 ops
  夹具恒 5 帧加剧了截断（已修：尊重 N + 场景网格静默收敛）。
  **下一层终局定位（同会话续拍）**：harness 帧数修复后捕获时
  attached=153/306、patched=153、lit=153（管线全通）但像素仍全白——
  可见性×program 交叉普查：**visProg=0 / visNoProg=153**，即全部可见
  extrusion 材质没有 three 编译的 program：引擎对 MapMeshStandardMaterial
  走**自绘管线，完全绕过 three 材质编译**，onBeforeCompile 天然失效
  （最小复现正常=裸 three 路径无此问题；fill/circle 材质类走 three
  路径故历史补丁有效）。**修法方向**：① 找到引擎自绘管线的 shader
  组装点（RenderObject/材质 adapter），在那里挂 mgl 光照公式；
  ② 或改用全局 THREE.ShaderChunk 输出片元替换（若自绘路径仍解析
  three chunk）；③ 或向引擎报告并请自绘路径透传 onBeforeCompile。
  306 中未挂载的另一半待此层解开后再查（疑双份对象列表）
  ② icons 仍不可见（sprite/poi_label 数据已在，待 ① 后复测——
  PoiRenderer 批次路径与 extrusion 无关，可独立排查 SpriteAtlas 图名
  {maki}-12 解析）
- 数据侧：z13-14 satellite + glyphs 5 range 补齐（83ca7b54）
- [~] extrusion 光照 no-op 取证续（2026-08-26 深挖）：
  - handler 替换证据：捕获时 153 材质的 onBeforeCompile 外层=自家
    translate handler（链上应含 3D 光照 handler）但 MBRUN 零执行；
    version 1→4 正常增长、锚点 opaque_fragment 在 three r178 存在、
    three 源码核实 onBeforeCompile 在 program cache miss 时必然调用
  - settle+trailing frames 修复后像素仍逐位一致（dark=0%/white=92.32%
    跨所有扰动不变）→ 终极嫌疑：**被绘制的白建筑并非插桩的 153 个
    census 对象**（layers 掩码/另一半未挂载对象集/双列表）——
    下会话单点：绘制时 renderer.info.render.calls 对象清点，或对
    census 对象置 visible=false 看画面是否变化（决定性）
  - 保留资产：renderUntilSettled+trailing frames（AfterRender 补丁
    off-by-one 语义正确）、tile.objects/材质数组防护
## 三、验证基线

- 每个批次完成后跑 mbstyle 渲染测试（`rendering-test-results/` 目录记录 diff），对比 mgl 期望图。
- 回归底线：既有 baseline（baseline7-pass.txt）不劣化。

## 四、进度记录

- [x] 状态盘点（本文档第一节）
- [x] 批次 1.1 roof-shape（e20d1d40）：六种屋顶几何落地 + 修正 building
  高度未烤入（原 rawHeight=0 → 1m 几何）；50 个 building 夹具全量对比
  显著收敛（gabled 14758→12310 等）；剩余差距为 building 家族共有明暗问题
- [x] 批次 1.2 terrarium（8d355985）：encoding 从 raster-dem source 贯通
  至 decodeDemImage（替换硬编码 'mapbox'）；[P3ENC] 探针确认到达
- [x] 批次 1.3 front-cutoff（15aa2877）：底部裁剪带 fragment discard
  （常量 + 屏宽三点 stops）；indicator-cutout 被 skip-test(web) 跳过、
  nyc 系列依赖 HD 管线，独立验证受阻
- [x] 批次 2.4 PMTiles（见最新 feat commit）：v3 读取器 + vector/raster/
  hillshade 接线；tile-providers 7 夹具 0→3 PASS；sparse 近达标
  (111k→10.7k)；raster-dem 剩余差距=hillshade 全家族既有问题
- [x] 批次 2.5 cluster（8b7da3b1）：supercluster 语义层级贪心聚类；
  geojson/clustered → PASS，filter/properties 大幅收敛（剩余为期望图
  半高/黑底合成语义，非聚类问题）
- [x] 批次 3 前置 P3.14 slots（1777ff5f）：applySlotOrdering 忠实移植
  mgl style.ts mergeLayers——slot 命名位置展开 + 3D/occlusion 优先级
  稳定排序（occlusion 层紧贴最后一个 3D 层）
- [x] 批次 3 前置 P3.15b symbol occlusion（1777ff5f）：
  patchSymbolOcclusion 为 labeled-icon/text 材质注入地形深度 fade
  （icon/text-occlusion-opacity 消费者；mgl DEPTH_OCCLUSION 语义）
  注：text 技术若不产生带材质的 tile 对象则不生效（TextCanvas 共享
  材质路径的 per-layer occlusion 为后续项）；cross-source-elevation
  仍未实现。测试按批次延后策略攒批
- [x] P3.15c 建筑深度 pre-pass（54e15519）：TerrainDepthOcclusion 支持
  includeExtrusions 无 terrain 模式 + icon-occlusion-opacity 引擎级全链路
  （emitter→PoiBuilder→PoiInfo→batch 按值分裂→patcher RawShaderMaterial
  深度 fade）；mgl absent-value 语义门控（仅显式层 fade）
  - **occlusion 族 24 例终定性=数据阻塞**：夹具所需 z16 NYC
    mvt / terrain.png / satellite.png 在本仓与 vendored mgl 仓均缺失
    （mgl CI 自有服务器供给），实测渲染全空白（actual dump 证实）——
    本族任何实现改动都无法经渲染测试验证，需先补瓦片数据
    （地图数据源：Mapbox API token 拉取或 fixture 服务器）
  - 回归控制：occlusion 族 pre/post 逐值一致；geojson/clustered PASS、
    tile-providers 3 PASS 不变；单测 259/9（9 既有）
  - [x] 批次验证（2026-08-26，逐 filter karma 逐字对拍 pre/post）：
  - slots/ 8 例：3 PASS（missing-slot、inner-slot-before-outer、
    inner-slot-without-outer）+ 3 FAIL 既有残差（dynamic-insert 12px、
    layer-without-slot-before-layer-with-slot 52px 前后不变；**set-layer-slot
    31→15px 改善**）+ 2 skip——零回归、一项改善
  - occlusion 族 24 例（filter=occlusion，含 depth-occlusion/、
    occlusion/、occlusion-terrain-depth、debug/terrain 等）：pre/post
    逐例逐值**完全一致**（24 FAIL 同像素数）——symbol occlusion 消费者
    零像素效果，根因：这些夹具的遮挡源是 **3D 建筑深度**而
    TerrainDepthOcclusion 只产地形深度纹理（且多数例无 terrain）。
    symbol-occlusion 收敛的真正缺口 = 建筑深度 pre-pass（复用
    MBShadowRenderer/DepthPrePass 基建画 extrusion 深度进遮挡纹理），
    记为下一批工程项
  - 单测门禁恢复（3ea25630）：mocha 改指 lib/test 编译产物 + pretest
    构建；当前 259 passing / 9 failing，9 例经 worktree 对照确认全部
    为既有漂移（MBMaterialFactory RawShaderMaterial 断言、
    MBStyleRuntime setPaintProperty、TerrainController 相机、TextShaping
    justify 等），与 slots/occlusion 批次无关——修复清单另立
- [x] P3.2b 动态 exaggeration（33ab1054）：表达式求值（interpolate zoom）
  + pushMapboxZoom 挂钩 + setExaggeration 原地 uniform 刷新（无重建）；
  fog/terrain/basic 28760→13766 显著改善；exaggeration 族剩余 15 例
  残差主体为 fog/terrain 合成域长线（error-overlap 等与记档逐值一致）
- [~] occlusion 族数据补齐尝试：repo 内 demo token 全路由 401（v4 tileset/
  styles static 均拒），真实 token 缺失——数据补齐挂起待用户提供 token
  或替代数据源；cross-source-elevation 夹具同样 hd-road 瓦片缺失
- 后续: vector overscale/sparse 需引擎级父级保留（mgl
  updateRetainedTiles 等价物）、hillshade 家族精度、无背景层黑底合成
