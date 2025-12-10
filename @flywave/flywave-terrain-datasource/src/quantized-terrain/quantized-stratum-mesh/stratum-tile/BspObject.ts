/* Copyright (C) 2025 flywave.gl contributors */

import * as THREE from "three";
import { Brush, Evaluator, SUBTRACTION } from "three-bvh-csg";

/**
 * Abstract base class for BSP (Binary Space Partitioning) objects.
 * Provides functionality for BSP operations and geometry clipping.
 */
export abstract class BspObject {
    private readonly evaluator: Evaluator;
    private readonly bsp: Brush;
    constructor(public geometry: THREE.BufferGeometry) {
        this.evaluator = new Evaluator();
        this.bsp = new Brush(geometry);
    }
    /**
     * Abstract getter for the object's bounding box
     * @returns THREE.Box3 representing the bounding box
     */
    public abstract get boundingSphere(): THREE.Sphere;

    /**
     * Clips the object's geometry using a BSP node
     * @param node - BSP node to use for clipping
     * @returns Clipped geometry or undefined if completely inside
     */
    clipGeometry(
        node: Brush | THREE.BufferGeometry,
        attributes?: string[]
    ): THREE.BufferGeometry | undefined {
        if (node instanceof THREE.BufferGeometry) {
            node = new Brush(node);
        }

        this.evaluator.attributes = attributes || ["position", "uv", "normal"];

        const geometry = this.evaluator.evaluate(this.bsp, node, SUBTRACTION).geometry;
        if (!geometry.index) {
            const indexBuffer = new THREE.BufferAttribute(
                new Uint16Array(geometry.attributes.position.count),
                1
            );
            for (let i = 0; i < geometry.attributes.position.count; i++) {
                indexBuffer.setX(i, i);
            }
            geometry.setIndex(indexBuffer);
        }
        return geometry;
    }
}
