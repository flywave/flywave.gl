import { DataTerrainProvider } from "../tin-terrain/data-terrain-provider";
import { TinMeshResourceTile, TinMeshLoader } from "../tin-terrain/tin-terrain-loader";
import { TileLoader } from "@flywave/flywave-mapview-decoder";
import { Box3 } from "three";
import { isEqualWith } from "lodash";

class CsgTinMeshLoader extends TileLoader {
    constructor(dataSource, tileKey, tile) {
        super(dataSource, tileKey, dataSource.dataTerrainProvider, dataSource.csgDecoder);
        this.tile = tile;
    }

    loadImpl(abortSignal, onDone, onError) {
        const { position3DAndHeight, textureCoordAndEncodedNormals, indices, center } =
        this.tile.tinData._mesh;

        this.onLoaded(
            {
                source: {
                    position3DAndHeight,
                    textureCoordAndEncodedNormals,
                    indices,
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
    builderQuantized(tinData) {
        this.tinData = tinData;
        const { position3DAndHeight, textureCoordAndEncodedNormals, indices, center } =
            tinData._mesh;
        var geometry = new THREE.BufferGeometry();
        geometry.setIndex(new THREE.BufferAttribute(indices, 1));
        geometry.setAttribute("position", new THREE.BufferAttribute(position3DAndHeight, 3));
        // geometry.setAttribute("position3DAndHeight", new THREE.BufferAttribute(position3DAndHeight, 4));
        geometry.setAttribute(
            "textureCoordAndEncodedNormals",
            new THREE.BufferAttribute(textureCoordAndEncodedNormals, 4)
        );
        this._geometry = geometry;

        this.tinCenter = new THREE.Vector3(center.x, center.y, center.z);

        var tempMesh = new THREE.Mesh(geometry);
        tempMesh.position.copy(this.tinCenter);
        tempMesh.updateMatrixWorld();
        this._box = new Box3();
        this._box.setFromObject(tempMesh);
    }

    builderCsgGeometry(csgData) {
        this.csgGeometry = csgData;
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

    loadCsgGeometry(intersectsCsgDatas) {
        this.__prevIntersectsCsgDatas = intersectsCsgDatas.map(cd => cd.hash);
        this.csgTinMeshLoader.setIntersectsCsgDatas(intersectsCsgDatas);
        this.csgTinMeshLoader.load();
        this.csgTinMeshLoader.donePromise.then(() => {
            this.builderCsgGeometry(tile.csgTinMeshLoader.csgData);
            this.dataSource.updateTileOverlayer(tile);
        });
    }

    get geometry() {
        let getintersectsCsgDatas = this.getintersectsCsgDatas();
        if (getintersectsCsgDatas.length) {
            this.loadCsgGeometry(getintersectsCsgDatas);
        }
        if (this.csgGeometry) {
            return this.csgGeometry;
        }
        return this._geometry;
    }
}

class DataStratumProvider extends DataTerrainProvider {
    csgDatas = [];

    addCsgData(csgdata) {
        this.csgDatas.push(csgdata);
        this.dataSource.updateTileOverlayer();
    }

    removeCsgData(id) {
        this.csgDatas = this.csgDatas.filter(csg => csg.id != id);
    }

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
}

export { DataStratumProvider };
