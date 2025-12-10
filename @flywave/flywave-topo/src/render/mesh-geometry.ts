/* Copyright (C) 2025 flywave.gl contributors */



import * as THREE from "three";

// 渲染模式枚举
export enum RenderMode {
    Wireframe = 0,
    HiddenLine = 1,
    SolidFill = 2,
    SmoothShade = 3,
    Monochrome = 4
}

// 渲染通道类型
export type RenderPass = "none" | "opaque" | "translucent" | "edge";

// 渲染目标接口
export interface RenderTarget {
    isDrawingShadowMap: boolean;
    currentViewFlags: {
        renderMode: RenderMode;
        visibleEdges: boolean;
        transparency: boolean;
    };
}

// 着色器参数
export interface ShaderParams {
    renderPass?: RenderPass;
    devicePixelRatio?: number;
}

export class MeshGeometry extends THREE.BufferGeometry {
    // 几何体属性
    public viewIndependentOrigin: THREE.Vector3;
    public edgeWidth: number;
    public edgeLineCode: number;
    public isPlanar: boolean;
    public hasBakedLighting: boolean;
    public hasScalarAnimation: boolean;

    // 材质相关属性
    public uniformColor: THREE.Vector4 | null = null;
    public texture: THREE.Texture | null = null;
    public normalMap: THREE.Texture | null = null;
    public vertexColors: boolean = false;

    // 实例计数（用于实例化渲染）
    public instanceCount: number = 0;

    // 材质缓存
    private readonly _materialCache = new Map<string, THREE.Material>();

    constructor(options: {
        indices?: Uint32Array | Uint16Array;
        positions: Float32Array;
        normals?: Float32Array;
        uvs?: Float32Array;
        colors?: Float32Array;
        viewIndependentOrigin?: THREE.Vector3;
        edgeWidth?: number;
        edgeLineCode?: number;
        isPlanar?: boolean;
        hasBakedLighting?: boolean;
        hasScalarAnimation?: boolean;
        uniformColor?: THREE.Vector4;
        texture?: THREE.Texture;
        normalMap?: THREE.Texture;
    }) {
        super();

        // 设置几何数据
        if (options.indices) {
            this.setIndex(new THREE.BufferAttribute(options.indices, 1));
        }

        this.setAttribute("position", new THREE.BufferAttribute(options.positions, 3));

        if (options.normals) {
            this.setAttribute("normal", new THREE.BufferAttribute(options.normals, 3));
        } else {
            this.computeVertexNormals();
        }

        if (options.uvs) {
            this.setAttribute("uv", new THREE.BufferAttribute(options.uvs, 2));
        }

        if (options.colors) {
            this.setAttribute("color", new THREE.BufferAttribute(options.colors, 3));
            this.vertexColors = true;
        }

        // 设置其他属性
        this.viewIndependentOrigin = options.viewIndependentOrigin || new THREE.Vector3();
        this.edgeWidth = options.edgeWidth ?? 1.0;
        this.edgeLineCode = options.edgeLineCode ?? 0;
        this.isPlanar = options.isPlanar ?? false;
        this.hasBakedLighting = options.hasBakedLighting ?? false;
        this.hasScalarAnimation = options.hasScalarAnimation ?? false;
        this.uniformColor = options.uniformColor || null;
        this.texture = options.texture || null;
        this.normalMap = options.normalMap || null;

        // 计算边界
        this.computeBoundingSphere();
        this.computeBoundingBox();
    }

    // 新增颜色转换方法
    public getUniformColorHex(includeAlpha: boolean = false): string | null {
        if (!this.uniformColor) return null;

        const toHex = (value: number) => {
            const scaled = Math.round(value * 255);
            return Math.min(255, Math.max(0, scaled)).toString(16).padStart(2, "0");
        };

        const r = toHex(this.uniformColor.x);
        const g = toHex(this.uniformColor.y);
        const b = toHex(this.uniformColor.z);
        const a = toHex(this.uniformColor.w);

        return includeAlpha ? `#${r}${g}${b}${a}` : `#${r}${g}${b}`;
    }

    /**
     * 计算边缘线宽
     */
    protected computeEdgeWeight(params: ShaderParams): number {
        const baseWidth = this.edgeWidth;
        const pixelRatio = params.devicePixelRatio || window.devicePixelRatio || 1;

        if (params.renderPass === "translucent") {
            return baseWidth * pixelRatio * 0.8;
        }
        return baseWidth * pixelRatio;
    }

    /**
     * 确定渲染通道
     */
    protected determineRenderPass(target: RenderTarget): RenderPass {
        const vf = target.currentViewFlags;

        if (target.isDrawingShadowMap) return "none";
        if (RenderMode.SmoothShade === vf.renderMode && !vf.visibleEdges) return "none";

        return vf.renderMode === RenderMode.Wireframe || vf.renderMode === RenderMode.HiddenLine
            ? "edge"
            : "opaque";
    }

    /**
     * 创建或获取缓存的材质
     */
    public getMaterial(pass: RenderPass, target: RenderTarget): THREE.Material {
        // 创建唯一的缓存键
        const cacheKey = [
            pass,
            this.isPlanar ? "planar" : "non-planar",
            this.hasBakedLighting ? "baked" : "no-baked",
            this.texture ? "textured" : "no-texture",
            this.normalMap ? "normalMapped" : "no-normal-map",
            this.vertexColors ? "vertexColors" : "no-vertex-colors",
            target.currentViewFlags.renderMode,
            this.edgeWidth,
            this.edgeLineCode
        ].join("|");

        // 使用缓存或创建新材质
        if (!this._materialCache.has(cacheKey)) {
            const material = this.createMaterialForPass(pass, target);
            this._materialCache.set(cacheKey, material);
        }

        return this._materialCache.get(cacheKey)!;
    }

    /**
     * 创建 Three.js 网格对象
     */
    public createMesh(target: RenderTarget): THREE.Object3D | null {
        const pass = this.determineRenderPass(target);
        if (pass === "none") return null;

        const material = this.getMaterial(pass, target);

        // 处理实例化渲染
        if (this.instanceCount > 0 && this.attributes.instanceMatrix) {
            const mesh = new THREE.InstancedMesh(this, material, this.instanceCount);
            return mesh;
        }

        return new THREE.Mesh(this, material);
    }

    /**
     * 创建特定通道的材质
     */
    protected createMaterialForPass(pass: RenderPass, target: RenderTarget): THREE.Material {
        switch (pass) {
            case "edge":
                return this.createEdgeMaterial();
            case "translucent":
                return this.createTranslucentMaterial();
            default:
                return this.createOpaqueMaterial();
        }
    }

    /**
     * 创建边缘材质
     */
    protected createEdgeMaterial(): THREE.Material {
        return new THREE.LineBasicMaterial({
            color: this.getUniformColorHex(true) || 0x000000,
            linewidth: this.edgeWidth,
            vertexColors: this.vertexColors
        });
    }

    /**
     * 创建半透明材质
     */
    protected createTranslucentMaterial(): THREE.Material {
        const material = new THREE.MeshStandardMaterial({
            color: this.getUniformColorHex(true) || 0xffffff,
            transparent: true,
            opacity: 0.7,
            side: THREE.DoubleSide,
            vertexColors: this.vertexColors
        });

        if (this.texture) material.map = this.texture;
        if (this.normalMap) material.normalMap = this.normalMap;

        return material;
    }

    /**
     * 创建不透明材质
     */
    protected createOpaqueMaterial(): THREE.Material {
        const material = new THREE.MeshStandardMaterial({
            color: this.getUniformColorHex(true) || 0xffffff,
            roughness: this.hasBakedLighting ? 1.0 : 0.5,
            metalness: 0.0,
            side: THREE.FrontSide,
            vertexColors: this.vertexColors
        });

        if (this.texture) material.map = this.texture;
        if (this.normalMap) material.normalMap = this.normalMap;

        return material;
    }

    /**
     * 更新材质 uniforms
     */
    public updateMaterialUniforms(material: THREE.Material, params: ShaderParams = {}) {
        if (!(material instanceof THREE.ShaderMaterial)) return;

        const uniforms = material.uniforms;

        // 更新视图独立原点
        if (uniforms.viewIndependentOrigin) {
            uniforms.viewIndependentOrigin.value = this.viewIndependentOrigin;
        }

        // 更新边缘相关属性
        if (uniforms.edgeWeight) {
            uniforms.edgeWeight.value = this.computeEdgeWeight(params);
        }

        if (uniforms.edgeLineCode) {
            uniforms.edgeLineCode.value = this.edgeLineCode;
        }

        // 更新颜色
        if (this.uniformColor && uniforms.uniformColor) {
            uniforms.uniformColor.value = new THREE.Vector4(
                this.uniformColor.x,
                this.uniformColor.y,
                this.uniformColor.z,
                1.0
            );
        }

        // 更新纹理
        if (this.texture && uniforms.map) {
            uniforms.map.value = this.texture;
        }

        if (this.normalMap && uniforms.normalMap) {
            uniforms.normalMap.value = this.normalMap;
        }
    }

    /**
     * 更新几何数据
     */
    public updateGeometry(options: {
        positions?: Float32Array;
        normals?: Float32Array;
        colors?: Float32Array;
    }) {
        // 正确更新位置数据
        if (options.positions) {
            const positionAttr = this.attributes.position;
            if (positionAttr && positionAttr.array.length === options.positions.length) {
                // 复制数据到现有数组
                (positionAttr.array as Float32Array).set(options.positions);
                positionAttr.needsUpdate = true;
            } else {
                // 创建新的 BufferAttribute
                this.setAttribute("position", new THREE.BufferAttribute(options.positions, 3));
            }
            this.computeBoundingSphere();
            this.computeBoundingBox();
        }

        // 正确更新法线数据
        if (options.normals) {
            const normalAttr = this.attributes.normal;
            if (normalAttr && normalAttr.array.length === options.normals.length) {
                (normalAttr.array as Float32Array).set(options.normals);
                normalAttr.needsUpdate = true;
            } else {
                this.setAttribute("normal", new THREE.BufferAttribute(options.normals, 3));
            }
        }

        // 正确更新颜色数据
        if (options.colors) {
            const colorAttr = this.attributes.color;
            if (colorAttr && colorAttr.array.length === options.colors.length) {
                (colorAttr.array as Float32Array).set(options.colors);
                colorAttr.needsUpdate = true;
            } else {
                this.setAttribute("color", new THREE.BufferAttribute(options.colors, 3));
                this.vertexColors = true;
            }
        }
    }

    /**
     * 释放资源
     */
    public dispose(): void {
        super.dispose();

        // 释放纹理
        if (this.texture) this.texture.dispose();
        if (this.normalMap) this.normalMap.dispose();

        // 释放材质
        for (const material of this._materialCache.values()) {
            material.dispose();
        }
        this._materialCache.clear();
    }

    /**
     * 应用实例化矩阵
     */
    public applyInstancingMatrices(matrices: Float32Array, count: number): void {
        if (matrices.length === 0) return;

        const instancedMatrix = new THREE.InstancedBufferAttribute(matrices, 16);
        this.setAttribute("instanceMatrix", instancedMatrix);

        // 设置实例计数
        this.instanceCount = count;
    }

    /**
     * 创建自定义着色器材质（高级用法）
     */
    public createCustomShaderMaterial(
        vertexShader: string,
        fragmentShader: string,
        uniforms: Record<string, THREE.Uniform> = {}
    ): THREE.ShaderMaterial {
        return new THREE.ShaderMaterial({
            vertexShader,
            fragmentShader,
            uniforms: {
                ...uniforms,
                viewIndependentOrigin: { value: this.viewIndependentOrigin },
                edgeWeight: { value: this.edgeWidth },
                edgeLineCode: { value: this.edgeLineCode },
                ...(this.uniformColor && {
                    uniformColor: {
                        value: new THREE.Vector4(
                            this.uniformColor.x,
                            this.uniformColor.y,
                            this.uniformColor.z,
                            1.0
                        )
                    }
                }),
                ...(this.texture && { map: { value: this.texture } }),
                ...(this.normalMap && { normalMap: { value: this.normalMap } })
            },
            vertexColors: this.vertexColors,
            transparent: this.uniformColor ? this.uniformColor.w < 1.0 : false
        });
    }
}
