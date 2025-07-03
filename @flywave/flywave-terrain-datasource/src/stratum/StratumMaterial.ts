import "./Shader";

import * as THREE from "three";

export enum RenderMode {
    ALL = 0,
    BOUNDARY_ONLY = 1,
    EXCLUDE_SIDE_FACES = 2,
    GROUND_ONLY = 3,
    STRUCTURE_ONLY = 4
}

export enum TopGroundMode {
    DEFAULT = 0
    // Add other modes as needed
}

export interface StratumMaterialParams {
    texture?: THREE.Texture;
    textureIntensity?: number;
    lightVector?: THREE.Vector3;
    opacity?: number;
    facetypes?: THREE.BufferAttribute;
    renderMode?: RenderMode;
    topGroundMode?: TopGroundMode;
    satelliteTextures?: THREE.Texture[];
    satelliteUvTransforms?: THREE.Vector4[];
}

export class StratumMaterial extends THREE.ShaderMaterial {
    private _texture?: THREE.Texture;
    private _satelliteTextures: THREE.Texture[] = [];
    private readonly _satelliteUvTransforms: THREE.Vector4[] = [
        new THREE.Vector4(1, 1, 0, 0), // 默认无变换
        new THREE.Vector4(1, 1, 0, 0),
        new THREE.Vector4(1, 1, 0, 0),
        new THREE.Vector4(1, 1, 0, 0)
    ];

    private static readonly DEFAULT_PARAMS = {
        texture: undefined,
        textureIntensity: 0.4,
        lightVector: new THREE.Vector3(1.0, 0.0, 0.5),
        opacity: 1.0,
        facetypes: undefined,
        renderMode: RenderMode.ALL,
        topGroundMode: TopGroundMode.DEFAULT,
        satelliteTextures: []
    };

    constructor(params: StratumMaterialParams = {}) {
        const options = { ...StratumMaterial.DEFAULT_PARAMS, ...params };

        const uniforms = {
            ...THREE.UniformsLib.fog,
            satelliteUvTransforms: { value: options.satelliteUvTransforms },
            texture: { value: options.texture },
            hasTexture: { value: options.texture ? 1 : 0 },
            textureIntensity: { value: options.textureIntensity },
            lightVector: { value: options.lightVector },
            opacity: { value: options.opacity },
            renderMode: { value: options.renderMode },
            topGroundMode: { value: options.topGroundMode },
            satelliteCount: { value: options.satelliteTextures?.length || 0 },
            satelliteMaps: { value: options.satelliteTextures }
        };

        const defines = {
            USE_FACETYPES: options.facetypes ? 1 : 0
        };

        const vertexShader = `
            #include <common_pars_vertex>
            #include <facetype_pars_vertex>
            #include <fog_pars_vertex>
            
            void main() {
                #include <facetype_vertex>
                vNormal = normal;
                vUv = uv;
                #include <project_vertex>
                #include <fog_vertex>
            }
        `;

        const fragmentShader = `
            #include <main_pars_fragment>
            #include <rendermode_pars_fragment>
            #include <satellite_color_pars_fragment>
            #include <fog_pars_fragment>
            
            void main() {
                #include <rendermode_fragment>
                vec3 satelliteColor = getSatelliteColor(vUv);
                #include <color_blend_fragment>
                #include <fog_fragment>
            }
        `;

        super({ uniforms, defines, vertexShader, fragmentShader });

        this._texture = options.texture;
        this._satelliteTextures = options.satelliteTextures || [];

        this.updateUniforms();
    }

    private updateUniforms(): void {
        this.uniforms.satelliteMaps.value = this._satelliteTextures;
        this.uniforms.satelliteCount.value = this._satelliteTextures.length;
    }

    // Texture property
    get texture(): THREE.Texture | undefined {
        return this._texture;
    }

    set texture(value: THREE.Texture | undefined) {
        if (this._texture !== value) {
            this._texture = value;
            this.uniforms.texture.value = value;
            this.uniforms.hasTexture.value = value ? 1 : 0;
            this.needsUpdate = true;
        }
    }

    // Satellite textures property
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

    // Render mode property
    get renderMode(): RenderMode {
        return this.uniforms.renderMode.value;
    }

    set renderMode(value: RenderMode) {
        if (this.uniforms.renderMode.value !== value) {
            this.uniforms.renderMode.value = value;
            this.needsUpdate = true;
        }
    }

    // 新增UV变换设置方法
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
