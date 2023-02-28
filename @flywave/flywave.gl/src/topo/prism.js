
import { GeoCoordinates } from "@flywave/flywave-geoutils";
import Prism from "../objects/prism";
import { makeTopoMaterial } from "./utils";
import * as turf from "@turf/turf";
import { Vector3, Vector2 } from "three";

class TopoPrism {
    constructor(application) {
        this.application = application;
    }

    makeTopo(feature) {
        const { geometry: { coordinates }, topology: { materials, direction }, id } = feature;
        var [out_coordinates] = coordinates;
        const { geometry: { coordinates: origin } } = turf.center(feature);
        var webMer = this.application.mapView.projection.projectPoint(GeoCoordinates.fromGeoPoint(origin));
        var section = out_coordinates.map(coord => {
            return new Vector2().subVectors(this.application.mapView.projection.projectPoint(GeoCoordinates.fromGeoPoint(coord)), webMer);
        });

        var mesh = new Prism([new Vector3(), new Vector3().fromArray(direction || [0, 0, 1])], section,
            (materials || []).map(material => makeTopoMaterial(material))[0], {
            feature: {
                geometryType: "topo",
                id
            }
        });
        mesh.anchor = GeoCoordinates.fromGeoPoint(origin);

        mesh.rotateZ(Math.PI / 2);
        return mesh;
    }

    updateTopoGeometry(prism, feature) {
        const { geometry: { coordinates }, topology: { direction } } = feature;
        const { geometry: { coordinates: origin } } = turf.center(feature);
        var [out_coordinates] = coordinates;

        var webMer = this.application.mapView.projection.projectPoint(GeoCoordinates.fromGeoPoint(origin));
        var section = out_coordinates.map(coord => {
            return new Vector2().subVectors(this.application.mapView.projection.projectPoint(GeoCoordinates.fromGeoPoint(coord)), webMer);
        });

        prism.updateGeometry([new Vector3(), new Vector3().fromArray(direction || [0, 0, 1])], section);

        prism.anchor = GeoCoordinates.fromGeoPoint(origin);
        return prism;
    }

    updateTopoMaterial(prism, feature) {
        const { topology: { materials } } = feature;
        prism.material = materials.map(material => makeTopoMaterial(material))[0];
        return prism;
    }

    match(feature) {
        const { geometry: { type }, topology } = feature;
        return topology && type == "Polygon" && topology.type == "prism";
    }
}

export default TopoPrism;