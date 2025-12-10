import { type MapView } from "@flywave/flywave-mapview";
import { type GUI } from "dat.gui";
export interface AnimationData {
    animating: boolean;
    animationCount: number;
    frameNumber: number;
}
export declare class AnimationModule {
    private readonly mapView;
    constructor(mapView: MapView);
    setupFolder(gui: GUI): GUI;
    createData(): AnimationData;
    updateData(data: AnimationData): void;
    bindControls(folder: GUI, data: AnimationData): void;
}
