"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.MBElevationPortalGraph = void 0;
exports.portalEdgeHash = portalEdgeHash;
const MBElevationConstants_1 = require("./MBElevationConstants");
function portalEdgeHash(ax, ay, bx, by) {
    const forward = ax < bx || (ax === bx && ay < by);
    const [x1, y1, x2, y2] = forward
        ? [ax, ay, bx, by]
        : [bx, by, ax, ay];
    const q = (v) => Math.round(v * 64);
    return `${q(x1)},${q(y1)},${q(x2)},${q(y2)}`;
}
function isOnBorder(a, b) {
    return (a <= 0 && b <= 0) || (a >= MBElevationConstants_1.ELEVATION_EXTENT && b >= MBElevationConstants_1.ELEVATION_EXTENT);
}
class MBElevationPortalGraph {
    constructor() {
        this.portals = [];
    }
    addPortal(portal) {
        this.portals.push(portal);
    }
    static evaluate(unevaluated) {
        const out = new MBElevationPortalGraph();
        if (unevaluated.length === 0)
            return out;
        let portals = [];
        for (const graph of unevaluated) {
            portals.push(...graph.portals);
        }
        if (portals.length === 0)
            return out;
        for (const portal of portals) {
            if (isOnBorder(portal.vaX, portal.vbX) || isOnBorder(portal.vaY, portal.vbY)) {
                portal.type = 'border';
            }
        }
        const evaluated = portals.filter(p => p.type !== 'unevaluated');
        const unevaluatedGroup = portals.filter(p => p.type === 'unevaluated');
        if (unevaluatedGroup.length === 0)
            return out;
        unevaluatedGroup.sort((a, b) => a.hash === b.hash
            ? (a.isTunnel === b.isTunnel ? 0 : a.isTunnel ? -1 : 1)
            : a.hash < b.hash ? 1 : -1);
        portals = evaluated.concat(unevaluatedGroup);
        let begin = evaluated.length;
        let out0 = begin;
        let end = begin;
        do {
            end++;
            if (end === portals.length || portals[begin].hash !== portals[end].hash) {
                if (end - begin === 2) {
                    if (out0 < begin) {
                        portals[out0] = portals[begin];
                        portals[begin] = null;
                    }
                    const outPortal = portals[out0];
                    const endPortal = portals[end - 1];
                    outPortal.type = outPortal.isTunnel !== endPortal.isTunnel ? 'tunnel' : 'polygon';
                    outPortal.connection = { a: outPortal.connection.a, b: endPortal.connection.a };
                    out0++;
                }
                begin = end;
            }
        } while (begin !== portals.length);
        out.portals = portals.slice(0, out0).filter(p => p != null);
        return out;
    }
}
exports.MBElevationPortalGraph = MBElevationPortalGraph;
//# sourceMappingURL=MBElevationGraph.js.map