/* Copyright (C) 2025 flywave.gl contributors */

import { type Projection, GeoCoordinates } from "@flywave/flywave-geoutils";
import { type MapView } from "@flywave/flywave-mapview";
import { WindowEventHandler } from "@flywave/flywave-utils";
import { type Event, EventDispatcher, Matrix4, Vector3, Vector4 } from "three/webgpu";

import { type CameraTransform } from "./CameraTransform";
import { type MouseCursorManager } from "./MouseCursorManager";
import { type PivotIndicatorOptions, PivotIndicator } from "./PivotIndicator";

export interface BaseMapControlsOptions {
    zoomEnabled?: boolean;
    tiltEnabled?: boolean;
    maxTiltAngle?: number;
    pivotIndicator?: PivotIndicatorOptions | boolean;
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

/**
 * Angular margin (degrees) below the orbit-mode tilt limit at which the
 * first-person mode engages. The orbit-mode clamp starts rotating the camera
 * around the ground pivot `maxTiltAngle` below the horizon (pulling the camera
 * up/down instead of raising the view); entering slightly before that point
 * guarantees the clamp never fires.
 */
const FIRST_PERSON_ENTRY_MARGIN_DEG = 0.25;

/** Pitch (degrees from nadir) of a horizontal view. */
const HORIZON_PITCH_DEG = 90;

/**
 * Maximum pitch (radians from nadir) reachable in first-person mode:
 * straight up (zenith). Dragging further only rotates past the zenith, which
 * would tilt the view back down on the opposite side.
 */
const MAX_VIEW_PITCH_RAD = Math.PI;

const DEG_TO_RAD = Math.PI / 180;

/**
 * Returns true when every element of the matrix is finite and none of its
 * rotation columns has collapsed to zero.
 *
 * `Matrix4.decompose` writes NaN into the position/quaternion when the matrix
 * is non-finite and into the quaternion when a rotation column is zero (it
 * divides by the column length), so both cases must be rejected before the
 * matrix is copied into the map camera.
 */
function isUsableCameraMatrix(matrix: Matrix4): boolean {
    const e = matrix.elements;
    for (let i = 0; i < 16; i++) {
        if (!Number.isFinite(e[i])) {
            return false;
        }
    }
    return (
        (e[0] !== 0 || e[1] !== 0 || e[2] !== 0) &&
        (e[4] !== 0 || e[5] !== 0 || e[6] !== 0) &&
        (e[8] !== 0 || e[9] !== 0 || e[10] !== 0)
    );
}

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
    // Google Earth-style right-button rotation: at press time, one CPU ray at the cursor
    // locks the pivot; the gesture and its inertia tail then rotate around that pivot
    // (low frequency, consistent with the collision-lock philosophy).
    private readonly m_rotatePivot: Vector3 = new Vector3();
    private readonly m_rotateGravity: Vector3 = new Vector3();
    private m_rotatePivotDistance: number = -1;
    private m_rotateDragging: boolean = false;
    private m_rotatePivotScreenX: number = 0;
    private m_rotatePivotScreenY: number = 0;
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
    public get zoomEnabled() {
        return this._zoomEnabled;
    }

    public set zoomEnabled(value: boolean) {
        this._zoomEnabled = value;
    }

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

    private headingSet?: number;
    private tiltSet?: number;
    private readonly lockCenterPoint: Vector3 | null = null;
    private readonly cameraSwivel: boolean = false;

    private _disableTilt: boolean = false;
    private _disableHeading: boolean = false;

    protected windowEventHandler: WindowEventHandler;
    private readonly mouseCursorManager: MouseCursorManager;
    private readonly m_pivotIndicator?: PivotIndicator;

    private _enabled: boolean = true;
    public get enabled() {
        return this._enabled;
    }

    public set enabled(value: boolean) {
        this._enabled = value;
    }

    public get eventHandler() {
        return this.windowEventHandler;
    }

    public get pivotIndicator(): PivotIndicator | undefined {
        return this.m_pivotIndicator;
    }

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

        if (options?.pivotIndicator !== false) {
            const pivotOpts =
                typeof options?.pivotIndicator === "object" ? options.pivotIndicator : undefined;
            this.m_pivotIndicator = new PivotIndicator(this.mapView.canvas, pivotOpts);
        }
    }

    public destroy() {
        this.windowEventHandler.clearEvent();
        this.mouseCursorManager?.dispose();
        this.m_pivotIndicator?.dispose();
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

    private m_interactionActive: boolean = false;

    protected update(): boolean {
        if (!this.enabled) {
            this.windowEventHandler.lastMouseZ = this.mouseState.z;
            return false;
        }

        const mouseX = this.canvasWidth - this.windowEventHandler.lastMouseX;
        const mouseY = this.canvasHeight - this.windowEventHandler.lastMouseY;
        const mouseDown = this.windowEventHandler.mouseDown;
        const mouseZ = this.windowEventHandler.lastMouseZ;

        const isMoving =
            Math.abs(mouseX - this.mouseState.x) > 1 || Math.abs(mouseY - this.mouseState.y) > 1;

        const isClick = mouseDown[0] && !this.mouseState.prevDown[0];
        const isWheel = mouseZ !== this.mouseState.z;
        const interactionStarting = isClick || isWheel;
        const interactionEnding =
            !mouseDown[0] && !mouseDown[1] && !mouseDown[2] && mouseZ === this.mouseState.z;

        if (interactionStarting && !this.m_interactionActive) {
            this.m_interactionActive = true;
            this.dispatchEvent(BeginInteractionUpdate);
        } else if (interactionEnding && this.m_interactionActive && !isMoving) {
            this.m_interactionActive = false;
            this.dispatchEvent(EndInteractionUpdate);
        }

        this.mouseCursorManager?.update(mouseDown, mouseZ - this.mouseState.z, isMoving);

        this.cameraTransform.cameraToWorld.copy(this.mapView.camera.matrixWorld);

        // Normalize the camera FIRST: a buried camera poisons the geometric
        // bookkeeping below (screen-center hits, pivot balancing), which can
        // drag the camera to an unrelated location instead of recovering it.
        this.enforceMinCameraHeightAboveTerrain();

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

        // First-person rotation once the view rises to the orbit-mode tilt
        // limit: from there on the pivot is the camera itself, so dragging up
        // keeps the position fixed and raises the view into the sky instead of
        // orbiting a (often very distant) ground point. Below the threshold the
        // normal orbit-around-ground behaviour is kept, also at low altitude.
        const firstPersonRotation = this.getViewPitchRad() >= this.firstPersonTiltThresholdRad;
        const rotationGravity = new Vector3();
        if (firstPersonRotation) {
            this.getDistanceToGlobe(cameraPos, rotationGravity);
        }
        const firstPersonPivot = firstPersonRotation ? cameraPos : undefined;
        const firstPersonGravity = firstPersonRotation ? rotationGravity : undefined;

        const canRotate = !this._disableTilt && !this._disableHeading;
        this.mouseState.prevDown[2] = canRotate;
        this.handleRotationOperations(
            mouseDown,
            mouseX,
            mouseY,
            firstPersonPivot,
            firstPersonGravity
        );

        this.applyTiltAndHeadingChanges(firstPersonPivot, firstPersonGravity);

        if (
            (!mouseDown[0] || !this.isPanHit) &&
            (firstPersonRotation || this.lastHitCenterDistance > 0)
        ) {
            const rotationCenter = firstPersonRotation ? cameraPos : this.lastHitCenter;
            const rotationDirection = firstPersonRotation ? rotationGravity : this.lastHitGravity;
            if (!firstPersonRotation) {
                // The orbit-mode tilt clamp rotates the camera around the ground
                // pivot, so applying it while looking up translated the camera
                // along a huge arc. In first-person mode the tilt is free (up to
                // the zenith, enforced where the rotation is applied).
                this.cameraTransform.applyTiltLimit(
                    rotationCenter,
                    rotationDirection,
                    this.tiltLimit
                );
            }
            this.cameraTransform.smartBalance(
                rotationCenter.clone(),
                rotationDirection.clone(),
                this.tiltLimit
            );
        }

        this.cameraTransform.getOrigin(cameraPos);

        this.updateMouseState(mouseX, mouseY, mouseZ, mouseDown);

        this.applyToMapView();

        this.updatePivotIndicator(mouseDown);

        this.dispatchEvent(EventUpdate);
        return false;
    }

    /**
     * Terrain clearance guard: recover a camera that ended up below the
     * terrain surface by pushing it out along the ellipsoid surface normal to
     * {@link MapView.minCameraHeight} above the terrain. lookAt/flyTo place the
     * camera from the reference ellipsoid, so at high-elevation locations the
     * placed camera can end up below the terrain, and MapView's own per-frame
     * min-height constraint is skipped whenever the GPU center-depth path
     * hits — a buried camera could then never recover.
     *
     * The guard deliberately only triggers for a genuinely buried camera
     * (clearance < 0). Enforcing the full clearance as a per-frame floor made
     * legitimate low-altitude views jump upwards on every frame (e.g. when the
     * user looks up from just above the ground).
     */
    private enforceMinCameraHeightAboveTerrain(): void {
        const elevationProvider = this.mapView.elevationProvider;
        if (elevationProvider === undefined) {
            return;
        }
        const cameraPos = new Vector3();
        this.cameraTransform.getOrigin(cameraPos);
        const geoCoords = this.mapView.projection.unprojectPoint(cameraPos);
        const terrainAltitude = elevationProvider.getHeight(geoCoords);
        if (terrainAltitude === undefined || !Number.isFinite(terrainAltitude)) {
            return;
        }
        const clearance = geoCoords.altitude - terrainAltitude;
        if (!Number.isFinite(clearance)) {
            return;
        }
        if (clearance >= 0) {
            return;
        }
        const correction = this.mapView.minCameraHeight - clearance;
        const outwardNormal = new Vector3();
        this.getDistanceAndNormal(outwardNormal, cameraPos);
        if (
            !Number.isFinite(outwardNormal.x) ||
            !Number.isFinite(outwardNormal.y) ||
            !Number.isFinite(outwardNormal.z)
        ) {
            return;
        }
        cameraPos.add(outwardNormal.multiplyScalar(correction));
        if (
            !Number.isFinite(cameraPos.x) ||
            !Number.isFinite(cameraPos.y) ||
            !Number.isFinite(cameraPos.z)
        ) {
            return;
        }
        this.cameraTransform.cameraToWorld.setPosition(cameraPos);
    }

    private applyToMapView() {
        const cameraToMapViewMatrix = this.cameraTransform.getMatrix();

        // A NaN/degenerate transform must never be written into the map camera:
        // decompose() would poison position/quaternion/scale, and three's
        // lookAt does not touch scale, so the camera stays NaN for the rest of
        // the session (the next FOV recompute then trips "Focal length must be
        // larger than 0"). Re-seed the transform from the last valid camera
        // matrix instead, which also makes the next frame self-healing.
        if (!isUsableCameraMatrix(cameraToMapViewMatrix)) {
            this.cameraTransform.cameraToWorld.copy(this.mapView.camera.matrixWorld);
            return;
        }

        if (this.haveMatricesChanged(cameraToMapViewMatrix, this.mapView.camera.matrixWorld)) {
            this.mapView.update();
        }

        this.mapView.camera.updateMatrixWorld();
        cameraToMapViewMatrix.decompose(
            this.mapView.camera.position,
            this.mapView.camera.quaternion,
            this.mapView.camera.scale
        );

        // Defense in depth: a zero column can still slip through the check
        // above after floating-point cancellation; reset the scale so the next
        // lookAt/updateMatrixWorld produces a finite matrixWorld again.
        const scale = this.mapView.camera.scale;
        if (
            !Number.isFinite(scale.x) ||
            !Number.isFinite(scale.y) ||
            !Number.isFinite(scale.z) ||
            scale.x === 0 ||
            scale.y === 0 ||
            scale.z === 0
        ) {
            scale.set(1, 1, 1);
        }
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
            if (isClick) {
                // Left-button gestures must not inherit the stale pivot of right-button rotation
                this.m_rotatePivotDistance = -1;
            }
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
                const distanceRatio =
                    this.lastHit.distanceTo(cameraPos) / this.mapView.projection.unitScale;

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

    private handleRotationOperations(
        mouseDown: boolean[],
        mouseX: number,
        mouseY: number,
        firstPersonPivot?: Vector3,
        firstPersonGravity?: Vector3
    ): void {
        const rotationDamping = 0.1;
        let firstPerson = firstPersonPivot !== undefined;

        // On the right-button press edge: capture the rotation pivot at the cursor (one CPU ray + projection fallback).
        // In first-person mode the pivot is the camera itself, so no ray is needed.
        if (mouseDown[2] && !this.m_rotateDragging) {
            this.m_rotateDragging = true;
            if (firstPerson) {
                this.m_rotatePivotDistance = -1;
            } else {
                this.captureRotatePivot(mouseX, mouseY);
            }
        } else if (!mouseDown[2]) {
            this.m_rotateDragging = false;
        }

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
            // Clear the pivot after inertia converges so a stale pivot cannot leak into later gestures
            if (
                !mouseDown[2] &&
                Math.abs(this.inertialDeltaX) < 1e-3 &&
                Math.abs(this.inertialDeltaY) < 1e-3
            ) {
                this.inertialDeltaX = 0;
                this.inertialDeltaY = 0;
                this.m_rotatePivotDistance = -1;
            }
        }

        if (
            (firstPerson || this.lastHitCenterDistance > 0 || this.m_rotatePivotDistance > 0) &&
            (this.inertialDeltaX !== 0 || this.inertialDeltaY !== 0)
        ) {
            const rotationStep = 0.0045;
            const tiltStep = rotationStep * 0.5;

            const camPos = new Vector3();
            this.cameraTransform.getOrigin(camPos);

            let tiltChange = this.inertialDeltaY * tiltStep;
            if (!this._tiltEnabled) {
                tiltChange = 0;
            }

            // Enter the first-person mode inside this very rotation if it would
            // cross the tilt limit: one large step still orbiting a distant
            // ground pivot would translate the camera by a huge arc.
            if (!firstPerson && tiltChange > 0 && this.wouldReachFirstPersonTilt(tiltChange)) {
                firstPerson = true;
            }

            let pivotPoint: Vector3;
            let gravityPoint: Vector3;
            if (firstPerson) {
                pivotPoint = camPos;
                gravityPoint = new Vector3();
                if (firstPersonGravity !== undefined) {
                    gravityPoint.copy(firstPersonGravity);
                } else {
                    this.getDistanceToGlobe(camPos, gravityPoint);
                }
                // Free head-up in first-person mode: the view may rise above
                // the horizon, capped at the zenith (straight up).
                const maxRise = MAX_VIEW_PITCH_RAD - this.getViewPitchRad();
                if (tiltChange > maxRise) {
                    tiltChange = maxRise;
                }
            } else if (this.cameraSwivel) {
                pivotPoint = camPos;
                gravityPoint = new Vector3();
                this.getDistanceToGlobe(camPos, gravityPoint);
            } else if (this.m_rotatePivotDistance > 0) {
                // Right-button rotation pivot: the world point locked at the press position (gesture + inertia tail).
                pivotPoint = this.m_rotatePivot;
                gravityPoint = this.m_rotateGravity;
            } else {
                pivotPoint = this.lastHitCenter;
                gravityPoint = this.lastHitGravity;
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
                firstPerson ? undefined : this.tiltLimit
            );
        }
    }

    /**
     * Capture the rotation pivot at the right-button press position: one CPU ray
     * (falling back to the projection plane on a miss) yields the world point plus the
     * gravity normal. Locked for the duration of the gesture; no collision re-testing.
     */
    private captureRotatePivot(mouseX: number, mouseY: number): void {
        const target = new Vector3();
        this.cameraTransform.unprojectToWorld(target, mouseX, mouseY, -1);
        const origin = new Vector3();
        this.cameraTransform.getOrigin(origin);

        const hitPoint = new Vector3();
        // The pixel coordinates for the GPU fallback are taken internally by rayCastWorld
        // from lastMouseX/Y (the mouseX/Y passed into this function are flipped internal
        // coordinates), matching the real pixel the pivot ray corresponds to.
        const dist = this.rayCastWorld(hitPoint, origin, target);
        if (dist > 0) {
            this.m_rotatePivot.copy(hitPoint);
            this.getDistanceToGlobe(hitPoint, this.m_rotateGravity);
            this.m_rotatePivotDistance = dist;
        } else {
            this.m_rotatePivotDistance = -1;
        }
        this.m_rotatePivotScreenX = this.windowEventHandler.lastMouseX;
        this.m_rotatePivotScreenY = this.windowEventHandler.lastMouseY;
    }

    private applyTiltAndHeadingChanges(
        firstPersonPivot?: Vector3,
        firstPersonGravity?: Vector3
    ): void {
        const firstPerson = firstPersonPivot !== undefined;
        if (
            (this.headingSet !== undefined || this.tiltSet !== undefined) &&
            (firstPerson || this.lastHitCenterDistance > 0)
        ) {
            if (this.headingSet !== undefined) {
                this.applyHeadingChange(firstPersonPivot, firstPersonGravity);
            }

            if (this.tiltSet !== undefined && this._tiltEnabled) {
                this.applyTiltChange(firstPersonPivot, firstPersonGravity);
            }

            this.headingSet = undefined;
            this.tiltSet = undefined;
        } else if (this.headingVelocity !== 0 || this.tiltVelocity !== 0) {
            const rotationStep = 0.03;
            if (firstPerson || this.lastHitCenterDistance > 0) {
                const tiltStepValue = this._tiltEnabled ? this.tiltVelocity * rotationStep : 0;
                const pivot = firstPerson ? firstPersonPivot! : this.lastHitCenter;
                const gravity =
                    firstPerson && firstPersonGravity ? firstPersonGravity : this.lastHitGravity;

                this.cameraTransform.rotateAroundPivotAndTilt(
                    pivot.x,
                    pivot.y,
                    pivot.z,
                    gravity.x,
                    gravity.y,
                    gravity.z,
                    this.headingVelocity * rotationStep,
                    tiltStepValue,
                    this.tiltLimit
                );
            }
        }
    }

    private applyHeadingChange(pivot?: Vector3, gravity?: Vector3): void {
        const center = pivot ?? this.lastHitCenter;
        const direction = gravity ?? this.lastHitGravity;
        const right = new Vector3();
        this.cameraTransform.getRight(right);

        const rotationMatrix = new Matrix4();
        this.setRotationLookDown(rotationMatrix, direction);
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

        const sign =
            right.x * rotationMatrix.elements[4] +
            right.y * rotationMatrix.elements[5] +
            right.z * rotationMatrix.elements[6];

        this.cameraTransform.rotateAroundPivot(
            center.x,
            center.y,
            center.z,
            direction.x,
            direction.y,
            direction.z,
            sign > 0 ? -angle : angle
        );

        this.inertialDeltaX = 0;
    }

    private applyTiltChange(pivot?: Vector3, gravity?: Vector3): void {
        const firstPerson = pivot !== undefined;
        const center = pivot ?? this.lastHitCenter;
        const direction = gravity ?? this.lastHitGravity;
        const down = new Vector3();
        const forward = new Vector3();
        this.cameraTransform.getDown(down);
        this.cameraTransform.getForward(forward);

        const downDot = direction.x * down.x + direction.y * down.y + direction.z * down.z;

        const forwardDot =
            direction.x * forward.x + direction.y * forward.y + direction.z * forward.z;

        let angle = Math.acos(Math.min(Math.max(downDot, -1), 1));
        if (forwardDot > 0) angle = -angle;

        let tiltChange = angle - (Math.PI * 0.5 - (this.tiltSet || 0));
        if (firstPerson && tiltChange > 0) {
            // Same zenith cap as the drag path: the API-driven tilt must not
            // rotate the view past straight up either.
            tiltChange = Math.min(tiltChange, MAX_VIEW_PITCH_RAD - this.getViewPitchRad());
        }

        this.cameraTransform.rotateAroundPivotAndTilt(
            center.x,
            center.y,
            center.z,
            direction.x,
            direction.y,
            direction.z,
            0,
            tiltChange,
            firstPerson ? undefined : this.tiltLimit
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

    private updatePivotIndicator(mouseDown: boolean[]): void {
        if (this.m_pivotIndicator == null || !this.m_pivotIndicator.enabled) return;

        if (mouseDown[2] && this.m_rotateDragging && this.m_rotatePivotDistance > 0) {
            // The indicator is shown at the right-click pixel position (the pivot's
            // projection on screen; that projection stays fixed while orbiting the pivot).
            this.m_pivotIndicator.show(this.m_rotatePivotScreenX, this.m_rotatePivotScreenY);
        } else {
            this.m_pivotIndicator.hide();
        }
        this.m_pivotIndicator.update();
        if (this.m_pivotIndicator.isAnimating) {
            this.mapView.update();
        }
    }

    public isPanning(): boolean {
        return this.panVelocityX !== 0 || this.panVelocityY !== 0;
    }

    public disableTilt(): void {
        this._disableTilt = true;
    }

    public disableHeading(): void {
        this._disableHeading = true;
    }

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

    /**
     * Pitch of the current view in radians, measured from the nadir direction
     * (0 = straight down, PI / 2 = horizon, PI = straight up).
     */
    private getViewPitchRad(): number {
        const cameraPos = new Vector3();
        this.cameraTransform.getOrigin(cameraPos);

        const down = new Vector3();
        this.getDistanceToGlobe(cameraPos, down);

        // `getForward` exposes the camera's +Z axis (backward); the view
        // direction is its negation.
        const viewDirection = new Vector3();
        this.cameraTransform.getForward(viewDirection);
        viewDirection.negate().normalize();

        return Math.acos(Math.min(Math.max(viewDirection.dot(down), -1), 1));
    }

    /**
     * Pitch (radians from nadir) at which the first-person mode engages. The
     * orbit mode's tilt limit (`applyTiltLimit`) starts pulling the camera back
     * around the ground pivot when the view is `maxTiltAngle` below the
     * horizon; from there on rotating around the ground pivot only moves the
     * camera (up/down) instead of raising the view. The pivot then becomes the
     * camera itself and the view may rise freely.
     */
    private get firstPersonTiltThresholdRad(): number {
        const maxTiltDeg = (this.tiltLimit * 180) / Math.PI;
        return (HORIZON_PITCH_DEG - maxTiltDeg - FIRST_PERSON_ENTRY_MARGIN_DEG) * DEG_TO_RAD;
    }

    /** Whether an upwards tilt change would reach the first-person threshold. */
    private wouldReachFirstPersonTilt(tiltChange: number): boolean {
        return this.getViewPitchRad() + tiltChange >= this.firstPersonTiltThresholdRad;
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

    protected abstract rayCastWorld(
        result: Vector3,
        origin: Vector3,
        target: Vector3,
        noFallback?: boolean,
        screenX?: number,
        screenY?: number
    ): number;

    private rayCastZoomPoint(
        result: Vector3,
        origin: Vector3,
        target: Vector3,
        isWheel: boolean
    ): number {
        if (!this.lockCenterPoint || !isWheel) {
            // isWheel (mouse wheel) -> MapControls uses the collision lock to avoid
            // high-frequency zoom rays.
            // The pixel coordinates for the GPU fallback are taken internally by
            // rayCastWorld from lastMouseX/Y -- the mouseX/Y this function receives are
            // flipped internal coordinates and must not be passed through.
            return this.rayCastWorld(result, origin, target, isWheel);
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
