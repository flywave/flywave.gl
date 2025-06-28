import { dispatch as _dispatch } from "d3-dispatch";
import { EventDispatcher, Matrix4, Vector3, Vector4, Event } from "three";
import { GeoCoordinates } from "@flywave/flywave-geoutils";
import { CameraTransform } from "./CameraTransform";
import { slerpMatrices } from "./math";
import { MapView, MapViewEventNames } from "@flywave/flywave-mapview";
import { WindowEventHandler } from "./WindowEventHandler";

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
    finishCallback?: (controller: BaseMapControls) => void;
}

interface MouseState {
    x: number;
    y: number;
    z: number;
    down: [boolean, boolean, boolean];
    prevDown: [boolean, boolean, boolean];
}

export enum EventNames {
    Update = "update",
    BeginInteraction = "begin-interaction",
    EndInteraction = "end-interaction"
}

let EventUpdate = {
    type: EventNames.Update
} as Event<EventNames.Update, any>;

let BeginInteractionUpdate = {
    type: EventNames.BeginInteraction
} as Event<EventNames.BeginInteraction, any>;

let EndInteractionUpdate = {
    type: EventNames.EndInteraction
} as Event<EventNames.EndInteraction, any>;

type EventMap = {
    [EventNames.Update]: typeof EventUpdate;
    [EventNames.BeginInteraction]: typeof BeginInteractionUpdate;
    [EventNames.EndInteraction]: typeof EndInteractionUpdate;
};

export abstract class BaseMapControls extends EventDispatcher<EventMap> {
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

    // Animation controls
    private smoothZoom: number = 0;
    private panVelocityX: number = 0;
    private panVelocityY: number = 0;
    private zoomVelocity: number = 0;
    private tiltVelocity: number = 0;
    private headingVelocity: number = 0;

    private distory: boolean = false;
    private m_animationFrameHandle: number | undefined;
    private handleRequestAnimationFrame: () => void;

    private renderLoop() {
        this.update();

        // Continue rendering if update is pending or animation is running
        if (!this.distory) {
            this.m_animationFrameHandle = requestAnimationFrame(this.handleRequestAnimationFrame);
        } else {
            // Stop rendering if no update is pending
            this.m_animationFrameHandle = undefined;
        }
    }

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

    private _tiltEnabled: boolean = true;
    public get tiltEnabled() {
        return this._tiltEnabled;
    }

    public set tiltEnabled(value: boolean) {
        this._tiltEnabled = value;
    }

    public get maxTiltAngle() {
        return (this.tiltLimit * 180) / Math.PI;
    }

    public set maxTiltAngle(value: number) {
        this.tiltLimit = (value * Math.PI) / 180;
    }

    public get maxZoomLevel() {
        return this.limitZoomOut;
    }

    public set maxZoomLevel(value: number) {
        this.limitZoomOut = value;
    }

    // Camera state
    private headingSet?: number;
    private tiltSet?: number;
    private zoomAnimationState?: ZoomAnimationState;
    private lockCenterPoint: Vector3 | null = null;
    private cameraSwivel: boolean = false;

    // Disable flags
    private _disableTilt: boolean = false;
    private _disableHeading: boolean = false;

    protected windowEventHandler: WindowEventHandler;

    private _enabled: boolean = true;
    public get enabled() {
        return this._enabled;
    }

    public set enabled(value: boolean) {
        this._enabled = value;
    }

    constructor(public mapView: MapView, protected cameraTransform: CameraTransform) {
        super();
        this.windowEventHandler = new WindowEventHandler(this.mapView.canvas);
        this.bindMapView();
    }

    public destroy() {
        this.windowEventHandler.clearEvent();
        this.distory = true;

        if (this.m_animationFrameHandle !== undefined) {
            cancelAnimationFrame(this.m_animationFrameHandle);
            this.m_animationFrameHandle = undefined;
        }
    }

    protected bindMapView() {
        this.handleRequestAnimationFrame = this.renderLoop.bind(this);
        this.renderLoop();
    }

    protected get canvasHeight() {
        const { height } = this.mapView.getCanvasClientSize();
        return height;
    }

    protected get canvasWidth() {
        const { width } = this.mapView.getCanvasClientSize();
        return width;
    }

    protected update(): boolean {
        if (!this.enabled) {
            return false;
        }

        this.cameraTransform.cameraToWorld.copy(this.mapView.camera.matrixWorld);

        // Get current mouse state
        const mouseX = this.canvasWidth - this.windowEventHandler.lastMouseX;
        const mouseY = this.canvasHeight - this.windowEventHandler.lastMouseY;
        const mouseDown = this.windowEventHandler.mouseDown;
        const mouseZ = this.windowEventHandler.lastMouseZ;

        // Handle zoom animations
        if (this.zoomAnimationState) {
            return this.handleZoomAnimation(mouseDown, mouseZ);
        }

        // Get camera position and calculate globe distance
        const cameraPos = new Vector3();
        this.cameraTransform.getOrigin(cameraPos);

        const normal = new Vector3();
        const distanceToGlobe = this.getDistanceToGlobe(cameraPos, normal);

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

        this.updateCenter();
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

        if ((!mouseDown[0] || !this.isPanHit) && this.lastHitCenterDistance > 0) {
            this.applyAutoTiltCorrection();
        }

        // Apply tilt and heading changes
        this.applyTiltAndHeadingChanges();

        // Apply distance limits
        this.applyDistanceLimits(cameraPos, normal, distanceToGlobe);

        // Update previous mouse state
        this.updateMouseState(mouseX, mouseY, mouseZ, mouseDown);

        this.applyToMapView();

        this.dispatchEvent(EventUpdate);
        return false;
    }

    private applyToMapView() {
        const cameraToMapViewMatrix = this.cameraTransform.getMatrix();
        cameraToMapViewMatrix.decompose(
            this.mapView.camera.position,
            this.mapView.camera.quaternion,
            this.mapView.camera.scale
        );
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
        this.cameraTransform.getOrigin(cameraPos);

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
        this.cameraTransform.getOrigin(cameraPos);

        const distance = this.getDistanceToGlobe(cameraPos);
        const matrixDistance = this.getMatrixPositionDistance(startMatrix, endMatrix);

        // Calculate animation step
        const step = (speed * 0.05 * distance) / matrixDistance;
        this.zoomAnimationState.time += step;

        if (this.zoomAnimationState.time >= 1) {
            this.completeZoomAnimation();
            this.cameraTransform.setMatrix(endMatrix);
        } else {
            if (this.zoomAnimationState.mode === 1) {
                this.cameraTransform.followMatrix(endMatrix, time, startMatrix);
            } else {
                const pivot = new Vector3().fromArray(
                    this.zoomAnimationState.globeCenter.toArray()
                );
                const radius = this.getDistanceToGlobe(pivot);

                this.cameraTransform.followMatrixGreatCircle(
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
            this.cameraTransform.unprojectToWorld(target, mouseX, mouseY, -1);

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
            this.cameraTransform.unprojectToWorld(
                target,
                this.canvasWidth - this.windowEventHandler.lastMouseX,
                this.canvasHeight - this.windowEventHandler.lastMouseY,
                -1
            );

            this.cameraTransform.pan(this.panHit, target, this.inertialAxis, 0.2);
        } else if (this.inertialAxis.length() > 0) {
            this.cameraTransform.inertialPan(cameraPos, this.inertialAxis, 0.075);
        }

        if (this.panVelocityX !== 0 || this.panVelocityY !== 0) {
            const panStep = distanceToGlobe * 0.03 * 0.025;
            this.cameraTransform.applyPanVelocity(panStep, this.panVelocityX, this.panVelocityY);
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

                this.cameraTransform.zoom(this.lastHit, zoomDelta * damping);
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

            this.cameraTransform.zoom(this.lastHitCenter, zoomDelta * damping);
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
            this.cameraTransform.getOrigin(camPos);
            if (this.cameraSwivel) {
                // 使用相机位置或点击位置作为旋转中心
                pivotPoint = this.lastHitCenterClick || camPos;
            }

            let gravityPoint = this.lastHitGravity;

            if (this.cameraSwivel) {
                pivotPoint = camPos;
                this.getDistanceToGlobe(camPos, gravityPoint);
            }

            this.cameraTransform.rotateAroundPivotAndTilt(
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
                this.cameraTransform.rotateAroundPivotAndTilt(
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

    private applyAutoTiltCorrection(): void {
        const pivot = this.lastHitCenter;
        const normal = this.lastHitGravity.clone().normalize();
        const maxTilt = this.tiltLimit;

        // 1. 直接应用倾斜限制
        this.cameraTransform.rotateAroundPivotAndTilt(
            pivot.x,
            pivot.y,
            pivot.z,
            normal.x,
            normal.y,
            normal.z,
            0,
            0, // 不改变当前旋转和倾斜
            maxTilt // 仅强制应用限制
        );

        // 2. 模拟 smartBalance 的平衡效果
        this.inertialDeltaY *= 0.8; // 垂直惯性阻尼
    }
    /**
     * Applies heading (azimuth) rotation to the camera based on the current heading setting.
     * Rotates the camera around the pivot point (last hit center) in the direction determined
     * by the angle between current right vector and target rotation matrix.
     */
    private applyHeadingChange(): void {
        const right = new Vector3();
        this.cameraTransform.getRight(right);

        const rotationMatrix = new Matrix4();
        this.setRotationLookDown(rotationMatrix, this.lastHitGravity);
        rotationMatrix.multiply(new Matrix4().makeRotationZ(this.headingSet || 0));

        // Calculate angle between current right vector and target rotation's right vector
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

        // Determine rotation direction (clockwise or counter-clockwise)
        const direction =
            right.x * rotationMatrix.elements[4] +
            right.y * rotationMatrix.elements[5] +
            right.z * rotationMatrix.elements[6];

        // Rotate camera around pivot point with calculated angle
        this.cameraTransform.rotateAroundPivot(
            this.lastHitCenter.x,
            this.lastHitCenter.y,
            this.lastHitCenter.z,
            this.lastHitGravity.x,
            this.lastHitGravity.y,
            this.lastHitGravity.z,
            direction > 0 ? -angle : angle
        );

        this.inertialDeltaX = 0; // Reset inertial delta after applying change
    }

    /**
     * Applies tilt (pitch) rotation to the camera based on current tilt setting.
     * Adjusts camera's tilt angle relative to the gravity vector while respecting tilt limits.
     */
    private applyTiltChange(): void {
        const down = new Vector3();
        const forward = new Vector3();
        this.cameraTransform.getDown(down);
        this.cameraTransform.getForward(forward);

        // Calculate dot products to determine current orientation
        const downDot =
            this.lastHitGravity.x * down.x +
            this.lastHitGravity.y * down.y +
            this.lastHitGravity.z * down.z;

        const forwardDot =
            this.lastHitGravity.x * forward.x +
            this.lastHitGravity.y * forward.y +
            this.lastHitGravity.z * forward.z;

        // Calculate tilt angle and direction
        let angle = Math.acos(Math.min(Math.max(downDot, -1), 1));
        if (forwardDot > 0) angle = -angle;

        // Apply rotation with tilt limits
        this.cameraTransform.rotateAroundPivotAndTilt(
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

        this.inertialDeltaY = 0; // Reset inertial delta after applying change
    }

    /**
     * Ensures camera maintains minimum distance from the globe surface.
     * Adjusts camera position if it gets closer than the distance limit.
     */
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

        // Push camera back if too close to surface
        if (actualDistance < this.distanceLimit) {
            const correction = this.distanceLimit - actualDistance;
            cameraPos.x -= correction * normal.x;
            cameraPos.y -= correction * normal.y;
            cameraPos.z -= correction * normal.z;
            this.cameraTransform.setOrigin(cameraPos.x, cameraPos.y, cameraPos.z);
        }
    }

    /**
     * Updates current mouse state including position and button states.
     */
    private updateMouseState(x: number, y: number, z: number, down: boolean[]): void {
        this.mouseState.x = x;
        this.mouseState.y = y;
        this.mouseState.z = z;
        this.mouseState.prevDown = [...this.mouseState.down];
        this.mouseState.down = [...down] as [boolean, boolean, boolean];
    }

    // ========================
    // Public Interface Methods
    // ========================

    /**
     * Checks if camera is currently panning (either through animation or velocity)
     */
    public isPanning(): boolean {
        return (
            this.zoomAnimationState?.time !== undefined ||
            this.panVelocityX !== 0 ||
            this.panVelocityY !== 0
        );
    }

    /**
     * Disables tilt functionality
     */
    public disableTilt(): void {
        this._disableTilt = true;
    }

    /**
     * Disables heading functionality
     */
    public disableHeading(): void {
        this._disableHeading = true;
    }

    // =====================
    // Coordinate Conversion
    // =====================

    /**
     * Projects geographic coordinates to 3D world coordinates
     */
    public projectPoint(geoCoordinates: GeoCoordinates, out?: Vector3): Vector3 {
        return this.mapView.projection.projectPoint(geoCoordinates, out);
    }

    /**
     * Unprojects 3D world coordinates to geographic coordinates
     */
    public unprojectPoint(xyz: Vector3): GeoCoordinates {
        return this.mapView.projection.unprojectPoint(xyz);
    }

    /**
     * Converts lon/lat/alt to 3D world coordinates
     */
    public getXYZ(result: Vector3, lon: number, lat: number, alt: number): void {
        const xyz = this.projectPoint(new GeoCoordinates(lat, lon, alt));
        result.copy(xyz);
    }

    /**
     * Converts 3D world coordinates to lon/lat/alt
     */
    public getLatLonAlt(result: number[], x: number, y: number, z: number): void {
        const geo = this.unprojectPoint(new Vector3(x, y, z));
        result[0] = geo.latitude;
        result[1] = geo.longitude;
        result[2] = geo.altitude;
    }

    // ====================
    // Distance Calculations
    // ====================

    /**
     * Calculates distance from position to globe surface and optionally returns surface normal
     */
    public getDistanceToGlobe(position: Vector3, normal?: Vector3): number {
        const normalVector = new Vector3();
        const distance = this.getDistanceAndNormal(normalVector, position);

        if (normal) {
            normal.set(-normalVector.x, -normalVector.y, -normalVector.z);
        }
        return distance;
    }

    /**
     * Calculates distance from position to globe surface and returns surface normal
     */
    public getDistanceAndNormal(result: Vector3, position: Vector3): number {
        const distance = position.length();
        const scale = 1 / distance;

        result.copy(position).multiplyScalar(scale);
        return distance - this.getEquatorialRadius();
    }

    /**
     * Gets terrain height at specified geographic coordinates
     */
    public getAltitude(lon: number, lat: number, defaultHeight: number): number {
        return (
            this.mapView.elevationProvider?.getHeight(
                new GeoCoordinates(lat, lon, defaultHeight)
            ) || 0
        );
    }

    // =================
    // Camera Operations
    // =================

    /**
     * Updates the center focus point of the camera
     */
    public updateCenter(): void {
        const cameraPosition = new Vector3();
        this.cameraTransform.getOrigin(cameraPosition);
        this.focusCenter(cameraPosition);
    }

    /**
     * Focuses camera on center point, either calculating it or using locked point
     */
    private focusCenter(cameraPos: Vector3): number {
        const centerPoint = new Vector3();
        const screenCenter = new Vector3();
        let hitDistance = 0;

        if (!this.lockCenterPoint) {
            let screenY = this.canvasHeight / 2;
            if (this.getTilt() > (Math.PI * 80) / 180) {
                screenY = this.canvasHeight * 0.1;
            }

            this.cameraTransform.unprojectToWorld(screenCenter, this.canvasWidth / 2, screenY, -1);

            hitDistance = this.rayCastWorld(centerPoint, cameraPos, screenCenter);
        } else {
            const cameraOrigin = new Vector3();
            this.cameraTransform.getOrigin(cameraOrigin);
            hitDistance = centerPoint.distanceTo(this.lockCenterPoint);
            centerPoint.copy(this.lockCenterPoint);
        }

        if (hitDistance > 0) {
            this.lastHitCenterDistance = hitDistance;
            this.lastHitCenter.copy(centerPoint);
            this.getDistanceToGlobe(centerPoint, this.lastHitGravity);
        }

        return hitDistance;
    }

    /**
     * Abstract method for raycasting against the world geometry
     */
    protected abstract rayCastWorld(result: Vector3, origin: Vector3, target: Vector3): number;

    /**
     * Performs raycast for zoom operations, respecting locked center point when needed
     */
    public rayCastZoomPoint(
        result: Vector3,
        origin: Vector3,
        target: Vector3,
        isWheel: boolean
    ): number {
        if (!this.lockCenterPoint || !isWheel) {
            return this.rayCastWorld(result, origin, target);
        } else {
            const cameraPos = new Vector3();
            this.cameraTransform.getOrigin(cameraPos);
            const distance = cameraPos.distanceTo(this.lockCenterPoint);
            result.copy(this.lockCenterPoint);
            return distance;
        }
    }

    // ==============
    // Camera Control
    // ==============

    /**
     * Sets camera position and orientation using spherical coordinates
     */
    public setTo(
        lon: number,
        lat: number,
        altitude: number,
        offsetDistance: number,
        theta: number,
        phi: number
    ): void {
        const position = new Vector3();
        this.getXYZ(position, lon, lat, altitude || 0);

        const normal = new Vector3();
        this.getDistanceToGlobe(position, normal);

        const matrix = new Matrix4();
        matrix.makeTranslation(position.x, position.y, position.z);
        this.setRotationLookDown(matrix, normal);

        if (phi !== undefined) {
            matrix.multiply(new Matrix4().makeRotationZ(phi));
        }

        matrix.multiply(new Matrix4().makeRotationX(theta !== undefined ? theta : Math.PI * 0.25));
        matrix.multiply(new Matrix4().makeTranslation(0, 0, offsetDistance));

        this.cameraTransform.setMatrix(matrix);
        this.inertialDeltaX = 0;
        this.inertialDeltaY = 0;
    }

    /**
     * Sets camera position and orientation using a look vector
     */
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
        this.cameraTransform.setMatrix(matrix);
        this.inertialDeltaX = 0;
        this.inertialDeltaY = 0;
    }
    /**
     * Flies the camera to a specified geographic location with animation
     * @param lng - Target longitude in degrees
     * @param lat - Target latitude in degrees
     * @param cameraDistance - Distance from target in meters
     * @param speed - Animation speed multiplier
     * @param offsetDistance - Distance from center point offset
     * @param theta - Tilt angle in radians
     * @param phi - Heading angle in radians
     * @param toCity - Whether to use city-optimized flight mode
     * @param callback - Optional callback when animation completes
     */
    public flyTo(
        lng: number,
        lat: number,
        cameraDistance: number,
        speed: number,
        offsetDistance: number,
        theta: number,
        phi: number,
        toCity: boolean = false,
        callback?: (controller: BaseMapControls) => void
    ): void {
        // Initialize animation state if not exists
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
                start: [90, 0, 0, 1000], // [lat, lng, alt, dist]
                end: [90, 0, 0, 1000], // [lat, lng, alt, dist]
                globeCenter: new Vector3(),
                finishCallback: callback
            };
        }

        // Get current camera position
        const currentPos = new Vector3();
        this.cameraTransform.getOrigin(currentPos);

        // Calculate target position in world coordinates
        const targetPos = new Vector3();
        this.projectPoint(new GeoCoordinates(lat, lng, 0), targetPos);
        targetPos.normalize();

        // Get current view center point
        const currentCenter = new Vector3().fromArray(this.lastHitCenter.toArray()).normalize();

        // Switch to city mode if target is far from current view center
        if (Math.acos(targetPos.dot(currentCenter)) > Math.PI / 4) {
            toCity = true;
            this.zoomAnimationState.speed = 0.4;
        }

        // Handle city flight mode
        if (toCity && this.getLocationAtCenter(this.zoomAnimationState.start)) {
            this.zoomAnimationState.toCity = true;
            // Save current camera orientation
            this.zoomAnimationState.start[4] = this.getTilt();
            this.zoomAnimationState.start[5] = this.getHeading();

            // Set target parameters
            this.zoomAnimationState.end[0] = lat;
            this.zoomAnimationState.end[1] = lng;
            this.zoomAnimationState.end[2] = cameraDistance || 0;
            this.zoomAnimationState.end[3] = offsetDistance || 0;
            this.zoomAnimationState.end[4] = theta || 0;
            this.zoomAnimationState.end[5] = phi || 0;

            // Calculate flight distance
            const targetXYZ = new Vector3();
            this.getXYZ(targetXYZ, lng, lat, cameraDistance || 0);
            this.zoomAnimationState.distance = currentPos.distanceTo(targetXYZ);
            return;
        }

        // Handle standard flight mode
        this.zoomAnimationState.speed *= 5;
        const targetXYZ = new Vector3();
        this.getXYZ(targetXYZ, lng, lat, cameraDistance || 0);

        // Calculate surface normal at target
        const normal = new Vector3();
        this.getDistanceToGlobe(targetXYZ, normal);

        // Set up animation matrices
        this.cameraTransform.getMatrix(this.zoomAnimationState.startMatrix);
        this.zoomAnimationState.endMatrix.identity();
        this.zoomAnimationState.endMatrix.makeTranslation(targetXYZ.x, targetXYZ.y, targetXYZ.z);
        this.setRotationLookDown(this.zoomAnimationState.endMatrix, normal);

        // Apply heading rotation if specified
        if (phi !== undefined) {
            this.zoomAnimationState.endMatrix.multiply(new Matrix4().makeRotationZ(phi));
        }

        // Create midpoint for smooth transition
        if (this.zoomAnimationState.mode !== 1) {
            this.zoomAnimationState.midMatrix.copy(this.zoomAnimationState.endMatrix);
            this.zoomAnimationState.midMatrix.copy(
                slerpMatrices(
                    this.zoomAnimationState.startMatrix,
                    this.zoomAnimationState.midMatrix,
                    0.5
                )
            );
        }

        // Apply tilt and final position offset
        this.zoomAnimationState.endMatrix.multiply(new Matrix4().makeRotationX(theta));
        this.zoomAnimationState.endMatrix.multiply(
            new Matrix4().makeTranslation(0, 0, offsetDistance || 0)
        );
    }

    /**
     * Gets geographic coordinates of current view center point
     * @param result - Array to store [latitude, longitude, altitude]
     * @returns True if successful, false if no intersection
     */
    protected getLocationAtCenter(result: number[]): boolean {
        if (!result || result.length < 3) return false;

        // Calculate screen center position based on current tilt
        const screenCenter = new Vector3();
        const screenY =
            this.getTilt() > (Math.PI * 80) / 180 ? this.canvasHeight * 0.1 : this.canvasHeight / 2;

        // Unproject screen center to world coordinates
        this.cameraTransform.unprojectToWorld(screenCenter, this.canvasWidth / 2, screenY, -1);

        // Get camera position
        const cameraPos = new Vector3();
        this.cameraTransform.getOrigin(cameraPos);

        // Find intersection with globe
        const hitPoint = new Vector3();
        const hitDistance = this.rayCastWorld(hitPoint, cameraPos, screenCenter);

        if (hitDistance <= 0) return false;

        // Convert to geographic coordinates
        this.getLatLonAlt(result, hitPoint.x, hitPoint.y, hitPoint.z);
        return true;
    }

    /**
     * Sets up a rotation matrix looking down at a surface normal
     * @param matrix - Matrix to modify
     * @param normal - Surface normal vector
     */
    private setRotationLookDown(matrix: Matrix4, normal: Vector3): void {
        const up = new Vector3(0, 0, -1);
        const right = new Vector3().crossVectors(up, normal).normalize();
        const newUp = new Vector3().crossVectors(right, normal).normalize();

        // Set matrix columns
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

    /**
     * Gets the equatorial radius of the globe
     * @returns Radius in meters
     */
    protected getEquatorialRadius(): number {
        return this.mapView.projection.unitScale;
    }

    // Animation control methods
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

    /**
     * Gets current camera heading angle
     * @returns Heading in radians (0 to 2π)
     */
    public getHeading(): number {
        if (this.headingSet !== undefined) {
            return this.headingSet;
        }

        if (this.lastHitCenterDistance > 0) {
            const right = new Vector3();
            this.cameraTransform.getRight(right);

            // Create reference orientation matrix
            const matrix = new Matrix4();
            this.setRotationLookDown(matrix, this.lastHitGravity);
            matrix.multiply(new Matrix4().makeRotationZ(this.headingSet || 0));

            // Calculate angle between current right vector and reference
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

            // Normalize to 0-2π range
            if (angle < 0) angle += 2 * Math.PI;
            return angle;
        }

        return 0;
    }

    /**
     * Gets current camera tilt angle
     * @returns Tilt in radians (-π/2 to π/2)
     */
    public getTilt(): number {
        if (this.tiltSet !== undefined) {
            return this.tiltSet;
        }

        if (this.lastHitCenterDistance > 0) {
            const down = new Vector3();
            const forward = new Vector3();

            this.cameraTransform.getDown(down);
            this.cameraTransform.getForward(forward);

            // Calculate angles relative to surface normal
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

            // Convert to tilt angle (-π/2 to π/2)
            return angle - Math.PI * 0.5;
        }

        return 0;
    }

    /**
     * Gets complete camera state including position and orientation
     * @returns Object containing geographic coordinates and angles
     */
    public getCameraState(): {
        longitude: number;
        latitude: number;
        altitude: number;
        tilt: number;
        heading: number;
    } {
        // Get current camera position in world coordinates
        const cameraPos = new Vector3();
        this.cameraTransform.getOrigin(cameraPos);

        // Convert to geographic coordinates
        const geoCoords = [0, 0, 0];
        this.getLatLonAlt(geoCoords, cameraPos.x, cameraPos.y, cameraPos.z);

        return {
            longitude: geoCoords[1], // Longitude in degrees
            latitude: geoCoords[0], // Latitude in degrees
            altitude: geoCoords[2], // Altitude in meters
            tilt: this.getTilt(), // Tilt angle in radians
            heading: this.getHeading() // Heading angle in radians
        };
    }

    public get zoomLevelTargeted() {
        return this.mapView.zoomLevel;
    }

    public get zoomLevelDeltaOnControl() {
        return 1;
    }

    public setZoomLevel(targetZoomLevel: number) {
        const { width, height } = this.mapView.getCanvasClientSize();
        this.windowEventHandler.lastMouseX = width / 2;
        this.windowEventHandler.lastMouseY = height / 2;
        this.windowEventHandler.lastMouseZ +=
            ((targetZoomLevel - this.mapView.zoomLevel) /
                Math.abs(targetZoomLevel - this.mapView.zoomLevel)) *
            10;
    }

    public toggleTilt() {
        this.setTilt(-Math.PI / 4);
    }

    public pointToNorth() {
        this.setHeading(0);
    }
}
