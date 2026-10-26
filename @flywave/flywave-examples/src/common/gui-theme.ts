/* Copyright (C) 2025 flywave.gl contributors */

import { GUI } from "dat.gui";

/** Default width for example dat.GUI panels, in pixels. */
export const EXAMPLE_GUI_WIDTH = 300;

/**
 * Options for {@link applyPanelStyle}; every field optional.
 */
export interface IPanelStyleOptions {
    /** Stacking order. @default "100" */
    zIndex?: string;
    /** Panel background. @default "rgba(24, 26, 32, 0.85)" */
    background?: string;
    /** Corner radius. @default "8px" */
    borderRadius?: string;
}

/**
 * Create the standard dat.GUI instance for examples: fixed width, default
 * auto-placement (top right). Use `gui.addFolder` for titled sections;
 * dat.GUI 0.7 has no title API on the root GUI itself.
 */
export function createExampleGui(): GUI {
    return new GUI({ width: EXAMPLE_GUI_WIDTH });
}

/**
 * Apply the standard overlay panel look to an arbitrary DOM element
 * (dat.GUI root, custom legend, stats box, ...): translucent dark
 * background, rounded corners, above-the-map stacking.
 *
 * @param element - The element to style in place.
 * @param options - Overrides for the default look.
 */
export function applyPanelStyle(element: HTMLElement, options?: IPanelStyleOptions): void {
    element.style.background = options?.background ?? "rgba(24, 26, 32, 0.85)";
    element.style.borderRadius = options?.borderRadius ?? "8px";
    element.style.zIndex = options?.zIndex ?? "100";
}
