import CrossPoint from "../objects/cross-point";

class TopoCrossPoint {
    constructor(application) {
        this.application = application;
    }

    makeTopo(feature) {

        var remote = new CrossPoint(this.application);
        
        var prMode = this.application.topoSource.getTopoMesh(feature.id);
        if (prMode) {
            remote.anchors = prMode.anchors
        }
        return [remote, remote.flush(feature)];
    }

    match(feature) {
        const { topology } = feature;
        if (!topology) return false;
        const { topology: { type, model } } = feature;
        return ["cross-point"].indexOf(type) != -1 && model
    }
}

export default TopoCrossPoint;