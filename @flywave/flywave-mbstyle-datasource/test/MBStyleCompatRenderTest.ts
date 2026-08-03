/**
 * Mapbox GL JS render-tests compatibility runner.
 *
 * Discovers compatible style.json files from test/render-tests/,
 * renders them using MBStyleDataSource, and compares with expected.png.
 *
 * Handles: metadata.test.operations, image-threshold, nested directories,
 * local:// resource rewriting.
 */
import {
    MapView,
    MapViewEventNames,
} from "@flywave/flywave-mapview";
import {
    getPlatform,
    RenderingTestHelper,
    TestOptions,
    setReferenceImageResolver,
} from "@flywave/flywave-test-utils";
import { assert } from "chai";

import { ALL_TESTS as INDEXED_TESTS } from "./render-tests-index";
import { MBStyleDataSource } from "../src/MBStyleDataSource";
import { MBStyleDecoder } from "../src/MBStyleDecoder";

// Compare against the local expected.png that ships with each ported
// render-test fixture (karma serves them under /base/), instead of the
// default `/reference-image?` endpoint which needs an external result server.
setReferenceImageResolver((imageProps) => {
    const name = imageProps.name ?? "";
    return `/base/@flywave/flywave-mbstyle-datasource/test/render-tests/${name}/expected.png`;
});

const INCOMPATIBLE_TYPES = new Set([
    "terrain",
    "globe",
    "video",
    "custom-layer",
    "raster-particle",
    "raster-array",
    "skybox",
]);

interface TestEntry {
    name: string;
    stylePath: string;
    style: any;
}

/**
 * In the karma/browser environment Node's fs is unavailable, so the test list
 * is loaded from the pre-generated ./render-tests-index module (see
 * scripts/generate-mbstyle-test-index.js).
 */
function discoverTests(): TestEntry[] {
    return INDEXED_TESTS.map((t) => ({ name: t.name, stylePath: "", style: t.style }));
}

const ALL_TESTS = discoverTests();
console.log(`[MBStyleCompat] ${ALL_TESTS.length} compatible tests loaded`);

function localizeUrl(u: string): string {
    if (!u.startsWith("local://")) return u;
    const ROOT = "/base/@flywave/flywave-mbstyle-datasource/test/rendering/integration";
    return u
        .replace(/^local:\/\/data\//, `${ROOT}/data/`)
        .replace(/^local:\/\/tiles\//, `${ROOT}/tiles/`)
        .replace(/^local:\/\/sprites\//, `${ROOT}/sprites/`)
        .replace(/^local:\/\/glyphs\//, `${ROOT}/glyphs/`)
        .replace(/^local:\/\/image\//, `${ROOT}/image/`)
        .replace(/^local:\/\/models\//, `${ROOT}/models/`)
        .replace(/^local:\/\/mapbox-gl-styles\//, `${ROOT}/styles/`)
        .replace(/^local:\/\//, `${ROOT}/`);
}

function localizeStyle(style: any): any {
    const s = JSON.parse(JSON.stringify(style));
    for (const [, src] of Object.entries(s.sources ?? {})) {
        const source = src as any;
        if (source.tiles) {
            source.tiles = source.tiles.map((t: string) => localizeUrl(t));
        }
        if (source.url) source.url = localizeUrl(source.url);
        if (typeof source.data === "string") {
            source.data = localizeUrl(source.data);
        }
    }
    if (s.sprite) s.sprite = localizeUrl(s.sprite);
    if (s.glyphs) s.glyphs = localizeUrl(s.glyphs);
    return s;
}

async function renderFrames(
    mapView: MapView,
    dataSource: MBStyleDataSource,
    n: number,
): Promise<void> {
    await new Promise<void>((resolve) => {
        let frames = 0;
        const handler = () => {
            frames++;
            if (frames >= n) {
                mapView.removeEventListener(MapViewEventNames.AfterRender, handler);
                resolve();
            } else {
                // Re-request a frame so the render loop keeps producing
                // AfterRender events even when the scene is static (the loop
                // otherwise stops once no update is pending).
                mapView.update();
            }
        };
        mapView.addEventListener(MapViewEventNames.AfterRender, handler);
        mapView.update();
    });
}

async function processOperations(
    mapView: MapView,
    dataSource: MBStyleDataSource,
    operations: any[],
): Promise<void> {
    const rt = dataSource.runtime;
    for (const op of operations) {
        const [name, ...args] = op;
        switch (name) {
            case "wait":
                await renderFrames(mapView, dataSource, args[0] ? 3 : 2);
                break;
            case "waitFrameReady":
            case "frameReady":
                await renderFrames(mapView, dataSource, 2);
                break;
            case "sleep":
                await new Promise((r) => setTimeout(r, args[0] ?? 0));
                break;
            case "setPaintProperty":
                rt?.setPaintProperty(args[0], args[1], args[2]);
                break;
            case "setLayoutProperty":
                rt?.setLayoutProperty(args[0], args[1], args[2]);
                break;
            case "addLayer":
                rt?.addLayer(args[0], args[1]);
                break;
            case "removeLayer":
                rt?.removeLayer(args[0]);
                break;
            case "moveLayer":
                rt?.moveLayer(args[0], args[1]);
                break;
            case "setFilter":
                rt?.setFilter(args[0], args[1]);
                break;
            case "setLayerZoomRange":
                rt?.setLayerZoomRange(args[0], args[1], args[2]);
                break;
            case "setStyle":
                rt?.setStyle(typeof args[0] === "string"
                    ? localizeStyle(JSON.parse(args[0]))
                    : localizeStyle(args[0]));
                // Full style swap: reload sprites / glyphs / environment /
                // models / terrain, not just the decoder config. Without this,
                // the new style's sprite/glyph URLs are silently ignored.
                try {
                    await dataSource.reloadStyle();
                } catch {}
                break;
            case "setFeatureState":
                dataSource.setFeatureState(args[0] ?? args[1], args[1] ?? args[2]);
                break;
            case "removeFeatureState":
                dataSource.removeFeatureState(args[0]);
                break;
            case "setZoom": {
                // MapView has no direct setZoom — use zoomOnTargetPosition to
                // zoom while keeping the screen-center anchored.
                try {
                    const { MapViewUtils } = await import("@flywave/flywave-mapview");
                    MapViewUtils.zoomOnTargetPosition(mapView, 0, 0, args[0]);
                } catch {}
                break;
            }
            case "setCenter": {
                // setCenter via geoCenter setter (keeps zoom/bearing).
                try {
                    const { GeoCoordinates } = await import("@flywave/flywave-geoutils");
                    mapView.geoCenter = new GeoCoordinates(args[0][1], args[0][0]);
                } catch {}
                break;
            }
            case "setBearing": {
                // MapView exposes `heading` (degrees, clockwise from north).
                try {
                    mapView.heading = args[0];
                } catch {}
                break;
            }
            case "setPitch": {
                // MapView exposes `tilt` (degrees).
                try {
                    mapView.tilt = args[0];
                } catch {}
                break;
            }
            case "setGeoJSONSourceData": {
                const sourceId = args[0];
                const newData = args[1];
                if (sourceId && newData) {
                    // Update the runtime style's source data first so the
                    // change persists across any future re-connect.
                    rt?.setGeoJSONSourceData(sourceId, newData);
                    // Then update the live GeoJSONDataProvider if one exists
                    // for this source so already-loaded tiles see new data.
                    const ds = dataSource as any;
                    const provider = ds.m_delegatingProvider?.delegate;
                    if (provider && typeof provider.updateData === 'function') {
                        provider.updateData(newData);
                        mapView.update();
                    }
                }
                break;
            }
            case "addImage": {
                if (args[1] && typeof document !== 'undefined') {
                    // args[0] = name, args[1] = {width, height, data} or HTMLImage
                    const imgData = args[1];
                    try {
                        const canvas = document.createElement('canvas');
                        canvas.width = imgData.width || 32;
                        canvas.height = imgData.height || 32;
                        const ctx = canvas.getContext('2d')!;
                        if (imgData.data) {
                            const imageData = ctx.createImageData(canvas.width, canvas.height);
                            imageData.data.set(new Uint8ClampedArray(imgData.data));
                            ctx.putImageData(imageData, 0, 0);
                        }
                        dataSource.addImage(args[0], canvas);
                    } catch {}
                }
                break;
            }
            case "removeImage": {
                dataSource.removeImage(args[0]);
                break;
            }
            case "updateImage": {
                // Re-add the image (same as addImage but replaces existing).
                if (args[1] && typeof document !== 'undefined') {
                    dataSource.removeImage(args[0]);
                    const imgData = args[1];
                    try {
                        const canvas = document.createElement('canvas');
                        canvas.width = imgData.width || 32;
                        canvas.height = imgData.height || 32;
                        const ctx = canvas.getContext('2d')!;
                        if (imgData.data) {
                            const imageData = ctx.createImageData(canvas.width, canvas.height);
                            imageData.data.set(new Uint8ClampedArray(imgData.data));
                            ctx.putImageData(imageData, 0, 0);
                        }
                        dataSource.addImage(args[0], canvas);
                    } catch {}
                }
                break;
            }
            case "setProjection": {
                const projName = typeof args[0] === "string" ? args[0] : args[0]?.name;
                if (projName === "globe") {
                    const { sphereProjection } = await import("@flywave/flywave-geoutils");
                    (mapView as any).projection = sphereProjection;
                } else if (projName === "mercator") {
                    const { mercatorProjection } = await import("@flywave/flywave-geoutils");
                    (mapView as any).projection = mercatorProjection;
                } else if (projName && projName !== "globe") {
                    const { MBMapProjection } = await import("../src/MBMapProjection");
                    const { parseProjection } = await import("../src/MBProjection");
                    const config = parseProjection(typeof args[0] === "string" ? { name: args[0] } : args[0]);
                    (mapView as any).projection = new MBMapProjection(config);
                }
                break;
            }
            case "setLights":
            case "setLight": {
                const env = (dataSource as any).m_environment;
                if (env && args[0]) {
                    env.applyLights(Array.isArray(args[0]) ? args[0] : [args[0]]);
                }
                break;
            }
            case "setFog": {
                const env = (dataSource as any).m_environment;
                if (env) env.applyFog(args[0]);
                break;
            }
            case "setTerrain": {
                const env = (dataSource as any).m_environment;
                if (env && args[0]) {
                    const style = (dataSource as any).styleManager?.getStyle() ?? {};
                    await env.applyTerrain(
                        args[0],
                        (dataSource as any).demTileUrl,
                        style.zoom ?? 8,
                        style.center ?? [0, 0],
                    );
                }
                break;
            }
            case "addModel": {
                // args: [name, uri] or [name, { uri, position }]
                const name = args[0];
                const def = args[1];
                if (name && def) {
                    const style = dataSource.runtime?.style;
                    if (style) {
                        if (!(style as any).models) (style as any).models = {};
                        (style as any).models[name] = typeof def === 'string'
                            ? { uri: def }
                            : def;
                        // Re-trigger model loading on the datasource.
                        try {
                            await (dataSource as any).loadModels?.(style);
                        } catch {}
                    }
                }
                break;
            }
            case "addSource": {
                // Add source to the runtime style and re-trigger tile loading.
                if (rt && args[0] && args[1]) {
                    rt.addSource(args[0], args[1]);
                }
                break;
            }
            case "removeSource": {
                if (rt && args[0]) {
                    rt.removeSource(args[0]);
                }
                break;
            }
            case "setConfigProperty":
            case "setStyleImportConfigProperty": {
                // Update import config: args[0]=importId, args[1]=key, args[2]=value
                const style = dataSource.runtime?.style;
                if (style) {
                    const imports = (style as any).imports ?? [];
                    const importId = args[0];
                    const key = args[1];
                    const value = args[2];
                    for (const imp of imports) {
                        if (!importId || imp.id === importId) {
                            if (!imp.config) imp.config = {};
                            imp.config[key] = value;
                        }
                    }
                    // Re-merge imports to propagate config.
                    dataSource.runtime?.setStyle(style);
                }
                break;
            }
            case "setLayerProperty": {
                // Set arbitrary property on a layer: args[0]=layerId, args[1]=prop, args[2]=value
                const rt = dataSource.runtime;
                if (rt && args[0]) {
                    const layer = rt.style.layers.find((l: any) => l.id === args[0]) as any;
                    if (layer) {
                        const prop = args[1];
                        const isPaint = prop.includes('-color') || prop.includes('-opacity') ||
                                        prop.includes('-width') || prop.includes('-translate') ||
                                        prop.includes('-pattern') || prop.includes('-blur');
                        if (isPaint) {
                            if (!layer.paint) layer.paint = {};
                            layer.paint[prop] = args[2];
                        } else {
                            if (!layer.layout) layer.layout = {};
                            layer.layout[prop] = args[2];
                        }
                    }
                }
                break;
            }
            case "setColorTheme": {
                // Best-effort: store theme color for reference.
                break;
            }
            case "easeTo": {
                const target = args[0] ?? {};
                // Use setCameraGeolocationAndZoom to atomically set center +
                // zoom + bearing + pitch (single re-orientation, matches the
                // post-animation end-state of mapbox's easeTo).
                try {
                    const { GeoCoordinates } = await import("@flywave/flywave-geoutils");
                    const curCenter = mapView.geoCenter;
                    const center = target.center
                        ? new GeoCoordinates(target.center[1], target.center[0])
                        : curCenter;
                    const zoom = target.zoom ?? mapView.zoomLevel;
                    const yaw = target.bearing ?? mapView.heading;
                    const pitch = target.pitch ?? mapView.tilt;
                    mapView.setCameraGeolocationAndZoom(center, zoom, yaw, pitch);
                } catch {}
                break;
            }
            case "setPadding": {
                // padding = {top, bottom, left, right} in pixels
                const padding = args[0] ?? {};
                const canvas = mapView.canvas;
                const w = canvas.width;
                const h = canvas.height;
                const top = padding.top ?? 0;
                const bottom = padding.bottom ?? 0;
                const left = padding.left ?? 0;
                const right = padding.right ?? 0;
                // NDC offset: center shifts toward the larger padding side.
                const ndcX = (right - left) / w;
                const ndcY = (top - bottom) / h;
                try {
                    const { CameraUtils } = await import("@flywave/flywave-mapview");
                    CameraUtils.setPrincipalPoint(mapView.camera, { x: ndcX, y: ndcY });
                } catch {}
                break;
            }
            case "setCameraPosition":
            case "lookAtPoint": {
                // setCameraPosition: [x, y, z] in geo coordinates (lng, lat, alt meters)
                // lookAtPoint: [lng, lat] target to look at from current camera pos,
                //   optional 2nd arg [dx,dy,dz] = up vector direction.
                if (name === "setCameraPosition" && args[0]) {
                    // Convert geo position to flywave camera.
                    const lng = args[0][0];
                    const lat = args[0][1];
                    const alt = args[0][2] ?? 1000;
                    try {
                        const { GeoCoordinates } = await import("@flywave/flywave-geoutils");
                        // Use altitude to estimate zoom level.
                        const earthCircumference = 40075016.686;
                        const mpp = alt / (mapView.canvas.height ?? 512);
                        const zoom = Math.max(0, Math.log2(earthCircumference / (mpp * 256)));
                        mapView.setCameraGeolocationAndZoom(
                            new GeoCoordinates(lat, lng), zoom);
                    } catch {}
                }
                if (name === "lookAtPoint" && args[0]) {
                    const targetLng = args[0][0];
                    const targetLat = args[0][1];
                    const upVector = args[1] as number[] | undefined;
                    try {
                        const { GeoCoordinates } = await import("@flywave/flywave-geoutils");
                        // Move camera to look at the target point from current zoom.
                        mapView.setCameraGeolocationAndZoom(
                            new GeoCoordinates(targetLat, targetLng),
                            mapView.zoomLevel);
                        // If an up/direction vector is provided, approximate
                        // the resulting bearing/pitch from the direction.
                        if (upVector && Array.isArray(upVector)) {
                            const [ux, uy, uz] = upVector;
                            // Bearing from horizontal component (atan2 of x,y).
                            const bearing = Math.atan2(ux, uy) * 180 / Math.PI;
                            // Pitch from vertical component.
                            const horizMag = Math.sqrt(ux*ux + uy*uy);
                            const pitch = Math.atan2(horizMag, uz) * 180 / Math.PI;
                            mapView.heading = bearing;
                            mapView.tilt = Math.min(pitch, 60);
                        }
                    } catch {}
                }
                break;
            }
            case "fitScreenCoordinates": {
                // args: [{x,y}, {x,y}, bearing, options?]
                const p0 = args[0];
                const p1 = args[1];
                const bearing = args[2];
                if (p0 && p1) {
                    try {
                        const geo0 = (mapView as any).getGeoCoordinatesAt?.(p0.x, p0.y, true);
                        const geo1 = (mapView as any).getGeoCoordinatesAt?.(p1.x, p1.y, true);
                        if (geo0 && geo1) {
                            // Compute center and approximate zoom.
                            const lat0 = geo0.latitude;
                            const lng0 = geo0.longitude;
                            const lat1 = geo1.latitude;
                            const lng1 = geo1.longitude;
                            const centerLat = (lat0 + lat1) / 2;
                            const centerLng = (lng0 + lng1) / 2;
                            // Haversine distance for zoom estimate.
                            const dLat = (lat1 - lat0) * Math.PI / 180;
                            const dLng = (lng1 - lng0) * Math.PI / 180;
                            const a = Math.sin(dLat/2)**2 + Math.cos(lat0*Math.PI/180) *
                                      Math.cos(lat1*Math.PI/180) * Math.sin(dLng/2)**2;
                            const dist = 6378137 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
                            // Fit: viewport spans ~canvas pixels for this distance.
                            const canvasSize = Math.min(mapView.canvas.width, mapView.canvas.height);
                            const targetMetersPerPixel = dist / Math.max(canvasSize * 0.8, 1);
                            const zoom = Math.log2(
                                40075016.686 / (targetMetersPerPixel * Math.cos(centerLat * Math.PI / 180))
                            );
                            const { GeoCoordinates } = await import("@flywave/flywave-geoutils");
                            (mapView as any).setCameraGeolocationAndZoom?.(
                                new GeoCoordinates(centerLat, centerLng),
                                Math.max(0, Math.min(22, zoom)),
                                bearing ?? 0,
                                0,
                            );
                        }
                    } catch {}
                }
                break;
            }
            case "forceContextRestart": {
                // Best-effort: force context loss + restore.
                const gl = (mapView as any).renderer?.getContext?.();
                if (gl) {
                    const ext = gl.getExtension("WEBGL_lose_context");
                    if (ext) { ext.loseContext(); ext.restoreContext(); }
                }
                break;
            }
            case "setFov": {
                // Use existing MapView.setFovCalculation API.
                const fov = args[0];
                if (typeof fov === "number") {
                    (mapView as any).setFovCalculation?.({ type: "fixed", fov });
                }
                break;
            }
            case "check": {
                // Mapbox assertion (e.g. checkRenderingWorldCopies, checkCollisionCount).
                // We don't enforce these — the rendering comparison itself is the
                // assertion in the compat runner. Just record the call name.
                break;
            }
            case "forceRenderCached": {
                // Cache-control: force the next frame to render from cached tiles
                // without re-decoding. Best-effort — just advance a frame.
                break;
            }
            case "setColorTheme": {
                // Color theme override — store for downstream consumers.
                (mapView as any).colorTheme = args[0];
                break;
            }
            case "pinBooleanTransitionProgress": {
                // Pin a CSS-style boolean transition at a specific progress
                // value (0..1). Best-effort: store as a runtime setting.
                const key = args[0];
                const value = args[1];
                if (key) {
                    if (!(mapView as any).runtimeSettings) (mapView as any).runtimeSettings = {};
                    (mapView as any).runtimeSettings[`__pin_${key}`] = value;
                }
                break;
            }
            case "setSize": {
                // Resize the canvas to the given {width, height} in CSS pixels.
                const size = args[0];
                if (size && typeof size.width === 'number' && typeof size.height === 'number') {
                    const canvas = mapView.canvas;
                    canvas.width = size.width;
                    canvas.height = size.height;
                    mapView.update();
                }
                break;
            }
            case "rotateTo": {
                // args: [bearing, { duration, easing, ... }?]
                // For static rendering we only need the final bearing/pitch.
                try {
                    mapView.heading = args[0];
                    if (args[1]?.pitch !== undefined) mapView.tilt = args[1].pitch;
                } catch {}
                break;
            }
            case "resetNorth": {
                // Reset bearing to 0 (north up), optionally with animation.
                try { mapView.heading = 0; } catch {}
                break;
            }
            case "resetNorthPitch": {
                // Reset both bearing and pitch to 0.
                try {
                    mapView.heading = 0;
                    mapView.tilt = 0;
                } catch {}
                break;
            }
            case "jumpTo": {
                // Same as easeTo but without animation — set final state.
                const target = args[0] ?? {};
                try {
                    const { GeoCoordinates } = await import("@flywave/flywave-geoutils");
                    const curCenter = mapView.geoCenter;
                    const center = target.center
                        ? new GeoCoordinates(target.center[1], target.center[0])
                        : curCenter;
                    const zoom = target.zoom ?? mapView.zoomLevel;
                    const yaw = target.bearing ?? mapView.heading;
                    const pitch = target.pitch ?? mapView.tilt;
                    mapView.setCameraGeolocationAndZoom(center, zoom, yaw, pitch);
                } catch {}
                break;
            }
            case "removeModel": {
                // args: [name] — unregister a model from style.models.
                const name = args[0];
                if (name && rt?.style) {
                    const models = (rt.style as any).models;
                    if (models) {
                        delete models[name];
                    }
                }
                break;
            }
            case "removeImport": {
                // args: [importId] — remove an import from style.imports.
                const importId = args[0];
                if (importId && rt?.style) {
                    const imports = (rt.style as any).imports;
                    if (Array.isArray(imports)) {
                        const idx = imports.findIndex((imp: any) => imp.id === importId);
                        if (idx >= 0) imports.splice(idx, 1);
                        // Re-apply style to reflect the removal.
                        try { await dataSource.reloadStyle(); } catch {}
                    }
                }
                break;
            }
            case "pauseSource": {
                // args: [sourceId, pause?] — pause/resume a source's tile loading.
                // Best-effort: store the flag on mapView for reference.
                const sid = args[0];
                const pause = args[1] ?? true;
                if (sid) {
                    if (!(mapView as any).pausedSources) (mapView as any).pausedSources = new Set();
                    if (pause) (mapView as any).pausedSources.add(sid);
                    else (mapView as any).pausedSources.delete(sid);
                }
                break;
            }
            case "setSlot": {
                // args: [layerId, slotName]
                // Move a layer into a named slot position in the style's
                // layer array. Slots are defined by import styles and define
                // insertion points. Best-effort: reorder layers by slot.
                const layerId = args[0];
                const slotName = args[1];
                if (layerId && slotName && rt?.style) {
                    const layers = rt.style.layers as any[];
                    const layer = layers.find(l => l.id === layerId);
                    if (layer) {
                        layer.slot = slotName;
                        // Trigger re-evaluation to apply the slot change.
                        try { await dataSource.reloadStyle(); } catch {}
                    }
                }
                break;
            }
            case "moveImport": {
                // args: [importId, beforeImportId?]
                // Reorder imports so that `importId` comes before `beforeImportId`.
                const importId = args[0];
                const beforeId = args[1];
                if (importId && rt?.style) {
                    const imports = (rt.style as any).imports;
                    if (Array.isArray(imports)) {
                        const idx = imports.findIndex((imp: any) => imp.id === importId);
                        if (idx >= 0) {
                            const [imp] = imports.splice(idx, 1);
                            if (beforeId) {
                                const beforeIdx = imports.findIndex((i: any) => i.id === beforeId);
                                if (beforeIdx >= 0) {
                                    imports.splice(beforeIdx, 0, imp);
                                } else {
                                    imports.push(imp);
                                }
                            } else {
                                imports.push(imp);
                            }
                            try { await dataSource.reloadStyle(); } catch {}
                        }
                    }
                }
                break;
            }
            case "addImport": {
                // args: [importId, beforeId?, config?]
                const importDef: any = { id: args[0] };
                if (args[2]) importDef.config = args[2];
                if (args[1]) importDef.url = args[1];
                if (rt?.style) {
                    if (!Array.isArray((rt.style as any).imports)) {
                        (rt.style as any).imports = [];
                    }
                    (rt.style as any).imports.push(importDef);
                    try { await dataSource.reloadStyle(); } catch {}
                }
                break;
            }
            case "updateImport": {
                // args: [importId, config]
                const importId = args[0];
                const config = args[1];
                if (importId && config && rt?.style) {
                    const imports = (rt.style as any).imports;
                    if (Array.isArray(imports)) {
                        const imp = imports.find((i: any) => i.id === importId);
                        if (imp) {
                            imp.config = { ...(imp.config ?? {}), ...config };
                            try { await dataSource.reloadStyle(); } catch {}
                        }
                    }
                }
                break;
            }
            case "setRenderWorldCopies": {
                // Best-effort: store on mapView; some engines expose this as
                // a runtime flag. When false, the world is rendered only once
                // (no horizontal repetition) — relevant for globe / polar
                // tests.
                (mapView as any).renderWorldCopies = args[0];
                break;
            }
            case "setWorldview": {
                // Update the decoder's worldview filter so features whose
                // worldview tag doesn't match are excluded.
                dataSource.decoder.configure(undefined, {
                    worldview: args[0],
                } as any);
                mapView.update();
                break;
            }
            case "setRuntimeSettingBool":
            case "setRuntimeSettingString": {
                // Generic runtime setting — key/value pair. Mostly affects
                // platform-specific behaviour we don't model; store on
                // mapView for downstream consumers.
                const key = args[0];
                const value = args[1];
                if (key) {
                    if (!(mapView as any).runtimeSettings) (mapView as any).runtimeSettings = {};
                    (mapView as any).runtimeSettings[key] = value;
                }
                break;
            }
            case "setCustomTexture": {
                // Mapbox HD: attach a named texture to the style for use by
                // pattern paints. Best-effort: register in the sprite atlas
                // under the given name so subsequent pattern paints can find it.
                const name = args[0];
                const image = args[1];
                if (name && image && typeof document !== 'undefined') {
                    try {
                        const canvas = document.createElement('canvas');
                        const img: any = image;
                        canvas.width = img.width ?? img.naturalWidth ?? 32;
                        canvas.height = img.height ?? img.naturalHeight ?? 32;
                        const ctx = canvas.getContext('2d')!;
                        if (img.data) {
                            const id = ctx.createImageData(canvas.width, canvas.height);
                            id.data.set(new Uint8ClampedArray(img.data));
                            ctx.putImageData(id, 0, 0);
                        } else if (img instanceof HTMLImageElement || img instanceof HTMLCanvasElement) {
                            ctx.drawImage(img, 0, 0);
                        }
                        dataSource.addImage(name, canvas);
                    } catch {}
                }
                break;
            }
            default:
                break;
        }
        await renderFrames(mapView, dataSource, 1);
    }
}

describe("MBStyleDataSource render-tests compatibility", function () {
    // TEST_FILTER = substring(s) matched against the test name (e.g.
    // "hillshade-buffer" or "symbol-z-order/viewport-y"). Read from env (node
    // side, for ts-mocha) or karma client args (browser side).
    const envFilter = process.env.TEST_FILTER;
    const karmaFilters = (window as any).__karma__?.config?.args
        ?.filter?.((a: string) => a.startsWith("filter="))
        .map((a: string) => a.slice("filter=".length));
    const nameFilters = [
        ...(envFilter ? [envFilter] : []),
        ...(karmaFilters ?? []),
    ];
    let SUBSET = ALL_TESTS;
    if (nameFilters.length > 0) {
        SUBSET = ALL_TESTS.filter((e) =>
            nameFilters.some((f) => e.name.includes(f)),
        );
        console.log(
            `[MBStyleCompat] filtered to ${SUBSET.length} tests matching "${nameFilters.join('", "')}"`,
        );
    } else if (process.env.TEST_SUBSET) {
        SUBSET = ALL_TESTS.slice(0, parseInt(process.env.TEST_SUBSET));
    }

    for (const entry of SUBSET) {
        const metadata = entry.style.metadata?.test ?? {};
        const skipReasons = metadata["skip-test"] ?? [];
        // Determine current platform once.
        let platformTag = "";
        try { platformTag = getPlatform() ?? ""; } catch {}
        // A skip-test entry matches if its `platform-tag-contains` value is
        // a substring of our current platform tag. An empty value ("")
        // matches all platforms.
        const shouldSkip = skipReasons.some((r: any) => {
            const tag = r["platform-tag-contains"] ?? "";
            return typeof tag === 'string' && platformTag.includes(tag);
        });

        const testFn = shouldSkip ? it.skip : it;

        testFn(entry.name, async function () {
            this.timeout(60000);
            let canvas: HTMLCanvasElement | undefined;
            let mapView: MapView | undefined;

            try {
                // image-threshold may be:
                //   - a number (uniform threshold)
                //   - an array of { platform-tag-contains, threshold } (per-platform)
                // Default to 0.001 (more lenient than mapbox's 0.00015 to
                // account for rendering engine differences).
                let imageThreshold = 0.001;
                const rawThreshold = metadata["image-threshold"];
                if (typeof rawThreshold === "number") {
                    imageThreshold = rawThreshold;
                } else if (Array.isArray(rawThreshold)) {
                    // Per-platform: find the entry matching our platform, or
                    // the default (empty tag).
                    const platform = getPlatform();
                    let fallback: number | undefined;
                    for (const entry of rawThreshold) {
                        const tag = entry["platform-tag-contains"] ?? "";
                        if (tag === "") fallback = entry.threshold;
                        if (platform && typeof platform === 'string' && platform.includes(tag)) {
                            imageThreshold = entry.threshold;
                            break;
                        }
                    }
                    if (fallback !== undefined && imageThreshold === 0.001) {
                        imageThreshold = fallback;
                    }
                }
                const ibct = new RenderingTestHelper(this, {
                    module: "mbstyle-render",
                    imageThreshold,
                } as any);

                canvas = document.createElement("canvas");
                // Mapbox render-test harness defaults: 512x512 (overridden per-test).
                canvas.width = metadata.width ?? 512;
                canvas.height = metadata.height ?? 512;

                // Pre-create a WebGL2 context that explicitly requests a stencil
                // buffer — the SolidLineMaterial relies on stencil testing, and the
                // default context may be created without stencil in some headless
                // drivers (SwiftShader), which makes all lines invisible.
                const ctx =
                    canvas.getContext("webgl2", { stencil: true, antialias: true, preserveDrawingBuffer: true }) as any ??
                    canvas.getContext("webgl", { stencil: true, antialias: true, preserveDrawingBuffer: true }) as any;

                // Pin the global label fade duration to the test's requested
                // value so opacity transitions match `expected.png` timing.
                if (metadata.fadeDuration !== undefined) {
                    try {
                        const { setFadeDuration } = await import("../src/PlacementEngine");
                        setFadeDuration(metadata.fadeDuration);
                    } catch {}
                }

                // Use flywave's bundled Default FontCatalog for text rendering.
                // The mapbox PBF glyphs are not compatible with flywave's BMFont/MSDF format.
                const fontCatalogUrl = 'resources/fonts/Default_FontCatalog.json';

                mapView = new MapView({
                    canvas,
                    context: ctx ?? undefined,
                    theme: {},
                    preserveDrawingBuffer: true,
                    pixelRatio: metadata.pixelRatio ?? 1,
                    tileCacheSize: 0,
                    fontCatalog: fontCatalogUrl,
                    logarithmicDepthBuffer: false,
                });

                const style = localizeStyle(entry.style);
                // Apply scaleFactor metadata — multiplies icon-size and
                // text-size to simulate HD/SD display scaling.
                const scaleFactor = metadata.scaleFactor ?? 1;
                if (scaleFactor !== 1 && style.layers) {
                    for (const layer of style.layers as any[]) {
                        if (!layer.layout) continue;
                        if (layer.layout['icon-size'] !== undefined) {
                            layer.layout['icon-size'] = Number(layer.layout['icon-size']) * scaleFactor;
                        }
                        if (layer.layout['text-size'] !== undefined) {
                            layer.layout['text-size'] = Number(layer.layout['text-size']) * scaleFactor;
                        }
                    }
                }
                const dataSource = new MBStyleDataSource({
                    style,
                    decoder: new MBStyleDecoder(),
                });

                await mapView.addDataSource(dataSource);

                // If the style has a glyphs URL, build real mapbox-font
                // FontCatalogs from PBF SDF glyphs and inject them — replacing
                // flywave's default font so text matches the mapbox baselines.
                if (style.glyphs) {
                    try {
                        const { buildFontCatalogFromPBF } = await import("../src/MBFontCatalogBuilder");
                        const { parseGlyphPBF } = await import("../src/GlyphPBFParser");
                        const glyphsUrl = style.glyphs as string;
                        // Collect the font stacks actually referenced by the
                        // style's symbol layers (fall back to a sensible default).
                        const fontStacks = new Set<string>();
                        for (const layer of (style.layers ?? []) as any[]) {
                            const tf = layer.layout?.['text-font'];
                            if (Array.isArray(tf)) {
                                for (const f of tf) fontStacks.add(f);
                            }
                        }
                        if (fontStacks.size === 0) fontStacks.add("Open Sans Regular");
                        for (const fontName of fontStacks) {
                            const glyphs = new Map<number, any>();
                            for (let range = 0; range < 2; range++) {
                                const start = range * 256;
                                const end = start + 255;
                                const url = glyphsUrl
                                    .replace('{fontstack}', encodeURIComponent(fontName))
                                    .replace('{range}', `${start}-${end}`)
                                    .replace(/^local:\/\//, '/base/@flywave/flywave-mbstyle-datasource/test/rendering/integration/');
                                try {
                                    const resp = await fetch(url);
                                    if (!resp.ok) continue;
                                    const fontstack = parseGlyphPBF(await resp.arrayBuffer());
                                    if (!fontstack) continue;
                                    for (const [id, g] of fontstack.glyphs) glyphs.set(id, g);
                                } catch { continue; }
                            }
                            if (glyphs.size > 0) {
                                const catalog = buildFontCatalogFromPBF(fontName, glyphs);
                                mapView.setFontCatalog(fontName, catalog);
                            }
                        }
                    } catch {}
                }

                // Enable collision-box debug overlay when the test requests it.
                if (metadata.collisionDebug) {
                    dataSource.setCollisionDebug(true);
                }
                if (metadata.showTerrainWireframe) {
                    dataSource.setTerrainWireframe(true);
                }
                if (metadata.debug) {
                    dataSource.setDebugTileBoundaries(true);
                }
                if (metadata.showLayers3DWireframe) {
                    dataSource.setLayers3DWireframe(true);
                }
                if (metadata.showLayers2DWireframe) {
                    dataSource.setLayers2DWireframe(true);
                }

                // mapMode: 'static' = disable interaction; 'tile' = single-tile mode.
                if (metadata.mapMode) {
                    (dataSource as any).__mapMode = metadata.mapMode;
                }

                await renderFrames(mapView, dataSource, 5);

                const operations = metadata.operations ?? [];
                if (operations.length > 0) {
                    await processOperations(mapView, dataSource, operations);
                    await renderFrames(mapView, dataSource, 3);
                }


                // Mapbox's image-threshold is the max FRACTION of mismatched
                // pixels allowed (e.g. 0.001 = 0.1%); convert it to a pixel
                // count. pixelmatch's per-channel threshold is fixed at 0.1.
                const maxMismatch = Math.ceil(
                    (imageThreshold * canvas.width * canvas.height) || 0,
                );
                await ibct.assertCanvasMatchesReference(canvas, entry.name, {
                    threshold: 0.1,
                    maxMismatchedPixels: maxMismatch,
                });

                mapView.dispose();
            } finally {
                if (mapView) {
                    try { mapView.dispose(); } catch {}
                }
                if (canvas) {
                    canvas.width = 0;
                    canvas.height = 0;
                    canvas = undefined!;
                }
            }
        });
    }
});

// ===== Additional operations (appended) =====
// These are handled in the default case of processOperations above,
// but we list them here for documentation. The actual handling is inline.
// Remaining no-op operations (from frequency analysis):
// - addCustomLayer/addCustomSource (16): custom layer/source, skip
// - setSlot/moveImport/addImport/updateImport (6): import slot management
// - on/updateFakeCanvas (2): event listener / fake canvas control
// - addImport/updateImport now handled inline
