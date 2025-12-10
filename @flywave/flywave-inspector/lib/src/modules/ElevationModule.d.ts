import { type MapView, type ElevationProvider, type ElevationRangeSource } from "@flywave/flywave-mapview";
import { GUI } from "dat.gui";
/**
 * Elevation debugging module for flywave inspector
 * Provides tools to debug elevation provider and elevation range source
 */
export declare class ElevationModule {
    private readonly elevationProvider;
    private readonly elevationRangeSource;
    private readonly gui;
    private readonly mapView;
    private readonly elevationFolder;
    private readonly rangeFolder;
    constructor(mapView: MapView, parentGui: GUI, elevationProvider: ElevationProvider, elevationRangeSource: ElevationRangeSource);
    /**
     * Set up elevation provider debugging tools
     */
    private setupElevationProviderDebugging;
    /**
     * Set up elevation range source debugging tools
     */
    private setupElevationRangeSourceDebugging;
    /**
     * Clean up resources
     */
    dispose(): void;
    /**
     * Get the GUI instance
     */
    getGUI(): GUI;
}
