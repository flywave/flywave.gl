/* Copyright (C) 2025 flywave.gl contributors */

/**
 * Physical atmosphere facade example.
 *
 * `theme.atmosphere` switches on the engine's physical sky: Rayleigh-scattered
 * blue at noon, orange Mie-dominated glow when the sun grazes the horizon and
 * stars at night. A single `sunTime` (Unix epoch ms) drives sun AND moon
 * positions, light direction and color temperature, so a 0-24h slider is the
 * whole demo. Also shown: `sunCastShadow` (the atmosphere sun as shadow
 * caster), volumetric `clouds` with a quality preset, the `agx-punchy` tone
 * mapping look, and a planet view that pulls the camera back to see the
 * atmosphere limb from space.
 *
 * Aerial perspective note: the same scattering model tints distant terrain
 * toward the sky color (haze grows with distance) — most visible at low sun
 * angles from the surface view.
 */

import { type MapView, type Theme, ArcGISTileProvider } from "@flywave/flywave.gl";

import {
    applyPanelStyle,
    createExampleGui,
    createExampleMap,
    demoTerrain,
    logExampleInfo
} from "../common";

/** Scene center (Shandong, China) — same local DEM as terrain-dem. */
const CENTER = { lat: 36.4862, lng: 118.1727 };

/** Surface vs planet camera presets. Zoom ~3 reveals the atmosphere limb. */
const ZOOM_SURFACE = 15;
const ZOOM_PLANET = 3;

/** GUI state defaults (24h clock; 10.5 = mid morning). */
const DEFAULTS = {
    hour: 10.5,
    shadows: true,
    clouds: "low" as "off" | "low" | "high",
    exposure: 1.0
};

/** Inline theme: tilezen globe surface + physical atmosphere + filmic look. */
function buildTheme(): Theme {
    return {
        extends: "resources/tilezen_base_globe.json",
        atmosphere: {
            enabled: true,
            // Mid morning local time; the engine derives sun/moon positions
            // from this timestamp (wall-clock now when omitted).
            sunTime: hourToSunTime(DEFAULTS.hour),
            sunTimeTransitionDuration: 0,
            // With enableShadows on, the atmosphere sun light casts the
            // scene's sun shadows (terrain, buildings, anchors).
            sunCastShadow: DEFAULTS.shadows,
            clouds: cloudsConfig(DEFAULTS.clouds)
        },
        // AgX "punchy" keeps the bright sun disk and deep sky saturated
        // without clipping, out of the box.
        toneMappingMode: "agx-punchy",
        toneMappingExposure: DEFAULTS.exposure
    };
}

/** Map a 0-24 hour-of-day value onto today's date as a Unix-ms sun time. */
function hourToSunTime(hour: number): number {
    const h = Math.floor(hour);
    const m = Math.round((hour - h) * 60);
    return new Date().setHours(h, m, 0, 0);
}

/**
 * Clouds preset: `false` disables the volumetric raymarcher entirely;
 * `quality` picks a step-count/shadow bundle ("low" is interactive-safe).
 */
function cloudsConfig(mode: "off" | "low" | "high"): boolean | { quality: "low" | "high" } {
    return mode === "off" ? false : { quality: mode };
}

/** Apply one GUI change: patch the atmosphere sub-object, then redraw. */
function patchAtmosphere(mapView: MapView, patch: Theme["atmosphere"]): void {
    mapView.patchTheme({ atmosphere: patch });
    mapView.update();
}

/** Wire the control panel: sun timeline, shadows, clouds, exposure, views. */
function setupGui(mapView: MapView): void {
    const state = { ...DEFAULTS, zoomSurface: ZOOM_SURFACE, zoomPlanet: ZOOM_PLANET };

    const gui = createExampleGui();
    applyPanelStyle(gui.domElement);

    const sun = gui.addFolder("Sun & Sky");
    sun.add(state, "hour", 0, 24, 0.25)
        .name("sun time (0-24h)")
        .onChange((hour: number) => {
            patchAtmosphere(mapView, {
                sunTime: hourToSunTime(hour),
                sunTimeTransitionDuration: 0
            });
        });
    sun.add(state, "shadows")
        .name("sun shadows")
        .onChange(enabled => {
            patchAtmosphere(mapView, { sunCastShadow: enabled });
        });
    sun.add(state, "clouds", ["off", "low", "high"])
        .name("clouds quality")
        .onChange((mode: "off" | "low" | "high") => {
            patchAtmosphere(mapView, { clouds: cloudsConfig(mode) });
        });
    sun.add(state, "exposure", 0.1, 3, 0.05)
        .name("exposure")
        .onChange(exposure => {
            mapView.patchTheme({ toneMappingExposure: exposure });
            mapView.update();
        });
    sun.open();

    const views = gui.addFolder("Views");
    views
        .add(
            {
                planet: () => {
                    // Far out: the globe shrinks and the Rayleigh shell shows
                    // as a glowing rim against space.
                    mapView.zoomLevel = state.zoomPlanet;
                    mapView.update();
                }
            },
            "planet"
        )
        .name("Planet view (limb)");
    views
        .add(
            {
                surface: () => {
                    mapView.zoomLevel = state.zoomSurface;
                    mapView.update();
                }
            },
            "surface"
        )
        .name("Surface view");
    views.open();
}

/** Example entry: map + local DEM terrain + atmosphere GUI. */
async function main(): Promise<void> {
    const canvas = document.getElementById("mapCanvas") as HTMLCanvasElement;
    // enableShadows is the view-wide shadow switch; the atmosphere sun light
    // casts the actual shadows (atmosphere.sunCastShadow tunes it at runtime).
    const { mapView } = await createExampleMap(canvas, {
        enableShadows: true,
        themeObject: buildTheme(),
        lookAt: {
            target: { ...CENTER, alt: 300 },
            zoomLevel: ZOOM_SURFACE,
            tilt: 35,
            heading: 0
        }
    });
    logExampleInfo("fx-atmosphere-sky", mapView);

    // Local DEM (offline) gives the sun something to shade and a horizon for
    // the aerial-perspective haze.
    const terrain = demoTerrain();
    mapView.setElevationSource(terrain);
    terrain.addWebTileDataSource(new ArcGISTileProvider({ minDataLevel: 0, maxDataLevel: 18 }));

    // patchTheme throws before the theme finished loading; getTheme() resolves
    // exactly then and is race-free even if the load already completed.
    await mapView.getTheme();
    setupGui(mapView);
}

void main();
