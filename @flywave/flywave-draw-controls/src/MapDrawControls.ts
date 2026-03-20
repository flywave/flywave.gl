/* Copyright (C) 2025 flywave.gl contributors */

import { type GeoJson, type FeatureGeometry } from "@flywave/flywave-datasource-protocol";
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
import { PointObject } from "./PointObject";
import { IWindowEventHandler } from "@flywave/flywave-utils";

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
    protected readonly windowHandler: IWindowEventHandler;
    private drawMode: DrawMode = DrawMode.NONE;
    private readonly objects = new Map<number, DrawableObject>();
    private selectedObject: DrawableObject | null = null;
    private tempVertices: GeoCoordinates[] = [];
    private tempObject: DrawableObject | null = null;
    private isDrawing: boolean = false;
    private isDragging: boolean = false;
    private hasDraggedDistance: boolean = false;
    private readonly dragStartPoint: THREE.Vector2 = new THREE.Vector2();
    private dragObject: DrawableObject | null = null;
    private readonly DRAG_THRESHOLD = 5;

    private selectedVertexIndex: number = -1;
    private selectedVertexObject: DrawableObject | null = null;

    private isDoubleClickProcessing: boolean = false;
    private readonly rootObject: THREE.Group;
    private modeIndicator: HTMLElement;

    constructor(mapView: MapView, protected mapControls: MapControls) {
        super();
        this.mapView = mapView;
        this.windowHandler = mapControls.eventHandler;

        this.mapControlsEnabledState = mapControls.enabled;

        this.rootObject = new THREE.Group();
        this.mapView.scene.add(this.rootObject);

        this.createModeIndicator();
        this.setupEventListeners();

        this.mapView.addEventListener(MapViewEventNames.Render, this.onFrameUpdate);
    }

    visible(visible: boolean): void {
        this.rootObject.visible = visible;
    }

    private onFrameUpdate = (): void => {
        this.rootObject.position.copy(this.mapView.camera.position).negate();
    };

    private setupEventListeners(): void {
        const canvas = this.mapView.canvas;

        canvas.focus();

        this.windowHandler.addEventListener("mousedown", this.onMouseDown.bind(this));
        this.windowHandler.addEventListener("mousemove", this.onMouseMove.bind(this));
        this.windowHandler.addEventListener("mouseup", this.onMouseUp.bind(this));
        this.windowHandler.addEventListener("mouseclick", this.onClick.bind(this));
        this.windowHandler.addEventListener("dblclick", this.onDoubleClick.bind(this));

        canvas.addEventListener("mousedown", this.globalEventInterceptor.bind(this), true);
        canvas.addEventListener("mousemove", this.globalEventInterceptor.bind(this), true);
        canvas.addEventListener("mouseup", this.globalEventInterceptor.bind(this), true);
        canvas.addEventListener("click", this.globalEventInterceptor.bind(this), true);
        canvas.addEventListener("dblclick", this.globalEventInterceptor.bind(this), true);

        window.addEventListener("keydown", event => {
            if (event.key === "Escape") {
                this.cancelDrawing();
            } else if (event.key === "Delete" && this.selectedObject) {
                this.removeObject(this.selectedObject.id);
            } else if (event.ctrlKey && event.key === "z") {
                this.undo();
            }
        });
    }

    private globalEventInterceptor(event: Event): void {
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
                [DrawMode.EDIT]: "Edit Mode"
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
            if (this.selectedVertexObject && this.selectedVertexIndex >= 0) {
                this.mapView.canvas.style.cursor = "move";
            } else if (event) {
                const mousePoint = new THREE.Vector2(
                    (event.offsetX / this.mapView.canvas.width) * 2 - 1,
                    -(event.offsetY / this.mapView.canvas.height) * 2 + 1
                );

                const intersectedObject = this.findObjectAt(mousePoint);
                if (intersectedObject) {
                    if (intersectedObject.vertexIndex >= 0) {
                        this.mapView.canvas.style.cursor = "pointer";
                    } else {
                        this.mapView.canvas.style.cursor = "move";
                    }
                } else {
                    this.mapView.canvas.style.cursor = "default";
                }
            } else {
                this.mapView.canvas.style.cursor = "default";
            }
        } else {
            this.mapView.canvas.style.cursor = "default";
        }
    }

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

    public clearAll(): void {
        this.objects.forEach(object => {
            object.dispose();
        });
        this.objects.clear();
        this.selectedObject = null;
    }

    public getObjects(): DrawableObject[] {
        return Array.from(this.objects.values());
    }

    public getObject(id: number): DrawableObject | undefined {
        return this.objects.get(id);
    }

    public exportToGeoJSON(): GeoJson {
        return {
            type: "FeatureCollection",
            features: Array.from(this.objects.values()).map(object => ({
                type: "Feature",
                geometry: object.toGeoJSON() as FeatureGeometry,
                properties: {
                    id: object.id,
                    type: object.constructor.name
                }
            }))
        };
    }

    public addObjects(objects: DrawableObject[]): void {
        objects.forEach(object => {
            this.addObject(object);
        });
    }

    private onMouseDown(event): void {
        if (this.drawMode === DrawMode.NONE) return;

        this.dragStartPoint.set(event.offsetX, event.offsetY);

        if (this.drawMode === DrawMode.EDIT) {
            this.handleEditModeMouseDown(event);
        } else if (this.drawMode === DrawMode.DELETE) {
            this.handleDeleteModeMouseDown(event);
        }
    }

    protected triggerLabelUpdate(): void { }

    private onMouseMove(event): void {
        this.updateCursorStyle(event);

        this.mapView.update();

        if (this.isDragging && !this.hasDraggedDistance) {
            const currentMousePoint = new THREE.Vector2(event.offsetX, event.offsetY);
            const distance = currentMousePoint.distanceTo(this.dragStartPoint);

            if (distance > this.DRAG_THRESHOLD) {
                this.hasDraggedDistance = true;
            }
        }

        if (this.isDragging && this.hasDraggedDistance) {
            this.handleDrag(event);
            return;
        }

        if (
            this.isDrawing &&
            (this.drawMode === DrawMode.LINE || this.drawMode === DrawMode.POLYGON)
        ) {
            this.updateDrawingPreview(event);
            this.triggerLabelUpdate();
        }
    }

    private onMouseUp(event: MouseEvent): void {
        this.mapView.update();

        if (this.isDragging) {
            if (!this.hasDraggedDistance) {
                this.isDragging = false;
                this.dragObject = null;
                this.dragStartGeoCoord = null;
                this.dragStartHeight = null;
                this.hasDraggedDistance = false;

                setTimeout(() => {
                    this.updateCameraControlState();
                }, 100);
                return;
            }

            this.isDragging = false;
            this.dragObject = null;
            this.dragStartGeoCoord = null;
            this.dragStartHeight = null;
            this.hasDraggedDistance = false;

            if (this.dragObject) {
                this.dispatchEvent({
                    type: DrawEventNames.OBJECT_MODIFIED_END,
                    object: this.dragObject
                } as DrawEvent);
            }

            setTimeout(() => {
                this.updateCameraControlState();
            }, 100);
            return;
        }

        setTimeout(() => {
            this.updateCameraControlState();
        }, 100);
    }

    private dragStartGeoCoord: GeoCoordinates | null = null;
    private dragStartHeight: number | null = null;

    private handleEditModeClick(event: MouseEvent, mousePoint: THREE.Vector2): void {
        const intersectionResult = this.findObjectAt(mousePoint);
        if (intersectionResult) {
            const { object, vertexIndex } = intersectionResult;

            if (vertexIndex >= 0) {
                this.selectVertex(object, vertexIndex);
            } else {
                this.selectObject(object);
            }
        } else {
            this.clearSelection();
        }
    }

    private onClick(event: MouseEvent): void {
        if (this.drawMode === DrawMode.NONE) return;

        this.mapView.update();

        const mousePoint = new THREE.Vector2(
            (event.offsetX / this.mapView.canvas.width) * 2 - 1,
            -(event.offsetY / this.mapView.canvas.height) * 2 + 1
        );

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
            this.isDoubleClickProcessing = true;
            this.mapControls.enabled = false;

            event.preventDefault();
            event.stopPropagation();
            event.stopImmediatePropagation();

            this.finishDrawing();

            setTimeout(() => {
                this.isDoubleClickProcessing = false;

                setTimeout(() => {
                    this.updateCameraControlState();
                }, 50);
            }, 300);
        }
    }

    private handleDrawModeMouseDown(event: MouseEvent): void { }

    private selectVertex(object: DrawableObject, vertexIndex: number): void {
        if (this.selectedVertexObject === object && this.selectedVertexIndex === vertexIndex) {
            return;
        }

        this.clearVertexSelection();

        this.selectedVertexObject = object;
        this.selectedVertexIndex = vertexIndex;

        object.setVertexSelected(vertexIndex, true);

        setTimeout(() => {
            this.updateCameraControlState();
        }, 100);

        this.dispatchEvent({
            type: DrawEventNames.OBJECT_SELECTED,
            object
        } as DrawEvent);
    }

    private clearVertexSelection(): void {
        if (this.selectedVertexObject && this.selectedVertexIndex >= 0) {
            this.selectedVertexObject.setVertexSelected(this.selectedVertexIndex, false);
        }

        this.selectedVertexObject = null;
        this.selectedVertexIndex = -1;

        setTimeout(() => {
            this.updateCameraControlState();
        }, 100);
    }

    private updateCameraControlState(): void {
        if (this.isDoubleClickProcessing) {
            this.mapControls.enabled = false;
            return;
        }

        const shouldDisableCamera = this.isDragging || this.isDrawing;

        if (shouldDisableCamera) {
            this.mapControls.enabled = false;
        } else {
            if (!this.isDoubleClickProcessing) {
                this.mapControls.enabled = this.mapControlsEnabledState;
            } else {
                this.mapControls.enabled = false;
            }
        }
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

        const geoCoord = this.getGeoCoordinateFromMouse(
            new THREE.Vector2(event.offsetX, event.offsetY)
        );
        if (!geoCoord) return;

        if (!this.isDrawing) {
            this.startDrawing(event);
        }

        this.tempVertices.push(geoCoord);

        if (this.tempObject) {
            this.rootObject.remove(this.tempObject);
            this.tempObject.dispose();
        }

        switch (this.drawMode) {
            case DrawMode.POINT:
                this.tempObject = this.createPointObject(this.mapView, geoCoord);
                this.finishDrawing();
                break;
            case DrawMode.LINE:
                if (this.tempVertices.length >= 2) {
                    this.tempObject = this.createDrawLine(this.mapView, this.tempVertices);
                } else if (this.tempVertices.length === 1) {
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

        const currentGeoCoord = this.getIntersectionOnDragSurface(
            currentMousePoint,
            this.dragStartGeoCoord,
            this.dragStartHeight
        );

        if (!currentGeoCoord) return;

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

        this.dragStartGeoCoord = currentGeoCoord;

        this.dispatchEvent({
            type: DrawEventNames.OBJECT_MODIFIED,
            object: this.dragObject
        } as DrawEvent);

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

            const startWorldPoint = this.mapView.projection.projectPoint(
                startGeoCoord,
                new THREE.Vector3()
            );

            if (this.mapView.projection.type === ProjectionType.Spherical) {
                const normal = startWorldPoint.clone().normalize();
                const plane = new THREE.Plane(normal, -startWorldPoint.dot(normal));

                const intersection = new THREE.Vector3();
                if (raycaster.ray.intersectPlane(plane, intersection)) {
                    return this.projectToSphereWithHeight(intersection, height);
                }
            } else {
                const planeHeight = startWorldPoint.z;
                const plane = new THREE.Plane(new THREE.Vector3(0, 0, 1), -planeHeight);

                const intersection = new THREE.Vector3();
                if (raycaster.ray.intersectPlane(plane, intersection)) {
                    const geoCoord = this.mapView.projection.unprojectPoint(intersection);
                    geoCoord.altitude = height;
                    return geoCoord;
                }
            }
        } catch (error) {
            console.error("Error getting surface intersection:", error);
            return null;
        }

        return null;
    }

    private projectToSphereWithHeight(point: THREE.Vector3, height: number): GeoCoordinates {
        const earthRadius = 6371000;
        const targetRadius = earthRadius + height;

        const normalized = point.clone().normalize();
        const onSphere = normalized.multiplyScalar(targetRadius);

        const geoCoord = this.mapView.projection.unprojectPoint(onSphere);
        geoCoord.altitude = height;
        return geoCoord;
    }

    private handleEditModeMouseDown(event: MouseEvent): void {
        const mousePoint = new THREE.Vector2(
            (event.offsetX / this.mapView.canvas.width) * 2 - 1,
            -(event.offsetY / this.mapView.canvas.height) * 2 + 1
        );

        const intersectionResult = this.findObjectAt(mousePoint);
        if (intersectionResult) {
            const { object, vertexIndex } = intersectionResult;

            if (vertexIndex < 0) {
                this.isDragging = true;
                this.hasDraggedDistance = false;
                this.dragObject = object;
                this.dragStartPoint.set(event.offsetX, event.offsetY);

                this.dragStartGeoCoord = object.getCenter();
                this.dragStartHeight = this.dragStartGeoCoord.altitude || 0;

                const surfaceCoord = this.getIntersectionOnDragSurface(
                    new THREE.Vector2(event.offsetX, event.offsetY),
                    this.dragStartGeoCoord,
                    this.dragStartHeight
                );

                if (surfaceCoord) {
                    this.dragStartGeoCoord = surfaceCoord;
                }

                this.mapControlsEnabledState = this.mapControls.enabled;
                this.updateCameraControlState();
                event.stopPropagation();
            }
        }
    }

    private mapControlsEnabledState: boolean = true;

    private startDrawing(event: MouseEvent): void {
        this.isDrawing = true;
        this.tempVertices = [];

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

        if (this.isDoubleClickProcessing) {
            this.mapControls.enabled = false;
        }

        this.drawingHistory.push(this.tempObject);

        this.addObject(this.tempObject);
        const newObject = this.tempObject;
        this.tempObject = null;
        this.tempVertices = [];
        this.isDrawing = false;

        if (!this.isDoubleClickProcessing) {
            setTimeout(() => {
                this.updateCameraControlState();
            }, 100);
        }

        this.drawMode = DrawMode.EDIT;

        this.selectObject(newObject);

        this.dispatchEvent({
            type: DrawEventNames.DRAW_END,
            mode: this.drawMode
        } as DrawEvent);
    }

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

        this.updateCameraControlState();
    }

    private findObjectAt(
        mousePoint: THREE.Vector2
    ): { object: DrawableObject; vertexIndex: number } | null {
        const raycaster = new THREE.Raycaster();
        raycaster.setFromCamera(mousePoint, this.mapView.getRteCamera());

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

                while (currentObject) {
                    if (currentObject.userData.isVertexHandle) {
                        const parentObject = currentObject.userData.parentObject;
                        const vertexIndex = currentObject.userData.vertexIndex;

                        if (parentObject && vertexIndex !== undefined) {
                            return { object: parentObject, vertexIndex };
                        }
                    }

                    if (currentObject.userData.isVertexPoint) {
                        const parentObject = currentObject.userData.parentObject;
                        const vertexIndex = currentObject.userData.vertexIndex;

                        if (parentObject && vertexIndex !== undefined) {
                            return { object: parentObject, vertexIndex };
                        }
                    }

                    for (const obj of this.objects.values()) {
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

    protected updateDrawingPreview(event: MouseEvent): void {
        if (!this.isDrawing || this.tempVertices.length === 0) return;

        const geoCoord = this.getGeoCoordinateFromMouse(
            new THREE.Vector2(event.offsetX, event.offsetY)
        );
        if (!geoCoord) return;

        if (this.tempObject) {
            this.rootObject.remove(this.tempObject);
            this.tempObject.dispose();
            this.tempObject = null;
        }

        const previewVertices = [...this.tempVertices, geoCoord];

        switch (this.drawMode) {
            case DrawMode.LINE:
                if (previewVertices.length >= 2) {
                    this.tempObject = this.createDrawLine(this.mapView, previewVertices);
                } else if (previewVertices.length === 1) {
                    this.tempObject = this.createPointObject(this.mapView, previewVertices[0]);
                }
                break;
            case DrawMode.POLYGON:
                if (previewVertices.length >= 3) {
                    this.tempObject = this.createDrawPolygon(this.mapView, previewVertices);
                } else if (previewVertices.length === 2) {
                    this.tempObject = this.createDrawLine(this.mapView, previewVertices);
                } else if (previewVertices.length === 1) {
                    this.tempObject = this.createPointObject(this.mapView, previewVertices[0]);
                }
                break;
        }

        if (this.tempObject) {
            this.rootObject.add(this.tempObject);
        }
    }

    getCanvasPosition(event: THREE.Vector2, canvas: HTMLCanvasElement): { x: number; y: number } {
        const { left, top } = canvas.getBoundingClientRect();
        return { x: event.x, y: event.y };
    }

    protected getTilesRenderDataSources(): ITileRenderDataSource[] {
        return this.mapView.dataSources.filter(
            item => typeof (item as { raycast?: unknown }).raycast === "function"
        ) as unknown as ITileRenderDataSource[];
    }

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

    private selectObject(object: DrawableObject): void {
        this.clearVertexSelection();

        if (this.selectedObject) {
            this.selectedObject.setSelected(false);
            this.selectedObject.setEditing(false);
        }

        this.selectedObject = object;
        object.setSelected(true);

        setTimeout(() => {
            this.updateCameraControlState();
        }, 100);

        this.dispatchEvent({
            type: DrawEventNames.OBJECT_SELECTED,
            object
        } as DrawEvent);
    }

    private clearSelection(): void {
        this.clearVertexSelection();

        if (this.selectedObject) {
            this.selectedObject.setSelected(false);
            this.selectedObject.setEditing(false);
            this.selectedObject = null;
        }

        setTimeout(() => {
            this.updateCameraControlState();
        }, 100);

        this.mapView.canvas.style.cursor = "default";
    }

    public dispose(): void {
        this.windowHandler.clearEvent();
        this.clearAll();
        this.mapView.removeEventListener(MapViewEventNames.Render, this.onFrameUpdate);
    }

    protected createPointObject(
        mapView: MapView,
        position: GeoCoordinates,
        isVertex: boolean = false,
        id?: string
    ): PointObject {
        return new PointObject(mapView, position, isVertex, id);
    }

    protected createDrawLine(mapView: MapView, vertices: GeoCoordinates[], id?: string): DrawLine {
        return new DrawLine(mapView, vertices, this.windowHandler, id);
    }

    protected createDrawPolygon(
        mapView: MapView,
        vertices: GeoCoordinates[],
        id?: string
    ): DrawPolygon {
        return new DrawPolygon(mapView, vertices, this.windowHandler, id);
    }

    protected updateMeasureLabels(): void { }

    protected getTempVertices(): GeoCoordinates[] {
        return this.tempVertices;
    }

    protected getIsDrawing(): boolean {
        return this.isDrawing;
    }

    protected getTempObject(): DrawableObject | null {
        return this.tempObject;
    }
}
