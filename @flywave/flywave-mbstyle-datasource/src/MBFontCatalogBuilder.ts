import * as THREE from 'three';
import { FontCatalog } from '@flywave/flywave-text-canvas';
import { Font, FontMetrics, UnicodeBlock } from '@flywave/flywave-text-canvas';
import { GlyphData } from '@flywave/flywave-text-canvas';
import { FontStyle } from '@flywave/flywave-text-canvas';
import { ParsedGlyph } from './GlyphPBFParser';
import { GlyphMetrics } from './MBGlyphLoader';

/**
 * Converts mapbox PBF SDF glyph data into a flywave-compatible FontCatalog.
 *
 * Mapbox glyph PBFs contain per-glyph SDF bitmaps (width/height/left/top/advance
 * + a raw alpha bitmap). flywave's FontCatalog expects a `Font` + `FontMetrics`
 * plus `GlyphData` entries backed by a source `THREE.Texture` and per-glyph UVs.
 *
 * This builder:
 *   1. Collects all glyph bitmaps from the parsed PBF ranges into a single
 *      canvas-based atlas (one font = one atlas texture).
 *   2. Builds a `Font` (name + metrics) and a `Basic Latin` UnicodeBlock.
 *   3. Creates `GlyphData` for every glyph with UVs into the atlas.
 *   4. Registers them via `FontCatalog.registerGlyph()`.
 *
 * The resulting catalog can be injected into a running MapView via
 * `mapView.setFontCatalog(name, catalog)`.
 */

const BLOCK_NAME = "Basic Latin";
const BLOCK_MIN = 0;
const BLOCK_MAX = 255;

/**
 * Mapbox glyph PBF bitmaps carry a 3px SDF border on every side: the raw
 * bitmap is (width + 2 * GLYPH_PBF_BORDER) x (height + 2 * GLYPH_PBF_BORDER)
 * pixels while `width`/`height`/`left`/`top` describe the inner glyph box
 * (see mapbox-gl-js `parse_glyph_pbf.ts`, `GLYPH_PBF_BORDER = 3`).
 */
const GLYPH_PBF_BORDER = 3;

function glyphBitmapWidth(g: ParsedGlyph): number {
    return g.width + 2 * GLYPH_PBF_BORDER;
}

function glyphBitmapHeight(g: ParsedGlyph): number {
    return g.height + 2 * GLYPH_PBF_BORDER;
}

/**
 * Convert a PBF glyph map (codePoint → ParsedGlyph) into a flywave FontCatalog.
 *
 * @param fontName - Font name (e.g. "Open Sans Regular").
 * @param glyphs - Map of code point → PBF glyph data.
 * @returns A ready-to-inject FontCatalog.
 */
export function buildFontCatalogFromPBF(
    fontName: string,
    glyphs: Map<number, ParsedGlyph>,
): FontCatalog {
    const atlas = buildGlyphAtlas(glyphs);
    let maxGlyphW = 1;
    let maxGlyphH = 1;
    for (const [, g] of glyphs) {
        if (glyphBitmapWidth(g) > maxGlyphW) maxGlyphW = glyphBitmapWidth(g);
        if (glyphBitmapHeight(g) > maxGlyphH) maxGlyphH = glyphBitmapHeight(g);
    }
    // Glyph size in pixels — mapbox encodes advances at 24px em; use 24.
    const size = 24;
    // Mapbox rasterizes glyph SDFs with a radius of 8 at the 24px em, so the
    // shader must interpret the distance field with distanceRange = 8.
    const distanceRange = 8;

    const font: Font = {
        name: fontName,
        metrics: {
            size,
            distanceRange,
            // Mapbox falls back to SHAPING_DEFAULT_OFFSET (-17) as the baseline
            // when the glyph PBF carries no ascender/descender; these fixtures
            // omit them, so use the same 17px baseline.
            base: 17,
            // 1em line height: LineTypesetter advances lines by
            // (lineHeight + leading) * (textSize / catalogSize).
            lineHeight: size,
            lineGap: 0,
            capHeight: Math.round(size * 0.7),
            xHeight: Math.round(size * 0.5),
        },
        charset: String.fromCharCode(...Array.from(glyphs.keys()).filter(c => c < 0xFFFF)),
    };

    const unicodeBlocks: UnicodeBlock[] = [{
        name: BLOCK_NAME,
        min: BLOCK_MIN,
        max: BLOCK_MAX,
        fonts: [fontName],
    }];

    const catalog = FontCatalog.fromData(
        fontName,
        "sdf",
        size,
        maxGlyphW,
        maxGlyphH,
        distanceRange,
        [font],
        unicodeBlocks,
        1024,
        // Minimal replacement glyph (a 1×1 transparent texture).
        buildReplacementGlyph(font),
    );

    // Register each glyph.
    for (const [codePoint, g] of glyphs) {
        const uv = atlas.uvs.get(codePoint);
        if (!uv) continue;
        // Mapbox metrics are at 24px em. `advance` is already in those pixel
        // units (LineTypesetter scales by textSize/catalogSize), and `left` /
        // `top` position the bitmap relative to the baseline origin. The quad
        // must cover the full bordered bitmap (width+6 x height+6); shifting
        // offsetX/offsetY by -border keeps the content ink at the same place
        // as before while letting the SDF bleed render correctly.
        const glyphData = new GlyphData(
            codePoint,
            BLOCK_NAME,
            glyphBitmapWidth(g),
            glyphBitmapHeight(g),
            g.advance,               // advance in catalog pixel units (no /size)
            g.left - GLYPH_PBF_BORDER,                 // offsetX
            font.metrics.distanceRange / 2 - g.top - GLYPH_PBF_BORDER,  // offsetY
            uv.u0, uv.v0, uv.u1, uv.v1,
            atlas.texture,
            font,
        );
        // The lookup hash in FontCatalog.loadCharset/getGlyph is
        // `${font.name}_${fontStyle}` where fontStyle is the *numeric*
        // FontStyle enum (Regular = 0), so register with the same key.
        catalog.registerGlyph(fontName, String(FontStyle.Regular), codePoint, glyphData);
    }

    return catalog;
}

interface GlyphAtlas {
    texture: THREE.Texture;
    uvs: Map<number, { u0: number; v0: number; u1: number; v1: number }>;
}

/**
 * Pack all glyph bitmaps into a single canvas atlas texture.
 * Each glyph is placed at a packed position; UVs are recorded per code point.
 */
function buildGlyphAtlas(glyphs: Map<number, ParsedGlyph>): GlyphAtlas {
    const PAD = 1;
    let maxGlyphW = 1;
    let maxGlyphH = 1;
    for (const [, g] of glyphs) {
        if (glyphBitmapWidth(g) > maxGlyphW) maxGlyphW = glyphBitmapWidth(g);
        if (glyphBitmapHeight(g) > maxGlyphH) maxGlyphH = glyphBitmapHeight(g);
    }
    // Cell sized to the largest (bordered) glyph (+padding) so wide glyphs
    // can't bleed into the next cell.
    const cell = Math.max(maxGlyphW, maxGlyphH) + 2 * PAD;
    const cols = Math.ceil(Math.sqrt(glyphs.size)) || 1;
    const rows = Math.ceil(glyphs.size / cols) || 1;
    const atlasW = cols * cell;
    const atlasH = rows * cell;

    const canvas = document.createElement("canvas");
    canvas.width = atlasW;
    canvas.height = atlasH;
    const ctx = canvas.getContext("2d")!;
    ctx.clearRect(0, 0, atlasW, atlasH);

    const uvs = new Map<number, { u0: number; v0: number; u1: number; v1: number }>();

    let idx = 0;
    for (const [codePoint, g] of glyphs) {
        const col = idx % cols;
        const row = Math.floor(idx / cols);
        const px = col * cell;
        const py = row * cell;
        const bw = glyphBitmapWidth(g);
        const bh = glyphBitmapHeight(g);

        if (g.bitmap.length > 0) {
            // Copy the full bordered bitmap row-by-row (stride = bw) into the
            // RGB channels — the SDF shader reads texel.r (edge at 0.5) and
            // interprets the value with distanceRange. Alpha must stay opaque.
            //
            // Mapbox bakes its glyph SDFs with the glyph edge at 0.75 (the
            // shader's `buff = (256-64)/256`, see mapbox-gl-js
            // symbol.fragment.glsl), while flywave's shader assumes the edge at
            // 0.5. Remap by -64 (=-0.25) so the edge lands on 0.5 and strokes
            // don't bloom into solid blobs.
            const imgData = ctx.createImageData(bw, bh);
            for (let r = 0; r < bh; r++) {
                for (let c = 0; c < bw; c++) {
                    const v = Math.max(0, (g.bitmap[r * bw + c] ?? 0) - 64);
                    const o = (r * bw + c) * 4;
                    imgData.data[o + 0] = v;
                    imgData.data[o + 1] = v;
                    imgData.data[o + 2] = v;
                    imgData.data[o + 3] = 255;
                }
            }
            ctx.putImageData(imgData, px + PAD, py + PAD);
        }

        // UVs into the atlas (flip V: canvas is Y-down, texture is Y-up).
        const u0 = (px + PAD) / atlasW;
        const v0 = 1.0 - (py + PAD + bh) / atlasH;
        const u1 = (px + PAD + bw) / atlasW;
        const v1 = 1.0 - (py + PAD) / atlasH;
        uvs.set(codePoint, { u0, v0, u1, v1 });

        idx++;
    }

    const texture = new THREE.CanvasTexture(canvas);
    texture.needsUpdate = true;
    texture.minFilter = THREE.LinearFilter;
    texture.magFilter = THREE.LinearFilter;
    texture.premultiplyAlpha = false;
    return { texture, uvs };
}

/**
 * Build a minimal replacement glyph (a 1×1 transparent square) for missing
 * code points. Required by the FontCatalog constructor.
 */
function buildReplacementGlyph(font: Font): GlyphData {
    const canvas = document.createElement("canvas");
    canvas.width = 1;
    canvas.height = 1;
    const ctx = canvas.getContext("2d")!;
    ctx.clearRect(0, 0, 1, 1);
    const texture = new THREE.CanvasTexture(canvas);
    texture.needsUpdate = true;
    return new GlyphData(65533, "Specials", 1, 1, 0, 0, 0, 0, 0, 1, 1, texture, font, true);
}

/**
 * Convenience wrapper: build a FontCatalog from a glyph metrics map
 * (font → char → metrics) by re-fetching the PBF glyph bitmaps.
 * Kept for parity with MBGlyphLoader's metrics-only path.
 */
export async function buildFontCatalogFromMetrics(
    fontName: string,
    metrics: Map<string, GlyphMetrics>,
    glyphUrlTemplate: string,
): Promise<FontCatalog> {
    const { parseGlyphPBF } = await import('./GlyphPBFParser');
    const glyphs = new Map<number, ParsedGlyph>();
    // Load ranges 0-255 (Basic Latin) for the given font.
    for (let range = 0; range < 2; range++) {
        const start = range * 256;
        const end = start + 255;
        const url = glyphUrlTemplate
            .replace('{fontstack}', encodeURIComponent(fontName))
            .replace('{range}', `${start}-${end}`)
            .replace(/^local:\/\//, '/base/@flywave/flywave-mbstyle-datasource/test/rendering/integration/');
        try {
            const resp = await fetch(url);
            if (!resp.ok) continue;
            const fontstack = parseGlyphPBF(await resp.arrayBuffer());
            if (!fontstack) continue;
            for (const [id, g] of fontstack.glyphs) {
                glyphs.set(id, g);
            }
        } catch {
            continue;
        }
    }
    if (glyphs.size === 0) {
        // No glyphs loaded — return a minimal catalog.
        const fallbackMetrics: FontMetrics = { size: 24, distanceRange: 8, base: 17, lineHeight: 24, lineGap: 0, capHeight: 17, xHeight: 12 };
        return FontCatalog.fromData(fontName, "sdf", 24, 1, 1, 8, [{
            name: fontName,
            metrics: fallbackMetrics,
            charset: "",
        }], [{
            name: BLOCK_NAME, min: BLOCK_MIN, max: BLOCK_MAX, fonts: [fontName],
        }], 1024, buildReplacementGlyph({ name: fontName, metrics: fallbackMetrics, charset: "" }));
    }
    return buildFontCatalogFromPBF(fontName, glyphs);
}
