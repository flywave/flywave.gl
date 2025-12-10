/* Copyright (C) 2025 flywave.gl contributors */

//    Mocha discourages using arrow functions, see https://mochajs.org/#arrow-functions

import {
    GeoCoordinates,
    geographicStandardTiling,
    sphereProjection,
    TileKey,
    webMercatorTilingScheme
} from "@flywave/flywave-geoutils";
import { assert, expect } from "chai";
import * as THREE from "three";

import { createLayerStrategy } from "../src/quantized-terrain/layer-strategy/LayerStrategy";
// import { QuantizedTerrainSource } from "../src/tin-terrain/QuantizedTerrainSource";

// import {
//     QuantizedTerrainMesh,
//     QuantizedTerrainMeshData
// } from "../src/tin-terrain/quantized-mesh/QuantizedTerrainMesh";
// import sinon from "sinon";
// import { MapView, MapViewOptions } from "@flywave/flywave-mapview";
// import * as TestUtils from "@flywave/flywave-test-utils/WebGLStub";
// import { DecodedTerrainTile, TerrainTileDecoder } from "../src/TerrainDecoderWorker";
// import { TaskType } from "../src/Constants";

describe("flywave-terrain-datasource.tin-terrain", function () {
    it("layerStrategy", async function () {
        fetch("https://api.cesium.com/v1/assets/1/endpoint", {
            headers: {
                Authorization: `Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJqdGkiOiJlOTFkYWMzNC1mYjI1LTRlYTYtYTc2ZS04NWI1MTU2OTVlMDYiLCJpZCI6Mzg2NzksImlhdCI6MTY0MTE5NTAyNn0.4xsIJgYTK81yhRu67GG0x2FMit6zpYFCWsvWSwiFVV4`
            }
        }).then(async rep => {
            const data = await rep.json();
            const layerStrategy = await createLayerStrategy({
                url: "https://assets.ion.cesium.com/ap-northeast-1/asset_depot/1/CesiumWorldTerrain/v1.2/layer.json",
                headers: {
                    authorization: `Bearer ${data.accessToken}`
                }
            });

            [
                new TileKey(11515, 27116, 14),
                new TileKey(11515, 27117, 14),
                new TileKey(11514, 27115, 14),
                new TileKey(11514, 27116, 14),
                new TileKey(11514, 27117, 14),
                new TileKey(11515, 27116, 14),
                new TileKey(184279, 433844, 18)
            ].map(tileKey => {
                const used = layerStrategy.getTileDataAvailable(tileKey);
                console.log(used);
            });
        });
    });

    // it("geographicStandardTiling", async function () {
    //     let tiles: TileKey[] = [];
    //     for (const subTileKey of geographicStandardTiling.getSubTileKeys(new TileKey(0, 1, 0))) {
    //         tiles.push(subTileKey);
    //     }

    //     let geobox_0 = geographicStandardTiling.getGeoBox(new TileKey(0, 0, 0));
    //     let geobox_1 = geographicStandardTiling.getGeoBox(new TileKey(0, 1, 0));

    //     let geobox_1_1 = geographicStandardTiling.getGeoBox(new TileKey(0, 0, 1));

    //     let webmercator_0 = webMercatorTilingScheme.getGeoBox(new TileKey(0, 0, 0));

    //     const berlin = new GeoCoordinates(52.504951, 13.371806);
    //     const tileKey = geographicStandardTiling.getTileKey(berlin, 13) as TileKey;

    //     assert.isNotNull(tileKey);
    //     assert.strictEqual(tileKey.row, 3242);
    //     assert.strictEqual(tileKey.column, 4400);
    //     assert.strictEqual(tileKey.level, 13);
    // });

    // let sandbox = sinon.createSandbox();
    // let canvas: HTMLCanvasElement;
    // let mapViewOptions: MapViewOptions;
    // let mapView: MapView;

    // // This tests runs a non mocked version of MapView, hence we need to mock some other
    // // methods to get it working correctl.
    // const clearColorStub: sinon.SinonStub = sandbox.stub();
    // sandbox
    //     .stub(THREE, "WebGLRenderer")
    //     .returns(TestUtils.getWebGLRendererStub(sandbox, clearColorStub));
    // canvas = document.createElement("canvas");
    // canvas.width = 1033;
    // canvas.height = 1793;
    // mapViewOptions = {
    //     canvas
    // };
    // mapView = new MapView(mapViewOptions);

    // it("QuantizedMeshClipper", async function () {
    //     let quantizedTerrainSource = new QuantizedTerrainSource({
    //         url: "/@flywave/flywave-terrain-datasource/test/data/taihe"
    //     });

    //     mapView.setElevationSource(
    //         quantizedTerrainSource,
    //         quantizedTerrainSource.getElevationRangeSource(),
    //         quantizedTerrainSource.getElevationProvider()
    //     );

    //     await quantizedTerrainSource.dataProvider().awaitReady();

    //     let rootKey = new TileKey(0, 1, 0);
    //     let childrenKey = new TileKey(1, 3, 1);

    //     let rootBuffer = await quantizedTerrainSource
    //         .dataProvider()
    //         .layerStrategy.requestTileBuffer(rootKey);
    //     let decoder = new TerrainTileDecoder();
    //     decoder.configure({});

    //     let parentQuantizedMesh = new QuantizedTerrainMesh(
    //         (
    //             (await decoder.decodeTile(
    //                 {
    //                     type: TaskType.QuantizedMesh,
    //                     buffer: rootBuffer,
    //                     geoBox: quantizedTerrainSource
    //                         .getTilingScheme()
    //                         .getGeoBox(rootKey)
    //                         .toArray()
    //                 },
    //                 rootKey,
    //                 sphereProjection
    //             )) as DecodedTerrainTile
    //         ).tileTerrain as QuantizedTerrainMeshData
    //     );

    //     let decodedTile = (await decoder.decodeTile(
    //         {
    //             type: TaskType.QuantizedUpsample,
    //             quantizedTerrainMeshData: parentQuantizedMesh.toQuantizedTerrainMeshData(),
    //             smoothSkirtNormals: true,
    //             skirtLength: parentQuantizedMesh.metaData?.json?.geometricerror || 1000,
    //             geoBox: quantizedTerrainSource.getTilingScheme().getGeoBox(rootKey).toArray(),
    //             tileKey: childrenKey.mortonCode(),
    //             parentTileKey: rootKey.mortonCode()
    //         },
    //         childrenKey,
    //         sphereProjection
    //     )) as DecodedTerrainTile;

    //     let mesh = new QuantizedTerrainMesh(decodedTile.tileTerrain as QuantizedTerrainMeshData);
    // });
});
