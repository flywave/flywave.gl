/* Copyright (C) 2025 flywave.gl contributors */

/**
 * Lighting and shadows teaching example, showing the two complementary ways
 * to light a flywave.gl scene:
 * - the engine theme rig: `theme.lights` (ambient fill + shadow-casting
 *   directional "sun") plus `enableShadows`;
 * - plain three.js lights mounted through a `MapAnchor`: a spot light with a
 *   tuned shadow camera and a point light, both with helper visualization and
 *   a moving shadow-casting/receiving box.
 */

import {
    ArcGISTileProvider,
    GeoCoordinates,
    type MapAnchor,
    MapView,
    MapViewEventNames,
    ellipsoidProjection,
    type Theme
} from "@flywave/flywave.gl";
import * as THREE from "three/webgpu";

import {
    applyPanelStyle,
    createExampleGui,
    createExampleMap,
    demoTerrain,
    logExampleInfo
} from "../common";

/** The (few) tunable constants of this example. */
const CONFIG = {
    /** Anchor of the light rig (Shandong, China). */
    anchor: new GeoCoordinates(36.4862, 118.1727, 500),
    /** Shadow map resolution for both shadow-casting lights. */
    shadowMapSize: 2048,
    boxSize: 10,
    boxColor: 0x8844aa,
    spotIntensity: 2.8,
    spotAngle: Math.PI / 4,
    pointIntensity: 1.5,
    sunIntensity: 0.8,
    ambientIntensity: 0.4
};

/**
 * The `theme.lights` array used at startup; the GUI re-patches the same shape
 * (patchTheme replaces arrays wholesale, so always patch the full list).
 */
function buildLights(sunIntensity: number): Theme["lights"] {
    return [
        {
            type: "ambient",
            name: "fill-ambient",
            color: "#c8ccd0",
            intensity: CONFIG.ambientIntensity
        },
        {
            type: "directional",
            name: "sun",
            color: "#ffffff",
            intensity: sunIntensity,
            direction: { x: -0.5, y: -1, z: -0.4 },
            castShadow: true
        }
    ];
}

/** Build the inline theme for {@link createExampleMap}. */
function buildTheme(): Theme {
    return {
        extends: "resources/tilezen_base_globe.json",
        lights: buildLights(CONFIG.sunIntensity),
        atmosphere: {
            enabled: true,
            sunTime: new Date().setHours(17, 0, 0, 0)
        }
    };
}

/** Everything the GUI and the frame tick need from the light rig. */
interface ILightRig {
    root: MapAnchor<THREE.Object3D>;
    spotLight: THREE.SpotLight;
    pointLight: THREE.PointLight;
    helpers: THREE.Object3D[];
}

/**
 * Assemble the three.js light rig: spot light with tuned shadow camera, point
 * light, their helpers and the moving shadow caster/receiver box, all parented
 * to one anchored group.
 */
function createLightRig(): ILightRig {
    const root: MapAnchor<THREE.Object3D> = new THREE.Group();

    const spotLight = new THREE.SpotLight(
        "#ffffff",
        CONFIG.spotIntensity,
        10000,
        CONFIG.spotAngle,
        0.5,
        0.2
    );
    spotLight.position.set(0, 50, 50);
    spotLight.castShadow = true;
    spotLight.shadow.mapSize.set(CONFIG.shadowMapSize, CONFIG.shadowMapSize);
    // Tight shadow-camera frustum keeps depth precision where the action is.
    spotLight.shadow.camera.near = 1;
    spotLight.shadow.camera.far = 2000;
    spotLight.shadow.bias = -0.0005;
    const spotTarget = new THREE.Object3D();
    spotTarget.position.set(0, 0, -1);
    spotLight.target = spotTarget;

    const pointLight = new THREE.PointLight("#ff4040", CONFIG.pointIntensity, 500, 0.2);
    pointLight.position.set(-30, 20, 40);
    pointLight.castShadow = true;
    pointLight.shadow.mapSize.set(1024, 1024);

    const spotHelper = new THREE.SpotLightHelper(spotLight);
    const pointHelper = new THREE.PointLightHelper(pointLight, 5);

    const box = new THREE.Mesh(
        new THREE.BoxGeometry(CONFIG.boxSize, CONFIG.boxSize, CONFIG.boxSize),
        new THREE.MeshPhongMaterial({ color: CONFIG.boxColor })
    );
    box.position.set(0, -60, 0);
    box.castShadow = true;
    box.receiveShadow = true;

    root.add(spotLight, spotTarget, spotHelper, pointLight, pointHelper, box);

    // Per-frame tick: sweep the box around so the shadows move; refresh the
    // helpers afterwards so they stay aligned with their lights.
    root.userData.animate = (delta: number): void => {
        const time = performance.now() * 0.001;
        box.position.x = Math.sin(time) * 40;
        box.position.z = Math.cos(time * 0.7) * 40;
        box.position.y = -60 + Math.abs(Math.sin(time * 1.2)) * 5;
        box.rotation.y += delta * 0.5;
        spotHelper.update();
    };
    return { root, spotLight, pointLight, helpers: [spotHelper, pointHelper] };
}

/**
 * Wire the trimmed-down control panel: five parameters covering both the
 * three.js lights and the theme sun.
 */
function setupLightingGui(mapView: MapView, rig: ILightRig): void {
    const state = {
        spotIntensity: CONFIG.spotIntensity,
        spotAngle: CONFIG.spotAngle,
        pointIntensity: CONFIG.pointIntensity,
        sunIntensity: CONFIG.sunIntensity,
        showHelpers: true
    };

    const gui = createExampleGui();
    applyPanelStyle(gui.domElement);

    const folder = gui.addFolder("Lighting");
    folder
        .add(state, "spotIntensity", 0, 5, 0.05)
        .name("spot intensity")
        .onChange(value => {
            rig.spotLight.intensity = value;
            mapView.update();
        });
    folder
        .add(state, "spotAngle", 0, Math.PI / 2, 0.01)
        .name("spot angle")
        .onChange(value => {
            rig.spotLight.angle = value;
            (rig.helpers[0] as THREE.SpotLightHelper).update();
            mapView.update();
        });
    folder
        .add(state, "pointIntensity", 0, 5, 0.05)
        .name("point intensity")
        .onChange(value => {
            rig.pointLight.intensity = value;
            mapView.update();
        });
    folder
        .add(state, "sunIntensity", 0, 3, 0.05)
        .name("sun intensity")
        .onChange(value => {
            mapView.patchTheme({ lights: buildLights(value) });
            mapView.update();
        });
    folder
        .add(state, "showHelpers")
        .name("show helpers")
        .onChange(value => {
            rig.helpers.forEach(helper => {
                helper.visible = value;
            });
            mapView.update();
        });
    folder.open();
}

/** Example entry. */
async function main(): Promise<void> {
    const canvas = document.getElementById("mapCanvas") as HTMLCanvasElement;
    // enableShadows turns on shadow rendering for the whole view.
    const { mapView } = await createExampleMap(canvas, {
        enableShadows: true,
        themeObject: buildTheme(),
        lookAt: {
            target: { lat: 36.4839, lng: 118.1755, alt: 700 },
            tilt: 50,
            heading: -19,
            zoomLevel: 16
        }
    });
    logExampleInfo("fx-lighting-shadows", mapView);

    const terrain = demoTerrain();
    mapView.setElevationSource(terrain);
    terrain.addWebTileDataSource(new ArcGISTileProvider({ minDataLevel: 0, maxDataLevel: 18 }));

    const rig = createLightRig();
    rig.root.anchor = CONFIG.anchor;
    // Orient the rig's local frame so the anchored group stands upright on
    // the globe surface.
    rig.root.lookAt(ellipsoidProjection.projectPoint(CONFIG.anchor, new THREE.Vector3()));
    mapView.mapAnchors.add(rig.root);

    // The theme sun intensity slider needs the resolved theme.
    await mapView.getTheme();
    setupLightingGui(mapView, rig);

    // Drive rig animations from MapView's on-demand frame loop.
    let lastTime = performance.now();
    mapView.addEventListener(MapViewEventNames.Update, () => {
        const now = performance.now();
        const delta = Math.min((now - lastTime) / 1000, 0.1);
        lastTime = now;
        (rig.root.userData.animate as (delta: number) => void)(delta);
    });
    mapView.beginAnimation();
}

void main();
