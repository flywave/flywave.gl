/* Copyright (C) 2025 flywave.gl contributors */

import { type Fog } from "@flywave/flywave-datasource-protocol";
import { HighPrecisionLineMaterial } from "@flywave/flywave-materials";
import { RawShaderMaterial } from "@flywave/flywave-materials/RawShaderMaterial";
import { assert, MathUtils } from "@flywave/flywave-utils";
import * as THREE from "three/webgpu";

import { type MapView } from "./MapView";

/**
 * Manages the fog display in {@link MapView}.
 */
export class MapViewFog {
    private m_enabled: boolean = true;
    private readonly m_fog: THREE.FogExp2 = new THREE.FogExp2(0x000000); // Default color asked by DefinitelyTyped.
    private m_fogIsDefined: boolean = false;
    private m_cachedFog: Fog | undefined;

    /**
     * Constructs a `MapViewFog` instance.
     *
     * @param m_scene - The scene used in {@link MapView} that contains the map objects.
     */
    constructor(private readonly m_scene: THREE.Scene) {}

    /**
     * Allows for disabling the fog, even if it is defined in the theme. Use this property for
     * custom views like the demo app's debug camera. However, if the theme does not define a
     * fog, enabling this property here has no effect.
     *
     * @param value - A boolean that specifies whether the fog should be enabled or disabled.
     */
    set enabled(enableFog: boolean) {
        this.m_enabled = enableFog;
        if (enableFog && this.m_fogIsDefined && this.m_scene.fog === null) {
            this.add();
        } else if (!enableFog && this.m_scene.fog !== null) {
            this.remove();
        }
    }

    /**
     * Returns the current fog status, enabled or disabled.
     */
    get enabled(): boolean {
        return this.m_enabled;
    }

    /**
     * Sets the fog depending on the {@link @here/FLYWAVE-datasource-protocol#Theme}
     * instance provided. This function is called when a
     * theme is loaded. Fog is added only if the theme contains a fog definition with a:
     * - `color` property, used to set the fog color.
     * - `ratio` property, used to set the fog density.
     * - `range` property, used to set the fog effect range.
     *
     * @param fog - A {@link @here/FLYWAVE-datasource-protocol#Fog} instance.
     */
    reset(fog?: Fog) {
        this.m_cachedFog = fog;
        if (fog !== undefined && fog.color !== undefined && fog.ratio !== undefined) {
            this.m_fogIsDefined = true;
            this.m_fog.color.set(fog.color);
            if (this.m_enabled && this.m_scene.fog === null) {
                this.add();
            }
        } else {
            this.m_fogIsDefined = false;
            if (this.m_scene.fog !== null) {
                this.remove();
            }
        }
    }

    /**
     * Updates the fog at runtime, depending on the camera and view distance.
     *
     * @param mapView - The map view instance.
     * @param viewDistance - The current view distance.
     */
    update(mapView: MapView, viewDistance?: number) {
        if (
            this.m_scene.fog !== null &&
            this.m_cachedFog !== undefined &&
            this.m_cachedFog &&
            this.m_cachedFog.ratio !== undefined
        ) {
            let density = this.m_cachedFog.ratio;

            // If a range parameter is provided and viewDistance is valid, adjust the
            // fog density based on distance
            if (this.m_cachedFog.range !== undefined && viewDistance !== undefined) {
                const range = this.m_cachedFog.range;

                // When viewDistance exceeds range, the fog density fades toward 0
                if (viewDistance > range) {
                    // Fraction of the overshoot beyond range, for a smooth transition
                    const excessRatio = (viewDistance - range) / range;
                    // Exponential decay makes the fog density approach 0 gradually
                    const fadeFactor = Math.exp(-excessRatio * 2); // the coefficient controls the decay rate
                    density = this.m_cachedFog.ratio * fadeFactor;
                }
            }

            this.m_fog.density = density;
        }
    }

    /**
     * Handles fog addition.
     */
    private add() {
        // When the fog is changed, ThreeJS takes care of recompiling its built-in materials...
        this.m_scene.fog = this.m_fog;
        // ...except the `RawShaderMaterial`, on purpose, so it needs to be updated from the app.
        this.setFogInRawShaderMaterials(true);
    }

    /**
     * Handles fog removal.
     */
    private remove() {
        // When the fog is changed, ThreeJS takes care of recompiling its built-in materials...
        this.m_scene.fog = null;
        // ...except the `RawShaderMaterial`, on purpose, so it needs to be updated from the app.
        this.setFogInRawShaderMaterials(false);
    }

    /**
     * ThreeJS lets users manage the `RawShaderMaterial` themselves, so they need to be modified
     * explicitly.
     *
     * @see https://github.com/mrdoob/three.js/blob/dev/src/renderers/webgl/WebGLProgram.js#L298
     */
    private setFogInRawShaderMaterials(enableFog: boolean) {
        this.m_scene.traverse(object => {
            if (object instanceof THREE.Mesh) {
                const material = object.material;
                if (
                    material instanceof THREE.Material &&
                    // HighPrecisionLineMaterial does not support fog:
                    !(material instanceof HighPrecisionLineMaterial)
                ) {
                    if (material instanceof RawShaderMaterial) {
                        // Fog properties can't be easily changed at runtime (once the material
                        // is rendered at least once) and thus requires building of new shader
                        // program - force material update.
                        material.invalidateFog();
                    }
                }
            }
        });
    }
}
