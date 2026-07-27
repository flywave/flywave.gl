export type MBValue = null | boolean | number | string | any[] | Record<string, any>;

export interface MBStyleFeature {
    type: 'Point' | 'LineString' | 'Polygon';
    id?: string | number | null;
    properties: Record<string, any>;
}

export interface MBExpressionContext {
    zoom: number;
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
                for (let i = 2; i < args.length - 1; i += 2) {
                    const stop = args[i] as number;
                    if (input >= stop) {
                        continue;
                    }
                    return i > 2 ? this.exec(args[i - 1], ctx) : defaultValue;
                }
                if (args.length % 2 === 0) {
                    return this.exec(args[args.length - 1], ctx);
                }
                return defaultValue;
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

            case 'array':
                return [];

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

            case 'slice': {
                const str = String(this.exec(args[0], ctx) ?? '');
                const start = this.exec(args[1], ctx) as number;
                const end = args[2] !== undefined ? this.exec(args[2], ctx) as number : undefined;
                return str.slice(start, end);
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
                for (let i = 0; i < args.length; i++) {
                    if (Array.isArray(args[i])) {
                        result += String(this.exec(args[i], ctx) ?? '');
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

            default:
                return null;
        }
    }

    private static interpolateColor(a: string, b: string, t: number): string {
        const parse = (hex: string) => {
            const h = hex.replace('#', '');
            return {
                r: parseInt(h.substring(0, 2), 16),
                g: parseInt(h.substring(2, 4), 16),
                b: parseInt(h.substring(4, 6), 16),
                a: h.length === 8 ? parseInt(h.substring(6, 8), 16) / 255 : 1,
            };
        };
        const ca = parse(a);
        const cb = parse(b);
        const lerp = (x: number, y: number) => Math.round(x + (y - x) * t);
        const ra = lerp(ca.r, cb.r);
        const ga = lerp(ca.g, cb.g);
        const ba = lerp(ca.b, cb.b);
        return `#${ra.toString(16).padStart(2, '0')}${ga.toString(16).padStart(2, '0')}${ba.toString(16).padStart(2, '0')}`;
    }
}
