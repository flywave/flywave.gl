import * as THREE from 'three';

export class MapTerrainMaterial extends THREE.MeshStandardMaterial {
    private m_demTexture: THREE.Texture | null = null;
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
            shader.uniforms.uExaggeration = { value: self.m_exaggeration };
            shader.uniforms.uDrape = { value: self.m_drapeTexture };

            shader.vertexShader = shader.vertexShader.replace(
                '#include <common>',
                `
                #include <common>
                uniform sampler2D uDem;
                uniform float uExaggeration;
                uniform sampler2D uDrape;
                `
            );

            shader.vertexShader = shader.vertexShader.replace(
                '#include <begin_vertex>',
                `
                vec2 demUv = vec2(uv.x, 1.0 - uv.y);
                vec4 demSample = texture2D(uDem, demUv);
                float elevation = (demSample.r * 256.0 * 256.0 + demSample.g * 256.0 + demSample.b) * 0.1 - 10000.0;
                elevation *= uExaggeration;
                vec3 transformed = vec3(position.x, position.y, elevation);
                `
            );

            shader.fragmentShader = shader.fragmentShader.replace(
                '#include <map_fragment>',
                `
                #include <map_fragment>
                #ifdef USE_DRAPE
                    vec4 drapeColor = texture2D(uDrape, vMapUv);
                    diffuseColor *= drapeColor;
                #endif
                `
            );
        };
    }

    setDemTexture(texture: THREE.Texture | null): void {
        this.m_demTexture = texture;
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
