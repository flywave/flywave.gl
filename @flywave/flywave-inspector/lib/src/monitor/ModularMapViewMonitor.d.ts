import { type MapView } from "@flywave/flywave-mapview";
import { GUI } from "dat.gui";
export declare class ModularMapViewMonitor {
    private readonly gui;
    private readonly mapView;
    private readonly performanceModule;
    private readonly cameraModule;
    private readonly renderingModule;
    private readonly memoryModule;
    private readonly tileModule;
    private readonly enhancedTileModule;
    private readonly visibleTileSetModule;
    private readonly dataSourceModule;
    private readonly textModule;
    private readonly animationModule;
    private readonly environmentModule;
    private readonly postProcessingGUIModule;
    private readonly fogGUIModule;
    private readonly groundModificationGUIModule;
    private readonly performanceData;
    private readonly cameraData;
    private readonly renderingData;
    private readonly memoryData;
    private readonly tileData;
    private readonly enhancedTileData;
    private readonly visibleTileSetData;
    private readonly dataSourceData;
    private readonly textData;
    private readonly animationData;
    private readonly environmentData;
    private readonly performanceFolder;
    private readonly cameraFolder;
    private readonly renderingFolder;
    private readonly memoryFolder;
    private readonly tileFolder;
    private readonly enhancedTileFolder;
    private readonly visibleTileSetFolder;
    private readonly dataSourceFolder;
    private readonly textFolder;
    private readonly animationFolder;
    private readonly environmentFolder;
    private readonly postProcessingFolder;
    private readonly fogFolder;
    private readonly groundModificationFolder;
    private readonly updateHandler;
    constructor(mapView: MapView, parentGui?: GUI);
    /**
     * Clean up resources and stop updating
     */
    dispose(): void;
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
    getPerformanceFolder(): GUI;
    getCameraFolder(): GUI;
    getRenderingFolder(): GUI;
    getMemoryFolder(): GUI;
    getTileFolder(): GUI;
    getEnhancedTileFolder(): GUI;
    getVisibleTileSetFolder(): GUI;
    getDataSourceFolder(): GUI;
    getTextFolder(): GUI;
    getAnimationFolder(): GUI;
    getEnvironmentFolder(): GUI;
    getPostProcessingFolder(): GUI;
    getFogFolder(): GUI;
    getGroundModificationFolder(): GUI;
}
