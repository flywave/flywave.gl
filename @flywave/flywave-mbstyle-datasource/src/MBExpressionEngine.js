"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.MBExpressionEngine = void 0;
function isExprArray(v) {
    return Array.isArray(v) && typeof v[0] === 'string';
}
class MBExpressionEngine {
    static setAvailableImages(names) {
        MBExpressionEngine.availableImages = names;
    }
    static addAvailableImage(name) {
        if (MBExpressionEngine.availableImages) {
            MBExpressionEngine.availableImages.add(name);
        }
    }
    static removeAvailableImage(name) {
        var _a;
        (_a = MBExpressionEngine.availableImages) === null || _a === void 0 ? void 0 : _a.delete(name);
    }
    static evaluate(raw, ctx) {
        var _a, _b, _c;
        if (!isExprArray(raw)) {
            if (raw !== null && typeof raw === 'object' && !Array.isArray(raw) && Array.isArray(raw.stops)) {
                return MBExpressionEngine.evaluateLegacyStops(raw, ctx);
            }
            if (raw !== null &&
                typeof raw === 'object' &&
                !Array.isArray(raw) &&
                raw.type === 'identity' &&
                typeof raw.property === 'string') {
                return (_c = (_b = (_a = ctx.feature) === null || _a === void 0 ? void 0 : _a.properties) === null || _b === void 0 ? void 0 : _b[raw.property]) !== null && _c !== void 0 ? _c : null;
            }
            return raw;
        }
        const key = JSON.stringify(raw);
        let compiled = this.expressionCache.get(key);
        if (!compiled) {
            compiled = this.compile(raw);
            this.expressionCache.set(key, compiled);
        }
        return compiled(ctx);
    }
    static evaluateLegacyStops(raw, ctx) {
        var _a, _b, _c, _d;
        const stops = raw.stops;
        if (!Array.isArray(stops) || stops.length === 0)
            return raw;
        const type = (_a = raw.type) !== null && _a !== void 0 ? _a : 'exponential';
        const property = raw.property;
        if (property !== undefined && typeof stops[0][0] === 'object' && stops[0][0] !== null && 'zoom' in stops[0][0]) {
            return MBExpressionEngine.evaluateLegacyZoomAndProperty(raw, ctx);
        }
        if (property !== undefined) {
            const input = (_c = (_b = ctx.feature) === null || _b === void 0 ? void 0 : _b.properties) === null || _c === void 0 ? void 0 : _c[property];
            for (const [k, v] of stops) {
                if (String(k) === String(input))
                    return v;
            }
            const last = stops[stops.length - 1];
            return last === null || last === void 0 ? void 0 : last[1];
        }
        const input = ctx.zoom;
        if (input <= stops[0][0])
            return stops[0][1];
        if (input >= stops[stops.length - 1][0])
            return stops[stops.length - 1][1];
        for (let i = 0; i < stops.length - 1; i++) {
            if (input >= stops[i][0] && input < stops[i + 1][0]) {
                const a = stops[i][1];
                const b = stops[i + 1][1];
                if (type === 'interval')
                    return a;
                if (type === 'categorical')
                    return a;
                const t = (input - stops[i][0]) / (stops[i + 1][0] - stops[i][0]);
                const base = (_d = raw.base) !== null && _d !== void 0 ? _d : 1;
                const curve = base !== 1 ? (Math.pow(base, t) - 1) / (base - 1) : t;
                if (typeof a === 'number' && typeof b === 'number') {
                    return a + (b - a) * curve;
                }
                if (typeof a === 'string' && typeof b === 'string' && a[0] === '#') {
                    return this.interpolateColor(a, b, curve);
                }
                if (typeof a === 'string' &&
                    typeof b === 'string' &&
                    MBExpressionEngine.isColorString(a) &&
                    MBExpressionEngine.isColorString(b)) {
                    const cs = raw.colorSpace;
                    if (cs === 'hcl' || cs === 'lab') {
                        return this.interpolateColorSpace(a, b, curve, cs);
                    }
                    return this.interpolateColor(a, b, curve);
                }
                return a;
            }
        }
        return stops[stops.length - 1][1];
    }
    static evaluateLegacyZoomAndProperty(raw, ctx) {
        var _a, _b, _c;
        const property = raw.property;
        const stops = raw.stops;
        const base = (_a = raw.base) !== null && _a !== void 0 ? _a : 1;
        const input = (_c = (_b = ctx.feature) === null || _b === void 0 ? void 0 : _b.properties) === null || _c === void 0 ? void 0 : _c[property];
        const propInput = typeof input === 'number' ? input : Number(input !== null && input !== void 0 ? input : 0);
        const zoomInput = ctx.zoom;
        const levels = [];
        for (const [key, value] of stops) {
            const zoom = key.zoom;
            let level = levels[levels.length - 1];
            if (!level || level.zoom !== zoom) {
                level = { zoom, stops: [] };
                levels.push(level);
            }
            level.stops.push([key.value, value]);
        }
        if (levels.length === 0)
            return raw;
        const colorSpace = raw.colorSpace;
        const interpolateProperty = (levelStops, p) => {
            if (p <= levelStops[0][0])
                return levelStops[0][1];
            if (p >= levelStops[levelStops.length - 1][0])
                return levelStops[levelStops.length - 1][1];
            for (let i = 0; i < levelStops.length - 1; i++) {
                if (p >= levelStops[i][0] && p < levelStops[i + 1][0]) {
                    const [pa, va] = levelStops[i];
                    const [pb, vb] = levelStops[i + 1];
                    const t = (p - pa) / (pb - pa);
                    if (typeof va === 'number' && typeof vb === 'number') {
                        return va + (vb - va) * t;
                    }
                    if (typeof va === 'string' && typeof vb === 'string' &&
                        (va[0] === '#' || MBExpressionEngine.isColorString(va)) &&
                        MBExpressionEngine.isColorString(vb)) {
                        if (colorSpace === 'hcl' || colorSpace === 'lab') {
                            return MBExpressionEngine.interpolateColorSpace(va, vb, t, colorSpace);
                        }
                        return MBExpressionEngine.interpolateColor(va, vb, t);
                    }
                    return va;
                }
            }
            return levelStops[levelStops.length - 1][1];
        };
        const first = levels[0].zoom;
        const last = levels[levels.length - 1].zoom;
        if (zoomInput <= first)
            return interpolateProperty(levels[0].stops, propInput);
        if (zoomInput >= last)
            return interpolateProperty(levels[levels.length - 1].stops, propInput);
        for (let i = 0; i < levels.length - 1; i++) {
            const za = levels[i].zoom;
            const zb = levels[i + 1].zoom;
            if (zoomInput >= za && zoomInput < zb) {
                const ra = interpolateProperty(levels[i].stops, propInput);
                const rb = interpolateProperty(levels[i + 1].stops, propInput);
                let t = (zoomInput - za) / (zb - za);
                const curve = base !== 1 ? (Math.pow(base, t) - 1) / (base - 1) : t;
                if (typeof ra === 'number' && typeof rb === 'number') {
                    return ra + (rb - ra) * curve;
                }
                if (typeof ra === 'string' && typeof rb === 'string' &&
                    (ra[0] === '#' || MBExpressionEngine.isColorString(ra)) &&
                    MBExpressionEngine.isColorString(rb)) {
                    if (colorSpace === 'hcl' || colorSpace === 'lab') {
                        return MBExpressionEngine.interpolateColorSpace(ra, rb, curve, colorSpace);
                    }
                    return MBExpressionEngine.interpolateColor(ra, rb, curve);
                }
                return ra;
            }
        }
        return interpolateProperty(levels[levels.length - 1].stops, propInput);
    }
    static clearCache() {
        this.expressionCache.clear();
    }
    static compile(raw) {
        return (ctx) => {
            return this.exec(raw, ctx);
        };
    }
    static exec(raw, ctx) {
        var _a, _b, _c, _d, _e, _f, _g, _h, _j, _k, _l, _o, _p, _q, _r, _s, _t, _u, _v, _w, _x, _y, _z, _0;
        if (!Array.isArray(raw)) {
            if (typeof raw === 'string' && raw[0] === '{' && raw[raw.length - 1] === '}') {
                return (_c = (_b = (_a = ctx.feature) === null || _a === void 0 ? void 0 : _a.properties) === null || _b === void 0 ? void 0 : _b[raw.slice(1, -1)]) !== null && _c !== void 0 ? _c : raw;
            }
            return raw;
        }
        const op = raw[0];
        if (typeof op !== 'string')
            return raw;
        const args = raw.slice(1);
        const feature = ctx.feature;
        const props = (_d = feature === null || feature === void 0 ? void 0 : feature.properties) !== null && _d !== void 0 ? _d : {};
        const zoom = ctx.zoom;
        switch (op) {
            case 'get': {
                const name = this.exec(args[0], ctx);
                if (args.length > 1) {
                    const obj = this.exec(args[1], ctx);
                    return (_e = obj === null || obj === void 0 ? void 0 : obj[name]) !== null && _e !== void 0 ? _e : null;
                }
                return (_f = props[name]) !== null && _f !== void 0 ? _f : null;
            }
            case 'has': {
                const name = this.exec(args[0], ctx);
                const obj = args.length > 1
                    ? this.exec(args[1], ctx)
                    : props;
                return (obj === null || obj === void 0 ? void 0 : obj[name]) !== undefined;
            }
            case 'id':
                return (_g = feature === null || feature === void 0 ? void 0 : feature.id) !== null && _g !== void 0 ? _g : null;
            case 'zoom':
                return zoom;
            case 'pitch':
                return (_h = ctx.pitch) !== null && _h !== void 0 ? _h : 0;
            case 'distance-from-center': {
                const from = (_j = feature === null || feature === void 0 ? void 0 : feature._geom) === null || _j === void 0 ? void 0 : _j.coordinates;
                const center = ctx.center;
                if (!Array.isArray(from) || from.length < 2 || !Array.isArray(center) || center.length < 2) {
                    return 0;
                }
                return MBExpressionEngine.haversine(from[1], from[0], center[1], center[0]);
            }
            case 'config': {
                const configKey = this.exec(args[0], ctx);
                return (_l = (_k = ctx._config) === null || _k === void 0 ? void 0 : _k[configKey]) !== null && _l !== void 0 ? _l : null;
            }
            case 'measure-light': {
                return (_o = ctx.brightness) !== null && _o !== void 0 ? _o : 0;
            }
            case 'worldview': {
                return (_p = ctx.worldview) !== null && _p !== void 0 ? _p : '';
            }
            case 'geometry-type':
                return (_q = feature === null || feature === void 0 ? void 0 : feature.type) !== null && _q !== void 0 ? _q : null;
            case '==': {
                const a = this.exec(args[0], ctx);
                const b = this.exec(args[1], ctx);
                const collator = args.length > 2 ? this.exec(args[2], ctx) : undefined;
                return MBExpressionEngine.collatorEquals(a, b, collator);
            }
            case '!=': {
                const a = this.exec(args[0], ctx);
                const b = this.exec(args[1], ctx);
                const collator = args.length > 2 ? this.exec(args[2], ctx) : undefined;
                return !MBExpressionEngine.collatorEquals(a, b, collator);
            }
            case '>':
                return this.exec(args[0], ctx) > this.exec(args[1], ctx);
            case '>=':
                return this.exec(args[0], ctx) >= this.exec(args[1], ctx);
            case '<':
                return this.exec(args[0], ctx) < this.exec(args[1], ctx);
            case '<=':
                return this.exec(args[0], ctx) <= this.exec(args[1], ctx);
            case '!':
                return !this.exec(args[0], ctx);
            case 'all': {
                for (const arg of args) {
                    if (!this.exec(arg, ctx))
                        return false;
                }
                return true;
            }
            case 'any': {
                for (const arg of args) {
                    if (this.exec(arg, ctx))
                        return true;
                }
                return false;
            }
            case 'none': {
                for (const arg of args) {
                    if (this.exec(arg, ctx))
                        return false;
                }
                return true;
            }
            case 'in': {
                const needle = this.exec(args[0], ctx);
                const haystack = this.exec(args[1], ctx);
                if (Array.isArray(haystack)) {
                    return haystack.includes(needle);
                }
                if (typeof haystack === 'string') {
                    return haystack.includes(String(needle));
                }
                return false;
            }
            case 'match': {
                const val = this.exec(args[0], ctx);
                for (let i = 1; i < args.length - 1; i += 2) {
                    const label = this.exec(args[i], ctx);
                    if (label === val) {
                        return this.exec(args[i + 1], ctx);
                    }
                    if (Array.isArray(label) && label.includes(val)) {
                        return this.exec(args[i + 1], ctx);
                    }
                }
                return this.exec(args[args.length - 1], ctx);
            }
            case 'case': {
                for (let i = 0; i < args.length - 1; i += 2) {
                    if (this.exec(args[i], ctx)) {
                        return this.exec(args[i + 1], ctx);
                    }
                }
                return this.exec(args[args.length - 1], ctx);
            }
            case 'coalesce': {
                for (const arg of args) {
                    const val = this.exec(arg, ctx);
                    if (val !== null && val !== undefined)
                        return val;
                }
                return null;
            }
            case 'step': {
                const input = this.exec(args[0], ctx);
                const defaultValue = this.exec(args[1], ctx);
                let lastOutput = defaultValue;
                for (let i = 2; i < args.length; i += 2) {
                    const stop = args[i];
                    const output = this.exec(args[i + 1], ctx);
                    if (input >= stop) {
                        lastOutput = output;
                        continue;
                    }
                    return lastOutput;
                }
                return lastOutput;
            }
            case 'interpolate': {
                const modeArr = args[0];
                const mode = modeArr[0];
                const input = this.exec(args[1], ctx);
                const stops = [];
                for (let i = 2; i < args.length - 1; i += 2) {
                    stops.push([args[i], this.exec(args[i + 1], ctx)]);
                }
                if (args.length % 2 === 0) {
                    stops.push([args[args.length - 1], this.exec(args[args.length - 1], ctx)]);
                }
                if (input <= stops[0][0])
                    return stops[0][1];
                if (input >= stops[stops.length - 1][0])
                    return stops[stops.length - 1][1];
                for (let i = 0; i < stops.length - 1; i++) {
                    if (input >= stops[i][0] && input < stops[i + 1][0]) {
                        const t = (input - stops[i][0]) / (stops[i + 1][0] - stops[i][0]);
                        const a = stops[i][1];
                        const b = stops[i + 1][1];
                        if (mode === 'exponential' && ((_r = args[0]) === null || _r === void 0 ? void 0 : _r[1]) !== undefined) {
                            const base = args[0][1];
                            const curve = base !== 1 ? (Math.pow(base, t) - 1) / (base - 1) : t;
                            if (typeof a === 'string' && typeof b === 'string') {
                                return this.interpolateColor(a, b, curve);
                            }
                            return a + (b - a) * curve;
                        }
                        if (mode === 'cubic-bezier' && ((_s = args[0]) === null || _s === void 0 ? void 0 : _s.length) === 5) {
                            const x1 = args[0][1];
                            const y1 = args[0][2];
                            const x2 = args[0][3];
                            const y2 = args[0][4];
                            const curve = MBExpressionEngine.cubicBezier(x1, y1, x2, y2, t);
                            if (typeof a === 'string' && typeof b === 'string') {
                                return this.interpolateColor(a, b, curve);
                            }
                            return a + (b - a) * curve;
                        }
                        if (typeof a === 'number' && typeof b === 'number') {
                            return a + (b - a) * t;
                        }
                        if (typeof a === 'string' && typeof b === 'string') {
                            return this.interpolateColor(a, b, t);
                        }
                        return a;
                    }
                }
                return stops[stops.length - 1][1];
            }
            case 'literal':
                return args[0];
            case 'to-number': {
                const val = this.exec(args[0], ctx);
                if (typeof val === 'number')
                    return val;
                const n = Number(val);
                return isNaN(n) ? null : n;
            }
            case 'to-string': {
                const val = this.exec(args[0], ctx);
                return val === null ? '' : String(val);
            }
            case 'to-boolean': {
                return Boolean(this.exec(args[0], ctx));
            }
            case 'typeof': {
                const val = this.exec(args[0], ctx);
                if (val === null)
                    return 'null';
                if (Array.isArray(val))
                    return 'array';
                return typeof val;
            }
            case 'upcase':
                return String(this.exec(args[0], ctx)).toUpperCase();
            case 'downcase':
                return String(this.exec(args[0], ctx)).toLowerCase();
            case 'concat': {
                let result = '';
                for (const arg of args) {
                    result += String((_t = this.exec(arg, ctx)) !== null && _t !== void 0 ? _t : '');
                }
                return result;
            }
            case 'length': {
                const val = this.exec(args[0], ctx);
                if (typeof val === 'string')
                    return val.length;
                if (Array.isArray(val))
                    return val.length;
                return 0;
            }
            case '+': {
                let sum = 0;
                for (const arg of args)
                    sum += this.exec(arg, ctx);
                return sum;
            }
            case '-': {
                if (args.length === 1)
                    return -this.exec(args[0], ctx);
                let result = this.exec(args[0], ctx);
                for (let i = 1; i < args.length; i++)
                    result -= this.exec(args[i], ctx);
                return result;
            }
            case '*': {
                let result = 1;
                for (const arg of args)
                    result *= this.exec(arg, ctx);
                return result;
            }
            case '/': {
                let result = this.exec(args[0], ctx);
                for (let i = 1; i < args.length; i++)
                    result /= this.exec(args[i], ctx);
                return result;
            }
            case '%':
                return this.exec(args[0], ctx) % this.exec(args[1], ctx);
            case '^':
                return Math.pow(this.exec(args[0], ctx), this.exec(args[1], ctx));
            case 'abs':
                return Math.abs(this.exec(args[0], ctx));
            case 'floor':
                return Math.floor(this.exec(args[0], ctx));
            case 'ceil':
                return Math.ceil(this.exec(args[0], ctx));
            case 'round':
                return Math.round(this.exec(args[0], ctx));
            case 'min':
                return Math.min(...args.map(a => this.exec(a, ctx)));
            case 'max':
                return Math.max(...args.map(a => this.exec(a, ctx)));
            case 'sqrt':
                return Math.sqrt(this.exec(args[0], ctx));
            case 'ln':
                return Math.log(this.exec(args[0], ctx));
            case 'ln2':
                return Math.LN2;
            case 'log10':
                return Math.log10(this.exec(args[0], ctx));
            case 'log2':
                return Math.log2(this.exec(args[0], ctx));
            case 'sin':
                return Math.sin(this.exec(args[0], ctx));
            case 'cos':
                return Math.cos(this.exec(args[0], ctx));
            case 'tan':
                return Math.tan(this.exec(args[0], ctx));
            case 'pi':
                return Math.PI;
            case 'e':
                return Math.E;
            case 'feature-state': {
                const key = this.exec(args[0], ctx);
                return (_v = (_u = ctx.featureState) === null || _u === void 0 ? void 0 : _u[key]) !== null && _v !== void 0 ? _v : null;
            }
            case 'properties': {
                return props;
            }
            case 'image': {
                const name = this.exec(args[0], ctx);
                if (MBExpressionEngine.availableImages &&
                    (typeof name !== 'string' ||
                        !MBExpressionEngine.availableImages.has(name))) {
                    return null;
                }
                return name;
            }
            case 'format': {
                let result = '';
                for (const arg of args) {
                    if (typeof arg === 'string') {
                        result += arg;
                    }
                    else if (Array.isArray(arg) && arg[0] === 'image') {
                    }
                    else if (Array.isArray(arg)) {
                        const v = this.exec(arg, ctx);
                        if (typeof v === 'string')
                            result += v;
                        else if (typeof v === 'number')
                            result += String(v);
                    }
                    else if (arg && typeof arg === 'object') {
                    }
                }
                return result;
            }
            case 'let': {
                const letCtx = Object.assign(Object.assign({}, ctx), { feature: Object.assign(Object.assign({}, feature), { properties: Object.assign({}, props) }) });
                for (let i = 0; i < args.length - 1; i += 2) {
                    const name = args[i];
                    const value = this.exec(args[i + 1], letCtx);
                    letCtx.feature.properties[name] = value;
                }
                return this.exec(args[args.length - 1], letCtx);
            }
            case 'var': {
                const name = args[0];
                return (_x = (_w = feature === null || feature === void 0 ? void 0 : feature.properties) === null || _w === void 0 ? void 0 : _w[name]) !== null && _x !== void 0 ? _x : null;
            }
            case 'distance': {
                const target = this.exec(args[0], ctx);
                return MBExpressionEngine.computeDistance(feature, target);
            }
            case 'within': {
                const filterGeo = this.exec(args[0], ctx);
                return MBExpressionEngine.featureWithin(feature, filterGeo);
            }
            case 'is-supported-script': {
                const script = this.exec(args[0], ctx);
                if (!script)
                    return true;
                return MBExpressionEngine.isSupportedScript(String(script));
            }
            case 'collator': {
                const opts = (_y = args[0]) !== null && _y !== void 0 ? _y : {};
                const caseSensitive = opts['case-sensitive'] !== false;
                const diacriticSensitive = opts['diacritic-sensitive'] !== false;
                return { caseSensitive, diacriticSensitive };
            }
            case 'resolved-locale': {
                const locales = this.exec(args[0], ctx);
                return typeof locales === 'string' ? locales : 'en';
            }
            case 'rgb': {
                const r = Math.round(Number(this.exec(args[0], ctx)));
                const g = Math.round(Number(this.exec(args[1], ctx)));
                const b = Math.round(Number(this.exec(args[2], ctx)));
                return MBExpressionEngine.rgbToHex(r, g, b, 1);
            }
            case 'rgba': {
                const r = Math.round(Number(this.exec(args[0], ctx)));
                const g = Math.round(Number(this.exec(args[1], ctx)));
                const b = Math.round(Number(this.exec(args[2], ctx)));
                const a = Number(this.exec(args[3], ctx));
                return MBExpressionEngine.rgbToHex(r, g, b, a);
            }
            case 'hsl': {
                const h = Number(this.exec(args[0], ctx)) / 360;
                const s = Number(this.exec(args[1], ctx)) / 100;
                const l = Number(this.exec(args[2], ctx)) / 100;
                const rgb = MBExpressionEngine.hslToRgb(h, s, l);
                return MBExpressionEngine.rgbToHex(rgb[0], rgb[1], rgb[2], 1);
            }
            case 'hsla': {
                const h = Number(this.exec(args[0], ctx)) / 360;
                const s = Number(this.exec(args[1], ctx)) / 100;
                const l = Number(this.exec(args[2], ctx)) / 100;
                const a = Number(this.exec(args[3], ctx));
                const rgb = MBExpressionEngine.hslToRgb(h, s, l);
                return MBExpressionEngine.rgbToHex(rgb[0], rgb[1], rgb[2], a);
            }
            case 'to-color': {
                const v = this.exec(args[0], ctx);
                if (typeof v === 'string')
                    return v;
                if (typeof v === 'number')
                    return MBExpressionEngine.rgbToHex(v, v, v, 1);
                return v;
            }
            case 'array': {
                const items = args.map(a => this.exec(a, ctx));
                return items;
            }
            case 'at': {
                const idx = Number(this.exec(args[0], ctx));
                const arr = this.exec(args[1], ctx);
                return Array.isArray(arr) ? arr[idx] : null;
            }
            case 'slice': {
                const v = this.exec(args[0], ctx);
                const start = Number(this.exec(args[1], ctx));
                const end = args.length > 2 ? Number(this.exec(args[2], ctx)) : undefined;
                if (Array.isArray(v))
                    return v.slice(start, end);
                if (typeof v === 'string')
                    return v.slice(start, end);
                return v;
            }
            case 'number':
            case 'string':
            case 'boolean':
            case 'object': {
                const v = this.exec(args[0], ctx);
                if (op === 'number')
                    return Number(v);
                if (op === 'string')
                    return String(v);
                if (op === 'boolean')
                    return Boolean(v);
                return v;
            }
            case 'accumulated': {
                return (_z = ctx.accumulated) !== null && _z !== void 0 ? _z : 0;
            }
            case 'number-format': {
                const v = Number(this.exec(args[0], ctx));
                const opts = args.length > 1 ? this.exec(args[1], ctx) : undefined;
                if (!isFinite(v))
                    return String(v);
                const locale = (_0 = opts === null || opts === void 0 ? void 0 : opts.locale) !== null && _0 !== void 0 ? _0 : undefined;
                const getOpt = (k) => { var _a; return (_a = opts === null || opts === void 0 ? void 0 : opts[k]) !== null && _a !== void 0 ? _a : opts === null || opts === void 0 ? void 0 : opts[k.replace(/-([a-z])/g, (_m, c) => c.toUpperCase())]; };
                const optsObj = {};
                if (opts === null || opts === void 0 ? void 0 : opts.currency)
                    optsObj.currency = String(opts.currency);
                const minFrac = getOpt('min-fraction-digits');
                const maxFrac = getOpt('max-fraction-digits');
                if (minFrac !== undefined)
                    optsObj.minimumFractionDigits = Number(minFrac);
                if (maxFrac !== undefined)
                    optsObj.maximumFractionDigits = Number(maxFrac);
                if (opts === null || opts === void 0 ? void 0 : opts.unit)
                    optsObj.unit = String(opts.unit);
                try {
                    return new Intl.NumberFormat(locale, optsObj).format(v);
                }
                catch (_1) {
                    return String(v);
                }
            }
            case 'keys': {
                const v = this.exec(args[0], ctx);
                return (v && typeof v === 'object') ? Object.keys(v) : [];
            }
            case 'values': {
                const v = this.exec(args[0], ctx);
                return (v && typeof v === 'object') ? Object.values(v) : [];
            }
            case 'zip': {
                const arrays = args.map(a => {
                    const v = this.exec(a, ctx);
                    return Array.isArray(v) ? v : [];
                });
                if (arrays.length === 0)
                    return [];
                const len = Math.min(...arrays.map(a => a.length));
                const result = [];
                for (let i = 0; i < len; i++) {
                    result.push(arrays.map(a => a[i]));
                }
                return result;
            }
            default:
                return null;
        }
    }
    static isSupportedScript(text) {
        if (!text)
            return true;
        for (const ch of text) {
            const cp = ch.codePointAt(0);
            if (cp < 0x80 || /\s/.test(ch))
                continue;
            const supported = (cp >= 0x0900 && cp <= 0x097F) ||
                (cp >= 0x0600 && cp <= 0x06FF) ||
                (cp >= 0x0750 && cp <= 0x077F) ||
                (cp >= 0x0590 && cp <= 0x05FF) ||
                (cp >= 0x0400 && cp <= 0x04FF) ||
                (cp >= 0x0370 && cp <= 0x03FF) ||
                (cp >= 0x4E00 && cp <= 0x9FFF) ||
                (cp >= 0x3040 && cp <= 0x30FF) ||
                (cp >= 0xAC00 && cp <= 0xD7AF) ||
                (cp >= 0x0E00 && cp <= 0x0E7F) ||
                (cp >= 0x1E00 && cp <= 0x1EFF) ||
                (cp >= 0x00C0 && cp <= 0x024F);
            if (!supported)
                return false;
        }
        return true;
    }
    static haversine(lat1, lng1, lat2, lng2) {
        const R = 6378137;
        const toRad = (d) => d * Math.PI / 180;
        const dLat = toRad(lat2 - lat1);
        const dLng = toRad(lng2 - lng1);
        const a = Math.sin(dLat / 2) ** 2 +
            Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
        return 2 * R * Math.asin(Math.sqrt(a));
    }
    static computeDistance(feature, target) {
        var _a, _b, _c, _d, _e, _f;
        if (!(feature === null || feature === void 0 ? void 0 : feature._geom) || !target)
            return Infinity;
        const fx = (_b = (_a = feature._geom.coordinates) === null || _a === void 0 ? void 0 : _a[0]) !== null && _b !== void 0 ? _b : 0;
        const fy = (_d = (_c = feature._geom.coordinates) === null || _c === void 0 ? void 0 : _c[1]) !== null && _d !== void 0 ? _d : 0;
        const targetGeo = (_e = target === null || target === void 0 ? void 0 : target.geometry) !== null && _e !== void 0 ? _e : target;
        const coords = targetGeo === null || targetGeo === void 0 ? void 0 : targetGeo.coordinates;
        if (!coords)
            return Infinity;
        const type = (_f = targetGeo === null || targetGeo === void 0 ? void 0 : targetGeo.type) !== null && _f !== void 0 ? _f : target === null || target === void 0 ? void 0 : target.type;
        if (type === 'Point') {
            return MBExpressionEngine.haversine(fy, fx, coords[1], coords[0]);
        }
        if (type === 'LineString' || type === 'MultiPoint') {
            let min = Infinity;
            for (const c of coords) {
                const d = MBExpressionEngine.haversine(fy, fx, c[1], c[0]);
                if (d < min)
                    min = d;
            }
            return min;
        }
        if (type === 'Polygon' || type === 'MultiLineString') {
            let min = Infinity;
            for (const ring of coords) {
                for (const c of ring) {
                    const d = MBExpressionEngine.haversine(fy, fx, c[1], c[0]);
                    if (d < min)
                        min = d;
                }
            }
            return min;
        }
        return Infinity;
    }
    static pointInPolygon(px, py, ring) {
        let inside = false;
        for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
            const xi = ring[i][0], yi = ring[i][1];
            const xj = ring[j][0], yj = ring[j][1];
            const intersect = ((yi > py) !== (yj > py)) &&
                (px < (xj - xi) * (py - yi) / (yj - yi + 1e-15) + xi);
            if (intersect)
                inside = !inside;
        }
        return inside;
    }
    static pointInGeometry(px, py, geo) {
        var _a, _b, _c, _d;
        if (!geo)
            return false;
        const type = (_a = geo.type) !== null && _a !== void 0 ? _a : (_b = geo.geometry) === null || _b === void 0 ? void 0 : _b.type;
        const coords = (_c = geo.coordinates) !== null && _c !== void 0 ? _c : (_d = geo.geometry) === null || _d === void 0 ? void 0 : _d.coordinates;
        if (!coords)
            return false;
        if (type === 'Polygon') {
            if (!this.pointInPolygon(px, py, coords[0]))
                return false;
            for (let i = 1; i < coords.length; i++) {
                if (this.pointInPolygon(px, py, coords[i]))
                    return false;
            }
            return true;
        }
        if (type === 'MultiPolygon') {
            for (const poly of coords) {
                if (this.pointInGeometry(px, py, { type: 'Polygon', coordinates: poly })) {
                    return true;
                }
            }
            return false;
        }
        return false;
    }
    static collatorEquals(a, b, collator) {
        if (!collator || (typeof a !== 'string' && typeof b !== 'string')) {
            return a === b;
        }
        const caseSensitive = collator.caseSensitive !== false;
        const diacriticSensitive = collator.diacriticSensitive !== false;
        let sa = String(a);
        let sb = String(b);
        if (!diacriticSensitive) {
            sa = sa.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
            sb = sb.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
        }
        if (!caseSensitive) {
            sa = sa.toLowerCase();
            sb = sb.toLowerCase();
        }
        return sa === sb;
    }
    static featureWithin(feature, filterGeo) {
        var _a;
        if (!feature || !filterGeo)
            return false;
        const target = (_a = filterGeo === null || filterGeo === void 0 ? void 0 : filterGeo.geometry) !== null && _a !== void 0 ? _a : filterGeo;
        const type = target === null || target === void 0 ? void 0 : target.type;
        if (type !== 'Polygon' && type !== 'MultiPolygon')
            return false;
        const f = feature;
        if (f._polyGeom && Array.isArray(f._polyGeom)) {
            for (const ring of f._polyGeom) {
                for (const v of ring) {
                    if (!this.pointInGeometry(v[0], v[1], target))
                        return false;
                }
            }
            return true;
        }
        if (f._lineGeom && Array.isArray(f._lineGeom)) {
            for (const v of f._lineGeom) {
                if (!this.pointInGeometry(v[0], v[1], target))
                    return false;
            }
            return true;
        }
        const geom = f._geom;
        if (geom === null || geom === void 0 ? void 0 : geom.coordinates) {
            return this.pointInGeometry(geom.coordinates[0], geom.coordinates[1], target);
        }
        return false;
    }
    static xyz2lab(t) {
        return t > MBExpressionEngine.csT3 ? Math.cbrt(t) : t / MBExpressionEngine.csT2 + MBExpressionEngine.csT0;
    }
    static lab2xyz(t) {
        return t > MBExpressionEngine.csT1 ? t * t * t : MBExpressionEngine.csT2 * (t - MBExpressionEngine.csT0);
    }
    static xyz2rgb(x) {
        return 255 * (x <= 0.0031308 ? 12.92 * x : 1.055 * Math.pow(x, 1 / 2.4) - 0.055);
    }
    static rgb2xyz(x) {
        x /= 255;
        return x <= 0.04045 ? x / 12.92 : Math.pow((x + 0.055) / 1.055, 2.4);
    }
    static rgbToLab(r, g, b) {
        const rb = MBExpressionEngine.rgb2xyz(r), ga = MBExpressionEngine.rgb2xyz(g), bl = MBExpressionEngine.rgb2xyz(b);
        const x = MBExpressionEngine.xyz2lab((0.4124564 * rb + 0.3575761 * ga + 0.1804375 * bl) / MBExpressionEngine.Xn);
        const y = MBExpressionEngine.xyz2lab((0.2126729 * rb + 0.7151522 * ga + 0.0721750 * bl) / 1);
        const z = MBExpressionEngine.xyz2lab((0.0193339 * rb + 0.1191920 * ga + 0.9503041 * bl) / MBExpressionEngine.Zn);
        return { l: 116 * y - 16, a: 500 * (x - y), bb: 200 * (y - z) };
    }
    static labToRgb(l, a, bb) {
        let y = (l + 16) / 116;
        let x = isNaN(a) ? y : y + a / 500;
        let z = isNaN(bb) ? y : y - bb / 200;
        y = MBExpressionEngine.lab2xyz(y);
        x = MBExpressionEngine.Xn * MBExpressionEngine.lab2xyz(x);
        z = MBExpressionEngine.Zn * MBExpressionEngine.lab2xyz(z);
        return [
            MBExpressionEngine.xyz2rgb(3.2404542 * x - 1.5371385 * y - 0.4985314 * z),
            MBExpressionEngine.xyz2rgb(-0.9692660 * x + 1.8760108 * y + 0.0415560 * z),
            MBExpressionEngine.xyz2rgb(0.0556434 * x - 0.2040259 * y + 1.0572252 * z),
        ];
    }
    static interpolateColorSpace(a, b, t, colorSpace) {
        const ca = MBExpressionEngine.parseColor(a);
        const cb = MBExpressionEngine.parseColor(b);
        const clamp255 = (v) => Math.max(0, Math.min(255, Math.round(v)));
        if (colorSpace === 'lab') {
            const la = MBExpressionEngine.rgbToLab(ca.r, ca.g, ca.b);
            const lb = MBExpressionEngine.rgbToLab(cb.r, cb.g, cb.b);
            const [r, g, bl] = MBExpressionEngine.labToRgb(la.l + (lb.l - la.l) * t, la.a + (lb.a - la.a) * t, la.bb + (lb.bb - la.bb) * t);
            const al = ca.a + (cb.a - ca.a) * t;
            return al >= 1
                ? MBExpressionEngine.rgbToHex(clamp255(r), clamp255(g), clamp255(bl), 1)
                : `rgba(${clamp255(r)}, ${clamp255(g)}, ${clamp255(bl)}, ${+al.toFixed(4)})`;
        }
        if (colorSpace === 'hcl') {
            const toHcl = (r, g, bb) => {
                const { l, a, bb: b2 } = MBExpressionEngine.rgbToLab(r, g, bb);
                const h = Math.atan2(b2, a) * 180 / Math.PI;
                return { h: h < 0 ? h + 360 : h, c: Math.sqrt(a * a + b2 * b2), l };
            };
            const ha = toHcl(ca.r, ca.g, ca.b);
            const hb = toHcl(cb.r, cb.g, cb.b);
            const d = hb.h - ha.h;
            const dh = d > 180 || d < -180 ? d - 360 * Math.round(d / 360) : d;
            const h = (ha.h + t * dh) * Math.PI / 180;
            const c = ha.c + (hb.c - ha.c) * t;
            const l = ha.l + (hb.l - ha.l) * t;
            const [r, g, bl] = MBExpressionEngine.labToRgb(l, Math.cos(h) * c, Math.sin(h) * c);
            const al = ca.a + (cb.a - ca.a) * t;
            return al >= 1
                ? MBExpressionEngine.rgbToHex(clamp255(r), clamp255(g), clamp255(bl), 1)
                : `rgba(${clamp255(r)}, ${clamp255(g)}, ${clamp255(bl)}, ${+al.toFixed(4)})`;
        }
        return MBExpressionEngine.interpolateColor(a, b, t);
    }
    static interpolateColor(a, b, t) {
        const ca = MBExpressionEngine.parseColor(a);
        const cb = MBExpressionEngine.parseColor(b);
        const lerp = (x, y) => Math.round(x + (y - x) * t);
        const ra = lerp(ca.r, cb.r);
        const ga = lerp(ca.g, cb.g);
        const ba = lerp(ca.b, cb.b);
        const aa = ca.a + (cb.a - ca.a) * t;
        if (ca.a === 1 && cb.a === 1)
            return MBExpressionEngine.rgbToHex(ra, ga, ba, 1);
        return `rgba(${ra}, ${ga}, ${ba}, ${+aa.toFixed(4)})`;
    }
    static parseColor(c) {
        if (typeof c !== 'string')
            return { r: 0, g: 0, b: 0, a: 1 };
        const hex = c.replace('#', '');
        if (/^[0-9a-fA-F]{6}$/.test(hex) || /^[0-9a-fA-F]{8}$/.test(hex)) {
            return {
                r: parseInt(hex.substring(0, 2), 16),
                g: parseInt(hex.substring(2, 4), 16),
                b: parseInt(hex.substring(4, 6), 16),
                a: hex.length === 8 ? parseInt(hex.substring(6, 8), 16) / 255 : 1,
            };
        }
        const rgbMatch = c.match(/rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*(?:,\s*([\d.]+)\s*)?\)/);
        if (rgbMatch) {
            return {
                r: parseInt(rgbMatch[1]),
                g: parseInt(rgbMatch[2]),
                b: parseInt(rgbMatch[3]),
                a: rgbMatch[4] !== undefined ? parseFloat(rgbMatch[4]) : 1,
            };
        }
        const hslMatch = c.match(/hsla?\(\s*([\d.]+)\s*,\s*([\d.]+)%\s*,\s*([\d.]+)%\s*(?:,\s*([\d.]+)\s*)?\)/);
        if (hslMatch) {
            const h = parseFloat(hslMatch[1]) / 360;
            const s = parseFloat(hslMatch[2]) / 100;
            const l = parseFloat(hslMatch[3]) / 100;
            const rgb = MBExpressionEngine.hslToRgb(h, s, l);
            return { r: rgb[0], g: rgb[1], b: rgb[2], a: hslMatch[4] !== undefined ? parseFloat(hslMatch[4]) : 1 };
        }
        const named = {
            red: [255, 0, 0], green: [0, 128, 0], blue: [0, 0, 255],
            white: [255, 255, 255], black: [0, 0, 0], yellow: [255, 255, 0],
            cyan: [0, 255, 255], magenta: [255, 0, 255], orange: [255, 165, 0],
            purple: [128, 0, 128], gray: [128, 128, 128], grey: [128, 128, 128],
            brown: [165, 42, 42], pink: [255, 192, 203], lime: [0, 255, 0],
            navy: [0, 0, 128], teal: [0, 128, 128], olive: [128, 128, 0],
            maroon: [128, 0, 0], silver: [192, 192, 192], gold: [255, 215, 0],
            transparent: [0, 0, 0],
        };
        const lc = c.toLowerCase().trim();
        if (named[lc])
            return { r: named[lc][0], g: named[lc][1], b: named[lc][2], a: lc === 'transparent' ? 0 : 1 };
        return { r: 0, g: 0, b: 0, a: 1 };
    }
    static isColorString(c) {
        if (typeof c !== 'string')
            return false;
        const hex = c.replace('#', '');
        if (/^[0-9a-fA-F]{6}$/.test(hex) || /^[0-9a-fA-F]{8}$/.test(hex))
            return true;
        if (/^rgba?\(/.test(c) || /^hsla?\(/.test(c))
            return true;
        const named = ['red', 'green', 'blue', 'white', 'black', 'yellow', 'cyan', 'magenta',
            'orange', 'purple', 'gray', 'grey', 'brown', 'pink', 'lime', 'navy', 'teal',
            'olive', 'maroon', 'silver', 'gold', 'transparent'];
        return named.includes(c.toLowerCase().trim());
    }
    static rgbToHex(r, g, b, a) {
        const clamp = (v) => Math.max(0, Math.min(255, Math.round(v)));
        const hex = (v) => clamp(v).toString(16).padStart(2, '0');
        return `#${hex(r)}${hex(g)}${hex(b)}`;
    }
    static hslToRgb(h, s, l) {
        if (s === 0) {
            const v = Math.round(l * 255);
            return [v, v, v];
        }
        const hue2rgb = (p, q, t) => {
            if (t < 0)
                t += 1;
            if (t > 1)
                t -= 1;
            if (t < 1 / 6)
                return p + (q - p) * 6 * t;
            if (t < 1 / 2)
                return q;
            if (t < 2 / 3)
                return p + (q - p) * (2 / 3 - t) * 6;
            return p;
        };
        const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
        const p = 2 * l - q;
        return [
            Math.round(hue2rgb(p, q, h + 1 / 3) * 255),
            Math.round(hue2rgb(p, q, h) * 255),
            Math.round(hue2rgb(p, q, h - 1 / 3) * 255),
        ];
    }
    static cubicBezier(x1, y1, x2, y2, t) {
        const cx = 3 * x1;
        const bx = 3 * (x2 - x1) - cx;
        const ax = 1 - cx - bx;
        const cy = 3 * y1;
        const by = 3 * (y2 - y1) - cy;
        const ay = 1 - cy - by;
        let lo = 0;
        let hi = 1;
        for (let i = 0; i < 20; i++) {
            const mid = (lo + hi) / 2;
            const x = ((ax * mid + bx) * mid + cx) * mid;
            if (x < t)
                lo = mid;
            else
                hi = mid;
        }
        const t2 = (lo + hi) / 2;
        return ((ay * t2 + by) * t2 + cy) * t2;
    }
}
exports.MBExpressionEngine = MBExpressionEngine;
MBExpressionEngine.expressionCache = new Map();
MBExpressionEngine.availableImages = null;
MBExpressionEngine.Xn = 0.950470;
MBExpressionEngine.Zn = 1.088830;
MBExpressionEngine.csT0 = 4 / 29;
MBExpressionEngine.csT1 = 6 / 29;
MBExpressionEngine.csT2 = 3 * (6 / 29) * (6 / 29);
MBExpressionEngine.csT3 = (6 / 29) ** 3;
//# sourceMappingURL=MBExpressionEngine.js.map