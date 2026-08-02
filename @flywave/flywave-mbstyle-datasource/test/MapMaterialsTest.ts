import { expect } from 'chai';
import * as THREE from 'three';
import { MapFillMaterial } from '../src/materials/MapFillMaterial';
import { MapLineMaterial } from '../src/materials/MapLineMaterial';
import { MapCircleMaterial } from '../src/materials/MapCircleMaterial';
import { MapExtrusionMaterial } from '../src/materials/MapExtrusionMaterial';
import { MapHeatmapMaterial } from '../src/materials/MapHeatmapMaterial';
import { MapHillshadeMaterial } from '../src/materials/MapHillshadeMaterial';
import { MapRasterMaterial } from '../src/materials/MapRasterMaterial';
import { MapTerrainMaterial } from '../src/materials/MapTerrainMaterial';
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
        const mat = createMBMaterial('line', { 'line-color': '#123' }, { capabilities: MOCK_CAPS });
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
        const mat = createMBMaterial('nonexistent-type' as any, {}) as THREE.MeshBasicMaterial;
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

describe('MapHeatmapMaterial', () => {
    it('creates with defaults', () => {
        const mat = new MapHeatmapMaterial();
        expect(mat.uniforms.uRadius.value).to.equal(30);
        expect(mat.uniforms.uOpacity.value).to.equal(1);
    });

    it('applies heatmap-radius', () => {
        const mat = new MapHeatmapMaterial({ 'heatmap-radius': 50 });
        expect(mat.uniforms.uRadius.value).to.equal(50);
    });
});

describe('MapHillshadeMaterial', () => {
    it('creates with defaults', () => {
        const mat = new MapHillshadeMaterial();
        expect(mat.uniforms.uExaggeration.value).to.equal(0.5);
    });

    it('applies hillshade-exaggeration', () => {
        const mat = new MapHillshadeMaterial({ 'hillshade-exaggeration': 1 });
        expect(mat.uniforms.uExaggeration.value).to.equal(1);
    });

    it('sets DEM texture', () => {
        const mat = new MapHillshadeMaterial();
        const tex = new THREE.DataTexture(new Uint8Array([0]), 1, 1, THREE.RGBAFormat);
        mat.setDemTexture(tex);
        expect(mat.uniforms.uDemTexture.value).to.equal(tex);
    });
});

describe('MapRasterMaterial', () => {
    it('creates with defaults', () => {
        const mat = new MapRasterMaterial();
        expect(mat.opacity).to.equal(1);
        // opacity=1 → not transparent.
        expect(mat.transparent).to.equal(false);
    });

    it('applies raster-opacity', () => {
        const mat = new MapRasterMaterial({ 'raster-opacity': 0.5 });
        expect(mat.opacity).to.equal(0.5);
        expect(mat.transparent).to.equal(true);
    });

    it('stores paint values', () => {
        const mat = new MapRasterMaterial({
            'raster-opacity': 0.8,
            'raster-hue-rotate': 90,
            'raster-brightness-min': 0.2,
            'raster-brightness-max': 0.8,
            'raster-saturation': -0.5,
            'raster-contrast': 0.3,
        });
        const paint = mat.getPaint() as any;
        expect(paint['raster-opacity']).to.equal(0.8);
        expect(paint['raster-hue-rotate']).to.equal(90);
        expect(paint['raster-brightness-min']).to.equal(0.2);
        expect(paint['raster-brightness-max']).to.equal(0.8);
        expect(paint['raster-saturation']).to.equal(-0.5);
        expect(paint['raster-contrast']).to.equal(0.3);
    });

    it('updates paint via setPaint', () => {
        const mat = new MapRasterMaterial();
        mat.setPaint({ 'raster-opacity': 0.3, 'raster-saturation': 0.8 });
        const paint = mat.getPaint() as any;
        expect(paint['raster-opacity']).to.equal(0.3);
        expect(paint['raster-saturation']).to.equal(0.8);
        // Unchanged values should persist.
        expect(paint['raster-hue-rotate']).to.equal(0);
    });

    it('accepts and stores a raster texture', () => {
        const mat = new MapRasterMaterial();
        const tex = new THREE.DataTexture(new Uint8Array([255, 0, 0, 255]), 1, 1, THREE.RGBAFormat);
        mat.setRasterTexture(tex);
        expect(mat.map).to.equal(tex);
        // Clear texture.
        mat.setRasterTexture(null);
        expect(mat.map).to.be.undefined;
    });
});

describe('MapTerrainMaterial', () => {
    it('creates without errors', () => {
        const mat = new MapTerrainMaterial();
        expect(mat).to.be.instanceOf(THREE.MeshStandardMaterial);
    });

    it('setDrapeTexture stores the texture and triggers update', () => {
        const mat = new MapTerrainMaterial();
        const v0 = mat.version;
        const tex = new THREE.DataTexture(new Uint8Array([128]), 1, 1, THREE.RedFormat);
        mat.setDrapeTexture(tex);
        expect(mat.version).to.be.greaterThan(v0);
    });

    it('setExaggeration triggers material update', () => {
        const mat = new MapTerrainMaterial();
        const v0 = mat.version;
        mat.setExaggeration(1.5);
        expect(mat.version).to.be.greaterThan(v0);
    });

    it('setDemIsFloat triggers material update', () => {
        const mat = new MapTerrainMaterial();
        const v0 = mat.version;
        mat.setDemIsFloat(true);
        expect(mat.version).to.be.greaterThan(v0);
    });

    it('setDemLerp does NOT trigger material update (uniform only)', () => {
        const mat = new MapTerrainMaterial();
        const v0 = mat.version;
        mat.setDemLerp(0.5);
        expect(mat.version).to.equal(v0);
    });

    it('shader uses alpha-blend mix for drape with V-flip', () => {
        // Verify the compiled shader string uses mix() with a V-flip for
        // drape blending. This prevents empty drape areas from darkening
        // terrain and corrects the UV orientation mismatch between the
        // terrain mesh and the FBO render target.
        const mat = new MapTerrainMaterial();
        const fakeShader: any = {
            uniforms: {},
            vertexShader: '#include <common>\n#include <begin_vertex>',
            fragmentShader: '#include <common>\n#include <map_fragment>',
        };
        mat.onBeforeCompile(fakeShader, {} as any);
        expect(fakeShader.fragmentShader).to.contain('USE_DRAPE');
        expect(fakeShader.fragmentShader).to.contain('mix(diffuseColor.rgb, drapeColor.rgb, drapeColor.a)');
        // V-flip: 1.0 - vMapUv.y
        expect(fakeShader.fragmentShader).to.contain('1.0 - vMapUv.y');
        // Ensure the old multiply-based approach is gone.
        expect(fakeShader.fragmentShader).to.not.contain('diffuseColor *= drapeColor');
        // Ensure the un-flipped vMapUv is not used for drape sampling.
        expect(fakeShader.fragmentShader).to.not.contain('texture2D(uDrape, vMapUv)');
    });
});
