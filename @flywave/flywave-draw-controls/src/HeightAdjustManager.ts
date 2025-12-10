/* Copyright (C) 2025 flywave.gl contributors */

// src/HeightAdjustManager.ts
import { ProjectionType } from "@flywave/flywave-geoutils";
import { type MapView } from "@flywave/flywave-mapview";
import * as THREE from "three";

import { HeightHandle } from "./HeightHandle";
import { type PointObject } from "./PointObject";

export class HeightAdjustManager extends THREE.Object3D {
    private readonly mapView: MapView;
    private readonly heightHandle: HeightHandle;
    private currentPoint: PointObject | null = null;
    private isAdjusting: boolean = false;
    private readonly startPoint: THREE.Vector2 = new THREE.Vector2();
    private startHeight: number = 0;
    private readonly adjustmentPlane: THREE.Plane = new THREE.Plane();
    private readonly startIntersection: THREE.Vector3 = new THREE.Vector3();

    // Add event callback
    private readonly onHeightChanged?: (point: PointObject, newHeight: number) => void;

    constructor(
        mapView: MapView,
        onHeightChanged?: (point: PointObject, newHeight: number) => void
    ) {
        super();
        this.mapView = mapView;
        this.onHeightChanged = onHeightChanged;
        this.heightHandle = new HeightHandle();

        // Add height handle to manager
        this.add(this.heightHandle);

        // Set render order
        this.renderOrder = 1000;
    }

    // Modify attachToPoint method
    public attachToPoint(point: PointObject): void {
        this.currentPoint = point;

        // Update handle position - use point's world coordinates
        const worldPos = this.mapView.projection.projectPoint(point.getCenter());

        // Set handle direction based on projection type
        if (this.mapView.projection.type === ProjectionType.Spherical) {
            // In spherical projection, use surface normal as handle direction
            const normal = this.mapView.projection.surfaceNormal(worldPos, new THREE.Vector3());
            this.heightHandle.setDirection(normal);
        } else {
            // In planar projection, keep handle along positive Y-axis
            this.heightHandle.setDirection(new THREE.Vector3(0, 0, 1));
        }

        // Update handle size
        this.heightHandle.updateSize(this.mapView.camera, this.mapView.renderer);

        // Show handle
        this.heightHandle.setVisible(true);
        this.heightHandle.setHoverState(false);
        this.heightHandle.setActiveState(false);

        // Force update once
        this.update();
    }

    // Add method to get current vertex height
    public getCurrentVertexHeight(): number | null {
        return this.currentPoint ? this.currentPoint.getHeight() : null;
    }

    // Add method to set current vertex height
    public setCurrentVertexHeight(height: number): void {
        if (this.currentPoint) {
            this.currentPoint.setHeight(height);
        }
    }

    // Detach current point
    public detach(): void {
        this.currentPoint = null;
        this.heightHandle.setVisible(false);
        this.heightHandle.setHoverState(false);
        this.heightHandle.setActiveState(false);
        this.isAdjusting = false;
    }

    // Check interaction
    public checkInteraction(mousePoint: THREE.Vector2): boolean {
        if (!this.currentPoint) return false;

        const raycaster = new THREE.Raycaster();
        raycaster.setFromCamera(mousePoint, this.mapView.getRteCamera());

        const isIntersecting = this.heightHandle.checkIntersection(
            raycaster,
            this.mapView.getRteCamera()
        );
        this.heightHandle.setHoverState(isIntersecting);

        return isIntersecting;
    }

    public checkHeightHandleInteraction(raycaster: THREE.Raycaster): boolean {
        if (!this.currentPoint || !this.heightHandle.isVisible) {
            return false;
        }

        return this.heightHandle.checkIntersection(raycaster, this.mapView.getRteCamera());
    }

    // Get current point's height handle world position (compatible with old interface)
    public getHeightHandleWorldPosition(): THREE.Vector3 | null {
        if (!this.currentPoint) {
            return null;
        }

        const position = new THREE.Vector3();
        this.heightHandle.getWorldPosition(position);
        return position;
    }

    public attachToLineVertex(line: any, vertexIndex: number): void {
        if (!line || !line.getVertexPoints || vertexIndex < 0) {
            this.detach();
            return;
        }

        const vertexPoints = line.getVertexPoints();
        if (vertexIndex >= vertexPoints.length) {
            this.detach();
            return;
        }

        const vertexPoint = vertexPoints[vertexIndex];
        this.attachToPoint(vertexPoint);
    }

    // Start height adjustment
    public startAdjustment(event: MouseEvent): boolean {
        if (!this.currentPoint) return false;

        const mousePoint = new THREE.Vector2(
            (event.offsetX / this.mapView.canvas.width) * 2 - 1,
            -(event.offsetY / this.mapView.canvas.height) * 2 + 1
        );

        if (this.checkInteraction(mousePoint)) {
            this.isAdjusting = true;
            this.startPoint.set(event.clientX, event.clientY);
            this.startHeight = this.currentPoint.getHeight();
            this.heightHandle.setActiveState(true);

            // According to user's algorithm idea: form a plane from click position and arrow direction
            const arrowDirection = this.heightHandle.getDirection();
            const handleWorldPos = new THREE.Vector3();
            this.heightHandle.getWorldPosition(handleWorldPos);

            // Create ray for determining drag plane
            const startRaycaster = new THREE.Raycaster();
            startRaycaster.setFromCamera(mousePoint, this.mapView.getRteCamera());

            // Method 1: Create a plane perpendicular to the camera's line of sight direction, which contains the arrow start point and arrow direction
            // This way, mouse movement can be effectively mapped to the arrow direction from any viewing angle
            const cameraDirection = new THREE.Vector3();
            this.mapView.camera.getWorldDirection(cameraDirection);

            // The plane normal is the camera's line of sight direction
            this.adjustmentPlane.setFromNormalAndCoplanarPoint(cameraDirection, handleWorldPos);

            // Record the intersection point of the mouse on the plane when starting to drag
            if (!startRaycaster.ray.intersectPlane(this.adjustmentPlane, this.startIntersection)) {
                console.warn("Unable to calculate initial intersection point, using backup method");
                // Backup method: Find a point on the ray closest to the arrow position
                startRaycaster.ray.closestPointToPoint(handleWorldPos, this.startIntersection);
            }

            event.stopPropagation();
            return true;
        }

        return false;
    }

    // Handle height adjustment
    public handleAdjustment(event: MouseEvent): void {
        if (!this.isAdjusting || !this.currentPoint) return;

        // Get ray from current mouse position
        const currentMousePoint = new THREE.Vector2(
            (event.offsetX / this.mapView.canvas.width) * 2 - 1,
            -(event.offsetY / this.mapView.canvas.height) * 2 + 1
        );

        const currentRaycaster = new THREE.Raycaster();
        currentRaycaster.setFromCamera(currentMousePoint, this.mapView.getRteCamera());

        // Calculate intersection point of current mouse on adjustment plane
        const currentIntersection = new THREE.Vector3();
        if (currentRaycaster.ray.intersectPlane(this.adjustmentPlane, currentIntersection)) {
            // According to user's algorithm idea: height is the height difference between the two
            const arrowDirection = this.heightHandle.getDirection();

            // Calculate vector from initial intersection to current intersection
            const displacement = currentIntersection.clone().sub(this.startIntersection);

            // Project onto arrow direction to get height change
            const heightDelta = displacement.dot(arrowDirection);

            // Calculate new height (don't use sensitivity, keep height change consistent with mouse movement)
            const newHeight = this.startHeight + heightDelta;
            // Remove minimum height restriction, allow negative heights
            // const minHeight = 0;
            // const adjustedHeight = Math.max(minHeight, newHeight);
            const adjustedHeight = newHeight;

            this.currentPoint.setHeight(adjustedHeight);

            // Trigger height change event
            if (this.onHeightChanged) {
                this.onHeightChanged(this.currentPoint, adjustedHeight);
            }

            // Update height handle position, keep synchronized
            this.update();
        } else {
        }
    }

    // Handle mouse wheel adjustment
    public handleWheelAdjustment(event: WheelEvent): boolean {
        if (!this.currentPoint) return false;

        const mousePoint = new THREE.Vector2(
            (event.offsetX / this.mapView.canvas.width) * 2 - 1,
            -(event.offsetY / this.mapView.canvas.height) * 2 + 1
        );

        if (this.checkInteraction(mousePoint)) {
            const currentHeight = this.currentPoint.getHeight();
            const wheelSensitivity = 0.5;
            const delta = -event.deltaY * wheelSensitivity;
            // Remove minimum height restriction, allow negative heights
            // const newHeight = Math.max(0, currentHeight + delta);
            const newHeight = currentHeight + delta;

            this.currentPoint.setHeight(newHeight);
            event.preventDefault();
            return true;
        }

        return false;
    }

    // End adjustment
    public endAdjustment(): void {
        this.isAdjusting = false;
        this.heightHandle.setActiveState(false);
    }

    // Update method (called every frame)
    public update(): void {
        if (this.currentPoint && this.heightHandle.isVisible) {
            // Update handle position and size
            const worldPos = this.mapView.projection.projectPoint(this.currentPoint.getCenter());
            this.heightHandle.position.copy(worldPos);
            this.heightHandle.updateSize(this.mapView.camera, this.mapView.renderer);
        }
    }

    // Override dispose method
    public dispose(): void {
        this.heightHandle.dispose();
        this.removeFromParent();
    }

    // Get current point
    public getCurrentPoint(): PointObject | null {
        return this.currentPoint;
    }

    // Is adjusting
    public getIsAdjusting(): boolean {
        return this.isAdjusting;
    }

    // Get height handle
    public getHeightHandle(): HeightHandle {
        return this.heightHandle;
    }
}
