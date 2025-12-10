/* Copyright (C) 2025 flywave.gl contributors */

import {
    type CopyrightInfo,
    type RequestHeaders,
    type Tile,
    TextureLoader
} from "@flywave/flywave-mapview";
import { type Texture } from "three";

import {
    WebTileDataProvider,
    type WebTileDataSourceOptions,
    WebTileDataSource
} from "./WebTileDataSource";

const textureLoader = new TextureLoader();

/**
 * Options for {@link CustomWebTileDataSource}.
 */
interface CustomWebTileDataSourceOptions extends Omit<WebTileDataSourceOptions, "dataProvider"> {
    /**
     * Base URL template for custom tiles.
     *
     * Placeholders:
     * - {z} - Zoom level
     * - {x} - Tile X coordinate
     * - {y} - Tile Y coordinate (for TMS, use {-y} for XYZ)
     */
    tileUrlTemplate: string;

    /**
     * Subdomains for load balancing.
     *
     * @default []
     */
    subdomains?: string[];

    /**
     * Custom copyright information.
     */
    copyrightInfo?: CopyrightInfo;

    /**
     * Headers to be sent with the tile request.
     */
    headers?: RequestHeaders;

    /**
     * Minimum zoom level for data.
     *
     * @default 0
     */
    minZoomLevel?: number;

    /**
     * Maximum zoom level for data.
     *
     * @default 20
     */
    maxZoomLevel?: number;
}

/**
 * An interface for the type of options that can be passed to the [[CustomWebTileDataSource]].
 */
export type CustomWebTileDataSourceParameters = CustomWebTileDataSourceOptions;

export class CustomTileProvider extends WebTileDataProvider {
    private readonly m_tileUrlTemplate: string;
    private readonly m_subdomains: string[];
    private readonly m_copyrightInfo?: CopyrightInfo;
    private readonly m_headers?: RequestHeaders;

    constructor(readonly m_options: CustomWebTileDataSourceParameters) {
        super(m_options);

        if (!m_options.tileUrlTemplate) {
            throw new Error("tileUrlTemplate is required");
        }

        this.m_tileUrlTemplate = m_options.tileUrlTemplate;
        this.m_subdomains = m_options.subdomains ?? [];
        this.m_copyrightInfo = m_options.copyrightInfo;
        this.m_headers = m_options.headers;
    }

    get minLevel(): number {
        return this.m_options.minZoomLevel ?? 0;
    }

    get maxLevel(): number {
        return this.m_options.maxZoomLevel ?? 19;
    }
    
    /** @override */
    async getTexture(tile: Tile, abortSignal?: AbortSignal): Promise<[Texture, CopyrightInfo[]]> {
        const { column, row, level } = tile.tileKey;

        // Handle TMS vs XYZ tile coordinates
        let yCoord = row;
        if (this.m_tileUrlTemplate.includes("{-y}")) {
            // TMS coordinate system
            const maxY = Math.pow(2, level) - 1;
            yCoord = maxY - row;
        }

        // Replace placeholders in URL template
        let url = this.m_tileUrlTemplate
            .replace("{z}", level.toString())
            .replace("{x}", column.toString())
            .replace("{y}", yCoord.toString())
            .replace("{-y}", yCoord.toString());

        // Handle subdomains
        if (this.m_subdomains.length > 0) {
            const server = this.m_subdomains[Math.floor(Math.random() * this.m_subdomains.length)];
            url = url.replace("{s}", server);
        }

        // Load texture with optional headers
        const headers: RequestHeaders = { ...this.m_headers };

        const texture = await textureLoader.load(url, headers, abortSignal);

        // Return texture with copyright info
        const copyrightInfo: CopyrightInfo[] = this.m_copyrightInfo
            ? [this.m_copyrightInfo]
            : [
                  {
                      id: "custom-tiles",
                      year: new Date().getFullYear(),
                      label: "Custom Tiles",
                      link: ""
                  }
              ];

        return [texture, copyrightInfo];
    }

    mapIsoLanguageToWebTile(languages: string[]): void {
        // Custom provider doesn't support language selection by default
    }
}

/**
 * Instances of `CustomWebTileDataSource` can be used to add custom web tiles to [[MapView]].
 *
 * Example:
 * ```typescript
 * const customDataSource = new CustomWebTileDataSource({
 *     tileUrlTemplate: "https://mytiles.com/{z}/{x}/{y}.png",
 *     copyrightInfo: {
 *         id: "my-tiles-copyright",
 *         year: 2023,
 *         label: "My Custom Tiles",
 *         link: "https://mytiles.com/copyright"
 *     }
 * });
 * ```
 *
 * Example with subdomains:
 * ```typescript
 * const customDataSource = new CustomWebTileDataSource({
 *     tileUrlTemplate: "https://{s}.mytiles.com/{z}/{x}/{y}.png",
 *     subdomains: ["a", "b", "c"],
 *     minZoomLevel: 1,
 *     maxZoomLevel: 18
 * });
 * ```
 */
export class CustomWebTileDataSource extends WebTileDataSource {
    /**
     * Constructs a new `CustomWebTileDataSource`.
     *
     * @param m_options - Represents the [[CustomWebTileDataSourceParameters]].
     */
    constructor(m_options: CustomWebTileDataSourceParameters) {
        if (!m_options.tileUrlTemplate) {
            throw new Error("tileUrlTemplate is required");
        }

        super({
            ...m_options,
            minDataLevel: m_options.minZoomLevel ?? 0,
            maxDataLevel: m_options.maxZoomLevel ?? 19,
            dataProvider: new CustomTileProvider(m_options),
            storageLevelOffset: m_options.storageLevelOffset ?? -1
        });
        this.cacheable = true;
    }

    /** @override */
    setLanguages(languages?: string[]): void {
        // Custom provider doesn't support language selection by default
    }
}
