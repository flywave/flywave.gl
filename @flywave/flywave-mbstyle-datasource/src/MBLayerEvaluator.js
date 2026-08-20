"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.MBLayerEvaluator = exports.LAYOUT_DEFAULTS = exports.PAINT_DEFAULTS = void 0;
const MBExpressionEngine_1 = require("./MBExpressionEngine");
const MBFilterCompiler_1 = require("./MBFilterCompiler");
const MBStyleSpec_1 = require("./MBStyleSpec");
exports.PAINT_DEFAULTS = {
    fill: {
        'fill-antialias': true,
        'fill-opacity': 1,
        'fill-color': '#000000',
        'fill-outline-color': undefined,
        'fill-pattern': undefined,
        'fill-translate': [0, 0],
        'fill-translate-anchor': 'map',
        'fill-z-offset': 0,
        'fill-elevation-reference': undefined,
        'fill-emissive-strength': 0,
        'fill-pattern-cross-fade': 0,
        'fill-construct-bridge-guard-rail': false,
    },
    line: {
        'line-opacity': 1,
        'line-color': '#000000',
        'line-width': 1,
        'line-gap-width': 0,
        'line-offset': 0,
        'line-blur': 0,
        'line-dasharray': undefined,
        'line-translate': [0, 0],
        'line-translate-anchor': 'map',
        'line-blend-mode': 'default',
        'line-blend-additive-clamp': 0,
        'line-width-unit': 'pixels',
        'line-trim-offset': [0, 1],
        'line-border-width': 0,
        'line-border-color': '#000000',
        'line-border-gradient': undefined,
        'line-emissive-strength': 0,
        'line-pattern-cross-fade': 0,
        'line-pitch': 0,
        'line-cutout-opacity': 0,
        'line-cutout-fade-width': 0,
        'line-cutout-shadow-opacity': 0,
        'line-occlusion-opacity': 0,
    },
    symbol: {
        'icon-opacity': 1,
        'icon-color': '#000000',
        'icon-halo-color': 'rgba(0,0,0,0)',
        'icon-halo-width': 0,
        'icon-halo-blur': 0,
        'icon-translate': [0, 0],
        'icon-translate-anchor': 'map',
        'text-opacity': 1,
        'text-color': '#000000',
        'text-halo-color': 'rgba(0,0,0,0)',
        'text-halo-width': 0,
        'text-halo-blur': 0,
        'text-translate': [0, 0],
        'text-translate-anchor': 'map',
        'icon-emissive-strength': 0,
        'text-emissive-strength': 0,
        'icon-occlusion-opacity': 0,
        'text-occlusion-opacity': 0,
        'icon-color-brightness-min': 0,
        'icon-color-brightness-max': 1,
        'icon-color-contrast': 0,
        'icon-color-saturation': 0,
        'icon-image-cross-fade': 0,
        'icon-size-scale-range': [0, Infinity],
        'symbol-z-offset': 0,
        'symbol-z-elevate': false,
    },
    circle: {
        'circle-radius': 5,
        'circle-color': '#000000',
        'circle-blur': 0,
        'circle-opacity': 1,
        'circle-stroke-width': 0,
        'circle-stroke-color': '#000000',
        'circle-stroke-opacity': 1,
        'circle-translate': [0, 0],
        'circle-translate-anchor': 'map',
    },
    'fill-extrusion': {
        'fill-extrusion-opacity': 1,
        'fill-extrusion-color': '#000000',
        'fill-extrusion-height': 0,
        'fill-extrusion-base': 0,
        'fill-extrusion-vertical-gradient': true,
        'fill-extrusion-vertical-scale': 1,
        'fill-extrusion-translate': [0, 0],
        'fill-extrusion-translate-anchor': 'map',
        'fill-extrusion-cutoff-fade-range': 0,
        'fill-extrusion-edge-radius': 0,
        'fill-extrusion-line-width': 0,
        'fill-extrusion-ambient-occlusion-intensity': 0,
        'fill-extrusion-ambient-occlusion-ground-radius': 0,
        'fill-extrusion-ambient-occlusion-ground-attenuation': 0,
        'fill-extrusion-ambient-occlusion-wall-radius': 0,
        'fill-extrusion-front-cutoff': 0,
        'fill-extrusion-base-alignment': 'terrain',
        'fill-extrusion-pattern-cross-fade': 0,
        'fill-extrusion-emissive-strength': 0,
        'fill-extrusion-flood-light-color': '#ffffff',
        'fill-extrusion-flood-light-intensity': 0,
        'fill-extrusion-flood-light-ground-radius': 0,
        'fill-extrusion-flood-light-wall-radius': 0,
    },
    background: {
        'background-color': '#000000',
        'background-opacity': 1,
    },
    heatmap: {
        'heatmap-radius': 30,
        'heatmap-opacity': 1,
        'heatmap-intensity': 1,
        'heatmap-weight': 1,
        'heatmap-color': [
            [0, 'rgba(0,0,255,0)'],
            [0.1, 'royalblue'],
            [0.3, 'cyan'],
            [0.5, 'lime'],
            [0.7, 'yellow'],
            [1, 'red'],
        ],
    },
    hillshade: {
        'hillshade-illumination-direction': 335,
        'hillshade-illumination-anchor': 'viewport',
        'hillshade-exaggeration': 0.5,
        'hillshade-highlight-color': '#FFFFFF',
        'hillshade-shadow-color': '#000000',
        'hillshade-accent-color': '#000000',
    },
    raster: {
        'raster-opacity': 1,
        'raster-hue-rotate': 0,
        'raster-brightness-min': 0,
        'raster-brightness-max': 1,
        'raster-saturation': 0,
        'raster-contrast': 0,
        'raster-resampling': 'linear',
        'raster-fade-duration': 300,
    },
    building: {
        'building-color': '#cccccc',
        'building-height': 10,
        'building-base': 0,
        'building-roof-color': '#aaaaaa',
        'building-roof-shape': 'flat',
        'building-facade-floors': 3,
        'building-facade-unit-width': 6,
        'building-emissive-strength': 0,
        'building-ambient-occlusion-intensity': 0,
        'building-ambient-occlusion-ground-radius': 0,
        'building-ambient-occlusion-ground-attenuation': 0,
        'building-ambient-occlusion-wall-radius': 0,
        'building-flood-light-color': '#ffffff',
        'building-flood-light-intensity': 0,
        'building-window-color': undefined,
        'building-door-color': undefined,
    },
    model: {
        'model-opacity': 1,
    },
};
exports.LAYOUT_DEFAULTS = {
    fill: {
        visibility: 'visible',
    },
    line: {
        'line-cap': 'butt',
        'line-join': 'miter',
        'line-miter-limit': 2,
        'line-round-limit': 1.05,
        visibility: 'visible',
    },
    symbol: {
        'symbol-placement': 'point',
        'symbol-spacing': 250,
        'symbol-avoid-edges': false,
        'symbol-z-order': 'auto',
        'icon-allow-overlap': false,
        'icon-ignore-placement': false,
        'icon-optional': false,
        'icon-rotation-alignment': 'auto',
        'icon-size': 1,
        'icon-text-fit': 'none',
        'icon-image': undefined,
        'icon-rotate': 0,
        'icon-padding': 2,
        'icon-keep-upright': false,
        'icon-offset': [0, 0],
        'icon-anchor': 'center',
        'icon-pitch-alignment': 'auto',
        'text-pitch-alignment': 'auto',
        'text-rotation-alignment': 'auto',
        'text-field': undefined,
        'text-font': ['Open Sans Regular', 'Arial Unicode MS Regular'],
        'text-size': 16,
        'text-max-width': 10,
        'text-line-height': 1.2,
        'text-letter-spacing': 0,
        'text-justify': 'center',
        'text-radial-offset': 0,
        'text-anchor': 'center',
        'text-max-angle': 45,
        'text-rotate': 0,
        'text-padding': 2,
        'text-keep-upright': true,
        'text-transform': 'none',
        'text-offset': [0, 0],
        'text-allow-overlap': false,
        'text-ignore-placement': false,
        'text-optional': false,
        'text-writing-mode': ['horizontal'],
        visibility: 'visible',
    },
    circle: {
        visibility: 'visible',
    },
    'fill-extrusion': {
        visibility: 'visible',
    },
    heatmap: {
        visibility: 'visible',
    },
    hillshade: {
        visibility: 'visible',
    },
    building: {
        visibility: 'visible',
    },
    model: {
        visibility: 'visible',
    },
};
function isExpr(v) {
    if (Array.isArray(v) && typeof v[0] === 'string')
        return true;
    if (v !== null &&
        typeof v === 'object' &&
        !Array.isArray(v) &&
        Array.isArray(v.stops)) {
        return true;
    }
    return (v !== null &&
        typeof v === 'object' &&
        !Array.isArray(v) &&
        v.type === 'identity' &&
        typeof v.property === 'string');
}
const MBColorTheme_1 = require("./MBColorTheme");
class MBLayerEvaluator {
    constructor(style) {
        var _a;
        this.m_layersBySource = new Map();
        this.m_allLayers = [];
        this.m_config = {};
        this.m_lut = null;
        this.m_scopedLuts = new Map();
        this.m_config = (_a = style._config) !== null && _a !== void 0 ? _a : {};
        this.prepare(style);
    }
    setColorTheme(lut) {
        this.m_lut = lut;
    }
    setColorThemeScope(scope, lut) {
        this.m_scopedLuts.set(scope, lut);
    }
    get scopedColorThemes() {
        return new Map(this.m_scopedLuts);
    }
    lutFor(pl) {
        var _a;
        const scope = pl.importScope;
        if (scope !== undefined && this.m_scopedLuts.has(scope)) {
            return (_a = this.m_scopedLuts.get(scope)) !== null && _a !== void 0 ? _a : null;
        }
        return this.m_lut;
    }
    get colorTheme() {
        return this.m_lut;
    }
    prepare(style) {
        this.m_allLayers = [];
        this.m_layersBySource.clear();
        style.layers.forEach((layer, index) => {
            const type = layer.type;
            if (type === 'background' || type === 'sky') {
                return;
            }
            const source = layer.source;
            const sourceLayer = layer['source-layer'] || '';
            const visible = this.evalLayoutProp(layer, 'visibility', type, undefined);
            const visibility = visible === 'none' ? 'none' : 'visible';
            const pl = {
                id: layer.id,
                type,
                source,
                sourceLayer,
                minzoom: layer.minzoom,
                maxzoom: layer.maxzoom,
                filter: MBFilterCompiler_1.MBFilterCompiler.compile(layer.filter),
                paintDefs: this.preparePaint(type, layer.paint),
                layoutDefs: this.prepareLayout(type, layer.layout),
                renderOrder: index,
                visibility,
                appearances: layer.appearances,
                importScope: layer._importScope,
            };
            this.m_allLayers.push(pl);
            if (!this.m_layersBySource.has(source)) {
                this.m_layersBySource.set(source, new Map());
            }
            const bySL = this.m_layersBySource.get(source);
            if (!bySL.has(sourceLayer)) {
                bySL.set(sourceLayer, []);
            }
            bySL.get(sourceLayer).push(pl);
        });
    }
    preparePaint(type, paint) {
        var _a;
        const defaults = (_a = exports.PAINT_DEFAULTS[type]) !== null && _a !== void 0 ? _a : {};
        const result = {};
        for (const [key, defVal] of Object.entries(defaults)) {
            const raw = paint === null || paint === void 0 ? void 0 : paint[key];
            if (raw === undefined) {
                result[key] = { type: 'constant', value: defVal, default: defVal };
            }
            else if (isExpr(raw)) {
                result[key] = { type: 'expression', value: raw, default: defVal };
            }
            else {
                result[key] = { type: 'constant', value: raw, default: defVal };
            }
        }
        if (paint && typeof paint === 'object') {
            for (const key of Object.keys(paint)) {
                if (!(key in result)) {
                    const raw = paint[key];
                    if (isExpr(raw)) {
                        result[key] = { type: 'expression', value: raw, default: undefined };
                    }
                    else {
                        result[key] = { type: 'constant', value: raw, default: undefined };
                    }
                }
            }
        }
        return result;
    }
    prepareLayout(type, layout) {
        var _a;
        const defaults = (_a = exports.LAYOUT_DEFAULTS[type]) !== null && _a !== void 0 ? _a : {};
        const result = {};
        for (const [key, defVal] of Object.entries(defaults)) {
            const raw = layout === null || layout === void 0 ? void 0 : layout[key];
            result[key] = raw !== undefined ? raw : defVal;
        }
        if (layout && typeof layout === 'object') {
            for (const key of Object.keys(layout)) {
                if (!(key in result)) {
                    result[key] = layout[key];
                }
            }
        }
        return result;
    }
    evalLayoutProp(layer, prop, type, ctx) {
        var _a, _b;
        const defaults = (_a = exports.LAYOUT_DEFAULTS[type]) !== null && _a !== void 0 ? _a : {};
        const raw = (_b = layer.layout) === null || _b === void 0 ? void 0 : _b[prop];
        if (raw === undefined)
            return defaults[prop];
        if (isExpr(raw) && ctx) {
            return MBExpressionEngine_1.MBExpressionEngine.evaluate(raw, ctx);
        }
        return raw;
    }
    evaluate(sourceId, sourceLayer, feature, zoom, geometryType, featureState, pitch, brightness, worldview, center) {
        var _a, _b, _c, _d;
        const bySL = this.m_layersBySource.get(sourceId);
        if (!bySL)
            return [];
        let candidates = (_a = bySL.get(sourceLayer)) !== null && _a !== void 0 ? _a : [];
        if (candidates.length === 0) {
            candidates = (_b = bySL.get('')) !== null && _b !== void 0 ? _b : [];
        }
        const results = [];
        const ctx = { zoom, pitch, feature, featureState, _config: this.m_config, brightness, worldview, center };
        for (const pl of candidates) {
            if (pl.visibility === 'none')
                continue;
            const allowedTypes = (_c = MBStyleSpec_1.GEOMETRY_TYPE_MAP[pl.type]) !== null && _c !== void 0 ? _c : [];
            if (allowedTypes.length > 0 && !allowedTypes.includes(geometryType))
                continue;
            if (pl.minzoom !== undefined && zoom < pl.minzoom)
                continue;
            if (pl.maxzoom !== undefined && zoom >= pl.maxzoom)
                continue;
            ctx.feature = feature;
            if (!pl.filter(ctx))
                continue;
            const paint = {};
            for (const [key, def] of Object.entries(pl.paintDefs)) {
                if (key === 'line-gradient' || key === 'line-border-gradient' || key === 'heatmap-color') {
                    paint[key] = def.value;
                }
                else if (def.type === 'expression') {
                    paint[key] = MBExpressionEngine_1.MBExpressionEngine.evaluate(def.value, ctx);
                }
                else {
                    paint[key] = def.value;
                }
                const layerLut = this.lutFor(pl);
                if (layerLut && typeof paint[key] === 'string' && /-color$/.test(key)
                    && paint[`${key}-use-theme`] !== 'none'
                    && ((_d = pl.paintDefs[`${key}-use-theme`]) === null || _d === void 0 ? void 0 : _d.value) !== 'none') {
                    paint[key] = (0, MBColorTheme_1.applyColorTheme)(layerLut, paint[key]);
                }
            }
            const layout = {};
            for (const [key, raw] of Object.entries(pl.layoutDefs)) {
                if (isExpr(raw) && ctx) {
                    layout[key] = MBExpressionEngine_1.MBExpressionEngine.evaluate(raw, ctx);
                }
                else {
                    layout[key] = raw;
                }
            }
            if (pl.appearances) {
                for (const app of pl.appearances) {
                    try {
                        const cond = MBExpressionEngine_1.MBExpressionEngine.evaluate(app.condition, ctx);
                        if (cond) {
                            for (const [key, val] of Object.entries(app.properties)) {
                                const ev = isExpr(val)
                                    ? MBExpressionEngine_1.MBExpressionEngine.evaluate(val, ctx)
                                    : val;
                                const paintDefaults = exports.PAINT_DEFAULTS[pl.type];
                                if (paintDefaults && key in paintDefaults) {
                                    paint[key] = ev;
                                }
                                else {
                                    layout[key] = ev;
                                }
                            }
                        }
                    }
                    catch (_e) { }
                }
            }
            results.push({
                id: pl.id,
                type: pl.type,
                source: sourceId,
                sourceLayer,
                paint,
                layout,
                renderOrder: pl.renderOrder,
                paintDefs: pl.paintDefs,
            });
        }
        results.sort((a, b) => a.renderOrder - b.renderOrder);
        return results;
    }
    getLayersForSource(sourceId) {
        return this.m_allLayers.filter(l => l.source === sourceId);
    }
    getSourceLayers() {
        const result = new Map();
        for (const [source, bySL] of this.m_layersBySource) {
            result.set(source, Array.from(bySL.keys()));
        }
        return result;
    }
}
exports.MBLayerEvaluator = MBLayerEvaluator;
//# sourceMappingURL=MBLayerEvaluator.js.map