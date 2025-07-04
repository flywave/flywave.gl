import * as THREE from "three";

import { createPolygon } from "./Polygon";

export const createSquare = () => [
    createPolygon([
        new THREE.Vector3(-0.5, 0.5, 0.0),
        new THREE.Vector3(-0.5, -0.5, 0.0),
        new THREE.Vector3(0.5, -0.5, 0.0),
        new THREE.Vector3(0.5, 0.5, 0.0)
    ])
];
