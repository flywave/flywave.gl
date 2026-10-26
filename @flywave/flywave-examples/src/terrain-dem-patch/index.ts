/* Copyright (C) 2025 flywave.gl contributors */

import {
    type DemSourceDescription,
    type ILogger,
    type MapView,
    ArcGISTileProvider,
    DemPatchLayer,
    DEMTerrainSource,
    GeoCoordinates,
    LoggerManager,
    TileKey,
    TileKeyUtils,
    webMercatorTerrainTilingScheme
} from "@flywave/flywave.gl";

import { applyPanelStyle, createExampleGui, createExampleMap, logExampleInfo } from "../common";

const logger: ILogger = LoggerManager.instance.create("flywave-examples/terrain-dem-patch");

/** Camera sits inside the local DEM coverage (resources/dem_terrain). */
const CENTER = new GeoCoordinates(36.4862, 118.1727, 0);

/** Web-mercator level of the fabricated patch tiles. */
const PATCH_LEVEL = 12;

/** Pixel size of the fabricated patch tiles. */
const PATCH_TILE_SIZE = 256;

/**
 * Encode a height value to mapbox terrain-RGB (the convention the DEM patch
 * decoder expects): value = (R * 65536 + G * 256 + B) * 0.1 - 10000 meters.
 *
 * @param height - Height in meters.
 * @returns RGBA pixel with full alpha (full coverage).
 */
function encodeMapboxHeight(height: number): [number, number, number, number] {
    const v = Math.floor((height + 10000.0) / 0.1);
    return [Math.floor(v / 65536), Math.floor(v / 256) % 256, v % 256, 255];
}

/**
 * A patch layer whose tiles are fabricated in memory - no network needed.
 * The description pins minzoom = maxzoom, so the layer contributes exactly
 * one patch tile (the one covering the camera target).
 */
class FabricatedPatchLayer extends DemPatchLayer {
    private readonly m_patchTileKey: TileKey;

    constructor(
        id: string,
        priority: number,
        patchTileKey: TileKey,
        enabled: boolean,
        private readonly m_render: (x: number, y: number) => [number, number, number, number]
    ) {
        const geoBox = webMercatorTerrainTilingScheme.getGeoBox(patchTileKey);
        const description: DemSourceDescription = {
            tiles: [],
            scheme: "xyz",
            bounds: [
                geoBox.southWest.longitude,
                geoBox.southWest.latitude,
                geoBox.northEast.longitude,
                geoBox.northEast.latitude
            ],
            minzoom: patchTileKey.level,
            maxzoom: patchTileKey.level,
            tileSize: PATCH_TILE_SIZE,
            type: "raster-dem"
        };
        super({ id, source: description, priority, encoding: "mapbox", enabled });
        this.m_patchTileKey = patchTileKey;
    }

    /** Fabricate the patch image for the observation tile; nothing else. */
    protected async fetchTileImage(tileKey: TileKey): Promise<ImageData | undefined> {
        if (
            tileKey.level !== this.m_patchTileKey.level ||
            tileKey.column !== this.m_patchTileKey.column ||
            tileKey.row !== this.m_patchTileKey.row
        ) {
            return undefined;
        }
        const image = new ImageData(PATCH_TILE_SIZE, PATCH_TILE_SIZE);
        for (let y = 0; y < PATCH_TILE_SIZE; y++) {
            for (let x = 0; x < PATCH_TILE_SIZE; x++) {
                const [r, g, b, a] = this.m_render(x, y);
                const idx = (y * PATCH_TILE_SIZE + x) * 4;
                image.data[idx] = r;
                image.data[idx + 1] = g;
                image.data[idx + 2] = b;
                image.data[idx + 3] = a;
            }
        }
        return image;
    }
}

/** Flat plateau: full coverage at one absolute height (900 m). */
function renderPlateau(): (x: number, y: number) => [number, number, number, number] {
    const rgb = encodeMapboxHeight(900);
    return () => rgb;
}

/**
 * Crater: pit floor at 300 m, raised rim up to 950 m, outer slope down to
 * 500 m; coverage limited to a disc so the alpha "no data" ring keeps the
 * base terrain visible outside it.
 */
function renderCrater(): (x: number, y: number) => [number, number, number, number] {
    const half = PATCH_TILE_SIZE / 2;
    return (x, y) => {
        const dx = x - half;
        const dy = y - half;
        const dist = Math.sqrt(dx * dx + dy * dy) / half;
        if (dist > 0.85) {
            return [0, 0, 0, 0];
        }
        let height: number;
        if (dist < 0.35) {
            height = 300;
        } else if (dist < 0.55) {
            height = 300 + ((dist - 0.35) / 0.2) * (950 - 300);
        } else {
            height = 950 + ((dist - 0.55) / 0.3) * (500 - 950);
        }
        return encodeMapboxHeight(height);
    };
}

/**
 * Build the teaching UI: per-layer visibility/priority controls, a priority
 * explainer card with a live elevation probe, and a fly-to button.
 *
 * @param mapView - The ready map view.
 * @param terrain - The terrain source owning the patch manager.
 * @param patchCenter - Center of the patch tile, for the camera fly-to.
 */
function buildUi(mapView: MapView, terrain: DEMTerrainSource, patchCenter: GeoCoordinates): void {
    const manager = terrain.getDemPatchManager();
    const gui = createExampleGui();

    const layersFolder = gui.addFolder("Patch layers");
    for (const state of manager.getAllPatches()) {
        const proxy = { enabled: state.enabled, priority: state.priority };
        layersFolder
            .add(proxy, "enabled")
            .name(state.id)
            .listen()
            .onChange((enabled: boolean) => {
                manager.updatePatch(state.id, { enabled });
            });
        layersFolder
            .add(proxy, "priority", 0, 10, 1)
            .name(`${state.id} priority`)
            .listen()
            .onChange((priority: number) => {
                manager.updatePatch(state.id, { priority });
            });
    }
    layersFolder.open();

    gui.add(
        { fly: () => mapView.lookAt({ target: patchCenter, zoomLevel: 14, tilt: 50 }) },
        "fly"
    ).name("Fly to patch area");

    // Explainer card: patch semantics + live probe of the center elevation.
    const card = document.createElement("div");
    card.style.cssText =
        "position:absolute;left:16px;bottom:16px;max-width:360px;padding:10px 14px;" +
        "color:#ddd;font:12px/1.6 sans-serif;white-space:pre-line";
    applyPanelStyle(card);
    const probe = document.createElement("div");
    card.textContent =
        "DEM patch layers REPLACE base elevation where they have coverage " +
        "(hard override, never a blend); when two layers overlap, the highest " +
        "priority wins per pixel.\n" +
        "Patch layers hard-override the base elevation; overlaps resolve per pixel to the highest priority.";
    card.appendChild(probe);
    document.body.appendChild(card);

    const provider = terrain.getElevationProvider();
    window.setInterval(() => {
        const altitude = provider.getHeight(CENTER);
        probe.textContent = `Center elevation: ${
            altitude !== undefined ? altitude.toFixed(1) : "-"
        } m | patches: ${manager.getPatchCount()} | version: ${manager.version}`;
    }, 500);
}

/**
 * Example entry point: map -> terrain with patch layers -> UI.
 */
async function main(): Promise<void> {
    const canvas = document.getElementById("mapCanvas");
    if (!(canvas instanceof HTMLCanvasElement)) {
        throw new Error("Map canvas element not found (need <canvas id='mapCanvas'>)");
    }

    // The patch tile observed by the demo: the web-mercator tile at
    // PATCH_LEVEL containing the camera target.
    const patchTileKey = TileKeyUtils.geoCoordinatesToTileKey(
        webMercatorTerrainTilingScheme,
        CENTER,
        PATCH_LEVEL
    );
    const patchGeoBox = webMercatorTerrainTilingScheme.getGeoBox(patchTileKey);
    const patchCenter = patchGeoBox.center;

    const handle = await createExampleMap(canvas, {
        projection: "globe",
        lookAt: {
            target: { lat: CENTER.latitude, lng: CENTER.longitude },
            zoomLevel: 15,
            tilt: 62
        },
        themeObject: {
            extends: "resources/tilezen_base_globe.json",
            atmosphere: { enabled: true }
        },
        onReady: view => logExampleInfo("terrain-dem-patch", view)
    });

    const terrain = new DEMTerrainSource({
        source: "dem_terrain/source.json",
        encoding: "mapbox"
    });

    // Register both patch layers BEFORE the source connects: the initial
    // progressive load bakes the enabled patch into every level it loads.
    const manager = terrain.getDemPatchManager();
    manager.addLayer(new FabricatedPatchLayer("plateau", 1, patchTileKey, true, renderPlateau()));
    manager.addLayer(new FabricatedPatchLayer("crater", 5, patchTileKey, false, renderCrater()));
    manager.addEventListener("change", event => {
        logger.info(`patch change: ${event.changeType} [${event.affectedIds.join(",")}]`);
    });

    await handle.mapView.setElevationSource(terrain);
    terrain.addWebTileDataSource(new ArcGISTileProvider({ minDataLevel: 0, maxDataLevel: 18 }));

    buildUi(handle.mapView, terrain, patchCenter);
}

void main().catch((error: unknown) => {
    logger.error("Failed to initialize terrain-dem-patch example:", String(error));
});
