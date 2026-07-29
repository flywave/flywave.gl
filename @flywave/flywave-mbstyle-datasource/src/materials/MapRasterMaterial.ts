import * as THREE from 'three';

export interface MapRasterMaterialParams {
    'raster-opacity': number;
    'raster-hue-rotate': number;
    'raster-brightness-min': number;
    'raster-brightness-max': number;
    'raster-saturation': number;
    'raster-contrast': number;
    'raster-resampling': 'linear' | 'nearest';
    'raster-fade-duration': number;
}

const DEFAULTS: MapRasterMaterialParams = {
    'raster-opacity': 1,
    'raster-hue-rotate': 0,
    'raster-brightness-min': 0,
    'raster-brightness-max': 1,
    'raster-saturation': 0,
    'raster-contrast': 0,
    'raster-resampling': 'linear',
    'raster-fade-duration': 300,
};

const RASTER_FRAG = `
uniform float uHueRotate;
uniform float uBrightnessMin;
uniform float uBrightnessMax;
uniform float uSaturation;
uniform float uContrast;

vec3 applyHueRotate(vec3 color, float angle) {
    const mat3 toYIQ = mat3(
        0.299, 0.587, 0.114,
        0.596, -0.274, -0.322,
        0.211, -0.523, 0.312
    );
    const mat3 toRGB = mat3(
        1.0, 0.956, 0.621,
        1.0, -0.272, -0.647,
        1.0, -1.106, 1.703
    );
    vec3 yiq = toYIQ * color;
    float h = atan(yiq.z, yiq.y) + angle;
    float r = sqrt(yiq.y * yiq.y + yiq.z * yiq.z);
    yiq = vec3(yiq.x, r * cos(h), r * sin(h));
    return toRGB * yiq;
}

vec3 applySaturation(vec3 color, float sat) {
    float luma = dot(color, vec3(0.299, 0.587, 0.114));
    return mix(vec3(luma), color, 1.0 + sat);
}

vec3 applyContrast(vec3 color, float c) {
    return (color - 0.5) * (1.0 + c) + 0.5;
}

vec3 applyBrightness(vec3 color, float bMin, float bMax) {
    return clamp((color - bMin) / (bMax - bMin + 0.001), 0.0, 1.0);
}
`;

export class MapRasterMaterial extends THREE.MeshBasicMaterial {
    private m_paint: MapRasterMaterialParams;
    private m_rasterTexture: THREE.Texture | null = null;

    constructor(paint: Partial<MapRasterMaterialParams> = {}) {
        super({
            side: THREE.DoubleSide,
            transparent: true,
        });
        this.m_paint = { ...DEFAULTS, ...paint };

        const self = this;
        this.onBeforeCompile = (shader: THREE.WebGLProgramParametersWithUniforms) => {
            shader.uniforms.uHueRotate = { value: self.m_paint['raster-hue-rotate'] * Math.PI / 180 };
            shader.uniforms.uBrightnessMin = { value: self.m_paint['raster-brightness-min'] };
            shader.uniforms.uBrightnessMax = { value: self.m_paint['raster-brightness-max'] };
            shader.uniforms.uSaturation = { value: self.m_paint['raster-saturation'] };
            shader.uniforms.uContrast = { value: self.m_paint['raster-contrast'] };

            shader.fragmentShader = RASTER_FRAG + shader.fragmentShader;

            shader.fragmentShader = shader.fragmentShader.replace(
                '#include <colorspace_fragment>',
                `
                #include <colorspace_fragment>
                vec3 rasterColor = gl_FragColor.rgb;
                rasterColor = applyHueRotate(rasterColor, uHueRotate);
                rasterColor = applySaturation(rasterColor, uSaturation);
                rasterColor = applyContrast(rasterColor, uContrast);
                rasterColor = applyBrightness(rasterColor, uBrightnessMin, uBrightnessMax);
                gl_FragColor = vec4(rasterColor, gl_FragColor.a);
                `
            );
        };

        this.applyPaint();
    }

    setRasterTexture(texture: THREE.Texture | null) {
        this.m_rasterTexture = texture;
        this.map = texture ?? undefined;
        this.needsUpdate = true;
    }

    setPaint(paint: Partial<MapRasterMaterialParams>) {
        Object.assign(this.m_paint, paint);
        this.applyPaint();
    }

    getPaint(): Readonly<MapRasterMaterialParams> {
        return this.m_paint;
    }

    private applyPaint() {
        const p = this.m_paint;
        this.opacity = p['raster-opacity'];
        this.transparent = p['raster-opacity'] < 1;
        this.needsUpdate = true;
    }

    dispose(): void {
        if (this.m_rasterTexture) {
            this.m_rasterTexture.dispose();
            this.m_rasterTexture = null;
        }
        super.dispose();
    }
}
