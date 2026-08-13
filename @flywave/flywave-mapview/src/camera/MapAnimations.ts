/* Copyright (C) 2025 flywave.gl contributors */

import { type GeoCoordinatesLike, GeoCoordinates } from "@flywave/flywave-geoutils";
import { PerformanceTimer } from "@flywave/flywave-utils";
import * as TWEEN from "@tweenjs/tween.js";
import * as THREE from "three/webgpu";

import { type MapView } from "../MapView";

export enum EasingFunction {
    Linear,
    QuadraticIn,
    QuadraticOut,
    QuadraticInOut,
    CubicIn,
    CubicOut,
    CubicInOut,
    QuarticIn,
    QuarticOut,
    QuarticInOut,
    QuinticIn,
    QuinticOut,
    QuinticInOut,
    SinusoidalIn,
    SinusoidalOut,
    SinusoidalInOut,
    ExponentialIn,
    ExponentialOut,
    ExponentialInOut,
    CircularIn,
    CircularOut,
    CircularInOut,
    ElasticIn,
    ElasticOut,
    ElasticInOut,
    BackIn,
    BackOut,
    BackInOut,
    BounceIn,
    BounceOut,
    BounceInOut
}

export enum InterpolationFunction {
    Linear,
    Bezier,
    CatmullRom
}

export interface CameraAnimationInterruptionListener {
    onBeginInteraction?: () => void;
    onEndInteraction?: () => void;
}

export abstract class CameraAnimation {
    protected tween?: TWEEN.Tween<GeoCoordinates | Record<string, number>>;
    protected running: boolean = false;
    protected onFinished?: () => void;
    protected stopped = false;
    protected duration: number = 10000;
    protected repeat: number = 0;
    protected easing = TWEEN.Easing.Linear.None;
    protected interruptionListener?: CameraAnimationInterruptionListener;

    constructor(protected mapView: MapView, public name?: string) {
        checkSetupTween();
    }

    setInterruptionListener(listener: CameraAnimationInterruptionListener): void {
        this.interruptionListener = listener;
    }

    abstract start(time?: number, onFinished?: () => void): void;
    abstract stop(): void;

    update(time?: number): boolean {
        if (this.tween) {
            return this.tween.update(time ?? PerformanceTimer.now());
        }
        return false;
    }

    get isRunning(): boolean {
        return this.running;
    }
}

export interface CameraRotationAnimationOptions {
    axis?: THREE.Vector3;
    startAngle?: number;
    endAngle?: number;
    duration?: number;
    repeat?: number;
    easing?: EasingFunction | ((k: number) => number);
}

export class CameraRotationAnimation extends CameraAnimation {
    readonly startAngle: number = 0;
    readonly endAngle: number = 360;

    private readonly m_axis = new THREE.Vector3(0, 0, 1);
    private m_userCamerRotation?: THREE.Quaternion;
    private m_lastRotationValue: number;

    constructor(mapView: MapView, options: CameraRotationAnimationOptions, name?: string) {
        super(mapView, name);

        if (options.axis !== undefined) {
            this.m_axis = options.axis;
        }
        if (options.startAngle !== undefined) {
            this.startAngle = options.startAngle;
        }
        if (options.endAngle !== undefined) {
            this.endAngle = options.endAngle;
        }
        if (options.duration !== undefined) {
            this.duration = options.duration;
        }
        if (options.repeat !== undefined) {
            this.repeat = options.repeat;
        }

        if (options.easing !== undefined) {
            this.easing =
                typeof options.easing === "function"
                    ? options.easing
                    : easingMap.get(options.easing) ?? TWEEN.Easing.Linear.None;
        }

        this.m_lastRotationValue = this.startAngle;
    }

    start(time?: number, onFinished?: () => void): void {
        if (this.running) {
            throw new Error("Animation already running" + this.name !== undefined ? this.name : "");
        }

        this.running = true;
        this.onFinished = onFinished;
        this.stopped = false;

        this.startTween(time);
        this.mapView.beginAnimation();
    }

    stop(): void {
        if (!this.running) {
            throw new Error("Animation not running" + this.name !== undefined ? this.name : "");
        }

        this.running = false;
        this.stopped = true;
        this.mapView.endAnimation();

        if (this.tween) {
            this.tween.stop();
        }
    }

    private readonly beginInteractionListener = (): void => {
        if (!this.stopped) {
            this.stopTween();
        }
    };

    private readonly endInteractionListener = (): void => {
        if (!this.stopped) {
            this.startTween();
        }
    };

    private startTween(time?: number): void {
        const rotZ = new THREE.Quaternion();

        this.m_userCamerRotation = new THREE.Quaternion();
        this.mapView.camera.getWorldQuaternion(this.m_userCamerRotation);

        this.tween = new TWEEN.Tween({ rotation: 0 })
            .to({ rotation: this.endAngle - this.m_lastRotationValue }, this.duration)
            .onComplete(() => {
                this.stop();
                if (this.onFinished) {
                    this.onFinished();
                }
            })
            .onUpdate(({ rotation }) => {
                this.m_lastRotationValue = rotation;

                rotZ.setFromEuler(new THREE.Euler(0, 0, THREE.MathUtils.degToRad(rotation)));

                if (this.m_userCamerRotation !== undefined) {
                    rotZ.multiply(this.m_userCamerRotation);
                }

                this.mapView.camera.quaternion.copy(rotZ);
            });

        this.tween.repeat(this.repeat);
        this.tween.easing(this.easing);
        this.tween.start(time);

        this.interruptionListener?.onBeginInteraction;
    }

    private stopTween(): void {
        if (this.tween) {
            this.tween.stop();
        }
    }
}

export interface CameraPanAnimationOptions {
    geoCoordinates?: GeoCoordinatesLike[];
    duration?: number;
    repeat?: number;
    easing?: EasingFunction | ((k: number) => number);
    interpolation?: InterpolationFunction | ((v: number[], k: number) => number);
}

export class CameraPanAnimation extends CameraAnimation {
    readonly interpolation = TWEEN.Interpolation.CatmullRom;

    private readonly m_geoCoordinates: GeoCoordinatesLike[];

    constructor(mapView: MapView, options: CameraPanAnimationOptions, public name?: string) {
        super(mapView, name);

        if (options.duration !== undefined) {
            this.duration = options.duration;
        }
        if (options.repeat !== undefined) {
            this.repeat = options.repeat;
        }
        if (options.easing !== undefined) {
            this.easing =
                typeof options.easing === "function"
                    ? options.easing
                    : easingMap.get(options.easing) ?? TWEEN.Easing.Linear.None;
        }
        if (options.interpolation !== undefined) {
            this.interpolation =
                typeof options.interpolation === "function"
                    ? options.interpolation
                    : interpolationMap.get(options.interpolation) ?? TWEEN.Interpolation.Linear;
        }
        this.m_geoCoordinates = options.geoCoordinates !== undefined ? options.geoCoordinates : [];
    }

    addPosition(geoPos: GeoCoordinatesLike): void {
        this.m_geoCoordinates.push(geoPos);
    }

    start(time?: number, onFinished?: () => void): void {
        if (this.running) {
            throw new Error("Animation already running" + this.name !== undefined ? this.name : "");
        }

        this.onFinished = onFinished;
        this.running = true;

        const from = new GeoCoordinates(
            this.mapView.geoCenter.latitude,
            this.mapView.geoCenter.longitude,
            this.mapView.camera.position.z
        );

        const to = {
            latitude: new Array<number>(),
            longitude: new Array<number>(),
            altitude: new Array<number>()
        };

        for (const pos of this.m_geoCoordinates) {
            to.latitude.push(pos.latitude);
            to.longitude.push(pos.longitude);
            to.altitude.push(pos.altitude ?? this.mapView.camera.position.z);
        }

        this.tween = new TWEEN.Tween(from)
            .to(to, this.duration)
            .onComplete(() => {
                this.stop();
                if (this.onFinished) {
                    this.onFinished();
                }
            })
            .onUpdate(({ latitude, longitude, altitude }) => {
                this.mapView.geoCenter = new GeoCoordinates(latitude, longitude, altitude);
                this.mapView.camera.position.z = altitude ?? 0;
            });

        this.tween.repeat(this.repeat);
        this.tween.easing(this.easing);
        this.tween.interpolation(this.interpolation);
        this.tween.start(time);

        this.mapView.beginAnimation();
    }

    stop(): void {
        if (!this.running) {
            throw new Error("Animation not running" + this.name !== undefined ? this.name : "");
        }

        this.running = false;
        this.mapView.endAnimation();

        if (this.tween) {
            this.tween.stop();
        }
    }

    get isRunning(): boolean {
        return this.running;
    }
}

let easingMap: Map<EasingFunction, (k: number) => number>;
let interpolationMap: Map<InterpolationFunction, (v: number[], k: number) => number>;

function checkSetupTween() {
    if (easingMap !== undefined) {
        return;
    }

    easingMap = new Map<EasingFunction, (k: number) => number>();
    interpolationMap = new Map<InterpolationFunction, (v: number[], k: number) => number>();

    easingMap.set(EasingFunction.Linear, TWEEN.Easing.Linear.None);
    easingMap.set(EasingFunction.QuadraticIn, TWEEN.Easing.Quadratic.In);
    easingMap.set(EasingFunction.QuadraticOut, TWEEN.Easing.Quadratic.Out);
    easingMap.set(EasingFunction.QuadraticInOut, TWEEN.Easing.Quadratic.InOut);

    easingMap.set(EasingFunction.CubicIn, TWEEN.Easing.Cubic.In);
    easingMap.set(EasingFunction.CubicOut, TWEEN.Easing.Cubic.Out);
    easingMap.set(EasingFunction.CubicInOut, TWEEN.Easing.Cubic.InOut);

    easingMap.set(EasingFunction.QuarticIn, TWEEN.Easing.Quartic.In);
    easingMap.set(EasingFunction.QuarticOut, TWEEN.Easing.Quartic.Out);
    easingMap.set(EasingFunction.QuarticInOut, TWEEN.Easing.Quartic.InOut);

    easingMap.set(EasingFunction.QuinticIn, TWEEN.Easing.Quintic.In);
    easingMap.set(EasingFunction.QuinticOut, TWEEN.Easing.Quintic.Out);
    easingMap.set(EasingFunction.QuinticInOut, TWEEN.Easing.Quintic.InOut);

    easingMap.set(EasingFunction.SinusoidalIn, TWEEN.Easing.Sinusoidal.In);
    easingMap.set(EasingFunction.SinusoidalOut, TWEEN.Easing.Sinusoidal.Out);
    easingMap.set(EasingFunction.SinusoidalInOut, TWEEN.Easing.Sinusoidal.InOut);

    easingMap.set(EasingFunction.ExponentialIn, TWEEN.Easing.Exponential.In);
    easingMap.set(EasingFunction.ExponentialOut, TWEEN.Easing.Exponential.Out);
    easingMap.set(EasingFunction.ExponentialInOut, TWEEN.Easing.Exponential.InOut);

    easingMap.set(EasingFunction.CircularIn, TWEEN.Easing.Circular.In);
    easingMap.set(EasingFunction.CircularOut, TWEEN.Easing.Circular.Out);
    easingMap.set(EasingFunction.CircularOut, TWEEN.Easing.Circular.InOut);

    easingMap.set(EasingFunction.ElasticIn, TWEEN.Easing.Elastic.In);
    easingMap.set(EasingFunction.ElasticOut, TWEEN.Easing.Elastic.Out);
    easingMap.set(EasingFunction.ElasticInOut, TWEEN.Easing.Elastic.InOut);

    easingMap.set(EasingFunction.BackIn, TWEEN.Easing.Back.In);
    easingMap.set(EasingFunction.BackOut, TWEEN.Easing.Back.Out);
    easingMap.set(EasingFunction.BackInOut, TWEEN.Easing.Back.InOut);

    easingMap.set(EasingFunction.BounceIn, TWEEN.Easing.Bounce.In);
    easingMap.set(EasingFunction.BounceOut, TWEEN.Easing.Bounce.Out);
    easingMap.set(EasingFunction.BounceInOut, TWEEN.Easing.Bounce.InOut);

    interpolationMap.set(InterpolationFunction.Linear, TWEEN.Interpolation.Linear);
    interpolationMap.set(InterpolationFunction.Bezier, TWEEN.Interpolation.Bezier);
    interpolationMap.set(InterpolationFunction.CatmullRom, TWEEN.Interpolation.CatmullRom);
}
