import Particle from "../objects/particle";

class TopoParticle {
    constructor(application) {
        this.application = application;
    }

    makeTopo(feature) {
        return new Particle(this.application, feature);
    }

    match(feature) {
        const { topology } = feature;
        if (!topology) return false;
        const { topology: { type } } = feature;
        return ["particle"].indexOf(type) != -1
    }
}

export default TopoParticle;