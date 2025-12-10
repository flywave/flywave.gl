/* Copyright (C) 2025 flywave.gl contributors */
export class TextModule {
    constructor(mapView) {
        this.mapView = mapView;
    }
    setupFolder(gui) {
        return gui.addFolder("🔤 Text");
    }
    createData() {
        return {
            renderedTextElements: 0,
            totalTextElements: 0,
            fontCatalogs: 0,
            loadingTextElements: 0
        };
    }
    updateData(data) {
        const textRenderer = this.mapView.textElementsRenderer;
        if (textRenderer) {
            // These are approximations since the actual properties might be different
            data.renderedTextElements = textRenderer.renderedElementsCount || 0;
            data.totalTextElements = textRenderer.totalElementsCount || 0;
            data.fontCatalogs = textRenderer.fontCatalogsCount || 0;
            data.loadingTextElements = textRenderer.loadingElementsCount || 0;
        }
    }
    bindControls(folder, data) {
        folder.add(data, "renderedTextElements").name("Rendered Elements").listen();
        folder.add(data, "totalTextElements").name("Total Elements").listen();
        folder.add(data, "fontCatalogs").name("Font Catalogs").listen();
        folder.add(data, "loadingTextElements").name("Loading Elements").listen();
    }
}
//# sourceMappingURL=TextModule.js.map