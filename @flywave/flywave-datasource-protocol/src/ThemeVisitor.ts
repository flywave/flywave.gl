/* Copyright (C) 2025 flywave.gl contributors */

import { isJsonExpr } from "./Expr";
import { type Style, type Theme } from "./Theme";

/**
 * The ThemeVisitor visits every style in the theme in a depth-first fashion.
 */
export class ThemeVisitor {
    constructor(readonly theme: Theme) {}
    /**
     * Applies a function to every style in the theme.
     *
     * @param visitFunc - Function to be called with `style` as an argument. Function should return
     *                  `true` to cancel visitation.
     * @returns `true` if function has finished prematurely.
     */
    visitStyles(visitFunc: (style: Style) => boolean): boolean {
        const visit = (style: Style): boolean => {
            if (isJsonExpr(style)) {
                return false;
            }
            if (visitFunc(style)) {
                return true;
            }
            return false;
        };
        if (this.theme.styles !== undefined) {
            for (const styleSetName in this.theme.styles) {
                if (this.theme.styles[styleSetName] !== undefined) {
                    for (const style of this.theme.styles[styleSetName]) {
                        if (visit(style)) {
                            return true;
                        }
                    }
                }
            }
        }
        return false;
    }
}
