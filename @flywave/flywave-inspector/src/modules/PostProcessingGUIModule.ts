/* Copyright (C) 2025 flywave.gl contributors */

import { type MapView } from "@flywave/flywave-mapview";
import { type GUI } from "dat.gui";

import { type PostProcessingData, PostProcessingModule } from "./PostProcessingModule";

export class PostProcessingGUIModule {
    private readonly mapView: MapView;
    private readonly postProcessingModule: PostProcessingModule;
    private readonly gui: GUI;
    private readonly folder: GUI;
    private readonly currentData: PostProcessingData;
    private userInteracting = false;

    constructor(mapView: MapView, gui: GUI) {
        this.mapView = mapView;
        this.postProcessingModule = new PostProcessingModule(mapView);
        this.gui = gui;
        this.currentData = this.postProcessingModule.getDefaultData();

        this.folder = this.gui.addFolder("Post-Processing Effects");
        this.folder.close();

        this.setupControls();
    }

    open() {
        this.folder.open();
    }

    close() {
        this.folder.close();
    }

    private setupControls() {
        const bloomFolder = this.folder.addFolder("Bloom Effect");
        bloomFolder
            .add(this.currentData.bloom, "enabled")
            .name("Enabled")
            .onChange(() => this.updateEffects());
        bloomFolder
            .add(this.currentData.bloom, "strength", 0, 50)
            .step(0.01)
            .name("Strength")
            .onChange(() => this.updateEffects());
        bloomFolder
            .add(this.currentData.bloom, "radius", 0, 20)
            .step(0.01)
            .name("Radius")
            .onChange(() => this.updateEffects());
        bloomFolder
            .add(this.currentData.bloom, "luminancePassThreshold", 0, 1)
            .step(0.01)
            .name("Luminance Threshold")
            .onChange(() => this.updateEffects());
        bloomFolder.close();

        const vignetteFolder = this.folder.addFolder("Vignette Effect");
        vignetteFolder
            .add(this.currentData.vignette, "enabled")
            .name("Enabled")
            .onChange(() => this.updateEffects());
        vignetteFolder
            .add(this.currentData.vignette, "offset", 0, 2)
            .step(0.01)
            .name("Offset")
            .onChange(() => this.updateEffects());
        vignetteFolder
            .add(this.currentData.vignette, "darkness", 0, 2)
            .step(0.01)
            .name("Darkness")
            .onChange(() => this.updateEffects());
        vignetteFolder.close();

        const sepiaFolder = this.folder.addFolder("Sepia Effect");
        sepiaFolder
            .add(this.currentData.sepia, "enabled")
            .name("Enabled")
            .onChange(() => this.updateEffects());
        sepiaFolder
            .add(this.currentData.sepia, "amount", 0, 1.0)
            .step(0.01)
            .name("Amount")
            .onChange(() => this.updateEffects());
        sepiaFolder.close();

        const hueSaturationFolder = this.folder.addFolder("Hue/Saturation");
        hueSaturationFolder
            .add(this.currentData.hueSaturation, "enabled")
            .name("Enabled")
            .onChange(() => this.updateEffects());
        hueSaturationFolder
            .add(this.currentData.hueSaturation, "hue", -1.0, 1.0)
            .step(0.01)
            .name("Hue")
            .onChange(() => this.updateEffects());
        hueSaturationFolder
            .add(this.currentData.hueSaturation, "saturation", -1.0, 1.0)
            .step(0.01)
            .name("Saturation")
            .onChange(() => this.updateEffects());
        hueSaturationFolder.close();

        const brightnessContrastFolder = this.folder.addFolder("Brightness/Contrast");
        brightnessContrastFolder
            .add(this.currentData.brightnessContrast, "enabled")
            .name("Enabled")
            .onChange(() => this.updateEffects());
        brightnessContrastFolder
            .add(this.currentData.brightnessContrast, "brightness", -1, 1)
            .step(0.01)
            .name("Brightness")
            .onChange(() => this.updateEffects());
        brightnessContrastFolder
            .add(this.currentData.brightnessContrast, "contrast", -1, 1)
            .step(0.01)
            .name("Contrast")
            .onChange(() => this.updateEffects());
        brightnessContrastFolder.close();

        const antialiasingFolder = this.folder.addFolder("Antialiasing");
        antialiasingFolder
            .add(this.currentData, "taaEnabled")
            .name("TAA Enabled")
            .onChange(() => this.updateEffects());
        antialiasingFolder.close();

        const msaaFolder = this.folder.addFolder("MSAA");
        msaaFolder
            .add(this.currentData, "msaaEnabled")
            .name("Enabled")
            .onChange(() => this.updateEffects());
        msaaFolder
            .add(this.currentData, "dynamicMsaaSamplingLevel", 0, 8, 1)
            .name("Dynamic Level")
            .onChange(() => this.updateEffects());
        msaaFolder
            .add(this.currentData, "staticMsaaSamplingLevel", 0, 8, 1)
            .name("Static Level")
            .onChange(() => this.updateEffects());
        msaaFolder.close();
    }

    private updateEffects() {
        this.userInteracting = true;
        this.postProcessingModule.updateData(this.currentData);
    }

    getName(): string {
        return "PostProcessingGUI";
    }

    getFolder(): GUI {
        return this.folder;
    }

    update() {
        if (this.userInteracting) {
            this.userInteracting = false;
            return;
        }
        this.postProcessingModule.syncWithMap(this.currentData);
        this.folder.updateDisplay();
    }
}
