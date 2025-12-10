/* Copyright (C) 2025 flywave.gl contributors */

import { GeoCoordinates, Projection } from "@flywave/flywave-geoutils";
import { type MapView } from "@flywave/flywave-mapview";
import { type Event, EventDispatcher, Matrix4, Vector3, Vector4 } from "three";

import { type CameraTransform } from "./CameraTransform";
import { MouseCursorManager } from "./MouseCursorManager";
import { WindowEventHandler } from "@flywave/flywave-utils";

export interface BaseMapControlsOptions {
    zoomEnabled?: boolean;
    tiltEnabled?: boolean;
    maxTiltAngle?: number;
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

const EventUpdate = {
    type: EventNames.Update
} as Event<EventNames.Update, any>;

const BeginInteractionUpdate = {
    type: EventNames.BeginInteraction
} as Event<EventNames.BeginInteraction, any>;

const EndInteractionUpdate = {
    type: EventNames.EndInteraction
} as Event<EventNames.EndInteraction, any>;

interface EventMap {
    [EventNames.Update]: typeof EventUpdate;
    [EventNames.BeginInteraction]: typeof BeginInteractionUpdate;
    [EventNames.EndInteraction]: typeof EndInteractionUpdate;
}

export abstract class BaseMapControls extends EventDispatcher<EventMap> {
    private inertialDeltaX: number = 0;
    private inertialDeltaY: number = 0;
    private readonly inertialAxis: Vector4 = new Vector4(0, 0, 0, 0);

    private lastHitDistance: number = -1;
    private readonly lastHit: Vector3 = new Vector3();
    private isPanHit: boolean = false;
    private readonly panHit: Vector3 = new Vector3();
    private lastHitCenterDistance: number = -1;
    private readonly lastHitCenter: Vector3 = new Vector3();
    private readonly lastHitCenterClick: Vector3 = new Vector3();
    private readonly lastHitGravity: Vector3 = new Vector3();
    public smoothPan: boolean = true;

    private smoothZoom: number = 0;
    private panVelocityX: number = 0;
    private panVelocityY: number = 0;
    private zoomVelocity: number = 0;
    private tiltVelocity: number = 0;
    private headingVelocity: number = 0;

    private distory: boolean = false;
    private m_animationFrameHandle: number | undefined;
    private handleRequestAnimationFrame: () => void;

    private readonly mouseState: MouseState = {
        x: 0,
        y: 0,
        z: 0,
        down: [false, false, false],
        prevDown: [false, false, false]
    };

    private tiltLimit: number = Math.PI * 0.01;
    private readonly distanceLimit: number = 3;
    private limitZoomOut: number = 1.5;

    private _zoomEnabled: boolean = true;
    public get zoomEnabled() { return this._zoomEnabled; }
    public set zoomEnabled(value: boolean) { this._zoomEnabled = value; }

    private _tiltEnabled: boolean = true;
    public get tiltEnabled() { return this._tiltEnabled; }
    public set tiltEnabled(value: boolean) { this._tiltEnabled = value; }

    public get maxTiltAngle() { return (this.tiltLimit * 180) / Math.PI; }
    public set maxTiltAngle(value: number) {
        this.tiltLimit = (value * Math.PI) / 180;
    }

    public get maxZoomLevel() { return this.limitZoomOut; }
    public set maxZoomLevel(value: number) { this.limitZoomOut = value; }

    private headingSet?: number;
    private tiltSet?: number;
    private readonly lockCenterPoint: Vector3 | null = null;
    private readonly cameraSwivel: boolean = false;

    private _disableTilt: boolean = false;
    private _disableHeading: boolean = false;

    protected windowEventHandler: WindowEventHandler;
    private readonly mouseCursorManager: MouseCursorManager;

    private _enabled: boolean = true;
    public get enabled() { return this._enabled; }
    public set enabled(value: boolean) { this._enabled = value; }

    public get eventHandler() { return this.windowEventHandler; }

    protected abstract get cameraTransform(): CameraTransform<Projection>;

    constructor(public mapView: MapView, options?: BaseMapControlsOptions) {
        super();
        this.windowEventHandler = new WindowEventHandler(this.mapView.canvas);

        if (options) {
            if (options.zoomEnabled !== undefined) {
                this._zoomEnabled = options.zoomEnabled;
            }
            if (options.tiltEnabled !== undefined) {
                this._tiltEnabled = options.tiltEnabled;
            }
            if (options.maxTiltAngle !== undefined) {
                this.maxTiltAngle = options.maxTiltAngle;
            }
        }

        this.windowEventHandler.addEventListener("dblclick", () => {
            if (this._zoomEnabled) {
                this.mouseCursorManager?.setDoubleClickZooming();
            }
        });
    }

    public destroy() {
        this.windowEventHandler.clearEvent();
        this.mouseCursorManager?.dispose();
        this.distory = true;

        if (this.m_animationFrameHandle !== undefined) {
            cancelAnimationFrame(this.m_animationFrameHandle);
            this.m_animationFrameHandle = undefined;
        }
    }

    protected startAnimation() {
        this.handleRequestAnimationFrame = this.renderLoop.bind(this);
        this.renderLoop();
    }

    private renderLoop() {
        this.update();

        if (!this.distory) {
            this.m_animationFrameHandle = requestAnimationFrame(this.handleRequestAnimationFrame);
        } else {
            this.m_animationFrameHandle = undefined;
        }
    }

    protected get canvasHeight() {
        const canvasClientSize = this.mapView.getCanvasClientSize();
        return canvasClientSize.height;
    }

    protected get canvasWidth() {
        const canvasClientSize = this.mapView.getCanvasClientSize();
        return canvasClientSize.width;
    }

    private haveMatricesChanged(mat1: Matrix4, mat2: Matrix4, precision: number = 1e-6): boolean {
        const elements1 = mat1.elements;
        const elements2 = mat2.elements;

        for (let i = 0; i < 16; i++) {
            if (Math.abs(elements1[i] - elements2[i]) > precision) {
                return true;
            }
        }
        return false;
    }

    protected update(): boolean {
        if (!this.enabled) {
            this.windowEventHandler.lastMouseZ = this.mouseState.z;
            return false;
        }

        const mouseX = this.canvasWidth - this.windowEventHandler.lastMouseX;
        const mouseY = this.canvasHeight - this.windowEventHandler.lastMouseY;
        const mouseDown = this.windowEventHandler.mouseDown;
        const mouseZ = this.windowEventHandler.lastMouseZ;

        const isMoving = Math.abs(mouseX - this.mouseState.x) > 1 ||
            Math.abs(mouseY - this.mouseState.y) > 1;

        this.mouseCursorManager?.update(mouseDown, mouseZ - this.mouseState.z, isMoving);

        this.cameraTransform.cameraToWorld.copy(this.mapView.camera.matrixWorld);

        const cameraPos = new Vector3();
        this.cameraTransform.getOrigin(cameraPos);
        const normal = new Vector3();
        const distanceToGlobe = this.getDistanceToGlobe(cameraPos, normal);

        const hitPoint = new Vector3();
        const hitDistance = this.handleMouseInteractions(
            mouseX,
            mouseY,
            mouseDown,
            mouseZ,
            cameraPos,
            hitPoint
        );

        this.handlePanning(mouseDown, cameraPos, hitPoint, distanceToGlobe);
        this.cameraTransform.getOrigin(cameraPos);

        this.updateCenter();

        this.handleZoomOperations(mouseZ, hitDistance, cameraPos);
        this.cameraTransform.getOrigin(cameraPos);

        const canRotate = !this._disableTilt && !this._disableHeading;
        this.mouseState.prevDown[2] = canRotate;
        this.handleRotationOperations(mouseDown, mouseX, mouseY);

        this.applyTiltAndHeadingChanges();

        if ((!mouseDown[0] || !this.isPanHit) && this.lastHitCenterDistance > 0) {
            this.cameraTransform.applyTiltLimit(
                this.lastHitCenter,
                this.lastHitGravity,
                this.tiltLimit
            );
            this.cameraTransform.smartBalance(
                this.lastHitCenter.clone(),
                this.lastHitGravity.clone(),
                this.tiltLimit
            );
        }

        this.cameraTransform.getOrigin(cameraPos);

        this.updateMouseState(mouseX, mouseY, mouseZ, mouseDown);

        this.applyToMapView();

        this.dispatchEvent(EventUpdate);
        return false;
    }

    private applyToMapView() {
        const cameraToMapViewMatrix = this.cameraTransform.getMatrix();

        if (this.haveMatricesChanged(cameraToMapViewMatrix, this.mapView.camera.matrixWorld)) {
            this.mapView.update();
        }

        this.mapView.camera.updateMatrixWorld();
        cameraToMapViewMatrix.decompose(
            this.mapView.camera.position,
            this.mapView.camera.quaternion,
            this.mapView.camera.scale
        );
    }

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
            } else {
                this.isPanHit = false;
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
        } else if (this.inertialAxis.w != 0) {
            this.cameraTransform.inertialPan(cameraPos, this.inertialAxis, 0.075);
        }

        if (this.panVelocityX !== 0 || this.panVelocityY !== 0) {
            const panStep = distanceToGlobe * 0.03 * 0.025;
            this.cameraTransform.applyPanVelocity(panStep, this.panVelocityX, this.panVelocityY);
        }
    }

    private handleZoomOperations(mouseZ: number, hitDistance: number, cameraPos: Vector3): void {
        if (!this._zoomEnabled) {
            return;
        }

        const prevSmoothZoom = this.smoothZoom;
        this.smoothZoom += (mouseZ - this.smoothZoom) * 0.3;

        if (this.smoothZoom !== prevSmoothZoom) {
            if (hitDistance > 0 || (mouseZ === this.mouseState.z && this.lastHitDistance > 0)) {
                const zoomDelta = (this.smoothZoom - prevSmoothZoom) * 0.08;
                const distanceRatio = this.lastHit.distanceTo(cameraPos) / this.mapView.projection.unitScale;

                let damping = 1;
                if (zoomDelta < 0 && distanceRatio > this.limitZoomOut) {
                    damping = (this.limitZoomOut * 2 - distanceRatio) / this.limitZoomOut;
                }

                this.cameraTransform.zoom(this.lastHit, zoomDelta * damping);
            }
        }

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
            this.inertialDeltaX += (0 - this.inertialDeltaX) * rotationDamping * 0.75;
            this.inertialDeltaY += (0 - this.inertialDeltaY) * rotationDamping * 0.75;
        }

        if (this.lastHitCenterDistance > 0 && (this.inertialDeltaX !== 0 || this.inertialDeltaY !== 0)) {
            const rotationStep = 0.0045;
            const tiltStep = rotationStep * 0.5;

            let pivotPoint = this.lastHitCenter;
            const camPos = new Vector3();
            this.cameraTransform.getOrigin(camPos);

            if (this.cameraSwivel) {
                pivotPoint = this.lastHitCenterClick || camPos;
            }

            const gravityPoint = this.lastHitGravity;
            if (this.cameraSwivel) {
                pivotPoint = camPos;
                this.getDistanceToGlobe(camPos, gravityPoint);
            }

            let tiltChange = this.inertialDeltaY * tiltStep;
            if (!this._tiltEnabled) {
                tiltChange = 0;
            }

            this.cameraTransform.rotateAroundPivotAndTilt(
                pivotPoint.x,
                pivotPoint.y,
                pivotPoint.z,
                gravityPoint.x,
                gravityPoint.y,
                gravityPoint.z,
                -this.inertialDeltaX * rotationStep,
                tiltChange,
                this.tiltLimit
            );
        }
    }

    private applyTiltAndHeadingChanges(): void {
        if ((this.headingSet !== undefined || this.tiltSet !== undefined) &&
            this.lastHitCenterDistance > 0) {
            if (this.headingSet !== undefined) {
                this.applyHeadingChange();
            }

            if (this.tiltSet !== undefined && this._tiltEnabled) {
                this.applyTiltChange();
            }

            this.headingSet = undefined;
            this.tiltSet = undefined;
        } else if (this.headingVelocity !== 0 || this.tiltVelocity !== 0) {
            const rotationStep = 0.03;
            if (this.lastHitCenterDistance > 0) {
                const tiltStepValue = this._tiltEnabled ? this.tiltVelocity * rotationStep : 0;

                this.cameraTransform.rotateAroundPivotAndTilt(
                    this.lastHitCenter.x,
                    this.lastHitCenter.y,
                    this.lastHitCenter.z,
                    this.lastHitGravity.x,
                    this.lastHitGravity.y,
                    this.lastHitGravity.z,
                    this.headingVelocity * rotationStep,
                    tiltStepValue,
                    this.tiltLimit
                );
            }
        }
    }

    private applyHeadingChange(): void {
        const right = new Vector3();
        this.cameraTransform.getRight(right);

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

        const direction = right.x * rotationMatrix.elements[4] +
            right.y * rotationMatrix.elements[5] +
            right.z * rotationMatrix.elements[6];

        this.cameraTransform.rotateAroundPivot(
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
        this.cameraTransform.getDown(down);
        this.cameraTransform.getForward(forward);

        const downDot = this.lastHitGravity.x * down.x +
            this.lastHitGravity.y * down.y +
            this.lastHitGravity.z * down.z;

        const forwardDot = this.lastHitGravity.x * forward.x +
            this.lastHitGravity.y * forward.y +
            this.lastHitGravity.z * forward.z;

        let angle = Math.acos(Math.min(Math.max(downDot, -1), 1));
        if (forwardDot > 0) angle = -angle;

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

        this.inertialDeltaY = 0;
    }

    private updateMouseState(x: number, y: number, z: number, down: boolean[]): void {
        this.mouseState.x = x;
        this.mouseState.y = y;
        this.mouseState.z = z;
        this.mouseState.prevDown = [...this.mouseState.down];
        this.mouseState.down = [...down] as [boolean, boolean, boolean];
    }

    public isPanning(): boolean {
        return this.panVelocityX !== 0 || this.panVelocityY !== 0;
    }

    public disableTilt(): void { this._disableTilt = true; }

    public disableHeading(): void { this._disableHeading = true; }

    public getDistanceToGlobe(position: Vector3, normal?: Vector3): number {
        const normalVector = new Vector3();
        const distance = this.getDistanceAndNormal(normalVector, position);

        if (normal) {
            normal.copy(normalVector).negate();
        }
        return distance;
    }

    public getDistanceAndNormal(result: Vector3, position: Vector3): number {
        return this.cameraTransform.getDistanceAndNormal(result, position);
    }

    public getAltitude(lon: number, lat: number, defaultHeight: number): number {
        return (
            this.mapView.elevationProvider?.getHeight(
                new GeoCoordinates(lat, lon, defaultHeight)
            ) || 0
        );
    }

    private updateCenter(): void {
        const cameraPosition = new Vector3();
        this.cameraTransform.getOrigin(cameraPosition);
        this.focusCenter(cameraPosition);
    }

    private focusCenter(cameraPos: Vector3): number {
        const centerPoint = new Vector3();
        const screenCenter = new Vector3();
        let hitDistance = 0;

        if (!this.lockCenterPoint) {
            centerPoint.copy(this.mapView.worldTarget);
            hitDistance = this.mapView.targetDistance;
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

    protected abstract rayCastWorld(result: Vector3, origin: Vector3, target: Vector3): number;

    private rayCastZoomPoint(
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

    private setRotationLookDown(matrix: Matrix4, normal: Vector3): void {
        const up = new Vector3(0, 0, -1);
        const right = new Vector3().crossVectors(up, normal).normalize();
        const newUp = new Vector3().crossVectors(right, normal).normalize();

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
}