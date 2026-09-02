# navara 效果移植分析与 Color Grading LUT 设计

> 记录日期：2026-09-02
> 参照项目：`/Users/wh/github/navara`（navara_three / navara_three_default_descs）
> 目标仓库：flywave.gl（three/webgpu + TSL）
>
> **状态更新（2026-09-02）**：Color Grading LUT 第一步（Phase 1）已实现并合入
> `feature/webgpu-support` 分支。实现与本文设计的差异见 [§9 实现记录](#9-实现记录2026-09-02)。

本文档记录 navara 项目中四种后处理/场景效果的技术方案，对照 flywave.gl
现状给出差距结论；并给出第一个移植目标 **Color Grading LUT** 的详细设计
（第一步）。

---

## 目录

1. [四种效果对比总览](#1-四种效果对比总览)
2. [Color Grading LUT（navara 实现）](#2-color-grading-lutnavara-实现)
3. [Rain & Snow（navara 实现）](#3-rain--snownavara-实现)
4. [Fog Light（navara 实现）](#4-fog-lightnavara-实现)
5. [SSR Water Reflection（navara 实现）](#5-ssr-water-reflectionnavara-实现)
6. [差距结论与移植优先级](#6-差距结论与移植优先级)
7. [Color Grading LUT 移植设计（第一步）](#7-color-grading-lut-移植设计第一步)
8. [后续阶段规划](#8-后续阶段规划)

---

## 1. 四种效果对比总览

| 效果 | navara 状态 | flywave.gl 现状 | 差距 |
|---|---|---|---|
| Color Grading LUT | 完整（3D LUT 查找表，10 个预设） | 仅 brightnessContrast / hueSaturation / sepia 线性调色 | 🔴 缺 LUT 机制 |
| Rain & Snow | 完整（雨/雪粒子 + 屏幕水滴折射 + 湿地面） | 完全没有 | 🔴 空白 |
| Fog Light | 完整（体积雾散射 + 多光源 + tiled culling） | 仅场景级 FogExp2 + 云层 light shafts | 🟡 缺光源体积散射 |
| SSR Water Reflection | 完整（DDA + cone tracing + G-Buffer） | 完全没有（也无 G-Buffer 管线） | 🔴 空白 |

---

## 2. Color Grading LUT（navara 实现）

### 2.1 架构

navara 封装了 `postprocessing` 库的 `LUT3DEffect`：

- **核心类**：`web/navara_three_default_descs/src/effects/colorGradingLUT.ts`
  （`ColorGradingLUT extends Effect<LUT3DEffect>`）
- **描述符**：`src/effects/ColorGradingLUTEffectDesc.ts`
  （`insertBefore = ["smaa", "fxaa", "final"]`，即最终调色在 AA 之前）
- **管线**：`postprocessing` 库的 EffectComposer，HalfFloatType 帧缓冲。

### 2.2 LUT 加载（三种格式）

| 格式 | 加载器 | 说明 |
|---|---|---|
| `.cube` | three `LUTCubeLoader` | 产出 3D 纹理数据，转 `LookupTexture` |
| `.3dl` | three `LUT3dlLoader` | Adobe 格式，同上 |
| `.png/.jpg/.jpeg` | `TextureLoader` | 2D 平铺 LUT，size = cbrt(width×height)，须为整数 |

加载完成后统一转成 `LookupTexture`（postprocessing 库的 Data3DTexture 封装），
`generateMipmaps = false`，替换旧纹理后发 `needsUpdate` 事件触发管线刷新。
初始状态用 `LookupTexture.createNeutral(8)`（8³ 中性 LUT）占位。

### 2.3 参数

- `url`：LUT 文件地址
- `blendMode`：postprocessing 的 30+ 混合模式（colorBurn / screen / overlay 等）
- `opacity`：0–1，混合不透明度（默认示例 0.78）

### 2.4 预设资源（LUT_DATASETS）

`example/helpers/constants.ts` 中 10 个预设，均为远程 URL：

- presetpro-cinematic.3dl（pmndrs/postprocessing demo 资产）
- django-25.cube（pmndrs）
- Blackmagic 4.6K Film to Extended Video v4.cube（imnz730/LUTs）
- 7 个 RawTherapee 胶片模拟 PNG LUT（takram three-geospatial）：
  Fuji 160C / Fuji 800Z / Fuji FP-100C / Kodak E-100 GX / Agfa Vista 200 /
  Agfa Precisa 100 / Agfa Ultra Color 100

**已移植**：全部 10 个文件已下载至
`@flywave/flywave-map-theme/resources/lut/`（含 `ATTRIBUTION.md` 版权记录）。

---

## 3. Rain & Snow（navara 实现）

三套独立系统：

### 3.1 雨（世界空间 billboard 粒子）

- `shaders/glsl/rain.vert.glsl` + `rain.frag.glsl`；
  `src/meshes/rain.ts`（491 行）、`RainMeshDesc.ts`
- 5000 个 billboard quad，圆柱内均匀分布（sqrt 随机）；
  顶点着色器 `fract(y - time*speed)` 循环下落；
  相机跟随 + 模运算包裹实现无限滚动；FOV 缩放保持视觉尺寸一致；
  方向光 Lambert 光照（亮面 alphaMax 0.5 / 暗面 alphaMin 0.05）；
  海拔渐隐（maxHeight 3000，防止高空看到雨带）。

### 3.2 雪（世界空间 point sprite）

- `src/meshes/snow.ts`（533 行），`SnowPointsMaterial` 用
  `onBeforeCompile` 注入内置 points shader
- 30000 点精灵，径向渐变 32×32 canvas 贴图；
  三轴正弦风漂移（振幅 movementStrength / 频率 movementSpeed，
  按粒子索引错相）；同样的相机跟随包裹与海拔渐隐。

### 3.3 屏幕水滴（镜头雨滴折射后处理）

- `shaders/glsl/rainDropEffect.frag.glsl`（178 行，源自 Shadertoy MlfBWr）；
  `RainDropPostEffect.ts`（329 行）
- 多层网格（1–6 层，默认 4）由大到小生成水滴；噪声扰动位置；
  正弦波形状 + fractal time 淡入淡出；法线扰动 UV 折采样背景色。

### 3.4 湿地面 / 水洼（与 SSR 联动）

- `example/pages/ssr-puddle/puddleGeometry.ts`（351 行）
- 全屏 pass 改写 MRT G-Buffer：水洼中心圆域内法线压平到大地 UP、
  reflectivity(B 通道) 拉高、roughness(A 通道) 压低，
  仅作用于朝上面（`dot(viewNormal, upView)` smoothstep 门限）；
  SSR 用改写后的 G-Buffer 即可在水洼处产生反射。

**flywave.gl 现状**：无任何天气/降水实现（仅云天气纹理，与降水无关；
threejs-particle-system 示例是 nebula 火焰，不通用）。

---

## 4. Fog Light（navara 实现）

体积雾散射 + 点光源系统（路灯在雾中形成光晕）：

- **着色器**：`shaders/glsl/fogLight.frag.glsl`（242 行）——逐像素从深度重建
  世界坐标，对每个相关光源做视线 ray 到光源最近距离 h 的解析散射积分
  （atan 公式，参考 ijdykeman simple_fog_shader），halo 衰减
  `1/(1 + h*haloFalloff)`；可选表面光照（延迟 Lambert BRDF，用法线
  G-Buffer，Unreal 式窗口距离衰减）。
- **CPU tiled culling**：`effects/fogLight/tileGrid.ts`（658 行）——
  屏幕分块（32px tile），光源投影到 NDC 覆盖块，按贡献度
  （intensity × range / distance）排序，每 tile 上限 64 光源
  （二叉最小堆淘汰），被淘汰光源折入 residual haze（跨 tile 双线性）。
- **性能**：`FogLightDownsampledPass.ts`（285 行）——默认 1/4 分辨率渲染雾，
  深度感知 joint bilateral 上采样回全分辨率（防轮廓光晕）。
- **参数**：lights[]（ECEF 位置/颜色/强度/半径）、fogDensity(5)、
  useSurfaceLighting、downsample(4)、maxLightsPerTile(64)、haloFalloff(0.1)、
  debugShowGrid。
- **插入点**：`insertBefore = ["transparent"]`，需要 normal G-Buffer。

**flywave.gl 现状**：`MapViewFog`（THREE.FogExp2 场景雾，Theme fog 配置）、
云层 light shafts（shadow length 纹理进 AerialPerspectiveNode）、
完整大气散射（Rayleigh+Mie）。**没有**光源体积雾散射——即不存在的
是「点光源照亮雾气」的效果，与场景雾是两回事。另注意 navara 还有一个
Rust/WASM 的 LOD Fog（瓦片遍历优化用的密度 SSE 松弛，非视觉雾），
flywave.gl 的 clip plane / SSE 体系是否需要同类机制是独立议题。

---

## 5. SSR Water Reflection（navara 实现）

基于 kode80 SSR（takram 移植）+ Stachowiak 2015 cone tracing 的多 pass 体系：

- **G-Buffer（MRT）**：所有内置材质经 `overrideMaterialsForMRT.ts` patch，
  法线缓冲编码 = RG 八面体法线 + B reflectivity/metalness + A roughness。
- **SSR 光线步进**：`shaders/glsl/ssr.frag.glsl` —— 屏幕空间 DDA 步进
  （200 迭代）+ 二分精炼（4 步）；近处 stride 1、远处按
  pixelStrideZCutoff 缩放；interleaved gradient noise 抖动；
  reflectivity < 0.01 跳过；多重淡出（迭代数/屏幕边缘/视线角/距离）。
  分辨率 0.5×，线性上采样。地图引擎参数体系（`ssr/effect.ts`）：
  pixelZSize 100、pixelStride 5、maxRayDistance 5000（大尺度场景调校）。
- **Cone tracing**（默认开）：`coneTracing.frag.glsl`（265 行）——
  邻域 resolve（bilateral 核，把二值 hit/miss 转连续覆盖）+
  mip 化颜色缓冲按锥角采 `textureLod`，实现粗糙度模糊反射；
  Schlick Fresnel（ior 0xeeeeee）。
- **水面集成**：瓦片 shader 水面分支写 G-Buffer
  （ior 1.333、reflectivity 0.02、roughness 0.2）+ 4 倍频动态法线贴图
  扰动（`water_pars_fragment.glsl`）；quantized-mesh ocean 像素经
  watermask 自动获得默认反射属性。
- **合成**：`ssrEffect.frag.glsl` premultiplied alpha 混合。

**flywave.gl 现状**：无 SSR、无 G-Buffer MRT 管线；水面仅有示例级
`WaterMaterial`（解析 Fresnel + 动态法线高光，无环境反射）和
quantized-mesh watermask 数据层。**移植 SSR 的前置条件是先建 G-Buffer
管线**，工程量大，建议单独立项。

---

## 6. 差距结论与移植优先级

| 优先级 | 效果 | 理由 |
|---|---|---|
| **P0** | Color Grading LUT | 纯后处理单 pass，无 G-Buffer 依赖；资源已就位；与现有 colorGrading 节点自然融合；地图「整体氛围/风格化」收益立竿见影 |
| P1 | Rain & Snow | 世界空间粒子 + 可选屏幕水滴，可完全用 TSL 实现；无 G-Buffer 依赖（湿地面除外）；跟随相机 + geo UP 对齐模式与 flywave 相机体系兼容 |
| P2 | Fog Light | 需要世界坐标重建（深度纹理已有）与多光源数据上传；CPU tiled culling 可简化为小光数组起步 |
| P3 | SSR Water | 前置依赖 G-Buffer（MRT）管线建设，工程量最大 |

---

## 7. Color Grading LUT 移植设计（第一步）

### 7.1 设计原则

- **纯 TSL 实现**（铁律 6）：不引入 `postprocessing` 库，LUT3DEffect 的
  核心逻辑（域映射 + 三线性采样 + 不透明度混合）用 TSL 节点重写。
- **不重建渲染管线**（参照 bloom 动态增删的修复方向
  cb88b6e2）：LUT 纹理用**固定 uniform 槽位**，初始 8³ 中性 LUT，
  异步加载完成后仅替换 `.value`，不动 node graph。
- **资源走全局解析链**（与云资源一致）：
  `flywave-map-theme/resources/lut/**` 经 `createAssetsConfig` 拷贝到
  `dist/resources/lut/**`，运行时 URL 由 `FLYWAVE_BASE_URL`
  （`mapAssetsUriResolver` / 聚合包，或独立包 `resolveResourceUrl`）
  解析。业务代码只写相对路径 `"resources/lut/xxx.png"`，
  MapView 内部经 `uriResolver.resolveUri()` 补全——与主题天空盒
  `Sky_px.png` 同一机制。

### 7.2 资源侧（已完成）

```
@flywave/flywave-map-theme/resources/lut/
├── ATTRIBUTION.md                            # 版权与来源记录
├── presetpro-cinematic.3dl                   # 电影感（postprocessing demo）
├── django-25.cube                            # Django 调色（RocketStock）
├── blackmagic-4.6k-film-extended-video.cube  # Blackmagic 影视
├── fuji-160c.png                             # RawTherapee 胶片模拟 ×7
├── fuji-800z.png
├── fuji-fp100c.png
├── kodak-e100-gx.png
├── agfa-vista-200.png
├── agfa-precisa-100.png
└── agfa-ultra-color-100.png
```

注意：`resources/` 会整体进发布包（`files: ["dist/**"]`），
LUT 文件总体积应控制在此约束内（当前 ~几 MB，可接受）。

### 7.3 协议侧（`@flywave/flywave-datasource-protocol`）

`PostEffects.ts` 新增：

```ts
export interface IColorGradingLUTEffect {
    enabled: boolean;
    /**
     * LUT 文件地址。支持相对路径（经 MapView uriResolver 解析到
     * `resources/lut/**`）与绝对 URL。格式：.cube / .3dl / .png / .jpg。
     */
    url: string;
    /** 混合不透明度 0-1，默认 1。第一步仅 normal（lerp）混合。 */
    opacity?: number;
}
```

`PostEffects` 接口加 `colorGradingLUT?: IColorGradingLUTEffect`。
第一步不做 `blendMode`（见 §8）。

### 7.4 TSL 实现侧（`flywave-mapview/src/composing/vrm/effects/colorGradingLUT.ts`）

#### 纹理加载 `loadLut3d(url): Promise<Data3DTexture | DataTexture>`

| 格式 | 加载方式 | 产物 |
|---|---|---|
| `.cube` | `three/examples/jsm/loaders/LUTCubeLoader.js` | `Data3DTexture`（loader 已产出，直接用 `t.texture3D`） |
| `.3dl` | `three/examples/jsm/loaders/LUT3dlLoader.js` | 同上 |
| `.png/.jpg` | `three/webgpu` `TextureLoader` → ImageData | 手工重排为 `Data3DTexture`（LUT PNG 是 2D 平铺：size=cbrt(w×h) 须整数，按行主序重排 [r][g][b]） |

统一约束：`type = UnsignedByteType`（8bit LUT 足够）、
`colorSpace = SRGBColorSpace`（LUT 采样发生在输出空间，见 7.6）、
`generateMipmaps = false`、min/mag = LinearFilter（WebGPU 3D 纹理硬件
三线性）。模块级 `Map` 按解析后 URL 缓存（参照 `CloudTextures.load`）。

#### TSL 采样节点

```ts
// 固定纹理槽位：初始 neutral 8³，加载后换 value，不改 graph
const lutTexture = uniform(new THREE.Data3DTexture(neutralLutData, 8, 8, 8));

export const colorGradingLut = (inputNode, lutTexture, opacity = 1) =>
    Fn(() => {
        const color = inputNode.rgb.toVar();
        // postprocessing LUT3DEffect 的域映射：[0,1] 映到 texel 中心
        // scale = (N-1)/N, offset = 0.5/N（N 从纹理取）
        const uvw = color.mul(domainScale).add(domainOffset).toVar();
        const graded = texture3D(lutTexture, uvw).rgb;
        return vec4(mix(color, graded, uniform(opacity)), 1);
    })();
```

- `domainScale/domainOffset` 随纹理替换一并更新（uniform，不是常量），
  避免不同 size LUT 换用时采样错位。
- `texture3D` 线性过滤即硬件三线性插值，等价 postprocessing
  `LUT3DEffect` 默认路径（tetrahedral 是可选优化，第一步不做）。

#### 代码结构

```
colorGradingLUT.ts
├── createNeutralLutData(size = 8)     # 中性 LUT Float/Uint8 数组
├── loadLut3d(url)                     # 三格式加载 + 缓存，Promise<Data3DTexture>
├── colorGradingLut(inputNode, texUni, opacity)  # TSL Fn
└── ColorGradingLutController          # 见下
```

**Controller**（与 TSL 节点解耦的运行时管理，供 ViewRenderManager 持有）：

- 持有 uniform 纹理槽位 + opacity uniform + domain scale/offset uniforms；
- `async setLut(url)`：解析 URL（传入 resolve 函数）→ loadLut3d →
  换 `.value` + 更新 scale/offset uniforms → 置 `needsUpdate`；
- `dispose()`：释放纹理与缓存。

### 7.5 ViewRenderManager 接入

1. `IViewRenderConfig`（ViewRenderTypes.ts）加
   `colorGradingLUT?: { enabled: boolean; url: string; opacity: number }`；
   默认 `enabled: false`。
2. `buildNodeGraph` 在 `sepia` 之后、translucentLayer/dithering 之前插入：

   ```ts
   if (this.config.colorGradingLUT?.enabled) {
       finalNode = colorGradingLut(finalNode, this.lutController.textureUniform,
                                   this.config.colorGradingLUT.opacity ?? 1);
   }
   ```

   放在最后的原因：LUT 是「成片调色」，应在全部解析调色
   （brightness/contrast/saturation/sepia）之后整体套用；而
   translucentLayer 是功能性混合（地下透视），dithering 是输出防带，
   都应在 LUT 之后。
3. **config 更新流程**（异步纹理是关键差异）：
   `applyConfig` 发现 `colorGradingLUT.url` 变化 → Controller.setLut()
   异步加载 → 完成后置 `needsUpdate = true` 触发一次重建（因为
   enabled false→true 需要改 graph；已 enabled 时仅换纹理 value 的
   路径不重建 graph）。加载期间保持 neutral LUT（无视觉突变）。
4. MapView 侧把 `postEffects.colorGradingLUT.url` 先经
   `m_uriResolver.resolveUri()` 再下发（相对路径落在
   `resources/lut/**`），与主题天空盒解析同一条链。

### 7.6 颜色空间注意

（初稿此处判断有误，实测修正：）LUT 节点虽然位于 tone mapping 之后，
但该处仍是**线性工作域**——管线的 sRGB 输出变换（`outputColorTransform`）
在 dithering 之后的最终 pass 才发生。LUT 文件是 sRGB 显示域制作，
**直接拿线性值查表会明显偏色**（实测：紫色 0x9b59b6 被查成粉色）。
最终实现：查表前 `sRGBTransferOETF`（线性→sRGB）、查表后
`sRGBTransferEOTF`（sRGB→线性）再混回——与 postprocessing
`LUT3DEffect` 的 in/out 域转换同语义。

### 7.7 验收标准（第一步）

1. 示例（`flywave-examples` 新增 `color-grading-lut` demo，glob 自动发现）
   中切换 10 个预设 LUT，画面即时换风格，无需重建 MapView；
2. `opacity` 0–1 连续调节平滑；
3. `FLYWAVE_BASE_URL` 自托管与 CDN 默认两种模式下 LUT 均可加载；
4. WebGPU 与 WebGL2（forceWebGL 回退）下 `texture3D` 均可用
   （WebGL2 支持 `sampler3D` 线性过滤，TSL `texture3D` 会生成对应 WGSL/GLSL）；
5. 关闭 `enabled` 后画面与未加效果时逐像素一致（中性 LUT 或跳过节点）。

---

## 8. 后续阶段规划

| 阶段 | 内容 |
|---|---|
| Phase 2 | `blendMode`（先移植常用子集：normal/multiply/screen/overlay/softLight/colorBurn 等，TSL Fn 实现混合函数 × opacity） |
| Phase 3 | Inspector GUI（FogGUIModule 同款 dat.GUI 面板：预设选择 + opacity 滑杆 + 实时预览） |
| Phase 4 | LUT 生成工具（从 brightnessContrast/hueSaturation/sepia 参数烘焙出 LUT，统一到单一机制） |
| 之后 | Rain & Snow（P1，粒子系统 TSL 化 + geo UP 对齐 + 相机跟随包裹）→ Fog Light（P2，先小光源数组后 tiled culling）→ SSR（P3，先建 G-Buffer 管线） |

---

## 9. 实现记录（2026-09-02）

Phase 1 落地涉及的文件与设计偏差：

| 文件 | 变更 |
|---|---|
| `flywave-datasource-protocol/src/PostEffects.ts` | 新增 `IColorGradingLUTEffect { enabled, url, opacity? }`，`PostEffects.colorGradingLUT` |
| `flywave-mapview/src/composing/vrm/effects/colorGradingLUT.ts` | **新文件**：中性 LUT 生成、三格式加载（three r185 自带 `LUTCubeLoader`/`LUT3dlLoader`/`LUTImageLoader`，均产出 `Data3DTexture`，无需手写 PNG 重排）、模块级 URL 缓存、TSL `colorGradingLut` Fn、`ColorGradingLutController`（持久 `texture3D` 节点槽位 + domain scale/offset/opacity uniforms，`setLut` 换 `.value`） |
| `flywave-mapview/src/composing/vrm/ViewRenderTypes.ts` | `IViewRenderConfig.colorGradingLUT`（必有字段）+ `IViewRenderManager.onNeedsRender?` 钩子 |
| `flywave-mapview/src/composing/vrm/ViewRenderManager.ts` | config 默认值；`buildNodeGraph` 在 sepia 后插入 LUT 节点；URL diff 触发异步 `setLut`；`dispose` 释放 controller |
| `flywave-mapview/src/composing/MapRenderingManager.ts` | `colorGradingLUT` 状态槽位 + `syncConfigToViewRenderManager` 同步 |
| `flywave-mapview/src/MapView.ts` | `setPostEffects` 重置/应用 LUT（相对路径经 `m_uriResolver.resolveUri`，http/data/blob 直通）；**`isDynamicFrame` 补充 `vrm.needsUpdate` 条件** |
| `flywave-mapview/src/composing/AtmosphereSystem.ts` | `init2` 接线 `vrm.onNeedsRender = () => mapView.update()` |
| `flywave-examples/src/color-grading-lut/` | 新示例：10 预设下拉 + enabled/opacity dat.GUI，`patchTheme` 热切换 |
| `flywave-map-theme/resources/lut/` | 10 个 LUT 文件 + ATTRIBUTION.md（12MB） |

### 设计偏差与新增机制

1. **加载器**：设计原定 PNG 手工重排，实际 three r185 的 `LUTImageLoader`
   原生支持横/竖条带 PNG/JPG → 直接复用三个官方加载器。
   **（实现后修正，见 §9.1 根因记录）**：`LUTImageLoader` 只支持条带布局，
   会把网格布局 PNG 误判成巨型立方体导致 `GPUOutOfMemoryError`，
   PNG 分支最终为手工实现（`loadLutImage`），网格/条带通吃。
2. **帧调度缺口修复**：异步加载完成置 `vrm.needsUpdate` 后，静态地图下
   `isDynamicFrame` 原本不看该标志、也无 rAF 在飞 → 换 LUT 不重绘。两处修复：
   - `MapView.isDynamicFrame` 增加 `viewRenderManager?.needsUpdate === true`；
   - VRM 新增 `onNeedsRender` 钩子（AtmosphereSystem 接到 `mapView.update()`），
     覆盖「无帧在飞」的场景。
3. **管线重建策略**：与设计一致——URL 变化仅换 uniform 纹理值不重建 graph；
   换纹完成后置 `needsUpdate` 触发一次重建以保险（needsUpdate 是唯一重绘
   触发器，与 outline `updateOutline` 同一代价级别）。`enabled` 切换本来就是
   graph 重建。
4. **颜色空间**：初版按「输出空间直接查表」实现，目检发现明显偏色
   （紫色变粉）——根因是该处仍是线性工作域（见 §7.6 修正）；已加
   查表前后 `sRGBTransferOETF/EOTF` 域转换。LUT 纹理数据本身保持
   NoColorSpace 原样采样。
5. **验证状态**：datasource-protocol / mapview / 聚合包 / examples 四级 tsc
   编译通过；包测试链与渲染回归链在本环境断（见 testing-workflow 勘察），
   **尚未做浏览器目检**——`pnpm start` 打开 color-grading-lut 示例验证。

### 9.1 根因记录：LUT PNG 网格布局 vs three LUTImageLoader（2026-09-02 目检发现）

首次浏览器目检报 WebGPU 错误链：`CreateTexture` → `GPUOutOfMemoryError:
Failed to allocate texture` → `WriteTexture: Data offset is too large` →
含 e3D 绑定的 `bindGroup_object` 全链失效。

- **根因**：takram/RawTherapee 系 LUT PNG 是 **1728×1728 的 Hald 式网格
  布局**（144³ 立方体展平为 12×12 格 × 144px），而 three r185 的
  `LUTImageLoader` 只支持**条带布局**，取 `min(width, height)` 当立方体
  边长 → 试图创建 **1728³ × 4B ≈ 2.3TB** 的 3D 纹理。navara 自己用
  `cbrt(width × height)` 所以不受影响。
- **二分定位**（无头 Chrome + `?lut=off` / `?lut=neutral` 查询参数）：
  LUT 关闭 / 仅中性 8³ 均零错误 → 锁定异步加载换入的纹理；
  黄金示例 post-processing-effects 零错误 → 排除大气/云既有问题。
- **修复**：放弃 `LUTImageLoader`，`loadLutImage()` 手工转换——
  `size = cbrt(w×h)`（须整立方），像素线性序即立方体展平序
  （r 最快、b 最慢），重排进 `Data3DTexture`；条带与网格布局通吃，
  `colorSpaceConversion: "none"` 保持原始 sRGB 字节。
- **验证**：修复后 `?lut=off` / `?lut=neutral` / 默认（Fuji 160C）三态
  均零 GPU 错误；`3dtiles-animation.html` 挂 Django 25 (.cube) 同样零错误。
- **复现/调试工具**：color-grading-lut 示例支持
  `?lut=off`（禁用）/ `?lut=neutral`（只建图不加载文件）查询参数。

### 9.2 根因记录：PNG LUT 全系彩色噪点——颜色字节值误当网格坐标（2026-09-02）

§9.1 修复 OOM 后出现第二层问题，症状极具迷惑性：**所有 PNG 预设花屏
（彩色噪点），所有 .cube/.3dl 预设正常**；连与正常的 django-25.cube
内容完全相同、尺寸也相同的 32³ 测试 PNG 都花屏——数据内容、尺寸、
纹理属性（format/type/filter/wrap）逐一比对均无差异。

- **真正根因**：`loadLutImage()` 重排循环把像素的**颜色通道字节值**
  （0~255）当成了**网格坐标**（0~size-1）计算目标下标：
  `dst = ((b*size + g)*size + r) * 4`，其中 b/g/r 取自 `pixels[src]`。
  size=32、蓝色字节=128 时 dst≈54 万，远超表长 131072。**JS 对
  `Uint8Array` 越界写入是静默丢弃（spec 行为，不抛错）**——结果表的大
  部分保持 0，小值像素又错位散落写坏其它格：上 GPU 的就是一张稀烂的
  表，采样即彩色噪点。
- **为何长时间漏掉**：越界无异常；早期"Python 验证通过"验证的是算法/
  文件内容而非运行时字节；浏览器探针比对的是内容而非重排逻辑。最终
  由离线 Python 复算时 `bytearray` 越界**抛错**（JS 静默、Python 抛错
  的行为差异）暴露。
- **修复**：2D LUT 图的行主序线性像素序**本身就是** r 最快的扁平表
  （竖条带 w=size 与 Hald 网格 w=h 都是）——恒等拷贝、仅强制 alpha=255；
  横条带（w=size²、h=size）是 b 最快编码，保留 `src = b*size² + g*size + r`
  重排。
- **顺带的合规整改（系统规则：禁止裸 `import from "three"`）**：删除
  three/addons 的 `LUTCubeLoader`/`LUT3dlLoader` 引用（其内部
  `import from 'three'`，且 examples import map 中 `three` 与
  `three/webgpu` 是**两个独立模块实例**），.cube/.3dl 文本解析内置进
  `colorGradingLUT.ts`（截断量化、3dl 的 b 最快序 + 位深归一化与官方
  loader 逐字节对齐）；示例 `Matrix4` 改从 `three/webgpu` 导入。
- **调试手段（排查期临时使用，随修复移除）**：
  - 运行时表 FNV-1a 校验和（解析后、上传前打印），与离线脚本（同语义：
    截断量化/位深/重排/FNV）算出的期望值比对，堵住"验证没读运行时字节"
    的漏洞；
  - 固定 UVW 采样，区分"纹理坏"（仍花屏）与"输入色坏"（变纯色）；
  - `device.uncapturederror` 监听——WebGPU 验证错误（如 writeTexture
    布局非法）不抛异常只静默丢写入，不监听看不到。
- **验证**：用户浏览器实测全部 PNG 预设噪点消失、胶片调色正常。
