/* Copyright (C) 2025 flywave.gl contributors */

import { Group, type Object3D } from "three/webgpu";

import { encodeRawGaussianPly } from "../extensions/utils/gaussian-splat-ply";
import type { GLTFMeshPrimitivePostprocessed } from "../types/gltf-postprocessed-schema";

type GaussianSplatLite = typeof import("gaussian-splat-lite");

let litePromise: Promise<GaussianSplatLite> | null = null;

/**
 * Lazily loads gaussian-splat-lite. The library is only fetched when a tileset actually
 * contains Gaussian splatting content, keeping the default 3D Tiles bundle small.
 */
export function loadGaussianSplatLite(): Promise<GaussianSplatLite> {
    litePromise ??= import("gaussian-splat-lite");
    return litePromise;
}

/**
 * Placeholder for a KHR_gaussian_splatting primitive.
 *
 * three's `Object3D.clone()` (used when glTF meshes are instantiated per node) serializes
 * `userData` as JSON, which would destroy promises and functions. This subclass keeps the
 * primitive outside `userData` and overrides `clone()` so each scene instance gets its own
 * lazy placeholder. Decoding starts only for placeholders that actually enter the scene.
 */
export class GaussianSplatPlaceholder extends Group {
    private readonly primitive: GLTFMeshPrimitivePostprocessed;
    private disposeMesh: (() => void) | null = null;
    private ready: Promise<void> | null = null;

    constructor(primitive: GLTFMeshPrimitivePostprocessed) {
        super();
        this.primitive = primitive;
        this.name = "GaussianSplat";
        this.userData.isGaussianSplatting = true;
    }

    override clone(recursive: boolean = true): this {
        const clone = new GaussianSplatPlaceholder(this.primitive) as this;
        clone.name = this.name;
        clone.position.copy(this.position);
        clone.quaternion.copy(this.quaternion);
        clone.scale.copy(this.scale);
        clone.visible = this.visible;
        if (recursive) {
            // A placeholder is cloned before the lite mesh is attached; nothing else to copy.
        }
        return clone;
    }

    /** Starts decoding this placeholder and returns its readiness promise. */
    startGaussianSplat(): Promise<void> {
        if (this.ready) {
            return this.ready;
        }

        let disposed = false;
        let mesh: { dispose?: () => void } | null = null;

        this.userData.gaussianSplatDispose = (): void => {
            disposed = true;
            mesh?.dispose?.();
            mesh = null;
        };

        const source = (this.primitive.extras as any)?.gaussianSplatSource;
        this.ready = (async (): Promise<void> => {
            if (!source) {
                throw new Error("Gaussian splatting: missing decoded source");
            }

            const lite = await loadGaussianSplatLite();
            if (disposed) {
                return;
            }

            const fileBytes: Uint8Array =
                source.kind === "spz" ? source.bytes : encodeRawGaussianPly(this.primitive);
            const fileType =
                source.kind === "spz" ? lite.SplatFileType.SPZ : lite.SplatFileType.PLY;

            const splatMesh = new lite.SplatMesh({ fileBytes, fileType, maxSh: 4 });
            splatMesh.name = "GaussianSplatMesh";
            splatMesh.userData.isGaussianSplatting = true;
            mesh = splatMesh;

            await splatMesh.initialized;

            if (disposed) {
                splatMesh.dispose();
                mesh = null;
                return;
            }

            this.add(splatMesh);
        })();

        // The owning tile awaits this promise; mark it handled for consumers that do not.
        this.ready.catch(() => {});
        this.userData.gaussianSplatReady = this.ready;
        return this.ready;
    }
}

export function createGaussianSplatPlaceholder(
    primitive: GLTFMeshPrimitivePostprocessed
): GaussianSplatPlaceholder {
    return new GaussianSplatPlaceholder(primitive);
}

/**
 * Starts decoding for every Gaussian splat placeholder attached to `root` and returns their
 * readiness promises. Placeholders that only exist in the glTF mesh cache (not attached to a
 * node) are left untouched.
 */
export function startGaussianSplatPlaceholders(root: Object3D): Promise<void>[] {
    const promises: Promise<void>[] = [];
    root.traverse(object => {
        if (object instanceof GaussianSplatPlaceholder) {
            promises.push(object.startGaussianSplat());
        }
    });
    return promises;
}
