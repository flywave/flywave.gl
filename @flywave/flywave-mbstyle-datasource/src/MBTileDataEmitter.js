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
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.MBTileDataEmitter = void 0;
const flywave_datasource_protocol_1 = require("@flywave/flywave-datasource-protocol");
const flywave_geoutils_1 = require("@flywave/flywave-geoutils");
const THREE = __importStar(require("three"));
const MBExpressionEngine_1 = require("./MBExpressionEngine");
const flywave_lines_1 = require("@flywave/flywave-lines");
const TextShaping_1 = require("./TextShaping");
const flywave_geoutils_2 = require("@flywave/flywave-geoutils");
const earcut_1 = __importDefault(require("earcut"));
const tmpV3 = new THREE.Vector3();
function parseProgressStopsStatic(raw) {
    if (!raw)
        return undefined;
    if (!Array.isArray(raw) && typeof raw === 'object') {
        try {
            raw = JSON.parse(JSON.stringify(raw));
        }
        catch (_a) {
            return undefined;
        }
    }
    while (Array.isArray(raw) && raw[0] === 'memo')
        raw = raw[1];
    if (!Array.isArray(raw) || raw[0] !== 'interpolate')
        return undefined;
    const input = raw[1];
    if (!Array.isArray(input) || !JSON.stringify(input).includes('line-progress'))
        return undefined;
    const stops = [];
    for (let i = 3; i + 1 < raw.length; i += 2) {
        const t = Number(raw[i]);
        const v = Number(raw[i + 1]);
        if (Number.isFinite(t) && Number.isFinite(v))
            stops.push([t, v]);
    }
    return stops.length > 1 ? stops : undefined;
}
function interpProgressStops(stops, t) {
    if (t <= stops[0][0])
        return stops[0][1];
    if (t >= stops[stops.length - 1][0])
        return stops[stops.length - 1][1];
    for (let i = 0; i < stops.length - 1; i++) {
        if (t >= stops[i][0] && t <= stops[i + 1][0]) {
            const f = (t - stops[i][0]) / Math.max(stops[i + 1][0] - stops[i][0], 1e-9);
            return stops[i][1] + (stops[i + 1][1] - stops[i][1]) * f;
        }
    }
    return stops[stops.length - 1][1];
}
function dashSumDash(dashArr) {
    let s = 0;
    for (let i = 0; i < dashArr.length; i += 2)
        s += Number(dashArr[i]) || 0;
    return s;
}
const EXTENTS = 4096;
function lat2tile(lat, zoom) {
    return Math.round(((1 - Math.log(Math.tan((lat * Math.PI) / 180) + 1 / Math.cos((lat * Math.PI) / 180)) / Math.PI) / 2) * Math.pow(2, zoom));
}
function tileYToLat(top, py, scale) {
    const n = Math.PI - (2 * Math.PI * (top + py)) / scale;
    return (180 / Math.PI) * Math.atan(Math.sinh(n));
}
const RESAMPLE_MAX_SEG_PX = 32;
function resampleLinePoints(positions, _extents) {
    const n = positions.length;
    if (n < 2) {
        const copy = [];
        for (let i = 0; i < n; i++)
            copy.push(positions[i]);
        return copy;
    }
    const out = [positions[0]];
    for (let i = 1; i < n; i++) {
        subdivideInto(positions[i - 1], positions[i], out);
    }
    return out;
}
function subdivideInto(a, b, out) {
    const stack = [[a, b]];
    while (stack.length > 0) {
        const [pa, pb] = stack.pop();
        const dx = pb.x - pa.x;
        const dy = pb.y - pa.y;
        const dist = Math.hypot(dx, dy);
        if (dist <= RESAMPLE_MAX_SEG_PX) {
            out.push(pb);
            continue;
        }
        const mid = pa.clone
            ? pa.clone().lerp(pb, 0.5)
            : new THREE.Vector2(pa.x + dx * 0.5, pa.y + dy * 0.5);
        stack.push([mid, pb]);
        stack.push([pa, mid]);
    }
}
function tile2world(extents, decodeInfo, px, py, target) {
    var _a;
    const { north, west } = decodeInfo.geoBox;
    const N = Math.log2(extents);
    const scale = Math.pow(2, decodeInfo.tileKey.level + N);
    const top = lat2tile(north, decodeInfo.tileKey.level + N);
    const left = Math.round(((west + 180) / 360) * scale);
    const R = flywave_geoutils_2.EarthConstants.EQUATORIAL_CIRCUMFERENCE;
    const proj = decodeInfo.targetProjection;
    if ((proj === null || proj === void 0 ? void 0 : proj.mbCustomProjection) === true) {
        const lng = ((left + px) / scale) * 360 - 180;
        const lat = tileYToLat(top, py, scale);
        const w = proj.projectPoint({ longitude: lng, latitude: lat, altitude: 0 });
        target.x = w.x;
        target.y = w.y;
        target.z = (_a = w.z) !== null && _a !== void 0 ? _a : 0;
        target.sub(decodeInfo.center);
        return;
    }
    target.x = ((left + px) / scale) * R;
    target.y = ((top + py) / scale) * R;
    target.z = 0;
    target.sub(decodeInfo.center);
}
class MBTileDataEmitter {
    constructor(m_tileKey, m_decodeInfo, m_zoom) {
        this.m_tileKey = m_tileKey;
        this.m_decodeInfo = m_decodeInfo;
        this.m_zoom = m_zoom;
        this.m_geometries = new Map();
        this.m_techniqueIndex = 0;
        this.m_techniques = [];
        this.m_layerToTechniqueIndex = new Map();
        this.m_bearing = 0;
        this.m_textGeometries = [];
        this.m_textPathGeometries = [];
        this.m_poiGeometries = [];
        this.m_stringCatalog = [];
        this.m_stringIndex = new Map();
        this.m_heatmapPoints = [];
        this.m_extents = 4096;
        this.m_currentZOffset = 0;
        this.m_maxGeometryHeight = 0;
        this.m_lineInterleaved = [];
        this.m_lineIndices = [];
        this.m_lineGroupStarts = [];
        this.m_lineSortKeys = [];
        this.m_lineAttr = [];
        this.m_preExtrudedLines = false;
    }
    setGlyphLookup(lookup) {
        this.m_glyphLookup = lookup;
    }
    setBearing(bearing) {
        this.m_bearing = bearing;
    }
    static setSpriteInfos(infos) {
        MBTileDataEmitter.s_spriteInfos = infos;
    }
    addHeatmapPoint(pos, weight, radius, techniqueIdx, radiusExpr, properties) {
        this.m_heatmapPoints.push(Object.assign({ x: pos.x, y: pos.y, z: pos.z, weight, radius, technique: techniqueIdx }, (radiusExpr !== undefined ? { radiusExpr, properties } : {})));
    }
    static exprDependsOnZoom(raw) {
        var _a;
        if (Array.isArray(raw)) {
            for (const el of raw) {
                if (typeof el === 'string' && el === 'zoom')
                    return true;
                if (Array.isArray(el) && MBTileDataEmitter.exprDependsOnZoom(el))
                    return true;
            }
            return false;
        }
        if (raw !== null && typeof raw === 'object' && !Array.isArray(raw) && Array.isArray(raw.stops)) {
            const first = (_a = raw.stops[0]) === null || _a === void 0 ? void 0 : _a[0];
            if (first !== null && typeof first === 'object' && !Array.isArray(first))
                return 'zoom' in first;
            return typeof first === 'number';
        }
        return false;
    }
    getStringIndex(s) {
        let idx = this.m_stringIndex.get(s);
        if (idx === undefined) {
            idx = this.m_stringCatalog.length;
            this.m_stringCatalog.push(s);
            this.m_stringIndex.set(s, idx);
        }
        return idx;
    }
    setExtents(extents) {
        this.m_extents = extents > 0 ? extents : 4096;
    }
    get extents() { return this.m_extents; }
    getOrCreateGeometry(key) {
        let geo = this.m_geometries.get(key);
        if (!geo) {
            geo = {
                positions: [],
                indices: [],
                extrusionAxis: [],
                uvs: [],
                edgeIndex: [],
                edgeFeatureStarts: [],
                groups: [],
                featureStarts: [],
                objInfos: [],
            };
            this.m_geometries.set(key, geo);
        }
        return geo;
    }
    project(p) {
        tile2world(this.m_extents, this.m_decodeInfo, p.x, p.y, tmpV3);
        if (this.m_currentZOffset !== 0) {
            tmpV3.z += this.m_currentZOffset;
        }
        return tmpV3.clone();
    }
    projectWorld(p) {
        return this.project(p).add(this.m_decodeInfo.center);
    }
    noteGeometryHeight(z) {
        if (z > this.m_maxGeometryHeight) {
            this.m_maxGeometryHeight = z;
        }
    }
    static scaleColorByAlpha(value) {
        if (typeof value !== 'string')
            return value;
        const m = value.match(/^rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)(?:\s*,\s*([\d.]+))?\s*\)/i);
        if (m) {
            if (m[4] === undefined || Number(m[4]) >= 1)
                return value;
            const a = Number(m[4]);
            if (a <= 0)
                return null;
            return `rgb(${Math.round(+m[1] * a)}, ${Math.round(+m[2] * a)}, ${Math.round(+m[3] * a)})`;
        }
        if (/^#[0-9a-f]{8}$/i.test(value)) {
            const a = parseInt(value.slice(7, 9), 16) / 255;
            if (a >= 1)
                return value.slice(0, 7);
            if (a <= 0)
                return null;
            const ch = [1, 3, 5].map(i => Math.round(parseInt(value.slice(i, i + 2), 16) * a));
            return `rgb(${ch[0]}, ${ch[1]}, ${ch[2]})`;
        }
        if (/^#[0-9a-f]{4}$/i.test(value)) {
            const a = parseInt(value[3], 16) / 15;
            if (a >= 1)
                return value.slice(0, 4);
            if (a <= 0)
                return null;
            const ch = [0, 1, 2].map(i => Math.round(parseInt(value[i], 16) * 17 * a));
            return `rgb(${ch[0]}, ${ch[1]}, ${ch[2]})`;
        }
        return value;
    }
    static deriveAutoBorderColor(borderColor, lineColor) {
        const auto = borderColor === undefined || borderColor === '#000000';
        if (!auto)
            return borderColor;
        const c = new THREE.Color(lineColor).convertLinearToSRGB();
        const Y = (c.r * 0.299 + c.g * 0.587 + c.b * 0.114);
        const a = 1;
        if (a > 0.25 && Y < 0.25) {
            const adjustment = Y > 0 ? 0.5 / Y : 0.45;
            const r = Math.min(255, Math.round(c.r * 255 * (1 + adjustment)));
            const g = Math.min(255, Math.round(c.g * 255 * (1 + adjustment)));
            const b = Math.min(255, Math.round(c.b * 255 * (1 + adjustment)));
            return `rgb(${r}, ${g}, ${b})`;
        }
        const k = 0.6;
        return `rgb(${Math.round(c.r * 255 * k)}, ${Math.round(c.g * 255 * k)}, ${Math.round(c.b * 255 * k)})`;
    }
    resolveZOffset(layer, properties, type) {
        var _a, _b, _c, _d, _e, _f, _g, _h;
        const paint = (_a = layer.paint) !== null && _a !== void 0 ? _a : {};
        const layout = (_b = layer.layout) !== null && _b !== void 0 ? _b : {};
        let z = Number((_d = (_c = paint[`${type}-z-offset`]) !== null && _c !== void 0 ? _c : layout[`${type}-z-offset`]) !== null && _d !== void 0 ? _d : 0);
        const elevRef = layout[`${type}-elevation-reference`];
        if (elevRef) {
            const featElev = Number((_h = (_g = (_f = (_e = properties === null || properties === void 0 ? void 0 : properties.elevation) !== null && _e !== void 0 ? _e : properties === null || properties === void 0 ? void 0 : properties.height) !== null && _f !== void 0 ? _f : properties === null || properties === void 0 ? void 0 : properties.z) !== null && _g !== void 0 ? _g : properties === null || properties === void 0 ? void 0 : properties.level) !== null && _h !== void 0 ? _h : 0);
            z += elevRef === 'hd-road-markup'
                ? featElev + 0.1
                : featElev;
        }
        return z;
    }
    extractSortKey(layer) {
        var _a, _b, _c, _d;
        const layout = (_a = layer.layout) !== null && _a !== void 0 ? _a : {};
        const sk = (_d = (_c = (_b = layout['fill-sort-key']) !== null && _b !== void 0 ? _b : layout['line-sort-key']) !== null && _c !== void 0 ? _c : layout['circle-sort-key']) !== null && _d !== void 0 ? _d : layout['symbol-sort-key'];
        return typeof sk === 'number' ? sk : undefined;
    }
    paintToTechniqueProps(layer, properties, symbolMode) {
        var _a, _b, _c, _d, _e, _f, _g, _h, _j, _k, _l, _m, _o, _p, _q, _r, _s, _t, _u, _v, _w, _x, _y, _z, _0, _1, _2, _3, _4, _5, _6, _7, _8, _9, _10, _11, _12, _13, _14, _15, _16, _17, _18, _19, _20, _21, _22, _23, _24, _25, _26, _27, _28, _29, _30, _31, _32, _33, _34, _35, _36, _37, _38, _39, _40, _41, _42, _43, _44, _45, _46, _47, _48, _49, _50, _51, _52, _53, _54, _55, _56, _57, _58, _59, _60, _61, _62, _63, _64, _65, _66, _67, _68, _69, _70, _71, _72, _73, _74, _75, _76, _77, _78, _79, _80, _81, _82, _83, _84, _85, _86, _87, _88, _89, _90, _91, _92;
        const p = layer.paint;
        const l = layer.layout;
        const props = {};
        switch (layer.type) {
            case 'background':
                props.technique = 'fill';
                props.color = (_a = p['background-color']) !== null && _a !== void 0 ? _a : '#000000';
                props.opacity = (_b = p['background-opacity']) !== null && _b !== void 0 ? _b : 1;
                props.renderOrder = -Infinity;
                break;
            case 'fill':
                props.technique = 'fill';
                props.color = (_c = p['fill-color']) !== null && _c !== void 0 ? _c : '#000000';
                props.opacity = (_d = p['fill-opacity']) !== null && _d !== void 0 ? _d : 1;
                props.outlineColor = p['fill-outline-color'];
                props._translate = (_e = p['fill-translate']) !== null && _e !== void 0 ? _e : [0, 0];
                props._translateAnchor = (_f = p['fill-translate-anchor']) !== null && _f !== void 0 ? _f : 'map';
                if (p['fill-pattern']) {
                    props._patternName = p['fill-pattern'];
                    props._patternCrossFade = (_g = p['fill-pattern-cross-fade']) !== null && _g !== void 0 ? _g : 1;
                    const fade = Number((_h = p['fill-pattern-cross-fade']) !== null && _h !== void 0 ? _h : 1);
                    if (Number.isFinite(fade) && fade > 0 && fade < 1) {
                        let rawPat = (_k = (_j = layer.paintDefs) === null || _j === void 0 ? void 0 : _j['fill-pattern']) === null || _k === void 0 ? void 0 : _k.value;
                        if (!Array.isArray(rawPat) && typeof rawPat === 'object') {
                            try {
                                rawPat = JSON.parse(JSON.stringify(rawPat));
                            }
                            catch (_93) {
                                rawPat = undefined;
                            }
                        }
                        while (Array.isArray(rawPat) && rawPat[0] === 'memo')
                            rawPat = rawPat[1];
                        if (Array.isArray(rawPat) && rawPat[0] === 'image') {
                            for (const cand of rawPat.slice(1)) {
                                if (typeof cand === 'string' && cand !== props._patternName) {
                                    props._patternName2 = cand;
                                    break;
                                }
                            }
                        }
                    }
                }
                const fillElevRef = l['fill-elevation-reference'];
                if (fillElevRef) {
                    const featElev = Number((_p = (_o = (_m = (_l = properties === null || properties === void 0 ? void 0 : properties.elevation) !== null && _l !== void 0 ? _l : properties === null || properties === void 0 ? void 0 : properties.height) !== null && _m !== void 0 ? _m : properties === null || properties === void 0 ? void 0 : properties.z) !== null && _o !== void 0 ? _o : properties === null || properties === void 0 ? void 0 : properties.level) !== null && _p !== void 0 ? _p : 0);
                    props._hdElevation = fillElevRef === 'hd-road-markup'
                        ? featElev + 0.1
                        : featElev;
                }
                if (l.visibility === 'none')
                    props.enabled = false;
                break;
            case 'line':
                props.technique = 'solid-line';
                props.color = (_q = p['line-color']) !== null && _q !== void 0 ? _q : '#000000';
                props.opacity = (_r = p['line-opacity']) !== null && _r !== void 0 ? _r : 1;
                const lineMeters = ((_s = l === null || l === void 0 ? void 0 : l['line-width-unit']) !== null && _s !== void 0 ? _s : 'pixels') === 'meters';
                const mppTech = flywave_geoutils_2.EarthConstants.EQUATORIAL_CIRCUMFERENCE /
                    (256 * Math.pow(2, this.m_zoom + 1));
                props.lineWidth = (_t = p['line-width']) !== null && _t !== void 0 ? _t : 1;
                if (lineMeters && typeof props.lineWidth === 'number') {
                    props.lineWidth = props.lineWidth / mppTech;
                }
                props.metricUnit = 'Pixel';
                props._translate = (_u = p['line-translate']) !== null && _u !== void 0 ? _u : [0, 0];
                props._translateAnchor = (_v = p['line-translate-anchor']) !== null && _v !== void 0 ? _v : 'map';
                const lineElevRef = l['line-elevation-reference'];
                if (lineElevRef) {
                    const featElev = Number((_y = (_x = (_w = properties === null || properties === void 0 ? void 0 : properties.elevation) !== null && _w !== void 0 ? _w : properties === null || properties === void 0 ? void 0 : properties.height) !== null && _x !== void 0 ? _x : properties === null || properties === void 0 ? void 0 : properties.z) !== null && _y !== void 0 ? _y : 0);
                    props._hdElevation = lineElevRef === 'hd-road-markup'
                        ? featElev + 0.1
                        : featElev;
                }
                if (p['line-pattern']) {
                    props._patternName = p['line-pattern'];
                    props._patternCrossFade = (_z = p['line-pattern-cross-fade']) !== null && _z !== void 0 ? _z : 1;
                }
                if (p['line-dasharray']) {
                    const arr = p['line-dasharray'];
                    const lw = (_0 = props.lineWidth) !== null && _0 !== void 0 ? _0 : 1;
                    if (arr.length >= 2) {
                        props.dashSize = arr[0] * lw;
                        props.gapSize = arr[1] * lw;
                        if (arr.length > 2) {
                            props.dashArray = arr.map((v) => v * lw);
                            let sum = 0;
                            for (const v of arr)
                                sum += v * lw;
                            props.dashTotalLength = sum;
                        }
                    }
                }
                if (p['line-gradient']) {
                    props._lineGradientStops = p['line-gradient'];
                }
                if (l.visibility === 'none')
                    props.enabled = false;
                break;
            case 'circle':
                props.technique = 'circles';
                props.color = (_1 = p['circle-color']) !== null && _1 !== void 0 ? _1 : '#000000';
                props.opacity = (_2 = p['circle-opacity']) !== null && _2 !== void 0 ? _2 : 1;
                props.size = (((_3 = p['circle-radius']) !== null && _3 !== void 0 ? _3 : 5) + Number((_4 = p['circle-stroke-width']) !== null && _4 !== void 0 ? _4 : 0)) * 2;
                props._translate = (_5 = p['circle-translate']) !== null && _5 !== void 0 ? _5 : [0, 0];
                props._translateAnchor = (_6 = p['circle-translate-anchor']) !== null && _6 !== void 0 ? _6 : 'map';
                if (l.visibility === 'none')
                    props.enabled = false;
                break;
            case 'symbol':
                if (symbolMode === 'icon' || (symbolMode === undefined && l['icon-image'])) {
                    props.technique = 'labeled-icon';
                    props.imageTexture = typeof l['icon-image'] === 'string'
                        ? (0, TextShaping_1.resolveTextField)(l['icon-image'], properties !== null && properties !== void 0 ? properties : {})
                        : l['icon-image'];
                    props.iconColor = (_7 = p['icon-color']) !== null && _7 !== void 0 ? _7 : '#000000';
                    props.opacity = (_8 = p['icon-opacity']) !== null && _8 !== void 0 ? _8 : 1;
                    props.iconScale = (_9 = l['icon-size']) !== null && _9 !== void 0 ? _9 : 1;
                    props._iconTranslate = (_10 = p['icon-translate']) !== null && _10 !== void 0 ? _10 : [0, 0];
                    props._iconTranslateAnchor = (_11 = p['icon-translate-anchor']) !== null && _11 !== void 0 ? _11 : 'map';
                    props._iconAnchor = (_12 = l['icon-anchor']) !== null && _12 !== void 0 ? _12 : 'center';
                    const iconOffsetArr = l['icon-offset'];
                    if (Array.isArray(iconOffsetArr)) {
                        const iconFontSize = (_13 = l['icon-size']) !== null && _13 !== void 0 ? _13 : 1;
                        props.iconXOffset = ((_14 = iconOffsetArr[0]) !== null && _14 !== void 0 ? _14 : 0) * iconFontSize;
                        props.iconYOffset = -(((_15 = iconOffsetArr[1]) !== null && _15 !== void 0 ? _15 : 0)) * iconFontSize;
                    }
                    const iconTextFit = l['icon-text-fit'];
                    if (iconTextFit && iconTextFit !== 'none' && l['text-field']) {
                        const fitRaw = typeof l['text-field'] === 'string'
                            ? l['text-field'] : String((_16 = l['text-field']) !== null && _16 !== void 0 ? _16 : '');
                        const fitResolved = (0, TextShaping_1.resolveTextField)(fitRaw, properties !== null && properties !== void 0 ? properties : {});
                        const fitTransform = (_17 = l['text-transform']) !== null && _17 !== void 0 ? _17 : 'none';
                        const fitShaped = (0, TextShaping_1.shapeText)((0, TextShaping_1.shapeRTLText)(fitResolved, fitTransform), {
                            fontSize: (_18 = l['text-size']) !== null && _18 !== void 0 ? _18 : 16,
                            maxWidth: (_19 = l['text-max-width']) !== null && _19 !== void 0 ? _19 : 10,
                            lineHeight: (_20 = l['text-line-height']) !== null && _20 !== void 0 ? _20 : 1.2,
                            letterSpacing: (_21 = l['text-letter-spacing']) !== null && _21 !== void 0 ? _21 : 0,
                            justify: (_22 = l['text-justify']) !== null && _22 !== void 0 ? _22 : 'center',
                            anchor: (_23 = l['text-anchor']) !== null && _23 !== void 0 ? _23 : 'center',
                            transform: 'none',
                            writingMode: l['text-writing-mode'],
                            glyphLookup: this.m_glyphLookup,
                            fontName: Array.isArray(l['text-font']) ? l['text-font'].join(',') : l['text-font'],
                        });
                        props._iconTextFit = iconTextFit;
                        props._iconTextFitPadding = (_24 = l['icon-text-fit-padding']) !== null && _24 !== void 0 ? _24 : [0, 0, 0, 0];
                        const fitTextSize = (_25 = l['text-size']) !== null && _25 !== void 0 ? _25 : 16;
                        const fitW = (fitShaped.right - fitShaped.left) * fitTextSize;
                        const fitH = (fitShaped.bottom - fitShaped.top) * fitTextSize;
                        const fitAnchor = (_26 = l['text-anchor']) !== null && _26 !== void 0 ? _26 : 'center';
                        let hAlign = 0.5;
                        let vAlign = 0.5;
                        if (/right/.test(fitAnchor))
                            hAlign = 1;
                        else if (/left/.test(fitAnchor))
                            hAlign = 0;
                        if (/bottom/.test(fitAnchor))
                            vAlign = 1;
                        else if (/top/.test(fitAnchor))
                            vAlign = 0;
                        props._iconFitTextL = (-hAlign) * fitW;
                        props._iconFitTextR = props._iconFitTextL + fitW;
                        props._iconFitTextT = (-vAlign) * fitH;
                        props._iconFitTextB = props._iconFitTextT + fitH;
                        props._iconFitTextW = fitW;
                        props._iconFitTextH = fitH;
                    }
                    {
                        const haloRaw = (_27 = p['icon-halo-color']) !== null && _27 !== void 0 ? _27 : 'rgba(0,0,0,0)';
                        const hm = typeof haloRaw === 'string'
                            ? haloRaw.match(/^rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)(?:\s*,\s*([\d.]+))?\s*\)/i)
                            : null;
                        if (hm) {
                            props._iconHaloColor = `rgb(${hm[1]}, ${hm[2]}, ${hm[3]})`;
                            props._iconHaloAlpha = hm[4] !== undefined ? Number(hm[4]) : 1;
                        }
                        else {
                            props._iconHaloColor = haloRaw;
                            props._iconHaloAlpha = 1;
                        }
                    }
                    props._iconHaloWidth = (_28 = p['icon-halo-width']) !== null && _28 !== void 0 ? _28 : 0;
                    props._iconHaloBlur = (_29 = p['icon-halo-blur']) !== null && _29 !== void 0 ? _29 : 0;
                    props._iconRotate = (_30 = l['icon-rotate']) !== null && _30 !== void 0 ? _30 : 0;
                    if (typeof l['symbol-sort-key'] === 'number')
                        props.priority = l['symbol-sort-key'];
                    props.iconMayOverlap = l['icon-allow-overlap'] === true;
                    props.distanceScale = 0;
                    props.mayOverlap = l['icon-allow-overlap'] === true;
                    props.iconReserveSpace = l['icon-ignore-placement'] !== true;
                    props.reserveSpace = l['icon-ignore-placement'] !== true;
                    if (l.visibility === 'none')
                        props.enabled = false;
                }
                else if (symbolMode === 'text' || (symbolMode === undefined && l['text-field'])) {
                    props.technique = 'text';
                    const rawText = typeof l['text-field'] === 'string'
                        ? l['text-field']
                        : String((_31 = l['text-field']) !== null && _31 !== void 0 ? _31 : '');
                    const resolvedText = (0, TextShaping_1.resolveTextField)(rawText, properties !== null && properties !== void 0 ? properties : {});
                    const transform = (_32 = l['text-transform']) !== null && _32 !== void 0 ? _32 : 'none';
                    const transformedText = (0, TextShaping_1.shapeRTLText)(resolvedText, transform);
                    props.text = transformedText;
                    props.color = (_33 = p['text-color']) !== null && _33 !== void 0 ? _33 : '#000000';
                    props.opacity = (_34 = p['text-opacity']) !== null && _34 !== void 0 ? _34 : 1;
                    props.size = (_35 = l['text-size']) !== null && _35 !== void 0 ? _35 : 16;
                    props.fontName = (_36 = l['text-font']) === null || _36 === void 0 ? void 0 : _36[0];
                    const shaped = (0, TextShaping_1.shapeText)(transformedText, {
                        fontSize: (_37 = l['text-size']) !== null && _37 !== void 0 ? _37 : 16,
                        maxWidth: (_38 = l['text-max-width']) !== null && _38 !== void 0 ? _38 : 10,
                        lineHeight: (_39 = l['text-line-height']) !== null && _39 !== void 0 ? _39 : 1.2,
                        letterSpacing: (_40 = l['text-letter-spacing']) !== null && _40 !== void 0 ? _40 : 0,
                        justify: (_41 = l['text-justify']) !== null && _41 !== void 0 ? _41 : 'center',
                        anchor: (_42 = l['text-anchor']) !== null && _42 !== void 0 ? _42 : 'center',
                        transform: 'none',
                        writingMode: l['text-writing-mode'],
                        glyphLookup: this.m_glyphLookup,
                        fontName: Array.isArray(l['text-font']) ? l['text-font'].join(',') : l['text-font'],
                    });
                    props._shaped = shaped;
                    props._textWidth = shaped.right - shaped.left;
                    props._textHeight = shaped.bottom - shaped.top;
                    props._textOffset = l['text-offset'];
                    props._textTranslate = (_43 = p['text-translate']) !== null && _43 !== void 0 ? _43 : [0, 0];
                    props._textTranslateAnchor = (_44 = p['text-translate-anchor']) !== null && _44 !== void 0 ? _44 : 'map';
                    const CATALOG_EM = 24;
                    const fontSize = (_45 = l['text-size']) !== null && _45 !== void 0 ? _45 : 16;
                    props.tracking = ((_46 = l['text-letter-spacing']) !== null && _46 !== void 0 ? _46 : 0) * CATALOG_EM;
                    props.leading = (((_47 = l['text-line-height']) !== null && _47 !== void 0 ? _47 : 1.2) - 1) * CATALOG_EM;
                    const maxWidth = l['text-max-width'];
                    if (typeof maxWidth === 'number') {
                        props.lineWidth = maxWidth * fontSize;
                        props.wrappingMode = 'Word';
                    }
                    props.rotation = ((_48 = l['text-rotate']) !== null && _48 !== void 0 ? _48 : 0) * Math.PI / 180;
                    const anchor = (_49 = l['text-anchor']) !== null && _49 !== void 0 ? _49 : 'center';
                    props.hAlignment = anchor.includes('left') ? 'Left'
                        : anchor.includes('right') ? 'Right' : 'Center';
                    props.vAlignment = anchor.startsWith('top') ? 'Below'
                        : anchor.startsWith('bottom') ? 'Above' : 'Center';
                    if (typeof l['symbol-sort-key'] === 'number')
                        props.priority = l['symbol-sort-key'];
                    props.mayOverlap = l['text-allow-overlap'] === true;
                    props.distanceScale = 0;
                    props.reserveSpace = l['text-ignore-placement'] !== true;
                    const textOffset = l['text-offset'];
                    if (Array.isArray(textOffset)) {
                        props.xOffset = ((_50 = textOffset[0]) !== null && _50 !== void 0 ? _50 : 0) * fontSize;
                        props.yOffset = -(((_51 = textOffset[1]) !== null && _51 !== void 0 ? _51 : 0)) * fontSize;
                    }
                    const radial = Number((_52 = l['text-radial-offset']) !== null && _52 !== void 0 ? _52 : 0);
                    if (radial !== 0) {
                        const R = Math.SQRT1_2;
                        const hasV = anchor.startsWith('top') || anchor.startsWith('bottom');
                        const hasH = anchor.includes('left') || anchor.includes('right');
                        const dxUnit = anchor.includes('left') ? R
                            : anchor.includes('right') ? -R : 0;
                        let dyUnit = anchor.startsWith('top') ? R
                            : anchor.startsWith('bottom') ? -R : 0;
                        if (!hasV && !hasH)
                            dyUnit = R;
                        props.xOffset = ((_53 = props.xOffset) !== null && _53 !== void 0 ? _53 : 0) + radial * dxUnit * fontSize;
                        props.yOffset = ((_54 = props.yOffset) !== null && _54 !== void 0 ? _54 : 0) - radial * dyUnit * fontSize;
                    }
                    if (l.visibility === 'none')
                        props.enabled = false;
                }
                break;
            case 'fill-extrusion':
                props.technique = 'extruded-polygon';
                {
                    const c = MBTileDataEmitter.scaleColorByAlpha((_55 = p['fill-extrusion-color']) !== null && _55 !== void 0 ? _55 : '#000000');
                    if (c === null) {
                        props.enabled = false;
                    }
                    else {
                        props.color = c;
                    }
                }
                props.opacity = (_56 = p['fill-extrusion-opacity']) !== null && _56 !== void 0 ? _56 : 1;
                props.enableDepthPrePass = false;
                props.height = (_57 = p['fill-extrusion-height']) !== null && _57 !== void 0 ? _57 : 0;
                props.floorHeight = (_58 = p['fill-extrusion-base']) !== null && _58 !== void 0 ? _58 : 0;
                props._translate = (_59 = p['fill-extrusion-translate']) !== null && _59 !== void 0 ? _59 : [0, 0];
                props._translateAnchor = (_60 = p['fill-extrusion-translate-anchor']) !== null && _60 !== void 0 ? _60 : 'map';
                props.animateExtrusion = false;
                if (p['fill-extrusion-pattern']) {
                    props._patternName = p['fill-extrusion-pattern'];
                    props._patternCrossFade = (_61 = p['fill-extrusion-pattern-cross-fade']) !== null && _61 !== void 0 ? _61 : 1;
                }
                if (l.visibility === 'none')
                    props.enabled = false;
                break;
            case 'heatmap':
                props.technique = 'circles';
                props._isHeatmap = true;
                props.color = '#0000ff';
                props.opacity = (_62 = p['heatmap-opacity']) !== null && _62 !== void 0 ? _62 : 1;
                props.size = (_63 = p['heatmap-radius']) !== null && _63 !== void 0 ? _63 : 30;
                props._heatmapIntensity = (_64 = p['heatmap-intensity']) !== null && _64 !== void 0 ? _64 : 1;
                props._heatmapWeight = (_65 = p['heatmap-weight']) !== null && _65 !== void 0 ? _65 : 1;
                props._heatmapColorStops = (_66 = p['heatmap-color']) !== null && _66 !== void 0 ? _66 : [
                    [0, 'rgba(0,0,255,0)'], [0.1, 'royalblue'], [0.3, 'cyan'],
                    [0.5, 'lime'], [0.7, 'yellow'], [1, 'red'],
                ];
                if (l.visibility === 'none')
                    props.enabled = false;
                break;
            case 'hillshade':
                props.technique = 'fill';
                props._isHillshade = true;
                props._hillshadeDemUrl = (_67 = properties === null || properties === void 0 ? void 0 : properties._hillshadeDemUrl) !== null && _67 !== void 0 ? _67 : '';
                props._hillshadeTileSize = (_68 = properties === null || properties === void 0 ? void 0 : properties._tileSize) !== null && _68 !== void 0 ? _68 : 256;
                props.color = (_69 = p['hillshade-shadow-color']) !== null && _69 !== void 0 ? _69 : '#000000';
                props.opacity = 1;
                props._hillshadeIntensity = (_70 = p['hillshade-exaggeration']) !== null && _70 !== void 0 ? _70 : 0.5;
                props._hillshadeAccent = (_71 = p['hillshade-accent-color']) !== null && _71 !== void 0 ? _71 : '#ffffff';
                props._hillshadeHighlight = (_72 = p['hillshade-highlight-color']) !== null && _72 !== void 0 ? _72 : '#ffffff';
                if (l.visibility === 'none')
                    props.enabled = false;
                break;
            case 'raster':
                props.technique = 'fill';
                props.color = '#ffffff';
                props.opacity = (_73 = p['raster-opacity']) !== null && _73 !== void 0 ? _73 : 1;
                props._rasterTileUrl = (_74 = properties === null || properties === void 0 ? void 0 : properties._rasterTileUrl) !== null && _74 !== void 0 ? _74 : '';
                props._isRaster = true;
                props._rasterUvRect = (_75 = properties === null || properties === void 0 ? void 0 : properties._rasterUvRect) !== null && _75 !== void 0 ? _75 : [0, 0, 1, 1];
                props._rasterHueRotate = (_76 = p['raster-hue-rotate']) !== null && _76 !== void 0 ? _76 : 0;
                props._rasterBrightnessMin = (_77 = p['raster-brightness-min']) !== null && _77 !== void 0 ? _77 : 0;
                props._rasterBrightnessMax = (_78 = p['raster-brightness-max']) !== null && _78 !== void 0 ? _78 : 1;
                props._rasterSaturation = (_79 = p['raster-saturation']) !== null && _79 !== void 0 ? _79 : 0;
                props._rasterContrast = (_80 = p['raster-contrast']) !== null && _80 !== void 0 ? _80 : 0;
                props._rasterElevation = (_81 = p['raster-elevation']) !== null && _81 !== void 0 ? _81 : 0;
                if (l.visibility === 'none')
                    props.enabled = false;
                break;
            case 'model':
                props.technique = 'model';
                props.modelId = (_83 = (_82 = l['model-id']) !== null && _82 !== void 0 ? _82 : properties === null || properties === void 0 ? void 0 : properties['model-id']) !== null && _83 !== void 0 ? _83 : '';
                props.opacity = 1;
                if (l.visibility === 'none')
                    props.enabled = false;
                break;
            case 'building':
                props.technique = 'extruded-polygon';
                props.color = (_84 = p['building-color']) !== null && _84 !== void 0 ? _84 : '#cccccc';
                props.opacity = 1;
                props.height = (_88 = (_87 = (_86 = (_85 = p['building-height']) !== null && _85 !== void 0 ? _85 : properties === null || properties === void 0 ? void 0 : properties.height) !== null && _86 !== void 0 ? _86 : properties === null || properties === void 0 ? void 0 : properties['building-height']) !== null && _87 !== void 0 ? _87 : properties === null || properties === void 0 ? void 0 : properties['height']) !== null && _88 !== void 0 ? _88 : 10;
                props.floorHeight = (_91 = (_90 = (_89 = p['building-base']) !== null && _89 !== void 0 ? _89 : properties === null || properties === void 0 ? void 0 : properties.base) !== null && _90 !== void 0 ? _90 : properties === null || properties === void 0 ? void 0 : properties['building-base']) !== null && _91 !== void 0 ? _91 : 0;
                props._roofColor = (_92 = p['building-roof-color']) !== null && _92 !== void 0 ? _92 : '#aaaaaa';
                if (l.visibility === 'none')
                    props.enabled = false;
                break;
        }
        return props;
    }
    static evaluatedCacheKey(layer) {
        try {
            return `${JSON.stringify(layer.paint)}|${JSON.stringify(layer.layout)}`;
        }
        catch (_a) {
            return '';
        }
    }
    getOrCreateTechniqueIndex(layer, properties, symbolMode) {
        const textKey = layer.type === 'symbol' && layer.layout['text-field']
            ? (0, TextShaping_1.resolveTextField)(typeof layer.layout['text-field'] === 'string' ? layer.layout['text-field'] : '', properties !== null && properties !== void 0 ? properties : {})
            : '';
        const iconKey = layer.type === 'symbol' && typeof layer.layout['icon-image'] === 'string'
            && layer.layout['icon-image'].includes('{')
            ? (0, TextShaping_1.resolveTextField)(layer.layout['icon-image'], properties !== null && properties !== void 0 ? properties : {})
            : '';
        const cacheKey = `${layer.id}:${symbolMode !== null && symbolMode !== void 0 ? symbolMode : ''}:${textKey}:${iconKey}:${MBTileDataEmitter.evaluatedCacheKey(layer)}`;
        let idx = this.m_layerToTechniqueIndex.get(cacheKey);
        if (idx === undefined) {
            idx = this.m_techniqueIndex++;
            this.m_layerToTechniqueIndex.set(cacheKey, idx);
            const props = this.paintToTechniqueProps(layer, properties, symbolMode);
            const preExtruded = props.technique === 'solid-line';
            const technique = Object.assign({ name: props.technique, _index: idx, _renderOrder: layer.renderOrder, renderOrder: layer.renderOrder, _layerId: layer.id, _paint: layer.paint, _layout: layer.layout, _preExtrudedLines: preExtruded }, props);
            if (preExtruded) {
                technique.lineWidth = 0.0001;
            }
            this.m_techniques.push(technique);
        }
        return idx;
    }
    processFillFeature(layerName, extents, geometry, properties, featureId, matchedLayers) {
        var _a, _b, _c, _d;
        for (const layer of matchedLayers) {
            const techniqueIdx = this.getOrCreateTechniqueIndex(layer, properties);
            this.m_currentZOffset = this.resolveZOffset(layer, properties, 'fill');
            this.noteGeometryHeight(this.m_currentZOffset);
            const key = `${layer.id}:fill:${techniqueIdx}`;
            const geo = this.getOrCreateGeometry(key);
            const featureStart = geo.indices.length;
            const isExtruded = ((_a = this.m_techniques[techniqueIdx]) === null || _a === void 0 ? void 0 : _a.name) === 'extruded-polygon' ||
                layer.type === 'fill-extrusion' ||
                layer.type === 'building';
            if (isExtruded) {
                this.emitExtrudedPolygon(geo, layer, geometry, techniqueIdx, featureStart, featureId, properties);
                continue;
            }
            const tech = this.m_techniques[techniqueIdx];
            const needsUv = Boolean((tech === null || tech === void 0 ? void 0 : tech._rasterTileUrl) || (tech === null || tech === void 0 ? void 0 : tech._hillshadeDemUrl));
            for (const polygon of geometry) {
                const rings = polygon.rings;
                if (rings.length === 0)
                    continue;
                const maxHoles = layer.paint['fill-limit-number-holes'];
                const effectiveRings = (maxHoles !== undefined && maxHoles >= 0)
                    ? [rings[0], ...rings.slice(1, 1 + maxHoles)]
                    : rings;
                const allVerts = [];
                const holeIndices = [];
                for (const pt of effectiveRings[0]) {
                    allVerts.push(pt.x, pt.y);
                }
                for (let r = 1; r < effectiveRings.length; r++) {
                    holeIndices.push(allVerts.length / 2);
                    for (const pt of effectiveRings[r]) {
                        allVerts.push(pt.x, pt.y);
                    }
                }
                let rbMinX = Infinity, rbMinY = Infinity, rbMaxX = -Infinity, rbMaxY = -Infinity;
                if (needsUv && tech._isRaster) {
                    for (let i = 0; i < allVerts.length; i += 2) {
                        if (allVerts[i] < rbMinX)
                            rbMinX = allVerts[i];
                        if (allVerts[i] > rbMaxX)
                            rbMaxX = allVerts[i];
                        if (allVerts[i + 1] < rbMinY)
                            rbMinY = allVerts[i + 1];
                        if (allVerts[i + 1] > rbMaxY)
                            rbMaxY = allVerts[i + 1];
                    }
                }
                const triIndices = (0, earcut_1.default)(allVerts, holeIndices.length > 0 ? holeIndices : null, 2);
                const startIdx = geo.positions.length / 3;
                const vertCount2d = allVerts.length / 2;
                for (let i = 0; i < vertCount2d; i++) {
                    const w = this.project(new THREE.Vector2(allVerts[i * 2], allVerts[i * 2 + 1]));
                    const rasElev = Number((_b = tech._rasterElevation) !== null && _b !== void 0 ? _b : 0);
                    geo.positions.push(w.x, w.y, w.z + rasElev);
                    if (needsUv) {
                        if (tech._isRaster && rbMaxX > rbMinX && rbMaxY > rbMinY) {
                            geo.uvs.push((allVerts[i * 2] - rbMinX) / (rbMaxX - rbMinX), (allVerts[i * 2 + 1] - rbMinY) / (rbMaxY - rbMinY));
                        }
                        else {
                            geo.uvs.push(allVerts[i * 2] / extents, allVerts[i * 2 + 1] / extents);
                        }
                    }
                }
                for (let i = 0; i < triIndices.length; i++) {
                    geo.indices.push(triIndices[i] + startIdx);
                }
            }
            if (!needsUv && ((_c = layer.paint) === null || _c === void 0 ? void 0 : _c['fill-outline-color'])) {
                for (const polygon of geometry) {
                    const rings = polygon.rings;
                    if (rings.length === 0)
                        continue;
                    this.emitFillOutline(layer, rings, properties, featureId);
                }
            }
            const count = geo.indices.length - featureStart;
            if (count > 0) {
                geo.groups.push({
                    start: featureStart,
                    count,
                    materialIndex: techniqueIdx,
                    sortKey: this.extractSortKey(layer),
                });
                geo.featureStarts.push(featureStart);
                geo.objInfos.push(Object.assign(Object.assign({}, properties), { $id: (_d = featureId !== null && featureId !== void 0 ? featureId : properties.$id) !== null && _d !== void 0 ? _d : null }));
            }
        }
    }
    emitFillOutline(layer, rings, properties, featureId) {
        var _a, _b, _c, _d;
        const outlineTechIdx = this.getOrCreateOutlineTechniqueIndex(layer);
        const key = `${layer.id}:fill-outline:${outlineTechIdx}`;
        const geo = this.getOrCreateGeometry(key);
        geo.edge = (_a = geo.edge) !== null && _a !== void 0 ? _a : [];
        geo.dist = (_b = geo.dist) !== null && _b !== void 0 ? _b : [];
        geo.len = (_c = geo.len) !== null && _c !== void 0 ? _c : [];
        const featureStart = geo.indices.length;
        const lineWidthPx = 2;
        const metersPerPixel = flywave_geoutils_2.EarthConstants.EQUATORIAL_CIRCUMFERENCE /
            (256 * Math.pow(2, this.m_zoom + 1));
        const worldHalfWidth = lineWidthPx * metersPerPixel / 2;
        for (const ring of rings) {
            if (ring.length < 2)
                continue;
            const closed = [...ring, ring[0]];
            const worldPts = [];
            for (const pt of closed) {
                const w = this.project(pt);
                worldPts.push(w.x, w.y, w.z);
            }
            this.emitRibbonBody(layer, geo, worldPts, worldHalfWidth);
        }
        const count = geo.indices.length - featureStart;
        if (count > 0) {
            geo.groups.push({
                start: featureStart,
                count,
                materialIndex: outlineTechIdx,
                sortKey: this.extractSortKey(layer),
            });
            geo.featureStarts.push(featureStart);
            const fid = (_d = featureId !== null && featureId !== void 0 ? featureId : properties.$id) !== null && _d !== void 0 ? _d : null;
            geo.objInfos.push(Object.assign(Object.assign({}, properties), { $id: fid }));
        }
    }
    emitExtrudedPolygon(geo, layer, geometry, techniqueIdx, featureStart, featureId, properties) {
        var _a, _b, _c;
        const rawHeight = (_a = layer.paint['fill-extrusion-height']) !== null && _a !== void 0 ? _a : 0;
        const rawFloor = (_b = layer.paint['fill-extrusion-base']) !== null && _b !== void 0 ? _b : 0;
        const floorHeight = rawFloor;
        const height = Math.max(rawFloor + 1, rawHeight);
        this.noteGeometryHeight(height + this.m_currentZOffset);
        for (const polygon of geometry) {
            const rings = polygon.rings;
            if (rings.length === 0)
                continue;
            const allVerts = [];
            const holeIndices = [];
            for (const pt of rings[0])
                allVerts.push(pt.x, pt.y);
            for (let r = 1; r < rings.length; r++) {
                holeIndices.push(allVerts.length / 2);
                for (const pt of rings[r])
                    allVerts.push(pt.x, pt.y);
            }
            const triIndices = (0, earcut_1.default)(allVerts, holeIndices.length > 0 ? holeIndices : null, 2);
            const ringCount = allVerts.length / 2;
            const baseVertex = geo.positions.length / 3;
            for (let i = 0; i < ringCount; i++) {
                const w = this.project(new THREE.Vector2(allVerts[i * 2], allVerts[i * 2 + 1]));
                geo.positions.push(w.x, w.y, floorHeight);
                geo.extrusionAxis.push(0, 0, 0, 0);
                geo.positions.push(w.x, w.y, height);
                geo.extrusionAxis.push(0, 0, height - floorHeight, 1);
            }
            for (let i = 0; i < triIndices.length; i++) {
                geo.indices.push(baseVertex + triIndices[i] * 2 + 1);
            }
            for (let r = 0; r < rings.length; r++) {
                const ring = rings[r];
                const ringStart = r === 0 ? 0 : holeIndices[r - 1];
                for (let i = 0; i < ring.length; i++) {
                    const a = ringStart + i;
                    const b = ringStart + (i + 1) % ring.length;
                    const b0 = baseVertex + a * 2;
                    const t0 = b0 + 1;
                    const b1 = baseVertex + b * 2;
                    const t1 = b1 + 1;
                    geo.indices.push(b0, t0, t1, t1, b1, b0);
                }
            }
            const edgeStart = geo.edgeIndex.length;
            const exterior = rings[0];
            for (let i = 0; i < exterior.length; i++) {
                const a = i;
                const b = (i + 1) % exterior.length;
                geo.edgeIndex.push(baseVertex + a * 2 + 1, baseVertex + b * 2 + 1);
            }
            geo.edgeFeatureStarts.push(edgeStart);
        }
        const count = geo.indices.length - featureStart;
        if (count > 0) {
            geo.groups.push({
                start: featureStart,
                count,
                materialIndex: techniqueIdx,
                sortKey: this.extractSortKey(layer),
            });
            geo.featureStarts.push(featureStart);
            geo.objInfos.push(Object.assign(Object.assign({}, properties), { $id: (_c = featureId !== null && featureId !== void 0 ? featureId : properties.$id) !== null && _c !== void 0 ? _c : null }));
        }
    }
    processLineFeature(layerName, extents, geometry, properties, featureId, matchedLayers) {
        var _a, _b, _c, _d, _e, _f, _g, _h, _j, _k, _l, _m, _o, _p, _q, _r, _s, _t, _u, _v, _w, _x, _y, _z;
        const needsResample = ((_a = this.m_decodeInfo.targetProjection) === null || _a === void 0 ? void 0 : _a.mbCustomProjection) === true;
        for (const layer of matchedLayers) {
            const dashArr = (_b = layer.paint) === null || _b === void 0 ? void 0 : _b['line-dasharray'];
            if (Array.isArray(dashArr) && dashArr.length >= 1 && dashSumDash(dashArr) <= 0) {
                continue;
            }
            const techniqueIdx = this.getOrCreateTechniqueIndex(layer, properties);
            this.m_currentZOffset = this.resolveZOffset(layer, properties, 'line');
            this.noteGeometryHeight(this.m_currentZOffset);
            for (const lineGeo of geometry) {
                const pts = needsResample
                    ? resampleLinePoints(lineGeo.positions, extents)
                    : lineGeo.positions;
                const worldPts = [];
                for (const pt of pts) {
                    const w = this.project(pt);
                    worldPts.push(w.x, w.y, w.z);
                }
                const translate = (_c = layer.paint) === null || _c === void 0 ? void 0 : _c['line-translate'];
                if (translate && (translate[0] !== 0 || translate[1] !== 0)) {
                    const mppT = flywave_geoutils_2.EarthConstants.EQUATORIAL_CIRCUMFERENCE /
                        (256 * Math.pow(2, this.m_zoom + 1));
                    let tx = translate[0];
                    let ty = translate[1];
                    const anchor = (_e = (_d = layer.paint) === null || _d === void 0 ? void 0 : _d['line-translate-anchor']) !== null && _e !== void 0 ? _e : 'map';
                    if (anchor === 'viewport' && this.m_bearing !== 0) {
                        const ang = this.m_bearing * Math.PI / 180;
                        const cos = Math.cos(ang);
                        const sin = Math.sin(ang);
                        const r0 = tx * cos - ty * sin;
                        const r1 = tx * sin + ty * cos;
                        tx = r0;
                        ty = r1;
                    }
                    const twx = tx * mppT;
                    const twy = -ty * mppT;
                    for (let i = 0; i < worldPts.length; i += 3) {
                        worldPts[i] += twx;
                        worldPts[i + 1] += twy;
                    }
                }
                const offsetPx = Number((_g = (_f = layer.paint) === null || _f === void 0 ? void 0 : _f['line-offset']) !== null && _g !== void 0 ? _g : 0);
                const center = this.m_decodeInfo.center;
                const mppOffset = flywave_geoutils_2.EarthConstants.EQUATORIAL_CIRCUMFERENCE /
                    (256 * Math.pow(2, this.m_zoom + 1));
                const offsetUnit = (_j = (_h = layer.layout) === null || _h === void 0 ? void 0 : _h['line-width-unit']) !== null && _j !== void 0 ? _j : 'pixels';
                const offsetWorld = offsetPx !== 0 && worldPts.length >= 6
                    ? (offsetUnit === 'meters' ? offsetPx : offsetPx * mppOffset)
                    : 0;
                const lineGeom = (0, flywave_lines_1.createLineGeometry)(center, worldPts, flywave_geoutils_1.webMercatorProjection);
                const lineWidthPx = Number((_l = (_k = layer.paint) === null || _k === void 0 ? void 0 : _k['line-width']) !== null && _l !== void 0 ? _l : 1);
                const metersPerPixel = flywave_geoutils_2.EarthConstants.EQUATORIAL_CIRCUMFERENCE /
                    (256 * Math.pow(2, this.m_zoom + 1));
                const widthUnit = (_o = (_m = layer.layout) === null || _m === void 0 ? void 0 : _m['line-width-unit']) !== null && _o !== void 0 ? _o : 'pixels';
                const worldHalfWidth = widthUnit === 'meters'
                    ? lineWidthPx / 2
                    : lineWidthPx * metersPerPixel / 2;
                let progressHalfWidths;
                const rawWidthSpec = (_q = (_p = layer.paintDefs) === null || _p === void 0 ? void 0 : _p['line-width']) === null || _q === void 0 ? void 0 : _q.value;
                const pwStops = parseProgressStopsStatic(rawWidthSpec);
                if (pwStops && worldPts.length >= 6) {
                    const cn = worldPts.length / 3;
                    const segLens = [0];
                    let total = 0;
                    for (let i = 1; i < cn; i++) {
                        total += Math.hypot(worldPts[i * 3] - worldPts[(i - 1) * 3], worldPts[i * 3 + 1] - worldPts[(i - 1) * 3 + 1], worldPts[i * 3 + 2] - worldPts[(i - 1) * 3 + 2]);
                        segLens.push(total);
                    }
                    if (total > 0) {
                        const halfOf = (w) => widthUnit === 'meters' ? w / 2 : (w * metersPerPixel) / 2;
                        progressHalfWidths = segLens.map(sl => halfOf(interpProgressStops(pwStops, sl / total)));
                    }
                }
                const verts = lineGeom.vertices;
                for (let v = 0; v < verts.length; v += 13) {
                    const sy = verts[v + 1] >= 0 ? 1 : -1;
                    verts[v + 3] += verts[v + 9] * worldHalfWidth * sy;
                    verts[v + 4] += verts[v + 10] * worldHalfWidth * sy;
                    verts[v + 5] += verts[v + 11] * worldHalfWidth * sy;
                }
                const skipSolidLine = Boolean(((_r = layer.paint) === null || _r === void 0 ? void 0 : _r['line-gradient']) ||
                    ((_s = layer.paint) === null || _s === void 0 ? void 0 : _s['line-pattern']) ||
                    (Number((_u = (_t = layer.paint) === null || _t === void 0 ? void 0 : _t['line-blur']) !== null && _u !== void 0 ? _u : 0) !== 0) ||
                    offsetWorld !== 0 ||
                    ((_v = layer.paint) === null || _v === void 0 ? void 0 : _v['line-blend-mode']) === 'additive');
                if (!skipSolidLine)
                    this.m_preExtrudedLines = true;
                const stride = 13;
                const baseVert = this.m_lineInterleaved.length / stride;
                if (!skipSolidLine) {
                    this.m_lineInterleaved.push(...lineGeom.vertices);
                    for (const idx of lineGeom.indices) {
                        this.m_lineIndices.push(idx + baseVert);
                    }
                    const start = this.m_lineIndices.length - lineGeom.indices.length;
                    const fid = (_w = featureId !== null && featureId !== void 0 ? featureId : properties.$id) !== null && _w !== void 0 ? _w : null;
                    this.m_lineGroupStarts.push(start, techniqueIdx);
                    this.m_lineSortKeys.push((_x = this.extractSortKey(layer)) !== null && _x !== void 0 ? _x : 0);
                    this.m_lineAttr.push(JSON.stringify(Object.assign(Object.assign({}, properties), { $id: fid })));
                }
                const cumDist = [0];
                for (let i = 1; i < worldPts.length / 3; i++) {
                    const d = Math.hypot(worldPts[i * 3] - worldPts[(i - 1) * 3], worldPts[i * 3 + 1] - worldPts[(i - 1) * 3 + 1], worldPts[i * 3 + 2] - worldPts[(i - 1) * 3 + 2]);
                    cumDist.push(cumDist[i - 1] + d);
                }
                const bwRawBorder = Number((_z = (_y = layer.paint) === null || _y === void 0 ? void 0 : _y['line-border-width']) !== null && _z !== void 0 ? _z : 0);
                const borderWorld = (bwRawBorder > 0 && !progressHalfWidths)
                    ? (widthUnit === 'meters' ? bwRawBorder : bwRawBorder * metersPerPixel)
                    : 0;
                const mainHalfWidth = Math.max(worldHalfWidth - borderWorld, 0);
                const aaDilate = lineWidthPx > 0 ? 0.5 * metersPerPixel : 0;
                const trueWidthPx = widthUnit === 'meters' ? lineWidthPx / metersPerPixel : lineWidthPx;
                this.emitRibbonFill(layer, worldPts, mainHalfWidth + aaDilate, cumDist, trueWidthPx > 0 ? trueWidthPx + 1 : 0, lineGeom, progressHalfWidths, offsetWorld, properties);
                if (!progressHalfWidths) {
                    this.emitRibbonBorder(layer, worldPts, worldHalfWidth, cumDist, metersPerPixel, offsetWorld);
                }
            }
        }
    }
    splitPathByAngle(path, maxAngleDeg) {
        const n = path.length / 3;
        if (n < 3)
            return [path];
        const maxRad = (maxAngleDeg * Math.PI) / 180;
        const segments = [];
        let start = 0;
        for (let i = 1; i < n - 1; i++) {
            const ax = path[(i + 1) * 3] - path[i * 3];
            const ay = path[(i + 1) * 3 + 1] - path[i * 3 + 1];
            const bx = path[i * 3] - path[(i - 1) * 3];
            const by = path[i * 3 + 1] - path[(i - 1) * 3 + 1];
            const la = Math.hypot(ax, ay) || 1;
            const lb = Math.hypot(bx, by) || 1;
            const cos = (ax * bx + ay * by) / (la * lb);
            const turn = Math.acos(Math.max(-1, Math.min(1, cos)));
            if (turn > maxRad) {
                const seg = path.slice(start * 3, (i + 1) * 3);
                if (seg.length >= 6)
                    segments.push(seg);
                start = i;
            }
        }
        const tail = path.slice(start * 3);
        if (tail.length >= 6)
            segments.push(tail);
        return segments.length > 0 ? segments : [path];
    }
    offsetPolyline(pts, ow) {
        const cn = pts.length / 3;
        if (ow === 0 || cn < 2)
            return;
        const offs = [];
        for (let i = 0; i < cn - 1; i++) {
            const ux = pts[(i + 1) * 3] - pts[i * 3];
            const uy = pts[(i + 1) * 3 + 1] - pts[i * 3 + 1];
            const l = Math.hypot(ux, uy) || 1;
            offs.push(uy / l * ow, -ux / l * ow);
        }
        for (let i = 0; i < cn; i++) {
            const prev = Math.max(i - 1, 0);
            const next = Math.min(i, cn - 2);
            pts[i * 3] += (offs[prev * 2] + offs[next * 2]) / 2;
            pts[i * 3 + 1] += (offs[prev * 2 + 1] + offs[next * 2 + 1]) / 2;
        }
    }
    emitRibbonBorder(layer, worldPts, worldHalfWidth, cumDist, metersPerPixel, offsetWorld = 0) {
        var _a, _b, _c, _d, _e, _f, _g, _h, _j, _k, _l, _m;
        const bwRaw = Number((_b = (_a = layer.paint) === null || _a === void 0 ? void 0 : _a['line-border-width']) !== null && _b !== void 0 ? _b : 0);
        if (!(bwRaw > 0) || worldPts.length < 6)
            return;
        const borderColor = MBTileDataEmitter.deriveAutoBorderColor((_d = (_c = layer.paint) === null || _c === void 0 ? void 0 : _c['line-border-color']) !== null && _d !== void 0 ? _d : '#000000', (_f = (_e = layer.paint) === null || _e === void 0 ? void 0 : _e['line-color']) !== null && _f !== void 0 ? _f : '#000000');
        const meters = ((_h = (_g = layer.layout) === null || _g === void 0 ? void 0 : _g['line-width-unit']) !== null && _h !== void 0 ? _h : 'pixels') === 'meters';
        const bwWorld = meters ? bwRaw : bwRaw * metersPerPixel;
        const borderHalf = Math.min(bwWorld / 2, worldHalfWidth);
        const shift = worldHalfWidth - borderHalf;
        const borderTechIdx = this.getOrCreateBorderTechniqueIndex(layer, borderColor);
        const key = `${layer.id}:line-border:${borderTechIdx}`;
        const geo = this.getOrCreateGeometry(key);
        geo.edge = (_j = geo.edge) !== null && _j !== void 0 ? _j : [];
        geo.dist = (_k = geo.dist) !== null && _k !== void 0 ? _k : [];
        geo.len = (_l = geo.len) !== null && _l !== void 0 ? _l : [];
        geo.offs = (_m = geo.offs) !== null && _m !== void 0 ? _m : [];
        if (offsetWorld !== 0) {
            this.m_techniques[borderTechIdx]._ribbonHasOffset = true;
        }
        const featureStart = geo.indices.length;
        for (const side of [1, -1]) {
            const pts = [...worldPts];
            this.offsetPolyline(pts, side * shift);
            this.emitRibbonBody(layer, geo, pts, borderHalf, cumDist, undefined, offsetWorld);
            this.emitRibbonCaps(layer, geo, pts, borderHalf, cumDist, undefined, offsetWorld);
        }
        const count = geo.indices.length - featureStart;
        if (count > 0) {
            geo.groups.push({
                start: featureStart,
                count,
                materialIndex: borderTechIdx,
                sortKey: this.extractSortKey(layer),
            });
            geo.featureStarts.push(featureStart);
            geo.objInfos.push({});
        }
    }
    getOrCreateBorderTechniqueIndex(layer, borderColor) {
        var _a, _b, _c;
        const borderGradSig = ((_a = layer.paint) === null || _a === void 0 ? void 0 : _a['line-gradient'])
            ? JSON.stringify(layer.paint['line-gradient']).slice(0, 512) : '';
        const key = `${layer.id}:line-border-tech:${String(borderColor)}:${borderGradSig}`;
        let idx = this.m_layerToTechniqueIndex.get(key);
        if (idx === undefined) {
            idx = this.m_techniqueIndex++;
            this.m_layerToTechniqueIndex.set(key, idx);
            const paint = (_b = layer.paint) !== null && _b !== void 0 ? _b : {};
            const technique = Object.assign(Object.assign({ name: 'fill', _index: idx, _renderOrder: layer.renderOrder + 0.4, renderOrder: layer.renderOrder + 0.4, _layerId: layer.id, _paint: Object.assign(Object.assign({}, paint), { 'fill-color': borderColor }), _layout: layer.layout, _isLineRibbon: true, _isLineBorder: true, _ribbonWidthPx: Number((_c = paint['line-border-width']) !== null && _c !== void 0 ? _c : 1), _ribbonBlurPx: 0 }, (paint['line-gradient'] ? { _lineGradientStops: paint['line-gradient'] } : {})), { color: borderColor, opacity: 1 });
            this.m_techniques.push(technique);
        }
        return idx;
    }
    emitRibbonFill(layer, worldPts, worldHalfWidth, cumDist, effectiveWidthPx, lineGeom, hwPerPoint, offsetWorld = 0, properties) {
        var _a, _b, _c, _d;
        const ribbonTechIdx = this.getOrCreateRibbonTechniqueIndex(layer, properties);
        if (effectiveWidthPx !== undefined) {
            this.m_techniques[ribbonTechIdx]._ribbonWidthPx = effectiveWidthPx;
        }
        const key = `${layer.id}:line-ribbon:${ribbonTechIdx}`;
        const geo = this.getOrCreateGeometry(key);
        geo.edge = (_a = geo.edge) !== null && _a !== void 0 ? _a : [];
        geo.dist = (_b = geo.dist) !== null && _b !== void 0 ? _b : [];
        geo.len = (_c = geo.len) !== null && _c !== void 0 ? _c : [];
        geo.offs = (_d = geo.offs) !== null && _d !== void 0 ? _d : [];
        if (offsetWorld !== 0) {
            this.m_techniques[ribbonTechIdx]._ribbonHasOffset = true;
        }
        const featureStart = geo.indices.length;
        this.emitRibbonBody(layer, geo, worldPts, worldHalfWidth, cumDist, hwPerPoint, offsetWorld);
        this.emitRibbonCaps(layer, geo, worldPts, worldHalfWidth, cumDist, hwPerPoint, offsetWorld);
        const count = geo.indices.length - featureStart;
        if (count > 0) {
            geo.groups.push({
                start: featureStart,
                count,
                materialIndex: ribbonTechIdx,
                sortKey: this.extractSortKey(layer),
            });
            geo.featureStarts.push(featureStart);
            geo.objInfos.push(Object.assign(Object.assign({}, (this.m_lineAttr.length > 0 ? JSON.parse(this.m_lineAttr[this.m_lineAttr.length - 1]) : {})), { $id: null }));
        }
    }
    emitRibbonBody(layer, geo, worldPts, worldHalfWidth, cumDist, hwPerPoint, offsetWorld = 0) {
        var _a, _b, _c, _d, _e, _f, _g, _h, _j, _k;
        const n0 = worldPts.length / 3;
        if (n0 < 2)
            return;
        const closed = n0 > 3 &&
            Math.abs(worldPts[0] - worldPts[(n0 - 1) * 3]) < 1e-9 &&
            Math.abs(worldPts[1] - worldPts[(n0 - 1) * 3 + 1]) < 1e-9;
        const m0 = closed ? n0 - 1 : n0;
        const pts = [];
        const rawD = [];
        const rawHW = [];
        for (let i = 0; i < m0; i++) {
            const m = pts.length / 3;
            if (m > 0 &&
                Math.abs(worldPts[i * 3] - worldPts[(m - 1) * 3]) < 1e-12 &&
                Math.abs(worldPts[i * 3 + 1] - worldPts[(m - 1) * 3 + 1]) < 1e-12 &&
                Math.abs(worldPts[i * 3 + 2] - worldPts[(m - 1) * 3 + 2]) < 1e-12) {
                continue;
            }
            pts.push(worldPts[i * 3], worldPts[i * 3 + 1], worldPts[i * 3 + 2]);
            rawD.push(cumDist ? cumDist[i] : i);
            rawHW.push(hwPerPoint ? hwPerPoint[i] : worldHalfWidth);
        }
        while (pts.length / 3 > 1 && closed) {
            const m = pts.length / 3;
            if (Math.abs(pts[0] - pts[(m - 1) * 3]) < 1e-12 &&
                Math.abs(pts[1] - pts[(m - 1) * 3 + 1]) < 1e-12) {
                pts.length -= 3;
                rawD.length -= 1;
                rawHW.length -= 1;
            }
            else
                break;
        }
        const np = pts.length / 3;
        if (np < (closed ? 3 : 2))
            return;
        const n = np;
        geo.offs = (_a = geo.offs) !== null && _a !== void 0 ? _a : [];
        const offsAt = (i) => {
            if (offsetWorld === 0)
                return [0, 0];
            const seg = (k) => {
                const j = closed ? (k + 1) % n : Math.min(k + 1, n - 1);
                const ux = pts[j * 3] - pts[k * 3];
                const uy = pts[j * 3 + 1] - pts[k * 3 + 1];
                const l = Math.hypot(ux, uy) || 1;
                return [uy / l * offsetWorld, -ux / l * offsetWorld];
            };
            if (n < 2)
                return [0, 0];
            if (!closed && i === 0)
                return seg(0);
            if (!closed && i >= n - 1)
                return seg(n - 2);
            const a = seg((i - 1 + n) % n);
            const b = seg(i);
            return [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
        };
        let total = rawD[n - 1];
        if (closed) {
            total += Math.hypot(pts[0] - pts[(n - 1) * 3], pts[1] - pts[(n - 1) * 3 + 1], pts[2] - pts[(n - 1) * 3 + 2]);
        }
        const distAt = (i) => {
            const t = rawD[((i % n) + n) % n];
            return total > 0 ? t / total : 0;
        };
        const lenAt = (i) => rawD[((i % n) + n) % n];
        const hwAt = (i) => rawHW[((i % n) + n) % n];
        const join = String((_c = (_b = layer.layout) === null || _b === void 0 ? void 0 : _b['line-join']) !== null && _c !== void 0 ? _c : 'miter');
        const miterLimit = Number((_e = (_d = layer.layout) === null || _d === void 0 ? void 0 : _d['line-miter-limit']) !== null && _e !== void 0 ? _e : 2);
        const roundLimit = Number((_g = (_f = layer.layout) === null || _f === void 0 ? void 0 : _f['line-round-limit']) !== null && _g !== void 0 ? _g : 1.05);
        if (join === 'none') {
            const STRAIGHT_COS = Math.cos(5 * Math.PI / 180);
            const patternedNone = ((_h = layer.paint) === null || _h === void 0 ? void 0 : _h['line-pattern']) !== undefined ||
                ((_j = layer.paint) === null || _j === void 0 ? void 0 : _j['line-dasharray']) !== undefined;
            const patternJoinNone = ((_k = layer.paint) === null || _k === void 0 ? void 0 : _k['line-pattern']) !== undefined;
            const segCount = closed ? n : n - 1;
            let runStart = 0;
            for (let s = 0; s < segCount; s++) {
                const e = (s + 1) % n;
                if (!closed && e < n - 1) {
                    const ex1 = pts[(e + 1) * 3] - pts[e * 3];
                    const ey1 = pts[(e + 1) * 3 + 1] - pts[e * 3 + 1];
                    const l1 = Math.hypot(ex1, ey1) || 1;
                    const ex0 = pts[e * 3] - pts[s * 3];
                    const ey0 = pts[e * 3 + 1] - pts[s * 3 + 1];
                    const l0 = Math.hypot(ex0, ey0) || 1;
                    if ((ex1 / l1) * (ex0 / l0) + (ey1 / l1) * (ey0 / l0) > STRAIGHT_COS)
                        continue;
                }
                const s0 = runStart;
                runStart = e;
                let ux = pts[e * 3] - pts[s0 * 3];
                let uy = pts[e * 3 + 1] - pts[s0 * 3 + 1];
                const l = Math.hypot(ux, uy) || 1;
                ux /= l;
                uy /= l;
                const nx = -uy, ny = ux;
                const extS = patternedNone || (s0 === 0 && !closed) ? 0 : hwAt(s0);
                const extE = patternedNone ? 0 : hwAt(e);
                const ax = pts[s0 * 3] - ux * extS, ay = pts[s0 * 3 + 1] - uy * extS, az = pts[s0 * 3 + 2];
                const bx = pts[e * 3] + ux * extE, by = pts[e * 3 + 1] + uy * extE, bz = pts[e * 3 + 2];
                const hwS = hwAt(s0), hwE = hwAt(e);
                const oS = offsAt(s0), oE = offsAt(e);
                const base = geo.positions.length / 3;
                geo.positions.push(ax + nx * hwS, ay + ny * hwS, az, bx + nx * hwE, by + ny * hwE, bz, bx - nx * hwE, by - ny * hwE, bz, ax - nx * hwS, ay - ny * hwS, az);
                geo.edge.push(1, 1, -1, -1);
                if (patternJoinNone) {
                    const segLen = Math.max(lenAt(e) - lenAt(s0), 1e-6);
                    const d0 = 0, dE = 1;
                    const l0 = 0, lE = lenAt(e) - lenAt(s0);
                    void segLen;
                    geo.dist.push(d0, dE, dE, d0);
                    geo.len.push(l0, lE, lE, l0);
                }
                else {
                    geo.dist.push(distAt(s0), distAt(e), distAt(e), distAt(s0));
                    geo.len.push(lenAt(s0), lenAt(e), lenAt(e), lenAt(s0));
                }
                geo.offs.push(oS[0], oS[1], oE[0], oE[1], oE[0], oE[1], oS[0], oS[1]);
                geo.indices.push(base, base + 3, base + 2, base, base + 2, base + 1);
            }
            return;
        }
        const dx = [];
        const dy = [];
        for (let i = 0; i < n; i++) {
            const j = closed ? (i + 1) % n : i + 1;
            if (!closed && j >= n) {
                dx.push(dx[i - 1]);
                dy.push(dy[i - 1]);
                continue;
            }
            const ux = pts[j * 3] - pts[i * 3];
            const uy = pts[j * 3 + 1] - pts[i * 3 + 1];
            const l = Math.hypot(ux, uy) || 1;
            dx.push(ux / l);
            dy.push(uy / l);
        }
        const px = (i) => pts[((i % n) + n) % n * 3];
        const py = (i) => pts[((i % n) + n) % n * 3 + 1];
        const pz = (i) => pts[((i % n) + n) % n * 3 + 2];
        const pushV = (x, y, z, e, d, l, o = [0, 0]) => {
            geo.positions.push(x, y, z);
            geo.edge.push(e);
            geo.dist.push(d);
            geo.len.push(l);
            geo.offs.push(o[0], o[1]);
            return geo.positions.length / 3 - 1;
        };
        const p3 = geo.positions;
        const pushTri = (i, j, k) => {
            const area2 = (p3[j * 3] - p3[i * 3]) * (p3[k * 3 + 1] - p3[i * 3 + 1]) -
                (p3[j * 3 + 1] - p3[i * 3 + 1]) * (p3[k * 3] - p3[i * 3]);
            if (area2 >= 0)
                geo.indices.push(i, j, k);
            else
                geo.indices.push(i, k, j);
        };
        const segCount = closed ? n : n - 1;
        for (let s = 0; s < segCount; s++) {
            const e = (s + 1) % n;
            const ux = dx[s], uy = dy[s];
            const nx = -uy, ny = ux;
            const dS = distAt(s), dE = distAt(e), lS = lenAt(s), lE = lenAt(e);
            const hwS = hwAt(s), hwE = hwAt(e);
            const oS = offsAt(s), oE = offsAt(e);
            const a1 = pushV(px(s) + nx * hwS, py(s) + ny * hwS, pz(s), 1, dS, lS, oS);
            const a2 = pushV(px(e) + nx * hwE, py(e) + ny * hwE, pz(e), 1, dE, lE, oE);
            const b1 = pushV(px(e) - nx * hwE, py(e) - ny * hwE, pz(e), -1, dE, lE, oE);
            const b2 = pushV(px(s) - nx * hwS, py(s) - ny * hwS, pz(s), -1, dS, lS, oS);
            pushTri(a1, b2, b1);
            pushTri(a1, b1, a2);
        }
        const firstCorner = closed ? 0 : 1;
        const lastCorner = closed ? n : n - 1;
        for (let i = firstCorner; i < lastCorner; i++) {
            const iN = (i - 1 + n) % n;
            const cx = px(i), cy = py(i), cz = pz(i);
            const cross = dx[iN] * dy[i] - dy[iN] * dx[i];
            if (cross === 0)
                continue;
            const s = cross > 0 ? -1 : 1;
            const pnx = -dy[iN] * s, pny = dx[iN] * s;
            const nx = -dy[i] * s, ny = dx[i] * s;
            const dI = distAt(i), lI = lenAt(i);
            const oI = offsAt(i);
            const dot = pnx * nx + pny * ny;
            const mLen = dot > 1e-6 ? 1 / dot : Infinity;
            const cosHalfTurn = Math.max(0, Math.sqrt((1 + Math.max(-1, Math.min(1, dx[iN] * dx[i] + dy[iN] * dy[i]))) / 2));
            const useRound = join === 'round' &&
                (cosHalfTurn <= 1e-6 || 1 / cosHalfTurn >= roundLimit);
            if (useRound) {
                const cV = pushV(cx, cy, cz, 0, dI, lI, oI);
                const a0 = Math.atan2(pny, pnx);
                let d = Math.atan2(ny, nx) - a0;
                while (d > Math.PI)
                    d -= 2 * Math.PI;
                while (d < -Math.PI)
                    d += 2 * Math.PI;
                const K = Math.max(1, Math.ceil(Math.abs(d) / (Math.PI / 8)));
                let prev = pushV(cx + Math.cos(a0) * hwAt(i), cy + Math.sin(a0) * hwAt(i), cz, s, dI, lI, oI);
                for (let k = 1; k <= K; k++) {
                    const th = a0 + (d * k) / K;
                    const v = pushV(cx + Math.cos(th) * hwAt(i), cy + Math.sin(th) * hwAt(i), cz, s, dI, lI, oI);
                    pushTri(cV, prev, v);
                    prev = v;
                }
            }
            else if ((join === 'miter' || join === 'round') && mLen <= miterLimit) {
                const o1 = pushV(cx + pnx * hwAt(i), cy + pny * hwAt(i), cz, s, dI, lI, oI);
                const o2 = pushV(cx + nx * hwAt(i), cy + ny * hwAt(i), cz, s, dI, lI, oI);
                let mx = pnx + nx, my = pny + ny;
                const ml = Math.hypot(mx, my) || 1;
                mx /= ml;
                my /= ml;
                const r = hwAt(i) / Math.max(1e-6, mx * pnx + my * pny);
                const apex = pushV(cx + mx * r, cy + my * r, cz, s, dI, lI, oI);
                const cV = pushV(cx, cy, cz, 0, dI, lI, oI);
                pushTri(o1, cV, apex);
                pushTri(cV, o2, apex);
            }
            else {
                const o1 = pushV(cx + pnx * hwAt(i), cy + pny * hwAt(i), cz, s, dI, lI, oI);
                const o2 = pushV(cx + nx * hwAt(i), cy + ny * hwAt(i), cz, s, dI, lI, oI);
                const cV = pushV(cx, cy, cz, 0, dI, lI, oI);
                pushTri(o1, cV, o2);
            }
        }
    }
    emitRibbonCaps(layer, geo, worldPts, worldHalfWidth, cumDist, hwPerPoint, offsetWorld = 0) {
        var _a, _b;
        const cap = (_a = layer.layout) === null || _a === void 0 ? void 0 : _a['line-cap'];
        if (cap !== 'round' && cap !== 'square')
            return;
        const n = worldPts.length / 3;
        if (n < 2)
            return;
        const x0 = worldPts[0], y0 = worldPts[1], z0 = worldPts[2];
        const xN = worldPts[(n - 1) * 3], yN = worldPts[(n - 1) * 3 + 1], zN = worldPts[(n - 1) * 3 + 2];
        if (Math.abs(x0 - xN) < 1e-9 && Math.abs(y0 - yN) < 1e-9)
            return;
        geo.offs = (_b = geo.offs) !== null && _b !== void 0 ? _b : [];
        const pushVertex = (x, y, z, e, d, l, o = [0, 0]) => {
            geo.positions.push(x, y, z);
            geo.edge.push(e);
            geo.dist.push(d);
            geo.len.push(l);
            geo.offs.push(o[0], o[1]);
            return geo.positions.length / 3 - 1;
        };
        const pushTri = (i, j, k) => {
            const px = geo.positions;
            const area2 = (px[j * 3] - px[i * 3]) * (px[k * 3 + 1] - px[i * 3 + 1]) -
                (px[j * 3 + 1] - px[i * 3 + 1]) * (px[k * 3] - px[i * 3]);
            if (area2 >= 0)
                geo.indices.push(i, j, k);
            else
                geo.indices.push(i, k, j);
        };
        for (const end of [0, 1]) {
            const cx = end === 0 ? x0 : xN;
            const cy = end === 0 ? y0 : yN;
            const cz = end === 0 ? z0 : zN;
            const oi = end === 0 ? 1 : n - 2;
            const ox = worldPts[oi * 3], oy = worldPts[oi * 3 + 1];
            let dx = cx - ox, dy = cy - oy;
            const dl = Math.hypot(dx, dy) || 1;
            dx /= dl;
            dy /= dl;
            const nx = -dy, ny = dx;
            const hw = hwPerPoint
                ? hwPerPoint[end === 0 ? 0 : worldPts.length / 3 - 1]
                : worldHalfWidth;
            const totalD = cumDist ? cumDist[n - 1] : 1;
            const dEnd = cumDist
                ? (end === 0 ? cumDist[0] : cumDist[n - 1]) / (totalD || 1)
                : end;
            const lEnd = cumDist ? (end === 0 ? cumDist[0] : cumDist[n - 1]) : end;
            let oEnd = [0, 0];
            if (offsetWorld !== 0) {
                const sgn = end === 0 ? -1 : 1;
                oEnd = [sgn * dy * offsetWorld, -sgn * dx * offsetWorld];
            }
            if (cap === 'square') {
                const a1 = pushVertex(cx + nx * hw, cy + ny * hw, cz, 1, dEnd, lEnd, oEnd);
                const a2 = pushVertex(cx - nx * hw, cy - ny * hw, cz, -1, dEnd, lEnd, oEnd);
                const c1 = pushVertex(cx + nx * hw + dx * hw, cy + ny * hw + dy * hw, cz, 1, dEnd, lEnd, oEnd);
                const c2 = pushVertex(cx - nx * hw + dx * hw, cy - ny * hw + dy * hw, cz, -1, dEnd, lEnd, oEnd);
                pushTri(a1, a2, c2);
                pushTri(a1, c2, c1);
            }
            else {
                const c = pushVertex(cx, cy, cz, 0, dEnd, lEnd, oEnd);
                const K = 8;
                const theta0 = Math.atan2(ny, nx);
                let prevV = -1;
                for (let k = 0; k <= K; k++) {
                    const th = theta0 + (Math.PI * k) / K;
                    const v = pushVertex(cx + Math.cos(th) * hw, cy + Math.sin(th) * hw, cz, 1, dEnd, lEnd, oEnd);
                    if (k === 0) {
                        prevV = v;
                        continue;
                    }
                    pushTri(c, prevV, v);
                    prevV = v;
                }
            }
        }
    }
    evaluateFloorLineWidth(layer, properties) {
        var _a, _b, _c, _d;
        const continuous = Number((_b = (_a = layer.paint) === null || _a === void 0 ? void 0 : _a['line-width']) !== null && _b !== void 0 ? _b : 1);
        const raw = (_d = (_c = layer.paintDefs) === null || _c === void 0 ? void 0 : _c['line-width']) === null || _d === void 0 ? void 0 : _d.value;
        if (raw === undefined || raw === null)
            return continuous;
        try {
            const ctx = {
                zoom: Math.max(0, Math.floor(this.m_zoom)),
                feature: properties !== undefined
                    ? { type: 'LineString', properties }
                    : undefined,
            };
            const v = MBExpressionEngine_1.MBExpressionEngine.evaluate(raw, ctx);
            const n = Number(v);
            return Number.isFinite(n) && n >= 0 ? n : continuous;
        }
        catch (_e) {
            return continuous;
        }
    }
    dashWorldFor(layer, dashArr, dashWidth, mppDash) {
        var _a, _b;
        const widthUnit = (_b = (_a = layer.layout) === null || _a === void 0 ? void 0 : _a['line-width-unit']) !== null && _b !== void 0 ? _b : 'pixels';
        const scale = widthUnit === 'meters' ? 1 : mppDash;
        return [
            dashArr[0] * dashWidth * scale,
            dashArr[1] * dashWidth * scale,
        ];
    }
    getOrCreateRibbonTechniqueIndex(layer, properties) {
        var _a, _b, _c, _d, _e, _f, _g, _h, _j, _k, _l, _m, _o, _p, _q, _r, _s, _t, _u, _v, _w;
        const color = (_b = (_a = layer.paint) === null || _a === void 0 ? void 0 : _a['line-color']) !== null && _b !== void 0 ? _b : '#000000';
        const opacity = (_d = (_c = layer.paint) === null || _c === void 0 ? void 0 : _c['line-opacity']) !== null && _d !== void 0 ? _d : 1;
        const gradient = (_e = layer.paint) === null || _e === void 0 ? void 0 : _e['line-gradient'];
        const patternName = (_f = layer.paint) === null || _f === void 0 ? void 0 : _f['line-pattern'];
        const dashArr = (_g = layer.paint) === null || _g === void 0 ? void 0 : _g['line-dasharray'];
        const hasDash = Array.isArray(dashArr) && dashArr.length >= 2;
        const dashWidth = this.evaluateFloorLineWidth(layer, properties);
        const dashSig = hasDash ? `${JSON.stringify(dashArr)}@${dashWidth}` : '';
        const gradSig = gradient ? JSON.stringify(gradient).slice(0, 512) : '';
        const key = `${layer.id}:line-ribbon-tech:${String(color)}:${String(opacity)}:${gradSig}:${patternName !== null && patternName !== void 0 ? patternName : ''}:${hasDash ? `dash:${dashSig}` : ''}`;
        let idx = this.m_layerToTechniqueIndex.get(key);
        if (idx === undefined) {
            idx = this.m_techniqueIndex++;
            this.m_layerToTechniqueIndex.set(key, idx);
            const paint = (_h = layer.paint) !== null && _h !== void 0 ? _h : {};
            const mppDash = flywave_geoutils_2.EarthConstants.EQUATORIAL_CIRCUMFERENCE /
                (256 * Math.pow(2, Math.floor(this.m_zoom + 1)));
            let patternWorld;
            if (patternName && MBTileDataEmitter.s_spriteInfos) {
                const info = MBTileDataEmitter.s_spriteInfos.get(patternName);
                if (info) {
                    const mpp = flywave_geoutils_2.EarthConstants.EQUATORIAL_CIRCUMFERENCE /
                        (256 * Math.pow(2, this.m_zoom + 1));
                    const pr = Number((_j = info.pixelRatio) !== null && _j !== void 0 ? _j : 1) || 1;
                    patternWorld = [info.width / pr * mpp, info.height / pr * mpp];
                }
            }
            let patternName2;
            let patternFade;
            const fadeVal = Number((_k = paint['line-pattern-cross-fade']) !== null && _k !== void 0 ? _k : NaN);
            if (patternName && Number.isFinite(fadeVal) && fadeVal > 0 && fadeVal < 1) {
                let rawPat = (_m = (_l = layer.paintDefs) === null || _l === void 0 ? void 0 : _l['line-pattern']) === null || _m === void 0 ? void 0 : _m.value;
                if (!Array.isArray(rawPat) && typeof rawPat === 'object') {
                    try {
                        rawPat = JSON.parse(JSON.stringify(rawPat));
                    }
                    catch (_x) {
                        rawPat = undefined;
                    }
                }
                while (Array.isArray(rawPat) && rawPat[0] === 'memo')
                    rawPat = rawPat[1];
                if (Array.isArray(rawPat) && rawPat[0] === 'image') {
                    for (const cand of rawPat.slice(1)) {
                        if (typeof cand === 'string' && cand !== patternName) {
                            patternName2 = cand;
                            break;
                        }
                    }
                    if (patternName2)
                        patternFade = fadeVal;
                }
            }
            const technique = Object.assign(Object.assign(Object.assign(Object.assign(Object.assign(Object.assign(Object.assign({ name: 'fill', _index: idx, _renderOrder: layer.renderOrder + 0.5, renderOrder: layer.renderOrder + 0.5, _layerId: layer.id, _paint: paint, _layout: layer.layout }, (gradient ? { _lineGradientStops: gradient } : {})), (patternName ? { _patternName: patternName } : {})), (patternWorld ? { _ribbonPatternWorld: patternWorld } : {})), (patternName2 ? { _patternName2: patternName2, _patternFade: patternFade } : {})), (Array.isArray(dashArr) && dashArr.length >= 1
                ? (dashSumDash(dashArr) <= 0
                    ? { _dashInvisible: true }
                    : (hasDash ? { _dashWorld: this.dashWorldFor(layer, dashArr, dashWidth, mppDash) } : {}))
                : {})), ((Array.isArray(paint['line-trim-offset']) || Array.isArray(paint['line-pattern-trim-offset']))
                ? {
                    _trimOffset: (_o = paint['line-trim-offset']) !== null && _o !== void 0 ? _o : paint['line-pattern-trim-offset'],
                    _trimColor: (_p = paint['line-trim-color']) !== null && _p !== void 0 ? _p : 'transparent',
                    _trimFade: (_q = paint['line-trim-fade-range']) !== null && _q !== void 0 ? _q : [0, 0],
                }
                : {})), { _isLineRibbon: true, _ribbonWidthPx: Number((_r = paint['line-width']) !== null && _r !== void 0 ? _r : 1), _ribbonFloorWidthPx: dashWidth, _ribbonBlurPx: Number((_s = paint['line-blur']) !== null && _s !== void 0 ? _s : 0), _translate: (_t = paint['line-translate']) !== null && _t !== void 0 ? _t : [0, 0], _translateAnchor: (_u = paint['line-translate-anchor']) !== null && _u !== void 0 ? _u : 'map', color: (_v = paint['line-color']) !== null && _v !== void 0 ? _v : '#000000', opacity: (_w = paint['line-opacity']) !== null && _w !== void 0 ? _w : 1 });
            this.m_techniques.push(technique);
        }
        return idx;
    }
    getOrCreateOutlineTechniqueIndex(layer) {
        var _a, _b, _c;
        const color = (_a = layer.paint) === null || _a === void 0 ? void 0 : _a['fill-outline-color'];
        const key = `${layer.id}:fill-outline-tech:${String(color)}`;
        let idx = this.m_layerToTechniqueIndex.get(key);
        if (idx === undefined) {
            idx = this.m_techniqueIndex++;
            this.m_layerToTechniqueIndex.set(key, idx);
            const paint = (_b = layer.paint) !== null && _b !== void 0 ? _b : {};
            const technique = {
                name: 'fill',
                _index: idx,
                _renderOrder: layer.renderOrder + 0.5,
                renderOrder: layer.renderOrder + 0.5,
                _layerId: layer.id,
                _paint: paint,
                _layout: layer.layout,
                color: color !== null && color !== void 0 ? color : '#000000',
                opacity: (_c = paint['fill-opacity']) !== null && _c !== void 0 ? _c : 1,
                _isFillOutline: true,
                _isLineRibbon: true,
                _ribbonWidthPx: 2,
            };
            this.m_techniques.push(technique);
        }
        return idx;
    }
    getLineGeometries() {
        if (this.m_lineInterleaved.length === 0 || this.m_lineIndices.length === 0)
            return [];
        const data = new Float32Array(this.m_lineInterleaved);
        const indices = new Uint32Array(this.m_lineIndices);
        const vertexCount = data.length / 13;
        const extCoords = new Float32Array(vertexCount * 3);
        const positions = new Float32Array(vertexCount * 3);
        const tangents = new Float32Array(vertexCount * 3);
        const biTangents = new Float32Array(vertexCount * 4);
        for (let v = 0; v < vertexCount; v++) {
            const src = v * 13;
            extCoords[v * 3] = data[src];
            extCoords[v * 3 + 1] = data[src + 1];
            extCoords[v * 3 + 2] = data[src + 2];
            positions[v * 3] = data[src + 3];
            positions[v * 3 + 1] = data[src + 4];
            positions[v * 3 + 2] = data[src + 5];
            tangents[v * 3] = data[src + 6];
            tangents[v * 3 + 1] = data[src + 7];
            tangents[v * 3 + 2] = data[src + 8];
            biTangents[v * 4] = data[src + 9];
            biTangents[v * 4 + 1] = data[src + 10];
            biTangents[v * 4 + 2] = data[src + 11];
            biTangents[v * 4 + 3] = data[src + 12];
        }
        const vertexAttributes = [
            { name: 'extrusionCoord', buffer: extCoords.buffer, type: 'float', itemCount: 3 },
            { name: 'position', buffer: positions.buffer, type: 'float', itemCount: 3 },
            { name: 'tangent', buffer: tangents.buffer, type: 'float', itemCount: 3 },
            { name: 'biTangent', buffer: biTangents.buffer, type: 'float', itemCount: 4 },
        ];
        const groups = [];
        const end = this.m_lineIndices.length;
        const numGroups = this.m_lineGroupStarts.length / 2;
        const order = Array.from({ length: numGroups }, (_, i) => i);
        if (numGroups > 1 && this.m_lineSortKeys.some(k => k !== 0)) {
            order.sort((a, b) => this.m_lineSortKeys[a] - this.m_lineSortKeys[b]);
        }
        const sortedAttrs = [];
        for (const i of order) {
            const start = this.m_lineGroupStarts[i * 2];
            const nextIdx = order.indexOf(i + 1);
            const nextStart = (i + 1) < numGroups
                ? this.m_lineGroupStarts[(i + 1) * 2] : end;
            groups.push({
                start,
                count: nextStart - start,
                technique: this.m_lineGroupStarts[i * 2 + 1],
            });
            sortedAttrs.push(JSON.parse(this.m_lineAttr[i]));
        }
        return [{
                type: flywave_datasource_protocol_1.GeometryType.SolidLine,
                vertexAttributes,
                index: {
                    name: 'index',
                    buffer: indices.buffer,
                    type: 'uint32',
                    itemCount: 1,
                },
                groups,
                featureStarts: groups.map(g => g.start),
                objInfos: sortedAttrs,
                attachments: [],
            }];
    }
    processPointFeature(layerName, extents, points, properties, featureId, matchedLayers) {
        var _a, _b, _c, _d, _e, _f, _g, _h, _j, _k, _l, _m, _o, _p, _q;
        for (const layer of matchedLayers) {
            if (layer.type === 'symbol') {
                this.m_currentZOffset = this.resolveZOffset(layer, properties, 'symbol');
                this.noteGeometryHeight(this.m_currentZOffset);
            }
            let modes;
            if (layer.type === 'symbol' && layer.layout['icon-image'] && layer.layout['text-field']) {
                modes = ['icon', 'text'];
            }
            else {
                modes = [undefined];
            }
            for (const mode of modes) {
                const techniqueIdx = this.getOrCreateTechniqueIndex(layer, properties, mode);
                const tech = this.m_techniques[techniqueIdx];
                if (layer.type === 'heatmap' && tech._isHeatmap) {
                    const weight = Number((_a = tech._heatmapWeight) !== null && _a !== void 0 ? _a : 1);
                    const radius = Number((_b = tech.size) !== null && _b !== void 0 ? _b : 30);
                    const rawRadius = (_d = (_c = layer.paintDefs) === null || _c === void 0 ? void 0 : _c['heatmap-radius']) === null || _d === void 0 ? void 0 : _d.value;
                    const zoomDep = MBTileDataEmitter.exprDependsOnZoom(rawRadius);
                    for (const pt of points) {
                        const w = this.projectWorld(pt);
                        this.addHeatmapPoint(w, weight, radius, techniqueIdx, zoomDep ? rawRadius : undefined, zoomDep ? properties : undefined);
                    }
                    continue;
                }
                const placement = (_e = layer.layout['symbol-placement']) !== null && _e !== void 0 ? _e : 'point';
                if (tech.name === 'text' && (placement === 'line' || placement === 'line-center')) {
                    const linePath = properties === null || properties === void 0 ? void 0 : properties._linePath;
                    if (Array.isArray(linePath) && linePath.length >= 2) {
                        const path = [];
                        let lenSqr = 0;
                        for (let i = 0; i < linePath.length; i++) {
                            const pt = linePath[i];
                            const w = this.projectWorld(new THREE.Vector3(pt[0], pt[1], 0));
                            path.push(w.x, w.y, w.z);
                            if (i > 0) {
                                const dx = w.x - path[(i - 1) * 3];
                                const dy = w.y - path[(i - 1) * 3 + 1];
                                const dz = w.z - path[(i - 1) * 3 + 2];
                                lenSqr += dx * dx + dy * dy + dz * dz;
                            }
                        }
                        const maxAngle = Number((_f = layer.layout['text-max-angle']) !== null && _f !== void 0 ? _f : 45);
                        const segments = this.splitPathByAngle(path, maxAngle);
                        for (const seg of segments) {
                            let segLen = 0;
                            for (let i = 3; i < seg.length; i += 3) {
                                segLen += Math.hypot(seg[i] - seg[i - 3], seg[i + 1] - seg[i - 2], seg[i + 2] - seg[i - 1]);
                            }
                            this.m_textPathGeometries.push({
                                path: seg,
                                pathLengthSqr: segLen * segLen,
                                text: tech.text,
                                technique: techniqueIdx,
                                objInfos: Object.assign(Object.assign({}, properties), { $id: (_g = featureId !== null && featureId !== void 0 ? featureId : properties.$id) !== null && _g !== void 0 ? _g : null }),
                            });
                        }
                    }
                    continue;
                }
                const key = `${layer.id}:point:${techniqueIdx}`;
                const geo = this.getOrCreateGeometry(key);
                const featureStart = geo.indices.length;
                const translatePx = layer.type === 'symbol'
                    ? (mode === 'text'
                        ? (_h = layer.paint) === null || _h === void 0 ? void 0 : _h['text-translate']
                        : (_j = layer.paint) === null || _j === void 0 ? void 0 : _j['icon-translate'])
                    : undefined;
                let twx = 0, twy = 0;
                if (translatePx && (translatePx[0] !== 0 || translatePx[1] !== 0)) {
                    let tx = translatePx[0];
                    let ty = translatePx[1];
                    const anchor = mode === 'text'
                        ? (_k = layer.paint) === null || _k === void 0 ? void 0 : _k['text-translate-anchor']
                        : (_l = layer.paint) === null || _l === void 0 ? void 0 : _l['icon-translate-anchor'];
                    if (anchor === 'viewport' && this.m_bearing !== 0) {
                        const ang = this.m_bearing * Math.PI / 180;
                        const cos = Math.cos(ang);
                        const sin = Math.sin(ang);
                        const r0 = tx * cos - ty * sin;
                        const r1 = tx * sin + ty * cos;
                        tx = r0;
                        ty = r1;
                    }
                    const mppS = flywave_geoutils_2.EarthConstants.EQUATORIAL_CIRCUMFERENCE /
                        (256 * Math.pow(2, this.m_zoom + 1));
                    twx = tx * mppS;
                    twy = -ty * mppS;
                }
                for (const pt of points) {
                    const w = this.project(pt);
                    geo.positions.push(w.x, w.y, w.z);
                    const ww = this.projectWorld(pt);
                    if (twx !== 0 || twy !== 0) {
                        ww.x += twx;
                        ww.y += twy;
                    }
                    if (tech.name === 'text' && tech.text) {
                        this.emitTextGeometry(techniqueIdx, ww, tech.text, Object.assign(Object.assign({}, properties), { $id: (_m = featureId !== null && featureId !== void 0 ? featureId : properties.$id) !== null && _m !== void 0 ? _m : null }));
                    }
                    else if (tech.name === 'labeled-icon') {
                        const iconName = tech.imageTexture;
                        const caption = (layer.layout['text-field'] && mode === 'icon')
                            ? '' : ((_o = tech.text) !== null && _o !== void 0 ? _o : '');
                        this.emitPoiGeometry(techniqueIdx, ww, iconName !== null && iconName !== void 0 ? iconName : '', caption || undefined, Object.assign(Object.assign({}, properties), { $id: (_p = featureId !== null && featureId !== void 0 ? featureId : properties.$id) !== null && _p !== void 0 ? _p : null }));
                    }
                }
                const count = points.length;
                geo.groups.push({
                    start: featureStart,
                    count,
                    materialIndex: techniqueIdx,
                    sortKey: this.extractSortKey(layer),
                });
                geo.featureStarts.push(featureStart);
                geo.objInfos.push(Object.assign(Object.assign({}, properties), { $id: (_q = featureId !== null && featureId !== void 0 ? featureId : properties.$id) !== null && _q !== void 0 ? _q : null }));
            }
        }
    }
    emitTextGeometry(techniqueIdx, pos, text, attrs) {
        let tg = this.m_textGeometries.find(t => t.technique === techniqueIdx);
        if (!tg) {
            tg = {
                positions: {
                    name: 'position',
                    buffer: new Float32Array(0).buffer,
                    type: 'float',
                    itemCount: 3,
                },
                texts: [],
                technique: techniqueIdx,
                stringCatalog: this.m_stringCatalog,
                objInfos: [],
            };
            this.m_textGeometries.push(tg);
        }
        if (!tg._positions)
            tg._positions = [];
        tg._positions.push(pos.x, pos.y, pos.z);
        tg.texts.push(this.getStringIndex(text));
        tg.objInfos.push(attrs);
    }
    emitPoiGeometry(techniqueIdx, pos, iconName, caption, attrs) {
        let pg = this.m_poiGeometries.find(p => p.technique === techniqueIdx);
        if (!pg) {
            pg = {
                positions: {
                    name: 'position',
                    buffer: new Float32Array(0).buffer,
                    type: 'float',
                    itemCount: 3,
                },
                texts: [],
                technique: techniqueIdx,
                stringCatalog: this.m_stringCatalog,
                objInfos: [],
                imageTextures: [],
            };
            this.m_poiGeometries.push(pg);
        }
        if (!pg._positions)
            pg._positions = [];
        pg._positions.push(pos.x, pos.y, pos.z);
        pg.texts.push(this.getStringIndex(caption !== null && caption !== void 0 ? caption : ''));
        pg.imageTextures.push(this.getStringIndex(iconName));
        pg.objInfos.push(attrs);
    }
    getDecodedTile() {
        const geometries = [];
        for (const [, geo] of this.m_geometries) {
            if (geo.positions.length === 0)
                continue;
            if (geo.groups.length > 1 && geo.groups.some(g => g.sortKey !== undefined)) {
                geo.groups.sort((a, b) => { var _a, _b; return ((_a = a.sortKey) !== null && _a !== void 0 ? _a : 0) - ((_b = b.sortKey) !== null && _b !== void 0 ? _b : 0); });
            }
            const positionArray = new Float32Array(geo.positions);
            const indexArray = geo.indices.length > 0 ? new Uint32Array(geo.indices) : undefined;
            const positionAttr = {
                name: 'position',
                buffer: positionArray.buffer,
                type: 'float',
                itemCount: 3,
            };
            const vertexAttributes = [positionAttr];
            if (geo.extrusionAxis.length > 0) {
                vertexAttributes.push({
                    name: 'extrusionAxis',
                    buffer: new Float32Array(geo.extrusionAxis).buffer,
                    type: 'float',
                    itemCount: 4,
                });
            }
            if (geo.edge && geo.edge.length > 0) {
                vertexAttributes.push({
                    name: 'aRibbonEdge',
                    buffer: new Float32Array(geo.edge).buffer,
                    type: 'float',
                    itemCount: 1,
                });
                if (geo.dist && geo.dist.length === geo.edge.length) {
                    vertexAttributes.push({
                        name: 'aRibbonDist',
                        buffer: new Float32Array(geo.dist).buffer,
                        type: 'float',
                        itemCount: 1,
                    });
                    if (geo.len && geo.len.length === geo.edge.length) {
                        vertexAttributes.push({
                            name: 'aRibbonLen',
                            buffer: new Float32Array(geo.len).buffer,
                            type: 'float',
                            itemCount: 1,
                        });
                    }
                    if (geo.offs && geo.offs.length === geo.edge.length * 2) {
                        vertexAttributes.push({
                            name: 'aRibbonOffs',
                            buffer: new Float32Array(geo.offs).buffer,
                            type: 'float',
                            itemCount: 2,
                        });
                    }
                }
            }
            if (geo.uvs.length > 0) {
                vertexAttributes.push({
                    name: 'uv',
                    buffer: new Float32Array(geo.uvs).buffer,
                    type: 'float',
                    itemCount: 2,
                });
            }
            const groups = geo.groups.map(g => ({
                start: g.start,
                count: g.count,
                technique: g.materialIndex,
            }));
            const geom = {
                type: flywave_datasource_protocol_1.GeometryType.Polygon,
                vertexAttributes,
                groups,
                featureStarts: geo.featureStarts,
                objInfos: geo.objInfos,
                attachments: [],
            };
            if (geo.edgeIndex.length > 0) {
                geom.edgeIndex = {
                    name: 'edgeIndex',
                    buffer: new Uint32Array(geo.edgeIndex).buffer,
                    type: 'uint32',
                    itemCount: 1,
                };
                geom.edgeFeatureStarts = geo.edgeFeatureStarts;
            }
            if (indexArray) {
                geom.index = {
                    name: 'index',
                    buffer: indexArray.buffer,
                    type: 'uint32',
                    itemCount: 1,
                };
            }
            geometries.push(geom);
        }
        const lineGeoms = this.getLineGeometries();
        for (const tg of [...this.m_textGeometries, ...this.m_poiGeometries]) {
            const positions = tg._positions;
            if (positions && positions.length > 0) {
                const arr = new Float64Array(positions);
                tg.positions = {
                    name: 'position',
                    buffer: arr.buffer,
                    type: 'float',
                    itemCount: 3,
                };
            }
        }
        const decodedTile = {
            techniques: this.m_techniques,
            geometries: [...geometries, ...lineGeoms],
        };
        if (this.m_maxGeometryHeight > 0) {
            decodedTile.maxGeometryHeight = this.m_maxGeometryHeight;
        }
        if (this.m_textGeometries.length > 0) {
            decodedTile.textGeometries = this.m_textGeometries;
        }
        if (this.m_textPathGeometries.length > 0) {
            decodedTile.textPathGeometries = this.m_textPathGeometries;
        }
        if (this.m_poiGeometries.length > 0) {
            decodedTile.poiGeometries = this.m_poiGeometries;
        }
        if (this.m_heatmapPoints.length > 0) {
            decodedTile.heatmapPoints = this.m_heatmapPoints;
        }
        return decodedTile;
    }
}
exports.MBTileDataEmitter = MBTileDataEmitter;
MBTileDataEmitter.s_spriteInfos = null;
//# sourceMappingURL=MBTileDataEmitter.js.map