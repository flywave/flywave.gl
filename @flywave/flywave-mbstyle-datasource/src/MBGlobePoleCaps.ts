import * as THREE from 'three';

/**
 * Globe pole caps — port of mgl's GLOBE_POLES raster path (draw_raster
 * drawPole + globe_util GlobeSharedBuffers::_createPoles, §780).
 *
 * Mercator tiles stop at ±85.0511°, leaving the polar caps uncovered on the
 * globe (our raster quads live in mercator tile space and cannot reach the
 * pole — the region renders as the clear color, an "octagonal hole" in
 * globe-poles fixtures). mgl draws, for every covering tile with
 * canonical.y === 0 / y === max, a triangle fan from the pole tip down to
 * the 85° ring (POLE_RAD, slightly inside the tile edge to avoid a crack),
 * sampling the tile texture's EDGE ROW (north: uv.y = 0 — the whole fan is
 * vertical streaks of the top texel row; south: uv.y = 1). fog applies via
 * the standard fog_fragment chunk (GLOBE_POLES fragment keeps fog).
 *
 * Our raster tiles are decoded GeoJSON quads in mercator space, so the cap
 * cannot be expressed there; instead the raster provider REGISTERS a cap
 * descriptor per pole-row tile it serves (same ancestor texture + uv sub-
 * rect math as buildFeature) and the datasource's AfterRender draws the
 * fans through the direct-draw channel (a private scene rendered explicitly
 * right after the backgroundFog quad — arbitrary objects added to the
 * engine's scene graph are NOT drawn by the main pass, and the world-space
 * geometry requires the TRUE camera, not the rebase rte camera whose origin
 * sits at the eye).
 */

export interface MBPoleCapDescriptor {
    key: string;
    isNorth: boolean;
    /** Tile's longitude range in degrees. */
    lon0: number;
    lon1: number;
    /**
     * Plain-color cap (background-layer pole fill, mgl's globe background
     * covers the full sphere) — skips the texture when set.
     */
    color?: THREE.Color;
    /** Ancestor tile image URL (same the quad feature samples). */
    texUrl: string;
    /** Tile's u sub-rect within the ancestor image (image x fraction). */
    u0: number;
    u1: number;
    /** Edge-row v in three's flipY space, nudged half a texel inside. */
    vEdge: number;
}

const FAN_SEGMENTS = 32;
const POLE_RING_LAT_DEG = 85.0; // mgl POLE_RAD
const MAX_DESCRIPTORS = 512;

export class MBGlobePoleCaps {
    private static s_descriptors = new Map<string, MBPoleCapDescriptor>();
    private static s_level = -1;
    private static s_textures = new Map<string, THREE.Texture>();
    private static s_meshes = new Map<string, THREE.Mesh>();
    private static s_scene: THREE.Scene | null = null;
    private static s_loader: THREE.TextureLoader | null = null;
    private static s_lastOpacity = -1;
    private static s_lastBgOpacity = 1;

    /** Called from RasterTileDataProvider.getTile for pole-row tiles. */
    public static register(d: MBPoleCapDescriptor): void {
        const level = Number(d.key.split('/')[0]);
        if (level !== this.s_level) {
            this.s_level = level;
            this.s_descriptors.clear();
        }
        if (this.s_descriptors.size > MAX_DESCRIPTORS) this.s_descriptors.clear();
        this.s_descriptors.set(d.key, d);
    }

    public static clear(): void {
        this.s_descriptors.clear();
        this.s_level = -1;
    }

    /**
     * Register the background-layer pole fill (full-longitude fans at both
     * poles) — mgl's globe background geometry covers the entire sphere, so
     * the polar void shows the fogged background color (globe-poles north:
     * expected is continuous fogged darkorange beyond 85.05°). A null color
     * withdraws the fill.
     */
    public static registerBackground(color: THREE.Color | null): void {
        for (const [key, d] of this.s_descriptors) {
            if (d.key.startsWith('bg/') && !color) this.s_descriptors.delete(key);
        }
        if (!color) return;
        this.s_level = -1; // never purged by the level sweep
        for (const pole of ['n', 's']) {
            this.s_descriptors.set(`bg/${pole}`, {
                key: `bg/${pole}`,
                isNorth: pole === 'n',
                lon0: -180,
                lon1: 180,
                color,
                texUrl: '',
                u0: 0,
                u1: 1,
                vEdge: 0,
            });
        }
    }

    private static getTexture(url: string): THREE.Texture | null {
        let tex = this.s_textures.get(url);
        if (tex) return tex;
        if (!this.s_loader) this.s_loader = new THREE.TextureLoader();
        // The Texture object is usable immediately; three uploads the image
        // whenever it arrives (map was set at material creation, so the
        // USE_MAP program is compiled from the first frame).
        tex = this.s_loader.load(url);
        tex.colorSpace = THREE.SRGBColorSpace;
        tex.wrapS = THREE.ClampToEdgeWrapping;
        tex.wrapT = THREE.ClampToEdgeWrapping;
        this.s_textures.set(url, tex);
        // Bound the cache (caps live at one zoom level at a time).
        if (this.s_textures.size > 64) {
            const first = this.s_textures.keys().next().value as string;
            this.s_textures.delete(first);
        }
        return tex;
    }

    /**
     * Rebuild/sync the fan meshes. Called every AfterRender from the
     * datasource (spherical projection only — clears on mercator).
     */
    public static sync(mapView: any, rasterOpacity: number, bgOpacity = 1): void {
        const spherical = mapView?.projection?.type === 1;
        if (!spherical || this.s_descriptors.size === 0) {
            for (const [, mesh] of this.s_meshes) mesh.geometry.dispose();
            this.s_meshes.clear();
            this.s_scene?.clear();
            return;
        }
        if (!this.s_scene) {
            this.s_scene = new THREE.Scene();
            this.s_scene.name = 'MBGlobePoleCapsScene';
        }
        const opacityChanged =
            Math.abs(rasterOpacity - this.s_lastOpacity) > 1e-3 ||
            Math.abs(bgOpacity - this.s_lastBgOpacity) > 1e-3;
        if (opacityChanged) {
            this.s_lastOpacity = rasterOpacity;
            this.s_lastBgOpacity = bgOpacity;
        }

        // Rebuild the mesh set whenever the descriptor key set or the
        // opacity changes.
        const wanted = new Set(this.s_descriptors.keys());
        for (const [key, mesh] of this.s_meshes) {
            if (!wanted.has(key) || opacityChanged) {
                this.s_scene.remove(mesh);
                mesh.geometry.dispose();
                this.s_meshes.delete(key);
            }
        }
        for (const [key, d] of this.s_descriptors) {
            if (this.s_meshes.has(key)) continue;
            const geo = this.buildFanGeometry(d, mapView);
            const isColor = !!d.color;
            // Background fans carry the BACKGROUND layer's opacity — the
            // raster layer's opacity must not dim them (mgl composites the
            // layers independently).
            const op = isColor ? this.s_lastBgOpacity : this.s_lastOpacity;
            const tex = isColor ? null : this.getTexture(d.texUrl);
            const mat = new THREE.MeshBasicMaterial({
                map: tex,
                color: d.color ?? 0xffffff,
                transparent: op < 1,
                opacity: op,
                // Blended over the main-pass framebuffer (transparent caps
                // composite like mgl's premultiplied cap over the cleared
                // space color) — depth is NOT written: the caps draw after
                // the fog quad, so there is nothing left to protect.
                depthWrite: false,
                side: THREE.DoubleSide,
            });
            mat.name = d.texUrl;
            // §779c: share the LIVE fog uniforms so the globe content fog
            // (fog_fragment globe branch, compiled in via scene.fog) reaches
            // this material — GLSL defaults 0 keep the fog inert otherwise.
            mat.onBeforeCompile = (shader: any) => {
                const fogLib = THREE.UniformsLib.fog as any;
                if (fogLib.fogGlobeMode) shader.uniforms.fogGlobeMode = fogLib.fogGlobeMode;
                if (fogLib.fogGlobeCenter) shader.uniforms.fogGlobeCenter = fogLib.fogGlobeCenter;
                if (fogLib.fogGlobeScale) shader.uniforms.fogGlobeScale = fogLib.fogGlobeScale;
                if (fogLib.fogGlobeRadius) shader.uniforms.fogGlobeRadius = fogLib.fogGlobeRadius;
                if (fogLib.fogGlobeTransition) shader.uniforms.fogGlobeTransition = fogLib.fogGlobeTransition;
                if (fogLib.fogGlobeRange) shader.uniforms.fogGlobeRange = fogLib.fogGlobeRange;
                if (fogLib.fogAlpha) shader.uniforms.fogAlpha = fogLib.fogAlpha;
            };
            const mesh = new THREE.Mesh(geo, mat);
            mesh.name = `polecap:${key}`;
            // Background fans render first, satellite streak fans over them
            // (mgl stack: raster cap blends over the background dome).
            mesh.renderOrder = isColor ? 1 : 2;
            mesh.frustumCulled = false;
            geo.computeBoundingSphere();
            this.s_meshes.set(key, mesh);
            this.s_scene.add(mesh);
        }
    }

    /**
     * Draw the caps into the default framebuffer (AfterRender, after the
     * backgroundFog quad). Depth-tested (LEQUAL) against the main pass so
     * caps beyond the globe horizon are occluded like mgl.
     */
    public static render(mapView: any, fog?: THREE.Fog | null): void {
        if (!this.s_scene || this.s_meshes.size === 0) return;
        // Content fog on the caps (mgl fogs the globe background/raster caps
        // like any ground content). three recompiles the programs when the
        // scene's fog toggles (fog is part of the program cache key).
        if (fog !== undefined && this.s_scene.fog !== fog) {
            this.s_scene.fog = fog ?? null;
        }
        const renderer = (mapView as any).renderer as THREE.WebGLRenderer | undefined;
        const cam = mapView?.camera as THREE.PerspectiveCamera | undefined;
        if (!renderer || !cam) return;
        const prevAutoClear = renderer.autoClear;
        const prevRT = renderer.getRenderTarget();
        try {
            renderer.autoClear = false;
            renderer.setScissorTest(false);
            renderer.setRenderTarget(null);
            renderer.render(this.s_scene, cam);
        } finally {
            renderer.setRenderTarget(prevRT);
            renderer.autoClear = prevAutoClear;
        }
    }

    private static buildFanGeometry(d: MBPoleCapDescriptor, mapView: any): THREE.BufferGeometry {
        const { GeoCoordinates } = require('@flywave/flywave-geoutils');
        const projection = mapView.projection;
        const pos = new Float32Array((FAN_SEGMENTS + 2) * 3);
        const uv = new Float32Array((FAN_SEGMENTS + 2) * 2);
        const idx: number[] = [];
        const tipLat = d.isNorth ? 90 : -90;
        const ringLat = d.isNorth ? POLE_RING_LAT_DEG : -POLE_RING_LAT_DEG;
        const place = (i: number, lat: number, lon: number, u: number, v: number): void => {
            const p = projection.projectPoint(new GeoCoordinates(lat, lon), new THREE.Vector3());
            pos[i * 3] = p.x;
            pos[i * 3 + 1] = p.y;
            pos[i * 3 + 2] = p.z;
            uv[i * 2] = u;
            uv[i * 2 + 1] = v;
        };
        // 0 = pole tip (mgl: uv.x 0.5, edge-row v); 1..N+1 = ring.
        place(0, tipLat, (d.lon0 + d.lon1) / 2, (d.u0 + d.u1) / 2, d.vEdge);
        for (let i = 0; i <= FAN_SEGMENTS; i++) {
            const t = i / FAN_SEGMENTS;
            place(i + 1, ringLat, d.lon0 + (d.lon1 - d.lon0) * t, d.u0 + (d.u1 - d.u0) * t, d.vEdge);
            if (i > 0) {
                idx.push(0, i, i + 1);
            }
        }
        const geo = new THREE.BufferGeometry();
        geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
        geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
        geo.setIndex(idx);
        return geo;
    }
}
