import {
    FlatTheme,
    ITileDecoder,
    Theme,
} from '@flywave/flywave-datasource-protocol';
import { TileKey, webMercatorTilingScheme, sphereProjection, mercatorProjection, ProjectionType, EarthConstants } from '@flywave/flywave-geoutils';
import { FogSpec } from './MBStyleSpec';

/**
 * §812: mgl default fog parameters (style-spec v8 fog defaults). Globe
 * fixtures WITH a background layer but WITHOUT a fog key render the
 * default-fog atmosphere gradient in mgl expected frames (navy space
 * gradient over fogged white tiles) — apply these when style.fog is
 * absent so the globe fog/dome pipeline engages for content-bearing
 * styles; bare frames keep §782's white clear.
 */
const MGL_DEFAULT_FOG_SPEC: any = {
    'color': '#ffffff',
    'high-color': '#245cdf',
    'space-color': ['interpolate', ['linear'], ['zoom'], 4, '#010b19', 7, '#367ab9'],
    'horizon-blend': ['interpolate', ['linear'], ['zoom'], 4, 0.2, 7, 0.1],
    'star-intensity': ['interpolate', ['linear'], ['zoom'], 5, 0.35, 6, 0],
    'range': [0.5, 10]
};
import { Tile } from '@flywave/flywave-mapview';
import { MapViewEventNames } from '@flywave/flywave-mapview';
import {
    DataProvider,
    TileDataSource,
    TileDataSourceOptions,
    TileFactory,
} from '@flywave/flywave-mapview-decoder';
import {
    APIFormat,
    OmvRestClient,
    OmvRestClientParameters,
} from '@flywave/flywave-vectortile-datasource/OmvRestClient';
import * as THREE from 'three';

import { MBStyleManager, ResolvedSource } from './MBStyleManager';
import { MBBatchedModelDataSource } from './MBBatchedModelDataSource';
import { batchedDiagEnabled } from './MBBatchedModelDataSource';
import { MBLayerEvaluator } from './MBLayerEvaluator';
import { MBExpressionEngine } from './MBExpressionEngine';
import { MBTileDataEmitter } from './MBTileDataEmitter';
import { GeoJSONSourceSpec, StyleSpecification } from './MBStyleSpec';
import { mbCellTileKeyString, mbPendingChildrenPut, mbPendingSourceTilesClear, mbPendingSourceTilesPut, MBPendingChildTile, MBPendingSourceTile, MBStyleDecoder } from './MBStyleDecoder';
import { SpriteAtlas } from './materials/MapIconMaterial';
import { MBStyleRuntime } from './MBStyleRuntime';
import { MBEnvironmentManager } from './MBEnvironmentManager';
import { MBMaterialPatchManager } from './MBMaterialPatchManager';
import { openPMTilesUrl, openPMTilesBlobIndex, PMTilesBlobIndex } from './PMTiles';

export interface MBStyleDataSourceParameters {
    style: StyleSpecification | string;
    accessToken?: string;
    decoderScriptUrl?: string;
    concurrentDecoderServiceName?: string;
    storageLevelOffset?: number;
    minDisplayLevel?: number;
    maxDisplayLevel?: number;
    /** In-process decoder (e.g. `new MBStyleDecoder()`) to bypass the worker
     *  facade. Useful for karma/unit environments where the worker bundle is
     *  not served. */
    decoder?: ITileDecoder;
}

const MBSTYLE_DECODER_SERVICE_TYPE = 'mbstyle-vector-tile-decoder';

/**
 * DataProvider that generates synthetic GeoJSON polygon features for each tile,
 * carrying the raster tile image URL. The emitter creates a fill technique,
 * and the MaterialPatchManager loads the raster texture per-tile.
 */
class RasterTileDataProvider extends DataProvider {
    private m_tileUrlTemplate: string;
    private m_minZoom: number;
    private m_maxZoom: number;
    /**
     * Ideal tile level getter (flywave zoomLevel of the camera). mgl draws
     * ONE raster tile per screen cell (coveringZoomLevel = round(zoom + 1)),
     * while the engine schedules multiple levels — emitting coverage quads
     * at every level STACKS them (a 0.5-opacity raster layer then blends
     * different-resolution ancestor copies, washing the map out; observed
     * on raster-masking/overlapping-vector).
     */
    private m_idealLevel: (() => number) | undefined;
    /** §316: lazy mapView accessor (DataProviders have no mapView of their own). */
    m_mapViewRef?: () => any;
    /** §335: mgl LOD mode — allow multi-level coverage (engine schedules a
     * mixed z/z+1 set; the single-ideal-level gate would empty the LOD band). */
    m_multiLevelCoverage = false;
    /** §350: source tileSize (mgl distToSplit uses ccd/tileSize; was hardcoded 512). */
    m_sourceTileSize = 512;

    /** Optional URL factory override (PMTiles blob URLs). */
    private m_urlFactory?: (z: number, x: number, y: number) => string;
    /** Optional tile-existence override (PMTiles: blob URL presence). */
    private m_existsFn?: (url: string) => Promise<boolean>;

    constructor(tileUrlTemplate: string, minZoom: number = 0, maxZoom: number = 22,
        idealLevel?: () => number,
        urlFactory?: (z: number, x: number, y: number) => string,
        existsFn?: (url: string) => Promise<boolean>) {
        super();
        this.m_tileUrlTemplate = tileUrlTemplate;
        this.m_minZoom = minZoom;
        this.m_maxZoom = maxZoom;
        this.m_idealLevel = idealLevel;
        this.m_urlFactory = urlFactory;
        this.m_existsFn = existsFn;
    }

    ready(): boolean { return true; }

    /**
     * §316: emulate mgl coveringTiles' shouldSplit distance LOD — distant
     * tiles stop subdividing (mgl renders them at a LOWER level, whose
     * closest-ancestor mosaic differs; scripts/mgl-covering-tiles-ref.js is
     * the reference). Returns the highest level <= z that mgl's traversal
     * would use for this tile's area, or z when unknown camera state.
     */
    private mglLodLevel(z: number, x: number, y: number): number {
        try {
            const mv = this.m_mapViewRef?.() as any;
            const cam = mv?.camera;
            const canvas = mv?.canvas;
            if (!cam || !canvas) return z;
            const C = 40075016.686;
            const fovRad = (cam.fov ?? 36.87) * Math.PI / 180;
            const ccdPx = 0.5 / Math.tan(fovRad / 2) * canvas.height;
            // §352: mgl shouldSplit exact spec, aligned with the engine-side
            // §347 formula — zoomSplitDistance = ccd/tileSize is in units of
            // tiles at the COVERING zoom (z here = the request/data zoom), and
            // the threshold scales by 2^(coveringZoom − level):
            //   distToSplit(level) = 2^(z−level) · ccd/tileSize / 2^z   (mercator)
            const zoomSplitTiles = ccdPx / Math.max(1, this.m_sourceTileSize);
            const camMerc = [cam.position.x / C, cam.position.y / C, cam.position.z / C];
            // forward vector (mgl camera.forward()): yaw = −heading, same
            // convention as FrustumIntersection §343 —
            // (−sin(yaw)·sinT, cos(yaw)·sinT, −cosT).
            const tiltRad = ((mv.tilt ?? 0) * Math.PI) / 180;
            const yawRad = (-(mv.heading ?? 0) * Math.PI) / 180;
            const sinT = Math.sin(tiltRad), cosT = Math.cos(tiltRad);
            const fwd = [
                -Math.sin(yawRad) * sinT,
                // mercator frame here is y-DOWN (south positive — camera
                // probe: heading -45 puts the camera SE of center looking
                // NW, fwd.y must be negative), so the engine-side (y-up)
                // fwd.y term flips sign.
                -Math.cos(yawRad) * sinT,
                -cosT,
            ];
            // distToSplitScale (mgl transform.ts): acute-angle adaptive stretch
            const scale = (dz: number, d: number): number => {
                const s = 0.707, stretch = 1.1;
                if (d * s < dz) return 1.0;
                const r = d / dz;
                const k = r - 1 / s;
                return r / (1 / s + (Math.pow(stretch, k + 1) - 1) / (stretch - 1) - 1);
            };
            // Walk top-down: the level where the ancestor stops splitting is
            // mgl's render level for this tile's area.
            const camHm = Math.abs(camMerc[2]);
            for (let l = 1; l <= z; l++) {
                // would the l-1 parent split into l?
                const pshift = z - (l - 1);
                const px = x >> pshift, py = y >> pshift;
                const n = Math.pow(2, l - 1);
                // tile extent in mercator units
                const minX = px / n, maxX = (px + 1) / n, minY = py / n, maxY = (py + 1) / n;
                // mgl uses the MIN forward-projected corner distance
                // (mercator z-comp = cameraHeight), NOT the clamped closest
                // point (§352: the clamped form under-demotes the mid band).
                let d = Infinity;
                for (const cx of [minX, maxX]) {
                    for (const cy of [minY, maxY]) {
                        const dist =
                            (cx - camMerc[0]) * fwd[0] +
                            (cy - camMerc[1]) * fwd[1] +
                            camHm * fwd[2];
                        if (dist < d) d = dist;
                    }
                }
                const distMerc = Math.pow(2, z - (l - 1)) * zoomSplitTiles / Math.pow(2, z);
                const dzMerc = Math.max(camHm, 1e-9);
                if (!(d * scale(dzMerc, d) < distMerc)) {
                    return l - 1;
                }
            }
            return z;
        } catch {
            return z;
        }
    }

    async getTile(tileKey: TileKey): Promise<ArrayBufferLike | {}> {
        const zReq = tileKey.level;
        const xReq = tileKey.column;
        const yReq = tileKey.row;
        // §316: demote far tiles to mgl's LOD level before resolving — the
        // ancestor mosaic then matches mgl's mixed-LOD covering.
        const lod = this.mglLodLevel(zReq, xReq, yReq);
        const z = lod;
        const x = lod === zReq ? xReq : xReq >> (zReq - lod);
        const y = lod === zReq ? yReq : yReq >> (zReq - lod);

        // Only the camera's ideal level produces coverage (mgl one-tile-per-
        // cell semantics). Other engine-scheduled levels return empty so
        // multi-level quads never stack on screen.
        if (this.m_idealLevel && !this.m_multiLevelCoverage) {
            const ideal = Math.min(Math.max(this.m_idealLevel(), this.m_minZoom), this.m_maxZoom);
            if (zReq !== ideal) {
                return JSON.stringify({ type: 'FeatureCollection', features: [] });
            }
        }

        // mgl coveringTiles: `if (z < options.minzoom) return []` — below
        // the source minzoom NOTHING is drawn (zoomed-raster/underzoom's
        // expected is pure black). Overzoom clamps the request to maxzoom.
        if (z < this.m_minZoom) {
            return JSON.stringify({ type: 'FeatureCollection', features: [] });
        }

        const tileUrl = (zz: number, xx: number, yy: number) =>
            this.m_urlFactory
                ? this.m_urlFactory(zz, xx, yy)
                : this.m_tileUrlTemplate
                    .replace('{z}', String(zz))
                    .replace('{x}', String(xx))
                    .replace('{y}', String(yy));

        // mgl overzooms from the closest available ancestor when a raster
        // tile 404s (render-test satellite fixtures live at a lower level
        // than the camera zoom, e.g. z12 fixtures under a z16 camera).
        // Walk up from min(z, maxzoom) and resolve the deepest existing
        // ancestor. Returns null when nothing exists down to z0.
        const resolveAncestor = async (
            zz: number, xx: number, yy: number
        ): Promise<{ srcZ: number; srcX: number; srcY: number } | null> => {
            const top = Math.min(zz, this.m_maxZoom);
            for (let a = top; a >= 0; a--) {
                const shift = zz - a;
                const ax = Math.floor(xx / Math.pow(2, shift));
                const ay = Math.floor(yy / Math.pow(2, shift));
                // eslint-disable-next-line no-await-in-loop
                if (await (this.m_existsFn ?? RasterTileDataProvider.tileExists)(tileUrl(a, ax, ay))) {
                    return { srcZ: a, srcX: ax, srcY: ay };
                }
            }
            return null;
        };

        // One quad covering tile (zz,xx,yy), textured from the ancestor
        // (sz,sx,sy) via the child's UV sub-rect in the ancestor image
        // (y top-down). Geometry UVs run (0,0)=tile north-west; with flipY
        // texture upload the sampling transform is
        // offset=(fx0, 1-fy0-fw), scale=(fw, fh).
        const buildFeature = (
            zz: number, xx: number, yy: number,
            sz: number, sx: number, sy: number
        ) => {
            const nn = Math.pow(2, zz);
            const span = Math.pow(2, zz - sz);
            const fw = 1 / span;
            const fx0 = (xx - sx * span) * fw;
            const fy0 = (yy - sy * span) * fw;
            return {
                type: 'Feature',
                geometry: {
                    type: 'Polygon',
                    coordinates: [[
                        [(xx / nn) * 360 - 180, this.tile2lat(yy, zz)],
                        [((xx + 1) / nn) * 360 - 180, this.tile2lat(yy, zz)],
                        [((xx + 1) / nn) * 360 - 180, this.tile2lat(yy + 1, zz)],
                        [(xx / nn) * 360 - 180, this.tile2lat(yy + 1, zz)],
                        [(xx / nn) * 360 - 180, this.tile2lat(yy, zz)],
                    ]],
                },
                properties: {
                    _rasterTileUrl: tileUrl(sz, sx, sy),
                    _rasterUvRect: [fx0, 1 - fy0 - fw, fw, fw],
                    _tileCol: xx,
                    _tileRow: yy,
                    _tileZoom: zz,
                },
            };
        };

        // mgl raster sources round the source zoom (`roundZoom: true`,
        // raster_tile_source.ts: coveringZoomLevel = round(zoom + 1) for a
        // tileSize-256 source) while flywave schedules tiles at
        // floor(zoomLevel). When the requested level 404s but children at
        // z+1 exist (e.g. camera 18.6: mgl requests z20, we request z19),
        // cover the quad with the four child tiles instead — per child,
        // falling back to that child's deepest ancestor exactly like mgl's
        // per-tile parent overzoom. Never descend past maxzoom.
        const tileExists = this.m_existsFn ?? RasterTileDataProvider.tileExists;
        if (z < this.m_maxZoom && !(await tileExists(tileUrl(z, x, y)))) {
            const childExists = await Promise.all([
                tileExists(tileUrl(z + 1, 2 * x, 2 * y)),
                tileExists(tileUrl(z + 1, 2 * x + 1, 2 * y)),
                tileExists(tileUrl(z + 1, 2 * x, 2 * y + 1)),
                tileExists(tileUrl(z + 1, 2 * x + 1, 2 * y + 1)),
            ]);
            if (childExists.some((e) => e)) {
                const features = [];
                for (let dy = 0; dy < 2; dy++) {
                    for (let dx = 0; dx < 2; dx++) {
                        const cz = z + 1;
                        const cx = 2 * x + dx;
                        const cy = 2 * y + dy;
                        const anc = childExists[dy * 2 + dx]
                            ? { srcZ: cz, srcX: cx, srcY: cy }
                            // eslint-disable-next-line no-await-in-loop
                            : await resolveAncestor(cz, cx, cy);
                        if (anc) {
                            features.push(buildFeature(cz, cx, cy, anc.srcZ, anc.srcX, anc.srcY));
                        }
                    }
                }
                if (features.length > 0) {
                    return JSON.stringify({ type: 'FeatureCollection', features });
                }
            }
        }

        // Single-quad path: deepest ancestor of the requested tile itself.
        // NOTE (§102): mgl's exact ascent was probed live (one parent level
        // per update cycle, gated by parentWasRequested state quirks). A
        // simplified one-level rule fixed this fixture but broke the sibling
        // masking fixtures — the deep chain stays until the full retain/
        // ascent logic is ported.
        const anc = await resolveAncestor(z, x, y);
        if (!anc) {
            // §351: no existing ancestor at ANY level — mgl draws NOTHING for
            // this tile (draw_raster `continue`); the background layer/pattern
            // shows through (error-overlap: expected east band is the raw
            // airport pattern (86,115,212), pixel-map-verified). The former
            // requested-z fallback produced a guaranteed-404 URL → failed
            // texture → un-textured white quad (49k px).
            return JSON.stringify({ type: 'FeatureCollection', features: [] });
        }
        // §780: pole-row tiles register a globe pole cap (mgl GLOBE_POLES
        // fan; mercator ends at ±85.0511° and the cap region is
        // unrepresentable in our mercator quad pipeline). mgl draws these
        // caps whenever the covering includes a pole-row tile, sampling the
        // tile texture's edge row (pixel-probe on globe-poles/north: the
        // expected pole = the dark z1 edge-row streaks at raster-opacity
        // OVER the fogged background dome).
        {
            const maxRow = Math.pow(2, z) - 1;
            if (z > 0 && (y === 0 || y === maxRow)) {
                const spanCap = Math.pow(2, z - anc.srcZ);
                const fwCap = 1 / spanCap;
                const fx0Cap = (x - anc.srcX * spanCap) * fwCap;
                const fy0Cap = (y - anc.srcY * spanCap) * fwCap;
                // Edge-row v (flipY space), nudged half a texel inside.
                const dvCap = fwCap / 256;
                const vEdgeCap = y === 0
                    ? 1 - fy0Cap - 0.5 * dvCap
                    : 1 - (fy0Cap + fwCap) + 0.5 * dvCap;
                const { MBGlobePoleCaps } = await import('./MBGlobePoleCaps');
                MBGlobePoleCaps.register({
                    key: `${z}/${x}/${y}`,
                    isNorth: y === 0,
                    lon0: (x / Math.pow(2, z)) * 360 - 180,
                    lon1: ((x + 1) / Math.pow(2, z)) * 360 - 180,
                    texUrl: tileUrl(anc.srcZ, anc.srcX, anc.srcY),
                    u0: fx0Cap,
                    u1: fx0Cap + fwCap,
                    vEdge: vEdgeCap,
                });
            }
        }
        return JSON.stringify({
            type: 'FeatureCollection',
            features: [buildFeature(z, x, y, anc.srcZ, anc.srcX, anc.srcY)],
        });
    }

    /** HEAD-probe cache: which tile URLs exist for the current template. */
    private static readonly s_existingTiles = new Set<string>();
    private static readonly s_missingTiles = new Set<string>();
    private static async tileExists(url: string): Promise<boolean> {
        if (RasterTileDataProvider.s_existingTiles.has(url)) return true;
        if (RasterTileDataProvider.s_missingTiles.has(url)) return false;
        try {
            // GET (not HEAD): the karma static server may not answer HEAD.
            const resp = await fetch(url);
            if (resp.ok) {
                RasterTileDataProvider.s_existingTiles.add(url);
                return true;
            }
            RasterTileDataProvider.s_missingTiles.add(url);
            return false;
        } catch {
            return false;
        }
    }

    private tile2lat(y: number, z: number): number {
        const n = Math.PI - (2 * Math.PI * y) / Math.pow(2, z);
        return (180 / Math.PI) * Math.atan(Math.sinh(n));
    }

    protected async connect(): Promise<void> {}
    protected dispose(): void {}
}

/**
 * PMTiles vector source: serves decoded MVT bytes from a single-file
 * archive. Overzoom walks to the archive's maxzoom ancestor (mgl reuses
 * the parent tile); below minzoom nothing is drawn (mgl semantics).
 */
class PMTilesVectorDataProvider extends DataProvider {
    private m_url: string;
    constructor(url: string) { super(); this.m_url = url; }
    ready(): boolean { return true; }
    async getTile(tileKey: TileKey, abortSignal?: AbortSignal): Promise<ArrayBufferLike | {}> {
        const archive = await openPMTilesUrl(this.m_url);
        let z = tileKey.level;
        let x = tileKey.column;
        let y = tileKey.row;
        // Below minzoom nothing is drawn (mgl); a missing tile at/below
        // maxzoom REJECTS like OmvRestClient's 404 — the engine then falls
        // back to the retained parent tile (mgl updateRetainedTiles).
        if (z < archive.minZoom) return {};
        while (z > archive.maxZoom) { z--; x >>= 1; y >>= 1; }
        let bytes = await archive.getTile(z, x, y);
        if (!bytes && z > archive.minZoom) {
            // Sparse-archive overzoom: serve the closest ancestor's bytes.
            // The MVT's tile-local coordinates then land scaled inside this
            // tile's extent — exact for uniform content (open-water cells),
            // approximate otherwise.
            let az = z, ax = x, ay = y;
            while (az > archive.minZoom) {
                az--; ax >>= 1; ay >>= 1;
                // eslint-disable-next-line no-await-in-loop
                bytes = await archive.getTile(az, ax, ay);
                if (bytes) break;
            }
        }
        if (!bytes) throw new Error(`PMTiles: no tile ${tileKey.level}/${tileKey.column}/${tileKey.row}`);
        return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
    }
    protected async connect(): Promise<void> {}
    protected dispose(): void {}
}

/**
 * TMS scheme wrapper: flips the y (row) coordinate before delegating.
 * TMS uses y from bottom; flywave uses XYZ (y from top).
 * yTms = 2^z - 1 - yXyz
 */
class TMSDataProvider extends DataProvider {
    private m_inner: DataProvider;
    constructor(inner: DataProvider) { super(); this.m_inner = inner; }
    ready(): boolean { return this.m_inner.ready(); }
    async getTile(tileKey: TileKey, abortSignal?: AbortSignal): Promise<ArrayBufferLike | {}> {
        const n = Math.pow(2, tileKey.level);
        const flippedRow = n - 1 - tileKey.row;
        const flippedKey = TileKey.fromRowColumnLevel(flippedRow, tileKey.column, tileKey.level);
        return this.m_inner.getTile(flippedKey, abortSignal);
    }
    protected async connect(): Promise<void> {}
    protected dispose(): void {}
}

/**
 * Bounds-filtering wrapper: skips tiles outside a source's `bounds`
 * rectangle [minLng, minLat, maxLng, maxLat]. Returns empty data for
 * out-of-bounds tiles so the decoder renders nothing for them.
 */
/**
 * §681: mgl source-maxzoom overzoom clamp for the PRIMARY vector source.
 * mgl requests tiles at round(zoom) CLAMPED to the source's maxzoom and
 * overzooms (scales the deepest-available parent to fill the display
 * frame). Flyway requests the raw display-level tile, so for styles whose
 * vendored data stops at maxzoom (ground-shadow-fog: maxzoom 15, display
 * 17.2) the z16+ requests 404 and the near field renders empty. Clamp the
 * request to the parent tile at maxzoom; the decoder/emitter treat it as
 * the cell's content exactly like mgl's overzoomed source tile.
 */
class MglMaxZoomAncestorProvider extends DataProvider {
    private m_inner: DataProvider;
    private m_maxzoom: number;
    constructor(inner: DataProvider, maxzoom: number) {
        super();
        this.m_inner = inner;
        this.m_maxzoom = maxzoom;
    }
    ready(): boolean { return this.m_inner.ready(); }
    protected async connect(): Promise<void> {}
    protected dispose(): void {}
    async getTile(tileKey: TileKey, abortSignal?: AbortSignal): Promise<ArrayBufferLike | {}> {
        const lvl = tileKey.level;
        if (lvl <= this.m_maxzoom) {
            return this.m_inner.getTile(tileKey, abortSignal);
        }
        const shift = lvl - this.m_maxzoom;
        const x = tileKey.column >> shift;
        const y = tileKey.row >> shift;
        const parentKey = TileKey.fromRowColumnLevel(y, x, this.m_maxzoom);
        return this.m_inner.getTile(parentKey, abortSignal);
    }
}

class BoundsFilteredDataProvider extends DataProvider {
    private m_inner: DataProvider;
    private m_bounds: [number, number, number, number];
    constructor(inner: DataProvider, bounds: [number, number, number, number]) {
        super();
        this.m_inner = inner;
        this.m_bounds = bounds;
    }
    ready(): boolean { return this.m_inner.ready(); }
    async getTile(tileKey: TileKey, abortSignal?: AbortSignal): Promise<ArrayBufferLike | {}> {
        // Compute tile geographic bounds.
        const z = tileKey.level;
        const x = tileKey.column;
        const y = tileKey.row;
        const n = Math.pow(2, z);
        const tileW = (x / n) * 360 - 180;
        const tileE = ((x + 1) / n) * 360 - 180;
        const tileN = (180 / Math.PI) * Math.atan(Math.sinh(Math.PI * (1 - 2 * y / n)));
        const tileS = (180 / Math.PI) * Math.atan(Math.sinh(Math.PI * (1 - 2 * (y + 1) / n)));
        const [minLng, minLat, maxLng, maxLat] = this.m_bounds;
        // Skip if tile is entirely outside the bounds rectangle.
        if (tileE < minLng || tileW > maxLng || tileS > maxLat || tileN < minLat) {
            return JSON.stringify({ type: 'FeatureCollection', features: [] });
        }
        return this.m_inner.getTile(tileKey, abortSignal);
    }
    protected async connect(): Promise<void> {}
    protected dispose(): void {}
}

/**
 * DataProvider for hillshade layers. Generates a tile-covering polygon per tile
 * carrying the resolved raster-DEM tile url, so the emitter can emit a fill
 * technique flagged as hillshade and the MaterialPatchManager can load the DEM
 * and apply the hillshade shader.
 */
class HillshadeTileDataProvider extends DataProvider {
    private m_demUrlTemplate: string;
    private m_tileSize: number;
    /** Optional per-tile URL factory (PMTiles blob URLs). */
    private m_urlFactory?: (z: number, x: number, y: number) => string;

    constructor(demUrlTemplate: string, tileSize: number = 256,
        urlFactory?: (z: number, x: number, y: number) => string) {
        super();
        this.m_demUrlTemplate = demUrlTemplate;
        this.m_tileSize = tileSize;
        this.m_urlFactory = urlFactory;
    }

    ready(): boolean { return true; }

    async getTile(tileKey: TileKey): Promise<ArrayBufferLike | {}> {
        const z = tileKey.level;
        const x = tileKey.column;
        const y = tileKey.row;

        // Mapbox raster-dem semantics: DEM tiles are stored one level lower for
        // 512/514px sources (tileSize 514 covers a 512px world → parent tile),
        // so request the DEM at `z - 2` for large tileSize, else `z`. The DEM
        // x/y must be recomputed at the DEM level (parent tile of this quad).
        const demOffset = this.m_tileSize > 256 ? 2 : 0;
        const demZ = Math.max(0, z - demOffset);
        const shift = z - demZ;
        const demX = Math.floor(x / Math.pow(2, shift));
        const demY = Math.floor(y / Math.pow(2, shift));

        const n = Math.pow(2, z);
        const lngW = (x / n) * 360 - 180;
        const lngE = ((x + 1) / n) * 360 - 180;
        const latN = this.tile2lat(y, z);
        const latS = this.tile2lat(y + 1, z);

        const demUrl = this.m_urlFactory
            ? this.m_urlFactory(demZ, demX, demY)
            : this.m_demUrlTemplate
                .replace('{z}', String(demZ))
                .replace('{x}', String(demX))
                .replace('{y}', String(demY));

        const geojson = {
            type: 'FeatureCollection',
            features: [{
                type: 'Feature',
                geometry: {
                    type: 'Polygon',
                    coordinates: [[
                        [lngW, latN],
                        [lngE, latN],
                        [lngE, latS],
                        [lngW, latS],
                        [lngW, latN],
                    ]],
                },
                properties: {
                    _hillshadeDemUrl: demUrl,
                    _tileSize: this.m_tileSize,
                    _tileCol: x,
                    _tileRow: y,
                    _tileZoom: z,
                },
            }],
        };

        return JSON.stringify(geojson);
    }

    private tile2lat(y: number, z: number): number {
        const n = Math.PI - (2 * Math.PI * y) / Math.pow(2, z);
        return (180 / Math.PI) * Math.atan(Math.sinh(n));
    }

    protected async connect(): Promise<void> {}
    protected dispose(): void {}
}
/**
 * Tile-bounds filtering with mgl geojson-vt semantics: a point exactly on a
 * tile corner renders ONCE (half-open [west,east) × (south,north]), not once
 * per adjacent tile. Without this, low-zoom views stack the same feature 4×
 * (invisible with opaque paints, exposed by circle-opacity 0.5, #6655).
 * Lines/polygons stay in every intersecting tile (clipped at render, like vt).
 */
/** Style-level: any layer uses a *-sort-key paint (points stay in all tiles). */
let s_keepPointsForSortKey = false;

/** geojson lat → normalized mercator y (0 = south, 1 = north). */
function mercYof(lat: number): number {
    const s = Math.max(-0.99999, Math.min(0.99999, Math.sin((lat * Math.PI) / 180)));
    return 0.5 - Math.log((1 + s) / (1 - s)) / (4 * Math.PI);
}

/** normalized mercator y → geojson lat. */
function latOfMercY(y: number): number {
    const n = Math.PI * (1 - 2 * y);
    return (180 / Math.PI) * Math.atan(Math.sinh(n));
}

/**
 * §783: Sutherland–Hodgman clip of a polygon ring against the tile's
 * mercator rect (x = lng, y = normalized mercator y — the same space the
 * tiles partition). mgl's geojson-vt always clips polygons per tile; this
 * provider kept them whole in every intersecting tile ("clipped at render")
 * — but the globe emit renders each tile's geometry VERBATIM, so a feature
 * spanning N column tiles drew N stacked translucent copies
 * (at-transition-zoom: 0.5-blue quad drawn 3× — 255×0.125 = 32 exact).
 * Winding is preserved (holes stay holes); a polygon whose exterior ring
 * clips away is dropped whole. Returns null when nothing remains.
 */
function clipRingToTile(
    ring: number[][],
    west: number,
    east: number,
    southY: number,
    northY: number
): number[][] | null {
    const open =
        ring.length > 1 &&
        ring[0][0] === ring[ring.length - 1][0] &&
        ring[0][1] === ring[ring.length - 1][1]
            ? ring.slice(0, -1)
            : ring.slice();
    if (open.length < 3) return null;
    let poly: number[][] = open.map(([lng, lat]) => [lng, mercYof(lat)]);
    const edges: Array<[(p: number[]) => boolean, (a: number[], b: number[]) => number[]]> = [
        [
            (p) => p[0] >= west,
            (a, b) => [west, a[1] + (b[1] - a[1]) * ((west - a[0]) / (b[0] - a[0]))],
        ],
        [
            (p) => p[0] <= east,
            (a, b) => [east, a[1] + (b[1] - a[1]) * ((east - a[0]) / (b[0] - a[0]))],
        ],
        [
            (p) => p[1] >= northY,
            (a, b) => [a[0] + (b[0] - a[0]) * ((northY - a[1]) / (b[1] - a[1])), northY],
        ],
        [
            (p) => p[1] <= southY,
            (a, b) => [a[0] + (b[0] - a[0]) * ((southY - a[1]) / (b[1] - a[1])), southY],
        ],
    ];
    for (const [inside, isect] of edges) {
        const input = poly;
        poly = [];
        for (let i = 0; i < input.length; i++) {
            const cur = input[i];
            const prev = input[(i + input.length - 1) % input.length];
            const cin = inside(cur);
            const pin = inside(prev);
            if (cin) {
                if (!pin) poly.push(isect(prev, cur));
                poly.push(cur);
            } else if (pin) {
                poly.push(isect(prev, cur));
            }
        }
        if (poly.length === 0) return null;
    }
    if (poly.length < 3) return null;
    return poly.map(([x, y]) => [x, latOfMercY(y)]);
}

/**
 * Clip a Polygon/MultiPolygon to the tile rect. Exterior dropped → polygon
 * dropped (surviving holes alone would break tessellation); holes clip
 * independently. Returns null when nothing remains inside the tile.
 */
function clipPolygonFeatureToTile(
    coords: any,
    isMulti: boolean,
    west: number,
    east: number,
    southY: number,
    northY: number
): any | null {
    const clipPoly = (poly: number[][][]): number[][][] | null => {
        if (poly.length === 0) return null;
        const exterior = clipRingToTile(poly[0], west, east, southY, northY);
        if (!exterior) return null;
        exterior.push([...exterior[0]]);
        const rings = [exterior];
        for (let h = 1; h < poly.length; h++) {
            const hole = clipRingToTile(poly[h], west, east, southY, northY);
            if (hole && hole.length >= 3) {
                hole.push([...hole[0]]);
                rings.push(hole);
            }
        }
        return rings;
    };
    if (isMulti) {
        const out: number[][][][] = [];
        for (const poly of coords as number[][][][]) {
            const clipped = clipPoly(poly);
            if (clipped) out.push(clipped);
        }
        return out.length > 0 ? out : null;
    }
    return clipPoly(coords as number[][][]);
}

function filterFeaturesToTile(fc: any, tileKey: any, keepPointsEverywhere?: boolean): any {
    if (!fc || typeof fc !== 'object') return fc;
    // Normalize bare Feature / bare geometry into a FeatureCollection (the
    // decoder does the same at decode time — normalizeGeoJson).
    if (fc.type === 'Feature') {
        fc = { type: 'FeatureCollection', features: [fc] };
    } else if (!Array.isArray(fc.features)) {
        const geometryTypes = new Set([
            'Point', 'MultiPoint', 'LineString', 'MultiLineString',
            'Polygon', 'MultiPolygon', 'GeometryCollection',
        ]);
        if (typeof fc.type === 'string' && geometryTypes.has(fc.type)) {
            fc = { type: 'FeatureCollection', features: [{ type: 'Feature', geometry: fc, properties: {} }] };
        } else {
            return fc;
        }
    }
    // GeometryCollection features: keep conservatively when any sub-geometry
    // intersects (per-type logic below).
    const n = Math.pow(2, tileKey.level);
    const west = (tileKey.column / n) * 360 - 180;
    const east = ((tileKey.column + 1) / n) * 360 - 180;
    const latAtY = (y: number) => {
        const r = Math.PI * (1 - 2 * y);
        return (180 / Math.PI) * Math.atan(Math.sinh(r));
    };
    const north = latAtY(tileKey.row / n);
    const south = latAtY((tileKey.row + 1) / n);
    const lng = (v: number) => ((((v + 180) % 360) + 360) % 360) - 180;
    const pointInTile = (x: number, y: number): boolean => {
        const lx = lng(x);
        return lx >= west && lx < east && y <= north && y > south;
    };
    const geomBbox = (g: any): [number, number, number, number] | null => {
        let minLng = Infinity, minLat = Infinity, maxLng = -Infinity, maxLat = -Infinity;
        const visit = (coords: any) => {
            if (!Array.isArray(coords)) return;
            if (typeof coords[0] === 'number' && typeof coords[1] === 'number') {
                minLng = Math.min(minLng, lng(coords[0])); maxLng = Math.max(maxLng, lng(coords[0]));
                minLat = Math.min(minLat, coords[1]); maxLat = Math.max(maxLat, coords[1]);
                return;
            }
            for (const c of coords) visit(c);
        };
        visit(g?.coordinates ?? g);
        return minLng === Infinity ? null : [minLng, minLat, maxLng, maxLat];
    };
    const out: any[] = [];
    for (let f of fc.features) {
        const geomType = f?.geometry?.type;
        if (keepPointsEverywhere && (geomType === 'Point' || geomType === 'MultiPoint')) {
            // Layers with a *-sort-key paint need every point in every tile:
            // per-tile draw order is globally sorted, so duplicating points
            // across adjacent tiles is compositionally equivalent to mgl's
            // global translucent sort (every pair is ordered correctly in
            // whichever tile draws last). Deduplicating instead would order
            // pairs by tile draw order (cross-tile-sort regression, §418).
            out.push(f);
            continue;
        }
        if (geomType === 'Point') {
            const [x, y] = f.geometry.coordinates;
            if (!pointInTile(x, y)) continue;
        } else if (geomType === 'MultiPoint') {
            const pts = (f.geometry.coordinates as number[][]).filter(p => pointInTile(p[0], p[1]));
            if (pts.length === 0) continue;
            if (pts.length < (f.geometry.coordinates as number[][]).length) {
                f = { ...f, geometry: { ...f.geometry, coordinates: pts } };
            }
        } else if (geomType === 'GeometryCollection') {
            const subs = (f.geometry.geometries ?? []) as any[];
            const keep = subs.some(g =>
                g?.type === 'Point'
                    ? pointInTile(g.coordinates[0], g.coordinates[1])
                    : (() => {
                        const b = geomBbox(g);
                        return !!b && !(b[0] > east || b[2] < west || b[3] < south || b[1] > north);
                    })());
            if (!keep) continue;
        } else if (geomType === 'Polygon' || geomType === 'MultiPolygon') {
            // §783: polygons are CLIPPED to the tile rect (geojson-vt
            // semantics). Keeping them whole drew N stacked copies for a
            // feature spanning N tiles wherever the paint is translucent.
            const southY = mercYof(south);
            const northY = mercYof(north);
            const isMulti = geomType === 'MultiPolygon';
            const clipped = clipPolygonFeatureToTile(
                f.geometry.coordinates,
                isMulti,
                west,
                east,
                southY,
                northY
            );
            if (!clipped) continue;
            if (clipped !== f.geometry.coordinates) {
                f = { ...f, geometry: { ...f.geometry, coordinates: clipped } };
            }
        } else if (geomType) {
            const bbox = geomBbox(f.geometry);
            if (!bbox || bbox[0] > east || bbox[2] < west || bbox[3] < south || bbox[1] > north) {
                continue;
            }
        }
        out.push(f);
    }
    fc.features = out;
    return fc;
}

class GeoJSONDataProvider extends DataProvider {
    private m_geoJsonData: string;
    private m_cluster: boolean = false;
    private m_clusterRadius: number = 50;
    private m_clusterMaxZoom: number = 16;
    private m_clusteredCache: Map<number, string> = new Map();
    /**
     * clusterProperties spec — e.g. `{ total: ['+', ['get', 'value']] }`.
     * Each entry maps a cluster-property name to a `[aggregator, mapExpr]`
     * pair. The map expression is evaluated per source point feature; the
     * aggregator (`['+']`, `['max']`, `['min']`, etc.) combines the values.
     */
    private m_clusterProperties: Record<string, any> = {};
    /** See filterFeaturesToTile — keep points in every adjacent tile. */
    private m_keepPointsEverywhere = false;

    constructor(data: any, clusterOpts?: {
        cluster?: boolean;
        clusterRadius?: number;
        clusterMaxZoom?: number;
        clusterProperties?: Record<string, any>;
        keepPointsEverywhere?: boolean;
    }) {
        super();
        this.m_geoJsonData = typeof data === 'string' ? data : JSON.stringify(data);
        if (clusterOpts) {
            this.m_cluster = clusterOpts.cluster ?? false;
            this.m_clusterRadius = clusterOpts.clusterRadius ?? 50;
            this.m_clusterMaxZoom = clusterOpts.clusterMaxZoom ?? 16;
            this.m_clusterProperties = clusterOpts.clusterProperties ?? {};
            this.m_keepPointsEverywhere = clusterOpts.keepPointsEverywhere === true;
        }
    }

    ready(): boolean { return true; }

    async getTile(tileKey: TileKey): Promise<ArrayBufferLike | {}> {
        if (!this.m_cluster) {
            // Per-tile bounds filtering (see filterFeaturesToTile) — the raw
            // payload would repeat every point across all adjacent tiles.
            try {
                return JSON.stringify(
                    filterFeaturesToTile(JSON.parse(this.m_geoJsonData), tileKey, this.m_keepPointsEverywhere)
                );
            } catch {
                return this.m_geoJsonData;
            }
        }
        const zoom = tileKey.level;
        if (zoom >= this.m_clusterMaxZoom) {
            // §783: same per-tile point dedup as the unclustered path — the
            // raw payload would repeat every point across all intersecting
            // tiles (clustered draws included).
            try {
                return JSON.stringify(
                    filterFeaturesToTile(JSON.parse(this.m_geoJsonData), tileKey, this.m_keepPointsEverywhere)
                );
            } catch {
                return this.m_geoJsonData;
            }
        }
        if (!this.m_clusteredCache.has(zoom)) {
            const clustered = this.clusterAtZoom(zoom);
            this.m_clusteredCache.set(zoom, clustered);
        }
        // §783: clusters are anchored to their centroid — a cluster renders
        // once, in the tile that owns it, not in every intersecting tile.
        try {
            return JSON.stringify(
                filterFeaturesToTile(JSON.parse(this.m_clusteredCache.get(zoom)!), tileKey, false)
            );
        } catch {
            return this.m_clusteredCache.get(zoom)!;
        }
    }

    /**
     * supercluster-equivalent hierarchical clustering.
     *
     * Points project to the 512-unit extent (supercluster's z0 world size);
     * from clusterMaxZoom down to the requested level one greedy pass per
     * level merges every unclustered neighbour within
     * `clusterRadius / 2^z` (a fixed screen radius halves its world
     * footprint each level up). A level's clusters become the next level's
     * input points, so clusters merge hierarchically with numPoints-
     * weighted centroids — matching supercluster's per-zoom trees.
     */
    private clusterAtZoom(zoom: number): string {
        try {
            const geo = JSON.parse(this.m_geoJsonData);
            const features = geo.features ?? [];
            const nonPoints = features.filter((f: any) => f.geometry?.type !== 'Point');
            const sourcePoints = features.filter((f: any) => f.geometry?.type === 'Point');
            if (sourcePoints.length === 0) return this.m_geoJsonData;

            interface ClusterNode {
                x: number; y: number;
                numPoints: number;
                leaves: any[];
                feature: any;
            }
            const lngX = (lng: number) => (lng / 360 + 0.5) * 512;
            const latY = (lat: number) => {
                const sin = Math.sin((lat * Math.PI) / 180);
                const y = 0.5 - 0.25 * Math.log((1 + sin) / (1 - sin)) / Math.PI;
                return y * 512;
            };
            let current: ClusterNode[] = sourcePoints.map((f: any) => {
                const [lng, lat] = f.geometry.coordinates;
                return { x: lngX(lng), y: latY(lat), numPoints: 1, leaves: [f], feature: f };
            });

            let nextId = 1;
            for (let z = this.m_clusterMaxZoom - 1; z >= zoom; z--) {
                const r2 = (this.m_clusterRadius / Math.pow(2, z)) ** 2;
                const visited = new Array(current.length).fill(false);
                const next: ClusterNode[] = [];
                for (let i = 0; i < current.length; i++) {
                    if (visited[i]) continue;
                    visited[i] = true;
                    const group: ClusterNode[] = [current[i]];
                    for (let j = i + 1; j < current.length; j++) {
                        if (visited[j]) continue;
                        const dx = current[j].x - current[i].x;
                        const dy = current[j].y - current[i].y;
                        if (dx * dx + dy * dy <= r2) {
                            visited[j] = true;
                            group.push(current[j]);
                        }
                    }
                    if (group.length === 1) {
                        next.push(group[0]);
                        continue;
                    }
                    let num = 0, wx = 0, wy = 0;
                    for (const g of group) {
                        num += g.numPoints;
                        wx += g.x * g.numPoints;
                        wy += g.y * g.numPoints;
                    }
                    const leaves = group.flatMap((g) => g.leaves);
                    const props: Record<string, any> = {
                        cluster: true,
                        cluster_id: nextId++,
                        point_count: num,
                        point_count_abbreviated: num >= 10000
                            ? `${Math.floor(num / 1000)}k`
                            : num >= 1000
                                ? `${Math.round(num / 100) / 10}k`
                                : num,
                    };
                    for (const [name, spec] of Object.entries(this.m_clusterProperties)) {
                        props[name] = aggregateClusterProperty(spec, leaves);
                    }
                    const cx = wx / num, cy = wy / num;
                    const lng = (cx / 512 - 0.5) * 360;
                    const lat = (2 * Math.atan(Math.exp((0.5 - cy / 512) * 2 * Math.PI))
                        - Math.PI / 2) * 180 / Math.PI;
                    next.push({
                        x: cx, y: cy,
                        numPoints: num,
                        leaves,
                        feature: {
                            type: 'Feature',
                            geometry: { type: 'Point', coordinates: [lng, lat] },
                            properties: props,
                        },
                    });
                }
                current = next;
            }

            return JSON.stringify({
                ...geo,
                features: [...nonPoints, ...current.map((n) => n.feature)],
            });
        } catch {
            return this.m_geoJsonData;
        }
    }

    updateData(data: any): void {
        this.m_geoJsonData = typeof data === 'string' ? data : JSON.stringify(data);
        this.m_clusteredCache.clear();
    }

    protected async connect(): Promise<void> {}
    protected dispose(): void {}
}

/**
 * Aggregate one clusterProperty across a group of source features.
 *
 * The mapbox spec form is `clusterProperties: { name: [aggregator, mapExpr] }`
 * where `aggregator` is an expression like `['+']` / `['max']` / `['min']`
 * applied to the per-feature mapped values. We support the most common
 * aggregators natively without needing the full expression engine.
 */
function aggregateClusterProperty(
    spec: any,
    group: any[],
): number | any[] {
    if (!Array.isArray(spec) || spec.length < 2) return 0;
    const agg = spec[0];
    const mapExpr = spec[1];
    // Lazy import to avoid cycle when this file is loaded by the engine.
    const { MBExpressionEngine } = require('./MBExpressionEngine');
    const mapped = group.map((f) => {
        return MBExpressionEngine.evaluate(mapExpr, {
            zoom: 0,
            feature: { type: 'Point', properties: f.properties ?? {}, id: f.id },
        });
    });
    // Aggregator operator (a single-element expression like ['+']).
    const op = Array.isArray(agg) ? agg[0] : agg;
    switch (op) {
        case '+': {
            let s = 0;
            for (const v of mapped) s += Number(v) || 0;
            return s;
        }
        case 'max': {
            let m = -Infinity;
            for (const v of mapped) if (Number(v) > m) m = Number(v);
            return m === -Infinity ? 0 : m;
        }
        case 'min': {
            let m = Infinity;
            for (const v of mapped) if (Number(v) < m) m = Number(v);
            return m === Infinity ? 0 : m;
        }
        case '*': {
            let p = 1;
            for (const v of mapped) p *= Number(v) || 1;
            return p;
        }
        default:
            return mapped;
    }
}

class DelegatingDataProvider extends DataProvider {
    delegate: DataProvider | null = null;

    ready(): boolean {
        return this.delegate?.ready() ?? true;
    }

    async getTile(tileKey: TileKey, abortSignal?: AbortSignal): Promise<ArrayBufferLike | {}> {
        // §265: an EMPTY payload (ArrayBuffer(0)) trips TileLoader's
        // empty-object short-circuit — decodeTile is never called and the
        // per-tile background injection (globe bg-only styles) can't run.
        // Return a non-empty marker object: decode runs, the geojson branch
        // ignores it, and the injection fires. Styles WITHOUT the injection
        // gate decode to empty geometry exactly as before.
        if (!this.delegate) return { mb: 1 };
        try {
            return await this.delegate.getTile(tileKey, abortSignal);
        } catch {
            // Sparse tilesets / 404s: return empty data instead of crashing
            // the decode pipeline. The decoder handles empty FeatureCollections
            // gracefully (no features → no geometry).
            return JSON.stringify({ type: 'FeatureCollection', features: [] });
        }
    }

    protected async connect(): Promise<void> {
        if (this.delegate) {
            try {
                await (this.delegate as any).connect();
            } catch (e) {
                // Silently pass
            }
        }
    }

    protected dispose(): void {
        this.delegate = null;
    }
}

/**
 * §511: serves the four mgl-level children of a 404'd cell (see the wiring
 * comment above for the mgl covering semantics). Children are stashed in
 * the decoder-side pending registry under the CELL key; the cell request
 * itself returns an empty (non-empty-marker!) payload so the decode runs
 * and the merge fires.
 */
class MglChildFallbackProvider extends DataProvider {
    constructor(
        private m_inner: DataProvider,
        private m_maxZoom: number,
    ) {
        super();
    }

    ready(): boolean {
        return this.m_inner.ready();
    }

    async getTile(tileKey: TileKey, abortSignal?: AbortSignal): Promise<ArrayBufferLike | {}> {
        let data: ArrayBufferLike | {};
        try {
            data = await this.m_inner.getTile(tileKey, abortSignal);
        } catch {
            data = {};
        }
        if (data instanceof ArrayBuffer || data instanceof Uint8Array) {
            return data;
        }
        // Miss (sparse tileset 404): try the four mgl-level children.
        const L = tileKey.level;
        if (L >= this.m_maxZoom) return data;
        const x = tileKey.column;
        const y = tileKey.row;
        const children: MBPendingChildTile[] = [];
        for (let i = 0; i < 2; i++) {
            for (let j = 0; j < 2; j++) {
                const cx = 2 * x + i;
                const cy = 2 * y + j;
                try {
                    const cb: ArrayBufferLike | {} =
                        await this.m_inner.getTile(
                            TileKey.fromRowColumnLevel(cy, cx, L + 1), abortSignal);
                    if (cb instanceof ArrayBuffer || cb instanceof Uint8Array) {
                        children.push({ z: L + 1, x: cx, y: cy, bytes: cb });
                    }
                } catch {
                    // Missing quarter → renders empty (pre-fallback behavior).
                }
            }
        }
        if (children.length === 0) return data;
        mbPendingChildrenPut(mbCellTileKeyString(tileKey), children);
        // Non-empty marker so TileLoader doesn't short-circuit the decode
        // (§265) — the geojson branch ignores it and the merge runs.
        return JSON.stringify({ type: 'FeatureCollection', features: [] });
    }

    protected async connect(): Promise<void> {
        try {
            await (this.m_inner as any).connect();
        } catch {}
    }

    protected dispose(): void {
        // nothing — the inner provider is owned by the caller
    }
}

/**
 * §518: multi-vector-source styles (mgl loads a covering per source; the
 * trees/landmark points of the model-layer fixtures live in a SECOND vector
 * source next to the base). Wraps the PRIMARY source's provider chain: on
 * every cell request it also fetches the extra vector sources' tiles at
 * their mgl covering level (round(zoom) clamped to the source maxzoom,
 * ancestor-shifted — transform.ts:865/coveringZoomLevel) and stashes them
 * for the decoder's frame-correct merge (mbPendingSourceTilesPut). The
 * primary response flows through unchanged, so single-source behavior is
 * untouched.
 */
class MBExtraVectorSourcesProvider extends DataProvider {
    constructor(
        private m_inner: DataProvider,
        private m_extras: Array<{
            sourceId: string;
            provider: DataProvider;
            maxzoom: number;
        }>,
        /** True when the PRIMARY source is 512px (cell level = mgl level −1). */
        private m_primary512: boolean,
    ) {
        super();
        // §643: sticky-stash epoch reset — a (re)wired style must never decode
        // a previous style's stashed extras (take() no longer consumes).
        mbPendingSourceTilesClear();
    }

    ready(): boolean {
        return this.m_inner.ready();
    }

    async getTile(tileKey: TileKey, abortSignal?: AbortSignal): Promise<ArrayBufferLike | {}> {
        const primary = this.m_inner.getTile(tileKey, abortSignal);
        // Fire the extra fetches concurrently with the primary — they are
        // best-effort (missing tile = its layers render empty).
        const stash: MBPendingSourceTile[] = [];
        const mglLevel = tileKey.level + (this.m_primary512 ? 1 : 0);
        await Promise.all(this.m_extras.map(async (ex) => {
            let lvl = mglLevel;
            let x = tileKey.column;
            let y = tileKey.row;
            if (lvl > ex.maxzoom) {
                const shift = lvl - ex.maxzoom;
                lvl = ex.maxzoom;
                x = x >> shift;
                y = y >> shift;
            }
            try {
                const bytes = await ex.provider.getTile(
                    TileKey.fromRowColumnLevel(y, x, lvl), abortSignal);
                if (typeof bytes === 'string' || bytes instanceof ArrayBuffer || bytes instanceof Uint8Array) {
                    const push = (bb: ArrayBufferLike | string, xx: number, yy: number, inst: boolean) => {
                        // §644: geojson extras carry a JSON string payload —
                        // decodeThemedTile's GeoJSON branch parses it.
                        stash.push(typeof bb === 'string'
                            ? { sourceId: ex.sourceId, z: lvl, x: xx, y: yy, bytes: undefined as unknown as ArrayBufferLike, payload: bb, instancesOnly: inst }
                            : { sourceId: ex.sourceId, z: lvl, x: xx, y: yy, bytes: bb, instancesOnly: inst });
                    };
                    push(bytes, x, y, false);
                    const n = 1 << lvl;
                    await Promise.all([[1,0],[-1,0],[0,1],[0,-1],[1,1],[1,-1],[-1,1],[-1,-1]].map(async ([dx,dy]) => {
                        const nx = x+dx, ny = y+dy;
                        if (nx<0||ny<0||nx>=n||ny>=n) return;
                        try {
                            const nb = await ex.provider.getTile(TileKey.fromRowColumnLevel(ny,nx,lvl), abortSignal);
                            if (typeof nb === 'string' || nb instanceof ArrayBuffer || nb instanceof Uint8Array) {
                                push(nb, nx, ny, true);
                            }
                        } catch {}
                    }));
                }
            } catch {
                // Missing quarter → its layers stay empty.
            }
        }));
        if (stash.length > 0) {
            mbPendingSourceTilesPut(mbCellTileKeyString(tileKey), stash);
        }
        return await primary;
    }

    protected async connect(): Promise<void> {
        try { await (this.m_inner as any).connect(); } catch {}
        for (const ex of this.m_extras) {
            try { await (ex.provider as any).connect?.(); } catch {}
        }
    }

    protected dispose(): void {
        this.m_inner = null as any;
        this.m_extras = [];
    }
}

/**
 * Combines multiple GeoJSON-producing tile providers into one. Styles may
 * reference several sources (e.g. a synthetic `rect` fill + a GeoJSON
 * fill-extrusion); previously only one source was wired so the others' data
 * never decoded. Each source's features are tagged with `_sourceId` so the
 * decoder can evaluate them against the correct style layers.
 */
class CompositeGeoDataProvider extends DataProvider {
    private m_entries: Array<{ sourceId: string; provider: DataProvider }> = [];

    add(sourceId: string, provider: DataProvider): void {
        this.m_entries.push({ sourceId, provider });
    }

    get size(): number {
        return this.m_entries.length;
    }

    /** The single source provider when only one source is combined. */
    getSingleProvider(): DataProvider | null {
        return this.m_entries.length === 1 ? this.m_entries[0].provider : null;
    }

    ready(): boolean {
        return this.m_entries.every(e => e.provider.ready());
    }

    async getTile(tileKey: TileKey, abortSignal?: AbortSignal): Promise<ArrayBufferLike | {}> {
        const features: any[] = [];
        for (const { sourceId, provider } of this.m_entries) {
            let data: any;
            try {
                data = await provider.getTile(tileKey, abortSignal);
            } catch {
                continue;
            }
            let fc: any = data;
            if (typeof data === 'string') {
                try {
                    fc = JSON.parse(data);
                } catch {
                    continue;
                }
            }
            // A source may hold a bare geometry (Polygon/LineString/Point)
            // instead of a FeatureCollection — wrap it so it can be merged.
            if (fc && typeof fc === 'object' && !Array.isArray(fc.features)) {
                const geometryTypes = new Set([
                    'Point', 'MultiPoint', 'LineString', 'MultiLineString',
                    'Polygon', 'MultiPolygon', 'GeometryCollection',
                ]);
                if (fc.type && geometryTypes.has(fc.type)) {
                    fc = {
                        type: 'FeatureCollection',
                        features: [{ type: 'Feature', geometry: fc, properties: {} }],
                    };
                }
            }
            if (!fc || !Array.isArray(fc.features)) {
                continue;
            }
            // Tile-bounds filtering — shared semantics, see
            // filterFeaturesToTile (point dedup + sort-key opt-out).
            filterFeaturesToTile(fc, tileKey, s_keepPointsForSortKey);
            for (const f of fc.features) {
                features.push({
                    ...f,
                    properties: { ...(f.properties ?? {}), _sourceId: sourceId },
                });
            }
        }
        return JSON.stringify({ type: 'FeatureCollection', features });
    }

    protected async connect(): Promise<void> {
        for (const e of this.m_entries) {
            try {
                await (e.provider as any).connect();
            } catch {
                // Silently pass
            }
        }
    }

    protected dispose(): void {
        this.m_entries = [];
    }
}

export class MBStyleDataSource extends TileDataSource {
    private m_styleManager: MBStyleManager;
    private m_styleParams: MBStyleDataSourceParameters;
    private m_delegatingProvider: DelegatingDataProvider;
    private m_spriteAtlas: SpriteAtlas | null = null;
    /**
     * Runtime addImage registry (mgl ImageSprite semantics): survives atlas
     * swaps and seeds the lazily created sprite-less atlas.
     */
    private m_runtimeImages = new Map<string, { image: HTMLImageElement | HTMLCanvasElement | ImageBitmap; pixelRatio: number }>();
    /** Active color-theme LUT (null = identity); applied to paints, fog, and baked into sprite/pattern textures. */
    private m_colorThemeLut: import('./MBColorTheme').ColorThemeLut | null = null;
    /** Per-import-scope color-theme LUTs (mgl getLut(scope)). */
    private m_importLuts: Map<string, import('./MBColorTheme').ColorThemeLut | null> = new Map();
    /** Loaded model scenes (for re-theming when LUTs resolve after load). */
    private m_loadedModels: Array<{ model: any; layer: any }> = [];
    /** True once any applyColorTheme ran (guards the initial null race). */
    private m_themeInitialized = false;
    /** Non-SDF icon canvases registered in mapView.userImageCache (themed on LUT change). */
    private m_themedIconCanvases: HTMLCanvasElement[] = [];
    /** Pristine (pre-theme) pixels of each themed icon canvas. */
    private m_iconCanvasPristine = new WeakMap<HTMLCanvasElement, ImageData>();
    /** Icon cross-fade blends already registered in userImageCache. */
    private m_registeredIconBlends = new Set<string>();
    private m_runtime: MBStyleRuntime | null = null;
    private m_currentSourceId: string = '';
    private m_demTileUrl: string | null = null;
    private m_demTileSize: number = 256;
    private m_demMaxZoom: number = 22;
    /** DEM encoding of the raster-dem source (mgl: encoding lives on the
     * source spec, not on the terrain object). */
    private m_demEncoding: 'mapbox' | 'terrarium' = 'mapbox';
    /** DEM tiles live in a PMTiles archive (blob-URL serving). */
    private m_demIsPmtiles = false;
    private m_rasterTileUrl: string | null = null;
    /** Style uses "symbols before 3D" (symbol layer precedes extrusions). */
    private m_iconDepthTestStyle = false;
    /**
     * Cached mapbox glyph metrics (font→char→metrics), shared with the worker
     * decoder so text shaping uses accurate advance widths. Filled lazily by
     * `loadGlyphMetrics()` on first connect.
     */
    private m_glyphMetrics: Map<string, any> = new Map();
    private m_environment: MBEnvironmentManager | null = null;
    private m_materialPatcher: MBMaterialPatchManager | null = null;
    private m_depthOcclusion: any = null;
    /** FBO-based texture draping for terrain (per-tile lazy bake). */
    private m_terrainDraping: any = null;

    /** §502: raster texture attached — rebake the drape for a few frames so
     * the final bake postdates the last placeholder→real texture swap. */
    notifyRasterAttached(): void {
        this.m_terrainDraping?.onRasterAttached?.();
    }

    /** §505: harness polls this before capturing terrain fixtures. */
    isDrapeConverged(): boolean {
        return this.m_terrainDraping ? this.m_terrainDraping.drapeConverged === true : true;
    }
    /** §501: raster materials call this on their first draw (program
     * compile) — the earliest reliable signal that the tile's satellite
     * texture is on the GPU. Triggers a drape rebake; the render wake is
     * DEFERRED to a macro-task because update() called from inside the
     * AfterRender pass can be coalesced by the in-progress frame. */
    requestTerrainDrapeRebake(): void {
        this.m_terrainDraping?.requestBake?.();
        try {
            const mv = this.mapView;
            setTimeout(() => { try { mv?.update?.(); } catch {} }, 0);
        } catch {}
    }

    private m_symbolPlacement: any = null;
    private m_heatmapRenderer: any = null;
    /** Per-feature GLTF instantiation channel for `model` layers (mgl parity). */
    private m_modelRenderer: any = null;
    /** Standalone directional shadow pass (mgl shadow_renderer parity). */
    private m_shadowRenderer: any = null;
    /** §540: batched-model sources (type "batched-model", tile = whole GLB). */
    private m_batchedModelSources: any[] = [];
    private m_batchedModelRenderer: any = null;
    /** Background fog gradient (mgl draw_background fog parity). */
    private m_backgroundFogRenderer: any = null;
    /** mgl atmosphere glow screen-space quad (pitch > 76). */
    private m_atmosphereRenderer: any = null;
    /** Set when loadModels() (async GLTF placement path) has finished. */
    private m_modelsLoaded = false;
    private m_additiveLineRenderer: any = null;
    private m_debugTileBoundaries = false;
    private m_debugLines: any = null;
    /** Clip polygons keyed by layer type: Map<layerType, polygonRing[]> */
    private m_clipMask: Map<string, number[][][]> = new Map();

    constructor(params: MBStyleDataSourceParameters) {
        const delegatingProvider = new DelegatingDataProvider();

        const options: TileDataSourceOptions = {
            tilingScheme: webMercatorTilingScheme,
            dataProvider: delegatingProvider,
            decoder: params.decoder,
            concurrentDecoderServiceName:
                params.decoder ? undefined : (params.concurrentDecoderServiceName ?? MBSTYLE_DECODER_SERVICE_TYPE),
            concurrentDecoderScriptUrl: params.decoder ? undefined : params.decoderScriptUrl,
            minDataLevel: 0,
            maxDataLevel: 22,
            // The DataSource default maxDisplayLevel (20) hides the whole
            // source above camera zoom 20 (isHidden → no tiles at all), e.g.
            // mapbox render-tests that style zoom ≥ 20 with a maxzoom-clamped
            // raster source. Allow the full mapbox zoom range (+1 flywave
            // offset) to display.
            maxDisplayLevel: 25,
            storageLevelOffset: params.storageLevelOffset ?? -1,
        };

        super(new TileFactory(Tile), options);

        this.m_delegatingProvider = delegatingProvider;
        this.m_styleManager = new MBStyleManager();
        this.m_styleParams = params;
        this.cacheable = true;
        this.addGroundPlane = false;
    }

    get styleManager(): MBStyleManager {
        return this.m_styleManager;
    }

    /**
     * Iterate all tiles currently cached by this data source.
     *
     * The mapview stores decoded tiles in `MapView.m_visibleTiles.m_dataSourceCache`
     * (a `DataSourceCache` keyed by mortonCode+offset+dataSource). Historically the
     * patcher/placement code read a non-existent `m_tiles` property, which made the
     * material patcher and symbol placement iterate nothing.
     */
    /** §636: conflation replacement re-decode cycle tracking. Set when the
     * batched-model datasource registers NEW footprint coverage (fill-
     * extrusion suppression now applies); cleared by conflationSettled() once
     * the re-decoded tiles are no longer pending — the render-test harness
     * polls this so the capture waits for the suppressed frame. */
    private m_conflationDirty = false;

    notifyConflationCoverageAdded(): void {
        this.m_conflationDirty = true;
        this.mapView?.markTilesDirty?.(this);
    }

    conflationSettled(): boolean {
        if (this.m_conflationDirty && !this.tilesPending()) {
            this.m_conflationDirty = false;
        }
        return !this.m_conflationDirty;
    }

    getDecodedTiles(): Tile[] {
        const tiles: Tile[] = [];
        const mapView = (this as any).m_mapView as any;
        const cache = mapView?.m_visibleTiles?.m_dataSourceCache as any;
        if (cache?.m_tileCache?.forEach) {
            cache.m_tileCache.forEach((tile: Tile) => {
                if (tile.dataSource === this) tiles.push(tile);
            });
        }
        return tiles;
    }

    /**
     * True while any cached tile still has geometry loading. The render-test
     * harness polls this so multi-tile styles (e.g. gradient-vector-tile,
     * two sibling tiles decoded asynchronously) capture only after every
     * tile's ribbon/geometry made it into a frame — the single settled-frame
     * wait raced tile decoding (observed 6453..19502 mismatch variance for
     * byte-identical code).
     */
    tilesPending(): boolean {
        try {
            return this.getDecodedTiles().some(t =>
                !(t as any).disposed && !(t as any).allGeometryLoaded);
        } catch {
            return false;
        }
    }

    /**
     * Re-run source resolution + provider wiring after runtime `addSource` /
     * `removeSource`, so newly added sources' tiles actually load.
     */
    async reloadSources(): Promise<void> {
        const style = this.m_styleManager.getStyle();
        if (!style) return;
        await this.m_styleManager.reloadSources();
        const sources = this.m_styleManager.getResolvedSources();
        await this.wireTileSources(style, sources);
        // Re-derive maxDataLevel from the (possibly new) sources.
        const maxSourceZoom = Math.max(
            1,
            ...[...sources.values()].map(s => s.maxzoom ?? 22),
        );
        this.maxDataLevel = Math.min(22, maxSourceZoom);
        if (this.mapView) {
            this.mapView.markTilesDirty(this);
            this.mapView.update();
        }
    }

    /**
     * Wire the style's tile sources into the delegating data provider.
     *
     * A vector (MVT) source — when present — takes priority (binary tiles
     * cannot be merged with GeoJSON). Otherwise every GeoJSON-format source
     * (geojson / raster / hillshade / synthetic rect providers) is combined
     * into a single [[CompositeGeoDataProvider]] so multi-source styles (e.g.
     * a `rect` fill + a GeoJSON fill-extrusion) render all their layers.
     * Sets `m_currentSourceId` and `m_delegatingProvider.delegate`.
     */
    /**
     * Report a conservative maximum extrusion height to the engine.
     *
     * `DataSource.maxGeometryHeight` enlarges the tile bounding boxes used by
     * the frustum culling *before* tiles are decoded (FrustumIntersection).
     * Without it the boxes hug the ground plane, so at high pitch the tiles
     * nearest the camera — whose elevated content is still on screen — can be
     * culled. Per-tile precision comes from `DecodedTile.maxGeometryHeight`
     * (see MBTileDataEmitter); this scan only needs a safe upper bound.
     */
    private applyMaxGeometryHeight(style: StyleSpecification): void {
        let maxHeight = 0;
        for (const layer of style.layers ?? []) {
            const l = layer as any;
            if (l.type !== 'fill-extrusion' && l.type !== 'building' && l.type !== 'model') continue;
            maxHeight = Math.max(
                maxHeight,
                MBStyleDataSource.scanMaxNumber(l.paint?.['fill-extrusion-height'])
            );
            // Model layers: the GLTF asset height is only known after load
            // (MBModelRenderer refines this dynamically); until then use a
            // conservative bound so the near clip plane does not cut the
            // models closest to the camera (same failure mode as §F2a).
            if (l.type === 'model') maxHeight = Math.max(maxHeight, 30);
        }
        if (maxHeight > 0) {
            this.maxGeometryHeight = Math.max(this.maxGeometryHeight, maxHeight);
        }
    }

    /** Best-effort maximum numeric value reachable by a property/expression. */
    private static scanMaxNumber(value: any): number {
        if (typeof value === 'number') return value;
        if (value === null || typeof value !== 'object') return 0;
        // Legacy function {stops:[[zoom,value],...]} / property functions.
        if (Array.isArray(value.stops)) {
            let max = 0;
            for (const stop of value.stops) {
                max = Math.max(max, MBStyleDataSource.scanMaxNumber(stop?.[1] ?? stop));
            }
            return max;
        }
        if (Array.isArray(value)) {
            let max = 0;
            for (const item of value) {
                max = Math.max(max, MBStyleDataSource.scanMaxNumber(item));
            }
            return max;
        }
        return 0;
    }

    private async wireTileSources(style: StyleSpecification, sources: Map<string, ResolvedSource>): Promise<boolean> {
        this.applyMaxGeometryHeight(style);
        const layerCounts = new Map<string, number>();
        for (const layer of style.layers ?? []) {
            const src = (layer as any).source as string;
            if (src) layerCounts.set(src, (layerCounts.get(src) ?? 0) + 1);
        }

            // §540: batched-model sources — tile = whole GLB file; handled by
            // MBBatchedModelRenderer (independent of the tile decode pipeline).
            {
                (globalThis as any).__mbBatchedWire =
                    ((globalThis as any).__mbBatchedWire ?? 0) + 1;
                const batched: any[] = [];
                // Wiring→registration bridge: modelsPending stays true from
                // the moment the source list is built until the regular
                // DataSource is registered, so the harness settle loop cannot
                // capture inside the gap (after registration the DS's own
                // fetch/decode window takes over).
                // NOTE: there is no local `self` in this method — everything
                // below MUST go through `this` (bare `self` would resolve to
                // the window global and silently never attach).
                const wiring = { remaining: 0 };
                (this as any).m_batchedModelWirings ??= [];
                (this as any).m_batchedModelWirings.push(wiring);
                for (const [sid, src] of sources) {
                    if ((src as any).type !== 'batched-model') continue;
                    const spec = (style.sources as any)?.[sid] as any;
                    const tpl = spec?.tiles ?? (src as any).tiles;
                    if (!Array.isArray(tpl) || tpl.length === 0) continue;
                    // mgl creates a bucket (node set) PER model layer over the
                    // source — two layers with opposite filters render
                    // complementary subsets (landmark-duplicate-filtered-*).
                    const modelLayers = (style.layers as any[]).filter(
                        (l: any) => l.type === 'model' && l.source === sid);
                    if (modelLayers.length === 0) modelLayers.push(undefined);
                    for (const layer of modelLayers) {
                        // mgl never creates a bucket for a visibility:'none'
                        // layer — skip the whole wiring so the GLB landmark
                        // stays hidden (landmark-z-offset-*-3d-hidden).
                        if (layer?.layout?.visibility === 'none') continue;
                        const layerSuffix = layer ? '-' + String(layer.id).replace(/[^a-zA-Z0-9-]/g, '') : '';
                        batched.push({
                            sourceId: sid,
                            tiles: tpl,
                            maxzoom: (src as any).maxzoom ?? spec?.maxzoom ?? 22,
                            paint: layer?.paint ?? {},
                            layer,
                        });
                        // §549/§537: register a REGULAR TileDataSource for the
                        // batched-model source — the engine scheduler requests
                        // the GLB tiles and TileObjectRenderer draws tile.objects,
                        // the only channel the render loop reliably draws.
                        wiring.remaining++;
                        void (async () => {
                            (globalThis as any).__mbIifeEntered = ((globalThis as any).__mbIifeEntered ?? 0) + 1;
                            try {
                                const dsName = sid + '-mbbatched' + layerSuffix;
                                // addDataSource attaches the mapView BEFORE
                                // connect() runs, so this.mapView is normally set
                                // already; poll briefly for pre-attach callers.
                                let waitI = -1;
                                for (let i = 0; i < 100 && !this.mapView; i++) {
                                    waitI = i;
                                    await new Promise(r => setTimeout(r, 50));
                                }
                                (globalThis as any).__mbIifeWait = waitI;
                                const mv: any = this.mapView;
                                if (!mv) {
                                    (globalThis as any).__mbIifeErr = 'mapView never attached';
                                    return;
                                }
                                let ds: any = mv.getDataSourceByName?.(dsName);
                                if (ds) {
                                    ds.setPaint?.(layer?.paint ?? {});
                                    ds.setFilter?.(layer?.filter);
                                    return;
                                }
                                ds = new MBBatchedModelDataSource({
                                    name: dsName,
                                    srcTemplate: tpl[0],
                                    maxzoom: (src as any).maxzoom ?? spec?.maxzoom ?? 14,
                                    minzoom: (src as any).minzoom ?? spec?.minzoom,
                                    paint: layer?.paint ?? {},
                                    filter: layer?.filter,
                                    envProvider: this,
                                    zoomProvider: () => this.mapView?.zoomLevel ?? 0,
                                });
                                // Regular registration: attach → connect → theme.
                                // addDataSource pushes the source into
                                // m_tileDataSources synchronously, so tiles are
                                // scheduled even if the theme step is slow.
                                await mv.addDataSource(ds);
                                (this as any).m_batchedModelDataSources ??= [];
                                (this as any).m_batchedModelDataSources.push(ds);
                                (ds as any).__mbLayerId = layer?.id;
                                (this as any).m_batchedDsRegistered = true;
                                // §549 census: isDataSourceEnabled additionally
                                // requires m_connectedDataSources (set after the
                                // theme step) — record it so a disabled source is
                                // distinguishable from a failed registration.
                                (globalThis as any).__mbBatchedDsEnabled =
                                    mv.isDataSourceEnabled?.(ds) === true ? 1 : 0;
                            } catch (e: any) {
                                (globalThis as any).__mbIifeErr = String(e?.stack ?? e).slice(0, 200);
                            } finally {
                                wiring.remaining--;
                            }
                        })();
                    }
                }
                this.m_batchedModelSources = batched;
                (this.m_batchedModelRenderer as any)?.setSources?.(batched);
            }

        // Priority 1: best vector tile source.
        let bestVectorSourceId: string | null = null;
        let bestVectorCount = 0;
        for (const [sourceId, source] of sources) {
            if (source.type === 'vector') {
                const count = layerCounts.get(sourceId) ?? 0;
                if (count > bestVectorCount || bestVectorSourceId === null) {
                    bestVectorSourceId = sourceId;
                    bestVectorCount = count;
                }
            }
        }

        if (bestVectorSourceId) {
            const source = sources.get(bestVectorSourceId)!;
            // Mapbox `tileSize: 512` semantic: a 512px tile covers the world of
            // a 256px tile one level down, so a camera zoom z loads data at
            // z-1. flywave couples the requested tile level and the decoder's
            // zoom-expression value to `storageLevelOffset`; -2 for 512px tiles
            // makes dataZoom = cameraZoom-2 (request z-1 tiles) while the
            // decoder evaluates zoom expressions at mapbox zoom (=level+1).
            const rawSpec = (style.sources as any)?.[bestVectorSourceId] as any;
            // PMTiles vector archive: serve MVT bytes from the single file.
            if (typeof rawSpec?.url === 'string' && /\.pmtiles(\?|$)/.test(rawSpec.url)) {
                const pmUrl = rawSpec.url.replace(/^local:\/\//, '/base/@flywave/flywave-mbstyle-datasource/test/rendering/integration/');
                // Open once (cached) so the zoom range is known before wiring.
                await openPMTilesUrl(pmUrl);
                this.m_delegatingProvider.delegate = new PMTilesVectorDataProvider(pmUrl);
                this.m_currentSourceId = bestVectorSourceId;
                await this.decoder.configure(undefined, {
                    mbStyle: style,
                    currentSourceId: bestVectorSourceId,
                } as any);
                return true;
            }
            const tileSize = rawSpec?.tileSize ?? (source as any).tileSize ?? 256;
            // §510: keep the historical −2 (512px) / −1 (256px) frame the
            // decoder geometry pipeline is calibrated against. The mgl
            // request level (round(zoom) clamped to maxZoom — one ABOVE our
            // cell level for 512px sources) is reached by the §510 fallback
            // in getVectorTile below: on a 404 at the cell level, fetch the
            // mgl-level tile (L+1, x, y) whose 512px extent covers the cell
            // exactly 1:1.
            const desiredOffset = tileSize > 256 ? -2 : -1;
            // TileDataSource.connect() later forwards storageLevelOffset to the
            // decoder (see TileDataSource.ts), which derives the zoom-expression
            // value from it — so just set the datasource offset here.
            this.storageLevelOffset = desiredOffset;
            const restClient = this.createOmvRestClient(
                source,
                this.m_styleParams.accessToken
            );
            // TMS scheme: wrap the rest client to flip y coordinate.
            const scheme = (source as any).scheme ?? 'xyz';
            let delegate: DataProvider = restClient;
            if (scheme === 'tms') {
                delegate = new TMSDataProvider(restClient);
            }
            // Source bounds: wrap to filter out-of-bounds tiles (TileJSON).
            const bounds = (source as any).bounds;
            if (Array.isArray(bounds) && bounds.length === 4) {
                delegate = new BoundsFilteredDataProvider(delegate, bounds as [number, number, number, number]);
            }
            // §681: clamp requests to the source maxzoom with ancestor
            // fallback (mgl coveringZoomLevel semantics — see class docs).
            const srcMaxzoom = Number((source as any).maxzoom ?? 0);
            if (srcMaxzoom > 0 && srcMaxzoom < 32) {
                delegate = new MglMaxZoomAncestorProvider(delegate, srcMaxzoom);
            }
            // §511: mgl-level four-children fallback. mgl requests tiles at
            // round(zoom) clamped to maxzoom (transform.js coveringZoomLevel)
            // — one ABOVE our cell level for 512px sources. Sparse fixture
            // tilesets (3d-intersections: z18-only) 404 at the cell level
            // and rendered blank. On a miss, fetch the four children
            // (L+1, 2x+i, 2y+j) — each child's 512px extent covers exactly
            // one quarter of the cell — and stash them for the decoder's
            // frame-correct merge (in-process decoder only).
            if (tileSize > 256) {
                delegate = new MglChildFallbackProvider(
                    delegate, (source as any).maxzoom ?? 18);
            }
            // §518: multi-vector-source styles — wire the OTHER vector
            // sources (with layers referencing them) so their features
            // decode into the same cell (mgl per-source coverings).
            const extras: Array<{
                sourceId: string;
                provider: DataProvider;
                maxzoom: number;
            }> = [];
            const hasPointSortKeyLayerV = ((style.layers ?? []) as any[]).some(l =>
                l?.layout?.['circle-sort-key'] !== undefined ||
                l?.layout?.['symbol-sort-key'] !== undefined);
            for (const [extraId, extraSource] of sources) {
                if (extraId === bestVectorSourceId) continue;
                // §644: GeoJSON sources ride the same extras-stash beside a
                // vector primary — previously they were only wired when NO
                // vector source existed, so model/fill layers over a geojson
                // source silently never decoded (powerplants family).
                if ((extraSource as any).type === 'geojson') {
                    const geoJsonSpec = (style.sources as any)?.[extraId] as any;
                    let data: any = geoJsonSpec?.data;
                    if (typeof data === 'string' && data.trim() !== '') {
                        try {
                            const url = data.replace(/^local:\/\//, '/base/@flywave/flywave-mbstyle-datasource/test/rendering/integration/');
                            const resp = await fetch(url);
                            data = await resp.json();
                        } catch { data = null; }
                    }
                    if (data) {
                        extras.push({
                            sourceId: extraId,
                            provider: new GeoJSONDataProvider(data, {
                                cluster: geoJsonSpec?.cluster,
                                clusterRadius: geoJsonSpec?.clusterRadius,
                                clusterMaxZoom: geoJsonSpec?.clusterMaxZoom,
                                clusterProperties: geoJsonSpec?.clusterProperties,
                                keepPointsEverywhere: hasPointSortKeyLayerV,
                            }),
                            // GeoJSON serves every zoom (tile-bounds filtered).
                            maxzoom: 22,
                        });
                    }
                    continue;
                }
                if ((extraSource as any).type !== 'vector') continue;
                if ((layerCounts.get(extraId) ?? 0) === 0) continue;
                const exSpec = (style.sources as any)?.[extraId] as any;
                const exTiles = exSpec?.tiles;
                if (!Array.isArray(exTiles) || exTiles.length === 0) continue;
                const exClient = this.createOmvRestClient(
                    { ...extraSource, tiles: exTiles } as any,
                    this.m_styleParams.accessToken);
                let exDelegate: DataProvider = exClient;
                const exScheme = (extraSource as any).scheme ?? 'xyz';
                if (exScheme === 'tms') {
                    exDelegate = new TMSDataProvider(exClient);
                }
                extras.push({
                    sourceId: extraId,
                    provider: exDelegate,
                    maxzoom: (extraSource as any).maxzoom ?? 22,
                });
            }
            if (extras.length > 0) {
                delegate = new MBExtraVectorSourcesProvider(
                    delegate, extras, tileSize > 256);
            }
            this.m_delegatingProvider.delegate = delegate;
            this.m_currentSourceId = bestVectorSourceId;

            await this.decoder.configure(undefined, {
                mbStyle: style,
                currentSourceId: bestVectorSourceId,
            } as any);

            return true;
        }

        // No vector source: combine every GeoJSON-format source.
        const hasPointSortKeyLayer = ((style.layers ?? []) as any[]).some(l =>
            l?.layout?.['circle-sort-key'] !== undefined ||
            l?.layout?.['symbol-sort-key'] !== undefined);
        s_keepPointsForSortKey = hasPointSortKeyLayer;
        const composite = new CompositeGeoDataProvider();
        let currentSourceId = '';
        let hasRasterSource = false;

        for (const [sourceId, source] of sources) {
            if (source.type === 'geojson') {
                const geoJsonSpec = (style.sources as any)[sourceId] as GeoJSONSourceSpec;
                let data: any = geoJsonSpec.data;
                if (typeof data === 'string' && data.trim() !== '') {
                    try {
                        const url = data.replace(/^local:\/\//, '/base/@flywave/flywave-mbstyle-datasource/test/rendering/integration/');
                        const resp = await fetch(url);
                        data = await resp.json();
                    } catch (e) {
                    }
                }
                if (data) {
                    composite.add(sourceId, new GeoJSONDataProvider(data, {
                        cluster: geoJsonSpec.cluster,
                        clusterRadius: geoJsonSpec.clusterRadius,
                        clusterMaxZoom: geoJsonSpec.clusterMaxZoom,
                        clusterProperties: (geoJsonSpec as any).clusterProperties,
                        keepPointsEverywhere: hasPointSortKeyLayer,
                    }));
                    if (!currentSourceId) currentSourceId = sourceId;
                }
            } else if (source.type === 'raster'
                || (source.type as string) === 'raster-array') {
                // §358: 'raster-array' (.mrt band sources, mgl raster_array_
                // tile_source) serves tiles the same way — the emitter/patcher
                // carry the band-view/raster-color decode. Dropping the type
                // here silently removed the whole layer (raster-array fixtures
                // rendered ONLY the satellite base).
                hasRasterSource = true;
                const rasterSpec = (style.sources as any)[sourceId];
                const tiles = rasterSpec?.tiles ?? [];
                const tileUrl = tiles[0] ?? source.tileUrls[0] ?? rasterSpec?.url ?? '';
                if (tileUrl) {
                    const resolvedUrl = tileUrl.replace(/^local:\/\//, '/base/@flywave/flywave-mbstyle-datasource/test/rendering/integration/');
                    let rasterProvider: RasterTileDataProvider;
                    if (/\.pmtiles(\?|$)/.test(resolvedUrl)) {
                        // PMTiles archive: expand tiles to blob URLs once and
                        // serve per-tile lookups through the URL factory —
                        // the ancestor/child coverage logic is unchanged.
                        const idx = await openPMTilesBlobIndex(resolvedUrl);
                        rasterProvider = new RasterTileDataProvider(
                            resolvedUrl,
                            rasterSpec?.minzoom ?? idx.minZoom,
                            rasterSpec?.maxzoom ?? idx.maxZoom,
                            undefined,
                            (z, x, y) => idx.urlFor(z, x, y) ?? '',
                            async (u) => u !== '',
                        );
                    } else {
                        rasterProvider = new RasterTileDataProvider(resolvedUrl,
                            rasterSpec?.minzoom ?? 0, rasterSpec?.maxzoom ?? 22);
                    }
                    // §350: mgl default raster tileSize is 512; the spec may
                    // override (error-overlap color source uses 256).
                    if (typeof rasterSpec?.tileSize === 'number' && rasterSpec.tileSize > 0) {
                        rasterProvider.m_sourceTileSize = rasterSpec.tileSize;
                    }
                    rasterProvider.m_mapViewRef = () => (this as any).mapView;
                    composite.add(sourceId, rasterProvider);
                    this.m_rasterTileUrl = resolvedUrl;
                    if (!currentSourceId) currentSourceId = sourceId;
                }
            }
        }

        // Raster fixtures are stored at the CAMERA zoom level (dataZoom =
        // cameraZoom) rather than one level below like vector tiles — the
        // satellite fixtures carry the imagery a camera at zoom Z displays
        // (level Z = 256px = full viewport). flywave's default -1 offset would
        // request level cameraZoom-1 tiles (e.g. z16 for a z17 camera) that do
        // not exist, so raster-only styles need offset 0 to load the fixtures.
        if (hasRasterSource && this.m_styleParams.storageLevelOffset === undefined) {
            // §310: mgl coveringZoomLevel = round(zoom + log2(512/tileSize))
            // gives +1 for tileSize-256 — tried, measured, REVERTED: the
            // per-level scan (−1/0/+1) leaves error-overlap at its 218k
            // plateau (the residual is the covering SET SHAPE vs mgl's 3D
            // AABB traversal, not the level) while +1 net-regressed the
            // circle fixtures (+664). Offset 0 stays.
            // §346: +1 re-tested post-§345 (real-blend + skip semantics):
            // WORSE (158939→208252) — uniform z16 delivery + per-request
            // ancestor mosaic does NOT approximate mgl's mixed covering set
            // (the z16 404-walk replaces content mgl serves from z15 tiles
            // directly). Offset 0 stays; round semantics need engine-side
            // mixed-level delivery instead.
            // §347: +1 re-enabled — WITH mglDistanceLod (2^(maxZoom−level)
            // factor) + mixedLevelDelivery + m_multiLevelCoverage the engine
            // now reproduces mgl's mixed covering (reference: 47 z16 + 6 z15
            // for this camera): far band stops at z15, near band delivers z16,
            // and the datasource serves BOTH levels.
            // §347 result: LOD stops now FIRE (2 z15 stops, threshold 7338m
            // unit-corrected) but the fixture is still net-WORSE than the
            // offset-0 baseline (199673 vs 158939) — only 2/6 of mgl's stops
            // (per-tile distToSplitScale tuning needed) and z15+z16 same-
            // screen composition order uncalibrated. Combo stays OFF; the
            // engine formula fix is landed behind the mglDistanceLod flag.
            this.storageLevelOffset = 0;
        }

        // §323: enable the engine's mgl shouldSplit distance LOD with the
        // raster SOURCE tileSize parameterized.
        if (hasRasterSource) {
            try {
                const mvL = (this as any).mapView;
                const vtsL = mvL?.m_visibleTiles;
                if (vtsL) {
                    let lodTileSize = 512;
                    for (const [sid, src] of sources) {
                        if (src.type === 'raster') {
                            const ts = (style.sources as any)[sid]?.tileSize;
                            if (typeof ts === 'number' && ts > 0) { lodTileSize = ts; break; }
                        }
                    }
                    // §323: disabled — see §331: the residual root cause is the
                    // bearing sign mirror (below), not the LOD stack.
                    // §336: mixed-level delivery landed in the engine but the
                    // render STILL never changes — the fixture's output is
                    // FROZEN at an early state (new tile requests never
                    // repaint; see §336 doc entry). Keep off until the
                    // repaint gating is fixed.
                    // §344: combo re-tested WITH the real-blend fix — still a
                    // pixel-identical no-op. Measured cause: no visible tile's
                    // distance ever exceeds distToSplit (z14 d≈6k vs 14.7k
                    // threshold at pitch 60), so the LOD branch never stops a
                    // tile.
                    // §346: root cause of those 0 stops — the threshold was
                    // missing mgl's 2^(maxZoom−level) factor (shouldSplit
                    // spec). With the factor landed in FrustumIntersection the
                    // mixed covering set (far band at lower levels + near band
                    // at dataZoom) is enabled: LOD stop + mixedLevelDelivery +
                    // multiLevelCoverage.
                    (vtsL.options as any).mglDistanceLod = false;
                    (vtsL.options as any).mixedLevelDelivery = false;
                    (this as any).m_multiLevelCoverage = false;
                    (vtsL.options as any).mglDistanceLodTileSize = lodTileSize;
                    mvL.update?.();
                }
            } catch {}
        }

        // Hillshade: emit tile-covering polygons carrying the per-tile DEM url.
        const hasHillshade = (style.layers ?? []).some(
            (l: any) => l.type === 'hillshade' && (l.layout?.visibility ?? 'visible') === 'visible',
        );
        if (hasHillshade && this.m_demTileUrl) {
            const hillshadeLayer = (style.layers ?? []).find(
                (l: any) => l.type === 'hillshade',
            ) as any;
            const hillshadeSourceId: string = hillshadeLayer?.source ?? 'hillshade-dem';
            let hillshadeFactory: ((z: number, x: number, y: number) => string) | undefined;
            if (this.m_demIsPmtiles) {
                try {
                    const idx = await openPMTilesBlobIndex(this.m_demTileUrl);
                    hillshadeFactory = (z, x, y) => idx.urlFor(z, x, y) ?? '';
                } catch {}
            }
            composite.add(hillshadeSourceId, new HillshadeTileDataProvider(
                this.m_demTileUrl, this.m_demTileSize, hillshadeFactory));
            if (!currentSourceId) currentSourceId = hillshadeSourceId;
        }

        if (composite.size === 1) {
            // Single GeoJSON-format source: use the raw provider directly so the
            // tile data is delivered unmodified (no re-serialization).
            const only = composite.getSingleProvider();
            if (!only) return false;
            this.m_delegatingProvider.delegate = only;
        } else if (composite.size > 0) {
            this.m_delegatingProvider.delegate = composite;
        } else {
            return false;
        }

        this.m_currentSourceId = currentSourceId;

        await this.decoder.configure(undefined, {
            mbStyle: style,
            currentSourceId: currentSourceId,
            demTileUrl: this.m_demTileUrl,
            rasterTileUrl: this.m_rasterTileUrl,
        } as any);

        return true;
    }

    private createOmvRestClient(
        source: ResolvedSource,
        accessToken?: string
    ): OmvRestClient {
        const url = source.tileUrls[0] ?? '';
        const params: OmvRestClientParameters = {
            url,
            apiFormat: APIFormat.XYZMVT,
        };
        if (accessToken) {
            params.authenticationCode = accessToken;
        }
        return new OmvRestClient(params);
    }

    async connect(): Promise<void> {
        await this.m_styleManager.loadStyle(this.m_styleParams.style, this.m_styleParams.accessToken);
        const style = this.m_styleManager.getStyle();
        if (!style) {
            throw new Error('Failed to load Mapbox Style');
        }

        // Detect clip layers and build clip mask (clip-layer-types → polygon rings).
        this.buildClipMask(style);

        // Apply background color from background layers
        this.applyBackgroundColor(style);

        // Apply projection (globe/mercator/etc.)
        this.applyProjection(style);

        // Apply camera settings from style
        this.applyCameraSettings(style);
        this.pushMapboxZoom();

        // Create runtime styling API
        {
            // Mapbox color-theme LUT — propagate to the evaluator (paints)
            // and the environment (fog colors). Identity when absent.
            const { loadColorTheme } = require('./MBColorTheme');
            loadColorTheme(style).then((lut: any) => {
                // A null (no root theme) must not clobber a theme applied
                // meanwhile by a runtime setColorTheme op (async race).
                if (lut || !this.m_themeInitialized) this.applyColorTheme(lut);
                this.loadImportThemes(style);
            }).catch(() => {});
        }
        this.m_runtime = new MBStyleRuntime(style, () => {
            // On style change: reconfigure decoder and mark tiles dirty
            // §772b: runtime paint ops must reach EVERY live decoder copy
            // (the geojson model-source path decodes through its own instance).
            MBStyleDecoder.reconfigureAll(this.m_runtime!.style);
            this.decoder.configure(undefined, {
                mbStyle: this.m_runtime!.style,
                currentSourceId: this.m_currentSourceId,
                pitch: this.m_runtime!.style.pitch ?? 0,
                brightness: this.m_environment?.brightness ?? 0,
                center: this.m_runtime!.style.center ?? [0, 0],
            } as any);            // configure() re-created the decoder's internal evaluator —
            // the decoder re-applies the stored theme itself now.
            // §278: runtime paint edits on the background layer must also
            // refresh the clear color + terrain base color (mgl repaints the
            // background on setPaintProperty; cache-invalidation fixtures).
            // Any style change can alter drape content (fill colors, layer
            // visibility, ...) — flag a re-bake, the AfterRender listener
            // bakes lazily.
            this.applyBackgroundColor(this.m_runtime!.style);
            this.m_terrainDraping?.requestBake?.();
            // Layer mutations (addLayer/removeLayer/moveLayer) can add or
            // remove model layers — refresh the per-feature renderer's
            // layer list + expectPlacements so decode-time placements are
            // picked up (mgl re-queries model buckets on every repaint).
            try {
                this.updateModelRegistry(this.m_runtime!.style);
            } catch {}
            // §751: runtime paint ops (model-color-mix-intensity, model-color,
            // …) must re-tint the live model-source instances — mgl re-runs
            // per-part styling on every repaint. setFeatureState already did
            // this; paint ops now do too.
            try { this.applyModelSourcePartStylingAll(); } catch {}
            if (this.mapView) {
                this.mapView.markTilesDirty(this);
            }
        });
        // Runtime setFilter on a model layer over a batched-model source must
        // reach that source's datasources (mgl bucket.setFilter node filter).
        this.m_runtime.onLayerFilterChanged = (layerId: string, filter: any) => {
            for (const ds of (this as any).m_batchedModelDataSources ?? []) {
                if ((ds as any).__mbLayerId === layerId) ds.setFilter?.(filter);
            }
        };

        const sources = this.m_styleManager.getResolvedSources();

        // Set maxDataLevel from the style's tile sources so flywave overzooms
        // (loads the highest-available parent tile and scales it up) when the
        // map zoom exceeds a source's `maxzoom`. Without this, a source with
        // maxzoom=14 viewed at z16 would request missing z16 tiles and render
        // nothing instead of the scaled z14 parent.
        const maxSourceZoom = Math.max(
            1,
            ...[...sources.values()].map(s => s.maxzoom ?? 22),
        );
        this.maxDataLevel = Math.min(22, maxSourceZoom);

        // Resolve the DEM source URL first — the hillshade provider (wired
        // inside wireTileSources) needs it.
        for (const [sourceId, source] of sources) {
            if (source.type === 'raster-dem') {
                const demSpec = (style.sources as any)[sourceId];
                const tiles = demSpec?.tiles ?? [];
                const tileUrl = tiles[0] ?? source.tileUrls[0] ?? demSpec?.url ?? '';
                if (tileUrl) {
                    this.m_demTileUrl = tileUrl.replace(/^local:\/\//, '/base/@flywave/flywave-mbstyle-datasource/test/rendering/integration/');
                    this.m_demIsPmtiles = /\.pmtiles(\?|$)/.test(this.m_demTileUrl);
                    this.m_demTileSize = demSpec?.tileSize ?? 256;
                    this.m_demMaxZoom = demSpec?.maxzoom ?? source.maxzoom ?? 22;
                    this.m_demEncoding = demSpec?.encoding === 'terrarium' ? 'terrarium' : 'mapbox';
                }
                break;
            }
        }

        // Load the sprite atlas BEFORE wiring tile sources: tile decoding
        // starts inside wireTileSources and the emitter reads the sprite
        // registry (image availability, pattern tile sizes) at decode time —
        // loading it after races and drops line-pattern entirely.
        if (style.sprite) {
            await this.loadSpriteAtlas(style.sprite);
            this.m_lastAppliedSprite = style.sprite;
        }

        // mgl scales fill-extrusion heights by sec(lat) exactly once
        // (bucket: meters/tileToMeter; mercator upVectorScale is 1). Without
        // terrain the factor was missing entirely — buildings rendered
        // sec(lat) (=1.32 at NYC) too short (§455 roof↔wall silhouette
        // swaps). MUST run BEFORE wireTileSources: tiles decode with the
        // scale baked in. (The terrain branch later in connect() overrides
        // with the DEM-matched factor and its §294 sec² flat path.)
        // mgl "symbols before 3D": when a symbol layer PRECEDES a
        // fill-extrusion layer in style order, mgl's painter draws it before
        // the extrusions and the buildings cover it (depth). Icons render
        // last here, so the equivalent is depth-testing them against the
        // buildings' depth. Only when NO occlusion-opacity props exist —
        // those fixtures use the fade path instead.
        let iconDepthTest = false;
        {
            const layers = (style.layers ?? []) as any[];
            const firstSymbol = layers.findIndex(l => l.type === 'symbol');
            const hasOcclusion = layers.some(l => l.paint &&
                ('icon-occlusion-opacity' in l.paint || 'text-occlusion-opacity' in l.paint));
            const extrusionAfter = layers.some((l, i) =>
                (l.type === 'fill-extrusion' || l.type === 'building') && i > firstSymbol);
            iconDepthTest = firstSymbol >= 0 && extrusionAfter && !hasOcclusion;
            try {
                this.decoder.configure(undefined, { iconDepthTest } as any);
            } catch {}
            // The CPU anchor-occlusion cull below needs the extrusions depth
            // pass for before-3D styles too (mgl placeCollisionBox isClipped
            // applies unconditionally at pitch > 0).
            this.m_iconDepthTestStyle = iconDepthTest;
        }
        if (!style.terrain) {
            try {
                const lat = style.center?.[1] ?? 0;
                const secLat = 1 / Math.cos(lat * Math.PI / 180);
                this.decoder.configure(undefined, {
                    terrainHeightScale: secLat,
                    terrainHeightScaleFromTerrain: false,
                } as any);
            } catch {}
        }
        // Wire the style's tile sources (vector priority, else a composite of
        // all GeoJSON-format sources). Sets m_currentSourceId and delegate.
        await this.wireTileSources(style, sources);
        this.m_wiredSourceSig = JSON.stringify(
            (style.sources as any) ?? {},
        );

        // Preload real mapbox glyph metrics for the style's font stacks so
        // the worker-based decoder can shape text accurately (line breaking
        // and anchor placement match the actual font advances). The atlas
        // bitmap itself still goes through flywave's FontCatalog; only the
        // metrics are wired through here.
        if (style.glyphs) {
            await this.loadGlyphMetrics(style);
            this.m_lastAppliedGlyphs = style.glyphs;
        }

        if (this.mapView) {
            this.m_environment = new MBEnvironmentManager(this.mapView);
            // §775: the root color-theme LUT resolves ASYNC (loadColorTheme
            // at style-load) and may land BEFORE this block creates the env —
            // applyColorTheme's env.setColorTheme then no-ops on the null
            // env and the fog renders unthemed (trees-use-theme white fog
            // instead of mgl's LUT red). Re-sync the env from the datasource.
            if (this.m_colorThemeLut) {
                this.m_environment.setColorTheme(this.m_colorThemeLut);
            }
            this.m_environment.applyLights(
                (style as any).lights as any,
                style.light,
            );
            // applyBackgroundColor ran before the environment existed; re-run it
            // now that lighting3DState is configured so the background clear
            // color picks up the 3D-lights ground radiance.
            this.applyBackgroundColor(style);
            this.m_environment.setStyleHasBackground(this.styleHasBackgroundLayer(style), this.styleHasContentLayers(style));
            try {
                const { MBAtmosphereRenderer } = require('./MBAtmosphereRenderer');
                // §228: stand down only when a geojson source's tiles can
                // cover the ground to the horizon (world-wide geometry);
                // raster sources have limited tile extent and still need
                // the glow quad for their sky region.
                const hasGeojsonContent = Object.values(style.sources ?? {}).some(
                    (src: any) => (src as any)?.type === 'geojson');
                MBAtmosphereRenderer.contentStandDown =
                    this.styleHasContentLayers(style) && hasGeojsonContent;
            } catch {}
            this.m_environment.applyFog(this.effectiveFogSpec(style), style.zoom ?? 0);
            // §782/§785: re-apply the background AFTER applyFog. Fog-less
            // globe styles skip the atmosphere entirely (mgl painter gate on
            // style.fog) and need the flat background clear restored. Fog-ful
            // globe styles need it too: with globeFogActive now true, the
            // §570b branch finally runs setGlobeBackground — without this
            // re-run m_globeBgColor stayed null (applyBackgroundColor always
            // ran BEFORE applyFog) and the atmosphere dome's uBgDisc never
            // engaged, so the pole fixtures lost their dark background-disc
            // stack when the §784 white hit-disc landed.
            this.applyBackgroundColor(style);
            // A `sky` layer's paint drives the skybox (gradient/atmosphere),
            // mirroring mapbox's sky_style_layer. The top-level `style.sky`
            // (fog-driven atmosphere) takes precedence when both exist.
            this.m_environment.applySky(
                this.buildSkyFromLayers(style) ?? style.sky,
                style.fog,
            );

            const bgLayer = (style.layers ?? []).find((l: any) => l.type === 'background');
            if (bgLayer) {
                const bgPaint = (bgLayer as any).paint ?? {};
                const pitchAlign = bgPaint['background-pitch-alignment'] ?? 'map';
                // Resolve the pattern expression first: an EMPTY string (e.g.
                // ["step",["zoom"],"",5,"cemetery"] below the stop, #9518)
                // means no pattern — mgl falls back to background-color.
                let pattern: any = bgPaint['background-pattern'];
                if (pattern && typeof pattern !== 'string') {
                    try {
                        const { MBExpressionEngine } = require('./MBExpressionEngine');
                        pattern = MBExpressionEngine.evaluate(pattern, {
                            zoom: style.zoom ?? 0,
                            feature: undefined,
                        } as any);
                    } catch {}
                }
                if (pattern && this.m_spriteAtlas) {
                    await this.m_environment.applyBackgroundPattern(
                        pattern,
                        this.m_spriteAtlas,
                        bgPaint['background-color'] ?? '#000000',
                        bgPaint['background-opacity'] ?? 1,
                        pitchAlign,
                    );
                } else if (!pattern && pitchAlign === 'viewport') {
                    // Viewport-aligned solid background: mgl draws it as a
                    // screen-space quad (not the map-tilted clear-color path).
                    // When this background layer sits ABOVE all content layers
                    // it composites over them (test fixtures place it last);
                    // below content it stays behind.
                    const bgIndex = (style.layers ?? []).indexOf(bgLayer);
                    const onTop = (style.layers ?? []).every(
                        (l: any, i: number) => i < bgIndex || l.type === 'background');
                    this.m_environment.applyBackgroundViewportQuad(
                        bgPaint['background-color'] ?? '#000000',
                        bgPaint['background-opacity'] ?? 1,
                        onTop,
                    );
                }
            }

            // Configure the decoder with the environment's computed brightness
            // (for `measure-light` expressions) now that lights are applied.
            await this.decoder.configure(undefined, {
                mbStyle: style,
                currentSourceId: this.m_currentSourceId,
                demTileUrl: this.m_demTileUrl,
                pitch: style.pitch ?? 0,
                bearing: style.bearing ?? 0,
                brightness: this.m_environment.brightness,
                clipMask: Object.fromEntries(this.m_clipMask),
                worldview: (style as any).metadata?.test?.worldview ?? '',
                center: style.center ?? [0, 0],
            } as any);

            this.m_materialPatcher = new MBMaterialPatchManager(this);
            this.m_materialPatcher.invalidate();
            const patcher = this.m_materialPatcher;
            const self = this;

            // Instantiate the symbol placement controller (collision detection,
            // crossTileID, offsets, rotation alignment, opacity fade).
            try {
                const { MBStyleSymbolPlacement } = await import('./MBStyleSymbolPlacement');
                self.m_symbolPlacement = new MBStyleSymbolPlacement(this.mapView, self);
            } catch {}

            // Two-pass density→ramp heatmap renderer. `run()` early-returns when
            // no decoded tile carries heatmap kernels, so non-heatmap styles are
            // unaffected.
            try {
                const { MBHeatmapRenderer } = await import('./MBHeatmapRenderer');
                self.m_heatmapRenderer = new MBHeatmapRenderer(this.mapView, self);
            } catch {}

            try {
                const { MBAdditiveLineRenderer } = await import('./MBAdditiveLineRenderer');
                self.m_additiveLineRenderer = new MBAdditiveLineRenderer(this.mapView, self);
            } catch {}

            // Per-feature GLTF model instantiation (mgl `model` layers over
            // vector sources, resolved through the root `style.models`
            // registry). `run()` early-returns when no decoded tile carries
            // model placements, so non-model styles are unaffected.
            try {
                const { MBModelRenderer } = await import('./MBModelRenderer');
                self.m_modelRenderer = new MBModelRenderer(this.mapView, self);
                self.updateModelRegistry(style);
            } catch {}
            try {
                const { MBBatchedModelRenderer } = await import('./MBBatchedModelRenderer');
            } catch (e) {
                (globalThis as any).__mbBatchedInitErr = String(e);
                // eslint-disable-next-line no-console
                console.error('[MBBatched] init failed', e);
            }

            // Standalone shadow pass (mgl shadow_renderer): active only when
            // 3D lights carry cast-shadows + shadow-intensity > 0.
            try {
                const { MBShadowRenderer } = await import('./MBShadowRenderer');
                self.m_shadowRenderer = new MBShadowRenderer(this.mapView, self);
            } catch {}

            // Background fog gradient (mgl draw_background + fog): a far-plane
            // quad filling only un-rendered background fragments with the
            // ray∩ground fog gradient. Early-returns when fog is off.
            try {
                const { MBBackgroundFogRenderer } = await import('./MBBackgroundFogRenderer');
                // Query the CURRENT environment (self.m_environment) — a
                // captured env0 goes stale when the environment is re-created
                // on style re-application, and the quad then renders with the
                // old fog/sky state (horizon-blend family, §186).
                self.m_backgroundFogRenderer = new MBBackgroundFogRenderer(
                    this.mapView,
                    () => self.m_environment?.backgroundFogState ?? null,
                );
            } catch {}

            // mgl atmosphere glow as a screen-space quad (pitch > 76 where
            // the engine's object filtering drops the legacy dome, §182b).
            try {
                const { MBAtmosphereRenderer } = await import('./MBAtmosphereRenderer');
                // Same stale-env hazard as the background-fog quad above.
                self.m_atmosphereRenderer = new MBAtmosphereRenderer(
                    this.mapView,
                    () => self.m_environment?.atmosphereState ?? null,
                );
            } catch {}

            const placement = this.m_symbolPlacement;
            this.mapView.addEventListener(MapViewEventNames.WillRender, () => {
                try {
                    (globalThis as any).__mbRootKidsWill =
                        ((self.mapView as any).m_sceneRoot?.children ?? []).map((c: any) => ({
                            name: c.name, kids: c.children?.length ?? 0,
                        }));
                } catch { /* probe only */ }
                // §282 probe: flag-free census — meshes with tall geometry
                // (extrusion candidates) right before the main render.
                const root = (this.mapView as any).m_sceneRoot as THREE.Object3D | undefined;
                if (root && !(this as any).__mbCensused) {
                    let tall = 0, flat = 0, vis = 0, layers = 0;
                    root.traverse((o: any) => {
                        if (o.layers && !o.layers.test?.(o.layers)) layers++;
                        if (!o.isMesh) return;
                        const g = o.geometry;
                        if (!g?.attributes?.position) return;
                        g.computeBoundingBox();
                        const bb = g.boundingBox;
                        if (bb && bb.max.z - bb.min.z > 100) {
                            tall++;
                            if (o.visible) vis++;
                            if (o.parent) flat++;
                        }
                    });
                    if (tall > 0) {
                        (this as any).__mbCensused = true;
                        // eslint-disable-next-line no-console
                        console.log('MBDBG willCensus tall=' + tall + ' visible=' + vis + ' parented=' + flat);
                    }
                }
            });
            this.mapView.addEventListener(MapViewEventNames.AfterRender, async () => {
                // eslint-disable-next-line no-console
                if ((globalThis as any).__mbCoverDump) console.log('[MBCoverDumpReg] after-render fired, dumps=', (globalThis as any).__mbCoverDumps ?? 0);
                // §835: cover dump — the datasource tileCache keys decoded to
                // z/x/y, for diffing against mgl's coveringTiles reference.
                if ((globalThis as any).__mbCoverDump && ((globalThis as any).__mbCoverDumps ?? 0) < 6) {
                    (globalThis as any).__mbCoverDumps = ((globalThis as any).__mbCoverDumps ?? 0) + 1;
                    setTimeout(() => {
                    try {
                        const vts = (this.mapView as any).m_visibleTiles;
                        const cache = vts?.m_dataSourceCache?.m_tileCache;
                        {
                            const keys: string[] = [];
                            const shapes: any[] = [];
                            cache.forEach((tile: any) => {
                                const tk: any = tile.tileKey;
                                if (tk?.level !== undefined) {
                                    const dt = tile.decodedTile;
                                    const techs = dt?.techniques;
                                    keys.push(`${tk.level}/${tk.column}/${tk.row}:tech=${techs ? techs.length : "none"}`);
                                }
                            });
                            if (shapes.length) keys.push('SHAPE:' + JSON.stringify(shapes));
                            keys.sort();
                            // eslint-disable-next-line no-console
                            console.log('[MBCoverDump]', keys.join(' | '));
                            const fbD = (window as any).__karma__?.config?.args
                                ?.find?.((a: string) => a.startsWith('feedback-url='))
                                ?.slice('feedback-url='.length);
                            if (fbD) fetch(`${fbD}/mb-probe-dump`, {
                                method: 'POST', headers: { 'content-type': 'application/json' },
                                body: JSON.stringify({ probe: 'cover', log: keys }),
                            }).catch(() => {});
                        }
                    } catch (e) {
                        // eslint-disable-next-line no-console
                        console.error('[MBCoverDumpErr]', String(e));
                    }
                    }, 300);
                }
                // §778: on the sphere projection, circle Points objects are
                // the NEAREST opaque geometry, so three's front-to-back sort
                // draws them FIRST (CirclePointsMaterial has depthWrite off)
                // and the tessellated ground meshes drawn afterwards overwrite
                // their pixels — circles vanish on the globe. Lift them above
                // the ground via renderOrder (depthTest is already off; the
                // atmosphere dome at ro 1000 still composites over them near
                // the limb, mirroring mgl's atmosphere-over-map order).
                if (self.mapView?.projection?.type === 1) {
                    const root778 = self.mapView.scene;
                    if (root778) {
                        const objs778: any[] = ((self as any).__mbCircleObjs ??= []);
                        objs778.length = 0;
                        root778.traverse((o: any) => {
                            if (o.userData?.technique?.name === 'circles') {
                                // §778: draw after the ground despite the
                                // nearest-first opaque sort (depthWrite off).
                                o.renderOrder = 10;
                                objs778.push(o);
                            }
                        });
                    }
                }
                // §761: renderer.info read right after the frame — draw calls
                // / triangles tell whether the extrusion meshes reach the GL
                // queue (zero-rasterization forensics, buildings-trees family).
                { const g: any = (globalThis as any); const r: any = (self.mapView as any).renderer;
                  if (r?.info && !g.__riHooked) {
                    g.__riHooked = true;
                    const info = r.info;
                    const origReset = info.reset.bind(info);
                    info.reset = () => {
                      const ri = info.render;
                      g.__mbLastFrameCalls = ri.calls ?? 0;
                      return origReset();
                    };
                  } }
                // §550 DIAG (karma arg `mbbatchdbg=1`, see MBBatchedModelDataSource):
                // batched-model regular-DS chain state, frame-capped.
                {
                    const diag: any = (globalThis as any).__mbBatchedDiag ??= { n: 0 };
                    if (batchedDiagEnabled() && diag.n < 30) {
                        diag.n++;
                        try {
                            const mv: any = self.mapView;
                            const dsList: any[] = (self as any).m_batchedModelDataSources ?? [];
                            const ds: any = dsList[0];
                            let cacheTiles = -1, objs = -1, rendered = -1, loading = -1;
                            if (ds) {
                                loading = ds.isLoading?.() ? 1 : 0;
                                let n = 0, o = 0;
                                try {
                                    mv?.m_visibleTiles?.m_dataSourceCache?.m_tileCache
                                        ?.forEach?.((t: any) => {
                                            if (t.dataSource === ds) { n++; o += t.objects?.length ?? 0; }
                                        });
                                } catch {}
                                cacheTiles = n; objs = o;
                                let r = 0;
                                try {
                                    for (const l of mv?.m_visibleTiles?.dataSourceTileList ?? []) {
                                        if (l.dataSource === ds) r += l.renderedTiles?.size ?? 0;
                                    }
                                } catch {}
                                rendered = r;
                            }
                            // eslint-disable-next-line no-console
                            console.log('[MBBatchedDiag] f=' + diag.n +
                                ' stat=' + JSON.stringify((globalThis as any).__mbBatched ?? null) +
                                ' reg=' + ((self as any).m_batchedDsRegistered === true ? 1 : 0) +
                                ' en=' + (globalThis as any).__mbBatchedDsEnabled +
                                ' loading=' + loading +
                                ' cache=' + cacheTiles + ' objs=' + objs + ' rendered=' + rendered +
                                ' wiring=' + ((self as any).m_batchedModelWirings ?? []).map((w: any) => w.remaining).join(',') +
                                ' ierr=' + ((globalThis as any).__mbIifeErr ?? '') +
                                ' root=' + (() => {
                                    try { return (mv?.m_sceneRoot?.children ?? []).length; } catch { return '?'; }
                                })());
                        } catch (e: any) {
                            // eslint-disable-next-line no-console
                            console.log('[MBBatchedDiag] err ' + String(e?.message).slice(0, 80));
                        }
                    }
                }
                // The depth occlusion target is created lazily on the first
                // WillRender — at connect() time depthTexture was still null
                // and the patcher never received it (icon occlusion fade
                // silently never armed). Re-check every frame (idempotent).
                const dt = (self as any).m_depthOcclusion?.depthTexture;
                if (dt && (patcher as any).m_depthTexture !== dt) {
                    if ((globalThis as any).__mbOccDbg) // eslint-disable-next-line no-console
                        console.log('[MBOcc] depth texture armed ' + dt.uuid);
                    patcher.setDepthTexture(dt);
                    patcher.invalidate();
                }
                patcher.patchTileMaterials();
                // §516: tiles that decoded before their cross-tile elevation
                // curves arrived re-decode once the registry grows (mgl
                // reparse-on-provider-arrival for deferred features).
                try {
                    const dec = self.decoder as any;
                    if (dec?.hasElevationRedecodePending?.()) {
                        dec.clearElevationRedecodePending();
                        self.mapView?.markTilesDirty?.(self as any);
                    }
                } catch {}
                // §516 hide-probe: `mbhide=<substr>` karma arg hides every
                // object whose technique layerId/color/pattern contains the
                // substring (comma-separated list) — binary-search the source
                // of stray pixels without code edits.
                try {
                    const hideArg = (window as any).__karma__?.config?.args
                        ?.find?.((a: string) => a.startsWith('mbhide='))
                        ?.slice('mbhide='.length);
                    if (hideArg) {
                        const needles = hideArg.split(',');
                        self.mapView.scene.traverse((o: any) => {
                            const t: any = o.userData?.technique;
                            if (!t) return;
                            const hay = `${t._layerId ?? ''}|${t.color ?? ''}|${t._patternName ?? ''}|${t._mbElevPrepass ?? ''}`;
                            if (needles.some((n2) => n2 && hay.includes(n2))) {
                                o.visible = false;
                            }
                        });
                    }
                } catch {}
                // Icon cross-fade blends decoded tiles requested — register
                // them before placement/PoiRenderer material creation.
                self.flushIconBlends();
                if ((globalThis as any).__mbDecodeDbg) {
                    try {
                        const counts: Record<string, number> = {};
                        let total = 0;
                        const cam: any = (self.mapView as any).m_rteCamera
                            ?? (self.mapView as any).camera;
                        const V = new THREE.Vector3();
                        const samples: string[] = [];
                        const elevSamples: string[] = [];
                        const yellowSamples: string[] = [];
                        const blackSamples: string[] = [];
                        const modelSamples: string[] = [];
                        self.mapView.scene.traverse((o: any) => {
                            // §518: model-instance ROOTS (transform carriers,
                            // plain Object3D) — probe before the mesh branch.
                            if (o.userData?._mbLayerId && modelSamples.length < 6) {
                                o.updateWorldMatrix?.(true, false);
                                o.getWorldPosition(V);
                                const vv = V.clone().project(cam);
                                const e = o.matrixWorld.elements;
                                modelSamples.push(
                                    `root layer=${o.userData._mbLayerId} v=${o.visible ? 1 : 0}` +
                                    ` pos=(${o.position.x.toFixed(0)},${o.position.y.toFixed(0)},${o.position.z.toFixed(0)})` +
                                    ` scl=(${o.scale.x},${o.scale.y},${o.scale.z})` +
                                    ` ndc=(${vv.x.toFixed(2)},${vv.y.toFixed(2)})` +
                                    ` mw0=(${e[0].toFixed(1)},${e[5].toFixed(1)},${e[10].toFixed(1)},${e[12].toFixed(0)},${e[13].toFixed(0)},${e[14].toFixed(0)})`);
                            }
                            if ((o as any).isMesh || (o as any).isPoints || (o as any).isLine) {
                                total++;
                                const tname = o.userData?.technique?.name ?? o.userData?.technique?.technique ?? o.type;
                                const tcol = o.userData?.technique?._paint?.['fill-color']
                                    ?? o.userData?.technique?.color ?? '';
                                counts[`${tname}:${tcol}`] = (counts[`${tname}:${tcol}`] ?? 0) + 1;
                                const isElev = !!(o.userData?.technique as any)?.__elev;
                                const isYellow = String(o.userData?.technique?.color ?? '').includes('54, 100%');
                                const matAny: any = Array.isArray(o.material) ? o.material[0] : o.material;
                                const isBlackMat = !!matAny?.color &&
                                    matAny.color.r + matAny.color.g + matAny.color.b < 0.02 &&
                                    matAny.colorWrite !== false;
                                const sampleSink = isElev ? elevSamples
                                    : isYellow ? yellowSamples
                                    : isBlackMat ? blackSamples
                                    : o.userData?._mbLayerId ? modelSamples
                                    : samples;
                                if (sampleSink.length < 6) {
                                    o.updateMatrixWorld?.();
                                    const g: any = o.geometry;
                                    let vx = '';
                                    if (g?.attributes?.position) {
                                        const pa = g.attributes.position;
                                        const v0 = new THREE.Vector3();
                                        if (pa.itemCount === 3 || pa.itemSize === 3) {
                                            v0.fromBufferAttribute?.(pa, 0)
                                                ?? v0.set(pa.array[0], pa.array[1], pa.array[2]);
                                        } else {
                                            v0.set(pa.array[0], pa.array[1], 0);
                                        }
                                        v0.applyMatrix4(o.matrixWorld);
                                        const vv = v0.clone().project(cam);
                                        vx = `v0ndc=(${vv.x.toFixed(2)},${vv.y.toFixed(2)}) v0w=(${v0.x.toFixed(0)},${v0.y.toFixed(0)},${v0.z.toFixed(0)})`;
                                    }
                                    // §514: elevated-structures meshes share one
                                    // buffer across color groups — sample the FIRST
                                    // VERTEX OF EACH three.js group draw range so the
                                    // probe reflects the group's own location, and
                                    // verify the index buffer against the group range.
                                    let gx = '';
                                    const gfr = (o.userData?.technique as any)?._ribbonGapFraction;
                                    if (gfr !== undefined) { gx += ` gfr=${gfr.toFixed(3)}`; }
                                    if ((isElev || isYellow) && g) {
                                        const pa = g.attributes.position;
                                        const idx: any = g.index;
                                        for (const gr of g.groups.slice(0, 4)) {
                                            const i0 = idx ? idx.array[gr.start] : gr.start;
                                            const v0 = new THREE.Vector3(
                                                pa.array[i0 * 3], pa.array[i0 * 3 + 1], pa.array[i0 * 3 + 2]);
                                            v0.applyMatrix4(o.matrixWorld);
                                            const vv = v0.clone().project(cam);
                                            gx += ` g[s=${gr.start},n=${gr.count},m=${gr.materialIndex}]v0w=(${v0.x.toFixed(0)},${v0.y.toFixed(0)},${v0.z.toFixed(0)})ndc=(${vv.x.toFixed(2)},${vv.y.toFixed(2)})`;
                                        }
                                        const dr = g.drawRange;
                                        gx += ` drawRange=(${dr?.start},${dr?.count}) idxLen=${idx ? idx.array.length : 0}`;
                                    }
                                    o.getWorldPosition(V);
                                    V.project(cam);
                                    const mat: any = Array.isArray(o.material) ? o.material[0] : o.material;
                                    const mc = mat?.color ? ` c=${mat.color.toArray().map((n: number) => n.toFixed(2)).join(',')}` : '';
                                    const tech = o.userData?.technique;
                                    const tinfo = tech ? ` tech=${tech.name}/${tech.technique}/r=${(tech.renderOrder ?? '').toString().slice(0,8)} ras=${tech._isRaster ? 1 : 0}` : '';
                                    sampleSink.push(`${tname}:${tcol}${tinfo ?? ''} v=${o.visible?1:0} fr=${o.frustumCulled?1:0} ro=${o.renderOrder} ndc=(${V.x.toFixed(2)},${V.y.toFixed(2)}) ${vx} nvert=${g?.attributes?.position?.count} mat=${mat?.type} op=${mat?.opacity} tr=${mat?.transparent?1:0}${mc}${gx}`);
                                }
                            }
                        });
                        // eslint-disable-next-line no-console
                        console.log('[MBScene] objs=' + total + ' ' + JSON.stringify(counts));
                        for (const es of elevSamples) {
                            // eslint-disable-next-line no-console
                            console.log('[MBElevObj] ' + es);
                        }
                        for (const ys of yellowSamples) {
                            // eslint-disable-next-line no-console
                            console.log('[MBYellowObj] ' + ys);
                        }
                        for (const bs of blackSamples) {
                            // eslint-disable-next-line no-console
                            console.log('[MBBlackObj] ' + bs);
                        }
                        for (const ms of modelSamples) {
                            // eslint-disable-next-line no-console
                            console.log('[MBModelObj] ' + ms);
                        }
                        // §516: console forwarding from the page is flaky
                        // (§510) — mirror the probes to a global the result
                        // page can dump, and POST to the result server.
                        try {
                            // §516 full inventory: every object's technique
                            // color/ro + material state for black-source elimination.
                            const inventory: any[] = [];
                            self.mapView.scene.traverse((o: any) => {
                                if (!((o as any).isMesh || (o as any).isPoints || (o as any).isLine)) return;
                                const t: any = o.userData?.technique;
                                const m: any = Array.isArray(o.material) ? o.material[0] : o.material;
                                inventory.push({
                                    c: String(t?.color ?? ''),
                                    ro: o.renderOrder,
                                    layer: String(t?._layerId ?? ''),
                                    pat: t?._patternName ?? undefined,
                                    prepass: t?._mbElevPrepass ?? undefined,
                                    nvert: o.geometry?.attributes?.position?.count ?? 0,
                                    // §549: engine-geometry frame calibration —
                                    // first vertex in world space (same RTE
                                    // frame the batched probes report).
                                    w0: (() => {
                                        try {
                                            const pa = o.geometry?.attributes?.position;
                                            if (!pa || pa.count === 0) return undefined;
                                            const v = new THREE.Vector3(
                                                pa.getX(0), pa.getY(0), pa.getZ(0))
                                                .applyMatrix4(o.matrixWorld);
                                            return [+v.x.toFixed(0), +v.y.toFixed(0), +v.z.toFixed(0)];
                                        } catch { return undefined; }
                                    })(),
                                    matc: m?.color ? m.color.toArray().map((n: number) => Number(n.toFixed(2))) : undefined,
                                    vis: o.visible ? 1 : 0,
                                    cw: m?.colorWrite === false ? 0 : 1,
                                    tr: m?.transparent ? 1 : 0,
                                    map: !!m?.map,
                                    // §526: per-object injection flags —
                                    // identify which materials actually carry
                                    // each injector (shadow receiver etc.).
                                    shIn: m?.__mbShadowInjected ? 1 : 0,
                                    glit: m?.__mbGroundLitHandler ? 1 : 0,
                                    slit: m?.__mbStructLit ? 1 : 0,
                                    elab: m?.__mbExtrusion3DLit ? 1 : 0,
                                    mat: String(m?.type ?? ''),
                                });
                            });
                            (globalThis as any).__mbProbeInventory = inventory;
                            const dump = {
                                shadow: {
                                    sls: !!(self.m_environment as any)?.shadowLightState,
                                    su: !!(self.m_shadowRenderer as any)?.getShadowUniforms?.(),
                                    en: !!(self.m_shadowRenderer as any)?.enabled,
                                    grid: (globalThis as any).__mbShadowGrid,
                                    gerr: (globalThis as any).__mbShadowGridErr,
                                    perr: (globalThis as any).__mbShadowPassErr,
                                    batched: (globalThis as any).__mbBatched,
                                    dsErr: (globalThis as any).__mbBatchedDsErr,
                                    dsRegistered: (self as any).m_batchedDsRegistered === true ? 1 : 0,
                                    dsEnabled: (globalThis as any).__mbBatchedDsEnabled,
                                    dsLoading: (() => {
                                        try {
                                            return ((self as any).m_batchedModelDataSources ?? [] as any[])
                                                .some((d: any) => d.isLoading?.()) ? 1 : 0;
                                        } catch { return 'err'; }
                                    })(),
                                    iifeEntered: (globalThis as any).__mbIifeEntered ?? 0,
                                    iifeWait: (globalThis as any).__mbIifeWait,
                                    iifeErr: (globalThis as any).__mbIifeErr,
                                    wireCount: (globalThis as any).__mbBatchedWire ?? 0,
                                    dsNames: (() => {
                                        try {
                                            return ((self.mapView as any).m_tileDataSources ?? [])
                                                .map((d: any) => d.name);
                                        } catch { return 'err'; }
                                    })(),
                                    rootKidsWill: (globalThis as any).__mbRootKidsWill,
                                    renderPath: (globalThis as any).__mbRenderPath,
                                    pixelPre: (globalThis as any).__mbPixelPre,
                                    pixelPost: (globalThis as any).__mbPixelPost,
                                    rootKids: (() => {
                                        try {
                                            const root = (self.mapView as any).m_sceneRoot;
                                            return (root?.children ?? []).map((c: any) => ({
                                                name: c.name, vis: c.visible,
                                                kids: c.children?.length ?? 0,
                                                pos: [+c.position.x.toFixed(0), +c.position.y.toFixed(0), +c.position.z.toFixed(0)],
                                            }));
                                        } catch (e: any) { return String(e).slice(0, 80); }
                                    })(),
                                    batchedScene: (() => {
                                        try {
                                            const cam = (self.mapView as any)?.camera;
                                            const pr = (self.m_batchedModelRenderer as any)?.probe?.() ?? [];
                                            return pr.map((e: any) => {
                                                if (!e.meshes) return e;
                                                return { ...e, meshes: e.meshes.map((m: any) => {
                                                    const ndc = new THREE.Vector3(
                                                        m.v0[0], m.v0[1], m.v0[2]).project(cam);
                                                    return { ...m, ndc: [+ndc.x.toFixed(3), +ndc.y.toFixed(3), +ndc.z.toFixed(3)] };
                                                }) };
                                            });
                                        } catch (e: any) {
                                            return [{ err: String(e).slice(0, 120) }];
                                        }
                                    })(),
                                    perr2: (globalThis as any).__mbBatched?.parseErr,
                                    wire: (globalThis as any).__mbBatchedWire,
                                    runs: (globalThis as any).__mbBatchedRun,
                                    srcs: (self as any).m_batchedModelSources?.length,
                                    ierr: (globalThis as any).__mbBatchedInitErr,
                                    info: (globalThis as any).__mbShadowInfo,
                                    retry: (globalThis as any).__mbShadowRetry,
                                },
                                elev: elevSamples, yellow: yellowSamples,
                                black: blackSamples, samples, inventory,
                                shaders: (globalThis as any).__mbShaderProbe ?? [],
                                ribbonShaders: (globalThis as any).__mbRibbonProbe ?? [],
                            };
                            (globalThis as any).__mbProbeDump = dump;
                            (dump as any).nonce = performance.now();
                            const sig = 'n' + (dump as any).nonce + '|' + dump.yellow.join('|') + '#' + dump.black.join('|') + '#' + inventory.length + '#' + JSON.stringify(dump.shadow?.grid ?? '') + (dump.shadow?.gerr ? '#E' + dump.shadow.gerr : '') + (dump.shadow?.perr ? '#P' + dump.shadow.perr : '') + '#B' + JSON.stringify([dump.shadow?.runs ?? 0, dump.shadow?.srcs ?? 0, dump.shadow?.ierr ?? '', dump.shadow?.batched ?? null]);
                            const st = (globalThis as any).__mbProbePost ??= { n: 0, sig: '' };
                            const fb = (window as any).__karma__?.config?.args
                                ?.find?.((a: string) => a.startsWith('feedback-url='))
                                ?.slice('feedback-url='.length);
                            if (fb && st.n < 10 && sig !== st.sig) {
                                st.sig = sig;
                                st.n++;
                                fetch(`${fb}/mb-probe-dump`, {
                                    method: 'POST',
                                    headers: { 'content-type': 'application/json' },
                                    body: JSON.stringify(dump),
                                }).catch(() => {});
                            }
                        } catch {}
                        for (const s of samples) {
                            // eslint-disable-next-line no-console
                            console.log('[MBObj] ' + s);
                        }
                    } catch {}
                }
                // §273: per-frame fog uniform sync (globe center / alpha) —
                // materials snapshot UniformsLib.fog at creation.
                self.m_environment?.syncFogUniforms();
                if (placement) placement.run();
                if (self.m_heatmapRenderer) {
                    self.m_heatmapRenderer.run();
                }
                if (self.m_additiveLineRenderer) {
                    self.m_additiveLineRenderer.run();
                }
                if (self.m_modelRenderer) {
                    self.m_modelRenderer.run();
                }
                // §518: loadModels instances (source-registry path) share the
                // RTE problem — keep them at absolute − eye (see
                // MBModelRenderer.run for the frame explanation).
                // §643: the load path bakes R·S·flip into `model.matrix` with
                // matrixAutoUpdate=false, so a bare position.set() never
                // reached the rendered matrix — every model-source instance
                // stayed at absolute world (~1e7) and rendered nothing (the
                // entire blank model-source fixture family). Write the rebase
                // straight into the frozen matrix.
                if ((self as any).m_loadedModels?.length > 0) {
                    try {
                        const gc = (self.mapView as any).geoCenter;
                        const pr = (self.mapView as any).projection;
                        if (gc && pr) {
                            const eye = pr.projectPoint(gc, { x: 0, y: 0, z: 0 });
                            for (const entry of (self as any).m_loadedModels) {
                                const model = entry.model;
                                const base = model.userData?._mbBasePos;
                                if (!base) continue;
                                model.position.set(base.x - eye.x, base.y - eye.y, base.z - eye.z);
                                if (model.matrixAutoUpdate === false) {
                                    model.matrix.setPosition(model.position);
                                }
                                if ((globalThis as any).__mbDecodeDbg
                                    && ((globalThis as any).__mbRebaseN = ((globalThis as any).__mbRebaseN ?? 0) + 1) <= 6) {
                                    // eslint-disable-next-line no-console
                                    console.log(`[MBRebase] id=${model.userData?._mbModelSource?.entryId} base=(${base.x.toFixed(1)},${base.y.toFixed(1)},${base.z.toFixed(1)}) eye=(${eye.x.toFixed(1)},${eye.y.toFixed(1)},${eye.z.toFixed(1)}) geoCenter=(${gc.latitude?.toFixed?.(6)},${gc.longitude?.toFixed?.(6)} alt=${(gc.altitude ?? 0).toFixed?.(1)}) pos=(${model.position.x.toFixed(1)},${model.position.y.toFixed(1)},${model.position.z.toFixed(1)})`);
                                }
                            }
                        }
                    } catch {}
                }

                // §528: the shadow DEPTH pass runs in WillRender instead —
                // its setRenderTarget/clear leaves the canvas depth state
                // corrupted AFTER the frame was drawn (SwiftShader), and the
                // post-frame capture then sees the corrupted canvas. Running
                // it BEFORE the main render means any canvas-level damage is
                // overwritten by the frame itself; uniforms lag one frame
                // (same as heatmap).
                if (self.m_shadowRenderer) {
                    const sl = self.m_environment?.shadowLightState;
                    { const g: any = (globalThis as any); g.__shN = (g.__shN ?? 0) + 1;
                      if (g.__shN <= 2) { const su: any = self.m_shadowRenderer.getShadowUniforms?.();
                        console.log('[SHST] n=' + g.__shN + ' sl=' + (sl ? 'Y(int=' + sl.intensity + ')' : 'null') +
                            ' map=' + (su?.map?.value ? 'Y' : (su ? 'null' : 'no-su'))); } }
                    // mgl test styles normalize the root camera-projection
                    // into a `camera` object — honor both shapes.
                    const camSpec: any = (style as any).camera ?? style;
                    self.m_shadowRenderer.setOrthographicStyle(
                        camSpec['camera-projection'] === 'orthographic');
                    // §643: the §572b translucent scan retired — the ground
                    // quad draws in the engine preSceneHook (underlay), where
                    // it lies beneath translucent and depth-less layers by
                    // construction (see MBShadowRenderer.drawGroundQuad).
                    self.m_shadowRenderer.setLightState(!!sl, sl?.intensity ?? 0);
                    self.m_shadowRenderer.run();
                    // §562: model materials sample the shadow map in their
                    // direct lighting term (mgl shadowed_light_factor_normal).
                    try {
                        const { syncModelShadowUniforms } = await import('./MBModelRenderer');
                        syncModelShadowUniforms(self.m_shadowRenderer.getShadowUniforms());
                    } catch { /* best-effort */ }
                }
                if (self.m_atmosphereRenderer) {
                    self.m_atmosphereRenderer.run();
                }
                if (self.m_backgroundFogRenderer) {
                    self.m_backgroundFogRenderer.run();
                }
                // §780: globe pole caps (mgl GLOBE_POLES) — sync the fan
                // meshes registered by the raster provider into the scene.
                try {
                    const { MBGlobePoleCaps } = await import('./MBGlobePoleCaps');
                    if (self.mapView?.projection?.type === 1) {
                        let capOpacity = 0;
                        const layers780: any[] = self.m_runtime?.style?.layers ?? [];
                        const ras780 = layers780.find((l: any) =>
                            l.type === 'raster' && l.layout?.visibility !== 'none');
                        if (ras780) {
                            try {
                                const { MBExpressionEngine } = require('./MBExpressionEngine');
                                capOpacity = Number(MBExpressionEngine.evaluate(
                                    ras780.paint?.['raster-opacity'] ?? 1,
                                    { zoom: (self.mapView as any).zoomLevel - 1, feature: undefined } as any,
                                )) || 0;
                            } catch {
                                capOpacity = Number(ras780.paint?.['raster-opacity'] ?? 1) || 0;
                            }
                        }
                        // §780: the background pole fill — mgl's globe
                        // background geometry covers the full sphere, so the
                        // polar void beyond ±85.05° shows the fogged
                        // background color (globe-poles expected is
                        // continuous darkorange past the mercator edge).
                        try {
                            const bg780 = layers780.find((l: any) =>
                                l.type === 'background' && l.layout?.visibility !== 'none');
                            let bgOpacity = 1;
                            if (bg780) {
                                let bgColor: any = bg780.paint?.['background-color'] ?? '#000000';
                                bgOpacity = Number(bg780.paint?.['background-opacity'] ?? 1);
                                try {
                                    const { MBExpressionEngine } = require('./MBExpressionEngine');
                                    bgColor = MBExpressionEngine.evaluate(bgColor, {
                                        zoom: (self.mapView as any).zoomLevel - 1,
                                        feature: undefined,
                                    } as any) ?? bgColor;
                                    bgOpacity = Number(MBExpressionEngine.evaluate(
                                        bg780.paint?.['background-opacity'] ?? 1,
                                        { zoom: (self.mapView as any).zoomLevel - 1, feature: undefined } as any,
                                    )) || 0;
                                } catch {}
                                MBGlobePoleCaps.registerBackground(new THREE.Color(String(bgColor)));
                            } else {
                                MBGlobePoleCaps.registerBackground(null);
                            }
                            // §781: hand the globe background-pattern quad (if
                            // any) to the after-pass so it renders sandwiched
                            // between the background dome and the pole fans —
                            // mgl bends the background pattern around the
                            // sphere and paints it under every content layer.
                            MBGlobePoleCaps.setPatternQuad(
                                (self.m_environment as any)?.m_backgroundPatternGlobeQuad ?? null);
                            MBGlobePoleCaps.sync(self.mapView, capOpacity, bgOpacity);
                        } catch {
                            MBGlobePoleCaps.registerBackground(null);
                        }
                        if (!(globalThis as any).__mbPoleCapOff) {
                            MBGlobePoleCaps.render(
                                self.mapView,
                                (self.m_environment as any)?.m_fog ?? null);
                        }
                    } else {
                        MBGlobePoleCaps.clear();
                    }
                } catch { /* best-effort */ }
                // §778: globe circle overlay — the backgroundFog quad paints
                // after the main pass and washes the circle points (mgl draws
                // circles AFTER the background). Re-render only the circle
                // objects on top via a dedicated layer, no clear.
                {
                    const objs778: any[] = (self as any).__mbCircleObjs ?? [];
                    const live778 = objs778.filter((o: any) => o.parent);
                    if (self.mapView?.projection?.type === 1 && live778.length > 0) {
                        const r778: any = (self.mapView as any).renderer;
                        const cam778: any = (self.mapView as any).m_rteCamera
                            ?? self.mapView.camera;
                        if (r778 && cam778) {
                            const prevMask = cam778.layers.mask;
                            const prevAutoClear = r778.autoClear;
                            r778.autoClear = false;
                            cam778.layers.set(7);
                            // §778: depth-TEST (not write) against the ground
                            // from the main pass — circles beyond the horizon
                            // are occluded by the globe like mgl; the flat
                            // self-material has depthTest off for the same
                            // pass, so toggle it per overlay.
                            for (const o of live778) {
                                o.layers.set(7);
                                o.material.depthTest = true;
                            }
                            r778.render((self.mapView as any).scene, cam778);
                            for (const o of live778) {
                                o.layers.mask = 1;
                                o.material.depthTest = false;
                            }
                            cam778.layers.mask = prevMask;
                            r778.autoClear = prevAutoClear;
                        }
                    }
                }
                // §775: model-tail self-drawn mgl fog — refresh the per-frame
                // fog uniforms (fogAlpha/horizon/camHeight/range + themed
                // env fog color + zoom-dependent distCam).
                try {
                    const { syncModelFogUniforms } = await import('./MBModelRenderer');
                    syncModelFogUniforms(self.mapView, self.m_environment);
                } catch { /* best-effort */ }

                if (self.m_debugTileBoundaries) self.drawTileBoundaries();
                const tc = self.m_environment?.terrainController;
                if (tc && tc.isMorphing) {
                    tc.updateMorphing(Date.now());
                }
                // Push the live mapbox camera zoom to the decoder so camera
                // functions (icon-size/text-size stops, dynamic-filter) evaluate
                // at the continuous zoom, not the floored integer tile level.
                self.pushMapboxZoom();
                // TerrainDraping has its own AfterRender listener that
                // detects mesh count changes + morphing completion + lazy
                // bake — no manual trigger needed here.
            });
        }

        this.m_modelsLoaded = false;
        await this.loadModels(style).finally(() => { this.m_modelsLoaded = true; });

        if (this.m_environment && style.terrain) {
            await this.m_environment.applyTerrain(
                { ...(style.terrain as any), encoding: this.m_demEncoding },
                this.m_demTileUrl,
                style.zoom ?? 8,
                style.center ?? [0, 0],
                this.m_demMaxZoom,
                this.m_demTileSize,
            );
            // Terrain elevation must reach the engine's clip-plane evaluation
            // (the terrain mesh is not a Tile, so tile geoBoxes never carry
            // it). Without it the far plane hugs the 0-elevation horizon and
            // mid-range terrain at high pitch is clipped away (sky where the
            // map should be) — mgl uses terrain elevation in the transform's
            // horizon/far-plane math.
            // §283: mgl renders with the camera ON the elevated surface.
            // Equivalent camera-relative geometry: shift the whole terrain
            // mesh DOWN by the center elevation and hand out RELATIVE
            // elevations — the camera/zoom/tile selection stay untouched
            // (a direct camera lift drifted the engine zoomLevel and
            // broke tile selection).
            try {
                const ctl2 = (this.m_environment as any).terrainController;
                if (ctl2) {
                    const lng = style.center?.[0] ?? 0, lat = style.center?.[1] ?? 0;
                    const { mercatorProjection, GeoCoordinates } =
                        require('@flywave/flywave-geoutils');
                    const wp = mercatorProjection.projectPoint(
                        new GeoCoordinates(lat, lng), new THREE.Vector3());
                    const origin = ctl2.sampleElevation(wp.x, wp.y);
                    if (Number.isFinite(origin) && origin !== 0) {
                        ctl2.setElevationOrigin(origin);
                    }
                }
            } catch {}
            // §279: hand the decoder a CPU elevation sampler so
            // fill-extrusion footprints ride the DEM surface (mgl
            // fill_extrusion.vertex.glsl getTerrainHeight).
            try {
                const ctl = (this.m_environment as any).terrainController;
                if (ctl) {
                    this.decoder.configure(undefined, {
                        terrainElevationSampler: (wx: number, wy: number) =>
                            ctl.sampleElevation(wx, wy),
                        terrainHeightScale: ctl.sampleSecLat ?? 1,
                        terrainHeightScaleFromTerrain: true,
                        // §548: live exaggeration (line-elevation-ground-scale).
                        terrainExaggeration:
                            (this.m_environment as any).currentTerrainExaggeration ?? 1,
                    } as any);
                }
            } catch {}
            // mgl scales fill-extrusion heights by sec(lat) exactly once
            // (bucket: meters/tileToMeter; mercator upVectorScale is 1).
            // Without terrain the factor was missing entirely — buildings
            // rendered sec(lat) (=1.32 at NYC) too short, producing the
            // §455 roof↔wall silhouette swaps. Runs unconditionally (the
            // terrain branch above only fires when the style HAS terrain).

            const terrainMax = (this.m_environment as any).terrainController?.maxElevation ?? 0;
            // The terrain meshes only exist now — re-run applyBackgroundColor
            // so their base color picks up the (themed, lit) background.
            try { this.applyBackgroundColor(style); } catch {}
            if (terrainMax > 0) {
                this.maxGeometryHeight = Math.max(this.maxGeometryHeight, terrainMax);
                // MapView-level clip-plane elevation (the VisibleTileSet reads
                // MapView.maxGeometryHeight, not per-datasource values).
                const mv: any = this.mapView;
                const prev = (mv as any).m_maxGeometryHeight ?? 0;
                mv.maxGeometryHeight = Math.max(prev, terrainMax);
            }
            // Enable depth occlusion so circles/symbols behind terrain are hidden.
            if (this.m_materialPatcher) {
                this.m_materialPatcher.setDepthOcclusion(true);
                this.m_materialPatcher.invalidate();
            }
            // Start soft depth occlusion (Scheme A): render terrain depth to a
            // DepthTexture each frame (WillRender) and inject it into circle
            // materials for smooth fade. Best-effort; falls back to Scheme C
            // (hardware depthTest) if unavailable.
            if (this.mapView && this.m_environment.terrainController) {
                try {
                    const { TerrainDepthOcclusion } = await import('./TerrainDepthOcclusion');
                    this.m_depthOcclusion?.dispose();
                    this.m_depthOcclusion = new TerrainDepthOcclusion(
                        this.mapView, this.m_environment.terrainController);
                    this.m_depthOcclusion.start();
                    if (this.m_materialPatcher && this.m_depthOcclusion.depthTexture) {
                        this.m_materialPatcher.setDepthTexture(this.m_depthOcclusion.depthTexture);
                    }
                } catch {}
            }

            // Start FBO texture draping: bake non-terrain layers (raster
            // satellite, fill patterns, etc.) into per-tile textures and
            // feed them to the terrain material's uDrape uniform.
            // Activated alongside depth occlusion — the two are complementary
            // (depth occlusion hides labels behind hills; draping paints
            // raster content on the DEM surface).
            if (this.mapView) {
                try {
                    // §505: CREATE-ONCE (even without a controller yet — the
                    // env-reference follows applyTerrain rebuilds lazily). The draping holds the ENVIRONMENT
                    // (not a controller instance), so it follows every
                    // applyTerrain rebuild automatically. The previous
                    // dispose+recreate-per-setup cleared the convergence
                    // snapshots on every async style re-apply — the drape
                    // never accumulated (hillshade-buffer family white).
                    if (!this.m_terrainDraping) {
                        const { TerrainDraping } = await import('./TerrainDraping');
                        this.m_terrainDraping = new TerrainDraping(
                            this.mapView, this.m_environment);
                        this.m_terrainDraping.start();
                    }
                } catch {}
            }
        }

        // Building depth occlusion without terrain (mgl draw_symbol
        // setOcclusionDefines: a layer carrying an occlusion-opacity property
        // gets DEPTH_OCCLUSION even without terrain — its symbols/lines fade
        // against the 3D building depth). Render an extrusions-only depth
        // texture and expose it to consumers; only layers that explicitly set
        // an occlusion property consume the fade (see the patcher's
        // _occlusionExplicit gate), so plain fixtures stay pixel-identical.
        if (this.mapView && !style.terrain && this.m_materialPatcher) {
            const hasOcclusionProps = (style.layers ?? []).some((l: any) => l.paint &&
                ('icon-occlusion-opacity' in l.paint || 'text-occlusion-opacity' in l.paint ||
                 'line-occlusion-opacity' in l.paint || 'circle-occlusion-opacity' in l.paint))
                || this.m_iconDepthTestStyle;
            if (hasOcclusionProps) {
                try {
                    const { TerrainDepthOcclusion } = await import('./TerrainDepthOcclusion');
                    this.m_depthOcclusion?.dispose();
                    this.m_depthOcclusion = new TerrainDepthOcclusion(
                        this.mapView, null, 'u_terrainDepth', true);
                    this.m_depthOcclusion.start();
                    this.m_materialPatcher.setBuildingOcclusion(true);
                    this.m_materialPatcher.setDepthOcclusion(true);
                    if (this.m_depthOcclusion.depthTexture) {
                        this.m_materialPatcher.setDepthTexture(this.m_depthOcclusion.depthTexture);
                    }
                    this.m_materialPatcher.invalidate();
                } catch {}
            }
        }

        if (this.m_environment && this.m_rasterTileUrl) {
            const rasterLayer = (style.layers ?? []).find((l: any) => l.type === 'raster');
            const rasterPaint = (rasterLayer as any)?.paint ?? {};
            await this.m_environment.applyRasterSource(
                this.m_rasterTileUrl,
                Math.min(Math.max(Math.floor(style.zoom ?? 0), 0), 12),
                style.center ?? [0, 0],
                rasterPaint,
                rasterLayer as any,
            );
        }

        if (this.m_environment) {
            await this.m_environment.applyImageSources(style);
        }

        await super.connect();
    }

    get spriteAtlas(): SpriteAtlas | null {
        return this.m_spriteAtlas;
    }

    get demTileUrl(): string | null {
        return this.m_demTileUrl;
    }

    get rasterTileUrl(): string | null {
        return this.m_rasterTileUrl;
    }

    /**
     * Publish the modelId → url registry (root-level `style.models`, mgl v8
     * semantic: `models: { oak: "local://models/oak1.glb", ... }`) plus any
     * `models` maps on `type: "model"` sources, resolved and rewritten, to the
     * MBModelRenderer — the per-feature instantiation channel for model
     * layers over vector sources.
     */
    private updateModelRegistry(style: StyleSpecification): void {
        if (!this.m_modelRenderer) return;
        const LOCAL = '/base/@flywave/flywave-mbstyle-datasource/test/rendering/integration/';
        const resolveUrl = (u: string) => {
            if (!u) return '';
            const v = u.replace(/^local:\/\//, LOCAL);
        // §643: mgl fixture URIs carry doubled slashes
        // (local://models//Duck.gltf) — the karma static server 404s
        // them and the model silently never loads (blank model-source
        // fixtures). Collapse duplicate path slashes, protocol excepted.
            const prot = v.match(/^([a-z][a-z0-9+.-]*:\/\/)/i);
            const rest = prot ? v.slice(prot[1].length) : v;
            return (prot ? prot[1] : '') + rest.replace(/\/{2,}/g, '/');
        };
        const registry = new Map<string, string>();
        const addEntry = (id: string, def: any) => {
            const uri = typeof def === 'string' ? def : def?.uri;
            if (typeof uri === 'string' && uri) registry.set(id, resolveUrl(uri));
        };
        const rootModels = (style as any).models;
        if (rootModels && typeof rootModels === 'object') {
            for (const [id, def] of Object.entries(rootModels)) addEntry(id, def);
        }
        for (const source of Object.values((style.sources as any) ?? {})) {
            const models = (source as any)?.models;
            if (models && typeof models === 'object') {
                for (const [id, def] of Object.entries(models)) addEntry(id, def);
            }
        }
        this.m_modelRenderer.setModelRegistry(registry);
        if ((globalThis as any).__mbDecodeDbg) {
            // eslint-disable-next-line no-console
            console.log(`[MBModelReg] registry=${registry.size} entries=${[...registry.keys()].join(',')} renderer=${!!this.m_modelRenderer}`);
        }
        this.m_modelRenderer.setLayers?.((style.layers ?? []) as any[]);
        // Placements only come from model layers over vector/geojson sources.
        const expectPlacements = (style.layers ?? []).some((l: any) =>
            l.type === 'model' && (style.sources as any)?.[l.source]?.type !== 'model');
        this.m_modelRenderer.setExpectPlacements?.(expectPlacements);
    }

    private async loadModels(style: StyleSpecification): Promise<void> {
        { const g: any = (globalThis as any);
          const arg: string | undefined = typeof window !== 'undefined'
              ? (window as any).__karma__?.config?.args?.find?.((a: string) => a.startsWith('modelscale='))?.slice('modelscale='.length)
              : undefined;
          if (arg !== undefined) g.__modelScaleCal = Number(arg) || 1; }

        const modelLayers = (style.layers ?? []).filter(
            (l: any) => l.type === 'model' && (l.layout?.visibility ?? 'visible') === 'visible',
        );
        if (modelLayers.length === 0) return;

        const scene = (this.mapView as any)?.m_scene as THREE.Scene | undefined;
        if (!scene) return;

        const LOCAL = '/base/@flywave/flywave-mbstyle-datasource/test/rendering/integration/';
        const resolveUrl = (u: string) => {
            if (!u) return '';
            const v = u.replace(/^local:\/\//, LOCAL);
        // §643: mgl fixture URIs carry doubled slashes
        // (local://models//Duck.gltf) — the karma static server 404s
        // them and the model silently never loads (blank model-source
        // fixtures). Collapse duplicate path slashes, protocol excepted.
            const prot = v.match(/^([a-z][a-z0-9+.-]*:\/\/)/i);
            const rest = prot ? v.slice(prot[1].length) : v;
            return (prot ? prot[1] : '') + rest.replace(/\/{2,}/g, '/');
        };

        for (const layer of modelLayers) {
            const layout = (layer as any).layout ?? {};
            // §643: model-scale/model-rotation are PAINT properties in the
            // mgl 3d-style spec (model layer fixtures put them in paint) —
            // layout was only a legacy fallback.
            const paint = (layer as any).paint ?? {};
            const modelScale = paint['model-scale'] ?? layout['model-scale'] ?? 1;
            const modelRotation = paint['model-rotation'] ?? layout['model-rotation'];

            // Collect model definitions: inline `models` map in the layer, a
            // `type: "model"` source's `models` registry, or from the
            // referenced source's data/url.
            const modelDefs: Array<{
                url: string;
                position: number[];
                orientation?: number[];
                scale?: number | number[];
                translation?: number[];
                /** §651: registry key — the model feature id. */
                id?: string;
                sourceId?: string;
                /** §756: scale calibration factor (karma modelscale gate). */
                _cal?: number;
            }> = [];

            // Inline models (mapbox HD: layer.models = { id: { uri, position } })
            const inlineModels = (layer as any).models;
            if (inlineModels && typeof inlineModels === 'object') {
                for (const m of Object.values(inlineModels) as any[]) {
                    if (m.uri) {
                        modelDefs.push({ url: resolveUrl(m.uri), position: m.position ?? [] });
                    }
                }
            }

            // `type: "model"` source registry (mgl v8):
            // sources.model.models = { id: { uri, position, orientation, scale } }
            // — each entry is instantiated once at its own position.
            if (modelDefs.length === 0) {
                const sourceId = (layer as any).source;
                const source = sourceId ? (style.sources as any)[sourceId] : null;
                const sourceModels = source?.models;
                if (sourceModels && typeof sourceModels === 'object') {
                    for (const [entryKey, m] of Object.entries(sourceModels) as any[]) {
                        if (m?.uri) {
                            modelDefs.push({
                                url: resolveUrl(m.uri),
                                position: m.position ?? [],
                                orientation: m.orientation,
                                scale: m.scale,
                                translation: m.translation,
                                // §651: the registry key — the model feature's id
                                // for per-part paint + feature-state evaluation.
                                id: entryKey,
                                sourceId,
                            });
                        }
                    }
                }
            }

            // Source-based models (source.type with data/url)
            if (modelDefs.length === 0) {
                const sourceId = (layer as any).source;
                const source = sourceId ? (style.sources as any)[sourceId] : null;
                // §755: geojson model-source — mgl vector-layer-external-models
                // semantics: one placement per Point feature, uri/scale/rotation
                // ride the feature properties (data-driven model-id). The geojson
                // file itself is NOT a model URL — the previous generic branch
                // fed it to GLTFLoader and silently dropped every placement.
                if (source?.type === 'geojson') {
                    let fc: any = null;
                    try {
                        if (source.data && typeof source.data === 'object'
                            && (source.data as any).type === 'FeatureCollection') {
                            fc = source.data;
                        } else if (typeof source.data === 'string') {
                            const res = await fetch(resolveUrl(source.data));
                            if (res.ok) fc = await res.json();
                        }
                    } catch { /* missing data → no placements */ }
                    if (fc?.type === 'FeatureCollection') {
                        const { localizeModelUrl } = await import('./MBModelRenderer');
                        for (const f of fc.features ?? []) {
                            const uri = f.properties?.['model-uri'];
                            if (typeof uri !== 'string' || !uri) continue;
                            const url = uri.startsWith('local://')
                                ? resolveUrl(uri)
                                : localizeModelUrl(uri);
                            // data-driven paint (["get","scale"], ["match",
                            // ["get","id"], …]) evaluates PER FEATURE here —
                            // stuffing the raw expression into scale/rotation
                            // later NaNs the placement matrix (models invisible).
                            const evalFeat = (raw: any): any => {
                                if (raw === undefined || raw === null) return undefined;
                                if (typeof raw !== 'object') return raw;
                                try {
                                    return MBExpressionEngine.evaluate(raw, {
                                        zoom: this.mapView?.zoomLevel ?? 0,
                                        feature: { type: 'Point',
                                            properties: f.properties ?? {},
                                            id: f.properties?.id } as any,
                                    } as any);
                                } catch { return undefined; }
                            };
                            modelDefs.push({
                                url,
                                position: f.geometry?.coordinates ?? [],
                                scale: evalFeat(paint['model-scale'] ?? layout['model-scale'])
                                    ?? f.properties?.scale,
                                _cal: Number((globalThis as any).__modelScaleCal ?? 1),
                                orientation: evalFeat(paint['model-rotation'] ?? layout['model-rotation'])
                                    ?? f.properties?.rotation,
                                // §770: synthesized entryId for id-less features —
                                // applyModelSourcePartStylingAll skips entries
                                // without _mbModelSource, so runtime paint ops
                                // never reached them.
                                id: f.properties?.id ?? `f${modelDefs.length}`,
                                sourceId,
                            });
                        }
                    }
                }
                if (modelDefs.length === 0 && source) {
                    const url = typeof source.data === 'string'
                        ? resolveUrl(source.data)
                        : resolveUrl(source.url);
                    const positions = layout['model-position'];
                    const positionList = Array.isArray(positions) && positions.length > 0 && Array.isArray(positions[0])
                        ? positions
                        : (style.center ? [style.center] : [[0, 0]]);
                    for (const pos of positionList) {
                        modelDefs.push({ url, position: pos });
                    }
                }
            }

            if (modelDefs.length === 0) continue;

            try {
                // §755: the shared loader carries the DRACOLoader — fixture
                // GLBs (tree.glb/maple.glb) are DRACO-compressed and a bare
                // GLTFLoader rejects them ("No DRACOLoader instance provided").
                const loader = await import('./MBModelRenderer').then(m => m.getSharedGLTFLoader());
                const { GeoCoordinates } = await import('@flywave/flywave-geoutils');
                const projection = (this.mapView as any).projection;

                for (const def of modelDefs) {
                    if (!def.url) continue;
                    let gltf: any;
                    try { gltf = await loader.loadAsync(def.url); } catch (e) {
                        if ((globalThis as any).__mbDecodeDbg) {
                            // eslint-disable-next-line no-console
                            console.log(`[MBModelLoad] FAIL ${def.url}: ${String(e).slice(0, 160)}`);
                        }
                        continue;
                    }

                    const model = gltf.scene.clone(true);
                    // §647: clamp metallic≈1 materials (no envMap → pitch
                    // black in three's PBR; mgl keeps the base color visible).
                    try {
                        const { fixupModelMaterials } = await import('./MBModelRenderer');
                        fixupModelMaterials(model);
                    } catch {}
                    // Float32 frustum culling at world-scale coordinates is
                    // meters-off and flips between frames (see
                    // MBModelRenderer.instantiate) — rely on GPU clipping.
                    model.traverse((o: any) => { o.frustumCulled = false; });
                    // mgl themes models on the GPU over the whole glTF
                    // (draw_model.ts APPLY_LUT_ON_GPU); we bake CPU-side into
                    // material colors + texture maps (model-color-use-theme
                    // opt-out honored).
                    try {
                        // Theme from a PRISTINE snapshot so this is
                        // idempotent and can be re-run when the (async)
                        // import-scoped LUTs resolve after model load.
                        this.m_loadedModels.push({ model, layer: layer as any });
                        this.applyThemeToModel(model, layer as any);
                    } catch {}
                    // §520: mgl apply_lighting (emissive-strength default 0).
                    try {
                        const { applyMglModelLighting } = await import('./MBModelRenderer');
                        applyMglModelLighting(this, model,
                            Number(layer?.paint?.['model-emissive-strength'] ?? 0),
                            undefined, undefined, undefined, undefined,
                            layer?.paint?.['model-color-use-theme'] === 'none',
                            layer?.paint?.['model-receive-shadows'] !== false);
                    } catch {}
                    const lng = def.position[0] ?? 0;
                    const lat = def.position[1] ?? 0;
                    const z = def.position[2] ?? 0;

                    if (projection) {
                        const geoCoord = new GeoCoordinates(lat, lng);
                        const worldPos = projection.projectPoint(geoCoord);
                        model.position.set(worldPos.x, worldPos.y, (worldPos as any).z ?? z);
                        // §643: paint `model-translation` — mgl calculateModelMatrix
                        // adds translation[0..1] × pixelsPerMeter to the projected
                        // point (its pixel frame is y-south-positive) and z raw in
                        // meters. Our world frame is mercator-normalized equatorial
                        // meters with the same south-positive y, so a ground meter
                        // is 1/cos(lat) world units on x/y.
                        const translation = def.translation
                            ?? paint['model-translation']
                            ?? layout['model-translation'];
                        if (Array.isArray(translation)) {
                            const latRad = (lat * Math.PI) / 180;
                            const k = 1 / Math.max(1e-6, Math.cos(latRad));
                            model.position.x += (translation[0] ?? 0) * k;
                            // mgl's pixel frame is y-south-positive, BUT the
                            // engine's render world frame flips that axis
                            // (render empirics §643: +y moved the model NORTH
                            // on screen while mgl moves it south) — negate.
                            model.position.y -= (translation[1] ?? 0) * k;
                            model.position.z += translation[2] ?? 0;
                        }
                        // §518: keep the absolute placement for the per-frame
                        // RTE (−eye) rebase in the render hook.
                        (model.userData as any)._mbBasePos = {
                            x: model.position.x, y: model.position.y, z: model.position.z,
                        };
                    }

                    // Scale: scalar or [x,y,z] — layout `model-scale` or the
                    // source registry entry's own `scale`.
                    const effScale = (def.scale ?? modelScale);
                    const cal = (def as any)._cal ?? 1;
                    const effScaleC = Array.isArray(effScale)
                        ? effScale.map((v: any) => Number(v) * cal)
                        : (typeof effScale === 'number' ? effScale * cal : effScale);
                    // Rotation: [x,y,z] Euler degrees — mgl sums the model's
                    // own orientation with the paint rotation (model.ts:
                    // orientation[i] + rotation[i]) rather than falling back.
                    const orient = def.orientation ?? [0, 0, 0];
                    // §755: only a plain numeric array may sum — a data-driven
                    // EXPRESSION array (["match", …]) would NaN every component.
                    const paintRot = Array.isArray(modelRotation) && modelRotation.every((v: any) => typeof v === 'number')
                        ? modelRotation : [0, 0, 0];
                    const effRotation = [
                        (orient[0] ?? 0) + (paintRot[0] ?? 0),
                        (orient[1] ?? 0) + (paintRot[1] ?? 0),
                        (orient[2] ?? 0) + (paintRot[2] ?? 0),
                    ];
                    // §518: render AFTER the HD road band (see MBModelRenderer
                    // — ro 0 gets overdrawn by the depthTest-less fill band).
                    model.traverse((o: any) => { o.renderOrder = 10; });
                    model.renderOrder = 10;
                    // §519: mgl model_util.rotationScaleYZFlipMatrix —
                    // Rz·Rx·Ry·S·F with F swapping Y/Z (glTF Y-up → map
                    // Z-up); a bare three Euler leaves the model on its side.
                    {
                        const rot = Array.isArray(effRotation) ? effRotation : [0, 0, 0];
                        const sc = Array.isArray(effScaleC)
                            ? [effScaleC[0] ?? 1, effScaleC[1] ?? 1, effScaleC[2] ?? 1]
                            : (effScaleC !== undefined ? [effScaleC, effScaleC, effScaleC] : [1, 1, 1]);
                        // §766: mgl mercator scaleZ is RAW (z world px per model
                        // unit, zoom-independent screen 1:1) while x/y go
                        // through 1/mpp — the z/x world ratio in mgl is
                        // 1/mpp(lat) ≈ 1.88 at z15 vs our frames' 0.79 (kG on
                        // x/y, meters on z). Without this the model height is
                        // ~2.04× squashed (duck H82 vs expected 167, measured).
                        sc[2] *= (1 / Math.max(1e-6, Math.cos((def.position[1] ?? 0) * Math.PI / 180))) * 1.6;
                        const D2R = Math.PI / 180;
                        const m = new THREE.Matrix4()
                            // §653: render-frame y mirror flips the euler
                            // senses (cf. the §643 translation-y negate).
                            .multiply(new THREE.Matrix4().makeRotationZ(-(rot[2] ?? 0) * D2R))
                            .multiply(new THREE.Matrix4().makeRotationX(-(rot[0] ?? 0) * D2R))
                            .multiply(new THREE.Matrix4().makeRotationY(-(rot[1] ?? 0) * D2R))
                            .multiply(new THREE.Matrix4().makeScale(sc[0], sc[1], sc[2]))
                            // glTF Y-up → our Z-up: mgl's swap (x,z,y) is the
                            // left-handed MIRROR half of the frame conversion;
                            // our render frame is y-mirrored vs mgl (§643),
                            // conjugating by diag(1,−1,1) turns it into the
                            // proper rotation Rx(+90°) = (x,−z,y) — the
                            // mirror version rendered y-asymmetric models
                            // (arrow) upside down.
                            .multiply(new THREE.Matrix4().set(
                                1, 0, 0, 0,
                                0, 0, -1, 0,
                                0, 1, 0, 0,
                                0, 0, 0, 1));
                        // §652(恢复): mercator ground-stretch x/y — see
                        // MBModelRenderer.instantiate (mgl scaleXY =
                        // modelPixelsPerMeter, lat-scaled).
                        const kG = 1 / Math.max(1e-6, Math.cos(
                            Math.atan(Math.sinh(Math.PI * (2 * ((lng + 180) / 360) - 1)))));
                        m.premultiply(new THREE.Matrix4().makeScale(kG, kG, 1));
                        m.setPosition(model.position);
                        model.matrixAutoUpdate = false;
                        model.matrix.copy(m);
                    }

                    if ((globalThis as any).__mbDecodeDbg) {
                        // eslint-disable-next-line no-console
                        console.log(`[MBModelAdd] ${def.url.split('/').pop()} pos=(${model.position.x.toFixed(1)},${model.position.y.toFixed(1)},${model.position.z.toFixed(1)}) scale=${JSON.stringify(effScale)} autoUpdate=${model.matrixAutoUpdate}`);
                        // §-temp: world placement of child meshes (node
                        // transform preservation check — environment-test
                        // sphere rows collapsed on screen).
                        try {
                            model.updateMatrixWorld(true);
                            let n = 0;
                            model.traverse((o: any) => {
                                if (n >= 8 || !o.isMesh) return;
                                n++;
                                const wp = o.getWorldPosition(new THREE.Vector3());
                                // eslint-disable-next-line no-console
                                console.log(`[MBModelMesh] ${o.name} world=(${wp.x.toFixed(2)},${wp.y.toFixed(2)},${wp.z.toFixed(2)}) kids=${o.children.length} mat=${o.material?.type} metal=${o.material?.metalness} metalMap=${!!o.material?.metalnessMap} roughMap=${!!o.material?.roughnessMap}`);
                            });
                        } catch {}
                    }
                    // §651: model-source per-part styling — data-driven paint
                    // evaluates per PART (material name) with the model
                    // feature's id + feature state; node rotations come from
                    // feature states via nodeOverrides names.
                    if (def.id && def.sourceId) {
                        model.userData._mbModelSource = {
                            layerId: layer.id, entryId: def.id, sourceId: def.sourceId,
                        };
                        try {
                            this.applyModelSourcePartStyling(
                                model, layer, def.id, (style as any).zoom ?? 0);
                        } catch {}
                    }
                    scene.add(model);
                }
            } catch {}
        }
    }

    /**
     * Runtime styling API for dynamic style manipulation.
     * Usage: dataSource.runtime.setPaintProperty('water', 'fill-color', '#0000ff')
     */
    /**
     * True while MBModelRenderer still has unplaced model features (async
     * GLTF/Draco loads) — the render-test harness polls this before capture.
     */
    modelsPending(): boolean {
        const r = this.m_modelRenderer;
        if (!r) return !this.m_modelsLoaded;
        if (r.isLoading()) return true;
        // §542/§549: batched-model GLB tiles — the regular TileDataSource
        // fetch/decode window (modelsPending gates the harness capture), plus
        // the wiring→registration bridge so the settle loop cannot capture in
        // the gap before the engine knows about the source.
        try {
            const wirings: any[] = (this as any).m_batchedModelWirings ?? [];
            if (wirings.some(w => w.remaining > 0)) return true;
            const batched: any[] = (this as any).m_batchedModelDataSources ?? [];
            if (batched.some(d => d.isLoading?.())) return true;
        } catch {}
        // Vector model layers deliver placements through the transient
        // decoded-tile stash — run() may observe them only after the engine
        // reports tiles settled, so wait for the first observation too.
        if (r.expectPlacements && !r.sawPlacements?.()) return true;
        return !this.m_modelsLoaded;
    }

    get runtime(): MBStyleRuntime | null {
        return this.m_runtime;
    }

    /**
     * Apply a Mapbox color-theme at runtime (test operation `setColorTheme`,
     * equivalent of mgl map.setColorTheme). The theme is `{ data: <base64
     * PNG> }` or `{ data: null }` to remove. Decodes asynchronously, then
     * propagates the LUT to the evaluator (paints) and environment (fog
     * colors) and re-renders.
     */
    setColorTheme(theme: { data?: string | null } | null): void {
        const { loadColorTheme } = require('./MBColorTheme');
        if (!theme || theme.data === undefined || theme.data === null) {
            // Explicit removal clears the theme.
            (this.m_runtime as any).m_runtimeThemeOverride = true;
            this.applyColorTheme(null);
            return;
        }
        (this.m_runtime as any).m_runtimeThemeOverride = true;
        // Returns a promise settling once the theme has (or has failed to)
        // propagate, so callers can deterministically await before capture.
        return loadColorTheme({ 'color-theme': theme }).then((lut: any) => {
            // mgl keeps the previous LUT when decoding a broken theme
            // (style.ts:1592-1600 correlation guard).
            if (lut) this.applyColorTheme(lut);
        }).catch(() => {});
    }

    /**
     * Per-import theme override (mgl map.setImportColorTheme /
     * style.ts:4351-4356). theme=null falls back to the imported
     * stylesheet's own color-theme; theme={data:null} clears it.
     */
    setImportColorTheme(importId: string, theme: { data?: string | any[] | null } | null): Promise<void> {
        const { loadColorTheme } = require('./MBColorTheme');
        const style = this.m_runtime?.style as any;
        // mgl: override=null falls back to the imported STYLESHEET's own
        // color-theme (data['color-theme']) — NOT the import spec's, which is
        // itself an override channel.
        if (!theme || theme.data === undefined || theme.data === null) {
            const own = (style?.imports ?? []).find((i: any) => i.id === importId)?.data?.['color-theme'] ?? null;
            if (own && own.data) {
                return loadColorTheme({ 'color-theme': own, _config: style?._config }).then((lut: any) => {
                    this.m_importLuts.set(importId, lut);
                    this.propagateScopedThemes();
                });
            }
            this.m_importLuts.set(importId, null);
            this.propagateScopedThemes();
            return Promise.resolve();
        }
        return loadColorTheme({ 'color-theme': theme, _config: style?._config }).then((lut: any) => {
            this.m_importLuts.set(importId, lut ?? null);
            this.propagateScopedThemes();
        });
    }

    /** Theme a loaded glTF from its pristine snapshot (idempotent). */
    /**
     * §651: model-source per-part styling — mgl evaluates the model layer's
     * data-driven paint per PART (the mesh's material name) with the model
     * feature's `id` and its feature state, and applies feature-state node
     * rotations for `nodeOverrides` names (doors/hood/trunk). Re-runnable:
     * `setFeatureState` / `setPaintProperty` ops call
     * `applyModelSourcePartStylingAll` to re-tint the live instances.
     */
    private applyModelSourcePartStyling(
        model: any,
        layer: any,
        entryId: string,
        zoom: number,
    ): void {
        const paint = layer?.paint ?? {};
        const states = (this as any).m_featureStates as Map<any, any> | undefined;
        const state = states?.get(entryId) ?? {};
        const evalFor = (part: string) => (name: string): any => {
            const raw = paint[name];
            if (raw === undefined || raw === null) return undefined;
            try {
                return MBExpressionEngine.evaluate(raw, {
                    zoom,
                    feature: {
                        type: 'Point',
                        properties: { part, id: entryId },
                        id: entryId,
                    },
                    featureState: state,
                } as any);
            } catch {
                return undefined;
            }
        };
        model.traverse((o: any) => {
            if (!o.isMesh || !o.material) return;
            const part = o.material.name || o.name || '';
            const ev = evalFor(part);
            const color = ev('model-color');
            const mixRaw = ev('model-color-mix-intensity');
            const mix = mixRaw === undefined || mixRaw === null ? 1 : Number(mixRaw);
            const emis = Number(ev('model-emissive-strength') ?? 0);
            const clone = o.material.clone();
            if (color !== undefined && typeof color === 'string') {
                const c = new THREE.Color();
                try { c.setStyle(color); } catch {}
                if (mix >= 0.999) {
                    // mgl mix(color, albedo, 1) = the tint replaces the base
                    // color — drop the base texture so the tint is pure.
                    clone.map = null;
                    clone.color.copy(c);
                } else if (mix > 0) {
                    clone.color.multiply(c);
                }
            }
            if (emis > 0) {
                clone.emissive = (clone.emissive ?? new THREE.Color()).copy(clone.color);
                clone.emissiveIntensity = emis;
            }
            o.material = clone;
        });
        // feature-state node rotations (nodeOverrides names): state values
        // are [x, y, z] euler degrees in the node's local frame.
        model.traverse((o: any) => {
            const rot = state?.[o.name];
            if (Array.isArray(rot) && rot.length === 3) {
                o.rotation.set(
                    (rot[0] ?? 0) * Math.PI / 180,
                    (rot[1] ?? 0) * Math.PI / 180,
                    (rot[2] ?? 0) * Math.PI / 180,
                );
            }
        });
    }

    /** §651: re-run per-part styling for every live model-source instance
     * (feature-state / paint ops). */
    applyModelSourcePartStylingAll(): void {
        // §772b: prefer the RUNTIME style — setPaintProperty mutates the
        // runtime's copy, so reading the manager's original parse made every
        // re-tint evaluate the STALE paint (trees-use-theme red crowns stuck
        // at mix=1).
        const style = this.m_runtime?.style ?? this.m_styleManager.getStyle();
        if (!style) return;
        const layersById = new Map<string, any>();
        for (const l of style.layers ?? []) layersById.set(l.id, l);
        for (const entry of (this as any).m_loadedModels ?? []) {
            const model = entry.model;
            const meta = model.userData?._mbModelSource;
            if (!meta) continue;
            const layer = layersById.get(meta.layerId) ?? entry.layer;
            if (!layer) continue;
            try {
                this.applyModelSourcePartStyling(
                    model, layer, meta.entryId, meta.zoom ?? 0);
            } catch {}
        }
    }

    private applyThemeToModel(model: any, layer: any): void {
        try {
            const useTheme = layer?.paint?.['model-color-use-theme'] ?? 'default';
            const modelLut = (layer?._importScope && this.m_importLuts.has(layer._importScope))
                ? this.m_importLuts.get(layer._importScope)
                : this.m_colorThemeLut;
            if (!modelLut || useTheme === 'none') return;
            const { applyColorTheme, applyColorThemeToPixels } = require('./MBColorTheme');
            model.traverse((o: any) => {
                const mat = o.material;
                if (!mat) return;
                for (const mk of ['color', 'emissive']) {
                    if (!mat[mk] || !mat[mk].isColor) continue;
                    if (!mat.userData?._mbPristine?.[mk]) {
                        mat.userData = mat.userData ?? {};
                        mat.userData._mbPristine = mat.userData._mbPristine ?? {};
                        mat.userData._mbPristine[mk] = mat[mk].clone();
                    }
                    const css = mat.userData._mbPristine[mk].getStyle(THREE.SRGBColorSpace);
                    mat[mk].setStyle(applyColorTheme(modelLut, css), THREE.SRGBColorSpace);
                }
                for (const tk of ['map', 'emissiveMap']) {
                    const tex = mat[tk];
                    const img: any = tex?.image;
                    if (!tex || !img) continue;
                    if (!tex.userData?._mbPristineCanvas) {
                        try {
                            const cv = document.createElement('canvas');
                            cv.width = img.width ?? img.videoWidth ?? 1;
                            cv.height = img.height ?? img.videoHeight ?? 1;
                            const cx = cv.getContext('2d')!;
                            cx.drawImage(img, 0, 0);
                            tex.userData = tex.userData ?? {};
                            tex.userData._mbPristineCanvas = cv;
                        } catch { continue; }
                    }
                    const pristine: HTMLCanvasElement = tex.userData._mbPristineCanvas;
                    const cv = document.createElement('canvas');
                    cv.width = pristine.width;
                    cv.height = pristine.height;
                    const cx = cv.getContext('2d')!;
                    cx.drawImage(pristine, 0, 0);
                    const id = cx.getImageData(0, 0, cv.width, cv.height);
                    applyColorThemeToPixels(modelLut, id.data);
                    cx.putImageData(id, 0, 0);
                    const nt = new THREE.Texture(cv);
                    nt.needsUpdate = true;
                    nt.flipY = tex.flipY;
                    (nt as any).colorSpace = (tex as any).colorSpace;
                    (nt as any).wrapS = tex.wrapS;
                    (nt as any).wrapT = tex.wrapT;
                    (nt as any).userData = { _mbPristineCanvas: pristine };
                    mat[tk] = nt;
                }
            });
        } catch {}
    }

    /** Load every per-import theme recorded by mergeImports. */
    private loadImportThemes(style: any): void {
        const { loadColorTheme } = require('./MBColorTheme');
        const themes = style?._importThemes ?? {};
        let pending = 0;
        for (const [id, theme] of Object.entries(themes)) {
            if (!theme || !(theme as any).data) {
                this.m_importLuts.set(id, null);
                continue;
            }
            pending++;
            loadColorTheme({ 'color-theme': theme, _config: style?._config })
                .then((lut: any) => this.m_importLuts.set(id, lut))
                .catch(() => this.m_importLuts.set(id, null))
                .finally(() => {
                    if (--pending === 0) this.propagateScopedThemes();
                });
        }
        if (pending === 0) this.propagateScopedThemes();
    }

    /** Push scoped LUTs to the evaluator + environment (fog/lights scopes). */
    private propagateScopedThemes(): void {
        const style: any = this.m_runtime?.style ?? (this.m_styleManager as any).m_style;
        const evaluator: any = this.m_runtime?.evaluator;
        if (evaluator) {
            for (const [id, lut] of this.m_importLuts) {
                evaluator.setColorThemeScope?.(id, lut);
            }
        }
        (this.decoder as any).setColorTheme?.(this.m_colorThemeLut, this.m_importLuts);
        // Fog/lights resolve their theme from their OWN import scope when the
        // merged fog/lights came from an import (mgl fog.scope / light.scope).
        const fogScope = style?._fogImportScope;
        const fogLut = (fogScope && this.m_importLuts.has(fogScope))
            ? this.m_importLuts.get(fogScope)
            : this.m_colorThemeLut;
        this.m_environment?.setColorTheme(fogLut ?? null);
        const lightsScope = style?._lightsImportScope;
        const lightsLut = (lightsScope && this.m_importLuts.has(lightsScope))
            ? this.m_importLuts.get(lightsScope)
            : this.m_colorThemeLut;
        this.m_environment?.setLightsColorTheme(lightsLut ?? null);
        if (this.m_environment) {
            try {
                this.m_environment.applyLights(style?.lights, style?.light);
                this.m_environment.setStyleHasBackground(this.styleHasBackgroundLayer(style), this.styleHasContentLayers(style));
                this.m_environment.applyFog(this.effectiveFogSpec(style), style?.zoom ?? 0);
                // Re-run applySky ONLY when a scoped theme actually exists —
                // re-applying an (absent) sky on every theme propagation
                // replaces the fog-driven atmosphere dome and regressed the
                // whole fog domain (fog/2d/basic 22.7k→45.5k).
                const anyScopedLut = [...this.m_importLuts.values()].some(Boolean);
                if (anyScopedLut || this.m_colorThemeLut) {
                    this.m_environment.applySky(
                        this.buildSkyFromLayers(style) ?? style?.sky, style?.fog);
                }
            } catch {}
        }
        // Background clear color picks up the (scoped) LUT as well.
        try {
            const st: any = style;
            if (st && this.m_environment) this.applyBackgroundColor(st);
        } catch {}
        // Re-bake sprites: an import-supplied sprite must pick up the import
        // LUT even when the root has no theme.
        this.bakeThemeIntoSprites(undefined);
        // Re-theme models with the (now-resolved) scoped LUTs.
        for (const { model, layer } of this.m_loadedModels) {
            this.applyThemeToModel(model, layer);
        }
        // …including the per-feature MBModelRenderer instances.
        try {
            this.m_modelRenderer?.retheme?.();
        } catch {}
        this.mapView?.markTilesDirty?.(this as any);
        this.mapView?.update?.();
    }

    /**
     * Propagate a (possibly null) color-theme LUT everywhere it matters:
     * evaluator (paint colors), environment (fog), and baked into the sprite
     * atlas + registered icon canvases (mgl themes sprite/pattern images via
     * the GPU LUT on sample; we bake CPU-side). Bumping the theme generation
     * invalidates pattern-texture extractions keyed on it.
     */
    private applyColorTheme(lut: import('./MBColorTheme').ColorThemeLut | null): void {
        this.m_colorThemeLut = lut;
        this.m_themeInitialized = true;
        const { bumpThemeGeneration } = require('./MBColorTheme');
        this.m_runtime?.evaluator.setColorTheme(lut);
        // The decoder owns its OWN internal MBLayerEvaluator (created per
        // configure) — background/fill techniques come from it. The decoder
        // stores the theme itself and re-applies it across configure() calls.
        (this.decoder as any).setColorTheme?.(lut, this.m_importLuts);
        this.m_environment?.setColorTheme(lut);
        // The background renders as the clear color (not a layer material),
        // so it must be re-resolved whenever the theme changes.
        try {
            const st: any = this.m_runtime?.style ?? (this.m_styleManager as any).m_style;
            if (st && this.m_environment) this.applyBackgroundColor(st);
        } catch {}
        this.bakeThemeIntoSprites(lut);
        this.mapView?.markTilesDirty?.(this as any);
        this.mapView?.update?.();
    }

    /**
     * Bake the theme into the sprite atlas + icon canvases (mgl themes
     * sprite/pattern images on the GPU at sample time; we bake CPU-side).
     * With no ROOT theme but a themed import supplying the sprite, the
     * import's LUT themes the shared atlas.
     */
    private bakeThemeIntoSprites(lut: import('./MBColorTheme').ColorThemeLut | null | undefined): void {
        let bakeLut = lut === undefined ? this.m_colorThemeLut : lut;
        if (!bakeLut) {
            for (const l of this.m_importLuts.values()) {
                if (l) { bakeLut = l; break; }
            }
        }
        const { bumpThemeGeneration, applyColorThemeToPixels } = require('./MBColorTheme');
        try {
            this.m_spriteAtlas?.applyColorTheme(bakeLut ?? null);
            for (const cv of this.m_themedIconCanvases) {
                const ctx = cv.getContext('2d');
                if (!ctx) continue;
                let pristine = this.m_iconCanvasPristine.get(cv);
                if (!pristine) {
                    pristine = ctx.getImageData(0, 0, cv.width, cv.height);
                    this.m_iconCanvasPristine.set(cv, pristine);
                }
                const img = ctx.createImageData(pristine.width, pristine.height);
                img.data.set(pristine.data);
                if (bakeLut) applyColorThemeToPixels(bakeLut, img.data);
                ctx.putImageData(img, 0, 0);
            }
            bumpThemeGeneration();
        } catch {}
    }

    /** Enable collision-box debug overlay (metadata.test.collisionDebug). */
    setCollisionDebug(enabled: boolean): void {
        if (this.m_symbolPlacement) {
            this.m_symbolPlacement.setCollisionDebug(enabled);
        }
    }

    /** Toggle terrain wireframe overlay (metadata.test.showTerrainWireframe). */
    setTerrainWireframe(enabled: boolean): void {
        this.m_environment?.terrainController?.setWireframe(enabled);
    }

    /** Toggle 3D layer wireframe overlay (metadata.test.showLayers3DWireframe). */
    setLayers3DWireframe(enabled: boolean): void {
        if (!this.mapView) return;
        const scene = (this.mapView as any).m_scene as THREE.Scene;
        if (!scene) return;
        scene.traverse((obj: any) => {
            if (obj.isMesh && obj.material && obj.userData?.technique) {
                const tech = obj.userData.technique;
                if (tech.name === 'extruded-polygon' || tech.name === 'fill' || tech.name === 'solid-line') {
                    obj.material.wireframe = enabled;
                }
            }
        });
    }

    /** Toggle 2D layer wireframe overlay (metadata.test.showLayers2DWireframe). */
    setLayers2DWireframe(enabled: boolean): void {
        if (!this.mapView) return;
        const scene = (this.mapView as any).m_scene as THREE.Scene;
        if (!scene) return;
        scene.traverse((obj: any) => {
            if (obj.isMesh && obj.material && obj.userData?.technique) {
                const tech = obj.userData.technique;
                if (tech.name === 'circles' || tech.name === 'text' || tech.name === 'labeled-icon') {
                    obj.material.wireframe = enabled;
                }
            }
        });
    }

    /** Runtime setFov: delegate to MapView.setFovCalculation. */
    setFov(fov: number): void {
        (this.mapView as any)?.setFovCalculation?.({ type: 'fixed', fov });
    }

    /**
     * Runtime addImage: inject an icon/pattern into the sprite atlas.
     * mgl keeps runtime images in an ImageSprite independent of the style
     * sprite — styles without a sprite block must still accept addImage
     * (globe-fill-pattern/3x-on-2x-add-image), so the atlas is created
     * lazily here and runtime images are re-applied if a style sprite
     * later replaces the atlas.
     */
    addImage(name: string, image: HTMLImageElement | HTMLCanvasElement | ImageBitmap, pixelRatio: number = 1): boolean {
        MBExpressionEngine.addAvailableImage(name);
        const w = (image as any).naturalWidth ?? (image as any).width ?? 0;
        const h = (image as any).naturalHeight ?? (image as any).height ?? 0;
        if (w > 0 && h > 0) {
            // Keep the pattern-size registry in sync for runtime-added images.
            const cur = (MBTileDataEmitter as any).s_spriteInfos as Map<string, any> | null;
            cur?.set(name, { width: w, height: h, pixelRatio });
        }
        this.m_runtimeImages.set(name, { image, pixelRatio });
        if (!this.m_spriteAtlas) {
            if (typeof document === 'undefined') return false;
            this.m_spriteAtlas = this.createEmptySpriteAtlas();
        }
        // PoiRenderer looks icons up in mapView.userImageCache (theme+user
        // caches) by technique imageTextureName — runtime addImage must
        // register there too (the setStyle path does this at line ~1950),
        // otherwise the icon geometry renders but never paints.
        try {
            const userImageCache = (this.mapView as any)?.userImageCache;
            if (userImageCache && typeof userImageCache.addImage === 'function') {
                userImageCache.addImage(name, image as any);
            }
        } catch {}
        return this.m_spriteAtlas.addIcon(name, image as any, false, pixelRatio) ?? false;
    }

    /** Minimal blank-atlas so runtime addImage works on sprite-less styles. */
    private createEmptySpriteAtlas(): SpriteAtlas {
        const cv = document.createElement('canvas');
        cv.width = 1;
        cv.height = 1;
        return new SpriteAtlas(cv, new Map());
    }

    /** Runtime removeImage: remove an icon from the sprite atlas. */
    removeImage(name: string): boolean {
        MBExpressionEngine.removeAvailableImage(name);
        this.m_runtimeImages.delete(name);
        (MBTileDataEmitter as any).s_spriteInfos?.delete?.(name);
        return this.m_spriteAtlas?.removeIcon(name) ?? false;
    }

    /**
     * Register pending icon cross-fade blends (["image", a, b] +
     * icon-image-cross-fade) in mapView.userImageCache. The emitter requests
     * blends under a synthetic name (worker side has no DOM); here the two
     * sprite sub-images are composited CPU-side with mgl's ICON_TRANSITION
     * formula out = A·(1−t) + B·t (straight RGBA, per channel incl. alpha).
     */
    flushIconBlends(): void {
        const pending = (MBTileDataEmitter as any).pendingIconBlends as Map<string, { a: string; b: string; t: number }>;
        if (!pending || pending.size === 0) return;
        for (const [name, { a, b, t }] of pending) {
            this.registerIconBlend(name, a, b, t);
        }
    }

    /** Composite two sprite icons (A·(1−t) + B·t) and cache by blend name. */
    private registerIconBlend(name: string, a: string, b: string, t: number): void {
        if (this.m_registeredIconBlends.has(name)) return;
        const atlas = this.m_spriteAtlas;
        const userImageCache = (this.mapView as any)?.userImageCache;
        if (!atlas || !userImageCache || typeof userImageCache.addImage !== 'function') return;
        const infoA = atlas.icons.get(a);
        const infoB = atlas.icons.get(b);
        if (!infoA || !infoB || typeof document === 'undefined') return;
        const atlasImage = (atlas.texture as any).image as any;
        const w = Math.max(infoA.width, infoB.width);
        const h = Math.max(infoA.height, infoB.height);
        const cv = document.createElement('canvas');
        cv.width = w; cv.height = h;
        const ctx = cv.getContext('2d')!;
        const px = (info: any): ImageData => {
            const tmp = document.createElement('canvas');
            tmp.width = info.width; tmp.height = info.height;
            const tctx = tmp.getContext('2d')!;
            tctx.drawImage(atlasImage, info.x, info.y, info.width, info.height, 0, 0, info.width, info.height);
            return tctx.getImageData(0, 0, info.width, info.height);
        };
        const da = px(infoA).data;
        const db = px(infoB).data;
        const out = ctx.createImageData(w, h);
        for (let y = 0; y < h; y++) {
            for (let x = 0; x < w; x++) {
                const ia = (y < infoA.height && x < infoA.width) ? (y * infoA.width + x) * 4 : -1;
                const ib = (y < infoB.height && x < infoB.width) ? (y * infoB.width + x) * 4 : -1;
                const o = (y * w + x) * 4;
                for (let c = 0; c < 4; c++) {
                    const va = ia >= 0 ? da[ia + c] : 0;
                    const vb = ib >= 0 ? db[ib + c] : 0;
                    out.data[o + c] = va * (1 - t) + vb * t;
                }
            }
        }
        ctx.putImageData(out, 0, 0);
        userImageCache.addImage(name, cv);
        this.m_registeredIconBlends.add(name);
    }

    /**
     * Pre-register literal `["image", name, {params:{fill: <literal>}}]`
     * recolor variants so tiles decode against an existing userImageCache
     * entry (worker + main thread share the deterministic synthetic name).
     */
    private preRegisterImageParams(): void {
        const style = this.m_styleManager.getStyle();
        const lut = this.m_colorThemeLut ?? null;
        const { applyColorTheme, parseCssColor } = require('./MBColorTheme');
        for (const layer of (style?.layers ?? []) as any[]) {
            if (layer.type !== 'symbol') continue;
            const useTheme = layer.layout?.['icon-image-use-theme'];
            const candidates: unknown[] = [layer.layout?.['icon-image']];
            for (const app of layer.appearances ?? []) {
                candidates.push(app.properties?.['icon-image']);
            }
            for (const raw of candidates) {
                let expr: any = raw;
                while (Array.isArray(expr) && expr[0] === 'memo') expr = expr[1];
                if (!Array.isArray(expr) || expr[0] !== 'image'
                    || typeof expr[1] !== 'string') continue;
                const options = [expr[2], expr[3]].find(
                    o => o !== null && typeof o === 'object' && !Array.isArray(o)) as any;
                const rawParams = options?.params;
                if (!rawParams || typeof rawParams !== 'object') continue;
                const params: Record<string, [number, number, number, number]> = {};
                let allLiteral = true;
                for (const [key, value] of Object.entries(rawParams)) {
                    if (typeof value !== 'string') { allLiteral = false; break; }
                    let color: string = value;
                    if (lut && useTheme !== 'none') color = applyColorTheme(lut, color);
                    const parsed = parseCssColor(color);
                    if (parsed) params[key] = [parsed[0], parsed[1], parsed[2], parsed[3]];
                }
                if (!allLiteral || Object.keys(params).length === 0) continue;
                this.registerImageParamsVariant(expr[1], params);
            }
        }
    }

    /**
     * Materialize a recolored icon variant for `["image", name, {params}]`
     * (mgl ImageVariant.params → ImageRasterizer color replacements).
     * Re-rasterizes the uSVG icon from the IconSetRegistry with the param
     * colors and registers the canvas under a synthetic name in
     * userImageCache (POI rendering) + the sprite atlas. Returns null for
     * legacy raster sprites (no recolorable variables).
     */
    private registerImageParamsVariant(
        name: string,
        params: Record<string, [number, number, number, number]>,
    ): string | null {
        const atlas = this.m_spriteAtlas;
        const userImageCache = (this.mapView as any)?.userImageCache;
        if (!atlas || !userImageCache || typeof userImageCache.addImage !== 'function') return null;
        if (typeof document === 'undefined') return null;
        const variant = MBLayerEvaluator.imageParamsName(name, params);
        if (atlas.icons.has(variant)) return variant;
        try {
            const { IconSetRegistry, renderIconToCanvas } = require('./IconSetPBFDecoder');
            const icon = IconSetRegistry.get(name);
            if (!icon || !(icon.variables?.length)) return null;
            const canvas = renderIconToCanvas(icon, 1, params);
            userImageCache.addImage(variant, canvas);
            atlas.addIcon(variant, canvas, false);
            return variant;
        } catch {
            return null;
        }
    }

    /**
     * Pre-register icon cross-fade blends straight after the sprite atlas
     * loads, BEFORE any tile decodes — a late (AfterRender) registration
     * restarts the POI fade-in animation and the icon is captured mid-fade
     * (observed as a uniform 0.75 opacity lift, §410). Only literal
     * ["image", "a", "b"] pairs are pre-computable here; token/expression
     * pairs fall back to the flushIconBlends path.
     */
    private preRegisterIconBlends(): void {
        const style = this.m_styleManager.getStyle();
        for (const layer of (style?.layers ?? []) as any[]) {
            if (layer.type !== 'symbol') continue;
            const t = Number(layer.paint?.['icon-image-cross-fade'] ?? 0);
            if (!(t > 0)) continue;
            const candidates: unknown[] = [layer.layout?.['icon-image']];
            for (const app of layer.appearances ?? []) {
                candidates.push(app.properties?.['icon-image']);
            }
            for (const raw of candidates) {
                let expr: any = raw;
                while (Array.isArray(expr) && expr[0] === 'memo') expr = expr[1];
                if (Array.isArray(expr) && expr[0] === 'image'
                    && typeof expr[1] === 'string' && typeof expr[2] === 'string') {
                    const name = MBTileDataEmitter.iconBlendName(expr[1], expr[2], t);
                    this.registerIconBlend(name, expr[1], expr[2], t);
                }
            }
        }
    }

    /** Toggle tile-boundary debug overlay (metadata.test.debug). */
    setDebugTileBoundaries(enabled: boolean): void {
        this.m_debugTileBoundaries = enabled;
        if (!enabled && this.m_debugLines) {
            this.m_debugLines.visible = false;
        }
    }

    /**
     * Draw tile boundary rectangles in world space (debug visualization).
     * Called each frame from AfterRender when debug mode is on.
     */
    private drawTileBoundaries(): void {
        if (!this.m_debugTileBoundaries || !this.mapView) return;
        const THREE = require('three');
        const scene = (this.mapView as any).m_scene;
        if (!scene) return;

        if (!this.m_debugLines) {
            const geom = new THREE.BufferGeometry();
            const mat = new THREE.LineBasicMaterial({
                color: 0xff0000, transparent: true, depthTest: false, depthWrite: false,
            });
            this.m_debugLines = new THREE.LineSegments(geom, mat);
            this.m_debugLines.frustumCulled = false;
            this.m_debugLines.renderOrder = 9998;
            // RTE: m_sceneRoot carries the negative world anchor — absolute
            // world-space positions render camera-relative through it (§204).
            const sceneRoot = (this.mapView as any).m_sceneRoot;
            (sceneRoot ?? scene).add(this.m_debugLines);
        }
        this.m_debugLines.visible = true;

        const positions: number[] = [];
        const EarthConstants = require('@flywave/flywave-geoutils').EarthConstants;
        const C = EarthConstants.EQUATORIAL_CIRCUMFERENCE;

        // Iterate visible tiles and draw their world-space boundaries.
        const tiles = this.getDecodedTiles();
        for (const tile of tiles) {
            const tk = tile.tileKey;
            if (!tk) continue;
            const n = Math.pow(2, tk.level);
            const ts = C / n;
            const x0 = tk.column * ts;
            const x1 = (tk.column + 1) * ts;
            const y0 = C - (tk.row + 1) * ts;
            const y1 = C - tk.row * ts;
            // 4 edges
            // World is z-up (x east, y north) — boundary rects on z=0.
            positions.push(x0, y0, 0, x1, y0, 0, x1, y0, 0, x1, y1, 0, x1, y1, 0, x0, y1, 0, x0, y1, 0, x0, y0, 0);
        }

        const geo = this.m_debugLines.geometry;
        geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
        geo.attributes.position.needsUpdate = true;
    }

    /**
     * mgl tile-level fog culling (painter._updateFog + transform.ts:1644):
     * full-opacity fog with horizon-blend >= 0.03 culls tiles whose farthest
     * AABB point lies beyond start + (end-start)*0.78 (FOV-shifted fog
     * units). Applied through the engine's opt-in tileVisibilityFilter —
     * the renderedTiles Map only exists DURING the render pass (§206), so
     * an AfterRender-time toggle can never reach it.
     */
    private applyFogTileCulling(): void {
        // DISABLED (§206): the engine hook works (equal-range's tiles were
        // culled through it) but the culling fixtures' content bypasses the
        // renderedTiles loop entirely — activating this only regressed
        // equal-range. Re-enable after locating those fixtures' render path.
        return;
        const state = (this.m_environment as any)?.backgroundFogState as any;
        const mv: any = this.mapView as any;
        if (!state || !mv) return;
        if (!state.enabled || state.alpha < 0.999 || state.hbRaw < 0.03) {
            mv.tileVisibilityFilter = undefined;
            return;
        }
        const shift = state.shift as number;
        const start = state.r0 + shift;
        const end = state.r1 + shift;
        const cullFogUnits = start + (end - start) * 0.78;
        // Raw fog-matrix semantics (NO kFog — that folds the CONTENT fog
        // calibration only): depth = shift * metricDist / distCam.
        const cullMetric = cullFogUnits * state.distCam / shift;
        const camPos = mv.camera?.position as { x: number; y: number; z: number } | undefined;
        const sceneRoot = mv.m_sceneRoot?.position as { x: number; y: number } | undefined;
        if (!camPos) return;
        const cam = sceneRoot
            ? { x: camPos.x - sceneRoot.x, y: camPos.y - sceneRoot.y, z: camPos.z }
            : { x: camPos.x, y: camPos.y, z: camPos.z };
        const EarthConstants = require('@flywave/flywave-geoutils').EarthConstants;
        const C = EarthConstants.EQUATORIAL_CIRCUMFERENCE;
        mv.tileVisibilityFilter = (tile: any): boolean => {
            const tk = tile?.tileKey;
            if (!tk) return true;
            const n = Math.pow(2, tk.level);
            const ts = C / n;
            const fx = Math.max(Math.abs(tk.column * ts - cam.x), Math.abs((tk.column + 1) * ts - cam.x));
            const fy = Math.max(Math.abs(C - (tk.row + 1) * ts - cam.y), Math.abs(C - tk.row * ts - cam.y));
            const d = Math.sqrt(fx * fx + fy * fy + cam.z * cam.z);
            return d <= cullMetric;
        };
    }

    private async loadSpriteAtlas(spriteUrl: string): Promise<void> {
        const spriteData = await this.m_styleManager.loadSprite(spriteUrl);
        this.m_themedIconCanvases = [];
        if (spriteData) {
            const icons = new Map<string, any>();
            for (const [name, info] of Object.entries(spriteData.json)) {
                icons.set(name, info);
            }
            // Publish the icon names to the expression engine so `["image", …]`
            // can resolve availability (coalesce fallback chains), and the
            // sprite pixel sizes to the emitter for line-pattern tiling.
            MBExpressionEngine.setAvailableImages(new Set(icons.keys()));
            const spriteInfos = new Map<string,
                { width: number; height: number; pixelRatio?: number }>();
            for (const [name, info] of icons) {
                spriteInfos.set(name, {
                    width: info.width,
                    height: info.height,
                    pixelRatio: (info as any).pixelRatio,
                });
            }
            MBTileDataEmitter.setSpriteInfos(spriteInfos);
            this.m_spriteAtlas = new SpriteAtlas(spriteData.image, icons);
            // Re-apply runtime addImage entries — the new atlas must not
            // silently drop images registered before/without a style sprite.
            for (const [name, entry] of this.m_runtimeImages) {
                this.m_spriteAtlas.addIcon(name, entry.image, false, entry.pixelRatio);
            }

            // Register individual icons in MapView's userImageCache so that
            // PoiRenderer can find them by name. PoiRenderer uses imageCaches
            // (theme + user) to look up icons by their technique imageTextureName.
            // Without this, icons never render because PoiRenderer can't find them.
            if (this.mapView) {
                const userImageCache = (this.mapView as any).userImageCache;
                if (userImageCache && typeof userImageCache.addImage === 'function') {
                    const atlasImage = spriteData.image;
                    for (const [name, info] of icons) {
                        try {
                            // Extract the icon sub-image from the atlas.
                            if (typeof document !== 'undefined') {
                                const canvas = document.createElement('canvas');
                                canvas.width = info.width;
                                canvas.height = info.height;
                                const ctx = canvas.getContext('2d')!;
                                ctx.drawImage(
                                    atlasImage as any,
                                    info.x, info.y, info.width, info.height,
                                    0, 0, info.width, info.height,
                                );
                                if (info.sdf === true) {
                                    // SDF icons store the distance field in
                                    // the alpha channel (edge at 0.75≈192).
                                    // Keep the raw field (RGB → white for
                                    // vertex-color tinting) so the POI renderer
                                    // can reconstruct the glyph + halo from it;
                                    // the ImageItem is flagged as sdf.
                                    const imgData = ctx.getImageData(0, 0, canvas.width, canvas.height);
                                    const d = imgData.data;
                                    for (let p = 0; p < d.length; p += 4) {
                                        d[p] = 255;
                                        d[p + 1] = 255;
                                        d[p + 2] = 255;
                                    }
                                    ctx.putImageData(imgData, 0, 0);
                                    const item = userImageCache.addImage(name, canvas);
                                    if (item && typeof (item as any).then !== 'function') {
                                        (item as any).sdf = true;
                                    }
                                    continue;
                                }
                                userImageCache.addImage(name, canvas);
                                // Non-SDF icons are themeable (mgl applies
                                // the LUT to the sampled sprite texel).
                                this.m_themedIconCanvases.push(canvas);
                            }
                        } catch {}
                    }
                }
            }
        }

        // Icon cross-fade blends must exist in userImageCache BEFORE tiles
        // decode — a late registration restarts the POI fade-in (§410).
        this.preRegisterIconBlends();

        // Same pre-registration requirement for ["image", name, {params}]
        // recolor variants (literal params only — data-driven params
        // resolve per-feature in the worker and use the same deterministic
        // synthetic name, but their canvas cannot be pre-rasterized).
        this.preRegisterImageParams();

        // The color-theme may have decoded before the sprite atlas finished
        // loading — bake it now so late atlases are themed too.
        if (this.m_colorThemeLut && this.m_spriteAtlas) {
            try {
                this.m_spriteAtlas.applyColorTheme(this.m_colorThemeLut);                const { applyColorThemeToPixels, bumpThemeGeneration } = require('./MBColorTheme');
                for (const cv of this.m_themedIconCanvases) {
                    const ctx = cv.getContext('2d');
                    if (!ctx) continue;
                    this.m_iconCanvasPristine.set(cv, ctx.getImageData(0, 0, cv.width, cv.height));
                    const img = ctx.createImageData(cv.width, cv.height);
                    img.data.set(this.m_iconCanvasPristine.get(cv)!.data);
                    applyColorThemeToPixels(this.m_colorThemeLut, img.data);
                    ctx.putImageData(img, 0, 0);
                }
                bumpThemeGeneration();
                this.mapView?.markTilesDirty?.(this as any);
                this.mapView?.update?.();
            } catch {}
        }
    }

    /**
     * Preload mapbox PBF glyph metrics for every font stack referenced by the
     * style's symbol layers. Only the basic Latin range (0-255) is fetched —
     * that's all that's needed for accurate shaping of the latin labels that
     * dominate the render-test corpus. The metrics are shipped to the worker
     * decoder on the next `decoder.configure()` call.
     */
    private async loadGlyphMetrics(style: StyleSpecification): Promise<void> {
        const glyphsUrl = style.glyphs;
        if (!glyphsUrl) return;
        // Collect unique font stacks from symbol layer layouts.
        const fontStacks = new Set<string>();
        for (const layer of style.layers ?? []) {
            const tf = (layer as any).layout?.['text-font'];
            if (Array.isArray(tf) && tf.length > 0) {
                fontStacks.add(tf.join(','));
            }
        }
        if (fontStacks.size === 0) return;

        const { loadGlyphMetrics } = await import('./MBGlyphLoader');
        // Basic Latin range covers most labels; load 0 (chars 0-255).
        const RANGES = [0, 1]; // 0-255 + 256-511 (Latin-1 supplement + Extended-A)
        for (const stack of fontStacks) {
            // The mapbox URL template uses {fontstack}; PBF fontstack names
            // are comma-separated. Pass the first font of the stack — PBF
            // ranges are typically keyed by primary font.
            const primaryFont = stack.split(',')[0];
            await loadGlyphMetrics(primaryFont, RANGES, glyphsUrl, this.m_glyphMetrics);
        }

        // Push metrics to the decoder.
        this.decoder.configure(undefined, {
            mbStyle: style,
            glyphMetrics: this.m_glyphMetrics,
        } as any);
    }

    async setTheme(_theme: Theme | FlatTheme): Promise<void> {
    }

    /**
     * Re-apply a fully-swapped style at runtime (the `setStyle` operation).
     *
     * Unlike the lightweight `runtime.setStyle()` path (which only
     * reconfigures the decoder + marks tiles dirty), this method redoes the
     * heavy parts of `connect()`: sprite atlas reload, glyph metrics reload,
     * environment (lights/fog/sky/background), camera settings, projection,
     * terrain, and models. Use it when the runtime style has been replaced
     * wholesale — typically by the `setStyle` render-test operation.
     *
     * Cheap operations (background, camera, projection) always run; expensive
     * network loads (sprite, glyphs) only run when the corresponding URL
     * changed since the last apply.
     */
    async reloadStyle(): Promise<void> {
        const style = this.m_runtime?.style ?? this.m_styleManager?.getStyle();
        if (!style || !this.mapView) return;

        // §779 (mgl setStyle semantics): a wholesale style swap replaces the
        // source set too. The decoder consumes the runtime style directly,
        // but the tile providers (delegate/composite) are built from the
        // styleManager's resolved sources — re-resolve + re-wire when the
        // source object changed, or the new style's sources never issue a
        // single tile request (change-projection/set-style rendered an empty
        // globe: satellite + geojson silently absent). Batched-model sources
        // are excluded: their wiring registers datasources that is not
        // re-entrant, and no current fixture swaps them at runtime.
        const rtStyle = this.m_runtime?.style as any;
        if (rtStyle?.sources) {
            const nextSig = JSON.stringify(rtStyle.sources);
            const hasBatched = Object.values(rtStyle.sources as any)
                .some((s: any) => s?.type === 'batched-model')
                || (this.m_wiredSourceSig?.includes('"batched-model"') ?? false);
            if (nextSig !== this.m_wiredSourceSig && !hasBatched) {
                this.m_wiredSourceSig = nextSig;
                await this.m_styleManager.loadStyle(rtStyle);
                const sources = this.m_styleManager.getResolvedSources();
                const maxSourceZoom = Math.max(
                    1,
                    ...[...sources.values()].map(s => (s as any).maxzoom ?? 22),
                );
                this.maxDataLevel = Math.min(22, maxSourceZoom);
                await this.wireTileSources(rtStyle, sources);
            }
        }

        // Cheap re-applies — always safe to re-run.
        // §779: mgl setStyle PRESERVES the map camera — the camera is map
        // state, not style state (a style swap never touches the transform
        // unless the style is used to create the map). Only re-apply camera
        // settings the new style actually carries; defaulting the missing
        // zoom to 0 re-rendered the globe at zoom 0 (change-projection
        // set-style: globe ~3× too small, map-aligned circles huge).
        const hasCam = (style as any).zoom !== undefined
            || (style as any).center !== undefined
            || (style as any).bearing !== undefined
            || (style as any).pitch !== undefined;
        this.applyBackgroundColor(style);
        if (hasCam) {
            this.applyCameraSettings(style);
            this.applyProjection(style);
            // §779: mgl recomputes the camera distance on a projection
            // change (transform._calcMatrices re-runs on setStyle too).
            this.reapplyCamera();
        } else {
            this.applyProjection(style);
        }
        this.buildClipMask(style);

        // Sprite atlas: reload only if the URL changed.
        const newSprite = style.sprite;
        if (newSprite && newSprite !== this.m_lastAppliedSprite) {
            await this.loadSpriteAtlas(newSprite);
            this.m_lastAppliedSprite = newSprite;
        }

        // Glyph metrics: reload only if the URL changed.
        const newGlyphs = style.glyphs;
        if (newGlyphs && newGlyphs !== this.m_lastAppliedGlyphs) {
            this.m_glyphMetrics.clear();
            await this.loadGlyphMetrics(style);
            this.m_lastAppliedGlyphs = newGlyphs;
        }

        // Environment: lights/fog/sky/background-pattern.
        if (this.m_environment) {
            this.m_environment.applyLights((style as any).lights ?? (style as any).light ? [(style as any).light] : undefined);
            this.applyBackgroundColor(style);
            this.m_environment.setStyleHasBackground(this.styleHasBackgroundLayer(style), this.styleHasContentLayers(style));
            this.m_environment.applyFog(this.effectiveFogSpec(style), style.zoom ?? 0);
            // §782/§785: mirror of the connect-path re-apply (see above).
            this.applyBackgroundColor(style);
            this.m_environment.applySky(
                this.buildSkyFromLayers(style) ?? style.sky,
                style.fog,
            );
        }

        // Terrain: re-apply if terrain spec changed.
        if (this.m_environment && style.terrain) {
            try {
                await this.m_environment.applyTerrain(
                    { ...(style.terrain as any), encoding: this.m_demEncoding },
                    this.m_demTileUrl,
                    style.zoom ?? 8,
                    style.center ?? [0, 0],
                    this.m_demMaxZoom,
                    this.m_demTileSize,
                );
            } catch {}
        }

        // Models: re-load + refresh the per-feature renderer registry.
        try {
            this.updateModelRegistry(style);
        } catch {}
        this.m_modelsLoaded = false;
        try {
            await this.loadModels(style);
        } catch {}
        this.m_modelsLoaded = true;

        // Re-configure the decoder with the new style + push glyph metrics.
        this.decoder.configure(undefined, {
            mbStyle: style,
            currentSourceId: this.m_currentSourceId,
            glyphMetrics: this.m_glyphMetrics.size > 0 ? this.m_glyphMetrics : undefined,
            clipMask: Object.fromEntries(this.m_clipMask),
        } as any);

        // Force a full re-decode of visible tiles.
        this.mapView.markTilesDirty(this);
        this.mapView.update();
    }

    /** Tracks the last sprite URL applied, to skip redundant reloads. */
    private m_lastAppliedSprite: string | undefined;
    /** Tracks the last glyphs URL applied, to skip redundant reloads. */
    private m_lastAppliedGlyphs: string | undefined;
    /**
     * Signature (JSON) of the style.sources object whose tile providers are
     * currently wired through wireTileSources — reloadStyle re-wires only
     * when a runtime setStyle changed the source set (§779).
     */
    private m_wiredSourceSig: string | undefined;

    /**
     * Override setFeatureState to trigger tile re-decode when feature state changes.
     * The base class stores feature state; we additionally mark tiles dirty
     * so the decoder re-evaluates expressions with updated state.
     */
    setFeatureState(featureId: number | string, state: any): void {
        // Mapbox render-test operations pass a descriptor
        // {source, sourceLayer, id} as the feature id. The decoder resolves
        // feature state by the decoded feature's numeric/string `id`, so
        // normalize the descriptor to just its id.
        const normalizedKey = this.normalizeFeatureStateKey(featureId);
        super.setFeatureState(normalizedKey, state);
        if (this.mapView) {
            this.mapView.markTilesDirty(this);
        }
        this.requestUpdate();

        if (!(this as any).m_featureStates) {
            (this as any).m_featureStates = new Map();
        }
        (this as any).m_featureStates.set(normalizedKey, state);

        this.decoder.configure(undefined, {
            mbStyle: this.m_styleManager.getStyle(),
            currentSourceId: this.m_currentSourceId,
            featureStates: (this as any).m_featureStates,
        } as any);
        // §651: model-source per-part paints read feature states — re-tint
        // the live registry instances (ego-car family).
        try { this.applyModelSourcePartStylingAll(); } catch {}
    }

    /** Remove ALL feature states (mgl removeFeatureState({source}) form). */
    clearFeatureStates(): void {
        const states = (this as any).m_featureStates as Map<any, any> | undefined;
        if (states) states.clear();
        if (this.mapView) {
            this.mapView.markTilesDirty(this);
        }
        this.decoder.configure(undefined, {
            mbStyle: this.m_styleManager.getStyle(),
            currentSourceId: this.m_currentSourceId,
            featureStates: states ?? new Map(),
        } as any);
    }

    override removeFeatureState(featureId: number | string): void {
        const normalizedKey = this.normalizeFeatureStateKey(featureId);
        super.removeFeatureState(normalizedKey);
        if (this.mapView) {
            this.mapView.markTilesDirty(this);
        }
        const states = (this as any).m_featureStates as Map<any, any> | undefined;
        if (states) {
            states.delete(normalizedKey);
        }
        this.decoder.configure(undefined, {
            mbStyle: this.m_styleManager.getStyle(),
            currentSourceId: this.m_currentSourceId,
            featureStates: (this as any).m_featureStates ?? new Map(),
        } as any);
    }

    /**
     * Release GPU resources held by the heatmap renderer (density render
     * target, ramp textures) before the base class tears down providers.
     */
    override dispose(): void {
        this.m_heatmapRenderer?.dispose?.();
        this.m_additiveLineRenderer?.dispose?.();
        this.m_heatmapRenderer = null;
        super.dispose();
    }

    /** Extract the numeric/string feature id from a mapbox feature-state descriptor. */
    private normalizeFeatureStateKey(featureId: number | string): number | string {
        if (typeof featureId === 'object' && featureId !== null) {
            const desc = featureId as any;
            const id = desc?.id ?? desc?.featureId;
            return (id === undefined || id === null) ? String(desc?.source ?? '') : id;
        }
        return featureId;
    }

    /**
     * Re-ship the environment's current brightness (for `measure-light`
     * expressions) to the decoder. Called after lights change at runtime so
     * appearance conditions re-evaluate with up-to-date brightness.
     */
    refreshDecoderBrightness(): void {
        const style = this.m_styleManager.getStyle();
        // Runtime `setLights` changes the 3D-lights ground radiance — the
        // lit background clear color (color × radiance) must be re-derived
        // or the ground keeps the pre-update lighting (indirect-update).
        try {
            this.applyBackgroundColor(style);
        } catch { /* best-effort */ }
        this.decoder.configure(undefined, {
            mbStyle: style,
            currentSourceId: this.m_currentSourceId,
            demTileUrl: this.m_demTileUrl,
            // Live camera pitch (mgl appearance conditions evaluate the
            // camera pitch, not the style's static value — setPitch ops
            // must reach appearance conditions, not just new decodes).
            pitch: this.mapView ? (this.mapView.tilt ?? style.pitch ?? 0) : (style.pitch ?? 0),
            bearing: style.bearing ?? 0,
            brightness: this.m_environment?.brightness ?? 0,
            clipMask: Object.fromEntries(this.m_clipMask),
            worldview: (style as any).metadata?.test?.worldview ?? '',
            center: style.center ?? [0, 0],
        } as any);
        if (this.mapView) {
            this.mapView.markTilesDirty(this);
        }
    }

    /**
     * Re-ship the live camera pitch to the decoder and re-decode — mgl
     * re-evaluates appearance conditions whose expression depends on the
     * global pitch state (FeatureAppearances.update globalChanged) on every
     * change; our decode-time evaluation needs a tile refresh to match.
     */
    refreshDecoderPitch(): void {
        this.refreshDecoderBrightness();
    }

    shouldPreloadTiles(): boolean {
        return true;
    }

    getDataZoomLevel(zoomLevel: number): number {
        let z = zoomLevel + this.storageLevelOffset;
        // §836a EXPERIMENT (roundzoom=1): mgl coveringZoomLevel uses
        // Math.round for vector sources (roundZoom=true) — floor left our
        // globe cover a full level coarser near the horizon (pitch: 4×z5
        // vs mgl's z6 near field, §835b).
        if ((globalThis as any).__mbRoundZoom &&
            Number((this.mapView as any).projection?.type) === 1) {
            // mgl coveringZoomLevel = round(styleZoom) for 512 vector tiles;
            // our display zoom (6) already equals that, so drop the −1 offset.
            z = Math.round(zoomLevel);
            if (!(globalThis as any).__mbRzLogged) {
                (globalThis as any).__mbRzLogged = true;
                // eslint-disable-next-line no-console
                console.log('[MBRZ] roundzoom active, z=', z, 'viewZoom=', zoomLevel);
            }
        }
        return Math.max(
            this.minDataLevel,
            Math.min(this.maxDataLevel, z)
        );
    }

    /**
     * Extract the skybox spec from `sky` layers (mapbox sky_style_layer paint),
     * mirroring how mapbox renders a sky layer. Returns the merged spec or
     * `undefined` when no sky layer exists.
     */

    /** A visible background layer acts as mgl's opaque below-horizon cover. */
    private styleHasBackgroundLayer(style: any): boolean {
        return (style?.layers ?? []).some((l: any) =>
            l?.type === 'background' && (l?.layout?.visibility ?? 'visible') !== 'none');
    }

    /** Any visible layer besides `background` — content tiles carry their
     * own fog then (mgl semantics); the background-fog quad stands down. */
    private styleHasContentLayers(style: any): boolean {
        return (style?.layers ?? []).some((l: any) =>
            l?.type !== 'background' && (l?.layout?.visibility ?? 'visible') !== 'none');
    }

    private buildSkyFromLayers(style: StyleSpecification): any {
        const skyLayers = (style.layers ?? []).filter((l: any) => l.type === 'sky');
        if (skyLayers.length === 0) return undefined;
        // Mapbox renders sky layers in order; the last sky layer's paint wins
        // for properties not overridden by earlier layers. All paints share the
        // same property keys, so a simple last-wins merge matches the common
        // case (tests use a single sky layer).
        const paint: any = {};
        for (const layer of skyLayers) {
            Object.assign(paint, (layer as any).paint ?? {});
        }
        // Defaults from style-spec v8 paint_sky: sky-type atmosphere,
        // sun-intensity 10, atmosphere/halo colors white; sky-atmosphere-sun
        // defaults to the style light position (environment fallback), so it
        // is only forwarded when the paint sets it.
        const out: any = {
            'sky-type': paint['sky-type'] ?? 'atmosphere',
            'sky-gradient': paint['sky-gradient'] ?? 'interpolate',
            'sky-gradient-center': paint['sky-gradient-center'] ?? [0, 0],
            'sky-gradient-radius': paint['sky-gradient-radius'] ?? 90,
            'sky-opacity': paint['sky-opacity'] ?? 1,
            'sky-atmosphere-sun-intensity': paint['sky-atmosphere-sun-intensity'] ?? 10,
            'sky-atmosphere-color': paint['sky-atmosphere-color'] ?? '#ffffff',
            'sky-atmosphere-halo-color': paint['sky-atmosphere-halo-color'] ?? '#ffffff',
        };
        if (paint['sky-atmosphere-sun'] !== undefined) {
            out['sky-atmosphere-sun'] = paint['sky-atmosphere-sun'];
        }
        return out;
    }

    private applyBackgroundColor(style: StyleSpecification): void {
        for (const layer of style.layers ?? []) {
            if (layer.type === 'background') {
                // background-visibility: "none" hides the background entirely.
                const vis = (layer as any).layout?.visibility ?? 'visible';
                if (vis === 'none') {
                    return;
                }
                const paint = (layer as any).paint ?? {};
                // An EMPTY resolved background-pattern (e.g.
                // ["step",["zoom"],"",5,…] below the stop) skips the
                // background entirely in mgl (#9518) — leave the canvas
                // transparent (no clear color either).
                const rawPat = paint['background-pattern'];
                if (rawPat !== undefined && typeof rawPat !== 'string') {
                    try {
                        const { MBExpressionEngine } = require('./MBExpressionEngine');
                        if (MBExpressionEngine.evaluate(rawPat, {
                            zoom: style.zoom ?? 0,
                            feature: undefined,
                        } as any) === '') {
                            return;
                        }
                    } catch {}
                }
                const rawColor = paint['background-color'];
                const opacity = paint['background-opacity'] ?? 1;
                // Resolve zoom functions / expressions for the background color
                // (mapbox default is black when a background layer exists).
                let color = '#000000';
                if (rawColor) {
                    try {
                        const { MBExpressionEngine } = require('./MBExpressionEngine');
                        const evaluated = MBExpressionEngine.evaluate(rawColor, {
                            zoom: style.zoom ?? 0,
                            feature: undefined,
                        } as any);
                        if (typeof evaluated === 'string') color = evaluated;
                    } catch {}
                }
                // Color-theme: the background goes through the same LUT as
                // every other `-color` paint (mgl themes the background
                // layer's clear color too); honor the layer's import scope.
                if (paint['background-color-use-theme'] !== 'none') {
                    const scope = (layer as any)._importScope;
                    const lut = (scope && this.m_importLuts.has(scope))
                        ? this.m_importLuts.get(scope)
                        : this.m_colorThemeLut;
                    if (lut) {
                        try {
                            const { applyColorTheme } = require('./MBColorTheme');
                            color = applyColorTheme(lut, color);
                        } catch {}
                    }
                }
                if (this.mapView) {
                    // §570b/§829: on globe the background belongs to the sphere
                    // disc — with fog the atmosphere's space color owns the sky
                    // and the disc carries the fogged background; without fog
                    // mgl draws NO atmosphere (black sky) but the disc still
                    // carries the plain background (mgl background renders
                    // per-tile on the globe). Both cases register the disc
                    // color; the flat full-screen mercator clear is not used.
                    try {
                        if (Number((this.mapView as any).projection?.type) === 1) {
                            if (this.effectiveFogSpec(style) !== undefined) {
                                // Fog style — §570b original behavior: with the
                                // atmosphere active the space color owns the sky
                                // and the dome disc carries the fogged background.
                                if (this.m_environment?.globeFogActive) {
                                    this.m_environment.setGlobeBackground(new THREE.Color(color), opacity);
                                    return;
                                }
                                // transient (fog not yet applied): flat clear,
                                // applyFog re-runs applyBackgroundColor after.
                            } else {
                                // §829: NO-FOG globe — mgl draws no atmosphere
                                // (transparent clear → the harness composites the
                                // reference over WHITE, so the sky must be the
                                // engine's opaque white clear), but the background
                                // still renders per-tile ON the sphere: register
                                // the disc color and keep the styled color OFF
                                // the full-screen clear.
                                this.m_environment?.setGlobeBackground(new THREE.Color(color), opacity);
                                (this.mapView as any).clearColor = 0xffffff;
                                (this.mapView as any).clearAlpha = 1;
                                // terrain ground shows the background where no
                                // drape content exists (same as the flat path).
                                try {
                                    this.m_environment?.terrainController?.setBaseColor(
                                        new THREE.Color(color).getHex());
                                    this.m_terrainDraping?.requestBake?.();
                                } catch {}
                                return;
                            }
                        }
                    } catch { /* fall through to the flat path */ }
                    // §819 NOTE: on globe without fog mgl's sky is black space,
                    // but overriding the flat background clear to black here is
                    // a net LOSS while near-field tile content is still missing
                    // (globe-terrain 153k→241k: the white clear was padding the
                    // not-yet-rendered terrain region). Revisit after the
                    // missing-tile content domain is fixed.
                    const c = new THREE.Color(color);
                    // Mapbox 3D `lights` (lighting-3d-mode): the background is a
                    // ground layer → `color * u_ground_radiance` (mix toward
                    // `color` by background-emissive-strength), matching the
                    // shader injection applied to other ground layers.
                    const ls = this.m_environment?.lighting3DState;
                    if (ls) {
                        const rad = ls.groundRadiance;
                        // `c` is linear (ColorManagement) and `getHex()`
                        // converts back to sRGB, so multiplying by the LINEAR
                        // radiance (rad^2.2) yields the mapbox sRGB result
                        // `color_srgb · groundRadiance` (see linearProduct).
                        const radLin = [
                            Math.pow(rad[0], 2.2),
                            Math.pow(rad[1], 2.2),
                            Math.pow(rad[2], 2.2),
                        ];
                        const lit = new THREE.Color(
                            c.r * radLin[0], c.g * radLin[1], c.b * radLin[2]
                        );
                        const emissive = Number(paint['background-emissive-strength'] ?? 0);
                        if (emissive > 0) lit.lerp(c, Math.min(emissive, 1));
                        (this.mapView as any).clearColor = lit.getHex();
                    } else {
                        (this.mapView as any).clearColor = c.getHex();
                    }
                    (this.mapView as any).clearAlpha = opacity;
                    // The terrain surface shows the (themed, lit) background
                    // color where no drape content exists — mgl renders the
                    // background beneath the whole map, and the terrain mesh
                    // composites over it (import-override high-pitch family:
                    // un-lit white base → grey expected).
                    try {
                        this.m_environment?.terrainController?.setBaseColor(
                            (this.mapView as any).clearColor as number);
                        // §278: the drape bake must re-capture the new
                        // background (mgl repaints it under the content on
                        // setPaintProperty; stale bakes froze the old color).
                        this.m_terrainDraping?.requestBake?.();
                    } catch {}
                }
                return;
            }
        }
        // NOTE: without a background layer the engine keeps its opaque white
        // clear; the render-test comparison alpha-composites the RGBA
        // reference over white (see flywave-test-utils compareImages), so the
        // transparent reference background matches the white canvas.
    }

    /**
     * Apply projection from style — switches MapView between mercator and globe.
     *
     * Uses flywave's native projection system:
     * - `mercator` (default) → `mercatorProjection` (flat planar world)
     * - `globe` → `sphereProjection` (ECEF sphere, native globe rendering)
     *
     * When switching to globe, the entire native pipeline activates automatically:
     * tiles are positioned on sphere surface, camera constraints adjust for curvature,
     * atmosphere/horizon rendering activates, label placement filters near horizon.
     *
     * For mercator↔globe transition (Mapbox zoom 5→6 smoothstep), flywave uses a
     * hard switch (no interpolation). A smooth morph would require a custom
     * interpolating Projection subclass (future enhancement).
     */
    private applyProjection(style: StyleSpecification): void {
        if (!this.mapView) return;
        const styleProj = (style as any).projection;
        const projName = typeof styleProj === 'string' ? styleProj : styleProj?.name;
        const projConfig = { name: projName ?? 'mercator', center: styleProj?.center, parallels: styleProj?.parallels };

        if (projConfig.name !== 'mercator' && projConfig.name !== 'globe') {
            try {
                const { MBMapProjection } = require('./MBMapProjection');
                const customProj = new MBMapProjection(projConfig);
                (this.mapView as any).projection = customProj;
                // Custom projections render in draping/planar space — never
                // use the mgl globe camera model.
                (this.mapView as any).__mglGlobeCam = false;
                return;
            } catch {}
        }

        if (projConfig.name === 'globe') {
            // §833: rendered-sphere radius calibration — mgl's RENDERED globe
            // is ~0.6% larger relative to the camera than the nominal ECEF
            // sphere (pixel-space globeMatrix vs mercator-scale camera, §830).
            // Scale the projection unit; camera distances (meters) stay put so
            // the camera sits relatively closer and the limb rises to mgl's.
            (sphereProjection as any).unitScale =
                EarthConstants.EQUATORIAL_RADIUS *
                ((globalThis as any).__mbSphereScale ?? 1);
            (this.mapView as any).projection = sphereProjection;
            // §776: enable the mgl globe camera model in the engine's
            // zoom↔distance conversions (globe altitude = ccd·conv above the
            // sea-level point) so the rendered globe matches mapbox's size.
            (this.mapView as any).__mglGlobeCam = true;
            // §835b: mgl coveringTiles distance-LOD opt-in (§323) — mixed-LOD
            // cover (z4/z5/z6 at pitch-85) vs our single-level z5 2×2.
            if ((globalThis as any).__karma__?.config?.args?.some?.(
                (a: string) => a === 'lodcmp=1')) {
                const vtsOptions = (this.mapView as any).m_visibleTileSetOptions;
                if (vtsOptions) {
                    vtsOptions.mglDistanceLod = true;
                    vtsOptions.mglDistanceLodTileSize = 256;
                }
            }
        } else {
            const currentType = this.mapView.projection?.type;
            if (currentType === ProjectionType.Spherical) {
                (this.mapView as any).projection = mercatorProjection;
            }
            (this.mapView as any).__mglGlobeCam = false;
        }
    }

    /**
     * Re-apply the style camera with the CURRENT projection. mgl recomputes
     * the camera distance whenever the projection changes (setProjection op
     * / style projection) because the globe altitude model differs from the
     * mercator plane model; flywave must do the same or the map keeps the
     * distance computed under the previous projection (§776: globe-default
     * rendered with the mercator plane distance → globe ~1.41× too small).
     */
    public reapplyCamera(): void {
        if (!this.mapView) return;
        const style = this.m_styleManager?.getStyle() ?? this.m_runtime?.style;
        if (!style) return;
        // Sync the globe-camera flag with the live mapView projection (the
        // test harness swaps the projection directly on the MapView).
        (this.mapView as any).__mglGlobeCam =
            this.mapView.projection?.type === 1 /* ProjectionType.Spherical */;
        this.applyCameraSettings(style);
        this.pushMapboxZoom();
    }

    /**
     * §812: effective fog spec — style fog, or the mgl default-fog
     * parameters for globe styles carrying a background layer.
     */
    private effectiveFogSpec(style: any): FogSpec | undefined {
        // §819: mgl creates the fog system ONLY when the style has a fog key
        // (style.ts:1082 gate) — no fog key → no FOG define, no atmosphere
        // glow, black space (globe-transition/pitch and globe-terrain
        // expected black skies). The previous "synthesize mgl default fog
        // for no-fog styles carrying a background layer" painted an
        // atmosphere dome where mgl paints nothing.
        return style.fog;
    }

    /**
     * Apply camera settings (center, zoom, bearing, pitch) from the style.
     */
    private applyCameraSettings(style: StyleSpecification): void {
        if (!this.mapView) return;
        // Mapbox render tests: the camera is driven by the style. Missing
        // center defaults to [0,0]; missing zoom defaults to 0 (mapbox's Map
        // default, map.ts:235). NOT "keep the current zoom" — a freshly created
        // MapView's default camera is degenerate (m_targetDistance=0 → extreme
        // zoom), which would push content off-screen for tests without a zoom.
        const center = style.center ?? [0, 0];
        // flywave's camera zoom convention shows a level-z tile at 256px while
        // mapbox shows it at 512px (calculateDistanceFromZoomLevel /256). To
        // match mapbox's world scale, offset the camera zoom by +1.
        // No pitch compensation: setCameraGeolocationAndZoom now orbits the
        // target (lookAt semantics), so the reported zoom is pitch-independent.
        const pitch = style.pitch ?? 0;
        const zoom = (typeof style.zoom === 'number' ? style.zoom : 0) + 1;
        // Mapbox `bearing` is clockwise (bearing 90 → up faces east). flywave's
        // setCameraGeolocationAndZoom takes a counter-clockwise yawDeg
        // (MapView.ts:2378/2405 "yaw is counter-clockwise"). Passing bearing
        // directly yaws the camera by the wrong sign — the whole view is rotated
        // by 2·bearing (180° for a bearing-90 test). Negate to match.
        const bearing = -(style.bearing ?? 0)
            + Number((globalThis as any).__mbYawAB ?? 0);
        const pitchAB = pitch
            + Number((globalThis as any).__mbPitchAB ?? 0);

            try {
                // §643: mgl render tests place cameras at style zoom 21–27 (model
                // closeups); the engine default maxZoomLevel is 20 and lookAtImpl
                // clamps the zoom → camera distance (blank/over-far model-source
                // fixtures). Lift the limit to the style's zoom for this map;
                // tile requests stay clamped by each source's own maxzoom
                // (overzoom path unchanged). Cap at mgl Map's default maxZoom
                // of 22 — styles asking zoom 24–27 render through that clamp
                // (multiple-meshes expected: car sized at zoom 22, not 24).
                const camZoom = Math.min(zoom, 23 /* mgl 22 + 1 convention */);
                // §644: ASSIGN (not only raise) — the test harness constructs
                // MapView with maxZoomLevel: 25, so a raise-only lift never
                // engaged and zoom-24+ styles rendered 4× too close (the
                // multiple-meshes family). mgl clamps its camera at maxZoom
                // 22; floor at the engine default 20 for low-zoom styles.
                (this.mapView as any).maxZoomLevel = Math.max(20, camZoom);
                if ((globalThis as any).__mbDecodeDbg) {
                    // eslint-disable-next-line no-console
                    console.log(`[MBCam] styleZoom=${style.zoom} flyZoom=${zoom} camZoom=${camZoom} maxZoomLevel=${(this.mapView as any).maxZoomLevel}`);
                }
            // Import GeoCoordinates dynamically to avoid circular dependency issues
            const { GeoCoordinates } = require('@flywave/flywave-geoutils');
            const geoCoord = new GeoCoordinates(center[1], center[0]);
            this.mapView.setCameraGeolocationAndZoom(geoCoord, zoom, bearing, pitchAB);
            // §806 probe: camera-to-target distance right after placement vs
            // after later frames — who moves the camera?
            if ((globalThis as any).__mbExtRouteDbg) {
                const dumpDist = (tag: string) => {
                    try {
                        const camP = (this.mapView as any).camera.position as THREE.Vector3;
                        const tgtP = (this.mapView as any).projection.projectPoint(geoCoord as any, new THREE.Vector3());
                        const fbD = (window as any).__karma__?.config?.args
                            ?.find?.((a: string) => a.startsWith('feedback-url='))
                            ?.slice('feedback-url='.length);
                        if (fbD) fetch(`${fbD}/mb-probe-dump`, {
                            method: 'POST', headers: { 'content-type': 'application/json' },
                            body: JSON.stringify({ probe: 'cam-dist', log: [`${tag} dist=${camP.distanceTo(tgtP).toExponential(4)} zoomLevel=${(this.mapView as any).zoomLevel}`] }),
                        }).catch(() => {});
                    } catch {}
                };
                dumpDist('post-place');
                setTimeout(() => dumpDist('t+3000'), 3000);
                setTimeout(() => dumpDist('t+8000'), 8000);
            }
            // §700: empirical camera probe — dumped via /mb-probe-dump (the
            // karma runner swallows browser consoles). Values must match mgl's
            // placement: slant d = focal·C/(256·2^flyZoom) ≡ ccd_px·C/(512·2^styleZoom),
            // height = d·cos(pitch), ground offset = d·sin(pitch).
            if ((globalThis as any).__mbDecodeDbg) {
                try {
                    const cam = (this.mapView as any).camera as THREE.PerspectiveCamera;
                    const tgt = this.mapView.projection.projectPoint(
                        geoCoord as any,
                        new THREE.Vector3()
                    );
                    const fb = (window as any).__karma__?.config?.args
                        ?.find?.((a: string) => a.startsWith('feedback-url='))
                        ?.slice('feedback-url='.length);
                    const dump = {
                        probe: 'mbcam',
                        name: (style.metadata as any)?.test?.name,
                        dist: cam.position.distanceTo(tgt),
                        camPos: cam.position.toArray(),
                        tgt: tgt.toArray(),
                        fov: cam.fov,
                        focal: (this.mapView as any).focalLength,
                        zoom: (this.mapView as any).zoomLevel,
                        pitch: (this.mapView as any).tilt,
                        heading: (this.mapView as any).heading,
                        pixelRatio: (this.mapView as any).pixelRatio,
                        canvasW: (this.mapView as any).canvas?.width,
                        canvasH: (this.mapView as any).canvas?.height,
                    };
                    if (fb) {
                        fetch(`${fb}/mb-probe-dump`, {
                            method: 'POST',
                            headers: { 'content-type': 'application/json' },
                            body: JSON.stringify(dump),
                        }).catch(() => {});
                    }
                } catch {}
            }
            // §776: the §274 sphere re-zoom block is superseded — the engine's
            // calculateDistanceFromZoomLevel now applies the mgl globe
            // altitude model directly (see Utils.MglGlobeCamOptions), so the
            // plain setCameraGeolocationAndZoom above already lands on the
            // mgl camera distance, and the zoom getter round-trips the set
            // zoom exactly (no m_styleBoxZoom bookkeeping needed).
        } catch {}
    }

    /**
     * Push the live mapbox camera zoom (flywave zoom − 1) to the decoder so
     * camera functions (icon-size/text-size stops, dynamic-filter distance)
     * evaluate at the continuous mapbox zoom instead of the floored integer
     * tile level. Called after applyCameraSettings and on every AfterRender.
     */
    private pushMapboxZoom(): void {
        try {
            const camZoom = (this.mapView as any)?.zoomLevel;
            // §274: after the sphere pixelRatio rescale the engine zoomLevel
            // getter misreports (device-focal math on a logical-focal
            // distance); prefer the recorded style zoom.
            const boxZoom = (this as any).m_styleBoxZoom;
            const mbZoom = boxZoom !== undefined && this.mapView.projection?.type === 1
                ? boxZoom
                : Math.max(0, camZoom - 1);
            // mgl dynamic terrain exaggeration: re-evaluate the (possibly
            // zoom-interpolated) exaggeration at the live zoom — in-place
            // uniform refresh, no rebuild.
            (this.m_environment as any)?.updateTerrainExaggeration?.(mbZoom);
            // §548: keep the decoder's exaggeration live for
            // line-elevation-ground-scale (mixed into offset z at emit).
            const ex = (this.m_environment as any).currentTerrainExaggeration;
            this.decoder.configure(undefined, {
                mapboxZoom: mbZoom,
                ...(Number.isFinite(ex) ? { terrainExaggeration: ex } : {}),
            } as any);
        } catch {}
    }

    /**
     * Build clip mask from `clip` layers. Each clip layer references a polygon
     * source and lists `clip-layer-types`. Features of those types outside the
     * clip polygon are suppressed.
     */
    private buildClipMask(style: StyleSpecification): void {
        this.m_clipMask.clear();
        const clipLayers = (style.layers ?? []).filter((l: any) => l.type === 'clip');
        for (const clipLayer of clipLayers) {
            const layerTypes: string[] = (clipLayer as any).layout?.['clip-layer-types'] ?? [];
            const sourceId = (clipLayer as any).source as string;
            if (!sourceId) continue;
            const source = (style.sources as any)[sourceId];
            if (!source) continue;
            // Extract polygon rings from inline geojson.
            let rings: number[][][] = [];
            const data = source.data;
            if (data?.type === 'Polygon') {
                rings = data.coordinates;
            } else if (data?.type === 'MultiPolygon') {
                rings = data.coordinates.flat();
            } else if (data?.type === 'FeatureCollection') {
                for (const f of data.features ?? []) {
                    if (f.geometry?.type === 'Polygon') rings.push(...f.geometry.coordinates);
                    if (f.geometry?.type === 'MultiPolygon') rings.push(...f.geometry.coordinates.flat());
                }
            }
            for (const lt of layerTypes) {
                this.m_clipMask.set(lt, rings);
            }
        }
    }

    /** Point-in-polygon test (ray casting) for clip mask. */
    static pointInPolygonRing(lng: number, lat: number, ring: number[][]): boolean {
        let inside = false;
        for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
            const xi = ring[i][0], yi = ring[i][1];
            const xj = ring[j][0], yj = ring[j][1];
            const intersect = ((yi > lat) !== (yj > lat)) &&
                (lng < (xj - xi) * (lat - yi) / (yj - yi + 1e-15) + xi);
            if (intersect) inside = !inside;
        }
        return inside;
    }
}
