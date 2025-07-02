import "./Shader";

import * as THREE from "three";

export class ElevationMaterial extends THREE.ShaderMaterial {
    private _frameNumber: number = 0;
    private _waterMaskTexture: THREE.Texture;
    private _normalTexture: THREE.Texture;
    private readonly _clipUvTransform: THREE.Vector3;
    private readonly _imageUvTransform: THREE.Vector4;
    private _isWebMercator: boolean;
    private readonly _waterMaskTranslationAndScale: THREE.Vector4;
    private readonly _waterMaskNoisyTranslationAndScale: THREE.Vector4;

    constructor(parameters?: THREE.ShaderMaterialParameters) {
        super({
            uniforms: THREE.UniformsUtils.merge([
                THREE.UniformsLib.common,
                THREE.UniformsLib.normalmap,
                {
                    clipUvTransfrom: { value: new THREE.Vector3() },
                    imageUvTransfrom: { value: new THREE.Vector4() },
                    isWebMercator: { value: false },
                    u_waterMask: { value: null },
                    normalSampler: { value: null },
                    u_waterMaskTranslationAndScale: { value: new THREE.Vector4() },
                    u_waterMaskNoisyTranslationAndScale: { value: new THREE.Vector4() },
                    frameNumber: { value: 0 }
                }
            ]),
            defines: {
                SHOW_REFLECTIVE_OCEAN: true,
                USE_UV: false,
                USE_GT_151: parseInt((THREE as any).REVISION) >= 151
            },
            ...parameters
        });

        this._waterMaskTexture = this.uniforms.u_waterMask.value;
        this._normalTexture = this.uniforms.normalSampler.value;
        this._clipUvTransform = this.uniforms.clipUvTransfrom.value;
        this._imageUvTransform = this.uniforms.imageUvTransfrom.value;
        this._isWebMercator = this.uniforms.isWebMercator.value;
        this._waterMaskTranslationAndScale = this.uniforms.u_waterMaskTranslationAndScale.value;
        this._waterMaskNoisyTranslationAndScale =
            this.uniforms.u_waterMaskNoisyTranslationAndScale.value;

        this.onBeforeCompile = shader => {
            // Vertex shader modifications
            shader.vertexShader = shader.vertexShader
                .replace(
                    `#include <beginnormal_vertex>`,
                    `#include <beginnormal_vertex>
                     #include <beginnormal_tinterrain_vertex>`
                )
                .replace(
                    `#include <uv_pars_vertex>`,
                    `#include <uv_pars_vertex>
                     #include <tinterrain_common>`
                )
                .replace(
                    `#include <begin_vertex>`,
                    `#include <begin_vertex>
                     #include <begin_tinterrain_vertex>`
                );

            // Fragment shader modifications
            shader.fragmentShader = shader.fragmentShader
                .replace(
                    `#include <color_pars_fragment>`,
                    `#include <color_pars_fragment>
                     #include <tinterrain_color_pars_fragment>
                     #include <water_mask_pars_fragment>`
                )
                .replace(
                    `#include <premultiplied_alpha_fragment>`,
                    `#include <premultiplied_alpha_fragment>
                     #include <discard_out_range_frag>
                     #include <water_mask_compute_color_fragment>`
                );
        };
    }

    get frameNumber(): number {
        return this._frameNumber;
    }

    set frameNumber(value: number) {
        if (this._frameNumber !== value) {
            this._frameNumber = value;
            this.uniforms.frameNumber.value = value;
        }
    }

    get waterMaskTexture(): THREE.Texture {
        return this._waterMaskTexture;
    }

    set waterMaskTexture(value: THREE.Texture) {
        if (this._waterMaskTexture !== value) {
            this._waterMaskTexture = value;
            this.uniforms.u_waterMask.value = value;
        }
    }

    get normalTexture(): THREE.Texture {
        return this._normalTexture;
    }

    set normalTexture(value: THREE.Texture) {
        if (this._normalTexture !== value) {
            this._normalTexture = value;
            this.uniforms.normalSampler.value = value;
        }
    }

    get clipUvTransform(): THREE.Vector3 {
        return this._clipUvTransform;
    }

    set clipUvTransform(value: THREE.Vector3) {
        if (!this._clipUvTransform.equals(value)) {
            this._clipUvTransform.copy(value);
            this.uniforms.clipUvTransfrom.value.copy(value);
        }
    }

    get imageUvTransform(): THREE.Vector4 {
        return this._imageUvTransform;
    }

    set imageUvTransform(value: THREE.Vector4) {
        if (!this._imageUvTransform.equals(value)) {
            this._imageUvTransform.copy(value);
            this.uniforms.imageUvTransfrom.value.copy(value);
        }
    }

    get isWebMercator(): boolean {
        return this._isWebMercator;
    }

    set isWebMercator(value: boolean) {
        if (this._isWebMercator !== value) {
            this._isWebMercator = value;
            this.uniforms.isWebMercator.value = value;
        }
    }

    get waterMaskTranslationAndScale(): THREE.Vector4 {
        return this._waterMaskTranslationAndScale;
    }

    set waterMaskTranslationAndScale(value: THREE.Vector4) {
        if (!this._waterMaskTranslationAndScale.equals(value)) {
            this._waterMaskTranslationAndScale.copy(value);
            this.uniforms.u_waterMaskTranslationAndScale.value.copy(value);
        }
    }

    get waterMaskNoisyTranslationAndScale(): THREE.Vector4 {
        return this._waterMaskNoisyTranslationAndScale;
    }

    set waterMaskNoisyTranslationAndScale(value: THREE.Vector4) {
        if (!this._waterMaskNoisyTranslationAndScale.equals(value)) {
            this._waterMaskNoisyTranslationAndScale.copy(value);
            this.uniforms.u_waterMaskNoisyTranslationAndScale.value.copy(value);
        }
    }

    updateFromTerrainTile(tinTile: any, terrainTile: any, provider: any) {
        this.clipUvTransform = terrainTile.computeClipUvTransfrom(
            tinTile.tileKey,
            terrainTile.tileKey
        );
        this.imageUvTransform = terrainTile.computeTextureUvTransfrom(tinTile, provider);
        this.isWebMercator = provider.isWebMercator();

        const waterMaskTile = terrainTile.getWaterMaskTile();
        if (waterMaskTile) {
            this.waterMaskTexture = waterMaskTile.waterMask;
            this.waterMaskTranslationAndScale = terrainTile.computeWaterMaskTransfrom(
                waterMaskTile,
                tinTile
            );
            this.waterMaskNoisyTranslationAndScale =
                terrainTile.computeWaterMaskNoisyTransfrom(tinTile);
        } else {
            this.waterMaskTexture = new THREE.DataTexture();
            this.waterMaskTranslationAndScale = new THREE.Vector4();
            this.waterMaskNoisyTranslationAndScale = new THREE.Vector4();
        }
    }
}
