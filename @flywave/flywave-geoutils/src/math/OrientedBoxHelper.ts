/* Copyright (C) 2025 flywave.gl contributors */

import { type OrientedBox3 } from "./OrientedBox3";
import * as THREE from "three";

/**
 * A Three.js Object3D that visualizes an OrientedBox3 in the scene as a wireframe.
 */
export class OrientedBoxHelper extends THREE.Object3D {
    private readonly edges: THREE.LineSegments;
    private readonly boxGeometry: THREE.BoxGeometry;
    private readonly edgeMaterial: THREE.LineBasicMaterial;

    /**
     * Creates a wireframe visualizer for an OrientedBox3.
     * @param orientedBox The OrientedBox3 to visualize (optional, can be set later)
     * @param color The color of the wireframe (default: 0xffff00)
     * @param lineWidth The width of the wireframe lines (default: 1)
     */
    constructor(
        orientedBox?: OrientedBox3,
        color: THREE.ColorRepresentation = 0xffff00,
        lineWidth: number = 1
    ) {
        super();

        // Create edge material
        this.edgeMaterial = new THREE.LineBasicMaterial({
            color,
            linewidth: lineWidth
        });

        // Create geometry (will be scaled/rotated/positioned later)
        this.boxGeometry = new THREE.BoxGeometry(1, 1, 1);

        // Create edges (wireframe)
        const edgesGeometry = new THREE.EdgesGeometry(this.boxGeometry);
        this.edges = new THREE.LineSegments(edgesGeometry, this.edgeMaterial);

        // Add only the wireframe to this object
        this.add(this.edges);

        // Initialize with box if provided
        if (orientedBox) {
            this.update(orientedBox);
        }
    }

    /**
     * Updates the visualizer to match the given OrientedBox3.
     * @param orientedBox The OrientedBox3 to visualize
     */
    update(orientedBox: OrientedBox3): void {
        // Set position
        this.position.copy(orientedBox.position);

        // Set rotation (using the orientation matrix)
        const rotationMatrix = new THREE.Matrix4();
        orientedBox.getRotationMatrix(rotationMatrix);
        this.setRotationFromMatrix(rotationMatrix);

        // Set scale (extents are half-sizes, so multiply by 2)
        const size = orientedBox.getSize();
        this.scale.set(size.x, size.y, size.z);

        // Update the edges geometry if needed
        this.boxGeometry.computeBoundingBox();
        this.boxGeometry.computeBoundingSphere();

        // Dispose old edges geometry and create new one
        this.edges.geometry.dispose();
        const newEdgesGeometry = new THREE.EdgesGeometry(this.boxGeometry);
        this.edges.geometry = newEdgesGeometry;
    }

    /**
     * Sets the color of the wireframe.
     * @param color The new color
     */
    setColor(color: THREE.ColorRepresentation): void {
        this.edgeMaterial.color.set(color);
    }

    /**
     * Sets the line width of the wireframe.
     * Note: Line width may not be supported in all WebGL implementations.
     * @param lineWidth The new line width
     */
    setLineWidth(lineWidth: number): void {
        this.edgeMaterial.linewidth = lineWidth;
    }

    /**
     * Disposes of the visualizer's resources.
     */
    dispose(): void {
        this.boxGeometry.dispose();
        this.edges.geometry.dispose();
        this.edgeMaterial.dispose();
    }
}