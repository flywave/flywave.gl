import { OrientedBox3, Projection } from "@flywave/flywave-geoutils";
import { Vector3 } from "three";

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

    // 添加中心点作为参考点
    const center = getS2LngLat(token);
    const centerPoint = proj.projectPoint({
        latitude: center[0],
        longitude: center[1],
        altitude: heightInfo.maximumHeight
    });
    corners.push(new Vector3(centerPoint.x, centerPoint.y, centerPoint.z));

    // 计算OBB轴对齐包围盒
    const obb = new OrientedBox3();

    // 计算所有点的最小/最大范围
    const min = new Vector3(Infinity, Infinity, Infinity);
    const max = new Vector3(-Infinity, -Infinity, -Infinity);

    corners.forEach(corner => {
        min.min(corner);
        max.max(corner);
    });

    // 设置中心点
    obb.position.copy(min.add(max).multiplyScalar(0.5));

    // 设置轴向为世界坐标系
    obb.xAxis.set(1, 0, 0);
    obb.yAxis.set(0, 1, 0);
    obb.zAxis.set(0, 0, 1);

    // 计算半轴长度
    obb.extents.copy(max.sub(min).multiplyScalar(0.5));

    // 转换为3D Tiles标准数组格式
    return [
        ...obb.position.toArray(), // 中心坐标
        ...obb.xAxis.toArray(), // X轴方向
        ...obb.yAxis.toArray(), // Y轴方向
        ...obb.zAxis.toArray(), // Z轴方向
        ...obb.extents.toArray() // 半轴长度
    ];
}
