import { TileLoader } from "@flywave/flywave-mapview-decoder";
import { Tile } from "@flywave/flywave-mapview";
import * as THREE from "three";
import { GeoCoordinates } from "@flywave/flywave-geoutils";
import { LRUCache } from "@flywave/flywave-lrucache";
// import { Hilbert2d } from "hilbert";
import { encode, decode } from "@vitaly-z/hilbert-geohash";
import CsgData from "../stratum/csg-data";
import { isEqualWith } from "lodash.isequalwith";
import { HeightMap } from "./quantized-mesh/render-heightmap";

export class TinMeshLoader extends TileLoader {
    constructor(dataSource, tileKey, tile, decoder, parentTile) {
        super(dataSource, tileKey, dataSource.dataProvider(), decoder);
        this.parentTile = parentTile;
        this.tile = tile;
    }

    createMesh(quantizedMeshTerrainData, task) {
        return quantizedMeshTerrainData.createMesh(
            {
                x: this.tileKey.column,
                y: this.tileKey.row,
                level: this.tileKey.level,
                tilingScheme: this.dataSource.dataTerrainProvider.tilingScheme
            },
            task
        );
    }

    createUpSampleMesh(task) {
        const { tileKey } = this.parentTile;
        return this.parentTile.tinData.upsample(
            this.dataSource.dataTerrainProvider.tilingScheme,
            tileKey.column,
            tileKey.row,
            tileKey.level,
            this.tileKey.column,
            this.tileKey.row,
            this.tileKey.level,
            task
        );
    }

    loadImpl(
        abortSignal: AbortSignal,
        onDone: (doneState: TileLoaderState) => void,
        onError: (error: Error) => void
    ): void {
        if (!this.parentTile) {
            this.loadQuantizedMesh(abortSignal, onDone, onError);
        } else {
            this.loadQuantizedUpSampleMesh(abortSignal, onDone, onError);
        }
    }

    loadQuantizedMesh(
        abortSignal: AbortSignal,
        onDone: (doneState: TileLoaderState) => void,
        onError: (error: Error) => void
    ): void {
        this.dataSource.dataTerrainProvider
            .requestTileGeometry(this.tileKey, abortSignal)
            .then(quantizedData => {
                if (!quantizedData) {
                    // safety belt if getTile doesn't really support cancellation tokens
                    const err = new Error("Aborted");
                    err.name = "AbortError";
                    throw err;
                }

                var _reslove;
                var _reject;
                var promise = new Promise((reslove, reject) => {
                    _reslove = reslove;
                    _reject = reject;
                });

                var doneState;
                this.createMesh(quantizedData, data => {
                    this.onLoaded(
                        data,
                        _doneState => {
                            _reslove(this.decodedTile.tileTerrain);
                            doneState = _doneState;
                        },
                        err => {
                            onError(err);
                            _reject(err);
                        }
                    );
                    return promise;
                }).then(() => {
                    this.decodedTile = quantizedData;
                    onDone(doneState);
                });
            })
            .catch(error => {
                // Handle abort messages from fetch and also our own.
                if (error.name === "AbortError" || error.message === "AbortError: Aborted") {
                    return;
                }
                onError(error);
            });
    }

    loadQuantizedUpSampleMesh(
        abortSignal: AbortSignal,
        onDone: (doneState: TileLoaderState) => void,
        onError: (error: Error) => void
    ): void {
        var _reqReslove;
        var _reject;
        var promise = new Promise((reslove, reject) => {
            _reqReslove = reslove;
            _reject = reject;
        });

        var doneState;
        this.createUpSampleMesh(data => {
            this.onLoaded(
                data,
                () => {
                    _reqReslove(this.decodedTile.tileTerrain);
                    return doneState;
                },
                err => {
                    onError(err);
                    _reject(err);
                }
            );
            return promise;
        }).then(quantizedData => {
            var _reslove;
            var _reject;
            var promise = new Promise((reslove, reject) => {
                _reslove = reslove;
                _reject = reject;
            });

            this.createMesh(quantizedData, data => {
                this.onLoaded(
                    data,
                    _doneState => {
                        _reslove(this.decodedTile.tileTerrain);
                        doneState = _doneState;
                    },
                    err => {
                        onError(err);
                        _reject(err);
                    }
                );

                return promise;
            }).then(() => {
                this.decodedTile = quantizedData;
                onDone(doneState);
            });
        });
    }
}

class TinMeshResourceTile extends Tile {
    lru = new LRUCache(100);

    // hi = new Hilbert2d();
    async builderQuantized(tinData) {
        const { position3DAndHeight, textureCoordAndEncodedNormals, indices, center, color } =
            tinData._mesh;
        var geometry = new THREE.BufferGeometry();
        geometry.setIndex(new THREE.BufferAttribute(indices, 1));
        geometry.setAttribute("position", new THREE.BufferAttribute(position3DAndHeight, 3));
        if (color) geometry.setAttribute("color", new THREE.BufferAttribute(color, 3));
        geometry.setAttribute(
            "textureCoordAndEncodedNormals",
            new THREE.BufferAttribute(textureCoordAndEncodedNormals, 4)
        );
        this.tinCenter = new THREE.Vector3(center.x, center.y, center.z);

        var tempMesh = new THREE.Mesh(geometry);
        tempMesh.position.copy(this.tinCenter);
        tempMesh.updateMatrixWorld();
        this._box = new THREE.Box3();
        this._box.setFromObject(tempMesh);
        this._tempTinData = tinData;
        await this.loadCsg(tinData);
        this.tinData = tinData;
        this._geometry = geometry;
    }

    builderCsgGeometry(tinData, csgData, hightBuffer) {
        if (!csgData) {
            delete this.csgGeometry;
            delete tinData.csgStratumGroups;
            return;
        }
        var csg = new CsgData().fromJSON(csgData);
        if (this.csgGeometry) {
            this.csgGeometry.dispose();
            this.csgGeometry = csg.mesh.geometry;
        } else {
            this.csgGeometry = csg.mesh.geometry;
        }
        const { groups } = this.csgGeometry;

        tinData.csgHeightMap = new HeightMap(
            hightBuffer.buffer,
            hightBuffer.minimumHeight,
            hightBuffer.maximumHeight
        );
    }

    __prevIntersectsCsgDatas = [];
    getintersectsCsgDatas() {
        const { csgDatas } = this.dataSource.dataTerrainProvider;
        var updatedDatas = csgDatas.filter(csg => {
            return this._box.intersectsBox(csg.box);
        });

        if (this.__prevIntersectsCsgDatas.length == updatedDatas.length) {
            return [];
        }

        if (
            !isEqualWith(this.__prevIntersectsCsgDatas, csgDatas, (a, b) => {
                return a == b.hash;
            })
        ) {
            return updatedDatas;
        }
        return [];
    }

    loadCsgGeometry(intersectsCsgDatas, tinData) {
        this.__prevIntersectsCsgDatas = intersectsCsgDatas.map(cd => cd.hash);
        this.csgTinMeshLoader.setIntersectsCsgDatas(intersectsCsgDatas);
        this.csgTinMeshLoader.load();
        return this.csgTinMeshLoader.donePromise.then(() => {
            const { hightBuffer, csgData } = this.csgTinMeshLoader.decodedTile;
            this.builderCsgGeometry(tinData, csgData, hightBuffer);
        });
    }

    loadCsg(tinData) {
        let getintersectsCsgDatas = this.getintersectsCsgDatas();
        if (getintersectsCsgDatas.length) {
            return this.loadCsgGeometry(getintersectsCsgDatas, tinData);
        }

        return Promise.resolve();
    }

    get heightMap() {
        const { csgHeightMap, heightMap } = this.tinData;
        if (csgHeightMap) {
            return csgHeightMap;
        }
        return heightMap;
    }

    get geometry() {
        this.loadCsg(this.tinData);
        if (this.csgGeometry) {
            return this.csgGeometry;
        }
        return this._geometry;
    }

    clearCsgGeometry() {
        this.__prevIntersectsCsgDatas.length = [];
    }

    rayTest(ray, target) {
        const { indices, position3DAndHeight, indexCountWithoutSkirts } = this.tinData._mesh;
        var indicesLength = indices.length;
        var subIndices = indices; //.subarray(0, indexCountWithoutSkirts);

        var isRayed = false;
        var tri = new THREE.Triangle();
        if (!target) target = new THREE.Vector3();

        var preDistance = Number.MAX_SAFE_INTEGER;
        var testVector = new THREE.Vector3();
        for (var i = 0; i < indicesLength; i += 3) {
            var i0 = subIndices[i];
            var i1 = subIndices[i + 1];
            var i2 = subIndices[i + 2];

            tri.a
                .set(
                    position3DAndHeight[i0],
                    position3DAndHeight[i0 + 1],
                    position3DAndHeight[i0 + 2]
                )
                .add(this.tinCenter);

            tri.b
                .set(
                    position3DAndHeight[i1],
                    position3DAndHeight[i1 + 1],
                    position3DAndHeight[i1 + 2]
                )
                .add(this.tinCenter);

            tri.c
                .set(
                    position3DAndHeight[i2],
                    position3DAndHeight[i2 + 1],
                    position3DAndHeight[i2 + 2]
                )
                .add(this.tinCenter);

            if ((isRayed = ray.intersectTriangle(tri.a, tri.b, tri.c, false, testVector))) {
                var distance = testVector.distanceTo(ray.origin);
                if (distance < preDistance) {
                    preDistance = distance;
                    target.copy(testVector);
                    break;
                }
            }
        }
        return target.length() != 0;
    }

    getHeight(geocoord: GeoCoordinates) {
        var code = encode(geocoord.latitude, geocoord.longitude);
        if (this.lru.has(code)) {
            return this.lru.get(code);
        }
        geocoord.altitude = 1000;
        var rayOrigin = this.dataSource.mapView.projection.projectPoint(geocoord);

        var ray = new THREE.Ray(
            rayOrigin,
            new THREE.Vector3().copy(rayOrigin).normalize().multiplyScalar(-1)
        );

        var ret = new THREE.Vector3();
        if (this.rayTest(ray, ret)) {
            var geo = this.dataSource.mapView.projection.unprojectPoint(ret, new GeoCoordinates());
            this.lru.set(code, geo.altitude);
            return geo.altitude;
        }
        return false;
    }

    get waterMask() {
        const { waterMask } = this.tinData || {};
        return waterMask;
    }

    wasCreatedByUpsampling() {
        return this.tinData.wasCreatedByUpsampling();
    }

    get maximumHeight() {
        const { maximumHeight } = this.tinData._mesh || {};
        return maximumHeight;
    }

    get minimumHeight() {
        const { minimumHeight } = this.tinData._mesh || {};
        return minimumHeight;
    }

    get horizonOcclusionPoint() {
        const { _horizonOcclusionPoint } = this.tinData._mesh;
        return _horizonOcclusionPoint;
    }

    get heightMap() {
        return this.tinData.heightMap;
    }

    onDispose = tile => {
        var _this = this;
        return () => {
            _this.tinCache.remove(tile.mortonCode());
        };
    };
}

export { TinMeshResourceTile };
