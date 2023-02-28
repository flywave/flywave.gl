import { GeoCoordinates } from "@flywave/flywave-geoutils";
import SurfacePolygon from "../objects/surface-polygon";

class TopoSurfacePolygon {

    constructor(application) {
        this.application = application;
    }

    makePathSection(feature) {
        const { geometry: { coordinates } } = feature;
        var [out_coordinates] = coordinates;
        var section = out_coordinates.map(coord => {
            return GeoCoordinates.fromGeoPoint(coord);
        });
        return { 
            section
        }
    }

    makeTopo(feature) {
        const { section } = this.makePathSection(feature);
        var mesh = new SurfacePolygon(section, {
            feature: {
                geometryType: "topo",
                id: feature.id
            }
        },this.application); 
        return mesh;
    }

    updateTopoGeometry(hole, feature) {
        const { topology: { depth } } = feature;
        const { section } = this.makePathSection(feature);
 
        hole.setPath(section,depth);  
        return hole;
    }

    match(feature) {
        const { geometry: { type }, topology } = feature;
        return topology && type == "Polygon" && topology.type == "surface-polygon";
    }
}

export default TopoSurfacePolygon;