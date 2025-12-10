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
    PROJECT_NAME: "Country Garden"
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
    // Set initial map position and view (Country Garden project location)
    const initialLocation = new GeoCoordinates(36.804157511532786, 117.92817009363822);
    
    return new MapView({
        projection: sphereProjection,    // Use spherical projection
        target: initialLocation,         // Initial target position
        zoomLevel: 20,                  // Initial zoom level
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
                translucentDepth: {
                    mixFactor: 0.4      // Translucent depth mix factor
                },
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
 * Get 3D Tiles data source configuration
 * @returns 3D Tiles data source configuration array
 */
const getTileSourceConfigs = (): Array<{name: string, url: string}> => {
    return [
        { name: "Street Lamp", url: `${PROJECT_CONFIG.SERVER_URL}/${PROJECT_CONFIG.PROJECT_NAME}/3dtile_ludeng/tileset.json` },
        // { name: "排水", url: `${PROJECT_CONFIG.SERVER_URL}/${PROJECT_CONFIG.PROJECT_NAME}/3dtile_ps/tileset.json` },
        // { name: "电力", url: `${PROJECT_CONFIG.SERVER_URL}/${PROJECT_CONFIG.PROJECT_NAME}/3dtile_power/tileset.json` },
        { name: "Buildings", url: `${PROJECT_CONFIG.SERVER_URL}/${PROJECT_CONFIG.PROJECT_NAME}/3dtile_buildings/tileset.json` },
        { name: "Natural Gas", url: `${PROJECT_CONFIG.SERVER_URL}/${PROJECT_CONFIG.PROJECT_NAME}/3dtile_trq/tileset.json` },
        { name: "Drinking Water", url: `${PROJECT_CONFIG.SERVER_URL}/${PROJECT_CONFIG.PROJECT_NAME}/3dtile_ys/tileset.json` }
    ];
};

/**
 * Add 3D Tiles data source
 * @param mapView Map view instance
 */
const add3DTileDataSources = (mapView: MapView): void => {
    const tileSources = getTileSourceConfigs();
    
    // Batch add pipeline data sources
    tileSources.forEach(item => {
        const dataSource = new TileRenderDataSource({
            url: item.url,
            name: item.name
        });

        dataSource.setTheme({
            tile3DRender: {
                postEffects: {
                    translucentDepth: {
                        enabled: true,    // Enable translucent depth effect
                    }
                },
            }
        });

        mapView.addDataSource(dataSource);
    });
    
    // Add green plant data source
    const treeDataSource = new TileRenderDataSource({
        url: `${PROJECT_CONFIG.SERVER_URL}/${PROJECT_CONFIG.PROJECT_NAME}/3dtile_tree/tileset.json`,
        name: "Green Plants"
    });
    mapView.addDataSource(treeDataSource);
};

/**
 * Configure DEM terrain data source
 * @param mapView Map view instance
 */
const configureDEMTerrainSource = (mapView: MapView): void => {
    const demTerrain = new DEMTerrainSource({
        source: { 
            "bounds": [117.88982391357423, 36.78839127856239, 117.94132232666017, 36.829622821570254], 
            "minzoom": 0, 
            "maxzoom": 14, 
            "scheme": "xyz", 
            "tiles": [PROJECT_CONFIG.SERVER_URL + "/"+ PROJECT_CONFIG.PROJECT_NAME +"/terrain/{z}/{x}/{y}.png"], 
            "type": "raster-dem", 
            "tileSize": 512
        }
    });

    // Add Web tile data source
    demTerrain.addWebTileDataSource(new ArcGISTileProvider({ minDataLevel: 0, maxDataLevel: 18 })); 
    
    // Set as map elevation data source
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
    
    // 4. Add 3D Tiles data sources
    add3DTileDataSources(mapView);
    
    // 5. Configure DEM terrain data source
    configureDEMTerrainSource(mapView);
    
    // 6. Initialize map monitor
    initializeMapMonitor(mapView);
    
    // 7. Expose map view to global scope for debugging
    (window as any).mapView = mapView;
    
    console.log("Community construction project visualization example initialized successfully");
} catch (error) {
    console.error("Error initializing community construction project visualization example:", error);
}