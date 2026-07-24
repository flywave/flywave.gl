import { MapView, GeoCoordinates, ellipsoidProjection } from "@flywave/flywave.gl";

const getMapCanvas = (): HTMLCanvasElement => {
    const canvas = document.getElementById("mapCanvas") as HTMLCanvasElement;
    if (!canvas) {
        throw new Error("Canvas #mapCanvas not found");
    }
    return canvas;
};

const canvas = getMapCanvas();

const mapView = new MapView({
    projection: ellipsoidProjection,
    target: new GeoCoordinates(35.0, 30.0, 300),
    zoomLevel: 17,
    tilt: 45,
    heading: 0,
    canvas: canvas,
    theme: {
        celestia: {
            atmosphere: true,
            sunCastShadow: true,
            clouds: true,
            sunTime: new Date().setHours(12, 0)
        }
    }
});

mapView.beginAnimation();

// 直接设置camera的position和quaternion，和cloud-render完全一致
const camPos = [4529606.670615005, 2614762.716348598, 3638805.5858316943];
const camQuat = [
    0.341611239061481, 3.177626864111724e-11, -0.42250890119681356, 0.8395165214314373
];

const overrideCamera = () => {
    const cam = mapView.camera;
    cam.position.set(camPos[0], camPos[1], camPos[2]);
    cam.quaternion.set(camQuat[0], camQuat[1], camQuat[2], camQuat[3]);
    cam.rotation.order = "XYZ";
    cam.updateMatrixWorld();
};

// 每帧覆盖
let frameCount = 0;
setInterval(() => {
    overrideCamera();
    const atmoCtx = (mapView.scene as any).__atmosphereContext;
    if (frameCount < 60 && frameCount % 20 === 0) {
        console.log(
            `frame ${frameCount}: atmoCtx=${!!atmoCtx} atmoCtx.camera=${!!atmoCtx?.camera} camPos=${mapView.camera.position.x.toFixed(
                0
            )},${mapView.camera.position.y.toFixed(0)},${mapView.camera.position.z.toFixed(0)}`
        );
    }
    frameCount++;
}, 0);
