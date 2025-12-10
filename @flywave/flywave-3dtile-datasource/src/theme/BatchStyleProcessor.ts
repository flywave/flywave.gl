/* Copyright (C) 2025 flywave.gl contributors */

import {
    type Tile3DBatchMeshTechniqueParams,
    type Tile3DTechnique,
    type TransitionValue,
    type ValueMap,
    isTile3DTechnique,
    MapEnv
} from "@flywave/flywave-datasource-protocol";
import {
    type StyleSetOptions,
    StyleSetEvaluator
} from "@flywave/flywave-datasource-protocol/StyleSetEvaluator";

/**
 * Extended StyleSetEvaluator with batch styling capabilities
 * 
 * @remarks
 * This class extends the base StyleSetEvaluator to provide specialized
 * batch style processing for 3D Tiles and other batch-rendered geometries.
 */
export class BatchStyleProcessor extends StyleSetEvaluator {
    /**
     * Creates a new BatchStyleProcessor instance
     * @param styleSetOptions - Style set configuration options
     */
    constructor(styleSetOptions: StyleSetOptions) {
        super(styleSetOptions);
    }

    /**
     * Extracts batch style information from theme
     * @param properties - Feature property data
     * @param layer - Layer name (optional)
     * @param geometryType - Geometry type (optional)
     * @returns Array of batch style information
     */
    extractBatchStyles(
        properties: ValueMap,
        layer: string = "3dtiles",
        geometryType: string = "mesh"
    ): Tile3DBatchMeshTechniqueParams[] {
        // Create environment object
        const env = new MapEnv(properties);

        // Use parent class method to get matching techniques
        const matchingTechniques = this.getMatchingTechniques(
            env,
            layer,
            geometryType
        );

        // Filter batch techniques and convert to BatchThemeInformation
        const batchStyles: Tile3DBatchMeshTechniqueParams[] = [];

        for (const technique of matchingTechniques) {
            // Check if technique name matches batch technique name
            if (isTile3DTechnique(technique)) {
                // Convert to batch theme information
                const batchInfo = this.convertToBatchThemeInformation(technique);
                if (batchInfo) {
                    batchStyles.push(batchInfo);
                }
            }
        }

        return batchStyles;
    }

    /**
     * Gets final batch style information
     * @param properties - Feature property data
     * @param layer - Layer name (optional)
     * @param geometryType - Geometry type (optional)
     * @returns Merged batch theme information
     */
    getBatchStyle(
        properties: ValueMap,
        layer: string = "3dtiles",
        geometryType: string = "mesh"
    ): Tile3DBatchMeshTechniqueParams {
        // Extract batch styles
        const batchStyles = this.extractBatchStyles(properties, layer, geometryType);

        // Merge styles
        return this.mergeBatchStyles(batchStyles);
    }

    /**
     * Converts technique to batch theme information
     * @param technique - Matched technique
     * @returns Batch theme information or null
     */
    private convertToBatchThemeInformation(
        technique: Tile3DTechnique
    ): Tile3DBatchMeshTechniqueParams | null {
        try {
            const batchInfo: Tile3DBatchMeshTechniqueParams = {
                color: technique.color,
                opacity: this.extractOpacity(technique.opacity),
                visible: technique.visible !== undefined ? Boolean(technique.visible) : true,
                roughness: technique.roughness,
                metalness: technique.metalness,
                emissive: technique.emissive,
                value: technique.value,
                offset: this.extractOffset(technique.offset),
                direction: this.extractDirection(technique.direction)
            };

            return batchInfo;
        } catch (error) {
            // console.warn("Failed to convert technique to BatchThemeInformation:", error);
            return null;
        }
    }

    /**
     * Merges batch style information into final rendering format
     * @param batchStyles - Array of batch style information
     * @returns Merged batch theme information
     */
    private mergeBatchStyles(
        batchStyles: Tile3DBatchMeshTechniqueParams[]
    ): Tile3DBatchMeshTechniqueParams {
        // Merge from back to front, later styles have higher priority
        const result: Tile3DBatchMeshTechniqueParams = {
            visible: true
        };

        for (const style of batchStyles) {
            if (style.color !== undefined) {
                result.color = style.color;
            }

            if (style.opacity !== undefined) {
                result.opacity = style.opacity;
            }

            if (style.visible !== undefined) {
                result.visible = style.visible;
            }

            if (style.offset !== undefined) {
                result.offset = style.offset;
            }

            if (style.roughness !== undefined) {
                result.roughness = style.roughness;
            }

            if (style.metalness !== undefined) {
                result.metalness = style.metalness;
            }

            if (style.emissive !== undefined) {
                result.emissive = style.emissive;
            }

            if (style.direction !== undefined) {
                result.direction = style.direction;
            }

            if (style.value !== undefined) {
                result.value = style.value;
            }
        }

        return result;
    }

    /**
     * Extracts opacity value from technique parameter
     * @param opacity - Opacity parameter value
     * @returns Processed opacity value or undefined
     */
    private extractOpacity(opacity: any): number | TransitionValue<number> | undefined {
        if (opacity === undefined) {
            return undefined;
        }

        // Handle transition values
        if (
            typeof opacity === "object" &&
            opacity !== null &&
            "from" in opacity &&
            "to" in opacity
        ) {
            return {
                from: Number(opacity.from),
                to: Number(opacity.to)
            };
        }

        return Number(opacity);
    }

    /**
     * Extracts offset value from technique parameter
     * @param offset - Offset parameter value
     * @returns Processed offset value or undefined
     */
    private extractOffset(offset: any): number | TransitionValue<number> | undefined {
        if (offset === undefined) {
            return undefined;
        }

        // Handle transition values
        if (typeof offset === "object" && offset !== null && "from" in offset && "to" in offset) {
            return {
                from: Number(offset.from),
                to: Number(offset.to)
            };
        }

        return Number(offset);
    }

    /**
     * Extracts direction value from technique parameter
     * @param direction - Direction parameter value
     * @returns Processed direction value or undefined
     */
    private extractDirection(direction: any): "radial" | "up" | "down" | undefined {
        if (direction === undefined) {
            return undefined;
        }

        // Ensure direction value is one of the valid enum values
        if (direction === "radial" || direction === "up" || direction === "down") {
            return direction;
        }

        // For expressions or other types, return undefined
        return undefined;
    }
}