/* Copyright (C) 2026 flywave.gl contributors */

import {
    CesiumIonDataSource,
    DEMTerrainSource,
    DrapedLine,
    DrapedPolygon,
    DrapedTarget,
    GeoCoordinates,
    MapControls,
    MapControlsUI,
    MapView,
    ellipsoidProjection
} from "@flywave/flywave.gl";
import { CESIUM_ION_TOKEN } from "../token-config";
import { GUI } from "dat.gui";

const CANVAS_ID = "mapCanvas";

const getMapCanvas = (): HTMLCanvasElement => {
    const canvas = document.getElementById(CANVAS_ID) as HTMLCanvasElement;
    if (!canvas) {
        throw new Error(`Map canvas element not found (need <canvas id='${CANVAS_ID}'>)`);
    }
    return canvas;
};

const initializeMapView = (canvas: HTMLCanvasElement): MapView => {
    // Manhattan waterfront: terrain relief plus streamed building models.
    const initialLocation = new GeoCoordinates(40.6959, -74.0162, 40);

    return new MapView({
        projection: ellipsoidProjection,
        target: initialLocation,
        zoomLevel: 17,
        tilt: 68,
        heading: 35.1,
        canvas,
        maxGeometryHeight:1000,
        theme: {
            extends: "resources/tilezen_base_globe.json"
        }
    });
};

const configureTerrain = (mapView: MapView): void => {
    mapView.setElevationSource(
        new DEMTerrainSource({
            source: "dem_terrain/source.json"
        })
    );
};

const configureBuildings = (mapView: MapView): void => {
    mapView.addDataSource(
        new CesiumIonDataSource({
            accessToken: CESIUM_ION_TOKEN,
            assetId: 75343
        })
    );
};

/** A line crossing the shoreline: partly over terrain, partly over buildings. */
const LINE_POSITIONS = [
    new GeoCoordinates(40.6975, -74.0188),
    new GeoCoordinates(40.6962, -74.0162),
    new GeoCoordinates(40.6949, -74.0135)
];

const POLYGON_OUTER = [
    new GeoCoordinates(40.6942, -74.0172),
    new GeoCoordinates(40.6954, -74.015),
    new GeoCoordinates(40.6938, -74.0128),
    new GeoCoordinates(40.6927, -74.0151)
];

interface GuiParams {
    target: "terrain" | "model" | "both";
    lineWidth: number;
    debugVolume: boolean;
}

try {
    const canvas = getMapCanvas();
    const mapView = initializeMapView(canvas);
    mapView.beginAnimation();

    const controls = new MapControls(mapView);
    const ui = new MapControlsUI(controls);
    canvas.parentElement!.appendChild(ui.domElement);

    configureTerrain(mapView);
    configureBuildings(mapView);

    const capturePass = mapView.surfaceCapture;

    const drapedLine = new DrapedLine(mapView, {
        capturePass,
        positions: LINE_POSITIONS,
        widthPixels: 8,
        color: 0xff5533,
        heightRanges: { min: -60, max: 400 },
        target: DrapedTarget.Both
    });

    const drapedPolygon = new DrapedPolygon(mapView, {
        capturePass,
        outerRing: POLYGON_OUTER,
        heightRange: { min: -60, max: 400 },
        color: 0x3388ff,
        opacity: 0.5,
        target: DrapedTarget.Both
    });

    const params: GuiParams = {
        target: "both",
        lineWidth: 8,
        debugVolume: false
    };

    const gui = new GUI();
    gui.add(params, "target", ["terrain", "model", "both"])
        .name("drape target")
        .onChange((value: string) => {
            const target =
                value === "terrain"
                    ? DrapedTarget.Terrain
                    : value === "model"
                    ? DrapedTarget.Model
                    : DrapedTarget.Both;
            drapedLine.material.setTarget(target);
            drapedPolygon.material.setTarget(target);
            mapView.update();
        });
    gui.add(params, "lineWidth", 1, 20, 0.5).onChange((value: number) => {
        drapedLine.material.setWidthPixels(value);
        mapView.update();
    });
    gui.add(params, "debugVolume")
        .name("show volumes")
        .onChange((value: boolean) => {
            drapedLine.material.setDebugShowVolume(value);
            drapedPolygon.material.setDebugShowVolume(value);
            mapView.update();
        });

    console.log("Draped classification example initialized (terrain + model targets)");
} catch (error) {
    console.error("Error occurred while initializing draped classification example:", error);
}
