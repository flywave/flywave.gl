/* Copyright (C) 2025 flywave.gl contributors */

import { type MapView } from "@flywave/flywave-mapview";
import { type GUI } from "dat.gui";

import { type PostProcessingData, PostProcessingModule } from "./PostProcessingModule";

// 创建一个简单的接口来满足 PostProcessingModule 的需求
interface IMapViewMonitor {
    mapView: MapView;
}

export class PostProcessingGUIModule {
    private readonly mapView: MapView;
    private readonly postProcessingModule: PostProcessingModule;
    private readonly gui: GUI;
    private readonly folder: GUI;
    private readonly currentData: PostProcessingData;

    constructor(mapView: MapView, gui: GUI) {
        this.mapView = mapView;
        // 创建一个简单的 monitor 对象来传递给 PostProcessingModule
        const tempMonitor: IMapViewMonitor = { mapView };
        this.postProcessingModule = new PostProcessingModule(tempMonitor as any);
        this.gui = gui;
        this.currentData = this.postProcessingModule.getDefaultData();

        // Create a folder for post-processing controls
        this.folder = this.gui.addFolder("🎨 Post-Processing Effects");
        this.folder.close(); // Start closed to avoid cluttering the view

        this.setupControls();
    }

    open() {
        this.folder.open();
    }

    close() {
        this.folder.close();
    }

    private setupControls() {
        // Bloom controls
        const bloomFolder = this.folder.addFolder("🌸 Bloom Effect");
        bloomFolder
            .add(this.currentData.bloom, "enabled")
            .name("Enabled")
            .onChange(() => {
                this.updateEffects();
            });
        bloomFolder
            .add(this.currentData.bloom, "inverted")
            .name("Inverted")
            .onChange(() => {
                this.updateEffects();
            });
        bloomFolder
            .add(this.currentData.bloom, "strength", 0, 50)
            .step(0.01)
            .name("Strength")
            .onChange(() => {
                this.updateEffects();
            });
        bloomFolder
            .add(this.currentData.bloom, "radius", 0, 20)
            .step(0.01)
            .name("Radius")
            .onChange(() => {
                this.updateEffects();
            });
        bloomFolder
            .add(this.currentData.bloom, "levels", 1, 50, 1)
            .name("Levels")
            .onChange(() => {
                this.updateEffects();
            });
        bloomFolder
            .add(this.currentData.bloom, "luminancePassEnabled")
            .name("Luminance Pass")
            .onChange(() => {
                this.updateEffects();
            });
        bloomFolder
            .add(this.currentData.bloom, "luminancePassThreshold", 0, 1)
            .step(0.01)
            .name("Luminance Threshold")
            .onChange(() => {
                this.updateEffects();
            });
        bloomFolder
            .add(this.currentData.bloom, "luminancePassSmoothing", 0, 1)
            .step(0.01)
            .name("Luminance Smoothing")
            .onChange(() => {
                this.updateEffects();
            });
        bloomFolder.close();

        // Vignette controls
        const vignetteFolder = this.folder.addFolder("⭕ Vignette Effect");
        vignetteFolder
            .add(this.currentData.vignette, "enabled")
            .name("Enabled")
            .onChange(() => {
                this.updateEffects();
            });
        vignetteFolder
            .add(this.currentData.vignette, "offset", 0, 2)
            .step(0.01)
            .name("Offset")
            .onChange(() => {
                this.updateEffects();
            });
        vignetteFolder
            .add(this.currentData.vignette, "darkness", 0, 2)
            .step(0.01)
            .name("Darkness")
            .onChange(() => {
                this.updateEffects();
            });
        vignetteFolder.close();

        // Sepia controls
        const sepiaFolder = this.folder.addFolder("🌅 Sepia Effect");
        sepiaFolder
            .add(this.currentData.sepia, "enabled")
            .name("Enabled")
            .onChange(() => {
                this.updateEffects();
            });
        sepiaFolder
            .add(this.currentData.sepia, "amount", 0, 1.0)
            .step(0.01)
            .name("Amount")
            .onChange(() => {
                this.updateEffects();
            });
        sepiaFolder.close();

        // Hue/Saturation controls
        const hueSaturationFolder = this.folder.addFolder("🎨 Hue/Saturation");
        hueSaturationFolder
            .add(this.currentData.hueSaturation, "enabled")
            .name("Enabled")
            .onChange(() => {
                this.updateEffects();
            });
        hueSaturationFolder
            .add(this.currentData.hueSaturation, "hue", -1.0, 1.0)
            .step(0.01)
            .name("Hue")
            .onChange(() => {
                this.updateEffects();
            });
        hueSaturationFolder
            .add(this.currentData.hueSaturation, "saturation", -1.0, 1.0)
            .step(0.01)
            .name("Saturation")
            .onChange(() => {
                this.updateEffects();
            });
        hueSaturationFolder.close();

        // Brightness/Contrast controls
        const brightnessContrastFolder = this.folder.addFolder("🔆 Brightness/Contrast");
        brightnessContrastFolder
            .add(this.currentData.brightnessContrast, "enabled")
            .name("Enabled")
            .onChange(() => {
                this.updateEffects();
            });
        brightnessContrastFolder
            .add(this.currentData.brightnessContrast, "brightness", -1, 1)
            .step(0.01)
            .name("Brightness")
            .onChange(() => {
                this.updateEffects();
            });
        brightnessContrastFolder
            .add(this.currentData.brightnessContrast, "contrast", -1, 1)
            .step(0.01)
            .name("Contrast")
            .onChange(() => {
                this.updateEffects();
            });
        brightnessContrastFolder.close();

        // SSAO controls
        const ssaoFolder = this.folder.addFolder("🎨 SSAO Effect");
        ssaoFolder
            .add(this.currentData.ssao, "enabled")
            .name("Enabled")
            .onChange(() => {
                this.updateEffects();
            });
        ssaoFolder
            .add(this.currentData.ssao, "intensity", 0, 5)
            .step(0.01)
            .name("Intensity")
            .onChange(() => {
                this.updateEffects();
            });
        ssaoFolder
            .add(this.currentData.ssao, "radius", 0, 0.5)
            .step(0.01)
            .name("Radius")
            .onChange(() => {
                this.updateEffects();
            });
        ssaoFolder
            .add(this.currentData.ssao, "distanceThreshold", 0, 1)
            .step(0.01)
            .name("Distance Threshold")
            .onChange(() => {
                this.updateEffects();
            });
        ssaoFolder
            .add(this.currentData.ssao, "distanceFalloff", 0, 1)
            .step(0.01)
            .name("Distance Falloff")
            .onChange(() => {
                this.updateEffects();
            });
        ssaoFolder
            .add(this.currentData.ssao, "bias", 0, 1)
            .step(0.01)
            .name("Bias")
            .onChange(() => {
                this.updateEffects();
            });
        ssaoFolder
            .add(this.currentData.ssao, "samples", 1, 64, 1)
            .name("Samples")
            .onChange(() => {
                this.updateEffects();
            });
        ssaoFolder
            .add(this.currentData.ssao, "rings", 1, 16, 1)
            .name("Rings")
            .onChange(() => {
                this.updateEffects();
            });
        // 添加SSAO的其他参数
        ssaoFolder
            .add(this.currentData.ssao, "blurRadius", 0, 16, 1)
            .name("Blur Radius")
            .onChange(() => {
                this.updateEffects();
            });
        ssaoFolder
            .add(this.currentData.ssao, "blurStdDev", 0, 10)
            .step(0.01)
            .name("Blur Std Dev")
            .onChange(() => {
                this.updateEffects();
            });
        ssaoFolder
            .add(this.currentData.ssao, "blurDepthCutoff", 0, 0.1)
            .step(0.001)
            .name("Blur Depth Cutoff")
            .onChange(() => {
                this.updateEffects();
            });
        ssaoFolder.close();

        // Antialiasing controls (FXAA and SMAA)
        const antialiasingFolder = this.folder.addFolder("🔍 Antialiasing");
        antialiasingFolder
            .add(this.currentData, "fxaaEnabled")
            .name("FXAA Enabled")
            .onChange(() => {
                this.updateEffects();
            });
        antialiasingFolder
            .add(this.currentData, "smaaEnabled")
            .name("SMAA Enabled")
            .onChange(() => {
                this.updateEffects();
            });
        antialiasingFolder.close();

        // MSAA controls - 这些保持整数
        const msaaFolder = this.folder.addFolder("📐 MSAA");
        msaaFolder
            .add(this.currentData, "msaaEnabled")
            .name("Enabled")
            .onChange(() => {
                this.updateEffects();
            });
        msaaFolder
            .add(this.currentData, "dynamicMsaaSamplingLevel", 0, 8, 1)
            .name("Dynamic Level")
            .onChange(() => {
                this.updateEffects();
            });
        msaaFolder
            .add(this.currentData, "staticMsaaSamplingLevel", 0, 8, 1)
            .name("Static Level")
            .onChange(() => {
                this.updateEffects();
            });
        msaaFolder.close();
    }

    private updateEffects() {
        this.postProcessingModule.updateData(this.currentData);
    }

    getName(): string {
        return "PostProcessingGUI";
    }

    getFolder(): GUI {
        return this.folder;
    }

    update() {
        // Update the current data with the latest values from the map
        this.postProcessingModule.syncWithMap(this.currentData);

        // Force update the GUI to reflect the new values
        this.folder.updateDisplay();
    }
}
