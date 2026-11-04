/* Copyright (C) 2025 flywave.gl contributors */

import {
    type DataSource,
    type ILogger,
    type MapView,
    ArcGISTileProvider,
    DEMTerrainSource,
    GeoCoordinates,
    LoggerManager,
    TileKey,
    webMercatorTerrainTilingScheme
} from "@flywave/flywave.gl";

import { applyPanelStyle, createExampleMap, logExampleInfo } from "../common";

const logger: ILogger = LoggerManager.instance.create("flywave-examples/terrain-virtual-imagery");

/**
 * Free global DEM: the AWS Open Data "Terrain Tiles" terrarium service (no
 * token, CORS enabled). The encoding MUST be declared explicitly — the
 * decoder defaults to mapbox and would misread terrarium heights by orders
 * of magnitude (see terrain-elevation-query for the formula).
 */
const FREE_TERRARIUM_DEM = {
    type: "raster-dem" as const,
    tiles: ["https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png"],
    scheme: "xyz" as const,
    bounds: [-180, -85.0511, 180, 85.0511] as [number, number, number, number],
    minzoom: 0,
    maxzoom: 15,
    tileSize: 256,
    attribution: "Terrain: AWS Open Data Terrain Tiles / Mapzen"
};

/** Camera pose over the local test area (Shandong hills). */
const LOOK_AT = {
    target: { lat: 36.48619699228674, lng: 118.17270928364879 }
};

const urlParams = new URLSearchParams(window.location.search);

/** Terrain tile level to lock the visible set to. */
const TILE_LEVEL = clampInt(urlParams.get("level"), 12, 17, 15);
/** Imagery levels finer than the terrain tile (0 keeps the legacy mapping). */
const IMAGERY_OFFSET = urlParams.get("offset") === "0" ? 0 : 1;
/** Number of adjacent locked tiles: 1 isolates one tile, 2 exposes the seam. */
const LOCKED_TILE_COUNT = urlParams.get("tiles") === "2" ? 2 : 1;

function clampInt(raw: string | null, min: number, max: number, fallback: number): number {
    const value = raw === null ? Number.NaN : Number(raw);
    if (!Number.isFinite(value)) return fallback;
    return Math.min(max, Math.max(min, Math.round(value)));
}

/**
 * Replaces the visible-set tile selection with a fixed list.
 *
 * `MapView.render()` rebuilds its render list from
 * `VisibleTileSet.getVisibleTileKeysForDataSources()`; overriding that one
 * method (private at the TS level, a normal method at runtime) pins the
 * traversal to the given keys. Nothing else changes — tiles are still created,
 * loaded and drawn by the regular pipeline, which is exactly what makes this
 * a faithful single-tile test.
 */
function lockVisibleTiles(mapView: MapView, terrain: DEMTerrainSource, tileKeys: TileKey[]): void {
    const visibleTileSet = mapView.visibleTileSet as unknown as {
        getVisibleTileKeysForDataSources: (
            zoomLevel: number,
            dataSources: DataSource[],
            elevationRangeSource: unknown
        ) => {
            tileKeys: Array<{
                dataSource: DataSource;
                visibleTileKeys: Array<{
                    tileKey: TileKey;
                    area: number;
                    offset: number;
                    distance: number;
                }>;
            }>;
            allBoundingBoxesFinal: boolean;
        };
    };

    visibleTileSet.getVisibleTileKeysForDataSources = (_zoomLevel, dataSources) => {
        return {
            tileKeys: dataSources.map(dataSource => {
                const isTerrain = dataSource === terrain || dataSource.name === terrain.name;
                return {
                    dataSource,
                    visibleTileKeys: isTerrain
                        ? tileKeys.map(tileKey => ({
                              tileKey,
                              area: 1,
                              offset: 0,
                              distance: 0
                          }))
                        : []
                };
            }),
            allBoundingBoxesFinal: true
        };
    };
}

interface SlotReport {
    slot: number;
    ratio: number;
    label: string;
}

/**
 * Reads the imagery resource currently attached to a terrain tile and reports
 * where each entry's texture came from. The span ratio is
 * `tileSpan / entrySpan`: 1.0 means a composed mosaic (or the tile's own
 * level), 0.5 means a parent, and so on.
 */
function readSlotReports(terrain: DEMTerrainSource, tileKey: TileKey): SlotReport[] {
    const provider = terrain.getWebTileDataSources()[0];
    if (!provider) return [];
    const available = provider.getBestAvailableResourceTile(tileKey);
    if (!available) return [];

    const tileGeoBox = terrain.getTilingScheme().getGeoBox(tileKey);
    const tileSpan = tileGeoBox.east - tileGeoBox.west;

    const reports = available.resource.value.map((entry, index) => {
        const entrySpan = entry.geoBox.east - entry.geoBox.west;
        const ratio = entrySpan > 0 ? tileSpan / entrySpan : Number.NaN;
        const levelDelta = Number.isFinite(ratio) ? Math.round(Math.log2(ratio)) : 0;
        return {
            slot: index,
            ratio,
            label: `z${tileKey.level + levelDelta}`
        };
    });

    return reports.sort((a, b) => a.slot - b.slot);
}

interface Hud {
    root: HTMLDivElement;
    line: HTMLDivElement;
    slotLine: HTMLDivElement;
}

function buildHud(): Hud {
    const root = document.createElement("div");
    root.style.cssText =
        "position:absolute;left:16px;top:16px;max-width:440px;padding:12px 14px;" +
        "color:#ddd;font:12px/1.7 sans-serif;white-space:pre-line";
    applyPanelStyle(root);
    root.textContent =
        "Terrain virtual finer imagery — locked tile test\n" +
        "?offset=0|1  ?tiles=1|2  ?level=12..17\n\n";

    const line = document.createElement("div");
    const slotLine = document.createElement("div");
    slotLine.style.cssText = "color:#9ad;font-family:monospace;white-space:pre-line";
    root.append(line, slotLine);
    document.body.appendChild(root);
    return { root, line, slotLine };
}

function updateHud(
    hud: Hud,
    mapView: MapView,
    terrain: DEMTerrainSource,
    tileKeys: TileKey[]
): void {
    const provider = terrain.getWebTileDataSources()[0];
    const lines: string[] = [
        `camera zoom ${mapView.zoomLevel.toFixed(2)} | tiles locked: ${tileKeys.length}`,
        provider
            ? `imagery cache ${provider.getCacheSize()} | pending ${provider.getPendingRequestsCount()}`
            : "imagery provider: none"
    ];

    const reports: SlotReport[][] = [];
    tileKeys.forEach(tileKey => {
        lines.push(
            `tile z${tileKey.level} r${tileKey.row} c${tileKey.column} | imagery offset ${IMAGERY_OFFSET}`
        );
        reports.push(readSlotReports(terrain, tileKey));
    });

    hud.line.textContent = lines.join("\n");
    hud.slotLine.textContent = reports
        .map((slots, index) => {
            if (slots.length === 0) return `tile ${index}: (no imagery resource yet)`;
            const parts = slots.map(
                slot => `slot${slot.slot}=${slot.label} x${slot.ratio.toFixed(2)}`
            );
            return `tile ${index}: ${parts.join("  ")}`;
        })
        .join("\n");

    // Automation hook: the single-tile test assertions read this object.
    (window as unknown as { __virtualImagery?: unknown }).__virtualImagery = {
        offset: IMAGERY_OFFSET,
        level: TILE_LEVEL,
        tiles: tileKeys.map(tileKey => ({
            level: tileKey.level,
            row: tileKey.row,
            column: tileKey.column
        })),
        slots: reports.map(slots =>
            slots.map(slot => ({
                slot: slot.slot,
                level: slot.label,
                ratio: slot.ratio
            }))
        )
    };
}

/** Example entry point: locked tile(s) + DEM terrain + 2x2 finer imagery. */
async function main(): Promise<void> {
    const canvas = document.getElementById("mapCanvas");
    if (!(canvas instanceof HTMLCanvasElement)) {
        throw new Error("Map canvas element not found (need <canvas id='mapCanvas'>)");
    }

    const handle = await createExampleMap(canvas, {
        projection: "globe",
        lookAt: {
            target: LOOK_AT.target,
            // Zoom past the locked tile level so the tile covers well over
            // 256 screen pixels — this is where a 2x2 mosaic (512^2 texels)
            // visibly beats a single 256^2 image.
            zoomLevel: TILE_LEVEL + 1.5,
            tilt: 40,
            heading: 0
        },
        themeObject: {
            extends: "resources/tilezen_base_globe.json",
            atmosphere: {
                enabled: true,
                // Wall-clock now is night over the test area at some hours —
                // pin local mid-morning so the imagery is always lit.
                sunTime: new Date().setHours(10, 30, 0, 0),
                sunTimeTransitionDuration: 0
            }
        },
        onReady: view => {
            logExampleInfo("terrain-virtual-imagery", view);
        }
    });
    const mapView = handle.mapView;

    const terrain = new DEMTerrainSource({ source: FREE_TERRARIUM_DEM, encoding: "terrarium" });
    // Attach imagery BEFORE the source is added to the view: the tile loader
    // runs once when the tile is created, and with a single locked tile it is
    // never re-created. Adding the provider afterwards would leave that one
    // tile without any imagery request.
    terrain.addWebTileDataSource(new ArcGISTileProvider({ minDataLevel: 0, maxDataLevel: 18 }), {
        imageryLevelOffset: IMAGERY_OFFSET
    });
    await mapView.setElevationSource(terrain);

    const tilingScheme = webMercatorTerrainTilingScheme;
    const center = new GeoCoordinates(LOOK_AT.target.lat, LOOK_AT.target.lng);
    const primaryKey = tilingScheme.getTileKey(center, TILE_LEVEL);
    if (!primaryKey) {
        throw new Error(`Cannot resolve a tile key at level ${TILE_LEVEL} for the test area`);
    }

    const tileKeys = [primaryKey];
    if (LOCKED_TILE_COUNT > 1) {
        tileKeys.push(
            TileKey.fromRowColumnLevel(primaryKey.row, primaryKey.column + 1, TILE_LEVEL)
        );
    }

    // Lock the camera too: the offset=0/1 comparison must use an identical
    // pose, and any interactive control drift (damping, elevation-driven
    // distance re-targeting) would invalidate it.
    handle.controls?.destroy();
    const tileBox = tilingScheme.getGeoBox(primaryKey);
    mapView.lookAt({
        target: new GeoCoordinates(
            (tileBox.south + tileBox.north) / 2,
            (tileBox.west + tileBox.east) / 2
        ),
        zoomLevel: TILE_LEVEL + 1.5,
        tilt: 40,
        heading: 0
    });

    lockVisibleTiles(mapView, terrain, tileKeys);
    mapView.update();

    const hud = buildHud();
    updateHud(hud, mapView, terrain, tileKeys);
    window.setInterval(() => {
        updateHud(hud, mapView, terrain, tileKeys);
    }, 500);

    // Nudge the on-demand render loop until the locked tile is live. The first
    // render pass can run before the elevation source is registered in the
    // visible set; rendering is on demand, so without a nudge the tile would
    // never be created (and its imagery never requested) on a static camera.
    const nudge = window.setInterval(() => {
        const list = mapView.visibleTileSet.dataSourceTileList.find(
            entry => entry.dataSource === terrain
        );
        if (!list || list.renderedTiles.size === 0) {
            mapView.update();
        }
    }, 600);
    window.setTimeout(() => {
        window.clearInterval(nudge);
    }, 20000);

    // Debug hook for automated verification (not part of the public example
    // surface): the provider exposes its pending/cached request counters, and
    // the terrain source exposes its tile cache.
    (window as unknown as { __virtualImageryDebug?: unknown }).__virtualImageryDebug = {
        mapView,
        terrain,
        provider: terrain.getWebTileDataSources()[0],
        tileKeys
    };

    logger.info(
        `locked ${tileKeys.length} tile(s) at level ${TILE_LEVEL}, imagery offset ${IMAGERY_OFFSET}`
    );
}

void main().catch((error: unknown) => {
    logger.error("Failed to initialize terrain-virtual-imagery example:", String(error));
});
