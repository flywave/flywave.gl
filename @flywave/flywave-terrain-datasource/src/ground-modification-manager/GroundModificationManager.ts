/* Copyright (C) 2025 flywave.gl contributors */

import { GeoBox, GeoCoordinates } from "@flywave/flywave-geoutils";
import debounce from "lodash.debounce";
import { EventDispatcher, MathUtils } from "three";

import { type ITerrainSource } from "../TerrainSource";
import { type GroundModificationData } from "./GroundModificationData";
import type { BrushOperation, BrushType } from "./BrushTypes";

export interface GroundModificationEventParams {
    changeType: "add" | "remove" | "update" | "clear" | "bounds";
    affectedIds: string[];
    globalBounds: GeoBox | null;
    affectedBounds: GeoBox | null;
    previousBounds?: GeoBox | null;
    operations?: BrushOperation[];
    operationBoundingBoxes?: GeoBox[];
}

interface GroundModificationEvents {
    change: GroundModificationEventParams;
}

export interface GroundModificationManagerOptions {
    maxGroundModificationImageryZoomLevel?: number;
    skipZoomLevelZoom?: number;
}

export class GroundModificationManager extends EventDispatcher<GroundModificationEvents> {
    private readonly operations = new Map<
        string,
        { operation: BrushOperation; boundingBox: GeoBox }
    >();
    private nextId: number = 0;
    private globalBoundingBox: GeoBox | null = null;

    private readonly debouncedDispatch: (
        changeType: "add" | "remove" | "update" | "clear",
        affectedOperations: BrushOperation[],
        previousBounds?: GeoBox | null
    ) => void;

    constructor(private readonly terrainSource: ITerrainSource) {
        super();
        this.debouncedDispatch = debounce(
            this.dispatchChangeEventImmediate.bind(this),
            100
        ) as typeof this.debouncedDispatch;
    }

    addOperation(operation: BrushOperation): string {
        const id = `op-${this.nextId++}`;
        const boundingBox = this.calculateOperationBoundingBox(operation);

        this.operations.set(id, { operation, boundingBox });
        this.updateGlobalBoundingBox(boundingBox);
        this.dispatchChangeEvent("add", [operation]);

        return id;
    }

    addOperations(operations: BrushOperation[]): string[] {
        const ids: string[] = [];
        for (const op of operations) {
            ids.push(this.addOperation(op));
        }
        return ids;
    }

    removeOperation(id: string): boolean {
        const entry = this.operations.get(id);
        if (!entry) return false;

        this.operations.delete(id);

        if (this.operations.size === 0) {
            this.globalBoundingBox = null;
        } else if (
            this.globalBoundingBox &&
            (entry.boundingBox.southWest.equals(this.globalBoundingBox.southWest) ||
                entry.boundingBox.northEast.equals(this.globalBoundingBox.northEast))
        ) {
            this.recalculateGlobalBoundingBox();
        }

        this.dispatchChangeEvent("remove", [entry.operation]);
        return true;
    }

    removeOperations(ids: string[]): boolean[] {
        return ids.map(id => this.removeOperation(id));
    }

    updateOperation(id: string, changes: Partial<BrushOperation>): boolean {
        const entry = this.operations.get(id);
        if (!entry) return false;

        const previousBounds = entry.boundingBox.clone();

        if (changes.position !== undefined) {
            entry.operation.position = changes.position;
        }
        if (changes.settings !== undefined) {
            entry.operation.settings = changes.settings;
        }

        entry.boundingBox = this.calculateOperationBoundingBox(entry.operation);
        this.recalculateGlobalBoundingBox();

        this.dispatchChangeEvent("update", [entry.operation], previousBounds);
        return true;
    }

    clear(): void {
        const hadOperations = this.operations.size > 0;
        const clearedOperations = Array.from(this.operations.values());

        this.operations.clear();
        this.globalBoundingBox = null;

        if (hadOperations) {
            this.dispatchChangeEvent(
                "clear",
                clearedOperations.map(e => e.operation)
            );
        }
    }

    getOperation(id: string): BrushOperation | undefined {
        const entry = this.operations.get(id);
        return entry?.operation;
    }

    getOperationBoundingBox(id: string): GeoBox | undefined {
        const entry = this.operations.get(id);
        return entry?.boundingBox.clone();
    }

    getAllOperations(): BrushOperation[] {
        return Array.from(this.operations.values()).map(e => e.operation);
    }

    getAllOperationIds(): string[] {
        return Array.from(this.operations.keys());
    }

    getOperationsByType(type: BrushType): { id: string; operation: BrushOperation }[] {
        const result: { id: string; operation: BrushOperation }[] = [];
        for (const [id, entry] of this.operations.entries()) {
            if (entry.operation.settings.type === type) {
                result.push({ id, operation: entry.operation });
            }
        }
        return result;
    }

    getGlobalBoundingBox(): GeoBox | null {
        return this.globalBoundingBox ? this.globalBoundingBox.clone() : null;
    }

    findOperationsInBoundingBox(bbox: GeoBox): { id: string; operation: BrushOperation }[] {
        const result: { id: string; operation: BrushOperation }[] = [];

        for (const [id, entry] of this.operations.entries()) {
            if (entry.boundingBox.intersectsBox(bbox)) {
                result.push({ id, operation: entry.operation });
            }
        }

        return result;
    }

    findOperationsContainingPoint(
        point: GeoCoordinates
    ): { id: string; operation: BrushOperation }[] {
        const result: { id: string; operation: BrushOperation }[] = [];

        for (const [id, entry] of this.operations.entries()) {
            if (entry.boundingBox.contains(point)) {
                result.push({ id, operation: entry.operation });
            }
        }

        return result;
    }

    getOperationCount(): number {
        return this.operations.size;
    }

    hasOperation(id: string): boolean {
        return this.operations.has(id);
    }

    private dispatchChangeEventImmediate(
        changeType: "add" | "remove" | "update" | "clear",
        affectedOperations: BrushOperation[] = [],
        previousBounds: GeoBox | null = null
    ) {
        let affectedBounds: GeoBox | null = null;
        if (affectedOperations.length > 0) {
            affectedBounds = this.calculateOperationsBoundingBox(affectedOperations);
        }

        const affectedIds: string[] = [];
        const operationBoundingBoxes: GeoBox[] = [];
        for (const [id] of this.operations.entries()) {
            if (affectedOperations.includes(this.operations.get(id)!.operation)) {
                affectedIds.push(id);
                operationBoundingBoxes.push(this.operations.get(id)!.boundingBox.clone());
            }
        }

        this.dispatchEvent({
            type: "change",
            changeType,
            affectedIds,
            globalBounds: this.globalBoundingBox ? this.globalBoundingBox.clone() : null,
            affectedBounds,
            previousBounds,
            operations:
                changeType === "add" || changeType === "update" ? affectedOperations : undefined,
            operationBoundingBoxes:
                changeType === "add" || changeType === "update" ? operationBoundingBoxes : undefined
        });
    }

    private dispatchChangeEvent(
        changeType: "add" | "remove" | "update" | "clear",
        affectedOperations: BrushOperation[] = [],
        previousBounds: GeoBox | null = null
    ) {
        this.debouncedDispatch(changeType, affectedOperations, previousBounds);
    }

    private calculateOperationBoundingBox(operation: BrushOperation): GeoBox {
        const { position, settings } = operation;
        const radius = settings.radius;
        const latDelta = radius / 111111;
        const lonDelta = radius / (111111 * Math.cos((position.latitude * Math.PI) / 180));

        const southWest = new GeoCoordinates(
            position.latitude - latDelta,
            position.longitude - lonDelta
        );
        const northEast = new GeoCoordinates(
            position.latitude + latDelta,
            position.longitude + lonDelta
        );

        return new GeoBox(southWest, northEast);
    }

    private calculateOperationsBoundingBox(operations: BrushOperation[]): GeoBox {
        if (operations.length === 0) {
            return new GeoBox(new GeoCoordinates(0, 0), new GeoCoordinates(0, 0));
        }

        const firstPos = operations[0].position.clone();
        const southWest = firstPos.clone();
        const northEast = firstPos.clone();

        for (const op of operations) {
            const bbox = this.calculateOperationBoundingBox(op);
            southWest.latitude = Math.min(southWest.latitude, bbox.southWest.latitude);
            southWest.longitude = Math.min(southWest.longitude, bbox.southWest.longitude);
            northEast.latitude = Math.max(northEast.latitude, bbox.northEast.latitude);
            northEast.longitude = Math.max(northEast.longitude, bbox.northEast.longitude);
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
        for (const entry of this.operations.values()) {
            this.updateGlobalBoundingBox(entry.boundingBox);
        }
    }
}
