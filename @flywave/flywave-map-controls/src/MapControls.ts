import { Vector3 } from "three";
import { EllipsoidCameraTransform } from "./EllipsoidCameraTransform";
import { PlanarCameraTransform } from "./PlanerCameraTransform";
import { BaseMapControls, EventNames } from "./BaseMapControls";
import { MapView } from "@flywave/flywave-mapview";
import { ProjectionType } from "@flywave/flywave-geoutils";

export class MapControls extends BaseMapControls {
    protected rayCastWorld(result: Vector3, origin: Vector3, target: Vector3): number {
        return this.rayCastProjectionWorld(result, origin, target);
    }

    constructor(mapView: MapView) {
        super(
            mapView,
            mapView.projection.type == ProjectionType.Planar
                ? new PlanarCameraTransform(mapView, {
                      hitCountPrecision: 0.01
                  })
                : new EllipsoidCameraTransform(mapView, {
                      hitCountPrecision: 0.01
                  })
        );
    }

    // ==============
    // Ray Casting
    // ==============

    protected rayCastProjectionWorld(result: Vector3, origin: Vector3, target: Vector3): number {
        return this.cameraTransform.rayCastProjectionWorld(result, origin, target);
    }
}

export { EventNames };
