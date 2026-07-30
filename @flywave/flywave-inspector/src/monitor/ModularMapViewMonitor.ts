/* Copyright (C) 2025 flywave.gl contributors */

import { type MapView, MapViewEventNames } from "@flywave/flywave-mapview";
import { GUI } from "dat.gui";

import { AnimationModule, type AnimationData } from "../modules/AnimationModule";
import { AtmosphereModule } from "../modules/AtmosphereModule";
import { CameraModule, type CameraData } from "../modules/CameraModule";
import { DataSourceModule, type DataSourceData } from "../modules/DataSourceModule";
import { EnhancedTileModule, type EnhancedTileData } from "../modules/EnhancedTileModule";
import { EnvironmentModule, type EnvironmentData } from "../modules/EnvironmentModule";
import { FogGUIModule } from "../modules/FogGUIModule";
import { MemoryModule, type MemoryData } from "../modules/MemoryModule";
import { PerformanceModule, type PerformanceData } from "../modules/PerformanceModule";
import { PostProcessingGUIModule } from "../modules/PostProcessingGUIModule";
import { RenderingModule, type RenderingData } from "../modules/RenderingModule";
import { TextModule, type TextData } from "../modules/TextModule";
import { TileModule, type TileData } from "../modules/TileModule";
import { ToneMappingModule } from "../modules/ToneMappingModule";
import { VisibleTileSetModule, type VisibleTileSetData } from "../modules/VisibleTileSetModule";

export class ModularMapViewMonitor {
    private readonly gui: GUI;
    private readonly mapView: MapView;

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
    private readonly atmosphereModule: AtmosphereModule;
    private readonly toneMappingModule: ToneMappingModule;
    private readonly postProcessingGUIModule: PostProcessingGUIModule;
    private readonly fogGUIModule: FogGUIModule;

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
    private readonly atmosphereFolder: GUI;
    private readonly toneMappingFolder: GUI;
    private readonly postProcessingFolder: GUI;
    private readonly fogFolder: GUI;

    private readonly updateHandler: () => void;

    constructor(mapView: MapView, parentGui?: GUI) {
        this.mapView = mapView;

        this.gui = parentGui || new GUI({ name: "MapView Monitor", width: 300 });
        this.gui.close();

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
        this.atmosphereModule = new AtmosphereModule(mapView, this.gui);
        this.toneMappingModule = new ToneMappingModule(mapView, this.gui);
        this.postProcessingGUIModule = new PostProcessingGUIModule(mapView, this.gui);
        this.fogGUIModule = new FogGUIModule(mapView, this.gui);

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
        this.atmosphereFolder = this.atmosphereModule.getFolder();
        this.toneMappingFolder = this.toneMappingModule.getFolder();
        this.postProcessingFolder = this.postProcessingGUIModule.getFolder();
        this.fogFolder = this.fogGUIModule.getFolder();

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

        for (const f of [
            this.performanceFolder,
            this.cameraFolder,
            this.renderingFolder,
            this.memoryFolder,
            this.tileFolder,
            this.enhancedTileFolder,
            this.visibleTileSetFolder,
            this.dataSourceFolder,
            this.textFolder,
            this.animationFolder,
            this.environmentFolder,
            this.atmosphereFolder,
            this.toneMappingFolder,
            this.postProcessingFolder,
            this.fogFolder
        ]) {
            f.close();
        }

        this.updateHandler = this.update.bind(this);
        this.mapView.addEventListener(MapViewEventNames.AfterRender, this.updateHandler);
    }

    dispose() {
        this.mapView.removeEventListener(MapViewEventNames.AfterRender, this.updateHandler);
        if (this.gui.parent === undefined) {
            this.gui.destroy();
        }
    }

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
            this.atmosphereModule.update();
            this.toneMappingModule.update();
            this.postProcessingGUIModule.update();
            this.fogGUIModule.update();
        } catch (e) {
            console.warn("Error updating monitor:", e);
        }
    }

    getGUI(): GUI {
        return this.gui;
    }

    open() {
        this.gui.open();
    }

    close() {
        this.gui.close();
    }

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
    getAtmosphereFolder(): GUI {
        return this.atmosphereFolder;
    }
    getToneMappingFolder(): GUI {
        return this.toneMappingFolder;
    }
    getPostProcessingFolder(): GUI {
        return this.postProcessingFolder;
    }
    getFogFolder(): GUI {
        return this.fogFolder;
    }
}
