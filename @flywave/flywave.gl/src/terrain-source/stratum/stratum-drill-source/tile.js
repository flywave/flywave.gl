import { TileFactory } from "@flywave/flywave-mapview-decoder";
import { Tile } from "@flywave/flywave-mapview";
import { TileLoader } from "@flywave/flywave-mapview-decoder";
import * as THREE from "three";
import { GeoCoordinates } from "@flywave/flywave-geoutils";

var cylinderGeometry = new THREE.CylinderGeometry(0.5, 0.5, 1, 30);
cylinderGeometry.translate(0, 0.5, 0);
cylinderGeometry.rotateX(Math.PI / 2);
var tempV3 = new THREE.Vector3();
class StratumDrillTileLoader extends TileLoader {
    buildTileDrillMesh({ features, properties }) {
        const { projection } = this.dataSource.mapView;
        var wrap = new THREE.Object3D();
        wrap.position.copy(this.tile.center).multiplyScalar(-1);
        var layerMeshies = {};
        var position;
        features.forEach(feature => {
            const {
                geometry: { coordinates },
                properties: { layer, layerName, thickness }
            } = feature;
            if (!thickness) return;
            var cloneCoordinate = coordinates.slice();
            cloneCoordinate[2] -= thickness/2;
            if (!layerMeshies[layer]) {
                layerMeshies[layer] = { matrixs: [], layerName, features: [] };
            }
            if (!position) {
                position = new THREE.Vector3();
                projection.projectPoint(GeoCoordinates.fromGeoPoint(cloneCoordinate), position);
            }

            projection.projectPoint(GeoCoordinates.fromGeoPoint(cloneCoordinate), tempV3);
            var tempObject = new THREE.Object3D();
            tempObject.lookAt(tempV3);
            tempObject.scale.set(this.dataSource.radius, this.dataSource.radius, thickness);
            layerMeshies[layer].matrixs.push(
                new THREE.Matrix4().compose(
                    tempV3.sub(this.tile.center),
                    tempObject.quaternion,
                    tempObject.scale
                )
            );
            layerMeshies[layer].features.push(feature);
        });

        for (var layer in layerMeshies) {
            var mesh;
            if (!layerMeshies[layer].mesh) {
                mesh = layerMeshies[layer].mesh = new THREE.InstancedMesh(
                    cylinderGeometry,
                    this.dataSource.stratumSource.getDrillMaterialById(
                        layerMeshies[layer].layerName
                    ),
                    layerMeshies[layer].matrixs.length
                );
                mesh.userData = {
                    dataSource: this.dataSource.name,
                    features: layerMeshies[layer].features
                };
                mesh.position.copy(this.tile.center);
                wrap.add(mesh);
            } else {
                mesh = layerMeshies[layer].mesh;
            }
            layerMeshies[layer].matrixs.forEach((matrixs, index) => {
                mesh.setMatrixAt(index, matrixs);
            });
        }

        this.tile.baseObject.add(wrap);
    }

    fliterLables(features) {
        return features.filter(({ properties }) => {
            return properties && properties.name;
        });
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
                this.onLoaded(
                    { type: "FeatureCollection", features: this.fliterLables(payload.features) },
                    onDone,
                    onError
                );
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
