/* Copyright (C) 2025 flywave.gl contributors */

import {
    type DataTexture,
    type WebGLRenderer,
    type WebGLRenderTarget,
    BufferAttribute,
    BufferGeometry,
    Mesh,
    OrthographicCamera,
    Scene,
    ShaderMaterial
} from "three";

import type { Variogram } from "../core/Variogram";
import { type DEMEncoding, type Grid } from "../types";
import { fragmentShader, vertexShader } from "./glsl";
import { TextureUtils } from "./utils/TextureUtils";
import { WebGLUtils } from "./utils/WebGLUtils";

export class KrigingRenderer {
    private readonly renderer: WebGLRenderer;
    private scene: Scene;
    private camera: OrthographicCamera;
    private mesh: Mesh;
    private material: ShaderMaterial;

    private variogramTexture: DataTexture;
    private renderTarget: WebGLRenderTarget;

    constructor(renderer: WebGLRenderer) {
        this.renderer = renderer;
        this.initScene();
    }

    private initScene(): void {
        this.scene = new Scene();
        this.camera = new OrthographicCamera(-1, 1, 1, -1, 0, 1);

        const geometry = this.createOptimizedGeometry();

        this.material = new ShaderMaterial({
            vertexShader,
            fragmentShader,
            uniforms: {
                // 修改：uniform命名与着色器一致
                u_variogramMxyTexture: { value: null },
                u_variogramMxySize: { value: [0, 0] },
                u_gridInfo: { value: [0, 0, 0] },
                u_outputSize: { value: [0, 0] },
                u_variogramParam: { value: [0, 0, 0, 0] }, // 修改：参数名改为u_variogramParam
                u_model: { value: 0 }, // 修改：参数名改为u_model
                u_dimension: { value: 0 }, // 新增：u_dimension参数
                u_encodingType: { value: 1 }
            }
        });

        this.mesh = new Mesh(geometry, this.material);
        this.scene.add(this.mesh);
    }

    private createOptimizedGeometry(): BufferGeometry {
        const geometry = new BufferGeometry();

        // 4个顶点组成一个矩形（两个三角形）
        const vertices = new Float32Array([
            -1,
            -1,
            0, // 左下
            1,
            -1,
            0, // 右下
            1,
            1,
            0, // 右上
            -1,
            1,
            0 // 左上
        ]);

        // UV坐标（用于片段着色器中的位置映射）
        const uvs = new Float32Array([
            0,
            0, // 左下
            1,
            0, // 右下
            1,
            1, // 右上
            0,
            1 // 左上
        ]);

        // 三角形索引（两个三角形）
        const indices = new Uint16Array([
            0,
            1,
            2, // 第一个三角形
            0,
            2,
            3 // 第二个三角形
        ]);

        geometry.setAttribute("position", new BufferAttribute(vertices, 3));
        geometry.setAttribute("uv", new BufferAttribute(uvs, 2));
        geometry.setIndex(new BufferAttribute(indices, 1));

        return geometry;
    }

    setVariogram(variogram: Variogram): void {
        if (this.variogramTexture) {
            this.variogramTexture.dispose();
        }

        this.variogramTexture = TextureUtils.createVariogramTexture(variogram);

        const modelTypeMap = {
            gaussian: 1.0,
            exponential: 2.0,
            spherical: 3.0
        };

        // 修复：确保uniform名称与着色器完全匹配
        this.material.uniforms.u_variogramMxyTexture.value = this.variogramTexture;
        this.material.uniforms.u_variogramMxySize.value = [
            this.variogramTexture.image.width,
            this.variogramTexture.image.height
        ];

        // 修复：传递正确的变差函数参数
        this.material.uniforms.u_variogramParam.value = [
            variogram.nugget, // nugget
            variogram.range, // range
            variogram.sill, // sill
            variogram.A // A
        ];

        this.material.uniforms.u_model.value = modelTypeMap[variogram.model];
        this.material.uniforms.u_dimension.value = variogram.n;

        this.material.needsUpdate = true;
    }

    renderDEM(grid: Grid, encoding: DEMEncoding = "mapbox"): WebGLRenderTarget {
        const { width, height, bounds, cellSize } = grid;

        if (
            !this.renderTarget ||
            this.renderTarget.width !== width ||
            this.renderTarget.height !== height
        ) {
            if (this.renderTarget) {
                this.renderTarget.dispose();
            }
            this.renderTarget = WebGLUtils.createRenderTarget(this.renderer, width, height);
        }

        const encodingType = encoding === "mapbox" ? 1.0 : 2.0;
        const cellSizeX = (bounds.maxX - bounds.minX) / width;
        const cellSizeY = (bounds.maxY - bounds.minY) / height;
        this.material.uniforms.u_gridInfo.value = [bounds.minX, bounds.minY, cellSizeX, cellSizeY];

        this.material.uniforms.u_outputSize.value = [width, height];
        this.material.uniforms.u_encodingType.value = encodingType;

        this.renderer.setRenderTarget(this.renderTarget);
        this.renderer.render(this.scene, this.camera);
        this.renderer.setRenderTarget(null);

        return this.renderTarget;
    }

    readPixels(renderTarget: WebGLRenderTarget): Uint8Array {
        const { width, height } = renderTarget;
        const pixels = new Float32Array(width * height * 4);

        this.renderer.readRenderTargetPixels(renderTarget, 0, 0, width, height, pixels);

        // 将Float32Array转换为Uint8Array
        const uint8Pixels = new Uint8Array(width * height * 4);
        for (let i = 0; i < pixels.length; i++) {
            // 将浮点数值转换为0-255范围的整数
            uint8Pixels[i] = Math.max(0, Math.min(255, Math.round(pixels[i] * 255)));
        }

        return uint8Pixels;
    }

    dispose(): void {
        if (this.variogramTexture) {
            this.variogramTexture.dispose();
        }
        if (this.renderTarget) {
            this.renderTarget.dispose();
        }
        if (this.mesh) {
            this.mesh.geometry.dispose();
            (this.mesh.material as ShaderMaterial).dispose();
        }
    }
}
