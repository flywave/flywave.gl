/* Copyright (C) 2025 flywave.gl contributors */

import { GeoCoordinates } from "@flywave/flywave-geoutils";
import { LoggerManager } from "@flywave/flywave-utils";
import * as THREE from "three/webgpu";

import { type LookAtParams, type MapView, type RenderEvent, MapViewEventNames } from "../MapView";
import { MapViewUtils } from "../Utils";

const logger = LoggerManager.instance.create("CameraKeyTrackAnimation");
const MIN_DISTANCE = 0;

export interface ControlPointOptions
    extends Partial<Pick<LookAtParams, "target" | "tilt" | "heading" | "distance">> {
    timestamp: number;
    name?: string;
}

export class ControlPoint
    implements Pick<LookAtParams, "target" | "tilt" | "heading" | "distance">
{
    timestamp: number = 0;
    target: GeoCoordinates;
    name?: string;
    tilt: number;
    heading: number;
    distance: number;

    constructor(options: ControlPointOptions) {
        this.timestamp = options.timestamp;
        this.target = options.target
            ? GeoCoordinates.fromObject(options.target)
            : new GeoCoordinates(0, 0);
        this.tilt = options.tilt ?? 0;
        this.heading = options.heading ?? 0;
        this.distance = options.distance ?? MIN_DISTANCE;
        this.name = options.name ?? Date.now().toString();
    }
}

export interface CameraKeyTrackAnimationOptions {
    controlPoints: ControlPoint[];
    name?: string;
    interpolation?: THREE.InterpolationModes;
    loop?: THREE.AnimationActionLoopStyles;
    rotateOnlyClockwise?: boolean;
    repetitions?: number;
}

class AnimationDummy extends THREE.Object3D {
    distance: number = 0;

    constructor(name: string) {
        super();
        this.name = name;
    }
}

export class CameraKeyTrackAnimation {
    private readonly m_animationClip: THREE.AnimationClip;
    private readonly m_animationMixer: THREE.AnimationMixer;
    private readonly m_animationAction: THREE.AnimationAction;
    private readonly m_dummy: AnimationDummy = new AnimationDummy("dummy");
    private readonly m_azimuthAxis = new THREE.Vector3(0, 0, 1);
    private readonly m_altitudeAxis = new THREE.Vector3(1, 0, 0);
    private m_running: boolean = false;
    private m_onFinished: (() => void) | undefined;
    private readonly m_name?: string;

    private m_lastFrameTime: number = 0;
    private readonly m_animateCb: (event: RenderEvent) => void;

    constructor(
        private readonly m_mapView: MapView,
        private readonly m_options: CameraKeyTrackAnimationOptions
    ) {
        const interpolation =
            this.m_options.interpolation !== undefined
                ? this.m_options.interpolation
                : THREE.InterpolateSmooth;

        this.m_options.loop = this.m_options.loop ?? THREE.LoopOnce;
        this.m_options.repetitions = this.m_options.repetitions ?? 1;

        this.m_options.rotateOnlyClockwise = this.m_options.rotateOnlyClockwise ?? true;

        this.m_name = (this.m_options.name ?? "CameraKeyTrackAnimation") + Date.now();

        const timestamps = this.m_options.controlPoints.map(point => {
            return point.timestamp;
        });
        const posValues: number[] = [];
        const rotValues: number[] = [];
        this.m_options.controlPoints.map(point => {
            const worldPos = this.m_mapView.projection.projectPoint(point.target);
            posValues.push(worldPos.x);
            posValues.push(worldPos.y);
            posValues.push(worldPos.z);

            const rot = new THREE.Quaternion();
            rot.setFromAxisAngle(this.m_azimuthAxis, THREE.MathUtils.degToRad(point.heading));
            rot.multiply(
                new THREE.Quaternion().setFromAxisAngle(
                    this.m_altitudeAxis,
                    THREE.MathUtils.degToRad(point.tilt)
                )
            );
            rotValues.push(rot.x);
            rotValues.push(rot.y);
            rotValues.push(rot.z);
            rotValues.push(rot.w);
        });

        const lookAtTrack = new THREE.VectorKeyframeTrack(
            ".position",
            timestamps,
            posValues,
            interpolation
        );

        const rotationTrack = new THREE.QuaternionKeyframeTrack(
            ".quaternion",
            timestamps,
            rotValues,
            interpolation
        );

        const distanceTrack = new THREE.NumberKeyframeTrack(
            ".distance",
            timestamps,
            this.m_options.controlPoints.map(point => {
                return point.distance;
            }),
            interpolation
        );

        this.m_animationClip = new THREE.AnimationClip("cameraflyoveranimation", -1, [
            lookAtTrack,
            rotationTrack,
            distanceTrack
        ]);
        if (!this.m_animationClip.validate()) {
            logger.error(
                "Review the entered controlpoints for: ",
                this.m_name,
                ", The Animation was provided with invalid track data"
            );
        }
        this.m_animationClip.resetDuration();
        this.m_animationClip.trim();

        this.m_animationMixer = new THREE.AnimationMixer(this.m_dummy);
        this.m_animationAction = this.m_animationMixer.clipAction(this.m_animationClip);
        this.m_animationAction.setLoop(this.m_options.loop, this.m_options.repetitions);
        this.m_animationAction.clampWhenFinished = true;

        this.m_animateCb = this.animate.bind(this);
        this.m_animationMixer.addEventListener("finished", this.stop.bind(this));
    }

    set loop(value: THREE.AnimationActionLoopStyles) {
        this.m_options.loop = value;
        this.m_animationAction.setLoop(this.m_options.loop, this.m_options.repetitions as number);
    }

    set repetitions(value: number) {
        this.m_options.repetitions = value;
        this.m_animationAction.setLoop(
            this.m_options.loop as THREE.AnimationActionLoopStyles,
            this.m_options.repetitions
        );
    }

    set rotateOnlyClockwise(value: boolean) {
        this.m_options.rotateOnlyClockwise = value;
    }

    start(time?: number, onFinished?: () => void): void {
        if (this.m_running) {
            this.stop();
        }
        this.m_onFinished = onFinished;
        this.m_animationAction.reset().play();
        this.m_lastFrameTime = Date.now();
        this.m_mapView.addEventListener(MapViewEventNames.Render, this.m_animateCb);
        this.m_mapView.beginAnimation();
        this.m_running = true;
    }

    stop(): void {
        this.m_mapView.removeEventListener(MapViewEventNames.Render, this.m_animateCb);
        this.m_mapView.endAnimation();
        if (this.m_onFinished !== undefined) {
            window.setTimeout(this.m_onFinished, 0);
        }
        this.m_running = false;
    }

    isRunning(): boolean {
        return this.m_running;
    }

    private updateCameraFromDummy() {
        let tilt = THREE.MathUtils.radToDeg(
            this.m_azimuthAxis
                .clone()
                .applyQuaternion(this.m_dummy.quaternion)
                .angleTo(this.m_azimuthAxis)
        );
        tilt = THREE.MathUtils.clamp(tilt, 0, MapViewUtils.MAX_TILT_DEG);

        const vec0 = this.m_altitudeAxis.clone().applyQuaternion(this.m_dummy.quaternion);
        let angle = vec0.angleTo(this.m_altitudeAxis);
        if (this.m_options.rotateOnlyClockwise) {
            const direction = this.m_azimuthAxis.dot(vec0.normalize().cross(this.m_altitudeAxis));
            if (direction >= 0) {
                angle = 2 * Math.PI - angle;
            }
        }
        const heading = THREE.MathUtils.radToDeg(angle);

        const target = this.m_mapView.projection.unprojectPoint(this.m_dummy.position);

        const distance = Math.max(MIN_DISTANCE, this.m_dummy.distance);
        if (isNaN(tilt) || isNaN(heading) || isNaN(distance) || !target.isValid()) {
            logger.error("Cannot update due to invalid data", tilt, heading, distance, target);
        }
        this.m_mapView.lookAt({ target, distance, tilt, heading });
    }

    private animate(event: RenderEvent) {
        const deltaTime = (Date.now() - this.m_lastFrameTime) / 1000;
        this.m_animationMixer.update(deltaTime);
        this.m_lastFrameTime = Date.now();
        this.updateCameraFromDummy();
    }
}
