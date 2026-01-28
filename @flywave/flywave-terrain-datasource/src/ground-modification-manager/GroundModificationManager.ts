/* Copyright (C) 2025 flywave.gl contributors */

import { GeoBox, GeoCoordinates } from "@flywave/flywave-geoutils";
import debounce from "lodash.debounce";
import { EventDispatcher, MathUtils } from "three";

import { type ITerrainSource } from "../TerrainSource";
import {
    type GroundModificationData,
    type GroundModificationType,
    type HeightOperationType
} from "./GroundModificationData";
import type { BrushOperation } from "./BrushTypes";

export { GroundModificationType };

export interface GroundModificationEventParams {
    changeType: "add" | "remove" | "update" | "clear" | "bounds";
    affectedIds: string[];
    globalBounds: GeoBox | null;
    affectedBounds: GeoBox | null;
    previousBounds?: GeoBox | null;
    modifications?: GroundModificationData[];
}

interface GroundModificationEvents {
    change: GroundModificationEventParams;
}

export interface GroundModificationManagerOptions {
    maxGroundModificationImageryZoomLevel?: number;
    skipZoomLevelZoom?: number;
}

export class GroundModification {
    id: string = MathUtils.generateUUID();

    constructor(
        public data: GroundModificationData,
        private readonly terrainSource: ITerrainSource
    ) {}

    get boundingBox(): GeoBox {
        return this.data.boundingBox;
    }

    get operations(): BrushOperation[] {
        return this.data.operations;
    }

    set operations(operations: BrushOperation[]) {
        this.data.operations = operations;
        this.updateBoundingBox();
    }

    get type(): GroundModificationType {
        return this.data.type;
    }

    set type(type: GroundModificationType) {
        this.data.type = type;
    }

    private updateBoundingBox(): void {
        if (this.data.operations.length === 0) {
            this.data.boundingBox = new GeoBox(new GeoCoordinates(0, 0), new GeoCoordinates(0, 0));
            return;
        }

        const firstPos = this.data.operations[0].position;
        const southWest = firstPos.clone();
        const northEast = firstPos.clone();

        for (const op of this.data.operations) {
            southWest.latitude = Math.min(southWest.latitude, op.position.latitude);
            southWest.longitude = Math.min(southWest.longitude, op.position.longitude);
            northEast.latitude = Math.max(northEast.latitude, op.position.latitude);
            northEast.longitude = Math.max(northEast.longitude, op.position.longitude);
        }

        this.data.boundingBox = new GeoBox(southWest, northEast);
    }
}

export class GroundModificationManager extends EventDispatcher<GroundModificationEvents> {
    private readonly modifications = new Map<string, GroundModification>();
    private nextId: number = 0;
    private globalBoundingBox: GeoBox | null = null;

    private readonly debouncedDispatch: (
        changeType: "add" | "remove" | "update" | "clear" | "bounds",
        affectedModifications: GroundModificationData[],
        previousBounds?: GeoBox | null
    ) => void;

    constructor(private readonly terrainSource: ITerrainSource) {
        super();
        this.debouncedDispatch = debounce(
            this.dispatchChangeEventImmediate.bind(this),
            100
        ) as typeof this.debouncedDispatch;
    }

    addModification(
        heightOperation: HeightOperationType,
        operations: BrushOperation[]
    ): GroundModification {
        const id = `mod-${this.nextId++}`;
        const boundingBox = this.calculateBoundingBox(operations);

        const modification: GroundModificationData = {
            id,
            type: { heightOperation },
            operations,
            boundingBox
        };

        const groundModification = new GroundModification(modification, this.terrainSource);
        this.modifications.set(groundModification.id, groundModification);
        this.updateGlobalBoundingBox(boundingBox);
        this.dispatchChangeEvent("add", [modification]);

        return groundModification;
    }

    removeModification(id: string): boolean {
        const modification = this.modifications.get(id);
        if (!modification) return false;

        this.modifications.delete(id);

        if (this.modifications.size === 0) {
            this.globalBoundingBox = null;
        } else if (
            this.globalBoundingBox &&
            (modification.data.boundingBox.southWest.equals(
                this.globalBoundingBox.southWest
            ) ||
                modification.data.boundingBox.northEast.equals(
                    this.globalBoundingBox.northEast
                ))
        ) {
            this.recalculateGlobalBoundingBox();
        }

        this.dispatchChangeEvent("remove", [modification.data]);
        return true;
    }

    updateModification(
        id: string,
        changes: Partial<Omit<GroundModificationData, "id" | "boundingBox">>
    ): boolean {
        const modification = this.modifications.get(id);
        if (!modification) return false;

        const previousBounds = modification.boundingBox.clone();
        let needsBoundingBoxRecalc = false;

        if (changes.type !== undefined) {
            modification.type = changes.type;
        }

        if (changes.operations !== undefined) {
            modification.operations = changes.operations;
            needsBoundingBoxRecalc = true;
        }

        if (needsBoundingBoxRecalc) {
            this.recalculateGlobalBoundingBox();
        }

        this.dispatchChangeEvent(
            "update",
            [modification.data],
            previousBounds
        );
        return true;
    }

    clear(): void {
        const hadModifications = this.modifications.size > 0;
        const clearedModifications = Array.from(this.modifications.values());

        this.modifications.clear();
        this.globalBoundingBox = null;

        if (hadModifications) {
            this.dispatchChangeEvent("clear", clearedModifications);
        }
    }

    getModification(id: string): GroundModificationData | undefined {
        return this.modifications.get(id);
    }

    getAllModifications(): GroundModificationData[] {
        return Array.from(this.modifications.values());
    }

    getGlobalBoundingBox(): GeoBox | null {
        return this.globalBoundingBox ? this.globalBoundingBox.clone() : null;
    }

    findModificationsInBoundingBox(bbox: GeoBox): GroundModificationData[] {
        const result: GroundModificationData[] = [];

        for (const mod of this.modifications.values()) {
            if (mod.boundingBox.intersectsBox(bbox)) {
                result.push(mod);
            }
        }

        return result;
    }

    findModificationsContainingPoint(point: GeoCoordinates): GroundModificationData[] {
        const result: GroundModificationData[] = [];

        for (const mod of this.modifications.values()) {
            if (mod.boundingBox.contains(point)) {
                result.push(mod);
            }
        }

        return result;
    }

    private dispatchChangeEventImmediate(
        changeType: "add" | "remove" | "update" | "clear",
        affectedModifications: GroundModificationData[] = [],
        previousBounds: GeoBox | null = null
    ) {
        let affectedBounds: GeoBox | null = null;
        if (affectedModifications.length > 0) {
            affectedBounds = affectedModifications[0].boundingBox.clone();
            for (let i = 1; i < affectedModifications.length; i++) {
                affectedBounds.expandToInclude(affectedModifications[i].boundingBox);
            }
        }

        this.dispatchEvent({
            type: "change",
            changeType,
            affectedIds: affectedModifications.map(m => m.id),
            globalBounds: this.globalBoundingBox ? this.globalBoundingBox.clone() : null,
            affectedBounds,
            previousBounds,
            modifications:
                changeType === "add" || changeType === "update"
                    ? affectedModifications.map(m => m)
                    : undefined
        });
    }

    private dispatchChangeEvent(
        changeType: "add" | "remove" | "update" | "clear",
        affectedModifications: GroundModificationData[] = [],
        previousBounds: GeoBox | null = null
    ) {
        this.debouncedDispatch(changeType, affectedModifications, previousBounds);
    }

    private calculateBoundingBox(operations: BrushOperation[]): GeoBox {
        if (operations.length === 0) {
            throw new Error("Cannot calculate bounding box for empty operations");
        }

        const firstPos = operations[0].position.clone();
        const southWest = firstPos.clone();
        const northEast = firstPos.clone();

        for (const op of operations) {
            southWest.latitude = Math.min(southWest.latitude, op.position.latitude);
            southWest.longitude = Math.min(southWest.longitude, op.position.longitude);
            northEast.latitude = Math.max(northEast.latitude, op.position.latitude);
            northEast.longitude = Math.max(northEast.longitude, op.position.longitude);
        }

        southWest.altitude = undefined;
        northEast.altitude = undefined;

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
        for (const mod of this.modifications.values()) {
            this.updateGlobalBoundingBox(mod.boundingBox);
        }
    }
}
