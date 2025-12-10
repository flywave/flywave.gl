/* Copyright (C) 2025 flywave.gl contributors */

import {
    ArcGISWebTileDataSource,
    ellipsoidProjection,
    GeoCoordinates,
    MapControls,
    MapControlsUI,
    MapView,
    TileRenderDataSource
} from "@flywave/flywave.gl";

/**
 * Get map canvas element
 * @param id ID of HTMLCanvasElement
 * @returns HTMLCanvasElement Map canvas element
 */
const getMapCanvas = (id: string): HTMLCanvasElement => {
    const canvas = document.getElementById(id) as HTMLCanvasElement;
    if (!canvas) {
        throw new Error(`Map canvas element not found, please ensure there is a canvas element with id '${id}' in HTML`);
    }
    return canvas;
};

/**
 * Initialize map view configuration
 * @param canvas Map canvas element
 * @returns Tuple containing MapView and MapControls
 */
const initializeMapView = (canvas: HTMLCanvasElement): [MapView, MapControls] => {
    // Set initial map position and view (Pennsylvania, some location)
    const initialLocation = new GeoCoordinates(40.00269243085496, -75.29281581060715, 10);
    
    const map = new MapView({
        projection: ellipsoidProjection, // Use ellipsoid projection
        target: initialLocation,         // Initial target position
        zoomLevel: 19,                  // Initial zoom level
        canvas: canvas,                 // Specify render canvas
        theme: {
            extends: "resources/tilezen_base_globe.json" // Base theme configuration
        }
    });

    // Instantiate default map controls, allowing users to pan freely
    const controls = new MapControls(map);

    // Add user interface
    const ui = new MapControlsUI(controls, { zoomLevel: "input", projectionSwitch: true });
    canvas.parentElement!.appendChild(ui.domElement);

    // Resize map view to maximize
    map.resize(window.innerWidth, window.innerHeight);

    // Listen for window resize events
    window.addEventListener("resize", () => {
        map.resize(window.innerWidth, window.innerHeight);
    });

    return [map, controls];
};

/**
 * Create Gaussian splat data source
 * @param mapView Map view instance
 * @returns TileRenderDataSource instance
 */
const createGaussianSplatDataSource = (mapView: MapView): TileRenderDataSource => {
    const tileDataSource = new TileRenderDataSource({
        url: "3dtile/gaussianSplatting/tileset.json", // Gaussian splat dataset path
    });
    
    mapView.addDataSource(tileDataSource);
    
    // Get geographic extent and adjust view
    tileDataSource.getGeoExtent().then((extent) => {
        mapView.lookAt({
            bounds: extent, // Adjust view based on data extent
        });
    });
    
    return tileDataSource;
};

/**
 * Add ArcGIS Web tile data source
 * @param mapView Map view instance
 */
const addArcGISWebTileDataSource = (mapView: MapView): void => {
    mapView.addDataSource(new ArcGISWebTileDataSource());
};

// ==================== Main execution flow ====================

try {
    // 1. Get map canvas element
    const canvas = getMapCanvas("mapCanvas");
    
    // 2. Initialize map view and controls
    const [mapView, controls] = initializeMapView(canvas);
    
    // 3. Create Gaussian splat data source
    createGaussianSplatDataSource(mapView);
    
    // 4. Add ArcGIS Web tile data source
    addArcGISWebTileDataSource(mapView);
    
    console.log("3D Tiles Gaussian splat example initialized successfully");
} catch (error) {
    console.error("Error initializing 3D Tiles Gaussian splat example:", error);
}