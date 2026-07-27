import * as THREE from 'three';

/**
 * Hillshade rendering based on digital elevation model (DEM) data.
 * Computes surface normals from elevation and applies directional lighting.
 *
 * Reference: mapbox-gl-js hillshade implementation
 */
export interface MapHillshadeMaterialParams {
    'hillshade-illumination-direction': number;
    'hillshade-illumination-anchor': 'map' | 'viewport';
    'hillshade-exaggeration': number;
    'hillshade-highlight-color': string;
    'hillshade-shadow-color': string;
    'hillshade-accent-color': string;
}

const DEFAULTS: MapHillshadeMaterialParams = {
    'hillshade-illumination-direction': 335,
    'hillshade-illumination-anchor': 'viewport',
    'hillshade-exaggeration': 0.5,
    'hillshade-highlight-color': '#FFFFFF',
    'hillshade-shadow-color': '#000000',
    'hillshade-accent-color': '#000000',
};

const HILLSHADE_VERT = `
uniform mat4 uDemMatrix;
varying vec2 vDemUv;

void main() {
    #include <begin_vertex>
    #include <project_vertex>
    vDemUv = (uDemMatrix * vec4(position.xy, 0.0, 1.0)).xy;
}
`;

const HILLSHADE_FRAG = `
uniform sampler2D uDemTexture;
uniform float uExaggeration;
uniform float uIlluminationDirection;
uniform vec3 uHighlightColor;
uniform vec3 uShadowColor;
uniform vec3 uAccentColor;
uniform float uOpacity;
uniform vec2 uDemSize;

varying vec2 vDemUv;

void main() {
    vec2 px = 1.0 / uDemSize;

    // Sample elevation at 4 neighbors
    float e  = texture2D(uDemTexture, vDemUv).r;
    float eN = texture2D(uDemTexture, vDemUv + vec2(0.0, px.y)).r;
    float eS = texture2D(uDemTexture, vDemUv - vec2(0.0, px.y)).r;
    float eE = texture2D(uDemTexture, vDemUv + vec2(px.x, 0.0)).r;
    float eW = texture2D(uDemTexture, vDemUv - vec2(px.x, 0.0)).r;

    // Compute gradient
    float dzdx = (eE - eW) * 0.5 * uExaggeration;
    float dzdy = (eN - eS) * 0.5 * uExaggeration;

    // Surface normal
    vec3 normal = normalize(vec3(-dzdx, -dzdy, 1.0));

    // Light direction (from illumination-direction angle)
    float angleRad = radians(uIlluminationDirection);
    vec3 lightDir = normalize(vec3(cos(angleRad), sin(angleRad), 1.0));

    // Diffuse lighting
    float NdotL = max(dot(normal, lightDir), 0.0);
    vec3 color = mix(uShadowColor, uHighlightColor, NdotL);

    // Add accent
    float accent = abs(dzdx) + abs(dzdy);
    color = mix(color, uAccentColor, accent * 0.3);

    gl_FragColor = vec4(color, uOpacity);
}
`;

export class MapHillshadeMaterial extends THREE.ShaderMaterial {
    private m_paint: MapHillshadeMaterialParams;
    private m_demTexture: THREE.Texture | null = null;

    constructor(paint: Partial<MapHillshadeMaterialParams> = {}) {
        super({
            transparent: true,
            side: THREE.DoubleSide,
            depthWrite: false,
            vertexShader: HILLSHADE_VERT,
            fragmentShader: HILLSHADE_FRAG,
            uniforms: {
                uDemTexture: { value: null },
                uDemSize: { value: new THREE.Vector2(256, 256) },
                uExaggeration: { value: 0.5 },
                uIlluminationDirection: { value: 335.0 },
                uHighlightColor: { value: new THREE.Color('#FFFFFF') },
                uShadowColor: { value: new THREE.Color('#000000') },
                uAccentColor: { value: new THREE.Color('#000000') },
                uOpacity: { value: 1.0 },
                uDemMatrix: { value: new THREE.Matrix4() },
            },
        });
        this.m_paint = { ...DEFAULTS, ...paint };
        this.applyPaint();
    }

    setDemTexture(texture: THREE.Texture | null) {
        this.m_demTexture = texture;
        this.uniforms.uDemTexture.value = texture;
        if (texture?.image) {
            this.uniforms.uDemSize.value.set(
                texture.image.width,
                texture.image.height,
            );
        }
    }

    setDemMatrix(matrix: THREE.Matrix4) {
        this.uniforms.uDemMatrix.value.copy(matrix);
    }

    setPaint(paint: Partial<MapHillshadeMaterialParams>) {
        Object.assign(this.m_paint, paint);
        this.applyPaint();
    }

    getPaint(): Readonly<MapHillshadeMaterialParams> {
        return this.m_paint;
    }

    private applyPaint() {
        const p = this.m_paint;
        this.uniforms.uExaggeration.value = p['hillshade-exaggeration'] ?? 0.5;
        this.uniforms.uIlluminationDirection.value = p['hillshade-illumination-direction'] ?? 335;
        this.uniforms.uOpacity.value = 1.0;

        this.uniforms.uHighlightColor.value.set(p['hillshade-highlight-color'] ?? '#FFFFFF');
        this.uniforms.uShadowColor.value.set(p['hillshade-shadow-color'] ?? '#000000');
        this.uniforms.uAccentColor.value.set(p['hillshade-accent-color'] ?? '#000000');
    }

    dispose(): void {
        super.dispose();
    }
}
