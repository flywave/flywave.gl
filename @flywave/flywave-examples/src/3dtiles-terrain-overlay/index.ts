import {
    MapView,
    GeoCoordinates,
    ellipsoidProjection,
    MapControls,
    CesiumIonDataSource,
    DEMTerrainSource,
    ArcGISTileProvider,
    MapControlsUI
} from "@flywave/flywave.gl";


/**
 * Get map canvas element
 * @returns HTMLCanvasElement Map canvas element
 */
const getMapCanvas = (): HTMLCanvasElement => {
    const canvas = document.getElementById("mapCanvas") as HTMLCanvasElement;
    if (!canvas) {
        throw new Error("Map canvas element not found, please ensure there is a canvas element with id 'mapCanvas' in HTML");
    }
    return canvas;
};

/**
 * Initialize map view configuration
 * @param canvas Map canvas element
 * @returns Configured MapView instance
 */
const initializeMapView = (canvas: HTMLCanvasElement): MapView => {
    // Set initial map position and view (New York City, near Statue of Liberty)
    const initialLocation = new GeoCoordinates(40.6959, -74.0162);
    
    return new MapView({
        projection: ellipsoidProjection, // Use ellipsoid projection
        target: initialLocation,         // Initial target position
        zoomLevel: 17,                  // Initial zoom level
        tilt: 70,                       // Initial tilt angle
        heading: 35.1,                  // Initial heading angle
        canvas: canvas,                 // Specify render canvas
        theme: {
            extends: "resources/tilezen_base_globe.json", // Base theme configuration
            postEffects: {
                "translucentDepth": {
                    mixFactor: 0.5,      // Translucent depth mix factor
                }
            }
        }
    });
};

/**
 * Initialize map control component
 * @param mapView Map view instance
 * @param canvas Map canvas element
 */
const initializeMapControls = (mapView: MapView, canvas: HTMLCanvasElement): void => {
    const controls = new MapControls(mapView);
    const ui = new MapControlsUI(controls);
    canvas.parentElement!.appendChild(ui.domElement);
};

/**
 * Configure DEM terrain data source
 * @param mapView Map view instance
 */
const configureDEMTerrainSource = (mapView: MapView): void => {
    const demTerrain = new DEMTerrainSource({
        source: "dem_terrain/source.json", // DEM terrain data source path
    });

    mapView.setElevationSource(demTerrain);
    demTerrain.addWebTileDataSource(new ArcGISTileProvider({ 
        minDataLevel: 0, 
        maxDataLevel: 18 
    }));
};

/**
 * Create Cesium Ion data source
 * @param mapView Map view instance
 * @returns Configured CesiumIonDataSource instance
 */
const createCesiumIonDataSource = (mapView: MapView): CesiumIonDataSource => {
    const cesiumIonDataSource = new CesiumIonDataSource({
        // Note: In production environments, this token should be managed using environment variables or configuration files
        accessToken: CESIUM_ION_TOKEN, // Use unified configured access token
        assetId: 75343                // Data asset ID
    });

    // Set data source theme, enable translucent depth effect
    cesiumIonDataSource.setTheme({
        "tile3DRender": {
            "postEffects": {
                "translucentDepth": {
                    enabled: true,       // Enable translucent depth effect
                }
            },
        }
    });

    mapView.addDataSource(cesiumIonDataSource);
    
    return cesiumIonDataSource;
};

// ==================== Main execution flow ====================

try {
    // 1. Get map canvas element
    const canvas = getMapCanvas();
    
    // 2. Initialize map view
    const mapView = initializeMapView(canvas);
    
    // 3. Initialize map controls
    initializeMapControls(mapView, canvas);
    
    // 4. Configure DEM terrain data source
    configureDEMTerrainSource(mapView);
    
    // 5. Create Cesium Ion data source
    const cesiumDataSource = createCesiumIonDataSource(mapView);
    
    console.log("3D Tiles terrain overlay example initialized successfully");
} catch (error) {
    console.error("Error initializing 3D Tiles terrain overlay example:", error);
}
