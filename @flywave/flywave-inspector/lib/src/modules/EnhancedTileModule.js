/* Copyright (C) 2025 flywave.gl contributors */
import { PerformanceStatistics } from "@flywave/flywave-mapview/Statistics";
export class EnhancedTileModule {
    constructor(mapView) {
        this.mapView = mapView;
        this.stats = PerformanceStatistics.instance;
    }
    setupFolder(gui) {
        return gui.addFolder("🧱 Enhanced Tiles");
    }
    createData() {
        return {
            renderedTiles: 0,
            visibleTiles: 0,
            loadingTiles: 0,
            cacheSize: 0,
            maxCacheSize: 0,
            tileKeysInfo: "No data",
            dataSourceCount: 0,
            averageTilesPerDataSource: 0,
            maxTilesPerDataSource: 0,
            minTilesPerDataSource: 0,
            tileKeyDetails: "No data",
            tileKeyMortonCodes: "No data",
            tileKeyLevels: "No data",
            performanceMetrics: "No data"
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
        // Enhanced tile information
        this.updateTileKeyInfo(data, visibleTileSet);
        this.updateTileKeyDetails(data, visibleTileSet);
        this.updateTileKeyMortonCodes(data, visibleTileSet);
        this.updateTileKeyLevels(data, visibleTileSet);
        this.updatePerformanceMetrics(data, visibleTileSet, stats);
    }
    updateTileKeyInfo(data, visibleTileSet) {
        try {
            const dataSourceTileList = visibleTileSet.dataSourceTileList || [];
            data.dataSourceCount = dataSourceTileList.length;
            if (dataSourceTileList.length > 0) {
                const tileCounts = dataSourceTileList.map((list) => list.visibleTiles ? list.visibleTiles.length : 0);
                if (tileCounts.length > 0) {
                    data.averageTilesPerDataSource =
                        tileCounts.reduce((a, b) => a + b, 0) / tileCounts.length;
                    data.maxTilesPerDataSource = Math.max(...tileCounts);
                    data.minTilesPerDataSource = Math.min(...tileCounts);
                }
                // Collect tile key information
                const tileKeyInfo = [];
                dataSourceTileList.forEach((list, index) => {
                    const dataSourceName = list.dataSource
                        ? list.dataSource.name
                        : `DataSource ${index}`;
                    const visibleCount = list.visibleTiles ? list.visibleTiles.length : 0;
                    const renderedCount = list.renderedTiles ? list.renderedTiles.size : 0;
                    const loadingCount = list.numTilesLoading || 0;
                    tileKeyInfo.push(`${dataSourceName}: ${visibleCount} visible, ${renderedCount} rendered, ${loadingCount} loading`);
                    // Add some tile key details if available
                    if (list.visibleTiles && list.visibleTiles.length > 0) {
                        const sampleTiles = list.visibleTiles.slice(0, 3); // Show first 3 tiles
                        sampleTiles.forEach((tile) => {
                            if (tile && tile.tileKey) {
                                const mortonCode = tile.tileKey.mortonCode
                                    ? tile.tileKey.mortonCode(tile.dataSource.getTilingScheme().mortonTileEncoding)
                                    : "N/A";
                                const level = tile.tileKey.level !== undefined ? tile.tileKey.level : "N/A";
                                const row = tile.tileKey.row !== undefined ? tile.tileKey.row : "N/A";
                                const column = tile.tileKey.column !== undefined ? tile.tileKey.column : "N/A";
                                tileKeyInfo.push(`  Tile(${level},${row},${column}) morton:${mortonCode}`);
                            }
                        });
                        if (list.visibleTiles.length > 3) {
                            tileKeyInfo.push(`  ... and ${list.visibleTiles.length - 3} more tiles`);
                        }
                    }
                });
                data.tileKeysInfo = tileKeyInfo.join("\n");
            }
            else {
                data.tileKeysInfo = "No data sources";
            }
        }
        catch (error) {
            data.tileKeysInfo = `Error collecting tile info: ${error}`;
        }
    }
    updateTileKeyDetails(data, visibleTileSet) {
        try {
            const dataSourceTileList = visibleTileSet.dataSourceTileList || [];
            const details = [];
            dataSourceTileList.forEach((list, index) => {
                const dataSourceName = list.dataSource
                    ? list.dataSource.name
                    : `DataSource ${index}`;
                details.push(`${dataSourceName}:`);
                if (list.visibleTiles && list.visibleTiles.length > 0) {
                    // Group by level
                    const levelGroups = {};
                    list.visibleTiles.forEach((tile) => {
                        if (tile && tile.tileKey) {
                            const level = tile.tileKey.level;
                            if (!levelGroups[level])
                                levelGroups[level] = [];
                            levelGroups[level].push(tile);
                        }
                    });
                    // Show details for each level
                    Object.keys(levelGroups)
                        .sort((a, b) => parseInt(a) - parseInt(b))
                        .forEach(level => {
                        const tiles = levelGroups[parseInt(level)];
                        details.push(`  Level ${level}: ${tiles.length} tiles`);
                        // Show first 3 tiles with full details
                        tiles.slice(0, 3).forEach((tile) => {
                            if (tile.tileKey) {
                                const row = tile.tileKey.row;
                                const column = tile.tileKey.column;
                                const mortonCode = tile.tileKey.mortonCode(tile.dataSource.getTilingScheme().mortonTileEncoding);
                                details.push(`    Tile(${level},${row},${column}) morton:${mortonCode}`);
                            }
                        });
                        if (tiles.length > 3) {
                            details.push(`    ... and ${tiles.length - 3} more`);
                        }
                    });
                }
            });
            data.tileKeyDetails = details.length > 0 ? details.join("\n") : "No tile details";
        }
        catch (error) {
            data.tileKeyDetails = `Error collecting details: ${error}`;
        }
    }
    updateTileKeyMortonCodes(data, visibleTileSet) {
        try {
            const dataSourceTileList = visibleTileSet.dataSourceTileList || [];
            const mortonInfo = [];
            dataSourceTileList.forEach((list, index) => {
                const dataSourceName = list.dataSource
                    ? list.dataSource.name
                    : `DataSource ${index}`;
                mortonInfo.push(`${dataSourceName}:`);
                if (list.visibleTiles && list.visibleTiles.length > 0) {
                    const mortonCodes = [];
                    list.visibleTiles.forEach((tile) => {
                        if (tile && tile.tileKey && tile.dataSource) {
                            const mortonCode = tile.tileKey.mortonCode(tile.dataSource.getTilingScheme().mortonTileEncoding);
                            mortonCodes.push(mortonCode);
                        }
                    });
                    // Show statistics
                    if (mortonCodes.length > 0) {
                        const min = Math.min(...mortonCodes);
                        const max = Math.max(...mortonCodes);
                        const avg = mortonCodes.reduce((a, b) => a + b, 0) / mortonCodes.length;
                        mortonInfo.push(`  Count: ${mortonCodes.length}`);
                        mortonInfo.push(`  Range: ${min} - ${max}`);
                        mortonInfo.push(`  Average: ${Math.round(avg)}`);
                        // Show first 10 codes
                        const sample = mortonCodes.slice(0, 10);
                        mortonInfo.push(`  Sample: ${sample.join(", ")}`);
                        if (mortonCodes.length > 10) {
                            mortonInfo.push(`  ... and ${mortonCodes.length - 10} more`);
                        }
                    }
                }
            });
            data.tileKeyMortonCodes =
                mortonInfo.length > 0 ? mortonInfo.join("\n") : "No morton codes";
        }
        catch (error) {
            data.tileKeyMortonCodes = `Error collecting morton codes: ${error}`;
        }
    }
    updateTileKeyLevels(data, visibleTileSet) {
        try {
            const dataSourceTileList = visibleTileSet.dataSourceTileList || [];
            const levelInfo = [];
            dataSourceTileList.forEach((list, index) => {
                const dataSourceName = list.dataSource
                    ? list.dataSource.name
                    : `DataSource ${index}`;
                levelInfo.push(`${dataSourceName}:`);
                if (list.visibleTiles && list.visibleTiles.length > 0) {
                    // Count by level
                    const levelCounts = {};
                    list.visibleTiles.forEach((tile) => {
                        if (tile && tile.tileKey) {
                            const level = tile.tileKey.level;
                            levelCounts[level] = (levelCounts[level] || 0) + 1;
                        }
                    });
                    // Sort and display
                    const levels = Object.keys(levelCounts)
                        .map(Number)
                        .sort((a, b) => a - b);
                    const levelDetails = [];
                    levels.forEach(level => {
                        levelDetails.push(`L${level}:${levelCounts[level]}`);
                    });
                    levelInfo.push(`  ${levelDetails.join(", ")}`);
                }
            });
            data.tileKeyLevels = levelInfo.length > 0 ? levelInfo.join("\n") : "No level data";
        }
        catch (error) {
            data.tileKeyLevels = `Error collecting level data: ${error}`;
        }
    }
    updatePerformanceMetrics(data, visibleTileSet, stats) {
        try {
            const dataSourceTileList = visibleTileSet.dataSourceTileList || [];
            const metrics = [];
            // Tile counts
            let totalVisible = 0;
            let totalRendered = 0;
            let totalLoading = 0;
            dataSourceTileList.forEach((list) => {
                totalVisible += list.visibleTiles ? list.visibleTiles.length : 0;
                totalRendered += list.renderedTiles ? list.renderedTiles.size : 0;
                totalLoading += list.numTilesLoading || 0;
            });
            metrics.push(`Tiles - Visible: ${totalVisible}, Rendered: ${totalRendered}, Loading: ${totalLoading}`);
            // Loading ratio
            if (totalVisible > 0) {
                const loadingRatio = (totalLoading / totalVisible) * 100;
                metrics.push(`Loading Ratio: ${loadingRatio.toFixed(2)}%`);
                if (loadingRatio > 30) {
                    metrics.push(`⚠️ High loading ratio - potential performance bottleneck`);
                }
            }
            // Cache usage
            if (data.maxCacheSize > 0) {
                const cacheUsage = (data.cacheSize / data.maxCacheSize) * 100;
                metrics.push(`Cache Usage: ${cacheUsage.toFixed(2)}% (${data.cacheSize}/${data.maxCacheSize})`);
                if (cacheUsage > 80) {
                    metrics.push(`⚠️ High cache usage - consider increasing cache size`);
                }
            }
            // Stats if available
            if (stats && stats.frames) {
                const frameTime = stats.frames["render.fullFrameTime"] || 0;
                metrics.push(`Frame Time: ${frameTime.toFixed(2)}ms`);
                if (frameTime > 16.67) {
                    metrics.push(`⚠️ Frame time exceeds 60fps target (${(frameTime - 16.67).toFixed(2)}ms over)`);
                }
            }
            data.performanceMetrics = metrics.join("\n");
        }
        catch (error) {
            data.performanceMetrics = `Error collecting metrics: ${error}`;
        }
    }
    bindControls(folder, data) {
        folder.add(data, "renderedTiles").name("Rendered Tiles").listen();
        folder.add(data, "visibleTiles").name("Visible Tiles").listen();
        folder.add(data, "loadingTiles").name("Loading Tiles").listen();
        folder.add(data, "cacheSize").name("Cache Size").listen();
        folder.add(data, "maxCacheSize").name("Max Cache Size").listen();
        folder.add(data, "dataSourceCount").name("Data Sources").listen();
        folder.add(data, "averageTilesPerDataSource").name("Avg Tiles/DS").listen();
        folder.add(data, "maxTilesPerDataSource").name("Max Tiles/DS").listen();
        folder.add(data, "minTilesPerDataSource").name("Min Tiles/DS").listen();
        // Add a multi-line text field for detailed tile key information
        const tileKeysController = folder.add(data, "tileKeysInfo").name("Tile Keys Info");
        tileKeysController.listen();
        // Make the tile keys info field taller for better visibility
        const tileKeysElement = tileKeysController.domElement.querySelector("input") ||
            tileKeysController.domElement.querySelector("textarea");
        if (tileKeysElement) {
            tileKeysElement.style.height = "100px";
            tileKeysElement.style.overflow = "auto";
            if (tileKeysElement.tagName === "INPUT") {
                // Convert to textarea for multi-line display
                const textarea = document.createElement("textarea");
                textarea.style.width = "100%";
                textarea.style.height = "100px";
                textarea.style.overflow = "auto";
                textarea.disabled = true;
                textarea.value = data.tileKeysInfo;
                tileKeysElement.parentNode?.replaceChild(textarea, tileKeysElement);
            }
        }
        // Enhanced TileKey information
        const detailsController = folder.add(data, "tileKeyDetails").name("Tile Key Details");
        detailsController.listen();
        const detailsElement = detailsController.domElement.querySelector("input") ||
            detailsController.domElement.querySelector("textarea");
        if (detailsElement) {
            detailsElement.style.height = "150px";
            detailsElement.style.overflow = "auto";
            detailsElement.style.fontFamily = "monospace";
            detailsElement.style.fontSize = "11px";
        }
        const mortonController = folder.add(data, "tileKeyMortonCodes").name("Morton Codes");
        mortonController.listen();
        const mortonElement = mortonController.domElement.querySelector("input") ||
            mortonController.domElement.querySelector("textarea");
        if (mortonElement) {
            mortonElement.style.height = "120px";
            mortonElement.style.overflow = "auto";
            mortonElement.style.fontFamily = "monospace";
            mortonElement.style.fontSize = "11px";
        }
        const levelsController = folder.add(data, "tileKeyLevels").name("Tile Levels");
        levelsController.listen();
        const levelsElement = levelsController.domElement.querySelector("input") ||
            levelsController.domElement.querySelector("textarea");
        if (levelsElement) {
            levelsElement.style.height = "80px";
            levelsElement.style.overflow = "auto";
            levelsElement.style.fontFamily = "monospace";
            levelsElement.style.fontSize = "11px";
        }
        const metricsController = folder
            .add(data, "performanceMetrics")
            .name("Performance Metrics");
        metricsController.listen();
        const metricsElement = metricsController.domElement.querySelector("input") ||
            metricsController.domElement.querySelector("textarea");
        if (metricsElement) {
            metricsElement.style.height = "120px";
            metricsElement.style.overflow = "auto";
            metricsElement.style.fontFamily = "monospace";
            metricsElement.style.fontSize = "11px";
        }
    }
}
//# sourceMappingURL=EnhancedTileModule.js.map