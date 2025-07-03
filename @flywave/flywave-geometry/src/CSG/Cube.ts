import * as THREE from "three";

import { createPolygon, Polygon } from "./Polygon";

export const createCube = (options?: {
    readonly center?: THREE.Vector3;
    readonly radius?: THREE.Vector3;
}): readonly Polygon[] => {
    const c: THREE.Vector3 = (options && options.center) || new THREE.Vector3(0, 0, 0);
    const r: THREE.Vector3 = (options && options.radius) || new THREE.Vector3(1, 1, 1);
    return [
        { positions: [0, 4, 6, 2] },
        { positions: [1, 3, 7, 5] },
        { positions: [0, 1, 5, 4] },
        { positions: [2, 6, 7, 3] },
        { positions: [0, 2, 3, 1] },
        { positions: [4, 5, 7, 6] }
    ].map(({ positions }) =>
        createPolygon(
            positions.map(
                i =>
                    new THREE.Vector3(
                        i & 1 ? c.x + r.x : c.x - r.x,
                        i & 2 ? c.y + r.y : c.y - r.y,
                        i & 4 ? c.z + r.z : c.z - r.z
                    )
            )
        )
    );
};
