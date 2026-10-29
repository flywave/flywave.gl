/* Copyright (C) 2025 flywave.gl contributors */

/**
 * 材质/几何隔离测试（`?mode=isolation`）。
 *
 * 不经过 MapView、瓦片、主题、technique 描述层：直接实例化引擎的材质类
 * （MapMeshBasicMaterial / MapMeshStandardMaterial / SolidLineMaterial）和
 * 几何构建器（LineGroup ribbon），喂入与 harp.gl 隔离页完全相同的原始数值，
 * 在纯 three.js 场景里逐格渲染，页内自动取色/量宽并打印材质 mesh 级标志位。
 * 两页同格对比即可定位移植差异。数值取自 tilezen 皮肤 z16 档。
 */

import { mercatorProjection } from "@flywave/flywave-geoutils";
import { LineGroup } from "@flywave/flywave-lines";
import {
    EdgeMaterial,
    MapMeshBasicMaterial,
    MapMeshStandardMaterial,
    SolidLineMaterial
} from "@flywave/flywave-materials";
import {
    FontCatalog,
    FontUnit,
    TextCanvas,
    TextRenderStyle
} from "@flywave/flywave-text-canvas";
import * as THREE from "three/webgpu";

const CELL_W = 256;
const CELL_H = 240;
const COLS = 5;
const W = CELL_W * COLS;
const BG = 0xede7e1;

/** 线组相机：fov 40 正俯视 100m，像素/米 = 120 / (100·tan20°)。 */
const LINE_CAM_DIST = 100;
const LINE_CAM_FOV = 40;
const PX_PER_METER = CELL_H / 2 / (LINE_CAM_DIST * Math.tan((LINE_CAM_FOV / 2) * (Math.PI / 180)));

interface Sample {
    label: string;
    /** 格内相对坐标 0..1（原点左上）。 */
    fx: number;
    fy: number;
}

interface Cell {
    name: string;
    build: (scene: THREE.Scene) => THREE.Material[];
    camera: THREE.Camera;
    samples: Sample[];
    /** 沿格中心竖直扫描，统计非背景像素段宽度（线宽）。 */
    scanWidth?: boolean;
    expectPx?: number;
}

/**
 * 与引擎 applyBaseColorToMaterial / MapMaterialAdapter 相同的写法：显示域
 * sRGB 分量 + 显式 SRGBColorSpace（three r152+ 的 setRGB 默认按线性解释，
 * harp 的 three r129 无此参数、原值即显示值）。
 */
function setRaw(color: THREE.Color, hex: number): void {
    color.setRGB(
        ((hex >> 16) & 0xff) / 255,
        ((hex >> 8) & 0xff) / 255,
        (hex & 0xff) / 255,
        THREE.SRGBColorSpace
    );
}

function orthoCamera(): THREE.OrthographicCamera {
    const aspect = CELL_W / CELL_H;
    const cam = new THREE.OrthographicCamera(-0.6 * aspect, 0.6 * aspect, 0.6, -0.6, 0.01, 10);
    cam.position.set(0, 0, 1);
    cam.lookAt(0, 0, 0);
    cam.updateMatrixWorld();
    return cam;
}

function lineCamera(): THREE.PerspectiveCamera {
    const cam = new THREE.PerspectiveCamera(LINE_CAM_FOV, CELL_W / CELL_H, 1, 500);
    cam.position.set(0, 0, LINE_CAM_DIST);
    cam.lookAt(0, 0, 0);
    cam.updateMatrixWorld();
    return cam;
}

function meshCamera(): THREE.PerspectiveCamera {
    const cam = new THREE.PerspectiveCamera(40, CELL_W / CELL_H, 1, 500);
    cam.position.set(0, -70, 75);
    cam.lookAt(0, 0, 20);
    cam.updateMatrixWorld();
    return cam;
}

function fillQuad(hex: number, opacity = 1, size = 0.8, renderOrder = 0): THREE.Mesh {
    const mat = new MapMeshBasicMaterial();
    setRaw(mat.color, hex);
    mat.opacity = opacity;
    mat.transparent = opacity < 1;
    mat.depthTest = false;
    mat.depthWrite = false;
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(size, size), mat);
    mesh.renderOrder = renderOrder;
    return mesh;
}

function ribbon(points: number[]): THREE.BufferGeometry {
    const group = new LineGroup();
    group.add(new THREE.Vector3(0, 0, 0), points, mercatorProjection);
    return group.createGeometry();
}

function solidLine(
    points: number[],
    hex: number,
    lineWidth: number,
    extra: Partial<{
        outlineWidth: number;
        outlineColor: number;
        dashSize: number;
        gapSize: number;
        dashColor: number;
        caps: "Round" | "Square" | "None";
        opacity: number;
        fadeNear: number;
        fadeFar: number;
    }> = {},
    renderOrder = 0
): THREE.Mesh {
    const mat = new SolidLineMaterial({
        lineWidth,
        outlineWidth: extra.outlineWidth,
        dashSize: extra.dashSize,
        gapSize: extra.gapSize,
        dashColor: extra.dashColor,
        caps: extra.caps,
        opacity: extra.opacity,
        fadeNear: extra.fadeNear,
        fadeFar: extra.fadeFar,
        fog: false
    });
    setRaw(mat.color, hex);
    if (extra.outlineColor !== undefined) setRaw(mat.outlineColor, extra.outlineColor);
    if (extra.dashColor !== undefined) setRaw(mat.dashColor, extra.dashColor);
    const mesh = new THREE.Mesh(ribbon(points), mat);
    mesh.renderOrder = renderOrder;
    return mesh;
}

/** 建筑边线：EdgesGeometry + 引擎 EdgeMaterial（几何须带 extrusionAxis 属性）。 */
function boxEdges(hex: number, extra: Partial<{ fadeNear: number; fadeFar: number }> = {}) {
    const geom = new THREE.EdgesGeometry(new THREE.BoxGeometry(30, 30, 40));
    const n = geom.getAttribute("position").count;
    geom.setAttribute("extrusionAxis", new THREE.BufferAttribute(new Float32Array(n * 4), 4));
    const mat = new EdgeMaterial({ fadeNear: extra.fadeNear, fadeFar: extra.fadeFar });
    setRaw(mat.color, hex);
    const lines = new THREE.LineSegments(geom, mat);
    lines.position.set(0, 0, 20);
    lines.renderOrder = 1;
    return lines;
}

/** harp berlin 主题三灯原样（两页一致，仅为公平比较材质，不做调参）。 */
function addThemeLights(scene: THREE.Scene): void {
    scene.add(new THREE.AmbientLight(0xffffff, 0.9));
    const l1 = new THREE.DirectionalLight(0xcccbbb, 0.8);
    l1.position.set(1, 5, 0.5).normalize();
    scene.add(l1);
    scene.add(l1.target);
    const l2 = new THREE.DirectionalLight(0xf4db9c, 0.8);
    l2.position.set(-1, -3, 1).normalize();
    scene.add(l2);
    scene.add(l2.target);
}

function building(hex: number, alpha: number, emissive: number | undefined): THREE.Mesh {
    const mat = new MapMeshStandardMaterial({ flatShading: true });
    setRaw(mat.color, hex);
    if (emissive !== undefined) setRaw(mat.emissive, emissive);
    mat.opacity = alpha;
    mat.transparent = alpha < 1;
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(30, 30, 40), mat);
    mesh.position.set(0, 0, 20);
    return mesh;
}

const STRAIGHT = [-30, 0, 0, 30, 0, 0];
const ZIGZAG = [-30, -5, 0, -5, 15, 0, 10, -12, 0, 30, 8, 0];

function buildCells(): Cell[] {
    const center: Sample[] = [{ label: "c", fx: 0.5, fy: 0.5 }];
    const cells: Cell[] = [
        {
            name: "F1 fill #436981 水",
            camera: orthoCamera(),
            samples: center,
            build: s => {
                const m = fillQuad(0x436981);
                s.add(m);
                return [m.material as THREE.Material];
            }
        },
        {
            name: "F2 fill #6C9478 公园",
            camera: orthoCamera(),
            samples: center,
            build: s => {
                const m = fillQuad(0x6c9478);
                s.add(m);
                return [m.material as THREE.Material];
            }
        },
        {
            name: "F3 #919ea3 op0.8 叠 bg",
            camera: orthoCamera(),
            samples: center,
            build: s => {
                const bg = fillQuad(BG, 1, 1.0, 0);
                const top = fillQuad(0x919ea3, 0.8, 0.8, 1);
                s.add(bg, top);
                return [top.material as THREE.Material];
            }
        },
        {
            name: "F4 灰阶 000/404040/808080/FFF",
            camera: orthoCamera(),
            samples: [
                { label: "000", fx: 0.3, fy: 0.3 },
                { label: "404040", fx: 0.7, fy: 0.3 },
                { label: "808080", fx: 0.3, fy: 0.7 },
                { label: "FFF", fx: 0.7, fy: 0.7 }
            ],
            build: s => {
                const mk = (hex: number, x: number, y: number) => {
                    const m = fillQuad(hex, 1, 0.45);
                    m.position.set(x, y, 0);
                    s.add(m);
                    return m.material as THREE.Material;
                };
                return [
                    mk(0x000000, -0.25, 0.25),
                    mk(0x404040, 0.25, 0.25),
                    mk(0x808080, -0.25, -0.25),
                    mk(0xffffff, 0.25, -0.25)
                ];
            }
        },
        {
            name: "F5 fill #FF0000",
            camera: orthoCamera(),
            samples: center,
            build: s => {
                const m = fillQuad(0xff0000);
                s.add(m);
                return [m.material as THREE.Material];
            }
        },
        {
            name: "L1 solid 13m #D6C789",
            camera: lineCamera(),
            samples: center,
            scanWidth: true,
            expectPx: 13 * PX_PER_METER,
            build: s => {
                const m = solidLine(STRAIGHT, 0xd6c789, 13);
                s.add(m);
                return [m.material as THREE.Material];
            }
        },
        {
            name: "L2 outline15m #3A4C69 + fill13m",
            camera: lineCamera(),
            samples: [
                { label: "c", fx: 0.5, fy: 0.5 },
                { label: "edge", fx: 0.5, fy: 0.5 - (14 * PX_PER_METER) / 2 / CELL_H }
            ],
            scanWidth: true,
            expectPx: 15 * PX_PER_METER,
            build: s => {
                const o = solidLine(STRAIGHT, 0x3a4c69, 15, {}, 10);
                const f = solidLine(STRAIGHT, 0xd6c789, 13, {}, 11);
                s.add(o, f);
                return [o.material as THREE.Material, f.material as THREE.Material];
            }
        },
        {
            name: "L3 solid 3m #d1d0bf",
            camera: lineCamera(),
            samples: center,
            scanWidth: true,
            expectPx: 3 * PX_PER_METER,
            build: s => {
                const m = solidLine(STRAIGHT, 0xd1d0bf, 3);
                s.add(m);
                return [m.material as THREE.Material];
            }
        },
        {
            name: "L4 dashed #184F6E w3 d10 g10",
            camera: lineCamera(),
            samples: [
                { label: "c", fx: 0.5, fy: 0.5 },
                { label: "c+5m", fx: 0.5 + (5 * PX_PER_METER) / CELL_W, fy: 0.5 },
                { label: "c+10m", fx: 0.5 + (10 * PX_PER_METER) / CELL_W, fy: 0.5 }
            ],
            scanWidth: true,
            expectPx: 3 * PX_PER_METER,
            build: s => {
                const m = solidLine(STRAIGHT, 0x184f6e, 3, { dashSize: 10, gapSize: 10 });
                s.add(m);
                return [m.material as THREE.Material];
            }
        },
        {
            name: "L5 dashed #696A6B w5 d2 g25",
            camera: lineCamera(),
            samples: center,
            scanWidth: true,
            expectPx: 5 * PX_PER_METER,
            build: s => {
                const m = solidLine(STRAIGHT, 0x696a6b, 5, { dashSize: 2, gapSize: 25 });
                s.add(m);
                return [m.material as THREE.Material];
            }
        },
        {
            name: "L6 zigzag w8 Round",
            camera: lineCamera(),
            samples: center,
            build: s => {
                const m = solidLine(ZIGZAG, 0x3a4c69, 8, { caps: "Round" });
                s.add(m);
                return [m.material as THREE.Material];
            }
        },
        {
            name: "L7 solid 13m op0.5",
            camera: lineCamera(),
            samples: center,
            scanWidth: true,
            expectPx: 13 * PX_PER_METER,
            build: s => {
                const m = solidLine(STRAIGHT, 0xd6c789, 13, { opacity: 0.5 });
                s.add(m);
                return [m.material as THREE.Material];
            }
        },
        {
            // 引擎 secondary line 路径：副线材质 = material.clone() 再改色/宽。
            // 期望：下层 15m #3A4C69，上层 13m #D6C789（同 L2）。
            name: "L8 clone: A 13m + B=A.clone 15m #3A4C69",
            camera: lineCamera(),
            samples: [
                { label: "c", fx: 0.5, fy: 0.5 },
                { label: "edge", fx: 0.5, fy: 0.5 - (14 * PX_PER_METER) / 2 / CELL_H }
            ],
            scanWidth: true,
            expectPx: 15 * PX_PER_METER,
            build: s => {
                const a = solidLine(STRAIGHT, 0xd6c789, 13, {}, 11);
                const bMat = (a.material as SolidLineMaterial).clone() as SolidLineMaterial;
                setRaw(bMat.color, 0x3a4c69);
                bMat.lineWidth = 15;
                const b = new THREE.Mesh(ribbon(STRAIGHT), bMat);
                b.renderOrder = 10;
                s.add(b, a);
                return [bMat, a.material as THREE.Material];
            }
        },
        {
            name: "B1 std #EDE7E1 a0.902 em#78858C",
            camera: meshCamera(),
            samples: [
                { label: "roof", fx: 0.5, fy: 0.3 },
                { label: "wall", fx: 0.5, fy: 0.62 }
            ],
            build: s => {
                addThemeLights(s);
                const m = building(0xede7e1, 0xe6 / 255, 0x78858c);
                s.add(m);
                return [m.material as THREE.Material];
            }
        },
        {
            name: "B2 std 无 emissive",
            camera: meshCamera(),
            samples: [
                { label: "roof", fx: 0.5, fy: 0.3 },
                { label: "wall", fx: 0.5, fy: 0.62 }
            ],
            build: s => {
                addThemeLights(s);
                const m = building(0xede7e1, 0xe6 / 255, undefined);
                s.add(m);
                return [m.material as THREE.Material];
            }
        },
        {
            name: "B3 basic #EDE7E1 opaque 无光",
            camera: meshCamera(),
            samples: [
                { label: "roof", fx: 0.5, fy: 0.3 },
                { label: "wall", fx: 0.5, fy: 0.62 }
            ],
            build: s => {
                const mat = new MapMeshBasicMaterial();
                setRaw(mat.color, 0xede7e1);
                const m = new THREE.Mesh(new THREE.BoxGeometry(30, 30, 40), mat);
                m.position.set(0, 0, 20);
                s.add(m);
                return [mat];
            }
        },
        {
            // 真实瓦片建筑材质参数（dump 自两引擎，一致）：metalness 0.8 roughness 1
            name: "B4 std metal0.8 rough1 三灯",
            camera: meshCamera(),
            samples: [
                { label: "roof", fx: 0.5, fy: 0.3 },
                { label: "wall", fx: 0.5, fy: 0.62 }
            ],
            build: s => {
                addThemeLights(s);
                const mat = new MapMeshStandardMaterial({
                    flatShading: true,
                    metalness: 0.8,
                    roughness: 1
                });
                setRaw(mat.color, 0xede7e1);
                const m = new THREE.Mesh(new THREE.BoxGeometry(30, 30, 40), mat);
                m.position.set(0, 0, 20);
                s.add(m);
                return [mat];
            }
        },
        {
            // 建筑边线：EdgeMaterial #172023（真实瓦片参数）叠在无光 basic 盒上
            name: "E1 EdgeMaterial #172023 on basic box",
            camera: meshCamera(),
            samples: [
                { label: "roof", fx: 0.5, fy: 0.3 },
                { label: "wall", fx: 0.5, fy: 0.62 }
            ],
            build: s => {
                const mat = new MapMeshBasicMaterial();
                setRaw(mat.color, 0xede7e1);
                const m = new THREE.Mesh(new THREE.BoxGeometry(30, 30, 40), mat);
                m.position.set(0, 0, 20);
                const e = boxEdges(0x172023);
                s.add(m, e);
                return [mat, e.material as THREE.Material];
            }
        },
        {
            // 片元级 fade：相机距 100m，fadeNear 80 / fadeFar 120 → 中心 alpha 0.5
            name: "L9 fade 80/120 @100m 13m #D6C789",
            camera: lineCamera(),
            samples: center,
            scanWidth: true,
            expectPx: 13 * PX_PER_METER,
            build: s => {
                const m = solidLine(STRAIGHT, 0xd6c789, 13, { fadeNear: 80, fadeFar: 120 });
                s.add(m);
                return [m.material as THREE.Material];
            }
        },
        {
            // 同材质 outline 路径（USE_OUTLINE）：总宽 13 + 2×2 = 17m
            name: "L10 outline2m #3A4C69 on 13m",
            camera: lineCamera(),
            samples: [
                { label: "c", fx: 0.5, fy: 0.5 },
                { label: "edge", fx: 0.5, fy: 0.5 - (16 * PX_PER_METER) / 2 / CELL_H }
            ],
            scanWidth: true,
            expectPx: 17 * PX_PER_METER,
            build: s => {
                const m = solidLine(STRAIGHT, 0xd6c789, 13, {
                    outlineWidth: 2,
                    outlineColor: 0x3a4c69
                });
                s.add(m);
                return [m.material as THREE.Material];
            }
        },
        {
            // dashColor 路径（USE_DASH_COLOR）：gap 段应呈 dashColor 而非透明
            name: "L11 dashed w3 d10 g10 dashColor #FF0000",
            camera: lineCamera(),
            samples: [
                { label: "c", fx: 0.5, fy: 0.5 },
                { label: "c+10m", fx: 0.5 + (10 * PX_PER_METER) / CELL_W, fy: 0.5 }
            ],
            scanWidth: true,
            expectPx: 3 * PX_PER_METER,
            build: s => {
                const m = solidLine(STRAIGHT, 0x184f6e, 3, {
                    dashSize: 10,
                    gapSize: 10,
                    dashColor: 0xff0000
                });
                s.add(m);
                return [m.material as THREE.Material];
            }
        },
        {
            // caps None：线长应恰为 60m（Round 会各端外延半宽）
            name: "L12 caps None 13m",
            camera: lineCamera(),
            samples: center,
            scanWidth: true,
            expectPx: 13 * PX_PER_METER,
            build: s => {
                const m = solidLine(STRAIGHT, 0xd6c789, 13, { caps: "None" });
                s.add(m);
                return [m.material as THREE.Material];
            }
        }
    ];
    return cells;
}

function materialFlags(m: THREE.Material): Record<string, unknown> {
    const anyM = m as unknown as Record<string, unknown>;
    return {
        type: m.type,
        transparent: m.transparent,
        opacity: m.opacity,
        depthTest: m.depthTest,
        depthWrite: m.depthWrite,
        blending: m.blending,
        side: m.side,
        stencilWrite: m.stencilWrite,
        premultipliedAlpha: m.premultipliedAlpha,
        lineWidth: anyM.lineWidth,
        color:
            anyM.color instanceof THREE.Color
                ? "#" + (anyM.color as THREE.Color).getHexString()
                : undefined
    };
}

export async function runIsolationTest(): Promise<void> {
    const cells = buildCells();
    const H = CELL_H * (Math.ceil(cells.length / COLS) + 1); // 底部多留一行给文字条带
    document.body.innerHTML = "";
    document.body.style.cssText = "margin:0;background:#222;color:#ddd;font:12px monospace";
    const wrap = document.createElement("div");
    wrap.style.cssText = `position:relative;width:${W}px;height:${H}px`;
    const canvas = document.createElement("canvas");
    canvas.width = W;
    canvas.height = H;
    canvas.style.cssText = `width:${W}px;height:${H}px;display:block`;
    const overlay = document.createElement("canvas");
    overlay.width = W;
    overlay.height = H;
    overlay.style.cssText = `position:absolute;left:0;top:0;width:${W}px;height:${H}px;pointer-events:none`;
    wrap.append(canvas, overlay);
    const pre = document.createElement("pre");
    pre.id = "isoResults";
    pre.style.cssText = "white-space:pre;padding:8px;margin:0";
    document.body.append(wrap, pre);

    const renderer = new THREE.WebGPURenderer({ canvas, antialias: false });
    await renderer.init();
    renderer.setPixelRatio(1);
    renderer.setSize(W, H, false);
    renderer.setClearColor(BG, 1);
    renderer.autoClear = true;
    renderer.setScissorTest(true);

    const flags: Record<string, Record<string, unknown>[]> = {};
    // three r185 的 WebGPU 后端 setViewport/setScissor 原点在左上（实测：
    // 按 WebGL 左下约定映射时第 0 行与第 2 行对调）；WebGL 回退后端仍是左下。
    const isWebGPU =
        (renderer.backend as unknown as { isWebGPUBackend?: boolean }).isWebGPUBackend === true;
    for (let i = 0; i < cells.length; i++) {
        const cell = cells[i];
        const col = i % COLS;
        const row = Math.floor(i / COLS);
        const x = col * CELL_W;
        const y = isWebGPU ? row * CELL_H : H - (row + 1) * CELL_H;
        const scene = new THREE.Scene();
        flags[cell.name] = cell.build(scene).map(materialFlags);
        renderer.setViewport(x, y, CELL_W, CELL_H);
        renderer.setScissor(x, y, CELL_W, CELL_H);
        await renderer.renderAsync(scene, cell.camera);
    }

    // T 组：文字隔离。独立条带画布 + 独立 WebGPURenderer；底色与文字 pass
    // 全部走 renderAsync（同步 render() 在 WebGPU 上与 renderAsync 混用时
    // 呈现时序不稳定）。文字 pass 复刻 TextCanvas.render 的层结构：
    // autoClear 关掉，backgroundScene + scene 两次提交合成板+字形。
    // renderText 期间 outputColorSpace 切成 working（pass-through，与生产
    // MapView.renderText 及 harp r129 一致），AA 在 sRGB 域混合。
    try {
        const STRIP_W = W;
        const STRIP_H = CELL_H;
        const stripCanvas = document.createElement("canvas");
        stripCanvas.width = STRIP_W;
        stripCanvas.height = STRIP_H;
        stripCanvas.style.cssText = `width:${STRIP_W}px;height:${STRIP_H}px;display:block;background:#ede7e1`;
        const stripRenderer = new THREE.WebGPURenderer({ canvas: stripCanvas, antialias: false });
        await stripRenderer.init();
        // 创建即 pass-through（harp r129 输出无变换的等价物；中途切换会触发
        // 管线重建把文字 pass 丢帧）——原始 sRGB 进出，AA 在 sRGB 域混合
        stripRenderer.outputColorSpace = THREE.LinearSRGBColorSpace;
        stripRenderer.setPixelRatio(1);
        stripRenderer.setSize(STRIP_W, STRIP_H, false);
        stripRenderer.setClearColor(0xede7e1, 1);
        const fontCatalog = await FontCatalog.load("resources/fonts/Default_FontCatalog.json", 1024);
        const textCanvas = new TextCanvas({
            renderer: stripRenderer as unknown as Parameters<typeof TextCanvas>[0]["renderer"],
            rendererCapabilities: { isWebGL2: false, logarithmicDepthBuffer: false },
            fontCatalog,
            minGlyphCount: 8,
            maxGlyphCount: 2048
        } as ConstructorParameters<typeof TextCanvas>[0]);
        // FontCatalog.load 不预载字形位图，必须先 loadCharset 再 addText
        await fontCatalog.loadCharset(
            "ManhattanNew York 123中文",
            new TextRenderStyle({ fontSize: { unit: FontUnit.Pixel, size: 32 } })
        );
        const samples = [
            { text: "Manhattan", size: 24, color: 0x333333, cx: STRIP_W * 0.1 },
            { text: "New York 123", size: 32, color: 0xff0000, cx: STRIP_W * 0.35 },
            { text: "中文 Manhattan", size: 24, color: 0x0055aa, cx: STRIP_W * 0.62 },
            { text: "Manhattan", size: 24, color: 0x333333, bg: 0x9ecfe0, cx: STRIP_W * 0.87 }
        ];
        const addResults = [];
        for (const s of samples) {
            // pass-through 输出下顶点色必须是原值 sRGB（进出一致 = harp）
            const col = new THREE.Color().setRGB(
                ((s.color >> 16) & 0xff) / 255,
                ((s.color >> 8) & 0xff) / 255,
                (s.color & 0xff) / 255,
                THREE.NoColorSpace
            );
            const bgCol = new THREE.Color().setRGB(1, 1, 1, THREE.NoColorSpace);
            if (s.bg !== undefined) {
                bgCol.setRGB(
                    ((s.bg >> 16) & 0xff) / 255,
                    ((s.bg >> 8) & 0xff) / 255,
                    (s.bg & 0xff) / 255,
                    THREE.NoColorSpace
                );
            }
            textCanvas.textRenderStyle = new TextRenderStyle({
                fontSize: { unit: FontUnit.Pixel, size: s.size, backgroundSize: s.bg !== undefined ? 40 : 0 },
                color: col,
                backgroundColor: bgCol,
                backgroundOpacity: s.bg !== undefined ? 1 : 0
            });
            // TextCanvas 屏幕坐标原点在画布中心，Y 向上
            addResults.push(textCanvas.addText(s.text, new THREE.Vector3(s.cx - STRIP_W / 2, 0, 0)));
        }
        document.body.insertBefore(stripCanvas, wrap);
        const ortho = new THREE.OrthographicCamera(-STRIP_W / 2, STRIP_W / 2, STRIP_H / 2, -STRIP_H / 2, -1000, 1000);
        // 底色
        await stripRenderer.renderAsync(new THREE.Scene(), ortho);
        // 文字 pass（复刻 TextCanvas.render，异步提交）；输出 pass-through
        // 与生产 MapView.renderText 相同
        fontCatalog.update(stripRenderer);
        stripRenderer.setRenderTarget(null);
        const savedAuto = stripRenderer.autoClear;
        stripRenderer.autoClear = false;
        const layers = (textCanvas as unknown as { m_layers: Array<{ id: number; storage: { update(): void; backgroundScene: THREE.Scene; scene: THREE.Scene } }> }).m_layers;
        for (const layer of layers) {
            layer.storage.update();
            await stripRenderer.renderAsync(layer.storage.backgroundScene, ortho);
            await stripRenderer.renderAsync(layer.storage.scene, ortho);
        }
        stripRenderer.autoClear = savedAuto;
        // 诊断：Color(hex) 的实际存储值 + 顶点缓冲 aColor 首值
        (window as unknown as Record<string, unknown>).__colorDiag = (() => {
            const c = new THREE.Color(0x333333);
            let vColor = null;
            const layer = (textCanvas as unknown as { m_layers: Array<{ storage: { scene: THREE.Scene } }> }).m_layers[0];
            layer.storage.scene.traverse(o => {
                if (!vColor && (o as THREE.Mesh).isMesh) {
                    const g = (o as THREE.Mesh).geometry as THREE.BufferGeometry;
                    const a = g.getAttribute("aColor") as THREE.BufferAttribute | undefined;
                    if (a) vColor = [a.getX(0), a.getY(0), a.getZ(0), a.getW(0)];
                }
            });
            return { colorR: c.r, cm: THREE.ColorManagement.enabled, vColor };
        })();
        (window as unknown as Record<string, unknown>).__textCanvas = textCanvas;
        (window as unknown as Record<string, unknown>).__stripFontCatalog = fontCatalog;
        (window as unknown as Record<string, unknown>).__textStripInfo = {
            w: STRIP_W,
            h: STRIP_H,
            centers: samples.map(s => s.cx),
            add: addResults
        };
    } catch (e) {
        (window as unknown as Record<string, unknown>).__textError = String((e as Error).stack || e);
    }

    // 取样
    const c2d = document.createElement("canvas");
    c2d.width = W;
    c2d.height = H;
    const ctx = c2d.getContext("2d")!;
    ctx.drawImage(canvas, 0, 0);
    const img = ctx.getImageData(0, 0, W, H).data;
    const px = (x: number, y: number) => {
        const o = (Math.round(y) * W + Math.round(x)) * 4;
        return [img[o], img[o + 1], img[o + 2]];
    };
    const bgRgb = px(2, 2);
    const isBg = (p: number[]) =>
        Math.abs(p[0] - bgRgb[0]) + Math.abs(p[1] - bgRgb[1]) + Math.abs(p[2] - bgRgb[2]) < 12;

    const results: Record<string, unknown> = {
        engine: "flywave three/webgpu",
        renderer: {
            backend: (renderer.backend as unknown as { isWebGPUBackend?: boolean })
                .isWebGPUBackend
                ? "webgpu"
                : "webgl2",
            outputColorSpace: renderer.outputColorSpace,
            toneMapping: renderer.toneMapping,
            colorManagement: THREE.ColorManagement.enabled,
            workingColorSpace: THREE.ColorManagement.workingColorSpace
        },
        pxPerMeter: +PX_PER_METER.toFixed(3),
        bg: bgRgb,
        cells: {} as Record<string, unknown>
    };
    const octx = overlay.getContext("2d")!;
    octx.font = "12px monospace";
    for (let i = 0; i < cells.length; i++) {
        const cell = cells[i];
        const col = i % COLS;
        const row = Math.floor(i / COLS);
        const ox = col * CELL_W;
        const oy = row * CELL_H;
        const entry: Record<string, unknown> = { materials: flags[cell.name] };
        const samples: Record<string, number[]> = {};
        for (const smp of cell.samples) {
            const sx = ox + smp.fx * CELL_W;
            const sy = oy + smp.fy * CELL_H;
            samples[smp.label] = px(sx, sy);
            octx.strokeStyle = "#f0f";
            octx.strokeRect(sx - 2, sy - 2, 5, 5);
        }
        entry.samples = samples;
        if (cell.scanWidth) {
            const sx = ox + CELL_W / 2;
            let count = 0;
            let first = -1;
            let last = -1;
            for (let yy = oy; yy < oy + CELL_H; yy++) {
                if (!isBg(px(sx, yy))) {
                    count++;
                    if (first < 0) first = yy;
                    last = yy;
                }
            }
            entry.widthPx = count;
            entry.widthSpanPx = first < 0 ? 0 : last - first + 1;
            entry.expectPx = +(cell.expectPx ?? 0).toFixed(1);
        }
        {
            // 水平剖面：沿格中心行扫描，run-length 串（L=线 / B=背景，单位 px）
            const sy = oy + CELL_H / 2;
            const runs: string[] = [];
            let cur = "";
            let len = 0;
            for (let xx = ox; xx < ox + CELL_W; xx++) {
                const k = isBg(px(xx, sy)) ? "B" : "L";
                if (k === cur) len++;
                else {
                    if (cur) runs.push(cur + len);
                    cur = k;
                    len = 1;
                }
            }
            if (cur) runs.push(cur + len);
            entry.profile = runs.join(" ");
        }
        results.cells = { ...(results.cells as object), [cell.name]: entry };
        octx.fillStyle = "rgba(0,0,0,.6)";
        octx.fillRect(ox, oy, CELL_W, 16);
        octx.fillStyle = "#fff";
        octx.fillText(cell.name, ox + 4, oy + 12);
        octx.strokeStyle = "#000";
        octx.strokeRect(ox + 0.5, oy + 0.5, CELL_W - 1, CELL_H - 1);
    }

    const text = JSON.stringify(results, null, 1);
    pre.textContent = text;
    (window as unknown as Record<string, unknown>).__isoResults = results;
    // eslint-disable-next-line no-console
    console.log("[isolation]", text);
}
