/* Copyright (C) 2025 flywave.gl contributors */

import {
    type DataSourceOptions,
    type DemTerrainSourceOptions,
    type DispatcherEvent,
    type GeoCoordinates,
    type ILogger,
    type MapView,
    type TileKey,
    type TilingScheme,
    type WebTileDataSource,
    ArcGISTileProvider,
    ArcGISWebTileDataSource,
    CustomWebTileDataSource,
    DataSource,
    DEMTerrainSource,
    LoggerManager,
    MapViewEventNames,
    Tile,
    webMercatorTilingScheme
} from "@flywave/flywave.gl";
import * as THREE from "three/webgpu";

const logger: ILogger = LoggerManager.instance.create("flywave-examples/datasources");

/**
 * Default DEM terrain description served from the examples' `resources/`
 * folder. Resolved through the MapView uriResolver at connect time.
 */
export const DEMO_TERRAIN_SOURCE = "dem_terrain/source.json";

/**
 * Imagery provider presets supported by {@link demoImagery}.
 */
export type DemoImageryProvider = "arcgis" | "osm" | "gibs";

/**
 * Options for {@link demoTerrain}; all fields optional, `source` defaults to
 * {@link DEMO_TERRAIN_SOURCE}.
 */
export type DemoTerrainOptions = Partial<DemTerrainSourceOptions>;

/**
 * Options for {@link demoImagery}.
 */
export interface IDemoImageryOptions {
    /** Imagery provider preset. @default "arcgis" */
    provider?: DemoImageryProvider;
    /**
     * Data source name. Set a unique name when adding several imagery layers
     * to the same view; defaults to the provider preset name.
     */
    name?: string;
}

/**
 * Return the configured Cesium Ion access token following the repo-wide
 * `token-config` chain: `process.env.CESIUM_ION_TOKEN`, then
 * `window.CESIUM_ION_TOKEN`.
 *
 * Unlike `src/token-config.ts` (and the webpack `CESIUM_ION_TOKEN` define,
 * which bake a demo token at build time) this never falls back to a hardcoded
 * token: examples that require Ion should call this and degrade gracefully
 * (e.g. show a hint) when it returns `undefined`.
 */
export function checkIonToken(): string | undefined {
    const fromProcess = typeof process !== "undefined" ? process.env?.CESIUM_ION_TOKEN : undefined;
    if (typeof fromProcess === "string" && fromProcess.length > 0) {
        return fromProcess;
    }
    const fromWindow =
        typeof window !== "undefined"
            ? (window as { CESIUM_ION_TOKEN?: unknown }).CESIUM_ION_TOKEN
            : undefined;
    if (typeof fromWindow === "string" && fromWindow.length > 0) {
        return fromWindow;
    }
    return undefined;
}

/**
 * Create the demo DEM terrain source used by the terrain examples.
 *
 * Pair it with an imagery layer provider when the terrain surface itself
 * should be textured, mirroring `examples/src/color-grading-lut`:
 *
 * ```ts
 * const terrain = demoTerrain();
 * mapView.setElevationSource(terrain);
 * terrain.addWebTileDataSource(new ArcGISTileProvider({ minDataLevel: 0, maxDataLevel: 18 }));
 * ```
 *
 * @param options - Overrides forwarded to the {@link DEMTerrainSource}
 * constructor; `source` defaults to {@link DEMO_TERRAIN_SOURCE}.
 */
export function demoTerrain(options?: DemoTerrainOptions): DEMTerrainSource {
    return new DEMTerrainSource({ source: DEMO_TERRAIN_SOURCE, ...options });
}

/**
 * Drape demo satellite imagery onto a terrain source.
 *
 * **Iron rule:** when an elevation source is active, imagery MUST be attached
 * as a web-tile provider INSIDE the terrain source — the terrain tiles then
 * carry the imagery as their own texture. Adding the same imagery as an
 * independent `DataSource` instead creates a flat tile layer coplanar with
 * the draped surface, which produces severe depth-fighting on the globe.
 *
 * Only `"arcgis"` is supported here: `ArcGISTileProvider` is a web-tile
 * *provider* that `DEMTerrainSource.addWebTileDataSource` accepts, while the
 * `"osm"` / `"gibs"` presets from {@link demoImagery} are standalone data
 * sources for flat (elevation-free) maps.
 *
 * @param terrain - The terrain source that will carry the imagery textures.
 * @param options - Optional zoom-level bounds for the imagery provider.
 */
export function attachTerrainImagery(
    terrain: DEMTerrainSource,
    options?: { minDataLevel?: number; maxDataLevel?: number }
): void {
    terrain.addWebTileDataSource(
        new ArcGISTileProvider({
            minDataLevel: options?.minDataLevel ?? 0,
            maxDataLevel: options?.maxDataLevel ?? 18
        })
    );
}

/**
 * UTC date (YYYY-MM-DD) `daysAgo` days before now. NASA GIBS publishes daily
 * layers with a delay, so examples request the previous day by default.
 */
function gibsDate(daysAgo: number): string {
    return new Date(Date.now() - daysAgo * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

/**
 * Create a ready-to-add imagery data source for the demo providers:
 *
 * - `"arcgis"`: Esri World Imagery raster tiles.
 * - `"osm"`: OpenStreetMap standard raster tiles.
 * - `"gibs"`: NASA GIBS VIIRS Corrected Reflectance True Color (yesterday's
 *   UTC date, Web Mercator tiling, maximum zoom level 9).
 *
 * The returned source is not attached to any view yet; use
 * {@link createImageryWithFallback} to add it with automatic degradation to a
 * debug grid when tiles cannot be loaded.
 *
 * @param options - Provider preset and optional data source name.
 */
export function demoImagery(options?: IDemoImageryOptions): WebTileDataSource {
    const provider: DemoImageryProvider = options?.provider ?? "arcgis";
    const name = options?.name ?? provider;
    switch (provider) {
        case "arcgis":
            return new ArcGISWebTileDataSource({ name });
        case "osm":
            return new CustomWebTileDataSource({
                name,
                tileUrlTemplate: "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",
                subdomains: ["a", "b", "c"],
                maxDataLevel: 19,
                copyrightInfo: {
                    id: "openstreetmap.org",
                    year: new Date().getFullYear(),
                    label: "OpenStreetMap",
                    link: "https://www.openstreetmap.org/copyright"
                }
            });
        case "gibs": {
            const date = gibsDate(1);
            return new CustomWebTileDataSource({
                name,
                tileUrlTemplate:
                    "https://gibs.earthdata.nasa.gov/wmts/epsg3857/best/" +
                    "VIIRS_CorrectedReflectance_TrueColor/default/" +
                    `${date}/GoogleMapsCompatible_Level9/{z}/{y}/{x}.jpg`,
                maxDataLevel: 9,
                copyrightInfo: {
                    id: "gibs.earthdata.nasa.gov",
                    year: new Date().getFullYear(),
                    label: "NASA EOSDIS GIBS",
                    link: "https://earthdata.nasa.gov/gibs"
                }
            });
        }
        default:
            throw new Error(`Unknown imagery provider: "${provider as string}"`);
    }
}

const debugGridMaterial = new THREE.LineBasicMaterial({
    color: 0xff0000,
    linewidth: 1,
    depthTest: false
});

/**
 * A single wireframe tile of a {@link DebugGridDataSource}.
 */
class DebugGridTile extends Tile {
    private readonly m_geometry = new THREE.BufferGeometry();

    constructor(dataSource: DataSource, tileKey: TileKey) {
        super(dataSource, tileKey);

        const tilingScheme = dataSource.getTilingScheme();
        const worldBox = tilingScheme.boundingBoxGenerator.getWorldBox(tileKey);
        const projection = tilingScheme.projection;
        const corners: GeoCoordinates[] = [
            projection.unprojectPoint(new THREE.Vector3(worldBox.min.x, worldBox.min.y, 0)),
            projection.unprojectPoint(new THREE.Vector3(worldBox.max.x, worldBox.min.y, 0)),
            projection.unprojectPoint(new THREE.Vector3(worldBox.max.x, worldBox.max.y, 0)),
            projection.unprojectPoint(new THREE.Vector3(worldBox.min.x, worldBox.max.y, 0))
        ];

        // Positions are camera-relative (RTE frame): project each corner, then
        // translate into the tile-local frame around this.center.
        const vertices: number[] = [];
        corners.forEach(geoPoint => {
            const point = this.projection.projectPoint(geoPoint, new THREE.Vector3());
            point.sub(this.center);
            vertices.push(...point.toArray());
        });
        this.m_geometry.setAttribute(
            "position",
            new THREE.BufferAttribute(new Float32Array(vertices), 3)
        );
        // Close the outline back to the first corner.
        this.m_geometry.setIndex([0, 1, 1, 2, 2, 3, 3, 0]);

        const line = new THREE.Line(this.m_geometry, debugGridMaterial);
        line.renderOrder = Number.MAX_SAFE_INTEGER;
        this.objects.push(line);
    }
}

/**
 * Minimal tile-grid overlay drawing red tile outlines, used as the offline
 * fallback for {@link createImageryWithFallback}.
 *
 * This is an examples-local equivalent of `DebugTileDataSource` from
 * `@flywave/flywave-debug-datasource`: that package is not reachable from the
 * examples package (it is not re-exported by the `@flywave/flywave.gl`
 * aggregate and not linked into `flywave-examples/node_modules`), and going
 * through its published `lib` build would pull a second, stale copy of the
 * engine into the example bundle.
 */
export class DebugGridDataSource extends DataSource {
    private readonly m_tilingScheme: TilingScheme;
    private readonly m_maxGridZoomLevel: number;

    constructor(
        tilingScheme: TilingScheme = webMercatorTilingScheme,
        name = "debug-grid",
        maxGridZoomLevel = 20
    ) {
        const options: DataSourceOptions = {
            name,
            minDataLevel: 1,
            maxDataLevel: 20,
            storageLevelOffset: -1
        };
        super(options);
        this.m_tilingScheme = tilingScheme;
        this.m_maxGridZoomLevel = maxGridZoomLevel;
        this.cacheable = true;
        this.enablePicking = false;
    }

    /** @override */
    getTilingScheme(): TilingScheme {
        return this.m_tilingScheme;
    }

    /** @override */
    getTile(tileKey: TileKey): DebugGridTile {
        return new DebugGridTile(this, tileKey);
    }

    /** @override */
    canGetTile(zoomLevel: number, tileKey: TileKey): boolean {
        if (tileKey.level > this.m_maxGridZoomLevel) {
            return false;
        }
        return super.canGetTile(zoomLevel, tileKey);
    }
}

/**
 * Add an imagery data source to the view, falling back to a
 * {@link DebugGridDataSource} when the imagery source fails to connect
 * (offline demos, blocked tile servers). The failure is surfaced through
 * MapView's `datasource-connect` event carrying an `error` field; the swap
 * happens in a microtask so we never mutate the data source list reentrantly
 * from inside `MapView.addDataSource`'s error path.
 *
 * @param mapView - The view to attach the data source to.
 * @param imagery - The imagery data source created by {@link demoImagery}.
 * @returns The data source that ended up attached: `imagery` on success, a
 * debug grid named `<imagery>-debug-grid` on failure.
 */
export async function createImageryWithFallback(
    mapView: MapView,
    imagery: WebTileDataSource
): Promise<DataSource> {
    // Guard against the classic wiring mistake: an independent imagery layer
    // on top of an active elevation source is coplanar with the draped
    // surface and depth-fights badly. Drape via `attachTerrainImagery`.
    const elevationSource = (mapView as { elevationSource?: unknown }).elevationSource;
    if (elevationSource !== undefined && elevationSource !== null) {
        logger.warn(
            `"${imagery.name}" is added as an independent layer while an elevation source ` +
                "is active — this causes depth-fighting. Use attachTerrainImagery(terrain) " +
                "to drape imagery into the terrain tiles instead."
        );
    }
    let active: DataSource = imagery;
    let fallbackStarted = false;

    const onConnect = (event: DispatcherEvent): void => {
        if (fallbackStarted || event.dataSourceName !== imagery.name) {
            return;
        }
        if (event.error === undefined) {
            return;
        }
        fallbackStarted = true;
        const gridName = `${imagery.name}-debug-grid`;
        logger.warn(
            `Imagery datasource "${imagery.name}" failed to connect, ` +
                `falling back to debug grid "${gridName}".`
        );
        active = new DebugGridDataSource(webMercatorTilingScheme, gridName);
        queueMicrotask(() => {
            mapView.removeDataSource(imagery);
            void mapView.addDataSource(active);
        });
    };

    mapView.addEventListener(MapViewEventNames.DataSourceConnect, onConnect);
    try {
        await mapView.addDataSource(imagery);
    } finally {
        mapView.removeEventListener(MapViewEventNames.DataSourceConnect, onConnect);
    }
    return active;
}
