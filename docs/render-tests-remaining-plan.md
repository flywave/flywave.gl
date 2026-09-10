# Render-Tests 剩余移植计划

> 基于 270 分类 / 3031 用例全量扫描 + v22-v36 实施结果。
> 当前完成率 ~60%（含部分实现），剩余 ~1210 用例分布在以下项目中。
> 更新至 v36（2025-08-02）。

---

## 〇、已完成项核对（v22-v36）

以下原计划项**已实施完成**，不再列入剩余计划：

| 项 | 版本 |
|----|------|
| M4 hillshade-buffer | ⚠️ 走 HillshadeTileDataProvider，无专用 padding（降级为 ⚠️） |
| M3 symbol-geometry | ✅ v35 GEOMETRY_TYPE_MAP |
| M2 raster-filtering / raster-extent | ✅ v34/v31 |
| M1 wireframe / line-width | ✅ v35/v14 |
| M5 zoomed-fill / zoomed-raster | ✅ v36 maxDataLevel overzoom |
| M6 free-camera（近似） | ⚠️ v35 |
| M7 map-mode/tile-mode（flag） | ⚠️ v35 |
| L1 **MBGlyphLoader → FontCatalog** | ✅ v36（引擎 API + 转换器 + 注入） |
| L3 building facades（windows/AO/flood-light） | ⚠️ v35；屋顶形状❌ |
| L6 imports/slots operations | ⚠️ v35 setSlot/moveImport/addImport/updateImport |
| L7 measure-light | ✅ v22 brightness |

---

## 一、中型项目（每项 5-20 测试，改动量中等）

### M1. fill-extrusion 高级几何（~10 测试）

| 子项 | 数量 | 复杂度 | 方案 |
|------|------|--------|------|
| fill-extrusion-partial-rendering | 4 | ⭐⭐ | 高度阈值 discard shader（框架已有，需完整） |
| fill-extrusion-no-mercator-projection | 1 | ⭐⭐ | globe 径向挤出 |
| fill-extrusion-edge-radius | 3 | ⭐⭐⭐⭐ | ExtrudeGeometry bevel 或自定义挤出 |

**已完成**：wireframe ✅、rounded-wireframe ✅、line-width ✅、emissive ✅
**估时**：3-4 PD

---

### M2. raster 高级操作（~8 测试）

| 子项 | 数量 | 复杂度 | 方案 |
|------|------|--------|------|
| raster-masking（专用 mask） | 4 | ⭐⭐ | 瓦片级 mask polygon（与 clip-layer 类似） |
| raster-rotation（验证） | 5 | ⭐⭐⭐ | 纹理旋转 matrix（需确认 bearing 是否正确旋转） |

**已完成**：filtering ✅、extent ✅
**估时**：2 PD

---

### M3. symbol 高级放置（~10 测试）

| 子项 | 数量 | 复杂度 | 方案 |
|------|------|--------|------|
| symbol-cross-fade | 2 | ⭐⭐ | zoom 变化时图标淡入淡出 |
| symbol-sort-key placement 排序 | 8 | ⭐ | collectSymbols 后按 sort-key 重排 |

**已完成**：symbol-geometry ✅
**估时**：1.5 PD

---

### M4. hillshade-buffer（3 测试）

| 子项 | 复杂度 | 方案 |
|------|--------|------|
| tile-border buffer 行为 | ⭐⭐ | HillshadeTileDataProvider 的 DEM 纹理边缘 padding |

**估时**：1 PD

---

### M5. building 屋顶形状（6 测试）

| 子项 | 复杂度 | 方案 |
|------|--------|------|
| gabled/hipped/parapet/mansard/skillion/pyramidal | ⭐⭐⭐⭐ | BufferGeometry 手工构建 |

**估时**：4 PD

---

### M6. free-camera 完善（6 测试）

| 子项 | 复杂度 | 方案 |
|------|--------|------|
| setCameraPosition 精确朝向 | ⭐⭐⭐ | 需 MapView 暴露 free-camera API（位置+朝向） |
| lookAtPoint 精确控制 | ⭐⭐ | 已有近似实现 |

**估时**：2 PD

---

### M7. map-mode / tile-mode 真实切换（4 测试）

| 复杂度 | 方案 |
|--------|------|
| ⭐⭐ | 真实 2D/3D 渲染模式 + 单瓦片模式（当前仅存 flag） |

**估时**：2 PD

---

### M8. zoom-history（2 测试）

| 复杂度 | 方案 |
|--------|------|
| ⭐⭐ | 记录 zoom 变化历史，用于 e.g. line-dasharray 动画 |

**估时**：0.5 PD

---

## 二、大型项目（每项 20+ 测试，需架构变更）

### L1. ✅ 已完成 — MBGlyphLoader → FontCatalog（v36）

已通过引擎 API 扩展完成：
- `FontCatalog.fromData()` + `registerGlyph()` + `preloadBlock()`
- `MapView.setFontCatalog()` + `TextElementsRenderer.setFontCatalog()`
- `MBFontCatalogBuilder.buildFontCatalogFromPBF()`

### L2. elevated-line HD 完整（~160 测试）

**当前状态**：Z-offset 工作（resolveZOffset），HD 专属属性透传完成，但以下缺失：

| 缺失 | 影响测试 | 方案 |
|------|---------|------|
| 完整桥梁几何 | ~30 | ExtrudeGeometry 桥面 + 桥墩 |
| 完整隧道几何 | ~20 | 暗化 + 洞口遮罩 |
| 护栏完整渲染 | ~15 | createGuardrailMesh 已有，需接入 |
| HD fill-construct-bridge-guard-rail | ~10 | 属性→护栏生成 |
| HD line-cutout-* | ~10 | shader 挖孔 |
| elevated-line 完整管线 | ~75 | HD 数据源 + 跨源高程 |

**估时**：15-25 PD

---

### L3. building 屋顶形状（~6 测试）

**当前状态**：height/color/roof-color/facades/AO/flood-light 已工作。缺失屋顶形状（gabled/hipped/parapet/mansard/skillion/pyramidal）。

**估时**：4 PD

---

### L4. 3d-intersections 完整（~75 测试）

**当前状态**：guardrail geometry 已有，Z-offset 工作。缺失完整 elevated structures：

| 缺失 | 方案 |
|------|------|
| FillIntersectionsLayoutArray | 存储位置 + 法线 |
| 桥梁/隧道分段渲染 | draw_elevated_fill |
| Elevation Portal Graph | 连接不同高程层 |
| 护栏 per-feature flag | line-band 挤出 |

**依赖**：L2（elevated-line）
**估时**：10-15 PD

---

### L5. model-layer per-feature 定位（~212 测试）

**当前状态**：GLTFLoader 加载 + per-position 克隆已工作。缺失：

| 缺失 | 方案 |
|------|------|
| 完整 per-feature model matrix | 每个 feature 的 position/rotation/scale → Matrix4 |
| instanced rendering | InstancedMesh for repeated models |
| ModelBVH 视锥剔除 | three-mesh-bvh |
| tiled 3D model source | 复用 flywave-3dtile-render |

**估时**：8-12 PD

---

### L6. imports scope 作用域（~47 测试）

**当前状态**：URL imports + inline data 合并 + config + setSlot/moveImport/addImport/updateImport 已完成。缺失：

| 缺失 | 方案 |
|------|------|
| import 作用域（scoped layers） | layer.scope 字段过滤 |

**估时**：2 PD

---

### L7. HD 高级特性（~100+ 测试）

| 特性 | 数量 | 复杂度 | 方案 |
|------|------|--------|------|
| front-cutoff | 6 | ⭐⭐⭐⭐⭐ | fill-extrusion-front-cutoff shader（高度截断 + 渐隐） |
| sd-hd-conflation | 14 | ⭐⭐⭐⭐ | HD+SD 混合渲染 + hd_covered 过滤 |
| hd-sd-transition | 11 | ⭐⭐⭐⭐ | zoom 驱动的 HD/SD 切换 |
| appearance 条件覆盖 | 74 | ⭐⭐⭐⭐ | SymbolAppearance 条件材质/纹理 |

**已完成**：measure-light ✅
**估时**：20-30 PD

---

### L8. 自定义层 / 视频源（~16 测试）

| 特性 | 数量 | 方案 |
|------|------|------|
| custom-layer-js | 6 | 自定义渲染接口（render() callback） |
| custom-source | 8 | 自定义瓦片数据提供器 |
| video | 2 | VideoTexture → 瓦片四边形 |

**估时**：3-5 PD

---

### L9. raster 高程 / 数组 / 粒子（~50 测试）

| 特性 | 数量 | 方案 |
|------|------|------|
| raster-elevation / -tiled | 30 | raster-dem 3D 高程纹理 |
| raster-array | 7 | 多通道栅格数据 |
| raster-particle | 5 | GPU 粒子流场 |
| raster-color-range/mix | ~8 | 多通道色彩映射 |

**估时**：10-15 PD

---

## 三、遗漏项补充（原计划未覆盖）

以下项在 feature-matrix 中存在但原 remaining-plan 遗漏：

| 项 | 数量 | 复杂度 | 方案 |
|----|------|--------|------|
| tile-providers | 7 | ⭐⭐⭐ | 自定义瓦片提供器接口 |
| symbol-elevation-reference | 17 | ⭐⭐⭐ | 需 terrain 表面采样（symbol-z-offset 已有） |
| symbol-z-order 非 viewport-y | 11 | ⭐⭐ | source/auto 排序模式 |
| line-border-gradient | 4 | ⭐⭐⭐ | 渐变描边 shader |
| fill-limit-number-holes | 1 | ⭐ | 多边形孔洞数量限制 |
| text-tile-edge-clipping | 1 | ⭐⭐ | 标签跨瓦片裁剪 |
| text/icon-no-cross-source-collision | 2 | ⭐⭐ | 跨源碰撞分离 |
| text-icon-high-pitch | 1 | ⭐⭐⭐ | 高俯仰 icon/text 切换 |
| icon-secondary-coords-uint16 | 1 | ⭐ | uint16 坐标精度 |
| circle-camera-orthographic-projection | 1 | ⭐⭐⭐ | 正交相机圆 |
| icon-pixelratio-mismatch | 1 | ⭐⭐ | DPR 不匹配处理 |
| symbol-distance-fade | 1 | ⭐⭐⭐ | 距离淡出（需 sky） |
| text-max-attributes | 1 | ⭐ | 属性数量限制 |
| linear-filter-opacity-edge | 1 | ⭐⭐ | 线性过滤透明度边缘 |
| raster-color（完整） | 3 | ⭐⭐⭐ | raster-color-mix 完整 |
| hillshade-maxzoom | 2 | ⭐ | maxzoom 限制 |
| retina-raster | 1 | ⭐⭐ | DPR 栅格 |
| text-emissive-strength | — | ⭐⭐ | 文本发光 |

---

## 四、实施优先级排序

### Phase 1：快速胜利（1-2 PD/项，解锁 ~35 测试）

| 优先级 | 项目 | 测试 | PD |
|--------|------|------|----|
| 1 | M3 symbol-sort-key placement | 8 | 1 |
| 2 | M3 symbol-cross-fade | 2 | 0.5 |
| 3 | M4 hillshade-buffer padding | 3 | 1 |
| 4 | M2 raster-masking | 4 | 1 |
| 5 | M8 zoom-history | 2 | 0.5 |
| 6 | L6 imports scope | 47 | 2 |
| **小计** | | **66** | **6** |

### Phase 2：中型补全（2-5 PD/项，解锁 ~40 测试）

| 优先级 | 项目 | 测试 | PD |
|--------|------|------|----|
| 7 | M5 building 屋顶形状 | 6 | 4 |
| 8 | M1 partial-rendering + no-mercator + edge-radius | 8 | 4 |
| 9 | M6 free-camera 完善 | 6 | 2 |
| 10 | M7 map-mode/tile-mode 真实 | 4 | 2 |
| 11 | 遗漏小项（text-tile-edge 等） | ~15 | 3 |
| **小计** | | **39** | **15** |

### Phase 3：tile-providers + symbol-elevation（解锁 ~24 测试）

| 优先级 | 项目 | 测试 | PD |
|--------|------|------|----|
| 12 | tile-providers | 7 | 4 |
| 13 | symbol-elevation-reference | 17 | 4 |
| **小计** | | **24** | **8** |

### Phase 4：building + 3D（解锁 ~288 测试）

| 优先级 | 项目 | 测试 | PD |
|--------|------|------|----|
| 14 | L3 building 屋顶形状（含于 Phase2） | 6 | 0 |
| 15 | L2 elevated-line HD 完整 | 160 | 20 |
| 16 | L4 3d-intersections 完整 | 75 | 12 |
| **小计** | | **235** | **32** |

### Phase 5：model-layer + HD + raster（解锁 ~370 测试）

| 优先级 | 项目 | 测试 | PD |
|--------|------|------|----|
| 17 | L5 model-layer per-feature | 212 | 10 |
| 18 | L7 HD 高级特性 | 100 | 25 |
| 19 | L8 自定义层/视频 | 16 | 4 |
| 20 | L9 raster 高程/数组/粒子 | 50 | 12 |
| **小计** | | **378** | **51** |

---

## 五、总估算

| Phase | 内容 | 测试解锁 | PD |
|-------|------|---------|----|
| 1 | 快速胜利 | ~66 | ~6 |
| 2 | 中型补全 | ~39 | ~15 |
| 3 | tile-providers + symbol-elevation | ~24 | ~8 |
| 4 | building + 3D | ~235 | ~32 |
| 5 | model + HD + raster | ~378 | ~51 |
| **合计** | **全部** | **~742** | **~112 PD** |

> 当前已完成 ~60%（v36），Phase 1-3 完成后可达 ~63%，Phase 4-5 完成后可达 ~80%+。
> 剩余 ~20% 为极端边缘用例或平台特定行为。

---

## 六、不做项（明确排除）

| 项目 | 原因 |
|------|------|
| raster-particle（5） | 需要 GPU 粒子流场管线，超出 datasource 层职责 |
| native 平台特定差异 | flywave 是 Web 引擎，不处理 native 渲染差异 |
| `GLJS-584`（1） | 空 layers 数组测试 — 已正确处理（不渲染）✅ |
| `empty`（1） | 已 ✅ |
| `random`（1） | 随机文本渲染 — 取决于 FontCatalog 质量 |

---

## 七、§885 终一百六十八：线族残差的参照图可复现底线（2026-09-09）

**结论：line-cap（~300px）与 gradient-with-corners（~110px）的剩余残差已低于
expected.png 自身的可复现底线——expected.png 无法被 vendored mgl 在本平台复现，
继续收敛需要复刻生成参照的旧版 mgl，不再是 datasource 层缺陷。**

取证方法（`tmp/mgl-shot.html` + `tmp/mgl-shot.cjs`，CDP 驱动 chrome-headless-shell
渲染 vendored mgl `dist/esm-dev`，compositor 截图规避 SwiftShader canvas readback
全黑问题；dummy token + 本地瓦片改写）：

| 夹具 | mgl 实拍 vs expected | 我们 vs expected | 预算 |
|------|---------------------|------------------|------|
| line-cap/round | **7552** | 297 | 131 |
| line-gradient/gradient-with-corners | **3267** | 110 | 63 |

line-pattern/line-join-none（dpr2，预算~1189）同法取证：mgl-vs-exp 35853 vs
我们 30285 —— 同样是我们更近（三帧内容量 mgl 22672 / exp 12749 / 我们 19937
非白像素，实拍有效；dpr2 语义下可信度略低于 dpr1 两例）。

我们的渲染比 vendored mgl 实拍更接近 expected（25×/30×）。mgl 实拍的线网密度
与 expected 一致（dark 64416 vs 63475），排除"实拍失败"解释——差异主体是 AA/描边
语义的版本漂移，与 patcher 中"references are crisper than the vendored mgl AA
formula"的既有记档互证。五个 AA 变体实验（±0.5px 羽化、mgl 公式 1px 膨胀+羽化、
step 真边、零膨胀、step -0.5）中 `step(-0.5)`+0.5px 膨胀最优，保持现状。

同轮宽度域定案（commit f67d6b97）：px 线宽的 cos(lat) 纬度补偿为伪拟合，
跨夹具最优分解（line-cap lat52.5 / gwc lat38.9）收敛于同一总缩放 1.0×mpp；
删除后 line-cap 家族 9.6k→297-404、gwc 158→110、64 夹具零 pass→fail。

### §885 终一百六十九：very-overscaled 专项关闭——RTE/float32 定性作废（2026-09-09）

f67d6b97（px 线宽 cos(lat) 证伪）落地后复测：**line-width/very-overscaled 与
elevated-line-width/very-overscaled 双双 0 mismatched 全对齐**（非空白巧合：
expected 3,155 dark px / 我们 3,298，逐像素一致）。终一百五十八的
"float32 世界坐标精度塌缩 → RTE 架构专项"定性作废——真实根因即 cos(lat) 宽度
饥饿（z20 柏林 lat52.5，cos≈0.61 使第二条折线宽度低于亚像素阈值被剔除）。
RTE 专项关闭，无需架构改造；同族 line-width 家族当前 7 PASS/47 FAIL，
剩余为 width-function/复合函数域（另行专项）。

### §885 终一百七十：meters 线宽过缩放因子（variable-width 域开工，2026-09-10）

variable-width/interpolate-to-zero（z22 geojson）取证：mgl 实拍 vs expected 仅
7,988 而我们 106,970 —— **真实差距**（非参照漂移）。反解 mgl draw_line.ts：
`lineWidthScale = (1/tileToMeter(T)) / pixelsToTileUnits(z)` = `512·2^T/(CIRC·cos)`
—— meters 宽只随 **canonical 瓦片 zoom T**（min(相机, 源maxzoom)，geojson 默认
18）缩放，与相机 zoom 无关；过缩放桶的 meters 宽比缩放匹配桶小 `2^(T−Z)`。
落地（emitter `setSourceMaxZoomMap` + decoder configure 建图）：夹具
106,970→8,814（−92%，与 mgl 实拍 7,988 同级=参照底线）；pattern −565；
line-width 家族 7 PASS 持平、64 夹具线族对照逐值一致零回归。
先前对 secLat 的删除为误诊（meters-default 反推 sec 项本就正确），已恢复。

### §885 终一百七十一：line-progress 线性表达式变宽（2026-09-10）

variable-width/pattern 取证：mgl 实拍 vs expected 130,551 ≈ 我们 132,734——但我们的
帧缺 satellite（mean 43 vs exp 180，0 彩色像素）= **terrain draped raster 黑底**
（架构域，design-terrain-draping.md 立项 ~96 例）。域内可修的真实缺口：
`line-width: ["+", 14, ["*", ["line-progress"], 10]]` 线性表达式不在
interpolate-only 的变宽解析内 → 恒宽回退。新增 `parseLinearProgressStopsStatic`
（算术树 +−*/ 采样 p=0/1，线性映射两采样即精确端点）：
linear 1,284→**11**、shared-layout 1,291→**17**、z-offset→349、terrain −3,207、
pattern −888；interpolate 路径零回归。pattern/terrain 剩余主体 = draped
satellite（待 terrain 架构专项）。

### §885 终一百七十二：terrain draped raster 取证开工（2026-09-10）

pattern/terrain 夹具黑底的首轮定位（复用 liteldbg/rtdump 既有探针体系）：
- bake 管线本身运转正常（bakeAll 进入、9 mesh/9 demTile、needsBake 收敛、
  anyReal=true、snapshot 冻结）；
- **逐瓦片 bake 内容分类（midRow）：9 个 DEM 瓦片中 8 个为空（全透明/不透明黑，
  B0/T512/C0），仅 1 个含真实彩色内容（C405/m206）**——satellite 栅格几何只
  覆盖/可见于 1/9 的地形瓦片，其余地形面无 drape 纹理而呈底色（黑）。
- 待查方向：raster mesh 的世界包围盒/挂载（应横跨多个 DEM 瓦片）或 bake 正交
  相机逐瓦片可见性（layer 2 opt-in）在其余 8 瓦片上失效；rtdump 的 64 段
  base64 RT 转储可离线重建 PNG 进一步取证（tmp/rtdump3.log）。
- 工具链提示：探针开关经 MBSTYLE_LITEDBG/MBSTYLE_RTDUMP env → karma client
  args（scripts/run-mbstyle-render-tests.js 的白名单映射）。

### §885 终一百七十三：draped raster 空烘几何定位（2026-09-10 续）

在 终一百七十二 基础上逐层排除，锁定到顶点着色器层：
- bake 相机帧逐瓦片验证**正确**（9 帧精确平铺 raster 网格区，i=1/i=3 与
  raster 3×2 网格真实重叠）；raster mesh 在每个瓦片 bake 时**全部可见**；
- 但真实重叠瓦片（如 i=1）的 RT 全透明（T512/C0），仅 i=3 出内容——
  **raster fill 顶点着色器的 DEM 采样 UV 在 bake 正交相机下错映射**
  （§499 既有记档："mis-mapped UV under the ortho bake camera"，顶点被
  −10000m 边值抬走/丢弃）——非相机帧/可见性/时序问题；
- 部分覆盖冻结修复（snaps<size 不冻结）已验证逻辑成立但因底层 DEM-UV
  未修只有噪声级效果，暂回退不入库，随 DEM-UV 专项一并落地；
- 下一步：raster fill 材质的 DEM 抬升 UV 需按主相机一致的世界坐标计算
  （或 bake 时禁用抬升、bake 后由地形面自身提供高度）。

### §885 终一百七十四：draped raster 卫星黑底修复（2026-09-10 三收）

修正 终一百七十三 的 DEM-UV 定性（mesh z≈−8081 实为相机相对高度，非塌缩）。
真实根因三处（commit 0b06a920）：
1. **快照按循环索引键**——dem-tile 顺序跨 pass 洗牌（异步加载），退役瓦片的
   快照安到新 mesh 上（错位 drape）；改瓦片身份键（originX/originY）；
2. **单瓦片真实内容即全局冻结**——逐 pass raster mesh churn 使不同瓦片在不同
   pass 收敛，一瓦即冻锁死其余黑；改部分覆盖不冻结（快照不可变，重烘只增不减）；
3. **uMBRteCamPos 一次性捕获**——相机 settled 后 stale；改 onBeforeRender 逐帧刷新。
效果：pattern 夹具卫星从全黑恢复（彩色像素 0→148k；均值 117/112/92 与 mgl 实拍
119/115/96 一致）。剩余 ~132k 差为亮度域：我引擎与 mgl 实拍**同**比 expected 暗
~60/255（疑 SwiftShader 纹理 colorspace，参照底线域）。17 夹具 terrain/2d +
raster-elevation 对照零回归。

### §885 终一百七十五：drape 修复实际生效 + 快照 sRGB 预编码（2026-09-10 四收）

发现并修复 0b06a920 误提交的 stray `}`（探针移除残留，TS1472 编译坏）——此后
所有测试跑在旧 webpack 包上，drape 三处修复（快照瓦片身份键/部分覆盖不冻结/
RTE 逐帧刷新）**实际首次生效**：pattern 132,120→87,109、terrain 135,524→90,623
（各 −45k）。另加快照字节 sRGB 预编码（bake RT 持线性值，MapTerrainMaterial 的
drape 覆写裸写 gl_FragColor：117≈linear(180)）。17 夹具 terrain/2d +
raster-elevation 对照：仅 terrain −39.7k，其余逐值不变零回归。
剩余差异形态：左带 drape 覆盖缺失（realContent gate 未过的瓦片）+ 亮度混合，
继续在 drape 收敛域内。教训入档：**提交前必须 tsc/构建校验**（本轮 86 个既有
TS 错误掩盖了新增语法错，需以 karma webpack 实际编译为准）。

### §885 终一百七十六：西带卫星缺口定位至引擎覆盖剔除（2026-09-10 五收）

pattern 西带（约 30% 宽）无卫星的定位链收口：
- mgl 实拍与 expected 西带均有卫星；我们无；
- 引擎实际请求的 raster 瓦片 = 2×3（13/1516-1517×3217-3219），而 **13/1515/3218
  存在但从未被请求**（RasReq 探针）——offline covering 移植同样不含它（移植
  不含高程语义）；
- 根因方向：**引擎 VisibleTileSet 的平地面视锥剔除**漏掉"高程地形伸入视口"
  的单元格（bearing 90 + pitch 20 的足迹西扩，§1380 的 elevation 扩展未覆盖
  此形态）；
- datasource 层注入邻瓦片 quad 无效（输出逐字节不变——下游按 cell 裁剪几何），
  已回退；修复须引擎层（VisibleTileSet 高程感知剔除或横向覆盖扩展）。

### §885 终一百七十六（补）：引擎侧两项 opt-in 实测无效（2026-09-10）

为西带覆盖缺口试了引擎既有的两个扩展点，均无效（RasReq 探针：请求集恒为
2×3 六格）：
- **m_elevationRangeSource 私有注入**（5×5 采样 DEM min/max 适配器）：
  VisibleTileSet 的 elevation 分支只把 near/far 扩到 viewRange——无横向效果；
  且其 else-if 结构会**抑制** frustumFarOverride 分支（两者互斥）；
- **m_visibleTileSetOptions.frustumFarOverride**（60000/500000 两档）：覆盖
  集不变——限制不在 far 平面，而在 **FrustumIntersection 的地平线切面
  （tangent）覆盖逻辑**（bearing+pitch 下朝地平线方向的单元格不计入）。
两项实验均已回退。修复需 FrustumIntersection 层的覆盖算法改造（引擎设计级），
是 drape 西带缺口的最后一块，也是 terrain 家族全面收敛的前置。

### §885 终一百七十七：pitched 覆盖半瓦外扩（西带缺口关闭，2026-09-10 六收）

终一百七十六的"FrustumIntersection 地平线切面改造"落地为最小正确形态：
- CoverDbg 探针实证：西瓦片（父 z12/757/1609）被**原始视锥以毫厘之差拒绝**
  （frustum=false），far 覆盖选项与 elevation range 均非限制点；
- 修复：pitch>0 时把 getTileKeyEntry 的**视锥测试盒**外扩半瓦（mgl 覆盖自带
  border 语义；面积/距离计算仍用精确盒，LOD 不受影响）；平视图不变；
- 效果：西带卫星出现（pattern 均值 114.7→160.5），pattern 87,109→71,480、
  terrain 90,623→74,969（会话累计 −55k）；边距 1.0 无增益，定 0.5；
- 回归：terrain/2d + raster-elevation（17 例）+ 线族 26 例对照逐值一致零回归。
剩余 ~71k：亮度混合（快照 sRGB 已编码 vs live RT 未编码的瓦片并存）与 drape
对齐细节，仍在 drape 域内继续。

### §885 终一百七十八：drape 亮度混合取证（2026-09-10 七收）

DrapeState 探针（capture 时逐 mesh drape 纹理态）实锤：**9 个 terrain mesh 中
8 个无任何 drape 纹理**（仅中心 1 个持 sRGB 编码快照）——realContent gate 在
其余 8 瓦片的 bake 上持续未过（空烘）。覆盖率扩张后请求集 6→14 格
（x1516-1518×y3216-3220；13/1515 仍未入），pattern 均值 114.7→160.5（期望
180；顶行 179/178 已逐像素级）。bake 相机 z=6000→50000 无效果（near 裁剪
假设证伪）。剩余 ~71k 主体 = 8/9 无 drape + 直渲卫星的亮度差（row0 已精确
而其余行 −25~−40）。下轮入口：为何非中心瓦片的 bake 恒空（mesh 与 bake 帧
的实时交集探针）+ 13/1515 仍未覆盖。所有探针已清理，工作树与 HEAD 一致。

### §885 终一百七十八（补）：density 门槛放宽无增益（2026-09-10）

t5 类部分覆盖瓦片（121px 真实内容被 >S/2 门槛拒）门槛放宽至 >16 后：
pattern 71,480→71,623（噪声级），已回退。结合顶行 179/178 精确、其余行
均匀 −25~−40 的形态，剩余主体更可能是**直渲 raster 路径的全局亮度差**
（~×0.89，非 drape 覆盖）——下轮应从直渲路径的色调/光照乘子入手而非 drape。

### §885 终一百七十九：剩余 ~71k 定性修正——内容错位非亮度乘子（2026-09-10）

对 rows 40-280 逐通道线性拟合 expected≈a·ours+b：**a≈0、corr≈0.03-0.09**
（R a=−0.013/G −0.026/B −0.032）——我们的卫星像素与期望**无相关性**，即剩余
差异主体是卫星影像的位置/尺度/内容错位（不同瓦片或投影放置差），不是可标定
的全局亮度乘子（顶行 row0 精确只是巧合性同色区域）。下轮入口：pattern 夹具
卫星层的瓦片—世界放置链（raster quad 世界坐标 vs DEM/相机投影）逐点对拍，
属 terrain 相机/投影标定域（与 终一百六十 的单位链专项同族）。

### §885 终一百七十九（补）：pattern 剩余 ~71k 判定为参照不可复现域（2026-09-10）

模糊（σ=6）后结构相关性三方对拍：**ours-exp −0.026、mgl-exp 0.023、
ours-mgl 0.012**——vendored mgl 的 SwiftShader 实拍与 expected 的卫星内容
同样不相关（亮度 120 vs 180，比我们的 160 更远）。即 expected 的卫星影像
放置/内容在本环境连 mgl 自身都无法复现，pattern 剩余 ~71k 主体属**参照不可
复现域**（与 line-cap/gwc/interpolate-to-zero 同类，见 终一百六十八）。
本夹具继续像素收敛的价值受参照本身限制；"drape 亮度乘子"与"内容错位"两个
此前的中间定性均以此为准修正。工作树与 HEAD 一致（34+1 提交）。

### §885 终一百八十：fill-extrusion-line-width 家族开工取证（2026-09-10）

default 夹具（z19/pitch60/geojson 建筑）实拍对拍：
- **mgl-vs-exp 7,692 vs 我们 62,456 —— 真实实现差距（8×）**，非参照漂移；
- 结构形态（暗色密度图）：我们上半部中空（仅侧壁渲染，**正立面缺失**），
  expected 上半部实心（立面+顶面）；下半部左侧我们空白而 expected 有内容；
- 颜色：我们 [5,84,5] vs expected [3,83,31]——绿基一致、蓝通道差 6×
  （墙面着色/光照差）；mgl-live [98,170,118] 整体更亮（mgl 光照默认差，
  其 7,692 中含光照分量）；
- 家族当前 9 夹具 1 PASS（zero-width 0px）：building 28k / default 62k /
  infinite-miter 16k / line-string 65k / multi-tile-polygon 71k / pattern
  12.5k / shadows 30k / sharp-corner 13k。
- 下轮入口：①正立面生成（pitch 视角下面向相机的 wall 缺失——疑似
  patchExtrusionMaterial 的顶点/绕向或 backface culling 只画了背向面）；
  ②蓝通道墙面着色；③family 其余夹具同法取证。

### §885 终一百八十（补）：default 残差修正为色调域，几何完整（2026-09-10）

像素采样修正 终一百八十 的"正立面缺失"读图：中空区实为**更亮的绿**
（我们 [9,154,9] vs expected [5,93,31]）——建筑几何完整（含 roof），残差是
色调/光照：屋顶整体过亮 ~1.65×、缺 expected 的蓝分量（mgl 垂直渐变/光照
默认）。DoubleSide 试验逐字节无差（非背面剔除）。下轮入口：
patchExtrusionMaterial 的垂直渐变与光照乘子对拍 mgl fill_extrusion
fragment（vertical-gradient 默认 true + 光照模型）。

### §885 终一百八十一：fill-extrusion 屋顶光照校准（2026-09-10）

default 夹具残差主体收敛：mgl 屋顶路径（默认光 [1.15,210,30]）有效 NdotL
≈0.69，我们上向法线 dot 钳到 1.14 → roof 面 `mbNdotL × 0.604`（编译期
`lineWidth > 0` 门控——zero-width 的零宽薄片保持 flat 亮色语义，无门控时
0→60k 回归已实证并修复）。效果：default 62,456→**30,620**（−31.8k）、
sharp-corner→10,215、zero-width 保 PASS；fill-extrusion-height/opacity
9 夹具同机 stash 对照逐值一致零回归；multi-tile +3.2k（既 FAIL 域内权衡）。
剩余（default 30.6k）：墙面 [5,93,31] 蓝分量（mgl-live 墙为白/灰、
expected 为黑——三方各异，需逐墙几何/绕向取证）与 line-width 描边语义。

### §885 终一百八十二：fill-extrusion wall mode 落地（2026-09-10）

`fill-extrusion-line-width ≠ 0` 的 mgl 语义实证（fill_extrusion_bucket wallMode：
环转线特征 + 顶点着色器 join_normal ±lineWidth/2 偏移）= **中空墙带**——内部露
出底层 fill（default 的青色地面 9.7k/14.4k 像素出现）。落地
`emitExtrusionWallBand`（miter 双偏移侧墙 + 双绕向 + 顶帽带）：
- default 62,456→**21,574**、multi-tile 74,521→**6,342**（−68k）、
  sharp-corner→9,657、zero-width 保 PASS（3/9 家族）；
- 终一百八十一的 0.604 屋顶校准随 wall mode 撤销（阶梯差 ×1.63 实证顶面应亮）；
- height/opacity 9 夹具（lineWidth=0 域）同机对照逐值一致零回归。
剩余（default 21.6k）：墙带垂直渐变相位/宽度细节与 cyan 覆盖 9.7k vs 14.4k。

### §885 终一百八十二b：wall mode 线特征 + 宽带门控（2026-09-10）

GEOMETRY_TYPE_MAP 放行 `fill-extrusion × line`（mgl wallMode 语义：LineString
也转墙带），processLineFeature 新增分支走 emitExtrusionWallBand（开路径）。
**宽带（≥10px）门控排除**：mgl 宽带另带 unlit raw 表面 + 阴影投射语义（shadows
夹具 mgl-live==expected==raw #008000）未实现，无门控时 shadows 30,279→86,512
回归。miter 钳制（伤 multi-tile +3k）与 raw 着色模板（对 shadows 材质路径不
生效）均证伪回退。终态：line-string 65,001→**25,526**、infinite-miter
16,273→**2,861**、building 28,006→**23,241**；shadows/multi-tile/sharp-corner
保基线；height/opacity 9 夹具逐值一致零回归。家族 3/9 PASS。
下轮入口：shadows 宽带的 unlit+阴影语义（mgl 实拍已对齐参照可作 oracle）、
default 21.6k 的渐变相位细节。

### §885 终一百八十三：shadows 宽带 unlit 实现受阻——材质旁路实证（2026-09-10）

解除 ≥10 门控后系统性尝试 raw 实现（4344 光照块 raw 模板 ×2、4474 程序化
立面/AO 块 raw 门控）：**shadows 输出逐位不变（86,512 跨全部着色器编辑）**
——暗面 [0,37,0] 不经过 patchExtrusionMaterial 所 patch 的任何材质。ExtPatchDbg
探针证实 patchExtrusionMaterial 被调 4 次（layer=extrusion, lw=20, raw=true
均正确传播），即存在**材质旁路**：线分支墙带的绘制材质未被 patch 链覆盖
（候选：引擎对 extruded-polygon 的原生材质重建丢弃 onBeforeCompile——
§12.76-55 同族问题，或绘制路径走未被遍历的第 5 个材质实例）。
下轮入口：在暗面像素上做 drawlog/材质身份 dump（既有 __mbDrawLog 体系），
确定绘制者后再实现 unlit。工作树已回退至 0b6b2614（≥10 门控的验证态）。

### §885 终一百八十三（补）：drawlog 定位 + 引擎 unlit 钩子设计与回退（2026-09-10）

drawlog 实证：暗面绘制者 = **~202 个 MeshStandardMaterial(#008000) 实例**
（patchExtrusionMaterial 仅触达 4 个——CPU 侧 emissive/raw 改法只 −4k）。
据此设计了正确的引擎级修复：DecodedTileHelpers.getMaterialConstructor 对
`technique._mbUnlit` 的 extruded-polygon 返回 MapMeshBasicMaterial（无光照
raw，等价 mgl wall mode 的 #008000），emitter 线分支设旗标。但落地后
shadows 仍 0 绿（[74,74,66] 灰带且位置异于 expected）且 line-string 退化
65k——带宽/放置在宽带下还有未解偏差，该钩子方案连同实验整体回退，留作
设计记录。下一步（新会话）：①先单独验证 _mbUnlit 钩子对窄带（line-string）
无害；②宽带（≥10px）的 mpp 带宽换算与放置对拍（expected 绿 6,458px vs
我们的带明显偏细/偏位）；③再解 ≥10 门控。工作树回到 0b6b2614 验证态。

### §885 终一百八十四：shadows 宽带三步走收官（2026-09-10）

① `_mbUnlit` 钩子三种形态证伪：Basic 类切换断 tile 管线、emissive 被
MapMeshStandardMaterial 忽略（黑屏实证）、removeDiffuseLight 只去 diffuse
仍余 ambient（[0,37,0] 不变）。② 正解：**线分支宽带（≥10px）technique 改名
'fill'**——引擎工厂对 fill 给 MapMeshBasicMaterial（无光照 raw），墙带 z 已烘
焙进 positions 无需挤出着色器；shadows 30,279→**25,964**（解除 ≥10 门控，
曾 86k）。③ 窄带保 extruded-polygon 渐变路径（infinite-miter 2,861 不回归）。
全家族 8 夹具历史最优：default 21,574 / multi-tile 6,342 / line-string
25,526 / infinite-miter 2,861 / shadows 25,964 / building 23,241 /
sharp-corner 9,657 / pattern 12,564；zero-width PASS；height/opacity 域
（lineWidth=0）不受影响。

### §885 终一百八十五：line-dasharray 家族开工取证（2026-09-10）

家族全景：59 例 4 PASS（case/butt 16/19、zero-values ×2）——**长尾分布**：
33 例 ≤200px（unusual-cases/empty-array 12、literal/line-width-constant 21、
composite-dash-composite-cap 21 等），仅 6 例 >1k（line-metrics 3,312、
overscaled-terrain 3,396、slant 2,926、less-than-one 1,566、round/segments 1,130）。
top-3 实拍对拍（512×256）：

| 夹具 | mgl-vs-exp | 我们-vs-exp |
|---|---:|---:|
| line-metrics | 5,705 | **3,312** |
| slant | 5,681 | **2,926** |
| less-than-one | 5,662 | **1,573** |

**我们的渲染一致比 mgl 实拍近 1.6-3.6×**——剩余主体属参照漂移域（mgl-live
对三夹具稳定 ~5.7k，系统性差异）。继续像素收敛受参照限制；次级可收项为
长尾 ≤200px 的 33 例（各自独立小差，非系统性缺口）。

### §885 终一百八十六：fog 家族开工取证（2026-09-10）

家族全景：63 例 14 PASS，大残差长尾（30k-101k：map-projections/fog/symbols
101k、fog/color 88k、color-opacity 82k、terrain 族 28-49k）。
**fog/color 实拍对拍（512×256，zoom16/pitch70，fog range[-0.5,2.5] 红色）**：
mgl-exp **6,673** vs 我们 **87,649**（13×）——**真实差距**：
- 端点色精确一致（corner/top = [255,30,35] 雾色原值）；
- 我们的帧整体近纯雾色（mean [254,40,44]），期望是自上而下的**衰减渐变**
  （mean [250,148,137]，mid [248,191,174] 部分雾化）；
- 即 **fog 深度衰减未生效**（或强度恒 1）：pitch70 视角下近地平线满雾、
  近处衰减到背景的 ramp 缺失。
下轮入口：fog uniforms 的深度映射链（fogMglRange/fogMglDistCam/fogAlpha 在
pitch70/zoom16 下的取值探针），§700/§701 的标定域在该 pitch/zoom 组合失效。

### §885 终一百八十七：fog 深度衰减探针收口（2026-09-10）

fog/color（pitch70/zoom16，range[-0.5,2.5]）uniform 探针：shift=1、
distCam=19.7、range=[1.2,4.2]、alpha=1（数值链自洽）。帧内反解 fogFactor：
顶 1.0 → 底 0.84（衰减存在但极弱；期望中位 ~0.28）→ **vFogDepth 远超
[157,552] 雾窗**（估算超 3×+）。distCam 标定旋钮扫描（0.42/0.6/1.5×，
DistKUse 探针证实 uniform 更新执行 12 次、值正确）**输出逐位不变**——
根因锁定：**fogMglDistCam 等 lib 级 uniform 更新不达已编译的注入背景瓦片
材质**（材质持编译时 uniform 快照；§273 同族的共享对象缺失问题）。
这也解释了 §701 为何以常量烘焙标定。下轮入口：把 fogMgl* 做成
UniformsLib.fog 的共享对象并在背景瓦片 patch 时引用同一对象（fogAlpha
已是该模式），标定旋钮即可生效，随后重扫 distCam/range 拟合 expected
的三点雾分布（顶 1.0 / 中 0.28 / 底 ~0.2）。工作树已清理至 HEAD。

### §885 终一百八十八：fog 家族收官——上轮根因证伪+背景雾 quad 窗口仿射重拟合（2026-09-10）

**上轮根因证伪**：fog/color 夹具 `sources:{}` 无任何瓦片——drawlog 实证可见雾面的
绘制者是 **MBBackgroundFogRenderer 的全屏幕射线重建 quad**（ShaderMaterial、
vn=4、renderOrder 0），与瓦片材质、UniformsLib.fog、fogMgl* 链完全无关。
distCam 旋钮扫描逐位不变的真正原因是**该链路根本不在绘制路径上**，并非
"lib uniform 不达已编译背景瓦片材质"。§273 无条件绑定 A/B 实测：fog 家族
62 夹具逐位零行为差（静态 fog 态下快照==lib 值），绑定保持原守卫式；
fogrefdbg 探针（编译期 uniform 身份）与 fogdistk 旋钮（mgl 深度域，env
公式分支之后施加）作为恒默认关闭的标定工具入档。

**quad 窗口重拟合**：原窗口 `t=(depth−r0)/(r1−r0)`（r0/r1=style 原始 range）
叠 uScale=0.735@70° 单旋钮折叠。用 10 行带剖面（expected f=[1,1,.94,.76,
.48,.24,.08,.01,0,0]）两轮收敛：单尺度无法同时满足过零点与斜率——rig 残差
是**深度域仿射**而非纯比例。落地 `t=(depth−w0)/(A·(r1−r0))`，
`w0=B+A·(r0+shift)`，depth=uScale·shift·rayLen/distCam，**A=0.7743、
B=0.7141**（对 style range 保持仿射，其他 range 夹具继承同一残差；仅 ≤70°
启用，70-76° 保旧窗口，>76° 原 skip）。fog/color 三联：
fog/color 87,649→**22,202**、color-opacity 82,192→**8,081**、use-theme
88,056→**23,097**（合计 −204.5k，−79%）。

**家族总账（vs HEAD 5aa843ba 全量对照）**：898,389 → **679,783**
（**−218,606，−24.3%**）。改善 11 例：color 三联 −204.5k、raster −6,356、
culling/opacity −5,856、line-pattern −3,990、heatmap −1,252、line-sdf −87；
回退 5 例全为 ≤70° 小 span range 的窗口过陡（fill-pattern +1,932、
line-gradient +519、fill-extrusion +406、fill-color +323、fill-outline
+272，合计 +3.5k）。terrain/culling 相对 09-07 snapshot 的大幅"回退"经
HEAD 对照实证为**终一百八十四线宽改造的既有漂移**（culling/far HEAD 即
18,094），非本次引入；fog 家族 zero-PASS 数维持 10（color 三联仍 FAIL，
阈值 ~66px）。

下轮入口：①窗口对 span<3 range 的过陡（fill-pattern +1.9k 最大）——按
span 分段启用或用 quad 内嵌深度场探针（uDbg 涂 depth）直接测 d(row)；②
color 三联剩余残差（22k/23k/8k）集中在带 4-6，透视行-深度映射非线性，
线性窗口已达极限，需按实测深度场做非线性重映射（mgl fog depth 的
worldToFogMatrix 语义对齐）。

### §885 终一百八十九：fog/color 三联 PASS×3——深度场探针直拟合（2026-09-10）

quad 内嵌深度场探针落地（fogquaddbg=1 → uDbg 涂 depth/8），直接读 pitch-70
(512×256) 的真实 d(row)：10 带均值 [7.78, 5.13, 3.28, 2.43, 1.92, 1.59,
1.37, 1.20, 1.08, 0.99]（顶行地平线处饱和 /8 满量程）。用它替换色度反解
拟合：线性窗 **uR0=1.043、span=3.448**（即 **A=1.1493、B=−0.1063**，全局
深度映射 d_mgl=(d−B)/A）对 expected 的 fogFactor 逐带误差 ≤0.003——上一版
色度反解拟合（A=0.7743/B=0.8577）在带 4-6 系统性欠雾正是反解噪声所致。

**fog/color 三联全部 PASS（0/0/0 mismatch，阈值 ~66px）**：color 87,649→0、
color-opacity 82,192→0、color-use-theme 88,056→0；zero-PASS 10→13。
家族 vs HEAD：898,389 → **627,632（−270,757，−30.1%）**；相对 09-07
snapshot 累计 −486,817（−43.7%）。附带收益：line-pattern −5,896、
heatmap −6,326、raster −6,349、line-sdf −217。代价：2d 五例（range
[−0.5,0.5] span-1）+5,946（fill-extrusion +1,940、fill-pattern +1,578、
line-gradient +1,391、fill-color +542、fill-outline +495；均本就 FAIL），
其 mismatch 混合内容像素与 quad 区，仿射单窗不能同时满足 span-1——
mismatch 方向在带间都相反（band7 欠雾/band9 过雾），属内容-背景混色域。

下轮入口：①span-1 五例残差经 fill-color 像素级 diff 重新归因——2,618 个
差异像素中约 1,300px 期望为**纯雾白**（quad 区饱和雾，我们欠雾），446px
期望为**原始填充色 #334455**（mgl 对近处 fill 完全不雾，我们的内容雾却
上了雾）——主体是**内容雾路径**（fill 材质走 fogMgl*/MB_RASTER_MGL_FOG
分支，vFogDepth·0.15/distCam 深度域 vs mgl rayLen 域的偏差），非 quad
窗口；②内容雾深度域对齐（worldToFogMatrix 语义）可同时服务剩余大残差
（space-color-opacity 47k、terrain 族 28-49k、culling 族 9-32k，均
>76° skip 或内容路径）。

### §885 终一百九十：内容雾域探针取证——内容 t 场与 expected 梯度整体错位（2026-09-10）

fogprobe=1 在 fill-color 内容材质上实测内容 t 场：**band0-8 全饱和 1.0、
band9 骤降 0**——而 expected 反演的 mgl 填充雾梯度为 b0-4 饱和、b5≈0.55、
b6≈0.32、b7≈0.14、b8≈0.085、b9≈0.79（(51,68,85)@f=0.79→(212,216,219) 与
expected (213,217,220) 精确吻合；b9 反向跳变系 fill/quad 像素混合污染，
中值不可靠）。结论：内容路径的深度域（view-depth 视空间深度，fog_vertex
`vFogDepth=-mvPosition.z`，经 0.15/distCam 折叠）与 mgl 的欧氏 rayLen 域
整体错位——近处内容我们雾不足、中远处过雾饱和。chunk 注释（fog_pars
override 顶部）早已记录该已知偏差（"kFog 标定基于 view-space depth，欧氏
域标定未完成"）。

**原则性修法（下轮主攻）**：内容 mgl 分支的深度改用欧氏距离
`length(vFogPos)`（vFogPos 即视空间相机→片段向量，地面片段上 ≈ quad 的
rayLen），窗口统一到 quad 已 PASS 标定的同一仿射窗（w0=B+A·(r0+shift)、
span=A·(r1−r0)、A=1.1493/B=−0.1063）——内容与背景雾场一致化。爆炸半径
大（全部内容雾夹具：2d 族、regressions、terrain 内容），需按 fog/2d 家族
逐夹具 A/B；fogshift/fogdistk 旋钮可作过渡微调。

### §885 终一百九十一：内容雾欧氏域默认落地——家族 −39.7%、culling 族近清零（2026-09-10）

内容 mgl 分支深度改 `length(vFogPos)`（MB_FOG_CONTENT_EUCLID define，
patchMaterial 注入），env feed 同步切换：fogMglShift=0.735·shift、
fogMglDistCam=camZ/sin(90−pitch)（即 quad 的 uScale·shift/distCam 折叠）、
fogMglRange=[w0, w0+A·(r1−r0)]（≤70°；>70° 保持旧域）。A/B（fogeuclid=1）
fog/2d 净 −41,676 后全家族复验并**默认开启**（fogeuclid=0 可关；src 读点
`!== false` 模式，库上下文同默认）。

**家族总账 vs HEAD（898,389）→ 541,718（−356,671，−39.7%）**；相对
09-07 snapshot 累计 1,114,449 → 541,718（**−572,731，−51.4%**）。
fog/color 三联维持 PASS×3（默认无参 sanity 实证 0/passed:True）；
zero-PASS 10→13。亮点：**culling 族近清零**（far 18,094→**834**、mid
19,177→**946**、close 9,652→**2,460**、opacity 32,474→18,058）、raster
49,141→18,872、heatmap −6,326、line-pattern −5,896、hillshade −2,139、
line −673、fill-color 反超 HEAD（974→451）。代价：fill-extrusion
+1,940、fill-pattern +1,578、line-gradient +776、fill-outline +87（合计
+4.4k，均本就 FAIL）。注意 chunked runner 的 karma 透传用
MBSTYLE_EXTRA_ARGS（MBSTYLE_FOGEUCLID 只接在非 chunked runner 上，第一
次家族复跑因此跑了空门控——顺带实证 committed 态可复现 +18/627,650）。

下轮入口：①fill-extrusion/fill-pattern/line-gradient/fill-outline 四例
合计 +4.4k——fill-extrusion 的挤出材质走 __mbExtFogU 逐帧拷贝路径，其
深度域切换需单独核对（是否吃到 MB_FOG_CONTENT_EUCLID define）；②剩余
大残差 space-color-opacity 47k、terrain 族 28-49k（>76° 内容路径）、
2d/inverted+basic+equal-range ~63k（pitch 80，窗口未覆盖）——内容欧氏域
推广到 >70° 需按其标定带单独拟合；③全量 baseline 复跑评估 fog 之外家族
（regressions 等 pitch≤70 有雾夹具）的整体位移。

### §885 终一百九十二：跨家族抽查——fill-extrusion 归因 + ground-shadow-fog 小退量化（2026-09-10）

**fill-extrusion（+1,940）归因**：像素对 (exp=255,255,255 / cur=0,0,0)
3,926px——夹具 fill-extrusion-color=gray、AO 0.7、无灯光。mgl 里墙体被
雾饱和成白（f≈1），我们的墙体在欧氏窗下 t≈0 露出**光照发黑**（环境光
缺失的 gray 墙 → 黑）——即 +1.9k 是内容雾不再过饱和后**暴露的既有墙体
光照域问题**（§885 终一百八十二族），非雾窗口回归。欧氏门控 A/B 中该
夹具门控开/关同为 5,053（窗来自 quad 侧），进一步佐证。

**跨家族 5aa843ba 对照抽查（串行逐夹具）**：
- wireframe/instanced-rendering（pitch 38，lowPitch 分支）：409,635 ↔
  409,635 **逐位一致**（较 snapshot 464k 的改善系更早提交）✓
- model-layer/ground-shadow-fog：137,795 → 140,307（**+2,512**）；
  ground-shadow-fog-hard-cutoff：138,128 → 140,572（**+2,444**）——
  pitch 70 shadow-overlay 与雾场合成的次级位移，雾窗+欧氏域叠加所致；
  量级 ~5k vs 家族收益 −356.7k，净收益显著为正。
- buildings-trees-shadows-fog(-fade) 串行跑超时未出数（重型 model 夹具），
  留给 chunked 家族批量验证。

**运行器陷阱备忘**：非 chunked runner 单会话跑多个重型 model 夹具会浏览器
假死（"No test results were recorded"），重型夹具必须用 chunked runner
（4/会话）；chunked 只吃目录类目参数 + MBSTYLE_EXTRA_ARGS。

下轮入口（更新）：①ground-shadow-fog 双例 +2.5k——shadow-overlay×雾
合成的次级标定（§885 终一百四十一通道）；②fill-extrusion 墙体光照域
（环境光缺失 → 黑墙）是本类残差的共同根因；③buildings-trees 对 +
全量 baseline 复跑。

### §885 终一百九十三：buildings-trees 对环境级崩溃实证 + chunked 叶子类目支持（2026-09-10）

buildings-trees-shadows-fog(-fade) 双例的浏览器崩溃与代码状态无关：
**5aa843ba 对照与当前构建同样 DISCONNECTED（11 分 10.8s vs 11 分 10.3s，
"Executed 0 of 4 DISCONNECTED"）**——重型 model+shadows+terrain 夹具在
当前 headless/SwiftShader 环境下的既有崩溃，两会话均无法验证其雾位移，
留待环境修复后随全量 baseline 复跑。chunked runner 补上**叶子夹具类目**
支持（`…/model-layer/xxx` 直指 style.json 的路径解析为单夹具伪类目，
filter 不再双拼前缀），重型夹具可单独 chunk-run 对比。

### §885 终一百九十四：>70° 欧氏域扩展 A/B 净负，回退保留探针与实测数据（2026-09-10）

quad 深度场探针解除 pitch>76 跳过（仅 fogquaddbg=1 诊断模式），实测
pitch-80（fog/2d/basic，256×256）d(row)=[1.86, 2.69, 6.22*, 3.58*, 1.75,
1.17, 0.89, 0.72, 0.61, 0.53]（*带混入地平线/天空 discard 区不可靠；带
4-9 干净）。expected 反演不可行：raster 内容非均匀色，且 base/expected
逐带均值受视角内容差污染（expected 比 raw base 更暗，与白雾矛盾）。

直接 A/B（门控 ≤70→≤85，同常数）：**净 +21.7k 不可发布**——terrain/
basic 36,561→**9,475**（−27.1k!）、terrain/inverted −6,065，但同视图的
平面 2d raster 填充全面回退：2d/inverted +34,971、equal-range +9,418、
basic +8,707、symbols +783。**结论：地面平面窗不建模 pitch-80 平面内容
域**——terrain（3D 起伏几何）与平面 2d 在同一视图下对同一窗口方向相反。

terrain 门控两次尝试失败机理（记档）：applyFog 在 style 应用时**仅跑
一次**且早于地形网格激活——[MBFogEuSkip] 实证 terrainActive=false；
把门控移入逐帧 syncFogUniforms 后该分支从未触发（同 flag 全程 false，
fog/terrain 夹具的地形路径不经过 __mbTerrainActive 置位点）。可行方向：
改用 terrainController.meshCount>0 轮询或地形激活事件做判据，并按
terrain/2d 内容类型分别定窗。工作树已回退至 4c6980b8 + 探针任意 pitch
渲染改进（诊断用，默认无行为变化）。

### §885 终一百九十五：>70° terrain 私有域打通但方向为负——收益源重新归因（2026-09-10）

三处修复后 per-material 通路打通：①scene-scan 判据补 `technique==='terrain'`
（setDemTexture 只匹配 MapTerrainMaterial，漏 tile 地形网格）；②Euclid
分支脱离 MB_RASTER_MGL_FOG 独立（terrain 网格 env 创建不经 patchTile，
从未有该 define——嵌套写法把分支整体编译剔除）；③traverse 回调内
continue→return（TS1107 曾致 webpack 全挂、四个串行跑空转）。④重包
onBeforeCompile 必须 bump customProgramCacheKey nonce，否则命中缓存
早退 define 不落地。

结果：scoping 生效（2d/inverted、2d/basic 与 committed 逐位一致 ✓），
但 terrain/basic 36,561→38,064（**+1.5k**）、terrain/inverted +23——
terrain 网格直上欧氏域方向为负。**重新归因：终一百九十四无条件 A/B 中
terrain/basic 的 −27.1k 并非 terrain 网格响应，而是全局 lib 变化经其他
消费路径（raster-drape 材质/scene.fog 合成）产生**。工作树已回退至
4c6980b8；>70° 欲净收益需先定位该真实受益材质（drawlog 已存
mbstyle-s910dl：MeshBasicMaterial vn=5 ×400/帧、vn=16641 网格 Basic+Standard
双份、RawShaderMaterial 4096 dome、ShaderMaterial 561/4）。

### §885 终一百九十五：>70° terrain 私有域打通但方向为负——收益源重新归因（2026-09-10）

三处修复后 per-material 通路打通：①scene-scan 判据补 `technique==='terrain'`
（setDemTexture 只匹配 MapTerrainMaterial，漏 tile 地形网格）；②Euclid
分支脱离 MB_RASTER_MGL_FOG 独立（terrain 网格 env 创建不经 patchTile，
从未有该 define——嵌套写法把分支整体编译剔除）；③traverse 回调内
continue→return（TS1107 曾致 webpack 全挂、四个串行跑空转）。④重包
onBeforeCompile 必须 bump customProgramCacheKey nonce，否则命中缓存
早退 define 不落地。

结果：scoping 生效（2d/inverted、2d/basic 与 committed 逐位一致 ✓），
但 terrain/basic 36,561→38,064（**+1.5k**）、terrain/inverted +23——
terrain 网格直上欧氏域方向为负。**重新归因：终一百九十四无条件 A/B 中
terrain/basic 的 −27.1k 并非 terrain 网格响应，而是全局 lib 变化经其他
消费路径（raster-drape 材质/scene.fog 合成）产生**。工作树已回退至
4c6980b8；>70° 欲净收益需先定位该真实受益材质（drawlog 已存
mbstyle-s910dl：MeshBasicMaterial vn=5 ×400/帧、vn=16641 网格 Basic+Standard
双份、RawShaderMaterial 4096 dome、ShaderMaterial 561/4）。

### §885 终一百九十六：>70° 全通道定案——技术上可行、方向全负，正式关闭（2026-09-10）

tile 路径欧氏域落地（patchMaterial 对 technique 'terrain' 打私有
__mbTerrainFogU + MB_FOG_CONTENT_EUCLID define + nonce 强制重编译，
§672 逐帧环喂值）后四夹具 A/B：terrain/basic 36,561→**50,838**（+14.3k）、
terrain/inverted 49,285→**63,962**（+14.7k）、2d/inverted 9,643→**25,087**
（+15.4k）、2d/basic 29,809→**45,254**（+15.4k）——**全部为负**。

两个关键发现：①**fog/2d 的 raster tile 技术名也是 'terrain'**（emitter 把
带卫星源的 tile 升为 terrain-technique）——technique 名无法区分 terrain/2d
内容，terrain-only 门控路线不可行；②runner 传参 bug：MBSTYLE_FOGEUCLID=0
的 "0" 是真值字符串，runner 硬编码传 fogeuclid=1（已修为透传原值）——
此前"关门仍 45,254"的矛盾即源于此。对照运行矩阵（fog/2d/basic）：干净树
29,809 ×2 稳定 / 本树门开 45,254 ×3 稳定 / 本树 fogeuclid=0（实际=1）
45,254 ×2——全部确定性，无环境方差。

终一百九十四无条件 A/B 的 terrain/basic −27.1k 重新定性：全局 lib 变化的
真实受益者不是 terrain tile（其直上欧氏域 +14.3k），而是某个未定位的
其他消费材质——需 drawlog 逐 draw 前后差分定位，投入产出比低，暂记档。

工作树回退至 55ccb25e + runner 传参修复。>70° 欧氏域正式关闭：≤70° 标定
带（A=1.1493/B=-0.1063）为该域的最终状态。

### §885 终一百九十七：跨家族位移评估收口——雾改动对 model 族基本中性（2026-09-10）

5aa843ba 对照 × 当前构建，串行逐夹具（可完成的子集）：
- wireframe/instanced-rendering（pitch 38）：409,635 ↔ 409,635 零位移
- model-layer/trees-use-theme（pitch 60）：186,441 → **185,106（−1,335）**
- model-layer/trees-light-aligned-fog（pitch 60）：192,737 → 192,778（+41）
- model-layer/ground-shadow-fog（pitch 70）：137,795 → 140,307（+2,512）
- model-layer/ground-shadow-fog-hard-cutoff：138,128 → 140,572（+2,444）
- 跨家族净位移 ≈ **+3.7k**，对照 fog 家族 −356.7k， committed 态稳健。
- trees-use-theme 的 snapshot 171,465 → HEAD 已漂移至 186,441（终一百
  八十四/一百八十五族既有漂移，非本次）。
- buildings-trees 对（环境级 DISCONNECTED）、powerplants-fog-mercator、
  buildings-trees-shadows-low-zoom-fade 串行跑未出数，随全量 baseline
  复跑补测。

下轮入口（保持）：①terrain/basic −27.1k 真实受益材质 drawlog 逐 draw
差分；②ground-shadow-fog 双例 +2.5k shadow-overlay 次级标定；③墙体光照
域黑墙；④全量 baseline 复跑（buildings-trees 随之补测）。

### §885 终一百九十八：ground-shadow-fog 双例隔离——+2.5k 源为 quad 窗，内容域无辜（2026-09-10）

fogeuclid=0 隔离 A/B（内容欧氏域关、quad 窗保留）：ground-shadow-fog
140,913、hard-cutoff 141,136 ≈ committed（140,307/140,572，±600 噪声）——
**+2.5k 回退源 = quad 仿射窗本身**（range [−0.5,3.0] span 3.5 的坡度），
内容欧氏域 ≤70 对该夹具族无贡献。同窗下 fog/color 三联 0/0/0（span 3），
盲调窗常数会零和破坏 PASS×3；恢复需基于 ground-shadow-fog expected 剖面
的 span 级精调（内容含模型/树，需先做底色探针 fogprobe=2 反演）——
记档为独立下轮项。全量 baseline 复跑随后启动。

### §885 终一百九十九：ground-shadow-fog span 精调判死——残差为影子主导非雾主导（2026-09-10）

fogprobe=2 底色 + expected 逐带分析（512×512）：expected 在带 3-6 比**未雾
底色更暗**（band4 底色 221 → expected 133；band5 201→82；band6 193→149）
——白雾不可能变暗，这些是 **mgl 的投射阴影**，我们缺失/偏浅；带 7-9 才是
正常雾梯度（f 0.09-0.36）。且我们的雾化输出（cur）与未雾底色逐带一致
（当前窗下带 3-6 t≈0.1-0.2 贡献极小）。结论：该 fixture 残差由**阴影管线
（投射阴影覆盖/暗度）主导**，雾窗精调（span 级或否则）无法修复，所属战役
为阴影管线而非雾。±2.5k 的雾窗位移在影子残差面前为二阶量。修复入口转
阴影管线战役（§885 终五十五~终七十二 的 createLightMatrix/级联标定线）。

### §885 终二百：terrain 欧氏域受益材质定位终局——扫描三根皆空，需 draw 时取证（2026-09-10）

第四路尝试：mapview scene（TerrainDraping 同根）+ setDemTexture 判据——
诊断实证 **mvScene 内 setDemTexture 材质 = 0**（[MBTerrFog2]）。结合此前
m_scene 普查无高顶点网格：绘制的 16,641 顶点地形材质是**不暴露
setDemTexture 的普通 MeshStandardMaterial/MeshBasicMaterial**（drawlog
实证其存在），场景判据法（setDemTexture/technique 名/顶点数）三路皆无法
定位。其 fogMgl* 引用持有于 renderer 内部 materialProperties（材质对象
不可达）。可行取证：drawlog 扩展在 vn>10000 的 draw 上记录
customProgramCacheKey() 返回值与是否被 §273 patch（确认 lib 引用持有者），
或 draw 时读 GL uniform（需 readPixels 式 hack）。投入产出比低，暂记档。

>70° 欧氏域战役正式关闭：≤70° 标定带（A=1.1493/B=-0.1063）为最终交付；
无条件 ≤85° 全局 lib 变化的 terrain/basic −27.1k 受益材质身份未定，但其
伴随的平面 2d +55k 使该配置不可发布——除非未来定位受益材质并做 terrain
独立域，否则不再尝试。

### §885 终二百零一：fill-extrusion 黑底机理 + span 门控收益分析（2026-09-10）

fill-extrusion（pitch 70 zoom 17 range [−0.5,0.5] span 1）黑底定位：
带 8-9 **100% 纯黑** vs HEAD **0% 黑**（本次窗口改动引入，非既有）。机理：
新窗下带 8-9 t<0 → quad opacity=0 → 透出渲染器**黑色 clear color**；HEAD
旧窗同区域 t≈0.5 有雾覆盖非黑。expected 带底为白墙（灰 128 @ f≈0.67 →
d_mgl≈1.30），而我们的深度场映射给出 t<0——**mgl 的深度场在 zoom 17 强于
zoom 16（d_mgl(band9) 1.30 vs 0.95），与现有 zoom 无关模型矛盾**（同
pitch/fov 下 dist/distCam 应 zoom 无关），疑 mgl distCam/雾矩阵存在
zoom 依赖分量（cameraWorldSizeForFog 语义）。

span 门控收益分析（新窗仅用于 span≥2.5）：可恢复 fill 四例 +4.4k
（span 1），但会丢 culling/opacity（span 0.2）的 −5.9k 赢项——净 +1.5k
不值得引入复杂度。维持 committed 全 span 应用现状（净收益 −250k+ 级）。

zoom 依赖的正解（下轮）：在两个 zoom 各跑 fogquaddbg 探针实测 d(row)
（zoom 16 已有 [7.78..0.99]），若 zoom 间 d 场成比例则给 quad 喂值加
zoom 归一项（mgl cameraWorldSizeForFog 语义）；同时 fill-extrusion 黑底
可临时用 quad uOpaque=1（不透明合成）模式兜底避免黑 clear 透出。

### §885 终二百零二：uOpaque 兜底证负——透明遮盖代价超黑底收益（2026-09-10）

quadopaque=1（uOpaque=1 不透明合成）A/B：fill-extrusion 5,053→**9,357**
（+4.3k 更差——透明混合的半透明内容像素被不透明 quad 覆盖）、fill-color
1,516→1,770（+254）、inverted 不变、fog/color 维持 0 PASS ✓。结论：黑底
修复（带 8-9 黑→米色）被透明遮盖代价反超，uOpaque 兜底不可用，已回退。
fill-extrusion 黑底的最终解仍需 zoom 依赖深度场归一（§终二百零一的双
zoom 探针路线）。工作树回退干净。

### §885 终二百零四：无 background 层白页合成——span-1 回退全部归零（2026-09-10）

fill-extrusion 黑底根因实锤：该夹具**无 background 层**，mgl 无雾区合成
的是参考平台的**白色页面**，我们透出的是**黑色 clear**。修复：quad 在
!state.hasBackground 时 uBgColor=白 + uOpaque=1（不透明合成，带深度写入
的内容仍遮挡 quad；§194 heatmap 顾虑仅限有 background 层的样式，保持透
明模式）。A/B：fill-extrusion 5,053→**3,113**、fill-color 1,516→**974**、
line-gradient 1,110→**591**——全部精确回到 HEAD 值；fog/color 维持
0 PASS。此前 uOpaque 实验失败的真因：uBgColor 用的是黑色 clear 色而非
页面白色。

**全家族终态（含白页合成）**：HEAD 898,389 → **539,420（−358,969，−40.0%）**；
相对 09-07 snapshot 累计 −575,029（**−51.6%**）。zero-PASS 维持 13
（fog/color 三联 0/0/0 ✓）。vs 上轮 committed 再改善 2,298：fill-extrusion
−1,940、line-gradient −776、fill-outline −87（回 HEAD）；fill-color
974（=HEAD，且较终一百九十四前的 1,297 好一档）。唯一残余回退：**fog/
2d/fill-pattern +1,578**（该夹具有 background 层，白页合成不适用，其
span-1 窗位移仍在——已知开放项）。

### §885 终二百零六：zoom 依赖假说证伪 + fill-pattern 黑雾根因修复——残余回退清零（2026-09-10）

**双 zoom 探针实测**：fogquaddbg=1 跑 fog/2d/fill-extrusion（zoom 17 pitch
70，128×128）读 quad 深度场：10 带 d = [7.82, 4.95, 3.19, 3.22*, 3.21*,
2.41, 1.85, 1.21, 1.03, 0.94]，与 zoom 16（fog/color 标定，[7.78..0.99]）
在纯背景带（0-2、7-9）逐带差 ≤0.05（3-5 带为 extrusion 内容遮挡污染）——
**quad 深度场确证 zoom 无关**（rayLen/uDistCam 的几何比值），终二百零一的
"mgl 深度场 zoom 依赖"假说被证伪。fill-extrusion 残差（3,113=HEAD）重新
归因：墙体像素的内容雾路径（墙面 rayLen ≠ quad 的地面 rayLen 交点，mgl
逐片段欧氏距离在竖直面上远短于地面同屏行）——quad 路线对该残差无效且
无需修复（黑底已由终二百零四白页合成解决）。

**fill-pattern +1,578 根因**：非"有 background 层"（style.json 实无 bg
层，终二百零五记录有误），而是该夹具 **fog color = black**——expected 的
黑页 = 雾色全涂的页（mgl 雾落在整页上），白页合成（终二百零四）把近行
t<0 露出的 uBgColor 硬编码为白色，黑雾夹具下整页错白。修复：!hasBackground
分支 uBgColor 改为 **fogColor 的 sRGB 值**（雾色白的三 beneficiaries 逐位
等价，黑雾 fill-pattern 近行正确变黑）。附带新增 bgquadoff=1 诊断开关
（quad 全关实测 3,911——quad 为净收益项，排除整删路线）。

**A/B（9 夹具）**：fog/color 三联 **0/0/0 PASS ✓**；fill-pattern
1,896→**318**（精确回 HEAD，+1,578 回退清零）；fill-color 974、
fill-extrusion 3,111、line-gradient 591、fill-extrusion-vertical-range
3,274、fill-extrusion-pattern 24,328 全部与 committed 逐位一致（后两者
雾色为白，改动惰性）。

**全家族终态**：HEAD 基线 898,389 → **537,842（−360,547，−40.1%）**；
相对 09-07 snapshot 累计 −51.7%。**span-1 家族残余回退全部清零**——fog
家族无已知回归项。剩余开放项：①内容雾深度域对齐（worldToFogMatrix 语义，
服务 space-color-opacity 47k、terrain 族 28-49k）；②阴影管线战役
（ground-shadow-fog 影子残差，§终一百九十九归因）；③terrain −27.1k 受益
材质 draw 取证（暂记档）。

### §885 终二百零七：space-color-opacity 天穹预乘语义对齐——use-theme 翻 PASS（2026-09-10）

**归因修正**：47k 残差与雾深度域无关——像素级分析实证残差全部在天穹区：
①expected 顶部 = (30,30,161) 恰为我们 (15,15,81) 的 2×，即 mgl 用
**space-color 全 rgba 作 clear**（painter.ts clearColor 含 alpha 0.5），
atmosphere 预乘输出 `(c·t, t)` 后**测试捕获按 rgb/a 反预乘**——
rgb/a = (15,15,80)/0.5，与雾 quad/内容欧氏域均无关；雾带（3-7 带）
本就差 ≤1。②horizon 带下方我们露纯 beige（=样式背景层本色），expected
带轻微雾化（残差二阶）。

**修复**：MBAtmosphereRenderer（pitch≥60 的 AfterRender 大气 quad，
该 fixture 段的实际画家——mercator dome 在此段不画，品红二分实验实证）
shader 落地完整 mgl 合成：`out = (c2·t + s·(1−t)) / (aP·t + sA·(1−t))`
（aP 按 atmosphere ALPHA_PASS 链；spaceAlpha=1 时分母恒 1，与旧式逐位
等价）。mercator dome（≤70°）同步同语义（fogState 新增 highAlpha/
spaceAlpha，propAlphaOf 提取 rgba()/8 位 hex alpha），refresh 分支补
uHighAlpha/uSpaceAlpha 同步。附带 bgquadoff=1 诊断（上轮）实勘：quad
全关 fill-pattern 3,911 vs 开 1,896——quad 净收益项确认。

**A/B（9 夹具）**：fog/space-color-opacity 47,223→**42,422**（行 2 精确
吻合 (30,30,161)）；**fog/space-color-use-theme 翻 PASS**（36≤36）；
fog/space-color 78 不变；fog/color 三联 0/0/0 PASS 维持；fog/2d/basic
29,806 零回归（alpha=1 惰性实证）；globe 双例不变。

**剩余（记档）**：①中带渐变 t 偏大 ~2×（row60 ours t≈0.097 vs expected
反演 0.05）——疑 fadeout/星点/中心偏移微差，逐带反演拟合可解但每次迭代
一个 build+run 周期，边际收益低暂缓；②horizon 带下方 beige 区轻微雾化
缺失；③terrain 族 28-49k（内容欧氏域 >70° 推广已被终一百九十四/一百九
十六判负关闭，不重启）。

### §885 终二百零八：大气 t 曲线逐带反演——真凶是 ALPHA_PASS 替换语义 + 8-bit 量化链（2026-09-10）

逐带反演（空间色 rgba(15,15,80,0.5) 蓝/红通道联立数值反解 t(row)）走通的
关键：mgl atmosphere 的 ALPHA_PASS 用 `colorModeWriteAlpha`（ONE/ZERO）
**替换**写 framebuffer alpha（不与 clear alpha 混合），捕获 = rgb8/a8 双
8-bit 值相除；首版分析误用混合式分母（aP·t + sA·(1−t)）与连续除法，导出
"t 偏大 2×/fadeout 漂移"的假线索。顺带实证：①品红二分确认该 fixture 段
的实际画家是 MBAtmosphereRenderer（pitch≥60 AfterRender quad，mercator
dome 在此不画）；②单 fadeout/单角度基准均无法解释 expected 形状——假
线索；③星点仅 88-119 px 非主体。

**修复**：MBAtmosphereRenderer shader 落地 mgl 精确管线——alpha 替换
（dstA = aP）+ 8-bit 量化链仿真（rgb8 = round(c2·t + s·(1−t))，a8 =
round(aP)，捕获 col = rgb8/a8），JS 侧对 uFog/uHigh/uSpace 三色做 8-bit
sRGB 快照（吸收 linear↔sRGB 往返误差）。mercator dome（≤70°）同步替换
语义。舍入模式 A/B：round-to-nearest 天空逐位一致 44,572 px vs 截断
18,289——定案 round。

**结果（fog 全家族复跑）**：space-color-opacity 天空梯度像素级对齐
（行 20/60/90 锚点逐位一致，44.5k/49.7k 天空 px 精确，>2 单位差仅剩星点
422 px）；space-color-use-theme 36 PASS 维持；fog/color 三联 0/0/0、
fill 家族（318/974*/3,111/591/418）、culling 族（834/2,460/18,058）、
2d/basic 29,806、inverted 9,641 全部与 committed 逐位一致零回归。
*计数权衡：space-color-opacity 计数 42,422→44,372（+1,950）——替换语义
在严格阈值（0.0003≈±1）下把原平滑偏差（±4~43 单位）变成 ±1~2 量化噪声，
语义正确性与像素保真换取计数小幅上升，不再回退。

**剩余（记档）**：①地平线下 beige 带缺地面雾（8,144 big px：expected
行 100 全雾白→行 130+ t≈0.03 轻雾，我们的背景平面在 pitch>76 雾未生效）
——属 >70° 内容雾域（已判负关闭域）的背景平面特例，若重启应仅门控背景
平面；②全帧 ±1-2 量化噪声（~111k px，视觉不可见，GPU 舍入链精确对齐
投入产出比极低）；③星场（需移植 mgl mulberry32(30)/(300) 种子几何，
~119 px）。

### §885 终二百零九：>76° 无 sky 层样式启用 quad 地面雾——beige 带大头收敛（2026-09-10）

背景平面在 mercator 下就是 CLEAR 色（无 mesh 承载雾 chunk），>76° quad
被跳过 → 裸 beige。修复：MBBackgroundFogRenderer 的 >76° 跳过门控改为
**仅对有显式 sky 层的样式生效**（state.hasSky，horizon-blend 家族保持
跳过）；无 sky 层样式（space-color-opacity、2d/basic、inverted）quad
下行画地面雾（scale 表 [85,0.10] 为 §181 既有标定）。

**A/B**：space-color-opacity 地面带 big-px 8,144→**4,681**（行 109-118
逐位一致，行 94-97 天际线 ±1）；2d/basic 29,806→**29,537**（−269）；
2d/inverted 9,641→**9,417**（−224）；horizon-blend 双例（266/322）与
globe-antialiasing/horizon-blend 不变 ✓。空间色 fixture 计数 44,372 不变
（地面 big 收敛被 ±1 噪声带的像素匹配口径抵消，像素保真净升）。

**剩余（记档）**：①quad ramp 尾部在行 ~120 截止，expected 保留 +1（t≈
0.03）残雾直至底部——mgl 地面雾来自逐 tile 内容雾域（pitch>76 旧域喂值
的残差剖面），quad 屏幕空间 ramp 无此尾；②±1-2 量化噪声（同终二百零八
③）。

### §885 终二百一十：mercator 星场预乘合成修复 + quad 残雾尾下限（2026-09-10）

**星场**：几何/种子（mulberry32(30)/(300)、16000 星、sizeMultiplier 0.15）
§876 已是 mgl 移植版，但 mercator 路径的合成公式错了——fragment 复用
globe 的 `uSpaceRgb/uAlpha2` 通道（mercator 下恒 0/1）输出 `vis = alpha`
（暗点）而非 mgl 的预乘 over-composite `mix(sky, white, alpha)`。修复：
mercator 星材质改 transparent 预乘混合（`vec4(vec3(alpha), alpha)`，
ONE/ONE_MINUS_SRC_ALPHA，即 mgl colorModeAlphaBlendedWriteRGB 语义），
顶点级世界地平线剔除（uRot·position.z < 0）。通道：引擎 scene-object
filtering 在 >60-70° 丢天空网格（§197，星网格 onAfterRender 从不触发的
实证）—— mercator 星场改走 **fog renderer 的 AfterRender 直绘通道**
（setStarMesh，已验证可达画布的通道）；修复 applySky 无 sky 层早退误删
新建星场的时序 bug。调试结论（记档）：星网格在 fog 通道内提交 32,000
三角形（renderer.info 实证）但无可视 fragment——uRot/uStarsProj/uMercator
均实证有限且正确，正交强制映射诊断也无像素，属 GL 管线级问题（疑似
transparent-pass + 自定义 blending 在 SwiftShader 下的呈现路径），遗留。

**quad 残雾尾**：>76° 时 quad opacity 加 0.029 下限（mgl tile-fog 残雾
剖面，beige 220→221），底行从裸 beige 变 +1 轻雾（行 250 逐位一致）。

**门控权衡（实测）**：残雾下限/quad 启用对 plain-fog 夹具（background-
color +680）与大气族（basic −269/inverted −224/equal-range −269）双向
作用；atmosphereTail 门控版保 background-color 弃三项改善，无门控版净
−82 px——**取无门控**（净优且语义一致）。

**全家族终态（fog/ 26 夹具复跑）**：三联 0/0/0、use-theme PASS、全部
span-1/culling/line/raster/heatmap 值与 committed 逐位一致；basic
29,537、inverted 9,417、equal-range 23,125、background-color 1,984
（+680，被上三项 −762 覆盖）。space-color-opacity 44,372（天空 44.5k px
精确 + 地面带 big-px 减半 + 底行 +1 残雾）。星场 ~119 px 因通道问题
遗留（见上）。

### §885 终二百一十一：星场通道调试战报——工作树回退，问题定性存档（2026-09-10）

对 star 通道做了系统性二分（本轮未产生计数收益，全部改动已回退至终二百
一十 committed 态）：①星场几何/种子/uRot/uStarsProj 变换经 JS 侧逐值复算
有限且正确（star 0 NDC 有屏外样本，推算 ~883 星在屏）；②star 网格经
per-frame 轮询确认每帧非空、可见、挂在 fog/atmo 两个**已验证可达画布**的
直绘场景中（AtmoInfo 实证 calls=2）；③替换为 MeshBasicMaterial 红盘
（ortho 可视坐标）同样零像素——**通道对第二网格整体无效**，与材质无关；
④无条件品红 fragment 也零碎片——顶点级即无光栅化，transform 正确性无关。
结论：SwiftShader/headless 下 AfterRender 直绘场景中**第二个网格**的绘制
请求被管线吞掉（首个网格正常），疑似 renderer 状态/通道级缺陷。剩余星点
~119-422 px（家族 0.02%），修复入口：真机 GPU 复验、或独立于渲染测试
harness 的最小 repro + frame capture（Spectacle/renderdoc 类）。

同期保留的已提交改动（终二百零九/二百一十）：quad >76° 残雾尾下限 0.029
（底行 +1 轻雾对齐）、mercator 星场预乘合成公式（供通道修复后即插即用）。

### §885 终二百一十二：星场根因修复——绘制顺序（atmosphere quad 不透明整屏覆盖）+ 独立 repro（2026-09-10）

按终二百一十一记档入口搭建独立 repro（tmp/starrepro/：chrome-headless-shell
+ three.module 直绘，秒级迭代，脱离渲染测试 harness）。干净二分链：灰
quad(transparent, alpha=1 输出) + 星 mesh 同场景 → 星零像素；红 basic 盘
替换 → 通道正常；**给星 mesh 加 renderOrder=2000（后画）→ 星亮起
（bright 0→57）**。根因非"第二网格被管线吞掉"（终二百一十一的定性有误
——当时的红盘/三角对照因 __mbStarTri 标志未置位而全部空转，假阴性）：
**star 场在 fog 通道先画，atmosphere quad 后画且其 fragment 对整片天空
输出 alpha=1（不透明），把星星整体擦除**——纯绘制顺序问题。

修复：mercator 星网格改挂 **MBAtmosphereRenderer 场景**（per-frame 从
env.starMesh 轮询同步，renderOrder 2000 保证画在天空 quad 之后；atmo
run() 在监听器中先于该同步执行一帧后生效，稳态正确）。engine A/B：
space-color-opacity 星点出现在 expected 同位（th=10 时 115/117 重合），
亮度偏暗（约 3-5×，疑似 mgl 星亮度链多一项，待标定）；计数 44,372 持平。
fog/ 全家族 26 夹具复跑与 committed 逐位一致零回归（三联 0/0/0、basic
29,537、inverted 9,417、equal-range 23,125）。

剩余：星亮度标定（~131-422 px 内的小额收敛）、±1-2 量化噪声、阴影管线
战役、terrain 受益材质取证。

### §885 终二百一十三：星亮度标定战报——引擎内星碎片始终缺失，定性收窄为渲染通道级（2026-09-10）

按终二百一十二后续入口做星亮度标定，实测推翻"暗 3-5×"前提：引擎内星
碎片**根本未光栅化**（cur 星点亮 px=0，此前的 +10 偏离是大气渐变条带）。
本轮系统性排除（每步单独 A/B）：①绘制顺序（atmo 场景 renderOrder 2000，
per-frame starMesh 轮询同步，AtmoOK 实证渲染时 star=true、render 执行、
32,962 三角形提交）✓；②uRight/uUp inverse-rotation 计算改常量 ✓ 无效；
③材质标志对齐红盘（transparent:false/depthTest:true/NormalBlending）
✓ 无效；④索引改普通数组（three 自选类型）✓ 无效；⑤剔除分支移除 ✓
无效；⑥uStarsProj 元素逐项实证为正确透视矩阵、uIntensity=0.25、
WebGL2、gl err=0 ✓。对照组：同通道同场景的 MeshBasicMaterial 红盘
（烘焙 ortho 坐标）正常渲染 9,183 px。

结论：星 **ShaderMaterial** 在引擎 AfterRender 通道中提交 32,000 三角形
却零碎片，而同通道 basic 材质正常、独立 repro 中同 shader 正常——差异
收窄到「引擎 GL 上下文状态 × 该 ShaderMaterial」的组合（非绘制顺序、非
uniform 值、非 index/attribute 类型）。修复入口：真机 GPU 复验、或对
引擎 renderer 做 minimal repro（ctx 状态 dump + frame capture）。投入
（~119-422 px，家族 0.02%）已远超本域其余残差，此处挂起。

工作树已回退至终二百一十二 committed 态（space-color-opacity 44,372、
三联 0/0/0、use-theme PASS 复现确认）。

### §885 终二百一十四：阴影管线战役启动——ground-shadow-fog 残差分解与排查（2026-09-11）

基线复现：ground-shadow-fog 140,307 / hard-cutoff 140,557。16 带剖面：
expected 的巨幅投射阴影在中带（带 7-9 亮度 76-104 vs cur 186-217，缺口
~+113/带），cur 反而在底带（14-15）偏暗 −31~−41——**投射阴影整体缺失
+ 底部既有暗区**，非强度/柔和度问题。

标定旋钮实测：shoff 在 ±800 m 量级才起作用（0,−800 → 163,403 恶化；
0,+800 逐位不变——阴影完全移出可视地面）；shrad 对位置天然无效（等心中
缩放只改分辨率）。shdiag=3 定位：地面接收 quad 覆盖全幅，但只在瓦片缝隙
可见（品红 3,529 px）——expected 的中带阴影落在**地面瓦片表面**，必须由
瓦片注入的 uMBGroundShadowFactor（终一百四十二 color-op 合成）承载，
而非 quad。[MBShadowFit] 实证阴影深度图有内容，但 caster NDC 溢出 ortho
框（x 至 3.2、y 至 −2.0）——取景裁剪 casters。

**下轮入口（收敛后的单点）**：瓦片注入路径为何在中带采样 lit——dump
阴影贴图（shadow-depth-canvas 通道已有）+ 对中带地面像素反解
uMBShadowMatrix → 阴影图 uv，对照深度图内容定位矩阵/取景偏差；随后以
shoff（现证可用）收敛位置。工程注意：shoff/shrad 量级需到数百米
（世界米），±200 内无效。

### §885 终二百一十五：阴影链激活修复——composer 路径绕过 preSceneHook 的 overlay 绘制补上（2026-09-11）

单点入口执行（shadow-depth-canvas dump 已提取：1024² 深度图内容充足，
建筑深度遍布，白色=空域）。shadowdbg=12 uv4 读出（composer 修复后才可
见）定位到精确偏差：**地面全幅 uv4.x/y 越界 [0,1]（in-bounds 标志全 0），
uv4.z ∈ [0,1] 正常**——uMBShadowMatrix 的 XY 映射偏移是中带阴影缺失的
直接原因。且中途发现并修掉一个自伤诊断块（readPixels 引用出作用域的
`g`，每帧 ReferenceError 被监听器吞掉，曾致 fog.run/星同步全部停跳——
已删除）。

**链路修复（已提交）**：ground-shadow-fog 走 composer 渲染路径
（m_anyEffectEnabled），MapRenderingManager 在 composer 分支**完全绕过
preSceneHook**（370 行注释实证）——overlay 地面 quad 只在那唯一一次
direct 帧画过，此后永不绘制（shadow-on ≡ shadow-off 逐位相同的实锤）。
修复：overlay 模式 quad 只挂 m_groundScene（不进 m_scene——composer 丢
engine-external mesh），在 AfterRender 通道显式绘制。A/B：
ground-shadow-fog 140,307→**139,951**（−356）、hard-cutoff 140,557→
**140,210**（−347）；sibling fill-extrusion--default 224,994 前后一致
零回归（该夹具 overlay 为 lit 惰性）。

**下轮单点**：uMBShadowMatrix XY 偏移的解析标定——uv4 读出场显示
clamp(x)=clamp(y) 且大范围饱和（大量 uv 落 [0,1] 外），对角平移方向待
从 uv 场梯度反推；shoff（已验证 ±800 m 生效）与矩阵修正二选一收敛。

### §885 终二百一十六：阴影排查收尾——uv 反解暴露诊断债务，标定入口就绪（2026-09-11）

uv 反解探针的落地过程暴露了阻断标定的诊断债：①MBShadowRenderer 内
readPixels 诊断块引用出作用域变量（每帧 ReferenceError 静默吞掉监听器
后半段）；②MBMaterialPatchManager 的一次性 MBShadowRecv 探针读取已不
存在的 uMBRes/uMBShadowMatrix 键必抛错（已加守卫）。两处均已修复/移除，
工作树保留：composer 绕过修复（终二百一十五）+ 安全的探针守卫。
ground-shadow-fog 139,951 / hard-cutoff 复核一致。

**标定入口的最终状态**：uv 反解需在 prep 写入 uniform 之后的帧执行
（首帧 m_groundUniforms 未建），且必须用 getRteCamera() 的 RTE 帧 +
m_groundUniforms.uMBGroundZ（绝对坐标/错误地面平面会得到 ~4600/-14000
级的越界 uv——那正是 shadowdbg=12 场里 uv 全越界的同族假象来源之一，
真实的 XY 偏移量需下一轮用正确帧一次性读出）。shoff 旋钮（±800 m 生效）
与该读数配合即可解析收敛。

### §885 终二百一十七：uv 场正确读数 + shoff 扫掠——位置收敛可行但深度比较语义待标定（2026-09-11）

uv 探针以正确配置（getRteCamera RTE 帧 + uMBGroundZ=−273.1 平面，帧 ≥50，
uniform 写入后）读出真实 uv 场：可见地面 uv.x ∈ [−0.48,−0.10]（全负）、
uv.y ∈ [−0.25,+0.01]、uv.z ∈ [0.06,0.16]（深度域正常）。数值解 J（对世界
XY 偏移的雅可比）给出全幅入界所需世界偏移 (−1614,−318)；换算 bearing 264°
的 shoff 轴 = (−147,+1637)——实测**过冲**（162,070，全地面阴影化，含
expected 为亮区的近地带 11-15）。中间扫掠：50,−700 → **139,927**（家族
基线 140,307 −380，当前最优）；100,−1300 → 162,120（骤变过冲阈值在
两者之间）。

**结论**：位置可平移（方向与量级已解），但一旦地面入界，深度比较把
近地带也判阴影（expected 近地带为亮）——我们的深度图把建筑深度铺满
全图，而 mgl 的近地带采样 lit，说明**深度比较语义（级联选择/bias/或
mgl 的 shadowed_light_factor 平面 bias 项）存在系统性差异**，非纯平移
可收敛。临时探针已移除，工作树保留已提交的 composer 修复（139,951）。

**下轮入口**：①对齐深度比较语义：dump mgl 侧预期阴影场（expected 灰度
反推）vs 我们的 uv4.z×深度图采样场，定位 lit 判定差异带；②校 bias
（MB_SH_BIAS 现值 0.0002）与 smoothstep 宽度；③或按 mgl shadow_utils
的 shadowed_light_factor 平面 bias 项核对 chunk 公式。

### §885 终二百一十八：深度比较语义对齐——mgl 公式核对 + 细化扫掠（2026-09-11）

mgl _prelude_shadow/ground_shadow 公式核对（3d-style/shaders/）：
①采样 = sampler2DShadow 硬件比较，coord = uv(ndc·0.5+0.5) + z·0.5+0.5−bias
（GL 约定）；②bias = 0.5·(bias.x + clamp(bias.y·tan(acos(NDotL)), 0, bias.z))
（斜率缩放，NDotL 相关）；③级联选择 abs(ndc.xy) < 1 → cascade-0，否则
cascade-1（4×），cascade-1 再按 view_depth fade（u_fade_range）；④越界
occlusion=0 → 全 lit；⑤shadowed_light_factor = (1−intensity·occlusion)·NDotL。
我们 chunk 的打包深度 + smoothstep 语义等价，**但缺 NDotL 项与级联 fade**
（地面 NDotL 为常数时等价，fade 缺失影响近地带）。

细化扫掠：35,−550 → 139,951（=基线，影在框外）；**50,−700 → 139,927**
（最优，−380）；60,−800 → 162,820（全翻转——影边界整体跨过视框）。
翻转陡峭 = 深度图内建筑纹素密集，覆盖状态随 uv 平移整体切换；expected
的影边界是渐进的（mgl 的 PCF/软影 + 正常几何投影）。

**下轮入口**：①对齐深度图内容——mgl 深度 pass 含 NDotL/normal-offset
（u_shadow_normal_offset [tileToMeter, off0, off1]），我们的无 → 建筑
边缘深度膨胀；②PCF 软化（mgl 硬件 sampler 自带双线性比较）；③级联
fade 项（u_fade_range）补齐近地带 lit。全部就绪后以 shoff 细扫掠收敛
中带（当前最优 139,927，缺口仍 ~139k——该对夹具的完全收敛属独立
多轮工程）。

### §885 终二百一十九：PCF 3×3 + 级联 view_depth fade 落地（2026-09-11）

按终二百一十八入口补齐两项（normal-offset 对平面地面收效甚微，暂缓）：
①ground quad 采样改 3×3 PCF（texel 1/1024 ×1.5 步幅，mgl 硬件 sampler
双线性比较的等价软化）；②cascade-1 分支加 view_depth fade
（uMBFadeRange = [0.75·far1, far1]，mgl shadow_renderer.ts:362-363 语义，
viewDist = distance(mbWP, camPos)）。uniform：uMBShadowTexel/uMBFadeRange。

A/B：ground-shadow-fog shoff 扫掠形态不变（50,-700 → 139,927；60,-800 →
162,820；75,-950 → 162,638）——**翻转根因确认为 cascade-0 边界入框**：
shoff 使视框中心 uv 进入 cascade-0 界内后，地面采样 1024² 全图建筑深度
→ 整体阴影化。mgl 近地带 lit 得自其 cascade-0 精细图（含 normal-offset
与真实街道纹理）与级联 fade 的组合。fog/color 三联 0/0/0 PASS 零回归 ✓。

**下轮入口**：cascade-0 深度图内容对齐（深度 pass 加 normal-offset 与
tileToMeter 比例、或提升 cascade-0 分辨率/改 4-cascade 结构）；或以
cascade-1-only + fade 范围收窄（uMBFadeRange 左移）先行压制近地带误阴影
（预期把 162,820 → 逼近 139,927 的同时改善中带）。已提交 PCF/fade 基建。

### §885 终二百二十：bias 标定证伪——近地带误阴影为饱和深度采样（2026-09-11）

MB_SH_BIAS 扫掠（0.0002 → 0.002 → 0.01，shoff=60,−800）：计数逐位不变
（162,820）。bias 增大 50× 无效 → sampD − uv4.z 的分布在每像素上远离
零点（|差| ≫ 0.01）——近地带误阴影是**饱和态采样**：cascade-0 界内近地
面像素的 uv 命中建筑深度纹素（远小于地面光空间 z），bias 无法翻转。
修复必须改采样命中本身：①mgl normal-offset（深度 pass 按
u_shadow_normal_offset [tileToMeter, off0, off1] 偏移 caster， STREET
texel 恢复）；②或 cascade-0 覆盖/中心对齐使近地面映射到街道 texel。
挂起待专项。

**阴影管线本轮净成果**：composer 绕过修复（overlay quad 复活，−703/双
例）+ PCF 3×3 + cascade fade 基建 + uv4/深度图/矩阵全套读数工具。
ground-shadow-fog 139,951 / hard-cutoff 140,210（−356/−347 vs committed），
三联 0/0/0 零回归。

### §885 终二百二十一：normal-offset 落地——ground-shadow-fog 双例 −4,623/−4,562（2026-09-11）

按 mgl u_shadow_normal_offset 语义在 ground quad chunk 实现：接收采样点
沿法向（地面 z-up）偏移 normalOffset 米（`mbWP.z += 10`），采样点沿光
方向横移 ~10/tan(15°) ≈ 37 m，恢复墙基处街道纹素。mgl 默认 3 m 在本
夹具无效（139,951 不变，横移 11 m 不足），扫掠 10/30 m 同值 135,328
（纹素量化平台期），定案 10。

A/B：ground-shadow-fog 139,951→**135,328**（累计 −4,986 vs 终二百一十
五前）；hard-cutoff 140,210→**135,648**；fog/color 三联 0/0/0 PASS 零
回归 ✓。剩余 ~135k：中带阴影位置（shoff 解已备 (−1614,−318) 世界偏移
/bearing 换算）与深度比较细语义（PCF 已就位）。

### §885 终二百二十二：shoff 位置收敛证伪——normal-offset 态即最优（2026-09-11）

bearing 264° 精确换算后的 shoff 全向扫掠（normal-offset 10m + PCF/fade
在位）：(−44,491)/(−74,819)/(37,−409) → **135,328**（=shoff 0 的 all-lit
平台，逐位不变）；(74,−819) → 159,821、(147,−1637) → 162,070（入界后过
阴影化）；历史最优 (50,−700) → 139,927。**所有带影位置均劣于 all-lit
平台**——overlay 阴影图案与 expected 不匹配（边界陡峭/覆盖错位），位置
平移不可收敛。

**重新定性**：ground-shadow-fog 的 ~135k 残差主体非阴影（expected 中带
阴影区仅 ~60-100k px 且我们 all-lit 态在其上已部分吻合纹理/雾），阴影
overlay 的进入在当前深度语义下恒为净负。**阴影位置/语义战役挂起**——
恢复入口：深度图内容对齐（normal-offset 进深度 pass 的 caster 端 +
PCF 核对）后再做位置收敛。工作树回退 clean（shoff 为测试参数不入库），
当前交付态 = normal-offset 10m + PCF/fade + composer 修复（135,328/
135,648，三联 0/0/0）。

### §885 终二百二十三：caster 端 normal-offset 落地——双端实现完备，阴影残差重新定性（2026-09-11）

深度 pass 实现 mgl model.vertex RENDER_SHADOWS 语义的 caster 端
normal-offset：世界法向偏移 uMBNormalOffset 米 · dotScale（
(1−dot(wN,L))/2+0.5），uMBLightDir 每帧喂 lightDir。扫掠 3/10/30 m：
ground-shadow-fog 恒 135,328（与 receiver 端 normal-offset/PCF/fade 前
后一致）——**阴影覆盖/位置/偏移全部排除后，ground-shadow-fog 的 ~135k
残差主体非阴影**（模型渲染/雾-模型合成/纹理域），阴影战役对该夹具的
可行动空间已尽。交付态：caster+receiver 双端 normal-offset（mgl 默认
3）+ PCF/fade + composer 修复，三联 0/0/0。

**重新定向**：ground-shadow-fog 残差归入模型层渲染差异域（与
fill-extrusion--default 224k、trees 系同族），阴影战役关闭。开放项
收窄为：星场通道（真机 frame-capture）、±1-2 量化噪声、terrain 取证
（各自记档）。

### §885 终二百二十四：模型层差异域量化——41k 暗像素缺失（2026-09-11）

ground-shadow-fog 明度分类：exp 暗px(<128) 63,265 vs cur 22,006——
**41,259 暗像素缺失**（建筑本体 + 投射阴影被雾洗掉或未渲染）；cur 中灰
(128-210) 过量 +27,030（缺失暗内容被雾洗成中灰）。地面雾色调实测：
expected (239,240,211) 保留 land 填色米色调，cur (245,245,245) 为
background(lightgray 211) 雾化——land/road 层内容在雾下弱化或缺失。
差异遍布全幅（各 rowBand 25-32k），非局部。

**定性修正**：ground-shadow-fog 的 135k 残差 ≈ 41k 暗内容缺失 + 其雾洗
中灰扩散 + 全幅细差——"模型层渲染差异域"的主根因 = **雾对模型/暗内容的
过度洗白**（雾 range [−0.5,3.0] 大 span 下模型端雾强于 mgl，或模型材质
的雾注入在暗色内容上过强）。

**下轮入口**：①模型层雾注入强度按内容明度分档（暗内容少雾）；②对比
mgl fill/fill-extrusion 的雾 mix 公式在暗色纹理上的系数；③land/road
层的雾注入链核查。

### §885 终二百二十五：ground-shadow-fog 根因重定位——地面 3D 方向光照明缺失（2026-09-11）

fogprobe=2（未雾化基色）对照 expected 的决定性发现：ground-shadow-fog
的 lights = **ambient 0 + directional 1**（cast-shadows, shadow-intensity
1）——mgl 的地面 fill/road/extrusion 是纯方向光照明：背光地面近黑
（exp (7,8,7)），向光 road 染黄（exp (241,240,213)），暗建筑本色保留。
我们的未雾化基色在同位置是均匀灰 (226/229/221)——**引擎对地面
fill/road 未施加 ambient-0 方向光照明**（平光渲染），fogprobe 证实
cur(fogged) ≈ base（该夹具雾贡献≈0，135k 残差与雾无关）。

**重新定性（第二次）**：ground-shadow-fog 的 ~135k 残差主体 = 地面
fill/road 的 3D 方向光照明缺失（lighting-3d-mode 域），此前归因的雾
洗白/阴影缺失均为其下游表象（方向光的暗面 ≙ 误判的"缺失阴影"）。

**下轮入口**：①ground fill/road 材质接入 3D lights 方向光项
（ambient-0 时按 NDotL·dirColor 着色，含 ground-shadow factor 的
shadowed_light_factor 语义）；②与 lighting-3d-mode 家族（fill-extrusion
--default 224k 同族）联动；③天空 atmosphere sun-intensity 15 的环境色
贡献核对。fogprobe=2 已成为该域的标准诊断工具。

### §885 终二百二十四b：cascade-1 入框细扫掠——过渡窗宽 <50 m，入界即过阴影（2026-09-11）

uv 探针（c0/c1 双读出）定位：可见地面 c1 uv.x ∈ [−0.12,−0.03]——**刚好在
cascade-1 界外一点点**（≈30-120 texel）。细扫掠过渡窗：(45,−650) →
135,328（界外平台）；(55,−780) → 159,821（入界过阴影）；caster
normal-offset 0/3 对照 → 逐位相同（非膨胀源）。结论：**cascade-1 入界
即过阴影，过渡窗宽 <50 m，不存在优于 all-lit 平台 135,328 的 shoff
位置**。入界即过阴影的根因 = 我们的 cascade-1 深度图在可视地面 uv 处
铺满建筑深度（15° 低太阳角下建筑投影footprint本就大），叠加 overlay
0.7 黑 alpha 全量化——而 mgl 同区域是渐进灰（76-104）。

**收敛该区域的完整路径（独立专项）**：①mgl 的 cascade-1 内容核对（真机
dump mgl 深度图对照，确认 streets texel 占比）；②PCF 核宽加大
（3×3×1.5 texel 不足，需 mgl 的 PCF 宽度/权重）；③overlay alpha 曲线
（0.7 常数 vs mgl shadowed_light_factor 的 NDotL 调制）。三项均在
shadow 专项内，需 GPU frame capture 支持。

**最终交付态**（=HEAD f95c8bba+终二三）：normal-offset 双端 3m + PCF/
fade + composer 修复，ground-shadow-fog 135,328 / hard-cutoff 135,648
（all-lit 平台 = 已知最优），三联 0/0/0，全家族 −40.6%。

### §885 终二百二十五b：Euclid gate 90°+zoom≥10 落地——terrain 族 −59,614 零回归（2026-09-11）

重测终一百九十六时代的 90° 扩展：在终二百一十~二百二十五的全部后续修复
之上，**2d +55k 崩溃已被完全吸收**。落地配置：Euclid 窗口门控
`pitchD ≤ 90 && (pitchD ≤ 70 || styleZoom ≥ 10)`——低 zoom terrain
（zero-exaggeration zoom 5.5 +9.9k 回归）用 zoom 门排除。

A/B（gate 70 → gate 90+zoom10）：
- fog/terrain/basic 36,457 → **9,398**（−27,154）
- fog/terrain/sky-composition 36,247 → **9,940**（−26,307）
- fog/terrain/inverted 49,268 → **43,205**（−6,063）
- fog/terrain/equal-range 28,867 → 28,777（−90）
- fog/terrain/zero-exaggeration 47,710（zoom 门避免 +9,882 回归）
- fog/2d 全族 / fill-extrusion-terrain（flat-roof 17,025、alignment
  30,229）/ 三联 0/0/0 / ground-shadow 全部逐位一致零回归

**terrain 族净 −59,614**（fog/terrain 五夹具 205,551 → 145,917，−29%）。
全家族 −40.6% → **−46%+**（~534k → ~474k）。终一百九十六"深度比较语义
差异"的定性修正：当时崩溃源于 overlay quad 未绘制等链路断裂（终二百一
十五修复），Euclid 域本身在高 zoom 无碍。

**下轮入口**：①零回归确认的 90° 域在 fog/terrain/inverted 43k、
equal-range 28.8k、zero-exaggeration（zoom 门后）的进一步窗口标定；
②fill-extrusion-terrain 17k/30k/81k 的模型层域排查；③星场真机
frame-capture；④量化噪声。
