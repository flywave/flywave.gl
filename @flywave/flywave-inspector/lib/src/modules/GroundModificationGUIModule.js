/* Copyright (C) 2025 flywave.gl contributors */
import { GroundModificationModule } from "./GroundModificationModule";
export class GroundModificationGUIModule {
    constructor(mapView, gui) {
        this.mapView = mapView;
        // 创建一个简单的 monitor 对象来传递给 GroundModificationModule
        const tempMonitor = { mapView };
        this.groundModificationModule = new GroundModificationModule(tempMonitor);
        this.gui = gui;
        this.currentData = this.groundModificationModule.getDefaultData();
        // Create a folder for ground modification controls
        this.folder = this.gui.addFolder("⛰️ Ground Modification");
        this.folder.close(); // Start closed to avoid cluttering the view
        this.setupControls();
    }
    setupControls() {
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
    updateEffects() {
        this.groundModificationModule.updateData(this.currentData);
    }
    getName() {
        return "GroundModificationGUI";
    }
    getFolder() {
        return this.folder;
    }
    update() {
        // Update the current data with the latest values from the map
        this.groundModificationModule.syncWithMap(this.currentData);
        // Force update the GUI to reflect the new values
        this.folder.updateDisplay();
    }
}
//# sourceMappingURL=GroundModificationGUIModule.js.map