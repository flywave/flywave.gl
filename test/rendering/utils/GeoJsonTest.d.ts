import { type FlatTheme, type GeoJson, type Theme } from "@flywave/flywave-datasource-protocol";
import { type Projection } from "@flywave/flywave-geoutils";
import { type LookAtParams, MapView } from "@flywave/flywave-mapview";
import { type DataProvider } from "@flywave/flywave-mapview-decoder";
export interface GeoJsonDataSourceTestOptions {
    geoJson?: string | GeoJson;
    tileGeoJson?: boolean;
    dataProvider?: DataProvider;
    dataSourceOrder?: number;
}
export interface GeoJsonTestOptions extends GeoJsonDataSourceTestOptions {
    mochaTest: Mocha.Context;
    testImageName: string;
    theme: Theme | FlatTheme;
    geoJson?: string | GeoJson;
    lookAt?: Partial<LookAtParams>;
    tileGeoJson?: boolean;
    dataProvider?: DataProvider;
    extraDataSource?: GeoJsonDataSourceTestOptions;
    beforeFinishCallback?: (mapView: MapView) => void;
    size?: number;
    projection?: Projection;
}
export declare class GeoJsonTest {
    mapView: MapView;
    dispose(): void;
    run(options: GeoJsonTestOptions): Promise<void>;
}
