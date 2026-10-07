/* Copyright (C) 2025 flywave.gl contributors */

import { type Projection } from "@flywave/flywave-geoutils";
import { type ElevationProvider, type MapView } from "@flywave/flywave-mapview";
import { Matrix4, Quaternion, Spherical, Vector3, Vector4 } from "three/webgpu";

import { slerpMatrices, sphericalLerp } from "./math";

/**
 * A camera controller that provides smooth transitions and advanced movement controls
 * using matrix transformations. Supports great circle paths, pivot-based rotations,
 * and tilt-limited movements.
 */
export abstract class CameraTransform<ProjectionType extends Projection = Projection> {
    /**
     * The transformation matrix representing the camera's position and orientation in world space
     */
    public cameraToWorld: Matrix4 = new Matrix4().identity();

    /**
     * Whether to enable smooth panning transitions (default: true)
     */
    public smoothPan: boolean = true;

    /**
     * Sets the camera's transformation matrix directly
     * @param matrix The new transformation matrix
     */
    public setMatrix(matrix: Matrix4): void {
        this.cameraToWorld.copy(matrix);
    }

    constructor(protected mapView: MapView) {}

    protected getCameraProjectionMatrix(): Matrix4 {
        return this.mapView.camera.projectionMatrix;
    }

    protected getViewPort(): Vector4 {
        return this.mapView.renderer.getViewport(new Vector4());
    }

    protected get projection() {
        return this.mapView.projection as ProjectionType;
    }

    /**
     * Smoothly interpolates between the current camera position and a target matrix
     * @param source The target transformation matrix
     * @param target The reference matrix (uses current camera if null)
     * @param interpolationFactor Interpolation progress (0 to 1)
     * @param referenceMatrix Optional reference matrix for interpolation
     */
    public followMatrix(
        source: Matrix4,
        interpolationFactor: number,
        referenceMatrix?: Matrix4 // optional parameter
    ): void {
        // 1. Determine the reference matrix (prefer the passed-in one, otherwise the current camera matrix)
        const refMatrix = referenceMatrix || this.cameraToWorld;

        // 2. Rotation interpolation (using Three.js's Quaternion.slerp)
        const sourceQuat = new Quaternion().setFromRotationMatrix(source);
        const refQuat = new Quaternion().setFromRotationMatrix(refMatrix);
        const resultQuat = new Quaternion().slerpQuaternions(
            refQuat,
            sourceQuat,
            interpolationFactor
        );

        // 3. Position interpolation (linear lerp)
        const sourcePos = new Vector3().setFromMatrixPosition(source);
        const refPos = new Vector3().setFromMatrixPosition(refMatrix);
        const resultPos = refPos.lerp(sourcePos, interpolationFactor);

        // 4. Combine the results
        this.cameraToWorld.makeRotationFromQuaternion(resultQuat).setPosition(resultPos);
    }

    /**
     * Smoothly transitions the camera along a great circle path
     * @param start Starting transformation matrix
     * @param end Target transformation matrix
     * @param interpolationFactor Interpolation progress (0 to 1)
     * @param pivot Pivot point coordinates [x,y,z] for rotation
     * @param radius Distance from pivot point
     * @param intermediateMatrix Optional intermediate transformation matrix
     * @param intermediateStart When to switch to intermediate matrix (0-1)
     */
    public followMatrixGreatCircle(
        start: Matrix4,
        end: Matrix4,
        interpolationFactor: number,
        pivot: Vector3,
        radius: number,
        intermediateMatrix?: Matrix4,
        intermediateStart?: number
    ): void {
        // 1. Extract the start and end positions
        const startPos = new Vector3().setFromMatrixPosition(start);
        const endPos = new Vector3().setFromMatrixPosition(end);

        // 2. Linearly interpolate the position (same as the original version)
        const interpPos = new Vector3(
            startPos.x + (endPos.x - startPos.x) * interpolationFactor,
            startPos.y + (endPos.y - startPos.y) * interpolationFactor,
            startPos.z + (endPos.z - startPos.z) * interpolationFactor
        );

        // 3. Compute the distance scale factor (same as the original version)
        const startDist = startPos.length();
        const endDist = endPos.length();
        const delta = new Vector3().subVectors(endPos, startPos);
        const deltaLength = delta.length();

        let scaleFactor = 1 - interpolationFactor * 2;
        scaleFactor = 1 - scaleFactor * scaleFactor;
        scaleFactor =
            (startDist +
                (endDist - startDist) * interpolationFactor +
                deltaLength * radius * scaleFactor) /
            interpPos.distanceTo(pivot);

        // 4. Matrix interpolation (keeps the same logic as the original version)
        let resultMatrix: Matrix4;
        if (intermediateMatrix) {
            if (intermediateStart === undefined) {
                const firstStep = slerpMatrices(
                    this.cameraToWorld,
                    intermediateMatrix,
                    interpolationFactor
                );
                const secondStep = slerpMatrices(
                    intermediateMatrix,
                    end,
                    Math.pow(interpolationFactor, 10)
                );
                resultMatrix = slerpMatrices(firstStep, secondStep, interpolationFactor);
            } else {
                if (interpolationFactor < intermediateStart) {
                    resultMatrix = slerpMatrices(
                        this.cameraToWorld,
                        intermediateMatrix,
                        interpolationFactor / intermediateStart
                    );
                } else {
                    resultMatrix = slerpMatrices(
                        intermediateMatrix,
                        end,
                        (interpolationFactor - intermediateStart) / (1 - intermediateStart)
                    );
                }
            }
        } else {
            resultMatrix = slerpMatrices(this.cameraToWorld, end, interpolationFactor);
        }

        // 5. Set the final position (taking the scale factor into account)
        const finalPos = new Vector3(
            pivot.x + (interpPos.x - pivot.x) * scaleFactor,
            pivot.y + (interpPos.y - pivot.y) * scaleFactor,
            pivot.z + (interpPos.z - pivot.z) * scaleFactor
        );
        resultMatrix.setPosition(finalPos);

        this.cameraToWorld.copy(resultMatrix);
    }

    /**
     * Sets the camera's origin position
     * @param x X coordinate
     * @param y Y coordinate
     * @param z Z coordinate
     */
    public setOrigin(x: number, y: number, z: number): void {
        this.cameraToWorld.setPosition(new Vector3(x, y, z));
    }

    /**
     * Translates the camera by the specified offsets
     * @param x X-axis translation
     * @param y Y-axis translation
     * @param z Z-axis translation
     */
    public translate(x: number, y: number, z: number): void {
        this.cameraToWorld.setPosition(new Vector3(x, y, z));
    }

    /**
     * Rotates the camera around the X-axis
     * @param angle Rotation angle in radians
     */
    public rotateX(angle: number): void {
        this.cameraToWorld.multiply(new Matrix4().makeRotationX(angle));
    }

    /**
     * Rotates the camera around the Y-axis
     * @param angle Rotation angle in radians
     */
    public rotateY(angle: number): void {
        this.cameraToWorld.multiply(new Matrix4().makeRotationY(angle));
    }

    /**
     * Rotates the camera around the Z-axis
     * @param angle Rotation angle in radians
     */
    public rotateZ(angle: number): void {
        this.cameraToWorld.multiply(new Matrix4().makeRotationZ(angle));
    }

    public zoom(target: Vector3, interpolationFactor: number) {
        const r = this.cameraToWorld.elements;
        r[12] += (target.x - r[12]) * interpolationFactor;
        r[13] += (target.y - r[13]) * interpolationFactor;
        r[14] += (target.z - r[14]) * interpolationFactor;
    }

    /**
     * Unprojects screen coordinates to world space
     * @param out Output array for world coordinates
     * @param screenToUnit Screen to unit space transformation matrix
     * @param width Viewport width
     * @param height Viewport height
     * @param x Screen X coordinate
     * @param y Screen Y coordinate
     * @param depth Depth value
     */
    public unprojectToWorld(out: Vector3, x: number, y: number, depth: number): void {
        const viewPort = this.getViewPort();
        const width = viewPort.width;
        const height = viewPort.height;
        const projMatrix = this.getCameraProjectionMatrix();
        const projElements = projMatrix.elements;

        // Compute using the original formula
        const ndcX = (((x / width) * 2 - 1 - projElements[8]) * depth) / projElements[0];
        const ndcY = (((-y / height) * 2 + 1 - projElements[9]) * depth) / projElements[5];
        const ndcZ = depth;

        const vector = new Vector3(ndcX, ndcY, ndcZ);
        vector.applyMatrix4(this.cameraToWorld);
        out.copy(vector);
    }

    /**
     * Rotates the camera around a pivot point
     * @param pivotX Pivot X coordinate
     * @param pivotY Pivot Y coordinate
     * @param pivotZ Pivot Z coordinate
     * @param axisX Rotation axis X component
     * @param axisY Rotation axis Y component
     * @param axisZ Rotation axis Z component
     * @param angle Rotation angle in radians
     */
    public rotateAroundPivot(
        pivotX: number,
        pivotY: number,
        pivotZ: number,
        axisX: number,
        axisY: number,
        axisZ: number,
        angle: number
    ): void {
        const r = this.cameraToWorld.elements;
        r[12] -= pivotX;
        r[13] -= pivotY;
        r[14] -= pivotZ;
        this.rotateAxisAngleT(this.cameraToWorld, axisX, axisY, axisZ, -angle);
        r[12] += pivotX;
        r[13] += pivotY;
        r[14] += pivotZ;
    }

    /**
     * Rotate and tilt the camera around the sphere center point
     * @param startX Starting X coordinate
     * @param startY Starting Y coordinate
     * @param startZ Starting Z coordinate
     * @param pivotX Sphere center X coordinate
     * @param pivotY Sphere center Y coordinate
     * @param pivotZ Sphere center Z coordinate
     * @param velocity Rotation velocity (angle)
     * @param tilt Tilt angle
     * @param maxTilt Maximum tilt angle limit (optional)
     * @returns Whether a tilt adjustment was applied
     */
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
        const cameraMatrix = this.cameraToWorld;

        // 1. Translate the camera to the relative origin
        cameraMatrix.elements[12] -= startX;
        cameraMatrix.elements[13] -= startY;
        cameraMatrix.elements[14] -= startZ;

        // 2. Rotate around the sphere center direction
        this.rotateAxisAngleT(cameraMatrix, pivotX, pivotY, pivotZ, velocity);

        // 3. Obtain and normalize the X axis direction
        const xAxis = new Vector3().fromArray(cameraMatrix.elements).normalize().negate();

        // 4. Tilt around the X axis
        this.rotateAxisAngleT(cameraMatrix, xAxis.x, xAxis.y, xAxis.z, -tilt);

        let adjusted = false;
        if (maxTilt !== undefined) {
            // 5. Check and clamp the tilt angle
            const zComponent =
                cameraMatrix.elements[8] * pivotX +
                cameraMatrix.elements[9] * pivotY +
                cameraMatrix.elements[10] * pivotZ;

            const yComponent =
                cameraMatrix.elements[4] * pivotX +
                cameraMatrix.elements[5] * pivotY +
                cameraMatrix.elements[6] * pivotZ;

            if (yComponent < 0) {
                if (zComponent > Math.sin(maxTilt)) {
                    const adjustDirection = yComponent > 0 ? -1 : 1;
                    const adjustAngle = adjustDirection * (Math.asin(zComponent) + maxTilt);
                    this.rotateAxisAngleT(cameraMatrix, xAxis.x, xAxis.y, xAxis.z, adjustAngle);
                    adjusted = true;
                }
            } else {
                const adjustAngle = -Math.asin(yComponent);
                this.rotateAxisAngleT(cameraMatrix, xAxis.x, xAxis.y, xAxis.z, adjustAngle);
                adjusted = true;
            }
        }

        // 6. Translate the camera back to its original position
        cameraMatrix.elements[12] += startX;
        cameraMatrix.elements[13] += startY;
        cameraMatrix.elements[14] += startZ;

        return adjusted;
    }

    /**
     * Clamp the camera tilt angle relative to the sphere center direction
     * @param centerPoint Map center point coordinates [x, y, z] (original parameter D)
     * @param sphereDirection Sphere center direction vector [x, y, z] (original parameter r)
     * @param tiltLimit Maximum tilt angle limit (original parameter E)
     */
    public applyTiltLimit(centerPoint: Vector3, sphereDirection: Vector3, tiltLimit: number): void {
        const cameraMatrix = this.cameraToWorld;

        // 1. Translate the camera to the relative origin
        cameraMatrix.elements[12] -= centerPoint.x;
        cameraMatrix.elements[13] -= centerPoint.y;
        cameraMatrix.elements[14] -= centerPoint.z;

        // 2. Obtain the camera X axis direction and normalize it
        const cameraXAxis = new Vector3(
            cameraMatrix.elements[0],
            cameraMatrix.elements[1],
            cameraMatrix.elements[2]
        )
            .normalize()
            .negate();

        // 3. Compute the key components
        const zComponent =
            cameraMatrix.elements[8] * sphereDirection.x +
            cameraMatrix.elements[9] * sphereDirection.y +
            cameraMatrix.elements[10] * sphereDirection.z;

        const yComponent =
            cameraMatrix.elements[4] * sphereDirection.x +
            cameraMatrix.elements[5] * sphereDirection.y +
            cameraMatrix.elements[6] * sphereDirection.z;

        // 4. Apply the tilt limit
        if (yComponent < 0) {
            if (zComponent > -Math.sin(tiltLimit)) {
                const adjustDirection = yComponent > 0 ? -1 : 1;
                const adjustAngle = adjustDirection * (Math.asin(zComponent) + tiltLimit) * 0.5;
                this.rotateAxisAngleT(
                    cameraMatrix,
                    cameraXAxis.x,
                    cameraXAxis.y,
                    cameraXAxis.z,
                    adjustAngle
                );
            }
        } else {
            const adjustAngle = -Math.asin(yComponent) * 0.5;
            this.rotateAxisAngleT(
                cameraMatrix,
                cameraXAxis.x,
                cameraXAxis.y,
                cameraXAxis.z,
                adjustAngle
            );
        }

        // 5. Translate the camera back to its original position
        cameraMatrix.elements[12] += centerPoint.x;
        cameraMatrix.elements[13] += centerPoint.y;
        cameraMatrix.elements[14] += centerPoint.z;
    }

    /**
     * Smartly balance the camera direction
     * @param pivotPoint Pivot point coordinates [x, y, z] (original parameter F)
     * @param sphereDirection Sphere center direction vector [x, y, z] (original parameter r)
     * @param balanceFactor Balance factor (original parameter D)
     */
    public smartBalance(
        pivotPoint: Vector3,
        sphereDirection: Vector3,
        balanceFactor: number
    ): void {
        const cameraMatrix = this.cameraToWorld;
        balanceFactor = Math.max(0.1, balanceFactor);

        // Compute the projection of each camera axis onto the sphere center direction
        const xProjection =
            cameraMatrix.elements[0] * sphereDirection.x +
            cameraMatrix.elements[1] * sphereDirection.y +
            cameraMatrix.elements[2] * sphereDirection.z;

        const yProjection =
            cameraMatrix.elements[4] * sphereDirection.x +
            cameraMatrix.elements[5] * sphereDirection.y +
            cameraMatrix.elements[6] * sphereDirection.z;

        const zProjection =
            cameraMatrix.elements[8] * sphereDirection.x +
            cameraMatrix.elements[9] * sphereDirection.y +
            cameraMatrix.elements[10] * sphereDirection.z;

        // Clamp the projection value to [-1, 1]
        const clampedProjection = Math.max(-1, Math.min(1, xProjection));
        const rotationAngle = Math.asin(clampedProjection) * balanceFactor;

        // Choose the rotation axis based on the dominant tilt direction
        if (Math.abs(yProjection) > Math.abs(zProjection)) {
            // Rotate around the negative camera Z axis
            const rotationAxis = new Vector3(
                -cameraMatrix.elements[8],
                -cameraMatrix.elements[9],
                -cameraMatrix.elements[10]
            );
            this.rotateAroundPivot(
                pivotPoint.x,
                pivotPoint.y,
                pivotPoint.z,
                rotationAxis.x,
                rotationAxis.y,
                rotationAxis.z,
                rotationAngle
            );
        } else {
            // Rotate around the camera Y axis
            const rotationAxis = new Vector3(
                cameraMatrix.elements[4],
                cameraMatrix.elements[5],
                cameraMatrix.elements[6]
            );
            this.rotateAroundPivot(
                pivotPoint.x,
                pivotPoint.y,
                pivotPoint.z,
                rotationAxis.x,
                rotationAxis.y,
                rotationAxis.z,
                rotationAngle
            );
        }
    }

    /**
     * Three.js version of axis-angle rotation
     */
    private rotateAxisAngleT(
        matrix: Matrix4,
        axisX: number,
        axisY: number,
        axisZ: number,
        angle: number
    ): void {
        const rotation = new Matrix4();
        const axis = new Vector3(axisX, axisY, axisZ).normalize();
        rotation.makeRotationAxis(axis, angle);
        matrix.premultiply(rotation);
    }

    /**
     * Gets the inverse of the camera's world matrix (world-to-camera transform)
     * @param outMatrix Output matrix that will store the inverted world-to-camera transform
     */
    public getWorldToCamera(outMatrix: Matrix4): void {
        outMatrix.copy(this.cameraToWorld).invert(); // Copies and inverts the current camera matrix
    }

    /**
     * Gets the camera's origin position in world space
     * @param out Vector3 that will store the camera's position [x,y,z]
     */
    public getOrigin(out: Vector3): void {
        // Extracts position from the matrix (elements 12,13,14 are the translation components)
        out.fromArray(this.cameraToWorld.elements, 12);
    }

    /**
     * Gets the camera's normalized right vector (X-axis in camera space)
     * @param out Vector3 that will store the right direction vector
     */
    public getRight(out: Vector3): void {
        // Gets first column of matrix (right vector) and normalizes it
        out.setFromMatrixColumn(this.cameraToWorld, 0).normalize();
    }

    /**
     * Gets the camera's normalized up vector (Y-axis in camera space)
     * @param out Vector3 that will store the up direction vector
     */
    public getUp(out: Vector3): void {
        // Gets second column of matrix (up vector) and normalizes it
        out.setFromMatrixColumn(this.cameraToWorld, 1).normalize();
    }

    /**
     * Gets the camera's normalized down vector (negative Y-axis in camera space)
     * @param out Vector3 that will store the down direction vector
     */
    public getDown(out: Vector3): void {
        this.getUp(out); // First get the up vector
        out.negate(); // Then negate it to get down
    }

    /**
     * Gets the camera's forward vector (Z-axis in camera space)
     * Note: This is not normalized as it typically contains scale information
     * @param out Vector3 that will store the forward direction vector
     */
    public getForward(out: Vector3): void {
        // Gets third column of matrix (forward vector)
        out.setFromMatrixColumn(this.cameraToWorld, 2);
    }

    /**
     * Checks for collision between a ray and the projection surface
     * @param outTarget Output vector for collision point if collision occurs
     * @param sourcePoint Origin point of the ray
     * @param targetPoint End point of the ray
     * @param radius Collision radius/threshold
     * @returns Boolean indicating if collision occurred
     */
    protected abstract collisionTo(
        outTarget: Vector3,
        sourcePoint: Vector3,
        targetPoint: Vector3,
        radius: number
    ): boolean;

    /**
     * Performs inertial panning with damping effect
     * @param targetPoint The pivot point to pan around
     * @param inertialAxis The axis and amount of rotation [x,y,z,angle]
     * @param inertial The damping factor (0=no damping, 1=full damping)
     */
    abstract inertialPan(targetPoint: Vector3, inertialAxis: Vector4, inertial: number): void;

    /**
     * Pans the camera around a target point
     * @param moveToTargetPoint The reference target point for movement
     * @param cameraPosition Current camera position in world space
     * @param rayTargetPoint Current mouse/touch position in world coordinates
     * @param inertialAxis Output parameter storing inertial rotation data [x,y,z,angle]
     * @param step The damping/step factor controlling smoothness (0-1)
     */
    public abstract pan(
        moveToTargetPoint: Vector3,
        rayTargetPoint: Vector3,
        inertialAxis: Vector4,
        step: number
    );

    protected getElevationProvider(): ElevationProvider {
        return this.mapView.elevationProvider;
    }

    protected rayCastTerrain(result: Vector3, origin: Vector3, direction: Vector3): number {
        const elevationProvider = this.getElevationProvider();
        if (!elevationProvider || this.mapView.zoomLevel < 13) return -1;

        const maxDistance = 2 * this.projection.unitScale; // long enough detection distance
        let currentDistance = 0;
        const minStep = 1.0; // in meters

        while (currentDistance <= maxDistance) {
            const currentPos = origin
                .clone()
                .add(direction.clone().multiplyScalar(currentDistance));
            const geoPos = this.projection.unprojectPoint(currentPos);

            if (geoPos) {
                const terrainHeight = elevationProvider.getHeight(geoPos) ?? 0;
                if (geoPos.altitude <= terrainHeight + 0.001) {
                    // small tolerance
                    result.copy(currentPos);
                    return currentDistance;
                }

                // adaptive step size
                const step = Math.max(minStep, Math.min(geoPos.altitude - terrainHeight, 50));
                currentDistance += step;
            } else {
                currentDistance += minStep;
            }
        }
        return -1;
    }

    /**
     * Gets a copy of the camera's world transformation matrix
     * @param outMatrix Optional matrix to store the result (avoids allocation if provided)
     * @returns The camera's world transformation matrix
     */
    public getMatrix(outMatrix?: Matrix4): Matrix4 {
        if (outMatrix) {
            outMatrix.copy(this.cameraToWorld); // Copy to existing matrix if provided
            return outMatrix;
        }
        return this.cameraToWorld.clone(); // Return new copy if no output matrix provided
    }

    abstract getDistanceAndNormal(position: Vector3, normal?: Vector3): number;

    /**
     * Applies panning velocity to the camera
     * @param step The time step/factor for movement
     * @param panVelocityX Horizontal pan velocity
     * @param panVelocityY Vertical pan velocity
     */
    public abstract applyPanVelocity(
        step: number,
        panVelocityX: number,
        panVelocityY: number
    ): void;

    /**
     * Performs ray casting against the projection surface
     * @param result Output vector for intersection point
     * @param origin Origin point of the ray in world space
     * @param target End point of the ray in world space
     * @returns The intersection distance (0-1) along the ray, or -1 if no intersection
     */
    public abstract rayCastProjectionWorld(
        result: Vector3,
        origin: Vector3,
        target: Vector3
    ): number;
}
