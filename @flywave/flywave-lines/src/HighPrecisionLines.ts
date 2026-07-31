/* Copyright (C) 2025 flywave.gl contributors */

import { type HighPrecisionLineMaterial } from "@flywave/flywave-materials";
import * as THREE from "three/webgpu";

import { HighPrecisionUtils } from "./HighPrecisionUtils";

export interface HighPrecisionObject extends THREE.Object3D {
    bufferGeometry: THREE.BufferGeometry;
    shaderMaterial: THREE.ShaderMaterial;
    matrixWorldInverse: THREE.Matrix4;
    setPositions(positions: number[] | THREE.Vector3[]): void;
    setupForRendering(): void;
}

export class HighPrecisionWireFrameLine extends THREE.Line implements HighPrecisionObject {
    matrixWorldInverse: THREE.Matrix4;

    constructor(
        geometry: THREE.BufferGeometry,
        material: HighPrecisionLineMaterial,
        positions?: number[] | THREE.Vector3[]
    ) {
        super(geometry, material);
        this.matrixWorldInverse = new THREE.Matrix4();

        if (positions) {
            this.setPositions(positions);
        }
    }

    get bufferGeometry(): THREE.BufferGeometry {
        return this.geometry as THREE.BufferGeometry;
    }

    get shaderMaterial(): THREE.ShaderMaterial {
        return this.material as THREE.ShaderMaterial;
    }

    setPositions(positions: number[] | THREE.Vector3[]): void {
        HighPrecisionUtils.setPositions(this, positions);
    }

    setupForRendering(): void {}

    updateMatrixWorld(force: boolean) {
        const doUpdateMatrixWorldInverse = this.matrixWorldNeedsUpdate || force;

        super.updateMatrixWorld(force);

        if (doUpdateMatrixWorldInverse) {
            this.matrixWorldInverse.copy(this.matrixWorld).invert();
        }
    }
}

export class HighPrecisionLine extends THREE.Mesh implements HighPrecisionObject {
    matrixWorldInverse: THREE.Matrix4;

    constructor(
        geometry: THREE.BufferGeometry,
        material: HighPrecisionLineMaterial,
        positions?: number[] | THREE.Vector3[]
    ) {
        super(geometry, material);

        this.matrixWorldInverse = new THREE.Matrix4();

        if (positions) {
            this.setPositions(positions);
        }
    }

    get bufferGeometry(): THREE.BufferGeometry {
        return this.geometry as THREE.BufferGeometry;
    }

    get shaderMaterial(): THREE.ShaderMaterial {
        return this.material as THREE.ShaderMaterial;
    }

    setPositions(positions: number[] | THREE.Vector3[]): void {
        HighPrecisionUtils.setPositions(this, positions);
    }

    setupForRendering(): void {}

    updateMatrixWorld(force: boolean) {
        const doUpdateMatrixWorldInverse = this.matrixWorldNeedsUpdate || force;

        super.updateMatrixWorld(force);

        if (doUpdateMatrixWorldInverse) {
            this.matrixWorldInverse.copy(this.matrixWorld).invert();
        }
    }
}
