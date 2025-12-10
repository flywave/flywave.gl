import { type GUI } from "dat.gui";
export interface MemoryData {
    jsHeapSizeLimit: number;
    totalJSHeapSize: number;
    usedJSHeapSize: number;
    memoryUsage: number;
}
export declare class MemoryModule {
    setupFolder(gui: GUI): GUI;
    createData(): MemoryData;
    updateData(data: MemoryData): void;
    bindControls(folder: GUI, data: MemoryData): void;
}
