/* Copyright (C) 2025 flywave.gl contributors */

import { type MapView } from "@flywave/flywave-mapview";
import { type GUI } from "dat.gui";

import { type FogData, FogModule } from "./FogModule";

export class FogGUIModule {
    private readonly mapView: MapView;
    private readonly fogModule: FogModule;
    private readonly gui: GUI;
    private readonly folder: GUI;
    private readonly currentData: FogData;
    private userInteracting = false;

    constructor(mapView: MapView, gui: GUI) {
        this.mapView = mapView;
        this.fogModule = new FogModule(mapView);
        this.gui = gui;
        this.currentData = this.fogModule.getDefaultData();

        this.folder = this.gui.addFolder("🌫️ Fog Effect");
        this.folder.close();

        this.setupControls();
    }

    private setupControls() {
        this.folder
            .add(this.currentData, "enabled")
            .name("Enabled")
            .onChange(() => this.updateEffects());
        this.folder
            .addColor(this.currentData, "color")
            .name("Color")
            .onChange(() => this.updateEffects());
        this.folder
            .add(this.currentData, "ratio", 0, 0.001, 0.00001)
            .name("Density")
            .onChange(() => this.updateEffects());
        this.folder
            .add(this.currentData, "range", 1000, 50000, 100)
            .name("Range")
            .onChange(() => this.updateEffects());
    }

    private updateEffects() {
        this.userInteracting = true;
        this.fogModule.updateData(this.currentData);
    }

    getName(): string {
        return "FogGUI";
    }

    getFolder(): GUI {
        return this.folder;
    }

    update() {
        if (this.userInteracting) {
            this.userInteracting = false;
            return;
        }
        this.fogModule.syncWithMap(this.currentData);
        this.folder.updateDisplay();
    }
}
