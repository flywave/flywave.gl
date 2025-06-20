import { DataTerrainProvider } from "../tin-terrain/data-terrain-provider";
import { TinMeshResourceTile, TinMeshLoader } from "../tin-terrain/tin-terrain-loader";
import { Box3 } from "three";
import isEqualWith from "lodash.isequalwith";
import CsgData from "./csg-data";
import { HeightMap } from "../tin-terrain/quantized-mesh/render-heightmap";
import { TileLoader } from "@flywave/flywave-mapview-decoder";

export class CsgTinMeshLoader extends TileLoader {
    constructor(dataSource, tileKey, tile) {
        super(dataSource, tileKey, dataSource.dataTerrainProvider, dataSource.csgDecoder);
        this.tile = tile;
    }

    loadImpl(abortSignal, onDone, onError) {
        const { position3DAndHeight, textureCoordAndEncodedNormals, indices, center } =
            this.tile._tempTinData._mesh;
        const { _stratumGroups } = this.tile._tempTinData;

        const { stratum_data } = this.dataSource.dataTerrainProvider;
        this.onLoaded(
            {
                geoBox: this.tile.geoBox.southWest
                    .toGeoPoint()
                    .concat(this.tile.geoBox.northEast.toGeoPoint()),
                source: {
                    position3DAndHeight,
                    textureCoordAndEncodedNormals,
                    indices,
                    stratum_data: stratum_data.map(({ properties }) => {
                        const { name: layerName } = properties || {};
                        return layerName;
                    }),
                    colorScheme: this.dataSource._colorScheme,
                    stratumGroups: _stratumGroups,
                    center
                },
                target: this.__intersectsCsgDatas.map(d => d.toJSON())
            },
            doneState => {
                onDone(doneState);
            },
            err => {
                onError(err);
            }
        );
    }

    __intersectsCsgDatas = [];
    setIntersectsCsgDatas(intersectsCsgDatas) {
        this.__intersectsCsgDatas = intersectsCsgDatas;
    }
}

class StratumResourceTile extends TinMeshResourceTile {
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
        this._box = new Box3();
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
        const { _stratumGroups } = tinData;
        var csg = new CsgData().fromJSON(csgData);
        if (this.csgGeometry) {
            this.csgGeometry.dispose();
            this.csgGeometry = csg.mesh.geometry;
        } else {
            this.csgGeometry = csg.mesh.geometry;
        }
        const { groups } = this.csgGeometry;
        var stratumGroups = {};
        if (groups) {
            groups.forEach(group => {
                stratumGroups[group.materialIndex] = {
                    ..._stratumGroups[group.materialIndex],
                    Start: group.start,
                    End: group.start + group.count
                };
            });
        }

        tinData.csgHeightMap = new HeightMap(
            hightBuffer.buffer,
            hightBuffer.minimumHeight,
            hightBuffer.maximumHeight
        );
        tinData.csgStratumGroups = stratumGroups;
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
        if (this.isEmptyStratum(tinData)) return this._geometry;
        let getintersectsCsgDatas = this.getintersectsCsgDatas();
        if (getintersectsCsgDatas.length) {
            return this.loadCsgGeometry(getintersectsCsgDatas, tinData);
        }

        return Promise.resolve();
    }

    isEmptyStratum(tinData) {
        const { _stratumGroups } = tinData || this.tinData;
        return !_stratumGroups || Object.values(_stratumGroups).length == 1;
    }

    get heightMap() {
        const { csgHeightMap, heightMap } = this.tinData;
        if (csgHeightMap) {
            return csgHeightMap;
        }
        return heightMap;
    }

    get geometry() {
        if (this.isEmptyStratum(this.tinData)) return this._geometry;
        this.loadCsg(this.tinData);
        if (this.csgGeometry) {
            return this.csgGeometry;
        }
        return this._geometry;
    }

    clearCsgGeometry() {
        this.__prevIntersectsCsgDatas.length = [];
    }
}

class DataStratumProvider extends DataTerrainProvider {
    makeLoaderTile(tileKey, parentTileTinData) {
        var tile = new StratumResourceTile(this.dataSource, tileKey);
        tile.tileKey.level = tile.tileKey.level - 1;
        tile.geoBox = this.tilingScheme.getGeoBox(tile.tileKey);
        tile.tileLoader = new TinMeshLoader(
            this.dataSource,
            tileKey,
            tile,
            this.dataSource.decoder,
            parentTileTinData
        );
        tile.csgTinMeshLoader = new CsgTinMeshLoader(this.dataSource, tileKey, tile);
        return tile;
    }

    parseMetadataSuccess(data) {
        this.stratum_data = data.stratum_data;
        return super.parseMetadataSuccess(data);
    }
}

export { DataStratumProvider };
