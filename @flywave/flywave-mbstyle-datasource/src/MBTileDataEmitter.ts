import {
    DecodedTile,
    Geometry,
    IndexedTechnique,
    BufferAttribute,
    BufferElementType,
    Group,
    GeometryType,
    AttributeMap,
    InterleavedBufferAttribute,
    TextGeometry,
    TextPathGeometry,
    PoiGeometry,
} from '@flywave/flywave-datasource-protocol';
import { TileKey, webMercatorProjection } from '@flywave/flywave-geoutils';
import * as THREE from 'three';

import { EvaluatedLayer } from './MBLayerEvaluator';
import { MBExpressionEngine, MBExpressionContext } from './MBExpressionEngine';
import { ILineGeometry, IPolygonGeometry } from '@flywave/flywave-vectortile-datasource/IGeometryProcessor';
import { DecodeInfo } from '@flywave/flywave-vectortile-datasource/DecodeInfo';
import { createLineGeometry, LineGroup } from '@flywave/flywave-lines';
import { resolveTextField, applyTextTransform, shapeText, shapeRTLText } from './TextShaping';
import { getLineAnchors, getLineCenterAnchor, LineAnchor as LineAnchorT } from './LineAnchor';

/** Cumulative length of a polyline. */
function polyLength(pts: THREE.Vector2[]): number {
    let len = 0;
    for (let i = 1; i < pts.length; i++) len += pts[i].distanceTo(pts[i - 1]);
    return len;
}

/** Sub-polyline over arc distances [dmin, dmax] (with interpolation at ends). */
function cropPolyline(pts: THREE.Vector2[], dmin: number, dmax: number): THREE.Vector2[] {
    if (dmax <= dmin || pts.length < 2) return [];
    const out: THREE.Vector2[] = [];
    let dist = 0;
    for (let i = 1; i < pts.length && dist <= dmax; i++) {
        const a = pts[i - 1];
        const b = pts[i];
        const seg = a.distanceTo(b);
        const segEnd = dist + seg;
        if (segEnd >= dmin && dist <= dmax) {
            const t0 = Math.max(0, (dmin - dist) / seg);
            const t1 = Math.min(1, (dmax - dist) / seg);
            const p0 = new THREE.Vector2(a.x + (b.x - a.x) * t0, a.y + (b.y - a.y) * t0);
            const p1 = new THREE.Vector2(a.x + (b.x - a.x) * t1, a.y + (b.y - a.y) * t1);
            if (!out.length) out.push(p0);
            out.push(p1);
        }
        dist = segEnd;
    }
    return out;
}
import { EarthConstants } from '@flywave/flywave-geoutils';

// Use earcut for proper polygon triangulation (concave + holes)
import earcut from 'earcut';

interface AccumulatedGeometry {
    positions: number[];
    indices: number[];
    /** Per-vertex extrusion axis (vec4) for extruded-polygon techniques. */
    extrusionAxis: number[];
    /** Tile-normalized UVs (raster / hillshade texture fills). */
    uvs: number[];
    /**
     * Per-vertex line-ribbon edge coordinate (-1/+1): the patcher turns it
     * into the mapbox-style ~1px alpha feather at the ribbon edge. Only
     * ribbon geometries fill this.
     */
    edge?: number[];
    /**
     * Per-vertex normalized line distance (0..1 along the feature) for
     * `line-gradient` ramp sampling on ribbons. Only ribbon geometries fill
     * this.
     */
    dist?: number[];
    /**
     * Per-vertex ABSOLUTE line distance (world meters along the feature) for
     * `line-pattern` tiling on ribbons (u = len / patternWorldWidth).
     */
    len?: number[];
    /**
     * Per-vertex `line-offset` displacement vector (vec2, world units).
     * mgl applies line-offset in the VERTEX SHADER (`offset2 = offset *
     * a_extrude * EXTRUDE_SCALE * normal.y * mat2(t,-u,u,t)`, added to the
     * tile position before projection) — a screen/tile-space uniform
     * displacement that is INVISIBLE to tile clipping and culling. Our former
     * geometric bake displaced positions outside the tile's clip volume,
     * truncating offsets >~20px at tile boundaries (known-gap, §12.33). The
     * vector now rides an attribute and the ribbon patcher adds it to
     * `transformed.xy` after culling. Kept in lockstep with `edge` (vec2 per
     * vertex; zero when the feature has no offset).
     */
    offs?: number[];
    /** Line-segment indices for the extruded-polygon edge (roof outline). */
    edgeIndex: number[];
    edgeFeatureStarts: number[];
    groups: Array<{ start: number; count: number; materialIndex: number; sortKey?: number }>;
    featureStarts: number[];
    objInfos: AttributeMap[];
}

const tmpV3 = new THREE.Vector3();

/**
 * Parse `["interpolate", …, ["line-progress"], t1, v1, …]` (also through the
 * compiler's `["memo", …]` wrapper / serialized object form) into [[t, v], …]
 * numeric stops. Returns undefined when the expression is not a
 * line-progress interpolate.
 */
function parseProgressStopsStatic(raw: any): Array<[number, number]> | undefined {
    if (!raw) return undefined;
    if (!Array.isArray(raw) && typeof raw === 'object') {
        try { raw = JSON.parse(JSON.stringify(raw)); } catch { return undefined; }
    }
    while (Array.isArray(raw) && raw[0] === 'memo') raw = raw[1];
    if (!Array.isArray(raw) || raw[0] !== 'interpolate') return undefined;
    // mgl interpolate form: [op, interpolation, input, t1, v1, …] — the
    // input is raw[2] (e.g. ["line-progress"]); raw[1] is ["linear"]. The
    // old check inspected raw[1] only, silently disabling the whole
    // variable-width path for every standard fixture (§146).
    const isProgress = (Array.isArray(raw[1]) && JSON.stringify(raw[1]).includes('line-progress')) ||
        (Array.isArray(raw[2]) && JSON.stringify(raw[2]).includes('line-progress'));
    if (!isProgress) return undefined;
    const stops: Array<[number, number]> = [];
    for (let i = 3; i + 1 < raw.length; i += 2) {
        const t = Number(raw[i]);
        const v = Number(raw[i + 1]);
        if (Number.isFinite(t) && Number.isFinite(v)) stops.push([t, v]);
    }
    return stops.length > 1 ? stops : undefined;
}

/** Linear interpolation over sorted [[t, v], …] stops. */
function interpProgressStops(stops: Array<[number, number]>, t: number): number {
    if (t <= stops[0][0]) return stops[0][1];
    if (t >= stops[stops.length - 1][0]) return stops[stops.length - 1][1];
    for (let i = 0; i < stops.length - 1; i++) {
        if (t >= stops[i][0] && t <= stops[i + 1][0]) {
            const f = (t - stops[i][0]) / Math.max(stops[i + 1][0] - stops[i][0], 1e-9);
            return stops[i][1] + (stops[i + 1][1] - stops[i][1]) * f;
        }
    }
    return stops[stops.length - 1][1];
}

/**
 * Sum of the DASH elements (even indices) of a dasharray. mgl's line atlas
 * collapses zero-length ranges: when every DASH is zero only gaps remain and
 * the line renders nothing (round caps aside); when every GAP is zero only
 * dashes remain → a solid line.
 */
function dashSumDash(dashArr: number[]): number {
    let s = 0;
    for (let i = 0; i < dashArr.length; i += 2) s += Number(dashArr[i]) || 0;
    return s;
}
const EXTENTS = 4096;

/**
 * Convert tile-local coordinates to world coordinates.
 * Inlined from OmvUtils to avoid exports field resolution issues.
 *
 * For the built-in Web-Mercator / Spherical (globe) projections this uses
 * the same fast integer-tile math as before — flywave's engine reprojects
 * Mercator world coords onto the sphere itself. For custom MBMapProjection
 * instances (Albers, EqualEarth, WinkelTripel, …) each tile-local point is
 * first lifted to its (lng, lat) and then run through the active
 * projection's `projectPoint`, so vector features land in the correct
 * projection-space position instead of being placed as a flat Mercator slab.
 */
function lat2tile(lat: number, zoom: number): number {
    return Math.round(
        ((1 - Math.log(Math.tan((lat * Math.PI) / 180) + 1 / Math.cos((lat * Math.PI) / 180)) / Math.PI) / 2) * Math.pow(2, zoom)
    );
}

/**
 * Inverse of the Web-Mercator tile y mapping: given the tile's northern
 * latitude `north`, the integer `top` tile row, the per-tile `py` pixel
 * offset and the global `scale` (= 2^(level+N)), return the geographic
 * latitude of the requested point. Used to feed custom projections.
 */
function tileYToLat(top: number, py: number, scale: number): number {
    const n = Math.PI - (2 * Math.PI * (top + py)) / scale;
    return (180 / Math.PI) * Math.atan(Math.sinh(n));
}

/**
 * Maximum tile-local distance (in tile-extent units) that a single line
 * segment may cover without being subdivided under a non-Mercator custom
 * projection. 32 px on a 4096-px tile ≈ 0.78% of the tile width — small
 * enough that the chord and the true projected curve differ by sub-pixel
 * amounts at every zoom level we render tests at.
 */
const RESAMPLE_MAX_SEG_PX = 32;

/**
 * Recursive midpoint subdivision of a tile-local polyline. Subdivides any
 * segment longer than `RESAMPLE_MAX_SEG_PX` until all segments are short
 * enough that reprojecting them through a non-linear projection yields an
 * effectively smooth curve. Points are interpolated linearly in tile-local
 * space — equivalent to interpolating in Web-Mercator world space — which is
 * the closest approximation of a rhumb-line on the sphere and matches
 * Mapbox's `resample.ts` behaviour for short distances.
 */
function resampleLinePoints(
    positions: ArrayLike<THREE.Vector2 | THREE.Vector3>,
    _extents: number,
): (THREE.Vector2 | THREE.Vector3)[] {
    const n = positions.length;
    if (n < 2) {
        const copy: (THREE.Vector2 | THREE.Vector3)[] = [];
        for (let i = 0; i < n; i++) copy.push(positions[i]);
        return copy;
    }
    const out: (THREE.Vector2 | THREE.Vector3)[] = [positions[0]];
    for (let i = 1; i < n; i++) {
        subdivideInto(positions[i - 1], positions[i], out);
    }
    return out;
}

function subdivideInto(
    a: THREE.Vector2 | THREE.Vector3,
    b: THREE.Vector2 | THREE.Vector3,
    out: (THREE.Vector2 | THREE.Vector3)[],
): void {
    // Use a stack-based iterative subdivision to avoid pathological
    // recursion on very long segments.
    const stack: Array<[THREE.Vector2 | THREE.Vector3, THREE.Vector2 | THREE.Vector3]> = [[a, b]];
    while (stack.length > 0) {
        const [pa, pb] = stack.pop()!;
        const dx = (pb as any).x - (pa as any).x;
        const dy = (pb as any).y - (pa as any).y;
        const dist = Math.hypot(dx, dy);
        if (dist <= RESAMPLE_MAX_SEG_PX) {
            out.push(pb);
            continue;
        }
        // Insert midpoint and recurse on each half. Construct the same
        // vector type as the input to preserve downstream typing.
        const mid = (pa as any).clone
            ? (pa as any).clone().lerp(pb, 0.5)
            : new THREE.Vector2((pa as any).x + dx * 0.5, (pa as any).y + dy * 0.5);
        stack.push([mid, pb]);
        stack.push([pa, mid]);
    }
}

function tile2world(
    extents: number,
    decodeInfo: DecodeInfo,
    px: number, py: number,
    target: THREE.Vector3,
): void {
    const { north, west } = decodeInfo.geoBox;
    const N = Math.log2(extents);
    const scale = Math.pow(2, decodeInfo.tileKey.level + N);
    const top = lat2tile(north, decodeInfo.tileKey.level + N);
    const left = Math.round(((west + 180) / 360) * scale);
    const R = EarthConstants.EQUATORIAL_CIRCUMFERENCE;

    const proj: any = decodeInfo.targetProjection;
    // §267: sphere projection — mercator-planar coords land at z=0 near the
    // world origin, nowhere near the sphere surface. Reproject each corner
    // through the sphere projection like the custom-projection branch.
    if (proj?.type === 1 /* ProjectionType.Spherical */) {
        const lng = ((left + px) / scale) * 360 - 180;
        const lat = tileYToLat(top, py, scale);
        const w = proj.projectPoint({ longitude: lng, latitude: lat, altitude: 0 });
        target.x = w.x;
        target.y = w.y;
        target.z = (w as any).z ?? 0;
        target.sub(decodeInfo.center);
        return;
    }
    if (proj?.mbCustomProjection === true) {
        // Reproject: tile-local → (lng, lat) → custom-projection world.
        const lng = ((left + px) / scale) * 360 - 180;
        const lat = tileYToLat(top, py, scale);
        const w = proj.projectPoint({ longitude: lng, latitude: lat, altitude: 0 });
        target.x = w.x;
        target.y = w.y;
        target.z = (w as any).z ?? 0;
        target.sub(decodeInfo.center);
        return;
    }

    target.x = ((left + px) / scale) * R;
    target.y = ((top + py) / scale) * R;
    target.z = 0;
    target.sub(decodeInfo.center);
}

/**
 * Tile-local coordinate → [lng, lat]. Shared by the sphere reprojection and
 * the sphere tessellation below.
 */
function tileToLatLng(
    extents: number, decodeInfo: DecodeInfo, px: number, py: number
): [number, number] {
    const { north, west } = decodeInfo.geoBox;
    const N = Math.log2(extents);
    const scale = Math.pow(2, decodeInfo.tileKey.level + N);
    const top = lat2tile(north, decodeInfo.tileKey.level + N);
    const left = Math.round(((west + 180) / 360) * scale);
    return [((left + px) / scale) * 360 - 180, tileYToLat(top, py, scale)];
}

/** Great-circle angular distance between two [lng, lat] pairs (radians). */
function greatCircleAngle(a: [number, number], b: [number, number]): number {
    const toRad = Math.PI / 180;
    const phi1 = a[1] * toRad, phi2 = b[1] * toRad;
    const dPhi = (b[1] - a[1]) * toRad, dLambda = (b[0] - a[0]) * toRad;
    const h = Math.sin(dPhi / 2) ** 2 +
        Math.cos(phi1) * Math.cos(phi2) * Math.sin(dLambda / 2) ** 2;
    return 2 * Math.asin(Math.min(1, Math.sqrt(h)));
}

/**
 * §271: on the sphere projection a flat tile quad's chord cuts through the
 * globe and fails the depth test against the engine's own subdivided ground
 * plane (addGroundPlane → SphericalGeometrySubdivisionModifier, 10°). mgl
 * globe tiles are tessellated grids on the sphere — mirror that here by
 * longest-edge bisection in tile space until every edge spans less than 10°
 * on the sphere. Winding is preserved (both halves keep the parent order).
 */
const SPHERE_TESSELLATION_MAX_ANGLE = Math.PI / 18; // 10°, engine ground-plane value
const SPHERE_TESSELLATION_MAX_DEPTH = 10;

function tessellateForSphere(
    verts: number[], indices: number[], extents: number, decodeInfo: DecodeInfo
): { verts: number[]; indices: number[] } {
    const outVerts = verts.slice();
    const outIndices: number[] = [];
    const stack: Array<[number, number, number, number]> = [];
    for (let t = 0; t < indices.length; t += 3) {
        stack.push([indices[t], indices[t + 1], indices[t + 2], 0]);
    }
    const angleOf = (i: number, j: number) =>
        greatCircleAngle(
            tileToLatLng(extents, decodeInfo, outVerts[i * 2], outVerts[i * 2 + 1]),
            tileToLatLng(extents, decodeInfo, outVerts[j * 2], outVerts[j * 2 + 1]));
    while (stack.length > 0) {
        const [ia, ib, ic, depth] = stack.pop()!;
        const angles = [angleOf(ia, ib), angleOf(ib, ic), angleOf(ic, ia)];
        const longest = angles[0] >= angles[1] && angles[0] >= angles[2] ? 0 :
            angles[1] >= angles[2] ? 1 : 2;
        if (angles[longest] < SPHERE_TESSELLATION_MAX_ANGLE || depth >= SPHERE_TESSELLATION_MAX_DEPTH) {
            // The mercator frame is y-south/z-up while the sphere map is
            // east→equatorial/north→z-up: the handedness flip turns camera-
            // facing (front) mercator triangles into back faces on the
            // sphere. Reverse the winding so fills face outward (mgl globe
            // tile semantics; mirrors the engine ground plane's corner order).
            outIndices.push(ia, ic, ib);
            continue;
        }
        // Split the longest edge (p,q) with opposite vertex r.
        const p = longest === 0 ? ia : longest === 1 ? ib : ic;
        const q = longest === 0 ? ib : longest === 1 ? ic : ia;
        const r = longest === 0 ? ic : longest === 1 ? ia : ib;
        const m = outVerts.length / 2;
        outVerts.push(
            (outVerts[p * 2] + outVerts[q * 2]) / 2,
            (outVerts[p * 2 + 1] + outVerts[q * 2 + 1]) / 2);
        stack.push([p, m, r, depth + 1]);
        stack.push([m, q, r, depth + 1]);
    }
    return { verts: outVerts, indices: outIndices };
}

export class MBTileDataEmitter {
    /**
     * Icon cross-fade blends requested by decoded tiles, keyed by the
     * synthetic image name. The MAIN thread drains this registry and
     * registers the blended canvases in mapView's userImageCache
     * (MBStyleDataSource.flushIconBlends) — the decode side has no DOM.
     */
    static readonly pendingIconBlends: Map<string, { a: string; b: string; t: number }> = new Map();

    /** Synthetic userImageCache name for an A/B cross-fade blend. */
    static iconBlendName(a: string, b: string, t: number): string {
        return `mbblend:${a}|${b}|${t.toFixed(4)}`;
    }

    /**
     * Synthetic userImageCache name for an image-params recolor variant
     * (["image", name, {params:{fill}}] → mgl ImageVariant). Deterministic so
     * the worker-side emitter and the main-thread pre-registration (which
     * rasterizes the variant into userImageCache BEFORE tile decode) agree.
     */
    static imageParamsName(name: string, params: Record<string, [number, number, number]>): string {
        const suffix = Object.entries(params)
            .map(([k, v]) => `${k}:${v.join(',')}`).sort().join(';');
        return `mbimg:${name}|${suffix}`;
    }

    private m_geometries: Map<string, AccumulatedGeometry> = new Map();
    private m_techniqueIndex = 0;
    private m_techniques: IndexedTechnique[] = [];
    private m_layerToTechniqueIndex: Map<string, number> = new Map();
    /**
     * Optional real-font glyph metrics (from PBF), used as the `glyphLookup`
     * for accurate text shaping. Set by the decoder when the main thread has
     * preloaded mapbox glyph ranges for the style's font stacks.
     */
    private m_glyphLookup: { getMetrics: (font: string, char: string) => any } | undefined;

    constructor(
        private m_tileKey: TileKey,
        private m_decodeInfo: DecodeInfo,
        private m_zoom: number,
    ) {}

    /** Install a real-font metrics lookup for text shaping. */
    setGlyphLookup(lookup: { getMetrics: (font: string, char: string) => any }): void {
        this.m_glyphLookup = lookup;
    }

    /**
     * Terrain elevation sampler (worldX, worldY → meters). When set,
     * fill-extrusion footprints ride the DEM surface (mgl
     * fill_extrusion.vertex.glsl getTerrainHeight semantics).
     */
    setTerrainSampler(sampler: (x: number, y: number) => number): void {
        this.m_terrainSampler = sampler;
    }
    private m_terrainSampler: ((x: number, y: number) => number) | null = null;

    /**
     * mgl crossSourceCollisions=false (test metadata): the engine's own POI
     * placement must not cull anything — MBStyleSymbolPlacement's per-source
     * collision groups own the placement verdicts (element.visible).
     */
    setCrossSourceCollisions(enabled: boolean): void {
        this.m_crossSourceCollisions = enabled;
    }
    private m_crossSourceCollisions = true;

    /**
     * §548: live terrain exaggeration (mgl u_exaggeration). Scales sea-level
     * line z-offsets by mix(1, exaggeration, line-elevation-ground-scale).
     */
    setTerrainExaggeration(v: number): void {
        this.m_terrainExaggeration = Number.isFinite(v) && v > 0 ? v : 1;
    }
    private m_terrainExaggeration = 1;

    /** §514: style declares terrain (mgl terrainEnabled equivalent). */
    setStyleHasTerrain(v: boolean): void {
        this.m_styleHasTerrain = v;
    }
    private m_styleHasTerrain = false;
    /** Terrain-flat gate: the sampler when present, else the style flag. */
    private get terrainActive(): boolean {
        return this.m_terrainSampler !== null || this.m_styleHasTerrain;
    }

    /**
     * Multiplier converting style meters (fill-extrusion height/base) to
     * world-z units. mgl scales every z coordinate by sec(lat)
     * (mercatorZfromAltitude) — the same factor sampleElevation bakes into
     * ground heights — so building heights must use it too (§289).
     */
    /** Style-level: any symbol layer precedes any fill-extrusion layer. */
    private m_iconDepthTest = false;

    setIconDepthTest(enabled: boolean): void {
        this.m_iconDepthTest = enabled;
    }

    setTerrainHeightScale(scale: number, fromTerrain: boolean): void {
        this.m_terrainHeightScale =
            Number.isFinite(scale) && scale > 0.2 ? scale : 1;
        this.m_heightScaleFromTerrain = fromTerrain;
    }
    private m_terrainHeightScale = 1;
    /**
     * Whether m_terrainHeightScale came from an ACTIVE terrain controller.
     * mgl scales building heights by sec(lat) exactly ONCE (bucket height is
     * meters/tileToMeter; mercator upVectorScale is 1). The §294 "sec²"
     * calibration only holds with terrain (the DEM sample path already bakes
     * one factor); without terrain the extra flat-path factor must NOT apply.
     */
    private m_heightScaleFromTerrain = false;

    /**
     * Mapbox camera bearing in degrees (style.bearing). Resolves
     * `*-translate-anchor: viewport`, which rotates the translate by -bearing
     * in the map frame (painter.translatePosMatrix). Static for render tests.
     */
    setBearing(bearing: number): void {
        this.m_bearing = bearing;
    }

    private m_bearing: number = 0;

    /**
     * Sprite size registry (name → px size) published by the datasource once
     * the sprite atlas is loaded (decoding happens after that await, so the
     * static is populated in time). Used to size `line-pattern` tiles.
     */
    private static s_spriteInfos: Map<string,
        { width: number; height: number; pixelRatio?: number }> | null = null;

    static setSpriteInfos(infos: Map<string,
        { width: number; height: number; pixelRatio?: number }> | null): void {
        MBTileDataEmitter.s_spriteInfos = infos;
    }

    private m_textGeometries: TextGeometry[] = [];
    private m_textPathGeometries: TextPathGeometry[] = [];
    /** §509 bucket-wide anchorIsTooClose state (per layer id, per tile). */
    private m_lineRepeatSeen = new Map<string, Array<{ x: number; y: number }>>();

    private lineRepeatSeen(layerId: string): Array<{ x: number; y: number }> {
        let s = this.m_lineRepeatSeen.get(layerId);
        if (!s) {
            s = [];
            this.m_lineRepeatSeen.set(layerId, s);
        }
        return s;
    }

    /** §509 world meters per `_linePath` unit — the path frame mixes extent
     * x with world-offset y (transformPoints), so anchor math runs on the
     * PROJECTED world polyline and converts px lengths through this scale. */
    private m_worldPerLinUnit = 0;
    private worldPerLinUnit(): number {
        if (!this.m_worldPerLinUnit) {
            const a = this.projectWorld(new THREE.Vector2(0, 0));
            const b = this.projectWorld(new THREE.Vector2(1, 0));
            this.m_worldPerLinUnit = Math.hypot(b.x - a.x, b.y - a.y) || 1;
        }
        return this.m_worldPerLinUnit;
    }
    private m_poiGeometries: PoiGeometry[] = [];
    private m_stringCatalog: string[] = [];
    private m_stringIndex: Map<string, number> = new Map();

    /**
     * Heatmap point sources collected for the two-pass density→ramp renderer.
     * Positions are absolute world coordinates (tile-local + center), the same
     * space the native TextElementsRenderer consumes, so the heatmap pass can
     * project them straight through the mapview camera. `weight`/`radius` are
     * the per-feature evaluated `heatmap-weight`/`heatmap-radius`; `technique`
     * indexes into `DecodedTile.techniques` for the color-ramp/intensity props.
     *
     * When `heatmap-radius` is a zoom-dependent function, `radiusExpr` carries
     * the raw style expression + the feature properties so the renderer can
     * re-evaluate it every frame at the live camera zoom (continuous radius
     * under zoom, instead of stepping at tile level changes).
     */
    private m_heatmapPoints: Array<{
        x: number; y: number; z: number;
        weight: number;
        radius: number;       // CSS px at the decode/reference zoom
        technique: number;
        radiusExpr?: any;
        properties?: Record<string, any>;
    }> = [];

    /**
     * Model-layer feature placements collected for the MBModelRenderer
     * (per-feature GLTF instantiation channel). Positions are absolute world
     * coordinates (same space as heatmap points / text geometries);
     * `technique` indexes into `DecodedTile.techniques` whose `modelId`
     * (evaluated `model-id` layout, already per-feature) resolves through the
     * root-level `style.models` registry — the mgl semantic this mirrors.
     */
    private m_modelInstances: Array<{
        x: number; y: number; z: number;
        technique: any;
        properties: Record<string, any>;
        /** Per-feature evaluated data-driven model-* paint (mgl semantics). */
        rotation?: number[];
        scale?: number[];
        translation?: number[];
        opacity?: number;
        colorMix?: number;
        color?: number[];
        emissive?: number;
        roughness?: number;
        modelId?: string;
    }> = [];

    /**
     * Record a heatmap kernel point for the two-pass heatmap renderer.
     */
    addHeatmapPoint(
        pos: THREE.Vector3,
        weight: number,
        radius: number,
        techniqueIdx: number,
        radiusExpr?: any,
        properties?: Record<string, any>,
    ): void {
        this.m_heatmapPoints.push({
            x: pos.x, y: pos.y, z: pos.z, weight, radius, technique: techniqueIdx,
            ...(radiusExpr !== undefined ? { radiusExpr, properties } : {}),
        });
    }

    /**
     * Whether a raw paint value depends on the camera zoom (legacy zoom /
     * zoom-and-property functions, or expression trees containing `["zoom"]`).
     * Only such values need per-frame re-evaluation on the renderer side.
     */
    private static exprDependsOnZoom(raw: any): boolean {
        if (Array.isArray(raw)) {
            for (const el of raw) {
                if (typeof el === 'string' && el === 'zoom') return true;
                if (Array.isArray(el) && MBTileDataEmitter.exprDependsOnZoom(el)) return true;
            }
            return false;
        }
        if (raw !== null && typeof raw === 'object' && !Array.isArray(raw) && Array.isArray(raw.stops)) {
            // Legacy function: numeric stops → zoom function; {zoom, value} keys
            // → zoom-and-property; categorical/property-only → feature-property.
            const first = raw.stops[0]?.[0];
            if (first !== null && typeof first === 'object' && !Array.isArray(first)) return 'zoom' in first;
            return typeof first === 'number';
        }
        return false;
    }

    private getStringIndex(s: string): number {
        let idx = this.m_stringIndex.get(s);
        if (idx === undefined) {
            idx = this.m_stringCatalog.length;
            this.m_stringCatalog.push(s);
            this.m_stringIndex.set(s, idx);
        }
        return idx;
    }

    /**
     * The tile extent (default 4096). Set per-tile by the adapter via
     * `setExtents()` so non-standard tile sizes (e.g. 1024) are handled
     * correctly in coordinate conversion.
     */
    private m_extents: number = 4096;

    /** Set the tile extent (called by the decoder before processing). */
    setExtents(extents: number): void {
        this.m_extents = extents > 0 ? extents : 4096;
    }

    get extents(): number { return this.m_extents; }

    private getOrCreateGeometry(key: string): AccumulatedGeometry {
        let geo = this.m_geometries.get(key);
        if (!geo) {
            geo = {
                positions: [],
                indices: [],
                extrusionAxis: [],
                uvs: [],
                edgeIndex: [],
                edgeFeatureStarts: [],
                groups: [],
                featureStarts: [],
                objInfos: [],
            };
            this.m_geometries.set(key, geo);
        }
        return geo;
    }

    private project(p: THREE.Vector2 | THREE.Vector3): THREE.Vector3 {
        tile2world(this.m_extents, this.m_decodeInfo, p.x, p.y, tmpV3);
        // Apply line-z-offset if set (for elevated lines)
        if (this.m_currentZOffset !== 0) {
            tmpV3.z += this.m_currentZOffset;
        }
        return tmpV3.clone();
    }

    /**
     * Project into absolute world coordinates (without `sub(center)`).
     * Text/POI geometry is consumed by the native TextElementsRenderer /
     * PoiManager as absolute world positions, unlike mesh geometry which is
     * tile-center-relative (see VectorTileDataEmitter:360-378).
     */
    private projectWorld(p: THREE.Vector2 | THREE.Vector3): THREE.Vector3 {
        return this.project(p).add(this.m_decodeInfo.center);
    }

    private m_currentZOffset: number = 0;

    /**
     * Maximum geometry z (meters) emitted for this tile. Reported as
     * `DecodedTile.maxGeometryHeight` so the engine lifts the tile's geoBox
     * above the extruded content — otherwise the camera near plane hugs the
     * ground plane and clips the geometry closest to the camera (extrusion
     * roofs / elevated lines), see `Tile.elevateGeoBox` and
     * `TiltViewClipPlanesEvaluator`.
     */
    private m_maxGeometryHeight: number = 0;

    private noteGeometryHeight(z: number): void {
        if (z > this.m_maxGeometryHeight) {
            this.m_maxGeometryHeight = z;
        }
    }

    /**
     * Scale an evaluated CSS color's RGB channels by its own alpha and return
     * the opaque result (`rgba(100,100,100,0.2)` → `rgb(20, 20, 20)`).
     * Returns the input unchanged when alpha is 1 and `null` when alpha is 0
     * (feature must not render at all).
     */
    private static scaleColorByAlpha(value: any): any {
        if (typeof value !== 'string') return value;
        const m = value.match(/^rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)(?:\s*,\s*([\d.]+))?\s*\)/i);
        if (m) {
            if (m[4] === undefined || Number(m[4]) >= 1) return value;
            const a = Number(m[4]);
            if (a <= 0) return null;
            return `rgb(${Math.round(+m[1] * a)}, ${Math.round(+m[2] * a)}, ${Math.round(+m[3] * a)})`;
        }
        if (/^#[0-9a-f]{8}$/i.test(value)) {
            const a = parseInt(value.slice(7, 9), 16) / 255;
            if (a >= 1) return value.slice(0, 7);
            if (a <= 0) return null;
            const ch = [1, 3, 5].map(i =>
                Math.round(parseInt(value.slice(i, i + 2), 16) * a));
            return `rgb(${ch[0]}, ${ch[1]}, ${ch[2]})`;
        }
        if (/^#[0-9a-f]{4}$/i.test(value)) {
            const a = parseInt(value[3], 16) / 15;
            if (a >= 1) return value.slice(0, 4);
            if (a <= 0) return null;
            const ch = [0, 1, 2].map(i =>
                Math.round(parseInt(value[i], 16) * 17 * a));
            return `rgb(${ch[0]}, ${ch[1]}, ${ch[2]})`;
        }
        return value;
    }


    /**
     * mgl `line.fragment.glsl` auto-derived border color (used when
     * `line-border-color` is left at its default `rgba(0,0,0,0)`): the border
     * is not a separate color but a modulation of the line's own edge.
     *
     *   Y = luminance(out_color / a); adjustment = Y>0 ? 0.5/Y : 0.45
     *   dark line (a>0.25 && Y<0.25): border = line + line*adjustment (brighten)
     *   bright line (else)        : border = line * (0.6 + 0.4*alpha2) (darken)
     *
     * Our border is a thin ribbon at the line's outer edge (alpha2→0), so the
     * effective border color is `line × 0.6` for a bright line and
     * `line × (1 + 0.5/Y)` for a dark line. Returns the derived color as an
     * `rgb(r, g, b)` string, or the explicit `borderColor` unchanged when it
     * was explicitly provided.
     */
    private static deriveAutoBorderColor(borderColor: string | undefined, lineColor: any): string {
        // Only derive when the style left line-border-color at its default
        // (transparent in mgl). An explicitly-set color (including 'black')
        // is used verbatim.
        const auto = borderColor === undefined || borderColor === '#000000';
        if (!auto) return borderColor;
        const c = new THREE.Color(lineColor).convertLinearToSRGB();
        // out_color is premultiplied by its alpha; line opacity is folded in
        // later, so luminance is computed on the raw (opaque) line color.
        const Y = (c.r * 0.299 + c.g * 0.587 + c.b * 0.114);
        const a = 1;
        if (a > 0.25 && Y < 0.25) {
            const adjustment = Y > 0 ? 0.5 / Y : 0.45;
            const r = Math.min(255, Math.round(c.r * 255 * (1 + adjustment)));
            const g = Math.min(255, Math.round(c.g * 255 * (1 + adjustment)));
            const b = Math.min(255, Math.round(c.b * 255 * (1 + adjustment)));
            return `rgb(${r}, ${g}, ${b})`;
        }
        // Bright line: darken toward 0.6× at the outer border edge.
        const k = 0.6;
        return `rgb(${Math.round(c.r * 255 * k)}, ${Math.round(c.g * 255 * k)}, ${Math.round(c.b * 255 * k)})`;
    }

    /**
     * Resolve the per-feature Z offset for a layer, combining:
     *   - the explicit `<type>-z-offset` paint/layout property, and
     *   - the `<type>-elevation-reference` layout property, which reads the
     *     feature's `elevation`/`height`/`z`/`level` property and lifts the
     *     feature to that height (HD elevated-line / bridge support).
     *
     * `type` is the layer type prefix: 'fill', 'line', or 'fill-extrusion'.
     */
    /** §511 3d-style port: per-tile hd_road_elevation curves. */
    setElevationStructures(structures: import('./3d-style/elevation/MBElevatedStructures').MBElevatedStructures | null): void {
        this.m_elevationStructures = structures;
    }
    private m_elevationStructures: import('./3d-style/elevation/MBElevatedStructures').MBElevatedStructures | null = null;

    /**
     * §513: global y offset of the MVT flip frame. Elevated geometry must
     * meet the elevation curves in the tile-LOCAL extent frame — subtract
     * before sampling, add back before projecting.
     */
    setElevationYDelta(delta: (extents: number) => number): void {
        this.m_elevYDelta = delta;
    }
    private m_elevYDelta: ((extents: number) => number) | null = null;
    private elevationYDelta(extents: number): number {
        return this.m_elevYDelta ? this.m_elevYDelta(extents) : 0;
    }

    private resolveZOffset(
        layer: EvaluatedLayer,
        properties: Record<string, any> | undefined,
        type: 'fill' | 'line' | 'fill-extrusion' | 'symbol',
        anchor?: { x: number; y: number },
        skipHdSample = false,
    ): number {
        const paint = layer.paint ?? {};
        const layout = layer.layout ?? {};

        // Explicit z-offset property.
        let z = Number(paint[`${type}-z-offset`] ?? layout[`${type}-z-offset`] ?? 0);

        // HD elevation reference: lift feature to its real-world elevation.
        const elevRef = layout[`${type}-elevation-reference`];
        // mgl symbol_hd_extension.resolveRoadElevation: under terrain the
        // road-elevation lookup returns none — symbols (and markup lines)
        // sit flat on the terrain instead of following the curve. Fills
        // keep their curve elevation (fill_hd_extension has no gate).
        const terrainFlat = this.terrainActive &&
            elevRef === 'hd-road-markup' && type !== 'fill';
        if (elevRef && !terrainFlat) {
            // §513: when the per-vertex path handles this feature (fills),
            // the curve sample must NOT be folded in a second time.
            if (!skipHdSample &&
                anchor && this.m_elevationStructures && !this.m_elevationStructures.isEmpty) {
                const isMarkup = elevRef === 'hd-road-markup';
                const h = this.m_elevationStructures.sampleHeightCanonical(
                    properties,
                    anchor.x * (4096 / this.m_extents),
                    this.elevationYDelta(this.m_extents) === 0
                        ? anchor.y * (4096 / this.m_extents)
                        : (anchor.y - this.elevationYDelta(this.m_extents)) * (4096 / this.m_extents),
                    isMarkup);
                if (h !== undefined) {
                    z += h;
                    return z;
                }
            }
            const featElev = Number(
                properties?.elevation ?? properties?.height ??
                properties?.z ?? properties?.level ?? 0,
            );
            z += elevRef === 'hd-road-markup'
                ? featElev + 0.1 // markup sits slightly above the road surface
                : featElev === 0 && elevRef === 'hd-road-base'
                    ? 0.05 // base road surface: clear the ground-plane z-fight
                    : featElev;
        }
        return z;
    }

    private extractSortKey(layer: EvaluatedLayer): number | undefined {
        const layout = layer.layout ?? {};
        const sk = layout['fill-sort-key']
            ?? layout['line-sort-key']
            ?? layout['circle-sort-key']
            ?? layout['symbol-sort-key'];
        return typeof sk === 'number' ? sk : undefined;
    }

    private paintToTechniqueProps(layer: EvaluatedLayer, properties?: Record<string, any>, symbolMode?: 'icon' | 'text'): Record<string, any> {
        const p = layer.paint;
        const l = layer.layout;
        const props: Record<string, any> = {};

        // mgl hasOcclusionOpacityProperties: the layer EXPLICITLY set an
        // occlusion-opacity property (raw paint presence — the evaluated
        // paint always carries the default 0). paintDefs distinguishes the
        // two: a defaulted key is {type:'constant', value === default}; an
        // explicit constant or expression differs.
        {
            const defs = (layer as any).paintDefs ?? {};
            const explicit = (k: string) =>
                defs[k] !== undefined &&
                (defs[k].type === 'expression' || defs[k].value !== defs[k].default);
            props._occlusionExplicit =
                explicit('icon-occlusion-opacity') || explicit('text-occlusion-opacity') ||
                explicit('line-occlusion-opacity') || explicit('circle-occlusion-opacity');
        }

        switch (layer.type) {
            case 'background':
                props.technique = 'fill';
                props.color = p['background-color'] ?? '#000000';
                props.opacity = p['background-opacity'] ?? 1;
                props.renderOrder = -Infinity;
                break;
            case 'fill':
                props.technique = 'fill';
                props.color = p['fill-color'] ?? '#000000';
                props.opacity = p['fill-opacity'] ?? 1;
                props.outlineColor = p['fill-outline-color'];
                props._translate = p['fill-translate'] ?? [0, 0];
                props._translateAnchor = p['fill-translate-anchor'] ?? 'map';
                if (p['fill-pattern']) {
                    props._patternName = p['fill-pattern'];
                    props._patternCrossFade = p['fill-pattern-cross-fade'] ?? 1;
                    // ["image", a, b] + cross-fade: resolve the second
                    // candidate for two-texture blending (same as the ribbon
                    // line-pattern-cross-fade path). Scoped to fade ∈ (0,1):
                    // always resolving regressed uneven-pattern/start-fade
                    // fixtures whose endpoint semantics differ (§403).
                    const fade = Number(p['fill-pattern-cross-fade'] ?? 1);
                    if (Number.isFinite(fade) && fade > 0 && fade < 1) {
                        let rawPat: any = (layer as any).paintDefs?.['fill-pattern']?.value;
                        if (!Array.isArray(rawPat) && typeof rawPat === 'object') {
                            try { rawPat = JSON.parse(JSON.stringify(rawPat)); } catch { rawPat = undefined; }
                        }
                        while (Array.isArray(rawPat) && rawPat[0] === 'memo') rawPat = rawPat[1];
                        if (Array.isArray(rawPat) && rawPat[0] === 'image') {
                            for (const cand of rawPat.slice(1)) {
                                if (typeof cand === 'string' && cand !== props._patternName) {
                                    props._patternName2 = cand;
                                    break;
                                }
                            }
                        }
                    }
                }
                // HD elevation reference: roads/markings at their feature elevation.
                const fillElevRef = l['fill-elevation-reference'];
                if (fillElevRef) {
                    const featElev = Number(properties?.elevation ?? properties?.height ?? properties?.z ?? properties?.level ?? 0);
                    props._hdElevation = fillElevRef === 'hd-road-markup'
                        ? featElev + 0.1  // markup sits slightly above road surface
                        : featElev === 0 && fillElevRef === 'hd-road-base'
                            ? 0.05  // clear the ground-plane z-fight (§511)
                            : featElev;
                    // §511 3d-style port: HD road fills are elevated content —
                    // mgl draws them in a late pass above the coverage quads
                    // (whose renderOrder lands at 2..9 in the clearColor+quad
                    // pipeline); the default 3D priority (ro=1) buries them.
                    props.renderOrder = fillElevRef === 'hd-road-markup' ? 9.8 : 9.6;
                }
                if (l.visibility === 'none') props.enabled = false;
                break;
            case 'line':
                props.technique = 'solid-line';
                props.color = p['line-color'] ?? '#000000';
                props.opacity = p['line-opacity'] ?? 1;
                // Mapbox line-width/offset/dash values are in CSS pixels — the
                // SolidLineMaterial converts them to world units via metricUnit.
                // Under line-width-unit:meters the width is already metric:
                // pre-divide by the px→world factor so the Pixel conversion
                // restores the metric value.
                const lineMeters = (l?.['line-width-unit'] ?? 'pixels') === 'meters';
                const mppTech = EarthConstants.EQUATORIAL_CIRCUMFERENCE /
                    (256 * Math.pow(2, this.m_zoom + 1));
                props.lineWidth = p['line-width'] ?? 1;
                if (lineMeters && typeof props.lineWidth === 'number') {
                    props.lineWidth = props.lineWidth / mppTech;
                }
                props.metricUnit = 'Pixel';
                props._translate = p['line-translate'] ?? [0, 0];
                props._translateAnchor = p['line-translate-anchor'] ?? 'map';
                // HD elevation reference: stored on the technique as
                // `_hdElevation` for the MaterialPatchManager; the per-feature
                // Z offset that lifts the line geometry itself is computed
                // centrally in `resolveZOffset()` (called by processLineFeature).
                const lineElevRef = l['line-elevation-reference'];
                if (lineElevRef) {
                    const featElev = Number(properties?.elevation ?? properties?.height ?? properties?.z ?? 0);
                    props._hdElevation = lineElevRef === 'hd-road-markup'
                        ? featElev + 0.1
                        : featElev;
                    // §516: markup lines must draw AFTER the base-road fills
                    // (9.6) and BEFORE markup fills (9.8) — mgl's style order
                    // (base first, markups after) is broken by the §512 fill
                    // promotion, which left lines at their style index (4-7)
                    // painting UNDER the later-drawn base surface.
                    if (lineElevRef === 'hd-road-markup') {
                        props.renderOrder = 9.75;
                    }
                }
                if (p['line-pattern']) {
                    props._patternName = p['line-pattern'];
                    props._patternCrossFade = p['line-pattern-cross-fade'] ?? 1;
                }
                if (p['line-dasharray']) {
                    const arr = p['line-dasharray'] as number[];
                    // Mapbox line-dasharray values are multiples of the line
                    // width, so the dash scales with zoom when line-width is a
                    // zoom function. Multiply by the (pixel) line-width here;
                    // metricUnit:'Pixel' then converts the product to world units.
                    const lw = (props.lineWidth as number) ?? 1;
                    if (arr.length >= 2) {
                        props.dashSize = arr[0] * lw;
                        props.gapSize = arr[1] * lw;
                        if (arr.length > 2) {
                            props.dashArray = arr.map((v: number) => v * lw);
                            let sum = 0;
                            for (const v of arr) sum += v * lw;
                            props.dashTotalLength = sum;
                        }
                    }
                }
                if (p['line-gradient']) {
                    props._lineGradientStops = p['line-gradient'];
                }
                if (l.visibility === 'none') props.enabled = false;
                break;
            case 'circle':
                props.technique = 'circles';
                props.color = p['circle-color'] ?? '#000000';
                props.opacity = p['circle-opacity'] ?? 1;
                // Mapbox circle-radius is the disc RADIUS in pixels; the native
                // CirclePointsMaterial gl_PointSize is the disc DIAMETER. The
                // quad must also cover the stroke (mgl extrudes by
                // radius + stroke_width — the stroke lies OUTSIDE the fill
                // radius; the fragment patch renormalizes).
                props.size = ((p['circle-radius'] ?? 5) + Number(p['circle-stroke-width'] ?? 0)) * 2;
                props._translate = p['circle-translate'] ?? [0, 0];
                props._translateAnchor = p['circle-translate-anchor'] ?? 'map';
                if (l.visibility === 'none') props.enabled = false;
                break;
            case 'symbol':
                // When both icon-image and text-field are present, emit two
                // techniques (icon + text) so labels render with icon + caption.
                // symbolMode selects which one this call builds.
                if (symbolMode === 'icon' || (symbolMode === undefined && l['icon-image'])) {
                    props.technique = 'labeled-icon';
                    // Mapbox icon tokens ("{maki}-12") resolve against the
                    // feature properties (same as text-field tokens) — mvt
                    // symbol sources stayed blank without this.
                    props.imageTexture = typeof l['icon-image'] === 'string'
                        ? resolveTextField(l['icon-image'], properties ?? {})
                        : l['icon-image'];
                    // ["image", a, b] + icon-image-cross-fade: mgl blends the
                    // primary/secondary pair (out = A·(1−t) + B·t,
                    // symbol.fragment.glsl ICON_TRANSITION). Icons render via
                    // mapView.userImageCache by name, so the blend is baked
                    // CPU-side into a synthetic image the datasource registers
                    // (see MBStyleDataSource.flushIconBlends).
                    const iconFade = Number(p['icon-image-cross-fade'] ?? 0);
                    const iconSecondary = (l as any)['icon-image-secondary'];
                    if (iconSecondary && Number.isFinite(iconFade) && iconFade > 0
                        && typeof props.imageTexture === 'string') {
                        const blendName = MBTileDataEmitter.iconBlendName(
                            props.imageTexture, iconSecondary, iconFade);
                        MBTileDataEmitter.pendingIconBlends.set(blendName, {
                            a: props.imageTexture, b: iconSecondary, t: iconFade,
                        });
                        props.imageTexture = blendName;
                    }
                    // PoiBuilder reads `iconColor` (it ignores `color`).
                    props.iconColor = p['icon-color'] ?? '#000000';
                    props.opacity = p['icon-opacity'] ?? 1;
                    props.iconScale = l['icon-size'] ?? 1;
                    props._iconTranslate = p['icon-translate'] ?? [0, 0];
                    props._iconTranslateAnchor = p['icon-translate-anchor'] ?? 'map';
                    // Mapbox `icon-anchor` — the native PoiRenderer shifts the
                    // icon box so the named edge/corner sits at the symbol point.
                    props._iconAnchor = l['icon-anchor'] ?? 'center';
                    // Mapbox `icon-offset` (in ems, relative to icon-size): shift
                    // the icon box center by em × iconSize px. PoiRenderer applies
                    // these as pre-scale pixel offsets.
                    const iconOffsetArr = l['icon-offset'];
                    if (Array.isArray(iconOffsetArr)) {
                        const iconFontSize = (l['icon-size'] as number) ?? 1;
                        props.iconXOffset = (iconOffsetArr[0] ?? 0) * iconFontSize;
                        props.iconYOffset = -((iconOffsetArr[1] ?? 0)) * iconFontSize;
                    }
                    // Mapbox `icon-text-fit` (+ padding): stretch the icon box to
                    // the shaped text bounds (mgl shaping_shared.fitIconToText).
                    // The text bounds are anchor-relative (mgl shaping.ts:712-715
                    // shifts left/top by -hAlign*width / -vAlign*height), so we
                    // emit the four anchor-shifted edges in px; PoiRenderer places
                    // the fitted box at those edges (mgl fitIconToText). Padding
                    // order is [top, right, bottom, left] (mapbox).
                    const iconTextFit = l['icon-text-fit'];
                    if (iconTextFit && iconTextFit !== 'none' && l['text-field']) {
                        const fitRaw = typeof l['text-field'] === 'string'
                            ? l['text-field'] : String(l['text-field'] ?? '');
                        const fitResolved = resolveTextField(fitRaw, properties ?? {});
                        const fitTransform = l['text-transform'] ?? 'none';
                        const fitShaped = shapeText(shapeRTLText(fitResolved, fitTransform), {
                            fontSize: (l['text-size'] as number) ?? 16,
                            maxWidth: (l['text-max-width'] as number) ?? 10,
                            lineHeight: (l['text-line-height'] as number) ?? 1.2,
                            letterSpacing: (l['text-letter-spacing'] as number) ?? 0,
                            justify: (l['text-justify'] as 'left' | 'center' | 'right' | 'auto') ?? 'center',
                            anchor: (l['text-anchor'] as string) ?? 'center',
                            transform: 'none',
                            writingMode: l['text-writing-mode'] as ('horizontal' | 'vertical')[],
                            glyphLookup: this.m_glyphLookup as any,
                            fontName: Array.isArray(l['text-font']) ? l['text-font'].join(',') : l['text-font'],
                            sectionScales: (l as any)['text-field-section-scales'],
                        });
                        props._iconTextFit = iconTextFit;
                        props._iconTextFitPadding = l['icon-text-fit-padding'] ?? [0, 0, 0, 0];
                        // Convert em-unit shaping to pixel dims at the text size.
                        const fitTextSize = (l['text-size'] as number) ?? 16;
                        const fitW = (fitShaped.right - fitShaped.left) * fitTextSize;
                        const fitH = (fitShaped.bottom - fitShaped.top) * fitTextSize;
                        // Anchor alignment (mgl getAnchorAlignment): the shaped box
                        // from shapeText is centered; shift its left/top so the box
                        // is positioned relative to the symbol point like mgl.
                        const fitAnchor = (l['text-anchor'] as string) ?? 'center';
                        let hAlign = 0.5;
                        let vAlign = 0.5;
                        if (/right/.test(fitAnchor)) hAlign = 1;
                        else if (/left/.test(fitAnchor)) hAlign = 0;
                        if (/bottom/.test(fitAnchor)) vAlign = 1;
                        else if (/top/.test(fitAnchor)) vAlign = 0;
                        props._iconFitTextL = (-hAlign) * fitW;
                        props._iconFitTextR = props._iconFitTextL + fitW;
                        props._iconFitTextT = (-vAlign) * fitH;
                        props._iconFitTextB = props._iconFitTextT + fitH;
                        props._iconFitTextW = fitW;
                        props._iconFitTextH = fitH;
                    }
                    // SDF icon halo (private-prefixed; consumed by PoiBuilder for
                    // the IconMaterial halo uniforms). icon-halo-width/blur are in
                    // ems (mapbox); converted to SDF field units at render time.
                    // The color alpha travels as a separate numeric prop: any
                    // `*Color`-named string prop gets packed to a number by the
                    // engine's color normalization (parseStringEncodedColor),
                    // which drops the alpha channel.
                    {
                        const haloRaw = p['icon-halo-color'] ?? 'rgba(0,0,0,0)';
                        const hm = typeof haloRaw === 'string'
                            ? haloRaw.match(/^rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)(?:\s*,\s*([\d.]+))?\s*\)/i)
                            : null;
                        if (hm) {
                            props._iconHaloColor = `rgb(${hm[1]}, ${hm[2]}, ${hm[3]})`;
                            props._iconHaloAlpha = hm[4] !== undefined ? Number(hm[4]) : 1;
                        } else {
                            props._iconHaloColor = haloRaw;
                            props._iconHaloAlpha = 1;
                        }
                    }
                    props._iconHaloWidth = p['icon-halo-width'] ?? 0;
                    props._iconHaloBlur = p['icon-halo-blur'] ?? 0;
                    // icon-occlusion-opacity (per-feature evaluated; 1 = no
                    // fade for layers that never set the property — the
                    // evaluated paint default is 0, which would hide every
                    // icon). PoiBuilder → PoiInfo.iconOcclusionOpacity →
                    // per-value batch split → patcher fade uniform.
                    props._iconOcclusionOpacity = props._occlusionExplicit
                        && typeof p['icon-occlusion-opacity'] === 'number'
                        ? p['icon-occlusion-opacity'] : 1;
                    // Mapbox `icon-rotate` (degrees, clockwise). The PoiRenderer
                    // rotates the icon quad corners around the symbol point.
                    // §509: line-placed icons add the segment angle — mgl
                    // icon-rotation-alignment 'map' (line-placement default)
                    // rotates the sprite to the local line direction; the
                    // extent frame is y-north so the screen-clockwise angle
                    // negates the atan2 angle.
                    const lineAngleDeg = typeof properties._lineIconAngle === 'number'
                        ? -properties._lineIconAngle * 180 / Math.PI : 0;
                    props._iconRotate = (l['icon-rotate'] ?? 0) + lineAngleDeg;
                    if (typeof l['symbol-sort-key'] === 'number') props.priority = l['symbol-sort-key'];
                    // Native PoiBuilder reads `iconMayOverlap`/`iconReserveSpace`
                    // (NOT `mayOverlap`/`reserveSpace`); map `icon-allow-overlap` /
                    // `icon-ignore-placement` onto the native prop names.
                    props.iconMayOverlap = l['icon-allow-overlap'] === true
                        || !this.m_crossSourceCollisions;
                    // mgl "symbols before 3D": symbol layers preceding
                    // fill-extrusion layers are depth-covered by the
                    // buildings (static per-style flag from the decoder).
                    if (this.m_iconDepthTest) props._iconDepthTest = true;
                    // mgl scales symbols by perspectiveRatio = 0.5 +
                    // 0.5*(centerDist/pointDist) (symbol.vertex gl_Position w
                    // division). The engine's factor = 1 + (lookAt/d - 1) *
                    // distanceScale equals that curve exactly at 0.5. The old
                    // constant 0 made far icons full-size at high pitch.
                    props.distanceScale = 0.5;
                    props.mayOverlap = l['icon-allow-overlap'] === true
                        || !this.m_crossSourceCollisions;
                    props.iconReserveSpace = l['icon-ignore-placement'] !== true
                        && this.m_crossSourceCollisions;
                    props.reserveSpace = l['icon-ignore-placement'] !== true
                        && this.m_crossSourceCollisions;
                    if (l.visibility === 'none') props.enabled = false;
                } else if (symbolMode === 'text' || (symbolMode === undefined && l['text-field'])) {
                    props.technique = 'text';
                    // mgl text has NO default label background — the engine's
                    // default text style draws #f7fbfd @ 0.5 behind every
                    // label (a light halo over any non-white basemap,
                    // minimal-harness glyph-t proven). Zero it explicitly.
                    props.backgroundOpacity = 0;
                    // Resolve text field with token replacement using feature properties
                    const rawText = typeof l['text-field'] === 'string'
                        ? l['text-field']
                        : String(l['text-field'] ?? '');
                    const resolvedText = resolveTextField(rawText, properties ?? {});

                    // Apply text transform, then Bidi-reorder + Arabic-reshape
                    // when the text contains RTL (Arabic/Hebrew) characters.
                    // shapeRTLText is a fast path (returns unchanged) for LTR text.
                    const transform = l['text-transform'] ?? 'none';
                    const transformedText = shapeRTLText(resolvedText, transform);

                    props.text = transformedText;
                    props.color = p['text-color'] ?? '#000000';
                    props.opacity = p['text-opacity'] ?? 1;
                    props.size = l['text-size'] ?? 16;
                    props.fontName = l['text-font']?.[0];

                    // Pre-compute shaped text for layout
                    const shaped = shapeText(transformedText, {
                        fontSize: l['text-size'] ?? 16,
                        maxWidth: l['text-max-width'] ?? 10,
                        lineHeight: l['text-line-height'] ?? 1.2,
                        letterSpacing: l['text-letter-spacing'] ?? 0,
                        justify: l['text-justify'] ?? 'center',
                        anchor: l['text-anchor'] ?? 'center',
                        transform: 'none', // already applied above
                        writingMode: l['text-writing-mode'] as ('horizontal' | 'vertical')[],
                        glyphLookup: this.m_glyphLookup as any,
                        fontName: Array.isArray(l['text-font']) ? l['text-font'].join(',') : l['text-font'],
                        // mgl format font-scale sections (§396): only the
                        // per-line max is consumed, so the pre-transform
                        // alignment is safe (casing is code-point 1:1 for
                        // the Latin corpus).
                        sectionScales: (l as any)['text-field-section-scales'],
                    });
                    props._shaped = shaped;
                    props._textWidth = shaped.right - shaped.left;
                    props._textHeight = shaped.bottom - shaped.top;
                    props._textOffset = l['text-offset'];
                    props._textTranslate = p['text-translate'] ?? [0, 0];
                    props._textTranslateAnchor = p['text-translate-anchor'] ?? 'map';

                    // Map mapbox text layout props onto the native TextTechnique
                    // props consumed by TextElementsRenderer / TextStyleCache.
                    //
                    // LineTypesetter accumulates advance/tracking and compares
                    // line widths in *catalog em-pixel* units (the PBF catalog
                    // is a 24px em), then scales by textSize/catalogSize. So all
                    // layout values below are expressed against the 24px catalog
                    // em, not the render text size.
                    const CATALOG_EM = 24;
                    const fontSize = (l['text-size'] as number) ?? 16;
                    props.tracking = ((l['text-letter-spacing'] as number) ?? 0) * CATALOG_EM;
                    // Lines advance by (lineHeight + leading) * textSize/catalogSize.
                    // The PBF catalog lineHeight is 1em, so the extra spacing needed
                    // to reach text-line-height * textSize is (line-height - 1) em.
                    props.leading = (((l['text-line-height'] as number) ?? 1.2) - 1) * CATALOG_EM;
                    const maxWidth = l['text-max-width'];
                    if (typeof maxWidth === 'number') {
                        // LineTypesetter accumulates lineCurrX in screen pixels
                        // ((advanceX + tracking) * textSize/catalogSize), so the
                        // wrap width must be screen pixels too.
                        props.lineWidth = maxWidth * fontSize;
                        props.wrappingMode = 'Word';
                    }
                    props.rotation = ((l['text-rotate'] as number) ?? 0) * Math.PI / 180;
                    const anchor = (l['text-anchor'] as string) ?? 'center';
                    // Mapbox derives BOTH horizontal and vertical alignment from
                    // the anchor (symbol/shaping_shared.getAnchorAlignment) — the
                    // horizontal alignment is NOT taken from `text-justify` (which
                    // only justifies multi-line text inside the box and is
                    // unsupported here). Anchor 'left'/'top-left'/'bottom-left'
                    // → Left (box left edge at the point, text extends right),
                    // 'right'/* → Right, everything else → Center.
                    props.hAlignment = anchor.includes('left') ? 'Left'
                        : anchor.includes('right') ? 'Right' : 'Center';
                    // Mapbox anchors align the text box edge to the point:
                    // 'top' puts the box top at the point (text below it) —
                    // flywave's "Below" placement (verified empirically: the
                    // swap to "Above" regressed top/bottom anchors ~+9k px).
                    props.vAlignment = anchor.startsWith('top') ? 'Below'
                        : anchor.startsWith('bottom') ? 'Above' : 'Center';
                    if (typeof l['symbol-sort-key'] === 'number') props.priority = l['symbol-sort-key'];
                    // Same-symbol icon+text never collide in mgl (one
                    // placement unit) — text-allow-overlap OR own icon.
                    props.mayOverlap = l['text-allow-overlap'] === true || !!l['icon-image'];
                    // Mapbox labels keep a constant screen size regardless of
                    // distance — disable flywave's perspective distance scaling
                    // (default 0.5 shrinks off-center labels by up to ~25%).
                    props.distanceScale = 0;
                    // Text: engine culling stays UNRELAXED even when
                    // crossSourceCollisions=false — the upstream mgl expected
                    // for text-no-cross-source-collision is an all-black frame
                    // (label-generation artifact), so engine-side culling
                    // scores closer; grouping verdicts alone can't reach it.
                    props.reserveSpace = l['text-ignore-placement'] !== true;
                    const textOffset = l['text-offset'] as number[] | undefined;
                    if (Array.isArray(textOffset)) {
                        // em → px; native yOffset is positive = up (mapbox positive y = down).
                        props.xOffset = (textOffset[0] ?? 0) * fontSize;
                        props.yOffset = -((textOffset[1] ?? 0)) * fontSize;
                    }
                    // `text-radial-offset` (ems): shift ALONG the anchor's
                    // outward diagonal unit vector (mgl: equivalent to a
                    // text-offset of radial·(±0.7071, ±0.7071) picked by the
                    // anchor quadrant; 'center' behaves like 'bottom').
                    const radial = Number(l['text-radial-offset'] ?? 0);
                    if (radial !== 0) {
                        const R = Math.SQRT1_2;
                        const hasV = anchor.startsWith('top') || anchor.startsWith('bottom');
                        const hasH = anchor.includes('left') || anchor.includes('right');
                        const dxUnit = anchor.includes('left') ? R
                            : anchor.includes('right') ? -R : 0;
                        let dyUnit = anchor.startsWith('top') ? R
                            : anchor.startsWith('bottom') ? -R : 0;
                        if (!hasV && !hasH) dyUnit = R; // center: pushes down
                        // mapbox +y is down; native yOffset positive = up.
                        props.xOffset = (props.xOffset ?? 0) + radial * dxUnit * fontSize;
                        props.yOffset = (props.yOffset ?? 0) - radial * dyUnit * fontSize;
                    }

                    if (l.visibility === 'none') props.enabled = false;
                }
                break;
            case 'fill-extrusion':
                props.technique = 'extruded-polygon';
                // mapbox semantics for the fill-extrusion-color alpha channel
                // ("no-alpha-no-multiply"): the extrusion renders OPAQUE with
                // its color premultiplied by the alpha — expected.png shows
                // (lit×0.2, alpha=255), not alpha blending. An alpha of 0
                // removes the feature entirely (draw_fill_extrusion.ts
                // `color.a !== 0` gate / data-driven-zero-alpha).
                {
                    const c = MBTileDataEmitter.scaleColorByAlpha(
                        p['fill-extrusion-color'] ?? '#000000'
                    );
                    if (c === null) {
                        props.enabled = false;
                    } else {
                        props.color = c;
                    }
                }
                props.opacity = p['fill-extrusion-opacity'] ?? 1;
                // The engine's DepthPrePass (Less-depth colorWrite-off first
                // pass + EqualDepth main pass) composited translucent walls at
                // an effective 0.5×alpha on SwiftShader (probe-measured) —
                // disable it; mgl's two-pass depth trick is only needed to
                // hide interior surfaces of building CLUSTERS, which the
                // render-test fixtures (single giant boxes) don't exercise.
                props.enableDepthPrePass = false;
                props.height = p['fill-extrusion-height'] ?? 0;
                props.floorHeight = p['fill-extrusion-base'] ?? 0;
                props._translate = p['fill-extrusion-translate'] ?? [0, 0];
                props._translateAnchor = p['fill-extrusion-translate-anchor'] ?? 'map';
                // Disable the extrusion "grow" animation: AnimatedExtrusionHandler
                // defaults to enabled and, when it starts animating, injects old
                // extrusion shader chunks (geometryNormal) that conflict with the
                // current three.js normal_fragment_begin (nonPerturbedNormal),
                // failing the fragment shader compile and hiding all extrusions.
                props.animateExtrusion = false;
                if (p['fill-extrusion-pattern']) {
                    props._patternName = p['fill-extrusion-pattern'];
                    props._patternCrossFade = p['fill-extrusion-pattern-cross-fade'] ?? 1;
                    // ["image", a, b]: resolve the second candidate for
                    // two-texture blending (same as the fill-pattern path
                    // above) — mgl blends at ANY fade value (t=0 → A,
                    // t=1 → B), not only inside (0,1).
                    let rawXPat: any = (layer as any).paintDefs?.['fill-extrusion-pattern']?.value;
                    if (!Array.isArray(rawXPat) && typeof rawXPat === 'object') {
                        try { rawXPat = JSON.parse(JSON.stringify(rawXPat)); } catch { rawXPat = undefined; }
                    }
                    while (Array.isArray(rawXPat) && rawXPat[0] === 'memo') rawXPat = rawXPat[1];
                    if (Array.isArray(rawXPat) && rawXPat[0] === 'image') {
                        for (const cand of rawXPat.slice(1)) {
                            if (typeof cand === 'string' && cand !== props._patternName) {
                                props._patternName2 = cand;
                                break;
                            }
                        }
                    }
                }
                if (l.visibility === 'none') props.enabled = false;
                break;
            case 'heatmap':
                // Native pipeline has no 'heatmap' technique guard, so emit as
                // 'circles' (which produces point geometry) and flag it so the
                // MaterialPatchManager can apply a heatmap-style shader.
                props.technique = 'circles';
                props._isHeatmap = true;
                props.color = '#0000ff';
                props.opacity = p['heatmap-opacity'] ?? 1;
                props.size = p['heatmap-radius'] ?? 30;
                props._heatmapIntensity = p['heatmap-intensity'] ?? 1;
                props._heatmapWeight = p['heatmap-weight'] ?? 1;
                // Default ramp matches mapbox style-spec v8 (v8.json paint_heatmap).
                props._heatmapColorStops = p['heatmap-color'] ?? [
                    [0, 'rgba(0,0,255,0)'], [0.1, 'royalblue'], [0.3, 'cyan'],
                    [0.5, 'lime'], [0.7, 'yellow'], [1, 'red'],
                ];
                if (l.visibility === 'none') props.enabled = false;
                break;
            case 'hillshade':
                // Native pipeline has no 'hillshade' technique guard, so emit as
                // 'fill' (textured polygon) and flag it. The per-tile DEM url is
                // carried via feature properties (_hillshadeDemUrl) for the patcher.
                props.technique = 'fill';
                props._isHillshade = true;
                props._hillshadeDemUrl = properties?._hillshadeDemUrl ?? '';
                // Carry the source tileSize so the patcher can compute the DEM
                // border/buffer from the loaded image dimensions. Tile row/zoom
                // feed the mgl hillshade uniforms (latrange for the mercator
                // cos correction, overscaled zoom for the slope divisor).
                props._hillshadeTileSize = properties?._tileSize ?? 256;
                props._tileRow = properties?._tileRow ?? 0;
                props._tileZoom = properties?._tileZoom ?? 11;
                props.color = p['hillshade-shadow-color'] ?? '#000000';
                props.opacity = 1;
                props._hillshadeIntensity = p['hillshade-exaggeration'] ?? 0.5;
                props._hillshadeAccent = p['hillshade-accent-color'] ?? '#000000';
                props._hillshadeHighlight = p['hillshade-highlight-color'] ?? '#ffffff';
                if (l.visibility === 'none') props.enabled = false;
                break;
            case 'raster':
                props.technique = 'fill';
                props.color = '#ffffff';
                props.opacity = p['raster-opacity'] ?? 1;
                props._rasterTileUrl = properties?._rasterTileUrl ?? '';
                props._isRaster = true;
                // Parent-overzoom sub-rect [offX, offY, sclX, sclY] inside the
                // resolved ancestor tile image (flipY-adjusted).
                props._rasterUvRect = properties?._rasterUvRect ?? [0, 0, 1, 1];
                // Pass through raster color-adjustment paint properties
                // so MaterialPatchManager can inject them as shader uniforms.
                props._rasterHueRotate = p['raster-hue-rotate'] ?? 0;
                props._rasterBrightnessMin = p['raster-brightness-min'] ?? 0;
                props._rasterBrightnessMax = p['raster-brightness-max'] ?? 1;
                props._rasterSaturation = p['raster-saturation'] ?? 0;
                props._rasterContrast = p['raster-contrast'] ?? 0;
                props._rasterElevation = p['raster-elevation'] ?? 0;
                if (l.visibility === 'none') props.enabled = false;
                break;
            case 'model':
                props.technique = 'model';
                props.modelId = l['model-id'] ?? properties?.['model-id'] ?? '';
                props.opacity = p['model-opacity'] ?? 1;
                // mgl paint-driven transform (style-spec v8 model layer):
                // rotation degrees [x,y,z], scale (scalar or [x,y,z]),
                // translation meters [x,y,z]. Consumed by MBModelRenderer.
                props._modelRotation = p['model-rotation'] ?? l['model-rotation'];
                props._modelScale = p['model-scale'] ?? l['model-scale'];
                props._modelTranslation = p['model-translation'] ?? l['model-translation'];
                props._modelColor = p['model-color'];
                props._modelColorMixIntensity = p['model-color-mix-intensity'];
                if (l.visibility === 'none') props.enabled = false;
                break;
            case 'building':
                props.technique = 'extruded-polygon';
                props.color = p['building-color'] ?? '#cccccc';
                props.opacity = 1;
                props.height = p['building-height'] ?? properties?.height ?? properties?.['building-height'] ?? properties?.['height'] ?? 10;
                props.floorHeight = p['building-base'] ?? properties?.base ?? properties?.['building-base'] ?? 0;
                props._roofColor = p['building-roof-color'] ?? '#aaaaaa';
                if (l.visibility === 'none') props.enabled = false;
                break;
        }
        return props;
    }

    private static evaluatedCacheKey(layer: EvaluatedLayer): string {
        // Serialize the feature-evaluated paint/layout so data-driven properties
        // (circle-color/radius, line-width, fill-extrusion-height, icon/text-size…)
        // produce one technique per distinct value instead of baking the first
        // feature's value into a single per-layer technique.
        try {
            return `${JSON.stringify(layer.paint)}|${JSON.stringify(layer.layout)}`;
        } catch {
            return '';
        }
    }

    private getOrCreateTechniqueIndex(layer: EvaluatedLayer, properties?: Record<string, any>, symbolMode?: 'icon' | 'text'): number {
        // For text layers, technique key includes resolved text to allow per-feature text
        const textKey = layer.type === 'symbol' && layer.layout['text-field']
            ? resolveTextField(
                typeof layer.layout['text-field'] === 'string' ? layer.layout['text-field'] : '',
                properties ?? {},
            )
            : '';
        // Resolved icon tokens likewise key the technique — features with
        // different {token} values must not share the first feature's icon.
        const iconKey = layer.type === 'symbol' && typeof layer.layout['icon-image'] === 'string'
            && layer.layout['icon-image'].includes('{')
            ? resolveTextField(layer.layout['icon-image'], properties ?? {})
            : '';

        // Raster features carry their per-feature texture identity (tile URL
        // + ancestor sub-rect) in properties — two raster quads with the
        // same layer paint MUST NOT share a technique, or the first
        // feature's URL/uvRect wins for every quad (observed: one tile's
        // texture smeared across all raster quads of a layer).
        const rasterKey = layer.type === 'raster' && properties?._rasterTileUrl
            ? `${properties._rasterTileUrl}:${(properties._rasterUvRect ?? []).join(',')}`
            : '';
        const cacheKey = `${layer.id}:${symbolMode ?? ''}:${textKey}:${iconKey}:${rasterKey}:${MBTileDataEmitter.evaluatedCacheKey(layer)}`;
        let idx = this.m_layerToTechniqueIndex.get(cacheKey);
        if (idx === undefined) {
            idx = this.m_techniqueIndex++;
            this.m_layerToTechniqueIndex.set(cacheKey, idx);
            const props = this.paintToTechniqueProps(layer, properties, symbolMode);
            const preExtruded = props.technique === 'solid-line';
            // mgl draws a symbol layer's TEXT above its ICON (draw_symbol:
            // icons first, then text). The engine renders text below POI
            // layers of equal renderOrder, so lift the text technique by
            // half a style-index step — above its own icon, below the next
            // style layer (icon-text-fit/* fixtures showed text swallowed
            // by the label icon otherwise).
            const textLift = (layer.type === 'symbol' && symbolMode === 'text'
                && layer.layout['icon-image']) ? 0.5 : 0;
            const technique: any = {
                name: props.technique,
                _index: idx,
                _renderOrder: layer.renderOrder + textLift,
                renderOrder: layer.renderOrder + textLift, // Standard flywave property read by TileGeometryCreator
                // Explicit symbol-sort-key (mgl bucketParts sort) — undefined
                // when the layer never set it (insertion order then, NOT the
                // engine's internal default priority).
                _symbolSortKey: layer.layout['symbol-sort-key'],
                _layerId: layer.id,
                _paint: layer.paint,
                _layout: layer.layout,
                // mgl layer ordering: style layer order must dominate the
                // tile level in the engine's transparent-pass sort (see
                // TileObjectsRenderer.painterSortStable).
                _mbGlobalLayerOrder: true,
                // Lines are pre-extruded in JS (position already contains the
                // ribbon width); tell the material not to extrude again in GLSL.
                _preExtrudedLines: preExtruded,
                ...props,
            };
            if (preExtruded) {
                // Near-zero lineWidth → the SolidLineMaterial's shader extrusion
                // becomes negligible; the baked geometry provides the width.
                technique.lineWidth = 0.0001;
            }
            this.m_techniques.push(technique as IndexedTechnique);
        }
        return idx;
    }

    processFillFeature(
        layerName: string,
        extents: number,
        geometry: IPolygonGeometry[],
        properties: Record<string, any>,
        featureId: string | number | undefined,
        matchedLayers: EvaluatedLayer[],
    ): void {
        for (const layer of matchedLayers) {
            const techniqueIdx = this.getOrCreateTechniqueIndex(layer, properties);
            // §513 HD fill elevation: `fill-elevation-reference: hd-road-*`
            // lifts the feature onto its road curve PER VERTEX (curve
            // subdivision + sampled heights) instead of the anchor constant.
            const fillElevRef = layer.layout?.['fill-elevation-reference'];
            const fillHdMode = (fillElevRef === 'hd-road-base' || fillElevRef === 'hd-road-markup') &&
                this.m_elevationStructures !== null && !this.m_elevationStructures.isEmpty;
            this.m_currentZOffset = this.resolveZOffset(layer, properties, 'fill',
            geometry.length > 0 && geometry[0].rings.length > 0 && geometry[0].rings[0].length > 0
                ? { x: geometry[0].rings[0][0].x, y: geometry[0].rings[0][0].y }
                : undefined, fillHdMode);
            this.noteGeometryHeight(this.m_currentZOffset);
            // §244: injected per-tile background quads use the mgl-native fog
            // formula (mix(bgColor, fogColor, α²) band matches mgl exactly).
            if (properties?._sourceId === '__mb_background__') {
                (this.m_techniques[techniqueIdx] as any)._mbBgTile = true;
            }
            // Key by technique: a geometry's groups must all share one technique.
            // TileGeometryCreator builds one single-material object per group and
            // three.js then draws the object's ENTIRE index buffer with that
            // material — mixing techniques in one geometry makes the last-drawn
            // technique's color win for every feature (data-driven colors all
            // rendering with the same color).
            const key = `${layer.id}:fill:${techniqueIdx}`;
            const geo = this.getOrCreateGeometry(key);
            const featureStart = geo.indices.length;

            const isExtruded =
                this.m_techniques[techniqueIdx]?.name === 'extruded-polygon' ||
                layer.type === 'fill-extrusion' ||
                layer.type === 'building';

            if (isExtruded) {
                try {
                    if (geometry.length > 0 && geometry[0].rings.length > 0) {
                        const pt = geometry[0].rings[0][0];
                        const w0 = this.projectWorld(new THREE.Vector2(pt.x, pt.y));
                        (this as any).__feats = ((this as any).__feats ?? '') + '|' +
                            Math.round(w0.x) + ',' + Math.round(w0.y) + ',' + Math.round(w0.z);
                    }
                } catch {} // FEAT-PROBE (temp)
                this.emitExtrudedPolygon(
                    geo,
                    layer,
                    geometry,
                    techniqueIdx,
                    featureStart,
                    featureId,
                    properties,
                );
                continue;
            }

            // Raster / hillshade texture fills need tile-normalized UVs so the
            // patcher's texture sampling (raster imagery / DEM) maps over the
            // whole tile quad instead of collapsing to the (0,0) corner.
            const tech: any = this.m_techniques[techniqueIdx];
            const needsUv = Boolean(tech?._rasterTileUrl || tech?._hillshadeDemUrl);

            for (const polygon of geometry) {
                const rings = polygon.rings;
                if (rings.length === 0) continue;

                // fill-limit-number-holes: cap the number of interior rings.
                const maxHoles = layer.paint['fill-limit-number-holes'] as number | undefined;
                const effectiveRings = (maxHoles !== undefined && maxHoles >= 0)
                    ? [rings[0], ...rings.slice(1, 1 + maxHoles)]
                    : rings;

                // §513 HD road elevation: subdivide the rings along the
                // curve and emit per-vertex sampled heights. Portal
                // candidates come from the clipped pre-subdivision rings
                // (mgl handleFeature order), base mode only.
                if (fillHdMode) {
                    // Curves live in the tile-local frame — sample there,
                    // then shift the returned pieces back into the project
                    // frame (additive per-axis delta).
                    const yDelta = this.elevationYDelta(extents);
                    const toLocal = (rs: Array<Array<{ x: number; y: number }>>): Array<Array<{ x: number; y: number }>> =>
                        yDelta ? rs.map(r => r.map(p => ({ x: p.x, y: p.y - yDelta }))) : rs;
                    const plan = this.m_elevationStructures!.prepareFillGeometry(
                        properties, toLocal(effectiveRings),
                        fillElevRef === 'hd-road-markup', extents);
                    if (plan && yDelta) {
                        const back = (rs: Array<{ x: number; y: number }>): Array<{ x: number; y: number }> =>
                            rs.map(p => ({ x: p.x, y: p.y + yDelta }));
                        for (const piece of plan.pieces) {
                            piece.ring = back(piece.ring);
                            for (const hole of piece.holes) hole.ring = back(hole.ring);
                        }
                    }
                    if (plan) {
                        if (fillElevRef === 'hd-road-base') {
                            // mgl handleFeature: portal candidates from the
                            // clipped ORIGINAL polygon first, then the mesh
                            // state (verts/triangles/renderable edges).
                            this.m_elevationStructures!.addPortalCandidates(
                                plan.feature.id, plan.clippedRingsCanonical[0],
                                plan.isTunnel, plan.feature);
                            // fill-construct-bridge-guard-rail is a
                            // data-driven LAYOUT property (mgl default true).
                            const guardRailRaw = layer.layoutDefs?.['fill-construct-bridge-guard-rail'] ??
                                layer.layout?.['fill-construct-bridge-guard-rail'] ?? true;
                            const guardRail = guardRailRaw === true ||
                                (typeof guardRailRaw === 'object'
                                    ? MBExpressionEngine.evaluate(guardRailRaw, {
                                        zoom: this.m_zoom,
                                        feature: { properties, id: featureId } as any,
                                    } as any) !== false
                                    : Boolean(guardRailRaw));
                            const featureIndex = this.m_elevatedFeatureCounter++;
                            this.m_elevatedFeatureProps.set(featureIndex, {
                                properties, featureId, layer,
                            });
                            this.m_elevationStructures!.addElevatedFeature({
                                featureIndex,
                                guardRailEnabled: guardRail !== false,
                                isTunnel: plan.isTunnel,
                                pieces: plan.piecesCanonical,
                            });
                        }
                        let maxH = 0;
                        for (const piece of plan.pieces) {
                            for (const h of piece.heights) if (h > maxH) maxH = h;
                            this.emitElevatedFillPiece(geo, piece, extents, tech, plan.feature);
                        }
                        if (maxH > 0) this.noteGeometryHeight(maxH);
                        continue;
                    }
                    // No curve for this feature → renders flat (mgl:
                    // "elevated-mode features with no tiled elevation
                    // coverage render flat rather than being dropped").
                }

                // Use earcut for proper polygon triangulation with hole support
                const allVerts: number[] = [];
                const holeIndices: number[] = [];

                // Exterior ring
                for (const pt of effectiveRings[0]) {
                    allVerts.push(pt.x, pt.y);
                }

                // Interior rings (holes)
                for (let r = 1; r < effectiveRings.length; r++) {
                    holeIndices.push(allVerts.length / 2);
                    for (const pt of effectiveRings[r]) {
                        allVerts.push(pt.x, pt.y);
                    }
                }

                // Raster / hillshade tile quads carry GLOBAL tile coordinates
                // (e.g. raster y ~1.8e8 at level 17; hillshade quads decode to
                // global-row frames too — uv.y landed at 439..440 and clamped
                // the DEM into vertical stripes) — dividing by `extents`
                // yields uv values whose fractional part is constant,
                // collapsing the texture to horizontal bands. Normalize UVs by
                // the feature's own bbox (both providers emit exactly one
                // tile-covering quad per feature, so the bbox maps 1:1 onto
                // [0,1]²).
                let rbMinX = Infinity, rbMinY = Infinity, rbMaxX = -Infinity, rbMaxY = -Infinity;
                if (needsUv) {
                    for (let i = 0; i < allVerts.length; i += 2) {
                        if (allVerts[i] < rbMinX) rbMinX = allVerts[i];
                        if (allVerts[i] > rbMaxX) rbMaxX = allVerts[i];
                        if (allVerts[i + 1] < rbMinY) rbMinY = allVerts[i + 1];
                        if (allVerts[i + 1] > rbMaxY) rbMaxY = allVerts[i + 1];
                    }
                }

                // Triangulate with earcut
                const triIndices = earcut(allVerts, holeIndices.length > 0 ? holeIndices : null, 2);

                // §271: globe projection — subdivide the triangulation so the
                // fill hugs the sphere instead of cutting through it.
                let outVerts = allVerts;
                let outIndices = triIndices;
                if ((this.m_decodeInfo.targetProjection as any)?.type === 1 /* Spherical */) {
                    const tess = tessellateForSphere(
                        allVerts, triIndices, extents, this.m_decodeInfo);
                    outVerts = tess.verts;
                    outIndices = tess.indices;
                }

                // Project and store vertices
                const startIdx = geo.positions.length / 3;
                const vertCount2d = outVerts.length / 2;
                for (let i = 0; i < vertCount2d; i++) {
                    const w = this.project(
                        new THREE.Vector2(outVerts[i * 2], outVerts[i * 2 + 1])
                    );
                    // Keep the resolved `fill-z-offset` (m_currentZOffset is
                    // folded into `project()`); pushing 0 dropped it. mgl
                    // `raster-elevation` lifts raster tiles above the ground
                    // plane (meters, u_raster_elevation).
                    const rasElev = Number((tech as any)._rasterElevation ?? 0);
                    geo.positions.push(w.x, w.y, w.z + rasElev);
                    if (needsUv) {
                        if (rbMaxX > rbMinX && rbMaxY > rbMinY) {
                            geo.uvs.push(
                                (outVerts[i * 2] - rbMinX) / (rbMaxX - rbMinX),
                                (outVerts[i * 2 + 1] - rbMinY) / (rbMaxY - rbMinY),
                            );
                        } else {
                            geo.uvs.push(outVerts[i * 2] / extents, outVerts[i * 2 + 1] / extents);
                        }
                    }
                }

                // Store triangulated indices
                for (let i = 0; i < outIndices.length; i++) {
                    geo.indices.push(outIndices[i] + startIdx);
                }
            }

            // `fill-outline-color`: stroke the polygon boundary as a thin line.
            // mgl renders the outline with the `fillOutline` program — a 1px
            // screen-space AA stroke along the boundary segments (draw_fill.ts
            // stroke pass + lineIndexBuffer). Emit the exterior + hole rings as
            // pre-extruded solid-lines with the outline color.
            if (!needsUv && layer.paint?.['fill-outline-color']) {
                for (const polygon of geometry) {
                    const rings = polygon.rings;
                    if (rings.length === 0) continue;
                    this.emitFillOutline(layer, rings, properties, featureId);
                }
            }

            const count = geo.indices.length - featureStart;
            if (count > 0) {
                geo.groups.push({
                    start: featureStart,
                    count,
                    materialIndex: techniqueIdx,
                    sortKey: this.extractSortKey(layer),
                });
                geo.featureStarts.push(featureStart);
                geo.objInfos.push({ ...properties, $id: featureId ?? properties.$id ?? null });
            }
        }
    }

    /**
     * §513: emit one subdivided elevated-fill piece (exterior + holes)
     * with per-vertex sampled heights. The piece rings arrive in the
     * layer's extent units (prepareFillGeometry converts back from the
     * canonical elevation grid); positions project like any fill
     * (`project()` folds the explicit `fill-z-offset`) and each vertex's
     * curve height is added on top.
     */
    private emitElevatedFillPiece(
        geo: AccumulatedGeometry,
        piece: {
            ring: Array<{ x: number; y: number }>;
            heights: number[];
            holes: Array<{ ring: Array<{ x: number; y: number }>; heights: number[] }>;
        },
        extents: number,
        tech: any,
        _feature: unknown,
    ): void {
        void _feature;
        void extents;
        void tech;
        const allVerts: number[] = [];
        const allHeights: number[] = [];
        const holeIndices: number[] = [];

        const pushRing = (ring: Array<{ x: number; y: number }>, heights: number[]): void => {
            for (const pt of ring) allVerts.push(pt.x, pt.y);
            for (const h of heights) allHeights.push(h);
        };
        pushRing(piece.ring, piece.heights);
        for (const hole of piece.holes) {
            holeIndices.push(allVerts.length / 2);
            pushRing(hole.ring, hole.heights);
        }
        if (allVerts.length < 6) return;

        const triIndices = earcut(allVerts, holeIndices.length > 0 ? holeIndices : null, 2);

        const startIdx = geo.positions.length / 3;
        const vertCount2d = allVerts.length / 2;
        for (let i = 0; i < vertCount2d; i++) {
            const w = this.project(new THREE.Vector2(allVerts[i * 2], allVerts[i * 2 + 1]));
            geo.positions.push(w.x, w.y, w.z + allHeights[i]);
        }
        for (let i = 0; i < triIndices.length; i++) {
            geo.indices.push(triIndices[i] + startIdx);
        }
    }

    /** Per-tile HD elevated-structures bookkeeping (§513 mesh emission). */
    private m_elevatedFeatureCounter = 0;
    private m_elevatedFeatureProps: Map<number, {
        properties: Record<string, any>;
        featureId: string | number | undefined;
        layer: EvaluatedLayer;
    }> = new Map();

    /**
     * §513: build + emit the tile's elevated-structures mesh (bridge guard
     * rails / tunnel walls / tunnel entrances) as fill-technique geometry.
     * Called by the decoder after the main pass, before getDecodedTile —
     * mgl runs ElevatedStructures.construct after the evaluated portal
     * graph is pushed back.
     */
    emitElevatedStructures(): void {
        const structures = this.m_elevationStructures;
        if (!structures || structures.isEmpty) return;
        const mesh = structures.construct();
        if (!mesh || mesh.indices.length === 0) return;

        // Mesh x/y are canonical extent units in the tile-LOCAL frame (the
        // curves' frame) — scale into the layer's extent grid and add the
        // flip's global y offset back so project() lands in the tile window
        // like every other fill.
        const scale = this.m_extents > 0 && this.m_extents !== 4096
            ? this.m_extents / 4096 : 1;
        const yDelta = this.elevationYDelta(this.m_extents);
        const projected: number[] = new Array(mesh.positions.length);
        for (let i = 0; i < mesh.positions.length; i += 3) {
            const w = this.project(new THREE.Vector2(
                mesh.positions[i] * scale, mesh.positions[i + 1] * scale + yDelta));
            projected[i] = w.x; projected[i + 1] = w.y;
            projected[i + 2] = w.z + mesh.positions[i + 2];
            if (mesh.positions[i + 2] > 0) this.noteGeometryHeight(mesh.positions[i + 2]);
        }

        const segments: Array<{
            from: number; to: number;
            sections: Array<{ featureIndex: number; vertexStart: number }>;
            colorProp: string; key: string;
        }> = [
            { from: 0, to: mesh.tunnelStart, sections: mesh.bridgeSections,
              colorProp: 'fill-bridge-guard-rail-color', key: 'bridge' },
            { from: mesh.tunnelStart, to: mesh.indices.length, sections: mesh.tunnelSections,
              colorProp: 'fill-tunnel-structure-color', key: 'tunnel' },
        ];

        // One GEOMETRY per (mode, color) — a geometry's groups must all share
        // ONE technique (see processFillFeature): the renderer draws each
        // group object from the shared index buffer, so multiple colors as
        // groups of one geometry repaint the whole mesh with the last color.
        for (const seg of segments) {
            if (seg.to <= seg.from) continue;
            interface Bucket {
                techIdx: number;
                info: Record<string, any> | null;
                featureId: string | number | undefined;
                indices: number[];
            }
            const buckets = new Map<string, Bucket>();
            for (let si = 0; si < seg.sections.length; si++) {
                const section = seg.sections[si];
                const vEnd = si + 1 < seg.sections.length ? seg.sections[si + 1].vertexStart : Infinity;
                const info = this.m_elevatedFeatureProps.get(section.featureIndex);
                const sectionIndices: number[] = [];
                for (let i = seg.from; i < seg.to; i += 3) {
                    if (mesh.indices[i] >= section.vertexStart && mesh.indices[i] < vEnd) {
                        sectionIndices.push(
                            mesh.indices[i], mesh.indices[i + 1], mesh.indices[i + 2]);
                    }
                }
                if (sectionIndices.length === 0) continue;

                const layer = info?.layer;
                const raw = layer?.paintDefs?.[seg.colorProp]?.value ??
                    layer?.paint?.[seg.colorProp];
                let color: any = raw ?? 'rgba(241, 236, 225, 255)';
                if (color !== null && typeof color === 'object') {
                    color = MBExpressionEngine.evaluate(color, {
                        zoom: this.m_zoom,
                        feature: { properties: info?.properties, id: info?.featureId } as any,
                    } as any);
                }
                const techIdx = this.getOrCreateElevatedStructureTechnique(
                    layer, seg.key, String(color));
                const colorKey = `${layer?.id ?? 'none'}:${String(color)}`;
                let bucket = buckets.get(colorKey);
                if (!bucket) {
                    bucket = { techIdx, info: info?.properties ?? null, featureId: info?.featureId, indices: [] };
                    buckets.set(colorKey, bucket);
                }
                bucket.indices.push(...sectionIndices);
            }

            for (const [colorKey, bucket] of buckets) {
                const geo = this.getOrCreateGeometry(`__mb-elevated-${seg.key}:${colorKey}`);
                if (geo.positions.length === 0) {
                    for (let i = 0; i < projected.length; i++) geo.positions.push(projected[i]);
                }
                const groupStart = geo.indices.length;
                for (let i = 0; i < bucket.indices.length; i++) {
                    geo.indices.push(bucket.indices[i]);
                }
                geo.groups.push({
                    start: groupStart,
                    count: geo.indices.length - groupStart,
                    materialIndex: bucket.techIdx,
                });
                geo.featureStarts.push(groupStart);
                geo.objInfos.push({ ...(bucket.info ?? {}), $id: bucket.featureId ?? null });
            }
        }

        // §515 depth prepass (mgl drawDepthPrepass initialize/reset): the
        // underground footprint flattened onto the ground plane builds
        // implicit ground occlusion; the mask (tunnel structures + non-
        // tunnel roads) re-clears depth to far so entrances stay see-through.
        if (mesh.underground && (mesh.depthIndices.length > 0 || mesh.maskIndices.length > 0)) {
            const flat: number[] = new Array(mesh.positions.length);
            for (let i = 0; i < mesh.positions.length; i += 3) {
                const w = this.project(new THREE.Vector2(
                    mesh.positions[i] * scale, mesh.positions[i + 1] * scale + yDelta));
                flat[i] = w.x; flat[i + 1] = w.y; flat[i + 2] = w.z;
            }
            this.emitElevPrepass('ground', mesh.depthIndices, flat);
            this.emitElevPrepass('mask', mesh.maskIndices, flat);
        }
    }

    private emitElevPrepass(kind: 'ground' | 'mask', indices: number[], flat: number[]): void {
        if (indices.length === 0) return;
        const geo = this.getOrCreateGeometry(`__mb-elev-prepass-${kind}`);
        if (geo.positions.length === 0) {
            for (let i = 0; i < flat.length; i++) geo.positions.push(flat[i]);
        }
        const groupStart = geo.indices.length;
        for (let i = 0; i < indices.length; i++) geo.indices.push(indices[i]);
        const techIdx = this.getOrCreateElevPrepassTechnique(kind);
        geo.groups.push({
            start: groupStart,
            count: geo.indices.length - groupStart,
            materialIndex: techIdx,
        });
        geo.featureStarts.push(groupStart);
        geo.objInfos.push({});
    }

    private getOrCreateElevPrepassTechnique(kind: 'ground' | 'mask'): number {
        const key = `__mb-elev-prepass:${kind}`;
        let idx = this.m_layerToTechniqueIndex.get(key);
        if (idx === undefined) {
            idx = this.m_techniqueIndex++;
            this.m_layerToTechniqueIndex.set(key, idx);
            const technique: any = {
                name: 'fill',
                _index: idx,
                // Strictly before the road fills (9.6): ground footprint
                // first, mask second (mgl initialize → reset → geometry).
                renderOrder: kind === 'ground' ? 9.55 : 9.56,
                _renderOrder: kind === 'ground' ? 9.55 : 9.56,
                _layerId: '__mb-elev-prepass',
                _mbElevPrepass: kind,
                _mbGlobalLayerOrder: true,
                color: '#000000',
                opacity: 1,
            };
            this.m_techniques.push(technique as IndexedTechnique);
        }
        return idx;
    }

    private getOrCreateElevatedStructureTechnique(
        layer: EvaluatedLayer | undefined, mode: string, color: string,
    ): number {
        const key = `__mb-elevated-${mode}:${layer?.id ?? 'none'}:${color}`;
        let idx = this.m_layerToTechniqueIndex.get(key);
        if (idx === undefined) {
            idx = this.m_techniqueIndex++;
            this.m_layerToTechniqueIndex.set(key, idx);
            const technique: any = {
                name: 'fill',
                _index: idx,
                // Same late-pass band as the HD road fills (§512): coverage
                // quads occupy ro 2..9 — structures below ~9.6 get buried.
                // Rails sit above the base surface (9.6), tunnel walls below
                // the markup pass (9.8).
                renderOrder: mode === 'bridge' ? 9.65 : 9.7,
                _renderOrder: mode === 'bridge' ? 9.65 : 9.7,
                _layerId: layer?.id ?? '__mb-elevated',
                __elev: true,
                _mbGlobalLayerOrder: true,
                color,
                opacity: 1,
            };
            this.m_techniques.push(technique as IndexedTechnique);
        }
        return idx;
    }

    /**
     * Emit the boundary rings of a filled polygon as a thin baked fill ribbon
     * carrying the `fill-outline-color`. Mirrors mgl `fillOutline`: a ~1px
     * stroke along the polygon outline. Rings are closed polylines (exterior +
     * holes). Uses the same pre-extruded-ribbon approach as `emitRibbonFill`
     * (the SolidLineMaterial's GLSL extrusion does not rasterize on
     * SwiftShader, so the width is baked into `position` and a plain fill
     * technique renders the triangles).
     */
    private emitFillOutline(
        layer: EvaluatedLayer,
        rings: THREE.Vector2[][],
        properties: Record<string, any>,
        featureId: string | number | undefined,
    ): void {
        const outlineTechIdx = this.getOrCreateOutlineTechniqueIndex(layer);
        const key = `${layer.id}:fill-outline:${outlineTechIdx}`;
        const geo = this.getOrCreateGeometry(key);
        geo.edge = geo.edge ?? [];
        geo.dist = geo.dist ?? [];
        geo.len = geo.len ?? [];
        const featureStart = geo.indices.length;
        // mgl's fillOutline stroke is `alpha = 1 - smoothstep(0, 1, dist)` over
        // the boundary; with MSAA a 1px ribbon peaks ~50%. Bake a 2px-wide
        // ribbon so the center is fully opaque (matching the 1px visual).
        const lineWidthPx = 2;
        const metersPerPixel = EarthConstants.EQUATORIAL_CIRCUMFERENCE /
            (256 * Math.pow(2, this.m_zoom + 1));
        const worldHalfWidth = lineWidthPx * metersPerPixel / 2;

        for (const ring of rings) {
            if (ring.length < 2) continue;
            // Close the ring (mgl lineIndexBuffer draws segments between
            // consecutive vertices, including the closing edge).
            const closed = [...ring, ring[0]];

            const worldPts: number[] = [];
            for (const pt of closed) {
                const w = this.project(pt);
                worldPts.push(w.x, w.y, w.z);
            }

            // Reuse the join-aware ribbon body (miter joins at ring
            // corners, exactly like line rendering) instead of the legacy
            // averaged-bitangent bake.
            this.emitRibbonBody(layer, geo, worldPts, worldHalfWidth);
        }

        const count = geo.indices.length - featureStart;
        if (count > 0) {
            geo.groups.push({
                start: featureStart,
                count,
                materialIndex: outlineTechIdx,
                sortKey: this.extractSortKey(layer),
            });
            geo.featureStarts.push(featureStart);
            const fid = featureId ?? properties.$id ?? null;
            geo.objInfos.push({ ...properties, $id: fid });
        }
    }

    /**
     * Emit extruded-polygon geometry (fill-extrusion / building layers):
     * walls + roof triangles, a per-vertex `extrusionAxis` attribute and the
     * roof-outline `edgeIndex`. The mapview's extruded-polygon material
     * (MapMeshStandardMaterial + ExtrusionChunks) requires the `extrusionAxis`
     * attribute; without it the mesh silently fails to render.
     *
     * World coordinates are meters (R = equatorial circumference), so the
     * mapbox `fill-extrusion-height`/`base` meters map directly onto the Z
     * offset. For each footprint vertex two vertices are emitted: the bottom
     * (z = floorHeight, extrusionAxis.w = 0) and the top (z = height,
     * extrusionAxis = (0,0,height-floorHeight,1)); the roof uses the top
     * vertices of the earcut triangulation and the walls are quads around
     * every ring edge.
     */
    private emitExtrudedPolygon(
        geo: AccumulatedGeometry,
        layer: EvaluatedLayer,
        geometry: IPolygonGeometry[],
        techniqueIdx: number,
        featureStart: number,
        featureId: string | number | undefined,
        properties: Record<string, any>,
    ): void {
        // §283: the per-vertex DEM lift is baked below — flag it so the
        // material patcher's shader-side DEM add (§118) doesn't double-lift.
        if (this.m_terrainSampler) {
            (this.m_techniques[techniqueIdx] as any)._mbTerrainLifted = true;
        }
        // Building layers carry their height/base under building-* layout /
        // paint keys (style-spec v8 building layer), not fill-extrusion-*.
        const isBuildingLayer = layer.type === 'building';
        const rawHeight = (isBuildingLayer
            ? ((layer.layout as any)['building-height']
                ?? (layer.paint as any)['building-height']
                ?? properties?.height ?? properties?.['building-height'] ?? properties?.['height'] ?? 10)
            : layer.paint['fill-extrusion-height']) as number ?? 0;
        const rawFloor = (isBuildingLayer
            ? ((layer.layout as any)['building-base']
                ?? (layer.paint as any)['building-base']
                ?? properties?.base ?? properties?.['building-base'] ?? 0)
            : layer.paint['fill-extrusion-base']) as number ?? 0;
        // §294: mgl's effective vertical scale for style meters carries
        // sec(lat) TWICE on the flat-height path (scan optimum K=1.27 =
        // secLat@37.75°) but once on the per-vertex terrain path — apply the
        // extra factor per alignment below (flat 54761→48992, terrain stays).
        const extraScale =
            this.m_heightScaleFromTerrain
            && ((layer.paint as any)['fill-extrusion-height-alignment'] ?? 'flat') === 'flat'
                ? this.m_terrainHeightScale
                : 1;
        const floorHeight = rawFloor * this.m_terrainHeightScale * extraScale;
        // Avoid fully flat extrusions (normal computation / shader issues).
        const height = Math.max(rawFloor + 1, rawHeight) * this.m_terrainHeightScale * extraScale;
        this.noteGeometryHeight(height + this.m_currentZOffset);

        for (const polygon of geometry) {
            const rings = polygon.rings;
            if (rings.length === 0) continue;

            // Flatten ring vertices (tile-local 2D) and record hole offsets
            // for earcut.
            const allVerts: number[] = [];
            const holeIndices: number[] = [];
            for (const pt of rings[0]) allVerts.push(pt.x, pt.y);
            for (let r = 1; r < rings.length; r++) {
                holeIndices.push(allVerts.length / 2);
                for (const pt of rings[r]) allVerts.push(pt.x, pt.y);
            }
            const triIndices = earcut(allVerts, holeIndices.length > 0 ? holeIndices : null, 2);
            const ringCount = allVerts.length / 2;

            // Emit bottom + top vertices for every footprint vertex.
            // §279/§284: lift the footprint onto the DEM surface with mgl
            // alignment semantics (fill_extrusion.vertex.glsl is_flat_height
            // / is_flat_base): "flat" uses the FEATURE CENTROID elevation so
            // roofs/bases stay horizontal; "terrain" (base default) is
            // per-vertex.
            const heightAlign = (layer.paint as any)['fill-extrusion-height-alignment'] ?? 'flat';
            const baseAlign = (layer.paint as any)['fill-extrusion-base-alignment'] ?? 'terrain';
            const cw = this.m_decodeInfo.center;
            const grounds: number[] = new Array(ringCount);
            let centroidElev = 0;
            if (this.m_terrainSampler) {
                for (let i = 0; i < ringCount; i++) {
                    const w = this.project(
                        new THREE.Vector2(allVerts[i * 2], allVerts[i * 2 + 1])
                    );
                    grounds[i] = this.m_terrainSampler(w.x + cw.x, w.y + cw.y);
                }
                // mgl samples the DEM AT the polygon's area centroid (bucket
                // encodes centroid pos; shader flatElevation samples that
                // point) — not the average of per-vertex elevations (§290).
                let area = 0, cx = 0, cy = 0;
                for (let i = 0; i < ringCount; i++) {
                    const j = (i + 1) % ringCount;
                    const cross =
                        allVerts[i * 2] * allVerts[j * 2 + 1] -
                        allVerts[j * 2] * allVerts[i * 2 + 1];
                    area += cross;
                    cx += (allVerts[i * 2] + allVerts[j * 2]) * cross;
                    cy += (allVerts[i * 2 + 1] + allVerts[j * 2 + 1]) * cross;
                }
                if (Math.abs(area) > 1e-9) {
                    const wc = this.project(
                        new THREE.Vector2(cx / (3 * area), cy / (3 * area))
                    );
                    centroidElev = this.m_terrainSampler(wc.x + cw.x, wc.y + cw.y);
                } else {
                    centroidElev = grounds.reduce((a, b) => a + b, 0) / Math.max(ringCount, 1);
                }
            }
            const baseVertex = geo.positions.length / 3;
            // mgl wall pattern mapping (fill_extrusion_pattern.vertex.glsl:
            // pos = normal.z==1 ? pos_nx.xy : vec2(edgedistance,
            // z×height_factor)) — walls tile the pattern by PERIMETER
            // distance × height, not position.xy (which smears vertically).
            // Roof and wall share vertices here, so for pattern extrusions
            // emit roof-dedicated vertex copies carrying uv=(world x, world
            // y) while wall vertices carry uv=(edge distance, z) — the
            // patcher's mglComposite branch then reads uv directly.
            const isPatternExtrusion =
                !!(this.m_techniques[techniqueIdx] as any)?._patternName;
            const edgeDists: number[] = new Array(ringCount).fill(0);
            if (isPatternExtrusion) {
                for (let r = 0; r < rings.length; r++) {
                    const ring = rings[r];
                    const ringStart = r === 0 ? 0 : holeIndices[r - 1];
                    let acc = 0;
                    let prevW: THREE.Vector3 | null = null;
                    for (let i = 0; i < ring.length; i++) {
                        const vi = ringStart + i;
                        const w = this.project(
                            new THREE.Vector2(allVerts[vi * 2], allVerts[vi * 2 + 1])
                        );
                        if (prevW) acc += Math.hypot(w.x - prevW.x, w.y - prevW.y);
                        edgeDists[vi] = acc;
                        prevW = w;
                    }
                }
            }
            for (let i = 0; i < ringCount; i++) {
                const w = this.project(
                    new THREE.Vector2(allVerts[i * 2], allVerts[i * 2 + 1])
                );
                const ground = this.m_terrainSampler ? grounds[i] : 0;
                const baseGround = baseAlign === 'flat' ? centroidElev : ground;
                const topGround = heightAlign === 'flat' ? centroidElev : ground;
                // bottom vertex
                geo.positions.push(w.x, w.y, baseGround + floorHeight);
                geo.extrusionAxis.push(0, 0, 0, 0);
                if (isPatternExtrusion) geo.uvs.push(edgeDists[i], baseGround + floorHeight);
                // top vertex
                geo.positions.push(w.x, w.y, topGround + height);
                geo.extrusionAxis.push(0, 0, height - floorHeight, 1);
                if (isPatternExtrusion) geo.uvs.push(edgeDists[i], topGround + height);
            }

            // Shaped building roofs (mgl 3D buildings building-roof-shape):
            // replace the flat top with the shaped roof mesh; walls stay at
            // eave height (the shaped pass emits gable-end / rim walls itself).
            const roofShape = layer.type === 'building'
                ? ((layer.layout as any)['building-roof-shape']
                    ?? (layer.paint as any)['building-roof-shape']
                    ?? 'flat')
                : 'flat';
            if (roofShape !== 'flat') {
                this.emitShapedBuildingRoof(
                    geo, rings[0], grounds, baseVertex,
                    height, floorHeight, roofShape,
                    rawHeight, rawFloor, extraScale,
                    heightAlign, centroidElev,
                );
            } else if (isPatternExtrusion) {
                const roofBase = geo.positions.length / 3;
                for (let i = 0; i < ringCount; i++) {
                    const w = this.project(
                        new THREE.Vector2(allVerts[i * 2], allVerts[i * 2 + 1])
                    );
                    const ground = this.m_terrainSampler ? grounds[i] : 0;
                    const topGround = heightAlign === 'flat' ? centroidElev : ground;
                    geo.positions.push(w.x, w.y, topGround + height);
                    geo.extrusionAxis.push(0, 0, height - floorHeight, 1);
                    geo.uvs.push(w.x, w.y);
                }
                for (let i = 0; i < triIndices.length; i++) {
                    geo.indices.push(roofBase + triIndices[i]);
                }
            } else {
                for (let i = 0; i < triIndices.length; i++) {
                    geo.indices.push(baseVertex + triIndices[i] * 2 + 1);
                }
            }

            // Walls: a quad per ring edge (two triangles).
            for (let r = 0; r < rings.length; r++) {
                const ring = rings[r];
                const ringStart = r === 0 ? 0 : holeIndices[r - 1];
                for (let i = 0; i < ring.length; i++) {
                    const a = ringStart + i;
                    const b = ringStart + (i + 1) % ring.length;
                    const b0 = baseVertex + a * 2;
                    const t0 = b0 + 1;
                    const b1 = baseVertex + b * 2;
                    const t1 = b1 + 1;
                    geo.indices.push(b0, t0, t1, t1, b1, b0);
                }
            }

            // Roof outline (edge) indices — exterior ring top vertices.
            const edgeStart = geo.edgeIndex.length;
            const exterior = rings[0];
            for (let i = 0; i < exterior.length; i++) {
                const a = i;
                const b = (i + 1) % exterior.length;
                geo.edgeIndex.push(baseVertex + a * 2 + 1, baseVertex + b * 2 + 1);
            }
            geo.edgeFeatureStarts.push(edgeStart);
        }

        const count = geo.indices.length - featureStart;
        if (count > 0) {
            geo.groups.push({
                start: featureStart,
                count,
                materialIndex: techniqueIdx,
                sortKey: this.extractSortKey(layer),
            });
            geo.featureStarts.push(featureStart);
            geo.objInfos.push({ ...properties, $id: featureId ?? properties.$id ?? null });
        }
    }

    /**
     * Emit a shaped roof for a `building` layer (mgl 3D buildings
     * `building-roof-shape`: pyramidal / hipped / gabled / skillion /
     * mansard / parapet). Footprints are treated as quads (the common
     * building footprint); non-quad rings fall back to a pyramidal fan.
     *
     * All heights are the already-scaled world values matching
     * emitExtrudedPolygon; the roof rise follows mgl's proportional look
     * (ridge ≈ 1.3× wall height for a 10m building → rise = 0.3×wall).
     *
     * Winding: every triangle is oriented OUTWARD in world space —
     * near-horizontal faces up, near-vertical faces away from the footprint
     * centroid — so FrontSide culling keeps only exterior surfaces.
     */
    private emitShapedBuildingRoof(
        geo: AccumulatedGeometry,
        ring: { x: number; y: number }[],
        grounds: number[],
        baseVertex: number,
        height: number,
        floorHeight: number,
        roofShape: string,
        rawHeight: number,
        rawFloor: number,
        extraScale: number,
        heightAlign: string,
        centroidElev: number,
    ): void {
        // Dedup closing point.
        const pts = ring.slice();
        if (pts.length > 1) {
            const a = pts[0], b = pts[pts.length - 1];
            if (Math.abs(a.x - b.x) < 1e-9 && Math.abs(a.y - b.y) < 1e-9) pts.pop();
        }
        if (pts.length < 3) return;

        const rise = 0.3 * Math.max(rawHeight - rawFloor, 0) * this.m_terrainHeightScale * extraScale;
        const groundAt = (i: number) =>
            this.m_terrainSampler ? (heightAlign === 'flat' ? centroidElev : (grounds[i] ?? 0)) : 0;
        const topZ = (i: number) => groundAt(i) + height;

        const axisW = height - floorHeight;
        const addWorldVert = (wx: number, wy: number, z: number): number => {
            const idx = geo.positions.length / 3;
            geo.positions.push(wx, wy, z);
            geo.extrusionAxis.push(0, 0, axisW, 1);
            return idx;
        };

        // Footprint centroid in world coords, for the outward test.
        let ccx = 0, ccy = 0;
        for (const p of pts) { ccx += p.x; ccy += p.y; }
        ccx /= pts.length; ccy /= pts.length;
        const cw = this.project(new THREE.Vector2(ccx, ccy));
        const midZ = (this.m_terrainSampler ? centroidElev : 0) + height + 0.5 * rise;

        // pushTri takes tile-local xy + z; winding is fixed to outward.
        const pushTri = (
            ax: number, ay: number, az: number,
            bx: number, by: number, bz: number,
            cx: number, cy: number, cz: number,
        ) => {
            const aw = this.project(new THREE.Vector2(ax, ay));
            const bw = this.project(new THREE.Vector2(bx, by));
            const cwx = this.project(new THREE.Vector2(cx, cy));
            const ux = bw.x - aw.x, uy = bw.y - aw.y, uz = bz - az;
            const vx = cwx.x - aw.x, vy = cwx.y - aw.y, vz = cz - az;
            const nx = uy * vz - uz * vy;
            const ny = uz * vx - ux * vz;
            const nz = ux * vy - uy * vx;
            const nl = Math.hypot(nx, ny, nz) || 1;
            const gx = (aw.x + bw.x + cwx.x) / 3, gy = (aw.y + bw.y + cwx.y) / 3;
            let keep = true;
            if (Math.abs(nz) > 0.7 * nl) {
                keep = nz > 0; // horizontal face → up
            } else {
                keep = nx * (gx - cw.x) + ny * (gy - cw.y) > 0; // vertical face → away
            }
            const ia = addWorldVert(aw.x, aw.y, az);
            const ib = addWorldVert(bw.x, bw.y, bz);
            const ic = addWorldVert(cwx.x, cwx.y, cz);
            if (keep) geo.indices.push(ia, ib, ic);
            else geo.indices.push(ia, ic, ib);
        };
        // Top vertex of wall ring vertex i (shared with the eaves).
        const wallTop = (i: number) => baseVertex + i * 2 + 1;
        // Emit a vertical quad between two ring vertices (eaves z0) and two
        // raised copies (z1) — used for parapet rims / skillion wall fills.
        const pushWallQuad = (
            i: number, j: number, z1i: number, z1j: number,
        ) => {
            // Read the ring vertices' world positions from the wall tops.
            const pi = geo.positions[wallTop(i) * 3], pj = geo.positions[wallTop(j) * 3];
            const qi = geo.positions[wallTop(i) * 3 + 1], qj = geo.positions[wallTop(j) * 3 + 1];
            const zi = geo.positions[wallTop(i) * 3 + 2], zj = geo.positions[wallTop(j) * 3 + 2];
            const iUp = addWorldVert(pi, qi, z1i);
            const jUp = addWorldVert(pj, qj, z1j);
            const iTop = wallTop(i), jTop = wallTop(j);
            // Orientation fixed by the outward test on the vertical quad.
            const ux = pj - pi, uy = qj - qi;
            const outX = -(uy), outY = ux; // rotate edge dir -90°
            const gx = (pi + pj) / 2, gy = (qi + qj) / 2;
            const flip = outX * (gx - cw.x) + outY * (gy - cw.y) < 0;
            if (!flip) geo.indices.push(iTop, jTop, jUp, jUp, iUp, iTop);
            else geo.indices.push(iTop, iUp, jUp, jUp, jTop, iTop);
        };

        if (roofShape === 'parapet') {
            // Flat roof recessed slightly below a raised perimeter rim.
            const rp = Math.min(1.0, 0.1 * (height - floorHeight));
            for (let i = 0; i < pts.length; i++) {
                pushWallQuad(i, (i + 1) % pts.length, topZ(i) + rp, topZ((i + 1) % pts.length) + rp);
            }
            // Rim top face: outer ring at height + rp to inner ring at eaves.
            const outerUp: number[] = [], innerAt: number[] = [];
            for (let i = 0; i < pts.length; i++) {
                const w = this.project(new THREE.Vector2(pts[i].x, pts[i].y));
                outerUp.push(addWorldVert(w.x, w.y, topZ(i) + rp));
                const ix = ccx + (pts[i].x - ccx) * 0.97, iy = ccy + (pts[i].y - ccy) * 0.97;
                const wi = this.project(new THREE.Vector2(ix, iy));
                innerAt.push(addWorldVert(wi.x, wi.y, topZ(i)));
            }
            for (let i = 0; i < pts.length; i++) {
                const j = (i + 1) % pts.length;
                geo.indices.push(outerUp[i], outerUp[j], innerAt[j]);
                geo.indices.push(outerUp[i], innerAt[j], innerAt[i]);
            }
            // Inner flat roof (quad fan to centroid).
            const cIdx = addWorldVert(cw.x, cw.y, topZ(0));
            for (let i = 0; i < pts.length; i++) {
                const j = (i + 1) % pts.length;
                geo.indices.push(innerAt[i], innerAt[j], cIdx);
            }
            return;
        }

        // Quad-based shapes: order corners so p0→p1 is a LONG edge.
        let quad: { x: number; y: number }[] | null = null;
        if (pts.length === 4) {
            let longest = -1, start = 0;
            for (let i = 0; i < 4; i++) {
                const a = pts[i], b = pts[(i + 1) % 4];
                const len = (b.x - a.x) ** 2 + (b.y - a.y) ** 2;
                if (len > longest) { longest = len; start = i; }
            }
            quad = [pts[start], pts[(start + 1) % 4], pts[(start + 2) % 4], pts[(start + 3) % 4]];
        }

        const ridgeZ = (this.m_terrainSampler ? centroidElev : 0) + height + rise;

        if (roofShape === 'pyramidal' || !quad) {
            for (let i = 0; i < pts.length; i++) {
                const j = (i + 1) % pts.length;
                pushTri(pts[i].x, pts[i].y, topZ(i), pts[j].x, pts[j].y, topZ(j), ccx, ccy, ridgeZ);
            }
            return;
        }

        const [p0, p1, p2, p3] = quad; // p0→p1 long edge, p3→p2 the opposite
        const ux = p1.x - p0.x, uy = p1.y - p0.y;
        const uLen = Math.hypot(ux, uy) || 1;

        if (roofShape === 'hipped' || roofShape === 'gabled') {
            const inset = roofShape === 'hipped' ? Math.min(rise, 0.45 * uLen) : 0;
            const mid = (a: { x: number; y: number }, b: { x: number; y: number }) =>
                ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });
            const mA = mid(p0, p3), mB = mid(p1, p2);
            const ra = { x: mA.x + (ux / uLen) * inset, y: mA.y + (uy / uLen) * inset };
            const rb = { x: mB.x - (ux / uLen) * inset, y: mB.y - (uy / uLen) * inset };
            // Two long slopes (each split into two triangles along the ridge).
            pushTri(p0.x, p0.y, topZ(0), p1.x, p1.y, topZ(1), rb.x, rb.y, ridgeZ);
            pushTri(p0.x, p0.y, topZ(0), rb.x, rb.y, ridgeZ, ra.x, ra.y, ridgeZ);
            pushTri(p3.x, p3.y, topZ(3), p2.x, p2.y, topZ(2), rb.x, rb.y, ridgeZ);
            pushTri(p3.x, p3.y, topZ(3), rb.x, rb.y, ridgeZ, ra.x, ra.y, ridgeZ);
            // End walls: gable triangles (gabled) or hip slopes (hipped).
            pushTri(p1.x, p1.y, topZ(1), p2.x, p2.y, topZ(2), rb.x, rb.y, ridgeZ);
            pushTri(p0.x, p0.y, topZ(0), p3.x, p3.y, topZ(3), ra.x, ra.y, ridgeZ);
            return;
        }

        if (roofShape === 'skillion') {
            // Monopitch: p0/p1 side stays at eaves, p3/p2 side rises.
            const hi = (i: number) => topZ(i) + rise;
            pushTri(p0.x, p0.y, topZ(0), p1.x, p1.y, topZ(1), p2.x, p2.y, hi(2));
            pushTri(p0.x, p0.y, topZ(0), p2.x, p2.y, hi(2), p3.x, p3.y, hi(3));
            // Vertical wall fill on the high side (p3→p2 edge rises).
            pushTri(p3.x, p3.y, topZ(3), p2.x, p2.y, topZ(2), p2.x, p2.y, hi(2));
            pushTri(p3.x, p3.y, topZ(3), p2.x, p2.y, hi(2), p3.x, p3.y, hi(3));
            return;
        }

        if (roofShape === 'mansard') {
            // Steep lower slope (wall-like) to an inset ring, flat cap.
            const insetFrac = 0.05;
            const innerZ = (this.m_terrainSampler ? centroidElev : 0) + height + 0.75 * rise;
            const q = quad.map(p => ({ x: ccx + (p.x - ccx) * (1 - insetFrac), y: ccy + (p.y - ccy) * (1 - insetFrac) }));
            for (let i = 0; i < 4; i++) {
                const j = (i + 1) % 4;
                const k = (i + 2) % 4;
                pushTri(quad[i].x, quad[i].y, topZ(i), quad[j].x, quad[j].y, topZ(j), q[k].x, q[k].y, innerZ);
                pushTri(quad[i].x, quad[i].y, topZ(i), q[k].x, q[k].y, innerZ, q[i].x, q[i].y, innerZ);
            }
            // Flat cap (quad fan to center).
            const cIdx = addWorldVert(cw.x, cw.y, innerZ);
            const qIdx = q.map(p => {
                const w = this.project(new THREE.Vector2(p.x, p.y));
                return addWorldVert(w.x, w.y, innerZ);
            });
            for (let i = 0; i < 4; i++) {
                const j = (i + 1) % 4;
                geo.indices.push(qIdx[i], qIdx[j], cIdx);
            }
            return;
        }
    }

    // Interleaved vertex data for triangulated lines
    private m_lineInterleaved: number[] = [];
    private m_lineIndices: number[] = [];
    private m_lineGroupStarts: number[] = [];
    private m_lineSortKeys: number[] = [];
    private m_lineAttr: string[] = [];
    private m_preExtrudedLines = false;

    /**
     * §513: clip a polyline to the tile box ± 2 extent units (mgl
     * elevationType 'offset' border clip). Returns the inside pieces with
     * their start arc length within the FULL line, so per-vertex
     * line-progress stays anchored to the whole feature (mgl clipLine
     * preserves lineSoFar).
     */
    private clipLinePathsToTile(
        positions: THREE.Vector2[], extents: number,
    ): Array<{ positions: THREE.Vector2[]; startArc: number; totalArc: number }> {
        const m = 2;
        const minX = -m, minY = -m, maxX = extents + m, maxY = extents + m;

        const cum: number[] = [0];
        for (let i = 1; i < positions.length; i++) {
            cum.push(cum[i - 1] + Math.hypot(
                positions[i].x - positions[i - 1].x, positions[i].y - positions[i - 1].y));
        }
        const totalArc = cum[cum.length - 1] || 0;

        interface Piece { positions: THREE.Vector2[]; arcs: number[]; }
        const pieces: Piece[] = [];
        let current: Piece | null = null;
        const flush = (): void => {
            if (current && current.positions.length >= 2) pieces.push(current);
            current = null;
        };

        for (let i = 0; i < positions.length - 1; i++) {
            const x1 = positions[i].x, y1 = positions[i].y;
            const x2 = positions[i + 1].x, y2 = positions[i + 1].y;
            const dx = x2 - x1, dy = y2 - y1;
            let t0 = 0, t1 = 1;
            let rejected = false;
            const bounds: Array<[number, number]> = [
                [-dx, x1 - minX], [dx, maxX - x1],
                [-dy, y1 - minY], [dy, maxY - y1],
            ];
            for (const [p, q] of bounds) {
                if (p === 0) {
                    if (q < 0) { rejected = true; break; }
                } else {
                    const r = q / p;
                    if (p < 0) {
                        if (r > t1) { rejected = true; break; }
                        if (r > t0) t0 = r;
                    } else {
                        if (r < t0) { rejected = true; break; }
                        if (r < t1) t1 = r;
                    }
                }
            }
            if (rejected) {
                flush();
                continue;
            }
            const segArc = cum[i + 1] - cum[i];
            const cx1 = x1 + dx * t0, cy1 = y1 + dy * t0;
            const cx2 = x1 + dx * t1, cy2 = y1 + dy * t1;
            const a1 = cum[i] + segArc * t0;
            const a2 = cum[i] + segArc * t1;
            const last = current?.positions[current.positions.length - 1];
            if (!current || !last || last.x !== cx1 || last.y !== cy1) {
                flush();
                current = { positions: [new THREE.Vector2(cx1, cy1)], arcs: [a1] };
            }
            current!.positions.push(new THREE.Vector2(cx2, cy2));
            current!.arcs.push(a2);
        }
        flush();

        return pieces.map(p => ({
            positions: p.positions, startArc: p.arcs[0], totalArc,
        }));
    }

    processLineFeature(
        layerName: string,
        extents: number,
        geometry: ILineGeometry[],
        properties: Record<string, any>,
        featureId: string | number | undefined,
        matchedLayers: EvaluatedLayer[],
    ): void {
        const needsResample = (this.m_decodeInfo.targetProjection as any)?.mbCustomProjection === true;
        // §513: sea/ground offset lines drop geometry outside the tile
        // ± 2 extent units (mgl elevationType 'offset' dropOutOfBounds +
        // clipLine). Pre-cut each path once; pieces carry their arc offset
        // into the full line so line-progress stays feature-anchored.
        const anyOffsetLayer = matchedLayers.some(l => {
            const r = l.layout?.['line-elevation-reference'];
            return r === 'sea' || r === 'ground';
        });
        interface ClippedLinePath { positions: THREE.Vector2[]; startArc: number; totalArc: number; }
        const linePaths: ClippedLinePath[] | null = anyOffsetLayer && !needsResample
            ? geometry.flatMap(g => this.clipLinePathsToTile(g.positions, extents))
            : geometry.map(g => ({ positions: g.positions, startArc: 0, totalArc: 0 }));
        for (const layer of matchedLayers) {
            // A dasharray whose DASH elements are all zero renders nothing
            // (mgl collapses the zero-length dash ranges in the line atlas,
            // leaving only gaps) — the whole layer is invisible. This covers
            // [0], [0,0] and [0,0,0,0] alike (empty array [] stays solid:
            // mgl pushes a single 1 → a full line).
            const dashArr = layer.paint?.['line-dasharray'] as number[] | undefined;
            if (Array.isArray(dashArr) && dashArr.length >= 1 && dashSumDash(dashArr) <= 0) {
                continue;
            }
            const techniqueIdx = this.getOrCreateTechniqueIndex(layer, properties);
            // §513 HD line elevation (mgl line_bucket elevationType):
            //  - 'hd-road-markup' → 'road': sample the road curve per
            //    subdivided vertex (markup bias) — line-z-offset is ignored;
            //  - 'sea' / 'ground' → 'offset': evaluate the data-driven
            //    line-z-offset PER VERTEX with line-progress, dropping
            //    geometry outside the tile ± 2 extent (mgl dropOutOfBounds);
            //  - otherwise the legacy constant z-offset path.
            const lineElevRef = layer.layout?.['line-elevation-reference'];
            // mgl line_hd_extension: under terrain, HD road-markup lines
            // drape flat — the curve lookup (and any lift) is skipped.
            const lineTerrainFlat = this.terrainActive &&
                lineElevRef === 'hd-road-markup';
            const useHdRoad = !lineTerrainFlat && lineElevRef === 'hd-road-markup' &&
                this.m_elevationStructures !== null && !this.m_elevationStructures.isEmpty;
            const useZOffsetMode = !useHdRoad &&
                (lineElevRef === 'sea' || lineElevRef === 'ground');
            // Raw style value: the per-vertex evaluation needs the
            // expression form (mgl zOffsetValue.evaluate({lineProgress})).
            const zOffsetRaw = useZOffsetMode
                ? (layer.layoutDefs?.['line-z-offset'] ??
                  layer.layout?.['line-z-offset'] ??
                  layer.paint?.['line-z-offset'] ?? 0)
                : null;
            this.m_currentZOffset = (useHdRoad || useZOffsetMode || lineTerrainFlat)
                ? 0
                : this.resolveZOffset(layer, properties, 'line',
                    geometry.length > 0 && geometry[0].positions.length > 0
                        ? { x: geometry[0].positions[0].x, y: geometry[0].positions[0].y }
                        : undefined);
            this.noteGeometryHeight(this.m_currentZOffset);

            for (let __pathIdx = 0; __pathIdx < linePaths.length; __pathIdx++) {
                // Convert tile-local to world. Under a non-Mercator custom
                // projection, subdivide each segment first so straight
                // geographic lines bend smoothly when reprojected (Albers,
                // EqualEarth, …) instead of becoming chordal polylines.
                const lp = linePaths[__pathIdx];
                let pts = needsResample
                    ? resampleLinePoints(lp.positions, extents)
                    : lp.positions;

                // Progress bookkeeping for the offset mode: sub-paths cut at
                // the tile border keep their arc offset into the FULL line
                // (mgl clipLine preserves lineSoFar fractions).
                let progressBase = 0;
                let progressTotal = 0;
                if (anyOffsetLayer && !needsResample) {
                    if (lp.positions.length < 2) continue; // fully outside
                    progressBase = lp.startArc;
                    progressTotal = lp.totalArc;
                }

                // §513 per-vertex heights (meters). road mode: curve
                // sampling after subdivision; offset mode: line-z-offset
                // expression at per-vertex line-progress.
                let ptHeights: number[] | null = null;
                if (!needsResample && pts.length > 1) {
                    if (useHdRoad) {
                        const yDelta = this.elevationYDelta(extents);
                        const localPts = yDelta
                            ? pts.map(p => ({ x: p.x, y: p.y - yDelta }))
                            : pts.map(p => ({ x: p.x, y: p.y }));
                        const plan = this.m_elevationStructures!.prepareLineGeometry(
                            properties, localPts, true, extents);
                        if (plan) {
                            pts = plan.points.map(p => new THREE.Vector2(p.x, p.y + yDelta));
                            ptHeights = plan.heights;
                        }
                    } else if (useZOffsetMode) {
                        // Cumulative distance → line-progress per vertex.
                        const cum: number[] = [0];
                        let total = 0;
                        for (let i = 1; i < pts.length; i++) {
                            total += Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y);
                            cum.push(total);
                        }
                        // §548: line-elevation-ground-scale (data-driven,
                        // sea reference only — mgl line_bucket
                        // isSeaLevelReference gate). mix(1, exaggeration, gs)
                        // scales the z-offset when terrain exaggeration ≠ 1.
                        let zK = 1;
                        if (lineElevRef === 'sea' && this.m_terrainExaggeration !== 1) {
                            const gsRaw = layer.layoutDefs?.['line-elevation-ground-scale']
                                ?? layer.layout?.['line-elevation-ground-scale'];
                            if (gsRaw !== undefined && gsRaw !== null) {
                                let gs = gsRaw;
                                if (typeof gs === 'object') {
                                    gs = MBExpressionEngine.evaluate(gs, {
                                        zoom: this.m_zoom,
                                        feature: { properties, id: featureId } as any,
                                    } as any);
                                }
                                const gsn = Number(gs);
                                if (Number.isFinite(gsn) && gsn > 0) {
                                    zK = 1 + (this.m_terrainExaggeration - 1) * Math.min(1, gsn);
                                }
                            }
                        }
                        ptHeights = [];
                        for (let i = 0; i < pts.length; i++) {
                            const progress = progressTotal > 0
                                ? Math.min(1, (progressBase + cum[i]) / progressTotal)
                                : 0;
                            const ctxLine = {
                                zoom: this.m_zoom,
                                feature: { properties, id: featureId } as any,
                                lineProgress: progress,
                            };
                            const v = Number(MBExpressionEngine.evaluate(zOffsetRaw!, ctxLine));
                            ptHeights.push((Number.isFinite(v) ? v : 0) * zK);
                        }
                    }
                }

                const worldPts: number[] = [];
                let pathMaxH = 0;
                // §548: offset lines ride the DEM when terrain is live —
                // mgl line.vertex.glsl `ele = sample_elevation(offset_pos)
                // + scaled_z_offset` (fill-extrusion §279 sampler pattern).
                const cwLine = this.m_decodeInfo.center;
                for (let pi = 0; pi < pts.length; pi++) {
                    const pt = pts[pi];
                    const w = this.project(pt);
                    const h = ptHeights ? ptHeights[pi] : 0;
                    if (h > pathMaxH) pathMaxH = h;
                    let baseZ = w.z;
                    if (useZOffsetMode && this.m_terrainSampler) {
                        const g = this.m_terrainSampler(w.x + cwLine.x, w.y + cwLine.y);
                        if (Number.isFinite(g)) baseZ = g;
                    }
                    worldPts.push(w.x, w.y, baseZ + h);
                }
                if (pathMaxH > 0) this.noteGeometryHeight(pathMaxH);

                // `line-translate` [x east, y north] px: displace the
                // centerline in the map plane (baked geometrically — the
                // shader uniform path proved ineffective on the fill
                // materials). Measured against mgl references: +x moves the
                // rendering right, +y moves it DOWN (screen), so north is
                // the NEGATIVE world-y direction in this frame.
                //
                // mgl `painter.translatePosMatrix`: for `*-translate-anchor:
                // viewport` (tile-matrix path, inViewportPixelUnits=false) the
                // translate is rotated by +bearing in the map frame before being
                // applied (map anchor is unrotated). With bearing 90, viewport
                // [10,10] becomes [-10,10] (map frame). See below for the
                // matching rotation applied to tx/ty.
                const translate = layer.paint?.['line-translate'] as number[] | undefined;
                if (translate && (translate[0] !== 0 || translate[1] !== 0)) {
                    const mppT = EarthConstants.EQUATORIAL_CIRCUMFERENCE /
                        (256 * Math.pow(2, this.m_zoom + 1));
                    let tx = translate[0];
                    let ty = translate[1];
                    const anchor = layer.paint?.['line-translate-anchor'] ?? 'map';
                    if (anchor === 'viewport' && this.m_bearing !== 0) {
                        // mgl transform.angle = -bearing·π/180; translatePosMatrix
                        // uses angle = -transform.angle = +bearing·π/180 for
                        // viewport anchors, i.e. rotate the translate by +bearing.
                        const ang = this.m_bearing * Math.PI / 180;
                        const cos = Math.cos(ang);
                        const sin = Math.sin(ang);
                        const r0 = tx * cos - ty * sin;
                        const r1 = tx * sin + ty * cos;
                        tx = r0;
                        ty = r1;
                    }
                    const twx = tx * mppT;
                    const twy = -ty * mppT;
                    for (let i = 0; i < worldPts.length; i += 3) {
                        worldPts[i] += twx;
                        worldPts[i + 1] += twy;
                    }
                }

                // `line-offset` (px): mgl displaces the line in the VERTEX
                // SHADER (screen/tile space, invisible to tile clipping —
                // see AccumulatedGeometry.offs). The geometric bake truncated
                // offsets >~20px at tile boundaries, so the displacement now
                // rides the `aRibbonOffs` attribute and the ribbon patcher
                // adds it to `transformed.xy` after culling. The per-vertex
                // direction (segment right-normal, averaged at corners) is
                // recomputed inside emitRibbonBody/Caps on the deduped points.
                const offsetPx = Number(layer.paint?.['line-offset'] ?? 0);
                const center = this.m_decodeInfo.center;
                const mppOffset = EarthConstants.EQUATORIAL_CIRCUMFERENCE /
                    (256 * Math.pow(2, this.m_zoom + 1));
                // Under line-width-unit:meters the offset is metric too.
                const offsetUnit = layer.layout?.['line-width-unit'] ?? 'pixels';
                const offsetWorld = offsetPx !== 0 && worldPts.length >= 6
                    ? (offsetUnit === 'meters' ? offsetPx : offsetPx * mppOffset)
                    : 0;

                const lineGeom = createLineGeometry(center, worldPts, webMercatorProjection);

                // Pre-extrude the centerline ribbon in JS so the renderer does not
                // depend on the SolidLineMaterial's GLSL extrusion (which fails to
                // rasterize on SwiftShader). The shader is told to use `position`
                // directly via the `_preExtrudedLines` technique flag.
                const lineWidthPx = Number(layer.paint?.['line-width'] ?? 1);
                // Convert CSS px to world units at the DISPLAY zoom. The camera
                // is driven at mapbox zoom + 1 (see applyCameraSettings), so a
                // level-z tile renders at 512px rather than 256px. Pixel → world
                // is linear (no latitude term): the world tile at level z spans
                // EQUATORIAL_CIRCUMFERENCE/2^z, so one CSS pixel =
                // CIRCUMFERENCE/(256 * 2^displayZoom) with displayZoom = m_zoom+1.
                const metersPerPixel = EarthConstants.EQUATORIAL_CIRCUMFERENCE /
                    (256 * Math.pow(2, this.m_zoom + 1));
                // `line-width-unit: meters` — the width is metric. mgl
                // converts with tileToMeter (mercator_coordinate.ts), which
                // is LATITUDE-dependent: px per ground meter = equatorial
                // px/m ÷ cos(lat). Our world units are equatorial mercator
                // meters, so one ground meter = sec(lat) world units.
                // NOTE: line-width-unit is a LAYOUT property.
                const widthUnit = layer.layout?.['line-width-unit'] ?? 'pixels';
                const geoBox: any = (this.m_decodeInfo as any).geoBox;
                const latC = (Number(geoBox?.north ?? 0) + Number(geoBox?.south ?? 0)) / 2;
                const secLat = 1 / Math.max(0.2, Math.cos(latC * Math.PI / 180));
                // §518 line-gap-width — mgl line.vertex.glsl:308 is GEOMETRIC:
                // inset = gapwidth/2 + AA, outset = gapwidth/2 + width + AA.
                // Two opaque strips of `line-width` thickness centered at
                // ±(gap/2 + width/2); the gap is simply not covered. No alpha
                // carve — the §517 fragment carve needs blending (opaque ribbon
                // ignores alpha; transparent reorder breaks road compositing).
                // The strips ride the aRibbonOffs attribute like line-offset,
                // so tile clipping/culling never sees the displaced geometry.
                const gapWidthPx = Number(layer.paint?.['line-gap-width'] ?? 0);
                const hasGap = lineWidthPx > 0 && gapWidthPx > 0;
                const gapStripOffWorld = hasGap
                    ? (gapWidthPx / 2 + lineWidthPx / 2) * metersPerPixel
                    : 0;
                const worldHalfWidth = widthUnit === 'meters'
                    ? (lineWidthPx / 2) * secLat
                    : lineWidthPx * metersPerPixel / 2;
                // NOTE: blurring would want the ribbon geometry widened by
                // the blur radius, but in dense road networks the widened
                // ribbons overlap and stack into large black regions —
                // reverted; the fade is clipped at the line edge instead.
                // Variable-width lines: `line-width` may itself be a
                // line-progress interpolate (e.g. gradient-vector-tile:
                // 30px at progress 0.1 tapering to 0.5). The evaluator has
                // no line-progress input (it resolves to null there), so
                // parse the RAW stops and compute a per-vertex half width
                // from the cumulative distance.
                let progressHalfWidths: number[] | undefined;
                const rawWidthSpec = (layer as any).paintDefs?.['line-width']?.value;
                const pwStops = parseProgressStopsStatic(rawWidthSpec);
                if (pwStops && worldPts.length >= 6) {
                    const cn = worldPts.length / 3;
                    const segLens: number[] = [0];
                    let total = 0;
                    for (let i = 1; i < cn; i++) {
                        total += Math.hypot(
                            worldPts[i * 3] - worldPts[(i - 1) * 3],
                            worldPts[i * 3 + 1] - worldPts[(i - 1) * 3 + 1],
                            worldPts[i * 3 + 2] - worldPts[(i - 1) * 3 + 2],
                        );
                        segLens.push(total);
                    }
                    if (total > 0) {
                        const halfOf = (w: number) =>
                            widthUnit === 'meters' ? (w / 2) * secLat : (w * metersPerPixel) / 2;
                        // mgl line-progress on vector tiles is anchored to the
                        // FULL feature via the server-provided clip fractions
                        // (line_bucket.evaluateLineProgressFeatures:
                        // (totalFeatureLength·start + distance)/totalFeatureLength
                        // with lineClips from `mapbox_clip_start/end`).
                        // Variable width must evaluate at the SAME mapped
                        // progress or the taper lands in the wrong place.
                        // mgl per-sub-path clips (line_bucket.ts
                        // lineFeatureClips + multiLineMetricsIndex): sub-path
                        // 0 reads the unsuffixed props, sub-path N reads the
                        // `_N`-suffixed pair — multi-path line-metrics
                        // features carry one clip segment per sub-path.
                        const __suffix = __pathIdx > 0 ? `_${__pathIdx}` : '';
                        const cs = Number(properties?.['mapbox_clip_start' + __suffix]);
                        const ce = Number(properties?.['mapbox_clip_end' + __suffix]);
                        const clip: [number, number] | undefined =
                            Number.isFinite(cs) && Number.isFinite(ce) && ce > cs
                                ? [Math.max(0, cs), Math.min(1, ce)]
                                : undefined;
                        const mapP = (t: number) =>
                            clip ? clip[0] + t * (clip[1] - clip[0]) : t;
                        progressHalfWidths = segLens.map(sl =>
                            halfOf(interpProgressStops(pwStops, mapP(sl / total))));
                    }
                }
                // Bake extrusion into each vertex's position: pos += biTangent*hw*sign(ec.y)
                const verts = lineGeom.vertices;
                for (let v = 0; v < verts.length; v += 13) {
                    const sy = verts[v + 1] >= 0 ? 1 : -1; // sign of extrusionCoord.y
                    verts[v + 3] += verts[v + 9] * worldHalfWidth * sy;   // pos.x += biTangent.x*hw*sign
                    verts[v + 4] += verts[v + 10] * worldHalfWidth * sy;  // pos.y += biTangent.y*hw*sign
                    verts[v + 5] += verts[v + 11] * worldHalfWidth * sy;  // pos.z += biTangent.z*hw*sign
                }
                // Gradient / pattern / blurred lines render via the RIBBON
                // only: the SolidLine fallback path's gradient sampler uses
                // fract(vCoords.x) on the metric cumulative distance (noise)
                // and samples the sRGB ramp in the linear domain (2.2x
                // brightening); for blurred lines its OPAQUE copy covers the
                // ribbon's alpha ramp entirely. Drawing both also
                // double-blends translucent lines.
                const skipSolidLine = Boolean(
                    layer.paint?.['line-gradient'] ||
                    layer.paint?.['line-pattern'] ||
                    (Number(layer.paint?.['line-blur'] ?? 0) !== 0) ||
                    // Offset lines displace ONLY via the ribbon shader path —
                    // the SolidLine copy would render undisplaced underneath.
                    offsetWorld !== 0 ||
                    // Additive blend lines never render directly (mgl draws
                    // them only through the offscreen density composite) — an
                    // opaque SolidLine twin would underlie the composite and
                    // double-accumulate in the density pass.
                    layer.paint?.['line-blend-mode'] === 'additive' ||
                    hasGap);

                if (!skipSolidLine) this.m_preExtrudedLines = true;
                // Store interleaved vertex data + remapped indices
                const stride = 13; // extrusionCoord(3)+position(3)+tangent(3)+biTangent(4)
                const baseVert = this.m_lineInterleaved.length / stride;
                if (!skipSolidLine) {
                    this.m_lineInterleaved.push(...lineGeom.vertices);

                    for (const idx of lineGeom.indices) {
                        this.m_lineIndices.push(idx + baseVert);
                    }

                    const start = this.m_lineIndices.length - lineGeom.indices.length;
                    const fid = featureId ?? properties.$id ?? null;
                    this.m_lineGroupStarts.push(start, techniqueIdx);
                    this.m_lineSortKeys.push(this.extractSortKey(layer) ?? 0);
                    this.m_lineAttr.push(JSON.stringify({ ...properties, $id: fid }));
                }

                // Also emit the pre-extruded ribbon as a simple fill geometry so the
                // line renders even where the SolidLineMaterial shader extrusion
                // fails (SwiftShader). The fill technique carries the line color.
                // Cumulative centerline distance (0..1) feeds `line-gradient`.
                const cumDist: number[] = [0];
                for (let i = 1; i < worldPts.length / 3; i++) {
                    const d = Math.hypot(
                        worldPts[i * 3] - worldPts[(i - 1) * 3],
                        worldPts[i * 3 + 1] - worldPts[(i - 1) * 3 + 1],
                        worldPts[i * 3 + 2] - worldPts[(i - 1) * 3 + 2],
                    );
                    cumDist.push(cumDist[i - 1] + d);
                }
                // Under meters the shader's px width needs the conversion.
                // line-border: mgl draws the border as the OUTER ring of the
                // line-width (the main color fills the inner region; see
                // line.fragment.glsl border_width). Our two-ribbon approach
                // draws the border ribbon UNDER the main ribbon, so the main
                // ribbon must be NARROWED by the border width to reveal the
                // ring — otherwise the border is fully covered and invisible
                // (verified: thick-line-border rendered no black border).
                const bwRawBorder = Number(layer.paint?.['line-border-width'] ?? 0);
                const borderWorld = (bwRawBorder > 0 && !progressHalfWidths)
                    ? (widthUnit === 'meters' ? bwRawBorder * secLat : bwRawBorder * metersPerPixel)
                    : 0;
                const mainHalfWidth = Math.max(worldHalfWidth - borderWorld, 0);
                // mgl extrudes the line quad by ANTIALIASING (0.5px @dpr1) per
                // side (v_width2 = width/2 + ANTIALIASING) and fades the extra
                // with the edge smoothstep — dilate the ribbon the same way so
                // the patcher's AA ramp has coverage. Zero-width lines must
                // stay invisible (dilating them paints a 1px line).
                const aaDilate = lineWidthPx > 0 ? 0.5 * metersPerPixel : 0;
                const trueWidthPx = widthUnit === 'meters'
                    ? (lineWidthPx * secLat) / metersPerPixel : lineWidthPx;
                // NOTE: dash lines CANNOT simply drop the solid ribbon — the
                // SolidLineMaterial dash does not rasterize on SwiftShader, so
                // the ribbon is the only visible path. The dash pattern must be
                // rendered ON the ribbon (see the patcher's USE_DASHED_LINE
                // injection keyed by technique._dashSize/_gapSize).
                // Same per-sub-path clip semantics as the width lookup
                // above — the gradient COLOR ramp must anchor to the sub-path's
                // own segment (`_N` suffix), not the feature's first.
                const __sfx2 = __pathIdx > 0 ? `_${__pathIdx}` : '';
                const clipStart = Number(properties?.['mapbox_clip_start' + __sfx2]);
                const clipEnd = Number(properties?.['mapbox_clip_end' + __sfx2]);
                const progressClip: [number, number] | undefined =
                    Number.isFinite(clipStart) && Number.isFinite(clipEnd) && clipEnd > clipStart
                        ? [Math.max(0, clipStart), Math.min(1, clipEnd)]
                        : undefined;
                // §516: the ribbon carries the gap fraction for the
                // fragment discard (the native SolidLine twin is skipped
                // above — the ribbon IS the line for gap features).
                // §518: gap features emit TWO strips (mgl geometric inset/
                // outset); `gapStripOffWorld` displaces each via the
                // aRibbonOffs attribute. No gapFraction carve.
                if (gapStripOffWorld !== 0) {
                    this.emitRibbonFill(layer, worldPts, mainHalfWidth + aaDilate, cumDist,
                        lineWidthPx > 0 ? lineWidthPx + 1 : 0, lineGeom, progressHalfWidths,
                        offsetWorld + gapStripOffWorld, properties, progressClip);
                    this.emitRibbonFill(layer, worldPts, mainHalfWidth + aaDilate, cumDist,
                        lineWidthPx > 0 ? lineWidthPx + 1 : 0, lineGeom, progressHalfWidths,
                        offsetWorld - gapStripOffWorld, properties, progressClip);
                } else {
                    this.emitRibbonFill(layer, worldPts, mainHalfWidth + aaDilate, cumDist,
                        lineWidthPx > 0 ? lineWidthPx + 1 : 0, lineGeom, progressHalfWidths,
                        offsetWorld, properties, progressClip);
                }
                // line-border: edge ribbons under the main line (constant
                // width only — variable-width borders are not a test case).
                if (!progressHalfWidths) {
                    this.emitRibbonBorder(layer, worldPts, worldHalfWidth, cumDist, metersPerPixel, offsetWorld);
                }
            }
        }
    }


    /**
     * Split a world-space polyline at interior vertices where the bend
     * between adjacent segments exceeds `maxAngleDeg` (mgl getLineAnchors'
     * text-max-angle gate). Returns one segment per straight-enough run.
     */
    private splitPathByAngle(path: number[], maxAngleDeg: number): number[][] {
        const n = path.length / 3;
        if (n < 3) return [path];
        const maxRad = (maxAngleDeg * Math.PI) / 180;
        const segments: number[][] = [];
        let start = 0;
        for (let i = 1; i < n - 1; i++) {
            const ax = path[(i + 1) * 3] - path[i * 3];
            const ay = path[(i + 1) * 3 + 1] - path[i * 3 + 1];
            const bx = path[i * 3] - path[(i - 1) * 3];
            const by = path[i * 3 + 1] - path[(i - 1) * 3 + 1];
            const la = Math.hypot(ax, ay) || 1;
            const lb = Math.hypot(bx, by) || 1;
            const cos = (ax * bx + ay * by) / (la * lb);
            const turn = Math.acos(Math.max(-1, Math.min(1, cos)));
            if (turn > maxRad) {
                const seg = path.slice(start * 3, (i + 1) * 3);
                if (seg.length >= 6) segments.push(seg);
                start = i;
            }
        }
        const tail = path.slice(start * 3);
        if (tail.length >= 6) segments.push(tail);
        return segments.length > 0 ? segments : [path];
    }
    /**
     * Displace a polyline along the RIGHT normal of each segment (mgl's
     * positive line-offset direction in this frame), averaging the two
     * adjacent segment normals at vertices to avoid gaps at corners.
     * Mutates `pts` in place.
     */
    private offsetPolyline(pts: number[], ow: number): void {
        const cn = pts.length / 3;
        if (ow === 0 || cn < 2) return;
        const offs: number[] = [];
        for (let i = 0; i < cn - 1; i++) {
            const ux = pts[(i + 1) * 3] - pts[i * 3];
            const uy = pts[(i + 1) * 3 + 1] - pts[i * 3 + 1];
            const l = Math.hypot(ux, uy) || 1;
            offs.push(uy / l * ow, -ux / l * ow);
        }
        for (let i = 0; i < cn; i++) {
            const prev = Math.max(i - 1, 0);
            const next = Math.min(i, cn - 2);
            pts[i * 3] += (offs[prev * 2] + offs[next * 2]) / 2;
            pts[i * 3 + 1] += (offs[prev * 2 + 1] + offs[next * 2 + 1]) / 2;
        }
    }

    /**
     * `line-border` / `line-border-width`+`line-border-color`: two thin
     * ribbons along the main line's edges, rendered UNDER the main ribbon
     * (their fill technique has a slightly lower renderOrder). The border
     * centerlines are the main centerline offset by ±(halfWidth − borderW/2).
     */
    private emitRibbonBorder(
        layer: EvaluatedLayer,
        worldPts: number[],
        worldHalfWidth: number,
        cumDist: number[] | undefined,
        metersPerPixel: number,
        offsetWorld = 0,
    ): void {
        const bwRaw = Number(layer.paint?.['line-border-width'] ?? 0);
        if (!(bwRaw > 0) || worldPts.length < 6) return;
        // `line-border-color` default is `rgba(0,0,0,0)` in mgl — when left
        // unset the border color is auto-derived from the line color (mgl
        // `line.fragment.glsl` luminance modulation). An explicitly-set color
        // (including 'black') is used verbatim.
        const borderColor = MBTileDataEmitter.deriveAutoBorderColor(
            layer.paint?.['line-border-color'] ?? '#000000',
            layer.paint?.['line-color'] ?? '#000000');
        const meters = (layer.layout?.['line-width-unit'] ?? 'pixels') === 'meters';
        const bwWorld = meters ? bwRaw : bwRaw * metersPerPixel;
        const borderHalf = Math.min(bwWorld / 2, worldHalfWidth);
        const shift = worldHalfWidth - borderHalf;

        const borderTechIdx = this.getOrCreateBorderTechniqueIndex(layer, borderColor);
        const key = `${layer.id}:line-border:${borderTechIdx}`;
        const geo = this.getOrCreateGeometry(key);
        geo.edge = geo.edge ?? [];
        geo.dist = geo.dist ?? [];
        geo.len = geo.len ?? [];
        geo.offs = geo.offs ?? [];
        if (offsetWorld !== 0) {
            // The border is part of the line in mgl — the shader offset
            // displacement applies to it identically (the side-shift below
            // stays baked; only `line-offset` moves to the shader).
            (this.m_techniques[borderTechIdx] as any)._ribbonHasOffset = true;
        }
        const featureStart = geo.indices.length;

        for (const side of [1, -1]) {
            const pts = [...worldPts];
            this.offsetPolyline(pts, side * shift);
            this.emitRibbonBody(layer, geo, pts, borderHalf, cumDist, undefined, offsetWorld);
            this.emitRibbonCaps(layer, geo, pts, borderHalf, cumDist, undefined, offsetWorld);
        }

        const count = geo.indices.length - featureStart;
        if (count > 0) {
            geo.groups.push({
                start: featureStart,
                count,
                materialIndex: borderTechIdx,
                sortKey: this.extractSortKey(layer),
            });
            geo.featureStarts.push(featureStart);
            geo.objInfos.push({});
        }
    }

    private getOrCreateBorderTechniqueIndex(layer: EvaluatedLayer, borderColor: any): number {
        // Gradient stops are part of the key — runtime gradient updates must
        // rebuild the border ramp together with the main line's.
        const borderGradSig = layer.paint?.['line-gradient']
            ? JSON.stringify(layer.paint['line-gradient']).slice(0, 512) : '';
        const key = `${layer.id}:line-border-tech:${String(borderColor)}:${borderGradSig}`;
        let idx = this.m_layerToTechniqueIndex.get(key);
        if (idx === undefined) {
            idx = this.m_techniqueIndex++;
            this.m_layerToTechniqueIndex.set(key, idx);
            const paint = layer.paint ?? {};
            const technique: any = {
                name: 'fill',
                _index: idx,
                // Just below the main ribbon (+0.5) so the line covers the
                // border's inner halves.
                _renderOrder: layer.renderOrder + 0.4,
                renderOrder: layer.renderOrder + 0.4,
                _layerId: layer.id,
                _paint: { ...paint, 'fill-color': borderColor },
                _layout: layer.layout,
                _mbGlobalLayerOrder: true,
                _isLineRibbon: true,
                // The border ribbon renders UNDER the main line and, when the
                // line uses a gradient, mgl darkens the border by ×0.6 (its
                // auto-derived border is the gradient at the outer edge —
                // line.fragment.glsl `out_color.rgb *= (0.6 + 0.4*alpha2)`).
                _isLineBorder: true,
                _ribbonWidthPx: Number(paint['line-border-width'] ?? 1),
                _ribbonBlurPx: 0,
                // mgl draws the border with the same line gradient as the
                // main line (the border is part of the line's shader).
                ...(paint['line-gradient'] ? { _lineGradientStops: paint['line-gradient'] } : {}),
                color: borderColor,
                opacity: 1,
            };
            this.m_techniques.push(technique as IndexedTechnique);
        }
        return idx;
    }

    /**
     * Emit a pre-extruded line ribbon as a plain fill geometry (positions baked
     * into `position`, no shader extrusion). Falls back to the fill pipeline
     * which rasterizes triangles directly.
     */
    private emitRibbonFill(
        layer: EvaluatedLayer,
        worldPts: number[],
        worldHalfWidth: number,
        cumDist?: number[],
        effectiveWidthPx?: number,
        lineGeom?: { vertices: number[]; indices: number[] },
        hwPerPoint?: number[],
        offsetWorld = 0,
        properties?: Record<string, any>,
        progressClip?: [number, number],
    ): void {
        // Key by ribbon technique: see the fill key comment in
        // processFillFeature — groups sharing a geometry must use one technique,
        // otherwise every per-technique object draws the whole index buffer.
        const ribbonTechIdx = this.getOrCreateRibbonTechniqueIndex(layer, properties);
        if (effectiveWidthPx !== undefined) {
            // Dilated ribbon width in px (true width + 2×0.5px AA dilation) —
            // the patcher's edge AA ramp measures distances against it.
            (this.m_techniques[ribbonTechIdx] as any)._ribbonWidthPx = effectiveWidthPx;
        }
        const key = `${layer.id}:line-ribbon:${ribbonTechIdx}`;
        const geo = this.getOrCreateGeometry(key);
        geo.edge = geo.edge ?? [];
        geo.dist = geo.dist ?? [];
        geo.len = geo.len ?? [];
        geo.offs = geo.offs ?? [];
        if (offsetWorld !== 0) {
            (this.m_techniques[ribbonTechIdx] as any)._ribbonHasOffset = true;
        }
        const featureStart = geo.indices.length;

        this.emitRibbonBody(layer, geo, worldPts, worldHalfWidth, cumDist, hwPerPoint, offsetWorld, progressClip);
        this.emitRibbonCaps(layer, geo, worldPts, worldHalfWidth, cumDist, hwPerPoint, offsetWorld);

        // Use a fill technique so the mapview creates a simple fill material.
        const count = geo.indices.length - featureStart;
        if (count > 0) {
            geo.groups.push({
                start: featureStart,
                count,
                materialIndex: ribbonTechIdx,
                sortKey: this.extractSortKey(layer),
            });
            geo.featureStarts.push(featureStart);
            geo.objInfos.push({ ...(this.m_lineAttr.length > 0 ? JSON.parse(this.m_lineAttr[this.m_lineAttr.length - 1]) : {}), $id: null });
        }
    }

    /**
     * Generate the ribbon body polygon honoring `line-join` (miter with
     * `line-miter-limit` fallback / bevel / round), aligned with mgl's
     * `line_bucket` join geometry. The ribbon is a simple polygon: the two
     * offset side curves of the centerline, joined per vertex — the OUTER side
     * of a turn gets the join geometry (miter apex / bevel edge / arc fan),
     * the INNER side converges to the intersection of the two offset lines
     * (clamped like a miter, so sharp turns do not spike). Triangulated with
     * earcut; triangles are re-oriented CCW for the FrontSide fill material.
     */
    private emitRibbonBody(
        layer: EvaluatedLayer,
        geo: AccumulatedGeometry,
        worldPts: number[],
        worldHalfWidth: number,
        cumDist?: number[],
        hwPerPoint?: number[],
        offsetWorld = 0,
        progressClip?: [number, number],
    ): void {
        const n0 = worldPts.length / 3;
        if (n0 < 2) return;
        const closed =
            n0 > 3 &&
            Math.abs(worldPts[0] - worldPts[(n0 - 1) * 3]) < 1e-9 &&
            Math.abs(worldPts[1] - worldPts[(n0 - 1) * 3 + 1]) < 1e-9;
        const m0 = closed ? n0 - 1 : n0;
        // Drop consecutive duplicate points — they yield zero-length segments
        // and degenerate normals.
        const pts: number[] = [];
        const rawD: number[] = [];
        const rawHW: number[] = [];
        for (let i = 0; i < m0; i++) {
            const m = pts.length / 3;
            if (m > 0 &&
                Math.abs(worldPts[i * 3] - worldPts[(m - 1) * 3]) < 1e-12 &&
                Math.abs(worldPts[i * 3 + 1] - worldPts[(m - 1) * 3 + 1]) < 1e-12 &&
                Math.abs(worldPts[i * 3 + 2] - worldPts[(m - 1) * 3 + 2]) < 1e-12) {
                continue;
            }
            pts.push(worldPts[i * 3], worldPts[i * 3 + 1], worldPts[i * 3 + 2]);
            rawD.push(cumDist ? cumDist[i] : i);
            rawHW.push(hwPerPoint ? hwPerPoint[i] : worldHalfWidth);
        }
        while (pts.length / 3 > 1 && closed) {
            const m = pts.length / 3;
            if (Math.abs(pts[0] - pts[(m - 1) * 3]) < 1e-12 &&
                Math.abs(pts[1] - pts[(m - 1) * 3 + 1]) < 1e-12) {
                pts.length -= 3;
                rawD.length -= 1;
                rawHW.length -= 1;
            } else break;
        }
        const np = pts.length / 3;
        if (np < (closed ? 3 : 2)) return;
        const n = np;
        // `line-offset` shader displacement vectors (world units): per-point
        // segment right-normal scaled by `offsetWorld`, averaged between the
        // two adjacent segment normals at interior vertices — exactly the
        // math the former geometric bake (offsetPolyline) applied to the
        // positions. Now it rides the aRibbonOffs attribute so tile
        // clipping/culling never sees the displaced geometry (mgl parity).
        geo.offs = geo.offs ?? [];
        const offsAt = (i: number): [number, number] => {
            if (offsetWorld === 0) return [0, 0];
            const seg = (k: number): [number, number] => {
                const j = closed ? (k + 1) % n : Math.min(k + 1, n - 1);
                const ux = pts[j * 3] - pts[k * 3];
                const uy = pts[j * 3 + 1] - pts[k * 3 + 1];
                const l = Math.hypot(ux, uy) || 1;
                return [uy / l * offsetWorld, -ux / l * offsetWorld];
            };
            if (n < 2) return [0, 0];
            if (!closed && i === 0) return seg(0);
            if (!closed && i >= n - 1) return seg(n - 2);
            const a = seg((i - 1 + n) % n);
            const b = seg(i);
            return [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
        };
        // Normalized 0..1 distance along the feature for line-gradient.
        let total = rawD[n - 1];
        if (closed) {
            total += Math.hypot(
                pts[0] - pts[(n - 1) * 3],
                pts[1] - pts[(n - 1) * 3 + 1],
                pts[2] - pts[(n - 1) * 3 + 2],
            );
        }
        const distAt = (i: number) => {
            const t = rawD[((i % n) + n) % n];
            const p = total > 0 ? t / total : 0;
            // mgl anchors vector-tile line-progress to the FULL feature via
            // `mapbox_clip_start/end` (lineClips) — the tile-clipped part maps
            // into [start, end] instead of restarting at 0 (line_bucket.ts
            // evaluateLineProgressFeatures).
            return progressClip ? progressClip[0] + p * (progressClip[1] - progressClip[0]) : p;
        };
        // Absolute distance (world meters) for line-pattern tiling.
        const lenAt = (i: number) => rawD[((i % n) + n) % n];
        // Per-point half width (variable-width / line-progress lines).
        const hwAt = (i: number) => rawHW[((i % n) + n) % n];
        const join = String(layer.layout?.['line-join'] ?? 'miter');
        const miterLimit = Number(layer.layout?.['line-miter-limit'] ?? 2);
        const roundLimit = Number(layer.layout?.['line-round-limit'] ?? 1.05);

        // `line-join: none` — mgl (line_bucket.ts:714-743) draws each segment
        // as an independent line whose split ends carry SQUARE caps: every
        // middle corner (angle > 5°, COS_STRAIGHT_CORNER) closes the previous
        // segment with endLeft=endRight=1 and starts the next with -1,-1 (a
        // half-width extension along the segment direction), and the
        // feature's LAST vertex also closes with 1,1. Only the feature's
        // FIRST vertex stays butt (the (isPolygon || joinNone) ? 'butt' cap
        // at line 709 applies to it — the joinNone block intercepts the end
        // vertex first). Straight corners (< 5°) fall back to miter (the
        // segments connect; keep them as one rectangle).
        if (join === 'none') {
            const STRAIGHT_COS = Math.cos(5 * Math.PI / 180);
            // Patterned none-lines (mgl patternJoinNone) keep the raw segment
            // extent: the square-cap extension would shift the pattern phase
            // (end-offset fixtures measured +753~789px with it).
            const patternedNone = layer.paint?.['line-pattern'] !== undefined ||
                layer.paint?.['line-dasharray'] !== undefined;
            // mgl patternJoinNone = hasPattern && joinNone — the per-segment
            // `a_linesofar` reset (below) applies to LINE-PATTERN only;
            // dasharray lines keep the feature's accumulated phase.
            const patternJoinNone = layer.paint?.['line-pattern'] !== undefined;
            const segCount = closed ? n : n - 1;
            // Straight runs are emitted as ONE rectangle (miter-equivalent):
            // walk a run start forward while the endpoint continues straight.
            let runStart = 0;
            for (let s = 0; s < segCount; s++) {
                const e = (s + 1) % n;
                // Straight-corner fallback: collinear continuation → defer to
                // the segment that ends at the run's real corner/end.
                if (!closed && e < n - 1) {
                    const ex1 = pts[(e + 1) * 3] - pts[e * 3];
                    const ey1 = pts[(e + 1) * 3 + 1] - pts[e * 3 + 1];
                    const l1 = Math.hypot(ex1, ey1) || 1;
                    const ex0 = pts[e * 3] - pts[s * 3];
                    const ey0 = pts[e * 3 + 1] - pts[s * 3 + 1];
                    const l0 = Math.hypot(ex0, ey0) || 1;
                    if ((ex1 / l1) * (ex0 / l0) + (ey1 / l1) * (ey0 / l0) > STRAIGHT_COS) continue;
                }
                const s0 = runStart;
                runStart = e;
                let ux = pts[e * 3] - pts[s0 * 3];
                let uy = pts[e * 3 + 1] - pts[s0 * 3 + 1];
                const l = Math.hypot(ux, uy) || 1;
                ux /= l; uy /= l;
                const nx = -uy, ny = ux; // left normal
                const extS = patternedNone || (s0 === 0 && !closed) ? 0 : hwAt(s0); // butt at feature start
                const extE = patternedNone ? 0 : hwAt(e);                            // square cap at every close
                const ax = pts[s0 * 3] - ux * extS, ay = pts[s0 * 3 + 1] - uy * extS, az = pts[s0 * 3 + 2];
                const bx = pts[e * 3] + ux * extE, by = pts[e * 3 + 1] + uy * extE, bz = pts[e * 3 + 2];
                const hwS = hwAt(s0), hwE = hwAt(e);
                const oS = offsAt(s0), oE = offsAt(e);
                const base = geo.positions.length / 3;
                geo.positions.push(
                    ax + nx * hwS, ay + ny * hwS, az,
                    bx + nx * hwE, by + ny * hwE, bz,
                    bx - nx * hwE, by - ny * hwE, bz,
                    ax - nx * hwS, ay - ny * hwS, az,
                );
                geo.edge!.push(1, 1, -1, -1);
                if (patternJoinNone) {
                    // mgl patternJoinNone resets `a_linesofar` per sub-segment
                    // (addHalfVertex: lineSoFar - segmentStart) — dashes and
                    // gradients restart at every split, they do NOT continue
                    // the feature's accumulated phase.
                    const segLen = Math.max(lenAt(e) - lenAt(s0), 1e-6);
                    const d0 = 0, dE = 1;
                    const l0 = 0, lE = lenAt(e) - lenAt(s0);
                    void segLen;
                    geo.dist!.push(d0, dE, dE, d0);
                    geo.len!.push(l0, lE, lE, l0);
                } else {
                    geo.dist!.push(distAt(s0), distAt(e), distAt(e), distAt(s0));
                    geo.len!.push(lenAt(s0), lenAt(e), lenAt(e), lenAt(s0));
                }
                geo.offs!.push(oS[0], oS[1], oE[0], oE[1], oE[0], oE[1], oS[0], oS[1]);
                // CCW (viewed from +Z) for the FrontSide fill material.
                geo.indices.push(base, base + 3, base + 2, base, base + 2, base + 1);
            }
            return;
        }

        // Unit direction of the outgoing segment at each point (wraps when
        // closed; at the LAST point of an open line, keep the incoming
        // direction — wrapping there builds a bowtie ring).
        const dx: number[] = [];
        const dy: number[] = [];
        for (let i = 0; i < n; i++) {
            const j = closed ? (i + 1) % n : i + 1;
            if (!closed && j >= n) {
                // Last point of an open line: keep the incoming direction.
                dx.push(dx[i - 1]);
                dy.push(dy[i - 1]);
                continue;
            }
            const ux = pts[j * 3] - pts[i * 3];
            const uy = pts[j * 3 + 1] - pts[i * 3 + 1];
            const l = Math.hypot(ux, uy) || 1;
            dx.push(ux / l);
            dy.push(uy / l);
        }

        const px = (i: number) => pts[((i % n) + n) % n * 3];
        const py = (i: number) => pts[((i % n) + n) % n * 3 + 1];
        const pz = (i: number) => pts[((i % n) + n) % n * 3 + 2];

        // Robust construction: per-segment TRAPEZOIDS whose inner ends
        // converge to the offset-line intersection, plus outer-side JOIN
        // WEDGES that share edges with the trapezoids exactly — zero
        // overlap, zero gap. (A global offset ring + earcut
        // self-intersects when segments are shorter than the line width —
        // the tile-clipped fragments vector tiles are full of — and plain
        // rectangles overlap at every corner, which double-blends on
        // alpha-blended ribbon materials.)
        const pushV = (x: number, y: number, z: number, e: number, d: number, l: number, o: [number, number] = [0, 0]): number => {
            geo.positions.push(x, y, z);
            geo.edge!.push(e);
            geo.dist!.push(d);
            geo.len!.push(l);
            geo.offs!.push(o[0], o[1]);
            return geo.positions.length / 3 - 1;
        };
        const p3 = geo.positions;
        const pushTri = (i: number, j: number, k: number) => {
            const area2 =
                (p3[j * 3] - p3[i * 3]) * (p3[k * 3 + 1] - p3[i * 3 + 1]) -
                (p3[j * 3 + 1] - p3[i * 3 + 1]) * (p3[k * 3] - p3[i * 3]);
            if (area2 >= 0) geo.indices.push(i, j, k);
            else geo.indices.push(i, k, j);
        };

        // 1) Per-segment rectangles (butt ends; overlaps at corners are
        // covered by the join wedges and are invisible for opaque lines).
        // Variable-width lines produce trapezoids (per-end half widths).
        const segCount = closed ? n : n - 1;
        for (let s = 0; s < segCount; s++) {
            const e = (s + 1) % n;
            const ux = dx[s], uy = dy[s];
            const nx = -uy, ny = ux; // left normal
            const dS = distAt(s), dE = distAt(e), lS = lenAt(s), lE = lenAt(e);
            const hwS = hwAt(s), hwE = hwAt(e);
            const oS = offsAt(s), oE = offsAt(e);
            const a1 = pushV(px(s) + nx * hwS, py(s) + ny * hwS, pz(s), 1, dS, lS, oS);
            const a2 = pushV(px(e) + nx * hwE, py(e) + ny * hwE, pz(e), 1, dE, lE, oE);
            const b1 = pushV(px(e) - nx * hwE, py(e) - ny * hwE, pz(e), -1, dE, lE, oE);
            const b2 = pushV(px(s) - nx * hwS, py(s) - ny * hwS, pz(s), -1, dS, lS, oS);
            pushTri(a1, b2, b1);
            pushTri(a1, b1, a2);
        }

        // 2) Outer-side join wedges at interior vertices (closed lines wrap:
        // every vertex is a corner; open lines skip the two endpoints).
        // The wedge shares its edges with the adjacent trapezoids' outer
        // corners exactly — no overlap, no gap.
        const firstCorner = closed ? 0 : 1;
        const lastCorner = closed ? n : n - 1;
        for (let i = firstCorner; i < lastCorner; i++) {
            const iN = (i - 1 + n) % n;
            const cx = px(i), cy = py(i), cz = pz(i);
            const cross = dx[iN] * dy[i] - dy[iN] * dx[i];
            if (cross === 0) continue; // collinear — rectangles already touch
            // Outer side: left turn (cross > 0) -> right side (-1).
            const s = cross > 0 ? -1 : 1;
            const pnx = -dy[iN] * s, pny = dx[iN] * s;
            const nx = -dy[i] * s, ny = dx[i] * s;
            const dI = distAt(i), lI = lenAt(i);
            const oI = offsAt(i);
            const dot = pnx * nx + pny * ny;
            const mLen = dot > 1e-6 ? 1 / dot : Infinity;
            // mgl `line-round-limit` (line_bucket.ts): a round join splits to
            // miter when miterLength = 1/cos(halfTurn) < roundLimit (default
            // 1.05 ⇒ turns below ~35.5°), NOT when the turn angle itself
            // reaches roundLimit (that would only round turns > 60°, leaving
            // missing crescents in the 35.5°–60° band).
            const cosHalfTurn = Math.max(0, Math.sqrt((1 + Math.max(-1, Math.min(1,
                dx[iN] * dx[i] + dy[iN] * dy[i]))) / 2));
            const useRound = join === 'round' &&
                (cosHalfTurn <= 1e-6 || 1 / cosHalfTurn >= roundLimit);
            if (useRound) {
                const cV = pushV(cx, cy, cz, 0, dI, lI, oI);
                const a0 = Math.atan2(pny, pnx);
                let d = Math.atan2(ny, nx) - a0;
                while (d > Math.PI) d -= 2 * Math.PI;
                while (d < -Math.PI) d += 2 * Math.PI;
                const K = Math.max(1, Math.ceil(Math.abs(d) / (Math.PI / 8)));
                let prev = pushV(cx + Math.cos(a0) * hwAt(i), cy + Math.sin(a0) * hwAt(i), cz, s, dI, lI, oI);
                for (let k = 1; k <= K; k++) {
                    const th = a0 + (d * k) / K;
                    const v = pushV(cx + Math.cos(th) * hwAt(i), cy + Math.sin(th) * hwAt(i), cz, s, dI, lI, oI);
                    pushTri(cV, prev, v);
                    prev = v;
                }
            } else if ((join === 'miter' || join === 'round') && mLen <= miterLimit) {
                // Miter wedge: two triangles from the corner points to the apex.
                const o1 = pushV(cx + pnx * hwAt(i), cy + pny * hwAt(i), cz, s, dI, lI, oI);
                const o2 = pushV(cx + nx * hwAt(i), cy + ny * hwAt(i), cz, s, dI, lI, oI);
                let mx = pnx + nx, my = pny + ny;
                const ml = Math.hypot(mx, my) || 1;
                mx /= ml; my /= ml;
                const r = hwAt(i) / Math.max(1e-6, mx * pnx + my * pny);
                const apex = pushV(cx + mx * r, cy + my * r, cz, s, dI, lI, oI);
                const cV = pushV(cx, cy, cz, 0, dI, lI, oI);
                pushTri(o1, cV, apex);
                pushTri(cV, o2, apex);
            } else {
                // Bevel (also the miter-over-limit fallback): fill between the
                // two outer corner points and the vertex.
                const o1 = pushV(cx + pnx * hwAt(i), cy + pny * hwAt(i), cz, s, dI, lI, oI);
                const o2 = pushV(cx + nx * hwAt(i), cy + ny * hwAt(i), cz, s, dI, lI, oI);
                const cV = pushV(cx, cy, cz, 0, dI, lI, oI);
                pushTri(o1, cV, o2);
            }
        }
    }

    /**
     * Append `line-cap` geometry (square / round) to a baked line ribbon, using
     * the ORIGINAL (unbaked) centerline points: mgl extends the end cross-section
     * by half the width (square) or draws a half-disc fan (round). Butt = none.
     */
    private emitRibbonCaps(
        layer: EvaluatedLayer,
        geo: AccumulatedGeometry,
        worldPts: number[],
        worldHalfWidth: number,
        cumDist?: number[],
        hwPerPoint?: number[],
        offsetWorld = 0,
        progressClip?: [number, number],
    ): void {
        const cap = layer.layout?.['line-cap'];
        if (cap !== 'round' && cap !== 'square') return;
        const n = worldPts.length / 3;
        if (n < 2) return;
        const x0 = worldPts[0], y0 = worldPts[1], z0 = worldPts[2];
        const xN = worldPts[(n - 1) * 3], yN = worldPts[(n - 1) * 3 + 1], zN = worldPts[(n - 1) * 3 + 2];
        if (Math.abs(x0 - xN) < 1e-9 && Math.abs(y0 - yN) < 1e-9) return;
        geo.offs = geo.offs ?? [];

        const pushVertex = (x: number, y: number, z: number, e: number, d: number, l: number, o: [number, number] = [0, 0]): number => {
            geo.positions.push(x, y, z);
            geo.edge!.push(e);
            geo.dist!.push(d);
            geo.len!.push(l);
            geo.offs!.push(o[0], o[1]);
            return geo.positions.length / 3 - 1;
        };
        // CCW (viewed from +Z) triangles only — the fill material is FrontSide.
        const pushTri = (i: number, j: number, k: number) => {
            const px = geo.positions;
            const area2 =
                (px[j * 3] - px[i * 3]) * (px[k * 3 + 1] - px[i * 3 + 1]) -
                (px[j * 3 + 1] - px[i * 3 + 1]) * (px[k * 3] - px[i * 3]);
            if (area2 >= 0) geo.indices.push(i, j, k);
            else geo.indices.push(i, k, j);
        };

        for (const end of [0, 1]) {
            const cx = end === 0 ? x0 : xN;
            const cy = end === 0 ? y0 : yN;
            const cz = end === 0 ? z0 : zN;
            const oi = end === 0 ? 1 : n - 2;
            const ox = worldPts[oi * 3], oy = worldPts[oi * 3 + 1];
            let dx = cx - ox, dy = cy - oy;
            const dl = Math.hypot(dx, dy) || 1;
            dx /= dl; dy /= dl; // outward unit direction beyond the endpoint
            const nx = -dy, ny = dx; // left normal
            // Variable-width lines: the cap width is the endpoint's width.
            const hw = hwPerPoint
                ? hwPerPoint[end === 0 ? 0 : worldPts.length / 3 - 1]
                : worldHalfWidth;
            // line-gradient coordinate at this end (0 / 1 normalized) plus the
            // absolute distance for line-pattern tiling.
            const totalD = cumDist ? cumDist[n - 1] : 1;
            const dEnd = cumDist
                ? (end === 0 ? cumDist[0] : cumDist[n - 1]) / (totalD || 1)
                : end;
            const lEnd = cumDist ? (end === 0 ? cumDist[0] : cumDist[n - 1]) : end;
            // line-offset displacement at this endpoint: the endpoint's own
            // segment right-normal × offsetWorld (offsetPolyline clamps the
            // endpoint average to its single adjacent segment — same here).
            let oEnd: [number, number] = [0, 0];
            if (offsetWorld !== 0) {
                // dx,dy is the OUTWARD unit direction = -(segment direction)
                // at end 0 and +(segment direction) at end 1. The right
                // normal of the segment (uy, -ux) therefore flips with it.
                const sgn = end === 0 ? -1 : 1;
                oEnd = [sgn * dy * offsetWorld, -sgn * dx * offsetWorld];
            }

            if (cap === 'square') {
                const a1 = pushVertex(cx + nx * hw, cy + ny * hw, cz, 1, dEnd, lEnd, oEnd);
                const a2 = pushVertex(cx - nx * hw, cy - ny * hw, cz, -1, dEnd, lEnd, oEnd);
                const c1 = pushVertex(cx + nx * hw + dx * hw, cy + ny * hw + dy * hw, cz, 1, dEnd, lEnd, oEnd);
                const c2 = pushVertex(cx - nx * hw + dx * hw, cy - ny * hw + dy * hw, cz, -1, dEnd, lEnd, oEnd);
                pushTri(a1, a2, c2);
                pushTri(a1, c2, c1);
            } else {
                const c = pushVertex(cx, cy, cz, 0, dEnd, lEnd, oEnd);
                const K = 8;
                const theta0 = Math.atan2(ny, nx);
                let prevV = -1;
                for (let k = 0; k <= K; k++) {
                    const th = theta0 + (Math.PI * k) / K;
                    const v = pushVertex(cx + Math.cos(th) * hw, cy + Math.sin(th) * hw, cz, 1, dEnd, lEnd, oEnd);
                    if (k === 0) { prevV = v; continue; }
                    pushTri(c, prevV, v);
                    prevV = v;
                }
            }
        }
    }

    /**
     * The line-width used to scale the dash pattern — mgl's `line-floorwidth`:
     * the `line-width` paint re-evaluated at `floor(camera zoom)` (see
     * `LineFloorwidthProperty` / `useIntegerZoom`). The RIBBON is drawn at the
     * continuous width, but the DASH period must use the floored width so it
     * stays stable across fractional zooms. Falls back to the continuous value
     * when the raw spec cannot be re-evaluated (data-driven without a feature
     * or legacy shapes the engine does not model).
     */
    private evaluateFloorLineWidth(layer: EvaluatedLayer, properties?: Record<string, any>): number {
        const continuous = Number(layer.paint?.['line-width'] ?? 1);
        const raw = (layer as any).paintDefs?.['line-width']?.value;
        if (raw === undefined || raw === null) return continuous;
        try {
            const ctx: MBExpressionContext = {
                zoom: Math.max(0, Math.floor(this.m_zoom)),
                feature: properties !== undefined
                    ? { type: 'LineString', properties }
                    : undefined,
            };
            const v = MBExpressionEngine.evaluate(raw, ctx);
            const n = Number(v);
            return Number.isFinite(n) && n >= 0 ? n : continuous;
        } catch {
            return continuous;
        }
    }

    /**
     * Convert a [dashLen, gapLen] dasharray to world units for the ribbon
     * shader. The on-screen dash period is always `totalLength × widthPx`
     * (mgl `a_linesofar` × `u_tile_units_to_pixels` in line-width units). For
     * pixel lines the world ribbon spans `widthPx × mpp`, so the period is
     * `dash × widthPx × mpp`; for `line-width-unit: meters` the ribbon (and
     * the dash) are already in world meters, so the px→world conversion must
     * NOT be applied (world units are meters at the equator).
     */
    private dashWorldFor(
        layer: EvaluatedLayer,
        dashArr: number[],
        dashWidth: number,
        mppDash: number,
    ): [number, number] {
        const widthUnit = layer.layout?.['line-width-unit'] ?? 'pixels';
        const scale = widthUnit === 'meters' ? 1 : mppDash;
        return [
            dashArr[0] * dashWidth * scale,
            dashArr[1] * dashWidth * scale,
        ];
    }

    private getOrCreateRibbonTechniqueIndex(layer: EvaluatedLayer, properties?: Record<string, any>): number {
        // The ribbon-fill material carries the per-feature line color. Key the
        // technique by the resolved line color (plus opacity) so categorical /
        // data-driven line-colors produce one technique per distinct value —
        // the full evaluatedCacheKey also embeds per-feature layout variance
        // (e.g. `line-z-offset`), which would fragment each color into several
        // identical techniques.
        const color = layer.paint?.['line-color'] ?? '#000000';
        const opacity = layer.paint?.['line-opacity'] ?? 1;
        const gradient = layer.paint?.['line-gradient'];
        const patternName = layer.paint?.['line-pattern'] as string | undefined;
        const dashArr = layer.paint?.['line-dasharray'] as number[] | undefined;
        const hasDash = Array.isArray(dashArr) && dashArr.length >= 2;
        // mgl dashes the line along `a_linesofar` using `line-floorwidth` — the
        // line-width evaluated at floor(camera zoom) (`LineFloorwidthProperty`,
        // useIntegerZoom), NOT the continuous width the ribbon is drawn at.
        // Re-evaluate the raw spec at floor(m_zoom) for this feature so the dash
        // period stays stable across fractional zooms (mgl parity).
        const dashWidth = this.evaluateFloorLineWidth(layer, properties);
        // Data-driven dasharray / line-width must NOT share a technique — each
        // distinct (dasharray, dashWidth) pair yields a different pattern.
        const dashSig = hasDash ? `${JSON.stringify(dashArr)}@${dashWidth}` : '';
        // The gradient STOPS are part of the key: a runtime
        // setPaintProperty('line-gradient', …) must rebuild the ramp (a bare
        // 'grad' marker would keep the first ramp forever).
        const gradSig = gradient ? JSON.stringify(gradient).slice(0, 512) : '';
        const key = `${layer.id}:line-ribbon-tech:${String(color)}:${String(opacity)}:${gradSig}:${patternName ?? ''}:${hasDash ? `dash:${dashSig}` : ''}`;
        let idx = this.m_layerToTechniqueIndex.get(key);
        if (idx === undefined) {
            idx = this.m_techniqueIndex++;
            this.m_layerToTechniqueIndex.set(key, idx);
            const paint = layer.paint ?? {};
            // Display-zoom px→world factor (world units are meters at equator).
            // mgl anchors the dash (and pattern) coordinates to the TILE GRID
            // at floor(camera zoom) — `a_linesofar` is in the tile's own units
            // and `u_tile_units_to_pixels` is evaluated at `tileZoom` (the
            // flooring in transform.ts:568). The on-screen period therefore
            // scales by 2^(zoom − floor(zoom)); converting the dash to world
            // meters with the FLOOR display zoom reproduces that factor when
            // the camera sits at a fractional zoom (verified: long-segment
            // [1,1]×50 at zoom 12.15 needs a 111px period, not 100px).
            const mppDash = EarthConstants.EQUATORIAL_CIRCUMFERENCE /
                (256 * Math.pow(2, Math.floor(this.m_zoom + 1)));
            // line-pattern: resolve the sprite's pixel size and convert to
            // world units at the decode display zoom so the patcher can tile
            // u = aRibbonLen / patternWorldW, v = cross / patternWorldH.
            let patternWorld: [number, number] | undefined;
            if (patternName && MBTileDataEmitter.s_spriteInfos) {
                const info = MBTileDataEmitter.s_spriteInfos.get(patternName) as any;
                if (info) {
                    const mpp = EarthConstants.EQUATORIAL_CIRCUMFERENCE /
                        (256 * Math.pow(2, this.m_zoom + 1));
                    // @2x sprites carry double-resolution pixels — divide by
                    // the sprite's pixelRatio so the pattern size stays
                    // correct in CSS px.
                    const pr = Number(info.pixelRatio ?? 1) || 1;
                    patternWorld = [info.width / pr * mpp, info.height / pr * mpp];
                }
            }
            // line-pattern-cross-fade (zoom-driven 0..1): blend between the
            // two candidates of ["image", a, b]. The evaluated paint gives the
            // first AVAILABLE name; the second candidate comes from the raw
            // expression. The cross-fade paint value is a plain number here.
            let patternName2: string | undefined;
            let patternFade: number | undefined;
            const fadeVal = Number(paint['line-pattern-cross-fade'] ?? NaN);
            if (patternName && Number.isFinite(fadeVal) && fadeVal > 0 && fadeVal < 1) {
                let rawPat: any = (layer as any).paintDefs?.['line-pattern']?.value;
                if (!Array.isArray(rawPat) && typeof rawPat === 'object') {
                    try { rawPat = JSON.parse(JSON.stringify(rawPat)); } catch { rawPat = undefined; }
                }
                while (Array.isArray(rawPat) && rawPat[0] === 'memo') rawPat = rawPat[1];
                if (Array.isArray(rawPat) && rawPat[0] === 'image') {
                    for (const cand of rawPat.slice(1)) {
                        if (typeof cand === 'string' && cand !== patternName) {
                            patternName2 = cand;
                            break;
                        }
                    }
                    if (patternName2) patternFade = fadeVal;
                }
            }
            // §516: hd-road-markup ribbons must draw AFTER the base-road
            // fills (9.6) — the §512 fill promotion left ribbons at their
            // style order (4-7) painting UNDER the later-drawn base surface.
            const ribbonRO = layer.layout?.['line-elevation-reference'] === 'hd-road-markup'
                ? 9.75
                : layer.renderOrder + 0.5;
            const technique: any = {
                name: 'fill',
                _index: idx,
                _renderOrder: ribbonRO,
                renderOrder: ribbonRO,
                _layerId: layer.id,
                _paint: paint,
                _layout: layer.layout,
                _mbGlobalLayerOrder: true,
                // line-gradient: per-feature line-progress ramp consumed by
                // the patcher (aRibbonDist varying → ramp texture sample).
                ...(gradient ? { _lineGradientStops: gradient } : {}),
                // line-pattern: sprite name + world-space tile size.
                ...(patternName ? { _patternName: patternName } : {}),
                ...(patternWorld ? { _ribbonPatternWorld: patternWorld } : {}),
                ...(patternName2 ? { _patternName2: patternName2, _patternFade: patternFade } : {}),
                // line-dasharray: mgl dashes based on `a_linesofar` (accumulated
                // distance along the feature) in line-width units. The SolidLine
                // dash does NOT rasterize on SwiftShader, so the ribbon must
                // carry the dash pattern. Convert the CSS-px dash (× the FLOOR
                // line-width, `line-floorwidth`) to world meters at the display
                // zoom so the patcher can `mod(aRibbonLen, size+gap) < size`.
                // mgl collapses zero-length ranges in the line atlas: a zero
                // DASH sum leaves only gaps → the line renders NOTHING; a zero
                // GAP sum leaves only dashes → a solid line (no pattern).
                // Single-element dasharrays (odd length) seam into a full line.
                ...(Array.isArray(dashArr) && dashArr.length >= 1
                    ? (dashSumDash(dashArr) <= 0
                        ? { _dashInvisible: true }
                        : (hasDash ? { _dashWorld: this.dashWorldFor(layer, dashArr, dashWidth, mppDash) } : {}))
                    : {}),
                // line-trim-offset / line-pattern-trim-offset [start, end] in
                // line-progress units — the patcher discards/fades outside
                // range. `line-trim-color` colors the trimmed-out parts
                // ('transparent' = hidden), `line-trim-fade-range` [in, out]
                // fades the two trim edges.
                ...((Array.isArray(paint['line-trim-offset']) || Array.isArray(paint['line-pattern-trim-offset']))
                    ? {
                        _trimOffset: paint['line-trim-offset'] ?? paint['line-pattern-trim-offset'],
                        _trimColor: paint['line-trim-color'] ?? 'transparent',
                        _trimFade: paint['line-trim-fade-range'] ?? [0, 0],
                    }
                    : {}),
                // Pre-extruded line ribbons: the per-color meshes are coplanar
                // (z=0) and must not depth-test against each other — the drawn
                // order (feature order) decides which color wins at crossings,
                // matching mapbox's painter's algorithm for a single line layer.
                _isLineRibbon: true,
                _ribbonWidthPx: Number(paint['line-width'] ?? 1),
                // mgl's line shaders size the dash AND the pattern aspect by
                // `line-floorwidth` (line-width at floor zoom) — the patcher
                // needs it for the u-tiling scale.
                _ribbonFloorWidthPx: dashWidth,
                // line-blur stays in CSS px even under line-width-unit:meters
                // (fitted against the meters-blur reference: the alpha ramp
                // matches clamp(1 - distCenter/blurPx) with the RAW value).
                _ribbonBlurPx: Number(paint['line-blur'] ?? 0),
                _translate: paint['line-translate'] ?? [0, 0],
                _translateAnchor: paint['line-translate-anchor'] ?? 'map',
                color: paint['line-color'] ?? '#000000',
                opacity: paint['line-opacity'] ?? 1,
            };
            this.m_techniques.push(technique as IndexedTechnique);
        }
        return idx;
    }

    /**
     * Technique for a `fill-outline-color` ring: a 1px fill ribbon in the
     * outline color rendered just above the fill. Mirrors mgl's `fillOutline`
     * program — a screen-space 1px stroke along the polygon boundary.
     */
    private getOrCreateOutlineTechniqueIndex(layer: EvaluatedLayer): number {
        const color = layer.paint?.['fill-outline-color'];
        const key = `${layer.id}:fill-outline-tech:${String(color)}`;
        let idx = this.m_layerToTechniqueIndex.get(key);
        if (idx === undefined) {
            idx = this.m_techniqueIndex++;
            this.m_layerToTechniqueIndex.set(key, idx);
            const paint = layer.paint ?? {};
            const technique: any = {
                name: 'fill',
                _index: idx,
                _renderOrder: layer.renderOrder + 0.5,
                renderOrder: layer.renderOrder + 0.5,
                _layerId: layer.id,
                _paint: paint,
                _layout: layer.layout,
                _mbGlobalLayerOrder: true,
                color: color ?? '#000000',
                // mgl multiplies the outline by fill-opacity (the `opacity`
                // pragma in fill_outline shaders) and by the outline color's own
                // alpha (glFragColor = out_color * alpha * opacity).
                opacity: paint['fill-opacity'] ?? 1,
                _isFillOutline: true,
                // Route through the ribbon patcher so the fragment gets the
                // edge attribute — the mgl fillOutline alpha is
                // 1 - smoothstep(0, 1, distPx) over a 2px-wide ribbon.
                _isLineRibbon: true,
                _ribbonWidthPx: 2,
            };
            this.m_techniques.push(technique as IndexedTechnique);
        }
        return idx;
    }

    /** Get stored triangulated line data for building the DecodedTile */
    private getLineGeometries(): Geometry[] {
        if (this.m_lineInterleaved.length === 0 || this.m_lineIndices.length === 0) return [];

        const data = new Float32Array(this.m_lineInterleaved);
        const indices = new Uint32Array(this.m_lineIndices);
        const vertexCount = data.length / 13;

        // SwiftShader (ANGLE/Vulkan) fails to rasterize SolidLineMaterial
        // triangles when the custom attributes (biTangent, extrusionCoord,
        // tangent) are read from an INTERLEAVED buffer in the shader. Emit the
        // same data as separate (non-interleaved) buffers instead, which binds
        // and renders correctly.
        const extCoords = new Float32Array(vertexCount * 3);
        const positions = new Float32Array(vertexCount * 3);
        const tangents = new Float32Array(vertexCount * 3);
        const biTangents = new Float32Array(vertexCount * 4);
        for (let v = 0; v < vertexCount; v++) {
            const src = v * 13;
            extCoords[v * 3] = data[src];
            extCoords[v * 3 + 1] = data[src + 1];
            extCoords[v * 3 + 2] = data[src + 2];
            positions[v * 3] = data[src + 3];
            positions[v * 3 + 1] = data[src + 4];
            positions[v * 3 + 2] = data[src + 5];
            tangents[v * 3] = data[src + 6];
            tangents[v * 3 + 1] = data[src + 7];
            tangents[v * 3 + 2] = data[src + 8];
            biTangents[v * 4] = data[src + 9];
            biTangents[v * 4 + 1] = data[src + 10];
            biTangents[v * 4 + 2] = data[src + 11];
            biTangents[v * 4 + 3] = data[src + 12];
        }

        const vertexAttributes: BufferAttribute[] = [
            { name: 'extrusionCoord', buffer: extCoords.buffer, type: 'float' as BufferElementType, itemCount: 3 },
            { name: 'position', buffer: positions.buffer, type: 'float' as BufferElementType, itemCount: 3 },
            { name: 'tangent', buffer: tangents.buffer, type: 'float' as BufferElementType, itemCount: 3 },
            { name: 'biTangent', buffer: biTangents.buffer, type: 'float' as BufferElementType, itemCount: 4 },
        ];

        const groups: Group[] = [];
        const end = this.m_lineIndices.length;
        const numGroups = this.m_lineGroupStarts.length / 2;
        const order = Array.from({ length: numGroups }, (_, i) => i);
        if (numGroups > 1 && this.m_lineSortKeys.some(k => k !== 0)) {
            order.sort((a, b) => this.m_lineSortKeys[a] - this.m_lineSortKeys[b]);
        }
        const sortedAttrs: AttributeMap[] = [];
        for (const i of order) {
            const start = this.m_lineGroupStarts[i * 2];
            const nextIdx = order.indexOf(i + 1);
            const nextStart = (i + 1) < numGroups
                ? this.m_lineGroupStarts[(i + 1) * 2] : end;
            groups.push({
                start,
                count: nextStart - start,
                technique: this.m_lineGroupStarts[i * 2 + 1],
            });
            sortedAttrs.push(JSON.parse(this.m_lineAttr[i]));
        }

        return [{
            type: GeometryType.SolidLine,
            vertexAttributes,
            index: {
                name: 'index',
                buffer: indices.buffer,
                type: 'uint32' as BufferElementType,
                itemCount: 1,
            },
            groups,
            featureStarts: groups.map(g => g.start),
            objInfos: sortedAttrs,
            attachments: [],
        }];
    }

    processPointFeature(
        layerName: string,
        extents: number,
        points: THREE.Vector3[],
        properties: Record<string, any>,
        featureId: string | number | undefined,
        matchedLayers: EvaluatedLayer[],
    ): void {
        for (const layer of matchedLayers) {
            // §509 symbol-placement line/line-center for ICONS — mgl repeats
            // the icon every `symbol-spacing` along the line (getAnchors →
            // addSymbol per anchor, icon-rotation-alignment map default).
            // Emit one point feature per anchor with the segment angle folded
            // into `_lineIconAngle` (consumed by paintToTechniqueProps as an
            // icon-rotate offset). Text modes keep the TextPathGeometry path.
            {
                const plc = layer.type === 'symbol'
                    ? (layer.layout['symbol-placement'] ?? 'point') : 'point';
                const linePath = properties?._linePath as number[][] | undefined;
                if (plc !== 'point' && layer.type === 'symbol' && layer.layout['icon-image']
                    && Array.isArray(linePath) && linePath.length >= 2
                    && !properties._linePlaced) {
                    if (!(globalThis as any).__mbSpcEntered) {
                        (globalThis as any).__mbSpcEntered = true;
                        // eslint-disable-next-line no-console
                        console.log('[MBSpc-enter] extents=' + this.m_extents
                            + ' pts=' + linePath.length
                            + ' p0=' + linePath[0] + ' pN=' + linePath[linePath.length - 1]);
                    }
                    const iconSize = Number(layer.layout['icon-size'] ?? 1);
                    // mgl shapedIcon display width ≈ sprite px × icon-size;
                    // the standard sprite corpus is 12px (maki/-12 names).
                    const labelLenPx = 12 * iconSize;
                    // Anchor math runs on the PROJECTED world polyline (the
                    // _linePath frame mixes extent x with world y — see
                    // worldPerLinUnit) with px lengths converted to meters at
                    // the tile's native 512px scheme.
                    const worldPts = linePath.map((p) => {
                        const w = this.projectWorld(new THREE.Vector3(p[0], p[1], 0));
                        return new THREE.Vector2(w.x, w.y);
                    });
                    const metersPerPx = this.worldPerLinUnit() * ((this.m_extents || 4096) / 512);
                    const maxAngleRad = Number(layer.layout['text-max-angle'] ?? 45) * Math.PI / 180;
                    let anchors: LineAnchorT[];
                    if (plc === 'line-center') {
                        const c = getLineCenterAnchor(worldPts, {
                            maxAngle: maxAngleRad,
                            labelLength: labelLenPx * metersPerPx,
                            glyphSize: labelLenPx * metersPerPx,
                            // mgl getAngleWindowSize: 0 when there is no
                            // shaped TEXT (icon-only) — no curve rejection,
                            // while the glyphSize-based extra offset stays.
                            angleWindowSize: 0,
                        });
                        anchors = c ? [c] : [];
                    } else {
                        const spacingPx = Number(layer.layout['symbol-spacing'] ?? 250);
                        anchors = getLineAnchors(worldPts, spacingPx * metersPerPx, maxAngleRad, {
                            labelLength: labelLenPx * metersPerPx,
                            glyphSize: labelLenPx * metersPerPx,
                            angleWindowSize: 0,
                        });
                    }
                    for (let ai = 0; ai < anchors.length; ai++) {
                        const a = anchors[ai];
                        // Unique per-anchor identity: the engine's cross-layer
                        // label de-duplication keys on $id (§429) and would
                        // collapse every repetition of one feature into a
                        // single placed symbol.
                        const fid = featureId === undefined || featureId === null
                            ? `line#${ai}` : `${featureId}#${ai}`;
                        // Recursion takes the anchor as an EXTENT-frame point
                        // — invert the projection the same way processPoint
                        // features normally arrive (the point pipeline calls
                        // projectWorld on its input). NOTE: the anchor is in
                        // world meters; reuse the mixed-frame input by
                        // passing the world position through a raw property
                        // override instead (see `_lineWorldPos`).
                        this.processPointFeature(layerName, extents,
                            [new THREE.Vector3(a.x, a.y, 0)],
                            { ...properties, _linePlaced: true, _lineIconAngle: a.angle,
                              $id: fid, _lineWorldPos: [a.x, a.y] },
                            fid, [layer]);
                    }
                    continue;
                }
            }
            // symbol-elevation: symbol-z-offset / symbol-elevation-reference
            // lift the POI/text geometry (consumed by `project()`).
            if (layer.type === 'symbol') {
                this.m_currentZOffset = this.resolveZOffset(layer, properties, 'symbol');
                this.noteGeometryHeight(this.m_currentZOffset);
            }
            // Determine which symbol sub-techniques to emit. For symbol layers with
            // both icon-image and text-field, emit both so icon+caption render.
            let modes: Array<'icon' | 'text' | undefined>;
            if (layer.type === 'symbol' && layer.layout['icon-image'] && layer.layout['text-field']) {
                modes = ['icon', 'text'];
            } else {
                modes = [undefined];
            }

            for (const mode of modes) {
                const techniqueIdx = this.getOrCreateTechniqueIndex(layer, properties, mode);
                const tech: any = this.m_techniques[techniqueIdx];

                // Model layers: record per-feature placements for the
                // MBModelRenderer instead of emitting native point geometry
                // (the engine has no 'model' technique consumer; mgl
                // instantiates a GLTF per feature at the feature position).
                if (layer.type === 'model') {
                    // mgl model-* paint properties are data-driven — evaluate
                    // PER FEATURE (a raw expression array multiplied as a
                    // number yields NaN and destroys the instance matrix).
                    const evalVec3 = (name: string): number[] | undefined => {
                        const raw = (layer as any).paintDefs?.[name]?.value
                            ?? layer.paint?.[name];
                        if (raw === undefined || raw === null) return undefined;
                        let v: any = raw;
                        if (typeof v === 'object') {
                            try {
                                v = MBExpressionEngine.evaluate(raw, {
                                    zoom: this.m_zoom,
                                    feature: { type: 'Point', properties, id: featureId } as any,
                                } as any);
                            } catch { return undefined; }
                        }
                        if (!Array.isArray(v)) {
                            const n = Number(v);
                            return Number.isFinite(n) ? [n, n, n] : undefined;
                        }
                        const out = [Number(v[0] ?? 0), Number(v[1] ?? 0), Number(v[2] ?? 0)];
                        return out.every(Number.isFinite) ? out : undefined;
                    };
                    const evalScalar = (name: string, dflt: number): number => {
                        const raw = (layer as any).paintDefs?.[name]?.value
                            ?? layer.paint?.[name];
                        if (raw === undefined || raw === null) return dflt;
                        let v: any = raw;
                        if (typeof v === 'object') {
                            try {
                                v = MBExpressionEngine.evaluate(raw, {
                                    zoom: this.m_zoom,
                                    feature: { type: 'Point', properties, id: featureId } as any,
                                } as any);
                            } catch { return dflt; }
                        }
                        const n = Number(v);
                        return Number.isFinite(n) ? n : dflt;
                    };
                    // model-id: layout, data-driven — resolve the registry key.
                    let modelId: any = layer.layout?.['model-id'] ?? properties?.['model-id'] ?? '';
                    if ((globalThis as any).__mbDecodeDbg
                        && ((globalThis as any).__mbModelBrCnt = ((globalThis as any).__mbModelBrCnt ?? 0) + 1) <= 8) {
                        // eslint-disable-next-line no-console
                        console.log(`[MBModelBr] layer=${layer.id} modelId=${typeof modelId === 'object' ? '[expr]' : JSON.stringify(modelId)} pts=${points.length} registry=${Object.keys((this as any).m_modelRegistry ?? {}).length} evalZoom=${this.m_zoom} scale=${JSON.stringify(evalVec3('model-scale'))}`);
                    }
                    if (typeof modelId === 'object') {
                        try {
                            modelId = MBExpressionEngine.evaluate(modelId, {
                                zoom: this.m_zoom,
                                feature: { type: 'Point', properties, id: featureId } as any,
                            } as any);
                        } catch { modelId = ''; }
                    }
                    const rotation = evalVec3('model-rotation');
                    const mScale = evalVec3('model-scale');
                    const translation = evalVec3('model-translation');
                    const opacity = evalScalar('model-opacity', 1);
                    const colorRaw = (layer as any).paintDefs?.['model-color']?.value
                        ?? layer.paint?.['model-color'];
                    const mixRaw = (layer as any).paintDefs?.['model-color-mix-intensity']?.value
                        ?? layer.paint?.['model-color-mix-intensity'];
                    const colorMix = mixRaw === undefined || mixRaw === null
                        ? undefined
                        : evalScalar('model-color-mix-intensity', NaN);
                    // §521: model-color tints the albedo (mix in LINEAR — mgl
                    // getBaseColor: mix(albedo, sRGBToLinear(v_color_mix), a)).
                    // Resolve to linear RGB (THREE.Color applies ColorManagement).
                    let colorLin: number[] | undefined;
                    if (colorMix !== undefined && colorMix > 0 && colorRaw !== undefined && colorRaw !== null) {
                        try {
                            let cv: any = colorRaw;
                            if (typeof cv === 'object') {
                                cv = MBExpressionEngine.evaluate(colorRaw, {
                                    zoom: this.m_zoom,
                                    feature: { type: 'Point', properties, id: featureId } as any,
                                } as any);
                            }
                            const c = new THREE.Color(cv as any);
                            colorLin = [c.r, c.g, c.b];
                        } catch { colorLin = undefined; }
                    }
                    const emissive = evalScalar('model-emissive-strength', 0);
                    // §536: model-roughness (mgl default 1 — fully rough,
                    // overriding the glTF's own roughnessFactor).
                    const roughRaw = (layer as any).paintDefs?.['model-roughness']?.value
                        ?? layer.paint?.['model-roughness'];
                    const roughness = roughRaw === undefined || roughRaw === null
                        ? undefined
                        : evalScalar('model-roughness', NaN);
                    for (const pt of points) {
                        const w = this.projectWorld(pt);
                        this.m_modelInstances.push({
                            x: w.x, y: w.y, z: w.z,
                            // Technique object reference (not index): the
                            // decodedTile/techniques array is transient.
                            technique: tech,
                            properties: { ...properties, $id: featureId ?? properties.$id ?? null },
                            // Per-feature evaluated transform (mgl data-driven
                            // model-* semantics); falls back to the technique
                            // constants in the renderer when undefined.
                            ...(rotation ? { rotation } : {}),
                            ...(mScale ? { scale: mScale } : {}),
                            ...(translation ? { translation } : {}),
                            ...(opacity !== 1 ? { opacity } : {}),
                            ...(colorMix !== undefined ? { colorMix } : {}),
                            ...(colorLin ? { color: colorLin } : {}),
                            ...(roughness !== undefined ? { roughness } : {}),
                            ...(emissive !== 0 ? { emissive } : {}),
                            ...(typeof modelId === 'string' && modelId ? { modelId } : {}),
                        });
                    }
                    continue;
                }

                // Heatmap layers: collect kernels for the two-pass density→ramp
                // renderer instead of the native circles points pipeline (which
                // cannot accumulate overlapping densities).
                if (layer.type === 'heatmap' && tech._isHeatmap) {
                    const weight = Number(tech._heatmapWeight ?? 1);
                    const radius = Number(tech.size ?? 30);
                    // Zoom-dependent radius: carry the raw expression so the
                    // renderer can interpolate it continuously per frame.
                    const rawRadius = (layer as any).paintDefs?.['heatmap-radius']?.value;
                    const zoomDep = MBTileDataEmitter.exprDependsOnZoom(rawRadius);
                    for (const pt of points) {
                        const w = this.projectWorld(pt);
                        this.addHeatmapPoint(
                            w, weight, radius, techniqueIdx,
                            zoomDep ? rawRadius : undefined,
                            zoomDep ? properties : undefined,
                        );
                    }
                    continue;
                }

                // symbol-placement: line / line-center — labels REPEAT every
                // `symbol-spacing` along the line (§509: faithful port of mgl
                // symbol_layout.ts getAnchors → addSymbolAtAnchor), each
                // repetition emitted as its own short TextPathGeometry over
                // just the label's span (curvature preserved locally).
                const placement = layer.layout['symbol-placement'] ?? 'point';
                if (tech.name === 'text' && (placement === 'line' || placement === 'line-center')) {
                    const linePath = properties?._linePath;
                    if (Array.isArray(linePath) && linePath.length >= 2) {
                        const fontSize = Number(layer.layout['text-size'] ?? 16);
                        // Anchor math on the PROJECTED world polyline (the
                        // _linePath frame mixes extent x with world y — see
                        // worldPerLinUnit); px → meters at the native
                        // 512px-per-tile scheme.
                        const worldPts = linePath.map((p: number[]) => {
                            const w = this.projectWorld(new THREE.Vector3(p[0], p[1], 0));
                            return new THREE.Vector2(w.x, w.y);
                        });
                        const metersPerPx = this.worldPerLinUnit() * ((this.m_extents || 4096) / 512);
                        const labelWpx = Math.max(Number(tech._textWidth ?? 0), 0);
                        const labelLenM = labelWpx * metersPerPx;
                        const maxAngleRad = Number(layer.layout['text-max-angle'] ?? 45) * Math.PI / 180;
                        let anchors: LineAnchorT[];
                        if (labelLenM <= 4) {
                            // No shaping metrics — degrade to the legacy
                            // whole-line path (single full-path geometry).
                            anchors = [{ x: NaN, y: NaN, t: 0.5, angle: 0, segmentIndex: 0 }];
                        } else if (placement === 'line-center') {
                            const c = getLineCenterAnchor(worldPts, {
                                maxAngle: maxAngleRad,
                                labelLength: labelLenM,
                                glyphSize: fontSize * metersPerPx,
                            });
                            anchors = c ? [c] : [];
                        } else {
                            const spacingPx = Number(layer.layout['symbol-spacing'] ?? 250);
                            anchors = getLineAnchors(worldPts, spacingPx * metersPerPx, maxAngleRad, {
                                labelLength: labelLenM,
                                glyphSize: fontSize * metersPerPx,
                            });
                            // mgl anchorIsTooClose: drop repeats closer than
                            // spacing/2 to an already-placed label with the
                            // same text (bucket-wide; keyed per layer here).
                            const repeatDist = spacingPx * metersPerPx / 2;
                            const seen = this.lineRepeatSeen(tech._layerId ?? String(techniqueIdx));
                            anchors = anchors.filter((a) => !seen.some((s) =>
                                Math.abs(s.x - a.x) < repeatDist && Math.abs(s.y - a.y) < repeatDist));
                            for (const a of anchors) {
                                seen.push({ x: a.x, y: a.y });
                                if (seen.length > 512) seen.shift();
                            }
                        }
                        for (const a of anchors) {
                            // Crop the world path to the label span and emit
                            // one short curved-path geometry per repetition.
                            const totalLen = polyLength(worldPts);
                            let d0 = (a.x !== a.x) ? 0 : Math.max(0, a.t * totalLen - labelLenM / 2);
                            let d1 = (a.x !== a.x) ? totalLen : Math.min(totalLen, a.t * totalLen + labelLenM / 2);
                            const sub = cropPolyline(worldPts, d0, d1);
                            if (sub.length < 2) continue;
                            const path: number[] = [];
                            let lenSqr = 0;
                            for (const pt of sub) {
                                path.push(pt.x, pt.y, 0);
                                if (path.length > 3) {
                                    const n = path.length;
                                    const dx = pt.x - path[n - 6];
                                    const dy = pt.y - path[n - 5];
                                    lenSqr += dx * dx + dy * dy;
                                }
                            }
                            this.m_textPathGeometries.push({
                                path,
                                pathLengthSqr: lenSqr * lenSqr,
                                text: tech.text as string,
                                technique: techniqueIdx,
                                objInfos: { ...properties, $id: featureId ?? properties.$id ?? null },
                            });
                        }
                    }
                    continue;
                }

                const key = `${layer.id}:point:${techniqueIdx}`;
                const geo = this.getOrCreateGeometry(key);
                const featureStart = geo.indices.length;

                // icon-translate / text-translate [x east, y north] px —
                // baked into the POI/text world positions (same empirical
                // direction convention as line-translate).
                const translatePx = layer.type === 'symbol'
                    ? (mode === 'text'
                        ? layer.paint?.['text-translate'] as number[] | undefined
                        : layer.paint?.['icon-translate'] as number[] | undefined)
                    : undefined;
                let twx = 0, twy = 0;
                if (translatePx && (translatePx[0] !== 0 || translatePx[1] !== 0)) {
                    let tx = translatePx[0];
                    let ty = translatePx[1];
                    // `*-translate-anchor: viewport` rotates the translate by
                    // +bearing in the map frame (mgl painter.translatePosMatrix),
                    // same as line-translate.
                    const anchor = mode === 'text'
                        ? layer.paint?.['text-translate-anchor']
                        : layer.paint?.['icon-translate-anchor'];
                    if (anchor === 'viewport' && this.m_bearing !== 0) {
                        const ang = this.m_bearing * Math.PI / 180;
                        const cos = Math.cos(ang);
                        const sin = Math.sin(ang);
                        const r0 = tx * cos - ty * sin;
                        const r1 = tx * sin + ty * cos;
                        tx = r0;
                        ty = r1;
                    }
                    const mppS = EarthConstants.EQUATORIAL_CIRCUMFERENCE /
                        (256 * Math.pow(2, this.m_zoom + 1));
                    twx = tx * mppS;
                    twy = -ty * mppS;
                }

                for (const pt of points) {
                    const w = this.project(pt);
                    const ww = this.projectWorld(pt);
                    // §509 line-anchor repetition: the anchor arrives in
                    // absolute world meters via `_lineWorldPos` (getLineAnchors
                    // runs on the projected polyline) — bypass the extent→world
                    // projection for it.
                    const lw = properties._lineWorldPos as number[] | undefined;
                    let useWW = ww;
                    let useW = w;
                    if (lw) {
                        useWW = new THREE.Vector3(lw[0], lw[1], ww.z);
                        useW = new THREE.Vector3(
                            useWW.x - this.m_decodeInfo.center.x,
                            useWW.y - this.m_decodeInfo.center.y,
                            useWW.z - this.m_decodeInfo.center.z);
                    }
                    // §302: mgl lifts circle centers onto the terrain surface
                    // (single elevation sample at the center,
                    // getElevationForLngLatZoom semantics) when terrain is on.
                    if (this.m_terrainSampler && tech.name === 'circles') {
                        w.z += this.m_terrainSampler(ww.x, ww.y);
                    }
                    geo.positions.push(useW.x, useW.y, useW.z);
                    if (twx !== 0 || twy !== 0) {
                        useWW.x += twx;
                        useWW.y += twy;
                    }
                    if (tech.name === 'text' && tech.text) {
                        this.emitTextGeometry(techniqueIdx, useWW, tech.text as string,
                            { ...properties, $id: `${layer.id}:${this.symbolFeatureId(featureId, properties, useWW)}` });
                    } else if (tech.name === 'labeled-icon') {
                        const iconName = tech.imageTexture as string;
                        const caption = (layer.layout['text-field'] && mode === 'icon')
                            ? '' : (tech.text as string ?? '');
                        this.emitPoiGeometry(techniqueIdx, useWW,
                            iconName ?? '',
                            caption || undefined,
                            // Layer-scoped feature id: the engine's label cache
                            // deduplicates by featureId — two style layers
                            // rendering the SAME feature (mgl draws both,
                            // e.g. regressions/mapbox-gl-native#11451 blue
                            // under red) must not collapse into one label.
                            { ...properties, $id: `${layer.id}:${this.symbolFeatureId(featureId, properties, useWW)}` });
                    }
                }

                const count = points.length;
                geo.groups.push({
                    start: featureStart,
                    count,
                    materialIndex: techniqueIdx,
                    sortKey: this.extractSortKey(layer),
                });
                geo.featureStarts.push(featureStart);
                geo.objInfos.push({ ...properties, $id: featureId ?? properties.$id ?? null });
            }
        }
    }

    /** Emit a TextGeometry entry for the native TextElementsRenderer. */
    /**
     * Stable feature id for symbol (text/POI) elements. The engine's
     * TextElementStateCache deduplicates elements WITHOUT a feature id by
     * TEXT within a screen distance — collapsing every same-text feature to
     * one label. mgl places point labels per FEATURE (cross-tile ids), so
     * synthesize a position-stable id from the absolute world coordinates
     * (level-independent, so the same feature keeps one id across tile
     * levels — the legitimate cross-level dedup — while distinct features
     * never collide).
     */
    private symbolFeatureId(
        featureId: any,
        properties: any,
        worldPos: THREE.Vector3,
    ): string | number | null {
        const explicit = featureId ?? properties?.$id;
        if (explicit !== undefined && explicit !== null && explicit !== '') return explicit;
        return `mbpos:${worldPos.x.toFixed(2)},${worldPos.y.toFixed(2)},${worldPos.z.toFixed(2)}`;
    }

    private emitTextGeometry(
        techniqueIdx: number,
        pos: THREE.Vector3,
        text: string,
        attrs: AttributeMap,
    ): void {
        // Find or create a TextGeometry group for this technique.
        let tg = this.m_textGeometries.find(t => t.technique === techniqueIdx);
        if (!tg) {
            tg = {
                positions: {
                    name: 'position',
                    buffer: new Float32Array(0).buffer,
                    type: 'float' as BufferElementType,
                    itemCount: 3,
                },
                texts: [],
                technique: techniqueIdx,
                stringCatalog: this.m_stringCatalog,
                objInfos: [],
            };
            this.m_textGeometries.push(tg);
        }
        // Accumulate positions in a temporary array, finalize in getDecodedTile.
        if (!(tg as any)._positions) (tg as any)._positions = [];
        (tg as any)._positions.push(pos.x, pos.y, pos.z);
        tg.texts.push(this.getStringIndex(text));
        tg.objInfos!.push(attrs);
    }

    /** Emit a PoiGeometry entry for the native PoiRenderer. */
    private emitPoiGeometry(
        techniqueIdx: number,
        pos: THREE.Vector3,
        iconName: string,
        caption: string | undefined,
        attrs: AttributeMap,
    ): void {
        let pg = this.m_poiGeometries.find(p => p.technique === techniqueIdx);
        if (!pg) {
            pg = {
                positions: {
                    name: 'position',
                    buffer: new Float32Array(0).buffer,
                    type: 'float' as BufferElementType,
                    itemCount: 3,
                },
                texts: [],
                technique: techniqueIdx,
                stringCatalog: this.m_stringCatalog,
                objInfos: [],
                imageTextures: [],
            };
            this.m_poiGeometries.push(pg);
        }
        if (!(pg as any)._positions) (pg as any)._positions = [];
        (pg as any)._positions.push(pos.x, pos.y, pos.z);
        pg.texts.push(this.getStringIndex(caption ?? ''));
        pg.imageTextures!.push(this.getStringIndex(iconName));
        pg.objInfos!.push(attrs);
    }

    getDecodedTile(): DecodedTile {
        if ((this as any).__feats) { console.log('MB_FEATS', (this as any).__feats); (this as any).__feats = ''; } // FEAT-PROBE (temp)
        if ((globalThis as any).__mbDecodeDbg) {
            try {
                const techs = this.m_techniques.map((t: any) =>
                    `${t?.name ?? 'NONAME'}:${t ? (t.technique ?? (t as any).type ?? '') : ''}:${(t?._paint?.['fill-color'] ?? t?.color ?? '')}`);
                let verts = 0, geos = 0;
                for (const [, geo] of this.m_geometries) {
                    if (geo.positions.length === 0) continue;
                    geos++;
                    verts += geo.positions.length / 3;
                }
                // eslint-disable-next-line no-console
                console.log(`[MBDecode] tile=${String(this.m_tileKey)} geos=${geos} verts=${verts} techs=[${techs.join(',')}]`);
            } catch {}
        }
        const geometries: Geometry[] = [];

        for (const [, geo] of this.m_geometries) {
            if (geo.positions.length === 0) continue;

            if (geo.groups.length > 1 && geo.groups.some(g => g.sortKey !== undefined)) {
                geo.groups.sort((a, b) => (a.sortKey ?? 0) - (b.sortKey ?? 0));
            }

            const positionArray = new Float32Array(geo.positions);
            const indexArray = geo.indices.length > 0 ? new Uint32Array(geo.indices) : undefined;

            const positionAttr: BufferAttribute = {
                name: 'position',
                buffer: positionArray.buffer,
                type: 'float' as BufferElementType,
                itemCount: 3,
            };

            const vertexAttributes: BufferAttribute[] = [positionAttr];
            if (geo.extrusionAxis.length > 0) {
                vertexAttributes.push({
                    name: 'extrusionAxis',
                    buffer: new Float32Array(geo.extrusionAxis).buffer,
                    type: 'float' as BufferElementType,
                    itemCount: 4,
                });
            }
            if (geo.edge && geo.edge.length > 0) {
                vertexAttributes.push({
                    name: 'aRibbonEdge',
                    buffer: new Float32Array(geo.edge).buffer,
                    type: 'float' as BufferElementType,
                    itemCount: 1,
                });
                if (geo.dist && geo.dist.length === geo.edge.length) {
                    vertexAttributes.push({
                        name: 'aRibbonDist',
                        buffer: new Float32Array(geo.dist).buffer,
                        type: 'float' as BufferElementType,
                        itemCount: 1,
                    });
                    if (geo.len && geo.len.length === geo.edge.length) {
                        vertexAttributes.push({
                            name: 'aRibbonLen',
                            buffer: new Float32Array(geo.len).buffer,
                            type: 'float' as BufferElementType,
                            itemCount: 1,
                        });
                    }
                    if (geo.offs && geo.offs.length === geo.edge.length * 2) {
                        // line-offset shader displacement vector (mgl applies
                        // the offset in the vertex shader — see
                        // AccumulatedGeometry.offs).
                        vertexAttributes.push({
                            name: 'aRibbonOffs',
                            buffer: new Float32Array(geo.offs).buffer,
                            type: 'float' as BufferElementType,
                            itemCount: 2,
                        });
                    }
                }
            }
            if (geo.uvs.length > 0) {
                vertexAttributes.push({
                    name: 'uv',
                    buffer: new Float32Array(geo.uvs).buffer,
                    type: 'float' as BufferElementType,
                    itemCount: 2,
                });
            }

            const groups: Group[] = geo.groups.map(g => ({
                start: g.start,
                count: g.count,
                technique: g.materialIndex,
            }));

            const geom: Geometry = {
                type: GeometryType.Polygon,
                vertexAttributes,
                groups,
                featureStarts: geo.featureStarts,
                objInfos: geo.objInfos,
                attachments: [],
            };

            if (geo.edgeIndex.length > 0) {
                geom.edgeIndex = {
                    name: 'edgeIndex',
                    buffer: new Uint32Array(geo.edgeIndex).buffer,
                    type: 'uint32' as BufferElementType,
                    itemCount: 1,
                };
                geom.edgeFeatureStarts = geo.edgeFeatureStarts;
            }

            if (indexArray) {
                geom.index = {
                    name: 'index',
                    buffer: indexArray.buffer,
                    type: 'uint32' as BufferElementType,
                    itemCount: 1,
                };
            }

            geometries.push(geom);
        }

        const lineGeoms = this.getLineGeometries();

        // Finalize text/POI geometries: convert temp arrays to BufferAttributes.
        // NOTE: the native consumers (TileGeometryCreator.createTextElements,
        // PoiManager) reinterpret this buffer as Float64Array, so the positions
        // MUST be packed as float64 bytes (see VectorTileDataEmitter:1759).
        for (const tg of [...this.m_textGeometries, ...this.m_poiGeometries] as any[]) {
            const positions = (tg as any)._positions as number[] | undefined;
            if (positions && positions.length > 0) {
                const arr = new Float64Array(positions);
                tg.positions = {
                    name: 'position',
                    buffer: arr.buffer,
                    type: 'float' as BufferElementType,
                    itemCount: 3,
                };
            }
        }

        const decodedTile: DecodedTile = {
            techniques: this.m_techniques,
            geometries: [...geometries, ...lineGeoms],
        };
        if (this.m_maxGeometryHeight > 0) {
            decodedTile.maxGeometryHeight = this.m_maxGeometryHeight;
        }

        // Emit text/POI geometries so the native TextElementsRenderer/PoiRenderer
        // can find them. Without these, no text or icons render.
        if (this.m_textGeometries.length > 0) {
            decodedTile.textGeometries = this.m_textGeometries;
        }
        if (this.m_textPathGeometries.length > 0) {
            decodedTile.textPathGeometries = this.m_textPathGeometries;
        }
        if (this.m_poiGeometries.length > 0) {
            decodedTile.poiGeometries = this.m_poiGeometries;
        }

        // Heatmap kernel points for the two-pass density→ramp renderer.
        if (this.m_heatmapPoints.length > 0) {
            (decodedTile as any).heatmapPoints = this.m_heatmapPoints;
        }

        // Model-layer per-feature placements for the MBModelRenderer.
        if (this.m_modelInstances.length > 0) {
            (decodedTile as any).modelInstances = this.m_modelInstances;
        }

        return decodedTile;
    }
}
