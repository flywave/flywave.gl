/* Copyright (C) 2025 flywave.gl contributors */

import * as THREE from "three";

import { MapObjectAdapter } from "./MapObjectAdapter";

function intersectObject(
    object: THREE.Object3D,
    raycaster: PickingRaycaster,
    intersects: THREE.Intersection[],
    recursive?: boolean
) {
    if (object.layers.test(raycaster.layers) && object.visible) {
        const mapObjectAdapter = MapObjectAdapter.get(object);
        if (!mapObjectAdapter || mapObjectAdapter.isPickable()) {
            //@ts-ignore
            recursive = object.raycast(raycaster, intersects) === false ? false : recursive;
        }
    }

    if (recursive === true) {
        for (const child of object.children) {
            intersectObject(child, raycaster, intersects, true);
        }
    }
}

/**
 * Raycasting points is not supported as necessary in Three.js. This class extends a
 * [[THREE.Raycaster]] and adds the width / height of the canvas to allow picking of screen space
 * geometry.
 *
 * @internal
 */
export class PickingRaycaster extends THREE.Raycaster {
    /**
     * Constructor.
     *
     * @param canvasSize - the canvas width and height.
     */
    constructor(readonly canvasSize: THREE.Vector2) {
        super();
    }

    // FLYWAVE-9585: Override of base class method, however tslint doesn't recognize overrides of
    // three.js classes.
    intersectObject<TIntersected extends THREE.Object3D>(
        object: THREE.Object3D,
        recursive?: boolean,
        optionalTarget?: Array<THREE.Intersection<TIntersected>>
    ): Array<THREE.Intersection<TIntersected>> {
        const intersects: Array<THREE.Intersection<TIntersected>> = optionalTarget ?? [];

        intersectObject(object, this, intersects, recursive);

        return intersects;
    }

    // FLYWAVE-9585: Override of base class method, however tslint doesn't recognize overrides of
    // three.js classes.
    intersectObjects<TIntersected extends THREE.Object3D>(
        objects: THREE.Object3D[],
        recursive?: boolean,
        optionalTarget?: Array<THREE.Intersection<TIntersected>>
    ): Array<THREE.Intersection<TIntersected>> {
        const intersects: Array<THREE.Intersection<TIntersected>> = optionalTarget ?? [];

        for (const object of objects) {
            intersectObject(object, this, intersects, recursive);
        }

        return intersects;
    }
}
