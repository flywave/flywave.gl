/* Copyright (C) 2026 flywave.gl contributors */

import * as THREE from "three/webgpu";
import earcut from "earcut";

import { HeightRange } from "./curtainGeometry";

export interface PrismGeometryOptions {
    /** Outer boundary vertices projected into world frame at surface altitude. */
    outerRing: THREE.Vector3[];
    /** Hole rings, same frame. Must not intersect the outer ring. */
    holes?: THREE.Vector3[][];
    /** Vertical extent of the prism, meters above the datum. */
    heightRange: HeightRange;
    /** Local-frame origin; defaults to the centroid of the outer ring. */
    origin?: THREE.Vector3;
}

export interface PrismGeometryResult {
    geometry: THREE.BufferGeometry;
    origin: THREE.Vector3;
    /**
     * Membership frame inputs: the bounding-rectangle
     * south-west corner (origin-relative), world-axis unit directions and
     * extents. Eye-space planes are derived per frame from these values.
     */
    planarFrame: {
        southWestCorner: THREE.Vector3;
        eastWard: THREE.Vector3;
        northWard: THREE.Vector3;
        extents: THREE.Vector2;
    };
}

/**
 * Extrudes a triangulated polygon footprint into a closed vertical prism
 * spanning `[heightRange.min, heightRange.max]`.
 *
 * Each output triangle carries its three footprint corners in attributes
 * (`aCornerA/B/C`, local frame); the draped material reconstructs the captured
 * ground position from scene depth and keeps the fragment only when that
 * position falls inside the fragment's own footprint triangle — an analytic
 * three-half-plane test, no stencil involvement.
 */
export function buildPrismGeometry(options: PrismGeometryOptions): PrismGeometryResult {
    const outer = options.outerRing;
    if (outer.length < 3) {
        throw new Error("buildPrismGeometry: outer ring needs at least three positions");
    }
    const holeRings = options.holes ?? [];

    const origin =
        options.origin !== undefined
            ? options.origin.clone()
            : outer.reduce((sum, p) => sum.add(p), new THREE.Vector3()).divideScalar(outer.length);

    // Tangent-plane basis at the origin for flattening the footprint.
    const up = origin.clone().normalize();
    let east = outer[1].clone().sub(origin);
    east.addScaledVector(up, -east.dot(up));
    if (east.lengthSq() < 1e-12) {
        east = new THREE.Vector3(1, 0, 0).addScaledVector(up, -up.x);
    }
    east.normalize();
    const north = up.clone().cross(east).normalize();

    const flatten = (ring: THREE.Vector3[]) =>
        ring.map(p => {
            const local = p.clone().sub(origin);
            return [local.dot(east), local.dot(north)];
        });

    const flatOuter = flatten(outer);
    const flatHoles = holeRings.map(flatten);

    const contour: number[] = [];
    for (const [u, v] of flatOuter) {
        contour.push(u, v);
    }
    const holeIndices: number[] = [];
    for (const hole of flatHoles) {
        holeIndices.push(contour.length / 2);
        for (const [u, v] of hole) {
            contour.push(u, v);
        }
    }

    const triangles = earcut(contour, holeIndices.length > 0 ? holeIndices : undefined, 2);
    if (triangles.length === 0) {
        throw new Error("buildPrismGeometry: triangulation produced no triangles");
    }

    // Vertex list spanning all rings; earcut indexes across ring boundaries.
    const allRingPoints = [...outer, ...holeRings.flat()];

    const cornerAt = (index: number) => allRingPoints[index];
    const radialAt = (p: THREE.Vector3) => p.clone().normalize();
    const atHeight = (p: THREE.Vector3, height: number) =>
        radialAt(p)
            .multiplyScalar(p.length() + height)
            .sub(origin);

    const { min, max } = options.heightRange;

    const triangleCount = triangles.length / 3;
    const vertsPerTriangle = 6; // top 3 + bottom 3, no cross-triangle sharing
    const positions = new Float32Array(triangleCount * vertsPerTriangle * 3);
    const cornersA = new Float32Array(triangleCount * vertsPerTriangle * 3);
    const cornersB = new Float32Array(triangleCount * vertsPerTriangle * 3);
    const cornersC = new Float32Array(triangleCount * vertsPerTriangle * 3);
    // Bounding rectangle of every ring point on the tangent basis,
    // packaged exactly like the reference batch-table entries.
    const planar = flatOuter.map(([u, v]) => ({ u, v }));
    for (const ring of flatHoles) {
        for (const [u, v] of ring) planar.push({ u, v });
    }
    const minU = Math.min(...planar.map(q => q.u));
    const maxU = Math.max(...planar.map(q => q.u));
    const minV = Math.min(...planar.map(q => q.v));
    const maxV = Math.max(...planar.map(q => q.v));
    const extentU = Math.max(maxU - minU, 1e-6);
    const extentV = Math.max(maxV - minV, 1e-6);

    const indices = new Uint32Array(triangleCount * 24);

    for (let t = 0; t < triangleCount; t++) {
        const i0 = triangles[t * 3];
        const i1 = triangles[t * 3 + 1];
        const i2 = triangles[t * 3 + 2];
        const p0 = cornerAt(i0);
        const p1 = cornerAt(i1);
        const p2 = cornerAt(i2);

        const top0 = atHeight(p0, max);
        const top1 = atHeight(p1, max);
        const top2 = atHeight(p2, max);
        const bottom0 = atHeight(p0, min);
        const bottom1 = atHeight(p1, min);
        const bottom2 = atHeight(p2, min);

        const baseVertex = t * vertsPerTriangle;
        const slot = [top0, top1, top2, bottom0, bottom1, bottom2];
        for (let v = 0; v < vertsPerTriangle; v++) {
            const write = (baseVertex + v) * 3;
            const p = slot[v];
            positions.set([p.x, p.y, p.z], write);
            cornersA.set([top0.x, top0.y, top0.z], write);
            cornersB.set([top1.x, top1.y, top1.z], write);
            cornersC.set([top2.x, top2.y, top2.z], write);
        }

        const write = t * 24;
        const b = baseVertex;
        let w = write;
        // Top face.
        indices.set([b + 0, b + 1, b + 2], w);
        w += 3;
        // Bottom face (reversed).
        indices.set([b + 5, b + 4, b + 3], w);
        w += 3;
        // Side walls: (top_i, top_j, bottom_j) + (top_i, bottom_j, bottom_i).
        const wall = (ti: number, tj: number, bi: number, bj: number) => {
            indices.set([b + ti, b + tj, b + bj], w);
            w += 3;
            indices.set([b + ti, b + bj, b + bi], w);
            w += 3;
        };
        wall(0, 1, 3, 4);
        wall(1, 2, 4, 5);
        wall(2, 0, 5, 3);
    }

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    geometry.setAttribute("aCornerA", new THREE.BufferAttribute(cornersA, 3));
    geometry.setAttribute("aCornerB", new THREE.BufferAttribute(cornersB, 3));
    geometry.setAttribute("aCornerC", new THREE.BufferAttribute(cornersC, 3));
    geometry.setIndex(new THREE.BufferAttribute(indices, 1));

    return {
        geometry,
        origin,
        planarFrame: {
            southWestCorner: east
                .clone()
                .multiplyScalar(minU)
                .add(north.clone().multiplyScalar(minV)),
            eastWard: east.clone(),
            northWard: north.clone(),
            extents: new THREE.Vector2(extentU, extentV)
        }
    };
}
