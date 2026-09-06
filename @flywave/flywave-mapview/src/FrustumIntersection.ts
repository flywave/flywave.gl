/*
 * Copyright (C) 2019-2021 HERE Europe B.V.
 * Licensed under Apache 2.0, see full license in LICENSE
 * SPDX-License-Identifier: Apache-2.0
 */
import {
    EarthConstants,
    OrientedBox3,
    Projection,
    ProjectionType,
    TileKey,
    TileKeyUtils,
    TilingScheme
} from "@flywave/flywave-geoutils";
import { assert } from "@flywave/flywave-utils";
import * as THREE from "three";

import { DataSource } from "./DataSource";
import { CalculationStatus, ElevationRange, ElevationRangeSource } from "./ElevationRangeSource";
import { MapTileCuller } from "./MapTileCuller";
import { MapView } from "./MapView";
import { MapViewUtils } from "./Utils";

const tmpVectors3 = [new THREE.Vector3(), new THREE.Vector3()];
const tmpVector4 = new THREE.Vector4();

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

    /**
     * Opt-in mgl coveringTiles shouldSplit distance LOD (§317-§323):
     * forward-projected corner distance where the z-difference is replaced
     * by +cameraHeight (mgl transform.ts `distanceXyz[2] = cameraHeight`),
     * vs C/2^level · ccd/sourceTileSize, distToSplitScale-scaled, with the
     * nearest-to-center fallback.
     */
    mglDistanceLod = false;
    mglDistanceLodTileSize = 512;
    /** §336: entries that STOPPED subdividing this compute (LOD band) —
     * delivered by VisibleTileSet in mixed-level mode. */
    lodStoppedEntries: Array<unknown> = [];
    mglDistanceLodScale = 1;

    private readonly m_frustum: THREE.Frustum = new THREE.Frustum();
    // used to project global coordinates into camera local coordinates
    private readonly m_viewProjectionMatrix = new THREE.Matrix4();
    private readonly m_mapTileCuller: MapTileCuller;
    private m_rootTileKeys: TileKeyEntry[] = [];
    private readonly m_tileKeyEntries: ZoomLevelTileKeyMap = new Map();

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
        for (const tileEntry of this.m_rootTileKeys) {
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
                        TileKeyUtils.getKeyForTileKeyAndOffset(tileKey, offset),
                        tileKeyEntry
                    );
                }
            }
        }

        this.lodStoppedEntries = [];
        const workList = [...this.m_rootTileKeys.values()];
        // Safety cap against explosive subdivision at extreme pitch angles.
        // Without a bound this loop can expand to millions of tiles, blocking
        // the main thread for minutes and eventually throwing
        // `RangeError: Map maximum size exceeded`. Bail out to an approximate,
        // non-final result instead.
        const maxProcessedTiles = 200000;
        let processedTiles = 0;
        while (workList.length > 0) {
            const tileEntry = workList.pop();

            if (tileEntry === undefined) {
                break;
            }

            if (++processedTiles > maxProcessedTiles) {
                cache.calculationFinal = false;
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

            // Stop subdivision if area of tile is too small (mixed LOD only).
            // Also apply at extreme pitch: the frustum-to-ground footprint
            // explodes (far tiles become sub-pixel) and enumerating all of them
            // at the max zoom starves the frame loop; keeping them as lower-zoom
            // (overzoomed) tiles bounds the work without changing normal views.
            const pitch = MapViewUtils.extractAttitude(this.mapView, this.m_camera).pitch;
            if (tileEntry.area < targetTileArea && (this.m_enableMixedLod || pitch > Math.PI / 3)) {
                continue;
            }

            // §323/§343: mgl shouldSplit distance LOD — the z-difference term is
            // +cameraHeight (NOT the corner z): mgl transform.ts replaces
            // distanceXyz[2] with cameraHeight in the flat case.
            // Unit chain (validated offline node-by-node against the mgl
            // reference tool, scripts/lod-mirror-check.js — 0 mismatches at
            // bearing 0 and -45, mglDistanceLodScale=1):
            //   - forward = direction from camera to target:
            //       (−sin(yaw)·sin(tilt), cos(yaw)·sin(tilt), −cos(tilt))
            //     matching getCameraPositionFromTargetCoordinates (yaw=-heading).
            //   - mgl's z tile-units are cos(lat)-compressed relative to its x/y
            //     tile-units; flywave's z is true meters while x/y are projected
            //     mercator meters, so the z-term and dz use altitude/cos(lat).
            // §836: mgl coveringTiles globe branch — ECEF-meter mirror of
            // transform.ts shouldSplit (isGlobe): per-corner forward distance
            // vs 2^(maxZoom−z)·(ccd/tileSize)·tileScaleAdjustment, with the
            // globe tileScaleAdjustment (maxDivergence 0.3 center-lod
            // compromise / relativeTileScale ÷ mercatorScaleRatio) and
            // distToSplitScale(≈cameraHeight, distance). The planar branch
            // below assumes a Box3/mercator frame and must not run on the
            // sphere (OrientedBox3 has no .min/.max — §835c crash).
            if (this.mglDistanceLod && uniqueZoomLevels.size > 0 &&
                this.mapView.projection.type === ProjectionType.Spherical) {
                const maxZoomLod = Math.max(...uniqueZoomLevels);
                if (tileKey.level < maxZoomLod &&
                    this.mglGlobeDistanceLodStop(tilingScheme, tileKey, offset, maxZoomLod)) {
                    this.lodStoppedEntries.push(tileEntry);
                    continue;
                }
            }
            if (this.mglDistanceLod && uniqueZoomLevels.size > 0 &&
                this.mapView.projection.type !== ProjectionType.Spherical) {
                const maxZoomLod = Math.max(...uniqueZoomLevels);
                if (tileKey.level < maxZoomLod) {
                    const cam = this.m_camera;
                    const ccdPx =
                        0.5 / Math.tan((cam.fov * Math.PI) / 180 / 2) *
                        this.mapView.viewportHeight;
                    if (ccdPx > 0) {
                        const C = 40075016.686;
                        // §346/§347: mgl shouldSplit exact spec (transform.ts
                        // distToSplit) — zoomSplitDistance = ccd/tileSize is
                        // in units of tiles at the COVERING zoom (maxZoom),
                        // and the threshold scales by 2^(maxZoom − level):
                        //   distToSplit = (C / 2^maxZoom) · ccd/tileSize · 2^(maxZoom−level)
                        // (= mgl's `(1 << (maxZoom - it.zoom)) * zoomSplitDistance`
                        // converted to meters). Without the factor the LOD
                        // band never stops anything (measured: 0 stops);
                        // basing it on the level's tile size doubles it again.
                        const distWorld =
                            (C / Math.pow(2, maxZoomLod)) *
                            (ccdPx / this.mglDistanceLodTileSize) *
                            Math.pow(2, maxZoomLod - tileKey.level) *
                            (this.mglDistanceLodScale ?? 1);
                        const mv = this.mapView as any;
                        const tiltRad = ((mv.tilt ?? 0) * Math.PI) / 180;
                        const yawRad = (-(mv.heading ?? 0) * Math.PI) / 180;
                        const sinT = Math.sin(tiltRad);
                        const cosT = Math.cos(tiltRad);
                        const fwd = {
                            x: -Math.sin(yawRad) * sinT,
                            y: Math.cos(yawRad) * sinT,
                            z: -cosT
                        };
                        const camPos = cam.position;
                        // mgl z tile-units are cos(lat)-compressed vs x/y —
                        // flywave z is true meters, x/y projected meters.
                        let cosLat = 1;
                        try {
                            const lat = mv.geoCenter?.latitudeInRadians;
                            if (typeof lat === 'number') cosLat = Math.max(Math.cos(lat), 1e-6);
                        } catch {}
                        const camH = Math.abs(camPos.z) / cosLat;
                        const box = cache.tileBounds as THREE.Box3;
                        let d = Infinity;
                        for (let ci = 0; ci < 2; ci++)
                        for (let cj = 0; cj < 2; cj++) {
                            const dist2 =
                                ((ci ? box.max.x : box.min.x) - camPos.x) * fwd.x +
                                ((cj ? box.max.y : box.min.y) - camPos.y) * fwd.y +
                                camH * fwd.z;
                            if (dist2 < d) d = dist2;
                        }
                        const centerWorld = mv.worldTarget;
                        const containsCenter =
                            centerWorld &&
                            centerWorld.x >= box.min.x && centerWorld.x <= box.max.x &&
                            centerWorld.y >= box.min.y && centerWorld.y <= box.max.y;
                        if (!containsCenter && d > 0) {
                            // mgl distToSplitScale dz = max(closestElevation,
                            // cameraHeight) — with terrain the tile's
                            // elevation (TileKeyEntry.elevationRange) raises
                            // dz, shrinking the scale factor and stopping MORE
                            // tiles at lower levels (the error-overlap near
                            // band must stop down to the z13/z14 const tiles).
                            // closest-corner |z| ≈ tile maxElevation (bound).
                            const tileMaxElev =
                                Math.abs(tileEntry.elevationRange?.maxElevation ?? 0);
                            const dz = Math.max(camH, tileMaxElev, 1e-6);
                            const sT = 0.707, stretch = 1.1;
                            let scaleF = 1.0;
                            if (d * sT >= dz) {
                                const r = d / dz;
                                const k = r - 1 / sT;
                                scaleF =
                                    r / (1 / sT + (Math.pow(stretch, k + 1) - 1) / (stretch - 1) - 1);
                            }
                            if (d > distWorld * scaleF) {
                                this.lodStoppedEntries.push(tileEntry);
                                continue;
                            }
                        }
                    }
                }
            }

            const tileKeyAndOffset = TileKeyUtils.getKeyForTileKeyAndOffset(tileKey, offset);

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
                            offset
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

    /**
     * §836: mgl coveringTiles shouldSplit for the globe projection
     * (transform.ts isGlobe path), in ECEF meters:
     *  - closestDistance = min over tile ground corners of dot(corner−cam, fwd)
     *    (mgl: per-corner dot(distanceXyz, camera.forward()), no z replacement)
     *  - distToSplit = 2^(maxZoom−z) · (ccd/tileSize) · tileScaleAdjustment
     *    · distToSplitScale(dz≈cameraHeight, closestDistance), in
     *    covering-zoom tile units (1 unit = C/2^maxZoom m on the equator)
     *  - tileScaleAdjustment: center-latitude tiles 1/max(1, msr−0.3)
     *    (mgl's maxDivergence 0.3 compromise), others
     *    min(1, circ(closestLat)/circ(centerLat) ÷ msr)
     *  - mgl border case: a tile containing the center point always splits.
     * Stop subdividing (return true) when closest ≥ distToSplit and the tile
     * does not contain the center.
     */
    private mglGlobeDistanceLodStop(
        tilingScheme: TilingScheme,
        tileKey: TileKey,
        offset: number,
        maxZoomLod: number
    ): boolean {
        const cam = this.m_camera;
        const fwd = cam.getWorldDirection(tmpVectors3[0]);
        const camPos = cam.position;
        const C = 40075016.686;
        const tileSizePx = this.mglDistanceLodTileSize;
        const ccdPx =
            0.5 / Math.tan((cam.fov * Math.PI) / 180 / 2) *
            this.mapView.viewportHeight;
        const msr = EarthConstants.EQUATORIAL_RADIUS === 0 ? 1 :
            Math.cos(Math.PI / 4) / Math.cos(((this.mapView as any).geoCenter?.latitude ?? 45) * Math.PI / 180);

        const geoBox = getGeoBox(tilingScheme, tileKey, offset);
        // tileScaleAdjustment (mgl globe branch)
        const cl = Math.min(
            Math.max(((this.mapView as any).geoCenter?.latitude ?? 0), geoBox.southWest.latitude),
            geoBox.northEast.latitude
        );
        let adj: number;
        const circLat = (lat: number) => Math.cos(lat * Math.PI / 180);
        if (cl === ((this.mapView as any).geoCenter?.latitude ?? 0)) {
            adj = 1 / Math.max(1, msr - 0.3);
        } else {
            adj = Math.min(1, circLat(cl) / circLat((this.mapView as any).geoCenter?.latitude ?? 0) / msr);
        }

        // covering-tile unit in meters (equator)
        const unitM = C / Math.pow(2, maxZoomLod);
        // camera height above the sphere
        const dCam = camPos.length();
        const camH = dCam - EarthConstants.EQUATORIAL_RADIUS;

        // ground corners (on-sphere) → forward distances
        const pts: Array<[number, number]> = [
            [geoBox.southWest.latitude, geoBox.southWest.longitude],
            [geoBox.southWest.latitude, geoBox.northEast.longitude],
            [geoBox.northEast.latitude, geoBox.southWest.longitude],
            [geoBox.northEast.latitude, geoBox.northEast.longitude]
        ];
        let closest = Infinity;
        let closestFull = Infinity;
        const proj = this.mapView.projection;
        for (const [lat, lng] of pts) {
            proj.projectPoint({ latitude: lat, longitude: lng, altitude: 0 } as any, tmpVectors3[1]);
            const dx = tmpVectors3[1].x - camPos.x;
            const dy = tmpVectors3[1].y - camPos.y;
            const dz = tmpVectors3[1].z - camPos.z;
            const f = dx * fwd.x + dy * fwd.y + dz * fwd.z;
            if (f < closest) closest = f;
            const full = Math.sqrt(dx * dx + dy * dy + dz * dz);
            if (full < closestFull) closestFull = full;
        }

        // mgl distToSplitScale (acute-angle stretch), dz ≈ cameraHeight
        const dz = Math.max(camH, 1e-6);
        let scaleF = 1.0;
        if (closestFull * 0.707 >= dz) {
            const r = closestFull / dz;
            const k = r - 1 / 0.707;
            scaleF = r / (1 / 0.707 + (Math.pow(1.1, k + 1) - 1) / (1.1 - 1) - 1);
        }

        const distToSplitM =
            Math.pow(2, maxZoomLod - tileKey.level) *
            (ccdPx / tileSizePx) *
            adj *
            scaleF *
            unitM;

        if (closest < distToSplitM) {
            return false; // split
        }
        // mgl border case: tile containing the center point always splits
        const cLat = (this.mapView as any).geoCenter?.latitude;
        const cLng = (this.mapView as any).geoCenter?.longitude;
        if (typeof cLat === 'number' && typeof cLng === 'number' &&
            cLat >= geoBox.southWest.latitude && cLat <= geoBox.northEast.latitude &&
            cLng >= geoBox.southWest.longitude && cLng <= geoBox.northEast.longitude) {
            return false;
        }
        return true; // stop
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
        const geoBox = getGeoBox(tilingScheme, tileKey, offset);

        // For tiles without elevation range source, default 0 (getGeoBox always
        // returns box with altitude min/max equal to zero) will be propagated as
        // min and max elevation, these tiles most probably contains features that
        // lays directly on the ground surface.
        if (elevationRangeSource !== undefined) {
            const range = elevationRangeSource!.getElevationRange(tileKey,dataSources);
            geoBox.southWest.altitude = range.minElevation;
            geoBox.northEast.altitude = range.maxElevation;
            cache.calculationFinal =
                cache.calculationFinal &&
                range.calculationStatus === CalculationStatus.FinalPrecise;
        }

        // Enlarge the bounding boxes of tiles with min/max geometry height for visibility tests.
        geoBox.southWest.altitude = (geoBox.southWest.altitude ?? 0) + minGeometryHeight;
        geoBox.northEast.altitude = (geoBox.northEast.altitude ?? 0) + maxGeometryHeight;

        this.mapView.projection.projectBox(geoBox, cache.tileBounds);
        // §858: mgl transition-blended coverage — during the globe→mercator
        // transition mgl interpolates each tile AABB's corners toward their
        // mercator-plane corners BEFORE the frustum test (globe_util.ts
        // getTileAABB → interpolateVec3(corners, mercatorCorners, phase)),
        // so the tile cover expands toward the plane in lockstep with the
        // transition-blended vertex geometry (MBTileDataEmitter §855).
        // Without it the cover stays on the pure sphere and the plane region
        // beyond the limb renders with no content. Union (not replace — the
        // sphere box also stays a valid conservative bound for the blended
        // geometry) a Box3 over the phase-blended corners into the test.
        const mercPhase = (globalThis as any).__mbMercTransitionPhase ?? 0;
        if (mercPhase > 0 && this.mapView.projection.type === ProjectionType.Spherical) {
            const R = EarthConstants.EQUATORIAL_CIRCUMFERENCE;
            const corners: Array<[number, number]> = [
                [geoBox.southWest.longitude, geoBox.southWest.latitude],
                [geoBox.northEast.longitude, geoBox.southWest.latitude],
                [geoBox.northEast.longitude, geoBox.northEast.latitude],
                [geoBox.southWest.longitude, geoBox.northEast.latitude]
            ];
            const blendBox = new THREE.Box3();
            const p = new THREE.Vector3();
            for (const [lng, lat] of corners) {
                // Sphere corner (same frame as projectBox output).
                this.mapView.projection.projectPoint(
                    { longitude: lng, latitude: lat, altitude: 0 },
                    p
                );
                let sx = p.x, sy = p.y, sz = p.z;
                // Mercator-plane corner, mirroring tile2world's blend frame
                // (mercator meters, origin at equator/prime meridian, z=0).
                const mx = (lng / 360) * R;
                const latRad = (lat * Math.PI) / 180;
                const my =
                    ((1 -
                        Math.log(
                            Math.tan(latRad) + 1 / Math.cos(latRad)
                        ) / Math.PI) /
                        2) *
                    R;
                sx = sx * (1 - mercPhase) + mx * mercPhase;
                sy = sy * (1 - mercPhase) + my * mercPhase;
                sz = sz * (1 - mercPhase);
                blendBox.expandByPoint(p.set(sx, sy, sz));
            }
            if (cache.tileBounds instanceof OrientedBox3) {
                const obb = cache.tileBounds;
                for (const sx of [-1, 1]) {
                    for (const sy of [-1, 1]) {
                        for (const sz of [-1, 1]) {
                            blendBox.expandByPoint(
                                p.copy(obb.position)
                                    .addScaledVector(obb.xAxis, sx * obb.extents.x)
                                    .addScaledVector(obb.yAxis, sy * obb.extents.y)
                                    .addScaledVector(obb.zAxis, sz * obb.extents.z)
                            );
                        }
                    }
                }
            } else {
                blendBox.union(cache.tileBounds as THREE.Box3);
            }
            if (!this.m_frustum.intersectsBox(blendBox)) {
                return undefined;
            }
        }
        const { area, distance } = this.computeTileAreaAndDistance(cache.tileBounds);

        if (area > 0) {
            return new TileKeyEntry(
                tileKey,
                area,
                offset,
                {
                    minElevation: geoBox.southWest.altitude,
                    maxElevation: geoBox.northEast.altitude
                },
                distance
            );
        }

        return undefined;
    }

    /**
     * Estimate screen space area of tile and distance to center of tile
     * @param tileBounds - The bounding volume of a tile
     * @return Area estimate and distance to tile center in clip space
     */
    private computeTileAreaAndDistance(
        tileBounds: THREE.Box3 | OrientedBox3
    ): { area: number; distance: number } {
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

        // Project tile bounds center
        const center = tileBounds.getCenter(tmpVectors3[0]);
        const projectedPoint = tmpVector4
            .set(center.x, center.y, center.z, 1.0)
            .applyMatrix4(this.m_viewProjectionMatrix);

        // Estimate objects screen space size with diagonal of bounds
        // Dividing by w projects object size to screen space
        const size = tileBounds.getSize(tmpVectors3[1]);
        const objectSize = (0.5 * size.length()) / projectedPoint.w;

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
