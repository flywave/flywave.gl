/* Copyright (C) 2025 flywave.gl contributors */

import * as THREE from "three";

import { type GeoBox } from "../coordinates/GeoBox";
import { GeoCoordinates } from "../coordinates/GeoCoordinates";
import { type GeoCoordinatesLike } from "../coordinates/GeoCoordinatesLike";
import { type Box3Like } from "../math/Box3Like";
import { type Vector3Like } from "../math/Vector3Like";
import { type Projection } from "../projection/Projection";
import { type SubdivisionScheme } from "./SubdivisionScheme";
import { type TileKey } from "./TileKey";
import { type TilingScheme } from "./TilingScheme";

/**
 * `FlatTileBoundingBoxGenerator` generates bounding boxes in world and geo coordinates for a given
 * TilingScheme.
 */
export class FlatTileBoundingBoxGenerator {
    private readonly m_tilingScheme: TilingScheme;
    private readonly m_worldDimensions: Vector3Like;
    private readonly m_worldBox: Box3Like;
    /**
     * Creates a new `FlatTileBoundingBoxGenerator` that can generate bounding boxes for the given
     * TilingScheme.
     *
     * @param tilingScheme - The {@link TilingScheme} used to compute bounding boxes.
     * @param minElevation - The minimum elevation in meters.
     * @param maxElevation - The maximum elevation in meters.
     */
    constructor(
        readonly tilingScheme: TilingScheme,
        readonly minElevation: number = 0,
        readonly maxElevation: number = 0
    ) {
        this.m_tilingScheme = tilingScheme;
        this.m_worldBox = tilingScheme.projection.worldExtent(minElevation, maxElevation);
        const { min, max } = this.m_worldBox;
        this.m_worldDimensions = { x: max.x - min.x, y: max.y - min.y, z: max.z - min.z };
    }

    /**
     * Returns the {@link Projection} of the {@link TilingScheme}.
     */
    get projection(): Projection {
        return this.m_tilingScheme.projection;
    }

    /**
     * Returns the {@link SubdivisionScheme} of the {@link TilingScheme}.
     */
    get subdivisionScheme(): SubdivisionScheme {
        return this.m_tilingScheme.subdivisionScheme;
    }

    private calculateTileOrigin(tileKey: TileKey): {
        originX: number;
        originY: number;
        sizeX: number;
        sizeY: number;
    } {
        const level = tileKey.level;
        const levelDimensionX = this.subdivisionScheme.getLevelDimensionX(level);
        const levelDimensionY = this.subdivisionScheme.getLevelDimensionY(level);

        const sizeX = this.m_worldDimensions.x / levelDimensionX;
        const sizeY = this.m_worldDimensions.y / levelDimensionY;
        const originX = this.m_worldBox.min.x + sizeX * tileKey.column;
        const originY = this.m_worldBox.min.y + sizeY * tileKey.row;

        return { originX, originY, sizeX, sizeY };
    }
    /**
     * Returns the bounding box in world coordinates of the given {@link TileKey}.
     *
     * Example:
     * ```typescript
     * const worldBounds = new THREE.Box3();
     * generator.getWorldBox(geoBox, worldBounds);
     * console.log(worldBounds.getCenter());
     * ```
     *
     * @param tileKey - The TileKey.
     * @param result - The optional object used to store the resulting bounding box in world
     * coordinates.
     */

    getWorldBox(tileKey: TileKey, result?: Box3Like): Box3Like {
        const { originX, originY, sizeX, sizeY } = this.calculateTileOrigin(tileKey);

        if (!result) {
            result = new THREE.Box3();
        }

        result.min.x = originX;
        result.min.y = originY;
        result.min.z = this.m_worldBox.min.z;
        result.max.x = originX + sizeX;
        result.max.y = originY + sizeY;
        result.max.z = this.m_worldBox.max.z;
        return result;
    }

    getTileKeyWorldOrigin(tileKey: TileKey, result?: Vector3Like): Vector3Like {
        const { originX, originY } = this.calculateTileOrigin(tileKey);

        if (!result) {
            result = new THREE.Vector3();
        }

        result.x = originX;
        result.y = originY;
        result.z = 0;
        return result;
    }

    /**
     * Returns the bounding box in geo coordinates for the given {@link TileKey}.
     *
     * Example:
     * ```typescript
     * const geoBox = generator.getGeoBox(worldBounds);
     * console.log(geoBox.center);
     * ```
     *
     * @param tileKey - The {@link TileKey}.
     */
    getGeoBox(tileKey: TileKey): GeoBox {
        const worldBox = this.getWorldBox(tileKey);
        return this.projection.unprojectBox(worldBox);
    }

    getTileKeyGeoOrigin(tileKey: TileKey): GeoCoordinatesLike {
        const worldOrigin = this.getTileKeyWorldOrigin(tileKey);
        return this.projection.unprojectPoint(worldOrigin);
    }
}
