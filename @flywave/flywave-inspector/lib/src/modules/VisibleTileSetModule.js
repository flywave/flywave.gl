/* Copyright (C) 2025 flywave.gl contributors */
export class VisibleTileSetModule {
    constructor(mapView) {
        this.mapView = mapView;
    }
    setupFolder(gui) {
        return gui.addFolder("🔍 VisibleTileSet");
    }
    createData() {
        return {
            cacheSize: 0,
            cacheCapacity: 0,
            cacheUsage: 0,
            resourceComputationType: "Unknown",
            totalVisibleTiles: 0,
            totalRenderedTiles: 0,
            totalLoadingTiles: 0,
            dataSourceCount: 0,
            avgTilesPerDataSource: 0,
            maxTilesPerFrame: 0,
            allTilesLoaded: false,
            tileKeyDetails: "No data",
            tileKeyMortonCodes: "No data",
            tileKeyDistribution: "No data",
            performanceImpact: "No data"
        };
    }
    updateData(data) {
        try {
            const visibleTileSet = this.mapView.visibleTileSet;
            if (visibleTileSet) {
                // Cache information
                data.cacheCapacity = visibleTileSet.getDataSourceCacheSize
                    ? visibleTileSet.getDataSourceCacheSize()
                    : 0;
                // Get cache size from map view
                data.cacheSize = this.mapView.getCacheSize ? this.mapView.getCacheSize() : 0;
                data.cacheUsage =
                    data.cacheCapacity > 0
                        ? Math.round((data.cacheSize / data.cacheCapacity) * 100)
                        : 0;
                // Resource computation type
                if (visibleTileSet.resourceComputationType !== undefined) {
                    data.resourceComputationType =
                        visibleTileSet.resourceComputationType === 0
                            ? "EstimationInMb"
                            : "NumberOfTiles";
                }
                // Tile counts and data source information
                const dataSourceTileList = visibleTileSet.dataSourceTileList || [];
                data.dataSourceCount = dataSourceTileList.length;
                let totalVisible = 0;
                let totalRendered = 0;
                let totalLoading = 0;
                dataSourceTileList.forEach((list) => {
                    if (list.visibleTiles) {
                        totalVisible += list.visibleTiles.length;
                    }
                    if (list.renderedTiles) {
                        totalRendered += list.renderedTiles.size || 0;
                    }
                    if (list.numTilesLoading) {
                        totalLoading += list.numTilesLoading;
                    }
                });
                data.totalVisibleTiles = totalVisible;
                data.totalRenderedTiles = totalRendered;
                data.totalLoadingTiles = totalLoading;
                if (data.dataSourceCount > 0) {
                    data.avgTilesPerDataSource = totalVisible / data.dataSourceCount;
                }
                // Performance metrics
                data.allTilesLoaded = visibleTileSet.allVisibleTilesLoaded || false;
                if (visibleTileSet.maxTilesPerFrame !== undefined) {
                    data.maxTilesPerFrame = visibleTileSet.maxTilesPerFrame;
                }
                // Enhanced TileKey information
                this.updateTileKeyDetails(data, dataSourceTileList);
                this.updateTileKeyMortonCodes(data, dataSourceTileList);
                this.updateTileKeyDistribution(data, dataSourceTileList);
                this.updatePerformanceImpact(data, dataSourceTileList);
            }
        }
        catch (error) {
            data.tileKeyDetails = `Error: ${error}`;
        }
    }
    updateTileKeyDetails(data, dataSourceTileList) {
        try {
            const details = [];
            dataSourceTileList.forEach((list, index) => {
                const dataSourceName = list.dataSource && list.dataSource.name
                    ? list.dataSource.name
                    : `DataSource ${index}`;
                details.push(`${dataSourceName}:`);
                if (list.visibleTiles && list.visibleTiles.length > 0) {
                    details.push(`  Visible: ${list.visibleTiles.length}`);
                    // Show details for first few tiles
                    const sampleTiles = list.visibleTiles.slice(0, 5);
                    sampleTiles.forEach((tile) => {
                        if (tile && tile.tileKey) {
                            const level = tile.tileKey.level !== undefined ? tile.tileKey.level : "?";
                            const row = tile.tileKey.row !== undefined ? tile.tileKey.row : "?";
                            const column = tile.tileKey.column !== undefined ? tile.tileKey.column : "?";
                            const mortonCode = tile.tileKey.mortonCode
                                ? tile.tileKey.mortonCode(tile.dataSource.getTilingScheme().mortonTileEncoding)
                                : "N/A";
                            details.push(`    Tile(${level},${row},${column}) morton:${mortonCode}`);
                        }
                    });
                    if (list.visibleTiles.length > 5) {
                        details.push(`    ... and ${list.visibleTiles.length - 5} more`);
                    }
                }
                if (list.renderedTiles && list.renderedTiles.size > 0) {
                    details.push(`  Rendered: ${list.renderedTiles.size}`);
                }
                if (list.numTilesLoading) {
                    details.push(`  Loading: ${list.numTilesLoading}`);
                }
            });
            data.tileKeyDetails = details.length > 0 ? details.join("\n") : "No tile data";
        }
        catch (error) {
            data.tileKeyDetails = `Error collecting details: ${error}`;
        }
    }
    updateTileKeyMortonCodes(data, dataSourceTileList) {
        try {
            const mortonCodes = [];
            dataSourceTileList.forEach((list, index) => {
                const dataSourceName = list.dataSource && list.dataSource.name
                    ? list.dataSource.name
                    : `DataSource ${index}`;
                mortonCodes.push(`${dataSourceName}:`);
                if (list.visibleTiles && list.visibleTiles.length > 0) {
                    const mortonList = [];
                    list.visibleTiles.forEach((tile) => {
                        if (tile && tile.tileKey && tile.dataSource) {
                            const mortonCode = tile.tileKey.mortonCode(tile.dataSource.getTilingScheme().mortonTileEncoding);
                            mortonList.push(mortonCode);
                        }
                    });
                    // Show first 10 morton codes
                    const sampleMortonCodes = mortonList.slice(0, 10);
                    mortonCodes.push(`  Morton Codes: ${sampleMortonCodes.join(", ")}`);
                    if (mortonList.length > 10) {
                        mortonCodes.push(`  ... and ${mortonList.length - 10} more`);
                    }
                }
            });
            data.tileKeyMortonCodes =
                mortonCodes.length > 0 ? mortonCodes.join("\n") : "No morton codes";
        }
        catch (error) {
            data.tileKeyMortonCodes = `Error collecting morton codes: ${error}`;
        }
    }
    updateTileKeyDistribution(data, dataSourceTileList) {
        try {
            const distribution = [];
            dataSourceTileList.forEach((list, index) => {
                const dataSourceName = list.dataSource && list.dataSource.name
                    ? list.dataSource.name
                    : `DataSource ${index}`;
                distribution.push(`${dataSourceName}:`);
                if (list.visibleTiles && list.visibleTiles.length > 0) {
                    // Group tiles by level
                    const levelCounts = {};
                    list.visibleTiles.forEach((tile) => {
                        if (tile && tile.tileKey) {
                            const level = tile.tileKey.level;
                            levelCounts[level] = (levelCounts[level] || 0) + 1;
                        }
                    });
                    // Sort levels
                    const levels = Object.keys(levelCounts)
                        .map(Number)
                        .sort((a, b) => a - b);
                    const levelInfo = [];
                    levels.forEach(level => {
                        levelInfo.push(`L${level}:${levelCounts[level]}`);
                    });
                    distribution.push(`  By Level: ${levelInfo.join(", ")}`);
                }
            });
            data.tileKeyDistribution =
                distribution.length > 0 ? distribution.join("\n") : "No distribution data";
        }
        catch (error) {
            data.tileKeyDistribution = `Error collecting distribution: ${error}`;
        }
    }
    updatePerformanceImpact(data, dataSourceTileList) {
        try {
            const impact = [];
            let totalTiles = 0;
            let totalLoading = 0;
            dataSourceTileList.forEach((list) => {
                const visibleCount = list.visibleTiles ? list.visibleTiles.length : 0;
                const loadingCount = list.numTilesLoading || 0;
                totalTiles += visibleCount;
                totalLoading += loadingCount;
            });
            impact.push(`Total Tiles: ${totalTiles}`);
            impact.push(`Loading Tiles: ${totalLoading}`);
            impact.push(`Loading Ratio: ${totalTiles > 0 ? ((totalLoading / totalTiles) * 100).toFixed(2) : 0}%`);
            // Memory usage estimation
            if (data.cacheSize > 0 && data.cacheCapacity > 0) {
                impact.push(`Cache Usage: ${data.cacheUsage}% (${data.cacheSize}/${data.cacheCapacity})`);
            }
            // Performance warning if needed
            if (totalLoading > totalTiles * 0.3) {
                impact.push("⚠️ High loading ratio - potential performance impact");
            }
            if (data.cacheUsage > 80) {
                impact.push("⚠️ High cache usage - consider increasing cache size");
            }
            data.performanceImpact = impact.join("\n");
        }
        catch (error) {
            data.performanceImpact = `Error calculating impact: ${error}`;
        }
    }
    bindControls(folder, data) {
        // Cache information
        folder.add(data, "cacheSize").name("Cache Size").listen();
        folder.add(data, "cacheCapacity").name("Cache Capacity").listen();
        folder.add(data, "cacheUsage", 0, 100).name("Cache Usage %").listen();
        folder.add(data, "resourceComputationType").name("Resource Type").listen();
        // Tile counts
        folder.add(data, "totalVisibleTiles").name("Total Visible").listen();
        folder.add(data, "totalRenderedTiles").name("Total Rendered").listen();
        folder.add(data, "totalLoadingTiles").name("Total Loading").listen();
        // Data source information
        folder.add(data, "dataSourceCount").name("Data Sources").listen();
        folder.add(data, "avgTilesPerDataSource").name("Avg Tiles/DS").listen();
        // Performance metrics
        folder.add(data, "maxTilesPerFrame").name("Max Tiles/Frame").listen();
        folder.add(data, "allTilesLoaded").name("All Loaded").listen();
        // Tile key details
        const detailsController = folder.add(data, "tileKeyDetails").name("Tile Details");
        detailsController.listen();
        // Style the details field for better visibility
        const detailsElement = detailsController.domElement.querySelector("input") ||
            detailsController.domElement.querySelector("textarea");
        if (detailsElement) {
            detailsElement.style.height = "150px";
            detailsElement.style.overflow = "auto";
            detailsElement.style.fontFamily = "monospace";
            detailsElement.style.fontSize = "11px";
        }
        // Enhanced TileKey information
        const mortonController = folder.add(data, "tileKeyMortonCodes").name("Morton Codes");
        mortonController.listen();
        const mortonElement = mortonController.domElement.querySelector("input") ||
            mortonController.domElement.querySelector("textarea");
        if (mortonElement) {
            mortonElement.style.height = "100px";
            mortonElement.style.overflow = "auto";
            mortonElement.style.fontFamily = "monospace";
            mortonElement.style.fontSize = "11px";
        }
        const distributionController = folder.add(data, "tileKeyDistribution").name("Distribution");
        distributionController.listen();
        const distributionElement = distributionController.domElement.querySelector("input") ||
            distributionController.domElement.querySelector("textarea");
        if (distributionElement) {
            distributionElement.style.height = "100px";
            distributionElement.style.overflow = "auto";
            distributionElement.style.fontFamily = "monospace";
            distributionElement.style.fontSize = "11px";
        }
        const impactController = folder.add(data, "performanceImpact").name("Performance Impact");
        impactController.listen();
        const impactElement = impactController.domElement.querySelector("input") ||
            impactController.domElement.querySelector("textarea");
        if (impactElement) {
            impactElement.style.height = "100px";
            impactElement.style.overflow = "auto";
            impactElement.style.fontFamily = "monospace";
            impactElement.style.fontSize = "11px";
        }
    }
}
//# sourceMappingURL=VisibleTileSetModule.js.map