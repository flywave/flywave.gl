/* Copyright (C) 2025 flywave.gl contributors */

//    Mocha discourages using arrow functions, see https://mochajs.org/#arrow-functions
//    Chai uses properties instead of functions for some expect checks.

import { GeoCoordinates, mercatorProjection } from "@flywave/flywave-geoutils";
import { expect } from "chai";

import { TerrainAdaptedSubdivisionModifier } from "../src/TerrainAdaptedSubdivisionModifier";

class TestDistanceInterpolationModifier extends TerrainAdaptedSubdivisionModifier {
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

describe("DistanceInterpolationTest", function () {
    it("performs interpolation for long distances with small elevation differences", function () {
        // 创建一个高程映射
        const elevationMap = new Map<string, number>();
        elevationMap.set("0.000000,0.000000", 100); // 起点高程100米
        elevationMap.set("0.000000,2.000000", 105); // 终点高程105米（只有5米高差）

        // 设置插值距离为50公里
        const modifier = new TestDistanceInterpolationModifier(50000, elevationMap); // 50公里插值间隔

        // 创建两个点的线段，距离较远但高程差较小
        const startPoint = new GeoCoordinates(0, 0, 100);
        const endPoint = new GeoCoordinates(0, 2, 105); // 纬度差2度，约222公里

        const points = [startPoint, endPoint];

        // 执行插值
        const result = modifier.modify(points);

        // 验证确实进行了插值（结果点数应该大于2）
        expect(result.length).to.be.greaterThan(2);

        // 验证所有点都使用了通过高程查询获取的高度
        for (const point of result) {
            expect(point.altitude).to.not.be.undefined;
        }

        // 验证起点和终点的高程
        expect(result[0].altitude).to.equal(100);
        expect(result[result.length - 1].altitude).to.equal(105);
    });
});
