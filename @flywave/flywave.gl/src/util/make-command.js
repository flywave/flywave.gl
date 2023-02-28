import TopologyChangeCmd from "../command/topology-change-cmd";
import {
    GeoCoordinates,
} from "@flywave/flywave-geoutils";
import * as THREE from "three";

export function makeMultiPointDefaultLookup(application, feature, newPoint) {
    var { geometry: { coordinates, type }, topology } = feature;
    if (type !== "MultiPoint") {
        return;
    }
    var ntopology = { ...topology, matrixs: {} };

    var mat = new THREE.Object3D;
    coordinates.concat(newPoint ? [newPoint] : []).forEach((e, i) => {
        if (!ntopology.matrixs[i]) {
            mat.lookAt(application.mapView.projection.projectPoint(
                new GeoCoordinates(e[1], e[0], e[2]), new THREE.Vector3));
            mat.updateMatrix()
            ntopology.matrixs[i] = mat.matrix.elements;
        }
    });
    return new TopologyChangeCmd(feature.id, ntopology);
}