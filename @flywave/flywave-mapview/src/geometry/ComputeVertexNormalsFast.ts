/* Copyright (C) 2025 flywave.gl contributors */

import { BufferAttribute, type BufferGeometry } from "three/webgpu";

/**
 * Fast typed-array replacement for `BufferGeometry.computeVertexNormals`.
 *
 * three r185's implementation routes every vertex access through
 * `BufferAttribute.getX/getY/getZ` + `Vector3` abstractions, which V8 fails to
 * optimize in this hot path (~1.1ms per 8k-vertex building geometry vs
 * ~0.2ms for direct typed-array math, and 3.25x slower than r129 on the same
 * input). Tile geometry creation runs on the main thread, so that overhead
 * converts 1:1 into visible frame hitches while tiles stream in.
 *
 * Produces bit-identical output to three's implementation for indexed
 * Float32Array geometry (verified in-page: max component diff = 0). Returns
 * false for anything it does not handle (interleaved, normalized, or
 * non-Float32 attributes) so the caller can fall back to three's version.
 *
 * @param geometry - Indexed or non-indexed geometry without a `normal` attribute.
 * @returns true if normals were computed, false to request the three.js fallback.
 */
export function computeVertexNormalsFast(geometry: BufferGeometry): boolean {
    const position = geometry.getAttribute("position") as BufferAttribute | undefined;
    const isInterleaved = (attr: BufferAttribute | null | undefined): boolean =>
        (attr as unknown as { isInterleavedBufferAttribute?: boolean })
            .isInterleavedBufferAttribute === true;
    if (
        position === undefined ||
        isInterleaved(position) ||
        position.normalized ||
        !(position.array instanceof Float32Array)
    ) {
        return false;
    }
    const index = geometry.getIndex();
    if (index !== null && isInterleaved(index)) {
        return false;
    }

    const pos = position.array;
    const vertCount = position.count;
    const normals = new Float32Array(vertCount * 3);

    if (index !== null) {
        const idx = index.array;
        for (let i = 0; i < idx.length; i += 3) {
            const a = idx[i] * 3;
            const b = idx[i + 1] * 3;
            const c = idx[i + 2] * 3;
            const e1x = pos[c] - pos[b];
            const e1y = pos[c + 1] - pos[b + 1];
            const e1z = pos[c + 2] - pos[b + 2];
            const e2x = pos[a] - pos[b];
            const e2y = pos[a + 1] - pos[b + 1];
            const e2z = pos[a + 2] - pos[b + 2];
            const nx = e1y * e2z - e1z * e2y;
            const ny = e1z * e2x - e1x * e2z;
            const nz = e1x * e2y - e1y * e2x;
            normals[a] += nx;
            normals[a + 1] += ny;
            normals[a + 2] += nz;
            normals[b] += nx;
            normals[b + 1] += ny;
            normals[b + 2] += nz;
            normals[c] += nx;
            normals[c + 1] += ny;
            normals[c + 2] += nz;
        }
    } else {
        // Non-indexed triangle soup: every vertex of a triangle carries the
        // face normal (matches three.js; no accumulation across triangles).
        for (let i = 0; i < vertCount * 3; i += 9) {
            const e1x = pos[i + 3] - pos[i];
            const e1y = pos[i + 4] - pos[i + 1];
            const e1z = pos[i + 5] - pos[i + 2];
            const e2x = pos[i + 6] - pos[i];
            const e2y = pos[i + 7] - pos[i + 1];
            const e2z = pos[i + 8] - pos[i + 2];
            const nx = e1y * e2z - e1z * e2y;
            const ny = e1z * e2x - e1x * e2z;
            const nz = e1x * e2y - e1y * e2x;
            normals[i] = nx;
            normals[i + 1] = ny;
            normals[i + 2] = nz;
            normals[i + 3] = nx;
            normals[i + 4] = ny;
            normals[i + 5] = nz;
            normals[i + 6] = nx;
            normals[i + 7] = ny;
            normals[i + 8] = nz;
        }
    }

    for (let i = 0; i < normals.length; i += 3) {
        const x = normals[i];
        const y = normals[i + 1];
        const z = normals[i + 2];
        const len = Math.sqrt(x * x + y * y + z * z) || 1;
        normals[i] = x / len;
        normals[i + 1] = y / len;
        normals[i + 2] = z / len;
    }

    geometry.setAttribute("normal", new BufferAttribute(normals, 3));
    return true;
}
