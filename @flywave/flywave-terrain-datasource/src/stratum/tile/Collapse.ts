import { BSPNode, fromPolygons, Polygon, triangulate } from "@flywave/flywave-geometry";
import { fromVectors } from "@flywave/flywave-geoutils";
import * as THREE from "three";

// 陷落柱剖面结构
export interface CollapseProfile {
    collapseID: string;
    crossSections: THREE.BufferGeometry[];
    polys: THREE.Vector3[][];
}

export class CollapsePillar {
    private readonly _id: string;
    private readonly _name: string;
    private readonly _lithology: string;
    private readonly _topCenter: THREE.Vector3;
    private readonly _baseCenter: THREE.Vector3;
    private readonly _topRadius: number;
    private readonly _baseRadius: number;
    private readonly _height: number;
    private readonly _stratumId: string;
    private _bbox?: THREE.Box3;
    private _bsp?: BSPNode;
    private _geometry?: THREE.BufferGeometry;
    private _material?: THREE.Material;

    constructor(
        collapse: {
            id: string;
            name: string;
            topCenter: [number, number, number];
            baseCenter: [number, number, number];
            topRadius: number;
            baseRadius: number;
            height: number;
            stratumId: string;
            lithology: string;
        },
        bbox?: THREE.Box3,
        geometry?: THREE.BufferGeometry,
        material?: THREE.Material
    ) {
        this._id = collapse.id;
        this._name = collapse.name;
        this._lithology = collapse.lithology;
        this._topCenter = new THREE.Vector3().fromArray(collapse.topCenter);
        this._baseCenter = new THREE.Vector3().fromArray(collapse.baseCenter);
        this._topRadius = collapse.topRadius;
        this._baseRadius = collapse.baseRadius;
        this._height = collapse.height;
        this._stratumId = collapse.stratumId;
        this._bbox = bbox;
        this._geometry = geometry;
        this._material = material;
        this._bsp = this.buildBsp();
    }

    get id() {
        return this._id;
    }

    get name() {
        return this._name;
    }

    get lithology() {
        return this._lithology;
    }

    get topCenter() {
        return this._topCenter;
    }

    get baseCenter() {
        return this._baseCenter;
    }

    get topRadius() {
        return this._topRadius;
    }

    get baseRadius() {
        return this._baseRadius;
    }

    get height() {
        return this._height;
    }

    get stratumId() {
        return this._stratumId;
    }

    get geometry(): THREE.BufferGeometry {
        return this._geometry!;
    }

    get material(): THREE.Material {
        return this._material!;
    }

    get bbox() {
        return this._bbox;
    }

    get bsp() {
        return this._bsp;
    }

    dispose() {
        if (this._geometry) {
            this._geometry.dispose();
        }
        if (this._material) {
            this._material.dispose();
        }
        this._geometry = undefined;
        this._material = undefined;
        this._bsp = undefined;
        this._bbox = undefined;
    }

    generateCrossSections(
        line: [THREE.Vector3, THREE.Vector3]
    ): { positions: THREE.Vector3[]; indices: number[][] } | undefined {
        const intersectionPoints = this.calculateIntersection(line);

        if (intersectionPoints.length < 3) return;

        const sortedPoints = this.sortConvexPoints(intersectionPoints);
        return triangulate(sortedPoints);
    }

    private calculateIntersection(line: [THREE.Vector3, THREE.Vector3]): THREE.Vector3[] {
        if (!this._geometry) {
            return [];
        }

        const positionAttr = this._geometry.getAttribute("position");
        const indexAttr = this._geometry.getIndex();
        const positions = positionAttr.array;
        const indices = indexAttr?.array;

        if (!positions || !indices) {
            return [];
        }

        const intersections: THREE.Vector3[] = [];

        for (let i = 0; i < indices.length; i += 3) {
            const i1 = indices[i] * 3;
            const i2 = indices[i + 1] * 3;
            const i3 = indices[i + 2] * 3;

            const triangle = [
                new THREE.Vector3(positions[i1], positions[i1 + 1], positions[i1 + 2]),
                new THREE.Vector3(positions[i2], positions[i2 + 1], positions[i2 + 2]),
                new THREE.Vector3(positions[i3], positions[i3 + 1], positions[i3 + 2])
            ];

            for (let j = 0; j < 3; j++) {
                const a = triangle[j];
                const b = triangle[(j + 1) % 3];
                const intersection = this.intersectEdgeWithPlane(a, b, line);
                if (intersection) {
                    intersections.push(intersection);
                }
            }
        }
        return this.removeDuplicates(intersections);
    }

    private intersectEdgeWithPlane(
        a: THREE.Vector3,
        b: THREE.Vector3,
        line: [THREE.Vector3, THREE.Vector3]
    ): THREE.Vector3 | null {
        const planePoint = line[0];
        const lineDirection = new THREE.Vector3().subVectors(line[1], line[0]);

        // Calculate plane normal (perpendicular to both line direction and up vector)
        const up = new THREE.Vector3(0, 1, 0);
        const planeNormal = new THREE.Vector3().crossVectors(lineDirection, up);

        // Handle parallel case
        if (planeNormal.length() < 1e-6) {
            const zAxis = new THREE.Vector3(0, 0, 1);
            planeNormal.crossVectors(lineDirection, zAxis);
            if (planeNormal.length() < 1e-6) return null;
        }
        planeNormal.normalize();

        const edgeVector = new THREE.Vector3().subVectors(b, a);
        const denominator = edgeVector.dot(planeNormal);

        if (Math.abs(denominator) < 1e-6) return null;

        const t = new THREE.Vector3().subVectors(planePoint, a).dot(planeNormal) / denominator;

        if (t < 0 || t > 1) return null;

        return new THREE.Vector3(
            a.x + edgeVector.x * t,
            a.y + edgeVector.y * t,
            a.z + edgeVector.z * t
        );
    }

    private sortConvexPoints(points: THREE.Vector3[]): THREE.Vector3[] {
        if (points.length === 0) return [];

        // Calculate centroid
        const centroid = points
            .reduce((acc, cur) => {
                acc.x += cur.x;
                acc.y += cur.y;
                acc.z += cur.z;
                return acc;
            }, new THREE.Vector3(0, 0, 0))
            .divideScalar(points.length);

        // Sort by angle relative to centroid
        return points.sort((a, b) => {
            const angleA = Math.atan2(a.y - centroid.y, a.x - centroid.x);
            const angleB = Math.atan2(b.y - centroid.y, b.x - centroid.x);
            return angleA - angleB;
        });
    }

    private removeDuplicates(points: THREE.Vector3[], epsilon = 1e-6): THREE.Vector3[] {
        return points.filter(
            (p, i) =>
                !points
                    .slice(0, i)
                    .some(
                        q =>
                            Math.abs(p.x - q.x) < epsilon &&
                            Math.abs(p.y - q.y) < epsilon &&
                            Math.abs(p.z - q.z) < epsilon
                    )
        );
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
        const positions = positionAttr.array;
        const indices = indexAttr?.array;

        if (!positions || !indices) {
            return [];
        }

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
}
