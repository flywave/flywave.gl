/* Copyright (C) 2025 flywave.gl contributors */

import {
    type ILogger,
    type MapView,
    ArcGISTileProvider,
    DEMTerrainSource,
    GeoCoordinates,
    LoggerManager
} from "@flywave/flywave.gl";

import { applyPanelStyle, createExampleMap, logExampleInfo } from "../common";

const logger: ILogger = LoggerManager.instance.create("flywave-examples/terrain-local-tiles");

/**
 * Local tile server layout (verified with directory listings + CORS `*`):
 *   imagery: google-earth/{z}/{x}/{y}.jpg   256x256, levels 0..20
 *   terrain: mapterhorn/{z}/{x}/{y}.webp    512x512, levels 0..12, terrarium
 */
const TILE_SERVER = "http://192.168.1.24";
const IMAGERY_URL_TEMPLATE = `${TILE_SERVER}/google-earth/{z}/{x}/{y}.jpg`;
const DEM_URL_TEMPLATE = `${TILE_SERVER}/mapterhorn/{z}/{x}/{y}.webp`;

/** Global, complete terrarium DEM (AWS Open Data Terrain Tiles). */
const AWS_DEM_URL_TEMPLATE =
    "https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png";
const AWS_DEM_MAX_ZOOM = 15;

/** Test area covered by the local pyramid (Baotou). */
const TARGET = { lat: 40.6122, lng: 109.741 };
const DEFAULT_DISTANCE = 1200;
const DEFAULT_TILT = 0;
const DEFAULT_HEADING = 0;

const params = new URLSearchParams(window.location.search);
function numberParam(key: string, fallback: number): number {
    const raw = params.get(key);
    if (raw === null) return fallback;
    const value = Number(raw);
    return Number.isFinite(value) ? value : fallback;
}

/**
 * Imagery source switch: "google-earth" (default) uses the local pyramid,
 * which is INCOMPLETE outside its prepared area (fine levels 404 beyond it).
 * "arcgis" uses the global, complete ArcGIS World Imagery pyramid — the
 * control experiment for coverage-gap fallback behavior.
 */
const IMAGERY_SOURCE = params.get("imagery") ?? "google-earth";

/**
 * Terrain source switch: "aws" (default) uses the global terrarium DEM
 * (complete, maxzoom 15); "local" uses the LAN mapterhorn webp pyramid
 * (Baotou area only, maxzoom 12 → ?demmax).
 */
const DEM_SOURCE = params.get("dem") ?? "aws";

/**
 * DECLARED DEM max zoom (?demmax overrides). This stays the TRUE data depth
 * on purpose: `DEMTerrainSource.getStageForLevel` re-anchors the last loading
 * stage at this declared value, so subdivision keeps refining past it (the
 * imagery level follows the terrain tile) even when the DEM grid ends here.
 */
const DEM_MAX_ZOOM_RAW = params.get("demmax");
const DEM_MAX_ZOOM_OVERRIDE =
    DEM_MAX_ZOOM_RAW !== null && Number.isFinite(Number(DEM_MAX_ZOOM_RAW))
        ? Number(DEM_MAX_ZOOM_RAW)
        : null;
/** Real data depth: LAN mapterhorn stops at 12, AWS terrarium at 15. */
const LOCAL_DEM_DATA_MAX = 12;
const DEM_DECLARE_MAX =
    DEM_MAX_ZOOM_OVERRIDE ?? (DEM_SOURCE === "local" ? LOCAL_DEM_DATA_MAX : AWS_DEM_MAX_ZOOM);
/** Max data level declared by the imagery provider — the second independent cap. */
const IMAGERY_MAX_LEVEL = numberParam("imagerymax", 20);
/** Imagery levels finer than the terrain tile (0 keeps the 1:1 mapping). */
const IMAGERY_OFFSET = numberParam("offset", 0);

const DISTANCE = numberParam("dist", DEFAULT_DISTANCE);
const TILT = numberParam("tilt", DEFAULT_TILT);
const HEADING = numberParam("heading", DEFAULT_HEADING);
const LAT = numberParam("lat", TARGET.lat);
const LNG = numberParam("lng", TARGET.lng);

/**
 * Unix-ms timestamp at solar noon over the given longitude (keeps the target
 * hemisphere in daylight regardless of the machine clock).
 */
function solarNoonTimestamp(longitudeDeg: number): number {
    const now = new Date();
    const utcHour = 12 - longitudeDeg / 15;
    const dayStart = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
    return dayStart + ((utcHour + 24) % 24) * 3600 * 1000;
}

interface Hud {
    root: HTMLDivElement;
    line: HTMLDivElement;
    hint: HTMLDivElement;
}

function buildHud(): Hud {
    const root = document.createElement("div");
    root.style.cssText =
        "position:absolute;left:16px;top:16px;max-width:460px;padding:12px 14px;" +
        "color:#ddd;font:12px/1.7 sans-serif;white-space:pre-line";
    applyPanelStyle(root);
    root.textContent = "Local tiles — terrain / imagery level gating\n";

    const line = document.createElement("div");
    line.style.cssText = "color:#9ad;font-family:monospace;white-space:pre-line";
    const hint = document.createElement("div");
    hint.style.cssText = "color:#889;margin-top:6px;white-space:pre-line";
    hint.textContent =
        "?dem=local  LAN mapterhorn pyramid instead of the global AWS DEM\n" +
        "?demmax=N  declare DEM max zoom (aws+demmax=12 = last-stage gate repro)\n" +
        "?imagerymax=16  reproduce a provider cap at 16\n" +
        "?offset=1  imagery one level finer than the terrain tile\n" +
        "?imagery=arcgis  global complete pyramid (control vs local 404 gaps)";

    root.append(line, hint);
    document.body.appendChild(root);
    return { root, line, hint };
}

/** Highest pyramid level requested so far, from Resource Timing. */
function requestedLevels(pathSegment: string): { max: number; count: number } {
    let max = -1;
    let count = 0;
    const pattern = new RegExp(`/${pathSegment}/(\\d+)/`);
    for (const entry of performance.getEntriesByType("resource")) {
        const match = entry.name.match(pattern);
        if (!match) continue;
        count++;
        max = Math.max(max, Number(match[1]));
    }
    return { max, count };
}

function updateHud(hud: Hud, mapView: MapView, terrain: DEMTerrainSource): void {
    const list = mapView.visibleTileSet.dataSourceTileList.find(
        entry => entry.dataSource === terrain
    );
    const tiles = list ? [...list.renderedTiles.values()] : [];
    const levels = tiles.map(tile => tile.tileKey.level);
    const minLevel = levels.length ? Math.min(...levels) : -1;
    const maxLevel = levels.length ? Math.max(...levels) : -1;
    const provider = terrain.getWebTileDataSources()[0];
    const demProvider = terrain.dataProvider() as unknown as { getMaxZoom?(): number };
    const demMaxZoom = demProvider.getMaxZoom?.();
    const isLocalDem = DEM_SOURCE === "local";
    const imageryLabel = IMAGERY_SOURCE === "arcgis" ? "arcgis World_Imagery" : "google-earth";
    const demLabel = isLocalDem ? "mapterhorn" : "terrarium";
    // URL segments that carry the pyramid level in each service's layout.
    const imageryPattern = IMAGERY_SOURCE === "arcgis" ? "MapServer/tile" : "google-earth";
    const imagery = requestedLevels(imageryPattern);
    const dem = requestedLevels(demLabel);

    hud.line.textContent = [
        `camera   zoom ${mapView.zoomLevel.toFixed(2)}  tilt ${mapView.tilt.toFixed(0)}°` +
            `  distance ${Math.round(mapView.targetDistance)}m`,
        `target   lat ${mapView.target.latitude.toFixed(3)}  lng ${mapView.target.longitude.toFixed(3)}`,
        ``,
        `CAP 1  terrain subdivision  DEM(${DEM_SOURCE}) maxzoom = ${demMaxZoom}  (shouldSubdivide gate)`,
        `CAP 2  imagery provider     maxLevel   = ${provider?.maxLevel ?? "-"}  (WebImageryTileProvider)`,
        ``,
        `terrain  ${tiles.length} tile(s), rendered levels ${minLevel}..${maxLevel}`,
        `requests ${imageryLabel}  max z=${imagery.max} (${imagery.count})` +
            `  |  ${demLabel} max z=${dem.max} (${dem.count})`,
        `imagery source ${IMAGERY_SOURCE}  offset ${IMAGERY_OFFSET}`
    ].join("\n");
}

/**
 * Terrain/imagery level-gating diagnostic with a HUD showing the two
 * independent level caps in the engine:
 *
 * 1. terrain subdivision is gated by the DEM source's max zoom
 *    (`TerrainSource.shouldSubdivide`), and imagery level follows the terrain
 *    tile level;
 * 2. the imagery provider stops requesting at its own `maxDataLevel`.
 *
 * Defaults: global AWS terrarium DEM (complete, maxzoom 15) draped with the
 * LAN google-earth JPEG pyramid. `?imagery=arcgis` swaps in the globally
 * complete ArcGIS World_Imagery pyramid; `?dem=local` restores the LAN
 * mapterhorn DEM (?demmax caps it, data only reaches 12).
 */
async function main(): Promise<void> {
    const canvas = document.getElementById("mapCanvas");
    if (!(canvas instanceof HTMLCanvasElement)) {
        throw new Error("Map canvas element not found (need <canvas id='mapCanvas'>)");
    }

    const handle = await createExampleMap(canvas, {
        themeObject: {
            extends: "resources/tilezen_base_globe.json",
            atmosphere: {
                enabled: true,
                sunTime: solarNoonTimestamp(LNG),
                sunTimeTransitionDuration: 0
            }
        },
        controlsUi: "compact",
        lookAt: {
            target: { lat: LAT, lng: LNG },
            distance: DISTANCE,
            tilt: TILT,
            heading: HEADING
        }
    });
    const mapView = handle.mapView;

    // DEM: the global AWS terrarium pyramid by default (complete, maxzoom
    // 15); ?dem=local switches back to the LAN mapterhorn WebP (maxzoom
    // 12 by default via ?demmax). The declared max zoom is what gates
    // terrain subdivision, and the imagery level follows the terrain tile.
    const isLocalDem = DEM_SOURCE === "local";
    const terrain = new DEMTerrainSource({
        source: {
            type: "raster-dem",
            tiles: [isLocalDem ? DEM_URL_TEMPLATE : AWS_DEM_URL_TEMPLATE],
            scheme: "xyz",
            tileSize: isLocalDem ? 512 : 256,
            minzoom: 0,
            maxzoom: DEM_DECLARE_MAX,
            bounds: [-180, -85.0511, 180, 85.0511],
            attribution: isLocalDem
                ? "DEM: mapterhorn (terrarium)"
                : "Terrain: AWS Open Data Terrain Tiles / Mapzen"
        },
        encoding: "terrarium"
    });

    // Imagery draped into the terrain tiles. Its own maxDataLevel is the
    // second, independent cap. "arcgis" swaps the local google-earth pyramid
    // for the globally complete ArcGIS World Imagery service (control run).
    terrain.addWebTileDataSource(
        new ArcGISTileProvider({
            minDataLevel: 0,
            maxDataLevel: IMAGERY_MAX_LEVEL,
            ...(IMAGERY_SOURCE === "arcgis"
                ? {}
                : { tileUrlTemplate: IMAGERY_URL_TEMPLATE })
        }),
        { imageryLevelOffset: IMAGERY_OFFSET }
    );

    await mapView.setElevationSource(terrain);
    // Pin the camera (the constructor lookAt drifts once the terrain resolves).
    mapView.lookAt({
        target: new GeoCoordinates(LAT, LNG),
        distance: DISTANCE,
        tilt: TILT,
        heading: HEADING
    });
    mapView.update();

    const hud = buildHud();
    updateHud(hud, mapView, terrain);
    window.setInterval(() => {
        updateHud(hud, mapView, terrain);
    }, 500);

    // Automation / DevTools hook.
    (window as unknown as { __localTerrainDebug?: unknown }).__localTerrainDebug = {
        mapView,
        terrain,
        provider: terrain.getWebTileDataSources()[0],
        config: { demMaxZoom: DEM_DECLARE_MAX, imageryMaxLevel: IMAGERY_MAX_LEVEL, imageryOffset: IMAGERY_OFFSET }
    };

    logger.info(
        `local tiles: demMax=${DEM_DECLARE_MAX} imageryMax=${IMAGERY_MAX_LEVEL} ` +
            `offset=${IMAGERY_OFFSET} distance=${DISTANCE} tilt=${TILT}`
    );
    logExampleInfo("terrain-local-tiles", mapView);
}

void main().catch((error: unknown) => {
    logger.error("Failed to initialize terrain-local-tiles example:", String(error));
});
