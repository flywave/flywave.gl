/* Copyright (C) 2025 flywave.gl contributors */

import { TerrainControlPoint } from "../core/TerrainControlPoint";
import { ControlPointConfigUI } from "./ControlPointConfigUI";

export class TerrainControlPointUI {
    private configUI: ControlPointConfigUI;

    constructor() {
        this.configUI = new ControlPointConfigUI({
            width: 300
        });
    }

    public show(point: TerrainControlPoint): void {
        this.configUI.show(point);
    }

    public hide(): void {
        this.configUI.hide();
    }

    public getPoint(): TerrainControlPoint | null {
        return null;
    }

    public dispose(): void {
        this.configUI.dispose();
    }
}
