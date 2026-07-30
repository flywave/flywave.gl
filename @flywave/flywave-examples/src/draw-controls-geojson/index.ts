/*
 * Copyright (C) 2025 flywave.gl contributors.
 * SPDX-License-Identifier: Apache-2.0
 */

import {
    MapView,
    GeoCoordinates,
    ellipsoidProjection,
    MapControls,
    MapControlsUI,
    CesiumWorldTerrainSource,
    ArcGISTileProvider
} from "@flywave/flywave.gl";

import { GeoJSONDrawControls, DrawMode } from "@flywave/flywave-draw-controls";

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
    const initialLocation = new GeoCoordinates(22.404942179523914, 109.02507529895595);

    return new MapView({
        projection: ellipsoidProjection,
        canvas: canvas,
        target: initialLocation,
        enablePolarDataSource: false,
        zoomLevel: 14,
        tilt: 45,
        heading: 0,
        theme: {
            extends: "resources/tilezen_base_globe.json",
            atmosphere: {
                enabled: true
            }
        }
    });
};

/**
 * Initialize map control component
 * @param mapView Map view instance
 * @param canvas Map canvas element
 * @returns MapControls instance
 */
const initializeMapControls = (mapView: MapView, canvas: HTMLCanvasElement): MapControls => {
    const mapControls = new MapControls(mapView);
    const mapControlsUI = new MapControlsUI(mapControls);
    canvas.parentElement!.appendChild(mapControlsUI.domElement);
    return mapControls;
};

/**
 * Configure elevation data source with satellite imagery
 * @param mapView Map view instance
 * @returns Configured elevation data source
 */
const configureElevationSource = (mapView: MapView): CesiumWorldTerrainSource => {
    const cesiumIonDataSource = new CesiumWorldTerrainSource({
        accessToken: CESIUM_ION_TOKEN,
        assetId: 1
    });

    mapView.setElevationSource(cesiumIonDataSource);

    cesiumIonDataSource.addWebTileDataSource(
        new ArcGISTileProvider({
            minDataLevel: 0,
            maxDataLevel: 18
        })
    );

    return cesiumIonDataSource;
};

/**
 * Create sample GeoJSON data
 * @returns GeoJSON FeatureCollection
 */
const createSampleGeoJSON = () => {
    return {
        type: "FeatureCollection" as const,
        features: [
            {
                type: "Feature" as const,
                properties: {
                    id: "line-1",
                    name: "Guilin Route"
                },
                geometry: {
                    type: "LineString" as const,
                    coordinates: [
                        [109.02507529895595, 22.404942179523914, 446.90112945530564],
                        [109.02907315802219, 22.40139448484383, 462.78419860452414],
                        [109.03212918907052, 22.398645455179835, 428.82361342478544],
                        [109.03131387590265, 22.39676317102972, 474.2694490244612],
                        [109.03039293306104, 22.394955466052163, 491.9899737695232],
                        [109.02896042591563, 22.394541139537225, 509.1668309541419],
                        [109.02814003868731, 22.394092936886747, 486.25206287484616],
                        [109.02081280261756, 22.39983029930943, 495.4627674985677],
                        [109.02486902365864, 22.40453119147113, 451.3709516366944]
                    ]
                }
            }
        ]
    };
};

/**
 * Create UI controls for drawing
 * @param drawControls GeoJSONDrawControls instance
 */
const createDrawingUI = (drawControls: GeoJSONDrawControls): void => {
    const controlPanel = document.createElement("div");
    controlPanel.style.position = "absolute";
    controlPanel.style.top = "10px";
    controlPanel.style.right = "10px";
    controlPanel.style.backgroundColor = "white";
    controlPanel.style.padding = "15px";
    controlPanel.style.borderRadius = "5px";
    controlPanel.style.boxShadow = "0 2px 5px rgba(0,0,0,0.3)";
    controlPanel.style.zIndex = "1000";

    const title = document.createElement("h3");
    title.textContent = "Draw Controls";
    title.style.margin = "0 0 10px 0";
    title.style.fontSize = "16px";
    controlPanel.appendChild(title);

    const createButton = (text: string, onClick: () => void): void => {
        const button = document.createElement("button");
        button.textContent = text;
        button.style.display = "block";
        button.style.width = "100%";
        button.style.margin = "5px 0";
        button.style.padding = "8px";
        button.style.backgroundColor = "#2C7BE5";
        button.style.color = "white";
        button.style.border = "none";
        button.style.borderRadius = "3px";
        button.style.cursor = "pointer";
        button.style.fontSize = "12px";
        button.onclick = onClick;
        controlPanel.appendChild(button);
    };

    createButton("Draw Point", () => {
        drawControls.setMode(DrawMode.POINT);
    });

    createButton("Draw Line", () => {
        drawControls.setMode(DrawMode.LINE);
    });

    createButton("Draw Polygon", () => {
        drawControls.setMode(DrawMode.POLYGON);
    });

    createButton("Edit Mode", () => {
        drawControls.setMode(DrawMode.EDIT);
    });

    createButton("Clear All", () => {
        drawControls.clearAll();
    });

    const exportButton = document.createElement("button");
    exportButton.textContent = "Export GeoJSON";
    exportButton.style.display = "block";
    exportButton.style.width = "100%";
    exportButton.style.margin = "5px 0";
    exportButton.style.padding = "8px";
    exportButton.style.backgroundColor = "#28a745";
    exportButton.style.color = "white";
    exportButton.style.border = "none";
    exportButton.style.borderRadius = "3px";
    exportButton.style.cursor = "pointer";
    exportButton.style.fontSize = "12px";
    exportButton.onclick = () => {
        const geoJSON = drawControls.exportToGeoJSON();
        console.log("Exported GeoJSON:", JSON.stringify(geoJSON, null, 2));
        alert("GeoJSON exported to console!");
    };
    controlPanel.appendChild(exportButton);

    document.body.appendChild(controlPanel);
};

// ==================== Main execution flow ====================

const main = async () => {
    try {
        const canvas = getMapCanvas();

        const mapView = initializeMapView(canvas);

        const mapControls = initializeMapControls(mapView, canvas);

        const elevationDataSource = configureElevationSource(mapView);

        const drawControls = new GeoJSONDrawControls(mapView, mapControls);

        createDrawingUI(drawControls);

        const sampleGeoJSON = createSampleGeoJSON();
        const count = drawControls.addGeoJSON(sampleGeoJSON);
        console.log(`Successfully loaded ${count} GeoJSON objects`);

        mapView.beginAnimation();

        console.log("Draw Controls GeoJSON example initialized successfully");
        console.log("Use the control panel to draw new shapes or edit existing ones");
    } catch (error) {
        console.error("Error occurred while initializing draw controls GeoJSON example:", error);
    }
};

main();
