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
const MapFillMaterial_1 = require("../src/materials/MapFillMaterial");
const MapLineMaterial_1 = require("../src/materials/MapLineMaterial");
const MapCircleMaterial_1 = require("../src/materials/MapCircleMaterial");
const MapExtrusionMaterial_1 = require("../src/materials/MapExtrusionMaterial");
const MapHeatmapMaterial_1 = require("../src/materials/MapHeatmapMaterial");
const MapHillshadeMaterial_1 = require("../src/materials/MapHillshadeMaterial");
const MapRasterMaterial_1 = require("../src/materials/MapRasterMaterial");
const MapTerrainMaterial_1 = require("../src/materials/MapTerrainMaterial");
const index_1 = require("../src/materials/index");
const MOCK_CAPS = { isWebGL2: true, maxTextures: 16, maxVertexTextures: 16, maxTextureSize: 4096, maxVertexUniforms: 1024 };
describe('MapFillMaterial', () => {
    it('creates with defaults', () => {
        const mat = new MapFillMaterial_1.MapFillMaterial();
        (0, chai_1.expect)(mat.color.getHexString()).to.equal('000000');
        (0, chai_1.expect)(mat.opacity).to.equal(1);
    });
    it('applies fill-color and opacity', () => {
        const mat = new MapFillMaterial_1.MapFillMaterial({
            'fill-color': '#ff0000',
            'fill-opacity': 0.5,
        });
        (0, chai_1.expect)(mat.color.getHexString()).to.equal('ff0000');
        (0, chai_1.expect)(mat.opacity).to.equal(0.5);
        (0, chai_1.expect)(mat.transparent).to.be.true;
    });
    it('applies fill-outline-color', () => {
        const mat = new MapFillMaterial_1.MapFillMaterial({
            'fill-color': '#00ff00',
            'fill-outline-color': '#000000',
        });
        (0, chai_1.expect)(mat.hasOutline).to.be.true;
        (0, chai_1.expect)(mat.outlineColor.getHexString()).to.equal('000000');
    });
    it('updates paint via setPaint', () => {
        const mat = new MapFillMaterial_1.MapFillMaterial();
        mat.setPaint({ 'fill-color': '#0000ff', 'fill-opacity': 0.8 });
        (0, chai_1.expect)(mat.color.getHexString()).to.equal('0000ff');
        (0, chai_1.expect)(mat.opacity).to.equal(0.8);
    });
    it('factory creates fill material', () => {
        const mat = (0, index_1.createMBMaterial)('fill', { 'fill-color': '#abc' });
        (0, chai_1.expect)(mat).to.be.instanceOf(MapFillMaterial_1.MapFillMaterial);
        (0, chai_1.expect)(mat.color.getHexString()).to.equal('aabbcc');
    });
});
describe('MapLineMaterial', () => {
    it('creates with defaults', () => {
        const mat = new MapLineMaterial_1.MapLineMaterial({}, MOCK_CAPS);
        (0, chai_1.expect)(mat).to.be.ok;
    });
    it('applies line-color and width', () => {
        const mat = new MapLineMaterial_1.MapLineMaterial({
            'line-color': '#ff0000',
            'line-width': 3,
        }, MOCK_CAPS);
        (0, chai_1.expect)(mat.color.getHexString()).to.equal('ff0000');
        (0, chai_1.expect)(mat.lineWidth).to.equal(3);
    });
    it('applies line-dasharray', () => {
        const mat = new MapLineMaterial_1.MapLineMaterial({
            'line-dasharray': [4, 2],
        }, MOCK_CAPS);
        (0, chai_1.expect)(mat.dashSize).to.equal(4);
        (0, chai_1.expect)(mat.gapSize).to.equal(2);
    });
    it('factory creates line material', () => {
        const mat = (0, index_1.createMBMaterial)('line', { 'line-color': '#123' }, { capabilities: MOCK_CAPS });
        (0, chai_1.expect)(mat).to.be.instanceOf(MapLineMaterial_1.MapLineMaterial);
    });
});
describe('MapCircleMaterial', () => {
    it('creates with defaults', () => {
        const mat = new MapCircleMaterial_1.MapCircleMaterial();
        (0, chai_1.expect)(mat.uniforms.uColor.value.getHexString()).to.equal('000000');
        (0, chai_1.expect)(mat.uniforms.uSize.value).to.equal(10);
    });
    it('applies circle-color and radius', () => {
        const mat = new MapCircleMaterial_1.MapCircleMaterial({
            'circle-color': '#00ff00',
            'circle-radius': 10,
        });
        (0, chai_1.expect)(mat.uniforms.uColor.value.getHexString()).to.equal('00ff00');
        (0, chai_1.expect)(mat.uniforms.uSize.value).to.equal(20);
    });
    it('applies circle-stroke', () => {
        const mat = new MapCircleMaterial_1.MapCircleMaterial({
            'circle-color': '#ff0000',
            'circle-stroke-color': '#ffffff',
            'circle-stroke-width': 2,
        });
        (0, chai_1.expect)(mat.uniforms.uStrokeColor.value.getHexString()).to.equal('ffffff');
        (0, chai_1.expect)(mat.uniforms.uStrokeWidth.value).to.equal(2);
    });
    it('applies circle-blur', () => {
        const mat = new MapCircleMaterial_1.MapCircleMaterial({ 'circle-blur': 0.5 });
        (0, chai_1.expect)(mat.uniforms.uBlur.value).to.equal(0.5);
    });
    it('factory creates circle material', () => {
        const mat = (0, index_1.createMBMaterial)('circle', { 'circle-color': '#456' });
        (0, chai_1.expect)(mat).to.be.instanceOf(MapCircleMaterial_1.MapCircleMaterial);
    });
});
describe('MapExtrusionMaterial', () => {
    it('creates with defaults', () => {
        const mat = new MapExtrusionMaterial_1.MapExtrusionMaterial();
        (0, chai_1.expect)(mat.color.getHexString()).to.equal('000000');
    });
    it('applies extrusion-color and opacity', () => {
        const mat = new MapExtrusionMaterial_1.MapExtrusionMaterial({
            'fill-extrusion-color': '#cccccc',
            'fill-extrusion-opacity': 0.7,
        });
        (0, chai_1.expect)(mat.color.getHexString()).to.equal('cccccc');
        (0, chai_1.expect)(mat.opacity).to.equal(0.7);
    });
    it('factory creates extrusion material', () => {
        const mat = (0, index_1.createMBMaterial)('fill-extrusion', {
            'fill-extrusion-color': '#789',
        });
        (0, chai_1.expect)(mat).to.be.instanceOf(MapExtrusionMaterial_1.MapExtrusionMaterial);
    });
});
describe('createMBMaterial', () => {
    it('creates background as fill material', () => {
        const mat = (0, index_1.createMBMaterial)('background', { 'background-color': '#eeeeee' });
        (0, chai_1.expect)(mat).to.be.instanceOf(MapFillMaterial_1.MapFillMaterial);
        (0, chai_1.expect)(mat.color.getHexString()).to.equal('eeeeee');
    });
    it('creates fallback for unknown type', () => {
        const mat = (0, index_1.createMBMaterial)('nonexistent-type', {});
        (0, chai_1.expect)(mat).to.be.instanceOf(THREE.MeshBasicMaterial);
        (0, chai_1.expect)(mat.color.getHexString()).to.equal('ff00ff');
    });
});
describe('updateMBMaterial', () => {
    it('updates fill material', () => {
        const mat = (0, index_1.createMBMaterial)('fill', { 'fill-color': '#000' });
        (0, index_1.updateMBMaterial)(mat, 'fill', { 'fill-color': '#fff' });
        (0, chai_1.expect)(mat.color.getHexString()).to.equal('ffffff');
    });
    it('updates circle material', () => {
        const mat = (0, index_1.createMBMaterial)('circle', { 'circle-color': '#000' });
        (0, index_1.updateMBMaterial)(mat, 'circle', { 'circle-color': '#ff0' });
        (0, chai_1.expect)(mat.uniforms.uColor.value.getHexString()).to.equal('ffff00');
    });
});
describe('MapHeatmapMaterial', () => {
    it('creates with defaults', () => {
        const mat = new MapHeatmapMaterial_1.MapHeatmapMaterial();
        (0, chai_1.expect)(mat.uniforms.uRadius.value).to.equal(30);
        (0, chai_1.expect)(mat.uniforms.uOpacity.value).to.equal(1);
    });
    it('applies heatmap-radius', () => {
        const mat = new MapHeatmapMaterial_1.MapHeatmapMaterial({ 'heatmap-radius': 50 });
        (0, chai_1.expect)(mat.uniforms.uRadius.value).to.equal(50);
    });
});
describe('MapHillshadeMaterial', () => {
    it('creates with defaults', () => {
        const mat = new MapHillshadeMaterial_1.MapHillshadeMaterial();
        (0, chai_1.expect)(mat.uniforms.uExaggeration.value).to.equal(0.5);
    });
    it('applies hillshade-exaggeration', () => {
        const mat = new MapHillshadeMaterial_1.MapHillshadeMaterial({ 'hillshade-exaggeration': 1 });
        (0, chai_1.expect)(mat.uniforms.uExaggeration.value).to.equal(1);
    });
    it('sets DEM texture', () => {
        const mat = new MapHillshadeMaterial_1.MapHillshadeMaterial();
        const tex = new THREE.DataTexture(new Uint8Array([0]), 1, 1, THREE.RGBAFormat);
        mat.setDemTexture(tex);
        (0, chai_1.expect)(mat.uniforms.uDemTexture.value).to.equal(tex);
    });
});
describe('MapRasterMaterial', () => {
    it('creates with defaults', () => {
        const mat = new MapRasterMaterial_1.MapRasterMaterial();
        (0, chai_1.expect)(mat.opacity).to.equal(1);
        (0, chai_1.expect)(mat.transparent).to.equal(false);
    });
    it('applies raster-opacity', () => {
        const mat = new MapRasterMaterial_1.MapRasterMaterial({ 'raster-opacity': 0.5 });
        (0, chai_1.expect)(mat.opacity).to.equal(0.5);
        (0, chai_1.expect)(mat.transparent).to.equal(true);
    });
    it('stores paint values', () => {
        const mat = new MapRasterMaterial_1.MapRasterMaterial({
            'raster-opacity': 0.8,
            'raster-hue-rotate': 90,
            'raster-brightness-min': 0.2,
            'raster-brightness-max': 0.8,
            'raster-saturation': -0.5,
            'raster-contrast': 0.3,
        });
        const paint = mat.getPaint();
        (0, chai_1.expect)(paint['raster-opacity']).to.equal(0.8);
        (0, chai_1.expect)(paint['raster-hue-rotate']).to.equal(90);
        (0, chai_1.expect)(paint['raster-brightness-min']).to.equal(0.2);
        (0, chai_1.expect)(paint['raster-brightness-max']).to.equal(0.8);
        (0, chai_1.expect)(paint['raster-saturation']).to.equal(-0.5);
        (0, chai_1.expect)(paint['raster-contrast']).to.equal(0.3);
    });
    it('updates paint via setPaint', () => {
        const mat = new MapRasterMaterial_1.MapRasterMaterial();
        mat.setPaint({ 'raster-opacity': 0.3, 'raster-saturation': 0.8 });
        const paint = mat.getPaint();
        (0, chai_1.expect)(paint['raster-opacity']).to.equal(0.3);
        (0, chai_1.expect)(paint['raster-saturation']).to.equal(0.8);
        (0, chai_1.expect)(paint['raster-hue-rotate']).to.equal(0);
    });
    it('accepts and stores a raster texture', () => {
        const mat = new MapRasterMaterial_1.MapRasterMaterial();
        const tex = new THREE.DataTexture(new Uint8Array([255, 0, 0, 255]), 1, 1, THREE.RGBAFormat);
        mat.setRasterTexture(tex);
        (0, chai_1.expect)(mat.map).to.equal(tex);
        mat.setRasterTexture(null);
        (0, chai_1.expect)(mat.map).to.be.undefined;
    });
});
describe('MapTerrainMaterial', () => {
    it('creates without errors', () => {
        const mat = new MapTerrainMaterial_1.MapTerrainMaterial();
        (0, chai_1.expect)(mat).to.be.instanceOf(THREE.MeshStandardMaterial);
    });
    it('setDrapeTexture stores the texture and triggers update', () => {
        const mat = new MapTerrainMaterial_1.MapTerrainMaterial();
        const v0 = mat.version;
        const tex = new THREE.DataTexture(new Uint8Array([128]), 1, 1, THREE.RedFormat);
        mat.setDrapeTexture(tex);
        (0, chai_1.expect)(mat.version).to.be.greaterThan(v0);
    });
    it('setExaggeration triggers material update', () => {
        const mat = new MapTerrainMaterial_1.MapTerrainMaterial();
        const v0 = mat.version;
        mat.setExaggeration(1.5);
        (0, chai_1.expect)(mat.version).to.be.greaterThan(v0);
    });
    it('setDemIsFloat triggers material update', () => {
        const mat = new MapTerrainMaterial_1.MapTerrainMaterial();
        const v0 = mat.version;
        mat.setDemIsFloat(true);
        (0, chai_1.expect)(mat.version).to.be.greaterThan(v0);
    });
    it('setDemLerp does NOT trigger material update (uniform only)', () => {
        const mat = new MapTerrainMaterial_1.MapTerrainMaterial();
        const v0 = mat.version;
        mat.setDemLerp(0.5);
        (0, chai_1.expect)(mat.version).to.equal(v0);
    });
    it('shader uses alpha-blend mix for drape with V-flip', () => {
        const mat = new MapTerrainMaterial_1.MapTerrainMaterial();
        const fakeShader = {
            uniforms: {},
            vertexShader: '#include <common>\n#include <begin_vertex>',
            fragmentShader: '#include <common>\n#include <map_fragment>',
        };
        mat.onBeforeCompile(fakeShader, {});
        (0, chai_1.expect)(fakeShader.fragmentShader).to.contain('USE_DRAPE');
        (0, chai_1.expect)(fakeShader.fragmentShader).to.contain('mix(diffuseColor.rgb, drapeColor.rgb, drapeColor.a)');
        (0, chai_1.expect)(fakeShader.fragmentShader).to.contain('1.0 - vMapUv.y');
        (0, chai_1.expect)(fakeShader.fragmentShader).to.not.contain('diffuseColor *= drapeColor');
        (0, chai_1.expect)(fakeShader.fragmentShader).to.not.contain('texture2D(uDrape, vMapUv)');
    });
});
//# sourceMappingURL=MapMaterialsTest.js.map