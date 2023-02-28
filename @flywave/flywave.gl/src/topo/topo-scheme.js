import TopoServerPipe from "./server-pipe";
import TopoPrism from "./prism";
import TopoCrossPoint from "./cross-point";
import TopoDefault from "./default";
import TopoDefaultLine from "./default-line";
import TopoCustomTopoDefault from "./custom-point";
import TopoDefaultPoint from "./default-point";
import TopoDefaultPolygon from "./default-polygon";
import TopoMultiPoint from "./multi-point";
import TopoCatenary from "./catenary";
import TopoBoard from "./board-point";
import TopoDecal from "./decal-point";
import TopoDecalLine from "./decal-line";
import TopoDefaultMulitiLine from "./default-multi-line";
import TopoSweepPath from "./sweep-path";
import TopoSymbolPath from "./symbol-path";
import TopoGroundHole from "./ground-hole";
import TopoSurfacePolygon from "./surface-polygon";
import TopoParticle from "./particle";

class TopoScheme {

    customSchemes = [];

    constructor(application) {
        this.application = application;

        this.pipe = new TopoServerPipe(application);
        this.custom = new TopoCustomTopoDefault(application);
        this.prism = new TopoPrism(application);
        this.groundHole = new TopoGroundHole(application);
        this.crossPoint = new TopoCrossPoint(application);
        this.default = new TopoDefault(application);
        this.defaultLine = new TopoDefaultLine(application);
        this.defaultMultiLine = new TopoDefaultMulitiLine(application);
        this.defaultPoint = new TopoDefaultPoint(application);
        this.multiPoint = new TopoMultiPoint(application);
        this.catenary = new TopoCatenary(application);
        this.board = new TopoBoard(application);
        this.decal = new TopoDecal(application);
        this.decalLine = new TopoDecalLine(application);
        this.sweepPath = new TopoSweepPath(application);
        this.symbolPath = new TopoSymbolPath(application);
        this.defaultPolygon = new TopoDefaultPolygon(application);
        this.surfacePolygon = new TopoSurfacePolygon(application);
        this.particle = new TopoParticle(application);
    }

    regCustomScheme = (scheme) => {
        this.customSchemes.push(scheme);
    }

    makeTopoScheme(feature) {
        for (var i = 0; i < this.customSchemes.length; i++) {
            if (this.customSchemes[i].match(feature)) {
                return this.customSchemes[i].makeTopo(feature);
            }
        }

        if (this.decalLine.match(feature)) {
            return this.decalLine.makeTopo(feature);
        }

        if (this.decal.match(feature)) {
            return this.decal.makeTopo(feature);
        }

        if (this.board.match(feature)) {
            return this.board.makeTopo(feature);
        }

        if(this.particle.match(feature)){
            return this.particle.makeTopo(feature);
        }

        if (this.groundHole.match(feature)) {
            return this.groundHole.makeTopo(feature);
        }

        if (this.surfacePolygon.match(feature)) {
            return this.surfacePolygon.makeTopo(feature);
        }

        if (this.custom.match(feature)) {
            return this.custom.makeTopo(feature);
        }

        if (this.crossPoint.match(feature)) {
            return this.crossPoint.makeTopo(feature);
        }

        if (this.defaultPolygon.match(feature)) {
            return this.defaultPolygon.makeTopo(feature);
        }

        if (this.prism.match(feature)) {
            return this.prism.makeTopo(feature);
        }

        if (this.multiPoint.match(feature)) {
            return this.multiPoint.makeTopo(feature);
        }

        if (this.catenary.match(feature)) {
            return this.catenary.makeTopo(feature);
        }

        if (this.default.match(feature)) {
            return this.default.makeTopo(feature);
        }

        if (this.symbolPath.match(feature)) {
            return this.symbolPath.makeTopo(feature);
        }

        if (this.sweepPath.match(feature)) {
            return this.sweepPath.makeTopo(feature);
        }

        if (this.defaultMultiLine.match(feature)) {
            return this.defaultMultiLine.makeTopo(feature);
        }

        if (this.defaultLine.match(feature)) {
            return this.defaultLine.makeTopo(feature);
        }

        if (this.defaultPoint.match(feature)) {
            return this.defaultPoint.makeTopo(feature);
        }

        return false;
    }
}

export default TopoScheme;