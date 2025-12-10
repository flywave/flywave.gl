import { MapView, GeoCoordinates, ellipsoidProjection, MapControls, MapControlsUI, CesiumWorldTerrainSource, ArcGISTileProvider, FrustumCullingModule } from "@flywave/flywave.gl";
import { GUI } from "dat.gui";
/**
 * Get map canvas element
 * @returns HTMLCanvasElement Map canvas element
 */
const getMapCanvas = () => {
    const canvas = document.getElementById("mapCanvas");
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
const initializeMapView = (canvas) => {
    // Set initial map position and view (Colorado, near Denver)
    const initialLocation = new GeoCoordinates(39.70916427453653, -105.21065191908919, 2270.6937844809145);
    return new MapView({
        projection: ellipsoidProjection, // Use ellipsoid projection
        target: initialLocation, // Initial target position
        enablePolarDataSource: false, // Disable polar data source
        heading: -125.79565303507096, // Initial heading angle
        tilt: 56.60060867291795, // Initial tilt angle
        zoomLevel: 18, // Initial zoom level
        canvas: canvas, // Specify render canvas
        theme: {
            extends: "resources/tilezen_base_globe.json", // Base theme configuration
            "celestia": {
                "atmosphere": true, // Enable atmospheric effect
            }
        }
    });
};
/**
 * Initialize map control component
 * @param mapView Map view instance
 * @param canvas Map canvas element
 */
const initializeMapControls = (mapView, canvas) => {
    const controls = new MapControls(mapView);
    const ui = new MapControlsUI(controls);
    canvas.parentElement.appendChild(ui.domElement);
    // Expose control object to global scope for debugging
    window.controls = controls;
};
/**
 * Configure elevation data source
 * @param mapView Map view instance
 * @returns Configured elevation data source
 */
const configureElevationSource = (mapView) => {
    // Create Cesium world terrain data source using Cesium Ion service
    const cesiumIonDataSource = new CesiumWorldTerrainSource({
        // Note: In production environments, this token should be managed using environment variables or configuration files
        accessToken: CESIUM_ION_TOKEN,
        assetId: 1, // Use default terrain dataset
    });
    // Set as map elevation data source
    mapView.setElevationSource(cesiumIonDataSource);
    // Add ArcGIS tile data provider to enhance map coverage
    cesiumIonDataSource.addWebTileDataSource(new ArcGISTileProvider({
        minDataLevel: 0,
        maxDataLevel: 18
    }));
    return cesiumIonDataSource;
};
/**
 * Initialize debug tools
 * @param mapView Map view instance
 * @param dataSource Elevation data source
 */
const initializeDebugTools = (mapView, dataSource) => {
    // Create debug GUI interface
    const gui = new GUI();
    // Initialize frustum culling debug module
    new FrustumCullingModule(mapView, gui, dataSource.getElevationProvider(), dataSource.getElevationRangeSource());
};
// ==================== Main execution flow ====================
try {
    // 1. Get map canvas element
    const canvas = getMapCanvas();
    // 2. Initialize map view
    const mapView = initializeMapView(canvas);
    // 3. Initialize map controls
    initializeMapControls(mapView, canvas);
    // 4. Configure elevation data source
    const elevationDataSource = configureElevationSource(mapView);
    // 5. Initialize debug tools
    initializeDebugTools(mapView, elevationDataSource);
    // Expose map view to global scope for debugging
    window.mapView = mapView;
    // 6. Start map animation rendering
    mapView.beginAnimation();
    console.log("Quantized mesh terrain example initialized successfully");
}
catch (error) {
    console.error("Error initializing quantized mesh terrain example:", error);
}
