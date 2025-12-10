/* Copyright (C) 2025 flywave.gl contributors */

import {
    MapView,
    GeoCoordinates,
    ellipsoidProjection,
    MapControls,
    MapControlsUI,
    DEMTerrainSource,
    GeoLineString,
    ArcGISTileProvider,
    GeoLineStringCoordinates,
} from "@flywave/flywave.gl";
import { RepeatWrapping, TextureLoader } from "three";

// Configuration constants
const CONFIG = {
    TEXTURE_PATH: "coast_sand_rocks_02.webp",
    DEM_SOURCE_PATH: "dem_terrain/source.json",
    INITIAL_COORDINATES: new GeoCoordinates(36.4, 118.1, 1000),
    ZOOM_LEVEL: 17,
    MODIFICATION_LINE_COORDINATES: [
        [118.09628468881186, 36.39626289210476],
        [118.0993817293853, 36.3987612080073],
        [118.10172838108122, 36.40072229952541],
        [118.10679200291139, 36.40194817931817]
    ] as GeoLineStringCoordinates,
    LINESTRING_HEIGHT: 200,
    MIN_HEIGHT: 100,
    MAX_HEIGHT: 400
};

/**
 * Get map canvas element
 * @param id ID of HTMLCanvasElement
 * @returns HTMLCanvasElement Map canvas element
 */
const getMapCanvas = (id: string): HTMLCanvasElement => {
    const canvas = document.getElementById(id) as HTMLCanvasElement;
    if (!canvas) {
        throw new Error(`Map canvas element not found, please ensure there is a canvas element with id '${id}' in HTML`);
    }
    return canvas;
};

/**
 * Initialize map view configuration
 * @param canvas Map canvas element
 * @returns Configured MapView instance
 */
const initializeMapView = (canvas: HTMLCanvasElement): MapView => {
    const map = new MapView({
        target: CONFIG.INITIAL_COORDINATES, // Initial target position
        zoomLevel: CONFIG.ZOOM_LEVEL,      // Initial zoom level
        projection: ellipsoidProjection,   // Use ellipsoidal projection
        canvas: canvas,                    // Specify render canvas
        theme: {
            extends: "resources/tilezen_base.json" // Base theme configuration
        }
    });

    // Instantiate default map controls
    const controls = new MapControls(map);

    // Add UI controls
    const ui = new MapControlsUI(controls, { zoomLevel: "input" });
    canvas.parentElement!.appendChild(ui.domElement);
    
    return map;
};

/**
 * Define terrain modification area
 * @returns GeoLineString Terrain modification area
 */
const defineModificationArea = (): GeoLineString => {
    return new GeoLineString(
        CONFIG.MODIFICATION_LINE_COORDINATES,
        CONFIG.LINESTRING_HEIGHT
    );
};

/**
 * Add terrain modification
 * @param heightMapSource DEM terrain data source
 * @param lineString Terrain modification area
 */
const addTerrainModification = (heightMapSource: DEMTerrainSource, lineString: GeoLineString): void => {
    heightMapSource.getGroundModificationManager().addModification({
        "heightOperation": "replace",     // Height operation type
        "vertexSource": "fixed"           // Vertex source type
    }, lineString, CONFIG.MIN_HEIGHT, CONFIG.MAX_HEIGHT); // Minimum and maximum height
};

/**
 * Add ground texture overlay
 * @param heightMapSource DEM terrain data source
 * @param lineString Terrain modification area
 */
const addGroundOverlay = (heightMapSource: DEMTerrainSource, lineString: GeoLineString): void => {
    const textureLoader = new TextureLoader();

    textureLoader.load(
        CONFIG.TEXTURE_PATH,
        texture => {
            texture.wrapS = RepeatWrapping;  // Set texture to repeat in S axis direction
            texture.wrapT = RepeatWrapping;  // Set texture to repeat in T axis direction
            // texture.repeat.set(10, 10);
            heightMapSource.getGroundOverlayProvider().addOverlays([
                {
                    geoArea: lineString,    // Geographic area to apply texture
                    texture                // Texture to apply
                }
            ]);
        }
    );
};

/**
 * Configure DEM terrain data source
 * @param mapView Map view instance
 */
const configureDEMTerrainSource = (mapView: MapView): void => {
    // Create DEM terrain data source
    const heightMapSource = new DEMTerrainSource({
        source: CONFIG.DEM_SOURCE_PATH,   // DEM data source path
    });

    // Define modification area
    const lineString = defineModificationArea();

    // Add terrain modification
    addTerrainModification(heightMapSource, lineString);

    // Add ground texture overlay
    addGroundOverlay(heightMapSource, lineString);

    // Set elevation data source
    mapView.setElevationSource(heightMapSource);

    // Add Web tile data source
    heightMapSource.addWebTileDataSource(new ArcGISTileProvider({ minDataLevel: 0, maxDataLevel: 18 }));
};

// ==================== Main execution flow ====================

try {
    // 1. Get map canvas element
    const canvas = getMapCanvas("mapCanvas");
    
    // 2. Initialize map view
    const mapView = initializeMapView(canvas);
    
    // 3. Configure DEM terrain data source
    configureDEMTerrainSource(mapView);
    
    console.log("Terrain elevation modification example initialized successfully");
} catch (error) {
    console.error("Error occurred while initializing terrain elevation modification example:", error);
}
