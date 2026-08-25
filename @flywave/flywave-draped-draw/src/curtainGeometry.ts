/* Copyright (C) 2026 flywave.gl contributors */

import * as THREE from "three/webgpu";

/** Vertical extent of a draped volume segment, in meters above the datum. */
export interface HeightRange {
    min: number;
    max: number;
}

export interface CurtainGeometryOptions {
    /**
     * Polyline vertices projected into world frame at surface altitude.
     * Heights of the input vectors themselves are ignored; the volume spans
     * the supplied height ranges instead.
     */
    positions: THREE.Vector3[];
    /** One range for the whole polyline, or one per segment. */
    heightRanges?: HeightRange | HeightRange[];
    /** Close the polyline back to its first point. */
    loop?: boolean;
    /**
     * Local-frame origin subtracted from all positions. Defaults to the
     * centroid; return it to the caller so the owning object can place itself.
     */
    origin?: THREE.Vector3;
}

export interface CurtainGeometryResult {
    geometry: THREE.BufferGeometry;
    /** Local frame origin actually used. */
    origin: THREE.Vector3;
}

const EPSILON_NUDGE = 1e-5;

/**
 * Vertex layout per segment (4 vertices, a thin quad spanning both endpoint
 * nodes; the vertex stage expands it into the shadow-volume shell, mirroring
 * the reference vertex stage):
 *
 * ```
 * 0: start node (side +1)   2: end node (side +1)
 * 1: start node (side -1)   3: end node (side -1)
 * ```
 */
export function buildCurtainGeometry(options: CurtainGeometryOptions): CurtainGeometryResult {
    const raw = options.positions;
    if (raw.length < 2) {
        throw new Error("buildCurtainGeometry: at least two positions required");
    }

    const loop = options.loop === true && raw.length > 2;
    const points = loop ? [...raw, raw[0].clone()] : raw.slice();
    const segmentCount = points.length - 1;

    // Vertical span of the curtain around the input nodes (meters).
    const DEFAULT_RANGE = { min: -2000, max: 6000 };
    const ranges: HeightRange[] = [];
    if (Array.isArray(options.heightRanges)) {
        for (let i = 0; i < segmentCount; i++) {
            ranges.push(options.heightRanges[i] ?? DEFAULT_RANGE);
        }
    } else {
        const shared = options.heightRanges ?? DEFAULT_RANGE;
        for (let i = 0; i < segmentCount; i++) ranges.push(shared);
    }

    // Per-joint cap normals, following the reference ground-line geometry:
    // neighbor directions are orthogonalized against the local up (tangent
    // plane), averaged into a rightward miter vector, then rotated into the
    // actual cap plane by crossing with up. Sharp turns are "broken" back to
    // a perpendicular cap beyond 30/150 degrees so the miter never explodes.
    const MITER_BREAK_SMALL = Math.cos(Math.PI / 6); // cos 30 deg
    const MITER_BREAK_LARGE = -MITER_BREAK_SMALL; // cos 150 deg

    const upOf = (i: number) => points[i].clone().normalize();

    // Direction towards `from`, orthogonalized into the tangent plane at `at`.
    const tangentTo = (from: number, at: number) => {
        let d = points[from].clone().sub(points[at]).normalize();
        d = d.cross(upOf(at)).normalize();
        return upOf(at).clone().cross(d);
    };

    const rightNormalOfSeg = (a: number, b: number) =>
        points[b].clone().sub(points[a]).normalize().cross(upOf(a)).normalize();

    const computeVertexMiter = (at: number, prev: number, next: number) => {
        const toPrev = tangentTo(prev, at);
        const toNext = tangentTo(next, at);
        // Almost opposite tangents: straight run, right-facing normal only.
        if (Math.abs(toPrev.dot(toNext) + 1) < 1e-5) {
            return upOf(at).clone().cross(toPrev).normalize();
        }
        const m = toNext.clone().add(toPrev).normalize();
        const forward = upOf(at).clone().cross(m);
        if (toNext.dot(forward) < 0) {
            m.negate();
        }
        return m;
    };

    // Rotate the miter back to a perpendicular cap when the turn is too
    // sharp relative to the outgoing segment direction.
    const breakMiter = (m: THREE.Vector3, a: number, b: number) => {
        const lineDir = points[b].clone().sub(points[a]).normalize();
        const dot = lineDir.dot(m);
        if (dot > MITER_BREAK_SMALL || dot < MITER_BREAK_LARGE) {
            const angle = dot < MITER_BREAK_LARGE ? Math.PI / 2 : -Math.PI / 2;
            m.applyAxisAngle(upOf(b), angle);
            return true;
        }
        return false;
    };

    const ringCount = loop ? points.length - 1 : points.length;
    const miters: THREE.Vector3[] = new Array(points.length);
    for (let i = 0; i < ringCount; i++) {
        if (loop) {
            const prev = (i - 1 + ringCount) % ringCount;
            const next = (i + 1) % ringCount;
            miters[i] = computeVertexMiter(i, prev, next);
        } else if (i === 0) {
            miters[i] = rightNormalOfSeg(0, 1);
        } else if (i === ringCount - 1) {
            miters[i] = rightNormalOfSeg(ringCount - 2, ringCount - 1);
        } else {
            miters[i] = computeVertexMiter(i, i - 1, i + 1);
        }
    }
    if (loop) {
        miters[points.length - 1] = miters[0].clone();
    }

    // Break chain across segments; a broken end miter is negated for the
    // next segment's start so the shared plane property survives breaking.
    let miterBroken = false;
    if (loop && breakMiter(miters[0], ringCount - 2, 0)) {
        miters[0].negate();
        miters[points.length - 1] = miters[0].clone();
    }
    for (let seg = 0; seg < segmentCount; seg++) {
        const startM = miters[seg].clone();
        if (miterBroken) {
            startM.negate();
        }
        const endM = miters[seg + 1].clone();
        miterBroken = breakMiter(endM, seg, seg + 1);
        miters[seg] = startM;
        miters[seg + 1] = endM;
    }

    const origin =
        options.origin !== undefined
            ? options.origin.clone()
            : points
                  .reduce((sum, p) => sum.add(p), new THREE.Vector3())
                  .divideScalar(points.length);
    const toLocal = (p: THREE.Vector3) => p.clone().sub(origin);

    const vertexFloats = segmentCount * 4 * 3;
    const positions = new Float32Array(vertexFloats);
    const startPositions = new Float32Array(vertexFloats);
    const endPositions = new Float32Array(vertexFloats);
    const startNormals = new Float32Array(vertexFloats);
    const endNormals = new Float32Array(vertexFloats);
    const rightNormals = new Float32Array(vertexFloats);
    const bottomFlags = new Float32Array(segmentCount * 4);
    const sideSigns = new Float32Array(segmentCount * 4);

    for (let seg = 0; seg < segmentCount; seg++) {
        const startLocal = toLocal(points[seg]);
        const endLocal = toLocal(points[seg + 1]);
        const forward = points[seg + 1].clone().sub(points[seg]);
        const startUp = points[seg].clone().normalize();
        const rightNormal = forward.clone().cross(startUp).normalize();
        // Cap-plane normals point INTO the segment (up x miter at the start,
        // miter x up at the end), so adjacent segments share one geometric
        // boundary plane at every joint.
        const startPlaneNormal = upOf(seg).clone().cross(miters[seg]).normalize();
        const endPlaneNormal = miters[seg + 1]
            .clone()
            .cross(upOf(seg + 1))
            .normalize();

        // Vertices sit exactly on the centerline nodes (the reference packs a unit
        // miter push here instead; both are placeholders the vertex stage
        // overwrites with the real expansion).
        // Vertical span of the shadow volume (the role of the
        // minTerrainHeight / maxTerrainHeight plays): walls must cover every
        // terrain height along the path, otherwise rasterization clips the
        // painted region regardless of fragment-stage membership.
        const startRadial = points[seg].clone().normalize();
        const endRadial = points[seg + 1].clone().normalize();
        const range = ranges[seg];
        const ownPositions = [
            toLocal(points[seg].clone().addScaledVector(startRadial, range.min)),
            toLocal(points[seg].clone().addScaledVector(startRadial, range.max)),
            toLocal(points[seg + 1].clone().addScaledVector(endRadial, range.min)),
            toLocal(points[seg + 1].clone().addScaledVector(endRadial, range.max))
        ];
        const sideSignValues = [1, -1, 1, -1];
        // Vertex order is [lo, hi, hi, lo]: first and last are floor verts.
        const bottomFlagValues = [1, 0, 0, 1];

        for (let j = 0; j < 4; j++) {
            const write = (seg * 4 + j) * 3;
            const own = ownPositions[j];
            positions.set([own.x, own.y, own.z], write);
            startPositions.set([startLocal.x, startLocal.y, startLocal.z], write);
            endPositions.set([endLocal.x, endLocal.y, endLocal.z], write);
            startNormals.set([startPlaneNormal.x, startPlaneNormal.y, startPlaneNormal.z], write);
            endNormals.set([endPlaneNormal.x, endPlaneNormal.y, endPlaneNormal.z], write);
            rightNormals.set([rightNormal.x, rightNormal.y, rightNormal.z], write);
            bottomFlags[seg * 4 + j] = bottomFlagValues[j];
            sideSigns[seg * 4 + j] = sideSignValues[j];
        }
    }

    const indices = new Uint32Array(segmentCount * 6);
    for (let seg = 0; seg < segmentCount; seg++) {
        const b = seg * 4;
        indices.set([b, b + 1, b + 2, b + 1, b + 3, b + 2], seg * 6);
    }

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    geometry.setAttribute("aStartPos", new THREE.BufferAttribute(startPositions, 3));
    geometry.setAttribute("aEndPos", new THREE.BufferAttribute(endPositions, 3));
    geometry.setAttribute("aStartPlaneNormal", new THREE.BufferAttribute(startNormals, 3));
    geometry.setAttribute("aEndPlaneNormal", new THREE.BufferAttribute(endNormals, 3));
    geometry.setAttribute("aRightNormal", new THREE.BufferAttribute(rightNormals, 3));
    geometry.setAttribute("aBottomFlag", new THREE.BufferAttribute(bottomFlags, 1));
    geometry.setAttribute("aSideSign", new THREE.BufferAttribute(sideSigns, 1));
    geometry.setIndex(new THREE.BufferAttribute(indices, 1));

    return { geometry, origin };
}
