/* Copyright (C) 2025 flywave.gl contributors */

/**
 * HUD, GUI-facing state and the shadows ON/OFF A/B benchmark of the shadow
 * stress test. Frame timing comes from `MapViewEventNames.Render`; when
 * requestAnimationFrame is throttled (occluded/background tab) the benchmark
 * falls back to driving `MapView.renderSync()` itself.
 */

import { type ILogger, type MapView, LoggerManager, MapViewEventNames } from "@flywave/flywave.gl";

import { applyPanelStyle } from "../common";
import {
    type StressField,
    DEFAULT_BUILDINGS,
    DEFAULT_TREES,
    MAX_BUILDINGS,
    MAX_TREES,
    sleep
} from "./shadow-stress-field";

const logger: ILogger = LoggerManager.instance.create("flywave-examples/fx-shadow-stress/lab");

/** A/B benchmark sampling window per leg. */
const BENCHMARK_DURATION_MS = 6000;

/** One leg of the A/B benchmark. */
interface IBenchmarkRun {
    shadowCasting: boolean;
    settled: boolean;
    frames: number;
    fps: number;
    frameMsAvg: number;
    frameMsP95: number;
    drawCalls: number;
    triangles: number;
}

/** Frame data captured during one benchmark leg. */
interface ISampleSink {
    stamps: number[];
    calls: number[];
    triangles: number[];
}
/**
 * Owns the HUD, the on-screen controls and the A/B benchmark. Frame timing
 * comes from `MapViewEventNames.Render`; `beginAnimation()` keeps the
 * on-demand render loop running so every sample frame is a full render.
 */
export class ShadowLab {
    /** Whether the A/B benchmark is currently sampling. */
    get isBenchmarkRunning(): boolean {
        return this.m_benchmarkRunning;
    }

    private readonly m_hud = document.createElement("div");
    private readonly m_benchmarkPanel = document.createElement("pre");
    private readonly m_frameStamps: number[] = [];
    private m_activeSample?: ISampleSink;
    private m_benchmarkRunning = false;
    private m_lastRuns: IBenchmarkRun[] = [];
    private m_lastFrameTime = 0;
    private m_manualFrameTimer: number | undefined;
    private m_watchdogTimer: number | undefined;
    private readonly m_countRefreshers: Array<() => void> = [];
    // Camera orbit used while measuring: a moving camera exercises culling,
    // tile updates and per-frame CSM fitting, so the numbers reflect real use
    // instead of a frozen scene.
    private m_orbitEnabled = false;
    private m_orbitSpeedDeg = 12;
    private m_orbitHeading = 0;
    private m_orbitStartHeading = 0;
    private m_orbitLastTick = 0;
    private m_orbitRaf: number | undefined;

    readonly state = {
        buildings: DEFAULT_BUILDINGS,
        trees: DEFAULT_TREES,
        shadows: true
    };

    constructor(private readonly m_mapView: MapView, private readonly m_field: StressField) {
        this.createHud();
        this.m_mapView.addEventListener(MapViewEventNames.Render, () => {
            this.onFrame();
        });
        window.setInterval(() => {
            this.updateHud();
        }, 250);
    }

    /** Turn shadow casting on or off (clears the tile cache, as the engine requires). */
    setShadows(enabled: boolean): void {
        this.state.shadows = enabled;
        if (this.m_mapView.shadowsEnabled !== enabled) {
            this.m_mapView.shadowsEnabled = enabled;
        }
        this.m_mapView.update();
    }

    /** Rebuild the stress load and remember the (clamped) counts for the HUD. */
    rebuild(buildings: number, trees: number): void {
        this.state.buildings = Math.min(buildings, MAX_BUILDINGS);
        this.state.trees = Math.min(trees, MAX_TREES);
        this.m_field.build(this.state.buildings, this.state.trees);
        // Programmatic rebuilds (window handle, URL flags) must not leave the
        // dat.GUI dropdowns showing stale values; updateDisplay re-reads
        // `state` without firing onChange (no rebuild loop).
        this.m_countRefreshers.forEach(refresh => {
            refresh();
        });
    }

    /** GUI hook: called after a programmatic rebuild to refresh controller displays. */
    registerCountRefresh(refresh: () => void): void {
        this.m_countRefreshers.push(refresh);
    }

    /** Start the continuous render loop used by the measurements. */
    start(): void {
        this.m_mapView.beginAnimation();
    }

    get orbitEnabled(): boolean {
        return this.m_orbitEnabled;
    }

    get orbitSpeedDeg(): number {
        return this.m_orbitSpeedDeg;
    }

    setOrbitSpeed(speedDeg: number): void {
        this.m_orbitSpeedDeg = Math.min(60, Math.max(1, speedDeg));
    }

    /**
     * Orbit the camera around the current target. Each heading change goes
     * through `MapView.heading`, which keeps distance/tilt/target and requests a
     * frame, so the orbit also drives the on-demand render loop.
     */
    setOrbit(enabled: boolean): void {
        if (enabled === this.m_orbitEnabled) return;
        this.m_orbitEnabled = enabled;
        if (enabled) {
            this.m_orbitStartHeading = this.m_mapView.heading;
            this.m_orbitHeading = this.m_orbitStartHeading;
            this.m_orbitLastTick = performance.now();
            this.m_orbitRaf = requestAnimationFrame(this.orbitTick);
        } else if (this.m_orbitRaf !== undefined) {
            cancelAnimationFrame(this.m_orbitRaf);
            this.m_orbitRaf = undefined;
        }
    }

    /** Snap the orbit back to the heading it started from (fair A/B legs). */
    resetOrbit(): void {
        this.m_orbitHeading = this.m_orbitStartHeading;
        this.m_orbitLastTick = performance.now();
        if (this.m_orbitEnabled) {
            this.m_mapView.heading = this.m_orbitHeading;
        }
    }

    /** Advance the orbit by `dtSec` and apply it (manual frame drivers). */
    stepOrbit(dtSec: number): void {
        if (!this.m_orbitEnabled) return;
        this.m_orbitHeading = (this.m_orbitHeading + this.m_orbitSpeedDeg * dtSec) % 360;
        this.m_mapView.heading = this.m_orbitHeading;
    }

    private readonly orbitTick = (): void => {
        if (!this.m_orbitEnabled) {
            this.m_orbitRaf = undefined;
            return;
        }
        const now = performance.now();
        const dt = Math.min((now - this.m_orbitLastTick) / 1000, 0.1);
        this.m_orbitLastTick = now;
        this.stepOrbit(dt);
        this.m_orbitRaf = requestAnimationFrame(this.orbitTick);
    };

    /**
     * requestAnimationFrame is throttled when the browser window is occluded
     * (remote sessions, automation, a background monitor), which would make the
     * benchmark read 0 fps. While a benchmark runs, watch the Render cadence and
     * fall back to driving frames through `MapView.renderSync()` (the same entry
     * point `synchronousRendering` uses) when rAF stalls.
     */
    private startFrameWatchdog(): void {
        this.stopFrameWatchdog();
        this.m_watchdogTimer = window.setInterval(() => {
            if (this.m_manualFrameTimer !== undefined) {
                return;
            }
            if (performance.now() - this.m_lastFrameTime > 500) {
                logger.info("rAF stalled; driving renderSync() manually for the benchmark");
                this.startManualDrive();
            }
        }, 250);
    }

    private stopFrameWatchdog(): void {
        if (this.m_watchdogTimer !== undefined) {
            window.clearInterval(this.m_watchdogTimer);
            this.m_watchdogTimer = undefined;
        }
    }

    private startManualDrive(): void {
        if (this.m_manualFrameTimer !== undefined) {
            return;
        }
        const step = (): void => {
            this.m_manualFrameTimer = undefined;
            try {
                this.stepOrbit(1 / 60);
                this.m_mapView.renderSync(performance.now());
            } catch (error) {
                logger.error(
                    "manual renderSync failed:",
                    error instanceof Error ? error.message : String(error)
                );
                return;
            }
            this.m_manualFrameTimer = window.setTimeout(step, 0);
        };
        step();
    }

    private stopManualDrive(): void {
        if (this.m_manualFrameTimer !== undefined) {
            window.clearTimeout(this.m_manualFrameTimer);
            this.m_manualFrameTimer = undefined;
        }
    }

    /**
     * Shadows ON vs OFF on the same camera and load: settle the tile pipeline
     * after each toggle, sample `durationMs`, then restore shadows ON.
     */
    async runBenchmark(durationMs = BENCHMARK_DURATION_MS): Promise<IBenchmarkRun[] | undefined> {
        if (this.m_benchmarkRunning) {
            return undefined;
        }
        this.m_benchmarkRunning = true;
        this.m_lastRuns = [];
        const runs: IBenchmarkRun[] = [];
        const restoreOrbit = this.m_orbitEnabled;
        // A moving camera keeps culling, tile updates and CSM fitting busy, so
        // the A/B numbers reflect real use instead of a frozen scene.
        this.setOrbit(true);
        this.startFrameWatchdog();
        try {
            for (const shadowCasting of [true, false]) {
                this.setShadows(shadowCasting);
                this.setBenchmarkStatus(
                    `settling tiles — shadows ${shadowCasting ? "ON" : "OFF"}…`
                );
                this.resetOrbit();
                const settled = await this.settle();
                this.setBenchmarkStatus(
                    `sampling ${durationMs / 1000}s — shadows ${shadowCasting ? "ON" : "OFF"}…`
                );
                this.resetOrbit();
                const run = await this.sample(shadowCasting, durationMs, settled);
                runs.push(run);
                logger.info(
                    `A/B shadows ${shadowCasting ? "ON" : "OFF"}: ` +
                        `${run.fps.toFixed(1)} fps, p95 ${run.frameMsP95.toFixed(1)} ms, ` +
                        `${Math.round(run.drawCalls)} draw calls`
                );
            }
        } finally {
            this.setShadows(true);
            this.m_benchmarkRunning = false;
            this.stopFrameWatchdog();
            this.stopManualDrive();
            this.setOrbit(restoreOrbit);
        }
        this.m_lastRuns = runs;
        this.setBenchmarkStatus(this.formatRuns(runs));
        return runs;
    }

    /**
     * `MapViewUtils.mapViewIsLoading` also waits for text/POI subsystems and
     * `allVisibleTilesLoaded`, which can stay "loading" forever on a globe with
     * far-horizon tiles. For A/B timing we only care about tile data + geometry
     * arriving, so check those counters directly.
     */
    hasPendingTiles(): boolean {
        const lists = this.m_mapView.visibleTileSet?.dataSourceTileList ?? [];
        for (const list of lists) {
            if (list.numTilesLoading > 0) {
                return true;
            }
            for (const tile of list.visibleTiles) {
                if (!tile.allGeometryLoaded) {
                    return true;
                }
            }
        }
        return false;
    }

    /** Wait until visible tiles and geometry are loaded, with a quiet window. */
    private async settle(timeoutMs = 30000): Promise<boolean> {
        const start = performance.now();
        let quietSince = 0;
        while (performance.now() - start < timeoutMs) {
            await sleep(200);
            if (this.hasPendingTiles()) {
                quietSince = 0;
                continue;
            }
            if (quietSince === 0) {
                quietSince = performance.now();
            }
            if (performance.now() - quietSince > 800) {
                return true;
            }
        }
        return false;
    }

    /** Collect render timestamps and renderer counters for one leg. */
    private async sample(
        shadowCasting: boolean,
        durationMs: number,
        settled: boolean
    ): Promise<IBenchmarkRun> {
        const sink: ISampleSink = { stamps: [], calls: [], triangles: [] };
        this.m_activeSample = sink;
        await sleep(durationMs);
        this.m_activeSample = undefined;
        return this.summarize(shadowCasting, settled, sink);
    }

    private summarize(shadowCasting: boolean, settled: boolean, sink: ISampleSink): IBenchmarkRun {
        const stamps = sink.stamps;
        const intervals: number[] = [];
        for (let index = 1; index < stamps.length; index++) {
            intervals.push(stamps[index] - stamps[index - 1]);
        }
        intervals.sort((a, b) => a - b);
        const frameMsAvg =
            intervals.length > 0
                ? intervals.reduce((sum, value) => sum + value, 0) / intervals.length
                : 0;
        const frameMsP95 =
            intervals.length > 0 ? intervals[Math.floor(intervals.length * 0.95)] : 0;
        const average = (values: number[]): number =>
            values.length > 0 ? values.reduce((sum, value) => sum + value, 0) / values.length : 0;
        return {
            shadowCasting,
            settled,
            frames: sink.stamps.length,
            fps: frameMsAvg > 0 ? 1000 / frameMsAvg : 0,
            frameMsAvg,
            frameMsP95,
            drawCalls: average(sink.calls),
            triangles: average(sink.triangles)
        };
    }

    private formatRuns(runs: IBenchmarkRun[]): string {
        const lines = ["A/B shadows (same camera + load):"];
        for (const run of runs) {
            const flags = run.shadowCasting ? "ON " : "OFF";
            lines.push(
                `shadows ${flags}  ${run.fps.toFixed(1).padStart(5)} fps  ` +
                    `p95 ${run.frameMsP95.toFixed(1).padStart(5)} ms  ` +
                    `${Math.round(run.drawCalls).toString().padStart(5)} calls  ` +
                    `${(run.triangles / 1e6).toFixed(2)} M tris` +
                    (run.settled ? "" : "  (tiles not settled)") +
                    (run.frames < 5 ? "  (no frames — is the tab visible?)" : "")
            );
        }
        return lines.join("\n");
    }

    private onFrame(): void {
        const now = performance.now();
        this.m_lastFrameTime = now;
        this.m_frameStamps.push(now);
        while (this.m_frameStamps.length > 0 && now - this.m_frameStamps[0] > 2000) {
            this.m_frameStamps.shift();
        }
        if (this.m_activeSample !== undefined) {
            this.m_activeSample.stamps.push(now);
            // `drawCalls`/`triangles` are per-frame (info.reset() in MapView.render);
            // `render.calls` is cumulative since app start and must not be used here.
            const info = this.m_mapView.renderer.info.render;
            this.m_activeSample.calls.push(info.drawCalls ?? 0);
            this.m_activeSample.triangles.push(info.triangles ?? 0);
        }
    }

    private updateHud(): void {
        const stamps = this.m_frameStamps;
        const intervals: number[] = [];
        for (let index = 1; index < stamps.length; index++) {
            intervals.push(stamps[index] - stamps[index - 1]);
        }
        intervals.sort((a, b) => a - b);
        const frameMsAvg =
            intervals.length > 0
                ? intervals.reduce((sum, value) => sum + value, 0) / intervals.length
                : 0;
        const frameMsP95 =
            intervals.length > 0 ? intervals[Math.floor(intervals.length * 0.95)] : 0;
        const fps = frameMsAvg > 0 ? 1000 / frameMsAvg : 0;

        const info = this.m_mapView.renderer.info;
        const calls = info.render.drawCalls ?? 0;
        const triangles = info.render.triangles ?? 0;
        const loading = this.hasPendingTiles() ? "yes" : "no";
        const driving = this.m_manualFrameTimer !== undefined ? "manual" : "rAF";

        const lines = [
            "SHADOW STRESS TEST — global DEM + Esri imagery",
            `FPS        ${fps.toFixed(1).padStart(6)}   frame ${frameMsAvg.toFixed(1)} ms` +
                ` / p95 ${frameMsP95.toFixed(1)} ms`,
            `draw calls ${calls.toString().padStart(6)}   tris ${(triangles / 1e6).toFixed(2)} M`,
            `loading    ${loading.padStart(6)}   shadows ${this.state.shadows ? "ON " : "OFF"}` +
                `   ${driving}`,
            `buildings  ${this.state.buildings.toString().padStart(6)}   trees ${this.state.trees}`
        ];
        this.m_hud.textContent = lines.join("\n");
    }

    private createHud(): void {
        Object.assign(this.m_hud.style, {
            position: "absolute",
            left: "12px",
            top: "12px",
            padding: "10px 12px",
            color: "#e6edf3",
            font: "12px/1.55 ui-monospace, SFMono-Regular, Menlo, Consolas, monospace",
            whiteSpace: "pre",
            pointerEvents: "none"
        } as CSSStyleDeclaration);
        applyPanelStyle(this.m_hud);
        document.body.appendChild(this.m_hud);

        Object.assign(this.m_benchmarkPanel.style, {
            position: "absolute",
            left: "12px",
            bottom: "12px",
            margin: "0",
            padding: "10px 12px",
            color: "#e6edf3",
            font: "12px/1.55 ui-monospace, SFMono-Regular, Menlo, Consolas, monospace",
            whiteSpace: "pre",
            pointerEvents: "none"
        } as CSSStyleDeclaration);
        applyPanelStyle(this.m_benchmarkPanel);
        this.m_benchmarkPanel.textContent = "A/B benchmark: press “run A/B benchmark (6s each)”";
        document.body.appendChild(this.m_benchmarkPanel);
    }

    private setBenchmarkStatus(text: string): void {
        this.m_benchmarkPanel.textContent = text;
    }

    /** Expose the most recent A/B runs (used by the auto-benchmark URL flag). */
    get lastRuns(): IBenchmarkRun[] {
        return this.m_lastRuns;
    }
}
