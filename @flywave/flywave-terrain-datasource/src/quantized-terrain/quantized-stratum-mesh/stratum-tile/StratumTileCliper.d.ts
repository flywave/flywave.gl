import { type FrustumGeoArea, type FrustumTester } from "@flywave/flywave-geoutils";
import { BufferGeometry } from "three";
import { Brush } from "three-bvh-csg";
import { type GroundModificationPolygon } from "../../../ground-modification-manager";
import { type StratumTileData } from "./StratumTileData";
/**
 * Class for clipping stratum mesh data based on a given geographic box.
 */
export declare class StratumMeshCliper {
    private readonly stratumMeshData;
    /**
     * Constructor for StratumMeshCliper.
     * @param stratumMeshData - The stratum mesh data to be clipped.
     */
    constructor(stratumMeshData: StratumTileData);
    /**
     * Processes additional geometries from fault profiles, boreholes, and section lines.
     * @returns An array of buffer geometries.
     */
    processAdditionalGeometries(): BufferGeometry[];
    private makeFrustumGeoAreaFromGroundModificationPolygon;
    protected makeFrustumGeoAreaToBspNode(frustumGeoAreas: FrustumGeoArea[]): Brush;
    /**
     * Ensures coordinates are in counter-clockwise order for correct winding
     */
    private ensureCounterClockwiseOrder;
    private createCoordinatesFromGeoBox;
    /**
     * Clips the tile mesh based on a given geographic box.
     * @param geoBox - The geographic box to clip the mesh to.
     * @param isClip - Whether to perform clipping.
     * @returns The clipped stratum tile data.
     */
    clipTileMesh(groundModificationPolygons?: GroundModificationPolygon[], isClip?: boolean): BufferGeometry;
    private isGeometryClosed;
    /**
     * Marks vertices in a BufferGeometry as BoundarySideFace type if their triangle
     * intersects with any of the given geographical frustum areas. Modifies the original geometry.
     * Uses triangle-level intersection testing for more accurate boundary detection.
     * @param geometry - The BufferGeometry to process
     * @param frustumTesters - Array of frustum area testers to check intersection
     * @throws {Error} If geometry doesn't have required attributes
     */
    markBoundaryVerticesByTriangleIntersection(geometry: BufferGeometry, frustumTesters?: FrustumTester[], filterFrustumTesters?: FrustumTester[]): void;
    /**
     * Adds faceType and materialId attributes to the given geometry.
     * @param geometry - The geometry to modify.
     * @param materialId - The material ID to assign.
     * @returns The modified geometry.
     */
    addFaceTypeAndMaterialIdAttributes(geometry: BufferGeometry, materialId: number): BufferGeometry;
}
