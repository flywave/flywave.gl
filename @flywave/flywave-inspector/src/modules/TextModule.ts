/* Copyright (C) 2025 flywave.gl contributors */

import { type MapView } from "@flywave/flywave-mapview";
import { type GUI } from "dat.gui";

export interface TextData {
    renderedTextElements: number;
    totalTextElements: number;
    fontCatalogs: number;
    loadingTextElements: number;
}

export class TextModule {
    private readonly mapView: MapView;

    constructor(mapView: MapView) {
        this.mapView = mapView;
    }

    setupFolder(gui: GUI): GUI {
        return gui.addFolder("🔤 Text");
    }

    createData(): TextData {
        return {
            renderedTextElements: 0,
            totalTextElements: 0,
            fontCatalogs: 0,
            loadingTextElements: 0
        };
    }

    updateData(data: TextData): void {
        const textRenderer = this.mapView.textElementsRenderer;
        if (textRenderer) {
            // These are approximations since the actual properties might be different
            data.renderedTextElements = (textRenderer as any).renderedElementsCount || 0;
            data.totalTextElements = (textRenderer as any).totalElementsCount || 0;
            data.fontCatalogs = (textRenderer as any).fontCatalogsCount || 0;
            data.loadingTextElements = (textRenderer as any).loadingElementsCount || 0;
        }
    }

    bindControls(folder: GUI, data: TextData): void {
        folder.add(data, "renderedTextElements").name("Rendered Elements").listen();
        folder.add(data, "totalTextElements").name("Total Elements").listen();
        folder.add(data, "fontCatalogs").name("Font Catalogs").listen();
        folder.add(data, "loadingTextElements").name("Loading Elements").listen();
    }
}
