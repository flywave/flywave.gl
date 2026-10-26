/* Copyright (C) 2025 flywave.gl contributors */

/**
 * Skeletal animation on the map (distilled from threejs-model-animation):
 * an FBX character is loaded with three.js `FBXLoader`, driven by an
 * `AnimationMixer`, and placed with the standard `MapAnchor` pattern.
 *
 * Key integration points:
 * - The mixer must tick every frame, but MapView renders on demand — hook
 *   `MapViewEventNames.Update` and call `mapView.beginAnimation()` once so
 *   the view keeps producing frames while the mixer is active.
 * - Anchored frames are Z-up while FBX is Y-up, so the model child is
 *   rotated +90° around X inside the uprighted wrapper group.
 * - Sun shadows come from the atmosphere light: `enableShadows` on the view
 *   plus `atmosphere.sunCastShadow` in the theme; the skinned meshes set
 *   `castShadow`/`receiveShadow` themselves.
 */

import {
    type ILogger,
    type MapAnchor,
    type MapView,
    type Theme,
    ellipsoidProjection,
    GeoCoordinates,
    LoggerManager,
    MapViewEventNames
} from "@flywave/flywave.gl";
import { FBXLoader } from "three/examples/jsm/loaders/FBXLoader.js";
import * as THREE from "three/webgpu";

import {
    applyPanelStyle,
    createExampleGui,
    createExampleMap,
    demoTerrain,
    logExampleInfo
} from "../common";

const logger: ILogger = LoggerManager.instance.create("flywave-examples/model-animation");

/** The (few) tunables of this example. */
const CONFIG = {
    /** FBX asset in the examples' `resources/` folder. */
    modelUrl: "Samba Dancing.fbx",
    /** Geo placement (Shandong DEM area, on the terrain surface). */
    anchor: new GeoCoordinates(36.48619699228674, 118.17270928364879, 330),
    /** FBX is Y-up, anchored frames are Z-up. */
    modelUprightRotationX: Math.PI / 2,
    modelScale: 0.5,
    sunHour: 13,
    cameraTilt: 55,
    cameraDistance: 120
};

/** Inline theme: atmosphere sun at noon casts the shadows, no extra lights. */
function buildTheme(): Theme {
    return {
        extends: "resources/tilezen_base_globe.json",
        lights: [],
        atmosphere: {
            enabled: true,
            sunTime: new Date().setHours(CONFIG.sunHour, 0, 0, 0),
            sunCastShadow: true
        }
    };
}

/**
 * Load the FBX, upright it inside an anchored wrapper group and return the
 * model, its mixer and the clip list for the GUI.
 */
async function placeAnimatedModel(mapView: MapView): Promise<{
    model: THREE.Object3D;
    mixer: THREE.AnimationMixer;
    clips: THREE.AnimationClip[];
}> {
    const model = await new FBXLoader().loadAsync(CONFIG.modelUrl);

    model.scale.setScalar(CONFIG.modelScale);
    model.rotateX(CONFIG.modelUprightRotationX);
    model.traverse(child => {
        if ((child as THREE.Mesh).isMesh) {
            child.castShadow = true;
            child.receiveShadow = true;
        }
    });

    // Wrapper group carries the geo placement and the upright orientation.
    const root: MapAnchor<THREE.Object3D> = new THREE.Group();
    root.anchor = CONFIG.anchor;
    root.lookAt(ellipsoidProjection.projectPoint(CONFIG.anchor, new THREE.Vector3()));
    root.add(model);
    mapView.mapAnchors.add(root);

    const mixer = new THREE.AnimationMixer(model);
    const clips = model.animations;
    logger.info(`Loaded ${CONFIG.modelUrl} with ${clips.length} animation clip(s)`);
    return { model, mixer, clips };
}

/** Playback panel: play/pause, speed, clip switcher and scale. */
function setupGui(
    mapView: MapView,
    model: THREE.Object3D,
    mixer: THREE.AnimationMixer,
    clips: THREE.AnimationClip[]
): void {
    const state = {
        playing: true,
        speed: 1,
        clip: clips.length > 0 ? clips[0].name : "(none)",
        scale: CONFIG.modelScale
    };

    const playClip = (name: string): void => {
        const clip = clips.find(candidate => candidate.name === name);
        if (clip === undefined) {
            return;
        }
        mixer.stopAllAction();
        mixer.clipAction(clip).play();
    };

    const gui = createExampleGui();
    applyPanelStyle(gui.domElement);

    const folder = gui.addFolder("Animation");
    if (clips.length > 0) {
        playClip(state.clip);
        folder
            .add(
                state,
                "clip",
                clips.map(clip => clip.name)
            )
            .name("clip")
            .onChange(playClip);
    }
    folder
        .add(state, "playing")
        .name("playing")
        .onChange(playing => {
            mixer.timeScale = playing ? state.speed : 0;
            mapView.update();
        });
    folder
        .add(state, "speed", 0, 2, 0.1)
        .name("speed")
        .onChange(speed => {
            if (state.playing) {
                mixer.timeScale = speed;
            }
        });
    folder
        .add(state, "scale", 0.05, 1, 0.01)
        .name("scale")
        .onChange((scale: number) => {
            model.scale.setScalar(scale);
            mapView.update();
        });
    folder.open();
}

/** Example entry. */
async function main(): Promise<void> {
    const canvas = document.getElementById("mapCanvas") as HTMLCanvasElement;
    // enableShadows switches shadow rendering on for the whole view.
    const { mapView } = await createExampleMap(canvas, {
        enableShadows: true,
        themeObject: buildTheme(),
        lookAt: {
            target: {
                lat: CONFIG.anchor.latitude,
                lng: CONFIG.anchor.longitude,
                alt: CONFIG.anchor.altitude
            },
            distance: CONFIG.cameraDistance,
            tilt: CONFIG.cameraTilt,
            heading: 0
        }
    });
    logExampleInfo("model-animation", mapView);

    // Local offline DEM so the model stands on real ground and receives the
    // sun shadow.
    const terrain = demoTerrain();
    mapView.setElevationSource(terrain);

    const { model, mixer, clips } = await placeAnimatedModel(mapView);

    // Drive the mixer from the view's on-demand loop; beginAnimation keeps
    // frames coming while the mixer is running.
    let lastTime = performance.now();
    mapView.addEventListener(MapViewEventNames.Update, () => {
        const now = performance.now();
        const delta = Math.min((now - lastTime) / 1000, 0.1);
        lastTime = now;
        mixer.update(delta);
    });
    mapView.beginAnimation();

    await mapView.getTheme();
    setupGui(mapView, model, mixer, clips);
}

void main();
