import { Material, Mesh, Object3D } from "three";
import * as THREE from "three";
import { InstancedMesh } from "three";

Object.assign(THREE.ShaderChunk, {
    "selection_3dtile_pars_vert": `
    attribute float _batchid; 
    uniform float selBatchId; 
    uniform vec3 selColor;
    varying vec3 vSelColor;
  `,
    "selection_3dtile_vertex": ` 
      if(_batchid==selBatchId){
        vSelColor =selColor;
      }
  `,
    "selection_3dtile_pars_fragment": ` 
    uniform float selBatchId; 
    uniform vec3 selColor;
    uniform float selOpacity; 
    varying vec3 vSelColor;
   `,
    "selection_3dtile_fragment": `
      #ifdef PREMULTIPLIED_ALPHA

          // Get get normal blending with premultipled, use with CustomBlending, OneFactor, OneMinusSrcAlphaFactor, AddEquation.
          gl_FragColor.rgb *= gl_FragColor.a;

      #endif
      if(length(vSelColor)!=0.0){
        gl_FragColor.rgb = mix(gl_FragColor.rgb,vSelColor,0.5);
        gl_FragColor.a = selOpacity;
      }
  `
});

class Selection {
    constructor(tileRender) {
        this.color = new THREE.Color(0x00ff00);
        this.opacity = 1;
        this.tileRender = tileRender;
    }

    setColor(color) {
        this.color = color;
    }

    setOpacity(opacity) {
        this.opacity = opacity;
    }

    _selectB3dmById(dataId) {
        if (this.dataId != dataId) {
            this.clearSelector();
            this.dataId = dataId;
        }
    }

    _selectInstanceMesh(mesh:InstancedMesh,instanceId) {
        if(this.instanceMeshMap[`${mesh.uuid}_${instanceId}`]){
            return;
        }
        this.clearSelector();
        var mtl = mesh.material.clone();
        mtl.color.copy(this.color);
        // mtl.depthTest = false;
        mtl.transparent = true;
        mtl.opacity = this.opacity;
        var showMesh = new Mesh(mesh.geometry, mtl);
        this.instanceMeshMap[`${mesh.uuid}_${instanceId}`] = showMesh;
        mesh.getMatrixAt(instanceId, showMesh.matrixWorld);
        showMesh.matrixWorld.decompose(showMesh.position, showMesh.rotation, showMesh.scale);
        showMesh.scale.multiplyScalar(1.01)
        mesh.add(showMesh);
    }

    setSelectTileObject(selection) {
        if (!selection) {
            this.clearSelector();
            return;
        }
        if (selection.i3dmId) {
            this._selectInstanceMesh(selection.object,selection.instanceId);
            return true;
        }
        if (selection.classes) {
            this._selectB3dmById(selection.b3dmId);
        }
    }

    _onBeforeMaterialCompile = (batchId) => {
        var _this = this;
        return function (shader) {
            shader.vertexShader = shader.vertexShader.replace(
                `#include <uv_pars_vertex>`,
                `#include <uv_pars_vertex>
                #include <selection_3dtile_pars_vert>`
            );

            shader.vertexShader = shader.vertexShader.replace(
                `#include <begin_vertex>`,
                `#include <begin_vertex>
                #include <selection_3dtile_vertex>`
            );

            shader.fragmentShader = shader.fragmentShader.replace(
                `#include <color_pars_fragment>`,
                `#include <color_pars_fragment>
                #include <selection_3dtile_pars_fragment>`);

            shader.fragmentShader = shader.fragmentShader.replace(
                `#include <premultiplied_alpha_fragment>`,
                `#include <selection_3dtile_fragment>`);

            shader.uniforms.selColor = { value: _this.color };
            shader.uniforms.selOpacity = { value: _this.opacity };
            shader.uniforms.selBatchId = { value: batchId };
        }
    }

    filteredMateralMap = {};

    instanceMeshMap = {};

    isMatch(object) {
        return object.batchTable.header.HIERARCHY.classes.find(e => {
            return e.instances.id.indexOf(this.dataId) != -1
        })
    }

    getB3dmBatchId(object) {
        var batchId = -1;
        object.batchTable.header.HIERARCHY.classes.some((e, index) => {
            if (e.instances.id.indexOf(this.dataId) != -1) {
                batchId = object.batchTable.header.HIERARCHY.classIds.indexOf(index);
                return true;
            }
        });
        return batchId;
    }

    selectMesh(mesh: Mesh) {
        var batchId = this.getB3dmBatchId(mesh);
        if (batchId != -1) {
            if (this.filteredMateralMap[mesh.uuid]) {
                return;
            }
            this.filteredMateralMap[mesh.uuid] = { material: mesh.material, mesh: mesh };
            var cloneMaterial = mesh.material.clone();
            cloneMaterial.onBeforeCompile = this._onBeforeMaterialCompile(batchId);
            mesh.material = cloneMaterial;
        } else {
            if (mesh.uuid in this.filteredMateralMap) {
                mesh.material = this.filteredMateralMap[mesh.uuid].material;
                delete this.filteredMateralMap[mesh.uuid];
            }
        }
        return;
    }

    clearSelector() {
        this.dataId = undefined;
        for (var i in this.filteredMateralMap) {
            var mesh = this.filteredMateralMap[i].mesh;
            mesh.material = this.filteredMateralMap[i].material;
            delete this.filteredMateralMap[i];
        }

        for (var i in this.instanceMeshMap) {
            this.instanceMeshMap[i].removeFromParent();
        }
        this.instanceMeshMap = {};
    }

    onUpdate(object: Object3D) {
        if (this.dataId == undefined) return;
        object.traverse(e => {
            if (e instanceof InstancedMesh) {
                return;
            }
            if (e instanceof Mesh) {
                this.selectMesh(e);
            }
        });
    }
}

export default Selection;