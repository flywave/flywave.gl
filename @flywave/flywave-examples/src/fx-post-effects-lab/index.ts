/* Copyright (C) 2025 flywave.gl contributors */

/**
 * Theme-level post-effects lab: the analytic grading stages of
 * `theme.postEffects` (vignette / brightnessContrast / hueSaturation / sepia)
 * side by side with the anti-aliasing selector (`none | taa | smaa`) and
 * screen-space reflections.
 *
 * SSR is a per-object effect: the pass itself is switched on by
 * `postEffects.ssr`, but WHICH surfaces reflect is decided by
 * `mapRenderingManager.addReflectiveObject` — the mirror plaza below is the
 * only tagged object, everything else pays nothing. Tagging writes a
 * reflectivity mask into the scene pass MRT; the SSR pass reflects the
 * already-rendered frame onto those pixels (no second scene render).
 *
 * All controls go through `mapView.patchTheme`, i.e. exactly the same path a
 * theme JSON takes — no private APIs. Changing any switch rebuilds the
 * post-processing chain once, which is why the toggles are explicit.
 */

import {
    ArcGISTileProvider,
    GeoCoordinates,
    type MapAnchor,
    type MapView,
    type Theme
} from "@flywave/flywave.gl";

import { BoxGeometry, Color, Mesh, MeshBasicNodeMaterial } from "three/webgpu";

import {
    applyPanelStyle,
    createExampleGui,
    createExampleMap,
    demoTerrain,
    logExampleInfo
} from "../common";

/** Scene center (Shandong, China). */
const CENTER = { lat: 36.4902, lng: 118.1742 };

/** Ground height the lab geometry sits on (matches the DEM around CENTER). */
const PLATEAU_ALT = 500;

/** Neutral default for every grading stage — the lab starts ungraded. */
const GRADING_DEFAULTS = {
    vignette: { enabled: false, offset: 1, darkness: 1 },
    brightnessContrast: { enabled: false, brightness: 0, contrast: 0 },
    hueSaturation: { enabled: false, hue: 0, saturation: 0 },
    sepia: { enabled: false, amount: 0.6 }
};

/** SSR starts on so the mirror plaza has something to show immediately. */
const SSR_DEFAULTS = {
    enabled: true,
    resolutionScale: 0.5,
    intensity: 1,
    debug: 0
};

/** GUI state mirrored into the theme through {@link applyLabState}. */
interface ILabState {
    antialiasing: "none" | "taa" | "smaa";
    ssr: { enabled: boolean; resolutionScale: number; intensity: number; debug: number };
    vignette: { enabled: boolean; offset: number; darkness: number };
    brightnessContrast: { enabled: boolean; brightness: number; contrast: number };
    hueSaturation: { enabled: boolean; hue: number; saturation: number };
    sepia: { enabled: boolean; amount: number };
}

/** Build the inline theme: daylight atmosphere + neutral post effects. */
function buildTheme(): Theme {
    return {
        extends: "resources/tilezen_base_globe.json",
        lights: [],
        atmosphere: {
            enabled: true,
            // Daylight so the grading stages are readable.
            sunTime: new Date().setHours(15, 0, 0, 0)
        },
        postEffects: {
            antialiasing: "smaa",
            ssr: { ...SSR_DEFAULTS },
            vignette: { ...GRADING_DEFAULTS.vignette },
            brightnessContrast: { ...GRADING_DEFAULTS.brightnessContrast },
            hueSaturation: { ...GRADING_DEFAULTS.hueSaturation },
            sepia: { ...GRADING_DEFAULTS.sepia }
        }
    };
}

/**
 * The mirror plaza: one dark, polished ground slab with saturated pillars
 * standing on it. The slab is the only object tagged as reflective, so the
 * SSR frame cost scales with the pixels it covers.
 */
function addMirrorPlaza(mapView: MapView): void {
    const plaza: MapAnchor<Mesh> = new Mesh(
        new BoxGeometry(420, 420, 8),
        new MeshBasicNodeMaterial({ color: new Color(0x0e1118) })
    );
    // BoxGeometry spans ±z/2; lift it so its top face is the plaza surface.
    plaza.position.setZ(4);
    plaza.anchor = new GeoCoordinates(CENTER.lat, CENTER.lng, PLATEAU_ALT - 2);
    mapView.mapAnchors.add(plaza);

    // Mirror-grade reflectivity (F0 ≈ 0.9) with a low roughness so the
    // reflections stay sharp; tune live with the SSR folder.
    mapView.mapRenderingManager.addReflectiveObject(plaza, {
        reflectivity: 0.9,
        roughness: 0.05
    });

    const pillars = [0xe74c3c, 0x3498db, 0x2ecc71, 0xf1c40f, 0xffffff, 0x9b59b6];
    pillars.forEach((color, i) => {
        const angle = (i / pillars.length) * Math.PI * 2;
        const height = 150 + i * 20;
        const pillar: MapAnchor<Mesh> = new Mesh(
            new BoxGeometry(55, 55, height),
            new MeshBasicNodeMaterial({ color: new Color(color) })
        );
        pillar.position.setZ(height / 2);
        pillar.rotateZ(angle);
        pillar.anchor = new GeoCoordinates(
            CENTER.lat + Math.sin(angle) * 0.0011,
            CENTER.lng + Math.cos(angle) * 0.0015,
            PLATEAU_ALT
        );
        mapView.mapAnchors.add(pillar);
    });
}

/** Push the whole GUI state into the theme and redraw one frame. */
function applyLabState(mapView: MapView, state: ILabState): void {
    mapView.patchTheme({
        postEffects: {
            antialiasing: state.antialiasing,
            ssr: { ...state.ssr },
            vignette: { ...state.vignette },
            brightnessContrast: { ...state.brightnessContrast },
            hueSaturation: { ...state.hueSaturation },
            sepia: { ...state.sepia }
        }
    });
    mapView.update();
}

/** Wire the control panel: one folder per stage, plus a global reset. */
function setupLabGui(mapView: MapView): void {
    const state: ILabState = {
        antialiasing: "smaa",
        ssr: { ...SSR_DEFAULTS },
        vignette: { ...GRADING_DEFAULTS.vignette },
        brightnessContrast: { ...GRADING_DEFAULTS.brightnessContrast },
        hueSaturation: { ...GRADING_DEFAULTS.hueSaturation },
        sepia: { ...GRADING_DEFAULTS.sepia }
    };

    const apply = (): void => applyLabState(mapView, state);

    const gui = createExampleGui();
    applyPanelStyle(gui.domElement);

    const ssrFolder = gui.addFolder("SSR (via addReflectiveObject)");
    ssrFolder.add(state.ssr, "enabled").name("enabled").onChange(apply);
    ssrFolder.add(state.ssr, "intensity", 0, 2, 0.05).name("intensity").onChange(apply);
    ssrFolder.add(state.ssr, "resolutionScale", 0.25, 1, 0.05).name("resolution").onChange(apply);
    ssrFolder
        .add(state.ssr, "debug", { Off: 0, "UV encode": 1, Normals: 2 })
        .name("debug")
        .onChange(apply);
    ssrFolder.open();

    const aaFolder = gui.addFolder("Antialiasing");
    aaFolder.add(state, "antialiasing", ["none", "taa", "smaa"]).name("mode").onChange(apply);
    aaFolder.open();

    const vignetteFolder = gui.addFolder("Vignette");
    vignetteFolder.add(state.vignette, "enabled").onChange(apply);
    vignetteFolder.add(state.vignette, "offset", 0, 2, 0.05).name("offset").onChange(apply);
    vignetteFolder.add(state.vignette, "darkness", 0, 2, 0.05).name("darkness").onChange(apply);
    vignetteFolder.close();

    const bcFolder = gui.addFolder("Brightness / Contrast");
    bcFolder.add(state.brightnessContrast, "enabled").onChange(apply);
    bcFolder
        .add(state.brightnessContrast, "brightness", -1, 1, 0.01)
        .name("brightness")
        .onChange(apply);
    bcFolder
        .add(state.brightnessContrast, "contrast", -1, 1, 0.01)
        .name("contrast")
        .onChange(apply);
    bcFolder.close();

    const hsFolder = gui.addFolder("Hue / Saturation");
    hsFolder.add(state.hueSaturation, "enabled").onChange(apply);
    hsFolder.add(state.hueSaturation, "hue", -1, 1, 0.01).name("hue").onChange(apply);
    hsFolder.add(state.hueSaturation, "saturation", -1, 1, 0.01).name("saturation").onChange(apply);
    hsFolder.close();

    const sepiaFolder = gui.addFolder("Sepia");
    sepiaFolder.add(state.sepia, "enabled").onChange(apply);
    sepiaFolder.add(state.sepia, "amount", 0, 1, 0.01).name("amount").onChange(apply);
    sepiaFolder.close();

    gui.add(
        {
            reset: (): void => {
                // Rebuilding the panel is cheaper than tracking every
                // controller; the fresh state starts at the defaults, which
                // the end of this function pushes into the theme.
                gui.destroy();
                setupLabGui(mapView);
            }
        },
        "reset"
    ).name("Reset all");

    // Push the initial state once so the theme and the panel agree.
    applyLabState(mapView, state);
}

/** Example entry. */
async function main(): Promise<void> {
    const canvas = document.getElementById("mapCanvas") as HTMLCanvasElement;

    const { mapView } = await createExampleMap(canvas, {
        themeObject: buildTheme(),
        lookAt: {
            target: { ...CENTER, alt: 900 },
            zoomLevel: 16,
            tilt: 40,
            heading: 1.2
        }
    });
    logExampleInfo("fx-post-effects-lab", mapView);
    // Automation hook (not part of the public example surface).
    Object.assign(window, { __postLabDebug: { mapView } });

    addMirrorPlaza(mapView);

    const terrain = demoTerrain();
    mapView.setElevationSource(terrain);
    terrain.addWebTileDataSource(new ArcGISTileProvider({ minDataLevel: 0, maxDataLevel: 18 }));

    // The panel (and any patchTheme call) needs the resolved theme; this
    // await is race-free even if ThemeLoaded already fired.
    await mapView.getTheme();
    setupLabGui(mapView);
}

void main();
