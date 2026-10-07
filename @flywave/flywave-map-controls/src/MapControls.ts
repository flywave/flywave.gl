/* Copyright (C) 2025 flywave.gl contributors */

import { ProjectionType } from "@flywave/flywave-geoutils";
import { type ICameraCollidable, type MapView } from "@flywave/flywave-mapview";
import { PickingRaycaster } from "@flywave/flywave-mapview/PickingRaycaster";
import { type Intersection, Vector2, Vector3 } from "three/webgpu";

import { type BaseMapControlsOptions, BaseMapControls, EventNames } from "./BaseMapControls";
import { type CameraTransform } from "./CameraTransform";
import { EllipsoidCameraTransform } from "./EllipsoidCameraTransform";
import { PlanarCameraTransform } from "./PlanerCameraTransform";

export class MapControls extends BaseMapControls {
    /**
     * High-frequency collision guard for zoom: while the wheel is being spammed and the
     * cursor stays still (+-2px), reuse the locked collision point; the ray is cast only
     * after the cursor moves and then re-locks. Other operations (click / drag / rotate)
     * take the classic ray path and do not consume the lock.
     */
    private m_collisionLock: Vector3 | null = null;
    private m_collisionLockX: number = 0;
    private m_collisionLockY: number = 0;

    protected rayCastWorld(
        result: Vector3,
        origin: Vector3,
        target: Vector3,
        noFallback?: boolean,
        screenX?: number,
        screenY?: number
    ): number {
        const weh = this.windowEventHandler;

        // zoom (wheel): if the cursor has not left the locked pixel -> zero collision cost this tick, reuse the locked point directly.
        if (
            noFallback &&
            this.m_collisionLock !== null &&
            Math.abs(weh.lastMouseX - this.m_collisionLockX) <= 2 &&
            Math.abs(weh.lastMouseY - this.m_collisionLockY) <= 2
        ) {
            result.copy(this.m_collisionLock);
            return this.mapView.camera.position.distanceTo(this.m_collisionLock);
        }

        // Tier 1: data source raycast (terrain / 3D Tiles etc. participate according to
        // enableCameraCollision; terrain sources participate by default). The hit point is
        // in render space and is translated back to the geo frame.
        const canvasClientSize = this.mapView.getCanvasClientSize();
        const rayCaster = new PickingRaycaster(
            new Vector2(canvasClientSize.width, canvasClientSize.height)
        );

        rayCaster.ray.set(origin, target.clone().sub(origin).normalize());

        const intersection: Intersection[] = [];

        this.getTilesRenderDataSources().forEach(datasource => {
            datasource.raycast(rayCaster, intersection);
        });

        if (intersection.length > 0) {
            intersection.sort((a, b) => a.distance - b.distance);
            result.copy(intersection[0].point).add(this.mapView.camera.position);
            if (noFallback) {
                this.m_collisionLock = result.clone();
                this.m_collisionLockX = weh.lastMouseX;
                this.m_collisionLockY = weh.lastMouseY;
            }
            return intersection[0].distance;
        }

        // Tier 2 fallback: MapView screen-space picking. Coordinate convention:
        // getWorldPositionAt expects "real screen" client coordinates (i.e. lastMouseX/Y);
        // the mouseX/Y passed around inside the controls are flipped by canvasWidth/Height
        // and must not be passed through -- explicit coordinates are only provided by
        // entry points like pickPoint that do the conversion themselves. GPU depth hits the
        // surface rendered in the previous frame (including terrain / building meshes);
        // during a gesture the depth slot goes stale as the camera moves, so it
        // automatically degenerates to intersecting the mathematical surface (sphere /
        // z=0 plane). Returns geo-frame coordinates, so no further translation is needed.
        const worldPos = this.mapView.getWorldPositionAt(
            screenX ?? weh.lastMouseX,
            screenY ?? weh.lastMouseY,
            false
        );
        if (worldPos !== null) {
            result.copy(worldPos);
            if (noFallback) {
                this.m_collisionLock = result.clone();
                this.m_collisionLockX = weh.lastMouseX;
                this.m_collisionLockY = weh.lastMouseY;
            }
            return this.mapView.camera.position.distanceTo(worldPos);
        }
        return -1;
    }

    protected getTilesRenderDataSources(): ICameraCollidable[] {
        return this.mapView.dataSources.filter(
            item => item.enableCameraCollision && typeof (item as any).raycast === "function"
        ) as unknown as ICameraCollidable[];
    }

    private readonly m_cameraTransformPlanar: CameraTransform;
    private readonly m_cameraTransformEllipsoid: CameraTransform;

    constructor(mapView: MapView, options?: BaseMapControlsOptions) {
        super(mapView, options);
        this.m_cameraTransformPlanar = new PlanarCameraTransform(mapView);
        this.m_cameraTransformEllipsoid = new EllipsoidCameraTransform(mapView);

        this.addEventListener(EventNames.BeginInteraction, () => {
            mapView.stopCameraAnimation();
        });

        this.startAnimation();
    }

    protected get cameraTransform(): CameraTransform {
        return this.mapView.projection.type == ProjectionType.Planar
            ? this.m_cameraTransformPlanar
            : this.m_cameraTransformEllipsoid;
    }

    public pickPoint(x: number, y: number): Vector3 | null {
        const result = new Vector3();
        const origin = new Vector3();
        const target = new Vector3();
        this.cameraTransform.unprojectToWorld(
            origin,
            this.canvasWidth - x,
            this.canvasHeight - y,
            0
        );
        this.cameraTransform.unprojectToWorld(
            target,
            this.canvasWidth - x,
            this.canvasHeight - y,
            -1
        );
        // unproject builds the ray with canvasWidth - x / canvasHeight - y, and the GPU
        // fallback samples the same pixel, keeping the ray and the depth reading consistent.
        const distance = this.rayCastWorld(
            result,
            origin,
            target,
            undefined,
            this.canvasWidth - x,
            this.canvasHeight - y
        );
        if (distance > 0) {
            return result;
        }
        return null;
    }
}

export { EventNames };
