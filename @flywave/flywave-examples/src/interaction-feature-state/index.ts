/* Copyright (C) 2025 flywave.gl contributors */

/**
 * Feature state fundamentals (v2): click-to-highlight with `setFeatureState`.
 *
 * Verified engine contract (flywave-dev rule 7 and source audit):
 * - `DataSource.setFeatureState(featureId, state)` / `getFeatureState` /
 *   `removeFeatureState` store per-feature state on the MAIN thread; the
 *   `["feature-state", "key"]` style expression reads it back. NOTE: setting
 *   state does NOT schedule a redraw — call `mapView.update()` afterwards.
 * - The `feature-state` operator exists (`FeatureOperators.ts` in
 *   datasource-protocol), but `StyleSetEvaluator` only honors it for the
 *   `enabled` style attribute ("feature-state is not supported in this
 *   context" is logged for every other attribute). So it CAN toggle feature
 *   visibility, but it CANNOT drive a fill color.
 * - Therefore this example uses BOTH mechanisms where each is legal:
 *   1) `enabled: ["!", ["coalesce", ["feature-state", "hidden"], false]]`
 *      hides the selected cell through real feature state;
 *   2) the fill-color highlight rewrites a data property (`selected`) in the
 *      local GeoJSON model and re-pushes it with `setFromGeojson` (worker
 *      re-decode), because `["feature-state", ...]` in `color` would be
 *      silently unsupported.
 * - `PickResult.featureId` is a LAZY GPU-pick field: it is resolved on first
 *   read via a single deferred raycast frozen at pick time. If the camera has
 *   moved since, or the picked object has no `$id` (GeoJSON feature top-level
 *   `id`), it may be `undefined` — always check before use.
 */

import { FeaturesDataSource } from "@flywave/flywave.gl";
import * as THREE from "three/webgpu";

import {
    applyPanelStyle,
    createExampleGui,
    createExampleMap,
    createImageryWithFallback,
    demoImagery,
    InfoWindow,
    logExampleInfo
} from "../common";

import {
    buildGeojson,
    buildTheme,
    CELL_SIZE,
    DISTRICTS,
    GRID_COLS,
    GRID_ORIGIN,
    GRID_ROWS
} from "./demo-cells";

/** The single DataSource feature state key written on selection. */
const STATE_KEY = "selected";

/** Status HUD: current selection, its raw feature state, hover feedback. */
function createStatusPanel(): HTMLDivElement {
    const panel = document.createElement("div");
    Object.assign(panel.style, {
        position: "absolute",
        left: "12px",
        top: "12px",
        padding: "10px 14px",
        font: "12px/1.7 monospace",
        color: "#e8eaed",
        whiteSpace: "pre-line",
        pointerEvents: "none",
        minWidth: "260px"
    } as CSSStyleDeclaration);
    applyPanelStyle(panel);
    document.body.appendChild(panel);
    return panel;
}

/** Feature-state demo: pick, select, restyle, inspect and reset state. */
async function main(): Promise<void> {
    const canvas = document.getElementById("mapCanvas") as HTMLCanvasElement;
    const { mapView } = await createExampleMap(canvas, {
        themeObject: buildTheme(),
        lookAt: {
            target: {
                lat: GRID_ORIGIN.lat + (GRID_ROWS * CELL_SIZE.lat) / 2,
                lng: GRID_ORIGIN.lng + (GRID_COLS * CELL_SIZE.lng) / 2
            },
            zoomLevel: 12.5,
            tilt: 40,
            heading: 15
        }
    });
    logExampleInfo("interaction-feature-state", mapView);

    // Imagery ground layer with offline debug-grid fallback.
    await createImageryWithFallback(mapView, demoImagery({ provider: "arcgis" }));

    let selectedId: string | null = null;
    let hoverId: string | null = null;
    let hiddenSelected = false;

    const dataSource = new FeaturesDataSource({
        name: "feature-state-cells",
        styleSetName: "cells",
        maxDataLevel: 12
    });
    dataSource.setFromGeojson(buildGeojson(null));
    await mapView.addDataSource(dataSource);

    const infoWindow = new InfoWindow(mapView);
    const panel = createStatusPanel();

    /** Re-push the GeoJSON so the color expression sees the new property. */
    const applySelection = (id: string | null): void => {
        selectedId = id;
        // setFromGeojson overwrites the collection and re-decodes its tiles.
        dataSource.setFromGeojson(buildGeojson(id));
        mapView.update();
    };

    /** Write DataSource state for the current selection and refresh UI. */
    const syncFeatureState = (): void => {
        // Start from a clean slate: state is keyed by feature id string.
        dataSource.clearFeatureState();
        if (selectedId !== null) {
            // Same state shape the `enabled` expression reads in the theme.
            dataSource.setFeatureState(selectedId, {
                [STATE_KEY]: true,
                hidden: hiddenSelected
            });
        }
        // setFeatureState does not request a redraw — do it explicitly.
        mapView.update();
        refreshPanel();
    };

    /** Feature id from a pick result, with the lazy-field contract applied. */
    const featureIdOf = (pick: { featureId?: number | string } | undefined): string | null => {
        // Lazy field: resolved by a frozen deferred raycast on first read;
        // undefined when the object was unloaded or carries no GeoJSON `id`.
        const id = pick?.featureId;
        return typeof id === "string" ? id : null;
    };

    const refreshPanel = (): void => {
        const name =
            selectedId !== null
                ? DISTRICTS.find(district => district.id === selectedId)?.name
                : undefined;
        const state = selectedId !== null ? dataSource.getFeatureState(selectedId) : undefined;
        panel.textContent =
            `selected: ${selectedId ?? "-"}${name ? ` (${name})` : ""}\n` +
            `feature state: ${state ? JSON.stringify(state) : "-"}\n` +
            `hover: ${hoverId ?? "-"}\n` +
            `hide-selected (feature-state): ${hiddenSelected ? "on" : "off"}`;
    };

    // Click: GPU-pick, then flip the selection. featureId is lazy — reading
    // it right after intersectMapObjects is exact for this frame.
    canvas.addEventListener("click", e => {
        const results = mapView.intersectMapObjects(e.layerX, e.layerY);
        const id = featureIdOf(results[0]);
        if (id === null) {
            // PickResult.featureId is undefined on miss: either nothing was
            // hit, or the hit feature carries no GeoJSON top-level `id`.
            infoWindow.hide();
            mapView.update();
            return;
        }
        applySelection(id === selectedId ? null : id);
        syncFeatureState();
        if (selectedId !== null) {
            const district = DISTRICTS.find(entry => entry.id === selectedId);
            // `point` is an eager PickResult field (declared Vector2|Vector3;
            // object picks always carry the 3D world point).
            const point = results[0].point;
            if (point instanceof THREE.Vector3) {
                infoWindow.show(
                    mapView.projection.unprojectPoint(point),
                    `<b>${district?.name ?? selectedId}</b><br>` +
                        `feature id: ${selectedId}<br>` +
                        `state: ${JSON.stringify(dataSource.getFeatureState(selectedId))}`
                );
            }
        } else {
            infoWindow.hide();
        }
    });

    // Hover: throttle picking to every 80 ms so mousemove stays cheap. The
    // hover effect is UI-only (cursor + panel); a color change here would
    // re-decode tiles on every move.
    let lastHoverCheck = 0;
    canvas.addEventListener("mousemove", e => {
        const now = performance.now();
        if (now - lastHoverCheck < 80) {
            return;
        }
        lastHoverCheck = now;
        const results = mapView.intersectMapObjects(e.layerX, e.layerY);
        const id = featureIdOf(results[0]);
        if (id !== hoverId) {
            hoverId = id;
            canvas.style.cursor = id !== null ? "pointer" : "default";
            refreshPanel();
        }
    });

    const gui = createExampleGui();
    applyPanelStyle(gui.domElement);
    const folder = gui.addFolder("Feature State");
    folder
        .add({ hidden: hiddenSelected }, "hidden")
        .name("hide selected (state)")
        .onChange(value => {
            hiddenSelected = value;
            // Pure feature-state round trip: no GeoJSON rewrite, the `enabled`
            // attribute re-evaluates against the stored state on next render.
            syncFeatureState();
        });
    folder
        .add(
            {
                reset: () => {
                    // removeFeatureState on the one keyed entry, then clear
                    // the visual selection and dismiss the info window.
                    if (selectedId !== null) {
                        dataSource.removeFeatureState(selectedId);
                    }
                    applySelection(null);
                    hiddenSelected = false;
                    infoWindow.hide();
                    refreshPanel();
                }
            },
            "reset"
        )
        .name("Reset selection");
    folder.open();

    refreshPanel();
    mapView.update();
}

void main();
