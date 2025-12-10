import { type MapViewMonitor } from "../monitor/MapViewMonitor";
export interface FogData {
    enabled: boolean;
    color: string;
    ratio: number;
    range: number;
}
export declare class FogModule {
    private readonly monitor;
    private readonly mapView;
    constructor(monitor: MapViewMonitor);
    getName(): string;
    getData(): FogData;
    getDefaultData(): FogData;
    updateData(data: FogData): void;
    /**
     * Synchronize the latest values from the map to the provided data object
     * This ensures UI controls reflect the current state of the map
     */
    syncWithMap(data: FogData): void;
}
