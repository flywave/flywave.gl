import * as THREE from 'three';

export interface MapHeatmapMaterialParams {
    'heatmap-radius': number;
    'heatmap-opacity': number;
    'heatmap-intensity': number;
    'heatmap-weight': number;
    'heatmap-color': Array<[number, string]>;
}

const DEFAULTS: MapHeatmapMaterialParams = {
    'heatmap-radius': 30,
    'heatmap-opacity': 1,
    'heatmap-intensity': 1,
    'heatmap-weight': 1,
    'heatmap-color': [[0, 'rgba(0,0,255,0)'], [0.5, 'blue'], [1, 'red']],
};

const HEATMAP_VERT = `
uniform float uRadius;
uniform float uIntensity;
uniform float uWeight;

varying float vWeight;

void main() {
    #include <begin_vertex>
    #include <project_vertex>
    gl_PointSize = uRadius * (300.0 / -mvPosition.z);
    vWeight = uWeight;
}
`;

const HEATMAP_FRAG = `
uniform sampler2D uColorRamp;
uniform float uOpacity;
uniform float uRadius;

varying float vWeight;

void main() {
    float dist = length(gl_PointCoord - vec2(0.5)) * 2.0;
    if (dist > 1.0) discard;

    // Gaussian falloff
    float intensity = exp(-dist * dist * 4.0) * vWeight;

    // Sample color ramp
    vec4 color = texture2D(uColorRamp, vec2(intensity, 0.5));
    gl_FragColor = vec4(color.rgb, color.a * uOpacity);
}
`;

export class MapHeatmapMaterial extends THREE.ShaderMaterial {
    private m_paint: MapHeatmapMaterialParams;

    constructor(paint: Partial<MapHeatmapMaterialParams> = {}) {
        const rampSize = 256;
        const rampData = new Uint8Array(rampSize * 4);
        const rampTexture = new THREE.DataTexture(rampData, rampSize, 1, THREE.RGBAFormat);
        rampTexture.needsUpdate = true;
        rampTexture.wrapS = THREE.ClampToEdgeWrapping;
        rampTexture.wrapT = THREE.ClampToEdgeWrapping;
        rampTexture.minFilter = THREE.LinearFilter;
        rampTexture.magFilter = THREE.LinearFilter;

        super({
            transparent: true,
            blending: THREE.AdditiveBlending,
            depthWrite: false,
            depthTest: true,
            vertexShader: HEATMAP_VERT,
            fragmentShader: HEATMAP_FRAG,
            uniforms: {
                uRadius: { value: 30 },
                uOpacity: { value: 1 },
                uIntensity: { value: 1 },
                uWeight: { value: 1 },
                uColorRamp: { value: rampTexture },
            },
        });

        this.m_paint = { ...DEFAULTS, ...paint };
        this.applyPaint();
    }

    setPaint(paint: Partial<MapHeatmapMaterialParams>) {
        Object.assign(this.m_paint, paint);
        this.applyPaint();
    }

    getPaint(): Readonly<MapHeatmapMaterialParams> {
        return this.m_paint;
    }

    private applyPaint() {
        const p = this.m_paint;
        this.uniforms.uRadius.value = p['heatmap-radius'] ?? 30;
        this.uniforms.uOpacity.value = p['heatmap-opacity'] ?? 1;
        this.uniforms.uIntensity.value = p['heatmap-intensity'] ?? 1;
        this.uniforms.uWeight.value = p['heatmap-weight'] ?? 1;

        const stops = p['heatmap-color'];
        if (stops && stops.length >= 2) {
            this.buildColorRamp(stops);
        }
    }

    private buildColorRamp(stops: Array<[number, string]>) {
        const texture = this.uniforms.uColorRamp.value as THREE.DataTexture;
        const size = texture.image.width;
        const data = texture.image.data as Uint8Array;
        const color = new THREE.Color();

        for (let i = 0; i < size; i++) {
            const t = i / (size - 1);
            for (let j = 0; j < stops.length - 1; j++) {
                const [s0, c0] = stops[j];
                const [s1, c1] = stops[j + 1];
                if (t >= s0 && t <= s1) {
                    const lt = (t - s0) / (s1 - s0);
                    color.set(c0).lerp(new THREE.Color(c1), lt);
                    const idx = i * 4;
                    data[idx] = Math.round(color.r * 255);
                    data[idx + 1] = Math.round(color.g * 255);
                    data[idx + 2] = Math.round(color.b * 255);
                    data[idx + 3] = 255;
                    break;
                }
            }
        }
        texture.needsUpdate = true;
    }

    dispose(): void {
        const tex = this.uniforms.uColorRamp.value as THREE.DataTexture;
        if (tex) tex.dispose();
        super.dispose();
    }
}
