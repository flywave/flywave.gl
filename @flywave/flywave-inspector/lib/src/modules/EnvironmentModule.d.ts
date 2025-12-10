import { type MapView } from "@flywave/flywave-mapview";
import { type GUI } from "dat.gui";
export interface EnvironmentData {
    theme: string;
    projection: string;
    pixelRatio: number;
    language: string;
}
export declare class EnvironmentModule {
    private readonly mapView;
    constructor(mapView: MapView);
    setupFolder(gui: GUI): GUI;
    createData(): EnvironmentData;
    updateData(data: EnvironmentData): void;
    bindControls(folder: GUI, data: EnvironmentData): void;
}
