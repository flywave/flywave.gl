import DefaultPolygon from "../objects/default-polygon";

class TopoDefaultPolygon {
    constructor(application) {
        this.application = application;
    }

    makeTopo(feature) {
        return new DefaultPolygon(feature, this.application);
    }

    updateTopoGeometry(line, feature) {
        const { geometry: { coordinates }, id } = feature;
        line.updateGeometry(coordinates);
        return line;
    }

    match(feature) {
        const { geometry: { type }, topology } = feature;
        if (type == "Polygon") {
            if (!topology || !topology.type) {
                return true;
            }
        }
        return false;
    }
}

export default TopoDefaultPolygon;