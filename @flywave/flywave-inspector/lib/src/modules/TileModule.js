/* Copyright (C) 2025 flywave.gl contributors */
import { PerformanceStatistics } from "@flywave/flywave-mapview/Statistics";
export class TileModule {
    constructor(mapView) {
        this.mapView = mapView;
        this.stats = PerformanceStatistics.instance;
    }
    setupFolder(gui) {
        return gui.addFolder("🧱 Tiles");
    }
    createData() {
        return {
            renderedTiles: 0,
            visibleTiles: 0,
            loadingTiles: 0,
            cacheSize: 0,
            maxCacheSize: 0
        };
    }
    updateData(data) {
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
    bindControls(folder, data) {
        folder.add(data, "renderedTiles").name("Rendered Tiles").listen();
        folder.add(data, "visibleTiles").name("Visible Tiles").listen();
        folder.add(data, "loadingTiles").name("Loading Tiles").listen();
        folder.add(data, "cacheSize").name("Cache Size").listen();
        folder.add(data, "maxCacheSize").name("Max Cache Size").listen();
    }
}
//# sourceMappingURL=TileModule.js.map