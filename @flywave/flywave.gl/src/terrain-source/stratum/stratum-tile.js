import * as THREE from "three";
import { Tile } from "@flywave/flywave-mapview";
import { TileFactory } from "@flywave/flywave-mapview-decoder";
import "../tin-terrain/shader";
import { Material } from "three";

const emptyTexture = new THREE.DataTexture();
export class StratumTileFactory extends TileFactory {
    create(dataSource, tileKey) {
        return new StratumTile(dataSource, tileKey);
    }
}

const clipUvTransfrom = new THREE.Vector3(1, 0, 0);
const imageUvTransfrom = new THREE.Vector3();

class StratumTile extends Tile {
    maxHeight = 0;
    minHeight = 0;

    constructor(dataSource, tileKey) {
        super(dataSource, tileKey);

        this.dataSource.dataProvider().loadTile(tileKey);

        var stratumTile = this.dataSource.dataProvider().getBestAvailableTile(tileKey);

        if (!stratumTile) return;

        this.bindedStratumTile = stratumTile;

        this.geoBox.southWest.altitude = stratumTile.minimumHeight;
        this.geoBox.northEast.altitude = stratumTile.maximumHeight;
        this.updateBoundingBox();

        var objects = new THREE.Object3D();
        objects.position.copy(this.center).multiplyScalar(-1);

        this.objects.push(objects);

        this.rayTestMesh = this.builderRayTestMesh(stratumTile);

        this.builderMeshByMaterialProvider(objects);
    }
  
    onBeforeMaterialCompile = isWebMercator => {
        return function (shader) {
            shader.vertexShader = shader.vertexShader.replace(
                `#include <beginnormal_vertex>`,
                `#include <beginnormal_vertex>
                #include <beginnormal_tinterrain_vertex>`
            );

            shader.vertexShader = shader.vertexShader.replace(
                `#include <uv_pars_vertex>`,
                `#include <uv_pars_vertex>
                #include <tinterrain_common>`
            );

            shader.vertexShader = shader.vertexShader.replace(
                `#include <begin_vertex>`,
                `#include <begin_vertex>
                #include <begin_tinterrain_vertex>`
            );

            shader.fragmentShader = shader.fragmentShader.replace(
                `#include <color_pars_fragment>`,
                `#include <color_pars_fragment>
                 #include <tinterrain_color_pars_fragment>`
            );

            shader.fragmentShader = shader.fragmentShader.replace(
                `#include <premultiplied_alpha_fragment>`,
                `#include <premultiplied_alpha_fragment>
                 #include <discard_out_range_frag>`
            );

            shader.defines = {};
            shader.uniforms.clipUvTransfrom = {
                value: clipUvTransfrom
            };
            shader.uniforms.imageUvTransfrom = { value: imageUvTransfrom };
            shader.uniforms.isWebMercator = { value: isWebMercator };

            shader.defines["USE_UV"] = true;
            if (parseInt(__THREE__) >= 151) {
                shader.defines["USE_GT_151"] = true;
                shader.defines["USE_UV"] = true;
            }
            shader.uniforms.normalSampler = { value: emptyTexture };
        };
    };
 
    builderMeshByMaterialProvider = objects => {
        objects.add(this.builderMesh(this.builderMeshMaterial()));
    };

    builderMeshMaterial = () => {
        var material: Material = this.dataSource.getMaterialById("aaa");
        material.onBeforeCompile = this.onBeforeMaterialCompile(true);
        return material;
    };

    builderMesh(material) {
        var wrap = new THREE.Object3D();
        wrap.position.copy(this.center).multiplyScalar(-1);
        this.bindedStratumTile.geometry.computeVertexNormals()
        const tileMesh = new THREE.Mesh(this.bindedStratumTile.geometry, material);
        tileMesh.renderOrder = this.tileKey.level;
        tileMesh.position.copy(this.bindedStratumTile.tinCenter);
        tileMesh.receiveShadow = true;
        wrap.add(tileMesh);
        return wrap;
    }

    builderRayTestMesh(tinTile) {
        const tileMesh = new THREE.Mesh(tinTile.geometry);
        tileMesh.position.copy(tinTile.tinCenter);
        return tileMesh;
    }

    getRayTestMesh(camPosition) {
        this.rayTestMesh.position.copy(
            new THREE.Vector3().copy(this.bindedStratumTile.tinCenter).sub(camPosition)
        );
        this.rayTestMesh.updateMatrixWorld();
        return this.rayTestMesh;
    }

    builderDebugMesh(tinTile) {
        var wrap = new THREE.Object3D();
        wrap.position.copy(this.center).multiplyScalar(-1);

        const tileMesh = new THREE.Mesh(
            tinTile.geometry,
            new THREE.MeshPhongMaterial({ wireframe: false })
        );
        tileMesh.material.onBeforeCompile = this.onBeforeMaterialCompile(tinTile, this);
        tileMesh.renderOrder = this.tileKey.level;
        tileMesh.position.copy(tinTile.tinCenter);

        wrap.add(tileMesh);
        return wrap;
    }

    memoryUsage() {
        return 0;
    }
}
