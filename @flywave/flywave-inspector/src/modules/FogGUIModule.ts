/* Copyright (C) 2025 flywave.gl contributors */

import { type MapView } from "@flywave/flywave-mapview";
import { type GUI } from "dat.gui";

import { type FogData, FogModule } from "./FogModule";

// 创建一个简单的接口来满足 FogModule 的需求
interface IMapViewMonitor {
    mapView: MapView;
}

export class FogGUIModule {
    private readonly mapView: MapView;
    private readonly fogModule: FogModule;
    private readonly gui: GUI;
    private readonly folder: GUI;
    private readonly currentData: FogData;

    constructor(mapView: MapView, gui: GUI) {
        this.mapView = mapView;
        // 创建一个简单的 monitor 对象来传递给 FogModule
        const tempMonitor: IMapViewMonitor = { mapView };
        this.fogModule = new FogModule(tempMonitor as any);
        this.gui = gui;
        this.currentData = this.fogModule.getDefaultData();

        // Create a folder for fog controls
        this.folder = this.gui.addFolder("🌫️ Fog Effect");
        this.folder.close(); // Start closed to avoid cluttering the view

        this.setupControls();
    }

    private setupControls() {
        // Fog effect controls
        this.folder
            .add(this.currentData, "enabled")
            .name("Enabled")
            .onChange(() => {
                this.updateEffects();
            });
        this.folder
            .addColor(this.currentData, "color")
            .name("Color")
            .onChange(() => {
                this.updateEffects();
            });
        this.folder
            .add(this.currentData, "ratio", 0, 0.001, 0.00001)
            .name("Density")
            .onChange(() => {
                this.updateEffects();
            });
        this.folder
            .add(this.currentData, "range", 1000, 50000, 100)
            .name("Range")
            .onChange(() => {
                this.updateEffects();
            });
    }

    private updateEffects() {
        this.fogModule.updateData(this.currentData);
    }

    getName(): string {
        return "FogGUI";
    }

    getFolder(): GUI {
        return this.folder;
    }

    update() {
        // Update the current data with the latest values from the map
        this.fogModule.syncWithMap(this.currentData);

        // Force update the GUI to reflect the new values
        this.folder.updateDisplay();
    }
}
