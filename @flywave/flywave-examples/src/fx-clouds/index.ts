/* Copyright (C) 2025 flywave.gl contributors */

/**
 * Volumetric clouds showcase, distilled from the internal cloud-mapview
 * debug page (all parity-pose camera overrides, console interception and
 * monkey-patching removed — this is plain public API).
 *
 * How it works in one sentence: clouds are a raymarch through a 3D noise
 * field (low-frequency shape + high-frequency "cauliflower" detail, warped by
 * turbulence), lit per-sample by the physical atmosphere and temporally
 * upscaled — `theme.atmosphere.clouds` only tunes that marcher.
 *
 * The GUI writes the REAL `CloudConfig` fields via `patchTheme`:
 * - `quality`: a preset bundling march-step counts and shadow parameters;
 * - `coverage` (0-1): global gating of where clouds form (0 clear, 1 overcast);
 * - `layers[].densityScale`: per-layer density multiplier — we define our own
 *   two-layer stack (cumulus + cirrus), because patching `layers` replaces
 *   the array wholesale and an incomplete layer (e.g. `height: 0`) is inert;
 * - `atmosphere.sunCastShadow`: the master shadow switch (cloud shadow maps
 *   onto the ground ride on the same sun-shadow pipeline).
 */

import {
    type CloudConfig,
    type CloudLayerConfig,
    type MapView,
    type Theme
} from "@flywave/flywave.gl";

import { applyPanelStyle, createExampleGui, createExampleMap, logExampleInfo } from "../common";

/** Wide view over the Mediterranean: clouds read best from above. */
const LOOK_AT = {
    target: { lat: 35, lng: 30, alt: 0 },
    zoomLevel: 3.2,
    tilt: 0,
    heading: 0
};

/** GUI defaults. */
const DEFAULTS = {
    hour: 12,
    quality: "high" as CloudConfig["quality"],
    coverage: 0.35,
    density: 0.18,
    sunShadows: true
};

/**
 * The example's own layer stack (values from the documented typical ranges):
 * a dense low cumulus deck and a thin high cirrus veil. `channel` packs each
 * layer into a distinct weather-texture channel (up to 4 layers).
 */
function buildLayers(state: typeof DEFAULTS): CloudLayerConfig[] {
    return [
        {
            channel: "r",
            altitude: 1400,
            height: 900,
            densityScale: state.density,
            // Cumulus casts/receives shadow in the cloud shadow march.
            shadow: state.sunShadows
        },
        {
            channel: "g",
            altitude: 8000,
            height: 500,
            densityScale: 0.02,
            // Wispy cirrus skips the shadow march to save GPU time.
            shadow: false
        }
    ];
}

/** Inline theme: bare globe + atmosphere with high-quality clouds. */
function buildTheme(): Theme {
    return {
        extends: "resources/tilezen_base_globe.json",
        atmosphere: {
            enabled: true,
            // Morning sun so the cumulus tops catch warm light.
            sunTime: hourToSunTime(DEFAULTS.hour),
            sunTimeTransitionDuration: 0,
            sunCastShadow: DEFAULTS.sunShadows,
            clouds: {
                quality: DEFAULTS.quality,
                coverage: DEFAULTS.coverage,
                layers: buildLayers(DEFAULTS)
            }
        },
        toneMappingMode: "agx-punchy"
    };
}

/** Map a 0-24 hour-of-day value onto today's date as a Unix-ms sun time. */
function hourToSunTime(hour: number): number {
    const h = Math.floor(hour);
    const m = Math.round((hour - h) * 60);
    return new Date().setHours(h, m, 0, 0);
}

/** Wire the control panel; every change goes through one patchTheme call. */
function setupGui(mapView: MapView): void {
    const state = { ...DEFAULTS };

    const applyClouds = (): void => {
        mapView.patchTheme({
            atmosphere: {
                sunTime: hourToSunTime(state.hour),
                sunTimeTransitionDuration: 0,
                sunCastShadow: state.sunShadows,
                clouds: {
                    quality: state.quality,
                    coverage: state.coverage,
                    layers: buildLayers(state)
                }
            }
        });
        mapView.update();
    };

    const gui = createExampleGui();
    applyPanelStyle(gui.domElement);

    const folder = gui.addFolder("Volumetric Clouds");
    folder.add(state, "hour", 0, 24, 0.25).name("sun time (0-24h)").onChange(applyClouds);
    folder
        .add(state, "quality", ["low", "medium", "high", "ultra"])
        .name("quality preset")
        .onChange(applyClouds);
    folder.add(state, "coverage", 0.05, 1, 0.01).name("coverage").onChange(applyClouds);
    folder.add(state, "density", 0.02, 0.4, 0.005).name("cumulus density").onChange(applyClouds);
    folder.add(state, "sunShadows").name("sun shadows").onChange(applyClouds);
    folder.open();
}

/** Example entry: bare globe + clouds; no data sources at all. */
async function main(): Promise<void> {
    const canvas = document.getElementById("mapCanvas") as HTMLCanvasElement;
    const { mapView } = await createExampleMap(canvas, {
        themeObject: buildTheme(),
        lookAt: LOOK_AT
    });
    logExampleInfo("fx-clouds", mapView);

    await mapView.getTheme();
    setupGui(mapView);
}

void main();
