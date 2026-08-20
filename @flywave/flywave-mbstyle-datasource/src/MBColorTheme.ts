/*
 * Mapbox `color-theme` LUT support (mgl src/util/lut.ts + style-spec/util/
 * color.ts RenderColor). The theme is an N×N² PNG encoding an N³ RGBA cube;
 * colors are transformed by a trilinear lookup on their NORMALIZED rgb
 * (alpha preserved). Applied to color paints unless `<prop>-use-theme` is
 * 'none'; a style without `color-theme` leaves the LUT null (identity).
 */

export interface ColorThemeLut {
    /** Linearized RGBA bytes of the N³ cube (length 4·N³). */
    data: Uint8ClampedArray;
    /** Cube edge length (== image height). */
    n: number;
}

const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

/**
 * Monotonic generation of the active theme. Bumped whenever a (possibly
 * different) LUT is applied so texture caches keyed on it (pattern
 * extractions, sprite bakes) invalidate together.
 */
let s_generation = 0;
export function themeGeneration(): number {
    return s_generation;
}
export function bumpThemeGeneration(): void {
    s_generation++;
}

function parseCssColor(c: string): [number, number, number, number] | null {
    if (typeof c !== 'string') return null;
    const hex = c.replace('#', '');
    if (/^[0-9a-fA-F]{6}$/.test(hex)) {
        return [parseInt(hex.slice(0, 2), 16), parseInt(hex.slice(2, 4), 16), parseInt(hex.slice(4, 6), 16), 1];
    }
    if (/^[0-9a-fA-F]{8}$/.test(hex)) {
        return [parseInt(hex.slice(0, 2), 16), parseInt(hex.slice(2, 4), 16), parseInt(hex.slice(4, 6), 16),
            parseInt(hex.slice(6, 8), 16) / 255];
    }
    const m = c.match(/rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*(?:,\s*([\d.]+)\s*)?\)/);
    if (m) return [+m[1], +m[2], +m[3], m[4] !== undefined ? +m[4] : 1];
    // Named CSS colors (violet/blue/white/...): THREE.Color parses them to
    // LINEAR components under ColorManagement — convert back to sRGB 0-255.
    try {
        const named = new (require('three').Color)(c);
        named.convertLinearToSRGB();
        return [Math.round(named.r * 255), Math.round(named.g * 255), Math.round(named.b * 255), 1];
    } catch {
        return null;
    }
}

/** Trilinear LUT lookup (mgl RenderColor constructor, non-premultiplied). */
export function applyColorTheme(
    lut: ColorThemeLut | null | undefined,
    color: string,
): string {
    if (!lut) return color;
    const parsed = parseCssColor(color);
    if (!parsed) return color;
    const [r255, g255, b255, a] = parsed;
    const N = lut.n;
    const N2 = N * N;
    const data = lut.data;

    let r = (r255 / 255) * (N - 1);
    let g = (g255 / 255) * (N - 1);
    let b = (b255 / 255) * (N - 1);
    r = Math.max(0, Math.min(N - 1, r));
    g = Math.max(0, Math.min(N - 1, g));
    b = Math.max(0, Math.min(N - 1, b));

    const r0 = Math.floor(r), g0 = Math.floor(g), b0 = Math.floor(b);
    const r1 = Math.ceil(r), g1 = Math.ceil(g), b1 = Math.ceil(b);
    const rw = r - r0, gw = g - g0, bw = b - b0;

    const i0 = (r0 + g0 * N2 + b0 * N) * 4;
    const i1 = (r0 + g0 * N2 + b1 * N) * 4;
    const i2 = (r0 + g1 * N2 + b0 * N) * 4;
    const i3 = (r0 + g1 * N2 + b1 * N) * 4;
    const i4 = (r1 + g0 * N2 + b0 * N) * 4;
    const i5 = (r1 + g0 * N2 + b1 * N) * 4;
    const i6 = (r1 + g1 * N2 + b0 * N) * 4;
    const i7 = (r1 + g1 * N2 + b1 * N) * 4;

    const lr = lerp(
        lerp(lerp(data[i0], data[i1], bw), lerp(data[i2], data[i3], bw), gw),
        lerp(lerp(data[i4], data[i5], bw), lerp(data[i6], data[i7], bw), gw),
        rw);
    const lg = lerp(
        lerp(lerp(data[i0 + 1], data[i1 + 1], bw), lerp(data[i2 + 1], data[i3 + 1], bw), gw),
        lerp(lerp(data[i4 + 1], data[i5 + 1], bw), lerp(data[i6 + 1], data[i7 + 1], bw), gw),
        rw);
    const lb = lerp(
        lerp(lerp(data[i0 + 2], data[i1 + 2], bw), lerp(data[i2 + 2], data[i3 + 2], bw), gw),
        lerp(lerp(data[i4 + 2], data[i5 + 2], bw), lerp(data[i6 + 2], data[i7 + 2], bw), gw),
        rw);

    const R = Math.round(lr), G = Math.round(lg), B = Math.round(lb);
    return a >= 1 ? `rgb(${R}, ${G}, ${B})` : `rgba(${R}, ${G}, ${B}, ${+a.toFixed(4)})`;
}

/**
 * Transform an RGBA pixel buffer in place through the LUT (mgl
 * `RGBAImage.copy(…, lut)` / `RenderColor` CPU path for sprite + pattern
 * images). Input must be NON-premultiplied (sprite atlases are stored
 * straight-alpha); alpha is preserved, only rgb is remapped. SDF icons never
 * pass through here (mgl themes only the non-SDF shader branch).
 */
export function applyColorThemeToPixels(
    lut: ColorThemeLut | null | undefined,
    data: Uint8ClampedArray | Uint8Array,
): void {
    if (!lut) return;
    const N = lut.n;
    const N2 = N * N;
    const table = lut.data;
    for (let p = 0; p < data.length; p += 4) {
        let r = (data[p] / 255) * (N - 1);
        let g = (data[p + 1] / 255) * (N - 1);
        let b = (data[p + 2] / 255) * (N - 1);
        r = Math.max(0, Math.min(N - 1, r));
        g = Math.max(0, Math.min(N - 1, g));
        b = Math.max(0, Math.min(N - 1, b));
        if (r === 0 && g === 0 && b === 0 && data[p + 3] === 0) continue; // fully transparent
        const r0 = Math.floor(r), g0 = Math.floor(g), b0 = Math.floor(b);
        const r1 = Math.ceil(r), g1 = Math.ceil(g), b1 = Math.ceil(b);
        const rw = r - r0, gw = g - g0, bw = b - b0;
        const i0 = (r0 + g0 * N2 + b0 * N) * 4;
        const i1 = (r0 + g0 * N2 + b1 * N) * 4;
        const i2 = (r0 + g1 * N2 + b0 * N) * 4;
        const i3 = (r0 + g1 * N2 + b1 * N) * 4;
        const i4 = (r1 + g0 * N2 + b0 * N) * 4;
        const i5 = (r1 + g0 * N2 + b1 * N) * 4;
        const i6 = (r1 + g1 * N2 + b0 * N) * 4;
        const i7 = (r1 + g1 * N2 + b1 * N) * 4;
        data[p] = lerp(
            lerp(lerp(table[i0], table[i1], bw), lerp(table[i2], table[i3], bw), gw),
            lerp(lerp(table[i4], table[i5], bw), lerp(table[i6], table[i7], bw), gw), rw);
        data[p + 1] = lerp(
            lerp(lerp(table[i0 + 1], table[i1 + 1], bw), lerp(table[i2 + 1], table[i3 + 1], bw), gw),
            lerp(lerp(table[i4 + 1], table[i5 + 1], bw), lerp(table[i6 + 1], table[i7 + 1], bw), gw), rw);
        data[p + 2] = lerp(
            lerp(lerp(table[i0 + 2], table[i1 + 2], bw), lerp(table[i2 + 2], table[i3 + 2], bw), gw),
            lerp(lerp(table[i4 + 2], table[i5 + 2], bw), lerp(table[i6 + 2], table[i7 + 2], bw), gw), rw);
    }
}

/**
 * Decode a style's `color-theme` (`{ data: <base64 PNG> }`) into a LUT.
 * Returns null when absent/undecodable. The PNG is width N² × height N.
 */
export async function loadColorTheme(style: any): Promise<ColorThemeLut | null> {
    const theme = style?.['color-theme'];
    let dataUri: any = theme?.data;
    if (Array.isArray(dataUri)) {
        // mgl resolves `color-theme.data` as an expression against the
        // style/import config (["match", ["config", "colorTheme"], ...]).
        try {
            const { MBExpressionEngine } = require('./MBExpressionEngine');
            dataUri = MBExpressionEngine.evaluate(dataUri, { _config: style?._config ?? {} } as any);
        } catch {
            dataUri = undefined;
        }
    }
    if (typeof dataUri !== 'string' || dataUri.length === 0) return null;
    try {
        const img = new Image();
        const src = dataUri.startsWith('data:')
            ? dataUri
            : `data:image/png;base64,${dataUri.replace(/^local:\/\//, '')}`;
        img.src = src;
        await img.decode();
        const n = img.naturalHeight;
        if (!n || img.naturalWidth !== n * n) return null;
        const cv = document.createElement('canvas');
        cv.width = img.naturalWidth;
        cv.height = n;
        const cx = cv.getContext('2d')!;
        cx.drawImage(img, 0, 0);
        const data = cx.getImageData(0, 0, cv.width, n).data;
        return { data, n };
    } catch {
        return null;
    }
}
