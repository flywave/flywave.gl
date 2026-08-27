/**
 * Elevation portal graph — describes how elevated polygon edges connect
 * across polygons and tiles (tunnel portals, entrances, tile borders).
 *
 * Rewritten from mapbox-gl-js `3d-style/elevation/elevation_graph.ts` and
 * `evaluate_portal_graphs.ts` following flywave conventions: plain `{x, y}`
 * vertices, no worker-transfer registration. Cross-bucket evaluation maps
 * to a single entry point that merges per-layer unevaluated graphs.
 */

import { ELEVATION_EXTENT } from './MBElevationConstants';

export type ElevationPortalType =
    | 'unevaluated'
    | 'none'
    | 'tunnel'
    | 'polygon'
    | 'entrance'
    | 'border';

export interface ElevationPortalConnection {
    /** Connected edge indices (per contributing polygon). */
    a: number | undefined;
    b: number | undefined;
}

export interface ElevationPortalEdge {
    connection: ElevationPortalConnection;
    /** Edge endpoints in canonical extent units. */
    vaX: number;
    vaY: number;
    vbX: number;
    vbY: number;
    length: number;
    /** Order-independent hash of the two endpoint coordinates. */
    hash: string;
    isTunnel: boolean;
    type: ElevationPortalType;
}

/**
 * Order-independent hash of an edge's two endpoints. mgl uses a bigint
 * coordinate hash; a string key serves the same grouping role here.
 */
export function portalEdgeHash(ax: number, ay: number, bx: number, by: number): string {
    // Sort endpoints so a-b and b-a hash identically.
    const forward = ax < bx || (ax === bx && ay < by);
    const [x1, y1, x2, y2] = forward
        ? [ax, ay, bx, by]
        : [bx, by, ax, ay];
    // Quantize to the extent grid to make float noise irrelevant.
    const q = (v: number) => Math.round(v * 64);
    return `${q(x1)},${q(y1)},${q(x2)},${q(y2)}`;
}

function isOnBorder(a: number, b: number): boolean {
    return (a <= 0 && b <= 0) || (a >= ELEVATION_EXTENT && b >= ELEVATION_EXTENT);
}

export class MBElevationPortalGraph {
    portals: ElevationPortalEdge[] = [];

    addPortal(portal: ElevationPortalEdge): void {
        this.portals.push(portal);
    }

    /**
     * Combine unevaluated per-layer portals into the final evaluated graph.
     *
     * A portal survives as a final one when:
     *  a) it is the result of a tile-border clip (`border`),
     *  b) it touches the ground as a polygon "entrance",
     *  c) its edge is shared by two polygons (`tunnel` when tunnel flags
     *     differ across the shared edge, `polygon` otherwise).
     */
    static evaluate(unevaluated: MBElevationPortalGraph[]): MBElevationPortalGraph {
        const out = new MBElevationPortalGraph();
        if (unevaluated.length === 0) return out;

        let portals: ElevationPortalEdge[] = [];
        for (const graph of unevaluated) {
            portals.push(...graph.portals);
        }
        if (portals.length === 0) return out;

        // Tag tile-border portals.
        for (const portal of portals) {
            if (isOnBorder(portal.vaX, portal.vbX) || isOnBorder(portal.vaY, portal.vbY)) {
                portal.type = 'border';
            }
        }

        const evaluated = portals.filter(p => p.type !== 'unevaluated');
        const unevaluatedGroup = portals.filter(p => p.type === 'unevaluated');
        if (unevaluatedGroup.length === 0) return out;

        // Group shared edges: sort by hash (tunnel first within a hash so
        // the tunnel copy leads the pair), evaluated group stays in front.
        unevaluatedGroup.sort((a, b) =>
            a.hash === b.hash
                ? (a.isTunnel === b.isTunnel ? 0 : a.isTunnel ? -1 : 1)
                : a.hash < b.hash ? 1 : -1);
        portals = evaluated.concat(unevaluatedGroup);

        // Within each equal-hash run of length 2, emit one connected portal.
        let begin = evaluated.length;
        let out0 = begin;
        let end = begin;

        do {
            end++;
            if (end === portals.length || portals[begin].hash !== portals[end].hash) {
                if (end - begin === 2) {
                    // Edge shared by two polygons — create the connection.
                    if (out0 < begin) {
                        portals[out0] = portals[begin];
                        portals[begin] = (null as unknown as ElevationPortalEdge);
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
