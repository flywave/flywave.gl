import { type MapView } from "@flywave/flywave-mapview";
import { GUI } from "dat.gui";
/**
 * MapView monitoring panel using dat.GUI to display runtime metrics and performance information.
 */
export declare class MapViewMonitor {
    private readonly gui;
    private readonly folders;
    private readonly monitoredValues;
    private readonly updateCallbacks;
    private readonly mapView;
    private readonly stats;
    private readonly updateHandler;
    constructor(mapView: MapView, parentGui?: GUI);
    /**
     * Clean up resources and stop updating
     */
    dispose(): void;
    /**
     * Set up the main folder structure
     */
    private setupFolders;
    /**
     * Set up performance monitoring section
     */
    private setupPerformanceMonitoring;
    /**
     * Set up camera information section
     */
    private setupCameraInfo;
    /**
     * Set up rendering information section
     */
    private setupRenderingInfo;
    /**
     * Set up memory information section
     */
    private setupMemoryInfo;
    /**
     * Set up tile information section
     */
    private setupTileInfo;
    /**
     * Set up data source information section
     */
    private setupDataSourceInfo;
    /**
     * Set up text information section
     */
    private setupTextInfo;
    /**
     * Set up animation information section
     */
    private setupAnimationInfo;
    /**
     * Set up environment information section
     */
    private setupEnvironmentInfo;
    /**
     * Update all monitored values
     */
    private update;
    /**
     * Get the GUI instance for custom modifications
     */
    getGUI(): GUI;
    /**
     * Open the monitor panel
     */
    open(): void;
    /**
     * Close the monitor panel
     */
    close(): void;
    /**
     * Get a specific folder by name
     */
    getFolder(name: string): GUI | undefined;
}
