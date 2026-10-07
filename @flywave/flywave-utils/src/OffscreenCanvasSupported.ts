/* Copyright (C) 2025 flywave.gl contributors */

let supportsOffscreenCanvas: boolean | null = null;

// Extended Window type declaration
declare global {
    interface Window {
        OffscreenCanvas?: typeof OffscreenCanvas;
        createImageBitmap?: typeof createImageBitmap;
    }
}

export function offscreenCanvasSupported(): boolean {
    if (supportsOffscreenCanvas === null) {
        supportsOffscreenCanvas = Boolean(
            typeof window !== "undefined" &&
                window.OffscreenCanvas &&
                new window.OffscreenCanvas(1, 1).getContext("2d") &&
                typeof window.createImageBitmap === "function"
        );
    }
    return supportsOffscreenCanvas;
}
