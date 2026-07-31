/* Copyright (C) 2025 flywave.gl contributors */

import { type GeoBox } from "@flywave/flywave-geoutils";
import type * as THREE from "three/webgpu";

export interface RenderOptions {
    width?: number;
    height?: number;
    flipY?: boolean;
}

export interface GroundModificationResult {
    image: ImageData;
}

/**
 * Geometry creation result interface
 */
export interface GeometryResult {
    geometry: THREE.BufferGeometry;
    position: THREE.Vector3;
}

/**
 * Distance texture result interface
 */
export interface DistanceTextureResult {
    renderTarget: THREE.RenderTarget | null;
    distanceTexture: THREE.Texture;
}
