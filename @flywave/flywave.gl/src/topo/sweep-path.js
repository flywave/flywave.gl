import SweepPath from "../objects/sweep-path";

class TopoSweepPath {
    constructor(application) {
        this.application = application;
    }

    makeTopo(feature) {
        var mesh = new SweepPath(feature, {
            geometryType: "topo",
            id: feature.id
        }, application);

        return [mesh, mesh.flush(feature)];
    }

    updateTopoGeometry(line, feature) {
        const { geometry: { coordinates }, id } = feature;
        line.updateGeometry(coordinates);
        return line;
    }

    match(feature) {
        const { topology } = feature;
        if (!topology) return false;
        const { topology: { type }, geometry: { type: geoType } } = feature;
        return ["sweep-layers"].indexOf(type) != -1 && geoType == "MultiLineString";
    }
}

export default TopoSweepPath;