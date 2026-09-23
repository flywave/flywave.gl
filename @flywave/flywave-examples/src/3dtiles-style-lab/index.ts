/* Copyright (C) 2025 flywave.gl contributors */

import {
    MapView,
    GeoCoordinates,
    ellipsoidProjection,
    MapControls,
    CesiumIonDataSource,
    MapControlsUI,
    Theme,
    WindowEventHandler
} from "@flywave/flywave.gl";

import { installDebugErrorCapture, shouldForceWebGL } from "../common-webgl-debug";
import { PropertiesTable } from "./PropertiesTable.js";

installDebugErrorCapture();

/**
 * 动态改色循环色板
 */
const CYCLE_COLORS = ["#7EC8FF", "#98FB98", "#FFD700", "#FFA500", "#FF69B4", "#9370DB"];

/**
 * HSL 转 HEX（20 档色带用）
 */
const hslToHex = (hue: number, saturation: number, lightness: number): string => {
    const l = lightness / 100;
    const a = (saturation / 100) * Math.min(l, 1 - l);
    const f = (n: number): string => {
        const k = (n + hue / 30) % 12;
        const color = l - a * Math.max(Math.min(k - 3, 9 - k, 1), -1);
        return Math.round(255 * color)
            .toString(16)
            .padStart(2, "0");
    };
    return `#${f(0)}${f(8)}${f(4)}`;
};

/**
 * 20 档 10m 色带（样式纹理容量压力）
 */
const BAND_COLORS: string[] = Array.from({ length: 20 }, (_, i) =>
    hslToHex(Math.round((i / 20) * 300), 70, 55)
);

/**
 * Get map canvas element
 * @returns HTMLCanvasElement Map canvas element
 */
const getMapCanvas = (): HTMLCanvasElement => {
    const canvas = document.getElementById("mapCanvas") as HTMLCanvasElement;
    if (!canvas) {
        throw new Error(
            "Map canvas element not found, please ensure there is a canvas element with id 'mapCanvas' in HTML"
        );
    }
    return canvas;
};

/**
 * Initialize map view
 * @param canvas Map canvas element
 * @returns Configured MapView instance
 */
const initializeMapView = (canvas: HTMLCanvasElement): MapView => {
    // 默认位置与 3dtiles-terrain-overlay 一致（曼哈顿，75343 建筑模型所在处）
    const initialLocation = new GeoCoordinates(40.6959, -74.0162);

    return new MapView({
        projection: ellipsoidProjection,
        forceWebGL: shouldForceWebGL(),
        target: initialLocation,
        zoomLevel: 18,
        tilt: 70,
        heading: 35.1,
        canvas: canvas,
        enableGpuPicking: true,
        theme: {
            atmosphere: {
                enabled: true,
                sunTime: new Date().setHours(23),
                sunCastShadow: true
            },
            toneMappingExposure: 10,
            toneMappingMode: "neutral"
        }
    });
};

/**
 * Initialize map controls
 * @param mapView Map view instance
 * @returns MapControls instance
 */
const initializeMapControls = (mapView: MapView): MapControls => {
    const controls = new MapControls(mapView);
    const ui = new MapControlsUI(controls);
    const canvas = document.getElementById("mapCanvas") as HTMLCanvasElement;
    canvas.parentElement!.appendChild(ui.domElement);
    return controls;
};

/**
 * Create the Cesium Ion 3D Tiles data source（与用户配置一致）
 * @param mapView Map view instance
 * @returns CesiumIonDataSource instance
 */
const create3DTilesDataSource = (mapView: MapView): CesiumIonDataSource => {
    const cesiumIonDataSource = new CesiumIonDataSource({
        styleSetName: "3dtiles",
        accessToken: CESIUM_ION_TOKEN,
        assetId: 75343,
        // 75343 的批 id 属性名（golden 示例同款配置）
        customAttributeConfig: {
            batchIdAttributeName: "_batchid"
        },
        castShadow: true,
        receiveShadow: true,
        animation: {
            easing: "ease-in-out",
            duration: 1000
        }
    });

    mapView.addDataSource(cesiumIonDataSource);
    return cesiumIonDataSource;
};

/**
 * 分级配色主题（含动画渐变 from/to + value），末尾附恒假占位的选中样式
 * @returns Theme instance
 */
const createTieredTheme = (): Theme => {
    return {
        styles: {
            "3dtiles": [
                {
                    when: "Height >= 0 && Height < 15",
                    technique: "tile3d",
                    color: { from: "#B0E2FF", to: "#7EC0EE" },
                    value: 0.9,
                    opacity: { from: 0.5, to: 1 }
                },
                {
                    when: "Height >= 15 && Height < 30",
                    technique: "tile3d",
                    color: { from: "#98FB98", to: "#00FA9A" },
                    value: 0.9,
                    opacity: { from: 0.6, to: 1 }
                },
                {
                    when: "Height >= 30 && Height < 50",
                    technique: "tile3d",
                    color: { from: "#FFFACD", to: "#FFD700" },
                    value: 0.95,
                    opacity: { from: 0.7, to: 1 }
                },
                {
                    when: "Height >= 50 && Height < 80",
                    technique: "tile3d",
                    color: { from: "#FFDAB9", to: "#FFA500" },
                    value: 0.95,
                    opacity: { from: 0.75, to: 0.9 }
                },
                {
                    when: "Height >= 80 && Height < 120",
                    technique: "tile3d",
                    color: { from: "#FFB6C1", to: "#FF69B4" },
                    value: 1.0,
                    opacity: { from: 0.8, to: 1 }
                },
                {
                    when: "Height >= 120",
                    technique: "tile3d",
                    color: { from: "#E6E6FA", to: "#9370DB" },
                    value: 1.0,
                    opacity: { from: 0.85, to: 1.0 }
                },
                {
                    id: "selected",
                    when: "0!=0",
                    technique: "tile3d",
                    color: "#FFFF00",
                    value: 1.0,
                    opacity: 1.0
                }
            ]
        }
    };
};

// ==================== 测试面板 UI ====================

let logElement: HTMLDivElement | null = null;

/**
 * Append a line to the on-screen log panel and console
 * @param message Log message
 */
const log = (message: string): void => {
    console.log(`[样式测试] ${message}`);
    if (logElement) {
        const line = document.createElement("div");
        line.textContent = `${new Date().toLocaleTimeString()} ${message}`;
        logElement.appendChild(line);
        logElement.scrollTop = logElement.scrollHeight;
    }
};

/**
 * Create the scenario control panel with buttons and a log area
 * @returns addButton hook for registering scenario buttons
 */
const createControlPanel = (): {
    addButton: (text: string, color: string, onClick: () => void) => void;
} => {
    const panel = document.createElement("div");
    panel.style.cssText =
        "position:absolute;top:10px;left:10px;z-index:1000;background:rgba(255,255,255,0.95);" +
        "padding:12px;border-radius:6px;box-shadow:0 2px 8px rgba(0,0,0,0.3);font-family:Arial,sans-serif;" +
        "max-height:calc(100vh - 20px);overflow-y:auto;width:290px;";

    const title = document.createElement("h3");
    title.textContent = "3D Tiles 样式全面测试";
    title.style.cssText = "margin:0 0 8px 0;font-size:14px;";
    panel.appendChild(title);

    const hint = document.createElement("div");
    hint.textContent = "每次切换观察：颜色即时生效、无卡顿（看右下角 FPS/最差帧）";
    hint.style.cssText = "font-size:11px;color:#666;margin-bottom:8px;";
    panel.appendChild(hint);

    const buttonContainer = document.createElement("div");
    buttonContainer.style.cssText = "display:flex;flex-wrap:wrap;gap:4px;";
    panel.appendChild(buttonContainer);

    const logArea = document.createElement("div");
    logArea.style.cssText =
        "margin-top:8px;font-size:11px;font-family:monospace;max-height:180px;overflow-y:auto;" +
        "background:#f5f5f5;border-radius:3px;padding:6px;line-height:1.5;";
    panel.appendChild(logArea);
    logElement = logArea;

    document.body.appendChild(panel);

    let currentContainer: HTMLDivElement = buttonContainer;

    const addButton = (text: string, color: string, onClick: () => void): void => {
        const button = document.createElement("button");
        button.textContent = text;
        button.style.cssText =
            `padding:6px 8px;background:${color};color:white;border:none;` +
            "border-radius:3px;cursor:pointer;font-size:12px;";
        button.onclick = onClick;
        currentContainer.appendChild(button);
    };

    const addSection = (title: string): void => {
        const header = document.createElement("div");
        header.textContent = title;
        header.style.cssText = "font-size:12px;font-weight:bold;color:#333;margin:8px 0 4px 0;";
        panel.insertBefore(header, logArea);
        currentContainer = document.createElement("div");
        currentContainer.style.cssText = "display:flex;flex-wrap:wrap;gap:4px;";
        panel.insertBefore(currentContainer, logArea);
    };

    return { addButton, addSection };
};

/**
 * FPS/最差帧监视：样式操作若触发大规模重编译会在这里直接暴露
 */
const startFpsMonitor = (): void => {
    const badge = document.createElement("div");
    badge.style.cssText =
        "position:absolute;bottom:10px;right:10px;z-index:1000;background:rgba(0,0,0,0.7);color:#0f0;" +
        "padding:6px 10px;border-radius:4px;font-family:monospace;font-size:13px;";
    document.body.appendChild(badge);

    let frames = 0;
    let worst = 0;
    let last = performance.now();
    let windowStart = last;

    const tick = (now: number): void => {
        frames++;
        worst = Math.max(worst, now - last);
        last = now;
        if (now - windowStart >= 1000) {
            badge.textContent = `FPS ${frames} ｜ 最差帧 ${worst.toFixed(0)}ms`;
            badge.style.color = frames >= 50 ? "#0f0" : frames >= 30 ? "#ff0" : "#f55";
            frames = 0;
            worst = 0;
            windowStart = now;
        }
        requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
};

/**
 * 批材质登记快照：页内断言"样式操作零重建零 dispose"铁律
 */
type WatcherSnapshot = { count: number; instances: Array<[string, any]> };

const snapshotWatcher = (dataSource: any): WatcherSnapshot => {
    const applied = dataSource.m_styleWatcher.m_appliedMaterials as Map<string, any[]>;
    const instances: Array<[string, any]> = [];
    applied.forEach((mats, id) => instances.push([id, mats[0]]));
    return { count: instances.length, instances };
};

const instancesUnchanged = (dataSource: any, before: WatcherSnapshot): boolean => {
    const applied = dataSource.m_styleWatcher.m_appliedMaterials as Map<string, any[]>;
    if (applied.size !== before.count) {
        return false;
    }
    return before.instances.every(([id, instance]) => applied.get(id)?.[0] === instance);
};

// ==================== 主执行流程 ====================

try {
    const canvas = getMapCanvas();
    const mapView = initializeMapView(canvas);
    (globalThis as any).mapView = mapView;

    const mapControls = initializeMapControls(mapView);
    void mapControls;

    // 按需渲染引擎：持续动画帧让 FPS 监视与动画样式生效
    mapView.beginAnimation();

    const dataSource = create3DTilesDataSource(mapView);

    // ---- 面板与场景 ----
    const panel = createControlPanel();

    const ensureBaseStyle = (patch: Record<string, unknown>): void => {
        const updated = dataSource.updateStyleById("base", patch as any);
        if (!updated) {
            dataSource.addStyle({
                id: "base",
                when: "Height >= 0",
                technique: "tile3d",
                color: "#7EC8FF",
                opacity: 1,
                ...patch
            } as any);
        }
    };

    const removeIds = (ids: string[]): void => {
        ids.forEach(id => dataSource.removeStyleById(id));
    };

    panel.addButton("分级配色+动画", "#2C7BE5", () => {
        dataSource.setTheme(createTieredTheme());
        log("✔ setTheme 分级配色（from/to 渐变 + 1s 动画）已应用");
    });

    panel.addButton("单色纯色", "#28a745", () => {
        ensureBaseStyle({ color: "#7EC8FF", opacity: 1 });
        log("✔ 单色纯色已应用（base 样式）");
    });

    panel.addButton("半透明X光", "#17a2b8", () => {
        ensureBaseStyle({ color: "#88ccff", opacity: 0.3 });
        log("✔ 半透明 X 光（opacity 0.3）已应用");
    });

    panel.addButton("隐藏<40m", "#6f42c1", () => {
        dataSource.addStyle({
            id: "hide-low",
            when: "Height < 40",
            technique: "tile3d",
            visible: false
        } as any);
        log("✔ visible:false 隐藏 <40m 已应用");
    });

    panel.addButton("取消隐藏", "#6c757d", () => {
        const removed = dataSource.removeStyleById("hide-low");
        log(removed ? "✔ hide-low 已移除" : "ℹ hide-low 不存在");
    });

    panel.addButton("金色≥80m", "#fd7e14", () => {
        const updated = dataSource.updateStyleById("top-gold", {
            color: "#FFD700",
            opacity: 1
        } as any);
        if (!updated) {
            dataSource.addStyle({
                id: "top-gold",
                when: "Height >= 80",
                technique: "tile3d",
                color: "#FFD700",
                opacity: 1
            } as any);
        }
        log("✔ 追加/更新 金色 ≥80m（top-gold）");
    });

    panel.addButton("移除金色", "#6c757d", () => {
        const removed = dataSource.removeStyleById("top-gold");
        log(removed ? "✔ top-gold 已移除（回退到剩余样式）" : "ℹ top-gold 不存在");
    });

    let cycleIndex = 0;
    panel.addButton("动态改色", "#e83e8c", () => {
        const color = CYCLE_COLORS[cycleIndex % CYCLE_COLORS.length];
        cycleIndex++;
        ensureBaseStyle({ color });
        log(`✔ updateStyleById 动态改色 → ${color}`);
    });

    panel.addButton("清空全部", "#dc3545", () => {
        removeIds(["base", "hide-low", "top-gold", "selected"]);
        log("✔ 全部样式已清空（应看到原始外观，无卡顿）");
    });

    panel.addButton("重应用分级", "#2C7BE5", () => {
        dataSource.setTheme(createTieredTheme());
        log("✔ setTheme 重新应用分级配色");
    });

    // ---- 压力/复杂度场景 ----
    panel.addSection("—— 压力/复杂度测试 ——");

    panel.addButton("样式风暴×100", "#d63384", () => {
        ensureBaseStyle({ color: "#7EC8FF", opacity: 1 });
        const before = snapshotWatcher(dataSource);
        log("▶ 样式风暴开始：100 次更新 @10Hz");
        let i = 0;
        const timer = setInterval(() => {
            ensureBaseStyle({
                color: CYCLE_COLORS[i % CYCLE_COLORS.length],
                opacity: 0.4 + (i % 6) / 10
            });
            i++;
            if (i >= 100) {
                clearInterval(timer);
                log(
                    instancesUnchanged(dataSource, before)
                        ? "✔ 样式风暴×100：批材质实例零重建（铁律成立）"
                        : "✘ 样式风暴发生材质重建/登记变化！"
                );
            }
        }, 100);
    });

    panel.addButton("呼吸动画10s", "#d63384", () => {
        ensureBaseStyle({ color: "#7EC8FF", opacity: 1 });
        const before = snapshotWatcher(dataSource);
        log("▶ 呼吸动画开始：样式纹理连续 churn 10s");
        let i = 0;
        const timer = setInterval(() => {
            const t = i / 100;
            const opacity = 0.3 + 0.7 * (0.5 + 0.5 * Math.sin(t * Math.PI * 2));
            ensureBaseStyle({ color: i % 2 === 0 ? "#7EC8FF" : "#FFD700", opacity });
            i++;
            if (i >= 100) {
                clearInterval(timer);
                log(
                    instancesUnchanged(dataSource, before)
                        ? "✔ 呼吸动画10s：零重建（纹理级更新路径成立）"
                        : "✘ 呼吸动画发生材质重建！"
                );
            }
        }, 100);
    });

    panel.addButton("巡航+风暴20s", "#d63384", () => {
        const before = snapshotWatcher(dataSource);
        log("▶ 相机巡航 + 样式风暴 20s（失活/复活与样式更新交叉）");
        let heading = 35.1;
        let i = 0;
        const storm = setInterval(() => {
            ensureBaseStyle({ color: CYCLE_COLORS[i % CYCLE_COLORS.length], opacity: 1 });
            i++;
        }, 200);
        const orbit = setInterval(() => {
            heading = (heading + 3) % 360;
            mapView.lookAt({ heading });
        }, 250);
        setTimeout(() => {
            clearInterval(storm);
            clearInterval(orbit);
            log(
                instancesUnchanged(dataSource, before)
                    ? "✔ 巡航+风暴完成：存留瓦片实例零重建"
                    : "ℹ 巡航+风暴完成（瓦片重解析重建属预期；若出现卡顿即异常）"
            );
        }, 20000);
    });

    panel.addButton("逐出往返", "#6f42c1", () => {
        const beforeCount = snapshotWatcher(dataSource).count;
        log("▶ 逐出测试：飞离至 zoom 12（触发 LRU 逐出），10s 后飞回");
        mapView.lookAt({ zoomLevel: 12 });
        setTimeout(() => {
            mapView.lookAt({ zoomLevel: 18 });
            log("ℹ 已飞回，等待重新加载…建筑应保持当前配色（逐出即遗忘 → 重套样式）");
            setTimeout(() => {
                const after = snapshotWatcher(dataSource);
                log(
                    `✔ 逐出往返完成：登记瓦片 ${beforeCount} → ${after.count}（重解析瓦片允许重建实例）`
                );
            }, 8000);
        }, 10000);
    });

    panel.addButton("复杂表达式", "#20c997", () => {
        dataSource.setTheme({
            styles: {
                "3dtiles": [
                    {
                        when: "(Height < 20 || Height >= 100) && !(Height < 5)",
                        technique: "tile3d",
                        color: "#00cccc",
                        opacity: 1
                    },
                    {
                        when: "Height >= 30 && Height < 50",
                        technique: "tile3d",
                        color: "#9966ff",
                        opacity: 1
                    },
                    {
                        when: "Height >= 40 && Height < 50",
                        technique: "tile3d",
                        color: "#ff9900",
                        opacity: 1
                    },
                    {
                        id: "selected",
                        when: "0!=0",
                        technique: "tile3d",
                        color: "#FFFF00",
                        opacity: 1
                    }
                ]
            }
        });
        log("✔ 复杂表达式：青=5–20或≥100 / 紫=30–50 / 橙=40–50(覆盖紫→后者优先)");
    });

    panel.addButton("20档色带", "#0d6efd", () => {
        const bands = Array.from({ length: 20 }, (_, i) => ({
            id: `band-${i}`,
            when: `Height >= ${i * 10} && Height < ${(i + 1) * 10}`,
            technique: "tile3d",
            color: BAND_COLORS[i],
            opacity: 1
        }));
        dataSource.setTheme({
            styles: {
                "3dtiles": [
                    ...bands,
                    {
                        id: "selected",
                        when: "0!=0",
                        technique: "tile3d",
                        color: "#FFFF00",
                        opacity: 1
                    }
                ]
            }
        });
        log("✔ 20 档 10m 色带已应用（样式纹理容量压力）");
    });

    let carousel = 0;
    let carouselTimer: any = null;
    panel.addButton("高亮轮播", "#fd7e14", () => {
        if (carouselTimer) {
            clearInterval(carouselTimer);
            carouselTimer = null;
            log("⏹ 高亮轮播已停止");
            return;
        }
        log("▶ 高亮轮播开始（batchId 0–9 每 500ms 切换；再点一次停止）");
        carouselTimer = setInterval(() => {
            const when = `batchId == ${carousel % 10}`;
            const updated = dataSource.updateStyleById("selected", { when });
            if (!updated) {
                dataSource.addStyle({
                    id: "selected",
                    when,
                    technique: "tile3d",
                    color: "#FFFF00",
                    opacity: 1
                } as any);
            }
            carousel++;
        }, 500);
    });

    log("ℹ 点击建筑要素：显示批表属性并高亮（selected 占位样式模式）");

    // ---- 点击拾取：属性表 + 单要素高亮 ----
    const propertiesTable = new PropertiesTable();
    const eventHandler = new WindowEventHandler(mapView.canvas);
    eventHandler.addEventListener("mouseclick", e => {
        const picks = dataSource
            .intersectMapObjects(e.layerX, e.layerY)
            .sort((a, b) => a.distance - b.distance);
        const pick = picks[0];
        const properties = pick ? dataSource.getBatchProperties(pick, "_batchid") : undefined;

        if (properties !== undefined) {
            propertiesTable.show(properties);
            const identifier =
                (properties as any).DOITT_ID !== undefined
                    ? `DOITT_ID == '${(properties as any).DOITT_ID}'`
                    : (properties as any).batchId !== undefined
                    ? `batchId == ${(properties as any).batchId}`
                    : undefined;
            if (identifier !== undefined) {
                const updated = dataSource.updateStyleById("selected", { when: identifier });
                if (!updated) {
                    dataSource.addStyle({
                        id: "selected",
                        when: identifier,
                        technique: "tile3d",
                        color: "#FFFF00",
                        opacity: 1
                    } as any);
                }
                log(`✔ 高亮要素 ${identifier}`);
            }
        } else {
            dataSource.updateStyleById("selected", { when: "0!=0" });
            propertiesTable.show(undefined as any);
            log("ℹ 未命中要素，高亮已清除");
        }
    });

    // ---- 初始场景：分级配色 ----
    dataSource.setTheme(createTieredTheme());
    log("✔ 初始分级配色已应用（动画渐变，观察 1s 过渡）");

    startFpsMonitor();
    log("ℹ 全部场景按钮在左侧面板，逐个点一遍即为全面样式测试");
} catch (error) {
    console.error("3D Tiles style lab initialization failed:", error);
}
