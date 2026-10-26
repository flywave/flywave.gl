/* Copyright (C) 2025 flywave.gl contributors */

import { type ILogger, type MapView, LoggerManager } from "@flywave/flywave.gl";

export { shouldForceWebGL, installDebugErrorCapture } from "../common-webgl-debug";

const logger: ILogger = LoggerManager.instance.create("flywave-examples/debug");

/**
 * Report the render backend of a `MapView`. `MapView` always constructs a
 * `WebGPURenderer`; `forceWebGL` selects the renderer's WebGL2 backend, so
 * the backend is read off the renderer object rather than off the option.
 */
function renderBackendName(mapView: MapView): string {
    const backend = (mapView.renderer as unknown as { backend?: object }).backend;
    return backend !== undefined ? backend.constructor.name : "unknown";
}

/**
 * Log one line describing an example session: the example name, the render
 * backend and the active projection type. Meant to be called right after
 * `createExampleMap` (or `mapView.ready`) so the values are final.
 *
 * @param name - Short example name, e.g. `"getting-started-3dtiles"`.
 * @param mapView - The ready map view to introspect.
 */
export function logExampleInfo(name: string, mapView: MapView): void {
    logger.info(
        `Example "${name}": backend=${renderBackendName(mapView)}, ` +
            `projection=${mapView.projection.type}`
    );
}
