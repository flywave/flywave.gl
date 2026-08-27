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
exports.MapIconMaterial = exports.SpriteAtlas = void 0;
const THREE = __importStar(require("three"));
const DEFAULTS = {
    'icon-image': '',
    'icon-size': 1,
    'icon-color': '#ffffff',
    'icon-opacity': 1,
    'icon-rotate': 0,
    'icon-offset': [0, 0],
    'icon-rotation-alignment': 'auto',
};
class SpriteAtlas {
    constructor(image, icons) {
        this.m_canvas = null;
        this.m_ctx = null;
        this.m_cursorX = 0;
        this.m_cursorY = 0;
        this.m_rowHeight = 0;
        this.m_pristine = null;
        this.m_themed = false;
        this.texture = new THREE.Texture(image);
        this.texture.needsUpdate = true;
        this.texture.minFilter = THREE.LinearFilter;
        this.texture.magFilter = THREE.LinearFilter;
        this.icons = icons;
        this.initCanvas(image);
    }
    initCanvas(image) {
        var _a, _b, _c, _d;
        if (typeof document === 'undefined')
            return;
        const w = (_b = (_a = image.naturalWidth) !== null && _a !== void 0 ? _a : image.width) !== null && _b !== void 0 ? _b : image.width;
        const h = (_d = (_c = image.naturalHeight) !== null && _c !== void 0 ? _c : image.height) !== null && _d !== void 0 ? _d : image.height;
        const canvasW = Math.max(w * 2, 1024);
        const canvasH = Math.max(h * 2, 1024);
        this.m_canvas = document.createElement('canvas');
        this.m_canvas.width = canvasW;
        this.m_canvas.height = canvasH;
        this.m_ctx = this.m_canvas.getContext('2d');
        this.m_ctx.drawImage(image, 0, 0);
        this.m_cursorX = w;
        this.m_cursorY = 0;
        this.m_rowHeight = 0;
        this.texture.image = this.m_canvas;
        this.texture.needsUpdate = true;
    }
    addIcon(name, image, sdf = false) {
        var _a, _b;
        if (!this.m_ctx || !this.m_canvas)
            return false;
        if (this.icons.has(name))
            return false;
        const w = (_a = image.naturalWidth) !== null && _a !== void 0 ? _a : image.width;
        const h = (_b = image.naturalHeight) !== null && _b !== void 0 ? _b : image.height;
        const padding = 2;
        if (this.m_cursorX + w + padding > this.m_canvas.width) {
            this.m_cursorX = 0;
            this.m_cursorY += this.m_rowHeight + padding;
            this.m_rowHeight = 0;
        }
        if (this.m_cursorY + h + padding > this.m_canvas.height)
            return false;
        this.m_ctx.drawImage(image, this.m_cursorX, this.m_cursorY);
        this.icons.set(name, {
            x: this.m_cursorX, y: this.m_cursorY,
            width: w, height: h, pixelRatio: 1, sdf,
        });
        this.m_cursorX += w + padding;
        this.m_rowHeight = Math.max(this.m_rowHeight, h);
        this.texture.needsUpdate = true;
        return true;
    }
    removeIcon(name) {
        return this.icons.delete(name);
    }
    applyColorTheme(lut) {
        if (!this.m_ctx || !this.m_canvas)
            return;
        const dirtyW = Math.max(this.m_cursorX, 1);
        const dirtyH = Math.max(this.m_cursorY + this.m_rowHeight, 1);
        if (!this.m_pristine) {
            this.m_pristine = this.m_ctx.getImageData(0, 0, dirtyW, dirtyH);
        }
        else if (dirtyW > this.m_pristine.width || dirtyH > this.m_pristine.height) {
            const old = this.m_pristine;
            const grown = this.m_ctx.createImageData(dirtyW, dirtyH);
            for (let y = 0; y < old.height; y++) {
                const src = y * old.width * 4;
                const dst = y * grown.width * 4;
                grown.data.set(old.data.subarray(src, src + old.width * 4), dst);
            }
            this.m_pristine = grown;
        }
        const snap = this.m_pristine;
        const imgData = this.m_ctx.createImageData(snap.width, snap.height);
        imgData.data.set(snap.data);
        const { applyColorThemeToPixels } = require('../MBColorTheme');
        applyColorThemeToPixels(lut, imgData.data);
        this.m_ctx.putImageData(imgData, 0, 0);
        this.m_themed = !!lut;
        this.texture.needsUpdate = true;
    }
    get isThemed() {
        return this.m_themed;
    }
    getIconUv(name) {
        const info = this.icons.get(name);
        if (!info)
            return undefined;
        const texW = this.texture.image.width;
        const texH = this.texture.image.height;
        return {
            uvMin: [info.x / texW, info.y / texH],
            uvMax: [(info.x + info.width) / texW, (info.y + info.height) / texH],
        };
    }
    dispose() {
        this.texture.dispose();
    }
}
exports.SpriteAtlas = SpriteAtlas;
class MapIconMaterial extends THREE.SpriteMaterial {
    constructor(paint = {}) {
        super({
            transparent: true,
            depthWrite: false,
        });
        this.m_spriteAtlas = null;
        this.m_uvOffset = new THREE.Vector2(0, 0);
        this.m_uvScale = new THREE.Vector2(1, 1);
        this.m_iconWidth = 32;
        this.m_iconHeight = 32;
        this.m_paint = Object.assign(Object.assign({}, DEFAULTS), paint);
        const self = this;
        this.onBeforeCompile = (shader) => {
            shader.uniforms.uUvOffset = { value: self.m_uvOffset };
            shader.uniforms.uUvScale = { value: self.m_uvScale };
            shader.fragmentShader = shader.fragmentShader.replace('#include <common>', `#include <common>\nuniform vec2 uUvOffset;\nuniform vec2 uUvScale;`);
            shader.fragmentShader = shader.fragmentShader.replace('texture2D( map, vUv )', 'texture2D( map, uUvOffset + vUv * uUvScale )');
        };
        this.applyPaint();
    }
    setPaint(paint) {
        Object.assign(this.m_paint, paint);
        this.applyPaint();
    }
    setSpriteAtlas(atlas) {
        this.m_spriteAtlas = atlas;
        this.applyPaint();
    }
    getPaint() {
        return this.m_paint;
    }
    applyPaint() {
        var _a;
        const p = this.m_paint;
        this.color.set(p['icon-color']);
        this.opacity = p['icon-opacity'];
        this.rotation = ((_a = p['icon-rotate']) !== null && _a !== void 0 ? _a : 0) * Math.PI / 180;
        if (this.m_spriteAtlas) {
            const uv = this.m_spriteAtlas.getIconUv(p['icon-image']);
            if (uv) {
                this.m_uvOffset.set(uv.uvMin[0], uv.uvMin[1]);
                this.m_uvScale.set(uv.uvMax[0] - uv.uvMin[0], uv.uvMax[1] - uv.uvMin[1]);
                this.map = this.m_spriteAtlas.texture;
                const iconInfo = this.m_spriteAtlas.icons.get(p['icon-image']);
                if (iconInfo) {
                    this.m_iconWidth = iconInfo.width;
                    this.m_iconHeight = iconInfo.height;
                }
            }
        }
        this.needsUpdate = true;
    }
    get iconWidth() { return this.m_iconWidth; }
    get iconHeight() { return this.m_iconHeight; }
    dispose() {
        super.dispose();
    }
}
exports.MapIconMaterial = MapIconMaterial;
//# sourceMappingURL=MapIconMaterial.js.map