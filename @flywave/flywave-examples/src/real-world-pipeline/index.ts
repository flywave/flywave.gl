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
    GUI,
    GeoPolygon,
    TransferManager,
    FeaturesDataSource,
    FeatureCollection,
} from "@flywave/flywave.gl";
import { Color, MathUtils, RepeatWrapping, TextureLoader } from "three";

// Project configuration constants
const PROJECT_CONFIG = {
    SERVER_BASE_URL: "http://192.168.1.18/flywave-examples/data",
    PROJECT_NAME: "周村",
    REGION_DATA_PATH: "./region_data.geojson",
    TEXTURE_PATH: "staff_1024.jpg"
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
    // Set initial map position and view (Zhoucun project location)
    const initialLocation = new GeoCoordinates(36.8356, 117.8525);

    return new MapView({
        projection: sphereProjection,    // Use spherical projection
        target: initialLocation,         // Initial target position
        zoomLevel: 18,                  // Initial zoom level
        tilt: 70,                       // Initial tilt angle
        logarithmicDepthBuffer: true,    // Enable logarithmic depth buffer
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
                atmosphere: true        // Enable atmospheric effect
            },
            postEffects: {
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
 * Get pipeline data source configuration
 * @returns Pipeline data source configuration array
 */
const getPipeSourceConfigs = (): Array<{ name: string, url: string }> => {
    return [
        // { name: "Street Lamp", url: `${PROJECT_CONFIG.SERVER_BASE_URL}/${PROJECT_CONFIG.PROJECT_NAME}/3dtile_ludeng/tileset.json` },
        // { name: "Drainage", url: `${PROJECT_CONFIG.SERVER_BASE_URL}/${PROJECT_CONFIG.PROJECT_NAME}/3dtile_ps/tileset.json` },
        // { name: "Electricity", url: `${PROJECT_CONFIG.SERVER_BASE_URL}/${PROJECT_CONFIG.PROJECT_NAME}/3dtile_power/tileset.json` },
        // { name: "Natural Gas", url: `${PROJECT_CONFIG.SERVER_BASE_URL}/${PROJECT_CONFIG.PROJECT_NAME}/3dtile_trq/tileset.json` },
        { name: "Drinking Water", url: `${PROJECT_CONFIG.SERVER_BASE_URL}/${PROJECT_CONFIG.PROJECT_NAME}/3dtile_ys/tileset.json` }
    ];
};

/**
 * Add pipeline data sources
 * @param mapView Map view instance
 */
const addPipeDataSources = (mapView: MapView): void => {
    const pipeSources = getPipeSourceConfigs();

    // Batch add pipeline data sources
    pipeSources.forEach(item => {
        const dataSource = new TileRenderDataSource({
            url: item.url,
            name: item.name
        });

        dataSource.setTheme({
            postEffects: {
                bloom: {
                    enabled: true,   // Enable bloom effect 
                },
                translucentDepth: {
                    enabled: true,   // Enable translucent depth effect
                    mixFactor: 1, // Translucent depth mix factor
                    useObjectColor: true, // Use object color for translucent depth
                    objectColorMix: 0, // Object color mix factor
                    color: `#${new Color(0xffffff).getHexString()}` // Object color
                }
            },
        });

        mapView.addDataSource(dataSource);
    });

    // Add building data source
    const buildingDataSource = new TileRenderDataSource({
        url: `${PROJECT_CONFIG.SERVER_BASE_URL}/${PROJECT_CONFIG.PROJECT_NAME}/3dtile_buildings/tileset.json`,
        name: "Buildings"
    });
    mapView.addDataSource(buildingDataSource);
};



/**
 * Configure DEM terrain data source
 * @param mapView Map view instance
 */
const configureDEMTerrainSource = (mapView: MapView): void => {
    const demTerrain = new DEMTerrainSource({
        source: `${PROJECT_CONFIG.SERVER_BASE_URL}/${PROJECT_CONFIG.PROJECT_NAME}/terrain/source.json`
    });

    // Add Web tile data source
    demTerrain.addWebTileDataSource(new ArcGISTileProvider({ minDataLevel: 0, maxDataLevel: 18 }));

    // Set as map elevation data source
    mapView.setElevationSource(demTerrain);

    // Add ground texture overlay
    addGroundOverlay(demTerrain);

    // Add ground modification
    addGroundModification(demTerrain);
};

/**
 * Add ground texture overlay
 * @param demTerrain DEM terrain data source
 */
const addGroundOverlay = (demTerrain: DEMTerrainSource): void => {
    const textureLoader = new TextureLoader();

    // Define overlay polygon coordinates
    const overlayPolygon2 = new GeoPolygon([
        [117.85102680375553, 36.834357945481926],
        [117.85094036472515, 36.833819257349475],
        [117.85440509102017, 36.8337251807215],
        [117.85445426923172, 36.83431078084989],
        [117.85102680375553, 36.834357945481926]
    ]);

    textureLoader.load(PROJECT_CONFIG.TEXTURE_PATH, (texture) => {
        texture.wrapS = RepeatWrapping;
        texture.wrapT = RepeatWrapping;
        demTerrain.getGroundOverlayProvider().addOverlays([
            {
                geoArea: overlayPolygon2,
                texture
            }
        ]);
    });
};

/**
 * Add ground modification
 * @param demTerrain DEM terrain data source
 */
const addGroundModification = (demTerrain: DEMTerrainSource): void => {
    // Ground modification polygon
    const overlayPolygon = new GeoPolygon([
        [117.85112449445177, 36.83428081874651],
        [117.85108647506257, 36.83386874898096],
        [117.85431337066268, 36.83377492355474],
        [117.85431970722806, 36.83419967287584],
        [117.85112449445177, 36.83428081874651]
    ]);

    demTerrain.getGroundModificationManager().addModification({
        heightOperation: "replace",   // Height operation type
        vertexSource: "fixed"         // Vertex source type
    }, overlayPolygon, 0, -5);       // Polygon, minimum height, maximum height
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

/**
 * Add GeoJSON data source
 * @param mapView Map view instance
 */
const addGeoJsonDataSource = async (mapView: MapView): Promise<void> => {
    // GeoJSON data source configuration
    const geojsonDataSource = new FeaturesDataSource({
        styleSetName: 'labelLayers',
        maxDataLevel: 16,
        minDataLevel: 0,
    });

    try {
        const json: FeatureCollection = await TransferManager.instance().downloadJson(PROJECT_CONFIG.REGION_DATA_PATH);

        json.features.forEach((feature) => {
            feature.id = MathUtils.generateUUID();
        });

        geojsonDataSource.setFromGeojson(json);

        await mapView.addDataSource(geojsonDataSource);

        geojsonDataSource.setTheme({
            styles: {
                labelLayers: [
                    {
                        when: ['==', ['geometry-type'], 'LineString'],
                        technique: 'text',
                        text: ['get', 'name'],
                        size: 18,
                        color: '#000',
                        backgroundColor: '#ffffff',
                        backgroundSize: 10,
                        fontStyle: 'Bold',
                    },
                ],
            }
        });
    } catch (error) {
        console.error("Error loading GeoJSON data:", error);
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

    // 4. Add pipeline data sources
    addPipeDataSources(mapView);

    // 5. Configure DEM terrain data source
    configureDEMTerrainSource(mapView);

    // 6. Initialize map monitor
    initializeMapMonitor(mapView);

    // 7. Add GeoJSON data source
    addGeoJsonDataSource(mapView);

    console.log("Pipeline engineering project visualization example initialized successfully");
} catch (error) {
    console.error("Error initializing pipeline engineering project visualization example:", error);
}