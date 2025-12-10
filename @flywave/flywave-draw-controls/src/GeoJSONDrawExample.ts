/* Copyright (C) 2025 flywave.gl contributors */

import { type GeoJson } from "@flywave/flywave-datasource-protocol";
import { type MapControls } from "@flywave/flywave-map-controls";
import { type MapView } from "@flywave/flywave-mapview";

import { GeoJSONDrawControls } from "./GeoJSONDrawControls";

/**
 * GeoJSON drawing example
 * Shows how to use GeoJSONDrawControls for drawing and editing GeoJSON data
 */
export class GeoJSONDrawExample {
    private readonly mapView: MapView;
    private readonly mapControls: MapControls;
    private readonly drawControls: GeoJSONDrawControls;

    constructor(mapView: MapView, mapControls: MapControls) {
        this.mapView = mapView;
        this.mapControls = mapControls;

        // Create GeoJSON drawing controls
        this.drawControls = new GeoJSONDrawControls(mapView, mapControls);
    }

    /**
     * Load GeoJSON data and display it on the map
     * @param geoJson GeoJSON data
     */
    public loadGeoJSON(geoJson: GeoJson): void {
        const count = this.drawControls.addGeoJSON(geoJson);
        console.log(`Successfully loaded ${count} GeoJSON objects`);
    }

    /**
     * Create sample GeoJSON data
     * @returns Sample GeoJSON data
     */
    public createSampleGeoJSON(): GeoJson {
        return {
            type: "FeatureCollection",
            features: [
                {
                    type: "Feature",
                    properties: {
                        id: "point-1",
                        name: "Sample Point"
                    },
                    geometry: {
                        type: "Point",
                        coordinates: [116.4074, 39.9042, 0] // Beijing coordinates
                    }
                },
                {
                    type: "Feature",
                    properties: {
                        id: "line-1",
                        name: "Sample Line"
                    },
                    geometry: {
                        type: "LineString",
                        coordinates: [
                            [116.4074, 39.9042, 0], // Beijing
                            [121.4737, 31.2304, 0], // Shanghai
                            [113.2644, 23.1291, 0] // Guangzhou
                        ]
                    }
                },
                {
                    type: "Feature",
                    properties: {
                        id: "polygon-1",
                        name: "Sample Polygon"
                    },
                    geometry: {
                        type: "Polygon",
                        coordinates: [
                            [
                                [116.4074, 39.9042, 0], // Beijing
                                [121.4737, 31.2304, 0], // Shanghai
                                [113.2644, 23.1291, 0], // Guangzhou
                                [104.0668, 30.5728, 0], // Chengdu
                                [116.4074, 39.9042, 0] // Back to Beijing to close
                            ]
                        ]
                    }
                }
            ]
        };
    }

    /**
     * Export all currently drawn objects as GeoJSON
     * @returns GeoJSON data
     */
    public exportToGeoJSON(): GeoJson {
        return this.drawControls.exportToGeoJSON();
    }

    /**
     * Get drawing control instance
     * @returns GeoJSONDrawControls instance
     */
    public getDrawControls(): GeoJSONDrawControls {
        return this.drawControls;
    }
}
