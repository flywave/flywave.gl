/* Copyright (C) 2025 flywave.gl contributors */

import { type GeoCoordinates } from "@flywave/flywave-geoutils";
import { type MapView } from "@flywave/flywave-mapview";
import * as THREE from "three";
import { Line2 } from "three/examples/jsm/lines/Line2";
import { LineMaterial } from "three/examples/jsm/lines/LineMaterial";

import { DrawLine } from "./DrawLine";

/**
 * Measurement line class
 * Adds measurement display functionality to ordinary lines, including distance labels and arrows
 */
export class MeasureLine extends DrawLine {
    private arrowLines: Line2[] = [];
    private ndcVertexs: THREE.Vector3[] = [];
    private distance: number = 0;

    constructor(mapView: MapView, vertices: GeoCoordinates[] = [], id?: string) {
        super(mapView, vertices, id);

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

    /**
     * 更新测量显示
     */
    public update(): void {
        // Call parent class update method
        super.update();

        // Update measurement display
        this.updateMeasureDisplay();
    }

    /**
     * 更新测量显示元素
     */
    private updateMeasureDisplay(): void {
        if (!this.vertices || this.vertices.length < 2) {
            // If vertex count is less than 2, hide arrows
            if (this.arrowLines && this.arrowLines.length > 0) {
                this.arrowLines.forEach(arrow => {
                    arrow.visible = false;
                });
            }
            return;
        }

        // Calculate distance
        this.distance = this.calculateDistance();

        this.ndcVertexs = this.vertices.map(geo => {
            const v = this.mapView.getScreenPosition(geo);
            return new THREE.Vector3(
                v.x / this.mapView.canvas.width,
                v.y / this.mapView.canvas.height,
                0
            );
        });

        // Note: Label display has been moved to MeasureToolControls for unified management
    }

    /**
     * Calculate total distance of line segment
     * @returns Distance (meters)
     */
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

    /**
     * Calculate distance between two points
     * @param point1 First point
     * @param point2 Second point
     * @returns Distance (meters)
     */
    private calculateSegmentDistance(point1: GeoCoordinates, point2: GeoCoordinates): number {
        // Use Haversine formula to calculate distance between two points on Earth's surface
        const R = 6371e3; // Earth radius (meters)
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

    /**
     * Format distance display
     * @param distance Distance (meters)
     * @returns Formatted distance string
     */
    public formatDistance(distance: number): string {
        if (distance < 1) {
            return `${(distance * 100).toFixed(1)} cm`;
        } else if (distance < 1000) {
            return `${distance.toFixed(1)} m`;
        } else {
            return `${(distance / 1000).toFixed(2)} km`;
        }
    }

    /**
     * Override parent class update visual effects method
     */
    protected updateVisuals(): void {
        // Call parent class method
        super.updateVisuals();

        // Update arrow visibility - always visible
        if (this.arrowLines && this.arrowLines.length > 0) {
            this.arrowLines.forEach(arrow => {
                arrow.visible = true;
            });
        }
    }

    /**
     * Override parent class line material creation method to make measurement lines use dashed blue style
     */
    protected createLineMaterial(color: number, linewidth: number): LineMaterial {
        return new LineMaterial({
            color: 0x000000, // Blue
            linewidth: 2,
            dashed: true, // Dashed
            dashSize: 0.5,
            gapSize: 0.3,
            depthTest: false,
            depthWrite: false,

            opacity: 1.0,
            transparent: true,
            alphaToCoverage: true
        });
    }

    /**
     * Override parent class outline material creation method to make outline lines use dashed blue style
     */
    protected createOutlineMaterial(): LineMaterial {
        return new LineMaterial({
            color: 0xffffff, // White outline
            linewidth: 2,
            dashed: true,
            dashSize: 0.8,
            gapSize: 0.4,
            depthTest: false,
            depthWrite: false,
            transparent: true,
            opacity: 0.8
        });
    }

    /**
     * Get measurement distance
     * @returns Distance (meters)
     */
    public getDistance(): number {
        return this.distance;
    }

    /**
     * Release resources
     */
    public dispose(): void {
        // Clean up arrow lines
        if (this.arrowLines && this.arrowLines.length > 0) {
            this.arrowLines.forEach(arrow => {
                this.remove(arrow);
                arrow.geometry.dispose();
                (arrow.material as THREE.Material).dispose();
            });
            this.arrowLines = [];
        }

        // Call parent class cleanup method
        super.dispose();
    }
}
