import {
    MapView,
    GeoCoordinates,
    ellipsoidProjection,
    MapControls,
    MapControlsUI,
    CopyrightElementHandler
} from "@flywave/flywave.gl";
import {
    loadGLTF,
    GLTFLoader,
    postProcessGLTF,
    createThreeSceneFromGLTF
} from "@flywave/flywave-gltf";
import * as THREE from "three/webgpu";
import { GLTFLoader as ThreeGLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";

const MODEL_URL = "cctv.glb";
const ANCHOR_LEFT = new GeoCoordinates(40.721603666587, -73.96050108689394, 0);
const ANCHOR_RIGHT = new GeoCoordinates(40.721603666587, -73.95950108689394, 0);

const canvas = document.getElementById("mapCanvas") as HTMLCanvasElement;

const mapView = new MapView({
    projection: ellipsoidProjection,
    target: new GeoCoordinates(40.721603666587, -73.96000108689394, 0),
    distance:100,
    canvas,
    theme: {
        extends: "resources/tilezen_base_globe.json"
    }
});

const mapControls = new MapControls(mapView);
mapControls.enabled = true;

const ui = new MapControlsUI(mapControls, {
    zoomLevel: "input",
    projectionSwitch: true
});
canvas.parentElement!.appendChild(ui.domElement);

CopyrightElementHandler.install("copyrightNotice", mapView);

window.addEventListener("resize", () => {
    mapView.resize(window.innerWidth, window.innerHeight);
});
mapView.resize(window.innerWidth, window.innerHeight);
mapView.update();

// 1. Load with flywave's own GLTF loader + post-process to three.js scene
async function loadFlywaveGLTF() {
    try {
        const gltfRaw = await loadGLTF(MODEL_URL, GLTFLoader);
        const gltfPost = postProcessGLTF(gltfRaw);
        const result = createThreeSceneFromGLTF(gltfPost);
        //@ts-ignore
        result.scene.anchor = ANCHOR_LEFT;
        mapView.mapAnchors.add(result.scene);
        result.scene.scale.set(100,100,100);
        console.log("[flywave-gltf] Loaded scene:", result.scene);
        //@ts-ignore
        window.flywaveModel = result.scene;
    } catch (e) {
        console.error("[flywave-gltf] Error:", e);
    }
}

// 2. Load with three.js built-in GLTFLoader
const threeLoader = new ThreeGLTFLoader();
threeLoader.load(
    MODEL_URL,
    gltf => {
        const model = gltf.scene;
        //@ts-ignore
        model.anchor = ANCHOR_RIGHT;
        mapView.mapAnchors.add(model);
        model.scale.set(100,100,100);
        console.log("[three.js GLTFLoader] Loaded scene:", model);
        //@ts-ignore
        window.threeModel = model;
    },
    undefined,
    error => console.error("[three.js GLTFLoader] Error:", error)
);

loadFlywaveGLTF();

//@ts-ignore
window.mapView = mapView;

console.log("GLTF comparison example loaded");
