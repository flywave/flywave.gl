/* Copyright (C) 2025 flywave.gl contributors */

import * as THREE from "three";

import { ellipsoidProjection } from "../projection/EllipsoidProjection";
import { type Projection } from "../projection/Projection";

/**
 * 将 ECEF 坐标转换为目标投影的坐标，并返回变换矩阵
 * @param ecefPos - ECEF 坐标（EPSG:4979，单位：米）
 * @param targetProjection - 目标投影（如 SphereProjection）
 * @param isEllipsoid - 是否为椭球体投影，默认为 true
 * @returns 包含投影坐标和变换矩阵的对象
 * @returns projectedPos - 目标投影下的坐标
 * @returns transformMatrix - 变换矩阵（将 ECEF 的旋转/缩放适配到目标投影）
 */
export function convertEllipsoidToProjection(
    ecefPos: THREE.Vector3,
    targetProjection: Projection,
    isEllipsoid: boolean = true
): {
    projectedPos: THREE.Vector3;
    transformMatrix: THREE.Matrix4;
} {
    // 处理非椭球体情况
    if (!isEllipsoid) {
        return {
            projectedPos: ecefPos,
            transformMatrix: new THREE.Matrix4().setPosition(ecefPos.x, ecefPos.y, ecefPos.z)
        };
    }

    // 1. 将 ECEF 坐标转换为地理坐标
    const geoCoords = ellipsoidProjection.unprojectPoint(ecefPos);

    // 2. 计算目标投影下的坐标
    const projectedPos = new THREE.Vector3();
    targetProjection.projectPoint(geoCoords, projectedPos);

    // 3. 计算变换矩阵
    const transformMatrix = new THREE.Matrix4();

    // 3.1 获取 ECEF 下的局部切空间
    const ecefTangentSpace = {
        position: new THREE.Vector3(),
        xAxis: new THREE.Vector3(),
        yAxis: new THREE.Vector3(),
        zAxis: new THREE.Vector3()
    };
    ellipsoidProjection.localTangentSpace(ecefPos, ecefTangentSpace);

    // 3.2 获取目标投影下的局部切空间
    const targetTangentSpace = {
        position: new THREE.Vector3(),
        xAxis: new THREE.Vector3(),
        yAxis: new THREE.Vector3(),
        zAxis: new THREE.Vector3()
    };
    targetProjection.localTangentSpace(geoCoords, targetTangentSpace);

    // 3.3 构建从 ECEF 到目标投影的旋转矩阵
    const ecefRotation = new THREE.Matrix4().makeBasis(
        new THREE.Vector3().copy(ecefTangentSpace.xAxis),
        new THREE.Vector3().copy(ecefTangentSpace.yAxis),
        new THREE.Vector3().copy(ecefTangentSpace.zAxis)
    );

    const targetRotation = new THREE.Matrix4().makeBasis(
        new THREE.Vector3().copy(targetTangentSpace.xAxis),
        new THREE.Vector3().copy(targetTangentSpace.yAxis),
        new THREE.Vector3().copy(targetTangentSpace.zAxis)
    );

    // 3.4 组合平移和旋转
    transformMatrix
        .makeTranslation(projectedPos.x, projectedPos.y, projectedPos.z)
        .multiply(targetRotation)
        .multiply(ecefRotation.invert());

    return {
        projectedPos,
        transformMatrix
    };
}
