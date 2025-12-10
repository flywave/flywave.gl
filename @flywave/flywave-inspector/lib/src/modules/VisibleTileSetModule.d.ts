import { type MapView } from "@flywave/flywave-mapview";
import { type GUI } from "dat.gui";
export interface VisibleTileSetData {
    cacheSize: number;
    cacheCapacity: number;
    cacheUsage: number;
    resourceComputationType: string;
    totalVisibleTiles: number;
    totalRenderedTiles: number;
    totalLoadingTiles: number;
    dataSourceCount: number;
    avgTilesPerDataSource: number;
    maxTilesPerFrame: number;
    allTilesLoaded: boolean;
    tileKeyDetails: string;
    tileKeyMortonCodes: string;
    tileKeyDistribution: string;
    performanceImpact: string;
}
export declare class VisibleTileSetModule {
    private readonly mapView;
    constructor(mapView: MapView);
    setupFolder(gui: GUI): GUI;
    createData(): VisibleTileSetData;
    updateData(data: VisibleTileSetData): void;
    private updateTileKeyDetails;
    private updateTileKeyMortonCodes;
    private updateTileKeyDistribution;
    private updatePerformanceImpact;
    bindControls(folder: GUI, data: VisibleTileSetData): void;
}
