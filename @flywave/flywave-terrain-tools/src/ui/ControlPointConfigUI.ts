/* Copyright (C) 2025 flywave.gl contributors */

import { TerrainControlPoint, type TerrainControlPointConfig } from "../core/TerrainControlPoint";
import { GUI } from "dat.gui";

export interface ControlPointConfigUIOptions {
    width?: number;
    autoPlace?: boolean;
}

export class ControlPointConfigUI {
    private gui: GUI;
    private currentPoint: TerrainControlPoint | null = null;
    private params: any = {};
    private controllers: Map<string, any> = new Map();

    constructor(options: ControlPointConfigUIOptions = {}) {
        const guiOptions: any = {};
        if (options.width) guiOptions.width = options.width;
        if (options.autoPlace !== undefined) guiOptions.autoPlace = options.autoPlace;

        this.gui = new GUI(guiOptions);
        this.gui.domElement.style.position = "fixed";
        this.gui.domElement.style.top = "10px";
        this.gui.domElement.style.left = "10px";
        this.gui.close();

        this.createBaseFolder();
    }

    private createBaseFolder(): void {
        const infoFolder = this.gui.addFolder("📍 控制点信息");

        this.params.pointInfo = {
            id: "未选中",
            position: { lat: 0, lon: 0, alt: 0 }
        };

        infoFolder.add(this.params.pointInfo, "id").name("ID").listen();
        infoFolder.add(this.params.pointInfo.position, "lat").name("纬度").listen();
        infoFolder.add(this.params.pointInfo.position, "lon").name("经度").listen();
        infoFolder.add(this.params.pointInfo.position, "alt").name("高度(m)").listen();
        infoFolder.close();
    }

    private updatePointInfo(): void {
        if (this.currentPoint) {
            this.params.pointInfo.id = this.currentPoint.id.toString();
            this.params.pointInfo.position.lat = this.currentPoint.geoPosition.latitude.toFixed(6);
            this.params.pointInfo.position.lon = this.currentPoint.geoPosition.longitude.toFixed(6);
            this.params.pointInfo.position.alt = (
                this.currentPoint.geoPosition.altitude || 0
            ).toFixed(2);
        } else {
            this.params.pointInfo.id = "未选中";
            this.params.pointInfo.position.lat = 0;
            this.params.pointInfo.position.lon = 0;
            this.params.pointInfo.position.alt = 0;
        }
    }

    public show(point: TerrainControlPoint): void {
        this.currentPoint = point;
        this.clearControllers();
        this.updatePointInfo();

        this.params.config = point.getConfig();

        const configFolder = this.gui.addFolder("⚙️ 参数配置");

        const brushTypes = [
            { name: "⬆️ 抬升", value: "raise" },
            { name: "⬇️ 降低", value: "lower" },
            { name: "〰️ 平滑", value: "smooth" },
            { name: "➖ 压平", value: "flatten" },
            { name: "🎲 噪声", value: "noise" },
            { name: "💧 侵蚀", value: "erode" }
        ];

        const brushTypeController = configFolder
            .add(
                this.params.config,
                "brushType",
                brushTypes.map(t => t.value)
            )
            .name("笔刷类型")
            .onChange((value: string) => {
                if (this.currentPoint) {
                    this.currentPoint.setConfig({ brushType: value as any });
                    this.updateDynamicFields(configFolder);
                }
            });
        this.controllers.set("brushType", brushTypeController);

        configFolder
            .add(this.params.config, "radius", 10, 500)
            .name("半径(m)")
            .onChange((value: number) => {
                if (this.currentPoint) {
                    this.currentPoint.setConfig({ radius: value });
                }
            });

        configFolder
            .add(this.params.config, "hardness", 0, 1, 0.05)
            .name("硬度")
            .onChange((value: number) => {
                if (this.currentPoint) {
                    this.currentPoint.setConfig({ hardness: value });
                }
            });

        configFolder
            .add(this.params.config, "heightDelta", -100, 100)
            .name("高度变化(m)")
            .onChange((value: number) => {
                if (this.currentPoint) {
                    this.currentPoint.setConfig({ heightDelta: value });
                }
            });

        configFolder
            .add(this.params.config, "strength", 0, 1, 0.05)
            .name("强度")
            .onChange((value: number) => {
                if (this.currentPoint) {
                    this.currentPoint.setConfig({ strength: value });
                }
            });

        configFolder
            .add(this.params.config, "targetAltitude", 0, 1000)
            .name("目标高度(m)")
            .onChange((value: number) => {
                if (this.currentPoint) {
                    this.currentPoint.setConfig({ targetAltitude: value });
                }
            });

        configFolder
            .add(this.params.config, "scale", 1, 100)
            .name("缩放")
            .onChange((value: number) => {
                if (this.currentPoint) {
                    this.currentPoint.setConfig({ scale: value });
                }
            });

        configFolder
            .add(this.params.config, "persistence", 0, 1, 0.05)
            .name("持久性")
            .onChange((value: number) => {
                if (this.currentPoint) {
                    this.currentPoint.setConfig({ persistence: value });
                }
            });

        this.updateDynamicFields(configFolder);

        const actionsFolder = this.gui.addFolder("🔧 操作");
        const actions = {
            delete: () => {
                if (this.currentPoint) {
                    this.currentPoint = null;
                    this.hide();
                    window.dispatchEvent(new CustomEvent("controlPointDelete"));
                }
            }
        };

        actionsFolder.add(actions, "delete").name("🗑️ 删除控制点");

        this.gui.open();
    }

    private updateDynamicFields(folder: GUI): void {
        const brushType = this.params.config.brushType;

        const heightDeltaController = this.controllers.get("heightDelta");
        const strengthController = this.controllers.get("strength");
        const targetAltitudeController = this.controllers.get("targetAltitude");
        const scaleController = this.controllers.get("scale");
        const persistenceController = this.controllers.get("persistence");

        switch (brushType) {
            case "raise":
            case "lower":
                if (heightDeltaController) heightDeltaController.show();
                if (strengthController) strengthController.hide();
                if (targetAltitudeController) targetAltitudeController.hide();
                if (scaleController) scaleController.hide();
                if (persistenceController) persistenceController.hide();
                break;
            case "smooth":
                if (heightDeltaController) heightDeltaController.hide();
                if (strengthController) strengthController.show();
                if (targetAltitudeController) targetAltitudeController.hide();
                if (scaleController) scaleController.hide();
                if (persistenceController) persistenceController.hide();
                break;
            case "flatten":
                if (heightDeltaController) heightDeltaController.hide();
                if (strengthController) strengthController.hide();
                if (targetAltitudeController) targetAltitudeController.show();
                if (scaleController) scaleController.hide();
                if (persistenceController) persistenceController.hide();
                break;
            case "noise":
                if (heightDeltaController) heightDeltaController.hide();
                if (strengthController) strengthController.show();
                if (targetAltitudeController) targetAltitudeController.hide();
                if (scaleController) scaleController.show();
                if (persistenceController) persistenceController.show();
                break;
            case "erode":
                if (heightDeltaController) heightDeltaController.hide();
                if (strengthController) strengthController.show();
                if (targetAltitudeController) targetAltitudeController.hide();
                if (scaleController) scaleController.hide();
                if (persistenceController) persistenceController.hide();
                break;
        }
    }

    public hide(): void {
        this.currentPoint = null;
        this.clearControllers();
        this.updatePointInfo();
        this.gui.close();
    }

    public refresh(): void {
        if (this.currentPoint) {
            this.show(this.currentPoint);
        }
    }

    private clearControllers(): void {
        const folders = this.gui.__folders;
        for (const key in folders) {
            if (key !== "📍 控制点信息") {
                folders[key].destroy();
                delete folders[key];
            }
        }
        this.controllers.clear();
    }

    public dispose(): void {
        this.gui.destroy();
    }
}
