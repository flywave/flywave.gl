import * as THREE from 'three';

export interface MapTextMaterialParams {
    'text-field': string;
    'text-font': string[];
    'text-size': number;
    'text-color': string;
    'text-opacity': number;
    'text-halo-color': string;
    'text-halo-width': number;
    'text-halo-blur': number;
    'text-rotate': number;
    'text-offset': [number, number];
    'text-anchor': 'center' | 'left' | 'right' | 'top' | 'bottom' | 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right';
    'text-max-width': number;
    'text-line-height': number;
    'text-letter-spacing': number;
    'text-justify': 'auto' | 'left' | 'center' | 'right';
    'text-transform': 'none' | 'uppercase' | 'lowercase';
    'text-padding': number;
}

const DEFAULTS: MapTextMaterialParams = {
    'text-field': '',
    'text-font': ['Open Sans Regular'],
    'text-size': 16,
    'text-color': '#000000',
    'text-opacity': 1,
    'text-halo-color': '#ffffff',
    'text-halo-width': 1,
    'text-halo-blur': 0,
    'text-rotate': 0,
    'text-offset': [0, 0],
    'text-anchor': 'center',
    'text-max-width': 10,
    'text-line-height': 1.2,
    'text-letter-spacing': 0,
    'text-justify': 'center',
    'text-transform': 'none',
    'text-padding': 2,
};

const SDF_VERT = `
attribute vec2 aUv;
attribute vec4 aGlyphData; // x=charWidth, y=charHeight, z=padding, w=layer
uniform vec2 uAtlasSize;
varying vec2 vUv;
varying float vLayer;

void main() {
    vUv = aUv;
    vLayer = aGlyphData.w;
    vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
    gl_Position = projectionMatrix * mvPosition;
}
`;

const SDF_FRAG = `
uniform sampler2D uGlyphAtlas;
uniform vec3 uColor;
uniform vec3 uHaloColor;
uniform float uHaloWidth;
uniform float uHaloBlur;
uniform float uOpacity;
uniform float uGamma;

varying vec2 vUv;
varying float vLayer;

void main() {
    float dist = texture2D(uGlyphAtlas, vUv).a;

    // SDF antialiasing
    float gamma = uGamma;
    float alpha = smoothstep(0.5 - gamma, 0.5 + gamma, dist);

    // Halo
    float haloAlpha = smoothstep(
        0.5 - uHaloBlur - uHaloWidth,
        0.5 + uHaloBlur - uHaloWidth,
        dist
    );

    vec3 color = mix(uHaloColor, uColor, alpha);
    float finalAlpha = max(alpha, haloAlpha) * uOpacity;
    gl_FragColor = vec4(color, finalAlpha);
}
`;

/**
 * SDF-based text material for Mapbox symbol layer text rendering.
 * Uses signed distance field glyphs from a glyph atlas texture.
 *
 * Reference: mapbox-gl-js SDF text rendering
 */
export class MBSDFTextMaterial extends THREE.RawShaderMaterial {
    private m_paint: MapTextMaterialParams;

    constructor(paint: Partial<MapTextMaterialParams> = {}) {
        const atlasSize = new THREE.Vector2(512, 512);
        const dummyTex = new THREE.DataTexture(new Uint8Array(512 * 512), 512, 512, THREE.AlphaFormat);
        dummyTex.needsUpdate = true;

        super({
            uniforms: {
                uGlyphAtlas: { value: dummyTex },
                uAtlasSize: { value: atlasSize },
                uColor: { value: new THREE.Color('#000000') },
                uHaloColor: { value: new THREE.Color('#ffffff') },
                uHaloWidth: { value: 1.0 },
                uHaloBlur: { value: 0.0 },
                uOpacity: { value: 1.0 },
                uGamma: { value: 0.05 },
            },
            vertexShader: SDF_VERT,
            fragmentShader: SDF_FRAG,
            transparent: true,
            depthWrite: false,
        });

        this.m_paint = { ...DEFAULTS, ...paint };
        this.applyPaint();
    }

    setGlyphAtlas(texture: THREE.Texture, size: [number, number]) {
        this.uniforms.uGlyphAtlas.value = texture;
        this.uniforms.uAtlasSize.value.set(size[0], size[1]);
    }

    setPaint(paint: Partial<MapTextMaterialParams>) {
        Object.assign(this.m_paint, paint);
        this.applyPaint();
    }

    getPaint(): Readonly<MapTextMaterialParams> {
        return this.m_paint;
    }

    private applyPaint() {
        const p = this.m_paint;
        this.uniforms.uColor.value.set(p['text-color']);
        this.uniforms.uHaloColor.value.set(p['text-halo-color']);
        this.uniforms.uHaloWidth.value = p['text-halo-width'] ?? 1;
        this.uniforms.uHaloBlur.value = p['text-halo-blur'] ?? 0;
        this.uniforms.uOpacity.value = p['text-opacity'];
        this.needsUpdate = true;
    }
}
