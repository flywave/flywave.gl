/* Copyright (C) 2025 flywave.gl contributors */
import { PerformanceStatistics } from "@flywave/flywave-mapview/Statistics";
export class PerformanceModule {
    constructor() {
        this.stats = PerformanceStatistics.instance;
    }
    setupFolder(gui) {
        return gui.addFolder("📊 Performance");
    }
    createData() {
        return {
            currentFps: 0,
            avgFps: 0,
            minFps: 0,
            maxFps: 0,
            frameTime: 0
        };
    }
    updateData(data) {
        const stats = this.stats.getLastFrameStatistics();
        if (stats && stats.frames["render.fps"]) {
            data.currentFps = Math.round(stats.frames["render.fps"] * 100) / 100;
        }
        // Calculate FPS stats from the last few frames
        const frameTimes = this.stats.frameEvents.messages.size > 0
            ? this.stats.frameEvents.messages.asArray()
            : [];
        if (frameTimes.length > 0) {
            const fpsValues = frameTimes
                .map((_, i) => {
                const frame = this.stats.frameEvents.frameEntries.get("render.fps");
                return frame ? frame.asArray()[i] : 0;
            })
                .filter((val) => val > 0);
            if (fpsValues.length > 0) {
                data.avgFps =
                    Math.round((fpsValues.reduce((a, b) => a + b, 0) / fpsValues.length) *
                        100) / 100;
                data.minFps = Math.round(Math.min(...fpsValues) * 100) / 100;
                data.maxFps = Math.round(Math.max(...fpsValues) * 100) / 100;
            }
        }
        // Frame time
        if (stats && stats.frames["render.frameRenderTime"]) {
            data.frameTime = Math.round(stats.frames["render.frameRenderTime"] * 100) / 100;
        }
    }
    bindControls(folder, data) {
        folder.add(data, "currentFps").name("Current FPS").listen();
        folder.add(data, "avgFps").name("Average FPS").listen();
        folder.add(data, "minFps").name("Min FPS").listen();
        folder.add(data, "maxFps").name("Max FPS").listen();
        folder.add(data, "frameTime").name("Frame Time (ms)").listen();
    }
}
//# sourceMappingURL=PerformanceModule.js.map