import * as THREE from "three";
import { MapViewEventNames } from "@flywave/flywave-mapview";
import Simon1994PlanetaryPositions from "../util/simon1994planetarypositions";
import JulianDate from "../util/julian-date";
import "../debug/ShadowMapViewer";
import "../debug/UnpackDepthRGBAShader";
import { computeTemeToPseudoFixedMatrix } from "../util/math-transfrom";

class SunLight extends THREE.Object3D {

    light = new THREE.DirectionalLight(new THREE.Color(255, 255, 255), 0.005);

    _debug = false;

    get debug() {
        return this._debug;
    }

    set debug(v) {
        this._debug = v;
        this.directionalLightHelper.visible = v;
    }

    constructor(mapView) {
        super();
        this.add(this.light);

        this.directionalLightHelper = new THREE.DirectionalLightHelper(this.light, 10000);
        this.mapView = mapView;

        this.addEventListener("removed", this.onRemoved);
        this.addEventListener("added", this.onAdded);
    }

    onRemoved = () => {
        this.mapView.removeEventListener(MapViewEventNames.Render, this.update);
    };

    onAdded = () => {
        this.mapView.addEventListener(MapViewEventNames.Render, this.update);
    };

    get mapSize() {
        return this.light.shadow.mapSize;
    }

    set castShadow(v) {
        this.light.castShadow = v;
    }

    get castShadow() {
        return this.light.castShadow;
    }

    currenTime = new Date("2021 11 23 10:00");

    update() {
        var t = JulianDate.fromDate(this.currenTime);
        var position = Simon1994PlanetaryPositions.computeSunPositionInEarthInertialFrame(
            t,
            new THREE.Vector3()
        );

        var transformMatrix = new THREE.Matrix3();
        computeTemeToPseudoFixedMatrix(t, transformMatrix.elements);

        position.applyMatrix3(transformMatrix);

        this.light.target.position.copy(this.mapView.worldTarget).sub(this.mapView.camera.position);
        this.light.position
            .copy(this.mapView.worldTarget)
            .addScaledVector(position.normalize(), 10000)
            .sub(this.mapView.camera.position);

        this.direction = this.light.position.clone().normalize().multiplyScalar(-1);

        this.mapView.atmosphere.m_lightDirection.copy(this.direction);
        
        // debug.position.copy(this.light.position);
        // this.light.position.copy(position).sub(this.mapView.camera.position);
        // this.light.target.position.copy(this.mapView.worldTarget).sub(this.mapView.camera.position);
        const transformedPoints = points.map((p, i) =>
            this.mapView.ndcToView(p, new THREE.Vector3())
        );

        this.light.updateMatrixWorld();
        this.light.target.updateMatrixWorld();

        this.light.shadow.updateMatrices(this.light);
        const camera = this.light.shadow.camera;
        const pointsInLightSpace = transformedPoints.map(p =>
            this.viewToLightSpace(p.clone(), camera)
        );
        const box = new THREE.Box3();
        pointsInLightSpace.forEach(point => {
            box.expandByPoint(point);
        });

        var distance = this.mapView.camera.position.distanceTo(this.mapView.worldTarget);

        var min = distance * ((this.mapView.camera.fov * Math.PI) / 180);
        camera.left = Math.max(box.min.x, -min);
        camera.right = Math.min(box.max.x, min);
        camera.top = Math.min(box.max.y, min);
        camera.bottom = Math.max(box.min.y, -min);
        // Moving back to the light the near plane in order to catch high buildings, that
        // are not visible by the camera, but existing on the scene.

        camera.near = -box.max.z * 0.95;
        camera.far = -box.min.z;

        camera.updateProjectionMatrix();
    }

    fromOptions({ color, intensity, currenTime, castShadow, mapSize }) {
        this.light.color.set(color);
        this.light.intensity = parseFloat(intensity);
        this.currenTime = new Date(currenTime);
        this.light.castShadow = castShadow;
        this.mapSize.fromArray(mapSize);
        return this;
    }
}

export { SunLight };
