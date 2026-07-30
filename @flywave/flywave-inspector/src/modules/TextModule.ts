/* Copyright (C) 2025 flywave.gl contributors */

import { type MapView } from "@flywave/flywave-mapview";
import { type GUI } from "dat.gui";

export interface TextData {
    textCanvases: number;
    loading: boolean;
    updatePending: boolean;
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
            textCanvases: 0,
            loading: false,
            updatePending: false
        };
    }

    updateData(data: TextData): void {
        const textRenderer = this.mapView.textElementsRenderer;
        if (textRenderer) {
            data.textCanvases = (textRenderer as any).m_textCanvases?.size ?? 0;
            data.loading = textRenderer.loading;
            data.updatePending = textRenderer.isUpdatePending;
        }
    }

    bindControls(folder: GUI, data: TextData): void {
        folder.add(data, "textCanvases").name("Text Canvases").listen();
        folder.add(data, "loading").name("Loading").listen();
        folder.add(data, "updatePending").name("Update Pending").listen();
    }
}
