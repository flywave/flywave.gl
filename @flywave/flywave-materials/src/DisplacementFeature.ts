/* Copyright (C) 2025 flywave.gl contributors */

import type * as THREE from "three";

import { type TileDisplacementMap } from "./DisplacementMap";
import { type HiddenThreeJSMaterialProperties } from "./MapMeshMaterials";
/**
 * Parameters used when constructing a new implementor of {@link DisplacementFeature}.
 */
export interface DisplacementFeatureParameters {
    /**
     * Texture used for vertex displacement along their normals.
     */
    displacementMap?: THREE.Texture;
    displacementMapUvMatrix?: THREE.Matrix3;
}

/**
 * Interface to be implemented by materials that use displacement maps to overlay geometry
 * on elevation data.
 */
export interface DisplacementFeature extends HiddenThreeJSMaterialProperties {
    displacementMap: THREE.Texture | null;
}

/**
 * Determines whether a given material supports displacement maps for elevation overlay.
 * @param material - The material to check.
 * @returns Whether the given material supports displacement maps for elevation overlay.
 */
export function hasDisplacementFeature(material: any): material is DisplacementFeature {
    return "displacementMap" in material;
}

/**
 * Sets the displacement map to the given material.
 * @param displacementMap - Texture representing the elevation data used to overlay the object.
 * @param material - The Material to be updated.
 */
export function setDisplacementMapToMaterial(
    displacementMap: TileDisplacementMap | null,
    material: THREE.Mesh["material"]
) {
    if (hasDisplacementFeature(material) && material.displacementMap !== displacementMap?.texture) {
        material.displacementMap = displacementMap?.texture as THREE.Texture;
        (material as any).displacementMapUvMatrix = displacementMap?.uvMatrix;
        material.needsUpdate = true;
        if (material.displacementMap !== null) {
            material.displacementMap.needsUpdate = true;
        }
    }
}
