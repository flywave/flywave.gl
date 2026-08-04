/* Copyright (C) 2025 flywave.gl contributors */

export interface PivotIndicatorOptions {
    enabled?: boolean;
    fadeDuration?: number;
    pixelSize?: number;
}

export class PivotIndicator {
    private readonly dot: HTMLDivElement;
    private m_enabled: boolean = true;
    private m_fadeDuration: number = 250;
    private m_pixelSize: number = 28;
    private m_currentOpacity: number = 0;
    private m_targetOpacity: number = 0;
    private m_lastTime: number = 0;
    private m_visible: boolean = false;

    constructor(canvas: HTMLCanvasElement, options?: PivotIndicatorOptions) {
        if (options?.enabled !== undefined) this.m_enabled = options.enabled;
        if (options?.fadeDuration !== undefined) this.m_fadeDuration = options.fadeDuration;
        if (options?.pixelSize !== undefined) this.m_pixelSize = options.pixelSize;

        const parent = canvas.parentElement;
        if (parent == null) throw new Error("Canvas has no parent element");

        if (getComputedStyle(parent).position === "static") {
            parent.style.position = "relative";
        }

        this.dot = document.createElement("div");
        this.applyStyle();
        this.dot.style.display = "none";
        parent.appendChild(this.dot);
    }

    private applyStyle(): void {
        this.dot.style.cssText = [
            "position:absolute",
            "pointer-events:none",
            "z-index:9999",
            `width:${this.m_pixelSize}px`,
            `height:${this.m_pixelSize}px`,
            "border-radius:50%",
            "border:2px solid rgba(255,255,255,0.85)",
            "background:rgba(255,255,255,0.12)",
            "box-shadow:0 0 4px rgba(0,0,0,0.4)",
            "transform:translate(-50%,-50%)",
            `opacity:0`
        ].join(";");
    }

    get enabled(): boolean {
        return this.m_enabled;
    }

    set enabled(v: boolean) {
        this.m_enabled = v;
        if (!v) this.hide();
    }

    get pixelSize(): number {
        return this.m_pixelSize;
    }

    set pixelSize(v: number) {
        this.m_pixelSize = v;
        this.dot.style.width = `${v}px`;
        this.dot.style.height = `${v}px`;
    }

    public show(x: number, y: number): void {
        if (!this.m_enabled) return;
        this.dot.style.left = `${x}px`;
        this.dot.style.top = `${y}px`;
        this.m_targetOpacity = 1;
        this.m_visible = true;
        this.dot.style.display = "block";
    }

    public hide(): void {
        this.m_targetOpacity = 0;
    }

    get isAnimating(): boolean {
        return this.m_visible;
    }

    public update(): void {
        if (!this.m_visible) return;

        if (this.m_targetOpacity === 0 && this.m_currentOpacity === 0) {
            this.m_visible = false;
            this.dot.style.display = "none";
            this.m_lastTime = 0;
            return;
        }

        const now = performance.now();
        if (this.m_lastTime === 0) this.m_lastTime = now;
        const deltaMs = Math.min(now - this.m_lastTime, 100);
        this.m_lastTime = now;

        if (deltaMs > 0) {
            const timeConstant = this.m_fadeDuration / 4;
            const alpha = 1 - Math.exp(-deltaMs / timeConstant);
            this.m_currentOpacity += (this.m_targetOpacity - this.m_currentOpacity) * alpha;

            if (Math.abs(this.m_targetOpacity - this.m_currentOpacity) < 0.01) {
                this.m_currentOpacity = this.m_targetOpacity;
                if (this.m_targetOpacity === 0) {
                    this.m_visible = false;
                    this.dot.style.display = "none";
                    this.m_lastTime = 0;
                    return;
                }
            }
        }

        this.dot.style.opacity = `${this.m_currentOpacity}`;
    }

    public dispose(): void {
        this.dot.remove();
    }
}
