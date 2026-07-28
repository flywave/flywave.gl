import * as THREE from 'three';

export interface MapSDFIconMaterialParams {
    'icon-image': string;
    'icon-size': number;
    'icon-color': string;
    'icon-opacity': number;
    'icon-rotate': number;
    'icon-halo-color': string;
    'icon-halo-width': number;
    'icon-halo-blur': number;
}

const SDF_VERT = `
uniform mat4 modelViewMatrix;
uniform mat4 projectionMatrix;
attribute vec3 position;
varying vec2 vUv;
void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;

const SDF_FRAG = `
uniform sampler2D uAtlas;
uniform vec4 uUvRect; // x=umin, y=vmin, z=umax, w=vmax
uniform vec3 uColor;
uniform float uOpacity;
uniform vec3 uHaloColor;
uniform float uHaloWidth;
uniform float uHaloBlur;
uniform float uGamma;

varying vec2 vUv;

void main() {
    vec2 uv = mix(uUvRect.xy, uUvRect.zw, vUv);
    float dist = texture2D(uAtlas, uv).a;

    // SDF antialiasing
    float gamma = uGamma;
    float alpha = smoothstep(0.5 - gamma, 0.5 + gamma, dist);

    // Halo
    float haloInner = 0.5 - uHaloWidth - uHaloBlur;
    float haloOuter = 0.5 + uHaloWidth + uHaloBlur;
    float haloAlpha = smoothstep(haloInner, 0.5 + uHaloBlur, dist);

    vec3 color = mix(uHaloColor, uColor, alpha);
    float finalAlpha = max(alpha, haloAlpha * (1.0 - alpha)) * uOpacity;
    gl_FragColor = vec4(color, finalAlpha);
}
`;

export class MapSDFIconMaterial extends THREE.RawShaderMaterial {
    private m_params: MapSDFIconMaterialParams;

    constructor(params: Partial<MapSDFIconMaterialParams> = {}) {
        const defaultTex = new THREE.DataTexture(new Uint8Array([255]), 1, 1, THREE.AlphaFormat);
        defaultTex.needsUpdate = true;

        super({
            uniforms: {
                uAtlas: { value: defaultTex },
                uUvRect: { value: new THREE.Vector4(0, 0, 1, 1) },
                uColor: { value: new THREE.Color('#ffffff') },
                uOpacity: { value: 1.0 },
                uHaloColor: { value: new THREE.Color('rgba(0,0,0,0)') },
                uHaloWidth: { value: 0.0 },
                uHaloBlur: { value: 0.0 },
                uGamma: { value: 0.05 },
            },
            vertexShader: SDF_VERT,
            fragmentShader: SDF_FRAG,
            transparent: true,
            depthWrite: false,
        });

        this.m_params = {
            'icon-image': '',
            'icon-size': 1,
            'icon-color': '#ffffff',
            'icon-opacity': 1,
            'icon-rotate': 0,
            'icon-halo-color': 'rgba(0,0,0,0)',
            'icon-halo-width': 0,
            'icon-halo-blur': 0,
            ...params,
        };
        this.applyParams();
    }

    setSpriteAtlas(atlas: any, iconName: string) {
        if (!atlas) return;
        const uv = atlas.getIconUv?.(iconName);
        if (uv) {
            this.uniforms.uUvRect.value.set(uv.uvMin[0], uv.uvMin[1], uv.uvMax[0], uv.uvMax[1]);
        }
        this.uniforms.uAtlas.value = atlas.texture;
    }

    private applyParams() {
        const p = this.m_params;
        this.uniforms.uColor.value.set(p['icon-color']);
        this.uniforms.uOpacity.value = p['icon-opacity'];
        this.uniforms.uHaloColor.value.set(p['icon-halo-color'] ?? 'rgba(0,0,0,0)');
        this.uniforms.uHaloWidth.value = p['icon-halo-width'] ?? 0;
        this.uniforms.uHaloBlur.value = p['icon-halo-blur'] ?? 0;
        this.needsUpdate = true;
    }
}
