/* Copyright (C) 2025 flywave.gl contributors */

import { GeoCoordinates } from "@flywave/flywave-geoutils";
import { type MapView } from "@flywave/flywave-mapview";
import * as THREE from "three";
import { Line2 } from "three/examples/jsm/lines/Line2.js";
import { LineGeometry } from "three/examples/jsm/lines/LineGeometry.js";
import { LineMaterial } from "three/examples/jsm/lines/LineMaterial.js";
import { WindowEventHandler } from "@flywave/flywave-utils";

import { DrawableObject } from "./DrawableObject";
import { VertexHandle } from "./VertexHandle";

export class DrawLine extends DrawableObject {
    protected outlineLine: Line2 | null = null;
    protected line: Line2;
    protected lineContainer: THREE.Object3D;
    protected baseLineWidth: number = 2;
    protected lineColor: number = 0xffff00;
    protected vertexHandles: VertexHandle[] = [];

    constructor(
        mapView: MapView,
        vertices: GeoCoordinates[] = [],
        windowHandler: WindowEventHandler,
        id?: string
    ) {
        super(mapView, id);
        this.vertices = vertices;

        const geometry = new LineGeometry();
        const material = this.createLineMaterial(this.lineColor, this.baseLineWidth);

        this.line = new Line2(geometry, material);
        this.line.renderOrder = 1;

        this.lineContainer = new THREE.Object3D();
        this.lineContainer.add(this.line);
        this.add(this.lineContainer);

        this.windowHandler = windowHandler;
        this.createVertexHandles();
        this.createOutlineObject();
        this.update();
    }

    private windowHandler: WindowEventHandler;

    protected createLineMaterial(color: number, linewidth: number): LineMaterial {
        return new LineMaterial({
            color,
            linewidth,
            dashed: false,
            opacity: 1.0,
            depthTest: false,
            transparent: true,
            alphaToCoverage: true
        });
    }

    public updateVertex(index: number, newVertex: GeoCoordinates): void {
        if (index >= 0 && index < this.vertices.length) {
            this.vertices[index] = newVertex;
            this.update();
        }
    }

    public moveTo(newPosition: GeoCoordinates): void {
        if (this.vertices.length === 0) return;

        const center = this.getCenter();
        const deltaLat = newPosition.latitude - center.latitude;
        const deltaLon = newPosition.longitude - center.longitude;

        for (let i = 0; i < this.vertices.length; i++) {
            const vertex = this.vertices[i];
            const newVertex = new GeoCoordinates(
                vertex.latitude + deltaLat,
                vertex.longitude + deltaLon,
                vertex.altitude
            );
            this.vertices[i] = newVertex;
        }

        this.update();
    }

    public setVertices(vertices: GeoCoordinates[]): void {
        if (vertices.length < 2) return;

        this.vertices = vertices;
        this.createVertexHandles();
        this.update();
    }

    public getCenter(): GeoCoordinates {
        if (!this.vertices || this.vertices.length === 0) {
            return new GeoCoordinates(0, 0);
        }

        let avgLat = 0;
        let avgLon = 0;
        let avgAlt = 0;

        this.vertices.forEach(vertex => {
            avgLat += vertex.latitude;
            avgLon += vertex.longitude;
            avgAlt += vertex.altitude || 0;
        });

        return new GeoCoordinates(
            avgLat / this.vertices.length,
            avgLon / this.vertices.length,
            avgAlt / this.vertices.length
        );
    }

    public update(): void {
        if (!this.vertices || this.vertices.length < 2) {
            this.line.visible = false;
            return;
        } else {
            this.line.visible = true;
        }

        const center = this.getCenter();
        const centerProjected = this.mapView.projection.projectPoint(center);

        this.lineContainer.position.copy(centerProjected);

        const positions = this.vertices.map(vertex => {
            const projected = this.mapView.projection.projectPoint(vertex);
            return new THREE.Vector3(
                projected.x - centerProjected.x,
                projected.y - centerProjected.y,
                projected.z - centerProjected.z
            );
        });

        const vertices = positions.flatMap(pos => [pos.x, pos.y, pos.z]);
        const geometry = this.line.geometry as LineGeometry;
        geometry.setPositions(vertices);

        if (this.vertexHandles.length !== this.vertices.length) {
            this.createVertexHandles();
        } else {
            for (let i = 0; i < this.vertices.length; i++) {
                if (i < this.vertexHandles.length) {
                    this.vertexHandles[i].setPosition(this.vertices[i]);
                    this.vertexHandles[i].update();
                }
            }
        }

        this.updateVisuals();
    }

    public setVertexSelected(index: number, selected: boolean): void {
        if (index >= 0 && index < this.vertexHandles.length) {
            this.vertexHandles[index].setSelected(selected);
        }
    }

    public getVertexSelected(index: number): boolean {
        return index >= 0 && index < this.vertexHandles.length
            ? this.vertexHandles[index].getSelected()
            : false;
    }

    protected updateVisuals(): void {
        const material = this.line.material as LineMaterial;
        if (this.isSelected) {
            material.color.set(0x00ff00);
            material.linewidth = this.baseLineWidth * 2;

            this.vertexHandles.forEach(handle => {
                handle.setSelected(false);
            });
        } else {
            material.color.set(this.lineColor);
            material.linewidth = this.baseLineWidth;
        }
    }

    public toGeoJSON(): { type: string; coordinates: number[][] } {
        return {
            type: "LineString",
            coordinates: this.vertices.map(vertex => [
                vertex.longitude,
                vertex.latitude,
                vertex.altitude || 0
            ])
        };
    }

    protected onCameraPositionChanged(): void {
        this.vertexHandles.forEach(handle => {
            handle.update();
        });
    }

    public dispose(): void {
        super.dispose();

        if (this.lineContainer.parent) {
            this.lineContainer.parent.remove(this.lineContainer);
        }

        this.line.geometry.dispose();
        (this.line.material as THREE.Material).dispose();

        this.vertexHandles.forEach(handle => {
            handle.dispose();
        });
        this.vertexHandles = [];

        if (this.outlineLine) {
            this.outlineLine.geometry.dispose();
            (this.outlineLine.material as THREE.Material).dispose();
            this.outlineLine = null;
        }
    }

    public getVertexHandles(): VertexHandle[] {
        return this.vertexHandles;
    }

    protected createOutlineObject(): void {
        const mainGeometry = this.line.geometry;
        const material = this.createOutlineMaterial();

        this.outlineLine = new Line2(mainGeometry, material);
        this.outlineLine.renderOrder = -10;
        this.outlineLine.raycast = () => {};

        this.lineContainer.add(this.outlineLine);
    }

    protected createOutlineMaterial(): LineMaterial {
        return new LineMaterial({
            color: 0xffd700,
            linewidth: 3,
            dashed: true,
            dashSize: 0.8,
            gapSize: 0.4,
            depthTest: false,
            depthWrite: false,
            transparent: true,
            opacity: 0.8
        });
    }

    protected createVertexHandles(): void {
        this.vertexHandles.forEach(handle => {
            this.remove(handle);
            handle.dispose();
        });
        this.vertexHandles = [];

        for (let i = 0; i < this.vertices.length; i++) {
            const handle = this.createVertexHandle(this.vertices[i]);

            handle.userData.vertexIndex = i;
            handle.userData.parentObject = this;

            this.setupHandleEvents(handle, i);

            this.vertexHandles.push(handle);
            this.add(handle);
        }
    }

    protected createVertexHandle(position: GeoCoordinates): VertexHandle {
        return new VertexHandle({
            position,
            mapView: this.mapView,
            windowHandler: this.windowHandler,
            autoHeightHandle: true
        });
    }

    private setupHandleEvents(handle: VertexHandle, index: number): void {
        handle.on("drag", (h: VertexHandle, newPosition: GeoCoordinates) => {
            this.updateVertex(index, newPosition);
        });

        handle.on("heightChange", (h: VertexHandle, newHeight: number) => {
            if (index < this.vertices.length) {
                this.vertices[index].altitude = newHeight;
                this.update();
            }
        });

        handle.on("selected", (h: VertexHandle, selected: boolean) => {});

        handle.on("hovered", (h: VertexHandle, hovered: boolean) => {});
    }
}
