/* Copyright (C) 2025 flywave.gl contributors */

//    Mocha discourages using arrow functions, see https://mochajs.org/#arrow-functions

import {
    type FrustumGeoArea,
    GeoBox,
    GeoCoordinates,
    geographicStandardTiling,
    sphereProjection,
    TileKey,
    webMercatorTilingScheme
} from "@flywave/flywave-geoutils";
import { assert, expect } from "chai";
import * as THREE from "three";
const { Brush, Evaluator, SUBTRACTION } = require("three-bvh-csg");

import { createLayerStrategy } from "../src/quantized-terrain/layer-strategy/LayerStrategy";
import { createStratumTileFromBuffer } from "../src/quantized-terrain/quantized-stratum-mesh/stratum-tile";
import { StratumMeshCliper } from "../src/quantized-terrain/quantized-stratum-mesh/stratum-tile/StratumTileCliper";
import { type StratumTileData } from "../src/quantized-terrain/quantized-stratum-mesh/stratum-tile/StratumTileData";

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

describe("flywave-terrain-datasource.stratum", function () {
    it("decoder+clipTest", async function () {
        const layerStrategy = await createLayerStrategy({
            url: "/@flywave/flywave-terrain-datasource/test/data/stratum/layer.json"
        });

        const reqTileKey = TileKey.fromRowColumnLevel(25550, 54258, 15);
        const tileBuffer = await layerStrategy.requestTileBuffer(reqTileKey);

        try {
            const stratumTile = createStratumTileFromBuffer(
                geographicStandardTiling.getGeoBox(reqTileKey),
                tileBuffer,
                sphereProjection,
                [
                    {
                        geoArea: geographicStandardTiling.getGeoBox(
                            TileKey.fromRowColumnLevel(51100, 108516, 16)
                        ),
                        id: "groundModification",
                        type: {
                            vertexSource: "fixed",
                            heightOperation: "replace"
                        },
                        depthOrHeight: -200,
                        boundingBox: geographicStandardTiling.getGeoBox(
                            TileKey.fromRowColumnLevel(51100, 108516, 16)
                        )
                    }
                ]
            );

            console.log(stratumTile.center);
        } catch (e) {
            console.log(e);
        }
    });

    it("makeFrustumGeoAreaToBspNode-test", function () {
        // 创建两个有重叠部分的GeoBox
        const geoBox1 = new GeoBox(
            new GeoCoordinates(52.52, 13.4), // southWest
            new GeoCoordinates(52.54, 13.42) // northEast
        );

        const geoBox2 = new GeoBox(
            new GeoCoordinates(52.53, 13.41), // southWest
            new GeoCoordinates(52.55, 13.43) // northEast
        );

        // 创建一个模拟的StratumTileData对象，只需要包含必要的属性
        const mockStratumTileData: any = {
            maxHeight: 200,
            center: new THREE.Vector3(0, 0, 0),
            projection: sphereProjection
        };

        class TestStratumMeshCliper extends StratumMeshCliper {
            constructor(stratumMeshData: StratumTileData) {
                super(stratumMeshData);
            }

            testMakeFrustumGeoAreaToBspNode(frustumGeoAreas: FrustumGeoArea) {
                return this.makeFrustumGeoAreaToBspNode([frustumGeoAreas]);
            }
        }

        // 创建StratumMeshCliper实例
        const cliper = new TestStratumMeshCliper(mockStratumTileData);

        // 调用makeFrustumGeoAreaToBspNode函数
        const brush1 = cliper.testMakeFrustumGeoAreaToBspNode({
            geoArea: geoBox1,
            topAltitude: 100,
            bottomAltitude: 0
        });

        const brush2 = cliper.testMakeFrustumGeoAreaToBspNode({
            geoArea: geoBox2,
            topAltitude: 100,
            bottomAltitude: 0
        });

        // 验证Brush是否正确构造并能够进行裁剪
        expect(brush1).to.be.instanceOf(Brush);
        expect(brush2).to.be.instanceOf(Brush);

        // 使用Evaluator进行裁剪操作
        const evaluator = new Evaluator();
        const resultBrush = evaluator.evaluate(brush1, brush2, SUBTRACTION);

        // 验证裁剪结果
        expect(resultBrush).to.be.instanceOf(Brush);
    });
});
