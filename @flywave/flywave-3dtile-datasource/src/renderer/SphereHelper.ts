/* Copyright (C) 2025 flywave.gl contributors */

import {
    type Color,
    type Material,
    type Sphere,
    BufferAttribute,
    BufferGeometry,
    LineBasicMaterial,
    LineSegments,
    Vector3
} from "three";

const _vector = new Vector3();
const axes = ["x", "y", "z"] as const;

export class SphereHelper extends LineSegments {
    public readonly type: string = "SphereHelper";
    public sphere: Sphere;

    constructor(
        sphere: Sphere,
        color: Color | string | number = 0xffff00,
        angleSteps: number = 40
    ) {
        const geometry = new BufferGeometry();
        const positions: number[] = [];

        for (let i = 0; i < 3; i++) {
            const axis1 = axes[i];
            const axis2 = axes[(i + 1) % 3];
            _vector.set(0, 0, 0);

            for (let a = 0; a < angleSteps; a++) {
                let angle = (2 * Math.PI * a) / (angleSteps - 1);
                _vector[axis1] = Math.sin(angle);
                _vector[axis2] = Math.cos(angle);

                positions.push(_vector.x, _vector.y, _vector.z);

                angle = (2 * Math.PI * (a + 1)) / (angleSteps - 1);
                _vector[axis1] = Math.sin(angle);
                _vector[axis2] = Math.cos(angle);

                positions.push(_vector.x, _vector.y, _vector.z);
            }
        }

        geometry.setAttribute("position", new BufferAttribute(new Float32Array(positions), 3));
        geometry.computeBoundingSphere();

        const material = new LineBasicMaterial({
            color,
            toneMapped: false
        });

        super(geometry, material);
        this.sphere = sphere;
    }

    updateMatrixWorld(force?: boolean): void {
        const sphere = this.sphere;

        this.position.copy(sphere.center);
        this.scale.setScalar(sphere.radius);

        super.updateMatrixWorld(force);
    }

    dispose(): void {
        this.geometry.dispose();
        (this.material as Material).dispose();
    }
}
