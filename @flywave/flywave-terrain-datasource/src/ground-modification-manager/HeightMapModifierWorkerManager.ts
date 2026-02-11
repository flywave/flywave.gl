/* Copyright (C) 2025 flywave.gl contributors */

import { GeoBox } from "@flywave/flywave-geoutils";

import {
    type HeightMapModifier,
    type SerializedHeightMapModifier,
    deserializeHeightMapModifier
} from "./HeightMapModifierTypes";

/**
 * Manages height map modifiers in the worker context
 *
 * This class maintains modifier data locally in the worker to avoid repeated
 * serialization operations for each tile decode. It organizes modifiers by
 * terrain source ID for efficient lookup.
 */
export class HeightMapModifierWorkerManager {
    /** Map of terrain source IDs to their modifiers */
    private static readonly modifierStores = new Map<string, HeightMapModifierStore>();

    /**
     * Updates modifiers for a specific terrain source
     *
     * @param terrainSourceId - The terrain source identifier
     * @param modifiers - Array of serialized modifiers to store
     */
    static updateModifiers(
        terrainSourceId: string,
        modifiers: SerializedHeightMapModifier[]
    ): void {
        let store = this.modifierStores.get(terrainSourceId);

        if (!store) {
            store = new HeightMapModifierStore();
            this.modifierStores.set(terrainSourceId, store);
        }

        const deserializedModifiers = modifiers.map(deserializeHeightMapModifier);
        store.setModifiers(deserializedModifiers);
    }

    /**
     * Clears all modifiers for a specific terrain source
     *
     * @param terrainSourceId - The terrain source identifier
     */
    static clearModifiers(terrainSourceId: string): void {
        const store = this.modifierStores.get(terrainSourceId);
        if (store) {
            store.clear();
        }
    }

    /**
     * Finds modifiers intersecting with a bounding box
     *
     * @param terrainSourceId - The terrain source identifier
     * @param bbox - The bounding box to test intersection
     * @returns Array of modifiers that intersect the bounding box
     */
    static findModifiersInBoundingBox(terrainSourceId: string, bbox: GeoBox): HeightMapModifier[] {
        const store = this.modifierStores.get(terrainSourceId);
        if (!store) {
            return [];
        }

        return store.findModifiersInBoundingBox(bbox);
    }

    /**
     * Removes a terrain source's modifier store
     *
     * @param terrainSourceId - The terrain source identifier
     */
    static removeTerrainSource(terrainSourceId: string): void {
        this.modifierStores.delete(terrainSourceId);
    }

    /**
     * Gets all modifier IDs for a terrain source
     *
     * @param terrainSourceId - The terrain source identifier
     * @returns Array of modifier IDs
     */
    static getModifierIds(terrainSourceId: string): string[] {
        const store = this.modifierStores.get(terrainSourceId);
        if (!store) {
            return [];
        }

        return store.getModifierIds();
    }

    /**
     * Gets the count of modifiers for a terrain source
     *
     * @param terrainSourceId - The terrain source identifier
     * @returns Number of modifiers
     */
    static getModifierCount(terrainSourceId: string): number {
        const store = this.modifierStores.get(terrainSourceId);
        if (!store) {
            return 0;
        }

        return store.getModifierCount();
    }
}

/**
 * Stores modifiers for a specific terrain source
 */
class HeightMapModifierStore {
    private readonly modifiers = new Map<string, HeightMapModifier>();

    setModifiers(modifiers: HeightMapModifier[]): void {
        this.modifiers.clear();
        for (const modifier of modifiers) {
            this.modifiers.set(modifier.id, modifier);
        }
    }

    clear(): void {
        this.modifiers.clear();
    }

    findModifiersInBoundingBox(bbox: GeoBox): HeightMapModifier[] {
        const result: HeightMapModifier[] = [];

        for (const modifier of this.modifiers.values()) {
            if (modifier.enabled && modifier.geoBox.intersectsBox(bbox)) {
                result.push(modifier);
            }
        }

        return result;
    }

    getModifierIds(): string[] {
        return Array.from(this.modifiers.keys());
    }

    getModifierCount(): number {
        return this.modifiers.size;
    }
}
