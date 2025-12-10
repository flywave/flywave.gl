/* Copyright (C) 2025 flywave.gl contributors */

import {
    type OmvWithCustomDataProvider,
    type OmvWithRestClientParams,
    VectorTileDataSource
} from "@flywave/flywave-vectortile-datasource";

/**
 * `GeoJsonDataSource` is used for the visualization of geometric objects provided in the GeoJSON
 * format. To be able to render GeoJSON data, a `GeoJsonDataSource` instance must be added to the
 * {@link @flywave/flywave-mapview#MapView} instance.
 *
 * @example
 * ```typescript
 *    const geoJsonDataProvider = new GeoJsonDataProvider(
 *        "italy",
 *        new URL("resources/italy.json", window.location.href)
 *    );
 *    const geoJsonDataSource = new GeoJsonDataSource({
 *        dataProvider: geoJsonDataProvider,
 *        styleSetName: "geojson"
 *    });
 *    mapView.addDataSource(geoJsonDataSource);
 *   ```
 */
export class GeoJsonDataSource extends VectorTileDataSource {
    /**
     * Default constructor.
     *
     * @param params - Data source configuration's parameters.
     */
    constructor(params: OmvWithRestClientParams | OmvWithCustomDataProvider) {
        super({ styleSetName: "geojson", ...params });
    }
}
