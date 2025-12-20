import {
    MapView,
    GeoCoordinates,
    MapControls,
    MapControlsUI,
    TileRenderDataSource,
    sphereProjection,
    DEMTerrainSource,
    ArcGISTileProvider,
    ModularMapViewMonitor,
    MapViewEventNames,
    GUI
} from "@flywave/flywave.gl";

// Project configuration constants
const PROJECT_CONFIG = {
    SERVER_URL: "http://192.168.1.18/flywave-examples/data",
    RAILWAY_3DTILES_URL: "/铁路1/3dtile/tileset.json",
    RAILWAY_PNTS_URL: "/铁路1/pnts/tileset.json",
    RAILWAY_TERRAIN_URL: "/铁路1/terrain/{z}/{x}/{y}.png",
    TERRAIN_BOUNDS: [
        119.99610900878908,
        36.05020927487619,
        120.09910583496094,
        36.13343831245866
    ] as [number, number, number, number]
};

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
    // Set initial map position and view (default Beijing coordinates, can be adjusted based on actual data)
    const initialLocation = new GeoCoordinates(39.9042, 116.4074);
    
    return new MapView({
        projection: sphereProjection,    // Use spherical projection
        target: initialLocation,         // Initial target position
        zoomLevel: 15,                  // Initial zoom level
        canvas: canvas,                 // Specify render canvas
        theme: {
            extends: "resources/tilezen_base_globe.json", // Base theme configuration
            lights: [{
                type: "ambient",       // Ambient light
                intensity: 1.0,        // Light intensity
                name: "ambientLight",  // Light source name
                color: "#ffffff"       // Light source color
            }],
            celestia: {
                sunTime: new Date().setHours(13), // Set sun time to 1 PM
                sunCastShadow: true,    // Enable shadows
                sunIntensity: 3,        // Sun light intensity
                atmosphere: true        // Enable atmospheric effect
            },
            postEffects: {
                smaa: true,            // Enable SMAA anti-aliasing
                brightnessContrast: {
                    brightness: -0.17,  // Brightness adjustment
                    contrast: 0.23,     // Contrast adjustment
                    enabled: true       // Enable brightness contrast effect
                },
                hueSaturation: {
                    hue: 0.17,         // Hue adjustment
                    saturation: 0.57,   // Saturation adjustment
                    enabled: true       // Enable hue saturation effect
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
    const mapControls = new MapControls(mapView);
    const ui = new MapControlsUI(mapControls);
    canvas.parentElement!.appendChild(ui.domElement);
};

/**
 * Add railway facility data source
 * @param mapView Map view instance
 */
const addRailwayDataSource = (mapView: MapView): void => {
    // Add 3D Tiles railway facility data source
    const dataSource = new TileRenderDataSource({
        url: PROJECT_CONFIG.SERVER_URL + PROJECT_CONFIG.RAILWAY_3DTILES_URL,
        name: "Railway Facilities"
    });

    mapView.addDataSource(dataSource);
    
    dataSource.getRootTile().then((tile) => {
        mapView.lookAt({
            bounds: tile.cached.boundingVolume.region
        });
    });
    
    // Add point cloud data source
    const dataSourcePnts = new TileRenderDataSource({
        url: PROJECT_CONFIG.SERVER_URL + PROJECT_CONFIG.RAILWAY_PNTS_URL,
        name: "Railway Facilities pnts"
    });
    mapView.addDataSource(dataSourcePnts);
};

/**
 * Configure DEM terrain data source
 * @param mapView Map view instance
 */
const configureDEMTerrainSource = (mapView: MapView): void => {
    const demTerrain = new DEMTerrainSource({
        source: {
            "bounds": PROJECT_CONFIG.TERRAIN_BOUNDS,
            "minzoom": 0,
            "maxzoom": 14,
            "scheme": "xyz",
            "tiles": [
                PROJECT_CONFIG.SERVER_URL + PROJECT_CONFIG.RAILWAY_TERRAIN_URL
            ],
            "type": "raster-dem",
            "tileSize": 512
        }
    });

    // Add Web tile data source
    demTerrain.addWebTileDataSource(new ArcGISTileProvider({ minDataLevel: 0, maxDataLevel: 18 }));

    // Terrain loading
    mapView.setElevationSource(demTerrain);
};

/**
 * Initialize map monitor
 * @param mapView Map view instance
 */
const initializeMapMonitor = (mapView: MapView): void => {
    mapView.addEventListener(MapViewEventNames.ThemeLoaded, () => {
        new ModularMapViewMonitor(mapView, new GUI()).open();
    });
};

// ==================== Main execution flow ====================

try {
    // 1. Get map canvas element
    const canvas = getMapCanvas();
    
    // 2. Initialize map view
    const mapView = initializeMapView(canvas);
    
    // 3. Initialize map controls
    initializeMapControls(mapView, canvas);
    
    // 4. Add railway facility data source
    addRailwayDataSource(mapView);
    
    // 5. Configure DEM terrain data source
    configureDEMTerrainSource(mapView);
    
    // 6. Initialize map monitor
    initializeMapMonitor(mapView);
    
    // 7. Expose map view to global scope for debugging
    (window as any).mapView = mapView;
    
    console.log("Railway engineering project visualization example initialized successfully");
} catch (error) {
    console.error("Error initializing railway engineering project visualization example:", error);
}