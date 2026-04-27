import { type ColorIndex } from "../common";
import { IndexMap } from "../utils";
export declare class ColorMap extends IndexMap<number> {
    private _hasTransparency;
    constructor();
    hasColor(color: number): boolean;
    insert(color: number): number;
    get hasTransparency(): boolean;
    get isUniform(): boolean;
    toColorIndex(index: ColorIndex, indices: number[]): void;
    private static isTranslucent;
}
