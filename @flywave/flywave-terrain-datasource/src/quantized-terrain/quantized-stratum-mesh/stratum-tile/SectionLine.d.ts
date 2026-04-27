import type * as THREE from "three";
import { type SectionLineData, type StratumLayerData } from "../decoder";
import { type StratumTileData } from "./StratumTileData";
/**
 * Represents a section line in a stratum mesh.
 * This class manages the geometry and material data for section lines.
 */
export declare class SectionLine {
    private readonly sl;
    /** The geometries of the section line */
    private readonly _geometries?;
    /** The materials of the section line */
    private readonly _materials?;
    /** The layer data associated with the section line */
    private readonly _layer?;
    /**
     * Creates a new SectionLine instance.
     * @param sl - The section line data
     * @param stratumMeshData - The stratum mesh data
     */
    constructor(sl: SectionLineData, stratumMeshData: StratumTileData);
    /**
     * Gets the layer data associated with the section line.
     * @returns The layer data
     */
    get layer(): StratumLayerData;
    /**
     * Gets the ID of the section line.
     * @returns The section line ID
     */
    get id(): string;
    /**
     * Gets the name of the section line.
     * @returns The section line name
     */
    get name(): string;
    /**
     * Gets the line string coordinates of the section line.
     * @returns The line string coordinates
     */
    get lineString(): Array<[number, number, number]>;
    /**
     * Gets the geometries of the section line.
     * @returns The geometries
     */
    get geometries(): THREE.BufferGeometry[];
    /**
     * Gets the materials of the section line.
     * @returns The materials
     */
    get materials(): number[];
    /**
     * Disposes of the geometries to free up memory.
     */
    dispose(): void;
}
