/* Copyright (C) 2025 flywave.gl contributors */
export class EnvironmentModule {
    constructor(mapView) {
        this.mapView = mapView;
    }
    setupFolder(gui) {
        return gui.addFolder("🌍 Environment");
    }
    createData() {
        return {
            theme: "default",
            projection: "mercator",
            pixelRatio: 1,
            language: "en"
        };
    }
    updateData(data) {
        // Theme
        const theme = this.mapView.theme;
        if (theme && typeof theme === "object" && theme.name) {
            data.theme = theme.name;
        }
        else {
            data.theme = "default";
        }
        // Projection
        const projection = this.mapView.projection;
        if (projection && typeof projection === "object" && projection.name) {
            data.projection = projection.name;
        }
        else {
            data.projection = "mercator";
        }
        // Pixel ratio
        data.pixelRatio = this.mapView.pixelRatio || 1;
        // Language
        const languages = this.mapView.languages;
        if (languages && Array.isArray(languages) && languages.length > 0) {
            data.language = languages[0];
        }
        else {
            data.language = "en";
        }
    }
    bindControls(folder, data) {
        folder.add(data, "theme").name("Theme").listen();
        folder.add(data, "projection").name("Projection").listen();
        folder.add(data, "pixelRatio").name("Pixel Ratio").listen();
        folder.add(data, "language").name("Language").listen();
    }
}
//# sourceMappingURL=EnvironmentModule.js.map