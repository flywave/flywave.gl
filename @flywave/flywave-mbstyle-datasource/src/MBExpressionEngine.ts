export type MBValue = null | boolean | number | string | any[] | Record<string, any>;

export interface MBStyleFeature {
    type: 'Point' | 'LineString' | 'Polygon';
    id?: string | number | null;
    properties: Record<string, any>;
    _geom?: { type: string; coordinates: number[] };
}

export interface MBExpressionContext {
    zoom: number;
    pitch?: number;
    feature?: MBStyleFeature;
    featureState?: Record<string, any>;
    id?: string | number | null;
}

type CompiledExpression = (ctx: MBExpressionContext) => MBValue;

function isExprArray(v: any): v is [string, ...any[]] {
    return Array.isArray(v) && typeof v[0] === 'string';
}

export class MBExpressionEngine {
    private static expressionCache = new Map<string, CompiledExpression>();

    static evaluate(
        raw: any,
        ctx: MBExpressionContext
    ): MBValue {
        if (!isExprArray(raw)) {
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

    static clearCache() {
        this.expressionCache.clear();
    }

    static compile(raw: [string, ...any[]]): CompiledExpression {
        return (ctx: MBExpressionContext): MBValue => {
            return this.exec(raw, ctx);
        };
    }

    private static exec(raw: any, ctx: MBExpressionContext): MBValue {
        if (!Array.isArray(raw)) {
            if (typeof raw === 'string' && raw[0] === '{' && raw[raw.length - 1] === '}') {
                return ctx.feature?.properties?.[raw.slice(1, -1)] ?? raw;
            }
            return raw;
        }

        const op = raw[0];
        if (typeof op !== 'string') return raw;

        const args = raw.slice(1);
        const feature = ctx.feature;
        const props = feature?.properties ?? {};
        const zoom = ctx.zoom;

        switch (op) {
            case 'get': {
                const name = this.exec(args[0], ctx) as string;
                if (args.length > 1) {
                    const obj = this.exec(args[1], ctx) as Record<string, any>;
                    return obj?.[name] ?? null;
                }
                return props[name] ?? null;
            }

            case 'has': {
                const name = this.exec(args[0], ctx) as string;
                const obj = args.length > 1
                    ? (this.exec(args[1], ctx) as Record<string, any>)
                    : props;
                return (obj as any)?.[name] !== undefined;
            }

            case 'id':
                return feature?.id ?? null;

            case 'zoom':
                return zoom;

            case 'pitch':
                return ctx.pitch ?? 0;

            case 'config': {
                // Read from the merged style's config map (set by mergeImports).
                const configKey = this.exec(args[0], ctx) as string;
                return (ctx as any)._config?.[configKey] ?? null;
            }

            case 'measure-light': {
                // Returns precomputed scene brightness (from ambient + directional
                // lights). The brightness is stored on the context by the evaluator.
                return (ctx as any).brightness ?? 0;
            }

            case 'worldview': {
                // Returns the current geographic worldview (e.g. "AD", "JP").
                return (ctx as any).worldview ?? '';
            }

            case 'geometry-type':
                return feature?.type ?? null;

            case '==':
                return this.exec(args[0], ctx) === this.exec(args[1], ctx);

            case '!=':
                return this.exec(args[0], ctx) !== this.exec(args[1], ctx);

            case '>':
                return (this.exec(args[0], ctx) as number) > (this.exec(args[1], ctx) as number);

            case '>=':
                return (this.exec(args[0], ctx) as number) >= (this.exec(args[1], ctx) as number);

            case '<':
                return (this.exec(args[0], ctx) as number) < (this.exec(args[1], ctx) as number);

            case '<=':
                return (this.exec(args[0], ctx) as number) <= (this.exec(args[1], ctx) as number);

            case '!':
                return !this.exec(args[0], ctx);

            case 'all': {
                for (const arg of args) {
                    if (!this.exec(arg, ctx)) return false;
                }
                return true;
            }

            case 'any': {
                for (const arg of args) {
                    if (this.exec(arg, ctx)) return true;
                }
                return false;
            }

            case 'none': {
                for (const arg of args) {
                    if (this.exec(arg, ctx)) return false;
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
                    return (haystack as string).includes(String(needle));
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
                    if (Array.isArray(label) && (label as any[]).includes(val)) {
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
                    if (val !== null && val !== undefined) return val;
                }
                return null;
            }

            case 'step': {
                const input = this.exec(args[0], ctx) as number;
                const defaultValue = this.exec(args[1], ctx);
                let lastOutput = defaultValue;
                for (let i = 2; i < args.length; i += 2) {
                    const stop = args[i] as number;
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
                const modeArr = args[0] as string[];
                const mode = modeArr[0];
                const input = this.exec(args[1], ctx) as number;
                const stops: Array<[number, any]> = [];
                for (let i = 2; i < args.length - 1; i += 2) {
                    stops.push([args[i] as number, this.exec(args[i + 1], ctx)]);
                }
                if (args.length % 2 === 0) {
                    stops.push([args[args.length - 1] as number, this.exec(args[args.length - 1], ctx)]);
                }

                if (input <= stops[0][0]) return stops[0][1];
                if (input >= stops[stops.length - 1][0]) return stops[stops.length - 1][1];

                for (let i = 0; i < stops.length - 1; i++) {
                    if (input >= stops[i][0] && input < stops[i + 1][0]) {
                        const t = (input - stops[i][0]) / (stops[i + 1][0] - stops[i][0]);
                        const a = stops[i][1] as number;
                        const b = stops[i + 1][1] as number;

                        if (mode === 'exponential' && args[0]?.[1] !== undefined) {
                            const base = args[0][1] as number;
                            const curve = base !== 1 ? (Math.pow(base, t) - 1) / (base - 1) : t;
                            if (typeof a === 'string' && typeof b === 'string') {
                                return this.interpolateColor(a, b, curve);
                            }
                            return a + (b - a) * curve;
                        }

                        if (mode === 'cubic-bezier' && args[0]?.length === 5) {
                            const x1 = args[0][1] as number;
                            const y1 = args[0][2] as number;
                            const x2 = args[0][3] as number;
                            const y2 = args[0][4] as number;
                            const curve = MBExpressionEngine.cubicBezier(x1, y1, x2, y2, t);
                            if (typeof a === 'string' && typeof b === 'string') {
                                return this.interpolateColor(a, b, curve);
                            }
                            return a + (b - a) * curve;
                        }

                        if (typeof a === 'number' && typeof b === 'number') {
                            return a + (b - a) * t;
                        }

                        if (typeof a === 'string' && typeof b === 'string' && a[0] === '#') {
                            return this.interpolateColor(a, b, t);
                        }

                        return a;
                    }
                }
                return stops[stops.length - 1][1];
            }

            case 'literal':
                return args[0] as any;

            case 'to-number': {
                const val = this.exec(args[0], ctx);
                if (typeof val === 'number') return val;
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
                if (val === null) return 'null';
                if (Array.isArray(val)) return 'array';
                return typeof val;
            }

            case 'upcase':
                return String(this.exec(args[0], ctx)).toUpperCase();

            case 'downcase':
                return String(this.exec(args[0], ctx)).toLowerCase();

            case 'concat': {
                let result = '';
                for (const arg of args) {
                    result += String(this.exec(arg, ctx) ?? '');
                }
                return result;
            }

            case 'length': {
                const val = this.exec(args[0], ctx);
                if (typeof val === 'string') return val.length;
                if (Array.isArray(val)) return val.length;
                return 0;
            }

            case '+': {
                let sum = 0;
                for (const arg of args) sum += this.exec(arg, ctx) as number;
                return sum;
            }
            case '-': {
                if (args.length === 1) return -(this.exec(args[0], ctx) as number);
                let result = this.exec(args[0], ctx) as number;
                for (let i = 1; i < args.length; i++) result -= this.exec(args[i], ctx) as number;
                return result;
            }
            case '*': {
                let result = 1;
                for (const arg of args) result *= this.exec(arg, ctx) as number;
                return result;
            }
            case '/': {
                let result = this.exec(args[0], ctx) as number;
                for (let i = 1; i < args.length; i++) result /= this.exec(args[i], ctx) as number;
                return result;
            }
            case '%':
                return (this.exec(args[0], ctx) as number) % (this.exec(args[1], ctx) as number);

            case '^':
                return Math.pow(this.exec(args[0], ctx) as number, this.exec(args[1], ctx) as number);

            case 'abs':
                return Math.abs(this.exec(args[0], ctx) as number);

            case 'floor':
                return Math.floor(this.exec(args[0], ctx) as number);

            case 'ceil':
                return Math.ceil(this.exec(args[0], ctx) as number);

            case 'round':
                return Math.round(this.exec(args[0], ctx) as number);

            case 'min':
                return Math.min(...args.map(a => this.exec(a, ctx) as number));

            case 'max':
                return Math.max(...args.map(a => this.exec(a, ctx) as number));

            case 'sqrt':
                return Math.sqrt(this.exec(args[0], ctx) as number);

            case 'ln':
                return Math.log(this.exec(args[0], ctx) as number);

            case 'ln2':
                return Math.LN2;

            case 'log10':
                return Math.log10(this.exec(args[0], ctx) as number);

            case 'log2':
                return Math.log2(this.exec(args[0], ctx) as number);

            case 'sin':
                return Math.sin(this.exec(args[0], ctx) as number);

            case 'cos':
                return Math.cos(this.exec(args[0], ctx) as number);

            case 'tan':
                return Math.tan(this.exec(args[0], ctx) as number);

            case 'pi':
                return Math.PI;

            case 'e':
                return Math.E;

            case 'feature-state': {
                const key = this.exec(args[0], ctx) as string;
                return ctx.featureState?.[key] ?? null;
            }

            case 'properties': {
                return props;
            }

            case 'image':
                return this.exec(args[0], ctx);

            case 'format': {
                let result = '';
                for (const arg of args) {
                    if (Array.isArray(arg)) {
                        result += String(this.exec(arg, ctx) ?? '');
                    } else if (typeof arg === 'string') {
                        result += arg;
                    }
                }
                return result;
            }

            case 'let': {
                const letCtx = { ...ctx, feature: { ...feature, properties: { ...props } } as MBStyleFeature };
                for (let i = 0; i < args.length - 1; i += 2) {
                    const name = args[i] as string;
                    const value = this.exec(args[i + 1], letCtx);
                    (letCtx.feature as any).properties[name] = value;
                }
                return this.exec(args[args.length - 1], letCtx);
            }

            case 'var': {
                const name = args[0] as string;
                return (feature as any)?.properties?.[name] ?? null;
            }

            case 'distance': {
                const target = this.exec(args[0], ctx) as any;
                return MBExpressionEngine.computeDistance(feature, target);
            }

            case 'is-supported-script': {
                const script = this.exec(args[0], ctx) as string;
                if (!script) return true;
                return /^[a-zA-Z\s]+$/.test(String(script));
            }

            case 'collator': {
                const opts = args[0] ?? {};
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
                if (typeof v === 'string') return v;
                if (typeof v === 'number') return MBExpressionEngine.rgbToHex(v, v, v, 1);
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
                if (Array.isArray(v)) return v.slice(start, end);
                if (typeof v === 'string') return v.slice(start, end);
                return v;
            }

            case 'number':
            case 'string':
            case 'boolean':
            case 'object': {
                const v = this.exec(args[0], ctx);
                if (op === 'number') return Number(v);
                if (op === 'string') return String(v);
                if (op === 'boolean') return Boolean(v);
                return v;
            }

            default:
                return null;
        }
    }

    private static haversine(
        lat1: number, lng1: number,
        lat2: number, lng2: number,
    ): number {
        const R = 6378137;
        const toRad = (d: number) => d * Math.PI / 180;
        const dLat = toRad(lat2 - lat1);
        const dLng = toRad(lng2 - lng1);
        const a = Math.sin(dLat / 2) ** 2 +
            Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
        return 2 * R * Math.asin(Math.sqrt(a));
    }

    private static computeDistance(feature: MBStyleFeature | undefined, target: any): number {
        if (!feature?._geom || !target) return Infinity;
        const fx = feature._geom.coordinates?.[0] ?? 0;
        const fy = feature._geom.coordinates?.[1] ?? 0;

        const targetGeo = target?.geometry ?? target;
        const coords = targetGeo?.coordinates;
        if (!coords) return Infinity;

        const type = targetGeo?.type ?? target?.type;
        if (type === 'Point') {
            return MBExpressionEngine.haversine(fy, fx, coords[1], coords[0]);
        }
        if (type === 'LineString' || type === 'MultiPoint') {
            let min = Infinity;
            for (const c of coords) {
                const d = MBExpressionEngine.haversine(fy, fx, c[1], c[0]);
                if (d < min) min = d;
            }
            return min;
        }
        if (type === 'Polygon' || type === 'MultiLineString') {
            let min = Infinity;
            for (const ring of coords) {
                for (const c of ring) {
                    const d = MBExpressionEngine.haversine(fy, fx, c[1], c[0]);
                    if (d < min) min = d;
                }
            }
            return min;
        }
        return Infinity;
    }

    private static interpolateColor(a: string, b: string, t: number): string {
        const ca = MBExpressionEngine.parseColor(a);
        const cb = MBExpressionEngine.parseColor(b);
        const lerp = (x: number, y: number) => Math.round(x + (y - x) * t);
        const ra = lerp(ca.r, cb.r);
        const ga = lerp(ca.g, cb.g);
        const ba = lerp(ca.b, cb.b);
        return MBExpressionEngine.rgbToHex(ra, ga, ba, 1);
    }

    private static parseColor(c: string): { r: number; g: number; b: number; a: number } {
        if (typeof c !== 'string') return { r: 0, g: 0, b: 0, a: 1 };
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
        const named: Record<string, [number, number, number]> = {
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
        if (named[lc]) return { r: named[lc][0], g: named[lc][1], b: named[lc][2], a: lc === 'transparent' ? 0 : 1 };
        return { r: 0, g: 0, b: 0, a: 1 };
    }

    private static rgbToHex(r: number, g: number, b: number, a: number): string {
        const clamp = (v: number) => Math.max(0, Math.min(255, Math.round(v)));
        const hex = (v: number) => clamp(v).toString(16).padStart(2, '0');
        return `#${hex(r)}${hex(g)}${hex(b)}`;
    }

    private static hslToRgb(h: number, s: number, l: number): [number, number, number] {
        if (s === 0) {
            const v = Math.round(l * 255);
            return [v, v, v];
        }
        const hue2rgb = (p: number, q: number, t: number) => {
            if (t < 0) t += 1;
            if (t > 1) t -= 1;
            if (t < 1 / 6) return p + (q - p) * 6 * t;
            if (t < 1 / 2) return q;
            if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
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

    private static cubicBezier(
        x1: number, y1: number,
        x2: number, y2: number,
        t: number,
    ): number {
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
            if (x < t) lo = mid;
            else hi = mid;
        }
        const t2 = (lo + hi) / 2;
        return ((ay * t2 + by) * t2 + cy) * t2;
    }
}
