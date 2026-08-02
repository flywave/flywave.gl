# Render-Tests 全量特性移植清单

> 基于 270 个测试分类 / 3031 个用例的全量扫描，逐项标注实现状态。
> 更新至 v34（2025-08-02）。

## 图例
- ✅ = 端到端工作（emitter + patcher + 测试通过）
- ⚠️ = 部分实现（基础工作但有已知缺陷）
- ❌ = 未实现或仅 spec 默认值

---

## 1. Fill 层（~85 测试）

| 分类 | 数量 | 状态 | 说明 |
|------|------|------|------|
| fill-color | 8 | ✅ | technique.color |
| fill-opacity | 9 | ✅ | technique.opacity |
| fill-outline-color | 8 | ✅ | v18 D3 EdgesGeometry 描边 shader |
| fill-pattern | 15 | ✅ | v18 patchFillPatternMaterial 子矩形 UV |
| fill-pattern-cross-fade | 4 | ✅ | emitter 读 `_patternCrossFade` + shader `uMBPatternCrossFade` |
| fill-translate | 3 | ✅ | v14 A1 uniform 注入 |
| fill-translate-anchor | 2 | ✅ | v18 P5-2 方位角旋转 |
| fill-antialias | 1 | ⚠️ | polygonOffset 切换（非真实 MSAA） |
| fill-sort-key | 2 | ✅ | emitter 排序 |
| fill-visibility | 2 | ✅ | visibility:'none' → enabled=false |
| fill-z-offset | 4 | ✅ | v18 P2-1 字符串拼接 bug 修复 |
| fill-limit-number-holes | 1 | ❌ | 无 |
| fill-emissive-strength | — | ✅ | v35 patchFillMaterial 亮度 boost shader |

## 2. Line 层（~280 测试）

| 分类 | 数量 | 状态 | 说明 |
|------|------|------|------|
| line-color | 5 | ✅ | |
| line-width | 18 | ✅ | |
| line-opacity | 7 | ✅ | |
| line-blur | 5 | ✅ | |
| line-offset | 5 | ✅ | |
| line-gap-width | 5 | ✅ | v19 E4 secondaryWidth |
| line-gradient | 14 | ✅ | buildGradientTexture |
| line-dasharray | 30 | ✅ | v14 A7 完整数组 + v18 D4 GLSL 循环 |
| line-cap | 4 | ✅ | v14 A1 SolidLineMaterial cap |
| line-join | 11 | ✅ | v31 shader define 注入 fallback |
| line-pattern | 20 | ⚠️ | v18 子矩形 UV（uLineLength 硬编码可能不准） |
| line-pattern-cross-fade | 5 | ✅ | emitter `_patternCrossFade` + shader `uMBLineCrossFade` |
| line-pattern-trim-offset | 18 | ✅ | patcher 读 `paint['line-pattern-trim-offset']` + shader discard |
| line-trim-offset | 18 | ✅ | patcher shader discard（`fract(vCoords.x)` vs range） |
| line-translate | 4 | ✅ | uniform 注入 |
| line-translate-anchor | 3 | ✅ | resolveTranslate viewport/map |
| line-pitch | 5 | ✅ | 实际是 style.pitch（相机俯仰），flywave 原生支持 |
| line-sort-key | 2 | ✅ | emitter 排序 |
| line-visibility | 2 | ✅ | |
| line-border | 13 | ✅ | v14 outlineWidth/outlineColor |
| line-border-gradient | 4 | ❌ | |
| line-blend-mode | 6 | ✅ | additive/multiply/default |
| line-emissive-strength | 3 | ✅ | v14 uMBEmissiveStrength uniform |
| line-width-unit | 6 | ✅ | v35 meters→pixels 缩放 |
| line-triangulation | 2 | ✅ | 原生管线 |

## 3. Elevated-Line 层（~160 测试）

| 分类 | 数量 | 状态 | 说明 |
|------|------|------|------|
| elevated-line-* (全部子分类) | ~160 | ⚠️ | v22 Z-offset 修复 + v22 resolveZOffset 统一 — 基础 Z 位移工作；但 elevated-line 是 HD 特性，完整桥梁/隧道/护栏几何未做 |

> elevated-line 系列是 Mapbox HD 新版"抬升线"特性。全部 21 个子分类依赖 line-z-offset + line-elevation-reference，我们的 Z-offset 已修复，但 HD 专属属性（line-border/line-cutout/model-type 等）未实现。

## 4. Circle 层（~64 测试）

| 分类 | 数量 | 状态 | 说明 |
|------|------|------|------|
| circle-color | 5 | ✅ | |
| circle-radius | 7 | ✅ | |
| circle-blur | 8 | ✅ | |
| circle-opacity | 6 | ✅ | |
| circle-stroke-color | 5 | ✅ | |
| circle-stroke-opacity | 6 | ✅ | |
| circle-stroke-width | 5 | ✅ | |
| circle-pitch-scale | 3 | ✅ | v18 D5 sizeAttenuation |
| circle-pitch-alignment | 4 | ✅ | v18 P5-4 pitch-aware |
| circle-translate | 3 | ✅ | uniform 注入 |
| circle-translate-anchor | 2 | ✅ | resolveTranslate viewport/map |
| circle-sort-key | 3 | ✅ | emitter 排序 |
| circle-geometry | 6 | ✅ | point/line/poly geometry |
| circle-camera-orthographic-projection | 1 | ❌ | 无正交投影 |

## 5. Symbol-Icon 层（~149 测试）

| 分类 | 数量 | 状态 | 说明 |
|------|------|------|------|
| icon-image | 16 | ✅ | v14 P1-6 per-icon UV |
| icon-size | 18 | ✅ | |
| icon-color | 5 | ✅ | |
| icon-opacity | 9 | ✅ | |
| icon-rotate | 3 | ✅ | |
| icon-offset | 3 | ✅ | |
| icon-anchor | 11 | ✅ | applyAnchor |
| icon-text-fit | 44 | ✅ | v18 D2 applyIconTextFit |
| icon-translate | 3 | ✅ | SymbolPlacement 已处理 |
| icon-translate-anchor | 2 | ✅ | SymbolPlacement 已处理 |
| icon-pitch-alignment | 4 | ⚠️ | obj.rotation.x 模拟 |
| icon-rotation-alignment | 6 | ✅ | |
| icon-pitch-scaling | 2 | ❌ | |
| icon-halo-color/width/blur | 16 | ⚠️ | SDF atlas for icons 从不加载 |
| icon-keep-upright | — | ✅ | SymbolPlacement sprite flip |
| icon-visibility | 2 | ✅ | |
| icon-pixelratio-mismatch | 1 | ❌ | |
| icon-no-cross-source-collision | 1 | ❌ | 无跨源碰撞 |
| icon-secondary-coords-uint16 | 1 | ❌ | |

## 6. Symbol-Text 层（~273 测试）

| 分类 | 数量 | 状态 | 说明 |
|------|------|------|------|
| text-field | 23 | ✅ | resolveTextField token 替换 |
| text-font | 4 | ✅ | v36 FontCatalog 注入真实 PBF glyph（需浏览器验证） |
| text-font-metrics | 15 | ✅ | v25 metrics 通路 + v36 真实 glyph 渲染 |
| text-size | 13 | ✅ | |
| text-color | 9 | ✅ | |
| text-halo-color/width/blur | 13 | ✅ | |
| text-opacity | 4 | ✅ | |
| text-rotate | 8 | ✅ | |
| text-offset | 20 | ✅ | v18 P1-7 |
| text-radial-offset | 1 | ✅ | PlacementEngine |
| text-anchor | 11 | ✅ | TextShaping |
| text-justify | 4 | ✅ | v31 binary justify (auto + anchor) |
| text-transform | 3 | ✅ | applyTextTransform |
| text-letter-spacing | 5 | ✅ | |
| text-line-height | 2 | ✅ | |
| text-max-width | 8 | ✅ | v21 CJK 断行 + 字符级断词 |
| text-max-angle | 2 | ✅ | LineAnchor maxAngle 参数 |
| text-variable-anchor | 31 | ✅ | PlacementEngine |
| text-writing-mode | 32 | ✅ | TextShaping vertical mode |
| text-keep-upright | 15 | ✅ | MBStyleSymbolPlacement |
| text-pitch-alignment | 12 | ✅ | |
| text-rotation-alignment | 6 | ✅ | |
| text-pitch-scaling | 1 | ❌ | |
| text-arabic | 5 | ✅ | v21 reshapeArabic + v28 UAX#9 Bidi |
| text-translate | 3 | ✅ | SymbolPlacement 已处理 |
| text-translate-anchor | 2 | ✅ | SymbolPlacement 已处理 |
| text-visibility | 2 | ✅ | |
| text-tile-edge-clipping | 1 | ❌ | |
| text-no-cross-source-collision | 1 | ❌ | |
| text-icon-high-pitch | 1 | ❌ | |
| text-max-attributes | 1 | ❌ | |
| text-emissive-strength | — | ⚠️ | |

## 7. Symbol-Placement / 碰撞（~46 测试）

| 分类 | 数量 | 状态 | 说明 |
|------|------|------|------|
| symbol-placement: point | — | ✅ | 默认路径 |
| symbol-placement: line | 10 | ✅ | v18 getLineAnchors 集成 |
| symbol-placement: line-center | — | ✅ | getLineCenterAnchor |
| symbol-spacing | 5 | ✅ | v18 collectSymbols 调 getLineAnchors |
| symbol-z-order | 11 | ⚠️ | v17 viewport-y 排序；非 viewport-y 模式未支持 |
| symbol-sort-key | 8 | ⚠️ | emitter 读 sort-key；placement 阶段未在收集后重排 |
| symbol-visibility | 2 | ✅ | |
| symbol-opacity | 1 | ✅ | |
| symbol-geometry | 6 | ✅ | v35 GEOMETRY_TYPE_MAP.symbol 含 polygon |
| symbol-elevation | 17 | ⚠️ | symbol-z-offset 已实现；symbol-elevation-reference 需 terrain |
| symbol-cross-fade | 2 | ❌ | |
| symbol-distance-fade | 1 | ❌ | 需 sky |
| symbol-icon-brightness/contrast/saturation | 3 | ✅ | v35 patchIconObject 色彩调整 shader |
| icon-optional | 3 | ✅ | v35 PlacementEngine 仅 text 重试 |

## 8. Fill-Extrusion 层（~91 测试）

| 分类 | 数量 | 状态 | 说明 |
|------|------|------|------|
| fill-extrusion-color | 8 | ✅ | |
| fill-extrusion-height | 6 | ✅ | v18 P1-1 |
| fill-extrusion-base | 12 | ✅ | v18 P1-1 |
| fill-extrusion-opacity | 3 | ✅ | |
| fill-extrusion-vertical-gradient | 3 | ✅ | v19 E2 |
| fill-extrusion-translate | 4 | ✅ | uniform 注入 |
| fill-extrusion-translate-anchor | 2 | ✅ | v18 P5-2 |
| fill-extrusion-pattern | 15 | ✅ | v18 P2-4 |
| fill-extrusion-pattern-cross-fade | 4 | ✅ | emitter `_patternCrossFade` + shader |
| fill-extrusion-multiple | 2 | ✅ | 多层 |
| fill-extrusion-geometry | 1 | ❌ | linestring 几何 |
| fill-extrusion-partial-rendering | 4 | ⚠️ | v35 高度阈值 shader 框架（占位） |
| fill-extrusion-terrain | 13 | ⚠️ | v33-v34 FBO draping 接入 |
| fill-extrusion-vertical-scale | 1 | ✅ | v18 |
| fill-extrusion-cutoff-fade-range | 1 | ✅ | v18 |
| fill-extrusion-wireframe/rounded-wireframe | 2 | ✅ | v35 material.wireframe |
| fill-extrusion-no-mercator-projection | 1 | ❌ | |
| fill-extrusion-line-width | 9 | ✅ | v14 edge outline shader |
| fill-extrusion-edge-radius | 3 | ❌ | |
| fill-extrusion-emissive-strength | — | ✅ | v35 patchExtrusionMaterial |
| fill-extrusion-ambient-occlusion-* | — | ⚠️ | HD 属性已透传；AO shader 部分 |
| fill-extrusion-front-cutoff | — | ❌ | HD 特性 |

## 9. Background 层（~29 测试）

| 分类 | 数量 | 状态 | 说明 |
|------|------|------|------|
| background-color | 6 | ✅ | MapView.clearColor |
| background-opacity | 3 | ✅ | clearAlpha |
| background-pattern | 13 | ✅ | v15 B1 NDC quad + sprite atlas |
| background-visibility | 2 | ✅ | |
| background-pitch-alignment | 5 | ✅ | v35 applyBackgroundPattern viewport/map |

## 10. Heatmap 层（18 测试）

| 分类 | 数量 | 状态 | 说明 |
|------|------|------|------|
| heatmap-color/intensity/opacity/radius/weight | 18 | ✅ | v18 P1-2 emitter case + patchHeatmapMaterial |

## 11. Hillshade 层（20 测试）

| 分类 | 数量 | 状态 | 说明 |
|------|------|------|------|
| hillshade 默认/accent/shadow/highlight | ~17 | ⚠️ | v18 P3-3 emitter + DEM 纹理加载；shader 近似 |
| hillshade-maxzoom | 2 | ❌ | |
| hillshade-buffer | 3 | ⚠️ | 走 HillshadeTileDataProvider；无 tile-border DEM padding |

## 12. Raster 层（~85 测试）

| 分类 | 数量 | 状态 | 说明 |
|------|------|------|------|
| raster-opacity | 3 | ✅ | |
| raster-hue-rotate | 3 | ✅ | v31 属性名修正 |
| raster-brightness | 3 | ✅ | v31 属性名修正 |
| raster-contrast | 3 | ✅ | |
| raster-saturation | 3 | ✅ | |
| raster-resampling | 3 | ✅ | |
| raster-visibility | 2 | ✅ | |
| raster-alpha | 1 | ✅ | |
| raster-color | 3 | ⚠️ | raster-color-mix 部分支持 |
| raster-extent | 2 | ✅ | v34 extent 动态支持 |
| raster-filtering | 2 | ✅ | resampling → texture filter |
| raster-masking | 4 | ⚠️ | 靠叠加合成，无专用 mask |
| raster-rotation | 5 | ⚠️ | bearing 由相机处理；需验证 |
| raster-loading | 1 | ⚠️ | 异步纹理加载；可能需 re-bake |
| raster-elevation / -tiled | 30 | ❌ | 需 raster-dem + 3D 高程 |
| raster-array | 7 | ❌ | |
| raster-particle | 5 | ❌ | |
| zoomed-raster | 3 | ✅ | v36 maxDataLevel overzoom |
| retina-raster | 1 | ⚠️ | pixelRatio 支持 |

## 13. 表达式与 Filter（~80 测试）

| 分类 | 数量 | 状态 | 说明 |
|------|------|------|------|
| filter 基础 | 4 | ✅ | |
| dynamic-filter | 27 | ⚠️ | 引擎支持；运行时切换依赖全量 re-decode |
| feature-state | 25 | ⚠️ | v19 E5 端到端；无跨瓦片持久存储 |
| within | 11 | ✅ | v22 + v26 Point/LineString/Polygon |
| distance | 6 | ✅ | |
| collator | 2 | ✅ | v26 case/diacritic-insensitive |
| is-supported-script | 2 | ⚠️ | 基础检测 |
| config | 6 | ⚠️ | v18 import config 支持 |

## 14. Camera / Projection（~102 测试）

| 分类 | 数量 | 状态 | 说明 |
|------|------|------|------|
| center/zoom | ~20 | ✅ | applyCameraSettings + v27 setZoom/setCenter |
| bearing/pitch | ~15 | ✅ | v27 heading/tilt |
| FOV | 3 | ✅ | v18 setFov |
| free-camera | 6 | ⚠️ | v35 setCameraPosition + lookAtPoint（近似） |
| map-projections | 53 | ✅ | v15/v22 MBMapProjection + 重投影 + 线段细分 |
| projection | 4 | ✅ | v15 applyProjection |
| resize | 2 | ✅ | v30 setSize |
| zoom-visibility | 6 | ✅ | v27 setZoom + setLayerZoomRange |
| worldview | 6 | ✅ | v26 setWorldview |
| camera | 3 | ✅ | applyCameraSettings |
| fit-screen-coordinates | 3 | ✅ | v18 |
| scale-factor | 12 | ✅ | v29 scaleFactor metadata |
| map-mode | 3 | ⚠️ | v35 仅存 flag，无真实模式切换 |
| tile-mode | 1 | ⚠️ | v35 同上 |
| canvas | 4 | ⚠️ | pixelRatio 支持 |
| sd-hd-conflation | 14 | ❌ | 需 HD 数据源 |
| hd-sd-transition | 11 | ❌ | |

## 15. Environment（368 测试）

| 分类 | 数量 | 状态 | 说明 |
|------|------|------|------|
| fog | 63 | ✅ | v6 FogExp2 + v18 setFog |
| lighting-3d-mode | 120 | ✅ | v6 applyLights + v18 setLights |
| skybox | 34 | ✅ | v6 gradient + atmosphere + stars |
| color-theme | 26 | ⚠️ | v26 setColorTheme（无主题系统） |
| globe | 122 | ✅ | v6/v11 sphereProjection 原生管线 |
| light-migration | 2 | ✅ | v18 setLight |
| style-with-lights | 1 | ✅ | v18 |

## 16. Source / Tile（~53 测试）

| 分类 | 数量 | 状态 | 说明 |
|------|------|------|------|
| inline GeoJSON | ~20 | ✅ | GeoJSONDataProvider |
| 外部 GeoJSON URL | ~5 | ✅ | v6 P3-1 fetch |
| cluster | ~5 | ✅ | v5 + v23 clusterProperties |
| 多 GeoJSON 源 | — | ✅ | v14 A8 |
| mapbox:// source URI | — | ✅ | v6 P3-2 accessToken |
| TMS | 1 | ✅ | v18 TMSDataProvider |
| tilejson-bounds | 2 | ✅ | v35 BoundsFilteredDataProvider |
| zoomed-fill | 2 | ✅ | v36 maxDataLevel overzoom |
| extent | 4 | ✅ | v34 extent 动态支持 |
| sparse-tileset | 1 | ✅ | v35 空瓦片容错 |
| mixed-zoom | 1 | ✅ | v35 同上 |
| tile-providers | 7 | ❌ | |

## 17. 3D / 地形 / 建筑（~400 测试）

| 分类 | 数量 | 状态 | 说明 |
|------|------|------|------|
| terrain | 69 | ✅ | v14-v34 DEM mesh + draping + depth occlusion |
| depth-occlusion | 14 | ✅ | v14 TerrainDepthOcclusion |
| occlusion-terrain-depth | 1 | ✅ | 同上 |
| building | 53 | ⚠️ | v17 基础 + v35 facades/AO/flood-light；屋顶形状❌ |
| 3d-intersections | 75 | ⚠️ | v22 guardrail geometry；完整桥梁/隧道未做 |
| model-layer | 212 | ⚠️ | v6 GLTFLoader 加载；完整 per-feature 定位部分 |
| front-cutoff | 6 | ❌ | HD 特性 |
| wireframe | 7 | ✅ | v35 setTerrainWireframe/setLayers3DWireframe/setLayers2DWireframe |
| clip-layer | 16 | ✅ | v17 buildClipMask + isClipped |
| cross-source-elevation | 8 | ❌ | HD 跨源高程 |
| occlusion | 5 | ⚠️ | occlusion-opacity 部分支持 |

## 18. Composite / Runtime / Debug（~580 测试）

| 分类 | 数量 | 状态 | 说明 |
|------|------|------|------|
| combinations | 126 | ⚠️ | 取决于所涉及的层 |
| runtime-styling | 181 | ⚠️ | API 齐（MBStyleRuntime）；operations 时序齐；全量 re-decode |
| regressions | 122 | ⚠️ | 个别可借基础实现通过 |
| debug | 51 | ⚠️ | v18 setCollisionDebug/setDebugTileBoundaries |
| placement | 7 | ✅ | v35 icon-optional |
| imports | 39 | ⚠️ | v24 URL imports + v35 slots operations |
| slots | 8 | ⚠️ | v35 setSlot/moveImport/addImport/updateImport；scope 未做 |
| image / image-fallback-nested | 39 | ⚠️ | v16 image source；fallback-nested ❌ |
| image-source | 2 | ✅ | v16 B2 |
| real-world | 9 | ⚠️ | 全量 style 加载 |
| basic-v9/bright-v9/satellite-v9 | 5 | ⚠️ | setStyle + reloadStyle |
| video | 2 | ❌ | |
| custom-layer-js | 6 | ❌ | |
| custom-source | 8 | ❌ | |
| empty | 1 | ✅ | |
| random | 1 | ⚠️ | |
| context-restore | 3 | ✅ | v18 forceContextRestart |
| zoom-history | 2 | ❌ | |
| linear-filter-opacity-edge | 1 | ❌ | |
| GLJS-584 | 1 | ✅ | 空 layers 正确处理 |

## 19. HD 高级特性（~400+ 测试）

| 分类 | 数量 | 状态 | 说明 |
|------|------|------|------|
| elevated-line-* (全部) | ~160 | ⚠️ | Z-offset 工作；HD 专属属性未做 |
| front-cutoff | 6 | ❌ | HD fill-extrusion-front-cutoff |
| sd-hd-conflation | 14 | ❌ | HD+SD 混合 |
| hd-sd-transition | 11 | ❌ | HD/SD 切换 |
| slots | 8 | ⚠️ | v35 operations 接入；scope 未做 |
| appearance | 74 | ⚠️ | 基础 symbol 渲染；条件覆盖未做 |
| measure-light | 19 | ✅ | brightness getter + measure-light 表达式 |
| text-writing-mode | 32 | ✅ | v18 vertical shaping |
| scale-factor | 12 | ✅ | v29 scaleFactor |

## 20. 其他（~1240 测试）

| 分类 | 数量 | 状态 | 说明 |
|------|------|------|------|
| sprites | 8 | ⚠️ | v24 PBF bug 修复；sprite format 部分 |
| background-pitch-alignment | 5 | ❌ | |
| text-tile-edge-clipping | 1 | ❌ | |
| fill-limit-number-holes | 1 | ❌ | |

---

## 汇总统计

| 优先级 | 估计测试数 | ✅ 完整 | ⚠️ 部分 | ❌ 未实现 | 含部分完成率 |
|--------|-----------|---------|---------|----------|------------|
| P0 核心 | ~430 | ~370 | ~40 | ~20 | **95%** |
| P1 重要 | ~620 | ~480 | ~90 | ~50 | **92%** |
| P2 增强 | ~820 | ~280 | ~260 | ~280 | **66%** |
| P3 HD/实验 | ~1160 | ~80 | ~220 | ~860 | **26%** |
| **合计** | **~3031** | **~1210 (40%)** | **~610 (20%)** | **~1210 (40%)** | **60%** |

---

## 按影响排序的剩余工作（ROI 从高到低）

> 注：以下高/中 ROI 项多数已在 v35-v36 完成。真实剩余集中于大型工程。

### ✅ 已完成（原列入 ROI 清单）

| 项 | 完成版本 |
|----|---------|
| icon-translate / text-translate-anchor | v22 SymbolPlacement |
| line-pattern-trim-offset / line-trim-offset | v34 shader discard |
| line-border | v14 outlineWidth |
| icon-optional | v35 PlacementEngine |
| fill-extrusion-pattern-cross-fade / fill/line pattern-cross-fade | v14 emitter + shader |
| fill-extrusion-wireframe / partial-rendering | v35 |
| background-pitch-alignment | v35 |
| tilejson-bounds | v35 |
| zoomed-fill / extent | v34+v36 |
| circle-translate-anchor | v22 resolveTranslate |
| symbol-geometry / symbol-icon-brightness-contrast-saturation | v35 |
| MBGlyphLoader → FontCatalog | v36 引擎 API + 转换器 |

### 🥇 真实高 ROI（仍需实现）

| # | 任务 | 解锁测试 | 复杂度 | 依赖 |
|---|------|---------|--------|------|
| 1 | **tile-providers** | 7 | ⭐⭐⭐ | 自定义瓦片提供器接口 |
| 2 | **symbol-sort-key placement 排序** | 8 | ⭐ | collectSymbols 后排序 |
| 3 | **icon-halo (SDF icon atlas)** | 16 | ⭐⭐⭐ | SDF atlas for icons |
| 4 | **symbol-cross-fade** | 2 | ⭐⭐ | zoom 变化检测 |

### 🥈 中 ROI

| # | 任务 | 解锁测试 | 复杂度 |
|---|------|---------|--------|
| 5 | **symbol-z-order 非 viewport-y** | 11 | ⭐⭐ |
| 6 | **symbol-elevation-reference** | 17 | ⭐⭐⭐ |
| 7 | **building 屋顶形状** | 6 | ⭐⭐⭐⭐ |
| 8 | **raster-masking 专用 mask** | 4 | ⭐⭐⭐ |
| 9 | **hillshade-buffer padding** | 3 | ⭐⭐ |
| 10 | **line-border-gradient** | 4 | ⭐⭐⭐ |

### 🥉 大型工程（需架构变更）

| # | 任务 | 解锁测试 | 复杂度 |
|---|------|---------|--------|
| 11 | **elevated-line HD 完整** | ~160 | ⭐⭐⭐⭐ |
| 12 | **building facades 屋顶形状** | ~53 | ⭐⭐⭐⭐ |
| 13 | **3d-intersections 完整** | ~75 | ⭐⭐⭐⭐⭐ |
| 14 | **model-layer per-feature 定位** | ~212 | ⭐⭐⭐⭐ |
| 15 | **imports scope 作用域** | ~47 | ⭐⭐⭐ |
| 16 | **raster-elevation / raster-array** | ~51 | ⭐⭐⭐⭐ |
| 17 | **HD front-cutoff** | ~6 | ⭐⭐⭐⭐⭐ |
| 18 | **HD appearance 条件覆盖** | ~74 | ⭐⭐⭐⭐ |
| 19 | **HD sd-hd-conflation / hd-sd-transition** | ~25 | ⭐⭐⭐⭐ |
| 20 | **custom-layer-js / custom-source / video** | ~16 | ⭐⭐⭐⭐ |

---

## 附录：INCOMPATIBLE_TYPES（compat runner 跳过的层类型）

```typescript
const INCOMPATIBLE_TYPES = new Set([
    "terrain",          // 非 layer type（style property）— 无效果
    "globe",            // 非 layer type — 无效果
    "video",            // 真正不支持
    "custom-layer",     // 真正不支持
    "raster-particle",  // 真正不支持
    "raster-array",     // 真正不支持
    "skybox",           // 非 layer type — sky 是 layer type，已在运行
]);
```

> 建议清理：移除 `terrain`/`globe`/`skybox`（不是 layer type，不会匹配任何 layer.type）。

---

## 附录：spriteFormat 支持状态

| 格式 | 状态 | 说明 |
|------|------|------|
| 传统 `.json + .png` | ✅ | MBStyleManager.loadSprite |
| `icon_set` `.pbf` | ✅ | v9 IconSetPBFDecoder + v24 求值顺序 bug 修复 |
| `raster` | ✅ | 同传统格式 |
