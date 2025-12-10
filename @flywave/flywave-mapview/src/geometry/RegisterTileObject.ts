/* Copyright (C) 2025 flywave.gl contributors */

import { type GeometryKind, type GeometryKindSet } from "@flywave/flywave-datasource-protocol";
import type * as THREE from "three";

import { type MapObjectAdapterParams, MapObjectAdapter } from "../MapObjectAdapter";
import { type Tile } from "../Tile";

/**
 * Adds a THREE object to the root of the tile and register [[MapObjectAdapter]].
 *
 * Sets the owning tiles datasource.name and the `tileKey` in the `userData` property of the
 * object, such that the tile it belongs to can be identified during picking.
 *
 * @param tile - The {@link Tile} to add the object to.
 * @param object - The object to add to the root of the tile.
 * @param geometryKind - The kind of object. Can be used for filtering.
 * @param mapAdapterParams - additional parameters for [[MapObjectAdapter]]
 */
export function registerTileObject(
    tile: Tile,
    object: THREE.Object3D,
    geometryKind: GeometryKind | GeometryKindSet | undefined,
    mapAdapterParams?: MapObjectAdapterParams
) {
    const kind =
        geometryKind instanceof Set
            ? Array.from((geometryKind as GeometryKindSet).values())
            : Array.isArray(geometryKind)
            ? geometryKind
            : [geometryKind];

    MapObjectAdapter.create(object, {
        dataSource: tile.dataSource,
        kind,
        level: tile.tileKey.level,
        ...mapAdapterParams
    });

    // TODO legacy fields, encoded directly in `userData to be removed
    if (object.userData === undefined) {
        object.userData = {};
    }

    const userData = object.userData;
    userData.tileKey = tile.tileKey;
    userData.dataSource = tile.dataSource.name;

    userData.kind = kind;

    // Force a visibility check of all objects.
    tile.resetVisibilityCounter();
}
