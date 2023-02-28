import TopoLineDecalMesh from "../objects/line-decal";

class TopoDecalLine {
    constructor(application) {
        this.application = application;
    }

    makeTopo(feature) {
        return new TopoLineDecalMesh(this.application, feature);
    }

    match(feature) {
        const { topology, geometry: { type: geotype } } = feature;
        if (!topology) return false;
        const { topology: { type } } = feature;
        return ["decal"].indexOf(type) != -1 && geotype == "LineString"
    }
}

export default TopoDecalLine;