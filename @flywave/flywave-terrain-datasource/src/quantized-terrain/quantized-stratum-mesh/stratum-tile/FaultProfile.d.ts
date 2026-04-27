import type * as THREE from "three";
import { type FaultProfileData, type StratumLayerData } from "../decoder";
import { type StratumTileData } from "./StratumTileData";
/**
 * Represents a fault profile in a stratum mesh.
 * This class manages the geometry and material data for fault profiles.
 */
export declare class FaultProfile {
    private readonly fault;
    /** The geometries of the fault profile */
    private readonly _geometrys?;
    /** The materials of the fault profile */
    private readonly _materials?;
    /** The layer data associated with the fault profile */
    private readonly _layer?;
    /**
     * Creates a new FaultProfile instance.
     * @param fault - The fault profile data
     * @param stratumMeshData - The stratum mesh data
     */
    constructor(fault: FaultProfileData, stratumMeshData: StratumTileData);
    /**
     * Disposes of the geometries to free up memory.
     */
    dispose(): void;
    /**
     * Gets the layer data associated with the fault profile.
     * @returns The layer data
     */
    get layer(): StratumLayerData;
    /**
     * Gets the ID of the fault profile.
     * @returns The fault profile ID
     */
    get id(): string;
    /**
     * Gets the name of the fault profile.
     * @returns The fault profile name
     */
    get name(): string;
    /**
     * Gets the type of the fault profile.
     * @returns The fault profile type
     */
    get type(): string;
    /**
     * Gets the strike of the fault profile.
     * @returns The fault profile strike
     */
    get strike(): number;
    /**
     * Gets the dip of the fault profile.
     * @returns The fault profile dip
     */
    get dip(): number;
    /**
     * Gets the throw of the fault profile.
     * @returns The fault profile throw
     */
    get throw(): number;
    /**
     * Gets the points of the fault profile.
     * @returns The fault profile points
     */
    get points(): import("../decoder").FaultPoint[];
    /**
     * Gets the geometries of the fault profile.
     * @returns The geometries
     */
    get geometry(): THREE.BufferGeometry[];
    /**
     * Gets the materials of the fault profile.
     * @returns The materials
     */
    get material(): number[];
}
