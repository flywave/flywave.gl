# 视椎剔除GeoBox测试

这个测试验证了视椎剔除算法的正确性，测试了从TileKey到GeoBox再到OrientedBox3的完整流程，并使用OrientedBox3的intersects方法进行视椎剔除检查。

## 测试目标

验证以下流程的正确性：
1. 使用 `geographicTerrainStandardTiling` 将 `tileKey` 转为 `GeoBox`
2. 使用 `projection` 将 `GeoBox` 转为 `OrientedBox3`
3. 使用 `OrientedBox3` 中的 `intersects` 方法进行剔除检查
4. 查看结果是否正确

## 相机参数

- **世界矩阵**:
  ```
  [
    0.5432974135116533, 0.6898197582194543, -0.4785150171536949, 0,
    -0.6493203781569559, 0.7065619533364914, 0.2813418785168874, 0,
    0.5321756918364856, 0.1578572369812847, 0.831787308000653, 0,
    -2425041.7472774643, 4526239.929326517, 3771607.494102686, 1
  ]
  ```

- **投影矩阵**:
  ```
  [
    1.4376083581701098, 0, 0, 0,
    0, 2.7474774194546225, 0, 0,
    0, 0, -1.6448979591836732, -1,
    0, 0, -811.4811041403531, 0
  ]
  ```

## 测试流程

1. **TileKey -> GeoBox**: 使用 `geographicTerrainStandardTiling.getGeoBox(tileKey)` 方法将瓦片键转换为地理边界框
2. **GeoBox -> OrientedBox3**: 使用 `normalizedEquirectangularProjection.projectBox(geoBox, new OrientedBox3())` 方法将地理边界框投影为定向边界框
3. **视椎剔除检查**: 使用 `orientedBox.intersects(frustum)` 方法检查定向边界框是否与视椎相交
4. **结果验证**: 根据相交结果判断瓦片是否应该被渲染或剔除

## 核心概念

- **TileKey**: 表示地图瓦片的唯一标识符，包含层级、行号和列号
- **GeoBox**: 表示地理空间的边界框，包含经度、纬度和高度范围
- **OrientedBox3**: 表示3D空间中的定向边界框，可用于精确的相交测试
- **视椎剔除**: 一种优化技术，用于剔除不在相机视椎内的瓦片，提高渲染性能

## 算法验证

测试验证了整个算法流程的正确性，确保：
- TileKey转换为GeoBox的准确性
- GeoBox到OrientedBox3投影的正确性
- 视椎相交测试的可靠性
- 剔除决策的合理性