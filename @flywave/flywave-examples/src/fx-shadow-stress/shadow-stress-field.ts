/* Copyright (C) 2025 flywave.gl contributors */

/**
 * The stress content of the shadow stress test: an anchored, Z-up local frame
 * holding an instanced city and a layer of cloned glTF models. Ground heights
 * are sampled from the terrain elevation provider once per rebuild and reused
 * for every instance.
 *
 * Kept in its own module so the example entry (`index.ts`) stays readable and
 * under the example linter's file-size limit.
 */

import {
    type ILogger,
    type MapAnchor,
    type MapView,
    createThreeSceneFromGLTF,
    ellipsoidProjection,
    GeoCoordinates,
    GLTFLoader,
    loadGLTF,
    LoggerManager,
    postProcessGLTF
} from "@flywave/flywave.gl";
import * as THREE from "three/webgpu";

const logger: ILogger = LoggerManager.instance.create("flywave-examples/fx-shadow-stress/field");

/** Centre of the test site (Shandong, China — same area as the lighting example). */
export const SITE = { lat: 36.4839, lng: 118.1755 };

/** Side length of the square stress field, meters. */
const FIELD_SIZE = 900;
/** City grid resolution per axis; the field holds `GRID_CELLS^2` slots. */
const GRID_CELLS = 64;
/** Distance between two grid slots, meters. */
const GRID_SPACING = FIELD_SIZE / GRID_CELLS;
/** Maximum number of instanced buildings the UI can request. */
export const MAX_BUILDINGS = GRID_CELLS * GRID_CELLS;
/** Real-model layer: a small local glTF tree, cloned once per slot. */
const TREE_MODEL_URL = "f4/models/LibOut_CherryTree.glb";
/** Maximum number of glTF clones the UI can request. */
export const MAX_TREES = 800;
/** Defaults chosen so the first frame already shows a meaty load. */
export const DEFAULT_BUILDINGS = 1800;
export const DEFAULT_TREES = 200;
/** A/B benchmark sampling window per leg. */
/** Vertical offset that hides terrain-sampling error under each building. */
const BUILDING_SINK = 2;
export function sleep(ms: number): Promise<void> {
    return new Promise(resolve => window.setTimeout(resolve, ms));
}

/** Small deterministic LCG so a given load always produces the same city. */
class SeededRandom {
    private m_seed: number;

    constructor(seed: number) {
        this.m_seed = seed;
    }

    next(): number {
        this.m_seed = (1664525 * this.m_seed + 1013904223) % 4294967296;
        return this.m_seed / 4294967296;
    }
}

/** Cached ground heights across the stress field (bilinear lookups). */
interface IGroundGrid {
    /** Samples per axis. */
    resolution: number;
    /** Row-major `resolution * resolution` altitude samples, meters. */
    samples: Float32Array;
}

/**
 * Extra elevation-provider surface exposed by the DEM terrain source (not part
 * of the public `ElevationProvider` interface): returns the tile key actually
 * used, which is how we tell "no DEM tile loaded yet" apart from a real `0 m`
 * height (the public `getHeight` coerces a miss to zero).
 */
interface IHeightWithTileKeyProvider {
    getHeightWithInTileKey(
        geoPoint: GeoCoordinates,
        defaultIfNotLoaded?: number | null,
        level?: number
    ): { altitude: number | null; tileKey?: { level: number } };
}

/**
 * The stress content: an anchored, Z-up local frame holding the instanced
 * city and the cloned glTF models. Ground heights are sampled once per rebuild
 * from the terrain elevation provider and reused for every instance.
 */
export class StressField {
    readonly root: MapAnchor<THREE.Object3D>;

    private readonly m_cityGroup = new THREE.Group();
    private readonly m_treeGroup = new THREE.Group();
    private readonly m_anchorECEF = new THREE.Vector3();
    private readonly m_east = new THREE.Vector3();
    private readonly m_north = new THREE.Vector3();
    private m_anchorGeo = new GeoCoordinates(SITE.lat, SITE.lng, 0);
    private m_centerHeight = 0;
    private m_ground?: IGroundGrid;
    private m_treeTemplate?: THREE.Object3D;

    /** Template scene of the cloned glTF trees (diagnostics reuse its geometry). */
    get treeTemplate(): THREE.Object3D | undefined {
        return this.m_treeTemplate;
    }

    constructor(private readonly m_mapView: MapView) {
        this.root = new THREE.Group();
        this.root.add(this.m_cityGroup, this.m_treeGroup);
        this.m_mapView.mapAnchors.add(this.root);
    }

    /**
     * Resolve the terrain under the site, build the anchored local frame
     * (x = east, y = north, z = up) and load the glTF template. Must run before
     * {@link build}.
     */
    async prepare(): Promise<void> {
        // Seed the tangent frame at altitude 0 BEFORE probing: the probe converts
        // local offsets to world coordinates, so a zero anchor would sample the
        // earth centre (lat/lng 0,0 — ocean) and read a meaningless height.
        ellipsoidProjection.projectPoint(
            new GeoCoordinates(SITE.lat, SITE.lng, 0),
            this.m_anchorECEF
        );
        this.updateTangentBasis();

        // Wait for the DEM around the site to be decoded. A real `0 m` height is
        // indistinguishable from a cache miss on the public `getHeight`, so use
        // the provider's tile-aware probe and require a reasonably detailed tile
        // (the best available ancestor is reported, so L0 would be too coarse).
        const start = performance.now();
        let centerHeight: number | undefined;
        while (performance.now() - start < 25000) {
            const probe = this.probeGeoHeight(0, 0);
            if (probe !== undefined && probe.level >= 13) {
                centerHeight = probe.altitude;
                break;
            }
            // Keep the tile pipeline moving even when requestAnimationFrame is
            // throttled (occluded/background tab): DEM tiles only start loading
            // from a rendered frame's visible-tile computation.
            this.m_mapView.renderSync(performance.now());
            await sleep(250);
        }
        const fallbackHeight = this.m_mapView.target?.altitude;
        this.m_centerHeight =
            centerHeight ?? (Number.isFinite(fallbackHeight) ? fallbackHeight : 0);
        if (centerHeight === undefined) {
            logger.warn(
                `DEM level 13+ around the site did not load in time; anchoring the field at ` +
                    `${this.m_centerHeight.toFixed(1)} m (map target altitude)`
            );
        }

        this.m_anchorGeo = new GeoCoordinates(SITE.lat, SITE.lng, this.m_centerHeight);
        ellipsoidProjection.projectPoint(this.m_anchorGeo, this.m_anchorECEF);
        this.updateTangentBasis();
        this.root.anchor = this.m_anchorGeo;
        this.root.quaternion.setFromRotationMatrix(this.tangentMatrix());

        this.m_treeTemplate = await this.loadTreeTemplate();
    }

    /** Rebuild city + models for the requested counts. */
    build(buildingCount: number, treeCount: number): void {
        this.m_ground = this.buildGroundGrid();
        this.disposeCity();
        this.m_treeGroup.clear();
        if (buildingCount > 0) {
            this.m_cityGroup.add(this.createCity(Math.min(buildingCount, MAX_BUILDINGS)));
        }
        if (treeCount > 0 && this.m_treeTemplate !== undefined) {
            this.createTrees(Math.min(treeCount, MAX_TREES));
        }
        this.m_mapView.update();
    }

    /** Local-frame matrix that maps (east, north, up) to world coordinates. */
    private tangentMatrix(): THREE.Matrix4 {
        return new THREE.Matrix4().makeBasis(this.m_east, this.m_north, this.getUpAxis());
    }

    private getUpAxis(): THREE.Vector3 {
        return this.m_anchorECEF.clone().normalize();
    }

    /**
     * Dispose the instanced city before a rebuild. The glTF clones share the
     * template's geometry/materials and must NOT be disposed here.
     */
    private disposeCity(): void {
        this.m_cityGroup.traverse(object => {
            const mesh = object as THREE.Mesh;
            if (mesh.isMesh !== true) {
                return;
            }
            mesh.geometry.dispose();
            const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
            materials.forEach(material => {
                material.dispose();
            });
        });
        this.m_cityGroup.clear();
    }

    /**
     * Recompute the east/north axes of the tangent frame. Called whenever the
     * anchor position changes (the ellipsoid normal is position dependent).
     */
    private updateTangentBasis(): void {
        const up = this.m_anchorECEF.clone().normalize();
        this.m_east.crossVectors(new THREE.Vector3(0, 0, 1), up).normalize();
        this.m_north.crossVectors(up, this.m_east).normalize();
    }

    /**
     * Terrain altitude at a local tangent-plane offset, or `undefined` when the
     * DEM has no decoded tile for that area yet. Coarse ancestors (level < 13)
     * are rejected: in this terrain an L0..L12 sample can be hundreds of metres
     * off, which would bury the city under the rendered surface.
     */
    private sampleGeoHeight(eastOffset: number, northOffset: number): number | undefined {
        const probe = this.probeGeoHeight(eastOffset, northOffset);
        return probe !== undefined && probe.level >= 13 ? probe.altitude : undefined;
    }

    /**
     * Like {@link sampleGeoHeight}, but also reports the level of the DEM tile
     * that answered. `undefined` means "nothing cached for this point yet".
     */
    private probeGeoHeight(
        eastOffset: number,
        northOffset: number
    ): { altitude: number; level: number } | undefined {
        const elevationProvider = this.m_mapView.elevationProvider;
        if (elevationProvider === undefined) {
            return undefined;
        }
        const world = this.m_anchorECEF
            .clone()
            .addScaledVector(this.m_east, eastOffset)
            .addScaledVector(this.m_north, northOffset);
        const geo = ellipsoidProjection.unprojectPoint(world);
        const probeProvider = elevationProvider as typeof elevationProvider &
            Partial<IHeightWithTileKeyProvider>;
        if (probeProvider.getHeightWithInTileKey !== undefined) {
            const probe = probeProvider.getHeightWithInTileKey(geo, null, 15);
            if (probe.altitude === null || probe.tileKey === undefined) {
                return undefined;
            }
            return { altitude: probe.altitude, level: probe.tileKey.level };
        }
        // Fallback for elevation sources without the tile-aware probe: the
        // public getter has no "miss" signal, so a miss reads as 0.
        return { altitude: elevationProvider.getHeight(geo, 15) ?? 0, level: 0 };
    }

    /**
     * Sample the ground on a coarse grid. A `33 x 33` grid over 900 m (28 m
     * spacing) is accurate enough for placing boxes while costing ~1 k DEM
     * lookups instead of one per instance.
     */
    private buildGroundGrid(): IGroundGrid {
        const resolution = 33;
        const samples = new Float32Array(resolution * resolution);
        const half = FIELD_SIZE / 2;
        for (let row = 0; row < resolution; row++) {
            for (let column = 0; column < resolution; column++) {
                const x = -half + (column / (resolution - 1)) * FIELD_SIZE;
                const y = -half + (row / (resolution - 1)) * FIELD_SIZE;
                const height = this.sampleGeoHeight(x, y);
                samples[row * resolution + column] = height ?? this.m_centerHeight;
            }
        }
        return { resolution, samples };
    }

    /** Bilinear lookup into the cached ground grid. */
    private groundHeight(x: number, y: number): number {
        const grid = this.m_ground;
        if (grid === undefined) {
            return this.m_centerHeight;
        }
        const last = grid.resolution - 1;
        const u = THREE.MathUtils.clamp(((x + FIELD_SIZE / 2) / FIELD_SIZE) * last, 0, last);
        const v = THREE.MathUtils.clamp(((y + FIELD_SIZE / 2) / FIELD_SIZE) * last, 0, last);
        const x0 = Math.floor(u);
        const y0 = Math.floor(v);
        const x1 = Math.min(x0 + 1, last);
        const y1 = Math.min(y0 + 1, last);
        const fx = u - x0;
        const fy = v - y0;
        const s = grid.samples;
        const r = grid.resolution;
        const top = THREE.MathUtils.lerp(s[y0 * r + x0], s[y0 * r + x1], fx);
        const bottom = THREE.MathUtils.lerp(s[y1 * r + x0], s[y1 * r + x1], fx);
        return THREE.MathUtils.lerp(top, bottom, fy);
    }

    /**
     * One `InstancedMesh` for the whole city: every box casts and receives
     * shadows, so a single mesh contributes its instances to all four shadow
     * cascades plus the color pass.
     */
    private createCity(count: number): THREE.InstancedMesh {
        // Unit box, re-authored Z-up with the base at z = 0 so instance scale
        // can encode footprint and height directly.
        const geometry = new THREE.BoxGeometry(1, 1, 1);
        geometry.rotateX(Math.PI / 2);
        geometry.translate(0, 0, 0.5);
        const material = new THREE.MeshLambertNodeMaterial({ color: 0xffffff });

        const mesh = new THREE.InstancedMesh(geometry, material, count);
        mesh.castShadow = true;
        mesh.receiveShadow = true;
        // The stress load must always be drawn: skip bounding-sphere culling so
        // a stale bound can never make the load silently disappear.
        mesh.frustumCulled = false;

        const random = new SeededRandom(0x5f3a9c1);
        const slots = this.shuffledSlots(random);
        const matrix = new THREE.Matrix4();
        const position = new THREE.Vector3();
        const rotation = new THREE.Quaternion();
        const scale = new THREE.Vector3();
        const color = new THREE.Color();
        const up = new THREE.Vector3(0, 0, 1);

        for (let index = 0; index < count; index++) {
            const slot = slots[index % slots.length];
            const column = (slot % GRID_CELLS) - (GRID_CELLS - 1) / 2;
            const row = Math.floor(slot / GRID_CELLS) - (GRID_CELLS - 1) / 2;
            const x = column * GRID_SPACING + (random.next() - 0.5) * GRID_SPACING * 0.3;
            const y = row * GRID_SPACING + (random.next() - 0.5) * GRID_SPACING * 0.3;
            const width = 6 + random.next() * (GRID_SPACING - 8);
            const depth = 6 + random.next() * (GRID_SPACING - 8);
            // Squared distribution: mostly low blocks, a few towers.
            const height = 8 + random.next() * random.next() * 70;

            // Instance coordinates are local to the anchor (z = 0 at the anchor
            // altitude), so the terrain altitude must be re-based to it.
            position.set(x, y, this.groundHeight(x, y) - this.m_centerHeight - BUILDING_SINK);
            rotation.setFromAxisAngle(up, random.next() * Math.PI);
            scale.set(width, depth, height);
            matrix.compose(position, rotation, scale);
            mesh.setMatrixAt(index, matrix);

            color.setHSL(
                0.09 + random.next() * 0.05,
                0.12 + random.next() * 0.2,
                0.4 + random.next() * 0.35
            );
            mesh.setColorAt(index, color);
        }

        mesh.instanceMatrix.needsUpdate = true;
        if (mesh.instanceColor !== null) {
            mesh.instanceColor.needsUpdate = true;
        }
        return mesh;
    }

    /** Deterministic Fisher-Yates shuffle of all city grid slots. */
    private shuffledSlots(random: SeededRandom): number[] {
        const slots = Array.from({ length: MAX_BUILDINGS }, (_, index) => index);
        for (let index = slots.length - 1; index > 0; index--) {
            const swap = Math.floor(random.next() * (index + 1));
            const value = slots[index];
            slots[index] = slots[swap];
            slots[swap] = value;
        }
        return slots;
    }

    /**
     * Clone the loaded glTF tree into street intersections: each clone is its
     * own `Object3D` graph, so every copy is a separate draw call in the color
     * pass and in each shadow cascade it intersects.
     */
    private createTrees(count: number): void {
        const template = this.m_treeTemplate;
        if (template === undefined) {
            return;
        }
        const random = new SeededRandom(0x27c4e19);
        const slots = this.shuffledSlots(random);
        for (let index = 0; index < count; index++) {
            const slot = slots[index % slots.length];
            const column = slot % GRID_CELLS;
            const row = Math.floor(slot / GRID_CELLS);
            const x = (column - GRID_CELLS / 2) * GRID_SPACING + (random.next() - 0.5) * 5;
            const y = (row - GRID_CELLS / 2) * GRID_SPACING + (random.next() - 0.5) * 5;

            const clone = template.clone(true);
            clone.scale.setScalar(1.8 + random.next() * 1.4);
            clone.position.set(x, y, this.groundHeight(x, y) - this.m_centerHeight - 0.4);
            clone.rotation.set(0, 0, random.next() * Math.PI * 2);
            this.m_treeGroup.add(clone);
        }
    }

    /** Load, post-process and convert the local glTF tree once. */
    private async loadTreeTemplate(): Promise<THREE.Object3D | undefined> {
        try {
            const gltf = await loadGLTF(TREE_MODEL_URL, GLTFLoader);
            const processed = postProcessGLTF(gltf);
            const { scene } = createThreeSceneFromGLTF(processed);
            scene.traverse(object => {
                const mesh = object as THREE.Mesh;
                if (mesh.isMesh !== true) {
                    return;
                }
                mesh.castShadow = true;
                mesh.receiveShadow = true;
                const material = mesh.material as THREE.Material & { color?: THREE.Color };
                if (material.color !== undefined) {
                    material.color.set(0x4c7a3f);
                }
            });
            return scene;
        } catch (error) {
            logger.warn(
                `could not load ${TREE_MODEL_URL}; falling back to the instanced city only.`,
                error
            );
            return undefined;
        }
    }
}
