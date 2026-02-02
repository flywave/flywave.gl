/* Copyright (C) 2025 flywave.gl contributors */

import { BrushType } from "@flywave/flywave-terrain-datasource";
import type { BrushConfig } from "../types";
import { STYLES } from "./style";

export interface TerrainToolsUIOptions {
    container: HTMLElement;
    onBrushChange: (brush: Partial<BrushConfig>) => void;
    onExport: (format: "json" | "clipboard") => void;
    onClear: () => void;
    onToggle?: (enabled: boolean) => void;
    defaultBrush?: Partial<BrushConfig>;
}

export class TerrainToolsUI {
    private container: HTMLElement;
    private options: TerrainToolsUIOptions;
    private currentBrushType: BrushType = BrushType.RAISE;
    private isEnabled: boolean = false;
    private elements: Map<string, HTMLElement> = new Map();

    private brushTypeLabels = {
        [BrushType.RAISE]: "抬升",
        [BrushType.LOWER]: "降低",
        [BrushType.SMOOTH]: "平滑",
        [BrushType.FLATTEN]: "平整",
        [BrushType.NOISE]: "噪声",
        [BrushType.ERODE]: "侵蚀"
    };

    constructor(options: TerrainToolsUIOptions) {
        this.options = options;
        this.container = options.container;

        if (!this.container) {
            throw new Error(`UI container not found`);
        }

        this.injectStyles();
        this.render();
        this.bindEvents();

        this.updateToggleButton();
    }

    private injectStyles(): void {
        const styleElement = document.createElement("style");
        styleElement.textContent = STYLES;
        document.head.appendChild(styleElement);
    }

    private render(): void {
        this.container.innerHTML = `
      <div class="terrain-tools-panel">
        <div class="panel-header">
          <h3>地形修改工具</h3>
          <div class="header-controls">
            <button id="toggle-btn" class="toggle-btn">启用</button>
            <span class="operation-count">操作数: 0</span>
          </div>
        </div>

        <div class="panel-section">
          <label>笔刷类型</label>
          <div class="brush-types">
            <button data-brush="${BrushType.RAISE}" class="brush-btn active">抬升</button>
            <button data-brush="${BrushType.LOWER}" class="brush-btn">降低</button>
            <button data-brush="${BrushType.SMOOTH}" class="brush-btn">平滑</button>
            <button data-brush="${BrushType.FLATTEN}" class="brush-btn">平整</button>
            <button data-brush="${BrushType.NOISE}" class="brush-btn">噪声</button>
            <button data-brush="${BrushType.ERODE}" class="brush-btn">侵蚀</button>
          </div>
        </div>

        <div class="panel-section">
          <label>半径: <span id="radius-value">${
              this.options.defaultBrush?.radius ?? 50
          }</span>m</label>
          <input type="range" id="radius" min="1" max="1000" value="${
              this.options.defaultBrush?.radius ?? 50
          }">
        </div>

        <div class="panel-section">
          <label>硬度: <span id="hardness-value">${(
              (this.options.defaultBrush?.hardness ?? 0.5) * 100
          ).toFixed(0)}</span>%</label>
          <input type="range" id="hardness" min="0" max="100" value="${
              (this.options.defaultBrush?.hardness ?? 0.5) * 100
          }">
        </div>

        <div class="panel-section dynamic-param" id="height-delta-section">
          <label>高度变化: <span id="height-delta-value">${
              this.options.defaultBrush?.heightDelta ?? 10
          }</span>m</label>
          <input type="range" id="height-delta" min="-100" max="100" value="${
              this.options.defaultBrush?.heightDelta ?? 10
          }">
        </div>

        <div class="panel-section dynamic-param" id="strength-section" style="display: none;">
          <label>强度: <span id="strength-value">${(
              (this.options.defaultBrush?.strength ?? 0.5) * 100
          ).toFixed(0)}</span>%</label>
          <input type="range" id="strength" min="0" max="100" value="${
              (this.options.defaultBrush?.strength ?? 0.5) * 100
          }">
        </div>

        <div class="panel-section dynamic-param" id="target-altitude-section" style="display: none;">
          <label>目标高度: <span id="target-altitude-value">${
              this.options.defaultBrush?.targetAltitude ?? 100
          }</span>m</label>
          <input type="range" id="target-altitude" min="0" max="1000" value="${
              this.options.defaultBrush?.targetAltitude ?? 100
          }">
        </div>

        <div class="panel-section dynamic-param" id="scale-section" style="display: none;">
          <label>缩放: <span id="scale-value">${
              this.options.defaultBrush?.scale ?? 8
          }</span></label>
          <input type="range" id="scale" min="1" max="100" value="${
              this.options.defaultBrush?.scale ?? 8
          }">
        </div>

        <div class="panel-section">
          <div class="action-buttons">
            <button id="clear-btn" class="action-btn secondary">清除操作</button>
            <button id="export-json-btn" class="action-btn primary">导出JSON</button>
            <button id="export-clipboard-btn" class="action-btn primary">复制到剪贴板</button>
          </div>
        </div>
      </div>
    `;

        this.cacheElements();
        this.updateDynamicParams();
    }

    private cacheElements(): void {
        const elements = [
            "toggle-btn",
            "radius",
            "hardness",
            "height-delta",
            "strength",
            "target-altitude",
            "scale",
            "radius-value",
            "hardness-value",
            "height-delta-value",
            "strength-value",
            "target-altitude-value",
            "scale-value",
            "clear-btn",
            "export-json-btn",
            "export-clipboard-btn",
            "operation-count"
        ];

        elements.forEach(id => {
            const el = this.container.querySelector(`#${id}`);
            if (el) {
                this.elements.set(id, el as HTMLElement);
            }
        });
    }

    private bindEvents(): void {
        this.bindBrushTypeButtons();
        this.bindSliders();
        this.bindActionButtons();
    }

    private bindBrushTypeButtons(): void {
        const buttons = this.container.querySelectorAll(".brush-btn");
        buttons.forEach(btn => {
            btn.addEventListener("click", () => {
                buttons.forEach(b => b.classList.remove("active"));
                btn.classList.add("active");

                const brushType = btn.getAttribute("data-brush") as BrushType;
                this.currentBrushType = brushType;
                this.updateDynamicParams();

                this.notifyBrushChange();
            });
        });
    }

    private bindSliders(): void {
        const sliders = [
            "radius",
            "hardness",
            "height-delta",
            "strength",
            "target-altitude",
            "scale"
        ];

        sliders.forEach(id => {
            const slider = this.elements.get(id) as HTMLInputElement;
            const valueDisplay = this.elements.get(`${id}-value`) as HTMLElement;

            if (slider && valueDisplay) {
                slider.addEventListener("input", () => {
                    let value = parseFloat(slider.value);

                    if (id === "hardness" || id === "strength") {
                        valueDisplay.textContent = value.toFixed(0) + "%";
                        value = value / 100;
                    } else {
                        valueDisplay.textContent = value.toString();
                    }

                    this.notifyBrushChange();
                });
            }
        });
    }

    private bindActionButtons(): void {
        const toggleBtn = this.elements.get("toggle-btn");
        const clearBtn = this.elements.get("clear-btn");
        const exportJsonBtn = this.elements.get("export-json-btn");
        const exportClipboardBtn = this.elements.get("export-clipboard-btn");

        toggleBtn?.addEventListener("click", () => {
            this.isEnabled = !this.isEnabled;
            this.updateToggleButton();

            if (this.options.onToggle) {
                this.options.onToggle(this.isEnabled);
            }
        });

        clearBtn?.addEventListener("click", () => {
            if (confirm("确定要清除所有操作吗？")) {
                this.options.onClear();
            }
        });

        exportJsonBtn?.addEventListener("click", () => {
            this.options.onExport("json");
        });

        exportClipboardBtn?.addEventListener("click", () => {
            this.options.onExport("clipboard");
        });
    }

    private updateDynamicParams(): void {
        const sections = [
            "height-delta-section",
            "strength-section",
            "target-altitude-section",
            "scale-section"
        ];

        sections.forEach(sectionId => {
            const section = this.container.querySelector(`#${sectionId}`) as HTMLElement;
            if (section) {
                section.style.display = "none";
            }
        });

        switch (this.currentBrushType) {
            case BrushType.RAISE:
            case BrushType.LOWER:
                this.showSection("height-delta-section");
                break;
            case BrushType.SMOOTH:
                this.showSection("strength-section");
                break;
            case BrushType.FLATTEN:
                this.showSection("target-altitude-section");
                break;
            case BrushType.NOISE:
                this.showSection("strength-section");
                this.showSection("scale-section");
                break;
            case BrushType.ERODE:
                this.showSection("strength-section");
                break;
        }
    }

    private showSection(sectionId: string): void {
        const section = this.container.querySelector(`#${sectionId}`) as HTMLElement;
        if (section) {
            section.style.display = "block";
        }
    }

    private notifyBrushChange(): void {
        const radius = parseFloat((this.elements.get("radius") as HTMLInputElement)?.value ?? "50");
        const hardness =
            parseFloat((this.elements.get("hardness") as HTMLInputElement)?.value ?? "50") / 100;
        const heightDelta = parseFloat(
            (this.elements.get("height-delta") as HTMLInputElement)?.value ?? "10"
        );
        const strength =
            parseFloat((this.elements.get("strength") as HTMLInputElement)?.value ?? "50") / 100;
        const targetAltitude = parseFloat(
            (this.elements.get("target-altitude") as HTMLInputElement)?.value ?? "100"
        );
        const scale = parseFloat((this.elements.get("scale") as HTMLInputElement)?.value ?? "8");

        this.options.onBrushChange({
            type: this.currentBrushType,
            radius,
            hardness,
            heightDelta,
            strength,
            targetAltitude,
            scale
        });
    }

    updateOperationCount(count: number): void {
        const el = this.elements.get("operation-count");
        if (el) {
            el.textContent = `操作数: ${count}`;
        }
    }

    setEnabledState(enabled: boolean): void {
        this.isEnabled = enabled;
        this.updateToggleButton();
    }

    private updateToggleButton(): void {
        const toggleBtn = this.elements.get("toggle-btn") as HTMLButtonElement;
        if (toggleBtn) {
            if (this.isEnabled) {
                toggleBtn.textContent = "禁用";
                toggleBtn.classList.add("active");
            } else {
                toggleBtn.textContent = "启用";
                toggleBtn.classList.remove("active");
            }
        }
    }
}
