import Pipe from "../objects/pipe";

class TopoServerPipe {
    constructor(application) {
        this.application = application;
    }

    makeTopo(feature) {

        var remote = new Pipe(this.application);
        return [remote, remote.flush(feature)];
    }

    match(feature) {
        const { topology } = feature;
        if (!topology) return false;
        const { topology: { type, model } } = feature;
        return ["pipe"].indexOf(type) != -1 && model
    }
}

export default TopoServerPipe;