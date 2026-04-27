import { type Angle } from "../../geometry3d/angle";
import { type IndexedPolyface } from "../polyface";
/**
 * Helper context for normal averaging.
 * All methods are static.
 * @internal
 */
export declare class BuildAverageNormalsContext {
    /**
     * * At each vertex of the mesh
     *   * Find clusters of almost parallel normals
     *   * Compute simple average of those normals
     *   * Index to the averages
     * * For typical meshes, this correctly clusters adjacent normals.
     * * One cam imagine a vertex with multiple "smooth cone-like" sets of incident facets such that averaging occurs among two nonadjacent cones.  But this does not seem to be a problem in practice.
     * @param polyface polyface to update.
     * @param toleranceAngle averaging is done between normals up to this angle.
     */
    static buildFastAverageNormals(polyface: IndexedPolyface, toleranceAngle: Angle): void;
    /**
     * Set up indexed normals with one normal in the plane of each facet of the mesh.
     * @param polyface mesh to modify
     */
    static buildPerFaceNormals(polyface: IndexedPolyface): void;
}
