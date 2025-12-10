/* Copyright (C) 2025 flywave.gl contributors */

import { type DisplacementFeature, hasDisplacementFeature } from "@flywave/flywave-materials";
import { assert } from "@flywave/flywave-utils";
import * as THREE from "three";

import { DisplacedBufferAttribute } from "./DisplacedBufferAttribute";
import { type DisplacementRange, DisplacedBufferGeometry } from "./DisplacedBufferGeometry";

function isDisplacementMaterial(material: any): material is DisplacementFeature {
    const isDisplacementFeature = hasDisplacementFeature(material);
    assert(isDisplacementFeature, "Material does not support displacement maps.");
    return isDisplacementFeature;
}

function isDataTextureMap(map?: THREE.Texture | null): map is THREE.DataTexture {
    if (!map) {
        return false;
    }
    const isDataTexture = map instanceof THREE.DataTexture;
    assert(isDataTexture, "Material does not support displacement maps.");
    return isDataTexture;
}

/**
 * Mesh with geometry modified by a displacement map. Overrides raycasting behaviour to apply
 * displacement map before intersection test.
 * @internal
 */
export class DisplacedMesh extends THREE.Mesh {
    private static displacedPositions?: DisplacedBufferAttribute;

    private static getDisplacedPositionAttribute(
        geometry: THREE.BufferGeometry,
        displacementMap: THREE.DataTexture
    ): DisplacedBufferAttribute {
        // Reuse same buffer attribute for all meshes since it's only needed during the
        // intersection test.
        if (!DisplacedMesh.displacedPositions) {
            DisplacedMesh.displacedPositions = new DisplacedBufferAttribute(
                geometry.attributes.position,
                geometry.attributes.normal,
                geometry.attributes.uv,
                displacementMap
            );
        } else {
            DisplacedMesh.displacedPositions.reset(
                geometry.attributes.position,
                geometry.attributes.normal,
                geometry.attributes.uv,
                displacementMap
            );
        }
        return DisplacedMesh.displacedPositions;
    }

    displacedGeometry?: DisplacedBufferGeometry;

    /**
     * Creates an instance of displaced mesh.
     * @param geometry - Original geometry to displace.
     * @param material - Material(s) to be used by the mesh. All must have the same
     *                   displacement map.
     * @param m_getDisplacementRange - Displacement values range getter.
     * @param [m_raycastStrategy] Function that will be used to find ray intersections. If not
     * provided, THREE.Mesh's raycast will be used.
     */
    constructor(
        geometry: THREE.BufferGeometry,
        material: THREE.Material | THREE.Material[],
        private readonly m_getDisplacementRange: () => DisplacementRange,
        private readonly m_raycastStrategy?: (
            mesh: THREE.Mesh,
            raycaster: THREE.Raycaster,
            intersects: THREE.Intersection[]
        ) => void
    ) {
        super(geometry, material);
    }

    // FLYWAVE-9585: Override of base class method, however tslint doesn't recognize it as such.
    raycast(raycaster: THREE.Raycaster, intersects: THREE.Intersection[]): void {
        // All materials in the object are expected to have the same displacement map.
        const firstMaterial = this.firstMaterial;

        // Use default raycasting implementation if there's no displacement material or if there's
        // no displacement map or its type is not supported.
        if (
            !isDisplacementMaterial(firstMaterial) ||
            !isDataTextureMap(firstMaterial.displacementMap)
        ) {
            super.raycast(raycaster, intersects);
            return;
        }
        const displacementMap = firstMaterial.displacementMap;
        const displacementRange = { ...this.m_getDisplacementRange() };

        assert(this.geometry instanceof THREE.BufferGeometry, "Unsupported geometry type.");
        const geometry = this.geometry as THREE.BufferGeometry;
        if (this.displacedGeometry) {
            this.displacedGeometry.reset(geometry, displacementMap, displacementRange);
        } else {
            this.displacedGeometry = new DisplacedBufferGeometry(
                geometry,
                displacementMap,
                displacementRange,
                DisplacedMesh.getDisplacedPositionAttribute(geometry, displacementMap)
            );
        }

        // Replace the original geometry by the displaced one only during the intersection test.
        this.geometry = this.displacedGeometry;
        if (this.m_raycastStrategy) {
            this.m_raycastStrategy(this, raycaster, intersects);
        } else {
            super.raycast(raycaster, intersects);
        }
        this.geometry = this.displacedGeometry.originalGeometry;
    }

    private get firstMaterial(): THREE.Material {
        return Array.isArray(this.material) ? this.material[0] : this.material;
    }
}
