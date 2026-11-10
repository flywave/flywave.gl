/* Copyright (C) 2025 flywave.gl contributors */

import { type GradientSky } from "@flywave/flywave-datasource-protocol";
import { type ProjectionType } from "@flywave/flywave-geoutils";
import type * as THREE from "three/webgpu";

import { SkyGradientTexture } from "./SkyGradientTexture";

/**
 * Class that handles {@link MapView}'s sky background.
 *
 * Only gradient skies are supported: the cubemap sky was removed (it was never
 * visible while the atmosphere was enabled, is meaningless in planar
 * projection, and the accurate star catalogue is the supported night sky).
 */
export class SkyBackground {
    private m_skyTexture: SkyGradientTexture;

    /**
     * Constructs a new `SkyBackground`.
     *
     * @param m_sky - Sky configuration parameters.
     * @param m_projectionType - {@link MapView}'s projection type.
     * @param camera - {@link MapView}'s camera.
     */
    constructor(
        private m_sky: GradientSky,
        private m_projectionType: ProjectionType,
        camera: THREE.Camera
    ) {
        this.m_skyTexture = new SkyGradientTexture(this.m_sky, this.m_projectionType);
        this.updateCamera(camera);
    }

    /**
     * Disposes allocated resources.
     */
    dispose() {
        this.m_skyTexture.dispose();
    }

    /**
     * Sky texture.
     */
    get texture(): THREE.Texture {
        return this.m_skyTexture.texture;
    }

    /**
     * This method updates the skybox based on the camera position.
     *
     * @param camera - The camera used in the map view.
     */
    updateCamera(camera: THREE.Camera) {
        this.m_skyTexture.update(camera);
    }

    /**
     * Updates the sky texture with new parameters.
     *
     * @param params - New sky configuration parameters.
     * @param projectionType - Which projection is used, this may also change (in which case the
     * textures should be recreated).
     */
    updateTexture(params: GradientSky, projectionType: ProjectionType) {
        if (this.m_projectionType === projectionType) {
            this.m_skyTexture.updateTexture(params);
        } else {
            this.m_skyTexture.dispose();
            this.m_skyTexture = new SkyGradientTexture(params, projectionType);
        }
        this.m_projectionType = projectionType;
        this.m_sky = params;
    }
}
