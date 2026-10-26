/* Copyright (C) 2025 flywave.gl contributors */

/**
 * Precipitation showcase: rain and snow are configured purely through the
 * theme (`theme.rain` / `theme.snow`, `null` disables). The GUI toggles and
 * tunes them at runtime via `mapView.patchTheme`.
 *
 * Debug switches: `?rain=off` starts without rain, `?snow=on` starts with
 * snow instead of (or next to) rain.
 */

import { ArcGISTileProvider, MapView, type Theme } from "@flywave/flywave.gl";

import {
    applyPanelStyle,
    createExampleGui,
    createExampleMap,
    demoTerrain,
    logExampleInfo
} from "../common";

/** Scene center (Shandong, China). */
const CENTER = { lat: 36.4902, lng: 118.1742 };

/** URL-parameter start state, shared with the GUI so sliders match it. */
const START_RAIN = new URLSearchParams(location.search).get("rain") !== "off";
const START_SNOW = new URLSearchParams(location.search).get("snow") === "on";

/**
 * Rain section as accepted by the engine at runtime.
 *
 * TODO(engine): rain/snow not yet in Theme schema — the fields below are read
 * off the raw theme object by the precipitation renderer, but the public
 * `Theme` interface does not declare them yet, so theme objects carrying them
 * go through an `as unknown as Theme` assertion.
 */
interface IRainConfig {
    intensity: number;
    density: number;
    /** Fall direction as [azimuth, polar] degrees. */
    direction: [number, number];
    color: string;
    opacity: number;
    /** 0-1: fade streaks close to the camera to avoid a wall of rain. */
    centerThinning?: number;
}

/**
 * Snow section as accepted by the engine at runtime.
 *
 * TODO(engine): rain/snow not yet in Theme schema (see {@link IRainConfig}).
 */
interface ISnowConfig {
    intensity: number;
    density: number;
    /** Flake size multiplier. */
    flakeSize: number;
    /** Fall direction as [azimuth, polar] degrees. */
    direction: [number, number];
    color: string;
    opacity: number;
}

/**
 * GUI state mirrors of {@link IRainConfig} / {@link ISnowConfig} with the
 * direction split into two sliders.
 */
interface IRainState extends Omit<IRainConfig, "direction"> {
    azimuth: number;
    polar: number;
}
interface ISnowState extends Omit<ISnowConfig, "direction"> {
    azimuth: number;
    polar: number;
}

/**
 * Build the inline theme: flat overcast daylight (atmosphere off, explicit
 * lights so the scene does not render black) plus the precipitation sections
 * selected by the URL parameters.
 */
function buildTheme(): Theme {
    const theme = {
        extends: "resources/tilezen_base_globe.json",
        lights: [
            {
                type: "ambient",
                name: "overcast-ambient",
                color: "#c8ccd0",
                intensity: 1.4
            },
            {
                type: "directional",
                name: "overcast-sun",
                color: "#ffffff",
                intensity: 1.5,
                direction: { x: -0.4, y: -1, z: -0.6 }
            }
        ],
        clearColor: "#9aa4ad",
        clearAlpha: 1,
        rain: START_RAIN
            ? {
                  intensity: 1,
                  density: 0.5,
                  direction: [0, 90],
                  color: "#ffffff",
                  opacity: 0.5
              }
            : null,
        snow: START_SNOW
            ? {
                  intensity: 1,
                  density: 0.85,
                  flakeSize: 1.0
              }
            : null
    };
    // TODO(engine): rain/snow not yet in Theme schema; the assertion is
    // removed once the public interface gains the two sections.
    return theme as unknown as Theme;
}

/**
 * Wire the rain/snow control folders; every change re-patches the theme and
 * requests a redraw.
 */
function setupWeatherGui(mapView: MapView): void {
    const rainState: IRainState = {
        intensity: 1,
        density: 0.5,
        azimuth: 0,
        polar: 90,
        color: "#ffffff",
        opacity: 0.5,
        centerThinning: 0
    };
    const snowState: ISnowState = {
        intensity: 1,
        density: 0.85,
        flakeSize: 1.0,
        azimuth: 0,
        polar: 90,
        color: "#ffffff",
        opacity: 1
    };

    /** Patch one precipitation section (`null` disables it) and redraw. */
    const applyPatch = (patch: object): void => {
        // TODO(engine): rain/snow not yet in Theme schema (see buildTheme).
        mapView.patchTheme(patch as unknown as Theme);
        mapView.update();
    };

    const applyRain = (): void => {
        applyPatch({
            rain: {
                intensity: rainState.intensity,
                density: rainState.density,
                direction: [rainState.azimuth, rainState.polar],
                color: rainState.color,
                opacity: rainState.opacity,
                centerThinning: rainState.centerThinning
            }
        });
    };

    const applySnow = (): void => {
        applyPatch({
            snow: {
                intensity: snowState.intensity,
                density: snowState.density,
                flakeSize: snowState.flakeSize,
                direction: [snowState.azimuth, snowState.polar],
                color: snowState.color,
                opacity: snowState.opacity
            }
        });
    };

    const gui = createExampleGui();
    applyPanelStyle(gui.domElement);

    // `enabled` checkboxes toggle by patching `null` (off) or re-applying the
    // full config (on); the numeric slider values are kept either way.
    const rainEnabled = { enabled: START_RAIN };
    const rain = gui.addFolder("Rain");
    rain.add(rainEnabled, "enabled").onChange(value => {
        if (value) {
            applyRain();
        } else {
            applyPatch({ rain: null });
        }
    });
    rain.add(rainState, "intensity", 0, 2, 0.05).onChange(applyRain);
    rain.add(rainState, "density", 0, 1, 0.01).onChange(applyRain);
    rain.add(rainState, "azimuth", 0, 360, 1).name("dir azimuth").onChange(applyRain);
    rain.add(rainState, "polar", 0, 89, 1).name("dir polar").onChange(applyRain);
    rain.addColor(rainState, "color").onChange(applyRain);
    rain.add(rainState, "opacity", 0, 1, 0.01).onChange(applyRain);
    rain.add(rainState, "centerThinning", 0, 1, 0.01).name("center thinning").onChange(applyRain);
    rain.open();

    const snowEnabled = { enabled: START_SNOW };
    const snow = gui.addFolder("Snow");
    snow.add(snowEnabled, "enabled").onChange(value => {
        if (value) {
            applySnow();
        } else {
            applyPatch({ snow: null });
        }
    });
    snow.add(snowState, "intensity", 0, 2, 0.05).onChange(applySnow);
    snow.add(snowState, "density", 0, 1, 0.01).onChange(applySnow);
    snow.add(snowState, "flakeSize", 0, 2, 0.05).name("flake size").onChange(applySnow);
    snow.add(snowState, "azimuth", 0, 360, 1).name("dir azimuth").onChange(applySnow);
    snow.add(snowState, "polar", 0, 89, 1).name("dir polar").onChange(applySnow);
    snow.addColor(snowState, "color").onChange(applySnow);
    snow.add(snowState, "opacity", 0, 1, 0.01).onChange(applySnow);
}

/**
 * Example entry: create the map with the precipitation theme, add terrain and
 * the rain/snow control panel.
 */
async function main(): Promise<void> {
    const canvas = document.getElementById("mapCanvas") as HTMLCanvasElement;
    const { mapView } = await createExampleMap(canvas, {
        themeObject: buildTheme(),
        lookAt: {
            target: { ...CENTER, alt: 300 },
            zoomLevel: 15,
            tilt: 50,
            heading: 1.2
        }
    });
    logExampleInfo("fx-weather", mapView);

    const terrain = demoTerrain();
    mapView.setElevationSource(terrain);
    terrain.addWebTileDataSource(new ArcGISTileProvider({ minDataLevel: 0, maxDataLevel: 18 }));

    // patchTheme throws until the theme finished loading; getTheme() resolves
    // exactly then and is race-free even if the load already completed.
    await mapView.getTheme();
    setupWeatherGui(mapView);
}

void main();
