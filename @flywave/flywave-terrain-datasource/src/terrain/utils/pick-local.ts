import { MapView, MapViewUtils } from "@flywave/flywave-mapview";
import { PickingRaycaster } from "@flywave/flywave-mapview/src/PickingRaycaster";
import * as THREE from "three";

const tmpV3 = new THREE.Vector3();

class PickLocal {
    private readonly camera: THREE.Camera;
    private readonly m_pickingRaycaster: PickingRaycaster;
    private readonly mapView: MapView;

    constructor(mapView: MapView) {
        this.camera = mapView.getRteCamera();
        this.m_pickingRaycaster = new PickingRaycaster(
            mapView.renderer.getSize(new THREE.Vector2())
        );
        this.mapView = mapView;
    }

    intersectMapObjects(x: number, y: number, objects: THREE.Object3D[]): THREE.Intersection[] {
        const rayCaster = this.setupRaycaster(x, y);
        const intersects: THREE.Intersection[] = [];
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

    private setupRaycaster(x: number, y: number): THREE.Raycaster {
        const camera = this.mapView.camera;
        const rayCaster = this.raycasterFromScreenPoint(x, y);

        const furthestIntersection = this.mapView.getWorldPositionAt(x, y, true);
        const furthestDistance =
            camera.position.distanceTo(furthestIntersection) /
            this.mapView.camera.getWorldDirection(tmpV3).dot(rayCaster.ray.direction);

        rayCaster.params.Line.threshold = MapViewUtils.calculateWorldSizeByFocalLength(
            this.mapView.focalLength,
            furthestDistance,
            1
        );
        return rayCaster;
    }
}

export default PickLocal;
