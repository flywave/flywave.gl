/* Copyright (C) 2025 flywave.gl contributors */

import {
    type ILogger,
    type MapView,
    ArcGISTileProvider,
    DEMTerrainSource,
    LoggerManager
} from "@flywave/flywave.gl";

import { applyPanelStyle, createExampleMap, logExampleInfo } from "../common";

const logger: ILogger = LoggerManager.instance.create(
    "flywave-examples/terrain-global-virtual-imagery"
);

/**
 * Free global DEM: the AWS Open Data "Terrain Tiles" terrarium service (no
 * token, CORS enabled). The encoding MUST be declared explicitly — the
 * decoder defaults to mapbox and would misread terrarium heights by orders
 * of magnitude.
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

/** Default view: Shandong hills (China), regional scale. */
const DEFAULT_TARGET = { lat: 36.48619699228674, lng: 118.17270928364879 };
const DEFAULT_ZOOM = 12;

const urlParams = new URLSearchParams(window.location.search);

/** Imagery levels finer than the terrain tile (0 = legacy one image per tile). */
const IMAGERY_OFFSET = urlParams.get("offset") === "0" ? 0 : 1;
const ZOOM = clampNumber(urlParams.get("zoom"), 0, 20, DEFAULT_ZOOM);
const TARGET_LAT = clampNumber(urlParams.get("lat"), -85, 85, DEFAULT_TARGET.lat);
const TARGET_LNG = clampNumber(urlParams.get("lng"), -180, 180, DEFAULT_TARGET.lng);
const TILT = clampNumber(urlParams.get("tilt"), 0, 85, 50);

function clampNumber(raw: string | null, min: number, max: number, fallback: number): number {
    const value = raw === null ? Number.NaN : Number(raw);
    if (!Number.isFinite(value)) return fallback;
    return Math.min(max, Math.max(min, value));
}

/**
 * Unix-ms timestamp at local solar noon over the given longitude.
 *
 * The atmosphere derives the sun direction from the timestamp with a real
 * astronomical model (Julian date), so this pins the sub-solar point onto the
 * target meridian: the view is always in daylight regardless of the machine's
 * local timezone or wall-clock time.
 */
function solarNoonTimestamp(longitudeDeg: number): number {
    const now = new Date();
    const utcHour = 12 - longitudeDeg / 15;
    const dayStart = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
    return dayStart + ((utcHour + 24) % 24) * 3600 * 1000;
}

const SUN_TIME = solarNoonTimestamp(TARGET_LNG);

interface Hud {
    root: HTMLDivElement;
    line: HTMLDivElement;
    link: HTMLAnchorElement;
}

function buildHud(): Hud {
    const root = document.createElement("div");
    root.style.cssText =
        "position:absolute;left:16px;top:16px;max-width:420px;padding:12px 14px;" +
        "color:#ddd;font:12px/1.7 sans-serif;white-space:pre-line";
    applyPanelStyle(root);
    root.textContent = "Global terrain — virtual finer imagery\n";

    const line = document.createElement("div");
    line.style.cssText = "color:#9ad;font-family:monospace;white-space:pre-line";

    const link = document.createElement("a");
    link.style.cssText = "color:#8cf;display:inline-block;margin-top:6px";
    link.href = IMAGERY_OFFSET === 0 ? "?offset=1" : "?offset=0";
    link.textContent =
        IMAGERY_OFFSET === 0 ? "switch to offset=1 (2x2 mosaic)" : "switch to offset=0 (legacy)";

    root.append(line, link);
    document.body.appendChild(root);
    return { root, line, link };
}

function updateHud(hud: Hud, mapView: MapView, terrain: DEMTerrainSource): void {
    const provider = terrain.getWebTileDataSources()[0];
    const renderList = mapView.visibleTileSet.dataSourceTileList.find(
        entry => entry.dataSource === terrain
    );
    const rendered = renderList ? renderList.renderedTiles.size : 0;
    // Sun is pinned at solar noon over TARGET_LNG; local solar time shifts by
    // one hour per 15° of longitude away from it.
    const localSolarHour = (((12 + (mapView.target.longitude - TARGET_LNG) / 15) % 24) + 24) % 24;

    hud.line.textContent = [
        `view    lat ${mapView.target.latitude.toFixed(3)}  lng ${mapView.target.longitude.toFixed(
            3
        )}`,
        `camera  zoom ${mapView.zoomLevel.toFixed(2)}  tilt ${mapView.tilt.toFixed(0)}°`,
        `terrain ${rendered} rendered tile(s) | imagery level = tile level + ${IMAGERY_OFFSET}`,
        provider
            ? `imagery cache ${provider.getCacheSize()} | pending ${provider.getPendingRequestsCount()}`
            : "imagery provider: none",
        `sun     UTC ${new Date(SUN_TIME).toISOString().slice(11, 16)} ` +
            `| local solar ${localSolarHour.toFixed(1)}h over the view`
    ].join("\n");
}

/** Example entry point: navigable globe + global DEM + 2x2 finer imagery. */
async function main(): Promise<void> {
    const canvas = document.getElementById("mapCanvas");
    if (!(canvas instanceof HTMLCanvasElement)) {
        throw new Error("Map canvas element not found (need <canvas id='mapCanvas'>)");
    }

    const handle = await createExampleMap(canvas, {
        projection: "globe",
        lookAt: {
            target: { lat: TARGET_LAT, lng: TARGET_LNG },
            zoomLevel: ZOOM,
            tilt: TILT,
            heading: 0
        },
        themeObject: {
            extends: "resources/tilezen_base_globe.json",
            atmosphere: {
                enabled: true,
                sunTime: SUN_TIME,
                sunTimeTransitionDuration: 0
            }
        },
        onReady: view => {
            logExampleInfo("terrain-global-virtual-imagery", view);
        }
    });
    const mapView = handle.mapView;

    const terrain = new DEMTerrainSource({ source: FREE_TERRARIUM_DEM, encoding: "terrarium" });
    // Attach imagery before the source is added to the view so the very first
    // tile load already knows about it.
    terrain.addWebTileDataSource(new ArcGISTileProvider({ minDataLevel: 0, maxDataLevel: 18 }), {
        imageryLevelOffset: IMAGERY_OFFSET
    });
    await mapView.setElevationSource(terrain);

    const hud = buildHud();
    updateHud(hud, mapView, terrain);
    window.setInterval(() => {
        updateHud(hud, mapView, terrain);
    }, 500);

    // Startup watchdog. The globe begins at a far view and moves to the
    // requested pose; the on-demand frame loop can settle before the final
    // tile-selecting pass, leaving a coarse fallback (a few level-3 tiles)
    // stretched over the screen until the next input event. Nudge the loop
    // whenever the render list's data level lags the camera's; once they
    // match this does nothing (no periodic redraw).
    window.setInterval(() => {
        const list = mapView.visibleTileSet.dataSourceTileList.find(
            entry => entry.dataSource === terrain
        );
        const expected = Math.floor(terrain.getDataZoomLevel(mapView.zoomLevel));
        const current = list ? Math.floor(list.zoomLevel) : Number.NaN;
        if (!list || current !== expected) {
            mapView.update();
        }
    }, 500);

    // Automation hook (not part of the public example surface).
    (window as unknown as { __globalTerrainDebug?: unknown }).__globalTerrainDebug = {
        mapView,
        terrain,
        provider: terrain.getWebTileDataSources()[0],
        imageryLevelOffset: IMAGERY_OFFSET,
        sunTime: SUN_TIME,
        solarNoonLocal: new Date(SUN_TIME).toString()
    };

    logger.info(
        `global terrain ready: zoom ${ZOOM}, target ${TARGET_LAT},${TARGET_LNG}, ` +
            `imagery offset ${IMAGERY_OFFSET}, sun ${new Date(SUN_TIME).toISOString()}`
    );
}

void main().catch((error: unknown) => {
    logger.error("Failed to initialize terrain-global-virtual-imagery example:", String(error));
});
