import {
    allPolygons,
    BSPNode,
    build,
    clipTo,
    fromPolygons,
    invert,
    Polygon
} from "@flywave/flywave-geometry";
import { fromVectors } from "@flywave/flywave-geoutils";
import * as THREE from "three";

export type FaceType = number;

export const FaceTypes = {
    TopFace: 1 << 0,
    BaseFace: 1 << 1,
    SideFace: 1 << 2,
    BoundaryFace: 1 << 3,
    GroundFace: 1 << 4,
    BedrockFace: 1 << 5,
    CutFace: 1 << 6,
    BoundarySideFace: (1 << 2) | (1 << 3),
    TopGroundFace: (1 << 0) | (1 << 4),
    BaseBedrockFace: (1 << 5) | (1 << 1)
} as const;

export class StratumVoxel {
    private readonly _id: string;
    private readonly _index: number;
    private _bsp?: BSPNode;
    private _bbox?: THREE.Box3;
    private _geometry?: THREE.BufferGeometry;
    private _material?: THREE.Material;
    private _neighbors: [
        StratumVoxel | undefined,
        StratumVoxel | undefined,
        StratumVoxel | undefined
    ];

    constructor(
        id: string,
        index: number,
        bbox?: THREE.Box3,
        geometry?: THREE.BufferGeometry,
        material?: THREE.Material
    ) {
        this._id = id;
        this._index = index;
        this._geometry = geometry;
        this._material = material;
        this._bbox = bbox;
        this._bsp = this.buildBsp();
        this._neighbors = [undefined, undefined, undefined];
    }

    get id() {
        return this._id;
    }

    get index() {
        return this._index;
    }

    get material(): THREE.Material {
        return this._material!;
    }

    get geometry(): THREE.BufferGeometry {
        return this._geometry!;
    }

    get bsp() {
        return this._bsp;
    }

    get bbox(): THREE.Box3 {
        return this._bbox!;
    }

    get neighbors() {
        return this._neighbors;
    }

    dispose() {
        this._geometry?.dispose();
        this._material?.dispose();
        this._geometry = undefined;
        this._material = undefined;
        this._bsp = undefined;
        this._bbox = undefined;
    }

    get volume(): number {
        const polygons = this.getPolygons();
        let signedVolume = 0;

        for (const poly of polygons) {
            const [v0, v1, v2] = poly.vectors;
            const v0Vec = new THREE.Vector3(v0.x, v0.y, v0.z);
            const v1Vec = new THREE.Vector3(v1.x, v1.y, v1.z);
            const v2Vec = new THREE.Vector3(v2.x, v2.y, v2.z);

            const crossProduct = new THREE.Vector3().crossVectors(v1Vec, v2Vec);
            signedVolume += v0Vec.dot(crossProduct);
        }

        return Math.abs(signedVolume) / 6;
    }

    linkNeighbors(allVoxels: StratumVoxel[], neighbors: [number, number, number]) {
        this._neighbors = neighbors.map(idx => (idx !== -1 ? allVoxels[idx] : undefined)) as [
            StratumVoxel | undefined,
            StratumVoxel | undefined,
            StratumVoxel | undefined
        ];
    }

    clipGeometry(node: BSPNode): THREE.BufferGeometry | undefined {
        const status = this.intersection(node);

        switch (status) {
            case "inside":
                return undefined;
            case "outside":
                return this._geometry;
            case "intersect":
                if (!this._bsp) {
                    this._bsp = this.buildBsp();
                }
                if (!this._geometry) {
                    return undefined;
                }
                const clippedA = clipTo(invert(this._bsp), node);
                const clippedB = invert(clipTo(invert(clipTo(node, clippedA)), clippedA));
                const outs = allPolygons(invert(build(allPolygons(clippedB), clippedA)));
                return this.polygonsToGeometry(outs);
            default:
                return this._geometry;
        }
    }

    private polygonsToGeometry(polygons: readonly Polygon[]): THREE.BufferGeometry {
        const geometry = new THREE.BufferGeometry();
        const positions: number[] = [];
        const indices: number[] = [];

        polygons.forEach((poly, polyIndex) => {
            const baseIndex = positions.length / 3;
            poly.vectors.forEach(vec => {
                positions.push(vec.x, vec.y, vec.z);
            });
            for (let i = 1; i < poly.vectors.length - 1; i++) {
                indices.push(baseIndex, baseIndex + i, baseIndex + i + 1);
            }
        });

        geometry.setAttribute(
            "position",
            new THREE.BufferAttribute(new Float32Array(positions), 3)
        );
        geometry.setIndex(new THREE.BufferAttribute(new Uint32Array(indices), 1));
        return geometry;
    }

    getTopTriangles(): Float32Array {
        return this.getTrianglesByFaceType(FaceTypes.TopFace);
    }

    getBaseTriangles(): Float32Array {
        return this.getTrianglesByFaceType(FaceTypes.BaseFace);
    }

    getTrianglesByFaceType(faceType: FaceType): Float32Array {
        if (!this._geometry) {
            return new Float32Array(0);
        }

        const positionAttr = this._geometry.getAttribute("position");
        const indexAttr = this._geometry.getIndex();
        // @ts-ignore - custom attribute
        const faceTypesAttr = this._geometry.getAttribute("facetypes");

        if (!positionAttr || !indexAttr || !faceTypesAttr) {
            return new Float32Array(0);
        }

        const positions = positionAttr.array;
        const indices = indexAttr.array;
        const faceTypesArray = faceTypesAttr.array;
        const result: number[] = [];

        for (let i = 0; i < indices.length; i += 3) {
            const faceTypeIndex = Math.floor(i / 3);
            if (faceTypesArray[faceTypeIndex] & faceType) {
                const i0 = indices[i] * 3;
                const i1 = indices[i + 1] * 3;
                const i2 = indices[i + 2] * 3;

                result.push(
                    positions[i0],
                    positions[i0 + 1],
                    positions[i0 + 2],
                    positions[i1],
                    positions[i1 + 1],
                    positions[i1 + 2],
                    positions[i2],
                    positions[i2 + 1],
                    positions[i2 + 2]
                );
            }
        }

        return new Float32Array(result);
    }

    private buildBsp(): BSPNode {
        const polygons = this.buildPolygons();
        return fromPolygons(polygons);
    }

    private buildPolygons(): Polygon[] {
        if (!this._geometry) {
            return [];
        }

        const polygons: Polygon[] = [];
        const positionAttr = this._geometry.getAttribute("position");
        const indexAttr = this._geometry.getIndex();

        if (!positionAttr || !indexAttr) {
            return [];
        }

        const positions = positionAttr.array;
        const indices = indexAttr.array;

        for (let i = 0; i < indices.length; i += 3) {
            const i0 = indices[i] * 3;
            const i1 = indices[i + 1] * 3;
            const i2 = indices[i + 2] * 3;

            const vectors = [
                new THREE.Vector3(positions[i0], positions[i0 + 1], positions[i0 + 2]),
                new THREE.Vector3(positions[i1], positions[i1 + 1], positions[i1 + 2]),
                new THREE.Vector3(positions[i2], positions[i2 + 1], positions[i2 + 2])
            ];

            const plane = fromVectors(vectors);
            polygons.push({ vectors, plane });
        }

        return polygons;
    }

    getPolygons(): readonly Polygon[] {
        if (!this._bsp) {
            return [];
        }
        return allPolygons(this._bsp);
    }

    getBoundingBox(): THREE.Box3 {
        if (this._bbox) {
            return this._bbox;
        }

        if (!this._geometry) {
            return new THREE.Box3(new THREE.Vector3(0, 0, 0), new THREE.Vector3(0, 0, 0));
        }

        const positionAttr = this._geometry.getAttribute("position");
        if (!positionAttr) {
            return new THREE.Box3(new THREE.Vector3(0, 0, 0), new THREE.Vector3(0, 0, 0));
        }

        const positions = positionAttr.array;
        const box = new THREE.Box3();

        for (let i = 0; i < positions.length; i += 3) {
            box.expandByPoint(new THREE.Vector3(positions[i], positions[i + 1], positions[i + 2]));
        }

        this._bbox = box;
        return box;
    }

    intersection(bspB: BSPNode): "inside" | "intersect" | "outside" {
        const bspA = this._bsp!;
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
}
