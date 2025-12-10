/* Copyright (C) 2025 flywave.gl contributors */

import { type WebGLRenderer, type WebGLRenderTarget } from "three";

import { KrigingCore } from "./core/KrigingCore";
import { type Variogram } from "./core/Variogram";
import type { Bounds, DEMEncoding, Grid, KrigingModel } from "./types";
import { KrigingRenderer } from "./webgl/KrigingRenderer";

export class Kriging {
    /**
     * 训练变差函数模型
     */
    static train(
        values: number[],
        x: number[],
        y: number[],
        model: KrigingModel,
        sigma2: number = 0,
        alpha: number = 100
    ): Variogram {
        return KrigingCore.train(values, x, y, { model, sigma2, alpha });
    }

    /**
     * 在指定位置进行预测
     */
    static predict(x: number, y: number, variogram: Variogram): number {
        return KrigingCore.predict(x, y, variogram);
    }

    /**
     * 计算预测方差
     */
    static variance(x: number, y: number, variogram: Variogram): number {
        return KrigingCore.variance(x, y, variogram);
    }

    /**
     * 生成网格预测（CPU版本）
     */
    static grid(
        variogram: Variogram,
        bounds: [number, number, number, number],
        width: number
    ): number[][] {
        return KrigingCore.grid(variogram, bounds, width);
    }

    /**
     * 生成DEM图像数据（WebGL加速版本）
     */
    static dem(
        variogram: Variogram,
        bounds: Bounds,
        width: number,
        height: number,
        encoding: DEMEncoding = "mapbox",
        renderer: WebGLRenderer
    ): WebGLRenderTarget {
        const cellSizeX = (bounds.maxX - bounds.minX) / width;
        const cellSizeY = (bounds.maxY - bounds.minY) / height;
        const cellSize = Math.max(cellSizeX, cellSizeY);

        const grid: Grid = {
            width,
            height,
            cellSize,
            bounds
        };

        const render = new KrigingRenderer(renderer);

        render.setVariogram(variogram);
        const renderTarget = render.renderDEM(grid, encoding);
        return renderTarget;
    }

    static demPixels(
        variogram: Variogram,
        bounds: Bounds,
        width: number,
        height: number,
        encoding: DEMEncoding = "mapbox",
        renderer: WebGLRenderer
    ): Uint8Array {
        const cellSizeX = (bounds.maxX - bounds.minX) / width;
        const cellSizeY = (bounds.maxY - bounds.minY) / height;
        const cellSize = Math.max(cellSizeX, cellSizeY);

        const grid: Grid = {
            width,
            height,
            cellSize,
            bounds
        };

        const render = new KrigingRenderer(renderer);

        render.setVariogram(variogram);
        const renderTarget = render.renderDEM(grid, encoding);
        return render.readPixels(renderTarget);
    }
}

// 导出类型
export type { KrigingModel, DEMEncoding, Bounds, Grid } from "./types";
export { Variogram } from "./core/Variogram";

// 默认导出以保持向后兼容性
export default Kriging;
