/* Copyright (C) 2025 flywave.gl contributors */

// Mocha discourages using arrow functions, see https://mochajs.org/#arrow-functions

import { type Tile3DBatchMeshTechniqueParams } from "@flywave/flywave-datasource-protocol";
import * as chai from "chai";
const chaiAsPromised = require("chai-as-promised");
import * as THREE from "three";

import { B3DMBatchMaterial } from "../src/materials/B3DMBatchMaterial";

chai.use(chaiAsPromised);
const { expect } = chai;

/**
 * Debug version of B3DMBatchMaterial, used for testing unpackStyle function
 */
class DebugB3DMBatchMaterial extends B3DMBatchMaterial {
    public getTextureData(): Float32Array | null {
        if ((this as any)._styleTexture) {
            return (this as any)._styleTexture.image.data as Float32Array;
        }
        return null;
    }

    public getTextureDimensions(): { width: number; height: number } | null {
        if ((this as any)._styleTexture) {
            return {
                width: (this as any)._styleTexture.image.width,
                height: (this as any)._styleTexture.image.height
            };
        }
        return null;
    }

    public getUniforms(): any {
        return (this as any).uniforms;
    }
}

describe("B3DMBatchMaterial unpackStyle Debug Test", () => {
    let material: DebugB3DMBatchMaterial;

    beforeEach(() => {
        material = new DebugB3DMBatchMaterial({
            materialParams: {
                color: 0xcccccc,
                roughness: 0.5,
                metalness: 0.5
            },
            batchIdAttributeName: "_BATCHID"
        });
    });

    afterEach(() => {
        material.dispose();
    });

    /**
     * Detailed test of the data unpacking process of the unpackStyle function
     */
    it("should correctly pack and unpack style data", () => {
        // Create test style data
        const batchStyles = new Map<number, Tile3DBatchMeshTechniqueParams>();

        // Add test style - red, opacity 0.8, visible, no offset
        batchStyles.set(0, {
            color: "#ff0000",
            opacity: 0.8,
            visible: true,
            offset: 0
        });

        // Add test style - green, opacity 0.6, visible, with offset
        batchStyles.set(1, {
            color: "#00ff00",
            opacity: 0.6,
            visible: true,
            offset: 1.5
        });

        // Add test style - blue, opacity 0.4, invisible
        batchStyles.set(2, {
            color: "#0000ff",
            opacity: 0.4,
            visible: false
        });

        // Set batch styles
        material.setBatchStyles(batchStyles);

        // Get texture data and dimensions
        const textureData = material.getTextureData();
        const dimensions = material.getTextureDimensions();
        const uniforms = material.getUniforms();

        console.log("=== Texture Information ===");
        console.log("Dimensions:", dimensions);
        console.log("Uniforms:", {
            textureWidth: uniforms.textureWidth.value,
            textureHeight: uniforms.textureHeight.value
        });

        if (textureData) {
            console.log("Texture data length:", textureData.length);

            // Analyze data for each batchId
            for (let batchId = 0; batchId < 3; batchId++) {
                console.log(`\n=== Batch ID ${batchId} ===`);
                const startIndex = batchId * 4 * 4; // 4 texels * 4 components

                // First texel: Color (RGB) + Opacity (A)
                const colorR = textureData[startIndex];
                const colorG = textureData[startIndex + 1];
                const colorB = textureData[startIndex + 2];
                const opacity = textureData[startIndex + 3];
                console.log(
                    `Color texel [${startIndex}-${
                        startIndex + 3
                    }]: RGB(${colorR}, ${colorG}, ${colorB}), Opacity: ${opacity}`
                );

                // Second texel: Offset X + Offset Y + Offset Z + End Offset X
                const offsetX = textureData[startIndex + 4];
                const offsetY = textureData[startIndex + 5];
                const offsetZ = textureData[startIndex + 6];
                const endOffsetX = textureData[startIndex + 7];
                console.log(
                    `Offset texel [${startIndex + 4}-${
                        startIndex + 7
                    }]: Offset(${offsetX}, ${offsetY}, ${offsetZ}), EndOffsetX: ${endOffsetX}`
                );

                // Third texel: End Offset Y + End Offset Z + End Opacity + Visibility
                const endOffsetY = textureData[startIndex + 8];
                const endOffsetZ = textureData[startIndex + 9];
                const endOpacity = textureData[startIndex + 10];
                const visible = textureData[startIndex + 11];
                console.log(
                    `Visibility texel [${startIndex + 8}-${
                        startIndex + 11
                    }]: EndOffset(${endOffsetY}, ${endOffsetZ}), EndOpacity: ${endOpacity}, Visible: ${visible}`
                );

                // Fourth texel: End Color (RGB) + Whether there is transition animation
                const endColorR = textureData[startIndex + 12];
                const endColorG = textureData[startIndex + 13];
                const endColorB = textureData[startIndex + 14];
                const hasTransition = textureData[startIndex + 15];
                console.log(
                    `Transition texel [${startIndex + 12}-${
                        startIndex + 15
                    }]: EndColor(${endColorR}, ${endColorG}, ${endColorB}), HasTransition: ${hasTransition}`
                );
            }
        }

        // Verify key data
        expect(textureData).to.not.be.null;
        expect(dimensions).to.not.be.null;

        if (textureData) {
            // Verify data for batchId 0 (red, opacity 0.8, visible, no offset)
            const startIndex0 = 0;
            expect(textureData[startIndex0]).to.be.closeTo(1, 0.01); // R
            expect(textureData[startIndex0 + 1]).to.be.closeTo(0, 0.01); // G
            expect(textureData[startIndex0 + 2]).to.be.closeTo(0, 0.01); // B
            expect(textureData[startIndex0 + 3]).to.be.closeTo(0.8, 0.01); // Opacity

            // Verify data for batchId 1 (green, opacity 0.6, visible, with offset)
            const startIndex1 = 16;
            expect(textureData[startIndex1]).to.be.closeTo(0, 0.01); // R
            expect(textureData[startIndex1 + 1]).to.be.closeTo(1, 0.01); // G
            expect(textureData[startIndex1 + 2]).to.be.closeTo(0, 0.01); // B
            expect(textureData[startIndex1 + 3]).to.be.closeTo(0.6, 0.01); // Opacity
            expect(textureData[startIndex1 + 5]).to.be.closeTo(1.5, 0.01); // OffsetY (numeric offset is processed as Y-axis offset)

            // Verify data for batchId 2 (blue, opacity 0.4, invisible)
            const startIndex2 = 32;
            expect(textureData[startIndex2]).to.be.closeTo(0, 0.01); // R
            expect(textureData[startIndex2 + 1]).to.be.closeTo(0, 0.01); // G
            expect(textureData[startIndex2 + 2]).to.be.closeTo(1, 0.01); // B
            expect(textureData[startIndex2 + 3]).to.be.closeTo(0, 0.01); // Opacity (because visible=false, transparency is set to 0)
            expect(textureData[startIndex2 + 11]).to.be.closeTo(0, 0.01); // Visible (false)
        }

        console.log("All tests passed!");
    });

    /**
     * Test the correctness of animation transition data
     */
    it("should correctly handle animated transitions", () => {
        const batchStyles = new Map<number, Tile3DBatchMeshTechniqueParams>();

        // Add style with animation transition
        batchStyles.set(0, {
            color: { from: "#ff0000", to: "#00ff00" },
            opacity: { from: 0.5, to: 1.0 },
            visible: true,
            offset: { from: 0, to: 2 }
        });

        material.setBatchStyles(batchStyles);

        // Get texture data
        const textureData = material.getTextureData();

        if (textureData) {
            console.log("=== Animated Transition Data ===");
            const startIndex = 0;

            // Check start values
            console.log(
                "Start Color (RGB):",
                textureData[startIndex],
                textureData[startIndex + 1],
                textureData[startIndex + 2]
            );
            console.log("Start Opacity:", textureData[startIndex + 3]);
            console.log("Start Offset X:", textureData[startIndex + 4]);

            // Check end values
            console.log(
                "End Color (RGB):",
                textureData[startIndex + 12],
                textureData[startIndex + 13],
                textureData[startIndex + 14]
            );
            console.log("End Opacity:", textureData[startIndex + 10]);
            console.log(
                "End Offset (Y,Z):",
                textureData[startIndex + 8],
                textureData[startIndex + 9]
            );

            // Check if there is a transition marker
            console.log("Has Transition:", textureData[startIndex + 15]);

            // Verify transition data correctness
            expect(textureData[startIndex]).to.be.closeTo(1, 0.01); // Start R (red)
            expect(textureData[startIndex + 1]).to.be.closeTo(0, 0.01); // Start G
            expect(textureData[startIndex + 2]).to.be.closeTo(0, 0.01); // Start B
            expect(textureData[startIndex + 3]).to.be.closeTo(0.5, 0.01); // Start Opacity

            expect(textureData[startIndex + 12]).to.be.closeTo(0, 0.01); // End R (green)
            expect(textureData[startIndex + 13]).to.be.closeTo(1, 0.01); // End G
            expect(textureData[startIndex + 14]).to.be.closeTo(0, 0.01); // End B
            expect(textureData[startIndex + 15]).to.be.closeTo(1, 0.01); // Has Transition
        }

        console.log("Animated transition test passed!");
    });
});
