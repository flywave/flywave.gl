/* Copyright (C) 2025 flywavecontributors */

/**
 * MVT 逐元素隔离测试：?el= 参数每次只渲染一个元素类别，一条最小样式。
 *
 * 目的：把"整张地图不对"拆成可归因的单元素问题——地面 / 水面 / 地块 /
 * 楼体（静态高 / coalesce 表达式 / get 表达式）/ 道路，每类用明亮标识色
 * 验证"该元素到底渲不渲染"，配色还原在 mvt-occlusion-test 做。
 */

import {
    GeoCoordinates,
    MapView,
    VectorTileDataSource,
    ellipsoidProjection,
    type Theme
} from "@flywave/flywave.gl";

const CENTER = { lat: 40.7075, lng: -74.0113 };
const OPENFREEMAP_TILEJSON = "https://tiles.openfreemap.org/planet";

interface ElementCase {
    /** 页面标题里显示的说明 */
    desc: string;
    /** 是否加载 OpenFreeMap MVT 数据源 */
    withMvt: boolean;
    /** addBackgroundDatasource（引擎默认 false，地面平面靠它） */
    addBackground: boolean;
    /** 最小 styleset（只含被测元素，颜色用明亮标识色） */
    entries: unknown[];
}

// 顶层面 color + 最小灯光，无 extends、无大气：变量只剩被测元素本身
const BASE_THEME = {
    clearColor: "#EDE7E1",
    lights: [
        { type: "ambient", color: "#ffffff", intensity: 0.6 },
        {
            type: "directional",
            color: "#ffffff",
            intensity: 1.1,
            direction: { x: 0.5, y: 0.8, z: 1 }
        }
    ]
};

const waterEntry = {
    id: "test-water",
    when: ["==", ["get", "$layer"], "water"],
    technique: "fill",
    renderOrder: 5,
    color: "#FF0000"
};

const landuseEntry = {
    id: "test-landuse",
    when: [
        "all",
        ["==", ["get", "$layer"], "landuse"],
        ["==", ["get", "class"], "residential"]
    ],
    technique: "fill",
    renderOrder: 1,
    color: "#00CC00"
};

const buildingBase = {
    id: "test-building",
    when: [
        "all",
        ["==", ["get", "$layer"], "building"],
        ["==", ["geometry-type"], "Polygon"]
    ],
    technique: "extruded-polygon",
    renderOrder: 20,
    color: "#FF00FF"
};

const roadEntry = {
    id: "test-road",
    when: [
        "all",
        ["==", ["get", "$layer"], "transportation"],
        ["==", ["get", "class"], "primary"]
    ],
    technique: "solid-line",
    renderOrder: 10,
    color: "#0000FF",
    lineWidth: 5,
    lineStyle: { type: "color", constantColor: "#0000FF" }
};

// 皮肤 entry 73 的 adapted 产物逐字段二分：定位楼体在全量皮肤下不渲染的字段
const skinEntry73 = {
    id: "extrudedBuildings",
    technique: "extruded-polygon",
    when: [
        "all",
        ["==", ["get", "$layer"], "building"],
        ["==", ["geometry-type"], "Polygon"]
    ],
    minZoomLevel: 16,
    renderOrder: 2000,
    color: "#EDE7E1",
    roughness: 1,
    metalness: 0.8,
    emissive: "#78858C",
    emissiveIntensity: 0.85,
    footprint: true,
    maxSlope: 0.88,
    lineWidth: 1,
    lineColor: "#172023",
    lineColorMix: 0.6,
    fadeNear: 0.9,
    fadeFar: 1,
    lineFadeNear: -0.75,
    lineFadeFar: 1,
    attr: {
        height: ["coalesce", ["get", "render_height"], 8],
        floorHeight: ["coalesce", ["get", "render_min_height"], 0]
    }
};

const CASES: Record<string, ElementCase> = {
    ground: {
        desc: "仅地面平面（addBackgroundDatasource + clearColor 米色），无任何矢量",
        withMvt: false,
        addBackground: true,
        entries: []
    },
    water: {
        desc: "仅水面 fill（顶层面 color，红=渲染成功）",
        withMvt: true,
        addBackground: true,
        entries: [waterEntry]
    },
    landuse: {
        desc: "仅 landuse residential fill（绿=渲染成功）",
        withMvt: true,
        addBackground: true,
        entries: [landuseEntry]
    },
    "building-static": {
        desc: "楼体挤出：静态 height=12（洋红=渲染成功）",
        withMvt: true,
        addBackground: true,
        entries: [{ ...buildingBase, height: 12 }]
    },
    "building-coalesce": {
        desc: "楼体挤出：height=[coalesce render_height 8]（OMT 桥接写法）",
        withMvt: true,
        addBackground: true,
        entries: [
            {
                ...buildingBase,
                height: ["coalesce", ["get", "render_height"], 8],
                floorHeight: ["coalesce", ["get", "render_min_height"], 0]
            }
        ]
    },
    "building-get": {
        desc: "楼体挤出：height=[get render_height] + defaultHeight=8",
        withMvt: true,
        addBackground: true,
        entries: [
            {
                ...buildingBase,
                height: ["get", "render_height"],
                defaultHeight: 8
            }
        ]
    },
    "building-flat": {
        desc: "楼体 footprint：同 building-static 但 technique=fill（验证数据存在性）",
        withMvt: true,
        addBackground: true,
        entries: [
            {
                ...buildingBase,
                technique: "fill",
                renderOrder: 20
            }
        ]
    },
    road: {
        desc: "仅 primary 道路 solid-line（蓝=渲染成功）",
        withMvt: true,
        addBackground: true,
        entries: [roadEntry]
    },
    "skin73-full": {
        desc: "皮肤 entry73 adapted 原样（含 minZoomLevel:16 + attr 高度桥接）",
        withMvt: true,
        addBackground: true,
        entries: [{ ...skinEntry73 }]
    },
    "skin73-nozoom": {
        desc: "entry73 去掉 minZoomLevel（其余同 skin73-full）",
        withMvt: true,
        addBackground: true,
        entries: [
            {
                ...skinEntry73,
                minZoomLevel: undefined
            }
        ]
    },
    "skin73-toplevel": {
        desc: "entry73 高度提到顶层、去掉 attr 包（含 minZoomLevel:16）",
        withMvt: true,
        addBackground: true,
        entries: [
            {
                ...skinEntry73,
                height: ["coalesce", ["get", "render_height"], 8],
                floorHeight: ["coalesce", ["get", "render_min_height"], 0],
                attr: undefined
            }
        ]
    }
};

async function createMvtDataSource(): Promise<VectorTileDataSource> {
    const meta = await fetch(OPENFREEMAP_TILEJSON).then(r => r.json());
    const tilesUrl: string = meta.tiles[0];
    return new VectorTileDataSource({
        url: tilesUrl,
        styleSetName: "tilezen",
        maxDataLevel: meta.maxzoom ?? 14
    });
}

async function main(): Promise<void> {
    const el = new URLSearchParams(location.search).get("el") ?? "";
    const testCase = CASES[el];

    const banner = document.createElement("div");
    banner.style.cssText =
        "position:absolute;left:12px;top:12px;z-index:900;background:rgba(0,0,0,0.75);" +
        "color:#fff;font:13px/1.5 monospace;padding:8px 12px;border-radius:4px;max-width:60%";
    if (!testCase) {
        banner.innerHTML =
            "<b>mvt-element-test</b><br>用法：?el=" +
            Object.keys(CASES).map(k => `<a style="color:#8cf" href="?el=${k}">${k}</a>`).join(" | ");
        document.body.appendChild(banner);
        return;
    }
    banner.innerHTML = `<b>el=${el}</b><br>${testCase.desc}`;
    document.body.appendChild(banner);

    const canvas = document.getElementById("mapCanvas") as HTMLCanvasElement;

    const theme: Theme = {
        ...(BASE_THEME as unknown as Theme),
        styles: { tilezen: testCase.entries as Theme["styles"]["tilezen"] }
    };

    const mapView = new MapView({
        canvas,
        forceWebGL: new URLSearchParams(location.search).get("renderer") === "webgl",
        projection: ellipsoidProjection,
        target: new GeoCoordinates(CENTER.lat, CENTER.lng),
        zoomLevel: 16,
        tilt: 45,
        theme,
        addBackgroundDatasource: testCase.addBackground,
        // 渲染测试的像素断言需要跨任务读取画布（drawImage 回读），必须
        // 保留绘制缓冲；对常规渲染无影响
        preserveDrawingBuffer: true
    });
    (window as unknown as Record<string, unknown>).__dbg = mapView;

    // 主题加载与 worker 会话握手完成后才能挂数据源：ready 前 addDataSource
    // 会让解码 worker 拿到空样式集，所有特征静默丢弃（无任何报错）
    await mapView.ready;

    if (testCase.withMvt) {
        const mvt = await createMvtDataSource();
        await mapView.addDataSource(mvt);
    }

    setTimeout(() => {
        void mapView.lookAt({
            target: { lat: CENTER.lat, lng: CENTER.lng },
            zoomLevel: 16,
            tilt: 45
        });
        mapView.update();
    }, 1000);

    (window as unknown as Record<string, unknown>).__el = el;
}

void main();
