---
title: flywave.gl 中的坐标系与投影算法详解
tags: [3d-maps, gis, projection, coordinate-system]
---

# flywave.gl 中的坐标系与投影算法详解

在 3D 地图渲染引擎 flywave.gl 中，坐标系和投影算法是实现地理数据可视化的核心技术。本文将深入探讨 flywave.gl 中实现的不同投影算法，以及它们在坐标转换中的应用。

## 地理坐标系统基础

在开始探讨投影算法之前，我们需要了解基本的地理坐标系统：

- **经度 (Longitude)**: 从 -180° 到 +180°，表示东西方向的位置
- **纬度 (Latitude)**: 从 -90° 到 +90°，表示南北方向的位置
- **高度 (Altitude)**: 相对于参考椭球体的高度，单位为米

## 三种主要投影类型

flywave.gl 实现了三种主要的投影类型，每种都适用于不同的应用场景。

### 1. 椭球投影 (Ellipsoid Projection)

椭球投影使用 WGS84 椭球模型，这是最接近地球实际形状的数学模型。

#### 坐标系特点
- **三维笛卡尔坐标系 (ECEF)**:
  - X轴: 本初子午线与赤道的交点
  - Y轴: 东经90°与赤道的交点
  - Z轴: 指向北极点

![ECEF坐标系示意图](/img/ecef-coordinate-system.svg)

#### 算法原理
椭球投影将地理坐标转换为 ECEF 坐标的公式为：

```
x = (N + h) * cos(φ) * cos(λ)
y = (N + h) * cos(φ) * sin(λ)
z = (N * (1 - e²) + h) * sin(φ)
```

其中：
- N: 卯酉圈曲率半径
- h: 高度
- φ: 纬度
- λ: 经度
- e²: 第一偏心率的平方

椭球投影的优点是精度高，能够精确表示地球表面的几何关系，适用于高精度的地理计算。

### 2. 球面投影 (Sphere Projection)

球面投影将地球简化为一个完美球体，适用于对精度要求稍低但性能要求较高的场景。

#### 坐标系特点
- 与椭球投影类似，但地球被建模为球体
- 保持了三维笛卡尔坐标系的结构

![球面投影示意图](/img/sphere-projection.svg)

球面投影的计算相对简化，适用于全球范围的可视化应用。

### 3. 平面投影 (Planar Projection) - 墨卡托投影

平面投影将地球表面投影到一个平面，最常见的是墨卡托投影。

#### 墨卡托投影坐标系
- 将地球展开为平面矩形
- 经度线映射为等间距的垂直线
- 纬度线映射为间距递增的水平线

![墨卡托投影平面坐标系](/img/mercator-projection.svg)

墨卡托投影的转换公式为：
```
x = (λ + π) * R / (2π)
y = R * ln[tan(π/4 + φ/2)]
```

其中 R 是地球半径，λ 是经度（弧度），φ 是纬度（弧度）。

Web墨卡托投影是墨卡托投影的变种，广泛应用于网络地图服务。

## flywave.gl 中的投影实现

在 flywave.gl 的 `@flywave/flywave-geoutils` 模块中，投影系统通过以下类实现：

### 投影接口

```typescript
interface Projection {
    projectPoint(geoPoint: GeoCoordinates, result?: Vector3): Vector3;
    unprojectPoint(worldPoint: Vector3): GeoCoordinates;
    worldExtent(minAltitude: number, maxAltitude: number, result?: Box3): Box3;
    // ... 其他方法
}
```

### 主要投影类

1. **EllipsoidProjection**: 实现 WGS84 椭球投影
2. **SphereProjection**: 实现球面投影  
3. **MercatorProjection**: 实现墨卡托投影
4. **WebMercatorProjection**: 实现 Web 墨卡托投影

## 应用场景

- **椭球投影**: 适用于高精度 GIS 应用、地形渲染
- **球面投影**: 适用于全球范围的可视化、性能优先的应用
- **平面投影**: 适用于局部区域地图、导航应用

## 总结

flywave.gl 的投影系统提供了完整的坐标转换解决方案，能够满足不同精度和性能要求的应用场景。通过合理选择投影类型，开发者可以根据具体需求优化地图渲染效果和计算性能。
