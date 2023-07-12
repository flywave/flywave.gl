import * as THREE from "three";
import { MapViewEventNames } from "@flywave/flywave-mapview";
import Simon1994PlanetaryPositions from "../util/simon1994planetarypositions";
import JulianDate from "../util/julian-date";
import "../debug/ShadowMapViewer";
import "../debug/UnpackDepthRGBAShader";
import { computeTemeToPseudoFixedMatrix } from "../util/math-transfrom";

const points = [
    // near plane points
    { x: -1, y: -1, z: -1 },
    { x: 1, y: -1, z: -1 },
    { x: -1, y: 1, z: -1 },
    { x: 1, y: 1, z: -1 },
    // far planes points
    { x: -1, y: -1, z: 1 },
    { x: 1, y: -1, z: 1 },
    { x: -1, y: 1, z: 1 },
    { x: 1, y: 1, z: 1 }
];

class SunLight extends THREE.Object3D {
    lightType = "sun-light";

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

        this.light.shadow.mapSize.x = 4096;
        this.light.shadow.mapSize.y = 4096;

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
        this.light && (this.light.castShadow = v);
    }

    get castShadow() {
        return this.light.castShadow;
    }

    currenTime = new Date("2021 11 23 10:00");

    viewToLightSpace(viewPos, camera) {
        return viewPos.applyMatrix4(camera.matrixWorldInverse);
    }

    intensity = 1;

    update = () => {
        this.light.intensity =
            parseFloat(this.intensity == undefined ? 1 : this.intensity) *
            (1 / Math.max(Math.abs(this.currenTime.getHours() - 12), 1));

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

        this.direction = this.light.position.clone().normalize();

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
    };

    fromOptions({ color, intensity, hours, castShadow, mapSize }) {
        this.light.color.set(color == undefined ? 0xffffff : color);
        if (hours == undefined) {
            hours = 5;
        }
        this.intensity = intensity || this.intensity;
        this.currenTime.setHours(hours);
        this.light.castShadow = castShadow;
        if (mapSize) {
            this.mapSize.fromArray(mapSize);
        }
        return this;
    }

    toOptions() {
        return {
            color: `#${this.light.color.getHexString()}`,
            intensity: this.light.intensity,
            currenTime: this.currenTime.getTime(),
            castShadow: this.castShadow,
            mapSize: this.mapSize.toArray()
        };
    }

    clone() {
        return new THREE.Object3D();
    }
}

export { SunLight };
