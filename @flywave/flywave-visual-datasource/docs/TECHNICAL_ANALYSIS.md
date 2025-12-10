# Cesium 与 flywave.gl 地形贴合技术分析文档

## 1. Cesium 中 heightReference 实现机制分析

### 1.1 HeightReference 枚举定义

Cesium 中定义了多种高度参考类型：

```javascript
const HeightReference = {
  NONE: 0,                     // 绝对位置
  CLAMP_TO_GROUND: 1,          // 贴合到地面（地形和3D Tiles）
  RELATIVE_TO_GROUND: 2,       // 相对于地面的高度
  CLAMP_TO_TERRAIN: 3,         // 仅贴合到地形
  RELATIVE_TO_TERRAIN: 4,      // 相对于地形的高度
  CLAMP_TO_3D_TILE: 5,         // 仅贴合到3D Tiles
  RELATIVE_TO_3D_TILE: 6       // 相对于3D Tiles的高度
};
```

### 1.2 实现机制

#### 1.2.1 几何体处理
对于不同的几何体类型，Cesium 采用了不同的实现方式：

1. **点、标签、广告牌**：
   - 通过修改顶点着色器实现贴合
   - 使用 GroundPrimitive 或特殊的渲染技术

2. **线（Polyline）**：
   - 当 `clampToGround: true` 时，使用 GroundPolylinePrimitive
   - 需要 WebGL_depth_texture 扩展支持

3. **多边形（Polygon）**：
   - 当没有设置 height 和 extrudedHeight 时，自动贴合地面
   - 使用 GroundPrimitive 进行渲染

#### 1.2.2 高度计算
```javascript
// 对于 CLAMP_TO_GROUND 类型，高度设为 0
if (isHeightReferenceClamp(heightReference)) {
    return 0.0;
}

// 对于 RELATIVE_TO_GROUND 类型，高度为相对值
if (isHeightReferenceRelative(heightReference)) {
    // 获取地形高度并加上相对高度
    const terrainHeight = getTerrainHeight(position);
    return terrainHeight + relativeHeight;
}
```

### 1.3 关键技术点

1. **地形数据采样**：通过射线与地形相交计算精确高度
2. **3D Tiles 支持**：同时支持地形和 3D Tiles 的贴合
3. **实时更新**：当地形数据加载完成时自动更新位置
4. **性能优化**：使用缓存和批处理减少重复计算

## 2. flywave.gl 地形贴合机制分析

### 2.1 ElevationProvider 接口

flywave.gl 通过 ElevationProvider 接口提供地形高度查询：

```typescript
interface ElevationProvider {
    getHeight(geoPoint: GeoCoordinates, level?: number): number | undefined;
    sampleHeight(geoPoint: GeoCoordinates, tileDisplacementMap: TileDisplacementMap): number;
    // 其他方法...
}
```

### 2.2 高度获取流程

1. **地理坐标转投影坐标**：
   ```typescript
   const position = mapView.projection.projectPoint(geoCoord);
   ```

2. **获取地形高度**：
   ```typescript
   const elevation = mapView.elevationProvider?.getHeight(geoCoord) ?? 0;
   ```

3. **更新坐标**：
   ```typescript
   position = mapView.projection.projectPoint(
       new GeoCoordinates(geoCoord.latitude, geoCoord.longitude, elevation)
   );
   ```

### 2.3 现有限制

1. **静态贴合**：目前实现的是静态贴合，没有实时更新机制
2. **缺少分类类型**：没有区分地形和 3D Tiles 的贴合
3. **缺少相对高度支持**：不支持 RELATIVE_TO_GROUND 类型

## 3. 技术对比分析

| 特性 | Cesium | flywave.gl | 差异 |
|------|--------|------------|------|
| 多种高度参考类型 | ✅ 支持7种 | ❌ 仅支持绝对高度 | Cesium 更灵活 |
| 3D Tiles 支持 | ✅ 支持 | ❌ 不支持 | Cesium 功能更完整 |
| 实时更新 | ✅ 支持 | ❌ 不支持 | Cesium 更动态 |
| 性能优化 | ✅ 缓存和批处理 | ⚠️ 基础实现 | Cesium 更优化 |
| API 易用性 | ✅ 完善的 API | ⚠️ 需要手动实现 | Cesium 更易用 |

## 4. 改进建议

1. **扩展 HeightReference 枚举**：实现与 Cesium 相同的枚举类型
2. **添加实时更新机制**：监听地形数据加载完成事件并更新位置
3. **支持 3D Tiles 贴合**：扩展贴合功能以支持 3D Tiles
4. **优化性能**：添加缓存机制和批处理优化
5. **完善 API**：提供更易用的接口和配置选项