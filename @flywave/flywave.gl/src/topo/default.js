import RemoteTopo from "../objects/remote-topo";

class TopoDefault {
    constructor(application) {
        this.application = application;
    }

    makeTopo(feature) {
        var remote = new RemoteTopo(this.application);

        return [remote, remote.flush(feature)];
    }

    match(feature) {
        const { topology } = feature;
        if (!topology) return false;
        const { topology: { type } } = feature;
        return ["pipe", "shape", "revol", "cross-point", 
            "material-surface", "symbol-surface", "texture-surface", "leveled-surface",
            "symbol", "mask", "light", "custom", "feature", "catenary"].indexOf(type) != -1
    }
}

export default TopoDefault;