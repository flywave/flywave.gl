import BoardMesh from "./meshes/board-mesh";
import * as THREE from "three";
import {
    GeoCoordinates,
} from "@flywave/flywave-geoutils";

class TopoBoardMesh extends THREE.Object3D {
    constructor(application, featureId) {
        super();
        this.application = application;
        this.featureId = featureId;
        this.buildBoard();
    }


    buildTopoData = (topoData) => { 
        const [w, h] = topoData.size || [1, 1];
        var depth = topoData.depth || 1;
        this.scale.set(w, h, depth);
    }

    buildBoard = () => {
        const feature = application.history.get(this.featureId);
        var { geometry: { coordinates }, topology, id } = feature;
        this.decal = new BoardMesh(topology, id);
        this.buildTopoData(topology);
        this.add(this.decal);

        if (topology.transform) {
            const { transform: { translate, rotation } } = topology;
 
            if (rotation) {
                this.quaternion.fromArray(rotation);
            }
        }
        this.anchor = GeoCoordinates.fromGeoPoint(coordinates);
    }
}

export default TopoBoardMesh;