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
const chai_1 = require("chai");
const THREE = __importStar(require("three"));
const MapIconMaterial_1 = require("../src/materials/MapIconMaterial");
function makeFakeImage(w, h) {
    return { naturalWidth: w, naturalHeight: h, width: w, height: h };
}
const HAS_DOCUMENT = typeof document !== 'undefined';
describe('SpriteAtlas', () => {
    describe('constructor', () => {
        it('stores the input image as the atlas base and exposes icons', () => {
            const image = makeFakeImage(64, 32);
            const icons = new Map([
                ['icon-a', { x: 0, y: 0, width: 32, height: 32, pixelRatio: 1 }],
                ['icon-b', { x: 32, y: 0, width: 32, height: 32, pixelRatio: 1 }],
            ]);
            const atlas = new MapIconMaterial_1.SpriteAtlas(image, icons);
            (0, chai_1.expect)(atlas.icons.size).to.equal(2);
            (0, chai_1.expect)(atlas.texture).to.be.instanceOf(THREE.Texture);
        });
    });
    describe('getIconUv', () => {
        it('returns UV bounds for a known icon', () => {
            const image = makeFakeImage(128, 64);
            const icons = new Map([
                ['half', { x: 0, y: 0, width: 64, height: 64, pixelRatio: 1 }],
            ]);
            const atlas = new MapIconMaterial_1.SpriteAtlas(image, icons);
            const uv = atlas.getIconUv('half');
            (0, chai_1.expect)(uv).to.not.be.undefined;
            if (!uv)
                return;
            (0, chai_1.expect)(uv.uvMin[0]).to.be.closeTo(0, 1e-3);
            (0, chai_1.expect)(uv.uvMin[1]).to.be.be.closeTo(0, 1e-3);
            (0, chai_1.expect)(uv.uvMax[0]).to.be.closeTo(0.5, 1e-3);
            if (!HAS_DOCUMENT) {
                (0, chai_1.expect)(uv.uvMax[1]).to.be.closeTo(1.0, 1e-3);
            }
        });
        it('returns undefined for unknown icon', () => {
            const image = makeFakeImage(32, 32);
            const atlas = new MapIconMaterial_1.SpriteAtlas(image, new Map());
            (0, chai_1.expect)(atlas.getIconUv('missing')).to.be.undefined;
        });
        it('computes correct UVs for icons not at the origin', () => {
            const image = makeFakeImage(256, 128);
            const icons = new Map([
                ['offset', { x: 64, y: 32, width: 32, height: 32, pixelRatio: 1 }],
            ]);
            const atlas = new MapIconMaterial_1.SpriteAtlas(image, icons);
            const uv = atlas.getIconUv('offset');
            if (!uv)
                return chai_1.expect.fail('uv missing');
            (0, chai_1.expect)(uv.uvMin[0]).to.be.closeTo(64 / 256, 1e-3);
            (0, chai_1.expect)(uv.uvMin[1]).to.be.closeTo(32 / 128, 1e-3);
            (0, chai_1.expect)(uv.uvMax[0]).to.be.closeTo(96 / 256, 1e-3);
            (0, chai_1.expect)(uv.uvMax[1]).to.be.closeTo(64 / 128, 1e-3);
        });
    });
    describe('addIcon (DOM-only)', function () {
        before(function () {
            if (!HAS_DOCUMENT)
                this.skip();
        });
        it('adds a new icon at the cursor position', () => {
            const canvas = document.createElement('canvas');
            canvas.width = 32;
            canvas.height = 32;
            const atlas = new MapIconMaterial_1.SpriteAtlas(canvas, new Map());
            const icon = document.createElement('canvas');
            icon.width = 16;
            icon.height = 16;
            const ok = atlas.addIcon('new', icon);
            (0, chai_1.expect)(ok).to.equal(true);
            (0, chai_1.expect)(atlas.icons.has('new')).to.equal(true);
            const info = atlas.icons.get('new');
            (0, chai_1.expect)(info.width).to.equal(16);
            (0, chai_1.expect)(info.height).to.equal(16);
        });
        it('refuses to overwrite an existing icon name', () => {
            const canvas = document.createElement('canvas');
            canvas.width = 32;
            canvas.height = 32;
            const icons = new Map([
                ['existing', { x: 0, y: 0, width: 16, height: 16, pixelRatio: 1 }],
            ]);
            const atlas = new MapIconMaterial_1.SpriteAtlas(canvas, icons);
            const icon = document.createElement('canvas');
            icon.width = 8;
            icon.height = 8;
            const ok = atlas.addIcon('existing', icon);
            (0, chai_1.expect)(ok).to.equal(false);
        });
    });
    describe('removeIcon', () => {
        it('removes an existing icon', () => {
            const image = makeFakeImage(32, 32);
            const icons = new Map([
                ['a', { x: 0, y: 0, width: 16, height: 16, pixelRatio: 1 }],
            ]);
            const atlas = new MapIconMaterial_1.SpriteAtlas(image, icons);
            (0, chai_1.expect)(atlas.removeIcon('a')).to.equal(true);
            (0, chai_1.expect)(atlas.icons.has('a')).to.equal(false);
        });
        it('returns false for unknown icon', () => {
            const image = makeFakeImage(32, 32);
            const atlas = new MapIconMaterial_1.SpriteAtlas(image, new Map());
            (0, chai_1.expect)(atlas.removeIcon('missing')).to.equal(false);
        });
    });
    describe('dispose', () => {
        it('disposes the underlying THREE.Texture', () => {
            const image = makeFakeImage(32, 32);
            const atlas = new MapIconMaterial_1.SpriteAtlas(image, new Map());
            let disposed = false;
            atlas.texture.dispose = () => { disposed = true; };
            atlas.dispose();
            (0, chai_1.expect)(disposed).to.equal(true);
        });
    });
});
//# sourceMappingURL=SpriteAtlasTest.js.map