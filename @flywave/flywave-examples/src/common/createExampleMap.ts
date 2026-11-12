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
    /**
     * Maximum zoom level the view accepts. The engine default is 20, which on a
     * flat (mercator) projection corresponds to a camera height of about 20 m —
     * too far to inspect a ground-level detail layer. Passed straight to
     * `MapViewOptions.maxZoomLevel`.
     */
    maxZoomLevel?: number;
    /**
     * Minimum camera height above the ground in meters. The engine default is
     * 20. Note the camera *altitude* is clamped, so at high tilt this also caps
     * how far you can pitch down towards the surface.
     */
    minCameraHeight?: number;
    /** Enable shadow casting. @default false */
    enableShadows?: boolean;
    /**
     * Sun-shadow cascade count (constructor-time). Passed straight to
     * `MapViewOptions.shadowCascades`; ignored unless shadows are enabled.
     */
    shadowCascades?: number;
    /** Sun-shadow map size per cascade (constructor-time). */
    shadowMapSize?: number;
    /** Sun-shadow filter; `"pcf-soft"` (default) or the cheaper `"pcf"`. */
    shadowFilter?: "pcf" | "pcf-soft";
    /** Maximum sun-shadow distance in metres; `0` means automatic. */
    shadowMaxDistance?: number;
    /**
     * Add the engine's BackgroundDataSource (per-tile ground plane colored by
     * the theme clearColor). Off by default in the engine; vector basemaps
     * whose data has no land polygons (e.g. OpenMapTiles) need it, otherwise
     * the sky shows through wherever no fill is drawn.
     * @default false
     */
    addBackgroundDatasource?: boolean;
    /**
     * Keep the theme's inherited lights on globe scenes. By default the
     * factory clears them on globes (the atmosphere sun provides physically
     * based lighting; inherited ambient/directional lights double-light the
     * scene). Set `true` for atmosphere-less globes that need flat lighting.
     * @default false
     */
    keepThemeLights?: boolean;
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
        addBackgroundDatasource: options.addBackgroundDatasource === true,
        enableStatistics: true,
        theme: options.themeObject ?? options.theme
    };
    if (options.maxZoomLevel !== undefined) {
        mapViewOptions.maxZoomLevel = options.maxZoomLevel;
    }
    if (options.minCameraHeight !== undefined) {
        mapViewOptions.minCameraHeight = options.minCameraHeight;
    }
    if (options.shadowCascades !== undefined) {
        mapViewOptions.shadowCascades = options.shadowCascades;
    }
    if (options.shadowMapSize !== undefined) {
        mapViewOptions.shadowMapSize = options.shadowMapSize;
    }
    if (options.shadowFilter !== undefined) {
        mapViewOptions.shadowFilter = options.shadowFilter;
    }
    if (options.shadowMaxDistance !== undefined) {
        mapViewOptions.shadowMaxDistance = options.shadowMaxDistance;
    }
    // Debug hook: `?lodpixel=<px>` tunes the mixed-LOD subdivision granularity (default 256).
    // Lower values refine distant tiles further, matching Cesium-style screen-space error.
    const lodPixelParam = Number(new URLSearchParams(window.location.search).get("lodpixel"));
    if (Number.isFinite(lodPixelParam) && lodPixelParam > 0) {
        mapViewOptions.lodMinTilePixelSize = lodPixelParam;
    }
    // Debug hook: `?uniformcoalesce=0|1` forces the per-object uniform upload
    // coalescer off/on (default is on; omit the param to keep the default).
    const uniformCoalesceParam = new URLSearchParams(window.location.search).get("uniformcoalesce");
    if (uniformCoalesceParam === "0") {
        mapViewOptions.uniformCoalescing = false;
    } else if (uniformCoalesceParam === "1") {
        mapViewOptions.uniformCoalescing = true;
    }
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
        await applyGlobeLightingRule(mapView, options);
        options.onReady?.(mapView);
    } catch (err) {
        onError(err instanceof Error ? err : new Error(String(err)));
    }

    // Debug handle for browser-console tooling (engine debugging, harness scripts).
    (window as any).__flywave = { mapView, controls, dispose };

    return { mapView, controls, dispose };
}

/**
 * Lighting rule for globe scenes: with the physical atmosphere enabled, the
 * atmosphere sun provides the lighting and any inherited theme lights
 * (ambient/directional from the tilezen base themes) are redundant — they
 * double-light the scene and wash out draped imagery. Clear them.
 *
 * Planar scenes and atmosphere-less globes keep their theme lights: without
 * the atmosphere there is no sun, and a scene without lights renders black.
 *
 * Opt out with {@link ExampleMapOptions.keepThemeLights}.
 */
async function applyGlobeLightingRule(mapView: MapView, options: ExampleMapOptions): Promise<void> {
    const isGlobe = (options.projection ?? "globe") === "globe";
    if (options.keepThemeLights === true || !isGlobe) {
        return;
    }
    // getTheme() awaits the theme load; patchTheme throws before it.
    await mapView.getTheme();
    mapView.patchTheme({ lights: [] });
    mapView.update();
}
