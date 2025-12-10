/* Copyright (C) 2025 flywave.gl contributors */
export class DataSourceModule {
    constructor(mapView) {
        this.mapView = mapView;
    }
    setupFolder(gui) {
        return gui.addFolder("📚 Data Sources");
    }
    createData() {
        return {
            count: 0,
            enabled: 0,
            names: "None"
        };
    }
    updateData(data) {
        const dataSources = this.mapView.dataSources;
        data.count = dataSources.length;
        const enabledDataSources = dataSources.filter((ds) => this.mapView.isDataSourceEnabled(ds));
        data.enabled = enabledDataSources.length;
        if (dataSources.length > 0) {
            const names = dataSources.map((ds) => ds.name).slice(0, 3);
            data.names = names.join(", ");
            if (dataSources.length > 3) {
                data.names += ` and ${dataSources.length - 3} more`;
            }
        }
        else {
            data.names = "None";
        }
    }
    bindControls(folder, data) {
        folder.add(data, "count").name("Total DataSources").listen();
        folder.add(data, "enabled").name("Enabled DataSources").listen();
        folder.add(data, "names").name("DataSource Names").listen();
    }
}
//# sourceMappingURL=DataSourceModule.js.map