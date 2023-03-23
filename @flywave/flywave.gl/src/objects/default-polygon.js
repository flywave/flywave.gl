import * as THREE from "three";
import {
    GeoCoordinates,
} from "@flywave/flywave-geoutils";
import * as turf from "@turf/turf";
import { makeTopoMaterial } from "../topo/utils";
import { BufferGeometry, Vector3 } from "three";

class DefaultPolygon extends THREE.Object3D {
    constructor(feature, application) {
        super();
        this.application = application;
        this.updateFeature(feature);
    }

    updateFeature(feature) {
        this.userData = { feature };
        this.feature = feature;
        this.updateMesh();
        this.updateGeometry();
    }

    updateMesh() {
        if (!this.polygon) {
            const { topology } = this.feature;
            var mtlCfg = {};
            if (topology) {
                const { materials } = topology;
                mtlCfg = materials;
            }
            this.polygon = new THREE.Mesh(new BufferGeometry(), makeTopoMaterial(mtlCfg || []));

            this.polygon.material.setValues({
                polygonOffset: true,
                polygonOffsetFactor: - 4,
                transparent: true,
                opacity: 0.5
            });
            this.polygon.userData = {
                feature: {
                    geometryType: "topo",
                    id: this.feature.id
                }
            };

            this.add(this.polygon);

            this.polygon.addEventListener("onR")
        }
    }

    updateGeometry() {
        if (this.polygon) {
            this.polygon.geometry.dispose();
        }

        const { mapView: { projection } } = this.application;
        const { geometry: { coordinates } } = turf.centroid(this.feature);
        this.anchor = new GeoCoordinates(coordinates[1], coordinates[0], 0);

        var position = projection.projectPoint(this.anchor, new THREE.Vector3);
        var { geometry: { coordinates: [outLine] } } = this.feature;

        var vertexs = outLine.map(coord => {
            return projection.projectPoint(new GeoCoordinates(coord[1], coord[0], coord[2] || 0), new THREE.Vector3).sub(position)
        });

        var indice = THREE.ShapeUtils.triangulateShape(vertexs, []),
            uindec = new Uint16Array(indice.length * 3);
        for (var i = 0, j = 0; i < indice.length; i++, j += 3) {
            uindec[j] = indice[i][0];
            uindec[j + 1] = indice[i][1];
            uindec[j + 2] = indice[i][2];
        }

        var mat = new THREE.Object3D();
        mat.lookAt(position);
        mat.updateMatrixWorld();
        var invert = mat.matrixWorld.invert();

        var buffer = [];
        var box = new THREE.Box3();
        for (var i = 0; i < vertexs.length; i++) {
            var vertex = vertexs[i];
            vertex.applyMatrix4(invert)
            buffer.push(vertex.x, vertex.y, vertex.z);
            box.expandByPoint(vertex);
        }
        buffer.push(vertexs[0].x, vertexs[0].y, vertexs[0].z);

        var uv = [];
        var size = box.getSize(new Vector3());
        for (var i = 0; i < vertexs.length; i++) {
            var coord = new THREE.Vector3().copy(vertexs[i]).applyMatrix4(invert).sub(box.min);
            uv.push(coord.x / size.x, coord.y / size.y);
        }
        uv.push(uv[0], uv[1]);

        var geometry = new THREE.BufferGeometry();

        var attrPosition = new THREE.BufferAttribute(new Float32Array(buffer), 3),
            uvAttr = new THREE.BufferAttribute(new Float32Array(uv), 2),
            attrIndex = new THREE.BufferAttribute(uindec, 1);


        geometry.setIndex(attrIndex);
        geometry.setAttribute('position', attrPosition);
        geometry.setAttribute('uv', uvAttr);

        this.lookAt(position);
        this.polygon.geometry = geometry;
    }

}

export default DefaultPolygon;