/* Copyright (C) 2025 flywave.gl contributors */



import * as THREE from "three";

export class PointStringMaterial extends THREE.PointsMaterial {
    constructor(weight: number, color: THREE.Color) {
        super({
            size: weight,
            color,
            sizeAttenuation: false,
            transparent: true,
            alphaTest: 0.1
        });
    }
}
