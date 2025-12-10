/* Copyright (C) 2025 flywave.gl contributors */

import { type KrigingModel } from "..";

export interface VariogramData {
    t: number[];
    x: number[];
    y: number[];
    n: number;
    model: KrigingModel;
    nugget: number;
    range: number;
    sill: number;
    A: number;
    K: number[];
    M: number[];
}

export class Variogram {
    public readonly data: VariogramData;

    constructor(data: VariogramData, private readonly model_?: KrigingModel) {
        this.data = data;
    }

    get n(): number {
        return this.data.n;
    }

    get model(): KrigingModel {
        return this.model_;
    }

    get nugget(): number {
        return this.data.nugget;
    }

    get range(): number {
        return this.data.range;
    }

    get sill(): number {
        return this.data.sill;
    }

    get A(): number {
        return this.data.A;
    }

    get params(): [number, number, number, number] {
        return [this.nugget, this.range, this.sill, this.A];
    }
}
