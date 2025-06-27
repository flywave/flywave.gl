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
     * @param cameraPosition Camera position
     * @param rayTargetPoint Ray target point
     * @param inertialAxis Axis for inertial rotation [x,y,z,angle]
     * @param step Damping/step factor
     */
    public pan(
        moveToTargetPoint: Vector3,
        cameraPosition: Vector3,
        rayTargetPoint: Vector3,
        inertialAxis: Vector4,
        step: number
    ): void {
        // 1. Get current camera position from matrix
        const cameraPos = new Vector3().setFromMatrixPosition(this.cameraToWorld);

        // 2. Calculate direction vectors (matches original variable names)
        const F = moveToTargetPoint.clone();
        const D = cameraPosition.x,
            C = cameraPosition.y,
            z = cameraPosition.z;
        const x = rayTargetPoint.x,
            w = rayTargetPoint.y,
            u = rayTargetPoint.z;

        // Original code reference:
        // B = [F[0] - D, F[1] - C, F[2] - z]
        const B = new Vector3(F.x - D, F.y - C, F.z - z);

        // Original: M = [J[12] - D, J[13] - C, J[14] - z]
        const M = new Vector3(cameraPos.x - D, cameraPos.y - C, cameraPos.z - z);

        // Original: y = [x - D, w - C, u - z]
        const y = new Vector3(x - D, w - C, u - z);

        // Original: v = vec3.normalize(B)
        const v = B.clone().normalize();

        // 3. Find intersection point (matches original collision check)
        const G = new Vector3();
        if (!this.collisionTo(G, M, y, this.projection.unitScale)) {
            inertialAxis.w! += (0 - inertialAxis.w!) * step;
            if (Math.abs(inertialAxis.w!) < 1e-15) {
                inertialAxis.w = 0;
            }
            return;
        }

        // 4. Calculate rotation axis (matches original cross product)
        G.normalize();
        const s = new Vector3();
        s.crossVectors(B, G); // Original: vec3.cross(s, B, G)

        const K = s.dot(s); // Original: vec3.dot(s, s)

        if (K > 0) {
            const L = s.length(); // Original: L = vec3.normalize(s)
            s.normalize();

            let I: number; // Rotation angle
            if (L <= -1) {
                I = -Math.PI * 0.5;
            } else if (L >= 1) {
                I = Math.PI * 0.5;
            } else {
                I = Math.asin(L);
            }

            // 5. Apply rotation (matches original matrix operations)
            // Original: J[12] -= D; J[13] -= C; J[14] -= z
            const currentPos = new Vector3().setFromMatrixPosition(this.cameraToWorld);
            this.cameraToWorld.setPosition(currentPos.sub(new Vector3(D, C, z)));

            if (this.smoothPan) {
                I *= 0.25;
                const L_smooth = Math.sin(I);
                const A = Math.cos(I);
                // Original: matrix.rotateAxisAngleT(J, s[0], s[1], s[2], I)
                this.rotate(s.x, s.y, s.z, I);
            } else {
                const A = G.dot(B); // Original: A = vec3.dot(G, B)
                // Original: matrix.rotateAxisSinCosT(J, s[0], s[1], s[2], L, A)
                // Using Three.js rotation from axis and cos/sin
                const rotMatrix = new Matrix4().makeRotationAxis(s, Math.asin(L));
                this.cameraToWorld.multiply(rotMatrix);
            }

            // Original: J[12] += D; J[13] += C; J[14] += z
            this.cameraToWorld.setPosition(currentPos.add(new Vector3(D, C, z)));

            // 6. Update inertial rotation (matches original E[3] handling)
            I *= 0.7;
            if (I > Math.abs(inertialAxis.w!)) {
                inertialAxis.set(s.x, s.y, s.z, I);
            } else {
                const H = step; // Original damping factor
                inertialAxis.x += (s.x - inertialAxis.x) * H;
                inertialAxis.y += (s.y - inertialAxis.y) * H;
                inertialAxis.z += (s.z - inertialAxis.z) * H;
                inertialAxis.normalize();
                inertialAxis.w! += (I - inertialAxis.w!) * H;
            }
        } else {
            inertialAxis.w! += (0 - inertialAxis.w!) * step;
        }

        // Final cleanup (matches original)
        if (Math.abs(inertialAxis.w!) < 1e-15) {
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
