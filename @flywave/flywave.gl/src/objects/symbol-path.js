import * as THREE from "three";
import {
    GeoCoordinates,
} from "@flywave/flywave-geoutils";
import * as turf from '@turf/turf';
import { Line2 } from "../objects/line2";
import lineStringChunk from "../util/line-chunk";
import GLTFLoader from "../loaders/gltf-loader";
import config from "../config";
import { Object3D, Vector3 } from "three";
import { TransferManager } from "@flywave/flywave-transfer-manager";

import { LineMaterial } from "../objects/line/LineMaterial";
const HEADER_X_CSRF_TOKEN = "X-CSRF-Token";

var modelCache = new Map();

var downloadManager = TransferManager.instance();
class SymbolPath extends THREE.Object3D {
    constructor(feature, application) {
        super();

        this.userData = {
            feature: {
                geometryType: "topo",
                id: feature.id
            }
        };
        this.application = application;
        this.feature = feature;

        this.density = 2;

        this.symboRotation = new THREE.Quaternion();
        this.symboScale = new THREE.Vector3(1, 1, 1);

        this.initAnchor();
        this.initMesh();
    }

    initMesh() {
        this.initLine();
        this.initSymbolTransformDensity();
        this.initSymbolPathWithLineFeature();
        this.fetchSymbol();
    }

    initSymbolTransformDensity() {
        const { topology } = this.feature;
        if (topology) {
            const { density, transform } = topology;
            this.density = density;
            if (transform) {
                const { rotation, scale } = transform;
                if (rotation) {
                    this.symboRotation.fromArray(rotation);
                }
                if (scale) {
                    this.symboScale.fromArray(scale);
                }
            }
        }
    }

    initAnchor() {
        var { geometry: { coordinates: center } } = turf.center(this.feature);
        this.anchor = new GeoCoordinates(center[1], center[0], center[2] || 0);
    }

    initLine() {
        this.mesh = new Line2();
        this.mesh.material = new LineMaterial({
            color: 0xFFFFE0,
            linewidth: 4,
            vertexColors: false,
            transparent: true,
            worldUnits: false,
            opacity: 0.7,
            alphaToCoverage: true
        });

        this.updateLineGeometry();
        this.mesh.userData = {
            ... this.userData
        };

        const { width, height } = application.mapView.getCanvasClientSize();
        this.mesh.material.resolution.set(width, height);
        this.add(this.mesh);
    }

    updateLineGeometry() {
        const { mapView: { projection } } = this.application;
        const { geometry: { coordinates } } = this.feature;
        var position = projection.projectPoint(this.anchor);
        var linePos = [];
        coordinates.forEach((c) => linePos = linePos.concat(projection.projectPoint(new GeoCoordinates(c[1], c[0], c[2]), new THREE.Vector3).sub(position).toArray()));

        this.mesh.geometry.setPositions(linePos);
        var attr = this.mesh.geometry.attributes;
        for (var v in attr) {
            attr[v].needsUpdate = true;
        }
    }

    initSymbolPathWithLineFeature() {
        const { mapView: { projection } } = this.application;
        var { segments: { geometry: { coordinates } }, segmentIndex } = lineStringChunk(this.feature, projection, this.density);
        this.symboPath = coordinates;
        this.segmentIndex = segmentIndex;
    }

    updateAllSymbolMatrixWorld() {
        const { geometry: { coordinates: featureCoordinate } } = this.feature;
        const { mapView: { projection } } = this.application;
        var position = projection.projectPoint(this.anchor);
        var index = 0;
        this.symboPath.forEach((coordinate, j) => {

            var xyz = projection.projectPoint(new GeoCoordinates(coordinate[1], coordinate[0], coordinate[2]), new Vector3);
            var pos = xyz.clone().sub(position);
            var endV;
            if (this.symboPath.length - 1 == j) {
                var sj = j - 1;
                endV = projection.projectPoint(GeoCoordinates.fromGeoPoint(this.symboPath[sj]), new Vector3);
            } else {
                var startF = this.symboPath[j + 1];
                endV = projection.projectPoint(GeoCoordinates.fromGeoPoint(startF), new Vector3);
            }
            var direction = new Vector3();
            if (j == 0) {
                var st = this.symboPath[j];
                direction.subVectors(endV, projection.projectPoint(GeoCoordinates.fromGeoPoint(st), new Vector3));
            } else {
                if (this.symboPath.length - 1 == j) {
                    var st = this.symboPath[j];
                    direction.subVectors(projection.projectPoint(GeoCoordinates.fromGeoPoint(st), new Vector3), endV);
                } else {
                    var st = this.symboPath[j];
                    direction.subVectors(endV, projection.projectPoint(GeoCoordinates.fromGeoPoint(st), new Vector3));
                }
            }

            // var xyz = projection.projectPoint(new GeoCoordinates(coordinate[1], coordinate[0], coordinate[2]), new Vector3);
            // var pos = xyz.clone().sub(position);
            // var endV;
            // if (featureCoordinate.length - 1 == this.segmentIndex[j]) {
            //     var sj = this.segmentIndex[j] - 1;
            //     endV = projection.projectPoint(GeoCoordinates.fromGeoPoint(featureCoordinate[sj]), new Vector3);
            // } else {
            //     var startF = featureCoordinate[this.segmentIndex[j] + 1];
            //     endV = projection.projectPoint(GeoCoordinates.fromGeoPoint(startF), new Vector3);
            // }
            // var direction = new Vector3();
            // if (this.segmentIndex[j] == 0) {
            //     var st = featureCoordinate[this.segmentIndex[j]];
            //     direction.subVectors(endV, projection.projectPoint(GeoCoordinates.fromGeoPoint(st), new Vector3));
            // } else {
            //     if (featureCoordinate.length - 1 == this.segmentIndex[j]) {
            //         var st = featureCoordinate[this.segmentIndex[j]];
            //         direction.subVectors(projection.projectPoint(GeoCoordinates.fromGeoPoint(st), new Vector3), endV);
            //     } else {
            //         var st = featureCoordinate[this.segmentIndex[j]];
            //         direction.subVectors(endV, projection.projectPoint(GeoCoordinates.fromGeoPoint(st), new Vector3));
            //     }
            // }


            var cordinates = new THREE.Matrix4();
            var xaxis = direction.normalize();
            var yaxis = xyz.clone().normalize().cross(direction).multiplyScalar(-1);
            var zAxis = yaxis.clone().normalize().cross(direction);
            cordinates.makeBasis(xaxis, yaxis, zAxis);

            var mat = new THREE.Matrix4();

            mat.compose(pos, this.symboRotation, this.symboScale);
            this.updateMeshInstanceMatrix(index++, mat, cordinates);
        });
    }

    updateFeature(feature) {
        this.feature = feature;
        this.initSymbolTransformDensity();
        this.fetchSymbol();
        this.initSymbolPathWithLineFeature();
        this.updateAllSymbolMatrixWorld();
        this.updateLineGeometry();
    }


    async fetchSymbol() {
        var length = 0;
        this.symboPath.forEach(e => {
            length += e.length;
        });
        const { topology } = this.feature;
        if (topology && topology.model && topology.model != this.model) {
            const { gltf } = await this.fetchMesh(topology.model);
            if (!gltf.data) {
                gltf.data = await this.fetchMeshTopoData(topology.model);
            }
            this.makeInstanceMesh(gltf, gltf.data, length);
            this.updateAllSymbolMatrixWorld();
            this.model = topology.model;
        }
    }

    instanceMeshes = [];

    updateMeshInstanceMatrix(index, mat, mat2) {
        this.instanceMeshes.forEach(mesh => {
            mesh.setMatrixAt(index, mat.multiply(mat2.multiply(mesh.userData.matrixWorld)));
            mesh.instanceMatrix.needsUpdate = true;
        });
    }

    makeInstanceMesh(gltf, { transform }, length) {
        var tolocalMat = new THREE.Matrix4();
        if (transform) {
            tolocalMat.compose(new THREE.Vector3().fromArray(transform.translate || [0, 0, 0]),
                new THREE.Quaternion().fromArray(transform.rotation || [0, 0, 0, 1]),
                new THREE.Vector3().fromArray(transform.scale || [1, 1, 1]));
        }
        gltf.scene.traverse(object => {
            if (object instanceof THREE.Mesh) {
                object.updateMatrixWorld();
                const { geometry, matrixWorld, material } = object;
                var instance = new THREE.InstancedMesh(geometry, material, length);
                instance.userData = {
                    feature: {
                        geometryType: "topo",
                        id: this.feature.id
                    },
                    matrixWorld: tolocalMat.clone().multiply(matrixWorld)
                };
                instance.castShadow = true;
                instance.receiveShadow = false;
                this.add(instance);
                this.instanceMeshes.push(instance);
            }
        });
    }

    getX_csrf_token() {
        var x_csrf_token;

        if (typeof document !== "undefined" && typeof document.cookie !== "undefined") {
            const cookies = document.cookie.split(";");
            for (let i = 0; i < cookies.length; i++) {
                const cookie = cookies[i].trim();
                if (cookie.startsWith("FWCSRF=")) {
                    x_csrf_token = cookie.replace("FWCSRF=", "");
                    break;
                }
            }
        }
        return x_csrf_token;
    }

    async fetchMesh(modelId) {
        // if (modelCache.has(modelId) && modelCache.get(modelId)) {
        //     var cache = modelCache.get(modelId);
        //     if (cache.model) {
        //         return Promise.resolve(cache.model);
        //     }
        //     return cache.promise;
        // }
        var promise = new Promise(async (reslove, reject) => {
            modelCache.set(modelId, { promise });

            var x_csrf_token = this.getX_csrf_token();
            var ret = await downloadManager.download(config.formatVariableUrl(config.RESOUCE_MESH_URL, { 'mesh_id': modelId }), {
                method: "get",
                headers: { [HEADER_X_CSRF_TOKEN]: x_csrf_token }
            });

            var buffer = await ret.arrayBuffer();
            new GLTFLoader().parse(buffer, '', (gltf) => {
                modelCache.set(modelId, { model: { gltf } });
                reslove({ gltf }, reject);
            });
        });
        return promise;
    }

    async fetchMeshTopoData(modelId) {
        var x_csrf_token = this.getX_csrf_token();
        var fet = await downloadManager.download(config.formatVariableUrl(config.ANCHOR_INFO_URL, { 'mesh_id': modelId }), {
            method: "get",
            headers: { [HEADER_X_CSRF_TOKEN]: x_csrf_token }
        });
        return fet.json();
    }
}

export { SymbolPath };