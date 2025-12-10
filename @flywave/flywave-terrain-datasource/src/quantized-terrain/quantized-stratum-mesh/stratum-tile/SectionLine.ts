/* Copyright (C) 2025 flywave.gl contributors */

import type * as THREE from "three";

import { type SectionLineData, type StratumLayerData, LayerType } from "../decoder";
import { type StratumTileData } from "./StratumTileData";

/**
 * Represents a section line in a stratum mesh.
 * This class manages the geometry and material data for section lines.
 */
export class SectionLine {
    /** The geometries of the section line */
    private readonly _geometries?: THREE.BufferGeometry[];
    /** The materials of the section line */
    private readonly _materials?: number[];
    /** The layer data associated with the section line */
    private readonly _layer?: StratumLayerData;

    /**
     * Creates a new SectionLine instance.
     * @param sl - The section line data
     * @param stratumMeshData - The stratum mesh data
     */
    constructor(private readonly sl: SectionLineData, stratumMeshData: StratumTileData) {
        const layer = stratumMeshData.layers.find(
            layer => layer.id === this.sl.id && LayerType.Borehole
        );

        this._layer = layer;
        // Corrected spelling: meterials -> materials
        const materials: number[] = [];
        const geometries = layer.voxels.map(voxel => {
            materials.push(voxel.material);
            return stratumMeshData.createVoxelGeometry(voxel);
        });

        this._geometries = geometries;
        this._materials = materials;
    }

    /**
     * Gets the layer data associated with the section line.
     * @returns The layer data
     */
    get layer() {
        return this._layer;
    }

    /**
     * Gets the ID of the section line.
     * @returns The section line ID
     */
    get id(): string {
        return this.sl.id;
    }

    /**
     * Gets the name of the section line.
     * @returns The section line name
     */
    get name(): string {
        return this.sl.name;
    }

    /**
     * Gets the line string coordinates of the section line.
     * @returns The line string coordinates
     */
    get lineString(): Array<[number, number, number]> {
        return this.sl.lineString;
    }

    /**
     * Gets the geometries of the section line.
     * @returns The geometries
     */
    get geometries(): THREE.BufferGeometry[] {
        // Return type modification
        return this._geometries || [];
    }

    /**
     * Gets the materials of the section line.
     * @returns The materials
     */
    get materials(): number[] {
        // Return type modification
        return this._materials || [];
    }

    /**
     * Disposes of the geometries to free up memory.
     */
    dispose() {
        this._geometries?.forEach(geom => {
            geom.dispose();
        });
    }
}
