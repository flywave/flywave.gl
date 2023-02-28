import TopoDecalMesh from "../objects/topo-decal";

class TopoDecalPoint {
    constructor(application) {
        this.application = application;
    }

    makeTopo(feature) {
        return new TopoDecalMesh(this.application, feature.id);
    }

    match(feature) {
        const { topology, geometry: { type: geotype } } = feature;
        if (!topology) return false;
        const { topology: { type } } = feature;
        return ["decal"].indexOf(type) != -1 && geotype == "Point"
    }
}

export default TopoDecalPoint;