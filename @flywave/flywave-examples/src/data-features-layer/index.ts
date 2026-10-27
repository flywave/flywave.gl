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
    type MapViewFeature,
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
    createImageryWithFallback,
    demoImagery,
    logExampleInfo
} from "../common";

/** Scene center: the Forbidden City, Beijing (matches `complex-features.json`). */
const CENTER = new GeoCoordinates(39.9135, 116.3975);

/** Demo GeoJSON served from the examples' `resources/` root. */
const DATA_URL = "complex-features.json";

/** dat.GUI is re-exported by the aggregate package for example use. */
type Gui = import("dat.gui").GUI;

/** Theme object: base tilezen look plus the inline "user-features" style set. */
function buildDiagTheme(): Theme {
    return {
        extends: "resources/tilezen_base_globe.json",
        // USER: planar test — light sky, no deep-blue, atmosphere off.
        atmosphere: { enabled: false },
        sky: { type: "gradient", topColor: "#BFD9EF", bottomColor: "#E9EDF2", groundColor: "#DDE3EA" },
        clearColor: "#DDE3EA",
        definitions: {
            defaultTextStyle: {
                color: "#000000",
                backgroundOpacity: 0,
                fontSize: 28,
                fontName: "Noto Sans",
                fontStyle: "Bold"
            }
        },
        styles: {
            "user-features": [
                // NOTE: plain `line` technique on purpose — SolidLineMaterial
                // currently draws nothing on either backend (engine bug, under
                // investigation; see commit notes).
                {
                    when: ["==", ["geometry-type"], "LineString"],
                    technique: "line",
                    attr: {
                        color: "#FF8C1A",
                        opacity: 1,
                        lineWidth: 4
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
        themeObject: buildDiagTheme(),
        projection: "mercator",
        lookAt: {
            target: { lat: CENTER.lat, lng: CENTER.lng },
            zoomLevel: 14.8,
            tilt: 40
        }
    });
    logExampleInfo("data-features-layer", mapView);

    // Open raster background; degrades to a red debug grid when offline.
    // await createImageryWithFallback(mapView, demoImagery({ provider: "arcgis" })); // DIAG

    const featuresDataSource = await createFeaturesDataSource(mapView);
    const initialCount = await loadInitialData(featuresDataSource);

    const state: IRuntimeState = { added: [], counter: 0, initialCount };
    setupRuntimeGui(featuresDataSource, state, createCountHud());
}

void main();
