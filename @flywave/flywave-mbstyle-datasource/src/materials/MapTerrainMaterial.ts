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
            // No vertexColors: the grid geometry carries no color attribute,
            // so a missing attribute would default vColor to black and void
            // the material/setBaseColor color entirely (terrain rendered
            // black whenever no drape texture covered it).
            side: THREE.DoubleSide,
            roughness: 0.9,
            metalness: 0.0,
        });

        const self = this;
        // MeshStandardMaterial has no `defines` map (ShaderMaterial-only), so
        // the drape path is enabled by prepending the define here — with a
        // distinct program cache key so draped/undraped variants coexist.
        this.customProgramCacheKey = () => (self.m_drapeTexture ? 'mbDrape' : 'mbNoDrape');
        if ((globalThis as any).__mbOccDbg) {
            const origCompile = this.onBeforeCompile?.bind(this);
            // eslint-disable-next-line no-console
            console.log('[MBMat] terrain material created');
            this.onBeforeCompile = (shader: any, rs: any) => {
                // eslint-disable-next-line no-console
                console.log('[MBMat] compile drape=' + !!self.m_drapeTexture);
                if (origCompile) origCompile(shader, rs);
            };
        }
        this.onBeforeCompile = (shader: THREE.WebGLProgramParametersWithUniforms) => {
            // §503 terrain-side UV visualizer (uvtdbg=1): paint vMapUv as
            // R=u, G=v on the terrain — one capture reads the orientation.
            const uvtdbg = !!(globalThis as any).__mbUvTerrainDbg;
            if (self.m_drapeTexture) {
                // §502 ROOT CAUSE of the white-drape lottery: the define was
                // prepended to the FRAGMENT only, so the vertex shader's
                // `#ifdef USE_DRAPE` blocks (vMapUv declaration + assignment)
                // never activated — the fragment read an UNWRITTEN varying
                // (undefined garbage per run/driver → the m255/m17/m135
                // sampling lottery and white drapes). GL tolerates the
                // unwritten varying at link time, which is why this rendered
                // *something* for weeks instead of failing loudly.
                shader.vertexShader = '#define USE_DRAPE\n' + shader.vertexShader;
                shader.fragmentShader = '#define USE_DRAPE\n'
                    + 'uniform sampler2D uDrape;\nvarying vec2 vMapUv;\n'
                    + shader.fragmentShader;
            }
            shader.uniforms.uDem = { value: self.m_demTexture };
            shader.uniforms.uDemPrev = { value: self.m_demPrevTexture };
            shader.uniforms.uDemLerp = { value: self.m_demLerp };
            shader.uniforms.uDemIsFloat = { value: self.m_demIsFloat ? 1.0 : 0.0 };
            shader.uniforms.uExaggeration = { value: self.m_exaggeration };
            // mgl mercator z scale (§165): z_world = h·sec(lat) — one meter
            // maps to sec(lat) equatorial-mercator world units. Lat comes from
            // the mesh world position (mercator y) so each terrain tile uses
            // its own latitude.
            shader.uniforms.uMBZSecLat = { value: self.m_zSecLat };
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
                uniform float uMBZSecLat;
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
                #ifdef USE_DRAPE
                varying vec2 vMapUv;
                #endif
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
                elevation *= uExaggeration * uMBZSecLat;
                vec3 transformed = vec3(position.x, position.y, elevation);
                #ifdef USE_DRAPE
                vMapUv = uv;
                #endif
                `
            );

            if (uvtdbg) {
                shader.fragmentShader = '#define USE_DRAPE\n' + shader.fragmentShader;
                shader.vertexShader = '#define USE_DRAPE\n' + shader.vertexShader;
            }
            shader.fragmentShader = shader.fragmentShader.replace(
                '#include <map_fragment>',
                `
                #include <map_fragment>
                #ifdef USE_DRAPE
                    ${uvtdbg ? 'diffuseColor.rgb = vec4(vMapUv.x, vMapUv.y, 0.5);' : ''}
                    // Flip V: terrain mesh UV V=0 is at the far edge (originY+size)
                    // but the FBO texture V=0 is at the near edge (originY), so a
                    // 1.0 - v.y flip is needed to align drape content with the
                    // underlying world position. Same convention as the DEM
                    // sampling above (which also does 1.0 - uv.y).
                    vec4 drapeColor = texture2D(uDrape, vec2(vMapUv.x, 1.0 - vMapUv.y));
                    diffuseColor.rgb = mix(diffuseColor.rgb, drapeColor.rgb, drapeColor.a);
                    vec4 mbDrapeSamp = drapeColor;
                #endif
                `
            );

            shader.fragmentShader = shader.fragmentShader.replace(
                '#include <opaque_fragment>',
                `
                #include <opaque_fragment>
                #ifdef USE_DRAPE
                    // mgl semantics (§499): the drape FBO carries the painted
                    // raster/vector colors UNLIT — PBR/scene lighting must not
                    // multiply the draped part (it darkened the satellite to
                    // ~0.65×; expected shows the pale source colors). Lighting
                    // keeps applying to the terrain's own base color only.
                    gl_FragColor.rgb = mix(gl_FragColor.rgb, mbDrapeSamp.rgb, mbDrapeSamp.a);
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
        // §502: the bake RT is 512² NPOT-safe, but the DRAPE RT is sampled
        // by this material inside a SECOND render pass on SwiftShader —
        // mipmap-filtered NPOT/sRGB RT textures have shown black-opaque
        // sampling there (the isolated mesh rendered all-black). Force
        // completion-safe sampling: no mipmaps, linear, clamp.
        if (texture) {
            texture.minFilter = THREE.LinearFilter;
            texture.magFilter = THREE.LinearFilter;
            texture.generateMipmaps = false;
            texture.wrapS = THREE.ClampToEdgeWrapping;
            texture.wrapT = THREE.ClampToEdgeWrapping;
            texture.needsUpdate = true;
        }
        this.needsUpdate = true;
    }

    setExaggeration(exaggeration: number): void {
        this.m_exaggeration = exaggeration;
        this.needsUpdate = true;
    }

    private m_zSecLat = 1;
    /** Mercator z scale factor sec(lat) for the tile's latitude. */
    setZSecLat(secLat: number): void {
        this.m_zSecLat = secLat > 0.2 && Number.isFinite(secLat) ? secLat : 1;
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
    // z-up world: plane in XY, elevation displaces along z in the shader.
    const geom = new THREE.PlaneGeometry(width, height, segments, segments);
    return geom;
}
