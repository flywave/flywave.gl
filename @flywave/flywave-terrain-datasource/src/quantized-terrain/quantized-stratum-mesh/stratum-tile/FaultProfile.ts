/* Copyright (C) 2025 flywave.gl contributors */

import type * as THREE from "three";

import { type FaultProfileData, type StratumLayerData, LayerType } from "../decoder";
import { type StratumTileData } from "./StratumTileData";

/**
 * Represents a fault profile in a stratum mesh.
 * This class manages the geometry and material data for fault profiles.
 */
export class FaultProfile {
    /** The geometries of the fault profile */
    private readonly _geometrys?: THREE.BufferGeometry[];
    /** The materials of the fault profile */
    private readonly _materials?: number[];
    /** The layer data associated with the fault profile */
    private readonly _layer?: StratumLayerData;

    /**
     * Creates a new FaultProfile instance.
     * @param fault - The fault profile data
     * @param stratumMeshData - The stratum mesh data
     */
    constructor(private readonly fault: FaultProfileData, stratumMeshData: StratumTileData) {
        const layer = stratumMeshData.layers.find(
            layer => layer.id === this.fault.id && LayerType.Fault
        );

        this._layer = layer;
        // Corrected spelling: meterials -> materials
        const materials: number[] = [];
        const geometries = layer.voxels.map(voxel => {
            materials.push(voxel.material);
            return stratumMeshData.createVoxelGeometry(voxel);
        });

        this._geometrys = geometries;
        this._materials = materials;
    }

    /**
     * Disposes of the geometries to free up memory.
     */
    dispose() {
        if (this._geometrys) {
            this._geometrys.forEach(geometry => {
                geometry.dispose();
            });
        }
    }

    /**
     * Gets the layer data associated with the fault profile.
     * @returns The layer data
     */
    get layer() {
        return this._layer;
    }

    /**
     * Gets the ID of the fault profile.
     * @returns The fault profile ID
     */
    get id() {
        return this.fault.id;
    }

    /**
     * Gets the name of the fault profile.
     * @returns The fault profile name
     */
    get name() {
        return this.fault.name;
    }

    /**
     * Gets the type of the fault profile.
     * @returns The fault profile type
     */
    get type() {
        return this.fault.type;
    }

    /**
     * Gets the strike of the fault profile.
     * @returns The fault profile strike
     */
    get strike() {
        return this.fault.strike;
    }

    /**
     * Gets the dip of the fault profile.
     * @returns The fault profile dip
     */
    get dip() {
        return this.fault.dip;
    }

    /**
     * Gets the throw of the fault profile.
     * @returns The fault profile throw
     */
    get throw() {
        return this.fault.throw;
    }

    /**
     * Gets the points of the fault profile.
     * @returns The fault profile points
     */
    get points() {
        return this.fault.points;
    }

    /**
     * Gets the geometries of the fault profile.
     * @returns The geometries
     */
    get geometry(): THREE.BufferGeometry[] {
        return this._geometrys!;
    }

    /**
     * Gets the materials of the fault profile.
     * @returns The materials
     */
    get material(): number[] {
        return this._materials!;
    }
}
