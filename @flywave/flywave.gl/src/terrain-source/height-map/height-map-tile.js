import { Tile, TileLoaderState } from "@flywave/flywave-mapview";
import { TileLoader, TileFactory } from "@flywave/flywave-mapview-decoder";

import { sphereTileGridGeometry } from "./geometry/sphere-tile-geometry";
import { TileKey } from "@flywave/flywave-geoutils";
import "./shader";

export class HeightMapDemTileLoader extends TileLoader {
    loadImpl(
        abortSignal: AbortSignal,
        onDone: (doneState: TileLoaderState) => void,
        onError: (error: Error) => void
    ): void {
        this.dataProvider
            .fetchTileDem(this.tileKey, abortSignal)
            .then(payload => {
                if (this.dataSource.isDetached()) {
                    return;
                }
                if (abortSignal.aborted) {
                    // safety belt if getTile doesn't really support cancellation tokens
                    const err = new Error("Aborted");
                    err.name = "AbortError";
                    throw err;
                }
                if (payload) {
                    this.onLoaded(payload, onDone, onError);
                } else {
                    throw "Net error";
                }
            })
            .catch(error => {
                // Handle abort messages from fetch and also our own.
                if (error.name === "AbortError" || error.message === "AbortError: Aborted") {
                    return;
                }
                onError(error);
            });
    }
}

export class HeightMapMeshTileFactory extends TileFactory {
    create(dataSource, tileKey) {
        return new HeightMapMeshTile(dataSource, tileKey);
    }
}

const emptyTexture = new THREE.DataTexture();

class HeightMapMeshTile extends Tile {
    willRender = () => {
        this.shaders.forEach(shader => {
            if (shader.uniforms.uGlobePosition) {
                const inv = this.mapView.camera.matrixWorldInverse.elements;
                shader.uniforms.uGlobePosition.value.copy(
                    new THREE.Vector4(inv[12], inv[13], inv[14], this.mapView.zoomLevel)
                );
            }
        });
        if (this.dataSource.wireframe != this.wireframe) {
            this.objects.forEach(m => {
                m.material.wireframe = this.dataSource.wireframe;
            });
            this.wireframe = this.dataSource.wireframe;
        }
        return true;
    };

    shaders = [];

    onBeforeMaterialCompile = (materialTile, tileKey, tileObj) => {
        var _this = this;
        return function (shader) {
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

            // shader.fragmentShader = shader.fragmentShader.replace(
            //     `#include <premultiplied_alpha_fragment>`,
            //     `#include <terrain_premultiplied_alpha_fragment>`);

            // shader.fragmentShader = shader.fragmentShader.replace(
            //     `#include <color_pars_fragment>`,
            //     `#include <terrain_color_pars_fragment>`);

            if (_this.is_simple_patch) {
                shader.uniforms.uPatchPos = { value: _this.uPatchPos };
            }
            shader.uniforms.uNormal = { value: _this.center };
            if(!shader.defines){
              shader.defines={};
            }
            shader.defines["USE_UV"] = ""; 
            shader.defines["USE_GT_151"] = parseInt(__THREE__)>=151;
            
            var uUvTransform = _this.computeUvTransfrom(tileKey, materialTile);

            // shader.uniforms.uUvTransform = { value: uUvTransform };
            // shader.uniforms.uIsSimplePatch = { value: _this.is_simple_patch };

            var mat = new THREE.Matrix4();

            mat.elements[0] = uUvTransform.x;
            mat.elements[1] = uUvTransform.y;
            mat.elements[2] = uUvTransform.z;
            mat.elements[3] = _this.is_simple_patch ? 1 : 0;

            if (_this.uHeighMapTexture) {
                shader.defines = {};
                shader.defines["TERRAIN_ENABLE"] = true;
                shader.uniforms.uHeighMapTexture = { value: _this.uHeighMapTexture };
                // shader.uniforms.uHeightMapPos = { value: _this.uHeightMapPos };
                // shader.uniforms.uDemUnpack = { value: new THREE.Vector4(6553.6, 25.6, 0.1, 10000.0) };

                var uDemUnpack = new THREE.Vector4(6553.6, 25.6, 0.1, 10000.0);
                var uHeightMapPos = _this.uHeightMapPos;

                mat.elements[4] = uDemUnpack.x;
                mat.elements[5] = uDemUnpack.y;
                mat.elements[6] = uDemUnpack.z;
                mat.elements[7] = uDemUnpack.w;

                mat.elements[8] = uHeightMapPos.x;
                mat.elements[9] = uHeightMapPos.y;
                mat.elements[10] = uHeightMapPos.z;

                const inv = _this.mapView.camera.matrixWorldInverse.elements;
                shader.uniforms.uGlobePosition = {
                    value: new THREE.Vector4(inv[12], inv[13], inv[14], tileObj.mapView.zoomLevel)
                };
                _this.shaders.push(shader);
            } else {
                var uDemUnpack = new THREE.Vector4(0.0, 0.0, 0, 0);
                mat.elements[4] = uDemUnpack.x;
                mat.elements[5] = uDemUnpack.y;
                mat.elements[6] = uDemUnpack.z;
                mat.elements[7] = uDemUnpack.w;
                shader.uniforms.uHeighMapTexture = { value: emptyTexture };
            }

            shader.uniforms.pack = { value: mat };
        };
    };

    constructor(dataSource, tileKey) {
        super(dataSource, tileKey);

        {
            var materialProvders = dataSource.getMaterialProviders();

            this.dataSource.dataProvider().touchData(tileKey);

            const demTile = this.dataSource.dataProvider().getNeareastDemTileTexture(tileKey);

            this.demTile = demTile;

            this.bindDemTileOwnerTexture(demTile);

            var textSet = new Set();
            materialProvders.forEach(provider => {
                var materialTile = provider.getNeareastMaterialTile(tileKey);

                provider.loadNeareastTile(tileKey);

                if (materialTile) {
                    this.bindMaterialTileOwnerTexture(materialTile);
                    this.builderMesh(materialTile, provider, tileKey, demTile);
                    materialTile.textElementGroups.forEach(ele => {
                        if (!textSet.has(ele.featureId)) {
                            this.addTextElement(ele);
                            textSet.add(ele.featureId);
                        }
                    });
                }
            });
        }
    }

    clearTextElements() {}

    computeUvTransfrom(tileKey, materialTile) {
        tileKey = TileKey.fromRowColumnLevel(
            (1 << tileKey.level) - 1 - tileKey.row,
            tileKey.column,
            tileKey.level
        );
        var ah = 1,
            P,
            M;
        var H = tileKey.level,
            ae = tileKey.row,
            J = tileKey.column;
        for (; H > materialTile.tileKey.level; H--) {
            ah *= 2;
            ae >>= 1;
            J >>= 1;
        }
        P = 1 / ah;

        return new THREE.Vector3(P, (tileKey.row - ae * ah) * P, (tileKey.column - J * ah) * P);
    }

    builderMesh(materialTile, materialProvider, tileKey, demTile) {
        var { uHeighMapTexture, uHeightMapPos } = demTile || {};
        tileKey = TileKey.fromRowColumnLevel(
            (1 << tileKey.level) - 1 - tileKey.row,
            tileKey.column,
            tileKey.level
        );
        var basePost = sphereTileGridGeometry.computeSphereTileBasePosition(tileKey);

        var geometry = sphereTileGridGeometry.getTileModel(tileKey);
        const tileMesh = new THREE.Mesh(geometry, materialProvider.getMaterialByTile(materialTile));

        tileMesh.renderOrder = Number.MIN_SAFE_INTEGER + 256;

        this.is_simple_patch = geometry.mode.is_simple_patch;
        if (!geometry.mode.is_simple_patch) {
            tileMesh.rotateZ((Math.PI * 2 * tileKey.column) / (1 << tileKey.level));
        } else {
            var uPatchPos = sphereTileGridGeometry.computeSimpleROT(tileKey, basePost);
            this.uPatchPos = uPatchPos;
        }

        tileMesh.material.onBeforeCompile = this.onBeforeMaterialCompile(
            materialTile,
            this.tileKey,
            this
        );
        if (uHeighMapTexture) {
            this.uHeightMapPos = uHeightMapPos;
            this.uHeighMapTexture = uHeighMapTexture;
        }

        tileMesh.scale.copy(new THREE.Vector3(6378137, 6378137, 6378137));
        tileMesh.displacement = this.center
            .clone()
            .multiplyScalar(-1)
            .add(basePost.multiplyScalar(6378137));
        // tileMesh.castShadow = true;
        tileMesh.receiveShadow = true;
        // tileMesh.renderOrder = Number.MIN_SAFE_INTEGER;
        this.objects.push(tileMesh); 
    }

    bindMaterialTileOwnerTexture(materialTile) {
        if (materialTile && materialTile.tileKey.mortonCode() == this.tileKey.mortonCode()) {
            this.addOwnedTexture(materialTile.material);
        }
    }

    bindDemTileOwnerTexture(demTile) {
        if (demTile && demTile.tile.tileKey.mortonCode() == this.tileKey.mortonCode()) {
            this.addOwnedTexture(demTile.uHeighMapTexture);
        }
    }

    shouldDisposeObjectGeometry() {
        return false;
    }
}
