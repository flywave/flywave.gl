import { type GUI } from "dat.gui";
export interface PerformanceData {
    currentFps: number;
    avgFps: number;
    minFps: number;
    maxFps: number;
    frameTime: number;
}
export declare class PerformanceModule {
    private readonly stats;
    constructor();
    setupFolder(gui: GUI): GUI;
    createData(): PerformanceData;
    updateData(data: PerformanceData): void;
    bindControls(folder: GUI, data: PerformanceData): void;
}
