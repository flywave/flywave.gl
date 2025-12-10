/* Copyright (C) 2025 flywave.gl contributors */

import { type Tile3DBatchMeshTechniqueParams } from "@flywave/flywave-datasource-protocol";
import * as THREE from "three";

import { B3DMBatchMaterial } from "../src/materials/B3DMBatchMaterial";

/**
 * Create a simple test scene to verify the functionality of the unpackStyle function
 */
export class B3DMUnpackStyleRenderTest {
    private readonly scene: THREE.Scene;
    private readonly camera: THREE.Camera;
    private readonly renderer: THREE.WebGLRenderer;
    private readonly material: B3DMBatchMaterial;

    constructor() {
        // Create scene
        this.scene = new THREE.Scene();
        this.camera = new THREE.PerspectiveCamera(75, 1, 0.1, 1000);
        this.renderer = new THREE.WebGLRenderer({ antialias: true });
        this.renderer.setSize(200, 200);

        // Create material
        this.material = new B3DMBatchMaterial({
            materialParams: {
                color: 0xcccccc,
                roughness: 0.5,
                metalness: 0.5
            },
            batchIdAttributeName: "_BATCHID"
        });
    }

    /**
     * Test the functionality of the unpackStyle function
     */
    testUnpackStyleFunction(): void {
        console.log("Testing unpackStyle function...");

        // Create test style data
        const batchStyles = new Map<number, Tile3DBatchMeshTechniqueParams>();

        // Add styles for different batchIds
        batchStyles.set(0, {
            color: "#ff0000", // Red
            opacity: 0.8,
            visible: true,
            offset: 0
        });

        batchStyles.set(1, {
            color: "#00ff00", // Green
            opacity: 0.6,
            visible: true,
            offset: 1
        });

        batchStyles.set(2, {
            color: "#0000ff", // Blue
            opacity: 0.4,
            visible: false, // Not visible
            offset: 2
        });

        // Set batch processing styles
        this.material.setBatchStyles(batchStyles);

        // Verify material uniforms
        const uniforms = (this.material as any).uniforms;
        console.log("Style texture created:", uniforms.styleTexture.value !== null);
        console.log(
            "Texture dimensions:",
            uniforms.textureWidth.value,
            "x",
            uniforms.textureHeight.value
        );

        // Create geometry and mesh for rendering test
        const geometry = new THREE.BufferGeometry();
        const vertices = new Float32Array([-0.5, -0.5, 0, 0.5, -0.5, 0, 0, 0.5, 0]);

        const batchIds = new Float32Array([0, 1, 2]); // Corresponding batchIds

        geometry.setAttribute("position", new THREE.BufferAttribute(vertices, 3));
        geometry.setAttribute("_BATCHID", new THREE.BufferAttribute(batchIds, 1));

        const mesh = new THREE.Mesh(geometry, this.material);
        this.scene.add(mesh);
        this.scene.add(new THREE.AmbientLight(0xffffff, 1));

        // Render one frame
        this.renderer.render(this.scene, this.camera);

        console.log("Render test completed successfully");
        console.log("If unpackStyle function works correctly, each vertex should have:");
        console.log("- Vertex 0: Red color with 0.8 opacity");
        console.log("- Vertex 1: Green color with 0.6 opacity");
        console.log("- Vertex 2: Not visible (discarded)");

        // Clean up resources
        this.cleanup();
    }

    /**
     * Clean up resources
     */
    private cleanup(): void {
        this.material.dispose();
        this.renderer.dispose();
    }
}

// Run tests
if (typeof window !== "undefined") {
    // Run in browser environment
    const test = new B3DMUnpackStyleRenderTest();
    test.testUnpackStyleFunction();
} else {
    // Export in Node.js environment
    console.log("B3DMUnpackStyleRenderTest module loaded");
}
