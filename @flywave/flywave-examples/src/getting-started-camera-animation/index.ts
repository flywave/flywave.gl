/* Copyright (C) 2025 flywave.gl contributors */

import {
    CameraAnimationBuilder,
    CameraKeyTrackAnimation,
    ControlPoint,
    GeoCoordinates,
    MapView
} from "@flywave/flywave.gl";
import {
    attachTerrainImagery,
    createExampleMap,
    demoTerrain,
    logExampleInfo
} from "../common";
import { GUI } from "dat.gui";
import * as THREE from "three/webgpu";

/** Named landmarks for the camera tour (Jinan and Beijing highlights). */
const LANDMARKS: Record<string, GeoCoordinates> = {
    JinanCenter: new GeoCoordinates(36.6512, 117.12),
    DamingLake: new GeoCoordinates(36.6778, 117.0211),
    BaotuSpring: new GeoCoordinates(36.6614, 117.0094),
    ThousandBuddhaMountain: new GeoCoordinates(36.625, 117.0333),
    BeijingCenter: new GeoCoordinates(39.9042, 116.4074),
    ForbiddenCity: new GeoCoordinates(39.9163, 116.3972),
    TempleOfHeaven: new GeoCoordinates(39.8822, 116.4064),
    SummerPalace: new GeoCoordinates(39.9998, 116.2754)
};

/**
 * Playback options shared by every animation created in this example; all
 * fields map 1:1 onto `CameraKeyTrackAnimationOptions`.
 */
interface AnimationOptions {
    interpolation: THREE.InterpolationModes;
    loop: THREE.AnimationActionLoopStyles;
    repetitions: number;
    rotateOnlyClockWise: boolean;
}

/**
 * dat.GUI state: which tour is active and which landmark to fly to.
 */
interface TourUiState {
    orbit: boolean;
    flyTo: string;
    flyOver: boolean;
}

/**
 * Orbit animation around the current camera target: a full 360-degree
 * heading sweep built from {@link CameraAnimationBuilder.getLookAtFromView},
 * with a slight distance pulse on every other keyframe.
 */
function createOrbitAnimation(
    mapView: MapView,
    animationOptions: AnimationOptions
): CameraKeyTrackAnimation {
    const lookAt = CameraAnimationBuilder.getLookAtFromView(mapView);

    const orbitControlPoints = [
        { heading: 0, distance: lookAt.distance },
        { heading: 90, distance: lookAt.distance * 1.1 },
        { heading: 180, distance: lookAt.distance },
        { heading: 270, distance: lookAt.distance * 1.1 },
        { heading: 360, distance: lookAt.distance }
    ].map((key, index) => new ControlPoint({ ...lookAt, timestamp: index * 10, ...key }));

    return new CameraKeyTrackAnimation(mapView, {
        controlPoints: orbitControlPoints,
        interpolation: animationOptions.interpolation,
        loop: animationOptions.loop,
        repetitions: animationOptions.repetitions
    });
}

/**
 * Landmark fly-over route: Daming Lake -> Jinan center -> Forbidden City ->
 * Temple of Heaven, with per-keyframe heading/tilt/distance.
 */
function createFlyOverAnimation(
    mapView: MapView,
    animationOptions: AnimationOptions
): CameraKeyTrackAnimation {
    const controlPoints = [
        { target: LANDMARKS.DamingLake, timestamp: 0, heading: 300, tilt: 45, distance: 800 },
        { target: LANDMARKS.JinanCenter, timestamp: 50, heading: 20, tilt: 45, distance: 2000 },
        {
            target: LANDMARKS.ForbiddenCity,
            timestamp: 150,
            heading: 180,
            tilt: 35,
            distance: 1500
        },
        { target: LANDMARKS.TempleOfHeaven, timestamp: 250, heading: 90, tilt: 25, distance: 1000 }
    ].map(key => new ControlPoint(key));

    return new CameraKeyTrackAnimation(mapView, {
        controlPoints,
        interpolation: animationOptions.interpolation,
        loop: animationOptions.loop,
        repetitions: animationOptions.repetitions
    });
}

/**
 * Wire the tour GUI: orbit / fly-over toggles, a landmark flyTo dropdown and
 * live-tunable playback options (interpolation, loop, repetitions, heading
 * direction). Starting a tour stops the running one first.
 */
function createTourGui(mapView: MapView, animationOptions: AnimationOptions): GUI {
    let currentAnimation: CameraKeyTrackAnimation | undefined;
    const state: TourUiState = { orbit: false, flyTo: "JinanCenter", flyOver: false };

    const stopCurrent = (): void => {
        currentAnimation?.stop();
        currentAnimation = undefined;
    };

    const startTour = (animation: CameraKeyTrackAnimation): void => {
        stopCurrent();
        animation.start();
        currentAnimation = animation;
    };

    const gui = new GUI({ width: 300 });

    gui.add(state, "orbit")
        .name("Orbit current target")
        .listen()
        .onChange((enable: boolean) => {
            stopCurrent();
            state.flyOver = false;
            if (enable) {
                startTour(createOrbitAnimation(mapView, animationOptions));
            }
        });

    gui.add(state, "flyOver")
        .name("Fly Jinan -> Beijing")
        .listen()
        .onChange((enable: boolean) => {
            stopCurrent();
            state.orbit = false;
            if (enable) {
                startTour(createFlyOverAnimation(mapView, animationOptions));
            }
        });

    gui.add(state, "flyTo", Object.keys(LANDMARKS))
        .name("Fly to landmark")
        .listen()
        .onChange((name: string) => {
            stopCurrent();
            state.orbit = false;
            state.flyOver = false;
            void mapView.flyTo({
                target: LANDMARKS[name],
                distance: name.includes("Beijing") ? 3000 : 1500,
                tilt: 25,
                heading: Math.random() * 360,
                duration: 10,
                curve: "bow"
            });
        });

    gui.add(animationOptions, "interpolation", {
        smooth: THREE.InterpolateSmooth,
        linear: THREE.InterpolateLinear,
        discrete: THREE.InterpolateDiscrete
    })
        .name("Interpolation")
        .onChange((value: number) => {
            animationOptions.interpolation = value as THREE.InterpolationModes;
            // Running animations keep their clip; the choice applies to the
            // next animation created.
            alert("This will only take effect for the next animation created");
        });

    gui.add(animationOptions, "repetitions", [1, 2, 3, 5, 10, Infinity])
        .name("Repetitions")
        .onChange((value: number) => {
            if (currentAnimation !== undefined) {
                currentAnimation.repetitions = value;
            }
        });

    gui.add(animationOptions, "loop", {
        once: THREE.LoopOnce,
        pingpong: THREE.LoopPingPong,
        repeat: THREE.LoopRepeat
    })
        .name("Loop mode")
        .onChange((value: number) => {
            animationOptions.loop = value as THREE.AnimationActionLoopStyles;
            if (currentAnimation !== undefined) {
                currentAnimation.loop = value as THREE.AnimationActionLoopStyles;
            }
        });

    gui.add(animationOptions, "rotateOnlyClockWise")
        .name("Clockwise heading")
        .listen()
        .onChange((value: boolean) => {
            animationOptions.rotateOnlyClockWise = value;
            if (currentAnimation !== undefined) {
                currentAnimation.rotateOnlyClockwise = value;
            }
        });

    return gui;
}

/**
 * Camera animation example: landmark orbits, a cross-city fly-over route and
 * flyTo, all built on `CameraKeyTrackAnimation` and tuned live from dat.GUI.
 */
async function main(): Promise<void> {
    const canvas = document.getElementById("mapCanvas") as HTMLCanvasElement;

    const { mapView } = await createExampleMap(canvas, {
        theme: "resources/tilezen_base_globe.json",
        lookAt: { target: { lat: 36.6512, lng: 117.12 }, distance: 2000, tilt: 45 }
    });
    logExampleInfo("getting-started-camera-animation", mapView);

    // DEM terrain (local tiles + ArcGIS elevation) and imagery with a
    // debug-grid fallback so the tours have a textured ground below.
    const terrain = demoTerrain();
    mapView.setElevationSource(terrain);
    attachTerrainImagery(terrain);
    mapView.update();

    const animationOptions: AnimationOptions = {
        interpolation: THREE.InterpolateSmooth,
        loop: THREE.LoopOnce,
        repetitions: 1,
        rotateOnlyClockWise: true
    };
    createTourGui(mapView, animationOptions);
}

main().catch(err => console.error("getting-started-camera-animation failed:", err));
