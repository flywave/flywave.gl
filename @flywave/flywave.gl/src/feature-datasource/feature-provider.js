import RBush from "geojson-rbush";
import { dispatch } from "d3-dispatch";
import { DataProvider } from "@flywave/flywave-mapview-decoder";
import { lengthToDegrees } from "@turf/helpers";

import { webMercatorTilingScheme } from "@flywave/flywave-geoutils";
import * as turf from "@turf/turf";
import findNear from "../util/kdindex";

class GeoStoreProvider extends DataProvider {
    dispose() {}

    features = RBush();

    featureIdx = new Map();

    tileLoadedMap = new Map();

    dispatch = dispatch("tileLoaded", "update");

    queryRadioFeatures = (lon, lat, radio) => {
        var deg = lengthToDegrees(radio, "miles");
        const featureCollection = this.features.search([
            lon - deg,
            lat - deg,
            lon + deg,
            lat + deg
        ]);
        return findNear(featureCollection.features, lon, lat, radio);
    };

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
        (features || []).forEach(e => {
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
