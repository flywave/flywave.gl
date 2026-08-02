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
        if (g.width > maxGlyphW) maxGlyphW = g.width;
        if (g.height > maxGlyphH) maxGlyphH = g.height;
    }
    // Glyph size in pixels — mapbox encodes advances at 24px em; use 24.
    const size = 24;
    const distanceRange = 4;

    const font: Font = {
        name: fontName,
        metrics: {
            size,
            distanceRange,
            base: Math.round(size * 0.8),
            lineHeight: Math.round(size * 1.2),
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
        const glyphData = new GlyphData(
            codePoint,
            BLOCK_NAME,
            g.width,
            g.height,
            g.advance / size,          // advance in em units
            g.left,                    // offsetX
            size - g.top,              // offsetY (flip: mapbox top is from top)
            uv.u0, uv.v0, uv.u1, uv.v1,
            atlas.texture,
            font,
        );
        catalog.registerGlyph(fontName, "Regular", codePoint, glyphData);
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
    const cell = 32; // fixed cell for simplicity (mapbox SDF glyphs are ~24px)
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

        // Draw the SDF bitmap (grayscale alpha) into the cell.
        const imgData = ctx.createImageData(g.width, g.height);
        for (let i = 0; i < g.width * g.height; i++) {
            const v = g.bitmap[i] ?? 0;
            imgData.data[i * 4 + 0] = 255;
            imgData.data[i * 4 + 1] = 255;
            imgData.data[i * 4 + 2] = 255;
            imgData.data[i * 4 + 3] = v;
        }
        ctx.putImageData(imgData, px + PAD, py + PAD);

        // UVs into the atlas (flip V: canvas is Y-down, texture is Y-up).
        const u0 = (px + PAD) / atlasW;
        const v0 = 1.0 - (py + PAD + g.height) / atlasH;
        const u1 = (px + PAD + g.width) / atlasW;
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
            .replace(/^local:\/\//, '/base/mapbox-gl-js/test/integration/');
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
        return FontCatalog.fromData(fontName, "sdf", 24, 1, 1, 4, [{
            name: fontName,
            metrics: { size: 24, distanceRange: 4, base: 19, lineHeight: 28, lineGap: 0, capHeight: 17, xHeight: 12 },
            charset: "",
        }], [{
            name: BLOCK_NAME, min: BLOCK_MIN, max: BLOCK_MAX, fonts: [fontName],
        }], 1024, buildReplacementGlyph({ name: fontName, metrics: { size: 24, distanceRange: 4, base: 19, lineHeight: 28, lineGap: 0, capHeight: 17, xHeight: 12 }, charset: "" }));
    }
    return buildFontCatalogFromPBF(fontName, glyphs);
}
