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
     * 射线只在光标移动后执行一次并重新入锁；点击/拖拽/旋转等其他操作
     * 走经典射线路径，不消费锁。
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

        // 一级：数据源射线检测（地形/3D Tiles 等按 enableCameraCollision
        // 参与，地形源默认参与）。命中点是 render 空间，平移回 geo 帧。
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

        // 二级兜底：MapView 屏幕取点。坐标约定：getWorldPositionAt 需要
        // "真实屏幕" client 坐标（即 lastMouseX/Y）；controls 内部流转的
        // mouseX/Y 是 canvasWidth/Height 翻转后的坐标，勿透传——显式坐标
        // 只由 pickPoint 这类自带换算的入口提供。GPU 深度命中上一帧渲染
        // 表面（含地形/建筑网格）；手势期间深度槽因相机移动而冷，自动退化
        // 为数学表面（球面 / z=0 平面）求交。返回 geo 帧坐标，无需再平移。
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
        // unproject 用 canvasWidth - x / canvasHeight - y 构造射线，GPU
        // 兜底查同一像素，保证射线与深度读数一致。
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
