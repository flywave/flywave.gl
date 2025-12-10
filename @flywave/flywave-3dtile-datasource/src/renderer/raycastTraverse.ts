/* Copyright (C) 2025 flywave.gl contributors */

import { type Intersection, type Raycaster, Ray, Vector3 } from "three";

import { type ITile, type Tile } from "../base/Tile";
import { type TilesRenderer } from "./TilesRenderer";

/**
 * Extended intersection result that includes the intersected tile
 *
 * This interface extends the standard Three.js Intersection interface
 * to include a reference to the tile that was intersected during raycasting.
 */
export type TileIntersection = Intersection & {
    /** The tile that was intersected */
    tile: Tile;
};

// Temporary variables for raycasting calculations
const _localRay = new Ray();
const _vec = new Vector3();
const _hitArray: TileIntersection[] = [];

/**
 * Sort function for intersections by distance (ascending)
 * @param a First intersection
 * @param b Second intersection
 * @returns Comparison result
 */
function distanceSort(a: Intersection, b: Intersection): number {
    return a.distance - b.distance;
}

/**
 * Intersects a ray with a tile's scene content
 *
 * This function performs raycasting against the 3D objects in a tile's scene
 * and converts the results to TileIntersection objects.
 *
 * @param tile The tile containing the scene
 * @param raycaster The raycaster to use
 * @param renderer The tiles renderer instance
 * @param intersects Array to store intersections
 */
function intersectTileScene(
    tile: ITile,
    raycaster: Raycaster,
    renderer: TilesRenderer,
    intersects: TileIntersection[]
): void {
    const { scene } = tile.cached;

    // Create temporary array to store intersections
    const tempIntersects: Intersection[] = [];
    raycaster.intersectObject(scene, true, tempIntersects);

    // Convert standard Intersection to TileIntersection and set tile property
    tempIntersects.forEach(intersect => {
        const tileIntersect: TileIntersection = {
            ...intersect,
            tile: tile as Tile
        };
        intersects.push(tileIntersect);
    });
}

/**
 * Finds the first hit when raycasting against a tile's scene
 *
 * This function finds the closest intersection when raycasting against
 * a single tile's scene content.
 *
 * @param tile The tile to test
 * @param raycaster The raycaster to use
 * @param renderer The tiles renderer instance
 * @returns The closest intersection or null if none found
 */
function intersectTileSceneFirstHit(
    tile: ITile,
    raycaster: Raycaster,
    renderer: TilesRenderer
): TileIntersection | null {
    intersectTileScene(tile, raycaster, renderer, _hitArray);
    _hitArray.sort(distanceSort);

    const hit = _hitArray[0] || null;
    _hitArray.length = 0; // Clear the temporary array
    return hit;
}

/**
 * Checks if a tile has been initialized
 *
 * This function determines if a tile has been properly initialized
 * by checking for the presence of the __used property.
 *
 * @param tile The tile to check
 * @returns Whether the tile is initialized
 */
function isTileInitialized(tile: any): boolean {
    return "__used" in tile;
}

/**
 * Finds the closest hit when traversing the tile hierarchy
 *
 * This function performs hierarchical raycasting against the tile hierarchy,
 * finding the closest intersection by traversing bounding volumes and
 * testing actual scene content only when necessary.
 *
 * @param renderer The tiles renderer instance
 * @param tile The root tile to start traversal from
 * @param raycaster The raycaster to use
 * @param localRay Pre-calculated local ray (optional)
 * @returns The closest intersection or null if none found
 */
export function raycastTraverseFirstHit(
    renderer: TilesRenderer,
    tile: ITile,
    raycaster: Raycaster,
    localRay: Ray | null = null
): TileIntersection | null {
    const { group, activeTiles } = renderer;

    // Transform ray to local group space if not provided
    if (localRay === null) {
        localRay = _localRay;
        localRay.copy(raycaster.ray).applyMatrix4(group.matrixWorldInverse);
    }

    // Find all child tiles that intersect the ray
    const potentialHits: Array<{ distance: number; tile: any }> = [];
    const children = tile.children;

    for (let i = 0, l = children.length; i < l; i++) {
        const child = children[i];
        if (!isTileInitialized(child) || !child.__used) {
            continue;
        }

        // Test intersection with child's bounding volume
        const boundingVolume = child.cached.boundingVolume;
        if (boundingVolume.intersectRay(localRay, _vec) !== null) {
            _vec.applyMatrix4(group.matrixWorld);
            potentialHits.push({
                distance: _vec.distanceToSquared(raycaster.ray.origin),
                tile: child
            });
        }
    }

    // Sort potential hits by distance (ascending)
    potentialHits.sort((a, b) => a.distance - b.distance);

    // Check the current tile if it's active
    let bestHit: TileIntersection | null = null;
    let bestHitDistSq = Infinity;

    if (activeTiles.has(tile)) {
        const hit = intersectTileSceneFirstHit(tile, raycaster, renderer);
        if (hit) {
            bestHit = hit;
            bestHit.tile = tile as Tile; // Ensure tile property is set
            bestHitDistSq = hit.distance * hit.distance;
        }
    }

    // Recursively check child tiles for closer hits
    for (let i = 0, l = potentialHits.length; i < l; i++) {
        const { distance: boundingVolumeDistSq, tile: childTile } = potentialHits[i];

        // Early exit if remaining tiles can't possibly be closer
        if (boundingVolumeDistSq > bestHitDistSq) {
            break;
        }

        const hit = raycastTraverseFirstHit(renderer, childTile, raycaster, localRay);
        if (hit) {
            const hitDistSq = hit.distance * hit.distance;
            if (hitDistSq < bestHitDistSq) {
                bestHit = hit;
                bestHit.tile = childTile; // Ensure tile property is set
                bestHitDistSq = hitDistSq;
            }
        }
    }

    return bestHit;
}

/**
 * Finds all intersections when traversing the tile hierarchy
 *
 * This function performs hierarchical raycasting against the tile hierarchy,
 * finding all intersections by traversing bounding volumes and
 * testing actual scene content.
 *
 * @param renderer The tiles renderer instance
 * @param tile The root tile to start traversal from
 * @param raycaster The raycaster to use
 * @param intersects Array to store intersections
 * @param localRay Pre-calculated local ray (optional)
 */
export function raycastTraverse(
    renderer: TilesRenderer,
    tile: ITile,
    raycaster: Raycaster,
    intersects: TileIntersection[],
    localRay: Ray | null = null
): void {
    // Skip uninitialized tiles
    if (!isTileInitialized(tile)) {
        return;
    }

    const { group, activeTiles } = renderer;
    const { boundingVolume } = tile.cached;

    // Transform ray to local group space if not provided
    if (localRay === null) {
        localRay = _localRay;
        localRay.copy(raycaster.ray).applyMatrix4(group.matrixWorldInverse);
    }

    // Skip unused tiles or those not intersecting the ray
    if (!tile.__used || !boundingVolume.intersectsRay(localRay)) {
        return;
    }

    // Check the tile's scene if it's active
    if (activeTiles.has(tile)) {
        const tileIntersects: TileIntersection[] = [];
        intersectTileScene(tile, raycaster, renderer, tileIntersects);

        // Set tile property for each intersection object
        tileIntersects.forEach(intersect => {
            intersect.tile = tile as Tile;
            intersects.push(intersect);
        });
    }

    // Recursively check child tiles
    const children = tile.children;
    for (let i = 0, l = children.length; i < l; i++) {
        raycastTraverse(renderer, children[i], raycaster, intersects, localRay);
    }
}
