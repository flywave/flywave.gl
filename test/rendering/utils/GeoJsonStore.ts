/* Copyright (C) 2025 flywave.gl contributors */

import { type TileKey, webMercatorTilingScheme } from "@flywave/flywave-geoutils";
import { DataProvider } from "@flywave/flywave-mapview-decoder";
import RBush from "geojson-rbush";

/**
 * A simple {@link @flywave/flywave-mapview-decoder/DataProvider} that organizes GeoJson features using an rtree.
 *
 * The `GeoJsonStore` can be used as a {@link @flywave/flywave-mapview-decoder/DataProvider}
 * of {@link @flywave/flywave-vectortile-datasource/VectorTileDataSource}s.
 *
 * @example
 * ```typescript
 * const geoJsonStore = new GeoJsonStore();
 *
 * const dataSource = new VectorTileDataSource({
 *    dataProvider: geoJsonStore,
 *    // ...
 * });
 *
 * geoJsonStore.features.insert(polygonFeature);
 * geoJsonStore.features.insert(lineStringFeature);
 * // ...
 * ```
 */
export class GeoJsonStore extends DataProvider {
    /**
     * The set of GeoJson features organized by this this `GeoJsonStore`.
     */
    readonly features = RBush();

    ready(): boolean {
        return true;
    }

    async getTile(tileKey: TileKey) {
        const { west, south, east, north } = webMercatorTilingScheme.getGeoBox(tileKey);
        const features = this.features.search([west, south, east, north]);
        return features;
    }

    protected async connect(): Promise<void> {}

    protected dispose(): void {}
}
