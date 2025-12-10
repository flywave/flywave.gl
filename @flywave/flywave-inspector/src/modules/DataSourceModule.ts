/* Copyright (C) 2025 flywave.gl contributors */

import { type MapView } from "@flywave/flywave-mapview";
import { type GUI } from "dat.gui";

export interface DataSourceData {
    count: number;
    enabled: number;
    names: string;
}

export class DataSourceModule {
    private readonly mapView: MapView;

    constructor(mapView: MapView) {
        this.mapView = mapView;
    }

    setupFolder(gui: GUI): GUI {
        return gui.addFolder("📚 Data Sources");
    }

    createData(): DataSourceData {
        return {
            count: 0,
            enabled: 0,
            names: "None"
        };
    }

    updateData(data: DataSourceData): void {
        const dataSources = this.mapView.dataSources;
        data.count = dataSources.length;

        const enabledDataSources = dataSources.filter((ds: any) =>
            this.mapView.isDataSourceEnabled(ds)
        );
        data.enabled = enabledDataSources.length;

        if (dataSources.length > 0) {
            const names = dataSources.map((ds: any) => ds.name).slice(0, 3);
            data.names = names.join(", ");
            if (dataSources.length > 3) {
                data.names += ` and ${dataSources.length - 3} more`;
            }
        } else {
            data.names = "None";
        }
    }

    bindControls(folder: GUI, data: DataSourceData): void {
        folder.add(data, "count").name("Total DataSources").listen();
        folder.add(data, "enabled").name("Enabled DataSources").listen();
        folder.add(data, "names").name("DataSource Names").listen();
    }
}
