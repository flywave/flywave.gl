
export type GeomEdge = [Point, Point]

export class Point {
    x = 0
    y = 0

    constructor(x: number, y: number) {
        this.x = x;
        this.y = y;
    }

    dot(p1: Point): number {
        return (this.x * p1.x + this.y * p1.y);
    }

    add(p1: Point): Point {
        return new Point(this.x + p1.x, this.y + p1.y);
    }

    sub(p1: Point): Point {
        return new Point(this.x - p1.x, this.y - p1.y);
    }

    scale(s: number): Point {
        return new Point(this.x * s, this.y * s);
    }

    sqDistanceTo(p1: Point): number {
        return (this.x - p1.x) * (this.x - p1.x) + (this.y - p1.y) * (this.y - p1.y);
    }

    toStr(): string {
        return "(" + this.x.toFixed(3) + ", " + this.y.toFixed(3) + ")";
    }

    copyFrom(p: Point): void {
        this.x = p.x;
        this.y = p.y;
    }
}

export function cross(vec0: Point, vec1: Point): number {
    return (vec0.x * vec1.y - vec0.y * vec1.x)
}

export function barycentericCoordTriangle(p: Point, pt0: Point, pt1: Point, pt2: Point) {
    const vec0 = pt1.sub(pt0);
    const vec1 = pt2.sub(pt0);
    const vec2 = p.sub(pt0);

    const d00 = vec0.dot(vec0);
    const d01 = vec0.dot(vec1);
    const d11 = vec1.dot(vec1);
    const d20 = vec2.dot(vec0);
    const d21 = vec2.dot(vec1);
    const denom = d00 * d11 - d01 * d01;
    const s = (d11 * d20 - d01 * d21) / denom;
    const t = (d00 * d21 - d01 * d20) / denom;
    const u = 1.0 - s - t;

    return { s: s, t: t, u: u };
}

export function isEdgeIntersecting(edgeA: GeomEdge, edgeB: GeomEdge): boolean {
    const vecA0A1 = edgeA[1].sub(edgeA[0]);
    const vecA0B0 = edgeB[0].sub(edgeA[0]);
    const vecA0B1 = edgeB[1].sub(edgeA[0]);

    const AxB0 = cross(vecA0A1, vecA0B0);
    const AxB1 = cross(vecA0A1, vecA0B1);

    //Check if the endpoints of edgeB are on the same side of edgeA
    if ((AxB0 > 0 && AxB1 > 0) || (AxB0 < 0 && AxB1 < 0)) {
        return false
    }

    const vecB0B1 = edgeB[1].sub(edgeB[0]);
    const vecB0A0 = edgeA[0].sub(edgeB[0]);
    const vecB0A1 = edgeA[1].sub(edgeB[0]);

    const BxA0 = cross(vecB0B1, vecB0A0);
    const BxA1 = cross(vecB0B1, vecB0A1);

    //Check if the endpoints of edgeA are on the same side of edgeB
    if ((BxA0 > 0 && BxA1 > 0) || (BxA0 < 0 && BxA1 < 0)) {
        return false
    }

    //Special case of colinear edges
    if (Math.abs(AxB0) < 1e-14 && Math.abs(AxB1) < 1e-14) {
        //Separated in x
        if ((Math.max(edgeB[0].x, edgeB[1].x) < Math.min(edgeA[0].x, edgeA[1].x)) ||
            (Math.min(edgeB[0].x, edgeB[1].x) > Math.max(edgeA[0].x, edgeA[1].x))) {
            return false
        }

        //Separated in y
        if ((Math.max(edgeB[0].y, edgeB[1].y) < Math.min(edgeA[0].y, edgeA[1].y)) ||
            (Math.min(edgeB[0].y, edgeB[1].y) > Math.max(edgeA[0].y, edgeA[1].y))) {
            return false
        }
    }

    return true
}

export function isEdgeIntersectingAtEndpoint(edgeA: GeomEdge, edgeB: GeomEdge): boolean {
    const rsq_tol = 1e-13;
    if (edgeA[0].sqDistanceTo(edgeB[0]) < rsq_tol) {
        return true;
    }

    if (edgeA[0].sqDistanceTo(edgeB[1]) < rsq_tol) {
        return true;
    }

    if (edgeA[1].sqDistanceTo(edgeB[0]) < rsq_tol) {
        return true;
    }

    if (edgeA[1].sqDistanceTo(edgeB[1]) < rsq_tol) {
        return true;
    }

    return false
}

export function isQuadConvex(p0: Point, p1: Point, p2: Point, p3: Point): boolean {
    const diag0 = [p0, p2] as GeomEdge
    const diag1 = [p1, p3] as GeomEdge
    return isEdgeIntersecting(diag0, diag1)
}

// export function isSameEdge(edge0: GeomEdge, edge1: GeomEdge): boolean {
//     return ((edge0[0] == edge1[0] && edge0[1] == edge1[1]) || (edge0[1] == edge1[0] && edge0[0] == edge1[1]))
// }

export function getCircumcenter(p0: Point, p1: Point, p2: Point): Point {
    const d = 2 * (p0.x * (p1.y - p2.y) + p1.x * (p2.y - p0.y) + p2.x * (p0.y - p1.y))

    const p0_mag = p0.x * p0.x + p0.y * p0.y
    const p1_mag = p1.x * p1.x + p1.y * p1.y
    const p2_mag = p2.x * p2.x + p2.y * p2.y

    const xc = (p0_mag * (p1.y - p2.y) + p1_mag * (p2.y - p0.y) + p2_mag * (p0.y - p1.y)) / d
    const yc = (p0_mag * (p2.x - p1.x) + p1_mag * (p0.x - p2.x) + p2_mag * (p1.x - p0.x)) / d

    return new Point(xc, yc) //[pc, r]
}

export function getPointOrientation(GeomEdge: GeomEdge, p: Point): number {
    const vec_edge01 = GeomEdge[1].sub(GeomEdge[0])
    const vec_edge0_to_p = p.sub(GeomEdge[0])
    return cross(vec_edge01, vec_edge0_to_p)
}
