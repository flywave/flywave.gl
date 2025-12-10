/* Copyright (C) 2025 flywave.gl contributors */

import { type MapView, MapViewEventNames } from "@flywave/flywave-mapview";
import { PerformanceStatistics } from "@flywave/flywave-mapview/Statistics";
import { GUI } from "dat.gui";

/**
 * MapView monitoring panel using dat.GUI to display runtime metrics and performance information.
 */
export class MapViewMonitor {
    private readonly gui: GUI;
    private readonly folders = new Map<string, GUI>();
    private readonly monitoredValues = new Map<string, any>();
    private readonly updateCallbacks: Array<() => void> = [];
    private readonly mapView: MapView;
    private readonly stats: PerformanceStatistics;
    private readonly updateHandler: () => void;

    constructor(mapView: MapView, parentGui?: GUI) {
        this.mapView = mapView;
        this.stats = PerformanceStatistics.instance;

        // Create or use existing GUI
        this.gui = parentGui || new GUI({ name: "MapView Monitor", width: 300 });
        this.gui.close(); // Start closed to avoid cluttering the view

        this.setupFolders();
        this.setupPerformanceMonitoring();
        this.setupCameraInfo();
        this.setupRenderingInfo();
        this.setupMemoryInfo();
        this.setupTileInfo();
        this.setupDataSourceInfo();
        this.setupTextInfo();
        this.setupAnimationInfo();
        this.setupEnvironmentInfo();

        // Bind the update handler to this instance
        this.updateHandler = this.update.bind(this);

        // Start listening to MapView render events
        this.mapView.addEventListener(MapViewEventNames.AfterRender, this.updateHandler);
    }

    /**
     * Clean up resources and stop updating
     */
    dispose() {
        // Remove event listener
        this.mapView.removeEventListener(MapViewEventNames.AfterRender, this.updateHandler);

        // Remove all folders
        for (const folder of this.folders.values()) {
            this.gui.removeFolder(folder);
        }
        this.folders.clear();

        // Remove from parent GUI if we created it
        if (this.gui.parent === undefined) {
            this.gui.destroy();
        }
    }

    /**
     * Set up the main folder structure
     */
    private setupFolders() {
        this.folders.set("Performance", this.gui.addFolder("📊 Performance"));
        this.folders.set("Camera", this.gui.addFolder("📷 Camera"));
        this.folders.set("Rendering", this.gui.addFolder("🎨 Rendering"));
        this.folders.set("Memory", this.gui.addFolder("💾 Memory"));
        this.folders.set("Tiles", this.gui.addFolder("🧱 Tiles"));
        this.folders.set("DataSources", this.gui.addFolder("📡 DataSources"));
        this.folders.set("Text", this.gui.addFolder("🔤 Text"));
        this.folders.set("Animation", this.gui.addFolder("🎬 Animation"));
        this.folders.set("Environment", this.gui.addFolder("🌍 Environment"));

        // Close all folders by default
        for (const folder of this.folders.values()) {
            folder.close();
        }
    }

    /**
     * Set up performance monitoring section
     */
    private setupPerformanceMonitoring() {
        const perfFolder = this.folders.get("Performance")!;

        // FPS monitoring
        const fpsInfo = {
            currentFps: 0,
            avgFps: 0,
            minFps: 0,
            maxFps: 0,
            frameTime: 0
        };

        this.monitoredValues.set("fpsInfo", fpsInfo);
        perfFolder.add(fpsInfo, "currentFps").name("Current FPS").listen();
        perfFolder.add(fpsInfo, "avgFps").name("Average FPS").listen();
        perfFolder.add(fpsInfo, "minFps").name("Min FPS").listen();
        perfFolder.add(fpsInfo, "maxFps").name("Max FPS").listen();
        perfFolder.add(fpsInfo, "frameTime").name("Frame Time (ms)").listen();

        // Add callback to update FPS info
        this.updateCallbacks.push(() => {
            const stats = this.stats.getLastFrameStatistics();
            if (stats && stats.frames["render.fps"]) {
                fpsInfo.currentFps = Math.round(stats.frames["render.fps"] * 100) / 100;
            }

            // Calculate FPS stats from the last few frames
            const frameTimes =
                this.stats.frameEvents.messages.size > 0
                    ? this.stats.frameEvents.messages.asArray()
                    : [];
            if (frameTimes.length > 0) {
                const fpsValues = frameTimes
                    .map((_: any, i: number) => {
                        const frame = this.stats.frameEvents.frameEntries.get("render.fps");
                        return frame ? frame.asArray()[i] : 0;
                    })
                    .filter((val: number) => val > 0);

                if (fpsValues.length > 0) {
                    fpsInfo.avgFps =
                        Math.round(
                            (fpsValues.reduce((a: number, b: number) => a + b, 0) /
                                fpsValues.length) *
                                100
                        ) / 100;
                    fpsInfo.minFps = Math.round(Math.min(...fpsValues) * 100) / 100;
                    fpsInfo.maxFps = Math.round(Math.max(...fpsValues) * 100) / 100;
                }
            }

            // Frame time
            if (stats && stats.frames["render.frameRenderTime"]) {
                fpsInfo.frameTime = Math.round(stats.frames["render.frameRenderTime"] * 100) / 100;
            }
        });
    }

    /**
     * Set up camera information section
     */
    private setupCameraInfo() {
        const cameraFolder = this.folders.get("Camera")!;

        const cameraInfo = {
            zoomLevel: 0,
            tilt: 0,
            heading: 0,
            latitude: 0,
            longitude: 0,
            altitude: 0,
            nearPlane: 0,
            farPlane: 0,
            fov: 0
        };

        this.monitoredValues.set("cameraInfo", cameraInfo);
        cameraFolder.add(cameraInfo, "zoomLevel", 0, 25, 0.1).name("Zoom Level").listen();
        cameraFolder.add(cameraInfo, "tilt", 0, 90, 1).name("Tilt (deg)").listen();
        cameraFolder.add(cameraInfo, "heading", -180, 180, 1).name("Heading (deg)").listen();
        cameraFolder.add(cameraInfo, "latitude", -90, 90, 0.0001).name("Latitude").listen();
        cameraFolder.add(cameraInfo, "longitude", -180, 180, 0.0001).name("Longitude").listen();
        cameraFolder.add(cameraInfo, "altitude").name("Altitude").listen();
        cameraFolder.add(cameraInfo, "nearPlane").name("Near Plane").listen();
        cameraFolder.add(cameraInfo, "farPlane").name("Far Plane").listen();
        cameraFolder.add(cameraInfo, "fov", 0, 180, 1).name("FOV (deg)").listen();

        // Add callback to update camera info
        this.updateCallbacks.push(() => {
            const target = this.mapView.target;
            const camera = this.mapView.camera;

            cameraInfo.zoomLevel = Math.round(this.mapView.zoomLevel * 100) / 100;
            cameraInfo.tilt = Math.round(this.mapView.tilt * 100) / 100;
            cameraInfo.heading = Math.round(this.mapView.heading * 100) / 100;
            cameraInfo.latitude = Math.round(target.latitude * 10000) / 10000;
            cameraInfo.longitude = Math.round(target.longitude * 10000) / 10000;
            cameraInfo.altitude = Math.round(target.altitude || 0);
            cameraInfo.nearPlane = Math.round(camera.near * 100) / 100;
            cameraInfo.farPlane = Math.round(camera.far * 100) / 100;
            cameraInfo.fov = Math.round(camera.fov * 100) / 100;
        });
    }

    /**
     * Set up rendering information section
     */
    private setupRenderingInfo() {
        const renderFolder = this.folders.get("Rendering")!;

        const renderInfo = {
            calls: 0,
            triangles: 0,
            lines: 0,
            points: 0,
            geometries: 0,
            textures: 0
        };

        this.monitoredValues.set("renderInfo", renderInfo);
        renderFolder.add(renderInfo, "calls").name("Draw Calls").listen();
        renderFolder.add(renderInfo, "triangles").name("Triangles").listen();
        renderFolder.add(renderInfo, "lines").name("Lines").listen();
        renderFolder.add(renderInfo, "points").name("Points").listen();
        renderFolder.add(renderInfo, "geometries").name("Geometries").listen();
        renderFolder.add(renderInfo, "textures").name("Textures").listen();

        // Add callback to update rendering info
        this.updateCallbacks.push(() => {
            const renderer = this.mapView.renderer;
            const info = renderer.info;

            if (info.render) {
                renderInfo.calls = info.render.calls || 0;
                renderInfo.triangles = info.render.triangles || 0;
                renderInfo.lines = info.render.lines || 0;
                renderInfo.points = info.render.points || 0;
            }

            if (info.memory) {
                renderInfo.geometries = info.memory.geometries || 0;
                renderInfo.textures = info.memory.textures || 0;
            }
        });
    }

    /**
     * Set up memory information section
     */
    private setupMemoryInfo() {
        const memoryFolder = this.folders.get("Memory")!;

        const memoryInfo = {
            jsHeapSizeLimit: 0,
            totalJSHeapSize: 0,
            usedJSHeapSize: 0,
            memoryUsage: 0
        };

        this.monitoredValues.set("memoryInfo", memoryInfo);
        memoryFolder.add(memoryInfo, "usedJSHeapSize").name("Used Memory (MB)").listen();
        memoryFolder.add(memoryInfo, "totalJSHeapSize").name("Total Memory (MB)").listen();
        memoryFolder.add(memoryInfo, "jsHeapSizeLimit").name("Memory Limit (MB)").listen();
        memoryFolder.add(memoryInfo, "memoryUsage", 0, 100).name("Usage %").listen();

        // Add callback to update memory info
        this.updateCallbacks.push(() => {
            if (window.performance && (window.performance as any).memory) {
                const memory = (window.performance as any).memory;
                memoryInfo.jsHeapSizeLimit = Math.round(memory.jsHeapSizeLimit / 1024 / 1024);
                memoryInfo.totalJSHeapSize = Math.round(memory.totalJSHeapSize / 1024 / 1024);
                memoryInfo.usedJSHeapSize = Math.round(memory.usedJSHeapSize / 1024 / 1024);
                memoryInfo.memoryUsage = Math.round(
                    (memoryInfo.usedJSHeapSize / memoryInfo.jsHeapSizeLimit) * 100
                );
            } else {
                // Fallback if memory API is not available
                memoryInfo.jsHeapSizeLimit = 0;
                memoryInfo.totalJSHeapSize = 0;
                memoryInfo.usedJSHeapSize = 0;
                memoryInfo.memoryUsage = 0;
            }
        });
    }

    /**
     * Set up tile information section
     */
    private setupTileInfo() {
        const tileFolder = this.folders.get("Tiles")!;

        const tileInfo = {
            renderedTiles: 0,
            visibleTiles: 0,
            loadingTiles: 0,
            cacheSize: 0,
            maxCacheSize: 0
        };

        this.monitoredValues.set("tileInfo", tileInfo);
        tileFolder.add(tileInfo, "renderedTiles").name("Rendered Tiles").listen();
        tileFolder.add(tileInfo, "visibleTiles").name("Visible Tiles").listen();
        tileFolder.add(tileInfo, "loadingTiles").name("Loading Tiles").listen();
        tileFolder.add(tileInfo, "cacheSize").name("Cache Size").listen();
        tileFolder.add(tileInfo, "maxCacheSize").name("Max Cache Size").listen();

        // Add callback to update tile info
        this.updateCallbacks.push(() => {
            const visibleTileSet = this.mapView.visibleTileSet;
            const stats = this.stats.getLastFrameStatistics();

            if (stats && stats.frames) {
                tileInfo.renderedTiles = stats.frames["renderCount.numTilesRendered"] || 0;
                tileInfo.visibleTiles = stats.frames["renderCount.numTilesVisible"] || 0;
                tileInfo.loadingTiles = stats.frames["renderCount.numTilesLoading"] || 0;
            }

            tileInfo.cacheSize = visibleTileSet.getDataSourceCacheSize();
            tileInfo.maxCacheSize = this.mapView.getCacheSize();
        });
    }

    /**
     * Set up data source information section
     */
    private setupDataSourceInfo() {
        const dsFolder = this.folders.get("DataSources")!;

        const dsInfo = {
            count: 0,
            enabled: 0,
            names: "None"
        };

        this.monitoredValues.set("dsInfo", dsInfo);
        dsFolder.add(dsInfo, "count").name("Total DataSources").listen();
        dsFolder.add(dsInfo, "enabled").name("Enabled DataSources").listen();
        dsFolder.add(dsInfo, "names").name("DataSource Names").listen();

        // Add callback to update data source info
        this.updateCallbacks.push(() => {
            const dataSources: any[] = this.mapView.dataSources;
            dsInfo.count = dataSources.length;

            const enabledDataSources = dataSources.filter((ds: any) =>
                this.mapView.isDataSourceEnabled(ds)
            );
            dsInfo.enabled = enabledDataSources.length;

            if (dataSources.length > 0) {
                const names = dataSources.map((ds: any) => ds.name).slice(0, 3);
                dsInfo.names = names.join(", ");
                if (dataSources.length > 3) {
                    dsInfo.names += ` and ${dataSources.length - 3} more`;
                }
            } else {
                dsInfo.names = "None";
            }
        });
    }

    /**
     * Set up text information section
     */
    private setupTextInfo() {
        const textFolder = this.folders.get("Text")!;

        const textInfo = {
            renderedTextElements: 0,
            totalTextElements: 0,
            fontCatalogs: 0,
            loadingTextElements: 0
        };

        this.monitoredValues.set("textInfo", textInfo);
        textFolder.add(textInfo, "renderedTextElements").name("Rendered Elements").listen();
        textFolder.add(textInfo, "totalTextElements").name("Total Elements").listen();
        textFolder.add(textInfo, "fontCatalogs").name("Font Catalogs").listen();
        textFolder.add(textInfo, "loadingTextElements").name("Loading Elements").listen();

        // Add callback to update text info
        this.updateCallbacks.push(() => {
            const textRenderer = this.mapView.textElementsRenderer;
            if (textRenderer) {
                // These are approximations since the actual properties might be different
                textInfo.renderedTextElements = (textRenderer as any).renderedElementsCount || 0;
                textInfo.totalTextElements = (textRenderer as any).totalElementsCount || 0;
                textInfo.fontCatalogs = (textRenderer as any).fontCatalogsCount || 0;
                textInfo.loadingTextElements = (textRenderer as any).loadingElementsCount || 0;
            }
        });
    }

    /**
     * Set up animation information section
     */
    private setupAnimationInfo() {
        const animFolder = this.folders.get("Animation")!;

        const animInfo = {
            animating: false,
            animationCount: 0,
            frameNumber: 0
        };

        this.monitoredValues.set("animInfo", animInfo);
        animFolder.add(animInfo, "animating").name("Animating").listen();
        animFolder.add(animInfo, "animationCount").name("Animation Count").listen();
        animFolder.add(animInfo, "frameNumber").name("Frame Number").listen();

        // Add callback to update animation info
        this.updateCallbacks.push(() => {
            // Accessing private properties through casting
            const mapView = this.mapView as any;
            animInfo.animating = mapView.animating || false;
            animInfo.animationCount = mapView.m_animationCount || 0;
            animInfo.frameNumber = mapView.m_frameNumber || 0;
        });
    }

    /**
     * Set up environment information section
     */
    private setupEnvironmentInfo() {
        const envFolder = this.folders.get("Environment")!;

        const envInfo = {
            theme: "default",
            projection: "mercator",
            pixelRatio: 1,
            language: "en"
        };

        this.monitoredValues.set("envInfo", envInfo);
        envFolder.add(envInfo, "theme").name("Theme").listen();
        envFolder.add(envInfo, "projection").name("Projection").listen();
        envFolder.add(envInfo, "pixelRatio").name("Pixel Ratio").listen();
        envFolder.add(envInfo, "language").name("Language").listen();

        // Add callback to update environment info
        this.updateCallbacks.push(() => {
            // Theme
            const theme = this.mapView.theme;
            if (theme && typeof theme === "object" && (theme as any).name) {
                envInfo.theme = (theme as any).name;
            } else {
                envInfo.theme = "default";
            }

            // Projection
            const projection = this.mapView.projection;
            if (projection && typeof projection === "object" && (projection as any).name) {
                envInfo.projection = (projection as any).name;
            } else {
                envInfo.projection = "mercator";
            }

            // Pixel ratio
            envInfo.pixelRatio = this.mapView.pixelRatio || 1;

            // Language
            const languages = this.mapView.languages;
            if (languages && Array.isArray(languages) && languages.length > 0) {
                envInfo.language = languages[0];
            } else {
                envInfo.language = "en";
            }
        });
    }

    /**
     * Update all monitored values
     */
    private update() {
        try {
            for (const callback of this.updateCallbacks) {
                callback();
            }
        } catch (e) {
            console.warn("Error updating monitor:", e);
        }
    }

    /**
     * Get the GUI instance for custom modifications
     */
    getGUI(): GUI {
        return this.gui;
    }

    /**
     * Open the monitor panel
     */
    open() {
        this.gui.open();
    }

    /**
     * Close the monitor panel
     */
    close() {
        this.gui.close();
    }

    /**
     * Get a specific folder by name
     */
    getFolder(name: string): GUI | undefined {
        return this.folders.get(name);
    }
}
