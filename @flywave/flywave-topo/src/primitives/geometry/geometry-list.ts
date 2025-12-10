/* Copyright (C) 2025 flywave.gl contributors */



import { QParams3d } from "../../common";
import { Range3d } from "../../core-geometry";
import { type Geometry } from "./geometry-primitives";

export class GeometryList {
    private readonly _list: Geometry[] = [];

    public get first(): Geometry | undefined {
        return this._list[0];
    }

    public get isEmpty(): boolean {
        return this._list.length === 0;
    }

    public get length(): number {
        return this._list.length;
    }

    public push(geom: Geometry): number {
        return this._list.push(geom);
    }

    public append(src: GeometryList): this {
        this._list.push(...src._list);
        return this;
    }

    public clear(): void {
        this._list.length = 0;
    }

    public computeRange(): Range3d {
        const range: Range3d = Range3d.createNull();
        const extendRange = (geom: Geometry) => {
            range.extendRange(geom.tileRange);
        };
        this._list.forEach(extendRange);
        return range;
    }

    public computeQuantizationParams(): QParams3d {
        return QParams3d.fromRange(this.computeRange());
    }

    public [Symbol.iterator]() {
        return this._list[Symbol.iterator]();
    }
}
