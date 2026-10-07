/* Copyright (C) 2025 flywave.gl contributors */

import {
    type Camera,
    type Texture,
    Color,
    Matrix4,
    ShaderMaterial,
    Vector2,
    Vector3
} from "three/webgpu";

interface IUniform<TValue = any> {
    value: TValue;
}

type UniformsSpec = Record<string, IUniform>;

function mergeUniforms(...sources: UniformsSpec[]): UniformsSpec {
    return Object.assign({}, ...sources);
}

function cloneUniforms(uniforms: UniformsSpec): UniformsSpec {
    const cloned: UniformsSpec = {};
    for (const key in uniforms) {
        cloned[key] = { value: uniforms[key].value };
    }
    return cloned;
}

export interface GroundPrimitiveMaterialParameters {
    color?: Color | string | number;
    map?: Texture | null;
    opacity?: number;
    transparent?: boolean;

    // Depth texture
    depthTexture?: Texture | null;

    // Stencil test related
    stencilReference?: number;
    stencilMask?: number;

    // Classification type
    classificationType?: ClassificationType;

    // Volume bounds
    volumeBounds?: VolumeBounds;

    // Debug options
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
    // Stencil constants (kept consistent with Cesium)
    static readonly STENCIL_TERRAIN_MASK = 0x01;
    static readonly STENCIL_3D_TILE_MASK = 0x02;
    static readonly STENCIL_BOTH_MASK = 0x03;

    // Typed uniforms declaration
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
        const uniforms = mergeUniforms(
            {
                diffuse: { value: new Color(0xffffff) },
                opacity: { value: 1.0 }
            },
            {
                diffuse: { value: new Color(0xffffff) },
                opacity: { value: 1.0 },
                map: { value: null },

                // Depth texture related
                depthTexture: { value: null },
                cameraProjectionMatrix: { value: new Matrix4() },
                cameraProjectionMatrixInverse: { value: new Matrix4() },
                viewport: { value: new Vector2(1, 1) },

                // Stencil test
                stencilReference: { value: GroundPrimitiveMaterial.STENCIL_BOTH_MASK },
                stencilMask: { value: GroundPrimitiveMaterial.STENCIL_BOTH_MASK },

                // Classification type
                classificationType: { value: ClassificationType.BOTH },

                // Volume bounds
                volumeBounds: { value: new Vector3(0, 0, 0) },
                volumeCenter: { value: new Vector3(0, 0, 0) },

                // Debug
                debugShowShadowVolume: { value: false }
            }
        );

        super({
            uniforms,
            vertexShader: GroundPrimitiveMaterial.getVertexShader(),
            fragmentShader: GroundPrimitiveMaterial.getFragmentShader(),
            transparent: parameters.transparent ?? true,
            // Use Three.js's standard stencil test configuration
            stencilWrite: true,
            stencilFunc: 514, // THREE.EqualToStencil
            stencilRef: parameters.stencilReference ?? GroundPrimitiveMaterial.STENCIL_BOTH_MASK,
            stencilFuncMask: parameters.stencilMask ?? GroundPrimitiveMaterial.STENCIL_BOTH_MASK,
            stencilFail: 7680, // THREE.KeepStencilOp
            stencilZFail: 7680, // THREE.KeepStencilOp,
            stencilZPass: 7680 // THREE.KeepStencilOp
        });

        this.setValues(parameters);

        // Ensure type safety
        this.updateUniforms();
    }

    private static getVertexShader(): string {
        return /* glsl */ `
      #include <common>
      #include <uv_pars_vertex>

      // Custom attribute
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
       * Reconstruct world coordinates from the depth texture
       */
      vec3 depthToWorld(vec2 uv, float depth) {
        vec4 clipSpace = vec4(uv * 2.0 - 1.0, depth * 2.0 - 1.0, 1.0);
        vec4 viewSpace = cameraProjectionMatrixInverse * clipSpace;
        viewSpace.xyz /= viewSpace.w;
        return viewSpace.xyz;
      }

      /**
       * Check whether a point is inside the volume (simplified sphere test)
       */
      bool pointInVolume(vec3 point) {
        // Compute the distance to the volume center
        float dist = distance(point, volumeCenter);
        
        // Check the height range
        bool inHeight = point.y >= volumeBounds.x && point.y <= volumeBounds.y;
        
        // Check the horizontal distance
        bool inRadius = dist <= volumeBounds.z;
        
        return inHeight && inRadius;
      }

      /**
       * Decide whether to render based on the classification type and stencil value
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

        // Read the depth value of the current pixel
        vec2 screenUV = gl_FragCoord.xy / viewport;
        float terrainDepth = texture2D(depthTexture, screenUV).r;
        
        // Reconstruct world coordinates
        vec3 terrainWorldPos = depthToWorld(screenUV, terrainDepth);
        
        // Volume intersection test
        bool inVolume = pointInVolume(terrainWorldPos);
        
        // Stencil test (the logic can also be checked in the shader)
        bool stencilPass = shouldRender(stencilReference);
        
        if (debugShowShadowVolume) {
          if (inVolume) {
            diffuseColor = vec4(1.0, 0.0, 0.0, 0.5);
          } else {
            discard;
          }
        } else {
          // Normal rendering: must pass both the volume test and the stencil test
          if (!inVolume || !stencilPass) {
            discard;
          }
        }

        gl_FragColor = diffuseColor;
      }
    `;
    }

    // ========== Private methods ==========

    /**
     * Synchronize the uniforms with the material state
     */
    private updateUniforms(): void {
        // Ensure the uniforms stay in sync with the material state
        this.uniforms.stencilReference.value = this.stencilRef;
        this.uniforms.stencilMask.value = this.stencilFuncMask;
    }

    // ========== Stencil test methods ==========

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

    // ========== Property setter methods ==========

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
        this.uniforms.volumeBounds.value.set(bounds.minHeight, bounds.maxHeight, bounds.radius);
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

    // ========== Standard Three.js material methods ==========

    copy(source: GroundPrimitiveMaterial): this {
        super.copy(source);

        // Copy the custom uniforms
        this.uniforms = cloneUniforms(source.uniforms as UniformsSpec) as typeof this.uniforms;

        return this;
    }

    /**
     * Update method; can be called in the render loop
     */
    update(camera: Camera): void {
        this.setCameraInfo(camera);
    }

    /**
     * Release resources
     */
    dispose(): void {
        // Clean up custom resources
        this.uniforms.depthTexture.value = null;
        this.uniforms.map.value = null;

        super.dispose();
    }
}
