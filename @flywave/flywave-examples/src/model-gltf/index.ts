/* Copyright (C) 2025 flywave.gl contributors */

/**
 * GLTF model placement through flywave's own pipeline (distilled from the
 * legacy threejs-gltf-viewer A/B page; the plain three.js GLTFLoader path and
 * console-debug globals are dropped — one loader, taught properly).
 *
 * The pipeline, in order:
 * 1. {@link loadGLTF} fetches the `.glb` and parses chunks/buffers/images with
 *    the engine's {@link GLTFLoader};
 * 2. {@link postProcessGLTF} flattens node graphs, resolves textures and
 *    prepares materials;
 * 3. {@link createThreeSceneFromGLTF} converts the postprocessed document into
 *    a three.js scene (`{ scene, animations, nodes, textures }`).
 *
 * Placement is geo, not scene-graph: attach the scene as a `MapAnchor` (the
 * render list is rebuilt every frame, so `mapAnchors` is the ONLY persistent
 * home) and give it an `anchor` GeoCoordinates. Anchored frames are Z-up
 * (local +Z points away from the earth center), so the wrapper group is
 * uprighted once with `lookAt` and the GUI heading spins the model around
 * that axis.
 */

import {
    type MapAnchor,
    type MapView,
    createThreeSceneFromGLTF,
    ellipsoidProjection,
    GeoCoordinates,
    GLTFLoader,
    loadGLTF,
    postProcessGLTF
} from "@flywave/flywave.gl";
import * as THREE from "three/webgpu";

import { applyPanelStyle, createExampleGui, createExampleMap, logExampleInfo } from "../common";

/** Model served from the examples' `resources/` folder via the uriResolver. */
const MODEL_URL = "cctv.glb";

/** Placement (Manhattan, NYC): geo position of the model's origin. */
const ANCHOR = { lat: 40.721603666587, lng: -73.96000108689394 };

/** GUI state defaults. Model units are meters; cctv.glb needs upscaling. */
const DEFAULTS = {
    altitude: 0,
    heading: 0,
    scale: 100
};

/**
 * Load, post-process and convert, then anchor the result onto the view.
 *
 * @returns The loaded model scene (child of the anchored wrapper group).
 */
async function placeGltfModel(mapView: MapView): Promise<THREE.Object3D> {
    // 1 + 2: fetch/parse, then resolve materials and textures.
    const gltf = await loadGLTF(MODEL_URL, GLTFLoader);
    const postprocessed = postProcessGLTF(gltf);
    // 3: build the three.js scene (animations stay available on the result).
    const { scene } = createThreeSceneFromGLTF(postprocessed);
    scene.scale.setScalar(DEFAULTS.scale);

    // Wrapper group carries the geo placement and the upright orientation;
    // the model inside it is free to spin and scale around local +Z (up).
    const anchor = new GeoCoordinates(ANCHOR.lat, ANCHOR.lng, DEFAULTS.altitude);
    const root: MapAnchor<THREE.Object3D> = new THREE.Group();
    root.anchor = anchor;
    root.lookAt(ellipsoidProjection.projectPoint(anchor, new THREE.Vector3()));
    root.add(scene);
    mapView.mapAnchors.add(root);
    return scene;
}

/**
 * Wire the placement panel: altitude rewrites the anchor GeoCoordinates,
 * heading and scale rewrite the model transform — each followed by an
 * `update()` because the render loop is on-demand.
 */
function setupGui(mapView: MapView, model: THREE.Object3D): void {
    const state = { ...DEFAULTS };

    const applyPlacement = (): void => {
        const root = model.parent;
        if (root !== null) {
            root.anchor = new GeoCoordinates(ANCHOR.lat, ANCHOR.lng, state.altitude);
        }
        model.rotation.z = (state.heading * Math.PI) / 180;
        model.scale.setScalar(state.scale);
        mapView.update();
    };

    const gui = createExampleGui();
    applyPanelStyle(gui.domElement);

    const folder = gui.addFolder("Model Placement");
    folder.add(state, "altitude", -50, 500, 1).name("altitude (m)").onChange(applyPlacement);
    folder.add(state, "heading", 0, 360, 1).name("heading (deg)").onChange(applyPlacement);
    folder.add(state, "scale", 10, 400, 1).name("scale").onChange(applyPlacement);
    folder.open();
}

/** Example entry. */
async function main(): Promise<void> {
    const canvas = document.getElementById("mapCanvas") as HTMLCanvasElement;
    const { mapView } = await createExampleMap(canvas, {
        themeObject: { extends: "resources/tilezen_base_globe.json" },
        lookAt: {
            target: { lat: ANCHOR.lat, lng: ANCHOR.lng, alt: 30 },
            distance: 300,
            tilt: 40
        }
    });
    logExampleInfo("model-gltf", mapView);

    const model = await placeGltfModel(mapView);

    await mapView.getTheme();
    setupGui(mapView, model);
}

void main();
