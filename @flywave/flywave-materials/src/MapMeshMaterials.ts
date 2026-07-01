/* Copyright (C) 2025 flywave.gl contributors */
// @ts-nocheck

import * as THREE from "three";

import { type DisplacementFeatureParameters, DisplacementFeature } from "./DisplacementFeature";
import { ExtrusionFeatureDefs } from "./MapMeshMaterialsDefs";
import { type ViewRanges } from "./ViewRanges";

export interface HiddenThreeJSMaterialProperties {
    needsUpdate?: boolean;
    transparent?: boolean;
    defines?: any;
}

export type UniformsType = Record<string, { value: any }>;

export interface MixinShaderProperties {
    shaderDefines?: any;
    shaderUniforms?: UniformsType;
}

export interface FadingFeatureParameters {
    fadeNear?: number;
    fadeFar?: number;
}

export interface ShadowFeatureParameters {
    removeDiffuseLight?: boolean;
}

export interface ExtrusionFeatureParameters {
    extrusionRatio?: number;
    zFightingWorkaround?: boolean;
}

export type CompileCallback = (shader: any, renderer: any) => void;

export interface FadingFeature extends HiddenThreeJSMaterialProperties, MixinShaderProperties {
    fadeNear?: number;
    fadeFar?: number;
}

export interface ExtrusionFeature extends HiddenThreeJSMaterialProperties, MixinShaderProperties {
    extrusionRatio?: number;
}

export function hasExtrusionFeature(material: any): material is ExtrusionFeature {
    return "extrusionRatio" in material;
}

function cameraToWorldDistance(distance: number, visibilityRange: ViewRanges): number {
    return distance * visibilityRange.maximum;
}

export namespace FadingFeature {
    export const DEFAULT_FADE_NEAR: number = -1.0;
    export const DEFAULT_FADE_FAR: number = -1.0;

    export function isEnabled(fadingMaterial: FadingFeature) {
        return (
            fadingMaterial.fadeNear !== undefined &&
            fadingMaterial.fadeFar !== undefined &&
            fadingMaterial.fadeFar > 0
        );
    }

    export function isDefined(fadingMaterial: FadingFeature) {
        return fadingMaterial.fadeNear !== undefined && fadingMaterial.fadeFar !== undefined;
    }

    export function patchGlobalShaderChunks() {}

    export function addRenderHelper(
        object: THREE.Object3D,
        viewRanges: ViewRanges,
        fadeNear: number | undefined,
        fadeFar: number | undefined,
        updateUniforms: boolean,
        additionalCallback?: (renderer: any, material: any) => void
    ) {
        object.onBeforeRender = (
            renderer: any,
            scene: THREE.Scene,
            camera: THREE.Camera,
            geometry: THREE.BufferGeometry,
            material: any,
            group: THREE.Group
        ) => {
            const fadingMaterial = material as FadingFeature;
            fadingMaterial.fadeNear =
                fadeNear === undefined || fadeNear === FadingFeature.DEFAULT_FADE_NEAR
                    ? FadingFeature.DEFAULT_FADE_NEAR
                    : cameraToWorldDistance(fadeNear, viewRanges);
            fadingMaterial.fadeFar =
                fadeFar === undefined || fadeFar === FadingFeature.DEFAULT_FADE_FAR
                    ? FadingFeature.DEFAULT_FADE_FAR
                    : cameraToWorldDistance(fadeFar, viewRanges);

            if (FadingFeature.isEnabled(fadingMaterial)) {
                const dist = object.position.distanceTo(camera.position);
                const t = THREE.MathUtils.smoothstep(
                    dist,
                    fadingMaterial.fadeNear!,
                    fadingMaterial.fadeFar!
                );
                material.opacity = 1.0 - t;
                material.transparent = material.opacity < 1.0;
            }

            if (additionalCallback !== undefined) {
                additionalCallback(renderer, material);
            }
        };
    }
}

export namespace ExtrusionFeature {
    export function isEnabled(m: ExtrusionFeature) {
        return (
            m.extrusionRatio !== undefined &&
            m.extrusionRatio >= ExtrusionFeatureDefs.DEFAULT_RATIO_MIN
        );
    }

    export function patchGlobalShaderChunks() {}
}

export namespace DisplacementFeatureHelpers {
    export function isEnabled(displacementMaterial: DisplacementFeature) {
        return displacementMaterial.displacementMap !== null;
    }

    export function updateDisplacementFeature(
        displacementMaterial: DisplacementFeature & MixinShaderProperties
    ): void {}
}

export class MapMeshBasicMaterial
    extends THREE.MeshBasicMaterial
    implements FadingFeature, ExtrusionFeature, DisplacementFeature
{
    fadeNear: number = FadingFeature.DEFAULT_FADE_NEAR;
    fadeFar: number = FadingFeature.DEFAULT_FADE_FAR;
    extrusionRatio: number = ExtrusionFeatureDefs.DEFAULT_RATIO_MAX;
    displacementMap: THREE.Texture | null = null;
    displacementMapUvMatrix: THREE.Matrix3 | null = null;

    constructor(
        params?: THREE.MeshBasicMaterialParameters &
            FadingFeatureParameters &
            ExtrusionFeatureParameters &
            DisplacementFeatureParameters
    ) {
        super(params);

        this.fadeNear = params?.fadeNear ?? FadingFeature.DEFAULT_FADE_NEAR;
        this.fadeFar = params?.fadeFar ?? FadingFeature.DEFAULT_FADE_FAR;
        this.extrusionRatio = params?.extrusionRatio ?? ExtrusionFeatureDefs.DEFAULT_RATIO_MAX;
        if (params?.displacementMap) {
            this.displacementMap = params.displacementMap;
        }
    }

    clone(): this {
        return new MapMeshBasicMaterial().copy(this);
    }

    copy(source: this): any {
        super.copy(source);
        this.fadeNear = source.fadeNear;
        this.fadeFar = source.fadeFar;
        this.extrusionRatio = source.extrusionRatio;
        this.displacementMap = source.displacementMap;
        this.displacementMapUvMatrix = source.displacementMapUvMatrix;
        return this;
    }
}

export class MapMeshDepthMaterial extends THREE.MeshDepthMaterial implements ExtrusionFeature {
    extrusionRatio: number = ExtrusionFeatureDefs.DEFAULT_RATIO_MAX;

    constructor(params?: THREE.MeshDepthMaterialParameters & ExtrusionFeatureParameters) {
        super(params);
        this.extrusionRatio = params?.extrusionRatio ?? ExtrusionFeatureDefs.DEFAULT_RATIO_MAX;
    }

    clone(): this {
        return new MapMeshDepthMaterial().copy(this);
    }

    copy(source: this): any {
        super.copy(source);
        this.extrusionRatio = source.extrusionRatio;
        return this;
    }
}

export class MapMeshStandardMaterial
    extends THREE.MeshStandardMaterial
    implements FadingFeature, ExtrusionFeature, DisplacementFeature
{
    fadeNear: number = FadingFeature.DEFAULT_FADE_NEAR;
    fadeFar: number = FadingFeature.DEFAULT_FADE_FAR;
    extrusionRatio: number = ExtrusionFeatureDefs.DEFAULT_RATIO_MAX;
    displacementMap: THREE.Texture | null = null;
    displacementMapUvMatrix: THREE.Matrix3 | null = null;
    removeDiffuseLight: boolean = false;

    constructor(
        params?: THREE.MeshStandardMaterialParameters &
            FadingFeatureParameters &
            ExtrusionFeatureParameters &
            ShadowFeatureParameters
    ) {
        super(params);

        this.fadeNear = params?.fadeNear ?? FadingFeature.DEFAULT_FADE_NEAR;
        this.fadeFar = params?.fadeFar ?? FadingFeature.DEFAULT_FADE_FAR;
        this.extrusionRatio = params?.extrusionRatio ?? ExtrusionFeatureDefs.DEFAULT_RATIO_MAX;
        this.removeDiffuseLight = params?.removeDiffuseLight ?? false;
        if (params?.displacementMap) {
            this.displacementMap = params.displacementMap;
        }
    }

    clone(): this {
        return new MapMeshStandardMaterial().copy(this);
    }

    copy(source: this): any {
        super.copy(source);
        this.fadeNear = source.fadeNear;
        this.fadeFar = source.fadeFar;
        this.extrusionRatio = source.extrusionRatio;
        this.displacementMap = source.displacementMap;
        this.displacementMapUvMatrix = source.displacementMapUvMatrix;
        return this;
    }
}
