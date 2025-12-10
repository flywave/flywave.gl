/* Copyright (C) 2025 flywave.gl contributors */

import { type GUI } from "dat.gui";

export interface MemoryData {
    jsHeapSizeLimit: number;
    totalJSHeapSize: number;
    usedJSHeapSize: number;
    memoryUsage: number;
}

export class MemoryModule {
    setupFolder(gui: GUI): GUI {
        return gui.addFolder("💾 Memory");
    }

    createData(): MemoryData {
        return {
            jsHeapSizeLimit: 0,
            totalJSHeapSize: 0,
            usedJSHeapSize: 0,
            memoryUsage: 0
        };
    }

    updateData(data: MemoryData): void {
        if (window.performance && (window.performance as any).memory) {
            const memory = (window.performance as any).memory;
            data.jsHeapSizeLimit = Math.round(memory.jsHeapSizeLimit / 1024 / 1024);
            data.totalJSHeapSize = Math.round(memory.totalJSHeapSize / 1024 / 1024);
            data.usedJSHeapSize = Math.round(memory.usedJSHeapSize / 1024 / 1024);
            data.memoryUsage = Math.round((data.usedJSHeapSize / data.jsHeapSizeLimit) * 100);
        } else {
            // Fallback if memory API is not available
            data.jsHeapSizeLimit = 0;
            data.totalJSHeapSize = 0;
            data.usedJSHeapSize = 0;
            data.memoryUsage = 0;
        }
    }

    bindControls(folder: GUI, data: MemoryData): void {
        folder.add(data, "usedJSHeapSize").name("Used Memory (MB)").listen();
        folder.add(data, "totalJSHeapSize").name("Total Memory (MB)").listen();
        folder.add(data, "jsHeapSizeLimit").name("Memory Limit (MB)").listen();
        folder.add(data, "memoryUsage", 0, 100).name("Usage %").listen();
    }
}
