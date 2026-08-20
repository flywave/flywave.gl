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
exports.MBGlyphLoader = void 0;
exports.loadGlyphMetrics = loadGlyphMetrics;
const THREE = __importStar(require("three"));
const GlyphPBFParser_1 = require("./GlyphPBFParser");
async function loadGlyphMetrics(fontStack, ranges, glyphUrlTemplate, out = new Map()) {
    for (const range of ranges) {
        const start = range * 256;
        const end = start + 255;
        const url = glyphUrlTemplate
            .replace('{fontstack}', encodeURIComponent(fontStack))
            .replace('{range}', `${start}-${end}`)
            .replace(/^local:\/\//, '/base/@flywave/flywave-mbstyle-datasource/test/rendering/integration/');
        try {
            const resp = await fetch(url);
            if (!resp.ok)
                continue;
            const buffer = await resp.arrayBuffer();
            const fontstack = (0, GlyphPBFParser_1.parseGlyphPBF)(buffer);
            if (!fontstack)
                continue;
            for (const [id, g] of fontstack.glyphs) {
                const char = String.fromCharCode(id);
                out.set(`${fontStack}:${char}`, {
                    glyphId: id,
                    width: g.width,
                    height: g.height,
                    left: g.left,
                    top: g.top,
                    advance: g.advance / 24,
                    uvMin: [0, 0],
                    uvMax: [0, 0],
                });
            }
        }
        catch (_a) {
        }
    }
    return out;
}
const ATLAS_SIZE = 1024;
const GLYPH_PADDING = 1;
class MBGlyphLoader {
    constructor() {
        this.m_atlasCanvas = null;
        this.m_atlasCtx = null;
        this.m_atlasTexture = null;
        this.m_metrics = new Map();
        this.m_cursorX = 0;
        this.m_cursorY = 0;
        this.m_rowHeight = 0;
        this.m_loadedRanges = new Set();
        this.m_usePBF = false;
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
    async loadGlyphRange(fontStack, range, glyphUrlTemplate) {
        const rangeKey = `${fontStack}:${range}`;
        if (this.m_loadedRanges.has(rangeKey))
            return;
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
                const fontstack = (0, GlyphPBFParser_1.parseGlyphPBF)(buffer);
                if (fontstack) {
                    this.m_usePBF = true;
                    this.packPBFGlyphs(fontStack, fontstack);
                    this.m_loadedRanges.add(rangeKey);
                    this.updateTexture();
                    return;
                }
            }
        }
        catch (_a) { }
        if (!this.m_usePBF) {
            this.buildFallbackGlyphs(fontStack, start, end);
            this.m_loadedRanges.add(rangeKey);
            this.updateTexture();
        }
    }
    packPBFGlyphs(fontStack, fontstack) {
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
    packPBFGlyph(fontStack, glyph) {
        var _a;
        if (!this.m_atlasCtx)
            return;
        const BORDER = 3;
        const w = glyph.width + 2 * BORDER;
        const h = glyph.height + 2 * BORDER;
        if (this.m_cursorX + w + GLYPH_PADDING > ATLAS_SIZE) {
            this.m_cursorX = 0;
            this.m_cursorY += this.m_rowHeight + GLYPH_PADDING;
            this.m_rowHeight = 0;
        }
        if (this.m_cursorY + h + GLYPH_PADDING > ATLAS_SIZE)
            return;
        const px = this.m_cursorX;
        const py = this.m_cursorY;
        const imgData = this.m_atlasCtx.createImageData(w, h);
        if (glyph.bitmap.length > 0) {
            for (let r = 0; r < h; r++) {
                for (let c = 0; c < w; c++) {
                    const v = Math.max(0, ((_a = glyph.bitmap[r * w + c]) !== null && _a !== void 0 ? _a : 0) - 64);
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
    buildFallbackGlyphs(fontStack, start, end) {
        if (!this.m_atlasCtx)
            return;
        const fontSize = 32;
        this.m_atlasCtx.font = `${fontSize}px sans-serif`;
        this.m_atlasCtx.textAlign = 'left';
        this.m_atlasCtx.textBaseline = 'top';
        for (let code = start; code <= end && code < 0x10000; code++) {
            const char = String.fromCharCode(code);
            if (code < 32 || (code > 126 && code < 160))
                continue;
            const m = this.m_atlasCtx.measureText(char);
            const w = Math.max(1, Math.ceil(m.width));
            const h = fontSize + 2;
            if (this.m_cursorX + w + GLYPH_PADDING > ATLAS_SIZE) {
                this.m_cursorX = 0;
                this.m_cursorY += this.m_rowHeight + GLYPH_PADDING;
                this.m_rowHeight = 0;
            }
            if (this.m_cursorY + h + GLYPH_PADDING > ATLAS_SIZE)
                continue;
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
    updateTexture() {
        if (!this.m_atlasCanvas)
            return;
        if (!this.m_atlasTexture) {
            this.m_atlasTexture = new THREE.CanvasTexture(this.m_atlasCanvas);
            this.m_atlasTexture.minFilter = THREE.LinearFilter;
            this.m_atlasTexture.magFilter = THREE.LinearFilter;
            this.m_atlasTexture.premultiplyAlpha = false;
        }
        this.m_atlasTexture.needsUpdate = true;
    }
    getAtlas() {
        return this.m_atlasTexture;
    }
    getMetrics(font, char) {
        return this.m_metrics.get(`${font}:${char}`);
    }
    isUsingPBF() {
        return this.m_usePBF;
    }
    dispose() {
        if (this.m_atlasTexture) {
            this.m_atlasTexture.dispose();
            this.m_atlasTexture = null;
        }
        this.m_metrics.clear();
        this.m_loadedRanges.clear();
    }
}
exports.MBGlyphLoader = MBGlyphLoader;
//# sourceMappingURL=MBGlyphLoader.js.map