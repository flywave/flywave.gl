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
uniform float uRadius;
uniform float uDpr;

void main() {
    // mgl circle.fragment.glsl, verbatim. Normalization: extrude is in units
    // of (radius + stroke_width) — gl_PointSize covers the full quad, so
    // extrude_length = 1.0 at the fill+stroke edge and the stroke color_t
    // boundary sits at radius / (radius + stroke_width).
    vec2 extrude = gl_PointCoord * 2.0 - 1.0;
    float blur = uBlur;
    float stroke_width = uStrokeWidth;
    float antialiasblur = 1.0 / uDpr / (uRadius + stroke_width);
    float blur_positive = blur < 0.0 ? 0.0 : 1.0;
    float extrude_length = length(extrude) + antialiasblur * (1.0 - blur_positive);
    float antialiased_blur = -max(abs(blur), antialiasblur);
    float antialiase_blur_opacity = smoothstep(0.0, antialiasblur, extrude_length - 1.0);
    float opacity_t = blur_positive == 1.0 ?
        smoothstep(0.0, -antialiased_blur, 1.0 - extrude_length) :
        smoothstep(antialiased_blur, 0.0, extrude_length - 1.0) - antialiase_blur_opacity;
    float color_t = stroke_width < 0.01 ? 0.0 : smoothstep(
        antialiased_blur,
        0.0,
        extrude_length - uRadius / (uRadius + stroke_width)
    );
    // vAlpha carries circle-opacity (the visibility ring factor is 1 without
    // terrain occlusion in mgl).
    // mgl: mix(color*opacity, stroke*stroke_opacity, t) premultiplied,
    // final = out * opacity_t. Straight-alpha equivalent — the fill opacity
    // does not scale the stroke region (circle-opacity:0 keeps the stroke).
    vec3 rgb = mix(uColor, uStrokeColor, color_t);
    float a = opacity_t * mix(vAlpha, uStrokeOpacity, color_t);
    gl_FragColor = vec4(rgb, a);
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
                uRadius: { value: 5 },
                uDpr: { value: 1 },
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
        const radius = p['circle-radius'] ?? 5;
        const strokeWidth = p['circle-stroke-width'] ?? 0;
        // The point quad covers fill radius + stroke width (mgl extrudes by
        // radius + stroke_width); the fragment shader renormalizes.
        this.uniforms.uSize.value = (radius + strokeWidth) * 2;
        this.uniforms.uRadius.value = radius;
        this.uniforms.uBlur.value = p['circle-blur'] ?? 0;
        this.uniforms.uStrokeWidth.value = strokeWidth;
        this.uniforms.uStrokeOpacity.value = p['circle-stroke-opacity'] ?? 1;
        this.uniforms.uDpr.value = (typeof window !== 'undefined' && window.devicePixelRatio) || 1;

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
