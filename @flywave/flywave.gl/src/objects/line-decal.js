import { DecalMesh } from "./meshes/decal-mesh";
import * as THREE from "three";
import { BufferGeometry, Vector3 } from "three";
import {
    GeoCoordinates,
} from "@flywave/flywave-geoutils";
import lineStringChunk from "../util/line-chunk";
import * as turf from "@turf/turf";
import { Line2 } from "../objects/line2";
import { LineGeometry } from "../objects/line/LineGeometry";
import { mergeBufferGeometries } from "./geometries/BufferGeometryUtils";
import { LineMaterial } from "../objects/line/LineMaterial";

class TopoLineDecalMesh extends THREE.Object3D {
    constructor(application, feature) {
        super();
        this.application = application;

        this.feature = feature;
        this.drawFeature(feature);
        this.initLine();

        this.lineMesh = new THREE.Mesh(new THREE.BufferGeometry());

        this.lineMesh.userData = {
            feature: {
                geometryType: "topo",
                id: feature.id
            }
        }

        this.add(this.lineMesh)
    }

    drawFeature = (feature) => {
        this.feature = feature;
        this.symboPaths = [];
        this.texture = null;
        this.density = null;
        this.initPosition();
        this.initSymbolTransformDensity();
        this.initSymbolPathWithLineFeature();
        this.drawDecals();
        this.updateLineGeometry();
    }

    drawLineString = (feature) => {
        this.feature = feature;
        this.initPosition();
        this.updateLineGeometry();
    }

    initPosition() {
        var { geometry: { coordinates } } = turf.center(this.feature);
        this.anchor = GeoCoordinates.fromGeoPoint(coordinates);
        this.lineMesh = this.anchor;
    }

    initSymbolTransformDensity() {
        const { topology } = this.feature;
        if (topology) {
            const { density, transform, size } = topology;
            this.density = density;
            if (!this.density && size) {
                this.density = size[0];
            }

            this.texture = topology.texture;
        }
    }

    initSymbolPathWithLineFeature() {
        if (this.density) {
            const { mapView: { projection } } = this.application;
            var { segments: { geometry: { coordinates } }, segmentIndex } = lineStringChunk(this.feature, projection, this.density, true);
            this.symboPaths = coordinates;
            this.segmentIndex = segmentIndex;
        }
    }

    decals = [];

    initPathDecals = (position) => {
        const { geometry: { coordinates: featureCoordinate } } = this.feature;
        const { mapView: { projection } } = this.application;
        var position = projection.projectPoint(this.anchor);
        if (this.symboPaths) {
            this.disposeAllDecal();
            var coordinates = this.symboPaths;
            coordinates.forEach((coordinate, j) => {
                var xyz = projection.projectPoint(new GeoCoordinates(coordinate[1], coordinate[0], coordinate[2]), new Vector3);
                var pos = xyz.clone().sub(position);
                var endV;
                if (featureCoordinate.length - 1 == this.segmentIndex[j]) {
                    var sj = this.segmentIndex[j] - 1;
                    endV = projection.projectPoint(GeoCoordinates.fromGeoPoint(featureCoordinate[sj]), new Vector3);
                } else {
                    var startF = featureCoordinate[this.segmentIndex[j] + 1];
                    endV = projection.projectPoint(GeoCoordinates.fromGeoPoint(startF), new Vector3);
                }
                var direction = new Vector3();
                if (this.segmentIndex[j] == 0) {
                    var st = featureCoordinate[this.segmentIndex[j]];
                    direction.subVectors(endV, projection.projectPoint(GeoCoordinates.fromGeoPoint(st), new Vector3));
                } else {
                    if (featureCoordinate.length - 1 == this.segmentIndex[j]) {
                        var st = featureCoordinate[this.segmentIndex[j]];
                        direction.subVectors(projection.projectPoint(GeoCoordinates.fromGeoPoint(st), new Vector3), endV);
                    } else {
                        var st = featureCoordinate[this.segmentIndex[j]];
                        direction.subVectors(endV, projection.projectPoint(GeoCoordinates.fromGeoPoint(st), new Vector3));
                    }
                }

                const { transform: { translate, rotation } } = this.feature.topology;

                // var upMat = new THREE.Matrix4();
                // if (rotation) {
                //     upMat.makeRotationFromQuaternion();
                // }
                // var z = new THREE.Vector3(0, 0, 1);
                // var z1 = z.applyMatrix4(upMat);
                // z1.normalize()

                // var right = new THREE.Vector3(1, 0, 0);
                // right.applyMatrix4(upMat);

                // var matDirect = new THREE.Quaternion();
                // matDirect.setFromAxisAngle(z1,Math.acos(right.dot(direction.normalize())));

                var matDirect = new THREE.Matrix4();
                var xAxis = direction.normalize();
                var zAxis = new THREE.Vector3(0, 0, 1).applyQuaternion(new THREE.Quaternion().fromArray(rotation)).normalize()
                var yAxis = zAxis.cross(xAxis).normalize();
                matDirect.makeBasis(xAxis, yAxis, xAxis.clone().cross(yAxis).normalize());

                var decal = new DecalMesh(this.feature.id, new THREE.Quaternion().setFromRotationMatrix(matDirect));
                this.application.mapView.projection.projectPoint(new GeoCoordinates(coordinate[1], coordinate[0], coordinate[2]), decal.position);
                decal.position.sub(position);
                this.decals.push(decal);
                decal.buildTopoData(this.feature.topology);
                decal.updateMatrixWorld();
            });

        }
    }

    drawDecals = async () => {
        if (!this.texture) {
            return;
        }

        if (!this.density) {
            return;
        }

        const { topology } = this.feature;
        var readys = [];
        for (var { ref } of (topology.targets || [])) {
            var object = await this.application.topoSource.getTopoMesh(ref, true);
            if (object.getReady)
                readys.push(object.getReady());
        }

        return Promise.all(readys).then((meshes) => {
            var position = new THREE.Vector3();
            this.application.mapView.projection.projectPoint(this.anchor, position);
            this.initPathDecals(position);
            this.position.set(0, 0, 0);
            this.updateMatrixWorld();
            this.decals.forEach(decal => {
                meshes.forEach((mesh) => {
                    var oldPos = mesh.position.clone();
                    this.application.mapView.projection.projectPoint(mesh.anchor, mesh.position);
                    mesh.position.sub(position);
                    decal.draw(mesh);
                    mesh.position.copy(oldPos);
                });
                decal.updateMatrixWorld();
                this.line.visible = false;
            });

            var allgeom = this.decals.map(decal => {
                this.lineMesh.material = decal.decalMaterial;
                if (decal.descalMeshes.length) {
                    var geos = [decal.descalMeshes[0]].map(({ geometry, matrixWorld }) => { geometry.applyMatrix4(matrixWorld); return geometry });
                    return mergeBufferGeometries(geos);
                }
                return null;
            }).filter(e => e)

            if (allgeom.length) {
                this.lineMesh.geometry =
                    mergeBufferGeometries(allgeom);
            }
        });
    }

    disposeAllDecal = () => {
        this.decals.forEach(e => {
            e.disposeAll();
            e.removeFromParent();
        });
        this.decals = [];
    }

    initLine() {
        this.line = new Line2();
        this.line.material = new LineMaterial({
            color: 0xFFFFE0,
            linewidth: 4,
            vertexColors: false,
            transparent: true,
            worldUnits: false,
            opacity: 0.7,
            depthTest: false,
            alphaToCoverage: true
        });

        this.updateLineGeometry();
        this.line.userData = {
            ... this.userData
        };

        const { width, height } = application.mapView.getCanvasClientSize();
        this.line.material.resolution.set(width, height);
        this.add(this.line);
    }

    updateLineGeometry() {
        if (!this.line) return;
        const { mapView: { projection } } = this.application;
        const { geometry: { coordinates } } = this.feature;
        var position = projection.projectPoint(this.anchor);
        var linePos = [];
        coordinates.forEach((c) => linePos = linePos.concat(projection.projectPoint(new GeoCoordinates(c[1], c[0], c[2]), new THREE.Vector3).sub(position).toArray()));

        var geo = new LineGeometry();
        geo.setPositions(linePos);
        this.line.geometry.dispose();
        this.line.geometry = geo;
    }

}

export default TopoLineDecalMesh;