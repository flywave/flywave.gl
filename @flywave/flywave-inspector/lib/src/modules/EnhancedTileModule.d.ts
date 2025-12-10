import { type MapView } from "@flywave/flywave-mapview";
import { type GUI } from "dat.gui";
export interface EnhancedTileData {
    renderedTiles: number;
    visibleTiles: number;
    loadingTiles: number;
    cacheSize: number;
    maxCacheSize: number;
    tileKeysInfo: string;
    dataSourceCount: number;
    averageTilesPerDataSource: number;
    maxTilesPerDataSource: number;
    minTilesPerDataSource: number;
    tileKeyDetails: string;
    tileKeyMortonCodes: string;
    tileKeyLevels: string;
    performanceMetrics: string;
}
export declare class EnhancedTileModule {
    private readonly mapView;
    private readonly stats;
    constructor(mapView: MapView);
    setupFolder(gui: GUI): GUI;
    createData(): EnhancedTileData;
    updateData(data: EnhancedTileData): void;
    private updateTileKeyInfo;
    private updateTileKeyDetails;
    private updateTileKeyMortonCodes;
    private updateTileKeyLevels;
    private updatePerformanceMetrics;
    bindControls(folder: GUI, data: EnhancedTileData): void;
}
