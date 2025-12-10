/* Copyright (C) 2025 flywave.gl contributors */

import { defined } from "@flywave/flywave-utils";
import * as THREE from "three";

/**
 * Splits a 2D triangle at given axis-aligned threshold value and returns the resulting
 * polygon on a given side of the threshold. The resulting polygon may have 0, 1, 2,
 * 3, or 4 vertices.
 *
 * @param threshold The threshold coordinate value at which to clip the triangle.
 * @param keepAbove true to keep the portion of the triangle above the threshold, or false
 *                  to keep the portion below.
 * @param u0 The coordinate of the first vertex in the triangle, in counter-clockwise order.
 * @param u1 The coordinate of the second vertex in the triangle, in counter-clockwise order.
 * @param u2 The coordinate of the third vertex in the triangle, in counter-clockwise order.
 * @param result The array into which to copy the result. If this parameter is not supplied,
 *               a new array is constructed and returned.
 * @returns The polygon that results after the clip, specified as a list of vertices.
 *          The vertices are specified in counter-clockwise order. Each vertex is either
 *          an index from the existing list (identified as a 0, 1, or 2) or -1 indicating
 *          a new vertex not in the original triangle. For new vertices, the -1 is followed
 *          by three additional numbers: the index of each of the two original vertices
 *          forming the line segment that the new vertex lies on, and the fraction of
 *          the distance from the first vertex to the second one.
 *
 * @example
 * const result = Intersections2D.clipTriangleAtAxisAlignedThreshold(0.5, false, 0.2, 0.6, 0.4);
 * // result === [2, 0, -1, 1, 0, 0.25, -1, 1, 2, 0.5]
 */
export function clipTriangleAtAxisAlignedThreshold(
    threshold: number,
    keepAbove: boolean,
    u0: number,
    u1: number,
    u2: number,
    result?: number[]
): number[] {
    if (!defined(threshold)) {
        throw new Error("threshold is required.");
    }
    if (!defined(keepAbove)) {
        throw new Error("keepAbove is required.");
    }
    if (!defined(u0)) {
        throw new Error("u0 is required.");
    }
    if (!defined(u1)) {
        throw new Error("u1 is required.");
    }
    if (!defined(u2)) {
        throw new Error("u2 is required.");
    }

    if (!defined(result)) {
        result = [];
    } else {
        result.length = 0;
    }

    const u0Behind = keepAbove ? u0 < threshold : u0 > threshold;
    const u1Behind = keepAbove ? u1 < threshold : u1 > threshold;
    const u2Behind = keepAbove ? u2 < threshold : u2 > threshold;

    const numBehind = (u0Behind ? 1 : 0) + (u1Behind ? 1 : 0) + (u2Behind ? 1 : 0);

    if (numBehind === 1) {
        if (u0Behind) {
            const u01Ratio = (threshold - u0) / (u1 - u0);
            const u02Ratio = (threshold - u0) / (u2 - u0);

            result.push(1, 2);

            if (u02Ratio !== 1.0) {
                result.push(-1, 0, 2, u02Ratio);
            }

            if (u01Ratio !== 1.0) {
                result.push(-1, 0, 1, u01Ratio);
            }
        } else if (u1Behind) {
            const u12Ratio = (threshold - u1) / (u2 - u1);
            const u10Ratio = (threshold - u1) / (u0 - u1);

            result.push(2, 0);

            if (u10Ratio !== 1.0) {
                result.push(-1, 1, 0, u10Ratio);
            }

            if (u12Ratio !== 1.0) {
                result.push(-1, 1, 2, u12Ratio);
            }
        } else if (u2Behind) {
            const u20Ratio = (threshold - u2) / (u0 - u2);
            const u21Ratio = (threshold - u2) / (u1 - u2);

            result.push(0, 1);

            if (u21Ratio !== 1.0) {
                result.push(-1, 2, 1, u21Ratio);
            }

            if (u20Ratio !== 1.0) {
                result.push(-1, 2, 0, u20Ratio);
            }
        }
    } else if (numBehind === 2) {
        if (!u0Behind && u0 !== threshold) {
            const u10Ratio = (threshold - u1) / (u0 - u1);
            const u20Ratio = (threshold - u2) / (u0 - u2);

            result.push(0, -1, 1, 0, u10Ratio, -1, 2, 0, u20Ratio);
        } else if (!u1Behind && u1 !== threshold) {
            const u21Ratio = (threshold - u2) / (u1 - u2);
            const u01Ratio = (threshold - u0) / (u1 - u0);

            result.push(1, -1, 2, 1, u21Ratio, -1, 0, 1, u01Ratio);
        } else if (!u2Behind && u2 !== threshold) {
            const u02Ratio = (threshold - u0) / (u2 - u0);
            const u12Ratio = (threshold - u1) / (u2 - u1);

            result.push(2, -1, 0, 2, u02Ratio, -1, 1, 2, u12Ratio);
        }
    } else if (numBehind !== 3) {
        // Completely in front of threshold
        result.push(0, 1, 2);
    }
    // else Completely behind threshold

    return result;
}

/**
 * Compute the barycentric coordinates of a 2D position within a 2D triangle.
 *
 * @param x The x coordinate of the position for which to find the barycentric coordinates.
 * @param y The y coordinate of the position for which to find the barycentric coordinates.
 * @param x1 The x coordinate of the triangle's first vertex.
 * @param y1 The y coordinate of the triangle's first vertex.
 * @param x2 The x coordinate of the triangle's second vertex.
 * @param y2 The y coordinate of the triangle's second vertex.
 * @param x3 The x coordinate of the triangle's third vertex.
 * @param y3 The y coordinate of the triangle's third vertex.
 * @param result The instance into to which to copy the result. If this parameter
 *               is undefined, a new instance is created and returned.
 * @returns The barycentric coordinates of the position within the triangle.
 *
 * @example
 * const result = Intersections2D.computeBarycentricCoordinates(0.0, 0.0, 0.0, 1.0, -1, -0.5, 1, -0.5);
 * // result === new THREE.Vector3(1.0 / 3.0, 1.0 / 3.0, 1.0 / 3.0);
 */
export function computeBarycentricCoordinates(
    x: number,
    y: number,
    x1: number,
    y1: number,
    x2: number,
    y2: number,
    x3: number,
    y3: number,
    result?: THREE.Vector3
): THREE.Vector3 {
    if (!defined(x)) {
        throw new Error("x is required.");
    }
    if (!defined(y)) {
        throw new Error("y is required.");
    }
    if (!defined(x1)) {
        throw new Error("x1 is required.");
    }
    if (!defined(y1)) {
        throw new Error("y1 is required.");
    }
    if (!defined(x2)) {
        throw new Error("x2 is required.");
    }
    if (!defined(y2)) {
        throw new Error("y2 is required.");
    }
    if (!defined(x3)) {
        throw new Error("x3 is required.");
    }
    if (!defined(y3)) {
        throw new Error("y3 is required.");
    }

    const x1mx3 = x1 - x3;
    const x3mx2 = x3 - x2;
    const y2my3 = y2 - y3;
    const y1my3 = y1 - y3;
    const inverseDeterminant = 1.0 / (y2my3 * x1mx3 + x3mx2 * y1my3);
    const ymy3 = y - y3;
    const xmx3 = x - x3;
    const l1 = (y2my3 * xmx3 + x3mx2 * ymy3) * inverseDeterminant;
    const l2 = (-y1my3 * xmx3 + x1mx3 * ymy3) * inverseDeterminant;
    const l3 = 1.0 - l1 - l2;

    if (defined(result)) {
        result.set(l1, l2, l3);
        return result;
    }
    return new THREE.Vector3(l1, l2, l3);
}

/**
 * Compute the intersection between 2 line segments
 *
 * @param x00 The x coordinate of the first line's first vertex.
 * @param y00 The y coordinate of the first line's first vertex.
 * @param x01 The x coordinate of the first line's second vertex.
 * @param y01 The y coordinate of the first line's second vertex.
 * @param x10 The x coordinate of the second line's first vertex.
 * @param y10 The y coordinate of the second line's first vertex.
 * @param x11 The x coordinate of the second line's second vertex.
 * @param y11 The y coordinate of the second line's second vertex.
 * @param result The instance into to which to copy the result. If this parameter
 *               is undefined, a new instance is created and returned.
 * @returns The intersection point, undefined if there is no intersection point or lines are coincident.
 *
 * @example
 * const result = Intersections2D.computeLineSegmentLineSegmentIntersection(0.0, 0.0, 0.0, 2.0, -1, 1, 1, 1);
 * // result === new THREE.Vector2(0.0, 1.0);
 */
export function computeLineSegmentLineSegmentIntersection(
    x00: number,
    y00: number,
    x01: number,
    y01: number,
    x10: number,
    y10: number,
    x11: number,
    y11: number,
    result?: THREE.Vector2
): THREE.Vector2 | undefined {
    if (!defined(x00)) throw new Error("x00 is required.");
    if (!defined(y00)) throw new Error("y00 is required.");
    if (!defined(x01)) throw new Error("x01 is required.");
    if (!defined(y01)) throw new Error("y01 is required.");
    if (!defined(x10)) throw new Error("x10 is required.");
    if (!defined(y10)) throw new Error("y10 is required.");
    if (!defined(x11)) throw new Error("x11 is required.");
    if (!defined(y11)) throw new Error("y11 is required.");

    const numerator1A = (x11 - x10) * (y00 - y10) - (y11 - y10) * (x00 - x10);
    const numerator1B = (x01 - x00) * (y00 - y10) - (y01 - y00) * (x00 - x10);
    const denominator1 = (y11 - y10) * (x01 - x00) - (x11 - x10) * (y01 - y00);

    // If denominator = 0, then lines are parallel. If denominator = 0 and both numerators are 0, then coincident
    if (denominator1 === 0) {
        return undefined;
    }

    const ua1 = numerator1A / denominator1;
    const ub1 = numerator1B / denominator1;

    if (ua1 >= 0 && ua1 <= 1 && ub1 >= 0 && ub1 <= 1) {
        if (!defined(result)) {
            result = new THREE.Vector2();
        }

        result.x = x00 + ua1 * (x01 - x00);
        result.y = y00 + ua1 * (y01 - y00);

        return result;
    }

    return undefined;
}
