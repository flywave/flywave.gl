import {
    MapView,
    GeoCoordinates,
    ellipsoidProjection,
    sphereProjection,
    MapControls,
    MapControlsUI,
    DEMTerrainSource,
    ArcGISTileProvider,
    CopyrightElementHandler,
    MapViewEventNames,
    ModularMapViewMonitor
} from "@flywave/flywave.gl";
import * as THREE from "three/webgpu";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { GUI } from "dat.gui";

const CONFIG = {
    INITIAL_COORDS: new GeoCoordinates(36.48619699228674, 118.17270928364879, 500),
    TILT: 52,
    DEM_SOURCE_PATH: "dem_terrain/source.json",
    MODEL_ANCHOR: new GeoCoordinates(36.48619699228674, 118.17270928364879, 350),
    MARKER_COLOR_GPU: 0x00ff44,
    MARKER_COLOR_CPU: 0xff6600,
    MARKER_RADIUS: 6
};

const canvas = document.getElementById("mapCanvas") as HTMLCanvasElement;

const mapView = new MapView({
    projection: sphereProjection,
    target: CONFIG.INITIAL_COORDS,
    tilt: CONFIG.TILT,
    enableGpuPicking: true,
    canvas,
    theme: {
        extends: "resources/tilezen_base_globe.json",
        atmosphere: { enabled: true }
    }
});

const mapControls = new MapControls(mapView);
const ui = new MapControlsUI(mapControls);
canvas.parentElement!.appendChild(ui.domElement);
CopyrightElementHandler.install("copyrightNotice", mapView);

const demTerrain = new DEMTerrainSource({ source: CONFIG.DEM_SOURCE_PATH });
mapView.setElevationSource(demTerrain);
demTerrain.addWebTileDataSource(new ArcGISTileProvider({ minDataLevel: 0, maxDataLevel: 18 }));

new ModularMapViewMonitor(mapView);

window.addEventListener("resize", () => mapView.resize(window.innerWidth, window.innerHeight));
mapView.resize(window.innerWidth, window.innerHeight);
mapView.beginAnimation();

interface PlacedModel {
    object: THREE.Object3D;
    name: string;
}

class GPUDepthPickExample {
    private gui: GUI;
    private models: PlacedModel[] = [];
    private mouseMarker: THREE.Mesh | null = null;
    private mouseMarkerGroup = new THREE.Group();
    private lastMouseNdc = new THREE.Vector2(0, 0);
    private pendingDepthRead = false;
    private clock = new THREE.Clock();

    private stats = {
        gpuEnabled: true,
        depthHits: 0,
        depthMisses: 0,
        cpuFallbacks: 0,
        lastDepth: "-",
        lastWorldPos: "-",
        lastGeoPos: "-",
        hoveredModel: "-",
        source: "-"
    };

    constructor(private mapView: MapView) {
        this.gui = new GUI({ width: 320 });
        // @ts-ignore
        this.mouseMarkerGroup.anchor = CONFIG.MODEL_ANCHOR;
        this.mapView.mapAnchors.add(this.mouseMarkerGroup);
        this.setupGUI();
        this.setupMouseTracking();
        this.setupRenderHook();
    }

    private getVRM(): any {
        return (this.mapView as any).mapRenderingManager?.viewRenderManager;
    }

    private setupGUI() {
        const depthFolder = this.gui.addFolder("GPU Depth Readback");
        depthFolder
            .add(this.stats, "gpuEnabled")
            .name("Enable GPU Picking")
            .onChange((v: boolean) => {
                const vrm = this.getVRM();
                if (vrm) {
                    vrm.gpuPicking = v;
                    vrm.needsUpdate = true;
                }
            });
        depthFolder.add(this.stats, "source").name("Depth Source").listen();
        depthFolder.add(this.stats, "depthHits").name("GPU Depth Hits").listen();
        depthFolder.add(this.stats, "cpuFallbacks").name("CPU Fallbacks").listen();
        depthFolder.add(this.stats, "lastDepth").name("Last Depth (0-1)").listen();
        depthFolder.open();

        const posFolder = this.gui.addFolder("Mouse World Position");
        posFolder.add(this.stats, "lastWorldPos").name("World XYZ").listen();
        posFolder.add(this.stats, "lastGeoPos").name("Geo Lat/Lon/Alt").listen();
        posFolder.add(this.stats, "hoveredModel").name("Hovered Model").listen();
        posFolder.open();

        const modelsFolder = this.gui.addFolder("Placed Models");
        modelsFolder
            .add({ addBuilding: () => this.addRandomBox() }, "addBuilding")
            .name("Add Building");
        modelsFolder.add({ addGLTF: () => this.loadGLTFModel() }, "addGLTF").name("Add GLTF Model");
        modelsFolder.add({ clearAll: () => this.clearModels() }, "clearAll").name("Clear All");
        modelsFolder.open();
    }

    private setupMouseTracking() {
        this.mapView.canvas.addEventListener("mousemove", (e: MouseEvent) => {
            this.handleMouseMove(e);
        });
        this.mapView.canvas.addEventListener("click", (e: MouseEvent) => {
            this.handleClick(e);
        });
    }

    private handleMouseMove(e: MouseEvent) {
        const x = e.layerX;
        const y = e.layerY;
        this.lastMouseNdc = this.mapView.getNormalizedScreenCoordinates(x, y);

        const worldPos = this.mapView.getWorldPositionAt(x, y);
        if (!worldPos) {
            this.stats.depthMisses++;
            return;
        }

        const vrm = this.getVRM();
        if (vrm && this.stats.gpuEnabled) {
            const ndcVec = new THREE.Vector2(this.lastMouseNdc.x, this.lastMouseNdc.y);
            const depthVal = vrm.readDepth(ndcVec);
            if (depthVal != null && depthVal > 0 && depthVal < 1) {
                this.stats.depthHits++;
                this.stats.lastDepth = depthVal.toFixed(6);
                this.stats.source = "GPU";
            } else {
                this.stats.cpuFallbacks++;
                this.stats.source = "CPU (warming)";
            }
        } else {
            this.stats.cpuFallbacks++;
            this.stats.source = "CPU (disabled)";
        }

        const geo = this.mapView.projection.unprojectPoint(worldPos);
        this.stats.lastWorldPos = `${worldPos.x.toFixed(1)}, ${worldPos.y.toFixed(
            1
        )}, ${worldPos.z.toFixed(1)}`;
        this.stats.lastGeoPos = `${geo.latitude.toFixed(5)}, ${geo.longitude.toFixed(5)}, ${(
            geo.altitude ?? 0
        ).toFixed(1)}`;

        this.updateMouseMarker(worldPos);
        this.checkModelHover(x, y);
    }

    private handleClick(e: MouseEvent) {
        const x = e.layerX;
        const y = e.layerY;
        const worldPos = this.mapView.getWorldPositionAt(x, y);
        if (!worldPos) return;

        const geo = this.mapView.projection.unprojectPoint(worldPos);
        console.log(
            `[GPU Depth] click → lat=${geo.latitude.toFixed(6)} lon=${geo.longitude.toFixed(
                6
            )} alt=${(geo.altitude ?? 0).toFixed(2)}`
        );
    }

    private updateMouseMarker(worldPos: THREE.Vector3) {
        if (this.mouseMarker) {
            this.mouseMarkerGroup.remove(this.mouseMarker);
            this.mouseMarker.geometry.dispose();
            (this.mouseMarker.material as THREE.Material).dispose();
        }
        const geo = new THREE.SphereGeometry(CONFIG.MARKER_RADIUS, 12, 12);
        const mat = new THREE.MeshBasicMaterial({
            color: this.stats.source.startsWith("GPU")
                ? CONFIG.MARKER_COLOR_GPU
                : CONFIG.MARKER_COLOR_CPU,
            transparent: true,
            opacity: 0.85,
            depthTest: false
        });
        this.mouseMarker = new THREE.Mesh(geo, mat);
        this.mouseMarker.renderOrder = 9999;
        const anchorWorld = ellipsoidProjection.projectPoint(
            CONFIG.MODEL_ANCHOR,
            new THREE.Vector3()
        );
        this.mouseMarker.position.copy(worldPos).sub(anchorWorld);
        this.mouseMarkerGroup.add(this.mouseMarker);
    }

    private checkModelHover(x: number, y: number) {
        const ndc = this.mapView.getNormalizedScreenCoordinates(x, y);
        const raycaster = new THREE.Raycaster();
        raycaster.setFromCamera(ndc, this.mapView.camera);

        let closest: { model: PlacedModel; dist: number } | null = null;
        for (const m of this.models) {
            const hits = raycaster.intersectObject(m.object, true);
            if (hits.length > 0) {
                if (!closest || hits[0].distance < closest.dist) {
                    closest = { model: m, dist: hits[0].distance };
                }
            }
        }
        this.stats.hoveredModel = closest ? closest.model.name : "-";
    }

    private addRandomBox() {
        const angles = this.models.length * 0.7;
        const offset = 60;
        const x = Math.cos(angles) * offset;
        const z = Math.sin(angles) * offset;

        const h = 40 + Math.random() * 80;
        const geo = new THREE.BoxGeometry(20 + Math.random() * 30, h, 20 + Math.random() * 30);
        const mat = new THREE.MeshStandardNodeMaterial({
            color: new THREE.Color().setHSL(Math.random(), 0.7, 0.5),
            roughness: 0.6,
            metalness: 0.1
        });
        const mesh = new THREE.Mesh(geo, mat);
        mesh.position.set(x, h / 2, z);
        mesh.castShadow = true;
        mesh.receiveShadow = true;

        const group = new THREE.Group();
        group.add(mesh);
        // @ts-ignore
        group.anchor = CONFIG.MODEL_ANCHOR;
        this.mapView.mapAnchors.add(group);

        const name = `Building-${this.models.length + 1}`;
        this.models.push({ object: group, name });
        console.log(`[GPU Depth] placed ${name}`);
    }

    private loadGLTFModel() {
        const loader = new GLTFLoader();
        loader.load(
            "Xbot.glb",
            gltf => {
                const model = gltf.scene;
                model.scale.setScalar(30);
                model.position.set((Math.random() - 0.5) * 120, 0, (Math.random() - 0.5) * 120);
                model.traverse((c: THREE.Object3D) => {
                    if ((c as THREE.Mesh).isMesh) {
                        c.castShadow = true;
                        c.receiveShadow = true;
                    }
                });
                const group = new THREE.Group();
                group.add(model);
                // @ts-ignore
                group.anchor = CONFIG.MODEL_ANCHOR;
                this.mapView.mapAnchors.add(group);

                const name = `GLTF-${this.models.length + 1}`;
                this.models.push({ object: group, name });
                console.log(`[GPU Depth] loaded ${name}`);
            },
            undefined,
            err => console.error("[GPU Depth] GLTF load error:", err)
        );
    }

    private clearModels() {
        for (const m of this.models) {
            this.mapView.mapAnchors.remove(m.object);
        }
        this.models = [];
        console.log("[GPU Depth] cleared all models");
    }

    private setupRenderHook() {
        this.mapView.addEventListener(MapViewEventNames.Render, () => {
            const t = this.clock.getElapsedTime();
            for (let i = 0; i < this.models.length; i++) {
                const child = this.models[i].object.children[0] as THREE.Mesh;
                if (child && child.geometry instanceof THREE.BoxGeometry) {
                    child.rotation.y = t * 0.15 + i;
                }
            }
        });
    }
}

const example = new GPUDepthPickExample(mapView);

example["addRandomBox"]();
example["addRandomBox"]();
example["addRandomBox"]();

// @ts-ignore
window.mapView = mapView;
// @ts-ignore
window.example = example;
