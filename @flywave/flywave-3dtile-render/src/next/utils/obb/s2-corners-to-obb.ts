import { OrientedBox3 } from "@flywave/flywave-geoutils";
import { Vector3 } from "three";

import { Ellipsoid } from "../../../three/math/Ellipsoid";
import type { S2HeightInfo } from "../../utils/s2/index";
import { getS2LngLat, getS2OrientedBoundingBoxCornerPoints } from "../../utils/s2/index";

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
export function convertS2BoundingVolumetoOBB(s2VolumeInfo: S2VolumeInfo): number[] {
    const token: string = s2VolumeInfo.token;
    const heightInfo: S2HeightInfo = {
        minimumHeight: s2VolumeInfo.minimumHeight,
        maximumHeight: s2VolumeInfo.maximumHeight
    };

    const corners: Vector3[] = getS2OrientedBoundingBoxCornerPoints(token, heightInfo);

    // Add a point that doesn't allow the box dive under the Earth

    const center = getS2LngLat(token);
    const centerLng: number = center[0];
    const centerLat: number = center[1];
    const point = Ellipsoid.WGS84.cartographicToCartesian([
        centerLng,
        centerLat,
        heightInfo.maximumHeight
    ]);
    const centerPointAdditional = new Vector3(point[0], point[1], point[2]);
    corners.push(centerPointAdditional);

    // corners should be an array of Vector3 (XYZ)
    const obb: OrientedBox3 = makeOrientedBoundingBoxFromPoints(corners);
    const box: number[] = [...obb.center, ...obb.halfAxes];

    return box;
}
