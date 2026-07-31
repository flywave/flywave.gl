/* Copyright (C) 2025 flywave.gl contributors */

import { GeoCoordinates, ProjectionType } from "@flywave/flywave-geoutils";
import { type MapView } from "@flywave/flywave-mapview";
import { type MapControls } from "@flywave/flywave-map-controls";
import * as THREE from "three/webgpu";
import { WindowEventHandler } from "@flywave/flywave-utils";

import { HeightHandle } from "./HeightHandle";

interface WindowEventMap {
    mousedown: MouseEvent;
    mousemove: MouseEvent;
    mouseup: MouseEvent;
}

export interface VertexHandleEvents {
    dragStart?: (handle: VertexHandle) => void;
    drag?: (handle: VertexHandle, newPosition: GeoCoordinates) => void;
    dragWorld?: (handle: VertexHandle, newPosition: THREE.Vector3) => void;
    dragEnd?: (handle: VertexHandle) => void;
    heightChange?: (handle: VertexHandle, newHeight: number) => void;
    heightAdjustStart?: (handle: VertexHandle) => void;
    heightAdjustEnd?: (handle: VertexHandle) => void;
    selected?: (handle: VertexHandle, selected: boolean) => void;
    hovered?: (handle: VertexHandle, hovered: boolean) => void;
}

export interface VertexHandleOptions {
    position?: GeoCoordinates;
    worldPosition?: THREE.Vector3;
    mapView: MapView;
    windowHandler: WindowEventHandler;
    mapControls?: MapControls;
    normalColor?: number;
    selectedColor?: number;
    hoverColor?: number;
    size?: number;
    draggable?: boolean;
    autoHeightHandle?: boolean;
}

export class VertexHandle extends THREE.Object3D {
    private readonly mapView: MapView;
    private readonly windowHandler: WindowEventHandler;
    private readonly mapControls: MapControls | undefined;
    private geoPosition: GeoCoordinates | null;
    private worldPosition: THREE.Vector3;
    private useGeoCoordinates: boolean;

    private windowHandlerPanEnabledState: boolean = true;
    private readonly heightHandle: HeightHandle;

    private isEnabled: boolean = true;
    private isDragging: boolean = false;
    private isHovered: boolean = false;
    private isHeightHandleHovered: boolean = false;
    private isSelected: boolean = false;
    private isAdjustingHeight: boolean = false;

    private readonly dragThreshold: number = 5;
    private readonly dragStartPoint: THREE.Vector2 = new THREE.Vector2();
    private hasDraggedDistance: boolean = false;
    private dragStartGeoCoord: GeoCoordinates | null = null;
    private dragStartWorldPos: THREE.Vector3 = new THREE.Vector3();
    private dragStartHeight: number | null = null;
    private heightAdjustStartHeight: number = 0;
    private readonly adjustmentPlane: THREE.Plane = new THREE.Plane();
    private readonly startIntersection: THREE.Vector3 = new THREE.Vector3();

    private mapControlsEnabledState: boolean = true;

    private readonly normalColor: number;
    private readonly selectedColor: number;
    private readonly hoverColor: number;
    private readonly size: number;
    private readonly autoHeightHandle: boolean;

    protected sprite: THREE.Sprite | null = null;
    protected spriteMaterial: THREE.SpriteMaterial | null = null;

    public readonly events: VertexHandleEvents = {};

    constructor(options: VertexHandleOptions) {
        super();

        this.mapView = options.mapView;
        this.windowHandler = options.windowHandler;
        this.mapControls = options.mapControls;
        this.autoHeightHandle = options.autoHeightHandle !== false;

        this.normalColor = options.normalColor ?? 0xff6b6b;
        this.selectedColor = options.selectedColor ?? 0x00ff00;
        this.hoverColor = options.hoverColor ?? 0xffff00;
        this.size = options.size ?? 0.008;

        if (options.position !== undefined) {
            this.useGeoCoordinates = true;
            this.geoPosition = options.position.clone();
            this.worldPosition = new THREE.Vector3();
            this.worldPosition.copy(this.mapView.projection.projectPoint(this.geoPosition));
        } else if (options.worldPosition !== undefined) {
            this.useGeoCoordinates = false;
            this.geoPosition = null;
            this.worldPosition = options.worldPosition.clone();
        } else {
            throw new Error("Either position or worldPosition must be provided");
        }

        this.heightHandle = new HeightHandle();
        this.add(this.heightHandle);

        this.createVisuals();
        this.setupEventListeners();
        this.updatePosition();

        this.renderOrder = 100;
    }

    private createVisuals(): void {
        const texture = this.createHandleTexture(this.normalColor, false, false);
        this.spriteMaterial = new THREE.SpriteMaterial({
            map: texture,
            color: 0xffffff,
            transparent: true,
            opacity: 1.0,
            sizeAttenuation: false,
            depthTest: false,
            depthWrite: false
        });

        this.sprite = new THREE.Sprite(this.spriteMaterial);
        this.sprite.scale.set(this.size, this.size, 1);
        this.sprite.renderOrder = 100;

        this.userData.isVertexHandle = true;
        this.userData.handle = this;

        this.add(this.sprite);
    }

    private createHandleTexture(
        color: number,
        isSelected: boolean,
        isHovered: boolean = false
    ): THREE.Texture {
        const canvas = document.createElement("canvas");
        const size = 64;
        canvas.width = size;
        canvas.height = size;
        const context = canvas.getContext("2d")!;

        context.clearRect(0, 0, size, size);

        const center = size / 2;
        const displayColor = `#${color.toString(16).padStart(6, "0")}`;
        const radius = isSelected ? 24 : 22;
        const strokeWidth = isSelected ? 3.5 : isHovered ? 3.5 : 2.5;
        const showCenterDot = isSelected || isHovered;

        if (isHovered || isSelected) {
            const alpha = isHovered ? 0.25 : 0.3;
            context.shadowBlur = 12;
            context.shadowColor = `rgba(${parseInt(displayColor.slice(1, 3), 16)},${parseInt(
                displayColor.slice(3, 5),
                16
            )},${parseInt(displayColor.slice(5, 7), 16)},${alpha})`;
            context.shadowOffsetY = 0;
        } else {
            context.shadowBlur = 8;
            context.shadowColor = "rgba(0,0,0,0.35)";
            context.shadowOffsetY = 2;
        }
        context.beginPath();
        context.arc(center, center, radius, 0, Math.PI * 2);
        context.fillStyle = "#ffffff";
        context.fill();

        context.shadowBlur = 0;
        context.shadowColor = "transparent";
        context.strokeStyle = displayColor;
        context.lineWidth = strokeWidth;
        context.stroke();

        if (showCenterDot) {
            context.beginPath();
            context.arc(center, center, 4, 0, Math.PI * 2);
            context.fillStyle = displayColor;
            context.fill();
        }

        const texture = new THREE.CanvasTexture(canvas);
        return texture;
    }

    private setupEventListeners(): void {
        if (!this.windowHandler) {
            this.isEnabled = false;
            return;
        }

        this.windowHandler.addEventListener("mousedown", this.onMouseDown as any);
        this.windowHandler.addEventListener("mousemove", this.onMouseMove as any);
        this.windowHandler.addEventListener("mouseup", this.onMouseUp as any);
    }

    private onMouseDown = (event: MouseEvent): void => {
        if (!this.isEnabled) return;

        const mousePoint = new THREE.Vector2(
            (event.offsetX / this.mapView.canvas.width) * 2 - 1,
            -(event.offsetY / this.mapView.canvas.height) * 2 + 1
        );

        if (this.checkHeightHandleIntersection(mousePoint)) {
            this.startHeightAdjustment(mousePoint);
            return;
        }

        if (this.checkIntersection(mousePoint)) {
            this.isDragging = true;
            this.hasDraggedDistance = false;
            this.dragStartPoint.set(event.offsetX, event.offsetY);
            this.dragStartGeoCoord =
                this.useGeoCoordinates && this.geoPosition ? this.geoPosition.clone() : null;
            this.dragStartWorldPos.copy(this.worldPosition);
            this.dragStartHeight = this.worldPosition.z;

            this.windowHandlerPanEnabledState = this.windowHandler.panEnabled;
            this.windowHandler.panEnabled = false;
        }
    };

    private onMouseMove = (event: MouseEvent): void => {
        if (!this.isEnabled) return;

        const mousePoint = new THREE.Vector2(
            (event.offsetX / this.mapView.canvas.width) * 2 - 1,
            -(event.offsetY / this.mapView.canvas.height) * 2 + 1
        );

        if (this.isAdjustingHeight) {
            this.handleHeightAdjustment(event);
            return;
        }

        if (this.isDragging && !this.hasDraggedDistance) {
            const currentMousePoint = new THREE.Vector2(event.offsetX, event.offsetY);
            const distance = currentMousePoint.distanceTo(this.dragStartPoint);

            if (distance > this.dragThreshold) {
                this.hasDraggedDistance = true;
                this.events.dragStart?.(this);
            }
        }

        if (this.isDragging && this.hasDraggedDistance) {
            this.handleDrag(event);
            return;
        }

        this.updateHoverStates(mousePoint);
    };

    private onMouseUp = (event: MouseEvent): void => {
        if (this.isAdjustingHeight) {
            this.isAdjustingHeight = false;
            this.heightHandle.setActiveState(false);
            this.updateHeightHandleVisibility();
            this.events.heightAdjustEnd?.(this);

            this.windowHandler.panEnabled = this.windowHandlerPanEnabledState;

            if (this.mapControls) {
                setTimeout(() => {
                    this.mapControls!.enabled = this.mapControlsEnabledState;
                }, 100);
            }
            return;
        }

        if (this.isDragging) {
            if (this.hasDraggedDistance) {
                this.events.dragEnd?.(this);
            }

            this.isDragging = false;
            this.hasDraggedDistance = false;
            this.dragStartGeoCoord = null;
            this.dragStartHeight = null;

            this.windowHandler.panEnabled = this.windowHandlerPanEnabledState;

            if (this.mapControls) {
                setTimeout(() => {
                    this.mapControls!.enabled = this.mapControlsEnabledState;
                }, 100);
            }
        }
    };

    private updateHoverStates(mousePoint: THREE.Vector2): void {
        const wasHovered = this.isHovered;
        const wasHeightHandleHovered = this.isHeightHandleHovered;

        this.isHovered = this.checkIntersection(mousePoint);

        if (this.isSelected && this.autoHeightHandle) {
            this.isHeightHandleHovered = this.checkHeightHandleIntersection(mousePoint);
        } else {
            this.isHeightHandleHovered = false;
        }

        if (
            wasHovered !== this.isHovered ||
            wasHeightHandleHovered !== this.isHeightHandleHovered
        ) {
            this.updateVisuals();
            this.updateHeightHandleAppearance();

            const anyHovered = this.isHovered || this.isHeightHandleHovered;
            if (wasHovered !== anyHovered) {
                this.events.hovered?.(this, anyHovered);
            }
        }
    }

    private checkIntersection(mousePoint: THREE.Vector2): boolean {
        const raycaster = new THREE.Raycaster();
        raycaster.setFromCamera(mousePoint, this.mapView.getRteCamera());

        const intersects: THREE.Intersection[] = [];
        raycaster.intersectObject(this.sprite, false, intersects);

        return intersects.length > 0;
    }

    private checkHeightHandleIntersection(mousePoint: THREE.Vector2): boolean {
        if (!this.isSelected || !this.autoHeightHandle) return false;

        const raycaster = new THREE.Raycaster();
        raycaster.setFromCamera(mousePoint, this.mapView.getRteCamera());

        const isIntersecting = this.heightHandle.checkIntersection(
            raycaster,
            this.mapView.getRteCamera()
        );

        return isIntersecting;
    }

    private startHeightAdjustment(mousePoint: THREE.Vector2): void {
        this.isAdjustingHeight = true;

        this.dragStartWorldPos.copy(this.worldPosition);

        if (this.useGeoCoordinates && this.geoPosition) {
            this.heightAdjustStartHeight = this.geoPosition.altitude || 0;
        } else {
            if (this.mapView.projection.type === ProjectionType.Spherical) {
                this.heightAdjustStartHeight = this.worldPosition.length() - 6371000;
            } else {
                this.heightAdjustStartHeight = this.worldPosition.z;
            }
        }

        const arrowDirection = this.heightHandle.getDirection();
        const handleWorldPos = new THREE.Vector3();
        this.heightHandle.getWorldPosition(handleWorldPos);

        const raycaster = new THREE.Raycaster();
        raycaster.setFromCamera(mousePoint, this.mapView.getRteCamera());

        const cameraDirection = new THREE.Vector3();
        this.mapView.camera.getWorldDirection(cameraDirection);

        this.adjustmentPlane.setFromNormalAndCoplanarPoint(cameraDirection, handleWorldPos);

        if (!raycaster.ray.intersectPlane(this.adjustmentPlane, this.startIntersection)) {
            raycaster.ray.closestPointToPoint(handleWorldPos, this.startIntersection);
        }

        this.heightHandle.setActiveState(true);

        this.windowHandlerPanEnabledState = this.windowHandler.panEnabled;
        this.windowHandler.panEnabled = false;

        this.events.heightAdjustStart?.(this);
    }

    private handleHeightAdjustment(event: MouseEvent): void {
        const currentMousePoint = new THREE.Vector2(
            (event.offsetX / this.mapView.canvas.width) * 2 - 1,
            -(event.offsetY / this.mapView.canvas.height) * 2 + 1
        );

        const currentRaycaster = new THREE.Raycaster();
        currentRaycaster.setFromCamera(currentMousePoint, this.mapView.getRteCamera());

        const currentIntersection = new THREE.Vector3();
        if (currentRaycaster.ray.intersectPlane(this.adjustmentPlane, currentIntersection)) {
            const arrowDirection = this.heightHandle.getDirection();
            const displacement = currentIntersection.clone().sub(this.startIntersection);
            const heightDelta = displacement.dot(arrowDirection);

            const newHeight = this.heightAdjustStartHeight + heightDelta;

            if (this.useGeoCoordinates && this.geoPosition) {
                this.geoPosition.altitude = newHeight;
                this.worldPosition.copy(this.mapView.projection.projectPoint(this.geoPosition));
            } else {
                this.worldPosition.copy(this.dragStartWorldPos);
                if (this.mapView.projection.type === ProjectionType.Spherical) {
                    const direction = this.worldPosition.clone().normalize();
                    const targetRadius = 6371000 + newHeight;
                    this.worldPosition.copy(direction.multiplyScalar(targetRadius));
                } else {
                    this.worldPosition.z = newHeight;
                }
            }

            this.updatePosition();
            this.events.heightChange?.(this, newHeight);
        }
    }

    private handleDrag(event: MouseEvent): void {
        const currentMousePoint = new THREE.Vector2(event.offsetX, event.offsetY);

        const currentWorldPos = this.getIntersectionOnDragSurface(
            currentMousePoint,
            this.dragStartWorldPos
        );

        if (!currentWorldPos) return;

        this.worldPosition.copy(currentWorldPos);

        if (this.useGeoCoordinates && this.geoPosition) {
            const newGeoCoord = this.mapView.projection.unprojectPoint(this.worldPosition);
            this.geoPosition.latitude = newGeoCoord.latitude;
            this.geoPosition.longitude = newGeoCoord.longitude;

            if (this.events.dragWorld) {
                this.events.dragWorld(this, this.worldPosition.clone());
            } else if (this.events.drag) {
                this.events.drag(this, this.geoPosition);
            }
        } else {
            if (this.events.dragWorld) {
                this.events.dragWorld(this, this.worldPosition.clone());
            } else if (this.events.drag) {
                const geoCoord = this.mapView.projection.unprojectPoint(this.worldPosition);
                this.events.drag(this, geoCoord);
            }
        }

        this.updatePosition();
    }

    private getIntersectionOnDragSurface(
        mousePoint: THREE.Vector2,
        startWorldPos: THREE.Vector3
    ): THREE.Vector3 | null {
        try {
            const mouseCoords = new THREE.Vector2(
                (mousePoint.x / this.mapView.canvas.width) * 2 - 1,
                -(mousePoint.y / this.mapView.canvas.height) * 2 + 1
            );

            const raycaster = new THREE.Raycaster();
            raycaster.setFromCamera(mouseCoords, this.mapView.camera);

            if (this.mapView.projection.type === ProjectionType.Spherical) {
                const normal = startWorldPos.clone().normalize();
                const plane = new THREE.Plane(normal, -startWorldPos.dot(normal));

                const intersection = new THREE.Vector3();
                if (raycaster.ray.intersectPlane(plane, intersection)) {
                    const startRadius = startWorldPos.length();
                    const normalized = intersection.clone().normalize();
                    return normalized.multiplyScalar(startRadius);
                }
            } else {
                const planeHeight = startWorldPos.z;
                const plane = new THREE.Plane(new THREE.Vector3(0, 0, 1), -planeHeight);

                const intersection = new THREE.Vector3();
                if (raycaster.ray.intersectPlane(plane, intersection)) {
                    intersection.z = planeHeight;
                    return intersection;
                }
            }
        } catch (error) {
            console.error("Error getting surface intersection:", error);
            return null;
        }

        return null;
    }

    private updatePosition(): void {
        this.position.copy(this.worldPosition);

        this.updateHeightHandle();
    }

    private updateHeightHandle(): void {
        if (this.isSelected && this.autoHeightHandle) {
            if (this.mapView.projection.type === ProjectionType.Spherical) {
                const normal = this.mapView.projection.surfaceNormal(
                    this.worldPosition,
                    new THREE.Vector3()
                );
                this.heightHandle.setDirection(normal);
            } else {
                this.heightHandle.setDirection(new THREE.Vector3(0, 0, 1));
            }

            this.heightHandle.updateSize(this.mapView.camera, this.mapView.renderer);
        }

        this.updateHeightHandleVisibility();
    }

    private updateHeightHandleVisibility(): void {
        const shouldShow = this.isSelected && this.autoHeightHandle && !this.isAdjustingHeight;
        this.heightHandle.setVisible(shouldShow);
    }

    private updateHeightHandleAppearance(): void {
        if (this.isHeightHandleHovered) {
            this.heightHandle.setHoverState(true);
        } else if (!this.isAdjustingHeight) {
            this.heightHandle.setHoverState(false);
        }
    }

    private updateVisuals(): void {
        if (!this.spriteMaterial) return;

        let color = this.normalColor;

        if (this.isSelected) {
            color = this.selectedColor;
        } else if (this.isHovered) {
            color = this.hoverColor;
        }

        const oldMaterial = this.spriteMaterial;
        const texture = this.createHandleTexture(color, this.isSelected, this.isHovered);

        this.spriteMaterial = new THREE.SpriteMaterial({
            map: texture,
            color: 0xffffff,
            transparent: true,
            opacity: 1.0,
            sizeAttenuation: false,
            depthTest: false,
            depthWrite: false
        });

        if (this.sprite) {
            this.sprite.material = this.spriteMaterial;
        }

        oldMaterial.dispose();
    }

    public setPosition(position: GeoCoordinates): void {
        this.useGeoCoordinates = true;
        this.geoPosition = position.clone();
        this.worldPosition.copy(this.mapView.projection.projectPoint(this.geoPosition));
        this.updatePosition();
    }

    public setWorldPosition(position: THREE.Vector3): void {
        this.useGeoCoordinates = false;
        this.worldPosition.copy(position);
        if (this.geoPosition) {
            const newGeoCoord = this.mapView.projection.unprojectPoint(this.worldPosition);
            this.geoPosition.latitude = newGeoCoord.latitude;
            this.geoPosition.longitude = newGeoCoord.longitude;
            this.geoPosition.altitude = newGeoCoord.altitude;
        }
        this.updatePosition();
    }

    public getPosition(): GeoCoordinates | null {
        if (!this.useGeoCoordinates || !this.geoPosition) {
            const geoCoord = this.mapView.projection.unprojectPoint(this.worldPosition);
            return geoCoord;
        }
        return this.geoPosition.clone();
    }

    public getWorldPosition(): THREE.Vector3 {
        return this.worldPosition.clone();
    }

    public isUsingGeoCoordinates(): boolean {
        return this.useGeoCoordinates;
    }

    public setEnabled(enabled: boolean): void {
        this.isEnabled = enabled;
        this.visible = enabled;
    }

    public getEnabled(): boolean {
        return this.isEnabled;
    }

    public setSelected(selected: boolean): void {
        if (this.isSelected !== selected) {
            this.isSelected = selected;
            this.updateVisuals();
            this.updateHeightHandle();
            this.events.selected?.(this, selected);
        }
    }

    public getSelected(): boolean {
        return this.isSelected;
    }

    public setHeight(height: number): void {
        if (this.useGeoCoordinates && this.geoPosition) {
            this.geoPosition.altitude = height;
            this.worldPosition.copy(this.mapView.projection.projectPoint(this.geoPosition));
        } else {
            this.worldPosition.z = height;
        }
        this.updatePosition();
    }

    public getHeight(): number {
        return this.worldPosition.z;
    }

    public getHovered(): boolean {
        return this.isHovered || this.isHeightHandleHovered;
    }

    public on<E extends keyof VertexHandleEvents>(event: E, callback: VertexHandleEvents[E]): void {
        this.events[event] = callback;
    }

    public off<E extends keyof VertexHandleEvents>(event: E): void {
        delete this.events[event];
    }

    public update(): void {
        this.updatePosition();
        if (this.isSelected && this.autoHeightHandle) {
            this.heightHandle.updateSize(this.mapView.camera, this.mapView.renderer);
        }
    }

    public dispose(): void {
        if (this.windowHandler) {
            this.windowHandler.removeEventListener("mousedown", this.onMouseDown as any);
            this.windowHandler.removeEventListener("mousemove", this.onMouseMove as any);
            this.windowHandler.removeEventListener("mouseup", this.onMouseUp as any);
        }

        if (this.spriteMaterial) {
            this.spriteMaterial.dispose();
        }

        this.heightHandle.dispose();
        this.removeFromParent();
    }
}
