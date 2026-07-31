// @ts-nocheck
/* Copyright (C) 2025 flywave.gl contributors */

import {
    ClampToEdgeWrapping,
    DataTexture,
    FloatType,
    LinearFilter,
    MathUtils,
    MeshStandardNodeMaterial,
    RedFormat,
    RGBAFormat,
    type MeshStandardNodeMaterialParameters,
    type Node,
    type UniformNode,
} from "three/webgpu";
import {
    attribute,
    float,
    materialColor,
    materialOpacity,
    mix,
    positionLocal,
    select,
    texture,
    uniform,
    vec2,
    vec3,
} from "three/tsl";

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
interface IVisualBatchMaterialParams extends MeshStandardNodeMaterialParameters {
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
 * Node graph exposed to subclasses for per-instance styling.
 */
interface IVisualStyleNodes {
    idAttr: Node<"float">;
    hasStyle: Node<"bool">;
    visualValue: Node<"float">;
    styleColor: Node<"vec3">;
    styleOpacity: Node<"float">;
    offset: Node<"vec3">;
}

/**
 * Enhanced MeshStandardNodeMaterial supporting batch rendering with:
 * - Per-instance visual styles
 * - Dynamic value interpolation
 * - Configurable ID attribute name
 *
 * Implemented with TSL nodes for WebGPU / NodeMaterial rendering.
 */
class VisualBatchMaterial extends MeshStandardNodeMaterial {
    // Private properties
    private _styleTable: Map<number, VisualStyle>;
    private readonly _valueTable: Map<number, number>;
    protected _idAttributeName: string;

    // Texture uniforms (swappable at runtime via .value)
    private readonly _styleTexUniform: UniformNode<DataTexture | null>;
    private readonly _valueTexUniform: UniformNode<DataTexture | null>;
    private readonly _maxVisualIdUniform: UniformNode<number>;
    private readonly _styleHeightUniform: UniformNode<number>;

    /** Per-instance style node graph, consumed by subclasses */
    protected visualNodes!: IVisualStyleNodes;

    constructor(params: IVisualBatchMaterialParams = {}) {
        const { idAttributeName = "instanceId", ...standardParams } = params;
        super(standardParams);

        // Initialize state
        this._styleTable = new Map();
        this._valueTable = new Map();
        this._idAttributeName = idAttributeName;

        // Initialize texture uniforms with placeholder textures
        this._styleTexUniform = uniform(
            new DataTexture(new Float32Array(4), 1, 1, RGBAFormat, FloatType)
        );
        this._valueTexUniform = uniform(
            new DataTexture(new Float32Array(1), 1, 1, RedFormat, FloatType)
        );
        this._maxVisualIdUniform = uniform(0);
        this._styleHeightUniform = uniform(0);

        this._buildVisualNodes();
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
        this._valueTable.set(id, MathUtils.clamp(value, 0, 1));
        this._updateValueTexture();
    }

    /**
     * Sets multiple interpolation values
     * @param valueMap Map of visual IDs to values
     */
    setBatchValues(valueMap: Map<number, number>): void {
        valueMap.forEach((value, id) => this._valueTable.set(id, MathUtils.clamp(value, 0, 1)));
        this._updateValueTexture();
    }

    /**
     * Cleans up resources
     */
    override dispose(): void {
        super.dispose();
        this._styleTexUniform.value?.dispose();
        this._valueTexUniform.value?.dispose();
    }

    // ==================== Node Graph ====================

    /**
     * Builds the per-instance style node graph:
     * - position offset (startOffset -> endOffset)
     * - color modulation (startColor -> endColor)
     * - opacity modulation (startOpacity -> endOpacity)
     *
     * Subclasses may override this method to extend the pipeline.
     */
    protected _buildVisualNodes(): void {
        const idAttr = attribute(this._idAttributeName, "float");
        const styleTexNode = texture(this._styleTexUniform);
        const valueTexNode = texture(this._valueTexUniform);
        const maxVisualId = this._maxVisualIdUniform;
        const styleHeight = this._styleHeightUniform;

        // Samples one style row pixel from the packed style texture.
        // Layout: width=16 (4 RGBA pixels per style), height=style count.
        const fetchPixel = (x: number, row: Node<"float">) =>
            styleTexNode.sample(vec2(float(x).div(16), row.div(float(styleHeight))));

        const hasStyle = idAttr.greaterThanEqual(0);
        const visualValue = valueTexNode.sample(
            vec2(idAttr.add(0.5).div(maxVisualId.add(1)), float(0.5))
        ).r;

        const p0 = fetchPixel(0, idAttr);
        const p1 = fetchPixel(1, idAttr);
        const p2 = fetchPixel(2, idAttr);
        const p3 = fetchPixel(3, idAttr);

        const offset = mix(p0.xyz, p1.xyz, visualValue);
        const styleColor = mix(p2.xyz, p3.xyz, visualValue);
        const styleOpacity = mix(p2.w, p3.w, visualValue);

        this.visualNodes = { idAttr, hasStyle, visualValue, styleColor, styleOpacity, offset };

        // Vertex: apply interpolated offset
        this.positionNode = positionLocal.add(select(hasStyle, offset, vec3(0)));

        // Fragment: modulate base material color / opacity
        this.colorNode = vec3(materialColor).mul(select(hasStyle, styleColor, vec3(1)));
        this.opacityNode = materialOpacity.mul(select(hasStyle, styleOpacity, float(1)));
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
        this._maxVisualIdUniform.value = maxId;
        this._styleHeightUniform.value = textureHeight;

        // 6. 更新样式纹理
        this._styleTexUniform.value = this._createDataTexture(
            styleData,
            textureWidth,
            textureHeight,
            RGBAFormat
        );
    }

    /**
     * Updates the value texture with current interpolation values
     */
    private _updateValueTexture(): void {
        const maxId = this._maxVisualIdUniform.value;
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

        this._valueTexUniform.value = this._createDataTexture(
            valueData,
            valueData.length,
            1,
            RedFormat
        );
    }

    /**
     * Creates a float data texture with sampling-friendly settings
     */
    private _createDataTexture(
        data: Float32Array,
        width: number,
        height: number,
        format: THREE.PixelFormat
    ): DataTexture {
        const texture = new DataTexture(data, width, height, format, FloatType);
        texture.minFilter = LinearFilter;
        texture.magFilter = LinearFilter;
        texture.wrapS = ClampToEdgeWrapping;
        texture.wrapT = ClampToEdgeWrapping;
        texture.needsUpdate = true;
        return texture;
    }
}

export { VisualBatchMaterial, VisualStyle, type IVisualStyle, type IVisualBatchMaterialParams };
