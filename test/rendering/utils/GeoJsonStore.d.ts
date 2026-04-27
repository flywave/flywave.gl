import { type TileKey } from "@flywave/flywave-geoutils";
import { DataProvider } from "@flywave/flywave-mapview-decoder";
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
export declare class GeoJsonStore extends DataProvider {
    /**
     * The set of GeoJson features organized by this this `GeoJsonStore`.
     */
    readonly features: import("geojson-rbush").RBush;
    ready(): boolean;
    getTile(tileKey: TileKey): Promise<import("@turf/helpers").FeatureCollection<import("@turf/helpers").GeometryObject, {
        [name: string]: any;
    }>>;
    protected connect(): Promise<void>;
    protected dispose(): void;
}
