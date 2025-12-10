/* Copyright (C) 2025 flywave.gl contributors */

import kriging from "../kriging.js/kriging.js";
import { type KrigingTrainOptions } from "../types";
import { type VariogramData, Variogram } from "./Variogram";

export class KrigingCore {
    static train(
        values: number[],
        x: number[],
        y: number[],
        options: KrigingTrainOptions
    ): Variogram {
        const { model, sigma2 = 0, alpha = 100 } = options;

        const variogramData = kriging.train(values, x, y, model, sigma2, alpha);
        return new Variogram(variogramData as VariogramData, model);
    }

    static predict(x: number, y: number, variogram: Variogram): number {
        return kriging.predict(x, y, variogram.data);
    }

    static variance(x: number, y: number, variogram: Variogram): number {
        return kriging.variance(x, y, variogram.data);
    }

    /**
     * 生成网格预测（CPU版本，用于对比验证）
     */
    static grid(
        variogram: Variogram,
        bounds: [number, number, number, number],
        width: number
    ): number[][] {
        return kriging.grid(variogram.data, bounds, width);
    }
}
