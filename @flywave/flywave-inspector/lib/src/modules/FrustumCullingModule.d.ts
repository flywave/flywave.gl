import { type MapView, type ElevationProvider, type ElevationRangeSource } from "@flywave/flywave-mapview";
import { GUI } from "dat.gui";
/**
 * Frustum culling debugging module for flywave inspector
 * Provides tools to test frustum culling with elevation data
 */
export declare class FrustumCullingModule {
    private readonly gui;
    private readonly mapView;
    private readonly frustumFolder;
    private readonly elevationProvider;
    private readonly elevationRangeSource;
    constructor(mapView: MapView, parentGui: GUI, elevationProvider: ElevationProvider, elevationRangeSource: ElevationRangeSource);
    /**
     * Set up frustum culling debugging tools
     */
    private setupFrustumCullingDebugging;
    /**
     * Display results in a modal with copy functionality
     */
    private displayResults;
    /**
     * Clean up resources
     */
    dispose(): void;
    /**
     * Get the GUI instance
     */
    getGUI(): GUI;
}
