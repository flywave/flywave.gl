import { Vector3, Matrix4, Vector4 } from "three";
import { CameraTransform } from "./CameraTransform";
import { rayCastToEllipsoid } from "./math";

export class EllipsoidCameraTransform extends CameraTransform {
    protected getCameraProjectionMatrix(): Matrix4 {
        throw new Error("Method not implemented.");
    }
    protected getViewPort(): Vector4 {
        throw new Error("Method not implemented.");
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
    protected inertialPan(targetPoint: Vector3, inertialAxis: Vector4, inertial: number): void {
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
     * @param target Target point to pan around
     * @param startPoint Starting point of the pan gesture
     * @param targetPoint Current point of the pan gesture
     * @param inertialAxis Axis for inertial rotation [x,y,z,angle]
     * @param step Damping/step factor
     */
    protected pan(
        target: Vector3,
        startPoint: Vector3,
        targetPoint: Vector3,
        inertialAxis: Vector4, // Added w for rotation angle
        step: number
    ): void {
        // 1. Get current camera position from matrix
        const cameraPos = new Vector3().setFromMatrixPosition(this.cameraToWorld);

        // 2. Calculate direction vectors (matches original variable names)
        const F = target.clone();
        const D = startPoint.x,
            C = startPoint.y,
            z = startPoint.z;
        const x = targetPoint.x,
            w = targetPoint.y,
            u = targetPoint.z;

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
        if (!this.collisionTo(G, M, y, this.getEquatorialRadius())) {
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

    /**
     * Gets the equatorial radius of the ellipsoid (globe)
     * @returns Radius in world units
     */
    private getEquatorialRadius(): number {
        // This should be replaced with your actual globe radius
        return 6378137; // Default Earth radius in meters
    }
}
