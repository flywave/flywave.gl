import {
    ShaderMaterial,
    UniformsLib,
    UniformsUtils,
    Vector2,
    Vector3,
    Matrix4,
    Color,
    Texture,
    Camera,
    IUniform
} from 'three';

export interface GroundPrimitiveMaterialParameters {
    color?: Color | string | number;
    map?: Texture | null;
    opacity?: number;
    transparent?: boolean;

    // 深度纹理
    depthTexture?: Texture | null;

    // 模板测试相关
    stencilReference?: number;
    stencilMask?: number;

    // 分类类型
    classificationType?: ClassificationType;

    // 体积边界
    volumeBounds?: VolumeBounds;

    // 调试选项
    debugShowShadowVolume?: boolean;
}

export enum ClassificationType {
    TERRAIN = 0,
    CESIUM_3D_TILE = 1,
    BOTH = 2
}

export interface VolumeBounds {
    minHeight: number;
    maxHeight: number;
    radius: number;
    center: Vector3;
}

export class GroundPrimitiveMaterial extends ShaderMaterial {
    // 模板常量（与Cesium保持一致）
    static readonly STENCIL_TERRAIN_MASK = 0x01;
    static readonly STENCIL_3D_TILE_MASK = 0x02;
    static readonly STENCIL_BOTH_MASK = 0x03;

    // 类型化uniforms定义
    declare uniforms: {
        [key: string]: IUniform;
        diffuse: IUniform;
        opacity: IUniform;
        map: IUniform;
        depthTexture: IUniform;
        cameraProjectionMatrix: IUniform;
        cameraProjectionMatrixInverse: IUniform;
        viewport: IUniform;
        stencilReference: IUniform;
        stencilMask: IUniform;
        classificationType: IUniform;
        volumeBounds: IUniform;
        volumeCenter: IUniform;
        debugShowShadowVolume: IUniform;
    };

    constructor(parameters: GroundPrimitiveMaterialParameters = {}) {
        const uniforms = UniformsUtils.merge([
            UniformsLib.common,
            {
                diffuse: { value: new Color(0xffffff) },
                opacity: { value: 1.0 },
                map: { value: null },

                // 深度纹理相关
                depthTexture: { value: null },
                cameraProjectionMatrix: { value: new Matrix4() },
                cameraProjectionMatrixInverse: { value: new Matrix4() },
                viewport: { value: new Vector2(1, 1) },

                // 模板测试
                stencilReference: { value: GroundPrimitiveMaterial.STENCIL_BOTH_MASK },
                stencilMask: { value: GroundPrimitiveMaterial.STENCIL_BOTH_MASK },

                // 分类类型
                classificationType: { value: ClassificationType.BOTH },

                // 体积边界
                volumeBounds: { value: new Vector3(0, 0, 0) },
                volumeCenter: { value: new Vector3(0, 0, 0) },

                // 调试
                debugShowShadowVolume: { value: false }
            }
        ]);

        super({
            uniforms,
            vertexShader: GroundPrimitiveMaterial.getVertexShader(),
            fragmentShader: GroundPrimitiveMaterial.getFragmentShader(),
            transparent: parameters.transparent ?? true,
            // 使用Three.js的标准模板测试配置
            stencilWrite: true,
            stencilFunc: 514, // THREE.EqualToStencil
            stencilRef: parameters.stencilReference ?? GroundPrimitiveMaterial.STENCIL_BOTH_MASK,
            stencilFuncMask: parameters.stencilMask ?? GroundPrimitiveMaterial.STENCIL_BOTH_MASK,
            stencilFail: 7680, // THREE.KeepStencilOp
            stencilZFail: 7680, // THREE.KeepStencilOp,  
            stencilZPass: 7680, // THREE.KeepStencilOp
        });

        this.setValues(parameters);

        // 确保类型安全
        this.updateUniforms();
    }

    private static getVertexShader(): string {
        return /* glsl */ `
      #include <common>
      #include <uv_pars_vertex>

      // 自定义属性
      attribute vec3 extrudeDirection;

      varying vec2 vUv;
      varying vec3 vWorldPosition;
      varying vec3 vExtrudeDirection;

      void main() {
        #include <uv_vertex>
        
        vUv = uv;
        vExtrudeDirection = extrudeDirection;

        vec4 worldPosition = modelMatrix * vec4(position, 1.0);
        vWorldPosition = worldPosition.xyz;

        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `;
    }

    private static getFragmentShader(): string {
        return /* glsl */ `
      #include <common>
      #include <uv_pars_fragment>
      #include <map_pars_fragment>

      uniform sampler2D depthTexture;
      uniform mat4 cameraProjectionMatrix;
      uniform mat4 cameraProjectionMatrixInverse;
      uniform vec2 viewport;
      uniform int stencilReference;
      uniform int stencilMask;
      uniform int classificationType;
      uniform vec3 volumeBounds;
      uniform vec3 volumeCenter;
      uniform bool debugShowShadowVolume;

      varying vec2 vUv;
      varying vec3 vWorldPosition;
      varying vec3 vExtrudeDirection;

      /**
       * 从深度纹理重建世界坐标
       */
      vec3 depthToWorld(vec2 uv, float depth) {
        vec4 clipSpace = vec4(uv * 2.0 - 1.0, depth * 2.0 - 1.0, 1.0);
        vec4 viewSpace = cameraProjectionMatrixInverse * clipSpace;
        viewSpace.xyz /= viewSpace.w;
        return viewSpace.xyz;
      }

      /**
       * 检查点是否在体积内（简化版球体检测）
       */
      bool pointInVolume(vec3 point) {
        // 计算到体积中心的距离
        float dist = distance(point, volumeCenter);
        
        // 检查高度范围
        bool inHeight = point.y >= volumeBounds.x && point.y <= volumeBounds.y;
        
        // 检查水平距离
        bool inRadius = dist <= volumeBounds.z;
        
        return inHeight && inRadius;
      }

      /**
       * 基于分类类型和模板值决定是否渲染
       */
      bool shouldRender(int stencilValue) {
        if (classificationType == ${ClassificationType.TERRAIN}) {
          return (stencilValue & ${GroundPrimitiveMaterial.STENCIL_TERRAIN_MASK}) != 0;
        } else if (classificationType == ${ClassificationType.CESIUM_3D_TILE}) {
          return (stencilValue & ${GroundPrimitiveMaterial.STENCIL_3D_TILE_MASK}) != 0;
        } else { // BOTH
          return stencilValue != 0;
        }
      }

      void main() {
        vec4 diffuseColor = vec4(1.0);
        
        #ifdef USE_MAP
          diffuseColor = texture2D(map, vUv);
        #endif

        // 获取当前像素的深度值
        vec2 screenUV = gl_FragCoord.xy / viewport;
        float terrainDepth = texture2D(depthTexture, screenUV).r;
        
        // 重建世界坐标
        vec3 terrainWorldPos = depthToWorld(screenUV, terrainDepth);
        
        // 体积相交测试
        bool inVolume = pointInVolume(terrainWorldPos);
        
        // 模板测试（在着色器中也可以进行逻辑检查）
        bool stencilPass = shouldRender(stencilReference);
        
        if (debugShowShadowVolume) {
          if (inVolume) {
            diffuseColor = vec4(1.0, 0.0, 0.0, 0.5);
          } else {
            discard;
          }
        } else {
          // 正常渲染：必须同时通过体积测试和模板测试
          if (!inVolume || !stencilPass) {
            discard;
          }
        }

        gl_FragColor = diffuseColor;
      }
    `;
    }

    // ========== 私有方法 ==========

    /**
     * 更新uniforms与材质状态的同步
     */
    private updateUniforms(): void {
        // 确保uniforms与材质状态同步
        this.uniforms.stencilReference.value = this.stencilRef;
        this.uniforms.stencilMask.value = this.stencilFuncMask;
    }

    // ========== 模板测试相关方法 ==========

    setStencilForTerrain(): this {
        this.stencilRef = GroundPrimitiveMaterial.STENCIL_TERRAIN_MASK;
        this.stencilFuncMask = GroundPrimitiveMaterial.STENCIL_TERRAIN_MASK;
        this.updateUniforms();
        return this;
    }

    setStencilFor3DTiles(): this {
        this.stencilRef = GroundPrimitiveMaterial.STENCIL_3D_TILE_MASK;
        this.stencilFuncMask = GroundPrimitiveMaterial.STENCIL_3D_TILE_MASK;
        this.updateUniforms();
        return this;
    }

    setStencilForBoth(): this {
        this.stencilRef = GroundPrimitiveMaterial.STENCIL_BOTH_MASK;
        this.stencilFuncMask = GroundPrimitiveMaterial.STENCIL_BOTH_MASK;
        this.updateUniforms();
        return this;
    }

    // ========== 属性设置方法 ==========

    setDepthTexture(depthTexture: Texture): this {
        this.uniforms.depthTexture.value = depthTexture;
        return this;
    }

    setCameraInfo(camera: Camera): this {
        this.uniforms.cameraProjectionMatrix.value.copy(camera.projectionMatrix);

        const projectionMatrixInverse = new Matrix4();
        projectionMatrixInverse.copy(camera.projectionMatrix).invert();
        this.uniforms.cameraProjectionMatrixInverse.value.copy(projectionMatrixInverse);

        return this;
    }

    setViewport(width: number, height: number): this {
        this.uniforms.viewport.value.set(width, height);
        return this;
    }

    setVolumeBounds(bounds: VolumeBounds): this {
        this.uniforms.volumeBounds.value.set(
            bounds.minHeight,
            bounds.maxHeight,
            bounds.radius
        );
        this.uniforms.volumeCenter.value.copy(bounds.center);
        return this;
    }

    setClassificationType(type: ClassificationType): this {
        this.uniforms.classificationType.value = type;
        return this;
    }

    setDebugShowShadowVolume(enabled: boolean): this {
        this.uniforms.debugShowShadowVolume.value = enabled;
        return this;
    }

    // ========== Three.js 材质标准方法 ==========

    copy(source: GroundPrimitiveMaterial): this {
        super.copy(source);

        // 复制自定义uniforms
        this.uniforms = UniformsUtils.clone(source.uniforms);

        return this;
    }

    /**
     * 更新方法，可在渲染循环中调用
     */
    update(camera: Camera): void {
        this.setCameraInfo(camera);
    }

    /**
     * 释放资源
     */
    dispose(): void {
        // 清理自定义资源
        this.uniforms.depthTexture.value = null;
        this.uniforms.map.value = null;

        super.dispose();
    }
}

// 为Three.js的类型系统注册自定义属性
declare module 'three' {
    interface ShaderMaterial {
        // 确保类型兼容性
        uniforms: { [key: string]: IUniform };
    }
}