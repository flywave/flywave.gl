/* Copyright (C) 2025 flywave.gl contributors */

import { type MapView } from "@flywave/flywave-mapview";
import { type GUI } from "dat.gui";

export interface ToneMappingData {
    exposure: number;
    mode: string;
}

const TONE_MAPPING_MODES = ["linear", "reinhard", "cineon", "aces", "agx", "agx-punchy", "neutral"];

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
            exposure: 1,
            mode: "agx-punchy"
        };
        this.syncFromTheme();
        this.setupControls();
    }

    private syncFromTheme(): void {
        const theme = this.mapView.getThemeSync();
        if (theme?.toneMappingExposure !== undefined)
            this.currentData.exposure = theme.toneMappingExposure;
        if (theme?.toneMappingMode !== undefined) this.currentData.mode = theme.toneMappingMode;
        this.folder.updateDisplay();
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
        this.mapView.patchTheme({
            toneMappingExposure: this.currentData.exposure,
            toneMappingMode: this.currentData.mode as any
        });
    }

    getFolder(): GUI {
        return this.folder;
    }

    update(): void {
        if (this.userInteracting) {
            this.userInteracting = false;
            return;
        }
    }
}
