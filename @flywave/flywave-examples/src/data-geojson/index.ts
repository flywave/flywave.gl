/* Copyright (C) 2025 flywave.gl contributors */

/**
 * Static GeoJSON example (v2): load GeoJSON *files* through the vector-tile
 * pipeline and swap datasets at runtime.
 *
 * What it shows:
 * - `GeoJsonDataProvider(name, url)` + `GeoJsonDataSource` — the canonical
 *   way to render a static GeoJSON file (client-side tiling via geojson-vt
 *   happens inside the data source);
 * - one `styles["geojson"]` style set styling all three geometry types with
 *   `when: ["==", ["geometry-type"], ...]` filters;
 * - dataset swapping: `mapView.removeDataSource(old)` then
 *   `mapView.addDataSource(next)` — data source names must stay unique per
 *   map (flywave-dev rule 4), so each dataset owns a fixed name.
 */

import {
    type FeatureCollection,
    type MapView,
    type Theme,
    GeoCoordinates,
    GeoJsonDataProvider,
    GeoJsonDataSource,
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

/** Scene center: Zibo, Shandong — where the survey dataset was collected. */
const CENTER = new GeoCoordinates(36.834, 117.84);

/** Dataset served from the examples' static resources root. */
const SURVEY_URL = "region_data.geojson";

/** Descriptor for one swappable dataset. */
interface IDataset {
    id: string;
    label: string;
    /** Resolves the GeoJSON document (file download or inline literal). */
    load: () => Promise<FeatureCollection>;
}

/** The file-backed dataset (drainage survey points, geometry type: Point). */
function surveyDataset(): IDataset {
    return {
        id: "survey-points",
        label: "file: region_data.geojson",
        load: async () => TransferManager.instance().downloadJson(SURVEY_URL)
    };
}

/** Inline mixed dataset: one polygon, one line and three labeled points. */
function sampleDataset(): IDataset {
    const feature = (
        geometry: FeatureCollection["features"][number]["geometry"],
        name: string
    ): FeatureCollection["features"][number] => ({
        type: "Feature",
        geometry,
        properties: { name }
    });
    const collection: FeatureCollection = {
        type: "FeatureCollection",
        features: [
            feature(
                {
                    type: "Polygon",
                    // Rings are closed: first == last coordinate.
                    coordinates: [
                        [
                            [117.832, 36.838],
                            [117.846, 36.838],
                            [117.846, 36.83],
                            [117.832, 36.83],
                            [117.832, 36.838]
                        ]
                    ]
                },
                "Sample park"
            ),
            feature(
                {
                    type: "LineString",
                    coordinates: [
                        [117.834, 36.831],
                        [117.838, 36.834],
                        [117.842, 36.832],
                        [117.845, 36.836]
                    ]
                },
                "Riverside walk"
            ),
            feature({ type: "Point", coordinates: [117.836, 36.835] }, "North gate"),
            feature({ type: "Point", coordinates: [117.84, 36.833] }, "Fountain"),
            feature({ type: "Point", coordinates: [117.844, 36.837] }, "Viewing deck")
        ]
    };
    return {
        id: "sample-mixed",
        label: "inline: point / line / polygon",
        load: async () => collection
    };
}

/** Theme: plain tilezen base plus a style set covering all geometry types. */
function createGeoJsonTheme(): Theme {
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
            geojson: [
                {
                    when: ["==", ["geometry-type"], "Point"],
                    technique: "labeled-icon",
                    attr: {
                        text: ["get", "name"],
                        color: "#1A202C",
                        backgroundOpacity: 0,
                        imageTexture: "circle-stroked-11",
                        iconScale: 1.1,
                        size: 26,
                        vAlignment: "Center",
                        hAlignment: "Right"
                    }
                },
                {
                    when: ["==", ["geometry-type"], "LineString"],
                    technique: "solid-line",
                    attr: {
                        color: "#F59E0B",
                        lineWidth: 4,
                        outlineWidth: 1,
                        outlineColor: "#78350F",
                        metricUnit: "Pixel"
                    }
                },
                {
                    when: ["==", ["geometry-type"], "Polygon"],
                    technique: "fill",
                    attr: { color: "#34D399", opacity: 0.5 }
                }
            ]
        }
    };
}

/** Currently attached data source (null before the first load). */
let currentDataSource: GeoJsonDataSource | null = null;

/**
 * Swap the active dataset: remove the previous data source first (names are
 * globally unique per map), then register the next one under its fixed name.
 * `GeoJsonDataProvider` accepts the parsed GeoJSON document directly
 * (`input: URL | GeoJson`), so file and inline data share one code path.
 */
async function loadDataset(mapView: MapView, dataset: IDataset): Promise<number> {
    const geojson = await dataset.load();
    if (currentDataSource !== null) {
        await mapView.removeDataSource(currentDataSource);
        currentDataSource = null;
    }
    const dataSource = new GeoJsonDataSource({
        name: dataset.id,
        dataProvider: new GeoJsonDataProvider(dataset.id, geojson)
    });
    await mapView.addDataSource(dataSource);
    currentDataSource = dataSource;
    mapView.update();
    return geojson.features.length;
}

/** Feature-count HUD. */
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

/** Example entry: offline map + swappable GeoJSON datasets. */
async function main(): Promise<void> {
    const canvas = document.getElementById("mapCanvas") as HTMLCanvasElement;
    const { mapView } = await createExampleMap(canvas, {
        themeObject: createGeoJsonTheme(),
        lookAt: { target: { lat: CENTER.lat, lng: CENTER.lng }, zoomLevel: 15 }
    });
    logExampleInfo("data-geojson", mapView);

    // Imagery ground layer with offline debug-grid fallback.
    await createImageryWithFallback(mapView, demoImagery({ provider: "arcgis" }));

    const hud = createCountHud();
    const loadAndReport = async (dataset: IDataset): Promise<void> => {
        const count = await loadDataset(mapView, dataset);
        hud.textContent = `dataset: ${dataset.label} — ${count} feature(s)`;
    };

    const gui = createExampleGui();
    applyPanelStyle(gui.domElement);
    const folder = gui.addFolder("Datasets");
    folder
        .add({ load: () => void loadAndReport(surveyDataset()) }, "load")
        .name(surveyDataset().label);
    folder
        .add({ load: () => void loadAndReport(sampleDataset()) }, "load")
        .name(sampleDataset().label);
    folder.open();

    await loadAndReport(surveyDataset());
}

void main();
