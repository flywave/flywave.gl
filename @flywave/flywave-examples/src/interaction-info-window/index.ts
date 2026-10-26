/* Copyright (C) 2025 flywave.gl contributors */

/**
 * InfoWindow masterclass (v2): HTML popups anchored to geo coordinates.
 *
 * How the common component works (see `common/info-window.ts`): the window is
 * a plain DOM overlay positioned with CSS `transform`. On EVERY
 * `MapViewEventNames.AfterRender` it projects its stored geo anchor with
 * `mapView.getScreenPosition` (which handles the relative-to-eye frame
 * conversion internally) and repositions itself; when the anchor cannot be
 * projected (behind the camera / outside the frustum) the window HIDES
 * automatically and reappears when the anchor becomes visible again.
 *
 * Overlay strategy notes — DOM-follow vs MapAnchor:
 * - InfoWindow (DOM overlay): best for text popups. Zero scene-graph impact
 *   (needs no `mapView.update()`), always screen-readable, but it never
 *   occludes or participates in picking.
 * - MapAnchor (3D marker): best for objects that must occlude, be picked or
 *   draw over/under labels; repositioned by the engine each frame. Use it
 *   when the marker is content; use InfoWindow when the popup is chrome.
 */

import { type MapView, GeoCoordinates } from "@flywave/flywave.gl";

import {
    applyPanelStyle,
    attachTerrainImagery,
    createExampleGui,
    createExampleMap,
    demoTerrain,
    InfoWindow,
    logExampleInfo
} from "../common";

/** Demo site: inside the local `resources/dem_terrain` coverage (Shandong). */
const SITE = { lat: 36.4862, lng: 118.1727 };

/**
 * Build arbitrary DOM content: a small attribute table. `show` accepts an
 * HTMLElement as well as an HTML string, so any widget can live in a window.
 */
function buildDetailTable(geo: GeoCoordinates, worldZ: number | null): HTMLElement {
    const table = document.createElement("table");
    table.style.cssText = "border-collapse:collapse;margin-top:4px";
    const rows: Array<[string, string]> = [
        ["latitude", geo.latitude.toFixed(6) + "°"],
        ["longitude", geo.longitude.toFixed(6) + "°"],
        ["altitude", geo.altitude !== undefined ? geo.altitude.toFixed(1) + " m" : "0 m"],
        ["terrain height", worldZ !== null ? worldZ.toFixed(1) + " m" : "n/a"]
    ];
    for (const [key, value] of rows) {
        const tr = document.createElement("tr");
        const tdKey = document.createElement("td");
        tdKey.textContent = key;
        tdKey.style.cssText = "padding:1px 8px 1px 0;opacity:.7";
        const tdValue = document.createElement("td");
        tdValue.textContent = value;
        tr.append(tdKey, tdValue);
        table.appendChild(tr);
    }
    return table;
}

/** Read the DEM height under a geo point (CPU query on the elevation source). */
function terrainHeight(
    geo: GeoCoordinates,
    terrain: ReturnType<typeof demoTerrain>
): number | null {
    const height = terrain.getElevationProvider()?.getHeight(geo);
    return typeof height === "number" ? height : null;
}

/** Info window demo: single/multi windows, pixelOffset and DOM content. */
async function main(): Promise<void> {
    const canvas = document.getElementById("mapCanvas") as HTMLCanvasElement;
    const { mapView } = await createExampleMap(canvas, {
        theme: "resources/tilezen_base_globe.json",
        controlsUi: "compact",
        lookAt: { target: { lat: SITE.lat, lng: SITE.lng }, zoomLevel: 14.5, tilt: 45 }
    });
    logExampleInfo("interaction-info-window", mapView);

    // Offline-friendly scene: local DEM terrain (also gives us heights to
    // display) with satellite imagery draped INTO the terrain tiles.
    // (Imagery must live inside the terrain source — an independent layer
    // would be coplanar with the draped surface and depth-fight.)
    const terrain = demoTerrain();
    mapView.setElevationSource(terrain);
    attachTerrainImagery(terrain);

    // Mode A: ONE shared window — showing a new geo anchor moves it.
    const singleWindow = new InfoWindow(mapView);
    // Mode B: TWO windows — pin one, then keep clicking with the other.
    // `pixelOffset` lifts the pinned window higher above its anchor point
    // (default is { x: 0, y: -12 }).
    const pinnedWindow = new InfoWindow(mapView, {
        pixelOffset: { x: 0, y: -48 },
        className: "fw-info-window-pinned"
    });
    const freeWindow = new InfoWindow(mapView);

    let multiMode = false;

    /** Show the shared window (or the free one in multi mode) at a click. */
    const showAt = (geo: GeoCoordinates, worldZ: number | null): void => {
        const window = multiMode ? freeWindow : singleWindow;
        // HTML string content: coordinates plus elevation, escaped trivially
        // because every value is generated, never user input.
        window.show(
            geo,
            `<b>Surface click</b><br>` +
                `${geo.latitude.toFixed(5)}, ${geo.longitude.toFixed(5)}<br>` +
                `height: ${worldZ !== null ? worldZ.toFixed(0) + " m" : "n/a"}`
        );
        // HTMLElement content variant: the same API accepts DOM nodes, here a
        // small table built by buildDetailTable.
        if (multiMode) {
            pinnedWindow.show(geo, buildDetailTable(geo, worldZ));
        }
    };

    canvas.addEventListener("click", e => {
        // 1) Screen point -> world point. getWorldPositionAt reads the GPU
        //    depth (math-surface fallback internally); null when the click
        //    missed the globe, e.g. sky.
        const worldPos = mapView.getWorldPositionAt(e.layerX, e.layerY);
        if (worldPos === null) {
            singleWindow.hide();
            freeWindow.hide();
            return;
        }
        // 2) World point -> geo coordinates. The unprojected point sits on
        //    the rendered surface (terrain included) in the geo frame.
        const geo = mapView.projection.unprojectPoint(worldPos);
        showAt(geo, terrainHeight(geo, terrain));
    });

    const hud = document.createElement("div");
    Object.assign(hud.style, {
        position: "absolute",
        left: "12px",
        top: "12px",
        padding: "10px 14px",
        font: "12px/1.7 sans-serif",
        color: "#e8eaed",
        whiteSpace: "pre-line",
        pointerEvents: "none"
    } as CSSStyleDeclaration);
    applyPanelStyle(hud);
    const refreshHud = (): void => {
        hud.textContent =
            `mode: ${multiMode ? "multi-window (pinned + free)" : "single-window"}\n` +
            `single: ${singleWindow.visible ? "visible" : "hidden"} | ` +
            `pinned: ${pinnedWindow.visible ? "visible" : "hidden"} | ` +
            `free: ${freeWindow.visible ? "visible" : "hidden"}\n` +
            "Windows hide automatically while their anchor is\n" +
            "behind the camera, and reappear when it returns.";
    };
    document.body.appendChild(hud);

    const gui = createExampleGui();
    applyPanelStyle(gui.domElement);
    const folder = gui.addFolder("Info Window");
    folder
        .add({ multi: multiMode }, "multi")
        .name("multi-window mode")
        .onChange(value => {
            multiMode = value;
            if (!value) {
                pinnedWindow.hide();
                freeWindow.hide();
            } else {
                singleWindow.hide();
            }
            refreshHud();
        });
    folder
        .add(
            {
                recenter: () => {
                    // Fly back to the pinned demo anchor; windows stay bound
                    // to their geo anchors and reproject on every frame.
                    void mapView.flyTo({
                        target: new GeoCoordinates(SITE.lat, SITE.lng),
                        zoomLevel: 14.5,
                        tilt: 45,
                        duration: 3
                    });
                }
            },
            "recenter"
        )
        .name("Fly to site");
    folder
        .add(
            {
                hideAll: () => {
                    singleWindow.hide();
                    pinnedWindow.hide();
                    freeWindow.hide();
                    refreshHud();
                }
            },
            "hideAll"
        )
        .name("Hide all");
    folder.open();

    // Show a first window at the site so the behavior is discoverable.
    singleWindow.show(
        new GeoCoordinates(SITE.lat, SITE.lng),
        "<b>InfoWindow</b><br>click anywhere on the surface"
    );
    refreshHud();
    mapView.update();
}

void main();
