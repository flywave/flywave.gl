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
import { clone as SkeletonUtilsClone } from "three/examples/jsm/utils/SkeletonUtils.js";
import * as THREE from "three/webgpu";

import {
    applyPanelStyle,
    attachTerrainImagery,
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
    modelScale: 0.01,
    sunHour: 13,
    cameraTilt: 35,
    cameraDistance: 800
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
 * Load the FBX and place a row of scaled clones (skinned-mesh safe) along an
 * east-west line so the (northward) shadows never overlap a neighbour's probe
 * points. Returns the first mixer and the clip list for the GUI.
 */
async function placeAnimatedModel(mapView: MapView): Promise<{
    model: THREE.Object3D;
    mixer: THREE.AnimationMixer;
    clips: THREE.AnimationClip[];
}> {
    const model = await new FBXLoader().loadAsync(CONFIG.modelUrl);

    // Keep the raw asset un-transformed: each row instance clones it and applies its own
    // scale + upright rotation, so a clone never inherits a double rotation.
    const rowScales = [0.01, 0.05, 0.1, 0.3, 0.5];
    const metersPerDegLng = 111320 * Math.cos((CONFIG.anchor.latitude / 180) * Math.PI);
    const rowSpacing = 200;
    const mixers: THREE.AnimationMixer[] = [];
    const elevationProvider = mapView.elevationProvider;
    const rowRoots: Array<{ root: MapAnchor<THREE.Object3D>; geo: GeoCoordinates }> = [];

    rowScales.forEach((scale, i) => {
        const instance = SkeletonUtilsClone(model);
        instance.scale.setScalar(scale);
        instance.rotateX(CONFIG.modelUprightRotationX);
        instance.traverse(child => {
            if ((child as THREE.Mesh).isMesh) {
                child.castShadow = true;
                child.receiveShadow = true;
            }
        });
        const offsetLng = ((i - (rowScales.length - 1) / 2) * rowSpacing) / metersPerDegLng;
        // Anchor each instance at ITS OWN terrain elevation — a fixed altitude buries the
        // model halfway into whatever high ground sits along the row. The DEM is usually NOT
        // loaded yet at placement time, so the initial query returns a coarse fallback; a
        // tracker below re-anchors once the fine tiles arrive.
        const anchorGeo = new GeoCoordinates(
            CONFIG.anchor.latitude,
            CONFIG.anchor.longitude + offsetLng,
            CONFIG.anchor.altitude
        );
        const terrainHeight = elevationProvider?.getHeight(anchorGeo, 14);
        anchorGeo.altitude = terrainHeight !== undefined ? terrainHeight : CONFIG.anchor.altitude;
        const root: MapAnchor<THREE.Object3D> = new THREE.Group();
        root.anchor = anchorGeo;
        root.lookAt(
            ellipsoidProjection.projectPoint(
                anchorGeo,
                new THREE.Vector3()
            )
        );
        root.add(instance);
        mapView.mapAnchors.add(root);
        rowRoots.push({ root, geo: anchorGeo });
        const mixer = new THREE.AnimationMixer(instance);
        const clip = model.animations[0];
        if (clip !== undefined) {
            mixer.clipAction(clip).play();
        }
        mixers.push(mixer);
    });

    // Re-anchor each model as the DEM refines: poll the elevation provider until every
    // anchor has been stable for a few consecutive checks, then stop.
    let stableChecks = 0;
    const anchorTracker = window.setInterval(() => {
        let changed = false;
        for (const { root, geo } of rowRoots) {
            const height = elevationProvider?.getHeight(geo, 14);
            if (height !== undefined && Math.abs(height - geo.altitude) > 0.5) {
                geo.altitude = height;
                root.lookAt(ellipsoidProjection.projectPoint(geo, new THREE.Vector3()));
                changed = true;
            }
        }
        if (changed) {
            stableChecks = 0;
            mapView.update();
        } else if (++stableChecks >= 3) {
            window.clearInterval(anchorTracker);
        }
    }, 1000);
    (window as any).__shadowRow = {
        scales: rowScales,
        spacing: rowSpacing,
        centerLat: CONFIG.anchor.latitude,
        centerLng: CONFIG.anchor.longitude
    };

    const mixer = new THREE.AnimationMixer(model);
    const clips = model.animations;
    logger.info(`Loaded ${CONFIG.modelUrl} with ${clips.length} animation clip(s)`);
    // The GUI drives every row instance through the shared timeScale.
    (mixer as any).__rowMixers = mixers;
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
        .add(state, "scale", 0.01, 1, 0.01)
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
    // sun shadow; satellite imagery is draped onto the terrain tiles (must go
    // through the terrain source, not a standalone layer, or it depth-fights).
    const terrain = demoTerrain();
    await mapView.setElevationSource(terrain);
    attachTerrainImagery(terrain);

    const { model, mixer, clips } = await placeAnimatedModel(mapView);

    // Drive the mixer from the view's on-demand loop; beginAnimation keeps
    // frames coming while the mixer is running.
    let lastTime = performance.now();
    mapView.addEventListener(MapViewEventNames.Update, () => {
        const now = performance.now();
        const delta = Math.min((now - lastTime) / 1000, 0.1);
        lastTime = now;
        mixer.update(delta);
        const rowMixers = (mixer as any).__rowMixers as THREE.AnimationMixer[] | undefined;
        if (rowMixers !== undefined) {
            for (const m of rowMixers) {
                m.update(delta);
            }
        }
    });
    mapView.beginAnimation();

    await mapView.getTheme();
    setupGui(mapView, model, mixer, clips);

    // TEMP shadow-debug HUD: real far/near numbers to judge CSM resolution. Remove when done.
    const hud = document.createElement("div");
    hud.style.cssText =
        "position:absolute;left:8px;bottom:40px;color:#0f0;background:rgba(0,0,0,.6);" +
        "font:12px/1.5 monospace;padding:4px 6px;z-index:999;white-space:pre";
    document.body.appendChild(hud);
    const refreshHud = (): void => {
        const cam = mapView.camera;
        const sceneFar = (
            mapView.clipPlanesEvaluator as any
        ).computeSceneFar(cam, mapView.projection, mapView.elevationProvider);
        const camGeo = mapView.projection.unprojectPoint(cam.position);
        const csm = (mapView.mapRenderingManager.viewRenderManager as any)?.csmShadowNode;
        const light = csm?.light;
        const breaks = (csm?.breaks ?? []).map((b: number) => b.toFixed(3)).join(",");
        hud.textContent =
            `viewRanges.far = ${mapView.viewRanges.far.toFixed(0)} m\n` +
            `computeSceneFar = ${sceneFar.toFixed(0)} m\n` +
            `camera.near = ${cam.near.toFixed(2)}  camera.far = ${cam.far.toFixed(0)} m\n` +
            `castShadow=${light?.castShadow} csm.maxFar=${csm?.maxFar} lights=${csm?.lights.length}\n` +
            `breaks(norm×far)= ${breaks}\n` +
            `cam lat=${camGeo.latitude.toFixed(5)} lng=${camGeo.longitude.toFixed(5)} ` +
            `alt=${camGeo.altitude.toFixed(0)} m`;
    };
    refreshHud();
    window.setInterval(refreshHud, 1000);

    // Optional camera override for shadow debugging: ?flyto=lat,lng,distance,tilt,heading
    const [pLat, pLng, pDist, pTilt, pHdg] =
        new URLSearchParams(window.location.search).get("flyto")?.split(",").map(Number) ?? [];
    if (Number.isFinite(pLat)) {
        void mapView.flyTo({
            target: { latitude: pLat, longitude: pLng },
            distance: pDist,
            tilt: pTilt,
            heading: pHdg,
            duration: 1
        });
    }
}

void main();
