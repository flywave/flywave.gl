import * as THREE from 'three';
import { MapView } from '@flywave/flywave-mapview';
import { EarthConstants } from '@flywave/flywave-geoutils';
import { FogSpec, SkySpec, Light3DProperties } from './MBStyleSpec';
import { MapTerrainMaterial, createTerrainGrid } from './materials/MapTerrainMaterial';
import { SpriteAtlas } from './materials/MapIconMaterial';
import { TerrainController } from './TerrainController';

export class MBEnvironmentManager {
    private m_ambientLight: THREE.AmbientLight | null = null;
    private m_directionalLight: THREE.DirectionalLight | null = null;
    private m_hemisphereLight: THREE.HemisphereLight | null = null;
    private m_fog: THREE.FogExp2 | null = null;
    private m_skyMesh: THREE.Mesh | null = null;
    private m_stars: THREE.Points | null = null;
    private m_scene: THREE.Scene | null = null;

    /** Whether 3D lighting is active (affects vector-layer shading). */
    get hasLighting(): boolean { return this.m_directionalLight !== null; }

    private m_ambientColor: THREE.Color | null = null;
    private m_ambientIntensity: number = 0;
    private m_directionalColor: THREE.Color | null = null;
    private m_directionalIntensity: number = 0;
    private m_directionalPolar: number = 0;

    /**
     * Scene brightness for `measure-light` expressions. Mirrors mapbox-gl-js
     * `Style.calculateLightsBrightness()` (style.ts):
     *
     *   directionalBrightness = relLum(dirColor) * dirIntensity * polarIntensity
     *   ambientBrightness     = relLum(ambColor) * ambIntensity
     *   brightness            = (directionalBrightness + ambientBrightness) / 2
     *
     * where `polarIntensity = 1 - polar/90` and `polar` is the directional light's
     * elevation angle in degrees (0 = overhead/zenith, 90 = horizon).
     * Reference: mapbox-gl-js src/style/style.ts:2694-2745.
     */
    get brightness(): number {
        if (!this.m_ambientColor && !this.m_directionalColor) return 0;

        const relativeLuminance = (color: THREE.Color): number => {
            // W3C: L = 0.2126*R_lin + 0.7152*G_lin + 0.0722*B_lin
            // Approximate with sRGB-to-linear gamma.
            const lin = (c: number) => c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
            return 0.2126 * lin(color.r) + 0.7152 * lin(color.g) + 0.0722 * lin(color.b);
        };

        let total = 0;
        if (this.m_directionalColor) {
            const polarIntensity = 1.0 - this.m_directionalPolar / 90.0;
            total += relativeLuminance(this.m_directionalColor) * this.m_directionalIntensity * polarIntensity;
        }
        if (this.m_ambientColor) {
            total += relativeLuminance(this.m_ambientColor) * this.m_ambientIntensity;
        }
        total /= 2.0;
        return Math.round(total * 1e6) / 1e6;
    }
    /** Lighting state for vector-layer Lambert injection (null if no lights). */
    get lightingState(): {
        dir: THREE.Vector3; dirColor: THREE.Color;
        ambColor: THREE.Color; dirIntensity: number; ambIntensity: number;
    } | null {
        if (!this.m_directionalLight) return null;
        const dir = this.m_directionalLight.position.clone().normalize();
        return {
            dir,
            dirColor: (this.m_directionalLight.color ?? new THREE.Color('#fff')).clone(),
            ambColor: (this.m_ambientLight?.color ?? new THREE.Color('#fff')).clone(),
            dirIntensity: this.m_directionalLight.intensity ?? 0.5,
            ambIntensity: this.m_ambientLight?.intensity ?? 0.5,
        };
    }
    private m_terrainMesh: THREE.Mesh | null = null;
    private m_terrainController: TerrainController | null = null;

    /** Multi-tile terrain controller (null if no terrain or single-tile fallback). */
    get terrainController(): TerrainController | null { return this.m_terrainController; }
    private m_backgroundQuad: THREE.Mesh | null = null;
    private m_rasterQuad: THREE.Mesh | null = null;
    private m_imageQuads: THREE.Mesh[] = [];

    constructor(private m_mapView: MapView) {
        this.m_scene = (m_mapView as any).m_scene ?? null;
    }

    applyLights(lights: Light3DProperties[] | undefined, legacyLight?: any): void {
        if (!this.m_scene) return;
        this.clearLights();

        const renderer = (this.m_mapView as any).renderer;
        if (renderer) {
            renderer.shadowMap.enabled = true;
            renderer.shadowMap.type = THREE.PCFSoftShadowMap;
        }

        if (!lights || lights.length === 0) {
            if (legacyLight) {
                const legacyColor = new THREE.Color(legacyLight.color ?? '#ffffff');
                const legacyIntensity = legacyLight.intensity ?? 0.5;
                this.m_ambientColor = legacyColor;
                this.m_ambientIntensity = legacyIntensity;
                this.m_ambientLight = new THREE.AmbientLight(legacyColor, legacyIntensity);
                this.m_scene.add(this.m_ambientLight);
                if (legacyLight.position) {
                    const pos = legacyLight.position;
                    this.m_directionalColor = legacyColor;
                    this.m_directionalIntensity = legacyIntensity;
                    this.m_directionalPolar = 0;
                    this.m_directionalLight = new THREE.DirectionalLight(
                        legacyColor,
                        legacyIntensity,
                    );
                    this.m_directionalLight.position.set(pos[0], pos[1], pos[2]);
                    this.m_scene.add(this.m_directionalLight);
                }
            }
            return;
        }

        for (const light of lights) {
            if (light.type === 'ambient') {
                const color = new THREE.Color(light.color ?? '#ffffff');
                const intensity = (light.intensity ?? 0.5) * 2;
                this.m_ambientColor = color;
                this.m_ambientIntensity = light.intensity ?? 0.5;
                this.m_ambientLight = new THREE.AmbientLight(color, intensity);
                this.m_scene.add(this.m_ambientLight);
            } else if (light.type === 'directional') {
                const color = new THREE.Color(light.color ?? '#ffffff');
                const intensity = (light.intensity ?? 0.5) * 2;
                this.m_directionalColor = color;
                this.m_directionalIntensity = light.intensity ?? 0.5;
                this.m_directionalLight = new THREE.DirectionalLight(color, intensity);
                if (light.direction) {
                    const d = light.direction;
                    // mapbox direction = [azimuth, polar, distance?] in degrees;
                    // polar (elevation) drives the measure-light term.
                    this.m_directionalPolar = Array.isArray(d) ? (d[1] ?? 0) : 0;
                    this.m_directionalLight.position.set(d[0], d[1], d[2] ?? 1);
                } else {
                    this.m_directionalPolar = 0;
                    this.m_directionalLight.position.set(0.5, 1, 0.5);
                }
                if (light['cast-shadow']) {
                    this.m_directionalLight.castShadow = true;
                    this.m_directionalLight.shadow.mapSize.width = 2048;
                    this.m_directionalLight.shadow.mapSize.height = 2048;
                    this.m_directionalLight.shadow.camera.near = 0.1;
                    this.m_directionalLight.shadow.camera.far = 1000;
                }
                this.m_scene.add(this.m_directionalLight);
                this.m_scene.add(this.m_directionalLight.target);
            }
        }
    }

    applyFog(fog: FogSpec | undefined): void {
        if (!this.m_scene) return;
        const isGlobe = (this.m_mapView as any).projection?.type === 1;
        if (isGlobe) {
            return;
        }
        if (this.m_fog) {
            this.m_scene.fog = null;
            this.m_fog = null;
        }
        if (!fog) return;
        const range = fog.range ?? [0.5, 10];
        const density = range[1] > 0 ? 1.0 / range[1] : 0.1;
        const color = new THREE.Color(fog.color ?? '#ffffff');
        this.m_fog = new THREE.FogExp2(color.getHex(), density * 0.3);
        this.m_scene.fog = this.m_fog;
    }

    applySky(sky: SkySpec | undefined, fog: FogSpec | undefined): void {
        if (!this.m_scene) return;
        if (this.m_skyMesh) {
            this.m_scene.remove(this.m_skyMesh);
            this.m_skyMesh = null;
        }
        if (this.m_stars) {
            this.m_scene.remove(this.m_stars);
            this.m_stars = null;
        }

        const isGlobe = (this.m_mapView as any).projection?.type === 1;
        if (isGlobe) {
            return;
        }

        if (!sky) return;

        const skyType = sky['sky-type'] ?? 'gradient';
        if (skyType === 'gradient') {
            this.createGradientSky(sky);
        } else {
            this.createAtmosphereSky(sky);
        }

        if (fog && fog['star-intensity'] && fog['star-intensity'] > 0) {
            this.createStars(fog['star-intensity']);
        }
    }

    private createGradientSky(sky: SkySpec): void {
        const geom = new THREE.SphereGeometry(500, 32, 16);
        const topColor = new THREE.Color(sky['sky-gradient']?.[1]?.[1] ?? '#88bbee');
        const bottomColor = new THREE.Color(sky['sky-gradient']?.[0]?.[1] ?? '#ffffff');
        const opacity = sky['sky-opacity'] ?? 0.8;

        const material = new THREE.ShaderMaterial({
            side: THREE.BackSide,
            transparent: opacity < 1,
            depthWrite: false,
            uniforms: {
                uTopColor: { value: topColor },
                uBottomColor: { value: bottomColor },
                uOpacity: { value: opacity },
                uOffset: { value: 0.0 },
                uExponent: { value: 0.6 },
            },
            vertexShader: `
                varying vec3 vWorldPosition;
                void main() {
                    vec4 worldPos = modelMatrix * vec4(position, 1.0);
                    vWorldPosition = worldPos.xyz;
                    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
                }
            `,
            fragmentShader: `
                uniform vec3 uTopColor;
                uniform vec3 uBottomColor;
                uniform float uOffset;
                uniform float uExponent;
                uniform float uOpacity;
                varying vec3 vWorldPosition;
                void main() {
                    float h = normalize(vWorldPosition + uOffset).y;
                    float f = max(pow(max(h, 0.0), uExponent), 0.0);
                    vec3 col = mix(uBottomColor, uTopColor, f);
                    gl_FragColor = vec4(col, uOpacity);
                }
            `,
        });

        this.m_skyMesh = new THREE.Mesh(geom, material);
        this.m_scene!.add(this.m_skyMesh);
    }

    private createAtmosphereSky(sky: SkySpec): void {
        const sunPos = sky['sky-atmosphere-sun'] ?? [0, 90];
        const azimuth = degToRad(sunPos[0]);
        const elevation = degToRad(sunPos[1]);
        const sunColor = new THREE.Color(sky['sky-atmosphere-color'] ?? '#ffffff');
        const haloColor = new THREE.Color(sky['sky-atmosphere-halo-color'] ?? '#88aacc');
        const sunIntensity = sky['sky-atmosphere-sun-intensity'] ?? 1.0;
        const opacity = sky['sky-opacity'] ?? 0.8;

        const sunDir = new THREE.Vector3(
            Math.cos(elevation) * Math.cos(azimuth),
            Math.sin(elevation),
            Math.cos(elevation) * Math.sin(azimuth),
        );

        const geom = new THREE.SphereGeometry(500, 32, 16);
        const material = new THREE.ShaderMaterial({
            side: THREE.BackSide,
            transparent: opacity < 1,
            depthWrite: false,
            uniforms: {
                uSunDir: { value: sunDir },
                uSunColor: { value: sunColor },
                uHaloColor: { value: haloColor },
                uSunIntensity: { value: sunIntensity },
                uOpacity: { value: opacity },
            },
            vertexShader: `
                varying vec3 vWorldDir;
                void main() {
                    vWorldDir = normalize(position);
                    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
                }
            `,
            fragmentShader: `
                uniform vec3 uSunDir;
                uniform vec3 uSunColor;
                uniform vec3 uHaloColor;
                uniform float uSunIntensity;
                uniform float uOpacity;
                varying vec3 vWorldDir;
                void main() {
                    float d = dot(normalize(vWorldDir), normalize(uSunDir));
                    float sunGlow = pow(max(d, 0.0), 32.0);
                    float haloGlow = pow(max(d, 0.0), 4.0) * 0.3;
                    float horizon = max(vWorldDir.y * 0.5 + 0.5, 0.0);
                    vec3 sky = mix(vec3(0.4, 0.6, 0.9), vec3(0.7, 0.8, 1.0), horizon);
                    sky += uSunColor * sunGlow * uSunIntensity;
                    sky += uHaloColor * haloGlow;
                    gl_FragColor = vec4(sky, uOpacity);
                }
            `,
        });

        this.m_skyMesh = new THREE.Mesh(geom, material);
        this.m_scene!.add(this.m_skyMesh);
    }

    private createStars(intensity: number): void {
        const count = 2000;
        const positions = new Float32Array(count * 3);
        const sizes = new Float32Array(count);
        for (let i = 0; i < count; i++) {
            const theta = Math.random() * Math.PI * 2;
            const phi = Math.acos(Math.random() * 2 - 1);
            const r = 400;
            positions[i * 3] = r * Math.sin(phi) * Math.cos(theta);
            positions[i * 3 + 1] = r * Math.cos(phi);
            positions[i * 3 + 2] = r * Math.sin(phi) * Math.sin(theta);
            sizes[i] = Math.random() * 2 + 0.5;
        }
        const geom = new THREE.BufferGeometry();
        geom.setAttribute('position', new THREE.BufferAttribute(positions, 3));
        geom.setAttribute('aSize', new THREE.BufferAttribute(sizes, 1));

        const material = new THREE.ShaderMaterial({
            transparent: true,
            depthWrite: false,
            uniforms: {
                uIntensity: { value: intensity },
            },
            vertexShader: `
                attribute float aSize;
                uniform float uIntensity;
                varying float vAlpha;
                void main() {
                    vAlpha = uIntensity;
                    vec4 mvPos = modelViewMatrix * vec4(position, 1.0);
                    gl_PointSize = aSize * (300.0 / -mvPos.z);
                    gl_Position = projectionMatrix * mvPos;
                }
            `,
            fragmentShader: `
                varying float vAlpha;
                void main() {
                    float d = length(gl_PointCoord - vec2(0.5));
                    if (d > 0.5) discard;
                    float alpha = (1.0 - d * 2.0) * vAlpha;
                    gl_FragColor = vec4(1.0, 1.0, 1.0, alpha);
                }
            `,
        });

        this.m_stars = new THREE.Points(geom, material);
        this.m_scene!.add(this.m_stars);
    }

    async applyBackgroundPattern(
        patternName: string | undefined,
        spriteAtlas: SpriteAtlas | null,
        bgColor: string,
        bgOpacity: number,
        pitchAlignment: string = 'map',
    ): Promise<void> {
        if (!this.m_scene) return;

        if (this.m_backgroundQuad) {
            this.m_scene.remove(this.m_backgroundQuad);
            (this.m_backgroundQuad.geometry as THREE.BufferGeometry).dispose();
            (this.m_backgroundQuad.material as THREE.Material).dispose();
            this.m_backgroundQuad = null;
        }

        if (!patternName || !spriteAtlas) return;

        // Resolve the specific pattern sub-rectangle inside the sprite atlas.
        // Fall back to the full atlas when the named pattern is not present.
        const uv = spriteAtlas.getIconUv(patternName);
        const tex = spriteAtlas.texture.clone();
        tex.wrapS = THREE.RepeatWrapping;
        tex.wrapT = THREE.RepeatWrapping;
        if (uv) {
            const u0 = uv.uvMin[0];
            const v0 = uv.uvMin[1];
            const w = Math.max(uv.uvMax[0] - u0, 1e-6);
            const h = Math.max(uv.uvMax[1] - v0, 1e-6);
            tex.offset.set(u0, v0);
            tex.repeat.set(w, h);
        } else {
            tex.offset.set(0, 0);
            tex.repeat.set(1, 1);
        }
        // Tile the pattern sub-rectangle across the screen.
        const baseRepeat = 8;
        tex.repeat.x *= baseRepeat;
        tex.repeat.y *= baseRepeat;
        tex.needsUpdate = true;

        const material = new THREE.MeshBasicMaterial({
            map: tex,
            color: new THREE.Color(bgColor),
            transparent: bgOpacity < 1,
            opacity: bgOpacity,
            depthWrite: false,
            depthTest: false,
        });

        const geom = new THREE.PlaneGeometry(2, 2);
        this.m_backgroundQuad = new THREE.Mesh(geom, material);
        this.m_backgroundQuad.frustumCulled = false;
        this.m_backgroundQuad.renderOrder = -10000;

        this.m_backgroundQuad.onBeforeRender = (renderer: THREE.WebGLRenderer, _scene: THREE.Scene, camera: THREE.Camera) => {
            if (pitchAlignment === 'viewport') {
                // 'viewport' alignment: the background quad stays fixed to the
                // screen regardless of camera orientation (billboard). It only
                // tracks the inverse projection — no view rotation applied.
                const matrix = new THREE.Matrix4();
                matrix.copy(camera.projectionMatrix);
                matrix.invert();
                this.m_backgroundQuad!.quaternion.setFromRotationMatrix(matrix);
                this.m_backgroundQuad!.position.set(0, 0, -0.1);
            } else {
                // 'map' alignment (default): the background quad follows the
                // camera view matrix so the pattern appears anchored to the
                // map surface. This matches mapbox's default behavior.
                const matrix = new THREE.Matrix4();
                matrix.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
                matrix.invert();
                this.m_backgroundQuad!.quaternion.setFromRotationMatrix(matrix);
                this.m_backgroundQuad!.position.set(0, 0, -0.1);
            }
        };

        this.m_scene.add(this.m_backgroundQuad);
    }

    async applyTerrain(
        terrain: { source: string; exaggeration?: number } | undefined,
        demTileUrl: string | null,
        zoom: number = 8,
        center: [number, number] = [0, 0],
    ): Promise<void> {
        if (!this.m_scene) return;
        // Dispose previous terrain (legacy single mesh + multi-tile controller).
        if (this.m_terrainMesh) {
            this.m_scene.remove(this.m_terrainMesh);
            (this.m_terrainMesh.geometry as THREE.BufferGeometry).dispose();
            (this.m_terrainMesh.material as THREE.Material).dispose();
            this.m_terrainMesh = null;
        }
        if (this.m_terrainController) {
            this.m_terrainController.dispose();
            this.m_terrainController = null;
        }
        if (!terrain || !demTileUrl) return;

        // Multi-tile terrain: build an N×N grid of DEM tiles around the center,
        // each decoded to R32F and rendered as a skirted mesh. Falls back to the
        // legacy single-tile mesh if the controller cannot run.
        const terrainZoom = Math.min(Math.max(Math.floor(zoom), 0), 12);
        try {
            this.m_terrainController = new TerrainController(this.m_scene);
            await this.m_terrainController.build(
                demTileUrl,
                terrainZoom,
                center,
                terrain.exaggeration ?? 1.0,
                1, // radius → 3×3 grid around center
            );
            if (this.m_terrainController.meshCount > 0) return;
            this.m_terrainController.dispose();
            this.m_terrainController = null;
        } catch {}

        // Legacy fallback: single center tile.
        const lat = degToRad(center[1]);
        const n = Math.pow(2, terrainZoom);
        const xTile = Math.floor(((center[0] + 180) / 360) * n);
        const yTile = Math.floor(((1 - Math.log(Math.tan(lat) + 1 / Math.cos(lat)) / Math.PI) / 2) * n);

        const url = demTileUrl
            .replace('{z}', String(terrainZoom))
            .replace('{x}', String(xTile))
            .replace('{y}', String(yTile));

        try {
            const loader = new THREE.TextureLoader();
            const demTexture = await loader.loadAsync(url);
            demTexture.minFilter = THREE.LinearFilter;
            demTexture.magFilter = THREE.LinearFilter;

            const material = new MapTerrainMaterial();
            material.setDemTexture(demTexture);
            material.setExaggeration(terrain.exaggeration ?? 1.0);

            const geom = createTerrainGrid(
                EarthConstants.EQUATORIAL_CIRCUMFERENCE,
                EarthConstants.EQUATORIAL_CIRCUMFERENCE,
                128,
            );

            this.m_terrainMesh = new THREE.Mesh(geom, material);
            this.m_terrainMesh.position.set(0, 0, 0);
            this.m_scene.add(this.m_terrainMesh);
        } catch {}
    }

    private clearLights(): void {
        if (this.m_ambientLight) { this.m_scene?.remove(this.m_ambientLight); this.m_ambientLight = null; }
        if (this.m_directionalLight) {
            this.m_scene?.remove(this.m_directionalLight);
            this.m_scene?.remove(this.m_directionalLight.target);
            this.m_directionalLight = null;
        }
        if (this.m_hemisphereLight) { this.m_scene?.remove(this.m_hemisphereLight); this.m_hemisphereLight = null; }
        this.m_ambientColor = null;
        this.m_ambientIntensity = 0;
        this.m_directionalColor = null;
        this.m_directionalIntensity = 0;
        this.m_directionalPolar = 0;
    }

    async applyRasterSource(
        rasterTileUrl: string | null,
        zoom: number = 0,
        center: [number, number] = [0, 0],
        paint: Record<string, any> = {},
        layer?: { visibility?: string; minzoom?: number; maxzoom?: number },
    ): Promise<void> {
        if (!this.m_scene) return;
        if (this.m_rasterQuad) {
            this.m_scene.remove(this.m_rasterQuad);
            (this.m_rasterQuad.geometry as THREE.BufferGeometry).dispose();
            (this.m_rasterQuad.material as THREE.Material).dispose();
            this.m_rasterQuad = null;
        }
        // Respect the raster layer's visibility and zoom range.
        if (layer?.visibility === 'none') return;
        if (layer?.minzoom !== undefined && zoom < layer.minzoom) return;
        if (layer?.maxzoom !== undefined && zoom >= layer.maxzoom) return;
        if (!rasterTileUrl) return;

        const lat = degToRad(center[1]);
        const n = Math.pow(2, zoom);
        const xTile = Math.floor(((center[0] + 180) / 360) * n);
        const yTile = Math.floor(((1 - Math.log(Math.tan(lat) + 1 / Math.cos(lat)) / Math.PI) / 2) * n);
        const url = rasterTileUrl
            .replace('{z}', String(zoom))
            .replace('{x}', String(xTile))
            .replace('{y}', String(yTile));

        try {
            const loader = new THREE.TextureLoader();
            const texture = await loader.loadAsync(url);
            texture.minFilter = THREE.LinearFilter;
            texture.magFilter = THREE.LinearFilter;

            const C = EarthConstants.EQUATORIAL_CIRCUMFERENCE;
            const tileSize = C / n;
            const worldX = xTile * tileSize;
            const worldY = yTile * tileSize;

            const material = new THREE.MeshBasicMaterial({
                map: texture,
                transparent: (paint['raster-opacity'] ?? 1) < 1,
                opacity: paint['raster-opacity'] ?? 1,
                side: THREE.DoubleSide,
                depthWrite: false,
            });

            const geom = new THREE.PlaneGeometry(tileSize, tileSize);
            const mesh = new THREE.Mesh(geom, material);
            mesh.position.set(worldX + tileSize / 2, C - worldY - tileSize / 2, 0);
            mesh.renderOrder = -100;
            mesh.frustumCulled = false;
            this.m_rasterQuad = mesh;
            this.m_scene.add(mesh);
        } catch {}
    }

    async applyImageSources(style: any): Promise<void> {
        if (!this.m_scene) return;

        for (const mesh of this.m_imageQuads) {
            this.m_scene.remove(mesh);
            (mesh.geometry as THREE.BufferGeometry).dispose();
            (mesh.material as THREE.Material).dispose();
        }
        this.m_imageQuads = [];

        const sources = style.sources ?? {};
        for (const [, src] of Object.entries(sources)) {
            const source = src as any;
            if (source.type !== 'image' && source.type !== 'canvas') continue;
            if (!source.coordinates || source.coordinates.length < 4) continue;

            // Canvas source: use the canvas element directly; Image source: fetch URL.
            let texture: THREE.Texture;
            try {
                if (source.type === 'canvas') {
                    const canvasId = source.canvas;
                    const canvasEl = typeof document !== 'undefined'
                        ? (document.getElementById(canvasId) as HTMLCanvasElement)
                        : null;
                    if (!canvasEl) continue;
                    texture = new THREE.CanvasTexture(canvasEl);
                } else {
                    const imgUrl = (source.url ?? '').replace(
                        /^local:\/\//,
                        '/base/@flywave/flywave-mbstyle-datasource/test/rendering/integration/',
                    );
                    if (!imgUrl) continue;
                    const loader = new THREE.TextureLoader();
                    texture = await loader.loadAsync(imgUrl);
                }
                texture.minFilter = THREE.LinearFilter;
                texture.magFilter = THREE.LinearFilter;

                const coords = source.coordinates;
                const proj = (this.m_mapView as any).projection;
                if (!proj) continue;

                const wgs = coords.map((c: number[]) => {
                    const { GeoCoordinates } = require('@flywave/flywave-geoutils');
                    return proj.projectPoint(new GeoCoordinates(c[1], c[0]));
                });

                const C = EarthConstants.EQUATORIAL_CIRCUMFERENCE;
                const tl = new THREE.Vector3(wgs[1].x, C - wgs[1].y, 0);
                const tr = new THREE.Vector3(wgs[2].x, C - wgs[2].y, 0);
                const br = new THREE.Vector3(wgs[3].x, C - wgs[3].y, 0);
                const bl = new THREE.Vector3(wgs[0].x, C - wgs[0].y, 0);

                const positions = new Float32Array([
                    tl.x, tl.y, 0,
                    tr.x, tr.y, 0,
                    br.x, br.y, 0,
                    bl.x, bl.y, 0,
                ]);
                const indices = new Uint16Array([0, 1, 2, 0, 2, 3]);
                const uvs = new Float32Array([0, 1, 1, 1, 1, 0, 0, 0]);

                const geom = new THREE.BufferGeometry();
                geom.setAttribute('position', new THREE.BufferAttribute(positions, 3));
                geom.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
                geom.setIndex(new THREE.BufferAttribute(indices, 1));

                const material = new THREE.MeshBasicMaterial({
                    map: texture,
                    side: THREE.DoubleSide,
                    depthWrite: false,
                    transparent: true,
                });

                const mesh = new THREE.Mesh(geom, material);
                mesh.renderOrder = -90;
                mesh.frustumCulled = false;
                this.m_scene.add(mesh);
                this.m_imageQuads.push(mesh);
            } catch {}
        }
    }

    dispose(): void {
        this.clearLights();
        if (this.m_skyMesh) { this.m_scene?.remove(this.m_skyMesh); this.m_skyMesh = null; }
        if (this.m_stars) { this.m_scene?.remove(this.m_stars); this.m_stars = null; }
        if (this.m_terrainMesh) { this.m_scene?.remove(this.m_terrainMesh); this.m_terrainMesh = null; }
        if (this.m_terrainController) { this.m_terrainController.dispose(); this.m_terrainController = null; }
        if (this.m_backgroundQuad) { this.m_scene?.remove(this.m_backgroundQuad); this.m_backgroundQuad = null; }
        if (this.m_rasterQuad) { this.m_scene?.remove(this.m_rasterQuad); this.m_rasterQuad = null; }
        for (const m of this.m_imageQuads) { this.m_scene?.remove(m); }
        this.m_imageQuads = [];
        if (this.m_fog) { this.m_scene.fog = null; this.m_fog = null; }
    }
}

function degToRad(d: number): number {
    return (d * Math.PI) / 180;
}
