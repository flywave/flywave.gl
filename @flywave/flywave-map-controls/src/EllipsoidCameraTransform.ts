/* Copyright (C) 2025 flywave.gl contributors */

import { type EllipsoidProjection, type SphereProjection } from "@flywave/flywave-geoutils";
import { assert } from "chai";
import { type Vector4, Matrix4, Vector3 } from "three/webgpu";

import { CameraTransform } from "./CameraTransform";

export class EllipsoidCameraTransform extends CameraTransform<
    EllipsoidProjection | SphereProjection
> {
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
        rayHitPoint: Vector3, // ray hit point (original parameter rayTargetPoint/[x,w,u])
        targetPosition: Vector3, // target position (original parameter moveToTargetPoint/F)
        inertiaVector: Vector4, // inertia vector (original parameter inertialAxis/E)
        interpolationStep: number // interpolation step (original parameter step/r)
    ): void {
        // Convert the target position to an array (kept for compatibility with the original code)
        const targetPosArray = rayHitPoint.toArray();
        const atitude = this.projection.unprojectAltitude(rayHitPoint);

        // Get the current camera world matrix and position
        const cameraWorldMatrix = this.cameraToWorld;
        const cameraWorldPosition = new Vector3().setFromMatrixPosition(cameraWorldMatrix);

        // Create the direction vector from the camera toward the target position
        const directionToTarget = new Vector3().fromArray(targetPosArray);
        directionToTarget.normalize();

        // Compute the collision point (if there is a collision)
        const collisionPoint = new Vector3();
        if (!this.collisionTo(collisionPoint, cameraWorldPosition, targetPosition, atitude)) {
            return; // return directly when there is no collision
        }
        collisionPoint.normalize();

        // Compute the rotation axis: directionToTarget x collisionPoint
        const rotationAxis = new Vector3();
        rotationAxis.crossVectors(directionToTarget, collisionPoint);

        const rotationAxisLengthSquared = rotationAxis.dot(rotationAxis);
        if (rotationAxisLengthSquared > 0) {
            const rotationAxisLength = rotationAxis.length();
            rotationAxis.normalize();

            // Compute the rotation angle (clamped to [-pi/2, pi/2])
            let rotationAngle;
            if (rotationAxisLength <= -1) {
                rotationAngle = -Math.PI * 0.5;
            } else if (rotationAxisLength >= 1) {
                rotationAngle = Math.PI * 0.5;
            } else {
                rotationAngle = Math.asin(rotationAxisLength);
            }

            if (this.smoothPan) {
                // smooth mode: reduce the rotation angle
                rotationAngle *= 0.25;
                this.rotateAxisAngle(
                    cameraWorldMatrix,
                    rotationAxis.x,
                    rotationAxis.y,
                    rotationAxis.z,
                    rotationAngle
                );
            } else {
                // normal mode: use the computed angle directly
                const cosAngle = collisionPoint.dot(directionToTarget);
                this.rotateAxisSinCos(
                    rotationAxis.x,
                    rotationAxis.y,
                    rotationAxis.z,
                    rotationAxisLength,
                    cosAngle
                );
            }

            // update the inertia vector
            rotationAngle *= 0.7; // damping factor
            if (rotationAngle > Math.abs(inertiaVector.w)) {
                inertiaVector.set(rotationAxis.x, rotationAxis.y, rotationAxis.z, rotationAngle);
            } else {
                // interpolate to update the inertia vector
                inertiaVector.x += (rotationAxis.x - inertiaVector.x) * interpolationStep;
                inertiaVector.y += (rotationAxis.y - inertiaVector.y) * interpolationStep;
                inertiaVector.z += (rotationAxis.z - inertiaVector.z) * interpolationStep;
                inertiaVector.normalize();
                inertiaVector.w += (rotationAngle - inertiaVector.w) * interpolationStep;
            }
        } else {
            // decay inertia when there is no valid rotation
            inertiaVector.w += (0 - inertiaVector.w) * interpolationStep;
        }

        // clear negligible inertia
        if (Math.abs(inertiaVector.w) < 1e-15) {
            inertiaVector.w = 0;
        }
    }

    // Auxiliary helpers that must be added (strictly matching the original implementation)
    private rotateAxisAngle(
        matrix: Matrix4,
        axisX: number,
        axisY: number,
        axisZ: number,
        angle: number
    ): void {
        // create the rotation matrix
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
        // 1. create the rotation matrix
        const rotationMatrix = new Matrix4();
        const axis = new Vector3(axisX, axisY, axisZ).normalize().negate(); // normalized rotation axis

        // 2. build the rotation matrix with setFromAxisAngle (Three.js handles sin/cos internally)
        rotationMatrix.makeRotationAxis(axis, Math.atan2(sinAngle, cosAngle));

        // 3. premultiply the rotation matrix (equivalent to rotationMatrix * this.cameraToWorld)
        this.cameraToWorld.premultiply(rotationMatrix);
    }

    public applyPanVelocity(step: number, panVelocityX: number, panVelocityY: number): void {
        const pivot = new Vector3(0, 0, 0); // center of rotation (e.g. the earth's center)
        const down = new Vector3();
        const right = new Vector3();

        this.getDown(down);
        this.getRight(right);

        // X direction: rotate around the Down axis
        this.rotateAroundPivot(
            pivot.x,
            pivot.y,
            pivot.z,
            down.x,
            down.y,
            down.z,
            panVelocityX * step
        );

        // Y direction: rotate around the Right axis (reversed)
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

        // 1. check terrain collision first (including the case below the ellipsoid)
        const terrainHit = this.rayCastTerrain(result, origin, direction);
        if (terrainHit >= 0) return terrainHit;

        // 2. when there is no terrain collision, test against the ellipsoid
        return this.rayCastEllipsoid(result, origin, direction);
    }

    private rayCastEllipsoid(result: Vector3, origin: Vector3, direction: Vector3): number {
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
            return t;
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
