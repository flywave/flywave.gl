import { ColorDef } from "./color-def";
export declare enum HSVConstants {
    VISIBILITY_GOAL = 40,
    HSV_SATURATION_WEIGHT = 4,
    HSV_VALUE_WEIGHT = 2
}
export declare class HSVColor {
    /** Hue */
    readonly h: number;
    /** Saturation */
    readonly s: number;
    /** Value */
    readonly v: number;
    constructor(hue?: number, saturation?: number, value?: number);
    clone(hue?: number, saturation?: number, value?: number): HSVColor;
    toColorDef(transparency?: number): ColorDef;
    static fromColorDef(val: ColorDef): HSVColor;
    adjusted(darkenColor: boolean, delta: number): HSVColor;
}
