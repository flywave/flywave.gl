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
 * Options for {@link OpenStreetWebTileDataSource}.
 */
interface OpenStreetWebTileDataSourceOptions
    extends Omit<WebTileDataSourceOptions, "dataProvider"> {
    /**
     * Base URL template for OpenStreetMap tiles.
     *
     * Default template uses OpenTopoMap tiles.
     *
     * Placeholders:
     * - {server} - Tile server letter (a, b, c)
     * - {z} - Zoom level
     * - {x} - Tile X coordinate
     * - {y} - Tile Y coordinate
     */
    tileUrlTemplate?: string;

    /**
     * Subdomains for load balancing.
     *
     * @default ["a", "b", "c"]
     */
    subdomains?: string[];

    /**
     * Whether to provide copyright info.
     *
     * @default `true`
     */
    gatherCopyrightInfo?: boolean;

    /**
     * User-Agent string to identify your application.
     * Required by OSM tile usage policy.
     */
    userAgent?: string;
}

/**
 * An interface for the type of options that can be passed to the [[OpenStreetWebTileDataSource]].
 */
export type OpenStreetWebTileDataSourceParameters = OpenStreetWebTileDataSourceOptions;

export class OpenStreetTileProvider extends WebTileDataProvider {
    /**
     * Default URL template for OpenTopoMap tiles.
     */
    static readonly DEFAULT_TILE_URL_TEMPLATE =
        "https://{server}.tile.opentopomap.org/{z}/{x}/{y}.png";

    /** Copyright provider instance. */
    private readonly m_copyrightProvider: UrlCopyrightProvider;
    private readonly m_tileUrlTemplate: string;
    private readonly m_subdomains: string[];
    private readonly m_userAgent?: string;

    /** OpenStreetMap copyright info. */
    private readonly OSM_COPYRIGHT_INFO: CopyrightInfo = {
        id: "openstreetmap.org",
        year: new Date().getFullYear(),
        label: "OpenStreetMap",
        link: "https://www.openstreetmap.org/copyright"
    };

    /** OpenTopoMap copyright info. */
    private readonly OPENTOPO_COPYRIGHT_INFO: CopyrightInfo = {
        id: "opentopomap.org",
        year: new Date().getFullYear(),
        label: "OpenTopoMap",
        link: "https://opentopomap.org/about"
    };

    constructor(readonly m_options: OpenStreetWebTileDataSourceParameters) {
        super(m_options);

        this.m_tileUrlTemplate =
            m_options.tileUrlTemplate ?? OpenStreetTileProvider.DEFAULT_TILE_URL_TEMPLATE;
        this.m_subdomains = m_options.subdomains ?? ["a", "b", "c"];
        this.m_userAgent = m_options.userAgent;

        // OSM doesn't have a copyright API, so we use a static provider
        this.m_copyrightProvider = new UrlCopyrightProvider("", "topo");
    }
    /** @override */
    async getTexture(tile: Tile, abortSignal?: AbortSignal): Promise<[Texture, CopyrightInfo[]]> {
        const { column, row, level } = tile.tileKey;
        const server = this.m_subdomains[(column + row) % this.m_subdomains.length];

        const url = this.m_tileUrlTemplate
            .replace("{server}", server)
            .replace("{z}", level.toString())
            .replace("{x}", column.toString())
            .replace("{y}", row.toString());

        const headers: RequestHeaders = {};
        if (this.m_userAgent) {
            headers["User-Agent"] = this.m_userAgent;
        }

        return await Promise.all([
            textureLoader.load(url, headers, abortSignal),
            this.getTileCopyright(tile)
        ]);
    }

    mapIsoLanguageToWebTile(languages: string[]): void {
        // OpenStreetMap doesn't support language selection in tile URLs
    }

    private async getTileCopyright(tile: Tile): Promise<CopyrightInfo[]> {
        if (this.m_options.gatherCopyrightInfo === false) {
            return [this.OSM_COPYRIGHT_INFO];
        }

        const copyrights = [this.OSM_COPYRIGHT_INFO];

        // Add specific copyright for OpenTopoMap if using that service
        if (this.m_tileUrlTemplate.includes("opentopomap")) {
            copyrights.push(this.OPENTOPO_COPYRIGHT_INFO);
        }

        return copyrights;
    }
}

/**
 * Instances of `OpenStreetWebTileDataSource` can be used to add OpenStreetMap tiles to [[MapView]].
 *
 * Example:
 *
 * ```typescript
 * const osmDataSource = new OpenStreetWebTileDataSource({
 *     userAgent: "Your Application Name/1.0 (contact@example.com)"
 * });
 * ```
 *
 * Example with custom tile server:
 * ```typescript
 * const customOsmDataSource = new OpenStreetWebTileDataSource({
 *     tileUrlTemplate: "https://{server}.tile.openstreetmap.org/{z}/{x}/{y}.png",
 *     subdomains: ["a", "b", "c"],
 *     userAgent: "Your App/1.0"
 * });
 * ```
 */
export class OpenStreetWebTileDataSource extends WebTileDataSource {
    /**
     * Constructs a new `OpenStreetWebTileDataSource`.
     *
     * @param m_options - Represents the [[OpenStreetWebTileDataSourceParameters]].
     */
    constructor(m_options: OpenStreetWebTileDataSourceParameters = {}) {
        super({
            ...m_options,
            minDataLevel: 1,
            maxDataLevel: 19, // OSM typically supports up to level 19
            dataProvider: new OpenStreetTileProvider(m_options),
            storageLevelOffset: m_options.storageLevelOffset ?? -1
        });
        this.cacheable = true;
    }

    /** @override */
    setLanguages(languages?: string[]): void {
        // OpenStreetMap doesn't support language selection
    }
}
