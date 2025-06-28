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
        outTarget.multiplyScalar(radius);
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
        moveToTargetPoint: Vector3,
        rayTargetPoint: Vector3,
        inertialAxis: Vector4,
        step: number
    ): void {
        // 1. 获取当前相机位置
        const cameraPos = new Vector3().setFromMatrixPosition(this.cameraToWorld);

        // 2. 计算方向向量（对应原始 B/M/y 变量）
        const B = moveToTargetPoint.clone(); // 原始 F 参数
        const M = cameraPos.clone(); // 相机当前位置
        const y = rayTargetPoint.clone(); // 射线目标点

        // 3. 碰撞检测（对应原始 globeCollisionTo）
        const G = new Vector3();
        if (!this.collisionTo(G, M, y, -moveToTargetPoint.z)) {
            // 无碰撞时衰减惯性
            inertialAxis.w += (0 - inertialAxis.w) * step;
            if (Math.abs(inertialAxis.w) < 1e-15) {
                inertialAxis.w = 0;
            }
            return;
        }

        // 4. 计算移动方向（对应原始 s 向量）
        const s = new Vector3().subVectors(B, G).normalize();
        const K = B.distanceTo(G); // 移动距离

        if (K > 0) {
            // 5. 应用平移（对应原始矩阵操作）
            const translation = s.clone().multiplyScalar(K * 0.25);

            // 更新相机位置（等效于原始 J[12/13/14] 操作）
            cameraPos.add(translation);
            this.cameraToWorld.setPosition(cameraPos);

            // 6. 更新惯性（对应原始 E 数组处理）
            const I = K * 0.7;
            if (I > Math.abs(inertialAxis.w)) {
                inertialAxis.set(s.x, s.y, s.z, I);
            } else {
                // 惯性平滑过渡
                inertialAxis.x += (s.x - inertialAxis.x) * step;
                inertialAxis.y += (s.y - inertialAxis.y) * step;
                inertialAxis.z += (s.z - inertialAxis.z) * step;
                inertialAxis.normalize();
                inertialAxis.w += (I - inertialAxis.w) * step;
            }
        } else {
            // 无有效移动时衰减惯性
            inertialAxis.w += (0 - inertialAxis.w) * step;
        }

        // 7. 清理微小的惯性值
        if (Math.abs(inertialAxis.w) < 1e-15) {
            inertialAxis.w = 0;
        }
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
