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
    /** Map center as [lng, lat], for `distance-from-center`. */
    center?: [number, number] | number[];
    /**
     * Progress (0..1) along the current line geometry, for `line-progress`.
     * Only supplied while evaluating data-driven per-vertex paint values
     * (line-z-offset) during line geometry emission; 0 elsewhere (mgl
     * evaluates line-progress against the full feature when the source has
     * lineMetrics).
     */
    lineProgress?: number;
    /**
     * mgl `measure-light` `brightness` global (style.ts getBrightness): the
     * relative luminance of the 3D lights configuration —
     * (directionalLuminance·polarFactor + ambientLuminance) / 2.
     */
    brightness?: number;
}

type CompiledExpression = (ctx: MBExpressionContext) => MBValue;

function isExprArray(v: any): v is [string, ...any[]] {
    return Array.isArray(v) && typeof v[0] === 'string';
}

export class MBExpressionEngine {
    private static expressionCache = new Map<string, CompiledExpression>();

    /**
     * Names of the currently available style images (sprite atlas icons +
     * runtime-added images). When set, `["image", name]` returns null for
     * missing names so `["coalesce", ["image", a], ["image", b], …]` falls
     * through to the first available one (mgl `image-fallback` semantics).
     */
    private static availableImages: Set<string> | null = null;

    static setAvailableImages(names: Set<string> | null): void {
        MBExpressionEngine.availableImages = names;
    }

    /**
     * Evaluate a TOP-LEVEL `format` expression and additionally return the
     * per-character `font-scale` factors of its sections (mgl format.ts: an
     * options object applies to the PRECEDING section — `lastExpression.scale
     * = scale`, format.ts:73-79 — and shaping.ts consumes the per-line max
     * via TaggedString.getMaxScale). Returns null when `raw` is not a
     * top-level format expression; `scales` is null when every section has
     * the default scale 1 (callers keep the flat fast path). The returned
     * `text` concatenation mirrors the `format` exec case exactly, and only
     * the per-line MAX of the scales is consumed downstream (TextShaping
     * `sectionScales`), so code-point reordering by the RTL shaper is
     * harmless. Nested format expressions and text-field wrappers
     * (coalesce/let) are not unwrapped — flat fast path there.
     */
    static evaluateFormatWithScales(
        raw: any,
        ctx: MBExpressionContext
    ): { text: string; scales: number[] | null } | null {
        if (!Array.isArray(raw) || raw[0] !== 'format') return null;
        let text = '';
        const scales: number[] = [];
        let lastSectionStart = 0;
        let hasNonUnit = false;
        for (const arg of raw.slice(1)) {
            if (arg && typeof arg === 'object' && !Array.isArray(arg)) {
                // Section options object — applies to the PRECEDING section.
                // Only font-scale affects shaping; text-font/text-color don't.
                const s = (arg as any)['font-scale'];
                if (s !== undefined) {
                    const scale = Number(MBExpressionEngine.evaluate(s, ctx)) || 1;
                    if (scale !== 1) {
                        hasNonUnit = true;
                        for (let i = lastSectionStart; i < scales.length; i++) scales[i] = scale;
                    }
                }
                continue;
            }
            let part: string | null = null;
            if (typeof arg === 'string') {
                part = arg;
            } else if (Array.isArray(arg) && arg[0] === 'image') {
                // Inline image — skip (same as the format exec case).
            } else if (Array.isArray(arg)) {
                const v = this.exec(arg, ctx);
                if (typeof v === 'string') part = v;
                else if (typeof v === 'number') part = String(v);
            }
            lastSectionStart = scales.length;
            if (part === null) continue;
            text += part;
            for (let i = 0; i < Array.from(part).length; i++) scales.push(1);
        }
        return { text, scales: hasNonUnit ? scales : null };
    }

    static addAvailableImage(name: string): void {
        if (MBExpressionEngine.availableImages) {
            MBExpressionEngine.availableImages.add(name);
        }
    }

    static removeAvailableImage(name: string): void {
        MBExpressionEngine.availableImages?.delete(name);
    }

    static evaluate(
        raw: any,
        ctx: MBExpressionContext
    ): MBValue {
        if (!isExprArray(raw)) {
            // Legacy "function" paint/layout values use the object form
            // `{ base?, type?, stops: [[zoom, value], ...] }`. Evaluate against
            // the current zoom so callers receive concrete values instead of
            // the raw object (which otherwise becomes NaN downstream).
            if (raw !== null && typeof raw === 'object' && !Array.isArray(raw) && Array.isArray(raw.stops)) {
                return MBExpressionEngine.evaluateLegacyStops(raw, ctx);
            }
            // Legacy `{ type: "identity", property: "x" }` function: the value
            // IS the feature property (mapbox style-spec "identity" function).
            if (
                raw !== null &&
                typeof raw === 'object' &&
                !Array.isArray(raw) &&
                (raw as any).type === 'identity' &&
                typeof (raw as any).property === 'string'
            ) {
                // Missing property → the function's `default` (mgl
                // function-convert identity semantics), else null.
                const v = ctx.feature?.properties?.[(raw as any).property];
                return v !== undefined ? v : ((raw as any).default ?? null);
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

    /**
     * Evaluate a legacy Mapbox GL "function" style value of the form
     * `{ base?, type?, stops: [[zoom, value], ...] }`. `type` may be
     * `"exponential"` (default, interpolated), `"interval"` (step) or
     * `"categorical"`. When a `property` is present the stops are keyed by a
     * feature property instead of zoom; only the zoom-based form is evaluated
     * here (feature-property functions are rare in the test corpus).
     */
    private static evaluateLegacyStops(raw: any, ctx: MBExpressionContext): MBValue {        const stops: Array<[any, any]> = raw.stops;
        if (!Array.isArray(stops) || stops.length === 0) return raw;
        const type = raw.type ?? 'exponential';
        const property = raw.property;

        // Legacy zoom-and-property function:
        //   { property, stops: [[{zoom, value}, result], ...] }
        // The stop keys are {zoom, value} objects forming a grid of property
        // stops per zoom level. Evaluate with bilinear interpolation.
        if (property !== undefined && typeof stops[0][0] === 'object' && stops[0][0] !== null && 'zoom' in stops[0][0]) {
            return MBExpressionEngine.evaluateLegacyZoomAndProperty(raw, ctx);
        }

        if (property !== undefined) {
            // Feature-property function: find the matching stop by property value.
            const input = ctx.feature?.properties?.[property];
            for (const [k, v] of stops) {
                if (String(k) === String(input)) return v;
            }
            // mgl function-convert: no matching stop → the function's
            // `default`, else the property's spec default (undefined lets
            // the emitter's `??` pick the paint default). Categorical stops
            // NEVER clamp to the last stop; numeric property functions
            // outside the stop range clamp (mgl semantics).
            const numericStops = stops.every(([k]) => typeof k === 'number' && Number.isFinite(k));
            if (numericStops && typeof input === 'number' && Number.isFinite(input)) {
                const last = stops[stops.length - 1];
                return last?.[1];
            }
            return 'default' in raw ? raw.default : undefined;
        }

        const input = ctx.zoom;
        if (input <= stops[0][0]) return stops[0][1];
        if (input >= stops[stops.length - 1][0]) return stops[stops.length - 1][1];

        for (let i = 0; i < stops.length - 1; i++) {
            if (input >= stops[i][0] && input < stops[i + 1][0]) {
                const a = stops[i][1];
                const b = stops[i + 1][1];
                if (type === 'interval') return a;
                if (type === 'categorical') return a;
                const t = (input - stops[i][0]) / (stops[i + 1][0] - stops[i][0]);
                const base = raw.base ?? 1;
                const curve = base !== 1 ? (Math.pow(base, t) - 1) / (base - 1) : t;
                if (typeof a === 'number' && typeof b === 'number') {
                    return a + (b - a) * curve;
                }
                if (typeof a === 'string' && typeof b === 'string' && a[0] === '#') {
                    return this.interpolateColor(a, b, curve);
                }
                // Interpolate named / rgb() colors too (mapbox interpolates any
                // color; 'blue'/'red' must produce a purple midpoint).
                if (
                    typeof a === 'string' &&
                    typeof b === 'string' &&
                    MBExpressionEngine.isColorString(a) &&
                    MBExpressionEngine.isColorString(b)
                ) {
                    // mgl legacy `colorSpace: 'hcl' | 'lab'` (function/convert.ts)
                    const cs = (raw as any).colorSpace;
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

    /**
     * Evaluate a legacy zoom-and-property function:
     *   { property, base?, stops: [[{zoom, value}, result], ...] }
     *
     * The stops are a flat grid: consecutive `{zoom, value}` keys share the same
     * zoom and form that zoom level's property→result stops. Evaluation performs
     * bilinear interpolation in (zoom, property) space.
     */
    private static evaluateLegacyZoomAndProperty(raw: any, ctx: MBExpressionContext): MBValue {
        const property = raw.property as string;
        const stops: Array<[{ zoom: number; value: number }, any]> = raw.stops;
        const base = raw.base ?? 1;
        const input = ctx.feature?.properties?.[property];
        const propInput = typeof input === 'number' ? input : Number(input ?? 0);

        // Categorical (string) property values never interpolate: exact
        // match only, no match → the function `default` (mgl semantics —
        // e.g. regressions/mapbox-gl-js#4651 renders the default green).
        const numericStops = stops.every(([key]) => typeof key.value === 'number' && Number.isFinite(key.value));
        if (!numericStops) {
            for (const [key, value] of stops) {
                if (String(key.value) === String(input)) return value;
            }
            return 'default' in raw ? raw.default : undefined;
        }
        const zoomInput = ctx.zoom;

        // Group stops by zoom level (they appear consecutively in the list).
        const levels: { zoom: number; stops: Array<[number, any]> }[] = [];
        for (const [key, value] of stops) {
            const zoom = key.zoom;
            let level = levels[levels.length - 1];
            if (!level || level.zoom !== zoom) {
                level = { zoom, stops: [] };
                levels.push(level);
            }
            level.stops.push([key.value, value]);
        }
        if (levels.length === 0) return raw;

        // mgl legacy `colorSpace` applies to both axes of the bilinear
        // interpolation (property and zoom).
        const colorSpace = (raw as any).colorSpace;
        // Interpolate the property within a single zoom level (linear).
        const interpolateProperty = (levelStops: Array<[number, any]>, p: number): any => {
            if (p <= levelStops[0][0]) return levelStops[0][1];
            if (p >= levelStops[levelStops.length - 1][0]) return levelStops[levelStops.length - 1][1];
            for (let i = 0; i < levelStops.length - 1; i++) {
                if (p >= levelStops[i][0] && p < levelStops[i + 1][0]) {
                    const [pa, va] = levelStops[i];
                    const [pb, vb] = levelStops[i + 1];
                    const t = (p - pa) / (pb - pa);
                    if (typeof va === 'number' && typeof vb === 'number') {
                        return va + (vb - va) * t;
                    }
                    if (
                        typeof va === 'string' && typeof vb === 'string' &&
                        (va[0] === '#' || MBExpressionEngine.isColorString(va)) &&
                        MBExpressionEngine.isColorString(vb)
                    ) {
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

        // Clamp / select surrounding zoom levels.
        const first = levels[0].zoom;
        const last = levels[levels.length - 1].zoom;
        if (zoomInput <= first) return interpolateProperty(levels[0].stops, propInput);
        if (zoomInput >= last) return interpolateProperty(levels[levels.length - 1].stops, propInput);

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
                if (
                    typeof ra === 'string' && typeof rb === 'string' &&
                    (ra[0] === '#' || MBExpressionEngine.isColorString(ra)) &&
                    MBExpressionEngine.isColorString(rb)
                ) {
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

            case 'line-progress':
                // Progress along the line geometry (0..1). mgl warns and
                // anchors to 0 when the source lacks lineMetrics.
                return ctx.lineProgress ?? 0;

            case 'at-interpolated': {
                // mgl AtInterpolated: fractional array indices linearly
                // interpolate between the two neighbouring numeric entries.
                const idx = Number(this.exec(args[0], ctx));
                const arr = this.exec(args[1], ctx);
                if (!Array.isArray(arr) || arr.length === 0) return null;
                const i = Math.floor(idx);
                if (idx < 0 || idx > arr.length - 1) return null;
                if (idx === i) return arr[i];
                const a = arr[i];
                const b = arr[i + 1];
                if (typeof a !== 'number' || typeof b !== 'number') return null;
                return a + (b - a) * (idx - i);
            }

            case 'distance-from-center': {
                // Distance (meters) from the feature to the map center. Uses the
                // feature's first vertex (`_geom.coordinates` = [lng, lat]) and
                // the map center supplied on the expression context.
                const from = feature?._geom?.coordinates;
                const center = (ctx as any).center;
                if (!Array.isArray(from) || from.length < 2 || !Array.isArray(center) || center.length < 2) {
                    return 0;
                }
                return MBExpressionEngine.haversine(from[1], from[0], center[1], center[0]);
            }

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

            case '==': {
                const a = this.exec(args[0], ctx);
                const b = this.exec(args[1], ctx);
                const collator = args.length > 2 ? this.exec(args[2], ctx) as any : undefined;
                return MBExpressionEngine.collatorEquals(a, b, collator);
            }

            case '!=': {
                const a = this.exec(args[0], ctx);
                const b = this.exec(args[1], ctx);
                const collator = args.length > 2 ? this.exec(args[2], ctx) as any : undefined;
                return !MBExpressionEngine.collatorEquals(a, b, collator);
            }

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
                // mgl semantics (expression/definitions/match): the LABELS
                // are compile-time LITERALS — a bare primitive or an ARRAY
                // OF LITERALS (a label set). exec()ing them mis-parses e.g.
                // ['restaurant'] as an (unknown) operator expression, which
                // silently failed EVERY match (data-driven occlusion,
                // categorical colors, … all fell to the fallback).
                const strVal = typeof val === 'number' ? val : String(val);
                for (let i = 1; i < args.length - 1; i += 2) {
                    const raw = args[i];
                    if (!Array.isArray(raw)) {
                        if (raw === val || String(raw) === strVal) {
                            return this.exec(args[i + 1], ctx);
                        }
                    } else if ((raw as any[]).some(l =>
                        l === val || (typeof l === 'string' && typeof val === 'string' && l === val))) {
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
                // mgl stops.ts: a non-finite input throws RuntimeError at
                // evaluation, which lands the property on its spec DEFAULT
                // (e.g. NaN circle-radius renders at 5, regressions/#4172).
                if (typeof input !== 'number' || !Number.isFinite(input)) {
                    return undefined;
                }
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
                // Non-finite input → property default (mgl RuntimeError path,
                // see case 'step').
                if (typeof input !== 'number' || !Number.isFinite(input)) {
                    return undefined;
                }
                const stops: Array<[number, any]> = [];
                for (let i = 2; i < args.length - 1; i += 2) {
                    stops.push([args[i] as number, this.exec(args[i + 1], ctx)]);
                }
                // NOTE: args = [mode, input, s1, v1, ..., sN, vN] — the count
                // is ALWAYS even (2 + 2N). An earlier `args.length % 2 === 0`
                // guard fired on EVERY expression, appending a spurious
                // [lastInput, lastInput] stop: out-of-range inputs returned
                // the garbage stop and DESCENDING outputs (e.g. door
                // emissive 2.2→0.0) collapsed to 0.

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

                        // Color interpolation for ANY parseable color strings —
                        // hex AND rgba()/rgb()/named (interpolateColor's
                        // parseColor handles them all; the old a[0]==='#'
                        // guard made rgba() stops fall through to the LOWER
                        // stop unblended, e.g. raster-color/expression).
                        if (typeof a === 'string' && typeof b === 'string') {
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
                for (const arg of args) sum += Number(this.exec(arg, ctx)); // §613 BigInt ids
                return sum;
            }
            case '-': {
                if (args.length === 1) return -Number(this.exec(args[0], ctx));
                let result = Number(this.exec(args[0], ctx)); // §613 BigInt ids
                for (let i = 1; i < args.length; i++) result -= this.exec(args[i], ctx) as number;
                return result;
            }
            case '*': {
                let result = 1;
                for (const arg of args) result *= Number(this.exec(arg, ctx)); // §613 BigInt ids
                return result;
            }
            case '/': {
                let result = Number(this.exec(args[0], ctx)); // §613 BigInt ids
                for (let i = 1; i < args.length; i++) result /= Number(this.exec(args[i], ctx));
                return result;
            }
            case '%':
                // MVT feature ids can arrive as BigInt — JS cannot mix the
                // types, the throw killed the WHOLE filter evaluation and
                // dropped the feature from every layer (§613: half the
                // trees missing on buildings-trees-shadows-casting).
                return Number(this.exec(args[0], ctx)) % Number(this.exec(args[1], ctx));

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

            case 'image': {
                const name = this.exec(args[0], ctx);
                // mgl semantics: an image expression resolves to null when the
                // name is not in the style's available images (drives
                // coalesce fallback chains).
                if (MBExpressionEngine.availableImages &&
                    (typeof name !== 'string' ||
                        !MBExpressionEngine.availableImages.has(name))) {
                    return null;
                }
                return name;
            }

            case 'format': {
                // Build a text string from the format sections. Image
                // sections (["image", name]) are skipped — they can't be
                // rendered inline in the text path and would produce
                // garbage if concatenated as their name. Section option
                // objects ({"text-font": ..., "text-scale": ...}) are also
                // skipped; only the raw text/string parts are concatenated.
                let result = '';
                for (const arg of args) {
                    if (typeof arg === 'string') {
                        result += arg;
                    } else if (Array.isArray(arg) && arg[0] === 'image') {
                        // Inline image — skip (can't render in text path).
                    } else if (Array.isArray(arg)) {
                        // Sub-expression that evaluates to text.
                        const v = this.exec(arg, ctx);
                        if (typeof v === 'string') result += v;
                        else if (typeof v === 'number') result += String(v);
                    } else if (arg && typeof arg === 'object') {
                        // Section options object — skip (font/scale/color
                        // overrides not supported in simplified format).
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

            case 'within': {
                // ["within", GeoJSONObject]: returns true if the feature's
                // geometry is entirely contained inside the filter geometry.
                // Supports Polygon and MultiPolygon filter geometries, and
                // Point/LineString/Polygon feature geometries.
                const filterGeo = this.exec(args[0], ctx) as any;
                return MBExpressionEngine.featureWithin(feature, filterGeo);
            }

            case 'is-supported-script': {
                const script = this.exec(args[0], ctx) as string;
                if (!script) return true;
                return MBExpressionEngine.isSupportedScript(String(script));
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

            // mgl style-spec `random` (definitions/index.ts): deterministic
            // mulberry32 draw seeded by the (string→hashString | number) seed.
            case 'random': {
                const min = Number(this.exec(args[0], ctx));
                const max = Number(this.exec(args[1], ctx));
                if (!(max > min)) return min;
                const seed = args.length > 2 ? this.exec(args[2], ctx) : undefined;
                let seedVal: number;
                if (typeof seed === 'string') {
                    let hash = 0;
                    for (let i = 0; i < seed.length; i++) {
                        hash = ((hash << 5) - hash) + seed.charCodeAt(i);
                        hash = hash & hash;
                    }
                    seedVal = hash;
                } else if (typeof seed === 'number') {
                    seedVal = seed;
                } else {
                    return min;
                }
                let a = seedVal | 0;
                a = (a + 0x6d2b79f5) | 0;
                let t = Math.imul(a ^ (a >>> 15), 1 | a);
                t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
                const r = ((t ^ (t >>> 14)) >>> 0) / 4294967296;
                return min + r * (max - min);
            }

            case 'rgb': {                const r = Math.round(Number(this.exec(args[0], ctx)));
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

            case 'accumulated': {
                // Returns the accumulated value of the current cluster property.
                // Only meaningful for clustered GeoJSON sources. Outside a
                // cluster context, returns 0 (the mapbox default for missing).
                return (ctx as any).accumulated ?? 0;
            }

            case 'number-format': {
                const v = Number(this.exec(args[0], ctx));
                const opts = args.length > 1 ? (this.exec(args[1], ctx) as any) : undefined;
                if (!isFinite(v)) return String(v);
                const locale = opts?.locale ?? undefined;
                // Mapbox spec uses kebab-case keys; accept both kebab and camel.
                const getOpt = (k: string) => opts?.[k] ?? opts?.[k.replace(/-([a-z])/g, (_m, c) => c.toUpperCase())];
                const optsObj: Intl.NumberFormatOptions = {};
                if (opts?.currency) optsObj.currency = String(opts.currency);
                const minFrac = getOpt('min-fraction-digits');
                const maxFrac = getOpt('max-fraction-digits');
                if (minFrac !== undefined) optsObj.minimumFractionDigits = Number(minFrac);
                if (maxFrac !== undefined) optsObj.maximumFractionDigits = Number(maxFrac);
                if (opts?.unit) optsObj.unit = String(opts.unit);
                try {
                    return new Intl.NumberFormat(locale, optsObj).format(v);
                } catch {
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
                if (arrays.length === 0) return [];
                const len = Math.min(...arrays.map(a => a.length));
                const result: any[][] = [];
                for (let i = 0; i < len; i++) {
                    result.push(arrays.map(a => a[i]));
                }
                return result;
            }

            default:
                return null;
        }
    }
    /**
     * Check whether a text string uses a script the renderer can display.
     * Mirrors mapbox's `is-supported-script` (text can render iff its script
     * has glyph coverage). Supported here: Latin/ASCII, Cyrillic, Greek,
     * Arabic, Hebrew, Devanagari, Han (CJK), Hiragana/Katakana, Hangul, Thai.
     */
    private static isSupportedScript(text: string): boolean {
        if (!text) return true;
        for (const ch of text) {
            const cp = ch.codePointAt(0)!;
            if (cp < 0x80 || /\s/.test(ch)) continue;
            const supported =
                (cp >= 0x0900 && cp <= 0x097F) || // Devanagari
                (cp >= 0x0600 && cp <= 0x06FF) || // Arabic
                (cp >= 0x0750 && cp <= 0x077F) || // Arabic Supplement
                (cp >= 0x0590 && cp <= 0x05FF) || // Hebrew
                (cp >= 0x0400 && cp <= 0x04FF) || // Cyrillic
                (cp >= 0x0370 && cp <= 0x03FF) || // Greek
                (cp >= 0x4E00 && cp <= 0x9FFF) || // CJK Unified Ideographs
                (cp >= 0x3040 && cp <= 0x30FF) || // Hiragana / Katakana
                (cp >= 0xAC00 && cp <= 0xD7AF) || // Hangul
                (cp >= 0x0E00 && cp <= 0x0E7F) || // Thai
                (cp >= 0x1E00 && cp <= 0x1EFF) || // Latin Extended Additional
                (cp >= 0x00C0 && cp <= 0x024F);    // Latin-1 + Extended
            if (!supported) return false;
        }
        return true;
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

    /**
     * Ray-casting point-in-polygon test (even-odd rule). Handles polygon
     * holes by treating each ring independently.
     */
    private static pointInPolygon(
        px: number, py: number,
        ring: Array<[number, number] | number[]>,
    ): boolean {
        let inside = false;
        for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
            const xi = ring[i][0], yi = ring[i][1];
            const xj = ring[j][0], yj = ring[j][1];
            const intersect = ((yi > py) !== (yj > py)) &&
                (px < (xj - xi) * (py - yi) / (yj - yi + 1e-15) + xi);
            if (intersect) inside = !inside;
        }
        return inside;
    }

    /**
     * Returns true if `(px, py)` lies inside a Polygon (with holes) or
     * MultiPolygon geometry.
     */
    private static pointInGeometry(px: number, py: number, geo: any): boolean {
        if (!geo) return false;
        const type = geo.type ?? geo.geometry?.type;
        const coords = geo.coordinates ?? geo.geometry?.coordinates;
        if (!coords) return false;

        if (type === 'Polygon') {
            // Outer ring must contain the point, no inner ring may.
            if (!this.pointInPolygon(px, py, coords[0])) return false;
            for (let i = 1; i < coords.length; i++) {
                if (this.pointInPolygon(px, py, coords[i])) return false;
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

    /**
     * Compare two values for `==` / `!=`, optionally honoring a collator
     * produced by the `collator` expression. Without a collator, fall back to
     * strict equality. With a collator, normalize strings according to its
     * `caseSensitive` and `diacriticSensitive` flags (default both true).
     */
    private static collatorEquals(a: any, b: any, collator: any): boolean {
        if (!collator || (typeof a !== 'string' && typeof b !== 'string')) {
            return a === b;
        }
        const caseSensitive = collator.caseSensitive !== false;
        const diacriticSensitive = collator.diacriticSensitive !== false;
        let sa = String(a);
        let sb = String(b);
        if (!diacriticSensitive) {
            // Strip combining diacritics by NFD-normalizing and removing
            // the combining-mark range (U+0300..U+036F).
            sa = sa.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
            sb = sb.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
        }
        if (!caseSensitive) {
            sa = sa.toLowerCase();
            sb = sb.toLowerCase();
        }
        return sa === sb;
    }

    /**
     * Implementation of the `within` expression: returns true if every vertex
     * of the feature's geometry lies inside the filter geometry. This is a
     * conservative vertex-containment test — sufficient for render-test use
     * cases where features are short relative to the filter polygon.
     *
     * Supported feature shapes (read off the MBStyleFeature payload set by
     * `MBStyleDecoder`):
     *   - `_geom.coordinates` (always present, a representative Point)
     *   - `_lineGeom` (`[lng,lat][]`, set for LineString features)
     *   - `_polyGeom` (`[lng,lat][][]` per ring, set for Polygon features)
     */
    public static featureWithin(feature: MBStyleFeature | undefined, filterGeo: any): boolean {
        if (!feature || !filterGeo) return false;
        const target = filterGeo?.geometry ?? filterGeo;
        const type = target?.type;
        if (type !== 'Polygon' && type !== 'MultiPolygon') return false;

        const f = feature as any;

        // Polygon feature: every ring vertex must be inside the filter.
        if (f._polyGeom && Array.isArray(f._polyGeom)) {
            for (const ring of f._polyGeom) {
                for (const v of ring) {
                    if (!this.pointInGeometry(v[0], v[1], target)) return false;
                }
            }
            return true;
        }
        // LineString feature: every line vertex must be inside the filter.
        if (f._lineGeom && Array.isArray(f._lineGeom)) {
            for (const v of f._lineGeom) {
                if (!this.pointInGeometry(v[0], v[1], target)) return false;
            }
            return true;
        }
        // Point feature (or fallback): test the representative point.
        const geom = f._geom;
        if (geom?.coordinates) {
            return this.pointInGeometry(geom.coordinates[0], geom.coordinates[1], target);
        }
        return false;
    }

    // ---- mgl color_spaces.ts port (rgb <-> lab <-> hcl, D65) ----
    private static readonly Xn = 0.950470;
    private static readonly Zn = 1.088830;
    private static readonly csT0 = 4 / 29;
    private static readonly csT1 = 6 / 29;
    private static readonly csT2 = 3 * (6 / 29) * (6 / 29);
    private static readonly csT3 = (6 / 29) ** 3;

    private static xyz2lab(t: number): number {
        return t > MBExpressionEngine.csT3 ? Math.cbrt(t) : t / MBExpressionEngine.csT2 + MBExpressionEngine.csT0;
    }
    private static lab2xyz(t: number): number {
        return t > MBExpressionEngine.csT1 ? t * t * t : MBExpressionEngine.csT2 * (t - MBExpressionEngine.csT0);
    }
    private static xyz2rgb(x: number): number {
        return 255 * (x <= 0.0031308 ? 12.92 * x : 1.055 * Math.pow(x, 1 / 2.4) - 0.055);
    }
    private static rgb2xyz(x: number): number {
        x /= 255;
        return x <= 0.04045 ? x / 12.92 : Math.pow((x + 0.055) / 1.055, 2.4);
    }
    private static rgbToLab(r: number, g: number, b: number): { l: number; a: number; bb: number } {
        const rb = MBExpressionEngine.rgb2xyz(r), ga = MBExpressionEngine.rgb2xyz(g), bl = MBExpressionEngine.rgb2xyz(b);
        const x = MBExpressionEngine.xyz2lab((0.4124564 * rb + 0.3575761 * ga + 0.1804375 * bl) / MBExpressionEngine.Xn);
        const y = MBExpressionEngine.xyz2lab((0.2126729 * rb + 0.7151522 * ga + 0.0721750 * bl) / 1);
        const z = MBExpressionEngine.xyz2lab((0.0193339 * rb + 0.1191920 * ga + 0.9503041 * bl) / MBExpressionEngine.Zn);
        return { l: 116 * y - 16, a: 500 * (x - y), bb: 200 * (y - z) };
    }
    private static labToRgb(l: number, a: number, bb: number): [number, number, number] {
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
    /** mgl legacy-function `colorSpace: 'hcl' | 'lab'` interpolation. */
    private static interpolateColorSpace(a: string, b: string, t: number, colorSpace: string): string {
        const ca = MBExpressionEngine.parseColor(a);
        const cb = MBExpressionEngine.parseColor(b);
        const clamp255 = (v: number) => Math.max(0, Math.min(255, Math.round(v)));
        if (colorSpace === 'lab') {
            const la = MBExpressionEngine.rgbToLab(ca.r, ca.g, ca.b);
            const lb = MBExpressionEngine.rgbToLab(cb.r, cb.g, cb.b);
            const [r, g, bl] = MBExpressionEngine.labToRgb(
                la.l + (lb.l - la.l) * t,
                la.a + (lb.a - la.a) * t,
                la.bb + (lb.bb - la.bb) * t);
            const al = ca.a + (cb.a - ca.a) * t;
            return al >= 1
                ? MBExpressionEngine.rgbToHex(clamp255(r), clamp255(g), clamp255(bl), 1)
                : `rgba(${clamp255(r)}, ${clamp255(g)}, ${clamp255(bl)}, ${+al.toFixed(4)})`;
        }
        if (colorSpace === 'hcl') {
            const toHcl = (r: number, g: number, bb: number) => {
                const { l, a, bb: b2 } = MBExpressionEngine.rgbToLab(r, g, bb);
                const h = Math.atan2(b2, a) * 180 / Math.PI;
                return { h: h < 0 ? h + 360 : h, c: Math.sqrt(a * a + b2 * b2), l };
            };
            const ha = toHcl(ca.r, ca.g, ca.b);
            const hb = toHcl(cb.r, cb.g, cb.b);
            // mgl interpolateHue (shortest hue path)
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

    private static interpolateColor(a: string, b: string, t: number): string {
        const ca = MBExpressionEngine.parseColor(a);
        const cb = MBExpressionEngine.parseColor(b);
        const lerp = (x: number, y: number) => Math.round(x + (y - x) * t);
        const ra = lerp(ca.r, cb.r);
        const ga = lerp(ca.g, cb.g);
        const ba = lerp(ca.b, cb.b);
        const aa = ca.a + (cb.a - ca.a) * t;
        // Opaque stops keep the historical '#rrggbb' output format; partial
        // alpha needs the rgba() form.
        if (ca.a === 1 && cb.a === 1) return MBExpressionEngine.rgbToHex(ra, ga, ba, 1);
        return `rgba(${ra}, ${ga}, ${ba}, ${+aa.toFixed(4)})`;
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

    /**
     * True when `c` is a colour literal (hex, named, rgb()/hsl()) rather than an
     * arbitrary string (e.g. an image name), so legacy colour stops can be
     * interpolated safely.
     */
    private static isColorString(c: string): boolean {
        if (typeof c !== 'string') return false;
        const hex = c.replace('#', '');
        if (/^[0-9a-fA-F]{6}$/.test(hex) || /^[0-9a-fA-F]{8}$/.test(hex)) return true;
        if (/^rgba?\(/.test(c) || /^hsla?\(/.test(c)) return true;
        const named = ['red', 'green', 'blue', 'white', 'black', 'yellow', 'cyan', 'magenta',
            'orange', 'purple', 'gray', 'grey', 'brown', 'pink', 'lime', 'navy', 'teal',
            'olive', 'maroon', 'silver', 'gold', 'transparent'];
        return named.includes(c.toLowerCase().trim());
    }

    private static rgbToHex(r: number, g: number, b: number, a: number): string {
        const clamp = (v: number) => Math.max(0, Math.min(255, Math.round(v)));
        const hex = (v: number) => clamp(v).toString(16).padStart(2, '0');
        // mgl color values keep their alpha: a partial-alpha stop must not
        // degrade to '#rrggbb' or a later interpolate/step over it renders
        // opaque (§628 — model-color window alpha 0.8 was lost here). rgba()
        // form — THREE.Color.setStyle rejects 8-digit hex (falls back to
        // white), so rgba() is the only universally parseable form.
        if (a < 1) return `rgba(${clamp(r)}, ${clamp(g)}, ${clamp(b)}, ${+((a * 1000) / 1000).toFixed(4)})`;
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
