/*
 * Copyright (C) 2019-2021 HERE Europe B.V.
 * Licensed under Apache 2.0, see full license in LICENSE
 * SPDX-License-Identifier: Apache-2.0
 */
import { LoggerManager } from "@flywave/flywave-utils";
import { VectorTileDataSource } from "@flywave/flywave-vectortile-datasource";

import { GeoStoreProvider } from "./feature-provider";
import { Math2D } from "@flywave/flywave-utils";

const logger = LoggerManager.instance.create("FeaturesDataSource");

const NAME = "user-features-datasource";
const DEFAULT_GEOJSON = {
    type: "FeatureCollection",
    features: []
};

/**
 * [[DataSource]] implementation to use for the addition of custom features.
 */
export class FeaturesDataSource extends VectorTileDataSource {
    m_isAttached = false;
    m_featureCollection = this.emptyGeojson();

    maxGeometryHeight = 800;

    minGeometryHeight = -800;
    /**
     * Builds a `FeaturesDataSource`.
     *
     * @param options - specify custom options using [[FeatureDataSourceOptions]] interface.
     */
    constructor(options) {
        super({
            dataProvider: new GeoStoreProvider(NAME, DEFAULT_GEOJSON, options),
            styleSetName: "geojson", 
            minDataLevel: 16,
            maxDataLevel: 16,
            gatherFeatureAttributes: true,
            dataSourceOrder: 1,
            addGroundPlane: false,
            ...options,
            maxDisplayLevel: 25,
            ...options,
            maxGeometryHeight: 0,
            addGroundPlane: false
        });

        this.dataProvider().bindDataSource(this);

        if (options !== undefined) {
            if (options.features !== undefined) {
                this.add(...options.features);
            }
            if (options.geojson !== undefined) {
                this.setFromGeojson(options.geojson);
            }
        }
    }

    /**
     * This method allows to directly add a GeoJSON without using [[MapViewFeature]] instances. It
     * also overwrites existing features in this data source. To add a GeoJSON without overwriting
     * the data source, one should loop through it to create [[MapViewFeature]] and add them with
     * the `add` method.
     *
     * @param geojson - A javascript object matching the GeoJSON specification.
     */
    setFromGeojson(geojson) {
        if (geojson.type === "FeatureCollection") {
            this.m_featureCollection = geojson;
        } else if (geojson.type === "Feature") {
            this.m_featureCollection = this.emptyGeojson();
            this.m_featureCollection.features.push(geojson);
        } else if (geojson.type === "GeometryCollection") {
            this.m_featureCollection = this.emptyGeojson();
            for (const geometry of geojson.geometries) {
                this.m_featureCollection.features.push({
                    type: "Feature",
                    geometry
                });
            }
        } else {
            throw new TypeError("The provided object is not a valid GeoJSON object.");
        }
        this.update();
        return this;
    }

    /**
     * Adds a custom feature in the datasource.
     *
     * @param features - The features to add in the datasource.
     */
    add(...features) {
        for (const feature of features) {
            this.addFeature(feature);
        }
        this.update();
        return this;
    }

    /**
     * Removes a custom feature in the datasource.
     *
     * @param features - The features to add in the datasource.
     */
    remove(...features) {
        for (const feature of features) {
            this.removeFeature(feature);
        }
        this.update();
        return this;
    }

    updateFeature(geojsonFeature) {
        this.dataProvider().updateInput(geojsonFeature);
        this.update();
        return this;
    }

    /**
     * Removes all the custom features in this `FeaturesDataSource`.
     */
    clear() {
        this.m_featureCollection = this.emptyGeojson();
        this.update();
    }

    /** @override */
    async connect() {
        await super.connect();
        if (this.m_featureCollection.features.length > 0) {
            await this.update();
        }
    }

    /**
     * Override [[DataSource.attach]] to know if we're really connected to [[MapView]].
     * @param mapView -
     * @override
     */
    attach(mapView) {
        super.attach(mapView);
        this.m_isAttached = true;
    }

    /**
     * Override [[DataSource.detach]] to know if we're really connected to [[MapView]].
     * @param mapView -
     * @override
     */
    detach(mapView) {
        super.detach(mapView);
        this.m_isAttached = false;
    }

    addFeature(feature) {
        // Create a GeoJson feature from the feature coordinates and push it.
        const geometry = {
            type: feature.geometry.type,
            coordinates: feature.geometry.coordinates
        };
        const geojsonFeature = {
            type: "Feature",
            id: feature.id,
            geometry,
            properties: {
                ...feature.properties
            },
            topology: feature.topology
        };

        this.dataProvider().updateInput(geojsonFeature);
    }

    removeFeature(feature) {
        this.dataProvider().removeInput(feature);
    }

    async update(tileFilter) {
        const dataProvider = this.dataProvider();
        if (!this.m_isAttached || !dataProvider.ready()) {
            return;
        }

        try {
            if (this.m_isAttached) {
                this.mapView.markTilesDirty(this, tileFilter);
            }
        } catch (error) {
            // We use `update` in sync API, so there's no-one to react to errors so log them.
            logger.error(`[${this.name}]: failed to update tile index`, error);
        }
    }

    async updateWithBbox(bbox) {
        var fbbox = new Math2D.Box(bbox[0], bbox[1], bbox[2] - bbox[0], bbox[3] - bbox[1]);
        return this.update(tile => {
            const { latitude: minLat, longitude: minLng } = tile.geoBox.southWest;
            const { latitude: maxLat, longitude: maxLng } = tile.geoBox.northEast;
            return new Math2D.Box(minLng, minLat, maxLng - minLng, maxLat - minLat).intersects(
                fbbox
            );
        });
    }

    emptyGeojson() {
        return {
            features: [],
            type: "FeatureCollection"
        };
    }
}
