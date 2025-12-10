/* Copyright (C) 2025 flywave.gl contributors */

// src/PointObject.ts
import { GeoCoordinates } from "@flywave/flywave-geoutils";
import { type MapView } from "@flywave/flywave-mapview";
import * as THREE from "three";

import { DrawableObject } from "./DrawableObject";

// Texture cache
const textureCache = new Map<string, THREE.Texture>();

export class PointObject extends DrawableObject {
    private readonly sprite: THREE.Sprite;
    private spriteMaterial: THREE.SpriteMaterial;
    private readonly ringMesh: THREE.Mesh;
    public isVertex: boolean;
    private readonly baseColor: number;

    constructor(
        mapView: MapView,
        position: GeoCoordinates,
        isVertex: boolean = false,
        id?: string
    ) {
        super(mapView, id);
        this.vertices = [position];
        this.isVertex = isVertex;
        this.baseColor = isVertex ? 0xff6b6b : 0x4ecdc4;

        // Create sprite material and sprite
        this.spriteMaterial = this.createSpriteMaterial(this.baseColor, false, isVertex, false);
        this.sprite = new THREE.Sprite(this.spriteMaterial);

        // Add identifier to object
        this.userData.isVertex = isVertex;
        this.userData.isVertexPoint = true;

        // Set sprite size (half size)
        const scale = isVertex ? 0.008 : 0.015;
        this.sprite.scale.set(scale, scale, 1);
        this.sprite.renderOrder = 100;

        // Create selection ring (only regular points have selection rings)
        if (!isVertex) {
            const ringGeometry = new THREE.RingGeometry(1.5, 1.7, 32);
            const ringMaterial = new THREE.MeshBasicMaterial({
                color: 0xffff00,
                transparent: true,
                opacity: 0,
                side: THREE.DoubleSide,
                depthTest: false
            });
            this.ringMesh = new THREE.Mesh(ringGeometry, ringMaterial);
            this.ringMesh.rotation.x = Math.PI / 2;
            this.ringMesh.renderOrder = 99;
            this.add(this.ringMesh);
        }

        this.add(this.sprite);
        this.update();
    }

    // Create sprite material
    private createSpriteMaterial(
        color: number,
        isSelected: boolean = false,
        isVertex: boolean = false,
        isEditing: boolean = false
    ): THREE.SpriteMaterial {
        const texture = this.createPointTexture(color, isSelected, isVertex, isEditing);
        return new THREE.SpriteMaterial({
            map: texture,
            color: 0xffffff,
            transparent: true,
            opacity: 1.0,
            sizeAttenuation: false,
            depthTest: false,
            depthWrite: false
        });
    }

    // Change texture creation method to overloadable method
    protected createPointTexture(
        color: number,
        isSelected: boolean = false,
        isVertex: boolean = false,
        isEditing: boolean = false
    ): THREE.Texture {
        const cacheKey = `${color}-${isSelected}-${isVertex}-${isEditing}`;

        if (textureCache.has(cacheKey)) {
            return textureCache.get(cacheKey)!;
        }

        const canvas = document.createElement("canvas");
        const baseSize = isVertex ? 64 : 80;
        const size = isSelected || isEditing ? baseSize * 1.3 : baseSize;
        canvas.width = size;
        canvas.height = size;
        const context = canvas.getContext("2d")!;

        // Clear background
        context.clearRect(0, 0, size, size);

        const center = size / 2;

        // Selected state - Yellow concentric circles (two-ring design)
        if (isSelected) {
            // Outer ring - Yellow circle
            context.strokeStyle = "#ffd700"; // Gold
            context.lineWidth = size / 8;
            context.beginPath();
            context.arc(center, center, size / 2 - size / 16, 0, Math.PI * 2);
            context.stroke();

            // Inner ring - Yellow circle
            context.strokeStyle = "#ffd700"; // Gold
            context.lineWidth = size / 8;
            context.beginPath();
            context.arc(center, center, size / 4, 0, Math.PI * 2);
            context.stroke();
        }

        // Editing state - Yellow concentric circles (two-ring design)
        else if (isEditing) {
            // Outer ring - Orange-yellow circle
            context.strokeStyle = "#ffa500"; // Orange
            context.lineWidth = size / 8;
            context.beginPath();
            context.arc(center, center, size / 2 - size / 16, 0, Math.PI * 2);
            context.stroke();

            // Inner ring - Orange-yellow circle
            context.strokeStyle = "#ffa500"; // Orange
            context.lineWidth = size / 8;
            context.beginPath();
            context.arc(center, center, size / 4, 0, Math.PI * 2);
            context.stroke();
        }

        // Default state - Yellow concentric circles (two-ring design)
        else {
            // Outer ring - Yellow circle
            context.strokeStyle = "#ffff00"; // Yellow
            context.lineWidth = size / 8;
            context.beginPath();
            context.arc(center, center, size / 2 - size / 16, 0, Math.PI * 2);
            context.stroke();

            // Inner ring - Yellow circle
            context.strokeStyle = "#ffff00"; // Yellow
            context.lineWidth = size / 8;
            context.beginPath();
            context.arc(center, center, size / 4, 0, Math.PI * 2);
            context.stroke();
        }

        // Create texture
        const texture = new THREE.CanvasTexture(canvas);
        textureCache.set(cacheKey, texture);

        return texture;
    }

    // Implement base class abstract method
    protected createOutlineObject(): void {
        // Point objects do not need outlines
    }

    protected updateOutline(): void {
        // Point objects do not need outline updates
    }

    public updateVertex(index: number, newVertex: GeoCoordinates): void {
        if (index === 0 && this.vertices.length > 0) {
            this.vertices[0] = newVertex;
            this.update();
        }
    }

    public moveTo(newPosition: GeoCoordinates): void {
        if (this.vertices.length > 0) {
            this.vertices[0] = new GeoCoordinates(
                newPosition.latitude,
                newPosition.longitude,
                newPosition.altitude || this.vertices[0].altitude
            );
            this.update();
        }
    }

    public getCenter(): GeoCoordinates {
        return this.vertices.length > 0 ? this.vertices[0] : new GeoCoordinates(0, 0);
    }

    public update(): void {
        if (this.vertices.length > 0) {
            const position = this.mapView.projection.projectPoint(
                this.vertices[0],
                new THREE.Vector3()
            );
            this.position.copy(position);
        }
    }

    protected updateVisuals(): void {
        // Recreate material based on selection and editing state
        let displayColor = this.baseColor;

        if (this.isSelected) {
            displayColor = 0x00ff00;
        } else if (this.isEditing) {
            displayColor = 0xffff00;
        }

        const oldMaterial = this.spriteMaterial;
        this.spriteMaterial = this.createSpriteMaterial(
            displayColor,
            this.isSelected,
            this.isVertex,
            this.isEditing
        );
        this.sprite.material = this.spriteMaterial;

        // Clean up old material
        oldMaterial.dispose();

        // Update selection ring visibility (only for regular points)
        if (!this.isVertex && this.ringMesh) {
            (this.ringMesh.material as THREE.MeshBasicMaterial).opacity = this.isSelected ? 0.8 : 0;
        }
    }

    // Add hover state update method with state protection
    public updateHoverState(isHovered: boolean): void {
        // State protection logic: Only allow clearing highlight hover state when vertex is not selected
        if (!isHovered && this.isSelected) {
            return; // Maintain selected state, do not clear highlight
        }

        // Only process hover effects when not in selected state
        if (!this.isSelected) {
            // Hover effects can be added here, but do not affect selected state
            // For example, slight size changes or color changes
        }
    }

    // Implement base class abstract method
    public toGeoJSON(): any {
        return {
            type: "Point",
            coordinates: [
                this.vertices[0].longitude,
                this.vertices[0].latitude,
                this.vertices[0].altitude || 0
            ]
        };
    }

    // Vertex selection method implementation
    public setVertexSelected(index: number, selected: boolean): void {
        if (index === 0) {
            this.setSelected(selected);
        }
    }

    public getVertexSelected(index: number): boolean {
        return index === 0 ? this.isSelected : false;
    }

    // Height-related methods
    public setHeight(height: number): void {
        if (this.vertices.length > 0) {
            this.vertices[0].altitude = height;
            this.update();
        }
    }

    public getHeight(): number {
        return this.vertices.length > 0 ? this.vertices[0].altitude || 0 : 0;
    }

    // Edit state control
    public setEditing(editing: boolean): void {
        this.isEditing = editing;
        this.updateVisuals();
    }

    public getEditing(): boolean {
        return this.isEditing;
    }

    // Get material (for external access)
    get material(): THREE.SpriteMaterial {
        return this.spriteMaterial;
    }

    // Static method: Create point object from GeoJSON
    public static fromGeoJSON(mapView: MapView, geoJson: any, id?: string): PointObject | null {
        if (!geoJson || geoJson.type !== "Point" || !geoJson.coordinates) {
            return null;
        }

        try {
            const coordinates = geoJson.coordinates;
            const position = new GeoCoordinates(
                coordinates[1],
                coordinates[0],
                coordinates[2] || 0
            );

            return new PointObject(mapView, position, false, id);
        } catch (error) {
            console.error("Error creating PointObject from GeoJSON:", error);
            return null;
        }
    }

    public dispose(): void {
        // Clean up sprite material
        this.spriteMaterial.dispose();

        // Clean up selection ring
        if (!this.isVertex && this.ringMesh) {
            this.ringMesh.geometry.dispose();
            (this.ringMesh.material as THREE.Material).dispose();
        }

        // Remove from parent object
        this.removeFromParent();

        // Call base class dispose method
        super.dispose();
    }
}

// Utility function to clean up texture cache
export const clearPointTextureCache = (): void => {
    textureCache.forEach(texture => {
        texture.dispose();
    });
    textureCache.clear();
};
