import { EarthFreeControl } from "./earth-free-control";
import { MapViewEventNames } from "@flywave/flywave-mapview";
import { GeoCoordinates } from "@flywave/flywave-geoutils";
import * as THREE from "three";
import { Vector3 } from "three";
import gsap from "gsap";
import { MapViewUtils } from "@flywave/flywave-mapview";

MapViewUtils.MAX_TILT_RAD = (60 * Math.PI) / 180;
class MapOrbitControl {
    zoomLevelDeltaOnControl = 1;

    constructor(application, earthFreeControl) {
        this._control = earthFreeControl || new EarthFreeControl();
        this._control.bindApplication(application, application.window);

        this.mapView = application;
        this.window = application.window;
        this.mapView.addEventListener(MapViewEventNames.Render, this.onUpdate);

        var geocoord = this._control.unprojectPoint(this.mapView.camera.position);
        this._control.setTo(
            geocoord.longitude,
            geocoord.latitude,
            geocoord.altitude,
            0,
            Math.PI / 10,
            0
        );
    }

    onEventUpdate = () => {
        if (
            this._control.omouseDown[0] ||
            this._control.omouseDown[1] ||
            this._control.omouseDown[2]
        ) {
            this.onUpdate();
            return true;
        }

        return false;
    };

    flyPath = (lineString, duration, tension) => {
        if (this.__pathAnimation) {
            this.__pathAnimation.kill();
        }

        var linePos = [];
        lineString.geometry.coordinates.forEach(
            c => (linePos = linePos.concat(new GeoCoordinates(c[1], c[0], c[2])))
        );

        const curve = new THREE.CatmullRomCurve3(
            linePos.map(e => this._control.projectPoint(e, new THREE.Vector3())),
            false,
            undefined,
            tension
        );

        const animationProgress = { value: 0 };

        const _tmp = new THREE.Vector3();
        var _preValue = -1;
        var pathAnimation = gsap.fromTo(
            animationProgress,
            {
                value: 0
            },
            {
                value: 1,
                duration: duration || 10,
                paused: true,
                ease: "none",
                immediateRender: true,
                lazy: false,
                onUpdateParams: [animationProgress],
                onUpdate: ({ value }) => {
                    if (value == 1) {
                        return;
                    }
                    var inv = value < _preValue;

                    _preValue = value;
                    if (_tmp.length() == 0) {
                        curve.getPoint(value, _tmp);
                    }
                    var position1 = _tmp.clone();
                    curve.getPoint(value, _tmp);
                    var position2 = _tmp.clone();
                    var dir = position1.sub(position2);
                    if (inv) {
                        dir.negate();
                    }

                    var lnglat = this._control.unprojectPoint(_tmp);
                    if (dir.length() == 0) return;

                    this._control.setToWithVector(
                        lnglat.lng,
                        lnglat.lat,
                        lnglat.altitude,
                        dir.length() != 0 && dir.normalize().toArray()
                    );
                    const { cameraToWorld } = this._control.camera;
                    var mat = new THREE.Matrix4();
                    mat.elements = cameraToWorld;
                    mat.decompose(
                        this.mapView.camera.position,
                        this.mapView.camera.quaternion,
                        this.mapView.camera.scale
                    );

                    if (pathAnimation && pathAnimation.onUpdate) {
                        pathAnimation.onUpdate(value);
                    }
                    if (pathAnimation && pathAnimation.completed) return;
                    if (pathAnimation && pathAnimation.paused()) {
                        this.disable = false;
                        this.panEnabled = true;
                    } else {
                        this.disable = true;
                        this.panEnabled = false;
                    }
                },
                onStart: () => {
                    this.disable = true;
                    this.panEnabled = false;
                },
                onComplete: () => {
                    this.disable = false;
                    this.panEnabled = true;
                    pathAnimation.completed = true;
                    pathAnimation.onComplete && pathAnimation.onComplete();
                    this._control.updateCenter();
                }
            }
        );
        pathAnimation.play(0);

        pathAnimation.pauseCamera = rel => {
            pathAnimation.pause();
            if (rel) {
                this.disable = false;
                this.panEnabled = true;
                this._control.updateCenter();
            }
        };

        pathAnimation.progressCamera = v => {
            pathAnimation.progress(v);
            this.disable = true;
            this.panEnabled = false;
        };

        pathAnimation.killCameraAnim = () => {
            pathAnimation.kill();
            this.disable = false;
            this.panEnabled = true;
            this._control.updateCenter();
        };

        this.__pathAnimation = pathAnimation;
        return pathAnimation;
    };

    onUpdate = () => {
        if (this.disable) return;
        this._control.cameraToUnit = this.mapView.camera.projectionMatrix.elements;
        this._control.update();
        const { cameraToWorld } = this._control.camera;

        var mat = new THREE.Matrix4();
        mat.elements = cameraToWorld;
        mat.decompose(
            this.mapView.camera.position,
            this.mapView.camera.quaternion,
            this.mapView.camera.scale
        );
    };

    dispose() {
        this.mapView.removeEventListener(MapViewEventNames.Render, this.onUpdate);
    }

    enableCameraSwivel(v) {
        this._control.camera_swivel = v;
    }

    lockCenterPoint(x, y, z) {
        this._control.lockCenterPoint = [x, y, z];
    }

    clearLockCenterPoint() {
        this._control.lockCenterPoint = null;
    }

    flyTo(lng, lat, camVdistance, speed, centerDistance, theta, phi, toCityMode, completeCallBack) {
        this._control.flyTo(
            lat,
            lng,
            camVdistance,
            speed,
            centerDistance,
            theta,
            phi,
            toCityMode,
            completeCallBack
        );
    }

    setTo(lon, lat, z, alt, theta, phi, x) {
        this._control.setTo(lon, lat, z, alt, theta, phi, x);
    }

    animateTilt(t) {
        this._control.animateTilt(t);
    }

    animateZoom(t) {
        this._control.animateZoom(t);
    }

    setTilt(t) {
        this._control.setTilt(t);
    }

    getHeading() {
        return this._control.getHeading();
    }

    getTilt() {
        return this._control.getTilt();
    }

    animateHeading(h) {
        this._control.animateHeading(h);
    }

    setHeading(h) {
        this._control.setHeading(h);
    }

    animatePan(x, y) {
        this._control.animatePan(x, y);
    }

    pointToNorth() {
        this._control.setHeading(0);
    }

    toggleTilt() {
        this._control.setTilt(-Math.PI / 4);
    }

    setZoomLevel(t) {
        const { width, height } = this.mapView.getCanvasClientSize();
        this.window.lastMouseX = width / 2;
        this.window.lastMouseY = height / 2;
        this.window.lastMouseZ +=
            ((t - this.mapView.zoomLevel) / Math.abs(t - this.mapView.zoomLevel)) * 10;
    }

    rayCastToGlobeAndSceneAt(reslut, origin, target, x, y, hitCountPrecision, noPickMap) {
        return this._control.rayCastToGlobeAndScene(
            reslut,
            origin,
            target,
            x,
            y,
            hitCountPrecision,
            false,
            noPickMap
        );
    }

    getWorldPositionAt(layerX, layerY, noPickMap) {
        var z = [];
        var F = [];
        var v = [];
        this._control.camera.getOrigin(F);
        this._control.camera.unprojectToWorld(
            z,
            this._control,
            this._control.width - layerX,
            this._control.height - layerY,
            -1
        );
        var C = this.rayCastToGlobeAndSceneAt(v, F, z, layerX, layerY, 0.001, noPickMap);

        return this._control.unprojectPoint(new THREE.Vector3().fromArray(v));
    }

    flyToBox(geoBox, speed, theta, phi) {
        const { projection, camera } = this.mapView;
        var box = projection.projectBox(geoBox);
        var d = (box.min.distanceTo(box.max) * 0.5) / Math.tan(((camera.fov / 2) * Math.PI) / 180);
        const { longitude, latitude } = geoBox.center;
        this.flyTo(longitude, latitude, 0, speed || 0.1, d, theta, phi);
    }

    get zoomLevelTargeted() {
        return this.mapView.zoomLevel;
    }

    set zoomEnabled(v) {
        this.window.zoomEnabled = v;
        if (!v) this._control.smooth_zoom = this._control.prevMouseZ = this.window.lastMouseZ = 0;
    }

    set panEnabled(v) {
        this.window.panEnabled = v;
    }

    get distanceLimit() {
        return this._control.distance_limit;
    }

    set distanceLimit(distance) {
        this._control.distance_limit = distance;
    }

    get center() {
        return new Vector3().fromArray(this._control.lasthit_center);
    }

    get geoCenter() {
        return this._control.unprojectPoint(this.center);
    }

    set geoCenter(geoCenter) {
        const [lon, lat, z] = geoCenter.toGeoPoint();
        return this._control.setTo(lon, lat, z, 0, this.getTilt(), this.getHeading());
    }

    setEllipsoidMaximumDepth(maximumDepth) {
        this._control.setEllipsoidMaximumDepth(maximumDepth);
    }

    getEllipsoidMaximumDepth() {
        return this._control.getEllipsoidMaximumDepth();
    }
}

export { MapOrbitControl };
