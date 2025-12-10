/* Copyright (C) 2025 flywave.gl contributors */

import { Matrix4, Vector3, Vector4 } from "three";

import { CameraTransform } from "./CameraTransform";
import { EllipsoidProjection, SphereProjection } from "@flywave/flywave-geoutils";
import { assert } from "chai";

export class EllipsoidCameraTransform extends CameraTransform<EllipsoidProjection | SphereProjection> {

    /**
     * Performs collision detection against an ellipsoid (globe)
     * @param outTarget Output vector for collision point
     * @param sourcePoint Ray origin point
     * @param targetPoint Ray target point
     * @param radius Radius of the ellipsoid
     * @returns True if collision occurred, false otherwise
     */
    protected collisionTo(
        outTarget: Vector3,
        sourcePoint: Vector3,
        targetPoint: Vector3,
        radius: number
    ): boolean {
        // Scale points to unit sphere space
        const scaledSource = sourcePoint.clone();
        const scaledTarget = targetPoint.clone();

        // Perform ray casting against unit sphere
        const t = this.projection.rayCast(outTarget, scaledSource, scaledTarget, radius);

        if (t === -1) {
            return false;
        }

        // Scale result back to world space
        // outTarget.multiplyScalar(radius);
        return true;
    }

    /**
     * Performs inertial panning with damping
     * @param targetPoint Target point to pan around
     * @param inertialAxis Axis and amount of rotation [x,y,z,angle]
     * @param inertial Damping factor (0-1)
     */
    inertialPan(targetPoint: Vector3, inertialAxis: Vector4, inertial: number): void {
        const rotationAmount = inertialAxis.w || 0;
        inertialAxis.w += (0 - rotationAmount) * inertial;

        if (Math.abs(inertialAxis.w) < 1e-8) {
            inertialAxis.w = 0;
            return;
        }

        // Store current position
        // const position = new Vector3().setFromMatrixPosition(this.cameraToWorld);

        // // Move to origin relative to target
        // this.cameraToWorld.setPosition(position.sub(targetPoint));

        // Apply rotation
        this.rotateAxisAngle(
            this.cameraToWorld,
            inertialAxis.x,
            inertialAxis.y,
            inertialAxis.z,
            inertialAxis.w
        );

        // Move back to target-relative position
        // this.cameraToWorld.setPosition(position.add(targetPoint));
    }

    /**
     * Pans the camera around a target point
     * @param moveToTargetPoint Target point to move to
     * @param rayTargetPoint Ray target point
     * @param inertialAxis Axis for inertial rotation [x,y,z,angle]
     * @param step Damping/step factor
     */
    public pan(
        rayHitPoint: Vector3,  // 射线命中点（原参数 rayTargetPoint/[x,w,u]）
        targetPosition: Vector3,// 目标位置（原参数 moveToTargetPoint/F）
        inertiaVector: Vector4, // 惯性向量（原参数 inertialAxis/E）
        interpolationStep: number // 插值步长（原参数 step/r）
    ): void {
        // 将目标位置转换为数组（保持与原始代码兼容）
        const targetPosArray = rayHitPoint.toArray();
        let atitude = this.projection.unprojectAltitude(rayHitPoint);

        // 获取当前相机世界矩阵和位置
        const cameraWorldMatrix = this.cameraToWorld;
        const cameraWorldPosition = new Vector3().setFromMatrixPosition(cameraWorldMatrix);

        // 创建方向向量：从相机指向目标位置
        const directionToTarget = new Vector3().fromArray(targetPosArray);
        directionToTarget.normalize();

        // 计算碰撞点（如果有碰撞）
        const collisionPoint = new Vector3();
        if (!this.collisionTo(collisionPoint, cameraWorldPosition, targetPosition, atitude)) {
            return; // 无碰撞时直接返回
        }
        collisionPoint.normalize();

        // 计算旋转轴：directionToTarget × collisionPoint
        const rotationAxis = new Vector3();
        rotationAxis.crossVectors(directionToTarget, collisionPoint);

        const rotationAxisLengthSquared = rotationAxis.dot(rotationAxis);
        if (rotationAxisLengthSquared > 0) {
            const rotationAxisLength = rotationAxis.length();
            rotationAxis.normalize();

            // 计算旋转角度（限制在[-π/2, π/2]范围内）
            let rotationAngle;
            if (rotationAxisLength <= -1) {
                rotationAngle = -Math.PI * 0.5;
            } else if (rotationAxisLength >= 1) {
                rotationAngle = Math.PI * 0.5;
            } else {
                rotationAngle = Math.asin(rotationAxisLength);
            }

            if (this.smoothPan) {
                // 平滑模式：减小旋转角度
                rotationAngle *= 0.25;
                this.rotateAxisAngle(
                    cameraWorldMatrix,
                    rotationAxis.x,
                    rotationAxis.y,
                    rotationAxis.z,
                    rotationAngle
                );
            } else {
                // 普通模式：直接使用计算的角度
                const cosAngle = collisionPoint.dot(directionToTarget);
                this.rotateAxisSinCos(
                    rotationAxis.x,
                    rotationAxis.y,
                    rotationAxis.z,
                    rotationAxisLength,
                    cosAngle
                );
            }

            // 更新惯性向量
            rotationAngle *= 0.7; // 阻尼系数
            if (rotationAngle > Math.abs(inertiaVector.w)) {
                inertiaVector.set(rotationAxis.x, rotationAxis.y, rotationAxis.z, rotationAngle);
            } else {
                // 插值更新惯性向量
                inertiaVector.x += (rotationAxis.x - inertiaVector.x) * interpolationStep;
                inertiaVector.y += (rotationAxis.y - inertiaVector.y) * interpolationStep;
                inertiaVector.z += (rotationAxis.z - inertiaVector.z) * interpolationStep;
                inertiaVector.normalize();
                inertiaVector.w += (rotationAngle - inertiaVector.w) * interpolationStep;
            }
        } else {
            // 无有效旋转时衰减惯性
            inertiaVector.w += (0 - inertiaVector.w) * interpolationStep;
        }

        // 清除微小惯性
        if (Math.abs(inertiaVector.w) < 1e-15) {
            inertiaVector.w = 0;
        }


    }

    // 必须补充的辅助方法（严格对应原始实现）
    private rotateAxisAngle(
        matrix: Matrix4,
        axisX: number,
        axisY: number,
        axisZ: number,
        angle: number
    ): void {
        // 创建旋转矩阵
        const rotation = new Matrix4();
        const axis = new Vector3(axisX, axisY, axisZ).normalize().negate();
        rotation.makeRotationAxis(axis, angle);

        matrix.premultiply(rotation);
    }

    private rotateAxisSinCos(
        axisX: number,
        axisY: number,
        axisZ: number,
        sinAngle: number,
        cosAngle: number
    ): void {
        // 1. 创建旋转矩阵
        const rotationMatrix = new Matrix4();
        const axis = new Vector3(axisX, axisY, axisZ).normalize().negate(); // 归一化旋转轴

        // 2. 使用 setFromAxisAngle 构造旋转矩阵（Three.js 内部会自动处理 sin/cos）
        rotationMatrix.makeRotationAxis(axis, Math.atan2(sinAngle, cosAngle));

        // 3. 左乘旋转矩阵（相当于 rotationMatrix * this.cameraToWorld）
        this.cameraToWorld.premultiply(rotationMatrix);
    }

    public applyPanVelocity(step: number, panVelocityX: number, panVelocityY: number): void {
        const pivot = new Vector3(0, 0, 0); // 旋转中心（如地球中心）
        const down = new Vector3();
        const right = new Vector3();

        this.getDown(down);
        this.getRight(right);

        // X 方向：绕 Down 轴旋转
        this.rotateAroundPivot(
            pivot.x,
            pivot.y,
            pivot.z,
            down.x,
            down.y,
            down.z,
            panVelocityX * step
        );

        // Y 方向：绕 Right 轴旋转（反向）
        this.rotateAroundPivot(
            pivot.x,
            pivot.y,
            pivot.z,
            right.x,
            right.y,
            right.z,
            -panVelocityY * step
        );
    }

    rayCastProjectionWorld(result: Vector3, origin: Vector3, target: Vector3): number {
        const direction = new Vector3().subVectors(target, origin).normalize();

        // 1. 优先检测地形碰撞（包括椭球下方的情况）
        const terrainHit = this.rayCastTerrain(result, origin, direction);
        if (terrainHit >= 0) return terrainHit;

        // 2. 没有地形碰撞时检测椭球
        return this.rayCastEllipsoid(result, origin, direction);
    }


    private rayCastEllipsoid(
        result: Vector3,
        origin: Vector3,
        direction: Vector3
    ): number {
        const scaledOrigin = origin.clone();
        const scaledDirection = direction.clone();
        const hit = new Vector3();

        const t = this.projection.rayCast(
            hit,
            scaledOrigin,
            scaledOrigin.clone().add(scaledDirection)
        );

        if (t >= 0) {
            result.copy(hit);
            return t
        }
        return -1;
    }

    public override getDistanceAndNormal(result: Vector3, position: Vector3): number {
        const distance = position.length();
        const scale = 1 / distance;

        result.copy(position).multiplyScalar(scale);
        return distance - this.mapView.projection.unitScale;
    }
}
