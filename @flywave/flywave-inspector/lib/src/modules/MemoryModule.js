/* Copyright (C) 2025 flywave.gl contributors */
export class MemoryModule {
    setupFolder(gui) {
        return gui.addFolder("💾 Memory");
    }
    createData() {
        return {
            jsHeapSizeLimit: 0,
            totalJSHeapSize: 0,
            usedJSHeapSize: 0,
            memoryUsage: 0
        };
    }
    updateData(data) {
        if (window.performance && window.performance.memory) {
            const memory = window.performance.memory;
            data.jsHeapSizeLimit = Math.round(memory.jsHeapSizeLimit / 1024 / 1024);
            data.totalJSHeapSize = Math.round(memory.totalJSHeapSize / 1024 / 1024);
            data.usedJSHeapSize = Math.round(memory.usedJSHeapSize / 1024 / 1024);
            data.memoryUsage = Math.round((data.usedJSHeapSize / data.jsHeapSizeLimit) * 100);
        }
        else {
            // Fallback if memory API is not available
            data.jsHeapSizeLimit = 0;
            data.totalJSHeapSize = 0;
            data.usedJSHeapSize = 0;
            data.memoryUsage = 0;
        }
    }
    bindControls(folder, data) {
        folder.add(data, "usedJSHeapSize").name("Used Memory (MB)").listen();
        folder.add(data, "totalJSHeapSize").name("Total Memory (MB)").listen();
        folder.add(data, "jsHeapSizeLimit").name("Memory Limit (MB)").listen();
        folder.add(data, "memoryUsage", 0, 100).name("Usage %").listen();
    }
}
//# sourceMappingURL=MemoryModule.js.map