import DefaultLine from "../objects/default-line";

class TopoDefaultLine {
    constructor(application) {
        this.application = application;
    }

    makeTopo(feature) {
        const { geometry: { coordinates }, id } = feature;

        var mesh = new DefaultLine(coordinates, {
            feature: {
                geometryType: "topo",
                id
            }
        }, this.application);
        return mesh;
    }

    updateTopoGeometry(line, feature) {
        const { geometry: { coordinates }, id } = feature;
        line.updateGeometry(coordinates);
        return line;
    }

    match(feature) {
        const { geometry: { type }, topology } = feature;
        if (type == "LineString") {
            if (!topology || !topology.type) {
                return true;
            }
        }
        return false;
    }
}

export default TopoDefaultLine;