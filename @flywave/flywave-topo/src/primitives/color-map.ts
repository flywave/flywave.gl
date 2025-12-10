/* Copyright (C) 2025 flywave.gl contributors */



import { type ColorIndex, ColorDef } from "../common";
import { assert, compareNumbers, IndexMap } from "../utils";

export class ColorMap extends IndexMap<number> {
    private _hasTransparency: boolean = false;

    public constructor() {
        super(compareNumbers, 0xffff);
    }

    public hasColor(color: number): boolean {
        return this.indexOf(color) !== -1;
    }

    public override insert(color: number): number {
        if (this.isEmpty) this._hasTransparency = ColorMap.isTranslucent(color);
        else assert(ColorMap.isTranslucent(color) === this.hasTransparency);

        return super.insert(color);
    }

    public get hasTransparency(): boolean {
        return this._hasTransparency;
    }

    public get isUniform(): boolean {
        return this.length === 1;
    }

    public toColorIndex(index: ColorIndex, indices: number[]): void {
        index.reset();
        if (this.length === 0) {
            assert(false, "empty color map");
            return;
        } else if (this.length === 1) {
            index.initUniform(this._array[0].value);
        } else {
            const colors = new Uint32Array(this.length);
            for (const entry of this._array) colors[entry.index] = entry.value;

            index.initNonUniform(colors, indices, this.hasTransparency);
        }
    }

    private static isTranslucent(tbgr: number) {
        return !ColorDef.isOpaque(tbgr);
    }
}
