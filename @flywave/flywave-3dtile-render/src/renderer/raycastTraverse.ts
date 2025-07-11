import { Matrix4, Sphere, Ray, Vector3, Object3D, Intersection, Raycaster } from "three";
import { Tile } from "../base/Tile";
import { TileIntersection } from "./TilesRenderer";

// Reusable objects to avoid memory allocation
const _sphere = new Sphere();
const _mat = new Matrix4();
const _vec = new Vector3();
const _vec2 = new Vector3();
const _ray = new Ray();
const _hitArray: TileIntersection[] = [];

interface HitData {
    distance: number;
    tile: Tile;
}

/**
 * Sort function for intersections by distance (ascending)
 */
function distanceSort(a: Intersection | HitData, b: Intersection | HitData): number {
    return a.distance - b.distance;
}

/**
 * Intersects a ray with all objects in a tile's scene
 * @param scene - The 3D scene to test against
 * @param raycaster - The raycaster containing the ray to test
 * @param intersects - Array to store intersection results
 * @param tile - The tile being intersected
 */
function intersectTileScene(
    scene: Object3D,
    raycaster: Raycaster,
    intersects: TileIntersection[],
    tile: Tile
): void {
    scene.traverse((child: Object3D) => {
        Object.getPrototypeOf(child).raycast.call(child, raycaster, intersects);
    });
}

/**
 * Traverses the tile hierarchy and returns the first hit with a ray
 * @param root - The root tile to start traversal from
 * @param group - The parent group containing the tiles
 * @param activeTiles - Set of currently active tiles
 * @param raycaster - The raycaster containing the ray to test
 * @returns The closest intersection or null if no intersection found
 */
export function raycastTraverseFirstHit(
    root: Tile,
    group: Object3D,
    activeTiles: Set<Tile>,
    raycaster: Raycaster
): TileIntersection | null {
    // If the root tile is active, check for intersections directly
    if (activeTiles.has(root)) {
        intersectTileScene(root.cached.scene, raycaster, _hitArray, root);

        if (_hitArray.length > 0) {
            // Sort hits by distance if there are multiple
            if (_hitArray.length > 1) {
                _hitArray.sort(distanceSort);
            }

            const result = _hitArray[0];
            _hitArray.length = 0; // Clear the array for reuse
            return result;
        }
        return null;
    }

    const potentialHits: HitData[] = [];
    const children = root.children || [];

    // Check each child tile for potential intersections
    for (let i = 0, l = children.length; i < l; i++) {
        const tile = children[i];
        const cached = tile.cached;
        const groupMatrixWorld = group.matrixWorld;

        _mat.copy(groupMatrixWorld);

        // Check sphere intersection if available
        const sphere = cached.sphere;
        if (sphere) {
            _sphere.copy(sphere);
            _sphere.applyMatrix4(_mat);
            if (!raycaster.ray.intersectsSphere(_sphere)) {
                continue;
            }
        }

        // Check oriented box intersection if available
        const orientedBox = cached.orientedBox;
        if (orientedBox) {
            _ray.copy(raycaster.ray);
            _ray.applyMatrix4(_mat);
            if (orientedBox.intersectsRay(_ray, _vec)) {
                // Calculate inverse scale for distance correction
                _vec2.setFromMatrixScale(_mat);
                const invScale = _vec2.x;

                if (Math.abs(Math.max(_vec2.x - _vec2.y, _vec2.x - _vec2.z)) > 1e-6) {
                    console.warn(
                        "ThreeTilesRenderer: Non-uniform scale used for tile which may cause issues when raycasting."
                    );
                }

                // Store potential hit data
                potentialHits.push({
                    distance: _vec.distanceToSquared(_ray.origin) * invScale * invScale,
                    tile: tile
                });
            }
        }
    }

    // Sort potential hits by distance
    potentialHits.sort(distanceSort);

    let bestDistanceSquared = Infinity;
    let bestHit: TileIntersection | null = null;

    // Check each potential hit in order of distance
    for (let i = 0, l = potentialHits.length; i < l; i++) {
        const hitData = potentialHits[i];
        const distanceSquared = hitData.distance;

        // Early exit if remaining hits are further than current best
        if (distanceSquared > bestDistanceSquared) {
            break;
        }

        const tile = hitData.tile;
        let hit: Intersection | null = null;

        if (activeTiles.has(tile)) {
            // If tile is active, check for intersections directly
            intersectTileScene(tile.cached.scene, raycaster, _hitArray, tile);
            if (_hitArray.length > 0) {
                if (_hitArray.length > 1) {
                    _hitArray.sort(distanceSort);
                }
                hit = _hitArray[0];
            }
        } else {
            // Recursively check child tiles
            hit = raycastTraverseFirstHit(tile, group, activeTiles, raycaster);
        }

        if (hit) {
            const hitDistanceSquared = hit.distance * hit.distance;
            if (hitDistanceSquared < bestDistanceSquared) {
                bestDistanceSquared = hitDistanceSquared;
                bestHit = hit as TileIntersection;
                bestHit.tile = tile;
            }
            _hitArray.length = 0; // Clear the array for reuse
        }
    }

    return bestHit;
}

/**
 * Traverses the tile hierarchy and collects all intersections with a ray
 * @param tile - The tile to start traversal from
 * @param group - The parent group containing the tiles
 * @param activeTiles - Set of currently active tiles
 * @param raycaster - The raycaster containing the ray to test
 * @param intersects - Array to store all intersection results
 */
export function raycastTraverse(
    tile: Tile,
    group: Object3D,
    activeTiles: Set<Tile>,
    raycaster: Raycaster,
    intersects: TileIntersection[]
): void {
    const cached = tile.cached;
    _mat.identity();

    // Check sphere intersection if available
    const sphere = cached.sphere;
    if (sphere) {
        _sphere.copy(sphere);
        if (!raycaster.ray.intersectsSphere(_sphere)) {
            return;
        }
    }

    // Check oriented box intersection if available
    const orientedBox = cached.orientedBox;
    if (orientedBox) {
        _ray.copy(raycaster.ray);
        if (!orientedBox.intersectsRay(_ray)) {
            return;
        }
    }

    // If tile is active, collect all intersections in its scene
    if (activeTiles.has(tile)) {
        const localIntersects: TileIntersection[] = [];
        intersectTileScene(cached.scene, raycaster, localIntersects, tile);

        // Annotate intersections with the tile reference
        localIntersects.forEach(intersection => {
            intersection.tile = tile;
            intersects.push(intersection);
        });
        return;
    }

    // Recursively check child tiles
    const children = tile.children || [];
    for (let i = 0, l = children.length; i < l; i++) {
        raycastTraverse(children[i], group, activeTiles, raycaster, intersects);
    }
}
