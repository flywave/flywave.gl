import { MapView, GeoCoordinates, ellipsoidProjection, MapControls, CesiumIonDataSource, MapControlsUI, Theme, WindowEventHandler, TileIntersection } from "@flywave/flywave.gl";

    import { PropertiesTable } from './PropertiesTable.js';

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
 */
const initializeMapControls = (mapView: MapView): void => {
    const controls = new MapControls(mapView);
    const ui = new MapControlsUI(controls);
    const canvas = document.getElementById("mapCanvas") as HTMLCanvasElement;
    canvas.parentElement!.appendChild(ui.domElement);
};

/**
 * Create 3D Tiles data source
 * @param mapView Map view instance
 * @returns Configured CesiumIonDataSource instance
 */
const create3DTilesDataSource = (mapView: MapView): CesiumIonDataSource => {
    // Create Cesium Ion data source using specified asset ID
    const cesiumIonDataSource = new CesiumIonDataSource({
        styleSetName: "3dtiles",       // Style set name
        // Note: In production environments, this token should be managed using environment variables or configuration files
        accessToken: CESIUM_ION_TOKEN, // Use unified configured access token
        assetId: 75343,               // Data asset ID
        animation: {                   // Animation configuration
            easing: "ease-in-out",     // Easing effect
            duration: 1000,            // Animation duration (milliseconds)
        }
    });
    
    // Add data source to map view
    mapView.addDataSource(cesiumIonDataSource);
    
    return cesiumIonDataSource;
};


/**
 * Define 3D Tiles style theme
 * Apply different color schemes based on building height
 */
const create3DTilesTheme = (): Theme => {
    return {
        styles: {
            "3dtiles": [
                // Low-rise buildings (0-15m) - Bright light blue scheme
                {
                    when: "Height >= 0 && Height < 15",
                    technique: "tile3d",
                    color: {
                        from: "#B0E2FF", // Very light blue
                        to: "#7EC0EE"   // Bright sky blue
                    },
                    value: 0.9,
                    opacity: {
                        from: 0.5,
                        to: 0.8
                    },
                },
                // Medium buildings (15-30m) - Bright green scheme
                {
                    when: "Height >= 15 && Height < 30",
                    technique: "tile3d",
                    color: {
                        from: "#98FB98", // Pale green
                        to: "#00FA9A"   // Bright spring green
                    },
                    value: 0.9,
                    opacity: {
                        from: 0.6,
                        to: 0.85
                    },
                },
                // Mid-high buildings (30-50m) - Bright yellow scheme
                {
                    when: "Height >= 30 && Height < 50",
                    technique: "tile3d",
                    color: {
                        from: "#FFFACD", // Lemon chiffon
                        to: "#FFD700"   // Gold
                    },
                    value: 0.95,
                    opacity: {
                        from: 0.7,
                        to: 0.9
                    },
                },
                // High-rise buildings (50-80m) - Bright orange scheme
                {
                    when: "Height >= 50 && Height < 80",
                    technique: "tile3d",
                    color: {
                        from: "#FFDAB9", // Peach
                        to: "#FFA500"   // Orange
                    },
                    value: 0.95,
                    opacity: {
                        from: 0.75,
                        to: 0.9
                    },
                },
                // Super high-rise buildings (80-120m) - Bright pink scheme
                {
                    when: "Height >= 80 && Height < 120",
                    technique: "tile3d",
                    color: {
                        from: "#FFB6C1", // Light pink
                        to: "#FF69B4"   // Hot pink
                    },
                    value: 1.0,
                    opacity: {
                        from: 0.8,
                        to: 0.95
                    },
                },
                // Skyscrapers (120m+) - Bright purple scheme
                {
                    when: "Height >= 120",
                    technique: "tile3d",
                    color: {
                        from: "#E6E6FA", // Lavender
                        to: "#9370DB"   // Medium purple
                    },
                    value: 1.0,
                    opacity: {
                        from: 0.85,
                        to: 1.0
                    },
                },
                // Selected style - Bright yellow
                {
                    id: "selected",
                    when: "0!=0",
                    technique: "tile3d",
                    color: "#FFFF00", // Bright yellow
                    value: 1.0,
                    opacity: 1.0,
                },
            ]
        }
    };
};

/**
 * Set 3D Tiles data source style theme
 * @param dataSource 3D Tiles data source
 */
const set3DTilesTheme = (dataSource: CesiumIonDataSource): void => {
    const theme = create3DTilesTheme();
    dataSource.setTheme(theme);
};

/**
 * Initialize properties table component
 * @returns PropertiesTable instance
 */
const initializePropertiesTable = () => {
    
    // Create properties table component instance
    return new PropertiesTable();
};

/**
 * Set mouse click event handler
 * @param mapView Map view instance
 * @param dataSource 3D Tiles data source
 * @param propertiesTable Properties table component
 */
const setupMouseClickHandler = (mapView: MapView, dataSource: CesiumIonDataSource, propertiesTable: any): void => {
    const eventHandler = new WindowEventHandler(mapView.canvas);

    eventHandler.addEventListener("mouseclick", (e) => {
        // Get 3D Tiles objects at click position
        let picks = dataSource.intersectMapObjects(e.layerX, e.layerY).sort((a, b) => {
            return a.distance - b.distance; // Sort by distance, nearest first
        });
        let pick = picks[0];

        if (pick && pick.tile) {
            // Get properties of selected object
            const properties = pick.tile.getBatchPropertiesByIntersection(pick);

            // Display properties in table
            propertiesTable.show(properties);

            console.log('Selected tile properties:', properties);

            // Update selected style
            dataSource.updateStyleById("selected", {
                when: `DOITT_ID == '${properties.DOITT_ID}'`,
            });
        } else {
            // Clear selected style
            dataSource.updateStyleById("selected", {
                when: "0!=0", // Always false condition, hide selected style
            });
        }
    });
};

// ==================== Main execution flow ====================

try {
    // 1. Get map canvas element
    const canvas = getMapCanvas();
    
    // 2. Initialize map view
    const mapView = initializeMapView(canvas);
    
    // 3. Initialize map controls
    initializeMapControls(mapView);
    
    // 4. Create 3D Tiles data source
    const cesiumIonDataSource = create3DTilesDataSource(mapView);
    
    // 5. Set 3D Tiles style theme
    set3DTilesTheme(cesiumIonDataSource);
    
    // 6. Initialize properties table component
    const propertiesTable = initializePropertiesTable();
    
    // 7. Set up mouse click event handler
    setupMouseClickHandler(mapView, cesiumIonDataSource, propertiesTable);
    
    console.log("3D Tiles animation example initialized successfully");
} catch (error) {
    console.error("Error occurred while initializing 3D Tiles animation example:", error);
}