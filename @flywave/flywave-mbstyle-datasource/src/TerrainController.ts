import * as THREE from 'three';
import { EarthConstants } from '@flywave/flywave-geoutils';
import { MapTerrainMaterial, decodeTerrainElevation } from './materials/MapTerrainMaterial';

/**
 * Multi-tile terrain mesh builder.
 *
 * Replaces the previous single-mesh, single-DEM-tile approach with an N×N grid
 * of DEM tiles around the map center. Each tile becomes its own positioned mesh
 * with its own DEM texture and a skirt (to hide cracks between neighbors).
 *
 * This implements T1–T3 of docs/design-terrain-draping.md:
 *  - T1: DEM decode (RGB → R32F DataTexture) with the correct Mapbox formula
 *  - T2: shared 128-segment grid + skirt per tile
 *  - T3: multi-tile coverage around the viewport center
 *
 * (Full proxy-tile draping + depth occlusion + morphing are T4–T7, deferred.)
 */

const GRID_SEGMENTS = 128;

function degToRad(d: number): number {
    return (d * Math.PI) / 180;
}

function tile2lat(y: number, z: number): number {
    const n = Math.PI - (2 * Math.PI * y) / Math.pow(2, z);
    return (180 / Math.PI) * Math.atan(Math.sinh(n));
}

/**
 * Decode a Mapbox terrain-rgb PNG into a single-channel Float32 DataTexture.
 * Each pixel's height = (R*65536 + G*256 + B)/10 - 10000 (meters).
 * Pre-decoding on the CPU lets the GPU use hardware bilinear filtering on the
 * elevation field directly (R32F) instead of decoding per-sample.
 */
export function decodeDemImage(
    image: HTMLImageElement | ImageBitmap,
    encoding: 'mapbox' | 'terrarium' = 'mapbox',
): THREE.DataTexture {
    const canvas = typeof document !== 'undefined'
        ? document.createElement('canvas') : null;
    if (!canvas) {
        // Worker/no-canvas fallback: caller should handle null.
        return new THREE.DataTexture(new Float32Array([0]), 1, 1, THREE.RedFormat, THREE.FloatType);
    }
    const w = (image as HTMLImageElement).naturalWidth ?? (image as ImageBitmap).width ?? image.width;
    const h = (image as HTMLImageElement).naturalHeight ?? (image as ImageBitmap).height ?? image.height;
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
    ctx.drawImage(image as any, 0, 0);
    const { data } = ctx.getImageData(0, 0, w, h);
    const heights = new Float32Array(w * h);
    for (let i = 0; i < w * h; i++) {
        const r = data[i * 4];
        const g = data[i * 4 + 1];
        const b = data[i * 4 + 2];
        heights[i] = encoding === 'mapbox'
            ? decodeTerrainElevation(r, g, b)
            : r * 256 + g + b / 256 - 32768;
    }
    const tex = new THREE.DataTexture(heights, w, h, THREE.RedFormat, THREE.FloatType);
    tex.minFilter = THREE.LinearFilter;
    tex.magFilter = THREE.LinearFilter;
    tex.needsUpdate = true;
    return tex;
}

/**
 * Build a PlaneGeometry with a skirt: the outer ring of vertices is duplicated
 * and dropped by skirtHeight so neighboring tiles overlap seamlessly.
 */
export function createSkirtedGrid(
    size: number,
    segments: number,
    skirtHeight: number,
): THREE.BufferGeometry {
    const geo = new THREE.PlaneGeometry(size, size, segments, segments);
    geo.rotateX(-Math.PI / 2); // lie flat on XZ plane
    const pos = geo.attributes.position as THREE.BufferAttribute;
    const count = pos.count;
    // Append a skirt ring: copy the border vertices and push them down.
    const borderIndices: number[] = [];
    for (let i = 0; i < count; i++) {
        const x = pos.getX(i);
        const z = pos.getZ(i);
        const half = size / 2;
        const isBorder =
            Math.abs(x - (-half)) < 1e-6 || Math.abs(x - half) < 1e-6 ||
            Math.abs(z - (-half)) < 1e-6 || Math.abs(z - half) < 1e-6;
        if (isBorder) borderIndices.push(i);
    }
    const skirtVerts: number[] = [];
    const skirtIdx: number[] = [];
    const uv = geo.attributes.uv as THREE.BufferAttribute;
    for (const bi of borderIndices) {
        const base = pos.getX(bi) !== undefined ? count + skirtVerts.length / 3 : 0;
        const sx = pos.getX(bi);
        const sy = pos.getY(bi) - skirtHeight; // drop skirt vertex below
        const sz = pos.getZ(bi);
        skirtVerts.push(sx, sy, sz);
        const su = uv.getX(bi);
        const sv = uv.getY(bi);
        uv.setXY(count + skirtVerts.length / 3 - 1, su, sv);
        skirtIdx.push(bi, count + skirtVerts.length / 3 - 1);
    }
    // Append skirt vertices
    const newPos = new Float32Array(pos.array.length + skirtVerts.length);
    newPos.set(pos.array as Float32Array, 0);
    newPos.set(skirtVerts, pos.array.length);
    geo.setAttribute('position', new THREE.BufferAttribute(newPos, 3));
    // Append skirt degenerate triangles (pairs) to connect border to skirt ring
    const idxArr = geo.index ? Array.from(geo.index.array as ArrayLike<number>) : [];
    // Add triangles between each border vertex and its skirt copy.
    for (let k = 0; k + 1 < skirtIdx.length; k += 2) {
        const a = skirtIdx[k], aS = skirtIdx[k + 1];
        // find next border/skirt pair
        const b = skirtIdx[k + 2] ?? skirtIdx[0];
        const bS = skirtIdx[k + 3] ?? skirtIdx[1];
        idxArr.push(a, aS, b);
        idxArr.push(aS, bS, b);
    }
    geo.setIndex(idxArr);
    geo.computeVertexNormals();
    return geo;
}

export class TerrainController {
    private m_meshes: THREE.Mesh[] = [];
    private m_demTextures: THREE.DataTexture[] = [];
    private m_scene: THREE.Scene;
    /** Shared geometry (one skirted grid reused per tile via per-instance material). */
    private m_gridGeometry: THREE.BufferGeometry;
    /** Center DEM tile info, exposed for fill-extrusion-terrain base sampling. */
    private m_centerDem: {
        texture: THREE.DataTexture;
        originX: number; originY: number; size: number;
    } | null = null;
    /** Vertex morphing: when a rebuild swaps DEM textures, animate uDemLerp 0→1. */
    private m_morphActive = false;
    private m_morphStart = 0;
    /** Previous DEM textures kept alive during a morph; disposed when it ends. */
    private m_prevDemTextures: THREE.DataTexture[] = [];
    private static readonly MORPH_DURATION = 250; // ms

    constructor(scene: THREE.Scene) {
        this.m_scene = scene;
        this.m_gridGeometry = createSkirtedGrid(
            EarthConstants.EQUATORIAL_CIRCUMFERENCE / 4, // tile size in world units at zoom
            GRID_SEGMENTS,
            0, // skirt height set per-tile below via material scale
        );
    }

    get meshCount(): number { return this.m_meshes.length; }

    /** Terrain meshes (read-only access for depth-occlusion pass). */
    get meshes(): readonly THREE.Mesh[] { return this.m_meshes; }

    /** Center DEM tile info for fill-extrusion-terrain base elevation sampling. */
    get centerDem(): { texture: THREE.Texture; originX: number; originY: number; size: number } | null {
        return this.m_centerDem;
    }

    /**
     * Advance vertex morphing. Call once per frame (e.g. AfterRender). When a
     * rebuild swapped DEM textures, this animates each material's uDemLerp from
     * 0→1 over MORPH_DURATION so elevations transition smoothly (no popping).
     * Returns true while a morph is in progress.
     */
    updateMorphing(now: number): boolean {
        if (!this.m_morphActive) return false;
        const elapsed = now - this.m_morphStart;
        const t = Math.min(1, elapsed / TerrainController.MORPH_DURATION);
        const eased = t * t * (3 - 2 * t); // smoothstep
        for (const mesh of this.m_meshes) {
            const mat = mesh.material as MapTerrainMaterial;
            if (typeof (mat as any).setDemLerp === 'function') {
                (mat as any).setDemLerp(eased);
            }
        }
        if (t >= 1) {
            this.m_morphActive = false;
            // Morph done: free the stashed previous DEM textures.
            for (const tex of this.m_prevDemTextures) tex.dispose();
            this.m_prevDemTextures = [];
        }
        return this.m_morphActive;
    }

    /** Whether a morph transition is currently animating. */
    get isMorphing(): boolean { return this.m_morphActive; }

    /** Toggle wireframe rendering on all terrain meshes (debug). */
    setWireframe(enabled: boolean): void {
        for (const mesh of this.m_meshes) {
            const mat = mesh.material as any;
            mat.wireframe = enabled;
        }
    }

    /**
     * Build an N×N grid of terrain meshes around the map center.
     * `demTileUrl` is a {z}/{x}/{y} template.
     */
    async build(
        demTileUrl: string,
        zoom: number,
        center: [number, number],
        exaggeration: number,
        radius: number = 1,
    ): Promise<void> {
        // Capture previous DEM textures before disposing, to enable a morph
        // transition (old → new elevation) when the grid is rebuilt (e.g. zoom
        // change loads new DEM tiles at the same grid positions). Detach them
        // from m_demTextures so dispose() won't free them during the morph.
        const prevDemTextures = [...this.m_demTextures];
        this.m_demTextures = [];
        this.dispose();
        if (radius < 0) radius = 0;

        const lat = degToRad(center[1]);
        const n = Math.pow(2, zoom);
        const cxTile = Math.floor(((center[0] + 180) / 360) * n);
        const cyTile = Math.floor(((1 - Math.log(Math.tan(lat) + 1 / Math.cos(lat)) / Math.PI) / 2) * n);

        const C = EarthConstants.EQUATORIAL_CIRCUMFERENCE;
        const tileSizeWorld = C / n;

        const loader = new THREE.TextureLoader();
        const tasks: Promise<void>[] = [];

        for (let dy = -radius; dy <= radius; dy++) {
            for (let dx = -radius; dx <= radius; dx++) {
                const xTile = ((cxTile + dx) % n + n) % n;
                const yTile = Math.max(0, Math.min(n - 1, cyTile + dy));
                const url = demTileUrl
                    .replace('{z}', String(zoom))
                    .replace('{x}', String(xTile))
                    .replace('{y}', String(yTile));

                tasks.push(this.loadAndAddTile(url, loader, dx, dy, cxTile, cyTile,
                    tileSizeWorld, C, exaggeration, zoom));
            }
        }
        await Promise.all(tasks);

        // Morph: if the rebuilt grid has the same tile count as before, cross-fade
        // each tile's old DEM → new DEM over MORPH_DURATION (no popping).
        if (prevDemTextures.length > 0 && this.m_meshes.length === prevDemTextures.length) {
            for (let i = 0; i < this.m_meshes.length; i++) {
                const mat = this.m_meshes[i].material as MapTerrainMaterial;
                mat.setDemPrevTexture(prevDemTextures[i] ?? null);
                mat.setDemLerp(0);
            }
            this.m_prevDemTextures = prevDemTextures;
            this.m_morphStart = Date.now();
            this.m_morphActive = true;
        } else {
            // No matching grid → just free the captured textures.
            for (const t of prevDemTextures) t.dispose();
        }
    }

    private async loadAndAddTile(
        url: string,
        loader: THREE.TextureLoader,
        dx: number, dy: number,
        cxTile: number, cyTile: number,
        tileSizeWorld: number, C: number,
        exaggeration: number, zoom: number,
    ): Promise<void> {
        try {
            const pngTexture = await loader.loadAsync(url);
            // Decode the PNG into an R32F elevation DataTexture.
            const demTex = decodeDemImage(pngTexture.image, 'mapbox');
            this.m_demTextures.push(demTex);

            const material = new MapTerrainMaterial();
            material.setDemTexture(demTex);
            material.setDemIsFloat(true);  // R32F DataTexture (pre-decoded heights)
            material.setExaggeration(exaggeration);

            const geo = this.m_gridGeometry.clone();
            // Scale the shared tile-sized grid to this tile's world size.
            // Position: world tile origin (top-left in world Y-down).
            const worldX = (cxTile + dx) * tileSizeWorld + tileSizeWorld / 2;
            const worldY = C - (cyTile + dy) * tileSizeWorld - tileSizeWorld / 2;

            // Record the center tile's DEM + world bounds for fill-extrusion-terrain.
            if (dx === 0 && dy === 0) {
                this.m_centerDem = {
                    texture: demTex,
                    originX: (cxTile) * tileSizeWorld,
                    originY: C - (cyTile + 1) * tileSizeWorld,
                    size: tileSizeWorld,
                };
            }

            const mesh = new THREE.Mesh(geo, material);
            mesh.position.set(worldX, 0, worldY);
            mesh.scale.set(tileSizeWorld / (C / 4), 1, tileSizeWorld / (C / 4));
            // Render terrain before other objects so its depth is written first,
            // enabling hardware depth occlusion for circles/symbols behind hills
            // (Scheme C in design-terrain-draping.md, no depth texture needed).
            mesh.renderOrder = -100;
            this.m_meshes.push(mesh);
            this.m_scene.add(mesh);
        } catch {
            // tile failed to load — skip
        }
    }

    dispose(): void {
        for (const m of this.m_meshes) {
            this.m_scene.remove(m);
            (m.material as THREE.Material).dispose();
        }
        this.m_meshes = [];
        for (const t of this.m_demTextures) t.dispose();
        this.m_demTextures = [];
    }
}
