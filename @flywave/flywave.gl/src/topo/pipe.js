import Pipe from "../objects/pipe";
import { makeTopoMaterial, makeTopoSection, makeGeoCoordinatesToPath } from "./utils";
import { GeoCoordinates } from "@flywave/flywave-geoutils";

class TopoPipe {
    constructor(application) {
        this.application = application;
    }

    makeTopo(feature) {
        const { geometry: { coordinates }, id, topology: { materials, profile } } = feature;

        var origin = new GeoCoordinates(coordinates[0][1], coordinates[0][0], coordinates[0][2] || 0);
        var path = makeGeoCoordinatesToPath(this.application.mapView.projection, coordinates, origin);
        var section = makeTopoSection(profile);

        var mesh = new Pipe(path, section, (materials || []).map(material => makeTopoMaterial(material))[0], {
            feature: {
                geometryType: "topo",
                id
            }
        });
        mesh.anchor = origin;
        return mesh;
    }

    updateTopoGeometry(pipe, feature) {
        const { geometry: { coordinates }, id, topology: { profile } } = feature;

        var origin = new GeoCoordinates(coordinates[0][1], coordinates[0][0], coordinates[0][2] || 0);
        var path = makeGeoCoordinatesToPath(this.application.mapView.projection, coordinates, origin);
        var section = makeTopoSection(profile);

        pipe.updateGeometry(path, section);

        pipe.anchor = origin;
        return pipe;
    }

    updateTopoMaterial(pipe, feature) {
        const { topology: { materials } } = feature;
        pipe.material = materials.map(material => makeTopoMaterial(material))[0];
        return pipe;
    }

    match(feature) {
        const { geometry: { type }, topology } = feature;
        return topology && type == "LineString" && topology.type == "pipe";
    }
}

export default TopoPipe;