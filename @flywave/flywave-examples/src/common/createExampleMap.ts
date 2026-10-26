/* Copyright (C) 2025 flywave.gl contributors */

import {
    type FlatTheme,
    type ILogger,
    type MapViewOptions,
    type Projection,
    type Theme,
    ellipsoidProjection,
    equirectangularProjection,
    GeoCoordinates,
    LoggerManager,
    MapControls,
    MapControlsUI,
    MapView,
    mercatorProjection
} from "@flywave/flywave.gl";

import { shouldForceWebGL } from "../common-webgl-debug";

const logger: ILogger = LoggerManager.instance.create("flywave-examples/createExampleMap");

/**
 * Map projection preset accepted by {@link createExampleMap}.
 */
export type ExampleProjection = "globe" | "mercator" | "equirectangular";

/**
 * Initial camera pose, expressed in geo terms and mapped onto the
 * `MapView` constructor's `LookAtParams`.
 */
export interface IExampleLookAt {
    /** Initial target point. */
    target?: { lat: number; lng: number; alt?: number };
    /** Camera distance to the target in world units (ignored when `zoomLevel` is set). */
    distance?: number;
    /** Tilt in degrees, 0 is top-down. */
    tilt?: number;
    /** Heading in degrees, clockwise, 0 is north-up. */
    heading?: number;
    /** Zoom level; takes precedence over `distance`. */
    zoomLevel?: number;
}

/**
 * Options for {@link createExampleMap}.
 */
export interface ExampleMapOptions {
    /** Theme JSON URL (e.g. a served `resources/...` path). */
    theme?: string;
    /** Inline theme object; takes precedence over {@link ExampleMapOptions.theme}. */
    themeObject?: Theme | FlatTheme;
    /** Projection preset. @default "globe" */
    projection?: ExampleProjection;
    /** Initial camera pose. */
    lookAt?: IExampleLookAt;
    /** Enable shadow casting. @default false */
    enableShadows?: boolean;
    /** Create {@link MapControls} bound to the view. @default true */
    controls?: boolean;
    /**
     * Controls overlay variant: `"full"` (zoom input + screenshot button),
     * `"compact"` (zoom display only) or `"none"`. @default "full"
     */
    controlsUi?: "full" | "compact" | "none";
    /** Called once `mapView.ready` resolved (WebGPU/WebGL backend initialized). */
    onReady?: (mapView: MapView) => void;
    /**
     * Error sink for setup and `ready` failures. The default implementation
     * overlays an error banner on the page and logs via `LoggerManager`.
     */
    onError?: (err: Error) => void;
}

/**
 * Handle returned by {@link createExampleMap}.
 */
export interface ExampleMapHandle {
    /** The created map view (already `ready`). */
    mapView: MapView;
    /** The created camera controls, when `options.controls` was not `false`. */
    controls?: MapControls;
    /**
     * Tear down the example: removes the window resize listener and the
     * controls overlay, destroys controls and disposes the map view.
     */
    dispose(): void;
}

/**
 * Map a {@link ExampleProjection} preset onto the engine's projection singletons.
 */
function resolveProjection(projection: ExampleProjection | undefined): Projection {
    switch (projection) {
        case "mercator":
            return mercatorProjection;
        case "equirectangular":
            return equirectangularProjection;
        case "globe":
        case undefined:
            return ellipsoidProjection;
        default:
            throw new Error(`Unknown projection preset: "${projection as string}"`);
    }
}

/**
 * Default error sink: overlay a banner on top of the map and log the error.
 */
function defaultOnError(err: Error): void {
    logger.error("Example map initialization failed:", err.message);
    if (typeof document === "undefined") {
        return;
    }
    const banner = document.createElement("div");
    banner.textContent = `Failed to initialize map: ${err.message}`;
    Object.assign(banner.style, {
        position: "absolute",
        left: "16px",
        top: "16px",
        maxWidth: "70%",
        padding: "10px 14px",
        background: "rgba(140, 20, 20, 0.9)",
        color: "#fff",
        font: "13px/1.4 sans-serif",
        borderRadius: "6px",
        zIndex: "1000",
        whiteSpace: "pre-wrap"
    } as CSSStyleDeclaration);
    (document.body ?? banner).appendChild(banner);
}

/**
 * Create a fully wired example map: `MapView` (with the WebGL fallback flag
 * from `?renderer=webgl`), `MapControls` plus overlay UI, and a window resize
 * hookup. Resolves only after `mapView.ready`, so it is safe to touch the
 * scene or the theme in `onReady`.
 *
 * @param canvas - The canvas element to render into (typically `#mapCanvas`).
 * @param options - Optional wiring, theme, camera and UI options.
 * @returns A handle with the ready `MapView` and a `dispose` teardown.
 */
export async function createExampleMap(
    canvas: HTMLElement,
    options: ExampleMapOptions = {}
): Promise<ExampleMapHandle> {
    const onError = options.onError ?? defaultOnError;
    if (!(canvas instanceof HTMLCanvasElement)) {
        throw new Error(
            "createExampleMap expects a <canvas> element (e.g. document.getElementById('mapCanvas'))"
        );
    }

    const lookAt = options.lookAt;
    const mapViewOptions: MapViewOptions = {
        canvas,
        forceWebGL: shouldForceWebGL(),
        projection: resolveProjection(options.projection),
        enableShadows: options.enableShadows === true,
        theme: options.themeObject ?? options.theme
    };
    if (lookAt?.target !== undefined) {
        mapViewOptions.target = new GeoCoordinates(
            lookAt.target.lat,
            lookAt.target.lng,
            lookAt.target.alt
        );
    }
    if (lookAt?.distance !== undefined) {
        mapViewOptions.distance = lookAt.distance;
    }
    if (lookAt?.zoomLevel !== undefined) {
        mapViewOptions.zoomLevel = lookAt.zoomLevel;
    }
    if (lookAt?.tilt !== undefined) {
        mapViewOptions.tilt = lookAt.tilt;
    }
    if (lookAt?.heading !== undefined) {
        mapViewOptions.heading = lookAt.heading;
    }

    // The aggregate package's MapView injects the assets uriResolver, which is
    // what makes relative "resources/..." theme and data URLs work.
    const mapView = new MapView(mapViewOptions);

    const useControls = options.controls !== false;
    const controls = useControls ? new MapControls(mapView) : undefined;
    const ui =
        controls !== undefined && options.controlsUi !== "none"
            ? new MapControlsUI(
                  controls,
                  options.controlsUi === "compact"
                      ? { zoomLevel: "show", screenshotButton: false }
                      : undefined
              )
            : undefined;
    if (ui !== undefined) {
        (canvas.parentElement ?? document.body).appendChild(ui.domElement);
    }

    // Belt-and-braces resize hookup: MapView already observes the canvas via a
    // ResizeObserver; this covers environments where only the window resizes.
    const onWindowResize = (): void => {
        mapView.resize(window.innerWidth, window.innerHeight);
    };
    window.addEventListener("resize", onWindowResize);

    const dispose = (): void => {
        window.removeEventListener("resize", onWindowResize);
        if (ui !== undefined) {
            ui.domElement.remove();
        }
        controls?.destroy();
        mapView.dispose();
    };

    try {
        await mapView.ready;
        options.onReady?.(mapView);
    } catch (err) {
        onError(err instanceof Error ? err : new Error(String(err)));
    }

    return { mapView, controls, dispose };
}
