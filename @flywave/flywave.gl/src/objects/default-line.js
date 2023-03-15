import * as THREE from "three";
import {
    GeoCoordinates,
} from "@flywave/flywave-geoutils";
import { Line2 } from "../objects/line2";
import { LineMaterial } from "../objects/line/LineMaterial";
import { LineGeometry } from "../objects/line/LineGeometry";
import * as turf from "@turf/turf";

class DefaultLine extends THREE.Object3D {

    static LineMaterial = LineMaterial;
    static LineGeometry = LineGeometry;

    constructor(path, userData, application) {
        super();

        this.userData = userData;
        this.application = application;
        this.mesh = new Line2();
        this.mesh.material = new LineMaterial({
            color: 0xFFFFE0,
            linewidth: 2,
            vertexColors: false,
            worldUnits: false,   
            alphaToCoverage: true
        });

        this.updateGeometry(path);
        this.mesh.userData = {
            ...userData
        };

        const { width, height } = application.mapView.getCanvasClientSize();
        this.mesh.material.resolution.set(width, height);
 
        this.add(this.mesh);
    }

    updateGeometry(linePoints) {
        const { mapView: { projection } } = this.application;
        var feature = turf.lineString(linePoints, {});
        const { geometry: { coordinates } } = turf.centroid(feature);

        var position = projection.projectPoint(new GeoCoordinates(coordinates[1], coordinates[0], coordinates[2]));
        var linePos = [];
        linePoints.forEach((c) => linePos = linePos.concat(projection.projectPoint(new GeoCoordinates(c[1], c[0], c[2]), new THREE.Vector3).sub(position).toArray()));

        this.anchor = new GeoCoordinates(coordinates[1], coordinates[0], coordinates[2] || 0);

        var geo = new LineGeometry();
        geo.setPositions(linePos);
        this.mesh.geometry.dispose();
        this.mesh.geometry = geo; 
    }

}

export default DefaultLine;