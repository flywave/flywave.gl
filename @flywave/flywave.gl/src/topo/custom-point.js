import { CustomTopoDefault } from "../objects/custom-topo-default";

class TopoCustomTopoDefault {
    constructor(application) {
        this.application = application;
    }

    makeTopo(feature) {
        var remote = new CustomTopoDefault(this.application, feature);
        return [remote, remote.flush(feature)];
    }

    match(feature) {
        const { topology } = feature;
        if (!topology) return false;
        const { topology: { type } } = feature;
        return ["custom"].indexOf(type) != -1
    }
}

export default TopoCustomTopoDefault;