/* Copyright (C) 2025 flywave.gl contributors */

// src/DrawPolygon.ts

import { GeoCoordinates } from "@flywave/flywave-geoutils";
import { type MapView } from "@flywave/flywave-mapview";
import earcut from "earcut";
import * as THREE from "three";
import { Line2 } from "three/examples/jsm/lines/Line2";
import { LineGeometry } from "three/examples/jsm/lines/LineGeometry";
import { LineMaterial } from "three/examples/jsm/lines/LineMaterial";

import { DrawableObject } from "./DrawableObject";
import { PointObject } from "./PointObject";

export class DrawPolygon extends DrawableObject {
    // Change private properties to protected properties so that subclasses can access them
    protected mesh: THREE.Mesh;
    protected outline: Line2;
    protected fillColor: number = 0x00ff00;
    protected outlineColor: number = 0x0000ff;
    protected opacity: number = 0.6;
    protected verticesPoints: PointObject[] = [];
    protected edges: Line2[] = [];
    protected outlineEdges: Line2[] = [];

    constructor(mapView: MapView, vertices: GeoCoordinates[] = [], id?: string) {
        super(mapView, id);
        this.vertices = vertices;

        // Create face geometry
        const geometry = new THREE.BufferGeometry();
        const material = this.createPolygonMaterial(this.fillColor, this.opacity);

        this.mesh = new THREE.Mesh(geometry, material);
        this.mesh.renderOrder = 0;

        // Create outline line
        const outlineGeometry = new LineGeometry();
        const outlineMaterial = this.createOutlineMaterial(this.outlineColor);

        this.outline = new Line2(outlineGeometry, outlineMaterial);
        this.outline.renderOrder = 2;

        this.add(this.mesh);
        this.add(this.outline);

        // Initialize edges and outline edges
        this.createEdges();
        this.createOutlineObject();

        this.update();
    }

    // Change the material creation method to an overloadable method
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

    // Change the outline material creation method to an overloadable method
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
        // Clean up existing edges
        this.edges.forEach(edge => this.remove(edge));
        this.edges = [];

        // Create Line2 objects for each edge
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
        // Clean up existing outline edges
        this.outlineEdges.forEach(edge => this.remove(edge));
        this.outlineEdges = [];

        for (let i = 0; i < this.vertices.length; i++) {
            const geometry = new LineGeometry();
            const material = this.createOutlineEdgeMaterial();

            const line = new Line2(geometry, material);
            line.visible = false;
            line.renderOrder = 999;

            // Disable outline interaction
            line.userData.isOutline = true;
            line.raycast = () => {}; // Empty function, disable ray detection

            this.outlineEdges.push(line);
            this.add(line);
        }
    }

    // Change the outline edge material creation method to an overloadable method
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

    private createVerticesAndEdges(): void {
        this.verticesPoints.forEach(point => this.remove(point.getObject3D()));
        this.verticesPoints = [];

        for (let i = 0; i < this.vertices.length; i++) {
            // Use factory method to create vertex points, allowing subclass override
            const vertexPoint = this.createVertexPoint(this.vertices[i], true);
            this.verticesPoints.push(vertexPoint);
            this.add(vertexPoint.getObject3D());
        }

        // Recreate edges and outline edges
        this.createEdges();
        this.createOutlineObject();
    }

    // Add overloadable vertex point creation method
    protected createVertexPoint(position: GeoCoordinates, isVertex: boolean): PointObject {
        return new PointObject(this.mapView, position, isVertex);
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

        // Move all vertices
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

        // Calculate the geometric center of the polygon
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

        // Update face
        const flattenedVertices = worldVertices.flatMap(v => [v.x, v.y, v.z]);
        const indices = earcut(flattenedVertices, null, 3);

        this.mesh.geometry.setAttribute(
            "position",
            new THREE.Float32BufferAttribute(flattenedVertices, 3)
        );
        this.mesh.geometry.setIndex(indices);
        this.mesh.geometry.computeVertexNormals();

        // Update outline line
        const outlineVertices = [...worldVertices, worldVertices[0]];
        const outlinePositions = outlineVertices.flatMap(v => [v.x, v.y, v.z]);
        (this.outline.geometry as LineGeometry).setPositions(outlinePositions);

        // Update edges
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

        // Update outline edges
        this.updateOutline();

        // Update vertex positions
        for (let i = 0; i < this.verticesPoints.length && i < worldVertices.length; i++) {
            this.verticesPoints[i].position.copy(worldVertices[i]);
        }

        // If the number of vertices changes, recreate points and edges
        if (this.verticesPoints.length !== this.vertices.length) {
            this.createVerticesAndEdges();
        }
    }

    // Add vertex selection method
    public setVertexSelected(index: number, selected: boolean): void {
        if (index >= 0 && index < this.verticesPoints.length) {
            this.verticesPoints[index].setSelected(selected);

            // If the vertex is selected, display the height handle
            if (selected) {
                this.verticesPoints[index].setEditing(true);
            } else {
                this.verticesPoints[index].setEditing(false);
            }
        }
    }

    public getVertexSelected(index: number): boolean {
        return index >= 0 && index < this.verticesPoints.length
            ? this.verticesPoints[index].isSelected
            : false;
    }

    public getVertexPoints(): PointObject[] {
        return this.verticesPoints;
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

            // When the object is selected, all vertices are also displayed as selected
            this.verticesPoints.forEach(point => {
                point.setSelected(true);
            });
        } else {
            meshMaterial.color.set(this.fillColor);
            outlineMaterial.color.set(this.outlineColor);
            meshMaterial.opacity = this.opacity;
            outlineMaterial.linewidth = 3;

            // When the object is deselected, all vertices are also deselected
            this.verticesPoints.forEach(point => {
                point.setSelected(false);
                point.setEditing(false);
            });
        }
    }

    public toGeoJSON(): any {
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
        // Clean up outline edges
        this.outlineEdges.forEach(edge => {
            this.remove(edge);
            edge.geometry.dispose();
            (edge.material as THREE.Material).dispose();
        });
        this.outlineEdges = [];

        // Clean up edges
        this.edges.forEach(edge => {
            this.remove(edge);
            edge.geometry.dispose();
            (edge.material as THREE.Material).dispose();
        });
        this.edges = [];

        // Clean up other resources
        this.mesh.geometry.dispose();
        (this.mesh.material as THREE.Material).dispose();
        this.outline.geometry.dispose();
        (this.outline.material as THREE.Material).dispose();

        this.verticesPoints.forEach(point => {
            point.dispose();
        });
        this.verticesPoints = [];

        super.dispose();
    }

    public setOutlineVisible(visible: boolean): void {
        this.outlineEdges.forEach(edge => {
            edge.visible = visible;
        });
    }
}
