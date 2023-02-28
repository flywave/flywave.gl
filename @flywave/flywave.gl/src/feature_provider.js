
import RBush from "geojson-rbush";
import { dispatch } from "d3-dispatch";
import { Tile } from "@flywave/flywave-mapview";
import { DataProvider } from "@flywave/flywave-mapview-decoder";
import { lengthToDegrees } from '@turf/helpers';

import { webMercatorTilingScheme } from "@flywave/flywave-geoutils";
import { TransferManager } from "@flywave/flywave-transfer-manager";
import mockJson from "./mock_geojson.json";
import * as turf from "@turf/turf";
import findNear from "./util/kdindex"; 
import { processFeature } from "./util/explain-mulity-line";

class GeoStoreProvider extends DataProvider {

    dispose() {

    }

    features = RBush();

    featureIdx = new Map();

    tileLoadedMap = new Map();

    dispatch = dispatch("tileLoaded", "update");

    queryRadioFeatures = (lon, lat, radio) => {
        var deg = lengthToDegrees(radio, 'miles');
        const featureCollection = this.features.search([lon - deg, lat - deg, lon + deg, lat + deg]);
        return findNear(featureCollection.features, lon, lat, radio);
    }

    on() {
        this.dispatch.on.apply(this.dispatch, arguments);
        return this;
    }

    connect() {
        return Promise.resolve();
    }

    ready() {
        return true;
    }

    bindDataSource(source) {
        this.datasource = source;
    }

    updateInput(input) {
        this.removeInput(input);
        delete input.bbox;
        this.featureIdx.set(input.id, turf.clone(input));
        this.features.insert(input);
        this.dispatch.call("update", this, input);
    }

    removeInput(input) {
        if (!this.featureIdx.has(input.id)) {
            return;
        }

        this.features.remove(this.featureIdx.get(input.id), (e, b) => {
            return e.id == b.id;
        });

        this.featureIdx.delete(input.id);
    }

    loadData(features) {
        (features || []).forEach((e) => {
            this.datasource.add(e);
        });

        this.dispatch.call("tileLoaded", this, turf.featureCollection(features));
    }

    async getTile(tileKey, abortSignal) {
        const { west, south, east, north } = webMercatorTilingScheme.getGeoBox(tileKey);
        const features = this.features.search([west, south, east, north]);
        features.features = features.features.filter(e => !e.isDelete);
        return features;
    }
}

export { GeoStoreProvider };

class GeoServerProvider extends GeoStoreProvider {

    constructor(name, geojson, option) {
        super(name, geojson, option);
        this.downloadManager = TransferManager.instance();
        this.options = {/*maxProvderDataLevel:16,*/...option };
    }

    tileLoadedMap = new Map();

    dataUrl = (tileKey) => {
        var tile = new Tile(this.datasource, tileKey);
        const { geoBox } = tile;
        return `${this.options.dataUrl}?box=${geoBox.west},${geoBox.south},${geoBox.east},${geoBox.north}`
    }

    on() {
        this.dispatch.on.apply(this.dispatch, arguments);
        return this;
    }

    featureURL(featureId) {
        return `${this.options.fetchFeatureUrl}/${featureId}`
    }

    async loadFeatureById(featureId) {
        return await this.downloadManager.downloadJson(this.featureURL(featureId), {});
    }

    async getTile(tileKey, abortSignal) {

        const init = { signal: abortSignal };
        if (this.tileLoadedMap.has(tileKey.m_mortonCode) || tileKey.level < this.options.maxProvderDataLevel) {
            return super.getTile(tileKey, abortSignal);
        }

        return await this.downloadManager.downloadJson(this.dataUrl(tileKey), init).then(features => {
            var data = turf.featureCollection(features)
            var filtered = [];
            for (var feature of data.features) {
                feature.id = feature.id.trim();
                feature = processFeature({ ...feature, type: "Feature" });
                if (!this.featureIdx.has(feature.id)) {
                    if (!this.featureIdx.has(feature.id)) {
                        this.datasource.addFeature(feature);
                        this.featureIdx.set(feature.id, feature);
                        filtered.push(feature);
                    }
                    this.featureIdx.set(feature.id, feature);
                }
            }
            var featData = turf.featureCollection(filtered);
            this.tileLoadedMap.set(tileKey.m_mortonCode, featData);
            this.datasource.update(tile => {
                return tile.tileKey.equals(tileKey);
            });

            this.dispatch.call("tileLoaded", this, featData);
        });
    }
}

export default GeoServerProvider;

class GeoServerProviderMock extends GeoStoreProvider {

    dispatch = dispatch("tileLoaded", "update");

    on() {
        this.dispatch.on.apply(this.dispatch, arguments);
        return this;
    }


    async getTile(tileKey, abortSignal) {

        mockJson.features = [
            {
                "id": "w-2",
                "geometry": {
                    "coordinates": [
                        [
                            118.13595429737865,
                            36.53700394817834, 400
                        ],
                        [
                            118.1408908177824,
                            36.53206695238569, 400
                        ]
                    ],
                    "type": "LineString"
                },
                "type": "Feature",
                "properties": {
                    "name": "ABCDEDF"
                },
                "topology": {
                    type: "pipe",
                    profile: {
                        "center": [
                            0,
                            0,
                            0
                        ],
                        "norm": [
                            0,
                            0,
                            1
                        ], radius: 5, type: "circ"
                    },
                    "materials": [{ "ambient": [0, 0, 0], "ambient-occlusion": 0.4, "color": [231, 193, 100], "emissive": [0, 0, 0], "metallic": 0, "reflectance": 0.8, "roughness": 0.3, "shininess": 0.4, "specular": [0, 0, 0], "specularity": 0.3, "transparency": 0, "type": "phong" }]
                }
            },

            {
                "id": "w-3",
                "geometry": {
                    "coordinates": [
                        [
                            118.12269403251634,
                            36.5350268249143, 400
                        ],
                        [
                            118.13574413072962,
                            36.53758161602545, 400
                        ]
                    ],
                    "type": "LineString"
                },
                "type": "Feature",
                "properties": {
                    "name": "ABCDEDF"
                },
                "topology": {
                    type: "pipe",
                    profile: {
                        "center": [
                            0,
                            0,
                            0
                        ],
                        "norm": [
                            0,
                            0,
                            1
                        ], radius: 5, type: "circ"
                    },
                    "materials": [{ "ambient": [0, 0, 0], "ambient-occlusion": 0.4, "color": [231, 193, 100], "emissive": [0, 0, 0], "metallic": 0, "reflectance": 0.8, "roughness": 0.3, "shininess": 0.4, "specular": [0, 0, 0], "specularity": 0.3, "transparency": 0, "type": "phong" }]
                }
            }
        ];
        for (const feature of mockJson.features) {
            if (!this.featureIdx.has(feature.id)) {
                this.datasource.addFeature(feature);
            }
        }

        this.dispatch.call("tileLoaded", this, mockJson);

        return mockJson;
    }
}


export { GeoServerProviderMock };