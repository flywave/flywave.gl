/* Copyright (C) 2025 flywave.gl contributors */

import { type GeoCoordinates } from "@flywave/flywave-geoutils";
import { type MapControls } from "@flywave/flywave-map-controls";
import {
    type MapView,
    LoadingState,
    MapViewEventNames,
    TextElement
} from "@flywave/flywave-mapview";
import {
    FontUnit,
    HorizontalAlignment,
    TextLayoutStyle,
    TextRenderStyle,
    VerticalAlignment
} from "@flywave/flywave-text-canvas";
import * as THREE from "three";

import { type DrawableObject } from "./DrawableObject";
import { type DrawEvent, DrawEventNames } from "./DrawEventNames";
import { DrawLine } from "./DrawLine";
import { DrawMode } from "./DrawMode";
import { MapDrawControls } from "./MapDrawControls";
import { MeasureLine } from "./MeasureLine";
import { PointObject } from "./PointObject";

/**
 * Camera position change event interface
 */
interface CameraPositionChangedEvent {
    type: MapViewEventNames.CameraPositionChanged;
    latitude: number;
    longitude: number;
    altitude: number;
    yaw: number;
    pitch: number;
    roll: number;
    tilt: number;
    heading: number;
    zoom: number;
}

/**
 * Measurement tool control class
 * Used to create and manage measurement lines
 */
export class MeasureToolControls extends MapDrawControls {
    // Unified management of labels for all measurement lines
    private readonly measureLabels = new Map<MeasureLine, TextElement>();
    // Temporary measurement line label (used for real-time display during drawing)
    private tempMeasureLabel: TextElement | null = null;
    // Store current distance values of measurement lines to determine if text needs updating
    private readonly measureLineDistances = new Map<MeasureLine, number>();

    constructor(mapView: MapView, mapControls: MapControls) {
        super(mapView, mapControls);
        // Add camera position change listener to handle label updates
        this.mapView.addEventListener(
            MapViewEventNames.CameraPositionChanged,
            this.onCameraPositionChanged
        );

        // Add draw completion listener to handle label updates
        this.addEventListener(DrawEventNames.DRAW_END, this.onDrawEnd);

        // Add object modification listener to handle label updates
        this.addEventListener(DrawEventNames.OBJECT_MODIFIED, this.onObjectModified);

        // Add object removal listener to handle label cleanup
        this.addEventListener(DrawEventNames.OBJECT_REMOVED, this.onObjectRemoved);
    }

    public override setMode(mode: DrawMode): this {
        super.setMode(DrawMode.LINE);
        return this;
    }

    toggleMeasureMode(): void {
        this.setMode(DrawMode.LINE);
    }

    /**
     * Override point object creation method, use standard point object
     */
    protected createPointObject(
        mapView: MapView,
        position: GeoCoordinates,
        isVertex: boolean = false,
        id?: string
    ): PointObject {
        return new PointObject(mapView, position, isVertex, id);
    }

    /**
     * Override line object creation method, use measurement line object
     */
    protected createDrawLine(
        mapView: MapView,
        vertices: GeoCoordinates[],
        id?: string
    ): MeasureLine {
        return new MeasureLine(mapView, vertices, id);
    }

    /**
     * Create a measurement line object
     * @param vertices Vertex coordinate array
     * @returns MeasureLine instance
     */
    public createMeasureLine(vertices: GeoCoordinates[]): MeasureLine {
        return new MeasureLine(this.mapView, vertices);
    }

    /**
     * Create a measurement line from an existing line object
     * @param line Existing line object
     * @returns MeasureLine instance
     */
    public createMeasureLineFromLine(line: DrawableObject): MeasureLine | null {
        try {
            const vertices = line.getVertices();
            if (vertices.length >= 2) {
                const measureLine = new MeasureLine(this.mapView, vertices);

                // Copy properties from the original object
                measureLine.setSelected(line.getSelected());
                measureLine.setEditing(line.getEditing());

                return measureLine;
            }
        } catch (error) {
            console.error("Error creating measure line from existing line:", error);
        }

        return null;
    }

    /**
     * Get all measurement line objects
     * @returns MeasureLine object array
     */
    public getMeasureLines(): MeasureLine[] {
        return Array.from(this.getObjects()).filter(
            obj => obj instanceof MeasureLine
        ) as MeasureLine[];
    }

    /**
     * Get the total distance of the measurement line
     * @param measureLine Measurement line object
     * @returns Total distance (meters)
     */
    public getMeasureLineDistance(measureLine: MeasureLine): number {
        return measureLine.getDistance();
    }

    /**
     * Update the display of all measurement lines
     */
    public updateMeasureLines(): void {
        this.getMeasureLines().forEach(line => {
            line.update();
        });
        // Update all label displays
        this.updateMeasureLabels();
    }

    /**
     * Override parent class drawing preview update method, add real-time distance update
     */
    protected override updateDrawingPreview(event: MouseEvent): void {
        // Call parent class method
        super.updateDrawingPreview(event);

        // Update temporary measurement label (may need to recreate label)
        this.updateTempMeasureLabel();
    }

    /**
     * Update measurement line label display
     */
    protected override updateMeasureLabels(): void {
        // Collect labels that need to be added
        const labelsToAdd: TextElement[] = [];
        let labelsUpdated = false;

        // Create or update labels for each measurement line
        this.getMeasureLines().forEach(measureLine => {
            const label = this.measureLabels.get(measureLine);
            const currentDistance = measureLine.getDistance();
            const storedDistance = this.measureLineDistances.get(measureLine);

            // Check if label needs updating (distance has changed)
            if (
                !label ||
                storedDistance === undefined ||
                Math.abs(currentDistance - storedDistance) > 0.1
            ) {
                // If label doesn't exist or distance has changed, create new label
                const newLabel = this.createMeasureLabel(measureLine);
                if (newLabel) {
                    // If old label exists, remove it first
                    if (label) {
                        // Remove reference to old label
                        this.measureLabels.delete(measureLine);
                    }
                    // Add new label
                    this.measureLabels.set(measureLine, newLabel);
                    this.measureLineDistances.set(measureLine, currentDistance);
                    labelsToAdd.push(newLabel);
                    labelsUpdated = true;
                }
            } else {
                // Label exists and distance hasn't changed, only update coordinates
                if (label) {
                    this.updateTextLabelPositions(label, measureLine.getVertices());
                }
            }
        });

        // Only re-add to map view when labels have updates
        if (labelsUpdated) {
            // Collect all labels (including unchanged ones)
            const allLabels: TextElement[] = [];

            // Add all permanent measurement line labels
            this.measureLabels.forEach(label => {
                allLabels.push(label);
            });

            // Add temporary label
            if (this.tempMeasureLabel) {
                allLabels.push(this.tempMeasureLabel);
            }

            // Clear all existing labels
            this.mapView.clearOverlayText();

            // Batch add all labels to map view
            if (allLabels.length > 0) {
                this.mapView.addOverlayText(allLabels);
            }
        }
    }

    /**
     * Update temporary measurement label (for real-time display during drawing)
     */
    private updateTempMeasureLabel(): void {
        // Get vertices of temporary object
        const vertices = this.getTempVertices();

        // Remove vertex count check, even with only one point it should be displayed
        if (!vertices) {
            // Clear temporary label
            if (this.tempMeasureLabel) {
                // Collect all labels that need to be displayed (including permanent labels)
                const labelsToShow: TextElement[] = [];

                // Add permanent measurement line labels
                this.measureLabels.forEach(label => {
                    labelsToShow.push(label);
                });

                // First clear all existing labels
                this.mapView.clearOverlayText();

                // Re-add permanent labels
                if (labelsToShow.length > 0) {
                    this.mapView.addOverlayText(labelsToShow);
                }

                this.tempMeasureLabel = null;
            }
            return;
        }

        // Get temporary object, get all vertices from it (including temporary vertices at mouse position)
        const tempObject = this.getTempObject();
        let allVertices = vertices;

        // If there is a temporary object and it is a line object, get all its vertices
        if (tempObject && (tempObject instanceof DrawLine || tempObject instanceof MeasureLine)) {
            allVertices = tempObject.getVertices();
        }

        // Calculate total distance
        const distance = this.calculateTotalDistance(allVertices);
        // Even if distance is 0, should still update display

        // Format distance display
        const distanceText = this.formatDistance(distance);

        // Check if temporary label text needs updating
        if (this.tempMeasureLabel && this.tempMeasureLabel.text !== distanceText) {
            // Text has changed, need to recreate label
            // Create new temporary label
            this.tempMeasureLabel = this.createTempMeasureLabel(distanceText, allVertices);

            // Collect all labels that need to be displayed
            const labelsToShow: TextElement[] = [];

            // Add permanent measurement line labels
            this.measureLabels.forEach(label => {
                labelsToShow.push(label);
            });

            // Add temporary label
            if (this.tempMeasureLabel) {
                labelsToShow.push(this.tempMeasureLabel);
            }

            // First clear all existing labels
            this.mapView.clearOverlayText();

            // Batch add labels to map view
            if (labelsToShow.length > 0) {
                this.mapView.addOverlayText(labelsToShow);
            }
        } else if (this.tempMeasureLabel) {
            // Text unchanged, only update position
            this.updateTextLabelPositions(this.tempMeasureLabel, allVertices);
        } else {
            // Create temporary label
            this.tempMeasureLabel = this.createTempMeasureLabel(distanceText, allVertices);
            if (this.tempMeasureLabel) {
                // Collect all labels that need to be displayed
                const labelsToShow: TextElement[] = [];

                // Add permanent measurement line labels
                this.measureLabels.forEach(label => {
                    labelsToShow.push(label);
                });

                // Add temporary label
                labelsToShow.push(this.tempMeasureLabel);

                // First clear all existing labels
                this.mapView.clearOverlayText();

                // Batch add labels to map view
                if (labelsToShow.length > 0) {
                    this.mapView.addOverlayText(labelsToShow);
                }
            }
        }
    }

    /**
     * Get temporary vertices (simulate accessing parent class private properties)
     */
    protected override getTempVertices(): GeoCoordinates[] {
        // Use protected method provided by parent class to get temporary vertices
        // Remove isDrawing check to ensure vertices can be obtained in all cases
        return super.getTempVertices();
    }

    /**
     * Create temporary measurement label
     * @param distanceText Distance text
     * @param vertices Vertex coordinates
     * @returns TextElement label object
     */
    private createTempMeasureLabel(
        distanceText: string,
        vertices: GeoCoordinates[]
    ): TextElement | null {
        // Convert vertices to NDC coordinates (initial coordinates)
        const ndcVertices: THREE.Vector3[] = vertices.map(geo => {
            const v = this.mapView.getScreenPosition(geo);
            return new THREE.Vector3(
                v.x / this.mapView.canvas.width,
                v.y / this.mapView.canvas.height,
                0
            );
        });

        // Create text rendering style
        const renderStyle = new TextRenderStyle({
            fontSize: {
                unit: FontUnit.Pixel,
                size: 24,
                backgroundSize: 4 // Add background size
            },
            color: new THREE.Color(0x0000ff), // Blue text
            backgroundColor: new THREE.Color(0xffffff), // White background
            backgroundOpacity: 1.0, // Opaque background
            opacity: 1.0
        });

        // Create text layout style
        const layoutStyle = new TextLayoutStyle({
            horizontalAlignment: HorizontalAlignment.Center,
            verticalAlignment: VerticalAlignment.Center
        });

        try {
            // Create label
            const label = new TextElement(distanceText, ndcVertices, renderStyle, layoutStyle);

            return label;
        } catch (error) {
            console.error("Error creating TextElement:", error);
            return null;
        }
    }

    /**
     * Camera position change event handling
     */
    private onCameraPositionChanged = (event: CameraPositionChangedEvent): void => {
        // Only update measurement label coordinates, do not recreate labels
        this.updateMeasureLabelPositions();
        // Only update temporary measurement label coordinates, do not recreate labels
        this.updateTempMeasureLabelPositions();
    }

    /**
     * Update measurement label coordinates (only update coordinates, do not recreate labels)
     */
    private updateMeasureLabelPositions(): void {
        // Update label coordinates for each measurement line
        this.getMeasureLines().forEach(measureLine => {
            const label = this.measureLabels.get(measureLine);
            if (label) {
                // Update label vertex coordinates
                this.updateTextLabelPositions(label, measureLine.getVertices());
            }
        });
    }

    /**
     * Update temporary measurement label coordinates
     */
    private updateTempMeasureLabelPositions(): void {
        // Update temporary label coordinates
        if (this.tempMeasureLabel) {
            // Get vertices of temporary object
            const vertices = this.getTempVertices();
            if (vertices) {
                // Get temporary object, get all vertices from it (including temporary vertices at mouse position)
                const tempObject = this.getTempObject();
                let allVertices = vertices;

                // If there is a temporary object and it is a line object, get all its vertices
                if (
                    tempObject &&
                    (tempObject instanceof DrawLine || tempObject instanceof MeasureLine)
                ) {
                    allVertices = tempObject.getVertices();
                }

                // Update label vertex coordinates
                this.updateTextLabelPositions(this.tempMeasureLabel, allVertices);
            }
        }
    }

    /**
     * Update vertex coordinates of text label
     * @param label Text label
     * @param vertices Vertex coordinates
     */
    private updateTextLabelPositions(label: TextElement, vertices: GeoCoordinates[]): void {
        if (!vertices) {
            return;
        }

        // Convert vertices to NDC coordinates (need to recalculate every frame)
        const ndcVertices: THREE.Vector3[] = vertices.map(geo => {
            const v = this.mapView.getScreenPosition(geo);
            return new THREE.Vector3(
                v.x / this.mapView.canvas.width,
                v.y / this.mapView.canvas.height,
                0
            );
        });

        // Update label vertex coordinates
        if (label.path) {
            // For path labels, update all vertices
            for (let i = 0; i < Math.min(label.path.length, ndcVertices.length); i++) {
                label.path[i].copy(ndcVertices[i]);
            }
        } else {
            // For point labels, update position
            if (ndcVertices.length > 0) {
                label.position.copy(ndcVertices[0]);
            }
        }

        // Trigger text renderer update
        this.mapView.textElementsRenderer.invalidateCache();
    }

    /**
     * Create label for measurement line
     * @param measureLine Measurement line object
     * @returns TextElement label object
     */
    private createMeasureLabel(measureLine: MeasureLine): TextElement | null {
        // Get vertices and distance of measurement line
        const vertices = measureLine.getVertices();
        // Remove vertex count check, even if there is only one point, the label should be displayed
        if (!vertices) {
            return null;
        }

        // Get distance
        const distance = measureLine.getDistance();
        // Remove distance check, even if distance is 0, the label should be displayed

        // Format distance display
        const distanceText = this.formatDistance(distance);

        // Convert vertices to NDC coordinates (initial coordinates)
        const ndcVertices: THREE.Vector3[] = vertices.map(geo => {
            const v = this.mapView.getScreenPosition(geo);
            return new THREE.Vector3(
                v.x / this.mapView.canvas.width,
                v.y / this.mapView.canvas.height,
                0
            );
        });

        // Create text rendering style
        const renderStyle = new TextRenderStyle({
            fontSize: {
                unit: FontUnit.Pixel,
                size: 24,
                backgroundSize: 4 // Add background size
            },
            color: new THREE.Color(0x0000ff), // Blue text
            backgroundColor: new THREE.Color(0xffffff), // White background
            backgroundOpacity: 1.0, // Opaque background
            opacity: 1.0
        });

        // Create text layout style
        const layoutStyle = new TextLayoutStyle({
            horizontalAlignment: HorizontalAlignment.Center,
            verticalAlignment: VerticalAlignment.Center
        });

        try {
            // Create label
            const label = new TextElement(distanceText, ndcVertices, renderStyle, layoutStyle);

            return label;
        } catch (error) {
            console.error("Error creating TextElement:", error);
            return null;
        }
    }

    /**
     * Calculate total distance of line segment
     * @param vertices Vertex array
     * @returns Distance (meters)
     */
    private calculateTotalDistance(vertices: GeoCoordinates[]): number {
        // Remove vertex count check, even if there is only one point, the distance should be calculated (0 distance)
        if (!vertices) {
            return 0;
        }

        // If there is only one point, return 0 distance
        if (vertices.length < 2) {
            return 0;
        }

        let totalDistance = 0;
        for (let i = 1; i < vertices.length; i++) {
            const prevVertex = vertices[i - 1];
            const currentVertex = vertices[i];
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
    private formatDistance(distance: number): string {
        if (distance <= 0) {
            // If distance is 0 or negative, display 0 m
            return `0 m`;
        } else if (distance < 1) {
            return `${(distance * 100).toFixed(1)} cm`;
        } else if (distance < 1000) {
            return `${distance.toFixed(1)} m`;
        } else {
            return `${(distance / 1000).toFixed(2)} km`;
        }
    }

    /**
     * Trigger label update (for subclass override)
     * @protected
     */
    protected override triggerLabelUpdate(): void {
        this.updateTempMeasureLabel();
    }

    /**
     * Override parent class dispose method, clean up label resources
     */
    public override dispose(): void {
        // Clean up measurement labels
        if (this.measureLabels.size > 0 || this.tempMeasureLabel) {
            this.mapView.clearOverlayText();
            this.measureLabels.clear();
            this.tempMeasureLabel = null;
        }

        // Clean up measurement line distance cache
        this.measureLineDistances.clear();

        // Remove event listeners
        this.mapView.removeEventListener(
            MapViewEventNames.CameraPositionChanged,
            this.onCameraPositionChanged
        );

        // Remove other event listeners
        this.removeEventListener(DrawEventNames.DRAW_END, this.onDrawEnd);
        this.removeEventListener(DrawEventNames.OBJECT_MODIFIED, this.onObjectModified);

        // Call parent class cleanup method
        super.dispose();
        this.mapView.textElementsRenderer.clearOverlayText();
    }

    /**
     * Drawing completion event handling
     */
    private onDrawEnd = (event: DrawEvent): void => {
        // Clean up temporary labels
        if (this.tempMeasureLabel) {
            this.tempMeasureLabel = null;
        }

        // Update all measurement labels (may need to recreate labels)
        this.updateMeasureLabels();
    }

    /**
     * Object modification event handling
     */
    private onObjectModified = (event: DrawEvent): void => {
        // Update all measurement labels (may need to recreate labels)
        this.updateMeasureLabels();
    }

    /**
     * Object removal event handling
     */
    private onObjectRemoved(event: DrawEvent): void {
        if (event.object && event.object instanceof MeasureLine) {
            // Unconditionally delete from mapping (regardless of existence)
            this.measureLabels.delete(event.object);
            this.measureLineDistances.delete(event.object);

            // Immediately clear all labels from map view and re-add remaining labels
            this.mapView.clearOverlayText();

            // Collect remaining labels
            const remainingLabels: TextElement[] = [];
            this.measureLabels.forEach(l => remainingLabels.push(l));
            if (this.tempMeasureLabel) {
                remainingLabels.push(this.tempMeasureLabel);
            }

            // Re-add remaining labels
            if (remainingLabels.length > 0) {
                this.mapView.addOverlayText(remainingLabels);
            }
        }
    }
}
