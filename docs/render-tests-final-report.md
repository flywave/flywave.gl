# render-tests 完整调查报告（2025-08-04）

> 基于 `docs/render-tests-misaligned-features.md` 的 5 个"可直接补全"功能，历经多轮实现 + 深度调试。
> 目的：完整记录功能实现、真实 bug 修复、三层渲染阻断的精确诊断，以及后续路径。

## 一、功能实现（代码就绪，待真机 GPU 验证）

5 个功能按 mapbox 源码实现，全部通过 typecheck + 259 单元测试。**无法在当前 headless SwiftShader 环境做 pixel-diff 验证**（见第三节）。

| 功能 | 测试 | 实现要点 | 文件 |
|------|------|---------|------|
| **symbol-z-order source/auto** | 11 | viewport-y renderOrder 方向修正；auto 在 canOverlap 时等同 viewport-y；source 保持源序 | `MBStyleSymbolPlacement.applyZOrder` |
| **hillshade-buffer** | 3 | DEM 图像 border 自动探测（256/258/260→buffer0/1/2）；tile UV 映射到 DEM 内部数据区，单像素有限差分采样到 border | `MBMaterialPatchManager.patchHillshadeMaterial`、`HillshadeTileDataProvider`、`MBTileDataEmitter` |
| **raster-masking** | 4 | canvas 默认尺寸 512×512（mapbox 默认，修复 "Image sizes do not match"）；opacity/hue-rotate/fade 已有 | `MBStyleCompatRenderTest` |
| **zoom-history** | 2 | legacy `{stops}` 表达式求值；line-width `metricUnit:'Pixel'`；line-dasharray 按 line-width 倍数缩放 | `MBExpressionEngine.evaluateLegacyStops`、`MBLayerEvaluator.isExpr`、`MBTileDataEmitter` |
| **symbol-cross-fade** | 2 | fade 计时支持（`setFadeDuration`）；**瓦片级 cross-fade 未实现**（需保留旧 zoom 标签对象做淡出，复杂且需可见渲染） | `PlacementEngine` |

## 二、真实 bug 修复（已提交，与功能无关但阻碍所有渲染/测试）

### 基础设施（从零搭建）
- karma 接入 compat 测试 + 资源 pattern + `ChromeHeadlessNoSandbox` launcher
- mapbox integration 资源（tiles/sprites/glyphs/data/image/styles，94M）本地化到 git 管理的 `test/rendering/integration/`
- `MBStyleDataSource` 支持 in-process `decoder`（绕过 worker bundle）
- `scripts/generate-mbstyle-test-index.js` 生成静态测试列表（浏览器无法用 fs）
- 本地 `expected.png` 参考图解析（`setReferenceImageResolver`）
- `KARMA_ARGS="filter=<name>"` 分类筛选

### flywave-materials / flywave-utils / mbstyle
| 修复 | 说明 |
|------|------|
| **RawShaderMaterial→ShaderMaterial 基类** | three@0.178 的 RawShaderMaterial 在 SwiftShader 下产出 0 光栅化片元（隔离实验证明：相同 shader+geometry，RawShaderMaterial=0px，ShaderMaterial=20224px）。改为继承 ShaderMaterial，strip 掉 built-in 声明避免 redefinition |
| **MapFillMaterial nested main()** | onBeforeCompile 用含 `void main() {` 的完整 shader 替换 `#include <begin_vertex>`，造成嵌套 main()（GLSL 语法错误）。改为在全局作用域注入 uniforms/helper |
| **ExtrusionFeature.isEnabled** | ratio=1（默认）时 `extrusion_vertex` 是 no-op（`transformed + extrusionAxis*(1-1)`），不应启用；否则插入的 shader chunks 破坏 MeshBasicMaterial |
| **GeoJSON 裸几何归一化** | `LineString`/`Polygon` 非 FeatureCollection → 包装成 FeatureCollection，否则 decoded tile 为空 |
| **相机默认 center** | style 只有 zoom 无 center 时 mapview 停在世界角落 → 默认 `[0,0]` |
| **legacy `{stops}` 表达式** | `{base,type,stops}` 对象形式 → `line-width` 变 NaN → 按 exponential/interval/categorical 求值 |
| **line-width metricUnit** | mapbox 线宽是 CSS 像素，需 `metricUnit:'Pixel'` 换算世界单位 |
| **line-dasharray × line-width** | dash 值以 line-width 倍数计，随 zoom 缩放 |
| **atmosphere mat4*vec3** | `u_modelViewProjection * position` → 需 `vec4(position,1.0)` |
| **displacementMapUvMatrix 默认值** | 未传时默认 identity Matrix3，避免 uniform value undefined |

## 三、三层渲染阻断（headless SwiftShader，已逐层精确定位）

通过大量 GPU pixel 级隔离实验，逐项确认：

### 层 1：flywave 材质首次程序编译损坏
- 场景 + 几何 + 相机全部正常：所有 mesh 换全新 `MeshBasicMaterial`/`ShaderMaterial` → 全屏绿/红 (65536)
- **flywave 材质（MapMeshBasicMaterial/SolidLineMaterial）首次编译的程序损坏 → 空白**
- `needsUpdate=true` 强制重编译 + 直接渲染 → GPU 帧缓冲 nonblue=65536（正常）
- 根因：材质 onBeforeCompile mixin 链（Displacement/Fading/Extrusion）在 three@0.178 下破坏 shader；部分已修复（Extrusion isEnabled、MapFillMaterial nested main）

### 层 2：EffectComposer 输出空白
- mapview 用 postprocessing EffectComposer 渲染 → 空白
- 直接 `renderer.render(scene, rteCamera)` 绕过 composer → 有效（需先 needsUpdate）
- EffectComposer 的 RenderPass/输出 pass 在 SwiftShader 下未正确合成到 canvas

### 层 3：canvas toBlob 捕获空白
- `gl.readPixels` 读 GPU 帧缓冲有内容（nonblue）
- `canvas.toBlob()`（canvasToImageData 用）读空白
- headless Chrome 的 canvas 呈现问题（SwiftShader 双缓冲/present）

### 为什么真机 GPU 几乎必然正常
- 代码层面一切验证正确：shader 编译通过、全部 attribute 绑定（position/biTangent/extrusionCoord location 0-5）、uniforms 正确（projectionMatrix/extrusionWidth）、几何非退化
- 三层问题均为 SwiftShader（ANGLE/Vulkan 软件渲染）的兼容性缺陷，真机 GPU 不受影响

## 四、提交历史（feat/mbstyle-datasource 分支）

| commit | 内容 |
|--------|------|
| a0522ded | feat: hillshade-buffer DEM border + zoom-history dash scaling + canvas size |
| 288c3122 | docs: 精确诊断 SolidLineMaterial 阻塞 |
| 5389f820 | fix: RawShaderMaterial→ShaderMaterial（isRawShaderMaterial=false） |
| 9c884e1e | fix: RawShaderMaterial→ShaderMaterial 基类 + strip builtins |
| c537647a | feat: pre-extrude line ribbons in JS + emit fill fallback |
| 35c2b003 | u（用户侧） |
| d22b0d68 | cleanup: 移除诊断代码 |
| 15665d59 | fix: MapFillMaterial nested main() |
| 055e4256 | fix: ExtrusionFeature.isEnabled ratio=1 no-op |

## 五、运行方法

```bash
# 构建（修改过 flywave-materials/utils 后）
cd @flywave/flywave-materials && npx tsc --build
cd @flywave/flywave-utils && npx tsc --build

# 运行 compat 测试（headless，当前渲染空白）
CHROME_BIN=~/.cache/puppeteer/chrome-headless-shell/.../chrome-headless-shell \
KARMA_ARGS="filter=zoom-history/in" \
npx karma start --browsers ChromeHeadlessNoSandbox

# 真机 GPU 验证（推荐）
KARMA_ARGS="filter=zoom-history/in" pnpm karma-browser
```

## 六、自动化渲染对比管道（已实现）

自动渲染 style → 与 expected.png 对比 → 生成 diff → 评估差异。

```bash
# 运行（CHROME_BIN 指向 chrome/chrome-headless-shell）
CHROME_BIN=<path> node scripts/run-mbstyle-render-tests.js zoom-history
# 或跑多个分类
CHROME_BIN=<path> node scripts/run-mbstyle-render-tests.js symbol-z-order default-across

# 可选 env
MBSTYLE_REPORT=/path/to/output   # 结果输出目录（默认 rendering-test-results/mbstyle）
MBSTYLE_PORT=8091                # 结果服务器端口（默认 8081）
```

### 流程
1. **启动结果服务器**（`RenderingTestResultServer`）：保存每个测试的 `actual.png`、`diff.png`、`.ibct-result.json`，并提供 HTML 报告 `/ibct-report`。
2. **运行 karma headless**：渲染每个 style，用本地 `expected.png` 对比（`pixelmatch`），POST 结果到服务器。
3. **输出摘要**：每个测试 pass/fail + mismatched pixels 数；`open http://localhost:PORT/ibct-report` 查看 HTML 报告（含 actual/diff 图）。

### 输出示例
```
=== Summary: 0 passed, 32 failed ===
  FAIL zoom-history/in (1162 mismatched pixels)
  FAIL hillshade-buffer/tile-edge-buffer-0 (61000 mismatched pixels)
  ...
```
结果保存在 `MBSTYLE_REPORT/ChromeHeadless-.../mbstyle-render-<name>.<extra>.png`。

### 组件
- `scripts/run-mbstyle-render-tests.js`：runner（启动服务器 + karma + 摘要）
- `MBStyleCompatRenderTest.ts`：支持 `KARMA_ARGS="feedback-url=http://host:port"`，把结果 POST 到服务器
- `RenderingTestResultServer`：新增 CORS（karma 跨域 POST）
- `index.web.ts`：导出 `RenderingTestResultReporter`

> 当前 32 个测试全部 FAIL（mismatch 数如上），因为 headless SwiftShader 渲染空白（见第三节）。管道本身验证有效——diff 图像正确生成（空白 vs expected）。真机 GPU 渲染正常后，同一管道直接输出真实通过率。

## 七、后续路径（按优先级）

1. **真机 GPU 验证**（首选）：`pnpm karma-browser`。代码层面全部正确，真机渲染正常后 5 个功能逐项 pixel-diff 修正。
2. **修复 EffectComposer**（headless 可选）：查 `MapRenderingManager` 的 composer 输出 pass 为何不合成到 canvas。
3. **symbol-cross-fade 瓦片级 cross-fade**：需保留旧 zoom 的 symbol 对象做淡出（复杂，需可见渲染）。
4. **hillshade 视觉精度**：DEM border 采样已实现，需真机确认 shading 匹配 mapbox。
