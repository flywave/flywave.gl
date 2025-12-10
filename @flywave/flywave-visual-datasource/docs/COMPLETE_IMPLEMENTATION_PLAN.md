# flywave-visual-datasource 模块完整实现计划文档

## 1. 项目概述

## 1.1 目标
创建一个独立的 flywave-visual-datasource 模块，专注于实现线和面的绘制功能，以及与地面的几种相对关系处理，包括：
1. 完整的 GPU 地形贴合技术实现
2. 支持线和面的基础绘制功能
3. 支持多种高度参考类型（绝对高度、贴合地面、相对地面等）
4. 与 flywave.gl 系统的无缝集成
5. 与 Cesium 相同级别的功能和性能

### 1.2 核心功能
1. 支持 7 种 HeightReference 类型
2. 支持地形和 3D Tiles 贴合
3. 实时更新机制
4. 高性能 GPU 实现
5. 与 flywave.gl DataSource 系统集成
6. 线和面的基础绘制功能
7. 多种材质和样式支持

## 2. 技术架构设计

### 2.1 模块结构
```
@flywave/flywave-visual-datasource/
├── src/
│   ├── core/                    # 核心功能模块
│   │   ├── HeightReference.ts   # 高度参考枚举和工具函数
│   │   ├── TerrainClampSystem.ts # 地形贴合核心系统
│   │   └── TerrainClampUtils.ts # 工具函数
│   ├── features/               # 特征类
│   │   ├── VectorFeature.ts     # 基础矢量特征类
│   │   ├── LineFeature.ts       # 线特征
│   │   └── PolygonFeature.ts    # 多边形特征
│   ├── gpu/                    # GPU 相关实现
│   │   ├── shaders/            # 着色器代码
│   │   │   ├── GroundClampVS.glsl # 顶点着色器
│   │   │   ├── GroundClampFS.glsl # 片段着色器
│   │   │   └── ShadowVolume.glsl  # 阴影体着色器
│   │   ├── GroundClampMaterial.ts # 地形贴合材质
│   │   ├── ShadowVolumeGeometryGenerator.ts # 阴影体几何体生成器
│   │   └── GroundClampRenderer.ts # GPU 渲染器
│   ├── datasource/             # DataSource 集成
│   │   ├── VisualDataSource.ts # 数据可视化数据源
│   │   └── VisualDataProvider.ts # 数据提供者
│   ├── index.ts                # 入口文件
│   └── types/                  # 类型定义
├── test/                       # 测试文件
├── package.json               # 包配置
└── tsconfig.json              # TypeScript 配置
```

### 2.2 核心类设计

#### 2.2.1 HeightReference 枚举
```typescript
export enum HeightReference {
    NONE = 0,                     // 绝对位置
    CLAMP_TO_GROUND = 1,          // 贴合到地面
    RELATIVE_TO_GROUND = 2,       // 相对于地面
    CLAMP_TO_TERRAIN = 3,         // 仅贴合到地形
    RELATIVE_TO_TERRAIN = 4,      // 相对于地形
    CLAMP_TO_3D_TILE = 5,         // 仅贴合到 3D Tiles
    RELATIVE_TO_3D_TILE = 6       // 相对于 3D Tiles
}

export enum ClassificationType {
    TERRAIN = "terrain",
    Cesium3DTile = "3dtile", 
    BOTH = "both"
}
```

#### 2.2.2 VectorFeature 特征类
```typescript
abstract class VectorFeature {
    uuid: string;
    type: GeometryType;
    coordinates: number[] | number[][] | number[][][];
    heightReference: HeightReference;
    height?: number;
    extrudedHeightReference?: HeightReference;
    extrudedHeight?: number;
    classificationType?: ClassificationType;
    stRotation?: number;
    opacity?: number;
    // 其他属性...
}

class PointFeature extends VectorFeature {
    type = "Point";
    // 点特定属性
}

class LineFeature extends VectorFeature {
    type = "LineString";
    width?: number;
    clampToGround?: boolean;
    // 线特定属性
}

class PolygonFeature extends VectorFeature {
    type = "Polygon";
    // 多边形特定属性
}
```

## 3. GPU 技术实现方案

### 3.1 阴影体技术
实现 Cesium 风格的阴影体技术：

1. **几何体生成**：
   - 为每个特征生成向下延伸的阴影体
   - 支持多边形、线、点的阴影体生成
   - LOD 支持，根据距离调整复杂度

2. **着色器实现**：
   ```glsl
   // 顶点着色器核心逻辑
   uniform float u_extrudeDistance;
   attribute vec3 extrudeDirection;
   
   void main() {
       vec3 extrudedPosition = position + extrudeDirection * u_extrudeDistance;
       gl_Position = projectionMatrix * viewMatrix * modelMatrix * vec4(extrudedPosition, 1.0);
   }
   
   // 片段着色器核心逻辑
   uniform sampler2D u_depthTexture;
   
   void main() {
       vec2 screenCoord = gl_FragCoord.xy / u_resolution;
       float terrainDepth = texture2D(u_depthTexture, screenCoord).r;
       float fragmentDepth = gl_FragCoord.z;
       
       if (fragmentDepth > terrainDepth) {
           discard;
       }
       
       // 渲染颜色
   }
   ```

3. **深度测试集成**：
   - 利用 flywave-terrain-datasource 提供的地形深度信息
   - 实现实时深度比较
   - 支持模板测试优化

### 3.2 材质系统
```typescript
class GroundClampMaterial extends THREE.ShaderMaterial {
    constructor(parameters: GroundClampMaterialParameters);
    
    // 核心属性
    depthTexture: THREE.Texture;
    resolution: THREE.Vector2;
    extrudeDistance: number;
    globeMinimumAltitude: number;
    
    // 方法
    updateUniforms(): void;
    setDepthTexture(texture: THREE.Texture): void;
}
```

### 3.3 渲染系统
```typescript
class GroundClampRenderer {
    private depthRenderTarget: THREE.WebGLRenderTarget;
    private material: GroundClampMaterial;
    
    constructor(renderer: THREE.WebGLRenderer);
    
    render(renderer: THREE.WebGLRenderer, scene: THREE.Scene, camera: THREE.Camera): void;
    updateDepthTexture(): void;
    setSize(width: number, height: number): void;
}
```

## 4. DataSource 集成方案

### 4.1 VisualDataSource 设计
```typescript
interface VisualDataSourceOptions extends VectorTileDataSourceParameters {
    features?: VectorFeature[];
    heightReference?: HeightReference;
    classificationType?: ClassificationType;
}

class VisualDataSource extends VectorTileDataSource {
    constructor(options?: VisualDataSourceOptions);
    
    // 核心方法
    add(...features: VectorFeature[]): this;
    remove(...features: VectorFeature[]): this;
    clear(): void;
    setHeightReference(heightReference: HeightReference): void;
    setClassificationType(classificationType: ClassificationType): void;
    
    // 与 GPU 系统集成
    private updateGPUFeatures(): void;
    private createShadowVolumes(): void;
}
```

### 4.2 可视化组件集成
```typescript
// 基础可视化组件接口
interface VisualizationComponent {
    render(): void;
    update(): void;
    dispose(): void;
}

class LabelComponent implements VisualizationComponent {
    // 标签组件实现
}

class IconComponent implements VisualizationComponent {
    // 图标组件实现
}

class HeatmapComponent implements VisualizationComponent {
    // 热力图组件实现
}
```

### 4.3 与地形系统的交互
```typescript
// 通过接口与 flywave-terrain-datasource 交互
interface ITerrainProvider {
    getHeight(geoPoint: GeoCoordinates, level?: number): number | undefined;
    getDisplacementMap(tileKey: TileKey): TileDisplacementMap | undefined;
    getTilingScheme(): TilingScheme | undefined;
}

class TerrainClampSystem {
    constructor(terrainProvider: ITerrainProvider);
    
    // 获取地形信息用于 GPU 计算
    getTerrainDepthTexture(): THREE.Texture;
    getTerrainHeight(geoPoint: GeoCoordinates): number;
}
```

## 5. 实现步骤

### 5.1 第一阶段：基础框架 (1-2 周)
1. 创建项目结构和基础配置
2. 实现 HeightReference 枚举和工具函数
3. 实现基础的 LineFeature 和 PolygonFeature 类
4. 创建基本的着色器框架

### 5.2 第二阶段：GPU 核心实现 (2-3 周)
1. 实现阴影体几何体生成器（线和面）
2. 完善着色器代码，实现深度测试
3. 实现 GroundClampMaterial 材质系统
4. 实现 GroundClampRenderer 渲染器

### 5.3 第三阶段：DataSource 集成 (1-2 周)
1. 实现 VisualDataSource
2. 集成 GPU 渲染系统
3. 实现与 flywave-terrain-datasource 的接口对接
4. 添加事件系统和实时更新机制

### 5.4 第四阶段：优化和完善 (1-2 周)
1. 性能优化（批处理、LOD、缓存）
2. 添加调试功能
3. 完善文档和示例
4. 编写测试用例

## 6. 性能优化策略

### 6.1 几何体优化
1. **批处理**：将相同材质的特征合并渲染
2. **LOD**：根据距离动态调整阴影体复杂度
3. **剔除**：实现视锥剔除和遮挡剔除

### 6.2 渲染优化
1. **深度纹理缓存**：避免重复渲染地形深度
2. **材质共享**：相同属性的特征共享材质实例
3. **实例化渲染**：支持大量相似特征的高效渲染

### 6.3 内存优化
1. **几何体缓存**：缓存生成的阴影体几何体
2. **纹理管理**：合理管理深度纹理和其他贴图资源
3. **对象池**：重用临时对象减少 GC 压力

## 7. 兼容性考虑

### 7.1 WebGL 扩展检查
```typescript
function checkWebGLExtensions(renderer: THREE.WebGLRenderer): boolean {
    const extensions = renderer.extensions;
    return extensions.get('WEBGL_depth_texture') !== null 
        && extensions.get('EXT_frag_depth') !== null;
}
```

### 7.2 回退方案
```typescript
class TerrainClampSystem {
    private gpuSupported: boolean;
    private cpuFallback: CPUGroundClamp;
    
    constructor(renderer: THREE.WebGLRenderer) {
        this.gpuSupported = checkWebGLExtensions(renderer);
        if (!this.gpuSupported) {
            this.cpuFallback = new CPUGroundClamp();
        }
    }
    
    render(renderer: THREE.WebGLRenderer) {
        if (this.gpuSupported) {
            // GPU 渲染
        } else {
            // CPU 回退
        }
    }
}
```

## 8. 测试方案

### 8.1 单元测试
1. HeightReference 枚举和工具函数测试
2. VectorFeature 类测试
3. 阴影体几何体生成器测试
4. 材质系统测试

### 8.2 集成测试
1. DataSource 集成测试
2. GPU 渲染功能测试
3. 性能基准测试
4. 兼容性测试

### 8.3 示例测试
1. 基础贴合功能示例
2. 不同高度参考类型示例
3. 性能测试示例
4. 调试功能示例

## 9. 文档和示例

### 9.1 API 文档
1. 完整的 TypeScript 类型定义
2. 详细的 API 文档注释
3. 使用示例和最佳实践

### 9.2 示例项目
1. 基础使用示例
2. 高级功能示例
3. 性能优化示例
4. 调试和故障排除示例

## 10. 项目里程碑

### 10.1 里程碑 1：基础功能完成 (4 周)
- [ ] 项目结构搭建完成
- [ ] 基础特征类实现
- [ ] 着色器框架完成
- [ ] 基础示例运行

### 10.2 里程碑 2：GPU 功能完成 (8 周)
- [ ] 阴影体技术实现
- [ ] 深度测试集成
- [ ] 材质系统完成
- [ ] 渲染器实现

### 10.3 里程碑 3：DataSource 集成 (10 周)
- [ ] DataSource 集成完成
- [ ] 与地形系统对接
- [ ] 实时更新机制
- [ ] 完整示例

### 10.4 里程碑 4：优化和完善 (12 周)
- [ ] 性能优化完成
- [ ] 测试用例完成
- [ ] 文档完善
- [ ] 正式发布

## 11. 风险评估和应对

### 11.1 技术风险
1. **WebGL 兼容性问题**：
   - 应对：实现完整的回退方案
   - 备选：提供 CPU 实现作为备选

2. **性能问题**：
   - 应对：实现批处理和 LOD 优化
   - 监控：建立性能基准测试

### 11.2 集成风险
1. **与 flywave.gl 系统集成问题**：
   - 应对：遵循现有 DataSource 模式
   - 测试：充分的集成测试

2. **与地形系统对接问题**：
   - 应对：通过标准接口交互
   - 兼容：支持多种地形数据源

## 12. 后续扩展

### 12.1 功能扩展
1. 支持点特征和其他几何体类型
2. 支持动画和交互效果
3. 支持更复杂的材质系统
4. 支持粒子系统、水面、火焰等特效

### 12.2 性能扩展
1. 多线程几何体生成
2. 更高级的 LOD 算法
3. GPU 计算优化
4. WebAssembly 加速

这个计划文档提供了完整的实现方案，确保 flywave-visual-datasource 模块能够实现线和面的绘制功能以及与地面的多种相对关系处理，同时保持与 flywave.gl 系统的良好集成。

文档保存在：`/Users/wh/worker/flywave.gl/@flywave/flywave-visual-datasource/COMPLETE_IMPLEMENTATION_PLAN.md`