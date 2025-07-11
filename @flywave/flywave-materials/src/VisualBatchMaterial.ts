import * as THREE from "three";

/**
 * Interface defining visual style properties for batch rendering
 */
interface IVisualStyle {
    startOffset: THREE.Vector3;
    endOffset: THREE.Vector3;
    startColor: THREE.Vector3;
    endColor: THREE.Vector3;
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
        public startOffset: THREE.Vector3 = new THREE.Vector3(),
        public endOffset: THREE.Vector3 = new THREE.Vector3(),
        public startColor: THREE.Vector3 = new THREE.Vector3(1, 1, 1),
        public endColor: THREE.Vector3 = new THREE.Vector3(1, 1, 1),
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
    private _valueTable: Map<number, number>;
    private _idAttributeName: string;

    // Uniforms type extension
    declare uniforms: {
        styleTexture: THREE.IUniform<THREE.DataTexture | null>;
        valueTexture: THREE.IUniform<THREE.DataTexture | null>;
        styleIndexTexture: THREE.IUniform<THREE.DataTexture | null>;
        textureWidth: THREE.IUniform<number>;
        textureHeight: THREE.IUniform<number>;
        maxVisualId: THREE.IUniform<number>;
    } & THREE.ShaderLibShader["uniforms"];

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
        float dataPos = styleIndex * 16.0;
        
        // Read 4 RGBA pixels containing the style data
        vec4 pixel0 = texture2D(styleTexture, vec2((dataPos + 0.5) / textureWidth, 0.5 / textureHeight));
        vec4 pixel1 = texture2D(styleTexture, vec2((dataPos + 4.5) / textureWidth, 0.5 / textureHeight));
        vec4 pixel2 = texture2D(styleTexture, vec2((dataPos + 8.5) / textureWidth, 0.5 / textureHeight));
        vec4 pixel3 = texture2D(styleTexture, vec2((dataPos + 12.5) / textureWidth, 0.5 / textureHeight));
        
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
      
      /**
       * Gets style index for a visual ID
       * @param visualId Instance identifier 
       * @return Index in style texture
       */
      float getStyleIndex(float visualId) {
        return texture2D(styleIndexTexture, vec2((visualId + 0.5) / (maxVisualId + 1.0), 0.5)).r;
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
                styleIndexTexture: { value: null }, // R32F texture mapping IDs to style indices
                textureWidth: { value: 0 }, // Style texture width
                textureHeight: { value: 0 }, // Style texture height
                maxVisualId: { value: 0 } // Maximum ID value
            }
        ]) as typeof this.uniforms;

        // Patch shader during compilation
        this.onBeforeCompile = this._compileShader.bind(this);
    }

    // ==================== Public API ====================

    /**
     * Sets the complete style table
     * @param styleTable Map of visual IDs to VisualStyle configurations
     */
    setBathchStyles(styleTable: Map<number, VisualStyle>): void {
        this._styleTable = new Map(styleTable);
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
        valueMap.forEach((value, id) => this.setBatchValue(id, value));
    }

    /**
     * Cleans up resources
     */
    override dispose(): void {
        super.dispose();
        this.uniforms.styleTexture.value?.dispose();
        this.uniforms.valueTexture.value?.dispose();
        this.uniforms.styleIndexTexture.value?.dispose();
    }

    // ==================== Private Methods ====================

    /**
     * Updates all GPU textures from current state
     */
    private _updateTextures(): void {
        if (this._styleTable.size === 0) return;

        // 1. Prepare ID mapping
        const visualIds = Array.from(this._styleTable.keys());
        const maxId = Math.max(...visualIds);
        const idToIndex = new Map(visualIds.map((id, idx) => [id, idx]));

        // 2. Calculate texture dimensions (4 RGBA pixels per style)
        const textureWidth = Math.ceil(Math.sqrt(this._styleTable.size * 4));
        const textureHeight = Math.ceil((this._styleTable.size * 4) / textureWidth);

        // 3. Pack style data into texture
        const styleData = new Float32Array(textureWidth * textureHeight * 4);
        this._styleTable.forEach((style, id) => {
            const idx = idToIndex.get(id)! * 16;

            // Pixel 0: startOffset (RGB) + padding (A)
            styleData[idx] = style.startOffset.x;
            styleData[idx + 1] = style.startOffset.y;
            styleData[idx + 2] = style.startOffset.z;

            // Pixel 1: endOffset (RGB) + padding (A)
            styleData[idx + 4] = style.endOffset.x;
            styleData[idx + 5] = style.endOffset.y;
            styleData[idx + 6] = style.endOffset.z;

            // Pixel 2: startColor (RGB) + startOpacity (A)
            styleData[idx + 8] = style.startColor.x;
            styleData[idx + 9] = style.startColor.y;
            styleData[idx + 10] = style.startColor.z;
            styleData[idx + 11] = style.startOpacity;

            // Pixel 3: endColor (RGB) + endOpacity (A)
            styleData[idx + 12] = style.endColor.x;
            styleData[idx + 13] = style.endColor.y;
            styleData[idx + 14] = style.endColor.z;
            styleData[idx + 15] = style.endOpacity;
        });

        // 4. Update style texture
        this._updateDataTexture(this.uniforms.styleTexture, styleData, textureWidth, textureHeight);

        // 5. Update ID->index mapping texture
        const indexData = new Float32Array(maxId + 1).fill(-1);
        idToIndex.forEach((index, id) => {
            indexData[id] = index;
        });
        this._updateDataTexture(
            this.uniforms.styleIndexTexture,
            indexData,
            indexData.length,
            1,
            THREE.RedFormat
        );

        // 6. Update value texture
        this._updateValueTexture();

        // 7. Update uniforms
        this.uniforms.textureWidth.value = textureWidth;
        this.uniforms.textureHeight.value = textureHeight;
        this.uniforms.maxVisualId.value = maxId;
        this.needsUpdate = true;
    }

    /**
     * Updates the value texture with current interpolation values
     */
    private _updateValueTexture(): void {
        const maxId = this.uniforms.maxVisualId.value;
        if (maxId <= 0) return;

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
    }

    /**
     * Patches the shader during compilation
     */
    private _compileShader(shader: THREE.WebGLProgramParametersWithUniforms): void {
        // Merge uniforms
        shader.uniforms = THREE.UniformsUtils.merge([shader.uniforms, this.uniforms]);
        shader.defines.USE_VISUAL_BATCH = true;
        // =============== Vertex Shader ===============
        shader.vertexShader = `
      // Add custom attribute and varying
      attribute float ${this._idAttributeName};
      varying float vVisualValue;
      
      ${VisualBatchMaterial.ShaderChunks.structs}
      ${VisualBatchMaterial.ShaderChunks.helpers}
      
      ${shader.vertexShader}
    `.replace(
            `#include <begin_vertex>`,
            `
      #include <begin_vertex>
      
      // Get current interpolation state
      float visualId = ${this._idAttributeName};
      vVisualValue = getVisualValue(visualId);
      VisualStyle style = unpackStyle(getStyleIndex(visualId));
      
      // Apply interpolated offset
      transformed += mix(style.startOffset, style.endOffset, vVisualValue);
      `
        );

        // =============== Fragment Shader ===============
        shader.fragmentShader = `
      // Pass through interpolation value
      varying float vVisualValue;
      
      ${VisualBatchMaterial.ShaderChunks.structs}
      ${VisualBatchMaterial.ShaderChunks.helpers}
      
      ${shader.fragmentShader}
    `.replace(
            `#include <color_fragment>`,
            `
      #ifdef USE_VISUAL_BATCH
        // Get current style and apply interpolation
        float visualId = ${this._idAttributeName};
        VisualStyle style = unpackStyle(getStyleIndex(visualId));
        
        diffuseColor.rgb *= mix(style.startColor, style.endColor, vVisualValue);
        diffuseColor.a *= mix(style.startOpacity, style.endOpacity, vVisualValue);
      #endif
      
      #include <color_fragment>
      `
        );
    }
}

export { VisualBatchMaterial, VisualStyle, type IVisualStyle, type IVisualBatchMaterialParams };
