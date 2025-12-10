/* Copyright (C) 2025 flywave.gl contributors */

import { type DecodedTile } from "@flywave/flywave-datasource-protocol";
import {
    type Projection,
    type TileKey,
    type TilingScheme,
    mercatorProjection,
    webMercatorTilingScheme
} from "@flywave/flywave-geoutils";

import { type DataSourceOptions, DataSource } from "../src/DataSource";
import { type ITileLoader, TileLoaderState } from "../src/ITileLoader";
import { Tile } from "../src/Tile";

export class FakeTileLoader implements ITileLoader {
    state: TileLoaderState = TileLoaderState.Initialized;
    payload?: ArrayBufferLike | {};
    priority: number = 1;
    decodedTile?: DecodedTile = {
        techniques: [],
        geometries: []
    };

    reject?: (reason?: any) => void;

    isFinished: boolean = false;

    loadAndDecode(): Promise<TileLoaderState> {
        this.state = TileLoaderState.Loading;
        return new Promise((resolve, reject) => {
            this.reject = reject;
            // We use setTimeout to delay the resolve
            setTimeout(() => {
                this.state = TileLoaderState.Loaded;
                resolve(TileLoaderState.Ready);
            });
        });
    }

    waitSettled(): Promise<TileLoaderState> {
        return Promise.resolve(TileLoaderState.Ready);
    }

    cancel(): void {
        this.state = TileLoaderState.Canceled;
        this.reject!(this.state);
    }
}
export class FakeOmvDataSource extends DataSource {
    private m_languages: string[] | undefined;

    constructor(options: DataSourceOptions) {
        super(options);
        this.cacheable = true;
    }

    /** @override */
    get projection(): Projection {
        return mercatorProjection;
    }

    /** @override */
    getTilingScheme(): TilingScheme {
        return webMercatorTilingScheme;
    }

    /** @override */
    getTile(tileKey: TileKey): Tile {
        const tile = new Tile(this, tileKey);
        tile.tileLoader = new FakeTileLoader();
        tile.load();
        return tile;
    }

    /** @override */
    canGetTile(zoomLevel: number, tileKey: TileKey): boolean {
        if (tileKey.level > 14) {
            return false;
        }
        if (tileKey.level <= 14 && zoomLevel >= 14) {
            return true;
        }
        return super.canGetTile(zoomLevel, tileKey);
    }

    /** @override */
    setLanguages(languages?: string[]): void {
        this.m_languages = languages;
    }

    getLanguages(): string[] | undefined {
        return this.m_languages;
    }
}
