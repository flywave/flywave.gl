/* Copyright (C) 2025 flywave.gl contributors */

import { type MapView, MapViewEventNames } from "@flywave/flywave-mapview";
import { GUI } from "dat.gui";

import { type AnimationData, AnimationModule } from "../modules/AnimationModule";
import { type CameraData, CameraModule } from "../modules/CameraModule";
import { type DataSourceData, DataSourceModule } from "../modules/DataSourceModule";
import { type EnhancedTileData, EnhancedTileModule } from "../modules/EnhancedTileModule";
import { type EnvironmentData, EnvironmentModule } from "../modules/EnvironmentModule";
import { FogGUIModule } from "../modules/FogGUIModule";
import { type MemoryData, MemoryModule } from "../modules/MemoryModule";
// Module imports
import { type PerformanceData, PerformanceModule } from "../modules/PerformanceModule";
import { PostProcessingGUIModule } from "../modules/PostProcessingGUIModule";
import { type RenderingData, RenderingModule } from "../modules/RenderingModule";
import { type TextData, TextModule } from "../modules/TextModule";
import { type TileData, TileModule } from "../modules/TileModule";
import { type VisibleTileSetData, VisibleTileSetModule } from "../modules/VisibleTileSetModule";
import { GroundModificationGUIModule } from "../modules/GroundModificationGUIModule";

export class ModularMapViewMonitor {
    private readonly gui: GUI;
    private readonly mapView: MapView;

    // Modules
    private readonly performanceModule: PerformanceModule;
    private readonly cameraModule: CameraModule;
    private readonly renderingModule: RenderingModule;
    private readonly memoryModule: MemoryModule;
    private readonly tileModule: TileModule;
    private readonly enhancedTileModule: EnhancedTileModule;
    private readonly visibleTileSetModule: VisibleTileSetModule;
    private readonly dataSourceModule: DataSourceModule;
    private readonly textModule: TextModule;
    private readonly animationModule: AnimationModule;
    private readonly environmentModule: EnvironmentModule;
    private readonly postProcessingGUIModule: PostProcessingGUIModule;
    private readonly fogGUIModule: FogGUIModule;
    private readonly groundModificationGUIModule: GroundModificationGUIModule;

    // Data objects
    private readonly performanceData: PerformanceData;
    private readonly cameraData: CameraData;
    private readonly renderingData: RenderingData;
    private readonly memoryData: MemoryData;
    private readonly tileData: TileData;
    private readonly enhancedTileData: EnhancedTileData;
    private readonly visibleTileSetData: VisibleTileSetData;
    private readonly dataSourceData: DataSourceData;
    private readonly textData: TextData;
    private readonly animationData: AnimationData;
    private readonly environmentData: EnvironmentData;

    // Folders
    private readonly performanceFolder: GUI;
    private readonly cameraFolder: GUI;
    private readonly renderingFolder: GUI;
    private readonly memoryFolder: GUI;
    private readonly tileFolder: GUI;
    private readonly enhancedTileFolder: GUI;
    private readonly visibleTileSetFolder: GUI;
    private readonly dataSourceFolder: GUI;
    private readonly textFolder: GUI;
    private readonly animationFolder: GUI;
    private readonly environmentFolder: GUI;
    private readonly postProcessingFolder: GUI;
    private readonly fogFolder: GUI;
    private readonly groundModificationFolder: GUI;

    private readonly updateHandler: () => void;

    constructor(mapView: MapView, parentGui?: GUI) {
        this.mapView = mapView;

        // Create or use existing GUI
        this.gui = parentGui || new GUI({ name: "MapView Monitor", width: 300 });
        this.gui.close(); // Start closed to avoid cluttering the view

        // Initialize modules
        this.performanceModule = new PerformanceModule();
        this.cameraModule = new CameraModule(mapView);
        this.renderingModule = new RenderingModule(mapView);
        this.memoryModule = new MemoryModule();
        this.tileModule = new TileModule(mapView);
        this.enhancedTileModule = new EnhancedTileModule(mapView);
        this.visibleTileSetModule = new VisibleTileSetModule(mapView);
        this.dataSourceModule = new DataSourceModule(mapView);
        this.textModule = new TextModule(mapView);
        this.animationModule = new AnimationModule(mapView);
        this.environmentModule = new EnvironmentModule(mapView);
        this.postProcessingGUIModule = new PostProcessingGUIModule(mapView, this.gui);
        this.fogGUIModule = new FogGUIModule(mapView, this.gui);
        this.groundModificationGUIModule = new GroundModificationGUIModule(mapView, this.gui);

        // Create data objects
        this.performanceData = this.performanceModule.createData();
        this.cameraData = this.cameraModule.createData();
        this.renderingData = this.renderingModule.createData();
        this.memoryData = this.memoryModule.createData();
        this.tileData = this.tileModule.createData();
        this.enhancedTileData = this.enhancedTileModule.createData();
        this.visibleTileSetData = this.visibleTileSetModule.createData();
        this.dataSourceData = this.dataSourceModule.createData();
        this.textData = this.textModule.createData();
        this.animationData = this.animationModule.createData();
        this.environmentData = this.environmentModule.createData();

        // Setup folders
        this.performanceFolder = this.performanceModule.setupFolder(this.gui);
        this.cameraFolder = this.cameraModule.setupFolder(this.gui);
        this.renderingFolder = this.renderingModule.setupFolder(this.gui);
        this.memoryFolder = this.memoryModule.setupFolder(this.gui);
        this.tileFolder = this.tileModule.setupFolder(this.gui);
        this.enhancedTileFolder = this.enhancedTileModule.setupFolder(this.gui);
        this.visibleTileSetFolder = this.visibleTileSetModule.setupFolder(this.gui);
        this.dataSourceFolder = this.dataSourceModule.setupFolder(this.gui);
        this.textFolder = this.textModule.setupFolder(this.gui);
        this.animationFolder = this.animationModule.setupFolder(this.gui);
        this.environmentFolder = this.environmentModule.setupFolder(this.gui);
        this.postProcessingFolder = this.postProcessingGUIModule.getFolder();
        this.fogFolder = this.fogGUIModule.getFolder();
        this.groundModificationFolder = this.groundModificationGUIModule.getFolder();

        // Bind controls
        this.performanceModule.bindControls(this.performanceFolder, this.performanceData);
        this.cameraModule.bindControls(this.cameraFolder, this.cameraData);
        this.renderingModule.bindControls(this.renderingFolder, this.renderingData);
        this.memoryModule.bindControls(this.memoryFolder, this.memoryData);
        this.tileModule.bindControls(this.tileFolder, this.tileData);
        this.enhancedTileModule.bindControls(this.enhancedTileFolder, this.enhancedTileData);
        this.visibleTileSetModule.bindControls(this.visibleTileSetFolder, this.visibleTileSetData);
        this.dataSourceModule.bindControls(this.dataSourceFolder, this.dataSourceData);
        this.textModule.bindControls(this.textFolder, this.textData);
        this.animationModule.bindControls(this.animationFolder, this.animationData);
        this.environmentModule.bindControls(this.environmentFolder, this.environmentData);

        // Close all folders by default
        this.performanceFolder.close();
        this.cameraFolder.close();
        this.renderingFolder.close();
        this.memoryFolder.close();
        this.tileFolder.close();
        this.enhancedTileFolder.close();
        this.visibleTileSetFolder.close();
        this.dataSourceFolder.close();
        this.textFolder.close();
        this.animationFolder.close();
        this.environmentFolder.close();
        this.postProcessingFolder.close();
        this.fogFolder.close();
        this.groundModificationFolder.close();

        // Bind the update handler to this instance
        this.updateHandler = this.update.bind(this);

        // Start listening to MapView render events
        this.mapView.addEventListener(MapViewEventNames.AfterRender, this.updateHandler);
    }

    /**
     * Clean up resources and stop updating
     */
    dispose() {
        // Remove event listener
        this.mapView.removeEventListener(MapViewEventNames.AfterRender, this.updateHandler);

        // Remove from parent GUI if we created it
        if (this.gui.parent === undefined) {
            this.gui.destroy();
        }
    }

    /**
     * Update all monitored values
     */
    private update() {
        try {
            this.performanceModule.updateData(this.performanceData);
            this.cameraModule.updateData(this.cameraData);
            this.renderingModule.updateData(this.renderingData);
            this.memoryModule.updateData(this.memoryData);
            this.tileModule.updateData(this.tileData);
            this.enhancedTileModule.updateData(this.enhancedTileData);
            this.visibleTileSetModule.updateData(this.visibleTileSetData);
            this.dataSourceModule.updateData(this.dataSourceData);
            this.textModule.updateData(this.textData);
            this.animationModule.updateData(this.animationData);
            this.environmentModule.updateData(this.environmentData);
            this.postProcessingGUIModule.update();
            this.fogGUIModule.update();
            this.groundModificationGUIModule.update();
            // ElevationModule and FrustumCullingModule don't need continuous updates as they're interactive
        } catch (e) {
            console.warn("Error updating monitor:", e);
        }
    }

    /**
     * Get the GUI instance for custom modifications
     */
    getGUI(): GUI {
        return this.gui;
    }

    /**
     * Open the monitor panel
     */
    open() {
        this.gui.open();
    }

    /**
     * Close the monitor panel
     */
    close() {
        this.gui.close();
    }

    // Module-specific getters for customization
    getPerformanceFolder(): GUI {
        return this.performanceFolder;
    }

    getCameraFolder(): GUI {
        return this.cameraFolder;
    }

    getRenderingFolder(): GUI {
        return this.renderingFolder;
    }

    getMemoryFolder(): GUI {
        return this.memoryFolder;
    }

    getTileFolder(): GUI {
        return this.tileFolder;
    }

    getEnhancedTileFolder(): GUI {
        return this.enhancedTileFolder;
    }

    getVisibleTileSetFolder(): GUI {
        return this.visibleTileSetFolder;
    }

    getDataSourceFolder(): GUI {
        return this.dataSourceFolder;
    }

    getTextFolder(): GUI {
        return this.textFolder;
    }

    getAnimationFolder(): GUI {
        return this.animationFolder;
    }

    getEnvironmentFolder(): GUI {
        return this.environmentFolder;
    }

    getPostProcessingFolder(): GUI {
        return this.postProcessingFolder;
    }

    getFogFolder(): GUI {
        return this.fogFolder;
    }

    getGroundModificationFolder(): GUI {
        return this.groundModificationFolder;
    }
}
