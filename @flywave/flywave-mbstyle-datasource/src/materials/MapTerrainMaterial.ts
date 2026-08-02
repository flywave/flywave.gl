import * as THREE from 'three';

export class MapTerrainMaterial extends THREE.MeshStandardMaterial {
    private m_demTexture: THREE.Texture | null = null;
    private m_demPrevTexture: THREE.Texture | null = null;
    private m_demLerp: number = 1.0;
    /** When true, the DEM texture's .r channel already holds height in meters
     *  (R32F DataTexture from decodeDemImage). When false, it's RGB-encoded. */
    private m_demIsFloat: boolean = false;
    private m_exaggeration: number = 1.0;
    private m_drapeTexture: THREE.Texture | null = null;

    constructor() {
        super({
            vertexColors: true,
            side: THREE.DoubleSide,
            roughness: 0.9,
            metalness: 0.0,
        });

        const self = this;
        this.onBeforeCompile = (shader: THREE.WebGLProgramParametersWithUniforms) => {
            shader.uniforms.uDem = { value: self.m_demTexture };
            shader.uniforms.uDemPrev = { value: self.m_demPrevTexture };
            shader.uniforms.uDemLerp = { value: self.m_demLerp };
            shader.uniforms.uDemIsFloat = { value: self.m_demIsFloat ? 1.0 : 0.0 };
            shader.uniforms.uExaggeration = { value: self.m_exaggeration };
            shader.uniforms.uDrape = { value: self.m_drapeTexture };

            shader.vertexShader = shader.vertexShader.replace(
                '#include <common>',
                `
                #include <common>
                uniform sampler2D uDem;
                uniform sampler2D uDemPrev;
                uniform float uDemLerp;
                uniform float uDemIsFloat;
                uniform float uExaggeration;
                uniform sampler2D uDrape;

                float mbSampleElevation(sampler2D dem, vec2 uv) {
                    vec4 s = texture2D(dem, uv);
                    if (uDemIsFloat > 0.5) {
                        // R32F: red channel already holds height in meters.
                        return s.r;
                    }
                    // RGB-encoded Mapbox terrain-rgb.
                    return (s.r * 65536.0 + s.g * 256.0 + s.b) * 0.1 - 10000.0;
                }
                `
            );

            shader.vertexShader = shader.vertexShader.replace(
                '#include <begin_vertex>',
                `
                vec2 demUv = vec2(uv.x, 1.0 - uv.y);
                float elevation = mbSampleElevation(uDem, demUv);
                // Vertex morphing: blend from previous DEM toward current over
                // uDemLerp [0,1] (1 = fully current). Avoids popping on tile change.
                if (uDemLerp < 1.0) {
                    float prevElev = mbSampleElevation(uDemPrev, demUv);
                    elevation = mix(prevElev, elevation, uDemLerp);
                }
                elevation *= uExaggeration;
                vec3 transformed = vec3(position.x, position.y, elevation);
                `
            );

            shader.fragmentShader = shader.fragmentShader.replace(
                '#include <map_fragment>',
                `
                #include <map_fragment>
                #ifdef USE_DRAPE
                    // Flip V: terrain mesh UV V=0 is at the far edge (originY+size)
                    // but the FBO texture V=0 is at the near edge (originY), so a
                    // 1.0 - v.y flip is needed to align drape content with the
                    // underlying world position. Same convention as the DEM
                    // sampling above (which also does 1.0 - uv.y).
                    vec4 drapeColor = texture2D(uDrape, vec2(vMapUv.x, 1.0 - vMapUv.y));
                    diffuseColor.rgb = mix(diffuseColor.rgb, drapeColor.rgb, drapeColor.a);
                #endif
                `
            );
        };
    }

    setDemTexture(texture: THREE.Texture | null): void {
        this.m_demTexture = texture;
        this.needsUpdate = true;
    }

    /** Previous-frame DEM texture for morphing transitions. */
    setDemPrevTexture(texture: THREE.Texture | null): void {
        this.m_demPrevTexture = texture;
        this.needsUpdate = true;
    }

    /** Morph progress [0,1]; 1 = fully current (no morphing). */
    setDemLerp(lerp: number): void {
        this.m_demLerp = lerp;
    }

    /** Set true when the DEM texture is an R32F DataTexture (pre-decoded heights). */
    setDemIsFloat(isFloat: boolean): void {
        this.m_demIsFloat = isFloat;
        this.needsUpdate = true;
    }

    setDrapeTexture(texture: THREE.Texture | null): void {
        this.m_drapeTexture = texture;
        this.needsUpdate = true;
    }

    setExaggeration(exaggeration: number): void {
        this.m_exaggeration = exaggeration;
        this.needsUpdate = true;
    }

    dispose(): void {
        if (this.m_demTexture) this.m_demTexture.dispose();
        super.dispose();
    }
}

export function decodeTerrainElevation(r: number, g: number, b: number): number {
    return (r * 256 * 256 + g * 256 + b) * 0.1 - 10000;
}

export function createTerrainGrid(
    width: number = 1,
    height: number = 1,
    segments: number = 128,
): THREE.BufferGeometry {
    const geom = new THREE.PlaneGeometry(width, height, segments, segments);
    geom.rotateX(-Math.PI / 2);
    return geom;
}
