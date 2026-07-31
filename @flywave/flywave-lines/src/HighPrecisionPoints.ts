/* Copyright (C) 2025 flywave.gl contributors */

import { HighPrecisionPointMaterial } from "@flywave/flywave-materials";
import * as THREE from "three/webgpu";

import { type HighPrecisionObject } from "./HighPrecisionLines";
import { HighPrecisionUtils } from "./HighPrecisionUtils";

export class HighPrecisionPoints extends THREE.Points implements HighPrecisionObject {
    matrixWorldInverse: THREE.Matrix4;
    dimensionality?: number;

    constructor(
        geometry?: THREE.BufferGeometry,
        material?: HighPrecisionPointMaterial,
        positions?: number[] | THREE.Vector3[],
        color?: THREE.Color,
        opacity?: number
    ) {
        if (material === undefined) {
            material = new HighPrecisionPointMaterial({
                color: color ? color : HighPrecisionPointMaterial.DEFAULT_COLOR,
                opacity: opacity !== undefined ? opacity : 1
            });
        }

        super(geometry === undefined ? new THREE.BufferGeometry() : geometry, material);

        this.matrixWorldInverse = new THREE.Matrix4();

        if (positions) {
            this.setPositions(positions);
        }
    }

    get bufferGeometry(): THREE.BufferGeometry {
        return this.geometry as THREE.BufferGeometry;
    }

    clearGeometry(): THREE.BufferGeometry {
        return (this.geometry = new THREE.BufferGeometry());
    }

    get shaderMaterial(): THREE.ShaderMaterial {
        return this.material as THREE.ShaderMaterial;
    }

    setPositions(positions: number[] | THREE.Vector3[]): void {
        HighPrecisionUtils.setPositions(this, positions);
    }

    setupForRendering(): void {
        const mat = this.material as unknown as {
            isHighPrecisionPointsMaterial?: boolean;
            setDimensionality?: (n: number) => void;
        };
        if (mat.isHighPrecisionPointsMaterial && this.dimensionality !== undefined) {
            mat.setDimensionality?.(this.dimensionality);
        }
    }

    updateMatrixWorld(force: boolean) {
        const doUpdateMatrixWorldInverse = this.matrixWorldNeedsUpdate || force;

        super.updateMatrixWorld(force);

        if (doUpdateMatrixWorldInverse) {
            this.matrixWorldInverse.copy(this.matrixWorld).invert();
        }
    }
}
