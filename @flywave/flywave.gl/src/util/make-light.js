
import * as THREE from "three";
import { MapViewEventNames } from "@flywave/flywave-mapview";
import Simon1994PlanetaryPositions from "./simon1994planetarypositions";
import JulianDate from "./julian-date"
import { ShadowMapViewer } from "../debug/ShadowMapViewer";
import "../debug/UnpackDepthRGBAShader";
import { computeTemeToPseudoFixedMatrix, computeIcrfToFixedMatrix } from "../util/math-transfrom";

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

export default class SunLight {
    date = new Date();

    currenTime = new Date("2021 11 23 10:00");

    set castShadow(v){
        this.light.castShadow = v;
    }

    get castShadow(){
        return this.light.castShadow;
    }

    constructor(mapView) {
        this.mapView = mapView;
        // var light = new THREE.DirectionalLight();
        // this.mapView.scene.add(light)
        var light = new THREE.DirectionalLight(new THREE.Color(255, 255, 255), 0.005);
        mapView.scene.add(light);
        if (light === undefined) {
            throw new Error("Light for a sun was not found.");
        }

        this.directionalLightHelper = new THREE.DirectionalLightHelper(light, 10000);
        this.light = light;
        // mapView.scene.add(this.directionalLightHelper); 
        // mapView.addEventListener(MapViewEventNames.MovementFinished, this.update);

        this.light.castShadow = false;

        this.light.shadow.mapSize.x = 4096;
        this.light.shadow.mapSize.y = 4096;

        // var shadowCameraHelper = new THREE.CameraHelper(light.shadow.camera);
        // shadowCameraHelper.visible = true;
        // shadowCameraHelper.renderOrder = 5000;
        // mapView.scene.add(shadowCameraHelper);

        // var debugLight = new ShadowMapViewer(light);


        mapView.addEventListener(MapViewEventNames.Render, () => {
            // this.directionalLightHelper.update();
            this.update();
            // shadowCameraHelper.update();
        });
        // mapView.addEventListener(MapViewEventNames.AfterRender, () => {

        //     this.renderDebug(debugLight)
        // });

    };

    viewToLightSpace(viewPos, camera) {
        return viewPos.applyMatrix4(camera.matrixWorldInverse);
    }

    renderDebug(debugLight) {
        debugLight.position.x = 10;
        debugLight.position.y = 10;
        debugLight.size.width = 512;
        debugLight.size.height = 512;
        debugLight.update()

        if (this.light.shadow.map)
            debugLight.render(this.mapView.renderer);
    }

    update = () => {
        var t = JulianDate.fromDate(this.currenTime);
        var position = Simon1994PlanetaryPositions.computeSunPositionInEarthInertialFrame(
            t,
            new THREE.Vector3()
        );

        var transformMatrix = new THREE.Matrix3;
        computeTemeToPseudoFixedMatrix(t, transformMatrix.elements);

        position.applyMatrix3(transformMatrix);

        this.light.target.position.copy(this.mapView.worldTarget).sub(this.mapView.camera.position);
        this.light.position.copy(this.mapView.worldTarget).addScaledVector(position.normalize(), 10000).sub(this.mapView.camera.position);

        this.direction = this.light.position.clone().normalize().multiplyScalar(-1);

        // debug.position.copy(this.light.position);
        // this.light.position.copy(position).sub(this.mapView.camera.position);
        // this.light.target.position.copy(this.mapView.worldTarget).sub(this.mapView.camera.position);
        const transformedPoints = points.map((p, i) => this.mapView.ndcToView(p, new THREE.Vector3));

        this.light.updateMatrixWorld();
        this.light.target.updateMatrixWorld();

        this.light.shadow.updateMatrices(this.light);
        const camera = this.light.shadow.camera;
        const pointsInLightSpace = transformedPoints.map(p => this.viewToLightSpace(p.clone(), camera));
        const box = new THREE.Box3();
        pointsInLightSpace.forEach(point => {
            box.expandByPoint(point);
        });

        var distance = this.mapView.camera.position.distanceTo(this.mapView.worldTarget);

        var min = distance * (this.mapView.camera.fov * Math.PI / 180);
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

}
