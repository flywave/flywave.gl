/* Copyright (C) 2025 flywave.gl contributors */

import { type Intersection, type Raycaster } from "three";

export interface ICameraCollidable {
    enableCameraCollision: boolean;
    raycast(raycaster: Raycaster, intersections: Intersection[]): void;
}
