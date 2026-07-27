import * as THREE from 'three';

export interface MapLineMaterialParams {
    'line-color': string;
    'line-opacity': number;
    'line-width': number;
    'line-gap-width'?: number;
    'line-offset'?: number;
    'line-blur'?: number;
    'line-dasharray'?: number[];
    'line-cap'?: 'butt' | 'round' | 'square';
    'line-join'?: 'bevel' | 'round' | 'miter' | 'none';
    'line-gradient'?: Array<[number, string]>;
    'line-pattern'?: string;
    'line-translate'?: [number, number];
    'line-miter-limit'?: number;
    'line-round-limit'?: number;
}

const DEFAULTS: MapLineMaterialParams = {
    'line-color': '#000000',
    'line-opacity': 1,
    'line-width': 1,
};

const DASH_VERT = `
attribute float aLineDistance;
uniform float uDashSize;
uniform float uGapSize;
uniform float uLineLength;
varying float vLinePos;
void main() {
    #include <begin_vertex>
    #include <project_vertex>
    vLinePos = aLineDistance / uLineLength;
}
`;

const DASH_FRAG = `
uniform float uDashSize;
uniform float uGapSize;
uniform vec3 uDiffuse;
uniform float uOpacity;
uniform float uBlur;
varying float vLinePos;
void main() {
    float total = uDashSize + uGapSize;
    float pos = mod(vLinePos * 100.0, total);
    float dash = smoothstep(0.0, uDashSize, pos);
    float gap = smoothstep(uDashSize, total, pos);
    float alpha = min(dash, 1.0 - gap) * uOpacity;
    gl_FragColor = vec4(uDiffuse, alpha);
}
`;

export class MapLineMaterial extends THREE.LineBasicMaterial {
    private m_paint: MapLineMaterialParams;

    // Dashed line uniforms
    private m_dashSize = 0;
    private m_gapSize = 0;

    constructor(paint: Partial<MapLineMaterialParams> = {}) {
        super({ color: '#000000' });
        this.m_paint = { ...DEFAULTS, ...paint };
        this.applyPaint();
    }

    setPaint(paint: Partial<MapLineMaterialParams>) {
        Object.assign(this.m_paint, paint);
        this.applyPaint();
    }

    getPaint(): Readonly<MapLineMaterialParams> {
        return this.m_paint;
    }

    get dashSize(): number {
        return this.m_dashSize;
    }

    get gapSize(): number {
        return this.m_gapSize;
    }

    get isDashed(): boolean {
        return this.m_dashSize > 0 && this.m_gapSize > 0;
    }

    private applyPaint() {
        const p = this.m_paint;
        this.color.set(p['line-color']);
        this.opacity = p['line-opacity'];
        this.transparent = p['line-opacity'] < 1;

        if (p['line-dasharray'] && p['line-dasharray'].length >= 2) {
            this.m_dashSize = p['line-dasharray'][0];
            this.m_gapSize = p['line-dasharray'][1];
        } else {
            this.m_dashSize = 0;
            this.m_gapSize = 0;
        }

        this.needsUpdate = true;
    }

    dispose(): void {
        super.dispose();
    }
}
