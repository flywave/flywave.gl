/* Copyright (C) 2025 flywave.gl contributors */

/**
 * OSM-driven forest layer, ported from f4map's detail generator.
 *
 * ## What came from the reference artifact
 *
 * Everything below is a port of code recovered from the shipped f4map engine
 * bundle `api.js` (sha256 `c20f8d0a…`, REA JavaScript Application Evidence
 * `ev_4897ee30…`). The browserify modules and the symbols taken from them:
 *
 * | Module | Symbol | Role |
 * |---|---|---|
 * | 689 | `_generateForest` | height / species / placement per OSM feature |
 * | 689 | `A` → `sampleShape` | jittered scanline scatter inside a polygon |
 * | 689 | `sampleRings` | fixed-spacing scatter along `tree_row` rings |
 * | 692 | `realTreeType` / `randomTreeType` | OSM tag → species, else latitude rule |
 * | 690 | `buildTrees` | per-species model / texture / LOD wiring |
 * | 690 | `updateItemWithLodVisibility` | the 500 m LOD switch |
 * | 636 | `Random` | the LCG that makes the scatter reproducible |
 * | 805 | `getScaleFromLatitude` | mercator latitude scale correction |
 * | 623 | `ModelDecoder.decodeData` | the `.bis` binary mesh format |
 *
 * The `.bis` models and their diffuse textures are the reference's own assets,
 * fetched from the reference CDN and decoded at runtime.
 *
 * ## Faithfulness notes
 *
 * - The reference packs up to `maxCountPerMesh` copies of a model into one
 *   geometry, rotating each copy with a baked matrix ("mini skinning"). This
 *   layer uses `InstancedMesh` instead, which yields the same picture without
 *   the shader bone-count ceiling that forced the 100-instance limit.
 * - In the analysed build `lodRenderPassToHandle` is `["shadowDepth"]`, so the
 *   far billboard only casts shadows and the colour pass keeps the full model.
 *   That reads as a build-time oversight — distant trees would otherwise
 *   vanish — so here the billboard renders in the colour pass too. This is the
 *   one intentional behavioural deviation.
 */

import { type Feature, GeoCoordinates, type MapView, type Projection } from "@flywave/flywave.gl";
import { type Polygon as TurfPolygon, type Position } from "@turf/turf";
import {
    BufferGeometry,
    Color,
    Float32BufferAttribute,
    DoubleSide,
    Group,
    InstancedMesh,
    Matrix4,
    MeshLambertNodeMaterial,
    Quaternion,
    RepeatWrapping,
    Texture,
    TextureLoader,
    Vector3
} from "three/webgpu";

// ---------------------------------------------------------------------------
// Deterministic RNG — port of engine/utils/Random (module 636)
// ---------------------------------------------------------------------------

/**
 * The reference engine's PRNG: a linear congruential generator with Knuth's
 * constants. Keeping it verbatim is what makes a given OSM way always grow the
 * same trees in the same places, which is why the reference scatter looks
 * stable across reloads.
 */
export class F4Random {
    private m_seed: number;

    constructor(seed = Date.now()) {
        this.m_seed = seed;
    }

    nextInt(): number {
        this.m_seed = (1664525 * this.m_seed + 1013904223) % 4294967296;
        return this.m_seed;
    }

    nextFloat(): number {
        return this.nextInt() / 4294967296;
    }
}

// ---------------------------------------------------------------------------
// `.bis` model decoding — port of ModelDecoder.decodeData (module 623)
// ---------------------------------------------------------------------------

/** Result of decoding one `.bis` file. */
export interface BisGeometry {
    geometry: BufferGeometry;
    /** Header word (`-3` = indexed, `-2` = raw triangle soup). */
    magic: number;
}

/**
 * Decodes one of f4map's `.bis` meshes into a three.js {@link BufferGeometry}.
 *
 * The `-3` flavour stores a 16-bit index block starting at float offset 10 and,
 * when the index count is odd, padded to the next float boundary — the cursor
 * arithmetic below reproduces that packing exactly. `-2` has no index buffer.
 *
 * The models are authored Z-up with the trunk base at z ≈ 0 and the crown at
 * z ≈ `modelHeight`, so no axis fix-up is needed on a flat (mercator) scene.
 */
export async function loadBisGeometry(url: string): Promise<BisGeometry> {
    const response = await fetch(url);
    if (!response.ok) {
        throw new Error(`Failed to load ${url}: HTTP ${response.status}`);
    }
    const buffer = await response.arrayBuffer();
    const floats = new Float32Array(buffer);
    const magic = floats[0];

    const positions: number[] = [];
    const normals: number[] = [];
    const uvs: number[] = [];
    const indices: number[] = [];

    if (magic === -3) {
        const shorts = new Uint16Array(buffer);
        const indexCount = floats[1];
        const vertexCount = floats[2];

        const positionOffset = indexCount % 2 === 1 ? 5 + (indexCount + 1) / 2 : 5 + indexCount / 2;
        const normalOffset = positionOffset + 3 * vertexCount;
        const uvOffset = normalOffset + 3 * vertexCount;

        let shortCursor = 10;
        for (let i = 0; i < indexCount; i++) {
            indices.push(shorts[shortCursor++]);
        }

        let p = positionOffset;
        let n = normalOffset;
        let u = uvOffset;
        for (let i = 0; i < vertexCount; i++) {
            positions.push(floats[p++], floats[p++], floats[p++]);
            normals.push(floats[n++], floats[n++], floats[n++]);
            uvs.push(floats[u++], floats[u++]);
        }
    } else if (magic === -2) {
        const vertexCount = floats[1];
        let p = 4;
        const normalOffset = p + 3 * vertexCount;
        const uvOffset = normalOffset + 3 * vertexCount;

        let n = normalOffset;
        let u = uvOffset;
        for (let i = 0; i < vertexCount; i++) {
            positions.push(floats[p++], floats[p++], floats[p++]);
            normals.push(floats[n++], floats[n++], floats[n++]);
            uvs.push(floats[u++], floats[u++]);
        }
    } else {
        throw new Error(`${url}: unsupported .bis header ${magic}`);
    }

    const geometry = new BufferGeometry();
    geometry.setAttribute("position", new Float32BufferAttribute(positions, 3));
    if (normals.length > 0) {
        geometry.setAttribute("normal", new Float32BufferAttribute(normals, 3));
    }
    if (uvs.length > 0) {
        geometry.setAttribute("uv", new Float32BufferAttribute(uvs, 2));
    }
    if (indices.length > 0) {
        geometry.setIndex(new Float32BufferAttribute(indices, 1));
    }
    geometry.computeBoundingSphere();

    return { geometry, magic };
}

// ---------------------------------------------------------------------------
// Species selection — port of Trees (module 692) and the module 685 defaults
// ---------------------------------------------------------------------------

/** Species keys, matching the reference `subCategories` names verbatim. */
export type TreeSpecies =
    | "deciduous"
    | "coniferous"
    | "palm"
    | "cherry"
    | "pink-cherry"
    | "white-cherry";

/** `DEFAULT_TREE_TYPE` in the reference. */
export const DEFAULT_TREE_TYPE: TreeSpecies = "deciduous";

/** OSM tags the generator reads. */
export interface TreeTags {
    natural?: string;
    landuse?: string;
    wood?: string;
    trees?: string;
    type?: string;
    leaf_type?: string;
    crown_type?: string;
    species?: string;
    taxon?: string;
    genus?: string;
    height?: string;
    min_height?: string;
    [key: string]: string | undefined;
}

/** The four greens the reference tints tree instances with (`module 685`). */
export const TREE_COLORS = ["#75824a", "#7aa768", "#5d8a4c", "#7c7b47"];

/** Radians per degree. */
const DEG_TO_RAD = Math.PI / 180;

/** Earth radius used by the mercator projection. */
const EARTH_RADIUS = 6378137;

/**
 * Web-mercator northings in 900913 metres for a latitude.
 *
 * The reference's bloom-season thresholds and latitude cutoffs are all written
 * against this unit, so the tag-reading helpers need it even though the scene's
 * own world units differ.
 */
function mercatorY900913(latitudeDeg: number): number {
    const phi = latitudeDeg * DEG_TO_RAD;
    return EARTH_RADIUS * Math.log(Math.tan(Math.PI / 4 + phi / 2));
}

/**
 * `getScaleFromLatitude` (module 805).
 *
 * The reference evaluates `cosh(π·y / R)` on a 900913 northing, which is
 * identically `sec(latitude)`. Working from the latitude directly keeps the
 * factor correct whatever world units the projection uses.
 */
function latitudeScale(latitudeDeg: number): number {
    const cos = Math.cos(latitudeDeg * DEG_TO_RAD);
    // Mercator's northings run to infinity at the poles; clamp before inverting.
    return cos < 0.01 ? 100 : 1 / cos;
}

/**
 * Blossom-season test (`a` in module 692): decides whether a flowering cherry
 * shows blooms or plain leaves, from the feature's latitude and the current
 * month.
 */
function isBloomSeason(latitudeDeg: number, date: Date): boolean {
    const mercatorY = mercatorY900913(latitudeDeg);
    if (mercatorY > 7361866) {
        return false;
    }
    let peakMonth: number;
    if (mercatorY > 3503549) {
        peakMonth = (4 * (mercatorY - 3503549)) / 2942726;
    } else {
        if (mercatorY > -2273030) {
            return true;
        }
        if (!(mercatorY < -6446275)) {
            return false;
        }
        peakMonth = -6 * mercatorY - 13638175 / 4173245;
    }
    return Math.abs(date.getMonth() - Math.ceil(peakMonth)) <= 1;
}

/**
 * `realTreeType`: derive the species from OSM tagging. Returns `null` when the
 * tags say nothing, in which case the caller falls back to
 * {@link randomTreeType}.
 */
export function realTreeType(tags: TreeTags, latitudeDeg: number, date: Date): TreeSpecies | null {
    if (tags["xmas:feature"] === "tree") {
        return "coniferous";
    }

    const scientific = [tags.species, tags.taxon, tags.genus].filter(Boolean).join(" ");
    if (/prunus (japonica|serrulata|prostrata)/i.test(scientific)) {
        return isBloomSeason(latitudeDeg, date) ? "pink-cherry" : "cherry";
    }
    if (/prunus (cerasus|avium|padus|serotina|mahaleb|virginiana)/i.test(scientific)) {
        return isBloomSeason(latitudeDeg, date) ? "white-cherry" : "cherry";
    }

    if (tags.crown_type) {
        if (tags.crown_type === "I") {
            return "palm";
        }
        if (tags.crown_type === "A" || tags.crown_type === "B") {
            return "deciduous";
        }
        if (tags.crown_type === "H") {
            return "coniferous";
        }
    }

    if (tags.type) {
        if (tags.type === "broad_leaved" || tags.type === "deciduous") {
            return "deciduous";
        }
        if (tags.type === "conifer" || tags.type === "coniferous") {
            return "coniferous";
        }
        if (tags.type === "palm") {
            return "palm";
        }
    }

    if (tags.wood) {
        if (tags.wood === "deciduous" || tags.wood === "coniferous" || tags.wood === "palm") {
            return tags.wood;
        }
    } else {
        if (tags.trees === "coniferous") {
            return "coniferous";
        }
        const palmish =
            (tags.trees?.includes("palm") ?? false) ||
            (tags.species?.includes("palm") ?? false) ||
            /Arecaceae|Areca|Palmae/i.test(scientific);
        if (palmish) {
            return "palm";
        }
    }

    if (tags.leaf_type) {
        if (tags.leaf_type === "needleleaved") {
            return "coniferous";
        }
        if (tags.leaf_type === "broadleaved") {
            return "deciduous";
        }
    }

    if (tags.landuse === "orchard") {
        return "deciduous";
    }

    return null;
}

/**
 * `randomTreeType`: when OSM says nothing, pick a species from latitude. The
 * reference biases toward conifers above 45° and palms below 44°; at 34.9°N
 * that means roughly one palm in five, which is the reference's behaviour
 * rather than a judgement about where palms grow.
 */
export function randomTreeType(latitudeDeg: number, rng: F4Random): TreeSpecies {
    const latitude = Math.abs(latitudeDeg);
    if (latitude > 45) {
        if (latitude > 70) {
            return "coniferous";
        }
        if (rng.nextFloat() < (latitude - 45) / 25) {
            return "coniferous";
        }
    }
    if (latitude < 44) {
        if (latitude < 0) {
            return "palm";
        }
        if (rng.nextFloat() < (44 - latitude) / 44) {
            return "palm";
        }
    }
    return DEFAULT_TREE_TYPE;
}

/** `getSingleTreeType`: OSM tags win, latitude is the fallback. */
export function getSingleTreeType(
    tags: TreeTags,
    latitudeDeg: number,
    date: Date,
    rng: F4Random
): TreeSpecies {
    return realTreeType(tags, latitudeDeg, date) ?? randomTreeType(latitudeDeg, rng);
}

// ---------------------------------------------------------------------------
// Scatter helpers — port of ShapeUtils.sampleShape / sampleRings (module 638)
// ---------------------------------------------------------------------------

interface SampleRange {
    min: number;
    max: number;
}

/** Spacing for a plain forest polygon: x 10–20 m, y 5–10 m. */
const FOREST_SPACING = {
    x: { min: 10, max: 20 },
    y: { min: 5, max: 10 }
};

/** Spacing for an orchard: a regular 10 × 10 m grid. */
const ORCHARD_SPACING = {
    x: { min: 10, max: 10 },
    y: { min: 10, max: 10 }
};

/**
 * Edge length in world units of the grid cells instances are bucketed into.
 *
 * The reference groups instances per tile and keeps a bounding sphere per
 * group, which is what makes its LOD test meaningful; a chunk spanning the
 * whole data set would have a near point that says nothing about any tree in
 * it. One kilometre keeps each cell's bounding sphere comparable to the 500 m
 * LOD distance.
 */
const CHUNK_EXTENT = 1000;

/**
 * Scanline crossings of a horizontal line at `y` with the rings, sorted by x.
 *
 * The reference `intersectShapeAlong("x", …)` walks every edge and keeps the
 * crossings lying ahead along +x; a plain even-odd scanline over the same edges
 * yields the same sorted list for the simple polygons OSM produces, and handles
 * holes when they arrive as extra rings.
 */
function crossingsAtY(rings: number[][][], y: number): number[] {
    const xs: number[] = [];
    for (const ring of rings) {
        const count = ring.length;
        for (let i = 0; i < count; i++) {
            const ax = ring[i][0];
            const ay = ring[i][1];
            const bx = ring[(i + 1) % count][0];
            const by = ring[(i + 1) % count][1];
            if (ay === by) {
                continue;
            }
            const low = Math.min(ay, by);
            const high = Math.max(ay, by);
            if (y <= low || y >= high) {
                continue;
            }
            xs.push(ax + ((y - ay) / (by - ay)) * (bx - ax));
        }
    }
    return xs.sort((a, b) => a - b);
}

/**
 * `sampleShape`: a jittered scanline scatter.
 *
 * Rows advance from `minY` in steps of `lerp(ySampling)`, and within each row
 * points advance along every polygon span in steps of `lerp(xSampling)` with a
 * random initial offset. `gridMode` (the reference's `addEndPoints`) drops that
 * offset, turning the jittered scatter into the regular grid used for orchards.
 */
export function sampleShape(
    rings: number[][][],
    bounds: { minX: number; maxX: number; minY: number; maxY: number },
    xSampling: SampleRange,
    ySampling: SampleRange,
    gridMode: boolean,
    rng: F4Random,
    emit: (x: number, y: number) => void
): void {
    const stepX = () => xSampling.min + (xSampling.max - xSampling.min) * rng.nextFloat();
    const stepY = () => ySampling.min + (ySampling.max - ySampling.min) * rng.nextFloat();

    for (let y = bounds.minY + ySampling.min * rng.nextFloat(); y < bounds.maxY; ) {
        const xs = crossingsAtY(rings, y);
        // Spans come in crossing pairs. Pairing them left-to-right keeps trees
        // inside the polygon where the reference's end-popping could walk a
        // gap between two spans; every other behaviour matches.
        for (let i = 0; i + 1 < xs.length; i += 2) {
            const spanStart = xs[i];
            const spanLength = xs[i + 1] - xs[i];
            let travelled = gridMode ? 0 : xSampling.min * rng.nextFloat();
            let x = spanStart + travelled;
            while (travelled < spanLength) {
                if (x >= bounds.minX && x <= bounds.maxX) {
                    emit(x, y);
                }
                const step = stepX();
                travelled += step;
                x += step;
            }
        }
        y += stepY();
    }
}

/**
 * `sampleRings`: fixed-spacing scatter along closed rings, used for
 * `natural=tree_row`.
 */
export function sampleRings(
    rings: number[][][],
    sampling: number,
    emit: (x: number, y: number) => void
): void {
    for (const ring of rings) {
        const count = ring.length;
        for (let i = 0; i < count; i++) {
            const ax = ring[i][0];
            const ay = ring[i][1];
            const bx = ring[(i + 1) % count][0];
            const by = ring[(i + 1) % count][1];
            const dx = bx - ax;
            const dy = by - ay;
            const length = Math.hypot(dx, dy);
            if (length === 0) {
                continue;
            }
            const steps = Math.max(1, Math.floor(length / sampling));
            const stepLength = length / steps;
            const nx = dx / length;
            const ny = dy / length;
            emit(ax, ay);
            for (let s = 1; s < steps; s++) {
                emit(ax + nx * stepLength * s, ay + ny * stepLength * s);
            }
        }
    }
}

// ---------------------------------------------------------------------------
// Assets and options
// ---------------------------------------------------------------------------

/**
 * Per-species asset table, mirroring `p()` in module 690. `modelHeight` /
 * `minRandomHeight` / `maxRandomHeight` come from the tree defaults
 * (10 / 10 / 12 m) except for cherries, which the reference overrides to
 * 5 / 6 / 15 m in module 685.
 */
interface SpeciesAssets {
    model: string;
    texture: string;
    lodModel?: string;
    modelHeight: number;
    minRandomHeight: number;
    maxRandomHeight: number;
}

const SPECIES_ASSETS: Record<TreeSpecies, SpeciesAssets> = {
    deciduous: {
        model: "LibOut_Deciduous_00.bis",
        texture: "LibOut_Deciduous_00.png",
        lodModel: "LibOut_Deciduous_LOD.bis",
        modelHeight: 10,
        minRandomHeight: 10,
        maxRandomHeight: 12
    },
    coniferous: {
        model: "LibOut_Conifer_00.bis",
        texture: "LibOut_Conifer_00.png",
        lodModel: "LibOut_Conifer_LOD.bis",
        modelHeight: 10,
        minRandomHeight: 10,
        maxRandomHeight: 12
    },
    palm: {
        model: "LibOut_Palm_00.bis",
        texture: "LibOut_Palm_00.png",
        lodModel: "LibOut_Palm_LOD.bis",
        modelHeight: 10,
        minRandomHeight: 10,
        maxRandomHeight: 12
    },
    cherry: {
        model: "LibOut_CherryTree.bis",
        texture: "LibOut_CherryTree_Leaves.png",
        modelHeight: 5,
        minRandomHeight: 6,
        maxRandomHeight: 15
    },
    "pink-cherry": {
        model: "LibOut_CherryTree.bis",
        texture: "LibOut_CherryTree_Flowers.png",
        modelHeight: 5,
        minRandomHeight: 6,
        maxRandomHeight: 15
    },
    "white-cherry": {
        model: "LibOut_CherryTree.bis",
        texture: "LibOut_CherryTree_WhiteFlowers.png",
        modelHeight: 5,
        minRandomHeight: 6,
        maxRandomHeight: 15
    }
};

/** Species the layer is willing to instantiate. */
const SUPPORTED_SPECIES: TreeSpecies[] = [
    "deciduous",
    "coniferous",
    "palm",
    "cherry",
    "pink-cherry",
    "white-cherry"
];

export interface ForestLayerOptions {
    /** URL of a GeoJSON `FeatureCollection` of forest / wood polygons. */
    geojsonUrl: string;
    /** Base URL for the `.bis` models, e.g. `f4/models/`. */
    modelsBaseUrl: string;
    /** Base URL for the diffuse textures, e.g. `f4/textures/`. */
    texturesBaseUrl: string;
    /**
     * Instances packed into one `InstancedMesh`.
     *
     * The reference clamps this to 100 (`Math.min(x, 100)` in module 690)
     * because it bakes copies into one skinned geometry and is bounded by the
     * shader's bone count. `InstancedMesh` has no such ceiling, so the default
     * here is larger and the reference value is still accepted.
     * @default 2000
     */
    maxCountPerMesh?: number;
    /**
     * Camera distance in world units beyond which a chunk switches to its
     * billboard. The reference value is `details.lodDistance = 500`.
     * @default 500
     */
    lodDistance?: number;
    /** Exclude trees inside these polygons, in degrees (ring closure implied). */
    exclusionRings?: number[][][];
    /** Multiplier on the reference sampling spacing. Lower = denser. @default 1 */
    spacingScale?: number;
}

/** One generated tree instance, in world coordinates. */
interface TreeInstance {
    x: number;
    y: number;
    z: number;
    scale: number;
    rotation: number;
    species: TreeSpecies;
    color: Color;
}

/** Per-chunk record driving the LOD switch. */
interface ForestChunk {
    near: InstancedMesh;
    far: InstancedMesh | null;
    center: Vector3;
    radius: number;
}

function pointInRing(x: number, y: number, ring: number[][]): boolean {
    let inside = false;
    const count = ring.length;
    for (let i = 0, j = count - 1; i < count; j = i++) {
        const xi = ring[i][0];
        const yi = ring[i][1];
        const xj = ring[j][0];
        const yj = ring[j][1];
        if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) {
            inside = !inside;
        }
    }
    return inside;
}

/**
 * A forest built from OSM polygons, rendered as instanced tree meshes with a
 * distance-driven billboard LOD.
 *
 * The layer is a {@link Group}; add it to `mapView.mapAnchors` so it survives
 * the per-frame scene rebuild (the scene root is cleared every frame — see the
 * `MapView.render` contract).
 */
export class ForestLayer extends Group {
    private readonly m_projection: Projection;
    private readonly m_chunks: ForestChunk[] = [];
    private m_lodDistance = 500;
    private m_disposed = false;

    /**
     * World position of the anchor this layer's children are relative to.
     *
     * `MapAnchors.update` places a group at `world - cameraPosition` every
     * frame (the relative-to-eye convention), so instance transforms must be
     * stored relative to the anchor rather than in absolute world space.
     */
    private readonly m_anchorWorld = new Vector3();

    /** Number of generated tree instances, for the info panel. */
    private m_instanceCount = 0;

    private constructor(projection: Projection) {
        super();
        this.m_projection = projection;
    }

    /**
     * Builds the layer: loads the `.bis` models and textures, scatters trees
     * over every polygon with the reference algorithm, then packs the result
     * into instanced meshes.
     */
    static async create(mapView: MapView, options: ForestLayerOptions): Promise<ForestLayer> {
        const layer = new ForestLayer(mapView.projection);
        await layer.build(options);
        return layer;
    }

    /** Number of tree instances in the layer. */
    get instanceCount(): number {
        return this.m_instanceCount;
    }

    /** Per-chunk records, exposed for the debug overlay. */
    get chunks(): readonly ForestChunk[] {
        return this.m_chunks;
    }

    /**
     * Applies the reference LOD rule (`updateItemWithLodVisibility`, module
     * 690) to every chunk.
     *
     * The rule tests the chunk's *near point* — the point on its bounding
     * sphere facing the camera — rather than its centre, and leaves a chunk on
     * the full model when its near point falls behind the camera.
     */
    updateLod(cameraPosition: Vector3, viewDirection: Vector3): void {
        for (const chunk of this.m_chunks) {
            // Chunk centres are stored anchor-relative; add the anchor back to
            // compare against the world-space camera position.
            const center = chunk.center.clone().add(this.m_anchorWorld);
            const toChunk = center.clone().sub(cameraPosition);
            const distance = toChunk.length();
            if (distance === 0) {
                continue;
            }
            const nearPoint = center.clone().sub(toChunk.normalize().multiplyScalar(chunk.radius));
            const facing = viewDirection.dot(nearPoint.clone().sub(cameraPosition));
            const useLod = facing > 0 && cameraPosition.distanceTo(nearPoint) > this.m_lodDistance;
            chunk.near.visible = !useLod;
            if (chunk.far) {
                chunk.far.visible = useLod;
            }
        }
    }

    dispose(): void {
        if (this.m_disposed) {
            return;
        }
        this.m_disposed = true;
        for (const chunk of this.m_chunks) {
            chunk.near.dispose();
            if (chunk.far) {
                chunk.far.dispose();
            }
        }
        this.m_chunks.length = 0;
        this.clear();
    }

    // -----------------------------------------------------------------------
    // Construction
    // -----------------------------------------------------------------------

    private async build(options: ForestLayerOptions): Promise<void> {
        this.m_lodDistance = options.lodDistance ?? 500;
        const maxCountPerMesh = options.maxCountPerMesh ?? 2000;
        const spacingScale = options.spacingScale ?? 1;

        const features = await loadForestFeatures(options.geojsonUrl);
        if (features.length === 0) {
            throw new Error("Forest GeoJSON contains no features");
        }

        // Load every species asset once; each model is reused by every chunk.
        const nearGeometry = new Map<TreeSpecies, BufferGeometry>();
        const farGeometry = new Map<TreeSpecies, BufferGeometry>();
        const diffuseTexture = new Map<TreeSpecies, Texture>();
        // Cherries share the LOD atlas: the reference only overrides it for
        // species that ship a dedicated billboard.
        const lodAtlas = await loadTexture(`${options.texturesBaseUrl}LibOut_Tree_LOD.png`);

        for (const species of SUPPORTED_SPECIES) {
            const assets = SPECIES_ASSETS[species];
            const { geometry } = await loadBisGeometry(`${options.modelsBaseUrl}${assets.model}`);
            nearGeometry.set(species, geometry);

            const lodUrl = assets.lodModel ?? assets.model;
            const { geometry: lod } = await loadBisGeometry(`${options.modelsBaseUrl}${lodUrl}`);
            farGeometry.set(species, lod);

            diffuseTexture.set(
                species,
                await loadTexture(`${options.texturesBaseUrl}${assets.texture}`)
            );
        }

        const nearMaterial = new Map<TreeSpecies, MeshLambertNodeMaterial>();
        const farMaterial = new Map<TreeSpecies, MeshLambertNodeMaterial>();
        for (const species of SUPPORTED_SPECIES) {
            nearMaterial.set(species, makeTreeMaterial(diffuseTexture.get(species)!));
            // Every billboard samples the shared atlas; the per-species UV rect
            // is baked into the LOD model.
            farMaterial.set(species, makeTreeMaterial(lodAtlas));
        }

        const date = new Date();
        // Project every polygon once, then pick the anchor as the centroid of
        // all vertices. Instance transforms are stored relative to it because
        // `MapAnchors.update` repositions the group each frame.
        const projected: { feature: Feature; tags: TreeTags; rings: number[][][] }[] = [];
        for (const feature of features) {
            const tags = (feature.properties ?? {}) as TreeTags;
            const rings = projectRings(this.m_projection, feature);
            if (rings.length === 0) {
                continue;
            }
            projected.push({ feature, tags, rings });
        }
        if (projected.length === 0) {
            throw new Error("Forest GeoJSON produced no projectable polygons");
        }

        let anchorX = 0;
        let anchorY = 0;
        let vertexCount = 0;
        for (const { rings } of projected) {
            for (const ring of rings) {
                for (const [x, y] of ring) {
                    anchorX += x;
                    anchorY += y;
                    vertexCount++;
                }
            }
        }
        this.m_anchorWorld.set(anchorX / vertexCount, anchorY / vertexCount, 0);
        const anchorGeo = this.m_projection.unprojectPoint(this.m_anchorWorld);
        this.anchor = new GeoCoordinates(anchorGeo.latitude, anchorGeo.longitude, 0);

        const instances: TreeInstance[] = [];
        const exclusionRings = options.exclusionRings ?? [];

        for (const { feature, tags, rings: ringsWorld } of projected) {
            const bounds = ringBounds(ringsWorld);
            // The reference works in mercator northings; recover the feature's
            // latitude from the projection so the tag readers and the latitude
            // scale correction both see real degrees.
            const midGeo = this.m_projection.unprojectPoint(
                new Vector3((bounds.minX + bounds.maxX) / 2, bounds.midY, 0)
            );
            const latitude = midGeo.latitude;
            const latScale = latitudeScale(latitude);

            // The reference keys the scatter RNG off the feature's own world
            // position (`new Random(position.x + position.y)`), so the same OSM
            // way always grows the same trees.
            const scatterRng = new F4Random(Math.round(ringsWorld[0][0][0] + ringsWorld[0][0][1]));
            // `_generateForest` seeds a second RNG from the feature id for the
            // height draw and the per-tree species choice.
            const treeRng = new F4Random(featureHash(feature));

            const scaleConfig =
                SPECIES_ASSETS[realTreeType(tags, latitude, date) ?? DEFAULT_TREE_TYPE];
            const scale = resolveScale(tags, scaleConfig, treeRng) * latScale;
            const minZ = (parseFloat(tags.min_height ?? "0") || 0) * latScale;

            const emit = (x: number, y: number): void => {
                if (exclusionRings.some(ring => pointInRing(x, y, ring))) {
                    return;
                }
                const species = getSingleTreeType(tags, latitude, date, treeRng);
                instances.push({
                    x: x - this.m_anchorWorld.x,
                    y: y - this.m_anchorWorld.y,
                    z: minZ,
                    scale,
                    // The reference draws one rotation per baked instance from
                    // a fresh RNG seeded with the pack size, so every pack of
                    // the same capacity shares a rotation sequence.
                    rotation: treeRng.nextFloat() * Math.PI * 2,
                    species,
                    color: new Color(
                        TREE_COLORS[Math.floor(treeRng.nextFloat() * TREE_COLORS.length)]
                    )
                });
            };

            if (tags.natural === "tree_row") {
                sampleRings(ringsWorld, 10 * latScale, emit);
            } else if (tags.landuse === "orchard") {
                sampleShape(
                    ringsWorld,
                    bounds,
                    scaleRange(ORCHARD_SPACING.x, latScale * spacingScale),
                    scaleRange(ORCHARD_SPACING.y, latScale * spacingScale),
                    true,
                    scatterRng,
                    emit
                );
            } else {
                sampleShape(
                    ringsWorld,
                    bounds,
                    scaleRange(FOREST_SPACING.x, latScale * spacingScale),
                    scaleRange(FOREST_SPACING.y, latScale * spacingScale),
                    false,
                    scatterRng,
                    emit
                );
            }
        }

        this.m_instanceCount = instances.length;
        this.buildChunks(
            instances,
            nearGeometry,
            farGeometry,
            nearMaterial,
            farMaterial,
            maxCountPerMesh
        );
    }

    private buildChunks(
        instances: TreeInstance[],
        nearGeometry: Map<TreeSpecies, BufferGeometry>,
        farGeometry: Map<TreeSpecies, BufferGeometry>,
        nearMaterial: Map<TreeSpecies, MeshLambertNodeMaterial>,
        farMaterial: Map<TreeSpecies, MeshLambertNodeMaterial>,
        maxCountPerMesh: number
    ): void {
        // The reference groups instances per *tile* and keeps a bounding sphere
        // per group, which is what makes its LOD test meaningful. Bucketing by
        // a spatial grid as well as by species reproduces that: without it a
        // chunk can span the whole data set and its near point is useless.
        const byCell = new Map<string, TreeInstance[]>();
        for (const instance of instances) {
            const cellX = Math.floor(instance.x / CHUNK_EXTENT);
            const cellY = Math.floor(instance.y / CHUNK_EXTENT);
            const key = `${instance.species}|${cellX}|${cellY}`;
            const bucket = byCell.get(key);
            if (bucket) {
                bucket.push(instance);
            } else {
                byCell.set(key, [instance]);
            }
        }

        const matrix = new Matrix4();
        const position = new Vector3();
        const rotation = new Quaternion();
        const scaleVector = new Vector3();
        const upAxis = new Vector3(0, 0, 1);

        for (const [key, list] of byCell) {
            const species = key.split("|")[0] as TreeSpecies;
            for (let offset = 0; offset < list.length; offset += maxCountPerMesh) {
                const slice = list.slice(offset, offset + maxCountPerMesh);
                const bounds = instanceBounds(slice);

                const near = new InstancedMesh(
                    nearGeometry.get(species)!,
                    nearMaterial.get(species)!,
                    slice.length
                );
                for (let i = 0; i < slice.length; i++) {
                    const tree = slice[i];
                    position.set(tree.x, tree.y, tree.z);
                    rotation.setFromAxisAngle(upAxis, tree.rotation);
                    scaleVector.setScalar(tree.scale);
                    matrix.compose(position, rotation, scaleVector);
                    near.setMatrixAt(i, matrix);
                    near.setColorAt(i, tree.color);
                }
                near.instanceMatrix.needsUpdate = true;
                if (near.instanceColor) {
                    near.instanceColor.needsUpdate = true;
                }
                near.frustumCulled = false;
                this.add(near);

                // The billboard LOD reuses the same transforms and colours.
                let far: InstancedMesh | null = null;
                const lodGeometry = farGeometry.get(species);
                if (lodGeometry) {
                    far = new InstancedMesh(lodGeometry, farMaterial.get(species)!, slice.length);
                    for (let i = 0; i < slice.length; i++) {
                        near.getMatrixAt(i, matrix);
                        far.setMatrixAt(i, matrix);
                        far.setColorAt(i, slice[i].color);
                    }
                    far.instanceMatrix.needsUpdate = true;
                    if (far.instanceColor) {
                        far.instanceColor.needsUpdate = true;
                    }
                    far.frustumCulled = false;
                    far.visible = false;
                    this.add(far);
                }

                this.m_chunks.push({
                    near,
                    far,
                    center: new Vector3(
                        (bounds.minX + bounds.maxX) / 2,
                        (bounds.minY + bounds.maxY) / 2,
                        5
                    ),
                    radius: Math.hypot(bounds.maxX - bounds.minX, bounds.maxY - bounds.minY) / 2 + 1
                });
            }
        }
    }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function loadTexture(url: string): Promise<Texture> {
    const texture = await new TextureLoader().loadAsync(url);
    // f4map uploads textures with UNPACK_FLIP_Y_WEBGL disabled, so its UVs are
    // authored with v = 0 at the top of the image. Three.js flips by default.
    texture.flipY = false;
    texture.wrapS = RepeatWrapping;
    texture.wrapT = RepeatWrapping;
    texture.needsUpdate = true;
    return texture;
}

function makeTreeMaterial(map: Texture): MeshLambertNodeMaterial {
    return new MeshLambertNodeMaterial({
        map,
        // The reference uses `transparent = Mask` (alpha test), not blending.
        alphaTest: 0.5,
        side: DoubleSide
    });
}

function scaleRange(range: SampleRange, factor: number): SampleRange {
    return { min: range.min * factor, max: range.max * factor };
}

async function loadForestFeatures(url: string): Promise<Feature[]> {
    const response = await fetch(url);
    if (!response.ok) {
        throw new Error(`Failed to load forest polygons from ${url}: HTTP ${response.status}`);
    }
    const data = (await response.json()) as
        | Feature[]
        | { type: "FeatureCollection"; features: Feature[] };
    return Array.isArray(data) ? data : data.features;
}

/**
 * Projects a polygon's rings into world coordinates.
 *
 * Every vertex is projected individually rather than transforming the ring by a
 * single frame, so the scatter stays correct wherever the projection puts it.
 */
function projectRings(projection: Projection, feature: Feature): number[][][] {
    const {
        geometry: { coordinates }
    } = feature as { geometry: TurfPolygon };
    if (!coordinates || coordinates.length === 0) {
        return [];
    }

    const target = new Vector3();
    const rings: number[][][] = [];
    for (const ring of coordinates as Position[][]) {
        if (ring.length < 3) {
            continue;
        }
        const projected: number[][] = [];
        for (const vertex of ring) {
            projection.projectPoint(new GeoCoordinates(vertex[1], vertex[0], 0), target);
            projected.push([target.x, target.y]);
        }
        rings.push(projected);
    }
    return rings;
}

interface Bounds {
    minX: number;
    maxX: number;
    minY: number;
    maxY: number;
    midY: number;
}

function ringBounds(rings: number[][][]): Bounds {
    let minX = Infinity;
    let maxX = -Infinity;
    let minY = Infinity;
    let maxY = -Infinity;
    for (const ring of rings) {
        for (const [x, y] of ring) {
            if (x < minX) minX = x;
            if (x > maxX) maxX = x;
            if (y < minY) minY = y;
            if (y > maxY) maxY = y;
        }
    }
    return { minX, maxX, minY, maxY, midY: (minY + maxY) / 2 };
}

function instanceBounds(list: TreeInstance[]): Bounds {
    let minX = Infinity;
    let maxX = -Infinity;
    let minY = Infinity;
    let maxY = -Infinity;
    for (const tree of list) {
        if (tree.x < minX) minX = tree.x;
        if (tree.x > maxX) maxX = tree.x;
        if (tree.y < minY) minY = tree.y;
        if (tree.y > maxY) maxY = tree.y;
    }
    return { minX, maxX, minY, maxY, midY: (minY + maxY) / 2 };
}

/**
 * `_generateForest`'s height draw: the `height` tag wins, otherwise a uniform
 * draw between `minRandomHeight` and `maxRandomHeight`, expressed as a scale
 * relative to the authored model height.
 */
function resolveScale(tags: TreeTags, assets: SpeciesAssets, rng: F4Random): number {
    const explicit = parseFloat(tags.height ?? "");
    if (Number.isFinite(explicit) && explicit > 0) {
        const min = parseFloat(tags.min_height ?? "0") || 0;
        const height = explicit > min ? explicit - min : explicit;
        return height / assets.modelHeight;
    }
    const height =
        assets.minRandomHeight +
        (assets.maxRandomHeight - assets.minRandomHeight) * rng.nextFloat();
    return height / assets.modelHeight;
}

/** Stable seed standing in for the reference's `osm_id` feature seed. */
function featureHash(feature: Feature): number {
    const id = (feature as { id?: number | string }).id;
    if (typeof id === "number") {
        return id;
    }
    if (typeof id === "string" && id.length > 0) {
        let hash = 0;
        for (let i = 0; i < id.length; i++) {
            hash = (hash * 31 + id.charCodeAt(i)) % 4294967296;
        }
        return hash;
    }
    return 1;
}
