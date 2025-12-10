/* Copyright (C) 2025 flywave.gl contributors */

import * as THREE from "three";

export interface Plane {
    readonly normal: THREE.Vector3;
    readonly w: number;
}

export const PlaneEpsilon = 1e-5;

export const fromVectors = (vectors: readonly THREE.Vector3[]): Plane => {
    if (vectors.length < 3) {
        throw new Error("At least 3 points are required to define a plane");
    }

    const a = vectors[0];
    const b = vectors[1];
    const c = vectors[2];

    const ab = new THREE.Vector3().subVectors(b, a);
    const ac = new THREE.Vector3().subVectors(c, a);
    const normal = new THREE.Vector3().crossVectors(ab, ac).normalize();

    return {
        normal,
        w: normal.dot(a)
    };
};

export const flipPlane = (plane: Plane): Plane => ({
    normal: new THREE.Vector3().copy(plane.normal).negate(),
    w: -plane.w
});
