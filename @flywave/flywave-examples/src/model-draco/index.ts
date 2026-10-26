/* Copyright (C) 2025 flywave.gl contributors */

/**
 * Draco-compressed glTF loading through the standard flywave pipeline.
 *
 * Where the decoder is wired (the one thing this example teaches): the engine
 * `GLTFLoader` ships `gltf.decompressMeshes: true` by default, so any
 * primitive carrying the `KHR_draco_mesh_compression` extension is decoded
 * transparently inside `loadGLTF` — the extension handler calls the internal
 * `DracoLoader` from `@flywave/flywave-draco` (an engine-internal package,
 * NOT re-exported by `@flywave/flywave.gl`). Decoder registration point: the
 * wasm/js decoder library is resolved from `<FLYWAVE_BASE_URL>/resources/libs/
 * draco` when the bundle defines a base URL (the examples webpack config
 * copies three's `examples/jsm/libs` decoder files there), falling back to the
 * gstatic CDN otherwise. Application code needs zero extra setup.
 *
 * The bundled `resources/` folder currently has no draco-compressed asset, so
 * this example runs the plain `cctv.glb` through the IDENTICAL code path —
 * swap in a `KHR_draco_mesh_compression` .glb and it decodes with no further
 * changes (the decode happens before `postProcessGLTF` ever sees the data).
 *
 * The GUI reports the measured fetch + decode + three-scene build time, which
 * is where Draco pays off: far fewer bytes on the wire, decode cost on load.
 */

import {
    type ILogger,
    type MapAnchor,
    type MapView,
    createThreeSceneFromGLTF,
    ellipsoidProjection,
    GeoCoordinates,
    GLTFLoader,
    loadGLTF,
    LoggerManager,
    postProcessGLTF
} from "@flywave/flywave.gl";
import * as THREE from "three/webgpu";

import { applyPanelStyle, createExampleGui, createExampleMap, logExampleInfo } from "../common";

const logger: ILogger = LoggerManager.instance.create("flywave-examples/model-draco");

/** Model served from the examples' `resources/` folder via the uriResolver. */
const MODEL_URL = "cctv.glb";

/** Placement (Manhattan, NYC): geo position of the model's origin. */
const ANCHOR = { lat: 40.721603666587, lng: -73.96000108689394 };

/** Model scale default (model units are meters; this asset needs upscaling). */
const MODEL_SCALE = 100;

/**
 * Run the full pipeline and return the model plus the measured duration of
 * fetch + parse (+ draco decompression, when the asset uses it) + the three
 * scene build.
 */
async function loadDracoModel(mapView: MapView): Promise<{ model: THREE.Object3D; ms: number }> {
    const start = performance.now();

    const gltf = await loadGLTF(MODEL_URL, GLTFLoader);
    const postprocessed = postProcessGLTF(gltf);
    const { scene } = createThreeSceneFromGLTF(postprocessed);
    scene.scale.setScalar(MODEL_SCALE);

    const ms = performance.now() - start;

    // Standard MapAnchor placement (same pattern as model-gltf).
    const anchor = new GeoCoordinates(ANCHOR.lat, ANCHOR.lng, 0);
    const root: MapAnchor<THREE.Object3D> = new THREE.Group();
    root.anchor = anchor;
    root.lookAt(ellipsoidProjection.projectPoint(anchor, new THREE.Vector3()));
    root.add(scene);
    mapView.mapAnchors.add(root);
    return { model: scene, ms };
}

/** Wire the panel: a live decode-time readout and the model scale. */
function setupGui(mapView: MapView, model: THREE.Object3D, decodeMs: number): void {
    const state = { decodeMs: Math.round(decodeMs), scale: MODEL_SCALE };

    const gui = createExampleGui();
    applyPanelStyle(gui.domElement);

    const folder = gui.addFolder("Draco Pipeline");
    // Static readout: dat.gui 0.7 has no controller.disable(), the value is
    // measured once before the panel opens and never changes.
    folder.add(state, "decodeMs").name("decode + build (ms)");
    folder
        .add(state, "scale", 10, 400, 1)
        .name("scale")
        .onChange((scale: number) => {
            model.scale.setScalar(scale);
            mapView.update();
        });
    folder.open();

    logger.info(`glTF pipeline finished in ${state.decodeMs} ms (${MODEL_URL})`);
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
    logExampleInfo("model-draco", mapView);

    const { model, ms } = await loadDracoModel(mapView);

    await mapView.getTheme();
    setupGui(mapView, model, ms);
}

void main();
