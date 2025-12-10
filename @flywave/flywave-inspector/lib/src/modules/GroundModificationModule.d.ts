import { type MapViewMonitor } from "../monitor/MapViewMonitor";
export interface GroundModificationData {
    model: "gaussian" | "exponential" | "spherical";
    sigma2: number;
    alpha: number;
    numPoints: number;
}
export declare class GroundModificationModule {
    private readonly monitor;
    private readonly mapView;
    constructor(monitor: MapViewMonitor);
    getName(): string;
    getData(): GroundModificationData;
    getDefaultData(): GroundModificationData;
    updateData(data: GroundModificationData): void;
    /**
     * Synchronize the latest values from the map to the provided data object
     * This ensures UI controls reflect the current state of the map
     */
    syncWithMap(data: GroundModificationData): void;
    /**
     * Helper method to get the terrain source from the map view
     */
    private getTerrainSource;
    /**
     * Type guard to check if a data source is a terrain source
     */
    private isTerrainSource;
}
