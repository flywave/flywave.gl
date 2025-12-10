/* Copyright (C) 2025 flywave.gl contributors */

import {
    type CopyrightInfo,
    type RequestHeaders,
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
 * Options for {@link ArcGISWebTileDataSource}.
 */
interface ArcGISWebTileDataSourceOptions extends Omit<WebTileDataSourceOptions, "dataProvider"> {
    /**
     * Base URL template for ArcGIS tiles.
     *
     * Default template uses World Imagery service.
     *
     * Placeholders:
     * - {z} - Zoom level
     * - {x} - Tile X coordinate
     * - {y} - Tile Y coordinate
     */
    tileUrlTemplate?: string;

    /**
     * Subdomains for load balancing.
     *
     * @default ["server"]
     */
    subdomains?: string[];

    /**
     * Whether to provide copyright info.
     *
     * @default `true`
     */
    gatherCopyrightInfo?: boolean;

    /**
     * Token for authenticated access (optional).
     */
    token?: string;
}

/**
 * An interface for the type of options that can be passed to the [[ArcGISWebTileDataSource]].
 */
export type ArcGISWebTileDataSourceParameters = ArcGISWebTileDataSourceOptions;

export class ArcGISTileProvider extends WebTileDataProvider {
    /**
     * Default URL template for ArcGIS World Imagery.
     */
    static readonly DEFAULT_TILE_URL_TEMPLATE =
        "https://{server}.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}";

    /** Copyright provider instance. */
    private readonly m_copyrightProvider: UrlCopyrightProvider;
    private readonly m_tileUrlTemplate: string;
    private readonly m_subdomains: string[];
    private readonly m_token?: string;

    /** ArcGIS copyright info. */
    private readonly ARCGIS_COPYRIGHT_INFO: CopyrightInfo = {
        id: "arcgis.com",
        year: new Date().getFullYear(),
        label: "Esri",
        link: "https://www.esri.com/en-us/legal/terms/full-master-agreement"
    };

    /** World Imagery copyright info. */
    private readonly IMAGERY_COPYRIGHT_INFO: CopyrightInfo = {
        id: "arcgis-imagery",
        year: new Date().getFullYear(),
        label: "Esri, Maxar, Earthstar Geographics",
        link: "https://www.arcgis.com/home/item.html?id=10df2279f9684e4a9f6a7f08febac2a9"
    };

    constructor(readonly m_options: ArcGISWebTileDataSourceParameters = {}) {
        super(m_options);

        this.m_tileUrlTemplate =
            m_options?.tileUrlTemplate ?? ArcGISTileProvider.DEFAULT_TILE_URL_TEMPLATE;
        this.m_subdomains = m_options?.subdomains ?? ["server"];
        this.m_token = m_options?.token;

        // ArcGIS doesn't have a public copyright API, so we use a static provider
        this.m_copyrightProvider = new UrlCopyrightProvider("", "imagery");
    }

    /** @override */
    get minDataLevel(): number {
        return this.m_options.minDataLevel ?? 0;
    }

    /** @override */
    get maxDataLevel(): number {
        return this.m_options.maxDataLevel ?? 19;
    }

    /** @override */
    async getTexture(tile: Tile, abortSignal?: AbortSignal): Promise<[Texture, CopyrightInfo[]]> {
        const { column, row, level } = tile.tileKey;
        const server = this.m_subdomains[Math.floor(Math.random() * this.m_subdomains.length)];

        const url = this.m_tileUrlTemplate
            .replace("{server}", server)
            .replace("{z}", level.toString())
            .replace("{x}", column.toString())
            .replace("{y}", row.toString());

        const headers: RequestHeaders = {};
        if (this.m_token) {
            headers["Authorization"] = `Bearer ${this.m_token}`;
        }

        return await Promise.all([
            textureLoader.load(url, headers, abortSignal),
            this.getTileCopyright(tile)
        ]);
    }

    mapIsoLanguageToWebTile(languages: string[]): void {
        // ArcGIS doesn't support language selection in tile URLs
    }

    private async getTileCopyright(tile: Tile): Promise<CopyrightInfo[]> {
        if (this.m_options.gatherCopyrightInfo === false) {
            return [this.ARCGIS_COPYRIGHT_INFO];
        }

        const copyrights = [this.ARCGIS_COPYRIGHT_INFO];

        // Add specific copyright for World Imagery if using that service
        if (this.m_tileUrlTemplate.includes("World_Imagery")) {
            copyrights.push(this.IMAGERY_COPYRIGHT_INFO);
        }

        return copyrights;
    }
}

/**
 * Instances of `ArcGISWebTileDataSource` can be used to add ArcGIS Online tiles to [[MapView]].
 *
 * Example for World Imagery:
 * ```typescript
 * const arcGISDataSource = new ArcGISWebTileDataSource();
 * ```
 *
 * Example with custom service:
 * ```typescript
 * const customArcGISDataSource = new ArcGISWebTileDataSource({
 *     tileUrlTemplate: "https://{server}.arcgisonline.com/ArcGIS/rest/services/World_Street_Map/MapServer/tile/{z}/{y}/{x}",
 *     subdomains: ["server1", "server2", "server3"],
 *     token: "your_token_if_needed"
 * });
 * ```
 */
export class ArcGISWebTileDataSource extends WebTileDataSource {
    /**
     * Constructs a new `ArcGISWebTileDataSource`.
     *
     * @param m_options - Represents the [[ArcGISWebTileDataSourceParameters]].
     */
    constructor(m_options: ArcGISWebTileDataSourceParameters = {}) {
        super({
            ...m_options,
            minDataLevel: 1,
            maxDataLevel: 19, // ArcGIS typically supports up to level 19
            dataProvider: new ArcGISTileProvider(m_options),
            storageLevelOffset: m_options.storageLevelOffset ?? -1
        });
        this.cacheable = true;
    }

    /** @override */
    setLanguages(languages?: string[]): void {
        // ArcGIS doesn't support language selection
    }
}
