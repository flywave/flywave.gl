/* Copyright (C) 2025 flywave.gl contributors */

import { ProjectionType } from "@flywave/flywave-geoutils";
import { type MapView } from "@flywave/flywave-mapview";
import { PickingRaycaster } from "@flywave/flywave-mapview/PickingRaycaster";
import { type ICameraCollidable } from "@flywave/flywave-mapview";
import type * as THREE from "three/webgpu";
import {
    type Intersection,
    PerspectiveCamera,
    Raycaster,
    Vector2,
    Vector3
} from "three/webgpu";

import { BaseMapControls, BaseMapControlsOptions, EventNames } from "./BaseMapControls";
import { EllipsoidCameraTransform } from "./EllipsoidCameraTransform";
import { PlanarCameraTransform } from "./PlanerCameraTransform";
import { CameraTransform } from "./CameraTransform";

export class MapControls extends BaseMapControls {
    /**
     * 位置 → 唯一碰撞值：任何碰撞操作，鼠标 xy 不变 → 返回锁定值；
     * 碰撞到值（GPU 深度）→ 锁定；xy 变化 → 重新碰撞。
     */
    private m_collisionLock: Vector3 | null = null;
    private m_collisionLockX: number = 0;
    private m_collisionLockY: number = 0;

    protected rayCastWorld(result: Vector3, origin: Vector3, target: Vector3): number {
        const weh = this.windowEventHandler;
        // 条件②：像素位置不变 → 锁定值生效
        if (
            this.m_collisionLock !== null &&
            Math.abs(weh.lastMouseX - this.m_collisionLockX) <= 2 &&
            Math.abs(weh.lastMouseY - this.m_collisionLockY) <= 2
        ) {
            result.copy(this.m_collisionLock);
            return this.mapView.camera.position.distanceTo(this.m_collisionLock);
        }

        // 条件③GPU碰撞开启 + 条件④碰撞到东西 → 锁定。（条件①：本方法只由鼠标操作触发）
        const gpuDistance = this.rayCastGpuDepth(result);
        if (gpuDistance > 0) {
            this.m_collisionLock = result.clone();
            this.m_collisionLockX = weh.lastMouseX;
            this.m_collisionLockY = weh.lastMouseY;
            return gpuDistance;
        }

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
            return intersection[0].distance;
        }
        return this.rayCastProjectionWorld(result, origin, target);
    }

    /**
     * GPU depth collision: when enableGpuPicking is on, read the GPU depth at
     * the cursor pixel — NDC via the system-standard
     * MapView.getNormalizedScreenCoordinates — and unproject it; fall back to
     * the CPU raycast on miss.
     *
     * pickDepth is rendered by the camera-relative render camera (at the
     * origin) — the depth MUST be unprojected with that camera, then shifted
     * into the geo frame the controls and CPU raycast use (same convention as
     * the CPU path's `.add(camera.position)`).
     */
    private rayCastGpuDepth(result: Vector3): number {
        const mrm = this.mapView.mapRenderingManager;
        if (!mrm.gpuPicking) return -1;

        const camera = this.mapView.camera;
        if (!(camera instanceof PerspectiveCamera)) return -1;

        const renderCam = mrm.viewRenderManager?.renderCamera;
        if (!renderCam) return -1;

        const ndc = this.mapView.getNormalizedScreenCoordinates(
            this.windowEventHandler.lastMouseX,
            this.windowEventHandler.lastMouseY
        );

        const gpuDepth = mrm.readDepth(ndc);

        if (gpuDepth !== null && gpuDepth > 0 && gpuDepth < 1) {
            const distance = this.buildGpuPoint(result, ndc, gpuDepth, camera, renderCam);
            if (distance > 0) {
                return distance;
            }
        }

        // 读取失败：用可靠的直读路径异步再读一次；读到后直接写入锁，
        // 下一拍锁定生效、zoom 启动。本拍返回 -1（继续等待）。
        this.fetchGpuDepthAsync(ndc, camera, renderCam);
        return -1;
    }

    private buildGpuPoint(
        result: Vector3,
        ndc: THREE.Vector2 | THREE.Vector3,
        gpuDepth: number,
        camera: PerspectiveCamera,
        renderCam: THREE.Camera
    ): number {
        result
            .set(ndc.x, ndc.y, gpuDepth * 2.0 - 1.0)
            .unproject(renderCam)
            .add(camera.position.clone().sub(renderCam.position));
        const distance = camera.position.distanceTo(result);
        // A hit closer than the near plane means the camera has reached
        // (or is inside) the picked surface — the depth is degenerate.
        if (distance < camera.near) {
            return -1;
        }
        return distance;
    }

    private m_gpuFetchBusy = false;

    /**
     * 读取失败继续等待：异步可靠直读光标像素深度，读到有效值后入锁。
     */
    private fetchGpuDepthAsync(
        ndc: THREE.Vector2 | THREE.Vector3,
        camera: PerspectiveCamera,
        renderCam: THREE.Camera
    ): void {
        if (this.m_gpuFetchBusy) return;
        const vrm = this.mapView.mapRenderingManager.viewRenderManager;
        if (!vrm) return;
        this.m_gpuFetchBusy = true;
        vrm.readDepthAsync(ndc)
            .then(depth => {
                this.m_gpuFetchBusy = false;
                if (depth === null || depth <= 0 || depth >= 1) return;
                const point = new Vector3();
                if (this.buildGpuPoint(point, ndc, depth, camera, renderCam) > 0) {
                    // 读取到值 → 直接入锁（同 xy）
                    this.m_collisionLock = point.clone();
                    this.m_collisionLockX = this.windowEventHandler.lastMouseX;
                    this.m_collisionLockY = this.windowEventHandler.lastMouseY;
                }
            })
            .catch(() => {
                this.m_gpuFetchBusy = false;
            });
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
