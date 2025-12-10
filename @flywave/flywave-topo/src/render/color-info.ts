/* Copyright (C) 2025 flywave.gl contributors */



import { type ColorDef, type ColorIndex } from "../common";
import { type VertexTable } from "../common/render/primitives/vertex-table";
import { assert } from "../utils";
import { FloatRgba } from "./float-rgba";

export class ColorInfo {
    private readonly _uniform?: FloatRgba;
    public readonly hasTranslucency: boolean;

    private constructor(hasTranslucency: boolean, uniform?: FloatRgba) {
        this.hasTranslucency = hasTranslucency;
        this._uniform = uniform;
    }

    public static createUniform(color: FloatRgba) {
        return new ColorInfo(color.hasTranslucency, color);
    }

    public static createNonUniform(hasTranslucency: boolean) {
        return hasTranslucency ? this._nonUniformTranslucent : this._nonUniformOpaque;
    }

    public static createFromColorDef(color: ColorDef) {
        return this.createUniform(FloatRgba.fromColorDef(color));
    }

    public static createFromColorIndex(colorIndex: ColorIndex) {
        return undefined !== colorIndex.uniform
            ? this.createFromColorDef(colorIndex.uniform)
            : this.createNonUniform(colorIndex.hasAlpha);
    }

    public static createFromVertexTable(vt: VertexTable) {
        return undefined !== vt.uniformColor
            ? this.createFromColorDef(vt.uniformColor)
            : this.createNonUniform(vt.hasTranslucency);
    }

    public get isUniform() {
        return undefined !== this._uniform;
    }

    public get isNonUniform() {
        return !this.isUniform;
    }

    public get uniform(): FloatRgba {
        assert(this.isUniform);
        return this._uniform!;
    }

    public get colors(): Float32Array {
        return this._uniform.array();
    }

    private static readonly _nonUniformTranslucent = new ColorInfo(true);
    private static readonly _nonUniformOpaque = new ColorInfo(false);
}
