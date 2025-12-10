/* Copyright (C) 2025 flywave.gl contributors */

import { type BatchAnimation } from "../TileRenderDataSource";

/**
 * Easing function type for animation transitions
 */
export type EasingFunction = (t: number) => number;

/**
 * Animation state for a single batch
 */
interface BatchAnimationState {
    currentProgress: number;
    targetProgress: number;
    startProgress: number;
    startTime: number;
    isAnimating: boolean;
}

/**
 * Supported easing function types
 */
type EasingType = "linear" | "ease-in" | "ease-out" | "ease-in-out";

/**
 * Animation manager responsible for managing independent animation progress for each batchId
 */
export class BatchAnimationManager {
    private _animation?: BatchAnimation;
    private _batchStates: Map<number, BatchAnimationState> = new Map();
    private _easingFunction: EasingFunction;
    private _lastUpdateTime: number = 0;

    /**
     * Creates a new BatchAnimationManager
     * @param animation - Optional animation configuration
     */
    constructor(animation?: BatchAnimation) {
        this._animation = animation;
        this._easingFunction = this._getEasingFunction(animation?.easing);
        this._lastUpdateTime = performance.now();
    }

    /**
     * Sets the target animation progress for a specific batch
     * @param batchId - The batch identifier
     * @param targetProgress - Target progress value between 0 and 1
     */
    setBatchProgress(batchId: number, targetProgress: number): void {
        if (!this._animation) {
            // If no animation configuration, set progress immediately
            this._setBatchProgressImmediate(batchId, targetProgress);
            return;
        }

        const currentState = this._batchStates.get(batchId) || this._createDefaultState();
        
        // Clamp target progress to valid range
        targetProgress = Math.max(0, Math.min(1, targetProgress));
        
        // If target value hasn't changed and animation is in progress, maintain current state
        if (Math.abs(currentState.targetProgress - targetProgress) < 0.001 && currentState.isAnimating) {
            return;
        }

        // Start new animation
        currentState.startProgress = currentState.currentProgress;
        currentState.targetProgress = targetProgress;
        currentState.startTime = performance.now();
        currentState.isAnimating = true;

        this._batchStates.set(batchId, currentState);
    }

    /**
     * Immediately sets batch animation progress without transition
     * @param batchId - The batch identifier
     * @param progress - Progress value between 0 and 1
     */
    private _setBatchProgressImmediate(batchId: number, progress: number): void {
        const state = this._batchStates.get(batchId) || this._createDefaultState();
        state.currentProgress = Math.max(0, Math.min(1, progress));
        state.targetProgress = state.currentProgress;
        state.isAnimating = false;
        this._batchStates.set(batchId, state);
    }

    /**
     * Gets current animation progress for all batches
     * @returns Float32Array containing progress values for all batches
     */
    getBatchProgresses(): Float32Array {
        if (this._batchStates.size === 0) {
            return new Float32Array(1); // Return array with one element (0) if no batches
        }

        // Find the maximum batchId to determine array size
        const maxBatchId = Math.max(...this._batchStates.keys());
        const batchCount = maxBatchId + 1;
        const progresses = new Float32Array(batchCount);
        
        // Initialize all progress values to 0
        progresses.fill(0);
        
        // Fill progress for each batch
        this._batchStates.forEach((state: BatchAnimationState, batchId: number) => {
            if (batchId < batchCount) {
                progresses[batchId] = state.currentProgress;
            }
        });
        
        return progresses;
    }

    /**
     * Gets animation progress for a specific batch
     * @param batchId - The batch identifier
     * @returns Current progress value between 0 and 1
     */
    getBatchProgress(batchId: number): number {
        const state = this._batchStates.get(batchId);
        return state ? state.currentProgress : 0;
    }

    /**
     * Updates all animation states based on elapsed time
     */
    update(): void {
        if (!this._animation) {
            return;
        }

        const currentTime = performance.now();
        this._lastUpdateTime = currentTime;

        let hasActiveAnimations = false;

        this._batchStates.forEach((state: BatchAnimationState, batchId: number) => {
            if (!state.isAnimating) {
                return;
            }

            const elapsed = currentTime - state.startTime;
            let rawProgress = Math.min(elapsed / this._animation!.duration, 1.0);
            
            // Apply easing function
            const easedProgress = this._easingFunction(rawProgress);
            
            // Calculate current progress
            state.currentProgress = state.startProgress + 
                (state.targetProgress - state.startProgress) * easedProgress;

            // Ensure progress stays within bounds
            state.currentProgress = Math.max(0, Math.min(1, state.currentProgress));

            // Check if animation is complete
            if (rawProgress >= 1.0) {
                state.currentProgress = state.targetProgress;
                state.isAnimating = false;
            } else {
                hasActiveAnimations = true;
            }

            this._batchStates.set(batchId, state);
        });
    }

    /**
     * Sets new animation configuration
     * @param animation - New animation configuration or undefined to disable
     */
    setAnimation(animation?: BatchAnimation): void {
        this._animation = animation;
        this._easingFunction = this._getEasingFunction(animation?.easing);

        // If animation is disabled, immediately complete all ongoing animations
        if (!animation) {
            this._batchStates.forEach((state: BatchAnimationState, batchId: number) => {
                if (state.isAnimating) {
                    state.currentProgress = state.targetProgress;
                    state.isAnimating = false;
                    this._batchStates.set(batchId, state);
                }
            });
        }
    }

    /**
     * Gets the current animation configuration
     * @returns Current animation configuration or undefined
     */
    getAnimation(): BatchAnimation | undefined {
        return this._animation;
    }

    /**
     * Checks if any animations are currently playing
     * @returns True if any batch has an active animation
     */
    get isPlaying(): boolean {
        for (const state of this._batchStates.values()) {
            if (state.isAnimating) {
                return true;
            }
        }
        return false;
    }

    /**
     * Checks if a specific batch is currently animating
     * @param batchId - The batch identifier
     * @returns True if the batch has an active animation
     */
    isBatchAnimating(batchId: number): boolean {
        const state = this._batchStates.get(batchId);
        return state ? state.isAnimating : false;
    }

    /**
     * Resets animation states for all batches
     */
    reset(): void {
        this._batchStates.clear();
    }

    /**
     * Resets animation state for a specific batch
     * @param batchId - The batch identifier
     */
    resetBatch(batchId: number): void {
        this._batchStates.delete(batchId);
    }

    /**
     * Ensures that a batch state exists for the given batchId
     * @param batchId - The batch identifier
     */
    ensureBatchState(batchId: number): void {
        if (!this._batchStates.has(batchId)) {
            this._batchStates.set(batchId, this._createDefaultState());
        }
    }

    /**
     * Gets the number of batches currently being managed
     * @returns Number of batches
     */
    getBatchCount(): number {
        return this._batchStates.size;
    }

    /**
     * Gets all batch IDs currently being managed
     * @returns Array of batch IDs
     */
    getBatchIds(): number[] {
        return Array.from(this._batchStates.keys());
    }

    /**
     * Creates a default animation state
     * @returns Default BatchAnimationState object
     */
    private _createDefaultState(): BatchAnimationState {
        return {
            currentProgress: 0,
            targetProgress: 0,
            startProgress: 0,
            startTime: 0,
            isAnimating: false
        };
    }

    /**
     * Gets the appropriate easing function based on easing type
     * @param easing - Easing type identifier
     * @returns Easing function
     */
    private _getEasingFunction(easing?: EasingType): EasingFunction {
        switch (easing) {
            case "ease-in":
                return (t: number) => t * t;
            case "ease-out":
                return (t: number) => t * (2 - t);
            case "ease-in-out":
                return (t: number) => (t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t);
            case "linear":
            default:
                return (t: number) => t;
        }
    }
}