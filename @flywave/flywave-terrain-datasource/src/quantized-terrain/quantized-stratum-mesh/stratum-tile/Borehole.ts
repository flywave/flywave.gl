/* Copyright (C) 2025 flywave.gl contributors */

import type * as THREE from "three";

import { type BoreholeData, type StratumLayerData, LayerType } from "../decoder";
import { type StratumTileData } from "./StratumTileData";

/**
 * Borehole class represents borehole data in a geological model.
 * It contains information about the borehole's location, depth, trajectory,
 * and associated geometries and materials.
 */
export class Borehole {
    // Array of buffer geometries representing the borehole
    private readonly _geometrys?: THREE.BufferGeometry[];

    // Array of material indices for the borehole geometries
    private readonly _materials?: number[];

    // Layer data associated with this borehole
    private readonly _layer?: StratumLayerData;

    /**
     * Constructor for the Borehole class
     * @param bh - Borehole data containing information like location, depth, trajectory
     * @param stratumMeshData - Stratum mesh data used to create geometries
     */
    constructor(private readonly bh: BoreholeData, stratumMeshData: StratumTileData) {
        // Find the layer that matches this borehole's ID and is of Borehole type
        const layer = stratumMeshData.layers.find(
            layer => layer.id === this.bh.id && layer.type === LayerType.Borehole
        );

        this._layer = layer;

        // Arrays to store materials and geometries
        const materials: number[] = [];
        const geometries = layer.voxels.map(voxel => {
            // Add material index to materials array
            materials.push(voxel.material);
            // Create voxel geometry and add to geometries array
            return stratumMeshData.createVoxelGeometry(voxel);
        });

        this._geometrys = geometries;
        this._materials = materials;
    }

    /**
     * Get the layer data associated with this borehole
     * @returns The stratum layer data
     */
    get layer() {
        return this._layer;
    }

    /**
     * Get the unique identifier of the borehole
     * @returns The borehole ID
     */
    get id() {
        return this.bh.id;
    }

    /**
     * Get the location coordinates of the borehole
     * @returns The location as THREE.Vector3
     */
    get location() {
        return this.bh.location;
    }

    /**
     * Get the depth of the borehole
     * @returns The depth value
     */
    get depth() {
        return this.bh.depth;
    }

    /**
     * Get the azimuth angle of the borehole
     * @returns The azimuth angle in degrees
     */
    get azimuth() {
        return this.bh.azimuth;
    }

    /**
     * Get the inclination angle of the borehole
     * @returns The inclination angle in degrees
     */
    get inclination() {
        return this.bh.inclination;
    }

    /**
     * Get the trajectory points of the borehole
     * @returns Array of trajectory points as THREE.Vector3
     */
    get trajectory() {
        return this.bh.trajectory;
    }

    /**
     * Get the stratums (layers) information of the borehole
     * @returns Array of stratum data
     */
    get stratums() {
        return this.bh.stratums;
    }

    /**
     * Get the geometries associated with this borehole
     * @returns Array of THREE.BufferGeometry objects
     */
    get geometries(): THREE.BufferGeometry[] {
        return this._geometrys || [];
    }

    /**
     * Get the material indices for the borehole geometries
     * @returns Array of material indices
     */
    get materials(): number[] {
        return this._materials || [];
    }

    /**
     * Dispose of the geometries to free memory
     * Calls dispose() on each geometry in the geometries array
     */
    dispose() {
        this._geometrys?.forEach(geom => {
            geom.dispose();
        });
    }
}
