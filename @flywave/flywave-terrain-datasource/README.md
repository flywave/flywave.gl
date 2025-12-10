# @flywave/flywave-terrain-datasource

`@flywave/flywave-terrain-datasource` 是 flywave.gl 库的地形数据源模块，提供了多种地形数据加载和渲染功能。该模块支持数字高程模型 (DEM)、量化网格地形 (Quantized Mesh) 和分层地形数据等多种地形数据格式。

## 安装

```bash
npm install @flywave/flywave-terrain-datasource
```

## 核心功能

### 1. DEMTerrainSource

`DEMTerrainSource` 用于加载和渲染数字高程模型 (DEM) 数据，支持 Mapbox 和 Terrarium 等编码格式。

#### 基本用法

```typescript
import { DEMTerrainSource } from "@flywave/flywave-terrain-datasource";

// 使用 JSON 配置文件创建 DEM 地形数据源
const demTerrainSource = new DEMTerrainSource({
    source: "resources/dem_terrain/source.json"
});

// 或使用 URL 创建 DEM 地形数据源
const demTerrainSource = new DEMTerrainSource({
    source: "https://dem.example.com/terrain-rgb.json"
});

// 将地形数据源添加到地图视图
mapView.setElevationSource(
    demTerrainSource,
    demTerrainSource.getElevationRangeSource(),
    demTerrainSource.getElevationProvider()
);
```

#### DEM Source JSON 配置文件结构

```json
{
  "type": "raster-dem",
  "url": "https://dem.example.com/{z}/{x}/{y}.png",
  "tileSize": 512,
  "maxzoom": 14,
  "minzoom": 0,
  "bounds": [
    118.1,
    36.4,
    118.25,
    36.55
  ],
  "scheme": "xyz",
  "tiles": [
    "https://dem.example.com/{z}/{x}/{y}.png"
  ],
  "encoding": "terrarium"
}
```

**JSON 配置文件参数说明：**

- `type` - 数据源类型，固定为 "raster-dem"
- `url` - 数据源 URL
- `tileSize` - 瓦片尺寸（像素）
- `maxzoom` - 最大缩放级别
- `minzoom` - 最小缩放级别
- `bounds` - 地理边界 [西, 南, 东, 北]
- `scheme` - 瓦片方案（"xyz" 或 "tms"）
- `tiles` - 瓦片 URL 模板数组
- `encoding` - DEM 编码格式（"mapbox" 或 "terrarium"）

#### API 参考

- `constructor(options: DemTerrainSourceOptions)` - 创建新的 DEMTerrainSource 实例
- `getElevationRangeSource(): IElevationRangeSource` - 获取高程范围源
- `getElevationProvider(): IElevationProvider` - 获取高程提供者
- `getGroundOverlayProvider()` - 获取地面覆盖层提供者
- `getGroundModificationManager()` - 获取地面修改管理器
- `addWebTileDataSource(provider, options)` - 添加 Web 瓦片数据源

### 2. QuantizedTerrainSource

`QuantizedTerrainSource` 用于加载和渲染量化网格地形数据，支持水遮罩、顶点法线和元数据等高级功能。

#### 基本用法

```typescript
import { QuantizedTerrainSource } from "@flywave/flywave-terrain-datasource";

// 创建量化网格地形数据源
const quantizedTerrainSource = new QuantizedTerrainSource({
    url: "https://terrain.example.com/layer.json",
    headers: {
        authorization: `Bearer YOUR_ACCESS_TOKEN`
    }
});

// 将地形数据源添加到地图视图
mapView.setElevationSource(
    quantizedTerrainSource,
    quantizedTerrainSource.getElevationRangeSource(),
    quantizedTerrainSource.getElevationProvider()
);
```

#### Quantized Terrain Layer JSON 配置文件结构

```json
{
    "tilejson": "2.1.0",
    "name": "test",
    "version": "0.0.1",
    "format": "quantized-mesh-1.0",
    "scheme": "tms",
    "tiles": ["/{z}/{x}/{y}.terrain"],
    "minzoom": 0,
    "maxzoom": 17,
    "bounds": [-180, -90, 180, 90],
    "projection": "EPSG:4326",
    "available": [
        [
            {
                "startX": 0,
                "startY": 0,
                "endX": 1,
                "endY": 1
            }
        ]
    ]
}
```

**Layer JSON 配置文件参数说明：**

- `tilejson` - TileJSON 规范版本
- `name` - 数据源名称
- `version` - 数据源版本
- `format` - 数据格式（"quantized-mesh-1.0" 或 "stratum-mesh-1.0"）
- `scheme` - 瓦片方案（"xyz" 或 "tms"）
- `tiles` - 瓦片 URL 模板数组
- `minzoom` - 最小缩放级别
- `maxzoom` - 最大缩放级别
- `bounds` - 地理边界 [西, 南, 东, 北]
- `projection` - 投影系统
- `available` - 可用瓦片范围定义

### 3. QuantizedStratumSource

`QuantizedStratumSource` 提供了分层地形数据支持，可以提供更精确的高程信息。

#### 基本用法

```typescript
import { QuantizedStratumSource } from "@flywave/flywave-terrain-datasource";

// 创建分层地形数据源
const stratumTerrainSource = new QuantizedStratumSource({
    url: "./resources/stratum/layer.json"
});

// 将地形数据源添加到地图视图
mapView.setElevationSource(
    stratumTerrainSource,
    stratumTerrainSource.getElevationRangeSource(),
    stratumTerrainSource.getElevationProvider()
);
```

#### Stratum Terrain Layer JSON 配置文件结构

```json
{
    "tilejson": "2.1.0",
    "name": "test",
    "version": "0.0.1",
    "format": "stratum-mesh-1.0",
    "scheme": "tms",
    "tiles": ["/{z}/{x}/{y}.stratum"],
    "minzoom": 15,
    "maxzoom": 17,
    "bounds": [-180, -90, 180, 90],
    "projection": "EPSG:4326",
    "available": [
        [
            {
                "startX": 54258,
                "startY": 25550,
                "endX": 54258,
                "endY": 25550
            }
        ]
    ],
    "extensions": ["metadata", "materials", "fault", "borehole", "collapse", "section"]
}
```

### 4. GroundModificationManager

`GroundModificationManager` 允许对地形进行修改，如添加隆起、凹陷或其他地形变形效果。

#### 基本用法

```typescript
import { GroundModificationManager, GroundModificationType } from "@flywave/flywave-terrain-datasource";

// 获取地面修改管理器
const modificationManager = terrainSource.getGroundModificationManager();

// 设置克里金插值参数（全局设置）
modificationManager.krigingOptions = {
    model: "gaussian",  // 使用高斯插值模型
    sigma2: 1.0,       // 方差参数
    alpha: 0.5,        // 平滑参数
    numPoints: 100     // 插值点数量
};

// 添加地面修改
const modificationId = modificationManager.addModification(
    {
        heightOperation: "replace", // 高度操作类型
        vertexSource: "fixed"       // 顶点源类型
    },
    geoPolygon,                    // 几何形状
    500,                           // 坡度宽度
    50                             // 高度变化
);
```

#### GroundModificationType 参数说明

- `heightOperation` - 高度操作类型：
  - `"replace"` - 完全替换基础高度
  - `"add"` - 在基础高度上增加
  - `"subtract"` - 从基础高度上减去
  - `"max"` - 取修改高度与基础高度的最大值
  - `"min"` - 取修改高度与基础高度的最小值
- `vertexSource` - 顶点源类型：
  - `"fixed"` - 使用固定值
  - `"geometry"` - 从几何体高度坐标获取

#### GroundModificationOptions 克里金插值参数说明

- `model` - 插值模型类型：
  - `"gaussian"` - 高斯模型：快速衰减的平滑插值
  - `"exponential"` - 指数模型：中等平滑度，指数衰减
  - `"spherical"` - 球面模型：有界范围，紧支撑
- `sigma2` - 方差参数 (σ²)：控制插值模型的整体方差，值越大插值表面变化越大
- `alpha` - 平滑参数：控制插值的平滑度，较低值产生更平滑的表面，较高值允许更多局部变化
- `numPoints` - 插值点数量：指定插值过程中使用的点数，更多点通常产生更准确的结果但需要更多计算资源

**addModification 方法参数：**

- `type: GroundModificationType` - 修改类型配置
- `boundary: GeoBox | GeoPolygon | GeoLineString` - 定义修改区域的几何对象
- `slopeWidth?: number` - 坡度宽度（可选）
- `depthOrHeight?: number` - 深度或高度值（可选）

#### API 参考

- `addModification(type, boundary, slopeWidth?, depthOrHeight?)` - 添加地面修改
- `updateModification(id, modification)` - 更新地面修改
- `removeModification(id)` - 移除地面修改
- `clearModifications()` - 清除所有修改
- `getModifications()` - 获取所有修改
- `get krigingOptions(): GroundModificationOptions` - 获取克里金插值参数
- `set krigingOptions(options: GroundModificationOptions)` - 设置克里金插值参数
- `getGroundOverlayProvider()` - 获取地面覆盖层提供者

### 5. GroundOverlayProvider

`GroundOverlayProvider` 允许在地形上添加自定义贴图覆盖层。

#### 基本用法

```typescript
import { TextureLoader, RepeatWrapping } from "three";

// 获取地面覆盖层提供者
const groundOverlayProvider = terrainSource.getGroundOverlayProvider();

// 加载纹理
const textureLoader = new TextureLoader();
textureLoader.load("resources/textures/texture_1.webp", texture => {
    texture.wrapS = RepeatWrapping;
    texture.wrapT = RepeatWrapping;
    
    // 添加覆盖层
    groundOverlayProvider.addOverlays([
        {
            geoArea: geoPolygon,  // 地理区域
            texture              // 纹理对象
        }
    ]);
});
```

#### API 参考

- `addOverlays(overlays: GroundOverlay[])` - 添加地面覆盖层
- `removeOverlays(overlays: GroundOverlay[])` - 移除地面覆盖层
- `clearOverlays()` - 清除所有地面覆盖层

## 配置选项

### DEMTerrainSource 选项

```typescript
interface DemTerrainSourceOptions {
    source: string | DemSourceDescription; // 数据源 URL 或 JSON 配置
    name?: string;                        // 数据源名称
    maxDisplayLevel?: number;             // 最大显示级别
    projectionSwitchOptions?: {          // 投影切换选项
        duration: number;
        animate: boolean;
    }
}
```

### QuantizedTerrainSource 选项

```typescript
interface QuantizedTerrainSourceOptions {
    url: string;                    // 数据源 URL
    name?: string;                  // 数据源名称
    headers?: HeadersInit;          // HTTP 请求头
    maxDisplayLevel?: number;       // 最大显示级别
    requestWaterMask?: boolean;     // 是否请求水遮罩
    requestVertexNormals?: boolean; // 是否请求顶点法线
    requestMetadata?: boolean;      // 是否请求元数据
}
```

## 示例

### 完整的地形应用示例

```typescript
import {
    DEMTerrainSource,
    QuantizedTerrainSource,
    GeoCoordinates,
    GeoLineString
} from "@flywave/flywave-terrain-datasource";
import { TextureLoader, RepeatWrapping } from "three";

// 初始化 DEM 地形数据源
const heightMapSource = new DEMTerrainSource({
    source: "resources/dem_terrain/source.json"
});

// 添加 Web 瓦片数据源
heightMapSource.addWebTileDataSource(new ArcGISTileProvider({}), {
    maxLevel: 18,
    minLevel: 0
});

// 自定义地面贴图
const lineString = new GeoLineString(
    [
        [118.09628468881186, 36.39626289210476],
        [118.0993817293853, 36.3987612080073],
        [118.10172838108122, 36.40072229952541],
        [118.10679200291139, 36.40194817931817]
    ],
    100
);

// 添加自定义贴图覆盖层
const textureLoader = new TextureLoader();
textureLoader.load("resources/textures/texture_1.webp", texture => {
    texture.wrapS = RepeatWrapping;
    texture.wrapT = RepeatWrapping;
    
    heightMapSource.getGroundOverlayProvider().addOverlays([
        {
            geoArea: lineString,
            texture
        }
    ]);
});

// 设置克里金插值参数
const modificationManager = heightMapSource.getGroundModificationManager();
modificationManager.krigingOptions = {
    model: "gaussian",  // 使用高斯插值模型
    sigma2: 1.0,       // 方差参数
    alpha: 0.5,        // 平滑参数
    numPoints: 100     // 插值点数量
};

// 自定义地面修改
modificationManager.addModification(
    {
        "heightOperation": "replace",
        "vertexSource": "fixed"
    }, 
    lineString, 
    500,  // 坡度宽度
    50    // 高度变化
);

// 将地形数据源添加到地图视图
mapView
    .setElevationSource(
        heightMapSource,
        heightMapSource.getElevationRangeSource(),
        heightMapSource.getElevationProvider()
    );
```

## 支持的数据格式

- **DEM (Digital Elevation Model)** - 数字高程模型
  - Mapbox 编码 (terrain-rgb)
  - Terrarium 编码
- **Quantized Mesh** - 量化网格地形
  - 基本网格数据
  - 水遮罩
  - 顶点法线
  - 元数据
- **Stratum Terrain** - 分层地形数据
  - 分层网格结构
  - 扩展支持 (metadata, materials, fault, borehole, etc.)

## 许可证

Apache-2.0 License