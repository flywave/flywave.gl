# 大气 / 云的上游对齐状态（takram three-geospatial）

`@flywave/flywave-atmosphere` 不是原创，是 **takram-design-engineering 的
`three-geospatial`**（`@takram/three-atmosphere` + `@takram/three-clouds`）的
重写式移植：上游是 WebGL2/GLSL + `postprocessing`，本仓库整体改写为
three/webgpu 的 TSL 节点图。

**结论（2026-11-15 核对）**：本地移植快照已对齐上游 `main` 头部
`b012ad06`（2026-05-27，`@takram/three-atmosphere@0.19.1`、
`@takram/three-clouds@0.7.6`）。此后上游**零库提交**，npm 也停在 0.19.1 /
0.7.6，因此不存在版本落后。上游 WebGPU 云仍是 WIP，本地云 TSL 反超。

## 路径映射

| 上游 | 本地 |
|---|---|
| `packages/atmosphere/src/webgpu/` | `@flywave/flywave-atmosphere/src/atmosphere/` |
| `packages/core/src/webgpu/` | `@flywave/flywave-atmosphere/src/tsl/` |
| 分支 `webgpu/clouds` 的 `packages/clouds/src/webgpu/`（仅程序化纹理） | `src/clouds/textures/`、`src/clouds/noise/` |
| `packages/clouds/src/shaders/`（WebGL GLSL 云，行为基准） | 本地自研 TSL：`src/clouds/cloudTsl.ts`、`src/atmosphere/CloudRenderNode.ts` |

`CloudRenderNode.ts` / `cloudTsl.ts` / `CascadedShadowMaps.ts` /
`FrustumCorners.ts` / `splitFrustum.ts` **上游没有对应实现**（其 WebGPU 云
分支只有 shape/shape-detail/local-weather/turbulence 四张程序化纹理）。

## 本地对齐证据（上游对应提交日期）

- `skyBackdrop` / `aerialPerspectiveBackdrop`（2026-05-04）
- `AtmosphereContext` 的 `uniform.setGroup(renderGroup)`（2026-05-24）
- `precompute.ts` / `runtime.ts` / `multiscattering.ts` /
  `ShadowLengthSampleLocations.ts` 的 `.uniformFlow()`（2026-05-27）
- `STBNTextureNode` 的 `dataPromise ??=` 单次加载（2026-05-16）
- `SkyEnvironmentNode` 的 `distanceThreshold=1000`、`angularThreshold=0.1°`、
  LUT `update` 事件、PMREM 阈值更新（2026-05-05）
- Hillaire 多重散射 LUT、`ShadowLengthNode`（epipolar 体积阴影）、
  `raymarchScattering` / `accurateShadowScattering`、反转深度、
  `moonScattering`（0.19.0）
- LUT 默认尺寸 transmittance 256×64、irradiance 64×16、multiscattering 64×64

上游 0.15→0.19.1 的优化几乎都是 WebGPU 大气：Hillaire 多散射 LUT 取代 4D
LUT 内的逐步高阶散射、4D LUT 只存单次 Rayleigh、PMREM 生成优化、LUT
缩尺寸、TAA 子像素校正、ShadowLengthNode、uniform groups/flow。云主包
（WebGL）0.7.x 只修 log-depth 与依赖，**没有算法优化**；0.5.0 的时域
上采样重投影修复（2025-08）也已在本地。

## 剩余未移植项（非核心，本地不存在）

- `ScreenSpaceShadowNode`、`StorageTexture3DNode`、`debug.ts`（core 专有，本地不存在）
- `sampling.ts` 的 `textureCatmullRom`（本地不存在）
- `transformations.ts` 的 `depthToColor`/`turbo`（本地不存在）
- `generators.ts` 的 `equirectGrid`（本地不存在）
- `math.ts` 的 bvec 系列（本地有 `src/tsl/bvec.ts` 等价实现，不引用上游符号）

以上均不在云/大气主路径。

## 上游 issue / PR（2026-05-27 之后唯一的新东西）

| 编号 | 内容 | 对我们的影响 |
|---|---|---|
| [PR #118](https://github.com/takram-design-engineering/three-geospatial/pull/118) | three r185 起 `struct()` 不再暴露 `.layout` | 本地 `src/tsl/FnLayout.ts` 已用 `.name` 适配，r187 正常；无需该 PR |
| [#115](https://github.com/takram-design-engineering/three-geospatial/issues/115) | WebGL2 + ANGLE D3D11：aerial perspective raymarch 45–73ms/帧（循环内隐式梯度 LUT/STBN 采样） | **已实施（2026-11-15）**：`AtmosphereLUTNode` 六个 LUT 节点与 `stbnTexture` 构造期设 `levelNode = float(0)`（`src/atmosphere/AtmosphereLUTNode.ts`、`src/tsl/STBNTextureNode.ts`），单测 `test/lutLevelNode.test.ts`；WebGL2/WebGPU 实机 A/B mean 1.1–1.5/255，低于同代码两次运行的 2.1/255 噪声；生成的 GLSL 中 LUT 采样为 `textureLod(..., 0.0)` |
| [#114](https://github.com/takram-design-engineering/three-geospatial/issues/114) | 同后端 irradiance LUT 计算错误，夜面过亮 | 上游无修法；若支持 Windows WebGL2 fallback 需评估烘焙表或绕开 ANGLE D3D11 |
| [#116](https://github.com/takram-design-engineering/three-geospatial/issues/116) | WebGL2 启动时 LUT 首帧前被采样，纹理删除竞态 | **已实施（2026-11-15）**：`AtmosphereLUTNode.setup` 在 `textures.setup()` 后调用 `textures.initRenderTargets(renderer)`；WebGL 子类按 `combinedScatteringTextures` / `higherOrderScatteringTexture` 预分配 5 或 6 个 target，WebGPU 为 no-op；单测 `test/lutRenderTargets.test.ts`；实机探针确认 setup 阶段恰好初始化 transmittance / multipleScattering / scattering / higherOrderScattering / irradiance |
| [#107](https://github.com/takram-design-engineering/three-geospatial/issues/107) / [#108](https://github.com/takram-design-engineering/three-geospatial/issues/108) | 移动端 `GPUCommandEncoder.finish` 错误；WebGL fallback shader 错误（`ShadowLengthNode` 对 `sampler2DShadow` 做 `texelFetch`） | 移动端/WebGL2 风险登记 |

运行时重建黑屏（2026-11-15 已修）：`patchTheme({ atmosphere: {
atmosphereParams } })` 触发 `AtmosphereSystem.rebuildAtmosphere()` 后，旧实现
先 dispose 旧 context、立刻发布新 context 并重建 VRM，但新 LUT 是异步、
分片计算的；按需渲染的地图只出一帧，采样到未初始化的表后停帧，黑屏会一直
保留（GUI 正常、context 未丢）。修复为两阶段：先离线构建新 context 并用
`AtmosphereLUTNode.initialize()` + `refreshTextures()` 把新表算完，再发布
context、dispose 旧 context、置 `vrm.needsUpdate`；并用
`m_atmosphereRebuildGeneration` 防止连续改参时旧任务覆盖新任务。实测单次
切换 ~160ms、连续两次 ~571ms，画面不黑且最后一次参数生效；初始加载路径
不受影响。代价是计算期间仍显示旧大气（刻意为之，避免闪黑）。

## 快速复查（无需 gh 登录）

```bash
curl -s https://api.github.com/repos/takram-design-engineering/three-geospatial \
  | python3 -c "import sys,json; d=json.load(sys.stdin); print(d['pushed_at'])"
curl -s "https://api.github.com/repos/takram-design-engineering/three-geospatial/commits?per_page=5" \
  | python3 -c "import sys,json; [print(x['commit']['author']['date'], x['commit']['message'].splitlines()[0]) for x in json.load(sys.stdin)]"
curl -s "https://registry.npmjs.org/@takram%2Fthree-atmosphere" \
  | python3 -c "import sys,json; print(json.load(sys.stdin)['dist-tags'])"
```

只有 `pushed_at` 晚于 2026-05-27 或 npm 出现 >0.19.1 时才需要重新做文件级
diff。重点看 `packages/atmosphere/src/webgpu/` 与分支 `webgpu/clouds`；不要
把 `packages/clouds/src/` 的 WebGL 改动当成可移植优化——它是行为基准，不是
WebGPU 实现。

## 参考定位

- **可抄的代码**：基本没有，已对齐。
- **行为基准**：上游 WebGL 云（`packages/clouds/src/shaders/`）仍是本地 TSL
  云的 A/B oracle（已冻结、稳定）。
- **思路来源**：上游 README 路线图（crepuscular rays、透明/透射材质、
  TAA + 屏幕空间阴影）与 Hillaire / Nubis / Schneider 论文。
- **免费 QA**：上表 issue 的 workaround 与量化数据。
