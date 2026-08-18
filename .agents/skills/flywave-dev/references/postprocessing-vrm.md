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
**outline**（depth 邻域差分）→ vignette → brightnessContrast →
hueSaturation → sepia → translucent 合成 pass → dithering。

## Theme 配置面

```typescript
theme: {
    postEffects: {                        // 类型：PostEffects.ts
        bloom:      { enabled, strength, radius, luminancePassThreshold },
        outline:    { enabled, thickness, color },
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

## 坑清单（全部源码实证）

- **outline 的 enabled 不归 theme 管**：`updateOutline` 只改 thickness/color
  （`MapView.ts` 的 `setPostEffects`）；换一份 postEffects 时 outline 与
  brightnessContrast **不在"先全关"清单里，旧值会残留**。
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
