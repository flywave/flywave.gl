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
export function buildTileCamera(
    tile: {
        originX: number;
        originY: number;
        size: number;
    },
    camPos?: { x: number; y: number; z: number } | null,
): THREE.OrthographicCamera | null {
    const { originX, originY, size } = tile;
    if (size <= 0) return null;

    // §139 root cause of the "zero fragments" bake (§12.76-58): the SCENE
    // objects are camera-RELATIVE (RTE — the engine repositions tile content
    // against the live camera every frame), while the tile bounds are in
    // WORLD coordinates (allDemTiles is world-space since §117). An ortho
    // camera placed at world coords (~6.4M) looking at ±300-relative objects
    // has NOTHING in its frustum. Shift the camera into the camera-relative
    // frame to match what renderer.render actually draws.
    const cx = camPos?.x ?? 0;
    const cy = camPos?.y ?? 0;
    const left = originX - cx;
    const right = left + size;
    const bottom = originY - cy;
    const top = bottom + size;
    const centerX = (left + right) / 2;
    const centerY = (bottom + top) / 2;

    // Camera looks down the Z axis (engine world is z-up: x = mercator X,
    // y = mercator Y, z = elevation). A camera looking down Y renders the
    // z-up scene edge-on and the bake comes out empty.
    // §280: generous z window — terrain-exaggerated content (extrusions
    // lifted onto a ×4 DEM reach z≈1000+) must stay inside the bake frustum.
    // §499: far=12000 CLIPPED the DEM-displaced raster fills wholesale —
    // the fill vertex shader lifts vertices by a DEM sample that can read
    // the −10000m edge value (mis-mapped UV under the ortho bake camera),
    // putting them ~10km below the surface and far beyond 6000+12000. With
    // a top-down ortho camera z displacement does not move x/y, so a huge
    // far only sacrifices depth precision (irrelevant — the drape blends
    // by alpha, depth merely orders coincident surfaces).
    const camera = new THREE.OrthographicCamera(
        left, right, top, bottom,
        1,
        1000000,
    );
    camera.position.set(centerX, centerY, 6000);
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
