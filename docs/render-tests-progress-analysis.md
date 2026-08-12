# Render-Tests 移植进展分析（2026-08-12）

> 基于 `docs/render-tests-port-todo.md`（3031 用例 / 270 分类，审计至 2026-08-11）+ `docs/render-tests-final-report.md` 整理。

## 一、目前进展（三个阶段已完成）

**Phase 0 — 系统级缺陷（S1–S5）全部修复 ✅（08-09）**
- S1 `m_tiles` 幻影属性 → patcher / symbol-placement 两条增强路径从"整体不可达"恢复，一次性解锁 ~45 分类 / ~1200 用例
- S2 filter 误路由、S3 technique 单例缓存（数据驱动丢值）、S4 feature-state 键不匹配、S5 setStyle URL 崩溃

**逐分类校正（Z1–Z6）✅（08-09）**
- 相机缩放 +1、decoder zoom 求值、minDataLevel、circle 半径/直径、参考图 alpha 合成、legacy zoom-and-property 函数
- 结果：circle/fill/background 基础分类在 headless 下已通过

**代码级补齐（C1–C10）✅（08-09 ~ 08-11）**
- background-visibility、worldview ctx 转发、extrusion pattern cross-fade、line-border-gradient、line-gradient 注入目标、partial-rendering 坏桩移除、symbol-placement line/line-center、is-supported-script Unicode 检测、TileJSON url 源、runtime addSource/removeSource 接线 provider

**Phase 1 单点（P1.4/P1.6/P1.8–P1.12）✅** — line-cap、text/icon 原生 props 映射（tracking/leading/lineWidth/hAlignment 等）、circle-translate shader 注入、circle-geometry 扩展、raster-visibility/extent、text-arabic 接线、measure-light 时序。

**当前状态估计**：文档估算修复后约 **50–60%** 用例可视觉通过；但 headless SwiftShader 有三层渲染阻塞（composer 合成 / toBlob），line/extrusion 类在 headless 全红，真实通过率需真机 GPU 基线（`run-mbstyle-render-tests.js` 全量评估**尚未跑过**）。

## 二、未实现的功能（❌，无代码或仅死代码）

按用例规模排序：

| 域 | 功能 | 用例 |
|---|---|---|
| model-layer | BVH / per-tile covering / shadows / occlusion / emissive / LOD；且 `local://models/*` 测试资源缺失 | 212 |
| lighting-3d-mode | fill/line/circle 不受光（仅 extrusion/building）；light direction/intensity/color 表达式不解析；shadow flag 名与 spec 不符 | 120 |
| 3d-intersections | 隧道 / 下穿 / 上跨几何 + elevation graph（仅 guardrail） | 75 |
| fog | horizon-blend / vertical-range / high-color / space-color；globe 下禁用 | 63 中大部 |
| building | roof-shape 几何（hipped/gabled/mansard/pyramidal/skilion/parapet），仅 flat | ~6 |
| raster | raster-elevation(16) / -elevation-tiled(14) / -array(7) / -particle(5) 整条管线 0 命中 | ~42 |
| skybox | cubemap（SkySpec 仅 gradient\|atmosphere）；rayleigh/mie 大气散射；sky-gradient-center | 34 中部分 |
| color-theme | `color-theme` 表达式 + LUT 整条路径 | 26 |
| terrain | dynamic-exaggeration / terrarium / raycast(terrainDepth) / globe-terrain / symbol-draping | ~10 |
| heatmap | 无两遍 density→ramp 架构（现单遍近似） | 18 |
| clip-layer | **§2 未覆盖审计**，仅出现在全量清单 | 16 |
| circle | blur(8)、stroke-color/opacity/width(16)、orthographic 投影 | ~25 |
| line | blur(5)、offset(5)、gap-width native secondaryWidth | ~14 |
| icon | pitch-scaling、pixelratio-mismatch、no-cross-source-collision、secondary-coords-uint16 | 各 1–2 |
| text | halo-color/width/blur(13)、tile-edge-clipping、pitch-scaling、max-attributes、icon-high-pitch、`format` 图片段丢弃 | ~20 |
| symbol | cross-fade(2)、distance-fade(1) | 3 |
| fill-extrusion | edge-radius-narrow-corner、partial-rendering 语义（C6 只移除坏桩）、terrain 多瓦片 DEM + 真实 exaggeration | ~19 |
| 其他 | video(2)、front-cutoff(6)、cross-source-elevation(8)、tile-providers/PMTiles(7)、map-mode/tile-mode(4)、custom-layer-js(6)/custom-source(8)、fill-antialias、sd-hd-conflation/hd-sd-transition 真实覆盖逻辑(~25) | |

## 三、未连线的功能（代码存在但没接进管线）

**引擎级缺口（datasource 侧无法解决，需改 flywave-materials / text-canvas）**
- P1.2 circle-blur/stroke → `CirclePointsMaterial` 无 blur/stroke uniform；`MapCircleMaterial` 是死代码
- P1.3 line-blur/line-offset → `SolidLineMaterial` 无对应 uniform
- P1.5 line-join → 无 join setter（patcher 写死 define 无效）
- text/icon halo 三件套 → `flywave-text-canvas` TextStyle 无 halo/outline 支持
- P1.7 剩余：icon-offset/anchor/rotate → `PoiBuilder` 缺 `iconXOffset/iconYOffset/rotation` props（icon-color 已通）

**datasource 内部断头路（产出物无人消费）**
- fill-z-offset：emitter `resolveZOffset` 算出 `m_currentZOffset` 后 `push(x,y,0)` 直接丢弃（`MBTileDataEmitter.ts:593`）
- text-writing-mode：`shapeVerticalText` 只写 `_shaped`，竖排结果从未传给 TextElementsRenderer（32 用例）
- symbol-z-order/sort-key：emitter 只分组排序，不产 `technique.priority`，原生排序未接（19 用例）
- raster-color：`hasAdjust` 读了但 shader 无 `uMBRasColor`（P2.1 待做）
- icon-opacity：technique.opacity 设置了但 PoiRenderer 不读
- sprites：atlas 加载 ✅，但无 1x/2x pixelRatio 选择 → 2x 图标过大
- text-field `format`：仅字符串拼接，图片段 / font-scale / color 覆盖跳过

**Image 层（`applyImageSources` quad 路径）**
- 7 个 raster paint 子类（brightness/contrast/resampling/opacity/visibility/saturation/hue-rotate）全部被忽略，quad 原图绘制
- render-callback 子类不执行 `image/dot.js` 回调模块 → 空白
- wrap/wrap-projected 无跨反子午线重复；terrain 变体无顶点 draping
- `styleimagemissing` 事件不存在，runner 无 `on` 操作

**Runner / 测试基础设施 no-op（`MBStyleCompatRenderTest.ts`）**
- `check` / `forceRenderCached` / `pinBooleanTransitionProgress` — 无 case
- `addCustomLayer` / `addCustomSource` / `on` / `updateFakeCanvas` / `updateGeoJSONData`（→ geojson update 用例失效）
- `setColorTheme` 只存 `mapView.colorTheme` 无消费者；`setTheme` no-op
- `setLayerProperty` 就地改无重建；`setConfigProperty` / `setStyleImportConfigProperty` / imports 增删改后**不重新 merge**
- `setRenderWorldCopies` / `setRuntimeSetting*` / `mapMode` 仅存 flag
- `setSlot` 仅打标，slot 层 inert，顺序靠巧合一致
- `skip-test` 只做空 platform-tag 匹配；`expected-<platform>.png` 多基线未实现
- `scale-factor` 靠 harness 重写 icon/text-size 近似，src 无支持

**其他**
- geojson：cluster 是网格近似非 supercluster；单源接线，无真多源
- slots / imports / config：作用域参数与递归值不求值
- `line-width-unit: meters`：native 硬编码 `metricUnit:'Pixel'`，语义错误
- symbol-elevation：`_hdElevation` 通路依赖 patcher，`symbol-elevation-reference` 0 命中

## 四、当前真正的阻塞点（建议优先处理）

1. **全量基线未跑** — 3026 用例真实 pass/fail 未知，所有百分比都是估算；建议真机 GPU 跑 `scripts/run-mbstyle-render-tests.js`
2. **mvt 矢量瓦片要素渲染** — 文档§7 指出大量 measure-light / real-world 用例 fill 不显示，影响面大
3. **raster 瓦片纹理管线** — raster ~85 用例的前置
4. **文本像素级对齐** — 字体系统差异（flywave-text-canvas vs mapbox per-glyph SDF），symbol-text ~273 用例的精度天花板
5. **SwiftShader headless 阻塞** — 不解决则 line/extrusion/placement 类无法自动化验证，只能真机

> 备注：`render-tests-port-todo.md` §2 的状态表是 S1 修复前审计的，🔧 标记的分类（pattern/translate/gradient/join/heatmap/hillshade/raster 调整/building 立面/guardrails/icon-halo/text-fit/symbol offsets 等）在 S1 修复后处于"**已实现但未经像素级验证**"状态——既不算"未实现"也不算"已对齐"，是 P1.1 遗留的最大一块待验证工作。
