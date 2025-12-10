# 完全贴合地面功能改进方案

## 1. 现状分析

当前实现存在以下不足：

1. **静态贴合**：只在创建时获取一次地形高度，没有实时更新机制
2. **缺少高度参考类型**：不支持 Cesium 中的多种 HeightReference 类型
3. **缺少 3D Tiles 支持**：仅支持地形贴合，不支持 3D Tiles 贴合
4. **缺少相对高度支持**：不支持相对于地面的高度设置

## 2. 改进目标

实现与 Cesium 相同级别的地形贴合功能：

1. 支持所有 7 种 HeightReference 类型
2. 支持地形和 3D Tiles 的贴合
3. 实现实时更新机制
4. 提供高性能的实现方案

## 3. 设计方案

### 3.1 扩展 HeightReference 枚举

```typescript
// 在 TerrainMaterial.ts 中添加
export enum HeightReference {
    NONE = 0,                     // 绝对位置
    CLAMP_TO_GROUND = 1,          // 贴合到地面（地形和3D Tiles）
    RELATIVE_TO_GROUND = 2,       // 相对于地面的高度
    CLAMP_TO_TERRAIN = 3,         // 仅贴合到地形
    RELATIVE_TO_TERRAIN = 4,      // 相对于地形的高度
    CLAMP_TO_3D_TILE = 5,         // 仅贴合到3D Tiles
    RELATIVE_TO_3D_TILE = 6       // 相对于3D Tiles的高度
}

// 工具函数
export function isHeightReferenceClamp(heightReference: HeightReference): boolean {
    return [
        HeightReference.CLAMP_TO_GROUND,
        HeightReference.CLAMP_TO_3D_TILE,
        HeightReference.CLAMP_TO_TERRAIN
    ].includes(heightReference);
}

export function isHeightReferenceRelative(heightReference: HeightReference): boolean {
    return [
        HeightReference.RELATIVE_TO_GROUND,
        HeightReference.RELATIVE_TO_3D_TILE,
        HeightReference.RELATIVE_TO_TERRAIN
    ].includes(heightReference);
}
```

### 3.2 更新 ClampedPolygon 类

```typescript
// 在 ClampedPolygon.ts 中更新接口
export interface ClampedPolygonOptions {
    /**
     * 多边形的顶点坐标
     */
    positions: GeoCoordinates[];
    
    /**
     * 材质或纹理路径
     */
    material?: TerrainMaterial | string;
    
    /**
     * 纹理旋转角度（弧度）
     */
    stRotation?: number;
    
    /**
     * 分类类型
     */
    classificationType?: ClassificationType;
    
    /**
     * 透明度
     */
    opacity?: number;
    
    /**
     * 高度参考类型
     */
    heightReference?: HeightReference;
    
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
}

// 在 ClampedPolygon 类中添加高度处理方法
private getHeightForReference(
    geoCoord: GeoCoordinates,
    heightReference: HeightReference,
    height: number = 0,
    mapView?: MapView
): number {
    if (!mapView || !mapView.elevationProvider) {
        return height;
    }
    
    // 对于 CLAMP 类型，返回 0（贴合到表面）
    if (isHeightReferenceClamp(heightReference)) {
        return 0;
    }
    
    // 对于 RELATIVE 类型，获取地形高度并加上相对高度
    if (isHeightReferenceRelative(heightReference)) {
        const terrainHeight = mapView.elevationProvider.getHeight(geoCoord) ?? 0;
        return terrainHeight + height;
    }
    
    // 对于 NONE 类型，直接返回高度
    return height;
}
```

### 3.3 更新 ClampedPolyline 类

```typescript
// 在 ClampedPolyline.ts 中更新接口
export interface ClampedPolylineOptions {
    /**
     * 线的顶点坐标
     */
    positions: GeoCoordinates[];
    
    /**
     * 是否贴合地面
     */
    clampToGround?: boolean;
    
    /**
     * 线宽
     */
    width?: number;
    
    /**
     * 材质
     */
    material?: TerrainMaterial;
    
    /**
     * 是否显示轮廓线
     */
    showOutline?: boolean;
    
    /**
     * 轮廓线颜色
     */
    outlineColor?: THREE.Color;
    
    /**
     * 轮廓线宽度
     */
    outlineWidth?: number;
    
    /**
     * 高度参考类型
     */
    heightReference?: HeightReference;
    
    /**
     * 高度值
     */
    height?: number;
}

// 在 ClampedPolyline 类中添加高度处理方法
private getHeightForReference(
    geoCoord: GeoCoordinates,
    heightReference: HeightReference,
    height: number = 0,
    mapView?: MapView
): number {
    if (!mapView || !mapView.elevationProvider) {
        return height;
    }
    
    // 对于 CLAMP_TO_GROUND 类型，获取地形高度
    if (heightReference === HeightReference.CLAMP_TO_GROUND) {
        return mapView.elevationProvider.getHeight(geoCoord) ?? 0;
    }
    
    // 对于 RELATIVE_TO_GROUND 类型，获取地形高度并加上相对高度
    if (heightReference === HeightReference.RELATIVE_TO_GROUND) {
        const terrainHeight = mapView.elevationProvider.getHeight(geoCoord) ?? 0;
        return terrainHeight + height;
    }
    
    // 对于 NONE 类型，直接返回高度
    return height;
}
```

### 3.4 实现实时更新机制

```typescript
// 在 TerrainDrawControls.ts 中添加更新机制
export class TerrainDrawControls {
    // 添加地形数据变化监听
    private m_terrainChangeListener: (() => void) | undefined;
    
    constructor(private readonly m_mapView: MapView) {
        // 创建一个容器对象来管理所有绘制的图形
        this.m_sceneContainer = new THREE.Object3D();
        this.m_mapView.scene.add(this.m_sceneContainer);
        
        // 监听地形数据变化
        this.setupTerrainChangeListener();
    }
    
    private setupTerrainChangeListener(): void {
        // 监听地图视图的更新事件
        this.m_terrainChangeListener = () => {
            // 当地形数据更新时，重新计算所有图形的位置
            this.updateClamping();
        };
        
        // 将监听器添加到地图视图的更新事件中
        this.m_mapView.addEventListener(MapViewEventNames.Update, this.m_terrainChangeListener);
    }
    
    /**
     * 更新所有图形以贴合当前地形
     */
    updateClamping(): void {
        // 更新所有多边形的顶点位置以贴合地形
        for (const polygon of this.m_polygons) {
            polygon.updatePositions(polygon['m_options'].positions, this.m_mapView);
        }
        
        // 更新所有线的顶点位置以贴合地形
        for (const polyline of this.m_polylines) {
            polyline.updatePositions(polyline['m_options'].positions, this.m_mapView);
        }
    }
    
    // 在销毁时移除监听器
    dispose(): void {
        if (this.m_terrainChangeListener) {
            this.m_mapView.removeEventListener(MapViewEventNames.Update, this.m_terrainChangeListener);
            this.m_terrainChangeListener = undefined;
        }
    }
}
```

### 3.5 支持 3D Tiles 贴合

```typescript
// 添加 3D Tiles 高度查询接口
interface TilesetElevationProvider {
    getHeightFromTiles(geoPoint: GeoCoordinates): number | undefined;
}

// 在 getHeightForReference 方法中添加 3D Tiles 支持
private getHeightForReference(
    geoCoord: GeoCoordinates,
    heightReference: HeightReference,
    height: number = 0,
    mapView?: MapView
): number {
    if (!mapView || !mapView.elevationProvider) {
        return height;
    }
    
    // 获取地形高度
    const terrainHeight = mapView.elevationProvider.getHeight(geoCoord) ?? 0;
    
    // 获取 3D Tiles 高度（如果支持）
    let tileHeight = 0;
    // TODO: 实现 3D Tiles 高度查询
    
    // 根据高度参考类型返回相应高度
    switch (heightReference) {
        case HeightReference.CLAMP_TO_GROUND:
            // 返回地形和 3D Tiles 中的最大高度
            return Math.max(terrainHeight, tileHeight);
            
        case HeightReference.CLAMP_TO_TERRAIN:
            return terrainHeight;
            
        case HeightReference.CLAMP_TO_3D_TILE:
            return tileHeight;
            
        case HeightReference.RELATIVE_TO_GROUND:
            return Math.max(terrainHeight, tileHeight) + height;
            
        case HeightReference.RELATIVE_TO_TERRAIN:
            return terrainHeight + height;
            
        case HeightReference.RELATIVE_TO_3D_TILE:
            return tileHeight + height;
            
        case HeightReference.NONE:
        default:
            return height;
    }
}
```

## 4. 性能优化方案

### 4.1 缓存机制

```typescript
// 添加高度缓存
class HeightCache {
    private cache: Map<string, number> = new Map();
    private maxSize: number = 1000;
    
    get(key: string): number | undefined {
        return this.cache.get(key);
    }
    
    set(key: string, value: number): void {
        if (this.cache.size >= this.maxSize) {
            // 移除最旧的条目
            const firstKey = this.cache.keys().next().value;
            if (firstKey) {
                this.cache.delete(firstKey);
            }
        }
        this.cache.set(key, value);
    }
    
    clear(): void {
        this.cache.clear();
    }
}
```

### 4.2 批处理更新

```typescript
// 批处理更新所有图形
updateClampingBatch(): void {
    // 收集所有需要更新的图形
    const updateList: Array<{ type: 'polygon' | 'polyline', object: any }> = [];
    
    for (const polygon of this.m_polygons) {
        updateList.push({ type: 'polygon', object: polygon });
    }
    
    for (const polyline of this.m_polylines) {
        updateList.push({ type: 'polyline', object: polyline });
    }
    
    // 批处理更新
    for (const item of updateList) {
        if (item.type === 'polygon') {
            item.object.updatePositions(item.object['m_options'].positions, this.m_mapView);
        } else {
            item.object.updatePositions(item.object['m_options'].positions, this.m_mapView);
        }
    }
}
```

## 5. API 改进

### 5.1 统一配置接口

```typescript
// 创建统一的贴合地面配置接口
interface GroundClampingOptions {
    heightReference?: HeightReference;
    height?: number;
    extrudedHeightReference?: HeightReference;
    extrudedHeight?: number;
    classificationType?: ClassificationType;
}

// 在 ClampedPolygonOptions 和 ClampedPolylineOptions 中继承
interface ClampedPolygonOptions extends GroundClampingOptions {
    positions: GeoCoordinates[];
    material?: TerrainMaterial | string;
    stRotation?: number;
    opacity?: number;
}

interface ClampedPolylineOptions extends GroundClampingOptions {
    positions: GeoCoordinates[];
    clampToGround?: boolean; // 兼容旧接口
    width?: number;
    material?: TerrainMaterial;
    showOutline?: boolean;
    outlineColor?: THREE.Color;
    outlineWidth?: number;
}
```

### 5.2 事件系统

```typescript
// 添加事件系统支持
enum TerrainDrawEvent {
    HEIGHT_UPDATED = 'height-updated',
    TERRAIN_CHANGED = 'terrain-changed'
}

interface TerrainDrawEventDetails {
    type: TerrainDrawEvent;
    object?: ClampedPolygon | ClampedPolyline;
}

// 在 TerrainDrawControls 中添加事件发射
private emitEvent(type: TerrainDrawEvent, object?: ClampedPolygon | ClampedPolyline): void {
    const event = new CustomEvent<TerrainDrawEventDetails>('terrain-draw-event', {
        detail: { type, object }
    });
    this.m_sceneContainer.dispatchEvent(event);
}
```

## 6. 实现步骤

1. **第一阶段**：实现 HeightReference 枚举和基本的高度处理逻辑
2. **第二阶段**：实现实时更新机制和缓存优化
3. **第三阶段**：添加 3D Tiles 支持和分类类型
4. **第四阶段**：完善 API 和事件系统，添加测试用例

## 7. 测试方案

1. **单元测试**：测试各种 HeightReference 类型的正确性
2. **集成测试**：测试与地图视图的集成和实时更新
3. **性能测试**：测试大量图形的贴合性能
4. **兼容性测试**：确保与现有代码的兼容性