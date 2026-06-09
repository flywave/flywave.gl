import {
    MapView,
    MapControls,
    MapControlsUI,
    MapViewEventNames,
    ellipsoidProjection,
    GeoCoordinates
} from "@flywave/flywave.gl";
import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { ModelDisplayDataSource } from "./ModelDisplayDataSource";
import { ExplodeView } from "./ExplodeView";

const MODEL_URL = "dungouji.glb";
const ENVMAP_URL = "kloofendal_48d_partly_cloudy_puresky.webp";

const getMapCanvas = (): HTMLCanvasElement => {
    const c = document.getElementById("mapCanvas") as HTMLCanvasElement;
    if (!c) throw new Error("Map canvas not found");
    return c;
};

const main = async () => {
    try {
        const canvas = getMapCanvas();

        const mapView = new MapView({
            enablePolarDataSource: false,
            canvas,
            target: new GeoCoordinates(90, 0, 0),
            logarithmicDepthBuffer: true,
            maxGeometryHeight: 1000,
            projection: ellipsoidProjection,
            distance: 300,
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

        const uiContainer = document.createElement("div");
        uiContainer.style.cssText = `
            position: absolute;
            top: 16px;
            right: 16px;
            z-index: 1000;
            display: flex;
            flex-direction: column;
            gap: 8px;
        `;

        const createButton = (label: string, onClick: () => void) => {
            const btn = document.createElement("button");
            btn.textContent = label;
            btn.style.cssText = `
                padding: 8px 16px;
                background: rgba(30, 58, 95, 0.85);
                color: #fff;
                border: 1px solid rgba(255,255,255,0.2);
                border-radius: 6px;
                cursor: pointer;
                font-size: 13px;
                font-family: sans-serif;
                transition: background 0.2s;
            `;
            btn.addEventListener("mouseenter", () => {
                btn.style.background = "rgba(30, 58, 95, 1)";
            });
            btn.addEventListener("mouseleave", () => {
                btn.style.background = "rgba(30, 58, 95, 0.85)";
            });
            btn.addEventListener("click", onClick);
            return btn;
        };

        const explodeBtn = createButton("拆解", () => {
            explodeView.toggle();
            explodeBtn.textContent = explodeView.isExploded ? "复原" : "拆解";
        });
        uiContainer.appendChild(explodeBtn);

        const axialBtn = createButton("轴向拆解", () => {
            explodeView.setMode("axial");
            if (!explodeView.isExploded) {
                explodeView.explode();
                explodeBtn.textContent = "复原";
            }
        });
        uiContainer.appendChild(axialBtn);

        const radialBtn = createButton("径向拆解", () => {
            explodeView.setMode("radial");
            if (!explodeView.isExploded) {
                explodeView.explode();
                explodeBtn.textContent = "复原";
            }
        });
        uiContainer.appendChild(radialBtn);

        const resetBtn = createButton("重置视角", () => {
            if (explodeView.isExploded) {
                explodeView.collapse();
                explodeBtn.textContent = "拆解";
            }
            mc.setHeading(0);
            mc.setTilt((45 * Math.PI) / 180);
        });
        uiContainer.appendChild(resetBtn);

        const infoDiv = document.createElement("div");
        infoDiv.style.cssText = `
            padding: 12px 16px;
            background: rgba(0,0,0,0.6);
            color: #fff;
            border-radius: 8px;
            font-size: 13px;
            font-family: sans-serif;
            line-height: 1.6;
        `;
        infoDiv.innerHTML = `
            <div style="font-size:15px;font-weight:bold;margin-bottom:4px;">盾构机 (TBM)</div>
            <div>全断面隧道掘进机</div>
            <div style="margin-top:4px;color:#aaa;">鼠标左键旋转 / 滚轮缩放 / 右键平移</div>
        `;
        uiContainer.appendChild(infoDiv);

        canvas.parentElement!.appendChild(uiContainer);

        (window as any).mv = mapView;
        (window as any).model = model;
    } catch (e) {
        console.error("Init error:", e);
    }
};

main();
