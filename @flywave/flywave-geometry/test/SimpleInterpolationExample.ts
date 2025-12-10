/* Copyright (C) 2025 flywave.gl contributors */

// 简单插值算法使用示例

import { GeoCoordinates, mercatorProjection } from "@flywave/flywave-geoutils";

import { TerrainAdaptedSubdivisionModifier } from "../src/TerrainAdaptedSubdivisionModifier";

// 创建一个简单的实现类
class SimpleInterpolationModifier extends TerrainAdaptedSubdivisionModifier {
    constructor(interpolationDistance: number) {
        super(mercatorProjection, interpolationDistance);
    }

    // 简单的高程获取实现（在实际应用中，这里会从地形数据源获取高程）
    protected getElevation(geoPoint: GeoCoordinates): number | undefined {
        // 这里可以实现从实际地形数据源获取高程的逻辑
        // 为了示例简单，我们返回一个固定值
        return 100;
    }
}

// 使用示例
function example() {
    // 创建插值器，每隔50米插值一次
    const interpolator = new SimpleInterpolationModifier(50);

    // 创建两个点的线段
    const points = [
        new GeoCoordinates(0, 0, 100), // 起点
        new GeoCoordinates(0, 0.001, 100) // 终点（约111米远）
    ];

    console.log("原始点数:", points.length);

    // 执行插值
    const result = interpolator.modify(points);

    console.log("插值后点数:", result.length);
    console.log("插值点坐标:");
    result.forEach((point, index) => {
        console.log(`  ${index}: (${point.latitude}, ${point.longitude}, ${point.altitude})`);
    });
}

// 运行示例
example();
