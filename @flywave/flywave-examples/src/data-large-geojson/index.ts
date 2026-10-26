/* Copyright (C) 2025 flywave.gl contributors */

/**
 * Large GeoJSON example (v2): 10k–100k generated points through the vector
 * tile pipeline, with a performance HUD.
 *
 * How it stays fast:
 * - `GeoJsonDataProvider(name, geojson)` accepts the parsed document directly
 *   (`input: URL | GeoJson`), so the dataset never hits the network;
 * - the provider registers the collection with the worker-side GeoJSON tiler
 *   (geojson-vt style binning). That is the point of client-side tiling: the
 *   view only decodes the subset of features inside each *visible* tile, per
 *   level of detail, and evicts far-away tiles through the tile cache — a
 *   single monolithic layer would decode and upload all 100k points at once;
 * - the `circles` technique (like `squares`, a GPU point technique rendering
 *   one vertex per feature — see `PointTechniqueParams`: `color`, `size`,
 *   `opacity`) draws all points cheaply. `labeled-icon` would additionally
 *   lay out one text label per point, which drowns the text engine at this
 *   scale — worth trying at 10k, painful at 100k;
 * - the point cloud is generated synchronously in one pass (a seeded PRNG,
 *   so every rebuild is identical): 100k `{type:"Point"}` features cost on
 *   the order of a hundred milliseconds, done before the layer is attached,
 *   so the frame loop never stutters on data creation.
 */

import { type GUI } from "dat.gui";

import {
    type FeatureCollection,
    type MapView,
    type Theme,
    CopyrightElementHandler,
    GeoCoordinates,
    GeoJsonDataProvider,
    GeoJsonDataSource,
    MapViewEventNames
} from "@flywave/flywave.gl";

import {
    applyPanelStyle,
    createExampleGui,
    createExampleMap,
    createImageryWithFallback,
    DebugGridDataSource,
    demoImagery,
    logExampleInfo
} from "../common";

/** Scene center: Jinan, Shandong — points are scattered around it. */
const CENTER = new GeoCoordinates(36.651, 117.12);

/** Spread of the generated cloud, in degrees (about 45 x 55 km). */
const LNG_SPAN = 0.5;
const LAT_SPAN = 0.4;

/** Deterministic PRNG so every rebuild produces the identical cloud. */
function mulberry32(seed: number): () => number {
    let a = seed;
    return () => {
        a |= 0;
        a = (a + 0x6d2b79f5) | 0;
        let t = Math.imul(a ^ (a >>> 15), 1 | a);
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

/**
 * Generate `count` named points around Jinan in one synchronous pass.
 *
 * @returns The collection plus the generation time in milliseconds.
 */
function buildPointGeojson(count: number): { geojson: FeatureCollection; generationMs: number } {
    const startedAt = performance.now();
    const random = mulberry32(0x661a4e);
    const features = new Array<FeatureCollection["features"][number]>(count);
    for (let i = 0; i < count; i++) {
        features[i] = {
            type: "Feature",
            geometry: {
                type: "Point",
                coordinates: [
                    CENTER.lng + (random() - 0.5) * LNG_SPAN,
                    CENTER.lat + (random() - 0.5) * LAT_SPAN
                ]
            },
            properties: { name: `POI ${i + 1}` }
        };
    }
    return {
        geojson: { type: "FeatureCollection", features },
        generationMs: performance.now() - startedAt
    };
}

/** Theme: tilezen base plus a GPU point style for the generated cloud. */
function createBulkTheme(): Theme {
    return {
        extends: "resources/tilezen_base_globe.json",
        // Light sky so theme-only scenes read as a bright stage (base theme sky is deep blue).
        sky: {
            type: "gradient",
            topColor: "#9EC5E6",
            bottomColor: "#E9EDF2",
            groundColor: "#C8CEC8"
        },
        clearColor: "#DDE3EA",
        styles: {
            "bulk-points": [
                {
                    when: ["==", ["geometry-type"], "Point"],
                    technique: "circles",
                    attr: { color: "#F43F5E", size: 5, opacity: 0.6 }
                }
            ]
        }
    };
}

/** Currently attached layer (removed before the next one is added). */
let currentSource: GeoJsonDataSource | null = null;

/**
 * Build and attach one dataset of `count` points.
 *
 * @returns Timing numbers for the HUD; `addMs` covers provider registration
 * plus data source connect, `firstRenderMs` the wait for the first rendered
 * frame that shows the new layer.
 */
async function addBulkLayer(
    mapView: MapView,
    count: number
): Promise<{ generationMs: number; addMs: number; firstRenderMs: number }> {
    if (currentSource !== null) {
        // Data source names are unique per map; remove before re-adding.
        await mapView.removeDataSource(currentSource);
        currentSource = null;
    }
    const { geojson, generationMs } = buildPointGeojson(count);

    const name = `bulk-points-${count}`;
    const source = new GeoJsonDataSource({
        name,
        styleSetName: "bulk-points",
        maxDataLevel: 20,
        dataProvider: new GeoJsonDataProvider(name, geojson)
    });

    const timings = { generationMs, addMs: 0, firstRenderMs: 0 };
    const firstFrame = { startedAt: performance.now(), pending: true };
    const onFirstRender = (): void => {
        if (firstFrame.pending) {
            timings.firstRenderMs = performance.now() - firstFrame.startedAt;
            firstFrame.pending = false;
        }
    };

    mapView.addEventListener(MapViewEventNames.AfterRender, onFirstRender);
    try {
        const addStartedAt = performance.now();
        await mapView.addDataSource(source);
        timings.addMs = performance.now() - addStartedAt;
        currentSource = source;
    } finally {
        mapView.removeEventListener(MapViewEventNames.AfterRender, onFirstRender);
    }
    return timings;
}

/** Example entry: offline map, debug-grid ground, bulk points, perf HUD. */
async function main(): Promise<void> {
    const canvas = document.getElementById("mapCanvas") as HTMLCanvasElement;

    const { mapView } = await createExampleMap(canvas, {
        themeObject: createBulkTheme(),
        lookAt: { target: { lat: CENTER.lat, lng: CENTER.lng }, zoomLevel: 12 }
    });
    logExampleInfo("data-large-geojson", mapView);
    CopyrightElementHandler.install("copyrightNotice", mapView);

    // Imagery ground layer with offline debug-grid fallback.
    await createImageryWithFallback(mapView, demoImagery({ provider: "arcgis" }));

    // Offline ground reference: red outlines show the client-side tiles the
    // tiler fills with point subsets.
    await mapView.addDataSource(new DebugGridDataSource());
    mapView.update();

    const hud = document.createElement("div");
    Object.assign(hud.style, {
        position: "absolute",
        left: "16px",
        bottom: "16px",
        padding: "8px 12px",
        color: "#fff",
        font: "12px/1.5 monospace",
        whiteSpace: "pre-wrap"
    } as CSSStyleDeclaration);
    applyPanelStyle(hud);
    document.body.appendChild(hud);

    // Performance HUD: timings from the last rebuild plus a frames-per-second
    // counter. The engine renders on demand, so FPS is meaningful only while
    // the camera moves or tiles load — an idle map honestly reports "idle".
    let frames = 0;
    let fps = 0;
    let lastTimings = { generationMs: 0, addMs: 0, firstRenderMs: 0 };
    mapView.addEventListener(MapViewEventNames.AfterRender, () => {
        frames += 1;
    });
    const refreshHud = (pointCount: number): void => {
        hud.textContent =
            `points ${pointCount} | gen ${lastTimings.generationMs.toFixed(0)} ms | ` +
            `add ${lastTimings.addMs.toFixed(0)} ms | first render ` +
            `${lastTimings.firstRenderMs.toFixed(0)} ms | ${fps} fps`;
    };
    let currentCount = 0;
    setInterval(() => {
        fps = frames;
        frames = 0;
        if (currentSource !== null) {
            refreshHud(currentCount);
        }
    }, 1000);

    const gui: GUI = createExampleGui();
    applyPanelStyle(gui.domElement);
    const folder = gui.addFolder("Bulk Dataset");

    const state = { points: 50000, busy: false };
    folder.add(state, "points", 10000, 100000, 10000);
    folder
        .add(
            {
                rebuild: () => {
                    if (state.busy) {
                        return;
                    }
                    state.busy = true;
                    const count = Math.round(state.points);
                    void addBulkLayer(mapView, count).then(timings => {
                        lastTimings = timings;
                        currentCount = count;
                        refreshHud(count);
                        state.busy = false;
                    });
                }
            },
            "rebuild"
        )
        .name("Rebuild dataset");
    folder.open();

    const initialCount = Math.round(state.points);
    void addBulkLayer(mapView, initialCount).then(timings => {
        lastTimings = timings;
        currentCount = initialCount;
        refreshHud(initialCount);
    });
}

void main();
