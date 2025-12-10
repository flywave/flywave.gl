/* Copyright (C) 2025 flywave.gl contributors */

import { type MapView } from "@flywave/flywave-mapview";
import { type GUI } from "dat.gui";

export interface AnimationData {
    animating: boolean;
    animationCount: number;
    frameNumber: number;
}

export class AnimationModule {
    private readonly mapView: MapView;

    constructor(mapView: MapView) {
        this.mapView = mapView;
    }

    setupFolder(gui: GUI): GUI {
        return gui.addFolder("🎬 Animation");
    }

    createData(): AnimationData {
        return {
            animating: false,
            animationCount: 0,
            frameNumber: 0
        };
    }

    updateData(data: AnimationData): void {
        // Accessing private properties through casting
        const mapView = this.mapView as any;
        data.animating = mapView.animating || false;
        data.animationCount = mapView.m_animationCount || 0;
        data.frameNumber = mapView.m_frameNumber || 0;
    }

    bindControls(folder: GUI, data: AnimationData): void {
        folder.add(data, "animating").name("Animating").listen();
        folder.add(data, "animationCount").name("Animation Count").listen();
        folder.add(data, "frameNumber").name("Frame Number").listen();
    }
}
