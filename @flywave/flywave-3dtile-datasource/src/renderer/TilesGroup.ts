/* Copyright (C) 2025 flywave.gl contributors */

import { type Intersection, type Raycaster, Group, Matrix4 } from "three";

import { type TilesRenderer } from "./TilesRenderer";

// Temporary matrix for calculations
const tempMat = new Matrix4();

/**
 * A specialized Group class for 3D Tiles rendering that optimizes matrix updates.
 *
 * This class extends Three.js's Group with specific optimizations for tile rendering:
 * 1. Only updates world matrices when the transform has actually changed
 * 2. Ignores the "force" parameter assumption that child tiles won't move independently
 * 3. Provides optimized raycasting through the tiles renderer
 */
export class TilesGroup extends Group {
    /** Flag identifying this as a TilesGroup instance */
    public readonly isTilesGroup: boolean = true;

    /** Reference to the parent tiles renderer */
    public tilesRenderer: TilesRenderer;

    /** Cached inverse of the world matrix */
    public matrixWorldInverse: Matrix4;

    /**
     * Creates a new TilesGroup
     * @param tilesRenderer The parent tiles renderer instance
     */
    constructor(tilesRenderer: TilesRenderer) {
        super();
        this.name = "TilesRenderer.TilesGroup";
        this.tilesRenderer = tilesRenderer;
        this.matrixWorldInverse = new Matrix4();
    }

    /**
     * Custom raycast implementation that delegates to the tiles renderer
     * @param raycaster The raycaster to use
     * @param intersects Array to store intersection results
     * @returns false to stop further raycast traversal when optimized
     */
    raycast(raycaster: Raycaster, intersects: Intersection[]): boolean {
        // When optimized, use the tiles renderer's raycast and stop further traversal
        if (this.tilesRenderer.optimizeRaycast) {
            this.tilesRenderer.raycast(raycaster, intersects);
            return false;
        }

        // Otherwise allow normal traversal to continue
        return true;
    }

    /**
     * Optimized matrix world update that only updates when transform changes
     * @param force Whether to force an update (ignored in this implementation)
     */
    updateMatrixWorld(force?: boolean): void {
        // Update local matrix if auto-update is enabled
        if (this.matrixAutoUpdate) {
            this.updateMatrix();
        }

        // Only proceed if the world matrix needs updating
        if (this.matrixWorldNeedsUpdate || force) {
            // Calculate new world matrix
            if (this.parent === null) {
                tempMat.copy(this.matrix);
            } else {
                tempMat.multiplyMatrices(this.parent.matrixWorld, this.matrix);
            }

            this.matrixWorldNeedsUpdate = false;

            // Check if the matrix has actually changed
            const elA = tempMat.elements;
            const elB = this.matrixWorld.elements;
            let isDifferent = false;

            for (let i = 0; i < 16; i++) {
                const diff = Math.abs(elA[i] - elB[i]);
                if (diff > Number.EPSILON) {
                    isDifferent = true;
                    break;
                }
            }

            // Only update if the matrix changed
            if (isDifferent) {
                this.matrixWorld.copy(tempMat);
                this.matrixWorldInverse.copy(tempMat).invert();

                // Update children - they only need updating if parent changed
                const children = this.children;
                for (let i = 0, l = children.length; i < l; i++) {
                    children[i].updateMatrixWorld();
                }
            }
        }
    }

    /**
     * Updates the world matrix with control over parent/child updates
     * @param updateParents Whether to update parent matrices
     * @param updateChildren Whether to update child matrices
     */
    updateWorldMatrix(updateParents: boolean, updateChildren: boolean): void {
        // Update parent matrix if requested
        if (this.parent && updateParents) {
            this.parent.updateWorldMatrix(updateParents, false);
        }

        // Always use our optimized update function
        this.updateMatrixWorld(true);
    }
}
