/* Copyright (C) 2025 flywave.gl contributors */

import * as React from "react";
import { MapView as RawMapView, MapViewOptions } from "@flywave/flywave.gl/native"; 
import {
    MapControls as RawMapControls,
    BaseMapControlsOptions
} from "@flywave/flywave.gl/native"; 

export * from "@flywave/flywave.gl/native"; 

function createCanvasAdapter(gl: WebGLRenderingContext): HTMLCanvasElement {
    const glContext = gl as { drawingBufferWidth: number; drawingBufferHeight: number };
    const canvas = {
        width: glContext.drawingBufferWidth,
        height: glContext.drawingBufferHeight,
        getContext: (_contextType: "webgl" | "webgl2") => gl,
        clientWidth: glContext.drawingBufferWidth,
        clientHeight: glContext.drawingBufferHeight
    } as unknown as HTMLCanvasElement;
    return canvas;
}

export class MapView extends RawMapView {
    constructor(gl: WebGLRenderingContext, options: Omit<MapViewOptions, "canvas">) {
        const canvas = createCanvasAdapter(gl);
        super({ ...options, canvas });
    }
}

export class MapControls extends RawMapControls {
    constructor(mapView: MapView, options?: BaseMapControlsOptions) {
        super(mapView, options);
    }

    public dispose(): void {
        super.destroy();
    }
}

export function GLView(props: {
    style?: React.CSSProperties;
    theme?: string | object;
    onContextCreate?: (gl: WebGLRenderingContext, mapView: MapView) => void;
}): React.JSX.Element {
    const { GLView } = require("expo-gl");

    const handleContextCreate = React.useCallback(
        (gl: WebGLRenderingContext) => {
            const mapView = new MapView(gl, { theme: props.theme });
            if (props.onContextCreate) {
                props.onContextCreate(gl, mapView);
            }
        },
        [props.theme, props.onContextCreate]
    );

    return React.createElement(GLView, {
        style: props.style,
        onContextCreate: handleContextCreate
    });
}
