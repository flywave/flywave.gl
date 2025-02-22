import * as THREE from "three";

const emptyTexture = new THREE.DataTexture();

export class TerrainMeshLambertMaterial extends THREE.MeshLambertMaterial {
    commonUniform = {
        uHeighMapTexture: {
            value: emptyTexture
        },
        pack: {
            value: new THREE.Matrix4()
        },
        uPatchPos: {
            value: new THREE.Matrix4()
        }
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
        super.copy(source)
        this.commonUniform = source.commonUniform; 

        return this;
    }
}
