import { type MapView } from "@flywave/flywave-mapview";
import { type GUI } from "dat.gui";
export interface TileData {
    renderedTiles: number;
    visibleTiles: number;
    loadingTiles: number;
    cacheSize: number;
    maxCacheSize: number;
}
export declare class TileModule {
    private readonly mapView;
    private readonly stats;
    constructor(mapView: MapView);
    setupFolder(gui: GUI): GUI;
    createData(): TileData;
    updateData(data: TileData): void;
    bindControls(folder: GUI, data: TileData): void;
}
