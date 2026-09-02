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
brightnessContrast → hueSaturation → sepia → translucent 合成 pass →
dithering。

## Theme 配置面

```typescript
theme: {
    postEffects: {                        // 类型：PostEffects.ts
        bloom:      { enabled, strength, radius, luminancePassThreshold },
        outline:    { enabled(废弃,选中驱动), thickness, color,
                      xray(默认true), hiddenColor },
        vignette:   { enabled, offset, darkness },
        sepia:      { enabled, amount },
        hueSaturation: { enabled, hue, saturation },
        brightnessContrast: { enabled, brightness, contrast },
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
| `examples/src/cloud-mapview/` | AA 运行时切换、太阳时刻滑杆、toneMapping 时序处理（"VRM 可能还没建"） |
| `examples/src/cloud-render/` | 脱离 MapView 的独立云渲染预览（验证云节点本身） |
| `examples/src/3dtiles-terrain-overlay/` | 数据源级 translucentDepth（地下半透明） |
| `examples/src/3dtiles-animation/` | antialiasing + toneMappingExposure/Mode 组合 |
