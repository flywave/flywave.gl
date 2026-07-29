import * as THREE from 'three';

export interface MapCircleMaterialParams {
    'circle-color': string;
    'circle-radius': number;
    'circle-opacity': number;
    'circle-blur'?: number;
    'circle-stroke-width'?: number;
    'circle-stroke-color'?: string;
    'circle-stroke-opacity'?: number;
    'circle-pitch-scale'?: 'map' | 'viewport';
    'circle-translate'?: [number, number];
}

const DEFAULTS: MapCircleMaterialParams = {
    'circle-color': '#000000',
    'circle-radius': 5,
    'circle-opacity': 1,
};

const CIRCLE_VERTEX = `
uniform float uSize;
uniform float uBlur;
uniform vec3 uColor;
uniform float uOpacity;
uniform vec3 uStrokeColor;
uniform float uStrokeWidth;
uniform float uStrokeOpacity;
uniform float uPitchAlignment;
uniform vec3 uTranslate;
uniform float uSizeAttenuation;
uniform float uPitch;

varying float vAlpha;

void main() {
    vec3 pos = position + uTranslate;
    vec4 mvPosition = modelViewMatrix * vec4(pos, 1.0);

    float size = uSize;
    if (uSizeAttenuation > 0.5) {
        size = uSize * (300.0 / -mvPosition.z);
    }
    if (uPitchAlignment > 0.5 && uPitch > 0.0) {
        size /= max(cos(uPitch), 0.3);
    }

    gl_PointSize = size;
    gl_Position = projectionMatrix * mvPosition;
    vAlpha = uOpacity;
}
`;

const CIRCLE_FRAGMENT = `
varying float vAlpha;
uniform float uBlur;
uniform vec3 uColor;
uniform vec3 uStrokeColor;
uniform float uStrokeWidth;
uniform float uStrokeOpacity;

void main() {
    float dist = length(gl_PointCoord - vec2(0.5)) * 2.0;
    float alpha = vAlpha;

    // blur
    if (uBlur > 0.0) {
        float blurEdge = 1.0 - uBlur;
        alpha *= 1.0 - smoothstep(blurEdge, 1.0, dist);
    } else {
        float falloff = fwidth(dist);
        alpha *= 1.0 - smoothstep(1.0 - falloff, 1.0, dist);
    }

    // stroke
    if (uStrokeWidth > 0.0) {
        float innerR = 1.0 - uStrokeWidth * 2.0;
        float strokeAlpha = 1.0 - smoothstep(innerR - 0.02, innerR, dist);
        strokeAlpha *= uStrokeOpacity;
        vec3 stroke = mix(uColor, uStrokeColor, strokeAlpha);
        gl_FragColor = vec4(stroke, max(alpha, strokeAlpha));
    } else {
        gl_FragColor = vec4(uColor, alpha);
    }
}
`;

export class MapCircleMaterial extends THREE.ShaderMaterial {
    private m_paint: MapCircleMaterialParams;

    constructor(paint: Partial<MapCircleMaterialParams> = {}) {
        super({
            transparent: true,
            depthWrite: false,
            blending: THREE.NormalBlending,
            vertexShader: CIRCLE_VERTEX,
            fragmentShader: CIRCLE_FRAGMENT,
            uniforms: {
                uSize: { value: 10 },
                uBlur: { value: 0 },
                uColor: { value: new THREE.Color('#000000') },
                uOpacity: { value: 1 },
                uStrokeColor: { value: new THREE.Color('#000000') },
                uStrokeWidth: { value: 0 },
                uStrokeOpacity: { value: 1 },
                uTranslate: { value: new THREE.Vector3(0, 0, 0) },
                uPitchAlignment: { value: 0 },
                uSizeAttenuation: { value: 1 },
                uPitch: { value: 0 },
            },
        });
        this.m_paint = { ...DEFAULTS, ...paint };
        this.applyPaint();
    }

    setPaint(paint: Partial<MapCircleMaterialParams>) {
        Object.assign(this.m_paint, paint);
        this.applyPaint();
    }

    getPaint(): Readonly<MapCircleMaterialParams> {
        return this.m_paint;
    }

    private applyPaint() {
        const p = this.m_paint;
        this.uniforms.uColor.value.set(p['circle-color']);
        this.uniforms.uOpacity.value = p['circle-opacity'];
        this.uniforms.uSize.value = (p['circle-radius'] ?? 5) * 2;
        this.uniforms.uBlur.value = p['circle-blur'] ?? 0;
        this.uniforms.uStrokeWidth.value = p['circle-stroke-width'] ?? 0;
        this.uniforms.uStrokeOpacity.value = p['circle-stroke-opacity'] ?? 1;

        if (p['circle-stroke-color']) {
            this.uniforms.uStrokeColor.value.set(p['circle-stroke-color']);
        }

        const translate = p['circle-translate'] as [number, number] | undefined;
        if (translate) {
            this.uniforms.uTranslate.value.set(translate[0], translate[1], 0);
        }

        const pitchAlignment = p['circle-pitch-alignment'] ?? 'viewport';
        this.uniforms.uPitchAlignment.value = pitchAlignment === 'map' ? 1 : 0;

        const pitchScale = p['circle-pitch-scale'] ?? 'viewport';
        this.uniforms.uSizeAttenuation.value = pitchScale === 'map' ? 1 : 0;
    }
}
