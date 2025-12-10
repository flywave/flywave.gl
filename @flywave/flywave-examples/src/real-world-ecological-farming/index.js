import { MapView, GeoCoordinates, MapControls, MapControlsUI, TileRenderDataSource, sphereProjection, TransferManager, ModularMapViewMonitor, DEMTerrainSource, ArcGISTileProvider, GUI, MapViewEventNames, } from "@flywave/flywave.gl";
import { PolygonMesh } from "./PolygonMesh.js";
import { WaterMaterial } from "./water.js";
// Project configuration constants
const PROJECT_CONFIG = {
    ECOLOGICAL_FARMING_3DTILES_URL: "http://192.168.1.18/flywave-examples/data/%E7%94%9F%E6%80%81%E5%85%BB%E6%AE%96%E5%9B%AD%E5%8C%BA/3dtile/tileset.json",
    ECOLOGICAL_FARMING_TERRAIN_URL: "http://192.168.1.18/flywave-examples/data/%E7%94%9F%E6%80%81%E5%85%BB%E6%AE%96%E5%9B%AD%E5%8C%BA/terrain/{z}/{x}/{y}.png",
    WATER_GEOJSON_PATH: "./water_geojson.json"
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
    // Set initial map position and viewpoint (ecological farm location)
    const initialLocation = new GeoCoordinates(34.7702, 117.0509);
    return new MapView({
        projection: sphereProjection, // Use spherical projection
        target: initialLocation, // Initial target position
        zoomLevel: 16, // Initial zoom level
        tilt: 60, // Initial tilt angle
        heading: 45, // Initial heading angle
        canvas: canvas, // Specify render canvas
        theme: {
            extends: "resources/tilezen_base_globe.json", // Base theme configuration
            lights: [{
                    type: "ambient", // Ambient light
                    intensity: 0.8, // Light intensity
                    name: "ambientLight", // Light source name
                    color: "#ffffff" // Light source color
                }],
            celestia: {
                sunTime: new Date().setHours(10), // Set sun time to 10 AM
                sunCastShadow: true, // Enable shadows
                sunIntensity: 2, // Sun light intensity
                atmosphere: true // Enable atmospheric effects
            },
            postEffects: {
                smaa: true, // Enable SMAA anti-aliasing
                translucentDepth: {
                    mixFactor: 0.4 // Translucent depth mixing factor
                },
                brightnessContrast: {
                    brightness: 0.01, // Brightness adjustment
                    contrast: 0.23, // Contrast adjustment
                    enabled: true // Enable brightness contrast effect
                },
                hueSaturation: {
                    hue: 0.17, // Hue adjustment
                    saturation: 0.57, // Saturation adjustment
                    enabled: true // Enable hue saturation effect
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
const initializeMapControls = (mapView, canvas) => {
    const ui = new MapControlsUI(new MapControls(mapView));
    canvas.parentElement.appendChild(ui.domElement);
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
/**
 * Add ecological farming facility data source
 * @param mapView Map view instance
 */
const addEcologicalFarmingDataSource = async (mapView) => {
    // Ecological farming facility data source
    const dataSource = new TileRenderDataSource({
        url: PROJECT_CONFIG.ECOLOGICAL_FARMING_3DTILES_URL
    });
    mapView.addDataSource(dataSource);
    // Wait for data source to load and adjust viewpoint
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
            "bounds": [
                117.02636718750001, 34.728069689872314, 117.12936401367188,
                34.81267582141755
            ],
            "minzoom": 7,
            "maxzoom": 17,
            "scheme": "xyz",
            "tiles": [
                PROJECT_CONFIG.ECOLOGICAL_FARMING_TERRAIN_URL
            ],
            "type": "raster-dem",
            "tileSize": 512
        }
    });
    mapView.setElevationSource(demTerrain);
    demTerrain.addWebTileDataSource(new ArcGISTileProvider({ minDataLevel: 0, maxDataLevel: 18 }));
};
/**
 * Add water features
 * @param mapView Map view instance
 */
const addWaterFeatures = async (mapView) => {
    try {
        // Download water GeoJSON data
        const features = await TransferManager.instance().downloadJson(PROJECT_CONFIG.WATER_GEOJSON_PATH);
        features.forEach((feature) => {
            // Create water material
            const waterMaterial = new WaterMaterial({
                sunColor: 0xffffff, // Sun color
                waterColor: 0x336633, // Water color
                distortionScale: 3.7, // Distortion scale
                alpha: 0.6 // Transparency
            });
            // Create polygon mesh
            const mesh = new PolygonMesh(feature, sphereProjection, waterMaterial);
            // Set altitude
            mesh.anchor.altitude = (feature.properties.altitude || 30);
            mapView.mapAnchors.add(mesh);
        });
    }
    catch (error) {
        console.error("Error loading water features:", error);
    }
};
// ==================== Main execution flow ====================
try {
    // 1. Get map canvas element
    const canvas = getMapCanvas();
    // 2. Initialize map view
    const mapView = initializeMapView(canvas);
    // 3. Initialize map controls
    initializeMapControls(mapView, canvas);
    // 4. Initialize map monitor
    initializeMapMonitor(mapView);
    // 5. Add ecological farming facility data source
    addEcologicalFarmingDataSource(mapView);
    // 6. Configure DEM terrain data source
    configureDEMTerrainSource(mapView);
    // 7. Add water features
    addWaterFeatures(mapView);
    // 8. Expose map view to global scope for debugging
    window.mapView = mapView;
    console.log("Ecological farming visualization example initialized successfully");
}
catch (error) {
    console.error("Error occurred while initializing ecological farming visualization example:", error);
}
