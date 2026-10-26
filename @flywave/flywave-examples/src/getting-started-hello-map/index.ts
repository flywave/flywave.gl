/* Copyright (C) 2025 flywave.gl contributors */

import {
    applyPanelStyle,
    attachTerrainImagery,
    createExampleMap,
    demoTerrain,
    logExampleInfo
} from "../common";

/**
 * Add a one-line footnote explaining the WebGPU -> WebGL fallback: appending
 * `?renderer=webgl` to the page URL forces the WebGL2 backend of the same
 * WebGPURenderer (useful on machines without WebGPU).
 */
function addRendererFootnote(): void {
    const note = document.createElement("div");
    note.textContent =
        "Renders with WebGPU by default; add ?renderer=webgl to the URL to force the WebGL2 fallback.";
    Object.assign(note.style, {
        position: "absolute",
        left: "12px",
        bottom: "12px",
        padding: "6px 10px",
        font: "12px/1.4 sans-serif",
        color: "#e8eaed"
    } as CSSStyleDeclaration);
    applyPanelStyle(note);
    document.body.appendChild(note);
}

/**
 * Hello Map: the smallest useful flywave.gl example.
 *
 * Demonstrates the canonical three-step setup shared by every example:
 * 1. {@link createExampleMap} wires MapView + MapControls + the UI overlay,
 * 2. attach an elevation (terrain) source,
 * 3. attach an imagery source, then move the camera with a single flyTo.
 */
async function main(): Promise<void> {
    const canvas = document.getElementById("mapCanvas") as HTMLCanvasElement;

    // Step 1: map + controls from the shared factory. The theme below and the
    // DEM tiles in step 2 are served from the examples' local `resources/`
    // folder through the MapView asset uri resolver.
    const { mapView } = await createExampleMap(canvas, {
        theme: "resources/tilezen_base_globe.json",
        controlsUi: "compact",
        lookAt: { target: { lat: 36.4862, lng: 118.1727 }, zoomLevel: 12, tilt: 40 }
    });

    // Step 2: DEM terrain from the local `resources/dem_terrain` dataset,
    // fed by ArcGIS elevation rasters outside the local tile coverage.
    const terrain = demoTerrain();
    mapView.setElevationSource(terrain);
    // Step 2b: drape Esri World Imagery INTO the terrain tiles. Never add
    // imagery as an independent DataSource on top of an elevation source:
    // the flat layer is coplanar with the draped surface and depth-fights.
    attachTerrainImagery(terrain);

    // Rendering is on-demand: request a repaint after changing visual state.
    mapView.update();

    // A single camera flight to show motion: approach the local DEM area
    // from an oblique angle.
    void mapView.flyTo({
        target: { latitude: 36.48, longitude: 118.18 },
        zoomLevel: 14,
        tilt: 55,
        heading: 30,
        duration: 6,
        curve: "bow"
    });

    addRendererFootnote();
    logExampleInfo("getting-started-hello-map", mapView);
}

main().catch(err => console.error("getting-started-hello-map failed:", err));
