/* Copyright (C) 2025 flywave.gl contributors */

import { GeoCoordinates } from "@flywave/flywave-geoutils";
import { type MapView, MapViewEventNames } from "@flywave/flywave-mapview";
import * as THREE from "three";
import { EventDispatcher } from "three";

import { TerrainControlPoint, type TerrainControlPointConfig } from "./TerrainControlPoint";

export interface TerrainControlPointEventMap {
    pointAdded: { point: TerrainControlPoint };
    pointRemoved: { point: TerrainControlPoint };
    pointSelected: { point: TerrainControlPoint | null };
    pointModified: { point: TerrainControlPoint };
}

export class TerrainControlPointManager extends EventDispatcher<TerrainControlPointEventMap> {
    private mapView: MapView;
    private rootObject: THREE.Group;
    private points: Map<number, TerrainControlPoint> = new Map();
    private selectedPoint: TerrainControlPoint | null = null;
    private isAddingMode: boolean = false;

    constructor(mapView: MapView) {
        super();
        this.mapView = mapView;

        this.rootObject = new THREE.Group();
        mapView.scene.add(this.rootObject);

        mapView.addEventListener(MapViewEventNames.Render, this.onFrameUpdate);
    }

    private onFrameUpdate = (): void => {
        this.rootObject.position.copy(this.mapView.camera.position).negate();
    };

    public setAddingMode(enabled: boolean): void {
        this.isAddingMode = enabled;
    }

    public isAdding(): boolean {
        return this.isAddingMode;
    }

    public addPoint(
        position: GeoCoordinates,
        config: TerrainControlPointConfig = {}
    ): TerrainControlPoint {
        const point = new TerrainControlPoint(this.mapView, position, config);
        this.points.set(point.id, point);
        this.rootObject.add(point);

        this.dispatchEvent({ type: "pointAdded", point });

        return point;
    }

    public removePoint(id: number): boolean {
        const point = this.points.get(id);
        if (!point) {
            return false;
        }

        if (this.selectedPoint === point) {
            this.selectPoint(null);
        }

        point.dispose();
        this.points.delete(id);

        this.dispatchEvent({ type: "pointRemoved", point });

        return true;
    }

    public removeSelectedPoint(): boolean {
        if (!this.selectedPoint) {
            return false;
        }

        return this.removePoint(this.selectedPoint.id);
    }

    public getPoint(id: number): TerrainControlPoint | undefined {
        return this.points.get(id);
    }

    public getAllPoints(): TerrainControlPoint[] {
        return Array.from(this.points.values());
    }

    public getPointCount(): number {
        return this.points.size;
    }

    public selectPoint(id: number | null): void {
        if (this.selectedPoint) {
            this.selectedPoint.setSelected(false);
        }

        if (id === null) {
            this.selectedPoint = null;
        } else {
            const point = this.points.get(id);
            if (point) {
                this.selectedPoint = point;
                point.setSelected(true);
            } else {
                this.selectedPoint = null;
            }
        }

        this.dispatchEvent({ type: "pointSelected", point: this.selectedPoint });
    }

    public getSelectedPoint(): TerrainControlPoint | null {
        return this.selectedPoint;
    }

    public findPointAt(mousePoint: THREE.Vector2): TerrainControlPoint | null {
        const raycaster = new THREE.Raycaster();
        raycaster.setFromCamera(mousePoint, this.mapView.getRteCamera());

        const pointsArray = Array.from(this.points.values());
        const intersects = raycaster.intersectObjects(pointsArray as THREE.Object3D[], false);

        if (intersects.length > 0) {
            const intersect = intersects[0];
            let currentObj = intersect.object;

            while (currentObj) {
                for (const point of pointsArray) {
                    if (point === currentObj) {
                        return point;
                    }
                }
                currentObj = currentObj.parent;
            }
        }

        return null;
    }

    public clearAll(): void {
        this.selectPoint(null);

        this.points.forEach(point => {
            point.dispose();
        });
        this.points.clear();
    }

    public visible(isVisible: boolean): void {
        this.rootObject.visible = isVisible;
    }

    public dispose(): void {
        this.clearAll();
        this.mapView.scene.remove(this.rootObject);
        this.mapView.removeEventListener(MapViewEventNames.Render, this.onFrameUpdate);
    }
}
