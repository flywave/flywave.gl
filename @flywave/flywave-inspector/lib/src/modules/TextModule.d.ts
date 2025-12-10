import { type MapView } from "@flywave/flywave-mapview";
import { type GUI } from "dat.gui";
export interface TextData {
    renderedTextElements: number;
    totalTextElements: number;
    fontCatalogs: number;
    loadingTextElements: number;
}
export declare class TextModule {
    private readonly mapView;
    constructor(mapView: MapView);
    setupFolder(gui: GUI): GUI;
    createData(): TextData;
    updateData(data: TextData): void;
    bindControls(folder: GUI, data: TextData): void;
}
