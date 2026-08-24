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
 * Vertex layout per segment (8 vertices, two vertical panels hinged on the
 * centerline):
 *
 * ```
 * 0: start bottom (right panel)   4: start bottom (left panel)
 * 1: end   bottom (right panel)   5: end   bottom (left panel)
 * 2: end   top    (right panel)   6: end   top    (left panel)
 * 3: start top    (right panel)   7: start top    (left panel)
 * ```
 *
 * Attributes consumed by `DrapedSurfaceMaterial`:
 *
 * - `aSegmentStart` / `aForwardOffset`: segment endpoints in local frame
 * - `aStartPlaneNormal` / `aEndPlaneNormal`: miter plane normals (local frame)
 * - `aRightNormal`: horizontal normal of the segment (local frame)
 * - `aSideSign`: `+1` for right-panel vertices, `-1` for left-panel ones
 */
export function buildCurtainGeometry(options: CurtainGeometryOptions): CurtainGeometryResult {
    const raw = options.positions;
    if (raw.length < 2) {
        throw new Error("buildCurtainGeometry: at least two positions required");
    }

    const loop = options.loop === true && raw.length > 2;
    const points = loop ? [...raw, raw[0].clone()] : raw.slice();
    const segmentCount = points.length - 1;

    const ranges: HeightRange[] = [];
    if (Array.isArray(options.heightRanges)) {
        for (let i = 0; i < segmentCount; i++) {
            ranges.push(options.heightRanges[i] ?? { min: 0, max: 100 });
        }
    } else {
        const shared = options.heightRanges ?? { min: 0, max: 100 };
        for (let i = 0; i < segmentCount; i++) {
            ranges.push(shared);
        }
    }

    // Per-point horizontal directions (normalized, world frame).
    const directions: THREE.Vector3[] = [];
    for (let i = 0; i < points.length; i++) {
        const dIn =
            i > 0
                ? points[i]
                      .clone()
                      .sub(points[i - 1])
                      .normalize()
                : points[i + 1].clone().sub(points[i]).normalize();
        const dOut =
            i < points.length - 1 ? points[i + 1].clone().sub(points[i]).normalize() : dIn.clone();
        const bisector = dIn.add(dOut);
        if (bisector.lengthSq() < 1e-12) {
            // Straight reversal: fall back to the incoming direction.
            bisector.copy(
                i > 0 ? points[i].clone().sub(points[i - 1]) : points[i + 1].clone().sub(points[i])
            );
        }
        directions.push(bisector.normalize());
    }

    // Arc length bookkeeping for along-line texture coordinates.
    let totalLength = 0;
    const segmentLengths: number[] = [];
    for (let i = 0; i < segmentCount; i++) {
        const length = points[i + 1].distanceTo(points[i]);
        segmentLengths.push(length);
        totalLength += length;
    }
    if (totalLength <= 0) {
        totalLength = 1;
    }

    const origin =
        options.origin !== undefined
            ? options.origin.clone()
            : points
                  .reduce((sum, p) => sum.add(p), new THREE.Vector3())
                  .divideScalar(points.length);
    const toLocal = (p: THREE.Vector3) => p.clone().sub(origin);

    const vertexFloats = segmentCount * 8 * 3;
    const positions = new Float32Array(vertexFloats);
    const segmentStarts = new Float32Array(vertexFloats);
    const forwardOffsets = new Float32Array(vertexFloats);
    const startNormals = new Float32Array(vertexFloats);
    const endNormals = new Float32Array(vertexFloats);
    const rightNormals = new Float32Array(vertexFloats);
    const sideSigns = new Float32Array(segmentCount * 8);

    let lengthSoFar = 0;
    for (let seg = 0; seg < segmentCount; seg++) {
        const start = points[seg];
        const end = points[seg + 1];
        const range = ranges[seg];

        const forward = end.clone().sub(start);
        const segmentLength = segmentLengths[seg];

        const startUp = start.clone().normalize();
        const endUp = end.clone().normalize();
        const rightNormal = forward.clone().cross(startUp).normalize();
        // Miter-plane normals are the unit travel directions themselves: the
        // start/end caps are the planes through each endpoint perpendicular to
        // the line. (Do NOT derive them as up×dir — that yields a horizontal
        // vector, which silently disables the end constraints.)
        const startPlaneNormal = directions[seg].clone();
        const endPlaneNormal = directions[seg + 1].clone();

        const localStart = toLocal(start);
        const localForward = toLocal(end).sub(localStart);

        const radialAt = (p: THREE.Vector3) => p.clone().normalize();
        const startBottom = radialAt(start).multiplyScalar(start.length() + range.min);
        const startTop = radialAt(start).multiplyScalar(start.length() + range.max);
        const endBottom = radialAt(end).multiplyScalar(end.length() + range.min);
        const endTop = radialAt(end).multiplyScalar(end.length() + range.max);

        const sScale = Math.abs(segmentLength / totalLength);
        void sScale;
        const tBase = lengthSoFar / totalLength;
        void tBase;

        const cornerWorld = [
            startBottom,
            endBottom,
            endTop,
            startTop,
            startBottom,
            endBottom,
            endTop,
            startTop
        ];
        const sideSignValues = [1, 1, 1, 1, -1, -1, -1, -1];

        for (let j = 0; j < 8; j++) {
            const write = (seg * 8 + j) * 3;
            const corner = toLocal(cornerWorld[j]);
            // Nudge off the exact centerline so panels do not intersect the
            // polyline itself and stay valid geometry for the pipeline.
            const nudged = corner.addScaledVector(rightNormal, sideSignValues[j] * EPSILON_NUDGE);

            positions.set([nudged.x, nudged.y, nudged.z], write);
            segmentStarts.set([localStart.x, localStart.y, localStart.z], write);
            forwardOffsets.set([localForward.x, localForward.y, localForward.z], write);
            startNormals.set([startPlaneNormal.x, startPlaneNormal.y, startPlaneNormal.z], write);
            endNormals.set([endPlaneNormal.x, endPlaneNormal.y, endPlaneNormal.z], write);
            rightNormals.set([rightNormal.x, rightNormal.y, rightNormal.z], write);

            sideSigns[seg * 8 + j] = sideSignValues[j];
        }

        lengthSoFar += segmentLength;
    }

    // Two panels per segment; opposite winding between the sides so a single
    // back-face culled pass leaves exactly one visible layer per view ray.
    const indices = new Uint32Array(segmentCount * 12);
    for (let seg = 0; seg < segmentCount; seg++) {
        const base = seg * 8;
        const write = seg * 12;
        // Right panel (back faces point toward the left side).
        indices.set([base + 0, base + 1, base + 2, base + 0, base + 2, base + 3], write);
        // Left panel, mirrored winding.
        indices.set([base + 7, base + 6, base + 5, base + 7, base + 5, base + 4], write + 6);
    }

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    geometry.setAttribute("aSegmentStart", new THREE.BufferAttribute(segmentStarts, 3));
    geometry.setAttribute("aForwardOffset", new THREE.BufferAttribute(forwardOffsets, 3));
    geometry.setAttribute("aStartPlaneNormal", new THREE.BufferAttribute(startNormals, 3));
    geometry.setAttribute("aEndPlaneNormal", new THREE.BufferAttribute(endNormals, 3));
    geometry.setAttribute("aRightNormal", new THREE.BufferAttribute(rightNormals, 3));
    geometry.setAttribute("aSideSign", new THREE.BufferAttribute(sideSigns, 1));
    geometry.setIndex(new THREE.BufferAttribute(indices, 1));

    return { geometry, origin };
}
