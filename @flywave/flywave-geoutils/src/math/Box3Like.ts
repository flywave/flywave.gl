/* Copyright (C) 2025 flywave.gl contributors */

import { type Vector3Like } from "./Vector3Like";

/**
 * An interface representing bounding box in world coordinates.
 */
export interface Box3Like {
    /**
     * The minimum position in world coordinates of this bounding box.
     */
    readonly min: Vector3Like;

    /**
     * The maximum position in world coordinates of this bounding box.
     */
    readonly max: Vector3Like;
}

/**
 * Returns true if the given object implements the {@link Box3Like} interface.
 *
 * @param object - A valid object.
 */
export function isBox3Like(object: {}): object is Box3Like {
    const box3 = object as Partial<Box3Like>;
    return box3.min !== undefined && box3.max !== undefined;
}
