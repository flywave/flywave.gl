import * as THREE from "three";
import {
    GeoCoordinates,
} from "@flywave/flywave-geoutils";
import { PointMaterial } from "./default-point";
import RemoteTopo from "./remote-topo";
import * as turf from '@turf/turf';

var modelCache = new Map();

class TopoMultiPoints extends RemoteTopo {
    constructor(application, feature) {
        super(application);

        this.readyPromise = new Promise((reslove, reject) => {
            this.reslove = reslove;
            this.reject = reject;
        });

        this.indexPoint = {};

        const { geometry: { coordinates: center } } = turf.center(feature);
        this.anchor = new GeoCoordinates(center[1], center[0], center[2] || 0);

        const { geometry: { coordinates } } = feature;
        coordinates.forEach((e, i) => {
            var p = this.makeDefaultPoints(feature, e);
            this.add(p);
            this.indexPoint[i] = p;
        });

        this.feature = feature;
    }

    instanceMeshes = [];

    makeDefaultPoints(feature, coordinates, sp) {
        const sprite = sp || new THREE.Sprite(PointMaterial);
        sprite.scale.set(.02, .02, .02);
        sprite.position.copy(this.application.mapView.projection.projectPoint(
            new GeoCoordinates(coordinates[1], coordinates[0], coordinates[2]), new THREE.Vector3)
            .sub(this.application.mapView.projection.projectPoint(
                this.anchor, new THREE.Vector3)));
        sprite.userData = {
            feature: {
                geometryType: "topo",
                id: feature.id
            }
        };
        return sprite;
    }

    withReady(opt) {
        this.readyPromise.then(() => opt());
    }

    flush(feature) {
        const { topology } = feature;
        if (topology && topology.model) {
            if (modelCache.has(topology.model)) {
                var m = modelCache.get(topology.model);
                this.updateScene(m, feature, m.matElement);
                return Promise.resolve().then(this.reslove);
            }
            return super.flush(feature).then(this.reslove);
        }
        return Promise.resolve().then(this.reslove);
    }

    getPointMatrix(i, feature) {
        const { geometry: { coordinates }, topology } = feature;
        var positon = this.application.mapView.projection.projectPoint(
            new GeoCoordinates(coordinates[i][1], coordinates[i][0], coordinates[i][2]), new THREE.Vector3)
            .sub(this.application.mapView.projection.projectPoint(
                this.anchor, new THREE.Vector3));

        var mat = new THREE.Matrix4();
        if (topology && topology.matrixs && topology.matrixs[i]) {
            mat.elements = topology.matrixs[i].slice();
        }
        mat.setPosition(positon.x, positon.y, positon.z);
        return mat;
    }

    makeInstanceMesh(gltf, coordinates, feature, mat) {
        mat.decompose(gltf.position, gltf.quaternion, gltf.scale);
        gltf.updateMatrixWorld();
        gltf.traverse(object => {
            if (object instanceof THREE.Mesh) {
                object.updateMatrixWorld();
                const { geometry, matrixWorld, material } = object;
                var instance = new THREE.InstancedMesh(geometry, material, coordinates.length);
                instance.userData = {
                    feature: {
                        geometryType: "topo",
                        id: feature.id
                    }
                };
                instance.castShadow = true;
                instance.frustumCulled = true;

                const _sphere = new THREE.Sphere();
                geometry.computeBoundingSphere();
                _sphere.copy(geometry.boundingSphere);

                coordinates.forEach((e, i) => {
                    var instanceMat = this.getPointMatrix(i, feature).multiply(matrixWorld);
                    instance.setMatrixAt(i, instanceMat);
                    _sphere.union(geometry.boundingSphere.clone().applyMatrix4(instanceMat));
                    this.remove(this.indexPoint[i]);
                });

                geometry.boundingSphere.copy(_sphere);
                this.add(instance);
                this.instanceMeshes.push({instance,matrixWorld});
            }
        });
    }

    updateRotationScale(index, mat, geocoord) {
        var pos = this.application.mapView.projection.projectPoint(geocoord, new THREE.Vector3)
            .sub(this.application.mapView.projection.projectPoint(
                this.anchor, new THREE.Vector3));
        this.instanceMeshes.forEach(({instance:m,matrixWorld}) => {
            mat.setPosition(pos.x, pos.y, pos.z);
            m.setMatrixAt(index, mat.clone().multiply(matrixWorld));
            m.instanceMatrix.needsUpdate = true;
        });

        if (this.indexPoint[index]) {
            this.makeDefaultPoints(this.feature, this.feature.geometry.coordinates[index], this.indexPoint[index])
        }
    }

    updateScene(gltf, feature, position) {
        var mat = new THREE.Matrix4;
        mat.elements = position.slice(3);
        const { geometry: { coordinates }, topology } = feature;
        gltf.matElement = position;
        modelCache.set(topology.model, gltf);
        this.makeInstanceMesh(gltf, coordinates, feature, mat);
    }
}

export { TopoMultiPoints };