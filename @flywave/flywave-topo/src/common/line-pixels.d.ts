/** Enumerates the available patterns for drawing patterned lines.
 * Each is a 32-bit pattern in which each bit specifies the on- or off-state of a pixel along the line. The pattern repeats along the length of the entire line.
 * @public
 * @extensions
 */
export declare enum LinePixels {
    /** A solid line. */
    Solid = 0,
    /** A solid line. */
    Code0 = 0,
    /** 1 lit pixel followed by 7 unlit pixels: =&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;=&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;= */
    Code1 = 2155905152,
    /** 5 lit pixels followed by 3 unlit pixels: =====&nbsp;&nbsp;&nbsp;=====&nbsp;&nbsp;&nbsp;===== */
    Code2 = 4177066232,
    /** 11 lit pixels followed by 5 unlit pixels: ===========&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;=========== */
    Code3 = 4292935648,
    /** 7 lit pixels followed by 4 unlit pixels followed by 1 lit pixel followed by 1 lit pixel: =======&nbsp;&nbsp;&nbsp;&nbsp;=&nbsp;&nbsp;&nbsp;&nbsp;=======&nbsp;&nbsp;&nbsp;&nbsp;= */
    Code4 = 4262526480,
    /** 3 lit pixels followed by 5 unlit pixels: ===&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;===&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;=== */
    Code5 = 3772834016,
    /** 5 lit pixels followed by 3 unlit followed by 1 lit followed by 3 unlit followed by 1 lit followed by 3 unlit: =====&nbsp;&nbsp;&nbsp;=&nbsp;&nbsp;&nbsp;=&nbsp;&nbsp;&nbsp;===== */
    Code6 = 4169726088,
    /** 8 lit pixels followed by 3 unlit followed by 2 lit followed by 3 unlit: ========&nbsp;&nbsp;&nbsp;==&nbsp;&nbsp;&nbsp;======== */
    Code7 = 4279828248,
    /** 2 lit pixels followed by 2 unlit pixels - default style for drawing hidden edges: ==&nbsp;&nbsp;==&nbsp;&nbsp;==&nbsp;&nbsp;== */
    HiddenLine = 3435973836,
    /** Barely visible - 1 lit pixel followed by 31 unlit pixels. */
    Invisible = 1,
    /** Indicates no valid line style or none specified, depending on context. */
    Invalid = -1
}
