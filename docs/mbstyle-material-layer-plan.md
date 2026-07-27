# Mapbox Style 材质兼容层 — 分析及实现计划

## 1. 概述

目标是基于 Three.js 实现一套材质/着色器系统，使 flywave.gl 的渲染效果与 mapbox-gl-js 对齐。核心思路是：

- **不复用** flywave 现有的 `StyleSetEvaluator`/`Technique` 体系
- **复用** flywave 已有的 Three.js 材质工具（`SolidLineMaterial`、`MapMeshBasicMaterial`、`CirclePointsMaterial` 等）
- **扩展** 已有材质以覆盖 Mapbox paint 属性的完整语义
- **新增** 缺失的材质/着色器（线条渐变、图案填充、标注渲染/碰撞检测等）

---

## 2. 现有资产盘点

### 2.1 flywave 已有且可直接/小幅扩展复用的材质

| 材质 | 可覆盖的 Mapbox 属性 | 需要扩展的地方 |
|------|----------------------|--------------|
| `SolidLineMaterial` | `line-color`, `line-opacity`, `line-width`, `line-dasharray`, `line-cap`, `line-join`, `line-offset`, `line-outline` (部分) | 缺少 `line-blur`、`line-gradient`、`line-pattern`、`line-gap-width`、`line-border-*`、`line-trim-offset` |
| `MapMeshBasicMaterial` | `fill-color`, `fill-opacity`, `fill-antialias` | 缺少 `fill-pattern`、`fill-outline-color`、`fill-z-offset` |
| `MapMeshStandardMaterial` | `fill-extrusion-color`, `fill-extrusion-opacity` | 缺少 `fill-extrusion-vertical-gradient`、AO、flood light、`fill-extrusion-pattern` |
| `CirclePointsMaterial` | `circle-color`, `circle-opacity`, `circle-radius` | 缺少 `circle-stroke-color/width`、`circle-blur`、`circle-pitch-scale` |
| `IconMaterial` | `icon-image`, `icon-opacity`, `icon-color`（基础） | 需要支持 sprite 图集 UV 映射 |
| `EdgeMaterial` | `fill-outline-color`（基础） | 需要接入 fill 渲染管线 |

### 2.2 需要全新建造的渲染子系统

| 子系统 | 对应 Mapbox Layer | 复杂度 | 说明 |
|--------|------------------|--------|------|
| 线条三角化渲染器 | line (宽线/dash/gradient/pattern) | ⭐⭐⭐ | 参照 mapbox-gl-js `LineBucket` 的三角化 |
| 符号碰撞检测与布局 | symbol | ⭐⭐⭐⭐⭐ | `CollisionIndex`、`Placement`、`Shaping` |
| SDF 文本渲染 | symbol (text) | ⭐⭐⭐⭐ | 基于 glyph atlas 的 SDF 渲染 |
| Sprite 图标渲染 | symbol (icon) | ⭐⭐ | UV 映射、text-fit、旋转对齐 |
| 图案填充渲染 | fill-pattern, line-pattern, background-pattern | ⭐⭐⭐ | 瓦片对齐的纹理采样 |
| 热力图渲染 | heatmap | ⭐⭐⭐⭐ | GPU 密度累积 + 颜色映射 |
| 山体阴影渲染 | hillshade | ⭐⭐ | DEM 法线 + 光照计算 |

### 2.3 mapbox-gl-js 可参考的实现

| 模块 | 路径 | 参考价值 |
|------|------|---------|
| `LineBucket` 三角化 | `src/data/bucket/line_bucket.ts` | 400+ 行线三角化算法 |
| `CollisionIndex` | `src/symbol/collision_index.ts` | 空间网格碰撞检测 |
| `Placement` | `src/symbol/placement.ts` | 标注布局引擎 |
| `shaping.ts` | `src/symbol/shaping.ts` | 文字断行/排版 |
| `draw_line.fragment.glsl` | `src/shaders/line.fragment.glsl`（311 行） | dash/gradient/blur 片段着色器 |
| `draw_line.vertex.glsl` | `src/shaders/line.vertex.glsl`（503 行） | 三角化线顶点着色器 |
| `draw_fill_extrusion.vertex.glsl` | `src/shaders/fill_extrusion.vertex.glsl`（355 行） | AO / 垂直渐变 / flood light |
| `draw_symbol.*.glsl` | `src/shaders/symbol.*.glsl` | SDF 文本 + 纹理图标 |
| `glyph_manager.ts` | `src/render/glyph_manager.ts` | PBF 字体 + TinySDF 回退 |

---

## 3. Paint 属性 → Three.js 材质映射分析

### 3.1 Fill

| Mapbox paint | 当前方案 | 目标方案 | Three.js 实现方式 |
|-------------|---------|---------|------------------|
| `fill-color` | `MapMeshBasicMaterial.color` | 不变 | ✅ 已有 |
| `fill-opacity` | `material.opacity` | 不变 | ✅ 已有 |
| `fill-antialias` | 无 | 片段着色器边缘检测 | `MapMeshBasicMaterial` 扩展 `onBeforeCompile` |
| `fill-outline-color` | 无 | `EdgesGeometry` + `LineBasicMaterial` | ✅ `EdgeMaterial` 已有，需接入 |
| `fill-pattern` | 无 | 纹理采样 + 瓦片对齐 (vec2 patternCoord) | 新增 `MapPatternFillMaterial` |
| `fill-translate` | 无 | `material.translate` 或几何偏移 | 简单 uniform |
| `fill-emissive-strength` | 无 | `material.emissiveIntensity` | ✅ 已有 |
| `fill-z-offset` | 无 | 顶点 z 偏移 | 复用 `ExtrusionFeature` 或新增 uniform |
| `fill-sort-key` | `renderOrder` | 不变 | 逻辑层处理 |

### 3.2 Line

| Mapbox paint | 当前方案 | 目标方案 | Three.js 实现方式 |
|-------------|---------|---------|------------------|
| `line-color` | `SolidLineMaterial.color` | 不变 | ✅ 已有 |
| `line-opacity` | `material.opacity` | 不变 | ✅ 已有 |
| `line-width` | `lineWidth` (metric) | 不变 | ✅ 已有（需确保像素-世界坐标换算） |
| `line-gap-width` | 无 | `secondaryWidth` | `SolidLineMaterial` 已有 `secondaryWidth` |
| `line-offset` | `offset` | 不变 | ✅ 已有 |
| `line-blur` | 无 | 片段着色器 fwidth 模糊 | 扩展 `SolidLineMaterial` fragment |
| `line-dasharray` | `dashSize`/`gapSize` | 不变 | ✅ 已有（需验证 dash 模式对应） |
| `line-pattern` | 无 | 纹理采样沿 UV.x | 扩展 `SolidLineMaterial` |
| `line-gradient` | 无 | 线性插值沿线段 | 新增 `LineGradientFeature` mixin |
| `line-cap` | `caps` | 不变 | ✅ 已有 |
| `line-join` | 几何层处理 | 不变 | ✅ `SolidLineMesh` 在几何构建时处理 |
| `line-translate` | 无 | `translate` uniform | 新增 |
| `line-border-width` | `outlineWidth` | 不变 | ✅ 已有 |
| `line-border-color` | `outlineColor` | 不变 | ✅ 已有 |
| `line-trim-offset` | `drawRangeStart/End` | 不变 | ✅ 已有 |
| `line-miter-limit` | 几何层处理 | 不变 | 几何构建时处理 |
| `line-round-limit` | 几何层处理 | 不变 | 几何构建时处理 |
| `line-emissive-strength` | 无 | emissive uniform | 新增 |

### 3.3 Circle

| Mapbox paint | 当前方案 | 目标方案 | Three.js 实现方式 |
|-------------|---------|---------|------------------|
| `circle-color` | `CirclePointsMaterial.color` | 不变 | ✅ 已有 |
| `circle-opacity` | `material.opacity` | 不变 | ✅ 已有 |
| `circle-radius` | `size` (pixels) | 不变 | ✅ 已有 |
| `circle-blur` | 无 | 片段着色器模糊函数 | 新增 `MapCircleMaterial` (继承 PointsMaterial) |
| `circle-stroke-width` | 无 | 片段着色器环形渲染 | 新增，gl_PointCoord 距离判断 |
| `circle-stroke-color` | 无 | 同上 | 同上 |
| `circle-stroke-opacity` | 无 | 同上 | 同上 |
| `circle-translate` | 无 | uniform 偏移 | 新增 |
| `circle-pitch-scale` | 无 | `sizeAttenuation` 控制 | 动态切换 |
| `circle-pitch-alignment` | 无 | `rotation` 对齐 | 新增 |
| `circle-sort-key` | `renderOrder` | 不变 | 逻辑层处理 |

### 3.4 Fill-Extrusion

| Mapbox paint | 当前方案 | 目标方案 | Three.js 实现方式 |
|-------------|---------|---------|------------------|
| `fill-extrusion-color` | `MapMeshStandardMaterial.color` | 不变 | ✅ 已有 |
| `fill-extrusion-opacity` | `material.opacity` | 不变 | ✅ 已有 |
| `fill-extrusion-height` | `extrusionAxis` + `extrusionRatio` | 不变 | ✅ 已有 |
| `fill-extrusion-base` | `floorHeight` | 不变 | ✅ 已有 |
| `fill-extrusion-vertical-gradient` | 无 | 顶点 y 坐标 → 颜色暗化 | 扩展 `ExtrusionFeature` 或新增 uniform |
| `fill-extrusion-translate` | 无 | uniform 偏移 | 新增 |
| `fill-extrusion-pattern` | 无 | 纹理采样 (roof + wall) | 新增 |
| AO (ambient occlusion) | 无 | `h_floors * y_shade` 约算 | 扩展 fragment shader |
| Flood light | 无 | 定向光照 + 半径衰减 | 扩展 fragment shader |

### 3.5 Background

| Mapbox paint | 当前方案 | Three.js 实现方式 |
|-------------|---------|------------------|
| `background-color` | `MapMeshBasicMaterial.color` | ✅ 已有 |
| `background-opacity` | `material.opacity` | ✅ 已有 |
| `background-pattern` | 无 | 新增 `MapPatternFillMaterial` |

### 3.6 Symbol (Icon + Text)

这是最复杂的子系统，需要独立的渲染引擎：

**Icon**:
| 属性 | 实现方式 |
|------|---------|
| `icon-image` | `SpriteMaterial.map` + UV 来自 sprite JSON |
| `icon-size` | `material.scale` |
| `icon-color` | `material.color` 混合 |
| `icon-opacity` | `material.opacity` |
| `icon-rotate` | `material.rotation` |
| `icon-offset` | 位置偏移 |
| `icon-allow-overlap` | 碰撞检测系统控制 |
| `icon-ignore-placement` | 碰撞检测系统控制 |
| `icon-optional` | 碰撞检测系统控制 |
| `icon-text-fit` | UV 缩放 + 位置调整 |
| `icon-padding` | 碰撞框扩大 |
| `icon-anchor` | 锚点偏移 |
| `icon-rotation-alignment` | 旋转对齐方式 |

**Text (SDF)**:
| 属性 | 实现方式 |
|------|---------|
| `text-field` | 文本内容（表达式求值） |
| `text-font` | 字体索引（pbf glyph 或 TinySDF） |
| `text-size` | `material.size` 或 quad 缩放 |
| `text-color` | SDF 着色器 uniform |
| `text-halo-color` | SDF 着色器 halo uniform |
| `text-halo-width` | SDF 着色器 halo 宽度 |
| `text-halo-blur` | SDF 着色器 halo 模糊 |
| `text-opacity` | 透明度 |
| `text-rotate` | 旋转 |
| `text-offset` | 偏移 |
| `text-anchor` | 锚点 |
| `text-max-width` | 断行宽度 |
| `text-line-height` | 行高 |
| `text-letter-spacing` | 字间距 |
| `text-justify` | 对齐方式 |
| `text-transform` | 大小写转换（CPU 侧） |
| `text-allow-overlap` | 碰撞检测 |
| `text-variable-anchor` | 多锚点自动选择 |

---

## 4. 分阶段实现计划

### Phase 1: 核心材质扩展（Week 1-3）

**目标**：基于 flywave 已有材质扩展，使 fill/line/background/circle/fill-extrusion 基础渲染对齐。

#### 1.1 `FillMaterial`（复用 `MapMeshBasicMaterial` + 扩展）

```
扩展内容：
├── fill-outline-color ──→ `EdgesGeometry` + `LineBasicMaterial`
│     使用 EdgeMaterial（已有），通过 outlineColor uniform 控制
│
├── fill-antialias ──────→ 在 onBeforeCompile 中插入边缘平滑
│     原理：片段着色器中 distance to edge → smoothstep
│
├── fill-pattern ────────→ 新增 MapPatternFillMaterial
│     继承 MapMeshBasicMaterial
│     新增 uniform: u_image (sampler2D), u_pattern_tl/br (vec2)
│     顶点属性: a_pattern_data (纹理 UV)
│     片段: 纹理采样 × 基础颜色
│
└── fill-z-offset ───────→ 复用 ExtrusionFeature 的 z 偏移机制
```

#### 1.2 `LineMaterial`（扩展 `SolidLineMaterial`）

```
扩展内容：
├── line-blur ───────────→ 片段着色器 fwidth 模糊
│     float dist = abs(vCoords.y);
│     float blur = lineBlur * 模糊因子;
│     float alpha = 1.0 - smoothstep(width/2.0 - blur, width/2.0, dist);
│
├── line-gradient ───────→ 新增 LineGradientFeature mixin
│     新增 uniform: u_gradient_image (256×1 纹理)
│     新增 varying: v_line_progress (float 0~1 沿线段)
│     片段: texture2D(u_gradient_image, vec2(v_line_progress, 0.5))
│
├── line-pattern ────────→ 新增 uniform: u_pattern_image
│     UV.x = 沿线段方向，UV.y = 垂直方向
│     片段: texture2D(u_pattern_image, vec2(u, v))
│
├── line-gap-width ──────→ 复用 secondaryWidth (已有)
│
└── line-emissive-strength → 新增 uniform，混合到输出颜色
```

#### 1.3 `CircleMaterial`（新增 `MapCircleMaterial`）

```
继承 THREE.PointsMaterial
├── circle-blur ─────────→ 片段着色器：
│     float dist = length(gl_PointCoord - 0.5) * 2.0;
│     float blur = circleBlur / circleRadius;
│     float alpha = 1.0 - smoothstep(1.0 - blur, 1.0, dist);
│
├── circle-stroke-* ─────→ 片段着色器环形渲染：
│     if (dist > 1.0 - strokeWidth * 2.0 / circleRadius) {
│         color = strokeColor;
│     }
│
├── circle-pitch-scale ──→ 控制 sizeAttenuation
│     pitch-scale: map → sizeAttenuation=true
│     pitch-scale: viewport → sizeAttenuation=false
│
└── circle-pitch-alignment → 修改点精灵旋转矩阵
```

#### 1.4 `FillExtrusionMaterial`（扩展 `MapMeshStandardMaterial`）

```
扩展内容：
├── vertical-gradient ────→ 在片段中按 v 坐标插值明暗
│     float shade = mix(lowerShade, upperShade, v_pos.y / height);
│     existing gl_FragColor.rgb *= shade;
│
├── flood light ─────────→ 定向光源 uniform + 半径衰减
│     vec3 lightDir = normalize(u_flood_light_dir);
│     float NdotL = max(dot(normal, lightDir), 0.0);
│     float atten = 1.0 - smoothstep(0.0, u_flood_light_radius, distance);
│     color *= (ambient + NdotL * atten);
│
└── AO ─────────────────→ 基于面高度和周围高度差
│     float ao = 1.0 - u_ao_intensity * (1.0 - edgeDistance / maxEdge);
│     color *= ao;
│
└── fill-extrusion-pattern → 同 fill-pattern，按 roof/wall 采样
     roof: 俯视 UV
     wall: 高度方向 UV
```

#### 1.5 Background

```
背景色 → MapMeshBasicMaterial (已有)
背景图案 → 复用 fill-pattern 的 MapPatternFillMaterial
```

### Phase 2: Sprite 图标渲染（Week 4-5）

**目标**：让 `icon-image` 能从 sprite JSON+PNG 加载并在三维场景中渲染。

#### 2.1 Sprite 图集

```
MBSpriteLoader 增强：
├── 从 sprite URL 加载 JSON + PNG
├── 解析每个 icon 的 rect、pixelRatio、sdf 标记
├── 构建 SpriteAtlas 纹理（将所有图标 pack 到一张纹理中）
└── 输出 Map<string, UVRect> 供材质查询
```

#### 2.2 IconMaterial

```
extends SpriteMaterial (THREE)
├── uniform: u_atlas (sampler2D) — sprite 图集
├── uniform: u_uv_tl, u_uv_br (vec2) — 当前 icon 的 UV 坐标
├── uniform: u_color, u_opacity
├── uniform: u_rotation (旋转)
│
├── 片段着色器：
│     vec2 uv = mix(u_uv_tl, u_uv_br, vUv);
│     vec4 texColor = texture2D(u_atlas, uv);
│     if (texColor.a < 0.05) discard;
│     gl_FragColor = vec4(texColor.rgb * u_color, texColor.a * u_opacity);
```

#### 2.3 Icon-Text-Fit

```
当 icon-text-fit 启用时：
├── 计算文本包围盒
├── 调整图标的 UV/位置/缩放以适配文本大小
├── 支持: width, height, both
└── padding 控制边距
```

### Phase 3: SDF 文本渲染（Week 5-7）

**目标**：实现基于 SDF（Signed Distance Field）的文本渲染系统。

#### 3.1 Glyph Atlas

```
MBGlyphLoader 增强：
├── 从 glyph URL 模版加载 {fontstack}/{range}.pbf
├── 解码协议缓冲 → glyph id/bounding box/metrics/bitmap
├── 生成 SDF 位图（参照 mapbox-gl-js TinySDF）
├── 将 glyph 打包到 GlyphAtlas 纹理
└── 提供 glyph 查询接口 (font, charCode) → UVRect + metrics
```

**SDF 生成算法**（TinySDF）：
```
对每个字符：
1. 在 Canvas 上以 SCALE=2 渲染
2. 对于每个输出像素，扫描输入中最近的 alpha 变化
3. 编码 signed distance = (inside ? 128 + dist : 128 - dist) clamped [0,255]
4. 输出 Uint8Array 位图
```

#### 3.2 SDFTextMaterial

```
extends RawShaderMaterial (THREE)
├── uniform: u_glyph_atlas (sampler2D)
├── uniform: u_color, u_opacity
├── uniform: u_halo_color, u_halo_width, u_halo_blur
├── uniform: u_gamma (反走样控制)
│
├── 片段着色器（SDF 核心逻辑）：
│     float dist = texture2D(u_glyph_atlas, vUv).a;
│     float alpha = smoothstep(0.5 - u_gamma, 0.5 + u_gamma, dist);
│     // Halo:
│     float haloAlpha = smoothstep(0.5 - u_halo_blur - u_halo_width,
│                                  0.5 + u_halo_blur - u_halo_width, dist);
│     vec3 color = mix(u_halo_color, u_color, alpha);
│     gl_FragColor = vec4(color, max(alpha, haloAlpha) * u_opacity);
```

#### 3.3 Text Shaping

```
shaping.ts（参照 mapbox-gl-js）：
├── 从 text-field 表达式获取文本内容
├── 按 text-max-width 断行
├── 按 text-letter-spacing 调整字间距
├── 按 text-justify 对齐（left/center/right）
├── 按 text-line-height 分配行高
├── 按 text-transform 转换大小写
└── 输出 Quad[]：每个 glyph 一个矩形（位置 + UV + metrics）
```

### Phase 4: 纹理图案渲染（Week 7-8）

**目标**：支持 `fill-pattern`、`line-pattern`、`background-pattern`。

#### 4.1 图案纹理 Pipeline

```
MapPatternFillMaterial（继承 MapMeshBasicMaterial）：
├── uniform: u_pattern (sampler2D) — 图案纹理
├── uniform: u_pattern_size (vec2) — 图案原始大小
├── uniform: u_tile_size (vec2) — 瓦片像素大小
├── uniform: u_pixel_coord (vec2) — 像素坐标偏移
│
├── 顶点着色器产出：
│     varying vec2 v_pattern_pos = (worldPos / u_pattern_size);
│
├── 片段着色器：
│     vec2 uv = fract(v_pattern_pos);
│     vec4 pattern = texture2D(u_pattern, uv);
│     gl_FragColor = vec4(mix(gl_FragColor.rgb, pattern.rgb, pattern.a), opacity);
│
├── 瓦片对齐：
│     v_pattern_pos = (screenPos * u_pixel_coord) / u_pattern_size;
```

### Phase 5: 符号碰撞检测与布局（Week 8-12）

**目标**：实现完整的 mapbox symbol 碰撞检测与布局系统。

#### 5.1 CollisionIndex

```
CollisionIndex（参照 mapbox-gl-js）：
├── 空间网格：GridIndex<PlacedSymbol>
├── insert(circle/bbox, featureId, priority)
├── query(circle/bbox) → boolean 是否碰撞
├── 支持:
│   - circle-aabb 检测
│   - aabb-aabb 检测
│   - 优先级排序（高优先级覆盖低优先级）
└── 重置 per-frame
```

#### 5.2 Placement Engine

```
Placement（参照 mapbox-gl-js）：
├── performLayout(features, zoom, pitch, bearing)
├── 对每个 symbol 要素：
│   1. 计算屏幕空间位置
│   2. 计算 icon 和 text 的包围盒
│   3. 用 CollisionIndex 查询是否与其他已放置标注重叠
│   4. 根据 allow-overlap/ignore-placement 决定放置
│   5. opacity 渐变过渡（fade-in/fade-out）
└── 输出 visibility 数组
```

#### 5.3 Text Along Line

```
├── get_anchors.ts（参照 mapbox-gl-js）
│   沿 LineString 以 symbol-spacing 间隔计算锚点
│
├── projection.ts（参照 mapbox-gl-js）
│   将锚点从 tile 坐标投影到屏幕坐标
│   沿路径放置字符 quad
│
└── check_max_angle.ts
    过滤 sharp corner 处的锚点
```

---

## 5. 实施路线图总览

```
W1 ─── FillMaterial (pattern/outline/antialias/z-offset)
W2 ─── LineMaterial (blur/gradient/pattern/emissive) + CircleMaterial
W3 ─── FillExtrusionMaterial (gradient/AO/flood-light/pattern)
       └── Background (pattern)
W4 ─── Sprite Atlas + IconMaterial (icon-image/size/color/rotate/offset)
W5 ─── IconTextFit + Icon 高级属性
W6 ─── Glyph Atlas (pbf 字体 + TinySDF)
W7 ─── SDFTextMaterial + Text Shaping
W8 ─── Pattern fill/line/background 完成
W9 ─── CollisionIndex 空间网格
W10 ── Placement 引擎
W11 ── Text along line + 标注布局完成
W12 ── 集成测试 + 调优
```

**依赖关系**：
```
Phase 1 (W1-W3) 无外部依赖，可独立开发
  └── 是 Phase 4 的基础
Phase 2 (W4-W5) 依赖 MBStyleManager.sprite
  └── 是 Phase 3 的基础概念
Phase 3 (W6-W7) 依赖 Phase 2 的图集管理
  └── 是 Phase 5 的基础
Phase 4 (W8)    独立，与 MBStyleManager 配合
Phase 5 (W9-W11) 依赖 Phase 2+3 的 symbol 渲染
Phase 6 (W12)   全链路验证
```

---

## 6. 关键挑战与设计决策

### 6.1 线条宽度的 WebGL 限制

WebGL 原生 `lineWidth` 多数实现只支持 1px。

**决策**：使用 flywave 已有的 `SolidLineMaterial`（三角化线），它在 `LinesChunks` 中已经实现了完整的 extrude+cap+dash+outline。我们需要的是补充 gradient/pattern/blur，而不是重新实现线三角化。

### 6.2 碰撞检测的坐标系

碰撞检测需要屏幕空间坐标，但标注位置来自 tile 空间。

**决策**：
- 在 Worker 中预计算锚点（tile 坐标 + 沿线位置）
- 在主线程渲染时，用当前 camera matrix 投影到屏幕
- CollisionIndex 工作在屏幕空间（像素坐标）

### 6.3 字体渲染：SDF vs 几何文本

**决策**：使用 SDF 纹理，与 mapbox-gl-js 一致。原因：
- SDF 支持任意缩放无锯齿
- 支持 halo 渲染无额外绘制调用
- 支持 GPU 端模糊控制

### 6.4 材质更新策略

Mapbox paint 属性可能由表达式驱动，需要每帧（或 zoom 变化时）求值更新。

**决策**：复用 flywave 的 `MapMaterialAdapter` 机制，将 paint 表达式包装为动态属性回调。属性分为三类：
- **静态**（无表达式）：构造时设置一次
- **Camera-driven**（zoom 插值）：zoom 变化时更新
- **Data-driven**（feature-state）：每帧求值

---

## 7. 总结

这份计划覆盖了从最简单的 fill 颜色到最复杂的 symbol 碰撞检测的完整 Mapbox 材质兼容层。核心策略是：

1. **吃透** flywave 已有材质系统（`SolidLineMaterial`、`MapMeshBasic*`、`CirclePointsMaterial`）
2. **扩展** 它们以覆盖 Mapbox paint 的完整语义（line-blur、line-gradient、fill-pattern 等）
3. **新建** 缺失的子系统（SDF 文本、Sprite 图标、碰撞检测、图案填充）
4. **充分利用** mapbox-gl-js 源码作为算法参考，而非代码复用

Phase 1（W1-W3）是最关键的——它决定了基本 fill/line/circle/extrusion 的渲染质量能否对齐 mapbox-gl-js。建议从 Phase 1 开始，逐步推进。
