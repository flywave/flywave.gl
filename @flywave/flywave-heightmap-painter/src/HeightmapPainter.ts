import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import { GlobalStyle } from "./styles/GlobalStyle";
import { HeightmapExport, BrushSettings } from "./types";
import type { L } from "./types";
import { BrushEngine } from "./utils/brushEngine";

export interface HeightmapPainterOptions {
    width?: number;
    height?: number;
    initialCenter?: [number, number];
    initialZoom?: number;
    basemap?: "satellite" | "street" | "terrain";
    paintAreaGeoBox?: { minLon: number; minLat: number; maxLon: number; maxLat: number };
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
    setMode(mode: "draw" | "navigate"): void;
    getMap(): L.Map | null;
    getBrushEngine(): BrushEngine | null;
}

export class HeightmapPainter {
    private container: HTMLElement;
    private root: ReactDOM.Root | null = null;
    private isMounted: boolean = false;
    private eventListeners: Map<keyof HeightmapPainterEvents, Set<Function>> = new Map();
    private appRef: React.RefObject<AppInstance> = React.createRef<AppInstance>();

    constructor(options: HeightmapPainterOptions) {
        this.container = document.createElement("div");

        this.container.style.width = `${options.width ?? 1024}px`;
        this.container.style.height = `${options.height ?? 1024}px`;
        this.container.style.position = "relative";
        this.container.style.overflow = "hidden";
        this.container.style.border = "2px solid #333";
        this.container.style.borderRadius = "8px";
        this.container.style.boxShadow = "0 4px 12px rgba(0, 0, 0, 0.15)";

        this.mount(options);
    }

    public getElement(): HTMLElement {
        return this.container;
    }

    private mount(options: HeightmapPainterOptions): void {
        const appElement = React.createElement(App, {
            ref: this.appRef,
            width: options.width ?? 1024,
            height: options.height ?? 1024,
            initialCenter: options.initialCenter ?? [39.9, 116.4],
            initialZoom: options.initialZoom ?? 13,
            basemap: options.basemap ?? "satellite",
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

    public setMode(mode: "draw" | "navigate"): void {
        this.appRef.current?.setMode(mode);
    }

    public getMap(): L.Map | null {
        return this.appRef.current?.getMap() || null;
    }

    public getBrushEngine(): BrushEngine | null {
        return this.appRef.current?.getBrushEngine() || null;
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
