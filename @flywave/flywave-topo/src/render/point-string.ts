import * as THREE from "three";

export class PointStringMaterial extends THREE.PointsMaterial {
    constructor(weight: number, color: THREE.Color) {
        super({
            size: weight,
            color: color,
            sizeAttenuation: false,
            transparent: true,
            alphaTest: 0.1
        });
    }
}
