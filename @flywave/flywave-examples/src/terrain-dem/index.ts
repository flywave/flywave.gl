/* Copyright (C) 2025 flywave.gl contributors */

import {
    type ILogger,
    type MapView,
    type Theme,
    DEMTerrainSource,
    LoggerManager
} from "@flywave/flywave.gl";

import {
    applyPanelStyle,
    attachTerrainImagery,
    createExampleGui,
    createExampleMap,
    demoTerrain,
    logExampleInfo
} from "../common";

const logger: ILogger = LoggerManager.instance.create("flywave-examples/terrain-dem");

/**
 * Initial camera pose: a hilly area in Shandong Province covered by the local
 * `resources/dem_terrain` DEM tiles (same viewpoint as the legacy example).
 */
const LOOK_AT = {
    target: { lat: 36.48619699228674, lng: 118.17270928364879 },
    zoomLevel: 15,
    tilt: 71.43670140369471,
    heading: -89.40263147840845
};

/** Theme object: tilezen base globe plus low-quality volumetric clouds. */
const THEME: Theme = {
    extends: "resources/tilezen_base_globe.json",
    atmosphere: {
        clouds: { quality: "low" },
        enabled: true
    }
};

/**
 * Culling-height presets offered by the GUI (meters).
 *
 * NOTE: `DemTerrainSourceOptions` has no vertical-exaggeration option (there
 * is no such field in the engine API). The closest public knob is
 * `DataSource.maxGeometryHeight` - a CONSERVATIVE METADATA HINT consumed by
 * frustum culling and the shadow frustum before per-tile elevation ranges are
 * known. It never scales the terrain mesh; it only widens the bounds the
 * engine must keep visible. Overshooting it wastes draw distance, reporting it
 * too small can cull mountains that are actually on screen.
 */
const GEOMETRY_HEIGHT_PRESETS: Array<{ label: string; value: number }> = [
    { label: "Everest (8848 m)", value: 8848 },
    { label: "Alps (4808 m)", value: 4808 },
    { label: "Local hills (2000 m)", value: 2000 }
];

/**
 * Wire the offline DEM terrain plus a draped imagery layer onto the view.
 *
 * - Elevation: {@link demoTerrain} serves the bundled `dem_terrain/source.json`
 *   (offline, mapbox terrain-RGB encoded) through {@link DEMTerrainSource}.
 * - Imagery: {@link attachTerrainImagery} feeds Esri World Imagery INTO the
 *   terrain source, so terrain tiles carry it as their own texture. NEVER
 *   add imagery as an independent DataSource while an elevation source is
 *   active — the flat layer is coplanar with the draped surface and
 *   depth-fights badly on the globe.
 *
 * @param mapView - The ready map view.
 * @returns The connected DEM terrain source (consumed by the GUI panel).
 */
async function connectTerrain(mapView: MapView): Promise<DEMTerrainSource> {
    const terrain = demoTerrain();
    await mapView.setElevationSource(terrain);
    // Drape satellite imagery INTO the terrain tiles (see the doc above).
    attachTerrainImagery(terrain);
    return terrain;
}

/**
 * Build the control panel: preset buttons for the culling-height hint and a
 * short explanation of what the value does (and does not) do.
 *
 * @param terrain - The DEM terrain source to retune.
 * @param requestUpdate - Callback that triggers a map redraw (on-demand loop).
 */
function buildGui(terrain: DEMTerrainSource, requestUpdate: () => void): void {
    const gui = createExampleGui();
    const folder = gui.addFolder("Culling height hint");
    GEOMETRY_HEIGHT_PRESETS.forEach(preset => {
        folder
            .add(
                {
                    apply: () => {
                        terrain.maxGeometryHeight = preset.value;
                        requestUpdate();
                        logger.info(`maxGeometryHeight set to ${preset.value} m`);
                    }
                },
                "apply"
            )
            .name(preset.label);
    });
    folder.open();

    // Plain-language note rendered as an overlay card styled like the GUI
    // panel (user-visible copy may stay bilingual per repo conventions).
    const note = document.createElement("div");
    note.style.cssText =
        "position:absolute;left:16px;bottom:16px;max-width:340px;padding:10px 14px;" +
        "color:#ddd;font:12px/1.5 sans-serif;white-space:pre-line";
    applyPanelStyle(note);
    note.textContent =
        "DEM terrain: local resources/dem_terrain (offline), imagery draped on top.\n" +
        "The engine exposes no vertical-exaggeration option; the buttons adjust " +
        "maxGeometryHeight, the conservative culling/shadow height hint.\n" +
        "Local offline DEM with draped imagery; the buttons tune the culling/shadow height hint, not an exaggeration factor.";
    document.body.appendChild(note);
}

/**
 * Example entry point: map -> terrain -> imagery -> GUI.
 */
async function main(): Promise<void> {
    const canvas = document.getElementById("mapCanvas");
    if (!(canvas instanceof HTMLCanvasElement)) {
        throw new Error("Map canvas element not found (need <canvas id='mapCanvas'>)");
    }

    const handle = await createExampleMap(canvas, {
        projection: "globe",
        lookAt: LOOK_AT,
        themeObject: THEME,
        onReady: view => logExampleInfo("terrain-dem", view)
    });

    const terrain = await connectTerrain(handle.mapView);
    buildGui(terrain, () => handle.mapView.update());
}

void main().catch((error: unknown) => {
    logger.error("Failed to initialize terrain-dem example:", String(error));
});
