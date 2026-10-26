/* Copyright (C) 2025 flywave.gl contributors */

import { CesiumIonDataSource, MapView, MapViewEventNames } from "@flywave/flywave.gl";

import {
    applyPanelStyle,
    checkIonToken,
    createExampleGui,
    createExampleMap,
    logExampleInfo
} from "../common";

/**
 * Cesium Ion asset id of the Manhattan photogrammetry tileset used across the
 * 3D Tiles examples.
 */
const ION_ASSET_ID = 75343;

/** Camera pose used until the dataset extent has been resolved. */
const INITIAL_POSE = {
    target: { lat: 40.6959, lng: -74.0162 },
    zoomLevel: 18,
    tilt: 70,
    heading: 35.1
} as const;

/**
 * Show a bilingual setup card when no Cesium Ion token is available.
 *
 * The card explains both supported configuration paths (build-time
 * `CESIUM_ION_TOKEN` env var or runtime `window.CESIUM_ION_TOKEN`) and offers
 * an inline input so the example can start without editing code.
 *
 * @param onStart - Called with the token once the user submits one.
 */
function showTokenGuideCard(onStart: (token: string) => void): void {
    const card = document.createElement("div");
    Object.assign(card.style, {
        position: "absolute",
        left: "50%",
        top: "50%",
        transform: "translate(-50%, -50%)",
        maxWidth: "480px",
        padding: "20px 24px",
        color: "#ddd",
        font: "13px/1.6 sans-serif",
        textAlign: "left"
    } as CSSStyleDeclaration);
    applyPanelStyle(card, { zIndex: "2000" });
    card.innerHTML =
        "<h3 style='margin:0 0 8px 0'>Cesium Ion token required</h3>" +
        "<p>This example streams a photogrammetry tileset from Cesium Ion (asset " +
        ION_ASSET_ID +
        "). Configure an access token either via the <code>CESIUM_ION_TOKEN</code> " +
        "environment variable at build time, or at runtime via " +
        "<code>window.CESIUM_ION_TOKEN</code>.</p>" +
        "<p>This example needs Cesium Ion data (asset " +
        ION_ASSET_ID +
        "). Set the <code>CESIUM_ION_TOKEN</code> environment variable at build time, " +
        "or set <code>window.CESIUM_ION_TOKEN</code> at runtime, then reload.</p>";
    const row = document.createElement("div");
    row.style.cssText = "display:flex;gap:8px;margin-top:12px;";
    const input = document.createElement("input");
    input.placeholder = "Paste token";
    input.style.cssText =
        "flex:1;padding:6px 8px;border-radius:4px;border:1px solid #555;background:#111;color:#eee;";
    const button = document.createElement("button");
    button.textContent = "Load";
    button.style.cssText =
        "padding:6px 14px;border:none;border-radius:4px;background:#2C7BE5;color:#fff;cursor:pointer;";
    button.onclick = () => {
        const token = input.value.trim();
        if (token.length === 0) {
            return;
        }
        // Feed the shared token chain (`checkIonToken`) so a reload keeps working.
        (window as { CESIUM_ION_TOKEN?: string }).CESIUM_ION_TOKEN = token;
        card.remove();
        onStart(token);
    };
    row.appendChild(input);
    row.appendChild(button);
    card.appendChild(row);
    document.body.appendChild(card);
}

/**
 * Overlay HUD reporting render throughput and the current visible-tile load.
 *
 * flywave.gl renders on demand, so "renders/s" legitimately reads 0 while the
 * camera is static; it jumps as soon as the camera moves or tiles stream in.
 * The tile counters read {@link MapView.forEachVisibleTile}, which reflects
 * the latest cull pass (lazy: it changes only after a frame has run).
 *
 * @param mapView - The ready map view to observe.
 * @returns The teardown function that stops the HUD updates.
 */
function createPerformanceHud(mapView: MapView): () => void {
    const panel = document.createElement("div");
    panel.style.cssText =
        "position:absolute;left:10px;bottom:10px;padding:8px 12px;color:#0f0;" +
        "font:12px/1.6 monospace;white-space:pre;";
    applyPanelStyle(panel);
    document.body.appendChild(panel);

    let renderCount = 0;
    mapView.addEventListener(MapViewEventNames.AfterRender, () => {
        renderCount++;
    });

    const refresh = (): void => {
        let visibleTiles = 0;
        let deepestLevel = 0;
        mapView.forEachVisibleTile(tile => {
            visibleTiles++;
            deepestLevel = Math.max(deepestLevel, tile.tileKey.level);
        });
        panel.textContent =
            `renders/s: ${renderCount}\n` +
            `visible tiles: ${visibleTiles}\n` +
            `deepest tile level: ${deepestLevel}`;
        renderCount = 0;
    };
    const timer = window.setInterval(refresh, 1000);
    return () => window.clearInterval(timer);
}

/**
 * Wire the LOD tuning panel.
 *
 * `maxVisibleDataSourceTiles` and `quadTreeSearchDistanceUp` are
 * {@link MapView} constructor options; the runtime path goes through
 * {@link MapView.visibleTileSet}, whose options object is read live by the
 * next cull pass. Lower caps / shallower search trade detail for frame rate.
 *
 * @param mapView - The ready map view to tune.
 */
function setupLodGui(mapView: MapView): void {
    const gui = createExampleGui();
    const tileSet = mapView.visibleTileSet;
    const state = {
        maxVisibleTiles: tileSet.getNumberOfVisibleTiles(),
        quadTreeSearchUp: tileSet.options.quadTreeSearchDistanceUp
    };
    const folder = gui.addFolder("LOD tuning");
    folder
        .add(state, "maxVisibleTiles", 20, 1000, 10)
        .name("max visible tiles")
        .onChange(value => {
            tileSet.setNumberOfVisibleTiles(value);
            mapView.update();
        });
    folder
        .add(state, "quadTreeSearchUp", 0, 6, 1)
        .name("search distance up")
        .onChange(value => {
            tileSet.options.quadTreeSearchDistanceUp = value;
            mapView.update();
        });
    folder.open();
}

/**
 * Load the Ion tileset and frame it by its geographic extent once the root
 * bounding volume has been resolved.
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
        lookAt: INITIAL_POSE
    });
    logExampleInfo("tiles3d-basic", mapView);

    const dataSource = new CesiumIonDataSource({
        accessToken: token,
        assetId: ION_ASSET_ID
    });
    try {
        await mapView.addDataSource(dataSource);
    } catch (err) {
        // Invalid token or network failure: surface it instead of a white map.
        throw new Error(`Failed to load Cesium Ion asset ${ION_ASSET_ID}: ${String(err)}`);
    }

    // Move the camera to the dataset once its extent is known; keep the
    // default pose when the extent cannot be resolved.
    const extent = await dataSource.getGeoExtent();
    if (extent !== undefined) {
        mapView.lookAt({ bounds: extent });
    }

    createPerformanceHud(mapView);
    setupLodGui(mapView);
}

// ==================== Entry point ====================

const token = checkIonToken();
if (token !== undefined) {
    void startExample(token);
} else {
    showTokenGuideCard(pastedToken => void startExample(pastedToken));
}
