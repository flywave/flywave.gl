/* Copyright (C) 2025 flywave.gl contributors */

import { type MapView } from "@flywave/flywave-mapview";
import { type GUI } from "dat.gui";

export interface RenderingData {
    drawCalls: number;
    triangles: number;
    points: number;
    lines: number;
    geometries: number;
    textures: number;
}

export class RenderingModule {
    private readonly mapView: MapView;

    constructor(mapView: MapView) {
        this.mapView = mapView;
    }

    setupFolder(gui: GUI): GUI {
        return gui.addFolder("🎨 Rendering");
    }

    createData(): RenderingData {
        return {
            drawCalls: 0,
            triangles: 0,
            points: 0,
            lines: 0,
            geometries: 0,
            textures: 0
        };
    }

    updateData(data: RenderingData): void {
        const renderer = this.mapView.renderer;
        const info = renderer.info;

        if (info.render) {
            data.drawCalls = info.render.calls || 0;
            data.triangles = info.render.triangles || 0;
            data.points = info.render.points || 0;
            data.lines = info.render.lines || 0;
        }

        if (info.memory) {
            data.geometries = info.memory.geometries || 0;
            data.textures = info.memory.textures || 0;
        }
    }

    bindControls(folder: GUI, data: RenderingData): void {
        folder.add(data, "drawCalls").name("Draw Calls").listen();
        folder.add(data, "triangles").name("Triangles").listen();
        folder.add(data, "points").name("Points").listen();
        folder.add(data, "lines").name("Lines").listen();
        folder.add(data, "geometries").name("Geometries").listen();
        folder.add(data, "textures").name("Textures").listen();
    }
}
