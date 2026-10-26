/* Copyright (C) 2025 flywave.gl contributors */

import { MapControls, MapControlsUI, TileRenderDataSource } from "@flywave/flywave.gl";

import {
    createExampleMap,
    createImageryWithFallback,
    demoImagery,
    logExampleInfo
} from "../common";

/**
 * Locally hosted 3D Gaussian splatting tileset, resolved through the MapView
 * uriResolver relative to the deployed `resources/` folder, so the example
 * runs fully offline.
 */
const SPLAT_TILESET_URL = "3dtile/gaussianSplatting/tileset.json";

/**
 * Start the example: create the map through the shared factory, add the
 * splatting tileset and frame it by its geographic extent, then add a
 * satellite imagery base with automatic degradation to a debug grid.
 *
 * The splatting pipeline runs inside {@link TileRenderDataSource}, the same
 * 3D Tiles entry point used for b3dm/pnts datasets.
 */
async function startExample(): Promise<void> {
    const canvas = document.getElementById("mapCanvas") as HTMLCanvasElement;
    if (!canvas) {
        throw new Error("Canvas element #mapCanvas not found");
    }

    // `controls: false` because the projection switch needs a custom
    // MapControlsUI wiring below.
    const { mapView } = await createExampleMap(canvas, {
        projection: "globe",
        controls: false,
        lookAt: {
            target: { lat: 40.00269243085496, lng: -75.29281581060715, alt: 10 },
            zoomLevel: 19
        }
    });
    logExampleInfo("tiles3d-gaussian-splatting", mapView);

    const controls = new MapControls(mapView);
    const ui = new MapControlsUI(controls, { zoomLevel: "input", projectionSwitch: true });
    canvas.parentElement!.appendChild(ui.domElement);

    const splatSource = new TileRenderDataSource({ url: SPLAT_TILESET_URL });
    await mapView.addDataSource(splatSource);

    // Once the tileset root is parsed, its geographic extent is known and
    // `lookAt({ bounds })` picks the camera pose that frames the data.
    const extent = await splatSource.getGeoExtent();
    if (extent !== undefined) {
        mapView.lookAt({ bounds: extent });
    }

    // Satellite imagery under the splats; falls back to a debug grid offline.
    await createImageryWithFallback(mapView, demoImagery({ provider: "arcgis" }));
}

// ==================== Entry point ====================

void startExample();
