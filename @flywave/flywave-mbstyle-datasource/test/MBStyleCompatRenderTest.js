"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
const flywave_mapview_1 = require("@flywave/flywave-mapview");
const flywave_test_utils_1 = require("@flywave/flywave-test-utils");
const render_tests_index_1 = require("./render-tests-index");
const MBStyleDataSource_1 = require("../src/MBStyleDataSource");
const MBStyleDecoder_1 = require("../src/MBStyleDecoder");
(0, flywave_test_utils_1.setReferenceImageResolver)((imageProps) => {
    var _a;
    const name = (_a = imageProps.name) !== null && _a !== void 0 ? _a : "";
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
function discoverTests() {
    return render_tests_index_1.ALL_TESTS.map((t) => ({ name: t.name, stylePath: "", style: t.style }));
}
const ALL_TESTS = discoverTests();
console.log(`[MBStyleCompat] ${ALL_TESTS.length} compatible tests loaded`);
function localizeUrl(u) {
    if (!u.startsWith("local://"))
        return u;
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
function localizeStyle(style) {
    var _a;
    const s = JSON.parse(JSON.stringify(style));
    for (const [, src] of Object.entries((_a = s.sources) !== null && _a !== void 0 ? _a : {})) {
        const source = src;
        if (typeof source.url === 'string' && source.url.startsWith('mapbox://')) {
            const id = source.url.replace('mapbox://', '').split('?')[0];
            const ext = source.type === 'raster-array' ? 'mrt'
                : source.type === 'raster' ? 'png' : 'mvt';
            source.tiles = [`local://tiles/${id}/{z}-{x}-{y}.${ext}`];
            delete source.url;
        }
        if (source.tiles) {
            source.tiles = source.tiles.map((t) => localizeUrl(t));
        }
        if (source.url)
            source.url = localizeUrl(source.url);
        if (typeof source.data === "string") {
            source.data = localizeUrl(source.data);
        }
    }
    if (s.sprite)
        s.sprite = localizeUrl(s.sprite);
    if (s.glyphs)
        s.glyphs = localizeUrl(s.glyphs);
    return s;
}
async function renderFrames(mapView, dataSource, n) {
    var _a, _b, _c, _d;
    await new Promise((resolve) => {
        let frames = 0;
        const handler = () => {
            frames++;
            if (frames >= n) {
                mapView.removeEventListener(flywave_mapview_1.MapViewEventNames.AfterRender, handler);
                resolve();
            }
            else {
                mapView.update();
            }
        };
        mapView.addEventListener(flywave_mapview_1.MapViewEventNames.AfterRender, handler);
        mapView.update();
    });
    if (mapView.isDynamicFrame) {
        await new Promise((resolve) => {
            let settled = false;
            let timer;
            const handler = () => {
                settled = true;
                mapView.removeEventListener(flywave_mapview_1.MapViewEventNames.FrameComplete, handler);
                clearTimeout(timer);
                resolve();
            };
            timer = setTimeout(() => {
                if (!settled) {
                    mapView.removeEventListener(flywave_mapview_1.MapViewEventNames.FrameComplete, handler);
                    resolve();
                }
            }, 15000);
            mapView.addEventListener(flywave_mapview_1.MapViewEventNames.FrameComplete, handler);
            mapView.update();
        });
    }
    const hasRaster = ((_d = (_c = (_b = (_a = dataSource.styleManager) === null || _a === void 0 ? void 0 : _a.getStyle) === null || _b === void 0 ? void 0 : _b.call(_a)) === null || _c === void 0 ? void 0 : _c.layers) !== null && _d !== void 0 ? _d : []).some((l) => l.type === "raster");
    if (hasRaster) {
        for (let i = 0; i < 10; i++) {
            await new Promise((resolve) => {
                let done = false;
                const timer = setTimeout(() => {
                    if (!done) {
                        done = true;
                        mapView.removeEventListener(flywave_mapview_1.MapViewEventNames.AfterRender, handler);
                        resolve();
                    }
                }, 1500);
                const handler = () => {
                    if (done)
                        return;
                    done = true;
                    clearTimeout(timer);
                    mapView.removeEventListener(flywave_mapview_1.MapViewEventNames.AfterRender, handler);
                    resolve();
                };
                mapView.addEventListener(flywave_mapview_1.MapViewEventNames.AfterRender, handler);
                mapView.update();
            });
            await new Promise((r) => setTimeout(r, 100));
        }
    }
}
async function processOperations(mapView, dataSource, operations) {
    var _a, _b, _c, _d, _e, _f, _g, _h, _j, _k, _l, _m, _o, _p, _q, _r, _s, _t, _u, _v, _w, _x, _y, _z, _0, _1, _2, _3, _4, _5, _6, _7, _8, _9, _10, _11, _12, _13, _14, _15, _16, _17, _18, _19, _20, _21, _22, _23, _24, _25, _26, _27, _28, _29, _30, _31, _32, _33;
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
                await new Promise((r) => { var _a; return setTimeout(r, (_a = args[0]) !== null && _a !== void 0 ? _a : 0); });
                break;
            case "setPaintProperty":
                rt === null || rt === void 0 ? void 0 : rt.setPaintProperty(args[0], args[1], args[2]);
                break;
            case "setLayoutProperty":
                rt === null || rt === void 0 ? void 0 : rt.setLayoutProperty(args[0], args[1], args[2]);
                break;
            case "addLayer":
                rt === null || rt === void 0 ? void 0 : rt.addLayer(args[0], args[1]);
                break;
            case "removeLayer":
                rt === null || rt === void 0 ? void 0 : rt.removeLayer(args[0]);
                break;
            case "moveLayer":
                rt === null || rt === void 0 ? void 0 : rt.moveLayer(args[0], args[1]);
                break;
            case "setFilter":
                rt === null || rt === void 0 ? void 0 : rt.setFilter(args[0], args[1]);
                break;
            case "setLayerZoomRange":
                rt === null || rt === void 0 ? void 0 : rt.setLayerZoomRange(args[0], args[1], args[2]);
                break;
            case "setStyle": {
                let newStyle = args[0];
                if (typeof newStyle === "string") {
                    const url = localizeUrl(newStyle.trim().startsWith("{")
                        ? newStyle
                        : newStyle.replace(/^local:\/\//, "/base/@flywave/flywave-mbstyle-datasource/test/rendering/integration/"));
                    if (url.trim().startsWith("{")) {
                        newStyle = JSON.parse(url);
                    }
                    else {
                        const resp = await fetch(url);
                        newStyle = resp.ok ? await resp.json() : {};
                    }
                }
                rt === null || rt === void 0 ? void 0 : rt.setStyle(localizeStyle(newStyle));
                try {
                    await dataSource.reloadStyle();
                }
                catch (_34) { }
                break;
            }
            case "setFeatureState":
                dataSource.setFeatureState((_a = args[0]) !== null && _a !== void 0 ? _a : args[1], (_b = args[1]) !== null && _b !== void 0 ? _b : args[2]);
                break;
            case "removeFeatureState":
                dataSource.removeFeatureState(args[0]);
                break;
            case "setZoom": {
                try {
                    const { MapViewUtils } = await Promise.resolve().then(() => __importStar(require("@flywave/flywave-mapview")));
                    MapViewUtils.zoomOnTargetPosition(mapView, 0, 0, ((_c = args[0]) !== null && _c !== void 0 ? _c : 0) + 1);
                }
                catch (_35) { }
                break;
            }
            case "setCenter": {
                try {
                    const { GeoCoordinates } = await Promise.resolve().then(() => __importStar(require("@flywave/flywave-geoutils")));
                    mapView.geoCenter = new GeoCoordinates(args[0][1], args[0][0]);
                }
                catch (_36) { }
                break;
            }
            case "setBearing": {
                try {
                    mapView.heading = args[0];
                }
                catch (_37) { }
                break;
            }
            case "setPitch": {
                try {
                    mapView.tilt = args[0];
                }
                catch (_38) { }
                break;
            }
            case "setGeoJSONSourceData": {
                const sourceId = args[0];
                const newData = args[1];
                if (sourceId && newData) {
                    rt === null || rt === void 0 ? void 0 : rt.setGeoJSONSourceData(sourceId, newData);
                    const ds = dataSource;
                    const provider = (_d = ds.m_delegatingProvider) === null || _d === void 0 ? void 0 : _d.delegate;
                    if (provider && typeof provider.updateData === 'function') {
                        provider.updateData(newData);
                        mapView.update();
                    }
                }
                break;
            }
            case "addImage": {
                if (args[1] && typeof document !== 'undefined') {
                    const imgData = args[1];
                    try {
                        const canvas = document.createElement('canvas');
                        canvas.width = imgData.width || 32;
                        canvas.height = imgData.height || 32;
                        const ctx = canvas.getContext('2d');
                        if (imgData.data) {
                            const imageData = ctx.createImageData(canvas.width, canvas.height);
                            imageData.data.set(new Uint8ClampedArray(imgData.data));
                            ctx.putImageData(imageData, 0, 0);
                        }
                        dataSource.addImage(args[0], canvas);
                    }
                    catch (_39) { }
                }
                break;
            }
            case "removeImage": {
                dataSource.removeImage(args[0]);
                break;
            }
            case "updateImage": {
                if (args[1] && typeof document !== 'undefined') {
                    dataSource.removeImage(args[0]);
                    const imgData = args[1];
                    try {
                        const canvas = document.createElement('canvas');
                        canvas.width = imgData.width || 32;
                        canvas.height = imgData.height || 32;
                        const ctx = canvas.getContext('2d');
                        if (imgData.data) {
                            const imageData = ctx.createImageData(canvas.width, canvas.height);
                            imageData.data.set(new Uint8ClampedArray(imgData.data));
                            ctx.putImageData(imageData, 0, 0);
                        }
                        dataSource.addImage(args[0], canvas);
                    }
                    catch (_40) { }
                }
                break;
            }
            case "setProjection": {
                const projName = typeof args[0] === "string" ? args[0] : (_e = args[0]) === null || _e === void 0 ? void 0 : _e.name;
                if (projName === "globe") {
                    const { sphereProjection } = await Promise.resolve().then(() => __importStar(require("@flywave/flywave-geoutils")));
                    mapView.projection = sphereProjection;
                }
                else if (projName === "mercator") {
                    const { mercatorProjection } = await Promise.resolve().then(() => __importStar(require("@flywave/flywave-geoutils")));
                    mapView.projection = mercatorProjection;
                }
                else if (projName && projName !== "globe") {
                    const { MBMapProjection } = await Promise.resolve().then(() => __importStar(require("../src/MBMapProjection")));
                    const { parseProjection } = await Promise.resolve().then(() => __importStar(require("../src/MBProjection")));
                    const config = parseProjection(typeof args[0] === "string" ? { name: args[0] } : args[0]);
                    mapView.projection = new MBMapProjection(config);
                }
                break;
            }
            case "setLights":
            case "setLight": {
                const env = dataSource.m_environment;
                if (env && args[0]) {
                    env.applyLights(Array.isArray(args[0]) ? args[0] : [args[0]]);
                    try {
                        (_g = (_f = dataSource).refreshDecoderBrightness) === null || _g === void 0 ? void 0 : _g.call(_f);
                    }
                    catch (_41) { }
                }
                break;
            }
            case "setFog": {
                const env = dataSource.m_environment;
                if (env)
                    env.applyFog(args[0]);
                break;
            }
            case "setTerrain": {
                const env = dataSource.m_environment;
                if (env && args[0]) {
                    const style = (_j = (_h = dataSource.styleManager) === null || _h === void 0 ? void 0 : _h.getStyle()) !== null && _j !== void 0 ? _j : {};
                    await env.applyTerrain(args[0], dataSource.demTileUrl, (_k = style.zoom) !== null && _k !== void 0 ? _k : 8, (_l = style.center) !== null && _l !== void 0 ? _l : [0, 0]);
                }
                break;
            }
            case "addModel": {
                const name = args[0];
                const def = args[1];
                if (name && def) {
                    const style = (_m = dataSource.runtime) === null || _m === void 0 ? void 0 : _m.style;
                    if (style) {
                        if (!style.models)
                            style.models = {};
                        style.models[name] = typeof def === 'string'
                            ? { uri: def }
                            : def;
                        try {
                            await ((_p = (_o = dataSource).loadModels) === null || _p === void 0 ? void 0 : _p.call(_o, style));
                        }
                        catch (_42) { }
                    }
                }
                break;
            }
            case "addSource": {
                if (rt && args[0] && args[1]) {
                    rt.addSource(args[0], args[1]);
                    try {
                        await ((_r = (_q = dataSource).reloadSources) === null || _r === void 0 ? void 0 : _r.call(_q));
                    }
                    catch (_43) { }
                }
                break;
            }
            case "removeSource": {
                if (rt && args[0]) {
                    rt.removeSource(args[0]);
                    try {
                        await ((_t = (_s = dataSource).reloadSources) === null || _t === void 0 ? void 0 : _t.call(_s));
                    }
                    catch (_44) { }
                }
                break;
            }
            case "setConfigProperty":
            case "setStyleImportConfigProperty": {
                const style = (_u = dataSource.runtime) === null || _u === void 0 ? void 0 : _u.style;
                if (style) {
                    const imports = (_v = style.imports) !== null && _v !== void 0 ? _v : [];
                    const importId = args[0];
                    const key = args[1];
                    const value = args[2];
                    for (const imp of imports) {
                        if (!importId || imp.id === importId) {
                            if (!imp.config)
                                imp.config = {};
                            imp.config[key] = value;
                        }
                    }
                    if (style._config) {
                        style._config[key] = value;
                    }
                    (_w = dataSource.runtime) === null || _w === void 0 ? void 0 : _w.setStyle(style);
                    (_y = (_x = dataSource).loadImportThemes) === null || _y === void 0 ? void 0 : _y.call(_x, style);
                    await renderFrames(mapView, dataSource, 3);
                }
                break;
            }
            case "setLayerProperty": {
                const rt = dataSource.runtime;
                if (rt && args[0]) {
                    const layer = rt.style.layers.find((l) => l.id === args[0]);
                    if (layer) {
                        const prop = args[1];
                        const isPaint = prop.includes('-color') || prop.includes('-opacity') ||
                            prop.includes('-width') || prop.includes('-translate') ||
                            prop.includes('-pattern') || prop.includes('-blur');
                        if (isPaint) {
                            if (!layer.paint)
                                layer.paint = {};
                            layer.paint[prop] = args[2];
                        }
                        else {
                            if (!layer.layout)
                                layer.layout = {};
                            layer.layout[prop] = args[2];
                        }
                    }
                }
                break;
            }
            case "setColorTheme": {
                dataSource.setColorTheme((_z = args[0]) !== null && _z !== void 0 ? _z : null);
                await renderFrames(mapView, dataSource, 4);
                break;
            }
            case "setImportColorTheme": {
                (_1 = (_0 = dataSource).setImportColorTheme) === null || _1 === void 0 ? void 0 : _1.call(_0, (_2 = args[0]) !== null && _2 !== void 0 ? _2 : '', (_3 = args[1]) !== null && _3 !== void 0 ? _3 : null);
                await renderFrames(mapView, dataSource, 4);
                break;
            }
            case "easeTo": {
                const target = (_4 = args[0]) !== null && _4 !== void 0 ? _4 : {};
                try {
                    const { GeoCoordinates } = await Promise.resolve().then(() => __importStar(require("@flywave/flywave-geoutils")));
                    const curCenter = mapView.geoCenter;
                    const center = target.center
                        ? new GeoCoordinates(target.center[1], target.center[0])
                        : curCenter;
                    const zoom = target.zoom !== undefined ? target.zoom + 1 : mapView.zoomLevel;
                    const yaw = (_5 = target.bearing) !== null && _5 !== void 0 ? _5 : mapView.heading;
                    const pitch = (_6 = target.pitch) !== null && _6 !== void 0 ? _6 : mapView.tilt;
                    mapView.setCameraGeolocationAndZoom(center, zoom, yaw, pitch);
                }
                catch (_45) { }
                break;
            }
            case "setPadding": {
                const padding = (_7 = args[0]) !== null && _7 !== void 0 ? _7 : {};
                const canvas = mapView.canvas;
                const w = canvas.width;
                const h = canvas.height;
                const top = (_8 = padding.top) !== null && _8 !== void 0 ? _8 : 0;
                const bottom = (_9 = padding.bottom) !== null && _9 !== void 0 ? _9 : 0;
                const left = (_10 = padding.left) !== null && _10 !== void 0 ? _10 : 0;
                const right = (_11 = padding.right) !== null && _11 !== void 0 ? _11 : 0;
                const ndcX = (right - left) / w;
                const ndcY = (top - bottom) / h;
                try {
                    const { CameraUtils } = await Promise.resolve().then(() => __importStar(require("@flywave/flywave-mapview")));
                    CameraUtils.setPrincipalPoint(mapView.camera, { x: ndcX, y: ndcY });
                }
                catch (_46) { }
                break;
            }
            case "setCameraPosition":
            case "lookAtPoint": {
                if (name === "setCameraPosition" && args[0]) {
                    const lng = args[0][0];
                    const lat = args[0][1];
                    const alt = (_12 = args[0][2]) !== null && _12 !== void 0 ? _12 : 1000;
                    try {
                        const { GeoCoordinates } = await Promise.resolve().then(() => __importStar(require("@flywave/flywave-geoutils")));
                        const earthCircumference = 40075016.686;
                        const mpp = alt / ((_13 = mapView.canvas.height) !== null && _13 !== void 0 ? _13 : 512);
                        const zoom = Math.max(0, Math.log2(earthCircumference / (mpp * 256)));
                        mapView.setCameraGeolocationAndZoom(new GeoCoordinates(lat, lng), zoom);
                    }
                    catch (_47) { }
                }
                if (name === "lookAtPoint" && args[0]) {
                    const targetLng = args[0][0];
                    const targetLat = args[0][1];
                    const upVector = args[1];
                    try {
                        const { GeoCoordinates } = await Promise.resolve().then(() => __importStar(require("@flywave/flywave-geoutils")));
                        mapView.setCameraGeolocationAndZoom(new GeoCoordinates(targetLat, targetLng), mapView.zoomLevel);
                        if (upVector && Array.isArray(upVector)) {
                            const [ux, uy, uz] = upVector;
                            const bearing = Math.atan2(ux, uy) * 180 / Math.PI;
                            const horizMag = Math.sqrt(ux * ux + uy * uy);
                            const pitch = Math.atan2(horizMag, uz) * 180 / Math.PI;
                            mapView.heading = bearing;
                            mapView.tilt = Math.min(pitch, 60);
                        }
                    }
                    catch (_48) { }
                }
                break;
            }
            case "fitScreenCoordinates": {
                const p0 = args[0];
                const p1 = args[1];
                const bearing = args[2];
                if (p0 && p1) {
                    try {
                        const geo0 = (_15 = (_14 = mapView).getGeoCoordinatesAt) === null || _15 === void 0 ? void 0 : _15.call(_14, p0.x, p0.y, true);
                        const geo1 = (_17 = (_16 = mapView).getGeoCoordinatesAt) === null || _17 === void 0 ? void 0 : _17.call(_16, p1.x, p1.y, true);
                        if (geo0 && geo1) {
                            const lat0 = geo0.latitude;
                            const lng0 = geo0.longitude;
                            const lat1 = geo1.latitude;
                            const lng1 = geo1.longitude;
                            const centerLat = (lat0 + lat1) / 2;
                            const centerLng = (lng0 + lng1) / 2;
                            const dLat = (lat1 - lat0) * Math.PI / 180;
                            const dLng = (lng1 - lng0) * Math.PI / 180;
                            const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat0 * Math.PI / 180) *
                                Math.cos(lat1 * Math.PI / 180) * Math.sin(dLng / 2) ** 2;
                            const dist = 6378137 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
                            const canvasSize = Math.min(mapView.canvas.width, mapView.canvas.height);
                            const targetMetersPerPixel = dist / Math.max(canvasSize * 0.8, 1);
                            const zoom = Math.log2(40075016.686 / (targetMetersPerPixel * Math.cos(centerLat * Math.PI / 180)));
                            const { GeoCoordinates } = await Promise.resolve().then(() => __importStar(require("@flywave/flywave-geoutils")));
                            (_19 = (_18 = mapView).setCameraGeolocationAndZoom) === null || _19 === void 0 ? void 0 : _19.call(_18, new GeoCoordinates(centerLat, centerLng), Math.max(0, Math.min(22, zoom)), bearing !== null && bearing !== void 0 ? bearing : 0, 0);
                        }
                    }
                    catch (_49) { }
                }
                break;
            }
            case "forceContextRestart": {
                const gl = (_21 = (_20 = mapView.renderer) === null || _20 === void 0 ? void 0 : _20.getContext) === null || _21 === void 0 ? void 0 : _21.call(_20);
                if (gl) {
                    const ext = gl.getExtension("WEBGL_lose_context");
                    if (ext) {
                        ext.loseContext();
                        ext.restoreContext();
                    }
                }
                break;
            }
            case "setFov": {
                const fov = args[0];
                if (typeof fov === "number") {
                    (_23 = (_22 = mapView).setFovCalculation) === null || _23 === void 0 ? void 0 : _23.call(_22, { type: "fixed", fov });
                }
                break;
            }
            case "check": {
                break;
            }
            case "forceRenderCached": {
                break;
            }
            case "setColorTheme": {
                mapView.colorTheme = args[0];
                break;
            }
            case "pinBooleanTransitionProgress": {
                const key = args[0];
                const value = args[1];
                if (key) {
                    if (!mapView.runtimeSettings)
                        mapView.runtimeSettings = {};
                    mapView.runtimeSettings[`__pin_${key}`] = value;
                }
                break;
            }
            case "setSize": {
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
                try {
                    mapView.heading = args[0];
                    if (((_24 = args[1]) === null || _24 === void 0 ? void 0 : _24.pitch) !== undefined)
                        mapView.tilt = args[1].pitch;
                }
                catch (_50) { }
                break;
            }
            case "resetNorth": {
                try {
                    mapView.heading = 0;
                }
                catch (_51) { }
                break;
            }
            case "resetNorthPitch": {
                try {
                    mapView.heading = 0;
                    mapView.tilt = 0;
                }
                catch (_52) { }
                break;
            }
            case "jumpTo": {
                const target = (_25 = args[0]) !== null && _25 !== void 0 ? _25 : {};
                try {
                    const { GeoCoordinates } = await Promise.resolve().then(() => __importStar(require("@flywave/flywave-geoutils")));
                    const curCenter = mapView.geoCenter;
                    const center = target.center
                        ? new GeoCoordinates(target.center[1], target.center[0])
                        : curCenter;
                    const zoom = target.zoom !== undefined ? target.zoom + 1 : mapView.zoomLevel;
                    const yaw = (_26 = target.bearing) !== null && _26 !== void 0 ? _26 : mapView.heading;
                    const pitch = (_27 = target.pitch) !== null && _27 !== void 0 ? _27 : mapView.tilt;
                    mapView.setCameraGeolocationAndZoom(center, zoom, yaw, pitch);
                }
                catch (_53) { }
                break;
            }
            case "removeModel": {
                const name = args[0];
                if (name && (rt === null || rt === void 0 ? void 0 : rt.style)) {
                    const models = rt.style.models;
                    if (models) {
                        delete models[name];
                    }
                }
                break;
            }
            case "removeImport": {
                const importId = args[0];
                if (importId && (rt === null || rt === void 0 ? void 0 : rt.style)) {
                    const imports = rt.style.imports;
                    if (Array.isArray(imports)) {
                        const idx = imports.findIndex((imp) => imp.id === importId);
                        if (idx >= 0)
                            imports.splice(idx, 1);
                        try {
                            await dataSource.reloadStyle();
                        }
                        catch (_54) { }
                    }
                }
                break;
            }
            case "pauseSource": {
                const sid = args[0];
                const pause = (_28 = args[1]) !== null && _28 !== void 0 ? _28 : true;
                if (sid) {
                    if (!mapView.pausedSources)
                        mapView.pausedSources = new Set();
                    if (pause)
                        mapView.pausedSources.add(sid);
                    else
                        mapView.pausedSources.delete(sid);
                }
                break;
            }
            case "setSlot": {
                const layerId = args[0];
                const slotName = args[1];
                if (layerId && slotName && (rt === null || rt === void 0 ? void 0 : rt.style)) {
                    const layers = rt.style.layers;
                    const layer = layers.find(l => l.id === layerId);
                    if (layer) {
                        layer.slot = slotName;
                        try {
                            await dataSource.reloadStyle();
                        }
                        catch (_55) { }
                    }
                }
                break;
            }
            case "moveImport": {
                const importId = args[0];
                const beforeId = args[1];
                if (importId && (rt === null || rt === void 0 ? void 0 : rt.style)) {
                    const imports = rt.style.imports;
                    if (Array.isArray(imports)) {
                        const idx = imports.findIndex((imp) => imp.id === importId);
                        if (idx >= 0) {
                            const [imp] = imports.splice(idx, 1);
                            if (beforeId) {
                                const beforeIdx = imports.findIndex((i) => i.id === beforeId);
                                if (beforeIdx >= 0) {
                                    imports.splice(beforeIdx, 0, imp);
                                }
                                else {
                                    imports.push(imp);
                                }
                            }
                            else {
                                imports.push(imp);
                            }
                            try {
                                await dataSource.reloadStyle();
                            }
                            catch (_56) { }
                        }
                    }
                }
                break;
            }
            case "addImport": {
                const importDef = { id: args[0] };
                if (args[2])
                    importDef.config = args[2];
                if (args[1])
                    importDef.url = args[1];
                if (rt === null || rt === void 0 ? void 0 : rt.style) {
                    if (!Array.isArray(rt.style.imports)) {
                        rt.style.imports = [];
                    }
                    rt.style.imports.push(importDef);
                    try {
                        await dataSource.reloadStyle();
                    }
                    catch (_57) { }
                }
                break;
            }
            case "updateImport": {
                const importId = args[0];
                const config = args[1];
                if (importId && config && (rt === null || rt === void 0 ? void 0 : rt.style)) {
                    const imports = rt.style.imports;
                    if (Array.isArray(imports)) {
                        const imp = imports.find((i) => i.id === importId);
                        if (imp) {
                            imp.config = Object.assign(Object.assign({}, ((_29 = imp.config) !== null && _29 !== void 0 ? _29 : {})), config);
                            try {
                                await dataSource.reloadStyle();
                            }
                            catch (_58) { }
                        }
                    }
                }
                break;
            }
            case "setRenderWorldCopies": {
                mapView.renderWorldCopies = args[0];
                break;
            }
            case "setWorldview": {
                dataSource.decoder.configure(undefined, {
                    worldview: args[0],
                });
                mapView.update();
                break;
            }
            case "setRuntimeSettingBool":
            case "setRuntimeSettingString": {
                const key = args[0];
                const value = args[1];
                if (key) {
                    if (!mapView.runtimeSettings)
                        mapView.runtimeSettings = {};
                    mapView.runtimeSettings[key] = value;
                }
                break;
            }
            case "setCustomTexture": {
                const name = args[0];
                const image = args[1];
                if (name && image && typeof document !== 'undefined') {
                    try {
                        const canvas = document.createElement('canvas');
                        const img = image;
                        canvas.width = (_31 = (_30 = img.width) !== null && _30 !== void 0 ? _30 : img.naturalWidth) !== null && _31 !== void 0 ? _31 : 32;
                        canvas.height = (_33 = (_32 = img.height) !== null && _32 !== void 0 ? _32 : img.naturalHeight) !== null && _33 !== void 0 ? _33 : 32;
                        const ctx = canvas.getContext('2d');
                        if (img.data) {
                            const id = ctx.createImageData(canvas.width, canvas.height);
                            id.data.set(new Uint8ClampedArray(img.data));
                            ctx.putImageData(id, 0, 0);
                        }
                        else if (img instanceof HTMLImageElement || img instanceof HTMLCanvasElement) {
                            ctx.drawImage(img, 0, 0);
                        }
                        dataSource.addImage(name, canvas);
                    }
                    catch (_59) { }
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
    var _a, _b, _c, _d, _e, _f, _g, _h, _j, _k, _l, _m, _o;
    const feedbackUrl = (_e = (_d = (_c = (_b = (_a = window.__karma__) === null || _a === void 0 ? void 0 : _a.config) === null || _b === void 0 ? void 0 : _b.args) === null || _c === void 0 ? void 0 : _c.find) === null || _d === void 0 ? void 0 : _d.call(_c, (a) => a.startsWith("feedback-url="))) === null || _e === void 0 ? void 0 : _e.slice("feedback-url=".length);
    before(function () {
        if (feedbackUrl) {
            (0, flywave_test_utils_1.setGlobalReporter)(new flywave_test_utils_1.RenderingTestResultReporter(feedbackUrl));
        }
    });
    const envFilter = process.env.TEST_FILTER;
    const karmaFilters = (_j = (_h = (_g = (_f = window.__karma__) === null || _f === void 0 ? void 0 : _f.config) === null || _g === void 0 ? void 0 : _g.args) === null || _h === void 0 ? void 0 : _h.filter) === null || _j === void 0 ? void 0 : _j.call(_h, (a) => a.startsWith("filter=")).map((a) => a.slice("filter=".length));
    const nameFilters = [
        ...(envFilter ? [envFilter] : []),
        ...(karmaFilters !== null && karmaFilters !== void 0 ? karmaFilters : []),
    ];
    let SUBSET = ALL_TESTS;
    if (nameFilters.length > 0) {
        SUBSET = ALL_TESTS.filter((e) => nameFilters.some((f) => e.name.includes(f)));
        console.log(`[MBStyleCompat] filtered to ${SUBSET.length} tests matching "${nameFilters.join('", "')}"`);
    }
    else if (process.env.TEST_SUBSET) {
        SUBSET = ALL_TESTS.slice(0, parseInt(process.env.TEST_SUBSET));
    }
    for (const entry of SUBSET) {
        const metadata = (_l = (_k = entry.style.metadata) === null || _k === void 0 ? void 0 : _k.test) !== null && _l !== void 0 ? _l : {};
        const skipReasons = (_m = metadata["skip-test"]) !== null && _m !== void 0 ? _m : [];
        let platformTag = "";
        try {
            platformTag = (_o = (0, flywave_test_utils_1.getPlatform)()) !== null && _o !== void 0 ? _o : "";
        }
        catch (_p) { }
        const shouldSkip = skipReasons.some((r) => {
            var _a;
            const tag = (_a = r["platform-tag-contains"]) !== null && _a !== void 0 ? _a : "";
            return typeof tag === 'string' && platformTag.includes(tag);
        });
        const testFn = shouldSkip ? it.skip : it;
        testFn(entry.name, async function () {
            var _a, _b, _c, _d, _e, _f, _g, _h, _j, _k;
            this.timeout(180000);
            let canvas;
            let mapView;
            try {
                let imageThreshold = 0.001;
                const rawThreshold = metadata["image-threshold"];
                if (typeof rawThreshold === "number") {
                    imageThreshold = rawThreshold;
                }
                else if (Array.isArray(rawThreshold)) {
                    const platform = (0, flywave_test_utils_1.getPlatform)();
                    let fallback;
                    for (const entry of rawThreshold) {
                        const tag = (_a = entry["platform-tag-contains"]) !== null && _a !== void 0 ? _a : "";
                        if (tag === "")
                            fallback = entry.threshold;
                        if (platform && typeof platform === 'string' && platform.includes(tag)) {
                            imageThreshold = entry.threshold;
                            break;
                        }
                    }
                    if (fallback !== undefined && imageThreshold === 0.001) {
                        imageThreshold = fallback;
                    }
                }
                const ibct = new flywave_test_utils_1.RenderingTestHelper(this, {
                    module: "mbstyle-render",
                    imageThreshold,
                });
                canvas = document.createElement("canvas");
                canvas.width = (_b = metadata.width) !== null && _b !== void 0 ? _b : 512;
                canvas.height = (_c = metadata.height) !== null && _c !== void 0 ? _c : 512;
                const ctx = (_d = canvas.getContext("webgl2", { stencil: true, antialias: true, preserveDrawingBuffer: true })) !== null && _d !== void 0 ? _d : canvas.getContext("webgl", { stencil: true, antialias: true, preserveDrawingBuffer: true });
                if (metadata.fadeDuration !== undefined) {
                    try {
                        const { setFadeDuration } = await Promise.resolve().then(() => __importStar(require("../src/PlacementEngine")));
                        setFadeDuration(metadata.fadeDuration);
                    }
                    catch (_l) { }
                }
                const fontCatalogUrl = ((_e = entry.style) === null || _e === void 0 ? void 0 : _e.glyphs)
                    ? undefined
                    : 'resources/fonts/Default_FontCatalog.json';
                mapView = new flywave_mapview_1.MapView({
                    canvas,
                    context: ctx !== null && ctx !== void 0 ? ctx : undefined,
                    theme: {},
                    preserveDrawingBuffer: true,
                    pixelRatio: (_f = metadata.pixelRatio) !== null && _f !== void 0 ? _f : 1,
                    tileCacheSize: 0,
                    fontCatalog: fontCatalogUrl,
                    logarithmicDepthBuffer: false,
                    fovCalculation: { type: 'fixed', fov: 36.86989764584402 },
                });
                mapView.disableFading = true;
                const style = localizeStyle(entry.style);
                const scaleFactor = (_g = metadata.scaleFactor) !== null && _g !== void 0 ? _g : 1;
                if (scaleFactor !== 1 && style.layers) {
                    for (const layer of style.layers) {
                        if (!layer.layout)
                            continue;
                        if (layer.layout['icon-size'] !== undefined) {
                            layer.layout['icon-size'] = Number(layer.layout['icon-size']) * scaleFactor;
                        }
                        if (layer.layout['text-size'] !== undefined) {
                            layer.layout['text-size'] = Number(layer.layout['text-size']) * scaleFactor;
                        }
                    }
                }
                const dataSource = new MBStyleDataSource_1.MBStyleDataSource({
                    style,
                    decoder: new MBStyleDecoder_1.MBStyleDecoder(),
                });
                await mapView.addDataSource(dataSource);
                if (style.glyphs) {
                    try {
                        const { buildFontCatalogFromPBF } = await Promise.resolve().then(() => __importStar(require("../src/MBFontCatalogBuilder")));
                        const { parseGlyphPBF } = await Promise.resolve().then(() => __importStar(require("../src/GlyphPBFParser")));
                        const glyphsUrl = style.glyphs;
                        const fontStacks = new Set();
                        for (const layer of ((_h = style.layers) !== null && _h !== void 0 ? _h : [])) {
                            const tf = (_j = layer.layout) === null || _j === void 0 ? void 0 : _j['text-font'];
                            if (Array.isArray(tf)) {
                                for (const f of tf)
                                    fontStacks.add(f);
                            }
                        }
                        if (fontStacks.size === 0)
                            fontStacks.add("Open Sans Regular");
                        const glyphs = new Map();
                        let catalogFontName = "";
                        for (const fontName of fontStacks) {
                            if (catalogFontName === "")
                                catalogFontName = fontName;
                            for (let range = 0; range < 8; range++) {
                                const start = range * 256;
                                const end = start + 255;
                                const url = glyphsUrl
                                    .replace('{fontstack}', encodeURIComponent(fontName))
                                    .replace('{range}', `${start}-${end}`)
                                    .replace(/^local:\/\//, '/base/@flywave/flywave-mbstyle-datasource/test/rendering/integration/');
                                try {
                                    const resp = await fetch(url);
                                    if (!resp.ok)
                                        continue;
                                    const fontstack = parseGlyphPBF(await resp.arrayBuffer());
                                    if (!fontstack)
                                        continue;
                                    for (const [id, g] of fontstack.glyphs)
                                        glyphs.set(id, g);
                                }
                                catch (_m) {
                                    continue;
                                }
                            }
                        }
                        if (glyphs.size > 0) {
                            const catalog = buildFontCatalogFromPBF(catalogFontName, glyphs);
                            mapView.textElementsRenderer.showReplacementGlyphs = true;
                            mapView.setFontCatalog("default", catalog);
                        }
                    }
                    catch (_o) { }
                }
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
                if (metadata.mapMode) {
                    dataSource.__mapMode = metadata.mapMode;
                }
                await renderFrames(mapView, dataSource, 5);
                const operations = (_k = metadata.operations) !== null && _k !== void 0 ? _k : [];
                if (operations.length > 0) {
                    await processOperations(mapView, dataSource, operations);
                    await renderFrames(mapView, dataSource, 3);
                }
                const maxMismatch = Math.ceil((imageThreshold * canvas.width * canvas.height) || 0);
                await ibct.assertCanvasMatchesReference(canvas, entry.name, {
                    threshold: 0.1,
                    maxMismatchedPixels: maxMismatch,
                });
                mapView.dispose();
            }
            finally {
                if (mapView) {
                    try {
                        mapView.dispose();
                    }
                    catch (_p) { }
                }
                if (canvas) {
                    canvas.width = 0;
                    canvas.height = 0;
                    canvas = undefined;
                }
            }
        });
    }
});
//# sourceMappingURL=MBStyleCompatRenderTest.js.map