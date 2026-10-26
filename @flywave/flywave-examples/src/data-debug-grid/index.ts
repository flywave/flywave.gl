/* Copyright (C) 2025 flywave.gl contributors */

/**
 * Debug grid example (v2): visualize the tile schedule and learn how a custom
 * `DataSource` is written.
 *
 * Two jobs in one example:
 * 1. **Tile visualization** — `DebugGridDataSource` (from `common/`) draws a
 *    red outline per rendered tile, making the quadtree scheduler visible:
 *    which tiles are elected, and where fallback tiles come from. The HUD
 *    shows the camera zoom and the tile key under the view center.
 * 2. **Custom DataSource teaching** — writing a minimal data source means:
 *    - extend `DataSource` and pass options `{ name, minDataLevel,
 *      maxDataLevel, storageLevelOffset }` to `super()`;
 *    - override `getTilingScheme()` (which grid the map subdivides into);
 *    - override `getTile(tileKey)` and fill `tile.objects` with three.js
 *      objects in the tile-local (camera-relative) frame — `DebugGridTile`
 *      in `common/datasources.ts` is the living minimal example;
 *    - optionally override `canGetTile(zoomLevel, tileKey)` to filter which
 *      levels are produced, and set `cacheable` / `enablePicking`.
 *    Sources that build geometry directly need no worker or decoder.
 *
 * The GUI edits `maxVisibleDataSourceTiles` and `quadTreeSearchDistanceUp/Down`
 * — real `MapViewOptions` fields (defaults 400 / 3 / 2). They configure the
 * visible-tile scheduler at construction and `MapView` exposes no runtime
 * setters, so "Apply" rebuilds the view with the new options: shrink the tile
 * budget or the search distances and watch the grid patch up while panning.
 * The shared `createExampleMap` factory does not forward these options, which
 * is why this example wires `MapView` itself.
 */

import {
    type MapViewOptions,
    CopyrightElementHandler,
    GeoCoordinates,
    MapControls,
    MapControlsUI,
    MapView,
    MapViewEventNames,
    TileKeyUtils,
    mercatorProjection,
    webMercatorTilingScheme
} from "@flywave/flywave.gl";

import {
    applyPanelStyle,
    createExampleGui,
    createImageryWithFallback,
    DebugGridDataSource,
    demoImagery
} from "../common";

import { shouldForceWebGL } from "../common-webgl-debug";

/** Scene center: Beijing — any point works, the grid is global. */
const CENTER = { lat: 39.9042, lng: 116.4074 };

/** Initial camera zoom, also restored after every rebuild. */
const ZOOM_LEVEL = 13;

/**
 * Tile scheduler options, mirrored by the GUI. Field names follow
 * `MapViewOptions` exactly; values start at the engine defaults.
 */
interface ISchedulerSettings {
    maxVisibleDataSourceTiles: number;
    quadTreeSearchDistanceUp: number;
    quadTreeSearchDistanceDown: number;
}

/** Current scheduler settings (rebuilt into the view on "apply"). */
const settings: ISchedulerSettings = {
    maxVisibleDataSourceTiles: 400,
    quadTreeSearchDistanceUp: 3,
    quadTreeSearchDistanceDown: 2
};

/** One built view plus its teardown, mirroring `ExampleMapHandle`. */
interface IGridMapHandle {
    mapView: MapView;
    dispose(): void;
}

/**
 * Build one map instance with the current scheduler settings. A fresh canvas
 * replaces the old one: `MapView.dispose()` releases the GPU context of its
 * canvas and re-initializing a backend on the same element is not guaranteed,
 * so the element itself is swapped instead.
 */
async function buildMap(previous: IGridMapHandle | null): Promise<IGridMapHandle> {
    previous?.dispose();
    const oldCanvas = document.getElementById("mapCanvas") as HTMLCanvasElement;
    const canvas = oldCanvas.cloneNode(false) as HTMLCanvasElement;
    oldCanvas.replaceWith(canvas);

    const options: MapViewOptions = {
        canvas,
        forceWebGL: shouldForceWebGL(),
        projection: mercatorProjection,
        target: new GeoCoordinates(CENTER.lat, CENTER.lng),
        zoomLevel: ZOOM_LEVEL,
        ...settings
    };
    const mapView = new MapView(options);
    const controls = new MapControls(mapView);
    const ui = new MapControlsUI(controls);
    (canvas.parentElement ?? document.body).appendChild(ui.domElement);
    CopyrightElementHandler.install("copyrightNotice", mapView);

    const onWindowResize = (): void => mapView.resize(window.innerWidth, window.innerHeight);
    window.addEventListener("resize", onWindowResize);

    // Imagery ground layer with offline debug-grid fallback; this example
    // wires MapView itself, so the layer is attached like any other source.
    await createImageryWithFallback(mapView, demoImagery({ provider: "arcgis" }));

    // Default constructor arguments: (tilingScheme, name, maxGridZoomLevel).
    await mapView.addDataSource(new DebugGridDataSource(webMercatorTilingScheme));
    mapView.update();

    return {
        mapView,
        dispose: () => {
            window.removeEventListener("resize", onWindowResize);
            ui.domElement.remove();
            controls.destroy();
            mapView.dispose();
        }
    };
}

/** HUD line: camera zoom plus the grid tile under the view center. */
function updateHud(hud: HTMLElement, mapView: MapView): void {
    const zoom = mapView.zoomLevel;
    // DebugGridDataSource stores tiles one level finer than they are displayed
    // (`storageLevelOffset: -1`), so sample the key at that storage level.
    const key = TileKeyUtils.geoCoordinatesToTileKey(
        webMercatorTilingScheme,
        mapView.target,
        Math.floor(zoom) + 1
    );
    hud.textContent =
        `zoom ${zoom.toFixed(2)} — center tile ` +
        `${key !== null ? `${key.level}/${key.column}/${key.row}` : "-"}\n` +
        `tiles ${settings.maxVisibleDataSourceTiles} | search up ` +
        `${settings.quadTreeSearchDistanceUp} | search down ${settings.quadTreeSearchDistanceDown}`;
}

/** Example entry: rebuild-on-apply map plus live tile HUD. */
async function main(): Promise<void> {
    const hud = document.createElement("div");
    Object.assign(hud.style, {
        position: "absolute",
        left: "16px",
        bottom: "16px",
        padding: "8px 12px",
        color: "#fff",
        font: "12px/1.5 monospace",
        whiteSpace: "pre-wrap"
    } as CSSStyleDeclaration);
    applyPanelStyle(hud);
    document.body.appendChild(hud);

    let handle = await buildMap(null);

    const gui = createExampleGui();
    applyPanelStyle(gui.domElement);
    const folder = gui.addFolder("Tile Scheduling (MapViewOptions)");
    folder.add(settings, "maxVisibleDataSourceTiles", 25, 1200, 25);
    folder.add(settings, "quadTreeSearchDistanceUp", 0, 10, 1);
    folder.add(settings, "quadTreeSearchDistanceDown", 0, 8, 1);
    folder
        .add(
            {
                // Constructor-only options: dispose and rebuild the view.
                apply: () => {
                    void buildMap(handle).then(next => {
                        handle = next;
                    });
                }
            },
            "apply"
        )
        .name("Apply (rebuilds view)");
    folder.open();

    // On-demand rendering: fires once per rendered frame — exactly when the
    // tile schedule may have changed. Zooming/panning re-renders and refreshes.
    handle.mapView.addEventListener(MapViewEventNames.AfterRender, () =>
        updateHud(hud, handle.mapView)
    );
    updateHud(hud, handle.mapView);
}

void main();
