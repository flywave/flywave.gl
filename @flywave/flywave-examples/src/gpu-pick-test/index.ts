import {
    MapView,
    GeoCoordinates,
    ellipsoidProjection,
    MapControls,
    CesiumIonDataSource,
    MapControlsUI,
    WindowEventHandler
} from "@flywave/flywave.gl";
import { CESIUM_ION_TOKEN } from "../token-config";

/**
 * GPU pick test — uses the Cesium Ion 3dtiles dataset to verify the
 * GPU-first `intersectMapObjects` path (depth + meshId, O(1) per query).
 *
 * Click anywhere on the buildings:
 *   - GPU hit → shows world point, distance, and timing
 *   - GPU miss → falls back to CPU raycast automatically
 */
class GpuPickTest {
    private mapView!: MapView;
    private dataSource!: CesiumIonDataSource;
    private infoDiv!: HTMLDivElement;

    // hover 性能统计
    private stats = {
        moves: 0,
        pickTimes: [] as number[],
        detailCount: 0,
        restyleCount: 0,
        lastPropsMs: 0,
        lastBuildingId: "",
        lastDetailAt: 0,
        fps: 0,
        fpsFrames: 0,
        fpsLast: performance.now()
    };

    start(): void {
        const canvas = document.getElementById("mapCanvas") as HTMLCanvasElement;
        if (!canvas) throw new Error("Canvas not found");

        this.mapView = new MapView({
            projection: ellipsoidProjection,
            target: new GeoCoordinates(40.714, -74.0165), // Manhattan
            zoomLevel: 16,
            tilt: 65,
            heading: 20,
            canvas: canvas,
            enableGpuPicking: true,
            theme: {
                atmosphere: { enabled: true, sunTime: new Date(new Date().setHours(22, 0)).getTime() },
                postEffects: { antialiasing: "taa" },
                toneMappingExposure: 1.5,
                styles: {
                    "3dtiles": [
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
            }
        });
        (globalThis as any).mapView = this.mapView;   // debug handle
        (globalThis as any).gpuDs = this.dataSource;  // debug handle

        const controls = new MapControls(this.mapView);
        const ui = new MapControlsUI(controls);
        canvas.parentElement!.appendChild(ui.domElement);

        this.infoDiv = document.createElement("div");
        this.infoDiv.style.cssText =
            "position:absolute;top:10px;left:10px;z-index:9999;background:rgba(0,0,0,.85);" +
            "color:#0f0;font:13px/1.6 monospace;padding:12px 16px;border-radius:6px;" +
            "max-width:560px;white-space:pre;pointer-events:none;";
        document.body.appendChild(this.infoDiv);

        // FPS 计数
        const tick = (): void => {
            this.stats.fpsFrames++;
            const now = performance.now();
            if (now - this.stats.fpsLast >= 1000) {
                this.stats.fps = this.stats.fpsFrames;
                this.stats.fpsFrames = 0;
                this.stats.fpsLast = now;
            }
            requestAnimationFrame(tick);
        };
        requestAnimationFrame(tick);

        this.addDataSource();
        this.setupClickHandler();
    }

    private addDataSource(): void {
        this.dataSource = new CesiumIonDataSource({
            styleSetName: "3dtiles",
            enablePicking: true,
            accessToken: CESIUM_ION_TOKEN,
            assetId: 75343,
            castShadow: true,
            receiveShadow: true
        });
        this.mapView.addDataSource(this.dataSource);
    }

    private setupClickHandler(): void {
        const handler = new WindowEventHandler(this.mapView.canvas);

        handler.addEventListener("mouseclick", e => {
            const layerX = (e as any).layerX as number;
            const layerY = (e as any).layerY as number;

            // ── GPU path (default: useGpuPick = auto) ──
            const t0 = performance.now();
            const gpuResults = this.mapView.intersectMapObjects(layerX, layerY, {
                useGpuPick: true
            });
            const gpuMs = (performance.now() - t0).toFixed(3);

            // ── batch properties via the GPU result's LAZY intersection ──
            // Reading `.intersection` triggers the deferred single-object
            // raycast; getBatchProperties then derives the tile from the
            // hit object (userData.tile walk) and queries the batch table.
            let gpuProps: Record<string, any> | undefined;
            const tBatch = performance.now();
            if (gpuResults.length > 0) {
                const isect = gpuResults[0].intersection;
                if (isect !== undefined) {
                    gpuProps = this.dataSource.getBatchProperties(isect, "_batchid");
                }
            }
            const gpuBatchMs = (performance.now() - tBatch).toFixed(3);

            // ── CPU path (for comparison) ──
            const t1 = performance.now();
            const cpuResults = this.mapView.intersectMapObjects(layerX, layerY, {
                useGpuPick: false
            });
            const cpuMs = (performance.now() - t1).toFixed(3);

            let cpuProps: Record<string, any> | undefined;
            if (cpuResults.length > 0 && cpuResults[0].intersection !== undefined) {
                cpuProps = this.dataSource.getBatchProperties(cpuResults[0].intersection, "_batchid");
            }

            this.showResults(
                gpuResults,
                gpuMs,
                gpuProps,
                gpuBatchMs,
                cpuResults,
                cpuMs,
                cpuProps,
                layerX,
                layerY
            );
        });

        // ── Hover 高亮 + 性能压测 ──
        // 每次 mousemove：纯 O(1) GPU 拾取（不读任何惰性字段）。
        // 惰性射线 + batch 查询被 50ms 节流 + 建筑变化去重压制，
        // 触发次数应远小于 mousemove 次数 —— HUD 里直接对比。
        handler.addEventListener("mousemove", e => {
            const x = (e as any).layerX as number;
            const y = (e as any).layerY as number;
            this.stats.moves++;

            const t0 = performance.now();
            const results = this.mapView.intersectMapObjects(x, y);
            const ms = performance.now() - t0;
            this.stats.pickTimes.push(ms);
            if (this.stats.pickTimes.length > 120) this.stats.pickTimes.shift();

            const now = performance.now();
            if (results.length > 0 && now - this.stats.lastDetailAt > 50) {
                this.stats.lastDetailAt = now;
                this.stats.detailCount++;
                const td = performance.now();
                const isect = results[0].intersection; // ← 惰性触发点（唯一次射线）
                const props =
                    isect !== undefined
                        ? this.dataSource.getBatchProperties(isect, "_batchid")
                        : undefined;
                this.stats.lastPropsMs = performance.now() - td;

                const id =
                    props !== undefined
                        ? String(props.DOITT_ID ?? props.NAME ?? "")
                        : "";
                if (id !== "" && id !== this.stats.lastBuildingId) {
                    this.stats.lastBuildingId = id;
                    this.stats.restyleCount++;
                    this.dataSource.updateStyleById("selected", {
                        when: `DOITT_ID == '${id}'`
                    });
                } else if (id === "" && this.stats.lastBuildingId !== "") {
                    this.stats.lastBuildingId = "";
                    this.dataSource.updateStyleById("selected", { when: "0!=0" });
                }
            }

            this.updateHoverHud(x, y, results.length > 0);
        });
    }

    private updateHoverHud(x: number, y: number, hit: boolean): void {
        const times = this.stats.pickTimes;
        const avg = times.length > 0 ? times.reduce((a, b) => a + b, 0) / times.length : 0;
        const max = times.length > 0 ? Math.max(...times) : 0;
        this.infoDiv.textContent =
            `hover (${x},${y})  ${hit ? "HIT" : "miss"}\n` +
            `FPS: ${this.stats.fps}\n` +
            `mousemoves: ${this.stats.moves}\n` +
            `GPU pick avg: ${avg.toFixed(3)}ms  max: ${max.toFixed(3)}ms\n` +
            `detail raycasts: ${this.stats.detailCount} (last: ${this.stats.lastPropsMs.toFixed(2)}ms)\n` +
            `restyles: ${this.stats.restyleCount}  building: ${this.stats.lastBuildingId || "-"}`;
    }

    private showResults(
        gpuResults: any[],
        gpuMs: string,
        gpuProps: Record<string, any> | undefined,
        gpuBatchMs: string,
        cpuResults: any[],
        cpuMs: string,
        cpuProps: Record<string, any> | undefined,
        x: number,
        y: number
    ): void {
        const fmtProps = (props: Record<string, any> | undefined): string => {
            if (props === undefined) return "undefined";
            const keys = Object.keys(props);
            if (keys.length === 0) return "{} (empty)";
            return keys
                .slice(0, 3)
                .map(k => `${k}: ${props[k]}`)
                .join(", ");
        };

        const fmt = (results: any[], ms: string, label: string) => {
            if (results.length === 0) return `${label}: miss (${ms}ms)`;
            const r = results[0];
            const p = r.point;
            return (
                `${label}: HIT (${ms}ms)\n` +
                `  type: ${r.type}\n` +
                `  dist: ${r.distance.toFixed(1)}m\n` +
                `  pos: (${p.x.toFixed(1)}, ${p.y.toFixed(1)}, ${p.z.toFixed(1)})\n` +
                `  src: ${r.dataSourceName ?? "n/a"}`
            );
        };

        this.infoDiv.textContent =
            `click (${x},${y})\n\n` +
            fmt(gpuResults, gpuMs, "GPU ") +
            `\n  batch[${gpuBatchMs}ms]: ${fmtProps(gpuProps)}` +
            "\n\n" +
            fmt(cpuResults, cpuMs, "CPU ") +
            `\n  batch: ${fmtProps(cpuProps)}`;
    }
}

window.onload = () => {
    new GpuPickTest().start();
};
