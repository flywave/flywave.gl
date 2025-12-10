import {
    MapView,
    GeoCoordinates,
    ellipsoidProjection,
    MapControls,
    CesiumIonDataSource,
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
    // Set initial map position and viewpoint (New York City, near Statue of Liberty)
    const initialLocation = new GeoCoordinates(40.6959, -74.0162);
    
    return new MapView({
        projection: ellipsoidProjection, // Use ellipsoidal projection
        target: initialLocation,         // Initial target position
        zoomLevel: 18,                  // Initial zoom level
        tilt: 70,                       // Initial tilt angle
        heading: 35.1,                  // Initial heading angle
        canvas: canvas,                 // Specify render canvas
        theme: {
            extends: "resources/tilezen_base_globe.json" // Base theme configuration
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
    
    // 4. Create Cesium Ion data source
    const cesiumDataSource = createCesiumIonDataSource(mapView);
    
    console.log("3D Tiles getting started example initialized successfully");
} catch (error) {
    console.error("Error occurred while initializing 3D Tiles getting started example:", error);
}
