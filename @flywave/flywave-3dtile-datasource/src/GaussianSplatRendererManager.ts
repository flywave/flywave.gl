/* Copyright (C) 2025 flywave.gl contributors */

import { loadGaussianSplatLite } from "@flywave/flywave-gltf";
import type { MapView } from "@flywave/flywave-mapview";
import type { Object3D } from "three/webgpu";

interface GaussianSplatRendererEntry {
    renderer: {
        dispose(): void;
        removeFromParent?(): void;
    };
    refs: number;
}

// One GaussianSplatRenderer per MapView: it draws every visible SplatMesh in the scene, so
// multiple data sources must share it.
const entries = new WeakMap<MapView, GaussianSplatRendererEntry>();
const pending = new WeakMap<MapView, Promise<GaussianSplatRendererEntry>>();

export function sceneHasGaussianSplat(scene: Object3D): boolean {
    let found = false;
    scene.traverse(object => {
        if ((object.userData as any)?.isGaussianSplatting) {
            found = true;
        }
    });
    return found;
}

async function createEntry(mapView: MapView): Promise<GaussianSplatRendererEntry> {
    await mapView.ready;

    const lite = await loadGaussianSplatLite();
    const renderer = new lite.GaussianSplatRenderer({
        // GaussianSplatRenderer requires an initialized WebGPURenderer (or a WebGLRenderer).
        renderer: mapView.renderer as any,
        onDirty: () => mapView.update()
    });

    // The renderer lives on the persistent scene (MapView's per-frame roots are cleared).
    mapView.scene.add(renderer as any);

    const entry: GaussianSplatRendererEntry = { renderer, refs: 0 };
    entries.set(mapView, entry);
    return entry;
}

/**
 * Creates (or reuses) the per-MapView gaussian-splat-lite renderer and increments its
 * reference count. The lite chunk is only loaded when a 3D Tiles scene actually contains
 * Gaussian splats.
 */
export async function acquireGaussianSplatRenderer(mapView: MapView): Promise<void> {
    let promise = pending.get(mapView);
    if (!promise) {
        promise = createEntry(mapView);
        pending.set(mapView, promise);
        promise.then(
            () => pending.delete(mapView),
            () => pending.delete(mapView)
        );
    }

    const entry = await promise;
    entry.refs++;
}

/** Releases a reference; the renderer is disposed when the last data source detaches. */
export function releaseGaussianSplatRenderer(mapView: MapView): void {
    const entry = entries.get(mapView);
    if (!entry) {
        return;
    }

    entry.refs = Math.max(0, entry.refs - 1);
    if (entry.refs > 0) {
        return;
    }

    entries.delete(mapView);
    entry.renderer.removeFromParent?.();
    entry.renderer.dispose();
}
