# 大气系统移植计划：three-geospatial Bruneton 散射 → flywave-mapview

> 目标：将 three-geospatial 的完整 Bruneton 2017 预计算大气散射系统移植到 flywave-mapview，
> 替换现有 GPU Gems 2 实现，实现物理精确的天空渲染、空中透视、太阳/月球、星空等效果。

---

## 目录

-   [Part 1: 现有系统分析](#part-1-现有系统分析)
    -   [1.1 坐标系架构](#11-坐标系架构)
    -   [1.2 RTE 渲染管线](#12-rte-渲染管线)
    -   [1.3 现有大气实现](#13-现有大气实现)
    -   [1.4 后处理管线](#14-后处理管线)
    -   [1.5 现有系统局限性](#15-现有系统局限性)
-   [Part 2: three-geospatial 架构分析](#part-2-three-geospatial-架构分析)
    -   [2.1 Bruneton 2017 算法概述](#21-bruneton-2017-算法概述)
    -   [2.2 WebGL 实现层次](#22-webgl-实现层次)
    -   [2.3 坐标变换链](#23-坐标变换链)
    -   [2.4 完整文件清单](#24-完整文件清单)
-   [Part 3: RTE 兼容性分析](#part-3-rte-兼容性分析)
    -   [3.1 问题定义](#31-问题定义)
    -   [3.2 worldToECEFMatrix 解决方案](#32-worldtoecefmatrix-解决方案)
    -   [3.3 逐层验证](#33-逐层验证)
    -   [3.4 深度缓冲兼容性](#34-深度缓冲兼容性)
-   [Part 4: 完整移植计划](#part-4-完整移植计划)
    -   [Phase 0: 基础工具层](#phase-0-基础工具层)
    -   [Phase 1: 大气参数与预计算](#phase-1-大气参数与预计算)
    -   [Phase 2: 核心渲染](#phase-2-核心渲染)
    -   [Phase 3: 后处理效果](#phase-3-后处理效果)
    -   [Phase 4: 星空与天体](#phase-4-星空与天体)
    -   [Phase 5: 集成到 flywave-mapview](#phase-5-集成到-flywave-mapview)
-   [Part 5: 风险点与解决方案](#part-5-风险点与解决方案)
-   [附录 A: @takram/three-geospatial 依赖替换清单](#附录-a-takramthree-geospatial-依赖替换清单)
-   [附录 B: GLSL Shader Chunks 对照表](#附录-b-glsl-shader-chunks-对照表)

---

## Part 1: 现有系统分析

### 1.1 坐标系架构

#### 世界坐标系 = ECEF（地心固定坐标系）

系统核心坐标为 **ECEF**，原点在地球中心：

```
X轴: 本初子午线与赤道交点方向
Y轴: 东经90度与赤道交点方向
Z轴: 北极方向
```

-   赤道半径: `R = 6,378,137.0 m` (WGS84)
-   Z-up（与 ECEF 一致）
-   地球中心 = 世界原点 `(0, 0, 0)`

坐标转换链：

```
GeoCoords (lat, lon, alt)
  → SphereProjection.projectPoint()
  → ECEF (meters from Earth center)
  → 世界空间
```

**相关文件：**

-   `@flywave/flywave-geoutils/src/projection/EarthConstants.ts` — WGS84 常量
-   `@flywave/flywave-geoutils/src/projection/SphericalEarthProjection.ts` — 球面投影 (projectPoint/unprojectPoint)
-   `@flywave/flywave-geoutils/src/projection/EllipsoidProjection.ts` — 椭球投影（含 WGS84）

### 1.2 RTE 渲染管线

#### 为什么需要 RTE？

地球半径约 6,378 km，GLSL 使用 32-bit float 只有约 7 位有效数字。
当相机在地球表面时，顶点位置数值达百万级（如 `[6378137, 0, 100]`），
此时浮点精度仅约 ~0.5 米级别，导致几何体抖动。

#### RTE 方案

维护**两套相机**：

| 相机                     | 位置                               | 用途                 |
| ------------------------ | ---------------------------------- | -------------------- |
| `m_camera` (世界相机)    | 真实 ECEF 位置 `[6378137, 0, 100]` | 控制、拾取、坐标计算 |
| `m_rteCamera` (渲染相机) | 原点 `[0, 0, 0]`                   | 实际渲染、后处理     |

**实现方式（MapView.ts:3340-3347）：**

```typescript
this.m_rteCamera.copy(this.m_camera);
this.m_rteCamera.position.setScalar(0);
this.m_rteCamera.updateMatrixWorld(true);
this.m_rteCamera.projectionMatrix.copy(this.m_camera.projectionMatrix);
```

**几何体偏移（MapAnchors.ts:163）：**

```typescript
mapAnchor.position.copy(worldPosition).sub(cameraPosition);
```

所有几何体的世界位置减去相机位置，使得 RTE 相机（在原点）可以正确渲染。
这样相机附近的顶点数值变为米级甚至亚米级，精度恢复到亚毫米级别。

#### 深度重建（MapView.ts:3448-3455）

```
屏幕坐标 (x, y)
  → NDC (ndcX, ndcY, depth)
  → ndcToView(): projectionMatrixInverse → RTE view space
  → m_rteCamera.matrixWorld → RTE world space (相机在原点的纯旋转)
  → + camera.position → 真实世界空间 (ECEF)
```

**关键：** 使用 `m_rteCamera.matrixWorld`（纯旋转）而非 `m_camera.matrixWorld`（含大平移），
避免 double-translation 问题。

#### 场景层级

```
THREE.Scene (m_scene)
  ├── THREE.PerspectiveCamera (m_camera, ECEF位置)
  ├── THREE.Object3D (m_sceneRoot) — 每帧重建
  │     ├── [tile meshes] — position = tile.center - cameraPos
  │     └── [map anchors] — position = anchor.worldPos - cameraPos
  │           ├── sky atmosphere mesh (anchor = (0,0,0))
  │           └── ground atmosphere mesh (anchor = (0,0,0))
  └── Celestia (THREE.Object3D)
        └── SunLight (THREE.DirectionalLight)
```

### 1.3 现有大气实现

#### 算法：GPU Gems 2, Chapter 16（Sean O'Neil）

物理参数：

```
Kr = 0.0025        // Rayleigh 散射系数
Km = 0.0015        // Mie 散射系数
ESun = 15.0        // 太阳强度
g = -0.95          // Mie 不对称因子
InvWavelength = (5.602, 9.473, 19.644)  // 1/lambda^4
RayleighScaleDepth = 0.25
nSamples = 2       // 仅 2 次采样！
```

#### 天空球体网格

-   **几何体**: `SphereGeometry(R * 1.025, 256, 256)` — 半径 6,537,590.4m
-   **材质**: `SkyAtmosphereMaterial` (extends RawShaderMaterial)
-   **面朝向**: `THREE.BackSide`（从内部渲染）
-   **位置**: anchor = `(0,0,0)`（地球中心），RTE 自动偏移

#### 地面球体网格

-   **几何体**: `SphereGeometry(R * 1.0001, 256, 256)` — 半径 6,378,200.9m
-   **材质**: `GroundAtmosphereMaterial` (extends RawShaderMaterial)
-   **面朝向**: `THREE.FrontSide`
-   **位置**: 同天空

#### 两种相机模式

| 模式                   | 条件                                 | Shader 行为                                  |
| ---------------------- | ------------------------------------ | -------------------------------------------- |
| `CAMERA_IN_SPACE`      | cameraHeight > outerRadius (~6537km) | 先计算射线与大气层外壳的交点，从交点开始采样 |
| `CAMERA_IN_ATMOSPHERE` | cameraHeight <= outerRadius          | 从相机位置开始采样（常用模式）               |

#### 两种光照模式

| 模式            | Shader define      | 光照方向                         |
| --------------- | ------------------ | -------------------------------- |
| `LightOverhead` | 无 `DYNAMIC_LIGHT` | 使用相机位置（始终从正上方照射） |
| `LightDynamic`  | `DYNAMIC_LIGHT`    | 使用真实太阳方向 (ECEF)          |

#### Uniform 传递链

```
SunLight.update(date)
  → JulianDate.fromDate(date)
  → Simon1994PlanetaryPositions.computeSunPositionInEarthInertialFrame()
  → computeTemeToPseudoFixedMatrix() — TEME → ECEF
  → MapViewAtmosphere.setLightDirection(sunDirection)

Per Frame (onBeforeRender):
  MapViewAtmosphere → skyMesh.onBeforeRender
    → SkyAtmosphereMaterial.updateUniforms(material, mesh, camera, lightDirection)
      → getCameraInfo(object, camera):
        eyePos = camera.getWorldPosition() - object.getWorldPosition()
               = camera.ECEF - (0,0,0) = camera.ECEF位置
        mvpMatrix = projection * view * model (使用 RTE 相机)
        eyeHeight = camera 到地球中心距离
      → 设置 uniform:
        u_eyePositionWorld = camera.ECEF 位置
        u_lightDirectionWorld = 太阳 ECEF 方向
        u_modelViewProjection = MVP (RTE)
        u_atmosphereEnv = (innerR, outerR, cameraHeight)
```

#### Clip Plane 管理（仅天空）

天空大气球体远大于地球，标准裁剪面无法覆盖。MapViewAtmosphere 为天空渲染：

1. **Before render**: 保存当前 near/far，计算扩展范围（farMax 可达 10,000 km），设置到 RTE 相机
2. **After render**: 恢复原始 near/far

```
near: 1.0m, far: Earth.R * 0.05 (≈319km) + 0.5 * Earth.R (≈3,189km)
```

### 1.4 后处理管线

#### MapRenderingManager 使用的 EffectComposer

```
EffectComposer (postprocessing 库)
  ├── RenderPass (场景主渲染)
  ├── [NormalPass] (仅 SSAO 启用时)
  ├── FilterEffectPass
  │     ├── TranslucentLayerEffect (始终启用)
  │     ├── HueSaturationEffect
  │     ├── OutlineEffect
  │     ├── VignetteEffect
  │     ├── SepiaEffect
  │     ├── BrightnessContrastEffect
  │     ├── SSAOEffect
  │     ├── SelectiveBloomEffect
  │     ├── [Custom Effects] (via addCustomEffect API)
  │     ├── FXAA/SMAA Effect (最后)
  │     └── [LowResEffect]
  └── DepthReadingPass (深度拷贝)
```

#### 自定义 Effect API

```typescript
// MapRenderingManager.addCustomEffect()
manager.addCustomEffect({
    id: "my-effect",
    effect: new MyEffect(),
    enabled: true,
    order: 0 // 越小越先渲染
});
```

### 1.5 现有系统局限性

| 问题                 | 说明                                                    |
| -------------------- | ------------------------------------------------------- |
| **物理精度低**       | GPU Gems 算法仅 2 次采样，单次散射近似                  |
| **无多次散射**       | 缺少 2-4 阶多次散射，天空颜色不真实（缺少地平线亮化等） |
| **无空中透视**       | 场景物体（建筑、地形）无大气雾霾效果                    |
| **无阴影集成**       | 不支持体积阴影/光束效果                                 |
| **无月球/星空**      | 仅天空+地面大气                                         |
| **硬编码参数**       | Rayleigh/Mie 系数、大气高度等均为硬编码常量             |
| **无物理光照**       | 太阳光颜色不基于大气透射率计算                          |
| **球体网格方案局限** | 需要特殊 clip plane 管理，渲染范围受限                  |

---

## Part 2: three-geospatial 架构分析

### 2.1 Bruneton 2017 算法概述

**论文**: Eric Bruneton, "A Scalable and Production Ready Sky and Atmosphere Rendering Technique", 2017

#### 核心思想

将复杂的大气散射数值积分分解为**离线预计算** + **运行时查表**两步：

1. **预计算阶段**（GPU，一次性）：

    - 生成查找表纹理（LUT）
    - 透射率 LUT (256x64 2D)
    - 单次散射 LUT (256x128x32 3D)
    - 多次散射 LUT（迭代 2-4 阶）
    - 辐照度 LUT (64x16 2D)

2. **运行时阶段**（每帧）：
    - 天空渲染：采样 LUT 获取天空辐射
    - 空中透视：采样 LUT 获取透射率+散射着色
    - 太阳光颜色：采样透射率 LUT 获取物理颜色

#### 物理模型

| 参数          | 值                             | 说明                                                 |
| ------------- | ------------------------------ | ---------------------------------------------------- |
| 底部半径      | 6,360 km                       | 大气层底部（地球表面）                               |
| 顶部半径      | 6,420 km                       | 大气层顶部（60km）                                   |
| Rayleigh 散射 | (0.005802, 0.013558, 0.0331)   | 蓝光最强 → 天空蓝色                                  |
| Mie 散射      | (0.003996, 0.003996, 0.003996) | 各向同性                                             |
| 臭氧吸收      | (0.00065, 0.001881, 0.000085)  | UV/蓝光吸收                                          |
| 太阳角半径    | 0.004675 rad                   | ~16 角分                                             |
| 密度剖面      | 指数+线性                      | `expTerm*exp(expScale*h) + linearTerm*h + constTerm` |

#### 散射阶数

| 阶数   | 说明                                    | 精度影响             |
| ------ | --------------------------------------- | -------------------- |
| 1      | 单次散射（Rayleigh + Mie）              | 基础天空颜色         |
| 2-4    | 多次散射                                | 地平线亮化、背光散射 |
| 更高阶 | 可选（higher_order_scattering_texture） | 极端场景精度         |

### 2.2 WebGL 实现层次

three-geospatial 大气系统分为 4 层：

```
Layer 1: 物理参数层
  ├── AtmosphereParameters.ts (222行) — 散射系数、密度剖面、太阳参数
  └── constants.ts (31行) — 纹理尺寸、单位转换

Layer 2: 预计算层
  ├── PrecomputedTexturesGenerator.ts (790行) — GPU 5-pass 预计算管线
  ├── PrecomputedTexturesLoader.ts (246行) — 从 URL 加载预烘焙纹理
  └── shaders/precompute/ (6个 frag shader) — 预计算着色器

Layer 3: 核心渲染层
  ├── AtmosphereMaterialBase.ts (294行) — 材质基类，管理 uniform
  ├── SkyMaterial.ts (203行) — 天空材质
  ├── SunDirectionalLight.ts (92行) — 物理太阳光
  ├── SkyLightProbe.ts (130行) — 天空环境光探针
  ├── getSunLightColor.ts (103行) — 太阳光颜色计算
  └── shaders/bruneton/ (4个核心 GLSL) — Bruneton 数学

Layer 4: 后处理层
  ├── AerialPerspectiveEffect.ts (673行) — 空中透视后处理
  ├── LightingMaskPass.ts (163行) — 光照遮罩 Pass
  ├── celestialDirections.ts (146行) — 天体方向计算
  ├── StarsMaterial.ts (147行) + StarsGeometry.ts (30行) — 星空
  └── shaders/ (天空/星空/后处理着色器)
```

### 2.3 坐标变换链

three-geospatial 的天空和后处理着色器共享相同的坐标变换逻辑。

#### 天空渲染（sky.vert）

```
全屏四边形顶点 (NDC: [-1,+1]²)
  → getCameraRay():
    perspective:
      inverseProjectionMatrix * vec4(position, 1) → view space position
      inverseViewMatrix * vec4(viewDir, 0) → world space direction
      cameraPosition → world space origin
    orthographic:
      两个 NDC 点反投影 → view space → world space direction/origin
  → worldToECEFMatrix * vec4(origin, 1) → camera ECEF 位置
  → worldToECEFMatrix * vec4(direction, 0) → ECEF 方向
  → altitude correction + METER_TO_LENGTH_UNIT 缩放
  → 输出: vCameraPosition, vRayDirection (均在 ECEF)
```

#### 空中透视（aerialPerspectiveEffect.frag）

```
屏幕 UV + 深度缓冲值
  → readDepthValue(depthBuffer, uv)
  → reverseLogDepth(depth, cameraNear, cameraFar) [若 USE_LOGDEPTHBUF]
  → screenToView(uv, depth, viewZ) → view space position
  → inverseViewMatrix * vec4(viewPos, 1) → Three.js world position
  → worldToECEFMatrix * vec4(worldPos, 1) → ECEF 位置
  → * METER_TO_LENGTH_UNIT + altitudeCorrection
  → 法线重建/八面体解码
  → 采样 Bruneton LUT → 透射率 + 散射着色
  → 深度==1 (天空) → getSkyRadiance()
```

#### sky.glsl（天空辐射计算）

```glsl
getSkyRadiance(vCameraPosition, vRayDirection, shadowLength,
               sunDirection, moonDirection, ...):
  → GetSkyRadiance(camera, ray, shadowLength, sunDir):
    1. Ray-Atmosphere 求交 → 进入/离开大气层的距离
    2. 循环采样散射纹理 (scattering_texture + single_mie_scattering_texture)
    3. Rayleigh 相函数 + Mie 相函数
    4. 合并单次 + 多次散射
    5. 阴影长度修正 (Eq.18)
  → 太阳盘: smoothstep 抗锯齿，角半径内渲染
  → 月球: 射线-球面求交，Oren-Nayar 漫反射 (roughness=1, albedo=1)
```

### 2.4 完整文件清单

#### TypeScript 文件（17 个核心 + 6 个辅助 + 9 个 R3F）

**核心（WebGL）：**

| 文件                              | 行数 | 功能                                         |
| --------------------------------- | ---- | -------------------------------------------- |
| `AtmosphereParameters.ts`         | 222  | 物理参数定义（散射系数、密度剖面、太阳参数） |
| `AtmosphereMaterialBase.ts`       | 294  | 材质基类，管理所有大气 uniform               |
| `SkyMaterial.ts`                  | 203  | 天空球材质（全屏 quad 后处理）               |
| `AerialPerspectiveEffect.ts`      | 673  | 空中透视后处理效果                           |
| `SunDirectionalLight.ts`          | 92   | 扩展 DirectionalLight，物理太阳光颜色        |
| `SkyLightProbe.ts`                | 130  | 扩展 LightProbe，天空辐照度球谐系数          |
| `PrecomputedTexturesGenerator.ts` | 790  | GPU 预计算纹理生成器                         |
| `PrecomputedTexturesLoader.ts`    | 246  | 预烘焙纹理加载器                             |
| `LightingMaskPass.ts`             | 163  | 光照遮罩 Pass                                |
| `celestialDirections.ts`          | 146  | 天体方向计算（astronomy-engine）             |
| `getSunLightColor.ts`             | 103  | CPU 采样透射率 LUT 计算太阳颜色              |
| `getAltitudeCorrectionOffset.ts`  | 22   | 椭球面 → 接触球偏移修正                      |
| `StarsMaterial.ts`                | 147  | 星空点材质                                   |
| `StarsGeometry.ts`                | 30   | 星空几何                                     |
| `constants.ts`                    | 31   | 纹理尺寸、单位转换常量                       |
| `types.ts`                        | 39   | 类型定义                                     |
| `index.ts`                        | ~40  | 导出汇总                                     |

**辅助工具：**

| 文件                                | 行数 | 功能               |
| ----------------------------------- | ---- | ------------------ |
| `helpers/colorMatchingFunctions.ts` | -    | CIE 颜色匹配函数   |
| `helpers/functions.ts`              | -    | 通用辅助函数       |
| `helpers/requestIdleCallback.ts`    | -    | 空闲回调 polyfill  |
| `helpers/sampleTexture.ts`          | -    | CPU 纹理采样       |
| `helpers/typedArray.ts`             | ~60  | Float16Array 支持  |
| `helpers/typedArrayParsers.ts`      | ~103 | typed array 解析器 |

**R3F React 组件（不移植，仅供参考）：**

`r3f/Atmosphere.tsx`, `r3f/Sky.tsx`, `r3f/AerialPerspective.tsx`, `r3f/SunLight.tsx`, `r3f/SkyLight.tsx`, `r3f/Stars.tsx`, `r3f/LightingMask.tsx`, `r3f/separateProps.ts`, `r3f/index.ts`

#### GLSL 着色器文件（19 个）

**Bruneton 核心（4 个）：**

| 文件                        | 行数 | 功能                                                          |
| --------------------------- | ---- | ------------------------------------------------------------- |
| `bruneton/definitions.glsl` | 143  | Bruneton 类型系统 + AtmosphereParameters struct               |
| `bruneton/common.glsl`      | 280  | 相函数、透射率采样、散射纹理映射、射线求交                    |
| `bruneton/runtime.glsl`     | 461  | GetSkyRadiance, GetSkyRadianceToPoint, GetSunAndSkyIrradiance |
| `bruneton/precompute.glsl`  | 641  | 预计算数学（光学深度、数值积分）                              |

**天空/星空（5 个）：**

| 文件         | 行数 | 功能                                                   |
| ------------ | ---- | ------------------------------------------------------ |
| `sky.vert`   | 53   | 天空顶点着色器（相机射线生成 + ECEF 变换）             |
| `sky.frag`   | 117  | 天空片段着色器（ground albedo, shadow length, 日月盘） |
| `sky.glsl`   | 81   | 天空共享函数（skyRadiance, lunarRadiance, Oren-Nayar） |
| `stars.vert` | 46   | 星空顶点着色器                                         |
| `stars.frag` | 60   | 星空片段着色器（透射率 + 地面剔除）                    |

**后处理（3 个）：**

| 文件                           | 行数 | 功能                                         |
| ------------------------------ | ---- | -------------------------------------------- |
| `aerialPerspectiveEffect.vert` | 59   | 空中透视顶点着色器                           |
| `aerialPerspectiveEffect.frag` | 390  | 空中透视片段着色器（完整的透射率+散射+阴影） |
| `lightingMask.frag`            | -    | 光照遮罩片段着色器                           |

**预计算（6 个）：**

| 文件                                 | 功能             |
| ------------------------------------ | ---------------- |
| `precompute/transmittance.frag`      | 透射率预计算     |
| `precompute/singleScattering.frag`   | 单次散射预计算   |
| `precompute/scatteringDensity.frag`  | 散射密度预计算   |
| `precompute/multipleScattering.frag` | 多次散射预计算   |
| `precompute/directIrradiance.frag`   | 直射辐照度预计算 |
| `precompute/indirectIrradiance.frag` | 间接辐照度预计算 |

---

## Part 3: RTE 兼容性分析

### 3.1 问题定义

**flywave-mapview 的 RTE 系统：**

-   渲染相机 (`m_rteCamera`) 在原点 `(0, 0, 0)`
-   所有几何体偏移 `-cameraPosition`（ECEF 减去相机 ECEF 位置）
-   `m_rteCamera.matrixWorld` = 纯旋转矩阵（ENU→ 世界）
-   `camera.getWorldPosition()` 返回 `(0, 0, 0)`

**three-geospatial 的假设：**

-   shader 通过 uniform `cameraPosition` 获取相机位置
-   `inverseViewMatrix` = `camera.matrixWorld` 用于从 view space → world space
-   `worldToECEFMatrix` 将 world space → ECEF
-   深度重建后乘 `worldToECEFMatrix` 得到 ECEF 位置

**核心问题：** 在 RTE 下，`cameraPosition = (0,0,0)`，`inverseViewMatrix` 只含旋转，
重建出的 world position 是 ENU 局部坐标而非 ECEF。

### 3.2 worldToECEFMatrix 解决方案

three-geospatial 的 shader **不硬编码** ECEF 坐标，而是通过外部 uniform `worldToECEFMatrix`
完成 world → ECEF 变换。**这个矩阵是用户从外部设置的，可以适配任何坐标系。**

在 flywave-mapview 的 RTE 系统中，`worldToECEFMatrix` 需要构建为：

```
worldToECEFMatrix = T(camera_ECEF) × R_ENU_to_ECEF
```

其中：

-   `T(camera_ECEF)` = 将原点平移到相机 ECEF 位置的平移矩阵
-   `R_ENU_to_ECEF` = 将 ENU 局部坐标系旋转到 ECEF 的旋转矩阵

### 3.3 逐层验证

#### 层 1: 顶点着色器 — 射线方向/相机位置

```glsl
// sky.vert / aerialPerspectiveEffect.vert
getCameraRay(origin, direction):
  origin = cameraPosition;  // RTE 下 = (0,0,0)
  direction = inverseViewMatrix * vec4(viewDir, 0);

// ECEF 变换
cameraPositionECEF = (worldToECEFMatrix * vec4(origin, 1)).xyz;
// = T(cam) × R(ENU→ECEF) × vec4(0,0,0,1)
// = T(cam) × vec4(0,0,0,1)
// = camera_ECEF  ✅ 正确！

vRayDirection = (worldToECEFMatrix * vec4(direction, 0)).xyz;
// = T(cam) × R(ENU→ECEF) × vec4(dir, 0)
// = R(ENU→ECEF) × vec4(dir, 0)  (平移对 w=0 无效)
// = ECEF 方向  ✅ 正确！
```

#### 层 2: 片段着色器 — 深度重建

```glsl
// aerialPerspectiveEffect.frag
viewPosition = screenToView(uv, depth, viewZ, projectionMatrix, inverseProjectionMatrix);
// viewPosition 是 RTE view space 中的位置（相对于原点相机）

worldPosition = (inverseViewMatrix * vec4(viewPosition, 1)).xyz;
// inverseViewMatrix = camera.matrixWorld = 纯旋转矩阵（RTE 相机在原点）
// worldPosition = ENU 局部坐标（相机附近，数值小）

positionECEF = (worldToECEFMatrix * vec4(worldPosition, 1)).xyz;
// = T(cam) × R(ENU→ECEF) × vec4(localPos, 1)
// = R(ENU→ECEF) × localPos + cam_ECEF
// = ECEF 位置  ✅ 正确！
```

#### 层 3: 天空渲染（无深度重建）

```glsl
// sky.glsl → sky.frag
getSkyRadiance(vCameraPosition, rayDirection, ...):
// vCameraPosition = camera_ECEF (已通过 worldToECEFMatrix 正确变换)
// rayDirection = ECEF 方向 (已通过 worldToECEFMatrix 正确变换)
// → 所有 Bruneton 散射计算在 ECEF 空间进行  ✅ 正确！
```

### 3.4 深度缓冲兼容性

#### 对数深度缓冲

three-geospatial 已内置对数深度缓冲支持（`depth.glsl`）：

```glsl
float reverseLogDepth(const float depth, const float near, const float far) {
  #if defined(USE_LOGDEPTHBUF) || defined(USE_LOGARITHMIC_DEPTH_BUFFER)
  float d = pow(2.0, depth * log2(far + 1.0)) - 1.0;
  float a = far / (far - near);
  float b = far * near / (near - far);
  return a + b / d;
  #else
  return depth;
  #endif
}
```

flywave-mapview 默认启用 `logarithmicDepthBuffer: true`，完全兼容。

#### 深度缓冲值与 RTE

RTE 系统的深度缓冲值与标准渲染**完全相同**：

-   RTE 相机和世界相机共享相同的 `projectionMatrix`
-   深度值取决于投影矩阵和 view-space Z，与相机位置无关
-   three-geospatial 的 `reverseLogDepth` + `screenToView` 可直接使用

#### 注意事项

现有的 `DepthReadingPass.readDepth()` 在 `logarithmicDepthBuffer=true` 时返回 `null`，
但大气系统使用 postprocessing 内置的 `depthBuffer`（不依赖 DepthReadingPass），
所以不受影响。

---

## Part 4: 完整移植计划

### Phase 0: 基础工具层

**目标：** 建立移植所需的工具函数和基础类型，替换 `@takram/three-geospatial` 依赖。

**放置位置：** `@flywave/flywave-atmosphere/`（新建包）或 `@flywave/flywave-materials/src/atmosphere/`

#### 0.1 从 @takram 复制并适配的代码

| 源文件 (three-geospatial)        | 目标文件                | 行数 | 适配内容                                         |
| -------------------------------- | ----------------------- | ---- | ------------------------------------------------ |
| `core/src/resolveIncludes.ts`    | `resolveIncludes.ts`    | 22   | 直接复制                                         |
| `core/src/unrollLoops.ts`        | `unrollLoops.ts`        | 23   | 直接复制                                         |
| `core/src/math.ts`               | `atmosphereMath.ts`     | ~20  | 仅保留 radians/remap/saturate，用 MathUtils 替代 |
| `core/src/capabilities.ts`       | `capabilities.ts`       | 14   | 仅保留 WebGL 分支                                |
| `core/src/types.ts`              | `atmosphereTypes.ts`    | 12   | 仅保留 reinterpretType/AnyFloatType              |
| `core/src/decorators.ts`         | `decorators.ts`         | ~100 | 仅保留 define/defineInt，适配 RawShaderMaterial  |
| `core/src/typedArray.ts`         | `typedArray.ts`         | ~30  | 直接复制，保留 @petamoriken/float16 依赖         |
| `core/src/typedArrayParsers.ts`  | `typedArrayParsers.ts`  | ~60  | 仅保留 parseFloat16Array                         |
| `core/src/EXR3DTextureLoader.ts` | `EXR3DTextureLoader.ts` | 66   | 直接复制                                         |
| `core/src/EXRTextureLoader.ts`   | `EXRTextureLoader.ts`   | 61   | 直接复制                                         |
| `core/src/DataTextureLoader.ts`  | `DataTextureLoader.ts`  | 134  | 直接复制                                         |
| `core/src/TypedArrayLoader.ts`   | `TypedArrayLoader.ts`   | 43   | 直接复制                                         |
| `core/src/ArrayBufferLoader.ts`  | `ArrayBufferLoader.ts`  | 35   | 直接复制                                         |
| `core/src/STBNLoader.ts`         | `STBNLoader.ts`         | 58   | 直接复制                                         |

#### 0.2 基于已有代码创建

| 文件           | 来源                                         | 行数 | 说明                                                                                                    |
| -------------- | -------------------------------------------- | ---- | ------------------------------------------------------------------------------------------------------- |
| `Ellipsoid.ts` | 从 `EllipsoidProjection` 提取                | ~50  | 仅需 WGS84、radii、reciprocalRadiiSquared、getSurfaceNormal、getIntersection、getOsculatingSphereCenter |
| `Geodetic.ts`  | 从 `EllipsoidProjection.unprojectPoint` 提取 | ~30  | ECEF↔ 经纬高                                                                                            |

#### 0.3 GLSL Shader Chunks

全部直接复制，放入 `shaders/core/` 目录：

| 文件                            | 行数 | 功能                           |
| ------------------------------- | ---- | ------------------------------ |
| `depth.glsl`                    | 27   | 深度读取、对数深度反转、线性化 |
| `math.glsl`                     | 92   | saturate/remap                 |
| `packing.glsl`                  | 20   | 法线八面体编码                 |
| `transform.glsl`                | 12   | screenToView                   |
| `raySphereIntersection.glsl`    | 134  | 射线-球面求交                  |
| `cascadedShadowMaps.glsl`       | 79   | CSM 级联选择                   |
| `interleavedGradientNoise.glsl` | 6    | IGL 时空噪声                   |
| `vogelDisk.glsl`                | 8    | Vogel 盘采样                   |

#### 0.4 新增外部依赖

| 依赖                   | 版本   | 用途              | 可否规避                |
| ---------------------- | ------ | ----------------- | ----------------------- |
| `@petamoriken/float16` | latest | Float16Array 支持 | 使用预烘焙 Float32 纹理 |
| `astronomy-engine`     | ^2.1   | 天体方向计算      | 保留 Simon1994          |
| `tiny-invariant`       | ^1.3   | 断言              | 替换为 console.assert   |
| `url-join`             | ^5.0   | URL 拼接          | 替换为字符串拼接        |

### Phase 1: 大气参数与预计算

**目标：** 移植 Bruneton 物理参数和 GPU 预计算纹理生成管线。

#### 需移植文件

| 文件                              | 适配改动                                               |
| --------------------------------- | ------------------------------------------------------ |
| `AtmosphereParameters.ts`         | 将 `import { radians }` 改为本地 `MathUtils.degToRad`  |
| `constants.ts`                    | 直接复制                                               |
| `getAltitudeCorrectionOffset.ts`  | 使用本地 Ellipsoid 类                                  |
| `PrecomputedTexturesGenerator.ts` | 替换 import 路径，适配本地 resolveIncludes/unrollLoops |
| `PrecomputedTexturesLoader.ts`    | 替换 import 路径                                       |

#### 预计算着色器（直接复制到 `shaders/precompute/`）

`transmittance.frag`, `singleScattering.frag`, `scatteringDensity.frag`,
`multipleScattering.frag`, `directIrradiance.frag`, `indirectIrradiance.frag`

#### Bruneton 核心 GLSL（直接复制到 `shaders/bruneton/`）

`definitions.glsl`, `common.glsl`, `runtime.glsl`, `precompute.glsl`

#### 预计算调用方式

```typescript
// 初始化（MapViews 启动时，一次性）
const generator = new PrecomputedTexturesGenerator(renderer);
await generator.update(); // 异步生成纹理

// 分发纹理
skyMaterial.transmittanceTexture = generator.textures.transmittance;
skyMaterial.scatteringTexture = generator.textures.scattering;
// ... etc
```

### Phase 2: 核心渲染

**目标：** 移植天空材质、太阳光、天空光探针。

#### 需移植文件

| 文件                        | 适配改动                                            |
| --------------------------- | --------------------------------------------------- |
| `AtmosphereMaterialBase.ts` | 替换 `define` 装饰器为本地版本，替换 Ellipsoid 导入 |
| `SkyMaterial.ts`            | 替换所有 `@takram` 导入为本地版本                   |
| `getSunLightColor.ts`       | 使用本地 Ellipsoid                                  |
| `SunDirectionalLight.ts`    | 使用本地 Ellipsoid + AtmosphereParameters           |
| `SkyLightProbe.ts`          | 使用本地 Ellipsoid + AtmosphereParameters           |

#### 天空着色器（直接复制到 `shaders/`）

`sky.vert`, `sky.frag`, `sky.glsl`

#### 天空渲染方式变更

**现有方式（球体网格内联渲染）：**

```
MapViewAtmosphere → SphereGeometry (R*1.025) + SkyAtmosphereMaterial (BackSide)
  → onBeforeRender 更新 uniform
  → MapAnchors 管理 position
  → 需要 clip plane 扩展
```

**新方式（全屏后处理 quad）：**

```
MapRenderingManager.addCustomEffect() → AerialPerspectiveEffect
  → 内含 SKY 定义时：深度==1 的像素自动渲染天空
  → 不需要球体网格
  → 不需要 clip plane 扩展
```

### Phase 3: 后处理效果

**目标：** 移植空中透视效果，这是最核心的后处理组件。

#### 需移植文件

| 文件                         | 适配改动                                    |
| ---------------------------- | ------------------------------------------- |
| `AerialPerspectiveEffect.ts` | 替换所有 `@takram` 导入，适配 define 装饰器 |
| `LightingMaskPass.ts`        | 替换 import 路径                            |

#### 后处理着色器（直接复制到 `shaders/`）

`aerialPerspectiveEffect.vert`, `aerialPerspectiveEffect.frag`, `lightingMask.frag`

#### 集成到 MapRenderingManager

```typescript
// MapRenderingManager 中添加
const aerialPerspective = new AerialPerspectiveEffect(rteCamera, {
    blendFunction: BlendFunction.ALPHA
    // ... 配置
});
manager.addCustomEffect({
    id: "aerial-perspective",
    effect: aerialPerspective,
    enabled: true,
    order: -10 // 在其他效果之前
});
```

#### per-frame 更新

```typescript
// Celestia.update() 中
aerialPerspective.sunDirection.copy(sunDirectionECEF);
aerialPerspective.worldToECEFMatrix.copy(worldToECEF);
// ... 其他 uniform
```

### Phase 4: 星空与天体

**目标：** 移植星空渲染和天体方向计算。

#### 需移植文件

| 文件                     | 适配改动                                 |
| ------------------------ | ---------------------------------------- |
| `celestialDirections.ts` | 保留 astronomy-engine 或替换为 Simon1994 |
| `StarsMaterial.ts`       | 替换 `@takram` 导入                      |
| `StarsGeometry.ts`       | 直接复制                                 |

#### 星空着色器

`stars.vert`, `stars.frag`

#### 天体方向：保留 Simon1994

flywave-mapview 已有 `Simon1994PlanetaryPositions` 和 `JulianDate` 实现，
可以复用而非引入 `astronomy-engine`：

```typescript
// 使用现有 Simon1994 计算
const date = JulianDate.fromDate(new Date());
const sunECI = Simon1994PlanetaryPositions.computeSunPositionInEarthInertialFrame(date, scratch);
const transformMatrix = computeTemeToPseudoFixedMatrix(date, matrix);
sunECI.applyMatrix3(transformMatrix);
// sunECI 现在在 ECEF 坐标系中
```

### Phase 5: 集成到 flywave-mapview

**目标：** 将移植后的大气系统集成到 MapView 渲染管线。

#### 5.1 改造 MapViewAtmosphere

**删除：**

-   球体网格创建逻辑 (createSkyGeometry, createGroundGeometry)
-   SkyAtmosphereMaterial / GroundAtmosphereMaterial
-   clip plane 扩展/恢复逻辑 (overrideClipPlanes, revertClipPlanes)
-   MapAnchors 管理

**新增：**

-   AerialPerspectiveEffect 实例（在 MapRenderingManager 中管理）
-   PrecomputedTexturesGenerator 初始化
-   worldToECEFMatrix 构建
-   per-frame uniform 更新

#### 5.2 改造 Celestia

```typescript
class Celestia {
    private aerialPerspective?: AerialPerspectiveEffect;
    private sunDirectionalLight?: SunDirectionalLight;
    private skyLightProbe?: SkyLightProbe;
    private precomputedTextures?: PrecomputedTextures;

    async initialize() {
        // 1. 生成预计算纹理
        const generator = new PrecomputedTexturesGenerator(renderer);
        this.precomputedTextures = await generator.update();

        // 2. 创建 AerialPerspectiveEffect
        this.aerialPerspective = new AerialPerspectiveEffect(rteCamera);
        Object.assign(this.aerialPerspective, this.precomputedTextures);

        // 3. 创建太阳光
        this.sunDirectionalLight = new SunDirectionalLight();
        this.sunDirectionalLight.transmittanceTexture = this.precomputedTextures.transmittance;
        this.sunDirectionalLight.irradianceTexture = this.precomputedTextures.irradiance;

        // 4. 创建天空光探针
        this.skyLightProbe = new SkyLightProbe();
        this.skyLightProbe.irradianceTexture = this.precomputedTextures.irradiance;

        // 5. 添加到渲染管线
        this.mapRenderingManager.addCustomEffect({
            id: "aerial-perspective",
            effect: this.aerialPerspective,
            enabled: true,
            order: -10
        });
    }

    update() {
        const date = this.currentDate || new Date();

        // 计算太阳方向 (ECEF)
        const sunECEF = computeSunDirectionECEF(date);

        // 构建 worldToECEFMatrix
        this.buildWorldToECEFMatrix();

        // 更新所有 uniform
        if (this.aerialPerspective) {
            this.aerialPerspective.sunDirection.copy(sunECEF);
            this.aerialPerspective.worldToECEFMatrix.copy(this.worldToECEF);
            this.aerialPerspective.sun = true; // 启用太阳渲染
        }
        if (this.sunDirectionalLight) {
            this.sunDirectionalLight.update(date, sunECEF);
        }
        if (this.skyLightProbe) {
            this.skyLightProbe.update(sunECEF);
        }
    }

    private buildWorldToECEFMatrix() {
        const cameraECEF = this.mapView.camera.position;
        // camera.matrixWorld 是 RTE 相机的纯旋转矩阵 (ENU→ECEF旋转)
        // 需要加上平移分量
        this.worldToECEF.identity();
        // 设置旋转部分 (来自 RTE 相机的 matrixWorld)
        this.worldToECEF.extractRotation(this.mapView.rteCamera.matrixWorld);
        // 设置平移部分 (相机 ECEF 位置)
        this.worldToECEF.setPosition(cameraECEF);
    }
}
```

#### 5.3 worldToECEFMatrix 构建详解

```
flywave-mapview RTE 架构:
  m_camera.position = [cx, cy, cz]  (ECEF, 数值大)
  m_rteCamera.position = [0, 0, 0]
  m_rteCamera.quaternion = 相机在 ECEF 空间的朝向
  m_rteCamera.matrixWorld = 旋转矩阵 (无平移)

worldToECEFMatrix 构建:
  R = m_rteCamera.matrixWorld 的旋转部分 (3x3)
  T = 平移到 cameraECEF

  worldToECEFMatrix = | R  cameraECEF |
                      | 0       1      |

验证:
  worldToECEFMatrix * vec4(0,0,0,1) = cameraECEF  ✅
  worldToECEFMatrix * vec4(localDir, 0) = R * localDir (ECEF方向)  ✅
  worldToECEFMatrix * vec4(localPos, 1) = R * localPos + cameraECEF (ECEF位置)  ✅
```

#### 5.4 EffectComposer 改造

需要将 `EffectComposer` 的 `frameBufferType` 设置为 `HalfFloatType`，
以支持 HDR 大气辐射值：

```typescript
this.m_composer = new EffectComposer(this.m_renderer, {
    frameBufferType: THREE.HalfFloatType, // 新增：HDR 渲染目标
    multisampling: this.m_dynamicMsaaSamplingLevel,
    stencilBuffer: true,
    depthBuffer: true
});
```

如果启用 SSAO，`NormalPass` 的 render target 也需要升级为 `HalfFloatType`。

---

## Part 5: 风险点与解决方案

### 5.1 EffectComposer frameBufferType

**风险：** 现有 EffectComposer 使用默认的 `UnsignedByteType`，大气辐射值可能溢出。

**方案：** 设置 `frameBufferType: HalfFloatType`。

**影响：** 所有后处理效果将在半浮点精度下运行，内存使用略增，但通常性能影响极小。

### 5.2 NormalPass 精度

**风险：** 如果使用 AerialPerspectiveEffect 的 `sunLight`/`skyLight` 模式（对场景物体进行光照），
需要法线缓冲区。现有 NormalPass 使用 `UnsignedByteType`，精度不足。

**方案：** 升级 NormalPass 的 render target 为 `HalfFloatType`，或使用八面体编码（OCT_ENCODED_NORMAL）。

### 5.3 Altitude Correction

**风险：** flywave-mapview 使用球面投影（`SphericalEarthProjection`），非椭球。
three-geospatial 的 altitude correction 基于 WGS84 椭球。

**方案：**

-   简化方案：altitude correction 返回 `vec3(0)`（使用球面近似，精度损失小）
-   完整方案：从 `EllipsoidProjection` 提取椭球参数，正确计算接触球偏移

### 5.4 Geometric Error Correction

**风险：** 3D Tiles 可能使用几何误差简化（平面代替曲面），空中透视需要对表面位置进行修正。

**方案：** 初期关闭 `CORRECT_GEOMETRIC_ERROR`，后续根据需要启用。

### 5.5 阴影集成

**风险：** AerialPerspectiveEffect 支持 CSM 级联阴影和 STBN 采样，
但需要级联阴影的纹理输入（`shadowBuffer`, `shadowMatrices` 等）。

**方案：**

-   Phase 1-4 不启用阴影，设置 `shadow = undefined`
-   后续阶段集成 CSM 阴影映射

### 5.6 预计算纹理生成的阻塞

**风险：** `PrecomputedTexturesGenerator.update()` 需要 5 个 GPU pass，
可能阻塞主线程数秒。

**方案：**

-   内部已使用 `requestIdleCallback` 分帧执行，不会阻塞
-   也可预烘焙纹理放到 CDN，使用 `PrecomputedTexturesLoader` 异步加载

### 5.7 太阳光方向计算

**风险：** 现有 Simon1994 产生的是太阳 ECI→ECEF 方向，
three-geospatial 的 AerialPerspectiveEffect 期望归一化的 ECEF 方向向量。

**方案：** 复用现有 Simon1994 代码，归一化后直接传入 `sunDirection` uniform。

### 5.8 球面 vs 椭球

**风险：** three-geospatial 默认使用 WGS84 椭球 (`Ellipsoid.WGS84`)，
flywave-mapview 使用球面（`EQUATORIAL_RADIUS = 6378137.0`，无扁率）。

**方案：** 创建自定义 `AtmosphereParameters`，将 `bottomRadius`/`topRadius`
设为球面值（6360000m / 6420000m），不使用椭球相关的 altitude correction。

### 5.9 Three.js 版本兼容

**风险：** three-geospatial 要求 `three >= 0.170.0`，flywave-mapview 使用 `^0.178.0`。

**方案：** 版本兼容，无问题。

---

## 附录 A: @takram/three-geospatial 依赖替换清单

### 主包导入 (`@takram/three-geospatial`)

| 导入符号                          | 使用文件 | 替换方式                                   |
| --------------------------------- | -------- | ------------------------------------------ |
| `Ellipsoid`                       | 5 个文件 | 从 EllipsoidProjection 提取简化版          |
| `Geodetic`                        | 1 个文件 | 从 EllipsoidProjection.unprojectPoint 提取 |
| `radians`                         | 3 个文件 | `MathUtils.degToRad`                       |
| `define`                          | 3 个文件 | 复制装饰器代码                             |
| `defineInt`                       | 1 个文件 | 复制装饰器代码                             |
| `resolveIncludes`                 | 5 个文件 | 复制 22 行实现                             |
| `isFloatLinearSupported`          | 2 个文件 | 复制 14 行实现                             |
| `reinterpretType`                 | 3 个文件 | 复制类型断言                               |
| `AnyFloatType`                    | 2 个文件 | 复制类型定义                               |
| `Float16Array`                    | 2 个文件 | 直接依赖 `@petamoriken/float16`            |
| `remap`                           | 1 个文件 | `MathUtils.mapLinear`                      |
| `saturate`                        | 1 个文件 | 内联函数                                   |
| `unrollLoops`                     | 1 个文件 | 复制 23 行实现                             |
| `EXR3DTextureLoader`              | 1 个文件 | 复制加载器                                 |
| `EXRTextureLoader`                | 1 个文件 | 复制加载器                                 |
| `DataTextureLoader`               | 1 个文件 | 复制加载器链                               |
| `parseFloat16Array`               | 1 个文件 | 复制解析器                                 |
| `STBNLoader` / `DEFAULT_STBN_URL` | R3F only | 复制加载器 + 常量                          |
| `UniformMap`                      | 1 个文件 | 复制 3 行类型定义                          |

### 着色器导入 (`@takram/three-geospatial/shaders`)

| 导入符号                   | 使用文件    | 替换方式         |
| -------------------------- | ----------- | ---------------- |
| `raySphereIntersection`    | SkyMaterial | 复制 134 行 GLSL |
| `depth`                    | 2 个文件    | 复制 27 行 GLSL  |
| `cascadedShadowMaps`       | 1 个文件    | 复制 79 行 GLSL  |
| `math`                     | 1 个文件    | 复制 92 行 GLSL  |
| `packing`                  | 1 个文件    | 复制 20 行 GLSL  |
| `transform`                | 1 个文件    | 复制 12 行 GLSL  |
| `interleavedGradientNoise` | 1 个文件    | 复制 6 行 GLSL   |
| `vogelDisk`                | 1 个文件    | 复制 8 行 GLSL   |

## 附录 B: GLSL Shader Chunks 对照表

### resolveIncludes 路径映射

three-geospatial 使用 `#include "bruneton/common"` 等路径来引用 shader chunk。
需要确保 resolveIncludes 正确映射这些路径：

```typescript
const includes = {
    core: {
        depth: depthGLSL,
        math: mathGLSL,
        packing: packingGLSL,
        transform: transformGLSL,
        raySphereIntersection: raySphereIntersectionGLSL,
        cascadedShadowMaps: cascadedShadowMapsGLSL,
        interleavedGradientNoise: interleavedGradientNoiseGLSL,
        vogelDisk: vogelDiskGLSL
    },
    bruneton: {
        definitions: definitionsGLSL,
        common: commonGLSL,
        runtime: runtimeGLSL,
        precompute: precomputeGLSL
    },
    sky: skyGLSL
};
```

### 着色器 #include 依赖图

```
aerialPerspectiveEffect.vert:
  (无 include)

aerialPerspectiveEffect.frag:
  #include "core/depth"
  #include "core/math"
  #include "core/packing"
  #include "core/transform"
  #include "core/raySphereIntersection"    [ifdef HAS_SHADOW]
  #include "core/cascadedShadowMaps"      [ifdef HAS_SHADOW]
  #include "core/interleavedGradientNoise" [ifdef HAS_SHADOW]
  #include "core/vogelDisk"               [ifdef HAS_SHADOW]
  #include "bruneton/definitions"
  #include "bruneton/common"
  #include "bruneton/runtime"
  #include "sky"

sky.frag:
  #include "bruneton/definitions"
  #include "bruneton/common"
  #include "bruneton/runtime"

sky.vert:
  (无 include，但在 SkyMaterial 中会被注入 bruneton chunks)

Precompute shaders:
  #include "bruneton/definitions"
  #include "bruneton/precompute"
```

---

> 文档创建于 2025-06-05，基于对 `three-geospatial/packages/atmosphere` 和
> `@flywave/flywave-mapview` 源码的完整分析。
