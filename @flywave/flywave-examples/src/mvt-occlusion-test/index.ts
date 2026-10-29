/* Copyright (C) 2025 flywave.gl contributors */

/**
 * MVT 大面积正式测试：OpenFreeMap 免费矢量瓦片（OpenMapTiles schema，
 * 无 key）铺整个城市，叠加一个经自定义 DataSource 放置的 mesh。
 *
 * - 瓦片端点从 tilejson 动态解析（OpenFreeMap 路径带数据版本号）；
 * - VectorTileDataSource + "tilezen" styleset（tilezen_base.json 自带）；
 * - mesh.renderOrder 0/10 A/B：大面积下地面 fill（depthTest=false）与
 *   模型的涂盖关系；
 * - 平移/缩放跨大量瓦片，验证 mesh 持久性与渲染稳定性。
 */

import { type GUI } from "dat.gui";

import {
    DataSource,
    GeoCoordinates,
    PerformanceStatistics,
    quadTreeSubdivisionScheme,
    Tile,
    TileKey,
    TilingScheme,
    VectorTileDataSource,
    webMercatorProjection,
    type MapView
} from "@flywave/flywave.gl";
import { EdgeMaterial } from "@flywave/flywave-materials";
import {
    BoxGeometry,
    BufferAttribute,
    BufferGeometry,
    EdgesGeometry,
    LineBasicMaterial,
    LineSegments,
    type Material,
    Mesh,
    MeshBasicMaterial,
    Object3D
} from "three/webgpu";

import { applyPanelStyle, createExampleGui, createExampleMap, logExampleInfo } from "../common";
import { runIsolationTest } from "./isolation-test";
import { filterStyleEntries, HARP_THEME_LIGHTS } from "./theme-filter";
import { loadTilezenStylesetForOpenMapTiles } from "./tilezen-omt-adapter";

// [perf-compare] Boot-time, engine-independent frame probe: rAF deltas + long tasks.
// Captures initial page load AND later scripted camera runs on one timeline.
{
    const w = window as unknown as Record<string, any>;
    w.__t0 = performance.now();
    w.__fl = [] as number[][]; // [tMs, dtMs] per rAF tick
    w.__lt = [] as number[][]; // longtasks [startMs, durMs]
    let last = performance.now();
    const tick = (now: number) => {
        w.__fl.push([Math.round(now - w.__t0), Math.round(now - last)]);
        last = now;
        requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
    try {
        new PerformanceObserver(list => {
            for (const entry of list.getEntries()) {
                w.__lt.push([Math.round(entry.startTime - w.__t0), Math.round(entry.duration)]);
            }
        }).observe({ entryTypes: ["longtask"] });
    } catch (e) {
        w.__ltErr = String(e);
    }
    // Engine frame statistics (enableStatistics is on in createExampleMap).
    // Lazy: MapView's constructor REPLACES the PerformanceStatistics singleton,
    // so capture it only after the map exists.
    w.__getPstat = () => PerformanceStatistics.instance;
}

/** 测试城市：纽约曼哈顿下城（对齐 harp 参考图的机位与构图）。 */
const CENTER = { lat: 40.7075, lng: -74.0113 };
const BOX_GEO = { lat: 40.7072, lng: -74.0130 };
const OPENFREEMAP_TILEJSON = "https://tiles.openfreemap.org/planet";

/** 承载外部 three.js 对象的最小数据源（持久子树 + 每帧 RTE + 根瓦片保活）。 */
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

async function createMvtDataSource(meta: {
    tiles: string[];
    maxzoom?: number;
}): Promise<VectorTileDataSource> {
    // OpenFreeMap 的瓦片路径带数据版本号，从 tilejson 动态解析；
    // maxzoom 一并读取（14）传给数据源——超过 maxzoom 的请求会拿到
    // "200 但空几何"的瓦片，引擎无法回退到父级数据，近处一片黑。
    return new VectorTileDataSource({
        url: meta.tiles[0],
        styleSetName: "tilezen",
        maxDataLevel: meta.maxzoom ?? 14
    });
}

/**
 * theme 级隔离渲染：真实瓦片 + 过滤后的皮肤，平面 mercator、harp 同款三灯、
 * 无大气，与 harp 参考页 `?mode=theme&only=…` 同机位对比。
 */
async function runThemeIsolation(
    canvas: HTMLCanvasElement,
    meta: { tiles: string[]; maxzoom?: number },
    tilezenStyles: Awaited<ReturnType<typeof loadTilezenStylesetForOpenMapTiles>>,
    only: string
): Promise<void> {
    const all = (tilezenStyles as { tilezen?: unknown[] }).tilezen ?? [];
    // &text=1: 注入一条直接匹配 OpenMapTiles place 图层的最小 text technique
    // （用 defaultTextStyle/fira），强制文字管线出图，与 harp 页相同
    if (new URLSearchParams(location.search).get("text") === "1") {
        (all as unknown as Array<Record<string, unknown>>).push({
            description: "__omtPlaceText",
            technique: "text",
            renderOrder: 100,
            when: ["==", ["get", "$layer"], "place"]
        });
    }
    const kept = filterStyleEntries(all as Array<{ technique?: string }>, only);
    // 与 harp 参考页同样直接改加载后的主题 JSON，不走 extends：extends 会把父
    // 主题自己的 75 条 styles 合并进来（OMT 也有名为 water 的图层，父主题原生
    // water 条目会匹配并偷偷画水面），过滤就不纯了。资源 URL 相对主题文件。
    const base = (await fetch("resources/tilezen_base.json").then(r => r.json())) as Record<
        string,
        unknown
    >;
    for (const image of Object.values((base.images as Record<string, { url: string; atlas?: string }>) ?? {})) {
        image.url = "resources/" + image.url;
        if (image.atlas !== undefined) {
            image.atlas = "resources/" + image.atlas;
        }
    }
    for (const fontCatalog of (base.fontCatalogs as Array<{ url: string }>) ?? []) {
        fontCatalog.url = "resources/" + fontCatalog.url;
    }
    const { mapView } = await createExampleMap(canvas, {
        projection: "mercator",
        themeObject: {
            ...(base as object),
            styles: { tilezen: kept } as unknown as typeof tilezenStyles,
            clearColor: "#EDE7E1",
            lights: [...HARP_THEME_LIGHTS] as never,
            // harp 从不做 tone mapping；平面模式下引擎默认 aces 会把无光照原色
            // 压暗（#EDE7E1 → 221），对比必须直通
            toneMappingMode: "none",
            atmosphere: { enabled: false }
        },
        keepThemeLights: true,
        addBackgroundDatasource: true,
        lookAt: {
            target: { lat: CENTER.lat, lng: CENTER.lng },
            zoomLevel: 16,
            tilt: 45
        }
    });
    (window as unknown as Record<string, unknown>).__dbg = mapView;
    (window as unknown as Record<string, unknown>).__themeOnly = {
        only,
        kept: kept.length,
        total: all.length,
        descriptions: kept.map(e => (e as { description?: string }).description)
    };
    await mapView.addDataSource(await createMvtDataSource(meta));
    // `?probe=lines`：经 ModelDataSource 持久子树放两只线框盒，判定真实渲染链
    // 能否画 LineSegments（EdgeMaterial 版 vs three 原生 LineBasicMaterial 版）
    if (new URLSearchParams(location.search).get("probe") === "lines") {
        const probeDs = new ModelDataSource();
        await mapView.addDataSource(probeDs);
        const mk = (material: Material, lngOffset: number) => {
            const geom = new EdgesGeometry(new BoxGeometry(200, 100, 120));
            const n = geom.getAttribute("position").count;
            geom.setAttribute("extrusionAxis", new BufferAttribute(new Float32Array(n * 4), 4));
            const lines = new LineSegments(geom, material);
            lines.position.copy(
                probeDs.projection.projectPoint(
                    new GeoCoordinates(BOX_GEO.lat, BOX_GEO.lng + lngOffset, 0)
                )
            );
            lines.position.z += 60;
            lines.renderOrder = 5000;
            lines.frustumCulled = false;
            probeDs.addObject(lines);
            return lines;
        };
        const edgeMat = new EdgeMaterial({ color: 0xff00ff });
        const variant = new URLSearchParams(location.search).get("variant") ?? "box";
        if (variant === "box") {
            mk(edgeMat, 0);
        } else if (variant === "indexed") {
            // 非共享 position + Uint32 index
            const src = new EdgesGeometry(new BoxGeometry(200, 100, 120));
            const n = src.getAttribute("position").count;
            const geom = new BufferGeometry();
            geom.setAttribute("position", src.getAttribute("position").clone());
            geom.setAttribute("extrusionAxis", new BufferAttribute(new Float32Array(n * 4), 4));
            geom.setIndex(
                new BufferAttribute(new Uint32Array(Array.from({ length: n }, (_, i) => i)), 1)
            );
            const lines = new LineSegments(geom, edgeMat);
            lines.position.copy(
                probeDs.projection.projectPoint(new GeoCoordinates(BOX_GEO.lat, BOX_GEO.lng, 0))
            );
            lines.position.z += 60;
            lines.renderOrder = 5000;
            lines.frustumCulled = false;
            probeDs.addObject(lines);
        } else if (variant === "shared") {
            // 与同帧渲染的 Mesh 共用同一个 position BufferAttribute + Uint32 index
            // （真实瓦片建筑边线的结构）
            const box = new BoxGeometry(200, 100, 120);
            const pos = box.getAttribute("position");
            const n = pos.count;
            const wall = new Mesh(box, new MeshBasicMaterial({ color: 0x8080ff }));
            wall.position.copy(
                probeDs.projection.projectPoint(new GeoCoordinates(BOX_GEO.lat, BOX_GEO.lng, 0))
            );
            wall.position.z += 60;
            probeDs.addObject(wall);
            const idx = box.index!;
            const edgeIdx: number[] = [];
            for (let i = 0; i < idx.count; i += 3) {
                const a = idx.getX(i);
                const b = idx.getX(i + 1);
                const c = idx.getX(i + 2);
                edgeIdx.push(a, b, b, c, c, a);
            }
            const geom = new BufferGeometry();
            geom.setAttribute("position", pos);
            geom.setAttribute("extrusionAxis", new BufferAttribute(new Float32Array(n * 4), 4));
            geom.setIndex(new BufferAttribute(new Uint32Array(edgeIdx), 1));
            const lines = new LineSegments(geom, edgeMat);
            lines.position.copy(wall.position);
            lines.renderOrder = 5000;
            lines.frustumCulled = false;
            probeDs.addObject(lines);
        }
        mk(new LineBasicMaterial({ color: 0x00ff00 }), 0.004);
        (window as unknown as Record<string, unknown>).__probe = { edgeMat, variant };
    }
    setTimeout(() => {
        void mapView.lookAt({
            target: { lat: CENTER.lat, lng: CENTER.lng },
            zoomLevel: 16,
            tilt: 45
        });
        mapView.update();
    }, 1000);
}

async function main(): Promise<void> {
    const params = new URLSearchParams(location.search);
    // 材质/几何隔离测试模式：纯 three.js 场景，不建 MapView
    if (params.get("mode") === "isolation") {
        await runIsolationTest();
        return;
    }

    const canvas = document.getElementById("mapCanvas") as HTMLCanvasElement;

    const meta = await fetch(OPENFREEMAP_TILEJSON).then(r => r.json());
    const maxDataLevel: number = meta.maxzoom ?? 14;

    // 现有 tilezen 皮肤的 OpenMapTiles schema 适配：运行时加载皮肤并只
    // 重写条件表达式（层名/kind→class）与数据能力差异（minZoomLevel 夹到
    // 数据 maxzoom、楼体高度属性桥接），配色与条目顺序全部保留皮肤原设计
    const tilezenStyles = await loadTilezenStylesetForOpenMapTiles(maxDataLevel);

    // theme 级隔离：平面投影、harp 同款三灯、无大气，只保留 only= 指定的条目
    if (params.get("mode") === "theme") {
        await runThemeIsolation(canvas, meta, tilezenStyles, params.get("only") ?? "");
        return;
    }

    const { mapView } = await createExampleMap(canvas, {
        themeObject: {
            extends: "resources/tilezen_base.json",
            styles: tilezenStyles,
            // 地面色取皮肤 defaultBuildingColor 同族暖米色：OMT 免费数据
            // 没有城市陆地多边形，皮肤原 clearColor（灰蓝）下地面全靠
            // BackgroundDataSource 平面呈现，必须给出参考图的米色基调
            clearColor: "#EDE7E1",
            atmosphere: {
                enabled: true,
                // 固定为纽约白天（2026-10-27 16:00 UTC = EDT 12:00）：场景
                // 在纽约，用北京时间的正午会让当地处于深夜、太阳在地平
                // 线下、楼体无光全黑
                sunTime: 1793116800000,
                sunTimeTransitionDuration: 0
            }
        },
        // OMT 数据没有陆地多边形，地面由 BackgroundDataSource 平面补全
        addBackgroundDatasource: true,
        // 球面模式：DataSource 子树按 ECEF 放置（dataSource.projection
        // projectPoint），RTE 平移在 onWillTouchTiled 内完成
        lookAt: {
            target: { lat: CENTER.lat, lng: CENTER.lng },
            zoomLevel: 16,
            tilt: 45
        }
    });
    logExampleInfo("mvt-occlusion-test", mapView);
    (window as unknown as Record<string, unknown>).__dbg = mapView;

    const mvtDataSource = await createMvtDataSource(meta);
    await mapView.addDataSource(mvtDataSource);

    // 初始 lookAt 的中心距离守卫会分批收敛大跳变，1s 后补一次收敛到位
    setTimeout(() => {
        void mapView.lookAt({
            target: { lat: CENTER.lat, lng: CENTER.lng },
            zoomLevel: 16,
            tilt: 45
        });
        mapView.update();
    }, 1000);

    const modelDataSource = new ModelDataSource();
    await mapView.addDataSource(modelDataSource);
    (window as unknown as Record<string, unknown>).__mvtDs = modelDataSource;
    const box = new Mesh(
        new BoxGeometry(200, 80, 100),
        new MeshBasicMaterial({ color: 0xff5a2a })
    );
    // 放置必须用数据源所在地图的 projection（球面模式下是 ECEF 系），
    // 不能用导入的 webMercatorProjection——平面坐标进球面世界等于把
    // 模型放进太空，任何角度都不可见
    box.position.copy(
        modelDataSource.projection.projectPoint(
            new GeoCoordinates(BOX_GEO.lat, BOX_GEO.lng, 0)
        )
    );
    box.position.z += 50; // 半高：底面贴地
    modelDataSource.addObject(box);

    const gui: GUI = createExampleGui();
    applyPanelStyle(gui.domElement);
    const folder = gui.addFolder("MVT Occlusion Test");

    const applyRenderOrder = (order: number) => {
        box.renderOrder = order;
    };
    folder
        .add({ ro0: () => applyRenderOrder(0) }, "ro0")
        .name("renderOrder 0");
    folder
        .add({ ro10: () => applyRenderOrder(10) }, "ro10")
        .name("renderOrder 10");
    const flyTo = (name: string, zoomLevel: number, tilt: number, heading: number) => {
        void mapView.lookAt({
            target: { lat: BOX_GEO.lat, lng: BOX_GEO.lng },
            zoomLevel,
            tilt,
            heading
        });
        mapView.update();
    };
    folder
        .add({ f1: () => flyTo("大面积 12.5", 12.5, 40, 0) }, "f1")
        .name("大面积 12.5");
    folder
        .add({ f2: () => flyTo("中景 14.5", 14.5, 50, 30) }, "f2")
        .name("中景 14.5");
    folder
        .add({ f3: () => flyTo("近景 16", 16, 60, 60) }, "f3")
        .name("近景 16");
    folder
        .add({ f4: () => flyTo("低角 75°", 15.5, 75, 200) }, "f4")
        .name("低角 75°");
    folder.open();
}

void main();
