/* Copyright (C) 2025 flywave.gl contributors */

import {
    MapView,
    GeoCoordinates,
    ellipsoidProjection,
    MapControls,
    MapControlsUI,
    DEMTerrainSource,
    BrushType,
    GeoBox,
    ArcGISTileProvider
} from "@flywave/flywave.gl";
import { RepeatWrapping, TextureLoader } from "three";

const CONFIG = {
    TEXTURE_PATH: "coast_sand_rocks_02.webp",
    DEM_SOURCE_PATH: "dem_terrain/source.json",
    INITIAL_COORDINATES: new GeoCoordinates(36.4, 118.1, 1000),
    ZOOM_LEVEL: 17,
    BRUSH_OPERATIONS: [
        {
            position: new GeoCoordinates(36.39626, 118.09628),
            settings: {
                type: BrushType.RAISE,
                size: 15,
                strength: 0.3,
                hardness: 0.5
            }
        },
        {
            position: new GeoCoordinates(36.39876, 118.09938),
            settings: {
                type: BrushType.RAISE,
                size: 14,
                strength: 30,
                hardness: 0.5
            }
        },
        {
            position: new GeoCoordinates(36.40072, 118.10173),
            settings: {
                type: BrushType.RAISE,
                size: 15,
                strength:303,
                hardness: 0.5
            }
        },
        {
            position: new GeoCoordinates(36.40195, 118.10679),
            settings: {
                type: BrushType.RAISE,
                size: 40,
                strength: 3000,
                hardness: 0.5
            }
        }
    ]
};

const getMapCanvas = id => {
    const canvas = document.getElementById(id);
    if (!canvas) {
        throw new Error(
            `Map canvas element not found, please ensure there is a canvas element with id '${id}' in HTML`
        );
    }
    return canvas;
};

const initializeMapView = canvas => {
    const map = new MapView({
        target: CONFIG.INITIAL_COORDINATES,
        zoomLevel: CONFIG.ZOOM_LEVEL,
        projection: ellipsoidProjection,
        canvas: canvas,
        theme: {
            extends: "resources/tilezen_base.json"
        }
    });

    const controls = new MapControls(map);
    const ui = new MapControlsUI(controls, { zoomLevel: "input" });
    canvas.parentElement.appendChild(ui.domElement);

    return map;
};

const addTerrainModification = heightMapSource => {
    heightMapSource
        .getGroundModificationManager()
        .addModification("replace", CONFIG.BRUSH_OPERATIONS);
};

const addGroundOverlay = heightMapSource => {
    const textureLoader = new TextureLoader();

    const minLat = Math.min(...CONFIG.BRUSH_OPERATIONS.map(op => op.position.latitude));
    const maxLat = Math.max(...CONFIG.BRUSH_OPERATIONS.map(op => op.position.latitude));
    const minLon = Math.min(...CONFIG.BRUSH_OPERATIONS.map(op => op.position.longitude));
    const maxLon = Math.max(...CONFIG.BRUSH_OPERATIONS.map(op => op.position.longitude));

    const southWest = new GeoCoordinates(minLat, minLon);
    const northEast = new GeoCoordinates(maxLat, maxLon);
    const boundingBox = new GeoBox(southWest, northEast);

    textureLoader.load(CONFIG.TEXTURE_PATH, texture => {
        texture.wrapS = RepeatWrapping;
        texture.wrapT = RepeatWrapping;

        heightMapSource.getGroundOverlayProvider().addOverlays([
            {
                geoArea: boundingBox,
                texture
            }
        ]);
    });
};

const configureDEMTerrainSource = mapView => {
    const heightMapSource = new DEMTerrainSource({
        source: CONFIG.DEM_SOURCE_PATH
    });

    addTerrainModification(heightMapSource);

    addGroundOverlay(heightMapSource);

    mapView.setElevationSource(heightMapSource);

    heightMapSource.addWebTileDataSource(
        new ArcGISTileProvider({ minDataLevel: 0, maxDataLevel: 18 })
    );
};

try {
    const canvas = getMapCanvas("mapCanvas");
    const mapView = initializeMapView(canvas);
    configureDEMTerrainSource(mapView);

    console.log("Terrain elevation modification example initialized successfully");
} catch (error) {
    console.error(
        "Error occurred while initializing terrain elevation modification example:",
        error
    );
}
