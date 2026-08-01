# 剩余缺口设计文档（供确认后实施）

> 截至 2026-08-01，flywave.gl render-tests 对齐率约 **86–94%**（~2780/3031 用例）。本文档分析剩余 ~6–14% 缺口，逐项给出**修改范围、实现方案、PD 估算、依赖关系、阻塞判定**，供决策后实施。

---

## 分类总览

| 类别 | 缺口 | 用例 | 阻塞？ | 需改包 | 合计 PD |
|------|------|------|--------|--------|---------|
| **A. 引擎层阻塞** | FreeCamera | 8 | ⛔ | flywave-mapview | 15–25 |
| | setPadding | 11 | ⛔ | flywave-mapview | 5–7 |
| | fitScreenCoordinates | 3 | ⛔ | flywave-mapview | 3–5 |
| | 自定义 glyph atlas 注入 | text-font(4) | ⛔ | flywave-text-canvas | 4–5 |
| | POI SDF 染色/halo | icon-halo(16) | ⛔ | flywave-mapview PoiRenderer | 3–4 |
| | 通用多遍 pre-render pass | HD隧道(10) | ⛔ | flywave-mapview | 4–6 |
| **B. 跨包架构** | 栅格投影 draping | ~52 | 部分 | mbstyle + mapview | 8–12 |
| | HD 隧道深度重建材质 | — | 部分 | mbstyle + materials | 2–4 |
| **C. 独立可实现** | SpriteAtlas 动态化（addImage） | ~48 ops | 不阻塞 | mbstyle | 3–4 |
| | sd-hd conflation | 25 | 不阻塞 | mbstyle | 10–15 |
| | fill-extrusion line-width | 9 | 不阻塞 | mbstyle | 2–3 |
| | canvas source | 4 | 不阻塞 | mbstyle | 2–3 |
| | TMS y-flip | 1 | 不阻塞 | mbstyle | 0.5 |
| | accumulated 表达式 | 1 | 不阻塞 | mbstyle | 0.5 |

---

## A. 引擎层阻塞项（需改 flywave-mapview / flywave-text-canvas）

### A1. FreeCamera（8 用例）

**现状**：MapView 相机为地理锁定（geoCenter + tilt + heading + zoom），无 6-DOF 自由相机。FOV/near/far 已有（`setFovCalculation`、`clipPlanesEvaluator`）但无 `FreeCameraOptions`。

**需改**：
| 包 | 文件 | 改动 |
|----|------|------|
| flywave-mapview | `MapView.ts` | 新增 `setFreeCameraOptions(position, quaternion)` / `getFreeCameraOptions()` |
| | `CameraUtils.ts` | 绕过 geoCenter 的相机矩阵路径 |
| | `FrustumIntersection.ts` | 基于 FreeCamera 的视锥剔除 |
| | `VisibleTileSet.ts` | 基于 FreeCamera 的瓦片选择 |
| | `ClipPlanesEvaluator.ts` | 尊重 FreeCamera 的 near/far |

**方案**：新增一条绕过 geoCenter 的相机路径——直接接受 `position: Vector3` + `quaternion`/`lookAt(target)`，让 `VisibleTileSet`、`FrustumIntersection`、`ScreenProjector` 基于世界矩阵而非 geoCenter 反推。参考 mapbox-gl `FreeCameraOptions`。

**PD**：15–25（核心架构改动）
**依赖**：无前置

---

### A2. setPadding（11 用例）

**现状**：MapView 无 padding 属性。`getCanvasClientSize()` 直接返回 canvas 尺寸。

**需改**：
| 包 | 文件 | 改动 |
|----|------|------|
| flywave-mapview | `MapView.ts` | 新增 `padding = {top,right,bottom,left}` |
| | `CameraUtils.ts` | `setCameraParams` 的 `ppalPoint` 注入 padding 偏移 |
| | `ScreenProjector.ts` | 屏幕坐标 padding 平移 |
| | `ScreenCollisions.ts` | 碰撞盒 padding 平移 |

**方案**：`CameraUtils` 已有 `ppalPoint`（主点）概念。padding 转为视口中心偏移 → 改 `projectionMatrix` 的偏心。在 `updateCameras` 中把 padding 转成 principal point offset 并重算投影矩阵。

**PD**：5–7
**依赖**：无前置；A4 (fitScreenCoordinates) 依赖此项

---

### A3. fitScreenCoordinates（3 用例）

**现状**：MapView 无 fitBounds/fitScreenCoordinates。

**需改**：
| 包 | 文件 | 改动 |
|----|------|------|
| flywave-mapview | `Utils.ts` | 新增 `fitBounds(geoBox)` / `fitScreenCoordinates(p0, p1)` 数学 |
| | `MapView.ts` | 暴露为公开方法 |

**方案**：用 `projectPoint` + focalLength 反解 zoom/center 使两点落入视口。依赖 A2 (padding) 才精确。

**PD**：3–5
**依赖**：A2 (setPadding)

---

### A4. 自定义 glyph atlas 注入（text-font 4 + font-metrics 15）

**现状**：flywave-text-canvas 的 `FontCatalog` 构造器 `private`，只能通过 `FontCatalog.load(url)` 从 BMFont JSON 加载。不能注入外部 SDF atlas。mbstyle 的 `MBGlyphLoader` 已有 PBF 解析但无法灌入 FontCatalog。

**需改**：
| 包 | 文件 | 改动 |
|----|------|------|
| **flywave-text-canvas** | `FontCatalog.ts` | 新增 `static fromGlyphAtlas(glyphs: GlyphData[], texture, meta)` |
| flywave-mapview | `text/FontCatalogLoader.ts` | 支持外部传入 FontCatalog |
| mbstyle-datasource | `MBGlyphLoader.ts` | PBF 解析后构造 GlyphData[] → 调 `FontCatalog.fromGlyphAtlas` |

**方案**：给 FontCatalog 增加公共工厂方法接受外部 `GlyphData[]` + `THREE.Texture`。mbstyle 的 MBGlyphLoader 解析 pbf range → 构造 GlyphData[] → 注入。

**PD**：4–5（text-canvas 改造 + 联调）
**依赖**：无前置

---

### A5. POI SDF 染色/halo（icon-halo 16 用例）

**现状**：flywave-mapview 的 `PoiRenderer` 用 RGBA `IconMaterial`，无 SDF 距离场采样/halo。mbstyle 有 `MapSDFIconMaterial`（含 halo/color）但未接入 PoiRenderer。

**需改**：
| 包 | 文件 | 改动 |
|----|------|------|
| flywave-mapview | `poi/PoiRenderer.ts` | 检测 `sdf===true` → 分支到 SDF 材质 |
| | `poi/PoiBuilder.ts` | SDF 图标的 UV/color/halo 几何属性 |
| mbstyle-datasource | `MapSDFIconMaterial.ts` | （已有，需接入） |

**方案**：PoiRenderer 检测 `SpriteIconInfo.sdf`（字段已定义但未用），切换到 SDF 材质 + UVBox + per-icon color/halo uniform。

**PD**：3–4
**依赖**：无前置

---

### A6. 通用多遍 pre-render pass（解锁 HD 隧道 + 栅格投影 draping）

**现状**：flywave-mapview 有后处理 EffectComposer（postprocessing 库）但无"主渲染前插入自定义场景渲染遍"的一等扩展。WillRender 事件可用但 hacky（易与 composer 缓冲区冲突）。

**需改**：
| 包 | 文件 | 改动 |
|----|------|------|
| flywave-mapview | `composing/MapRenderingManager.ts` | 新增 `addPrePass(pass)` / pre-pass 链 |
| | `MapView.ts:3612` | 主 render 前调用 pre-pass 链 |

**方案**：在 MapRenderingManager 增加 `prePasses: Pass[]`，在 `composer.render()` 前执行。pre-pass 可渲染到自定义 WebGLRenderTarget（含 DepthTexture），供主 pass 材质采样。

**PD**：4–6
**依赖**：无前置；解锁 B1（栅格 draping）和 B2（隧道深度重建）

---

## B. 跨包架构项

### B1. 栅格投影 draping（~52 用例）

**现状**：`MBMapProjection` 矢量重投影已工作（decode-time 顶点重投影）。但：
- `getScaleFactor` 恒返回 1.0（线宽/符号在变形区不一致）
- 长线段无大地线加密（曲线偏差）
- 栅格瓦片无 rasterize→drape 管线

**需改**：
| 包 | 文件 | 改动 |
|----|------|------|
| mbstyle | `MBMapProjection.ts` | `getScaleFactor` 实现 + 线段递归中点细分 |
| mbstyle | `MapRasterMaterial.ts` | 投影变形网格 drape shader |
| mbstyle + mapview | 新建 drape pass | 需要 A6 (pre-render pass) |

**方案**：
1. 矢量：补 `getScaleFactor(worldPoint)` + 移植 mapbox `resample.ts` 递归中点细分
2. 栅格：建立 rasterize→drape（mercator 栅格 → 离屏 RT → 按目标投影网格采样）

**PD**：8–12（栅格 drape 管线是大头）
**依赖**：**A6**（通用 pre-render pass）

---

### B2. HD 隧道深度重建材质

**现状**：A6（多遍 pass）是前置。隧道深度重建需要：先渲染隧道几何到 depth texture → 主 pass 材质采样做深度重建。

**需改**：
| 包 | 文件 | 改动 |
|----|------|------|
| mbstyle | 新建隧道深度材质 | 采样 depth texture + 空间重建 |

**方案**：复用 `TerrainDepthOcclusion.ts` 的 RenderTarget 模式。隧道几何渲染到 depth RT → 主 pass 材质采样 → 片元里投影到 z=0 平面做深度重建。

**PD**：2–4（材质部分；pass 基础设施在 A6）
**依赖**：**A6**

---

## C. 独立可实现项（不阻塞，可在 mbstyle-datasource 内完成）

### C1. SpriteAtlas 动态化（addImage/removeImage，~48 operations）

**现状**：mbstyle `SpriteAtlas` 构造后不可变。mapview 的 `MapViewImageCache` 已支持运行时增删。

**需改**：
| 包 | 文件 | 改动 |
|----|------|------|
| mbstyle | `MapIconMaterial.ts` | `SpriteAtlas.addIcon(name, image, sdf?)` + atlas 重打包 |
| | `MBStyleDataSource.ts` | 暴露 `addImage/removeImage` 代理 |

**PD**：3–4

---

### C2. sd-hd conflation（25 用例）

**现状**：SD/HD 数据混合渲染，HD 覆盖处隐藏 SD。需要 HD coverage 判断。

**需改**：
| 包 | 文件 | 改动 |
|----|------|------|
| mbstyle | evaluator | SD 层在 HD coverage 区域隐藏（类似 clip-layer 的几何查询） |

**PD**：10–15

---

### C3. fill-extrusion line-width（9 用例）

**现状**：`fill-extrusion-line-width` 控制挤出边缘线宽。

**需改**：
| 包 | 文件 | 改动 |
|----|------|------|
| mbstyle | `MBMaterialPatchManager.ts` | 边缘 EdgesGeometry 或边缘 shader 注入 |

**PD**：2–3

---

### C4. canvas source（4 用例）

**现状**：`canvas` source 类型未支持。

**需改**：
| 包 | 文件 | 改动 |
|----|------|------|
| mbstyle | `MBEnvironmentManager.ts` | 类似 image source，用 `THREE.CanvasTexture` |

**PD**：2–3

---

### C5. TMS y-flip（1 用例）

**现状**：TMS scheme 的 y 轴翻转未处理。

**需改**：
| 包 | 文件 | 改动 |
|----|------|------|
| mbstyle | `MBStyleManager.ts` | `resolveSources` 检测 `scheme:"tms"` → URL 中 y 翻转 |

**PD**：0.5

---

## 依赖关系图

```
独立可做（无前置依赖）：
├── C1 SpriteAtlas 动态化 (3-4 PD)
├── C3 fill-extrusion line-width (2-3 PD)
├── C4 canvas source (2-3 PD)
├── C5 TMS y-flip (0.5 PD)
├── A4 glyph atlas 注入 (4-5 PD, 需改 text-canvas)
├── A5 POI SDF (3-4 PD, 需改 mapview PoiRenderer)
├── A1 FreeCamera (15-25 PD, 需改 mapview 核心)
└── A2 setPadding (5-7 PD, 需改 mapview)

依赖链：
├── A2 setPadding → A3 fitScreenCoordinates (3-5 PD)
├── A6 多遍 pre-render pass (4-6 PD)
│   ├──→ B1 栅格投影 draping (8-12 PD)
│   └──→ B2 HD 隧道深度重建 (2-4 PD)
└── C2 sd-hd conflation (10-15 PD, 独立但复杂)
```

---

## 建议执行顺序

### 第一批：独立快速项（~8 PD，解锁 ~65 用例）
1. C5 TMS y-flip (0.5 PD)
2. C3 fill-extrusion line-width (2-3 PD)
3. C4 canvas source (2-3 PD)
4. C1 SpriteAtlas 动态化 (3-4 PD)

### 第二批：引擎改造（~12-16 PD，解锁 ~40 用例）
5. A6 通用多遍 pre-render pass (4-6 PD) ← **基础设施，解锁后续**
6. A4 glyph atlas 注入 (4-5 PD)
7. A5 POI SDF (3-4 PD)

### 第三批：大型工程（~30-50 PD）
8. A2 setPadding (5-7 PD)
9. A3 fitScreenCoordinates (3-5 PD)
10. A1 FreeCamera (15-25 PD)
11. B1 栅格投影 draping (8-12 PD)
12. B2 HD 隧道深度重建 (2-4 PD)

### 第四批：可选/低优先
13. C2 sd-hd conflation (10-15 PD)

---

## 确认清单

请确认以下决策后开始实施：

- [ ] **第一批**（C1–C5 独立项）是否立即开始？
- [ ] **第二批**（A4/A5/A6 引擎改造）是否授权修改 flywave-mapview / flywave-text-canvas？
- [ ] **第三批**（A1 FreeCamera）是否优先？还是暂缓（最大单项）？
- [ ] **B1 栅格投影 draping** 是否需要（globe 原生已工作，仅非球体投影）？
- [ ] **C2 sd-hd conflation** 是否需要（25 用例但复杂）？
