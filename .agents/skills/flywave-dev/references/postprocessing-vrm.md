# 后处理 / ViewRenderManager / 大气效果

后处理不在 renderer 上做——`renderer.toneMapping` 恒为 `NoToneMapping`，全部
效果在 **VRM（ViewRenderManager）的 TSL 节点图**里。VRM 由 `AtmosphereSystem`
在 `mapView.ready` 后创建（`AtmosphereSystem.ts` 的 `init2()`）——**没有
AtmosphereSystem 就没有 VRM**（planar 模式也会创建，只是效果禁用）。

核心文件：`@flywave/flywave-mapview/src/composing/vrm/ViewRenderManager.ts`、
`composing/MapRenderingManager.ts`、`composing/AtmosphereSystem.ts`；
配置类型：`@flywave/flywave-datasource-protocol/src/PostEffects.ts`、
`AtmosphereConfig.ts`、`Theme.ts`。

## 节点链实际顺序（语义即顺序，重排改变观感）

scene pass → **clouds** → **aerialPerspective**（含 CSM god rays 的
shadowLength；云必须在其前）→ **lensFlare** → **bloom**（输入是原始
colorNode × bloomIntensity MRT，不是 lensFlare 后的色彩；加法叠加）→
**toneMapping**（在 AA 前）→ **TAA/SMAA**（`antialiasing` 字段二选一）→
**outline**（独立 mask 预 pass 的深度形态学，见下节）→ vignette →
brightnessContrast → hueSaturation → sepia → **colorGradingLUT**（成片
调色在解析调色之后）→ translucent 合成 pass → dithering。

## Theme 配置面

```typescript
theme: {
    postEffects: {                        // 类型：PostEffects.ts
        bloom:      { enabled, strength, radius, luminancePassThreshold },
        outline:    { enabled(废弃,选中驱动), thickness, color,
                      xray(默认true), hiddenColor },
        vignette:   { enabled, offset, darkness },
        sepia:       { enabled, amount },
        hueSaturation: { enabled, hue, saturation },
        brightnessContrast: { enabled, brightness, contrast },
        colorGradingLUT: { enabled, url, opacity },   // 3D LUT 调色，见下节
        antialiasing: "none" | "taa" | "smaa"   // 互斥；旧 taa 布尔已废弃
    },
    toneMappingExposure: 3,               // VRM 默认
    toneMappingMode: "linear"|"reinhard"|"cineon"|"aces"|"agx"|"agx-punchy"|"neutral",
    lensFlare: { enabled, bloomIntensity, ghostIntensity, haloIntensity, glareIntensity },
    atmosphere: { ... }                    // 见下节；仅球面投影生效
}
```

注意 **clouds / lensFlare / aerialPerspective / toneMapping 不在 postEffects 里**
——它们在 `theme.atmosphere` / `theme.lensFlare` / `theme.toneMapping*`。
theme→VRM 字段名映射：`strength→intensity`、
`luminancePassThreshold→threshold`（`MapRenderingManager.syncConfigToViewRenderManager`）。

## 大气（AtmosphereThemeConfig，仅球面投影）

- `enabled`（总开关：sky/light/clouds/aerial 一起）、`sunTime`（Unix ms）、
  `sunTimeTransitionDuration`（默认 2000ms 平滑插值）、`clouds:
  boolean | CloudConfig`、`aerialPerspective: boolean | AerialPerspectiveConfig`
  （对象形式才细调，其内部布尔全默认 false）、`sunCastShadow`（**已废弃**，
  用 `Theme.enableShadows`）。
- `atmosphereParams`（rayleigh/mie 等）改动触发 LUT 重建（一次性卡顿）。
- moon/stars 无 theme 字段：`AtmosphereSystem.init2()` 硬编码开启，月面贴图
  从 `resources/moon/*.jpg` 加载。
- `CloudConfig`（`AtmosphereConfig.ts`）大而全：`quality`
  （low/medium/high/ultra）、`resolutionScale`（默认 4 = 1/4 分辨率 raymarch）、
  `coverage`（默认 0.3）、`layers[]`（每层 channel/altitude/densityScale…）、
  风/动画速度、haze、云影 CSM。已知声明不生效字段：`shadowMapSize`。

## 运行时 API

```typescript
// 正道：patchTheme（同步白名单覆盖 atmosphere/postEffects/toneMapping/lensFlare）
mapView.patchTheme({ atmosphere: { sunTime: Date.now() } });
mapView.patchTheme({ postEffects: { antialiasing: "smaa" } });

// sceneEnvironment（不是 environment）
mapView.sceneEnvironment.atmosphere.setCurrentDate(date, instant = false);

// 逐对象选择性 bloom（任何对象都可用，需全局 bloom.enabled 打开）
mapView.mapRenderingManager.addBloomObject(mesh);     // 材质挂 bloomIntensity MRT
mapView.mapRenderingManager.removeBloomObject(mesh);

// 逐数据源后效果（目前仅 3D Tiles 一条链路）
new CesiumIonDataSource({ ..., postEffects: { bloom: { enabled: true } } });
// 或 ds.setTheme({ postEffects: { translucentDepth: { enabled: true } } })  // 地下半透明
```

## Color Grading LUT（3D LUT 成片调色）

`effects/colorGradingLUT.ts`：LUT 文件是 sRGB 显示域，而节点链在该处仍是
线性工作域（管线的 sRGB 输出变换在 dithering 之后）——查表前后用
`sRGBTransferOETF`/`sRGBTransferEOTF` 做域转换（postprocessing
LUT3DEffect 同语义），**漏掉这一步会明显偏色**（紫色变粉之类）。**持久 `texture3D` 节点槽位**（初始 8³
中性 LUT）跨 graph 重建复用，`ColorGradingLutController.setLut()` 只换
`.value` + domain uniforms（scale=(N-1)/N, offset=0.5/N）不动管线；
`enabled` 切换才重建 graph。异步加载完成经 `onNeedsRender` 钩子
（AtmosphereSystem 接到 `mapView.update()`）补帧，静态地图也能看到换装。
URL 相对路径在 `MapView.setPostEffects` 里经 `m_uriResolver` 解析
（http/data/blob 直通）。

### 内置 LUT 资源（`@flywave/flywave-map-theme/resources/lut/`）

经 `createAssetsConfig` 拷到 `dist/resources/lut/**`，业务代码只写
`"resources/lut/<文件名>"`。版权记录在同目录 `ATTRIBUTION.md`（分发须保留）：

| 文件 | 风格 | 格式/布局 |
|---|---|---|
| `presetpro-cinematic.3dl` | 电影感（PresetPro） | 3dl，32³ |
| `django-25.cube` | Django 暖调电影（RocketStock） | cube，32³ |
| `blackmagic-4.6k-film-extended-video.cube` | Blackmagic 影视 | cube，33³ |
| `fuji-160c.png` | Fuji 160C 胶片模拟 | PNG 网格，144³ |
| `fuji-800z.png` | Fuji 800Z 胶片模拟 | PNG 网格，144³ |
| `fuji-fp100c.png` | Fuji FP-100C 即拍即现 | PNG 网格，144³ |
| `kodak-e100-gx.png` | Kodak E-100 GX 反转片 | PNG 网格，144³ |
| `agfa-vista-200.png` | Agfa Vista 200 负片 | PNG 网格，144³ |
| `agfa-precisa-100.png` | Agfa Precisa 100 反转片 | PNG 网格，144³ |
| `agfa-ultra-color-100.png` | Agfa Ultra Color 100 | PNG 网格，144³ |

PNG 系全部来自 RawTherapee 胶片模拟（takram three-geospatial 上游），
**Hald 式网格布局**（正方形，size³ = width×height，如 1728² = 144³）。

### 运行时用法

```typescript
// 主题 / patchTheme（正道）
mapView.patchTheme({ postEffects: { colorGradingLUT:
    { enabled: true, url: "resources/lut/fuji-160c.png", opacity: 1 } } });
// url 也接受绝对 http(s)/data/blob；新增预设 = 文件丢进 resources/lut/ +
// ATTRIBUTION.md 记一笔（换装不重建管线，enabled 切换才重建）
```

坑：**禁用 three 的 `LUTImageLoader` 处理网格 PNG**——它只认条带布局、
取 `min(w,h)` 当立方体边长，1728² 网格图会被当成 1728³ 立方体
（≈2.3TB 描述符 → `GPUOutOfMemoryError: Failed to allocate texture` +
`WriteTexture: Data offset is too large` 级联）。仓库自带 `loadLutImageTable()`
用 `cbrt(w×h)` + 恒等拷贝（竖条带/Hald 网格的行主序**就是** r 最快扁平
表），横条带（w=size²）做 b 最快→r 最快重排，网格/条带通吃。

坑 2（2026-09-02 彩噪事故，详见设计文档 §9.2）：**重排时严禁把颜色
字节值当网格坐标**——`dst = ((b*size+g)*size+r)*4` 里的 b/g/r 若取自
`pixels[]`（0~255），越界写 `Uint8Array` 会被 **JS 静默丢弃**，表烂成
噪点且无任何报错。凡手写重排，先用离线脚本（Python 同语义）比对校验和。

坑 3：**`.cube`/`.3dl` 解析内置在 `effects/colorGradingLUT.ts`，勿引
three/addons 的 `LUTCubeLoader`/`LUT3dlLoader`**——它们内部裸
`import from "three"`，违反「three 一律从 `three/webgpu` 导入」铁律，
且 examples import map 里两者是独立模块实例（纹理会跨类域）。

调试：color-grading-lut 示例支持 `?lut=off` / `?lut=neutral` 查询参数。
深挖纹理类问题时可临时加回三板斧（2026-09 彩噪事故用过，已随修复移除）：
运行时表 FNV-1a 校验和比对离线期望值（堵"验证没读运行时字节"漏洞）、
固定 UVW 采样（区分纹理坏 vs 输入色坏）、`device.uncapturederror` 监听
（WebGPU 验证错误静默丢写入，不监听看不到）。

## Fog Light（体积灯光光晕，2026-09-02 移植）

`effects/fogLight.ts`：navara fogLight 的 TSL 移植——逐像素对每盏灯做
视线解析散射积分（最近点 h² 的 halo 衰减 + `1-exp(-t·density)` 段内散射），
加性合成在 **bloom 之前、tonemapping 之前的线性域**。只做"灯在雾里的
光晕"，**不做环境雾**（环境雾仍归 FogExp2/aerial 体系）；遮挡不判（已知
瑕疵：楼后的灯光晕照样亮），光源 uniform 留了 `visibility` 槽位给未来
遮挡 pre-pass（CPU 侧预乘进 rgb，shader 不用改）。

**注册表用法**（人机接口照 bloom 的 add/remove）：

```typescript
// position 用 GeoCoordinates；投影成世界坐标的缓存在渲染端内部
// （vrm.fogLights: Map<def, Vector3>，公开类型上没有该字段）
mapView.addFogLight({ position: new GeoCoordinates(lat, lng, h),
                      color: 0xffb45c, intensity: 1.5, radius: 60 });
mapView.removeFogLight(def); // 同一对象身份
```

- **灯的增删改不重建管线**：固定 32 槽 uniform 数组（`FOG_LIGHT_CAPACITY`），
  `MapView.render` 每帧调 `vrm.updateFogLights(cameraPos, rteCamInv)` 重写
  槽位（世界系偏移 → 乘 RTE 相机逆矩阵 → **视空间**，与 shader 里
  `positionView` 同帧）；只有 `postEffects.fogLight.enabled` 开关才重建。
- 参数域（夜景城市 1.6–2.3km 视距实测）：radius 40–80m、intensity 1–2、
  density 0.002 起步。halo 是重尾衰减 `1/(1+h²/r²)`，radius 220m 能罩住
  半屏；intensity 是"每盏 × 全局"双乘，4 盏 × intensity 4 直接全屏过曝。
- 坑：**`uniformArray(..., "vec3")` 的数据在 `.array`（原始 Vector3 数组），
  `.value` 是 BufferNode 的 null**——写槽位要 `arr[slot].set(...)` 原地改，
  UniformArrayNode 每帧自动重传（`updateType = RENDER`）。
- 坑：**`theme.atmosphere.sunTime` 只在大气系统真正初始化后生效**
  （`updateOptions` 把 currentDate/targetDate 落好才有意义）；headless
  环境大气 context 常缺资源不初始化，太阳方向 uniforms 不会被写入，
  白天/黑夜切换的目检必须在真实浏览器做。
- 示例：`fog-light/`（夜景 + 4 盏冷暖灯 + sun hour/exposure/density GUI，
  `?night=off`、`?foglight=off` 查询参数）。

## 改 VRM 的注意事项

1. **类型不保护**：`ViewRenderManager.ts`、`AtmosphereSystem.ts`、
   `composing/vrm/effects/*.ts` 及 atmosphere 包全部 `@ts-nocheck`（证据：
   `_smaaNode?: ReturnType<typeof smaa>` 的 `smaa` 根本没 import）。tsc 不抓
   字段名错误，**改动必须实际渲染验证**。
2. **节点图重建很贵**：`needsUpdate` → 整条 pipeline dispose + 重建 + 着色器
   重编译。连续调参要先 diff 再置位（参考 `AtmosphereSystem.applyAtmosphereEnabled`
   的 `vrmChanged` diff 模式、cloud-mapview 示例的 "apply once until it sticks"）。
3. **相机是 RTE 相机**：新 pass 里 `camera.position` 恒为 0，需要 geo 位置走
   `mapView.camera` 或 pickDepth 反投影（铁律 1）。
4. **跨重建的有状态节点**：cloudNode/lensFlareNode 跨 buildNodeGraph 复用
   （要处理 `onReady`/`pendingConfig`/`onTexturesSwapped` 三个异步时序）；
   其余节点每链新建。新增有状态节点照 cloudNode 模式抄。
5. **改完调 `mapView.update()`**（铁律 3）。
6. **WebGL 回退差异**（`forceWebGL: true` 或无 WebGPU）：lensFlare 的 glare
   星芒分量静默缺失；TAA 的历史 depth 拷贝被跳过（WebGL 下
   `copyTextureToTexture` 抛错，精度受影响）；LUT 纹理格式按
   `OES_texture_float_linear` 探测分支。bloom/outline/调色/SMAA/agx 均可跑。

## 选择性描边（outline，X-ray 完整轮廓）

架构（2025-08 重做，替换旧的 `outlineMask` MRT 通道方案）：

1. **打标**：`mapRenderingManager.addOutlineObject(obj)` 给子树开
   `OUTLINE_LAYER_BIT`（bit 11，`TranslucentLayerEffect.ts`；bit 10 =
   translucent，bit 12 = splat 深度/surface capture）。**不动材质**。
2. **mask 预 pass**：`ViewRenderManager.buildNodeGraph` 在有选中对象时建
   第二个 `pass(scene, camera)`，`setLayers(bit 11)` +
   `overrideMaterial`（共享干净 MeshBasicNodeMaterial）。只有选中物体
   参与该 pass → 其深度 footprint 就是**完整投影剪影（含被遮挡部分）**，
   这就是 X-ray 的实现方式。
3. **形态学**：`vrm/effects/outline.ts` 对深度纹理做
   `dilate && !erode` 取环。"在剪影内" = `depth > 0`（**反转深度**，
   清空值 0）；`xray: false` 时逐 tap 再与主场景深度比较做遮挡剔除；
   `hiddenColor` 把环的被遮挡段涂成另一色。
4. 配置面：`IOutlineEffect`（PostEffects.ts），全局
   `mapView.postEffects.outline` / `patchTheme` / 运行时
   `mapRenderingManager.updateOutline(部分字段)`（会触发管线重建）。

## 坑：pass/深度采样三条硬规则（全部实测踩过）

1. **本引擎用反转深度缓冲**（`MapView.ts` 的 `reversedDepthBuffer: true`）：
   depth 清空值是 **0**（`Renderer.getClearDepth()` 返回 `1-clearDepth`），
   近处物体深度趋近 1。任何"depth < 1 = 有几何"的判断都是反的，必须写
   `depth > 0 = 有几何`；静默失效无报错，画面只是"效果消失"。
2. **后处理链里 `textureLoad()`（TSL `.load(ivec2)`）读到全 0**，连主
   pass 的 color/depth 都读不出来（WebGPU，r185）。读 RT 纹理一律用
   UV 采样 `textureNode.sample(uv)`，texel 中心 =
   `(floor(screenUV*size-0.5)+offset+0.5)/size`（参考
   `flywave-atmosphere/src/tsl/sampling.ts`、TAA）。TAA 内部能用 load
   是它自己的节点上下文，别照抄。
3. **无 MRT 的 pass 里渲染带自定义 `mrtNode` 的材质会崩**（WGSL
   "structures must have at least one member"，pipeline 创建失败）：
   `NodeMaterial` 在 `renderer MRT = null` 时用材质自己的 `mrtNode`
   替换整个片元输出。解法：给 pass 设 `overrideMaterial`（干净
   MeshBasicNodeMaterial），参考 buildingColor pass / outline mask pass。

另：`pass()` 复用同一 scene 渲染，**Background 不受 layers 控制**，子
pass 会把天空再画一遍（深度写到远平面、无视觉影响，但有一次天空着色
开销）——只有选中对象时才建 outline pass 就是为此。调试可用
`outline.ts` 的 `OUTLINE_DEBUG`（R/G/B = dilated/eroded/ring）。

## 坑清单（全部源码实证）

- **换一份 postEffects 时 outline 与 brightnessContrast 不在"先全关"
  清单里，旧值会残留**（`MapView.ts` 的 `setPostEffects`；outline 的
  enabled 本就由选中驱动，thickness/color/xray/hiddenColor 经
  `updateOutline` 全量合并）。
- **AA 默认值不一致**：VRM 默认 `"taa"`，MapRenderingManager 默认 `"none"`，
  首次 sync 以 MapRenderingManager 为准——**不配 theme 就没有 AA**。
- `config.taa.enabled` 字段已被 `antialiasing` 实质取代，构建只看后者。
- 非球面投影下 toneMapping 被强制 `exposure=1, mode="aces"`
  （`AtmosphereSystem`）。
- `MapViewOptions.atmosphereOptions` 是遗留字段，未被消费——主题 `atmosphere`
  才是主通道。
- SMAA 分支有 console.log 残留。
- `pixelRatio` / `dynamicPixelRatio`（`MapViewOptions`）：动态低分辨率在相机
  运动时生效，但**该模式下无 AA，细线会花**。

## 黄金示例

| 示例 | 演示 |
|---|---|
| `examples/src/post-processing-effects/` | bloom 全家桶 + 选择性 bloom 对象 + inspector 的 PostProcessingGUI 调参面板 |
| `examples/src/color-grading-lut/` | LUT 调色：10 预设热切换 + opacity；`?lut=off`/`?lut=neutral` 调试参数 |
| `examples/src/cloud-mapview/` | AA 运行时切换、太阳时刻滑杆、toneMapping 时序处理（"VRM 可能还没建"） |
| `examples/src/cloud-render/` | 脱离 MapView 的独立云渲染预览（验证云节点本身） |
| `examples/src/3dtiles-terrain-overlay/` | 数据源级 translucentDepth（地下半透明） |
| `examples/src/3dtiles-animation/` | antialiasing + toneMappingExposure/Mode 组合 |
