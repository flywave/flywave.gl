import { dispatch as _dispatch } from "d3-dispatch";
import { Matrix4, Vector3, Quaternion, Spherical, Vector4 } from "three";
import { GeoCoordinates, EarthConstants } from "@flywave/flywave-geoutils";
import { CameraTransform } from "./CameraTransform";
import { slerpMatrices, sphericalLerp, rayCastToEllipsoid } from "./math";

interface ZoomAnimationState {
    time: number;
    speed: number;
    mode: number;
    toCity: boolean;
    distance: number;
    heightRatio: number;
    startMatrix: Matrix4;
    endMatrix: Matrix4;
    midMatrix: Matrix4;
    start: number[];
    end: number[];
    globeCenter: Vector3;
    finishCallback?: (controller: FreeControls) => void;
}

interface MouseState {
    x: number;
    y: number;
    z: number;
    down: [boolean, boolean, boolean];
    prevDown: [boolean, boolean, boolean];
}

export abstract class FreeControls {
    // Application references
    private mapView: any;
    private application: any;
    private view: any;
    private camera: CameraTransform;

    // Control state
    private inertialDeltaX: number = 0;
    private inertialDeltaY: number = 0;
    private inertialAxis: Vector4 = new Vector4();

    // Hit detection
    private lastHitDistance: number = -1;
    private lastHit: Vector3 = new Vector3();
    private isPanHit: boolean = false;
    private panHit: Vector3 = new Vector3();
    private lastHitCenterDistance: number = -1;
    private lastHitCenter: Vector3 = new Vector3();
    private lastHitCenterClick: Vector3 = new Vector3();
    private lastHitGravity: Vector3 = new Vector3(); // Rotate pivot
    private lastHitDistToGlobe: number = 0;

    // Animation controls
    private smoothZoom: number = 0;
    private panVelocityX: number = 0;
    private panVelocityY: number = 0;
    private zoomVelocity: number = 0;
    private tiltVelocity: number = 0;
    private headingVelocity: number = 0;

    // Mouse state
    private mouseState: MouseState = {
        x: 0,
        y: 0,
        z: 0,
        down: [false, false, false],
        prevDown: [false, false, false]
    };

    // Control limits
    private tiltLimit: number = Math.PI * 0.01;
    private distanceLimit: number = 50;
    private limitZoomOut: number = 1.5;

    // Camera state
    private headingSet?: number;
    private tiltSet?: number;
    private zoomAnimationState?: ZoomAnimationState;
    private lockCenterPoint: Vector3 | null = null;
    private cameraSwivel: boolean = false;

    // Viewport dimensions
    private width: number = 0;
    private height: number = 0;

    // Disable flags
    private _disableTilt: boolean = false;
    private _disableHeading: boolean = false;

    protected abstract getCameraTransform(): CameraTransform;

    constructor(application: any, window: any) {
        this.mapView = application;
        this.application = application;
        this.view = window;
    }

    get cameraTransform() {
        return this.getCameraTransform();
    }

    public update(): boolean {
        // Update viewport dimensions
        const { width, height } = this.mapView.getCanvasClientSize();
        this.width = width;
        this.height = height;

        // Get current mouse state
        const mouseX = this.width - this.view.lastMouseX;
        const mouseY = this.height - this.view.lastMouseY;
        const mouseDown = this.view.mouseDown;
        const mouseZ = this.view.lastMouseZ;

        // Handle zoom animations
        if (this.zoomAnimationState) {
            return this.handleZoomAnimation(mouseDown, mouseZ);
        }

        // Get camera position and calculate globe distance
        const cameraPos = new Vector3();
        this.camera.getOrigin(cameraPos);

        const normal = new Vector3();
        const distanceToGlobe = this.getDistanceToGlobe(
            cameraPos.x,
            cameraPos.y,
            cameraPos.z,
            normal
        );

        // Handle mouse interactions
        const hitPoint = new Vector3();
        const hitDistance = this.handleMouseInteractions(
            mouseX,
            mouseY,
            mouseDown,
            mouseZ,
            cameraPos,
            hitPoint
        );

        // Handle panning operations
        this.handlePanning(mouseDown, cameraPos, hitPoint, distanceToGlobe);

        // Handle zoom operations
        this.handleZoomOperations(mouseZ, hitDistance, cameraPos);

        if (mouseDown[2]) {
            // 右键按下
            // 只有当不禁用tilt和heading时才处理旋转
            const canRotate = !this._disableTilt && !this._disableHeading;

            // 更新prevDown状态（对应原始代码中的R[2]）
            this.mouseState.prevDown[2] = canRotate;

            // 只有当允许旋转时才处理旋转操作
            if (canRotate) {
                this.handleRotationOperations(mouseDown, mouseX, mouseY);
            }
        }

        // Apply tilt and heading changes
        this.applyTiltAndHeadingChanges();

        // Apply distance limits
        this.applyDistanceLimits(cameraPos, normal, distanceToGlobe);

        // Update previous mouse state
        this.updateMouseState(mouseX, mouseY, mouseZ, mouseDown);

        return false;
    }

    // ======================
    // Animation Handling
    // ======================

    private handleZoomAnimation(mouseDown: boolean[], mouseZ: number): boolean {
        if (!this.zoomAnimationState) return false;

        const { time, speed, toCity } = this.zoomAnimationState;

        if (time > 1) {
            this.completeZoomAnimation();
            return false;
        }

        if (toCity) {
            this.handleCityZoomAnimation();
        } else {
            this.handleStandardZoomAnimation();
        }

        // Check for interruption
        const isWheel = mouseZ !== this.mouseState.z;
        if (
            isWheel ||
            (mouseDown[0] && !this.mouseState.prevDown[0]) ||
            (mouseDown[2] && !this.mouseState.prevDown[2])
        ) {
            this.cancelZoomAnimation();
        }

        return true;
    }

    private cancelZoomAnimation(): void {
        if (!this.zoomAnimationState) return;

        // 如果有回调函数则执行
        if (this.zoomAnimationState.finishCallback) {
            this.zoomAnimationState.finishCallback(this);
        }

        // 重置动画状态
        this.zoomAnimationState = undefined;

        // 重置其他相关状态
        this.inertialDeltaX = 0;
        this.inertialDeltaY = 0;
        this.lastHitCenterDistance = -1;
        this.lastHitDistance = -1;

        // 更新焦点中心
        this.updateCenter();
    }

    private completeZoomAnimation(): void {
        if (!this.zoomAnimationState) return;

        this.zoomAnimationState.time = 1;
        this.zoomAnimationState = undefined;

        if (this.zoomAnimationState?.finishCallback) {
            this.zoomAnimationState.finishCallback(this);
        }

        this.updateCenter();
    }

    private handleCityZoomAnimation(): void {
        if (!this.zoomAnimationState) return;

        const { time, start, end, distance } = this.zoomAnimationState;
        const cameraPos = new Vector3();
        this.camera.getOrigin(cameraPos);

        // Calculate eased time values
        const easeInOut = time * time * (3 - 2 * time);
        const linear = time * (1 - time * 0.5) * 2;

        // Handle different distance cases
        if (distance > 0.1 * this.getEquatorialRadius()) {
            this.handleLongDistanceZoom(easeInOut, linear);
        } else {
            this.handleShortDistanceZoom(easeInOut);
        }
    }

    private handleShortDistanceZoom(easeInOut: number): void {
        if (
            !this.zoomAnimationState ||
            !this.zoomAnimationState.start ||
            !this.zoomAnimationState.end
        ) {
            console.warn("Invalid zoom animation state");
            return;
        }

        const { start, end } = this.zoomAnimationState;

        // 1. 直接插值高度（不需要峰值过渡）
        const currentAltitude = start[2] + (end[2] - start[2]) * easeInOut;

        // 2. 平滑插值俯仰角（tilt）
        const currentTilt = start[4] + (end[4] - start[4]) * easeInOut;

        // 3. 线性插值经纬度
        const currentLon = start[1] + (end[1] - start[1]) * easeInOut;
        const currentLat = start[0] + (end[0] - start[0]) * easeInOut;

        // 4. 插值相机距离
        const currentDistance = start[3] + (end[3] - start[3]) * easeInOut;

        // 5. 处理航向角（heading）的最短路径
        let headingDelta = end[5] - start[5];
        if (headingDelta > Math.PI) headingDelta -= 2 * Math.PI;
        if (headingDelta < -Math.PI) headingDelta += 2 * Math.PI;
        const currentHeading = start[5] + headingDelta * this.zoomAnimationState.time;

        // 6. 应用计算结果
        this.setTo(
            currentLat,
            currentLon,
            currentAltitude,
            currentDistance,
            currentTilt,
            currentHeading
        );

        // 7. 恒定速度动画（近距离不需要动态速度）
        const speedFactor = this.zoomAnimationState.speed * 0.05;
        this.zoomAnimationState.time += speedFactor;
    }

    private handleLongDistanceZoom(easeInOut: number, linear: number): void {
        if (!this.zoomAnimationState) return;

        const { start, end, distance } = this.zoomAnimationState;
        const equatorialRadius = this.getEquatorialRadius();

        // 1. 计算中间过渡点（峰值高度）
        const peakAltitude = distance * 0.75;

        // 2. 分阶段插值高度
        const startToPeak = start[2] + (peakAltitude - start[2]) * easeInOut;
        const peakToEnd = peakAltitude + (end[2] - peakAltitude) * easeInOut;
        const currentAltitude = startToPeak + (peakToEnd - startToPeak) * easeInOut;

        // 3. 处理俯仰角变化（tilt）
        let currentTilt = 0;
        const tiltTransitionPoint = 0.9;

        if (this.zoomAnimationState.time < tiltTransitionPoint) {
            const t = this.zoomAnimationState.time / tiltTransitionPoint;
            const easedT = t * t * (3 - 2 * t); // 平滑过渡
            currentTilt = start[4] + (0 - start[4]) * easedT; // 从当前tilt过渡到0（俯视）
        } else {
            const t =
                (this.zoomAnimationState.time - tiltTransitionPoint) / (1 - tiltTransitionPoint);
            const easedT = t * t * (3 - 2 * t);
            currentTilt = end[4] * easedT; // 从0过渡到目标tilt
        }

        // 4. 线性插值经纬度（比高度变化更快）
        const currentLon = start[1] + (end[1] - start[1]) * linear;
        const currentLat = start[0] + (end[0] - start[0]) * linear;

        // 5. 计算距离插值（带缓动）
        const currentDistance = start[3] + (end[3] - start[3]) * easeInOut;

        // 6. 处理航向角（heading）的最短路径插值
        let headingDelta = end[5] - start[5];
        if (headingDelta > Math.PI) headingDelta -= 2 * Math.PI;
        if (headingDelta < -Math.PI) headingDelta += 2 * Math.PI;
        const currentHeading = start[5] + headingDelta * this.zoomAnimationState.time;

        // 7. 应用计算结果
        this.setTo(
            currentLat,
            currentLon,
            currentAltitude,
            currentDistance,
            currentTilt,
            currentHeading
        );

        // 8. 动态调整动画速度（距离越远速度越快）
        const speedFactor = (currentDistance / 30) * this.zoomAnimationState.speed;
        this.zoomAnimationState.time += speedFactor * 0.05;
    }

    private getMatrixPositionDistance(mat1: Matrix4, mat2: Matrix4): number {
        // 提取两个矩阵的平移分量
        const pos1 = new Vector3().setFromMatrixPosition(mat1);
        const pos2 = new Vector3().setFromMatrixPosition(mat2);

        // 返回两点之间的欧氏距离
        return pos1.distanceTo(pos2);
    }

    private handleStandardZoomAnimation(): void {
        if (!this.zoomAnimationState) return;

        const { time, speed, startMatrix, endMatrix, midMatrix } = this.zoomAnimationState;
        const cameraPos = new Vector3();
        this.camera.getOrigin(cameraPos);

        const distance = this.getDistanceToGlobe(cameraPos.x, cameraPos.y, cameraPos.z);
        const matrixDistance = this.getMatrixPositionDistance(startMatrix, endMatrix);

        // Calculate animation step
        const step = (speed * 0.05 * distance) / matrixDistance;
        this.zoomAnimationState.time += step;

        if (this.zoomAnimationState.time >= 1) {
            this.completeZoomAnimation();
            this.camera.setMatrix(endMatrix);
        } else {
            if (this.zoomAnimationState.mode === 1) {
                this.camera.followMatrix(endMatrix, time, startMatrix);
            } else {
                const pivot = new Vector3().fromArray(
                    this.zoomAnimationState.globeCenter.toArray()
                );
                const radius = this.getDistanceToGlobe(pivot.x, pivot.y, pivot.z);

                this.camera.followMatrixGreatCircle(
                    startMatrix,
                    endMatrix,
                    time,
                    pivot,
                    radius,
                    midMatrix,
                    0.5
                );
            }
        }
    }

    // ======================
    // Interaction Handling
    // ======================

    private handleMouseInteractions(
        mouseX: number,
        mouseY: number,
        mouseDown: boolean[],
        mouseZ: number,
        cameraPos: Vector3,
        hitPoint: Vector3
    ): number {
        const isClick = mouseDown[0] && !this.mouseState.prevDown[0];
        const isWheel = mouseZ !== this.mouseState.z;

        if (isWheel || isClick) {
            const target = new Vector3();
            this.camera.unprojectToWorld(target, mouseX, mouseY, -1);

            const hitDistance = this.rayCastZoomPoint(hitPoint, cameraPos, target, isWheel);

            if (hitDistance > 0) {
                this.lastHitDistance = hitDistance;
                this.lastHit.copy(hitPoint);

                if (isClick) {
                    this.isPanHit = true;
                    this.panHit.copy(hitPoint);
                }
                return hitDistance;
            }
        }
        return -1;
    }

    private handlePanning(
        mouseDown: boolean[],
        cameraPos: Vector3,
        hitPoint: Vector3,
        distanceToGlobe: number
    ): void {
        if (mouseDown[0] && this.isPanHit) {
            const target = new Vector3();
            this.camera.unprojectToWorld(
                target,
                this.width - this.view.lastMouseX,
                this.height - this.view.lastMouseY,
                -1
            );

            this.camera.pan(this.panHit, cameraPos, target, this.inertialAxis, 0.2);
        } else if (this.inertialAxis.length() > 0) {
            this.camera.inertialPan(cameraPos, this.inertialAxis, 0.075);
        }

        if (this.panVelocityX !== 0 || this.panVelocityY !== 0) {
            const panStep = distanceToGlobe * 0.03 * 0.025;
            this.applyPanVelocity(panStep, cameraPos);
        }
    }

    private handleZoomOperations(mouseZ: number, hitDistance: number, cameraPos: Vector3): void {
        // Smooth zoom interpolation
        const prevSmoothZoom = this.smoothZoom;
        this.smoothZoom += (mouseZ - this.smoothZoom) * 0.3;

        if (this.smoothZoom !== prevSmoothZoom) {
            if (hitDistance > 0 || (mouseZ === this.mouseState.z && this.lastHitDistance > 0)) {
                const zoomDelta = (this.smoothZoom - prevSmoothZoom) * 0.08;
                const distanceRatio =
                    this.lastHit.distanceTo(cameraPos) / this.getEquatorialRadius();

                let damping = 1;
                if (zoomDelta < 0 && distanceRatio > this.limitZoomOut) {
                    damping = (this.limitZoomOut * 2 - distanceRatio) / this.limitZoomOut;
                }

                this.camera.zoom(this.lastHit, zoomDelta * damping);
            }
        }

        // Velocity-based zoom
        if (this.zoomVelocity !== 0 && this.lastHitCenterDistance > 0) {
            const zoomDelta = this.zoomVelocity * 0.03;
            const distance = this.lastHitCenter.distanceTo(cameraPos);

            let damping = 1;
            if (zoomDelta < 0 && distance > this.limitZoomOut) {
                damping = (this.limitZoomOut * 2 - distance) / this.limitZoomOut;
            }

            this.camera.zoom(this.lastHitCenter, zoomDelta * damping);
        }
    }

    private handleRotationOperations(mouseDown: boolean[], mouseX: number, mouseY: number): void {
        const rotationDamping = 0.1;

        if (mouseDown[2] && this.mouseState.prevDown[2]) {
            const deltaX = mouseX - this.mouseState.x;
            const deltaY = mouseY - this.mouseState.y;

            // Apply inertia with different damping based on acceleration
            if (Math.abs(deltaX) > Math.abs(this.inertialDeltaX)) {
                this.inertialDeltaX += (deltaX - this.inertialDeltaX) * rotationDamping * 2.5;
            } else {
                this.inertialDeltaX += (deltaX - this.inertialDeltaX) * rotationDamping * 2;
            }

            if (Math.abs(deltaY) > Math.abs(this.inertialDeltaY)) {
                this.inertialDeltaY += (deltaY - this.inertialDeltaY) * rotationDamping * 2.5;
            } else {
                this.inertialDeltaY += (deltaY - this.inertialDeltaY) * rotationDamping * 2;
            }
        } else {
            // Deceleration when not rotating
            this.inertialDeltaX += (0 - this.inertialDeltaX) * rotationDamping * 0.75;
            this.inertialDeltaY += (0 - this.inertialDeltaY) * rotationDamping * 0.75;
        }

        // Apply rotation if we have a center point
        if (
            this.lastHitCenterDistance > 0 &&
            (this.inertialDeltaX !== 0 || this.inertialDeltaY !== 0)
        ) {
            const rotationStep = 0.0045;
            const tiltStep = rotationStep * 0.5;

            let pivotPoint = this.lastHitCenter;

            const camPos = new Vector3();
            this.camera.getOrigin(camPos);
            if (this.cameraSwivel) {
                // 使用相机位置或点击位置作为旋转中心
                pivotPoint = this.lastHitCenterClick || camPos;
            }

            let gravityPoint = this.lastHitGravity;

            if (this.cameraSwivel) {
                pivotPoint = camPos;
                this.getDistanceToGlobe(camPos.x, camPos.y, camPos.z, gravityPoint);
            }

            this.camera.rotateAroundPivotAndTilt(
                pivotPoint.x,
                pivotPoint.y,
                pivotPoint.z,
                gravityPoint.x,
                gravityPoint.y,
                gravityPoint.z,
                -this.inertialDeltaX * rotationStep,
                this.inertialDeltaY * tiltStep,
                this.tiltLimit
            );
        }
    }

    // ======================
    // Helper Methods
    // ======================

    private applyTiltAndHeadingChanges(): void {
        if (
            (this.headingSet !== undefined || this.tiltSet !== undefined) &&
            this.lastHitCenterDistance > 0
        ) {
            if (this.headingSet !== undefined) {
                this.applyHeadingChange();
            }

            if (this.tiltSet !== undefined) {
                this.applyTiltChange();
            }

            this.headingSet = undefined;
            this.tiltSet = undefined;
        } else if (this.tiltVelocity !== 0 || this.headingVelocity !== 0) {
            const rotationStep = 0.03;
            if (this.lastHitCenterDistance > 0) {
                this.camera.rotateAroundPivotAndTilt(
                    this.lastHitCenter.x,
                    this.lastHitCenter.y,
                    this.lastHitCenter.z,
                    this.lastHitGravity.x,
                    this.lastHitGravity.y,
                    this.lastHitGravity.z,
                    this.headingVelocity * rotationStep,
                    this.tiltVelocity * rotationStep,
                    this.tiltLimit
                );
            }
        }
    }

    private applyHeadingChange(): void {
        const right = new Vector3();
        this.camera.getRight(right);

        const rotationMatrix = new Matrix4();
        this.setRotationLookDown(rotationMatrix, this.lastHitGravity);
        rotationMatrix.multiply(new Matrix4().makeRotationZ(this.headingSet || 0));

        const angle = Math.acos(
            Math.min(
                Math.max(
                    right.x * rotationMatrix.elements[0] +
                        right.y * rotationMatrix.elements[1] +
                        right.z * rotationMatrix.elements[2],
                    -1
                ),
                1
            )
        );

        const direction =
            right.x * rotationMatrix.elements[4] +
            right.y * rotationMatrix.elements[5] +
            right.z * rotationMatrix.elements[6];

        this.camera.rotateAroundPivot(
            this.lastHitCenter.x,
            this.lastHitCenter.y,
            this.lastHitCenter.z,
            this.lastHitGravity.x,
            this.lastHitGravity.y,
            this.lastHitGravity.z,
            direction > 0 ? -angle : angle
        );

        this.inertialDeltaX = 0;
    }

    private applyTiltChange(): void {
        const down = new Vector3();
        const forward = new Vector3();
        this.camera.getDown(down);
        this.camera.getForward(forward);

        const downDot =
            this.lastHitGravity.x * down.x +
            this.lastHitGravity.y * down.y +
            this.lastHitGravity.z * down.z;

        const forwardDot =
            this.lastHitGravity.x * forward.x +
            this.lastHitGravity.y * forward.y +
            this.lastHitGravity.z * forward.z;

        let angle = Math.acos(Math.min(Math.max(downDot, -1), 1));
        if (forwardDot > 0) angle = -angle;

        this.camera.rotateAroundPivotAndTilt(
            this.lastHitCenter.x,
            this.lastHitCenter.y,
            this.lastHitCenter.z,
            this.lastHitGravity.x,
            this.lastHitGravity.y,
            this.lastHitGravity.z,
            0,
            angle - (Math.PI * 0.5 - (this.tiltSet || 0)),
            this.tiltLimit
        );

        this.inertialDeltaY = 0;
    }

    private applyDistanceLimits(
        cameraPos: Vector3,
        normal: Vector3,
        distanceToGlobe: number
    ): void {
        const geoCoords = [0, 0, 0];
        this.getLatLonAlt(geoCoords, cameraPos.x, cameraPos.y, cameraPos.z);

        const altitude = geoCoords[2];
        const limitAltitude = altitude - this.distanceLimit;
        const terrainHeight = this.getAltitude(geoCoords[1], geoCoords[0], limitAltitude);
        const actualDistance = altitude - terrainHeight;

        if (actualDistance < this.distanceLimit) {
            const correction = this.distanceLimit - actualDistance;
            cameraPos.x -= correction * normal.x;
            cameraPos.y -= correction * normal.y;
            cameraPos.z -= correction * normal.z;
            this.camera.setOrigin(cameraPos.x, cameraPos.y, cameraPos.z);
        }
    }

    private updateMouseState(x: number, y: number, z: number, down: boolean[]): void {
        this.mouseState.x = x;
        this.mouseState.y = y;
        this.mouseState.z = z;
        this.mouseState.prevDown = [...this.mouseState.down];
        this.mouseState.down = [...down] as [boolean, boolean, boolean];
    }

    private applyPanVelocity(step: number, cameraPos: Vector3): void {
        const right = new Vector3();
        const up = new Vector3();
        this.camera.getRight(right);
        this.camera.getUp(up);

        cameraPos.add(right.multiplyScalar(this.panVelocityX * step));
        cameraPos.add(up.multiplyScalar(this.panVelocityY * step));
        this.camera.setOrigin(cameraPos.x, cameraPos.y, cameraPos.z);
    }

    // ========================
    // Public Interface Methods
    // ========================

    public isPanning(): boolean {
        return (
            this.zoomAnimationState?.time !== undefined ||
            this.panVelocityX !== 0 ||
            this.panVelocityY !== 0
        );
    }

    public disableTilt(): void {
        this._disableTilt = true;
    }

    public disableHeading(): void {
        this._disableHeading = true;
    }

    // =====================
    // Coordinate Conversion
    // =====================

    public projectPoint(geoCoordinates: GeoCoordinates, out?: Vector3): Vector3 {
        const originalScale = this.mapView.projection.unitScale;
        this.mapView.projection.unitScale = this.getEquatorialRadius();
        const projected = this.mapView.projection.projectPoint(geoCoordinates, out);
        this.mapView.projection.unitScale = originalScale;
        return projected;
    }

    public unprojectPoint(xyz: Vector3): GeoCoordinates {
        const originalScale = this.mapView.projection.unitScale;
        this.mapView.projection.unitScale = this.getEquatorialRadius();
        const unprojected = this.mapView.projection.unprojectPoint(xyz);
        this.mapView.projection.unitScale = originalScale;
        return unprojected;
    }

    public getXYZ(result: Vector3, lon: number, lat: number, alt: number): void {
        const xyz = this.projectPoint(new GeoCoordinates(lat, lon, alt));
        result.copy(xyz);
    }

    public getLatLonAlt(result: number[], x: number, y: number, z: number): void {
        const geo = this.unprojectPoint(new Vector3(x, y, z));
        result[0] = geo.latitude;
        result[1] = geo.longitude;
        result[2] = geo.altitude;
    }

    // ====================
    // Distance Calculations
    // ====================

    public getDistanceToGlobe(x: number, y: number, z: number, normal?: Vector3): number {
        const position = new Vector3(x, y, z);
        const normalVector = new Vector3();
        const distance = this.getDistanceAndNormal(normalVector, position);

        if (normal) {
            normal.set(-normalVector.x, -normalVector.y, -normalVector.z);
        }
        return distance;
    }

    public getDistanceAndNormal(result: Vector3, position: Vector3): number {
        const distance = position.length();
        const scale = 1 / distance;

        result.copy(position).multiplyScalar(scale);
        return distance - this.getEquatorialRadius();
    }

    public getAltitude(lon: number, lat: number, defaultHeight: number): number {
        if (this.mapView.zoomLevel < 13) return 0;
        return this.application.elevation
            ? this.application.elevation.getHeight(
                  new GeoCoordinates(lat, lon, defaultHeight),
                  true
              )
            : 0;
    }

    // =================
    // Camera Operations
    // =================

    public updateCenter(): void {
        const cameraPosition = new Vector3();
        this.camera.getOrigin(cameraPosition);
        this.focusCenter(cameraPosition);
    }

    private focusCenter(cameraPos: Vector3): number {
        const centerPoint = new Vector3();
        const screenCenter = new Vector3();
        let hitDistance = 0;
        if (!this.lockCenterPoint) {
            let screenY = this.height / 2;
            if (this.getTilt() > (Math.PI * 80) / 180) {
                screenY = this.height * 0.1;
            }

            this.camera.unprojectToWorld(screenCenter, this.width / 2, screenY, -1);

            hitDistance = this.rayCastToGlobeAndScene(
                centerPoint,
                cameraPos,
                screenCenter,
                this.width / 2,
                screenY
            );
            return hitDistance;
        } else {
            const cameraOrigin = new Vector3();
            this.camera.getOrigin(cameraOrigin);
            hitDistance = centerPoint.distanceTo(this.lockCenterPoint);
            centerPoint.copy(this.lockCenterPoint);
        }

        if (hitDistance > 0) {
            this.lastHitCenterDistance = hitDistance;
            this.lastHitCenter.copy(centerPoint);
            this.lastHitDistToGlobe = this.getDistanceToGlobe(
                centerPoint.x,
                centerPoint.y,
                centerPoint.z,
                this.lastHitGravity
            );
        }

        return hitDistance;
    }

    // ==============
    // Ray Casting
    // ==============

    public rayCastToGlobe(
        result: Vector3,
        source: Vector3,
        target: Vector3,
        hitCountPrecision: number = 0.01
    ): number {
        const scale = 1 / this.getEquatorialRadius();
        const scaledSource = source.clone().multiplyScalar(scale);
        const scaledTarget = target.clone().multiplyScalar(scale);

        const direction = new Vector3().subVectors(scaledTarget, scaledSource);
        const normal = new Vector3();
        const distance = this.getDistanceAndNormal(normal, source) * scale;

        const cross = new Vector3().crossVectors(direction, normal);
        const crossLength = cross.length();

        let stepSize = 1e32;
        if (crossLength > 0) {
            stepSize = distance * (1 << 13) - 50;
            if (stepSize < 1) stepSize = 1;
            stepSize *= 1 / ((1 << 19) * crossLength);
        }

        // Adjust for height map if available
        const heightScale =
            1 - this.mapView.heightMapSource.overlayerHeightMapTexture.digDepth / 6378137 || 1;
        let intersection =
            rayCastToEllipsoid(result, scaledSource, scaledTarget, heightScale, heightScale) *
            scale;

        if (intersection >= 0) {
            if (stepSize > intersection) {
                stepSize = intersection;
            }

            // Check for terrain collisions
            let terrainHeight = 0;
            let currentStep = 0;
            const testPoint = new Vector3();
            const geoCoords = new GeoCoordinates(0, 0, 0);

            while (currentStep <= 1) {
                testPoint.copy(scaledSource).add(direction.clone().multiplyScalar(currentStep));
                geoCoords.copy(this.unprojectPoint(testPoint.clone().divideScalar(scale)));

                geoCoords.altitude = 50; // Default altitude
                if (this.mapView.zoomLevel >= 13 && this.application.elevation) {
                    const height = this.application.elevation.getHeight(geoCoords) || 0;
                    if (geoCoords.altitude < height) {
                        terrainHeight = height;
                        break;
                    }
                }
                currentStep += hitCountPrecision;
            }

            // Adjust for terrain if needed
            if (terrainHeight > 0) {
                const terrainScale = 1 + terrainHeight * scale;
                intersection =
                    rayCastToEllipsoid(result, scaledSource, scaledTarget, 1, terrainScale) * scale;
            }

            result.divideScalar(scale);
            return intersection / scale;
        }

        return -1;
    }

    public rayCastZoomPoint(
        result: Vector3,
        origin: Vector3,
        target: Vector3,
        isWheel: boolean
    ): number {
        if (!this.lockCenterPoint || !isWheel) {
            return this.rayCastToGlobeAndScene(
                result,
                origin,
                target,
                this.view.lastMouseX,
                this.view.lastMouseY,
                false,
                true
            );
        } else {
            const cameraPos = new Vector3();
            this.camera.getOrigin(cameraPos);
            const distance = cameraPos.distanceTo(this.lockCenterPoint);
            result.copy(this.lockCenterPoint);
            return distance;
        }
    }

    // ==============
    // Camera Control
    // ==============

    public setTo(
        lon: number,
        lat: number,
        altitude: number,
        distance: number,
        theta: number,
        phi: number
    ): void {
        const position = new Vector3();
        this.getXYZ(position, lon, lat, altitude || 0);

        const normal = new Vector3();
        this.getDistanceToGlobe(position.x, position.y, position.z, normal);

        const matrix = new Matrix4();
        matrix.makeTranslation(position.x, position.y, position.z);
        this.setRotationLookDown(matrix, normal);

        if (phi !== undefined) {
            matrix.multiply(new Matrix4().makeRotationZ(phi));
        }

        matrix.multiply(new Matrix4().makeRotationX(theta !== undefined ? theta : Math.PI * 0.25));
        matrix.multiply(new Matrix4().makeTranslation(0, 0, distance));

        this.camera.setMatrix(matrix);
        this.inertialDeltaX = 0;
        this.inertialDeltaY = 0;
    }

    public setToWithVector(lon: number, lat: number, altitude: number, lookVector: Vector3): void {
        const position = new Vector3();
        this.getXYZ(position, lon, lat, altitude || 0);

        const matrix = new Matrix4();
        matrix.makeTranslation(position.x, position.y, position.z);

        if (lookVector) {
            const target = position.clone().add(lookVector);
            matrix.lookAt(position, target, new Vector3(0, 1, 0));
        }

        matrix.multiply(new Matrix4().makeTranslation(0, 0, 0));
        this.camera.setMatrix(matrix);
        this.inertialDeltaX = 0;
        this.inertialDeltaY = 0;
    }

    public flyTo(
        lat: number,
        lng: number,
        cameraDistance: number,
        speed: number,
        centerDistance: number,
        theta: number,
        phi: number,
        toCity: boolean = false,
        callback?: (controller: FreeControls) => void
    ): void {
        if (!this.zoomAnimationState) {
            this.zoomAnimationState = {
                time: 0,
                speed: speed || 1,
                mode: 0,
                toCity: false,
                distance: 0,
                heightRatio: 0.25,
                startMatrix: new Matrix4(),
                endMatrix: new Matrix4(),
                midMatrix: new Matrix4(),
                start: [90, 0, 0, 1000],
                end: [90, 0, 0, 1000],
                globeCenter: new Vector3(),
                finishCallback: callback
            };
        }

        const currentPos = new Vector3();
        this.camera.getOrigin(currentPos);

        const targetPos = new Vector3();
        this.projectPoint(new GeoCoordinates(lat, lng, 0), targetPos);
        targetPos.normalize();

        const currentCenter = new Vector3().fromArray(this.lastHitCenter.toArray()).normalize();

        // Check if we need city mode
        if (Math.acos(targetPos.dot(currentCenter)) > Math.PI / 4) {
            toCity = true;
            this.zoomAnimationState.speed = 0.4;
        }

        if (toCity && this.getLocationAtCenter(this.zoomAnimationState.start)) {
            this.zoomAnimationState.toCity = true;
            this.zoomAnimationState.start[4] = this.getTilt();
            this.zoomAnimationState.start[5] = this.getHeading();

            this.zoomAnimationState.end[0] = lat;
            this.zoomAnimationState.end[1] = lng;
            this.zoomAnimationState.end[2] = cameraDistance || 0;
            this.zoomAnimationState.end[3] = centerDistance || 0;
            this.zoomAnimationState.end[4] = theta || 0;
            this.zoomAnimationState.end[5] = phi || 0;

            const targetXYZ = new Vector3();
            this.getXYZ(targetXYZ, lng, lat, cameraDistance || 0);
            this.zoomAnimationState.distance = currentPos.distanceTo(targetXYZ);
            return;
        }

        this.zoomAnimationState.speed *= 5;
        const targetXYZ = new Vector3();
        this.getXYZ(targetXYZ, lng, lat, cameraDistance || 0);

        const normal = new Vector3();
        this.getDistanceToGlobe(targetXYZ.x, targetXYZ.y, targetXYZ.z, normal);

        this.camera.getMatrix(this.zoomAnimationState.startMatrix);

        this.zoomAnimationState.endMatrix.identity();
        this.zoomAnimationState.endMatrix.makeTranslation(targetXYZ.x, targetXYZ.y, targetXYZ.z);
        this.setRotationLookDown(this.zoomAnimationState.endMatrix, normal);

        if (phi !== undefined) {
            this.zoomAnimationState.endMatrix.multiply(new Matrix4().makeRotationZ(phi));
        }

        if (this.zoomAnimationState.mode !== 1) {
            this.zoomAnimationState.midMatrix.copy(this.zoomAnimationState.endMatrix);
            slerpMatrices(
                this.zoomAnimationState.midMatrix,
                this.zoomAnimationState.startMatrix,
                this.zoomAnimationState.midMatrix,
                0.5
            );
        }

        this.zoomAnimationState.endMatrix.multiply(new Matrix4().makeRotationX(theta));
        this.zoomAnimationState.endMatrix.multiply(
            new Matrix4().makeTranslation(0, 0, centerDistance || 0)
        );
    }

    // ==============
    // Helper Methods
    // ==============

    private setRotationLookDown(matrix: Matrix4, normal: Vector3): void {
        const up = new Vector3(0, 1, 0);
        const right = new Vector3().crossVectors(up, normal).normalize();
        const newUp = new Vector3().crossVectors(normal, right).normalize();

        matrix.elements[0] = right.x;
        matrix.elements[1] = right.y;
        matrix.elements[2] = right.z;

        matrix.elements[4] = newUp.x;
        matrix.elements[5] = newUp.y;
        matrix.elements[6] = newUp.z;

        matrix.elements[8] = -normal.x;
        matrix.elements[9] = -normal.y;
        matrix.elements[10] = -normal.z;
    }

    private getEquatorialRadius(): number {
        return EarthConstants.EQUATORIAL_RADIUS;
    }

    // ===================
    // Animation Controls
    // ===================

    public animatePan(x: number, y: number): void {
        this.panVelocityX = x;
        this.panVelocityY = y;
    }

    public animateHeading(v: number): void {
        this.headingVelocity = v;
    }

    public setHeading(v: number): void {
        this.headingSet = v;
    }

    public animateTilt(v: number): void {
        this.tiltVelocity = v;
    }

    public setTilt(v: number): void {
        this.tiltSet = v;
    }

    public animateZoom(v: number): void {
        this.zoomVelocity = v;
    }

    // ===================
    // State Query Methods
    // ===================

    public getHeading(): number {
        if (this.headingSet !== undefined) {
            return this.headingSet;
        }

        if (this.lastHitCenterDistance > 0) {
            const right = new Vector3();
            this.camera.getRight(right);

            const matrix = new Matrix4();
            this.setRotationLookDown(matrix, this.lastHitGravity);
            matrix.multiply(new Matrix4().makeRotationZ(this.headingSet || 0));

            const rightDot =
                right.x * matrix.elements[0] +
                right.y * matrix.elements[1] +
                right.z * matrix.elements[2];

            let angle = Math.acos(Math.min(Math.max(rightDot, -1), 1));
            if (
                right.x * matrix.elements[4] +
                    right.y * matrix.elements[5] +
                    right.z * matrix.elements[6] >
                0
            ) {
                angle = -angle;
            }

            if (angle < 0) angle += 2 * Math.PI;
            return angle;
        }

        return 0;
    }

    public getTilt(): number {
        if (this.tiltSet !== undefined) {
            return this.tiltSet;
        }

        if (this.lastHitCenterDistance > 0) {
            const down = new Vector3();
            const forward = new Vector3();

            this.camera.getDown(down);
            this.camera.getForward(forward);

            const downDot =
                this.lastHitGravity.x * down.x +
                this.lastHitGravity.y * down.y +
                this.lastHitGravity.z * down.z;

            const forwardDot =
                this.lastHitGravity.x * forward.x +
                this.lastHitGravity.y * forward.y +
                this.lastHitGravity.z * forward.z;

            let angle = Math.acos(Math.min(Math.max(downDot, -1), 1));
            if (forwardDot > 0) angle = -angle;
            if (angle < 0) angle += 2 * Math.PI;

            return angle - Math.PI * 0.5;
        }

        return 0;
    }
}
