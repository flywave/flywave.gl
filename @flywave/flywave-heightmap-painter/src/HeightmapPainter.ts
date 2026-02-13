import React from "react";
import ReactDOM from "react-dom/client";
import PainterApp from "./PainterApp";
import { GlobalStyle } from "./styles/GlobalStyle";
import { HeightmapExport, BrushSettings } from "./types";
import type { MapControls } from "@flywave/flywave.gl";
import type { MapView } from "@flywave/flywave.gl";
import type { TerrainDataSource } from "@flywave/flywave.gl";

export interface HeightmapPainterOptions {
    mapView: MapView;
    terrainSource: TerrainDataSource;
    mapControls?: MapControls;
    container: HTMLElement;
    width?: number;
    height?: number;
    paintAreaGeoBox?: {
        minLon: number;
        minLat: number;
        maxLon: number;
        maxLat: number;
    };
}

export type HeightmapPainterEvents = {
    ready: () => void;
    destroy: () => void;
    brushStart: (x: number, y: number) => void;
    brushMove: (x: number, y: number) => void;
    brushEnd: () => void;
    heightmapChange: (heightData: Float32Array) => void;
    export: (data: HeightmapExport) => void;
};

type EventCallback<T extends keyof HeightmapPainterEvents> = HeightmapPainterEvents[T];

interface AppInstance {
    exportHeightmap(): HeightmapExport | null;
    clearCanvas(): void;
    updateBrushSettings(settings: Partial<BrushSettings>): void;
    getBrushSettings(): BrushSettings | null;
    reconfigure(): void;
}

export class HeightmapPainter {
    private container: HTMLElement;
    private targetContainer: HTMLElement;
    private root: ReactDOM.Root | null = null;
    private isMounted: boolean = false;
    private eventListeners: Map<keyof HeightmapPainterEvents, Set<Function>> = new Map();
    private appRef: React.RefObject<AppInstance> = React.createRef<AppInstance>();

    constructor(options: HeightmapPainterOptions) {
        if (!options.mapView) {
            throw new Error("mapView is required for HeightmapPainter");
        }
        if (!options.terrainSource) {
            throw new Error("terrainSource is required for HeightmapPainter");
        }
        if (!options.container) {
            throw new Error("container is required for HeightmapPainter");
        }

        this.targetContainer = options.container;

        this.container = document.createElement("div");
        this.container.style.width = "100%";
        this.container.style.height = "100%";
        this.container.style.position = "absolute";
        this.container.style.top = "0";
        this.container.style.left = "0";
        this.container.style.pointerEvents = "none";
        this.container.style.zIndex = "1000"; // Far above MapControlsUI

        // Append painter container to targetContainer
        this.targetContainer.appendChild(this.container);

        this.mount(options);
    }

    public getElement(): HTMLElement {
        return this.container;
    }

    private mount(options: HeightmapPainterOptions): void {
        const appElement = React.createElement(PainterApp, {
            ref: this.appRef,
            mapView: options.mapView,
            terrainSource: options.terrainSource,
            mapControls: options.mapControls,
            width: options.width,
            height: options.height,
            paintAreaGeoBox: options.paintAreaGeoBox,
            onBrushStart: (x: number, y: number) => this.emit("brushStart", x, y),
            onBrushMove: (x: number, y: number) => this.emit("brushMove", x, y),
            onBrushEnd: () => this.emit("brushEnd"),
            onHeightmapChange: (data: Float32Array) => this.emit("heightmapChange", data),
            onExport: (data: HeightmapExport) => this.emit("export", data)
        });

        const rootElement = React.createElement(
            React.StrictMode,
            null,
            React.createElement(GlobalStyle, null),
            appElement
        );

        this.root = ReactDOM.createRoot(this.container);
        this.root.render(rootElement);
        this.isMounted = true;

        this.emit("ready");
    }

    public on<T extends keyof HeightmapPainterEvents>(event: T, callback: EventCallback<T>): this {
        if (!this.eventListeners.has(event)) {
            this.eventListeners.set(event, new Set());
        }
        this.eventListeners.get(event)!.add(callback as Function);
        return this;
    }

    public off<T extends keyof HeightmapPainterEvents>(event: T, callback: EventCallback<T>): this {
        const listeners = this.eventListeners.get(event);
        if (listeners) {
            listeners.delete(callback as Function);
        }
        return this;
    }

    private emit<T extends keyof HeightmapPainterEvents>(
        event: T,
        ...args: Parameters<HeightmapPainterEvents[T]>
    ): void {
        const listeners = this.eventListeners.get(event);
        if (listeners) {
            listeners.forEach(callback => callback(...args));
        }
    }

    public exportHeightmap(): HeightmapExport | null {
        return this.appRef.current?.exportHeightmap() || null;
    }

    public clearCanvas(): void {
        this.appRef.current?.clearCanvas();
    }

    public updateBrushSettings(settings: Partial<BrushSettings>): void {
        this.appRef.current?.updateBrushSettings(settings);
    }

    public getBrushSettings(): BrushSettings | null {
        return this.appRef.current?.getBrushSettings() || null;
    }

    public destroy(): void {
        this.emit("destroy");

        if (this.root && this.isMounted) {
            this.root.unmount();
            this.root = null;
            this.isMounted = false;
        }

        this.eventListeners.clear();

        if (this.container.parentNode) {
            this.container.parentNode.removeChild(this.container);
        }
    }
}

export default HeightmapPainter;
