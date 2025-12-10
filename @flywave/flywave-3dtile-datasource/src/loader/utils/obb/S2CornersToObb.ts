/* Copyright (C) 2025 flywave.gl contributors */

import { type Projection, OrientedBox3 } from "@flywave/flywave-geoutils";
import { Vector3 } from "three";

import type { S2HeightInfo } from "../s2/index";
import { getS2LngLat, getS2OrientedBoundingBoxCornerPoints } from "../s2/index";

export interface S2VolumeInfo {
    /** S2 key or token */
    token: string;
    /** minimum height in meters */
    minimumHeight: number;
    /** maximum height in meters */
    maximumHeight: number;
}

/**
 * Converts S2VolumeInfo to OrientedBoundingBox
 * @param {S2VolumeInfo} s2VolumeInfo - s2 volume to convert
 * @returns Oriented Bounding Box of type Box
 */
export function convertS2BoundingVolumetoOBB(
    s2VolumeInfo: S2VolumeInfo,
    proj: Projection
): number[] {
    const token: string = s2VolumeInfo.token;
    const heightInfo: S2HeightInfo = {
        minimumHeight: s2VolumeInfo.minimumHeight,
        maximumHeight: s2VolumeInfo.maximumHeight
    };

    const corners: Vector3[] = getS2OrientedBoundingBoxCornerPoints(token, heightInfo);

    // Add center point as reference point
    const center = getS2LngLat(token);
    const centerPoint = proj.projectPoint({
        latitude: center[0],
        longitude: center[1],
        altitude: heightInfo.maximumHeight
    });
    corners.push(new Vector3(centerPoint.x, centerPoint.y, centerPoint.z));

    // Calculate OBB axis-aligned bounding box
    const obb = new OrientedBox3();

    // Calculate min/max range of all points
    const min = new Vector3(Infinity, Infinity, Infinity);
    const max = new Vector3(-Infinity, -Infinity, -Infinity);

    corners.forEach(corner => {
        min.min(corner);
        max.max(corner);
    });

    // Set center point
    obb.position.copy(min.add(max).multiplyScalar(0.5));

    // Set axis to world coordinate system
    obb.xAxis.set(1, 0, 0);
    obb.yAxis.set(0, 1, 0);
    obb.zAxis.set(0, 0, 1);

    // Calculate half-axis length
    obb.extents.copy(max.sub(min).multiplyScalar(0.5));

    // Convert to 3D Tiles standard array format
    return [
        ...obb.position.toArray(), // Center coordinates
        ...obb.xAxis.toArray(), // X-axis direction
        ...obb.yAxis.toArray(), // Y-axis direction
        ...obb.zAxis.toArray(), // Z-axis direction
        ...obb.extents.toArray() // Half-axis length
    ];
}
