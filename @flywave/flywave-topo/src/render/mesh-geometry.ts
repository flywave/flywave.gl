/* Copyright (C) 2025 flywave.gl contributors */

import * as THREE from "three/webgpu";

// Render mode enum
export enum RenderMode {
    Wireframe = 0,
    HiddenLine = 1,
    SolidFill = 2,
    SmoothShade = 3,
    Monochrome = 4
}

// Render pass types
export type RenderPass = "none" | "opaque" | "translucent" | "edge";

// Render target interface
export interface RenderTarget {
    isDrawingShadowMap: boolean;
    currentViewFlags: {
        renderMode: RenderMode;
        visibleEdges: boolean;
        transparency: boolean;
    };
}

// Shader parameters
export interface ShaderParams {
    renderPass?: RenderPass;
    devicePixelRatio?: number;
}

export class MeshGeometry extends THREE.BufferGeometry {
    // Geometry attributes
    public viewIndependentOrigin: THREE.Vector3;
    public edgeWidth: number;
    public edgeLineCode: number;
    public isPlanar: boolean;
    public hasBakedLighting: boolean;
    public hasScalarAnimation: boolean;

    // Material-related attributes
    public uniformColor: THREE.Vector4 | null = null;
    public texture: THREE.Texture | null = null;
    public normalMap: THREE.Texture | null = null;
    public vertexColors: boolean = false;

    // Instance count (for instanced rendering)
    public instanceCount: number = 0;

    // Material cache
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

        // Set the geometry data
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

        // Set the remaining attributes
        this.viewIndependentOrigin = options.viewIndependentOrigin || new THREE.Vector3();
        this.edgeWidth = options.edgeWidth ?? 1.0;
        this.edgeLineCode = options.edgeLineCode ?? 0;
        this.isPlanar = options.isPlanar ?? false;
        this.hasBakedLighting = options.hasBakedLighting ?? false;
        this.hasScalarAnimation = options.hasScalarAnimation ?? false;
        this.uniformColor = options.uniformColor || null;
        this.texture = options.texture || null;
        this.normalMap = options.normalMap || null;

        // Compute the bounds
        this.computeBoundingSphere();
        this.computeBoundingBox();
    }

    // New color conversion method
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
     * Computes the edge line width
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
     * Determines the render pass
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
     * Creates or retrieves a cached material
     */
    public getMaterial(pass: RenderPass, target: RenderTarget): THREE.Material {
        // Build a unique cache key
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

        // Use the cache or create a new material
        if (!this._materialCache.has(cacheKey)) {
            const material = this.createMaterialForPass(pass, target);
            this._materialCache.set(cacheKey, material);
        }

        return this._materialCache.get(cacheKey)!;
    }

    /**
     * Creates a Three.js mesh object
     */
    public createMesh(target: RenderTarget): THREE.Object3D | null {
        const pass = this.determineRenderPass(target);
        if (pass === "none") return null;

        const material = this.getMaterial(pass, target);

        // Handle instanced rendering
        if (this.instanceCount > 0 && this.attributes.instanceMatrix) {
            const mesh = new THREE.InstancedMesh(this, material, this.instanceCount);
            return mesh;
        }

        return new THREE.Mesh(this, material);
    }

    /**
     * Creates the material for a specific pass
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
     * Creates the edge material
     */
    protected createEdgeMaterial(): THREE.Material {
        return new THREE.LineBasicMaterial({
            color: this.getUniformColorHex(true) || 0x000000,
            linewidth: this.edgeWidth,
            vertexColors: this.vertexColors
        });
    }

    /**
     * Creates the translucent material
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
     * Creates the opaque material
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
     * Updates the material uniforms
     */
    public updateMaterialUniforms(material: THREE.Material, params: ShaderParams = {}) {
        if (!(material instanceof THREE.ShaderMaterial)) return;

        const uniforms = material.uniforms;

        // Update the view-independent origin
        if (uniforms.viewIndependentOrigin) {
            uniforms.viewIndependentOrigin.value = this.viewIndependentOrigin;
        }

        // Update the edge-related attributes
        if (uniforms.edgeWeight) {
            uniforms.edgeWeight.value = this.computeEdgeWeight(params);
        }

        if (uniforms.edgeLineCode) {
            uniforms.edgeLineCode.value = this.edgeLineCode;
        }

        // Update the color
        if (this.uniformColor && uniforms.uniformColor) {
            uniforms.uniformColor.value = new THREE.Vector4(
                this.uniformColor.x,
                this.uniformColor.y,
                this.uniformColor.z,
                1.0
            );
        }

        // Update the textures
        if (this.texture && uniforms.map) {
            uniforms.map.value = this.texture;
        }

        if (this.normalMap && uniforms.normalMap) {
            uniforms.normalMap.value = this.normalMap;
        }
    }

    /**
     * Updates the geometry data
     */
    public updateGeometry(options: {
        positions?: Float32Array;
        normals?: Float32Array;
        colors?: Float32Array;
    }) {
        // Correctly update the position data
        if (options.positions) {
            const positionAttr = this.attributes.position;
            if (positionAttr && positionAttr.array.length === options.positions.length) {
                // Copy the data into the existing array
                (positionAttr.array as Float32Array).set(options.positions);
                positionAttr.needsUpdate = true;
            } else {
                // Create a new BufferAttribute
                this.setAttribute("position", new THREE.BufferAttribute(options.positions, 3));
            }
            this.computeBoundingSphere();
            this.computeBoundingBox();
        }

        // Correctly update the normal data
        if (options.normals) {
            const normalAttr = this.attributes.normal;
            if (normalAttr && normalAttr.array.length === options.normals.length) {
                (normalAttr.array as Float32Array).set(options.normals);
                normalAttr.needsUpdate = true;
            } else {
                this.setAttribute("normal", new THREE.BufferAttribute(options.normals, 3));
            }
        }

        // Correctly update the color data
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
     * Releases resources
     */
    public dispose(): void {
        super.dispose();

        // Dispose of the textures
        if (this.texture) this.texture.dispose();
        if (this.normalMap) this.normalMap.dispose();

        // Dispose of the materials
        for (const material of this._materialCache.values()) {
            material.dispose();
        }
        this._materialCache.clear();
    }

    /**
     * Applies the instancing matrices
     */
    public applyInstancingMatrices(matrices: Float32Array, count: number): void {
        if (matrices.length === 0) return;

        const instancedMatrix = new THREE.InstancedBufferAttribute(matrices, 16);
        this.setAttribute("instanceMatrix", instancedMatrix);

        // Set the instance count
        this.instanceCount = count;
    }

    /**
     * Creates a custom shader material (advanced usage)
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
