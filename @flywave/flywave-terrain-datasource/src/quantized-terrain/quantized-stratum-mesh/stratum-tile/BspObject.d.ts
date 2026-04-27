import * as THREE from "three";
import { Brush } from "three-bvh-csg";
/**
 * Abstract base class for BSP (Binary Space Partitioning) objects.
 * Provides functionality for BSP operations and geometry clipping.
 */
export declare abstract class BspObject {
    geometry: THREE.BufferGeometry;
    private readonly evaluator;
    private readonly bsp;
    constructor(geometry: THREE.BufferGeometry);
    /**
     * Abstract getter for the object's bounding box
     * @returns THREE.Box3 representing the bounding box
     */
    abstract get boundingSphere(): THREE.Sphere;
    /**
     * Clips the object's geometry using a BSP node
     * @param node - BSP node to use for clipping
     * @returns Clipped geometry or undefined if completely inside
     */
    clipGeometry(node: Brush | THREE.BufferGeometry, attributes?: string[]): THREE.BufferGeometry | undefined;
}
