/* Copyright (C) 2025 flywave.gl contributors */

// src/HeightHandle.ts
import * as THREE from "three";

import { FixedSizeArrow } from "./FixedSizeArrow";

export class HeightHandle extends THREE.Object3D {
    public isVisible: boolean = false;
    public isHovered: boolean = false;
    public isActive: boolean = false;

    private readonly arrow: FixedSizeArrow;

    // Add screen space size property
    private readonly pixelSize: number = 32; // Target screen size (pixels)

    constructor() {
        super();

        // Create fixed size arrow
        this.arrow = new FixedSizeArrow({
            size: this.pixelSize,
            headColor: 0x00ff00,
            shaftColor: 0x00ff00,
            visible: false,
            opacity: 1.0
        });

        this.arrow.renderOrder = 10;
        this.add(this.arrow);

        // Disable raycasting to avoid interfering with interactions of other objects
        this.raycast = () => {};
        (this.arrow as any).raycast = () => {};

        this.visible = false;
    }

    // Set visibility
    public setVisible(visible: boolean): void {
        this.isVisible = visible;
        this.visible = visible;
        this.arrow.visible = visible;

        if (visible) {
            this.updateAppearance();
            this.setOpacity(0.8); // Ensure sufficient transparency
        } else {
            this.setOpacity(0);
        }
    }

    // Update size (maintain fixed screen size based on camera distance)
    public updateSize(camera: THREE.Camera, renderer?: THREE.WebGLRenderer): void {
        this.arrow.updateSize(camera, renderer);
    }

    // Set hover state
    public setHoverState(hovered: boolean): void {
        this.isHovered = hovered;
        this.updateAppearance();
    }

    // Set active state
    public setActiveState(active: boolean): void {
        this.isActive = active;
        this.updateAppearance();
    }

    // Update appearance
    private updateAppearance(): void {
        let headColor: number;
        let shaftColor: number;
        let opacity: number;

        if (this.isActive) {
            headColor = 0xffff00; // Active state: yellow
            shaftColor = 0xffff00;
            opacity = 1.0;
        } else if (this.isHovered) {
            headColor = 0x00ffff; // Hover state: cyan
            shaftColor = 0x00ffff;
            opacity = 0.9;
        } else {
            headColor = 0x00ff00; // Normal state: green
            shaftColor = 0x00ff00;
            opacity = 0.8;
        }

        // Update arrow material
        this.arrow.setHeadColor(headColor);
        this.arrow.setShaftColor(shaftColor);
        this.arrow.setOpacity(opacity);
    }

    // Set opacity
    private setOpacity(opacity: number): void {
        this.arrow.setOpacity(opacity);
    }

    // Check interaction (using precise geometry detection)
    public checkIntersection(raycaster: THREE.Raycaster, camera: THREE.Camera): boolean {
        if (!this.isVisible) return false;

        // Use raycasting to detect arrow
        const intersects = [];

        raycaster.intersectObject(this.arrow, true, intersects);

        return intersects.length > 0;
    }

    // Override dispose method
    public dispose(): void {
        this.arrow.dispose();
        this.removeFromParent();
    }

    // Add method to set direction
    public setDirection(normal: THREE.Vector3): void {
        // Calculate rotation from default direction (0,1,0) to target direction
        const defaultDirection = new THREE.Vector3(0, 1, 0);
        const quaternion = new THREE.Quaternion();

        // If normal is not a zero vector
        if (normal.length() > 0) {
            normal.normalize();
            // Calculate rotation quaternion
            quaternion.setFromUnitVectors(defaultDirection, normal);
        } else {
            // If normal is a zero vector, keep default direction
            quaternion.set(0, 0, 0, 1);
        }

        // Apply rotation
        this.quaternion.copy(quaternion);
    }

    // Get arrow direction
    public getDirection(): THREE.Vector3 {
        const direction = new THREE.Vector3(0, 1, 0);
        direction.applyQuaternion(this.quaternion);
        return direction;
    }
}
