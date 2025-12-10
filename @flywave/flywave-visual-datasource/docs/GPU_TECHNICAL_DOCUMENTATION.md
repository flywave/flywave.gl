# GPU 实现地形贴合技术文档

## 1. 概述

本文档详细描述了如何在 flywave.gl 中实现基于 GPU 的地形贴合功能，类似于 Cesium 中的实现方式。该实现使用阴影体（Shadow Volume）技术和深度测试来确保几何体精确贴合地形表面。

## 2. 技术原理

### 2.1 阴影体技术

阴影体是一种用于确定几何体可见性的技术。在地形贴合中，我们使用阴影体来创建一个从几何体向下延伸到地表的体积：

1. **几何体构建**：创建一个从原始几何体向下挤出的体积
2. **深度测试**：使用深度缓冲区确定哪些像素在地形表面之上
3. **模板测试**：使用模板缓冲区标记需要渲染的区域

### 2.2 深度夹紧

深度夹紧技术防止深度值超出 [0,1] 范围，确保几何体正确显示：

```glsl
gl_Position = czm_depthClamp(projectionMatrix * viewMatrix * modelMatrix * vec4(position, 1.0));
```

### 2.3 着色器实现

#### 2.3.1 顶点着色器

顶点着色器负责计算阴影体顶点的位置：

```glsl
uniform float u_globeMinimumAltitude;
uniform float u_extrudeDistance;

attribute vec3 position;
attribute vec3 extrudeDirection;

void main() {
    vec4 worldPosition = modelMatrix * vec4(position, 1.0);
    
    // 计算挤出位置
    float delta = min(u_globeMinimumAltitude, 0.1 * length(worldPosition.xyz));
    vec3 extrudedPosition = position + extrudeDirection * u_extrudeDistance * delta;
    
    gl_Position = projectionMatrix * viewMatrix * vec4(extrudedPosition, 1.0);
}
```

#### 2.3.2 片段着色器

片段着色器负责深度测试和颜色计算：

```glsl
uniform sampler2D u_depthTexture;
uniform vec2 u_resolution;

void main() {
    // 获取当前片段的屏幕坐标
    vec2 screenCoord = gl_FragCoord.xy / u_resolution;
    
    // 从深度纹理获取地形深度
    float terrainDepth = texture2D(u_depthTexture, screenCoord).r;
    
    // 获取当前片段深度
    float fragmentDepth = gl_FragCoord.z;
    
    // 如果片段在地形之下则丢弃
    if (fragmentDepth > terrainDepth) {
        discard;
    }
    
    gl_FragColor = vec4(1.0, 0.0, 0.0, 1.0); // 红色
}
```

## 3. 实现细节

### 3.1 阴影体几何体生成

```typescript
class ShadowVolumeGeometryGenerator {
    static createPolygonShadowVolume(
        positions: THREE.Vector3[],
        extrudeDistance: number
    ): THREE.BufferGeometry {
        const geometry = new THREE.BufferGeometry();
        
        // 顶点数组
        const vertices: number[] = [];
        const indices: number[] = [];
        
        // 复制顶点到顶部和底部
        for (let i = 0; i < positions.length; i++) {
            // 顶部顶点
            vertices.push(positions[i].x, positions[i].y, positions[i].z);
            
            // 底部顶点
            const bottomPos = positions[i].clone().add(new THREE.Vector3(0, -extrudeDistance, 0));
            vertices.push(bottomPos.x, bottomPos.y, bottomPos.z);
        }
        
        // 创建侧面索引
        for (let i = 0; i < positions.length; i++) {
            const top1 = i * 2;
            const bottom1 = top1 + 1;
            const top2 = ((i + 1) % positions.length) * 2;
            const bottom2 = top2 + 1;
            
            // 创建四边形面
            indices.push(top1, bottom1, top2);
            indices.push(bottom1, bottom2, top2);
        }
        
        geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
        geometry.setIndex(indices);
        
        return geometry;
    }
}
```

### 3.2 材质系统

```typescript
class GroundClampMaterial extends THREE.ShaderMaterial {
    constructor(parameters: any = {}) {
        super({
            uniforms: {
                u_depthTexture: { value: null },
                u_resolution: { value: new THREE.Vector2(1, 1) },
                u_extrudeDistance: { value: 1000.0 }
            },
            vertexShader: `
                uniform float u_extrudeDistance;
                attribute vec3 extrudeDirection;
                
                void main() {
                    vec3 extrudedPosition = position + extrudeDirection * u_extrudeDistance;
                    gl_Position = projectionMatrix * viewMatrix * modelMatrix * vec4(extrudedPosition, 1.0);
                }
            `,
            fragmentShader: `
                uniform sampler2D u_depthTexture;
                uniform vec2 u_resolution;
                
                void main() {
                    vec2 screenCoord = gl_FragCoord.xy / u_resolution;
                    float terrainDepth = texture2D(u_depthTexture, screenCoord).r;
                    float fragmentDepth = gl_FragCoord.z;
                    
                    if (fragmentDepth > terrainDepth) {
                        discard;
                    }
                    
                    gl_FragColor = vec4(1.0, 0.0, 0.0, 1.0);
                }
            `,
            ...parameters
        });
    }
}
```

### 3.3 渲染系统

```typescript
class GroundClampRenderer {
    private depthRenderTarget: THREE.WebGLRenderTarget;
    
    constructor() {
        this.depthRenderTarget = new THREE.WebGLRenderTarget(
            window.innerWidth,
            window.innerHeight,
            {
                minFilter: THREE.NearestFilter,
                magFilter: THREE.NearestFilter,
                format: THREE.DepthFormat
            }
        );
    }
    
    render(renderer: THREE.WebGLRenderer, scene: THREE.Scene, camera: THREE.Camera) {
        // 渲染深度到纹理
        renderer.setRenderTarget(this.depthRenderTarget);
        scene.overrideMaterial = new THREE.MeshDepthMaterial();
        renderer.render(scene, camera);
        scene.overrideMaterial = null;
        
        // 渲染贴合几何体
        renderer.setRenderTarget(null);
        // 使用深度纹理渲染贴合几何体
    }
}
```

## 4. 性能优化

### 4.1 批处理

将多个贴合几何体合并到单个绘制调用中：

```typescript
class BatchGroundClampRenderer {
    private batchGeometry: THREE.BufferGeometry;
    private batchMaterial: GroundClampMaterial;
    
    addGeometry(geometry: THREE.BufferGeometry) {
        // 合并几何体到批处理几何体中
    }
    
    render(renderer: THREE.WebGLRenderer) {
        // 单次绘制调用渲染所有几何体
    }
}
```

### 4.2 LOD（细节层次）

根据距离调整阴影体复杂度：

```typescript
class LODShadowVolume {
    private levels: THREE.BufferGeometry[];
    
    getGeometry(distance: number): THREE.BufferGeometry {
        // 根据距离返回适当复杂度的几何体
    }
}
```

## 5. 兼容性处理

### 5.1 WebGL 扩展检查

```typescript
function checkWebGLExtensions(renderer: THREE.WebGLRenderer): boolean {
    const extensions = renderer.extensions;
    return extensions.get('WEBGL_depth_texture') !== null;
}
```

### 5.2 回退方案

```typescript
class GroundClampSystem {
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
            // 使用 GPU 实现
        } else {
            // 使用 CPU 回退
            this.cpuFallback.render();
        }
    }
}
```

## 6. 使用示例

```typescript
// 创建贴合地面的多边形
const positions = [
    new THREE.Vector3(0, 0, 0),
    new THREE.Vector3(1, 0, 0),
    new THREE.Vector3(1, 1, 0),
    new THREE.Vector3(0, 1, 0)
];

// 生成阴影体几何体
const shadowGeometry = ShadowVolumeGeometryGenerator.createPolygonShadowVolume(positions, 1000);

// 创建材质
const material = new GroundClampMaterial({
    depthTexture: depthTexture,
    resolution: new THREE.Vector2(window.innerWidth, window.innerHeight)
});

// 创建网格
const mesh = new THREE.Mesh(shadowGeometry, material);

// 添加到场景
scene.add(mesh);
```

## 7. 调试功能

```typescript
class GroundClampDebug {
    static showShadowVolume(material: GroundClampMaterial, show: boolean) {
        // 切换显示阴影体的调试模式
    }
    
    static showDepthTexture(renderer: THREE.WebGLRenderer, texture: THREE.Texture) {
        // 显示深度纹理用于调试
    }
}
```

## 8. 限制和注意事项

1. **性能影响**：阴影体技术会增加几何体复杂度，可能影响性能
2. **精度问题**：深度比较可能受浮点精度影响
3. **兼容性**：需要 WebGL 深度纹理扩展支持
4. **内存使用**：深度纹理会占用额外内存