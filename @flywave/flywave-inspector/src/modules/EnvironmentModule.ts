/* Copyright (C) 2025 flywave.gl contributors */

import { type MapView } from "@flywave/flywave-mapview";
import { type GUI } from "dat.gui";

export interface EnvironmentData {
    theme: string;
    projection: string;
    pixelRatio: number;
    language: string;
}

export class EnvironmentModule {
    private readonly mapView: MapView;

    constructor(mapView: MapView) {
        this.mapView = mapView;
    }

    setupFolder(gui: GUI): GUI {
        return gui.addFolder("🌍 Environment");
    }

    createData(): EnvironmentData {
        return {
            theme: "default",
            projection: "mercator",
            pixelRatio: 1,
            language: "en"
        };
    }

    updateData(data: EnvironmentData): void {
        // Theme
        const theme = this.mapView.theme;
        if (theme && typeof theme === "object" && (theme as any).name) {
            data.theme = (theme as any).name;
        } else {
            data.theme = "default";
        }

        // Projection
        const projection = this.mapView.projection;
        if (projection && typeof projection === "object" && (projection as any).name) {
            data.projection = (projection as any).name;
        } else {
            data.projection = "mercator";
        }

        // Pixel ratio
        data.pixelRatio = this.mapView.pixelRatio || 1;

        // Language
        const languages = this.mapView.languages;
        if (languages && Array.isArray(languages) && languages.length > 0) {
            data.language = languages[0];
        } else {
            data.language = "en";
        }
    }

    bindControls(folder: GUI, data: EnvironmentData): void {
        folder.add(data, "theme").name("Theme").listen();
        folder.add(data, "projection").name("Projection").listen();
        folder.add(data, "pixelRatio").name("Pixel Ratio").listen();
        folder.add(data, "language").name("Language").listen();
    }
}
