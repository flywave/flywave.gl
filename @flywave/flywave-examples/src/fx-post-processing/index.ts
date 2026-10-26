/* Copyright (C) 2025 flywave.gl contributors */

/**
 * Post-processing playground on a small glowing scene: the full parameter
 * panel via {@link PostProcessingGUIModule}, selective outline via
 * `mapRenderingManager.addOutlineObject`, and selective bloom via
 * `addBloomObject` including dynamic spawn/despawn at runtime.
 */

import {
    ArcGISTileProvider,
    GeoCoordinates,
    type MapAnchor,
    MapView,
    MapViewEventNames,
    PostProcessingGUIModule
} from "@flywave/flywave.gl";
import { GUI } from "dat.gui";
import {
    BoxGeometry,
    type BufferGeometry,
    Color,
    ConeGeometry,
    CylinderGeometry,
    Group,
    Mesh,
    MeshBasicNodeMaterial,
    SphereGeometry,
    TorusGeometry,
    type Object3D
} from "three/webgpu";

import {
    applyPanelStyle,
    createExampleGui,
    createExampleMap,
    demoTerrain,
    logExampleInfo
} from "../common";

/** Scene center (Shandong, China). */
const CENTER = { lat: 36.4902, lng: 118.1742 };

/** Objects spawned through the dynamic-bloom GUI, oldest despawned first. */
const dynamicBloomObjects: Mesh[] = [];

/** Create an unlit translucent mesh whose opacity and color pulse over time. */
function createPulsingGlow(geometry: BufferGeometry, color: number, pulseSpeed: number): Mesh {
    const material = new MeshBasicNodeMaterial({
        color: new Color(color),
        transparent: true,
        opacity: 0.5
    });
    const mesh = new Mesh(geometry, material);
    let time = Math.random() * Math.PI * 2;
    mesh.userData.animate = (delta: number): void => {
        time += delta * pulseSpeed;
        const pulse = Math.sin(time) * 0.3 + 0.7;
        material.opacity = 0.3 + pulse * 0.4;
        material.color = new Color(color).multiplyScalar(0.8 + pulse * 0.4);
    };
    return mesh;
}

/** The glow cluster: static core sphere, bloom-registered ring, pulsing satellites. */
function createGlowCluster(mapView: MapView): Group {
    const group = new Group();

    const core = new Mesh(
        new SphereGeometry(50, 16, 16),
        new MeshBasicNodeMaterial({ color: 0xff6b6b, transparent: true, opacity: 0.6 })
    );
    group.add(core);

    // Only the ring is bloom-registered in this cluster.
    const ring = new Mesh(
        new TorusGeometry(80, 15, 16, 32),
        new MeshBasicNodeMaterial({ color: 0x4ecdc4, transparent: true, opacity: 0.4 })
    );
    ring.rotation.x = Math.PI / 2;
    mapView.mapRenderingManager.addBloomObject(ring);
    group.add(ring);

    const satellites: Mesh[] = [];
    for (let i = 0; i < 6; i++) {
        const angle = (i / 6) * Math.PI * 2;
        const satellite = createPulsingGlow(new SphereGeometry(20, 12, 12), 0x45b7d1, 3 + i * 0.5);
        satellite.position.set(Math.cos(angle) * 120, Math.sin(angle) * 120, 0);
        group.add(satellite);
        satellites.push(satellite);
    }

    group.userData.animate = (delta: number): void => {
        group.rotation.z += delta * 0.5;
        group.rotation.y += delta * 0.3;
        satellites.forEach(satellite => satellite.userData.animate?.(delta));
    };
    return group;
}

/** Beacon tower: bloom-registered base/mid tier, outline target as a group. */
function createBeaconTower(mapView: MapView): Group {
    const tower = new Group();

    const base = new Mesh(
        new CylinderGeometry(60, 80, 40, 8),
        new MeshBasicNodeMaterial({ color: 0xffa726, transparent: true, opacity: 0.6 })
    );
    const middle = new Mesh(
        new CylinderGeometry(40, 60, 60, 8),
        new MeshBasicNodeMaterial({ color: 0x66bb6a, transparent: true, opacity: 0.7 })
    );
    middle.position.y = 50;
    const top = new Mesh(
        new ConeGeometry(30, 80, 8),
        new MeshBasicNodeMaterial({ color: 0xab47bc, transparent: true, opacity: 0.8 })
    );
    top.position.y = 110;
    const beacon = createPulsingGlow(new SphereGeometry(25, 16, 16), 0xffeb3b, 4);
    beacon.position.y = 150;

    tower.add(base, middle, top, beacon);
    mapView.mapRenderingManager.addBloomObject(base);
    mapView.mapRenderingManager.addBloomObject(middle);
    return tower;
}

/** Spawn a glowing object near the center and register it for selective bloom. */
function spawnDynamicBloomObject(mapView: MapView): Mesh {
    const mesh: MapAnchor<Mesh> = createPulsingGlow(
        Math.random() > 0.5 ? new SphereGeometry(25, 12, 12) : new BoxGeometry(40, 40, 40),
        new Color().setHSL(Math.random(), 0.9, 0.6).getHex(),
        2 + Math.random() * 3
    );
    mesh.anchor = new GeoCoordinates(
        CENTER.lat + (Math.random() - 0.5) * 0.002,
        CENTER.lng + (Math.random() - 0.5) * 0.002,
        500 + Math.random() * 200
    );
    mapView.mapAnchors.add(mesh);
    mapView.mapRenderingManager.addBloomObject(mesh);
    dynamicBloomObjects.push(mesh);
    mapView.update();
    return mesh;
}

/** Remove a dynamically spawned object together with its bloom registration. */
function despawnDynamicBloomObject(mapView: MapView, mesh: Mesh): void {
    const index = dynamicBloomObjects.indexOf(mesh);
    if (index === -1) {
        return;
    }
    dynamicBloomObjects.splice(index, 1);
    mapView.mapRenderingManager.removeBloomObject(mesh);
    mapView.mapAnchors.remove(mesh);
    mapView.update();
}

/** Outline folder driving the selective depth-edge pass on the tower. */
function setupOutlineGui(mapView: MapView, tower: Object3D, gui: GUI): void {
    const mrm = mapView.mapRenderingManager;
    const state = {
        enabled: true,
        thickness: mrm.outline.thickness,
        color: mrm.outline.color
    };
    // Push into the effect, then sync so the VRM picks it up without a full
    // pipeline rebuild.
    const applyOutline = (): void => {
        mrm.updateOutline({ thickness: state.thickness, color: state.color });
        mrm.syncPostEffectsToVRM();
        mapView.update();
    };

    const folder = gui.addFolder("Outline (selective)");
    folder.add(state, "enabled").onChange((value: boolean) => {
        value ? mrm.addOutlineObject(tower) : mrm.removeOutlineObject(tower);
        mapView.update();
    });
    folder.add(state, "thickness", 1, 10, 1).name("thickness (px)").onFinishChange(applyOutline);
    folder.addColor(state, "color").onFinishChange(applyOutline);
}

/** Dynamic bloom folder: manual spawn/despawn plus an automatic loop. */
function setupDynamicBloomGui(mapView: MapView, gui: GUI): void {
    const state = { count: 0, auto: false };
    let autoTimer: ReturnType<typeof setInterval> | null = null;
    const syncCount = (): void => {
        state.count = dynamicBloomObjects.length;
    };
    const spawn = (): void => {
        spawnDynamicBloomObject(mapView);
        syncCount();
    };
    const despawnOldest = (): void => {
        const oldest = dynamicBloomObjects[0];
        if (oldest !== undefined) {
            despawnDynamicBloomObject(mapView, oldest);
        }
        syncCount();
    };
    const despawnAll = (): void => {
        while (dynamicBloomObjects.length > 0) {
            despawnOldest();
        }
    };

    const folder = gui.addFolder("Dynamic bloom (spawn/despawn)");
    folder.add(state, "count").listen().name("live count");
    folder.add({ spawn }, "spawn").name("spawn one");
    folder.add({ despawn: despawnOldest }, "despawn").name("despawn oldest");
    folder.add({ clear: despawnAll }, "clear").name("despawn all");
    folder
        .add(state, "auto")
        .name("auto loop")
        .onChange((value: boolean) => {
            if (autoTimer !== null) {
                clearInterval(autoTimer);
                autoTimer = null;
            }
            if (value) {
                autoTimer = setInterval(() => {
                    // Bounded population: retire the oldest past the cap.
                    spawnDynamicBloomObject(mapView);
                    if (dynamicBloomObjects.length > 12) {
                        despawnDynamicBloomObject(mapView, dynamicBloomObjects[0]);
                    }
                    syncCount();
                }, 700);
            }
        });
}

/** Example entry. */
async function main(): Promise<void> {
    const canvas = document.getElementById("mapCanvas") as HTMLCanvasElement;
    const { mapView } = await createExampleMap(canvas, {
        themeObject: {
            extends: "resources/tilezen_base_globe.json",
            lights: [],
            atmosphere: { enabled: true, sunTime: new Date().setHours(19, 0, 0, 0) },
            postEffects: {
                bloom: {
                    enabled: true,
                    luminancePassThreshold: 0.1,
                    strength: 2.5,
                    radius: 1.12
                }
            }
        },
        lookAt: {
            target: { ...CENTER, alt: 900 },
            zoomLevel: 17,
            tilt: 45,
            heading: 1.54
        }
    });
    logExampleInfo("fx-post-processing", mapView);

    const terrain = demoTerrain();
    mapView.setElevationSource(terrain);
    terrain.addWebTileDataSource(new ArcGISTileProvider({ minDataLevel: 0, maxDataLevel: 18 }));

    const cluster: MapAnchor<Group> = createGlowCluster(mapView);
    cluster.anchor = new GeoCoordinates(CENTER.lat, CENTER.lng, 500);
    mapView.mapAnchors.add(cluster);

    const tower: MapAnchor<Group> = createBeaconTower(mapView);
    tower.anchor = new GeoCoordinates(CENTER.lat + 0.0008, CENTER.lng + 0.0008, 450);
    mapView.mapAnchors.add(tower);
    // Demo the selective depth-edge outline on the tower.
    mapView.mapRenderingManager.addOutlineObject(tower);

    // Full post-processing parameter panel plus the outline/bloom folders.
    await mapView.getTheme();
    const gui = createExampleGui();
    applyPanelStyle(gui.domElement);
    new PostProcessingGUIModule(mapView, gui).open();
    setupOutlineGui(mapView, tower, gui);
    setupDynamicBloomGui(mapView, gui);

    // Drive the scene animations from MapView's on-demand frame loop.
    let lastTime = performance.now();
    mapView.addEventListener(MapViewEventNames.Update, () => {
        const now = performance.now();
        const delta = Math.min((now - lastTime) / 1000, 0.1);
        lastTime = now;
        [cluster, tower, ...dynamicBloomObjects].forEach(object =>
            object.userData.animate?.(delta)
        );
    });
    mapView.beginAnimation();
}

void main();
