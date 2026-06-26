/* Copyright (C) 2025 flywave.gl contributors */

import { GeoCoordinates } from "@flywave/flywave-geoutils";
import { type MapView } from "@flywave/flywave-mapview";
import earcut from "earcut";
import * as THREE from "three";
import { Line2 } from "three/examples/jsm/lines/Line2.js";
import { LineGeometry } from "three/examples/jsm/lines/LineGeometry.js";
import { LineMaterial } from "three/examples/jsm/lines/LineMaterial.js";
import { WindowEventHandler } from "@flywave/flywave-utils";

import { DrawableObject } from "./DrawableObject";
import { VertexHandle } from "./VertexHandle";

export class DrawPolygon extends DrawableObject {
    protected mesh: THREE.Mesh;
    protected outline: Line2;
    protected fillColor: number = 0x00ff00;
    protected outlineColor: number = 0x0000ff;
    protected opacity: number = 0.6;
    protected vertexHandles: VertexHandle[] = [];
    protected edges: Line2[] = [];
    protected outlineEdges: Line2[] = [];

    constructor(
        mapView: MapView,
        vertices: GeoCoordinates[] = [],
        windowHandler: WindowEventHandler,
        id?: string
    ) {
        super(mapView, id);
        this.vertices = vertices;

        const geometry = new THREE.BufferGeometry();
        const material = this.createPolygonMaterial(this.fillColor, this.opacity);

        this.mesh = new THREE.Mesh(geometry, material);
        this.mesh.renderOrder = 0;

        const outlineGeometry = new LineGeometry();
        const outlineMaterial = this.createOutlineMaterial(this.outlineColor);

        this.outline = new Line2(outlineGeometry, outlineMaterial);
        this.outline.renderOrder = 2;

        this.add(this.mesh);
        this.add(this.outline);

        this.windowHandler = windowHandler;
        this.createEdges();
        this.createOutlineObject();
        this.update();
    }

    private windowHandler: WindowEventHandler;

    protected createPolygonMaterial(color: number, opacity: number): THREE.MeshPhongMaterial {
        return new THREE.MeshPhongMaterial({
            color,
            opacity,
            transparent: true,
            side: THREE.DoubleSide,
            specular: 0x111111,
            shininess: 30
        });
    }

    protected createOutlineMaterial(color: number): LineMaterial {
        return new LineMaterial({
            color,
            linewidth: 3,
            dashed: false,
            opacity: 1.0,
            transparent: true
        });
    }

    private createEdges(): void {
        this.edges.forEach(edge => this.remove(edge));
        this.edges = [];

        for (let i = 0; i < this.vertices.length; i++) {
            const geometry = new LineGeometry();
            const material = new LineMaterial({
                color: 0x888888,
                linewidth: 1,
                dashed: false,
                opacity: 1.0,
                transparent: true
            });

            const line = new Line2(geometry, material);
            line.renderOrder = 1;
            this.edges.push(line);
            this.add(line);
        }
    }

    protected createOutlineObject(): void {
        this.outlineEdges.forEach(edge => this.remove(edge));
        this.outlineEdges = [];

        for (let i = 0; i < this.vertices.length; i++) {
            const geometry = new LineGeometry();
            const material = this.createOutlineEdgeMaterial();

            const line = new Line2(geometry, material);
            line.visible = false;
            line.renderOrder = 999;

            line.userData.isOutline = true;
            line.raycast = () => {};

            this.outlineEdges.push(line);
            this.add(line);
        }
    }

    protected createOutlineEdgeMaterial(): LineMaterial {
        return new LineMaterial({
            color: 0xffd700,
            linewidth: 2,
            dashed: true,
            dashSize: 0.6,
            gapSize: 0.3,
            depthTest: false,
            depthWrite: false,
            transparent: true,
            opacity: 0.8
        });
    }

    protected updateOutline(): void {
        if (this.vertices.length < 3) return;

        const worldVertices = this.vertices.map(vertex =>
            this.mapView.projection.projectPoint(vertex)
        );

        for (let i = 0; i < this.vertices.length; i++) {
            const nextIndex = (i + 1) % this.vertices.length;
            const positions = [
                worldVertices[i].x,
                worldVertices[i].y,
                worldVertices[i].z,
                worldVertices[nextIndex].x,
                worldVertices[nextIndex].y,
                worldVertices[nextIndex].z
            ];

            if (i < this.outlineEdges.length) {
                (this.outlineEdges[i].geometry as LineGeometry).setPositions(positions);
            }
        }
    }

    private createVertexHandles(): void {
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

        this.createEdges();
        this.createOutlineObject();
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

        this.vertices = this.vertices.map(
            vertex =>
                new GeoCoordinates(
                    vertex.latitude + deltaLat,
                    vertex.longitude + deltaLon,
                    vertex.altitude
                )
        );
        this.update();
    }

    public getCenter(): GeoCoordinates {
        if (this.vertices.length === 0) {
            return new GeoCoordinates(0, 0);
        }

        let sumLat = 0;
        let sumLon = 0;
        let sumAlt = 0;

        this.vertices.forEach(vertex => {
            sumLat += vertex.latitude;
            sumLon += vertex.longitude;
            sumAlt += vertex.altitude || 0;
        });

        return new GeoCoordinates(
            sumLat / this.vertices.length,
            sumLon / this.vertices.length,
            sumAlt / this.vertices.length
        );
    }

    public update(): void {
        if (this.vertices.length < 3) return;

        const worldVertices = this.vertices.map(vertex =>
            this.mapView.projection.projectPoint(vertex)
        );

        const flattenedVertices = worldVertices.flatMap(v => [v.x, v.y, v.z]);
        const indices = earcut(flattenedVertices, null, 3);

        this.mesh.geometry.setAttribute(
            "position",
            new THREE.Float32BufferAttribute(flattenedVertices, 3)
        );
        this.mesh.geometry.setIndex(indices);
        this.mesh.geometry.computeVertexNormals();

        const outlineVertices = [...worldVertices, worldVertices[0]];
        const outlinePositions = outlineVertices.flatMap(v => [v.x, v.y, v.z]);
        (this.outline.geometry as LineGeometry).setPositions(outlinePositions);

        for (let i = 0; i < this.edges.length; i++) {
            if (i < worldVertices.length) {
                const nextIndex = (i + 1) % worldVertices.length;
                const edgePositions = [
                    worldVertices[i].x,
                    worldVertices[i].y,
                    worldVertices[i].z,
                    worldVertices[nextIndex].x,
                    worldVertices[nextIndex].y,
                    worldVertices[nextIndex].z
                ];
                (this.edges[i].geometry as LineGeometry).setPositions(edgePositions);
            }
        }

        this.updateOutline();

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

        if (this.edges.length !== this.vertices.length) {
            this.createEdges();
        }

        if (this.outlineEdges.length !== this.vertices.length) {
            this.createOutlineObject();
        }
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

    public getVertexHandles(): VertexHandle[] {
        return this.vertexHandles;
    }

    protected updateVisuals(): void {
        const meshMaterial = this.mesh.material as THREE.MeshPhongMaterial;
        const outlineMaterial = this.outline.material as LineMaterial;

        if (this.isSelected) {
            meshMaterial.color.set(0x00ff00);
            meshMaterial.emissive.set(0x00ff00);
            meshMaterial.emissiveIntensity = 0.3;
            outlineMaterial.color.set(0xffff00);
            meshMaterial.opacity = 0.8;
            outlineMaterial.linewidth = 4;
        } else {
            meshMaterial.color.set(this.fillColor);
            outlineMaterial.color.set(this.outlineColor);
            meshMaterial.opacity = this.opacity;
            outlineMaterial.linewidth = 3;
        }
    }

    public toGeoJSON(): { type: string; coordinates: number[][][] } {
        return {
            type: "Polygon",
            coordinates: [
                this.vertices.map(vertex => [
                    vertex.longitude,
                    vertex.latitude,
                    vertex.altitude || 0
                ])
            ]
        };
    }

    public dispose(): void {
        this.outlineEdges.forEach(edge => {
            this.remove(edge);
            edge.geometry.dispose();
            (edge.material as THREE.Material).dispose();
        });
        this.outlineEdges = [];

        this.edges.forEach(edge => {
            this.remove(edge);
            edge.geometry.dispose();
            (edge.material as THREE.Material).dispose();
        });
        this.edges = [];

        this.mesh.geometry.dispose();
        (this.mesh.material as THREE.Material).dispose();
        this.outline.geometry.dispose();
        (this.outline.material as THREE.Material).dispose();

        this.vertexHandles.forEach(handle => {
            handle.dispose();
        });
        this.vertexHandles = [];

        super.dispose();
    }

    public setOutlineVisible(visible: boolean): void {
        this.outlineEdges.forEach(edge => {
            edge.visible = visible;
        });
    }

    protected onCameraPositionChanged(): void {
        this.vertexHandles.forEach(handle => {
            handle.update();
        });
    }
}
