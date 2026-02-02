/* Copyright (C) 2025 flywave.gl contributors */

import { BrushType } from "@flywave/flywave-terrain-datasource";
import type { BrushConfig } from "../types";
import { GUI } from "dat.gui";

export interface TerrainToolsGUIOptions {
    onBrushChange: (brush: Partial<BrushConfig>) => void;
    onExport: (format: "json" | "clipboard") => void;
    onClear: () => void;
    onToggle?: (enabled: boolean) => void;
    defaultBrush?: Partial<BrushConfig>;
}

export class TerrainToolsGUI {
    private gui: GUI;
    private options: TerrainToolsGUIOptions;
    private currentBrushType: BrushType = BrushType.RAISE;
    private isEnabled: boolean = false;
    private operationCount: number = 0;
    private params: any = {};

    private brushTypeNames = {
        [BrushType.RAISE]: "抬升",
        [BrushType.LOWER]: "降低",
        [BrushType.SMOOTH]: "平滑",
        [BrushType.FLATTEN]: "平整",
        [BrushType.NOISE]: "噪声",
        [BrushType.ERODE]: "侵蚀"
    };

    constructor(options: TerrainToolsGUIOptions) {
        this.options = options;
        this.params = {
            enabled: false,
            brushType: BrushType.RAISE,
            radius: options.defaultBrush?.radius ?? 50,
            hardness: (options.defaultBrush?.hardness ?? 0.5) * 100,
            heightDelta: options.defaultBrush?.heightDelta ?? 10,
            strength: (options.defaultBrush?.strength ?? 0.5) * 100,
            targetAltitude: options.defaultBrush?.targetAltitude ?? 100,
            scale: options.defaultBrush?.scale ?? 8,
            persistence: (options.defaultBrush?.persistence ?? 0.5) * 100,
            operationCount: 0,
            exportJSON: () => this.handleExport("json"),
            exportClipboard: () => this.handleExport("clipboard"),
            clear: () => this.handleClear()
        };

        this.gui = new GUI({ width: 300 });
        this.gui.domElement.style.position = "fixed";
        this.gui.domElement.style.top = "10px";
        this.gui.domElement.style.right = "10px";
        this.setupGUI();
    }

    private setupGUI(): void {
        // 控制面板
        const controlFolder = this.gui.addFolder("🎮 地形修改工具");

        controlFolder
            .add(this.params, "enabled")
            .name("启用工具")
            .onChange((value: boolean) => {
                this.isEnabled = value;
                if (this.options.onToggle) {
                    this.options.onToggle(value);
                }
            });

        controlFolder.add(this.params, "operationCount").name("操作数").listen();

        controlFolder.open();

        // 笔刷类型面板
        const brushTypeFolder = this.gui.addFolder("🖌️ 笔刷类型");
        const brushTypes = [
            { name: "⬆️ 抬升", value: BrushType.RAISE },
            { name: "⬇️ 降低", value: BrushType.LOWER },
            { name: "〰️ 平滑", value: BrushType.SMOOTH },
            { name: "➖ 平整", value: BrushType.FLATTEN },
            { name: "🎲 噪声", value: BrushType.NOISE },
            { name: "💧 侵蚀", value: BrushType.ERODE }
        ];

        brushTypeFolder
            .add(
                this.params,
                "brushType",
                brushTypes.map(t => t.value)
            )
            .name("类型")
            .onChange((value: BrushType) => {
                this.currentBrushType = value;
                this.updateParamsVisibility();
                this.notifyBrushChange();
            });

        brushTypeFolder.open();

        // 基础参数面板
        const basicParamsFolder = this.gui.addFolder("📐 基础参数");

        basicParamsFolder
            .add(this.params, "radius", 1, 1000)
            .name("半径 (m)")
            .onChange(() => this.notifyBrushChange());

        basicParamsFolder
            .add(this.params, "hardness", 0, 100)
            .name("硬度 (%)")
            .onChange(() => this.notifyBrushChange());

        basicParamsFolder.open();

        // 高度变化面板
        const heightDeltaFolder = this.gui.addFolder("📏 高度变化");
        this.heightDeltaController = heightDeltaFolder
            .add(this.params, "heightDelta", -100, 100)
            .name("高度 (m)")
            .onChange(() => this.notifyBrushChange());

        // 强度面板
        const strengthFolder = this.gui.addFolder("💪 强度");
        this.strengthController = strengthFolder
            .add(this.params, "strength", 0, 100)
            .name("强度 (%)")
            .onChange(() => this.notifyBrushChange());

        // 目标高度面板
        const targetAltitudeFolder = this.gui.addFolder("🎯 目标高度");
        this.targetAltitudeController = targetAltitudeFolder
            .add(this.params, "targetAltitude", 0, 1000)
            .name("高度 (m)")
            .onChange(() => this.notifyBrushChange());

        // 缩放面板
        const scaleFolder = this.gui.addFolder("📊 缩放");
        this.scaleController = scaleFolder
            .add(this.params, "scale", 1, 100)
            .name("缩放")
            .onChange(() => this.notifyBrushChange());

        // 持久性面板
        const persistenceFolder = this.gui.addFolder("🔁 持久性");
        this.persistenceController = persistenceFolder
            .add(this.params, "persistence", 0, 100)
            .name("持久性 (%)")
            .onChange(() => this.notifyBrushChange());

        // 操作面板
        const actionFolder = this.gui.addFolder("🔧 操作");

        actionFolder.add(this.params, "exportJSON").name("导出 JSON");

        actionFolder.add(this.params, "exportClipboard").name("复制到剪贴板");

        actionFolder.add(this.params, "clear").name("清除操作");

        actionFolder.open();

        // 初始化参数可见性
        this.updateParamsVisibility();
    }

    private heightDeltaController: any;
    private strengthController: any;
    private targetAltitudeController: any;
    private scaleController: any;
    private persistenceController: any;

    private updateParamsVisibility(): void {
        const brushType = this.currentBrushType;

        // 隐藏所有特定参数
        this.heightDeltaController.show(false);
        this.strengthController.show(false);
        this.targetAltitudeController.show(false);
        this.scaleController.show(false);
        this.persistenceController.show(false);

        // 根据笔刷类型显示相应参数
        switch (brushType) {
            case BrushType.RAISE:
            case BrushType.LOWER:
                this.heightDeltaController.show(true);
                break;
            case BrushType.SMOOTH:
                this.strengthController.show(true);
                break;
            case BrushType.FLATTEN:
                this.targetAltitudeController.show(true);
                break;
            case BrushType.NOISE:
                this.strengthController.show(true);
                this.scaleController.show(true);
                this.persistenceController.show(true);
                break;
            case BrushType.ERODE:
                this.strengthController.show(true);
                break;
        }
    }

    private notifyBrushChange(): void {
        this.options.onBrushChange({
            type: this.currentBrushType,
            radius: this.params.radius,
            hardness: this.params.hardness / 100,
            heightDelta: this.params.heightDelta,
            strength: this.params.strength / 100,
            targetAltitude: this.params.targetAltitude,
            scale: this.params.scale,
            persistence: this.params.persistence / 100
        });
    }

    private handleExport(format: "json" | "clipboard"): void {
        this.options.onExport(format);
    }

    private handleClear(): void {
        if (confirm("确定要清除所有操作吗？")) {
            this.options.onClear();
        }
    }

    updateOperationCount(count: number): void {
        this.operationCount = count;
        this.params.operationCount = count;
    }

    setEnabledState(enabled: boolean): void {
        this.isEnabled = enabled;
        this.params.enabled = enabled;
    }

    public getGUI(): GUI {
        return this.gui;
    }

    public dispose(): void {
        this.gui.destroy();
    }
}
