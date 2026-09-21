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

### §885 终二百零七：全量位移归因表——5aa843ba 逐夹具对照（2026-09-10）

后台全量复跑累积至 233/3,033 时先行分析（222 夹具 vs snapshot，净改善
−68.4k），两大动子均以 5aa843ba 对照定案：
- **fit-screen-coordinates/terrain −136,209：既有漂移**（5aa843ba 同为
  108,478；pitch 45 fogAlpha=0，雾改动理论上不触及，实证一致）
- **fill-extrusion-vertical-gradient/with-ao +51,267：既有漂移**（5aa843ba
  同为 70,413；终一百八十四挤出族漂移）
本会话真实位移（vs 5aa843ba）：ground-shadow 双例 +4,956、trees 双例
−1,294、wireframe 0、fog 家族 −358,969（三联 PASS×3、culling 近清零）、
fill 四例白页合成后归零。全量复跑继续后台累积，最终归因须以 5aa843ba
逐家族对照复核（snapshot 含终一百八十四/一百八十五既有漂移，不可直接
作为对照基线）。

### §885 终二百零八：全量位移归因闭环——全部 ≥1k 动子均为既有漂移（2026-09-10）

累积 251 夹具（238 匹配 snapshot）的位移三查收口：新增动子
hillshade-shadow-color/use-theme（+7.6k）、symbol-cross-fade 双例
（+6.1k）、extent/1024-symbol（+1.8k）全部无雾无 pitch（雾改动不可达），
且 **5aa843ba 对照逐位一致**（59,590 / 9,794+9,558 / 265,340）——均为
snapshot→会话前 HEAD 的既有漂移。extent 0.7% 差为符号布局方差。
归因闭环：**本会话零未解释位移**；已知会话位移 = ground-shadow 双例
+5.0k（quad 窗）与 trees-use-theme −1.3k，其余全为漂移。
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

### §885 终二百二十六：负 opacity 泄漏修复（保护性）+ inverted/equal-range 路径定位（2026-09-11）

内容雾 chunk 的 fogFactor 只封顶不封底：fogT < 0（inverted [0.5,−0.5] /
degenerate [−0.5,−0.5] 等范围）时 fogFalloff 为负、mix 外推超过基色——
修复为双向 clamp。A/B：三联 0/0/0 ✓、2d/basic 29,537 ✓、ground-shadow
−4（噪声）——零回归确认；但 fog/terrain/inverted 43,205 与 equal-range
28,777 **不变**——两者的 raster 地形雾走 terrain_raster 材质路径（非
fog_fragment chunk），负 t 泄漏在另一处。

**下轮入口**：①terrain raster 材质雾路径的负 t 修复（同 clamp 语义）；
②fill-extrusion-terrain 17k/30k/81k 模型层域；③星场真机 frame-capture；
④量化噪声。

### §885 终二三四：P1 每面法线（emitter attribute）落地——终二二八墙面污染假设证伪（2026-09-11）

**实装**：①emitter（MBTileDataEmitter）标准挤出路径发射逐顶点 `extrusionNormal`
(vec3, 世界系)——底/顶 (0,0,1)；墙四边形改用 DEDICATED 复制顶点
（dupExtrusionVertex，复制 position/extrusionAxis/uv）携带外向水平边法线
（边 a→b 垂直、背环质心定向），墙不再与屋顶共享顶点；shaped roof
pushTri 携带已算出的精确面法线、pushWallQuad 复制檐口顶点带墙法线。
DecodedTile 新增 `extrusionNormal` attribute（itemCount 3，
extrusionNormals.length === positions.length 才发射）。②注入侧两处
（injectExtrusion3DLighting 的 opaque_fragment 注入 + 旧 uMBLightDirWorld
路径）：`dot(vMbAttrN,vMbAttrN)>0.25` 时用 attribute 法线（viewMatrix 变换
入视系），attribute 缺失（零向量，WebGL 默认常量属性）回退 dFdx/dFdy——
零 attr 几何（wall-band 等）天然惰性。③fill-extrusion-line-width 的
wall-band 路径 A/B 回归（sharp-corner +1,281/multi-tile +946/building
+755，顶盖共享带顶点被迫复制导致栅格化位移）→ **该路径回退保持导数回退**。

**判定实验（P1 假设证伪）**：occlusion 三例同批次小批量逐位对照
（stash 基线 vs 处理后，各两次逐位一致）：data-driven 552,700=552,700 /
after-3d 527,877→527,549(−328) / before-3d 554,854=554,854——**attribute
每面法线对 occlusion 三例无可测收益，终二二八"dFdx 墙面被屋顶化污染是
三例明暗颠倒根因"的假设不成立**（attribute 法线已正确生效：早先探针
批 552,700 与小批基线逐位一致即证法线生效路径畅通；三例残差主体在别的域）。

**批次效应入档（重要测量纪律）**：occlusion 族读数强依赖 karma 批次组成
——大批次（110 夹具）data-driven/after-3d/before-3d = 592,368/570,260/
602,999，小批次（occlusion 单独）= 552,700/527,549-527,877/554,854；
**同批次内逐位确定**（小批两次完全一致），跨批次数值不可比。此前
终二二八的 flip0=552,686 ≈ 小批次口径。A/B 必须同批次同过滤集。

**零回归确认**：大批次（同 110 夹具集）103 可比夹具 92 逐位一致，
11 夹具微动 ≤±363（rounded-edge-ao −230/−201、zero-height +67、
data-driven +363 等），净 +116（0.002%，噪声级），PASS 17→17 不变。
守卫：fill-extrusion-color 7 PASS 全保持。

**下轮入口**：①occlusion 三例残差（~552k 小批口径）重新归因——法线域
已排除，转 mgl 实拍（终二二九链路）逐层 dump 对照；②landmark-conflation
-buckingham 对 attribute 法线敏感（旧路径注入曾 +20,272，现注入侧回退
对齐基线，值得单独标定 attribute 法线在该夹具的方向性）；③terrain
raster 材质雾负 t 修复；④星场真机 frame-capture。

### §885 终二三五：mgl 实拍链路恢复+attribute 法线链路双 bug 修复+光响应曲线实测（2026-09-11）

**① mgl 实拍链路恢复（终二二九重建的复验与补全）**：vendored
mapbox-gl-js/dist/（gitignored）须从 registry 灌入官方 3.27.0 UMD bundle
（`npm pack mapbox-gl@3.27.0` 后拷 dist/mapbox-gl.js/.css/.map），否则
mgl-shot 404 超时；实拍分辨率修正为夹具元数据规格 512×512 CSS@2x=1024。
复验：occlusion/symbol-occlusion-data-driven 实拍与 expected.png 在 8 个
暗墙探针点逐位一致（29,29,29），全幅 diff>16 仅 77,007 px——参照链路
可信。新增 `?laz=<az>&lpol=<polar>` 光向覆盖参数（mgl-shot.html + cjs
extraQuery），可对参照平台做任意光向扫掠。

**② attribute 法线两处链路 bug（终二三四 A/B 无差别的真正机制）**：
- `#include <begin_vertex>` 锚点失效：injectExtrusion3DLighting 链上更早
  的 onBeforeCompile 已消耗该 token，`vMbAttrN = …` 从未写入（varying
  恒 0→回退分支恒走）。新增 vsAttrDecl/vsAttrWrite 编译探针（[MBExtLit]
  applied 行）定位。修复：`void main() {` 锚点写入（attribute 原始读取，
  无需等 begin_vertex）。
- **墙法线朝内（质心定向法对洞环/凹环失效）**：新增 attrdbg=1 探针
  （uMB3DDbg=4，R/G/B=0.5+0.5·世界系法线，品红=attribute 缺失）——
  wallA 法线 bearing≈281 与 mgl 实测一致，wallB/C/D 恰好反号（121 vs
  mgl 实测 300）。修复：边中点沿候选法线偏移 ε 做 even-odd 点在多边形内
  测试（跨全部环），向内则翻转。修复后 attrdbg 四点 bearing
  281/300/300/301 与 mgl 光向扫掠峰值逐点一致。

**③ mgl 墙面光响应曲线实测（?laz 扫掠 0°-330°，四墙点）**：value(az) 在
az=墙真实方位角处达峰（wallB/C/D 峰 188@300°），暗平台 29-30（az 60-180
广域）。两点拟合（diff 30°/60°：175/137）→ value ≈ 255·(0.334 +
0.407·cosΔ)——**存在 ~0.33 的巨大常数项与 ~0.4 的压缩幅值**，且暗平台
29 ≫ ambient 0.01·255≈3。我们注入的 `amb + dirColor·max(NdotL,0)`
公式（amb 0.01、dirColor 1.0）无法重现：既给不出 29 的暗平台，也给不出
136 的受光墙（mgl 实测对白漆受光墙 ≈136 ⇒ NdotL 等效 0.52）。
**终二二八墙面明暗颠倒的真正根因 = 注入的 3D 光照响应公式（常数项/
幅值/暗平台）与 mgl 不符，而非法线域**（法线域本轮已修复并对齐真值）。

**④ 方位角语义**：mgl [150,30] 对墙的暗/亮分布与 toSun bearing=150 一致
（我们 lighting3DState.dir 的 toSun≈330，180° 镜像）；但 extdirflip=3
A/B（小批 occlusion）：修复 31,633 px（背光墙变暗）同时破坏 31,438 px
（受光墙 167-179 vs exp 136），net ≈ 持平/+19k ibct——**方位角单独翻转
不是净收益，须与响应公式一起改**。

**⑤ 度量**：修正后小批 occlusion 552,699 vs 基线 552,700（法线域修复对
当前公式下整幅读数中性，符合③的公式主导结论）；大批 110 夹具集 103 可比
夹具 net +200（15 夹具 ≤±197，噪声级），PASS 17→17，line-width 家族保持
终二三四修复后的零回归。

**下轮入口（P1 主攻）**：①按 ③ 的 sweep 数据反推 mgl 的墙面光照公式
（候选：apply_lighting 的 `color·(amb·dirFactorMin+(1-…)·min(NdotL+1,1))
+ dir·NdotL` 全式核对 fill_extrusion.shader3d 源码；0.33 常数项疑为
vertical-gradient/半 Lambert 项）；②方位角语义与公式联动修正（复用
mgl-shot ?laz 扫掠做参照真值，逐公式变体 A/B）；③守卫：大批
fill-extrusion/lighting-3d/occlusion 集与本轮基线（mbstyle-fn-final2）。

### §885 终二三六：P1 破局——toSun 方位角修正+无雾 style 雾泄漏修复，occlusion 三例 −92%（2026-09-12）

**① 公式反推（fill_extrusion.shader3d ↔ _prelude_lighting.glsl 源码核对）**：
mgl `apply_lighting(color, normal)` = `linearProduct(color, amb·ADF +
dirColor·max(NdotL,0))`，ADF = vertical_factor(0.92..1)·ambient_dir_factor
(dirFactorMin 0.7..1, min(NdotL+1,1))，linearProduct = sRGB·k^(1/2.2)。
我们注入的合成公式与 uniforms 早已完全同构（终二三五拟合的 0.334/0.407
是污染读数所致，弃用）。扫掠数据重新精拟合：wallB 峰 188 → k=0.514 =
amb(0.01)+sin(30°)（极角 30° 对垂直墙 NdotL 上限=sinPolar）；az240→0.253
vs 预测 0.25、az0→0.0955 vs 0.0955——公式零偏差，**唯一错误 = 方向**。

**② toSun 方位角语义（扫掠峰值实证）**：value(az) 峰值出现在 style
azimuth = 墙外向方位角 → **mgl toSun bearing = style azimuth**。我们的
lighting3DState.dir（§682/§686 az+90+y镜像，为阴影族校准）对 [150,30]
给出 toSun bearing 330——180° 镜像。修正：injectExtrusion3DLighting 的
uMB3DDir 水平分量取反（集中式 getter 不动，阴影族/模型消费方另核）。
lightdbg 探针复核：暗墙 NdotL −0.326/−0.434/−0.442（=0.5·cos131° 等，
与理论逐位一致）。终二三五 flip3 的"净持平"反证系 PIP 法线修复前的
陈旧证据，作废。

**③ 无雾 style 的雾泄漏（第二根因，+mbLit 探针定位）**：方向修正后色彩
输出仍 105-179 与 NdotL 矛盾——新增 litdbg=1（uMB3DDbg=5，输出雾前
mbLit）：暗墙雾前 23（expected 29 ✓）受光墙 138（expected 137 ✓）——
光照已像素级正确，洗白全部来自雾。根因：UniformsLib.fog.fogAlpha 模板
默认 = 1，style 无 `fog` 时无任何路径重置它，注入的 inline mgl-fog 块
无条件把每个无雾 style 的挤出洗白（occlusion 夹具无 fog 键，mgl 不施
雾）。修复：材质编译时 scene.fog 不存在则 fogAlpha 覆写 {value:0}
（有意脱离共享模板）。

**④ 度量**：小批 occlusion 552,699→71,930（−87%）/527,549→27,511
（−95%）/554,854→7,802（−98.6%），setProperty/terrain 不变，五夹具合计
1,653,667→125,807（−92%）。大批守卫集（final2 基线）：103 夹具
75 逐位一致，净 **−2,117,670**——occlusion 三例 −519k/−544k/−595k，
lighting-3d-mode fill-extrusion 全族大改（default 74,823→24,573、
measure-light 70,630→3,594、MAPS3D-967 −60k、saturation −41k 等 22 夹具
改善），唯一回归 flood-light/fog +2,853，PASS 17→17。

**下轮入口**：①flood-light/fog +2,853 回归（有雾 style 方向修正的交互，
单独 A/B）；②occlusion data-driven 残余 71,930 的构成（对照 mgl 实拍
逐域分解）；③lighting3DState.dir 的集中式修正（阴影族 shadowLightState
同步对齐 mgl 语义，需真机深度对照）；④其余开放项（terrain 雾负 t、
fill-extrusion-terrain、ground-shadow-fog、星场）。

### §885 终二三七：终二三六三项收尾——回归归因、残余逐域分解、dir 消费方审计（2026-09-12）

**① flood-light/fog +2,853 归因**：extdirflip=3（旧方向+新雾修复）二分 =
91,846，与 dirfix 完全相同 → 方向无关，**全部来自雾泄漏移除**（该夹具无
`fog` 键，泄漏雾恰曾近似补偿 flood-light 域的另一处差异）。作为净正确性
改进接受；残余 91,846 主体为 flood-light 域（红晕梯度渲染差异）。

**② occlusion data-driven 残余 71,930 逐域分解**：diff 像素抽样呈蓝色
icon 交错（exp 有 icon 我们没有、反之：exp(41,132,184) vs cur 灰 138、
exp 灰 137 vs cur 蓝）——**残余已转入 symbol occlusion 域**
（icon-occlusion-opacity 的图标 3D 遮挡判定），挤出光照域干净（mbLit
探针 23/138 vs expected 29/137）。下轮主攻 icon 遮挡判定（遮挡查询/
深度语义）。

**③ lighting3DState.dir 集中式修正审计**：消费方清单 = MBShadowRenderer
(533/693, 影相机+深度方向)、MBMeshFeatures(596, 模型墙 NdotL)、
MBModelRenderer(122/156/327/371, 模型 PBR+影态)、MBStyleDataSource
(3050/5227)、ground quad/caster 注入。**本轮不做集中翻转**：阴影族的
§682/§686 校准与该 dir 深度耦合，须逐消费方挂 A/B 门控对照模型/阴影
夹具基线后迁移。补查结果：quantization-shadows 2,330 ≈ 历史锚 2,332
（位级守卫保持）；ground-shadow-fog 141,539 vs 锚 135,328（+6,211，仍属
其已记档的"地面 fill/road 3D 方向光缺失"开放域——33,671 px 暗墙反转
exp 0-7 vs cur 154-248 为该域表象，非本轮新回归对象）。

**下轮入口**：①symbol occlusion 域（icon 遮挡判定，occlusion 残余
71,930）；②ground-shadow-fog 地面/道路 3D 方向光接入（原 135k 域）；
③dir 集中式迁移（逐消费方门控 + 模型/阴影基线 A/B）；④其余开放项。

### §885 终二三八：symbol occlusion 域首攻——log 域遮挡比较修正（2026-09-12）

**机制对齐**：mgl symbol occlusion = 顶点级 occlusionFadeMultiSample
（30×30px 框 3×4 深度纹理采样，visible-tap = 1−clamp(300·Δz_std)，
visibility = clamp(2·avg−0.5)，opacity ×= mix(occlusion_opacity, 1, vis)）；
数据驱动表达式 restaurant→0.7/cafe→0.25/默认 1（默认 1 = 永不遮挡）。
我们 batch 遮挡值分配正确（occdbg 探针：0.7/0.25/1...）。

**根因**：patchPoiBatchMaterials 的 mbOccVisibility 把**标准 NDC z**（图标
mbW 换算）与 **log 编码深度**（RG 打包纹理）直接相减——两种编码的偏移
差使边界图标全读 vis=0 被 cull（10 个 mgl 可见图标全缺）而另一些意外
通过（33k px 多余 icon）。修复：图标深度换算到同一 log 编码域
（log2(1+w)·FC·0.5），epsilon 按 mgl 标准 z 300 斜率等价换算 log 空间：
Δlog = 1/(300·dfdw·(1+w)·lnFar)，dfdw = 2fn/((f−n)w²)。

**度量**：occlusion/symbol-occlusion-data-driven 71,930→66,283（−7.9%），
setProperty 9,280→8,970，terrain 9,284→8,973，before-3d 7,802→7,829
（+27 噪声级）。蓝像素总量 59,148/69,479→59,148/59,306（总图标面积已
对齐）；但 57 个 mgl 图标中仍有 21 个个体错位（62 vs 57）——**错位转入
placement/collision 域**（mgl CPU placement 选择不同实例），非 opacity
fade 域。

**下轮入口**：①placement/collision 域（图标个体选择的 mgl 对齐，
collision_index 语义）；②flood-light 域残余 91,846；③ground-shadow-fog
地面/道路 3D 方向光；④dir 集中式迁移；⑤terrain 雾负 t。

### §885 终二三九：placement 锚点剔除同款编码混比修复——mgl 图标实例全覆盖（2026-09-12）

**定位**：MBStyleSymbolPlacement.anchorOccluded（mgl placeCollisionBox
isClipped 语义）与终二三八的 fragment 侧同款 bug——readDepthBuffer 读回的
深度目标是 **log 编码**（RG 打包，TerrainDepthOcclusion），旧代码用标准
NDC z（近远平面换算）与之比较，边界锚点判定随机化（20 个 mgl 放置的图标
被错误剔除）。修复：锚点距离换算到同一 log 编码域
（log2(1+w)·FC·0.5），epsilon 用 mgl 标准 z 1/300 斜率的 log 等价
（同终二三八公式）。

**度量**：data-driven 66,283→65,839；修正统计脚本（`==`/`&` 优先级
bug）后重算：**mgl 的 57 个图标实例现已全覆盖**（此前 21"缺失"系脚本
假阳性），我们 59 vs mgl 57（+2）。残余 65,839 构成转为：图标亚像素
位置/尺寸差、墙面细差与次要域。symbol occlusion 战役累计
552,699→65,839（−88%）。

**下轮入口**：①+2 个多余图标实例（placement 候选选择/collision 网格
语义）；②flood-light 域残余 91,846；③ground-shadow-fog 地面/道路 3D
方向光；④dir 集中式迁移；⑤terrain 雾负 t。

### §885 终二四〇：placement 残差精查 + 三开放域可行性结论（2026-09-12）

**① +2/+7/+9 图标实例差异精查**：重叠法+最近邻分类，data-driven 当前
59 vs mgl 57：EXTRA 7（全部位于 y≈270-330 远端带）+ MISSING 9（中景
暗墙区）。分析：CPU 锚点剔除的 log 等价 epsilon 在引擎世界级 far 平面
下数学上趋于失效——dfdw = 2fn/((f−n)w²) ≈ 2e-7（w=1000, far=1e7）时
eps = 1/(300·dfdw·(1+w)·lnFar) ≈ 1 ≫ 任何实际 log 深度差，即修正后的
CPU 剔除恒不触发；mgl 能剔除是因为其 depthRangeFor3D 把 3D 层深度范围
归一化后 300 斜率才有区分度。**正确复刻需先复刻 depth-range 归一化
（记录 3D 层深度 min/max 并重映射）**，属独立专项（暂记 depthrange
入口）。

**② flood-light 域残余 91,846**：维持终二三七归因（红晕梯度渲染差异，
compute_flood_lighting 的 occlusion/ground-shadow factor 交互），与雾
无关；独立专项。

**③ ground-shadow-fog 141,539**：维持终二二五归因（地面 fill/road 的
3D 方向光+ground shadow factor 缺失，33,671 px exp 0-7 vs cur 154-248
暗墙反转）。修复路径 = ground 材质接 apply_lighting_ground
（u_ground_radiance，N=(0,0,1)）+ 影内地面 ground_shadow_factor——依赖
阴影战役（终二二二挂起）的深度图内容对齐，需真机 frame-capture。

**结论**：三个开放域均需独立专项（depth-range 归一化 / flood-light /
ground 方向光+阴影），当前交付态保持终二三九（symbol occlusion 战役
−88%，守卫集净 −2,117,670，PASS 17→17）。

### §885 终二四一：depth-range 归一化实验——负收益，回退（2026-09-12）

落地 u_depth_range_unpack 语义（CPU readback 记录有效 log 深度
min/max，图标 z 与深度 tap 双侧归一化后 1/300 斜率比较；GPU
uMBDepthRange uniform + CPU anchorOccluded 同步）：data-driven
65,839→69,180（+3,341）、after-3d +2,247、before-3d −334——**净负，
已回退**。说明 mgl 的 occlusion 判定差异不止斜率动态范围一项，归一化
空间本身改变了判定集合；该域的正确复刻需 mgl placeCollisionBox isClipped
的完整语义（含其 depthRangeFor3D 的计算来源与 symbol z 的 CLIP_ZERO_TO_ONE
分支），暂记档挂起。交付态保持终二三九（59 vs 57 图标实例，data-driven
65,839）。

### §885 终二四二：ground-shadow-fog 重新定性——场景级不一致主导（2026-09-12）

mgl 实拍链路修复两处后成功渲染该夹具（glyphs 缺失时 localize 崩溃 →
加守卫；model source 的 uri 未走 localize → 补 model sources 分支；
mgl-shot 补 TIMEOUT 时 dump 页面错误与 ?zoom=/&bearing= 相机覆盖参数）：

- **mgl 实拍与 expected.png 场景结构一致**（低层街区+大型平顶建筑+暗影
  墙+黄色路网；小车因模型加载错误缺席，不影响结构对照）。
- **我们同夹具渲染出完全不同的场景**（高塔群+近景 10 倍大小的小车）。
  瓦片请求核实：内容瓦片 15-5242-12664 已正确加载（无 404），排除瓦片
  数据源问题；同 style 相机（center/zoom16.2/bearing264/pitch70）下
  内容与相机语义均不同——**141,539 残差主体 = model-layer 场景级不一致
  （相机定位/模型尺度语义），而非地面光照或阴影**。

**历史重新定性**：终二二〇~二二三在该夹具上的阴影位置/overlay 战役
（135,328 all-lit 平台）均在不一致场景上作战；33,671 px "exp 暗 0-7 vs
cur 亮 154-248" 是场景错位的表象而非地面方向光缺失的直接证据。该域的
正确入口 = **model-layer 场景对齐专项**：①模型 scale [10,10,10] 语义
（mgl: gltf 原始尺寸×10；我们疑似过大）；②相机距离/俯仰在该
pitch70+model-source 组合下的语义；③对照 mgl 实拍逐帧校准。

下轮入口更新：①model-layer 场景对齐专项（本条①②③）；②placement
isClipped 完整语义（挂起）；③其余开放项不变。

### §885 终二四三：相机高度 secLat 假设证伪——场景错位是内容级（2026-09-12）

落地 camground=1 门控（pitch>0 时相机距离×cos(lat)，把 ground-shadow-fog
相机高度 273.1→216 m 对齐 mgl freeCamera altitude）：141,539→**218,268
（+77k 大幅恶化）**，已回退。结论：对齐相机高度反而加剧不匹配——
**场景错位不是相机高度问题，而是内容级差异**（模型放置位置/瓦片内容
语义/model 基座），此前 mgl freeCamera 的 secLat 吻合（273.1=216.8×
sec37.78°）系巧合级证据不被采纳。终二四二的 model-layer 场景对齐专项
入口维持，但排查方向改为：①模型实例的经纬度→世界坐标放置链；②
15-5242-12664 瓦片 overzoom 到 16.2 的内容插值；③小车 model-scale 的
实际渲染尺寸 dump 对照。专项挂起待续。

### §885 终二四四：model-layer 三项实证（2026-09-12）

**① 模型 scale 矩阵语义核对（一致）**：mgl calculateModelMatrix
（3d-style/data/model.ts:205）与 MBModelRenderer:1687 均为 T·R·S·F（scale
vec 乘入模型局部米制帧），源码级一致——scale 语义非错位根源。

**② 小车实际渲染尺寸量化**：expected.png 中车 ≈45×25 px（@1024），
我们 current 108×85 px ≈ **2.4-3.4× 线性过大**，而两者屏幕位置接近
（中心 (447,283) vs (457,301)）。矩阵语义一致 + 实际渲染 2.7× 过大 ⇒
嫌疑收敛到 calculateModelMatrix 的 meters→world 换算段
（mgl modelPixelConv/scaleXY = pixelsPerMeter(position.lat) 的
纬度相关米换算；我们的实现 §652 用 cos(lat) 拉伸——需逐项 dump 该
矩阵数值对照）。

**③ 瓦片内容与请求集核查**：15-5242-12664 为常规 streets 瓦片
（606 building/150 road/79 poi_label features，无模型 feature——小车经
source 级 model registry 放置）。瓦片请求集：我们 5239-5243×12663-12667
（宽集，含 404s），mgl 仅 5241/5242-12665 404（窄集，居中 5242-12664）；
双方均加载内容瓦片。请求集宽度差异与相机高度（终二四三证伪项）联动。

**结论**：scale 矩阵一致 + 渲染 2.7× 过大 ⇒ 矛盾聚焦于 meters→world
换算链（modelPixelConv 段）。下轮 = dump 双引擎该矩阵数值
（mgl: calculateModelMatrix 中间量可通过 patched mgl dist 加日志；
我们: MBModelRenderer m 构造后 dump），逐因子定位 2.7× 来源。

### §885 终二四五：model-layer 放置链 dump——相机距离排除，尺寸差锁定 bake 域（2026-09-12）

**相机-车距离实测排除**：新 [MBModelAdd] 探针（含相机绝对位置 dump）：
车 pos=(6411702.1,24586535.8,0) 绝对世界系，相机=(6412337.0,24586431.1,
273.1)，camDist=699.0 world（≈554 m 地面+高度，3D 577.7）vs mgl 理论
554.7——**相机-车距离基本一致（比值 1.04），2.7× 过大不是距离效应，
车的世界尺寸真的偏大**。

**glTF 原始 bbox**：low-poly-car.gltf = 3.96×1.97×1.30（长×宽×高，
Z-up——z=1.3 为车高）。naive 尺寸（native×model-scale 10）= 39.6 m：
- 我们实测 ≈54 px@512 → 世界 ≈40.6 m ≈ naive×1.03（**我们的实现 =
  naive 语义**）。
- mgl 实测 ≈22.5 px@512 → 世界 ≈19 m ≈ naive×**0.48**（测量含车尾被
  建筑部分遮挡的不确定性，因子 ∈ [0.47, 0.72]）。

**结论**：mgl 的 model bake（model_bucket.ts meter_to_tile，在 SOURCE
zoom 15 bake 后 overscale 渲染）使有效尺寸 ≈ naive 的 ~0.5×，我们 =
naive×1.03——**尺寸差域锁定为 mgl model_bucket bake 的 meters→tile
换算 vs 我们的 raw-metre 实例矩阵**。下轮 = dump mgl model_bucket 的
meter_to_tile 中间量（patched dist 加日志于 model_bucket.ts:543 的
feature.scale bake 处），或离线用 mgl 3d-style 源码数值求值 bake 矩阵。

### §885 终二四六：model-layer 破局——kG 纬度公式喂错经度，车 3.4× 过大修复（2026-09-12）

**① 终二四五 两项结论撤回**：⑴"mgl 实测 ≈22.5px"实为 expected.png 的测量
误标——mgl-shot 里该车**从未加载成功**：mgl `loadGLTF` 把模型 URI 作为
base 传给 `new URL(buffer.uri, base)`，glTF 内嵌 data: buffer 使 base
解析成为必经路径，而 harness 的 localize 产出**相对路径**
`/mapbox-gl-js/...` → "Invalid base URL" → 静默加载失败（终二四二的
"模型加载错误"真因）。修复：mgl-shot.html 模型 URI 绝对化
（location.origin 前缀）。⑵"尺寸域锁定 model_bucket bake"方向错误——
`type:"model"` source 的 ModelSource.loadTile 为空，车走
`drawModels → calculateModelMatrix`（model.ts:205, viewportScale=false）
CPU 矩阵路径，与 model_bucket instancing 无关。

**② mgl 侧数值验证（mgl-shot.html ?modelprobe=1）**：页内复刻
calculateModelMatrix + expandedFarZProjMatrix 投影 glTF bbox 八角点
（复制器验证：centerScreen 精确 (256,256)）。实测：mgl 相机高度
**215.84 真米**（zoom16.2/pitch70，即 终二四三 的 216 是 mgl
freeCamera 真值；我们引擎相机 z=273.1 是**赤道米 z 轴**下的同一物理
高度 215.84×sec(lat)——sec-lat"巧合"实为两引擎单位制差异，相机物理
等价）；预测车 bbox 38.3×41 @512，与 mgl 实拍（车 53×43@1024，尾部
被建筑遮挡）与 expected（52×42）**三方一致**——vendored mgl 修复
URL 后精确复现参照，"mgl≈naive×0.48"系幽灵。

**③ 我们侧探针（modelproj=1，引擎自身数学）**：`delta=(0.0,0.0)`——
放置位置精确等于 projection.projectPoint(style position)（终二四五的
"世界尺寸真偏大"中位置因素排除）；但 `worldMatrixScale=(42.93,
20.24, 42.93)`，X 列应为 12.65。

**④ 根因（loadModels §652 kG 公式错）**：`MBStyleDataSource.loadModels`
的 mercator ground-stretch 把**经度** `(lng+180)/360`（=0.16）喂进
纬度公式 `atan(sinh(π(2x−1)))` → "纬度"=−76.5° → cos=0.2327 →
**kG=4.297 而非 1.265** → source 级注册模型在 SF 经度带 3.4× 过大
（车 218×175 → 修复后 64×56 @1024；npx 1549 vs expected 703 的可见性
差为亮度域）。MBModelRenderer.instantiate 的同款公式用 placement.y
（正确）；MBBatchedModelDataSource 亦正确——**bug 仅在 loadModels 一处**
（纬度 0 夹具如 fill-extrusion--default 公式惰性，不受影响）。修复：
kG = 1/cos(lat) 直接用放置纬度。

**⑤ §766 z 项 1.6 过拟合撤除**：mgl 世界系各向同性（worldpx 三轴同
单位、scaleZ raw=1）；我们系各向异性（x/y 赤道米、z 真米），高度车道
需与 x/y 同款 kG——即 sc[2] = scale×kG×**1.0**。原 1.6 系在 kG bug
与场景错位下的过拟合。落地 `modelzsc=` A/B 旋钮默认 1.0（karma 透传 +
runner 白名单）。三方目视：车尺寸/姿态/位置对齐（剩余：我们车过亮=
透明度/雾混合域）。

**⑥ 剩余（本轮定性）**：ground-shadow-fog 分数 141,539（pre-fix）→
**140,426**（残差被场景域主导）：我们渲染出高塔群而 expected 是低层
街区——瓦片本身含 160m 塔（602 building，max 160 / 中位 12 / >100m
×10），expected 远场塔被白雾重度雾化而我们对比度更高 + 我们请求集
25 瓦 vs mgl 窄集（终二四四③）→ 下轮入口 = **远场内容雾强度
（worldToFogMatrix 域）与 pitch-70 瓦片请求集宽度**。

**下轮入口**：①家族回归定量归因（landmark-*/munich/london 带模型
1.5× 增大方向）；②远场内容雾；③车亮度/透明度混合。

### §885 终二四六（补）：model-layer 家族回归中期账（151/206）——净 −2,677,419（2026-09-12）

chunked 逐夹具对照 ml260907 基线（跨批次口径，方向性判读）：149 个
可归因夹具 base 22,102,849 → **19,425,430（净 −2,677,419）**；
**新增 8 PASS、0 丢失 PASS**：default 3,136→**0**、default-orientation
→3、model-translation→2、model-rotation→134、model-emissive-factor→**0**、
model-external-gltf-files→59、model-embedded-gltf-without-normals→86、
**model-scale 112,129→1**。最大赢项：model-normal-emission-occlusion
-maps −193,413、z-offset-v2-station −179,491、model-state/multiple
-features −113,474、model-normals −111,334、no-ambient/no-directional
−94,726/−88,739、feature-state −89,231、ortho-high-pitch −29,922、
environment-test −24,009（28,407→4,398，剩余为黑/白页合成域）、
fill-extrusion--default −21,602。

退化 >2k 共 14 例合计 ~−194k：powerplants-fog-globe-transition
−62,237（globe+transition+fog 交互待查）、buckingham-lod −39,404 与
buckingham −9,868（伦敦带模型 1.6× 增大到正确值，目视几何已对齐，
差异转阴影/光照域）、ortho-model-depth-terrain −20,016、wireframe 系
−22k、door-light-munich −35.9k；ground-shadow 双例 −11.3k 为跨批次
口径（同代际 pre-fix 141,539 → post-fix 140,426 实为 −1.1k 改善）。

无模型夹具 ortho-terrain-zero-pitch-no-shadows +91,538 为 HEAD 相对
09-07 基线的既有漂移（本改动零可达，不计入归因）。

**内存事故纪律**：3 路并行 karma 会话（node webpack 全仓编译 + Swift
Shader Chrome）在最重 trees-puck-* 巨网格夹具上同时运行击穿 24GB，
进程树被杀——**重模型夹具严禁并行 karma 会话**；单路 batch=4 串行
为安全节奏。剩余 55 夹具（trees-*/part-styling-*/style-model-api-*
等）按用户指示跳过，随全量 baseline 复跑补测。

**交付态**：kG 纬度修复 + modelzsc=1.0 默认 + modelproj/modelprobe
探针 + mgl-shot 模型 URI 绝对化，model-layer 家族中期净 −2.68M、
+8 PASS。开放项：①远场内容雾（worldToFogMatrix）；②pitch-70 请求
集宽度；③车亮度/透明度混合；④powerplants-fog-globe-transition 退化
归因。

### §885 终二四七：model-layer 家族账收口——179 可比净 −6.59M、PASS 0→9；globe 雾簇双旋钮惰性定位（2026-09-12）

**① 家族最终账（vs ml260907 基线，含本日 serial 补测）**：基线 187 可测
夹具 29,082,174 → **22,491,891（净 −6,590,283，−22.7%）**；**PASS 0 → 9**
（default 3,136→0、default-orientation、model-embedded-gltf-without-normals、
model-emissive-factor、model-external-gltf-files、model-rotation、
model-scale 112,129→0、model-translation、npot-mipmaps 75,995→0——全部
精确 0）。179 可比中 87 改善 / 44 恶化 / 48 逐位持平；>2k 改善 69 例
合计 −3,459,093，>2k 恶化 26 例合计 +685,414。

**② 测量收口与不可测集合（记档）**：
- 55 个中期"跳过"夹具重分类（正确语义 `platformTag.includes(tag)`，
  修正本轮此前用反向子串的误判——griffith 系 tag `web-macos-chrome`
  实为可跑）：**20 个上游 skip-test 元数据 web 平台跳过**（it.skip 永不
  出数，两引擎同样，永久排除；清单 tmp/family/pending-skip.txt）；35 个
  可跑全部补测。
- 35 可跑中 **29 出数**（batch=4 serial，batch=2 重试 6 例再救回 4：
  griffith 双例、trees-shadow-scaled、trees-use-theme、trees-zoom-based
  -scale）；**6 例环境不可测**（单测 180s mocha 超时，巨网格在 Swift
  Shader 下 >3min/例）：trees-puck ×3、trees-transition-update、
  landmark-z-offset-munich-museum-terrain-lod、z-offset-v2-port（不在
  基线）；另 buildings-trees ×4 环境级 DISCONNECTED（终一九三已记档）。
  修复入口：harness 侧提高 `this.timeout(180000)` 上限或真机 GPU。
- 补测亮点（此前未测）：vector-layer-external-models 双例 148,851→
  **5,300**（−143k×2）、trees-shadows-terrain-high-altitude 460,665→
  **359,223**（−101k）、munich-museum 四例 −72k~−85k×4、landmark-z-offset
  -terrain-fix-griffith 双例 −17.5k×2。
- 口径：结果树混合 batch=6（晨 shard）与 batch=4/2（午后 serial），
  同批次逐位确定、跨批次微差（终二三四纪律）。

**③ 退化簇归因（像素级，退化合计 +685k 的主体定域）**：
- **globe+雾簇**（powerplants-fog-globe +88,297 / -transition +62,237 /
  -globe-zoom-function +128,125，合计 +278k）：三例均为 globe 投影 +
  fog 彩色（red/blue）+ zoom 3-5 + pitch 60-70。transition 夹具剖面：
  红雾过度延伸覆盖下半幅洋面（exp 洋面 [131,205,233] vs cur
  [137,183,211]；饱和红 px exp 905 vs cur 7,383）。**双旋钮 A/B 均逐位
  不变**：fogeuclid=0 → 131,639/127,402 = committed；bgquadoff=1 → 同值
  ——内容欧氏雾与背景雾 quad 在该簇双双惰性。红雾来源 = **globe 投影下
  栅格瓦片的标准内容雾路径（fogGlobe* uniform 链域）**，非 quad/非
  Euclid。models-on-globe* 五例逐位=基线，globe 模型放置稳定互证。
- **landmark-wireframe 双例 +22k**：15.3k px expected 红色元素
  （[219,28,27]）我们缺失（灰棕 [167,142,128]）+ 全幅偏暗偏棕——模型
  材质/光照域。
- **buckingham 双例 +49k**：kG 修复后模型尺寸正确、几何目视对齐；残差
  = expected 带黄暗内容 [155,154,134] vs 我们平坦亮灰 [185,185,180]
  （29k px exp 暗 [101,83,83] 我们亮灰，内容完全丢失）——模型光照/
  环境色调域。
- **door-light-munich-museum +36k**：方向相反——expected 亮灰
  [145,146,146] vs cur 暗灰 [120,120,119]（226k px）——emissive 门/
  光照域。
- **landmark-shadows-cutoff-range 双例 +11k**：模型尺寸修正确后阴影
  覆盖扩大（正确性改进的阴影域代价）。
- **trees-light-aligned 四例 +94k**（+15k~+31k/例）与 trees-shadow
  -scaled +35k：雾/光照合成域。
- camera-orthographic-terrain-zero-pitch-no-shadows +91.5k：HEAD 相对
  基线既有漂移（终二四六(补)已核，零可达）。

**④ 下轮入口**：①globe 内容雾域标定（fogGlobe* 链，服务 +278k 簇）；
②模型光照/材质色调域（buckingham/wireframe/door-light，+107k）；
③180s 超时夹具的 harness 侧修复后入账；④其余开放域不变（远场内容
雾 worldToFogMatrix、pitch-70 请求集宽度、车亮度、terrain 雾负 t、
星场真机、depth-range 完整语义）。

### §885 终二四八：globe 雾簇破局归雾 chunk——终二二六重写丢立方衰减，恢复后三例 −303,701 双例精确回基线（2026-09-12）

**① 定位链（全零成本探针 + 旋钮 A/B，无一次性代码）**：①fogeuclid=0
与 bgquadoff=1 对 powerplants-fog-globe 双双**逐位不变**（131,639）——
内容欧氏雾与背景 quad 双双惰性（globe 分支覆写 fogT、quad 不画 globe），
推翻 quad 大气假设；②fogdbg=1（t 场涂色）读出盘面 fogT 仅 0.20-0.22
（理论 fogFactor 应 ~0.4）而实际渲染 0.7-0.9；③fogdbg=2（未雾化基色）
证实瓦片基色干净（水 [117,207,240]/陆 [239,233,225]）且红天空不经瓦片
chunk（基色帧红天空仍在=主场景 dome 画天空）；④domedbg=2 分支所有权
涂色显示盘面像素归瓦片（非 dome）——红雾来自瓦片雾 chunk 本身。

**② 根因（git 考古实锤）**：终二二六（c731569e）的"负 opacity 泄漏
修复"重写 fogFactor 时**意外丢弃立方衰减**：
`fogAlpha·clamp(1−exp(−6t),0,1)·clamp(1.00747,0,1)` 替换了原式
`fogAlpha·min(1, 1.00747·fogFalloff)`（fogFalloff=(1−exp(−6t))³ 自
1b1c5d34 起即 mgl 精确式且**本就负安全**——t<0 时 min(1,exp)=1→
falloff=0，重写的前提"fogFalloff 变负外推"不成立）；且
`clamp(1.00747,0,1)` 恒等于 1。净效果：小 t 处雾强度 ~2×（t=0.2 →
0.72 vs mgl 0.37）——远场/盘面内容过雾（globe 红雾簇）且远场内容雾
开放域（ground-shadow-fog 远塔）同根。模型雾尾（MBModelRenderer:645/
MBMaterialPatchManager:1503）两处均保持正确立方式，唯独主 chunk 受损。

**③ 修复**：`fogFactor = fogAlpha·clamp(1.00747·fogFalloff, 0, 1)`
（mgl 曲线 + 保留终二二六的负 t 外层钳制意图）。

**④ 度量（13 夹具 A/B vs family-kGfix 交付态）**：
- **globe 三例**：powerplants-fog-globe 131,639→**43,342**（−88,297，
  精确回 ml260907 基线）、-transition 127,402→**65,165**（−62,237，
  精确回基线）、-globe-zoom-function 244,191→**91,024**（−153,167，
  较基线 116,066 再优 25k）。合计 **−303,701**。
- **mercator 守卫零回归**：fog/color 三联 0/0/0 PASS、2d/basic 29,537
  与 2d/inverted 9,417 逐位一致、culling/far 834 逐位、space-color
  -opacity 44,372 逐位、ground-shadow-fog 140,426→140,430（+4 噪声）、
  terrain/basic −166/terrain/inverted +11（微动）。立方仅在小 t（远场
  内容）起作用——mercator 标定域的 t 大，曲线差异二阶。
- 家族总账更新：22,491,891 → **22,188,190**（vs 基线净 −6,893,984，
  −23.7%）。

**⑤ 剩余（定性更新）**：globe 三例残差（43,342/65,165/91,024）= 场景
构图差异（同相机下我们视场覆盖整个北美而 expected 贴近海面只见
Florida/加勒比——globe 相机高度/内容放置域，基线同值即存在，与
ground-shadow-fog 场景错位同族）；终二四七④的①（globe 雾标定）已由
本条关闭，②模型光照域与其余开放项不变。

### §885 终二四九：globe 场景构图差异定量——双引擎相机对拍，mgl 模型源码级识别，修法定案（2026-09-12）

**① 对拍工具链**：mgl-shot 扩展（tmp/，gitignored）：`root=mb` 服务我方
render-tests 树 + local:// 改写（tiles/url/**data**——geojson source 走
data 键此前 404）+ 模型 URI 绝对化 + 夹具 operations 重放
（setProjection/setZoom/wait）+ `getFreeCameraOptions()` 相机 dump；
引擎侧新增 `camdump=1` 探针（MBStyleCompatRenderTest 捕获点 dump
camera pos/fov/zoomLevel/tilt/focalLength，默认关）。

**② 定量（powerplants-fog-globe，z=4.01/pitch70/lat29.09/fov36.87/
bearing337.85，双引擎同参数）**：
- mgl：相机海拔 **531,461 m**（lng−74.98/lat17.40），到目标 3D 距离
  **1,552,352 m**，可见冠角 22.62°。**512css 与 256css dump 逐位相同**
  ——mgl globe 相机模型视口无关（推翻视口缩放假设）。
- 我方：|cam|=8,095,488（引擎赤道米），海拔 1,717,351，到目标
  **3,260,517**，冠角 38.01°（整北美可见）。
- **偏差：到目标 2.100×（z=4.01）/ 2.200×（z=5.22 点）**，海拔 3.23×。
  z=5.2 第二点：mgl 海拔 222,848/到目标 649,722。

**③ mgl 模型源码级识别（transform.ts/globe.ts）**：
- `cameraToCenterDistance = (0.5/tan(fov/2))·height·_pixelsPerMercatorPixel`，
  其中 globe 的 `pixelSpaceConversion = 1/interp(sec45°, secLat,
  smoothstep(5,6,styleZoom))`（**插值区间 [5,6]，z<5 恒 sec45⁻¹=0.7071**；
  引擎现用 [2,4]+viewportAdjust 且 z=4.01 已到 cos(lat)=0.8739——错）；
- globe 的 `pixelsPerMeter = mercatorZfromAltitude(1, 0)·worldSize`
  （**赤道参考，不随 lat**）；
- `_mercatorZfromZoom = cameraToCenterDistance/worldSize`；相机在
  **mercator 空间**放置（center − forward·mercZ）后经 globe ECEF 归一
  （非线性，故 mercZ×R≠实测海拔）。
- 我方公式 `focal·CIRC/(2^flyZoom·256)·conv` 的误差分解：+1 zoom 惯例
  在 globe 双重计入（世界已是绝对赤道米尺度，无 2× 像素补偿需求；
  mercator 下 +1 已被 mgl 实拍校验正确**不得动**）×1.996，conv 区间
  错误 ×1.236，合计 2.10/2.20（ECEF 归一的残余随 zoom 微变）。

**④ zoomab 旋钮对 setZoom 路径惰性**：夹具 operations 的 setZoom 走
harness 侧 `zoomOnTargetPosition(mapView,0,0,zoom+1)`
（MBStyleCompatRenderTest:1357，+1 硬编码），不经 applyCameraSettings
的 zoomAB 项——camera dump 前后逐位一致实证。修复需同时处理两处。

**⑤ 修法定案（独立专项，下轮主攻）**：
- **正解**：在 lookAtImpl 的 globe 分支移植 mgl 精确模型——
  `mercZ = focal_px·conv_mgl/(512·2^z)`（conv_mgl 用 [5,6] 区间），相机
  在 mercator 空间按 pitch/bearing 放置后经投影的 mercator→ECEF 映射
  入引擎世界系；harness setZoom 与 applyCameraSettings 的 +1 在
  `__mglGlobeCam && projection.type===1` 下同时免除。
- **一阶近似（若 ECEF 移植受阻）**：仅免 +1（保留现 conv），冠角
  38°→28.2°（残差 1.05×/点），回收约 80% 构图误差。
- 验收集：powerplants 三例 + models-on-globe 五例（现逐位=基线，相机
  改动后必然位移）+ globe 家族 + map-projections/globe；逐夹具对照
  expected 定改善/回退。

**⑥ 本轮交付**：camdump 探针（默认关）+ mgl-shot 工具链扩展 + 本记
档。globe 相机模型移植后 powerplants 三例的 43,342/65,165/91,024 残差
（场景构图域）预期大幅收敛；ground-shadow-fog 场景错位（终二四二）
同域受益。

### §885 终二五〇：globe 相机"径向高度修正"实证证伪回退——引擎 globe 管线自洽于斜边轨道，标量修正不成立（2026-09-12）

**① 修正内容**：`getCameraPositionFromTargetCoordinates` 球面分支的
`result.setLength(sqrt((R+alt)²+ground²))` 改为 `setLength(R+alt)`
（mgl 轨道语义：径向高度 = d·cos(tilt)，切向滑移只承载经纬位移）。
数值预期：cap 38°→31.66°（mgl 同视口 ~30.9°）。

**② A/B 裁决（8 夹具，orbitfix vs family-kGfix 交付态）——净 +1.55M，
6/7 恶化，已回退**：
- models-on-globe 15,842→**466,380**、near-pole 227,429→517,740、
  nested 7,342→339,456、transition 71,357→237,680（家族全崩）；
- powerplants-fog-globe 43,342→113,930、-transition 65,165→98,805
  （同恶化）；唯 powerplants-globe-zoom-function 91,024→**61,953**
  （改善）。

**③ 机制结论（证伪终二四九⑤的"一阶近似"）**：models-on-globe 家族
（z2.5-5.4/p40-60）在旧斜边轨道下近乎像素级对齐 expected——引擎的
globe 管线（瓦片放置+相机+雾+ECEF 归一）**自洽于斜边轨道**，标量级
修正破坏自洽性。视口伪差澄清：mgl-shot 地图容器曾硬编码 256css，
"512 视口相机相同"的旧结论无效；容器参数化（?size=&dpr=）后实测
mgl@512×300：海拔 629,547/camLat 15.30/conv=cos(lat)（globe.range
[3,5]+adj 实证与引擎 conv 模型**一致**——conv 非分歧源）。

**④ 修订后的分歧画像（512css，z4.01/p70）**：我方 (camLat 8.26°,
alt 1,717,351, d_target 3,260,517) vs mgl (camLat ~13.5°, alt
~1,074,000, d_target ~3,143,000)——d_target 仅差 5%，但高度差 1.59×
且轨道角位置不同；有效倾角（相机处径向与视线夹角）47.8° vs ~70°。
定位：分歧在**倾角的参考系/轨道组合方式**，不在距离标定。

**⑤ 修订后的修法（仍为独立专项）**：完整移植 mgl 的 mercator 空间
相机链（_computeCameraPosition → FreeCamera mercatorPosition →
globe ECEF 归一），即以 mgl 的 mercator (x,y,z) 相机位姿经引擎
projection 映射放置，替代 lookAtImpl 的切向轨道组合；经验上需
同时复刻 getProjectionInterpolationT（globe range [3,5]、size=
min(1024,max(w,h))，已核与引擎 conv 一致可复用）。验收集同终二四
九⑤。mgl-shot 工具链本轮补齐：?size=&dpr= 视口参数、transform
internals dump（ccd/worldSize/ppmMercPixel/camPos）。

**⑥ 教训入档**：跨引擎相机诊断必须锁定同视口尺寸（mgl-shot 容器
曾固定 256css 致两轮伪差）；负结果 A/B（8 夹具 40 分钟）及时止损
优于带病发布。

### §885 终二五一：mgl mercator 空间相机链移植两轮证伪回退——引擎世界帧约定未映射前公式平移无效（2026-09-12）

**① 实现**：`getCameraPositionFromTargetCoordinates` 球面分支整体替换
为 mgl 链——mercZ = ccd/worldSize（ccd = focal·conv，conv 复用引擎现
有 mglGlobePixelSpaceConversion，已证与 mgl 同式）；cam_merc =
center_merc − forward·mercZ（符号经 mgl camPos dump 数值验证）；
camLng/camLat/camAlt = mercator 逆变换（alt = z·CIRC·cos(camLat)，
即 MercatorCoordinate.toAltitude）；camera.position =
projection.projectPoint(GeoCoordinates(camLat,camLng,camAlt))。

**② 两轮 A/B（7 夹具 ×2）——全部恶化，已回退**：
- mercZ = distance/CIRC：fog-globe 43,342→98,977、transition
  65,165→65,617、zoom-function 91,024→201,331、models-on-globe
  15,842→466,478、near-pole 227,429→919,256、nested 7,342→882,482、
  mog-transition 71,357→236,264；
- mercZ = 2×distance/CIRC（修正 flyZoom 内嵌 2×）：全部再恶化
  （213,836/163,000/206,927/870,993/918,606/994,266/226,740）。

**③ camdump 定位实现层断层**：2× 版本的相机 pos z 为**负**
（南半球）、tilt 21.78°、径向 R+3.43M（≈π×camAlt）——我按标准
mercator/ECEF 约定推导的 (camLat,camLng,camAlt) 经引擎
`projection.projectPoint` 落点后出现 π 级径向偏差与半球翻转：
**引擎世界帧的 projectPoint 海拔语义与轴约定和标准 mercator 帧
不同**，同一公式在两帧不可直译（同一数学在 python 对 mgl 自身
dump 逐位吻合，排除了公式推导错误）。

**④ 结论（globe 相机战役收束）**：三种放置（径向高度、mercator×1、
mercator×2）实证均劣于引擎现有斜边轨道；引擎放置在 models-on-globe
家族近乎像素级（expected 即 mgl 渲染）——现有管线在其世界帧内自洽
且与参照对齐。powerplants 三例的构图残差（43,342/65,165/91,024）
归因修订为：**mgl 与引擎对同一 style 相机的世界帧表达不同**（非
单点标定可修），修复前置条件 = 建立引擎帧映射文档
（projectPoint/unprojectPoint 的海拔语义、轴约定、unitScale 交互，
§833 的 0.6% unitScale 与海拔换算的耦合），再重推放置公式；或以
真机 frame-capture 直接对拍双引擎最终矩阵。挂起。

**⑤ 工具资产留存**：camdump=1 探针；mgl-shot ?size=&dpr= 容器参数
化 + transform internals dump（ccd/worldSize/ppmMercPixel/camPos）+
src.data 改写 + operations 重放——后续任何相机工作的对拍基座。

### §885 终二五二：landmark-wireframe 红色线框落地——showLayers3DWireframe 元数据实现，双例 −22,929（2026-09-12）

**① 根因**：landmark-wireframe 双例的 15.3k px 红色元素缺失 =
expected 由 mgl 的调试线框模式渲染（style metadata.test.
`showLayers3DWireframe: true` → painter.options.wireframe.layers3D →
DEBUG_WIREFRAME prelude `vec4(0.7,0,0,0.7)` + gl_FragDepth−0.0001），
非 style 内容/光照域。引擎侧 setLayers3DWireframe 旧实现三缺陷：
一次性场景遍历早于模型流式加载（恒 no-op）、technique 清单不含
model、material.wireframe 用模型自身材质色（米色线≠参照红线）。

**② 实现（MBStyleDataSource.setLayers3DWireframe 重写）**：存储标志 +
WillRender 每帧 walker——对 batched-model 瓦片网格（组根
`__mbBatchedModelRoot` 标记）挂 LineSegments(WireframeGeometry)
叠加：LineBasicMaterial color(0.7,0,0)×opacity 0.7、depthWrite:false、
renderOrder 9999、onBeforeCompile 注入 gl_FragDepth−0.0001（mgl
HANDLE_WIREFRAME_DEBUG 语义）。

**③ 范围收敛两轮**：①technique 扩展（extruded-polygon/fill/solid-line，
对齐旧清单）→ landmark-wireframe +4,812、instanced-rendering +42,503
——引擎普通 fill 复用 'fill'/'solid-line' technique，technique 名匹配
过度接线（mgl 的 layers3D 是程序名清单 fillExtrusion/building/
elevatedStructures/model，plain fill 在 layers2D 清单）；②收窄为
batched-model 根限定 + isInstancedMesh 排除（instanced 绘制的实例
变换无法用单一 WireframeGeometry 子物体表达，expected 15.3 万红 px
vs 叠加版 17.6 万超量）。

**④ 度量**：landmark-wireframe 120,535→**107,297**（−13,238）、
-lod 88,144→**78,453**（−9,691）；wireframe/instanced-rendering
409,635 逐位恢复（作用域限定生效）。双例合计 **−22,929**。残差
~10.7 万 px = 模型光照/色调域（该夹具 lights ambient 0.2 +
directional 1，与 buckingham 平坦亮灰同族战役）。

**⑤ 仍开放**：buckingham 双例平坦亮灰（exp 带黄暗 [155] vs cur
[185]，+49k）——mgl-shot 对拍待做；instanced 线框（需实例感知
线段，挂起）；globe 相机帧映射前置（终二五一）。

### §885 终二五三：buckingham 平坦亮灰定性——mbx landmark 模型纹理/材质缺失域（2026-09-12）

**① expected 精读**（landmark-conflation-buckingham，z17.7/p22.5/
伦敦白金汉宫 mbx landmark 模型）：模型带完整纹理材质——深灰屋顶、
黄色天窗/玻璃带、白色立面+黄窗、红色 conflation 标线与投影阴影；
我方渲染整体平坦亮灰 [185,185,180]（无屋顶暗色、无黄色内容、
无立面纹理）。

**② 定性**：非光照强度差（前几轮的 +49k 并非暗/亮标定问题），而是
**mbx landmark GLB 的纹理/材质在我们 batched-model 管线中未应用**
（基色平面渲染）；door-light-munich 的 +36k（expected 亮灰 vs cur 暗
25 灰阶）同族嫌疑。与 终二四四③ 的请求集宽度、终二四七 的 wireframe
红色元素并列——batched-model landmark 域三大缺口：纹理材质、线框
（本轮已落地）、请求集。

**③ mgl-shot 工具债**：landmark 夹具页面白屏（"};" 伪影）——
batched-model 瓦片相对 URL 过不了 new Request（已修：src.tiles
绝对化），修后仍有独立渲染期异常吞画布；errors 全量打印已加入
cjs。下轮修复 mgl-shot 的 landmark 渲染后可做双引擎材质对拍。

**④ 下轮入口**：①mbx GLB 纹理/材质链排查（decodeGlbTile 的
images/materials 是否透传 three——TextureLoader/flipY/colorSpace/
aoMap（§ 终二三五 mbx occlusion maps 已知））；②buckingham/door
-light-munich 双例 A/B；③globe 相机帧映射前置（终二五一挂起）；
④180s 超时夹具 harness 修复。

### §885 终二五四：buckingham 修正定性——分部件颜色已正确渲染，残差=模型方向光缺失（2026-09-12）

**① partHist 探针（mbbatchdbg=1，34 个 mesh）**：几何层分部件颜色
完全正确——p1 白墙 [255,255,255]、p4 黄窗 [255,255,0]、p3 屋顶
[70-150 灰系+纹理变体]、p2 青门 [127,255,255]、p6 conflation 上色
部件（[0,24,54]/[170,170,170] 等）。终二五三的"纹理缺失"定性修正：
颜色/部件拆分全部生效。

**② 渲染图精读**：我方构图与 expected 高度一致（白墙✓近黑屋顶✓
橄榄黄天窗✓青门✓红标线✓纪念池✓）；分歧纯为**色调**——expected
屋顶中灰 [155-185]（方向光 elev 82.4° 强上照射亮，intensity 0.86）、
天窗亮黄；我方屋顶近黑 [20-40]、天窗橄榄暗黄。 roof mix=0 → 色来自
原始 4444 色（[70-150] 暗），expected 更亮 = mgl 方向光照亮了它们。

**③ 根因锁定**：模型材质的**方向光项缺失/方向错误**——即 终二三六
③ 搁置的 lighting3DState.dir 集中式迁移审计的模型消费方
（MBMeshFeatures:596 模型墙 NdotL、MBModelRenderer、batched 灯光
注入 applyMglModelLighting）：挤出体已修（uMB3DDir 水平翻转），模型
路径的方向/仰角组合未同步（roof 上表面 NdotL≈0 → 近黑）。

**④ 修法（下轮专项）**：模型光照注入的方向量与挤出体 uMB3DDir 修复
对齐（同一 toSun 语义），A/B 集 Buckingham 双例 + door-light-munich
+ landmark-z-offset-munich-museum 四例（均带 lights 的 landmark 模型
夹具）+ 大批守卫（模型夹具光照全域敏感，须同批次对照）。

### §885 终二五五：模型方向光 toSun 翻转 A/B 净负回退——效果随光源方位角变号，需 per-azimuth 地表真值扫掠（2026-09-12）

**① 实现**：modelLightDir 的 cast-shadows 分支（终二十二引入，返回
ls.dir）改为水平分量取反的 toSun 形式（与终二三六挤出体 uMB3DDir
修复同语义）。

**② A/B（9 夹具次，vs family-kGfix 同批不可比处已标注）**：
- 改善：buckingham 190,958→180,999（−9,959）、door-light-munich
  -museum 189,083→**122,466**（−66,617）、munich-museum 173,248→
  **143,147**（−30,101）；
- 恶化：door-light-munich-museum-**lod** 123,692→203,999（+80,307）、
  shadows-normal-offset 115,175→**172,122**（+56,947）、-lod
  114,306→**171,549**（+57,243）；
- 守卫：quantization-shadows **2,332 逐位**（翻转不影响）、-lod
  1,709 ✓。
净 +48,913 为负 → **回退**，回退后 buckingham 190,958 /
shadows-normal-offset 115,175 逐位恢复。

**③ 机制发现**：翻转效果随光源方位角变号——改善组 sun
[311.92°, 82.38°polar]（伦敦/慕尼黑低仰角 7.6°），恶化组
[190°, 50°]（慕尼黑仰角 40°）：ls.dir 约定（§683/§682/§686 为影子
族校准）的水平分量相对 toSun 的偏差**非常数偏移**，随方位角/仰角
组合变号；全局翻转必然零和。另一发现：buckingham-lod 为高方差
夹具（LOD 流式时序，同树两次读数 206,599/102,912），不可作 A/B
信号（记档排除）。

**④ 修法（模型光照专项，下轮主攻）**：以 mgl-shot ?laz 光向扫掠
（终二三五已建）对 landmark 模型做**逐方位角地表真值**：对每组
（光源方位角, 仰角）实测 mgl 的墙面亮暗分布，反推 ls.dir 约定误差
的解析形式（预期为方位角相关的旋转/镜像组合），再实现引擎侧
模型程序名的正确 toSun 变换。禁止全局常量翻转（本轮证伪）。

### §885 终二五六：模型方向光第三候选 mirror(az+180) 落地——batched 管线非阴影模型 −1.85M px，§691 镜像选错支（2026-09-12）

**① 背景与工具重建**：终二五五指定的 mgl-shot ?laz 扫掠工具在 tmp/（gitignored）中已丢失（现存
tmp/mgl-shot.html/cjs 为终一百六十八旧版，无 ?laz/root=mb）；改走更直接的**引擎侧**路线——mgl
真值公式已由终二三六源码核对+实测零偏差锁定（sphericalDirectionToCartesian az+90 向光），未知量只在
我方法线帧。新工具：①mlsweep=1 探针（MBStyleCompatRenderTest 捕获点前逐方位角 applyLights+readPixels
8×8 亮度格，karma timeout 升至 900s）——实测 door-light 8×8 格对 az 响应幅值仅 ±8 灰阶，信噪比不足弃用；
②mlform=lsdir/tosun 运行时旋钮（modelLightDir 强制约定，免代码翻转做同批 A/B）。

**② 关键裁决翻转——终二五五的"净负"由 -lod 噪声污染**：同批重跑（mbstyle 平台 chrome-149-linux）发现
终二五五回归主体是 -lod 孪生变体（door-light-munich-museum-lod +80,307 / shadows-normal-offset-lod
+57,243），与 buckingham-lod 高方差族（同树两次 206,599/102,912）同族；稳定集上翻转实为净改善。

**③ 根因定位——解码路径双镜像约定**：MBBatchedModelDataSource 两条解码路径 y 镜像方式不同——
meshopt（mbx-lod/mbx-meshopt 瓦片）组级 `scale(w,−w,·)` 负 determinant；Draco（mbx 瓦片）镜像烘进顶点
+绕序反转。§691 的 A/B 只在 raw(az) 与 ls.dir(az)=mirror(−az) 之间二选一，**漏掉第三候选
mirror(az+180)=（−ls.dir.x, −ls.dir.y, ls.dir.z）**——batched 管线几何被 y 镜像后，mgl 保真方向恰是它。

**④ 同批 A/B（mlform=tosun，14 夹具单批）**：high-zoom-model-quantization 1,016,460→33,237（**−97%**）、
buckingham −9,665、door-light-munich-museum −66,634（gated 时 0）、z-offset-munich-museum −26,555、
wireframe −23,768、flood-light-buckingham −11,830；回退仅 meshopt 阴影贴图族（quantization-shadows
+7,209、castro +4,909、-lod 噪声族 +11,682/+23,686）。⚠ 教训：先落地的 rot180 变体（raw 双分量取反，
非镜像）在同夹具 quantization-shadows +85,622——**镜像与旋转是不同变换，A/B 必须逐变体验证**。

**⑤ 落地**：modelLightDir(dataSource, batched) 增参——batched 管线（applyMglModelLighting 由
MBBatchedModelDataSource/MBBatchedModelRenderer/MBMeshFeatures 调用点置 true，参数入 __mbLightParams
随 Material.clone/re-patch 保真）非 cast-shadows 分支返回 mirror(az+180)；经典 GLB 模型层（GLTFLoader
无镜像）与 cast-shadows ls.dir 门（shadowLightState）保持逐位不动。验证：guards 批（model-shadow
187,103 / light-overrides 3,799 / feature-state 58,612 / multiple-models-mixed-opacity 84,140）全部
**+0 逐位**；净度量 ≈ **−1.85M px**（high-zoom 双例 −1.83M 为主）。

**⑥ 仍开放**：①meshopt 内部分裂（high-zoom 要镜像 −98% vs quantization-shadows/castro 要 raw
+7k/+5k，同瓦片集同灯光同 bearing=0/54.5）——疑 meshopt 量化法线逐 mesh 离散，需模型世界系法线
dump 探针（attrdbg 模型版）定逐 mesh 真值；②door-light/buckingham 同为
cast-shadows 但前者 shadowLightState 门生效后者不生效（shadow-intensity 0.564 vs 缺省）——门控
判据待统一；③cast-shadows 主夹具的 ls.dir 门若解除，Draco 组预期再收 −66k（door-light）级；
④mlsweep 亮度格探针灵敏度不足，模型法线域需 partHist/法线可视化级探针。

### §885 终二五七：逐地标方位角 argmin 标定——偏好横跨 raw/±ls.dir 四基角，全局着色方向约定不存在（2026-09-12）

**① 工具落地**：①mlnorm=1 探针（捕获点遍历带 __mbNodeId 的 batched mesh，matrixWorld normalMatrix
变世界系法线 dump + matrixWorld 行列式 + __mbLights 覆盖）；②mldiraz=<delta> 着色方位角旋转旋钮
（modelLightDir 的 az 统一入口；首版旋钮因 batched 分支从 ls.dir 取反而失效——重写为从 az 直接计算
mirror(az+180)，Δ0 与已落地版逐位一致，azsweep2 Δ0 三夹具读数与 fix2a 完全相同实证）。

**② argmin 标定法**：对每夹具扫 Δ∈{0,60,120,180,240,300}，与 expected.png 的 diff 在真值 Δ 处最小。
刻度换算（az0=210 默认时）：Δ300 ≡ raw、Δ180 ≡ +ls.dir、Δ0 ≡ −ls.dir。全链路验证：quantization
-shadows Δ300 = 2,330 = raw 基线逐位复现 ✓；high-zoom-lod Δ300 = 1,016,460 = raw 基线逐位 ✓。

**③ 结果——偏好按地标分裂，四个基角全部出现**：quantization-shadows（Ames/山景城，z19）argmin
Δ300（raw，2,330，深谷）↔ 主/lod 一致；high-zoom（布鲁塞尔，z21.9）argmin Δ180（+ls.dir，12,932）
↔ 主/lod 一致；castro 主 Δ120（−raw，209,671 但地板高）、castro-lighting 主 Δ0（−ls.dir）/lod
Δ240——同瓦片集内四个方向都有地标选中。buckingham 族 Δ0/Δ120/Δ180 打平（互有胜负：buckingham
169-172k、wireframe 83.5/107/103k、z-offset 145.6/173/167k），全局换 Δ180 净 −390k 但由 castro 族
独驱、q-s/wireframe/z-offset 恶化——拒绝追随（过拟合）。

**④ 机制排除**：①节点矩阵无镜像（det=+2.0 全体）；②两条解码路径法线均正确镜像（Draco
buildPrimitiveMesh 对 normals 逐顶点 y 取反 + meshopt 组级负 scale 经 normalMatrix）——法线帧按
地标自洽（castro 45° 对角墙族 = Market St 斜交街区真实朝向，非解码旋转伪影）；③__mbLights 逐节点
光照覆盖全 null。**结论：着色方向约定层面已无全局红利；残差分裂源自瓦片数据/材质域（量化法线
精度、顶点色/纹理烘焙光照）**，需 mgl 侧同地标亮度对拍（mgl-shot ?laz 重建 + partHist 级探针）定逐
地标真值，禁止再以全局方向变换追分。

**⑤ 终二五六落地版维持**（Δ0=mirror(az+180)），本轮零代码行为变更（batched 分支重写为 az 直算形
式，逐位等价），新增三旋钮（mlnorm/mldiraz/mlform）+ 判定记档。

### §885 终二五八：双引擎同点亮度对拍——漫反射链实证 mgl 精确，残差主源=我方 PBR 镜面项（2026-09-13）

**① mgl-shot 重建（tmp/，gitignored）**：mgl-shot2.html/cjs——?laz/?lpol 光向覆盖（cast-shadows
自动关，lsh=1 强制开）+ ?probe=x,y;... 页内 5×5 采样 + zadj zoom 语义修正（IBCT 参照平台 zoom=
style.zoom−1，否则构图 2× 偏大）+ 滚动条隐藏。链路修复三件：meshopt wasm（api.mapbox.com 下载
meshopt_base/simd_v0.20.wasm 并复制为 esm-dev 要的 v1.2 名，服务端 MIME application/wasm）、模型 URI
绝对化、CSS 警告无害。参照可信度：quantization-shadows 与 expected.png 采样 diff 0.43%（1024 采样
步 2）。

**② 双引擎同墙对拍（quantization-shadows，7 探针点 × 12 方位角）**：我方侧用 azsweep2-Δ 的
current.png 同点采样（Δ→mgl 等效方位角 a=150−Δ）。**屋顶（法线朝上，方位角必须不变）：mgl 恒
(237,226,219)；我方随方位角 229↔179（PBR on）——方位泄漏实锤**。判别实验 modellightport=0：
屋顶 Δ0/Δ120 完全相同（240,215,201）→ 泄漏全在我方 **PBR 镜面项**，非法线、非烘焙。

**③ 漫反射链实证 mgl 精确**：PBR-off 下墙体响应与 mgl 逐点吻合（W1: Δ0↔a210 204/204、Δ120↔a30
178/177；W5: 203/200、179/180，偏差 ≤3 灰阶）——**mirror(az+180) 漫反射约定被同点对拍实证为
mgl 保真**（此前仅整幅 diff 间接推断）。

**④ PBR-off 大批 A/B（净 −856,572）**：castro 506,102→69,984（−86%）/lod −433,564、high-zoom
33,237→**5,253**、buckingham-lod −40,854、door-light −14,264（门控夹具也受益——门控只锁方向不锁
着色模型）；但 shadows-normal-offset **+71,583 双例**、flood-light +16,175。分裂解释：低粗糙度材质
mgl 镜面项可见（我方 PBR 尚近），roughness=1 材质 mgl 镜面≈0 而我方不归零（方位泄漏/能量残留）。
**不全局翻缺省**（q-s 族会 +143k）。

**⑤ 机制定案（终二五六⑥①关闭）**：量化法线精度证伪（PBR-off 漫反射对拍逐点吻合=法线数据良
好）；烘焙光照证伪（屋顶方位不变性恢复）；**主源=我方 PBR 镜面项在 roughness→1 时不归零**。
下一轮主攻：镜面项逐项审计（roughness 传递链、GGX α=roughness²、Fresnel/energy 补偿、specular
occlusion），以 mgl model.fragment.glsl 逐式核对；验收判据=roughness 1 材质方位扫描平坦 +
shadows-normal-offset 族保持。

**⑥ 工具资产**：tmp/mgl-shot2.{html,cjs}（wasm 需 mapbox-gl-js/meshopt_{base,simd}_v{0.20,1.2}.wasm
在场，gitignored 目录留意丢失）；azsweep2-*/pbr0-* 结果目录留存 argmin 曲线原始数据。

### §885 终二五九：PBR 镜面项逐式审计——F/V/D 公式与 roughness 链均干净，分歧=量化法线有效倾角（2026-09-13）

**① 公式审计（我方 MBModelRenderer:797-840 ↔ mgl model.fragment.glsl:280-470 逐式）**：F_SchlickFast/
V_GGXFast/D_GGX(α=perceptualRoughness²)/EnvBRDFApprox/diffuseLambertian(LIGHTING_3D_MODE 无 PI 除)——
**逐式一致**；roughness 传递链实测干净：mlnorm 材质 dump（quantization-shadows 全部 mesh）
rough=1/metal=0/无 metallicRoughness 贴图 → mbR=1、mbAR=mbA4=1，mgl 侧同刻度（u_roughnessFactor=
style model-roughness 默认 1；a_pbr nibble 仅 mesh-features 特征路径）。**roughness=1 时我方镜面项
公式上界 ~0.6%（F≈0.04·Vis≤0.35·D≤0.42），解释不了屋顶 ±12% 方位响应——镜面公式本身无罪**。

**② 屋顶方位响应精测（Δ30/60/90 补测后全曲线）**：roofA 230→220→206→191→180→180→206→230
（Δ=0..300，平滑余弦、周期 360°、主/-lod 孪生逐位一致、Δ180（=+ls.dir）最深）——**真实着色效应，
幅度 ±12% ≈ 有效法线倾角 ~7°**；mgl 同点全方位角恒 237。mlnorm 法线 dump：屋顶 mesh（node
0023010230201103232020）attribute 法线显著倾斜（(0.41,0.25,0.88)/(0.27,−0.43,−0.86)），而
307730210 干净朝上——**我方屋顶片元的有效法线相对 mgl 倾斜**。

**③ 悖论与主嫌疑**：PBR-off（hemisphere 分支，同用 mbN0）屋顶却方位不变——分支行为差异指向
**法线在两条支路的来源/解码不同**：主嫌疑=meshopt 量化法线解码差异（EXT_meshopt_compression
OCTAHEDRAL filter：GLTFLoader+three MeshoptDecoder 路径 vs mgl 自有解码是否对 NORMAL 属性应用
decodeFilterOct；或 flatShading 派生法线 vs 属性法线在两引擎的取舍）。判别实验设计（下轮）：
①uMB3DDbg=5 模型版——片元级着色有效法线可视化（RGB=0.5+0.5·n）对拍 mgl 同点；②parseMeshoptScene
对 NORMAL 属性解码的 filter 路径逐行核对 model_loader.ts:214 一带；③对单 mesh 强制 flatShading A/B。

**④ pbrterm 探针教训**：pbrterm=1/2 涂装未达 batched 注入点（uMBPbrTermDbg uniform 疑未在
applyMglModelLighting 的 uniforms 注册，读数=正常渲染）——下轮接线后再用；输出编码（three
sRGB）会污染所有逐项读数，须先 sRGB⁻¹ 解码。

**⑤ 审计小结**：终二五八"镜面项不归零"定性修正为**"法线数据/解码差异经 PBR 支路放大"**——
PBR-off 时同法线却不变（hemisphere 公式对倾角不敏感的结构差异待③①判别）。方向约定层（终二五六
落地）不受影响；验收判据维持：roughness-1 材质方位扫描平坦 + shadows-normal-offset 族保持 +
castro/high-zoom 收敛至 PBR-off 级。

### §885 终二六〇：模型版片元法线可视化落地——屋顶有效法线朝上（与 mgl 同），法线解码假说排除（2026-09-13）

**① OCTAHEDRAL/filter 源码核对（②）**：three GLTFLoader.js:1690+ 把 extensionDef.filter 传给
MeshoptDecoder（decodeGltfBufferAsync(mode, filter)）；mgl loaders.ts:262 同样传 config.filter——
**双方 NORMAL 属性解码路径等价**，解码差异假说排除。getNormal 对照：mgl 有 a_normal 属性则用之，
无则派生（derivative）——我方 flatShading=!prim.normals 同语义。

**② mndbg=1 探针落地（①）**：applyMglModelLighting 的 PBR 支路顶部（mbN0 之后）涂装
pow(0.5+0.5·worldN, 2.2)——worldN=normalize(mat3(transpose(viewMatrix))·mbN0)。**关键解码知识**：
注入点在 colorspace_fragment 之前且 return 提前退出 main → three 输出编码被跳过，stored=直接
pow(n01,2.2)，解码 n=stored^(1/2.2)·2−1（勿再做 sRGB 逆变换）。两轮 GLSL 教训：模板插值泄漏
globalThis（TS 表达式必须模板外求值）；int/float 字面量（'1.0' 而非 1）。

**③ 判读结果**：quantization-shadows 屋顶片元（主/-lod 逐位一致）n=(0,0,1) **朝上**——与 mgl 相同；
墙面片元水平朝向合理。high-zoom 构图不同但同样水平/朝上为主。**法线解码/倾斜假说证伪**（终二五九③
的候选项关闭）：属性法线虽倾斜（mlnorm dump），flatShading 派生法线使有效法线朝上。

**④ 悖论尖锐化（下轮主攻）**：有效法线朝上 + F/V/D 公式逐式一致 + rough=1 ⇒ 我方 PBR 直射项在
数学上必然方位不变，但实测屋顶 230→180→230 随方位角变化。剩余自由度：直射 vs 环境间接的归属、
uMB3DDir 之外的第二光向输入（uMB3DLegacyPos？three 内建灯泄漏？）、或 mbDirect/mbIndirect 合成
前的某 uniform。**下一步**：把 uMBPbrTermDbg uniform 正式注册进 applyMglModelLighting 的
mbWrapper（现仅 classic 路径有——pbrterm 探针在 batched 不生效的根因），pbrterm=2 拆 direct/
indirect 方位响应，锁定携带方位依赖的项。

### §885 终二六一：屋顶方位泄漏根因修复——mbLF 视空间法线 xy 翻转破坏旋转等价性，净 −1.07M（2026-09-13）

**① 逐项拆分涂装（mndbg=2 扩展）**：在 mbSpecTerm 处涂 R=specTerm·NdotL、G=diffTerm·NdotL
（B=0.5 自校验）——屋顶/墙的直射项在 Δ0/Δ120 **逐位相同**：方位依赖不在直射项公式，而在 mbLF
本身或直射之后。

**② 根因**：PBR 支路 `mbLF = clamp(dot(mbN, mbDirView))` 用 §733 的 **xy 翻转视空间法线**。刚体旋转
下 dot(viewN, viewL)=dot(worldN, worldL) 帧不变（屋顶=cos(polar) 恒定，与 mgl 一致）；xy 翻转破坏
旋转等价性，给每个上/半朝向片元注入随方位角 ±27% 的正弦波——量级、相位（Δ180 最深）、平滑性
（终二五九② 曲线）全部吻合。mgl lighting_factor=NdotL（未翻转 mat.normal）无此误差。

**③ 修复**：mbLF 改用未翻转 mbN0（worldadf=0 karma 旋钮保留翻转形式）；mbLF 仅直射光因子——
阴影路径（shadow overlay 乘法结构）不变。守卫：model-shadow 187,103 / light-overrides 3,799 /
multiple-models-mixed-opacity 84,140 **全部 +0 逐位**。

**④ A/B（21 夹具，vs 终二六〇 落地基线）**：castro 506,102→184,294（−64%）/lod −315,488、
high-zoom 33,237→**4,928**（低于 PBR-off 5,253——方位泄漏去除后 PBR 反超）、quantization-shadows
9,539→**2,417**（≈raw 校准基线 2,330，泄漏消除实锤）、door-light −30,581、buckingham-lod −21,760、
wireframe-lod **−60,988**、z-offset-lod **−50,609**、castro-lighting −3~5k；回退：shadows-normal-offset
+40,809/+42,172（其相机/光向几何偏好翻转形式——唯一大额代价）、flood-light +20,002、buckingham
+8,781、wireframe +5,594、z-offset +4,601。**净 ≈ −1.07M**。

**⑤ 终二五七"逐地标四基角分裂"统一解释**：各夹具相机 bearing/pitch 不同 → 翻转法线的方位波
相位/幅度不同 → argmin 落在不同基角。方位波消除后分裂机制消失（q-s 与 high-zoom 同达 2.4k/4.9k
量级）。终二五八"PBR 镜面项不归零"定性同样修正：镜面项无罪，波来自 mbLF。

**⑥ 开放**：shadows-normal-offset 族 +41k×2（偏好翻转形式，或其期望含影子-法线耦合
shadowed_light_factor_normal 的 transformed_normal 形态）——下轮核对该夹具的影子因子法线帧；
工具：mndbg=1/2（世界系法线/直射项拆分涂装）、worldadf=0（回退）留档。

### §885 终二六二：影子因子替换式重构——mgl shadowed_light_factor_normal 语义对齐，shadows-normal-offset −1.9k 双例余者逐位（2026-09-13）

**① mgl 语义核对（_prelude_shadow.fragment.glsl:79 + model.fragment.glsl:146）**：
shadowed_light_factor_normal(transformed_normal,…) **替换** lighting_factor（非与 NdotL 相乘）：
`NDotL = dot(transformed_normal, u_shadow_direction)`（影子方向、翻转法线，非着色方向/未翻转法线）；
`bias = calculate_shadow_bias(NDotL)`（坡度缩放/NORMAL_OFFSET 两态）；返回
`mix(0, (1 − I·occ)·NDotL, step(0, NDotL))`。我方旧形 = 着色 NdotL（终二六一未翻转、着色方向）
× mix(1−I, 1, lit)——两处结构偏差：因子来源方向/法线不同 + 乘法 vs 替换。

**② 重构**：mbWrapper 注册 uMBShadowDir（=lighting3DState.dir，§683 场景帧标定）与 uMBShRepl
（shrepl=0 回退旋钮）；PBR 支路影子块 shrepl 形态：
`mbShN = dot(mbN, viewShadowDir); mbLF = mix(0, (1−I·(1−mbLitS))·mbShN, step(0, mbShN))`
（mbLitS 为我方 smoothstep 深度比较≈1−occ；坡度 bias 由 §终二十二 smoothstep 形态承担）。

**③ A/B（shrepl，影子族 4 夹具）**：shadows-normal-offset 156,020→**154,177** / lod 156,496→
**154,612**（−1,843/−1,884）；castro/high-zoom/quantization-shadows 主 lod 六例**全部 +0 逐位**
（无影子/不透明影子夹具不受影响 ✓ 结构隔离干净）。净 −3,727。

**④ 教训**：日志中 vViewPosition/491 行 int→float 两类 Shader Error 为**历史遗留**（基线日志同样
存在，非本轮引入——判读运行日志须先比对基线错误集）。

**⑤ 开放**：shadows-normal-offset 残差 154k 主体仍非影子因子域（替换式仅回收 1.9k）——该夹具
（az 190/影子强度 1.0）剩余残差需独立定性（候选：AO 贴图强度、conflation 顶点色、地形拼接）；
终二六一 mbLF 修复与本轮替换式在 gated 夹具（door-light/z-offset 主例）的交互待大批复测。

### §885 终二六三：shadows-normal-offset 154k 定性——场景构图/请求集域；shrepl 默认回退（2026-09-13）

**① 三候选排除（expected/current/diff 三联判读）**：diff 几乎全幅红——expected（mgl）是多建筑街区
（长影子、SE 视角、左上相邻建筑），我方仅主建筑居中、四周建筑缺失——**残差主体=场景构图/模型
瓦片覆盖（终二五三"请求集宽度"域）**，非 AO/conflation/地形。style 佐证：无 terrain（拼接排除）；
model-ambient-occlusion-intensity=0.75 为 style 显式设定与材质一致（AO 强度排除）；conflation
顶点色即 model-color measure-light/random 表达式（窗口配色依赖 measure-light brightness——
次要真嫌疑，随请求集修复后复测）。

**② gated 交互复测（shrepl 替换式 vs 终二六一 landed）**：buckingham 族 +0 逐位 ✓；**door-light
主例 +20,313**（其 shadow-intensity 0.564 → 替换式 (1−I·occ)·NDotL_shadow 劣于乘法形态）——
替换式净贡献转负（−3.7k vs +20.3k）。**处置：默认翻回乘法形态**（uMBShRepl 默认 0，shrepl=1
旋钮保留替换式供 per-fixture 使用）；终二六一 landed 读数即当前基线。

**③ 大局快照（终二五六→二六二 累计）**：模型光照战役累计净 ≈ −2.9M px；当前大残差夹具转为
构图/请求集域（castro 184k、shadows-normal-offset 154k、buckingham 180k、door-light 158k）——
**下一战役入口=mbx-meshopt 模型瓦片请求集宽度**（终二五三③遗产）+ 门控夹具影子耦合精调。

### §885 终二六四：请求集宽度战役首证——覆盖计算算错地理格子（8763-5126 vs 2630-6352）（2026-09-13）

**① 工具**：mgl-shot2.cjs 重写（CDP Network.enable 捕获 GLB 请求集；教训：二次赋值 ws.onmessage
覆盖 RPC pump 致挂起——必须单 pump 合并 dispatch）。[MBBatchedTile] 日志补 tileKey。

**② 精确复现（shadows-normal-offset，z19/center[-122.1988,37.4231] SF）**：我方仅加载 **1 块**
模型瓦片 `8763-5126-14`（=慕尼黑，door-light/z-offset 用的那块）；正确格子按 center 计算 =
`2630-6352-14`（文件存在！2630-6352-14.glb），mgl 渲染的正是它（mgl-shot2 实拍=expected 多建筑
街区）。即**我方覆盖计算把 SF 相机算到了慕尼黑格子**——非"少加载相邻瓦片"，而是"算错格子"
（铺回的 Group position −1223/1223 = 相机邻域 → 慕尼黑内容画在 SF 相机前）。同时终二六三"构图
失配"精化：不是相机差异，是瓦片内容错位。

**③ 待查（下轮）**：MBStyleDataSource:127 coveringTiles 模拟 + FrustumIntersection 的 world→tile
映射对该 datasource 的 level/tileSize 语义（z19 请求 z14 超瓦片正确——文件只有 z14；错的是 x/y
格子）。验证锚点：期望键 2630-6352-14；对照 mgl tiled_3d_model_worker_source 的 coverTile。

**④ 其余 9 块 z14 瓦片分布**：8719-5686(慕尼黑门楼)/2619-6331/2621-6331/2621-6332/8389-5495/
9147-5394/9327-4742/2951-6424/2630-6352——各 landmark 夹具各用一块；door-light/z-offset/buckingham
用慕尼黑块（8763 或 8719），castro 用 8389-5495 或 2619 系——**逐夹具锚点键可从 expected 内容
+center 计算逐一固化**，作为覆盖修复的验收表。

### §885 终二六五：请求集假说证伪回退——瓦片请求正确（8763-5126=哥本哈根格），残差=相机构图域（2026-09-13）

**① 重大修正**：终二六四"算错格子"结论有误——我当时混淆了夹具 center（错引 quantization-shadows
的 SF 坐标 [-122.20,37.42]）。shadows-normal-offset style.center 实为 **[12.5689,55.6965]（哥本哈根）**，
z14 格子计算 = (8763,5126)——**我方请求的 8763-5126-14 完全正确**（磁盘仅此一块匹配）。请求集宽度
假说证伪（本夹具单瓦片即完整内容）。

**② 残差重定性**：style 实参 zoom **18**/pitch **69**/bearing −91.7（终二六四误记 z19/p32）。三联
对比：expected 取景比我方远 ~2×（建筑尺度差 ~2 倍），mgl-shot2 zadj=-1（zoom 17）实拍与 expected
构图吻合——**残差=相机构图域（~2× 距离差），与终二四九/二五〇 globe 相机 2.1× 距离误差同签名**
（该处 mercator"+1 zoom 惯例已验证"结论在高俯仰 z18 夹具不成立或另有 conv 区间问题）。终二五七~
二六一 各 A/B 在此夹具上的"偏好"读数均为错位场景下的噪声（其 154k 基线即存在）。

**③ 处置**：请求集战役关闭（本族夹具单瓦片请求正确）；shadows-normal-offset 残差转入**相机构图
域战役**（与 globe 相机帧映射 终二四九⑤ 合并处理：engine mercator 相机距离模型 z18/p69 复测）。
光照战役（终二五六~二六二）成果不受影响（q-s/high-zoom/castro 的改善在各自正确构图下测得）。

### §885 终二六六：相机构图域证伪关闭 + sno 着色方位 argmin=Δ180——cast-shadows 分支落地 tosun 形，净 −91.6k（2026-09-13）

**① 相机域证伪（双判决）**：①mgl-shot2 对 sno 实拍 zadj=0/-1 与 expected.png 像素 diff——
**zadj=0（raw mgl@style.zoom=18）mean diff 0.77 逐位吻合，zadj=-1 mean 180.96 全错**。终二五八
zadj 注释与终二六五"mgl 需 zoom−1"均系误判（当时把 aoint 参数误传进 probe 位致覆盖从未生效，
本次为 cjs 补 `extra=argv[8]` 通用透传）；②我方 actual vs expected 网格搜索平移：最优偏移仅
(dx=4,dy=0)，构图一致——终二六五"~2× 取景差"不成立。**相机构图域战役在开盘前即证伪关闭**，
mercator +1 zoom 惯例在高俯仰 z18 无恙。

**② 残差重定性**：sno 156,020 px 残差中阴影暗区逐位吻合（环境光项一致），失配集中在全部受光面
且逐表面比值双向（屋顶 0.64/左墙 1.37/右墙 0.76）——直射着色方位域，非均匀亮度因子。AO 假说
证伪：mgl-shot2 `aoint=` 覆盖实测 0→0.75 仅 mean 14.8（GLB 烘焙 AO 对比度小），撑不起 0.75 倍
暗化。

**③ 工具缺陷修复**：`mldiraz` 旋钮被 modelLightDir 的 cast-shadows 早退分支绕过（直接返回
ls.dir）——**终二五七 argmin 扫描从未覆盖影子系夹具**。修复：delta≠0 时对 ls.dir 水平分量做
世界系旋转；补扫 sno Δ∈{0..330}（campaign 口径 px）：0:156,020 / 30:154,617 / 60:99,205 /
120:99,945 / **180:66,659（argmin）** / 240:151,239 / 300:133,788 / 330:152,589。

**④ 落地**：cast-shadows 分支默认改 tosun 形（水平 ls.dir 取反 = batched mirror(az+180) 同
向量）；非影子夹具的 batched 分支默认本就等于该向量（数学恒等），改动对它们零可达。mlform=
lsdir 为回退旋钮，mlform=tosun 与默认重合。终二十二 旧判例系 终二六一 mbLF 去翻转之前的
测量，已被本轮取代。

**⑤ A/B（同批双臂，16+16 夹具）**：shadows-normal-offset 156,020→**66,659（−89,361）**、
-lod **66,629**；flood-light-buckingham −2,422；ground-shadow 双例 +106/+113（跨批噪声域）；
余者 q-s 2,417/castro 184,294/high-zoom 4,928/highlights 227,810/z-offset 族全部**逐位 +0**。
**净 −91,564**。验证批（改动落地后重编）复现 sno 66,659/66,629 且守卫逐位不变。

**⑥ 开放**：sno 残余 66.6k（受光面着色幅值/影子内法线偏移域）；mgl-shot2 现支持
`aoint=`/`colr=` 覆盖与 `extra` 透传，可供逐属性消单。

### §885 终二六七：sno 残余 66.6k 定域——batched 瓦片模型接收端 light-space uv 全越界（模型→模型投影整体丢失）（2026-09-13）

**① 残差结构**：tosun 落地后 sno 66,659 的失配高度局部化（右/下象限庭院+右下地面+右立面）；
主屋顶 (123.9,130,133.8) vs expected (126.4,129.7,131.6)、左墙 (152.3 vs 150.1) **逐位级吻合**——
着色方位修复实锤。失配区 expected 全部更暗（~112 vs 我方 ~180-201）= 中央建筑投向庭院/
右翼的**投影在咱方整体缺失**。

**② 排除清单**：①shrad=1.3（覆盖半径）逐位零变化——非覆盖裁剪；②AO 假说证伪（aoint 0→0.75
仅 mean 14.8）；③depth pass 完整：shadow-depth-canvas dump 显示全部建筑（含右侧高楼）带正常
framing 入图；④m_matrix 健康组装（shmat-compose 探针：proj=±210 ortho、viewInv 正交归一，
mesh origin uv=(0.87,0.63,0.67) 在界内）；⑤worldPos varying 健康（fract 条纹场空间连续变化，
跨建筑跳变属正常不同 mesh）；⑥classic GLB 路径正常：model-shadow 夹具接收端 uv 中值在界内。

**③ 决定性探针读数（新 shdbg mode 11）**：batched 瓦片接收端 factor 涂装 = 全场景 uv.z
**越界**（屋顶 fragZ≤0、其余 ≥1；clamp 后 mapDepth=1.0 空读）→ bounds gate 全部走 lit →
**模型→模型投影一个都没渲染**。此前"吻合的影子"实为几何着色暗面+地面 quad 通道（其阴影
正常）。接收端 worldPos 实测 (−118..−525, −180..24, −71..−24) RTE 合理；handle dump
（matrix/world/intensity=1/eyeOn=0）全部健康——**JS 侧 uniform 值与 GL 侧 live 值脱钩**或
worldPos→uv 链路存在系统性畸变，待查 live program uniforms
（renderer.properties.get(mat).uniforms vs handle 对象同一性）。

**④ 探针污染警示**：harness `shadowdbg>=5` 强制 `__mbShadowEyeOn=true`——本轮中段所有
uv 读数曾被 eye-rebase 弄脏（mode 11 现已显式 eyeOn=false）；`MBSTYLE_SHDIRALT` 曾被
runner 硬编码 "shdiralt=1"（=2 无法透传，已修为透传原值）。

**⑤ 工具落地**：①shdbg mode 11（因子探针 R=litFactor G=mapDepth B=fragZ，bounds-gate-free）；
②mldiraz 修复后可扫影子系（ls.dir 水平旋转，delta 0 = tosun）；③shdiralt=2（阴影相机 tosun
轴）；④shuv-matrix/shmat-compose 一次性 uniform dump 探针；⑤per-mesh onBeforeRender world
矩阵 hook（本轮无像素效果，保留——语义正确的防御）；⑥mgl-shot2 `aoint=`/`colr=`/`extra` 透传。

**⑥ 下轮入口**：dump live program 的 uMBShMatrix/uMBShWorldMatrix（three materialProperties
路径）与 handle 对象做同一性比对；若 live 值健康则用 mode 11 读数反推 worldPos→uv 逆映射的
畸变算子（对角/平移拟合），一击定位。

### §885 终二六九：恒 lit 悖论破案——bias 重映射右乘 bug 实锤（修复已落地，shbfix=1 门控，acne 调优留档）（2026-09-13）

**① 悖论收窄**：①mode 10 中心纹素探针：map center depth=0.71-0.77（**纹理有内容**，"空纹理"
假说证伪）；②live uniforms 同一（终二六八）+ uv 推算=观测（终二六九全精度复核）——接收端、
矩阵、纹理三环全健康，唯一剩下：**m_matrix 组装公式本身**。

**② BUG 实锤**：m_matrix = (proj·viewInv)·bias —— **bias 被右乘**。列向量约定下 [0,1] 重映射
必须左乘（uv = bias·proj·viewInv·p）；右乘把 +0.5 平移当几何量送进整个视变换：全精度对拍，
M·p(uv.x=−0.64) ≠ (P·V·bias)·p(uv.x=+0.32)，同一世界坐标两套答案——接收端采样垃圾 uv →
恒 lit → 模型→模型投影全丢；且垃圾变换对光源旋转的响应仍是垃圾 → 180° 转光位级不变的
"悖论"自然化解。地面 quad/extrusion 用同一 m_matrix → 其阴影同样从未真正工作（家族大面积
残差同源）。

**③ 修复已落地但默认门控**（shbfix=1 旋钮，`__mbShadowBiasFix`）：开启后投影立即出现（墙面/
地面斜向影带），但伴随强自遮挡条纹（acne）——sno 32.7M vs 基线 20.8M，净负不发布。acne
成因=级联-1 4× 深度域精度 + 比较窗（±0.0002·z域）不足；bias 加宽+0.001 平移实测无效
（32.6M，条纹非小偏移型）。默认关=与终二六六交付态**位级一致**（20,782,944 复实测 ✓）。

**④ 下轮调优清单（shbfix=1 开启态）**：①cascade-1 深度精度：4× 范围（z 域 ~3000 单位）16-bit
pack 量化 0.046/步——检查 pack 路径（r+g/255 分辨率）或对模型接收端改用 HW 深度路径
（shadowhw=1 已有）；②比较窗斜率 bias（depth-slope scaled）替代常数窗；③PCF 4-tap
（extrusion 已有形式可移植）；④shaz 扫角在 shbfix=1 下重标定方位；⑤验收：sno 主/lod +
castro/highlights/z-offset-v2-port（184k/228k/392k，其残差同为投影缺失域的概率极高）。

**⑤ 教训**：debug 涂装经输出色彩变换（线性→sRGB 之类），读数非线性（0.5→~0.73）——二值
uniform 读出 0.77 属正常，须相对比较勿绝对解码；shadowdbg≥5 强制 eyeOn 的污染已记录于终二六七。

### §885 终二七〇：shbfix 调优首轮——HW 深度/PCF/bias 窗三路 A/B，acne 非小偏移型；级联-1 PCF 移植落地（2026-09-13）

**① 三路 A/B（sno，sumdiff vs expected；基线=终二六六交付态 20,782,944）**：
- shbfix=1+shadowhw=1（HW 24-bit 深度）：29,283,333——模型尾部**不认 HW 解码**（采样 r+g/255
  而 HW 深度只读 .r，g 通道注入垃圾→深度膨胀→近恒 lit）；且 cascade-1 在 HW 态被跳过
  （m_shTex1 不生成）→ 高俯仰场景（cascade-0 外）整体回 lit。HW 路径如要启用须给模型尾部
  补 MB_SH_HW 解码分支 + cascade-1 的 HW 化，工程量另计。
- shbfix=1+bias 窗 ±0.002+0.001 平移：32,633,488；±0.002 对称：32,675,383；±0.0002：32,671,178
  ——**bias 窗宽与平移都不改变条纹强度**：条纹非比较偏移型。
- shbfix=1+cascade-1 5-tap PCF（extrusion 终一二三形式移植，uMBShTexel1 全链同步）：32,702,768
  ——条纹亦非采样混叠型。

**② 条纹定性（图面判读）**：开启态影带出现在立面/庭院，走向沿光向、边缘锐利、宽 10-20px
——与 expected 的**柔和均匀**影子带完全不同质感。三路 A/B 排除比较窗/采样混叠后，剩余假说：
①map1 深度内容本身含编码条纹（2D canvas 中间帧 premultiply alpha 或 pack 量化条带）；
②模型投影的**软边**（mgl PCF 大核/接触硬化）缺失导致质感差异被放大；③双 cascade 切换边界的
接收器归属。下轮入口：对条纹立面逐点 mgl-vs-ours 亮度对拍（mgl-shot2 probe 点已可用），
并用 mode 11 读 (mapDepth,fragZ) 剖面条带周期，若周期=1/255·z 域则实锤 pack 编码条带。

**③ 交付态**：所有调优默认关闭（shbfix/shadowhw/shaz/shdiralt/mode 6·10·11），默认渲染与
终二六六交付态**位级一致**（20,782,944 复实测 ✓）；新增落地：模型尾部 cascade-1 5-tap PCF +
uMBShTexel1 全链同步 + shbfix/shaz/hook 探针族。

### §885 终二七一：剖面探针定案——阴影相机朝向反了（lookAt 沿 −lightDir 朝天看，场景在近平面）；look-flip 门控实证相机响应（2026-09-13）

**① 剖面读数（mode 11 = mapDepth/fragZ 双通道）**：条纹立面 y=270 行 x∈[300,430] 剖面：
fragZ 全行 **0.008→0.067 平滑单调**（=整个场景贴在阴影相机近平面），mapDepth 0.63-0.75（图内容
正常）。即**阴影相机朝天看**：lookAt(center − lightDir) 中 ls.dir 是光行进方向（z 分量向下），
取负后相机朝上；场景落在近平面之外/后，uv.z≈0 → bounds gate 全 lit → 无任何模型投影。
推翻"场景在 cascade-0 视锥外"的终二六八表述——实际是**光轴朝向反 180°**（级联覆盖推导仍成立，
翻转后场景 slant 才真正进入视锥）。

**② look-flip 门控实证**：shbfix=1 下改 lookAt(center + lightDir)：全场景光影剧变（32.9M），
相机取帧响应实锤。但正确构型不是单翻——需按 mgl createLightMatrix 完整重推导光轴（ls.dir 的
z 号约定、位置偏移、near/far 对称性）+ acne 控制（HW 深度或 pack 精度 + PCF）。

**③ 探针与门控现状**：shbfix=1（bias 左乘 + lookAt 翻转）+ cascade-1 回退 + PCF + shaz 全部
门控内；默认态复实测 20,782,944 **位级一致** ✓。

**④ 下轮主攻（唯一战线）**：在 shbfix=1 开启态：①shaz ∈ {0..330,60° 步} 扫描找场景居中的方位
（uv 剖面 G 通道均值≈0.5 处）；②confirm 后逐点对拍 mgl probe 定软边；③acne 由 HW 深度或
斜率 bias 收敛；④验收 sno 主/lod → castro/highlights/z-offset-v2-port。

### §885 终二七二：shaz 扫角+castro 交叉验证——+90° 使场景居中但 castro 恶化；bias 修正与历史 shoff 校准纠缠，整体迁移定档（2026-09-13）

**① shaz plumbing 修复**：终二六九的 shaz 旋钮实测惰性（0°/90° 位级同）根因=环境 arg 断链；
硬编码强制 90° 后接收端 uv 立即响应：roof/facade/courtyard fragZ = 0.471/0.475/0.788——
**+90° 世界 Z 旋转使场景居中于光视锥**（对比 0° 的 0.008-0.067 近平面值）。

**② sno 验收（shbfix=1+rot90 常规渲染）**：31.67M（基线 20.78M）——投影出现但方向/软边不对位
（主屋顶被错误投影覆盖、白斑 acne 密布）。

**③ castro 交叉验证否决单点迁移**：castro（bearing 54.5°，与 sno −91.7° 差 146°）shbfix=1
shaz=0 → 30.2M sumdiff（其基线 184,294 px）；−109°（−2·bearing 律）跑分缺失但 0° 已示
shbfix 对 castro 无收益。**结论：bias 修正是数学正解，但历史地面阴影曾靠"错矩阵+shoff 暗校准"
对齐——单点默认开启会打破全部既有地面阴影对齐**。正确路径=整体迁移专项：bias 左乘 + 移除
shoff 校准 + cascade 选择 + acne 控制，一次重测 shadow 家族全量基线再定默认。

**④ 交付态（维持）**：默认渲染 = 终二六六交付态位级（20,782,944 复实测 ✓）；shbfix=1/shaz/
shdiralt/mode 6·10·11/PCF/HW 探针与调优旋钮全部门控保留，工具链完备。

**⑤ 专项开工清单（shbfix 迁移专项，需独立批次）**：①默认改 premultiply+lookAt 翻转+rot90；
②全量重测 shadow 家族（sno/castro/highlights/z-offset/ground-shadow/door-light/munich 系）；
③shoff 类暗校准逐一归零重标定；④acne：模型尾部 MB_SH_HW 解码分支 + cascade-1 HW 化或斜率
bias；⑤mgl-shot2 probe 软边对拍定 PCF 核。

### §885 终二七三：迁移专项首批实测——激活态 sno 107,074 恶化于惯性态 66,659，默认回退门控；光轴重推导立项（2026-09-13）

**① 迁移默认首批全量**：bias 左乘 + lookAt 翻转 + rot90 默认开启后，家族 7 夹具中
buckingham 双例 180,140/157,634、flood-buckingham 199,191（−2,422）、ground-shadow 双例
140,540/140,709（+109/+113 噪声域）、castro 184,294、castro-lighting 11,779 **全部位级不变**
——这些夹具的接收器在两种矩阵下均采样越界（全 lit），迁移对其零可达。

**② sno 激活实测**：**107,074 px** vs 惯性态 66,659 —— **恶化 40,415**。投影激活后引入的是
**错误方向的影子**（遮挡关系错位 + acne），比"无投影"误差更大。即当前光轴构型
（ls.dir+90° 旋转+lookAt 翻转）仍非 mgl 等价构型。

**③ 处置**：迁移默认回退门控（shbfix=1 显式开启；默认=终二六六交付态），复实测 sno 默认
20,782,944 sumdiff **位级一致** ✓。终二七三批测同时暴露 karma 长批次不稳（batch>3 夹具
易超时/无输出）——后续一律 3 夹具以内小批。

**④ 立项：光轴精确重推导（唯一未解环）**：需要从 mgl shadow_renderer createLightMatrix 源码
逐行移植光轴构建（light position=eye-relative、方向=raw spherical az+90、near/far=cascade
公式），替换 ls.dir+经验旋转的拼装。完成后 sno 预期 ≤66,659−40k（正确方向投影），并连带
ground-shadow/castro/highlights 的投影域残差。数据已齐：mode 11 剖面探针可逐点验证光轴
（fragZ 应从 0.008-0.067 回到 0.3-0.7 中域）。

### §885 终二七四：细扫角数据 + 全精度矩阵对拍终证——右乘 bug 数值实锤；经验旋转窗窄，立项源码级移植（2026-09-13）

**① 全精度数值终证**（sno-fullprec 探针，列主序严格重建）：M_dump == P·V·bias（右乘）逐元素
吻合 ✓；正确 remap（bias·P·V）对屋顶 worldPos (−118,−8,−39) 给 uv=(0.316,0.549,0.520)（界内
中域），而右乘 M·p=(−0.642,0.125,−0.025)（越界）——bias 乘序 bug 的最终数值实锤；16-bit
pack（v=fragZ·255, hi=floor(v)/255, lo=fract(v)，decode r+g/255）编解码自洽，alpha=1 无
premultiply 污染。

**② 细扫角（premultiply 修复态，net = 90+shaz）**：net-80°（shaz=−10）px=66,659=惯性态签名
（全 lit）；net-90°（rot90）px=107,074。**界内窗口窄**：±10° 即从"全 lit"跳到"有影子但方向
错位"——经验旋转无法收敛，必须源码级移植。

**③ 立项确认（mgl 源码已定位）**：mapbox-gl-js/3d-style/render/shadow_renderer.ts:678
createLightMatrix + shadow_utils.ts shadowDirectionFromProperties（sphericalPositionToCartesian
az+90、polar clamp 75°，无镜像）。移植要点：①camera.setPitchBearing(acos(sd.z),
atan2(−sd.x,−sd.y)) 于 mercator sphereCenter；②lightWorldToView=getWorldToCamera(ws,
pixelsPerMeter)；③lightMatrixNearZ=min(mercatorZfromZoom(17)·ws·−2, radiusPx·−2)、
FarZ=(radiusPx+verticalRange·ppm)/sd.z；④ortho ±radiusPx；⑤1e6 取整 truncMatrix 抗 shimmer。
关键帧语义：所有量在 mercator/ws 空间（非 RTE），需与接收端 vMbWorldPos 帧统一。

**④ 交付态**：默认=终二六六位级（复实测 ✓）；shbfix/shaz/mode 探针族全保留。

### §885 终二七五：shaz 全向细扫完成——经验旋转路线终局证伪；源码级移植为唯一路径（2026-09-13）

**① 扫角结果（shbfix=1=premultiply+flip 基准 111,059 px）**：shaz ∈ {−60,−40,−20,+20,+40,+60}
全部返回 **66,659 px = 全 lit 签名**（与默认交付态像素级同图）。即除 0° 外任何方位旋转都使
场景完全落出光视锥——**in-bounds 方位窗口 <±20°**，且窗口内（0°）的影子仍然错位（111k）。
经验旋转/翻转调参路线终局证伪。

**② 几何解释**：光视锥 lateral box（±210，由 1.5×ctcd 视锥球拟合而来）相对场景尺度（±400）
天然偏小，场景贴近 box 边缘——方位微旋即整体出界。mgl 不靠方位微调而是**cascade 结构**
（cascade-0 内圈 + cascade-1 4× 外圈 + 接收器按归属选择），且其光轴在 **mercator/ws 绝对帧**
构建（FreeCamera.setPitchBearing + getWorldToCamera(ws, ppm)），与咱方 RTE lookAt 拼装
根本不同域。

**③ 结论与立项**：逐行移植 mgl createLightMatrix（shadow_renderer.ts:678）为唯一收敛路径：
①mercator sphereCenter（cameraToWorldMerc·(0,0,−centerDepth/ws)）；②setPitchBearing
(acos(sd.z), atan2(−sd.x,−sd.y))；③getWorldToCamera(ws, ppm) 视矩阵；④ortho ±radiusPx
+ lightMatrixNearZ/FarZ 公式；⑤1e6 truncMatrix。同时接收端 vMbWorldPos 帧须切换到 mercator/ws
（或整帧逆映射），深度 pass 亦须同帧渲染。这是一次自包含的 shadow 管线重写，非增量调优。

**④ 交付态**：默认=终二六六位级（66,659，全家族复实测无回归）；shbfix/shaz/mode 探针族保留。
本轮新知：背景像素会污染 in-bounds 统计（须用已知模型采样点）；pkill 模式含 CHROME_BIN 路径
会自杀后台 shell（用 [l] 括号技巧）。

### §885 终二七六：迁移默认首批回退定案 + 方向语义复核——分析穷尽，立项确认（2026-09-13）

**① 方向语义复核**：源码级核查 MBEnvironmentManager lighting3DState——ls.dir = mgl-faithful
az+90 转换 **+ 渲染帧 y 镜像**（§643），即 ls.dir ≡ mgl sd 在咱方帧的等价向量（对 sno
[190,50]：ls.dir=(0.133,0.754,0.643)）。legacy 阴影相机 lookAt(center − ls.dir) = 从太阳看向
场景，**语义正确**——"朝天看"读数（终二七一 fragZ≈0.01）与语义矛盾，指向管线更深处的
帧/纹理失配而非朝向。

**② 迁移默认首批（bias 左乘+翻转+rot90 默认开启）**：sno 107,074 px 恶化于惯性 66,659——
激活的错误方向影子比无投影误差更大；家族其余 7 夹具位级不变（接收器双态均越界全 lit）。
**已回退**：默认=门控交付态（终二六六位级 20,782,944 复实测 ✓），shbfix=1 旋钮保留。

**③ 分析穷尽清单（全部实证）**：bias 乘序（全精度对拍）✓、纹理内容（中心纹素 0.77）✓、
pack 编解码自洽 ✓、live uniforms 同一 ✓、worldPos varying 健康 ✓、方向语义正确 ✓、
cascade-1 回退在位 ✓——七环皆健康而投影仍缺失，剩余可能：①深度 pass 与接收端渲染的
**帧原点差异**（rteCamera 与独立 context 相机的 matrixWorld 基准）；②CanvasTexture 上传
时序（needsUpdate 与 draw 的竞态）；③mode 探针经输出色彩变换后的读数失真掩盖了真实状态。
下轮：在深度 pass 后直接 readPixels 对比接收端采样点的期望深度（绕过全部中间路径），
一次定位帧失配或纹理时序。

**④ 交付态**：默认=终二六六位级（20,782,944 复实测 ✓），全部实验能力门控保留。

### §885 终二七七：cascade 审计定案——cascade-0 视锥裁剪半数 caster + cascade-1 far-field pass 未生效（2026-09-13）

**① 角点审计（shuv-corner-depth 探针）**：casterBox 8 角经 shadowCamera 投影，NDC x 跨度
**[−0.98, +2.37]**——约半数 caster 落在 cascade-0 视锥外被裁剪；in-bounds 角点的 readPixels
深度=背景空值。**cascade-0（radius=210=1.5×ctcd 拟合）对高俯仰地标场景天然裁剪半数遮挡体**。

**② cascade-1 审计**：第一 caster world origin (−1496,−73,−82)（caster 群 x 跨度 −118..−1496，
尺度远超视图）经 m_matrix1 投影 uv=(0.82,0.56) 界内，但 map1 该点 readPixels depth=**1.0039
（空）**——连 caster 自身应投影出的深度都缺失；cascade-1 canvas dump 探针未触发——
**cascade-1 far-field pass 实际未生效**（m_matrix1 有值但 map1 无内容，或 pass 早退）。

**③ 结论链闭合**：cascade-0 裁剪半数遮挡体（含投往庭院的遮挡建筑）+ cascade-1 回退失效 =
模型→模型投影全丢的完整因果链；各环（矩阵数学/方向语义/纹理解码）已逐一实证健康。

**④ 修复方案（终二七八开工）**：①排障 cascade-1 pass 早退原因（__mbShadowPass1Err 探针已有
钩子）；②pass 生效后模型尾部 cascade-1 回退（已落地）自然生效；③如 mgl 语义要求 cascade-1
仅服务 ground，则改模型尾部直接扩 cascade-0 半径至覆盖 casterBox（shrad 动态 = casterBox/
viewSphere 并集）。验收不变：sno 主/lod → castro/highlights/z-offset-v2-port。

### §885 终二七八：PCF texel 修正后仍全 lit——深度域失配坐实，mercator 帧移植为唯一路径（2026-09-13）

**① PCF texel bug 修复**：模型尾部 5-tap PCF 的 tap 偏移误用世界单位 uMBShTexel1（≈1.64 uv，
跨大半张图）→ 采样全落 clamp 边缘；改 1/1024 后 px=66,659（=惯性全 lit 签名）。

**② 关键推论**：SHBFIX=1（premultiply+flip+cascade-1 回退+正确 texel PCF）下，全场景采样
cascade-1 深度≥fragZ → **恒 lit**。即光视锥内（cascade-1 覆盖 ✓）沿光轴看去，遮挡体不在
接收器与太阳之间——**咱方光轴的"太阳方位/仰角"与 mgl 期望的遮挡几何不一致**。结合终二七一
（legacy −lightDir 时场景贴近平面）与本次（+lightDir 时场景在中域但无遮挡）：两种朝向都不产生
expected 的遮挡关系，纯经验变换已穷尽。

**③ 结论**：必须按 mgl createLightMatrix 的**帧语义**重写——mercator 球心
（cameraToWorldMerc·(0,0,−centerDepth/ws)）、FreeCamera.setPitchBearing(acos(sd.z),
atan2(−sd.x,−sd.y))、getWorldToCamera(ws, ppm)、ortho ±radiusPx、lightMatrixNearZ
=min(mercatorZfromZoom(17)·ws·−2, radiusPx·−2)、FarZ=(radiusPx+verticalRange·ppm)/sd.z、
1e6 truncMatrix——并把接收端 vMbWorldPos 与深度 pass 统一到同一 mercator 球心相对帧。
RTE lookAt 拼装 + 世界 Z 旋转的经验变换已证伪（终二七四/二七五）。

**④ 交付态**：默认=终二六六位级（66,659 全 lit 签名复实测 ✓）；shbfix/shaz/PCF(texel 修正)/
mode 探针族门控保留。工作量：一次自包含重写（光矩阵构建 ~60 行 + 接收端 uniform 帧切换），
独立批次执行。

### §885 终二七九：矩阵数值复核修正 + 现状定档（2026-09-13）

**① 数值复核修正**：终二七七"全精度对拍"脚本中 M 的重建误把 3.297e-20 项当 row0.z（正确的
列主序转置后 M == P·V·bias 逐元素吻合 ✓），且 bias·p ≠ 0.5p+0.5w 混淆曾导出"M·p=−0.64 与
0.32 矛盾"的假象。修正后：m_matrix 数学正确，mesh origin/roof 的 uv 均在界内中域（0.85/0.63/0.66
与 0.32/0.55/0.52）。**矩阵/帧/朝向数学层面全部健康**。

**② 残余悖论收窄到渲染侧**：数学 uv 在界内，而 SHBFIX 开启态实际渲染 px=109,481（恶化于惯性
66,659）且立面呈宽条带——剩余疑点收窄至：①深度 canvas 的 2D 中间帧 premultiply/flipY 对
RGBA pack 的破坏（g 通道=fract 部分对 alpha 与色彩变换敏感）；②探针经输出色彩变换读数失真
（0/1 值读出 0.56/0.98），gate 探针的位级判定不可靠；③SHADOW=11 剖面与 gate 涂装曾共用
通道互相污染。

**③ 下轮（一次性收口）**：①对 m_shTex 的 DataTexture/CanvasTexture 直接 readPixels（绕开
2D canvas 与探针），与 JS 侧 M·worldPos 解码值逐点对比——若一致则投影/采样闭合，残差归
PCF 软边与方向微调；②全部调试涂装改走独立 colorWrite 通道避开输出变换。工作量为单点
探针+一次验收批次。

**④ 交付态**：默认=终二六六位级（复实测 ✓）；实验代码全部门控保留（shbfix/shaz/cascade-1
回退/PCF/mode 6·10·11/读写探针族）。

### §885 终二八〇：y-flip 采样实验阴性——非翻转采样为更接近构型；实验矩阵收敛完毕（2026-09-13）

**① 本轮实验**：SHBFIX=1 现态（premultiply+flip+rot90+fallback+PCF）= 66,659 全 lit；y-flip
采样（cascade-0 采样改 vec2(x, 1−y)）= 66,659 不变；隔离态（premultiply+legacy lookAt，去
flip/rot90）+y-flip = 66,659 不变。y-flip 在两种 lookAt 下都无增益——**2D canvas premultiply/
flipY 假说证伪**（若 y 镜像为真，翻转应产生显著变化）。

**② 收敛后的实验矩阵知识**（避免下轮重复）：可见条纹影子的构型 = premultiply + legacy
lookAt(−lightDir) + 无 rot + cascade 回退 + PCF（终二六九 109,481 px）；该态影子可见但方向/质感
错位；任何 lookAt 翻转/rot ±90/y-flip 都不改善。66,659 = 全 lit 惯性签名（与交付态同图）。

**③ 残余疑点唯一化**：影子可见态的方向错位=光源**方位**与 mgl 不一致（非翻转、非近平面）。
两条路线待选：A) 按 mgl createLightMatrix 全帧移植（mercator 球心+FreeCamera+getWorldToCamera
(ws,ppm)），一次到位；B) 用 mgl-shot2 的 probe 点采样 expected 影子边界 3 点反解太阳方位
（三角测量），校准咱方 shadow 相机方位角。B 成本低可先行。

**④ 交付态**：默认=终二六六位级（66,659 全 lit 签名复实测 ✓）；门控与探针族保留。

### §885 终二八一：细扫 ±5 双双全 lit——经验窗口 <5°；cascade-1 内容确认+残余偏移量化（2026-09-13）

**① 细扫**：shaz −5/+5 均 px=66,659（全 lit 签名）。in-bounds 方位窗口 <5°，经验校准彻底
无解（窗口越窄越证明非方位问题而是帧偏移问题）。

**② cascade-1 内容确认（canvas dump 修复后首获）**：cascade-1 far-field map 含全部建筑
（含此前以为被裁剪的远端 caster），内容区 canvas 坐标 x∈[410,790]、y(top-origin)
∈[330,590] ⇒ v(=0.35·1024) 读数对应……庭院接收点 uv1=(0.47,0.35) 恰落在内容区**边缘之外**
（v 0.35 vs 内容下沿 0.42），偏差 ~0.07-0.13 v ≈ **100-135 世界单位**的系统性平移，
与 cascade-0 的观测（场景 uv.x 贴 −0.65 边缘）同量级同方向。

**③ 定性升级**：这不是"方位角错 180°/90°"的大错，而是**光矩阵平移分量的小量系统偏移**
（~130 单位 ≈ radius 的 0.6 倍）。候选：①sphereCenter 的 centerDepth 用 view-forward 投影
而场景质心不在该点（视锥球心 vs 场景质心的固有偏差，mgl 也有但被其 cascade 半径补偿）；
②radius 的 roundingMarginFactor 或 cascade-1 的 4× 缩放错位；③mesh.matrixWorld 刷新
与深度 pass 之间相差一帧（场景静止时=0，排除）。**修复方向：cascade-0/1 的 ortho 中心
改用 casterBox 中心与视锥球中心的并集投影**（比 mgl 原版更覆盖，或直接以 casterBox 中心
为 light camera 平移基准），一行改动可验证。

**④ 交付态**：默认=终二六六位级 ✓；全部探针/旋钮保留并已提交。

### §885 终二八二：casterBox 居中实验阴性——收敛至光源方向语义定标（终局前最后待解项）（2026-09-13）

**① 实验**：shbfix=1 下 ortho 中心/半径改 casterBox 拟合（排除视锥球心偏移与覆盖问题）：
px=66,659（惯性签名不变）。连同此前：无论视锥怎么框，接收器采样恒 lit——**遮挡体从不出现
在咱方光轴的接收器前方**。

**② 收敛判定**：光相机位置/半径/中心/朝向翻转/y-flip/级联回退全部操作过，唯一未被定标的
自由度 = **光源方向语义**：style `direction [azimuth 190, polar 50]` 在 mgl 中是"光行进方向"
（太阳在 10°反侧）还是"太阳所在方向"（太阳在 190°）。两者的阴影投射方向差 180°，直接决定
庭院影子是否存在。mgl 语义可从 directional light 文档/shader 确认（directional light 的
direction 定义为 light 表面法向=指向场景？还是光源位置方向），并在咱方 conversion 中对齐。

**③ 交付态**：默认=终二六六位级 ✓（casterBox 实验在 shbfix 门控内，不影响默认）。
**④ 下轮**：确认 direction 语义 → 按 mgl 语义修正 shadow 光轴方向（大概率 = shbfix 态下
lookAt 改 +lightDir 全分量，或等价的 azimuth+180）→ sno 验收 → 家族。

### §885 终二八三：门控布尔 bug 修复 + 接收端法线偏移——108.5k→100.6k，仍净负（2026-09-13）

**① 门控布尔 bug**：harness 设 `__mbShadowBiasFix = true`（布尔），而 MBShadowRenderer 三处
门控用 `!== 1` 严格比较——`true !== 1` 恒真，premultiply/翻转/rot90 分支**从未激活**！
（终二六九 biasfix 109,481 的实测实为 premultiply 生效态——彼时门控写作布尔真值判断。）
已改为真值判断。此前 shaz 细扫（±5/±20..60=全 lit 66,659）实际测的是 legacy 路径，
**方位扫描结论需在修复后重测**。

**② 接收端法线偏移**：根因确认——深度 pass 的 normal-offset(3) 使 caster 深度偏浅，
接收端不做同偏移则**全表面自阴影**（主屋顶棕色块+白色阶梯 acne）。已在模型尾部采样位
加 `worldPos + worldNormal·3`（viewMatrix 转置还原世界法线）：108,514 → **100,615 px**
（−7.9k，方向正确但不足）。

**③ 现状**：shbfix=1 态 = premultiply+legacy lookAt+rot0+法线偏移+cascade 回退+PCF：
100,615 vs 惯性 66,659 仍净负 33,956。剩余：偏移量 3 的标定（offset 太小残留 acne、太大
影子收缩——需扫 1/2/3/5/8）、cascade-1 粗纹粒（3.3 单位）对细影子的量化、以及 bias 窗
与偏移的联合标定。

**④ 交付态**：默认（无 SHBFIX）= legacy 路径 = 终二六六位级 ✓ 不受影响；shbfix=1 实验态
100,615。下轮：offset 幅值扫描（hardcode 改参 3 轮）+ bias 窗联动，目标 px<66,659 后
转默认+家族验收。

### §885 终二八四：normal-offset 扫描定论——单调趋近惯性态，平移误差主导实锤（2026-09-13）

**① 扫描（shbfix=1，px）**：off 3→100,615 / 5→81,811 / 8→77,294 / 12→73,622 / 16→70,060 /
24→68,231，单调趋近惯性态 66,659（全 lit）渐近线。**任何幅度的影子都比无影子更错**——
offset 扫描只是把影子"抹掉"回惯性态，不产生正确影子。

**② 定论**：光视锥内容与接收器期望之间存在 **~130-500 单位的系统性平移/朝向误差**
（= 光相机位置基准错），normal-offset/bias/PCF 微调全不可修。唯一路径 = 终二七五③的
mercator 帧 createLightMatrix 全帧移植（光相机位置用 mercator 球心绝对坐标，而非 RTE
视锥球心的近似拼装）。

**③ 交付态**：默认=终二六六位级 ✓；shbfix/shnoff/全探针族门控保留；offset=3 默认（门控内）。

### §885 终二八〇B：迁移默认开启实测净负（92,026 vs 66,659），回退门控；发现双 sync 路径 noff 不一致（2026-09-13）

**① 迁移默认开启实测**：premultiply+flip+rot90+casterBox 居中+noff=32 默认全开后，sno=
92,026 px（净负 25k）；重复运行 92,026 确定性一致（本轮构建内确定）。此前 off32=66,131 的
单次优值系构建态差异（双 sync 路径之一缺 noff 同步时的偶然态），不可复现。

**② 修复与保留**：①双 sync 路径的 noff 同步补齐；②默认回退门控（shbfix=1 显式开启实验态）；
③交付默认=终二六六位级（复实测 66,659 ✓）。

**③ 下轮（shadow 迁移的正攻方向）**：①候选构型细网格：offset ∈ {16,24,32,48} ×
{有/无 rot90} × {有/无 flip}（当前只测过 rot90+flip 组合的 off 24/32/48，未测 flip-only、
rot-only 组合——66,131 优值属于哪个组合需重验）；②acne 的斜率 bias（depth-slope scaled）
替代常数窗；③cascade-1 纹粒 3.3 单位的软边 PCF 核宽扫。

### §885 终二八二B：细网格+默认验证——shadow 状态跨运行非确定，默认翻转暂缓（2026-09-13）

**① 家族验收（shbfix=1+noff32）**：sno 主 66,131 / lod 66,391（双双低于惯性 66,659 ✓）、
q-s 2,417（+0）、castro 184,294（+0）——净正向但幅度小（影子仅部分正确）。

**② 默认态验证发现非确定**：同一构建、无旋钮默认态实测 66,659（全 lit）≠ shbfix 态 66,131，
且互相矛盾于"两配置数学等价"——**shadow map 内容/上传时序存在跨运行非确定**（SwiftShader
纹理上传与帧时序，§530 谱系）。默认翻转在非确定源消除前不可验证、不可发布。

**③ 交付态**：默认=终二六六位级（66,659 复实测 ✓）；shbfix=1+shnoff=32 为已验证更优实验态
（一次性 66,131），配置与旋钮全部保留。

**④ 下轮（最终收口清单）**：①非确定源定位：深度 canvas 2D 拷贝与 DataTexture 上传的帧时序
（run() 内 drawImage/clear 的执行序）；②确定性化后 sno 稳定 <66,659 → 转默认；③家族验收
castro/highlights/z-offset-v2-port/ground-shadow。

### §885 终二八五：premultiply 转默认落地——sno 主 65,308/lod 65,069 双破惯性线，守卫位级零回归（2026-09-13）

**① 关键修正**：终二八三的门控布尔 bug（true!==1 恒真）使 premultiply 分支从未激活——
此前 SHBFIX=1 的"条纹影子"实测态实为 premultiply+legacy lookAt 组合；本次将 premultiply
转默认（shbfix=0 保留回退）+ bias 窗 ±0.002 + 接收端法线偏移 3 + legacy lookAt（不翻转、
不 rot）后：**sno 主 65,308 / lod 65,069**——双双首次稳定低于惯性线。

**② 守卫**：q-s 2,417 / castro 184,294 / high-zoom 4,928 / castro-lighting 11,779 **全部
位级不变** ✓（这些夹具的接收器本就在 cascade-0 界内采样或与影子域无关）。

**③ 机制总结（本轮系列定案）**：①bias 重映射须左乘（右乘把 +0.5 平移当几何量→接收端
垃圾 uv→恒 lit）；②接收端采样须与深度 pass 同法线偏移（抵消 caster 深度偏浅）；③
cascade-1 回退（4× 视锥）服务 cascade-0 外的接收器；④偏移幅值 3 为当前标定（5-tap PCF
已就位，texel 1/1024）。

**④ 残余**：sno 65.3k（影子软边/质量域）；castro 184k、highlights 228k、z-offset-v2-port
392k 的影子域分量待同法处理；ground-shadow 双例噪声域 ±100。下轮：offset/bias 细网格
+ 深度 pass normal-offset 联动扫，向 sno 全对齐推进。

### §885 终二八六：bias 窗 uniform 注入路线受挫——回退至 bdecbd55 交付态（65,308 复实测 ✓）（2026-09-14）

**① 实验记录**：shbias 窗（±0.001/±0.005 uniform 注入）双窗均 px=179,062（远差于交付态
65,308）且互相相同——uniform 注入路径本身破坏了渲染（或两窗宽同落坏区），无有效信号。
已回退 MBModelRenderer/test/runner 至 bdecbd55 交付态，sno 复实测 **65,308 位级一致** ✓。

**② offset 扫描（终二八四）与 bias 窗实验的教训**：offset 扫描用「hardcode 值逐轮替换」
可靠；uniform 注入/环境变量透传链路（runner→KARMA_ARGS→harness→global→shader 模板插值）
环节多、易静默失效——后续标定一律用 hardcode 逐轮替换法。

**③ 当前最优已知态（已交付）**：premultiply + legacy lookAt + 接收端法线偏移 3 + cascade-1
回退 + PCF(1/1024) + bias 窗 ±0.002 → sno 主 65,308 / lod 65,069（双双低于惯性 66,659），
守卫全 +0。

**④ 下轮**：①bias 窗扫描改 hardcode 法（±0.001/±0.005 各一轮）；②offset 幅值联动
（偏移 3 与窗 0.002 的组合未必最优）；③影子软边质量域收敛后按残差清单推进
castro/highlights/z-offset-v2-port/ground-shadow。

### §885 终二八七：bias 窗标定落地 ±0.0005——sno 65,054（累计自 156,020 降 58%）（2026-09-14）

**① 窗扫描（hardcode 法，offset=3 固定，px）**：±0.002→65,308 / ±0.001→65,118 /
**±0.0005→65,054（最优）** / ±0.0002→65,069。最优窗 ±0.0005 落地。

**② 守卫**：q-s 2,417 / castro 184,294 / high-zoom 4,928 / castro-lighting 11,779 全部位级
不变 ✓。

**③ sno 累计**：156,020（原始）→ 66,659（tosun 方位，终二六六）→ 65,054（bias 窗标定，
终二八七）——**累计 −58%**。影管重写的 bias 左乘/朝向/级联回退/法线偏移四件套全部在位。

**④ 下轮**：①sno 残余 65k 的构成再定性（投影缺失 vs 软边 vs 光照域——profile 探针读
mapDepth<fragZ 的像素占比可判）；②residual 清单家族推进：castro 184k/highlights 228k/
z-offset-v2-port 392k 属光照+几何域（非本轮影子域），按各自域独立攻坚；③ground-shadow
双例噪声域 +109/+113 维持观察。

### §885 终二八八：sno 残余构成量化——过度阴影 84k px 主导（方向性错位非软边）（2026-09-14）

**① mode 11 量化**（R=mapDepth, G=fragZ 原始通道分类；单色变换单调故分类可靠）：
接收器 209,670 px 中——分类遮挡 122,508 / 分类 lit 87,162。对照 expected：
- expected 有影而我们漏影（欠阴影）：25,194 px
- expected 无影而我们错标阴影（**过度阴影**）：**84,457 px** ← 残差主导
- 正确阴影：38,051 px

**② 定性**：过度阴影 84k 主导——光轴遮挡关系系统性错位（非软边、非精度）。候选：
①阴影相机水平朝向镜像（方位差 ~180°，即 lookAt 应沿 +lightDir 分量水平翻转）；
②深度 pass normal-offset(3) 方向/单位错，把别的 caster 表面压进接收器射线；
③ls.dir 的 §643 y 镜像在阴影路径应换成 mgl raw（az+90 无镜像）——即终二十二旧判例
的"镜像 vs raw"之争在 shbfix 新管线（bias 左乘+法线偏移）下需重判。

**③ 下轮**：shdiralt=1（raw az+90 无镜像）在 shbfix=1 态重测 px——终六十四 时该实验
因布尔门控 bug 从未真正生效，现在门控已修，一次即可判镜 mirror vs raw。

### §885 终二八九：raw 方向实验定量——模型接收器受益（sno −3.6k）但 ground quad 受损（+36.5k），净负维持门控（2026-09-14）

**① SHDIRALT=1+SHNOFF=32 家族实测**：sno 63,016（−3,643 vs 惯性 66,659 ✓ 方向对模型接收器
有益）；ground-shadow-fog 140,431→158,749（+18.3k）、hard-cutoff 140,596→158,798（+18.2k）
——**ground quad 的阴影重建按 §683 镜像系校准，raw 方向破坏之**。

**② 定论**：模型接收端需要 raw 方向（或等效），ground quad 需要 §683 镜像系——单一全局
方向无法同时满足。两条收敛路径：A) 模型尾部采样矩阵独立采用 raw 方向构建的 cascade-1
专用矩阵（ground quad 维持现 m_matrix）；B) ground quad 也迁 raw 并重标定其 uv（工程大）。
推荐 A：模型尾部加一个"raw 方向 cascade-1 专用第二 pass"或直接让模型接收器采样时用
独立矩阵，ground 不动。

**③ 交付态**：默认=终二六六位级维持 ✓；SHDIRALT=1/SHNOFF=32 门控保留（sno 单夹具最优
63,016）。本轮新增：cascade-1 canvas dump 探针（c1n 计数器版，作用域 bug 已修）+
courtyard-audit 探针 + casterBox 角点 readPixels 探针。

### §885 终二九〇：cascade-1 raw 轴实验阴性——ground quad 级联回退依赖镜像系，净负回退（2026-09-14）

**① 实验**：cascade-1 far-field 改 raw 方向（az+90 无镜像），cascade-0 维持镜像：sno 64,978
（−76 微益）但 ground-shadow-fog 158,748（+18.3k 回归）——**ground quad 的 cascade-1 回退
依赖镜像系**，raw 轴破坏其 fall-back 对齐。净负明确，已回退。

**② 结构定论**：cascade-1 的方向是全局资源——ground quad 回退与模型尾部回退共用，二者
对方向的要求冲突（镜像 vs raw）。单点改动不可行，正解只剩：①模型尾部独立第二 far-field
pass（raw 轴专用，工程中）；②或完整 mgl createLightMatrix 移植后按 mgl 统一语义重推所有
消费者校准。

**③ 交付态**：回退后=终二八七位级（sno 65,054/主 65,308）✓ 全部实验门控保留。

### §885 终二八九B：raw far-field pass 首轮实现受挫（shader 编译失败→模型消失 179k）→ 回退；R 系基础设施保留（2026-09-14）

**① 实现**：MBShadowRenderer 新增第三 pass（raw 轴 az+90、4×、独立 m_matrixR/m_shTexR/
readPixels）+ getShadowUniforms 暴露 mapR/matrixR + 模型尾部 R 系声明/uniform/双 sync +
fallback 重定向。首测 **179,062 px、模型整体消失**——GLSL 编译失败（karma 日志：
'uMBShMatrixR'/'uMBShMapR' undeclared——R 系声明注入脚本因 assert 中断未落盘，而用法已
重定向）。补齐声明后 65,164（仍劣于交付 65,054）→ 回退 cascade-1 采样，R 系基础设施
（声明/uniform/双 sync）保留待用（mapR 未暴露时 hasR=0 惰性）。

**② 结构教训**：多脚本串联编辑时 assert 中断会留下"半应用"状态（声明缺、用法在）——
后续大改用单脚本全量 apply+verify。编译失败的全模型消失（灰底帧）是可靠信号。

**③ 定论**：raw far-field pass 的框架代码已就位（MBShadowRenderer 侧可从 git 历史
00a32186+ 本轮 diff 复原），但接收端映射后 px 65,164 vs 交付 65,054——**raw 轴远场对 sno
并无收益**（+110），终二八九的 63,016 优值属于 SHDIRALT=1 全局 raw（含 ground 代价 +36.5k）
的特殊组合。sno 影子收敛需重新定性 65k 残余的确切构成后再战。

**④ 交付态**：默认=终二八七位级（65,054 复实测 ✓）；R 系基础设施惰性保留。

### §885 终二九一：sno 残余定性完成——光轴方位实质性错位（非软边/精度），源码移植立项维持（2026-09-14）

**① 剖面分类**（mode 11，R=mapDepth G=fragZ，原始通道单调可比）：条纹立面 y=270 行
x∈[300,430]——mapDepth 0.63-0.75（图内容存在 ✓）、fragZ 0.008-0.067 平滑、分类恒 LIT。
对照 expected：该区域应为**遮挡**（中心建筑投影）。即咱方光轴下沿该射线的遮挡体缺失/
错位——光轴方位与 mgl 存在实质性角度差。

**② 残余构成定量**（全图分类 vs expected 影子掩码）：过度阴影（expected 无影咱方有影）
84,457 px 主导 + 漏影 25,194 px + 正确阴影 38,051 px。结论：**方向性错位**，非软边/精度；
normal-offset/bias/PCF 微调不可修（终二八四已证）。

**③ 唯一路径确认**：mgl createLightMatrix 源码级移植（mercator 球心 + FreeCamera
setPitchBearing + getWorldToCamera(ws,ppm) + truncMatrix），替换 RTE lookAt+ls.dir 拼装。
关键未知=咱方世界（x 东 y 北 z 上、projected meters）与 mgl mercator（x 东 y 南 z 上）
之间的帧变换（y 镜像+可能的原点平移）——需一次专项推导并重推全部消费者（ground quad/
extrusion/模型尾部）校准。

**④ 交付态**：默认=终二八七位级（sno 65,054，bias 窗 ±0.0005 落地 ✓）；SHADOW=11/mode
探针族保留。

### §885 终二九二：offset/窗标定收口——off3+±0.0005 为局部最优（65,054 已交付），sno 残余转入光照域（2026-09-14）

**① offset 扫描补全（窗 ±0.0005）**：off1/2（旧窗数据 108.8k/114.3k 不可比）、off3=65,054、
off6=107,975、off12=107,949——off3 为尖锐最优，off≥6 急剧恶化（法线抬升超过建筑高度差，
正确影子被抹掉=彼得平移）。

**② negsign 对照**：接收端偏移取负号 → 109,503（远差）——+mbWN 方向正确实锤。

**③ 定论与交付**：off3 + 窗 ±0.0005 为该旋钮空间的局部最优，已交付（sno 65,054，累计
自 156,020 降 58%）。sno 残余 65k 的构成：影子软边/量化 + 光照域（非偏移/窗可调参）。
后续收敛需：①斜率缩放 bias（depth-slope）；②PCF 核宽/软边（mgl 风格）；③或更高分辨率
shadow map（1024→2048）。家族残差 castro 184k/highlights 228k/z-offset-v2-port 392k 属
光照+几何域，独立攻坚。

**④ 交付态**：终二八七位级 + off3/窗 ±0.0005（复实测 ✓），shnoff/shbias... shbias 旋钮
本轮注入尝试已回退，shnoff 旋钮保留。

### §885 终二九三：工作区漂移定位与交付态恢复——negsign 负号泄漏 + R 系半应用已清理（2026-09-14）

**① 漂移根因**：终二八三的 negsign 实验（接收端偏移取负）与 `?? 32` 默认改动被 0adfb20d
提交带进 HEAD；终二八九B 的 R 系声明注入 assert 中断造成半应用。此后所有"默认态"实测
（66,659/89,875/92,026）实为**负号+错误窗宽**的混合态——bdecbd55/8975d406 的 65,054
才是真交付态。

**② 恢复**：git checkout 8975d406 -- MBShadowRenderer.ts MBModelRenderer.ts（终二八七
交付态：premultiply 默认 + 接收端法线偏移 +3 + bias 窗 ±0.0005 + cascade-1 回退 + PCF）。
复实测 sno = **65,069**（跨批微差范围内 ≈65,054 ✓）。

**③ 方法论**：实验必须即时回退或即刻提交，禁止跨轮携带未验证 diff；每轮结束跑一次
锚点夹具（sno=65,054）确认基线。

**④ sno 现状**：65,054（影子域本轮系列累计 −58%）；残余=软边/量化+光照域。
家族残差 castro 184k/highlights 228k/z-offset-v2-port 392k 属光照+几何域独立攻坚；
ground-shadow 双例 ±100 噪声域。

### §885 终二九四：cascade-0 5-tap PCF 落地——sno 64,225（−829），守卫全 +0（2026-09-14）

**① 落地**：模型尾部 cascade-0 采样加 5-tap PCF（中心+4邻，texel 1/1024，cascade-0 专用），
软化量化条带边沿。sno = **64,225 px**（vs ±0.0005 窗基线 65,054，−829；vs 惯性 66,659，
−2,434；vs 原始 156,020，**−59.1%**）。

**② 守卫**：q-s 2,417 / castro 184,294 / high-zoom 4,928 / castro-lighting 11,779 全部
**位级 +0** ✓（无 PCF 消费者的夹具零可达）。

**③ 排除记录**：斜率缩放 bias（dFdx/dFdy 梯度自适应窗）65,197 劣于常数 ±0.0005——条纹
非斜率型 acne。±0.0002/±0.0005/±0.001/±0.002 窗扫描：65,069/65,054/65,118/65,308，
±0.0005 最优已交付。

**④ sno 累计**：156,020 → 64,225（**−59.1%**）。残余=影子软边质感（mgl 大核 PCF/软影）+
光照域。下轮：PCF 核宽/形状扫（2-tap vs 5-tap 更宽核）、mgl-shot2 软边对拍、家族
castro/highlights/z-offset-v2-port 光照域攻坚。

### §885 终二九五：PCF 核宽扫描落地 24/1024——sno 61,347（累计 −60.7%），守卫全 +0（2026-09-14）

**① 核宽扫描（cascade-0 5-tap，tap 偏移 texel 数）**：1→64,225 / 2→63,568 / 3→63,215 /
5→62,830 / 8→62,152 / 16→61,405 / **24→61,347（最优）** / 40→63,824（过宽 peter-pan）。
24/1024 ≈ 影子半影宽 ~5 世界单位，与 mgl 软影质感吻合。

**② 守卫**：q-s 2,417 / castro 184,294 / high-zoom 4,928 / castro-lighting 11,779 全部
**位级 +0** ✓。

**③ sno 累计**：156,020 → **61,347（−60.7%）**。本轮系列（终二六六~二九五）影子管线四件套
（bias 左乘、cascade-1 回退、法线偏移、PCF）全部标定落地。

**④ 下轮**：①9-tap/对角形核对比 24 宽 5-tap；②sno 残余 61.3k 的构成（斜率 bias 已排除，
剩余=软影形状+光照域）；③家族 castro 184k/highlights 228k/z-offset-v2-port 392k 光照+
几何域独立攻坚；④ground-shadow 双例观察。

### §885 终二九六：9-tap/对角核对比阴性——5-tap@24/1024 确认为最优并复现（2026-09-14）

**① 9-tap（中心+8邻含对角）@24/1024**：63,542 px 劣于 5-tap 同宽 61,347——对角采样引入
更深背景内容，模糊掉正确的影缘。**5-tap 十字 @24/1024 确认为当前最优核**（复现 61,347 ✓）。

**② 交付态**：默认（premultiply+legacy lookAt+off3+±0.0005+cascade-1 回退+cascade-0
5-tap PCF@24）复实测 61,347 ✓。sno 累计 156,020→61,347（**−60.7%**）。

**③ 残余 61.3k 定性（承接终二九一）**：过度阴影 84k+漏影 25k 的主体=光轴方位错位；
经验微调（窗/核宽/形状/offset）已收口至局部最优。正解=mgl createLightMatrix mercator
帧源码级移植（帧变换推导+消费者重推校准），需独立批次专项。

**④ 家族**：castro 184k/highlights 228k/z-offset-v2-port 392k 属光照+几何域独立攻坚；
ground-shadow 双例 ±100 噪声域观察。

### §885 终二九三B：过度阴影定域至材质级——窗排条带假说（2026-09-14）

**① 帧语义定案**：mgl getWorldToCamera（quat 旋转+ws 平移+y 行翻转+z 列 ×ppm）与
lookAt(up=z)+法线偏移的咱方实现**几何等价**——mercator 帧移植不改变遮挡关系，排除。
光轴朝向语义亦一致（都从太阳看向场景，§643 y 镜像正确）。

**② 过度阴影 84k 的材质级定域**：条带沿窗排分布（每排窗户一条）——候选=mgl 对
window/透光（transmissive/glass）部件**不施加阴影接收**（或其 shadow 强度不同），
而咱方模型尾部对所有部件统一乘 shadow factor → 窗排被额外压暗。与"阴影区部分正确
38k+窗排条带错位"的图面观察吻合。

**③ 验证与修复路径**：①按 part 分组统计错位像素的 part 归属（model-color 的 part
match 分支可 aid：roof/wall/window 三类）；②若确认 window：接收端 shadow factor 对
transmissive 部件跳过（或 mgl 语义=transmissive 材质 shadow factor=1）；③回归 sno
主/lod+守卫。

**④ 交付态**：默认=终二八七位级（65,069 复实测 ✓）；全部门控/探针保留。

### §885 终二九四：接收端法线偏移的 light-side 符号修正落地——sno 62,129（−2,925 vs ±0.0005 基线），守卫全 +0 位级（2026-09-14）

**① 落地**：模型尾部 shadow 采样位置偏移方向按 `sign(dot(mbWN, uMB3DDir))` 朝光源侧
（此前 +mbWN 固定方向在负 scale 组上会把采样点推进墙体内→自阴影）。sno =
**62,129 px**（vs ±0.0005 基线 65,054，−2,925；vs 惯性 66,659，−4,530；vs 原始 156,020，
**−60.2%**）。

**② 守卫**：q-s 2,417 / castro 184,294 / high-zoom 4,928 / castro-lighting 11,779
全部**位级 +0** ✓（这些夹具的接收器在阴影比较中被该修正影响为零或同为正向）。

**③ 残余 62.1k 构成**：影子软边（mgl 大核 PCF 软影）+ 窗排材质域 + 光照域。
**④ 下轮**：①PCF 核形状/宽度在 light-side 偏移新基线上重扫；②mgl-shot2 probe 软边
对拍定核形；③家族 castro/highlights/z-offset-v2-port 各自域攻坚。

### §885 终二九六B：cascade-0 PCF texel 细扫收口——24 确认最优（sno 61,347），标定完成（2026-09-14）

**① texel 细扫（shpcf 旋钮，5-tap 十字）**：0(off)→65,235 / 12→61,945 / 16→61,405 /
**24→61,347（最优，已交付）** / 32→62,918 / 48→64,810 / 96→66,630。PCF 旋钮空间收口：
24 texel（≈4.7 世界单位半影）为该参数局部最优。

**② sno 现状 61,347**（累计 −60.7%）：残余=软影形状差异（mgl 大核软影 vs 咱方 5-tap）+
光照域。shpcf 旋钮保留供后续微调。

**③ 下轮**：①sno 残余的软影形状 vs 光照域占比定性（diff 图暗像素分类）；②9-tap 对角核
（终二八九B 阴性结论维持）；③家族 castro 184k/highlights 228k/z-offset-v2-port 392k
光照+几何域攻坚；④ground-shadow 双例观察。

### §885 终二九七：sno 残余构成定性完成——强误差 10.6k = 漏影 80% + 光照域 20%；其余为亚阈值软边（2026-09-14）

**① 双维分类**（亮度域 × 阴影状态，当前 pcf32 态）：
- ibct 口径 62,918 px 中，**强误差（通道和>90）仅 10,643**：
  - A 漏影（exp影/我lit）**8,465（80%）**——中心建筑投影未覆盖区域
  - C 双 lit 色调差（光照域，我方偏暗 91%）2,120
  - B 多影 51 / D 双影色调差 7（可忽略——影深/影强已对齐）
- 其余 ~52k = 亚阈值软边差（PCF 核形/软影质感域）。

**② 定案**：①主攻漏影 8.5k（光轴方位/遮挡关系，承接终二九一方向性错位定性）；
②软边 52k 需 mgl 软影质感对拍（核形/核宽已扫，24/1024 最优）；③光照域 2.1k 低位。

**③ 交付态**：默认（premultiply+legacy lookAt+off3+±0.0005+cascade-1 回退+5-tap PCF@24）
sno 65,054→65,069 复实测 ✓ 位级维持；shpcf/shnoff/shbias/shbfix 旋钮族保留。

### §885 终二九三+：shaz 方位细扫定标——raw 方向 −12° 最优（60,059），全局落地需拆分 ground/模型消费架构（2026-09-14）

**① shaz 细扫（SHDIRALT=1+SHNOFF=32 态）**：0→63,016 / ±5→60,505/61,382 / ±8→60,239/61,768 /
**−12→60,059（最优，复现 ✓）** / −14→60,345 / +10→61,768 / +15→62,048。负方位（顺时针）
持续改善——光轴方位与 mgl 确有 ~12° 级别的系统差。

**② 全局落地受阻**：SHDIRALT=1（raw 轴）下 ground-shadow 双例 +18.3k×2（ground quad 的
级联回退按 §683 镜像系校准）——全局净负 +33k。**结构定论：ground quad（镜像系）与模型
接收器（raw 系）需要分离的光轴/深度图**。单一全局方向、单一 cascade 结构无法同时满足。

**③ 下轮（迁移专项核心）**：①shadow renderer 增加"模型专用 raw cascade-0 pass"
（独立 m_matrixR0/m_shTexR0，模型尾部 fallback 优先采样）；②ground quad 维持镜像
cascade-0；③sno 主/lod 验收（预期 ≤60,059 且 ground 双例回归 ≤±100）；④家族验收。
工程量：MBShadowRenderer 增一 pass+一矩阵+模型尾部 fallback 目标切换，边界清晰。

### §885 终二九四：偏差构成四分类+窗标定收口——漏影 5.8k/光照 2.3k/软差 57.6k，off3+±0.0005 交付（2026-09-14）

**① bias 窗扫描（hardcode 法，offset=3）**：±0.002→65,308 / ±0.001→65,118 /
±0.0005→**65,054（最优，已交付）** / ±0.0002→65,069。最优窗 ±0.0005 落地。

**② 守卫**：q-s 2,417 / castro 184,294 / high-zoom 4,928 / castro-lighting 11,779 全部
**位级 +0** ✓。

**③ sno 累计**：156,020 → **65,054（−58.3%）**。本轮系列（终二六六~二九四）影子管线四件套
（bias 左乘、cascade-1 回退、法线偏移、PCF 软化）全部标定落地。

**④ 下轮**：①sno 残余 65k 的构成再定性（投影缺失 vs 软边 vs 光照域——profile 探针读
mapDepth<fragZ 的像素占比可判）；②residual 清单家族推进：castro 184k/highlights 228k/
z-offset-v2-port 392k 属光照+几何域（非本轮影子域），按各自域独立攻坚；③ground-shadow
双例噪声域 +109/+113 维持观察。

### §885 终二九八：模型专用 raw cascade-0 pass 落地——ground/模型消费拆分实现，raw 0° 默认（家族净 −8.9k 零回归），−12° 判 sno 专属过拟合（2026-09-14）

**① 实现（迁移专项核心，承接终二九三+）**：
- MBShadowRenderer 新增模型专用 raw cascade-0 pass（m_shTexR0/m_depthPixelsR0/m_matrixR0），
  插入点在镜像 cascade-0 读回之后、cascade-1 之前。raw 轴 = mgl 球面转换（dirProp 存在走
  az+90，否则 ls.dir y 镜像回退）+ shrawaz 旋转（**默认 0°**）+ 75° 极角钳制；caster 侧法线
  偏移喂本 pass 轴；frustum 球拟合与 cascade-0 同参（正交球拟合方向不变量，far 按 raw 轴 z
  重算）；渲染/读回/premultiply-bias 与镜像链同构；收尾恢复镜像 lookAt 与深度材质轴
  （cascade-1 与全部镜像路径位级不变）。
- 模型尾部（两处光照分支）新增 uMBShHasR/uMBShMapR/uMBShMatrixR：raw 入界**优先采样**
  （5-tap PCF@24 同 shpcf 旋钮），出界回退镜像 cascade-0/cascade-1 链；fragZ 按选中图配对
  （raw 用 mbShUvR.z；cascade 路径保持历史 mbShUv.z 比较——位级不变的关键）。
- ShadowUniformState 透传 mapR/matrixR；双 sync 路径同步；旋钮 shrawaz=<deg> / shmodelraw=0
  （karma args + runner MBSTYLE_SHRAWAZ/MBSTYLE_SHMODELRAW 值透传）。TS 错误 101 = HEAD
  101（零新增）。

**② 消费者矩阵实测（同树三档 A/B，rawfinal/rawc0fam/rawc0famoff 批）**：

| 夹具 | mirror（raw关） | **raw 0°（默认）** | raw −12° |
|---|---|---|---|
| sno 主 | 65,054 | **60,892（−4,162）** | 59,891 |
| sno lod | 65,069 | **60,836（−4,233）** | 59,955 |
| z-offset-v2 | 235,756 | 235,227（−529 噪声级） | 290,747（**+54,991**）|
| z-offset-v2-port | 392,710 | 392,751（+41） | 392,480（−230）|
| z-offset-v2-station | 221,804 | 221,804（+0 位级） | 221,804（+0）|
| ground-shadow 双例 | 158,750/158,790 | 158,750/158,790（+0） | +1（±1）|
| 守卫 castro/q-s/castro-lighting | 184,292/2,434/11,776 | 结构性不可达 | 同左（开/关逐位一致）|

**③ 定档**：**shrawaz=0（未旋转 raw mgl 轴）为默认**——家族净 **−8,883** 且零回归项。
−12°（终二九三+ shaz 扫描 argmin）是 sno 单夹具过拟合：sno 仅再赢 ~1k 而 z-offset-v2
+55k（其 dir [311.9,82.4] 近天顶，极角钳制 75° 后方位旋转被放大），降为 shrawaz 旋钮。
与终二五七"全局着色方向约定不存在"同构——**模型接收端对影子光轴的偏好同样是夹具发散的**
（sno 偏好 −12，z-offset-v2 偏好镜像/0°，port/station/ground 不敏感）。终二九三+ 的
"sno ≤60,059" 验收线为 −12° 档专属，0° 档 60,892（差 833）——按家族净收益优先取 0° 档。
"ground(镜像系)/模型(raw 系) 分离光轴"的结构假设被 ② 修正：ground 双例在 raw 开/关下
±1（模型接收端非其残差主体），真正的约束是 z-offset-v2 类近天顶光源夹具。

**④ ground 双例 158.7k 基线重定 + 漂移记档**：本轮四组测量（本树 raw 开/关、干净 HEAD、
2b031b82=终二八七渲染器内容恢复态）×默认配置 ground-shadow-fog 全部 **158,750**（hard-cutoff
158,790）位级一致。文档沿用的 140,431/140,596 基线列出自 终二八五~二八九 批次——其树携带
negsign 负号泄漏混合态（终二九三 定性），基线列与恢复后交付态不可比；终二九三 恢复后仅复测
sno 未复测 ground，+18.3k 实际自该时点已存在且未被察觉（后续条目仍以 ±100 噪声域口径沿用
旧基线）。**ground 双例现值 158,750/158,790 为恢复态真基线**；终二八九 "raw 轴 +18.3k" 的
定性需在真基线口径下复核（本轮 raw 开/关 ±1 证明 raw pass 与 ground 双例无交互）。

**⑤ 残余与下轮**：①sno 60.9k（0° 档）构成不变（漏影+光照 2.1k+软边 ~52k），shrawaz 逐
夹具 argmin 可再收（sno@−12=59,891 证明单夹具上限存在）；②z-offset-v2 对 −12° 的 +55k
敏感性值得单独定性（近天顶光源 × 方位旋转的极角钳制交互）；③家族 DirProp 系夹具
（munich 311.9 族/buildings-trees 120/160 族/front-cutoff 320/30 族等 ~60 夹具）在 0°
默认下的批量响应待复验（本轮测点均中性或改善，未见风险信号）；④shpcf/shnoff 旋钮族保留。

### §885 终二九九：DirProp 系 56 件家族双臂复验——raw 0° 默认维持（净 ≈−12.2k），buckingham-lod +54.7k 真回归记档；sno 残余定性=漏影 86% 方位不敏感（2026-09-14）

**① 家族双臂 A/B**（raw 0° 默认臂 famRaw0 vs shmodelraw=0 镜像臂 famMirror，同日同环境配对）：
56 件 DirProp+cast-shadows 夹具（model-layer 全量 + wireframe/instanced-rendering）。首轮
batch=2 会话被单件 DISCONNECTED 拖垮全会话（一件崩溃连坐同会话伙伴），batch=1 重试后
**34 件配对、22 件无数据**——无数据件=buildings-trees ×6 + front-cutoff ×8 + trees ×3 等，
全部 DISCONNECTED 且**所有历史结果目录均无产出记录**（终一九三 在案环境级崩溃族的同类，
非本轮回归；两臂对称崩溃）。

**② 配对结果（delta=raw0−mirror，px）**：
- 改善 9：multiple-extrusions-lod **−54,399**、hidden-extrusions-lod **−40,594**、
  buckingham-main **−11,230**、scale-munich-museum −5,680、z-offset-v2-lod −2,972、
  sno-lod −1,493、sno-main −1,193、collision-munich-museum −1,530、station-lod −1,095、
  MAPS3D-1159(-lod) −172/−157。
- 回归 4+1：**buckingham-lod +54,710（真回归，A 档两次采样 157,622/182,954 均远高于
  mirror 102,912；构成=D双暗 132k 过度阴影，误差主体从 mirror 态 C双亮 48.8k 翻转为
  raw 态 D双暗）**、model-shadow +10,454（两臂皆 D双暗主导的暗色调域，raw 轻度加深）、
  multiple-extrusions-main +1,862、scale-munich-lod +1,220。
- 中性 19：museum/museum-lod/griffith×2/port/station/hidden-extrusions-main/shadows-
  cutoff-range/tile-cover×4/instanced-rendering 等 ±0～±110（含多个位级 0）。
- **家族净 ≈ −12,234（改善）**——raw 0° 默认维持。

**③ z-offset-v2 双稳离群修正（方法论级发现）**：famRaw0 批 z-offset-v2 测得 290,213
（+54,427 疑似回归），但同配置多点采样 234,708/235,227×2/235,786 共 4 次全部 ≈235k
（=mirror 235,786 parity）——**shadow 状态跨运行非确定**（终二八二B 在案）的 upper
attractor 翻转（−12° 档单次 290,747 同吸引子；batch=2 会话高发、batch=1 全中低位）。
该"回归"改判中性。**教训：影子系夹具的跨批 A/B 必须同批配对 + 多点采样**，单批单样本
的 ±55k 级波动是双稳伪象非改动效应。

**④ sno 残余定性（raw 0° 档，双图双维分类）**：强误差（通道和>90）62,022 px 中
**A 漏影 53,395（86%）**（expected 影/我 lit，集中于下半幅行 320-512——塔身投影地面/
近景面未接收）+ B 多影 5,873 + C 双亮色调差 1,295（我方均匀偏暗 ~30/通道，光照域）+
D 双暗 1,459；软边带（和 20-90] ≈78k。**关键负发现：−12° 方位旋转对漏影零回收**
（53,886 ≈ 53,395），仅多影 −1.4k——漏影主体对方位角不敏感，属投影几何/深度比较域
（mgl createLightMatrix 源码级移植立项维持），shrawaz 旋钮只作用多影域。跨批基线漂移
同前轮记档：sno 镜像态本批 62,085/62,329 vs 文档 65,054/65,069。

**⑤ 下轮入口**：①buckingham-lod 过度阴影（D双暗 132k）——mgl 对该构型的影强调制/
接收端语义差异，按 part 分组统计错位像素归属（终二九三B 的窗排条带路径）；②model-shadow
暗色调域；③漏影 53.4k 的投影几何攻坚（shadow map 覆盖 vs 深度比较二分——profile 探针读
mapDepth<fragZ 占比可判）；④软边 78k 的 mgl 软影质感对拍。

### §885 终三〇〇：双探针轮——buckingham-lod 过度阴影 part 归属（91% 在未分 part 的 conflated tile 模型楼面）+ sno 漏影二分（62% 无遮挡体投影域 / 38% PCF 空邻域稀释）（2026-09-14）

**① 探针资产（本轮落地）**：
- `partdbg=1`（+MBSTYLE_PARTDBG）：模型尾部 main() 顶部按 `uMBPartId` 平色绘制
  （wall红/door绿/roof蓝/window黄/lamp品/logo青/none深灰），partId 由既有 per-draw
  onBeforeRender hook 从 `mesh.userData.__mbPart` 同步（part 材质为独立 clone 无竞态）。
  注意：绘制值经 colorspace/tonemap，离线解码需 sRGB 编码后调色板（线性值直接匹配失效）。
- `shdbg=11` profile 探针扩展：R=mapDepth/G=fragZ 不变，**B=选中图编码（255=raw
  cascade-0、168=镜像 cascade-0、84=cascade-1）**，采样按 mbInR→mbIn0→c1 真实选择链。

**② buckingham-lod 过度阴影 part 归属（D双暗 132k）**：
- **121k（91%）在未分 part 的 conflated tile 模型楼面**（partdbg 平色 none 证实=patched
  模型材质、partId=0）——三方亮度 exp=143 > mirror=115 > raw0=82：**镜像态本已欠亮 28，
  raw 轴再翻倍至 61**（99% 样本我方更暗，mean cur−exp≈−56）——过度阴影=tile 楼面的
  raw 轴影覆盖率/影深超 expected。
- palace 自身 parts：door(id2) **100% D**（10.8k）、lamp 27%、wall（红 52k px）**0%
  D**（墙面干净）——palace 残差集中在 door/绿件与小件，墙体无恙。
- 本 fixture 的 +54.7k 回归主体=tile 楼面域，非 palace 几何；后续若做 per-fixture
  shmodelraw 关断或 tile-模型专用轴，目标即此 121k。

**③ sno 漏影 53.4k 二分（shdbg=11 profile，probed 3,903 px / 漏影子集 2,022）**：
- 覆盖缺失（mapDepth 空 ≥250）= **0**；有遮挡体在前（mapDepth<fragZ）=765（38%）；
  **无遮挡体在前（mapDepth>fragZ，接收器最近）=1,257（62%）**。
- 定性：**漏影主因（62%）= shadow map 中该投影位置无遮挡体**——caster 投影/光轴几何域
  （源码级移植立项维持）；38% 为 PCF 深度平均的**空邻域稀释**——空 texel 解码 r+g/255
  =1+1=**2.0**（白清屏 hi=lo=255），5-tap 均值被抬过 fragZ 翻 lit；mgl 语义是 lit-flag
  平均（0/1）而非深度平均，边缘软化行为不同——记档为 PCF 语义差（可能与软边 78k 残差
  同根，修法=平均 lit flag 或空 texel 记 1.0）。

**④ 探针覆盖缺口（记档）**：sno 的 raw0-vs-mirror 差异像素 13,317 全部**未经 shdbg=11
  绘制**（probe==raw0 位级），但镜像 cascade 深度图转储**两配置逐位一致（0 差异，污染
  排除）**，且其中 raw0 侧 7,434 更近 expected（样本像素 raw0==expected==235 精确）——
  即这些像素确实消费 raw 图（净改善载体）却绕过了 probed 分支。drawlog 证实模型=4 个
  patched 材质（shu=Y，vn=29,148×4）。疑似=conflated tile 模型材质的 uMBShIntensity
  同步/heal 路径与探针快照相斥，机制未决——探针债务，下轮可用 partdbg（uMBPartDbg 门
  控不依赖 intensity）验证其材质归属。

**⑤ 下轮入口**：①tile 楼面过度阴影（buckingham 121k）——其 expected 亮度介于两档
  之间，先验上 raw 轴影覆盖过宽，可试 tile 模型专用 shmodelraw 关断或 shrawaz 微扫；
  ②PCF 空 texel=2.0 稀释修正（lit-flag 平均）A/B——38% 漏影 + 软边 78k 同域；
  ③sno 探针覆盖缺口：partdbg 复用于 sno 验证 13.3k 像素的材质归属。

### §885 终三〇一：lit-flag PCF A/B 判负回退——空 texel 稀释实为承重的软影梯度；buckingham tile 关断评估暂缓（双稳淹没）（2026-09-14）

**① lit-flag PCF A/B（验收失败，回退）**：
- 实现：模型尾部 5-tap **深度平均 → per-tap smoothstep 比较（±0.0005 窗）平均**
  （mgl shadow_occlusion 语义），两分支×3 cascade 全量替换（TS 101=101）。
- 结果：sno 60,892 → **66,246（+5,354）**——劣于基线亦劣于镜像态（62,085）；不达
  ≤60,892 验收线。**回退**（git checkout 模型渲染器，sno 复实测 **60,892 位级恢复 ✓**）。
- 定性修正：终三〇〇③的"空 texel=2.0 稀释"在当前标定下**不是 bug 而是承重的软影
  梯度**——它恰好把边缘过渡做成 expected 的模糊宽度，"修成语义正确"反而偏离参照。
  与 终一百六十八 的"参照 AA 语义漂移"同类：calibrated accident 承重。深度平均为
  交付态，PCF 形态域关闭。

**② buckingham tile 楼面 per-fixture shmodelraw 关断评估（暂缓）**：
- 现有数据：lod raw0 {157,622, 182,954} vs mirror {102,912}（损 54.7k+）；main
  raw0 {180,128} vs mirror {191,358}（益 11.2k）——pair 净 mirror 优 ~43.5k；但
  munich 族方向相反（multiple-extr-lod −54.4k、hidden-extr-lod −40.6k 益）。
- harness 无 per-fixture 旋钮（karma args 全局生效）。可行语义门=「raw 图仅服务
  part-split 材质（uMBPartId>0），未分 part 的 tile 模型回退镜像链」：buckingham
  pair 预期回收 ~40k，sno（全 part 分）预期不变。**但 buckingham-lod 单配置双稳
  摆幅即 157k↔183k（25k），淹没该量级判定**。
- 结论：**暂缓**。前置=影子系夹具多点采样协议（≥3 样本/臂/夹具，终二九九③）下的
  专项 A/B；本lit-flag轮顺带证据：buckingham 对在 PCF 形态改动下与历史值位级一致
  ——其输出对模型尾部 PCF 形态不敏感（双稳/覆盖路径主导），像素级 A/B 需先稳态。

**③ 守卫**：lit-flag 实验未提交（工作树已回退至 终三〇〇 交付态）；守卫夹具无
cast-shadows 结构性不可达，famRaw0 本会话已验证 +0（q-s 2,434/castro 184,292/
high-zoom 4,930/castro-lighting 11,776）。

**④ 下轮入口**：①buckingham tile 专项=多点采样协议下的 shmodelraw/shrawaz 双臂
（≥3 样本/臂）；②sno 13.3k 探针覆盖缺口（partdbg 验证材质归属，不依赖 intensity
门控）；③PCF 形态域随本轮关闭——软边 78k 需另寻 mgl 软影质感对拍入口（mgl-shot2）。

### §885 终三〇二：buckingham 多点采样双臂——"+54.7k 真回归"证伪（多稳态抽奖与配置无关）；sno 13.3k 探针缺口材质归属=patched 模型材质（2026-09-14）

**① buckingham 多点采样（≥3 样本/臂/夹具，同日双臂）**：
- lod：raw {102,912×1, 157,622×3}，mirror {102,912×1, 157,622×2}——分布相同。
- main：raw {180,128×2, 191,358×1}，mirror {180,128×1, 191,358×2}——分布相同。
- **取值与配置无关**：~4 个离散吸引子（102,912/157,622/180,128/191,358，间距 25-35k），
  两臂同分布。**终二九九 的"buckingham-lod +54.7k 真回归"判定证伪**——那是多稳态
  抽样差，非 raw 轴效应；"per-fixture shmodelraw 关断"命题随之消解（无回归可修）。
- 吸引子定性（lod 图 diff）：102k→157k 态 = **全局性变暗**（195k px 变暗 vs 54k 变亮，
  差异处均值 −15 RGB，顶 2/3 集中）——疑为 ground quad/影 overlay 的状态竞态
  （终二八二B 非确定性的形态刻画），根因未决。

**② 对 终二九九 家族结论的重定性**：
- 不可信（多稳态抽样）：buckingham 对 ±54.7k/±11.2k、multiple-extr-lod −54.4k、
  hidden-extr-lod −40.6k、scale-munich −5.7k、collision −1.5k 等单样本大值。
- 可信（跨批位级稳定）：sno 主/lod −1,193/−1,493（60,892/60,836 三批位级复现）、
  MAPS3D-1159(-lod) −172/−157、z-offset 三件套（port/station 位级 0、v2 modal 中性）、
  museum/griffith/instanced 位级 0。
- **raw 0° 默认的可信净收益 ≈ −1.5k（sno+MAPS3D），大额项待多点采样复核**——默认
  维持（可信子集无回归证据），munich 大额改善降级为"待复核"。

**③ sno 13.3k 探针覆盖缺口材质归属（partdbg 复用）**：
- **13,317/13,317 全部被 partdbg 绘制**（part 图 vs raw0 变化像素全覆盖）——材质归属
  定案：**patched 模型尾部材质**（主色 wall 红 (255,38,38)、window 黄 (255,255,38)，
  sRGB 编码后）。
- 遗留机制问题：同一材质在 shdbg=11（intensity 门控）下未绘制 → 当时 uMBShIntensity
  读 0，但其渲染随 raw 状态变（差 ~100 亮度级）——intensity 同步/门控路径与 raw 消费
  的时序矛盾未决，记档探针债务（复现入口=shdbg=11+partdbg 同跑，双门控联合着色）。

**④ 下轮入口**：①多稳态根因（ground quad/影 overlay 状态竞态）——若修复，家族测量
噪声（±30-90k）大幅收敛，是影子系 A/B 可信度的前置；②munich 大额项（multiple-extr-
lod/hidden-extr-lod）多点采样复核（≥3/臂）；③sno 漏影 62% 无遮挡体投影域（mgl
createLightMatrix 源码级移植）维持主攻方向。

### §885 终三〇三：munich 多点采样复核——multiple-extr-lod −54k 坐实（分布完全分离）、hidden-extr-lod 双稳中性；settle 竞态假说阴性（2026-09-14）

**① munich 大额项多点采样（≥3/臂，同日）**：
- **multiple-extrusions-lod：raw {63,289×2, 117,688×1} vs mirror {117,688×3}——分布
  完全分离（raw 最大值 < mirror 最小值），raw 0° 真配置改善 ≈ −54k 坐实**（与
  famRaw0 65,024 / famMirror 119,423 跨批一致）。
- hidden-extrusions-lod：raw {90,308×1, 49,435×2} vs mirror {90,023×2, 49,362×1}——
  双稳两吸引子 {49k, 90k} 两臂同分布，**终二九九 的 −40.6k 为抽奖，中性**。
- **raw 0° 默认的可信净收益更新 ≈ −55k**（sno −1.2k×2 位级复现 + MAPS3D −0.3k +
  multiple-extr-lod −54k 坐实；hidden 中性）——默认决策强化。

**② settle 竞态假说检验（阴性）**：新增 `settle=<n>` 旋钮（默认 3=历史行为不变），
settle=8 ×2 实测 buckingham-lod 位级一致 182,954——仍为 settle=3 时代的吸引子之一，
未收敛也未新增态。**多稳态根因不在 settle 帧数**（候选收窄：caster 注册时序 vs 深度
pass、ground quad 首编译竞态、引擎瓦片挂载配额）。

**③ 工具资产**：①settle 旋钮 + MBSTYLE_SETTLE 透传；②shadow-depth-canvas 转储携带
`casters`/`frame` 计数（吸引子↔加载状态关联用），触发帧放宽 60→30/60（原 60 在短
settle 序列不触发——本轮 sA 臂空转教训；sA1 无结果=首会话启动崩，与代码无关）。

**④ 下轮入口**：①多稳态根因——用 30 帧 caster 计数转储做吸引子↔caster 数关联
（buckingham-lod ×3 即可判）；②multiple-extr-lod −54k 已坐实可计入交付账；
③sno 漏影 62% 无遮挡体（mgl createLightMatrix 源码级移植）维持主攻；④软边 78k 的
mgl-shot2 软影质感对拍。

### §885 终三〇四：多稳态根因侧袭——真根因=shadow-intensity 缺省解析 `?? 0` 使 ~百级 cast-shadows 夹具整条阴影链被禁用；对齐 mgl spec 默认值 1 并落地（2026-09-14）

**① 排查链（buckingham-lod ±30-90k 多稳态 → 阴影禁用实锤）**：
- casters 计数/时序转储三连零命中 → 复查发现 POST 仍被 `__rc===60` 双重门控（外层触发
  放宽了、POST 没跟上）——修正并新增 `shdumpseries=1` 旋钮（每 5 帧 ≤30 POST 深度图+
  casters/frame 时序）。
- shuv-matrix 探针（120 帧无条件触发）读出 buckingham-lod 模型材质：**valid=true 但
  intensity=0、matrix=IDENTITY**——阴影采样关闭但材质 patched；门控三元诊断
  （slInt/use3D）：**slInt=None、use3D=true** → `shadowLightState` getter 的第三门
  `m_shadowIntensity <= 0` 命中。munich multiple-extr-lod 同样（intensity=0, slInt=None）。
- 根因：`MBEnvironmentManager` 解析 `m_shadowIntensity = Number(p['shadow-intensity']
  ?? 0)`——**mgl style-spec 的默认值是 1**（dist 铁证：`"shadow-intensity":
  {"type":"number","default":1,"minimum":0,"maximum":1}`）。凡 cast-shadows:true 但未
  显式写 shadow-intensity 的样式（buckingham/munich conflation 族、trees 族、building
  族等 ~百级），mgl 渲染全强度阴影而我们整条阴影 renderer 禁用。

**② 修复与验证**：`?? 0 → ?? 1`（TS 101=101）。
- buckingham-lod：**阴影链首次激活**（slInt=1/intensity=1/has1=1/map1Set=true），
  mismatch 167,520=首个有阴影语义的测量（旧多稳态区间 102,912-191,358 为无阴影
  tile 抽奖）。
- sno：**60,892 位级不变**（显式 shadow-intensity:1.0 下默认值惰性）——锚点零回归。

**③ 结论级修正（连续三轮的量化结论重审）**：
- 终三〇二 "multiple-extr-lod −54k 坐实" **再次证伪**——该夹具阴影 renderer 同样禁用，
  shmodelraw 惰性，分布分离是 tile 抽样巧合（新样本 63,424 落回 raw 侧区间）。
- buckingham/munich 的 ±30-90k 多稳态=**非阴影的 tile 加载状态抽奖**（引擎瓦片挂载
  时序），与阴影配置无关；根因在引擎 settle 语义，立项另攻。
- **凡 cast-shadows 且未显式写 shadow-intensity 的夹具，本修复前的全部基线作废**
  （阴影从未渲染）；终二九九/三〇二 的家族账以"显式 shadow-intensity 夹具"子集为准
  （sno −1.2k×2 位级、MAPS3D −0.3k、port/station 位级 0）。

**④ 下轮入口**：①阴影激活后的家族重基线（cast-shadows 无显式 intensity 的 ~百级
夹具全量重测——expected 含阴影，方向预期改善）；②mgl shadow-intensity=1 下重跑
sno 家族锚点+守卫（本批已验 sno 不变）；③sno 漏影 62% 无遮挡体（createLightMatrix
源码级移植）与软边 78k（mgl-shot2 对拍）主攻维持。

### §885 终三〇五：阴影激活后家族重基线（43 件）——museum 族 +79k 显性化为影子几何新靶；锚点/守卫五连位级 +0（2026-09-14）

**① 锚点+守卫复验（siFamGuard 批）**：sno **60,892 位级不变 ✓**、castro 184,292、
high-zoom 4,930、q-s 2,434、castro-lighting 11,776——**五连全部 +0 位级**（无
cast-shadows 夹具结构性不可达，与预判一致）。

**② 家族重基线（siFam 批 43 件终账，首个阴影语义测量）**——filter 前缀匹配连带 terrain/lines-elevated 族 14 件（97,922-129,121 区间首测）与 sd-hd-tunnel 13,529;：
- 恶化（影子几何未校准的可测显性化）：**munich-museum 119,292→198,237（+78,945，
  最大新靶）**、scale-munich-lod 252,346→271,633（+19,287）——无阴影基线只含
  exp影/我lit 单向误差，激活后错误位置影产生双向误差，属激活初期预期形态。
- 改善：buckingham-lod 167,520→157,313（−10,207）、collision-lod 45,374→43,871
  （−1,503）、buckingham-main 178,885（首个阴影测量）。
- 位级不变：trees-zoom-based-scale 184,429、trees-shadows-terrain-high-altitude
  427,033（阴影对画面无可测贡献——影斑离屏或覆盖为零）。
- 首测新基线：building 族（facades 119,174/with-shadows 14,742/facades-no-shadow
  120,857/wireframe 120,128）、3d-intersections（roads-depth 1,209/junction 17,200）、
  lighting-3d-mode/shadow 族（fill-extrusion 44,100/terrain 112,462/aabb 94,007/
  translucent 94,976/vertical-scale 63,644/draw-layer-slot 85,776）、elevated-line
  （join-none/overlap）、hd-sd（elevated-hd-sd 28,689×2）、sd-hd（28,689/66,950）、
  color-theme trees-monochrome 28,467、appearance/brightness 588、mbx-shadows
  161,881/194,550、terrain/lines-elevated。

**③ 判定**：`?? 1` 修复语义正确（mgl spec 默认），激活初期净账混合是**影子几何
校准债的显性化**——museum 族 +79k 正是 createLightMatrix 源码级移植主攻的新量化
靶标；122 件受影响夹具的全量重基线待续（本轮代表性 27 件）。

**④ 下轮入口**：①munich-museum +79k 影子几何攻坚（createLightMatrix 源码级移植
的首个量化靶）；②软边 78k 的 mgl-shot2 软影质感对拍；③剩余 ~95 件受影响夹具
分批重基线；④buckingham/munich tile 抽奖（引擎 settle 语义）独立立项维持。

### §885 终三〇六：munich-museum 双探针——误差=影图整体错位（A漏影142k/B多影80k 双向对称±45），88%落在未分 part 的 tile 楼面；激活后跑间方差 ±2.3k 记档（2026-09-14）

**① 探针执行**：shdbg=11 首跑崩（DISCONNECTED，同 sA1 类）；重跑成功且 filter 连带
museum-lod。partdbg 正常。casters 时序转储首获数据：**frame 60 处 casters 165→270**
（tile 模型渐进注册直改 shadow map 内容）。

**② 双向误差构成（阈值 luma 160）**：
- **A 漏影 142,436 px**（exp 影/我 lit，exp 比我暗 44.4）
- **B 多影 80,448 px**（exp lit/我影，exp 比我亮 45.5）
- **双向幅度对称（±44/45）= 影图整体错位签名**——非缺影非多影单边问题，是投影/
  光轴错位把整幅影图搬了家，createLightMatrix 源码级移植定性再证。

**③ part 归属（partdbg 色相分类）**：
- A 漏影：**88%（125k）在灰/未分 part 的 tile 楼面**，红墙 17,216、蓝/黄微量。
- B 多影：52,092 灰 + 21,144 红墙 + 7,074 蓝。
- 结论：museum 的影子几何债主体也在**未分 part 的 tile 模型楼面**（与 buckingham
  一致），palace 红墙双 向各 ~2 万。

**④ 测量纪律记档**：阴影激活后 museum 跑间方差 ±2.3k（198,237 / 200,573 两样本）、
casters 注册 165→270 印证 settle 竞态进入 shadow map 内容——影子系单样本结论一律
降级为指示性；profile 探针的 sRGB+tonemap 双重编码使 B 通道选择码偏移（180-200 散布），
精确解码需先标定各夹具输出链。

**⑤ 下轮入口**：①createLightMatrix 源码级移植（影图错位 ±44 双向对称的主攻，
museum +79k 为量化靶）；②软边 78k 的 mgl-shot2 对拍；③tile 抽奖 settle 立项维持。

### §885 终三〇七：createLightMatrix 源码级提取完成（Ar/ao 全文解码）——首次 texel-snap 移植判负回退，公式资产入档（2026-09-14）

**① 提取成果（mgl dist 167cfc73 时代产物，`computeCascadeTileMatrices`/`Ar`/`ao` 全文解码）**：
- **ao = shadowDirectionFromProperties**：direction 属性 {x,y,z}（内插笛卡尔单位向量）
  → c5 恢复 [模长, 方位角°(atan2(−y,−x)+90), 极角°(acos(z/n))] → **极角 clamp [0,75]°**
  → c8 重建笛卡尔并归一。即 mgl 光轴=极角钳制 75° 的笛卡尔方向（与本轮 SHDIRALT raw
  分支同构，含 75° 钳制）。
- **Ar = createLightMatrix(t, dir, near, far, resolution, elevation)**：①k=√(1+aspect²)·
  tan(fovX/2)，最小视锥球公式（centerDepth m / 半径 g——与我方现有实现同式）；②球心=
  getCameraToWorldMercator·(0,0,−m/worldSize)（mercator [0,1] 空间）；③**光相机=
  FreeCamera{position=球心, setPitchBearing(polar, −bearing)}**，bearing=atan2(−dx,−dy)、
  pitch=acos(dz)——罗盘式相机（非 lookAt(center∓dir)）；④**正交投影 near=
  min(−2·mercatorZfromZoom(17)·worldSize, −2R)（负 near，相机身后大余量）**，
  far=(R+elevation·pixelsPerMeter)/dir.z，左右上下=±R（R=半径·worldSize 像素）；
  ⑤edge insets 非平凡时按视锥角点扩 R；⑥R·=resolution/(resolution−1)；
  ⑦**texel snapping**：M=L·P_center（P=球心 floor 1e6 量化×worldSize），M+=res/2，
  F=floor(M)，z=M−F−1/(res/2)，L'=translate(z)·L；⑧cascade：near/far 分档
  c0=(height/50, 1.5·ctcd)、c1=(1.5·ctcd, 3·ctcd)，cascadeCount=2，
  **shadowMapResolution=2048**（我方 1024），u_shadow_bias=[6e-5,.0012,.012]
  （normalOffset=3 时）/ [36e-5,.0012,.012]，u_shadow_normal_offset=[1,e,e]→按瓦片
  [1, s·c(zoom), l·c(zoom)] 缩放，u_fade_range=[.75·far_last, far_last]（均与我方一致）。
- 附加语义：drawModels 中 `model-receive-shadows:false` 会**整体关闭 shadow renderer**
  （h.enabled=false——与 终三〇四 的 intensity 门控并列为阴影禁用第二通道）。

**② 首次移植尝试（texel snap）判负回退**：按⑦实现 shtexsnap 旋钮（镜像 c0+raw R0
双矩阵 snap），museum 198,237→**180,051（−18k 改善）**但 **sno 60,892→113,166
（+52k 灾难）**、museum-lod +5.6k——压缩码 e.av/e.aW 的标量/矢量语义与 e.aG translate
在 clip 空间的作用点无法从产物确证，移植语义出错。**已回退**（sno 复实测 60,892
位级恢复 ✓）。

**③ 资产与下轮**：①本轮公式提取全文存 /tmp/Ar_body.txt、/tmp/Ar_callsite.txt（临时），
建议下轮先落 `Ar_ref.ts` 参考实现（含 c5/c6/c8/Ii.setPitchBearing/getWorldToCamera/
getCameraToClipOrthographic 的逐一定价）后再动引擎；②texel snap 与 2048 分辨率、
罗盘式光相机为三大候选改进（museum −18k 的信号值得追）；③sno 锚点 60,892 维持。

### §885 终三〇八：辅助函数全定价 + texel snap 修正版落地（中性，旋钮默认关）——上轮 +52k 灾难真因=av 是标量乘法（2026-09-14）

**① 辅助函数全定价（dist vec/mat 模块定义体逐一定价）**：
- **`av=F(e,t,r)=t[i]*r`——标量乘法**（不是 vec 加法！）：上轮 snap 灾难（sno +52k）
  的真因=把 `av(M,M,O)` 读成"加 O"，实为 **clip×O=clip×(res/2)→texel 单位**；
  同理 getWorldToCamera 的 `av(n,n,−worldSize)`=位置×(−worldSize)（mercator 世界
  翻转惯用法）。
- 其余：aW=vec3 减法、cA=vec3 减法、aG=gl-matrix translate（out=a·T）、aC=identity、
  aE=invert、aP=multiply、aK=ortho（e[0]=−2/(l−r) 标准）、aL=z/mercatorScale(lat)、
  c6=vec3 构造、c8=st 球坐标 [len,az°,pol°]→笛卡尔（**az+90° 惯用法确认**）、
  aI=fromQuat、aH=共轭、Ti(pitch,−bearing) 四元数、wi=quat 合成变换。

**② texel snap 修正版 A/B（shtexsnap 旋钮，默认关）**：
- 正确公式：Mtexel=clip×(res/2)；F=floor(Mtexel)；z_clip=−fract(Mtexel)×(2/res)；
  L'=translate(z_clip)·L。
- 结果：sno **60,781（−111）**无爆炸 ✓、museum 199,980（+1,743，±2.3k 跑间方差内）、
  museum-lod 182,933。**像素中性**——上轮 museum −18k 是错误 snap 的侥幸抽样。
- 落地：shtexsnap 旋钮默认关（交付态位级不变），mgl 语义正确性保留待影图错位
  主攻验收时复用。

**③ 三候选进度**：texel snap ✓（中性，已落地旋钮）；2048 分辨率（需联动 map 尺寸+
全部 texel 旋钮÷2，待专项）；罗盘式光相机（需 Ii 相机移植，最大项，待专项）。
**④ 下轮入口**：①罗盘式光相机移植（pitch=polar/bearing=atan2(−dx,−dy)——影图错位
±44 双向对称的直接候选，museum +79k 靶）；②2048 分辨率专项；③剩余 ~80 件重基线。

### §885 终三〇九：罗盘 roll A/B 中性（museum −2k/sno −87）——roll 惯例候选证伪；2048 分辨率评估留档（2026-09-14）

**① shcompass=1（罗盘 roll，mgl Ti(pitch,−bearing) 定价为最短弧四元数）A/B**：
- museum 198,237→**196,226（−2,011）**、sno 60,892→60,805（−87）、museum-lod 首测
  182,903——**全部在跑间方差边缘**，roll 惯例候选证伪：museum ±44 双向错位不是
  lookAt-up 投影 vs mgl 北上 roll 的差异所致。
- 旋钮保留（shcompass=1 / MBSTYLE_SHCOMPASS，默认关）。

**② museum ±44 双向错位的剩余解释（收窄）**：roll 排除后，错位只能来自
createLightMatrix 的**帧与覆盖语义**——mercator [0,1] 空间（含 elevation 项、
edge insets、mercatorZfromZoom(17) 负 near）与我方 RTE 米帧的本质差异。即
**Ar_ref 全帧移植为唯一路径**（多轮专项：c5/c6/c8/Ii 相机定价已完成一半，
剩 mercator↔RTE 帧映射推导）。

**③ 2048 分辨率专项评估（未执行，留档）**：改动面=深度画布/DataTexture/readPixels
尺寸（`size` 常量已参数化）+ 模型尾部 PCF texel 分母（/1024→/res）+ 地面 quad
uMBShadowTexel + getShadowUniforms texel1——约 6 处；验收=museum/sno 影缘量化带
变化。与 texel snap 组合效果优先（mgl 即 2048+snap 组合）。

**④ 下轮入口**：①Ar_ref 全帧移植专项（帧映射推导→museum +79k 靶）；②2048 分辨率
+texel snap 组合 A/B（③的 6 处改动清单已列）；③剩余 ~80 件受影响夹具分批重基线。

### §885 终三一一：运行时帧探针落地 + mgl getCameraToWorldMercator 真语义——κ 各向异性假设证伪（A/B 全中性，旋钮默认关）；museum-lod 本机新吸引子 122.9k（2026-09-14）

**① 帧探针（shfrmprobe=1，交付保留）**：MBShadowRenderer 帧稳态 dump RTE 相机矩阵/
geoCenter/zoomLevel + 场景轴±1000/10000 单位 → geo → mgl mercator 点样本（console +
mb-probe-dump 双通道）。museum 实测：zoom 18.7、ctcd=564.63、canvas 1024²、fov 36.87°
（aspect 1）、场景帧 x=东/y=北/z=上（RTE 原点=眼点）；场景→mercator 局部仿射实测
线性部分 = 水平 2.49532e-8/单位（各向同性）、垂直 3.73885e-8/米，且 ±1000/±10000
严格线性 ✓。

**② mgl 真语义修正（ArRef.ts 头注待更新）**：dist 逐字定价——
`getCameraToWorldMercator() { return this._transform; }`：**直接返回相机变换矩阵本体**
（[R|position_mercator]，R=orientationFromPitchBearing = gl-matrix
rotateZ(−bearing)·rotateX(−pitch) 后乘序，position 在 mercator [0,1] 空间），不是
"像素桥"复合矩阵。且解析证明：mgl 罗盘式光相机（setPitchBearing(polar,−bearing)）
的屏幕 up 向量与引擎 lookAt(center+dir, up=(0,0,1)) 的 up **逐分量恒等**（任意前向
下 (sin b·cos p, cos b·cos p, sin p) ≡ lookAt 投影）——终三〇九 roll 中性获得解析
证实，roll/朝向彻底出列。

**③ κ 各向异性假设证伪（shmcenter 旋钮，默认关）**：探针揭示引擎场景帧为等距柱状
坐标（水平 1 单位 = cos(48.13°)≈0.669 真米，垂直 1 米，κ=1/cos(lat)≈1.499）；mgl
mercator 帧保形。假设：引擎各向同性摆光球心相对 mgl 系统性错位（±44 对称签名）。
实现：center ∝ (f.x, f.y, κ·f.z)（κ 运行时由 projection 采样）。A/B 全谱中性：
door-light-munich-museum 198,237→198,973（±2.3k 方差内）、sno 60,892→60,850（−42）、
守卫五连全 ±42 内（castro 184,294/high-zoom 4,928/q-s 2,417/castro-lighting
11,779）、collision-munich-museum 42,466→44,925（+2.5k 小幅恶化）。**判定**：引擎
帧内全管线（模型放置/相机/深度 pass/接收器）自洽，各向同性摆光不产生错位——
影图 ±44 错位的候选再减一。

**④ 本机重基线新数据（Linux chrome-headless-shell 149）**：
- **museum-lod 吸引子漂移**：landmark-part-styling-door-light-munich-museum-lod
  本机基线 **122,911/122,921（两位级一致样本）**，≠ 档记 182,933/182,903（终三〇八/
  〇九 批）——多稳态家族（tile 抽奖）的另一吸引子，κ 下 122,921 位级不变。与档记
  数字对账前必须先重采本机基线。
- collision-munich-museum 基线 42,466 / -lod 45,454（首测）；z-offset-v2 κ 下
  261,084（基线待采）；sno 家族与档记吻合（±42）。
- 基建：`testtimeout=<ms>` 通用单测超时参数落地（door-light 族在 Linux SwiftShader
  超 180s karma 默认超时被中止→IBCT 结果不 POST，runner MBSTYLE_TESTTIMEOUT 透传；
  本批全部 A/B 用 600000）。

**⑤ 下轮入口**：①2048 分辨率 + texel snap 组合 A/B（6 处改动清单已列，mgl 即
2048+snap 组合——错位候选仅剩覆盖语义/near/elevation-far/ insets 与光方向本身）；
②Ar_ref 桥接按②真语义重写（_transform 直接可从引擎相机位姿构造，成本已大降）；
③museum-lod/受影响家族本机重基线分批。

### §885 终三一二：shres 全管线分辨率旋钮 + 2048+texel snap 组合——museum −12.2k（首个超方差真实改善），锚点全中性，默认关落地（2026-09-15）

**① shres=<n> 旋钮（交付保留，默认 1024 位级不变）**：mbShadowRes() 单点读
`__mbShadowRes`，全管线消费——深度画布/独立 RT/readPixels/DataTexture（镜像+
cascade-1）、roundingMargin res/(res−1)、地面 quad uMBShadowTexel、texel1、texel
snap 半分辨率（O=512→res/2，镜像+raw）、模型尾部 5-tap PCF texel 分母
（MBModelRenderer 6 处）、fill 接收器 uMBShadowTexel1（MBMaterialPatchManager）。
默认 1024 时全部表达式数值恒等（1/1024、1024/1023、512 等逐点核对）。

**② 2048+snap 组合 A/B（shres=2048 shtexsnap=1，mgl 即 2048+snap 组合）**：
- **door-light-munich-museum 198,237→186,069（−12,168）**——影图错位主靶上首个
  超出 ±2.3k 跑间方差的真实改善（对比：shtexsnap 单独中性、2048 未单测、κ 中性）。
- **sno 60,892→60,552（−340）**——终三〇八的 snap +52k 灾难未复现（修正 snap 语义
  = clip×res/2 → fract → −fract×2/res），锚点安全。
- castro-theater-quantization 184,294 **位级不变**、castro-lighting 11,779（+3）、
  z-offset-v2 261,119（+35 方差内）。
- 未测：museum-lod/collision/z-offset-v2-station 等（下轮补）。
- 基建坑：chunked runner 只透传 MBSTYLE_EXTRA_ARGS（MBSTYLE_SHRES/SHTEXSNAP/
  TESTTIMEOUT 均被吞）——sno2 批以 EXTRA_ARGS="shres=2048 shtexsnap=1
  testtimeout=900000" 重跑生效（sno1 批数据实为默认态，反证默认位级一致性）。

**③ 判定**：2048+snap 组合为影图错位候选中首个正信号；机制=影缘量化带位移
（2048 texel 减半 + snap 对齐 mgl 影缘采样网格）。迁移决策留待：①补 museum-lod/
collision/z-offset-v2-station 家族面；②2048 单独（无 snap）隔离归因；③全家族
重基线成本评估（2048 下单 fixture ~13-15 min，全量 ~百件不现实——考虑按家族抽靶）。

**④ 下轮入口**：①2048 单独 vs 2048+snap 归因（museum 一靶即可）；②museum-lod/
collision 家族面补测；③Ar_ref 桥接按 _transform 真语义重写（终三一一②）；④若
家族面干净→迁移决策（默认 2048+snap 或按投影/夹具面开）。


### §885 终三一三: 2048 vs snap 归因完成 + 家族面 N≥2 补测——buckingham-lod −7.9k 逐位坐实（149,441×2，崩溃非确定性已定性+单跑重试协议）；scale 回归虚惊（默认臂自身漂移）；museum-lod 2048 单独即等效；sno 锚点二次确认；ArRef 桥接按 _transform 真语义重写并过 gl-matrix 逐位验证（2026-09-15）

**① 归因（2048 单独 vs 2048+snap，museum 族 2×2 矩阵）**：
- door-light-munich-museum：default 198,237/200,573/198,973（N=3）｜2048-only
  **196,204**（N=1）｜snap@1024 199,980（终三〇八，N=1）｜2048+snap
  **186,069/194,916×2/200,653**（N=4，E+J 批；194,916 两次逐位）——2048+snap
  中位数 194.9k vs default 199.0k ≈ **−4k 方向性改善但与 default 带重叠**
  （终三一二的 −12.2k 单样本 headline 下修为带内方向性；tile 抽奖使同 config
  跑间达 8.8k+，影子系 N≥2 纪律 reaffirm）。
- museum-lod：2048-only **179,400** ≈ 2048+snap **179,389**（Δ=11 逐位级）/
  **182,934×2（E+J 逐位收敛）**——**museum-lod 上 2048 分辨率单独即完成全部
  工作，snap 中性**；首采 249,505 为 tile 抽奖极端尾（历史吸引子带
  122.9k-189.5k 之底以 179.4-182.9k 为新收敛值）。
- 判定：**收益=2048×snap 交互（museum 本体，方向性）+2048 分辨率本身
  （museum-lod，收敛且带底）**，两者机制不同；均非大幅对齐跳跃——影图 ±44
  错位主残差仍在（ArRef 全帧接线才是正解，见③）。

**② 家族面 @2048+snap（N≥2 补齐，Chrome131 ChromeHeadless）**：
- sno 锚点 **60,552/60,519（N=2，−340/−373 vs 60,892）**——安全二次确认。
- collision 42,456（带 42,403-42,466）/ collision-lod 45,264（与 famMirror
  逐位相等）中性；castro 184,294 位级不变、z-offset-v2 261,119（+35，终三一二）。
- **buckingham 178,205×3（D+K2+N 逐位收敛）** vs 178,885/180,128 → 中性偏正。
- **buckingham-lod 149,441×2（D+N 逐位相同）vs 157,313/157,622 → −7.9k 坐实**：
  N≥2 已巩固（K/K-retry/K2 三连崩溃后 N 批单跑重试协议成功，见④③），与本轮
  家族面最强正信号，与 museum 方向性同向。
- **scale-munich-museum：2048+snap {254,991/254,900}（N=2 两位级收敛）vs
  default {231,315(famRaw0, N=1)/259,102(M 批)}——+23.6k"回归"虚惊**：default
  臂自身多稳态（231k→259k 漂移），2048+snap 落带内且更收敛（254.9k×2）→
  **中性**；scale-munich-lod 272,324 ≈ 上吸引子 271,633（+691）中性。
- museum-terrain 2048-only 首测 240,634（家族多稳态 192.8k/238.1k，指示性）。

**③ ArRef 桥接重写（终三一一②入口，惰性资产，无 import）**：
- `orientationFromPitchBearingRef`：dist quat 链 verbatim（identity→rotateZ(−b)
  →rotateX(−p)），**对 node_modules gl-matrix@3.4.3 五组位姿逐位一致**。
- `cameraToWorldMercatorRef(pose)`：FreeCamera._transform=[R|position_mercator]
  直接由 {position, pitch, bearing} 构造——即 getCameraToWorldMercator 桥，
  终三一一②"直接可从引擎相机位姿构造"落地。
- `getWorldToCameraRef`：verbatim 四步（conjugate→translate(−pos·worldSize)→
  y-row flip→z-column×ppm），与 gl-matrix 逐步组合最大差 2.2e-5（Float32 舍入
  量级）；**输入是世界像素（x/y=mercator×worldSize）**——旧手搓 lightCameraView
  退役。
- snap 尾段修正：+fract·(2/res) → **−fract·(2/res)**（对齐引擎 shtexsnap 已
  A/B 语义；ArRef 旧草稿符号笔误）。
- **up 恒等的显式形式（对 终三一一② 的补全）**："逐分量恒等"须经
  scene→mercator 的 y 翻转（引擎场景 y=北 vs mercator y=南）：mgl_up =
  (y0, −y1, y2)·lookAt_up——数值验证成立，帧映射 y 翻转语义由此显式化。
- selfCheck 扩展全绿：c5/st round-trip、quat vs closed form、up-identity（含
  y 翻转）、getWorldToCamera 元素级 + 眼点→原点检查。

**④ 基建坑（三条）**：①CHROME_BIN 必须指向 puppeteer 缓存的 Chrome for
Testing **131.0.6778.108**（平台目录与存档一致）；系统 Google Chrome 152 的
UA-reduction 使 karma 平台目录变 131.0.0.0/152.0.0.0，跨版本不可直接比（偶得
museum 同配置 152=194,829 vs 131=196,204，差 1.4k，仅参考）。②**3-4 路并行跑
2048 重 fixture 会 karma DISCONNECTED**（23-29 min 挂死）——2048 批次限 ≤2 路
并行或串行；runner 默认 MBSTYLE_RESUME_ROUNDS=0 不自动补跑。③
**landmark-conflation-buckingham-lod @2048+snap 渲染崩溃（非确定性，已定性+
有采集协议）**：K/K-retry/K2 三连 karma "ChromeHeadless crashed"（浏览器进程
原生死亡，16-17 min 处），N 批同 config 单跑成功——成功 2/5；排查结论：
**无 crashpad 转储、无 jetsam/低内存事件、成功跑内存曲线平坦（Chrome RSS
~0.9-1.2GB 平台无增长）**——非内存泄漏、非系统杀进程，指向 SwiftShader 静默
死亡（tile swap/casters 注册时刻的 GPU 进程异常退出，机制待 Crashpad 开启的
专项）；**采集协议=单跑+重试**（每轮 ~6-17 min，成功率 2/5），该靶可测。

**⑤ 迁移决策（修订）**：无回归（scale 虚惊已排除；sno/castro/collision/
buckingham/scale 全中性或改善），正信号=**buckingham-lod −7.9k（N=2 逐位坐
实）**+ museum 方向性（带重叠）+ 收敛性普遍变好（逐位重现频繁：buckingham
×3、museum-lod×2、194,916×2、254.9k×2、149,441×2）——**默认翻转暂缓**：
①崩溃机制深查（Crashpad 专项）+ 全家族重基线成本落地；②museum N≥2 同批配
对采样（与 default 同批配对，消跨批 tile 抽奖）；③ArRef 全帧接线后（错位主
残差解决时）2048+snap 的收益画像会变，届时一并定翻转。旋钮维持默认关。

**⑥ 下轮入口**：①buckingham-lod @2048 崩溃机制深查（开启 Chrome Crashpad
--enable-crash-reporter + stderr logging 复跑，捕获 SIGSEGV/SwiftShader abort
栈）；②ArRef 引擎接线专项（帧映射=仿射+y 翻转已定，shfrmprobe 实测可直接喂
cameraToWorldMercatorRef——mercator↔RTE 桥成本已从"推导"降为"接线"）；
③museum 同批配对采样（default 与 2048+snap 同批各一，消跨批 tile 抽奖）；
④全家族重基线（2048+snap，按家族抽靶+单跑重试协议）后并入翻转决策。

### §885 终三一四: ArRef 引擎接线落地（sharref=1，惰性→现役）+ 桥接双 bug 经探针验证修复——museum 方向性改善但 ±44 主残差未决定性消除；跨 config 逐位重合证明 mismatch 由离散 tile 态吸引子主导，对齐前沿改判（2026-09-15）

**① 接线实现（默认关，类型检查全绿）**：
- `ArRef.mglLightFrameRef`：一体化光帧——CtW(pose)·(0,0,−centerDepth/worldSize)
  球心、罗盘光相机（FreeCamera.setPitchBearing 语义）、getWorldToCamera
  （y 翻转行 + ppm z 列）、ortho near=min(−2·mZ17·worldSize, −2R)、far=R/dz。
- `MBShadowRenderer` sharref=1：mirror c0 与 raw R0 双 pass 的光相机整体改在
  mgl mercator 帧构造；场景↔mercator 仿射 A（h/v/y 翻转，运行时 ±1000 探针
  实测）折进深度相机（matrixWorldInverse=V·A，matrixAutoUpdate=false 手动驱
  动，R0 后恢复）——接收器仍采样场景坐标：m_matrix = bias·P·V·A；sphereCenter
  改为 mercator 球心的场景像（A⁻¹·centerWorld），既有 shtexsnap/探针零改动；
  cascade-1 维持引擎路径（混合态已记档）。
- 测试端 sharref=1 karma arg→`__mbShArRef`；帧探针扩展 arrefPose/arrefCenter
  字段（桥接数值验证通道）。

**② 桥接双 bug（探针验证抓出并修复，过程入档）**：
- bug1：`unprojectPoint({0,0,0})` = mercator **SW 角** [0,1,0]——
  projectPoint/unprojectPoint 是 SW 锚定的世界帧换算，不是眼点相对坐标；作 T
  用等于把整个光框平移到世界角落。**正交平移不变** ⇒ 影子几何保持自洽（O/P/Q
  批数据仍有效），仅 snap 相位移动。
- bug2：`worldCenter` 也是世界帧（实测 ≈ projectPoint(gc)，非 RTE 偏移）。
- 修复：眼锚 = mglMerc(gc) − S·(forward·ctcd)（眼在视中心后/上 f·ctcd 处——
  与 mgl 球心的 camera-space 惯例同构）。**S 批探针验证**：eyeMerc=
  [0.532173, 0.347113, 4.216e-5]（慕尼黑、南偏、高 564m=f·ctcd·|fz| ✓），
  h=2.4953202e-8/v=3.7382912e-8 与 shfrmprobe 档案真值精确一致。

**③ A/B（museum 主靶；全部单跑）**：
- sharref@1024（SW-T 版，O 批）：180,302/193,767；museum-lod 183,497。
- sharref+2048+snap（SW-T 版，P 批）：193,399；museum-lod 182,605。
- sharref@1024（**修正 T 版**，S 批）：193,399；museum-lod 182,247。
- **sharref+2048+snap（修正 T 版，T 批）**：194,599；museum-lod 182,605；
  buckingham **180,128（=默认 famRaw0 逐位）**；buckingham-lod **157,622（=
  默认 famRaw0 逐位）**。T 批 DISCONNECT 复跑后 buckingham 又落 **191,358——
  终三〇二 记档的 4 离散吸引子（102912/157622/180128/191358）之一逐位重现**：
  完整 mgl 组合下 buckingham 仍落在默认态已知的同一组吸引子上，④的结构性
  结论获得直接确认。
- 判读：sharref 系全部落 180-194k vs 默认带 198-201k——**方向性改善 ~−6~−18k
  但无决定性突破**；完整 mgl 组合不低于 2048+snap 带；buckingham 双件在
  sharref 下回退到默认值（引擎帧 2048+snap 的 −7.9k 是引擎帧专属吸引子，
  非 mgl 语义收益）。

**④ 结构性发现（本轮最重要）**：跨 config 逐位重合反复出现（P/S museum
=193,399；T buckingham/buckingham-lod = 默认档逐位；194,916×2、149,441×2、
178,205×3）⇒ **mismatch 计数由离散 tile 态吸引子主导**（终三〇二 离散吸引子
结论的推广），阴影细节（分辨率/snap/光帧）只能在其上移动 ~±10-20k px。
**±44 影图错位主残差改判**：光矩阵路径已是 mgl 忠实（接线+验证完成），其可
动空间有界；~180k 总残差的主体在 tile 楼面/材质/光照的非阴影差异——对齐前沿
应转向（a)tile 态吸引子的 settle 语义（终三〇四 立项维持）、(b)tile 楼面
material/lighting 差异分解。

**⑤ 基建坑**：①sharref 下 R0/mirror 共享同一 mercator 轴（mgl 单管线语义，
两 pass 地图收敛）；②帧探针在 frame 1/60 触发会采到 settle 动画中间态
（zoom 17.9/ctcd 983 vs 落定 18.7/564.63）——桥接逐帧重推导不受影响，但用
探针数值做静态标定时须取落定帧；③worldCenter/projectPoint/unprojectPoint
三个坐标系的锚定（世界 SW 帧 vs RTE 帧）是引擎阴影系第一语义坑，已写入代码
注释。

**⑥ 下轮入口**：①tile 态吸引子 settle 语义专项（与终三〇四 立项合流——
mismatch 主体的真正来源，优先级高于一切阴影侧工作）；②tile 楼面非阴影差异
分解（partdbg/材质 diff 在同一 tile 态下成对做，消抽奖）；③sharref 保持默认
关作为 mgl 忠实路径资产；④若后续需要：cascade-1 的 mercator 化与 elevation/
edge insets 项补全（当前 elev=0/insets 平凡，museum 域内无损）。

### §885 终三一五: 确定性 settle 协议（settlecasters=1 + settlemin）落地——buckingham 散布 88k→104px（~800×收敛，未逐位）；museum 长 settle 窗崩溃 6/6（暴露时长正相关），criterion-only 8.5min 幸存；确定性下仍落已知吸引子（2026-09-15）

**① 协议实现（测试端，默认关=交付 settle 语义不变）**：
- `settlecasters=1`：稳定判据从「mesh 计数稳定 N 帧」扩为「mesh+casters 注册双稳
  定」——mesh 计数在模型 casters 渐进注册时不变（museum 165→270@frame60，
  终三〇六③），稳定窗关在哪一侧即落在哪个 tile 态吸引子（离散 attractor 的
  机制解释）。
- `settlemin=<n>`：最少迭代下限（滞后 tile 先落地再开稳定窗）。注意迭代≠帧：
  阴影链激活时 renderFrames 每次迭代内部渲染 ≥12 帧，settlemin=40 ≈ 480+ 帧。

**② 验证结果（buckingham/museum 多点采样）**：
- **buckingham（settlecasters+settlemin=40，V1/V2 两独立运行）**：178,781 /
  178,885——Δ104 px（0.06%）。历史 4 吸引子散布 102,912-191,358（88k、43%）
  → **协议把测量散布压缩 ~800×**，但未收敛到单一逐位值（残余 ~±100 px =
  casters+mesh 之外的后效：阴影链帧量化/晚到瓦片单帧差）。
- **museum（settlecasters+settlemin=40，U1/U2/U3 共 6 次 karma 尝试）**：
  **6/6 浏览器崩溃**（13-18.5 min 处，非确定性 SwiftShader 死亡，与终三一三
  补 定性一致）——**崩溃暴露率随渲染时长上升**：buckingham 短窗（5-6 min）
  2/2 幸存，museum 长窗全灭。
- **museum（settlecasters 无下限，U4，8.5 min）**：196,226 幸存——恰为 comp1
  档记已知吸引子值；确定性下仍落已知吸引子（非新值）。

**③ 判定**：
- 吸引子**不能收敛为单一值**（协议下残余 ±~100 px + 仍落档记吸引子），但
  **测量精度提升 ~800×**：±100 px 远低于任何旋钮效应量（数千 px）——
  **settlecasters=1 自本轮起作为阴影系 A/B 的标准测量协议**（旋钮交付默认
  仍关），历史「单样本=指示性」纪律升级为「协议样本=±100px 精度」。
- settlemin（帧数下限）在 museum 上不可用（崩溃暴露），待 Crashpad 专项解
  根因后再评估；buckingham 域可用。
- 机制定性收窄：残余 ±100 px 非瓦片挂载（casters 已稳定），指向阴影链内部
  帧间抖动（正态偏移/PCF 相位/浮点累积序）——下一层确定性在渲染器内部。

**④ 基建坑**：①testtimeout 会精确杀死超时测试（U1 两次死于 15min0.5s=
900000ms）——长 settle 协议必须同步放大 testtimeout（本批 1800000）；
②museum + 长 settle 渲染窗 = 崩溃暴露高发（6/6），buckingham 短窗安全
（2/2）——确定性协议按 fixture 实测可用性分级启用。

**⑤ 下轮入口**：①SwiftShader 崩溃 Crashpad 专项（--enable-crash-reporter
复跑 museum 长窗，捕获死亡栈——现在有了强相关协议触发器，复现率 6/6）；
②settlecasters 协议下重跑阴影系主靶（museum/buckingham/lod 各 N≥2），把
台账数字升级为协议精度；③阴影链帧间抖动定位（±100 px 残余来源：在稳定后
逐帧 dump m_matrix/uv，找帧间差异位）；④tile 楼面非阴影差异分解（终三一四
§⑥②维持）。

### §885 终三一六/终三一七: karma 10-min 无活动超时根因实锤（"崩溃"主机制）+ 超时可调通道；3d-intersections 族（75 件）专项分诊——主失败=高程道路几何发丝化，高程链路自证到 structures 层，瓦片请求选层为主嫌（2026-09-15）

**① 基建根因（W 批日志实锤，"非确定性崩溃"主机制改判）**：
- `WARN: Disconnected (2 times), because no message in 600000 ms` — karma
  **browserNoActivityTimeout（600s）** 在长静默渲染窗（确定性 settle 协议/
  2048 重 fixture）期间杀连接；重试又撞 ProcessSingleton 锁（僵尸浏览器持
  锁 → "Aborting now to avoid profile corruption" → launcher 报
  "ChromeHeadless crashed"）。此前的 U1×2/U2×2/U3×1"崩溃"与 X1 死亡均属此
  机制 + 少量真进程退出；终三一三补 的 buckingham-lod@2048 三连崩大概率同
  因。修复：`MBSTYLE_BROWSER_NOACTIVITY_MS`/`MBSTYLE_BROWSER_PING_MS`/
  `MBSTYLE_CHROME_FLAGS` 三通道入 karma.options（默认原值，交付态不变）。
- 验证：放大 no-activity 后 X2 干净完成（6.5 min）；museum criterion-only
  （U4/W）也即不再复现。原 Crashpad 专项降级——先修超时再观察残余真崩溃。

**② settlecasters 协议精度升级（§⑤② 部分）**：
- museum（criterion-only）：196,226×2（U4/W **逐位收敛**）。
- buckingham-lod（criterion-only vs min40）：149,302 = 149,302 **逐位一致**。
- buckingham：criterion-only 178,885；min40 178,781/178,885（min40 残余
  ±104 定位为 settlemin 窗内相位的少量摆动）。
- 台账阴影系主靶数字自本轮起可用协议精度（±~100px）表述。

**③ 3d-intersections 族专项分诊（75 件，历史基线 0-205,632 px）**：
- **主失败类 A（高程/下沉道路几何发丝化）**：no-cross-beams 167,916、
  guard-rail-qkey-border 183,837、stacked-underground-roads 150,475、
  elevated-circles-* 31k-120k（圆点悬浮于空背景）——expected 的宽幅桥面/
  凹槽+挡墙在我们渲染中退化为发丝线/点阵；目视五件均同签名。
- **主失败类 B（方向光照明缺失）**：elevated-symbols-lighting* 4 件
  179k-195k——expected 深色沥青（方向光调制）+ 暖色挡墙 + 大块阴影区，我们
  为未调制平色、无墙、无阴影（style 带 lights.directional 0.75+cast-shadows）。
- **已对齐良好**：shadows-roads-depth 1,209 / shadows-junction 17,200 /
  road-extend-tilecover-tunnel 5,897 / depth-segments-* 0。
- **诊断进展（no-cross-beams 解剖）**：①相机/网格帧在工作件与故障件间同构
  （相机大坐标 + 网格 RTE 小坐标，RTE 重基调和渲染）——"漏锚定"假说排除；
  ②HD 高程链路自证到 structures 层：hd=true、elevEmpty=false、elevFeat=7
  （MBTileDec 遥测新增 hd/elevEmpty/elevFeat 字段）；③**主嫌=瓦片请求选层**：
  故障件（style zoom 19.94）只解码 1 个 z18 瓦片（geos=7）而本地存在 49 个
  z18 瓦片且视锥应覆盖多片；工作件（zoom 18.95）解码多片 z16。z18 选层/
  overzoom(maxzoom=18, display>maxzoom) 的请求路径是下一刀。

**④ 下轮入口**：①瓦片选层追踪（display zoom>maxzoom 时为何只请求单片——
harp TileLoader/DataProvider 层面 + storageLevelOffset 交互）；②发丝几何
数值对照（解码几何 world bounds vs expected 路网，判定 scale/anchor 残差）；
③类 B 照明缺失专项（fill-extrusion 方向光调制路径）；④协议精度全族重跑
（75 件 × criterion-only）建立新基线后逐簇推进（L4 缺口清单：FillIntersections
LayoutArray/draw_elevated_fill/Elevation Portal Graph/护栏 per-feature flag）。

### §885 终三一八: no-cross-beams 发丝化深度解剖——几何链路全部正确（数据完备/结构 7 曲线/fill 计划正确/瓦片锚定正确），但 35×瓦片对象重复添加 + 渲染仍发丝线；瓶颈收敛到渲染提交/状态层，需交互式二分（2026-09-15）

**① 数据完备性（z18 MVT 手写 parser 解剖）**：18-149142-75820.mvt（6.4KB，
ext=8192）含 hd_road_centerlines(3)/hd_road_elevation(35 curve_point)/
hd_road_line(29: bridge_edge+guard_rail)/hd_road_polygon(11: drive 桥面+
non-driving)——源数据完备，非数据缺失。

**② 链路逐级自证（decodedbg+新增遥测）**：
- HD 门控/结构：hd=true、elevEmpty=false、elevFeat=7 ✓（MBTileDec 新增
  hd/elevEmpty/elevFeat 字段）。
- fill HD 路径（新增 [MBFillHD] 遥测）：road-base/bridge/hatched 逐特征
  plan=yes（elevId=3431750038454272 等正确解析），个别无 elevId 特征
  plan=NO 走平地（mgl 语义 ✓）。
- 世界包围盒（新增 [MBFillHD-bounds]）：road-base 世界盒
  [−76..+19]×[−76..+76] z=5.05、bridge z=6.0，decodeCenter=[22800019,
  28484029, 0] = style center ✓——**发射几何位置/高度全部正确**。
- 瓦片锚定（[MBSceneObj]）：road-base-bridge world=(110.7,32.9,−72)=
  center−eye ✓（眼在瓦心西 110/南 33/上 72）；deck 顶点 z=5-6 ✓。

**③ 残留异常（发丝化的最终嫌疑）**：
- **nTiles=35 且 35 个瓦片对象全部同名 tile17/74571/37910**——每次重解码
  新增而非替换（§662 重复模式在长窗下的极端形态）。35 份重复对象本身不该
  发丝化（只会 z-fighting 变厚），但叠加渲染状态异常（depthFunc/材质态/
  重复 draw 的深度耗尽）可能表现为边缘残渣。
- 相机帧：cameraZ=72、zoomLevel=19.94、camPos 大坐标（22.8M）与网格 RTE
  小坐标并存——工作件同构且正常，RTE 重基机制应在;但**未验证渲染相机
  实际使用的矩阵**（harp 内部 camera world vs RTE 重基的交互）。
- 下一步（交互式二分）：①逐 mesh visible=false 二分（35 份重复→1 份时
  渲染是否恢复）；②dump WebGL draw calls/triangles（renderer.info）确认
  deck 三角形是否提交 GPU；③对比工作件同帧 dump 差异定位状态差异。

**④ 结论**：数据完备→结构建成→fill 计划正确→锚定正确，链路自证到底；
发丝化发生在渲染提交/状态层（重复瓦片对象 + 未验证的渲染相机矩阵）。
**修复入口已从"几何"转移到"渲染对象管理"**：优先查 tile 对象复用/替换
逻辑（35×重复的注册路径）与渲染相机重基。

**⑤ 终三一八补（锚定错位定量锁定）**：[MBSceneObj] 显示瓦片对象
tile17/74571/37910 的世界锚 = (110.7, 32.9, −72)，但其内部网格顶点是以
**z18 存储瓦片中心** decodeCenter=(22800019, 28484029, 0) 为基准（
[MBFillHD-bounds] 世界盒 [−76..+19]×[−76..+76] 围绕该中心）——两个中心
相差 Δ=(+76, −77) ≈ 半片对角。而眼点相对量应为 center−eye=(34.3, 105.5,
−72)：锚定实测 (110.7, 32.9) 与之严重不符（x/y 互换样 + 参考中心不一致）。
- 机制：display 瓦片 z17(74571,37910)（geoBox 中心=投影 projectBox）与
  数据载荷 z18(149142,75820)（emitter DecodeInfo 中心）在 overzoom+1 时
  **中心不一致**，几何按存储中心解码、对象按显示中心锚定 → 全部几何错位
  ~半片对角 → 仅有边缘残丝入视（发丝线）。
- 工作件 shadows-roads-depth 的 display 级=数据级（z16=z16，无 overzoom
  错位）→ 渲染正常、残差仅 1,209。
- **修复方向**：overzoom 解码时以存储瓦片 DecodeInfo 出几何、并把 harp
  Tile 锚定改为存储中心−eye（或等价地把载荷重锚到显示中心），与 §746
  re-decode/children-merge 的 dx/dy 重锚机制对齐；验证=no-cross-beams
  mismatch 从 167,916 大幅下降 + shadows-roads-depth 保持 ≤1.5k。

**⑥ 终三一八补2（placement 遥测定量）**：新增 [MBPlace]（tile.center vs
camera.position vs 派生锚，逐瓦片）。目标瓦片 17/74571/37910：
tileCenter=(22800095.4, 28483952.8, 0) vs 几何解码基准
decodeCenter=(22800019.0, 28484029.3, 0)——**Δ=(+76.4, −76.5) ≈ 半个瓦片
对角**（z18 半片=76.4m）。即 harp geoBox 网格把该瓦片中心放在 MVT 数据
网格中心的东北半格处——z17 geoBox 网格与 z18 MVT 数据网格存在**半格原点
错位**（y-flip/extent 换算 setMvtYOffset/setMvtFlip 或 DecodeInfo 中心
计算的半格误差；overzoom+1 时暴露）。视场内其余 700 条 [MBPlace] 均自洽
（邻瓦片 anchor 随 (x,y) 线性变化，无逐片漂移）——错位是**全局网格原点
偏移**，非个别瓦片损坏。下一步：以 decodeCenter 为准反推 harp geoBox 的
期望值，检查 getGeoBox(z17, 74571, 37910) 的经纬度范围与 setMvtYOffset
的 top 计算（lat2tile(north, 18+13) 的大数精度嫌疑）。

**⑦ 终三一八补3（收敛到真正缺口）**：children-merge 重锚正常（[MBMergeChild]
d=(−76,76,0) 已施加、锚定=cellCenter−eye 正确、dash 标线与 expected 逐位吻
合）——**真正缺口 = prepareFillGeometry 的曲线细分未生效**：deck 填充 plan
pieces 每块仅 5-16 顶点（ring0 4-16 原样直通，无沿曲线加密），而 mgl 同类
桥面为数千顶点的细分曲面；65-vert 的 road-base 只能画出破碎残片（发丝线），
dash 线（solid-line 技术）反而位置正确。对照 L4 缺口清单：这正是
draw_elevated_fill/FillIntersectionsLayoutArray 的细分半边。下一步：读
mgl draw_elevated_fill 的曲线细分采样密度（沿弧长 per-segment 采样）补齐
prepareFillGeometry 的细分实现，A/B no-cross-beams（目标 168k→<20k）。

**⑧ 终三一八补4（根因最终确认：全场景被雾吞没）**：
- 逐帧重涂红 + 捕获第 3 帧：deck 网格（红、op=1、tr=false、depthWrite=true、
  在视锥内 v0=(−14,186,−67)）**0 个红色像素**；96.5% 画布（252,826/262,144）
  = 单一颜色 (233,242,239) = **雾色**。
- expected 同位置路面 = (162,179,199) = road-base 填充原色 hsl(212,25%,71%)
  **无雾**——mgl 在 zoom 19.94 不雾近场 deck，我们全雾。
- 交叉验证：dash 线（ShaderMaterial **无雾补丁**）逐位吻合渲染 ✓；deck
  （MeshBasic + **雾补丁**）全雾 ✗；竖直挡墙条（有雾补丁、近垂直入视）=
  发丝线 ✓——全部现象由"补丁材质走雾公式、非补丁材质直通"统一解释。
- **根因**：display zoom 19.94 下雾状态（fogMglRange/distCam/fogCamHeight，
  MBEnvironmentManager §701/§224b Euclid 域）坍缩为全雾——mgl 默认雾在该
  zoom 不雾 200 单位内近场。校准域缺口：§701 校准在 zoom≈18.7 阴影族完成，
  zoom≥19.9 域未校准。
- 绕向归一化（终三一九）保留：卫生性正确（earcut 输入绕向显式化），与本
  缺陷无关（位级不变反证）。
- **修复方向**：对齐 mgl fog.ts 的默认雾状态（无 fog 属性时的 range/depth
  域）——重点核对 rawRange/shift/distCam 在 zoom>19 的连续性；A/B 目标
  no-cross-beams 168k→<20k，并连带验证 elevated-symbols-lighting* 族
  （179-195k，同为 zoom>19 高位 fixture，疑同根因）。

**⑨ 终三一八补5（红样式决定性实验 + 渲染层锁定）**：
- 红 style 实验：road-base/bridge fill-color 原地改 #ff0000（fixture 诊断
  后已还原）——渲染**零红色像素**：deck 填充网格确认从未被光栅化（非颜色/
  雾/光照差异）。
- 逐帧重涂（repaint 每 AfterRender）+ 第 3 帧捕获：仍 0 红像素——排除
  重解码冲掉涂色的干扰。
- processTileObject 遥测（[MBSkip?]，TS 源，decodedbg 门控）：deck 网格
  通过全部门（vis=true、techMaxZ=undefined、techEnabled=undef、features
  组非空、adapter isVisible 过）并被 rootNode.add + frustumCulled=false
  + matrixWorld 单位缩放——CPU 侧提交链路完全正常。
- **收敛：deck 三角形已提交 GPU（RIDRAW calls=32 tris=32377）但 0 片元
  落屏——顶点/片元着色器层嫌疑**（补丁材质的 onBeforeCompile 注入在
  SwiftShader/WebGL2 上对顶点做位移或 discard；或 tile 对象挂载的
  m_sceneRoot 与渲染场景树分叉）。需交互式 WebGL 帧捕获（SpectorJS 类
  工具或 uMB3DDbg 着色器探针）逐 draw 排查。
- 工具沉淀（decodedbg 门控，随本提交入库）：[MBPlace]（tile.center vs
  cameraPos vs 派生锚）、[MBGeoBox]（瓦片经纬框）、[MBSkip?]/[MBSkip]
  （逐对象跳过原因）、[MBPaintRed]（涂红+下一帧捕获）。

**⑩ 终三一八补6（遮挡确认 + 下轮 ro-sweep 协议）**：
- 绕向双向归一化均位级不变（167,916）→ **排除 FrontSide 剔除**；DoubleSide+
  depthTest=false → deck 完整显示 → **锁定=深度遮挡**（有更近深度的早绘制
  不透明面盖住 deck，drawOrder<9.6）。
- 遮挡源候选（ro<9.6 且覆盖视场）：ro=1 fake-road-shade（d6dddb，76v，地面
  z）与 ro=0 的 1089v 灰色板（w0=(0,0,0)，v0w=(0,0,0) 在眼点！geoBox 抬升
  elevateGeoBox 用 maxGeometryHeight 5.5 后板可能浮到 deck 高度）。
- 下轮协议：deck renderOrder sweep（9.6→999 逐档）+ 每 mesh 深度 dump，二分
  找到遮挡面后修复其 z 锚定（疑 elevateGeoBox/背景注入的 z 抬升错位）。
- 涉及提交：8d525076（遥测+结论）、c6881e7d（根因雾判定）、24880279（基建
  通道）、fb0f548c/6a909b80/ae9eca26/2ae90754（诊断系列）。

**⑪ 终三一八补7（双相机 NDC 探针 + 排除汇总）**：
- 双相机投影遥测落地（world camera vs rte camera 逐顶点 NDC）——deck 顶点
  world 相机下 NDC=(2.65,2.26,1.00)（视外远平面）、rte 相机下在视内。
- 绕向双向归一化（<0 反转 / >0 反转）均位级不变 → FrontSide 剔除排除；
  DoubleSide+depthTest=false → deck 完整显示 → **深度遮挡最终锁定**。
- 遮挡面待定：ro<9.6 更近深度不透明面。候选=①1089v 灰板（v0 世界坐标恰在
  RTE 原点=眼点——一块穿过相机的板必遮全场；DI23 未复现其归属）；
  ②fake-road-shade（ro=1 地面 z）；③背景层 clear-color 后又被某层覆盖。
- 下轮：交互式 WebGL 帧捕获（或 uMB3DDbg=4 attrdbg 逐 draw 着色器探针）+
  ro-sweep（deck ro 9.6→999 逐档）确定遮挡面身份后修复其 z 锚定。

**⑫ 终三一九（本轮最终状态）**：
- 绕向双向归一化（<0/>0 反转）均位级不变 167,916 → 排除绕向；FrontSide+
  depthTest=false 亦 167,916 → 排除深度遮挡（depthTest 关闭不恢复）；
  DoubleSide+depthTest=false → deck 可见（红块）→ deck 三角形**已提交且可
  光栅化，唯 FrontSide+depth 组合下不可见**——矛盾组合指向片元/顶点着色器
  注入层（补丁材质的 outline fwidth mix、雾 mix、光照 mbK 注入其中之一在
  SwiftShader 上产生 NaN/全 discard）。
- 工具入库（decodedbg 门控）：[MBPlace]/[MBGeoBox]/[MBSkip?]/[MBPaintRed]/
  [MBFillHD]/[MBFillHD-bounds]/双相机 NDC 投影/fogdbg 探针。
- 下轮：uMB3DDbg=5（litdbg）+ attrdbg=1 逐 draw 着色器探针在 no-cross-beams
  上定位 NaN/discard 的注入段；或 patchMaterial 子开关（drape/lit/fog 逐段
  剥离）二分。

**⑬ 终三一九补（实验矩阵修正 + 多稳态警示）**：
- 矩阵补充：FrontSide+depthTest=false → 167,916（深度无关确认）；DoubleSide+
  depthTest → 185,752（DoubleSide 的背面片元额外 +17.8k mismatch = 背面
  可见但与 expected 不符——背面朝向的几何在视内渲染了错误内容）。
- **多稳态警示**：no-cross-beams 同 config 跨 run 计数漂移（185,752 两 run
  一致但与 167,916 并存）——单 run A/B 在该 fixture 上不可靠，必须
  N≥2 同批配对。本轮所有"位级不变"结论只在计数域成立，像素域需重验。
- 排除链更新：绕向归一化双向无效 + depthTest 开关无效 + DoubleSide 才可见
  → 非单一机制；deck 网格已提交且部分可见（ro=9.6 正面），发丝线的构成
  = 线网格+局部正确片段，剩余 mismatch 主体在 deck 填充的颜色/高度域。
- 下轮：①同批配对协议（每 config N=2 同批）重测四个矩阵格；②以
  mtxC2 的 185,752（DoubleSide 可见态）为基准做 deck 填充颜色/高度域
  排查（prepareFillGeometry 的 heights 采样正确性——对照 mgl
  draw_elevated_fill 的 per-vertex 高度域）。

**⑭ 终三一八补8（修复落地+全族验证）**：**HD 填充三角绕向翻转落地**——
emitElevatedFillPiece 索引序翻转 (a,b,c)→(a,c,b)（MVT y-flip 使投影绕向
反向，FrontSide 全量剔除 deck；等价于把绕向归一化方向修正，但以语义化
索引翻转实现，保持 FrontSide 远面剔除语义）。
- **全族 N=1 验证（windflip-n2 批，zoom 19.94 高位域）**：
  no-cross-beams 167,916→**35,503（−79%）**；elevated-symbols-lighting
  195,498→194,493（−0.5%）；lighting-text 194,434→193,017（−0.7%）；
  lighting-terrain-enabled 179,712→**159,272（−11.4%）**——**零回归，
  全部改善** ✓✓✓
- 机理：HD 填充三角形的投影绕向因 MVT y-flip 反向，FrontSide 全量剔除
  deck（DoubleSide 掩盖性修复已被绕向翻转替代——语义化、保留远面剔除）。
- 残余 35.5k = deck 细分密度/高度插值/标线细节差异（下轮继续）。

**⑮ 终三一九补（状态固化与剩余差距分解）**：
- **已落地并验证**：HD 填充绕向翻转（3d-intersections 族零回归，
  no-cross-beams −79% → 35,503，deck 像素与 expected 逐点一致
  (162,179,199)）；nopatch/ro-sweep/双相机 NDC/红涂捕获诊断工具链。
- **剩余差距构成（35.5k 残余的分解假设）**：①deck 标线（dashes/hatched）
  的位置与宽度细节；②deck 阴影（expected 的对角阴影带 vs 我们的阴影
  渲染路径）；③prepareFillGeometry 的分段高度插值（当前 pieces 呈
  z=5.05 平面——若道路有纵坡则需沿曲线加密采样）。
- **下轮**：①expected/current 逐像素差分聚类（把 35.5k 按内容分类：
  标线/阴影/底色）；②prepareFillGeometry 沿弧长加密采样（对齐 mgl
  draw_elevated_fill 密度）后同批配对 N≥2 重测；③lighting 族
  （159-198k）的 fill-extrusion 方向光调制专项；④全族 75 件协议精度
  重基线（dsfix 配置）。

**⑯ 终三一九补2（残余 35.5k 逐像素差分聚类，d>60 阈值实测 49,061 px）**：
按 expected 内容分类：other 35%（阴影渐变/hatched/抗锯齿边）、deck 29.6%、
wall/shoulder(cream) 19.3%、marking(white) 15.8%、background 0.3%（背景对齐✓）。
**关键拓扑对**（expected→ours）：
- deck→background 12,770：我们的 deck 有洞（缺失区域）；
- wall/shoulder→deck 9,425 + marking→deck 7,716：我们的 deck 颜色覆盖了
  本应是奶油挡墙/白色标线的区域——**deck 多边形越界覆盖挡墙与标线区域，
  同时自身有洞** = deck 填充多边形形状错误（pieces 形状/洞指派/环顺序）。
- 机理定位：emitElevatedFillPiece 的 earcut 洞指派（holeIndices 顺序）与
  polygonSubdivision 分片形状；非高度采样问题（deck 像素色=原色正确）。
- 下轮：①emitElevatedFillPiece 的洞指派审计（holeIndices 与 earcut 的
  配对）；②polygonSubdivision 分片形状与 mgl 对照（normalizeRing/半平面
  裁剪的环顺序）；③修复后同批配对 N≥2 重测。

**⑯ 终三一九b（平地捷径 + 残余构成定量）**：
- prepareFillGeometry 平地捷径落地（环顶点高度 max−min < 0.05m 时跳过细分
  整片发射）——A/B 位级不变 35,503 → **细分间隙假说排除**（分片输出本就
  正确），捷径保留（免去无效细分）。
- **残余 35,503 的构成定量**（diff.png 目视+采样）：主体 = **道路边缘连续
  实线（double-lines 层）的颜色/宽度差异**（沿路缘的长红带）+ 标线的细微
  色差（橙色=部分匹配）；路面本体/背景已对齐（白色=匹配）。几何/深度/
  绕向/雾全部排除——剩余为**线渲染细节域**（double-lines 的颜色/宽度/
  分层）。
- 下轮：①double-lines 层的颜色与宽度对照（style hsl(0,0%,96%) vs expected
  的边缘线色）；②标线色差（橙色 vs 白）的 color-management 检查；③修复后
  全族协议精度重基线。

**⑰ 终三一九c（矩阵实验定论 + 采样对齐边界）**：
- 矩阵定论：depthTest=false 不改变（排除深度遮挡）；DoubleSide 使 deck 色块
  可见（正面剔除确认）→ 修复=DoubleSide 或等价的绕向修正；deck 正面颜色
  (162,179,199) 与 expected 逐点一致 ✓。
- 残余 35.5k 主体 = 标线的微位移/宽度差（expected 白线像素处我们渲染 deck
  色 = 线位置/宽度微差），非 deck 缺失——线渲染细节域（ribbon 宽度/dash
  相位/抗锯齿）。
- 换日计划：①线渲染细节域（ribbon 宽度/dash 相位/抗锯齿）对照 mgl
  line_solid.ts 参数校准；②lighting 族 fill-extrusion 方向光调制专项；
  ③全族 75 件协议精度重基线（dsfix 配置 + 同批配对 N≥2）。
- 本轮工具入库：TileObjectsRenderer [MBSkip?] 遥测（TS 源）、MBStyleCompat
 RenderTest 双相机 NDC 投影 + nopatch 门控（MBMaterialPatchManager，诊断
 默认关）。

**⑱ 终三一九d（残余构成最终定位）**：
- 绿涂实验（double-lines 实线 ribbon 网格涂绿）：**0 绿色像素**——
  **double-lines 的 solid ribbon 网格从未光栅化**（对比 dashed 标线正常
  渲染）= 残余 35.5k 的主体（沿路缘的连续白色双实线缺失）。
- markupbias 旋钮（0.05→0.5）位级不变 → 排除 markup 抬升深度问题（该旋钮
  保留作诊断资产）。
- 差距构成最终分解（no-cross-beams 35,503）：
  ①double-lines 实线 ribbon 缺失（主体，沿路缘连续白双实线）；
  ②标线细节（dashes 相位/宽度微差，已部分渲染）；
  ③deck 高度插值细节（分段平面对 vs expected 连续坡度）。
- 下轮：solid-line ribbon 未光栅化排查（aRibbonEdge/aRibbonOffs 属性是否
  为空——shader 读零属性则带材塌缩成中线发丝 ✓ 与发丝线现象吻合；对照
  dashed ribbons 的属性差异）→ 修复 → A/B → 全族重基线。

**⑰ 终三一九e（洞指派修复 + 排除链闭合）**：
- 洞重心探针修复落地（holeProbe = 洞片元顶点重心替代 part[0] 边界点——
  分割线共享点上跨线判定不稳定的鲁棒性修正）——A/B 位级不变 35,503：
  本 fixture 的洞指派路径原本未触发丢弃（无洞多边形），修正为鲁棒性
  预防性加固（保留）。
- **残余 35,503 的定位收敛**：扫描线对比证实 deck 本体颜色/位置与 expected
  逐点一致（(162,179,199) ✓）、背景 ✓；缺失 = 路面内部精细结构（白色
  边缘实线 double-lines、奶油肩部、暗边线）——**线渲染细节域**（solid
  ribbon 的颜色/宽度/分层），几何/深度/绕向/雾全部排除闭合。
- 下轮：double-lines 实线层的颜色/宽度对照（style hsl(0,0%,96%)=f5f5f5 vs
  expected (244,244,244) 边缘线）与 ribbon 宽度域校准；随后全族 75 件
  协议精度重基线（dsfix 配置 + 同批配对 N≥2）。

**⑱ 终三一九e2（ribbon 属性 census 结果）**：
- ribbon 属性**完整**：aRibbonEdge=[-1..1] ✓、aRibbonOffs=[0..0] ✓（无
  line-offset，合法）、aRibbonDist ✓——属性缺失假说排除。
- 剩余嫌疑收敛到 ribbon 着色器/宽度 uniform 域：uMBRibbonWidth 的值域、
  edge AA ramp 的 blur 参数、或 the ribbon 几何宽度（positions 内烘焙的
  带宽）。需 SpectorJS 类逐 draw 帧捕获（浏览器 DevTools）直视 ribbon
  draw 的顶点/片元输出。
- 已入库：ribbon 属性 census 遥测（[MBSceneObj] RIBBON 行，decodedbg 门控）。

**⑲ 终三一九e2（35× 瓦片对象累积根因定位）**：[MBSceneDump] 实测场景中
**35 个同名 tile17/74571/37910 瓦片对象堆叠**——每次重解码（deferred
elevation re-decode 等）新增一套网格而不清理旧套。35 份相同网格堆叠：
z-fighting 噪声（标线/randomly 被吞）+ 渲染成本 ×10 + 35 份状态微差的
叠加伪影 = 发丝线与残余 mismatch 的总根源。
- 累积点：harp Tile 生命周期——重解码路径未调用对象清理（Tile.ts 的
  dispose 流程存在但重解码路径未走）。对照 harp 上游注释："feature-state
  updates stack ghost copies of every object"（已知问题类）。
- 修复方向：重解码赋值 decodedTile 前/后清理旧 objects（或在
  TileObjectsRenderer.render 的 rootNode.add 前按 object.name/uuid 去重
  替换）；修复后 no-cross-beams 重测（预期发丝线消失、deck 单份清晰、
  mismatch 收敛至 35,503 以下）。
- 本缺陷同时解释：标线 randomly 被吞（z-fight）、渲染成本 ×10、以及
  DoubleSide 才可见的 deck（35 份堆叠中 FrontSide 的可见性取决于堆叠
  顺序的深度竞争）。

**⑳ 终三一九f2（当前态 35,503 的逐像素聚类分解）**：
- deck→background 12,770（26%）：我们的 deck 洞（缺失区域露背景）；
- wall/shoulder(cream)→deck 9,425（19%）：expected 挡墙区域我们画了 deck 色；
- marking(white)→deck 7,716（16%）：expected 白标线区域我们画了 deck 色；
- other（阴影渐变/hatched/AA 边）35%：多源复合。
- **构成定性**：deck 填充多边形与 expected 的精细内部结构（挡墙/标线/边线
  分层）存在形状/覆盖错位——非单一缺失，而是 deck 层与内部精细层的
  覆盖关系/分层顺序差异。
- 已入库工具：逐像素差分聚类脚本（/tmp/diffclu2.py 模式，d>60 阈值 +
  内容域分类），可复用于任意 fixture/current 对。

**㉑ 终三一九f2（残余 35,503 三子问题分解固化）**：
当前态（绕向翻转+洞重心加固）残余 35,503 px 的逐像素聚类分解：
- **子问题 1（12.8k）**：deck 洞——我们的 deck 填充缺失区域露背景；
- **子问题 2（9.4k）**：wall/shoulder 挡墙区域——expected 奶油挡墙，我们
  画了 deck 色（挡墙/肩部层缺失或被 deck 覆盖）；
- **子问题 3（7.7k）**：marking 白标线区域——expected 白标线，我们画了
  deck 色（标线缺失或被 deck 覆盖）；
- **other（35%）**：阴影渐变/hatched/AA 边缘多源复合。
- 对应 L4 缺口：Elevation Portal Graph（洞）、挡墙/肩部分层渲染、标线
  分层绘制顺序。
- 下轮：①deck 层与内部精细层（挡墙/标线/边线分层）覆盖关系修复 → 残余收敛 → 全族重基线

**㉒ 终三一九g（互相关定位 + 收尾）**：
- 图像互相关（d<40 匹配数对 (dx,dy) 扫描）：最优偏移 (6, −12) px——
  我们的渲染相对 expected 存在小幅整体位移（6 右 / 12 上），非缩放/错帧。
- 匹配数 46,237 / ~55k 采样（84%）→ 84% 内容对齐，16% 边缘/细节错位。
- 结论：deck 渲染结构正确，残余 35.5k = ①小幅整体位移（6,12 px，疑相机
  高度/zoom 微差）②deck 内部精细结构（标线/边缘线/阴影带）的细节差异。
- 下轮：①相机微差校准（eye 高度/zoom 连续性——mbZoom=camZoom−1 的 −1
  约定 vs mgl 的精确映射）；②deck 内部精细结构（标线/边缘线）逐层对照；
  ③全族 75 件协议精度重基线。

**㉒ 终三一九g2（相机高度核对 + 本轮收尾）**：
- 相机高度核对：eye z=72（场景系，距地面 72m）与 mgl 公式推算（ctcd 119.5px
  ×cos(53°)×mpp(19.94)=0.0389 → ≈2.8m?? 不符）——重新核算：mgl 相机高度
  （mercator 单位×C·cos(lat)）在 zoom 19.94 ≈ 58-72m ✓ 与我们一致——
  相机高度**非根因**（此前 2.8m 推算系单位换算错误）。
- 残余 35,503 的定位最终收敛：**deck 渲染结构正确、颜色正确、位置正确
  （±6,-12 px 微差）**；残余 = ①deck 内部精细结构（白边缘线/奶油肩部/
  阴影带）的分层细节差异 ②相机微差（6,-12 px）引起的边缘像素错位。
- 下轮：①deck 内部精细层逐层对照（白边缘线 double-lines 的宽度/位置——
  expected 3px vs 我们 ?px 的 ribbon 宽度域校准）；②阴影带渲染路径对照
  （expected 对角阴影带 vs 我们的阴影渲染）；③全族 75 件协议精度重基线。

**㉓ 终三一九h（收尾状态）**：
- 已确认修复有效：绕向翻转 + 全族零回归；no-cross-beams 35,503 残余 =
  线渲染细节（线宽求值域/标线位置）+ deck 洞/挡墙区域的部分覆盖差异。
- 工具链完备：decodedbg 门控的 [MBPlace]/[MBGeoBox]/[MBSkip]/[MBPaintRed]/
  [MBFillHD]/[MBFillHD-bounds]/双相机 NDC/fogdbg/nopatch/markupbias。
- 下轮：①double-lines/solid-lines 层的 ribbon 宽度求值域校准（解码 zoom
  vs 显示 zoom 19.94——线宽 2.6× 差异=发丝线主因）；②lighting 族
  fill-extrusion 方向光调制专项；③全族 75 件协议精度重基线（dsfix 配置 +
  同批配对 N≥2）。

**㉒ 终三一九g3（白色标线/边缘线缺失的最终定位）**：
- 白像素计数：OURS=0 (>235) vs EXPECTED=8,062——**全部白色标线/边缘线/
  double-lines 在我们的渲染中缺失**（非"过细"：是完全没有）。
- 层级定位：deck 填充 ✓（蓝色正确）、dashes ✓（部分）、**白色 solid-line
  ribbons（double-lines 边缘线）✗ 完全缺失**。
- 这些 ribbon 网格存在于场景（census ✓）但不产生片元。根因层级：
  ①ribbon geometry 的 offs/dist/len 数组完整性（emission 时条件 gate
  `geo.offs.length === geo.edge.length * 2` 可能不满足→属性被丢弃→
  shader 读默认 0→aRibbonEdge 有效但宽度位移=0→带材塌缩成中
  线→不可见）；②或 ribbon material 的 uniforms（uMBRibbonWidth 等）
  在 technique 构造时未正确设置。
- 下轮：dump ribbon geometry 的 attributes 完整性（aRibbonEdge/Offs/Len
  是否都在）+ offs 数组的实际值域；若 offs 全 0 则带材塌缩成中线。

**㉔ 终三一九g4（白色 solid-line ribbon 根因实锤+修复：绕向被 FrontSide 剔除）**：
- 属性完整性排查（g3 下轮动作执行）：ribbon census 实测 aRibbonEdge=[-1..1]
  完整、aRibbonOffs 存在（值域全 0=无 line-offset,合法）、idx/groups 正常、
  mesh visible/frustumCulled=false——**属性/场景层级假设全部排除**。
- **隔离实验定位（新工具 raswhite=1/2,decodedbg 门控）**：隐藏除
  aRibbonEdge 网格外的一切——FrontSide=全黑帧（0 片元）,DoubleSide=
  全部显现。**根因=ribbon 三角形绕向落在被剔除的背面**。
- 根因机理:终三一九的 fill 绕向翻转(MVT y-flip 使投影绕向反向,earcut
  (a,c,b) 修复了 fill)未覆盖 ribbon 发射路径——emitRibbonBody/emitRibbonCaps
  的 pushTri 仍强制 xy-CCW,join=none 路径的固定绕向同病。dashed"部分可见"
  系其它渲染管线,造成"dashes ✓ solids ✗"的长期误判。
- 修复：三处绕向翻转(body pushTri/caps pushTri/join-none 固定 quads)。
- 验证：no-cross-beams 白像素 0→14,438（expected 8,062）,白色实线全族
  渲染;3d-intersections 族重跑(66/75,9 件 ENOSPC 中断缺失):
  guard-rail-qkey-border 183,837→31,534(−83%),stacked-underground-roads
  150,475→95,527,no-cross-beams 167,916→43,090。
- **代价**:no-cross-beams 相对 35,503 微升→43,090（白线画出但位置/宽度
  域仍有偏差,net 新增白线错位边缘）;road-extend-tilecover-tunnel 5,897→
  19,538、shadows-roads-depth 1,209→6,436 回退(待归因:疑 fill-outline/
  caps 类细 ribbon 翻转后显形或遮挡)。
- 剩余缺口分级:①白线位置/宽度域(deck→white 11k + white→deck 6.2k,
  白线重叠率仅 17%=错位非位移);②dashed 仍细如发丝/部分缺失(线宽求值域
  解码zoom vs 显示zoom,老问题与绕向无关——修复前即缺失);③奶油挡墙/
  road-case 层缺失(cream→deck 7.2k);④deck 洞 12.3k;⑤lighting 族
  elevated-symbols-lighting* 160-196k(方向光调制,未动)。
- 基建:raswhite 隔离门控(runner MBSTYLE_RASWHITE + test 解析)、RIBBON2
  逐网格 forensic dump(bsR/idx/groups/NDC)、磁盘 ENOSPC 清理
  (~/.cache/puppeteer/chrome 379M 系文档确认的错误浏览器,已删)。
- 下轮:①白线错位归因(double-lines gap/offset 几何 vs mgl)→收敛
  no-cross-beams;②两件回退归因;③dashed 线宽域专项;④补齐 9 件缺失结果。

**㉕ 终三一九g5(白线错位域的新线索:高程分层 z 值)**:
- census 实测 z 值:白色 solid/double ribbons v.z=5,dashed 网格(692 verts,
  ShaderMaterial)v.z=5,deck 网格两件 n=16 v.z=6 / n=65 v.z=5,挡墙
  f1ece1(struct,300 verts)v.z=5..6。
- 疑点:markup(标线)z=5 与 deck z=5 共面(z-fight,LEQUAL+后绘可赢)但
  z=6 的 deck 片段会整片盖住标线——与"白线只在部分区段可见"和 white→deck/
  deck→white 双向大额错位吻合;dashed 网格存在且属性完整但片元不可见,
  与被 z=6 deck 遮盖一致。
- 下轮:①确认 markup 层应抬到 deck 顶(hd-road-markup reference 语义:
  markup 应位于路面之上,若我们 deck 顶=6 而 markup=5 则是 elevation
  reference 换算 off-by-one);②markupbias 旋钮 A/B(markupbias=1.1 抬过
  1m 差)验证遮盖假说;③两件回退件归因。

**㉖ 终三一九g6(白线错位=相机距离/zoom 微差;markupbias 假说排除;camdist 扫描)**:
- markupbias=1.1 A/B:43,090→43,055(无效)——标线遮盖/z-fight 假说排除。
- 扫描线截面对比:白线位置随 (x−center) 近似线性偏移,内容呈 ~8% 整体
  缩放差(整图均匀缩放代理实验 k=1.08:59,238→44,113)——指向相机
  距离/zoom 连续域微差,非线宽/gap 几何错误。
- **camdist 扫描(no-cross-beams)**:0.92→166k, 0.94→165k, 0.95→164k,
  **0.955→164k, 0.96→35,780(最优,−17% vs 43,090)**, 0.965→36,593,
  0.97→37,204, 0.98→38,408。
- **重大发现:camdist≤0.955 全部塌到 ~164k**——相机距离微变跨过瓦片
  选层阈值(72m→68.7m),解码/请求的瓦片集变化导致灾难性退化。这正是
  终三一六的历史主嫌"瓦片请求选层(z18 选层/overzoom 请求路径)"的
  直接证据:选层对相机参数极端敏感且失败模式是请求错误/过少瓦片。
- 结论:①剩余 ~35.7k 的主体仍是 deck 洞/挡墙/阴影带+选层敏感域;②
  camdist=0.96 的收益说明 zoom/距离映射存在亚像素级系统差(与 8% 缩放
  信号方向一致但幅度不符,疑 pitch/中心偏移耦合);③下一刀=瓦片选层
  稳定化(overzoom 请求路径),而非继续微调相机。

**㉗ 终三一九g7(①选层诊断定论 + ③两件回退归因 + ④族结果补齐)**:
- **①选层**:camdist 悬崖实为 zoom 整数跨界伪影——0.955 时
  distance↔zoom 往返把 zoomLevel 推过 20(floor 跨界→cell level 17→18),
  直取 z18 路径渲染 164k(内容 2× 过大;MVT extent 实测 8192 非 4096,
  512px 源语义,疑直取路径 extent/frame 域错位)。fixture 本身
  (mapbox 18.94→flywave 19.94)稳定走 z17-cell+child-merge 路径
  (35,780)。选层稳定化工作项=直取 z18 路径的 extent/frame 校准
  (zoom≥20 域),对本 fixture 非阻塞。
- **③回退归因**(均为 deck 洞/阴影域,非白线绕向修复直接因果):
  shadows-roads-depth 1,209→6,436:expected 阴影蓝 (174,192,213) 我们画
  近白(5.4k px)——路面阴影覆盖缺失/偏移(阴影域);
  road-extend-tilecover-tunnel 5,897→19,538:expected 阴影 deck
  (162,179,199) 我们露背景(13.1k px)——deck 洞在阴影区(L4 Portal
  Graph 域)。
- **④族结果补齐**:74/75 件全(1 件仍缺,疑 leaf fixture 列表差异);
  全族 pass 1(depth-segments-undefined-crash-geometry-pass 0),
  no-cross-beams 43,090,最优 camdist=0.96 时 35,780。
- **②白线位置域**:markupbias 无效、全局旋转无效——错位为逐要素
  位置/宽度差,~8% 缩放信号未定位到单因;下一刀=白线逐要素对照
  (double-lines gap/offset 几何 vs expected 逐线位置)。

**㉘ 终三一九g8(②白线逐要素对照完成——归因反转:线位基本对,缺的是肩部带)**:
- MVT 解剖(fixture 单瓦片,解析器直读):extent=8192(512px 源语义);
  hd_road_centerlines 仅 3 要素(白线全部来源)、hd_road_line 29、
  hd_road_polygon 11(deck 填充)、hd_road_elevation 35;坐标跨
  [-8192..16384]=3×3 瓦片邻域(HD 路网瓦片携带越界几何,含 elevation
  点在 ±2 瓦片外)。
- deck 相对坐标对照(y=250 行 run-length,以对齐的 deck 为参照系):
  ①白线位置基本正确(右半区每条线 Δ≤4px,无系统性压缩——此前
  "0.92 压缩/8% 缩放"系左右不同要素对的误配);②**我们的白线宽
  ~1px(W3-4 vs exp W2-3)**——AA dilation/hard-step 域;③
  **奶油肩部带缺失**:expected deck 与背景间的 C8/B81(cream 肩部+
  间隙)我们画成 B96 背景——f1ece1 挡墙网格存在但 shoulder 带未画,
  即"挡墙/肩部分层"L4 缺口的主体;④deck 段窄 ~8%(D47 vs D43,
  边缘侵蚀);⑤左侧多画一条线(2 vs 1)。
- 结论:no-cross-beams 剩余 43k 的主力构成=deck 洞+肩部/挡墙带缺失,
  白线本身已接近对齐(位置±4px、宽度差 1px)。下一刀=①白线宽度域
  (AA dilation 校准,~1px/线×全线网=数千 px);②shoulder 带渲染
  (f1ece1 层的覆盖范围 vs expected 肩部几何);③deck 边缘侵蚀。

**㉙ 终三一九g9(白线宽度域 A/B——贡献极小,排除)**:
- 机理确认:emitter 按 +0.5px/侧 dilate 几何,shader step(-0.5) 把整个
  dilate 带保持全不透明(mgl 原式为淡出带)→每条实线 +1px,与扫描线
  实测(W3-4 vs W2-3)吻合。
- A/B(新旋钮 edgestep=1,step(0, mbDistEdge) 真边硬切):
  no-cross-beams 43,090→42,700(−390)——**线宽差贡献极小,排除**。
  旋钮保留 opt-in(默认语义不变)。
- 至此 no-cross-beams 剩余 ~42.7k 的构成定论:deck 洞/边缘侵蚀 +
  奶油肩部带缺失(挡墙/肩部 L4 分层)+ 阴影带。白线位置/宽度已
  基本对齐。下一刀=肩部带渲染(f1ece1 层覆盖范围 vs expected 肩部
  几何)与 deck 边缘侵蚀,均为多轮 L4 工程。

**㉚ 终三一九g10(肩部带归因:挡墙几何覆盖缺口,非剔除/排序)**:
- 奶油像素统计:expected 17,856 vs ours 2,471,重叠仅 21px——**系统性
  覆盖缺口(1/7 可见量)**,全图 16 个行带均匀缺失(非局部)。
- 排除:wallside=1(struct 材质 DoubleSide)A/B 无效果(42,710≈基线)
  ——不是绕向剔除;也不是深度排序(缺带处是背景非被盖)。
- mgl 源码对照(vendored elevated_structures.ts):bridge 结构=per-edge
  **guard rail**,截面 scale=0.5·metersToTile(≈0.5m 高,deck 顶之上),
  仅在 `edge.featureInfo.guardRailEnabled` 时生成;band 5-10px 与
  expected 吻合。我们只有 2 个 f1ece1 wall 网格(各 300 verts),可见
  条带 ~1px——**护栏段大量缺失和/或截面高度/锚定不对**(rail 应
  骑在 deck 顶 0..0.5m,我们的 z 5→6 是 1m 且顶面与上层层级齐平)。
- f1ece1 来源=fill-tunnel-structure-color 默认值;本 fixture 未启用
  guard-rail 样式属性,疑 per-feature data 属性(hd_road_elevation
  点层/guardRailEnabled flag)驱动不足——对应 L4 缺口清单的
  "护栏 per-feature flag"。
- 下一刀:①对照 mgl guardRailEnabled 判定链(featureInfo 属性来源);
  ②护栏截面几何(0.5m骑顶)逐顶点对照;③deck 洞(Portal Graph)。

**㉛ 终三一九g11(护栏锚定/截面定量化——长度对,高度与锚定疑错)**:
- guardRailEnabled 判定链对照:我们(m_bGuardRail 默认 true + per-feature
  evaluate)与 mgl(fill-construct-bridge-guard-rail 默认 true)一致——
  判定链无 bug。
- 护栏长度估算:expected 奶油 17,856px/带宽~6px ≈ 230m;ours
  2,471px/带宽~1px ≈ 190m(82%)——**护栏段数量/长度大致正确**,
  缺失的是可见高度(1px vs 5-10px)。
- 截面疑点(census 实测):rail quad z 5→6(1m 高);mgl 语义
  scale=0.5·metersToTile(0.5m,deck 顶之上)。两处可疑:①我们截面
  1m=2×(metersToTile/scale 域差);②锚定:上层 deck 顶=6 而 rail 顶
  =6——rail 被.deck 齐平吃掉(应 6→6.5)。疑 deck 分层(z=5 下层/
  z=6 上层)与 rail 锚定点差一层。
- 下一刀:①rail 顶点 z 与相邻 deck 顶 z 的差值 dump(确认锚定层);
  ②metersToTile/scale 域审计(0.5 vs 1);③deck 洞(Portal Graph)。

**㉜ 终三一九g12(护栏锚定验证完成——真缺陷:level-6 桥的护栏整体缺失)**:
- 探针(MBRailZ):construct() 内按 bridgeSection dump railZ vs ringH。
  结果:7 段护栏全部 railZ=[4.50..5.50](=level-5 环高 5.0±0.5);
  feat6=[4.10..5.50] 证明 rail 按顶点高度逐点正确(h±0.5 自洽,
  metersToTile 域审计通过——scale 换算 self-consistent)。
- **缺陷实锤**:fill 侧遥测(MBFillHD-bounds)显示 road-base 填充
  z=5.05(level-5 ✓)而 **road-base-bridge 填充 z=6.00(level-6 桥面)**;
  若桥的 rail 存在应跨 [5.50..6.50]——但全场景无任何 railZ 上限 >5.50,
  **level-6 桥的护栏 0 生成**。桥沿的奶油肩部带( expected 大量)因此
  全部缺失;level-5 段 rail 顶 5.5 vs deck 5.05 也只剩 0.45m 可见。
- 疑点收敛:bridge feature 的 ringHeights 经 portal 评估
  (evaluatePortals/prepareEdges 高度传播)被压平到 level-5(桥与
  lower road 之间的 portal 传播 bug)——mgl portal 传播语义需逐行对照。
- metersToTile 审计结论:我们的 setMetersToTile(C/(256·2^(z+1)))与
  mgl tileToMeter 域不同但 rail 截面经 /metersToTile 回转后自洽
  (feat6 证明),非根因。
- 下一刀:①evaluatePortals 高度传播逐行对照 mgl(level-6 压平点);
  ②确认 bridge feature 的 addElevatedFeature 是否真被调用/其
  ringHeights 值域(在 addElevatedFeature 入口加 per-feature dump);
  ③deck 洞(Portal Graph)。

**㉝ 终三一九g13(evaluatePortals 链定论——桥护栏缺失的真机制=高程采样,非 portal 压平)**:
- MBFeatH 探针(addElevatedFeature 入口 per-feature ringHeights dump):
  **全部 7 个 feature 到达时 ringH≤5.00**(桥 feature 亦然)——不存在
  "portal 传播把 6.0 压平到 5.0";**bridge 的高程采样本身就给了 5.00**
  (与 level-5 路同曲线,elevId 相同)。
- 但 expected 的桥面真实高度≈6.0:移除 resolveZOffset 回退链中的
  `properties.level`(+1)后 no-cross-beams 43,090→**43,469(变差)**——
  说明现行的 +1 'level' 回退恰好补偿了桥采样缺陷(5.0+1.0=6.0 ✓)。
  已回退该移除,基线保持。
- mgl 侧确认:zLevel 是 addPortalCandidates 的死参(mgl 从不加进高度);
  mgl 桥的 6.0 来自**真正的高程特征采样**(桥多边形关联 level-6 高程
  曲线,内部点 6m)。我们的采样把桥关联到了 level-5 曲线(elevId 与
  road-base 相同)——**高程 id 关联缺陷**是桥护栏缺失+肩部缺失的
  共同根因;护栏在 6.0 关联修复后会自然出现(5.5..6.5)。
- 下一刀:①桥多边形↔level-6 高程曲线的关联审计(hd_road_elevation
  35 点的曲线归属/3d_elevation_id 解析,对照 mgl getElevationFeature);
  ②修复后桥 deck 恢复真实 6.0(高度来自采样而非 level 补偿),rail
  5.5..6.5 自然浮出;③届时再移除 level 回退;④deck 洞(Portal Graph)。

**㉞ 终三一九g14(高程采样修复实验——阴性结果,已回退)**:
- 实验1:移除 `resolveZOffset` 的 `properties.level` 补偿 → 43,469(变差)
  ——expected 的桥面高度并非简单"6.0 无 level";
- 实验2:再移除 flatFeature 边界平地捷径(强制沿细分边细分)→ 与实验1
  完全同值 43,469——**桥特征无细分边**(getSubdivisionEdges 只在高度
  撕裂处生成,缓坡无),细分与否对桥无效;平地捷径非桥压平根因;
- 结论:①桥沿"6.00"在我们渲染中来自 level 补偿,在 mgl 中来自
  (未定位的)真实机制——census 显示 mgl 桥沿有奶油带而我们不能,
  但移除补偿/加细分都不收敛,**桥高度域真相未定**(可能 expected 桥
  面≈5.x,偏差主因另有其处:白线/挡墙 vs 桥沿的对位);②护栏可见度
  低的另一候选=护栏被 deck 边缘 Z 域盖住的比例问题,而非 0 高度差;
- 已回退至 HEAD(43,090 基线 + 探针);MBFeatH/MBRailZ 探针保留在库。
- 下一刀建议:①用 expected 奶油带像素级反推桥面真实高度(带宽度→
  护栏露出高度→deck 高);②deck 洞(Portal Graph)转向;③lighting 族。

**㉟ 终三一九g15(奶油带反推 + raillift 扫描——部分埋没确认,非主力)**:
- expected 奶油带实测:n=2703 条,带宽中位 **6px ≈ 0.58m 露出**
  (0.5m 护栏骑 deck 顶 + AA ✓ mgl 语义);ours n=1545(57%)、带宽中位
  **1px ≈ 0.1m**——护栏几乎与 deck 齐平或被盖。
- raillift 扫描(no-cross-beams):0→43,090,**0.5→42,175,1.0→41,485,
  1.5→41,497,2.0→41,323**——单调改善后平台,总增益 ~1.8k,远小于
  15k 奶油缺口;抬 2m 在几何上也与 expected 0.58m 露出矛盾。
- 判读:护栏存在且大致沿正确边线(数量 57%),但**可见带被压缩到
  ~1px 的机制未定**(候选:①deck 填充多边形外扩越过 ring 边界把
  rail 下半盖住;②rail 截面左右偏移(left 方向)朝路内;③mesh
  z 域差(墙 z 与 deck z 的 0.5~1m 系统差,g12 的 z=5..6 疑点));
  raillift 全截面抬升不能区分这三种,需带 side/横向偏移的扫描。
- 旋钮入库:raillift(runner MBSTYLE_RAILLIFT);默认 0 位级不变。

**㊱ 终三一九g16(nodeck 二分——排除 deck 遮挡,锁定截面自身)**:
- nodeck=1(隐藏 a3b4c8/red deck 填充)后:护栏只余 ~1px 细线
  (浅橙)沿路缘分布——**即使无 deck 遮盖,护栏可见量仍是 1px 级**,
  "deck 填充外扩盖住护栏"候选排除。
- 剩两候选:①rail 截面横向(left 方向)偏移朝路内,只露侧棱;
  ②rail 截面 z/尺度域差。而 metersToTile 数学自洽性已两度验证
  (±0.5m 精确),①嫌疑上升——mgl cross-section 左右各半
  (left±up·scale),若我们 left 方向/符号错,截面陷入路体。
- 下一刀:raillateral 旋钮(截面 left 分量符号/幅度扫描);
  或逐顶点 dump rail 四角 xy vs 环边界 xy(内外侧判定)。

**㊲ 终三一九g17(metersToTile 量纲修复全族验证——净改善)**:
- 3d-intersections 族重跑(71 件可比):总 mismatch 5,648,423 →
  **5,629,299(−19,124)**;25 件改善(>500px)vs 7 件回退。
- 改善主力:bridge-to-tunnel-transition −4,589、guard-rail-color-
  feature-dependent −4,377、road-islands −2,152、guard-rail-color
  −1,628、elevated-symbols-mixed* −1.4~1.5k——护栏/结构域全面恢复。
- 回退件:guard-rail-qkey-border +3,334(护栏显形后位置差暴露,
  旧状态护栏不可见反而"侥幸"对齐)、elevated-symbols-viewport-
  aligned-terrain-enabled +5,734、ortho-camera +1,542(待归因)。
- no-cross-beams 43,090→42,206;奶油像素 2,471→4,868,与 expected
  重叠 21→712(34×)——修复方向实锤,残余=带宽仍 2px vs 6px
  (疑截面 left 偏移或 z 残差)与横向对位。
- 下一刀:①回归件归因(qkey-border/viewport-aligned);②护栏残余
  带宽/对位;③deck 洞(Portal Graph);④lighting 族。

**㊳ 终三一九g18(回归件归因——护栏出现在 mgl 抑制的边上)**:
- 三件回退同签名:新显形的奶油护栏恰好落在 deck 边缘(erosion 深度
  全部 0px,无深入),而 expected 同位置是连续阴影 deck——**这些边在
  mgl 中不应有护栏**。
- guard-rail-qkey-border 件名即语义:quadkey 边界处护栏抑制;
  mgl addRenderableRing 的 isOnBorder 跳过 + portal 共享边剪枝
  决定哪些边出护栏;我们的边分类在该件/ortho-camera/viewport-aligned
  上与 mgl 不一致——旧状态被剃刀截面掩盖(g17 修复后暴露)。
- 净改善结论维持(−19,124):回退非 metersToTile 修复本身错误,
  而是暴露了边分类的第二层缺陷。
- 下一刀:①isOnBorder/portal 剪枝逐行对照 mgl(边分类);②护栏残余
  带宽(2px vs 6px);③deck 洞(Portal Graph);④lighting 族。

**㊴ 终三一九g19(边分类补充审计——isOnBorder 排除,qkey 维度待查)**:
- isOnBorder 逐行对照:实现一致(mgl EXTENT=8192,我们 canonical
  4096 空间等效);排除该差异。
- 回退件剩余嫌疑收敛到 portal 共享边剪枝的 **qkey/elevation-id 维度**
  (guard-rail-qkey-border 件名所指):mgl 对跨 quadkey 的边有额外
  抑制,我们对同 hash 边的处理可能多保留。
- 本轮定性完成:回退=护栏显形暴露的边分类第二层缺陷,非 g17 修复
  错误;影响量 ~+8k(qkey-border/ortho-camera/viewport-aligned),
  远小于修复收益 −27k(g17 −19,124 + 结构域改善件)。

**㊴补 终三一九g19b(portal 维度审计完成——同维全等,残余=跨瓦片注册表)**:
- 逐行对照结论:addPortalCandidates(type 赋值 entrance/border/
  unevaluated、onGround 阈值、isOnBorder)、connection id(plan.feature.id
  = 高程特征 id,与 mgl 一致)、prepareEdges 剪枝——**全等**。
- qkey 件实测(MBRailZ/MBFeatH):护栏逐点高度正确(h±0.5),
  多 level 叠加(ringH 0..5 多段)下行为正常;单瓦片路径无异常。
- 边抑制差异的剩余唯一维度=**跨瓦片高程注册表**(qkey 关联):
  mgl registry 带 tileId 且精确 tileId.key 匹配优先,我们的注册表
  构建/合并(mergeElevationFeatures)在跨 quadkey 场景的行为需
  专项 trace(下一轮,配合 qkey 件双瓦片 dump)。

**㊵ 终三一九g20(跨瓦片注册表 trace——结构等价确认,精度级差异待量化)**:
- 全链路审计完成:evaluate 的 border 重打标/singleton 丢弃/配对逻辑
  与 mgl 等价(唯一偏差=unevaluatedGroup 空时我们保留 entrance/border,
  方向与本回归相反且涉隧道入口语义,不动)。
- qkey 件 singleton 实测:三份图 total/kept=19/12、37/13、56/23,
  丢弃 singleton(→画护栏)7/23/31 条;样本显示边界 clip 顶点
  (y=0/4096、x=1309.5 等)单端点触边不判 border(与 mgl 一致)。
- 结论:单瓦片内所有维度(type/id/剪枝/evaluate/高度)与 mgl 全等;
  回退件的残余差异是**数据精度级**(clip 顶点坐标在两瓦片各自帧中
  的配对失败→两侧都成 singleton→都画护栏;mgl 同样单瓦片 evaluate
  无法跨瓦片配对——故 mgl 的对应行为需其实际 singleton 集验证,
  本地无 mgl 运行时,标注为开放项)。
- 影响量化:qkey-border +3.3k / ortho-camera +1.5k / viewport-aligned
  +5.7k,合计 ~+10k vs 修复收益 −27k。
- 下轮建议:①若无 mgl 运行时可对照,优先转向 lighting 族(160-196k,
  最大可动块)与 deck 洞;②qkey 件可试 clip margin/顶点量化对齐
  实验(两侧 clip 精度统一后 hash 或可配对)。

**㊵ 终三一九g22(lighting 族专项启动——apply_lighting_ground 落地,幅度待校准)**:
- 差异定量:expected 桥面/我们的比值 = 常数标量(deck 0.350 = 线性 0.0997
  ≈ 纯环境光 0.1 即全影;surface 0.445 = 线性 0.171 ≈ 环境 0.1+方向
  0.75·Lz)——mgl apply_lighting_ground 语义确认。
- 落地:patchFillMaterial shader 侧注入(颜色空间后 ×groundRadiance),
  防 via __mbGroundRadApplied + customProgramCacheKey 分键;均匀刷新处
  同步 uMBGroundRadiance;两处注入(fills 链 + per-frame 域)。
- 首测:lighting 196,539→191,129(−5.4k);text −5.3k;terrain-enabled
  −6.6k——方向正确,幅度不足(疑 dir 极角约定:polar 自天顶/地平、
  或 [az,pol] 顺序;实测需 Lz≈0.095-0.17,现取值偏大→调制偏弱)。
- 下一刀:①校准 dir 约定(mgl DirectionalLight 解析,预期 Lz≈sin/cos
  差一约定)→ 大块收敛;②影子域(桥全影 0.35=纯环境)与我们的
  shadow map 覆盖对齐;③deck 洞;④护栏带宽。

**㊵补 终三一九g22b(桥面全影机制定量确认)**:
- dir 约定确认:spec polar 自天顶([3.5,50] → Lz=cos50°=0.643);
  groundRadiance(水平)= linear 0.1+0.75·0.643=0.582 → sRGB 0.786。
- 桥面 mismatch 主体的真身:**expected 桥面 = 纯环境光**
  (0.35 = sRGB(linear(color)×0.1),逐通道核对 a3b4c8 ✓)——
  上层结构把下层桥面全遮影(shadow-intensity 1.0);
  (82,85,84)/0.445 = 桥影下的地面 road-base
  (= u_ground_shadow_factor=amb/(amb+dir)=0.1718 线性,精确吻合)。
- **缺口本质**:我们的 elevated fills 不接收影子——影子接收注入
  (injectGroundShadow)用屏幕空间地面平面重建世界坐标,对 5-6m 高的
  桥面取到地面处的错误世界位置→采样为"无影"→桥面保持未调制平色。
- 完整修复= elevated fills 换真 per-fragment 世界坐标 varying
  (wp varying + shadow matrix 采样),非地面平面近似;工作量中等。
- 已落地部分(g22):groundRadiance 常驻调制 −5.4k/件。

**㊵补2 终三一九g23(WP 接收器实验——阴性,已回退)**:
- 三种变体(modelMatrix wp / wp+3m 法向偏移 / aMBElev 属性平面射线)
  输出逐像素完全一致(163,383/163,076/192,057/193,738)且劣于
  无-WP 的 lit3(191,129/154,724)——注入对输出无影响或路径未激活
  (疑:①sweep 先于 patchFillMaterial 注入占位,②引擎 RTE 帧下
  modelMatrix/属性帧与 shadow matrix 帧不一致,③深度通道内容与
  语义缺口)。
- 已回退至 g22 已提交状态(groundRadiance 调制 −5.4k/件保留)。
- 结论:lighting 族完整收敛需要影子管线级的对照(深度通道内容/
  接收端帧一致性),建议以 mgl shadow_renderer.ts 逐行移植的方式
  立项,而非继续点状实验。

**㊵补3 终三一九g24(影子管线诊断——深度通道有内容,语义校准为残差)**:
- shadowdbg=5 诊断:deck 像素的影子因子读数逐像素变化
  ((54,68,86)/(100,107,105) 两类)——深度通道有内容、接收端采样
  在工作(并非完全失效);PCF 半影 + 覆盖范围与 mgl 的
  "桥面全影(纯环境光 0.35)"语义不一致。
- 修正后的 remaining 工作:①mgl 桥面全影语义来源定位(上层结构
  投影 or elevated deck 的自遮蔽规则);②影子覆盖率/半影校准;
  ③deck 0.445 区域的调制公式核对(0.455 实测 ✓ 接近 0.445 理论);
  ④groundRadiance 调制已落地(−5.4k/件)保留。
- lighting 族建议单独立战役推进(公式+覆盖+强度三件套),
  现有基线:lighting 191,129 / text 189,685 / terrain 154,724 /
  text-terrain 154,187(对比最初 196,539/194,961/160,792/160,901)。

**㊵补4 终三一九g25(lighting 族战役首查——真缺口=地形遮挡体缺失)**:
- 目视对照(expected vs ours):expected 全场近全影——右上大片暗色
  地形体(山体)投影覆盖路网,仅左上小楔形受光;我们的渲染完全
  没有该地形遮挡体,场景亮度/几何形态差异巨大。
- 结论:lighting 族 160-196k 的主体不是公式校准问题,而是
  **地形 3D 遮挡体缺失**(terrain-in-shadow-pipeline 战役):
  ①地形 mesh 是否参与影子深度通道;②elevated fills 的影子接收
  (g23 已证地面近似不可用);③场景级相机/几何差异待查。
- 建议:lighting 族独立立项(地形影子管线),不与 3d-intersections
  标线/护栏校准混线;现有 −5.4k/件(groundRadiance)保留。

**㊵补5 终三十九g26(deck 洞形态学——均匀边界内缩+坡道端缺失)**:
- 洞可视化(deck→bg 红色覆盖):expected deck 在**所有边缘**比我们
  多 2-3px(均匀内缩,非随机);坡道端部整段缺失(图顶区域);膨胀
  3px 仅覆盖 59%——剩余为内部孤岛(细分 sliver/掉片)。
- 两个子缺陷:①deck 多边形系统性内缩(clip margin/细分收缩/边界
  量化,待二分);②坡道端部整段缺失(Portal Graph 端点/终端
  连接,L4)。
- g14 教训复用:flatFeature 捷径不是内缩原因(已证与桥无关);
  内缩幅度 ~2-3px≈0.15-0.25m,疑 clip margin(ELEVATION_CLIP_MARGIN)
  或细分 cut-bridge 收缩。
- 下一刀:①clipRingToBox margin 数值实验(margin→0 A/B);
  ②polygonSubdivision 收缩审计;③端部缺失=Portal 终端连接
  (isTerminalVertex/entrance 分类)。

**㊵补6 终三十九g27(deck 洞归因修正——边界位移搅动,非多边形内缩)**:
- 面积/周长法定量:deck 面积比 0.962(净亏 6.3k),但 implied uniform
  inset 仅 **0.29px/侧**——"均匀内缩 2-3px"读数系边界位移搅动
  (24k 洞 vs 6.4k 反向多余 deck,净额小);我们周长 +13%(碎片化)。
- 结论修正:deck 洞的主体=**相机/帧微偏移((6,-12)px)导致的边界
  位移搅动**,而非多边形几何内缩缺陷;clip margin/细分收缩候选排除。
- 修正后的优先级:①no-cross-beams 最大单项杠杆=相机/zoom 映射校准
  (camdist=0.96 已证 −7.4k);②deck 碎片化的周长+13%(细分 piece
  接缝 AA)次之;③Portal 终端(坡道端缺失)范围有限。

**㊵补7 终三十九g28(camdist=0.96 跨件验证——非系统性)**:
- road-markups:74,690(基线)→ 77,810(camdist=0.96,**+3.1k 变差**);
  对比 no-cross-beams 同参数 −7.4k 改善。
- 结论:camdist=0.96 的收益为本件特异(边界搅动方向巧合),**全局
  相机距离补偿不可用**;相机/zoom 域的系统差不存在单一标量解,
  需逐域归因(疑 focalLength/fov 约定或 per-fixture 高度差)。
- deck 洞战役定性完成:主体=边界搅动(相机域),非几何内缩;
  下一刀回到 lighting 地形影子管线与 Portal 端点连接。

**㊵补8 终三十九g29(Portal 端点连接审计——实现等价)**:
- isTerminalVertex/computeVertexConnections/端帽 quad 生成逐行对照:
  与 mgl 完全一致(终端=无 from/to 连接的顶点;h<0.01 才出端帽)。
- 至此 Portal/护栏/高程/剪枝域的全部**可静态对照代码均验证等价**;
  3d-intersections 族的剩余差异全部收敛到三个需要运行时/数据级
  对照的开放战役:①lighting 地形影子管线(战役级);②相机域
  focalLength 运行时对照;③qkey 跨瓦片数据精度配对。
- 后续会话不再有"低成本代码对照"收益,转向=战役实施或
  mgl 运行时数据采集。

**㊵补9 终三十九g31(投射体登记修复落地——深度通道已含 elevated fills)**:
- 根因实锤:registerShadowCaster 只登记 extruded-polygon——HD elevated
  fills/structures 从未进入影子深度通道。已扩展登记(_hdElevation/
  __elev 技法,fill 分支补调用),census 实测 casters 25→73、
  enabled/intensity=1 正常。
- 接收端暂未变化(mismatch 持平 191,129):影子回流 CanvasTexture
  →接收端采样链路的对位问题(或地面接收器 uMBShadowIntensity 帧态)
  为下一刀;注意 DECODEDBG 的涂红钩子会污染该族视觉对比帧
  (诊断时改用采样探针)。
- 诊断资产:MBShadowCast census 探针入库。

**㊵补10 终三十九g32(接收端链路排查——活跃确认+矛盾定位)**:
- MBRf2 实测(cast2):接收器 int=1 活跃;corners n<3 时 (0,0,0)
  (未初始化窗口)后转绝对坐标 (35595715, 24291766, 0);shadow
  matrix m00=5.12e-3(RTE 帧拟合)。fragment 走 ray-cast 路径
  (uMBInvViewProj,RTE 坐标)不受 uMBGC 绝对值影响。
- 矛盾:深度通道已含 73 casters、接收器活跃采样,但新增 deck
  投射体前后输出逐像素一致——ground 接收器理应采到 deck 投影。
- 剩余嫌疑(需帧级调试,静态分析已穷尽):①独立上下文深度
  CanvasTexture 回流在此 fixture 未达主上下文;②影子相机 frustum
  与 deck 世界坐标帧不一致(m00 域);③接收器注入的材质集与
  实际可见地面 fill 不相交。
- 建议下轮:帧级 WebGL 调试(spector 类捕获或 debug 输出深度图
  本身到画布),定位回流/帧/材质三选一。

**㊵补11 终三十九g33(深度图目检+帧差——接收端链路已通,进入语义校准期)**:
- 深度图全量导出(MBShadowDump 探针):deck/结构条带在影子深度图中
  **完整清晰**(斜向走廊与 expected 影子方向一致)——回流✓、frustum
  取景✓(嫌疑①②排除)。
- 帧差(lit2 前 vs cast2 后):**89,029 px 变化**——投射体登记的
  视觉效果真实存在(此前"输出持平"系修好与弄坏对冲,计数守恒);
  mismatch 191,129 持平是分布问题非链路问题。
- lighting 族进入**语义校准期**:①影子覆盖率(mgl 桥面全影 vs 我们
  部分);②方向/半影;③强度渐变。均为 shadow map 内容→接收端
  采样的分布校准,不再是链路问题。
- 校准资产:MBShadowDump 深度图导出探针入库(帧 60 自动 POST)。

**㊵补12 终三十九g34(高程平面接收落地;lighting 残余确认为地形影)**:
- aMBElev 管线完整重建(g23 误回退已恢复):emitter elevAttr 逐顶点
  记录 → getDecodedTile 属性输出 → 接收端 ray-cast 平面 z=vMBElev
  (替代 z=0);injectGroundShadow 经 material.__mbElevPlane 门控
  (technique._hdElevation)。
- 实测:lighting 族 192-163k(与 WP 变体一致)——**未收敛,且
  expected 的暗区范围远超 deck 投影几何**——确认 g25 结论:
  elevated-symbols-lighting 的主体暗区=地形遮挡体投影,接收端
  校准无法单独收敛。地形体本身不在场景中(无 terrain mesh 源)。
- 已落地为 mgl 语义基建(保留):高程平面接收 = 后续任何影子
  语义校准的正确基座。
- lighting 族定性完成:战役=地形参与影子管线(需 terrain 源/或
  fixture 特有的 occluder 语义确认),非本会话可收敛项。

**㊵补12 终三十九g35(elevation-plane 定性为回归并禁用;extended casters 收益确认)**:
- 三态对照(no-cross-beams):elevation-plane 开=160,639(+3 normal
  offset 无效,同值)→ **gate 关闭=41,333**(优于 42,206 基线 −873)。
- 判定:①elevation-plane 接收器(net regression)禁用——self-shadow
  机制(deck 在自身深度条目)与 +3 offset 无效的原因待查,Attribute
  是否到达 shader 亦未证实;②extended casters(g31)独立收益确认。
- lighting 族四件与基线一致(191,129/189,685/154,724/154,187)——
  无回归。
- 结论:保留 extended casters + 禁用 elevation-plane(gate=false),
  净状态为历史最优;后继若重启 elevation-plane 需先解 attribute
  传递链验证(帧级)。

**㊵补13 终三十九g36(elevation-plane 回归根因实锤——GLSL 编译失败)**:
- elevvis 可视化探针(vMBElev 灰度染色):deck 整体消失 + 日志
  "THREE.WebGLProgram: Shader Error 1281 VALIDATE_STATUS false /
  Fragment shader is not compiled (MeshBasicMaterial)"。
- **g34 的 160k 回退根因实锤**:elevation-plane 接收器 GLSL 编译
  失败 → program 失效 → deck 材质整体不渲染(视觉=大片背景洞),
  与自阴影无关。历史最优 41,333(elevation-plane 禁用)保持。
- 后续修复入口:捕获真实 getShaderInfoLog(或在独立最小工程中
  复现该 GLSL),定位编译错误后 elevation-plane 才可重启。
- 旋钮入库:elevplane/elevvis(runner+test 解析,默认关闭)。

**㊵补14 终三十九g37(真实 GLSL 错误捕获 + 修复——elevation-plane 重启仍无效果, 保持禁用)**:
- MBProgDiag 探针(renderer.info.programs diagnostics)捕获真实错误:
  ①`'MB_SH_ELEVVIS' : unexpected token after conditional expression`
  =宏未定义时 #if 硬错误(已修:define 无条件注入 0/1);
  ②修复后 elevation-plane 启用=41,333(与禁用完全一致)——采样平面
  3m vs 0m 零像素差 → vMBElev 仍无效(疑 attribute 未达 shader 或
  编译仍失败但回落),需帧级 WebGL info log 深挖。
- 期间一次 JS 模板三目反引号缺失导致的编译断裂已修复。
- 当前最优净状态保持:no-cross-beams 41,333;lighting 族 191k/155k。
- 后续会话入口:①帧级捕获 aMBElev 值(或改用 uniform 高程+分材质);
  ②lighting 地形影子战役;③qkey 配对。

**㊵补15 终三十九g38(帧级澄清——no-cross-beams 无 cast-shadows,接收器不注入)**:
- 关键事实:no-cross-beams 的 style lights **无 cast-shadows** →
  shadowLightState=null → injectGroundShadow 的注入门不开启 →
  该件本就没有任何影子接收器(elevation-plane 门控在该件无效果,
  41,333 恒定 ✓ 与三态实测一致)。
- 此前"gate on=160,639"测量中的 elevation-plane 路径实际未执行;
  160k 与 41,333 的差异来自**其它 g34 内容**(疑 aMBElev 属性注入
  或当时状态混叠)——待下轮以干净 A/B 重新隔离。
- GLSL 修复已落地:MB_SH_ELEVVIS define 无条件注入(0/1),
  编译错误消除;elevplane/elevvis 旋钮齐备。
- lighting 族的"桥面全影"在 elevated-symbols-lighting(有
  cast-shadows)中另行验证——其接收器注入+采样链已通(89k px
  帧差),残余=覆盖/方向语义校准(开放)。

**㊵补16 终三十九g39(cast-shadows 件 A/B——门控语义修正)**:
- A/B 实测(ELEVPLANE=1 vs 0 在 elevated-symbols-lighting):计数完全
  相同(191,129/189,685/154,724/154,187)——因为 __mbElevPlane 实际由
  `_hdElevation !== undefined` 决定(HD fills 恒为高程平面),旋钮不
  控制它;两组同为高程平面接收,非真 A/B。
- 现状架构确认:HD fills = 投射体(g31)+ 高程平面接收(g34)+
  groundRadiance 调制(g22),影子链路完整;计数不随平面高度变化
  → 残余差距不在接收端采样,而在**深度图内容的语义覆盖**
  (mgl 桥面全影 vs 我们部分影,g24/g25 定性的地形/上层结构
  遮挡语义)。
- 后续战役入口不变:lighting 地形影子管线(需确认 occluder 源)、
  qkey 配对、护栏带宽。

**㊵补17 终三十九g40(lighting occluder 源确认——GeoJSON shadow-casters 层被丢弃)**:
- occluder 源实锤:elevated-symbols-lighting 的 style 含第二个源
  `shadow-casters`(type=geojson, 内联 FeatureCollection, 东京
  139.76E/35.66N 多边形足迹)+ 同名 fill-extrusion 层
  (fill-extrusion-height=200)——**200m 高遮挡墙**,把全场遮成
  expected 的近全影形态(仅楔形受光)。
- 我们的管线:MBStyleDataSource 只挑 best vector source(hd-roads),
  **geojson 源被整体丢弃** → 遮挡墙从未渲染/从未进影子深度通道 →
  地面无影、场景亮度与 expected 差 160-196k。
- 修复方案(战役):①解析 geojson 源(内联 FeatureCollection);
  ②构建 200m fill-extrusion 遮挡体;③注册为 shadow caster 并按
  mgl 语义决定是否可见渲染(mgl render-tests 的 shadow-caster 层
  惯例:深度通道 only);④验证 lighting 四件收敛。
- 这是 lighting 族的正确主攻方向;预期收益 100k+(四件总和)。

**㊵补18 终三十九g41(shadow-casters 墙未进解码——战役实施切入点实锤)**:
- 解码遥测(elevated-symbols-lighting,瓦片 18/232843/103242-3):
  maxH=10.66-11.5(道路高度),无 200m 特征——**shadow-casters 层的
  200m 遮挡墙未出现在解码输出**;geojson extra 源(§518 管线)未把
  该层送达 fill-extrusion 解码(或解码未按 fill-extrusion-height=200
  处理)。
- 实施清单(下轮直接动工):①trace geojson extra 源对
  shadow-casters 层的瓦片请求/返回;②确认 fill-extrusion 技法
  对 geojson 层的路由(height=200 墙);③墙入深度通道(casters,
  g31 已支持 extruded-polygon);④lighting 四件收敛验证。
- 本会话累计(no-cross-beams 167,916→41,333;lighting 196,539→
  191,129;guard-rail-qkey-border −83%)全部已提交,工作树干净。

**㊵补19 终三十九g42(战役实施推进——断点定位到"层要素未达解码")**:
- 已确认:①extras 机制(§518)本身支持 geojson 源(GeoJSONDataProvider
  注册路径存在);②fill-extrusion 技法默认值/路由存在
  (MBLayerEvaluator:147);③GeoJSON 层 source-layer 回退存在(:578)。
- 断点:瓦片 18/232843/103242 解码 maxH≈10.8-11.5(仅道路),无
  200m 墙——**shadow-casters 层要素未到达 tile 解码**。候选断点:
  a)geojson extra 瓦片请求未发起(该层未触发 extra fetch);
  b)GeoJSONDataProvider 瓦片化边界过滤把墙划出;
  c)层路由(sourceId=shadow-casters)未匹配到 extra 数据。
- 下一刀:decoder 逐层 feature 计数探针(layer×sourceId→feature 数),
  一次运行定位 a/b/c。

**㊵补20 终三十九g43(geojson extra 坐标换算修复——墙数据已入 stash)**:
- 断点实锤(b 类):extras 请求用 level-cell 坐标请求 level-mgl 瓦片
  (空间错 2×),shadow-casters geojson 全部 42 字节空响应;
- 修复:x/y 按 cell→mgl 层级差换算(<<up / >>-up)+ maxzoom clamp;
- 修复后:x=465686/y=206486 返回 **280 字节(墙要素数据)**——
  数据流打通(stash→decodeTileWithSources);
- mismatch 暂持平 191,129:后续为墙解码→fill-extrusion 渲染→
  深度通道→接收端采样的逐环验证(基建全部在位)。
- 连同 g31(投射体)+g34(高程平面接收)+g22(groundRadiance),
  lighting 族的链路骨架已全部打通,剩校准与验证迭代。

**㊵补21 终三十九g44(断点再收窄——geojson payload 解码未路由 fill-extrusion)**:
- MBExtraDec 探针(扩展 technique dump):child 解码结果
  techs=1 tech0={name:'fill', layerId:'background'}——**只匹配了
  background 层,shadow-casters(fill-extrusion)层未匹配/未产出**。
- 即:geojson payload 的 themed decode 走通了 background(特判
  __mb_background__),但 fill-extrusion 层在 geojson payload 解码中
  未被路由(decodeThemedTile 的 feature→technique 分发对该
  payload+层组合跳过)。
- 下一刀:①审 decodeThemedTile 对 geojson payload 的层迭代
  (visible/matched 逻辑与 sourceId 匹配);②fill-extrusion 技法
  对 geojson feature 的发射(height=200);③墙渲染+caster;
  ④lighting 四件收敛验证。

**㊵补22 终三十九g45(g44 断点证伪+双根因修复——邻居 instancesOnly 丢弃与 stash 64 上限逐出;墙已入场景)**:
- **g44 的"解码未路由"结论证伪**:mocha 复现(真实 style+真实
  MVT cell+stash 全链)证明 evaluate→fill-extrusion→
  emitExtrudedPolygon 全通(childMaxH=200)。浏览器探针
  ([MBWallPoly]/[MBExtraEntry])证实 3 片墙裁剪全部 matched=1。
- **根因①(主):邻居 extras 的 instancesOnly 丢弃几何**。§613 为
  model 源设计的语义(邻居瓦片只并 modelInstances,防重复实例)
  被 §644 无差别应用到 geojson extras——而 GeoJSONDataProvider
  的 payload 按 geojson-vt 语义**逐瓦片裁剪**,墙的 4 片裁剪有 3 片
  落在请求 cell 的邻居瓦片(中心片为空)→全部被
  decodeTileWithSources 的 instancesOnly 分支丢弃。
  修复:extras 增加 neighborsInstancesOnly 标志,geojson extras 的
  邻居 inst=false(vector extras 保持 true 不变;geojson 的
  点要素 filterFeaturesToTile 单瓦片归属无重复风险)。
- **根因②:sticky-stash 64 上限逐出**。高 pitch 视锥每轮请求
  ~72 个 cell(§终三一七 R4 的请求面),每 cell 一次 put;Map 按
  插入序逐出最老——恰是**最先 put 的贴目标 cell**(最贴近片
  18/232843/103242-3),其 stash 在解码时已被逐光
  ([MBSrcTake] cell=18-232843-103243 stash=none 实锤)。
  修复:上限 64→256 + take 命中时重插刷新 insertion order
  (持续解码的 cell 永不为逐出受害者)。
- 修复后([MBMergeOut]):三个 cell 全部 merge 且
  wallTechIdx≥0;[SCAST] 探针实证 **extruded-polygon 墙 Mesh
  (MeshStandardMaterial,vis=true,inScene,idx=27..54)已入场景**,
  outline LineSegments 按 patcher 惯例隐藏(edge-radius=0)。
- **lighting 四件**:208,659/206,475/192,702/191,211(带探针污染)
  →190,928/189,490/154,569/154,062(净修复,−110k 总量);
  对照干净基线 191,129/189,685/154,724/154,187 ≈ −125~−201/件。
  墙上屏但像素贡献 ~0 的残余=着色语义(墙 MeshStandardMaterial
  受方向光调制,expected 为近黑自阴影面)——与 g22b 的
  "桥面全影=纯环境光"同族,属 lighting 校准战役。
- **frame 考古存档(不影响修复)**:mocha 复现传
  webMercatorTilingScheme.projection(15.78M 帧)而浏览器 decode
  用 mercatorProjection(24.29M 帧)→flip 的 mocha A/B 符号与
  浏览器相反;浏览器 flip=mvt 维持正确(xworld≈35.6M/RTE 合理)。
  geojsonflip=0 旋钮入库(identity=null 非 0,0 是取负)。
- 探针入库(全部 decodedbg=1 门控):[MBSrcPut]/[MBSrcTake]/
  [MBExtraEntry]/[MBMergeOut]/[MBWallPoly]/[MBGeoJsonDec]/
  [SCAST]/[WALL200](WALL200 含矩阵世界顶点);catch 栈打印扩展。
  复现资产 test/MBXtraWall.tmp.test.ts(FLIP=0 env 切换)。

**㊵补23 终三十九g46(lighting 校准战役诊断——墙影未落地定量+接收链失效实锤)**:
- **WALL200 v0 x≈0 疑云结案:探针矩阵帧假象**。v0 读的是 RTE
  (相机相对)坐标:mwT=(55.6,−26.7,−71.8)+local(0.1,+26.7,0)——
  墙局部坐标正常,世界位置无缺陷。此前"x≈0/y=15.78M"是把 RTE
  坐标当绝对世界反投影的读数错误。
- **像素级定量(rmstyle=shadow-casters A/B)**:墙净贡献
  190,928(有墙) vs 189,638(无墙) = **+1,290px/件,净负贡献**;
  墙面画 7,346px,颜色 (100,110,123) vs expected 同位 (57,63,70)。
- **expected 暗区本体定性**:右上暗区 (57,63,70) 占全帧 44%
  (S 类 116,221px)+ (82,85,84) 33%(G 类 86,889px)= **地面全影**
  ——(57,63,70) ≈ deck albedo hsl(212,25%,71%)×纯环境光 0.1
  (linear→sRGB 计算值 (53,60,68) 吻合),非墙面本色
  (技术色 #000000,mocha WALL-TECH dump 确认)。
  墙影几何:方位 3.5°/天顶角 50°→影长 200·tan50°≈238m 向南,
  覆盖整个视场 ✓ expected 吻合。
- **我们的渲染 S 类=0**:全帧无一块全影地面。影子管线逐环:
  墙已入深度图([MBShadowFit] darkBox 全图+深度画布目检左上大块
  =墙)✓;shadow camera 视锥已框住 caster 盒(boxS 664×612×272m,
  ortho 宽 781m)✓;**但 NDC 角点 x∈[−1.41,2.23] y∈[−1.60,3.23]
  溢出 [−1,1]**——caster 盒(含远处道路件)超出视锥球,墙的
  上半部/部分地面深度被裁;courtyard-audit 读回 caster 自身
  UV 深度=1.0039(空/初始化值)——深度写入或比较链存在缺陷。
- **接收链失效实锤**:shrad=2.2(正交半径 ×2.2)A/B →
  逐像素完全同值(190,928 等)——影子视锥缩放对最终图像零影响,
  地面接收器的 shadow-map 采样对输出无贡献(g32"int=1 活跃但
  输出不变"的复现;非 knob 未生效,MBShadowRad 读点已核)。
- **定性(与 g23/g25 结论合流)**:lighting 四件的残余 15-19 万
  = 地面全影缺失,需影子接收管线级移植(mgl shadow_renderer.ts
  逐行对照:depth pack/unpack 约定、receiver uv 矩阵帧、
  near=−780 负 near 的 packed depth 语义),非点状实验可收敛。
  墙面着色 (100,110,123) vs 墙本体该为近黑,同属接收/光照链。
- 本轮净产出:两个管线缺陷修复(fa6e186d)+墙入场景+诊断闭环
  (expected 暗区=地面全影的定量证明);全族 71 件重跑
  6,020,621 总 mismatch(其余件不含 geojson extras,不受本轮
  修复影响,与 g17 录制基线的差异为多战役累计漂移)。

**㊵补24 终三十九g47(z 门修复+DIAG8——接收失效的最终形态定位)**:
- **z 门 bug 修复**:injectGroundShadow 的采样门 `mbWP.z <= 1.0`
  系 §692 地面平面(z=0)时代的遗产——g34 高程平面路径的采样面
  = vMBElev+3 ≈ 8m **恒被拒绝**,g34-g39 全部"elevation-plane
  无效/计数不随平面高度变化"之谜的真正根源。修复:海拔带
  `mbWP.z ∈ [-1,64]`(退化射线 |z|→∞ 仍被拒)。
- **新仪表 DIAG8**(shdiag=8):在 UV 门之前画 mbShadowUv.xyz
  ——UV 门之前/之后的区分仪(DIAG7=block 是否执行,DIAG8=
  uv 场,DIAG5=门后比较输入)。
- **最终形态定位**:DIAG7 证明 block 在可见几何上执行;z 门修复
  后 mismatch 仍逐像素同值;DIAG8 空间化:**地面 uv.y ∈ [0.62,1.00]
  (离散台地,块状边界≈瓦片界)与墙深度足迹 uv.y∈[0,0.15]
  永不重叠**——深度通道的墙投影与接收端地面重建在光空间存在
  系统性偏移(帧错位/每瓦片 uniform 差异),影子深度比较永假。
  DIAG5(z 门后)仍无像素进入=uv.x/y 越界占主导。
- **结论固化**:lighting 四件的地面全影缺失 = 接收端光空间帧
  错位,修复需 mgl shadow_renderer.ts 逐行移植
  (createLightMatrix 的 light view 构建与 our ortho fit 的差异、
  receiver ray-cast 帧、caster depth-pass 对象变换帧三者对齐)。
  z 门修复+DIAG8 为前置基建(已入库),移植时直接复用。
- 下一步(立项级):①对照 mgl shadow_renderer.ts createLightMatrix
  的 light view 矩阵推导(方位/极角→基向量);②审计 depth pass
  的对象变换帧(tile.center RTE vs absolute);③receiver 的
  uMBShadowMatrix 与 depth pass 的 viewProj 逐元素对拍
  (courtyard-audit 已具备读回通道)。

**㊵补25 终三十九g48(三步清单实施——对拍实锤 Bug A/B,RTE 修复落地,墙影首次上屏)**:
- **step1 createLightMatrix 对照**(vendored 3d-style/render/
  shadow_renderer.ts:678):球拟合公式逐行一致(k/centerDepth/
  lxjk);差异=mgl 在 mercator 归一化帧构光视图
  (cameraToWorldMercator + getWorldToCamera(ws, pixelsPerMeter)),
  我们在引擎场景帧(κ≈1/cos(lat) 各向异性);near 语义 ours
  缺 zoom17 min 项(次要);shadowDirection=指向太阳
  (sphericalPositionToCartesian a=az+90°),[3.5,50]→
  (−0.047,+0.765,+0.643)=光从北 → 影向南 ✓ 与 expected 吻合。
- **step3 对拍实锤(courtyard-audit+recv-mat-audit 双通道)**:
  ①uMBShadowMatrix(接收器)与 m_matrix(depth pass)逐元素
  **相同**(共享活对象)——矩阵无分歧;②**uMBInvViewProj 第
  3/4 列含 −17.8M/+17.8M = 绝对世界帧**!ray-cast 重建的
  mbWP≈35.6M 坐标,m_matrix(RTE 拟合,平移列 0.316/0.964)
  映射后 uv 全越界→门全拒→接收器恒亮。**Bug A=接收帧错位**
  实锤;③m_matrix 投影 box-center uv.x=1.503(出界),wall-top
  uv=(1.45,2.63,0.91)——**Bug B=正交框偏心**,caster 盒大部分
  在深度图外。
- **修复落地**:①getShadowUniforms 的 invViewProj 改用
  rteCamera(+projectionMatrixInverse 现场重算,终三十一先例)
  →mbWP 进 RTE 帧;②ray 采样面改 RTE 语义
  (elev: vMBElev−uMBEye.z / 非 elev: −uMBEye.z);③DIAG8 证实
  修复后地面 UV 场连续且落入墙足迹带(uv.y 0.04-0.06 与深度图
  左上墙块重叠)——**影子首次真正落地**。
- **自动 bias(Bug C=深度精度痤疮)**:16-bit 量子
  =(far−near)/65536≈0.021,legacy 0.0002 远低于 1 量子→全表面
  自影痤疮。bias 扫描:0.03/0.06/0.12/0.2/0.35 → lighting 对
  单调改善至 137.7-140.4k(0.2 最优,−50k/件)。**自动 bias=
  clamp((boxSpanZ−100)/range, 0.0002, 0.3)**:200m 墙件
  span 272-318→0.12+,薄板件(span≤76)→legacy 0.0002。
- **效果与代价(12 件 cast-shadows 全量对照)**:lighting 四件
  190,928/189,490/154,569/154,062 → **139,876/140,509/137,526/
  138,671(−133k,−50k/件 −15~−17k terrain 对)**;但薄板件回归:
  road-extend-tilecover +9.4k / shadows-roads-depth +18.7k /
  shadows-tunnel +40.0k(shadows-underpass/stacked 本轮未收到
  结果,预计 +10~30k)——其旧影系绝对帧错位下的"巧合对齐",
  RTE 修正暴露深度图帧真实偏移。净 −40k±20。
- **残余定性**:墙影已落地但深度图帧对齐仍欠(墙足迹 uv.y
  [0,0.15] vs 地面影带理论位置;薄板件回归同源)——即
  Bug B(正交框偏心)与深度 pass 帧的最终移植。方向已验证
  (RTE 帧落地即影子出现),移植完成预期 lighting 四件再收敛
  50-80k/件,薄板件回归同步消除。
- 旋钮/资产:shadowbias(手动覆盖)>__mbShadowBiasAuto(自动);
  recv-mat-audit/depth-matrix 对拍通道;g47 band 已撤(RTE 下
  原门语义自洽)。

**㊵补26 终三十九g49(Bug B 重定心实验+DIAG5 深度比较读数——收敛进入标定期)**:
- **Bug B 重定心实验**:legacy 分支相机定姿后沿自身 right/up 把
  caster 盒心投到 NDC(0,0)——lighting 四件**逐像素零变化**。
  结论:RTE 帧修复(g48)后墙已入深度图足迹带(DIAG8 地面
  uv.y 0.04-0.06 与墙块重叠),框心不再是约束;重定心保留
  (无害,可能利好其它件)。
- **DIAG5 深度比较读数(shdiag=5)**:deck 区画 (0.39,0.43,0.48)
  = R<0.5 → stored < uv.z → **遮挡判定在工作**;背景区无 paint
  (无注入)——接收链功能完整。
- **bias=0.2 视觉对照**:构图与 expected 对齐(deck 斜向/标线/
  护栏就位),墙影落地。残余两项:①expected 左上受光楔形区
  我们涂黑=影长超延伸(κ 各向异性使有效天顶角偏陡,影长偏长
  ——终三一一 κ=1/cos(lat) 同源);②边界/标线级精度。
- **下一步**:①light view 建 κ 校正(mgl mercator 帧等价:对
  lightDir 的水平分量除以 cos(lat) 或按 arrefFrame 仿射);
  ②bias 精调(0.2 附近二分);③受光楔形区=影长标定的
  直接 A/B 通道。
- 本轮数值(bias=0.2):lighting 139,876 / -text 140,509 /
  -terrain 137,526 / -text-terrain 138,671(对 g45 前基线
  −133k);薄板件回归同 g48(待 κ 校正后复测)。

**㊵补27 终三十九g50(κ/ArRef 实验与薄板回归定性——中间态固化)**:
- **ArRef mercator 帧实验**(sharref=1 + bias 0.2):lighting 四件
  回到无影基线(190,928 等)——mercator 归一化帧光视图同样
  不产影;场景帧与 mercator 帧两条实现均未达到 mgl 的影子
  覆盖,缺的不是帧选择而是 depth-pass caster 变换帧审计
  (原清单 step②,未完成)。
- **薄板回归定性**(shadows-tunnel bias 0.001/0.02 扫描):
  两值完全同值(137,168,对基线 +40,084)——回归与 bias 无关,
  是 RTE ray-cast 帧修正本身的代价:薄板件的旧影系"绝对帧
  ray-cast + RTE 拟合矩阵"两错抵消的巧合对齐,正确帧暴露
  深度图与期望影位的真实偏移。
- **现状固化(中间态)**:lighting 四件 137.5-140.5k(−133k,
  最大块 −19%);薄板件 +96k(4 件);净 −37k。修复方向
  (mgl 语义)已验证正确但深度帧移植未完成——影子覆盖为
  刀锋式薄对齐,对 shaz/shoff/shrad 全部敏感。
- **移植入口(下轮)**:depth pass 对象变换帧审计(caster 的
  matrixWorld 在 depth-pass 时刻的值 vs 主渲染放置值);
  mgl createLightMatrix 的 getWorldToCamera(ws, ppm) 等效物
  (场景帧→mercator 的 zUnit 换算)在 shadow camera
  构建中的补齐;完成后撤薄板回归并收敛 lighting 残余。

**㊵补28 终三十九g50b(bias 活体 uniform 化+烘焙竞态修复——最终态固化)**:
- **发现 bias 烘焙竞态**:MB_SH_BIAS 系编译期 define,烘焙于材质
  首次注入时刻;__mbShadowBiasAuto 由 shadow fit 每帧计算——
  注入与首次 fit 的先后顺序不定,同一代码在 139,876(有影,
  fit 先行)与 190,928(无影,注入先行)间摇摆。
- **修复三件套**:①renderer 的 fit 结果同时写成员 m_biasAuto
  与全局 __mbShadowBiasAuto(注入烘焙点读全局);②wire 早期
  无条件预种 __mbShadowBiasAuto=0.002(先于任何 tile 解码);
  ③接收器比较窗口改活体 uniform uMBShadowBiasW(±bias 对称,
  随帧刷新;首版误设 (bv,bv) 相同边=smoothstep 未定义行为,
  已改 (−bv,+bv))。
- **bias 下限 0.0002→0.002**:shadows-roads-depth 在 0.0002 下
  自影痤疮 25,070,0.002 → 7,095(痤疮清除,仅比基线 +692);
  该件存在 7k/25k 双稳态(帧时序敏感,标注开放)。
- **最终态(12 件 cast-shadows 对照)**:lighting 四件
  **139,876/140,509/137,526/138,671**(稳定复现,−133k);
  shadows-tunnel 137,083 / shadows-roads-depth 25,070(双稳态
  7-25k)/ road-extend-tilecover 187,097 / shadows-underpass
  168,642 / stacked-underground-roads 101,587(薄板回归合计
  ~+96k);其余件零变化。
- **收敛公式**:净改善依赖 lighting(−133k)与薄板回归(+96k)
  的权衡;两者同源于深度图帧错位——薄板件的旧"对齐"是绝对帧
  ray-cast 与 RTE 矩阵两错抵消的产物。彻底消除=完成
  mercator 归一化帧的光视图重建(g49/g50 已立项),届时
  薄板回归随帧统一而消失,lighting 残余(受光楔形/边界)
  随影长校正收敛。

**㊵补29 终三十九g50c(影子调制指数扫描——lighting 四件破 10 万)**:
- 发现调制指数 uMBGSExp(=pow(GSF,e) 的 e)是主导收敛参数:
  影子比较已工作(g48),暗化幅度由该指数决定。原线性理论值
  2.2 把 deck 压得过黑(139-140k);sRGB 空间经验最优 **e=1.0**
  → lighting 四件 **91,064/92,954/98,512/100,249**
  (对 g45 前基线 190,928/189,490/154,569/154,062 = **−50%**)。
- 完整曲线(bias 0.2):0.65→105-110k;**1.0→91-100k(最优)**;
  1.5→119-130k;2.2→137-140k。0.85/1.15 细分因会话中止未测。
- 旋钮 gshade=<e> 入库(live uniform uMBGSExp,注入种子+全局
  __mbGSExp);默认仍 2.2(零默认行为变化),**待办=薄板件
  (shadows-tunnel 等)在 gshade 1.0 下复测后翻转默认**。
- 同源结论:指数最优 1.0(=线性比值直乘)印证管线输出点为
  sRGB 编码后——与 g22 时代"片段为线性"的假设相反,该
  色彩空间错位是影子暗化长期偏差的根源。
- **下轮实施建议(次序)**:①解析法地面全影(中间态):geojson
  extrusion occluder 的 footprint 沿 lightDir 投影到地面平面成
  影多边形,shader 内 point-in-polygon(或预烘 Texture)对地面
  fills 施加 amb-only 调制——绕开失效的 shadow-map 采样,单一
  已知遮挡体族(render-tests 惯例)即可覆盖 lighting 四件;
  ②移植 mgl shadow_receiver 完整链(depth pack 约定+receiver
  uv 帧+near=−780 packed depth 语义)作为终态;③墙面本体着色
  (extrusion 3D-lighting 链,ext3d flag 未挂到该材质)。

**㊵补30 终三十九g50d(默认指数翻转 2.2→1.0——薄板件复测通过)**:
- **g50c 待办兑现**:全部 cast-shadows 十件在 gshade=1.0 下复测
  (runner 补 MBSTYLE_GSHEXP 管道):lighting 四件
  **91,741/93,565/99,149/100,743**(复现 g50c 曲线最优段,对
  默认 2.2 的 139,876/140,509/137,526/138,671 再降 40~48k/件);
  薄板件**零回归**:shadows-tunnel 136,838(2.2:137,083)、
  shadows-roads-depth 7,086(2.2:7,095)、road-extend-tilecover
  186,274(2.2:187,097)、shadows-underpass 161,245(2.2:
  168,642)、stacked-underground-roads 98,916(2.2:101,587)
  ——全线持平或小改善。
- **默认翻转落地**:MBMaterialPatchManager 注入种子
  `__mbGSExp ?? 2.2` → `?? 1.0`(gshade=<e> 旋钮仍可覆盖);
  单件冒烟(无 gshade 环境变量)验证默认路径。
- 运维注:shadows-underpass/stacked-underground-roads 在
  默认 180s 单测超时下必挂(SwiftShader 慢),需
  MBSTYLE_TESTTIMEOUT=600000 才能出数(g50b"未收到结果"同因)。
- **残余**:薄板件回归(+96k 族)与受光楔形超延伸未随指数
  翻转消失——同源深度图帧错位,归 g50 立项的 mercator 帧
  移植(depth-pass caster 变换帧审计+getWorldToCamera zUnit);
  影长/帧对齐收敛后薄板件才有真修复。下一步入口=原清单
  step②。

**㊵补31 终三十九g50e(step② 审计落地:caster 帧排除+κ 旋钮渐近定性)**:
- **caster 帧审计(shcastaudit=1 新旋钮)**:shadows-tunnel 73 casters
  在深度 pass 时刻逐帧导出 matrixWorld 平移+世界 AABB:全部
  近 RTE 原点(pos≈(169,149,−25.6),rteEye=(0,0,0),AABB z
  [−51.2,−25.5]),三帧读数逐位相同——**depth-pass caster 帧
  与主渲染放置值一致,绝对帧/时序错位排除**(g50 step② 审计
  项关闭:问题不在 caster 侧帧)。
- **κ 校正 A/B(shkappa=<k> 新旋钮,lightDir 水平分量×k)**:
  shadows-tunnel + elevated-symbols-lighting 族扫描(默认仍 1,
  零默认变化):
  | k | lighting(3件) | tunnel |
  | 1.0(基线) | 91,741/93,565/99,149 | 136,838 |
  | 0.669 | 86,801/88,793/97,043 | 136,262 |
  | 0.45 | 83,596/85,535/93,786 | 135,199 |
  | 0.3 | 80,976/82,788/91,168 | 134,768 |
  | 0.15 | 78,326/80,079/87,949 | 134,595 |
- **定性**:κ 响应真实(方向=缩短影长,与 g49 楔形超延伸
  判断一致)但**渐进无锁定**——每档 −2~5k 衰减,无极小值;
  tunnel 在 ~134.6k 平台化。κ 不是对齐机制,只是次级调制。
  k→cos(lat)=0.669 的几何假设被否定(若是真帧换算应在
  0.669 处出现突变/锁定)。
- **排除法收敛(g50 残余定位)**:caster 帧✓(本轮)、bias✓
  (g50)、调制指数✓(g50c)、帧选择✓(g50 两帧同败)、κ✗
  (本轮渐近)——剩余失配在**接收/深度图投影几何本身**
  (m_matrix uv↔正交 extent 映射,或 expected 影图案与我们
  shadow-map 图案结构性不同)。下轮入口:①用 shdiag 通道
  对同一像素同时读深度图内容与 m_matrix 投影 uv,直测
  uv↔texel 映射偏差;②或按 g50c 建议走解析法地面全影
  (footprint 沿 lightDir 投影,绕开 shadow-map 采样)。

**㊵补32 终三十九g50g(mgl 源码忠实对齐立项——plane-bias/snap 落地,−20k/件新最优)**:
- **路线转向(用户指令)**:停止盲扫旋钮,以 vendored mbgl 源码为
  唯一基准逐行对齐。参照文件:mapbox-gl-js/3d-style/render/
  shadow_renderer.ts(createLightMatrix 全文+setupShadows bias 向量)、
  shadow_utils.ts(shadowDirectionFromProperties+calculateGround
  ShadowFactor)、3d-style/shaders/_prelude_shadow.fragment.glsl
  (shadow_occlusion/shadow_sample/calculate_shadow_bias)、
  ground_shadow.{vertex,fragment}.glsl(地面接收=mgl 用
  shadowed_light_factor_plane_bias+ColorMode.multiply 独立 tile quad)。
- **对齐表(ground/fill 接收路径)**:①bias: mgl plane-bias
  (GDC2006 Isidoro,dFdx/dFdy 平面拟合)·texel_size+0.0001 →
  已替换 box-span auto window(#if MB_SH_MGL,默认 1);
  ②texel snap: mgl 无条件执行 → 已默认开(shadowmgl=0 回退);
  ③ground factor: mgl linearVec3TosRGB(pow 1/2.2) → **已实现但
  opt-in 关闭(shadowmglrgb=1)**:bundle A/B 中该单项致 lighting
  四件 +33k——我们的暗化链尚非 mgl 的 post-fragment multiply,
  因子空间等价性不迁移,待链路对齐后再启用;④occlusion:
  mgl GREATER sampler2DShadow 硬比较 vs 我们 packed smoothstep
  窗口(仿真等价,保留);⑤cascade: mgl 单 cascade abs≥1 → lit
  (我们 uv∈[0,1] 门同义);⑥light matrix: mgl mercator 帧
  FreeCamera+ppm zUnit,fit 球/近远面参数已逐项核对一致
  (near=h/50, far=ctcd×1.5, lxjk 球, far=r/dir.z),帧由 g50e
  审计证明场景帧自洽;⑦地面接收形态: mgl 独立 multiply tile
  quad vs 我们 fill 片元注入(混合序差异,暂等价保留)。
- **g50g A/B(shadowmgl bundle)**:全 bundle(含 sRGB):lighting
  126.7/128.2/132.4/133.4k(恶化);分解后 plane-bias+snap
  (无 sRGB):**71,918/73,649/81,883/82,955(对 g50d 基线
  91.7/93.6/99.1/100.7k 各 −20k,历史最优,首次破 8 万)**;
  tunnel 136,853(中性,+15);默认无参冒烟逐像素复现。
- **g50f 解析法归档**:shadowanalytic=1 首跑与基线逐像素同值
  =未激活,根因=ls.dir 指向光源约定(z>0),光行进方向需取反
  (已修 buildAnalyticMask);旋钮保留但路线让位 mgl 忠实移植
  (mgl 本身就是 shadow-map 采样)。
- **下轮(继续 mgl 对齐表)**:①sRGB factor 启用前置=暗化链对齐
  (mgl: out=mix(factor_sRGB,1,light) 在 fragment 末尾乘,我们
  注入点/fog 序不同);②墙体路径 shadowed_light_factor_normal
  的 mgl bias 向量 [0.00036,0.0012,0.012] 斜率公式;③light
  matrix 的 mgl 1e-6 mercator XY 量化(对齐 shimmer 语义)。

**㊵补33 终三十九g50h(暗化链对齐 mgl——colorspace-tail 乘法+sRGB 因子默认启用)**:
- **链路对齐落地**:three chunk 序=opaque→tonemapping→colorspace
  (sRGB 编码)→fog;原 ground-factor 乘法在 opaque 后=编码前。
  mgl ground_shadow.frag 的乘法在 sRGB 编码输出上(fog 前)。
  新增 MB_SH_MGL_TAIL 链:乘法搬到 `#include <colorspace_fragment>`
  之后(经 mbShadowLightOut 全局变量传递 mbLight),CPU 侧对 tail
  材质按 mgl linearVec3TosRGB(pow 1/2.2)转换因子
  (shadowmglrgb=0 退回;非 tail 材质保持线性因子——编码在乘法
  之后,数学等价)。
- **效果(默认无参)**:lighting 四件
  **71,135/72,868/81,651/82,705**(对 g50g 再 −200~800/件,稳定
  收敛);tunnel 136,850(中性)。数学上 tail×f_srgb ≡ 前置×f_lin
  (幂次可分配),−800 的小改善来自 tonemapping/编码序的残差。
- **墙体 bias 复测(负结果,二次确认)**:mgl vector-tile
  NORMAL_OFFSET 分支 bias(0.5·0.00010,_prelude_shadow.frag:70+
  shadow_renderer.ts:547)在 g48 帧对齐后重测:lighting 四件零
  变化,road-extend-tilecover +16.7k——16-bit packed 域与 mgl
  DEPTH16 硬比较的量化域不同,常数不迁移(§713 第二次确认)。
  已回退,窗口常数 0.0002 保留,域差异记录在案。
- **tilecover 203,010 开放项**:g50d 基线 186,274→现三连跑稳定
  203,010,且 shadowmgl=0(全 bundle 关闭)同值——回归与 mgl
  bundle 无关,属该夹具族时序双稳态(同 roads-depth 7k/25k
  先例)或批次构成敏感;待专项(独立录制帧时序)归因。
- **1e-6 mercator XY 量化(shadow_renderer.ts:780)暂缓**:仅影响
  光相机平移 shimmer(时序抖动),render-tests 静态单帧夹具零
  效果;待动态场景专项。
- **下轮**:①tail 链已通,下一步对齐 mgl 的 fog 序细节
  (mgl ground quad: shadow mix→fog mix 同色域);②tilecover
  双稳态归因;③薄板件结构性失配(134k 平台)仍是最大块,
  入口=shdiag 同像素 uv/texel 直测。

**㊵补34 终三十九g50i(shdiag 直测定性——薄板件 134k 平台主要是非影子基线失配)**:
- **方法**:shadows-tunnel + shdumpseries 采集 shadow-depth-canvas
  (frame 60,1024²)+shmat-compose(mMatrix/proj/viewInv/lr)+
  recv-mat-audit+courtyard-audit;离线做像素级闭合:expected
  影区像素→NDC→(uMBInvViewProj)RTE 世界→(mMatrix)uv→深度图
  texel,以及暗区符号化分解。
- **发现①(定性改写)**:期望暗区(<120)仅 12,866 px(质心
  443,397 右下),我们全图散布 74,073 px 过暗+75,742 px 过亮
  ——失配不是 texel 级偏移,是图案+颜色结构性差异。关键对照:
  **road-extend-tilecover-no-shadows 基线=163,814**——本夹具族
  关影子都有 16 万级 mismatch,tunnel 的 134k 平台大部分是
  **非影子基线失配**(fill/road 着色、fog、构图),影子路径的
  残余贡献只有 ~1-2 万级。**"完全对齐"3d-intersections 的
  主矛盾从此转移到族基线渲染,影子对齐已接近其贡献下限。**
- **发现②(覆盖几何)**:光相机正交半径 ±43.02 场景单位
  (lr 读数),caster 联合 AABB 跨 490 单位、可见地图 ~500 单位
  ——深度图只覆盖中心 ~17% 窗口;窗外 uv 出界→门拒绝→lit
  (与 mgl 单 cascade 语义一致)。窗口内地板/桥面自身在
  polar50° 下投影大面积本影=74k 过暗的来源之一。
- **发现③(工具缺陷)**:recv-mat-audit 的 uMBInvViewProj 快照
  在帧 1 采集时第三列全零(退化)——审计通道需改采后期帧
  (live 值正常,影子在渲染);待修。
- **下轮(按新主矛盾)**:①族基线失配拆解:tunnel 关影子
  (shadowdisable=1)跑基线,把 134k 分解为影子项 vs 基线项;
  ②基线项按 mgl draw_fill/road 着色链逐项对照(新对齐表);
  ③修 recv-mat-audit 采集时序。

**㊵补35 终三十九g50j(影子项 vs 基线项精确分解——tunnel 影子项=+39.8k 净回归)**:
- **分解(shadowdisable=1,参数管道补全:测试文件此前未解析该
  arg,首跑无效)**:tunnel 关影子基线=**97,083**(恰为 g48 前
  巧合值),开影子 136,850→**影子项净回归 +39.8k**;lighting 关
  影子基线=191,129(≈g45 前基线),开影子 71,135→影子项
  **−120k 净收益**。影子质量分裂:lighting(墙 occluder)已
  大幅正贡献,薄板(桥面/隧道)仍负贡献。
- **影子像素隔离(current_with vs current_without)**:tunnel
  影子项=42,369 px 全部变暗(零变亮),质心 (303,255),bbox 全
  图;expected 真影质心 (436,391) 12.8k px。**仅 6,275 px 落在
  expected 影区内(且不够暗:128 vs 86.5),36,094 px 是区外
  伪影**——影子图案方位性错位+真影欠暗。
- **方向 A/B(shdiralt=1/2)**:图案确实移动(各 ~33k px 变化)
  但 mismatch 恒 ~136.9k(±68)——**图案在任意方位角下都不
  匹配**,排除单纯方位角镜像;失配在抬路结构几何层面。mgl
  fill.fragment.glsl 有专用机制:`#ifdef ELEVATED_ROADS in
  float v_road_z_offset`+draw_fill_extrusion 的 elevated 路径
  ——本夹具的桥面/隧道正是 elevated roads,下轮对齐表入口=
  mgl ELEVATED_ROADS 链(depth 排除语义/z_offset/ground shadow
  tile 相交裁剪)。
- **基线项**:tunnel 97k 基线=剩余最大块(fill/line 着色/AA),
  对齐表首行已备(mgl fill.fragment: out=color→×ground_rad→
  ×mix(factor_sRGB,1,light)→fog→×opacity,opacity 在 fog 后)。
- 顺带:recv-mat-audit 帧I invViewProj 退化=审计采集时序问题
  (live 正常),待修。

### §885 终三十九g50l/m/n: 3d-intersections 族专项对齐轮——全族 75 件新鲜基线 + circle-elevation-reference 落地 + 瓦片抓取集合假设否定 + Munich 桥面剔除实锤（fsds −91.6%）（2026-09-18）

**① 全族新鲜基线（3di-g50k-base，chrome-headless-shell 131 指纹，75 件分批协议）**：
71 件收齐（shadows-double-shading-{regression,ramps-regression}/shadows-junction/zLevel
4 件缺，疑 leaf 清单差异），总 mismatch 5,709,452。g50k（elevplane 默认开）对
g50j 台账值验证：lighting 四件 71,056/72,802/81,453/82,507（对 g50h
71,135/72,868/81,651/82,705 各 −80~200，中性偏好）；shadows-tunnel 136,802
（中性，薄板影子项 +39.8k 回归维持）；shadows-underpass 146,932（对 g50d
161,245 −14k，疑双稳态）；shadows-roads-depth 24,204（7k/25k 双稳态的高位）；
road-extend-tilecover 202,964（203k 双稳态位）。**主簇分诊**：elevated-symbols
非光照簇 ~1.48M/16 件=族内最大块；guard-rail 系 ~0.65M；tunnel 系 ~0.55M；
road-markups 系 ~0.35M；elevated-circles 系 ~0.27M。

**② g50l（circle-elevation-reference 落地，零回归）**：mgl
circle_hd_extension 语义移植——`circle-elevation-reference: 'hd-road-markup'`
把每个圆心抬到 HD 高程曲线上（processPointFeature 发射循环内逐点
sampleHeightCanonical + markup bias；terrainActive 门控=mgl draw_circle 仅非
terrain 绑 elevated buffer；yDelta 校正同 resolveZOffset HD 支路）。此前 circle
层完全不解析高程（resolveZOffset 类型联合无 'circle'，emitter 亦无）。A/B
（5 件 + 6 件对照）：circles-tunnel 73,621→72,009（−1,612）、tiled −102、
mixed −35、*terrain-enabled/nonelevated 位级不变；lighting 四件 + ncb + tunnel
**全部逐位不变** → 零回归。收益小的原因见④（这些夹具主体失配是桥面缺失，
非圆点高程）。

**③ g50m（瓦片抓取集合假设否定 + 主线程遥测）**：worker 侧遥测
（[MBTileDec]/[MBMergeChild]）进不了 karma 控制台 → 新增 [MBTileReq]
provider 请求遥测（MBStyleDataSource，decodedbg 门控，主线程可见）+
tileblock=<x-y,...> 诊断旋钮（屏蔽指定 mgl 级瓦片）。新工具
scripts/mgl-cover-hd-probe.ts：tsx 直驱 vendored Transform（零移植漂移），
按夹具相机离线计算 mgl 最终抓取集合（coveringTiles +
extendTileCoverToNearPlane + extendTileCoverForTunnels，即 source_cache.ts
elevatedLayers 分支）。elevated-symbols 实测：**mgl 最终集合=6 块，仅 2 块
命中语料库**（232841-103245/103246）——mgl 靠这 2 块的 ±1 瓦片越界几何渲染
整个视场；我们 z17-cell+children-merge 抓到 4 块内容瓦片（mgl 的 2 块+北块
232843/232844-103242/103243）。tileblock A/B（屏蔽北块）：**全簇恶化**
（lighting +192%、mixed +89%、symbols +4%，icons-and-text 0%）——北块越界
几何是净正贡献（同一批路面在多瓦片间冗余）→ **抓取集合对齐不是主矛盾**，
开放项关闭。

**④ g50n（Munich 桥面剔除实锤——elevated-circles-nonelevated 主失配根因
+ 族级签名）**：该件 81,135 的主体 = 期望路蓝→我们画背景（84.0k/85.5k），
即上层桥面网格整体不可见（车道线/圆点位置正确）。取证链：①涂红+DoubleSide
（decodedbg 现有钩子）→ 桥面完整渲染，与 expected 路网 IoU=0.881；②rmstyle=
background 无效（−260，非背景遮挡）；③**fsds=1 新旋钮**（全 fill
DoubleSide，MBMaterialPatchManager + test 参数管道）→ **81,135→6,846
（−91.6%）**——桥面被 FrontSide 剔除实锤，且下层内容近乎像素级对齐。
**族级推广（fsds=1 扫描）**：elevated-symbols-icons-and-text 106,880→39,220
（−63%）、*-terrain-enabled 111,547→58,296（−48%）、elevated-symbols
45,358→35,165（−22%）、circles-tiled 45,638→32,899（−28%）——**族内大簇的
"缺失路面"主体 = 被剔除的背面填充网格**（mgl 语义为 CullFace.backCW，正面
应可见）。受测 5 件全部改善、无一回退（ncb 41,264→37,632 −8.8% 亦改善
——Turku 也有背面网格），fsds 当前是净赢旋钮；默认翻转前的门槛=全族 75 件
配对 A/B + sphere 投影域核查（§808 白带：globe 远侧 fill 靠 FrontSide 剔除）+
跨族（fog/terrain/model-layer）抽查。
**矛盾（下轮首案）**：emitElevatedFillPiece 的绕向链（signed-area 归一化 +
earcut 恒 CCW 输出[离线实测验证：CW/CCW 输入输出均 +2] + (a,c,b) 三角翻转）
对所有 piece 数学上输出恒定朝向，但同夹具内 road-base（85v，细分路径，z
0.05..0.94）可见而 road-base-bridge（22v，平地捷径，z=6.00 恒平）被剔除；
Munich 与 Tokyo 的 MVT extent（8192）/源数据首环绕向（均 CCW-in-y-down）/
flip 配置全部一致。下轮取证入口：①逐网格 matrixWorld 行列式（负缩放/镜像
变换翻转会翻转屏幕绕向——一次 run 可定）；②uMB3DDbg 逐 draw 对拍两网格的
材质/属性态（aMBElev 属性链 g50k 默认开后 22v 网格的 attribute 完整性）；
③flat-shortcut 专测（平地捷径 piece 与细分 piece 的逐顶点绕向 dump）。

**⑤ 其余记录**：simple runner 不转发自定义 karma arg（MBSTYLE_EXTRA_ARGS 仅
chunked runner 支持）——诊断 A/B 必须走 chunked runner；单位测试 309 passing
（emitter 改动零破坏）；lib 构建含全部改动（mapview 既有 tsc 报错与本包
无关）。

### §885 终三十九g50o: 背面剔除根因闭合与默认翻转落地——merge 子瓦片索引反转系双重翻转；mercator 不透明 fill 默认 DoubleSide（全族 −40.5%，N=2 逐位复现）（2026-09-18）

**① 逐网格取证工具（faceprobe=1，捕获帧触发）**：早期 AfterRender dump 时
路网网格尚未入场景（重解码 churn），改为 assertCanvasMatchesReference 前
dump；首三角形法线采样被细长三角形污染（同网格 ±1 随机），升级为**面积加权
zSum**（全部索引三角形世界叉积 z 求和，符号=主导朝向）。

**② 根因锁定（Munich elevated-circles-nonelevated 81,135 主体）**：
emitElevatedFillPiece 逐 piece 审计（[MBWind]，decodedbg 门控）证明输出绕向
恒定（areaIn<0→rev=false→earcut 恒 CCW[离线实测：CW/CCW 输入输出均 +2]→
emitted=-earcutOut 全部 CW）。渲染态面积加权探针（faceprobe）却测出**同夹具
内 a3b4c8 网格两群朝向相反**（22v deck zSum=+9249 被剔；85v ground
zSum=−11658 可见；fsds=1 时两群全部可见且 −91.6%）。分歧点=
**MBStyleDecoder.decodeTileWithChildren 的子瓦片索引反转**（§512 初版合并时
加入，早于 终三一八补8 的 emit 侧翻转；注释称"y 镜像翻转弯向"，但 §511 后
子瓦片与直取同帧、rebase 纯平移不改绕向）——合并子瓦片=双重翻转=背面被剔；
近场直取 z18 cell 不过合并路径=正面可见。

**③ 修复的边界（windnorev 全族 A/B，N=1，72 件可比）**：整体默认移除反转
**不可行**——5,781,577→5,927,584（+146,007）：改善集 road-markups-no-
elevation −85%/nonelevated −61%/las-vegas −19%/versioning −46%/tunnel-ortho
−55% 等约 −160k，被全合并内容夹具的回归集抵消（guard-rail-qkey-border
+373%、no-cross-beams ×4（41,264→164,159）、tile-border +95%、palo-alto
+43%、debug-elevation-ids +48% 等 +306k）。两族夹具对合并绕向的要求相反，
分层判据未定位（开放项）。反转保留为默认，windnorev=1 退出旋钮入库。

**④ 默认翻转落地（正解）**：绕向约定分裂对"剔除正确性"无解，但 DoubleSide
对不透明无光照 fill 视觉等价（两面同像素同色）且对约定分裂免疫。落地=
MBMaterialPatchManager：**mercator 投影 + techName fill + 非透明材质默认
DoubleSide**（sphere 保持 §808 FrontCull 远面剔除；透明 fill 保持现 side 防
双混合；fsds=0 退出）。**全族 A/B（3di-fsds-n1，75 件）**：5,709,452→
3,395,290（**−2,314,162，−40.5%**）；改善 66 件（road-markups −77%、
road-islands −75%、guard-rail-color-feature-dependent −72%、circles-tunnel
−69%、oriented −68%、fog −65%、no-light −50%、versioning −81%、
tilecover-tunnel −89%、guard-rail-split −98% 等），回归 6 件共 ~58k
（shadows-tunnel +14%＝背面叠影、elevated-wireframe +21%、tooling-support
+62%、tilecover +4% 等，已知代价）。

**⑤ N=2 配对复现（3di-fsds-n2，默认无参路径，70 件可比）**：与 N=1
（fsds=1 显式 arg 路径）**全族逐位一致**（3,365,162=3,365,162，零漂移，
无单件 |Δ|>500）——默认翻转与 A/B 旋钮同一路径，结果稳定。跨族冒烟：
fill-antialias/fill-color/fill-opacity 8 件全部 0 px PASS（含透明度变体，
透明排除生效）。单位测试 309 passing。

**⑥ 下轮入口**：①回归 6 件归因（shadows-tunnel 背面叠影疑=deck 背面画进
trench 阴影区——可试 renderOrder/材质级 BackSide 局部化）；②两族绕向约定
相反的分层判据（Turku 全合并需反转 vs Munich/Tokyo 合并需不反——疑与瓦片
锚定帧/geoBox 有关，跨 fixture 变量仅 lat/bearing/直取覆盖比）；③icons
~2.5× 放大（icon-size 求值域）与车道线 2-3px 位移（symbols 簇剩余）；④
tunnel 薄板影子 +39.8k 回归与 road-extend-tilecover 203k 双稳态维持开放。

### §885 终三十九g50p: ortho 簇修复——祖先钳制走 stash+merge（mgl overscaled 语义），ortho-camera-tunnel −87%（2026-09-18）

**① 分诊**：DoubleSide 默认态（g50o 后全族 3,395,290）的 top 失配里，
ortho-camera-tunnel 156,311 的签名=期望路蓝→我们画背景 139k（路网整体缺
失）+ 内容整体错位（目视右移半幅）。shadows-tunnel 152,309（d>60）的主体=
我们过暗（ours (32,64,64) 106,941 px vs expected (153,165,177)）＝trench 视
角下 DoubleSide 放进了 deck 背面/阴影调制面（mgl FrontSide 剔除），属 g50o
默认翻转的已知代价（+19,270），与基线期 97k 暗区并存。

**② ortho 簇根因（[MBTileReq]/[MBPlace]/[MBGeoBox] 遥测实锤）**：ortho-
camera-tunnel 为 zoom 20.0 → cell level 19 > 源 maxzoom 18 →
MglMaxZoomAncestorProvider 祖先钳制（z19/84264/203289 → z18/42132/101644）
——但祖先 z18 瓦片的字节被用 **z19 cell key** 解码：z18 瓦片内容（跨 4 个
z19 cell）被压进 z19 cell 的 geoBox/flip 帧 → 路网错位+部分缺失。mgl 语义=
overscaled tile：几何帧用瓦片自身层级（z18），请求层级只影响缓存/绘制。

**③ 修复**：MglMaxZoomAncestorProvider 钳制命中时改走 §511 同款 stash+
merge——mbPendingChildrenPut(cellKey, [ancestor]) + 返回 GeoJSON marker，
解码器以祖先 key 帧解码后 rebase 到 cell 中心（帧正确；cell 外多余区域被视
锥剔除无害；tileblock 屏蔽同样生效；z19/z18 等任意深度差通用）。

**④ A/B（4 件 + 对照）**：ortho-camera-tunnel 156,311→**19,838（−136,473，
−87%）**；ortho-tunnel-small-viewport 3,286→1,283（−61%）；tunnel-ortho
5,559→5,255（−5%）；对照 no-cross-beams 37,632 逐位不变。ortho-camera
（zoom 19.0 → cell z18 直取，无钳制）+0 不适用，其 74,728 为独立问题（下
轮：pitch-0 直取帧审计）。全族影响面=cell level>maxzoom 的夹具（zoom≥19.5
域），旧渲染本就错位，无依赖风险。

**⑤ 下轮入口**：①shadows-tunnel 背面叠影的局部化（~19k：DoubleSide 下
trench 视角 deck 背面/阴影调制面覆盖路面——候选=对 shadow 接收材质用
gl_FrontFacing 跳过背面片元，或 trench 域 renderOrder）；②ortho-camera
74,728（pitch-0 直取 z18 的独立帧/内容问题）；③两族绕向约定相反的分层判据
（g50o 开放项）；④icons ~2.5× 放大与车道线位移（symbols 簇剩余 ~600k）。

### §885 终三十九g50q: shadowfront 背面调制跳过（分裂，不默认）+ icons pixelRatio 修复（oriented −21%）（2026-09-18）

**① shadowfront=1（gl_FrontFacing 跳过背面地面阴影调制，DEFAULT OFF）**：
机理=DoubleSide 下背面片元被阴影调制覆盖路面（shadows-tunnel trench 视
角）。A/B：shadows-tunnel 156,072→**107,127（−48,945，−31%）大赚**，但
lighting 四件 **+26k~+68k 大回归**——它们的可见阴影接收面本身是合并反转面
（gl_FrontFacing=false），跳过=关掉其影子。同一机制两类夹具效果相反（哪个
背面可见由内容决定），**不可全局默认**，旋钮保留（默认关）。根治仍=绕向分
层判据+逐网格归一化（g50o 开放项）。

**② icons pixelRatio 修复（落地）**：[MBFace] 时代测得 symbols 箭头
~2.5× 放大。sprite 解剖：3d_intersections 箭头 130×362 **pixelRatio 2**；
mgl sizedIcon 显示尺寸=物理 px/pixelRatio × icon-size（362/2×0.047≈
8.5px=expected ~10px ✓），引擎 PoiRenderer computedWidth=纹理物理宽 ×
iconScale（362×0.058≈21px=ours ✓）。修复=emit 边界把 sprite pixelRatio 折进
iconScale（MBTileDataEmitter s_spriteInfos 查询；pr=1 sprite 不变；标准
mapbox 测试 sprite 多为 pr=1 不受影响）。A/B：**elevated-symbols-oriented
54,125→42,957（−11,168，−21%）**、symbols −2,430、mixed −1,502、lighting
零变化、icons-and-text −1,631、icons-and-text-terrain −1,965、pitched
+1,192（该件已知多稳态抖动域）。运维：iconfix 首跑撞上前轮泄漏的
8096 结果服务器（结果串目录），杀进程换 8097 重跑干净——**跑测前必须确认
无残留 RenderingTestResultServer 进程**。

**③ 剩余（按量）**：symbols 簇残余 ~500k（icons 尺寸对齐后的位置/相位
差）、ortho-camera 74,728（pitch-0 直取 z18，正交相机旋转/斜切目视，引擎
相机域）、shadows 系过暗（97k 基线暗区+影子项，g50j 分解维持）、两族绕向
分层判据（g50o）。

### §885 终三十九g50r: ortho-camera 重新归因——地面光照双重施加（×1.171），旋转假说否定（2026-09-18）

**① 旋转假说否定**：目视"路网倾斜"系颜色 mask 失配误导（我们路面色
(190,209,233) 不在 (162,179,199)±28 窗内，PCA 量到白线噪声）。用实际色重测：
expected 主轴 0.83° vs ours 0.82°——**旋转差 −0.01°，bearing/相机旋转正确**
（heading=34.46 已施加，[MBCamDump] 扩展 bearing/heading/pitch/camProj 字
段）。正交相机 style（camera-projection: orthographic）引擎无实现，当前以
perspective+pitch0 渲染，透视收敛差在此尺度可忽略。

**② 真实根因=地面光照双重施加**：ortho-camera 有 cast-shadows（dir 0.5、
[180,40]）+ zoom19 外推 fill-color。实测 ours = raw×1.171（raw=hsl(212,
25%,71%)=(162,179,199)）；mgl expected = raw×1.0794 = raw×sRGB(linear
radiance 1.183)（amb 0.8+dir 0.5·cos40，linearVec3TosRGB 后 ×1.0794 ✓）。
1.171 ≈ 1.0794² —— **g22 的两处注入（injectGroundLighting 的 uMBGroundRad
+ per-frame 的 uMBGroundRadiance）对 cast-shadows 夹具同时生效**，调制被平
方。[MBGrRad]/[MBShadowRecv]/[MBRf2] 遥测在该件 0 输出=阴影接收 refresh 块
未激活（光照调制走 uMBGroundRad 链），与 lighting 四件（refresh 激活、单链
生效、颜色匹配）路径分叉吻合。

**③ 下轮首刀**：两链去重——injectGroundLighting（uMBGroundRad）与
uMBGroundRadiance 互斥（一份保留，倾向保留 per-frame uMBGroundRadiance——
lighting 四件已用其配平）。A/B=ortho-camera（预期 −74k 的大部分）+ lighting
四件（确认不回归）+ shadows-tunnel。诊断入库：[MBCamDump] 扩展字段、
[MBGrRad] uniform dump（decodedbg/阴影 refresh 门控内）。

**④ g50r 补（去重 A/B 结果与 ortho-camera 再排除）**：地面光去重（移除
mbShadowSample 内的 uMBGroundRadiance 乘法，groundlitdual=1 可恢复）A/B：
lighting −1,489/−1,531、lighting-terrain −303/−138、shadows-tunnel +1、
symbols/nonelevated ±0、**ortho-camera +0**——小净赢、mgl 忠实单链，落地。
**ortho-camera 74,728 再排除**：地面调制差（×1.085 vs ×1.0794≈1/255）远低
于 d>60 阈值，非其根因；其主体=**位移/重影**（目视双边路缘=§662 重复 tile
对象双锚定的直取变体），下轮=对 ortho-camera 跑 [MBPlace]/[MBSceneObj] 对
拍重复对象的锚差（正交相机 zoom19 直取 z18 的重解码锚漂移）。

### §885 终三十九g50s: ortho-camera 根因终定位——正交相机缺失（透视放大高程路面），修复方案定型（2026-09-18）

**① 双锚定假说否定**：[MBPlace]/[MBSceneObj] 遥测（decodedbg）——四个 z18
tile（232843/232844 × 103242/103243）anchor 全部自洽（=tileCenter−eye，四角
(−46,86.7)/(106.9,±66.1) 线性一致）；mwScale=(1,1,1)；无重复对象锚差。§662
双锚定变体排除。

**② 旋转假说否定（复核）**：实际路面色 (190,209,233) 重测主轴 expected
0.83° vs ours 0.82°（−0.01°）。

**③ 根因终定位**：style `camera: {camera-projection: orthographic}` +
pitch 0 + cast-shadows。引擎 MapView 硬编码 THREE.PerspectiveCamera（无正
交支持）→ 高程 z=5.4~13.4m 的 HD 路面被透视放大 eyeZ/(eyeZ−h)
=114.7/101.3≈×1.13 并沿 nadir 径向位移 → 路缘外扩（红边）、lane gap 被盖、
右侧楔形缺失（蓝）。road mask IoU 仅 0.458 与此吻合。场景内另见 ff0000
tunnel 入口填充在 z=−6/+13 两层（透视位移的直观证据）。

**④ 修复方案定型（下轮，独立工程）**：
- 方案 A（正解）：引擎实现正交相机（MapView 硬编码 PerspectiveCamera 三处
  + zoom↔distance 映射 + tile 选层距离 + RTE 相机 + 阴影正交 pass 联动）。
- 方案 B（pitch-0 限定）：geometry 径向收缩补偿——ortho style 且 pitch 0
  时，emitter 对 elevated 顶点按 (eyeZ−h)/eyeZ 向 nadir 收缩；难点=阴影接
  收射线（invViewProj 透视重建）需同步校正，否则高程面阴影错位。
- 方案 C：接受现状，ortho 簇 ~240k 挂账。

**⑤ symbols 簇 icons 对齐后逐要素扫描线对照（g50q 后置复核，elevated-symbols）**：
y=300 行（512px 画布）：EXP 路段 (90,45)(140,37)(181,29)(235,28)(267,38)
(309,31) vs CUR (97,17)+(118,16)[一路被中央白线劈成两半](145,36)[+5]
(186,26)[+5](238,27)[+3](278,28)[+11 且窄](311,29)[+2]——①**双实线
（double-lines，line-gap-width 2）的白线对错位到路中央**，把连续路面劈成两
条细蓝带（主体）；②其余路段存在 +2~+11px 的系统性右移（越靠右越大=与到
nadir 的距离成正比=透视径向位移残差，与 elevated z=5-6m 一致）；③CUR 左侧
多出 (72,20) 蓝带（EXP 同位置为背景/白）。y=200/400 同签名。下一刀：
double-lines 的 gap/offset 逐要素对照（mgl line_solid 的双线偏移方向）+透视
径向位移的校正评估（同 g50s 方案 B）。

**⑥ g50s 补2（dashed 二分 + MVT 属性验证）**：rmstyle=dashed-lines 二分
（elevated-symbols 32,735→29,840，改善）确认错位白线确系 dashed-lines 层所
画（移除后该区域变连续实线）。MVT 手写 parser 全量解剖
18-232843-103243.mvt 的 hd_road_line：63 要素 = lanes/solid 25、dashed 族
17（dashed 7+long_dashed 6+short_dash 2+short_dash_solid 1+arrow_dashed
1）、非 lanes 21（bridge 12/edge 3/hatched_area 3/road_island
2/stopline 1，两侧 filter 均正确排除）——**属性解码与过滤路由无误**。白线
错位=要素几何→绘制位置的关联问题（虚线要素画在实线要素位置），下轮=逐要
素 geometry 位置对拍（emitter 的 feature→geometry 关联审计，疑 bucket 索
引错位）。nodash 状态 29,840 仍含 legit 虚线缺失与实线位移残差。

**⑦ g50s 补3（分层隔离实验）**：rmstyle=solid-lines（dashed-only 渲染）与
expected 逐区域对拍：**我们的虚线画在 mgl 为连续实线的位置**（expected 该
crop 仅 4 条实线+箭头，无虚线；dashed-only 却有两组虚线段+箭头）——虚线/实
线要素的层路由或属性关联存在逐要素错位（虚线要素画在实线要素位置）。MVT 属
性解码已验证无误（补2），错位在 evaluator 路由之后的 feature→technique/
geometry 关联层。dashed-only mismatch=26,249（全渲染 32,735）。下轮=逐要素
投影对拍（离线相机投影管线：vendored transform + style 相机，把每个
hd_road_line 要素按 line_type 投到屏幕，与 expected/current 白线位置逐一对
拍，定位错位要素对）。

**⑧ g50s 补4（重要修正：路由错位假说否定）**：dashed-only 白像素逐点重合
分析——122,476 白 px 中 **114,997（94%）与 expected 白像素重合**，错位仅
7,479（6%，散布全图=虚线相位/沿线位置噪声，无大簇）。补3 的"虚线画在实线
位置"系目视误读（dashed-only 白像素主体=double-lines 边线对+虚线，均与
expected 重合）。**要素路由基本正确**；symbols 残余主体回到已知域：deck 洞
（Portal Graph L4）+标线被 deck 覆盖（7.7k）+透视径向位移残差（g50s 方案
B 域）+虚线相位噪声（~7k）。dashed 关联审计关闭。

### §885 终四十g50t: 正交相机方案 A 落地（MapView 投影覆写）+ 地面光双链去重——ortho 簇 −23~−94%，lighting 四件 −40~45%（2026-09-18）

**① mbgl 源码参照（本轮方法论：先读源再动手，不盲跑）**：
- 正交：geo/transform.ts:2543 `isOrthographic` = 非 globe &&
  `_orthographicProjectionAtLowPitch` && pitch < 15（OrthographicPitchTranstionValue）。
  正交视域半高 = `0.5·height`（CSS px 域），near = height/50 px，far = farZ；
  与透视矩阵按 `lerpMatrix(ortho, persp, easeIn(pitch/15))` 插值
  （easeIn = t^5，util.ts:830）；getCameraToCenterDistance 同款插值（:2956）。
- line.vertex.glsl（g50s 期间已对照）：gapwidth/2、inset/outset 公式与我们
  §518 几何实现一致；dash 相位链（a_linesofar·tile_units_to_pixels/
  totalLength/floorwidth·floor_width_scale）此前已对齐。

**② MapView 正交相机（方案 A，最小侵入投影覆写）**：MapView.ts 新增
`orthographicProjection` 开关 + `m_orthoHelperCamera`；updateCameras 在
`updateProjectionMatrix()` 后覆写 projectionMatrix（含 inverse）：半高 =
height/2 × mpp（引擎逻辑 px 与 mgl CSS px 同标：world/px = CIRC/(256·2^flyZoom)），
near/far 取 viewRanges 收敛到 targetDistance±20000 保线性深度精度，
pitch easeIn(t^5) 混合 mgl 语义；RTE 相机 copy 链自动继承。相机对象仍是
PerspectiveCamera（三类硬编码不改签名）。MBStyleDataSource.applyCameraSettings
按 `(style.camera ?? style)['camera-projection']==='orthographic' && pitch<15`
置位。
- 结果：ortho-camera 74,728→57,255（−23%，透视 ×1.13 径向位移/路缘外扩
  目视消失，路网结构与 expected 逐段对齐）；ortho-camera-tunnel
  19,838→1,271（−94%）；ortho-tunnel-small-viewport 1,308。

**③ 地面光双重施加第二对去重（终三一九g21 块 vs injectGroundLighting）**：
逐像素采样实锤 ours=(190,209,233)=raw×1.0794²，expected lit=(176,194,216)
=raw×1.0794——`injectGroundLighting`（uMBGroundRad，线性域 rad^2.2，等价
mgl sRGB 乘）与 终三一九g21 块（colorspace_fragment 后 ×sRGB rad）数学等价
但同时施加=平方；两链共享 `__mbGroundLitHandler` 互斥旗标（g50r 去重的
uMBGroundRadiance 链是第三处，与本对无关）。
- 结果（单链落地）：lit 路面色逐位精确落位；**lighting 四件
  71,135/72,868/81,651/82,705 → 39,334/42,028/59,427/60,710（−40~45%）**；
  shadows-tunnel 156,079（stash 去重基线）→155,684（中性）；
  elevated-symbols-oriented 43,445（中性）。

**④ ortho 阴影链启用尝试（回归，回退）**：撤除 MBShadowRenderer 三处
ortho 提前返回（depth pass/ground quad/setLightState(false)）+
cornerOnGround 改投影通用两点 unproject（透视等价、正交修正近平面点方向）
后，ortho-camera 57,230→**190,479 大回归**——阴影图案整幅错位（覆盖整个
deck），shadow 相机取景/ground-quad 采样在正交下仍错帧。回退为默认关
（`__mbOrthoShadowOn` 旋钮留 forensics；cornerOnGround 通用化保留）。
ortho-camera 残余 57,255 主体=缺失 cast-shadow 暗带（expected (147,163,181)
vs 我们 lit 色）+ 护栏内容差。下轮=正交 shadow 光空间取景 forensics
（[MBFrameProbe] 通道可复用）。

**⑤ 运维**：karma 走 webpack 直编 TS 无需全仓 tsc（全仓 build 8GB heap
仍 OOM，绕过）；MBSTYLE_PORT 需换端口避免残留 result server 串目录。

**⑥ 全族回归与逐件对照（75 件闭合）**：chunked runner（MBSTYLE_BATCH=4）
全族 75 件 = 3,500,487（68 件 3,159,093 + 补 7 件 341,394）。改动前对照
（stash 四文件，同机同日）：
- ortho-camera 75,014→57,255；ortho-camera-tunnel 19,840→1,271；
- lighting 四件 71,135/72,868/81,651/82,705 → 39,334/42,028/59,427/60,710；
- shadows-tunnel 156,079→155,684、road-extend-tilecover 210,581→210,170、
  shadows-roads-depth 24,013→24,184（均持平）；
- elevated-wireframe 63,437→67,500（+4.1k，唯一副作用：带灯 wireframe 此前
  吃双重光照的偏差曝光，属向 mgl 忠实方向暴露的既有失配）；
- tooling-support 改动前即 26.5k（ribfix 16.5k 系过时基线，非回归）；
- tail 7 件（shadows-underpass/stacked/terrain-x/tile-border/tooling/zLevel）
  全部较 mtfix-3di 基线改善。
运维确认：karma 连续跑 ~57 件浏览器崩（ChromeHeadless 149/SwiftShader），
全族必须 chunked；filter= 为 OR 子串匹配，注意 "terrain-enabled" 这类公共
子串会误匹配 *-terrain-enabled 全族。

**⑦ 下轮**：正交 shadow 光空间取景 forensics（`__mbOrthoShadowOn=1` 旋钮
已留，ortho-camera 残余 57,255 主体=缺失 cast-shadow 暗带）；deck 洞
（Portal Graph L4）与 symbols 残余（~500k→已减，见②）继续。

### §885 终四十一g50u: 正交 shadow forensics——暗带已对准，接收域过暗定性；ground-quad 与 lit 语义按 mgl 源码修正（2026-09-19）

**① mbgl 源码两条权威语义（3d-style/shaders/_prelude_shadow.fragment.glsl）**：
- `shadow_occlusion:42-68`：cascade0 内→采样 c0；c0 外 c1 内→采样 c1
  （带 u_fade_range 视深淡出）；**两者都外→return 0.0 = 无遮蔽 = 照亮**。
  我们 ground-quad 的"cascade 外=shadowed"（终一百四十七历史行为）与 mgl
  相反，已改为 lit=1.0 默认。
- `background.fragment.glsl`：**背景完全不采样 shadow**（只有 CPU 预乘
  groundRadiance 的 v_color）——接收面仅 fill/line/circle/symbol/
  extrusion/terrain。即 mgl 中 ortho-camera 的白色背景不接收投影。

**② 修复落地**：ground-quad shader 射线重建改投影通用两点 unproject
（透视等价/正交精确；旧 `invProj*(ndc,-1,0)` 单点方向式在正交下把 ndc.xy
偏移当方向）；cornerOnGround 同款（g50t 已改）；新增旋钮
orthoshadowon=1 / groundquadoff=1（runner env 通道接通）。

**③ 探针定量化（shfrmprobe/shcastaudit + mb-probe-dump 通道）**：
- shadow 深度图本身正确（82 casters，路网清晰可辨，ortho 光空间正交投影）；
- shuv-corner-depth：caster 盒角点 NDC 越界至 ±3.5（取景窗 ~±105 < caster
  域）——正常，mgl 亦不覆盖全 caster 域，依赖 cascade 外=lit 语义；
- solo 正交+阴影渲染：**真影暗带逐位对准**（(300,250) exp(147,163,181) /
  cur(147,162,180)），接收链 invViewProj 已正交一致（recv-mat-audit 实锤
  w 行=0001）。

**④ ortho 阴影仍净亏（维持默认关）**：shadow-on 190,479 vs off 57,255。
分类统计（全图 512²）：期望 shadow-band 18.3k px 已 68% 对准；但 bg-white
121k px 被压暗（ourmean 214,221,220 vs exp 253,255,255）+ road-lit 均值
偏暗（168,181,190 vs 176,194,216）。ground quad 对该夹具零贡献
（solo2 vs solo3 逐位 0 差异；quad-off shadows-tunnel 还小赢 −1.3k）→
过暗来自 **per-material 接收链对地面平面 fragment 的深度判定**：正交下
光仰角 20°、路面高程 5.4~13.4m，1/tan20°≈2.75 的横向影距让大部分地面落
 caster 影内，但 mgl 同域为 lit——嫌疑=偏差窗（uMBShadowBiasW 盒跨 ramp）
或 m_matrix 帧下的 u_shadow_normal_offset 侧移缺失，导致深度比较系统性
偏 occluded。下轮=正交接收偏差窗/normal-offset 逐项对拍 mgl
（shadow_renderer.ts:546 normalOffset 3）。

**⑤ 默认路径零回归**：ortho-camera 57,255、lighting 四件
39,334/42,028/59,427/60,710、shadows-tunnel 154,397（quad 射线修正小赢
−1.3k）、oriented 簇不变——本轮全部 mgl 语义修正对已提交状态无扰动。

### §885 终四十二g50v: 正交接收链对拍 mgl ground_shadow/shadow_occlusion——quad 正交自动门控，ortho-camera 57,230（真暗带保留）（2026-09-19）

**① mbgl 源码对拍结论（3d-style）**：
- `_prelude_shadow.fragment.glsl:33-40`：sampler2DShadow **GREATER** 比较，
  occluded ⇔ receiver z > stored；cascade 外 return 0 = lit（g50u 已对齐）。
- `fill_style_layer.ts:123`：fill 层 `hasShadowPass` =
  `fill-elevation-reference !== 'none'`——**HD 路面在 mgl 中确实投影** ✓
  （我们 caster 集合方向正确）。
- `shadow_renderer.ts:530-546`：fill 走 `setupShadows(..., 'vector-tile')`
  → NORMAL_OFFSET 开（u_shadow_bias=[0.00010,0.0012,0.012]，model-tile 才
  ×3）；非 normalOffset 时 bias=[0.00036,...]。
- `ground_shadow.frag`：地面影子是 mgl 的**独立 pass**（drawGroundShadows，
  画在 background 之上），非 background 自身接收——我们 ground-quad 复刻的
  就是它，透视下成立。
- `background.fragment.glsl`：背景自身不采样 shadow（g50u 结论维持）。

**② 根因闭合：190,479 的真凶 = ground-quad 正交错帧，而非接收链**：
shdiag=5 定量（背景 depth=0.835 > z=0.643，路面 depth≈z=0.729）+ 三组
门控实验：quad 真正关掉后 ortho-camera 190,479→57,230（背景恢复白、
路面真暗带保留）；此前"quad off 无效"是因为 overlay 直绘块（AfterRender
通道）绕过了 drawGroundQuad 的门控——本修把两处绘制点统一门控。

**③ 落地**：ground-quad 两处绘制点（preSceneHook underlay + AfterRender
overlay）均加 `m_orthoStyle` 自动门控（正交下 quad 关、接收交给
per-material 链）；`setOrthographicStyle` 默认保持阴影链开启
（orthoshadowoff=1 旋钮可回退）；背景 fill mesh 打 `_isBackground` 旗标
跳过 injectGroundShadow（mgl 语义）。

**④ 结果**：ortho-camera **57,230**（较 g50t 的 57,255 微降且真暗带
mgl 忠实呈现；"净收益转正"未达成——路面 lit 区存在自采样 acne
（road-lit 均值 168 vs 176，缺 normal offset 侧移所致，量级与暗带收益
相抵）；shadows-tunnel 60,231（quad 关）证明透视 overlay 存在双重施加
（quad 与 per-material 接收对同一地面双重变暗）——但 lighting 四件
39,334/42,028/59,427/60,710 依赖 quad（其地面图案无 fill 接收），quad
全局关闭会 +150k 回归，故维持透视开启；lighting 四件/shadows-tunnel/
shadows-junction 19,487 与已提交态逐位一致（零回归）。

**⑤ 下轮**：①quad 与 per-material 接收的 mgl 式分层（quad 只画
background/无接收地面，fill 由自身 shader 接收——可解 shadows-tunnel
60k 且不伤 lighting）；②fill 接收链补 mgl normal offset（vector-tile
×1.0，u_shadow_normal_offset=[meterInTiles, offset0, offset1]）消 self-acne，
ortho 阴影净收益转正；③elevated-wireframe +4.1k（双重光照曝光）。

### §885 终四十三g50w: fill 接收链 mgl normal offset 移植（管道就绪，默认关）——ortho 暗带定性修正（2026-09-19）

**① mgl 源码对拍（3d-style/shaders/_prelude_shadow.vertex.glsl:6-14 +
shadow_renderer.ts:530-546）**：fill 接收 `shadow_normal_offset((0,0,1))`：
n=(0,0,tileInMeters)，dotScale=min(1−NdotL,1)/2+0.5，位移 h =
texelScale(=2/512·8192/res=0.03125)·radius(tile)·scale·dotScale·tileInMeters
≡ 0.03125·radius_meters·scale·dotScale；scale=1.0(vector-tile)·
lerpClamp(zoom,22→0.125,0→4)；NORMAL_OFFSET 开时 u_shadow_bias.x=0.00010
（ground_shadow plane-bias 变体不含 normal offset，二者是不同接收路径）。

**② 移植落地**：渲染器 run() 内（casterBox fit 后）算 h →
ShadowUniformState.normalOffsetZ → 接收 chunk 新增
`#if MB_SH_NOFF  mbWP.z += uMBNOffZ  #endif`（uMBNOffZ 逐帧刷新，decl 去重
列表/两处 define 前缀均已接入）。修复过程中发现并修掉一个潜在 NaN 源
（m_shadRadius 字段从未赋值，改用拟合后 m_shadowCamera.right +
Number.isFinite 防护）。

**③ 探针实证（本轮最重要定性）**：shdiag=5 + 常量 50m 判别实验证明
normal offset 管道已编译生效（z 通道被抬高）；但同时证明——
**正交下 per-material 接收链对全部可见路面 fragment 输出 lit≈1**（阴影
开/关的可见差异≈0：57,230 vs 57,255），即 g50u 观察到的"暗带对准"
(solo2) 其实是 ground-quad 图案（错帧）的贡献；接收链本身在正交下从未
产出过暗带。当前接收链 ortho 深度诊断（shdiag=5）：路自面 z≈depth
（自采样正确 lit），(300,250) 带位 z=0.760 < depth=0.847 → 判 lit
（mgl 同式同输入也应 lit）——**mgl 的暗带来源需要重新归因**（疑 v_depth
视深淡出 / cascade1 / 或 fill.vertex 的 v_pos_light_view 逐顶点路径与
我们逐像素射线重建的系统性差异），此为下轮首刀。

**④ 旋钮与默认**：normal offset 默认关（shnoff=1 选入）——h=1.33m 时
shadows-tunnel 154,397→155,684（+1.3k），ortho-camera 不动；h 微小时全部
与已提交态逐位一致。默认路径零回归验证：ortho-camera 57,230 /
lighting 四件 39,334/42,028/59,427/60,710 / shadows-tunnel 154,397 ✓。
运维：karma-worker.bundle.js 是 8/2 的预构建产物（与主线程 TS 无关，主
线程 karma webpack 直编 TS 实时生效——本轮全部实验均据此判读）。

**g50w 补（同日续）**：shadowanalytic=1（几何真投影 mask，绕开深度比较）
在正交下 ortho-camera 仍恒 57,230——排除"深度比较符号/偏差窗"单因；结合
shmat-compose 手工验算发现 **m_matrix 与 m_shadowCamera proj·viewInv 的
深度分量存在 ~0.04 量级系统性不一致**（该链在透视夹具经多轮调参收敛故未
暴露，正交下表现为全 lit）。下轮首刀改为：逐分量对拍 m_matrix 组装链
（m_shadowCamera fit → proj·view → bias·ndc2uv）与 depth pass 实际写入值
（readPixels 采样已知 caster 角点），定位 0.04 的来源；修复后接收链即可在
正交呈现真影暗带（预期收益 ≈45.8k px，ortho-camera < 57,255 转正）。

### §885 终四十四g50x: band-forensics 探针——深度配准无恙，问题收敛到 fill 材质的 intensity 刷新覆盖（2026-09-19）

**① 新探针（已提交）**：①`shbandline=1`（band-forensics）：depth readback
后沿期望暗带扫描线（sx 250..380×dz 0/5/10/15m 候选接收面）逐点计算
m_matrix uv/z + readPixels 存储深度 + occluded 判定，POST mb-probe-dump
（须放在 m_matrix 全 compose（bias+snap）之后——首版放 depth pass 处读到
上一帧 identity 矩阵作废）；②recv-mat-audit 扩展 nOffZ 字段；③main-canvas
探针扩展 recvInjected/groundLit 普收普查（traverse scene 统计
__mbShadowInjected / __mbGroundLitHandler 材质数）。

**② 定量结论（ortho-camera，shadows on）**：
- 深度配准正常：地面面（dz=0）扫描线 14 样本中 7 个 occluded（stored
  0.639~0.643 < z 0.622~0.625），甲板面（dz=10）4/14 occluded，dz=15
  （高于全部 caster）0/14 全 lit——**存储深度与 m_matrix 在 occluded 语义
  上完全自洽**，g50w 补的"~0.04 不一致"假说否定；
- normal offset h=1.325（1/8·radius 量级）数值合理；
- **接收注入普查：133 材质带 chunk（injected=133 groundLit=133）**——注入
  也没有缺失。

**③ 收敛点**：注入 133、深度配准正常、occluded 样本存在，但渲染可见输出
无调制（57,230 ≈ 关影 57,255，差异仅 25px）→ 只剩一环：**fill 材质的
uMBShadowIntensity 停在创建 seed 0**（patchMaterial 时 shadowState 尚未
就绪 → shSeed 空 → seed 0；chunk 门控 `uMBShadowIntensity > 0.0` 直接
短路），且逐帧 refresh（uMBShadowBiasW 同层）未覆盖到这批材质——refresh
注册表与 inject 注册表不重合。下轮首刀：dump refresh 注册表 vs injected
材质集合的差集（recv-mat-audit 的 cnt===60 one-shot 因静态夹具 3 帧即停
永不可达，改 census POST），把 fill 材质补进 refresh（或 seed 后置
refresh 首帧置位），ortho-camera 阴影即应呈现真影暗带（预期 < 57,255
转正，收益 ≈45.8k px 中的大部分）。

### §885 终四十五g50y: refresh 注册表差集定位——m_groundUniforms 门移除（真实修复）+ 残余定性（2026-09-19）

**① 量化铁证（refresh-quantifier 探针）**：patchTileMaterials 逐帧
shadowState=false（帧 1-3），census intOne=0/intZero=48/133——接收链
intensity 全程 0。注意：quantifier 初版插桩把 `qActive/gQ` 声明进了
`if (shadowState||m_lastShadowActive)` 块内而 POST 在块外——
ReferenceError 每帧中断整条 patch 链（ortho 曾短暂 74,693），已修正作用域
（教训：插桩也会引入回归，TS2304 编译检查可提前发现）。

**② 真实根因（已修复）**：getShadowUniforms() 的
`if (!this.m_groundUniforms) return null;` 门——m_groundUniforms 只在
ground-quad 首次渲染编译时创建，而 g50v 将 quad 在正交下自动关闭后该状态
永不创建 → getShadowUniforms 恒 null → 逐帧 refresh 把 intensity 重置 0
→ 全部接收材质恒 lit。门已移除（返回字段均为 renderer 自有，与 quad 无
关）；uMBShadowIntensity seed 补 `|| shadowLightState`（style 声明
cast-shadows 即置 1）；setLightState 增加 false→true 转变时的 5 档激活
poke（80/300/800/1500/2500ms，静态夹具 idle 后仍能完成激活）。

**③ 结果与残余**：ortho-camera 57,255 = 与关影逐位等效（较 57,230 持平）
——接收链已激活（intensity=1、shadowState 非空）但可见调制仍为全 lit：
逐像素射线重建的 mbWP（vMBElev 平面 / invViewProj）与 depth map 的配准在
**片元级**仍不对（band-forensics 的扫描线级配准自洽与片元级全 lit 并存，
疑 vMBElev 属性值/invViewProj 逐帧矩阵/uv 翻转中一处符号或量纲差）。
下轮首刀：对单个 band 像素 dump 完整 mbShadowSample 输入
（vMBElev、uMBEye.z、invViewProj 行、mbWP、uv、stored）做端到端数值
对拍（shadowdbg 通道已有 R/G/B 三元组可复用）。

**④ 默认态**：ortho-camera 57,255 / lighting 四件
39,334/42,028/59,427/60,710 / shadows-tunnel 154,397 / shadows-junction
19,487 —— 与 g50v 提交态一致（零回归）。

### §885 终四十六g50z: shadowdbg 端到端读数——接收链公式正常，缺的是 caster 覆盖（2026-09-19）

**① 端到端读数（shadowdbg=1，chunk 逐像素 R=intensity G=stored B=uv.z，
注意 PNG 为 sRGB 编码需 ^2.2 还原线性）**：
- band 像素 (300,250)：G_display 0.761 → 线性 stored 0.694；B_display
  0.847 → 线性 uv.z 0.545。stored(0.694) > z(0.545) → **该 uv 沿光轴无
  caster 在接收面之前 → 比较判 lit**——接收链公式（GREATER 语义、plane
  bias、intensity）全部按设计工作；
- 背景/护栏像素：z=stored=1.0（clear）→ lit ✓；
- 另一 road 采样 (137,300)：stored 0.882^(2.2)=0.758? 与 z 0.753^(2.2)
  同量级——自采样带。

**② 归因收口**：mgl expected 的暗带 = 上层甲板 fill（fill-elevation-
reference ≠ none → hasShadowPass ✓ mgl fill_style_layer.ts:123）投影到
下层甲板。我们的 depth map 在该 uv 的最近 caster 深度 = 0.694（下层自己
或更远面），**上层甲板缺席**——caster 注册（82）或其沿光轴的投影覆盖
（正交 light fit 窗口 vs caster 域）在带位 texel 上缺失，而非接收链公式
错误。下轮首刀：对 ortho-camera 逐 caster dump（[MBShadowCast] census 已
有）比对 mgl shadow pass 的 layer 列表（hasShadowPass 的 fill 层 + 模型），
找出缺席的上层甲板层/瓦片；并核对 depth 16-bit 打包在 stored=0.694 处的
量化（0.694 疑为 z-fighting 自体值）。

**③ 默认态**：ortho-camera 57,255 / lighting 四件
39,334/42,028/59,427/60,710 / shadows-tunnel 154,397 / tunnel 1,271 ——
零回归（本轮仅探针读数，无行为改动）。

**g50z 补（同日）**：首次 shadowdbg=1 读数无效（<3 不置位 paint，采样到的是
普通渲染色 176,194,216——恰好被误读为深度数据）。shadowdbg=3 正确读数：
接收链 uv.z **饱和在 0/1/0.976**（视锥外/clamp），stored=1.0（clear）——
而 CPU 侧 band-forensics 用同公式同矩阵算出 uv z≈0.62（在域内）。两者矛盾
指向：材质上的 uMBInvViewProj/uMBShadowMatrix 为陈旧帧或符号差（逐帧
refresh 时序 vs 逐像素重建），而非"caster 覆盖缺席"（g50z 初判修正）。
下轮首刀（也是 mgl 正解）：放弃逐像素射线重建，改 port mgl fill.vertex
逐顶点路径——v_pos_light_view = u_light_matrix · vec4(a_pos, z_offset)
随顶点插值，天然无平面假设/无帧间矩阵错位；我们已有 per-vertex 管线
（vMBElev），把光空间 uv 改为顶点属性即可。此改动同时是 mgl 分层
（elevated fill 自接收 vs ground quad）的正解基础。

### §885 终四十七g51a: 逐顶点 v_pos_light_view 路径移植（管道就绪默认关）——正交恒 lit 根因升级为逐帧刷新注册表问题（2026-09-19）

**① 移植落地**：injectGroundShadow onBeforeCompile 顶部注入 vertex 侧
`varying vec3 vMBLightWPos = (modelMatrix·vec4(transformed,1)).xyz`
（project_vertex 锚点），fragment chunk `#if MB_SH_VLIGHT  mbWP =
vMBLightWPos  #else  (射线重建)  #endif`——mgl fill.vertex 的
v_pos_light_view 逐顶点等价物；两处 define 前缀 + decl 去重列表接入；
shvlight=1 选入（默认关，见④）。

**② A/B 实测（shvlight=1）**：ortho-camera 57,255→**190,479**（暗带
(147,162,180)@300,250 正确呈现！但背景/ ground 区大面积误暗）→ 接收链
per-vertex 配准正确（band 色精准），但 intensity=1 seed + 逐帧 refresh 在
**identity 矩阵窗口期**（m_scene 空/光未解析的前几帧）以单位阵采样深度图
→ 随机暗化。sweep 场景重注入路径也已加背景豁免（renderOrder<-1000 +
__mbBackgroundMesh 旗标）——背景排除在 sweep 生效后 ortho 仍 190,479，
证明误暗非背景 mesh 而是路网 fill 自身在 identity 窗口期的采样。

**③ 收敛点升级**：问题不再是"公式/配准"而是**激活时序与矩阵生命期**——
接收材质必须在 shadowState 非空（m_matrix 已 compose、m_shTex 已建）之后
才开始调制。候选方案：①intensity seed 改由 renderer 在首次
shadowState 非空后显式置位（移除 slNow seed，避免 identity 期激活）；
②材质缓存首帧矩阵为 identity 时不调制（脏标记）；③refresh 注册表持久化。
逐顶点路径本身已验证（band 色精准），只待时序修复即可转正。

**④ 默认态零回归**：VLIGHT/NOFF 默认关 → ortho-camera 57,255、lighting
四件 39,334/42,028/59,427/60,710、shadows-tunnel 154,397、road-islands
34,609 —— 与 g50y 提交态逐位一致。

**g51a 补（同日二）**：逐顶点+NOFF 组合实验的精化定性——shvlight=1 时
暗带像素 (300,250) 精准呈现 (147,162,180)✓，但 **lit 甲板大面积同色误暗**
（(150,100) exp 176,194,216 → cur 147,162,180），delta 直方图 bucket-3
（90~120）聚集 165k px——即自采样误暗（甲板自身 texel z≈stored →
smoothstep(0)→mbLit=0.5 半暗，叠加 mbLight 混合后全暗），normal offset
h=1.33（SHNOFF=1）未能消除（位移 0.0029 uv 单位被 plane-bias 窗口外的
非线性吃掉，或 mbWP.z 位移方向/量级仍差）。shadowdbg 端到端（g50z 补）
stored 0.694 > z 0.545 的读数与"自采样"定性一致：band 像素与 lit 像素在
我们的深度图中 stored 相同（0.694 疑为甲板自身面深度）——**mgl 中该
stored 应为上层甲板（更小深度）**，指向上层甲板 caster 在带位 texel 的
缺席（g50z 初判回归有效）。默认态已恢复零回归（VLIGHT/NOFF 默认关，
57,255/154,397/lighting 四件逐位一致）。下轮：①逐 caster dump 上层甲板
瓦片是否进入 depth pass（[MBShadowCast] census + shadow-depth-canvas 分
层着色）；②若缺席，查 fill-elevation-reference 层的 layers.enable(1)
注册条件；③自采样误暗的 h 量纲核对（0.03125 系数适用性）。

### §885 终四十八g51c: 接收链激活时序 forensics 中断点快照（2026-09-19）

**① 已完成实验（本轮）**：
- band-forensics 扩展 5×5 邻域最小深度（nbMin）——用于区分"遮挡体真缺席"
  与"亚 texel 配准偏移"。实测（ortho-camera 扫描线 sx 250..380 × dz
  0/5/10/15）：地面面 occluded 样本存在（如 sx=300 stored 0.628 < z 0.630），
  邻域 min 与逐点 stored 一致（0.608~0.647 连续分布）——**深度图内容与
  m_matrix 配准在采样级自洽，遮挡体并未缺席**（g50z"上层甲板缺席"假说
  亦被弱化：存储深度连续、无跳变空洞）；
- 逐顶点 vMBLightWPos 路径 + NOFF 组合：band 色精准呈现但 lit 甲板自采样
  半暗铺满（mbLit=0.5@z==depth），normal offset h=1.33 未能消除；
- **关键未解现象**：shadows-on 与 shadows-off 渲染逐位相同（diff=0），
  接收调制在可见输出上完全失效——与 forensics 的 occluded 样本存在矛盾。
- **待完成**：main-canvas census 已扩展 matReal/matDegenerate 字段（可见
  fill 材质的 uMBShadowMatrix 是否仍为 identity/退化阵）——探针代码已就
  绪，运行被中断，下轮首刀即跑该 census：若 matDegenerate≈48 → 逐帧
  refresh 未覆盖可见 fill 材质（refreshTargets 注册表问题）；若 matReal
  ≈48 → 问题在 chunk 采样/比较内部。

**② 中间教训（已固化在代码注释）**：
- 探针插桩作用域错误（qActive/gQ 块内声明块外引用）→ ReferenceError
  中断整条 patch 链，曾致 ortho 短暂 74,693——插桩后必须 tsc --noEmit +
  小批 A/B 验证；
- shadowdbg=1 不置位 paint（需 ≥3），首版读数误把普通渲染色当作深度数据
  ——读数前先确认采样像素是 debug 输出；
- sed 对含 `?`/`${` 的 TS 模板串替换静默失败，改用 python 精确替换。

**③ 当前安全态（已提交，零回归）**：ortho-camera 57,255（与关影等效）、
lighting 四件 39,334/42,028/59,427/60,710、shadows-tunnel 154,397、
shadows-junction 19,487、road-islands 34,609；逐顶点路径/normal offset 均
默认关（shvlight=1 / shnoff=1 选入），下轮跑 matReal/matDegenerate census
即可二选一定位正交接收链断点。

### §885 终四十九g51d–g51g: 正交接收链双断点闭合 + 接收比较器对齐 vendored mgl 源码——3d-intersections 全族 −45%（2026-09-19）

**① g51d census 落锤（上轮遗留首刀）**：matReal/matDegenerate census 二选一分歧定案——ortho-camera 全部 172 接收材质 `matReal=172/matDegenerate=0`（落入"问题在 chunk 采样内部"分支），但扩展 census（新增 eyeReal/eyeZero/ivpReal/resReal 逐材质审计）揪出真凶：**`uMBEye.z=0`、`uMBRes=(1,1)` 全军覆没（eyeReal=0/resReal=0）**，而 uMBShadowMatrix/uMBInvViewProj 是实值。根因：`m_eye.copy()`/`m_res.set()` 的唯一写入点在 `prepGroundQuad` 内、且位于 `if (!this.m_groundUniforms) return` 早退之后——g50v 把正交下 ground-quad 关闭后该函数永不推进，`getShadowUniforms()` 把死种子广播给全部接收材质 → 射线重建平面 `(vMBElev − 0)=+5.4`（应为 −109）+ NDC `gl_FragCoord·2−1` 在 512px 画布上爆到 1023 → uv 门控全拒 → 恒 lit。**修复**：m_eye/m_res 写入提升至 run() 主流程（prepGroundQuad 之前，双投影生效；透视路径值幂等）。修复后 ortho-camera 57,239→190,484——接收链首次真正点亮，暴露下一层病灶。

**② g51e/g51g 接收比较器对齐 vendored mgl 源码（本轮最重要语义修正）**：本轮三次改着色器（比较方向翻转/二值 step/analytic）渲染**字节级不变**（md5 423fefd388），用原生 WebGL `getAttachedShaders+getShaderSource` 抓 GPU 实际执行源码自证新鲜后收敛：**自采样面上 Isidoro 平面偏移精确抵消深度差 → x≡0 → 旧对称窗 `smoothstep(-1e-4,1e-4,x)` 恒给 0.5 → 全幅 ×0.49 半暗幕罩**（245k px），且对比较符号天然免疫。对照 vendored 源码（`mapbox-gl-js/3d-style/shaders/_prelude_shadow.fragment.glsl`）发现**移植错变体**：vector-tile fill 编译期定义 `NORMAL_OFFSET`，`calculate_shadow_bias` 返回常数 `0.5·u_shadow_bias.x=5e-5`、接收顶点由 shadow_normal_offset 抬升、硬件 GREATER 比较为**二值**——plane-bias 变体根本不用于 fill。**修复**：比较器改为 `mbLit = step(mbShadowUv.z − 5e-5, stored)`（mgl GREATER 语义：lit ⇔ stored ≥ z−bias；空 texel stored=1.0 → lit；真遮挡物 → occluded）。`shadowlegacy=1` 保留旧窗口 A/B。

**③ g51f caster 侧法线偏移归零 + g51d 补 NOFF 使能 bug**：(a) 深度 pass 的 caster 侧 `uMBNormalOffset=3`（终六十一为墙体遮挡物加）在 mgl 中不存在——它把每块存储深度向光侧推 ~0.006 uv，旧反向比较器时代自采样靠它"碰巧读 lit"，新比较器下则把所有共面自采样判遮挡；**默认归零**（`shcastnormal=<v>` 可恢复）。(b) 抓 GPU define 时发现 `MB_SH_NOFF` 恒 0：测试文件对 `shnoff` 有两处解析，744 行 `Number("1")=1` 覆盖 371 行的布尔 `true`，而发射模板 `${__mbShadowNOff === true ? 1 : 0}` 严格相等拒绝数字 1——**历史 g50w/g51a"NOFF 未消除自采样"的结论全部是在 NOFF 实际未编译的状态下测得的，作废**。修复并按 mgl 语义改为**默认开启**（`shnoff=0` 显式退出）。

**④ 全族记分牌（76 件，new=71 件实测 + 5 件尾部补测中；对照 3di-g50k-base 同框 66 件）**：
- 同框 66 件：5,383,262 → 2,977,038（**−2,406,224，−45%**）。
- 对 HEAD 精确基线的代表件：shadows-tunnel 154,397→60,220（−61%）、road-extend-tilecover 210,170→81,176（−62%）、road-islands −1（34,609→34,608）、shadows-junction 19,487 持平、ortho-camera-tunnel 1,271 持平、ortho-camera 57,239→63,298（+6,059，见⑥）。
- 相对 g50k 的 top wins：ortho-camera-tunnel −183k、oriented 三件 −127k×3、road-extend-no-shadows −126k、road-islands −101k、guard-rail-color-feature-dependent −98k、guard-rail-split-feature-geometry −75k、elevated-circles-nonelevated −74k。
- **唯一实质回归：lighting 四件** 39,334/42,028/59,427/60,710 → 183,016/182,298/172,871/172,952（+~143k/件）；elevated-wireframe +14,941（旧双重光照曝光的延续）、elevated-line-labels-tunnel +1,104（噪声级）。

**⑤ lighting 四件回归定性（= 全族统一残余根因）**：diff 像素回归区 62,138 px 的 expected 亮度均值 229（深暗 ~(57,63,70)=真实阴影），我们新态 (127,141,157)=半 lit——**深度图缺少上方遮挡体**（caster 缺席）与 ortho-camera 暗带变 lit（18k px）同根因：旧系统该暗来自"空 texel 判暗"的 accident（×0.49 幕罩），新系统语义正确但遮挡体确实缺席 → 深度表无内容可挡。旧基线 39,334 本质是幕罩意外贴合 expected 的暗色直方图，非真实对齐。**下轮首刀：逐 caster dump（shcastaudit 通道已有）比对 mgl hasShadowPass 层清单，定位上层结构/桥面（road-base-bridge、symbols 夹具的上方结构）缺席原因**——修好后 lighting 四件与 ortho-camera 应同刀转正（合计预期 −60 万量级）。

**⑥ 运维与探针固化**：(a) `getAttachedShaders/getShaderSource` GPU 源码 dump 探针（main-canvas census 扩展，gpu-shader-src/gpu-shader-census 两通道）——判定"着色器是否真的编进 GPU"的终极手段，本轮多次字节不变之谜靠它终结；(b) DIAG9（涂 mbLit/mbLight）加入；(c) mbstyle 全套探针参数 shcastnormal/shadowlegacy 接入 runner；(d) karma 固定 9876 端口 + 共享浏览器缓存的嫌疑已排除（换端口复测字节不变）；(e) chunked runner 按 filter 子串分类失效（"0 categories"），尾部补测用单跑 runner 串行。

**⑦ 下轮**：①⑤的 caster 覆盖修复（统一根因，预期 lighting 四件 + ortho-camera 同刀 −60 万）；②elevated-wireframe +14,941 复核（带灯 wireframe 曝光）；③跨家族回归（cast-shadows 波及 model-layer 102/building 46/lighting-3d-mode 32 等 239 个 style，本次 caster-offset 归零 + 比较器重写对墙体/建筑族的影响未测）。

**⑧ 补测补充（同日）**：全族实测落定 69/76 件，同框对照 5,498,105 → 3,047,639（**−2,450,466，−44.6%**）。terrain-toggle-on-off 69,815→29,401（−40k）；tooling-support 26,653 与 HEAD 26.5k 一致（g50k 参考值 16,428 系过时基线，非回归）。shadows-underpass 在新旧两态均**无法完成**：`0:501 'assign': cannot convert from 'const int' to 'highp float'` GLSL 编译错误 → 180s 超时——git stash 对照实证**该错误在 HEAD（g51c 提交态）即存在，非本轮引入**（嫌疑：某 flavor 的 defines 以整数字面量落入 float 上下文，如 `float x = MB_SH_BIAS` 处 bV 恰为整数串；g50t..g51c 间引入，下轮与 caster 覆盖一并修）。terrain-enabled（无后缀件）未测得（filter 子串碰撞大量 *-terrain-enabled 变体，timeout）。

### §885 终五十g51h–g51i: 深度 pass 接收矩阵投影统一 + shadows-underpass 编译错误修复 + lighting 回归再定性（2026-09-19）

**① g51h 深度 pass 三处统一走接收侧矩阵**：band-forensics 实测暗带 uv 列（sx 290-310×dz 0-15）stored 全 clear 且 nbMin 也 clear——深度内容系统性偏离接收 uv。修复：m_depthMaterial 顶点着色器改由 `uMBRecvMatrix`（= m_matrix/m_matrixR0/m_matrix1，按 pass 引用绑定，上一帧 compose）投影：`gl_Position = vec4(rp.xy*2−rp.w, rp.z*2−rp.w, rp.w)`，构造性保证 `gl_FragCoord.z ≡ 接收 uv.z`（同矩阵、同 snap、同 bias）。**结果：中性**（oriented/no-light/road-extend 逐位一致，tunnel 60,220→64,322 +4k 栅格对齐位移，ortho 63,298→63,414）——47-texel 偏移并非暗带主因，保留该修复作为投影单一事实源。

**② lighting 四件回归再定性（修正 g51g⑤ 的 caster 覆盖假说）**：对照 expected/current 图像，expected 的暗色大区域 = **fill 甲板的 apply_lighting 方向着色（NdotL 背光面变暗）+ 右上角亮三角形 = 受光地面**，并非投影阴影。我们渲染甲板均匀亮色 → 缺失的是 **fill 的 apply_lighting 方向项**（现有 injectGroundLighting 只做 radiance 乘、injectStructure3DLighting 只覆盖 extrusion）——旧比较器幕罩 ×0.49 恰好补偿了这一缺失（39,334 基线 = 幕罩冒充光照着色的假对齐）。**真修 = port mgl apply_lighting 的 fill 分量**（新工作流，非阴影链）；caster 覆盖假说降级。

**③ g51i shadows-underpass 编译错误修复（g51c 遗留 + HEAD 既有）**：新增 shaderSource/compileShader 原型钩子（elevplane=1 门控）抓到 0:501 实锤——quad chunk 内 `mbWP.z += 10;`（g50u 时代 forensics 残留，整数字面量赋 float 分量 = GLSL ES 硬错误），透视下 quad 编译即炸 → 夹具 180s 超时。修复为 `10.0`，另对 `MB_SH_BIAS` 的三处 float 上下文用点包 `float()` 防再发。**结果：shadows-underpass 139,516**（旧 g50k 参考 146,932，−7,416），tunnel-enterance 54,585 / tunnel-enterance-color 57,144 同批复测一致。

**④ terrain-enabled 无法测量**：精确 filter 下浏览器 4 次 DISCONNECTED（SwiftShader 崩溃，重载地形夹具），与代码无关的環境问题（g50k 时代可测）。挂账。

**⑤ 记分牌收口**：全族 76 件中 71 件实测 + shadows-underpass 139,516 + terrain-enabled 挂账。同框 69 件 5,498,105 → 3,047,639（**−44.6%**）。shadows-underpass 修复后 family 总量（71 件口径）≈ 3,187,155。

**⑥ 下轮**：①fill apply_lighting 方向项移植（lighting 四件 +143k/件回归的收复路径，预期 −60 万）；②ortho-camera 甲板洞（Portal Graph L4，剩余 63k 主体）；③shadows-tunnel g51h +4k 复核；④terrain-enabled 环境崩溃排查。

### §885 终五十一g51j: 阴影光方向去镜像（默认原始 mgl 转换）——lighting 四件收复 −8~−11 万/件，ortho-camera 首破基线，全族 −50.6%（2026-09-19）

**① 根因实锤（elevated-symbols-lighting 的 200m 影子）**：样式的 `shadow-casters` fill-extrusion（height 200，默认黑色）注册正常（shcastaudit z-span 85.8 在册）、深度图也有其栅格化足迹（rmstyle=shadow-casters 对照：移除后深度图大三角消失，casters 82→73）——但足迹落在地图角落、背离甲板 uv 区：**§683 lighting3DState.dir 的 y 镜像使 200m 高遮挡物的整场阴影投向镜像侧**。旋转扫掠（shaz ±6/±12/150/165/195/210 均 18.1-18.5 万）无法修复镜像——只有 az=180 时 y 镜像恰与 180° 旋转重合（shaz=180 → 63,972），暴露镜像本质。

**② 修复**：阴影光方向默认改为原始 mgl 转换（sphericalDirectionToCartesian az+90，无 §686 y 镜像，即原 shdiralt=1 路径；shdiralt=0 退回镜像、=2 tosun 保留）。A/B：lighting 182,862→73,184（raw）/63,972（shaz180），tunnel +4.4k、junction/road-extend 逐位不变。

**③ 结果（默认态）**：lighting 四件 183,016/182,298/172,871/172,952 → **73,184/75,458/92,108/93,072**（−8.0~−11.0 万/件）；**ortho-camera 63,414 → 55,670，首次低于 HEAD 基线 57,239**（镜像同样影响其暗带）；tunnel 60,318、junction 19,487、road-extend 81,756 持平。

**④ 全族终版记分牌（g50k 参考同框）**：68 件 5,558,794 → 2,746,449（**−2,812,345，−50.6%**），59 胜；对比上一提交（g51g，66 件）2,977,038 → 2,592,901（**−384,137**）。尾部补测：tile-border 14,547（g50k 28,600，−14k）、terrain-toggle-on-off 29,401（−40k）、tooling-support 26,653（与 HEAD 26.5k 持平）。残余小回归：elevated-wireframe +14,941（带灯曝光，既有）、lighting-terrain 两件 +10.6k（vs g50k 意外基线）、labels-tunnel +1.1k、munich-overview +911。

**⑤ terrain-enabled 挂账确认**：`[SHST] n=300 sl=null map=no-su` 后主线程静默 >600s（地形瓦片等待死等，karma ping timeout）——非本轮回归（同日 g50k 时代可测），留签名待查。

**⑥ 下轮**：①lighting 四件残余 ~7-9 万/件的阴影边缘/浓度校准（现已是真实投影，剩余为 200m 挤出物阴影浓度与 fake-road-shade 层叠顺序）；②ortho-camera 55,670 的甲板洞（Portal Graph L4）；③elevated-wireframe +14,941；④terrain-enabled 挂起排查；⑤跨家族回归（cast-shadows 239 style）。

### §885 终五十二g51k: 跨家族抽检回归——building 族大赚、conflation/landmark 三件 +33 万挂账（2026-09-19）

**① 方法**：model-layer/building/lighting-3d-mode 三族各 6 件 cast-shadows 夹具，git checkout 1edcafc5（g51d 前）四文件跑基线 vs 当前 HEAD 跑对照（跨家族 19 件全对比）。运维教训：zsh 不做词分割，循环变量需 `${=var}`，否则 6 个 filter 只跑第一个。

**② 记分牌（19 件全对比）**：2,301,952 → 2,456,548（**+154,596，+6.7%**）——轻度净回归，结构性分化：
- **building 族净 −19 万**：measure-light-bright 217,369→109,101（−108k）、skillion 63,842→17,997（−46k）、ground-ao 60,189→23,678（−37k）——墙体遮挡物阴影在去镜像方向下首次正确落地；
- **model-layer/state 五件逐位不变**（无阴影依赖）；
- **lighting-3d-mode 六件 ≈ 中性**（+2.4 万，其中 with-disabled-shadows +2.4 万——shadows disabled 夹具仍受影响，疑 NOFF 默认开经 model 接收路径生效，待查）；
- **回归集中三件 +32.9 万**：landmark-conflation-buckingham +137k、-lod +129k、building/conflation_promoted_id +63k——全部是 conflation/landmark 模型族。

**③ conflation 回归定性**：mgl 权威转换已核实（src/util/util.js sphericalDirectionToCartesian = az+90 无镜像，即 g51j 默认）——方向本身无错。三件回归的旧基线是镜像方向下的意外贴合（与 lighting 四件历史同构）；conflation 的地标模型阴影走 MBModelRenderer 原始级联（m_matrixR0/rawDir 独立相机），其帧内方向约定与 g51j 默认的交互需单独解剖。**下轮首刀：landmark-conflation-buckingham 的模型阴影足迹 dump（m_matrixR0 vs 模型接收 uv）**。

**④ 结论**：3d-intersections 目标族 −50.6% 的收益远大于跨家族 +15.5 万净回归；g51j 默认保持 mgl 权威转换不回退。全族记分牌含尾部补测：68 件同框 5,558,794 → 2,746,449（−50.6%）+ 三件尾部补测（tile-border 14,547/terrain-toggle 29,401/tooling 26,653）。

### §885 终五十三g51l: g51h 回退（接收矩阵深度投影无收益且伤模型夹具）+ landmark 隔离矩阵（2026-09-19）

**① landmark-conflation-buckingham 旋钮隔离矩阵（当前 HEAD 态）**：base 331,473 / shnoff=0 331,936 / shcastnormal=3 339,771 / shadowlegacy=1 333,297 / shmodelraw=0 331,473（原始级联对该夹具惰性）/ shdiralt=0 313,906——**四个 g51 变更单独均非主因**，方向翻转反而 +1.7 万收益。禁用 g51h uMBRecvMatrix（回退相机投影）：331,473→**297,538（−34k）**——接收矩阵深度投影无实测收益（3d-intersections 各件 ±噪声）且对模型重载夹具 +3.4~5 万，**已回退**（恢复 `projectionMatrix·viewMatrix` 顶点投影，删除 uMBRecvMatrix uniform 与三处绑定）。

**② 回退后验证**：ortho-camera 55,528（保持破基线）、shadows-tunnel 60,363、lighting 四件 73,498/75,768/92,407/93,371（±300 噪声）——3d-intersections 收益完整保留。

**③ landmark 残余 +11.9 万（297,538 vs 1edcafc5 178,524）定性**：隔离矩阵证明非单一 g51 变更所致，系旧全局校准（老比较器+offset+镜像+无 NOFF 的组合态）对该模型夹具的耦合调谐——与 lighting 四件历史同构，需在 mgl 忠实新基线下按模型接收路径（MBModelRenderer mbShDepth 采样 + 原始级联）重新校准。**下轮首刀：landmark 模型阴影足迹 dump（m_matrixR0 投影 vs 模型接收 uv readPixels）**。

**④ 记分牌口径**：3d-intersections 68 件同框 −50.6% 维持；跨家族 19 件抽检回归收窄至 +12 万级（conflation 三件为主）。

### §885 终五十四g51m: landmark 模型阴影足迹 dump 实锤——raw cascade 视锥窗不覆盖远置地标（2026-09-19）

**① 新探针（已提交）**：raw-shadow-footprint——raw pass 内把最高 caster 的 bbox 8 角+中心经 m_matrixR0 投影，并从 m_depthPixelsR0 数组按 uv readPixels 存储深度（shcastaudit 门控，frame 30 一次性）。

**② landmark-conflation-buckingham 读数**：最高 caster = 192.8m 地标模型，RTE bbox x[1788,2028] y[−800,−319] z[−521,−328]；**m_matrixR0 投影 uv.x −1.24~−0.74、uv.z −0.126~+0.050 全部出界**（含近平面负值）→ landmark 不在 raw cascade 覆盖窗内，其投影阴影丢失；模型接收按设计回退镜像级联。光源方位 az=311.9/仰角 7.6°（掠射）——1800m 水平偏移 × sin(7.6°) ≈ 238m 深度展开 + 侧向位移远超 ±r 窗。

**③ 结论与定界**：conflation 三件 +32.9 万回归的主结构 = raw cascade 视锥球拟合窗不含远置 conflated 地标（其阴影需近平面前伸 + 侧向覆盖）。修复 = raw cascade 拟合窗并入 caster 盒并集（shadow 族已有 casterBox 先例）并重校模型族（quantization-shadows/castro 等 calibrated 会话联动）——独立工作流。landmark 隔离矩阵（g51l）证明四 g51 变更单独非主因，本项为第二独立根因。

**g51n 补（同日）**：caster 盒并集扩窗落地后足迹探针复测——9 点 uv 全部入界（x 0.0-0.185）但 **depth 全 256=clear**：landmark 模型网格在 raw 深度 pass 中完全未被栅格化（非视锥/近平面裁剪）。窗口扩窗保留（mgl 忠实且无副作用，conflation 三件 mismatch ±噪声）。下轮解剖方向：①landmark GLB 几何 attribute 完整性（normal 缺失 → override 顶点着色器 normalize(0)=NaN → 三角形丢弃）；②模型 mesh 的 matrixWorld 在深度 pass 帧内的实际值（shcastaudit 已有通道）；③Scissor/layer 交互。conflation 三件 +32.9 万挂账维持。

**g51o 补（同日）**：①深度顶点着色器零法线 NaN 防护落地（normalize(0)→NaN 链路消除，landmark 298,398 持平——NaN 假说证伪，模型未栅格化另有原因）；②足迹探针 y 翻转修正（readPixels 为 GL 底起坐标，此前 (1−v) 镜像读数有误）——修正后 landmark 足迹 9 点中 1 点读到内容（depth 1.439），raw 覆盖开始生效但稀疏；③conflation 复测：buckingham 298,361 持平、buckingham-lod 310,054（较 g51g 276k 恶化 +34k，raw 窗扩窗对 lod 夹具的副作用待查）、promoted_id 180,809 持平。**模型资源/override 交互解剖（GLB attribute census、深度帧 matrixWorld dump、扩窗对 lod 的副作用回退评估）列入下轮**。

**g51l2 补（同日）**：扩窗回退后 lod 仍 310,054——+34k 实为 **NaN 防护的行为修正**：原本因零法线 NaN 被丢三角的几何现在正确参与深度投影（mgl 忠实：所有几何都投影），lod 夹具的新增阴影落位与 expected 尚有偏差（模型阴影方向/位置校准域）。防护保留（正确性），模型阴影落位校准并入 §终五十四③ 的模型资源解剖工作流。

**g51p 补（同日）**：①架构排查——m_sceneRoot 每帧清空重填（MapView.ts:3712/4112），深度 pass 时 tile 对象（含模型）已在 m_scene 内，"模型在 m_sceneRoot 之外"假说排除；②足迹探针 y 翻转修正后复测：raw 图在 landmark 足迹区已有部分内容（1/9 采样点 depth 1.439，其余 clear）——阴影开始落地但覆盖稀疏/落位偏差（掠射 7.6° 下 193m 模型的墙面条带极窄 + 近平面负 z 角点裁剪）；③当前渲染整体比 expected 暗 6.6 万 lum 均值、偏暗 >60 有 20.2 万 px、偏亮 2.1 万 px——多层叠差（模型墙自阴影过暗 + 长影位置/浓度 + 标注），非单一阴影链问题。**定界：landmark/conflation 工作流需独立校准会话（模型接收落位 + 浓度 + 构图）**，已具备全部探针（raw-shadow-footprint/shcastaudit/shbandline/recv-mat-audit）。

**g51o2 补（同日）**：DoubleSide + 扩窗叠加验证——足迹出现首个真实内容（角点 depth=0.345，此前全 256），4 角点 uv.z 负值系近平面边界（caster 盒角恰在近边界）。mismatch 298,820（±600 噪声）：**landmark 阴影仍未有效落地，模型资源级解剖（GLB attribute census + 深度帧 matrixWorld + 模型可见性状态）确认为必要路径**。DoubleSide/扩窗/NaN 防护均为 mgl 忠实正确性修复保留。

**g51o5c 终态（同日）**：DoubleSide 回退验证通过——ortho-camera 55,528（保持破基线）、lighting 73,498/75,768/92,407/93,371、landmark 298,361 持平。**终态配置 = g51d-g51g 六根因修复 + 扩窗 + NaN 防护 + 原始方向转换 + FrontSide 深度材质**；no-normal primitive 的逐模型 DoubleSide 列为模型资源级下轮项。3d-intersections 家族 −50.6% 收益完整保留。

### §885 终五十八g51p2: 逐模型 DoubleSide 落地（layer-2 双层深度 pass）——lod 收复 −34k，全族近中性（2026-09-19）

**① 实现**：深度 pass 拆双层——无 NORMAL attribute 的 mesh 进 layer 2（DoubleSide 材质副本，uniforms 与 FrontSide 材质共享对象），有 NORMAL 的留 layer 1（FrontSide）；两层先后渲染进同一深度目标（autoClear=false，LESS 测试保留最近面）。主渲染不受影响（模型主相机层 0 不变）。修复点：①逐帧 caster 刷新按 geometry.attributes.normal 选择性分层；②m_depthMaterialDS 副本；③renderDepthLayer2 helper 接入四处渲染点（HW/SW 主 pass、raw pass、cascade-1）。

**② 记分牌（g51p2 vs g51j 后基线）**：landmark-conflation-buckingham-lod 279,317→275,962（**−34k，g51l2 的 lod 回归收复**✓）；landmark 298,361→297,882（−479）；ortho-camera 55,528→56,289（+761，无 normal 网格新增投影）；shadows-tunnel 60,318→64,653（+4,335，无 normal 隧道几何现在正确投影）。净 ≈ 中性偏正，语义 mgl 忠实（所有几何均投影）。

**③ 运维**：zsh 双重补丁去重（16/12 空格两版字符串都被匹配）；renderDepthLayer2 内层 finally 恢复 override/layers/autoClear。

**④ 下轮**：①lighting 四件残余浓度校准（现 7.3-9.3 万，阴影已落地为真实投影）；②elevated-wireframe +14,941；③terrain-enabled SHST 挂起排查；④cast-shadows 239 style 全量回归。

### §885 终五十八g51q: 挂账项复核收尾——elevated-wireframe 非新回归、terrain-enabled 挂起定位（2026-09-19）

**① elevated-wireframe 复测 = 67,504**：与 g50t 时代 67,500 一致（±4 噪声）——非本轮 g51d-g51j 回归。g50k 参考 52,563 系带灯双重光照曝光前的过时基线（g50t 台账已记录 +4.1k 曝光），维持既有定性。

**② terrain-enabled 挂起签名定位**：SHST n=300 时 `sl=null`（shadowLightState 未解析——地形夹具的 lights 形态/解析路径差异）且 `map=no-su`；n=300 后主线程静默 >600s（karma no-message timeout）。嫌疑：地形渲染路径主线程死等（terrain tile 解码/几何生成）或测试捕获循环。需地形管线专项（非阴影链——shadowLightState null 下阴影链完全惰性，不影响挂起）。

**③ lighting 四件残余（73,184/75,458/92,108/93,072）**：阴影已真实落地；残余 = expected 构图的反推缺口——mgl 填充甲板阴影公式 `shadowed_light_factor_normal = (1−intensity·occ)·NDotL` + `apply_lighting` 全链（含 ambient_directional_factor 与 NDotL 扩展 Lambert）与我们 mbLight=×factor 链的逐项校准，加上 fake-road-shade 层叠顺序。属甲板光照公式的精化迭代。

### §885 终六十g51q补: lighting 残余构图定界（2026-09-19）

expected/current 并排对照（elevated-symbols-lighting）明确残余构成：①甲板本体与标线已对齐（暗色路面+白色标线均在）；②**甲板侧墙**：expected 为浅色受光面（ambient 照射的垂直墙），ours 黑色/缺失——墙体光照注入未覆盖 fill 甲板的侧立面；③**地面阴影浓度/范围**：ours 阴影区过度覆盖（大面积黑），expected 阴影边界更紧、地面保持中灰——200m 挤出物阴影的落位/浓度校准。两者均为墙体光照注入扩展 + 地面阴影浓度校准的独立迭代项，非阴影链结构性缺陷。探针与对照图已就绪（/tmp/esl_compare.png 模式可复现）。

**g51r 定界补充（同日）**：elevated fill 侧墙缺失为**几何生成层缺口**——datasource 无任何 fill 侧墙/skirt 发射代码（仅地形有 skirt），mgl expected 的浅色侧墙是其 elevated structures 管线的侧壁面几何。修复路径 = tile 解码/emitter 为 elevated fill 增加 200m... 实为高差侧壁几何生成（顶点翻倍+法线），再叠加墙体光照注入——两段式特性开发，非本会话阴影链范围。lighting 四件残余维持 7.3-9.3 万（甲板顶面+标线+阴影已对齐，缺侧墙几何与地面阴影浓度两项）。

**g51s 补（同日）**：elevated-wireframe 差异构成定界——expected 显示红色 wireframe 三角剖分调试图（该夹具测试 wireframe 调试渲染特性）+ 探视下穿墙体红框；ours 无红线框（wireframe 调试特性未实现/差异），且车道/多边形构图差异大。**+14,941 主体为 wireframe 调试特性差异（非阴影/光照链）**，67,504 自 g50t 稳定。修复 = wireframe 调试渲染特性实现（独立特性工作流）。阴影链 g51 系列变更对该夹具无可见影响（67,504→67,504 噪声级）。

**g51p3 补（同日）**：layer-2 落地后足迹复测——9 点 uv x 0.0-0.185 全入界（对比 g51m 扩窗前 −1.24~−0.74 全出界）→ **扩窗生效、模型已部分进 raw 图**（1/9 点 depth 1.439 有内容）；mismatch 297,882 与 g51g 的 297,538 持平——阴影落位/浓度未达 expected（剩余为：掠射 7.6° 下墙面条带极窄的栅格覆盖、近平面负 z 角点、落位浓度）。**landmark/conflation 校准路径确认：模型已投影，剩余为 raw 级联近平面扩展量与浓度校准**，独立迭代。

### §885 终六十四g51p4: raw 级联 near/far 符号约定修正——模型不再近平面裁剪（2026-09-19）

**① 实锤与修复**：caster 盒最高角 uv.z −0.126（越界）根因 = 扩窗的 `near=min(near,minZ)` 混用距离与 view-z 约定——three 正交相机可视 view-z ∈ [−far, −near]，caster 顶点可坐落 view-z 正值区（相机后侧），需 `near=min(near, −maxZ)`、`far=max(far, −minZ)`。修正后足迹 9 点 uv.z 全部转正（0.133-0.268），模型不再近平面裁剪；footprint 探针的 dep 公式缺 /255（显示放大 255 倍）已记录。

**② 结果**：landmark 297,693（−190 噪声级）——模型已正确进 raw 图，剩余 29.8 万 = 构图差（roof/wall 材质着色、标注、阴影浓度），属模型资源级校准迭代，非投影/裁剪缺陷。conflation 三件收复需在该基线上做阴影落位浓度迭代。

**③ 下轮**：①landmark 阴影浓度/落位校准迭代（探针就绪）；②lighting 甲板光照公式精化；③wireframe 调试特性；④terrain-enabled 地形管线；⑤cast-shadows 239 style 全量回归。

### §885 终六十六g51q2: lighting 残余定界收束——deck 在挤出物阴影带之外（2026-09-19）

高倍对照（expected 暗区边界）：暗区边界为**锐利直线**（200m shadow-casters 挤出物的阴影带边缘），deck 整体位于带内（全暗 (57,63,70)），带外地面 lit (183,190,188)。ours：deck lit（阴影带未覆盖 deck uv）。挤出物本体已确认入 raw 图（rmstyle 对照三角消失）——**残余根因 = 挤出物阴影带与 deck 接收 uv 的覆盖错位**（掠射/高挑遮挡物的阴影带宽度对光方向、fit 窗口、挤出物高度评估敏感）。校准路径：挤出物阴影带投影审计（将 shadow-casters 挤出物 bbox 角经 m_matrix 投影，与 deck uv 分布叠合），方向/高度/窗口三参数扫掠。收复后 lighting 四件预期大幅下降。

**状态收束**：3d-intersections 家族 −50.6% 维持（阴影链语义已 mgl 忠实）；lighting 四件残余为挤出物阴影带覆盖校准（独立迭代）；landmark 残余为 raw 级联近平面/落位浓度迭代；elevated-wireframe 为 wireframe 调试特性实现；terrain-enabled 为地形管线挂起；239 style 全量回归待跑。全部探针与台账就绪。

### §885 终六十七g51q3: lighting 残余最终构图定界（2026-09-19）

expected 构成解析（elevated-symbols-lighting）：①甲板（暗蓝灰+标线）已对齐 ✓；②甲板侧墙薄条（浅色受光）ours 缺失（fill 无侧壁几何，g51r 定界）；③右上暗灰三角 = 200m shadow-casters 挤出物投在**地面**的阴影（锐利直边），ours 该区过暗/边界发散；④地面 lit 区两者一致。**收复路径 = ②侧壁几何生成 + ③挤出物阴影带投影审计（shadow-casters GeoJSON bbox 经 m_matrix 投影 vs 地面接收 uv 叠合，方向/高度/窗口三参数）**。阴影链语义（g51d-g51j）已全部 mgl 忠实，残余均为独立特性/校准工作流。

### §885 终六十三g51r2: guardrail 墙体光照注入（2026-09-19）

generateGuardrails 的墙体网格（MeshStandardMaterial 无场景灯 → 黑色）修复：①墙体颜色拷贝道路 deck 的 fill color（侧墙读作路面自身侧表面）；②注入 injectStructure3DLighting（屏幕空间法线 apply_lighting 链）。结果：elevated-symbols-lighting 73,498→73,533（±噪声）、elevated-wireframe 67,504→66,767（−737）。**墙体光照正确性修复保留**；lighting/wireframe 的主体残余为构图级（侧墙几何形态、wireframe 调试特性），需特性级工作流。

### §885 终六十九g51s2: wireframe 调试特性实现（2026-09-19）

**实现**：①测试侧按 style.metadata.test.showLayers3DWireframe/showElevatedStructuresWireframe 置位 `__mbWireframe3D`（逐夹具重置）；②patchTile 对 _hdElevation>0/__elev 且非 markup（renderOrder<9.75）的网格生成**三角形边线框 LineSegments**（边去重、暗红 (0.7,0,0)·α0.7、onBeforeCompile 注入 `gl_FragDepth = gl_FragCoord.z − 0.0001` 消 z-fighting——镜像 mgl HANDLE_WIREFRAME_DEBUG）；③颜色空间 0.7 sRGB→线性换算。

**结果**：elevated-wireframe 67,504（无线框）→ 76,206（线框落地，+8.7k）。**语义达成**（红色三角剖分调试线渲染），数值残余 = 三角剖分奇偶性（mgl 结构化条带 vs earcut 对角线，线框密度/方向不同）——归入三角剖分奇偶性工作流。仅此夹具受影响（metadata 门控），其余 75 件零影响。

### §885 终六十七g51q4: 挤出物阴影带投影审计（2026-09-19）

**探针增强（已提交）**：raw-shadow-footprint 增加镜像 m_matrix 投影（fill 接收采样用）——dump 最高 caster（=挤出物，246.2 单位高 ✓ 注册且栅格化）的 bbox 角 uv 矩形：x [0.364, 0.739]、y [0.091, 1.118]（顶部出界 y>1）。

**读数**：挤出物足迹矩形与 deck uv 区（x 0.47-0.50, y 0.47-0.53）部分重叠但 deck 仍 lit——**覆盖错位的精确定界需逐 texel 足迹栅格化叠合**（CPU 栅格化挤出物足迹 ∩ deck uv 分布），超出本会话预算。方向/高度/窗口三参数的候选：①光方向已 mgl 权威（az+90）②高度 246 单位（=200m×mercator 系数 ✓）③窗口扩窗已做（+4k lighting 副作用——扩窗改变 16-bit 深度精度）。

**下轮**：①逐 texel 足迹叠合分析（CPU 栅格化 shadow-casters 足迹 vs deck uv 采样点）②near/far 扩展量与 16-bit 精度的折衷实验③方向微扫掠（±5°）。

### §885 终七十g51s3: 重复 wireframe 注入回退 + texel 叠合探针固化（2026-09-19）

**① 重复机制发现与回退**：引擎已有原生线框管线（`dataSource.setLayers3DWireframe(true)`，metadata.showLayers3DWireframe 驱动，测试 3423 行）——g51s2 新增的 `__mbWireframe3D` patcher 注入与其**重复叠加**（双层红线框）→ elevated-wireframe 76,206。回退 patcher 注入与测试重复解析后：wireframe 66,767、lighting 73,533（恢复稳定态）。buildWireframeSegments 工具函数保留（ElevatedStructures.ts）。

**② texel-overlay 探针**：CPU 复现接收采样（m_matrix·世界坐标→uv→m_depthPixels 读包深度→occl/self/clear 分类）已固化（含 per-mesh try 与错误 POST 通道）；因 fetch 未达（疑 traverse 内属性访问异常静默中断）尚未产出读数，下轮沿用。

**③ 结果**：elevated-wireframe 66,767（较 g51s2 的 76,206 改善 −9,439，vs g50k 67,504 噪声级）；lighting 73,533 持平。

### §885 终六十八g51q5: lighting 残余浓度量化与收尾定界（2026-09-19）

**浓度量化**：elevated-symbols-lighting 的 deck 阴影浓度差实测——expected 阴影甲板 (57,63,70) = 基色 hsl(212,25%,71%)→(163,183,203) 的 **×0.35**；ours (127,141,157) = **×0.72**（差 2 倍）。反推 mgl 公式：`shadowed_light_factor_normal = (1−0.8·occ)·NDotL_ext`（NDotL_ext = 扩展 Lambert ≈0.863）→ `k = amb_linear·amb_factor + dir_linear·light` ≈ 0.612·0.97 + 0.217·0.173 = 0.66 → 预期 ×0.66^0.4545 = ×0.83（sRGB 域）——仍达不到 ×0.35。**mgl expected 的 ×0.35 需要其完整光照/阴影合成（含 fill-extrusion 黑墙可见性、fake-road-shade 层叠、ground shadow pass 与 per-vertex 阴影采样的合成次序）逐层复刻**——超出参数扫掠范畴，属甲板光照合成器专项。

**阴影浓度差的可能构成**：mgl 的 deck 阴影 = (ambient 恒定) + (directional × shadow) 双项合成，而 ours = 单一 factor 乘——两项合成的阴影浓度天然更深。复刻 = receiver chunk 从"乘 ground factor"升级为"ambient + directional·shadow 双项合成"（g51 系列阴影链语义已就绪，此为光照合成结构升级）。

**结论**：lighting 四件残余 7.3-9.3 万/件的收复路径已定界为**甲板光照合成器结构升级**（双项合成替代单乘），需独立会话实施。

### §885 终六十九g51q6: lighting 阴影浓度量化定界（2026-09-19）

**实测**（elevated-symbols-lighting expected）：地面 lit (183,190,188)/阴影 (82,85,84) = **×0.447**；deck 阴影 (57,63,70) = 基色 ×0.35。ours：地面阴影过暗（黑块）而 deck 阴影过亮（×0.72）——两者都不匹配 mgl。

**结论**：mgl 地面阴影浓度 = lit×0.447、deck 阴影 = albedo×0.35，其精确合成需要以 mgl 本体渲染 + 管线插桩对拍（light color 线性化路径、ground_shadow.frag 与 fill 阴影采样的合成次序、extrusion 墙可见性）——参数扫掠不可达。**收复 lighting 四件的正确路径 = 以 mgl 本体（`mgl-shot` 或 debug 页）渲染同夹具，逐层 dump 其 ground_shadow/fill 光照中间值，再反向实现**。探针与对照基础设施已就绪。

### §885 终七十一g51t: cast-shadows 跨家族全量回归（model-layer/building/lighting-3d-mode 340/385 件）（2026-09-20）

**覆盖**：model-layer 176 + building 50 + lighting-3d-mode 114 = 340 件实测（45 件因会话超时跳过，chunked runner resume 可补）。

**vs g51d 前基线（cross-before 20 件重叠，有偏——before 轮仅覆盖部分子集）**：13 胜 7 负，total +28.0 万：
- 回归集中：landmark-conflation 对件 +29.8 万（已知，模型阴影落位专项）、building/tile-border +8.1 万（新发现——需查）、conflation_promoted_id +6.2 万、with-disabled-shadows +2.7 万
- 大额收益（building 族）：measure-light-bright −10.8 万、skillion −4.6 万、ground-ao −3.7 万

**结论**：g51 系列跨家族影响结构性分化——building 族净收益显著，conflation/landmark 模型族回归 ~33 万（模型阴影落位专项覆盖）。3d-intersections 目标族 −50.6% 收益完整保留。全量 340 件的前后对照需在 1edcafc5 基线上跑完整 before 轮（~10 小时），列下轮。

### §885 终七十二g51t2: building/tile-border +8.1 万隔离定界（2026-09-20）

**隔离矩阵**：base 135,072 / shadowlegacy 135,895（比较器排除）/ shnoff=0 135,941（NOFF 排除）/ shcastnormal=3 137,489（caster 偏移排除）/ shdiralt=0 135,072（方向排除——该夹具无方向依赖）/ **1edcafc5 基线 65,416**（g50k 参考 54,564，g50t..g51c 期间已漂移 +10.9k）。

**结论**：四旋钮均非主因——回归源 = **raw XY 扩窗、layer-2 选择性投影（无 normal mesh 迁移 DoubleSide）、NaN 防护（新增投影几何）三者之一的代码级交互**，需 checkout 二分（g51d-g51g 的 7e745261 与 g51n/g51o/g51p2 各中间态）。building 族整体净收益（其余件 −10.8 万/−4.6 万/−3.7 万）远大于此单件 +8 万。

**下轮**：①该夹具 checkout 二分定位（7e745261 / g51n / g51o / g51p2 中间态）②landmark 落位浓度迭代 ③lighting 甲板光照合成器升级 ④wireframe 奇偶性 ⑤terrain-enabled。

### §885 终七十三g51t3: building/tile-border 回归根因实锤（2026-09-20）

**深度图取证**：tile-border 的 mirror 深度图显示全城建筑的栅格化足迹（掠射光下建筑墙体投影成长条带）覆盖了大量地面 uv——quad 的地面采样处处命中建筑墙体深度（stored < 地面 z）→ 阴影因子 ≈ 0 → **地面全黑（+8.1 万）**。expected 的街道亮 = mgl 的建筑阴影紧凑（阴影带仅贴建筑）。

**根因归类**：与 lighting 四件同类——**阴影落位/覆盖校准**（掠射光下建筑阴影带的投影宽度/位置）。隔离矩阵（legacy/nonoff/castn3/diralt 均无效）与 1edcafc5 基线（65,416，g51i 修复后 quad 开始渲染即出现）一致。**收复路径**：阴影带落位校准（光方向/级联窗口/挤出物高度评估联合迭代）。

**状态**：building 族净收益（−19 万）远大于此单件；3d-intersections −50.6% 维持。全 385 件回归 340/385 实测（45 件会话超时跳过，chunked resume 可补）。

### §885 终七十四g51t4: texel-overlay 探针读数——阴影已落地，残余为浓度校准（2026-09-20）

**探针修复与读数**：texel-overlay 探针修复后经 karma LOG 产出（dump 保存通道待查，数据经 console 携带）：**clsCnt = {clear:4, self:6, occl:6}**——16 个 CPU 复现采样点中 6 个正确判定遮挡（阴影落地 ✓）、6 个自采样（coplanar 边界 ✓）、4 个 clear（ground 空区 ✓）。**阴影链在 elevated-symbols-lighting 上工作正常**。

**残余 = 阴影浓度差**：ours 遮挡甲板 ×0.72 vs expected ×0.35（相对暗度差 2 倍）。mgl 的 shadowed_light_factor 公式反推 ≈×0.82 也达不到 ×0.35——expected 的额外暗度来自其多层合成（fill-extrusion 黑墙可见性、fake-road-shade、ground shadow pass 叠加次序）。

**收复路径**：以 mgl 本体渲染同夹具（`mgl-shot`/debug 页 + DEBUG_WIREFRAME 定位）逐层 dump 中间值，反向实现甲板光照合成器（ambient 恒定 + directional·shadow 双项 + 层叠次序）。探针与对照图就绪，独立专项。

### §885 会话收束（2026-09-20）

**本会话（g51c→g51t4，40 次提交 7e745261→f9341adb）交付**：
- 3d-intersections 家族 −50.6%（68 件同框 5,558,794→2,746,449，59 胜）
- 十项修复（详见 §终四十九~终七十四 各条）
- 八个持久探针 + wireframe 调试特性 + guardrail 墙体光照
- 跨家族 340/385 件全量回归（结果：cross-g51j-full，building 族净 −19 万）
- texel-overlay 探针实证阴影链分类正确（{clear:4,self:6,occl:6}）

**遗留工作流（按台账定界，探针就绪）**：
1. lighting 四件阴影浓度 ×0.72→×0.35：需 mgl 本体渲染对拍后反向实现甲板光照合成器（ambient 恒定 + directional·shadow 双项）——多个分析路径（参数扫掠/公式反推/composer 读数）均无法远程闭合，需 mgl 本体插桩
2. conflation/landmark 落位浓度迭代（raw 级联近平面已修）
3. elevated-wireframe 三角剖分奇偶性（线框已落地）
4. terrain-enabled 地形管线挂起（SHST 签名已录）
5. cast-shadows 239 style 全量 before 轮（~10h）
6. 45 件跳过夹具 resume 补测（cross-g51j-full 目录，chunked runner 自动跳过已测件）

### §885 终七十六g51t5: 方向扫掠定界——lighting 残余对阴影方向零敏感（2026-09-20）

**扫掠**（当前修复后状态）：elevated-symbols-lighting 于 shaz 0/±15/±30 全部 **73,533**（逐像素一致）——阴影带方向对该夹具 mismatch **零影响**。结合 texel-overlay 分类（6 occl/6 self/4 clear 正确），**阴影落位/方向参数完全排除**。

**残余定性收束**：lighting 四件 7.3-9.3 万 = **阴影浓度/合成结构差**（ours 遮挡 ×0.72 vs expected ×0.35）——与方向/落位无关。收复路径唯一：以 mgl 本体渲染同夹具插桩 ground_shadow/fill 光照中间值，反向实现甲板光照合成器（ambient 恒定 + directional·shadow 双项 + 层叠次序），独立专项。

**状态收束**：3d-intersections −50.6% 维持；全部 g51 系列修复已提交（41 次提交至 5ceed6d4+收束台账 a3548614/2897fe79）。

### §885 终七十七g51t6: GSHEXP 扫掠定界收束——lighting 浓度已最优（2026-09-20）

GSHEXP 扫掠（2.0/2.5/2.7/3.0）：全部 ≥190k（vs 默认 73,498）——增大阴影浓度使 mismatch 恶化。**浓度参数已最优（gsexp=1），残余 7.3 万为构图级差异（甲板/地面/标线的着色与层次），非阴影浓度可调**。收复唯一路径确认：mgl 本体渲染对拍 → 反向实现甲板光照合成器结构升级（ambient 恒定 + directional·shadow 双项 + 层叠次序）。独立专项。

### §885 终七十八g51t7: tile-border 回归二分定位——quad 编译修复暴露地面阴影图案错误（2026-09-20）

**checkout 二分**：1edcafc5 65,416 → 7e745261（g51d-g51g）**64,659** → 4f60257a（g51h-i）**126,198** → HEAD 135,072。回归引入点 = **g51h-i 的 shadows-underpass 修复**（quad chunk `mbWP.z += 10` int→float 修正使 quad 程序首次编译成功）——**quad 的地面阴影图案开始渲染**，其在 building/tile-border 上的图案错误（建筑阴影覆盖全地面而非紧凑贴建筑）+61k。

**根因归类**：quad 图案错误 = 与 lighting 四件同类的阴影落位/覆盖校准（掠射光下建筑阴影带的投影宽度/位置）——此前 quad 编译失败静默隐藏了该问题（g50u 时代引入的 int 字面量恰使 quad 恒不渲染，返回了"偶然正确"的全亮地面）。

**下轮**：①quad 图案校准（建筑阴影带落位——探针就绪）②landmark 落位浓度迭代 ③lighting 甲板光照合成器升级 ④wireframe 奇偶性 ⑤terrain-enabled。

### §885 终七十九g51t8: tile-border quad 图案 diag5 读数（2026-09-20）

shdiag=5 于 tile-border：quad 输出灰阶场 17-191 分布（暗区 17-53 占比大、亮区 190+）。**quad 的地面阴影图案已渲染但浓度/落位未校准**——建筑阴影带覆盖了过多的地面区域（对应 expected 中仅贴建筑的紧凑阴影）。校准 = quad 的阴影浓度（ground shadow factor 精确值）与建筑阴影带落位（深度图建筑足迹 vs quad uv 的对拍）。探针就绪（shdiag=5 灰阶场直读），独立校准会话。

### §885 终八十g51u: shres 扫掠定界（2026-09-20）

阴影分辨率 2048→131,357、4096→130,176（vs 1024 的 135,072，仅 −5k）——分辨率非 tile-border 过覆盖主因。quad 阴影带覆盖范围校准（需 mgl 本体对拍）维持为独立专项。

### §885 会话终态确认（2026-09-20）

**核心交付确认**：3d-intersections 家族 68 件同框 −50.6%（5,558,794→2,746,449，59 胜）。

**g51 系列修复清单（十项，全部已提交）**：接收链死种子、比较器 NORMAL_OFFSET 对齐、caster 偏移归零、shnoff bug、阴影方向去镜像、逐模型 DoubleSide、shadows-underpass 编译错误、NaN 防护、扩窗+near/far 符号、guardrail 墙体光照。

**基础资产**：八个持久探针、wireframe 调试特性、mgl-shot 本体渲染対拍、cross-g51j-full 340/385 件全量回归数据。

**lighting 四件维持 7.3-9.3 万（与 g50k 基线持平 ±噪声）**——阴影已真实落地但浓度/构图与 expected 的差异需要 mgl 本体対拍后反向实现甲板光照合成器结构升级，属独立专项。

**移交优先级**：①mgl 本体対拍→合成器升级 ②conflation/landmark 落位浓度 ③wireframe 奇偶性 ④terrain-enabled ⑤全量 before 轮+resume。

### §885 终八十二g51t10: shres=2048 验证（2026-09-20）

shres=2048：elevated-symbols-lighting 73,018（−480）、shadows-tunnel 60,648（+330）——影响微小。mgl 用 shadowMapResolution 2048（shadow_renderer.ts:215），我们默认 1024。分辨率翻倍仅带来边沿锐化改善，核心残余仍为光照合成结构差。建议 shres=2048 作为默认（与 mgl 一致）。

### §885 会话最终确认（2026-09-20）

本会话（g51c→g51t10+）交付了 44 次提交。核心改进：
- 3d-intersections 家族 −50.4%（70 件实测，61 件改善）
- 十项修复全部落地
- 八个持久探针就绪
- mgl 本体渲染対拍基础设施就绪（mgl 本体渲染与 expected 仅 3.3% 差异）

### 阴影浓度校准路径（下轮首刀）

1. **fill receiver chunk 的阴影浓度校准**：阴影乘法的浓度需要匹配 mgl 的 ground_shadow 输出（×0.45 相对于 lit ground），当前过暗或过亮取决于 pixelmatch 阈值下的具体区域
2. **甲板光照合成器结构升级**：ambient 恒定项 + directional·shadow 项的双项合成替代单一 ground-factor 乘法
3. **tile-border quad 图案校准**：quad 的阴影浓度需要与 fill receiver 的阴影浓度一致

### 移交清单
- 45 件跳过夹具 resume 补测（chunked runner 自动跳过已测件）
- terrain-enabled SHST 挂起排查
- cast-shadows 239 style 全量 before 基线轮

### §885 g66: 3d-intersections 全族新鲜基线 + 簇级归因（2026-09-21）

**① 恢复误提交 'u'（c6eccb80）**：该提交把 `polygonSubdivision` 在 MBPolygonClippingHD.ts 里重复定义了两次（第二份引用不存在的 splitRingBySegment）——tsc 编译破坏 + lib 陈旧（单测 MBElevatedRoadTest 崩在旧产物）。已删除重复块、lib 重编译，单测 310 passing 恢复。

**② 全族新鲜基线（mb-fam-align0，Chrome for Testing 131.0.0.0 指纹，75 件收齐，逐位可复现）**：
总 mismatch **2,477,829 / 75 件 / 1 PASS**（depth-segments-undefined-crash 0）。头部：shadows-underpass 128,359、ortho-camera 81,065、elevated-wireframe 77,544、tunnel-color-feature-dependent 71,115、viewport-aligned(-text) 62-63k、guard-rail-color 62,156、elevated-symbols-pitched 62,006。**lighting 四件已从 g51 时代 73-93k 进步到 24,720/27,384/44,473/45,922**。

**③ lighting 簇定性反转（esl 像素取证）**：桥面阴影带与 expected **逐位一致**（(200,450)=rgb(57,63,70) 完全相同；lit deck (82,85,84) ✓）——阴影接收链/浓度已到位。残余主项 = **右上整块路面缺失**（expected rgb(82,85,84) 路面色 vs 我们背景 rgb(184,191,189)）+ 桥洞周 speckle。DIAG9（shdiag=9）读数与正常渲染存在帧态分歧（诊断可信度待修），mgl-cover probe 的 mgl 集合 {232843-103243,232843-103244,232844-103244} vs 我们 HIT {103242,103243,232844-103242}——语料库只有 103242/103243/232844-103242 三块，**103244 两块任何一方都 404**；mgl-shot oracle（MGL_SHOT_SCALE=1 时与 expected 仅 0.17%）同样只拿到 103243 却渲染出了缺失路面 → 缺失内容的载体未定位（多边形仅 ±64 buffer，线层外溢 ±4096 但线层不经 §513 裁剪；polygonclip=0 门控 A/B 四件逐位无变化，排除解码期 clipPolygon）。**下轮首案：以 tile 屏幕映射复原（Transform 直驱）确定缺失区所属瓦片，再查该瓦片在我们管线的内容损失点。**

**④ guard-rail 簇（~255k/7 件）定性**：几何与 mgl 逐字符同构（g53 审计维持）；raillift=30 实证**网格本身光栅化为实心宽带**（一切正常），名义高度处的条纹/噪声 = 与桥面 fill 的深度合成干涉（结构网格 depthWrite=false FrontSide，g57/g52t 校准态）。g52t 矩阵的 ro 9.55（rails first）爆炸性回归维持结论：收复需要 mgl 的 **depth-reconstruction 合成通道**（离屏结构 pass + 深度重建，隐藏内部栏杆），独立专项。A/B：structwind=0（DoubleSide）180,095→181,180（+1,085 否）；raillift 0.5/1.0/1.5 全部 +92~+453（否）。

**⑤ ortho-camera 拆分**：shadowdisable=1 → 81,065→58,120（**阴影链贡献 22.9k**，其余 58.1k 为正交投影固有缺口——§571 接收端 unprojection/取景）。ortho-camera-tunnel 1,271 不变。

**⑥ ground-quad 通道 A/B（重测）**：groundquad=1+shadowoverlay=0（underlay 模式，画于一切之下）在 lighting 四件全部 **+8.2~+8.3k 恶化**——即便 underlay 也不可收（桥洞透视+fill 缺失区复合），g52v 退役结论扩大到 underlay 形态。

**⑦ 工具/基建**：mgl-shot 新增 `MGL_SHOT_SCALE` env（=1 输出 512² 与 expected 可 pixelmatch）；tmp/fam-summary.js（ibct-result 聚合表，注意 name 在 imageProps 内层）；tmp/img-diff.js（pixelmatch+均值）；polygonclip=0 调试门控（VectorTileDataEmitter + harness，本轮无效应保留备用）；shadowmgl=0 为无效 knob（harness 只解析 =1，值 0 落空）——已记档。

**移交优先级**：①缺失路面载体定位（③）→ 预期回收 esl 四件 ~140k + shadows-underpass 128k 的大头 ②guard-rail depth-reconstruction 专项 ③ortho-camera 正交接收端 58.1k ④elevated-wireframe 77.5k（三角剖分奇偶性）⑤tunnel 簇 ~390k 归因（下一轮 DIYAG/内容对拍）。

### §885 g67: "缺失路面"证伪→实为背景投影；深度测试地面阴影通道建成（默认待校准）（2026-09-21）

**① g66 "缺失路面"结论修正（决定性实验）**：esl 夹具 mgl 本体隐藏 shadow-casters 层（临时 fixture __nocast）→ 右上暗楔**完全消失、场景全亮**——右上区域不是路面，而是 **shadow-casters 内联 geojson 挤出体（200m 建筑）投在背景地面上的影子 + 暗墙**。像素证据闭环：lit 背景 184 × 0.446(=pow(A/(A+D),1/2.2), A=0.1 D=0.75·cos50°) = 82 ≈ 实测楔形 (82,85,84)；mgl z18 瓦片请求 {103243(200),103244(404),232844-103244(404)}，103243 语料库 md5 与我们一致——与瓦片/裁剪/外溢全部无关（tile-screen-probe.ts 用 vendored Transform locationPoint 把瓦片角投屏，边界线叠图核对）。g66 的"缺失路面载体"开放项就此关闭：**载体 = 背景投影缺失**。

**② 深度测试地面阴影通道（MBShadowRenderer.ensureGroundPlane/updateGroundPlane/attachGroundPlane，本 g67 主体）**：世界空间 4 顶点地面网格（每帧按 prepGroundQuad 角点重定位，RTE 帧 = 角点 − eye），MeshBasicMaterial + MultiplyBlending（=mgl ColorMode.multiply），depthWrite=false depthTest=true，renderOrder 9.9（fills 9.5-9.8 后、symbols 前），每帧 preSceneHook 重挂 m_sceneRoot。fragment：vMBGPW 采样 3×3 PCF（打包 rg 解码）+ cascade-1 fade + `mix(pow(factor,1/2.2),1,1-int·(1-lit))`。工程陷阱三连（供后人）：
- 引擎清场用 `m_sceneRoot.children.length = 0`（绕过 three 移除记账）→ child.parent 指针残留 → `parent!==root` 判断跳过重挂 → 网格静默离场（gpred=1 红屏零像素但 parent=Object3D 在案）→ 必须**无条件 add()**；
- prepGroundQuad 曾在 m_groundUniforms（legacy overlay 未编译则 null）早退 → 角点/corners 全链饿死（[MBRf2] gc0=(0,0,0) 实锤）→ 已重构为角点无条件计算、legacy 写入单独 gated；
- FrontSide 从上方看绕序为背 → 全剔除，side=DoubleSide 必需。
现状：**gpred=1 红屏证明栅格化+深度测试全通（桥面/墙体正确拒绝、背景/地面着色）**；但真实采样 lit=0 恒成立（gplift 0/1.3/10 三值不变；gpred=2 uv 梯度平滑、gpred=3 世界坐标梯度正常）→ **默认关**（groundplane=1 显式启用）。下轮首查：m_matrix 的 z 值域 vs 地面点（diag 显示 uv4.z≥1 恒定，疑似 light-frustum far 端饱和——对照 fill receiver 的 ray-plane mbWP 与 uMBNOffZ 链路逐项对齐）。

**③ A/B 记录（全数保留在 rendering-test-results/mb-gp*、mb-gpl*）**：地面通道启用态 gp5：esl 100,562 / junction 121,709 / tunnel 219,347 / circles-nonelevated 7,853（=基线，对照 ✓）——背景正确压暗的同时地面 fill 被二次压暗（我们的 fill receiver 全量自采样 vs mgl 仅 elevated fill 自采样+quad 管地面）→ 收复需配套"非 elevated fill 停用 receiver"（mgl 语义②步，未落地）。校准完成后（①采样修复②flat-fill receiver 让位）预期回收 lighting 四件+shadows 系 ~30-40 万。

**④ 工具**：scripts/tile-screen-probe.ts（vendored Transform locationPoint 瓦片角投屏）；MBGPlane/MBGQInvoke 探针；mgl-shot 临时 fixture 法（上游 integration 树建 __nocast 副本）验证 layer 可见性二分。

**移交优先级（更新）**：①地面通道采样校准（②①：先解 uv4.z 饱和，再 flat-fill receiver 让位）→ 单通道预期回收 ~30 万+ ②guard-rail depth-reconstruction ③ortho-camera 正交接收端 58.1k ④elevated-wireframe 77.5k ⑤tunnel 簇 ~390k。

### §885 g67b: 地面通道采样诊断推进——gp5 全黑根因=零因子；剩余=光域拟合不含影子足迹（2026-09-21）

**① gp5 全黑根因闭合**：当时 updateGroundPlane 从 m_groundUniforms（null）拷 factor → 向量恒 (0,0,0) → pow(0,1/2.2)=0 → F=light → 影子区纯黑。已改为本地按 lighting3DState 计算 factor 与 fade（不再依赖 legacy stash）。

**② gdiag4b（groundplane=1 gpred=4，junction）**：DIAGSD 显示 **sd 读取正常**——空白瓦片区 sd≈1.004（白清）→ lit≈1；桥体足迹区 sd≈0.7（真影）→ lit<1。即**采样链（texture/矩阵/解码）已通**，plane 在空白区正确 no-op。

**③ 剩余根因（高置信）**：esl 真实路径楔形仍缺失+整屏发白伪影。[MBShadowMat] 拟合 r=97、cam=(32,-64,-66)——**光域拟合只覆盖桥体自身**；建筑（200m 高，~150m 外）的地面影子足迹沿光轴南伸 ~168m（200·tan40°），**大部分落在光域 [0,1] 之外** → 地面采样点 uv 越界/落白清区 → lit=1 → 无楔形。mgl 的 createLightMatrix 用 cascadeSplitDist(=1.5×cameraToCenterDistance)·3 的 far + verticalRange 覆盖地面影子接收区——我们的拟合半径未含"caster 影子地面足迹"。**下轮首刀：拟合半径扩至 max( casterAABB 影子足迹, 现值 )**（prepareFit 处 m_shadowCamera right/left/top/bottom 与 far），预计一步点亮楔形。

**④ 安全确认**：默认关=基线逐位（junction 18,275 / circles-nonelevated 7,853 复现）。配套步提醒：通道点亮后需"非 elevated fill 停用 receiver"（mgl：flat fill 无 RENDER_SHADOWS，地面由 quad 管）否则地面 fill 双重压暗（gp5 的第二回归源）。

**⑤ 探针扩容**：gpred=2（uv4.xyz）/3（世界坐标梯度+lit）/4（sd+uv4.z+lit）；gplift=<m>；[MBGPlane] n=1/30/300 挂载探针。全部走 MBSTYLE_EXTRA_ARGS。

### §885 g67c: 采样链修复确认+整屏发白现象定位（2026-09-21）

**① 采样链修复确认（gdiag5，esl groundplane=1 gpred=4）**：楔形区 (440,60) → (R=sd 0.114, G=z 0.86, B=lit 0) = **正确判定影子**；lit 背景 (30,30) → (1.0, 0.835, 1.0) = 正确判定亮；(200,450) 桥面 = 平面被深度拒绝（底色透出）——**采样/解码/深度分离全部正确**。g67c 前半：gp5 全黑根因确认为 updateGroundPlane 从 null m_groundUniforms 拷因子（向量 (0,0,0) → pow→0 → 纯黑）+ int=NaN 瞬态（NaN≤0 骗过门控，NaN 经 light→mix→MultiplyBlending 把覆盖像素打成黑/白垃圾）→ 已修：factor 本地计算 + NaN 分量回退 (1,1,1)（乘法恒等）+ intensity 保留最近有限值（m_gpLastIntensity）。

**② 剩余唯一现象：整屏发白（100,562，结构同基线但整体变亮）**。乘法混合理论上不可能提亮（src≤1），但实测背景 184→255 白、桥面同步变浅——两种可能：(a) 平面在透明 pass 被画两次且其中一次 F>1 或 blend 态被引擎改写；(b) 大气/天空球在平面之后合成（renderOrder 竞争）。下一轮：①gpred=1（纯红）在 gp9 同态下复测——红屏是否同样"发白化"可二分 blend 态 vs 平面覆盖范围；②renderOrder 9.9→2 与 symbols 后对比；③检查 MapRenderingManager 合成器对透明 pass 的 blend 状态管理。

**③ 基线安全**：默认关复验 junction 18,275 / circles-nonelevated 7,853 = 基线逐位。单测 310 passing。提交 ab2a8f92（g67b）+ 本条（g67c）。

**移交优先级（再更新）**：①发白现象二分（②①三步，半会话内可闭合）→ 通道点亮 → "非 elevated fill 停用 receiver" 配套 → A/B shadows-underpass+lighting 四件净改善 → ②guard-rail depth-reconstruction ③ortho-camera 58.1k ④wireframe 77.5k ⑤tunnel 簇。

### §885 g67d: 锚点改 colorspace 后实测（2026-09-21）

乘法锚点从 opaque_fragment 移到 colorspace_fragment 之后（mgl 语义：乘 sRGB 编码后的帧缓冲）。实测（groundplane=1，junction/esl/underpass/tunnel 四件）：junction 18,158（≈基线，平面基本 no-op）、esl 110,079、tunnel 219,347——仍未收敛。gdiag5/esl 证明采样本身正确（楔形 lit=0、空白 lit=1、桥面深度拒绝），故剩余为**光域拟合覆盖**（r=97 不含建筑地面影子足迹，楔形处 uv 越界→白清→lit=1）与 **flat-fill 双重压暗**的复合。gp9 楔形实测 (179,179,179) = 255(白清)×sRGB_encode(0.455) 双重编码实锤（该锚点已修，下一轮在扩拟合半径后重测即知）。通道保持默认关（groundplane=1 显式启用），基线零风险。单测 310 passing。

### §885 g67e: esl 残差像素级分解——阴影链已逐位正确，残余=远区背景色与桥面范围（2026-09-21）

**① 采样链最终确认（shrad=2 armed 态像素采样）**：(200,450)/(100,300)/(420,100) = (57,63,70) 与 expected **逐位一致**——深度测试地面通道的影子强度/位置完全正确；junction 18,158≈基线 18,286（通道 near-no-op 正常）；circles-nonelevated 7,853 逐位 ✓。gplift/shrad 扫参对 junction 全不变=采样稳定。

**② esl 残差精确分解（79,890 的构成）**：
- (440,60)/(470,30)：expected=(82,85,84)=**影子中的远区背景**(184×0.446)；ours=(115,115,115)=**白色清屏×0.455**(255×0.455=116)——同一影子因子、不同底色！**远区背景在我们渲染中是白色默认清屏**（背景注入 quad 只覆盖瓦片范围/远区无瓦片），expected 是背景层色(184)。修复=远区背景着色（clear 或全屏 background 需覆盖到地平线）。
- (30,30)：ours=(255,255,255) 白，expected=(183,190,188)——同上，远区背景白斑。
- 桥面范围：(420,100) 等桥面点逐位一致 ✓。

**③ 通道现状**：默认关（groundplane=1 启用）。全部探针就绪：gpred=1/2/3/4、gplift、[MBGPlane]。下轮：①远区背景着色（clear 色应=背景色×雾，现为白）→ 与地面通道配合即点亮楔形；②shrad 联调；③flat-fill receiver 让位。

### §885 g67f: gpone 对照实验与远区白斑记录（2026-09-21）

**① gpone=1 对照（F≡1 恒等乘法，junction）**：18,158 ≈ 基线 18,286（Δ-128）——平面 F 链路有限、无状态泄漏时的 no-op 行为正常。结合 gdiag5（楔形 lit=0 判定正确）与 gdiag4b（sd 读数正常）：**F 计算与采样均正确，通道本体可用**。

**② 遗留现象精确记录（esl，groundplane=1）**：(30,30) 远区背景基线=(184,191,189)、平面武装态=(255,255,255) 纯白——乘法混合理论上不能提亮，白斑机制未闭合（F 已限 ≤1；gpone 恒等态 junction 无白斑但 esl 未复测）。可能方向：①平面覆盖区与雾/大气合成的次序竞争（renderOrder 9.9 vs 环境合成）；②透明 pass 的 blend 态被后续 pass 改写；③SwiftShader 对 Multiply+特定 dst 的实现差异。下轮先 gpone=1 复测 esl（junction 已证无泄漏，esl 若无白斑则白斑与 F 值相关而非绘制行为）。

**③ 完整修复清单（点亮楔形的剩余步）**：①远区背景底色：白清屏→背景层色（mgl 背景层全地面覆盖；我们注入 quad 仅盖瓦片区）——注意需与雾一致（expected 远区 183=雾化背景）；②平面点亮（groundplane=1 默认化）后配套"非 elevated fill 停用 receiver"防双重压暗；③A/B shadows-underpass+lighting 四件净改善。

### §885 g67g: paint 模式实测与隧道回退定界（2026-09-21）

**① paint 模式（覆写背景色×因子）四件微赢**：esl 24,720→24,498（−222）、text −271、terrain −376、text-terrain −373；junction 18,286→18,161（−125）。像素验证：楔形 (440,60) ours=(83,86,85) vs expected=(82,85,84) Δ=1 ✓、(30,30) Δ=1 ✓、桥面带逐位 ✓——**远区背景着色修复生效**（白清屏→背景层色已落地）。(470,30) 仍差：expected 影子边界比我们更远（光域 cascade-1 覆盖/形状差）。

**② tunnel 回退定界**：shadows-tunnel 54,199→90,682（**+36,483**）——平面把隧道内部地面正确按影子压暗，但 mgl 隧道内部暗度来自 ceiling-face apply_lighting（未落地），mgl 地面影 quad 在隧道内的行为与预期不同 → 平面对 tunnel 族净有害。underpass 武装态 180s 超时（重型夹具+平面负载，无数据）。

**③ 结论**：地面通道"半点亮"净效果 = lighting 四件 −1.2k + junction −125 vs tunnel +36.5k → **净负，默认关维持**。点亮前置：①tunnel 专项（ceiling-face lighting 或平面在隧道区间的 mask/stencil 排除）②(470,30) 型影子边界差（cascade-1 覆盖/形状）。完成后预期净赢：lighting −1.2k、underpass 楔形部分（若其 128k 中背景楔形占比大则收益显著）、junction −125 落袋。

**④ 状态**：单测 310 passing；默认态=基线逐位（零风险）；全部 A/B 数据在 rendering-test-results/mb-gp*、mb-gs*、mb-gdiag*。

### §885 g67h: 采样校准闭环——paint 模式净改善确认 + shrad 细扫（2026-09-21）

**① 根因链闭合**：整屏发白 = 混合未生效（平面以不透明白覆写背景，gpone=1 对照复现）→ 放弃 dst 乘法，改为 **paint 模式**：平面直接绘制 `uMBGPBg × mix(pow(factor,1/2.2),1,light)`（uMBGPBg = 背景层色 sRGB，取自 mapView.clearColor；写入 colorspace_fragment 之后无二次编码）。绘制次序 = renderOrder **-1000**（opaque pass：背景注入 quad(-Inf) 之后、全部 tile fills(0..9.8) 之前）——fills 覆写平面，天然无双重压暗；裸背景区保留平面影子 ✓ mgl 语义。

**② 实测（junction/esl/tunnel/underpass，groundplane=1）**：
- shrad=1.0：junction −111、esl +15（≈噪声）、tunnel ±0、circles/munich/ncb 逐位不变（对照 ✓）
- **shrad=1.11（最优）**：esl **22,363（−2,357）**、text −2,422、terrain −2,592、text-terrain −2,592、junction −111、tunnel −28 → **净 ≈ −10.1k 零回退**
- shrad=1.125：净 ≈ −9.4k；shrad=1.15：净 ≈ −8.2k；shrad=1.2：−7.5k——趋势：1.0→1.11 单调改善，1.15 后回落
- **shadows-underpass 武装态 180s 超时**（重型夹具，平面新增绘制负载；需 harness 超时调整后补测）

**③ 像素验证（esl 楔形）**：(440,60) ours=(83,86,85) vs expected=(82,85,84) **Δ=1** ✓；(30,30)=(184,191,189) 亮区逐位 ✓；桥面带 (200,450)/(420,100)/(100,300) 逐位 ✓。剩余差 = 影子边界形状（expected 影子远缘更远，cascade-1 覆盖/形状）+ 桥洞 speckle。

**④ 状态**：默认仍关（groundplane=1 显式启用），基线零风险；单测 310 passing。下轮：①shrad 1.11 默认化评估（跨夹具回归扫：fog/terrain/model-layer 抽查）②underpass 超时治理后补测 ③影子边界形状（cascade-1）细调 ④flat-fill receiver 让位评估（paint 模式下或已不必要——fills 覆写平面，双重压暗仅在平面亮于 fill 自暗时发生，实测未观察到）。

### §885 g68: cascade-1 mgl 字面拟合落地（shadow_renderer.ts:336-352 逐行）——像素中性实证 + 度量基建陷阱两则（2026-09-21）

**① 源码级修复（遵"不盲目对齐"）**：audit S8/S9 主项——mgl cascade-1 是**独立的最小视锥球拟合**（near=cascadeSplitDist=1.5·ctcd, far=shadowCutoutDist=4.5·ctcd，createLightMatrix 同式 → 自有 centerDepth1/radius1 与更远的球心 (0,0,−centerDepth) per cascade），我方旧实现是"4×cascade-0 半径 + 共用球心"。本轮逐行移植：radius1/centerDepth1 同式计算（含 size/(size−1) 舍入边距与 shrad 同乘）、级联-1 pass 改用 radius1（x 窗同乘 shadowKappa）、相机位置/lookAt 移至 c1Center（cascade-0 球心 + forward·(centerDepth1−centerDepth)，shcompass/biasfix 变体保留）、m_normalOffsetRR 缺省回退改 radius1（mgl texel1 = cascades.at(-1).boundingSphereRadius 字面）。回退旋钮 **shc1old=1**；审计探针 `__mbC1Fit={r0,d0,r1,d1}`。

**② 实测（chromium 152 snap + headless-shell 149 双跑，mtime 新鲜度验证）**：
- 默认态：junction 18,284 / tunnel 53,630 / esl 24,727 / esl-text 27,394 / circles-nonelevated 7,842——新旧两臂**逐位一致**（junction/tunnel 接收端全在 cascade-0 界内，mgl shadow_occlusion 语义下 cascade-1 不参与）。
- armed 态（groundplane=1）：shrad=1.11 esl 旧 22,372≈台账 22,363 ✓ / 新 22,372 逐位同；shrad=1.0 esl 旧 24,742 / 新 24,742 逐位同——**cascade-1 窗口尺寸不是 esl 残差的敏感轴**（楔形影子内容在两窗内同质；残余"expected 影子更远"属 caster 内容范围=200m 建筑足迹 vs 桥足迹，非窗口覆盖问题）。
- 结论：改动 mgl 字面正确、全配置零回退、像素中性；保留为语义对齐基础设施（S8 级联矩阵链的 cascade-1 半边），后续 ceiling-face lighting / underpass 主攻时使用。

**③ 度量基建陷阱两则（后人必读）**：
- **run-mbstyle-render-tests.js 会整体覆写 KARMA_ARGS（:267）**——外部 KARMA_ARGS env 全部静默丢弃！旋钮必须走 MBSTYLE_* env 白名单（本轮补 MBSTYLE_GROUNDPLANE / MBSTYLE_SHC1OLD 透传）。此前多轮"armed 跑出 off 值"类假象需排查此因。
- **残留 karma chromium 占用默认口 9876** 会劫持新一轮的浏览器连接（Executed 计数串台、反馈丢失）；snap chromium 归 systemd user scope，pkill EPERM，须 `systemctl --user stop 'snap.chromium.*.scope'`，或 MBSTYLE_KARMA_PORT 换口。SwiftShader 重夹具（underpass/full-family）~15min 后 ping 超时断连是常态，A/B 批次宜 ≤4 夹具。

**④ 状态**：单测 310 passing（mocha 直跑 lib；pretest tsc --build 被 HEAD 既有 test 文件错误阻断，未计入）。下轮主攻不变：①tunnel/ceiling-face apply_lighting（S12-相关，tunnel +36.5k 回退根因）②underpass 超时治理 ③shrad 1.11 默认化跨夹具回归扫。

### §885 g69: 地面阴影通道默认点亮 + shrad=1.11 默认化——g67g tunnel 回退证伪为 g67h 已修复，净赢落袋（2026-09-21）

**① g67g 前提证伪（像素证据）**：armed（groundplane=1 shrad=1.11）vs off 三图对比（tmp/img-diff3.js, off/on/expected）：shadows-tunnel 1,527 变更像素中 **927 更近 expected / 599 更远**，mismatch 53,630→53,326（−304）——g67g 记录的 tunnel +36.5k（90,682）回退是 g67h paint 模式校准之前的 dst-乘法病象，已不复现。台账 g67g②③ 的"tunnel 专项前置"撤销。

**② 默认化回归扫（全 A/B mtime 新鲜）**：fog 33,952 / terrain-enabled 30,721 / tunnel-enterance 42,938 / road-islands 38,523 / tunnel-enterance-color 54,151 两臂**逐位一致**（平面对这些夹具零影响）；ground-shadow-fog 132,578→132,947（+369）/ hard-cutoff 132,496→132,595（+99）——亚噪声（该族基线本身 132k 级失配）。

**③ 落地**：①`ensureGroundPlane`/`attachGroundPlane` 门控改默认开（`__mbGroundPlaneOn === false` 才关，groundplane=0 回退）；②`__mbShadowRad` 默认 1→**1.11**（cascade-0/1 两处，g67h 扫描最优）；③test 旋钮语义反转（groundplane=0 = opt-out）；④runner MBSTYLE_GROUNDPLANE 支持值传递。

**④ 默认态验证（无旋钮）**：esl **22,372**（=校准最优, off 态 24,727）/ esl-terrain-enabled 41,876 / junction 18,284（持平）/ tunnel **53,326**（−304）。lighting 四件按 g67h 数据 −2.4~−2.6k/件落袋（esl 已实证）。单测 310 passing。

**⑤ 残余**：esl 影子边界形状（(470,30) 型远缘差=200m 建筑 vs 桥足迹 caster 内容范围）+ 桥洞 speckle + underpass 武装态超时无数据。下轮候选：caster 内容差（G1 范围/高度）与 underpass harness 治理。

### §885 g70: esl 残余像素级定位——"远缘差"已闭合，真残余=我方多余影带；fade 深度度量 mgl 字面化（2026-09-22）

**① g67f "expected 影子更远"已闭合**：(470,20..80) ours=(83,·,·) vs expected=(82,·,·) **Δ1**（默认点亮态实测）——g69 默认化后远缘差不再是残余。

**② fade 度量字面修正（audit S13）**：mgl `v_depth = gl_Position.w` = **相机前向深度 (−viewZ)**，非 3D 距离。两处落地：地面平面（`mbCamFwd` 投影点积替代 `distance()`）与 extrusion 接收端（`vViewPosition.z` 替代 `length(vViewPosition)`，vViewPosition=−mvPosition 故 z 即 w）。实测 esl/tunnel 逐位不变（该夹具 fade 未激活），语义归一留待高 pitch 远景夹具生效。

**③ 真残余定位（esl 22,372 中的主导结构）**：影子掩膜 XOR 连通域——**我方多余影带 n=14,093（bbox 0,0-397,190），expected 多余仅 383**。差带两条边界线汇于建筑西南角 ≈(65,165)，边界角差 ~14°。逐项排除：
- `shadowdisable=1`：差带消失 → 属阴影链内容（非路面填充/几何）；
- `shaz=±13`：esl 52,087/47,619（3× 变差）→ **非全局光方位角**（现有方位校准正确）；
- `elevcasteroff=1`：差带仍在、总数 22,372 不变 → 非 elevated-structures caster 段（该旋钮对此夹具惰性）；
- 建筑本体两态均在画（90,90,90 面色在默认态可见；"建筑缺失"系无影对照被 expected 含影污染的误判，已数值证伪）。

**④ 剩余假设（下轮正攻）**：差带=我方深度图在 mgl 判亮的区域有遮挡内容，边界同锚建筑角、角差 14°——候选：我方建筑 extrusion 的顶面/棱几何与 mgl 体素有系统差（如垂直棱的斜切/顶盖多边形），或我方 caster 采集了建筑之外的第二高体。**下一步探针**：gpred=2（cascade uv）+ gpred=4（sd/z/lit）在差带像素 (30,200)/(64,200) 采样定位贡献级联与遮挡深度值，再反投影光空间 uv 到 c0/c1 深度图 dump（shadow-depth-canvas/canvas1 已随 feedback 自动落盘）找出遮挡三角形。

**⑤ 状态**：esl 22,372 / tunnel 53,326 / junction 18,284 持平；单测 310 passing；tsc 26（=HEAD 基线）。工具：tmp/img-diff3.js（三图对比）、tmp/esl-xor.png（差集叠加）生成法在案。

### §885 g71: esl 差带遮挡源定位闭环——非地下 caster、非方位角；残余=路面填充覆盖缺失复合低矮 caster 影（2026-09-22）

**① 探针链（按 g70④ 计划执行）**：MBSTYLE_GPRED=4（sd/z/lit）→ 差带像素 (30,200)/(64,200) sd=0.235 < z=0.259（深度图确有遮挡体，PCF 部分 lit=0.28）；MBSTYLE_GPRED=2（uv）→ 光空间 uv=(0.235,0.259)；用 recv-mat-audit 的 uMBShadowMatrix 反投影遮挡点 3D 坐标。**坐标系陷阱**：接收地面点(+10m lift)反投影 z=−36.6 → 矩阵帧 z 原点有偏置；以地面为基准换算后**遮挡体高出地面 ~11m（低矮结构，非地下）**，楔形处遮挡体 +135 单位（200m 建筑中上部，合理）。

**② 决定性排除实验**：新增 `shclipunder=<z>` 旋钮（深度 pass 顶点 w=0 剔除 z 下界 caster，g71 落地，默认 −1e9 惰性）——`shclipunder=0` 实测 esl **22,372 逐位不变** → 地下 caster（隧道墙/地下路）不是差带源，g70④ 的"地下几何"候选撤销。

**③ 差带真面目（像素证据）**：expected 在差带 (30,200)=(127,141,156)=**亮色路面填充**，(100,220)=(57,63,70)=被影路面；我方两处均无路面几何（无影态 135,147,162=背景色）。结论：**差带=我方缺失的路面段**（edge/覆盖生成差异，g52x2 已有前科：瓦片边界带 isOnBorder 跳过 + 404 瓦片）**复合**我方低矮桥面 caster（~11m）影子投在该无路区——mgl 侧该处有路面+路面自带的 receiver 阴影判定（判亮）。即：先补路面几何覆盖，影子残差才能独立评估。

**④ mgl ground shadow 机制字面入库（painter.ts:1454-1471 + shadow_renderer.ts:439-487）**：时序=clearStencil → 逐 fill 层 drawGroundShadowMask（depthSegments 以 depth-reconstruct 投到 z=0、stencil REPLACE 0xFF，LEQUAL ReadOnly）→ drawGroundShadows（per covering-tile extent quad，**stencil EQUAL 0x00**、ColorMode.multiply、shadowed_light_factor_plane_bias）——**路面像素被 mask 排除出地面影 quad**，路面阴影走 fill 自身 receiver。我方 paint 模式平面用 fills 覆写近似了该语义，S12 stencil 机制本身仍为等价近似（挂账维持）。

**⑤ 状态**：esl 22,372 持平（探针零扰动）；单测 310 passing；tsc 26。工具增量：MBSTYLE_GPRED/GPONE/SHCLIPUNDER 透传 + shclipunder 旋钮。下轮正攻：**路面几何覆盖缺失**（差带内缺失段的 edge 生成/瓦片覆盖审计，关联 G10 SUBDIVISION_EDGE_EXTENSION 与 g52x2 边界带记录）。

### §885 g72: 差带缺失路面=flat fill 外溢——机制链闭环至"消失点在发射之后"（2026-09-22）

**① 颜色数学定性**：expected 差带色 (127,141,156) = **fake-road-shade `rgb(214,221,219)` × apply_lighting(~0.6)** 精确匹配（road-base hsl(212) 蓝调不符）。fake-road-shade 是**无 fill-elevation-reference 的平面 fill** → mgl 平面 fill 桶**从不裁剪到瓦片界**（仅 HD 路径 clipPolygonsToTile margin=1，fill_hd_extension.ts:129/288）→ 外溢渲染进 404 空洞（g66 mgl-shot oracle 实证同语料可渲染）。

**② 数据侧证实**：直读 vendored MVT（tmp/mvt-extent.js）：18-232843-103243 的 hd_road_polygon 几何 x 达 100,607（extent 8192 的 ~12 倍）——**tilecover 族夹具的瓦片本来就不裁剪**，外溢数据在库中。覆盖集：72 cell 请求、差带所属 cell 404（语料无）、外溢源瓦片 HIT+decoded（[MBFillHD-bounds] 三 decodeCenter 与 HIT cell 对齐）。

**③ A/B 陷阱揭露**：`polygonclip=0` 实测逐位不变的原因=**旋钮装错包**——`__mbNoPolyClip` 消费者在 flywave-vectortile-datasource/VectorTileDataEmitter.ts:878，而 mbstyle 夹具走 MBTileDataEmitter（其平面 fill 分支代码本身无裁剪）。旋钮对 mbstyle 族恒惰性，此前结论"decode 裁剪非裁点"仍成立但证据无效化后需以正确探针重做。

**④ 残余悬点（下轮正攻）**：flat 外溢在 processFillFeature 平面分支（无裁剪、project() 无 clamp 迹象）之后、光栅化之前消失。候选：proto 读取器几何上限/project() 深处 clamp/逐瓦片对象剔除。**下一步**：仿 [MBFillHD-bounds] 增设平面 fill 世界边界转储（含瓦片本地 x>extents 的顶点计数），一次运行即可定位消失层级。

**⑤ 状态**：本轮零渲染行为改动（仅 runner MBSTYLE_POLYCLIP 透传+取证工具 mvt-extent.js）；esl 22,372 基线不变；台账更新。

### §885 g73: g71/g72"缺失路面"前提修正——路面在画，差带=阴影判定差；flat 外溢遥测入库（2026-09-22）

**① 前提修正（证据重读）**：无影态 (30,200)=(135,147,162)≈路色×光照（若缺失应为背景 184,191,189）——**fake-road-shade 路面我方一直在画**（含外溢：[MBFlatSpill] 遥测 960 条，fake-road-shade/road-hatched-area 外溢顶点均在流经发射器，无裁剪）。g71③/g72① 的"缺失路面段"结论撤销。

**② 差带精确定性（三次取证合并）**：差带=**同一 rendered 路面上我方判影/expected 判亮**。我方深度图在差带光路上有 +11m（相对地面）遮挡体（g71 反投影），expected 无。排除已定：非地下 caster（shclipunder=0 逐位不变）、非光方位角（shaz±13 均 3× 变差）、非 elev-caster 结构段（elevcasteroff 下 (30,200) 仍暗）。剩余候选：**路fill/deck 网格作为 caster 的注册集合或高度差**（我方 deck 6.00 vs mgl 5.00, g52e 记录在案）——6m vs 5m deck + 投射几何差待逐类 caster 消隐 A/B（deck 路面网格、护栏网格、建筑）。

**③ 工具落地**：MBFlatSpill 平面外溢遥测（decodedbg 门控，MBTileDataEmitter 平面分支）+ tmp/mvt-extent.js MVT 直读器；runner MBSTYLE_POLYCLIP 透传（注意：该旋钮消费者在 flywave-vectortile-datasource 包，对 mbstyle 夹具恒惰性——见 g72③）。

**④ 状态**：单测 310 passing；tsc 26；esl 22,372 持平（遥测零扰动）。下轮：逐类 caster 消隐旋钮（deck/rail/building 各一）在差带像素 (30,200) 定位 +11m 遮挡体归属。

### §885 g74: 差带遮挡体归属定位——= 200m 建筑，且建筑底面朝向差 ~14°（数值+视觉双确认）（2026-09-22）

**① 消隐矩阵（shcasteroff=extr|hd 新旋钮 + elevcasteroff 组合，全部 mtime 新鲜）**：
- offextr 单独：逐位不变——**假象**：建筑挤出件经 MBMaterialPatchManager:232 的 `__mbExtrusion3DLit` 路径**直接 layers.enable(1)**，不经 registerShadowCaster，旋钮打不中；
- offhd 单独：casters 70→6-9（census 实证生效），esl 仅 −14px，(30,200)/(470,30) 仍暗 ⇒ 剩余 6-9 个 caster（=建筑挤出件）足以覆盖差带；
- elevcasteroff+offextr 组合：逐位=默认 ⇒ 结构段+挤出全非差带源。
- **结论：差带遮挡体 = 200m shadow-casters 建筑的影子**。

**② 建筑朝向差（本轮主发现）**：影子掩膜几何分解——右边界=光方向射线自建筑角（两引擎逐位一致, (470,*) Δ1 ✓），左边界=建筑顶边平行线：ours 斜率 tan=1.61 vs expected tan=2.94（**绕同一角点 ≈(59.5,168) 旋差 ~14°**）。视觉模型并排比对独立确认"我方建筑顺时针旋转 ~12-15°"。mgl 侧 zLevel 为死参数（传入 addPortalCandidates 后从未使用）——deck 高度差候选排除。

**③ 根因候选（下轮正攻）**：我方 GeoJSON fill-extrusion 顶点链（GeoJsonDataAdapter.project→world2tile（纯 mercator 各向同性）→transformPolygonGeometry→emitExtrudedPolygon→project()）存在旋转/各向异性失配——MVT 道路同链投影像素级吻合，唯 GeoJSON 建筑旋转，嫌疑集中在 GeoJSON 专属分支（m_mvtFlip=null 无变换 vs MVT 侧 y-flip 补偿的对称性）。**第一步取证**：decodedbg 下转储建筑底环世界坐标，与 geojson 原始经纬度（已知 5 点）离线比对即可定位失真层级。

**④ 工具落地**：shcasteroff=extr|hd 逐类消隐旋钮（注意 extr 分支对 :232 直连路径无效——补挂账）+ MBSTYLE_SHCASTEROFF 透传；caster census 验证法（offhd 70→6）入档。

**⑤ 状态**：单测 310 passing；tsc 26；esl 22,372 持平（旋钮默认惰性）。

### §885 g75: 建筑底环对拍——朝向正确（0.177 vs geojson 0.178），旋转嫌疑移至顶环/挤出轴（2026-09-22）

**① 底环转储（[MBBldgRing] decodedbg, g74③ 计划执行）**：5 点环主片段（NE cell 帧）可辨识真边 P3→P4 斜率 **0.177 ≈ geojson AB/CD 边斜率 0.178**——**底环世界朝向逐位正确**，其余角点为 tile 边界裁剪伪影（±38.2 钉扎）。g74"底面旋转"假设对底环不成立。

**② 嫌疑收敛**：楔形左边界=建筑**顶边**影子的平行线——底环正确而顶边影子旋 14° ⇒ **顶环相对底环横移 ~50m（=200m·tan14°）**：挤出轴倾斜（up-矢量含水平分量）或高度施加路径带水平项。此量级的倾斜在渲染上即视觉所见"建筑旋转"。**下一步**：[MBBldgRing] 扩展转储顶环（base+height 后同点坐标）五点对拍底环，Δx/Δy/Δz 直接读出倾斜向量与来源（emitExtrudedPolygon 高度加法 vs project() z 链）。

**③ 状态**：esl 22,372 持平；tsc 26；探针零扰动（默认惰性）。

### §885 g76: 挤出垂直性验证 + 嫌疑收敛至跨 cell 片段合并（2026-09-22）

**① 顶点级验证**：emitExtrudedPolygon 顶/底构造 `tx=w.x, ty=w.y`（平面路径 top 与 base 严格同 x/y，spherical 路径沿径向）——**挤出轴无倾斜**，g75②"顶环横移"假设不成立。

**② 嫌疑最终收敛**：底环主片段朝向正确 + 挤出垂直 ⇒ 单片段几何正确；**剩余解释=跨 cell 片段合并帧差**（建筑横跨 4 cell，各 cell 的 clipped 片段经 g43/g45 邻居合并/重标定拼装——某片段帧错会改变合成顶边走向）。与 [MBBldgRing] n=4 sliver 片段未对拍、及 filterFeaturesToTile/g45 merge 的既有复杂度一致。

**③ 下轮步骤（精确）**：[MBBldgRing] 扩展打印每片段的 cell key + 全角点，逐片段对 geojson 裁剪期望值（可离线精确计算），定位错帧片段；修复点在 MBExtraVectorSourcesProvider 邻居合并的坐标重标定链。

**④ 状态**：esl 22,372 持平；tsc 26；单测 310。
