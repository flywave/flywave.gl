/* Copyright (C) 2025 flywave.gl contributors */

import { ProjectionType } from "@flywave/flywave-geoutils";
import { type MapView } from "@flywave/flywave-mapview";
import { PickingRaycaster } from "@flywave/flywave-mapview/PickingRaycaster";
import { type ICameraCollidable } from "@flywave/flywave-mapview";
import { type Intersection, Vector2, Vector3 } from "three/webgpu";

import { BaseMapControls, BaseMapControlsOptions, EventNames } from "./BaseMapControls";
import { EllipsoidCameraTransform } from "./EllipsoidCameraTransform";
import { PlanarCameraTransform } from "./PlanerCameraTransform";
import { CameraTransform } from "./CameraTransform";

export class MapControls extends BaseMapControls {
    /**
     * zoom 高频碰撞防护：滚轮连拍期间光标不动（±2px）→ 复用锁定的碰撞点，
     * CPU 射线只在光标移动后执行一次并重新入锁；点击/拖拽/旋转等其他操作
     * 走经典 CPU 射线路径，不消费锁。
     */
    private m_collisionLock: Vector3 | null = null;
    private m_collisionLockX: number = 0;
    private m_collisionLockY: number = 0;

    protected rayCastWorld(
        result: Vector3,
        origin: Vector3,
        target: Vector3,
        noFallback?: boolean
    ): number {
        const weh = this.windowEventHandler;

        // zoom（滚轮）：光标未离开锁定像素 → 本拍零碰撞，直接复用锁定点。
        if (
            noFallback &&
            this.m_collisionLock !== null &&
            Math.abs(weh.lastMouseX - this.m_collisionLockX) <= 2 &&
            Math.abs(weh.lastMouseY - this.m_collisionLockY) <= 2
        ) {
            result.copy(this.m_collisionLock);
            return this.mapView.camera.position.distanceTo(this.m_collisionLock);
        }

        // 经典 CPU 射线检测（GPU 碰撞引入之前的原始实现）。
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

        const distance = this.rayCastProjectionWorld(result, origin, target);
        if (noFallback && distance > 0) {
            this.m_collisionLock = result.clone();
            this.m_collisionLockX = weh.lastMouseX;
            this.m_collisionLockY = weh.lastMouseY;
        }
        return distance;
    }

    protected getTilesRenderDataSources(): ICameraCollidable[] {
        return this.mapView.dataSources.filter(
            item => item.enableCameraCollision && typeof (item as any).raycast === "function"
        ) as unknown as ICameraCollidable[];
    }

    private m_cameraTransformPlanar: CameraTransform;
    private m_cameraTransformEllipsoid: CameraTransform;

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
        const distance = this.rayCastWorld(result, origin, target);
        if (distance > 0) {
            return result;
        }
        return null;
    }

    protected rayCastProjectionWorld(result: Vector3, origin: Vector3, target: Vector3): number {
        return this.cameraTransform.rayCastProjectionWorld(result, origin, target);
    }
}

export { EventNames };
