# three-geospatial 云彩渲染系统完整分析

## 目录

1. [系统总览](#1-系统总览)
2. [架构设计](#2-架构设计)
3. [坐标系与空间变换](#3-坐标系与空间变换)
4. [程序化纹理生成系统](#4-程序化纹理生成系统)
5. [云层模型 (CloudLayer)](#5-云层模型)
6. [主渲染 Pass：Raymarching 算法](#6-主渲染-pass-raymarching-算法)
7. [阴影系统 (BSM)](#7-阴影系统-bsm)
8. [光照与散射模型](#8-光照与散射模型)
9. [时域抗锯齿与上采样](#9-时域抗锯齿与上采样)
10. [大气透视集成](#10-大气透视集成)
11. [雾效 (Haze)](#11-雾效-haze)
12. [质量预设](#12-质量预设)
13. [迁移到 flywave.gl 的关键注意事项](#13-迁移到-flywavegl-的关键注意事项)

---

## 1. 系统总览

three-geospatial 的云彩系统是一个**基于体渲染的地球级实时云彩渲染器**，核心特点：

-   **基于 ECEF 坐标系**：所有计算在以地球中心为原点的 ECEF 坐标系中进行
-   **多通道渲染管线**：阴影 Pass → 云彩 Pass → 时域解算 Pass → 最终合成
-   **程序化纹理**：形状、形状细节、局部天气、湍流四种纹理全部程序化生成
-   **多层级云层**：低云、中云、高云同时渲染（最多 4 层，RGBA 四通道打包）
-   **Beer Shadow Map (BSM)**：基于 Beer-Lambert 定律的级联阴影贴图
-   **时域上采样**：低分辨率渲染 + 时域累积实现高分辨率效果

### 渲染管线流程

```
[每帧]
  1. 更新共享 Uniform（大气参数、相机位置、太阳方向、云层参数打包）
  2. 程序化纹理渲染（仅首次或 needsRender=true 时）
  3. ShadowPass:
     a. 从太阳视角 raymarch 云层，生成 BSM（DataArrayTexture）
     b. 时域解算（可选）
  4. CloudsPass:
     a. 从相机视角 raymarch 云层，生成颜色 + 透明度 + 深度速度 + 阴影长度
     b. 时域解算（上采样或TAA）
  5. CloudsEffect:
     a. 将云彩合成到场景颜色上: output = sceneColor * (1 - cloudsAlpha) + cloudsRGB
```

---

## 2. 架构设计

### TypeScript 类层次

```
CloudsEffect (postprocessing Effect)
├── CloudLayers (Array<CloudLayer>) — 4层云参数
├── CascadedShadowMaps — 级联阴影计算
├── ShadowPass (PassBase)
│   ├── ShadowMaterial (RawShaderMaterial) — shadow.frag
│   └── ShadowResolveMaterial — 时域解算
├── CloudsPass (PassBase)
│   ├── CloudsMaterial (AtmosphereMaterialBase) — clouds.frag
│   └── CloudsResolveMaterial — 时域上采样/TAA
└── 程序化纹理
    ├── LocalWeather (ProceduralTextureBase) — localWeather.frag, 512x512
    ├── CloudShape (Procedural3DTextureBase) — cloudShape.frag, 128³
    ├── CloudShapeDetail (Procedural3DTextureBase) — cloudShapeDetail.frag, 32³
    └── Turbulence (ProceduralTextureBase) — turbulence.frag, 128x128
```

### 渲染目标结构

**CloudsPass 输出** (HalfFloatType):

-   MRT Location 0: `vec4(radianceRGB, transmittance)` — 颜色 + 透明度
-   MRT Location 1: `vec3(frontDepth, velocityXY)` — 前深度 + 速度（用于时域）
-   MRT Location 2 (可选): `float shadowLength` — 阴影长度（用于光轴效果）

**ShadowPass 输出** (DataArrayTexture, HalfFloatType):

-   每层 RGBA: `vec4(frontDepth, meanExtinction, maxOpticalDepth, maxOpticalDepthTail)`
-   层数 = 级联数（2~4）

---

## 3. 坐标系与空间变换

### 坐标系定义

```
World Space → [worldToECEFMatrix] → ECEF Space
                                      ↓
                          所有云彩计算在此进行
                                      ↓
                    [ecefToWorldMatrix] → World Space
```

-   **bottomRadius**: 地球半径（从 ECEF 原点到地表），来自大气参数
-   **altitudeCorrection**: 地球椭球修正向量，纠正海拔高度误差
-   **cameraPosition (ECEF)**: `vCameraPosition = (worldToECEFMatrix * cameraPosition)`
-   **sunDirection (ECEF)**: 太阳方向（单位向量）
-   **rayDirection (ECEF)**: 通过逆投影和逆视图矩阵恢复的视线方向

### 顶点着色器中的坐标变换 (clouds.vert)

```glsl
// 从 NDC position 恢复世界空间方向
vec3 viewPosition = (inverseProjectionMatrix * vec4(position, 1.0)).xyz;
vec3 worldDirection = (inverseViewMatrix * vec4(viewPosition.xyz, 0.0)).xyz;
vec3 cameraDirection = normalize((inverseViewMatrix * vec4(0, 0, -1, 0)).xyz);

// 转换到 ECEF
vCameraPosition = (worldToECEFMatrix * vec4(cameraPosition, 1.0)).xyz;
vCameraDirection = (worldToECEFMatrix * vec4(cameraDirection, 0.0)).xyz;
vRayDirection = (worldToECEFMatrix * vec4(worldDirection, 0.0)).xyz;

// gl_Position 设为 z=1 (最远处)，用于全屏四边形
gl_Position = vec4(position.xy, 1.0, 1.0);
```

### 高度计算

云彩空间中一个点的高度为：

```
height = length(positionECEF) - bottomRadius
```

这里 `bottomRadius` 是大气层的底部半径（地球半径），`positionECEF` 包含了 `altitudeCorrection`。

### UV 映射 (getCubeSphereUv)

使用 cube-sphere 映射将 ECEF 位置投影到 2D 天气纹理 UV：

```glsl
vec3 n = normalize(position);
vec3 f = abs(n);
vec3 c = n / max(f.x, max(f.y, f.z));
// ... 复杂的 cube-sphere relax 计算
return uv * 0.5 + 0.5;
```

注意：此映射存在接缝问题（TODO 注释中提到），但实际使用中没有严重影响。

---

## 4. 程序化纹理生成系统

### 4.1 形状纹理 (CloudShape) — 3D 纹理 128³

**目的**：定义云的基本体积形状

**算法**：Perlin-Worley 混合噪声

```glsl
float getPerlinWorley(const vec3 point) {
    // Perlin 噪声 (3 octaves, frequency=8)
    float perlin = getPerlinNoise(point, 8.0, 3);
    perlin = clamp(perlin, 0.0, 1.0);

    // Worley FBM (3 frequencies: 8, 32, 56)
    vec3 noise = vec3(
        1.0 - getWorleyNoise(point, 8.0),    // 低频
        1.0 - getWorleyNoise(point, 32.0),   // 中频
        1.0 - getWorleyNoise(point, 56.0)    // 高频
    );
    float fbm = dot(noise, vec3(0.625, 0.25, 0.125)); // 加权混合

    // 用 Worley FBM 向 Perlin 噪声注入细节
    return remap(perlin, 0.0, 1.0, fbm, 1.0);
}

void main() {
    // 最终输出 = PerlinWorley remapped by WorleyFBM
    float perlinWorley = getPerlinWorley(point);
    float worleyFbm = getWorleyFbm(point);
    outputColor = remap(perlinWorley, worleyFbm - 1.0, 1.0);
}
```

**纹理参数**：

-   尺寸: 128×128×128
-   格式: RedFormat (单通道)
-   过滤: LinearFilter, RepeatWrapping (S/T/R)

**生成方式**：通过 WebGL3DRenderTarget，逐层渲染 128 次（每次设置 `layer` uniform）

### 4.2 形状细节纹理 (CloudShapeDetail) — 3D 纹理 32³

**目的**：为云添加高频细节

**算法**：纯 Worley FBM

```glsl
void main() {
    float cellCount = 2.0;
    vec4 noise = vec4(
        1.0 - getWorleyNoise(point, 2.0),    // 2 cells
        1.0 - getWorleyNoise(point, 4.0),    // 4 cells
        1.0 - getWorleyNoise(point, 8.0),    // 8 cells
        1.0 - getWorleyNoise(point, 16.0)    // 16 cells
    );
    // 3级 FBM
    vec3 fbm = vec3(
        dot(noise.xyz, vec3(0.625, 0.25, 0.125)),
        dot(noise.yzw, vec3(0.625, 0.25, 0.125)),
        dot(noise.zw, vec2(0.75, 0.25))
    );
    outputColor = dot(fbm, vec3(0.625, 0.25, 0.125));
}
```

**纹理参数**：32×32×32, RedFormat

### 4.3 局部天气纹理 (LocalWeather) — 2D 纹理 512×512

**目的**：控制不同云层的覆盖率和分布

**RGBA 四通道分别对应四种云层**：

-   **R 通道**：低云 (Low clouds) — Worley FBM, frequency=16, smoothstep(0.8, 1.4)
-   **G 通道**：中云 (Mid clouds) — Worley FBM, frequency=8, smoothstep(1.0, 1.4)
-   **B 通道**：高云 (High clouds) — Perlin noise, frequency=(6, 12, 1), 8 octaves
-   **A 通道**：额外层 — Perlin noise, frequency=32, 4 octaves

**纹理参数**：512×512, RGBAFormat, generateMipmaps=true, LinearMipMapLinearFilter

### 4.4 湍流纹理 (Turbulence) — 2D 纹理 128×128

**目的**：产生 curl 噪声，模拟云的湍流变形

**算法**：基于 Perlin 噪声的 curl noise

```glsl
vec3 perlin3d(const vec3 point) {
    // 3 个独立 Perlin 噪声 (不同旋转)
    return vec3(
        perlin(point),
        perlin(point.yzx + offset1),
        perlin(point.zxy + offset2)
    );
}

vec3 curl(vec3 point) {
    // 计算 3D 向量场的旋度
    float x = py1.z - py0.z - pz1.y + pz0.y;
    float y = pz1.x - pz0.x - px1.z + px0.z;
    float z = px1.y - px0.y - py1.x + py0.x;
    return normalize(vec3(x, y, z) / (2.0 * delta));
}

void main() {
    outputColor.rgb = 0.5 * curl(point) + 0.5; // 映射到 [0, 1]
}
```

### 4.5 噪声基础

#### Perlin 噪声 (perlin.glsl)

-   4D 周期性 Perlin 噪声
-   来自 GLM 库移植
-   使用 Taylor 级数展开和 4D 哈希排列
-   输出范围约 [-1, 1]，乘以 2.2

#### Tileable 噪声 (tileableNoise.glsl)

-   包含 Worley 噪声和 Perlin 噪声包装
-   **Worley 噪声**：检查 3×3×3 邻域的特征点，返回到最近特征点的距离
-   **Perlin 噪声**：调用 perlin.glsl 的 4D 周期版本，多八度累加（频率每倍 ×2，振幅 ×0.5）

---

## 5. 云层模型

### CloudLayer 参数

每个云层包含以下参数：

| 参数                | 说明             | 默认值 (低云)      |
| ------------------- | ---------------- | ------------------ |
| channel             | 天气纹理中的通道 | 'r'                |
| altitude            | 云层底部海拔     | 750                |
| height              | 云层厚度         | 650                |
| densityScale        | 密度缩放         | 0.2                |
| shapeAmount         | 形状纹理影响量   | 1                  |
| shapeDetailAmount   | 形状细节影响量   | 1                  |
| weatherExponent     | 天气数据指数     | 1                  |
| shapeAlteringBias   | 形状变换偏置     | 0.35               |
| coverageFilterWidth | 覆盖率过滤宽度   | 0.6                |
| shadow              | 是否参与阴影计算 | true               |
| densityProfile      | 密度剖面函数     | (0, 0, 0.75, 0.25) |

### 默认四层配置 (CloudLayers.DEFAULT)

| 层   | 通道 | 海拔  | 厚度  | 密度  | 形状量 | 阴影  |
| ---- | ---- | ----- | ----- | ----- | ------ | ----- |
| 低云 | R    | 750m  | 650m  | 0.2   | 1.0    | true  |
| 中云 | G    | 1000m | 1200m | 0.2   | 1.0    | true  |
| 高云 | B    | 7500m | 500m  | 0.003 | 0.4    | false |
| 额外 | A    | 0     | 0     | —     | —      | false |

### 密度剖面函数 (DensityProfile)

```
density(h) = expTerm * exp(exponent * h_fraction) + linearTerm * h_fraction + constantTerm
```

默认值 `(0, 0, 0.75, 0.25)` 表示：

-   `expTerm = 0, exponent = 0` → 无指数项
-   `linearTerm = 0.75, constantTerm = 0.25` → 线性密度: `0.75 * h + 0.25`

### 四层打包机制

为了高效渲染，四层云被打包成 vec4，在单个 shader pass 中同时处理：

```glsl
// 四层的高度范围打包成 vec4
uniform vec4 minLayerHeights;   // [低云底, 中云底, 高云底, 额外底]
uniform vec4 maxLayerHeights;   // [低云顶, 中云顶, 高云顶, 额外顶]

// 密度剖面打包成 4 个 vec4
uniform CloudDensityProfile densityProfile; // 每个分量对应一层

// 密度计算（一次性四层）
vec4 getLayerDensity(const vec4 heightFraction) {
    return densityProfile.expTerms * exp(densityProfile.exponents * heightFraction) +
           densityProfile.linearTerms * heightFraction +
           densityProfile.constantTerms;
}
```

### 区间编码 (Interval Encoding)

`packIntervalHeights` 方法将四层的高度区间编码为最多 3 个不重叠的区间：

```
低云: [750, 1400], 中云: [1000, 2200], 高云: [7500, 8000]
→ 区间0: [750, 1000]   (仅低云)
→ 区间1: [1000, 1400]  (低云+中云)
→ 区间2: [1400, 2200]  (仅中云)
→ (高云独立在 7500-8000)
```

这用于在 raymarching 中快速跳过无云的高度区域。

---

## 6. 主渲染 Pass：Raymarching 算法

### 6.1 入口函数 (clouds.frag main)

```glsl
void main() {
    // 1. 计算相机位置和射线方向（ECEF）
    vec3 cameraPosition = vCameraPosition + altitudeCorrection;
    vec3 rayDirection = normalize(vRayDirection);
    float cosTheta = dot(sunDirection, rayDirection);

    // 2. 计算射线与球层的交点
    IntersectionResult intersections = getIntersections(cameraPosition, rayDirection);
    vec2 rayNearFar = getRayNearFar(intersections);

    // 3. 限制射线到场景深度
    float rayDistanceToScene = getRayDistanceToScene(rayDirection, sceneViewZ);
    rayNearFar.y = min(rayNearFar.y, rayDistanceToScene);

    // 4. 获取时域抖动噪声
    float stbn = getSTBN(); // Spatiotemporal Blue Noise

    // 5. 执行 Raymarching
    color = marchClouds(rayOrigin, rayDirection, rayNearFar, cosTheta, stbn, ...);

    // 6. 如果命中云，计算大气透视和速度
    if (hitClouds) {
        applyAerialPerspective(cameraPosition, frontPosition, shadowLength, color);
        // 计算 reprojection velocity
    }

    // 7. 雾效混合
    vec4 haze = approximateHaze(...);
    color.rgb = mix(color.rgb, haze.rgb, haze.a);

    // 8. 输出 MRT
    outputColor = color;          // RGBA: radiance + transmittance
    outputDepthVelocity = ...;    // 前深度 + 速度
    outputShadowLength = ...;     // 阴影长度
}
```

### 6.2 射线-球层相交计算

```glsl
IntersectionResult getIntersections(vec3 cameraPosition, vec3 rayDirection) {
    // 检查是否击中地面
    intersections.ground = rayIntersectsGround(cameraPosition, rayDirection);

    // 与四个球面求交（底面, minHeight, maxHeight, shadowTopHeight）
    raySphereIntersections(
        cameraPosition, rayDirection,
        bottomRadius + vec4(0.0, minHeight, maxHeight, shadowTopHeight),
        intersections.first, intersections.second
    );
    return intersections;
}
```

**根据相机高度分三种情况确定 near/far**：

| 相机位置 | 地面遮挡 | rayNear                | rayFar                              |
| -------- | -------- | ---------------------- | ----------------------------------- |
| 云层下方 | 是       | -1 (无云)              | —                                   |
| 云层下方 | 否       | 第二交点.y (minH 入射) | 第二交点.z (maxH 出射)              |
| 云层内部 | 是       | cameraNear             | 第一交点.y (minH)                   |
| 云层内部 | 否       | cameraNear             | 第二交点.z (maxH)                   |
| 云层上方 | 是       | 第一交点.z (maxH 入射) | 第二交点.z (maxH 出射)，限制到 minH |

### 6.3 核心 Raymarching (marchClouds)

```glsl
vec4 marchClouds(rayOrigin, rayDirection, rayNearFar, cosTheta, jitter, ...) {
    vec3 radianceIntegral = vec3(0.0);
    float transmittanceIntegral = 1.0;

    float stepSize = minStepSize + (perspectiveStepScale - 1.0) * rayNearFar.x;
    float rayDistance = stepSize * jitter * 2.0;

    for (int i = 0; i < maxIterationCount; ++i) {
        if (rayDistance > maxRayDistance) break;

        vec3 position = rayDistance * rayDirection + rayOrigin;
        float height = length(position) - bottomRadius;
        float mipLevel = log2(max(1.0, rayStartTexelsPerPixel + rayDistance * 1e-5));

        // 跳过无云区间
        if (insideLayerIntervals(height)) {
            stepSize *= perspectiveStepScale;
            rayDistance += mix(stepSize, maxStepSize, min(1.0, mipLevel));
            continue;
        }

        // 1. 采样粗略天气
        WeatherSample weather = sampleWeather(uv, height, mipLevel);

        // 跳过低密度区域（空步进优化）
        if (!any(greaterThan(weather.density, vec4(minDensity)))) {
            stepSize *= perspectiveStepScale;
            rayDistance += mix(stepSize, maxStepSize, min(1.0, mipLevel));
            continue;
        }

        // 2. 采样详细介质属性
        MediaSample media = sampleMedia(weather, position, uv, mipLevel, jitter);

        if (media.extinction > minExtinction) {
            // 3. 计算光照
            vec3 sunIrradiance = getCloudsSunSkyIrradiance(position, height, skyIrradiance);

            // 4. 向太阳方向 march 光学深度
            float opticalDepth = marchOpticalDepth(
                position, sunDirection, maxIterationCountToSun, mipLevel, jitter
            );

            // 5. 加入 BSM 阴影
            if (height < shadowTopHeight) {
                opticalDepth += sampleShadowOpticalDepth(position, ...);
            }

            // 6. 多次散射近似
            vec3 radiance = sunIrradiance * approximateMultipleScattering(opticalDepth, cosTheta);

            // 7. 地面反射光
            radiance += approximateRadianceFromGround(position, normal, height, ...);

            // 8. 天空梯度
            radiance += skyIrradiance * skyGradient * skyLightScale;

            // 9. 散射系数
            radiance *= media.scattering;

            // 10. Powder 效果
            radiance *= 1.0 - powderScale * exp(-media.extinction * powderExponent);

            // 11. 能量守恒的解析积分
            float transmittance = exp(-media.extinction * stepSize);
            vec3 scatteringIntegral = (radiance - radiance * transmittance) / clampedExtinction;
            radianceIntegral += transmittanceIntegral * scatteringIntegral;
            transmittanceIntegral *= transmittance;
        }

        // 早期终止
        if (transmittanceIntegral <= minTransmittance) break;

        stepSize *= perspectiveStepScale;
        rayDistance += stepSize;
    }

    return vec4(radianceIntegral, remapClamped(transmittanceIntegral, 1.0, minTransmittance));
}
```

### 6.4 天气采样 (sampleWeather)

```glsl
WeatherSample sampleWeather(uv, height, mipLevel) {
    // 1. 计算归一化高度（每层独立）
    weather.heightFraction = remapClamped(height, minLayerHeights, maxLayerHeights);

    // 2. 采样天气纹理
    vec4 localWeather = pow(
        textureLod(localWeatherTexture, uv * repeat + offset, mipLevel).CHANNELS,
        weatherExponents
    );

    // 3. 形状变换：半圆变换使云顶圆润
    vec4 heightScale = shapeAlteringFunction(heightFraction, shapeAlteringBiases);
    // shapeAlteringFunction: biased = pow(h, bias); x = biased*2-1; return 1 - x*x

    // 4. 覆盖率调制
    vec4 factor = 1.0 - coverage * heightScale;
    weather.density = remapClamped(
        mix(localWeather, vec4(1.0), coverageFilterWidths),
        factor, factor + coverageFilterWidths
    );
    return weather;
}
```

### 6.5 介质采样 (sampleMedia)

```glsl
MediaSample sampleMedia(weather, position, uv, mipLevel, jitter) {
    vec4 density = weather.density;

    // 1. 湍流偏移
    vec3 turbulence = turbulenceDisplacement *
        (texture(turbulenceTexture, uv * repeat).rgb * 2.0 - 1.0) *
        dot(density, remapClamped(weather.heightFraction, vec4(0.3), vec4(0.0)));

    // 2. 云演化偏移（沿法线方向移动）
    vec3 evolution = -surfaceNormal * localWeatherSpeed * 2e4;

    // 3. 采样形状纹理
    vec3 shapePosition = (position + evolution + turbulence) * shapeRepeat + shapeOffset;
    float shape = texture(shapeTexture, shapePosition).r;
    density = remapClamped(density, vec4(1.0 - shape) * shapeAmounts, vec4(1.0));

    // 4. 采样形状细节纹理（条件性，受 mipLevel 和 jitter 控制）
    if (mipLevel * 0.5 + (jitter - 0.5) * 0.5 < 0.5) {
        float detail = texture(shapeDetailTexture, detailPosition).r;
        // 底部细长，顶部蓬松
        vec4 modifier = mix(vec4(pow(detail, 6.0)), vec4(1.0 - detail),
                           remapClamped(weather.heightFraction, vec4(0.2), vec4(0.4)));
        density = remapClamped(density * 2.0, vec4(modifier * 0.5), vec4(1.0));
    }

    // 5. 应用密度剖面
    density = saturate(density * densityScales * getLayerDensity(weather.heightFraction));

    // 6. 计算散射和消光
    float densitySum = density.x + density.y + density.z + density.w;
    media.weight = density / densitySum;
    media.scattering = densitySum * scatteringCoefficient;
    media.extinction = densitySum * absorptionCoefficient + media.scattering;
    return media;
}
```

---

## 7. 阴影系统 (BSM)

### 7.1 级联阴影贴图 (CascadedShadowMaps)

BSM (Beer Shadow Map) 从**太阳视角**渲染云层的光学深度。

**级联分割**：

-   使用 practical split mode，splitLambda=0.6
-   根据 camera.near 和 shadowFar 分割视锥体
-   每级覆盖不同距离范围，近处精度高

**正交投影矩阵**：

-   每级的视锥体半径由 frustum corner 对角线决定
-   texel snapping：将平移量化到纹理像素单位，避免抖动
-   距离衰减：太阳在天顶时 distance=1e6，接近地平线时 distance=1e3

### 7.2 阴影 Raymarching (shadow.frag)

```glsl
vec4 marchClouds(rayOrigin, rayDirection, maxRayDistance, jitter, mipLevel) {
    // 使用 Structured Volume Sampling (SVS)
    vec3 normal = getStructureNormal(rayDirection, jitter);
    intersectStructuredPlanes(normal, rayOrigin, rayDirection, samplePeriod, rayDistance, stepSize);

    float extinctionSum = 0.0;
    float maxOpticalDepth = 0.0;
    float transmittanceIntegral = 1.0;

    for (int i = 0; i < maxIterationCount; ++i) {
        if (rayDistance > maxRayDistance) break;

        // 采样天气和介质（与主 pass 相同的 sampleWeather/sampleMedia）
        WeatherSample weather = sampleWeather(uv, height, mipLevel);
        MediaSample media = sampleMedia(weather, position, uv, mipLevel, jitter);

        if (media.extinction > minExtinction) {
            extinctionSum += media.extinction;
            maxOpticalDepth += media.extinction * stepSize;
            transmittanceIntegral *= exp(-media.extinction * stepSize);
        }

        if (transmittanceIntegral <= minTransmittance) {
            // 估计尾部光学深度
            maxOpticalDepthTail = min(
                opticalDepthTailScale * stepSize * exp(float(1 - sampleCount)),
                stepSize * 0.5
            );
            break;
        }
        rayDistance += stepSize;
    }

    return vec4(frontDepth, meanExtinction, maxOpticalDepth, maxOpticalDepthTail);
}
```

**BSM 输出格式**：

-   R: frontDepth — 云前缘到太阳的距离
-   G: meanExtinction — 平均消光系数
-   B: maxOpticalDepth — 累积光学深度
-   A: maxOpticalDepthTail — 尾部光学深度估计

### 7.3 阴影读取 (sampleShadowOpticalDepth)

主 pass 中读取 BSM 的逻辑：

```glsl
float readShadowOpticalDepth(uv, distanceToTop, distanceOffset, cascadeIndex) {
    vec4 shadow = texture(shadowBuffer, vec3(uv, cascadeIndex));
    float distanceToFront = max(0.0, distanceToTop - distanceOffset - shadow.r);
    return min(shadow.b + shadow.a, shadow.g * distanceToFront);
}
```

**级联选择**：

```glsl
int getFadedCascadeIndex(viewMatrix, worldPosition, shadowIntervals, cameraNear, shadowFar, jitter) {
    // 根据深度选择级联
    // 在级联边界处淡入淡出，避免接缝
}
```

**PCF 过滤**：

-   使用 Vogel disk sampling + interleaved gradient noise 旋转
-   16 个采样点，仅在太阳接近地平线时启用大半径过滤

### 7.4 Structured Volume Sampling (SVS)

阴影 pass 使用 SVS 替代等距采样：

```glsl
// 基于 icosahedral 方向的体采样
void getIcosahedralVertices(direction, out v1, out v2, out v3) {
    // 根据 ray direction 选择 3 个 icosahedron 顶点
    // 形成一组平行的采样平面
}

void intersectStructuredPlanes(normal, rayOrigin, rayDirection, samplePeriod,
                                out stepOffset, out stepSize) {
    float NoD = dot(rayDirection, normal);
    stepSize = samplePeriod / abs(NoD);
    stepOffset = -mod(dot(rayOrigin, normal), samplePeriod) / NoD;
}
```

**优势**：时域稳定，适合低分辨率阴影贴图。

---

## 8. 光照与散射模型

### 8.1 相位函数 (Phase Function)

**默认（双 Henyey-Greenstein 混合）**：

```glsl
vec2 henyeyGreenstein(vec2 g, float cosTheta) {
    vec2 g2 = g * g;
    return RECIPROCAL_PI4 *
        ((1.0 - g2) / max(vec2(1e-7), pow(1.0 + g2 - 2.0 * g * cosTheta, vec2(1.5))));
}

float phaseFunction(cosTheta) {
    vec2 g = vec2(0.7, -0.2);     // 前向和后向散射
    vec2 weights = vec2(0.5, 0.5);
    return dot(henyeyGreenstein(g, cosTheta), weights);
}
```

**精确模式 (ACCURATE_PHASE_FUNCTION)**：

-   使用 Draine 相位函数
-   基于 NVIDIA 的 approximate-Mie 研究
-   参数拟合自大粒子 (d=10) 的 Mie 散射

### 8.2 多次散射近似

```glsl
float approximateMultipleScattering(opticalDepth, cosTheta) {
    vec3 coeffs = vec3(1.0); // [attenuation, contribution, phaseAttenuation]
    vec3 attenuation = vec3(0.5); // a <= b 的约束
    float scattering = 0.0;

    for (int i = 0; i < MULTI_SCATTERING_OCTAVES; ++i) { // 默认 8 次
        float beerLambert = exp(-opticalDepth * coeffs.y);
        scattering += coeffs.x * beerLambert * phaseFunction(cosTheta, coeffs.z);
        coeffs *= attenuation;
    }
    return scattering;
}
```

参考：https://fpsunflower.github.io/ckulla/data/oz_volumes.pdf

每次迭代中：

-   `coeffs.x`：贡献系数（递减）
-   `coeffs.y`：光学深度缩放（递减，模拟更高次散射对 OD 的敏感度降低）
-   `coeffs.z`：相位函数各向异性衰减（递减，高次散射更各向同性）

### 8.3 太阳/天空辐照度

**精确模式 (ACCURATE_SUN_SKY_LIGHT)**：

```glsl
vec3 getCloudsSunSkyIrradiance(position, height, out skyIrradiance) {
    return GetSunAndSkyScalarIrradiance(position * METER_TO_LENGTH_UNIT, sunDirection, skyIrradiance);
}
```

使用 Bruneton 大气模型计算。

**快速模式**：

```glsl
// 预计算最低和最高云层高度的辐照度，按高度线性插值
float alpha = remapClamped(height, minHeight, maxHeight);
skyIrradiance = mix(vCloudsIrradiance.minSky, vCloudsIrradiance.maxSky, alpha);
return mix(vCloudsIrradiance.minSun, vCloudsIrradiance.maxSun, alpha);
```

### 8.4 地面反射 (GROUND_BOUNCE)

```glsl
vec3 approximateRadianceFromGround(position, normal, height, mipLevel, jitter) {
    // 向地面方向 march 光学深度
    float opticalDepthToGround = marchOpticalDepth(
        position, -normal, maxIterationCountToGround, mipLevel, jitter
    );

    // 地面辐照度 = 天空辐照度 + (1-coverage) * 太阳辐照度
    vec3 groundIrradiance = skyIrradiance + (1.0 - coverage) * sunIrradiance;

    // Lambertian 反射
    float groundAlbedo = 0.3;
    vec3 bouncedRadiance = groundAlbedo * RECIPROCAL_PI * groundIrradiance;

    // Beer-Lambert 衰减
    return bouncedRadiance * exp(-opticalDepthToGround);
}
```

### 8.5 Powder 效果

```glsl
radiance *= 1.0 - powderScale * exp(-media.extinction * powderExponent);
```

模拟大量粒子聚集时的暗化效果（从密集云的边缘看更亮，从内部看更暗）。

---

## 9. 时域抗锯齿与上采样

### 9.1 时域上采样 (Temporal Upscale)

**默认模式**：以 1/4 分辨率渲染云彩，通过时域累积上采样到全分辨率。

**Bayer 抖动模式**：

-   4×4 Bayer 矩阵，16 帧循环
-   每帧抖动投影矩阵的元素 [8] 和 [9]（NDC xy 偏移）
-   第 N 帧渲染对应 Bayer 位置的高分辨率像素

```glsl
// cloudsResolve.frag
ivec2 lowResCoord = coord / 4;
int bayerValue = bayerIndices[coord.x % 4][coord.y % 4];
bool currentFrame = bayerValue == frame % 16;

if (currentFrame) {
    outputColor = currentColor; // 直接使用，不累积
} else {
    // 从历史帧累积
    vec4 depthVelocity = getClosestFragment(lowResCoord);
    vec2 prevUv = vUv - depthVelocity.gb;
    vec4 historyColor = texture(colorHistoryBuffer, prevUv);
    vec4 clippedColor = varianceClipping(colorBuffer, vUv, currentColor, historyColor, gamma);
    outputColor = clippedColor;
}
```

### 9.2 Variance Clipping

```glsl
vec4 varianceClipping(inputBuffer, coord, current, history, gamma) {
    // 1. 计算邻域统计量
    vec4 moment1 = current;
    vec4 moment2 = current * current;
    for (int i = 0; i < 8; ++i) {
        neighbor = texelFetchOffset(inputBuffer, coord, 0, varianceOffsets[i]);
        moment1 += neighbor;
        moment2 += neighbor * neighbor;
    }

    // 2. 计算均值和方差
    vec4 mean = moment1 / N;
    vec4 stdDev = sqrt(max(moment2 / N - mean * mean, 0.0)) * gamma;

    // 3. AABB 裁剪历史值
    vec4 minColor = mean - stdDev;
    vec4 maxColor = mean + stdDev;
    return clipAABB(clamp(mean, minColor, maxColor), history, minColor, maxColor);
}
```

### 9.3 速度计算

云彩前深度的 reprojection 用于时域累积：

```glsl
// 在 ECEF 中计算前深度位置
vec3 frontPosition = cameraPosition + frontDepth * rayDirection;
// 转换到世界空间
vec3 frontPositionWorld = ecefToWorld(frontPosition);
// 使用上一帧的投影矩阵
vec4 prevClip = reprojectionMatrix * vec4(frontPositionWorld, 1.0);
prevClip /= prevClip.w;
vec2 prevUv = prevClip.xy * 0.5 + 0.5;
vec2 velocity = vUv - prevUv;
depthVelocity = vec3(frontDepth, velocity);
```

---

## 10. 大气透视集成

云彩渲染完成后，应用大气透视效果（空气感）：

```glsl
void applyAerialPerspective(cameraPosition, frontPosition, shadowLength, inout color) {
    vec3 transmittance;
    vec3 inscatter = GetSkyRadianceToPoint(
        cameraPosition * METER_TO_LENGTH_UNIT,
        frontPosition * METER_TO_LENGTH_UNIT,
        shadowLength * METER_TO_LENGTH_UNIT,
        sunDirection,
        transmittance
    );
    // 颜色 *= 透射率 + 内散射 * 云的透明度
    color.rgb = color.rgb * transmittance + inscatter * color.a;
}
```

注意：`shadowLength` 限制了大气散射计算中的光轴长度，使云后的大气也受到云阴影的影响。

---

## 11. 雾效 (Haze)

当 `HAZE` 宏启用时，添加解析雾效：

```glsl
vec4 approximateHaze(rayOrigin, rayDirection, maxRayDistance, cosTheta, shadowLength) {
    // 指数衰减的雾密度
    float density = coverage * hazeDensityScale * exp(-cameraHeight * hazeExponent);

    // 混合两个法线（地面法线和地平线法线）
    vec3 normal = mix(normalAtOrigin, normalAtHorizon, alpha);

    // 解析光学深度（基于 iquilezles.org/articles/fog）
    float angle = max(dot(normal, rayDirection), 1e-5);
    float exponent = angle * hazeExponent;
    float linearTerm = density / hazeExponent / angle;

    // 分离有无阴影的光学深度
    float expTerm = 1.0 - exp(-maxRayDistance * exponent);
    float shadowExpTerm = 1.0 - exp(-min(maxRayDistance, shadowLength) * exponent);

    // 内散射 = 太阳 * 相位函数 * 阴影透射率 + 天空 * 透射率
    vec3 inscatter = sunIrradiance * phaseFunction(cosTheta) * shadowTransmittance;
    inscatter += skyIrradiance * RECIPROCAL_PI4 * skyLightScale * transmittance;
    return vec4(inscatter, transmittance);
}
```

---

## 12. 质量预设

| 参数         | Low | Medium | High | Ultra    |
| ------------ | --- | ------ | ---- | -------- |
| 光轴效果     | ✗   | ✗      | ✓    | ✓        |
| 形状细节     | ✗   | ✓      | ✓    | ✓        |
| 湍流         | ✗   | ✗      | ✓    | ✓        |
| 精确光照     | ✗   | ✗      | ✓    | ✓        |
| 主迭代数     | 200 | 500    | 500  | 500      |
| 最小步长     | 100 | 50     | 50   | **10**   |
| 最大射线距离 | 1e5 | 2e5    | 2e5  | 2e5      |
| 最小透射率   | 0.1 | 0.01   | 0.01 | 0.01     |
| 向太阳迭代   | 1   | 2      | 2    | 2        |
| 向地面迭代   | 0   | 1      | 3    | 3        |
| 阴影级联数   | 2   | 3      | 3    | 3        |
| 阴影贴图大小 | 256 | 256    | 512  | **1024** |
| 阴影迭代数   | 25  | 50     | 50   | 50       |

---

## 13. 迁移到 flywave.gl 的关键注意事项

### 13.1 原始实现的架构特征

1. **纯 WebGL2/GLSL3**：使用 `RawShaderMaterial` + `postprocessing` 库的 `Effect`/`Pass`/`ShaderPass`
2. **Effect 合成**：`CloudsEffect` 是一个 postprocessing Effect，通过 `cloudsEffect.frag` 合成到主场景
3. **全屏四边形**：使用 NDC `gl_Position = vec4(position.xy, 1.0, 1.0)`
4. **MRT 输出**：使用 `layout(location = N)` 多渲染目标
5. **Bruneton 大气模型**：通过 `@takram/three-atmosphere` 提供 LUT 纹理和着色器函数

### 13.2 迁移到 WebGPU/TSL 的核心挑战

1. **GLSL → WGSL/TSL**：不能直接使用 GLSL 着色器，需要重写为 TSL 节点图
2. **postprocessing → RenderPipeline**：flywave.gl 使用 three.js 的 `RenderPipeline`，不使用 postprocessing 库
3. **Data3DTexture → Storage3DTexture**：WebGPU 使用不同的 3D 纹理类型和绑定方式
4. **MRT → renderTarget Node**：WebGPU 的 MRT 需要不同的配置方式
5. **时域上采样**：需要在 WebGPU 管线中实现等效的低分辨率渲染 + reprojection 机制
6. **BSM**：级联阴影贴图需要在 WebGPU 中使用 `WebGLArrayRenderTarget` 的等价物
7. **Bruneton 大气**：flywave.gl 已有自己的大气 LUT 系统，需要对接

### 13.3 迁移建议策略

**第一步：纹理生成**

-   将 4 种程序化纹理生成器（形状、形状细节、天气、湍流）移植为 WebGPU compute shader 或 TSL
-   这是独立于渲染管线的，可以先行验证

**第二步：简化版云彩渲染**

-   先实现最简单的单层云 raymarching，不含阴影、不含时域上采样
-   验证 raymarching 核心逻辑在 WebGPU 中正确工作
-   使用 flywave.gl 已有的 `RenderTargetNode` 进行全屏渲染

**第三步：逐步添加功能**

-   加入多层云打包
-   加入 BSM 阴影系统
-   加入多次散射近似
-   加入时域上采样

**第四步：优化**

-   调整质量参数
-   验证性能

### 13.4 关键算法清单（不可遗漏）

1. **sampleWeather**：天气采样 + 覆盖率调制 + 形状变换
2. **sampleMedia**：形状/细节纹理采样 + 密度剖面 + 湍流偏移
3. **marchClouds**：主 raymarching 循环（透视步长、空步进、早期终止）
4. **marchOpticalDepth**：二次 raymarching（向太阳/地面方向）
5. **approximateMultipleScattering**：多次散射近似（8 octave 迭代）
6. **phaseFunction**：双 HG 相位函数
7. **sampleShadowOpticalDepth**：BSM 读取 + PCF
8. **applyAerialPerspective**：大气透视
9. **getCubeSphereUv**：球面到 UV 映射
10. **Structured Volume Sampling**：阴影 pass 的体采样方法
11. **Variance Clipping**：时域累积的颜色裁剪
12. **Bayer jitter + temporal upscale**：低分辨率到高分辨率的时域上采样
