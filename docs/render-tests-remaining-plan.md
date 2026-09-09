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
