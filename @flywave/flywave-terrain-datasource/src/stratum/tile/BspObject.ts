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
        if (!this.bsp) this.buildBsp();
        if (!this.bsp?.polygons.length) return undefined;

        const status = this.intersection(node);

        switch (status) {
            case "inside":
                return undefined;
            case "outside":
                return this.geometry;
            case "intersect":
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
        // 1. 收集所有可能的分离轴
        const axes = this.getSeparatingAxes(a, b);

        // 2. 执行分离轴定理检测
        for (const axis of axes) {
            if (this.isSeparatingAxis(a, b, axis)) {
                return false;
            }
        }

        // 3. 处理共面多边形的情况
        return this.checkCoplanarIntersection(a, b);
    }

    // 新增辅助方法：获取所有可能的分离轴
    private getSeparatingAxes(a: Polygon, b: Polygon): THREE.Vector3[] {
        const axes: THREE.Vector3[] = [];

        // 添加多边形平面法线
        axes.push(new THREE.Vector3(a.plane.normal.x, a.plane.normal.y, a.plane.normal.z));
        axes.push(new THREE.Vector3(b.plane.normal.x, b.plane.normal.y, b.plane.normal.z));

        // 添加边向量叉积轴
        for (const edgeA of this.getEdges(a)) {
            for (const edgeB of this.getEdges(b)) {
                const cross = new THREE.Vector3().crossVectors(edgeA, edgeB);
                if (cross.lengthSq() > 1e-6) {
                    axes.push(cross.normalize());
                }
            }
        }

        return axes;
    }

    // 新增辅助方法：获取多边形边向量
    private getEdges(poly: Polygon): THREE.Vector3[] {
        const edges: THREE.Vector3[] = [];
        for (let i = 0; i < poly.vectors.length; i++) {
            const current = poly.vectors[i];
            const next = poly.vectors[(i + 1) % poly.vectors.length];
            edges.push(
                new THREE.Vector3(next.x - current.x, next.y - current.y, next.z - current.z)
            );
        }
        return edges;
    }

    // 新增辅助方法：分离轴检测
    private isSeparatingAxis(a: Polygon, b: Polygon, axis: THREE.Vector3): boolean {
        const projA = this.projectPolygon(a, axis);
        const projB = this.projectPolygon(b, axis);
        return projA.max < projB.min || projB.max < projA.min;
    }

    // 新增辅助方法：共面多边形相交检测
    private checkCoplanarIntersection(a: Polygon, b: Polygon): boolean {
        // 1. 检查是否共面
        const planeA = new THREE.Plane().setFromNormalAndCoplanarPoint(
            new THREE.Vector3(a.plane.normal.x, a.plane.normal.y, a.plane.normal.z),
            new THREE.Vector3(a.vectors[0].x, a.vectors[0].y, a.vectors[0].z)
        );

        const planeB = new THREE.Plane().setFromNormalAndCoplanarPoint(
            new THREE.Vector3(b.plane.normal.x, b.plane.normal.y, b.plane.normal.z),
            new THREE.Vector3(b.vectors[0].x, b.vectors[0].y, b.vectors[0].z)
        );

        if (!planeA.equals(planeB)) return true;

        // 2. 投影到2D平面进行检测
        const basis = this.createProjectionBasis(planeA.normal);
        const polyA2D = a.vectors.map(v => this.projectTo2D(v, basis));
        const polyB2D = b.vectors.map(v => this.projectTo2D(v, basis));

        // 3. 使用分离轴定理进行2D检测
        const edges = [...this.getPolygonEdges2D(polyA2D), ...this.getPolygonEdges2D(polyB2D)];

        for (const edge of edges) {
            const axis = new THREE.Vector2(-edge.y, edge.x).normalize();
            const projA = this.project2D(polyA2D, axis);
            const projB = this.project2D(polyB2D, axis);

            if (projA.max < projB.min || projB.max < projA.min) {
                return false;
            }
        }

        return true;
    }

    // 新增辅助方法：创建投影坐标系
    private createProjectionBasis(normal: THREE.Vector3): {
        origin: THREE.Vector3;
        u: THREE.Vector3;
        v: THREE.Vector3;
    } {
        const origin = new THREE.Vector3();
        const u = new THREE.Vector3();
        const v = new THREE.Vector3();

        if (Math.abs(normal.x) > Math.abs(normal.y)) {
            u.set(normal.z, 0, -normal.x).normalize();
        } else {
            u.set(0, -normal.z, normal.y).normalize();
        }
        v.crossVectors(normal, u);

        return { origin, u, v };
    }

    // 新增辅助方法：3D到2D投影
    private projectTo2D(
        vec: { x: number; y: number; z: number },
        basis: { u: THREE.Vector3; v: THREE.Vector3 }
    ): THREE.Vector2 {
        const v = new THREE.Vector3(vec.x, vec.y, vec.z);
        return new THREE.Vector2(v.dot(basis.u), v.dot(basis.v));
    }

    // 新增辅助方法：获取2D多边形边向量
    private getPolygonEdges2D(poly: THREE.Vector2[]): THREE.Vector2[] {
        return poly.map((p, i) => {
            const next = poly[(i + 1) % poly.length];
            return new THREE.Vector2(next.x - p.x, next.y - p.y);
        });
    }

    // 新增辅助方法：2D投影
    private project2D(points: THREE.Vector2[], axis: THREE.Vector2): { min: number; max: number } {
        let min = Infinity;
        let max = -Infinity;

        for (const p of points) {
            const proj = p.dot(axis);
            min = Math.min(min, proj);
            max = Math.max(max, proj);
        }

        return { min, max };
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
