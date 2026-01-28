/* Copyright (C) 2025 flywave.gl contributors */

import { type GeoBox } from "@flywave/flywave-geoutils";
import type * as THREE from "three";

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
    renderTarget: THREE.WebGLRenderTarget | null;
    distanceTexture: THREE.Texture;
}
