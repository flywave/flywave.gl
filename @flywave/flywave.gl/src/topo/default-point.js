import { DefaultPoint } from "../objects/default-point";

class TopoDefaultPoint {
    constructor(application) {
        this.application = application;
    }

    makeTopo(feature) {
        return new DefaultPoint(this.application, feature);
    }

    match(feature) {
        const { geometry: { type } } = feature;
        return type == "Point";
    }
}

export default TopoDefaultPoint;