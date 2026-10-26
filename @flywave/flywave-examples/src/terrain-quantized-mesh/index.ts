/* Copyright (C) 2025 flywave.gl contributors */

import {
    type ILogger,
    type MapView,
    ArcGISTileProvider,
    CesiumWorldTerrainSource,
    LoggerManager
} from "@flywave/flywave.gl";

import {
    applyPanelStyle,
    checkIonToken,
    createExampleGui,
    createExampleMap,
    logExampleInfo
} from "../common";

const logger: ILogger = LoggerManager.instance.create("flywave-examples/terrain-quantized-mesh");

/**
 * Initial camera pose: the Colorado Front Range near Denver, the classic
 * Cesium World Terrain showcase area (same viewpoint as the legacy example).
 */
const LOOK_AT = {
    target: { lat: 39.70916427453653, lng: -105.21065191908919, alt: 2270.6937844809145 },
    tilt: 56.60060867291795,
    heading: -125.79565303507096
};

/** Cesium Ion asset id of the world terrain aggregation. */
const CESIUM_WORLD_TERRAIN_ASSET_ID = 1;

/**
 * Show the bilingual "token missing" card and abort before any map setup.
 *
 * The card explains how to provide the token, mirroring the chain that
 * {@link checkIonToken} consults: the `CESIUM_ION_TOKEN` environment variable
 * (baked in at build time by the examples webpack config) or the
 * `window.CESIUM_ION_TOKEN` runtime global.
 */
function showTokenCard(): void {
    const card = document.createElement("div");
    card.style.cssText =
        "position:absolute;left:50%;top:50%;transform:translate(-50%,-50%);" +
        "max-width:460px;padding:20px 24px;color:#eee;font:13px/1.7 sans-serif;" +
        "white-space:pre-line";
    applyPanelStyle(card, { background: "rgba(60, 32, 20, 0.92)" });
    card.textContent =
        "Cesium Ion access token required\n\n" +
        "This example streams Cesium World Terrain (quantized-mesh) from Cesium Ion.\n" +
        "1. Get a token at https://ion.cesium.com/tokens\n" +
        "2. Set process.env.CESIUM_ION_TOKEN before the build, or\n" +
        "   window.CESIUM_ION_TOKEN at runtime, then reload.";
    document.body.appendChild(card);
}

/**
 * Wire Cesium World Terrain as the elevation source and drape satellite
 * imagery on top of it.
 *
 * @param mapView - The ready map view.
 * @param accessToken - Cesium Ion access token (pre-checked by the caller).
 * @returns The connected Cesium World Terrain source.
 */
async function connectTerrain(
    mapView: MapView,
    accessToken: string
): Promise<CesiumWorldTerrainSource> {
    const terrain = new CesiumWorldTerrainSource({
        accessToken,
        assetId: CESIUM_WORLD_TERRAIN_ASSET_ID
    });
    await mapView.setElevationSource(terrain);
    // Satellite imagery provider baked into the terrain source's material
    // pipeline, so every terrain mesh is textured as it streams in.
    terrain.addWebTileDataSource(new ArcGISTileProvider({ minDataLevel: 0, maxDataLevel: 18 }));
    return terrain;
}

/**
 * Build a minimal info panel describing the streaming terrain (teaching
 * context only; the legacy example's frustum-culling debug GUI belongs to
 * internal tooling and is intentionally not reproduced here).
 *
 * @param terrain - The connected Cesium World Terrain source.
 */
function buildInfoPanel(terrain: CesiumWorldTerrainSource): void {
    const gui = createExampleGui();
    const folder = gui.addFolder("Cesium World Terrain");
    // dat.GUI 0.7 has no controller.disable(); read-only display via listen().
    folder.add({ assetId: terrain.assetId }, "assetId").name("Ion asset id").listen();
    folder
        .add({ format: "quantized-mesh (atmosphere + clouds on)" }, "format")
        .name("Format")
        .listen();
    folder.open();
}

/**
 * Example entry point: token gate -> map -> terrain -> info panel.
 */
async function main(): Promise<void> {
    // Front door: never construct the map without a token - Ion requests
    // would all fail with 401 and the user would only see a blank globe.
    const accessToken = checkIonToken();
    if (accessToken === undefined) {
        showTokenCard();
        return;
    }

    const canvas = document.getElementById("mapCanvas");
    if (!(canvas instanceof HTMLCanvasElement)) {
        throw new Error("Map canvas element not found (need <canvas id='mapCanvas'>)");
    }

    const handle = await createExampleMap(canvas, {
        projection: "globe",
        lookAt: LOOK_AT,
        themeObject: { atmosphere: { clouds: true, enabled: true } },
        onReady: view => logExampleInfo("terrain-quantized-mesh", view)
    });

    const terrain = await connectTerrain(handle.mapView, accessToken);
    buildInfoPanel(terrain);

    // Volumetric clouds drift continuously, keep the on-demand loop awake.
    handle.mapView.beginAnimation();
}

void main().catch((error: unknown) => {
    logger.error("Failed to initialize terrain-quantized-mesh example:", String(error));
});
