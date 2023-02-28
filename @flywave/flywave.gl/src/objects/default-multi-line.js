import * as THREE from "three";
import {
    GeoCoordinates,
} from "@flywave/flywave-geoutils";
import { Line2 } from "../objects/line2";
import { LineMaterial } from "../objects/line/LineMaterial";
import { LineGeometry } from "../objects/line/LineGeometry";
import * as turf from "@turf/turf";

class DefaultMultiLine extends THREE.Object3D {
    constructor(path, userData, application) {
        super();
        this.userData = userData;
        this.application = application;
        this.material = new LineMaterial({
            color: 0x00ff00,
            linewidth: 2,
            vertexColors: false,
            worldUnits: false,
            alphaToCoverage: true,
            depthTest: false,
            transparent: true,
            opacity: 0.5
        });

        this.linesObject = new THREE.Object3D();
        this.updateGeometry(path);
        const { width, height } = application.mapView.getCanvasClientSize();
        this.material.resolution.set(width, height);
        this.add(this.linesObject);
    }

    updateGeometry(multiLinePoints, anchor) {
        this.linesObject.clear();
        this.linesObject.traverse(e => {
            if (e.geometry) {
                e.geometry.dispose();
            }
        });

        const { mapView: { projection } } = this.application;
        var feature = turf.multiLineString(multiLinePoints, {});
        const { geometry: { coordinates } } = turf.centroid(feature);
 
        if (anchor) {
            this.anchor = anchor;
        } else {
            if (!this.anchor) {
                this.anchor = new GeoCoordinates(coordinates[1], coordinates[0], coordinates[2]);
            }
        } 
        var position = projection.projectPoint(this.anchor);

        multiLinePoints.forEach((linePoints, i) => {
            var linePos = [];
            linePoints.forEach((c) => linePos = linePos.concat(projection.projectPoint(new GeoCoordinates(c[1], c[0], c[2]), new THREE.Vector3).sub(position).toArray()));
            var geo = new LineGeometry();
            geo.setPositions(linePos);

            var line = new Line2();
            line.geometry = geo;
            line.userData = {
                feature: {
                    ...this.userData,
                    geometryType: "topo",
                    index: i
                }
            };
            line.material = this.material;
            line.renderOrder = Number.MAX_SAFE_INTEGER;

            this.linesObject.add(line);
        }); 
    }

}

export default DefaultMultiLine;