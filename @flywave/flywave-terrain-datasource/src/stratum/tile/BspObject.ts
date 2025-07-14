import {
    allPolygons,
    BSPNode,
    build,
    clipTo,
    fromPolygons,
    invert,
    Polygon
} from "@flywave/flywave-geometry";
import * as THREE from "three";

export abstract class BspObject {
    abstract get geometry(): THREE.BufferGeometry;
    protected _bsp?: BSPNode;

    get bsp() {
        return this._bsp;
    }

    protected abstract polygonsToGeometry(polygons: readonly Polygon[]): THREE.BufferGeometry;

    clipGeometry(node: BSPNode): THREE.BufferGeometry | undefined {
        const status = this.intersection(node);

        switch (status) {
            case "inside":
                return undefined;
            case "outside":
                return this.geometry;
            case "intersect":
                if (!this.bsp) {
                    this.buildBsp();
                }
                if (!this.geometry) {
                    return undefined;
                }
                const clippedA = clipTo(invert(this.bsp), node);
                const clippedB = invert(clipTo(invert(clipTo(node, clippedA)), clippedA));
                const outs = allPolygons(invert(build(allPolygons(clippedB), clippedA)));
                return this.polygonsToGeometry(outs);
            default:
                return this.geometry;
        }
    }

    intersection(bspB: BSPNode): "inside" | "intersect" | "outside" {
        const bspA = this.bsp!;
        const bboxA = this.getBSPBoundingBox(bspA);
        const bboxB = this.getBSPBoundingBox(bspB);
        const bboxRelation = this.checkBBoxRelation(bboxA, bboxB);

        if (bboxRelation === "outside") return "outside";
        if (bboxRelation === "inside") return "inside";

        return this.recursiveBSPIntersection(bspA, bspB);
    }

    private recursiveBSPIntersection(a: BSPNode, b: BSPNode): "inside" | "intersect" | "outside" {
        if (a.polygons.length === 0 || b.polygons.length === 0) {
            return "outside";
        }

        for (const polyA of a.polygons) {
            for (const polyB of b.polygons) {
                if (this.polygonsIntersect(polyA, polyB)) {
                    return "intersect";
                }
            }
        }

        let result: "inside" | "intersect" | "outside" = "outside";

        if (a.front && b.front) {
            result = this.mergeResults(result, this.recursiveBSPIntersection(a.front, b.front));
        }
        if (a.back && b.back) {
            result = this.mergeResults(result, this.recursiveBSPIntersection(a.back, b.back));
        }

        if (result !== "intersect") {
            if (a.front && b.back) {
                result = this.mergeResults(result, this.recursiveBSPIntersection(a.front, b.back));
            }
            if (a.back && b.front) {
                result = this.mergeResults(result, this.recursiveBSPIntersection(a.back, b.front));
            }
        }

        return result;
    }

    private mergeResults(
        a: "inside" | "intersect" | "outside",
        b: "inside" | "intersect" | "outside"
    ): "inside" | "intersect" | "outside" {
        if (a === "intersect" || b === "intersect") return "intersect";
        if (a === "inside" && b === "inside") return "inside";
        if (a === "outside") return b;
        return a;
    }

    private checkBBoxRelation(a: THREE.Box3, b: THREE.Box3): "inside" | "outside" | "intersect" {
        if (
            a.max.x < b.min.x ||
            a.min.x > b.max.x ||
            a.max.y < b.min.y ||
            a.min.y > b.max.y ||
            a.max.z < b.min.z ||
            a.min.z > b.max.z
        ) {
            return "outside";
        }

        if (
            a.min.x >= b.min.x &&
            a.max.x <= b.max.x &&
            a.min.y >= b.min.y &&
            a.max.y <= b.max.y &&
            a.min.z >= b.min.z &&
            a.max.z <= b.max.z
        ) {
            return "inside";
        }

        return "intersect";
    }

    private polygonsIntersect(a: Polygon, b: Polygon): boolean {
        const normalA = new THREE.Vector3(a.plane.normal.x, a.plane.normal.y, a.plane.normal.z);
        const normalB = new THREE.Vector3(b.plane.normal.x, b.plane.normal.y, b.plane.normal.z);
        const parallel = Math.abs(normalA.dot(normalB)) > 0.99;

        if (!parallel && this.polygonsSeparated(a, b)) {
            return false;
        }

        return this.checkEdgeIntersections(a, b);
    }

    private checkEdgeIntersections(a: Polygon, b: Polygon): boolean {
        const edgesA = this.getPolygonEdges(a);
        const edgesB = this.getPolygonEdges(b);

        for (const edgeA of edgesA) {
            for (const edgeB of edgesB) {
                if (this.segmentsIntersect(edgeA, edgeB)) {
                    return true;
                }
            }
        }
        return false;
    }

    private getPolygonEdges(poly: Polygon): Array<[THREE.Vector3, THREE.Vector3]> {
        const edges: Array<[THREE.Vector3, THREE.Vector3]> = [];

        for (let i = 0; i < poly.vectors.length; i++) {
            const current = new THREE.Vector3(
                poly.vectors[i].x,
                poly.vectors[i].y,
                poly.vectors[i].z
            );
            const next = new THREE.Vector3(
                poly.vectors[(i + 1) % poly.vectors.length].x,
                poly.vectors[(i + 1) % poly.vectors.length].y,
                poly.vectors[(i + 1) % poly.vectors.length].z
            );

            if (next.clone().sub(current).length() > 1e-6) {
                edges.push([current, next]);
            }
        }

        return edges;
    }

    private polygonsSeparated(a: Polygon, b: Polygon): boolean {
        const axes = this.getSeparatingAxes(a, b);

        for (const axis of axes) {
            const projA = this.projectPolygon(a, axis);
            const projB = this.projectPolygon(b, axis);

            if (projA.max < projB.min || projB.max < projA.min) {
                return true;
            }
        }
        return false;
    }

    private getSeparatingAxes(a: Polygon, b: Polygon): THREE.Vector3[] {
        const axes: THREE.Vector3[] = [];

        for (let i = 0; i < a.vectors.length; i++) {
            const p1 = new THREE.Vector3(a.vectors[i].x, a.vectors[i].y, a.vectors[i].z);
            const p2 = new THREE.Vector3(
                a.vectors[(i + 1) % a.vectors.length].x,
                a.vectors[(i + 1) % a.vectors.length].y,
                a.vectors[(i + 1) % a.vectors.length].z
            );
            const edge = new THREE.Vector3().subVectors(p2, p1);
            const normal = this.getEdgeNormal(edge);
            axes.push(normal);
        }

        for (let i = 0; i < b.vectors.length; i++) {
            const p1 = new THREE.Vector3(b.vectors[i].x, b.vectors[i].y, b.vectors[i].z);
            const p2 = new THREE.Vector3(
                b.vectors[(i + 1) % b.vectors.length].x,
                b.vectors[(i + 1) % b.vectors.length].y,
                b.vectors[(i + 1) % b.vectors.length].z
            );
            const edge = new THREE.Vector3().subVectors(p2, p1);
            const normal = this.getEdgeNormal(edge);
            axes.push(normal);
        }

        return axes;
    }

    private getEdgeNormal(edge: THREE.Vector3): THREE.Vector3 {
        return new THREE.Vector3(-edge.y, edge.x, 0);
    }

    private projectPolygon(poly: Polygon, axis: THREE.Vector3): { min: number; max: number } {
        let min = Infinity;
        let max = -Infinity;

        for (const vec of poly.vectors) {
            const vec3 = new THREE.Vector3(vec.x, vec.y, vec.z);
            const proj = vec3.dot(axis);
            min = Math.min(min, proj);
            max = Math.max(max, proj);
        }

        return { min, max };
    }

    private segmentsIntersect(
        seg1: [THREE.Vector3, THREE.Vector3],
        seg2: [THREE.Vector3, THREE.Vector3]
    ): boolean {
        const [a, b] = seg1;
        const [c, d] = seg2;

        const ab = new THREE.Vector3().subVectors(b, a);
        const cd = new THREE.Vector3().subVectors(d, c);
        const ac = new THREE.Vector3().subVectors(c, a);

        const crossABxCD = new THREE.Vector3().crossVectors(ab, cd);

        if (Math.abs(ac.dot(crossABxCD)) > 1e-6) {
            return false;
        }

        const crossACxCD = new THREE.Vector3().crossVectors(ac, cd);
        const crossACxAB = new THREE.Vector3().crossVectors(ac, ab);

        const t = crossACxCD.dot(crossABxCD) / crossABxCD.dot(crossABxCD);
        const u = crossACxAB.dot(crossABxCD) / crossABxCD.dot(crossABxCD);

        return t >= 0 && t <= 1 && u >= 0 && u <= 1;
    }

    private getBSPBoundingBox(node: BSPNode): THREE.Box3 {
        const box = new THREE.Box3();

        const collectPolygons = (n: BSPNode) => {
            n.polygons.forEach(poly => {
                poly.vectors.forEach(v => {
                    box.expandByPoint(new THREE.Vector3(v.x, v.y, v.z));
                });
            });
            if (n.front) collectPolygons(n.front);
            if (n.back) collectPolygons(n.back);
        };

        collectPolygons(node);
        return box;
    }

    protected buildBsp(): BSPNode {
        const polygons = this.buildPolygons();
        this._bsp = fromPolygons(polygons);
        return this._bsp;
    }

    protected abstract buildPolygons(): Polygon[];
}
