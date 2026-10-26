/* Copyright (C) 2025 flywave.gl contributors */

import { type Theme, CesiumIonDataSource, MapView, WindowEventHandler } from "@flywave/flywave.gl";

import {
    applyPanelStyle,
    checkIonToken,
    createExampleGui,
    createExampleMap,
    logExampleInfo
} from "../common";
import { PropertiesTable } from "../common/properties-table";

/** Cesium Ion asset id of the Manhattan photogrammetry tileset. */
const ION_ASSET_ID = 75343;

/**
 * Key of this data source's style set inside `theme.styles`. Must match the
 * `styleSetName` the data source is constructed with.
 */
const STYLE_SET_NAME = "3dtiles";

/** Batch attribute holding the per-feature id of this dataset. */
const BATCH_ID_ATTRIBUTE = "_batchid";

/** Camera pose over lower Manhattan, where asset 75343 sits. */
const INITIAL_POSE = {
    target: { lat: 40.6959, lng: -74.0162 },
    zoomLevel: 18,
    tilt: 70,
    heading: 35.1
} as const;

/**
 * Id of the always-false placeholder style reused for click highlighting.
 *
 * Batch styles merge in declaration order and later matches override earlier
 * ones, so highlight entries must sit at the end of every style array.
 */
const SELECTED_STYLE_ID = "selected";

/** Placeholder `when` expression that never matches any feature. */
const NEVER = "0!=0";

/**
 * Height-tier gradient theme. `color`/`opacity` as `{ from, to }` ramps
 * animate between the two ends (driven by the data source's `animation`
 * option and `value`, which positions a feature inside the ramp).
 * Property names in `when` must match batch-table columns exactly, and the
 * expression grammar has no arithmetic operators.
 */
function createTieredTheme(): Theme {
    return {
        styles: {
            [STYLE_SET_NAME]: [
                {
                    when: "Height >= 0 && Height < 40",
                    technique: "tile3d",
                    color: { from: "#B0E2FF", to: "#7EC0EE" },
                    value: 0.9,
                    opacity: { from: 0.5, to: 1 }
                },
                {
                    when: "Height >= 40 && Height < 80",
                    technique: "tile3d",
                    color: { from: "#98FB98", to: "#FFD700" },
                    value: 0.9,
                    opacity: { from: 0.6, to: 1 }
                },
                {
                    when: "Height >= 80 && Height < 120",
                    technique: "tile3d",
                    color: { from: "#FFDAB9", to: "#FF69B4" },
                    value: 0.95,
                    opacity: { from: 0.7, to: 1 }
                },
                {
                    when: "Height >= 120",
                    technique: "tile3d",
                    color: { from: "#E6E6FA", to: "#9370DB" },
                    value: 1,
                    opacity: { from: 0.85, to: 1 }
                },
                {
                    id: SELECTED_STYLE_ID,
                    when: NEVER,
                    technique: "tile3d",
                    color: "#FFFF00",
                    opacity: 1
                }
            ]
        }
    };
}

/**
 * Flat theme factory: one style for every feature. `opacity < 1` gives the
 * see-through "X-ray" look.
 */
function createFlatTheme(color: string, opacity: number): Theme {
    return {
        styles: {
            [STYLE_SET_NAME]: [
                { when: "Height >= 0", technique: "tile3d", color, opacity },
                { id: SELECTED_STYLE_ID, when: NEVER, technique: "tile3d", color: "#FFFF00" }
            ]
        }
    };
}

/** Five rainbow height bands, each a plain single-color style. */
function createRainbowTheme(): Theme {
    const bands: Array<[number, number, string]> = [
        [0, 30, "#4DA6FF"],
        [30, 60, "#3DDC97"],
        [60, 90, "#FFD700"],
        [90, 130, "#FF8C42"],
        [130, 99999, "#E14D5F"]
    ];
    return {
        styles: {
            [STYLE_SET_NAME]: [
                ...bands.map(([min, max, color]) => ({
                    when: `Height >= ${min} && Height < ${max}`,
                    technique: "tile3d" as const,
                    color,
                    opacity: 1
                })),
                { id: SELECTED_STYLE_ID, when: NEVER, technique: "tile3d", color: "#FFFF00" }
            ]
        }
    };
}

/** GUI-facing preset table; keys become the dropdown entries. */
const THEME_PRESETS: Record<string, () => Theme> = {
    "Tiered gradient": createTieredTheme,
    "Rainbow bands": createRainbowTheme,
    "Solid color": () => createFlatTheme("#7EC8FF", 1),
    "X-ray": () => createFlatTheme("#88ccff", 0.3)
};

/** Palette cycled through by the batch recolor action. */
const RECOLOR_PALETTE = ["#7EC8FF", "#98FB98", "#FFD700", "#FFA500", "#FF69B4", "#9370DB"];

/**
 * Create the Ion data source wired for batch styling.
 *
 * `styleSetName` selects which entry of `theme.styles` drives this source,
 * and `customAttributeConfig.batchIdAttributeName` tells the renderer which
 * geometry attribute carries the batch id of this dataset.
 */
function createDataSource(token: string): CesiumIonDataSource {
    return new CesiumIonDataSource({
        styleSetName: STYLE_SET_NAME,
        accessToken: token,
        assetId: ION_ASSET_ID,
        customAttributeConfig: { batchIdAttributeName: BATCH_ID_ATTRIBUTE },
        animation: { easing: "ease-in-out", duration: 1000 },
        castShadow: true,
        receiveShadow: true
    });
}

/**
 * Wire click picking: nearest-hit feature shows its batch-table properties
 * and gets highlighted by retargeting the placeholder `selected` style.
 *
 * Lazy-detail contract (pick results are bound to the last rendered frame):
 * after camera movement a hit's intersection/userData details may briefly be
 * `undefined` even though the ray did hit — treat a missing record as "no
 * details yet", not as a miss, and simply retry on the next click.
 *
 * @param mapView - View whose canvas receives the clicks.
 * @param dataSource - Source queried for intersections and batch properties.
 * @param propertiesTable - Overlay table showing the batch record.
 */
function setupPicking(
    mapView: MapView,
    dataSource: CesiumIonDataSource,
    propertiesTable: PropertiesTable
): void {
    const handler = new WindowEventHandler(mapView.canvas);
    handler.addEventListener("mouseclick", event => {
        const hits = dataSource
            .intersectMapObjects(event.layerX, event.layerY)
            .sort((a, b) => a.distance - b.distance);
        const hit = hits[0];
        const properties = hit ? dataSource.getBatchProperties(hit, BATCH_ID_ATTRIBUTE) : undefined;

        if (properties === undefined) {
            // Either a genuine miss or lazy details not ready: clear highlight.
            dataSource.updateStyleById(SELECTED_STYLE_ID, { when: NEVER });
            return;
        }
        propertiesTable.show(properties);

        // Pick a stable identifier from the batch record to build the
        // highlight expression (string ids need single quotes).
        const record = properties as Record<string, unknown>;
        const when =
            typeof record.DOITT_ID === "string"
                ? `DOITT_ID == '${record.DOITT_ID}'`
                : typeof record.batchId === "number"
                ? `batchId == ${record.batchId}`
                : NEVER;
        dataSource.updateStyleById(SELECTED_STYLE_ID, { when });
        mapView.update();
    });
}

/**
 * Wire the styling panel: preset theme switching, per-band hiding and a
 * batch recolor action demonstrating `updateStyleById`/`addStyle`/
 * `removeStyleById`. Every visual change must be followed by
 * `mapView.update()` because rendering is on demand.
 *
 * @param mapView - View driving the render loop.
 * @param dataSource - Source whose style set is manipulated.
 */
function setupStylingGui(mapView: MapView, dataSource: CesiumIonDataSource): void {
    const gui = createExampleGui();
    const state = {
        preset: Object.keys(THEME_PRESETS)[0],
        hideBelow40m: false,
        colorIndex: 0
    };

    gui.add(state, "preset", Object.keys(THEME_PRESETS))
        .name("Theme preset")
        .onChange(name => {
            // setTheme replaces the whole style set (including "hide-low").
            void dataSource.setTheme(THEME_PRESETS[name]());
            state.hideBelow40m = false;
            gui.updateDisplay();
            mapView.update();
        });

    gui.add(state, "hideBelow40m")
        .name("Hide < 40 m")
        .onChange(hide => {
            if (hide) {
                // `visible: false` on a tile3d style hides matching features.
                dataSource.addStyle({
                    id: "hide-low",
                    when: "Height < 40",
                    technique: "tile3d",
                    visible: false
                });
            } else {
                dataSource.removeStyleById("hide-low");
            }
            mapView.update();
        });

    const actions = {
        recolor: () => {
            // A missing style is created first, afterwards it is updated in place.
            const color = RECOLOR_PALETTE[state.colorIndex++ % RECOLOR_PALETTE.length];
            const updated = dataSource.updateStyleById("base", { color });
            if (!updated) {
                dataSource.addStyle({
                    id: "base",
                    when: "Height >= 0",
                    technique: "tile3d",
                    color,
                    opacity: 1
                });
            }
            mapView.update();
        }
    };
    gui.add(actions, "recolor").name("Recolor all");
}

/**
 * Compact bilingual hint shown when no Ion token is configured. Unlike the
 * interactive guide in tiles3d-basic this only points at the two supported
 * configuration paths.
 */
function showTokenHint(): void {
    const hint = document.createElement("div");
    Object.assign(hint.style, {
        position: "absolute",
        left: "16px",
        top: "16px",
        maxWidth: "420px",
        padding: "12px 16px",
        color: "#ddd",
        font: "13px/1.6 sans-serif"
    } as CSSStyleDeclaration);
    applyPanelStyle(hint, { zIndex: "2000" });
    hint.innerHTML =
        "This example needs a Cesium Ion token: set <code>CESIUM_ION_TOKEN</code> at build " +
        "time or <code>window.CESIUM_ION_TOKEN</code> at runtime, then reload.<br/>";
    document.body.appendChild(hint);
}

/**
 * Start the example: create the view, stream the tileset, apply the default
 * preset and frame the dataset extent.
 *
 * @param token - Cesium Ion access token.
 */
async function startExample(token: string): Promise<void> {
    const canvas = document.getElementById("mapCanvas") as HTMLCanvasElement;
    if (!canvas) {
        throw new Error("Canvas element #mapCanvas not found");
    }

    const { mapView } = await createExampleMap(canvas, {
        projection: "globe",
        lookAt: INITIAL_POSE
    });
    logExampleInfo("tiles3d-styling", mapView);

    const dataSource = createDataSource(token);
    await mapView.addDataSource(dataSource);

    // Initial look comes from the pose above; keep the extent framing best
    // effort so styling remains demonstrable even if the extent is unknown.
    const extent = await dataSource.getGeoExtent();
    if (extent !== undefined) {
        mapView.lookAt({ bounds: extent });
    }

    void dataSource.setTheme(THEME_PRESETS[Object.keys(THEME_PRESETS)[0]]());

    setupPicking(mapView, dataSource, new PropertiesTable());
    setupStylingGui(mapView, dataSource);
}

// ==================== Entry point ====================

const token = checkIonToken();
if (token !== undefined) {
    void startExample(token);
} else {
    showTokenHint();
}
