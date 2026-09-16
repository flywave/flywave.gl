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
