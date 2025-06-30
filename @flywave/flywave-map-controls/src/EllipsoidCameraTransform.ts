import { Vector3, Matrix4, Vector4 } from "three";
import { CameraTransform } from "./CameraTransform";
import { rayCastToEllipsoid } from "./math";
import { ElevationProvider, MapView } from "@flywave/flywave-mapview";

export class EllipsoidCameraTransform extends CameraTransform {
    constructor(
        protected mapView: MapView,
        private options: {
            hitCountPrecision: number;
        }
    ) {
        super();
    }

    protected getCameraProjectionMatrix(): Matrix4 {
        return this.mapView.camera.projectionMatrix;
    }
    protected getViewPort(): Vector4 {
        return this.mapView.renderer.getViewport(new Vector4());
    }

    protected getElevationProvider(): ElevationProvider {
        return this.mapView.elevationProvider;
    }

    private get projection() {
        return this.mapView.projection;
    }

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
        const scale = 1 / radius;
        const scaledSource = sourcePoint.clone().multiplyScalar(scale);
        const scaledTarget = targetPoint.clone().multiplyScalar(scale);

        // Perform ray casting against unit sphere
        const t = rayCastToEllipsoid(outTarget, scaledSource, scaledTarget, 1, 1);

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
        const position = new Vector3().setFromMatrixPosition(this.cameraToWorld);

        // Move to origin relative to target
        this.cameraToWorld.setPosition(position.sub(targetPoint));

        // Apply rotation
        this.rotate(inertialAxis.x, inertialAxis.y, inertialAxis.z, inertialAxis.w);

        // Move back to target-relative position
        this.cameraToWorld.setPosition(position.add(targetPoint));
    }

    /**
     * Pans the camera around a target point
     * @param moveToTargetPoint Target point to move to
     * @param rayTargetPoint Ray target point
     * @param inertialAxis Axis for inertial rotation [x,y,z,angle]
     * @param step Damping/step factor
     */
    public pan(
        targetPosition: Vector3, // 目标位置（原参数 moveToTargetPoint/F）
        rayHitPoint: Vector3, // 射线命中点（原参数 rayTargetPoint/[x,w,u]）
        inertiaVector: Vector4, // 惯性向量（原参数 inertialAxis/E）
        interpolationStep: number // 插值步长（原参数 step/r）
    ): void {
        // 将目标位置转换为数组（保持与原始代码兼容）
        const targetPosArray = targetPosition.toArray();

        // 获取当前相机世界矩阵和位置
        const cameraWorldMatrix = this.cameraToWorld;
        const cameraWorldPosition = new Vector3().setFromMatrixPosition(cameraWorldMatrix);

        // 创建方向向量：从相机指向目标位置
        const directionToTarget = new Vector3().fromArray(targetPosArray);
        const distanceToTarget = directionToTarget.length();
        directionToTarget.normalize();

        // 计算碰撞点（如果有碰撞）
        const collisionPoint = new Vector3();
        if (!this.collisionTo(collisionPoint, cameraWorldPosition, rayHitPoint, distanceToTarget)) {
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
                const sinAngle = Math.sin(rotationAngle);
                const cosAngle = Math.cos(rotationAngle);
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

        // 将旋转矩阵左乘到当前矩阵上 (相当于 rotation * matrix)
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
        const radius = this.projection.unitScale;
        const scale = 1 / radius;

        // Convert to unit sphere space
        const scaledOrigin = origin.clone().multiplyScalar(scale);
        const scaledTarget = target.clone().multiplyScalar(scale);

        // Initial ellipsoid intersection
        const t = rayCastToEllipsoid(result, scaledOrigin, scaledTarget, 1, 1);
        if (t < 0) return -1;

        // Terrain adjustment
        if (this.getElevationProvider()) {
            const direction = scaledTarget.clone().sub(scaledOrigin);
            let terrainHeight = 0;

            // Step through ray to find terrain collision
            for (let step = 0; step <= t; step += this.options.hitCountPrecision ?? 0.01) {
                const testPoint = scaledOrigin.clone().addScaledVector(direction, step);
                let _scratchGeoCoords = this.projection.unprojectPoint(
                    testPoint.clone().multiplyScalar(radius)
                );
                _scratchGeoCoords.altitude = 0;

                const height = this.getElevationProvider().getHeight(_scratchGeoCoords) ?? 0;
                if (height > 0) {
                    terrainHeight = height;
                    break;
                }
            }

            if (terrainHeight > 0) {
                const adjustedScale = 1 + terrainHeight * scale;
                rayCastToEllipsoid(result, scaledOrigin, scaledTarget, 1, adjustedScale);
            }
        }

        result.multiplyScalar(radius);
        return t;
    }
}
