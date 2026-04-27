import * as THREE from "three";
import { type CollapsePillarData, type StratumLayerData } from "../decoder";
import { BspObject } from "./BspObject";
import { type StratumTileData } from "./StratumTileData";
/**
 * Represents a collapse pillar in a stratum mesh.
 * This class extends BspObject to provide BSP operations for collapse pillars.
 */
export declare class CollapsePillar extends BspObject {
    collapse: CollapsePillarData;
    /** The lithology of the collapse pillar */
    private readonly _lithology;
    /** The top center position of the collapse pillar */
    private readonly _topCenter;
    /** The base center position of the collapse pillar */
    private readonly _baseCenter;
    /** The bounding box of the collapse pillar geometry */
    private _boundingSphere?;
    /** The geometry of the collapse pillar */
    private readonly _geometry?;
    /** The layer data associated with the collapse pillar */
    private readonly _layer?;
    /** The material index for the collapse pillar */
    private readonly _material;
    /**
     * Creates a new CollapsePillar instance.
     * @param collapse - The collapse pillar data
     * @param stratumMeshData - The stratum mesh data
     */
    constructor(collapse: CollapsePillarData, layer: StratumLayerData, stratumMeshData: StratumTileData);
    private getBoundingSphere;
    /**
     * Gets the layer data associated with the collapse pillar.
     * @returns The layer data
     */
    get layer(): StratumLayerData;
    /**
     * Gets the ID of the collapse pillar.
     * @returns The collapse pillar ID
     */
    get id(): string;
    /**
     * Gets the name of the collapse pillar.
     * @returns The collapse pillar name
     */
    get name(): string;
    /**
     * Gets the lithology of the collapse pillar.
     * @returns The lithology
     */
    get lithology(): string;
    /**
     * Gets the top center position of the collapse pillar.
     * @returns The top center position
     */
    get topCenter(): THREE.Vector3;
    /**
     * Gets the base center position of the collapse pillar.
     * @returns The base center position
     */
    get baseCenter(): THREE.Vector3;
    /**
     * Gets the top radius of the collapse pillar.
     * @returns The top radius
     */
    get topRadius(): number;
    /**
     * Gets the base radius of the collapse pillar.
     * @returns The base radius
     */
    get baseRadius(): number;
    /**
     * Gets the height of the collapse pillar.
     * @returns The height
     */
    get height(): number;
    /**
     * Gets the stratum ID associated with the collapse pillar.
     * @returns The stratum ID
     */
    get stratumId(): string;
    /**
     * Gets the material index for the collapse pillar.
     * @returns The material index
     */
    get material(): number;
    /**
     * Gets the bounding box of the collapse pillar.
     * @returns The bounding box
     */
    get boundingSphere(): THREE.Sphere;
    /**
     * Generates cross sections of the collapse pillar.
     * @param line - The line defining the cross section plane
     * @param upDir - The up direction vector
     * @returns The cross section positions and indices, or undefined if not enough points
     */
    generateCrossSections(line: [THREE.Vector3, THREE.Vector3], upDir: THREE.Vector3): {
        positions: THREE.Vector3[];
        indices: number[];
    } | undefined;
    /**
     * Creates a vertical plane for cross section generation.
     * @param line - The line defining the plane
     * @param upDir - The up direction vector
     * @returns The created plane
     */
    private createVerticalPlane;
    /**
     * Calculates the intersection points between the collapse pillar geometry and a plane.
     * @param plane - The intersecting plane
     * @returns The intersection points
     */
    private calculateIntersection;
    /**
     * Sorts polygon points for proper triangulation.
     * @param points - The points to sort
     * @param plane - The reference plane
     * @param upDir - The up direction vector
     * @returns The sorted points
     */
    private sortPolygonPoints;
}
