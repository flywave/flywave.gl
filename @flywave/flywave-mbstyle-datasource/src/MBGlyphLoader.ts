import * as THREE from 'three';
import { parseGlyphPBF, ParsedGlyph, ParsedFontstack } from './GlyphPBFParser';

export interface GlyphMetrics {
    glyphId: number;
    width: number;
    height: number;
    left: number;
    top: number;
    advance: number;
    uvMin: [number, number];
    uvMax: [number, number];
}

export interface GlyphAtlasData {
    texture: THREE.Texture;
    getMetrics(font: string, char: string): GlyphMetrics | undefined;
}

/**
 * Standalone glyph-metrics loader. Returns a Map keyed by `${font}:${char}` →
 * metrics. Pure data (no DOM/canvas dependency), so safe to call from a
 * worker thread or anywhere fetch() is available. Used to wire real mapbox
 * PBF metrics into the text-shaping path even when the actual SDF rendering
 * still goes through flywave's own FontCatalog.
 *
 * The returned map is cumulative — repeated calls for different ranges
 * accumulate into the same map (the caller is expected to cache it).
 */
export async function loadGlyphMetrics(
    fontStack: string,
    ranges: number[],
    glyphUrlTemplate: string,
    out: Map<string, GlyphMetrics> = new Map(),
): Promise<Map<string, GlyphMetrics>> {
    for (const range of ranges) {
        const start = range * 256;
        const end = start + 255;
        const url = glyphUrlTemplate
            .replace('{fontstack}', encodeURIComponent(fontStack))
            .replace('{range}', `${start}-${end}`)
            .replace(/^local:\/\//, '/base/@flywave/flywave-mbstyle-datasource/test/rendering/integration/');
        try {
            const resp = await fetch(url);
            if (!resp.ok) continue;
            const buffer = await resp.arrayBuffer();
            const fontstack = parseGlyphPBF(buffer);
            if (!fontstack) continue;
            for (const [id, g] of fontstack.glyphs) {
                const char = String.fromCharCode(id);
                out.set(`${fontStack}:${char}`, {
                    glyphId: id,
                    width: g.width,
                    height: g.height,
                    left: g.left,
                    top: g.top,
                    advance: g.advance / 24, // mapbox encodes advance at 24px em
                    uvMin: [0, 0],
                    uvMax: [0, 0],
                });
            }
        } catch {
            // network / parse failure — skip this range
        }
    }
    return out;
}

const ATLAS_SIZE = 1024;
const GLYPH_PADDING = 1;

/**
 * §876: discover the glyph ranges a fixture actually needs.
 *
 * The former fixed ranges (0-7) covered only Latin/Greek/Cyrillic, so EVERY
 * CJK codepoint fell to the replacement glyph and the whole label rendered
 * blank (text-writing-mode / text-max-width / text-font-metrics families).
 * mgl loads glyph ranges on demand at placement time; a static harness
 * cannot, so instead collect the codepoints that can appear:
 *   1. every non-ASCII codepoint in the style JSON (text-field literals,
 *      formatted strings, geojson inline data),
 *   2. every valid UTF-8 sequence found in the style's LOCAL vector tiles
 *      covering the initial view (feature properties behind `{name}`).
 * plus the Latin baseline ranges 0-1. Ranges that don't exist for a font
 * are skipped by the fetch guard in loadGlyphMetrics.
 */
export async function discoverGlyphRanges(
    style: any,
    fontStacks: Iterable<string>,
    glyphUrlTemplate: string,
): Promise<Map<string, number[]>> {
    const chars = new Set<number>();
    const collectString = (s: string): void => {
        for (let i = 0; i < s.length; i++) {
            const cp = s.codePointAt(i)!;
            if (cp >= 0x80) chars.add(cp);
            if (cp > 0xffff) i++;
        }
    };
    // 1. Style JSON literals (includes inline geojson data).
    try {
        collectString(JSON.stringify(style));
    } catch { /* defensive */ }

    // 2. Local vector tiles covering the initial view — crude UTF-8 scan.
    //    MVT string values are raw UTF-8 in the protobuf payload; geometry
    //    bytes rarely form valid multi-byte sequences, and false positives
    //    only cost a 404-skipped range fetch.
    try {
        const integrationBase = '/base/@flywave/flywave-mbstyle-datasource/test/rendering/integration/';
        const center = style.center ?? [0, 0];
        const zoom = Math.max(0, Math.round(style.zoom ?? 0));
        const n = Math.pow(2, zoom);
        const lng = center[0] ?? 0, lat = center[1] ?? 0;
        const cx = Math.floor((lng / 360 + 0.5) * n);
        const latR = lat * Math.PI / 180;
        const cy = Math.floor((1 - Math.log(Math.tan(latR) + 1 / Math.cos(latR)) / Math.PI) / 2 * n);
        for (const src of Object.values(style.sources ?? {}) as any[]) {
            if (src?.type !== 'vector') continue;
            const tiles: string[] = src.tiles ?? [];
            for (const tpl of tiles) {
                if (!tpl.startsWith('local://')) continue;
                const urlBase = tpl.replace(/^local:\/\//, integrationBase);
                for (let dz = 0; dz <= 1; dz++) {
                    const z = zoom + dz, m = Math.pow(2, z);
                    if (z > 14) continue;
                    const xs = [cx * m / n | 0, Math.min(m - 1, (cx * m / n | 0) + 1)];
                    const ys = [cy * m / n | 0, Math.min(m - 1, (cy * m / n | 0) + 1)];
                    for (const x of xs) for (const y of ys) {
                        const url = integrationBase + urlBase
                            .replace('{z}', String(z)).replace('{x}', String(x)).replace('{y}', String(y))
                            .replace(/\{z\}|\{x\}|\{y\}/g, '0');
                        try {
                            const resp = await fetch(url);
                            if (!resp.ok) continue;
                            const bytes = new Uint8Array(await resp.arrayBuffer());
                            for (let i = 0; i < bytes.length;) {
                                const b = bytes[i];
                                if (b < 0x80) { i++; continue; }
                                const len = b >= 0xf0 ? 4 : b >= 0xe0 ? 3 : b >= 0xc0 ? 2 : 0;
                                if (len === 0 || i + len > bytes.length) { i++; continue; }
                                let ok = true;
                                for (let j = 1; j < len; j++) {
                                    if ((bytes[i + j] & 0xc0) !== 0x80) { ok = false; break; }
                                }
                                if (!ok) { i++; continue; }
                                // Decode the sequence to a codepoint.
                                let cp = b;
                                if (len === 2) cp = b & 0x1f;
                                else if (len === 3) cp = b & 0x0f;
                                else cp = b & 0x07;
                                for (let j = 1; j < len; j++) cp = (cp << 6) | (bytes[i + j] & 0x3f);
                                if (cp >= 0x80) chars.add(cp);
                                i += len;
                            }
                        } catch { /* skip tile */ }
                    }
                }
            }
        }
    } catch { /* defensive */ }

    const ranges = [...new Set([...chars].map(cp => cp >> 8))].sort((a, b) => a - b);
    const full = [0, 1, ...ranges];
    const out = new Map<string, number[]>();
    for (const stack of fontStacks) {
        out.set(stack.split(',')[0], full);
    }
    return out;
}

export class MBGlyphLoader {
    private m_atlasCanvas: HTMLCanvasElement | null = null;
    private m_atlasCtx: CanvasRenderingContext2D | null = null;
    private m_atlasTexture: THREE.Texture | null = null;
    private m_metrics = new Map<string, GlyphMetrics>();
    private m_cursorX = 0;
    private m_cursorY = 0;
    private m_rowHeight = 0;
    private m_loadedRanges = new Set<string>();
    private m_usePBF = false;

    constructor() {
        this.m_atlasCanvas = typeof document !== 'undefined'
            ? document.createElement('canvas')
            : null;
        if (this.m_atlasCanvas) {
            this.m_atlasCanvas.width = ATLAS_SIZE;
            this.m_atlasCanvas.height = ATLAS_SIZE;
            this.m_atlasCtx = this.m_atlasCanvas.getContext('2d', { willReadFrequently: true });
            if (this.m_atlasCtx) {
                this.m_atlasCtx.fillStyle = '#000';
                this.m_atlasCtx.fillRect(0, 0, ATLAS_SIZE, ATLAS_SIZE);
            }
        }
    }

    async loadGlyphRange(
        fontStack: string,
        range: number,
        glyphUrlTemplate: string,
    ): Promise<void> {
        const rangeKey = `${fontStack}:${range}`;
        if (this.m_loadedRanges.has(rangeKey)) return;

        const start = range * 256;
        const end = start + 255;
        const url = glyphUrlTemplate
            .replace('{fontstack}', encodeURIComponent(fontStack))
            .replace('{range}', `${start}-${end}`)
            .replace(/^local:\/\//, '/base/@flywave/flywave-mbstyle-datasource/test/rendering/integration/');

        try {
            const response = await fetch(url);
            if (response.ok) {
                const buffer = await response.arrayBuffer();
                const fontstack = parseGlyphPBF(buffer);
                if (fontstack) {
                    this.m_usePBF = true;
                    this.packPBFGlyphs(fontStack, fontstack);
                    this.m_loadedRanges.add(rangeKey);
                    this.updateTexture();
                    return;
                }
            }
        } catch {}

        if (!this.m_usePBF) {
            this.buildFallbackGlyphs(fontStack, start, end);
            this.m_loadedRanges.add(rangeKey);
            this.updateTexture();
        }
    }

    private packPBFGlyphs(fontStack: string, fontstack: ParsedFontstack): void {
        for (const [id, glyph] of fontstack.glyphs) {
            if (glyph.width === 0 || glyph.height === 0) {
                this.m_metrics.set(`${fontStack}:${String.fromCharCode(id)}`, {
                    glyphId: id,
                    width: 0,
                    height: 0,
                    left: glyph.left,
                    top: glyph.top,
                    advance: glyph.advance / 24,
                    uvMin: [0, 0],
                    uvMax: [0, 0],
                });
                continue;
            }
            this.packPBFGlyph(fontStack, glyph);
        }
    }

    private packPBFGlyph(fontStack: string, glyph: ParsedGlyph): void {
        if (!this.m_atlasCtx) return;
        // The PBF bitmap includes a 3px SDF border on every side, so its
        // stride is width+6 and its size is (width+6) x (height+6).
        const BORDER = 3;
        const w = glyph.width + 2 * BORDER;
        const h = glyph.height + 2 * BORDER;

        if (this.m_cursorX + w + GLYPH_PADDING > ATLAS_SIZE) {
            this.m_cursorX = 0;
            this.m_cursorY += this.m_rowHeight + GLYPH_PADDING;
            this.m_rowHeight = 0;
        }
        if (this.m_cursorY + h + GLYPH_PADDING > ATLAS_SIZE) return;

        const px = this.m_cursorX;
        const py = this.m_cursorY;
        const imgData = this.m_atlasCtx.createImageData(w, h);
        if (glyph.bitmap.length > 0) {
            // Mapbox bakes its SDF with the glyph edge at 0.75 (see
            // symbol.fragment.glsl `buff`); flywave's shader expects the edge
            // at 0.5, so remap by -64.
            for (let r = 0; r < h; r++) {
                for (let c = 0; c < w; c++) {
                    const v = Math.max(0, (glyph.bitmap[r * w + c] ?? 0) - 64);
                    const o = (r * w + c) * 4;
                    imgData.data[o + 0] = v;
                    imgData.data[o + 1] = v;
                    imgData.data[o + 2] = v;
                    imgData.data[o + 3] = 255;
                }
            }
        }
        this.m_atlasCtx.putImageData(imgData, px, py);

        const char = String.fromCharCode(glyph.id);
        this.m_metrics.set(`${fontStack}:${char}`, {
            glyphId: glyph.id,
            width: w,
            height: h,
            left: glyph.left - BORDER,
            top: glyph.top - BORDER,
            advance: glyph.advance / 24,
            uvMin: [px / ATLAS_SIZE, py / ATLAS_SIZE],
            uvMax: [(px + w) / ATLAS_SIZE, (py + h) / ATLAS_SIZE],
        });

        this.m_cursorX += w + GLYPH_PADDING;
        this.m_rowHeight = Math.max(this.m_rowHeight, h);
    }

    private buildFallbackGlyphs(fontStack: string, start: number, end: number): void {
        if (!this.m_atlasCtx) return;
        const fontSize = 32;
        this.m_atlasCtx.font = `${fontSize}px sans-serif`;
        this.m_atlasCtx.textAlign = 'left';
        this.m_atlasCtx.textBaseline = 'top';

        for (let code = start; code <= end && code < 0x10000; code++) {
            const char = String.fromCharCode(code);
            if (code < 32 || (code > 126 && code < 160)) continue;

            const m = this.m_atlasCtx.measureText(char);
            const w = Math.max(1, Math.ceil(m.width));
            const h = fontSize + 2;

            if (this.m_cursorX + w + GLYPH_PADDING > ATLAS_SIZE) {
                this.m_cursorX = 0;
                this.m_cursorY += this.m_rowHeight + GLYPH_PADDING;
                this.m_rowHeight = 0;
            }
            if (this.m_cursorY + h + GLYPH_PADDING > ATLAS_SIZE) continue;

            const px = this.m_cursorX;
            const py = this.m_cursorY;
            this.m_atlasCtx.fillStyle = '#000';
            this.m_atlasCtx.fillRect(px, py, w, h);
            this.m_atlasCtx.fillStyle = '#fff';
            this.m_atlasCtx.fillText(char, px, py);

            this.m_metrics.set(`${fontStack}:${char}`, {
                glyphId: code,
                width: w,
                height: h,
                left: 0,
                top: 0,
                advance: w / fontSize,
                uvMin: [px / ATLAS_SIZE, py / ATLAS_SIZE],
                uvMax: [(px + w) / ATLAS_SIZE, (py + h) / ATLAS_SIZE],
            });

            this.m_cursorX += w + GLYPH_PADDING;
            this.m_rowHeight = Math.max(this.m_rowHeight, h);
        }
    }

    private updateTexture(): void {
        if (!this.m_atlasCanvas) return;
        if (!this.m_atlasTexture) {
            this.m_atlasTexture = new THREE.CanvasTexture(this.m_atlasCanvas);
            this.m_atlasTexture.minFilter = THREE.LinearFilter;
            this.m_atlasTexture.magFilter = THREE.LinearFilter;
            this.m_atlasTexture.premultiplyAlpha = false;
        }
        this.m_atlasTexture.needsUpdate = true;
    }

    getAtlas(): THREE.Texture | null {
        return this.m_atlasTexture;
    }

    getMetrics(font: string, char: string): GlyphMetrics | undefined {
        return this.m_metrics.get(`${font}:${char}`);
    }

    isUsingPBF(): boolean {
        return this.m_usePBF;
    }

    dispose(): void {
        if (this.m_atlasTexture) {
            this.m_atlasTexture.dispose();
            this.m_atlasTexture = null;
        }
        this.m_metrics.clear();
        this.m_loadedRanges.clear();
    }
}
