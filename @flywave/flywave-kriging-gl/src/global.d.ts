/* Copyright (C) 2025 flywave.gl contributors */

// kriging.js 类型定义
declare module "kriging.js" {
    export interface VariogramData {
        t: number[];
        x: number[];
        y: number[];
        n: number;
        model: "gaussian" | "exponential" | "spherical";
        nugget: number;
        range: number;
        sill: number;
        A: number;
        K: number[];
        M: number[];
    }

    /**
     * 训练变差函数模型
     * @param t 观测值数组
     * @param x x坐标数组
     * @param y y坐标数组
     * @param model 变差函数模型
     * @param sigma2 噪声方差
     * @param alpha 正则化参数
     */
    export function train(
        t: number[],
        x: number[],
        y: number[],
        model: "gaussian" | "exponential" | "spherical",
        sigma2?: number,
        alpha?: number
    ): VariogramData;

    /**
     * 在指定位置进行预测
     * @param x x坐标
     * @param y y坐标
     * @param variogram 变差函数数据
     */
    export function predict(x: number, y: number, variogram: VariogramData): number;

    /**
     * 计算预测方差
     * @param x x坐标
     * @param y y坐标
     * @param variogram 变差函数数据
     */
    export function variance(x: number, y: number, variogram: VariogramData): number;

    /**
     * 生成网格预测
     * @param variogram 变差函数数据
     * @param bounds 边界 [xmin, ymin, xmax, ymax]
     * @param width 网格宽度
     * @param height 网格高度
     */
    export function grid(variogram: VariogramData, bounds: number[], width: number): number[][];

    /**
     * 绘制等值线
     * @param variogram 变差函数数据
     * @param bounds 边界 [xmin, ymin, xmax, ymax]
     * @param width 网格宽度
     * @param height 网格高度
     * @param levels 等值线级别
     */
    export function contour(
        variogram: VariogramData,
        bounds: number[],
        width: number,
        height: number,
        levels: number[]
    ): Array<Array<[number, number]>>;

    /**
     * 绘制等值线图
     * @param canvas HTMLCanvasElement
     * @param variogram 变差函数数据
     * @param bounds 边界 [xmin, ymin, xmax, ymax]
     * @param levels 等值线级别
     * @param colors 颜色数组
     */
    export function plot(
        canvas: HTMLCanvasElement,
        variogram: VariogramData,
        bounds: number[],
        levels: number[],
        colors: string[]
    ): void;

    /**
     * 绘制散点图
     * @param canvas HTMLCanvasElement
     * @param x x坐标数组
     * @param y y坐标数组
     * @param t 观测值数组
     * @param width 画布宽度
     * @param height 画布高度
     * @param colors 颜色数组
     */
    export function scatterplot(
        canvas: HTMLCanvasElement,
        x: number[],
        y: number[],
        t: number[],
        width: number,
        height: number,
        colors: string[]
    ): void;
}
