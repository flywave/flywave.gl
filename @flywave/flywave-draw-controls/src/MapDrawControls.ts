/* Copyright (C) 2025 flywave.gl contributors */

import { type GeoJson } from "@flywave/flywave-datasource-protocol";
import { GeoCoordinates, ProjectionType } from "@flywave/flywave-geoutils";
import { type MapControls } from "@flywave/flywave-map-controls";
import { type MapView, MapViewEventNames } from "@flywave/flywave-mapview";
import * as THREE from "three";
import { EventDispatcher } from "three";

import { type DrawableObject } from "./DrawableObject";
import { type DrawEvent, DrawEventNames } from "./DrawEventNames";
import { DrawLine } from "./DrawLine";
import { DrawMode } from "./DrawMode";
import { DrawPolygon } from "./DrawPolygon";
import { HeightAdjustManager } from "./HeightAdjustManager";
import { PointObject } from "./PointObject";
import { WindowEventHandler } from "@flywave/flywave-utils";

interface MapDrawControlsEventMap {
    [DrawEventNames.DRAW_START]: DrawEvent;
    [DrawEventNames.DRAW_END]: DrawEvent;
    [DrawEventNames.OBJECT_ADDED]: DrawEvent;
    [DrawEventNames.OBJECT_REMOVED]: DrawEvent;
    [DrawEventNames.OBJECT_SELECTED]: DrawEvent;
    [DrawEventNames.OBJECT_MODIFIED]: DrawEvent;
    [DrawEventNames.OBJECT_MODIFIED_END]: DrawEvent;
    [DrawEventNames.MODE_CHANGED]: DrawEvent;
}

interface ITileRenderDataSource {
    raycast(raycaster: THREE.Raycaster, intersections: THREE.Intersection[]): void;
}

export { DrawEventNames };

export class MapDrawControls extends EventDispatcher<MapDrawControlsEventMap> {
    protected mapView: MapView;
    private readonly windowHandler: WindowEventHandler;
    private drawMode: DrawMode = DrawMode.NONE;
    private readonly objects = new Map<number, DrawableObject>();
    private selectedObject: DrawableObject | null = null;
    private tempVertices: GeoCoordinates[] = [];
    private tempObject: DrawableObject | null = null;
    private isDrawing: boolean = false;
    private isDragging: boolean = false;
    private hasDraggedDistance: boolean = false; // Add flag to mark whether actually dragged a distance
    private readonly dragStartPoint: THREE.Vector2 = new THREE.Vector2();
    private dragObject: DrawableObject | null = null;
    private dragVertexIndex: number = -1;
    private readonly DRAG_THRESHOLD = 5; // Drag threshold (pixels)

    private readonly heightAdjustManager: HeightAdjustManager;

    private selectedVertexIndex: number = -1;
    private selectedVertexObject: DrawableObject | null = null;

    // Add double-click protection flag
    private isDoubleClickProcessing: boolean = false;

    // Add rootObject as container for all drawing objects
    private readonly rootObject: THREE.Group;

    // Add mode indicator element
    private modeIndicator: HTMLElement;

    constructor(mapView: MapView, protected mapControls: MapControls) {
        super();
        this.mapView = mapView;
        this.windowHandler = mapControls.eventHandler;

        // Initialize camera control state
        this.mapControlsEnabledState = mapControls.enabled;

        // Initialize rootObject and add to scene
        this.rootObject = new THREE.Group();
        this.mapView.scene.add(this.rootObject);

        this.heightAdjustManager = new HeightAdjustManager(
            mapView,
            (point: PointObject, newHeight: number) => {
                // Callback when height changes, trigger object modification event

                // First check if there is a selected vertex (directly selected vertex case)
                if (this.selectedVertexObject && this.selectedVertexIndex >= 0) {
                    // Directly selected vertex case, update parent line object's vertex
                    this.selectedVertexObject.updateVertex(
                        this.selectedVertexIndex,
                        point.getCenter()
                    );

                    // Trigger parent line object's modification event
                    this.dispatchEvent({
                        type: DrawEventNames.OBJECT_MODIFIED,
                        object: this.selectedVertexObject
                    } as DrawEvent);
                }
                // Check again if there is a selected object (select line first then select vertex case)
                else if (this.selectedObject && this.selectedVertexIndex >= 0) {
                    this.selectedObject.updateVertex(this.selectedVertexIndex, point.getCenter());

                    this.dispatchEvent({
                        type: DrawEventNames.OBJECT_MODIFIED,
                        object: this.selectedObject
                    } as DrawEvent);
                }

                // Always trigger point object's modification event
                this.dispatchEvent({
                    type: DrawEventNames.OBJECT_MODIFIED,
                    object: point
                } as DrawEvent);

                // Trigger object modification end event
                this.dispatchEvent({
                    type: DrawEventNames.OBJECT_MODIFIED_END,
                    object: point
                } as DrawEvent);
            }
        );

        this.rootObject.add(this.heightAdjustManager);

        this.createModeIndicator();
        this.setupEventListeners();

        this.mapView.addEventListener(MapViewEventNames.Render, this.onFrameUpdate);
        this.heightAdjustManager.update(); // Update height manager
    }

    /**
     * Set the visibility of the drawing controls
     * @param visible - Whether visible
     */
    visible(visible: boolean): void {
        this.rootObject.visible = visible;
    }

    private onFrameUpdate = (): void => {
        this.rootObject.position.copy(this.mapView.camera.position).negate();

        // Update height handle every frame
        if (this.heightAdjustManager.getCurrentPoint()) {
            this.heightAdjustManager.update();
        }
    };

    private setupEventListeners(): void {
        const canvas = this.mapView.canvas;

        canvas.focus();

        // Bind event handlers
        this.windowHandler.addEventListener("mousedown", this.onMouseDown.bind(this));
        this.windowHandler.addEventListener("mousemove", this.onMouseMove.bind(this));
        this.windowHandler.addEventListener("mouseup", this.onMouseUp.bind(this));
        this.windowHandler.addEventListener("mouseclick", this.onClick.bind(this));
        this.windowHandler.addEventListener("dblclick", this.onDoubleClick.bind(this));
        this.windowHandler.addEventListener("mousewheel", this.onMouseWheel.bind(this));

        // Add global event interceptor to intercept all events that may cause camera movement during double-click processing
        canvas.addEventListener("mousedown", this.globalEventInterceptor.bind(this), true);
        canvas.addEventListener("mousemove", this.globalEventInterceptor.bind(this), true);
        canvas.addEventListener("mouseup", this.globalEventInterceptor.bind(this), true);
        canvas.addEventListener("click", this.globalEventInterceptor.bind(this), true);
        canvas.addEventListener("dblclick", this.globalEventInterceptor.bind(this), true);
        canvas.addEventListener("wheel", this.globalEventInterceptor.bind(this), true);

        // Keyboard event handling
        window.addEventListener("keydown", event => {
            if (event.key === "Escape") {
                this.cancelDrawing(); // This is already cancelDrawing()
            } else if (event.key === "Delete" && this.selectedObject) {
                this.removeObject(this.selectedObject.id);
            } else if (event.ctrlKey && event.key === "z") {
                this.undo();
            }
        });

        // Add global event interceptor to intercept all events that may cause camera movement during double-click processing
        canvas.addEventListener("mousedown", this.globalEventInterceptor.bind(this), true);
        canvas.addEventListener("mousemove", this.globalEventInterceptor.bind(this), true);
        canvas.addEventListener("mouseup", this.globalEventInterceptor.bind(this), true);
        canvas.addEventListener("click", this.globalEventInterceptor.bind(this), true);
        canvas.addEventListener("dblclick", this.globalEventInterceptor.bind(this), true);
        canvas.addEventListener("wheel", this.globalEventInterceptor.bind(this), true);
    }

    /**
     * Global event interceptor
     * @param event - Event object
     */
    private globalEventInterceptor(event: Event): void {
        // During double-click processing, intercept all events that may cause camera movement
        if (this.isDoubleClickProcessing) {
            event.preventDefault();
            event.stopPropagation();
            event.stopImmediatePropagation();
            return;
        }
    }

    private createModeIndicator(): void {
        this.modeIndicator = document.createElement("div");
        this.modeIndicator.style.position = "absolute";
        this.modeIndicator.style.top = "10px";
        this.modeIndicator.style.left = "10px";
        this.modeIndicator.style.padding = "8px 12px";
        this.modeIndicator.style.backgroundColor = "rgba(0, 0, 0, 0.7)";
        this.modeIndicator.style.color = "white";
        this.modeIndicator.style.borderRadius = "4px";
        this.modeIndicator.style.fontFamily = "Arial, sans-serif";
        this.modeIndicator.style.fontSize = "14px";
        this.modeIndicator.style.zIndex = "1000";
        this.modeIndicator.style.display = "none";
        this.mapView.canvas.parentElement?.appendChild(this.modeIndicator);
        this.updateModeIndicator();
    }

    private updateModeIndicator(): void {
        if (!this.modeIndicator) return;
        const modeText =
            {
                [DrawMode.NONE]: "No Mode",
                [DrawMode.POINT]: "Point Drawing Mode",
                [DrawMode.LINE]: "Line Drawing Mode",
                [DrawMode.POLYGON]: "Polygon Drawing Mode",
                [DrawMode.EDIT]: "Edit Mode",
                [DrawMode.DELETE]: "Delete Mode"
            }[this.drawMode] || "Unknown Mode";

        this.modeIndicator.textContent = modeText;
        this.modeIndicator.style.display = this.drawMode !== DrawMode.NONE ? "block" : "none";
    }

    private updateCursorStyle(event?: MouseEvent): void {
        if (
            this.drawMode === DrawMode.POINT ||
            this.drawMode === DrawMode.LINE ||
            this.drawMode === DrawMode.POLYGON
        ) {
            this.mapView.canvas.style.cursor = "crosshair";
        } else if (this.drawMode === DrawMode.EDIT) {
            // Check if there is a selected vertex
            if (this.selectedVertexObject && this.selectedVertexIndex >= 0) {
                this.mapView.canvas.style.cursor = "move";
            } else if (event) {
                const mousePoint = new THREE.Vector2(
                    (event.offsetX / this.mapView.canvas.width) * 2 - 1,
                    -(event.offsetY / this.mapView.canvas.height) * 2 + 1
                );

                // Check height handle hover
                if (this.heightAdjustManager.getCurrentPoint()) {
                    const isHoveringHandle = this.heightAdjustManager.checkInteraction(mousePoint);
                    if (isHoveringHandle) {
                        this.mapView.canvas.style.cursor = "ns-resize";
                        return;
                    }
                }

                // Check object hover
                const intersectedObject = this.findObjectAt(mousePoint);
                if (intersectedObject) {
                    if (intersectedObject.vertexIndex >= 0) {
                        this.mapView.canvas.style.cursor = "pointer"; // Vertex hover
                    } else {
                        this.mapView.canvas.style.cursor = "move"; // Object hover
                    }
                } else {
                    this.mapView.canvas.style.cursor = "default";
                }
            } else {
                this.mapView.canvas.style.cursor = "default";
            }
        } else if (this.drawMode === DrawMode.DELETE) {
            this.mapView.canvas.style.cursor = "not-allowed";
        } else {
            this.mapView.canvas.style.cursor = "default";
        }
    }

    /**
     * Set drawing mode
     * @param mode - Drawing mode
     * @returns this
     */
    public setMode(mode: DrawMode): this {
        this.drawMode = mode;
        this.clearSelection();
        this.tempVertices = [];
        this.isDrawing = false;

        this.updateModeIndicator();
        this.updateCursorStyle();

        this.dispatchEvent({
            type: DrawEventNames.MODE_CHANGED,
            mode
        } as DrawEvent);
        return this;
    }

    /**
     * Get current drawing mode
     * @returns Current drawing mode
     */
    public getMode(): DrawMode {
        return this.drawMode;
    }

    private addObject(object: DrawableObject): void {
        this.objects.set(object.id, object);
        this.rootObject.add(object);

        this.dispatchEvent({
            type: DrawEventNames.OBJECT_ADDED,
            object
        } as DrawEvent);
    }

    /**
     * Remove object
     * @param id - Object ID
     * @returns Whether removal was successful
     */
    public removeObject(id: number): boolean {
        const object = this.objects.get(id);
        if (object) {
            object.dispose();
            this.objects.delete(id);

            this.dispatchEvent({
                type: DrawEventNames.OBJECT_REMOVED,
                object
            } as DrawEvent);

            return true;
        }
        return false;
    }

    /**
     * Clear all objects
     */
    public clearAll(): void {
        this.objects.forEach(object => {
            object.dispose();
        });
        this.objects.clear();
        this.selectedObject = null;
    }

    /**
     * Get all objects
     * @returns Object array
     */
    public getObjects(): DrawableObject[] {
        return Array.from(this.objects.values());
    }

    /**
     * Get object by ID
     * @param id - Object ID
     * @returns Object or undefined
     */
    public getObject(id: number): DrawableObject | undefined {
        return this.objects.get(id);
    }

    /**
     * Export as GeoJSON format
     * @returns GeoJSON object
     */
    public exportToGeoJSON(): GeoJson {
        return {
            type: "FeatureCollection",
            features: Array.from(this.objects.values()).map(object => ({
                type: "Feature",
                geometry: object.toGeoJSON(),
                properties: {
                    id: object.id,
                    type: object.constructor.name
                }
            }))
        };
    }

    /**
     * Add objects in batch
     * @param objects - Object array
     */
    public addObjects(objects: DrawableObject[]): void {
        objects.forEach(object => {
            this.addObject(object);
        });
    }

    private onMouseDown(event): void {
        if (this.drawMode === DrawMode.NONE) return;

        this.dragStartPoint.set(event.offsetX, event.offsetY);

        // First check height handle interaction
        if (this.checkHeightHandleInteraction(event)) {
            return;
        }

        if (this.drawMode === DrawMode.EDIT) {
            this.handleEditModeMouseDown(event);
        } else if (this.drawMode === DrawMode.DELETE) {
            this.handleDeleteModeMouseDown(event);
        } else {
            this.handleDrawModeMouseDown(event);
        }
    }

    /**
     * Trigger label update (for subclass override)
     * @protected
     */
    protected triggerLabelUpdate(): void {
        // Empty implementation, to be overridden by subclasses
    }

    private onMouseMove(event): void {
        this.updateCursorStyle(event);

        this.mapView.update();
        // Highest priority: Handle height adjustment
        if (this.heightAdjustManager.getIsAdjusting()) {
            this.heightAdjustManager.handleAdjustment(event);
            return;
        }

        // Check if there is a press action but drag threshold has not been reached
        if (this.isDragging && !this.hasDraggedDistance) {
            const currentMousePoint = new THREE.Vector2(event.offsetX, event.offsetY);
            const distance = currentMousePoint.distanceTo(this.dragStartPoint);

            if (distance > this.DRAG_THRESHOLD) {
                this.hasDraggedDistance = true;
            }
        }

        // Secondary priority: Handle drag operation (only when actually dragging)
        if (this.isDragging && this.hasDraggedDistance) {
            this.handleDrag(event);
            return;
        }

        // Low priority: Update hover state and drawing preview
        const mousePoint = new THREE.Vector2(
            (event.offsetX / this.mapView.canvas.width) * 2 - 1,
            -(event.offsetY / this.mapView.canvas.height) * 2 + 1
        );

        // Update height handle hover state
        if (this.heightAdjustManager.getCurrentPoint()) {
            const isHovering = this.heightAdjustManager.checkInteraction(mousePoint);
            if (isHovering) {
                this.mapView.canvas.style.cursor = "ns-resize";
                return;
            }
        }

        // Draw preview effect
        if (
            this.isDrawing &&
            (this.drawMode === DrawMode.LINE || this.drawMode === DrawMode.POLYGON)
        ) {
            this.updateDrawingPreview(event);

            // Trigger label update for subclasses
            this.triggerLabelUpdate();
        }
    }

    private onMouseUp(event: MouseEvent): void {
        this.mapView.update();

        // First handle height adjustment end
        if (this.heightAdjustManager.getIsAdjusting()) {
            this.heightAdjustManager.endAdjustment();
            // Trigger object modification end event
            const currentPoint = this.heightAdjustManager.getCurrentPoint();
            if (currentPoint) {
                this.dispatchEvent({
                    type: DrawEventNames.OBJECT_MODIFIED_END,
                    object: currentPoint
                } as DrawEvent);
            }
            // After height adjustment ends, delay restoring camera control
            setTimeout(() => {
                this.updateCameraControlState();
            }, 100);
            return;
        }

        // Handle drag end
        if (this.isDragging) {
            // If no actual dragging occurred, treat as click operation, do not clear selection
            if (!this.hasDraggedDistance) {
                // Click operation, maintain vertex selection, but restore camera control (if allowed)
                this.isDragging = false;
                this.dragObject = null;
                this.dragVertexIndex = -1;
                this.dragStartGeoCoord = null;
                this.dragStartHeight = null; // Clean up height variable
                this.hasDraggedDistance = false;

                // Delay restoring camera control
                setTimeout(() => {
                    this.updateCameraControlState();
                }, 100);
                return;
            }

            // Actual drag operation ended
            this.isDragging = false;
            this.dragObject = null;
            this.dragVertexIndex = -1;
            this.dragStartGeoCoord = null;
            this.dragStartHeight = null; // Clean up height variable
            this.hasDraggedDistance = false;

            // Trigger object modification end event
            if (this.dragObject) {
                this.dispatchEvent({
                    type: DrawEventNames.OBJECT_MODIFIED_END,
                    object: this.dragObject
                } as DrawEvent);
            }

            // Delay restoring camera control after drag ends
            setTimeout(() => {
                this.updateCameraControlState();
            }, 100);
            return;
        }

        // In other cases, also delay updating camera control state
        setTimeout(() => {
            this.updateCameraControlState();
        }, 100);
    }

    private onMouseWheel(event: WheelEvent): void {
        // if (this.heightAdjustManager.handleWheelAdjustment(event)) {
        //     return;
        // }

        return;

        if (
            this.drawMode === DrawMode.EDIT &&
            this.selectedObject instanceof PointObject &&
            this.selectedObject.isSelected
        ) {
            // Use HeightAdjustManager to handle wheel height adjustment
            this.heightAdjustManager.handleWheelAdjustment(event);
            // Trigger object modification end event
            this.dispatchEvent({
                type: DrawEventNames.OBJECT_MODIFIED_END,
                object: this.selectedObject
            } as DrawEvent);
        }
    }

    /**
     * Edit mode click handling
     * @param event - Mouse event
     * @param mousePoint - Mouse point
     */
    private handleEditModeClick(event: MouseEvent, mousePoint: THREE.Vector2): void {
        // First check if height handle was clicked
        if (this.checkHeightHandleInteraction(event)) {
            return;
        }

        const intersectionResult = this.findObjectAt(mousePoint);
        if (intersectionResult) {
            const { object, vertexIndex } = intersectionResult;

            if (vertexIndex >= 0) {
                // Clicked on vertex, select vertex
                this.selectVertex(object, vertexIndex);
            } else {
                // Clicked on the object itself
                this.selectObject(object);
            }
        } else {
            this.clearSelection();
            // Detach height handle
            this.heightAdjustManager.detach();
        }
    }

    private onClick(event: MouseEvent): void {
        if (this.drawMode === DrawMode.NONE) return;

        this.mapView.update();

        const mousePoint = new THREE.Vector2(
            (event.offsetX / this.mapView.canvas.width) * 2 - 1,
            -(event.offsetY / this.mapView.canvas.height) * 2 + 1
        );

        // In edit mode, if no dragging occurred (i.e., click), handle vertex selection
        if (this.drawMode === DrawMode.EDIT) {
            this.handleEditModeClick(event, mousePoint);
        } else if (this.drawMode === DrawMode.DELETE) {
            this.handleDeleteModeClick(event, mousePoint);
        } else {
            this.handleDrawModeClick(event);
        }
    }

    private onDoubleClick(event: MouseEvent): void {
        if (this.drawMode === DrawMode.LINE || this.drawMode === DrawMode.POLYGON) {
            // Set double-click protection flag and immediately force disable camera
            this.isDoubleClickProcessing = true;
            this.mapControls.enabled = false;

            // Immediately prevent event propagation to prevent triggering map control events
            event.preventDefault();
            event.stopPropagation();
            event.stopImmediatePropagation();

            // Complete drawing
            this.finishDrawing();

            // Use longer delay recovery mechanism and confirm status again before recovery
            setTimeout(() => {
                this.isDoubleClickProcessing = false;

                // Delay a bit more to ensure all async operations complete
                setTimeout(() => {
                    this.updateCameraControlState();
                }, 50);
            }, 300); // Increase delay time to 300ms
        }
    }

    private handleDrawModeMouseDown(event: MouseEvent): void {
        // In drawing mode, do not start drawing immediately
        // Wait for onClick event to handle actual click drawing
        // This keeps camera control available until actual drawing begins
    }

    private dragStartGeoCoord: GeoCoordinates | null = null;
    // Add variable to save drag start height
    private dragStartHeight: number | null = null;

    /**
     * Select vertex
     * @param object - Object
     * @param vertexIndex - Vertex index
     */
    private selectVertex(object: DrawableObject, vertexIndex: number): void {
        // Anti-reselection mechanism - if selecting the same vertex, return directly
        if (this.selectedVertexObject === object && this.selectedVertexIndex === vertexIndex) {
            return;
        }

        // Clear previous vertex selection
        this.clearVertexSelection();

        // Set new vertex selection
        this.selectedVertexObject = object;
        this.selectedVertexIndex = vertexIndex;

        // Mark selected vertex on the object
        object.setVertexSelected(vertexIndex, true);

        // Attach height handle to the selected vertex
        let vertexPoint: PointObject | null = null;

        if (object instanceof DrawLine) {
            const vertexPoints = object.getVertexPoints();
            if (vertexIndex < vertexPoints.length) {
                vertexPoint = vertexPoints[vertexIndex];
            }
        } else if (object instanceof DrawPolygon) {
            const vertexPoints = object.getVertexPoints();
            if (vertexIndex < vertexPoints.length) {
                vertexPoint = vertexPoints[vertexIndex];
            }
        }

        if (vertexPoint) {
            this.heightAdjustManager.attachToPoint(vertexPoint);
        }

        // Update camera control state (camera not disabled when vertex is selected)
        setTimeout(() => {
            this.updateCameraControlState();
        }, 100);

        this.dispatchEvent({
            type: DrawEventNames.OBJECT_SELECTED,
            object
        } as DrawEvent);
    }

    /**
     * Clear vertex selection
     */
    private clearVertexSelection(): void {
        if (this.selectedVertexObject && this.selectedVertexIndex >= 0) {
            this.selectedVertexObject.setVertexSelected(this.selectedVertexIndex, false);
        }

        this.selectedVertexObject = null;
        this.selectedVertexIndex = -1;

        // Detach height handle
        this.heightAdjustManager.detach();

        // Use dynamic camera control state management
        setTimeout(() => {
            this.updateCameraControlState();
        }, 100);
    }

    /**
     * Update camera control state
     */
    private updateCameraControlState(): void {
        // During double-click processing, forcibly disable camera control
        if (this.isDoubleClickProcessing) {
            this.mapControls.enabled = false;
            return;
        }

        // Use HeightAdjustManager state instead of local isHeightAdjusting
        const shouldDisableCamera =
            this.heightAdjustManager.getIsAdjusting() || // Height adjustment in progress
            this.isDragging || // Dragging in progress (including preparing to drag)
            this.isDrawing; // Drawing in progress

        if (shouldDisableCamera) {
            // Need to disable camera control
            this.mapControls.enabled = false;
        } else {
            // Camera control can be restored, but confirm again not in double-click processing
            if (!this.isDoubleClickProcessing) {
                this.mapControls.enabled = this.mapControlsEnabledState;
            } else {
                this.mapControls.enabled = false;
            }
        }
    }

    /**
     * Check height handle interaction
     * @param event - Mouse event
     * @returns Whether there is interaction
     */
    private checkHeightHandleInteraction(event: MouseEvent): boolean {
        if (!this.heightAdjustManager.getCurrentPoint()) {
            return false;
        }

        const mousePoint = new THREE.Vector2(
            (event.offsetX / this.mapView.canvas.width) * 2 - 1,
            -(event.offsetY / this.mapView.canvas.height) * 2 + 1
        );

        const raycaster = new THREE.Raycaster();
        raycaster.setFromCamera(mousePoint, this.mapView.getRteCamera());

        const isInteracting = this.heightAdjustManager.checkHeightHandleInteraction(raycaster);

        if (isInteracting) {
            // Start height adjustment
            this.heightAdjustManager.startAdjustment(event);
            // Immediately update camera control state
            this.updateCameraControlState();
            return true;
        }

        return false;
    }

    private handleDeleteModeMouseDown(event: MouseEvent): void {
        const mousePoint = new THREE.Vector2(
            (event.offsetX / this.mapView.canvas.width) * 2 - 1,
            -(event.offsetY / this.mapView.canvas.height) * 2 + 1
        );

        const intersectionResult = this.findObjectAt(mousePoint);
        if (intersectionResult) {
            const { object } = intersectionResult;
            this.removeObject(object.id);
        }
    }

    private handleDrawModeClick(event: MouseEvent): void {
        if (this.drawMode === DrawMode.NONE) return;

        // Get clicked geographic coordinates
        const geoCoord = this.getGeoCoordinateFromMouse(
            new THREE.Vector2(event.offsetX, event.offsetY)
        );
        if (!geoCoord) return;

        // If not started drawing yet, start drawing now
        if (!this.isDrawing) {
            this.startDrawing(event);
        }

        this.tempVertices.push(geoCoord);

        // Remove previous temporary object
        if (this.tempObject) {
            this.rootObject.remove(this.tempObject);
            this.tempObject.dispose();
        }

        // Create temporary object based on current drawing mode
        switch (this.drawMode) {
            case DrawMode.POINT:
                this.tempObject = this.createPointObject(this.mapView, geoCoord);
                this.finishDrawing();
                break;
            case DrawMode.LINE:
                if (this.tempVertices.length >= 2) {
                    this.tempObject = this.createDrawLine(this.mapView, this.tempVertices);
                } else if (this.tempVertices.length === 1) {
                    // Create preview point
                    this.tempObject = this.createPointObject(this.mapView, geoCoord);
                }
                break;
            case DrawMode.POLYGON:
                if (this.tempVertices.length >= 3) {
                    this.tempObject = this.createDrawPolygon(this.mapView, this.tempVertices);
                } else if (this.tempVertices.length === 1) {
                    this.tempObject = this.createPointObject(this.mapView, geoCoord);
                } else if (this.tempVertices.length === 2) {
                    this.tempObject = this.createDrawLine(this.mapView, this.tempVertices);
                }
                break;
        }

        // Update temporary object
        if (this.tempObject) {
            this.rootObject.add(this.tempObject);
        }
    }

    private handleDeleteModeClick(event: MouseEvent, mousePoint: THREE.Vector2): void {
        const intersectionResult = this.findObjectAt(mousePoint);
        if (intersectionResult) {
            const { object } = intersectionResult;
            this.removeObject(object.id);
        }
    }

    private handleDrag(event: MouseEvent): void {
        if (!this.dragObject || !this.dragStartGeoCoord || this.dragStartHeight === null) return;

        const currentMousePoint = new THREE.Vector2(event.offsetX, event.offsetY);

        // Use the plane where the start point is located to calculate intersection
        const currentGeoCoord = this.getIntersectionOnDragSurface(
            currentMousePoint,
            this.dragStartGeoCoord,
            this.dragStartHeight
        );

        if (!currentGeoCoord) return;

        if (this.dragVertexIndex >= 0) {
            // Vertex drag - force maintain original height
            const newVertex = new GeoCoordinates(
                currentGeoCoord.latitude,
                currentGeoCoord.longitude,
                this.dragStartHeight
            );

            this.dragObject.updateVertex(this.dragVertexIndex, newVertex);

            // Update height handle position
            if (
                this.selectedVertexObject === this.dragObject &&
                this.selectedVertexIndex === this.dragVertexIndex
            ) {
                let vertexPoint: PointObject | null = null;

                if (this.dragObject instanceof DrawLine) {
                    const vertexPoints = this.dragObject.getVertexPoints();
                    if (this.dragVertexIndex < vertexPoints.length) {
                        vertexPoint = vertexPoints[this.dragVertexIndex];
                    }
                } else if (this.dragObject instanceof DrawPolygon) {
                    const vertexPoints = this.dragObject.getVertexPoints();
                    if (this.dragVertexIndex < vertexPoints.length) {
                        vertexPoint = vertexPoints[this.dragVertexIndex];
                    }
                }

                if (vertexPoint) {
                    this.heightAdjustManager.attachToPoint(vertexPoint);
                }
            }
        } else {
            // Object overall drag - maintain relative height of all vertices
            const deltaLat = currentGeoCoord.latitude - this.dragStartGeoCoord.latitude;
            const deltaLon = currentGeoCoord.longitude - this.dragStartGeoCoord.longitude;

            const vertices = this.dragObject.getVertices();
            const newVertices = vertices.map(
                vertex =>
                    new GeoCoordinates(
                        vertex.latitude + deltaLat,
                        vertex.longitude + deltaLon,
                        vertex.altitude !== undefined ? vertex.altitude : this.dragStartHeight!
                    )
            );
            this.dragObject.setVertices(newVertices);
        }

        // Update start coordinates to current position
        this.dragStartGeoCoord = currentGeoCoord;

        this.dispatchEvent({
            type: DrawEventNames.OBJECT_MODIFIED,
            object: this.dragObject
        } as DrawEvent);

        // Trigger object modification end event
        this.dispatchEvent({
            type: DrawEventNames.OBJECT_MODIFIED_END,
            object: this.dragObject
        } as DrawEvent);
    }

    private getIntersectionOnDragSurface(
        mousePoint: THREE.Vector2,
        startGeoCoord: GeoCoordinates,
        height: number
    ): GeoCoordinates | null {
        try {
            const mouseCoords = new THREE.Vector2(
                (mousePoint.x / this.mapView.canvas.width) * 2 - 1,
                -(mousePoint.y / this.mapView.canvas.height) * 2 + 1
            );

            const raycaster = new THREE.Raycaster();
            raycaster.setFromCamera(mouseCoords, this.mapView.camera);

            // Convert start point to world coordinates
            const startWorldPoint = this.mapView.projection.projectPoint(
                startGeoCoord,
                new THREE.Vector3()
            );

            if (this.mapView.projection.type === ProjectionType.Spherical) {
                // Spherical projection: Use tangent plane of sphere where start point is located
                const normal = startWorldPoint.clone().normalize();

                // Create tangent plane (through start point and perpendicular to normal vector)
                const plane = new THREE.Plane(normal, -startWorldPoint.dot(normal));

                const intersection = new THREE.Vector3();
                if (raycaster.ray.intersectPlane(plane, intersection)) {
                    // Project intersection point back to sphere, but maintain correct height
                    return this.projectToSphereWithHeight(intersection, height);
                }
            } else {
                // Planar projection: Use horizontal plane where start point is located
                const planeHeight = startWorldPoint.z; // Use Z coordinate of start point

                // Create horizontal plane
                const plane = new THREE.Plane(new THREE.Vector3(0, 0, 1), -planeHeight);

                const intersection = new THREE.Vector3();
                if (raycaster.ray.intersectPlane(plane, intersection)) {
                    // Convert intersection point to geographic coordinates
                    const geoCoord = this.mapView.projection.unprojectPoint(intersection);
                    geoCoord.altitude = height;
                    return geoCoord;
                }
            }
        } catch (error) {
            console.error("Error getting surface intersection:", error);
            return null;
        }
    }

    private projectToSphereWithHeight(point: THREE.Vector3, height: number): GeoCoordinates {
        const earthRadius = 6371000; // Earth radius in meters
        const targetRadius = earthRadius + height;

        // Normalize point to sphere with target radius
        const normalized = point.clone().normalize();
        const onSphere = normalized.multiplyScalar(targetRadius);

        // Convert to geographic coordinates
        const geoCoord = this.mapView.projection.unprojectPoint(onSphere);
        geoCoord.altitude = height;
        return geoCoord;
    }

    /**
     * 编辑模式鼠标按下处理
     * @param event - 鼠标事件
     */
    private handleEditModeMouseDown(event: MouseEvent): void {
        const mousePoint = new THREE.Vector2(
            (event.offsetX / this.mapView.canvas.width) * 2 - 1,
            -(event.offsetY / this.mapView.canvas.height) * 2 + 1
        );

        // Check height handle interaction first
        if (this.checkHeightHandleInteraction(event)) {
            return;
        }

        // Find object at mouse position
        const intersectionResult = this.findObjectAt(mousePoint);
        if (intersectionResult) {
            const { object, vertexIndex } = intersectionResult;

            this.isDragging = true;
            this.hasDraggedDistance = false;
            this.dragObject = object;
            this.dragVertexIndex = vertexIndex;
            this.dragStartPoint.set(event.offsetX, event.offsetY);

            // Key: Get accurate coordinates of current mouse position on surface where object is located
            let surfaceCoord: GeoCoordinates | null = null;

            if (vertexIndex >= 0) {
                // Vertex drag - use actual position of vertex
                const vertices = object.getVertices();
                if (vertexIndex < vertices.length) {
                    this.dragStartGeoCoord = vertices[vertexIndex];
                    this.dragStartHeight =
                        vertices[vertexIndex].altitude !== undefined
                            ? vertices[vertexIndex].altitude
                            : 0;

                    // Get position of current mouse on surface where vertex is located
                    surfaceCoord = this.getIntersectionOnDragSurface(
                        new THREE.Vector2(event.offsetX, event.offsetY),
                        this.dragStartGeoCoord,
                        this.dragStartHeight
                    );
                }
            } else {
                // Object overall drag - use object center point
                this.dragStartGeoCoord = object.getCenter();
                this.dragStartHeight = this.dragStartGeoCoord.altitude || 0;

                // Get position of current mouse on surface where object is located
                surfaceCoord = this.getIntersectionOnDragSurface(
                    new THREE.Vector2(event.offsetX, event.offsetY),
                    this.dragStartGeoCoord,
                    this.dragStartHeight
                );
            }

            // If surface calculation succeeds, use surface coordinates as start point
            if (surfaceCoord) {
                this.dragStartGeoCoord = surfaceCoord;
            }

            this.mapControlsEnabledState = this.mapControls.enabled;
            this.updateCameraControlState();
            event.stopPropagation();
        }
    }

    private mapControlsEnabledState: boolean = true;

    private startDrawing(event: MouseEvent): void {
        this.isDrawing = true;
        this.tempVertices = [];

        // Save original enabled state of mapControls and immediately update camera control state
        this.mapControlsEnabledState = this.mapControls.enabled;
        this.updateCameraControlState();

        this.dispatchEvent({
            type: DrawEventNames.DRAW_START,
            mode: this.drawMode
        } as DrawEvent);
    }

    private readonly drawingHistory: DrawableObject[] = [];

    private finishDrawing(): void {
        if (!this.tempObject || this.tempVertices.length === 0) {
            this.cancelDrawing();
            return;
        }

        // When double-click completes drawing, immediately force disable camera
        if (this.isDoubleClickProcessing) {
            this.mapControls.enabled = false;
        }

        // Save to history
        this.drawingHistory.push(this.tempObject);

        this.addObject(this.tempObject);
        // Save reference for subsequent use
        const newObject = this.tempObject;
        this.tempObject = null;
        this.tempVertices = [];
        this.isDrawing = false;

        // During double-click processing, do not immediately restore camera state, let double-click processing logic handle it uniformly
        if (!this.isDoubleClickProcessing) {
            // Use dynamic camera control state management (delayed restoration)
            setTimeout(() => {
                this.updateCameraControlState();
            }, 100);
        }

        // Reset drawing mode to prevent continued drawing
        this.drawMode = DrawMode.EDIT;

        // Automatically select newly created object and enter edit mode
        this.selectObject(newObject);

        this.dispatchEvent({
            type: DrawEventNames.DRAW_END,
            mode: this.drawMode
        } as DrawEvent);
    }

    /**
     * Undo operation
     * @returns Whether undo was successful
     */
    public undo(): boolean {
        if (this.drawingHistory.length > 0) {
            const lastObject = this.drawingHistory.pop();
            if (lastObject && this.objects.has(lastObject.id)) {
                this.removeObject(lastObject.id);
                return true;
            }
        }
        return false;
    }

    private cancelDrawing(): void {
        if (this.tempObject) {
            this.rootObject.remove(this.tempObject);
            this.tempObject.dispose();
            this.tempObject = null;
        }
        this.tempVertices = [];
        this.isDrawing = false;

        // Immediately update camera control state
        this.updateCameraControlState();
    }

    /**
     * Find object at mouse position
     * @param mousePoint - Mouse point
     * @returns Object and vertex index
     */
    private findObjectAt(
        mousePoint: THREE.Vector2
    ): { object: DrawableObject; vertexIndex: number } | null {
        const raycaster = new THREE.Raycaster();
        raycaster.setFromCamera(mousePoint, this.mapView.getRteCamera());

        // Collect all interactive objects (including vertices)
        const interactableObjects: THREE.Object3D[] = [];

        this.objects.forEach(obj => {
            interactableObjects.push(obj);
        });

        if (this.tempObject) {
            interactableObjects.push(this.tempObject);
        }

        const intersects = raycaster.intersectObjects(interactableObjects, true);

        if (intersects.length > 0) {
            for (const intersect of intersects) {
                let currentObject = intersect.object;

                // Traverse upward through parent objects
                while (currentObject) {
                    // Check if it is a vertex
                    if (currentObject.userData.isVertexPoint) {
                        const parentObject = currentObject.userData.parentObject;
                        const vertexIndex = currentObject.userData.vertexIndex;

                        if (parentObject && vertexIndex !== undefined) {
                            return { object: parentObject, vertexIndex };
                        }
                    }

                    // Check if it is a regular object
                    for (const obj of this.objects.values()) {
                        // Directly compare object references, because DrawableObject now directly inherits from THREE.Object3D
                        if (obj === currentObject) {
                            return { object: obj, vertexIndex: -1 };
                        }
                    }

                    if (this.tempObject && this.tempObject === currentObject) {
                        return { object: this.tempObject, vertexIndex: -1 };
                    }

                    currentObject = currentObject.parent;
                }
            }
        }
        return null;
    }

    /**
     * Update drawing preview
     * @param event - Mouse event
     */
    protected updateDrawingPreview(event: MouseEvent): void {
        if (!this.isDrawing || this.tempVertices.length === 0) return;

        // Get geographic coordinates of mouse position
        const geoCoord = this.getGeoCoordinateFromMouse(
            new THREE.Vector2(event.offsetX, event.offsetY)
        );
        if (!geoCoord) return;

        // Remove previous preview object
        if (this.tempObject) {
            this.rootObject.remove(this.tempObject);
            this.tempObject.dispose();
            this.tempObject = null;
        }

        // Create preview object based on drawing mode
        const previewVertices = [...this.tempVertices, geoCoord];

        switch (this.drawMode) {
            case DrawMode.LINE:
                if (previewVertices.length >= 2) {
                    this.tempObject = this.createDrawLine(this.mapView, previewVertices);
                } else if (previewVertices.length === 1) {
                    // Even if there is only one point, create a preview object to trigger label updates
                    this.tempObject = this.createPointObject(this.mapView, previewVertices[0]);
                }
                break;
            case DrawMode.POLYGON:
                if (previewVertices.length >= 3) {
                    this.tempObject = this.createDrawPolygon(this.mapView, previewVertices);
                } else if (previewVertices.length === 2) {
                    this.tempObject = this.createDrawLine(this.mapView, previewVertices);
                } else if (previewVertices.length === 1) {
                    // Even if there is only one point, create a preview object to trigger label updates
                    this.tempObject = this.createPointObject(this.mapView, previewVertices[0]);
                }
                break;
        }

        // Add preview object to scene
        if (this.tempObject) {
            this.rootObject.add(this.tempObject);
        }
    }

    /**
     * Get canvas position
     * @param event - Mouse point
     * @param canvas - Canvas element
     * @returns Canvas position
     */
    getCanvasPosition(event: THREE.Vector2, canvas: HTMLCanvasElement): { x: number; y: number } {
        const { left, top } = canvas.getBoundingClientRect();
        return { x: event.x, y: event.y };
    }

    /**
     * Get tile render data sources
     * @returns Array of tile render data sources
     */
    protected getTilesRenderDataSources(): ITileRenderDataSource[] {
        return this.mapView.dataSources.filter(
            item => (item as any).raycast
        ) as unknown as ITileRenderDataSource[];
    }

    /**
     * Get geographic coordinates from mouse position
     * @param mousePoint - Mouse point
     * @param fixedHeight - Fixed height (optional)
     * @returns Geographic coordinates or null
     */
    private getGeoCoordinateFromMouse(
        mousePoint: THREE.Vector2,
        fixedHeight?: number
    ): GeoCoordinates | null {
        try {
            const canvasPos = this.getCanvasPosition(mousePoint, this.mapView.canvas);
            const rayCaster = this.mapView.pickHandler.setupRaycaster(canvasPos.x, canvasPos.y);
            const intersection: THREE.Intersection[] = [];

            this.getTilesRenderDataSources().forEach(datasource => {
                datasource.raycast(rayCaster, intersection);
            });

            if (intersection.length > 0) {
                intersection.sort((a, b) => a.distance - b.distance);
                const geoCoord = this.mapView.projection.unprojectPoint(
                    intersection[0].point.add(this.mapView.camera.position)
                );
                if (fixedHeight !== undefined) {
                    geoCoord.altitude = fixedHeight;
                }
                return geoCoord;
            }

            // Use collision point detection feature provided by mapView
            const worldPoint = this.mapControls.pickPoint(mousePoint.x, mousePoint.y);
            if (worldPoint) {
                const geoCoord = this.mapView.projection.unprojectPoint(worldPoint);
                if (fixedHeight !== undefined) {
                    geoCoord.altitude = fixedHeight;
                }
                return geoCoord;
            }

            return null;
        } catch (error) {
            console.error("Error getting geo coordinate:", error);
            return null;
        }
    }

    /**
     * Get horizontal geographic coordinates
     * @param mousePoint - Mouse point
     * @param height - Height
     * @returns Geographic coordinates or null
     */
    private getHorizontalGeoCoordinateFromMouse(
        mousePoint: THREE.Vector2,
        height: number
    ): GeoCoordinates | null {
        // Directly use ground coordinates, but replace height
        const groundCoord = this.getGeoCoordinateFromMouse(mousePoint);
        if (groundCoord) {
            groundCoord.altitude = height;
        }
        return groundCoord;
    }

    /**
     * Select object
     * @param object - Object
     */
    private selectObject(object: DrawableObject): void {
        // Clear vertex selection
        this.clearVertexSelection();

        if (this.selectedObject) {
            this.selectedObject.setSelected(false);
            this.selectedObject.setEditing(false);
        }

        this.selectedObject = object;
        object.setSelected(true);

        // If a regular point object is selected, attach height handle
        if (object instanceof PointObject && !object.isVertex) {
            this.heightAdjustManager.attachToPoint(object);
        }

        // Delay updating camera control state
        setTimeout(() => {
            this.updateCameraControlState();
        }, 100);

        this.dispatchEvent({
            type: DrawEventNames.OBJECT_SELECTED,
            object
        } as DrawEvent);
    }

    /**
     * Set point height
     * @param pointId - Point ID
     * @param height - Height
     * @returns Whether setting was successful
     */
    public setPointHeight(pointId: number, height: number): boolean {
        const object = this.objects.get(pointId);
        if (object && object instanceof PointObject) {
            object.setHeight(height);
            object.update();
            return true;
        }
        return false;
    }

    /**
     * Get point height
     * @param pointId - Point ID
     * @returns Height or null
     */
    public getPointHeight(pointId: number): number | null {
        const object = this.objects.get(pointId);
        if (object && object instanceof PointObject) {
            return object.getHeight();
        }
        return null;
    }

    private clearSelection(): void {
        // Clear vertex selection
        this.clearVertexSelection();

        if (this.selectedObject) {
            this.selectedObject.setSelected(false);
            this.selectedObject.setEditing(false);
            this.selectedObject = null;
        }

        // Delay updating camera control state
        setTimeout(() => {
            this.updateCameraControlState();
        }, 100);

        // Restore default cursor
        this.mapView.canvas.style.cursor = "default";
    }

    /**
     * Release resources
     */
    public dispose(): void {
        this.heightAdjustManager.dispose();
        this.windowHandler.clearEvent();
        this.clearAll();
        this.mapView.removeEventListener(MapViewEventNames.Render, this.onFrameUpdate);
    }

    /**
     * Get height adjustment manager
     * @returns Height adjustment manager
     */
    public getHeightAdjustManager(): HeightAdjustManager {
        return this.heightAdjustManager;
    }

    /**
     * Create point object
     * @param mapView - Map view
     * @param position - Position
     * @param isVertex - Whether it is a vertex
     * @param id - ID
     * @returns Point object
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
     * Create draw line object
     * @param mapView - Map view
     * @param vertices - Vertex array
     * @param id - ID
     * @returns Draw line object
     */
    protected createDrawLine(mapView: MapView, vertices: GeoCoordinates[], id?: string): DrawLine {
        return new DrawLine(mapView, vertices, id);
    }

    /**
     * Create draw polygon object
     * @param mapView - Map view
     * @param vertices - Vertex array
     * @param id - ID
     * @returns Draw polygon object
     */
    protected createDrawPolygon(
        mapView: MapView,
        vertices: GeoCoordinates[],
        id?: string
    ): DrawPolygon {
        return new DrawPolygon(mapView, vertices, id);
    }

    /**
     * Update measurement label display (for MeasureToolControls use)
     * @protected
     */
    protected updateMeasureLabels(): void {
        // Empty implementation, to be overridden by MeasureToolControls
    }

    /**
     * Get temporary vertices (for MeasureToolControls use)
     * @protected
     */
    protected getTempVertices(): GeoCoordinates[] {
        return this.tempVertices;
    }

    /**
     * Get drawing state (for MeasureToolControls use)
     * @protected
     */
    protected getIsDrawing(): boolean {
        return this.isDrawing;
    }

    /**
     * Get temporary object (for MeasureToolControls use)
     * @protected
     */
    protected getTempObject(): DrawableObject | null {
        return this.tempObject;
    }
}
