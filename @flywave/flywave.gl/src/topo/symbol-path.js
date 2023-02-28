import { SymbolPath } from "../objects/symbol-path";

class TopoSymbolPath {
    constructor(application) {
        this.application = application;
    }

    makeTopo(feature) {
        var symbolPath = new SymbolPath(feature, this.application);
        return symbolPath;
    }

    match(feature) {
        const { topology } = feature;
        if (!topology) return false;
        const { topology: { type } } = feature;
        return ["symbol-path"].indexOf(type) != -1
    }
}

export default TopoSymbolPath;