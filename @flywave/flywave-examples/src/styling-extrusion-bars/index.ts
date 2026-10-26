/* Copyright (C) 2025 flywave.gl contributors */

/**
 * 3D extrusion bar chart (v2): attribute-driven `extruded-polygon` styling.
 *
 * A small, fully offline GeoJSON of schematic district cells around Jinan
 * (real district names, approximate population / GDP figures; the cell
 * boundaries are a regular grid, not official admin polygons) is rendered
 * with:
 * - `height: ["*", ["get", field], scale]` — expression-driven extrusion;
 * - classed `["step", ...]` fill colors on the same attribute;
 * - zoom-interpolated edge widths (`["interpolate", ..., ["zoom"], ...]`).
 *
 * Runtime controls rebuild the inline theme and apply it with
 * `mapView.setTheme(themeObject)`. Why not `patchTheme` or
 * `setDynamicProperty` here?
 * - `patchTheme` cannot touch the async `styles` section at all;
 * - extrusion heights are baked into geometry at decode time (worker side),
 *   and `setDynamicProperty` only reaches per-frame evaluated ("volatile")
 *   technique params — so a new height expression must go through the async
 *   `setTheme` path, which re-decodes the tiles.
 */

import {
    type FeatureCollection,
    type JsonExpr,
    type MapView,
    type Theme,
    FeaturesDataSource,
    GeoCoordinates
} from "@flywave/flywave.gl";

import {
    applyPanelStyle,
    createExampleGui,
    createExampleMap,
    createImageryWithFallback,
    demoImagery,
    logExampleInfo
} from "../common";

/** Grid anchor: west/south corner of the schematic district grid. */
const GRID_ORIGIN = { lat: 36.5, lng: 116.9 };
/** Cell size in degrees (lon x lat) — roughly 5 km x 3.3 km at this latitude. */
const CELL_SIZE = { lng: 0.05, lat: 0.035 };
const GRID_COLS = 4;
const GRID_ROWS = 3;

/** Which numeric attribute drives the extrusion. */
type DataField = "population" | "gdp";

/** Field metadata: exponent for the height scaling and step classes for color. */
const FIELD_META: Record<
    DataField,
    {
        /** Multiplier from attribute value to world-space height (meters). */
        heightScale: number;
        /** Label for HUD. */
        label: string;
        /** Class breaks for the ["step", ...] fill color ramp. */
        steps: Array<[number, string]>;
    }
> = {
    population: {
        heightScale: 0.0004, // 1,000,000 people -> 400 m
        label: "population (persons)",
        steps: [
            [500000, "#BDD7E7"],
            [800000, "#6BAED6"],
            [1100000, "#3182BD"],
            [Number.POSITIVE_INFINITY, "#08519C"]
        ]
    },
    gdp: {
        heightScale: 0.3, // 2,000 (100M CNY) -> 600 m
        label: "GDP (100M CNY)",
        steps: [
            [500, "#C7E9C0"],
            [1000, "#74C476"],
            [1800, "#31A354"],
            [Number.POSITIVE_INFINITY, "#006D37"]
        ]
    }
};

/**
 * Approximate 2020s figures for Jinan's districts (demo values, rounded;
 * cells are laid out as a grid, NOT official boundaries).
 */
const DISTRICTS: Array<{ name: string; population: number; gdp: number }> = [
    { name: "历下区", population: 759000, gdp: 2400 },
    { name: "市中区", population: 660000, gdp: 1100 },
    { name: "槐荫区", population: 687000, gdp: 750 },
    { name: "天桥区", population: 720000, gdp: 700 },
    { name: "历城区", population: 1250000, gdp: 1300 },
    { name: "长清区", population: 600000, gdp: 400 },
    { name: "章丘区", population: 1050000, gdp: 1100 },
    { name: "济阳区", population: 400000, gdp: 220 },
    { name: "莱芜区", population: 970000, gdp: 800 },
    { name: "钢城区", population: 280000, gdp: 350 },
    { name: "平阴县", population: 340000, gdp: 230 },
    { name: "商河县", population: 510000, gdp: 210 }
];

/** Build the offline GeoJSON: one polygon cell + one centroid label per district. */
function buildDistrictGeojson(): FeatureCollection {
    const features: FeatureCollection["features"] = DISTRICTS.map((district, i) => {
        const col = i % GRID_COLS;
        const row = Math.floor(i / GRID_COLS);
        const x0 = GRID_ORIGIN.lng + col * CELL_SIZE.lng;
        const y0 = GRID_ORIGIN.lat + row * CELL_SIZE.lat;
        const x1 = x0 + CELL_SIZE.lng * 0.92;
        const y1 = y0 + CELL_SIZE.lat * 0.9;
        return {
            type: "Feature" as const,
            properties: { ...district },
            geometry: {
                type: "Polygon" as const,
                // GeoJSON rings are closed: first == last point.
                coordinates: [
                    [
                        [x0, y0],
                        [x1, y0],
                        [x1, y1],
                        [x0, y1],
                        [x0, y0]
                    ]
                ]
            }
        };
    });
    return { type: "FeatureCollection", features };
}

/** Flatten the step table into an Expr-compatible array with a start value. */
function colorSteps(field: DataField): JsonExpr {
    const meta = FIELD_META[field];
    const expr: JsonExpr = ["step", ["get", field], meta.steps[0][1]];
    for (const [breakValue, color] of meta.steps.slice(1)) {
        expr.push(breakValue === Number.POSITIVE_INFINITY ? 1e12 : breakValue, color);
    }
    return expr;
}

/** Build the full inline theme for the current field and height scale. */
function buildTheme(field: DataField, heightScale: number): Theme {
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
            districts: [
                {
                    when: ["==", ["geometry-type"], "Polygon"],
                    technique: "extruded-polygon",
                    attr: {
                        // Attribute-driven height, e.g. 759000 * 0.0004 -> 304 m.
                        height: ["*", ["get", field], heightScale],
                        // Classed ramp on the same attribute.
                        color: colorSteps(field),
                        footprint: true,
                        lineColor: "#1A365D",
                        lineWidth: ["interpolate", ["linear"], ["zoom"], 10, 1, 14, 4]
                    }
                },
                {
                    when: ["==", ["geometry-type"], "Point"],
                    technique: "text",
                    attr: {
                        text: ["get", "name"],
                        color: "#1A202C",
                        backgroundOpacity: 0,
                        size: 30,
                        priority: 90,
                        vAlignment: "Center",
                        hAlignment: "Center"
                    }
                }
            ]
        }
    };
}

/** Add the offline features data source with the district GeoJSON. */
async function addDistrictsDataSource(mapView: MapView): Promise<FeaturesDataSource> {
    const dataSource = new FeaturesDataSource({
        name: "jinan-districts",
        styleSetName: "districts",
        maxDataLevel: 12
    });
    dataSource.setFromGeojson(buildDistrictGeojson());
    await mapView.addDataSource(dataSource);
    return dataSource;
}

/** Create the HUD showing the current field and height formula. */
function createLegendHud(): HTMLElement {
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

/**
 * Wire the GUI. Both controls rebuild the inline theme and swap it via the
 * async `setTheme` — see the module comment for why the sync paths cannot
 * restyle (or re-extrude) geometry.
 */
function setupBarGui(mapView: MapView, hud: HTMLElement): void {
    const state = {
        field: "population" as DataField,
        /** Absolute attribute-to-height multiplier (field default at first). */
        heightScale: FIELD_META.population.heightScale
    };

    const refreshHud = (): void => {
        hud.textContent =
            `field: ${FIELD_META[state.field].label}\n` +
            `height = value × ${state.heightScale.toExponential(2)} (world units)`;
    };

    // Re-apply the theme with the current GUI state (async: re-decodes tiles).
    let applying = false;
    const applyTheme = async (): Promise<void> => {
        if (applying) {
            return;
        }
        applying = true;
        try {
            await mapView.setTheme(buildTheme(state.field, state.heightScale));
            // setTheme re-decodes the scene: heights are baked into tile
            // geometry worker-side, so extrusion restyling must go async.
        } finally {
            applying = false;
        }
    };

    const gui = createExampleGui();
    applyPanelStyle(gui.domElement);
    const folder = gui.addFolder("Extrusion Bars");
    folder
        .add(state, "field", ["population", "gdp"])
        .name("data field")
        .onChange(async (value: DataField) => {
            // Each field has its own sensible default scale.
            state.field = value;
            state.heightScale = FIELD_META[value].heightScale;
            gui.updateDisplay();
            refreshHud();
            await applyTheme();
        });
    // onFinishChange: setTheme re-decodes the scene, avoid doing it per tick.
    folder
        .add(state, "heightScale", 0.00005, 0.0015, 0.00005)
        .name("height scale")
        .onFinishChange(async value => {
            state.heightScale = value;
            refreshHud();
            await applyTheme();
        });
    folder.open();
    refreshHud();
}

/** Example entry: offline map with extruded district bars. */
async function main(): Promise<void> {
    const canvas = document.getElementById("mapCanvas") as HTMLCanvasElement;

    const { mapView } = await createExampleMap(canvas, {
        themeObject: buildTheme("population", FIELD_META.population.heightScale),
        lookAt: {
            target: {
                lat: GRID_ORIGIN.lat + (GRID_ROWS * CELL_SIZE.lat) / 2,
                lng: GRID_ORIGIN.lng + (GRID_COLS * CELL_SIZE.lng) / 2
            },
            zoomLevel: 11.5,
            tilt: 45,
            heading: 20
        }
    });
    logExampleInfo("styling-extrusion-bars", mapView);

    // Imagery ground layer with offline debug-grid fallback; the setTheme
    // swaps below re-decode tiles without touching this source.
    await createImageryWithFallback(mapView, demoImagery({ provider: "arcgis" }));

    await addDistrictsDataSource(mapView);
    setupBarGui(mapView, createLegendHud());
}

void main();
