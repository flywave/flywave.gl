/* Copyright (C) 2025 flywave.gl contributors */

import { type ElevationProvider, type MapView } from "@flywave/flywave-mapview";
import { type Matrix4, Plane, Ray, Vector3, Vector4 } from "three";

import { CameraTransform } from "./CameraTransform";

export class PlanarCameraTransform extends CameraTransform {
    protected collisionTo(
        outTarget: Vector3,
        sourcePoint: Vector3,
        targetPoint: Vector3,
        radius: number
    ): boolean {
        const t = this.rayCastProjectionWorld(outTarget, sourcePoint, targetPoint);
        return t >= 0;
    }

    inertialPan(targetPoint: Vector3, inertialAxis: Vector4, inertial: number): void {
        const rotationAmount = inertialAxis.w || 0;
        inertialAxis.w += (0 - rotationAmount) * inertial;

        if (Math.abs(inertialAxis.w) < 1e-8) {
            inertialAxis.w = 0;
            return;
        }

        // For planar movement, we apply direct translation based on the inertial axis
        // The inertialAxis.xyz represents the direction of movement
        // The inertialAxis.w represents the magnitude of movement
        const direction = new Vector3(inertialAxis.x, inertialAxis.y, inertialAxis.z).normalize();
        const movement = direction.multiplyScalar(inertialAxis.w);

        const position = new Vector3().setFromMatrixPosition(this.cameraToWorld);
        position.add(movement);
        this.cameraToWorld.setPosition(position);
    }

    public pan(
        rayHitPoint: Vector3,  // 射线命中点（原参数 rayTargetPoint/[x,w,u]）
        targetPosition: Vector3,// 目标位置（原参数 moveToTargetPoint/F）
        inertiaVector: Vector4, // 惯性向量（原参数 inertialAxis/E）
        interpolationStep: number // 插值步长（原参数 step/r）
    ): void {
        // Get current camera position
        const cameraPosition = new Vector3().setFromMatrixPosition(this.cameraToWorld);
        const targetRayOrigin = cameraPosition.clone();

        // In planar mode, we need to:
        // 1. Find where the ray from camera through targetPosition intersects the plane
        // 2. Find where the ray from camera through rayHitPoint intersects the plane
        // 3. Move the camera so that the first intersection point maps to the second

        // Calculate ray from camera to targetPosition and find intersection with plane
        const targetIntersection = new Vector3();
        const targetT = this.rayCastPlaner(
            targetIntersection,
            targetRayOrigin,
            rayHitPoint,
            -rayHitPoint.z
        );

        if (targetT < 0) {
            return; // No intersection with plane
        }

        const currentIntersection = new Vector3();
        const currentT = this.rayCastPlaner(
            currentIntersection,
            targetRayOrigin,
            targetPosition,
            -rayHitPoint.z
        );

        if (currentT < 0) {
            return; // No intersection with plane
        }

        // Calculate the movement vector needed to keep the target point under the cursor
        const delta = new Vector3().subVectors(targetIntersection, currentIntersection);

        // Apply the movement to the camera
        const newCameraPosition = cameraPosition.clone().add(delta);
        this.cameraToWorld.setPosition(newCameraPosition);

        // Update inertia vector for smooth panning
        const movementLength = delta.length();
        if (movementLength > 0) {
            const direction = delta.clone().normalize();
            // Store the direction in xyz and magnitude in w
            inertiaVector.set(
                direction.x,
                direction.y,
                direction.z,
                movementLength * 0.5 // Scale for inertia effect
            );
        } else {
            // Decay inertia if no movement
            inertiaVector.w *= 1 - interpolationStep * 0.1;
            if (Math.abs(inertiaVector.w) < 1e-8) {
                inertiaVector.w = 0;
            }
        }
    }

    public applyPanVelocity(step: number, panVelocityX: number, panVelocityY: number): void {
        const movement = new Vector3(-panVelocityX * step, panVelocityY * step, 0);

        const position = new Vector3().setFromMatrixPosition(this.cameraToWorld);
        position.add(movement);
        this.cameraToWorld.setPosition(position);
    }

    private rayCasterPlane = new Plane(new Vector3(0, 0, 1), 0);
    private rayCaster = new Ray();
    rayCastPlaner(result: Vector3, origin: Vector3, target: Vector3, constant: number): number {
        this.rayCasterPlane.constant = constant;
        this.rayCaster.origin.copy(origin);
        this.rayCaster.direction.copy(target).sub(origin).normalize();
        return this.rayCaster.intersectPlane(this.rayCasterPlane, result)?.length() || -1;
    }

    rayCastProjectionWorld(result: Vector3, origin: Vector3, target: Vector3): number {
        if (Math.abs(target.z - origin.z) < 1e-10) return -1;

        const direction = new Vector3().subVectors(target, origin).normalize();

        const terrainHit = this.rayCastTerrain(result, origin, direction);
        if (terrainHit >= 0) return terrainHit;

        const t = -origin.z / (target.z - origin.z);
        if (t < 0) return -1;

        result.set(origin.x + t * (target.x - origin.x), origin.y + t * (target.y - origin.y), 0);

        return t;
    }

    public rotateAroundPivotAndTilt(
        startX: number,
        startY: number,
        startZ: number,
        pivotX: number,
        pivotY: number,
        pivotZ: number,
        velocity: number,
        tilt: number,
        maxTilt?: number
    ): boolean {
        let adjusted = false;

        // For planar mode, we simplify the implementation
        // 1. Horizontal rotation around pivot point (typically around Z-axis)
        if (Math.abs(velocity) > 1e-6) {
            this.rotateAroundPivot(startX, startY, startZ, pivotX, pivotY, pivotZ, -velocity);
        }

        // 2. Tilt around camera X-axis
        if (Math.abs(tilt) > 1e-6) {
            const cameraXAxis = new Vector3();
            this.getRight(cameraXAxis);
            this.rotateAroundPivot(
                startX,
                startY,
                startZ,
                cameraXAxis.x,
                cameraXAxis.y,
                cameraXAxis.z,
                -tilt
            );
        }

        // 3. Apply tilt limit if specified (simplified for planar mode)
        if (maxTilt !== undefined) {
            // In planar mode, we can simplify tilt limit logic
            // This is a basic implementation - in a real application, you might want more sophisticated tilt limiting
            adjusted = false; // For now, we don't adjust anything
        }

        return adjusted;
    }

    protected getCameraProjectionMatrix(): Matrix4 {
        return this.mapView.camera.projectionMatrix;
    }

    protected getViewPort(): Vector4 {
        return this.mapView.renderer.getViewport(new Vector4());
    }

    protected getElevationProvider(): ElevationProvider | null {
        return this.mapView.elevationProvider || null;
    }

    public override getDistanceAndNormal(result: Vector3, position: Vector3): number {
        result.set(0, 0, 1);
        return result.z;
    }
}
