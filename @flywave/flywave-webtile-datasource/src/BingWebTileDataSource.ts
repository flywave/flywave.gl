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
 * Options for {@link BingWebTileDataSource}.
 */
interface BingWebTileDataSourceOptions extends Omit<WebTileDataSourceOptions, "dataProvider"> {
    /**
     * Base URL template for Bing Maps tiles.
     *
     * Default template uses the aerial imagery tiles with quadkey.
     *
     * Placeholders:
     * - {server} - Tile server number (0-3)
     * - {quadKey} - Quadkey for the tile
     */
    tileUrlTemplate?: string;

    /**
     * Whether to provide copyright info.
     *
     * @default `true`
     */
    gatherCopyrightInfo?: boolean;
}

/**
 * An interface for the type of options that can be passed to the [[BingWebTileDataSource]].
 */
export type BingWebTileDataSourceParameters = BingWebTileDataSourceOptions;

export class BingTileProvider extends WebTileDataProvider {
    /**
     * Default URL template for Bing Maps aerial imagery.
     */
    static readonly DEFAULT_TILE_URL_TEMPLATE =
        "https://ecn.t{server}.tiles.virtualearth.net/tiles/a{quadKey}.jpeg?n=z&g=11640";

    /** Copyright provider instance. */
    private readonly m_copyrightProvider: UrlCopyrightProvider;
    private readonly m_tileUrlTemplate: string;

    /** Predefined fixed Bing copyright info. */
    private readonly BING_COPYRIGHT_INFO: CopyrightInfo = {
        id: "bing.com",
        year: new Date().getFullYear(),
        label: "Bing",
        link: "https://www.microsoft.com/maps/product/terms.html"
    };

    constructor(readonly m_options: BingWebTileDataSourceParameters) {
        super(m_options);

        this.m_tileUrlTemplate =
            m_options.tileUrlTemplate ?? BingTileProvider.DEFAULT_TILE_URL_TEMPLATE;

        // Bing doesn't have a public copyright API like HERE, so we just use a static provider
        this.m_copyrightProvider = new UrlCopyrightProvider("", "aerial");
    }

    /** @override */
    async getTexture(tile: Tile, abortSignal?: AbortSignal): Promise<[Texture, CopyrightInfo[]]> {
        const quadKey = tile.tileKey.toQuadKey();
        const server = quadKey.charCodeAt(quadKey.length - 1) % 4; // Use last digit of quadkey for server

        const url = this.m_tileUrlTemplate
            .replace("{server}", server.toString())
            .replace("{quadKey}", quadKey);

        return await Promise.all([
            textureLoader.load(url, undefined, abortSignal),
            this.getTileCopyright(tile)
        ]);
    }

    mapIsoLanguageToWebTile(languages: string[]): void {
        // Bing doesn't support language selection in tile URLs
    }

    private async getTileCopyright(tile: Tile): Promise<CopyrightInfo[]> {
        if (!this.m_options.gatherCopyrightInfo) {
            return [this.BING_COPYRIGHT_INFO];
        }

        return await this.m_copyrightProvider
            .getCopyrights(tile.geoBox, tile.tileKey.level)
            .then(copyrights => [...copyrights, this.BING_COPYRIGHT_INFO]);
    }
}

/**
 * Instances of `BingWebTileDataSource` can be used to add Bing Maps Web Tiles to [[MapView]].
 *
 * Example:
 *
 * ```typescript
 * const bingWebTileDataSource = new BingWebTileDataSource();
 * ```
 * @see [[DataSource]], [[OmvDataSource]].
 */
export class BingWebTileDataSource extends WebTileDataSource {
    /**
     * Constructs a new `BingWebTileDataSource`.
     *
     * @param m_options - Represents the [[BingWebTileDataSourceParameters]].
     */
    constructor(m_options: BingWebTileDataSourceParameters = {}) {
        super({
            ...m_options,
            minDataLevel: 1,
            maxDataLevel: 19, // Bing typically supports up to level 19
            dataProvider: new BingTileProvider(m_options),
            storageLevelOffset: m_options.storageLevelOffset ?? -1
        });
        this.cacheable = true;
    }

    /** @override */
    setLanguages(languages?: string[]): void {
        // Bing doesn't support language selection
    }
}
