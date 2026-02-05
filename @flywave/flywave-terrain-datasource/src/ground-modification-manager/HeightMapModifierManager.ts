/* Copyright (C) 2025 flywave.gl contributors */

import { GeoBox, GeoCoordinates } from "@flywave/flywave-geoutils";
import debounce from "lodash.debounce";
import { EventDispatcher } from "three";

import { type ITerrainSource } from "../TerrainSource";
import {
    HeightMapBlendMode,
    type HeightMapModificationEventParams,
    type HeightMapModifier,
    type HeightMapSourceData,
    type HeightMapScale
} from "./HeightMapModifierTypes";

interface HeightMapModificationEvents {
    change: HeightMapModificationEventParams;
}

export interface HeightMapModifierOptions {
    maxModificationZoomLevel?: number;
}

export class HeightMapModifierManager extends EventDispatcher<HeightMapModificationEvents> {
    private readonly modifiers = new Map<string, HeightMapModifier>();
    private nextId: number = 0;
    private globalBoundingBox: GeoBox | null = null;

    private readonly debouncedDispatch: (
        changeType: "add" | "remove" | "update" | "clear",
        affectedIds: string[],
        previousBounds?: GeoBox | null
    ) => void;

    constructor(private readonly terrainSource: ITerrainSource) {
        super();
        this.debouncedDispatch = debounce(
            this.dispatchChangeEventImmediate.bind(this),
            100
        ) as typeof this.debouncedDispatch;
    }

    addModifier(
        source: HeightMapSourceData,
        geoBox: GeoBox,
        blendMode: HeightMapBlendMode = HeightMapBlendMode.ADD,
        opacity: number = 1.0,
        heightScale?: HeightMapScale
    ): string {
        const id = `modifier-${this.nextId++}`;
        const modifier: HeightMapModifier = {
            id,
            source,
            geoBox: geoBox.clone(),
            blendMode,
            opacity: Math.max(0, Math.min(1, opacity)),
            enabled: true,
            heightScale
        };

        this.modifiers.set(id, modifier);
        this.updateGlobalBoundingBox(geoBox);
        this.dispatchChangeEvent("add", [id]);

        return id;
    }

    removeModifier(id: string): boolean {
        const modifier = this.modifiers.get(id);
        if (!modifier) return false;

        this.modifiers.delete(id);

        if (this.modifiers.size === 0) {
            this.globalBoundingBox = null;
        } else if (
            this.globalBoundingBox &&
            (modifier.geoBox.southWest.equals(this.globalBoundingBox.southWest) ||
                modifier.geoBox.northEast.equals(this.globalBoundingBox.northEast))
        ) {
            this.recalculateGlobalBoundingBox();
        }

        this.dispatchChangeEvent("remove", [id]);
        return true;
    }

    updateModifier(
        id: string,
        changes: Partial<
            Pick<HeightMapModifier, "blendMode" | "opacity" | "enabled" | "heightScale">
        >
    ): boolean {
        const modifier = this.modifiers.get(id);
        if (!modifier) return false;

        const previousBounds = modifier.geoBox.clone();

        if (changes.blendMode !== undefined) {
            modifier.blendMode = changes.blendMode;
        }
        if (changes.opacity !== undefined) {
            modifier.opacity = Math.max(0, Math.min(1, changes.opacity));
        }
        if (changes.enabled !== undefined) {
            modifier.enabled = changes.enabled;
        }
        if (changes.heightScale !== undefined) {
            modifier.heightScale = changes.heightScale;
        }

        this.dispatchChangeEvent("update", [id], previousBounds);
        return true;
    }

    clear(): void {
        const hadModifiers = this.modifiers.size > 0;
        const modifierIds = Array.from(this.modifiers.keys());

        this.modifiers.clear();
        this.globalBoundingBox = null;

        if (hadModifiers) {
            this.dispatchChangeEvent("clear", modifierIds);
        }
    }

    getModifier(id: string): HeightMapModifier | undefined {
        const modifier = this.modifiers.get(id);
        return modifier ? { ...modifier, geoBox: modifier.geoBox.clone() } : undefined;
    }

    getAllModifiers(): HeightMapModifier[] {
        return Array.from(this.modifiers.values()).map(m => ({
            ...m,
            geoBox: m.geoBox.clone()
        }));
    }

    getEnabledModifiers(): HeightMapModifier[] {
        return this.getAllModifiers().filter(m => m.enabled);
    }

    getAllModifierIds(): string[] {
        return Array.from(this.modifiers.keys());
    }

    getGlobalBoundingBox(): GeoBox | null {
        return this.globalBoundingBox ? this.globalBoundingBox.clone() : null;
    }

    findModifiersInBoundingBox(bbox: GeoBox): HeightMapModifier[] {
        const result: HeightMapModifier[] = [];

        for (const modifier of this.modifiers.values()) {
            if (modifier.enabled && modifier.geoBox.intersectsBox(bbox)) {
                result.push({ ...modifier, geoBox: modifier.geoBox.clone() });
            }
        }

        return result;
    }

    findModifiersContainingPoint(point: GeoCoordinates): HeightMapModifier[] {
        const result: HeightMapModifier[] = [];

        for (const modifier of this.modifiers.values()) {
            if (modifier.enabled && modifier.geoBox.contains(point)) {
                result.push({ ...modifier, geoBox: modifier.geoBox.clone() });
            }
        }

        return result;
    }

    getModifierCount(): number {
        return this.modifiers.size;
    }

    hasModifier(id: string): boolean {
        return this.modifiers.has(id);
    }

    private dispatchChangeEventImmediate(
        changeType: "add" | "remove" | "update" | "clear",
        affectedIds: string[] = [],
        previousBounds: GeoBox | null = null
    ) {
        let affectedBounds: GeoBox | null = null;
        if (affectedIds.length > 0) {
            const boxes = affectedIds
                .map(id => this.modifiers.get(id)?.geoBox)
                .filter((b): b is GeoBox => b !== undefined);

            if (boxes.length > 0) {
                affectedBounds = this.calculateBoundingBox(boxes);
            }
        }

        this.dispatchEvent({
            type: "change",
            changeType,
            affectedIds,
            globalBounds: this.globalBoundingBox ? this.globalBoundingBox.clone() : null,
            affectedBounds,
            previousBounds
        });
    }

    private dispatchChangeEvent(
        changeType: "add" | "remove" | "update" | "clear",
        affectedIds: string[] = [],
        previousBounds: GeoBox | null = null
    ) {
        this.debouncedDispatch(changeType, affectedIds, previousBounds);
    }

    private calculateBoundingBox(boxes: GeoBox[]): GeoBox {
        if (boxes.length === 0) {
            return new GeoBox(new GeoCoordinates(0, 0), new GeoCoordinates(0, 0));
        }

        const southWest = boxes[0].southWest.clone();
        const northEast = boxes[0].northEast.clone();

        for (const box of boxes) {
            southWest.latitude = Math.min(southWest.latitude, box.southWest.latitude);
            southWest.longitude = Math.min(southWest.longitude, box.southWest.longitude);
            northEast.latitude = Math.max(northEast.latitude, box.northEast.latitude);
            northEast.longitude = Math.max(northEast.longitude, box.northEast.longitude);
        }

        return new GeoBox(southWest, northEast);
    }

    private updateGlobalBoundingBox(newBox: GeoBox): void {
        if (this.globalBoundingBox === null) {
            this.globalBoundingBox = newBox.clone();
        } else {
            this.globalBoundingBox.expandToInclude(newBox);
        }
    }

    private recalculateGlobalBoundingBox(): void {
        this.globalBoundingBox = null;
        for (const modifier of this.modifiers.values()) {
            this.updateGlobalBoundingBox(modifier.geoBox);
        }
    }
}
