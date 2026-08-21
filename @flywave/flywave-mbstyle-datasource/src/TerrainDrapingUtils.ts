import * as THREE from 'three';

/**
 * Build an orthographic camera that looks straight down at a terrain tile's
 * world bounds. Extracted as a standalone function so it can be unit-tested
 * without importing the full TerrainDraping class (which depends on MapView).
 *
 * The tile occupies [originX, originX+size] on X and [originY, originY+size]
 * on Z (originY is the Z coordinate, matching allDemTiles' convention).
 *
 * The camera's left/right/top/bottom are set so that the tile fills the full
 * FBO, and the resulting texture maps 1:1 onto the terrain mesh's vMapUv
 * (0..1) attribute.
 */
export function buildTileCamera(tile: {
    originX: number;
    originY: number;
    size: number;
}): THREE.OrthographicCamera | null {
    const { originX, originY, size } = tile;
    if (size <= 0) return null;

    const centerX = originX + size / 2;
    const centerY = originY + size / 2;

    // Camera looks down the Z axis (engine world is z-up: x = mercator X,
    // y = mercator Y, z = elevation). A camera looking down Y renders the
    // z-up scene edge-on and the bake comes out empty. The tile origins are
    // camera-relative (RTE, live mesh positions) — matching the
    // camera-relative tile objects rendered into the bake.
    const camera = new THREE.OrthographicCamera(
        originX,         // left
        originX + size,  // right
        originY + size,  // top (max Y)
        originY,         // bottom (min Y)
        1,               // near
        2000,            // far
    );
    camera.position.set(centerX, centerY, 1000);
    camera.lookAt(centerX, centerY, 0);
    camera.up.set(0, 1, 0);
    camera.updateProjectionMatrix();
    return camera;
}

/**
 * Heuristic: detect environment/overlay objects that should NOT appear in the
 * drape texture (terrain meshes are already hidden separately). These include
 * lights, fog/sky spheres, debug helpers.
 */
export function isEnvironmentObject(obj: THREE.Object3D): boolean {
    if ((obj as any).isLight) return true;
    if (obj.userData?.__mbEnvironment) return true;
    if ((obj as any).isLineSegments) return true;
    return false;
}
