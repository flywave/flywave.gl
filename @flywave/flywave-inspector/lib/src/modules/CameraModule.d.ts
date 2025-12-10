import { type MapView } from "@flywave/flywave-mapview";
import { type GUI } from "dat.gui";
export interface CameraData {
    position: string;
    target: string;
    zoom: number;
    tilt: number;
    heading: number;
    far: number;
    near: number;
}
export declare class CameraModule {
    private readonly mapView;
    constructor(mapView: MapView);
    setupFolder(gui: GUI): GUI;
    createData(): CameraData;
    updateData(data: CameraData): void;
    bindControls(folder: GUI, data: CameraData): void;
}
