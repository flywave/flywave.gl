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
const imageUvTransfrom = new THREE.Vector4(1, 1, 0, 0);

class StratumTile extends Tile {
    maxHeight = 0;
    minHeight = 0;

    constructor(dataSource, tileKey) {
        super(dataSource, tileKey);

        this.dataSource.dataProvider().loadTile(tileKey);

        var stratumTile = this.dataSource.dataProvider().getBestAvailableTile(tileKey);

        if (!stratumTile) {
            var { minElevation, maxElevation } = this.dataSource
                .getElevationRangeSource()
                .getElevationRange(tileKey);
            this.geoBox.southWest.altitude = minElevation || 0;
            this.geoBox.northEast.altitude = maxElevation || 0;
            return;
        }

        this.bindedStratumTile = stratumTile;

        const {
            tinData: { _stratumGroups, csgStratumGroups }
        } = this.bindedStratumTile;
        this.stratumGroups = { ...(csgStratumGroups || _stratumGroups) };

        this.geoBox.southWest.altitude = stratumTile.minimumHeight;
        this.geoBox.northEast.altitude = stratumTile.maximumHeight;
        this.updateBoundingBox();

        var objects = new THREE.Object3D();
        objects.position.copy(this.center).multiplyScalar(-1);

        this.objects.push(objects);

        this.rayTestMesh = this.builderRayTestMesh(stratumTile);

        this.builderMeshByMaterialProvider(objects);
    }

    onBeforeMaterialCompile = (isWebMercator, material) => {
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
                `#include <premultiplied_alpha_fragment>`
            );

            shader.defines = {};
            shader.uniforms.clipUvTransfrom = {
                value: clipUvTransfrom
            };
            var uvTransform = new THREE.Vector4();
            if (material.map) {
                const { x, y } = material.map.repeat;
                uvTransform.set(x, y, 0, 0);
            } else {
                uvTransform = imageUvTransfrom;
            }
            shader.uniforms.imageUvTransfrom = { value: uvTransform };
            shader.uniforms.isWebMercator = { value: isWebMercator };

            // shader.defines["USE_UV"] = true;
            if (parseInt(__THREE__) >= 151) {
                shader.defines["USE_GT_151"] = true;
                shader.defines["USE_UV"] = true;
            }
            shader.uniforms.normalSampler = { value: emptyTexture };
        };
    };

    builderMeshByMaterialProvider = objects => {
        objects.add(this.builderMesh());
    };

    builderMeshMaterial = Id => {
        var material: Material = this.dataSource.getMaterialById(Id);
        material.onBeforeCompile = this.onBeforeMaterialCompile(true, material);
        return material;
    };

    builderMesh() {
        var wrap = new THREE.Object3D();
        wrap.position.copy(this.center).multiplyScalar(-1);
        const { stratumGroups } = this;

        if (stratumGroups) {
            for (var { Start, End, Id } of Object.values(stratumGroups)) {
                const tileMesh = new THREE.Mesh(
                    this.bindedStratumTile.geometry,
                    this.builderMeshMaterial(Id)
                );
                tileMesh.position.copy(this.bindedStratumTile.tinCenter);
                tileMesh.onBeforeRender = (function (Start, End, geometry) {
                    return () => {
                        geometry.setDrawRange(Start, End - Start);
                    };
                })(Start, End, tileMesh.geometry);
                //hidden
                // tileMesh.visible=false;
                wrap.add(tileMesh);
            }
        }

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
