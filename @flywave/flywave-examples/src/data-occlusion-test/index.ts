/* Copyright (C) 2025 flywave.gl contributors */

/**
 * 遮挡隔离测试（v2）：有地面、有建筑物的瓦片场景 + 一个经自定义
 * DataSource 放置的 mesh（持久对象挂 mapView.scene、每帧 RTE 平移、
 * 缓存根瓦片保活——数据源承载外部三维对象的标准模式）。
 *
 * A/B：mesh.renderOrder 0 vs 10。
 * - 地面 fill 层 depthTest=false（引擎对非挤出技法的默认约定），
 *   renderOrder 0 的模型与它同队列按材质编译序决胜，可能被整片涂盖；
 * - renderOrder 10 画在全部地图内容之后，涂盖消失，同时保留 depthTest
 *   （被楼体/地形正确遮挡）。
 */

import { type GUI } from "dat.gui";

import {
    DataSource,
    FeaturesDataSource,
    GeoCoordinates,
    quadTreeSubdivisionScheme,
    Tile,
    TileKey,
    TilingScheme,
    TransferManager,
    webMercatorProjection,
    type FeatureCollection,
    type MapView,
    type Theme
} from "@flywave/flywave.gl";
import { BoxGeometry, Mesh, MeshBasicMaterial, Object3D } from "three/webgpu";

import { applyPanelStyle, createExampleGui, createExampleMap, logExampleInfo } from "../common";

/** 场景中心：北京故宫（与 complex-features.json 对齐）。 */
const CENTER = new GeoCoordinates(39.9135, 116.3975);
/** 测试盒位置：建筑群旁。 */
const BOX_GEO = new GeoCoordinates(39.9128, 116.3985);

function createTheme(): Theme {
    return {
        extends: "resources/tilezen_base_globe.json",
        atmosphere: { enabled: true },
        clearColor: "#DDE3EA",
        sky: { type: "gradient", topColor: "#BFD9EF", bottomColor: "#E9EDF2", groundColor: "#DDE3EA" },
        // 固定灯光：夜间大气太阳在地平线下，楼体无光全黑，测试台不受真实时间影响
        lights: [
            { type: "ambient", name: "ambientLight", color: "#ffffff", intensity: 0.6 },
            {
                type: "directional",
                name: "sunLight",
                color: "#ffffff",
                intensity: 1.1,
                direction: { x: 0.5, y: 0.8, z: 1 }
            }
        ],
        styles: {
            "occlusion-features": [
                {
                    when: [
                        "all",
                        ["==", ["geometry-type"], "Polygon"],
                        ["any", ["has", "building"], ["has", "building:part"]]
                    ],
                    technique: "extruded-polygon",
                    attr: {
                        height: ["coalesce", ["get", "height"], 8],
                        color: "#C9D3DC",
                        footprint: true,
                        lineColor: "#46586A",
                        lineWidth: 1.5
                    }
                },
                {
                    when: ["==", ["geometry-type"], "Polygon"],
                    technique: "fill",
                    attr: { color: "#93A38C" }
                }
            ]
        }
    };
}

/**
 * 承载外部 three.js 对象的最小数据源：对象挂私有子树并整体加入
 * mapView.scene（该 scene 不会被瓦片重建清空），每帧做 RTE 平移；
 * 缓存的根瓦片让可见瓦片系统保持本数据源常驻。
 */
class ModelDataSource extends DataSource {
    private readonly m_tilingScheme = new TilingScheme(
        quadTreeSubdivisionScheme,
        webMercatorProjection
    );
    private readonly m_sceneRoot = new Object3D();
    private m_cachedTile: Tile | undefined;

    constructor() {
        super({ minDataLevel: 0, maxDataLevel: 0 });
    }

    getTilingScheme(): TilingScheme {
        return this.m_tilingScheme;
    }

    /** 每帧由瓦片系统回调：把子树平移到相机相对（RTE）坐标系。 */
    onWillTouchTiled(): void {
        this.m_sceneRoot.position.copy(this.mapView.camera.position).negate();
    }

    getTile(): Tile {
        if (!this.m_cachedTile) {
            this.m_cachedTile = new Tile(this, TileKey.fromRowColumnLevel(0, 0, 0));
            this.m_cachedTile.forceHasGeometry(true);
        }
        return this.m_cachedTile;
    }

    addObject(object: Object3D): void {
        this.m_sceneRoot.add(object);
    }

    attach(mapView: MapView): void {
        super.attach(mapView);
        mapView.scene.add(this.m_sceneRoot);
    }

    detach(mapView: MapView): void {
        mapView.scene.remove(this.m_sceneRoot);
        super.detach(mapView);
    }
}

async function loadGroundAndBuildings(featuresDataSource: FeaturesDataSource): Promise<number> {
    const geojsonData: FeatureCollection = await TransferManager.instance().downloadJson(
        "complex-features.json"
    );
    const flatten = (coords: number[] | number[][] | number[][][]): void => {
        if (typeof coords[0] === "number") {
            coords[2] = 2;
            return;
        }
        for (const c of coords as number[][]) {
            flatten(c);
        }
    };
    for (const feature of geojsonData.features) {
        if (feature.geometry.type === "GeometryCollection") {
            continue;
        }
        flatten(feature.geometry.coordinates as number[] | number[][] | number[][][]);
    }
    featuresDataSource.setFromGeojson(geojsonData);
    return geojsonData.features.length;
}

function createPanel(
    applyRenderOrder: (order: number) => void,
    flyTo: (name: string, zoomLevel: number, tilt: number, heading: number) => void
): void {
    const gui: GUI = createExampleGui();
    applyPanelStyle(gui.domElement);
    const folder = gui.addFolder("Occlusion Test");

    folder
        .add(
            {
                ro0: () => applyRenderOrder(0)
            },
            "ro0"
        )
        .name("renderOrder 0（复现涂盖）");
    folder
        .add(
            {
                ro10: () => applyRenderOrder(10)
            },
            "ro10"
        )
        .name("renderOrder 10（修复值）");
    folder
        .add(
            {
                f1: () => flyTo("正视 45°", 15.5, 45, 0)
            },
            "f1"
        )
        .name("正视 45°");
    folder
        .add(
            {
                f2: () => flyTo("斜视 65°", 15.2, 65, 40)
            },
            "f2"
        )
        .name("斜视 65°");
    folder
        .add(
            {
                f3: () => flyTo("低角 75°", 15.0, 75, 200)
            },
            "f3"
        )
        .name("低角 75°");
    folder
        .add(
            {
                f4: () => flyTo("楼后 70°", 16.0, 70, 150)
            },
            "f4"
        )
        .name("楼后 70°");
    folder.open();
}

async function main(): Promise<void> {
    const canvas = document.getElementById("mapCanvas") as HTMLCanvasElement;

    const { mapView } = await createExampleMap(canvas, {
        themeObject: createTheme(),
        projection: "globe",
        keepThemeLights: true,
        lookAt: {
            target: { lat: CENTER.lat, lng: CENTER.lng },
            zoomLevel: 15.5,
            tilt: 55
        }
    });
    logExampleInfo("data-occlusion-test", mapView);
    (window as unknown as Record<string, unknown>).__dbg = mapView;

    // 地面 + 建筑物（真实瓦片要素层）
    const featuresDataSource = new FeaturesDataSource({ styleSetName: "occlusion-features" });
    await mapView.addDataSource(featuresDataSource);
    await loadGroundAndBuildings(featuresDataSource);

    // 被测对象：经自定义 DataSource 放置的 mesh
    const modelDataSource = new ModelDataSource();
    await mapView.addDataSource(modelDataSource);
    const box = new Mesh(
        new BoxGeometry(160, 60, 40),
        new MeshBasicMaterial({ color: 0xff5a2a })
    );
    box.position.copy(modelDataSource.projection.projectPoint(BOX_GEO));
    box.position.z += 20; // 半高：底面贴地
    modelDataSource.addObject(box);

    createPanel(
        order => {
            box.renderOrder = order;
        },
        (name, zoomLevel, tilt, heading) => {
            void mapView.lookAt({
                target: { lat: BOX_GEO.lat, lng: BOX_GEO.lng },
                zoomLevel,
                tilt,
                heading
            });
            mapView.update();
        }
    );
}

void main();
