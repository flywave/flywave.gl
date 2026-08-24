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
 * Cesium's `PolylineShadowVolumeVS`):
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

    // Per-joint miter directions (normalized bisector), used as cap normals.
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
            bisector.copy(
                i > 0 ? points[i].clone().sub(points[i - 1]) : points[i + 1].clone().sub(points[i])
            );
        }
        directions.push(bisector.normalize());
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
    const sideSigns = new Float32Array(segmentCount * 4);

    for (let seg = 0; seg < segmentCount; seg++) {
        const startLocal = toLocal(points[seg]);
        const endLocal = toLocal(points[seg + 1]);
        const forward = points[seg + 1].clone().sub(points[seg]);
        const startUp = points[seg].clone().normalize();
        const rightNormal = forward.clone().cross(startUp).normalize();
        // Cap-plane normals point INTO the segment: end one is negated.
        const startPlaneNormal = directions[seg].clone();
        const endPlaneNormal = directions[seg + 1].clone().negate();

        // Vertices sit exactly on the centerline nodes (Cesium packs a unit
        // miter push here instead; both are placeholders the vertex stage
        // overwrites with the real expansion).
        // Vertical span of the shadow volume (the role Cesium's
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

        for (let j = 0; j < 4; j++) {
            const write = (seg * 4 + j) * 3;
            const own = ownPositions[j];
            positions.set([own.x, own.y, own.z], write);
            startPositions.set([startLocal.x, startLocal.y, startLocal.z], write);
            endPositions.set([endLocal.x, endLocal.y, endLocal.z], write);
            startNormals.set([startPlaneNormal.x, startPlaneNormal.y, startPlaneNormal.z], write);
            endNormals.set([endPlaneNormal.x, endPlaneNormal.y, endPlaneNormal.z], write);
            rightNormals.set([rightNormal.x, rightNormal.y, rightNormal.z], write);
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
    geometry.setAttribute("aSideSign", new THREE.BufferAttribute(sideSigns, 1));
    geometry.setIndex(new THREE.BufferAttribute(indices, 1));

    return { geometry, origin };
}
