import { Matrix4, Sphere, Ray, Vector3, Object3D, Intersection, Raycaster } from "three";
import { Tile } from "../base/tile";

const _sphere = new Sphere();
const _mat = new Matrix4();
const _vec = new Vector3();
const _vec2 = new Vector3();
const _ray = new Ray();

const _hitArray: Intersection[] = [];

interface HitData {
    distance: number;
    tile: Tile;
}

function distanceSort(a: Intersection | HitData, b: Intersection | HitData): number {
    return a.distance - b.distance;
}

/**
 * 与瓦片场景进行相交测试
 */
function intersectTileScene(
    scene: Object3D,
    raycaster: Raycaster,
    intersects: Intersection[]
): void {
    scene.traverse((c: Object3D) => {
        Object.getPrototypeOf(c).raycast.call(c, raycaster, intersects);
    });
}

export function raycastTraverseFirstHit(
    root: Tile,
    group: Object3D,
    activeTiles: Set<Tile>,
    raycaster: Raycaster
): Intersection | null {
    if (activeTiles.has(root)) {
        intersectTileScene(root.cached.scene, raycaster, _hitArray);

        if (_hitArray.length > 0) {
            if (_hitArray.length > 1) {
                _hitArray.sort(distanceSort);
            }

            const res = _hitArray[0];
            _hitArray.length = 0;
            return res;
        } else {
            return null;
        }
    }

    const array: HitData[] = [];
    const children = root.children || [];

    for (let i = 0, l = children.length; i < l; i++) {
        const tile = children[i];
        const cached = tile.cached;
        const groupMatrixWorld = group.matrixWorld;

        _mat.copy(groupMatrixWorld);

        const sphere = cached.sphere;
        if (sphere) {
            _sphere.copy(sphere);
            _sphere.applyMatrix4(_mat);
            if (!raycaster.ray.intersectsSphere(_sphere)) {
                continue;
            }
        }

        const boundingBox = cached.box;
        const obbMat = cached.boxTransform;
        if (boundingBox && obbMat) {
            _mat.multiply(obbMat).invert();
            _ray.copy(raycaster.ray);
            _ray.applyMatrix4(_mat);
            if (_ray.intersectBox(boundingBox, _vec)) {
                let invScale: number;
                _vec2.setFromMatrixScale(_mat);
                invScale = _vec2.x;

                if (Math.abs(Math.max(_vec2.x - _vec2.y, _vec2.x - _vec2.z)) > 1e-6) {
                    console.warn(
                        "ThreeTilesRenderer: Non uniform scale used for tile which may cause issues when raycasting."
                    );
                }

                const data: HitData = {
                    distance: Infinity,
                    tile: tile
                };
                array.push(data);

                data.distance = _vec.distanceToSquared(_ray.origin) * invScale * invScale;
            } else {
                continue;
            }
        }
    }

    array.sort(distanceSort);

    let bestDistanceSquared = Infinity;
    let bestHit: Intersection | null = null;

    for (let i = 0, l = array.length; i < l; i++) {
        const data = array[i];
        const distanceSquared = data.distance;
        if (distanceSquared > bestDistanceSquared) {
            break;
        } else {
            const tile = data.tile;
            const scene = tile.cached.scene;

            let hit: Intersection | null = null;
            if (activeTiles.has(tile)) {
                intersectTileScene(scene, raycaster, _hitArray);
                if (_hitArray.length > 0) {
                    if (_hitArray.length > 1) {
                        _hitArray.sort(distanceSort);
                    }
                    hit = _hitArray[0];
                }
            } else {
                hit = raycastTraverseFirstHit(tile, group, activeTiles, raycaster);
            }

            if (hit) {
                const hitDistanceSquared = hit.distance * hit.distance;
                if (hitDistanceSquared < bestDistanceSquared) {
                    bestDistanceSquared = hitDistanceSquared;
                    bestHit = hit;
                }
                _hitArray.length = 0;
            }
        }
    }

    return bestHit;
}

export function raycastTraverse(
    tile: Tile,
    group: Object3D,
    activeTiles: Set<Tile>,
    raycaster: Raycaster,
    intersects: Intersection[]
): void {
    const cached = tile.cached;
    const groupMatrixWorld = group.matrixWorld;

    _mat.identity();

    const sphere = cached.sphere;
    if (sphere) {
        _sphere.copy(sphere);
        if (!raycaster.ray.intersectsSphere(_sphere)) {
            return;
        }
    }

    const boundingBox = cached.box;
    const obbMat = cached.boxTransform;
    if (boundingBox && obbMat) {
        _mat.multiply(obbMat).invert();
        _ray.copy(raycaster.ray).applyMatrix4(_mat);
        if (!_ray.intersectsBox(boundingBox)) {
            return;
        }
    }

    const scene = cached.scene;
    if (activeTiles.has(tile)) {
        intersectTileScene(scene, raycaster, intersects);
        return;
    }

    const children = tile.children || [];
    for (let i = 0, l = children.length; i < l; i++) {
        raycastTraverse(children[i], group, activeTiles, raycaster, intersects);
    }
}
