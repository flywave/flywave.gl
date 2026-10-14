/* Copyright (C) 2025 flywave.gl contributors */
import {
    ArcGISTileProvider,
    DemPatchLayer,
    DEMTerrainSource,
    ellipsoidProjection,
    GeoBox,
    GeoCoordinates,
    MapControls,
    MapControlsUI,
    MapView,
    TileKey,
    TileKeyUtils,
    webMercatorTerrainTilingScheme
} from "@flywave/flywave.gl";
import type { DemSourceDescription } from "@flywave/flywave.gl";

import { shouldForceWebGL } from "../common-webgl-debug";

// The observation target: exactly ONE web-mercator patch tile. Both patch
// layers declare minzoom = maxzoom = PATCH_LEVEL, so the best-available walk
// always resolves to this single tile and every bake below it samples it.
const PATCH_LEVEL = 12;
const PATCH_TILE_SIZE = 256;

// Camera sits inside the local DEM coverage (resources/dem_terrain).
const CENTER = new GeoCoordinates(36.4862, 118.1727, 0);

/**
 * mapbox terrain-rgb encoder (same convention as the heightmap-overlay demo)
 */
function encodeMapboxHeight(height: number): [number, number, number, number] {
    const v = Math.floor((height + 10000.0) / 0.1);
    const b = v % 256;
    const g = Math.floor(v / 256) % 256;
    const r = Math.floor(v / 65536);
    return [r, g, b, 255];
}

/**
 * A patch layer whose tiles are fabricated in memory — no network needed.
 * The description pins minzoom = maxzoom to the single observation tile, so
 * this layer contributes exactly one patch tile.
 */
class FabricatedPatchLayer extends DemPatchLayer {
    private readonly m_patchTileKey: TileKey;

    constructor(
        id: string,
        priority: number,
        patchTileKey: TileKey,
        enabled: boolean,
        private readonly m_render: (x: number, y: number) => [number, number, number, number]
    ) {
        const geoBox = webMercatorTerrainTilingScheme.getGeoBox(patchTileKey);
        const description: DemSourceDescription = {
            tiles: [],
            scheme: "xyz",
            bounds: [
                geoBox.southWest.longitude,
                geoBox.southWest.latitude,
                geoBox.northEast.longitude,
                geoBox.northEast.latitude
            ],
            minzoom: patchTileKey.level,
            maxzoom: patchTileKey.level,
            tileSize: PATCH_TILE_SIZE,
            type: "raster-dem"
        };
        super({ id, source: description, priority, encoding: "mapbox", enabled });
        this.m_patchTileKey = patchTileKey;
    }

    protected async fetchTileImage(tileKey: TileKey): Promise<ImageData | undefined> {
        if (
            tileKey.level !== this.m_patchTileKey.level ||
            tileKey.column !== this.m_patchTileKey.column ||
            tileKey.row !== this.m_patchTileKey.row
        ) {
            return undefined;
        }
        const image = new ImageData(PATCH_TILE_SIZE, PATCH_TILE_SIZE);
        for (let y = 0; y < PATCH_TILE_SIZE; y++) {
            for (let x = 0; x < PATCH_TILE_SIZE; x++) {
                const [r, g, b, a] = this.m_render(x, y);
                const idx = (y * PATCH_TILE_SIZE + x) * 4;
                image.data[idx] = r;
                image.data[idx + 1] = g;
                image.data[idx + 2] = b;
                image.data[idx + 3] = a;
            }
        }
        return image;
    }
}

/** Flat plateau — full coverage, one absolute height */
function renderPlateau(): (x: number, y: number) => [number, number, number, number] {
    const rgb = encodeMapboxHeight(900);
    return () => [rgb[0], rgb[1], rgb[2], 255];
}

/**
 * Crater — absolute heights only (pit floor + raised rim), coverage limited
 * to a disc so the alpha "no data" ring keeps the base terrain visible there
 */
function renderCrater(): (x: number, y: number) => [number, number, number, number] {
    const half = PATCH_TILE_SIZE / 2;
    return (x, y) => {
        const dx = x - half;
        const dy = y - half;
        const dist = Math.sqrt(dx * dx + dy * dy) / half; // 0..~1.4
        if (dist > 0.85) {
            return [0, 0, 0, 0]; // no coverage — base shows through
        }
        let height: number;
        if (dist < 0.35) {
            height = 300; // pit floor
        } else if (dist < 0.55) {
            const t = (dist - 0.35) / 0.2;
            height = 300 + t * (950 - 300); // inner wall up to the rim
        } else {
            const t = (dist - 0.55) / 0.3;
            height = 950 + t * (500 - 950); // outer slope down to 500 m
        }
        const rgb = encodeMapboxHeight(height);
        return [rgb[0], rgb[1], rgb[2], 255];
    };
}

// --------------------------- observation panel ---------------------------

const logLines: string[] = [];

function log(message: string): void {
    const time = new Date().toLocaleTimeString();
    logLines.push(`${time} ${message}`);
    if (logLines.length > 60) {
        logLines.shift();
    }
    const logElement = document.getElementById("patchLog");
    if (logElement) {
        logElement.textContent = logLines.join("\n");
        logElement.scrollTop = logElement.scrollHeight;
    }
    // eslint-disable-next-line no-console
    console.log(`[dem-patch] ${message}`);
}

function createControlPanel(): void {
    const panel = document.createElement("div");
    panel.style.cssText =
        "position:absolute;top:10px;left:10px;z-index:1000;background:rgba(255,255,255,0.95);" +
        "padding:12px;border-radius:6px;box-shadow:0 2px 8px rgba(0,0,0,0.3);" +
        "font-family:Arial,sans-serif;width:330px;";
    panel.innerHTML = `
        <h3 style="margin:0 0 6px 0;font-size:14px;">DEM 修正层 · 单瓦片观察</h3>
        <div style="font-size:11px;color:#555;margin-bottom:8px;">
            底图渐进加载时修正数据已烘焙进瓦片像素;以下操作观察"旧画面持续 → 新画面整帧切换"(全程不塌平)。
        </div>
        <div id="patchButtons" style="display:flex;flex-wrap:wrap;gap:6px;margin-bottom:8px;"></div>
        <div id="patchProbe" style="font-size:12px;font-family:monospace;background:#f4f4f4;padding:6px;border-radius:4px;"></div>
        <div id="patchLog" style="font-size:11px;font-family:monospace;background:#222;color:#9f9;padding:6px;border-radius:4px;margin-top:8px;height:150px;overflow-y:auto;white-space:pre-wrap;"></div>
    `;
    document.body.appendChild(panel);
}

function addButton(text: string, onClick: () => void): HTMLButtonElement {
    const button = document.createElement("button");
    button.textContent = text;
    button.style.cssText = "font-size:12px;padding:4px 8px;cursor:pointer;";
    button.onclick = () => onClick();
    document.getElementById("patchButtons")?.appendChild(button);
    return button;
}

// ------------------------------- main -------------------------------------

const getMapCanvas = (): HTMLCanvasElement => {
    const canvas = document.getElementById("mapCanvas") as HTMLCanvasElement;
    if (!canvas) {
        throw new Error("Map canvas element not found (need <canvas id='mapCanvas'>)");
    }
    return canvas;
};

(async () => {
    try {
        createControlPanel();

        const canvas = getMapCanvas();
        const mapView = new MapView({
            forceWebGL: shouldForceWebGL(),
            projection: ellipsoidProjection,
            target: CENTER,
            zoomLevel: 15,
            tilt: 62,
            heading: 0,
            canvas,
            theme: {
                extends: "resources/tilezen_base_globe.json",
                atmosphere: { enabled: true }
            }
        });

        const controls = new MapControls(mapView);
        const ui = new MapControlsUI(controls, { zoomLevel: "input" });
        canvas.parentElement!.appendChild(ui.domElement);

        // The single observation tile: the web-mercator tile at PATCH_LEVEL
        // that contains the camera target.
        const patchTileKey = TileKeyUtils.geoCoordinatesToTileKey(
            webMercatorTerrainTilingScheme,
            CENTER,
            PATCH_LEVEL
        );
        const patchGeoBox = webMercatorTerrainTilingScheme.getGeoBox(patchTileKey);
        log(
            `观察瓦片 z${patchTileKey.level}/${patchTileKey.column}/${patchTileKey.row} ` +
                `[${patchGeoBox.southWest.longitude.toFixed(4)}, ` +
                `${patchGeoBox.southWest.latitude.toFixed(4)} ~ ` +
                `${patchGeoBox.northEast.longitude.toFixed(4)}, ` +
                `${patchGeoBox.northEast.latitude.toFixed(4)}]`
        );

        const demTerrain = new DEMTerrainSource({
            source: "dem_terrain/source.json",
            encoding: "mapbox"
        });

        // Register BOTH patch layers before the source connects: the initial
        // progressive load (coarse → fine resources) bakes the enabled patch
        // on every level — this is the loading process to watch.
        const manager = demTerrain.getDemPatchManager();
        manager.addLayer(
            new FabricatedPatchLayer("plateau", 1, patchTileKey, true, renderPlateau())
        );
        const crater = new FabricatedPatchLayer("crater", 5, patchTileKey, false, renderCrater());
        manager.addLayer(crater);
        manager.addEventListener("change", event => {
            log(
                `patch change: ${event.changeType} [${event.affectedIds.join(",")}] ` +
                    `version → ${manager.version}`
            );
        });

        mapView.setElevationSource(demTerrain);
        demTerrain.addWebTileDataSource(
            new ArcGISTileProvider({ minDataLevel: 0, maxDataLevel: 18 })
        );

        addButton("启用陨石坑（优先级 5）", () => {
            manager.updatePatch("crater", { enabled: true });
        });
        addButton("停用陨石坑", () => {
            manager.updatePatch("crater", { enabled: false });
        });
        addButton("互换优先级", () => {
            const states = manager.getAllPatches();
            const plateau = states.find(state => state.id === "plateau");
            const craterState = states.find(state => state.id === "crater");
            if (plateau && craterState) {
                manager.updatePatch("plateau", { priority: craterState.priority });
                manager.updatePatch("crater", { priority: plateau.priority });
            }
        });
        addButton("清空全部修正层", () => {
            manager.clear();
        });

        // Wireframe toggle for seam diagnosis: flips `wireframe` on every
        // visible terrain layer mesh. Tile objects are rebuilt on cache
        // clears, so the flag is re-applied on an interval (cheap traverse).
        let wireframeOn = false;
        const applyWireframe = (): void => {
            mapView.scene.traverse(obj => {
                const mesh = obj as {
                    isTerrainLayerMesh?: boolean;
                    material?: { wireframe: boolean };
                };
                if (mesh.isTerrainLayerMesh && mesh.material) {
                    mesh.material.wireframe = wireframeOn;
                }
            });
        };
        const wireframeButton = addButton("网格显示: 关", () => {
            wireframeOn = !wireframeOn;
            applyWireframe();
            wireframeButton.textContent = `网格显示: ${wireframeOn ? "开" : "关"}`;
            log(`网格显示 ${wireframeOn ? "开" : "关"}(观察裂缝是否落在瓦片边界/T 型接缝点)`);
        });
        window.setInterval(applyWireframe, 300);

        // Elevation probe: the CPU query path reads the SAME baked pixels the
        // GPU displaces with — when the probe value changes, the surface has
        // swapped. Watch it converge while resources stream in.
        const probeElement = document.getElementById("patchProbe");
        const elevationProvider = demTerrain.getElevationProvider();
        let lastAltitude = Number.NaN;
        window.setInterval(() => {
            const altitude = elevationProvider?.getHeight(CENTER) ?? Number.NaN;
            if (Number.isFinite(altitude) && Math.abs(altitude - lastAltitude) > 0.5) {
                log(`中心点高程查询: ${altitude.toFixed(1)} m`);
                lastAltitude = altitude;
            }
            if (probeElement) {
                probeElement.textContent =
                    `中心点高程: ${Number.isFinite(altitude) ? altitude.toFixed(1) : "-"} m   ` +
                    `修正层: ${manager.getPatchCount()}   版本: ${manager.version}` +
                    `   网格: ${wireframeOn ? "开" : "关"}`;
            }
        }, 400);

        mapView.beginAnimation();

        log("就绪:观察台地(900m)如何随底图逐级加载出现;随后用按钮切换陨石坑/优先级");
    } catch (error) {
        console.error("Error initializing dem-patch-overlay example:", error);
    }
})();
