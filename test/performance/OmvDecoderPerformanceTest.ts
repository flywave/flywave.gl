/* Copyright (C) 2025 flywave.gl contributors */

import { type Theme, type ValueMap } from "@flywave/flywave-datasource-protocol";
import { MapEnv, StyleSetEvaluator } from "@flywave/flywave-datasource-protocol/index-decoder";
import { apikey } from "@flywave/flywave-examples/config";
import {
    mercatorProjection,
    sphereProjection,
    TileKey,
    webMercatorProjection
} from "@flywave/flywave-geoutils";
import { ThemeLoader } from "@flywave/flywave-mapview";
import { getTestResourceUrl } from "@flywave/flywave-test-utils/index.node";
import { measurePerformanceSync } from "@flywave/flywave-test-utils/lib/ProfileHelper";
import {
    type OmvRestClientParameters,
    APIFormat,
    AuthenticationMethod,
    OmvRestClient
} from "@flywave/flywave-vectortile-datasource";
import { OmvDataAdapter } from "@flywave/flywave-vectortile-datasource/lib/adapters/omv/OmvDataAdapter";
import { DecodeInfo } from "@flywave/flywave-vectortile-datasource/lib/DecodeInfo";
import {
    type IGeometryProcessor,
    type ILineGeometry,
    type IPolygonGeometry
} from "@flywave/flywave-vectortile-datasource/lib/IGeometryProcessor";
import { VectorTileDataProcessor } from "@flywave/flywave-vectortile-datasource/lib/VectorTileDecoder";
import { assert } from "chai";

if (typeof window === "undefined") {
    const perfHooks = require("perf_hooks");

    (global as any).performance = perfHooks.performance;
    (global as any).PerformanceObserver = perfHooks.PerformanceObserver;
    (global as any).PerformanceEntry = perfHooks.PerformanceEntry;
}

export interface OMVDecoderPerformanceTestOptions {
    /**
     *
     */
    repeats?: number;
    /**
     * Theme url or object.
     *
     * Will be resolved using [[ThemeLoader.load]].
     */
    theme: Theme | string;

    /**
     * Styleset name, defaults to `tilezen`.
     */
    styleSetName?: string;

    /**
     * Morton codes of tiles.
     */
    tiles: number[];

    /**
     * Requires settings for [[OmvRestClient]] to download tiles.
     */
    omvRestClientOptions: OmvRestClientParameters;
}

/**
 * Create tests that downloads some OMV tiles from real datasource, then decodes them using
 * particular style.
 *
 * @see OMVDecoderPerformanceTestOptions
 */
export function createOMVDecoderPerformanceTest(
    name: string,
    options: OMVDecoderPerformanceTestOptions
) {
    const repeats = options.repeats ?? 10;
    const styleSetName = options.styleSetName ?? "tilezen";
    describe(`OMVDecoderPerformanceTest - ${name}`, function () {
        this.timeout(0);
        let omvTiles: Array<[TileKey, ArrayBuffer]>;
        let theme: Theme;

        before(async function () {
            this.timeout(10000);
            const omvDataProvider = new OmvRestClient(options.omvRestClientOptions);

            await omvDataProvider.connect();
            assert(omvDataProvider.ready());
            omvTiles = await Promise.all(
                options.tiles.map(async mortonCode => {
                    const tileKey = TileKey.fromMortonCode(mortonCode);
                    const tile = await omvDataProvider.getTile(tileKey);
                    assert(tile instanceof ArrayBuffer);
                    return [tileKey, tile as ArrayBuffer] as [TileKey, ArrayBuffer];
                })
            );

            theme = await ThemeLoader.load(options.theme);
            assert.isObject(theme.styles);
            assert.isArray(theme.styles![styleSetName]);
        });

        it(`measure feature matching time`, async () => {
            const counterName = `OMVDecoderPerformanceTest-${name} styleMatchOnly`;
            this.timeout(0);

            const styleSetEvaluator = new StyleSetEvaluator({
                styleSet: theme.styles![styleSetName],
                definitions: theme.definitions
            });

            const geometryProcessor: IGeometryProcessor = {
                processPointFeature(
                    layerName: string,
                    tileExtents: number,
                    geometry: THREE.Vector3[],
                    properties: ValueMap
                ) {
                    const env = new MapEnv(properties);
                    styleSetEvaluator.getMatchingTechniques(env, layerName, "point");
                },
                processLineFeature(
                    layerName: string,
                    tileExtents: number,
                    geometry: ILineGeometry[],
                    properties: ValueMap
                ) {
                    const env = new MapEnv(properties);
                    styleSetEvaluator.getMatchingTechniques(env, layerName, "line");
                },

                processPolygonFeature(
                    layerName: string,
                    tileExtents: number,
                    geometry: IPolygonGeometry[],
                    properties: ValueMap
                ) {
                    const env = new MapEnv(properties);
                    styleSetEvaluator.getMatchingTechniques(env, layerName, "polygon");
                }
            };

            await measurePerformanceSync(counterName, repeats, function () {
                for (const [tileKey, tileData] of omvTiles) {
                    const decoder = new OmvDataAdapter();
                    const decodeInfo = new DecodeInfo(mercatorProjection, tileKey, 0);
                    decoder.process(tileData, decodeInfo, geometryProcessor);
                }
            });
        });

        it(`measure decode time - webMercator`, async () => {
            const counterName = `OMVDecoderPerformanceTest-${name} webMercator`;
            this.timeout(0);

            const projection = webMercatorProjection;

            const styleSetEvaluator = new StyleSetEvaluator({
                styleSet: theme.styles![styleSetName],
                definitions: theme.definitions
            });

            await measurePerformanceSync(counterName, repeats, function () {
                for (const [tileKey, tileData] of omvTiles) {
                    const decoder = new VectorTileDataProcessor(
                        tileKey,
                        projection,
                        styleSetEvaluator,
                        new OmvDataAdapter()
                    );
                    decoder.getDecodedTile(tileData);
                }
            });
        });

        it(`measure decode time - sphereProjection`, async () => {
            this.timeout(0);

            const counterName = `OMVDecoderPerformanceTest-${name} sphere`;

            const projection = sphereProjection;

            const styleSetEvaluator = new StyleSetEvaluator({
                styleSet: theme.styles![styleSetName],
                definitions: theme.definitions
            });

            await measurePerformanceSync(counterName, repeats, function () {
                for (const [tileKey, tileData] of omvTiles) {
                    const decoder = new VectorTileDataProcessor(
                        tileKey,
                        projection,
                        styleSetEvaluator,
                        new OmvDataAdapter()
                    );
                    decoder.getDecodedTile(tileData);
                }
            });
        });
    });
}

const BERLIN_CENTER_TILES = [371506851, 371506850, 371506849, 371506848];

createOMVDecoderPerformanceTest("theme=berlin tiles=4 region=berlin data=herebase", {
    theme: getTestResourceUrl("@flywave/flywave-map-theme", "resources/tilezen_base.json"),
    tiles: BERLIN_CENTER_TILES,
    omvRestClientOptions: {
        baseUrl: "https://vector.hereapi.com/v2/vectortiles/base/mc",
        apiFormat: APIFormat.XYZOMV,
        authenticationCode: apikey,
        authenticationMethod: {
            method: AuthenticationMethod.QueryString,
            name: "apikey"
        }
    }
});

createOMVDecoderPerformanceTest("theme=berlin tiles=4 region=berlin data=osmbase", {
    theme: getTestResourceUrl("@flywave/flywave-map-theme", "resources/tilezen_base.json"),
    tiles: BERLIN_CENTER_TILES,
    omvRestClientOptions: {
        baseUrl: "https://vector.hereapi.com/v2/vectortiles/base/mc",
        apiFormat: APIFormat.XYZOMV,
        authenticationCode: apikey,
        authenticationMethod: {
            method: AuthenticationMethod.QueryString,
            name: "apikey"
        }
    }
});

const NEW_YORK_TILES = [
    327439127, 327439124, 327439125, 327439168, 327439170,

    327438781, 327438783, 327438826, 327438782, 327438824
];

createOMVDecoderPerformanceTest("theme=berlin tiles=10 region=ny data=herebase", {
    theme: getTestResourceUrl("@flywave/flywave-map-theme", "resources/tilezen_base.json"),
    tiles: NEW_YORK_TILES,
    omvRestClientOptions: {
        baseUrl: "https://vector.hereapi.com/v2/vectortiles/base/mc",
        apiFormat: APIFormat.XYZOMV,
        authenticationCode: apikey,
        authenticationMethod: {
            method: AuthenticationMethod.QueryString,
            name: "apikey"
        }
    }
});

createOMVDecoderPerformanceTest("theme=berlin tiles=10 region=ny data=osmbase", {
    theme: getTestResourceUrl("@flywave/flywave-map-theme", "resources/tilezen_base.json"),
    tiles: NEW_YORK_TILES,
    omvRestClientOptions: {
        baseUrl: "https://vector.hereapi.com/v2/vectortiles/base/mc",
        apiFormat: APIFormat.XYZOMV,
        authenticationCode: apikey,
        authenticationMethod: {
            method: AuthenticationMethod.QueryString,
            name: "apikey"
        }
    }
});
