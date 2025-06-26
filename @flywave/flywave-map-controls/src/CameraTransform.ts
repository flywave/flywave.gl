import { Vector3, Matrix4, Quaternion, Spherical, Vector4 } from "three";
import { slerpMatrices, sphericalLerp } from "./math";

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
        // Get start and end positions
        const startPos = new Vector3().setFromMatrixPosition(start);
        const endPos = new Vector3().setFromMatrixPosition(end);
        const pivotPos = pivot;

        // Interpolate spherical coordinates
        const interpolatedPos = new Vector3().setFromSpherical(
            sphericalLerp(
                new Spherical().setFromVector3(startPos),
                new Spherical().setFromVector3(endPos),
                interpolationFactor
            )
        );

        // Handle matrix interpolation
        let resultMatrix: Matrix4;
        if (intermediateMatrix) {
            if (intermediateStart === undefined) {
                // Two-stage interpolation
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
                // Phased interpolation
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
            // Direct interpolation
            resultMatrix = slerpMatrices(this.cameraToWorld, end, interpolationFactor);
        }

        // Set final position along great circle path
        const direction = interpolatedPos.sub(pivotPos).normalize();
        resultMatrix.setPosition(pivotPos.clone().add(direction.multiplyScalar(radius)));

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
     * @param outMatrix Output matrix
     */
    public getWorldToCamera(outMatrix: Matrix4): void {
        outMatrix.copy(this.cameraToWorld).invert();
    }

    /**
     * Gets the camera's origin position
     * @param out Output array [x,y,z]
     */
    public getOrigin(out: Vector3): void {
        out.fromArray(this.cameraToWorld.elements, 12);
    }

    /**
     * Gets the camera's right vector
     * @param out Output array [x,y,z]
     */
    public getRight(out: Vector3): void {
        out.setFromMatrixColumn(this.cameraToWorld, 0).normalize();
    }

    /**
     * Gets the camera's up vector
     * @param out Output array [x,y,z]
     */
    public getUp(out: Vector3): void {
        out.setFromMatrixColumn(this.cameraToWorld, 1).normalize();
    }

    /**
     * Gets the camera's down vector
     * @param out Output array [x,y,z]
     */
    public getDown(out: Vector3): void {
        this.getUp(out);
        out.negate();
    }

    /**
     * Gets the camera's forward vector
     * @param out Output array [x,y,z]
     */
    public getForward(out: Vector3): void {
        out.setFromMatrixColumn(this.cameraToWorld, 2);
    }

    protected abstract collisionTo(
        outTarget: Vector3,
        sourcePoint: Vector3,
        targetPoint: Vector3,
        radius: number
    ): boolean;

    abstract inertialPan(targetPoint: Vector3, inertialAxis: Vector4, inertial: number): void;

    abstract pan(
        target: Vector3,
        startPoint: Vector3,
        targetPoint: Vector3,
        inertialAxis: Vector4,
        step: number
    );

    protected abstract getCameraProjectionMatrix(): Matrix4;

    protected abstract getViewPort(): Vector4;
}
