/* Copyright (C) 2025 flywave.gl contributors */

import { GeoCoordinates } from "@flywave/flywave-geoutils";
import { type MapView, MapViewEventNames } from "@flywave/flywave-mapview";
import * as THREE from "three";

export abstract class DrawableObject extends THREE.Object3D {
    public isSelected: boolean = false;
    public isEditing: boolean = false;
    protected mapView: MapView;
    protected outlineObject: THREE.Object3D | null = null;
    protected vertices: GeoCoordinates[] = [];

    constructor(mapView: MapView, id?: string) {
        super();
        this.mapView = mapView;

        mapView.addEventListener(
            MapViewEventNames.CameraPositionChanged,
            this.doCameraPositionChanged
        );
    }

    private doCameraPositionChanged = () => {
        this.onCameraPositionChanged();
    };

    protected onCameraPositionChanged() {}

    protected abstract createOutlineObject(): void;
    public abstract setVertexSelected(index: number, selected: boolean): void;
    public abstract getVertexSelected(index: number): boolean;
    public abstract update(): void;
    public abstract toGeoJSON(): any;

    /**
     * Update vertex position
     * @param index - Vertex index
     * @param newVertex - New vertex coordinates
     */
    public abstract updateVertex(index: number, newVertex: GeoCoordinates): void;

    /**
     * Move the entire object to a new position
     * @param newPosition - New position coordinates
     */
    public abstract moveTo(newPosition: GeoCoordinates): void;

    /**
     * Get the center point coordinates of the object
     * @returns Center point coordinates of the object
     */
    public abstract getCenter(): GeoCoordinates;

    /**
     * Get THREE.js object
     * @returns THREE.Object3D instance
     */
    public getObject3D(): THREE.Object3D {
        return this;
    }

    /**
     * Set object vertices
     * @param vertices - Vertex coordinate array
     */
    public setVertices(vertices: GeoCoordinates[]): void {
        this.vertices = vertices;
        this.update();
    }

    /**
     * Get object vertices
     * @returns Vertex coordinate array
     */
    public getVertices(): GeoCoordinates[] {
        return this.vertices;
    }

    /**
     * Add vertex
     * @param vertex - Vertex coordinates to add
     */
    public addVertex(vertex: GeoCoordinates): void {
        this.vertices.push(vertex);
        this.update();
    }

    /**
     * Remove vertex
     * @param index - Index of vertex to remove
     */
    public removeVertex(index: number): void {
        if (index >= 0 && index < this.vertices.length) {
            this.vertices.splice(index, 1);
            this.update();
        }
    }

    /**
     * Set object selection state
     * @param selected - Whether selected
     */
    public setSelected(selected: boolean): void {
        // Special selection state management to avoid accidental resets during dragging
        if (this.isSelected !== selected) {
            this.isSelected = selected;
            this.updateVisuals();
        }
    }

    /**
     * Set object editing state
     * @param editing - Whether in editing state
     */
    public setEditing(editing: boolean): void {
        if (this.isEditing !== editing) {
            this.isEditing = editing;
            this.updateVisuals();
        }
    }

    /**
     * Get object selection state
     * @returns Whether selected
     */
    public getSelected(): boolean {
        return this.isSelected;
    }

    /**
     * Get object editing state
     * @returns Whether in editing state
     */
    public getEditing(): boolean {
        return this.isEditing;
    }

    /**
     * Update object state
     * @param isSelected - Whether selected
     * @param isEditing - Whether in editing state
     */
    public updateState(isSelected: boolean, isEditing: boolean): void {
        const needsUpdate = this.isSelected !== isSelected || this.isEditing !== isEditing;

        this.isSelected = isSelected;
        this.isEditing = isEditing;

        if (needsUpdate) {
            this.updateVisuals();
        }
    }

    protected abstract updateVisuals(): void;

    /**
     * Release object resources
     */
    public dispose(): void {
        this.mapView.removeEventListener(
            MapViewEventNames.CameraPositionChanged,
            this.doCameraPositionChanged
        );
        if (this.outlineObject) {
            this.remove(this.outlineObject);
            // Only clean up the geometry and material of the outline
            if ((this.outlineObject as any).geometry) {
                (this.outlineObject as any).geometry.dispose();
            }
            if ((this.outlineObject as any).material) {
                if (Array.isArray((this.outlineObject as any).material)) {
                    (this.outlineObject as any).material.forEach((mat: THREE.Material) => {
                        mat.dispose();
                    });
                } else {
                    ((this.outlineObject as any).material as THREE.Material).dispose();
                }
            }
        }
        this.removeFromParent();
        // Clean up other resources
    }

    /**
     * Create vertices from coordinate array
     * @param coordinates - Coordinate array
     * @returns GeoCoordinates array
     */
    protected static createVerticesFromCoordinates(coordinates: any[]): GeoCoordinates[] {
        return coordinates.map(coord => {
            if (Array.isArray(coord) && coord.length >= 2) {
                return new GeoCoordinates(
                    coord[1], // latitude
                    coord[0], // longitude
                    coord[2] || 0 // altitude
                );
            }
            return new GeoCoordinates(0, 0);
        });
    }
}
