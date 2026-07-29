import * as THREE from 'three';

/**
 * Compute anchor points along a line for symbol placement.
 *
 * Reference: mapbox-gl-js src/symbol/get_anchors.ts
 *
 * For line/line-center placement, symbols are placed at regular intervals
 * along the line geometry.
 */

export interface LineAnchor {
    /** Distance along the line (0-1 normalized) */
    t: number;
    /** Screen-space position */
    x: number;
    y: number;
    /** Angle of the line at this point (radians) */
    angle: number;
    /** Segment index */
    segmentIndex: number;
}

/**
 * Generate evenly-spaced anchors along a polyline in screen space.
 *
 * @param points - Screen-space points of the line
 * @param spacing - Spacing between anchors in pixels
 * @param maxAngle - Max angle between segments (radians) to skip sharp corners
 * @returns Array of anchor points
 */
export function getLineAnchors(
    points: THREE.Vector2[],
    spacing: number,
    maxAngle: number = 45 * Math.PI / 180,
): LineAnchor[] {
    if (points.length < 2) return [];

    const anchors: LineAnchor[] = [];

    // Compute cumulative distances
    const distances: number[] = [0];
    for (let i = 1; i < points.length; i++) {
        const d = points[i].distanceTo(points[i - 1]);
        distances.push(distances[i - 1] + d);
    }

    const totalLength = distances[distances.length - 1];
    if (totalLength < spacing * 0.5) {
        // Line too short — place single anchor at center
        const midT = 0.5;
        const anchor = interpolateAnchor(points, distances, midT);
        if (anchor) anchors.push(anchor);
        return anchors;
    }

    // Place anchors at regular intervals
    let dist = spacing / 2; // Start at half-spacing offset
    while (dist < totalLength) {
        const t = dist / totalLength;
        const anchor = interpolateAnchor(points, distances, t);
        if (anchor) {
            // Check angle at this point
            if (anchors.length > 0) {
                const angleDiff = Math.abs(normalizeAngle(anchor.angle - anchors[anchors.length - 1].angle));
                if (angleDiff > maxAngle) {
                    // Skip sharp corner
                    dist += spacing;
                    continue;
                }
            }
            anchors.push(anchor);
        }
        dist += spacing;
    }

    return anchors;
}

/**
 * Interpolate a point along the polyline at parameter t (0-1).
 */
function interpolateAnchor(
    points: THREE.Vector2[],
    distances: number[],
    t: number,
): LineAnchor | undefined {
    const totalLength = distances[distances.length - 1];
    const targetDist = t * totalLength;

    // Find segment containing targetDist
    let segIdx = 0;
    for (let i = 1; i < distances.length; i++) {
        if (distances[i] >= targetDist) {
            segIdx = i - 1;
            break;
        }
    }

    const segStart = points[segIdx];
    const segEnd = points[segIdx + 1];
    const segLen = distances[segIdx + 1] - distances[segIdx];
    const localT = segLen > 0 ? (targetDist - distances[segIdx]) / segLen : 0;

    const x = segStart.x + (segEnd.x - segStart.x) * localT;
    const y = segStart.y + (segEnd.y - segStart.y) * localT;
    const angle = Math.atan2(segEnd.y - segStart.y, segEnd.x - segStart.x);

    return { t, x, y, angle, segmentIndex: segIdx };
}

/**
 * Normalize angle to [-PI, PI].
 */
function normalizeAngle(a: number): number {
    while (a > Math.PI) a -= 2 * Math.PI;
    while (a < -Math.PI) a += 2 * Math.PI;
    return a;
}

/**
 * For line-center placement: place a single anchor at the visual center of the line.
 */
export function getLineCenterAnchor(points: THREE.Vector2[]): LineAnchor | undefined {
    if (points.length < 2) return undefined;
    return getLineAnchors(points, Infinity)[0];
}
