import { MapView, GeoCoordinates, MapControls, MapControlsUI, TileRenderDataSource, sphereProjection, ModularMapViewMonitor, DEMTerrainSource, ArcGISTileProvider, MapViewEventNames, GUI } from "@flywave/flywave.gl";
// Project configuration constants
const PROJECT_CONFIG = {
    POWER_LINE_3DTILES_URL: "http://192.168.1.18/flywave-examples/data/%E7%89%B9%E9%AB%98%E5%8E%8B%E8%BE%93%E7%94%B5%E7%BA%BF%E8%B7%AF/3dtile/tileset.json",
    POWER_LINE_TERRAIN_URL: "http://192.168.1.18/flywave-examples/data/特高压输电线路/terrain/{z}/{x}/{y}.png",
    TERRAIN_BOUNDS: [117.45208740234376, 36.630958008194135, 117.86407470703126, 36.96086580957587]
};
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
    // Set initial map position and view (UHV transmission line location)
    const initialLocation = new GeoCoordinates(40.6959, -74.0162);
    return new MapView({
        projection: sphereProjection, // Use spherical projection
        target: initialLocation, // Initial target position
        zoomLevel: 18, // Initial zoom level
        tilt: 70, // Initial tilt angle
        heading: 35.1, // Initial heading angle
        canvas: canvas, // Specify render canvas
        theme: {
            extends: "resources/tilezen_base_globe.json", // Base theme configuration
            "lights": [{
                    "type": "ambient", // Ambient light
                    "intensity": 1.0, // Light intensity
                    name: "ambientLight", // Light source name
                    "color": "#ffffff" // Light source color
                }],
            "celestia": {
                "sunTime": new Date().setHours(13), // Set sun time to 1 PM
                sunCastShadow: true, // Enable shadows
                sunIntensity: 3, // Sun light intensity
                atmosphere: true // Enable atmospheric effect
            },
            "postEffects": {
                "smaa": true // Enable SMAA anti-aliasing
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
    const ui = new MapControlsUI(new MapControls(mapView));
    canvas.parentElement.appendChild(ui.domElement);
};
/**
 * Add UHV transmission line data source
 * @param mapView Map view instance
 */
const addPowerLineDataSource = (mapView) => {
    const dataSource = new TileRenderDataSource({
        url: PROJECT_CONFIG.POWER_LINE_3DTILES_URL,
    });
    // Expose data source to global scope for debugging
    window.dataSource = dataSource;
    mapView.addDataSource(dataSource);
    dataSource.getRootTile().then((tile) => {
        mapView.lookAt({
            bounds: tile.cached.boundingVolume.region
        });
    });
};
/**
 * Configure DEM terrain data source
 * @param mapView Map view instance
 */
const configureDEMTerrainSource = (mapView) => {
    const demTerrain = new DEMTerrainSource({
        source: {
            "bounds": PROJECT_CONFIG.TERRAIN_BOUNDS,
            "minzoom": 0,
            "maxzoom": 14,
            "scheme": "xyz",
            "tiles": [PROJECT_CONFIG.POWER_LINE_TERRAIN_URL],
            "type": "raster-dem",
            "tileSize": 512
        }
    });
    mapView.setElevationSource(demTerrain);
    demTerrain.addWebTileDataSource(new ArcGISTileProvider({ minDataLevel: 0, maxDataLevel: 18 }));
};
/**
 * Initialize map monitor
 * @param mapView Map view instance
 */
const initializeMapMonitor = (mapView) => {
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
    // 4. Add UHV transmission line data source
    addPowerLineDataSource(mapView);
    // 5. Configure DEM terrain data source
    configureDEMTerrainSource(mapView);
    // 6. Initialize map monitor
    initializeMapMonitor(mapView);
    console.log("Power engineering project visualization example initialized successfully");
}
catch (error) {
    console.error("Error initializing power engineering project visualization example:", error);
}
