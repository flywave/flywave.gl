/* Copyright (C) 2025 flywave.gl contributors */

import { type Projection, GeoCoordinates } from "@flywave/flywave-geoutils";
import { Vector3 } from "three";

/**
 * 简单的距离插值细分器
 *
 * 该类实现了基于固定距离间隔的简单插值算法，
 * 不再考虑高程差异，仅根据调节参数控制插值密度。
 */
export abstract class TerrainAdaptedSubdivisionModifier {
    private readonly elevationCache: Map<string, number>;

    /**
     * 构造函数
     *
     * @param projection 投影对象
     * @param interpolationDistance 插值距离（米），控制每隔多少米进行一次插值
     * @param cacheSize 高程缓存大小，默认为500个点（减少内存使用）
     */
    constructor(
        readonly projection: Projection,
        readonly interpolationDistance: number = 100, // 默认每隔100米插值一次
        readonly cacheSize: number = 500 // 减少缓存大小以节省内存
    ) {
        this.elevationCache = new Map();
    }

    /**
     * 对GeoCoordinates线进行距离插值细分
     *
     * @param geoPoints 地理坐标点数组（线）
     * @param progressCallback 可选进度回调函数
     * @returns 细分后的地理坐标点数组
     */
    modify(
        geoPoints: GeoCoordinates[],
        progressCallback?: (progress: number) => void
    ): GeoCoordinates[] {
        if (geoPoints.length < 2) {
            return [...geoPoints];
        }

        // 清空缓存
        this.elevationCache.clear();

        const result: GeoCoordinates[] = [];

        // 处理每条线段，但保持原始点的顺序
        for (let i = 0; i < geoPoints.length - 1; i++) {
            const startGeo = geoPoints[i];
            const endGeo = geoPoints[i + 1];

            // 使用插值方法细分这条线段
            const segmentPoints = this.interpolateSegment(startGeo, endGeo);

            // 添加细分后的点到结果中
            if (i === 0) {
                // 第一个线段添加所有点
                result.push(...segmentPoints);
            } else {
                // 后续线段跳过第一个点（因为与前一个线段的最后一个点重复）
                result.push(...segmentPoints.slice(1));
            }

            // 报告进度
            if (progressCallback) {
                progressCallback((i + 1) / (geoPoints.length - 1));
            }
        }

        return result;
    }

    /**
     * 对GeoCoordinates线进行距离插值细分，并返回原始点的索引映射
     *
     * @param geoPoints 地理坐标点数组（线）
     * @param progressCallback 可选进度回调函数
     * @returns 细分后的地理坐标点数组和原始点索引映射
     */
    modifyWithIndexMapping(
        geoPoints: GeoCoordinates[],
        progressCallback?: (progress: number) => void
    ): { points: GeoCoordinates[]; originalIndices: number[] } {
        if (geoPoints.length < 2) {
            return { points: [...geoPoints], originalIndices: geoPoints.map((_, i) => i) };
        }

        // 清空缓存
        this.elevationCache.clear();

        const result: GeoCoordinates[] = [];
        const originalIndices: number[] = [];
        const totalSegments = geoPoints.length - 1;

        // 处理每条线段
        for (let i = 0; i < totalSegments; i++) {
            const startGeo = geoPoints[i];
            const endGeo = geoPoints[i + 1];

            // 使用插值方法细分这条线段
            const segmentPoints = this.interpolateSegment(startGeo, endGeo);

            // 添加细分后的点到结果中
            if (i === 0) {
                // 第一个线段添加所有点
                result.push(...segmentPoints);
                // 为第一个点添加原始索引
                originalIndices.push(i);
                // 为中间插入的点添加-1表示它们是新插入的点
                for (let j = 1; j < segmentPoints.length; j++) {
                    originalIndices.push(-1);
                }
            } else {
                // 后续线段跳过第一个点（因为与前一个线段的最后一个点重复）
                result.push(...segmentPoints.slice(1));
                // 为中间插入的点添加-1表示它们是新插入的点
                for (let j = 1; j < segmentPoints.length; j++) {
                    originalIndices.push(-1);
                }
            }

            // 报告进度
            if (progressCallback) {
                progressCallback((i + 1) / totalSegments);
            }
        }

        // 为最后一个原始点添加索引
        originalIndices[originalIndices.length - 1] = geoPoints.length - 1;
        return { points: result, originalIndices };
    }

    /**
     * 对线段进行插值
     */
    private interpolateSegment(startGeo: GeoCoordinates, endGeo: GeoCoordinates): GeoCoordinates[] {
        // 获取端点的高程（使用缓存）
        const startElevation = this.getElevationWithCache(startGeo) || 0;
        const endElevation = this.getElevationWithCache(endGeo) || 0;

        // 计算两点之间的水平距离（米）
        const horizontalDistance = this.calculateHorizontalDistance(startGeo, endGeo);

        // 如果距离小于插值距离，则直接返回端点
        if (horizontalDistance <= this.interpolationDistance) {
            const startWithElevation = new GeoCoordinates(
                startGeo.latitude,
                startGeo.longitude,
                startElevation
            );
            const endWithElevation = new GeoCoordinates(
                endGeo.latitude,
                endGeo.longitude,
                endElevation
            );
            return [startWithElevation, endWithElevation];
        }

        // 计算需要插入的点数
        const numSegments = Math.ceil(horizontalDistance / this.interpolationDistance);
        const result: GeoCoordinates[] = [];

        // 添加起始点
        result.push(new GeoCoordinates(startGeo.latitude, startGeo.longitude, startElevation));

        // 插入中间点
        for (let i = 1; i < numSegments; i++) {
            const t = i / numSegments;
            const interpolatedGeo = this.interpolateGeoCoordinates(startGeo, endGeo, t);
            const interpolatedElevation = startElevation + (endElevation - startElevation) * t;
            result.push(
                new GeoCoordinates(
                    interpolatedGeo.latitude,
                    interpolatedGeo.longitude,
                    interpolatedElevation
                )
            );
        }

        // 添加结束点
        result.push(new GeoCoordinates(endGeo.latitude, endGeo.longitude, endElevation));

        return result;
    }

    /**
     * 带缓存的高程获取方法
     */
    private getElevationWithCache(geoPoint: GeoCoordinates): number | undefined {
        const key = `${geoPoint.latitude.toFixed(6)},${geoPoint.longitude.toFixed(6)}`;

        // 检查缓存
        if (this.elevationCache.has(key)) {
            return this.elevationCache.get(key);
        }

        // 调用抽象方法获取高程
        const elevation = this.getElevation(geoPoint);

        // 更新缓存（如果缓存已满，删除最早的一项）
        if (this.elevationCache.size >= this.cacheSize) {
            const firstKey = this.elevationCache.keys().next().value;
            if (firstKey) {
                this.elevationCache.delete(firstKey);
            }
        }

        // 将结果存入缓存
        if (elevation !== undefined) {
            this.elevationCache.set(key, elevation);
        }

        return elevation;
    }

    /**
     * 在两个地理坐标之间进行插值
     * @param start 起始地理坐标
     * @param end 结束地理坐标
     * @param t 插值因子 (0-1)
     * @returns 插值后的地理坐标
     */
    private interpolateGeoCoordinates(
        start: GeoCoordinates,
        end: GeoCoordinates,
        t: number
    ): GeoCoordinates {
        // 简单的线性插值
        const lat = start.latitude + (end.latitude - start.latitude) * t;
        const lon = start.longitude + (end.longitude - start.longitude) * t;
        return new GeoCoordinates(lat, lon);
    }

    /**
     * 计算两个地理坐标点之间的水平距离（米）
     * @param start 起始地理坐标
     * @param end 结束地理坐标
     * @returns 水平距离（米）
     */
    protected calculateHorizontalDistance(start: GeoCoordinates, end: GeoCoordinates): number {
        // 将地理坐标转换为世界坐标
        const startWorld = this.projection.projectPoint(start);
        const endWorld = this.projection.projectPoint(end);

        // 计算水平距离（忽略Z轴）
        const dx = endWorld.x - startWorld.x;
        const dy = endWorld.y - startWorld.y;
        return Math.sqrt(dx * dx + dy * dy);
    }

    /**
     * 清除高程缓存
     */
    clearCache(): void {
        this.elevationCache.clear();
    }

    /**
     * 获取当前缓存大小
     */
    getCacheSize(): number {
        return this.elevationCache.size;
    }

    /**
     * 抽象方法，子类需要实现高程获取逻辑
     * @param geoPoint 地理坐标
     * @returns 海拔高度（米）
     */
    protected abstract getElevation(geoPoint: GeoCoordinates): number | undefined;
}
