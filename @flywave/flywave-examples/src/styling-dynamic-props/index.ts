/* Copyright (C) 2025 flywave.gl contributors */

/**
 * Dynamic style properties (v2): runtime restyling WITHOUT re-decoding.
 *
 * `mapView.setDynamicProperty(name, value)` stores a value in the view
 * environment (`mapView.env`) and calls `mapView.update()` itself. Styles
 * reach those values with the `Expr` operator `["dynamic-properties"]`:
 *
 *     ["get", "propName", ["dynamic-properties"]]
 *
 * Any technique attribute whose expression contains `["dynamic-properties"]`
 * is flagged "volatile" (see `ExprDependencies`), so instead of being baked
 * at decode time it is re-evaluated per frame against the live environment
 * (`MapMaterialAdapter.ensureUpdated`). Moving a slider therefore restyles
 * geometry immediately — no theme swap, no worker re-decode.
 *
 * Contrast with styling-extrusion-bars: extrusion heights are baked into
 * tile geometry worker-side, so they can never be driven dynamically and
 * need the async `setTheme`. Note `["var", ...]` is NOT the right tool
 * here: it also reads the environment, but it is not volatile, so its value
 * would be frozen at decode time.
 *
 * The `enabled` technique attribute is evaluated per frame by
 * `TileObjectsRenderer`, which makes it the documented channel for dynamic
 * per-technique visibility ("dynamic feature highlight").
 */

import {
    type FeatureCollection,
    type JsonExpr,
    type Theme,
    FeaturesDataSource
} from "@flywave/flywave.gl";

import {
    applyPanelStyle,
    createExampleGui,
    createExampleMap,
    createImageryWithFallback,
    demoImagery,
    logExampleInfo
} from "../common";

/** Scene center (Jinan, Shandong). */
const CENTER = { lat: 36.6512, lng: 117.1201 };

/** Dynamic property names shared by the theme expressions and the GUI. */
const PROP = {
    /** 0..1 blend factor for the zone fill color ramp. */
    mix: "mix",
    /** CSS color for the point cloud. */
    dotColor: "dotColor",
    /** Pixel radius for the point cloud. */
    dotSize: "dotSize",
    /** Boolean visibility switch for the route line. */
    showRoute: "showRoute"
} as const;

/** 2 x 4 grid of flat zones around the center. */
function buildZones(): FeatureCollection {
    const features: FeatureCollection["features"] = [];
    for (let i = 0; i < 8; i++) {
        const lng = CENTER.lng - 0.009 + (i % 4) * 0.0048;
        const lat = CENTER.lat - 0.0032 + Math.floor(i / 4) * 0.0034;
        features.push({
            type: "Feature",
            properties: { kind: "zone" },
            geometry: {
                type: "Polygon",
                coordinates: [
                    [
                        [lng, lat],
                        [lng + 0.0042, lat],
                        [lng + 0.0042, lat + 0.0028],
                        [lng, lat + 0.0028],
                        [lng, lat]
                    ]
                ]
            }
        });
    }
    return { type: "FeatureCollection", features };
}

/** A circle of 10 sample points north of the zones. */
function buildDots(): FeatureCollection {
    const features: FeatureCollection["features"] = [];
    for (let i = 0; i < 10; i++) {
        const angle = (i / 10) * Math.PI * 2;
        features.push({
            type: "Feature",
            properties: { kind: "dot" },
            geometry: {
                type: "Point",
                coordinates: [
                    CENTER.lng + Math.sin(angle) * 0.006,
                    CENTER.lat + 0.008 + Math.cos(angle) * 0.004
                ]
            }
        });
    }
    return { type: "FeatureCollection", features };
}

/** A short polyline crossing the zones west -> east. */
function buildRoute(): FeatureCollection {
    return {
        type: "FeatureCollection",
        features: [
            {
                type: "Feature",
                properties: { kind: "route" },
                geometry: {
                    type: "LineString",
                    coordinates: [
                        [CENTER.lng - 0.011, CENTER.lat - 0.002],
                        [CENTER.lng - 0.002, CENTER.lat + 0.002],
                        [CENTER.lng + 0.008, CENTER.lat - 0.001],
                        [CENTER.lng + 0.011, CENTER.lat + 0.003]
                    ]
                }
            }
        ]
    };
}

/** Read a dynamic property inside a technique attribute expression. */
function dynamic(name: string): JsonExpr {
    return ["get", name, ["dynamic-properties"]];
}

/**
 * Inline theme: every variable attribute reads the live environment, so all
 * three style sets below restyle instantly when the GUI writes a property.
 */
function buildDynamicTheme(): Theme {
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
            "dynamic-zones": [
                {
                    when: ["==", ["geometry-type"], "Polygon"],
                    technique: "fill",
                    attr: {
                        // Per-frame color blend between two stops.
                        color: [
                            "interpolate",
                            ["linear"],
                            dynamic(PROP.mix),
                            0,
                            "#E0F2FE",
                            1,
                            "#0C4A6E"
                        ],
                        opacity: 0.85
                    }
                }
            ],
            "dynamic-dots": [
                {
                    when: ["==", ["geometry-type"], "Point"],
                    technique: "circles",
                    attr: {
                        color: dynamic(PROP.dotColor),
                        size: dynamic(PROP.dotSize),
                        opacity: 0.95
                    }
                }
            ],
            "dynamic-route": [
                {
                    when: ["==", ["geometry-type"], "LineString"],
                    technique: "solid-line",
                    attr: {
                        // `enabled` is volatile-capable: toggling the property
                        // shows/hides the line without any re-decode.
                        enabled: ["==", dynamic(PROP.showRoute), true],
                        color: "#F97316",
                        lineWidth: 6,
                        metricUnit: "Pixel"
                    }
                }
            ]
        }
    };
}

/** Initial values for every dynamic property (kept in sync with the GUI). */
const INITIAL: Record<string, string | number | boolean> = {
    [PROP.mix]: 0.35,
    [PROP.dotColor]: "#38BDF8",
    [PROP.dotSize]: 8,
    [PROP.showRoute]: true
};

/** Bottom-left HUD mirroring the current dynamic property values. */
function createPropertyHud(): HTMLElement {
    const hud = document.createElement("div");
    hud.style.cssText =
        "position:absolute;left:16px;bottom:16px;padding:8px 12px;color:#fff;" +
        "font:12px/1.6 sans-serif;white-space:pre-wrap;";
    applyPanelStyle(hud);
    document.body.appendChild(hud);
    return hud;
}

/** Wire the GUI: sliders/color/checkbox write properties, never a theme. */
function setupDynamicGui(
    mapView: Awaited<ReturnType<typeof createExampleMap>>["mapView"],
    hud: HTMLElement
): void {
    const state = { ...INITIAL };
    const refreshHud = (): void => {
        hud.textContent =
            `mapView.env dynamic properties:\n` +
            `mix=${Number(state[PROP.mix]).toFixed(2)}  dotColor=${state[PROP.dotColor]}  ` +
            `dotSize=${state[PROP.dotSize]}  showRoute=${state[PROP.showRoute]}`;
    };

    const gui = createExampleGui();
    applyPanelStyle(gui.domElement);
    const folder = gui.addFolder("Dynamic Properties");
    folder
        .add(state, PROP.mix, 0, 1, 0.01)
        .name("zone blend")
        .onChange(value => mapView.setDynamicProperty(PROP.mix, value));
    folder
        .addColor(state, PROP.dotColor)
        .name("dot color")
        .onChange(value =>
            // Writes mapView.env and triggers mapView.update() internally.
            mapView.setDynamicProperty(PROP.dotColor, value)
        );
    folder
        .add(state, PROP.dotSize, 2, 20, 1)
        .name("dot size (px)")
        .onChange(value => mapView.setDynamicProperty(PROP.dotSize, value));
    folder
        .add(state, PROP.showRoute)
        .name("show route")
        .onChange(value => mapView.setDynamicProperty(PROP.showRoute, value));
    folder.open();

    // Seed the environment once so the initial theme evaluates real values.
    for (const [name, value] of Object.entries(state)) {
        mapView.setDynamicProperty(name, value);
    }
    refreshHud();
}

/** Example entry: offline map with three volatile style sets. */
async function main(): Promise<void> {
    const canvas = document.getElementById("mapCanvas") as HTMLCanvasElement;

    const { mapView } = await createExampleMap(canvas, {
        themeObject: buildDynamicTheme(),
        lookAt: { target: CENTER, zoomLevel: 14.8, tilt: 0, heading: 0 }
    });
    logExampleInfo("styling-dynamic-props", mapView);

    // Imagery ground layer with offline debug-grid fallback.
    await createImageryWithFallback(mapView, demoImagery({ provider: "arcgis" }));

    // Seed the environment BEFORE adding data sources, so the first decode
    // already evaluates real values instead of `null`.
    setupDynamicGui(mapView, createPropertyHud());

    for (const [name, styleSetName, data] of [
        ["dynamic-zones-src", "dynamic-zones", buildZones()],
        ["dynamic-dots-src", "dynamic-dots", buildDots()],
        ["dynamic-route-src", "dynamic-route", buildRoute()]
    ] as const) {
        const dataSource = new FeaturesDataSource({
            name,
            styleSetName,
            maxDataLevel: 14
        });
        dataSource.setFromGeojson(data);
        await mapView.addDataSource(dataSource);
    }
}

void main();
