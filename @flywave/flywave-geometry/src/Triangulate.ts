import { FlatArray } from "@flywave/flywave-utils";
import * as THREE from "three";

import { cdt } from "./Delaunay";

export function triangulate(polygon: THREE.Vector3[]): {
    positions: THREE.Vector3[];
    indices: number[][];
} {
    if (polygon.length < 3) {
        throw new Error("Polygon needs at least three points");
    }

    // Calculate polygon normal using Three.js methods
    const normal = computePolygonNormal(polygon);
    if (normal.length() < 1e-6) {
        throw new Error("Polygon is not planar");
    }

    // Build local coordinate system
    const origin = polygon[0].clone();
    const basis1 = new THREE.Vector3().subVectors(polygon[1], origin).normalize();
    const temp = new THREE.Vector3().subVectors(polygon[2], origin);
    let basis2: THREE.Vector3;

    // Calculate perpendicular component using Three.js methods
    const perp = new THREE.Vector3().copy(temp).addScaledVector(basis1, -temp.dot(basis1));
    const perpLength = perp.length();

    if (perpLength > 1e-6) {
        basis2 = perp.normalize();
    } else {
        // Try other points to build coordinate system
        for (let i = 3; i < polygon.length; i++) {
            const altPoint = new THREE.Vector3().subVectors(polygon[i], origin);
            const altPerp = new THREE.Vector3()
                .copy(altPoint)
                .addScaledVector(basis1, -altPoint.dot(basis1));
            if (altPerp.length() > 1e-6) {
                basis2 = altPerp.normalize();
                break;
            }
        }
        if (!basis2) {
            throw new Error("All points are collinear");
        }
    }

    // Generate 2D projection coordinates
    const flatArray = polygon.flatMap(p => {
        const rel = new THREE.Vector3().subVectors(p, origin);
        return [rel.dot(basis1), rel.dot(basis2)];
    });

    const positions = FlatArray.create<number>({ array: flatArray, itemSize: 2 });

    // Add all polygon edges as constraints
    const constraintEdges = [];
    for (let i = 0; i < polygon.length; i++) {
        constraintEdges.push(i, (i + 1) % polygon.length);
    }

    const findices = FlatArray.create<number>({
        array: constraintEdges,
        itemSize: 2
    });

    // Perform triangulation
    const result = cdt({
        positions,
        indices: findices
    });

    // Convert to 3D indices
    const indices2D = result.indices.array;
    const indices: number[][] = [];
    for (let i = 0; i < indices2D.length; i += 3) {
        indices.push([indices2D[i], indices2D[i + 1], indices2D[i + 2]]);
    }

    return {
        positions: polygon, // Keep original 3D coordinates
        indices
    };
}

// Polygon normal calculation using Three.js methods
function computePolygonNormal(poly: THREE.Vector3[]): THREE.Vector3 {
    const normal = new THREE.Vector3();
    const p0 = poly[0];

    for (let i = 1; i < poly.length - 1; i++) {
        const v1 = new THREE.Vector3().subVectors(poly[i], p0);
        const v2 = new THREE.Vector3().subVectors(poly[i + 1], p0);
        normal.add(new THREE.Vector3().crossVectors(v1, v2));
    }

    return normal.normalize();
}
