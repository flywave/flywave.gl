import {
    MapView,
    GeoCoordinates,
    ellipsoidProjection,
    MapControls,
    DEMTerrainSource,
    ArcGISTileProvider, 
    MapControlsUI,
    MapThumbnailGenerator
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
    // Set initial map position and viewpoint (a location in Shandong Province, China)
    const initialLocation = new GeoCoordinates(36.48619699228674, 118.17270928364879);
    
    return new MapView({
        projection: ellipsoidProjection, // Use ellipsoidal projection
        target: initialLocation,         // Initial target position
        enablePolarDataSource: false,    // Disable polar data source
        zoomLevel: 15,                  // Initial zoom level
        tilt: 71.43670140369471,       // Initial tilt angle
        heading: -89.40263147840845,    // Initial heading angle
        canvas: canvas,                 // Specify render canvas
        theme: {
            extends: "resources/tilezen_base_globe.json", // Base theme configuration
            "celestia": {
                "atmosphere": true,      // Enable atmospheric effects
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
    const ui = new MapControlsUI(controls, {
        "screenshotButton": {
            "width": 512,               // Screenshot width
            "height": 512,              // Screenshot height
        },
    });
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
    
    console.log("DEM digital terrain getting started example initialized successfully");
} catch (error) {
    console.error("Error occurred while initializing DEM digital terrain getting started example:", error);
} 
