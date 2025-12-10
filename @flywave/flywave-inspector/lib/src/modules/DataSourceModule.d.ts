import { type MapView } from "@flywave/flywave-mapview";
import { type GUI } from "dat.gui";
export interface DataSourceData {
    count: number;
    enabled: number;
    names: string;
}
export declare class DataSourceModule {
    private readonly mapView;
    constructor(mapView: MapView);
    setupFolder(gui: GUI): GUI;
    createData(): DataSourceData;
    updateData(data: DataSourceData): void;
    bindControls(folder: GUI, data: DataSourceData): void;
}
