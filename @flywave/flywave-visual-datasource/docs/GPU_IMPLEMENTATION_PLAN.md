# 基于 GPU 的地形贴合实现方案

## 1. Cesium GPU 实现技术分析

### 1.1 核心技术原理

Cesium 使用阴影体（Shadow Volume）技术实现地形贴合：

1. **阴影体技术**：
   - 创建一个从几何体向下延伸到地表的体积（阴影体）
   - 使用模板缓冲区（Stencil Buffer）和深度测试来确定哪些像素应该被渲染
   - 通过 GPU 着色器计算精确的贴合位置

2. **深度夹紧（Depth Clamping）**：
   - 使用 `czm_depthClamp` 函数防止深度值超出范围
   - 确保贴合的几何体正确显示在地形表面

3. **模板测试（Stencil Test）**：
   - 使用模板缓冲区标记需要渲染的区域
   - 防止几何体穿透地形或其他对象

### 1.2 着色器实现

#### 1.2.1 顶点着色器（Vertex Shader）
```glsl
// 计算阴影体的顶点位置
vec4 position = czm_computePosition();

// 根据地形最小高度调整位置
float delta = min(u_globeMinimumAltitude, czm_geometricToleranceOverMeter * length(position.xyz));
delta *= czm_sceneMode == czm_sceneMode3D ? 1.0 : 0.0;

// 沿挤出方向调整位置
position = position + vec4(extrudeDirection * delta, 0.0);

// 使用深度夹紧投影
gl_Position = czm_depthClamp(czm_modelViewProjectionRelativeToEye * position);
```

#### 1.2.2 片段着色器（Fragment Shader）
```glsl
// 从深度纹理获取地形深度
float logDepthOrDepth = czm_unpackDepth(texture(czm_globeDepthTexture, gl_FragCoord.xy / czm_viewport.zw));

// 计算眼睛坐标
vec4 eyeCoordinate = czm_windowToEyeCoordinates(gl_FragCoord.xy, logDepthOrDepth);
eyeCoordinate /= eyeCoordinate.w;

// 检查片段是否在阴影体内
float widthwiseDistance = czm_planeDistance(v_rightPlaneEC, eyeCoordinate.xyz);
float distanceFromStart = czm_planeDistance(v_startPlaneNormalEcAndHalfWidth.xyz, -dot(ecStart, v_startPlaneNormalEcAndHalfWidth.xyz), eyeCoordinate.xyz);
float distanceFromEnd = czm_planeDistance(v_endPlaneNormalEcAndBatchId.xyz, -dot(v_endEcAndStartEcX.xyz, v_endPlaneNormalEcAndBatchId.xyz), eyeCoordinate.xyz);

// 如果不在阴影体内则丢弃
if (abs(widthwiseDistance) > halfMaxWidth || distanceFromStart < 0.0 || distanceFromEnd < 0.0) {
    discard;
}

// 计算材质并输出颜色
czm_material material = czm_getMaterial(materialInput);
out_FragColor = vec4(material.diffuse + material.emission, material.alpha);
```

## 2. flywave.gl 现状分析

### 2.1 现有技术
1. **位移贴图（Displacement Map）**：
   - 使用纹理存储地形高度信息
   - 在着色器中根据纹理值调整顶点位置
   - 主要用于瓦片地形的渲染

2. **模板测试**：
   - 实现了深度预处理通道的模板逻辑
   - 使用 `DEPTH_PRE_PASS_STENCIL_MASK` 进行模板操作

3. **缺少的功能**：
   - 没有实现阴影体技术
   - 没有深度夹紧功能
   - 没有专门用于地形贴合的着色器

## 3. 实现方案设计

### 3.1 总体架构

我们将实现一个类似于 Cesium 的 GPU 地形贴合系统：

1. **阴影体几何体生成**：
   - 为每个需要贴合的几何体创建阴影体
   - 计算挤出方向和距离

2. **着色器系统**：
   - 实现顶点着色器处理阴影体顶点
   - 实现片段着色器进行深度测试和模板测试

3. **材质系统**：
   - 扩展现有材质以支持地形贴合
   - 实现统一的贴合材质接口

### 3.2 阴影体几何体生成

```typescript
// 阴影体几何体生成器
class ShadowVolumeGeometryGenerator {
    /**
     * 为多边形生成阴影体几何体
     * @param positions 多边形顶点
     * @param extrudeDistance 挤出距离
     * @returns 阴影体几何体
     */
    static createPolygonShadowVolume(
        positions: THREE.Vector3[],
        extrudeDistance: number
    ): THREE.BufferGeometry {
        // 实现多边形阴影体生成逻辑
        // 1. 复制顶点到顶部和底部
        // 2. 创建侧面四边形
        // 3. 计算法向量
        return new THREE.BufferGeometry();
    }
    
    /**
     * 为线生成阴影体几何体
     * @param positions 线顶点
     * @param width 线宽
     * @param extrudeDistance 挤出距离
     * @returns 阴影体几何体
     */
    static createPolylineShadowVolume(
        positions: THREE.Vector3[],
        width: number,
        extrudeDistance: number
    ): THREE.BufferGeometry {
        // 实现线阴影体生成逻辑
        // 1. 创建带宽度的线段
        // 2. 挤出形成体积
        return new THREE.BufferGeometry();
    }
}
```

### 3.3 着色器实现

#### 3.3.1 顶点着色器

```glsl
// GroundClampVS.glsl
uniform float u_globeMinimumAltitude;
uniform float u_extrudeDistance;

attribute vec3 position;
attribute vec3 extrudeDirection;
attribute vec3 normal;

varying vec3 v_worldPosition;
varying vec3 v_normal;

void main() {
    vec4 worldPosition = modelMatrix * vec4(position, 1.0);
    
    // 计算挤出位置
    float delta = min(u_globeMinimumAltitude, 0.1 * length(worldPosition.xyz));
    vec3 extrudedPosition = position + extrudeDirection * u_extrudeDistance * delta;
    
    // 传递世界坐标和法向量
    v_worldPosition = (modelMatrix * vec4(extrudedPosition, 1.0)).xyz;
    v_normal = normalize(normalMatrix * normal);
    
    gl_Position = projectionMatrix * viewMatrix * vec4(extrudedPosition, 1.0);
}
```

#### 3.3.2 片段着色器

```glsl
// GroundClampFS.glsl
uniform sampler2D u_depthTexture;
uniform vec2 u_resolution;
uniform mat4 u_inverseProjectionMatrix;
uniform mat4 u_inverseViewMatrix;

varying vec3 v_worldPosition;
varying vec3 v_normal;

void main() {
    // 获取当前片段的屏幕坐标
    vec2 screenCoord = gl_FragCoord.xy / u_resolution;
    
    // 从深度纹理获取地形深度
    float terrainDepth = texture2D(u_depthTexture, screenCoord).r;
    
    // 重构地形世界坐标
    vec4 clipCoord = vec4(screenCoord * 2.0 - 1.0, terrainDepth * 2.0 - 1.0, 1.0);
    vec4 viewCoord = u_inverseProjectionMatrix * clipCoord;
    viewCoord /= viewCoord.w;
    vec3 terrainWorldPos = (u_inverseViewMatrix * viewCoord).xyz;
    
    // 检查当前片段是否应该显示
    float distanceToTerrain = length(v_worldPosition - terrainWorldPos);
    
    // 如果距离太远则丢弃
    if (distanceToTerrain > 0.1) {
        discard;
    }
    
    // 计算光照
    vec3 lightDir = normalize(vec3(1.0, 1.0, 1.0));
    float diffuse = max(dot(v_normal, lightDir), 0.0);
    
    gl_FragColor = vec4(vec3(0.5 + 0.5 * diffuse), 1.0);
}
```

### 3.4 材质系统扩展

```typescript
// GroundClampMaterial.ts
import * as THREE from "three";

export interface GroundClampMaterialParameters extends THREE.ShaderMaterialParameters {
    depthTexture?: THREE.Texture;
    resolution?: THREE.Vector2;
    extrudeDistance?: number;
    globeMinimumAltitude?: number;
}

export class GroundClampMaterial extends THREE.ShaderMaterial {
    constructor(parameters: GroundClampMaterialParameters = {}) {
        super({
            uniforms: {
                u_depthTexture: { value: parameters.depthTexture || new THREE.Texture() },
                u_resolution: { value: parameters.resolution || new THREE.Vector2(1, 1) },
                u_extrudeDistance: { value: parameters.extrudeDistance || 1000.0 },
                u_globeMinimumAltitude: { value: parameters.globeMinimumAltitude || 55000.0 },
                u_inverseProjectionMatrix: { value: new THREE.Matrix4() },
                u_inverseViewMatrix: { value: new THREE.Matrix4() }
            },
            vertexShader: `/* 顶点着色器代码 */`,
            fragmentShader: `/* 片段着色器代码 */`,
            ...parameters
        });
    }
    
    get depthTexture(): THREE.Texture {
        return this.uniforms.u_depthTexture.value;
    }
    
    set depthTexture(value: THREE.Texture) {
        this.uniforms.u_depthTexture.value = value;
    }
    
    get resolution(): THREE.Vector2 {
        return this.uniforms.u_resolution.value;
    }
    
    set resolution(value: THREE.Vector2) {
        this.uniforms.u_resolution.value = value;
    }
    
    get extrudeDistance(): number {
        return this.uniforms.u_extrudeDistance.value;
    }
    
    set extrudeDistance(value: number) {
        this.uniforms.u_extrudeDistance.value = value;
    }
}
```

### 3.5 渲染系统集成

```typescript
// GroundClampRenderer.ts
import * as THREE from "three";

export class GroundClampRenderer {
    private m_depthRenderTarget: THREE.WebGLRenderTarget;
    private m_scene: THREE.Scene;
    private m_camera: THREE.Camera;
    
    constructor(renderer: THREE.WebGLRenderer, scene: THREE.Scene, camera: THREE.Camera) {
        this.m_scene = scene;
        this.m_camera = camera;
        
        // 创建深度渲染目标
        this.m_depthRenderTarget = new THREE.WebGLRenderTarget(
            window.innerWidth,
            window.innerHeight,
            {
                minFilter: THREE.NearestFilter,
                magFilter: THREE.NearestFilter,
                format: THREE.DepthFormat,
                type: THREE.UnsignedShortType
            }
        );
    }
    
    /**
     * 渲染地形贴合几何体
     * @param renderer WebGL 渲染器
     */
    render(renderer: THREE.WebGLRenderer): void {
        // 1. 渲染地形深度到纹理
        renderer.setRenderTarget(this.m_depthRenderTarget);
        renderer.render(this.m_scene, this.m_camera);
        
        // 2. 更新材质中的深度纹理
        // 3. 渲染贴合几何体
        renderer.setRenderTarget(null);
    }
    
    /**
     * 更新渲染目标大小
     * @param width 宽度
     * @param height 高度
     */
    setSize(width: number, height: number): void {
        this.m_depthRenderTarget.setSize(width, height);
    }
}
```

## 4. 实现步骤

### 4.1 第一阶段：基础框架
1. 实现阴影体几何体生成器
2. 创建基础的着色器代码
3. 实现 GroundClampMaterial 材质类

### 4.2 第二阶段：渲染集成
1. 实现 GroundClampRenderer 渲染器
2. 集成深度纹理渲染
3. 实现模板测试逻辑

### 4.3 第三阶段：优化完善
1. 优化性能，实现批处理
2. 添加调试功能
3. 完善 API 接口

## 5. 性能考虑

1. **批处理**：将多个贴合几何体合并渲染以减少绘制调用
2. **LOD**：根据距离调整阴影体的复杂度
3. **缓存**：缓存生成的阴影体几何体
4. **剔除**：实现视锥剔除和遮挡剔除

## 6. 兼容性考虑

1. **WebGL 扩展**：检查必要的 WebGL 扩展支持
2. **回退方案**：为不支持的设备提供 CPU 实现回退
3. **移动设备优化**：针对移动设备优化性能