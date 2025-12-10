/* Copyright (C) 2025 flywave.gl contributors */

import { Vector2 } from "three";

export type GeomEdge = [Vector2, Vector2];

// All Point methods are already available in Vector2, so we can use Vector2 directly

export function cross(vec0: Vector2, vec1: Vector2): number {
    return vec0.x * vec1.y - vec0.y * vec1.x;
}

export function barycentricCoordTriangle(p: Vector2, pt0: Vector2, pt1: Vector2, pt2: Vector2) {
    const vec0 = new Vector2().subVectors(pt1, pt0);
    const vec1 = new Vector2().subVectors(pt2, pt0);
    const vec2 = new Vector2().subVectors(p, pt0);

    const d00 = vec0.dot(vec0);
    const d01 = vec0.dot(vec1);
    const d11 = vec1.dot(vec1);
    const d20 = vec2.dot(vec0);
    const d21 = vec2.dot(vec1);
    const denom = d00 * d11 - d01 * d01;
    const s = (d11 * d20 - d01 * d21) / denom;
    const t = (d00 * d21 - d01 * d20) / denom;
    const u = 1.0 - s - t;

    return { s, t, u };
}

export function isEdgeIntersecting(edgeA: GeomEdge, edgeB: GeomEdge): boolean {
    const vecA0A1 = new Vector2().subVectors(edgeA[1], edgeA[0]);
    const vecA0B0 = new Vector2().subVectors(edgeB[0], edgeA[0]);
    const vecA0B1 = new Vector2().subVectors(edgeB[1], edgeA[0]);

    const AxB0 = cross(vecA0A1, vecA0B0);
    const AxB1 = cross(vecA0A1, vecA0B1);

    // Check if endpoints of edgeB are on same side of edgeA
    if ((AxB0 > 0 && AxB1 > 0) || (AxB0 < 0 && AxB1 < 0)) {
        return false;
    }

    const vecB0B1 = new Vector2().subVectors(edgeB[1], edgeB[0]);
    const vecB0A0 = new Vector2().subVectors(edgeA[0], edgeB[0]);
    const vecB0A1 = new Vector2().subVectors(edgeA[1], edgeB[0]);

    const BxA0 = cross(vecB0B1, vecB0A0);
    const BxA1 = cross(vecB0B1, vecB0A1);

    // Check if endpoints of edgeA are on same side of edgeB
    if ((BxA0 > 0 && BxA1 > 0) || (BxA0 < 0 && BxA1 < 0)) {
        return false;
    }

    // Special case of colinear edges
    if (Math.abs(AxB0) < 1e-14 && Math.abs(AxB1) < 1e-14) {
        // Separated in x
        if (
            Math.max(edgeB[0].x, edgeB[1].x) < Math.min(edgeA[0].x, edgeA[1].x) ||
            Math.min(edgeB[0].x, edgeB[1].x) > Math.max(edgeA[0].x, edgeA[1].x)
        ) {
            return false;
        }

        // Separated in y
        if (
            Math.max(edgeB[0].y, edgeB[1].y) < Math.min(edgeA[0].y, edgeA[1].y) ||
            Math.min(edgeB[0].y, edgeB[1].y) > Math.max(edgeA[0].y, edgeA[1].y)
        ) {
            return false;
        }
    }

    return true;
}

export function isEdgeIntersectingAtEndpoint(edgeA: GeomEdge, edgeB: GeomEdge): boolean {
    const rsq_tol = 1e-13;
    if (edgeA[0].distanceToSquared(edgeB[0]) < rsq_tol) {
        return true;
    }

    if (edgeA[0].distanceToSquared(edgeB[1]) < rsq_tol) {
        return true;
    }

    if (edgeA[1].distanceToSquared(edgeB[0]) < rsq_tol) {
        return true;
    }

    if (edgeA[1].distanceToSquared(edgeB[1]) < rsq_tol) {
        return true;
    }

    return false;
}

export function isQuadConvex(p0: Vector2, p1: Vector2, p2: Vector2, p3: Vector2): boolean {
    const diag0: GeomEdge = [p0.clone(), p2.clone()];
    const diag1: GeomEdge = [p1.clone(), p3.clone()];
    return isEdgeIntersecting(diag0, diag1);
}

export function getCircumcenter(p0: Vector2, p1: Vector2, p2: Vector2): Vector2 {
    const d = 2 * (p0.x * (p1.y - p2.y) + p1.x * (p2.y - p0.y) + p2.x * (p0.y - p1.y));

    const p0_mag = p0.x * p0.x + p0.y * p0.y;
    const p1_mag = p1.x * p1.x + p1.y * p1.y;
    const p2_mag = p2.x * p2.x + p2.y * p2.y;

    const xc = (p0_mag * (p1.y - p2.y) + p1_mag * (p2.y - p0.y) + p2_mag * (p0.y - p1.y)) / d;
    const yc = (p0_mag * (p2.x - p1.x) + p1_mag * (p0.x - p2.x) + p2_mag * (p1.x - p0.x)) / d;

    return new Vector2(xc, yc);
}

export function getPointOrientation(edge: GeomEdge, p: Vector2): number {
    const vec_edge01 = new Vector2().subVectors(edge[1], edge[0]);
    const vec_edge0_to_p = new Vector2().subVectors(p, edge[0]);
    return cross(vec_edge01, vec_edge0_to_p);
}
