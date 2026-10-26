/* Copyright (C) 2025 flywave.gl contributors */

import {
    type FlatTheme,
    ArcGISTileProvider,
    CesiumIonDataSource,
    MapView
} from "@flywave/flywave.gl";

import {
    applyPanelStyle,
    checkIonToken,
    createExampleGui,
    createExampleMap,
    demoTerrain,
    logExampleInfo
} from "../common";

/** Cesium Ion asset id of the Manhattan photogrammetry tileset. */
const ION_ASSET_ID = 75343;

/** Camera pose over lower Manhattan, where asset 75343 sits. */
const INITIAL_POSE = {
    target: { lat: 40.6959, lng: -74.0162 },
    zoomLevel: 18,
    tilt: 70,
    heading: 35.1
} as const;

/**
 * Scene theme: dawn sun with volumetric clouds and shadow casting, which
 * makes the terrain-vs-mesh compositing easy to judge.
 */
const SCENE_THEME: FlatTheme = {
    atmosphere: {
        enabled: true,
        clouds: { quality: "high" },
        sunCastShadow: true,
        sunTime: new Date().setHours(4, 30)
    }
};

/**
 * Attach the demo DEM terrain as elevation source and drape ArcGIS imagery
 * over it, so the surface the tileset settles on is textured.
 *
 * @param mapView - View to attach the elevation source to.
 */
function attachTerrain(mapView: MapView): void {
    const terrain = demoTerrain();
    mapView.setElevationSource(terrain);
    terrain.addWebTileDataSource(new ArcGISTileProvider({ minDataLevel: 0, maxDataLevel: 18 }));
}

/**
 * Create the Ion photogrammetry data source for the terrain overlay.
 *
 * The tileset is opted into the translucentDepth post effect by the caller
 * via `setTheme`: with `translucentDepth.enabled` the tilted mesh is routed
 * through a post-process translucent layer that also contributes depth, so
 * terrain and mesh composite without the mesh being either fully punched
 * through or floating above the surface. Toggling it makes the difference
 * visible.
 *
 * @param token - Cesium Ion access token.
 */
function createDataSource(token: string): CesiumIonDataSource {
    return new CesiumIonDataSource({
        accessToken: token,
        assetId: ION_ASSET_ID,
        castShadow: true,
        receiveShadow: true
    });
}

/**
 * Compact bilingual hint shown when no Ion token is configured.
 */
function showTokenHint(): void {
    const hint = document.createElement("div");
    Object.assign(hint.style, {
        position: "absolute",
        left: "16px",
        top: "16px",
        maxWidth: "420px",
        padding: "12px 16px",
        color: "#ddd",
        font: "13px/1.6 sans-serif"
    } as CSSStyleDeclaration);
    applyPanelStyle(hint, { zIndex: "2000" });
    hint.innerHTML =
        "This example needs a Cesium Ion token: set <code>CESIUM_ION_TOKEN</code> at build " +
        "time or <code>window.CESIUM_ION_TOKEN</code> at runtime, then reload.<br/>";
    document.body.appendChild(hint);
}

/**
 * Wire the panel toggling the translucentDepth post effect on the tileset.
 * The data-source `setTheme` path re-registers its tiles in the render
 * manager's translucent layers, then `mapView.update()` forces a redraw.
 *
 * @param mapView - View driving the render loop.
 * @param dataSource - Tileset source whose post effect is toggled.
 */
function setupEffectGui(mapView: MapView, dataSource: CesiumIonDataSource): void {
    const gui = createExampleGui();
    const state = { translucentDepth: true };
    gui.add(state, "translucentDepth")
        .name("translucentDepth")
        .onChange(enabled => {
            void dataSource.setTheme({
                postEffects: { translucentDepth: { enabled } }
            });
            mapView.update();
        });
}

/**
 * Start the example: terrain first (so the elevation source exists before
 * the tileset settles), then the photogrammetry tileset on top.
 *
 * @param token - Cesium Ion access token.
 */
async function startExample(token: string): Promise<void> {
    const canvas = document.getElementById("mapCanvas") as HTMLCanvasElement;
    if (!canvas) {
        throw new Error("Canvas element #mapCanvas not found");
    }

    const { mapView } = await createExampleMap(canvas, {
        projection: "globe",
        lookAt: INITIAL_POSE,
        themeObject: SCENE_THEME
    });
    logExampleInfo("tiles3d-terrain-overlay", mapView);

    attachTerrain(mapView);

    const dataSource = createDataSource(token);
    void dataSource.setTheme({ postEffects: { translucentDepth: { enabled: true } } });
    await mapView.addDataSource(dataSource);

    setupEffectGui(mapView, dataSource);
}

// ==================== Entry point ====================

const token = checkIonToken();
if (token !== undefined) {
    void startExample(token);
} else {
    showTokenHint();
}
