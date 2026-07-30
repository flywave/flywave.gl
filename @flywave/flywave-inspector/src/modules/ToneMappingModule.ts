/* Copyright (C) 2025 flywave.gl contributors */

import { type MapView } from "@flywave/flywave-mapview";
import { type GUI } from "dat.gui";

export interface ToneMappingData {
    exposure: number;
    mode: string;
}

const TONE_MAPPING_MODES = ["linear", "reinhard", "aces", "agx", "agx-punchy", "neutral"];

export class ToneMappingModule {
    private readonly mapView: MapView;
    private readonly folder: GUI;
    private readonly currentData: ToneMappingData;
    private userInteracting = false;

    constructor(mapView: MapView, gui: GUI) {
        this.mapView = mapView;
        this.folder = gui.addFolder("🎨 Tone Mapping");
        this.folder.close();
        this.currentData = {
            exposure: this.mapView.renderer.toneMappingExposure ?? 1,
            mode: this.detectMode()
        };
        this.setupControls();
    }

    private detectMode(): string {
        const vrm = this.mapView.mapRenderingManager?.viewRenderManager;
        return vrm?.config?.toneMappingMode ?? "agx-punchy";
    }

    private setupControls(): void {
        this.folder
            .add(this.currentData, "exposure", 0, 10)
            .step(0.01)
            .name("Exposure")
            .onChange(() => this.applyChanges());
        this.folder
            .add(this.currentData, "mode", TONE_MAPPING_MODES)
            .name("Mode")
            .onChange(() => this.applyChanges());
    }

    private applyChanges(): void {
        this.userInteracting = true;
        this.mapView.sceneEnvironment.updateToneMapping(
            this.currentData.exposure,
            this.currentData.mode as any
        );
    }

    getFolder(): GUI {
        return this.folder;
    }

    update(): void {
        if (this.userInteracting) {
            this.userInteracting = false;
            return;
        }
        this.currentData.exposure =
            this.mapView.renderer.toneMappingExposure ?? this.currentData.exposure;
        this.currentData.mode = this.detectMode();
        this.folder.updateDisplay();
    }
}
