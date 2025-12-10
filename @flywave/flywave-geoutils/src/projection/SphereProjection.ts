/* Copyright (C) 2025 flywave.gl contributors */

import { Projection, ProjectionType } from "./Projection";
import { GeoBox } from "../coordinates/GeoBox";
import { GeoCoordinates } from "../coordinates/GeoCoordinates";
import { GeoCoordinatesLike } from "../coordinates/GeoCoordinatesLike";
import { Box3Like } from "../math/Box3Like";
import { OrientedBox3Like } from "../math/OrientedBox3Like";
import { TransformLike } from "../math/TransformLike";
import { Vector3Like } from "../math/Vector3Like";

/**
 * Sphere projection interface for spherical Earth model
 */
interface SphereProjection  extends Projection{
    /** Projection type identifier */
    readonly type: ProjectionType;

    /**
     * Gets the world extent for given altitude range
     * @param minAltitude Minimum altitude in meters
     * @param maxAltitude Maximum altitude in meters
     * @param result Optional output buffer
     * @returns World bounding box
     */
    worldExtent<Bounds extends Box3Like>(
        minAltitude: number,
        maxAltitude: number,
        result?: Bounds
    ): Bounds;

    /**
     * Projects geographic coordinates to world coordinates
     * @param geoPoint Geographic coordinates
     * @param result Optional output buffer
     * @returns World coordinates
     */
    projectPoint<WorldCoordinates extends Vector3Like>(
        geoPoint: GeoCoordinatesLike,
        result?: WorldCoordinates
    ): WorldCoordinates;

    /**
     * Unprojects world coordinates to geographic coordinates
     * @param point World coordinates
     * @returns Geographic coordinates
     */
    unprojectPoint(point: Vector3Like): GeoCoordinates;

    /**
     * Calculates altitude from world coordinates
     * @param point World coordinates
     * @returns Altitude in meters
     */
    unprojectAltitude(point: Vector3Like): number;

    /**
     * Projects geographic bounding box to world bounding box
     * @param geoBox Geographic bounding box
     * @param result Optional output buffer
     * @returns World bounding box (axis-aligned or oriented)
     */
    projectBox<Bounds extends Box3Like | OrientedBox3Like>(
        geoBox: GeoBox,
        result?: Bounds
    ): Bounds;

    /**
     * Unprojects world bounding box to geographic bounding box
     * @param worldBox World bounding box
     * @returns Geographic bounding box
     */
    unprojectBox(worldBox: Box3Like): GeoBox;

    /**
     * Gets scale factor at world point
     * @param worldPoint World coordinates
     * @returns Scale factor
     */
    getScaleFactor(worldPoint: Vector3Like): number;

    /**
     * Calculates ground distance from world point
     * @param worldPoint World coordinates
     * @returns Distance to ground in meters
     */
    groundDistance(worldPoint: Vector3Like): number;

    /**
     * Scales point to sphere surface
     * @param worldPoint World coordinates (modified in-place)
     * @returns Scaled point on sphere surface
     */
    scalePointToSurface(worldPoint: Vector3Like): Vector3Like;

    /**
     * Calculates surface normal at world point
     * @param worldPoint World coordinates
     * @param normal Optional output buffer
     * @returns Surface normal vector
     */
    surfaceNormal(worldPoint: Vector3Like, normal?: Vector3Like): Vector3Like;

    /**
     * Reprojects point from different projection
     * @param sourceProjection Source projection
     * @param worldPos World coordinates in source projection
     * @param result Optional output buffer
     * @returns World coordinates in this projection
     */
    reprojectPoint(
        sourceProjection: Projection,
        worldPos: Vector3Like,
        result?: Vector3Like
    ): Vector3Like;

    /**
     * Calculates local tangent space transform
     * @param point Geographic or world coordinates
     * @param result Output transform
     * @returns Local tangent space transform
     */
    localTangentSpace(
        point: GeoCoordinatesLike | Vector3Like,
        result: TransformLike
    ): TransformLike;

    /**
     * Performs ray casting to sphere surface
     * @param result Intersection point in world coordinates (output)
     * @param rayOrigin Ray origin in world coordinates
     * @param rayTarget Ray target point in world coordinates
     * @param altitude Altitude above sphere surface (meters, default = 0)
     * @returns Distance from ray origin to intersection point, or -1 if no intersection
     */
    rayCast(
        result: Vector3Like,
        rayOrigin: Vector3Like,
        rayTarget: Vector3Like,
        altitude?: number
    ): number;
}

export type { SphereProjection };