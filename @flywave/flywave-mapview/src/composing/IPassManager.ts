/* Copyright (C) 2025 flywave.gl contributors */

import type * as THREE from "three";

/**
 * `IPassManager` provides a base interface for {@link Pass}
 * managers like {@link MapRenderingManager}.
 */
export interface IPassManager {
    /**
     * The render method to extend in `IPassManager`'s implementations. This is the place where the
     * desired setups and effect composing and chaining happen.
     */
    render(renderer: THREE.WebGLRenderer, ...args: any[]): void;

    /**
     * The resize method to extend in {@link Pass} implementations
     * to resize the render targets to match
     * the size of the visible canvas. It should be called on resize events.
     *
     * @param width - Width to resize to.
     * @param height - Height to resize to.
     */
    setSize(width: number, height: number): void;
}
