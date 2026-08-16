# Heatmap 双 Pass 实现方案（design）

> 目的：把当前单 pass 近似的 heatmap 渲染升级为对齐 mapbox 的**两遍 density→color-ramp** 管线，解决 heatmap-\* 18 用例（当前 0 通过、单 pass 无法对齐）。
> 本文仅从代码角度分析差距与实现路径，不涉及逐用例像素微调。

## 0. 现状与差距总览

### 0.1 mapbox 参考实现（`mapbox-gl-js`）

mapbox heatmap 是 **2-pass**（`src/render/draw_heatmap.ts`）：

```
Pass 1 (renderPass === 'offscreen')：密度场
  - 每个 point feature 展开成 4 顶点正方形 mesh（circle_bucket：a_pos 编码中心 + extrude）
  - 用 heatmap.vertex/fragment shader 画到 offscreen framebuffer（layer.heatmapFbo）
  - 颜色模式 AdditiveBlending（gl.ONE, gl.ONE, gl.ONE, gl.ONE）
  - fragment 输出：val = weight * u_intensity * GAUSS_COEF * exp(-0.5*9*dot(v_extrude,v_extrude))
    → 写入 density 纹理的 R 通道（其他通道恒 1）
  - 顶点 shader 里 S 由 weight/intensity 反推，使 kernel 在 mesh 边缘衰减到 ZERO

Pass 2 (renderPass === 'translucent')：查色
  - 全屏 quad（heatmap_texture.vertex/fragment）采样 density 纹理 R 通道
  - t = texture(u_image, v_pos).r
  - color = texture(u_color_ramp, vec2(t, 0.5)) * u_opacity
  - 其中 u_color_ramp 是 256×1 的 heatmap-color 插值 ramp（color_ramp.ts：对每个 t∈[0,1] 求 heatmap-color 表达式）
```

关键点：
- **密度在离屏累积**（additive），然后**一次性查 ramp**——这决定了"重叠点越密越亮/越红"。
- ramp 输入是**归一化密度**（density 纹理 R 通道，0..1），不是每点的局部密度。
- `heatmap-intensity` 只影响 Pass 1 的 kernel 高度（密度放大）。
- `heatmap-radius`（zoom 相关）与 `heatmap-weight`（data-driven）在**每个 feature** 上求值，写入 vertex attribute（`programConfigurations.populatePaintArrays`）。

### 0.2 当前 MB 实现（单 pass 近似）

`MBTileDataEmitter`（`case 'heatmap'`，`MBTileDataEmitter.ts:540-553`）：
```
props.technique = 'circles';   // 复用 points
props._isHeatmap = true;
props.size = p['heatmap-radius'];          // S3 已按 feature 分 technique → size 是单值
props._heatmapIntensity / _heatmapWeight / _heatmapColorStops
```

`MBMaterialPatchManager.patchHeatmapMaterial`（`MBMaterialPatchManager.ts:1437-1471`）：
```
- transparent + depthWrite=false + AdditiveBlending
- onBeforeCompile 替换 CirclePointsMaterial 的
  'gl_FragColor = vec4(diffuseColor, alpha);'
  为：
  mbHd = dot(gl_PointCoord-0.5, ...)*4.0
  mbHfall = exp(-mbHd * uMBHeatIntensity)
  mbHden = clamp(mbHfall * uMBHeatWeight, 0, 1)
  mbHcol = texture(uMBHeatRamp, vec2(mbHden, 0.5)).rgb
  gl_FragColor = vec4(mbHcol, mbHden * opacity)
```

### 0.3 差距（代码级）

| # | 差距 | 当前代码 | mapbox | 影响 |
|---|------|---------|--------|------|
| G1 | **无密度累积** | 每个 point 独立算 `mbHden`（只看自身 kernel），直接查 ramp | 先把所有点加性累积成 density 场，再查 ramp | 重叠点不叠加 → 无"热点"；ramp 语义错（`mbHden` 是单点径向值而非场密度） |
| G2 | **无离屏 framebuffer / 两遍** | 单遍直接画到主画布 | `layer.heatmapFbo`（offscreen RT）+ 全屏 quad 第二遍 | 无法按"场密度→颜色"变换；AdditiveBlending 直接对背景加色（白底→白） |
| G3 | **kernel 是 GL 点（gl_PointCoord）** | `circles` technique → `THREE.Points` + `gl_PointSize` | 4 顶点 mesh + 高斯 kernel，可精确控制半径/衰减 | `gl_PointSize` 半径受实现限制、无法逐点不同衰减；mapbox 的 `S` 半径由 weight 反推 |
| G4 | **weight 数据驱动丢失** | `_heatmapWeight` 是 technique 常量（S3 按 feature 分 technique 可做到逐 feature，但 `heatmap-weight` 求值是 paint 上的） | `populatePaintArrays` 写入每 feature 的 vertex attribute | `heatmap-weight/literal|identity-property-function` 等用例权重不生效 |
| G5 | **radius zoom 函数** | `props.size` 是求值后的单值（S3），但 CirclePointsMaterial 的 `gl_PointSize` 不随 zoom 每帧重求值 | vertex shader 用 `u_extrude_scale` 缩放 | `heatmap-radius/function|zoom-and-property-function` 半径随 zoom 变化缺失 |
| G6 | **ramp 构建** | `buildGradientTexture` 已存在（256×1 DataTexture） | `renderColorRamp`（同样 256×1） | 已有，可复用 |
| G7 | **opacity/背景合成** | 单 pass AdditiveBlending 直接叠加 | Pass 2 用 `u_opacity` 乘 ramp 色，normal 混合到背景 | 白底热力图应显示 ramp 颜色（半透明），当前在浅色背景上几乎不可见 |

**结论**：G1+G2 是结构性根因——单 pass 不可能实现"密度累积→统一查色"。G3/G4/G5 是数据通路，需随两遍一起做。

---

## 1. 目标架构（对齐 mapbox 2-pass）

```
┌─────────────────────────────────────────────────────────────┐
│ MBHeatmapRenderer（新模块，挂在 MBStyleDataSource 上）        │
│                                                             │
│  per-tile: 收集 heatmap 层的点（世界坐标 + weight + radius）   │
│                                                             │
│  Pass 1 ──► offscreen WebGLRenderTarget (densityTexture)    │
│            每点一个 billboard quad，AdditiveBlending          │
│            fragment: val = weight*intensity*gauss(dist)      │
│            → 写入 R 通道（density 场）                        │
│                                                             │
│  Pass 2 ──► 全屏 quad 采样 densityTexture + colorRampTexture │
│            color = ramp(density) * heatmap-opacity           │
│            → 合成到主渲染（normal blending，按 layer 排序）     │
└─────────────────────────────────────────────────────────────┘
```

设计决策（针对 flywave 现状）：
- **不复用 `circles`/`THREE.Points`**：新增独立 heatmap 几何路径，由 MB 发射器直接产出"点集合"（世界坐标 + per-feature weight + per-feature radius 基准），由 mapview 渲染成 mesh quad（等价 mapbox circle_bucket）。
- **复用既有 offscreen 能力**：mapview 已有 `composing/LowResRenderPass.ts` 用 `THREE.WebGLRenderTarget` 的先例；MB 侧新增一个可注册的"场景后处理"回调，在 `MapRenderingManager.render` 主 pass 之后、composer 合成之前插入两遍。
- **ramp 复用** `buildGradientTexture`（`MBMaterialPatchManager`）。

---

## 2. 数据通路改造（G4/G5，emitter 侧）

### 2.1 发射 heatmap 点集合而非 circles

`MBTileDataEmitter` 新增：
```
private m_heatmapPoints: Array<{
  x,y,z: number;            // 世界坐标（tile 中心相对，同 mesh）
  weight: number;           // heatmap-weight 求值（数据驱动，per feature）
  radiusPx: number;         // heatmap-radius 求值（zoom 相关），或存表达式由渲染端按 zoom 求值
}>;
```
在 `processPointFeature`（`MBTileDataEmitter.ts:1100-1197`）中，当 `layer.type === 'heatmap'` 时：
- 不再走 `getOrCreateGeometry(key)`（circles）分支；
- 改为把每个 point 追加到 `m_heatmapPoints`，携带该 feature 的 `weight`（`p['heatmap-weight']`，数据驱动已由 `MBLayerEvaluator` 求值）与 `radius`（`p['heatmap-radius']`，可能仍是 zoom 表达式 → 保存原始或求值基准）。

### 2.2 technique 携带 ramp/intensity/opacity（与 per-feature 分离）

`case 'heatmap'` technique props 精简为：
```
props.technique = 'heatmap';   // 新增 technique 名（原生无 → mapview 需新增或 MB 拦截）
props._heatmapIntensity = p['heatmap-intensity'] ?? 1;
props._heatmapOpacity  = p['heatmap-opacity']  ?? 1;
props._heatmapColorStops = p['heatmap-color'] ?? [[0,'rgba(0,0,255,0)'],[0.5,'blue'],[1,'red']];
// radius / weight 不再进 technique（随点）
```

> 备选：若不想动 datasource-protocol（`technique.name` 白名单），可继续用 `name:'circles'` + `_isHeatmap` 标记，但渲染端**不按 circles 路径建 `THREE.Points`**，而是拦截到 heatmap 专用对象。推荐后者（改动面小）。

### 2.3 per-feature 求值（S3 已具备）

`MBLayerEvaluator.evaluate` 已对 paint 逐 feature 求值（`heatmap-weight`/`heatmap-radius` 的 `["get",...]`/identity 会在 `paint[key]` 上得到具体值）。需确认 `heatmap-radius` 为 **zoom 函数**时（`heatmap-radius/function`），S3 的 `evaluatedCacheKey` 会因 zoom 不同产生多 technique——但 radius 应随 zoom 连续变化，不能靠 technique 离散化。因此 **radius 求值应在渲染端每帧按当前 zoom 重做**（见 §3.2）。

---

## 3. 渲染端两遍（mapview + MB 侧）

### 3.1 新增 `HeatmapLayerPass`（mapview composing 或 MB 自持）

参考 `composing/LowResRenderPass.ts`，新增一个可插入 `MapRenderingManager` 的 pass：

```ts
// 概念代码
class HeatmapRenderPass {
  private m_densityRT: THREE.WebGLRenderTarget;  // 尺寸 = canvas * 0.5（mapbox 用 0.25）
  private m_densityMat: ShaderMaterial;          // Pass 1：点→高斯 kernel
  private m_colorMat: ShaderMaterial;            // Pass 2：density→ramp
  render(renderer, scene, camera) {
    // Pass 1: 清空 densityRT（transparent），AdditiveBlending 画所有 heatmap 点 mesh
    renderer.setRenderTarget(this.m_densityRT);
    renderer.clear();
    renderer.render(this.m_heatmapScene, orthoCamera);  // 或用同一 camera + 点世界坐标
    // Pass 2: 全屏 quad 采样 density + ramp → 主 framebuffer
    renderer.setRenderTarget(null);
    renderer.render(this.m_quadScene, this.m_quadCamera);
  }
}
```

接入点：`MapRenderingManager.render`（`MapRenderingManager.ts:347-364`）在主 `composer.render()` 之前调用 `heatmapPass.render(renderer, scene, camera)`；MB 通过 `MBStyleDataSource` 把 heatmap 层对象注入。

### 3.2 Pass 1 shader（密度 kernel，对齐 mapbox heatmap.vertex/fragment）

- 每点一个 2×2 三角形 quad（4 顶点，extrude ∈ [-1,1]²），世界坐标中心 + `extrude * radiusPx * u_extrude_scale`。
- 顶点 shader：
  ```
  // 用与 mapbox 相同的 S 反推，使 kernel 在 mesh 边缘接近 0
  float S = sqrt(-2.0*log(ZERO / weight / intensity / GAUSS_COEF)) / 3.0;
  v_extrude = S * a_extrude;
  gl_Position = u_matrix * vec4(center + v_extrude*radius*extrude_scale, 1);
  ```
- fragment shader（AdditiveBlending，写 R 通道）：
  ```
  float d = -0.5 * 3.0*3.0 * dot(v_extrude, v_extrude);
  float val = weight * u_intensity * GAUSS_COEF * exp(d);
  gl_FragColor = vec4(val, 1.0, 1.0, 1.0);
  ```
- **radius 按当前 zoom 每帧求值**：`radiusPx = evaluate(heatmap-radius, zoom)`；`u_extrude_scale = pixelsToTileUnits(tile, 1, zoom)`（映射当前 MB 的 camera zoom+1 约定，见 `MBStyleDataSource.applyCameraSettings`）。

### 3.3 Pass 2 shader（density→ramp，对齐 mapbox heatmap_texture）

```
// 全屏 quad，v_pos ∈ [0,1]²
float t = texture(u_image, v_pos).r;         // density 纹理 R
vec4 color = texture(u_color_ramp, vec2(t, 0.5));
gl_FragColor = color * u_opacity;            // normal blending 合成到背景
```
- `u_image` = densityRT 纹理，`u_color_ramp` = `buildGradientTexture(_heatmapColorStops)` 256×1。
- 渲染顺序：该 pass 应在 fill/circle 等"地面层"之上、symbol 之下（mapbox 在 translucent pass 中按 layer 顺序）；MB 侧通过 renderOrder 与主场景 layer 排序协调。

### 3.4 离屏 RT 尺寸与多瓦片

- RT 尺寸 = `canvas.width * 0.5`（SwiftShader 精度平衡；mapbox 0.25）。跨瓦片 kernel 需要"允许绘制跨边界"——把点世界坐标直接喂 Pass 1（不做 tile 裁剪），等价 mapbox 的 `StencilMode.disabled`。
- 所有 heatmap 层的点合并进同一 densityRT（mapbox 每个 layer 一个 FBO；MB 先按层，合并优化后续）。

---

## 4. 复用与新增清单

| 文件 | 改动 |
|------|------|
| `MBTileDataEmitter.ts` | `case 'heatmap'` 不再产 circles geometry；收集 `m_heatmapPoints`（x/y/z/weight/radiusExpr）；technique 精简为 intensity/opacity/ramp |
| `MBStyleDataSource.ts` | 新建/持有 `MBHeatmapRenderer`；在 `patchTileMaterials` 后把 heatmap 点集合 + technique 交给它 |
| `MBMaterialPatchManager.ts` | `patchHeatmapMaterial` 单 pass shader 移除（或保留为无 RT 时 fallback）；`buildGradientTexture` 复用 |
| `flywave-mapview` `MapRenderingManager.ts` / 新 `composing/HeatmapRenderPass.ts` | 主 pass 前插入两遍；提供 `registerHeatmapPass` |
| `flywave-mapview` `MapView.ts` | 暴露 renderer/RT 能力给 datasource 注入 |
| 新增 `MBHeatmapRenderer.ts` | 组装 Pass1/Pass2 几何与 shader，管理 densityRT/ramp 生命周期 |

> 备选最小路径（不新增 mapview 公共 API）：MB 自持一个 `THREE.Scene`（heatmap 点 mesh）+ 两遍渲染，通过 `MBStyleDataSource` 已有的 `mapView` 句柄拿 `renderer`，在 `requestAnimationFrame`/AfterRender 钩子（`MBStyleDataSource.ts:764-775`）里手动 `renderer.setRenderTarget` 完成两遍。缺点是与 composer 合成时序耦合，需保证在 screenshot 前完成。

---

## 5. 验收与用例映射

| 用例 | 依赖 | 预期效果 |
|------|------|----------|
| `heatmap-radius/data-expression`（geojson，`["get","radius"]`） | G4（weight 常量 1）+ G2 | 两 blob 密度场→ramp，与 expected 半透明红/蓝重叠可对齐 |
| `heatmap-radius/default|literal`（mvt） | G5（radius 按 zoom）+ G2 | Berlin POI 密度场 |
| `heatmap-color/default|expression` | ramp 构建（已具备） | 颜色随密度走 ramp |
| `heatmap-intensity/*` | Pass1 intensity uniform | 密度放大 |
| `heatmap-weight/*`（identity-property-function） | G4 per-feature weight | 权重大的点 kernel 更高 |
| `heatmap-opacity/*` | Pass2 opacity | 整体透明 |

**验收门禁**：`heatmap-*` 18 用例 actual 从"空白/单点"变为"密度场+ramp 颜色"，至少 1–2 个（data-expression、opacity/default）进入 ≤600px 近失；再逐像素校准（kernel 宽度、ramp 采样、RT 分辨率）。

---

## 6. 风险与注意事项

1. **SwiftShader 精度**：density RT 用 `HalfFloat` 纹理（mapbox 用 float），需在 `renderer.capabilities` 检查；必要时 RT 分辨率 0.5 并做一遍 blur 近似（mapbox 依赖 fragment 高斯，无需 blur）。
2. **composer 时序**：两遍必须在 `MapRenderingManager.render` 的 composer 之前完成且 densityRT 不参与 MSAA；`preserveDrawingBuffer` 截图路径已存在（`MBStyleCompatRenderTest` 用 `toBlob`），需确认两遍结果进入最终 canvas。
3. **renderOrder/层序**：heatmap 应在背景/填充之上、符号之下；与 `depthTest:false`、`renderOrder` 协调。
4. **多 heatmap 层/多瓦片**：先按 layer 合并密度（mapbox 按层），避免层间相互污染。
5. **per-feature weight 数组**：`m_heatmapPoints` 的 weight/radius 需与顶点 buffer 对齐（每点 4 顶点共享，用 `THREE.InstancedBufferAttribute` 或重复 4 份）。
6. **radius 数据驱动 + zoom**：`heatmap-radius` 同时支持 `["get",...]` 与 zoom 插值；统一在渲染端按 `(zoom, feature)` 求值（MBExpressionEngine 已支持 legacy/表达式）。

---

## 7. 实施顺序（建议）

1. **P1（结构性）**：`MBTileDataEmitter` 收集 `m_heatmapPoints` + `MBHeatmapRenderer` 最小两遍（densityRT + 全屏 quad），固定 radius/intensity/weight=1，先让 `heatmap-radius/data-expression` 出密度场。
2. **P2（数据驱动）**：per-feature weight/radius 接线（G4/G5），覆盖 `heatmap-weight/*`、`heatmap-radius/function|zoom-and-property-function`。
3. **P3（精度）**：kernel S 反推、RT 分辨率、ramp 采样校准；`heatmap-color`/`heatmap-intensity`/`heatmap-opacity` 参数对齐。
4. **P4（工程）**：多瓦片/多层合并、内存生命周期（tile 销毁时释放 RT）、真机 GPU 对照。

---

## 8. 实施进度（截至 2026-08）

### 已完成（P1 + P2 + P3 + P4 主体）

| 项 | 文件 | 状态 |
|----|------|------|
| heatmap 点发射（不再走 circles 几何） | `MBTileDataEmitter.ts` | ✅ `processPointFeature` 中 `layer.type==='heatmap'` 时收集 `m_heatmapPoints`（`projectWorld` 绝对世界坐标 + per-feature weight/radius + techniqueIdx），`continue` 跳过原生点几何 |
| 两遍渲染器 | 新增 `MBHeatmapRenderer.ts` | ✅ Pass1 离屏 `WebGLRenderTarget`（additive `gl.ONE,gl.ONE`）+ Pass2 全屏 quad 采样 ramp，AfterRender 中 `setRenderTarget(null)` 合成到主画布 |
| per-feature weight/radius | `MBLayerEvaluator.ts` + emitter | ✅ `evaluatedCacheKey` 已按 feature 求值分 technique；zoom 依赖的 `heatmap-radius` 原始表达式经 `paintDefs` 透传，渲染端每帧在 `zoomLevel-1`（mapbox zoom）重求值 |
| 复用 ramp 构建 | `MBMaterialPatchManager.ts` | ✅ `buildGradientTexture` 改 public |
| kernel 精度（P3） | `MBHeatmapRenderer.ts` | ✅ mapbox 公式：`S = sqrt(-2*log(ZERO/(weight*intensity*GAUSS_COEF)))/3`，kernel `val = weight*intensity*GAUSS_COEF*exp(-0.5*9*r²)`，quad 半宽 `S*radius`（边缘衰减到 1/255）；`heatmap-intensity` 只放大高度；Pass2 `color*u_opacity`（全通道） |
| 接线 | `MBStyleDataSource.ts` | ✅ AfterRender 中 `MBHeatmapRenderer.run()`（动态 import，无 heatmap 时早退） |
| 多层隔离（P4） | `MBHeatmapRenderer.ts` | ✅ 按 `technique._layerId` 分组（静态 `buildGroups`，可单测），每层独立 density pass + 各自 ramp/intensity/opacity，按 `renderOrder` 顺序合成；跨瓦片点合并进同层密度（世界坐标，天然跨边界） |
| 内存生命周期（P4） | `MBStyleDataSource.ts` + renderer | ✅ 数据源 `dispose()` 释放 RT/ramp 纹理/几何；每帧清理未引用 ramp 缓存；kernel 几何按需扩容（`setDrawRange` 复用，超容量才重建） |

### 关键决策（与本文差异）

- **世界坐标**：点用 `projectWorld()`（绝对世界坐标，与 TextElementsRenderer 同空间），而非 §2.1 的 tile 中心相对坐标——渲染端直接 `camera.project()`，无需 tile 变换。
- **RT 分辨率**：全分辨率（未用 §3.4 的 0.5），kernel 高斯不依赖 blur。
- **intensity 语义**：只缩放密度高度（对齐 §0.1），不做扩散控制。
- **radius zoom 函数**：每帧 CPU 重求值（P2），使半径随 zoom 连续插值。

### 待办

- **P4 剩余（需真机）**：真机 GPU 对照（SwiftShader 与真实 GPU 的 density 精度、半分辨率 RT 权衡），确认两遍输出进入最终 canvas / screenshot。
- **逐像素校准**：kernel 宽度/ramp 采样对照 mapbox 参考图。
- **渲染冒烟测试**：现有测试只覆盖数据发射与分组；需在渲染 harness（`MBStyleCompatRenderTest` 用 `toBlob`）验证两遍输出进最终 canvas。
