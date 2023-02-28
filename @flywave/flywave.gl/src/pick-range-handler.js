import makePickFrustum from "./util/rang-frustum";
import { PickingRaycaster } from "@flywave/flywave-mapview/lib/PickingRaycaster";
import { MapViewUtils } from "@flywave/flywave-mapview";
import { Vector3 } from "three";

var tmpV3 = new Vector3;

class PickRangeHandler {
  constructor(mapView, camera) {
    this.mapView = mapView;
    this.camera = camera;
    this.m_pickingRaycaster = new PickingRaycaster(
      mapView.renderer.getSize(new THREE.Vector2())
    );
  }

  intersectMapObjects(x, y, size) {
    // const frustum = this.setupFrustum(x, y, size);
    const rayCaster = this.setupRaycaster(x, y);

    var intersects = [];
    intersects.length = 0;
    // for (const child of this.mapView.mapAnchors.children) {
    // child.traverseVisible((e) => {
    //   if (e.userData.feature && e.isMesh) {
    //     if (frustum.intersectsObject(e)) {
    //       intersects.push(e);
    //     }
    //   }
    // })
    // }

    var ret = [];

    rayCaster.intersectObjects(this.mapView.mapAnchors.children, true, ret);
    // rayCaster.intersectObjects(intersects, true, ret);

    ret.sort((a, b) => a.distance - b.distance)
    return ret;
  }

  raycasterFromScreenPoint(x: number, y: number): THREE.Raycaster {
    this.m_pickingRaycaster.setFromCamera(
      this.mapView.getNormalizedScreenCoordinates(x, y),
      this.mapView.m_rteCamera
    );

    this.mapView.renderer.getSize(this.m_pickingRaycaster.canvasSize);
    return this.m_pickingRaycaster;
  }

  setupRaycaster(x: number, y: number): THREE.Raycaster {
    const camera = this.mapView.camera;
    const rayCaster = this.raycasterFromScreenPoint(x, y);

    const furthestIntersection = this.mapView.getWorldPositionAt(x, y, true);
    const furthestDistance =
      camera.position.distanceTo(furthestIntersection) /
      this.mapView.camera.getWorldDirection(tmpV3).dot(rayCaster.ray.direction);
    rayCaster.params.Line.threshold =
      MapViewUtils.calculateWorldSizeByFocalLength(
        this.mapView.focalLength,
        furthestDistance,
        1
      );
    return rayCaster;
  }

  setupFrustum(x, y, size) {
    return makePickFrustum(
      x,
      y,
      size, size,
      this.mapView.camera,
      (x, y) => {
        return this.mapView.getNormalizedScreenCoordinates(x, y);
      }
    );
  }
}

export default PickRangeHandler;
