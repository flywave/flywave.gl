/* Copyright (C) 2025 flywave.gl contributors */

/**
 * Raster web tiles example (v2): serve plain image tiles from a URL template.
 *
 * What it shows:
 * - the three demo imagery providers from `common/datasources.ts` ("arcgis",
 *   "osm", "gibs") plus a hand-written {@link CustomWebTileDataSource}, so
 *   every URL-template placeholder is documented next to a working preset;
 * - **runtime provider switching**: `mapView.removeDataSource(old)` then
 *   `createImageryWithFallback(mapView, next)` — data source names must stay
 *   unique per map, so the previous layer is always removed first;
 * - **copyright attribution**: `CopyrightElementHandler` keeps the shared
 *   `#copyrightNotice` element (bottom right) in sync with the copyright
 *   reported by the currently rendered data sources. Each provider declares
 *   its own `copyrightInfo`, so the corner label changes with the dropdown.
 *
 * URL template placeholders understood by `CustomWebTileDataSource`:
 * - `{z}` / `{x}` / `{y}`: tile level / column / row (XYZ scheme);
 * - `{-y}`: TMS row (flipped Y axis);
 * - `{s}`: one entry of the `subdomains` array, picked per request.
 */

import { type GUI } from "dat.gui";

import {
    type DataSource,
    type MapView,
    type WebTileDataSource,
    CopyrightElementHandler,
    CustomWebTileDataSource,
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

/** Scene center: Beijing, covered by every provider below. */
const CENTER = new GeoCoordinates(39.9042, 116.4074);

/**
 * Imagery presets offered by the GUI dropdown. The first three map onto the
 * `demoImagery` factory; "custom" demonstrates the raw URL template path.
 */
type ProviderPreset = "arcgis" | "osm" | "gibs" | "custom";

const PROVIDERS: ProviderPreset[] = ["arcgis", "osm", "gibs", "custom"];

/** One-line docs per preset, shown in the info panel when switching. */
const PROVIDER_INFO: Record<ProviderPreset, string> = {
    arcgis: "ArcGISWebTileDataSource — Esri World Imagery (copyright resolved per tile).",
    osm: "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png — {s} balances a/b/c.",
    gibs:
        "https://gibs.earthdata.nasa.gov/.../{date}/GoogleMapsCompatible_Level9/{z}/{y}/{x}.jpg " +
        "— NASA GIBS, maxDataLevel 9 (blurrier when zoomed in).",
    custom: "https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png — subdomains a/b/c, XYZ scheme."
};

/**
 * Create the imagery source for one preset. The three factory presets carry
 * their `copyrightInfo` inside `common/datasources.ts`; the custom preset
 * shows the full hand-written `CustomWebTileDataSource` construction.
 */
function createImagery(provider: ProviderPreset): WebTileDataSource {
    if (provider === "custom") {
        return new CustomWebTileDataSource({
            name: "opentopomap",
            // XYZ template: {z}oom, {x} column, {y} row; {s} rotates the
            // subdomains below; use {-y} instead of {y} for TMS servers.
            tileUrlTemplate: "https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png",
            subdomains: ["a", "b", "c"],
            minDataLevel: 0,
            maxDataLevel: 17,
            // Without this the handler shows a generic "Custom Tiles" label.
            copyrightInfo: {
                id: "opentopomap.org",
                year: new Date().getFullYear(),
                label: "OpenTopoMap (CC-BY-SA)",
                link: "https://www.opentopomap.org"
            }
        });
    }
    return demoImagery({ provider });
}

/** The data source currently attached to the view (imagery or fallback grid). */
let activeSource: DataSource | null = null;

/**
 * Swap the active imagery layer: remove first (names are unique per map),
 * then add the next preset through the offline fallback helper.
 *
 * @returns The name of the data source that ended up attached.
 */
async function switchImagery(mapView: MapView, provider: ProviderPreset): Promise<string> {
    if (activeSource !== null) {
        await mapView.removeDataSource(activeSource);
        activeSource = null;
    }
    // On failure (offline, blocked server) the helper swaps in a debug grid
    // named `<provider>-debug-grid` and returns that instead.
    activeSource = await createImageryWithFallback(mapView, createImagery(provider));
    return activeSource.name;
}

/** Info panel describing the active preset and its URL template. */
function createInfoPanel(): HTMLElement {
    const panel = document.createElement("div");
    Object.assign(panel.style, {
        position: "absolute",
        left: "16px",
        bottom: "16px",
        maxWidth: "420px",
        padding: "8px 12px",
        color: "#fff",
        font: "12px/1.5 monospace",
        whiteSpace: "pre-wrap"
    } as CSSStyleDeclaration);
    applyPanelStyle(panel);
    document.body.appendChild(panel);
    return panel;
}

/** Example entry: map, copyright corner label, provider dropdown, info panel. */
async function main(): Promise<void> {
    const canvas = document.getElementById("mapCanvas") as HTMLCanvasElement;

    const { mapView } = await createExampleMap(canvas, {
        lookAt: { target: { lat: CENTER.lat, lng: CENTER.lng }, zoomLevel: 10 }
    });
    logExampleInfo("data-raster-tiles", mapView);

    // Keeps the shared #copyrightNotice element (bottom right) in sync with
    // the copyright of the sources currently on screen. GIBS sits at
    // maxDataLevel 9: zoom closer and the label still lists ArcGIS after the
    // fallback parent tiles stop being GIBS imagery.
    CopyrightElementHandler.install("copyrightNotice", mapView);

    const panel = createInfoPanel();

    const gui: GUI = createExampleGui();
    applyPanelStyle(gui.domElement);
    const folder = gui.addFolder("Imagery Provider");

    const state = { provider: "arcgis" as ProviderPreset, busy: false };
    folder
        .add(state, "provider", PROVIDERS)
        .name("Provider")
        .onChange((provider: ProviderPreset) => {
            if (state.busy) {
                return;
            }
            state.busy = true;
            void switchImagery(mapView, provider).then(name => {
                panel.textContent = `${provider} — ${PROVIDER_INFO[provider]}\nattached: "${name}"`;
                state.busy = false;
            });
        });
    folder.open();

    const initialName = await switchImagery(mapView, state.provider);
    panel.textContent = `${state.provider} — ${
        PROVIDER_INFO[state.provider]
    }\nattached: "${initialName}"`;
}

void main();
