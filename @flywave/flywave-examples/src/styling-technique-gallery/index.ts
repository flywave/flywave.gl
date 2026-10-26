/* Copyright (C) 2025 flywave.gl contributors */

/**
 * Technique gallery (v2): six rendering techniques from one offline
 * `FeaturesDataSource`, each selected by a `when` filter on a `group`
 * feature property, all visible in the same scene:
 *
 * - `fill` — flat polygon fill (park cells);
 * - `extruded-polygon` — expression-driven extrusion (building blocks);
 * - `solid-line` — wide dashed line (the dash look is controlled by the
 *   `dashes` attr, `LineDashes = "Square" | "Round" | "Diamond"`, and only
 *   kicks in when `gapSize` > 0; `dashColor`/`dashSize` complete the set);
 * - `labeled-icon` — point with a texture icon plus label text;
 * - `text` — plain screen-space text labels;
 * - `circles` — pixel-sized point cloud (sibling `squares` shares the same
 *   `PointTechniqueParams`).
 *
 * Toggling a technique rebuilds the inline theme and applies it with
 * `mapView.setTheme(...)`. Why not `patchTheme`? `patchTheme` is a sync
 * deep-merge that refuses the async theme sections — `styles`, `definitions`,
 * `images`, `fontCatalogs`, `extends`, ... — it only logs a warning for them.
 * Restyling geometry always goes through the async `setTheme`, which
 * re-decodes the affected tiles (same contract as styling-extrusion-bars).
 */

import {
    type FeatureCollection,
    type JsonExpr,
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

/** The technique groups shown in the gallery, in sidebar order. */
type GalleryGroup = "area" | "building" | "route" | "poi" | "label" | "dots";

/** Bilingual sidebar content: one entry per technique group. */
const GROUP_INFO: Record<GalleryGroup, { technique: string; en: string }> = {
    area: { technique: "fill", en: "flat polygon fill" },
    building: { technique: "extruded-polygon", en: "extruded 3D blocks" },
    route: { technique: "solid-line", en: "wide dashed line" },
    poi: { technique: "labeled-icon", en: "icon point with label" },
    label: { technique: "text", en: "plain text label" },
    dots: { technique: "circles", en: "pixel-sized point cloud" }
};

/** Scene center (Jinan, Shandong). */
const CENTER = new GeoCoordinates(36.6512, 117.1201);

/** Helper: GeoJSON ring (closed, first == last) from an NW corner and size. */
function ring(lng: number, lat: number, dLng: number, dLat: number): number[][] {
    return [
        [lng, lat],
        [lng + dLng, lat],
        [lng + dLng, lat + dLat],
        [lng, lat + dLat],
        [lng, lat]
    ];
}

/**
 * Build the offline GeoJSON: every feature carries a `group` property used by
 * the theme's `when` filters (and by the sidebar/GUI), plus per-group extras.
 */
function buildGalleryGeojson(): FeatureCollection {
    const features: FeatureCollection["features"] = [];
    const push = (
        group: GalleryGroup,
        geometry: FeatureCollection["features"][number]["geometry"],
        properties: Record<string, unknown> = {}
    ): void => {
        features.push({ type: "Feature", properties: { group, ...properties }, geometry });
    };

    // fill: two flat park cells.
    push("area", { type: "Polygon", coordinates: [ring(117.113, 36.6485, 0.005, 0.0035)] });
    push("area", { type: "Polygon", coordinates: [ring(117.113, 36.6535, 0.005, 0.0035)] });

    // extruded-polygon: six blocks with an attribute-driven height.
    for (let i = 0; i < 6; i++) {
        const lng = 117.1205 + (i % 3) * 0.0045;
        const lat = 36.649 + Math.floor(i / 3) * 0.0045;
        push(
            "building",
            { type: "Polygon", coordinates: [ring(lng, lat, 0.003, 0.0028)] },
            { floors: 3 + i * 2 }
        );
    }

    // solid-line: two routes; the first one uses the dashed look.
    push(
        "route",
        {
            type: "LineString",
            coordinates: [
                [117.1125, 36.647],
                [117.1245, 36.647],
                [117.1285, 36.6505],
                [117.1285, 36.658]
            ]
        },
        { dashed: true }
    );
    push("route", {
        type: "LineString",
        coordinates: [
            [117.1125, 36.6585],
            [117.1285, 36.6545]
        ]
    });
    // labeled-icon + text: POIs (icon) and standalone labels (text only).
    push("poi", { type: "Point", coordinates: [117.1215, 36.6532] }, { name: "Gallery Hub" });
    push("poi", { type: "Point", coordinates: [117.126, 36.6496] }, { name: "North Hall" });
    push("label", { type: "Point", coordinates: [117.1155, 36.6502] }, { name: "West Park" });
    push("label", { type: "Point", coordinates: [117.1255, 36.6564] }, { name: "East Park" });

    // circles: a 4 x 3 grid of points.
    for (let i = 0; i < 12; i++) {
        const lng = 117.1135 + (i % 4) * 0.0035;
        const lat = 36.6605 + Math.floor(i / 4) * 0.0025;
        push("dots", { type: "Point", coordinates: [lng, lat] });
    }
    return { type: "FeatureCollection", features };
}

/** Style entries for each active group, keyed by technique. */
function buildStyleEntries(active: ReadonlySet<GalleryGroup>): Theme["styles"] {
    const entries: Theme["styles"] = { gallery: [] };
    const styles = entries.gallery!;
    // add pushes the style entry only while its group is toggled on.
    const add = (group: GalleryGroup, style: (typeof styles)[number]): void => {
        if (active.has(group)) {
            styles.push(style);
        }
    };
    const when = (group: GalleryGroup, geometryType: string): JsonExpr => [
        "all",
        ["==", ["geometry-type"], geometryType],
        ["==", ["get", "group"], group]
    ];

    add("area", {
        when: when("area", "Polygon"),
        technique: "fill",
        attr: { color: "#A7C957", opacity: 0.5 }
    });
    add("building", {
        when: when("building", "Polygon"),
        technique: "extruded-polygon",
        attr: {
            // Attribute-driven height: 1 floor -> 12 world units.
            height: ["*", ["get", "floors"], 12],
            color: "#E76F51",
            footprint: true,
            lineColor: "#6B2D14",
            lineWidth: 1
        }
    });
    add("route", {
        when: when("route", "LineString"),
        technique: "solid-line",
        attr: {
            color: "#1D3557",
            lineWidth: ["interpolate", ["linear"], ["zoom"], 13, 4, 16, 12],
            metricUnit: "Pixel",
            // Dash look: only active when gapSize > 0; `dashes` picks the
            // cut shape ("Square" | "Round" | "Diamond").
            dashes: "Round",
            dashSize: 30,
            gapSize: 18,
            dashColor: "#F1FAEE",
            caps: "Round"
        }
    });
    add("poi", {
        when: when("poi", "Point"),
        technique: "labeled-icon",
        attr: {
            text: ["get", "name"],
            imageTexture: "circle-stroked-11",
            iconScale: 1.2,
            size: 22,
            color: "#1A202C",
            backgroundOpacity: 0,
            vAlignment: "Above",
            hAlignment: "Center",
            priority: 80
        }
    });
    add("label", {
        when: when("label", "Point"),
        technique: "text",
        attr: {
            text: ["get", "name"],
            color: "#2B2D42",
            backgroundOpacity: 0,
            size: 26,
            priority: 60
        }
    });
    add("dots", {
        when: when("dots", "Point"),
        technique: "circles",
        attr: { color: "#457B9D", size: 8, opacity: 0.9, enablePicking: true }
    });
    return entries;
}

/** Build the full inline theme for the currently active groups. */
function buildTheme(active: ReadonlySet<GalleryGroup>): Theme {
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
        styles: buildStyleEntries(active)
    };
}

/** Bilingual HTML sidebar listing every technique and its purpose. */
function createSidebar(): NodeListOf<HTMLElement> {
    const sidebar = document.createElement("div");
    sidebar.style.cssText =
        "position:absolute;left:16px;top:16px;width:300px;max-height:72%;overflow-y:auto;" +
        "padding:10px 14px;color:#fff;font:12px/1.6 sans-serif;";
    applyPanelStyle(sidebar);
    sidebar.innerHTML =
        "<strong>Technique Gallery</strong><br>" +
        Object.entries(GROUP_INFO)
            .map(
                ([group, info]) =>
                    `<div data-group="${group}" style="margin-top:4px">` +
                    `<code>${info.technique}</code> — ${info.en}<</div>`
            )
            .join("");
    document.body.appendChild(sidebar);
    return sidebar.querySelectorAll("[data-group]");
}

/** Wire the GUI: one checkbox per technique; each change re-applies the theme. */
function setupGalleryGui(mapView: Awaited<ReturnType<typeof createExampleMap>>["mapView"]): void {
    // Active groups; all six visible on first paint.
    const active = new Set<GalleryGroup>(Object.keys(GROUP_INFO) as GalleryGroup[]);
    const dots = createSidebar();

    // Async on purpose: `styles` is an async theme section, so only setTheme
    // (full re-decode) can restyle the geometry.
    const applyTheme = (): Promise<Theme> => mapView.setTheme(buildTheme(active));

    const gui = createExampleGui();
    applyPanelStyle(gui.domElement);
    const folder = gui.addFolder("Techniques");
    (Object.keys(GROUP_INFO) as GalleryGroup[]).forEach(group => {
        const state = { [group]: true };
        folder
            .add(state, group)
            .name(`${GROUP_INFO[group].technique}`)
            .onChange((visible: boolean) => {
                if (visible) {
                    active.add(group);
                } else {
                    active.delete(group);
                }
                dots.forEach(dot => {
                    dot.style.opacity = active.has(dot.dataset.group as GalleryGroup)
                        ? "1"
                        : "0.35";
                });
                void applyTheme();
            });
    });
    folder.open();
}

/** Example entry: offline map with one style set covering six techniques. */
async function main(): Promise<void> {
    const canvas = document.getElementById("mapCanvas") as HTMLCanvasElement;

    const { mapView } = await createExampleMap(canvas, {
        themeObject: buildTheme(new Set(Object.keys(GROUP_INFO) as GalleryGroup[])),
        lookAt: {
            target: { lat: CENTER.lat, lng: CENTER.lng },
            zoomLevel: 14.5,
            tilt: 32,
            heading: 12
        }
    });
    logExampleInfo("styling-technique-gallery", mapView);

    // Imagery ground layer with offline debug-grid fallback; the setTheme
    // toggles below re-decode tiles but never remove this source.
    await createImageryWithFallback(mapView, demoImagery({ provider: "arcgis" }));

    const dataSource = new FeaturesDataSource({
        name: "technique-gallery",
        styleSetName: "gallery",
        maxDataLevel: 14
    });
    dataSource.setFromGeojson(buildGalleryGeojson());
    await mapView.addDataSource(dataSource);

    setupGalleryGui(mapView);
}

void main();
