"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.buildFontCatalogFromPBF = buildFontCatalogFromPBF;
exports.buildFontCatalogFromMetrics = buildFontCatalogFromMetrics;
const THREE = __importStar(require("three"));
const flywave_text_canvas_1 = require("@flywave/flywave-text-canvas");
const flywave_text_canvas_2 = require("@flywave/flywave-text-canvas");
const flywave_text_canvas_3 = require("@flywave/flywave-text-canvas");
const BLOCK_NAME = "Basic Latin";
const BLOCK_MIN = 0;
const BLOCK_MAX = 255;
const GLYPH_PBF_BORDER = 3;
function glyphBitmapWidth(g) {
    return g.width + 2 * GLYPH_PBF_BORDER;
}
function glyphBitmapHeight(g) {
    return g.height + 2 * GLYPH_PBF_BORDER;
}
function buildFontCatalogFromPBF(fontName, glyphs) {
    const atlas = buildGlyphAtlas(glyphs);
    let maxGlyphW = 1;
    let maxGlyphH = 1;
    for (const [, g] of glyphs) {
        if (glyphBitmapWidth(g) > maxGlyphW)
            maxGlyphW = glyphBitmapWidth(g);
        if (glyphBitmapHeight(g) > maxGlyphH)
            maxGlyphH = glyphBitmapHeight(g);
    }
    const size = 24;
    const distanceRange = 8;
    const font = {
        name: fontName,
        metrics: {
            size,
            distanceRange,
            base: 17,
            lineHeight: size,
            lineGap: 0,
            capHeight: Math.round(size * 0.7),
            xHeight: Math.round(size * 0.5),
        },
        charset: String.fromCharCode(...Array.from(glyphs.keys()).filter(c => c < 0xFFFF)),
    };
    const unicodeBlocks = [{
            name: BLOCK_NAME,
            min: BLOCK_MIN,
            max: BLOCK_MAX,
            fonts: [fontName],
        }];
    const catalog = flywave_text_canvas_1.FontCatalog.fromData(fontName, "sdf", size, maxGlyphW, maxGlyphH, distanceRange, [font], unicodeBlocks, 1024, buildReplacementGlyph(font));
    for (const [codePoint, g] of glyphs) {
        const uv = atlas.uvs.get(codePoint);
        if (!uv)
            continue;
        const glyphData = new flywave_text_canvas_2.GlyphData(codePoint, BLOCK_NAME, glyphBitmapWidth(g), glyphBitmapHeight(g), g.advance, g.left - GLYPH_PBF_BORDER, font.metrics.distanceRange / 2 - g.top - GLYPH_PBF_BORDER, uv.u0, uv.v0, uv.u1, uv.v1, atlas.texture, font);
        catalog.registerGlyph(fontName, String(flywave_text_canvas_3.FontStyle.Regular), codePoint, glyphData);
    }
    return catalog;
}
function buildGlyphAtlas(glyphs) {
    var _a;
    const PAD = 1;
    let maxGlyphW = 1;
    let maxGlyphH = 1;
    for (const [, g] of glyphs) {
        if (glyphBitmapWidth(g) > maxGlyphW)
            maxGlyphW = glyphBitmapWidth(g);
        if (glyphBitmapHeight(g) > maxGlyphH)
            maxGlyphH = glyphBitmapHeight(g);
    }
    const cell = Math.max(maxGlyphW, maxGlyphH) + 2 * PAD;
    const cols = Math.ceil(Math.sqrt(glyphs.size)) || 1;
    const rows = Math.ceil(glyphs.size / cols) || 1;
    const atlasW = cols * cell;
    const atlasH = rows * cell;
    const canvas = document.createElement("canvas");
    canvas.width = atlasW;
    canvas.height = atlasH;
    const ctx = canvas.getContext("2d");
    ctx.clearRect(0, 0, atlasW, atlasH);
    const uvs = new Map();
    let idx = 0;
    for (const [codePoint, g] of glyphs) {
        const col = idx % cols;
        const row = Math.floor(idx / cols);
        const px = col * cell;
        const py = row * cell;
        const bw = glyphBitmapWidth(g);
        const bh = glyphBitmapHeight(g);
        if (g.bitmap.length > 0) {
            const imgData = ctx.createImageData(bw, bh);
            for (let r = 0; r < bh; r++) {
                for (let c = 0; c < bw; c++) {
                    const v = Math.max(0, ((_a = g.bitmap[r * bw + c]) !== null && _a !== void 0 ? _a : 0) - 64);
                    const o = (r * bw + c) * 4;
                    imgData.data[o + 0] = v;
                    imgData.data[o + 1] = v;
                    imgData.data[o + 2] = v;
                    imgData.data[o + 3] = 255;
                }
            }
            ctx.putImageData(imgData, px + PAD, py + PAD);
        }
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
function buildReplacementGlyph(font) {
    const canvas = document.createElement("canvas");
    canvas.width = 1;
    canvas.height = 1;
    const ctx = canvas.getContext("2d");
    ctx.clearRect(0, 0, 1, 1);
    const texture = new THREE.CanvasTexture(canvas);
    texture.needsUpdate = true;
    return new flywave_text_canvas_2.GlyphData(65533, "Specials", 1, 1, 0, 0, 0, 0, 0, 1, 1, texture, font, true);
}
async function buildFontCatalogFromMetrics(fontName, metrics, glyphUrlTemplate) {
    const { parseGlyphPBF } = await Promise.resolve().then(() => __importStar(require('./GlyphPBFParser')));
    const glyphs = new Map();
    for (let range = 0; range < 2; range++) {
        const start = range * 256;
        const end = start + 255;
        const url = glyphUrlTemplate
            .replace('{fontstack}', encodeURIComponent(fontName))
            .replace('{range}', `${start}-${end}`)
            .replace(/^local:\/\//, '/base/@flywave/flywave-mbstyle-datasource/test/rendering/integration/');
        try {
            const resp = await fetch(url);
            if (!resp.ok)
                continue;
            const fontstack = parseGlyphPBF(await resp.arrayBuffer());
            if (!fontstack)
                continue;
            for (const [id, g] of fontstack.glyphs) {
                glyphs.set(id, g);
            }
        }
        catch (_a) {
            continue;
        }
    }
    if (glyphs.size === 0) {
        const fallbackMetrics = { size: 24, distanceRange: 8, base: 17, lineHeight: 24, lineGap: 0, capHeight: 17, xHeight: 12 };
        return flywave_text_canvas_1.FontCatalog.fromData(fontName, "sdf", 24, 1, 1, 8, [{
                name: fontName,
                metrics: fallbackMetrics,
                charset: "",
            }], [{
                name: BLOCK_NAME, min: BLOCK_MIN, max: BLOCK_MAX, fonts: [fontName],
            }], 1024, buildReplacementGlyph({ name: fontName, metrics: fallbackMetrics, charset: "" }));
    }
    return buildFontCatalogFromPBF(fontName, glyphs);
}
//# sourceMappingURL=MBFontCatalogBuilder.js.map