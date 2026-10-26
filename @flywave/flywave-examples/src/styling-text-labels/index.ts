/* Copyright (C) 2025 flywave.gl contributors */

/**
 * Text labels on the map (v2): a `FeaturesDataSource` with 14 bilingual POIs
 * around Beijing's Forbidden City, demonstrating the three levers of label
 * rendering:
 *
 * 1. **FontCatalog** — the extended tilezen theme declares
 *    `fontCatalogs: [{ name: "fira", url: "fonts/Default_FontCatalog.json" }]`,
 *    so the default catalog loads with the theme. It bundles FiraGO_Map
 *    (Latin/Cyrillic/Greek) and HanSans_ExtraLight (CJK): Chinese glyphs are
 *    picked per-glyph from HanSans automatically. (`MapViewOptions.fontCatalog`
 *    can set a standalone default catalog path when a theme has none.)
 * 2. **TextStyle parameters** — the `text` technique attrs used here:
 *    `size` (px), `color`, `backgroundOpacity`, `hAlignment`, `vAlignment`
 *    and `priority` (elements with the highest priority are placed first).
 *    Omitting the `text` attribute on purpose: without it the engine falls
 *    back to the language-aware `name` chain (`getFeatureName`), looking up
 *    `name:<lang>` (or `name_<lang>`) per configured language before the
 *    plain `name` property.
 * 3. **Collision avoidance** — labels reserve screen space; when they
 *    overlap, the placement engine drops the lower-priority ones.
 *    `maxNumVisibleLabels` (a real `MapViewOptions` field, constructor-time
 *    only — it is copied into the text renderer options) caps how many
 *    labels may be placed per frame; with 14 POIs and a cap of 8, the
 *    priority ordering becomes visible.
 *
 * **Languages** — `mapView.languages = ["en"]` (ISO 639-1, priority order)
 * propagates to every data source, reconfigures the decoders and clears the
 * tile caches, so labels re-decode in the new language. This example builds
 * its own `MapView` (instead of `createExampleMap`) because the label
 * options live on `MapViewOptions` and need to be set at construction.
 *
 * Note on cost: label placement runs every rendered frame over all visible
 * tiles, and each placed label keeps a "dirty region" that must repaint
 * when it fades or moves — dense scenes pay in placement time and repaints,
 * which is exactly what `priority` and `maxNumVisibleLabels` exist to cap.
 */

import {
    type FeatureCollection,
    type Theme,
    ellipsoidProjection,
    FeaturesDataSource,
    GeoCoordinates,
    MapControls,
    MapControlsUI,
    MapView
} from "@flywave/flywave.gl";
import { GUI } from "dat.gui";

import {
    applyPanelStyle,
    createExampleGui,
    createImageryWithFallback,
    demoImagery,
    logExampleInfo,
    shouldForceWebGL
} from "../common";

/** Scene center: the Forbidden City, Beijing. */
const CENTER = new GeoCoordinates(39.9163, 116.3972);

/** Bilingual POI set: [name (zh), name:en, lng, lat, class]. */
const POIS: Array<[string, string, number, number, "landmark" | "spot"]> = [
    ["故宫", "Forbidden City", 116.3972, 39.9163, "landmark"],
    ["天安门", "Tian'anmen", 116.3975, 39.9087, "landmark"],
    ["景山公园", "Jingshan Park", 116.3968, 39.9254, "landmark"],
    ["钟鼓楼", "Bell & Drum Towers", 116.39, 39.9405, "landmark"],
    ["北海公园", "Beihai Park", 116.3855, 39.9254, "spot"],
    ["白塔", "White Dagoba", 116.3836, 39.9255, "spot"],
    ["什刹海", "Shichahai", 116.383, 39.934, "spot"],
    ["王府井", "Wangfujing", 116.4109, 39.9097, "spot"],
    ["国家博物馆", "National Museum", 116.4001, 39.9052, "spot"],
    ["人民大会堂", "Great Hall of the People", 116.3925, 39.9038, "spot"],
    ["前门", "Qianmen", 116.398, 39.8994, "spot"],
    ["中山公园", "Zhongshan Park", 116.3906, 39.914, "spot"],
    ["太庙", "Imperial Ancestral Temple", 116.4024, 39.914, "spot"],
    ["角楼", "Corner Tower", 116.4025, 39.9224, "spot"]
];

/** Build the offline GeoJSON: `name` (zh) plus `name:en` for switching. */
function buildPoiGeojson(): FeatureCollection {
    return {
        type: "FeatureCollection",
        features: POIS.map(([name, nameEn, lng, lat, poiClass]) => ({
            type: "Feature" as const,
            properties: { name, "name:en": nameEn, class: poiClass },
            geometry: { type: "Point" as const, coordinates: [lng, lat] }
        }))
    };
}

/**
 * Label theme for the current GUI state. The `text` attribute is omitted so
 * the language-aware default chain picks `name:<lang>` / `name`; `priority`
 * uses a `match` expression when "landmarks first" is on.
 */
function buildLabelTheme(fontSize: number, landmarksFirst: boolean): Theme {
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
            "poi-labels": [
                {
                    when: ["==", ["geometry-type"], "Point"],
                    technique: "text",
                    attr: {
                        color: "#1A202C",
                        backgroundOpacity: 0.15,
                        backgroundColor: "#FFFFFF",
                        size: fontSize,
                        priority: landmarksFirst
                            ? ["match", ["get", "class"], "landmark", 100, 40]
                            : 50,
                        hAlignment: "Center",
                        vAlignment: "Below"
                    }
                }
            ]
        }
    };
}

/**
 * Create the map with the label-related `MapViewOptions` spelled out. This
 * example does not use `createExampleMap` because those options are
 * constructor-time and the helper does not forward them.
 */
async function createLabelMap(
    canvas: HTMLCanvasElement,
    maxNumVisibleLabels: number
): Promise<MapView> {
    const mapView = new MapView({
        canvas,
        forceWebGL: shouldForceWebGL(),
        projection: ellipsoidProjection,
        target: CENTER,
        zoomLevel: 14.6,
        tilt: 0,
        heading: 0,
        // Cap the number of placed labels so priority ordering is visible.
        maxNumVisibleLabels,
        // Initial label language (ISO 639-1 codes, priority order).
        languages: ["zh"],
        theme: buildLabelTheme(24, true)
    });
    const controls = new MapControls(mapView);
    const ui = new MapControlsUI(controls);
    (canvas.parentElement ?? document.body).appendChild(ui.domElement);
    window.addEventListener("resize", () => mapView.resize(window.innerWidth, window.innerHeight));
    await mapView.ready;
    return mapView;
}

/** Wire the GUI: font size and priority go through setTheme, language not. */
function setupLabelGui(mapView: MapView, hud: HTMLElement): void {
    const state = { fontSize: 24, landmarksFirst: true, language: "zh" };
    const refreshHud = (): void => {
        hud.textContent =
            `labels: ${POIS.length} POIs, maxNumVisibleLabels=8\n` +
            `fontSize=${state.fontSize}px  language=${state.language}  ` +
            `priority=${state.landmarksFirst ? "landmarks 100 / spots 40" : "uniform 50"}`;
    };

    let applying = false;
    const applyTheme = async (): Promise<void> => {
        if (applying) {
            return; // setTheme is async; drop re-entrant GUI events.
        }
        applying = true;
        try {
            // Text labels are placed and cached by the placement engine, so
            // restyling them goes through the async setTheme (re-decode) —
            // unlike material colors, which have the volatile channel.
            await mapView.setTheme(buildLabelTheme(state.fontSize, state.landmarksFirst));
        } finally {
            applying = false;
        }
    };

    const gui: GUI = createExampleGui();
    applyPanelStyle(gui.domElement);
    const folder = gui.addFolder("Text Labels");
    folder
        .add(state, "fontSize", 12, 48, 1)
        .name("font size (px)")
        .onFinishChange(async value => {
            state.fontSize = value;
            refreshHud();
            await applyTheme();
        });
    folder
        .add(state, "landmarksFirst")
        .name("landmarks first")
        .onChange(async value => {
            state.landmarksFirst = value;
            refreshHud();
            await applyTheme();
        });
    folder
        .add(state, "language", { "中文 (zh)": "zh", "English (en)": "en" })
        .name("label language")
        .onChange(value => {
            // Setter on MapView: reconfigures every data source's decoders
            // and clears their tile caches, then triggers a map update.
            state.language = value;
            mapView.languages = [value];
            refreshHud();
        });
    folder.open();
    refreshHud();
}

/** Example entry: offline bilingual POI labels with collision control. */
async function main(): Promise<void> {
    const canvas = document.getElementById("mapCanvas") as HTMLCanvasElement;
    const mapView = await createLabelMap(canvas, 8);
    logExampleInfo("styling-text-labels", mapView);

    // Imagery ground layer with offline debug-grid fallback.
    await createImageryWithFallback(mapView, demoImagery({ provider: "arcgis" }));

    const dataSource = new FeaturesDataSource({
        name: "beijing-pois",
        styleSetName: "poi-labels",
        maxDataLevel: 14
    });
    dataSource.setFromGeojson(buildPoiGeojson());
    await mapView.addDataSource(dataSource);

    setupLabelGui(mapView, createHud());
}

/** Bottom-left status HUD. */
function createHud(): HTMLElement {
    const hud = document.createElement("div");
    hud.style.cssText =
        "position:absolute;left:16px;bottom:16px;padding:8px 12px;color:#fff;" +
        "font:12px/1.6 sans-serif;white-space:pre-wrap;";
    applyPanelStyle(hud);
    document.body.appendChild(hud);
    return hud;
}

void main();
