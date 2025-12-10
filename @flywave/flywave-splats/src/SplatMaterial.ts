/* Copyright (C) 2025 flywave.gl contributors */

import {
    type Camera,
    type WebGLRenderer,
    DoubleSide,
    NormalBlending,
    ShaderMaterial,
    Vector2
} from "three";

import { type SplatMesh } from "./SplatMesh";
import { fragmentShaderSource, vertexShaderSource } from "./SplatShaders";

export class SplatMaterial {
    /**
     * Build the Three.js material that is used to render the splats.
     * @param {number} dynamicMode If true, it means the scene geometry represented by this splat mesh is not stationary or
     *                             that the splat count might change
     * @param {boolean} enableOptionalEffects When true, allows for usage of extra properties and attributes in the shader for effects
     *                                        such as opacity adjustment. Default is false for performance reasons.
     * @param {boolean} antialiased If true, calculate compensation factor to deal with gaussians being rendered at a significantly
     *                              different resolution than that of their training
     * @param {number} maxScreenSpaceSplatSize The maximum clip space splat size
     * @param {number} splatScale Value by which all splats are scaled in screen-space (default is 1.0)
     * @param {number} pointCloudModeEnabled Render all splats as screen-space circles
     * @param {number} maxSphericalHarmonicsDegree Degree of spherical harmonics to utilize in rendering splats
     * @return {THREE.ShaderMaterial}
     */
    static build(maxSphericalHarmonicsDegree = 0) {
        const defines = {
            SH_DEGREE: maxSphericalHarmonicsDegree
        };

        const uniforms = {
            invViewport: {
                type: "v2",
                value: new Vector2()
            },
            dataTextureSize: {
                type: "v2",
                value: new Vector2()
            },
            focal: {
                type: "v2",
                value: new Vector2()
            },

            covariancesATexture: {
                type: "t",
                value: null
            },
            covariancesBTexture: {
                type: "t",
                value: null
            },
            centersTexture: {
                type: "t",
                value: null
            },
            colorsTexture: {
                type: "t",
                value: null
            },
            shTexture0: {
                type: "t",
                value: null
            },
            shTexture1: {
                type: "t",
                value: null
            },
            shTexture2: {
                type: "t",
                value: null
            }
        };

        const material = new ShaderMaterial({
            uniforms,
            defines,
            vertexShader: vertexShaderSource,
            fragmentShader: fragmentShaderSource,
            transparent: true,
            alphaTest: 1.0,
            blending: NormalBlending,
            depthTest: true,
            depthWrite: false,
            side: DoubleSide
        });

        return material;
    }

    static updateUniforms(renderer: WebGLRenderer, camera: Camera, mesh: SplatMesh) {
        if (!mesh.material || !(mesh.material instanceof ShaderMaterial)) {
            return;
        }

        const shaderMaterial = mesh.material as ShaderMaterial;
        const uniforms = shaderMaterial.uniforms;

        const renderSize = new Vector2();
        renderer.getSize(renderSize);
        const renderWidth = renderSize.x;
        const renderHeight = renderSize.y;

        // check if rigcamera, get number of rigs
        const numberOfRigs = 1;

        uniforms.invViewport.value.set(1 / (renderWidth / numberOfRigs), 1 / renderHeight);

        if (camera) {
            const focalLengthX = camera.projectionMatrix.elements[0] * 0.5 * renderWidth;
            const focalLengthY = camera.projectionMatrix.elements[5] * 0.5 * renderHeight;

            uniforms.focal.value.set(focalLengthX, focalLengthY);
        }

        const gsMesh = mesh as SplatMesh;

        if (gsMesh.covariancesATexture) {
            const textureWidth = gsMesh.covariancesATexture.image.width;
            const textureHeight = gsMesh.covariancesATexture.image.height;
            uniforms.dataTextureSize.value.set(textureWidth, textureHeight);

            uniforms.covariancesATexture.value = gsMesh.covariancesATexture;
            uniforms.covariancesBTexture.value = gsMesh.covariancesBTexture;
            uniforms.centersTexture.value = gsMesh.centersTexture;
            uniforms.colorsTexture.value = gsMesh.colorsTexture;

            if (gsMesh.shTextures) {
                for (let i = 0; i < gsMesh.shTextures?.length; i++) {
                    uniforms[`shTexture${i}`].value = gsMesh.shTextures[i];
                }
            }
        }

        shaderMaterial.uniformsNeedUpdate = true;
    }
}
