# 云阴影（地面阴影光柱）从 0 接入计划

## 目标与架构决策（已确认）
- **保留** BSM 渲染核心（`cloudTsl.ts` 的 `createShadowMarchClouds`，与参考 `shadow.frag` 一致）
- **重写** 存储：atlas（2D 竖排）→ **真正的 `texture_2d_array`**（depth=3），消费端用 `vec3(uv, layer)` 索引
- **新建** 消费端：从 `AtmosphereLightNode`（光照通道，已废弃）→ **`AerialPerspectiveNode`**（地面后处理，对齐参考 WebGL `aerialPerspectiveEffect.frag`）
- **渲染方式**：MRT 单 pass 渲染（复用现成 `shadowMaterial`）+ `copyTextureToTexture` 拷到 array texture 的 3 个 layer
- **逐环节可视化调试**：每个中间量都能染色到屏幕，配合参考项目对比

## 关键正确性保证（避免之前失败的根因）
1. **坐标系一致性**：cascade 矩阵构建用的相机（`atmoCtx.camera` = 真实相机）和消费端投影 worldPos 用的坐标系**必须完全一致**。全程用真实相机世界坐标，不用 RTE。
2. **真 array texture**：用 `depth: 3` 选项创建 RenderTarget，texture 自动标 `isArrayTexture`，TSL 用 `texture(arrayNode, vec3(uv, layer))`。
3. **cascade 选择对齐参考** `getFadedCascadeIndex`：用 viewMatrix × worldPos 算 ortho depth，按 intervals + jitter 随机软过渡。

---

## 实施步骤（分 4 个阶段，每阶段可独立验证）

### 阶段 1：改造存储层（atlas → array texture）
**文件**：`@flywave/flywave-atmosphere/src/atmosphere/CloudRenderNode.ts`

- 删除 `shadowArrayTexture`（竖排 atlas，`SHADOW_MAP_SIZE × SHADOW_MAP_SIZE*3`）和 `shadowArrayNode`
- 新建 `shadowArrayRT = new RenderTarget(sz, sz, { depthBuffer: false, type: HalfFloatType, depth: SHADOW_CASCADE_COUNT })` → 产生真 array texture（`texture.isArrayTexture = true`）
- 新建 `shadowArrayNode = texture(shadowArrayRT.texture)`
- 修改 `updateBefore` 里的拷贝循环：把 `shadowResolvedMRT.textures[i]` 拷到 `shadowArrayRT.texture` 的 layer i（用 `copyTextureToTexture` 的第 4 参数 offset，或确认 array texture 的 layer 拷贝 API）
- 修改 `atmoCtx.cloudShadowArrayNode = this.shadowArrayNode`（指向新的 array node）
- **验证点**：array texture 创建成功，`isArrayTexture === true`，3 个 layer 都被拷贝

### 阶段 2：数据传递（AtmosphereContext）
**文件**：`@flywave/flywave-atmosphere/src/atmosphere/AtmosphereContext.ts`

- 现有 `cloudShadowArrayNode`、`cloudShadowMatrices`、`cloudShadowIntervals`、`cloudShadowCascadeCount`、`cloudShadowFar`、`cloudShadowTopHeight`、`cloudShadowEnabled` 字段**保留**（这些是通用的，不分 atlas/array）
- 新增 `cloudShadowViewMatrix`（Matrix4，用于消费端 cascade 选择时把 worldPos 投到 view space，对齐参考 `getFadedCascadeIndex` 的 viewMatrix 参数）
- 在 `CloudRenderNode.updateBefore` 里推送 `cloudShadowViewMatrix`（用真实相机的 `matrixWorldInverse`）
- **验证点**：各字段每帧被正确更新

### 阶段 3：新建消费端（AerialPerspectiveNode 里采样 BSM）
**文件**：`@flywave/flywave-atmosphere/src/atmosphere/AerialPerspectiveNode.ts`

核心：在 `surfaceLuminance` 的 `Fn` 里，参考 WebGL `aerialPerspectiveEffect.frag` 第 354-361、116-118 行，插入云阴影采样：

```
// 现有: positionUnit = 地面位置(单位空间), normalECEF, sunDirectionECEF
// 新增: 计算 sunTransmittance 并乘到 direct illuminance

// 1. 重建 positionECEF (米制，含 altitudeCorrection) —— 复用现有 positionUnit 反算
//    positionECEF_meters = positionUnit / worldToUnit + altitudeCorrectionUnit (反归一化)
//    注意：这里要用与 cascade 矩阵一致的坐标系（真实相机世界）
// 2. distanceToTop = raySphereSecondIntersection(positionECEF, sunDir, bottomRadius + shadowTopHeight)
// 3. worldPos = matrixECEFToWorld * (positionECEF - altitudeCorrection)  // 真实世界坐标
// 4. cascadeIndex = getFadedCascadeIndex(cloudShadowViewMatrix, worldPos, intervals, near, far, stbn)
// 5. shadowUV = cloudShadowMatrices[cascadeIndex] * worldPos → clip → *0.5+0.5
// 6. inBounds 检查 → 若越界 od=0
// 7. opticalDepth = min(shadow.b, shadow.g * max(0, distanceToTop - shadow.r))
//    shadow = texture(cloudShadowArrayNode, vec3(shadowUV, cascadeIndex))  // array 索引!
// 8. sunTransmittance = exp(-opticalDepth)

// 应用: solarIlluminance.direct *= sunTransmittance  (在 getSplitIlluminance 之后)
```

实现细节：
- 把 `sampleShadowOpticalDepth` 逻辑写成 `AerialPerspectiveNode` 的私有 TSL 方法（参考 WebGL `sampleShadowOpticalDepth` + `sampleShadowOpticalDepthPCF` + `getShadowRadius`）
- PCF：8-tap Vogel disk + IGN 旋转（对齐参考，但简化 radius 计算或先用固定值）
- **只乘 direct 分量**（参考第 117 行 `sunIrradiance *= sunTransmittance`），不乘 sky irradiance，也不乘最终 luminance
- 受 `cloudShadowEnabled` uniform gate

**验证点**：地面出现云阴影（即便位置/形状有偏差，至少能看到衰减）

### 阶段 4：逐环节可视化调试
**文件**：`AerialPerspectiveNode.ts`（新增 `debugMode` uniform）+ 参考项目对应 shader

新增 `debugMode` uniform（沿用 cloudTsl 的 201-207 体系，扩展到 300+ 段给阴影专用）：
- `301`：BSM texture 直接显示（`texture(arrayNode, vec3(screenUV, 0))` 显示 cascade 0）
- `302`：`distanceToTop` 归一化映射颜色
- `303`：`shadowUV` 作为颜色 + `inBounds` 作为亮度
- `304`：`cascadeIndex` 染色（0=红, 1=绿, 2=蓝）
- `305`：`opticalDepth` 映射颜色
- `306`：`sunTransmittance` 映射颜色
- `307`：worldPos / positionECEF 投影到屏幕做几何对比

在参考项目 `three-geospatial/packages/atmosphere/src/shaders/aerialPerspectiveEffect.frag` 里加同名 `#ifdef DEBUG_301` 等分支，逐像素对比本方 WebGPU 输出。

**验证流程**：从 301（BSM 有没有数据）→ 303（投影对不对）→ 304（cascade 选对没）→ 305/306（最终值对不对），逐步定位断点。

---

## 不改动的部分（明确边界）
- `cloudTsl.ts` 的 `createShadowMarchClouds`、`createSampleShadowOpticalDepth`、`marchShadowLength`（BSM 渲染核心，保留）
- `CloudRenderNode` 的 `shadowMRT` / `shadowResolvedMRT` / `shadowHistoryMRT`（MRT 渲染 + temporal resolve，保留）
- `cloudUniforms` 的 shadow 相关字段（`shadowMatrices` 等，保留）
- `AtmosphereLightNode` 的 `_sampleCloudShadow`（**保留但不再被云阴影链路使用**——它服务于地形网格 CSM 阴影，不删，避免破坏其它功能。云阴影改走 AerialPerspective）

## 风险与回退
- 若 array texture 的 layer 拷贝 API（`copyTextureToTexture` 到 array layer）在 three/webgpu 有问题 → 回退方案：保留 MRT 独立 texture，消费端用 `If(cascadeIdx==0) texture(tex0) ElseIf...` 静态分支（TSL/WGSL 支持静态分支选 texture binding）
- 若 `AerialPerspectiveNode` 里加 BSM 采样导致 shader 过重 → 先用单 cascade（cascade 0）+ 无 PCF 跑通，再加多 cascade + PCF
