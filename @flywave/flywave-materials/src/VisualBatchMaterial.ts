/* Copyright (C) 2025 flywave.gl contributors */

import * as THREE from "three";

/**
 * Interface defining visual style properties for batch rendering
 */
interface IVisualStyle {
    startOffset: THREE.Vector3;
    endOffset: THREE.Vector3;
    startColor: THREE.Color;
    endColor: THREE.Color;
    startOpacity: number;
    endOpacity: number;
}

/**
 * Parameters for VisualBatchMaterial constructor
 */
interface IVisualBatchMaterialParams extends THREE.MeshStandardMaterialParameters {
    /** Attribute name used for instance identification (default: 'instanceId') */
    idAttributeName?: string;
}

/**
 * Class representing a visual style configuration
 */
class VisualStyle implements IVisualStyle {
    /**
     * @param startOffset Starting position offset
     * @param endOffset Ending position offset
     * @param startColor Starting color (RGB)
     * @param endColor Ending color (RGB)
     * @param startOpacity Starting opacity
     * @param endOpacity Ending opacity
     */
    constructor(
        public startColor: THREE.Color = new THREE.Color(),
        public endColor: THREE.Color = new THREE.Color(),
        public startOffset: THREE.Vector3 = new THREE.Vector3(),
        public endOffset: THREE.Vector3 = new THREE.Vector3(),
        public startOpacity: number = 1,
        public endOpacity: number = 1
    ) {}
}

/**
 * Enhanced THREE.MeshStandardMaterial supporting batch rendering with:
 * - Per-instance visual styles
 * - Dynamic value interpolation
 * - Configurable ID attribute name
 */
class VisualBatchMaterial extends THREE.MeshStandardMaterial {
    // Private properties
    private _styleTable: Map<number, VisualStyle>;
    private readonly _valueTable: Map<number, number>;
    protected _idAttributeName: string;

    // Uniforms type extension
    declare uniforms: {
        styleTexture: THREE.IUniform<THREE.DataTexture | null>;
        valueTexture: THREE.IUniform<THREE.DataTexture | null>;
        textureWidth: THREE.IUniform<number>;
        textureHeight: THREE.IUniform<number>;
        maxVisualId: THREE.IUniform<number>;
    } & THREE.ShaderLibShader["uniforms"];

    public defines: Record<string, any> = {};

    // GLSL shader chunks
    private static readonly ShaderChunks = {
        // Structure definition
        structs: `
      /**
       * Contains all visual style properties for interpolation
       */
      struct VisualStyle {
        vec3 startOffset;
        vec3 endOffset;
        vec3 startColor;
        vec3 endColor;
        float startOpacity;
        float endOpacity;
      };
    `,

        // Helper functions
        helpers: `
      /**
       * Unpacks VisualStyle from texture data
       * @param styleIndex Index in style texture
       * @return VisualStyle structure
       */
      VisualStyle unpackStyle(float styleIndex) {
            VisualStyle style;
    
            // 每行一个样式，直接计算行号
            float row = styleIndex;
            
            // 计算4个像素的UV（固定x坐标，变化y坐标）
            vec2 uv0 = vec2(0.0 / 16.0, row / float(textureHeight));
            vec2 uv1 = vec2(4.0 / 16.0, row / float(textureHeight));
            vec2 uv2 = vec2(8.0 / 16.0, row / float(textureHeight));
            vec2 uv3 = vec2(12.0 / 16.0, row / float(textureHeight));
            
            // 采样像素
            vec4 pixel0 = texture2D(styleTexture, uv0);
            vec4 pixel1 = texture2D(styleTexture, uv1);
            vec4 pixel2 = texture2D(styleTexture, uv2);
            vec4 pixel3 = texture2D(styleTexture, uv3);
            
            style.startOffset = pixel0.rgb;
            style.endOffset = pixel1.rgb;
            style.startColor = pixel2.rgb;
            style.startOpacity = pixel2.a;
            style.endColor = pixel3.rgb;
            style.endOpacity = pixel3.a;
            
            return style;
      }
      
      /**
       * Gets current interpolation value (0-1) for a visual ID
       * @param visualId Instance identifier
       * @return Normalized interpolation value
       */
      float getVisualValue(float visualId) {
        return texture2D(valueTexture, vec2((visualId + 0.5) / (maxVisualId + 1.0), 0.5)).r;
      }
       
    `
    };

    constructor(params: IVisualBatchMaterialParams = {}) {
        const { idAttributeName = "instanceId", ...standardParams } = params;
        super(standardParams);

        // Initialize state
        this._styleTable = new Map();
        this._valueTable = new Map();
        this._idAttributeName = idAttributeName;

        // Initialize uniforms
        this.uniforms = THREE.UniformsUtils.merge([
            THREE.ShaderLib.standard.uniforms,
            {
                styleTexture: { value: null }, // RGBA32F texture storing VisualStyle data
                valueTexture: { value: null }, // R32F texture storing interpolation values
                textureWidth: { value: 0 }, // Style texture width
                textureHeight: { value: 0 }, // Style texture height
                maxVisualId: { value: 0 } // Maximum ID value
            },
            this._getCustomUniforms() // Allow subclasses to add custom uniforms
        ]) as typeof this.uniforms;

        // Patch shader during compilation
        this.onBeforeCompile = this._compileShader.bind(this);
    }

    // ==================== Public API ====================

    /**
     * Sets the complete style table
     * @param styleTable Map of visual IDs to VisualStyle configurations
     */
    setBatchStyles(styleTable: Map<number, VisualStyle>): void {
        this._styleTable = styleTable;
        this._updateTextures();
    }

    /**
     * Sets interpolation value for a specific visual ID
     * @param id Visual identifier
     * @param value Normalized interpolation value (0-1)
     */
    setBatchValue(id: number, value: number): void {
        this._valueTable.set(id, THREE.MathUtils.clamp(value, 0, 1));
        this._updateValueTexture();
    }

    /**
     * Sets multiple interpolation values
     * @param valueMap Map of visual IDs to values
     */
    setBatchValues(valueMap: Map<number, number>): void {
        valueMap.forEach((value, id) =>
            this._valueTable.set(id, THREE.MathUtils.clamp(value, 0, 1))
        );
        this._updateValueTexture();
    }

    /**
     * Cleans up resources
     */
    override dispose(): void {
        super.dispose();
        this.uniforms.styleTexture.value?.dispose();
        this.uniforms.valueTexture.value?.dispose();
    }

    // ==================== Protected Methods for Subclassing ====================

    /**
     * 获取自定义uniforms
     * 子类可以重写此方法来添加自定义uniforms
     */
    protected _getCustomUniforms(): any {
        return {};
    }

    /**
     * 获取自定义GLSL代码块
     * 子类可以重写此方法来添加自定义GLSL代码
     */
    protected _getCustomVertexShaderChunks(): string {
        return "";
    }

    protected _getCustomFragmentShaderChunks(): string {
        return "";
    }

    /**
     * 获取顶点着色器替换代码
     * 子类可以重写此方法来自定义顶点处理逻辑
     */
    protected _getVertexShaderReplacement(): string {
        return `
        #include <begin_vertex>
        
        // Get current interpolation state only if style is set
        float visualId = ${this._idAttributeName};
        v${this._idAttributeName} = visualId;
        vVisualValue = getVisualValue(visualId);
        float styleIndex = visualId;
        if (styleIndex >= 0.0) {
            VisualStyle style = unpackStyle(styleIndex);
            
            // Apply interpolated offset
            transformed += mix(style.startOffset, style.endOffset, vVisualValue);
        }
      `;
    }

    /**
     * 获取片段着色器替换代码
     * 子类可以重写此方法来自定义片段处理逻辑
     */
    protected _getFragmentShaderReplacement(): string {
        return `
        #ifdef USE_VISUAL_BATCH
            // Get current style and apply interpolation only if style is set
            float visualId = v${this._idAttributeName};
            float styleIndex = visualId;
            if (styleIndex >= 0.0) {
                VisualStyle style = unpackStyle(styleIndex);
                
                diffuseColor.rgb *= mix(style.startColor, style.endColor, vVisualValue);
                diffuseColor.a *= mix(style.startOpacity, style.endOpacity, vVisualValue);
                
            }
        #endif
        
        #include <color_fragment>
      `;
    }

    // ==================== Private Methods ====================

    /**
     * Updates all GPU textures from current state
     */
    private _updateTextures(): void {
        if (this._styleTable.size === 0) return;

        // 1. 准备ID映射
        const visualIds = Array.from(this._styleTable.keys());
        const maxId = Math.max(...visualIds);

        // 2. 固定纹理宽度为16（4个RGBA像素），高度为样式数量
        const textureWidth = 4; // 固定宽度
        const textureHeight = this._styleTable.size; // 高度等于样式数量

        // 3. 打包样式数据到纹理
        const styleData = new Float32Array(textureWidth * textureHeight * 4).fill(0);

        this._styleTable.forEach((style, rowIndex) => {
            // 每行存储一个完整样式（16个float）
            const rowStart = rowIndex * textureWidth * 4;

            // 像素0: startOffset (RGB) + 填充(A)
            styleData[rowStart] = style.startOffset.x;
            styleData[rowStart + 1] = style.startOffset.y;
            styleData[rowStart + 2] = style.startOffset.z;

            // 像素1: endOffset (RGB) + 填充(A)
            styleData[rowStart + 4] = style.endOffset.x;
            styleData[rowStart + 5] = style.endOffset.y;
            styleData[rowStart + 6] = style.endOffset.z;

            // 像素2: startColor (RGB) + startOpacity(A)
            styleData[rowStart + 8] = style.startColor.r;
            styleData[rowStart + 9] = style.startColor.g;
            styleData[rowStart + 10] = style.startColor.b;
            styleData[rowStart + 11] = style.startOpacity;

            // 像素3: endColor (RGB) + endOpacity(A)
            styleData[rowStart + 12] = style.endColor.r;
            styleData[rowStart + 13] = style.endColor.g;
            styleData[rowStart + 14] = style.endColor.b;
            styleData[rowStart + 15] = style.endOpacity;
        });

        // 5. 更新uniforms
        this.uniforms.textureWidth.value = textureWidth;
        this.uniforms.textureHeight.value = textureHeight;
        this.uniforms.maxVisualId.value = maxId;

        // 6. 更新样式纹理
        this._updateDataTexture(this.uniforms.styleTexture, styleData, textureWidth, textureHeight);
    }

    /**
     * Updates the value texture with current interpolation values
     */
    private _updateValueTexture(): void {
        const maxId = this.uniforms.maxVisualId.value;
        if (maxId <= 0) return;

        // Check if we need to update the texture
        let needsUpdate = false;
        for (const [id, value] of this._valueTable) {
            if (id <= maxId) {
                needsUpdate = true;
                break;
            }
        }

        if (!needsUpdate) return;

        const valueData = new Float32Array(maxId + 1).fill(0);
        this._valueTable.forEach((value, id) => {
            if (id <= maxId) valueData[id] = value;
        });

        this._updateDataTexture(
            this.uniforms.valueTexture,
            valueData,
            valueData.length,
            1,
            THREE.RedFormat
        );
    }

    /**
     * Creates or updates a data texture
     */
    private _updateDataTexture(
        uniform: THREE.IUniform<THREE.DataTexture | null>,
        data: Float32Array,
        width: number,
        height: number,
        format: THREE.PixelFormat = THREE.RGBAFormat
    ): void {
        if (!uniform.value) {
            uniform.value = new THREE.DataTexture(data, width, height, format, THREE.FloatType);
        } else {
            uniform.value.image.data = data;
            uniform.value.image.width = width;
            uniform.value.image.height = height;
            uniform.value.needsUpdate = true;
        }

        uniform.value.needsUpdate = true;
    }

    /**
     * Patches the shader during compilation
     */
    private _compileShader(shader: THREE.WebGLProgramParametersWithUniforms): void {
        // Merge uniforms
        shader.uniforms = THREE.UniformsUtils.merge([shader.uniforms, this.uniforms]);
        shader.defines.USE_VISUAL_BATCH = true;

        shader.defines["USE_UV"] = true;

        // Get custom shader chunks from subclass
        const customVertexChunks = this._getCustomVertexShaderChunks();
        const customFragmentChunks = this._getCustomFragmentShaderChunks();

        // =============== Vertex Shader ===============
        shader.vertexShader = shader.vertexShader
            .replace(
                `#include <uv_pars_vertex>`,
                `
                #include <uv_pars_vertex>
                // Add custom attribute and varying
                attribute float ${this._idAttributeName};
                varying float vVisualValue;
                uniform float textureWidth;
                uniform float textureHeight;
                uniform sampler2D styleTexture;
                uniform sampler2D valueTexture;
                uniform float maxVisualId;
                varying float v${this._idAttributeName};

      
                ${VisualBatchMaterial.ShaderChunks.structs}
                ${VisualBatchMaterial.ShaderChunks.helpers}
                ${customVertexChunks} `
            )
            .replace(`#include <begin_vertex>`, this._getVertexShaderReplacement());

        // =============== Fragment Shader ===============
        shader.fragmentShader = shader.fragmentShader
            .replace(
                `#include <uv_pars_fragment>`,
                `
                #include <uv_pars_fragment>
                // Pass through interpolation value
                varying float vVisualValue;
                uniform float textureWidth;
                uniform float textureHeight;
                uniform sampler2D styleTexture;
                uniform sampler2D valueTexture;
                uniform float maxVisualId;
                varying float v${this._idAttributeName};
                
                ${VisualBatchMaterial.ShaderChunks.structs}
                ${VisualBatchMaterial.ShaderChunks.helpers}
                ${customFragmentChunks}`
            )
            .replace(`#include <color_fragment>`, this._getFragmentShaderReplacement());

        Object.assign(shader.defines, this.defines);
    }
}

export { VisualBatchMaterial, VisualStyle, type IVisualStyle, type IVisualBatchMaterialParams };
