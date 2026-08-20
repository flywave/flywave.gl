"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.MBStyleRuntime = void 0;
const MBLayerEvaluator_1 = require("./MBLayerEvaluator");
const MBColorTheme_1 = require("./MBColorTheme");
class MBStyleRuntime {
    constructor(style, onChange) {
        this.m_transitions = [];
        this.m_tickCallback = null;
        this.m_style = style;
        this.m_evaluator = new MBLayerEvaluator_1.MBLayerEvaluator(style);
        this.m_onChange = onChange;
        (0, MBColorTheme_1.loadColorTheme)(style).then(lut => {
            this.m_evaluator.setColorTheme(lut);
            try {
                onChange();
            }
            catch (_a) { }
        }).catch(() => { });
    }
    get evaluator() {
        return this.m_evaluator;
    }
    get style() {
        return this.m_style;
    }
    setPaintProperty(layerId, prop, value) {
        var _a, _b;
        const layer = this.findLayer(layerId);
        if (!layer)
            return;
        if (!layer.paint)
            layer.paint = {};
        const oldValue = layer.paint[prop];
        const transition = this.m_style.transition;
        const duration = (_a = transition === null || transition === void 0 ? void 0 : transition.duration) !== null && _a !== void 0 ? _a : 0;
        const delay = (_b = transition === null || transition === void 0 ? void 0 : transition.delay) !== null && _b !== void 0 ? _b : 0;
        if (duration > 0 && this.canInterpolate(oldValue, value)) {
            this.m_transitions.push({
                layerId, prop,
                from: oldValue,
                to: value,
                start: Date.now() + delay,
                duration,
                delay,
            });
            this.ensureTickLoop();
        }
        else {
            layer.paint[prop] = value;
            this.rebuildEvaluator();
        }
    }
    canInterpolate(a, b) {
        if (typeof a === 'number' && typeof b === 'number')
            return true;
        if (typeof a === 'string' && typeof b === 'string' &&
            (a.startsWith('#') || a.startsWith('rgb')) &&
            (b.startsWith('#') || b.startsWith('rgb')))
            return true;
        return false;
    }
    interpolate(a, b, t) {
        if (typeof a === 'number' && typeof b === 'number') {
            return a + (b - a) * t;
        }
        if (typeof a === 'string' && typeof b === 'string') {
            return this.interpolateColor(a, b, t);
        }
        return t > 0.5 ? b : a;
    }
    interpolateColor(a, b, t) {
        const parse = (c) => {
            const h = c.replace('#', '');
            return {
                r: parseInt(h.substring(0, 2), 16) || 0,
                g: parseInt(h.substring(2, 4), 16) || 0,
                b: parseInt(h.substring(4, 6), 16) || 0,
            };
        };
        try {
            const ca = parse(a);
            const cb = parse(b);
            const r = Math.round(ca.r + (cb.r - ca.r) * t);
            const g = Math.round(ca.g + (cb.g - ca.g) * t);
            const bl = Math.round(ca.b + (cb.b - ca.b) * t);
            return `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${bl.toString(16).padStart(2, '0')}`;
        }
        catch (_a) {
            return t > 0.5 ? b : a;
        }
    }
    ensureTickLoop() {
        if (this.m_tickCallback)
            return;
        this.m_tickCallback = () => this.tickTransitions();
        this.m_onChange();
        if (typeof setInterval !== 'undefined') {
            const interval = setInterval(() => {
                if (this.m_transitions.length === 0) {
                    clearInterval(interval);
                    this.m_tickCallback = null;
                    return;
                }
                this.tickTransitions();
            }, 16);
        }
    }
    tickTransitions() {
        const now = Date.now();
        let changed = false;
        const remaining = [];
        for (const tr of this.m_transitions) {
            const elapsed = now - tr.start;
            if (elapsed < 0) {
                remaining.push(tr);
                continue;
            }
            const t = Math.min(1, elapsed / tr.duration);
            const eased = t * t * (3 - 2 * t);
            const value = this.interpolate(tr.from, tr.to, eased);
            const layer = this.findLayer(tr.layerId);
            if (layer) {
                if (!layer.paint)
                    layer.paint = {};
                layer.paint[tr.prop] = value;
                changed = true;
            }
            if (t < 1) {
                remaining.push(tr);
            }
        }
        this.m_transitions = remaining;
        if (changed) {
            this.rebuildEvaluator();
        }
    }
    setLayoutProperty(layerId, prop, value) {
        const layer = this.findLayer(layerId);
        if (!layer)
            return;
        if (!layer.layout)
            layer.layout = {};
        layer.layout[prop] = value;
        this.rebuildEvaluator();
    }
    addLayer(layer, beforeId) {
        const layers = this.m_style.layers;
        if (beforeId) {
            const idx = layers.findIndex(l => l.id === beforeId);
            if (idx >= 0) {
                layers.splice(idx, 0, layer);
            }
            else {
                layers.push(layer);
            }
        }
        else {
            layers.push(layer);
        }
        this.rebuildEvaluator();
    }
    removeLayer(layerId) {
        const idx = this.m_style.layers.findIndex(l => l.id === layerId);
        if (idx >= 0) {
            this.m_style.layers.splice(idx, 1);
            this.rebuildEvaluator();
        }
    }
    moveLayer(layerId, beforeId) {
        const layers = this.m_style.layers;
        const idx = layers.findIndex(l => l.id === layerId);
        if (idx < 0)
            return;
        const [layer] = layers.splice(idx, 1);
        if (beforeId) {
            const beforeIdx = layers.findIndex(l => l.id === beforeId);
            if (beforeIdx >= 0) {
                layers.splice(beforeIdx, 0, layer);
            }
            else {
                layers.push(layer);
            }
        }
        else {
            layers.push(layer);
        }
        this.rebuildEvaluator();
    }
    setFilter(layerId, filter) {
        const layer = this.findLayer(layerId);
        if (!layer)
            return;
        layer.filter = filter;
        this.rebuildEvaluator();
    }
    setLayerZoomRange(layerId, minzoom, maxzoom) {
        const layer = this.findLayer(layerId);
        if (!layer)
            return;
        layer.minzoom = minzoom;
        layer.maxzoom = maxzoom;
        this.rebuildEvaluator();
    }
    setStyle(style) {
        this.m_style = style;
        this.rebuildEvaluator();
    }
    addSource(sourceId, source) {
        if (!this.m_style.sources)
            this.m_style.sources = {};
        this.m_style.sources[sourceId] = source;
        this.m_onChange();
    }
    removeSource(sourceId) {
        if (this.m_style.sources && this.m_style.sources[sourceId]) {
            delete this.m_style.sources[sourceId];
            this.m_onChange();
        }
    }
    setGeoJSONSourceData(sourceId, data) {
        if (!this.m_style.sources)
            return;
        const src = this.m_style.sources[sourceId];
        if (!src)
            return;
        src.data = typeof data === 'string' ? data : JSON.parse(JSON.stringify(data));
        this.m_onChange();
    }
    getPaintProperty(layerId, prop) {
        var _a;
        const layer = this.findLayer(layerId);
        return (_a = layer === null || layer === void 0 ? void 0 : layer.paint) === null || _a === void 0 ? void 0 : _a[prop];
    }
    getLayoutProperty(layerId, prop) {
        var _a;
        const layer = this.findLayer(layerId);
        return (_a = layer === null || layer === void 0 ? void 0 : layer.layout) === null || _a === void 0 ? void 0 : _a[prop];
    }
    findLayer(layerId) {
        return this.m_style.layers.find(l => l.id === layerId);
    }
    rebuildEvaluator() {
        var _a, _b;
        const prevLut = (_a = this.m_evaluator.m_lut) !== null && _a !== void 0 ? _a : null;
        const prevScoped = (_b = this.m_evaluator.scopedColorThemes) !== null && _b !== void 0 ? _b : new Map();
        this.m_evaluator = new MBLayerEvaluator_1.MBLayerEvaluator(this.m_style);
        this.m_evaluator.setColorTheme(prevLut);
        for (const [scope, lut] of prevScoped) {
            this.m_evaluator.setColorThemeScope(scope, lut);
        }
        (0, MBColorTheme_1.loadColorTheme)(this.m_style).then(lut => {
            if (!this.m_runtimeThemeOverride) {
                this.m_evaluator.setColorTheme(lut);
            }
            try {
                this.m_onChange();
            }
            catch (_a) { }
        }).catch(() => { });
        this.m_onChange();
    }
}
exports.MBStyleRuntime = MBStyleRuntime;
//# sourceMappingURL=MBStyleRuntime.js.map