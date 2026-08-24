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
// Hard-coded input altitude for the test site (~few-hundred-meter terrain):
// removes unknown-elevation from the problem space entirely, matching
// Cesium's requirement that ground-polylines sit near the surface.
const INPUT_ALTITUDE = 620;
const LINE_POSITIONS = [
    new GeoCoordinates(36.4822, 118.166, INPUT_ALTITUDE),
    new GeoCoordinates(36.4855, 118.1712, INPUT_ALTITUDE),
    new GeoCoordinates(36.4879, 118.176, INPUT_ALTITUDE),
    new GeoCoordinates(36.4912, 118.1801, INPUT_ALTITUDE)
];

/** A quadrilateral fill spanning a slope, plus a small hill-top highlight.
 * Uses the configuration from when the fill was verified working:
 * nodes at 350 m with the tall Cesium-like span -500..+2600. */
const POLYGON_ALTITUDE = 350;
const POLYGON_OUTER = [
    new GeoCoordinates(36.4808, 118.1702, POLYGON_ALTITUDE),
    new GeoCoordinates(36.4836, 118.1748, POLYGON_ALTITUDE),
    new GeoCoordinates(36.4864, 118.173, POLYGON_ALTITUDE),
    new GeoCoordinates(36.4842, 118.1682, POLYGON_ALTITUDE)
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
    depthMode: string;
    rawLineGeom: boolean;
    depthGate: boolean;
    lineNoDepth: boolean;
}

try {
    const canvas = getMapCanvas();
    const mapView = initializeMapView(canvas);
    mapView.beginAnimation();

    const controls = new MapControls(mapView);
    const ui = new MapControlsUI(controls);
    canvas.parentElement!.appendChild(ui.domElement);

    const demTerrain = configureTerrain(mapView);

    const capturePass = mapView.surfaceCapture;

    // Mutable so the DEM span-fit button can retarget volume extent and
    // node altitude in one place; `setPositions` re-reads these options.
    const lineOptions = {
        capturePass,
        positions: LINE_POSITIONS,
        widthPixels: 6,
        color: 0xffdd00,
        heightRanges: { min: -620, max: 80 } as { min: number; max: number },
        target: DrapedTarget.Terrain
    };
    const drapedLine = new DrapedLine(mapView, lineOptions);

    const drapedPolygon = new DrapedPolygon(mapView, {
        capturePass,
        outerRing: POLYGON_OUTER,
        heightRange: { min: -500, max: 2600 },
        color: 0xff00ff,
        opacity: 0.9,
        target: DrapedTarget.Terrain
    });

    // Per-point terrain lift: once DEM tiles are loaded, replace the
    // hard-coded altitude with each vertex's real height so the curtain
    // genuinely follows the terrain profile. One-time init data prep.
    let liftDone = false;
    const tryLift = (): boolean => {
        if (liftDone) return true;
        const provider = mapView.elevationProvider ?? demTerrain.getElevationProvider();
        if (!provider) return false;
        const probe = new GeoCoordinates(LINE_POSITIONS[0].latitude, LINE_POSITIONS[0].longitude);
        const h0 = provider.getHeight(probe);
        if (h0 === undefined || h0 <= 0) return false;
        const lift = (list: GeoCoordinates[]): GeoCoordinates[] =>
            list.map(
                g => new GeoCoordinates(g.latitude, g.longitude, (provider.getHeight(g) ?? h0) + 2)
            );
        drapedLine.setPositions(lift(LINE_POSITIONS));
        drapedPolygon.setBoundary(lift(POLYGON_OUTER));
        liftDone = true;
        console.log("[draped] vertices lifted onto terrain");
        return true;
    };
    (window as unknown as { mapView: MapView }).mapView = mapView;
    document.title = "draped-P8";
    console.log("[example-build] P8 magenta-face");

    const params: GuiParams = {
        depthMode: "raw (d)",
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
        depthGate: true,
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
        drapedPolygon.group.visible = value;
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
            drapedPolygon.material.setTarget(target);
            mapView.update();
        });

    gui.add(params, "debugVolume")
        .name("show volumes")
        .onChange((value: boolean) => {
            drapedLine.material.setDebugShowVolume(value);
            drapedPolygon.material.setDebugShowVolume(value);
            mapView.update();
        });

    gui.add(params, "fsProbe", {
        off: 0,
        "1 type": 1,
        "2 depth": 2,
        "3 view dist": 3,
        "4 containment": 4,
        "5 wall match": 5,
        "6 planes": 6
    })
        .name("fs probe")
        .onChange((value: number) => {
            drapedLine.material.setProbe(Number(value));
            drapedPolygon.material.setProbe(Number(value));
            // drapedPolygon.material.setProbe(Number(value));
            mapView.update();
        });

    gui.add(params, "rawLineGeom")
        .name("raw line geometry")
        .onChange((value: boolean) => {
            drapedLine.setRawGeometryView(value);
            mapView.update();
        });

    gui.add(params, "depthGate")
        .name("depth gate")
        .onChange((value: boolean) => {
            (
                drapedLine.material as unknown as { setDepthGateEnabled(v: boolean): void }
            ).setDepthGateEnabled(value);
            mapView.update();
        });

    gui.add(
        {
            lift: () => {
                const ok = tryLift();
                console.log(
                    ok ? "[draped] lifted onto terrain" : "[draped] elevation provider not ready"
                );
            }
        },
        "lift"
    ).name("① lift to terrain");

    gui.add(
        {
            rawCurtain: () => {
                (
                    drapedLine.material as unknown as { applyDebugOverride(l: number): void }
                ).applyDebugOverride(1);
                console.log("[draped] raw curtain mode (refresh page to restore)");
            }
        },
        "rawCurtain"
    ).name("show raw curtain");

    gui.add(
        {
            fitSpan: () => {
                const provider = mapView.elevationProvider ?? demTerrain.getElevationProvider();
                if (!provider) {
                    console.log("[draped] elevation provider not ready");
                    return;
                }
                let minH = Infinity;
                let maxH = -Infinity;
                let valid = false;
                for (let i = 0; i + 1 < LINE_POSITIONS.length; i++) {
                    const a = LINE_POSITIONS[i];
                    const b = LINE_POSITIONS[i + 1];
                    for (let k = 0; k <= 200; k++) {
                        const t = k / 200;
                        const g = new GeoCoordinates(
                            a.latitude + (b.latitude - a.latitude) * t,
                            a.longitude + (b.longitude - a.longitude) * t
                        );
                        const h = provider.getHeight(g);
                        if (h !== undefined && h !== null) {
                            valid = true;
                            if (h < minH) minH = h;
                            if (h > maxH) maxH = h;
                        }
                    }
                }
                if (!valid) {
                    console.log("[draped] no DEM samples yet");
                    return;
                }
                const mid = (minH + maxH) / 2;
                const span = (maxH - minH) / 2 + 40;
                lineOptions.heightRanges = { min: -span, max: span };
                lineOptions.positions = LINE_POSITIONS.map(
                    p => new GeoCoordinates(p.latitude, p.longitude, mid)
                );
                drapedLine.setPositions(lineOptions.positions);
                console.log(`[draped] span fitted: alt ${mid.toFixed(0)}m +- ${span.toFixed(0)}m`);
            }
        },
        "fitSpan"
    ).name("② fit span (DEM)");

    // Auto-fit once DEM tiles are ready (Cesium computes min/maxTerrainHeight
    // at geometry creation; ours is a one-time input-prep pass, expand-only).

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
