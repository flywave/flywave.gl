/* Copyright (C) 2025 flywave.gl contributors */

export type KrigingModel = "gaussian" | "exponential" | "spherical";
export type DEMEncoding = "mapbox" | "terrarium";

export interface KrigingTrainOptions {
    model: KrigingModel;
    sigma2?: number;
    alpha?: number;
}

export interface KrigingPredictOptions {
    encoding?: DEMEncoding;
}

export interface Bounds {
    minX: number;
    minY: number;
    maxX: number;
    maxY: number;
}

export interface Grid {
    width: number;
    height: number;
    cellSize: number;
    bounds: Bounds;
}
