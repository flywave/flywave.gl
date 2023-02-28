import TopoBoardMesh from "../objects/topo-board";

class TopoBoard {
    constructor(application) {
        this.application = application;
    }

    makeTopo(feature) {
        var decal = new TopoBoardMesh(this.application, feature.id);
        return decal;
    }

    match(feature) {
        const { topology } = feature;
        if (!topology) return false;
        const { topology: { type } } = feature;
        return ["board"].indexOf(type) != -1
    }
}

export default TopoBoard;