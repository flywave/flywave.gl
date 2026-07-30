/* Copyright (C) 2025 flywave.gl contributors */

import { PerformanceStatistics } from "@flywave/flywave-mapview/Statistics";
import { type GUI } from "dat.gui";

export interface PerformanceData {
    currentFps: number;
    avgFps: number;
    minFps: number;
    maxFps: number;
    frameTime: number;
}

export class PerformanceModule {
    private readonly stats: PerformanceStatistics;

    constructor() {
        this.stats = PerformanceStatistics.instance;
    }

    setupFolder(gui: GUI): GUI {
        return gui.addFolder("📊 Performance");
    }

    createData(): PerformanceData {
        return {
            currentFps: 0,
            avgFps: 0,
            minFps: 0,
            maxFps: 0,
            frameTime: 0
        };
    }

    updateData(data: PerformanceData): void {
        const stats = this.stats.getLastFrameStatistics();
        if (stats && stats.frames["render.fps"]) {
            data.currentFps = Math.round(stats.frames["render.fps"] * 100) / 100;
        }

        const fpsBuffer = this.stats.frameEvents.frameEntries.get("render.fps");
        if (fpsBuffer) {
            const fpsValues = fpsBuffer.asArray().filter((v: number) => v > 0);
            if (fpsValues.length > 0) {
                let sum = 0;
                let min = Infinity;
                let max = 0;
                for (const v of fpsValues) {
                    sum += v;
                    if (v < min) min = v;
                    if (v > max) max = v;
                }
                data.avgFps = Math.round((sum / fpsValues.length) * 100) / 100;
                data.minFps = Math.round(min * 100) / 100;
                data.maxFps = Math.round(max * 100) / 100;
            }
        }

        if (stats && stats.frames["render.frameRenderTime"]) {
            data.frameTime = Math.round(stats.frames["render.frameRenderTime"] * 100) / 100;
        }
    }

    bindControls(folder: GUI, data: PerformanceData): void {
        folder.add(data, "currentFps").name("Current FPS").listen();
        folder.add(data, "avgFps").name("Average FPS").listen();
        folder.add(data, "minFps").name("Min FPS").listen();
        folder.add(data, "maxFps").name("Max FPS").listen();
        folder.add(data, "frameTime").name("Frame Time (ms)").listen();
    }
}
