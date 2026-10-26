/* Copyright (C) 2025 flywave.gl contributors */

import { CesiumIonDataSource } from "@flywave/flywave.gl";
import { applyPanelStyle, checkIonToken, createExampleMap, logExampleInfo } from "../common";

/**
 * Bilingual guidance card shown when no Cesium Ion token is configured.
 * The example intentionally does not initialize the map in that case: the
 * asset cannot load without a token.
 */
function showIonTokenCard(): void {
    const card = document.createElement("div");
    card.innerHTML = [
        "<b>3D Tiles from Cesium Ion requires an access token.</b>",
        "Set one before this page loads, then reload:",
        "<ol>",
        '<li><code>window.CESIUM_ION_TOKEN = "&lt;your token&gt;";</code> in the browser console, or</li>',
        "<li>build the examples with the <code>CESIUM_ION_TOKEN</code> environment variable.</li>",
        "</ol>",
        'Get a free token at <a href="https://ion.cesium.com/tokens" target="_blank">ion.cesium.com/tokens</a>.',
        "<hr>",
        "<b>This example requires a Cesium Ion access token.</b>",
        "Configure a token before the page loads, then refresh:",
        "<ol>",
        '<li>Run <code>window.CESIUM_ION_TOKEN = \"<your token>\";</code> in the browser console, or</li>',
        "<li>Inject it at build time via the CESIUM_ION_TOKEN environment variable.</li>",
        "</ol>",
        'Get a free token: <a href="https://ion.cesium.com/tokens" target="_blank">ion.cesium.com/tokens</a>。'
    ].join("\n");
    card.style.cssText =
        "position:absolute;left:50%;top:50%;transform:translate(-50%, -50%);" +
        "max-width:560px;padding:20px 24px;font:13px/1.6 sans-serif;color:#e8eaed;" +
        "text-align:left;";
    applyPanelStyle(card, { zIndex: "200" });
    document.body.appendChild(card);
}

/**
 * 3D Tiles getting-started example: load a photogrammetry asset from Cesium
 * Ion on top of a globe view. Kept deliberately small - the interesting
 * wiring all lives in `CesiumIonDataSource`, which resolves the asset
 * endpoint from the access token on connect.
 */
async function main(): Promise<void> {
    const canvas = document.getElementById("mapCanvas") as HTMLCanvasElement;

    // Pre-flight check: degrade to a guidance card instead of failing at
    // data source connect time when no token is configured.
    const accessToken = checkIonToken();
    if (accessToken === undefined) {
        showIonTokenCard();
        return;
    }

    const { mapView } = await createExampleMap(canvas, {
        theme: "resources/tilezen_base_globe.json",
        lookAt: {
            target: { lat: 40.6959, lng: -74.0162 },
            zoomLevel: 17,
            tilt: 70,
            heading: 35.1
        }
    });
    logExampleInfo("getting-started-3dtiles", mapView);

    // Statue of Liberty photogrammetry dataset (Cesium Ion asset 75343).
    await mapView.addDataSource(
        new CesiumIonDataSource({
            accessToken,
            assetId: 75343
        })
    );
    mapView.update();
}

main().catch(err => console.error("getting-started-3dtiles failed:", err));
