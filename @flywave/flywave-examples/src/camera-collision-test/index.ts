import {
    ArcGISTileProvider,
    CopyrightElementHandler,
    DEMTerrainSource,
    GeoCoordinates,
    MapControls,
    MapControlsUI,
    MapView,
    MapViewEventNames,
    sphereProjection
} from "@flywave/flywave.gl";
import { GUI } from "dat.gui";
import * as THREE from "three/webgpu";

import { shouldForceWebGL } from "../common-webgl-debug";

// 免费全球 DEM：AWS Open Data 的 Terrarium 地形瓦片（无需 token，服务端开 CORS）。
// encoding "terrarium"：高度 = R * 256 + G + B / 256 - 32768（米）。
// 注意：编码不写在 source 描述里，通过 DEMTerrainSource 构造选项 encoding 声明。
const FREE_TERRARIUM_DEM = {
    type: "raster-dem" as const,
    tiles: ["https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png"],
    scheme: "xyz" as const,
    bounds: [-180, -85.0511, 180, 85.0511] as [number, number, number, number],
    minzoom: 0,
    maxzoom: 15,
    tileSize: 256,
    attribution: "Terrain: AWS Open Data Terrain Tiles / Mapzen"
};

const CONFIG = {
    INITIAL_COORDS: new GeoCoordinates(36.48619699228674, 118.17270928364879, 800),
    TILT: 55,
    ZOOM_LEVEL: 14.5,
    MARKER_RADIUS: 6,
    COLOR_RAYCAST: 0xff3344, // 红色：TerrainSource.raycast 命中点
    COLOR_FALLBACK: 0x00ddff // 青色：getWorldPositionAt 兜底点
};

const canvas = document.getElementById("mapCanvas") as HTMLCanvasElement;

const mapView = new MapView({
    forceWebGL: shouldForceWebGL(),
    // projection: sphereProjection,
    target: CONFIG.INITIAL_COORDS,
    zoomLevel: CONFIG.ZOOM_LEVEL,
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

// 编码在构造选项 encoding 声明——DemTileProvider 只读顶层 encoding（默认 mapbox）；
// terrarium 瓦片漏传会按 mapbox 解码（高度错数百倍）
const demTerrain = new DEMTerrainSource({ source: FREE_TERRARIUM_DEM, encoding: "terrarium" });
mapView.setElevationSource(demTerrain);
demTerrain.addWebTileDataSource(new ArcGISTileProvider({ minDataLevel: 0, maxDataLevel: 18 }));

window.addEventListener("resize", () => {
    mapView.resize(window.innerWidth, window.innerHeight);
});
mapView.resize(window.innerWidth, window.innerHeight);
mapView.beginAnimation();

/**
 * 把世界点标记到锚定 Group 上：Group 锚定在固定 geo 点（世界系原点），
 * 子球体用 (hit - anchorWorld) 偏移，实现任意世界点的持久标记
 * （场景根每帧清空，必须走 MapAnchor）。
 */
class HitMarker {
    private readonly mesh: THREE.Mesh;
    public visible = false;

    constructor(
        private readonly mapView: MapView,
        private readonly anchor: GeoCoordinates,
        gui: GUI,
        name: string,
        color: number
    ) {
        this.mesh = new THREE.Mesh(
            new THREE.SphereGeometry(CONFIG.MARKER_RADIUS, 16, 16),
            new THREE.MeshBasicMaterial({
                color,
                transparent: true,
                opacity: 0.9,
                depthTest: false
            })
        );
        this.mesh.renderOrder = 9999;
        this.mesh.visible = false;

        const group = new THREE.Group();
        (group as unknown as { anchor: GeoCoordinates }).anchor = this.anchor;
        group.add(this.mesh);
        this.mapView.mapAnchors.add(group);

        gui.add(this, "visible").name(name).listen();
    }

    public placeAt(worldPos: THREE.Vector3): void {
        const anchorWorld = this.mapView.projection.projectPoint(this.anchor, new THREE.Vector3());
        this.mesh.position.copy(worldPos).sub(anchorWorld);
        this.mesh.visible = true;
        this.visible = true;
    }

    public hide(): void {
        this.mesh.visible = false;
        this.visible = false;
    }
}

class CameraCollisionTest {
    private readonly rayMarker: HitMarker;
    private readonly fallbackMarker: HitMarker;
    private pendingMouseEvent: MouseEvent | null = null;
    private rafScheduled = false;

    private readonly stats = {
        collisionEnabled: true,
        raycastStatus: "-",
        raycastDistance: "-",
        raycastAltitude: "-",
        providerHeight: "-",
        fallbackStatus: "-",
        fallbackGeo: "-",
        zoomLevel: CONFIG.ZOOM_LEVEL,
        cameraAboveGround: "-"
    };

    constructor(private readonly mapView: MapView, private readonly demTerrain: DEMTerrainSource) {
        const gui = new GUI({ width: 340 });

        const rayFolder = gui.addFolder("TerrainSource.raycast（数据源碰撞）");
        rayFolder
            .add(this.stats, "collisionEnabled")
            .name("enableCameraCollision")
            .onChange((v: boolean) => {
                this.demTerrain.enableCameraCollision = v;
            });
        rayFolder.add(this.stats, "raycastStatus").name("状态").listen();
        rayFolder.add(this.stats, "raycastDistance").name("命中距离 (m)").listen();
        rayFolder.add(this.stats, "raycastAltitude").name("命中点海拔 (m)").listen();
        rayFolder.add(this.stats, "providerHeight").name("该点高程查询 (m)").listen();
        rayFolder.open();

        const fallbackFolder = gui.addFolder("getWorldPositionAt（控件兜底）");
        fallbackFolder.add(this.stats, "fallbackStatus").name("状态").listen();
        fallbackFolder.add(this.stats, "fallbackGeo").name("经纬度/海拔").listen();
        fallbackFolder.open();

        const cameraFolder = gui.addFolder("相机");
        cameraFolder.add(this.stats, "zoomLevel").name("zoomLevel（≥13 查地形）").listen();
        cameraFolder.add(this.stats, "cameraAboveGround").name("相机离地高度 (m)").listen();
        cameraFolder.open();

        const markerFolder = gui.addFolder("标记");
        this.rayMarker = new HitMarker(
            mapView,
            new GeoCoordinates(
                CONFIG.INITIAL_COORDS.latitude,
                CONFIG.INITIAL_COORDS.longitude,
                CONFIG.INITIAL_COORDS.altitude
            ),
            markerFolder,
            "显示数据源命中点",
            CONFIG.COLOR_RAYCAST
        );
        this.fallbackMarker = new HitMarker(
            mapView,
            new GeoCoordinates(
                CONFIG.INITIAL_COORDS.latitude,
                CONFIG.INITIAL_COORDS.longitude,
                CONFIG.INITIAL_COORDS.altitude
            ),
            markerFolder,
            "显示兜底取点",
            CONFIG.COLOR_FALLBACK
        );
        markerFolder.open();

        const helpFolder = gui.addFolder("测试步骤");
        const help = {
            step1: "1. 等地形瓦片加载（出现山地纹理）",
            step2: "2. 光标放山坡上滚轮放大：相机贴地减速",
            step3: "3. 红球=数据源命中，青球=兜底取点",
            step4: "4. 海面上滚轮：无地形，兜底海平面",
            step5: "5. 关开关后缩放：相机穿入山体（对比）",
            step6: "6. zoomLevel < 13 时数据源不参与碰撞"
        };
        helpFolder.add(help, "step1").listen();
        helpFolder.add(help, "step2").listen();
        helpFolder.add(help, "step3").listen();
        helpFolder.add(help, "step4").listen();
        helpFolder.add(help, "step5").listen();
        helpFolder.add(help, "step6").listen();

        this.setupMouseTracking();
        this.mapView.addEventListener(MapViewEventNames.Render, () => {
            this.updateCameraStats();
        });
    }

    private setupMouseTracking(): void {
        this.mapView.canvas.addEventListener("mousemove", (e: MouseEvent) => {
            this.pendingMouseEvent = e;
            if (!this.rafScheduled) {
                this.rafScheduled = true;
                requestAnimationFrame(() => {
                    this.rafScheduled = false;
                    if (this.pendingMouseEvent) {
                        this.handleMouseMove(this.pendingMouseEvent);
                        this.pendingMouseEvent = null;
                    }
                });
            }
        });
    }

    private handleMouseMove(e: MouseEvent): void {
        this.castTerrainRaycast(e.layerX, e.layerY);
        this.castFallback(e.layerX, e.layerY);
    }

    /**
     * 路径 A：直接调用 TerrainSource.raycast（与 MapControls 相机碰撞同一条
     * 契约：geo 帧射线入、render 空间点出，消费方 .add(camera.position)）。
     */
    private castTerrainRaycast(x: number, y: number): void {
        const ndc = this.mapView.getNormalizedScreenCoordinates(x, y);
        const raycaster = new THREE.Raycaster();
        raycaster.setFromCamera(ndc, this.mapView.camera);

        const intersects: THREE.Intersection[] = [];
        this.demTerrain.raycast(raycaster, intersects);

        if (intersects.length === 0) {
            this.stats.raycastStatus = "未命中（海面 / zoom<13 / 高程未加载）";
            this.stats.raycastDistance = "-";
            this.stats.raycastAltitude = "-";
            this.stats.providerHeight = "-";
            this.rayMarker.hide();
            return;
        }

        const hit = intersects[0];
        // 契约：输出 render 空间点，加回相机位置得到 geo 世界坐标
        const worldPos = hit.point.clone().add(this.mapView.camera.position);
        const geo = this.mapView.projection.unprojectPoint(worldPos);

        this.stats.raycastStatus = "命中 ✓";
        this.stats.raycastDistance = hit.distance.toFixed(1);
        this.stats.raycastAltitude = (geo.altitude ?? 0).toFixed(2);
        this.stats.providerHeight = (this.mapView.elevationProvider?.getHeight(geo) ?? NaN).toFixed(
            2
        );
        this.rayMarker.placeAt(worldPos);
    }

    /** 路径 B：MapView.getWorldPositionAt（MapControls 的二级兜底同一入口）。 */
    private castFallback(x: number, y: number): void {
        const worldPos = this.mapView.getWorldPositionAt(x, y, false);
        if (!worldPos) {
            this.stats.fallbackStatus = "未命中（射线未交数学表面）";
            this.stats.fallbackGeo = "-";
            this.fallbackMarker.hide();
            return;
        }
        const geo = this.mapView.projection.unprojectPoint(worldPos);
        this.stats.fallbackStatus = "命中（GPU 深度或数学表面）";
        this.stats.fallbackGeo = `${geo.latitude.toFixed(5)}, ${geo.longitude.toFixed(5)}, ${(
            geo.altitude ?? 0
        ).toFixed(1)}`;
        this.fallbackMarker.placeAt(worldPos);
    }

    private updateCameraStats(): void {
        this.stats.zoomLevel = Number(this.mapView.zoomLevel.toFixed(2));
        const cameraGeo = this.mapView.projection.unprojectPoint(this.mapView.camera.position);
        const terrainHeight = this.mapView.elevationProvider?.getHeight(cameraGeo) ?? 0;
        this.stats.cameraAboveGround = ((cameraGeo.altitude ?? 0) - terrainHeight).toFixed(1);
    }
}

const test = new CameraCollisionTest(mapView, demTerrain);

// 调试惯例
(window as unknown as { __mapView: MapView }).__mapView = mapView;
(window as unknown as { __terrainSource: DEMTerrainSource }).__terrainSource = demTerrain;
(window as unknown as { __collisionTest: CameraCollisionTest }).__collisionTest = test;
