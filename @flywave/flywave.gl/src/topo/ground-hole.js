import { GeoCoordinates } from "@flywave/flywave-geoutils";
import GroundHole from "../objects/ground-hole";
import * as turf from "@turf/turf";
import { Vector3, Vector2, Quaternion } from "three";

class TopoGroundHole {

    constructor(application) {
        this.application = application;
    }

    makePathSection(feature) {
        const { projection } = this.application.mapView;
        const { geometry: { coordinates } } = feature;
        var [out_coordinates] = coordinates;
        const { geometry: { coordinates: origin } } = turf.center(feature);
        var topOriginXyz = projection.projectPoint(GeoCoordinates.fromGeoPoint(origin), new Vector3());
        var section = out_coordinates.map(coord => {
            return GeoCoordinates.fromGeoPoint(coord);
        });
        return {
            position: topOriginXyz,
            section
        }
    }

    makeTopo(feature) {
        const { section, position } = this.makePathSection(feature);
        const { topology: { depth } } = feature;
        var mesh = new GroundHole(section,depth, {
            feature: {
                geometryType: "topo",
                id: feature.id
            }
        },this.application); 
        return mesh;
    }

    updateTopoGeometry(hole, feature) {
        const { projection } = this.application.mapView;
        const { topology: { depth } } = feature;
        const { section, position } = this.makePathSection(feature);
 
        hole.setPath(section,depth);  
        return hole;
    }

    match(feature) {
        const { geometry: { type }, topology } = feature;
        return topology && type == "Polygon" && topology.type == "ground-hole";
    }
}

export default TopoGroundHole;