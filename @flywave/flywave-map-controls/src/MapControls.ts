/* Copyright (C) 2025 flywave.gl contributors */

import { ProjectionType } from "@flywave/flywave-geoutils";
import { type MapView } from "@flywave/flywave-mapview";
import { PickingRaycaster } from "@flywave/flywave-mapview/PickingRaycaster";
import { type ICameraCollidable } from "@flywave/flywave-mapview";
import { type Intersection, Raycaster, Vector2, Vector3 } from "three";

import { BaseMapControls, BaseMapControlsOptions, EventNames } from "./BaseMapControls";
import { EllipsoidCameraTransform } from "./EllipsoidCameraTransform";
import { PlanarCameraTransform } from "./PlanerCameraTransform";
import { CameraTransform } from "./CameraTransform";

export class MapControls extends BaseMapControls {
    protected rayCastWorld(result: Vector3, origin: Vector3, target: Vector3): number {
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
