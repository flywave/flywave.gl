/* Copyright (C) 2026 flywave.gl contributors */

import {
    DrapedLine,
    DrapedPolygon,
    DrapedTarget,
    GeoCoordinates,
    MapControls,
    MapControlsUI,
    MapView,
    DEMTerrainSource,
    ArcGISTileProvider,
    sphereProjection
} from "@flywave/flywave.gl";
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
    // Mountainous area in Shandong Province with visible relief.
    const initialLocation = new GeoCoordinates(36.48619699228674, 118.17270928364879);

    return new MapView({
        projection: sphereProjection,
        target: initialLocation,
        enablePolarDataSource: false,
        zoomLevel: 15,
        tilt: 71.43670140369471,
        heading: -89.40263147840845,
        maxGeometryHeight: 1000,
        canvas,
        theme: {
            extends: "resources/tilezen_base_globe.json",
            atmosphere: {
                enabled: false
            }
        }
    });
};

const configureTerrain = (mapView: MapView): DEMTerrainSource => {
    const demTerrain = new DEMTerrainSource({
        source: "dem_terrain/source.json"
    });
    mapView.setElevationSource(demTerrain);
    demTerrain.addWebTileDataSource(
        new ArcGISTileProvider({
            minDataLevel: 0,
            maxDataLevel: 18
        })
    );
    return demTerrain;
};

/** A polyline crossing the valley and ridges near the initial camera target. */
const LINE_POSITIONS = [
    new GeoCoordinates(36.4822, 118.166),
    new GeoCoordinates(36.4855, 118.1712),
    new GeoCoordinates(36.4879, 118.176),
    new GeoCoordinates(36.4912, 118.1801)
];

/** A quadrilateral fill spanning a slope, plus a small hill-top highlight. */
const POLYGON_OUTER = [
    new GeoCoordinates(36.4808, 118.1702),
    new GeoCoordinates(36.4836, 118.1748),
    new GeoCoordinates(36.4864, 118.173),
    new GeoCoordinates(36.4842, 118.1682)
];

interface GuiParams {
    lineWidth: number;
    lineColor: string;
    showLine: boolean;
    fillColor: string;
    fillOpacity: number;
    showFill: boolean;
    target: "terrain" | "model" | "both";
    debugVolume: boolean;
    fsProbe: number;
    rawLineGeom: boolean;
}

try {
    const canvas = getMapCanvas();
    const mapView = initializeMapView(canvas);
    mapView.beginAnimation();

    const controls = new MapControls(mapView);
    const ui = new MapControlsUI(controls);
    canvas.parentElement!.appendChild(ui.domElement);

    configureTerrain(mapView);

    const capturePass = mapView.surfaceCapture;

    const drapedLine = new DrapedLine(mapView, {
        capturePass,
        positions: LINE_POSITIONS,
        widthPixels: 6,
        color: 0xffdd00,
        heightRanges: { min: -500, max: 2600 },
        target: DrapedTarget.Terrain
    });

    // const drapedPolygon = new DrapedPolygon(mapView, {
    //     capturePass,
    //     outerRing: POLYGON_OUTER,
    //     heightRange: { min: -500, max: 2600 },
    //     color: 0x00cc66,
    //     opacity: 0.55,
    //     target: DrapedTarget.Terrain
    // });

    (window as unknown as { mapView: MapView }).mapView = mapView;

    const params: GuiParams = {
        lineWidth: 6,
        lineColor: "#ffdd00",
        showLine: true,
        fillColor: "#00cc66",
        fillOpacity: 0.55,
        showFill: true,
        target: "terrain",
        debugVolume: false,
        fsProbe: 0,
        rawLineGeom: false,
        lineNoDepth: false
    };

    const gui = new GUI();
    gui.add(params, "lineWidth", 1, 20, 0.5).onChange((value: number) => {
        drapedLine.material.setWidthPixels(value);
        mapView.update();
    });
    gui.addColor(params, "lineColor").onChange((value: string) => {
        drapedLine.material.setColor(value);
        mapView.update();
    });
    gui.add(params, "showLine").onChange((value: boolean) => {
        drapedLine.group.visible = value;
        mapView.update();
    });

    gui.addColor(params, "fillColor").onChange((value: string) => {
        // drapedPolygon.material.setColor(value);
        mapView.update();
    });
    gui.add(params, "fillOpacity", 0.05, 1, 0.05).onChange((value: number) => {
        // drapedPolygon.material.setOpacity(value);
        mapView.update();
    });
    gui.add(params, "showFill").onChange((value: boolean) => {
        // drapedPolygon.group.visible = value;
        mapView.update();
    });

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
            // drapedPolygon.material.setTarget(target);
            mapView.update();
        });

    gui.add(params, "debugVolume")
        .name("show volumes")
        .onChange((value: boolean) => {
            drapedLine.material.setDebugShowVolume(value);
            // drapedPolygon.material.setDebugShowVolume(value);
            mapView.update();
        });

    gui.add(params, "fsProbe", {
        off: 0,
        "1 type": 1,
        "2 depth": 2,
        "3 view dist": 3,
        "4 containment": 4,
        "13 dist field": 13,
        "14 degeneracy": 14,
        "15 self proj": 15
    })
        .name("fs probe")
        .onChange((value: number) => {
            drapedLine.material.setProbe(Number(value));
            // drapedPolygon.material.setProbe(Number(value));
            mapView.update();
        });

    gui.add(params, "rawLineGeom")
        .name("raw line geometry")
        .onChange((value: boolean) => {
            drapedLine.setRawGeometryView(value);
            mapView.update();
        });

    gui.add(params, "lineNoDepth")
        .name("line ignores depth")
        .onChange((value: boolean) => {
            drapedLine.setDepthTestEnabled(!value);
            mapView.update();
        });

    console.log("Draped draw example initialized (line + polygon on DEM terrain)");
} catch (error) {
    console.error("Error occurred while initializing draped draw example:", error);
}
