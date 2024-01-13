import { TileFactory } from "@flywave/flywave-mapview-decoder";
import { Tile } from "@flywave/flywave-mapview";
import { TileLoader } from "@flywave/flywave-mapview-decoder";
import * as THREE from "three";
import { GeoCoordinates } from "@flywave/flywave-geoutils";

var cylinderGeometry = new THREE.CylinderGeometry(20.5, 20.5, 1, 30);

var tempV3 = new THREE.Vector3();
class StratumDrillTileLoader extends TileLoader {
    buildTileDrillMesh({ features }) {
        const { projection } = this.dataSource.mapView;

        var wrap = new THREE.Object3D();
        wrap.position.copy(this.tile.center).multiplyScalar(-1);

        features.forEach(({ geometry: { coordinates }, properties: { layer } }) => {
            var mesh = new THREE.Mesh(
                cylinderGeometry,
                this.dataSource.stratumSource.getMaterialById(layer)
            );
            projection.projectPoint(GeoCoordinates.fromGeoPoint(coordinates), tempV3);
            mesh.scale.set(1, 1, coordinates[2]);
            mesh.lookAt(tempV3);
            mesh.position.copy(tempV3);
            wrap.add(mesh);
        });
        this.tile.baseObject.add(wrap);
    }

    loadImpl(abortSignal, onDone, onError) {
        this.dataProvider
            .getTile(this.tileKey, abortSignal)
            .then(payload => {
                if (abortSignal.aborted) {
                    // safety belt if getTile doesn't really support cancellation tokens
                    const err = new Error("Aborted");
                    err.name = "AbortError";
                    throw err;
                }
                this.onLoaded(payload, onDone, onError);
                this.buildTileDrillMesh(payload);
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

class StratumDrillTile extends Tile {
    constructor(dataSource, tileKey) {
        super(dataSource, tileKey);

        var objects = new THREE.Object3D();
        objects.position.copy(this.center).multiplyScalar(-1);
        this.baseObject = objects;
        this.objects.push(objects);
    }

    clear() {
        super.clear();
        this.objects.push(this.baseObject);
    }

    memoryUsage() {
        return 0;
    }
}

export class StratumDrillTileFactory extends TileFactory {
    create(dataSource, tileKey) {
        var tile = new StratumDrillTile(dataSource, tileKey);
        tile.tileLoader = new StratumDrillTileLoader(
            dataSource,
            tileKey,
            dataSource.dataProvider(),
            dataSource.decoder
        );
        tile.tileLoader.tile = tile;
        return tile;
    }
}
