import {
    MapView,
    GeoCoordinates,
    MapControls,
    MapControlsUI,
    DEMTerrainSource,
    ArcGISTileProvider,
    MapViewEventNames,
    PostProcessingGUIModule,
    FeaturesDataSource,
    ArcGISWebTileDataSource,
    sphereProjection
} from "@flywave/flywave.gl";
import * as THREE from "three";
import { GUI } from "dat.gui";

const CONFIG = {
    CANVAS_ELEMENT_ID: "mapCanvas",
    DEM_SOURCE_PATH: "dem_terrain/source.json",
    INITIAL_COORDINATES: new GeoCoordinates(36.4902, 118.1742, 900),
    TILT: 45,
    ZOOM_LEVEL: 17,
    HEADING: 1.5413763202653008
};

interface MarkerData {
    name: string;
    lat: number;
    lng: number;
    height: number;
    type: "point" | "line" | "polygon";
    color?: string;
}

class ComprehensiveMapApp {
    private mapView: MapView | null = null;
    private canvas: HTMLCanvasElement | null = null;
    private gui: GUI | null = null;
    private featuresDataSource: FeaturesDataSource | null = null;
    private animatedObjects: THREE.Object3D[] = [];
    private clock: THREE.Clock;

    constructor() {
        this.clock = new THREE.Clock();
        this.initialize();
    }

    private async initialize(): Promise<void> {
        try {
            this.canvas = this.getMapCanvas();
            
            this.mapView = this.initializeMapView();
            
            this.initializeMapControls();
            
            this.configureDEMTerrainSource();
            
            this.featuresDataSource = await this.createFeaturesDataSource();
            
            this.addBackgroundDataSource();
            
            this.addGlowingObjects();
            
            this.addDataMarkers();
            
            this.initializeGUI();
            
            this.startAnimationLoop();
            
            console.log("Comprehensive Map Application initialized successfully");
        } catch (error) {
            console.error("Error initializing Comprehensive Map Application:", error);
        }
    }

    private getMapCanvas(): HTMLCanvasElement {
        const canvas = document.getElementById(CONFIG.CANVAS_ELEMENT_ID) as HTMLCanvasElement;
        if (!canvas) {
            throw new Error(`Map canvas element not found, please ensure there is a canvas element with id '${CONFIG.CANVAS_ELEMENT_ID}' in HTML`);
        }
        return canvas;
    }

    private initializeMapView(): MapView {
        const mapView = new MapView({
            projection: sphereProjection,
            target: CONFIG.INITIAL_COORDINATES,
            zoomLevel: CONFIG.ZOOM_LEVEL,
            tilt: CONFIG.TILT,
            logarithmicDepthBuffer: false,
            heading: CONFIG.HEADING,
            canvas: this.canvas!,
            theme: {
                extends: "resources/tilezen_base_globe.json",
                lights: [
                    {
                        type: "ambient",
                        color: "#ffffff",
                        intensity: 0.3,
                        name: "ambient"
                    },
                ],
                celestia: {
                    atmosphere: true,
                    sunTime: new Date().setHours(17, 0, 0, 0),
                },
                postEffects: {
                    bloom: {
                        enabled: true,
                        luminancePassEnabled: true,
                        luminancePassThreshold: 0.1,
                        strength: 2.5,
                        radius: 1.12,
                        levels: 3,
                    },
                    hueSaturation: {
                        enabled: true,
                        hue: 0,
                        saturation: 0.21
                    },
                    brightnessContrast: {
                        enabled: true,
                        brightness: -0.15,
                        contrast: 0.57
                    }
                }
            }
        });

        return mapView;
    }

    private initializeMapControls(): void {
        if (!this.mapView || !this.canvas) return;

        const controls = new MapControls(this.mapView);
        const ui = new MapControlsUI(controls);
        this.canvas.parentElement!.appendChild(ui.domElement);

        this.mapView.addEventListener(MapViewEventNames.ThemeLoaded, () => {
            if (this.gui) {
                new PostProcessingGUIModule(this.mapView!, this.gui).open();
            }
        });
    }

    private configureDEMTerrainSource(): void {
        if (!this.mapView) return;

        const demTerrain = new DEMTerrainSource({
            source: CONFIG.DEM_SOURCE_PATH,
        });

        this.mapView.setElevationSource(demTerrain);
        demTerrain.addWebTileDataSource(new ArcGISTileProvider({
            minDataLevel: 0,
            maxDataLevel: 18
        }));
    }

    private async createFeaturesDataSource(): Promise<FeaturesDataSource> {
        if (!this.mapView) throw new Error("MapView not initialized");

        const featuresDataSource = new FeaturesDataSource({
            styleSetName: "comprehensive-markers",
            maxDataLevel: 20,
        });

        await this.mapView.addDataSource(featuresDataSource);

        return featuresDataSource;
    }

    private addBackgroundDataSource(): void {
        if (!this.mapView) return;
        this.mapView.addDataSource(new ArcGISWebTileDataSource());
    }

    private createGlowingObject(geometry: THREE.BufferGeometry, color: number, intensity: number = 1.0, opacity: number = 0.7): THREE.Mesh {
        const material = new THREE.MeshBasicMaterial({
            color: color,
            transparent: true,
            opacity: opacity
        });
        return new THREE.Mesh(geometry, material);
    }

    private createPulsingGlow(geometry: THREE.BufferGeometry, baseColor: number, pulseSpeed: number = 2): THREE.Mesh {
        const material = new THREE.MeshBasicMaterial({
            color: baseColor,
            transparent: true,
            opacity: 0.5
        });
        const mesh = new THREE.Mesh(geometry, material);

        let time = 0;
        mesh.userData.update = (delta: number) => {
            time += delta * pulseSpeed;
            const pulse = Math.sin(time) * 0.3 + 0.7;
            material.opacity = 0.3 + pulse * 0.4;
            material.color = new THREE.Color(baseColor).multiplyScalar(0.8 + pulse * 0.4);
        };

        return mesh;
    }

    private createRotatingGlowGroup(): THREE.Group {
        const group = new THREE.Group();

        const centerSphere = this.createGlowingObject(
            new THREE.SphereGeometry(50, 16, 16),
            0xff6b6b,
            1.2,
            0.6
        );
        group.add(centerSphere);

        const ring = this.createGlowingObject(
            new THREE.TorusGeometry(80, 15, 16, 32),
            0x4ecdc4,
            0.8,
            0.4
        );
        ring.rotation.x = Math.PI / 2;
        if (this.mapView) {
            this.mapView.mapRenderingManager.addBloomObject(ring);
        }
        group.add(ring);

        const smallSpheres: THREE.Mesh[] = [];
        const sphereCount = 6;
        for (let i = 0; i < sphereCount; i++) {
            const angle = (i / sphereCount) * Math.PI * 2;
            const sphere = this.createPulsingGlow(
                new THREE.SphereGeometry(20, 12, 12),
                0x45b7d1,
                3 + i * 0.5
            );
            sphere.position.set(
                Math.cos(angle) * 120,
                Math.sin(angle) * 120,
                0
            );
            group.add(sphere);
            smallSpheres.push(sphere);
        }

        group.userData.update = (delta: number) => {
            group.rotation.z += delta * 0.5;
            group.rotation.y += delta * 0.3;

            smallSpheres.forEach((sphere) => {
                if (sphere.userData.update) {
                    sphere.userData.update(delta);
                }
            });
        };

        return group;
    }

    private createBuildingStructure(): THREE.Group {
        const structure = new THREE.Group();

        const base = this.createGlowingObject(
            new THREE.CylinderGeometry(60, 80, 40, 8),
            0xffa726,
            1.0,
            0.6
        );
        structure.add(base);

        if (this.mapView) {
            this.mapView.mapRenderingManager.addBloomObject(base);
        }

        const middle = this.createGlowingObject(
            new THREE.CylinderGeometry(40, 60, 60, 8),
            0x66bb6a,
            1.1,
            0.7
        );
        middle.position.y = 50;
        structure.add(middle);
        if (this.mapView) {
            this.mapView.mapRenderingManager.addBloomObject(middle);
        }

        const top = this.createGlowingObject(
            new THREE.ConeGeometry(30, 80, 8),
            0xab47bc,
            1.3,
            0.8
        );
        top.position.y = 110;
        structure.add(top);

        const topSphere = this.createPulsingGlow(
            new THREE.SphereGeometry(25, 16, 16),
            0xffeb3b,
            4
        );
        topSphere.position.y = 150;
        structure.add(topSphere);

        return structure;
    }

    private createFloatingParticles(count: number = 8): THREE.Group {
        const particles = new THREE.Group();

        for (let i = 0; i < count; i++) {
            const size = 15 + Math.random() * 20;
            const geometry = Math.random() > 0.5 ?
                new THREE.SphereGeometry(size, 8, 8) :
                new THREE.BoxGeometry(size, size, size);

            const particle = this.createPulsingGlow(
                geometry,
                new THREE.Color().setHSL(Math.random(), 0.8, 0.6).getHex(),
                2 + Math.random() * 3
            );

            particle.position.set(
                (Math.random() - 0.5) * 300,
                (Math.random() - 0.5) * 300,
                (Math.random() - 0.5) * 200
            );

            particle.userData.floatSpeed = 0.5 + Math.random() * 1;
            particle.userData.floatRange = 50 + Math.random() * 50;
            particle.userData.initialY = particle.position.y;
            particle.userData.floatTime = Math.random() * Math.PI * 2;

            particles.add(particle);
            if (this.mapView) {
                this.mapView.mapRenderingManager.addBloomObject(particle);
            }
        }

        particles.userData.update = (delta: number) => {
            particles.children.forEach((particle: any) => {
                particle.userData.floatTime += delta * particle.userData.floatSpeed;
                particle.position.y = particle.userData.initialY +
                    Math.sin(particle.userData.floatTime) * particle.userData.floatRange;

                particle.rotation.x += delta * 0.5;
                particle.rotation.y += delta * 0.3;

                if (particle.userData.update) {
                    particle.userData.update(delta);
                }
            });
        };

        return particles;
    }

    private addGlowingObjects(): void {
        if (!this.mapView) return;

        const mainCoordinates = new GeoCoordinates(36.4902, 118.1742, 500);

        const rotatingGlowGroup = this.createRotatingGlowGroup();
        (rotatingGlowGroup as any).anchor = mainCoordinates;
        this.mapView.mapAnchors.add(rotatingGlowGroup);
        this.animatedObjects.push(rotatingGlowGroup);

        const structureCoords = new GeoCoordinates(36.491, 118.175, 450);
        const glowingStructure = this.createBuildingStructure();
        (glowingStructure as any).anchor = structureCoords;
        this.mapView.mapAnchors.add(glowingStructure);

        const floatingParticles = this.createFloatingParticles(12);
        (floatingParticles as any).anchor = mainCoordinates;
        this.mapView.mapAnchors.add(floatingParticles);
        this.animatedObjects.push(floatingParticles);

        const extraObjects: { geometry: THREE.BufferGeometry; color: number; position: [number, number, number] }[] = [
            { geometry: new THREE.ConeGeometry(40, 100, 8), color: 0xe91e63, position: [36.489, 118.173, 480] },
            { geometry: new THREE.CylinderGeometry(35, 35, 120, 6), color: 0x00bcd4, position: [36.492, 118.176, 520] },
            { geometry: new THREE.TorusGeometry(60, 20, 12, 24), color: 0x8bc34a, position: [36.488, 118.177, 460] }
        ];

        extraObjects.forEach((obj, index) => {
            const mesh = this.createPulsingGlow(obj.geometry, obj.color, 2 + index);
            (mesh as any).anchor = new GeoCoordinates(obj.position[0], obj.position[1], obj.position[2]);
            this.mapView!.mapAnchors.add(mesh);
        });
    }

    private addDataMarkers(): void {
        if (!this.mapView) return;

        const markers: MarkerData[] = [
            { name: "地标A - 商业中心", lat: 36.4902, lng: 118.1742, height: 500, type: "point", color: "#2C7BE5" },
            { name: "地标B - 住宅区", lat: 36.4915, lng: 118.1755, height: 450, type: "point", color: "#E91E63" },
            { name: "地标C - 公园", lat: 36.4895, lng: 118.1730, height: 480, type: "point", color: "#4CAF50" },
            { name: "地标D - 工业区", lat: 36.4920, lng: 118.1720, height: 520, type: "point", color: "#FF9800" }
        ];

        const geojson = {
            type: "FeatureCollection" as const,
            features: markers.map(marker => ({
                type: "Feature" as const,
                properties: {
                    name: marker.name,
                    markerColor: marker.color || "#2C7BE5"
                },
                geometry: {
                    type: "Point" as const,
                    coordinates: [marker.lng, marker.lat, marker.height]
                }
            }))
        };

        if (this.featuresDataSource) {
            this.featuresDataSource.setFromGeojson(geojson);
            console.log(`Added ${markers.length} data markers to the map`);
        }
    }

    private initializeGUI(): void {
        this.gui = new GUI({ width: 300 });

        const mapFolder = this.gui.addFolder("地图控制");
        mapFolder.open();

        const mapControls = {
            zoomIn: () => {
                if (this.mapView) {
                    this.mapView.zoomLevel = Math.min(this.mapView.zoomLevel + 1, 20);
                }
            },
            zoomOut: () => {
                if (this.mapView) {
                    this.mapView.zoomLevel = Math.max(this.mapView.zoomLevel - 1, 1);
                }
            },
            resetView: () => {
                if (this.mapView) {
                    this.mapView.lookAt({
                        target: CONFIG.INITIAL_COORDINATES,
                        distance: 900,
                        tilt: CONFIG.TILT,
                        heading: CONFIG.HEADING
                    });
                }
            },
            toggleBloom: true,
            toggleAtmosphere: true
        };

        mapFolder.add(mapControls, "zoomIn").name("放大 (+)");
        mapFolder.add(mapControls, "zoomOut").name("缩小 (-)");
        mapFolder.add(mapControls, "resetView").name("重置视图");
        
        mapFolder.add(mapControls, "toggleBloom").name("Bloom 特效").onChange((value: boolean) => {
            if (this.mapView) {
                this.mapView.mapRenderingManager.bloom.enabled = value;
            }
        });

        mapFolder.add(mapControls, "toggleAtmosphere").name("大气效果").onChange((value: boolean) => {
            if (this.mapView && this.mapView.sceneEnvironment.celestia) {
                this.mapView.sceneEnvironment.celestia.updateOptions({
                    atmosphere: value
                });
            }
        });

        const infoFolder = this.gui.addFolder("应用信息");
        infoFolder.add({
            "综合地图应用": "v1.0.0"
        }, "综合地图应用").name("版本");
        infoFolder.add({
            "功能": "3D模型、特效、标记"
        }, "功能").name("包含功能");
        infoFolder.open();
    }

    private startAnimationLoop(): void {
        if (!this.mapView) return;

        this.mapView.addEventListener(MapViewEventNames.Render, () => {
            const delta = this.clock.getDelta();

            this.animatedObjects.forEach(obj => {
                if (obj.userData.update) {
                    obj.userData.update(delta);
                }
            });
        });

        this.mapView.beginAnimation();
    }

    public dispose(): void {
        if (this.gui) {
            this.gui.destroy();
        }
        if (this.mapView) {
            this.mapView.dispose();
        }
    }
}

const app = new ComprehensiveMapApp();

export default app;
