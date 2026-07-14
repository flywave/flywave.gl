/* Copyright (C) 2025 flywave.gl contributors */

import { type GeoCoordinates } from "@flywave/flywave-geoutils";
import { type MapView } from "@flywave/flywave-mapview";
import * as THREE from "three";
import { Line2NodeMaterial } from "three/webgpu";
import { Line2 } from "three/examples/jsm/lines/webgpu/Line2.js";
import { WindowEventHandler } from "@flywave/flywave-utils";

import { DrawLine } from "./DrawLine";

export class MeasureLine extends DrawLine {
    private arrowLines: Line2[] = [];
    private ndcVertexs: THREE.Vector3[] = [];
    private distance: number = 0;

    constructor(
        mapView: MapView,
        vertices: GeoCoordinates[] = [],
        windowHandler: WindowEventHandler,
        id?: string
    ) {
        super(mapView, vertices, windowHandler, id);

        this.updateMeasureDisplay();
    }

    protected onCameraPositionChanged(): void {
        this.vertices.map((geo, index) => {
            const v = this.mapView.getScreenPosition(geo);
            if (!this.ndcVertexs[index]) this.ndcVertexs[index] = new THREE.Vector3();
            this.ndcVertexs[index].set(
                v.x / this.mapView.canvas.width,
                v.y / this.mapView.canvas.height,
                0
            );
        });
    }

    public update(): void {
        super.update();
        this.updateMeasureDisplay();
    }

    private updateMeasureDisplay(): void {
        if (!this.vertices || this.vertices.length < 2) {
            if (this.arrowLines && this.arrowLines.length > 0) {
                this.arrowLines.forEach(arrow => {
                    arrow.visible = false;
                });
            }
            return;
        }

        this.distance = this.calculateDistance();

        this.ndcVertexs = this.vertices.map(geo => {
            const v = this.mapView.getScreenPosition(geo);
            return new THREE.Vector3(
                v.x / this.mapView.canvas.width,
                v.y / this.mapView.canvas.height,
                0
            );
        });
    }

    private calculateDistance(): number {
        if (!this.vertices || this.vertices.length < 2) {
            return 0;
        }

        let totalDistance = 0;
        for (let i = 1; i < this.vertices.length; i++) {
            const prevVertex = this.vertices[i - 1];
            const currentVertex = this.vertices[i];
            totalDistance += this.calculateSegmentDistance(prevVertex, currentVertex);
        }

        return totalDistance;
    }

    private calculateSegmentDistance(point1: GeoCoordinates, point2: GeoCoordinates): number {
        const R = 6371e3;
        const lat1 = (point1.latitude * Math.PI) / 180;
        const lat2 = (point2.latitude * Math.PI) / 180;
        const deltaLat = ((point2.latitude - point1.latitude) * Math.PI) / 180;
        const deltaLon = ((point2.longitude - point1.longitude) * Math.PI) / 180;

        const a =
            Math.sin(deltaLat / 2) * Math.sin(deltaLat / 2) +
            Math.cos(lat1) * Math.cos(lat2) * Math.sin(deltaLon / 2) * Math.sin(deltaLon / 2);
        const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

        return R * c;
    }

    public formatDistance(distance: number): string {
        if (distance < 1) {
            return `${(distance * 100).toFixed(1)} cm`;
        } else if (distance < 1000) {
            return `${distance.toFixed(1)} m`;
        } else {
            return `${(distance / 1000).toFixed(2)} km`;
        }
    }

    protected updateVisuals(): void {
        super.updateVisuals();

        if (this.arrowLines && this.arrowLines.length > 0) {
            this.arrowLines.forEach(arrow => {
                arrow.visible = true;
            });
        }
    }

    protected createLineMaterial(color: number, linewidth: number): Line2NodeMaterial {
        return new Line2NodeMaterial({
            color: 0x000000,
            linewidth: 2,
            dashed: true,
            dashSize: 0.5,
            gapSize: 0.3,
            transparent: true,
            depthTest: false,
            depthWrite: false,
            alphaToCoverage: true
        });
    }

    protected createOutlineMaterial(): Line2NodeMaterial {
        return new Line2NodeMaterial({
            color: 0xffffff,
            linewidth: 2,
            dashed: true,
            dashSize: 0.8,
            gapSize: 0.4,
            transparent: true,
            opacity: 0.8,
            depthTest: false,
            depthWrite: false
        });
    }

    public getDistance(): number {
        return this.distance;
    }

    public dispose(): void {
        if (this.arrowLines && this.arrowLines.length > 0) {
            this.arrowLines.forEach(arrow => {
                this.remove(arrow);
                arrow.geometry.dispose();
                (arrow.material as THREE.Material).dispose();
            });
            this.arrowLines = [];
        }

        super.dispose();
    }
}
