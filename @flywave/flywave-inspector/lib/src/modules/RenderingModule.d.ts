import { type MapView } from "@flywave/flywave-mapview";
import { type GUI } from "dat.gui";
export interface RenderingData {
    drawCalls: number;
    triangles: number;
    points: number;
    lines: number;
    geometries: number;
    textures: number;
}
export declare class RenderingModule {
    private readonly mapView;
    constructor(mapView: MapView);
    setupFolder(gui: GUI): GUI;
    createData(): RenderingData;
    updateData(data: RenderingData): void;
    bindControls(folder: GUI, data: RenderingData): void;
}
