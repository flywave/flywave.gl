/* Copyright (C) 2025 flywave.gl contributors */

import {
    MapView,
    GeoCoordinates,
    GeoBox,
    ellipsoidProjection,
    MapControls,
    MapControlsUI,
    CesiumWorldTerrainSource,
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
 * Encode a height value to Mapbox RGB format
 * @param height - Height value in meters
 */
function encodeMapboxHeight(height: number): [number, number, number, number] {
    const vector = [6553.6, 25.6, 0.1, 10000.0];
    let v = Math.floor((height + vector[3]) / vector[2]);
    const b = v % 256;
    v = Math.floor(v / 256);
    const g = v % 256;
    v = Math.floor(v / 256);
    const r = v;
    return [r, g, b, 255];
}

/**
 * Create a wall-shaped height map with steps
 * @param width - Canvas width in pixels
 * @param height - Canvas height in pixels
 * @param wallWidthRatio - Width ratio of wall (0-1)
 * @param steps - Number of height steps
 * @param minHeight - Minimum height in meters
 * @param maxHeight - Maximum height in meters
 */
function createSteppedWallMap(
    width: number = 256,
    height: number = 512,
    wallWidthRatio: number = 0.4,
    steps: number = 3,
    minHeight: number = 200,
    maxHeight: number = 1000
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

              const [r, g, b, a] = encodeMapboxHeight(50);
                data[index] = r;
                data[index + 1] = g;
                data[index + 2] = b;
                data[index + 3] = a;
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

    const heightMap = createSteppedWallMap(256, 512, 0.4, numSteps, minHeight, maxHeight);

    const modifierId = manager.addModifier(
        "stepped-wall",
        { type: "image", image: heightMap },
        geoBox
    );
    modifierIds.push(modifierId);

    console.log("Added stepped wall modifier:", modifierId);
    console.log(`  Steps: ${numSteps}`);

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
        console.log(`  • 3 distinct height steps`);
        console.log(`  • Absolute height values (mapbox encoding)`);
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
