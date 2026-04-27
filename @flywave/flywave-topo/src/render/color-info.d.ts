import { type ColorDef, type ColorIndex } from "../common";
import { type VertexTable } from "../common/render/primitives/vertex-table";
import { FloatRgba } from "./float-rgba";
export declare class ColorInfo {
    private readonly _uniform?;
    readonly hasTranslucency: boolean;
    private constructor();
    static createUniform(color: FloatRgba): ColorInfo;
    static createNonUniform(hasTranslucency: boolean): ColorInfo;
    static createFromColorDef(color: ColorDef): ColorInfo;
    static createFromColorIndex(colorIndex: ColorIndex): ColorInfo;
    static createFromVertexTable(vt: VertexTable): ColorInfo;
    get isUniform(): boolean;
    get isNonUniform(): boolean;
    get uniform(): FloatRgba;
    get colors(): Float32Array;
    private static readonly _nonUniformTranslucent;
    private static readonly _nonUniformOpaque;
}
