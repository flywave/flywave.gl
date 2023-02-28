import Catenary from "../objects/catenary";

class TopoCatenary {
    constructor(application) {
        this.application = application;
    }

    makeTopo(feature) {
        const {
            geometry: { coordinates },
            topology,
            id,
        } = feature;

        var mesh = new Catenary(
            coordinates[0],
            coordinates[coordinates.length - 1],
            {
                feature: {
                    geometryType: "topo",
                    topology,
                    id
                }
            },
            this.application
        );
        return mesh;
    }

    updateTopoGeometry(line, feature) {
        const {
            geometry: { coordinates },
            id,
        } = feature;
        line.updateGeometry(coordinates);
        return line;
    }

    match(feature) {
        const {
            geometry: { type },
            topology,
        } = feature;
        if (type == "LineString" && topology && topology.type == "catenary") {
            return true;
        }
        return false;
    }
}

export default TopoCatenary;
