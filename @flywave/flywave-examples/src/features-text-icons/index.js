/*
 * Copyright (C) 2025 flywave.gl contributors.
 * SPDX-License-Identifier: Apache-2.0
 */
import { MapView, GeoCoordinates, MapControls, MapControlsUI, FeaturesDataSource, ArcGISWebTileDataSource, TransferManager } from "@flywave/flywave.gl";
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
    // Set initial map position and viewpoint (Beijing coordinates)
    const initialLocation = new GeoCoordinates(39.9042, 116.4074);
    return new MapView({
        canvas: canvas, // Specify render canvas
        target: initialLocation, // Initial target position
        zoomLevel: 14, // Initial zoom level
        theme: {
            extends: "resources/tilezen_base.json", // Base theme configuration
            definitions: {
                "defaultTextStyle": {
                    "color": "#2c3e50",
                    "backgroundColor": "#ffffff",
                    "backgroundSize": 3,
                    "fontSize": 20,
                    "fontName": "Noto Sans",
                    "fontStyle": "bold"
                }
            },
            styles: {
                "user-features": [
                    {
                        when: ["==", ["geometry-type"], "Point"],
                        technique: "labeled-icon",
                        attr: {
                            text: ["get", "name"],
                            color: "#2C7BE5", // Dark blue, more readable
                            backgroundColor: "#FFFFFF",
                            backgroundOpacity: 0.95,
                            "imageTexture": "circle-stroked-11",
                            iconScale: 1.3,
                            size: 16,
                            vAlignment: "Center",
                            hAlignment: "Right",
                        }
                    },
                    {
                        when: ["==", ["geometry-type"], "LineString"],
                        technique: "solid-line",
                        attr: {
                            color: "#2C7BE5",
                            outlineWidth: 2,
                            metricUnit: "Pixel",
                            lineWidth: 3,
                            outlineColor: "#2C7BE5",
                        }
                    },
                    {
                        when: ["==", ["geometry-type"], "LineString"],
                        technique: "text",
                        attr: {
                            text: ["get", "name"],
                            color: "#D33F8C", // Soft pink-purple
                            backgroundColor: "#FFFFFF",
                            backgroundOpacity: 0.98,
                            size: 20,
                            fontName: "default",
                            priority: 95,
                            vAlignment: "Center",
                            hAlignment: "Center"
                        }
                    }
                ]
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
    const mapControls = new MapControls(mapView);
    const mapControlsUI = new MapControlsUI(mapControls);
    canvas.parentElement.appendChild(mapControlsUI.domElement);
};
/**
 * Create features data source
 * @param mapView Map view instance
 * @returns FeaturesDataSource instance
 */
const createFeaturesDataSource = async (mapView) => {
    const featuresDataSource = new FeaturesDataSource({
        styleSetName: "user-features", // Style set name
        maxDataLevel: 20, // Maximum data level
    });
    // Add data source to map view
    await mapView.addDataSource(featuresDataSource);
    return featuresDataSource;
};
/**
 * Load and set GeoJSON data
 * @param featuresDataSource Features data source
 */
const loadAndSetGeoJsonData = async (featuresDataSource) => {
    try {
        // Load data from GeoJSON file
        const geojsonData = await TransferManager.instance().downloadJson("complex-features.json");
        // Filter out features without names
        geojsonData.features = geojsonData.features.filter((feature) => {
            return feature.properties?.name;
        });
        // Add GeoJSON data to FeaturesDataSource
        featuresDataSource.setFromGeojson(geojsonData);
        console.log("GeoJSON data loaded successfully");
    }
    catch (error) {
        console.error('Error loading GeoJSON data:', error);
    }
};
/**
 * Add background map data source
 * @param mapView Map view instance
 */
const addBackgroundDataSource = (mapView) => {
    mapView.addDataSource(new ArcGISWebTileDataSource());
};
// ==================== Main execution flow ====================
const main = async () => {
    try {
        // 1. Get map canvas element
        const canvas = getMapCanvas();
        // 2. Initialize map view
        const mapView = initializeMapView(canvas);
        // 3. Initialize map controls
        initializeMapControls(mapView, canvas);
        // 4. Create and configure features data source
        const featuresDataSource = await createFeaturesDataSource(mapView);
        // 5. Load and set GeoJSON data
        await loadAndSetGeoJsonData(featuresDataSource);
        // 6. Add background map data source
        addBackgroundDataSource(mapView);
        console.log("Features text icons example initialized successfully");
    }
    catch (error) {
        console.error("Error occurred while initializing features text icons example:", error);
    }
};
// Execute main function
main();
