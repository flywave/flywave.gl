# Render-Tests 移植 TODO 文档

基于 mapbox-gl-js `test/integration/render-tests/` 全量分析（~3077 个测试用例），按功能领域分类整理。

---

## 优先级分类

- **P0（必须）**: 核心渲染功能，大量测试依赖
- **P1（重要）**: 高频使用的 Mapbox 特性
- **P2（增强）**: 高级特性，非核心路径
- **P3（后续）**: 平台特有/实验性特性

---

## 1. Fill 层（59 测试）

| 属性 | 测试数 | 实现状态 | 优先级 | 说明 |
|------|--------|---------|--------|------|
| `fill-color` | 8 | ✅ 已实现 | P0 | literal/function/property-function |
| `fill-opacity` | 9 | ✅ 已实现 | P0 | literal/function/data-driven |
| `fill-pattern` | 15 | ⚠️ 材质有 API，未接入 sprite | P1 | literal/@2x/color-theme/zoomed |
| `fill-pattern-cross-fade` | 4 | ❌ 未实现 | P2 | pattern 插值过渡 |
| `fill-outline-color` | 8 | ✅ 已实现 | P0 | EdgesGeometry |
| `fill-translate` | 3 | ✅ 已实现 | P1 | uniform 偏移 |
| `fill-translate-anchor` | 2 | ❌ 未实现 | P2 | map/viewport 锚点 |
| `fill-antialias` | 1 | ✅ 已实现 | P1 | polygonOffset |
| `fill-sort-key` | 2 | ✅ 已实现 | P1 | renderOrder |
| `fill-visibility` | 2 | ✅ 已实现 | P0 | visibility:none |
| `fill-z-offset` | 4 | ✅ 已实现 | P2 | 顶点 z 偏移 |
| `fill-limit-number-holes` | 1 | ❌ 未实现 | P3 | 孔数量限制 |

**数据源**: inline GeoJSON (大部分) + local MVT (projected/zoomed/color-theme)

---

## 2. Line 层（194 测试）

| 属性 | 测试数 | 实现状态 | 优先级 | 说明 |
|------|--------|---------|--------|------|
| `line-color` | 5 | ✅ 已实现 | P0 | |
| `line-width` | 18 | ✅ 已实现 | P0 | 三角化线 |
| `line-width-unit` | 6 | ❌ 未实现 | P2 | meters vs pixels |
| `line-dasharray` | 30 | ✅ 已实现 | P0 | dashSize/gapSize |
| `line-blur` | 5 | ✅ 已实现 | P1 | shader patch |
| `line-opacity` | 7 | ✅ 已实现 | P0 | |
| `line-gradient` | 14 | ✅ 已实现 | P1 | 256×1 DataTexture |
| `line-gap-width` | 5 | ✅ 已实现 | P1 | secondaryWidth |
| `line-offset` | 5 | ✅ 已实现 | P1 | |
| `line-pattern` | 20 | ⚠️ 材质有 API，未接入 sprite | P1 | literal/@2x/runtime |
| `line-pattern-trim-offset` | 18 | ❌ 未实现 | P2 | pattern + trim |
| `line-pattern-cross-fade` | 5 | ❌ 未实现 | P2 | |
| `line-cap` | 4 | ✅ 已实现 | P0 | butt/round/square |
| `line-join` | 11 | ✅ 已实现 | P0 | miter/bevel/round |
| `line-translate` | 4 | ✅ 已实现 | P1 | |
| `line-translate-anchor` | 3 | ❌ 未实现 | P2 | |
| `line-trim-offset` | 18 | ✅ 已实现 | P2 | drawRangeStart/End |
| `line-triangulation` | 2 | ✅ 已实现 | P1 | createLineGeometry |
| `line-pitch` | 5 | ❌ 未实现 | P2 | 俯仰角渲染 |
| `line-sort-key` | 2 | ✅ 已实现 | P1 | |
| `line-visibility` | 2 | ✅ 已实现 | P0 | |
| `line-border` | 13 | ⚠️ outlineWidth 基础有 | P1 | border-width/color |
| `line-border-gradient` | 4 | ❌ 未实现 | P2 | |
| `line-blend-mode` | 6 | ❌ 未实现 | P2 | additive/multiply |
| `line-emissive-strength` | 3 | ✅ 已实现 | P2 | |

**数据源**: local MVT (road layer, 大部分) + inline GeoJSON (lineMetrics)

---

## 3. Circle 层（64 测试）

| 属性 | 测试数 | 实现状态 | 优先级 | 说明 |
|------|--------|---------|--------|------|
| `circle-color` | 5 | ✅ 已实现 | P0 | |
| `circle-radius` | 7 | ✅ 已实现 | P0 | |
| `circle-blur` | 8 | ✅ 已实现 | P0 | |
| `circle-opacity` | 6 | ✅ 已实现 | P0 | |
| `circle-stroke-color` | 5 | ✅ 已实现 | P0 | |
| `circle-stroke-opacity` | 6 | ✅ 已实现 | P0 | |
| `circle-stroke-width` | 5 | ✅ 已实现 | P0 | |
| `circle-pitch-scale` | 3 | ✅ 已实现 | P1 | sizeAttenuation |
| `circle-pitch-alignment` | 4 | ✅ 已实现 | P1 | |
| `circle-translate` | 3 | ✅ 已实现 | P1 | |
| `circle-translate-anchor` | 2 | ❌ 未实现 | P2 | |
| `circle-sort-key` | 3 | ✅ 已实现 | P1 | |
| `circle-geometry` | 6 | ✅ 已实现 | P1 | point/line/poly geometry |
| `circle-camera-orthographic` | 1 | ❌ 未实现 | P3 | 正交投影 |

**数据源**: inline GeoJSON points (全部)

---

## 4. Fill-Extrusion 层（91 测试）

| 属性 | 测试数 | 实现状态 | 优先级 | 说明 |
|------|--------|---------|--------|------|
| `fill-extrusion-base` | 12 | ✅ 已实现 | P1 | floorHeight |
| `fill-extrusion-color` | 8 | ✅ 已实现 | P0 | |
| `fill-extrusion-height` | 6 | ✅ 已实现 | P0 | |
| `fill-extrusion-line-width` | 9 | ❌ 未实现 | P2 | 线宽挤出 |
| `fill-extrusion-opacity` | 3 | ✅ 已实现 | P0 | |
| `fill-extrusion-pattern` | 15 | ⚠️ 材质有 API，未接入 | P1 | |
| `fill-extrusion-pattern-cross-fade` | 4 | ❌ 未实现 | P2 | |
| `fill-extrusion-translate` | 4 | ✅ 已实现 | P1 | |
| `fill-extrusion-translate-anchor` | 2 | ❌ 未实现 | P2 | |
| `fill-extrusion-vertical-gradient` | 3 | ✅ 已实现 | P1 | shader patch |
| `fill-extrusion-vertical-scale` | 1 | ❌ 未实现 | P3 | |
| `fill-extrusion-partial-rendering` | 4 | ❌ 未实现 | P2 | |
| `fill-extrusion-terrain` | 13 | ❌ 未实现 | P2 | 需 terrain 支持 |
| `fill-extrusion-multiple` | 2 | ✅ 已实现 | P1 | |
| `fill-extrusion-geometry` | 1 | ❌ 未实现 | P3 | linestring 几何 |
| `fill-extrusion-wireframe` | 1 | ❌ 未实现 | P3 | |
| `fill-extrusion-rounded-wireframe` | 1 | ❌ 未实现 | P3 | |
| `fill-extrusion-edge-radius` | 1 | ❌ 未实现 | P3 | |
| `fill-extrusion-cutoff-fade-range` | 1 | ❌ 未实现 | P3 | |
| `fill-extrusion-no-mercator` | 1 | ❌ 未实现 | P3 | |

**数据源**: inline GeoJSON polygons + local MVT + raster-DEM (terrain)

---

## 5. Background 层（29 测试）

| 属性 | 测试数 | 实现状态 | 优先级 | 说明 |
|------|--------|---------|--------|------|
| `background-color` | 6 | ✅ 已实现 | P0 | MapView.clearColor |
| `background-opacity` | 3 | ✅ 已实现 | P0 | clearAlpha |
| `background-pattern` | 13 | ⚠️ 材质有 API，未接入 sprite | P1 | |
| `background-visibility` | 2 | ✅ 已实现 | P0 | |
| `background-pitch-alignment` | 5 | ❌ 未实现 | P2 | globe/mercator |

**数据源**: empty sources + sprite

---

## 6. Symbol-Icon 层（149 测试）

| 属性 | 测试数 | 实现状态 | 优先级 | 说明 |
|------|--------|---------|--------|------|
| `icon-image` | 16 | ✅ 已实现 | P0 | MapIconMaterial + SpriteAtlas |
| `icon-size` | 18 | ✅ 已实现 | P0 | iconScale |
| `icon-color` | 7 | ✅ 已实现 | P0 | |
| `icon-opacity` | 9 | ✅ 已实现 | P0 | |
| `icon-rotate` | 3 | ✅ 已实现 | P1 | material.rotation |
| `icon-offset` | 3 | ✅ 已实现 | P1 | sprite position |
| `icon-anchor` | 11 | ✅ 已实现 | P1 | sprite.center |
| `icon-text-fit` | 44 | ❌ 未实现 | P1 | 需文本包围盒计算 |
| `icon-translate` | 3 | ✅ 已实现 | P1 | |
| `icon-translate-anchor` | 2 | ❌ 未实现 | P2 | |
| `icon-pitch-alignment` | 4 | ❌ 未实现 | P2 | |
| `icon-rotation-alignment` | 6 | ❌ 未实现 | P1 | map/viewport |
| `icon-pitch-scaling` | 2 | ❌ 未实现 | P2 | |
| `icon-halo-color` | 7 | ❌ 未实现 | P2 | SDF icon halo |
| `icon-halo-blur` | 5 | ❌ 未实现 | P2 | |
| `icon-halo-width` | 4 | ❌ 未实现 | P2 | |
| `icon-visibility` | 2 | ✅ 已实现 | P0 | |
| `icon-pixelratio-mismatch` | 1 | ❌ 未实现 | P3 | |
| `icon-no-cross-source-collision` | 1 | ❌ 未实现 | P2 | |

**数据源**: inline GeoJSON points + sprite (local://sprites/sprite)

---

## 7. Symbol-Text 层（273 测试）

| 属性 | 测试数 | 实现状态 | 优先级 | 说明 |
|------|--------|---------|--------|------|
| `text-field` | 23 | ⚠️ SDF 材质有，未接入 shaping | P0 | 文本内容/token/format |
| `text-font` | 4 | ⚠️ MBGlyphLoader 基础有 | P0 | 字体选择 |
| `text-font-metrics` | 15 | ❌ 未实现 | P1 | baseline/vertical shaping |
| `text-size` | 13 | ✅ 已实现 | P0 | |
| `text-color` | 9 | ✅ 已实现 | P0 | |
| `text-halo-color` | 5 | ✅ 已实现 | P0 | SDF halo |
| `text-halo-blur` | 4 | ✅ 已实现 | P0 | |
| `text-halo-width` | 4 | ✅ 已实现 | P0 | |
| `text-opacity` | 4 | ✅ 已实现 | P0 | |
| `text-rotate` | 8 | ✅ 已实现 | P1 | |
| `text-offset` | 20 | ✅ 已实现 | P1 | |
| `text-radial-offset` | 1 | ❌ 未实现 | P2 | |
| `text-anchor` | 11 | ✅ 已实现 | P0 | 9 锚点 |
| `text-justify` | 4 | ❌ 未实现 | P1 | left/center/right |
| `text-transform` | 3 | ❌ 未实现 | P0 | uppercase/lowercase |
| `text-letter-spacing` | 5 | ❌ 未实现 | P1 | |
| `text-line-height` | 2 | ❌ 未实现 | P1 | |
| `text-max-width` | 8 | ❌ 未实现 | P1 | 断行 |
| `text-max-angle` | 2 | ❌ 未实现 | P2 | line placement |
| `text-max-attributes` | 1 | ❌ 未实现 | P3 | |
| `text-variable-anchor` | 31 | ❌ 未实现 | P1 | 多锚点 |
| `text-writing-mode` | 32 | ❌ 未实现 | P2 | horizontal/vertical |
| `text-keep-upright` | 15 | ❌ 未实现 | P1 | |
| `text-pitch-alignment` | 12 | ❌ 未实现 | P1 | |
| `text-rotation-alignment` | 6 | ❌ 未实现 | P1 | |
| `text-pitch-scaling` | 1 | ❌ 未实现 | P2 | |
| `text-arabic` | 5 | ❌ 未实现 | P2 | Arabic shaping |
| `text-translate` | 3 | ✅ 已实现 | P1 | |
| `text-translate-anchor` | 2 | ❌ 未实现 | P2 | |
| `text-visibility` | 2 | ✅ 已实现 | P0 | |
| `text-tile-edge-clipping` | 1 | ❌ 未实现 | P2 | |
| `text-no-cross-source-collision` | 1 | ❌ 未实现 | P2 | |

**数据源**: inline GeoJSON points + glyphs (local://glyphs/{fontstack}/{range}.pbf)

### Text Shaping 子系统

| 功能 | 实现状态 | 优先级 |
|------|---------|--------|
| 文本断行 (max-width) | ❌ | P0 |
| 对齐 (justify) | ❌ | P0 |
| 大小写转换 (transform) | ❌ | P0 |
| 字间距 (letter-spacing) | ❌ | P1 |
| 行高 (line-height) | ❌ | P1 |
| Token 替换 ({name}) | ❌ | P0 |
| Format 表达式 | ❌ | P1 |
| 多行布局 | ❌ | P1 |
| CJK 断行 | ❌ | P2 |
| Arabic shaping | ❌ | P2 |
| Vertical writing mode | ❌ | P2 |

---

## 8. Symbol-Placement 层（46 测试）

| 属性 | 测试数 | 实现状态 | 优先级 | 说明 |
|------|--------|---------|--------|------|
| `symbol-placement` | 10 | ❌ 未实现 | P0 | point/line/line-center |
| `symbol-spacing` | 5 | ❌ 未实现 | P1 | 沿线间距 |
| `symbol-z-order` | 11 | ❌ 未实现 | P1 | auto/viewport-y/source |
| `symbol-sort-key` | 8 | ✅ 已实现 | P1 | renderOrder |
| `symbol-visibility` | 2 | ✅ 已实现 | P0 | |
| `symbol-opacity` | 1 | ✅ 已实现 | P1 | |
| `symbol-geometry` | 6 | ❌ 未实现 | P2 | geometry type |
| `icon-optional` | 3 | ❌ 未实现 | P1 | icon/text 互斥 |

**数据源**: local MVT (poi_label/road_label) + sprite + glyphs

### 碰撞检测子系统

| 功能 | 实现状态 | 优先级 |
|------|---------|--------|
| CollisionIndex 空间网格 | ✅ 已实现 | P0 |
| PlacementEngine 布局 | ✅ 基础有 | P0 |
| icon/text 联合放置 | ❌ | P0 |
| opacity 渐变过渡 | ❌ | P1 |
| 跨瓦片符号一致性 | ❌ | P1 |
| 沿线标注放置 | ❌ | P1 |

---

## 9. 表达式（80 测试）

| 功能 | 测试数 | 实现状态 | 优先级 |
|------|--------|---------|--------|
| 基础 filter | 4 | ✅ 已实现 | P0 |
| 动态 filter 切换 | 27 | ⚠️ 表达式引擎有，运行时切换未实现 | P1 |
| feature-state | 25 | ⚠️ 表达式引擎有，feature-state 未接入 | P1 |
| within | 11 | ❌ 未实现 | P2 |
| collator | 2 | ❌ 未实现 | P3 |
| is-supported-script | 2 | ❌ 未实现 | P3 |
| distance | 6 | ❌ 未实现 | P2 |

---

## 10. Heatmap 层（18 测试）

| 属性 | 测试数 | 实现状态 | 优先级 |
|------|--------|---------|--------|
| `heatmap-color` | 2 | ✅ 已实现 | P1 |
| `heatmap-intensity` | 3 | ✅ 已实现 | P1 |
| `heatmap-opacity` | 3 | ✅ 已实现 | P1 |
| `heatmap-radius` | 7 | ✅ 已实现 | P1 |
| `heatmap-weight` | 3 | ✅ 已实现 | P1 |

**数据源**: local MVT (poi_label)

---

## 11. Hillshade 层（20 测试）

| 属性 | 测试数 | 实现状态 | 优先级 |
|------|--------|---------|--------|
| `hillshade` 默认 | 2 | ✅ 已实现 | P2 |
| `hillshade-accent-color` | 5 | ✅ 已实现 | P2 |
| `hillshade-shadow-color` | 4 | ✅ 已实现 | P2 |
| `hillshade-highlight-color` | 4 | ✅ 已实现 | P2 |
| `hillshade-maxzoom` | 2 | ❌ 未实现 | P3 |
| `hillshade-buffer` | 3 | ❌ 未实现 | P3 |

**数据源**: raster-DEM (local://tiles/{z}-{x}-{y}.terrain.png)

---

## 12. Raster 层（85 测试）

| 属性 | 测试数 | 实现状态 | 优先级 |
|------|--------|---------|--------|
| 全部 raster-* | 85 | ❌ 未实现 | P2 |

**数据源**: raster tiles (satellite.png, alpha.png), image sources, raster-array

**备注**: Raster 层需要独立的栅格瓦片 datasource，目前完全未实现。

---

## 13. GeoJSON Source（30 测试）

| 功能 | 测试数 | 实现状态 | 优先级 |
|------|--------|---------|--------|
| 内联 GeoJSON | ~20 | ✅ 已实现 | P0 |
| 外部 GeoJSON URL | ~5 | ❌ 未实现 | P1 |
| 聚类 (cluster) | ~5 | ❌ 未实现 | P2 |

---

## 14. Tile/Source（23 测试）

| 功能 | 测试数 | 实现状态 | 优先级 |
|------|--------|---------|--------|
| tilejson-bounds | 2 | ❌ | P2 |
| TMS | 1 | ❌ | P2 |
| zoomed-fill | 2 | ❌ | P2 |
| extent | 4 | ❌ | P2 |
| sparse-tileset | 1 | ❌ | P2 |
| mixed-zoom | 1 | ❌ | P2 |

---

## 15. Camera/Projection（102 测试）

| 功能 | 测试数 | 实现状态 | 优先级 |
|------|--------|---------|--------|
| center/zoom | ~20 | ✅ 已实现 | P0 |
| bearing/pitch | ~15 | ✅ 已实现 | P0 |
| FOV | 3 | ❌ | P2 |
| free-camera | 8 | ❌ | P2 |
| map-projections | 53 | ❌ | P2 |
| resize | 2 | ❌ | P2 |
| zoom-visibility | 6 | ✅ 已实现 | P0 |
| worldview | 6 | ❌ | P2 |

---

## 16. Environment（368 测试）

| 功能 | 测试数 | 实现状态 | 优先级 |
|------|--------|---------|--------|
| fog | 63 | ❌ | P2 |
| lighting-3d-mode | 120 | ❌ | P2 |
| skybox | 34 | ❌ | P2 |
| color-theme | 26 | ❌ | P3 |
| globe | 122 | ❌ | P3 |
| light-migration | 2 | ❌ | P3 |

---

## 17. Composite/Cross-feature（396 测试）

| 功能 | 测试数 | 实现状态 | 优先级 |
|------|--------|---------|--------|
| combinations | 126 | ⚠️ 部分 | P1 |
| runtime-styling | 181 | ❌ | P1 |
| depth-occlusion | 14 | ❌ | P2 |
| hd-sd-transition | 11 | ❌ | P3 |
| regressions | 122 | ❌ | P2 |

---

## 18. Custom/Other（~1200 测试）

| 功能 | 测试数 | 实现状态 | 优先级 |
|------|--------|---------|--------|
| 3d-intersections | 75 | ❌ | P3 |
| appearance | 48 | ❌ | P2 |
| building facades | 53 | ❌ | P3 |
| clip-layer | 16 | ❌ | P3 |
| custom-layer-js | 6 | ❌ | P3 |
| custom-source | 8 | ❌ | P3 |
| debug overlays | 51 | ❌ | P3 |
| elevated-line-* | ~160 | ❌ | P2 |
| image source | 20 | ❌ | P2 |
| image-fallback | 12 | ❌ | P2 |
| imports/slots | 47 | ❌ | P2 |
| measure-light | 19 | ❌ | P3 |
| model-layer | 212 | ❌ | P3 |
| terrain | 69 | ❌ | P2 |
| video | 2 | ❌ | P3 |
| wireframe | 7 | ❌ | P3 |
| real-world | 9 | ❌ | P2 |
| basic-v9/bright-v9 | 4 | ❌ | P2 |

---

## 汇总统计

| 优先级 | 测试数 | 已实现 | 部分实现 | 未实现 |
|--------|--------|--------|---------|--------|
| **P0** | ~450 | ~250 (56%) | ~50 (11%) | ~150 (33%) |
| **P1** | ~600 | ~200 (33%) | ~50 (8%) | ~350 (59%) |
| **P2** | ~800 | ~50 (6%) | ~20 (3%) | ~730 (91%) |
| **P3** | ~1227 | ~0 (0%) | ~0 (0%) | ~1227 (100%) |
| **合计** | ~3077 | ~500 (16%) | ~120 (4%) | ~2457 (80%) |

---

## P0 待实现关键项（按影响排序）

1. **Text Shaping** — 断行/对齐/transform/token 替换 → 影响 273 个 text 测试
2. **Sprite 纹理接入** — fill-pattern/line-pattern/background-pattern → 影响 ~50 个测试
3. **Symbol-Placement: point** — 碰撞检测完整集成 → 影响 46 个测试
4. **icon-rotation-alignment** — map/viewport 旋转对齐 → 影响 6 个测试
5. **text-rotation-alignment / text-pitch-alignment** → 影响 18 个测试
6. **External GeoJSON URL** — `local://data/*.geojson` 加载 → 影响 ~5 个测试
7. **translate-anchor** — map/viewport 偏移锚点 → 影响 ~10 个测试

---

## P1 待实现关键项

1. **icon-text-fit** — 44 个测试，最大单项
2. **text-variable-anchor** — 31 个测试
3. **runtime-styling** — 运行时属性变更 → 181 个测试
4. **line-pattern 接入 sprite** — 20 个测试
5. **feature-state 运行时** — 25 个测试
6. **碰撞检测 opacity 渐变** — 标注淡入淡出
7. **combinations** — 层间渲染顺序验证 → 126 个测试
