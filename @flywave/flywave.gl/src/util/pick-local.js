import { MapViewUtils } from "@flywave/flywave-mapview";
import { PickingRaycaster } from "@flywave/flywave-mapview/lib/PickingRaycaster";
import * as THREE from "three";

const tmpV3 = new THREE.Vector3();
class PickLocal {
    constructor(mapView) {
        this.camera = mapView.m_rteCamera;
        this.m_pickingRaycaster = new PickingRaycaster(
            mapView.renderer.getSize(new THREE.Vector2())
        );
        this.mapView = mapView;
    }

    intersectMapObjects(x, y, objects) {
        const rayCaster = this.setupRaycaster(x, y);

        var intersects = [];
        rayCaster.intersectObjects(objects, true, intersects);
        return intersects;
    }

    raycasterFromScreenPoint(x: number, y: number): THREE.Raycaster {
        this.m_pickingRaycaster.setFromCamera(
            this.mapView.getNormalizedScreenCoordinates(x, y),
            this.camera
        );

        this.mapView.renderer.getSize(this.m_pickingRaycaster.canvasSize);
        return this.m_pickingRaycaster;
    }

    setupRaycaster(x, y) {
        const camera = this.mapView.camera;
        const rayCaster = this.raycasterFromScreenPoint(x, y);
        // A threshold must be set for picking of line and line segments, indicating the maximum
        // distance in world units from the ray to a line to consider it as picked. Use the world
        // units equivalent to one pixel at the furthest intersection (i.e. intersection with ground
        // or far plane).
        const furthestIntersection = this.mapView.getWorldPositionAt(x, y, true);
        const furthestDistance = camera.position.distanceTo(furthestIntersection) /
            this.mapView.camera.getWorldDirection(tmpV3).dot(rayCaster.ray.direction);
        rayCaster.params.Line.threshold = MapViewUtils.calculateWorldSizeByFocalLength(this.mapView.focalLength, furthestDistance, 1);
        return rayCaster;
    }
}

export default PickLocal;