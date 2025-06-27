import { Vector3, Matrix4, Quaternion, Spherical, Vector4 } from "three";
import { slerpMatrices, sphericalLerp } from "./math";
import { ElevationProvider } from "@flywave/flywave-mapview";

/**
 * A camera controller that provides smooth transitions and advanced movement controls
 * using matrix transformations. Supports great circle paths, pivot-based rotations,
 * and tilt-limited movements.
 */
export abstract class CameraTransform {
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
        referenceMatrix?: Matrix4 // 可选参数
    ): void {
        // 1. 确定参考矩阵（优先用传入的，否则用当前相机矩阵）
        const refMatrix = referenceMatrix || this.cameraToWorld;

        // 2. 旋转插值（使用Three.js的Quaternion.slerp）
        const sourceQuat = new Quaternion().setFromRotationMatrix(source);
        const refQuat = new Quaternion().setFromRotationMatrix(refMatrix);
        const resultQuat = new Quaternion().slerpQuaternions(
            refQuat,
            sourceQuat,
            interpolationFactor
        );

        // 3. 位置插值（线性Lerp）
        const sourcePos = new Vector3().setFromMatrixPosition(source);
        const refPos = new Vector3().setFromMatrixPosition(refMatrix);
        const resultPos = refPos.lerp(sourcePos, interpolationFactor);

        // 4. 组合结果
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
        // 1. 提取起始和结束位置
        const startPos = new Vector3().setFromMatrixPosition(start);
        const endPos = new Vector3().setFromMatrixPosition(end);

        // 2. 线性插值位置 (与原始版本一致)
        const interpPos = new Vector3(
            startPos.x + (endPos.x - startPos.x) * interpolationFactor,
            startPos.y + (endPos.y - startPos.y) * interpolationFactor,
            startPos.z + (endPos.z - startPos.z) * interpolationFactor
        );

        // 3. 计算距离缩放因子 (与原始版本一致)
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

        // 4. 矩阵插值 (保持与原始版本相同的逻辑)
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

        // 5. 设置最终位置 (考虑缩放因子)
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

    /**
     * Rotates the camera around an arbitrary axis
     * @param axisX X component of rotation axis
     * @param axisY Y component of rotation axis
     * @param axisZ Z component of rotation axis
     * @param angle Rotation angle in radians
     */
    public rotate(axisX: number, axisY: number, axisZ: number, angle: number): void {
        const axis = new Vector3(axisX, axisY, axisZ).normalize();
        this.cameraToWorld.multiply(new Matrix4().makeRotationAxis(axis, angle));
    }

    public zoom(target: Vector3, interpolationFactor: number) {
        var r = this.cameraToWorld;
        r[12] += (target[0] - r[12]) * interpolationFactor;
        r[13] += (target[1] - r[13]) * interpolationFactor;
        r[14] += (target[2] - r[14]) * interpolationFactor;
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
        const { width, height } = this.getViewPort();
        const vector = new Vector3((x / width) * 2 - 1, -(y / height) * 2 + 1, depth);

        const worldMatrix = new Matrix4().multiplyMatrices(
            this.cameraToWorld,
            this.getCameraProjectionMatrix()
        );

        vector.applyMatrix4(worldMatrix);
        out.copy(vector);
    }

    /**
     * Limits the camera tilt relative to a pivot point
     * @param pivot Pivot point coordinates [x,y,z]
     * @param up Up vector coordinates [x,y,z]
     * @param maxTilt Maximum tilt angle in radians
     */
    public tiltLimit(pivot: Vector3, up: Vector3, maxTilt: number): void {
        const position = new Vector3().fromArray(this.cameraToWorld.elements, 12);
        position.sub(pivot);

        const forward = new Vector3().setFromMatrixColumn(this.cameraToWorld, 2);
        const right = new Vector3().setFromMatrixColumn(this.cameraToWorld, 0);

        const upDot = forward.dot(up);
        const rightDot = right.dot(up);

        if (rightDot < 0) {
            if (upDot > -Math.sin(maxTilt)) {
                const sign = rightDot > 0 ? -1 : 1;
                this.rotateAroundPivot(
                    pivot[0],
                    pivot[1],
                    pivot[2],
                    right.x,
                    right.y,
                    right.z,
                    sign * (Math.asin(upDot) + maxTilt) * 0.5
                );
            }
        } else {
            this.rotateAroundPivot(
                pivot[0],
                pivot[1],
                pivot[2],
                right.x,
                right.y,
                right.z,
                -Math.asin(rightDot) * 0.5
            );
        }

        position.add(pivot);
        this.cameraToWorld.setPosition(position);
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
        const pivot = new Vector3(pivotX, pivotY, pivotZ);
        const position = new Vector3().fromArray(this.cameraToWorld.elements, 12).sub(pivot);

        const rotationMatrix = new Matrix4().makeRotationAxis(
            new Vector3(axisX, axisY, axisZ).normalize(),
            angle
        );

        position.applyMatrix4(rotationMatrix);
        this.cameraToWorld.multiply(rotationMatrix);
        this.cameraToWorld.setPosition(position.add(pivot));
    }

    /**
     * Rotates the camera around a pivot point with optional tilt
     * @param pivotX Pivot X coordinate
     * @param pivotY Pivot Y coordinate
     * @param pivotZ Pivot Z coordinate
     * @param axisX Rotation axis X component
     * @param axisY Rotation axis Y component
     * @param axisZ Rotation axis Z component
     * @param angle Rotation angle in radians
     * @param tilt Tilt angle in radians
     * @param maxTilt Optional maximum tilt angle in radians
     * @returns True if tilt correction was applied
     */
    public rotateAroundPivotAndTilt(
        pivotX: number,
        pivotY: number,
        pivotZ: number,
        axisX: number,
        axisY: number,
        axisZ: number,
        angle: number,
        tilt: number,
        maxTilt?: number
    ): boolean {
        const pivot = new Vector3(pivotX, pivotY, pivotZ);
        const position = new Vector3().fromArray(this.cameraToWorld.elements, 12).sub(pivot);

        // Main rotation
        const mainRotation = new Matrix4().makeRotationAxis(
            new Vector3(axisX, axisY, axisZ).normalize(),
            angle
        );

        position.applyMatrix4(mainRotation);
        this.cameraToWorld.multiply(mainRotation);

        // Tilt rotation
        const right = new Vector3().setFromMatrixColumn(this.cameraToWorld, 0).normalize();
        const tiltRotation = new Matrix4().makeRotationAxis(right, tilt);
        this.cameraToWorld.multiply(tiltRotation);

        let needsCorrection = false;

        // Tilt limit
        if (maxTilt !== undefined) {
            const forward = new Vector3().setFromMatrixColumn(this.cameraToWorld, 2);
            const up = new Vector3(axisX, axisY, axisZ).normalize();

            const upDot = forward.dot(up);
            const rightDot = right.dot(up);

            if (rightDot < 0) {
                if (upDot > Math.sin(maxTilt)) {
                    const sign = rightDot > 0 ? -1 : 1;
                    const correction = sign * (Math.asin(upDot) + maxTilt);
                    const correctionRotation = new Matrix4().makeRotationAxis(right, correction);
                    this.cameraToWorld.multiply(correctionRotation);
                    needsCorrection = true;
                }
            } else {
                const correction = -Math.asin(rightDot);
                const correctionRotation = new Matrix4().makeRotationAxis(right, correction);
                this.cameraToWorld.multiply(correctionRotation);
                needsCorrection = true;
            }
        }

        this.cameraToWorld.setPosition(position.add(pivot));
        return needsCorrection;
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
        cameraPosition: Vector3,
        rayTargetPoint: Vector3,
        inertialAxis: Vector4,
        step: number
    );

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

    /**
     * Gets the camera's projection matrix
     * @returns The 4x4 projection matrix
     */
    protected abstract getCameraProjectionMatrix(): Matrix4;

    /**
     * Gets the current viewport dimensions
     * @returns Vector4 containing viewport parameters [x,y,width,height]
     */
    protected abstract getViewPort(): Vector4;

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
