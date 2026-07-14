/*
 * Copyright (C) 2025 flywave.gl contributors.
 * SPDX-License-Identifier: Apache-2.0
 */

import {
    MapView,
    GeoCoordinates,
    MapControls,
    MapControlsUI,
    FeaturesDataSource,
    ArcGISWebTileDataSource,
    TransferManager,
    FeatureCollection,
    ellipsoidProjection
} from "@flywave/flywave.gl";

/**
 * Get map canvas element
 * @returns HTMLCanvasElement Map canvas element
 */
const getMapCanvas = (): HTMLCanvasElement => {
    const canvas = document.getElementById("mapCanvas") as HTMLCanvasElement;
    if (!canvas) {
        throw new Error(
            "Map canvas element not found, please ensure there is a canvas element with id 'mapCanvas' in HTML"
        );
    }
    return canvas;
};

/**
 * Initialize map view configuration
 * @param canvas Map canvas element
 * @returns Configured MapView instance
 */
const initializeMapView = (canvas: HTMLCanvasElement): MapView => {
    // Set initial map position and viewpoint (Beijing coordinates)
    const initialLocation = new GeoCoordinates(36.68888228182142, 117.111025517555);

    return new MapView({
        canvas: canvas, // Specify render canvas
        target: initialLocation, // Initial target position
        projection: ellipsoidProjection,
        zoomLevel: 14, // Initial zoom level
        theme: {
            extends: "resources/tilezen_base.json", // Base theme configuration

            definitions: {
                defaultTextStyle: {
                    color: "#000000",
                    backgroundColor: "#ffffff",
                    backgroundSize: 2,
                    fontSize: 20,
                    fontName: "Noto Sans",
                    fontStyle: "Bold"
                }
            },
            styles: {
                "user-features": [
                    {
                        when: ["==", ["geometry-type"], "Point"],
                        technique: "labeled-icon",
                        attr: {
                            text: ["get", "name"],
                            color: "#000000",
                            backgroundColor: "#ffffff",
                            backgroundOpacity: 1.0,
                            backgroundSize: 2,
                            imageTexture: "circle-stroked-11",
                            iconScale: 1.0,
                            size: 14,
                            vAlignment: "Center",
                            hAlignment: "Left"
                        }
                    },
                    {
                        when: ["==", ["geometry-type"], "LineString"],
                        technique: "solid-line",
                        attr: {
                            color: "#F59E0B",
                            outlineWidth: 2,
                            metricUnit: "Pixel",
                            lineWidth: 3,
                            outlineColor: "#78350F"
                        }
                    },
                    {
                        when: ["==", ["geometry-type"], "LineString"],
                        technique: "text",
                        attr: {
                            text: ["get", "name"],
                            color: "#000000",
                            backgroundColor: "#ffffff",
                            backgroundOpacity: 1.0,
                            backgroundSize: 2,
                            size: 14,
                            fontName: "default",
                            fontStyle: "Bold",
                            priority: 95,
                            vAlignment: "Above",
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
const initializeMapControls = (mapView: MapView, canvas: HTMLCanvasElement): void => {
    const mapControls = new MapControls(mapView);
    const mapControlsUI = new MapControlsUI(mapControls);
    canvas.parentElement!.appendChild(mapControlsUI.domElement);
};

/**
 * Create features data source
 * @param mapView Map view instance
 * @returns FeaturesDataSource instance
 */
const createFeaturesDataSource = async (mapView: MapView): Promise<FeaturesDataSource> => {
    const featuresDataSource = new FeaturesDataSource({
        styleSetName: "user-features", // Style set name
        maxDataLevel: 20 // Maximum data level
    });

    // Add data source to map view
    await mapView.addDataSource(featuresDataSource);

    return featuresDataSource;
};

/**
 * Load and set GeoJSON data
 * @param featuresDataSource Features data source
 */
const loadAndSetGeoJsonData = async (featuresDataSource: FeaturesDataSource): Promise<void> => {
    try {
        // Load data from GeoJSON file
        const geojsonData: FeatureCollection = await TransferManager.instance().downloadJson(
            "complex-features.json"
        );

        // Filter out features without names
        geojsonData.features = geojsonData.features.filter(feature => {
            return feature.properties?.name !== undefined;
        });

        // Add GeoJSON data to FeaturesDataSource
        featuresDataSource.setFromGeojson(geojsonData);

        console.log("GeoJSON data loaded successfully");
    } catch (error) {
        console.error("Error loading GeoJSON data:", error);
    }
};

/**
 * Add background map data source
 * @param mapView Map view instance
 */
const addBackgroundDataSource = (mapView: MapView): void => {
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
    } catch (error) {
        console.error("Error occurred while initializing features text icons example:", error);
    }
};

// Execute main function
main();
