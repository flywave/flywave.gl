import * as THREE from "three";

export enum RenderMode {
    ALL = 0,
    BOUNDARY_ONLY = 1,
    EXCLUDE_SIDE_FACES = 2,
    GROUND_ONLY = 3,
    STRUCTURE_ONLY = 4
}

export interface SatelliteTextureParams {
    textures: THREE.Texture[];
    uvTransforms: THREE.Vector4[];
}

// 新增纹理图集映射类型
export interface TextureAtlasMapping {
    uvTransform: THREE.Vector4;
    color?: THREE.Color;
}

export interface StratumMaterialParams extends THREE.ShaderMaterialParameters {
    textureAtlas?: THREE.Texture; // 替换为图集纹理
    textureAtlasMappings?: TextureAtlasMapping[]; // 材质组映射
    textureIntensity?: number;
    lightVector?: THREE.Vector3;
    opacity?: number;
    facetypes?: boolean;
    renderMode?: RenderMode;
    satelliteParams?: SatelliteTextureParams;
    color?: THREE.Color;
}

export class StratumMaterial extends THREE.ShaderMaterial {
    private _textureAtlas?: THREE.Texture;
    private _textureAtlasMappings: TextureAtlasMapping[] = [];
    private _satelliteTextures: THREE.Texture[] = [];
    private readonly _satelliteUvTransforms: THREE.Vector4[] = [
        new THREE.Vector4(1, 1, 0, 0),
        new THREE.Vector4(1, 1, 0, 0),
        new THREE.Vector4(1, 1, 0, 0),
        new THREE.Vector4(1, 1, 0, 0)
    ];

    private static readonly DEFAULT_PARAMS: Partial<StratumMaterialParams> = {
        textureAtlas: undefined,
        textureAtlasMappings: [],
        textureIntensity: 0.4,
        lightVector: new THREE.Vector3(1.0, 0.0, 0.5),
        opacity: 1.0,
        facetypes: undefined,
        renderMode: RenderMode.ALL,
        satelliteParams: {
            textures: [],
            uvTransforms: []
        }
    };

    constructor(params: StratumMaterialParams = {}) {
        const options = { ...StratumMaterial.DEFAULT_PARAMS, ...params };

        // 确保材质组映射初始化
        const atlasMappings = options.textureAtlasMappings || [];
        const atlasMappingCount = atlasMappings.length;

        // 定义材质统一变量
        const uniforms = {
            ...THREE.UniformsLib.fog,
            color: { value: options.color || new THREE.Color(1, 1, 1) },
            satelliteUvTransforms: { value: options.satelliteParams?.uvTransforms || [] },
            textureAtlas: { value: options.textureAtlas },
            textureIntensity: { value: options.textureIntensity },
            lightVector: { value: options.lightVector },
            opacity: { value: options.opacity },
            renderMode: { value: options.renderMode },
            satelliteCount: { value: options.satelliteParams?.textures?.length || 0 },
            satelliteMaps: { value: options.satelliteParams?.textures || [] },
            atlasDataTexture: { value: null }, // 新增加的数据纹理
            atlasTextureSize: { value: 0 } // 纹理尺寸
        };

        // 条件编译定义
        const defines: Record<string, any> = {
            USE_UV: 1,
            USE_FOG: 1,
            USE_MATERIAL_GROUP: atlasMappingCount > 0 ? 1 : 0
        };

        if (options.facetypes) {
            defines.USE_FACETYPES = 1;
        }

        // 顶点着色器
        const vertexShader = `
            #include <common>
            #include <uv_pars_vertex>
            #include <fog_pars_vertex>
            #include <normal_pars_vertex>
            #include <logdepthbuf_pars_vertex>
            
            #ifdef USE_FACETYPES
                attribute float facetypes;
                varying float vFacetype;
            #endif
            
            #ifdef USE_MATERIAL_GROUP
                attribute float materialGroup;
                varying float vMaterialGroup;
            #endif
            
            void main() {
                #include <uv_vertex>
                #include <begin_vertex>
                #include <project_vertex>
                #include <fog_vertex>
                #include <normal_vertex>
                #include <logdepthbuf_vertex>
                
                #ifdef USE_FACETYPES
                    vFacetype = facetypes;
                #endif
                
                #ifdef USE_MATERIAL_GROUP
                    vMaterialGroup = materialGroup;
                #endif
            }
        `;

        // 片段着色器
        const fragmentShader = `
            #include <common>
            #include <fog_pars_fragment>
            #include <logdepthbuf_pars_fragment>
            #include <clipping_planes_pars_fragment>
            
            uniform sampler2D textureAtlas;
            uniform float textureIntensity;
            uniform vec3 lightVector;
            uniform float opacity;
            uniform int renderMode;
            uniform int satelliteCount;
            uniform sampler2D satelliteMaps[4];
            uniform vec4 satelliteUvTransforms[4];
            uniform sampler2D atlasDataTexture; // 数据纹理
            uniform int atlasTextureSize;       // 纹理尺寸
            
            varying vec2 vUv;
            varying vec3 vNormal;
            
            #ifdef USE_FACETYPES
                varying float vFacetype;
            #endif
            
            #ifdef USE_MATERIAL_GROUP
                varying float vMaterialGroup;
            #endif
            
            // 常量定义
            const float BOUNDARY_MASK = 47.0;
            const float GROUND_MASK = 17.0;
            const float GROUND_FACE = 16.0;
            const vec3 INVALID_COLOR = vec3(-1.0);

            // 卫星纹理颜色获取
            vec3 getSatelliteColor(vec2 uv) {
                for (int i = 0; i < 4; i++) {
                    if (i >= satelliteCount) break;
                    
                    vec2 transformedUV = uv * satelliteUvTransforms[i].zw + satelliteUvTransforms[i].xy;
                    
                    if (all(greaterThanEqual(transformedUV, vec2(0.0))) && 
                        all(lessThanEqual(transformedUV, vec2(1.0)))) {
                        return texture2D(satelliteMaps[i], transformedUV).rgb;
                    }
                }
                return INVALID_COLOR;
            }
            
            // 渲染模式处理
            void applyRenderMode() {
                #ifdef USE_FACETYPES
                    if (renderMode == 4) { // STRUCTURE_ONLY
                        if ((vFacetype & 4.0) != 0.0 && (vFacetype & 8.0) == 0.0) discard;
                        if ((vFacetype & 16.0) != 0.0 && (vFacetype & 1.0) == 0.0) discard;
                    } else if (renderMode == 3) { // GROUND_ONLY
                        if ((vFacetype & GROUND_MASK) == 0.0) discard;
                    } else if (renderMode == 1) { // BOUNDARY_ONLY
                        if ((vFacetype & BOUNDARY_MASK) == 0.0) discard;
                    } else if (renderMode == 2) { // EXCLUDE_SIDE_FACES
                        if ((vFacetype & 4.0) != 0.0 && (vFacetype & 8.0) == 0.0) discard;
                    }
                #endif
            }
            
            // 光照计算
            vec3 applyLighting(vec3 color, vec3 normal) {
                vec3 lightDir = normalize(lightVector);
                float diff = max(dot(normalize(normal), lightDir), 0.3);
                return color * clamp(diff, 0.3, 1.0);
            }

            // 替换getAtlasColor函数
            vec3 getAtlasColor(vec2 uv, int mappingIndex) {
                if (mappingIndex >= atlasTextureSize) return vec3(1.0, 0.0, 1.0);
                
                // 从数据纹理读取信息
                float xCoord = (float(mappingIndex) + 0.5) / float(atlasTextureSize);
                vec4 data1 = texture2D(atlasDataTexture, vec2(xCoord, 0.25)); // 第一行存储uvTransform
                vec4 data2 = texture2D(atlasDataTexture, vec2(xCoord, 0.75)); // 第二行存储color
                
                vec4 transform = data1;
                vec3 mappingColor = data2.rgb;
                
                vec2 transformedUV = uv * transform.zw + transform.xy;
                
                if (all(greaterThanEqual(transformedUV, vec2(0.0))) && 
                    all(lessThanEqual(transformedUV, vec2(1.0)))) {
                    return texture2D(textureAtlas, transformedUV).rgb;
                }
                return mappingColor;
            }
            
            void main() {
                #include <clipping_planes_fragment>
                #include <logdepthbuf_fragment>
                
                applyRenderMode();
                
                // 基础颜色使用uniform color
                vec3 baseColor = color.rgb;
                
                // 材质组处理
                #ifdef USE_MATERIAL_GROUP
                    int materialGroupIndex = int(floor(vMaterialGroup + 0.5));
                    vec3 atlasColor = getAtlasColor(vUv, materialGroupIndex);
                    baseColor = mix(baseColor, atlasColor, textureIntensity);
                #endif
                
                // 获取卫星纹理颜色
                vec3 satelliteColor = getSatelliteColor(vUv);
                
                // 处理无效卫星纹理
                bool useFallback = all(lessThan(satelliteColor, vec3(0.0)));
                
                // 混合卫星纹理
                if (!useFallback) {
                    baseColor = mix(baseColor, satelliteColor, 0.5);
                }
                
                // 应用光照
                vec3 finalColor = applyLighting(baseColor, vNormal);
                
                // 设置输出颜色
                gl_FragColor = vec4(finalColor, opacity);
                
                #include <fog_fragment>
            }
        `;

        super({
            uniforms,
            defines,
            vertexShader,
            fragmentShader,
            fog: true,
            transparent: options.opacity < 1.0,
            clipping: true,
            ...params
        });

        this._textureAtlas = options.textureAtlas;
        this._textureAtlasMappings = options.textureAtlasMappings || [];
        this._satelliteTextures = options.satelliteParams?.textures || [];

        if (options.satelliteParams?.uvTransforms) {
            this._satelliteUvTransforms.splice(0, 4, ...options.satelliteParams.uvTransforms);
        }

        this.updateUniforms();
    }

    private updateUniforms(): void {
        this.uniforms.satelliteMaps.value = this._satelliteTextures;
        this.uniforms.satelliteCount.value = this._satelliteTextures.length;
        this.uniforms.satelliteUvTransforms.value = this._satelliteUvTransforms;
        this.uniforms.atlasMappingCount.value = this._textureAtlasMappings.length;

        // 更新材质组映射
        if (this._textureAtlasMappings.length > 0) {
            const data = new Float32Array(this._textureAtlasMappings.length * 7); // 4(uTransform) + 3(color)
            this._textureAtlasMappings.forEach((m, i) => {
                data.set(m.uvTransform.toArray(), i * 7);
                data.set(m.color?.toArray() || [1, 1, 1], i * 7 + 4);
            });

            const dataTexture = new THREE.DataTexture(
                data,
                this._textureAtlasMappings.length, // 纹理宽度
                1, // 纹理高度
                THREE.RGBAFormat, // 使用RGBA格式
                THREE.FloatType
            );
            dataTexture.needsUpdate = true;

            this.uniforms.atlasDataTexture.value = dataTexture;
            this.uniforms.atlasTextureSize.value = this._textureAtlasMappings.length;
        }
    }

    // 纹理图集属性
    get textureAtlas(): THREE.Texture | undefined {
        return this._textureAtlas;
    }

    set textureAtlas(value: THREE.Texture | undefined) {
        if (this._textureAtlas !== value) {
            this._textureAtlas = value;
            this.uniforms.textureAtlas.value = value;
            this.needsUpdate = true;
        }
    }

    // 材质组映射属性
    get textureAtlasMappings(): TextureAtlasMapping[] {
        return this._textureAtlasMappings;
    }

    set textureAtlasMappings(value: TextureAtlasMapping[]) {
        if (this._textureAtlasMappings !== value) {
            this._textureAtlasMappings = value;
            this.updateUniforms();
            this.needsUpdate = true;
        }
    }

    // Satellite textures 属性
    get satelliteTextures(): THREE.Texture[] {
        return this._satelliteTextures;
    }

    set satelliteTextures(value: THREE.Texture[]) {
        if (this._satelliteTextures !== value) {
            this._satelliteTextures = value;
            this.updateUniforms();
            this.needsUpdate = true;
        }
    }

    // Render mode 属性
    get renderMode(): RenderMode {
        return this.uniforms.renderMode.value;
    }

    set renderMode(value: RenderMode) {
        if (this.uniforms.renderMode.value !== value) {
            this.uniforms.renderMode.value = value;
            this.needsUpdate = true;
        }
    }

    // 设置卫星纹理UV变换
    setSatelliteUVTransform(
        index: number,
        scaleX: number,
        scaleY: number,
        offsetX: number,
        offsetY: number
    ) {
        if (index >= 0 && index < 4) {
            this._satelliteUvTransforms[index].set(scaleX, scaleY, offsetX, offsetY);
            this.uniforms.satelliteUvTransforms.value[index].copy(
                this._satelliteUvTransforms[index]
            );
            this.needsUpdate = true;
        }
    }
}
