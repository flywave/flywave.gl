import { expect } from 'chai';
import * as THREE from 'three';
import { MapFillMaterial } from '../src/materials/MapFillMaterial';
import { MapLineMaterial } from '../src/materials/MapLineMaterial';
import { MapCircleMaterial } from '../src/materials/MapCircleMaterial';
import { MapExtrusionMaterial } from '../src/materials/MapExtrusionMaterial';
import { createMBMaterial, updateMBMaterial } from '../src/materials/index';

const MOCK_CAPS = { isWebGL2: true, maxTextures: 16, maxVertexTextures: 16, maxTextureSize: 4096, maxVertexUniforms: 1024 };

describe('MapFillMaterial', () => {
    it('creates with defaults', () => {
        const mat = new MapFillMaterial();
        expect(mat.color.getHexString()).to.equal('000000');
        expect(mat.opacity).to.equal(1);
    });

    it('applies fill-color and opacity', () => {
        const mat = new MapFillMaterial({
            'fill-color': '#ff0000',
            'fill-opacity': 0.5,
        });
        expect(mat.color.getHexString()).to.equal('ff0000');
        expect(mat.opacity).to.equal(0.5);
        expect(mat.transparent).to.be.true;
    });

    it('applies fill-outline-color', () => {
        const mat = new MapFillMaterial({
            'fill-color': '#00ff00',
            'fill-outline-color': '#000000',
        });
        expect(mat.hasOutline).to.be.true;
        expect(mat.outlineColor.getHexString()).to.equal('000000');
    });

    it('updates paint via setPaint', () => {
        const mat = new MapFillMaterial();
        mat.setPaint({ 'fill-color': '#0000ff', 'fill-opacity': 0.8 });
        expect(mat.color.getHexString()).to.equal('0000ff');
        expect(mat.opacity).to.equal(0.8);
    });

    it('factory creates fill material', () => {
        const mat = createMBMaterial('fill', { 'fill-color': '#abc' });
        expect(mat).to.be.instanceOf(MapFillMaterial);
        expect((mat as MapFillMaterial).color.getHexString()).to.equal('aabbcc');
    });
});

describe('MapLineMaterial', () => {
    it('creates with defaults', () => {
        const mat = new MapLineMaterial({}, MOCK_CAPS as any);
        expect(mat).to.be.ok;
    });

    it('applies line-color and width', () => {
        const mat = new MapLineMaterial({
            'line-color': '#ff0000',
            'line-width': 3,
        }, MOCK_CAPS as any);
        expect(mat.color.getHexString()).to.equal('ff0000');
        expect(mat.lineWidth).to.equal(3);
    });

    it('applies line-dasharray', () => {
        const mat = new MapLineMaterial({
            'line-dasharray': [4, 2],
        }, MOCK_CAPS as any);
        expect(mat.dashSize).to.equal(4);
        expect(mat.gapSize).to.equal(2);
    });

    it('factory creates line material', () => {
        const mat = createMBMaterial('line', { 'line-color': '#123' }, MOCK_CAPS);
        expect(mat).to.be.instanceOf(MapLineMaterial);
    });
});

describe('MapCircleMaterial', () => {
    it('creates with defaults', () => {
        const mat = new MapCircleMaterial();
        expect(mat.uniforms.uColor.value.getHexString()).to.equal('000000');
        expect(mat.uniforms.uSize.value).to.equal(10);
    });

    it('applies circle-color and radius', () => {
        const mat = new MapCircleMaterial({
            'circle-color': '#00ff00',
            'circle-radius': 10,
        });
        expect(mat.uniforms.uColor.value.getHexString()).to.equal('00ff00');
        expect(mat.uniforms.uSize.value).to.equal(20);
    });

    it('applies circle-stroke', () => {
        const mat = new MapCircleMaterial({
            'circle-color': '#ff0000',
            'circle-stroke-color': '#ffffff',
            'circle-stroke-width': 2,
        });
        expect(mat.uniforms.uStrokeColor.value.getHexString()).to.equal('ffffff');
        expect(mat.uniforms.uStrokeWidth.value).to.equal(2);
    });

    it('applies circle-blur', () => {
        const mat = new MapCircleMaterial({ 'circle-blur': 0.5 });
        expect(mat.uniforms.uBlur.value).to.equal(0.5);
    });

    it('factory creates circle material', () => {
        const mat = createMBMaterial('circle', { 'circle-color': '#456' });
        expect(mat).to.be.instanceOf(MapCircleMaterial);
    });
});

describe('MapExtrusionMaterial', () => {
    it('creates with defaults', () => {
        const mat = new MapExtrusionMaterial();
        expect(mat.color.getHexString()).to.equal('000000');
    });

    it('applies extrusion-color and opacity', () => {
        const mat = new MapExtrusionMaterial({
            'fill-extrusion-color': '#cccccc',
            'fill-extrusion-opacity': 0.7,
        });
        expect(mat.color.getHexString()).to.equal('cccccc');
        expect(mat.opacity).to.equal(0.7);
    });

    it('factory creates extrusion material', () => {
        const mat = createMBMaterial('fill-extrusion', {
            'fill-extrusion-color': '#789',
        });
        expect(mat).to.be.instanceOf(MapExtrusionMaterial);
    });
});

describe('createMBMaterial', () => {
    it('creates background as fill material', () => {
        const mat = createMBMaterial('background', { 'background-color': '#eeeeee' });
        expect(mat).to.be.instanceOf(MapFillMaterial);
        expect((mat as MapFillMaterial).color.getHexString()).to.equal('eeeeee');
    });

    it('creates fallback for unknown type', () => {
        const mat = createMBMaterial('raster' as any, {}) as THREE.MeshBasicMaterial;
        expect(mat).to.be.instanceOf(THREE.MeshBasicMaterial);
        expect(mat.color.getHexString()).to.equal('ff00ff');
    });
});

describe('updateMBMaterial', () => {
    it('updates fill material', () => {
        const mat = createMBMaterial('fill', { 'fill-color': '#000' }) as MapFillMaterial;
        updateMBMaterial(mat, 'fill', { 'fill-color': '#fff' });
        expect(mat.color.getHexString()).to.equal('ffffff');
    });

    it('updates circle material', () => {
        const mat = createMBMaterial('circle', { 'circle-color': '#000' }) as MapCircleMaterial;
        updateMBMaterial(mat, 'circle', { 'circle-color': '#ff0' });
        expect(mat.uniforms.uColor.value.getHexString()).to.equal('ffff00');
    });
});
