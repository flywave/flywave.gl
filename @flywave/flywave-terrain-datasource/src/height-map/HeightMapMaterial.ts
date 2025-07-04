import * as THREE from "three";

const emptyTexture = new THREE.DataTexture();

interface CommonUniforms {
    uHeighMapTexture: { value: THREE.Texture };
    pack: { value: THREE.Matrix4 };
    uPatchPos: { value: THREE.Matrix4 };
    overlayerHeightMap: { value: THREE.Texture };
    uDigTexture: { value: THREE.Texture | null };
    digColor: { value: THREE.Color };
    overlayerHeightMapUvTransform: { value: THREE.Vector4 };
    depth_packing_value: { value: number };
}

export class TerrainMeshLambertMaterial extends THREE.MeshLambertMaterial {
    public allowOverride: boolean = false;

    public commonUniform: CommonUniforms = {
        uHeighMapTexture: {
            value: emptyTexture
        },
        pack: {
            value: new THREE.Matrix4()
        },
        uPatchPos: {
            value: new THREE.Matrix4()
        },
        overlayerHeightMap: {
            value: emptyTexture
        },
        uDigTexture: {
            value: null
        },
        digColor: {
            value: new THREE.Color(0xffffff)
        },
        overlayerHeightMapUvTransform: {
            value: new THREE.Vector4()
        },
        depth_packing_value: {
            value: 0
        }
    };

    public defines: { [key: string]: any } = {
        useColor: true
    };

    constructor(parameters?: THREE.MeshLambertMaterialParameters) {
        super(parameters);
    }

    public onBeforeCompile = (shader: THREE.WebGLProgramParametersWithUniforms) => {
        shader.vertexShader = shader.vertexShader.replace(
            `#include <beginnormal_vertex>`,
            `#include <beginnormal_vertex>
             #include <beginnormal_terrain_vertex>`
        );

        shader.vertexShader = shader.vertexShader.replace(
            `#include <begin_vertex>`,
            `#include <begin_vertex>
             #include <terrain_simple_vert>`
        );

        shader.fragmentShader = shader.fragmentShader.replace(
            `#include <color_pars_fragment>`,
            `#include <color_pars_fragment>
             #include <dig_color_pars_fragment>`
        );

        shader.fragmentShader = shader.fragmentShader.replace(
            `#include <color_fragment>`,
            `#include <color_fragment>
             #include <dig_color_fragment>`
        );

        // Depth packing
        shader.vertexShader = shader.vertexShader.replace(
            `#include <common>`,
            `#include <common>
             #include <depth_packing_pars_vertex>`
        );
        shader.vertexShader = shader.vertexShader.replace(
            `#include <fog_vertex>`,
            `#include <fog_vertex>
             #include <depth_packing_vertex>`
        );
        shader.fragmentShader = shader.fragmentShader.replace(
            `#include <packing>`,
            `#include <packing>
             #include <depth_packing_pars_fragment>`
        );
        shader.fragmentShader = shader.fragmentShader.replace(
            `#include <dithering_fragment>`,
            `#include <dithering_fragment>
             #include <depth_packing_fragment>`
        );

        // Terrain projection
        shader.vertexShader = shader.vertexShader.replace(
            `#include <project_vertex>`,
            `#include <terrain_proj>`
        );

        shader.vertexShader = shader.vertexShader.replace(
            `#include <uv_pars_vertex>`,
            `#include <uv_pars_vertex>
            #include <terrain_common_pars>
            #include <terrain_common>
            #include <terrain_pars_vert>`
        );

        if (!shader.defines) {
            shader.defines = {};
        }
        shader.defines["USE_UV"] = false;

        const threeVersion = parseInt(THREE.REVISION);
        if (!isNaN(threeVersion) && threeVersion >= 151) {
            shader.defines["USE_GT_151"] = true;
            shader.defines["USE_UV"] = true;
        }

        Object.assign(shader.uniforms, this.commonUniform);
    };

    public copy(source: TerrainMeshLambertMaterial): this {
        super.copy(source);
        this.commonUniform = { ...source.commonUniform };
        this.allowOverride = source.allowOverride;
        this.defines = { ...source.defines };
        return this;
    }
}
