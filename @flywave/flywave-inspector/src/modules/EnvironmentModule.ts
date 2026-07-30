/* Copyright (C) 2025 flywave.gl contributors */

import { type MapView } from "@flywave/flywave-mapview";
import { type GUI } from "dat.gui";

export interface EnvironmentData {
    themeUrl: string;
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
            themeUrl: "default",
            projection: "unknown",
            pixelRatio: 1,
            language: "en"
        };
    }

    updateData(data: EnvironmentData): void {
        const theme = this.mapView.theme;
        data.themeUrl = theme?.url ?? "default";

        data.projection = this.mapView.projection.constructor.name;

        data.pixelRatio = this.mapView.pixelRatio || 1;

        const languages = this.mapView.languages;
        if (languages && Array.isArray(languages) && languages.length > 0) {
            data.language = languages[0];
        } else {
            data.language = "en";
        }
    }

    bindControls(folder: GUI, data: EnvironmentData): void {
        folder.add(data, "themeUrl").name("Theme").listen();
        folder.add(data, "projection").name("Projection").listen();
        folder.add(data, "pixelRatio").name("Pixel Ratio").listen();
        folder.add(data, "language").name("Language").listen();
    }
}
