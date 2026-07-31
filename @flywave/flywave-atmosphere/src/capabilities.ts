/* Copyright (C) 2025 flywave.gl contributors */

import { WebGLBackend, type Renderer } from "three/webgpu";

export function isFloatLinearSupported(renderer: Renderer): boolean {
    const backend = renderer.backend;
    if (backend instanceof WebGLBackend) {
        const context = (
            backend as unknown as { getContext?: () => WebGL2RenderingContext }
        ).getContext?.();
        return context?.getExtension?.("OES_texture_float_linear") != null;
    }
    return (
        (backend as unknown as { hasFeature?: (name: string) => boolean }).hasFeature?.(
            "float32-filterable"
        ) ?? false
    );
}
