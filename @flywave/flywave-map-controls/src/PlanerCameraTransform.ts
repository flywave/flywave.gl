import { Vector3, Matrix4, Vector4 } from "three";
import { CameraTransform } from "./CameraTransform";
import { ElevationProvider, MapView } from "@flywave/flywave-mapview";

export class PlanarCameraTransform extends CameraTransform {
    constructor(
        protected mapView: MapView,
        private options: {
            hitCountPrecision: number; // Precision for terrain hit detection
        } = { hitCountPrecision: 0.01 } // Default precision value
    ) {
        super();
    }

    // Returns the camera's projection matrix
    protected getCameraProjectionMatrix(): Matrix4 {
        return this.mapView.camera.projectionMatrix;
    }

    // Gets the current viewport dimensions
    protected getViewPort(): Vector4 {
        return this.mapView.renderer.getViewport(new Vector4());
    }

    // Gets the elevation provider for terrain data
    protected getElevationProvider(): ElevationProvider | null {
        return this.mapView.elevationProvider || null;
    }

    // Shortcut to access map projection
    private get projection() {
        return this.mapView.projection;
    }

    // ============== Collision Detection ==============
    /**
     * Checks for collision between source and target points
     * @param outTarget Output vector for collision point
     * @param sourcePoint Ray origin point
     * @param targetPoint Ray target point
     * @param radius Not used in planar projection (kept for interface compatibility)
     * @returns Boolean indicating if collision occurred
     */
    protected collisionTo(
        outTarget: Vector3,
        sourcePoint: Vector3,
        targetPoint: Vector3,
        radius: number
    ): boolean {
        // In planar projection, we simply check ray intersection with z=0 plane
        const t = this.rayCastProjectionWorld(outTarget, sourcePoint, targetPoint);
        return t >= 0 && t <= 1;
    }

    // ============== Camera Controls ==============
    /**
     * Performs inertial panning with damping
     * @param targetPoint Pivot point for rotation
     * @param inertialAxis Rotation axis and amount [x,y,z,angle]
     * @param inertial Damping factor (0-1)
     */
    inertialPan(targetPoint: Vector3, inertialAxis: Vector4, inertial: number): void {
        const r = this.cameraToWorld;
        inertialAxis.w += (0 - inertialAxis.w) * inertial;

        if (Math.abs(inertialAxis.w) < (inertial || 1e-8)) {
            inertialAxis.w = 0;
        }

        r[12] -= targetPoint.x;
        r[13] -= targetPoint.y;
        r[14] -= targetPoint.z;
        r[12] += inertialAxis.x * inertialAxis.w;
        r[13] += inertialAxis.y * inertialAxis.w;
        r[14] += inertialAxis.z * inertialAxis.w;
        r[12] += targetPoint.x;
        r[13] += targetPoint.y;
        r[14] += targetPoint.z;
    }

    /**
     * Pans the camera around a target point
     * @param moveToTargetPoint Target reference point for movement
     * @param cameraPosition Current camera position
     * @param rayTargetPoint Current mouse/touch position in world coordinates
     * @param inertialAxis Output parameter for storing inertial rotation data
     * @param step Damping/step factor for smooth movement
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

    /**
     * Applies panning velocity to camera
     * @param step Time step/factor
     * @param panVelocityX Horizontal pan velocity
     * @param panVelocityY Vertical pan velocity
     */
    public applyPanVelocity(step: number, panVelocityX: number, panVelocityY: number): void {
        const position = new Vector3().setFromMatrixPosition(this.cameraToWorld);

        // Apply velocity to X/Y coordinates
        position.x += panVelocityX * step * 100; // Scaled for appropriate sensitivity
        position.y += panVelocityY * step * 100;

        this.cameraToWorld.setPosition(position);
    }

    // ============== Raycasting ==============
    private readonly _scratchVec3 = new Vector3(); // Reusable vector for calculations

    /**
     * Performs ray casting against the planar projection with optional terrain
     * @param result Output vector for intersection point
     * @param origin Ray origin in world coordinates
     * @param target Ray end point in world coordinates
     * @returns Intersection parameter t (0-1) or -1 if no intersection
     */
    rayCastProjectionWorld(result: Vector3, origin: Vector3, target: Vector3): number {
        // Early exit if ray is parallel to plane
        if (Math.abs(target.z - origin.z) < 1e-10) return -1;

        // Calculate intersection parameter with z=0 plane
        const t = -origin.z / (target.z - origin.z);
        if (t < 0 || t > 1) return -1; // Intersection outside ray segment

        // Calculate base intersection point (without terrain)
        const baseIntersection = this._scratchVec3.set(
            origin.x + t * (target.x - origin.x),
            origin.y + t * (target.y - origin.y),
            0 // Default to ground level
        );

        // Check for terrain elevation if available
        const elevationProvider = this.getElevationProvider();
        if (elevationProvider) {
            const direction = new Vector3().subVectors(target, origin);
            let terrainHeight = 0;

            // Sample along ray to find terrain collisions
            for (let step = 0; step <= t; step += this.options.hitCountPrecision) {
                const testPoint = new Vector3().copy(origin).addScaledVector(direction, step);

                // Convert to geographic coordinates
                const geoCoords = this.projection.unprojectPoint(testPoint);
                geoCoords.altitude = 0; // Sample from sea level

                const height = elevationProvider.getHeight(geoCoords) ?? 0;
                if (height > 0) {
                    terrainHeight = height;
                    break;
                }
            }

            // Apply terrain height to result
            result.set(baseIntersection.x, baseIntersection.y, terrainHeight);
        } else {
            result.copy(baseIntersection);
        }

        return t;
    }

    // ============== Utility Methods ==============
    /**
     * Smoothly zooms camera toward target point
     * @param target Target position to zoom toward
     * @param interpolationFactor Interpolation amount (0-1)
     */
    public zoom(target: Vector3, interpolationFactor: number): void {
        const position = new Vector3().setFromMatrixPosition(this.cameraToWorld);
        position.lerp(target, interpolationFactor); // Linear interpolation
        this.cameraToWorld.setPosition(position);
    }
}
