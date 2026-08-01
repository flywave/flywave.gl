import * as THREE from 'three';

/**
 * Simplified elevated structures (guardrails/walls) geometry builder.
 *
 * For elevated road polygons, generates vertical walls along the polygon's
 * boundary edges — simulating guardrails/bridge walls. This is a simplified
 * version of mapbox's ElevatedStructures.constructBridgeStructures().
 *
 * Algorithm:
 * 1. Extract boundary edges from the triangulated footprint mesh (edges that
 *    appear in only one triangle = exterior boundary).
 * 2. For each boundary edge, extrude a vertical wall from the road surface
 *    elevation down to ground level (or a fixed guardrail height).
 */

/**
 * Build guardrail wall geometry from a fill polygon's triangulated mesh.
 *
 * @param positions Float32Array of vertex positions (x,y,z) in world space
 * @param index Uint32Array of triangle indices
 * @param elevation The road's elevation (Z height above ground)
 * @param wallHeight Wall height from ground (default: full elevation = wall to ground)
 * @returns BufferGeometry with the wall geometry, or null if no boundary edges
 */
export function buildGuardrailGeometry(
    positions: Float32Array | ArrayLike<number>,
    index: Uint32Array | ArrayLike<number> | null,
    elevation: number,
    wallHeight?: number,
): THREE.BufferGeometry | null {
    if (!index || (index as any).length === 0 || elevation <= 0) return null;

    // Step 1: Find boundary edges (edges in exactly one triangle).
    const edgeMap = new Map<string, { a: number; b: number; count: number }>();
    const idxArr = index as ArrayLike<number>;

    const edgeKey = (a: number, b: number): string => {
        return a < b ? `${a}_${b}` : `${b}_${a}`;
    };

    const triCount = idxArr.length / 3;
    for (let t = 0; t < triCount; t++) {
        const i0 = idxArr[t * 3];
        const i1 = idxArr[t * 3 + 1];
        const i2 = idxArr[t * 3 + 2];
        for (const [a, b] of [[i0, i1], [i1, i2], [i2, i0]] as const) {
            const key = edgeKey(a, b);
            const existing = edgeMap.get(key);
            if (existing) {
                existing.count++;
            } else {
                edgeMap.set(key, { a, b, count: 1 });
            }
        }
    }

    // Collect boundary edges (count === 1).
    const boundaryEdges: Array<{ a: number; b: number }> = [];
    for (const edge of edgeMap.values()) {
        if (edge.count === 1) {
            boundaryEdges.push({ a: edge.a, b: edge.b });
        }
    }

    if (boundaryEdges.length === 0) return null;

    // Step 2: Build wall geometry for each boundary edge.
    const wallBottom = wallHeight !== undefined ? Math.max(0, elevation - wallHeight) : 0;
    const wallTop = elevation;

    const wallPositions: number[] = [];
    const wallIndices: number[] = [];

    let vOffset = 0;
    for (const { a, b } of boundaryEdges) {
        const ax = positions[a * 3];
        const ay = positions[a * 3 + 1];
        const bx = positions[b * 3];
        const by = positions[b * 3 + 1];

        // 4 vertices: top-a, bottom-a, bottom-b, top-b
        // Note: in flywave's coordinate system, Z is up (elevation).
        // The XY plane is the map surface.
        const i0 = vOffset;     // top-a
        const i1 = vOffset + 1; // bottom-a
        const i2 = vOffset + 2; // bottom-b
        const i3 = vOffset + 3; // top-b

        wallPositions.push(
            ax, ay, wallTop,    // top-a
            ax, ay, wallBottom, // bottom-a
            bx, by, wallBottom, // bottom-b
            bx, by, wallTop,    // top-b
        );

        // Two triangles (front face).
        wallIndices.push(i0, i1, i2, i0, i2, i3);
        // Back face (reversed winding for double-sided visibility).
        wallIndices.push(i0, i2, i1, i0, i3, i2);

        vOffset += 4;
    }

    const geom = new THREE.BufferGeometry();
    geom.setAttribute('position', new THREE.Float32BufferAttribute(wallPositions, 3));
    geom.setIndex(wallIndices);
    geom.computeVertexNormals();
    return geom;
}

/**
 * Create guardrail meshes for an elevated road polygon.
 *
 * @param mesh The road's THREE.Mesh (extruded-polygon with _hdElevation)
 * @param elevation The road's elevation
 * @param color Wall color (default: gray)
 * @returns THREE.Mesh with guardrail geometry, or null
 */
export function createGuardrailMesh(
    mesh: THREE.Mesh,
    elevation: number,
    color: string = '#666666',
): THREE.Mesh | null {
    const geom = mesh.geometry as THREE.BufferGeometry;
    if (!geom || !geom.attributes.position) return null;

    const positions = geom.attributes.position.array as Float32Array;
    const index = geom.index ? (geom.index.array as Uint32Array) : null;

    const wallGeom = buildGuardrailGeometry(positions, index, elevation);
    if (!wallGeom) return null;

    const material = new THREE.MeshStandardMaterial({
        color: new THREE.Color(color),
        side: THREE.DoubleSide,
        roughness: 0.8,
        metalness: 0.0,
    });

    const wallMesh = new THREE.Mesh(wallGeom, material);
    // Copy world transform from the road mesh.
    wallMesh.position.copy(mesh.position);
    wallMesh.rotation.copy(mesh.rotation);
    wallMesh.scale.copy(mesh.scale);
    wallMesh.renderOrder = mesh.renderOrder + 1;
    return wallMesh;
}
