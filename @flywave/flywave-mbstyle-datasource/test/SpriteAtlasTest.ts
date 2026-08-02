import { expect } from 'chai';
import * as THREE from 'three';
import { SpriteAtlas } from '../src/materials/MapIconMaterial';

/**
 * Build a fake "image" object with the shape SpriteAtlas needs (it only reads
 * `.width`/`.height`/`.naturalWidth`/`.naturalHeight` for texture creation
 * and UV math). This avoids needing a real <canvas>/DOM in Node-based unit
 * tests — the texture object just stores the reference.
 */
function makeFakeImage(w: number, h: number): any {
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
            const atlas = new SpriteAtlas(image, icons);
            expect(atlas.icons.size).to.equal(2);
            expect(atlas.texture).to.be.instanceOf(THREE.Texture);
        });
    });

    describe('getIconUv', () => {
        it('returns UV bounds for a known icon', () => {
            const image = makeFakeImage(128, 64);
            const icons = new Map([
                ['half', { x: 0, y: 0, width: 64, height: 64, pixelRatio: 1 }],
            ]);
            const atlas = new SpriteAtlas(image, icons);
            const uv = atlas.getIconUv('half');
            expect(uv).to.not.be.undefined;
            if (!uv) return;
            // half icon at top-left of a 128x64 atlas.
            expect(uv.uvMin[0]).to.be.closeTo(0, 1e-3);
            expect(uv.uvMin[1]).to.be.be.closeTo(0, 1e-3);
            expect(uv.uvMax[0]).to.be.closeTo(0.5, 1e-3);
            // Note: when initCanvas runs (DOM only) it replaces the image
            // with a larger canvas, which would make uvMax[1] smaller.
            // Without DOM, the original 64-height image stays, so yMax = 1.
            if (!HAS_DOCUMENT) {
                expect(uv.uvMax[1]).to.be.closeTo(1.0, 1e-3);
            }
        });

        it('returns undefined for unknown icon', () => {
            const image = makeFakeImage(32, 32);
            const atlas = new SpriteAtlas(image, new Map());
            expect(atlas.getIconUv('missing')).to.be.undefined;
        });

        it('computes correct UVs for icons not at the origin', () => {
            const image = makeFakeImage(256, 128);
            const icons = new Map([
                ['offset', { x: 64, y: 32, width: 32, height: 32, pixelRatio: 1 }],
            ]);
            const atlas = new SpriteAtlas(image, icons);
            const uv = atlas.getIconUv('offset');
            if (!uv) return expect.fail('uv missing');
            expect(uv.uvMin[0]).to.be.closeTo(64 / 256, 1e-3);
            expect(uv.uvMin[1]).to.be.closeTo(32 / 128, 1e-3);
            expect(uv.uvMax[0]).to.be.closeTo(96 / 256, 1e-3);
            expect(uv.uvMax[1]).to.be.closeTo(64 / 128, 1e-3);
        });
    });

    // The following tests need a real DOM (canvas) — skip in Node-only envs.
    describe('addIcon (DOM-only)', function () {
        before(function () {
            if (!HAS_DOCUMENT) this.skip();
        });

        it('adds a new icon at the cursor position', () => {
            const canvas = document.createElement('canvas');
            canvas.width = 32; canvas.height = 32;
            const atlas = new SpriteAtlas(canvas as any, new Map());
            const icon = document.createElement('canvas');
            icon.width = 16; icon.height = 16;
            const ok = atlas.addIcon('new', icon);
            expect(ok).to.equal(true);
            expect(atlas.icons.has('new')).to.equal(true);
            const info = atlas.icons.get('new')!;
            expect(info.width).to.equal(16);
            expect(info.height).to.equal(16);
        });

        it('refuses to overwrite an existing icon name', () => {
            const canvas = document.createElement('canvas');
            canvas.width = 32; canvas.height = 32;
            const icons = new Map([
                ['existing', { x: 0, y: 0, width: 16, height: 16, pixelRatio: 1 }],
            ]);
            const atlas = new SpriteAtlas(canvas as any, icons);
            const icon = document.createElement('canvas');
            icon.width = 8; icon.height = 8;
            const ok = atlas.addIcon('existing', icon);
            expect(ok).to.equal(false);
        });
    });

    describe('removeIcon', () => {
        it('removes an existing icon', () => {
            const image = makeFakeImage(32, 32);
            const icons = new Map([
                ['a', { x: 0, y: 0, width: 16, height: 16, pixelRatio: 1 }],
            ]);
            const atlas = new SpriteAtlas(image, icons);
            expect(atlas.removeIcon('a')).to.equal(true);
            expect(atlas.icons.has('a')).to.equal(false);
        });

        it('returns false for unknown icon', () => {
            const image = makeFakeImage(32, 32);
            const atlas = new SpriteAtlas(image, new Map());
            expect(atlas.removeIcon('missing')).to.equal(false);
        });
    });

    describe('dispose', () => {
        it('disposes the underlying THREE.Texture', () => {
            const image = makeFakeImage(32, 32);
            const atlas = new SpriteAtlas(image, new Map());
            let disposed = false;
            atlas.texture.dispose = () => { disposed = true; };
            atlas.dispose();
            expect(disposed).to.equal(true);
        });
    });
});
