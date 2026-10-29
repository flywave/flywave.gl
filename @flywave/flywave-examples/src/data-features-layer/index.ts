/* Copyright (C) 2025 flywave.gl contributors */

/**
 * Runtime features example (v2): `FeaturesDataSource` keeps an in-memory
 * GeoJSON collection that can be modified at any time while the map is live.
 *
 * What it shows:
 * - a "user-features" style set teaching the basic techniques
 *   (`labeled-icon` for points, `solid-line` + `text` for lines, plus a
 *   lightweight `fill` for polygons), selected with `when` geometry-type
 *   filters;
 * - loading a GeoJSON file into the data source with
 *   `FeaturesDataSource.setFromGeojson`;
 * - **runtime add/remove**: GUI buttons create `MapViewPointFeature` /
 *   `MapViewLineFeature` / `MapViewPolygonFeature` objects and push them into
 *   (or pop them out of) the data source with `FeaturesDataSource.add()` /
 *   `remove()` — the data source re-tiles itself, so no manual
 *   `mapView.update()` is needed for data changes.
 */

import { type GUI } from "dat.gui";

import {
    type FeatureCollection,
    type LineCaps,
    type MapViewFeature,
    type Style,
    type Theme,
    FeaturesDataSource,
    GeoCoordinates,
    MapViewLineFeature,
    MapViewPointFeature,
    MapViewPolygonFeature,
    TransferManager
} from "@flywave/flywave.gl";

import {
    applyPanelStyle,
    createExampleGui,
    createExampleMap,
    logExampleInfo
} from "../common";

/** Scene center: the Forbidden City, Beijing (matches `complex-features.json`). */
const CENTER = new GeoCoordinates(39.9135, 116.3975);

/** Demo GeoJSON served from the examples' `resources/` root. */
const DATA_URL = "complex-features.json";

/** dat.GUI is re-exported by the aggregate package for example use. */
type Gui = import("dat.gui").GUI;

/** Theme object: base tilezen look plus the inline "user-features" style set. */
function createUserFeaturesTheme(
    lineWidthPx = 4,
    caps: LineCaps = "Round",
    withText = true
): Theme {
    return {
        extends: "resources/tilezen_base_globe.json",
        atmosphere: { enabled: true },
        // Lighting note: the factory clears theme lights on globes
        // (applyGlobeLightingRule) — the atmosphere sun lights the scene.
        sky: { type: "gradient", topColor: "#BFD9EF", bottomColor: "#E9EDF2", groundColor: "#DDE3EA" },
        clearColor: "#DDE3EA",
        definitions: {
            defaultTextStyle: {
                color: "#1F2933",
                backgroundOpacity: 0,
                fontSize: 26,
                fontName: "Noto Sans",
                fontStyle: "Bold"
            }
        },
        styles: {
            "user-features": [
                {
                    // OSM buildings: extrude by the real `height` tag, with a
                    // fallback for features lacking one.
                    when: [
                        "all",
                        ["==", ["geometry-type"], "Polygon"],
                        ["any", ["has", "building"], ["has", "building:part"]]
                    ],
                    technique: "extruded-polygon",
                    attr: {
                        height: ["coalesce", ["get", "height"], 8],
                        color: "#C9D3DC",
                        footprint: true,
                        lineColor: "#46586A",
                        lineWidth: 1.5
                    }
                },
                {
                    // Road network: solid-line ribbons in pixel units (with the
                    // outline/dash capabilities of the solid-line material).
                    when: ["==", ["geometry-type"], "LineString"],
                    technique: "solid-line",
                    attr: {
                        color: "#FF8C1A",
                        opacity: 1,
                        lineWidth: lineWidthPx,
                        metricUnit: "Pixel",
                        caps
                    }
                },
                ...(withText
                    ? ([
                          {
                              // Road names rendered along the line geometry.
                              when: ["==", ["geometry-type"], "LineString"],
                              technique: "text",
                              attr: {
                                  text: ["get", "name"],
                                  color: "#7C3A03",
                                  size: 20,
                                  fontName: "default",
                                  fontStyle: "Bold",
                                  priority: 90,
                                  vAlignment: "Center",
                                  hAlignment: "Center"
                              }
                          }
                      ] as Style[])
                    : []),
                {
                    when: ["==", ["geometry-type"], "Point"],
                    technique: "labeled-icon" as const,
                    attr: {
                        text: ["get", "name"],
                        color: "#1F2933",
                        backgroundOpacity: 0,
                        imageTexture: "circle-stroked-11",
                        iconScale: 1.0,
                        size: 24,
                        vAlignment: "Center",
                        hAlignment: "Left"
                    }
                }
            ]
        }
    };
}
/**
 * Create the runtime features data source. `styleSetName` binds it to the
 * "user-features" style set declared in the theme above.
 */
async function createFeaturesDataSource(mapView: Awaited<ReturnType<typeof createExampleMap>>["mapView"]) {
    const featuresDataSource = new FeaturesDataSource({
        styleSetName: "user-features",
        maxDataLevel: 20
    });
    await mapView.addDataSource(featuresDataSource);
    return featuresDataSource;
}

/** Load the demo GeoJSON file and hand it to the data source. */
async function loadInitialData(featuresDataSource: FeaturesDataSource): Promise<number> {
    const geojsonData: FeatureCollection = await TransferManager.instance().downloadJson(DATA_URL);
    // Keep only features that carry a name: the styles above label by "name".
    geojsonData.features = geojsonData.features.filter(
        feature => feature.properties?.name !== undefined
    );
    // The OSM data carries true-asl elevation in the coordinate z (~40m for
    // Beijing). This page has no terrain, so features would float ~40m above
    // the ground plane — flatten every coordinate to a small positive offset
    // (2m avoids z-fighting with the ground plane at 0).
    const flatten = (coords: number[] | number[][] | number[][][]): void => {
        if (typeof coords[0] === "number") {
            coords[2] = 2;
            return;
        }
        for (const c of coords as number[][]) {
            flatten(c);
        }
    };
    for (const feature of geojsonData.features) {
        if (feature.geometry.type === "GeometryCollection") {
            continue;
        }
        flatten(feature.geometry.coordinates as number[] | number[][] | number[][][]);
    }
    featuresDataSource.setFromGeojson(geojsonData);
    return geojsonData.features.length;
}

/** Mutable state shared by the GUI and the count HUD. */
interface IRuntimeState {
    /** Features added at runtime, in insertion order (stack for "remove last"). */
    readonly added: MapViewFeature[];
    /** Monotonic counter used to name generated features. */
    counter: number;
    /** Number of features that came from the initial GeoJSON file. */
    initialCount: number;
}

/**
 * Build one random feature around the scene center, cycling through the three
 * geometry types so every technique gets exercised.
 */
function makeRandomFeature(state: IRuntimeState): MapViewFeature {
    state.counter += 1;
    const name = `Runtime #${state.counter}`;
    const rnd = (span: number): number => (Math.random() - 0.5) * span;
    const offset = (): [number, number] => [
        CENTER.lng + rnd(0.02),
        CENTER.lat + rnd(0.014)
    ];
    switch (state.counter % 3) {
        case 0: {
            // A small triangle (rings must be closed: first == last point).
            const a = offset();
            const b: [number, number] = [a[0] + 0.004, a[1]];
            const c: [number, number] = [a[0] + 0.002, a[1] + 0.003];
            return new MapViewPolygonFeature([[a, b, c, a]], { name });
        }
        case 1: {
            // A short random polyline.
            const start = offset();
            const points: [number, number][] = [];
            for (let i = 0; i < 4; i++) {
                points.push([start[0] + i * 0.0025, start[1] + rnd(0.004)]);
            }
            return new MapViewLineFeature(points, { name });
        }
        default:
            return new MapViewPointFeature(offset(), { name });
    }
}

/** Create the count HUD element (styled like the other example panels). */
function createCountHud(): HTMLElement {
    const hud = document.createElement("div");
    Object.assign(hud.style, {
        position: "absolute",
        left: "16px",
        bottom: "16px",
        padding: "8px 12px",
        color: "#fff",
        font: "13px/1.5 sans-serif"
    } as CSSStyleDeclaration);
    applyPanelStyle(hud);
    document.body.appendChild(hud);
    return hud;
}

/** Wire the GUI: add / remove / clear runtime features and refresh the HUD. */
function setupRuntimeGui(
    featuresDataSource: FeaturesDataSource,
    state: IRuntimeState,
    hud: HTMLElement
): void {
    const refreshHud = (): void => {
        const total = state.initialCount + state.added.length;
        hud.textContent = `Features: ${total} (file ${state.initialCount}, runtime ${state.added.length})`;
    };

    const gui: Gui = createExampleGui();
    applyPanelStyle(gui.domElement);
    const folder = gui.addFolder("Runtime Features");

    folder
        .add(
            {
                add: () => {
                    const feature = makeRandomFeature(state);
                    state.added.push(feature);
                    // `add` re-tiles the data source internally; the count of
                    // visible features changes on the next rendered frame.
                    featuresDataSource.add(feature);
                    refreshHud();
                }
            },
            "add"
        )
        .name("Add random feature");

    folder
        .add(
            {
                remove: () => {
                    const last = state.added.pop();
                    if (last !== undefined) {
                        featuresDataSource.remove(last);
                        refreshHud();
                    }
                }
            },
            "remove"
        )
        .name("Remove last added");

    folder
        .add(
            {
                clear: () => {
                    // Only drops features added at runtime; the file data stays.
                    featuresDataSource.remove(...state.added);
                    state.added.length = 0;
                    state.counter = 0;
                    refreshHud();
                }
            },
            "clear"
        )
        .name("Clear added");

    folder.open();
    refreshHud();
}

/** Example entry: map, imagery fallback, features data source and GUI. */
async function main(): Promise<void> {
    const canvas = document.getElementById("mapCanvas") as HTMLCanvasElement;

    const { mapView } = await createExampleMap(canvas, {
        themeObject: createUserFeaturesTheme(),
        projection: "globe",
        lookAt: {
            target: { lat: CENTER.lat, lng: CENTER.lng },
            zoomLevel: 14.8,
            tilt: 40
        }
    });
    logExampleInfo("data-features-layer", mapView);
    // Live-inspection handle (console: `__dbg.lookAt(...)`, scene probes).
    (window as any).__dbg = mapView;

    // No basemap imagery: this example is about the FEATURES themselves —
    // extrusions, roads and labels read cleanly on the light stage.

    const featuresDataSource = await createFeaturesDataSource(mapView);
    const initialCount = await loadInitialData(featuresDataSource);

    const state: IRuntimeState = { added: [], counter: 0, initialCount };
    setupRuntimeGui(featuresDataSource, state, createCountHud());
}

/**
 * TEMP debug mode (`?lineTest`): one thick solid-line through an empty
 * scene, with GUI controls for width/caps, to debug the line material
 * against expectations in isolation. Not part of the example's story.
 */
async function lineTestMain(): Promise<void> {
    const canvas = document.getElementById("mapCanvas") as HTMLCanvasElement;

    const view = { lat: 39.9115, lng: 116.4, zoomLevel: 15.8, tilt: 55 };
    const { mapView } = await createExampleMap(canvas, {
        themeObject: createUserFeaturesTheme(20, "Round", false),
        projection: "globe",
        lookAt: {
            target: { lat: view.lat, lng: view.lng },
            zoomLevel: view.zoomLevel,
            tilt: view.tilt
        }
    });
    (window as any).__dbg = mapView;

    const featuresDataSource = await createFeaturesDataSource(mapView);
    // One polyline with two gentle bends — straight runs AND joints.
    const feature = new MapViewLineFeature(
        [
            [116.385, 39.906],
            [116.395, 39.914],
            [116.407, 39.91],
            [116.418, 39.917]
        ],
        { name: "line-test" }
    );
    featuresDataSource.add(feature);

    const state = { width: 20, caps: "Round" };
    // setTheme restarts an async theme update; dragging the slider fires
    // onChange per tick, so debounce and swallow the intentional
    // "signal is aborted without reason" from superseded updates.
    let applyTimer: ReturnType<typeof setTimeout> | undefined;
    const applyTheme = (): void => {
        if (applyTimer !== undefined) {
            clearTimeout(applyTimer);
        }
        applyTimer = setTimeout(() => {
            try {
                const pending = mapView.setTheme(
                    createUserFeaturesTheme(state.width, state.caps as any, false)
                ) as { catch?: (fn: () => void) => void } | undefined;
                pending?.catch?.(() => {});
            } catch {
                // Superseded by a newer setTheme call (AbortSignal aborted).
            }
        }, 250);
    };

    const gui: Gui = createExampleGui();
    applyPanelStyle(gui.domElement);
    const folder = gui.addFolder("Line Test");
    folder.add(state, "width", 2, 60, 1).onChange(applyTheme).name("width (px)");
    folder
        .add(state, "caps", ["Round", "Square", "None", "TriangleIn", "TriangleOut"])
        .onChange(applyTheme)
        .name("caps");
    folder
        .add(
            {
                resetView: () => {
                    void mapView.lookAt({
                        target: { lat: view.lat, lng: view.lng },
                        zoomLevel: view.zoomLevel,
                        tilt: view.tilt
                    });
                    mapView.update();
                }
            },
            "resetView"
        )
        .name("Reset camera");
    folder.open();
}

const params = new URLSearchParams(location.search);
if (params.has("lineTest")) {
    void lineTestMain();
} else {
    void main();
}
