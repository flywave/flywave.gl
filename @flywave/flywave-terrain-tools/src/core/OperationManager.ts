/* Copyright (C) 2025 flywave.gl contributors */

import type { BrushOperation } from "@flywave/flywave-terrain-datasource";

export class OperationManager {
    private undoStack: BrushOperation[] = [];
    private redoStack: BrushOperation[] = [];
    private maxHistorySize: number = 50;

    constructor(maxHistorySize: number = 50) {
        this.maxHistorySize = maxHistorySize;
    }

    addOperation(operation: BrushOperation): void {
        this.undoStack.push(operation);
        if (this.undoStack.length > this.maxHistorySize) {
            this.undoStack.shift();
        }
        this.redoStack = [];
    }

    undo(): BrushOperation | null {
        const operation = this.undoStack.pop();
        if (operation) {
            this.redoStack.push(operation);
        }
        return operation ?? null;
    }

    redo(): BrushOperation | null {
        const operation = this.redoStack.pop();
        if (operation) {
            this.undoStack.push(operation);
        }
        return operation ?? null;
    }

    canUndo(): boolean {
        return this.undoStack.length > 0;
    }

    canRedo(): boolean {
        return this.redoStack.length > 0;
    }

    clear(): void {
        this.undoStack = [];
        this.redoStack = [];
    }

    getHistorySize(): number {
        return this.undoStack.length;
    }

    setMaxHistorySize(size: number): void {
        this.maxHistorySize = size;
        while (this.undoStack.length > this.maxHistorySize) {
            this.undoStack.shift();
        }
    }
}
