import { TopoMultiPoints } from "../objects/multi-points";

class TopoMultiPoint {
    constructor(application) {
        this.application = application;
    }

    makeTopo(feature) {
        var remote = new TopoMultiPoints(this.application, feature);
        return [remote, remote.flush(feature)];
    }

    match(feature) {
        const { geometry: { type } } = feature;
        return type == "MultiPoint";
    }
}

export default TopoMultiPoint;