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

var uDemUnpack0 = new THREE.Vector4(6553.6, 25.6, 0.1, 10000.0);
var uDemUnpack1 = new THREE.Vector4(0.0, 0.0, 0, 0);
const emptyTexture = new THREE.DataTexture();
class HeightMapMeshTile extends Tile {
    onMeshBeforeRender = (material, materialTile, tileKey) => {
        let _this = this;
        var uUvTransform = _this.computeUvTransfrom(tileKey, materialTile);
        let overlayerHeightMap = _this.dataSource.overlayerHeightMapTexture.getBindTexture(this); 
        return (renderer, scene, camera, geometry) => {
            const { commonUniform } = material;
            if (_this.uPatchPos) commonUniform.uPatchPos.value.copy(_this.uPatchPos);

            var mat = new THREE.Matrix4();

            mat.elements[0] = uUvTransform.x;
            mat.elements[1] = uUvTransform.y;
            mat.elements[2] = uUvTransform.z;
            mat.elements[3] = _this.is_simple_patch ? 1 : 0;

            if (_this.uHeighMapTexture) {
                var uHeightMapPos = _this.uHeightMapPos;

                mat.elements[4] = uDemUnpack0.x;
                mat.elements[5] = uDemUnpack0.y;
                mat.elements[6] = uDemUnpack0.z;
                mat.elements[7] = uDemUnpack0.w;

                mat.elements[8] = uHeightMapPos.x;
                mat.elements[9] = uHeightMapPos.y;
                mat.elements[10] = uHeightMapPos.z;
                commonUniform.uHeighMapTexture.value = _this.uHeighMapTexture;
                // _this.shaders.push(shader);
            } else {
                commonUniform.uHeighMapTexture.value = emptyTexture;
                mat.elements[4] = uDemUnpack1.x;
                mat.elements[5] = uDemUnpack1.y;
                mat.elements[6] = uDemUnpack1.z;
                mat.elements[7] = uDemUnpack1.w;
            }

            commonUniform.pack.value.copy(mat);
            if (overlayerHeightMap) {
                const [texture, transform] = overlayerHeightMap;
                commonUniform.overlayerHeightMapUvTransform.value = transform;
                commonUniform.overlayerHeightMap.value = texture;
            }
            commonUniform.uDigTexture.value = _this.dataSource.overlayerHeightMapTexture.digTexture;
            commonUniform.digColor.value = _this.dataSource.overlayerHeightMapTexture.digColor;
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
                    // this.bindMaterialTileOwnerTexture(materialTile);
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

    shouldDisposeObjectMaterial() {
        return false;
    }

    shouldDisposeObjectGeometry() {
        return false;
    }

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

        // tileMesh.material.onBeforeCompile = this.onBeforeMaterialCompile(
        //     materialTile,
        //     this.tileKey,
        //     this
        // );

        tileMesh.onBeforeRender = this.onMeshBeforeRender(
            tileMesh.material,
            materialTile,
            this.tileKey
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
        this.objects.push(tileMesh);
    }

    bindMaterialTileOwnerTexture(materialTile) {
        // if (materialTile && materialTile.tileKey.mortonCode() == this.tileKey.mortonCode()) {
        // this.addOwnedTexture(materialTile.material);
        // }
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
