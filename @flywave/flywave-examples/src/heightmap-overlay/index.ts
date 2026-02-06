/* Copyright (C) 2025 flywave.gl contributors */

import {
    MapView,
    GeoCoordinates,
    GeoBox,
    ellipsoidProjection,
    MapControls,
    MapControlsUI,
    CesiumWorldTerrainSource,
    HeightMapBlendMode,
    ArcGISTileProvider
} from "@flywave/flywave.gl";
import { CESIUM_ION_TOKEN } from "../token-config";

// Configuration constants
const CONFIG = {
    INITIAL_COORDINATES: new GeoCoordinates(36.4, 118.1, 1000),
    ZOOM_LEVEL: 17
};

/**
 * Get the canvas element by ID
 */
const getMapCanvas = (id: string): HTMLCanvasElement => {
    const canvas = document.getElementById(id) as HTMLCanvasElement;
    if (!canvas) {
        throw new Error(
            `Map canvas element not found, please ensure there is a canvas element with id '${id}' in HTML`
        );
    }
    return canvas;
};

/**
 * Initialize the map view with controls
 */
const initializeMapView = (canvas: HTMLCanvasElement): MapView => {
    const map = new MapView({
        target: CONFIG.INITIAL_COORDINATES,
        zoomLevel: CONFIG.ZOOM_LEVEL,
        projection: ellipsoidProjection,
        canvas: canvas,
        theme: {
            extends: "resources/tilezen_base.json"
        }
    });

    const controls = new MapControls(map);
    const ui = new MapControlsUI(controls, { zoomLevel: "input" });
    canvas.parentElement!.appendChild(ui.domElement);

    return map;
};

/**
 * Create a wall-shaped height map with steps
 * @param width - Canvas width in pixels
 * @param height - Canvas height in pixels
 * @param wallWidthRatio - Width ratio of the wall (0-1)
 * @param strength - Height intensity (0-1)
 * @param steps - Number of height steps
 */
function createSteppedWallMap(
    width: number = 256,
    height: number = 512,
    wallWidthRatio: number = 0.4,
    strength: number = 1.0,
    steps: number = 3
): ImageData {
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d")!;

    const imageData = ctx.createImageData(width, height);
    const data = imageData.data;

    const wallWidth = Math.floor(width * wallWidthRatio);
    const wallLeft = (width - wallWidth) / 2;
    const wallRight = wallLeft + wallWidth;

    for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
            const index = (y * width + x) * 4;

            if (x >= wallLeft && x <= wallRight) {
                // Calculate height steps along the Y direction
                let stepFactor = 1.0;
                if (steps > 1) {
                    const stepSize = height / steps;
                    const currentStep = Math.floor(y / stepSize);
                    // Steps range from 0.2 to 1.0 for visible height difference
                    stepFactor = 0.2 + (currentStep / (steps - 1)) * 0.8;
                }

                const intensity = Math.floor(strength * 255 * stepFactor);
                data[index] = intensity; // R
                data[index + 1] = intensity; // G
                data[index + 2] = intensity; // B
                data[index + 3] = 255; // A
            } else {
                data[index] = 0;
                data[index + 1] = 0;
                data[index + 2] = 0;
                data[index + 3] = 255;
            }
        }
    }

    return imageData;
}

/**
 * Add height map modifiers to the terrain
 */
const addHeightMapModifiers = async (demTerrain: CesiumWorldTerrainSource): Promise<string[]> => {
    const manager = demTerrain.getGroundModificationManager();
    const modifierIds: string[] = [];

    // Define wall position
    const centerLat = 36.398;
    const centerLon = 118.099;
    const wallWidthLon = 0.004;
    const wallLengthLat = 0.006; // Total span of 3 * 0.003

    const numSteps = 3;
    const minHeight = 200;
    const maxHeight = 1000;

    // Create a stepped wall structure
    const halfSpan = wallLengthLat / 2;
    const geoBox = new GeoBox(
        new GeoCoordinates(centerLat - halfSpan, centerLon - wallWidthLon / 2),
        new GeoCoordinates(centerLat + halfSpan, centerLon + wallWidthLon / 2)
    );

    const heightMap = createSteppedWallMap(256, 512, 0.4, 1.0, numSteps);

    const modifierId = manager.addModifier(
        { type: "image", image: heightMap },
        geoBox,
        HeightMapBlendMode.ADD,
        1.0,
        { min: minHeight, max: maxHeight }
    );
    modifierIds.push(modifierId);

    console.log("Added stepped wall modifier:", modifierId);
    console.log(`  Steps: ${numSteps}, Height: ${minHeight}m - ${maxHeight}m`);

    return modifierIds;
};

/**
 * Configure DEM terrain source with height map modifiers
 */
const configureDEMTerrainSource = async (mapView: MapView) => {
    const cesiumTerrain = new CesiumWorldTerrainSource({
        accessToken: CESIUM_ION_TOKEN,
        assetId: 1
    });

    const modifierIds = await addHeightMapModifiers(cesiumTerrain);

    mapView.setElevationSource(cesiumTerrain);

    cesiumTerrain.addWebTileDataSource(
        new ArcGISTileProvider({ minDataLevel: 0, maxDataLevel: 18 })
    );

    return { cesiumTerrain, modifierIds };
};

// Main execution
(async () => {
    try {
        const canvas = getMapCanvas("mapCanvas");
        const mapView = initializeMapView(canvas);
        const { cesiumTerrain, modifierIds } = await configureDEMTerrainSource(mapView);

        mapView.beginAnimation();

        console.log("\nHeightmap Overlay Example");
        console.log("========================");
        console.log(`Features:`);
        console.log(`  • Single wall structure with ${modifierIds.length} modifier(s)`);
        console.log(`  • 3 distinct height steps (200m, 600m, 1000m)`);
        console.log(`  • ADD blend mode for elevation`);
        console.log(`  • Custom wall-shaped height map`);
        console.log("\nSupported input formats:");
        console.log(`  • ImageData, HTMLImageElement, HTMLCanvasElement`);
        console.log(`  • URL to image`);
        console.log(`  • Raw data arrays (Float32Array, Uint8Array)`);
        console.log("\n");
    } catch (error) {
        console.error("Error initializing heightmap overlay example:");
        console.error(error);
    }
})();
