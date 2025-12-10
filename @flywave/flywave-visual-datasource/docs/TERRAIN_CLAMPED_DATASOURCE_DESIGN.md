# TerrainClampedDataSource 设计文档

## 1. 概述

TerrainClampedDataSource 是一个专门用于渲染贴合地形的自定义特征的数据源，它遵循 flywave.gl 的 DataSource 模式，与现有的 features-datasource 保持接口一致性。

## 2. 架构设计

### 2.1 类结构

```
TerrainClampedDataSource
├── extends VectorTileDataSource
├── implements TerrainClampedFeature management
├── integrates GPU-based terrain clamping
└── provides DataSource-compatible API
```

### 2.2 核心组件

1. **TerrainClampedDataSource** - 主数据源类
2. **TerrainClampedFeature** - 贴合地形特征基类
3. **GPU Terrain Clamping System** - GPU 贴合系统集成
4. **HeightReference System** - 高度参考系统

## 3. API 设计

### 3.1 TerrainClampedDataSource 类

```typescript
export interface TerrainClampedDataSourceOptions extends VectorTileDataSourceParameters {
    /**
     * 初始特征集
     */
    features?: TerrainClampedFeature[];
    
    /**
     * 初始 GeoJSON 数据
     */
    geojson?: FeatureCollection | GeometryCollection | Feature;
    
    /**
     * 高度参考类型
     */
    heightReference?: HeightReference;
    
    /**
     * 分类类型（地形、3D Tiles 或两者）
     */
    classificationType?: ClassificationType;
}

export class TerrainClampedDataSource extends VectorTileDataSource {
    constructor(options?: TerrainClampedDataSourceOptions);
    
    /**
     * 添加贴合地形的特征
     */
    add(...features: TerrainClampedFeature[]): this;
    
    /**
     * 移除特征
     */
    remove(...features: TerrainClampedFeature[]): this;
    
    /**
     * 清除所有特征
     */
    clear(): void;
    
    /**
     * 从 GeoJSON 设置数据
     */
    setFromGeojson(geojson: FeatureCollection | GeometryCollection | Feature): this;
    
    /**
     * 获取包围盒
     */
    getGeoBox(): GeoBox | undefined;
    
    /**
     * 设置高度参考类型
     */
    setHeightReference(heightReference: HeightReference): void;
    
    /**
     * 设置分类类型
     */
    setClassificationType(classificationType: ClassificationType): void;
}
```

### 3.2 TerrainClampedFeature 类

```typescript
export abstract class TerrainClampedFeature extends MapViewFeature {
    /**
     * 高度参考类型
     */
    heightReference: HeightReference = HeightReference.CLAMP_TO_GROUND;
    
    /**
     * 高度值
     */
    height?: number;
    
    /**
     * 拉伸高度参考类型
     */
    extrudedHeightReference?: HeightReference;
    
    /**
     * 拉伸高度值
     */
    extrudedHeight?: number;
    
    /**
     * 分类类型
     */
    classificationType?: ClassificationType;
    
    /**
     * 纹理旋转角度
     */
    stRotation?: number;
    
    /**
     * 透明度
     */
    opacity?: number;
    
    constructor(
        coordinates: FeatureGeometry["coordinates"], 
        properties?: {},
        options?: {
            heightReference?: HeightReference;
            height?: number;
            extrudedHeightReference?: HeightReference;
            extrudedHeight?: number;
            classificationType?: ClassificationType;
            stRotation?: number;
            opacity?: number;
        }
    );
}

// 具体特征类型
export class TerrainClampedPolygonFeature extends TerrainClampedFeature {
    type: Polygon["type"] = "Polygon";
    // 特定于多边形的属性
}

export class TerrainClampedLineFeature extends TerrainClampedFeature {
    type: LineString["type"] = "LineString";
    // 特定于线的属性
    width?: number;
    clampToGround?: boolean;
}

export class TerrainClampedPointFeature extends TerrainClampedFeature {
    type: Point["type"] = "Point";
    // 特定于点的属性
}
```

### 3.3 枚举类型

```typescript
export enum HeightReference {
    NONE = 0,                     // 绝对位置
    CLAMP_TO_GROUND = 1,          // 贴合到地面（地形和3D Tiles）
    RELATIVE_TO_GROUND = 2,       // 相对于地面的高度
    CLAMP_TO_TERRAIN = 3,         // 仅贴合到地形
    RELATIVE_TO_TERRAIN = 4,      // 相对于地形的高度
    CLAMP_TO_3D_TILE = 5,         // 仅贴合到3D Tiles
    RELATIVE_TO_3D_TILE = 6       // 相对于3D Tiles的高度
}

export enum ClassificationType {
    TERRAIN = "terrain",          // 仅贴合到地形
    Cesium3DTile = "3dtile",      // 仅贴合到3D Tiles
    BOTH = "both"                 // 贴合到地形和3D Tiles
}
```

## 4. 实现细节

### 4.1 GPU 集成

TerrainClampedDataSource 将集成我们在之前文档中设计的 GPU 地形贴合系统：

1. **阴影体生成**：为每个特征生成阴影体几何体
2. **着色器系统**：使用自定义着色器处理贴合逻辑
3. **深度纹理**：利用地图视图的深度信息
4. **模板测试**：确保正确的渲染顺序

### 4.2 数据流

```
1. 用户添加特征 → 
2. 转换为 GeoJSON → 
3. 通过 VectorTileDataSource 处理 → 
4. 解码器处理几何体 → 
5. GPU 着色器应用地形贴合 → 
6. 渲染到屏幕
```

### 4.3 实时更新

```typescript
class TerrainClampedDataSource {
    private setupTerrainChangeListener(): void {
        // 监听地形数据变化
        this.mapView.addEventListener(MapViewEventNames.Update, () => {
            // 重新生成阴影体几何体
            this.updateClamping();
        });
    }
    
    private updateClamping(): void {
        // 更新所有特征的贴合状态
        for (const feature of this.m_features) {
            this.updateFeatureClamping(feature);
        }
    }
}
```

## 5. 与现有系统的集成

### 5.1 与 MapView 集成

```typescript
// 在 MapView 中使用
const terrainDataSource = new TerrainClampedDataSource({
    name: "terrain-features",
    features: [
        new TerrainClampedPolygonFeature(
            [[0, 0], [1, 0], [1, 1], [0, 1]], 
            { color: "#ff0000" },
            { heightReference: HeightReference.CLAMP_TO_GROUND }
        )
    ]
});

mapView.addDataSource(terrainDataSource);
```

### 5.2 与现有 DataSource 兼容

TerrainClampedDataSource 继承自 VectorTileDataSource，因此与 flywave.gl 的其他 DataSource 具有相同的接口和行为。

## 6. 性能优化

1. **批处理**：将相同材质的特征合并渲染
2. **LOD**：根据距离调整阴影体复杂度
3. **缓存**：缓存生成的几何体和贴图
4. **剔除**：实现视锥剔除和遮挡剔除

## 7. 扩展性

1. **插件系统**：支持自定义特征类型
2. **材质系统**：支持自定义着色器材质
3. **事件系统**：提供特征交互事件
4. **序列化**：支持特征数据的保存和加载