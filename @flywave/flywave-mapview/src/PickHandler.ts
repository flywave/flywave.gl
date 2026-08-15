/* Copyright (C) 2025 flywave.gl contributors */

import { type Technique, GeometryType, getFeatureId } from "@flywave/flywave-datasource-protocol";
import { type TileKey, OrientedBox3 } from "@flywave/flywave-geoutils";
import * as THREE from "three/webgpu";

import { type IntersectParams } from "./IntersectParams";
import { type MapView } from "./MapView";
import { MapViewPoints } from "./MapViewPoints";
import { PickingRaycaster } from "./PickingRaycaster";
import { PickListener } from "./PickListener";
import { type Tile, type TileFeatureData } from "./Tile";
import { MapViewUtils } from "./Utils";

/**
 * Describes the general type of a picked object.
 */
export enum PickObjectType {
    /**
     * Unspecified.
     */
    Unspecified = 0,

    /**
     * A point object.
     */
    Point,

    /**
     * A line object.
     */
    Line,

    /**
     * An area object.
     */
    Area,

    /**
     * The text part of a {@link TextElement}
     */
    Text,

    /**
     * The Icon of a {@link TextElement}.
     */
    Icon,

    /**
     * Any general 3D object, for example, a landmark.
     */
    Object3D
}

/**
 * A general pick result. You can access the details of a picked geometry from the property
 * `intersection`, which is available if a geometry was hit. If a road was hit, a [[RoadPickResult]]
 * is returned, which has additional information, but no `intersection`.
 */
export interface PickResult {
    /**
     * General type of object.
     */
    type: PickObjectType;

    /**
     * A 2D point in screen coordinates, or a 3D point in world coordinates.
     */
    point: THREE.Vector2 | THREE.Vector3;

    /**
     * Distance from the camera to the picking point; used to determine the closest object.
     */
    distance: number;

    /**
     * Uniquely identifies the data source which provided the picked object.
     */
    dataSourceName: string | undefined;

    /**
     * Data source order, useful for sorting a collection of picking results.
     * A number for objects/features coming from tiles (as those have data sources attached),
     * an undefined when objects are added via "mapView.mapAnchors.add(object)" - those are treated as
     * base layer objects during picking (same as "dataSourceOrder: 0").
     */
    dataSourceOrder: number | undefined;

    /**
     * Render order of the intersected object.
     */
    renderOrder?: number;

    /**
     * An optional feature ID of the picked object.
     * @remarks The ID may be assigned by the object's {@link DataSource}, for example in case of
     * Optimized Map Vector (OMV) and GeoJSON data sources.
     */
    featureId?: number | string;

    /**
     * Defined for geometry only.
     */
    intersection?: THREE.Intersection;

    /**
     * Defined for roads or if `enableTechniqueInfo` option is enabled.
     */
    technique?: Technique;

    /**
     * Optional user data that has been defined in the picked object.
     *
     * @remarks
     * This object points directly to
     * information contained in the original {@link TileFeatureData}
     * stored in {@link MapView}, and should
     * not be modified.
     */
    userData?: any;

    /**
     * The tile key containing the picked object.
     */
    tileKey?: TileKey;
}

const tmpV3 = new THREE.Vector3();
const tmpOBB = new OrientedBox3();

// Intersects the dependent tile objects using the supplied raycaster. Note, because multiple
// tiles can point to the same dependency we need to store which results we have already
// raycasted, see checkedDependencies.
function intersectDependentObjects(
    tile: Tile,
    intersects: THREE.Intersection[],
    rayCaster: THREE.Raycaster,
    checkedDependencies: Set<number>,
    mapView: MapView
) {
    for (const tileKey of tile.dependencies) {
        const mortonCode = tileKey.mortonCode(tile.dataSource.getTilingScheme().mortonTileEncoding);
        if (checkedDependencies.has(mortonCode)) {
            continue;
        }
        checkedDependencies.add(mortonCode);
        const otherTile = mapView.visibleTileSet.getCachedTile(
            tile.dataSource,
            tileKey,
            tile.offset,
            mapView.frameNumber
        );
        if (otherTile !== undefined) {
            otherTile.raycast(rayCaster, intersects, true);
        }
    }
}

/**
 * Handles the picking of scene geometry and roads.
 * @internal
 */
export class PickHandler {
    private readonly m_pickingRaycaster: PickingRaycaster;

    constructor(
        readonly mapView: MapView,
        readonly camera: THREE.Camera,
        public enablePickTechnique = false
    ) {
        this.m_pickingRaycaster = new PickingRaycaster(
            mapView.renderer.getSize(new THREE.Vector2())
        );
    }

    /**
     * Does a raycast on all objects in the scene; useful for picking.
     *
     * @param x - The X position in CSS/client coordinates, without the applied display ratio.
     * @param y - The Y position in CSS/client coordinates, without the applied display ratio.
     * @param parameters - The intersection test behaviour may be adjusted by providing an instance
     * of {@link IntersectParams}.
     * @returns the list of intersection results.
     */
    intersectMapObjects(x: number, y: number, parameters?: IntersectParams): PickResult[] {
        // GPU fast path: O(1) depth + pickId readback (requires enableGpuPicking),
        // returning the same full PickResult as the CPU path below. Falls
        // through to CPU when the GPU has no answer yet or missed sky.
        if (
            this.mapView.mapRenderingManager?.gpuPicking &&
            parameters?.useGpuPick !== false
        ) {
            const gpuResult = this.tryGpuPick(x, y);
            if (gpuResult !== null) return [gpuResult];
            if (parameters?.useGpuPick === true) return []; // GPU-only, no fallback
        }

        const ndc = this.mapView.getNormalizedScreenCoordinates(x, y);
        const rayCaster = this.setupRaycaster(x, y);
        const pickListener = new PickListener(parameters);

        if (this.mapView.textElementsRenderer !== undefined) {
            const { clientWidth, clientHeight } = this.mapView.canvas;
            const screenX = ndc.x * clientWidth * 0.5;
            const screenY = ndc.y * clientHeight * 0.5;
            const scenePosition = new THREE.Vector2(screenX, screenY);
            this.mapView.textElementsRenderer.pickTextElements(scenePosition, pickListener);
        }

        const intersects: THREE.Intersection[] = [];
        const intersectedTiles = this.getIntersectedTiles(rayCaster);

        // This ensures that we check a given dependency only once (because multiple tiles could
        // have the same dependency).
        const checkedDependencies = new Set<number>();

        for (const { tile, distance } of intersectedTiles) {
            if (pickListener.done && pickListener.furthestResult!.distance < distance) {
                // Stop when the listener has all results it needs and remaining tiles are further
                // away than then furthest pick result found so far.
                break;
            }

            intersects.length = 0;
            tile.raycast(rayCaster, intersects, true);
            intersectDependentObjects(
                tile,
                intersects,
                rayCaster,
                checkedDependencies,
                this.mapView
            );

            for (const intersect of intersects) {
                pickListener.addResult(this.createResult(intersect, tile));
            }
        }

        if (!parameters || parameters.pickAnchor !== false) {
            // Intersect any objects added by the user.
            for (const child of this.mapView.mapAnchors.children) {
                intersects.length = 0;
                rayCaster.intersectObject(child, true, intersects);

                for (const intersect of intersects) {
                    pickListener.addResult(this.createResult(intersect));
                }
            }
        }

        pickListener.finish();
        return pickListener.results;
    }

    /**
     * Returns a ray caster using the supplied screen positions.
     *
     * @param x - The X position in css/client coordinates (without applied display ratio).
     * @param y - The Y position in css/client coordinates (without applied display ratio).
     *
     * @return Raycaster with origin at the camera and direction based on the supplied x / y screen
     * points.
     */
    raycasterFromScreenPoint(x: number, y: number): THREE.Raycaster {
        this.m_pickingRaycaster.setFromCamera(
            this.mapView.getNormalizedScreenCoordinates(x, y),
            this.camera
        );
        // Required by three's Sprite/Points raycast implementations (they
        // early-out without it) — benefits both the CPU tile path and the
        // GPU pick's lazy detail raycast.
        this.m_pickingRaycaster.camera = this.camera;

        this.mapView.renderer.getSize(this.m_pickingRaycaster.canvasSize);
        return this.m_pickingRaycaster;
    }

    /**
     * Synchronous GPU pick: reads the pickDepth slot (depth + pickId) at the
     * given screen position and resolves the pickId to its object through
     * the renderer's registry. The result carries the cheap fields
     * immediately (exact hit point, distance, object identity, tile
     * attribution, type); the four face-derived detail fields
     * (`intersection` with face normal / UV / faceIndex, `userData`,
     * `featureId`, `technique`) are LAZY — reading any of them triggers a
     * targeted single-object raycast (frozen at pick time) through the same
     * result builder the CPU path uses, then caches. Not reading them costs
     * nothing beyond the O(1) readback. The lazy set is kept minimal by
     * design: only face-level data justifies a trigger.
     *
     * Because some scene content is positioned camera-relatively each
     * frame, deferred detail reads are exact within the frame of the pick;
     * reading them after the camera has moved may yield `undefined`.
     */
    private tryGpuPick(x: number, y: number): PickResult | null {
        const vrm = this.mapView.mapRenderingManager?.viewRenderManager;
        if (vrm === undefined) return null;

        const renderCam = vrm.pickCamera;
        if (!renderCam || !(this.camera instanceof THREE.PerspectiveCamera)) return null;

        const ndc = this.mapView.getNormalizedScreenCoordinates(x, y);
        const pick = vrm.readPickSync(ndc);
        if (pick === null || pick.pickId <= 0) return null; // cold, or definitive sky

        const object = vrm.getPickedObject(pick.pickId);
        if (object === undefined) return null; // object unloaded → CPU fallback

        const worldPoint = new THREE.Vector3(ndc.x, ndc.y, pick.depth * 2.0 - 1.0)
            .unproject(renderCam)
            .add(this.camera.position.clone().sub(renderCam.position));
        const distance = this.camera.position.distanceTo(worldPoint);
        if (distance < this.camera.near) return null;

        // Cheap tile attribution (no raycast): the visible tile whose
        // bounding box contains the hit point — same walk as the CPU loop.
        this.raycasterFromScreenPoint(x, y);
        let tile: Tile | undefined;
        for (const { tile: visibleTile } of this.getIntersectedTiles(
            this.m_pickingRaycaster
        )) {
            tmpOBB.copy(visibleTile.boundingBox);
            tmpOBB.position.sub(this.mapView.worldCenter);
            tmpOBB.position.x += visibleTile.computeWorldOffsetX();
            if (tmpOBB.containsPoint(worldPoint)) {
                tile = visibleTile;
                break;
            }
        }

        const result: PickResult = {
            type: PickObjectType.Object3D,
            point: worldPoint,
            distance,
            dataSourceName: object.userData?.dataSource,
            dataSourceOrder: tile?.dataSource?.dataSourceOrder,
            tileKey: tile?.tileKey,
            renderOrder: object.renderOrder
        };

        // Frozen picking ray — deferred detail reads stay consistent with
        // the already-returned point/distance.
        const frozenRay = this.m_pickingRaycaster.ray.clone();

        let details: PickResult | null | undefined; // undefined = not yet fetched
        const ensureDetails = (): PickResult | null => {
            if (details === undefined) {
                this.m_pickingRaycaster.ray.copy(frozenRay);
                const intersects = this.m_pickingRaycaster.intersectObject(object, true);
                details =
                    intersects.length > 0 ? this.createResult(intersects[0], tile) : null;
            }
            return details;
        };

        // Lazy detail fields — reading ANY of these runs the deferred raycast
        // exactly once (then caches). Keep this set minimal: only fields
        // that genuinely require face-level data may trigger; everything
        // else must stay eager. `type` stays eager (Object3D) on purpose —
        // casual `pick.type` switches must not cost a raycast.
        for (const key of ["intersection", "userData", "featureId", "technique"] as const) {
            Object.defineProperty(result, key, {
                get: () => ensureDetails()?.[key],
                enumerable: true,
                configurable: true
            });
        }

        return result;
    }

    private createResult(intersection: THREE.Intersection, tile?: Tile): PickResult {
        const pickResult: PickResult = {
            type: PickObjectType.Unspecified,
            point: intersection.point,
            distance: intersection.distance,
            dataSourceName: intersection.object.userData?.dataSource,
            dataSourceOrder: tile?.dataSource?.dataSourceOrder,
            intersection,
            tileKey: tile?.tileKey
        };

        if (
            intersection.object.userData === undefined ||
            intersection.object.userData.feature === undefined
        ) {
            return pickResult;
        }

        if (this.enablePickTechnique) {
            pickResult.technique = intersection.object.userData.technique;
        }
        pickResult.renderOrder = intersection.object?.renderOrder;

        const featureData: TileFeatureData = intersection.object.userData.feature;
        this.addObjInfo(featureData, intersection, pickResult);
        if (pickResult.userData) {
            const featureId = getFeatureId(pickResult.userData);
            pickResult.featureId = featureId === 0 ? undefined : featureId;
        }

        let pickObjectType: PickObjectType;

        switch (featureData.geometryType) {
            case GeometryType.Point:
            case GeometryType.Text:
                pickObjectType = PickObjectType.Point;
                break;
            case GeometryType.Line:
            case GeometryType.ExtrudedLine:
            case GeometryType.SolidLine:
            case GeometryType.TextPath:
                pickObjectType = PickObjectType.Line;
                break;
            case GeometryType.Polygon:
            case GeometryType.ExtrudedPolygon:
                pickObjectType = PickObjectType.Area;
                break;
            case GeometryType.Object3D:
                pickObjectType = PickObjectType.Object3D;
                break;
            default:
                pickObjectType = PickObjectType.Unspecified;
        }

        pickResult.type = pickObjectType;
        return pickResult;
    }

    private getIntersectedTiles(
        rayCaster: THREE.Raycaster
    ): Array<{ tile: Tile; distance: number }> {
        const tiles = new Array<{
            tile: Tile;
            distance: number;
        }>();
        const tileList = this.mapView.visibleTileSet.dataSourceTileList;
        tileList.forEach(dataSourceTileList => {
            if (!dataSourceTileList.dataSource.enablePicking) {
                return;
            }

            dataSourceTileList.renderedTiles.forEach(tile => {
                tmpOBB.copy(tile.boundingBox);
                tmpOBB.position.sub(this.mapView.worldCenter);
                // This offset shifts the box by the given tile offset, see renderTileObjects in
                // MapView
                const worldOffsetX = tile.computeWorldOffsetX();
                tmpOBB.position.x += worldOffsetX;
                const distance = tmpOBB.intersectsRay(rayCaster.ray);
                if (distance !== undefined) {
                    tiles.push({ tile, distance });
                }
            });
        });

        tiles.sort(
            (lhs: { tile: Tile; distance: number }, rhs: { tile: Tile; distance: number }) => {
                return lhs.distance - rhs.distance;
            }
        );
        return tiles;
    }

    private addObjInfo(
        featureData: TileFeatureData,
        intersect: THREE.Intersection,
        pickResult: PickResult
    ) {
        if (featureData.objInfos === undefined) {
            return;
        }

        if (pickResult.intersection!.object instanceof MapViewPoints) {
            pickResult.userData = featureData.objInfos[intersect.index!];
            return;
        }

        if (
            featureData.starts === undefined ||
            featureData.starts.length === 0 ||
            (typeof intersect.faceIndex !== "number" && intersect.index === undefined)
        ) {
            if (featureData.objInfos.length === 1) {
                pickResult.userData = featureData.objInfos[0];
            }
            return;
        }

        if (featureData.starts.length === 1) {
            pickResult.userData = featureData.objInfos[0];
            return;
        }

        const intersectIndex =
            typeof intersect.faceIndex === "number" ? intersect.faceIndex * 3 : intersect.index!;

        // TODO: Implement binary search.
        let objInfosIndex = 0;
        for (const featureStartIndex of featureData.starts) {
            if (featureStartIndex > intersectIndex) {
                break;
            }
            objInfosIndex++;
        }
        pickResult.userData = featureData.objInfos[objInfosIndex - 1];
    }

    public setupRaycaster(x: number, y: number): THREE.Raycaster {
        const camera = this.mapView.camera;
        const rayCaster = this.raycasterFromScreenPoint(x, y);

        // A threshold must be set for picking of line and line segments, indicating the maximum
        // distance in world units from the ray to a line to consider it as picked. Use the world
        // units equivalent to one pixel at the furthest intersection (i.e. intersection with ground
        // or far plane).
        const furthestIntersection = this.mapView.getWorldPositionAt(x, y, true);
        const furthestDistance =
            camera.position.distanceTo(furthestIntersection) /
            this.mapView.camera.getWorldDirection(tmpV3).dot(rayCaster.ray.direction);
        rayCaster.params.Line!.threshold = MapViewUtils.calculateWorldSizeByFocalLength(
            this.mapView.focalLength,
            furthestDistance,
            1
        );
        return rayCaster;
    }
}
