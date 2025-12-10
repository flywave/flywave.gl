/* Copyright (C) 2025 flywave.gl contributors */
export class AnimationModule {
    constructor(mapView) {
        this.mapView = mapView;
    }
    setupFolder(gui) {
        return gui.addFolder("🎬 Animation");
    }
    createData() {
        return {
            animating: false,
            animationCount: 0,
            frameNumber: 0
        };
    }
    updateData(data) {
        // Accessing private properties through casting
        const mapView = this.mapView;
        data.animating = mapView.animating || false;
        data.animationCount = mapView.m_animationCount || 0;
        data.frameNumber = mapView.m_frameNumber || 0;
    }
    bindControls(folder, data) {
        folder.add(data, "animating").name("Animating").listen();
        folder.add(data, "animationCount").name("Animation Count").listen();
        folder.add(data, "frameNumber").name("Frame Number").listen();
    }
}
//# sourceMappingURL=AnimationModule.js.map