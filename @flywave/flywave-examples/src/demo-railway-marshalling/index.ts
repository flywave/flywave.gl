import {
    MapView,
    GeoCoordinates,
    MapControls,
    MapControlsUI,
    TileRenderDataSource,
    sphereProjection,
    DEMTerrainSource,
    ArcGISTileProvider,
    MapViewEventNames,
    FeaturesDataSource,
    TransferManager,
    FeatureCollection,
    ModularMapViewMonitor
} from "@flywave/flywave.gl";
import * as THREE from "three";
import { RailwayDataSource } from "./RailwayDataSource";
import { TrackNetwork } from "./TrackNetwork";
import { TrainSimulator, RetarderInstanceData } from "./TrainSimulator";
import { SimulationUI } from "./SimulationUI";
import { ScenarioManager } from "./ScenarioManager";
import { CCTVOverlay } from "./CCTVOverlay";
import { SignalOverlay } from "./SignalOverlay";
import { DashboardOverlay } from "./DashboardOverlay";
// import { RailwayEditUI } from "./RailwayEditUI";

const TILESET_URL = "http://192.168.1.8/%E8%8E%B1%E9%98%B3%E7%AB%99/tileset.json";
const TERRAIN_ELEVATION = 39.7;

const createDEMTileUrl = (elevation: number, size: number = 8): string => {
    const c = document.createElement("canvas");
    c.width = size;
    c.height = size;
    const ctx = c.getContext("2d")!;
    const d = ctx.createImageData(size, size);
    const v = Math.round((elevation + 10000) * 10);
    const r = Math.floor(v / 65536),
        g = Math.floor((v % 65536) / 256),
        b = v % 256;
    for (let i = 0; i < size * size; i++) {
        d.data[i * 4] = r;
        d.data[i * 4 + 1] = g;
        d.data[i * 4 + 2] = b;
        d.data[i * 4 + 3] = 255;
    }
    ctx.putImageData(d, 0, 0);
    return c.toDataURL("image/png");
};

const getMapCanvas = (): HTMLCanvasElement => {
    const c = document.getElementById("mapCanvas") as HTMLCanvasElement;
    if (!c) throw new Error("Map canvas not found");
    return c;
};

const scene = new (class {
    mapView!: MapView;
    rds!: RailwayDataSource;
    sim!: TrainSimulator;
    ui!: SimulationUI;
    scenario!: ScenarioManager;
    lastTime = 0;
})();

const main = async () => {
    try {
        const canvas = getMapCanvas();
        scene.mapView = new MapView({
            projection: sphereProjection,
            target: new GeoCoordinates(36.9245, 120.7003, 61),
            tilt: 68.9,
            heading: 76.8,
            logarithmicDepthBuffer: false,
            minCameraHeight: 5,
            canvas,
            theme: {
                environment: { url: "cobblestone_street_night.webp" },
                lights: [
                    {
                        type: "ambient", // Ambient light
                        intensity: 0.5, // Light intensity
                        name: "ambientLight", // Light source name
                        color: "#ffffff" // Light source color
                    }
                ],
                extends: "resources/tilezen_base_globe.json",
                celestia: {
                    sunTime: (() => {
                        let d = new Date();
                        d.setMonth(12);
                        return d.setHours(13);
                    })(),
                    sunCastShadow: true,
                    atmosphere: true,
                    sunIntensity: 5
                },
                styles: {
                    "railway-labels": [
                        {
                            when: [
                                "all",
                                ["==", ["geometry-type"], "LineString"],
                                ["!=", ["get", "name"], null]
                            ],
                            technique: "text",
                            attr: {
                                text: ["get", "name"],
                                color: "#FFFFFF",
                                backgroundColor: "#1E3A5F",
                                backgroundOpacity: 0.85,
                                backgroundSize: 4,
                                size: 14,
                                fontName: "Noto Sans",
                                fontStyle: "Bold",
                                priority: 95,
                                vAlignment: "Above",
                                hAlignment: "Center"
                            }
                        },
                        {
                            when: [
                                "all",
                                ["==", ["geometry-type"], "LineString"],
                                ["==", ["get", "name"], null],
                                ["!=", ["get", "railway:track_ref"], null]
                            ],
                            technique: "text",
                            attr: {
                                text: ["get", "railway:track_ref"],
                                color: "#FFD700",
                                backgroundColor: "#333333",
                                backgroundOpacity: 0.8,
                                backgroundSize: 4,
                                size: 13,
                                fontName: "Noto Sans",
                                fontStyle: "Bold",
                                priority: 90,
                                vAlignment: "Above",
                                hAlignment: "Center"
                            }
                        }
                    ]
                },
                postEffects: {
                    hueSaturation: { hue: 0.17, saturation: 0.39, enabled: true },
                    bloom: {
                        enabled: true, // Enable bloom effect
                        luminancePassEnabled: true,
                        ignoreBackground: true,
                        luminancePassThreshold: 0.0, // Luminance threshold
                        strength: 5, // Strength
                        inverted: false,
                        radius: 0.8 // Radius
                    }
                }
            }
        });

        new ModularMapViewMonitor(scene.mapView);
        scene.mapView.mapRenderingManager.msaaEnabled = true;

        const mc = new MapControls(scene.mapView);
        canvas.parentElement!.appendChild(new MapControlsUI(mc).domElement);

        const ds3d = new TileRenderDataSource({
            url: TILESET_URL,
            errorTarget: 600,
            name: "Railway Station",
            castShadow: true,
            receiveShadow: true
        });
        scene.mapView.addDataSource(ds3d);
        const dem = new DEMTerrainSource({
            source: {
                bounds: [120.68, 36.95, 120.74, 37.0],
                minzoom: 0,
                maxzoom: 14,
                scheme: "xyz",
                tiles: [createDEMTileUrl(TERRAIN_ELEVATION)],
                type: "raster-dem",
                tileSize: 512
            }
        });
        dem.addWebTileDataSource(new ArcGISTileProvider({ minDataLevel: 0, maxDataLevel: 18 }));
        scene.mapView.setElevationSource(dem);

        const fds = new FeaturesDataSource({ styleSetName: "railway-labels", maxDataLevel: 20 });
        await scene.mapView.addDataSource(fds);
        const gj: FeatureCollection = await TransferManager.instance().downloadJson(
            "railway.geojson"
        );
        fds.setFromGeojson(gj);

        scene.rds = new RailwayDataSource({ name: "railway-sim" });
        await scene.mapView.addDataSource(scene.rds);

        const gj2: FeatureCollection = await TransferManager.instance().downloadJson(
            "railway.geojson"
        );
        const net = new TrackNetwork();
        net.buildFromGeoJSON(gj2, scene.rds);

        scene.sim = new TrainSimulator(scene.rds, net);
        await scene.sim.loadModels("Trainengine.glb", "Trainengine_Carriage2.glb", 1);
        await scene.sim.loadSignalModel("JIH5455721411.glb", 1);
        await scene.sim.loadRetarderModel("减速顶.glb");
        await scene.sim.loadEnvMap("kloofendal_48d_partly_cloudy_puresky.webp");

        scene.sim.createSignalAtPosition(
            "sig_junction",
            36.92522685669955,
            120.70159897255098,
            39.56208865530789,
            "三岔口信号",
            new THREE.Vector3(-1, 0, 0)
        );

        const sig = scene.sim.getSignals().get("sig_junction");
        if (sig) {
            const rm = scene.mapView.mapRenderingManager;
            rm.addBloomObject(sig.greenSphere);
            rm.addBloomObject(sig.redSphere);
        }

        const retarderData: RetarderInstanceData[] = await TransferManager.instance().downloadJson(
            "retarder_instances.json"
        );
        scene.sim.createRetarderInstances(
            "retarders",
            new THREE.Vector3(-2603288.9309376655, 4384201.177968957, 3831815.063558788),
            retarderData
        );

        const retarderData2: RetarderInstanceData[] = await TransferManager.instance().downloadJson(
            "retarder_instances2.json"
        );
        scene.sim.createRetarderInstances(
            "retarders2",
            new THREE.Vector3(-2603290.618175516, 4384196.361609221, 3831819.430787494),
            retarderData2
        );

        scene.scenario = new ScenarioManager(scene.sim);
        scene.ui = new SimulationUI(
            scene.sim,
            scene.scenario,
            () => sigOverlay.show(),
            () => sigOverlay.hide()
        );

        const DEG = Math.PI / 180;
        const cctv = new CCTVOverlay("CCTV-1 莱阳站");
        await cctv.init(
            scene.rds,
            "cctv.glb",
            new THREE.Vector3(-2603288.53, 4384206.77, 3831824.18),
            new THREE.Euler(-110 * DEG, 35 * DEG, -137 * DEG)
        );

        const sigOverlay = new SignalOverlay(scene.sim, scene.rds, "sig_junction");

        const dashboard = new DashboardOverlay();
        const simSlot = dashboard.getSimSlot();
        const uiContainer = document.getElementById("railway-ui");
        if (simSlot && uiContainer) {
            const style = uiContainer.querySelector("style");
            if (style) style.remove();
            const header = uiContainer.querySelector(".rui-header");
            if (header) header.remove();
            uiContainer.style.cssText = "";
            simSlot.appendChild(uiContainer);
        }

        // const gjEdit: FeatureCollection = await TransferManager.instance().downloadJson(
        //     "railway.geojson"
        // );
        // new RailwayEditUI(scene.mapView, mc, gjEdit);

        scene.mapView.addEventListener(MapViewEventNames.Render, () => {
            const n = performance.now();
            const dt = scene.lastTime > 0 ? (n - scene.lastTime) / 1000 : 0;
            scene.lastTime = n;
            scene.rds.updateSceneRoot();
            scene.sim.update(dt);
            scene.ui.update();
            cctv.update(scene.mapView.camera);
            sigOverlay.update(scene.mapView.camera);
        });

        (window as any).mv = scene.mapView;
        (window as any).sim = scene.sim;
        console.log("Railway marshalling demo initialized");
    } catch (e) {
        console.error("Init error:", e);
    }
};

main();
