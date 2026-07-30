/* Copyright (C) 2025 flywave.gl contributors */

import { type MapView } from "@flywave/flywave-mapview";

export interface FogData {
    enabled: boolean;
    color: string;
    ratio: number;
    range: number;
}

export class FogModule {
    private readonly mapView: MapView;

    constructor(mapView: MapView) {
        this.mapView = mapView;
    }

    getDefaultData(): FogData {
        return {
            enabled: false,
            color: "#ffffff",
            ratio: 0.00005,
            range: 10000
        };
    }

    updateData(data: FogData): void {
        this.mapView.fog.enabled = data.enabled;

        const theme = this.mapView.theme;
        if (!theme.fog) {
            theme.fog = {
                color: data.color,
                ratio: data.ratio,
                range: data.range
            };
        } else {
            theme.fog.color = data.color;
            theme.fog.ratio = data.ratio;
            theme.fog.range = data.range;
        }

        this.mapView.fog.reset(theme.fog);
        this.mapView.update();
    }

    syncWithMap(data: FogData): void {
        const theme = this.mapView.theme;
        const fogConfig = theme?.fog;

        if (fogConfig) {
            data.enabled = this.mapView.fog.enabled;
            data.color = fogConfig.color || data.color;
            data.ratio = fogConfig.ratio !== undefined ? fogConfig.ratio : data.ratio;
            data.range = fogConfig.range !== undefined ? fogConfig.range : data.range;
        }
    }
}
