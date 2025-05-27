import * as THREE from "three";

const emptyTexture = new THREE.DataTexture();

export class TerrainMeshLambertMaterial extends THREE.MeshLambertMaterial {
    allowOverride = false;

    commonUniform = {
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

    defines = {
        useColor: true
    };

    onBeforeCompile = shader => {
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


        //depth packing
        shader.vertexShader = shader.vertexShader.replace(
            `#include <common>`,
            `#include <common>
             #include <depth_packing_pars_vertex>
            `
        );
        shader.vertexShader = shader.vertexShader.replace(
            `#include <fog_vertex>`,
            `#include <fog_vertex>
             #include <depth_packing_vertex>
            `
        );
        shader.fragmentShader = shader.fragmentShader.replace(
            `#include <packing>`,
            `#include <packing>
             #include <depth_packing_pars_fragment>
            `
        );
        shader.fragmentShader = shader.fragmentShader.replace(
            `#include <dithering_fragment>`,
            `#include <dithering_fragment>
             #include <depth_packing_fragment>`
        );


        ///terrain proj
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
        if (parseInt(__THREE__) >= 151) {
            shader.defines["USE_GT_151"] = true;
            shader.defines["USE_UV"] = true;
        }

        Object.assign(shader.uniforms, this.commonUniform);
    };

    copy(source) {
        super.copy(source);
        this.commonUniform = source.commonUniform;

        return this;
    }
}
