import {
    MapView,
    MapControls,
    ellipsoidProjection,
    GeoCoordinates,
    WindowEventHandler,
    MapViewEventNames
} from "@flywave/flywave.gl";
import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { ModelDisplayDataSource } from "./ModelDisplayDataSource";
import { ExplodeView, type ExplodePart } from "./ExplodeView";
import { ModelHighlighter } from "./ModelHighlighter";
import { UIManager } from "./UIManager";
import { getPartInfo } from "./mockData";

const MODEL_URL = "dungouji.glb";
const ENVMAP_URL = "kloofendal_48d_partly_cloudy_puresky.webp";

const main = async () => {
    try {
        const canvas = document.getElementById("mapCanvas") as HTMLCanvasElement;

        const mapView = new MapView({
            enablePolarDataSource: false,
            canvas,
            target: new GeoCoordinates(
                89.99132938177085,
                70.95494731411642,
                0.0000028349459171295166
            ),
            tilt: 64.30439935505709,
            heading: -64.75131505164961,
            logarithmicDepthBuffer: true,
            maxGeometryHeight: 1000,
            projection: ellipsoidProjection,
            distance: 3000,
            theme: {
                extends: "resources/tilezen_base_globe.json",
                environment: { url: ENVMAP_URL },
                celestia: {
                    sunCastShadow: true,
                    enableSunLight: true,
                    sunIntensity: 4,
                    sunShadowBias: -0.00005
                },
                lights: [],
                postEffects: {
                    hueSaturation: { hue: 0.17, saturation: 0.39, enabled: true },
                    bloom: {
                        enabled: true,
                        luminancePassEnabled: true,
                        ignoreBackground: true,
                        luminancePassThreshold: 0.0,
                        strength: 5,
                        inverted: false,
                        radius: 0.8
                    },
                    outline: {
                        enabled: false,
                        thickness: 0.3,
                        color: "#00ff88",
                        ghostExtrudedPolygons: false
                    }
                }
            }
        });

        mapView.mapRenderingManager.msaaEnabled = true;
        const mc = new MapControls(mapView);

        const ds = new ModelDisplayDataSource({ name: "shield-machine-display" });
        await mapView.addDataSource(ds);

        const loader = new GLTFLoader();
        const gltf = await loader.loadAsync(MODEL_URL);
        const model = gltf.scene;

        model.traverse(child => {
            if ((child as THREE.Mesh).isMesh) {
                child.castShadow = true;
                child.receiveShadow = true;
            }
        });

        const wrapper = new THREE.Group();
        wrapper.add(model);
        ellipsoidProjection.projectPoint(new GeoCoordinates(90, 0, 300), wrapper.position);
        ds.addObject("shield-machine", wrapper);

        const explodeView = new ExplodeView(model, 1.0);
        const parts = explodeView.getParts();

        const cutterheadParts = explodeView.getCutterheadParts();
        const cutterheadPivot = new THREE.Group();
        const explodableRoot = explodeView.getExplodableRoot();
        explodableRoot.add(cutterheadPivot);
        for (const p of cutterheadParts) {
            explodableRoot.remove(p.wrapper);
            cutterheadPivot.add(p.wrapper);
        }

        const highlighter = new ModelHighlighter(parts);
        highlighter.setRaycasterProvider((x, y) =>
            mapView.pickHandler.raycasterFromScreenPoint(x, y)
        );
        highlighter.setOutlineProvider({
            selectOutlineObject: obj => mapView.mapRenderingManager.selectOutlineObject(obj),
            clearOutlineSelection: () => mapView.mapRenderingManager.clearOutlineSelection(),
            setOutlineEnabled: enabled =>
                mapView.mapRenderingManager.updateOutline({
                    thickness: 0.3,
                    color: "#00ff88",
                    ghostExtrudedPolygons: false,
                    edgeStrength: 5,
                    pulseSpeed: enabled ? 1.5 : 0,
                    enabled
                })
        });

        for (const part of parts) {
            const pos = new THREE.Vector3();
            part.object.getWorldPosition(pos);
            part.wrapper.userData.partInfo = getPartInfo(part.object.name || "", pos.z);
        }

        const eventHandler = new WindowEventHandler(canvas);
        eventHandler.addEventListener("mouseclick", (e: any) => {
            const hit = highlighter.hitTest(e.layerX, e.layerY);
            if (hit) {
                highlighter.toggleFocus(hit);
                if (highlighter.isFocused) {
                    const info = hit.wrapper.userData.partInfo;
                    if (info) {
                        ui.showPartInfo(info, hit.object.name);
                    }
                } else {
                    ui.showOverview();
                }
            } else if (highlighter.isFocused) {
                highlighter.unfocus();
                ui.showOverview();
            }
        });

        const ui = new UIManager({
            onExplodeAxial: () => {
                explodeView.setMode("axial");
                explodeView.explode();
                ui.setExplodeButtonActive("axial");
            },
            onExplodeRadial: () => {
                explodeView.setMode("radial");
                explodeView.explode();
                ui.setExplodeButtonActive("radial");
            },
            onCollapse: () => {
                explodeView.collapse();
                ui.setExplodeButtonActive(null);
            },
            onReset: () => {
                explodeView.collapse();
                explodeView.setMode("axial");
                highlighter.unfocus();
                ui.showOverview();
                ui.setExplodeButtonActive(null);
                mc.setHeading(0);
                mc.setTilt((45 * Math.PI) / 180);
            }
        });

        ui.mount(canvas.parentElement!);

        mapView.addEventListener(MapViewEventNames.Render, () => {
            explodeView.updateSSECulling(mapView.camera, mapView.renderer);
        });

        const spinCutterhead = () => {
            cutterheadPivot.rotation.z += 0.005;
            mapView.update();
            requestAnimationFrame(spinCutterhead);
        };
        spinCutterhead();

        (window as any).mv = mapView;
        (window as any).model = model;
    } catch (e) {
        console.error("Init error:", e);
    }
};

main();
