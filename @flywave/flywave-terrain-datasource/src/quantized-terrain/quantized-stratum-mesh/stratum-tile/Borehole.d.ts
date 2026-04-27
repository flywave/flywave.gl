import type * as THREE from "three";
import { type BoreholeData, type StratumLayerData } from "../decoder";
import { type StratumTileData } from "./StratumTileData";
/**
 * Borehole class represents borehole data in a geological model.
 * It contains information about the borehole's location, depth, trajectory,
 * and associated geometries and materials.
 */
export declare class Borehole {
    private readonly bh;
    private readonly _geometrys?;
    private readonly _materials?;
    private readonly _layer?;
    /**
     * Constructor for the Borehole class
     * @param bh - Borehole data containing information like location, depth, trajectory
     * @param stratumMeshData - Stratum mesh data used to create geometries
     */
    constructor(bh: BoreholeData, stratumMeshData: StratumTileData);
    /**
     * Get the layer data associated with this borehole
     * @returns The stratum layer data
     */
    get layer(): StratumLayerData;
    /**
     * Get the unique identifier of the borehole
     * @returns The borehole ID
     */
    get id(): string;
    /**
     * Get the location coordinates of the borehole
     * @returns The location as THREE.Vector3
     */
    get location(): [number, number, number];
    /**
     * Get the depth of the borehole
     * @returns The depth value
     */
    get depth(): number;
    /**
     * Get the azimuth angle of the borehole
     * @returns The azimuth angle in degrees
     */
    get azimuth(): number;
    /**
     * Get the inclination angle of the borehole
     * @returns The inclination angle in degrees
     */
    get inclination(): number;
    /**
     * Get the trajectory points of the borehole
     * @returns Array of trajectory points as THREE.Vector3
     */
    get trajectory(): import("../decoder").TrajectoryPoint[];
    /**
     * Get the stratums (layers) information of the borehole
     * @returns Array of stratum data
     */
    get stratums(): import("../decoder").BoreholeStratum[];
    /**
     * Get the geometries associated with this borehole
     * @returns Array of THREE.BufferGeometry objects
     */
    get geometries(): THREE.BufferGeometry[];
    /**
     * Get the material indices for the borehole geometries
     * @returns Array of material indices
     */
    get materials(): number[];
    /**
     * Dispose of the geometries to free memory
     * Calls dispose() on each geometry in the geometries array
     */
    dispose(): void;
}
