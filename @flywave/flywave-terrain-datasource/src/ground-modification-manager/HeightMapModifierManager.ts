/* Copyright (C) 2025 flywave.gl contributors */

import { GeoBox, GeoCoordinates } from "@flywave/flywave-geoutils";
import { EventDispatcher } from "three";

import { type ITerrainSource } from "../TerrainSource";
import {
    type HeightMapModificationEventParams,
    type HeightMapModifier,
    type HeightMapSourceData,
    type SerializedHeightMapModifier,
    serializeHeightMapModifier,
    serializeHeightMapModifierWithTransfer,
    type SerializedHeightMapModifierWithTransfer
} from "./HeightMapModifierTypes";

interface HeightMapModificationEvents {
    change: HeightMapModificationEventParams;
}

// Type for decoder that provides workerSet for broadcast requests
interface DecoderWithWorkerSet {
    workerSet: {
        broadcastRequest(
            serviceId: string,
            message: unknown,
            transferList?: unknown[]
        ): Promise<unknown[]>;
        m_workers?: Worker[];
    };
    serviceId: string;
}

export interface HeightMapModifierOptions {
    maxModificationZoomLevel?: number;
}

export class HeightMapModifierManager extends EventDispatcher<HeightMapModificationEvents> {
    private readonly modifiers = new Map<string, HeightMapModifier>();
    private nextId: number = 0;
    private globalBoundingBox: GeoBox | null = null;

    private decoder: DecoderWithWorkerSet | null = null;

    private syncPhaseListeners: Array<() => Promise<void>> = [];

    constructor(private readonly terrainSource: ITerrainSource) {
        super();
    }

    /**
     * Setup synchronization of modifiers to workers
     */
    async setupSync(decoder: DecoderWithWorkerSet): Promise<void> {
        this.decoder = decoder;

        this.syncPhaseListeners.push(this.syncToWorkers.bind(this));

        const existingModifiers = this.getEnabledModifiers();
        if (existingModifiers.length > 0) {
            await this.syncToWorkers();
        }
    }

    private async syncToWorkers(): Promise<void> {
        if (!this.decoder) {
            console.warn("HeightMapModifierManager: decoder not available");
            return;
        }

        const modifiers = this.getEnabledModifiers();

        try {
            const workerSet = this.decoder.workerSet as any;
            const workers = workerSet.m_workers;

            if (workers && workers.length > 0) {
                for (const worker of workers) {
                    const transferables: Transferable[] = [];
                    const serializedModifiers = await Promise.all(
                        modifiers.map(async modifier => {
                            const result = await serializeHeightMapModifierWithTransfer(modifier);
                            transferables.push(...result.transferables);
                            return result.modifier;
                        })
                    );

                    const message: any = {
                        service: this.decoder.serviceId,
                        type: "configuration",
                        options: {
                            terrainSourceId: this.terrainSource.name,
                            heightMapModifiers: serializedModifiers
                        }
                    };

                    worker.postMessage(message, transferables);
                }
            } else {
                const serializedModifiers = modifiers.map(serializeHeightMapModifier);
                const message: any = {
                    service: this.decoder.serviceId,
                    type: "configuration",
                    options: {
                        terrainSourceId: this.terrainSource.name,
                        heightMapModifiers: serializedModifiers
                    }
                };
                await this.decoder.workerSet.broadcastRequest(this.decoder.serviceId, message);
            }
        } catch (error) {
            console.error("HeightMapModifierManager: Failed to sync modifiers to workers", error);
        }
    }

    addModifier(id: string, source: HeightMapSourceData, geoBox: GeoBox): string {
        const modifier: HeightMapModifier = {
            id,
            source,
            geoBox: geoBox.clone(),
            enabled: true
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

    updateModifier(id: string, changes: Partial<Pick<HeightMapModifier, "enabled">>): boolean {
        const modifier = this.modifiers.get(id);
        if (!modifier) return false;

        const previousBounds = modifier.geoBox.clone();

        if (changes.enabled !== undefined) {
            modifier.enabled = changes.enabled;
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
        const syncPromises = this.syncPhaseListeners.map(listener => listener());

        Promise.all(syncPromises)
            .then(() => {
                this.dispatchChangeEventImmediate(changeType, affectedIds, previousBounds);
            })
            .catch(error => {
                console.error("HeightMapModifierManager: Error during sync-phase", error);
                this.dispatchChangeEventImmediate(changeType, affectedIds, previousBounds);
            });
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
