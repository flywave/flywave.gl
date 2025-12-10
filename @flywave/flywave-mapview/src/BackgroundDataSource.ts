/* Copyright (C) 2025 flywave.gl contributors */

import { type FlatTheme, type Theme } from "@flywave/flywave-datasource-protocol";
import {
    type TileKey,
    type TilingScheme,
    webMercatorTilingScheme
} from "@flywave/flywave-geoutils";

import { DataSource } from "./DataSource";
import { addGroundPlane } from "./geometry/AddGroundPlane";
import { Tile } from "./Tile";
import { ATMOSPHERE_GROUND_RENDER_ORDER } from "./MapViewAtmosphere";

/**
 * Provides background geometry for all tiles.
 */
export class BackgroundDataSource extends DataSource {
    static readonly GROUND_RENDER_ORDER = ATMOSPHERE_GROUND_RENDER_ORDER;
    private static readonly DEFAULT_TILING_SCHEME = webMercatorTilingScheme;
    private m_tilingScheme: TilingScheme = BackgroundDataSource.DEFAULT_TILING_SCHEME;

    constructor() {
        super({ name: "background"});
        this.cacheable = true;
        this.addGroundPlane = true;
        this.enablePicking = false;
    }

    updateStorageLevelOffset() {
        let storageLevelOffset: number | undefined;

        this.mapView.dataSources.forEach(ds => {
            if (ds === this) {
                return;
            }
            const tilingScheme = ds.getTilingScheme();
            if (tilingScheme === this.m_tilingScheme) {
                storageLevelOffset =
                    storageLevelOffset === undefined
                        ? ds.storageLevelOffset
                        : Math.max(storageLevelOffset, ds.storageLevelOffset);
            }
        });

        if (storageLevelOffset === undefined) {
            storageLevelOffset = 0;
        }

        if (storageLevelOffset !== this.storageLevelOffset) {
            this.storageLevelOffset = storageLevelOffset;
            this.mapView.clearTileCache(this.name);
        }
    }

    /** @override */
    async setTheme(theme: Theme | FlatTheme, languages?: string[]): Promise<void> {
        this.mapView.clearTileCache(this.name);
    }

    setTilingScheme(tilingScheme?: TilingScheme) {
        const newScheme = tilingScheme ?? BackgroundDataSource.DEFAULT_TILING_SCHEME;
        if (newScheme === this.m_tilingScheme) {
            return;
        }

        this.m_tilingScheme = newScheme;
        this.updateStorageLevelOffset();
        this.mapView.clearTileCache(this.name);
    }

    /** @override */
    getTilingScheme(): TilingScheme {
        return this.m_tilingScheme;
    }

    /** @override */
    getTile(tileKey: TileKey): Tile | undefined {
        const tile = new Tile(this, tileKey);
        tile.forceHasGeometry(true);
        let mesh = addGroundPlane(tile, BackgroundDataSource.GROUND_RENDER_ORDER); 
        return tile;
    }
}
