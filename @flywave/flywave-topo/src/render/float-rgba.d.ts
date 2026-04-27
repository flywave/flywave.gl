import { type RgbColor, ColorDef } from "../common";
export declare abstract class FloatColor {
    protected readonly _components: Float32Array;
    private _tbgr;
    protected constructor(numComponents: number);
    protected abstract maskTbgr(tbgr: number): number;
    protected abstract setComponents(r: number, g: number, b: number, a: number): void;
    get red(): number;
    get green(): number;
    get blue(): number;
    get tbgr(): number;
    get isWhite(): boolean;
    setColorDef(def: ColorDef): void;
    setRgbColor(rgb: RgbColor): void;
    setTbgr(tbgr: number): void;
    protected setRgbComponents(r: number, g: number, b: number): void;
    protected setRgbaComponents(r: number, g: number, b: number, a: number): void;
}
export declare class FloatRgb extends FloatColor {
    constructor();
    protected maskTbgr(tbgr: number): number;
    protected setComponents(r: number, g: number, b: number, _a: number): void;
    set(r: number, g: number, b: number): void;
    static fromColorDef(def: ColorDef): FloatRgb;
    static fromRgbColor(rgb: RgbColor): FloatRgb;
    static from(r: number, g: number, b: number): FloatRgb;
    static fromTbgr(tbgr: number): FloatRgb;
}
export declare class FloatRgba extends FloatColor {
    constructor();
    protected maskTbgr(tbgr: number): number;
    protected setComponents(r: number, g: number, b: number, a: number): void;
    set(r: number, g: number, b: number, a: number): void;
    array(): Float32Array;
    get alpha(): number;
    set alpha(alpha: number);
    get hasTranslucency(): boolean;
    static fromColorDef(def: ColorDef): FloatRgba;
    static fromTbgr(tbgr: number): FloatRgba;
    static from(r: number, g: number, b: number, a: number): FloatRgba;
    clone(out?: FloatRgba): FloatRgba;
}
