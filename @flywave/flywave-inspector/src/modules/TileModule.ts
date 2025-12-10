/* Copyright (C) 2025 flywave.gl contributors */

import { type MapView } from "@flywave/flywave-mapview";
import { PerformanceStatistics } from "@flywave/flywave-mapview/Statistics";
import { type GUI } from "dat.gui";

export interface TileData {
    renderedTiles: number;
    visibleTiles: number;
    loadingTiles: number;
    cacheSize: number;
    maxCacheSize: number;
}

export class TileModule {
    private readonly mapView: MapView;
    private readonly stats: PerformanceStatistics;

    constructor(mapView: MapView) {
        this.mapView = mapView;
        this.stats = PerformanceStatistics.instance;
    }

    setupFolder(gui: GUI): GUI {
        return gui.addFolder("🧱 Tiles");
    }

    createData(): TileData {
        return {
            renderedTiles: 0,
            visibleTiles: 0,
            loadingTiles: 0,
            cacheSize: 0,
            maxCacheSize: 0
        };
    }

    updateData(data: TileData): void {
        const visibleTileSet = this.mapView.visibleTileSet;
        const stats = this.stats.getLastFrameStatistics();

        if (stats && stats.frames) {
            data.renderedTiles = stats.frames["renderCount.numTilesRendered"] || 0;
            data.visibleTiles = stats.frames["renderCount.numTilesVisible"] || 0;
            data.loadingTiles = stats.frames["renderCount.numTilesLoading"] || 0;
        }

        data.cacheSize = visibleTileSet.getDataSourceCacheSize();
        data.maxCacheSize = this.mapView.getCacheSize();
    }

    bindControls(folder: GUI, data: TileData): void {
        folder.add(data, "renderedTiles").name("Rendered Tiles").listen();
        folder.add(data, "visibleTiles").name("Visible Tiles").listen();
        folder.add(data, "loadingTiles").name("Loading Tiles").listen();
        folder.add(data, "cacheSize").name("Cache Size").listen();
        folder.add(data, "maxCacheSize").name("Max Cache Size").listen();
    }
}
