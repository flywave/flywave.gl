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
