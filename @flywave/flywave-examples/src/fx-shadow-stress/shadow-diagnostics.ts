/* Copyright (C) 2025 flywave.gl contributors */

/**
 * Scientific shadow diagnostics for the stress demo.
 *
 * Aggregate FPS hides where the time goes, so this module isolates it while
 * the camera orbits the target (a frozen scene under-exercises culling, tile
 * updates and per-frame CSM fitting):
 * 1. A caster-count sweep (0 → 800 separate glTF clones) measures the marginal
 *    frame cost of one independent shadow caster; a second sweep with the same
 *    trees batched into one `InstancedMesh` shows the batching ceiling.
 * 2. A shadows-OFF baseline plus the 60 fps frame budget produce the actionable
 *    number: how many separate casters still fit, or how much per-element time
 *    must be saved.
 *
 * Every point samples a wall-clock window of `MapViewEventNames.Render` events.
 * `renderer.info` is written asynchronously after a frame (`renderSync()` can
 * return before the passes are counted), so counters are read after a settle
 * delay. When rAF is throttled the sampler drives frames through `renderSync()`.
 */

import { type ILogger, type MapView, LoggerManager, MapViewEventNames } from "@flywave/flywave.gl";
import * as THREE from "three/webgpu";

import { applyPanelStyle } from "../common";
import type { ShadowLab } from "./shadow-lab";
import { type StressField, sleep } from "./shadow-stress-field";

const logger: ILogger = LoggerManager.instance.create("flywave-examples/fx-shadow-stress/diag");

const TARGET_FPS = 60;
const SAMPLE_WINDOW_MS = 1500;
const TREE_COUNTS = [0, 100, 200, 400, 800];

/** One measured point. */
interface IMeasurement {
    /** Median rendered-frame interval, ms (rAF, or the manual drive cadence). */
    frameMs: number;
    /** `1000 / frameMs`. */
    fps: number;
    drawCalls: number;
    triangles: number;
    frames: number;
    /** True when rAF was throttled and frames were driven by `renderSync()`. */
    manual: boolean;
}

/** A sweep point tagged with its caster mode/count. */
interface ISweepPoint extends IMeasurement {
    mode: "clones" | "instanced";
    trees: number;
}

export interface IShadowDiagnosticsReport {
    buildings: number;
    clones: ISweepPoint[];
    instanced: ISweepPoint[];
    baselineOff: IMeasurement | null;
    /** Marginal frame cost of one separate caster near saturation, µs. */
    perCloneUs: number;
    /** Marginal frame cost of one shadow draw call near saturation, µs. */
    perDrawUs: number;
    /** Marginal frame cost of one instanced caster, µs. */
    perInstancedUs: number;
    /** Extra frame time of the current shadow setup at max clones, ms. */
    shadowExtraMs: number;
    budget: {
        targetFps: number;
        frameBudgetMs: number;
        /** Shadows-OFF baseline frame time, ms. */
        baselineMs: number;
        /** Frame time left for shadows, ms (may be ≤ 0). */
        shadowBudgetMs: number;
        /** Largest swept clone count that still stays inside the budget. */
        maxClonesForTarget: number;
    };
    notes: string[];
}

function median(values: number[]): number {
    if (values.length === 0) return 0;
    const sorted = [...values].sort((a, b) => a - b);
    return sorted[Math.floor(sorted.length / 2)];
}

/**
 * Runs the sweeps and renders the report into a panel. Exposed through the
 * demo's diagnostics handle; also bound to a GUI button.
 */
export class ShadowDiagnostics {
    private readonly m_panel = document.createElement("pre");
    private m_lastReport?: IShadowDiagnosticsReport;
    private m_running = false;
    private m_driveTimer: number | undefined;
    private m_frameStamps: number[] = [];
    private readonly m_onFrame = (): void => {
        this.m_frameStamps.push(performance.now());
    };

    constructor(
        private readonly m_mapView: MapView,
        private readonly m_field: StressField,
        private readonly m_lab: ShadowLab
    ) {
        this.createPanel();
    }

    get lastReport(): IShadowDiagnosticsReport | undefined {
        return this.m_lastReport;
    }

    get isRunning(): boolean {
        return this.m_running;
    }

    /** Run the full diagnostics suite (≈20–30 s) and print the report. */
    async run(): Promise<IShadowDiagnosticsReport | undefined> {
        if (this.m_running) return undefined;
        if (this.m_lab.isBenchmarkRunning) {
            this.setPanel("diagnostics: A/B benchmark is running — retry when it finishes");
            return undefined;
        }
        this.m_running = true;
        const notes: string[] = [];
        const buildings = this.m_lab.state.buildings;
        const restoreTrees = this.m_lab.state.trees;
        const restoreOrbit = this.m_lab.orbitEnabled;
        this.m_lab.setOrbit(true);
        try {
            this.setPanel("diagnostics: settling tiles…");
            await this.waitForTiles();

            const { geometry, material } = this.extractTreeAssets();
            const clones: ISweepPoint[] = [];
            for (const trees of TREE_COUNTS) {
                this.setPanel(`diagnostics: separate clones ${trees}…`);
                this.m_lab.rebuild(buildings, trees);
                await this.warmUp();
                const measurement = await this.sample();
                clones.push({ mode: "clones", trees, ...measurement });
            }

            const instanced: ISweepPoint[] = [];
            let batch: THREE.InstancedMesh | undefined;
            if (geometry != null && material != null) {
                batch = this.buildInstancedTrees(geometry, material);
                this.m_lab.rebuild(buildings, 0);
                try {
                    for (const trees of TREE_COUNTS) {
                        this.setPanel(`diagnostics: instanced batch ${trees}…`);
                        batch.count = trees;
                        batch.instanceMatrix.needsUpdate = true;
                        await this.warmUp();
                        const measurement = await this.sample();
                        instanced.push({ mode: "instanced", trees, ...measurement });
                    }
                } finally {
                    // Geometry/material are shared with the clone template: only
                    // detach the temporary batch, never dispose them.
                    this.m_field.root.remove(batch);
                }
            } else {
                notes.push("tree template unavailable — instanced control skipped");
            }

            this.setPanel("diagnostics: shadows-OFF baseline…");
            this.m_lab.rebuild(buildings, TREE_COUNTS[TREE_COUNTS.length - 1]);
            await this.warmUp();
            this.m_lab.setShadows(false);
            await this.waitForTiles();
            await this.warmUp();
            const baselineOff = await this.sample();
            this.m_lab.setShadows(true);
            await this.waitForTiles();
            await this.warmUp();

            const report = this.summarize(buildings, clones, instanced, baselineOff, notes);
            this.m_lastReport = report;
            this.setPanel(this.formatReport(report));
            logger.info(`shadow diagnostics\n${this.formatReport(report)}`);
            return report;
        } finally {
            this.m_lab.rebuild(buildings, restoreTrees);
            this.m_lab.setOrbit(restoreOrbit);
            this.stopDrive();
            this.m_running = false;
        }
    }

    // -----------------------------------------------------------------------
    // Measurement primitives
    // -----------------------------------------------------------------------

    /**
     * Sample a wall-clock window of rendered frames while the camera orbits.
     * If rAF is throttled (<4 frames in 600 ms), drive frames with `renderSync`.
     */
    private async sample(): Promise<IMeasurement> {
        this.m_lab.resetOrbit();
        this.m_frameStamps = [];
        this.m_mapView.addEventListener(MapViewEventNames.Render, this.m_onFrame);
        this.m_mapView.beginAnimation();
        await sleep(600);
        const healthy = this.m_frameStamps.length >= 4;
        if (!healthy) {
            this.startDrive();
        }
        await sleep(SAMPLE_WINDOW_MS);
        this.stopDrive();
        this.m_mapView.removeEventListener(MapViewEventNames.Render, this.m_onFrame);

        const stamps = this.m_frameStamps;
        const intervals: number[] = [];
        for (let index = 1; index < stamps.length; index++) {
            intervals.push(stamps[index] - stamps[index - 1]);
        }
        const frameMs = median(intervals);

        // `renderer.info` is written asynchronously after the passes finish;
        // reading right after renderSync() returns stale counters.
        await sleep(150);
        const info = this.m_mapView.renderer.info.render;

        return {
            frameMs,
            fps: frameMs > 0 ? 1000 / frameMs : 0,
            drawCalls: info.drawCalls,
            triangles: info.triangles,
            frames: intervals.length,
            manual: !healthy
        };
    }

    private startDrive(): void {
        if (this.m_driveTimer !== undefined) return;
        const step = (): void => {
            this.m_driveTimer = undefined;
            try {
                this.m_lab.stepOrbit(1 / 60);
                this.m_mapView.renderSync(performance.now());
            } catch (error) {
                logger.error(
                    "diagnostics renderSync failed:",
                    error instanceof Error ? error.message : String(error)
                );
                return;
            }
            this.m_driveTimer = window.setTimeout(step, 0);
        };
        step();
    }

    private stopDrive(): void {
        if (this.m_driveTimer !== undefined) {
            window.clearTimeout(this.m_driveTimer);
            this.m_driveTimer = undefined;
        }
    }

    private async warmUp(): Promise<void> {
        // Let the geometry swap, orbit step and async counters settle.
        this.m_mapView.beginAnimation();
        for (let index = 0; index < 6; index++) {
            this.m_lab.stepOrbit(1 / 60);
            this.m_mapView.renderSync(performance.now());
            await sleep(30);
        }
    }

    private async waitForTiles(timeoutMs = 30000): Promise<void> {
        const start = performance.now();
        while (performance.now() - start < timeoutMs) {
            this.m_lab.stepOrbit(1 / 60);
            this.m_mapView.renderSync(performance.now());
            if (!this.m_lab.hasPendingTiles()) {
                return;
            }
            await sleep(200);
        }
    }

    // -----------------------------------------------------------------------
    // Scene helpers
    // -----------------------------------------------------------------------

    private extractTreeAssets(): {
        geometry?: THREE.BufferGeometry;
        material?: THREE.Material;
    } {
        const template = this.m_field.treeTemplate;
        let geometry: THREE.BufferGeometry | undefined;
        let material: THREE.Material | undefined;
        template?.traverse(object => {
            const mesh = object as THREE.Mesh;
            if (mesh.isMesh === true && geometry == null) {
                geometry = mesh.geometry;
                material = Array.isArray(mesh.material) ? mesh.material[0] : mesh.material;
            }
        });
        return { geometry, material };
    }

    /**
     * Temporary batched twin of the clone layer: one `InstancedMesh` with the
     * same tree geometry/material. The sweep varies `count` at runtime.
     */
    private buildInstancedTrees(
        geometry: THREE.BufferGeometry,
        material: THREE.Material
    ): THREE.InstancedMesh {
        const maxCount = TREE_COUNTS[TREE_COUNTS.length - 1];
        const mesh = new THREE.InstancedMesh(geometry, material, maxCount);
        mesh.castShadow = true;
        mesh.receiveShadow = true;
        mesh.frustumCulled = false;

        const matrix = new THREE.Matrix4();
        const position = new THREE.Vector3();
        const rotation = new THREE.Quaternion();
        const scale = new THREE.Vector3(2.2, 2.2, 2.2);
        const up = new THREE.Vector3(0, 0, 1);
        const columns = 30;
        for (let index = 0; index < maxCount; index++) {
            const column = index % columns;
            const row = Math.floor(index / columns);
            position.set((column - columns / 2) * 28, (row - columns / 2) * 28, 0);
            rotation.setFromAxisAngle(up, (index * 0.7) % (Math.PI * 2));
            matrix.compose(position, rotation, scale);
            mesh.setMatrixAt(index, matrix);
        }
        mesh.instanceMatrix.needsUpdate = true;
        mesh.computeBoundingSphere();
        this.m_field.root.add(mesh);
        return mesh;
    }

    // -----------------------------------------------------------------------
    // Report
    // -----------------------------------------------------------------------

    private summarize(
        buildings: number,
        clones: ISweepPoint[],
        instanced: ISweepPoint[],
        baselineOff: IMeasurement | null,
        notes: string[]
    ): IShadowDiagnosticsReport {
        const maxClones = clones[clones.length - 1];
        const previousClones = clones[clones.length - 2] ?? clones[0];
        // The marginal cost is only visible once the frame exceeds VSync; use
        // the last segment of the sweep for the per-clone slope.
        const extraMs = maxClones.frameMs - previousClones.frameMs;
        const extraTrees = maxClones.trees - previousClones.trees;
        const extraCalls = maxClones.drawCalls - previousClones.drawCalls;
        const perCloneUs = extraTrees > 0 ? (extraMs * 1000) / extraTrees : 0;
        const perDrawUs = extraCalls > 0 ? (extraMs * 1000) / extraCalls : 0;

        const maxInstanced = instanced[instanced.length - 1];
        const zeroInstanced = instanced[0];
        const perInstancedUs =
            maxInstanced != null && zeroInstanced != null && maxInstanced.trees > 0
                ? ((maxInstanced.frameMs - zeroInstanced.frameMs) * 1000) / maxInstanced.trees
                : 0;

        const frameBudgetMs = 1000 / TARGET_FPS;
        const baselineMs = baselineOff?.frameMs ?? 0;
        const shadowExtraMs = baselineOff != null ? maxClones.frameMs - baselineMs : 0;
        const shadowBudgetMs = baselineOff != null ? frameBudgetMs - baselineMs : Number.NaN;
        // VSync-capped frames sit at 16.6–16.8 ms; allow half a millisecond of
        // jitter so "still 60 fps" points are not excluded by rounding.
        const fits = clones.filter(point => point.frameMs <= frameBudgetMs + 0.5);
        const maxClonesForTarget = fits.length > 0 ? fits[fits.length - 1].trees : 0;

        return {
            buildings,
            clones,
            instanced,
            baselineOff,
            perCloneUs,
            perDrawUs,
            perInstancedUs,
            shadowExtraMs,
            budget: {
                targetFps: TARGET_FPS,
                frameBudgetMs,
                baselineMs,
                shadowBudgetMs,
                maxClonesForTarget
            },
            notes
        };
    }

    private formatReport(report: IShadowDiagnosticsReport): string {
        const lines: string[] = [];
        lines.push(
            `SHADOW DIAGNOSTICS (orbiting camera)   buildings ${report.buildings}` +
                `   frame budget ${report.budget.frameBudgetMs.toFixed(1)} ms`
        );
        lines.push("");
        lines.push("clones   N    fps    frame ms   draw calls   tris");
        for (const point of report.clones) {
            lines.push(
                `  ${String(point.trees).padStart(5)}   ${point.fps.toFixed(1).padStart(5)}   ` +
                    `${point.frameMs.toFixed(2).padStart(7)}   ` +
                    `${String(point.drawCalls).padStart(6)}       ${(point.triangles / 1e6).toFixed(
                        2
                    )} M`
            );
        }
        if (report.instanced.length > 0) {
            lines.push("");
            lines.push("instanced  N    fps    frame ms   draw calls");
            for (const point of report.instanced) {
                lines.push(
                    `  ${String(point.trees).padStart(5)}   ${point.fps
                        .toFixed(1)
                        .padStart(5)}   ` +
                        `${point.frameMs.toFixed(2).padStart(7)}   ` +
                        `${String(point.drawCalls).padStart(6)}`
                );
            }
        }
        lines.push("");
        lines.push(
            `marginal cost per clone (last sweep segment): ${report.perCloneUs.toFixed(1)} µs ` +
                `(${report.perDrawUs.toFixed(1)} µs per shadow draw); ` +
                `per instanced clone: ${report.perInstancedUs.toFixed(2)} µs`
        );
        lines.push(
            `shadow extra at max load: ${report.shadowExtraMs.toFixed(2)} ms; ` +
                `OFF baseline ${report.budget.baselineMs.toFixed(2)} ms; ` +
                `budget ${report.budget.shadowBudgetMs.toFixed(2)} ms → ` +
                `${report.budget.maxClonesForTarget} separate clones fit @60fps`
        );
        if (report.notes.length > 0) {
            lines.push("");
            lines.push(`notes: ${report.notes.join("; ")}`);
        }
        return lines.join("\n");
    }

    private createPanel(): void {
        Object.assign(this.m_panel.style, {
            position: "absolute",
            left: "12px",
            top: "170px",
            maxWidth: "56vw",
            maxHeight: "62vh",
            overflow: "auto",
            margin: "0",
            padding: "8px 10px",
            color: "#e6edf3",
            font: "11px/1.45 ui-monospace, SFMono-Regular, Menlo, Consolas, monospace",
            whiteSpace: "pre",
            pointerEvents: "none",
            display: "none"
        } as CSSStyleDeclaration);
        applyPanelStyle(this.m_panel);
        this.m_panel.textContent = "shadow diagnostics: not run";
        document.body.appendChild(this.m_panel);
    }

    private setPanel(text: string): void {
        this.m_panel.style.display = "block";
        this.m_panel.textContent = text;
    }
}
