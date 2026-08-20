/* Copyright (C) 2025 flywave.gl contributors */

import { type MapView } from "@flywave/flywave-mapview";
import { type GUI } from "dat.gui";

export interface AtmosphereData {
    enabled: boolean;
    sunTime: number;
    cloudsEnabled: boolean;
    cloudCoverage: number;
    cloudQuality: string;
    cloudPowderScale: number;
    cloudScatteringCoefficient: number;
    aerialPerspectiveEnabled: boolean;
}

const QUALITY_OPTIONS = ["low", "medium", "high", "ultra"];

export class AtmosphereModule {
    private readonly mapView: MapView;
    private readonly folder: GUI;
    private readonly currentData: AtmosphereData;
    private userInteracting = false;

    constructor(mapView: MapView, gui: GUI) {
        this.mapView = mapView;
        this.folder = gui.addFolder("🌤️ Atmosphere & Clouds");
        this.folder.close();
        this.currentData = this.createDefaultData();
        // Theme loads asynchronously; getThemeSync() throws "Style is not done
        // loading" until it completes (MapViewThemeManager contract). Sync now
        // when possible, otherwise once after ready — the throw must not abort
        // the caller's (examples') remaining initialization sequence.
        try {
            this.syncFromTheme();
        } catch {
            mapView.ready.then(() => this.syncFromTheme()).catch(() => {});
        }
        this.setupControls();
    }

    private createDefaultData(): AtmosphereData {
        return {
            enabled: true,
            sunTime: Date.now(),
            cloudsEnabled: false,
            cloudCoverage: 0.5,
            cloudQuality: "high",
            cloudPowderScale: 0.8,
            cloudScatteringCoefficient: 0.2,
            aerialPerspectiveEnabled: true
        };
    }

    private syncFromTheme(): void {
        const atmo = this.mapView.getThemeSync()?.atmosphere;
        if (!atmo) return;
        if (atmo.enabled !== undefined) this.currentData.enabled = atmo.enabled;
        if (atmo.sunTime !== undefined) this.currentData.sunTime = atmo.sunTime;
        if (typeof atmo.clouds === "boolean") {
            this.currentData.cloudsEnabled = atmo.clouds;
        } else if (typeof atmo.clouds === "object") {
            this.currentData.cloudsEnabled = true;
            if (atmo.clouds.coverage !== undefined)
                this.currentData.cloudCoverage = atmo.clouds.coverage;
            if (atmo.clouds.quality !== undefined)
                this.currentData.cloudQuality = atmo.clouds.quality;
            if (atmo.clouds.powderScale !== undefined)
                this.currentData.cloudPowderScale = atmo.clouds.powderScale;
            if (atmo.clouds.scatteringCoefficient !== undefined)
                this.currentData.cloudScatteringCoefficient = atmo.clouds.scatteringCoefficient;
        }
        if (typeof atmo.aerialPerspective === "boolean") {
            this.currentData.aerialPerspectiveEnabled = atmo.aerialPerspective;
        } else if (typeof atmo.aerialPerspective === "object") {
            this.currentData.aerialPerspectiveEnabled = true;
        }
    }

    private setupControls(): void {
        this.folder
            .add(this.currentData, "enabled")
            .name("Enabled")
            .onChange(() => this.applyChanges());

        const sunTimeController = this.folder
            .add(this.currentData, "sunTime")
            .name("Sun Time")
            .onChange(() => this.applyChanges());
        const dateButton = {
            now: () => {
                this.currentData.sunTime = Date.now();
                sunTimeController.updateDisplay();
                this.applyChanges();
            }
        };
        this.folder.add(dateButton, "now").name("Set to Now");

        const cloudFolder = this.folder.addFolder("Clouds");
        cloudFolder
            .add(this.currentData, "cloudsEnabled")
            .name("Enabled")
            .onChange(() => this.applyChanges());
        cloudFolder
            .add(this.currentData, "cloudCoverage", 0, 1)
            .step(0.01)
            .name("Coverage")
            .onChange(() => this.applyChanges());
        cloudFolder
            .add(this.currentData, "cloudQuality", QUALITY_OPTIONS)
            .name("Quality")
            .onChange(() => this.applyChanges());
        cloudFolder
            .add(this.currentData, "cloudPowderScale", 0, 5)
            .step(0.01)
            .name("Powder Scale")
            .onChange(() => this.applyChanges());
        cloudFolder
            .add(this.currentData, "cloudScatteringCoefficient", 0, 2)
            .step(0.001)
            .name("Scattering Coeff")
            .onChange(() => this.applyChanges());
        cloudFolder.close();

        this.folder
            .add(this.currentData, "aerialPerspectiveEnabled")
            .name("Aerial Perspective")
            .onChange(() => this.applyChanges());
    }

    private applyChanges(): void {
        this.userInteracting = true;
        this.mapView.patchTheme({
            atmosphere: {
                enabled: this.currentData.enabled,
                sunTime: this.currentData.sunTime,
                clouds: this.currentData.cloudsEnabled
                    ? {
                          coverage: this.currentData.cloudCoverage,
                          quality: this.currentData.cloudQuality as any,
                          powderScale: this.currentData.cloudPowderScale,
                          scatteringCoefficient: this.currentData.cloudScatteringCoefficient
                      }
                    : false,
                aerialPerspective: this.currentData.aerialPerspectiveEnabled
            }
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
        this.syncFromTheme();
        this.folder.updateDisplay();
    }
}
