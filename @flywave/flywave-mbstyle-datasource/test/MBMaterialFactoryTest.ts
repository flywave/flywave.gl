import { expect } from 'chai';
import { MBMaterialFactory } from '../src/MBMaterialFactory';

describe('MBMaterialFactory', () => {
    it('creates background material', () => {
        const mat = MBMaterialFactory.create('background', {
            'background-color': '#f2efea',
            'background-opacity': 1,
        });
        expect(mat.type).to.equal('MeshBasicMaterial');
        expect((mat as any).color.getHexString()).to.equal('f2efea');
        expect(mat.opacity).to.equal(1);
    });

    it('creates fill material', () => {
        const mat = MBMaterialFactory.create('fill', {
            'fill-color': '#a0c8f0',
            'fill-opacity': 0.8,
        });
        expect(mat.type).to.equal('MeshBasicMaterial');
        expect((mat as any).color.getHexString()).to.equal('a0c8f0');
        expect(mat.opacity).to.equal(0.8);
        expect(mat.transparent).to.be.true;
    });

    it('creates line material', () => {
        const caps = { isWebGL2: true, maxTextures: 16, maxVertexTextures: 16, maxTextureSize: 4096, maxVertexUniforms: 1024 };
        const mat = MBMaterialFactory.create('line', {
            'line-color': '#ff0000',
            'line-width': 2,
            'line-opacity': 1,
        }, { rendererCapabilities: caps }) as any;
        expect(mat.type).to.include('RawShaderMaterial');
        expect(mat.color.getHexString()).to.equal('ff0000');
    });

    it('creates circle material', () => {
        const mat = MBMaterialFactory.create('circle', {
            'circle-color': '#00ff00',
            'circle-radius': 10,
            'circle-opacity': 0.5,
        }) as any;
        expect(mat.type).to.equal('ShaderMaterial'); // MapCircleMaterial
        expect(mat.uniforms.uColor.value.getHexString()).to.equal('00ff00');
        expect(mat.uniforms.uOpacity.value).to.equal(0.5);
        expect(mat.uniforms.uSize.value).to.equal(20);
    });

    it('creates extrusion material', () => {
        const mat = MBMaterialFactory.create('fill-extrusion', {
            'fill-extrusion-color': '#ccc',
            'fill-extrusion-opacity': 1,
        });
        expect(mat.type).to.equal('MeshLambertMaterial');
        expect((mat as any).color.getHexString()).to.equal('cccccc');
    });

    it('returns magenta fallback for unknown type', () => {
        const mat = MBMaterialFactory.create('raster' as any, {});
        expect((mat as any).color.getHexString()).to.equal('ff00ff');
    });
});
