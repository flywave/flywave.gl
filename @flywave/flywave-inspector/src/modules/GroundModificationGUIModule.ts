/* Copyright (C) 2025 flywave.gl contributors */

import { type MapView } from "@flywave/flywave-mapview";
import { type GUI } from "dat.gui";

import { type GroundModificationData, GroundModificationModule } from "./GroundModificationModule";

// 创建一个简单的接口来满足 GroundModificationModule 的需求
interface IMapViewMonitor {
    mapView: MapView;
}

export class GroundModificationGUIModule {
    private readonly mapView: MapView;
    private readonly groundModificationModule: GroundModificationModule;
    private readonly gui: GUI;
    private readonly folder: GUI;
    private readonly currentData: GroundModificationData;

    constructor(mapView: MapView, gui: GUI) {
        this.mapView = mapView;
        // 创建一个简单的 monitor 对象来传递给 GroundModificationModule
        const tempMonitor: IMapViewMonitor = { mapView };
        this.groundModificationModule = new GroundModificationModule(tempMonitor as any);
        this.gui = gui;
        this.currentData = this.groundModificationModule.getDefaultData();

        // Create a folder for ground modification controls
        this.folder = this.gui.addFolder("⛰️ Ground Modification");
        this.folder.close(); // Start closed to avoid cluttering the view

        this.setupControls();
    }

    private setupControls() {
        // Kriging interpolation model
        this.folder
            .add(this.currentData, "model", ["gaussian", "exponential", "spherical"])
            .name("Model")
            .onChange(() => {
                this.updateEffects();
            });
            
        // Variance parameter (sigma squared)
        this.folder
            .add(this.currentData, "sigma2", 0.1, 100, 0.1)
            .name("Variance (σ²)")
            .onChange(() => {
                this.updateEffects();
            });
            
        // Smoothing parameter (alpha)
        this.folder
            .add(this.currentData, "alpha", 0.001, 1, 0.001)
            .name("Smoothing (α)")
            .onChange(() => {
                this.updateEffects();
            });
            
        // Number of interpolation points
        this.folder
            .add(this.currentData, "numPoints", 10, 500, 1)
            .name("Points")
            .onChange(() => {
                this.updateEffects();
            });
    }

    private updateEffects() {
        this.groundModificationModule.updateData(this.currentData);
    }

    getName(): string {
        return "GroundModificationGUI";
    }

    getFolder(): GUI {
        return this.folder;
    }

    update() {
        // Update the current data with the latest values from the map
        this.groundModificationModule.syncWithMap(this.currentData);

        // Force update the GUI to reflect the new values
        this.folder.updateDisplay();
    }
}