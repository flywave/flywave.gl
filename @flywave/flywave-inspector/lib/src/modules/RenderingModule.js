/* Copyright (C) 2025 flywave.gl contributors */
export class RenderingModule {
    constructor(mapView) {
        this.mapView = mapView;
    }
    setupFolder(gui) {
        return gui.addFolder("🎨 Rendering");
    }
    createData() {
        return {
            drawCalls: 0,
            triangles: 0,
            points: 0,
            lines: 0,
            geometries: 0,
            textures: 0
        };
    }
    updateData(data) {
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
    bindControls(folder, data) {
        folder.add(data, "drawCalls").name("Draw Calls").listen();
        folder.add(data, "triangles").name("Triangles").listen();
        folder.add(data, "points").name("Points").listen();
        folder.add(data, "lines").name("Lines").listen();
        folder.add(data, "geometries").name("Geometries").listen();
        folder.add(data, "textures").name("Textures").listen();
    }
}
//# sourceMappingURL=RenderingModule.js.map