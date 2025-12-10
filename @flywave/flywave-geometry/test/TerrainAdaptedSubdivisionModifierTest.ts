/* Copyright (C) 2025 flywave.gl contributors */

//    Mocha discourages using arrow functions, see https://mochajs.org/#arrow-functions
//    Chai uses properties instead of functions for some expect checks.

import { GeoCoordinates, mercatorProjection } from "@flywave/flywave-geoutils";
import { expect } from "chai";
import sinon from "sinon";

import { TerrainAdaptedSubdivisionModifier } from "../src/TerrainAdaptedSubdivisionModifier";

class TestTerrainAdaptedSubdivisionModifier extends TerrainAdaptedSubdivisionModifier {
    private readonly elevationMap: Map<string, number>;

    constructor(interpolationDistance: number, elevationMap: Map<string, number>) {
        super(mercatorProjection, interpolationDistance);
        this.elevationMap = elevationMap;
    }

    protected getElevation(geoPoint: GeoCoordinates): number | undefined {
        const key = `${geoPoint.latitude.toFixed(6)},${geoPoint.longitude.toFixed(6)}`;
        return this.elevationMap.get(key);
    }
}

describe("TerrainAdaptedSubdivisionModifier", function () {
    it("updates elevation of all output points using elevation query", function () {
        // 创建一个简单的高程映射
        const elevationMap = new Map<string, number>();
        elevationMap.set("0.000000,0.000000", 150); // 起点高程150米（不同于输入的100米）
        elevationMap.set("0.000000,1.000000", 180); // 终点高程180米（不同于输入的200米）

        const modifier = new TestTerrainAdaptedSubdivisionModifier(10000, elevationMap); // 使用较大的插值距离以避免细分

        // 创建两个点的线段（初始高度会被高程查询结果覆盖）
        const points = [
            new GeoCoordinates(0, 0, 100), // 初始高度100米
            new GeoCoordinates(0, 1, 200) // 初始高度200米
        ];

        // 执行细分
        const result = modifier.modify(points);

        // 验证所有点都使用了通过高程查询获取的高度
        expect(result[0].altitude).to.equal(150); // 应该是150米，而不是初始的100米
        expect(result[result.length - 1].altitude).to.equal(180); // 应该是180米，而不是初始的200米
    });

    it("performs interpolation based on distance", function () {
        // 创建一个简单的高程映射
        const elevationMap = new Map<string, number>();
        elevationMap.set("0.000000,0.000000", 100); // 起点高程100米
        elevationMap.set("0.000000,1.000000", 200); // 终点高程200米

        // 使用较小的插值距离以确保细分
        const modifier = new TestTerrainAdaptedSubdivisionModifier(50000, elevationMap); // 50公里插值间隔

        // 创建两个点的线段，距离约111公里
        const points = [new GeoCoordinates(0, 0, 100), new GeoCoordinates(0, 1, 200)];

        // 执行细分
        const result = modifier.modify(points);

        // 验证确实进行了插值（结果点数应该大于2）
        expect(result.length).to.be.greaterThan(2);

        // 验证所有点都使用了通过高程查询获取的高度
        for (const point of result) {
            expect(point.altitude).to.not.be.undefined;
        }

        // 验证起点和终点的高程
        expect(result[0].altitude).to.equal(100);
        expect(result[result.length - 1].altitude).to.equal(200);
    });

    it("handles points without initial elevation", function () {
        // 创建一个简单的高程映射
        const elevationMap = new Map<string, number>();
        elevationMap.set("0.000000,0.000000", 100); // 起点高程100米
        elevationMap.set("0.000000,1.000000", 200); // 终点高程200米

        const modifier = new TestTerrainAdaptedSubdivisionModifier(10000, elevationMap);

        // 创建两个没有初始高程的点
        const points = [
            new GeoCoordinates(0, 0), // 没有高程
            new GeoCoordinates(0, 1) // 没有高程
        ];

        // 执行细分
        const result = modifier.modify(points);

        // 验证所有点都使用了通过高程查询获取的高度
        expect(result[0].altitude).to.equal(100);
        expect(result[result.length - 1].altitude).to.equal(200);
    });

    it("calls progress callback", function () {
        // 创建一个简单的高程映射
        const elevationMap = new Map<string, number>();
        elevationMap.set("0.000000,0.000000", 100);
        elevationMap.set("0.000000,1.000000", 200);

        const modifier = new TestTerrainAdaptedSubdivisionModifier(10000, elevationMap);

        // 创建两个点的线段
        const points = [new GeoCoordinates(0, 0, 100), new GeoCoordinates(0, 1, 200)];

        // 创建进度回调的间谍
        const progressCallback = sinon.spy();

        // 执行细分
        modifier.modify(points, progressCallback);

        // 验证进度回调被调用
        expect(progressCallback.called).to.be.true;
    });
});
