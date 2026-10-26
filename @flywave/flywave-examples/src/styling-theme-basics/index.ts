/* Copyright (C) 2025 flywave.gl contributors */

/**
 * Theme system basics (v2): the two entry points for changing the look of a
 * live map, and the contract between them.
 *
 * - `mapView.setTheme(url | object)` — **asynchronous**. Loads a full theme
 *   (JSON including async sections: images, styles, fontCatalogs, ...),
 *   re-decodes tiles and re-applies everything. Use it for complete swaps,
 *   never inside tight loops.
 * - `mapView.patchTheme(delta)` — **synchronous deep-merge patch** for the
 *   non-async theme sections (lights, clearColor, fog, postEffects,
 *   toneMappingExposure, ...). It throws when the theme is still loading and
 *   refuses async sections (styles, definitions, images, ...) — restyling
 *   geometry always goes through `setTheme`.
 *
 * The scene keeps only local reference blocks (no external data), so theme
 * and lighting changes are easy to read: exposure and tone mapping act on the
 * final image, light rigs shade the standard materials, `clearColor` recolors
 * the background.
 */

import { type MapAnchor, type Theme, GeoCoordinates } from "@flywave/flywave.gl";
import { BoxGeometry, Color, Mesh, MeshStandardNodeMaterial } from "three/webgpu";

import {
    applyPanelStyle,
    createExampleGui,
    createExampleMap,
    createImageryWithFallback,
    demoImagery,
    logExampleInfo
} from "../common";

/** Scene center (Jinan, Shandong) — blocks float around it. */
const CENTER = new GeoCoordinates(36.6512, 117.1201, 0);

/**
 * tilezen theme JSONs shipped in `@flywave/flywave-map-theme/resources/` and
 * served under `resources/` (resolved through the MapView uriResolver).
 */
const THEME_PRESETS: Record<string, string> = {
    "Day (tilezen base)": "resources/tilezen_base_globe.json",
    "Night (reduced)": "resources/tilezen_night_reduced.json",
    "Outlines effect": "resources/tilezen_effects_outlines.json"
};

/** Light rigs cycled by the day/night toggle (ambient + directional pairs). */
const LIGHT_RIGS = {
    day: {
        clearColor: "#87959A",
        lights: [
            { type: "ambient", color: "#FFFFFF", name: "ambientLight", intensity: 0.9 },
            {
                type: "directional",
                color: "#FFFFFF",
                name: "sunLight",
                intensity: 1.6,
                direction: { x: 0.4, y: -0.5, z: 0.8 }
            }
        ]
    },
    night: {
        clearColor: "#232833",
        lights: [
            { type: "ambient", color: "#C9CACC", name: "ambientLight", intensity: 0.35 },
            {
                type: "directional",
                color: "#8FA3C7",
                name: "moonLight",
                intensity: 0.8,
                direction: { x: -0.5, y: -0.3, z: 0.8 }
            }
        ]
    }
} as const;

/** GUI state mirrored onto the theme. */
interface IThemeState {
    theme: string;
    exposure: number;
    saturation: number;
    nightLights: boolean;
}

/**
 * Add flat-shaded reference blocks around the center. `MeshStandardNodeMaterial`
 * reacts to the theme's light rig, making patches directly visible. Anchored
 * through `mapAnchors` — persistent objects must never hang off the scene root.
 */
function addReferenceBlocks(
    mapView: Awaited<ReturnType<typeof createExampleMap>>["mapView"]
): void {
    const colors = [0xe74c3c, 0x3498db, 0x2ecc71, 0xf1c40f, 0x9b59b6, 0xecf0f1];
    colors.forEach((color, i) => {
        const angle = (i / colors.length) * Math.PI * 2;
        const height = 220 + (i % 3) * 120;
        const block: MapAnchor<Mesh> = new Mesh(
            new BoxGeometry(70, 70, height),
            new MeshStandardNodeMaterial({ color: new Color(color) })
        );
        block.position.setZ(height / 2);
        block.rotateZ(angle);
        block.anchor = new GeoCoordinates(
            CENTER.lat + Math.sin(angle) * 0.0025,
            CENTER.lng + Math.cos(angle) * 0.0035,
            0
        );
        mapView.mapAnchors.add(block);
    });
}

/** Create the status HUD (bottom-left) used to trace theme operations. */
function createStatusHud(): HTMLElement {
    const hud = document.createElement("div");
    Object.assign(hud.style, {
        position: "absolute",
        left: "16px",
        bottom: "16px",
        maxWidth: "46%",
        padding: "8px 12px",
        color: "#fff",
        font: "12px/1.5 sans-serif",
        whiteSpace: "pre-wrap"
    } as CSSStyleDeclaration);
    applyPanelStyle(hud);
    document.body.appendChild(hud);
    return hud;
}

/**
 * Wire the control panel.
 *
 * CONTRACT (also enforced by MapViewThemeManager):
 * - `patchTheme` throws while a theme loads and logs a warning for async
 *   sections ("styles", "definitions", "images", "fontCatalogs", "extends",
 *   ...). Never call it from a pending `setTheme` continuation — await
 *   `mapView.getTheme()` (or `mapView.ready`) first.
 * - Restyling geometry (fill colors, techniques) requires `setTheme` with a
 *   full theme object; `patchTheme` cannot change the `styles` section.
 */
function setupThemeGui(
    mapView: Awaited<ReturnType<typeof createExampleMap>>["mapView"],
    initialTheme: string,
    hud: HTMLElement
): void {
    const state: IThemeState = {
        theme: initialTheme,
        exposure: 1,
        saturation: 0,
        nightLights: false
    };

    const label = (url: string): string =>
        Object.keys(THEME_PRESETS).find(key => THEME_PRESETS[key] === url) ?? url;

    let switching = false;

    const gui = createExampleGui();
    applyPanelStyle(gui.domElement);

    // --- async path: full theme swap -------------------------------------
    const themeFolder = gui.addFolder("Theme — setTheme (async)");
    themeFolder
        .add(state, "theme", Object.keys(THEME_PRESETS))
        .name("preset")
        .onChange(async (name: string) => {
            if (switching) {
                return;
            }
            switching = true;
            hud.textContent = `setTheme("${THEME_PRESETS[name]}") loading…`;
            try {
                // Full reload: async sections (images/styles/fonts) allowed.
                await mapView.setTheme(THEME_PRESETS[name]);
                hud.textContent = `theme = ${name}\nstyles/images/fonts reloaded (async).`;
            } catch (err) {
                hud.textContent = `setTheme failed: ${String(err)}`;
            } finally {
                switching = false;
            }
        });
    themeFolder.open();

    // --- sync path: deep-merge patches -----------------------------------
    const patchFolder = gui.addFolder("Patch — patchTheme (sync)");
    patchFolder.add(state, "exposure", 0.2, 3, 0.05).onChange(value => {
        // Top-level theme key, handled synchronously by patchTheme.
        mapView.patchTheme({ toneMappingExposure: value });
        hud.textContent = `patchTheme({ toneMappingExposure: ${value.toFixed(2)} })`;
    });
    patchFolder.add(state, "saturation", -1, 1, 0.05).onChange(value => {
        // postEffects is a patchable (non-async) theme section.
        mapView.patchTheme({
            postEffects: { hueSaturation: { enabled: true, hue: 0, saturation: value } }
        });
        hud.textContent = `patchTheme({ postEffects.hueSaturation.saturation: ${value.toFixed(
            2
        )} })`;
    });
    patchFolder.add({ toggle: () => applyLightRig() }, "toggle").name("toggle day/night light");
    patchFolder.open();

    function applyLightRig(): void {
        state.nightLights = !state.nightLights;
        const rig = state.nightLights ? LIGHT_RIGS.night : LIGHT_RIGS.day;
        // `lights` and `clearColor` are synchronous theme sections.
        mapView.patchTheme({ clearColor: rig.clearColor, lights: [...rig.lights] });
        hud.textContent = `patchTheme({ clearColor, lights }) → ${
            state.nightLights ? "night" : "day"
        }`;
    }
}

/** Example entry: map, offline reference blocks and the theme panel. */
async function main(): Promise<void> {
    const canvas = document.getElementById("mapCanvas") as HTMLCanvasElement;

    const initialTheme = THEME_PRESETS["Day (tilezen base)"];
    const { mapView } = await createExampleMap(canvas, {
        themeObject: {
            extends: initialTheme,
            // Light sky so the base scene reads as a bright stage.
            sky: {
                type: "gradient",
                topColor: "#9EC5E6",
                bottomColor: "#E9EDF2",
                groundColor: "#C8CEC8"
            },
            clearColor: "#DDE3EA"
        } as Theme,
        lookAt: {
            target: { lat: CENTER.lat, lng: CENTER.lng, alt: 100 },
            zoomLevel: 15.5,
            tilt: 38,
            heading: 25
        }
    });
    logExampleInfo("styling-theme-basics", mapView);

    // Imagery ground layer with offline debug-grid fallback; the setTheme /
    // patchTheme calls below restyle sources, they never remove them.
    await createImageryWithFallback(mapView, demoImagery({ provider: "arcgis" }));

    addReferenceBlocks(mapView);

    // patchTheme throws "Style is not done loading" before the theme settles;
    // createExampleMap already awaited `ready`, this is belt-and-braces.
    await mapView.getTheme();

    setupThemeGui(mapView, initialTheme, createStatusHud());
}

void main();
