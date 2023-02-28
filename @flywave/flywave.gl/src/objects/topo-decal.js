import { DecalMesh } from "./meshes/decal-mesh";
import * as THREE from "three";
import {
    GeoCoordinates,
} from "@flywave/flywave-geoutils";

class TopoDecalMesh extends THREE.Object3D {
    constructor(application, featureId) {
        super();
        this.application = application;
        this.featureId = featureId;

        this.decal = new DecalMesh(featureId);
        var _this = this;
        _this.drawDecal();
        this.add(this.decal);
    }

    filterTopoObject = (featureId) => {
        var { topology: { type } } = this.application.history.get(featureId);
        var object = this.application.topoSource.getTopoMesh(featureId);
        return this.decal.isIntersect(object) && this.targetDecalTypes.indexOf(type) != -1;
    }

    drawDecal = async () => {
        this.position.set(0, 0, 0);
        this.updateMatrixWorld();
        const feature = application.history.get(this.featureId);

        var { geometry: { coordinates }, topology, id } = feature;

        this.anchor = GeoCoordinates.fromGeoPoint(coordinates);
        var readys = [];
        for (var { ref } of (topology.targets || [])) {
            var object = await this.application.topoSource.getTopoMesh(ref, true);
            if (object.getReady)
                readys.push(object.getReady());
        }

        return Promise.all(readys).then((meshes) => {
            this.decal.disposeAll();
            var pos = new THREE.Vector3();
            this.application.mapView.projection.projectPoint(this.anchor, pos);
            this.decal.updateMatrixWorld();
            this.position.set(0, 0, 0);
            this.updateMatrixWorld();
            meshes.forEach((mesh) => {
                var oldPos = mesh.position.clone();
                this.application.mapView.projection.projectPoint(mesh.anchor, mesh.position);
                mesh.position.sub(pos);
                this.decal.buildTopoData(topology);
                this.decal.draw(mesh);
                mesh.position.copy(oldPos);
            });
            // this.decal.position.set(0, 0, 0);
            this.decal.updateMatrixWorld();

        });
    }
}

export default TopoDecalMesh;