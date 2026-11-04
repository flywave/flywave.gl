/* Copyright (C) 2025 flywave.gl contributors */

import {
    type Projection,
    type TilingScheme,
    EarthConstants,
    geographicStandardTiling,
    geographicTerrainStandardTiling,
    OrientedBox3,
    ProjectionType,
    TileKey,
    TileKeyUtils
} from "@flywave/flywave-geoutils";
import { assert } from "@flywave/flywave-utils";
import * as THREE from "three/webgpu";

import { type DataSource } from "./DataSource";
import {
    type ElevationRange,
    type ElevationRangeSource,
    CalculationStatus
} from "./ElevationRangeSource";
import { MapTileCuller } from "./MapTileCuller";
import { type MapView } from "./MapView";
import { MapViewUtils } from "./Utils";

const tmpVectors3 = [
    new THREE.Vector3(),
    new THREE.Vector3(),
    new THREE.Vector3(),
    new THREE.Vector3()
];
const tmpVector4 = new THREE.Vector4();

/** WGS84 polar radius, derived from the equatorial radius and the inverse flattening. */
const POLAR_RADIUS = EarthConstants.EQUATORIAL_RADIUS * (1 - 1 / 298.257223563);

/**
 * World-space bounds of a tile projected once and reused across frames.
 *
 * The projection of a tile's geo box only depends on the box itself, the
 * elevation range and the data source geometry heights - never on the camera -
 * so the result is cached per (tiling scheme, tile key, wrap offset) and
 * re-validated against the altitudes it was computed with on every frame.
 */
interface ProjectedBoundsCacheEntry {
    bounds: OrientedBox3 | THREE.Box3;
    /** Final minimum altitude (elevation range + minGeometryHeight) the bounds were projected with. */
    minAltitude: number;
    /** Final maximum altitude (elevation range + maxGeometryHeight) the bounds were projected with. */
    maxAltitude: number;
}

/** Cap for the projected-bounds cache; on overflow the oldest half is dropped. */
const MAX_PROJECTED_BOUNDS_CACHE_ENTRIES = 60000;

/**
 * Copies tile bounds between same-typed bound objects. Target and source are
 * always the same concrete type within a projection (the cache is keyed by the
 * projection instance and cleared when it changes).
 */
function copyTileBounds(
    target: OrientedBox3 | THREE.Box3,
    source: OrientedBox3 | THREE.Box3
): void {
    if (target instanceof THREE.Box3) {
        target.copy(source as THREE.Box3);
    } else {
        target.copy(source as OrientedBox3);
    }
}

/**
 * Represents a unique TileKey and the area it takes up on screen.
 *
 * Note, in certain tiling projections, it is possible to have an offset, which represents a tile
 * which has fully wrapped around, hence this defaults to 0 to simplify usage for projections which
 * don't require it.
 */
export class TileKeyEntry {
    constructor(
        public tileKey: TileKey,
        public area: number,
        public offset: number = 0,
        public elevationRange?: ElevationRange,
        public distance: number = 0
    ) {}
}

function getGeoBox(tilingScheme: TilingScheme, childTileKey: TileKey, offset: number) {
    const geoBox = tilingScheme.getGeoBox(childTileKey);
    const longitudeOffset = 360.0 * offset;
    geoBox.northEast.longitude += longitudeOffset;
    geoBox.southWest.longitude += longitudeOffset;
    return geoBox;
}

/**
 * Map tile keys to TileKeyEntry.
 * Keys are a combination of morton code and tile offset,
 * see [[TileOffsetUtils.getKeyForTileKeyAndOffset]].
 */
type TileKeyEntries = Map<number, TileKeyEntry>;

/**
 * Map zoom level to map of visible tile key entries
 */
type ZoomLevelTileKeyMap = Map<number, TileKeyEntries>;

/**
 * Result of frustum intersection
 */
interface IntersectionResult {
    /**
     * Tiles intersected by the frustum per zoom level.
     */
    readonly tileKeyEntries: ZoomLevelTileKeyMap;

    /**
     * True if the intersection was calculated using precise elevation data, false if it's an
     * approximation.
     */
    calculationFinal: boolean;
}

/**
 * Computes the tiles intersected by the frustum defined by the current camera setup.
 */
export class FrustumIntersection {
    private readonly m_frustum: THREE.Frustum = new THREE.Frustum();
    // used to project global coordinates into camera local coordinates
    private readonly m_viewProjectionMatrix = new THREE.Matrix4();
    private readonly m_mapTileCuller: MapTileCuller;
    private m_rootTileKeys: TileKeyEntry[] = [];
    private readonly m_tileKeyEntries: ZoomLevelTileKeyMap = new Map();

    /** Per tiling scheme: tile key morton code -> wrap offset -> cached projection. */
    private readonly m_projectedBoundsCache: Map<
        TilingScheme,
        Map<number, Map<number, ProjectedBoundsCacheEntry>>
    > = new Map();
    private m_projectedBoundsCacheSize: number = 0;
    /** Projection instance the projected-bounds cache was built with. */
    private m_projectedBoundsCacheProjection: Projection | undefined;

    constructor(
        private readonly m_camera: THREE.PerspectiveCamera,
        readonly mapView: MapView,
        private readonly m_extendedFrustumCulling: boolean,
        private readonly m_tileWrappingEnabled: boolean,
        private readonly m_enableMixedLod: boolean,
        private readonly m_tilePixelSize: number = 256
    ) {
        this.m_mapTileCuller = new MapTileCuller(m_camera);
    }

    /**
     * Return camera used for generating frustum.
     */
    get camera(): THREE.PerspectiveCamera {
        return this.m_camera;
    }

    /**
     * Return projection used to convert geo coordinates to world coordinates.
     */
    get projection(): Projection {
        return this.mapView.projection;
    }

    /**
     * Return frustum used to compute intersected tiles.
     */
    get frustum(): THREE.Frustum {
        return this.m_frustum;
    }

    /**
     * Updates the frustum to match the current camera setup.
     */
    updateFrustum(projectionMatrixOverride?: THREE.Matrix4) {
        this.m_viewProjectionMatrix.multiplyMatrices(
            projectionMatrixOverride !== undefined
                ? projectionMatrixOverride
                : this.m_camera.projectionMatrix,
            this.m_camera.matrixWorldInverse
        );

        this.m_frustum.setFromProjectionMatrix(this.m_viewProjectionMatrix);

        if (this.m_extendedFrustumCulling) {
            this.m_mapTileCuller.setup();
        }
        this.computeRequiredInitialRootTileKeys(this.m_camera.position);
    }

    /**
     * Computes the tiles intersected by the updated frustum, see [[updateFrustum]].
     *
     * @param tilingScheme - The tiling scheme used to generate the tiles.
     * @param elevationRangeSource - Source of elevation range data if any.
     * @param zoomLevels - A list of zoom levels to render.
     * @param dataSources - A list of data sources to render.
     * @returns The computation result, see [[FrustumIntersection.Result]].
     */
    compute(
        tilingScheme: TilingScheme,
        elevationRangeSource: ElevationRangeSource | undefined,
        zoomLevels: number[],
        dataSources: DataSource[]
    ): IntersectionResult {
        this.m_tileKeyEntries.clear();

        // Cached projections are only valid for the projection instance they
        // were computed with; a globe/mercator switch replaces the instance.
        if (this.m_projectedBoundsCacheProjection !== this.mapView.projection) {
            this.m_projectedBoundsCacheProjection = this.mapView.projection;
            this.m_projectedBoundsCache.clear();
            this.m_projectedBoundsCacheSize = 0;
        }

        // Compute target tile area in clip space size.
        // A tile should take up roughly 256x256 pixels on screen in accordance to
        // the zoom level chosen by [MapViewUtils.calculateZoomLevelFromDistance].
        assert(this.mapView.viewportHeight !== 0);
        const targetTileArea = Math.pow(this.m_tilePixelSize / this.mapView.viewportHeight, 2);
        const useElevationRangeSource: boolean =
            elevationRangeSource !== undefined &&
            elevationRangeSource.getTilingScheme(dataSources) === tilingScheme;
        const obbIntersections =
            this.mapView.projection.type === ProjectionType.Spherical || useElevationRangeSource;
        const uniqueZoomLevels = new Set(zoomLevels);

        // Gather the minimum and maximum geometry heights of all datasources to enlarge the
        // bounding boxes of tiles for visibility tests.
        let minGeometryHeight = 0;
        let maxGeometryHeight = 0;
        dataSources.forEach(dataSource => {
            minGeometryHeight = Math.min(minGeometryHeight, dataSource.minGeometryHeight);
            maxGeometryHeight = Math.max(maxGeometryHeight, dataSource.maxGeometryHeight);
        });

        const cache = {
            calculationFinal: true,
            tileBounds: obbIntersections ? new OrientedBox3() : new THREE.Box3()
        };

        // create tile key map per zoom level
        for (const zoomLevel of uniqueZoomLevels) {
            this.m_tileKeyEntries.set(zoomLevel, new Map());
        }

        let m_rootTileKeys = this.m_rootTileKeys;
        //process here tilingScheme
        if (
            tilingScheme === geographicStandardTiling ||
            tilingScheme === geographicTerrainStandardTiling
        ) {
            m_rootTileKeys = [
                new TileKeyEntry(TileKey.fromRowColumnLevel(0, 0, 0), Infinity, 0),
                new TileKeyEntry(TileKey.fromRowColumnLevel(0, 1, 0), Infinity, 0)
            ];
        }

        for (const tileEntry of m_rootTileKeys) {
            const tileKey = tileEntry.tileKey;
            const offset = tileEntry.offset;

            // We even check the root tiles against the frustum b/c it can happen that
            // computeRequiredInitialRootTileKeys is producing false positives.
            const tileKeyEntry = this.getTileKeyEntry(
                tileKey,
                offset,
                tilingScheme,
                cache,
                minGeometryHeight,
                maxGeometryHeight,
                dataSources,
                useElevationRangeSource ? elevationRangeSource : undefined
            );

            if (tileKeyEntry !== undefined) {
                for (const zoomLevel of uniqueZoomLevels) {
                    const tileKeyEntries = this.m_tileKeyEntries.get(zoomLevel)!;
                    tileKeyEntries.set(
                        TileKeyUtils.getKeyForTileKeyAndOffset(
                            tileKey,
                            offset,
                            undefined,
                            tilingScheme.mortonTileEncoding
                        ),
                        tileKeyEntry
                    );
                }
            }
        }

        const workList = [...m_rootTileKeys.values()];
        while (workList.length > 0) {
            const tileEntry = workList.pop();

            if (tileEntry === undefined) {
                break;
            }

            // Stop subdivision if hightest visible level is reached
            const tileKey = tileEntry.tileKey;
            const offset = tileEntry.offset;
            const subdivide = dataSources.some((ds, i) =>
                ds.shouldSubdivide(zoomLevels[i], tileKey)
            );
            if (!subdivide) {
                continue;
            }

            // Stop subdivision if area of tile is too small(mixed LOD only)
            if (this.m_enableMixedLod && tileEntry.area < targetTileArea) {
                continue;
            }

            const tileKeyAndOffset = TileKeyUtils.getKeyForTileKeyAndOffset(
                tileKey,
                offset,
                undefined,
                tilingScheme.mortonTileEncoding
            );

            // delete parent tile key from applicable zoom levels
            for (const zoomLevel of uniqueZoomLevels) {
                if (tileKey.level >= zoomLevel) {
                    continue;
                }

                const tileKeyEntries = this.m_tileKeyEntries.get(zoomLevel)!;
                tileKeyEntries.delete(tileKeyAndOffset);
            }

            for (const subTileKey of tilingScheme.getSubTileKeys(tileKey)) {
                const subTileEntry = this.getTileKeyEntry(
                    subTileKey,
                    offset,
                    tilingScheme,
                    cache,
                    minGeometryHeight,
                    maxGeometryHeight,
                    dataSources,
                    useElevationRangeSource ? elevationRangeSource : undefined
                );

                if (subTileEntry !== undefined) {
                    // insert sub tile entry into tile entries map per zoom level
                    for (const zoomLevel of uniqueZoomLevels) {
                        if (subTileEntry.tileKey.level > zoomLevel) {
                            continue;
                        }

                        const subTileKeyAndOffset = TileKeyUtils.getKeyForTileKeyAndOffset(
                            subTileKey,
                            offset,
                            undefined,
                            tilingScheme.mortonTileEncoding
                        );
                        this.m_tileKeyEntries
                            .get(zoomLevel)!
                            .set(subTileKeyAndOffset, subTileEntry);
                    }

                    workList.push(subTileEntry);
                }
            }
        }
        return { tileKeyEntries: this.m_tileKeyEntries, calculationFinal: cache.calculationFinal };
    }

    private getTileKeyEntry(
        tileKey: TileKey,
        offset: number,
        tilingScheme: TilingScheme,
        cache: { calculationFinal: boolean; tileBounds: OrientedBox3 | THREE.Box3 },
        minGeometryHeight: number,
        maxGeometryHeight: number,
        dataSources: DataSource[],
        elevationRangeSource?: ElevationRangeSource
    ): TileKeyEntry | undefined {
        // For tiles without elevation range source, default 0 will be propagated as
        // min and max elevation, these tiles most probably contains features that
        // lays directly on the ground surface.
        let minElevation = 0;
        let maxElevation = 0;
        if (elevationRangeSource !== undefined) {
            const range = elevationRangeSource!.getElevationRange(tileKey, dataSources);
            minElevation = range.minElevation;
            maxElevation = range.maxElevation;
            cache.calculationFinal =
                cache.calculationFinal &&
                range.calculationStatus === CalculationStatus.FinalPrecise;
        }

        // Final altitudes incl. the conservative geometry-height enlargement.
        // Together with the (camera independent) lat/lon box they fully
        // determine the projected bounds, so they serve as the cache validity key.
        const minAltitude = minElevation + minGeometryHeight;
        const maxAltitude = maxElevation + maxGeometryHeight;

        const mortonCode = tileKey.mortonCode(tilingScheme.mortonTileEncoding);
        let byMorton = this.m_projectedBoundsCache.get(tilingScheme);
        if (byMorton === undefined) {
            byMorton = new Map();
            this.m_projectedBoundsCache.set(tilingScheme, byMorton);
        }
        let byOffset = byMorton.get(mortonCode);
        if (byOffset === undefined) {
            byOffset = new Map();
            byMorton.set(mortonCode, byOffset);
        }
        const cached = byOffset.get(offset);
        if (
            cached !== undefined &&
            cached.minAltitude === minAltitude &&
            cached.maxAltitude === maxAltitude
        ) {
            // Reuse the projection from a previous frame instead of re-projecting
            // every visited tile on every frame during camera movement.
            copyTileBounds(cache.tileBounds, cached.bounds);
        } else {
            const geoBox = getGeoBox(tilingScheme, tileKey, offset);
            geoBox.southWest.altitude = minAltitude;
            geoBox.northEast.altitude = maxAltitude;

            this.mapView.projection.projectBox(geoBox, cache.tileBounds);
            if (cached !== undefined) {
                copyTileBounds(cached.bounds, cache.tileBounds);
            } else {
                const bounds =
                    cache.tileBounds instanceof THREE.Box3 ? new THREE.Box3() : new OrientedBox3();
                copyTileBounds(bounds, cache.tileBounds);
                byOffset.set(offset, { bounds, minAltitude, maxAltitude });
                this.m_projectedBoundsCacheSize++;
                this.pruneProjectedBoundsCache();
            }
        }

        const { area, distance } = this.computeTileAreaAndDistance(cache.tileBounds);

        if (area > 0) {
            return new TileKeyEntry(
                tileKey,
                area,
                offset,
                {
                    minElevation: minAltitude,
                    maxElevation: maxAltitude
                },
                distance
            );
        }

        return undefined;
    }

    /**
     * Drops the oldest half of the projected-bounds cache once it exceeds its
     * size cap (Map iteration is insertion-ordered, so the dropped morton
     * buckets are the least recently added ones).
     */
    private pruneProjectedBoundsCache(): void {
        if (this.m_projectedBoundsCacheSize <= MAX_PROJECTED_BOUNDS_CACHE_ENTRIES) {
            return;
        }
        const target = Math.floor(this.m_projectedBoundsCacheSize / 2);
        let dropped = 0;
        for (const [tilingScheme, byMorton] of this.m_projectedBoundsCache) {
            if (dropped >= target) {
                break;
            }
            for (const [morton, byOffset] of byMorton) {
                dropped += byOffset.size;
                byMorton.delete(morton);
                if (dropped >= target) {
                    break;
                }
            }
            if (byMorton.size === 0) {
                this.m_projectedBoundsCache.delete(tilingScheme);
            }
        }
        this.m_projectedBoundsCacheSize -= dropped;
    }

    /**
     * Estimate screen space area of tile and distance to center of tile
     * @param tileBounds - The bounding volume of a tile
     * @return Area estimate and distance to tile center in clip space
     */
    private computeTileAreaAndDistance(tileBounds: THREE.Box3 | OrientedBox3): {
        area: number;
        distance: number;
    } {
        if (tileBounds instanceof THREE.Box3) {
            if (
                (this.m_extendedFrustumCulling &&
                    !this.m_mapTileCuller.frustumIntersectsTileBox(tileBounds)) ||
                !this.m_frustum.intersectsBox(tileBounds)
            ) {
                return {
                    area: 0,
                    distance: Infinity
                };
            }
        } else if (!tileBounds.intersects(this.m_frustum)) {
            return {
                area: 0,
                distance: Infinity
            };
        }

        const center = tileBounds.getCenter(tmpVectors3[0]);
        const size = tileBounds.getSize(tmpVectors3[1]);

        // Spherical projections: cull tiles that lie entirely beyond the horizon. The culling
        // frustum may extend far past the horizon (the far plane covers the whole globe), and
        // for boxes behind the camera the clip-space w goes negative, which would turn the
        // screen-size estimate below into a bogus large value and drive deep subdivision of the
        // far-side ring just past the horizon. The ellipsoid is normalized to a unit sphere by
        // scaling with 1/radii; a box is then fully hidden when its bounding sphere lies below
        // the horizon plane: dot(M, C) + rho * |C| < 1 in scaled space (Cesium-style occluder
        // test). The bounding radius is scaled with the polar radius to stay conservative
        // (under-culls, never over-culls).
        if (this.mapView.projection.type === ProjectionType.Spherical) {
            const cameraPos = this.m_camera.position;
            const invEquatorial = 1 / EarthConstants.EQUATORIAL_RADIUS;
            const invPolar = 1 / POLAR_RADIUS;
            const scaledCenter = tmpVectors3[2];
            scaledCenter.set(
                center.x * invEquatorial,
                center.y * invEquatorial,
                center.z * invPolar
            );
            const scaledCamera = tmpVectors3[3];
            scaledCamera.set(
                cameraPos.x * invEquatorial,
                cameraPos.y * invEquatorial,
                cameraPos.z * invPolar
            );
            const boundingRadius = 0.5 * size.length() * invPolar;
            if (scaledCenter.dot(scaledCamera) + boundingRadius * scaledCamera.length() < 1) {
                return {
                    area: 0,
                    distance: Infinity
                };
            }
        }

        const projectedPoint = tmpVector4
            .set(center.x, center.y, center.z, 1.0)
            .applyMatrix4(this.m_viewProjectionMatrix);

        // Estimate objects screen space size with diagonal of bounds
        // Dividing by w projects object size to screen space. For boxes whose center lies
        // behind the camera (w <= 0) fall back to the euclidean camera distance, keeping the
        // estimate positive and meaningful (such boxes straddle the near plane and legitimately
        // deserve deep subdivision).
        const perspectiveDepth =
            projectedPoint.w > 0 ? projectedPoint.w : center.distanceTo(this.m_camera.position);
        const objectSize = (0.5 * size.length()) / perspectiveDepth;

        return {
            area: objectSize * objectSize,
            //Dividing by w means we loose information for whether the point is behind the camera
            //(i.e. it is in front of the near plane) or beyond the far plane, hence we first clamp
            //to [-1, 1] range, before doing the division.
            distance:
                projectedPoint.z <= -projectedPoint.w
                    ? -1
                    : projectedPoint.z >= projectedPoint.w
                    ? 1
                    : projectedPoint.z / projectedPoint.w
        };
    }

    /**
     * Create a list of root nodes to test against the frustum. The root nodes each start at level 0
     * and have an offset (see {@link Tile}) based on:
     * - the current position [[worldCenter]].
     * - the height of the camera above the world.
     * - the field of view of the camera (the maximum value between the horizontal / vertical
     *   values)
     * - the tilt of the camera (because we see more tiles when tilted).
     *
     * @param worldCenter - The center of the camera in world space.
     */
    private computeRequiredInitialRootTileKeys(worldCenter: THREE.Vector3) {
        this.m_rootTileKeys = [];
        const rootTileKey = TileKey.fromRowColumnLevel(0, 0, 0);
        const tileWrappingEnabled = this.mapView.projection.type === ProjectionType.Planar;

        if (!tileWrappingEnabled || !this.m_tileWrappingEnabled) {
            this.m_rootTileKeys.push(new TileKeyEntry(rootTileKey, Infinity, 0));
            return;
        }

        const worldGeoPoint = this.mapView.projection.unprojectPoint(worldCenter);
        const startOffset = Math.round(worldGeoPoint.longitude / 360.0);

        // This algorithm computes the number of offsets we need to test. The following diagram may
        // help explain the algorithm below.
        //
        //   |🎥
        //   |.\ .
        //   | . \  .
        // z |  .  \   .c2
        //   |  c1.  \b    .
        //   |     .   \      .
        //___|a___d1.____\e______.d2______f
        //
        // Where:
        // - 🎥 is the camera
        // - z is the height of the camera above the ground.
        // - a is a right angle.
        // - b is the look at vector of the camera.
        // - c1 and c2 are the frustum planes of the camera.
        // - c1 to c2 is the fov.
        // - d1 and d2 are the intersection points of the frustum with the world plane.
        // - e is the tilt/pitch of the camera.
        // - f is the world
        //
        // The goal is to find the distance from e->d2. This is a longitude value, and we convert it
        // to some offset range. Note e->d2 >= e->d1 (because we can't have a negative tilt).
        // To find e->d2, we use the right triangle 🎥, a, d2 and subtract the distance a->d2 with
        // a->e.
        // a->d2 is found using the angle between a and d2 from the 🎥, this is simply e (because of
        // similar triangles, angle between a, 🎥 and e equals the tilt) + half of the fov (because
        // we need the angle between e, 🎥 and d2) and using trigonometry, result is therefore:
        // (tan(a->d2) * z).
        // a->e needs just the tilt and trigonometry to compute, result is: (tan(a->e) * z).

        const camera = this.m_camera;
        const cameraPitch = MapViewUtils.extractAttitude(this.mapView, camera).pitch;
        // Ensure that the aspect is >= 1.
        const aspect = camera.aspect > 1 ? camera.aspect : 1 / camera.aspect;
        // Angle between a->d2, note, the fov is vertical, hence we translate to horizontal.
        const totalAngleRad = THREE.MathUtils.degToRad((camera.fov * aspect) / 2) + cameraPitch;
        // Length a->d2
        const worldLengthHorizontalFull = Math.tan(totalAngleRad) * camera.position.z;
        // Length a->e
        const worldLengthHorizontalSmallerHalf = Math.tan(cameraPitch) * camera.position.z;
        // Length e -> d2
        const worldLengthHorizontal = worldLengthHorizontalFull - worldLengthHorizontalSmallerHalf;
        const worldLeftPoint = new THREE.Vector3(
            worldCenter.x - worldLengthHorizontal,
            worldCenter.y,
            worldCenter.z
        );
        const worldLeftGeoPoint = this.mapView.projection.unprojectPoint(worldLeftPoint);
        // We multiply by SQRT2 because we need to account for a rotated view (in which case there
        // are more tiles that can be seen).
        const offsetRange = THREE.MathUtils.clamp(
            Math.ceil(
                Math.abs((worldGeoPoint.longitude - worldLeftGeoPoint.longitude) / 360) * Math.SQRT2
            ),
            0,
            // We can store currently up to 16 unique keys(2^4, where 4 is the default bit-shift
            // value which is used currently in the VisibleTileSet methods) hence we can have a
            // maximum range of 7 (because 2*7+1 = 15).
            7
        );
        for (
            let offset = -offsetRange + startOffset;
            offset <= offsetRange + startOffset;
            offset++
        ) {
            this.m_rootTileKeys.push(new TileKeyEntry(rootTileKey, Infinity, offset));
        }
    }
}
