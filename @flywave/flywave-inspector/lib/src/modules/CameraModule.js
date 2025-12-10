/* Copyright (C) 2025 flywave.gl contributors */
export class CameraModule {
    constructor(mapView) {
        this.mapView = mapView;
    }
    setupFolder(gui) {
        return gui.addFolder("📷 Camera");
    }
    createData() {
        return {
            position: "0,0,0",
            target: "0,0,0",
            zoom: 0,
            tilt: 0,
            heading: 0,
            far: 0,
            near: 0
        };
    }
    updateData(data) {
        const camera = this.mapView.camera;
        const target = this.mapView.target;
        const zoom = this.mapView.zoomLevel;
        const tilt = this.mapView.tilt;
        const heading = this.mapView.heading;
        // Position
        data.position = `${camera.position.x.toFixed(2)},${camera.position.y.toFixed(2)},${camera.position.z.toFixed(2)}`;
        // Target
        data.target = `${target.latitude.toFixed(6)},${target.longitude.toFixed(6)},${target.altitude?.toFixed(2) || 0}`;
        // Zoom level
        data.zoom = Math.round(zoom * 100) / 100;
        // Tilt and heading
        data.tilt = Math.round(tilt * 100) / 100;
        data.heading = Math.round(heading * 100) / 100;
        // Near and far planes
        data.near = Math.round(camera.near * 100) / 100;
        data.far = Math.round(camera.far * 100) / 100;
    }
    bindControls(folder, data) {
        folder.add(data, "position").name("Position").listen();
        folder.add(data, "target").name("Target").listen();
        folder.add(data, "zoom").name("Zoom Level").listen();
        folder.add(data, "tilt").name("Tilt").listen();
        folder.add(data, "heading").name("Heading").listen();
        folder.add(data, "near").name("Near Plane").listen();
        folder.add(data, "far").name("Far Plane").listen();
    }
}
//# sourceMappingURL=CameraModule.js.map