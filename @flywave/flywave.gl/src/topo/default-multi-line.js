import DefaultMultiLine from "../objects/default-multi-line";

class TopoDefaultMultiLine {
    constructor(application) {
        this.application = application;
    }

    makeTopo(feature) {
        const { geometry: { coordinates }, id } = feature;

        var mesh = new DefaultMultiLine(coordinates, {
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
        if (type == "MultiLineString") {
            if (!topology || !topology.type) {
                return true;
            }
        }
        return false;
    }
}

export default TopoDefaultMultiLine;