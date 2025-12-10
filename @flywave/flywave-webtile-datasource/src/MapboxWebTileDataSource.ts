/* Copyright (C) 2025 flywave.gl contributors */

import {
    type CopyrightInfo,
    type Tile,
    TextureLoader,
    UrlCopyrightProvider
} from "@flywave/flywave-mapview";
import { type Texture } from "three";

import {
    WebTileDataProvider,
    type WebTileDataSourceOptions,
    WebTileDataSource
} from "./WebTileDataSource";

const textureLoader = new TextureLoader();

/**
 * Options for {@link MapboxWebTileDataSource}.
 */
interface MapboxWebTileDataSourceOptions extends Omit<WebTileDataSourceOptions, "dataProvider"> {
    /**
     * Mapbox style ID or URL template.
     *
     * For vector tiles:
     * - Style ID (e.g., "mapbox/streets-v11")
     * - Full style URL (e.g., "mapbox://styles/mapbox/streets-v11")
     *
     * For raster tiles:
     * - URL template with {z}/{x}/{y} placeholders
     * - Style ID for standard styles (e.g., "mapbox.satellite")
     */
    style?: string;

    /**
     * Tile format - either vector (MVT) or raster (PNG/JPG).
     *
     * @default "vector"
     */
    format?: "vector" | "raster";

    /**
     * Mapbox access token.
     */
    accessToken: string;

    /**
     * Whether to provide copyright info.
     *
     * @default `true`
     */
    gatherCopyrightInfo?: boolean;

    /**
     * Tile size in pixels.
     *
     * @default 512
     */
    tileSize?: 256 | 512;

    /**
     * High resolution (@2x) tiles.
     *
     * @default false
     */
    highResolution?: boolean;
}

/**
 * An interface for the type of options that can be passed to the [[MapboxWebTileDataSource]].
 */
export type MapboxWebTileDataSourceParameters = MapboxWebTileDataSourceOptions;

export class MapboxTileProvider extends WebTileDataProvider {
    /**
     * Default style for vector tiles.
     */
    static readonly DEFAULT_VECTOR_STYLE = "mapbox/streets-v11";

    /**
     * Default style for satellite imagery.
     */
    static readonly DEFAULT_SATELLITE_STYLE = "mapbox/satellite-v9";

    private readonly m_copyrightProvider: UrlCopyrightProvider;
    private readonly m_style: string;
    private readonly m_format: "vector" | "raster";
    private readonly m_accessToken: string;
    private readonly m_tileSize: number;
    private readonly m_highResolution: boolean;
    private m_languages?: string[];

    /** Predefined fixed Mapbox copyright info. */
    private readonly MAPBOX_COPYRIGHT_INFO: CopyrightInfo = {
        id: "mapbox.com",
        year: new Date().getFullYear(),
        label: "Mapbox",
        link: "https://www.mapbox.com/about/maps/"
    };

    constructor(readonly m_options: MapboxWebTileDataSourceParameters) {

        super(m_options);

        this.m_style =
            m_options.style ||
            (m_options.format === "raster"
                ? MapboxTileProvider.DEFAULT_SATELLITE_STYLE
                : MapboxTileProvider.DEFAULT_VECTOR_STYLE);
        this.m_format = m_options.format || "vector";
        this.m_accessToken = m_options.accessToken;
        this.m_tileSize = m_options.tileSize || 512;
        this.m_highResolution = m_options.highResolution || false;

        // Mapbox doesn't have a public copyright API, so we use a static provider
        this.m_copyrightProvider = new UrlCopyrightProvider(
            "",
            this.m_format === "vector" ? "vector" : "satellite"
        );
    }

    /** @override */
    async getTexture(tile: Tile, abortSignal?: AbortSignal): Promise<[Texture, CopyrightInfo[]]> {
        const url = this.getTileUrl(tile);

        return await Promise.all([
            textureLoader.load(url, undefined, abortSignal),
            this.getTileCopyright(tile)
        ]);
    }

    mapIsoLanguageToWebTile(languages: string[]): void {
        this.m_languages = languages;
    }

    /** @override */
    get minLevel(): number {
        return this.m_options.minDataLevel ?? 0;
    }

    /** @override */
    get maxLevel(): number {
        return this.m_options.maxDataLevel ?? 19;
    }

    private getTileUrl(tile: Tile): string {
        const { column, row, level } = tile.tileKey;
        const isVector = this.m_format === "vector";
        const resolution = this.m_highResolution ? "@2x" : "";
        const tileSizeParam = this.m_tileSize === 512 ? "?size=512" : "";

        if (isVector) {
            // Vector tile URL format
            const styleUrl = this.m_style.startsWith("mapbox://")
                ? this.m_style.replace("mapbox://", "")
                : `styles/${this.m_style}`;

            return `https://api.mapbox.com/${styleUrl}/tiles/${level}/${column}/${row}${resolution}?access_token=${this.m_accessToken}`;
        } else {
            // Raster tile URL format
            if (this.m_style.includes("{z}")) {
                // Custom URL template
                return this.m_style
                    .replace("{z}", level.toString())
                    .replace("{x}", column.toString())
                    .replace("{y}", row.toString())
                    .replace("{accessToken}", this.m_accessToken);
            } else {
                // Standard Mapbox style
                return `https://api.mapbox.com/styles/v1/${this.m_style}/tiles/${this.m_tileSize}/${level}/${column}/${row}${resolution}?access_token=${this.m_accessToken}${tileSizeParam}`;
            }
        }
    }

    private async getTileCopyright(tile: Tile): Promise<CopyrightInfo[]> {
        if (this.m_options.gatherCopyrightInfo === false) {
            return [this.MAPBOX_COPYRIGHT_INFO];
        }

        return await this.m_copyrightProvider
            .getCopyrights(tile.geoBox, tile.tileKey.level)
            .then(copyrights => [...copyrights, this.MAPBOX_COPYRIGHT_INFO]);
    }
}

/**
 * Instances of `MapboxWebTileDataSource` can be used to add Mapbox Web Tiles to [[MapView]].
 *
 * Example for vector tiles:
 * ```typescript
 * const mapboxVectorDataSource = new MapboxWebTileDataSource({
 *     style: "mapbox/streets-v11",
 *     format: "vector",
 *     accessToken: "your_access_token"
 * });
 * ```
 *
 * Example for satellite imagery:
 * ```typescript
 * const mapboxSatelliteDataSource = new MapboxWebTileDataSource({
 *     style: "mapbox/satellite-v9",
 *     format: "raster",
 *     accessToken: "your_access_token"
 * });
 * ```
 */
export class MapboxWebTileDataSource extends WebTileDataSource {
    /**
     * Constructs a new `MapboxWebTileDataSource`.
     *
     * @param m_options - Represents the [[MapboxWebTileDataSourceParameters]].
     */
    constructor(m_options: MapboxWebTileDataSourceParameters) {
        super({
            ...m_options,
            minDataLevel: 1,
            maxDataLevel: m_options.format === "vector" ? 22 : 19, // Vector supports higher zoom
            dataProvider: new MapboxTileProvider(m_options),
            storageLevelOffset: m_options.storageLevelOffset ?? -1
        });
        this.cacheable = true;
    }

    /** @override */
    setLanguages(languages?: string[]): void {
        if (languages !== undefined) {
            (this.dataProvider as MapboxTileProvider).mapIsoLanguageToWebTile(languages);
            this.mapView.markTilesDirty(this);
        }
    }
}
