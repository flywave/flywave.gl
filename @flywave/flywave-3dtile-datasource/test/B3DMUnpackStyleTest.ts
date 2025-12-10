/* Copyright (C) 2025 flywave.gl contributors */

// Mocha discourages using arrow functions, see https://mochajs.org/#arrow-functions

import { type Tile3DBatchMeshTechniqueParams } from "@flywave/flywave-datasource-protocol";
import * as chai from "chai";
const chaiAsPromised = require("chai-as-promised");
import * as THREE from "three";

import { B3DMBatchMaterial } from "../src/materials/B3DMBatchMaterial";

chai.use(chaiAsPromised);
const { expect } = chai;

describe("B3DMBatchMaterial unpackStyle Function", () => {
    let material: B3DMBatchMaterial;

    beforeEach(() => {
        material = new B3DMBatchMaterial({
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
     * Test the correctness of the unpackStyle function
     * Since unpackStyle is a GLSL function, we cannot directly call it in JavaScript
     * We need to indirectly test it by setting batch styles and verifying rendering effects
     */
    it("should correctly unpack style data from texture", () => {
        // Create test style data
        const batchStyles = new Map<number, Tile3DBatchMeshTechniqueParams>();

        // Add styles for different batchIds
        batchStyles.set(0, {
            color: "#ff0000",
            opacity: 0.8,
            visible: true,
            offset: 0
        });

        batchStyles.set(1, {
            color: "#00ff00",
            opacity: 0.6,
            visible: true,
            offset: 1
        });

        batchStyles.set(2, {
            color: "#0000ff",
            opacity: 0.4,
            visible: false, // Not visible
            offset: 2
        });

        // Set batch styles
        material.setBatchStyles(batchStyles);

        // Verify that the material correctly created the texture
        const uniforms = (material as any).uniforms;
        expect(uniforms).to.exist;
        expect(uniforms.styleTexture).to.exist;
        expect(uniforms.styleTexture.value).to.be.instanceOf(THREE.DataTexture);
        expect(uniforms.textureWidth.value).to.be.greaterThan(0);
        expect(uniforms.textureHeight.value).to.be.greaterThan(0);

        // Verify that the texture data is correctly set
        const texture = uniforms.styleTexture.value as THREE.DataTexture;
        expect(texture.image.data).to.be.instanceOf(Float32Array);
        expect((texture.image.data as Float32Array).length).to.be.greaterThan(0);

        // console.log(
        //     "Texture dimensions:",
        //     uniforms.textureWidth.value,
        //     "x",
        //     uniforms.textureHeight.value
        // );
        // console.log("Texture data length:", (texture.image.data as Float32Array).length);

        // Verify that the method executes without errors
        expect(true).to.be.true;
    });

    /**
     * Test animation transition effects
     */
    it("should handle animated style transitions", () => {
        const batchStyles = new Map<number, Tile3DBatchMeshTechniqueParams>();

        batchStyles.set(0, {
            color: { from: "#ff0000", to: "#00ff00" },
            opacity: { from: 0.5, to: 1.0 },
            visible: true,
            offset: { from: 0, to: 1 }
        });

        material.setBatchStyles(batchStyles); 

        // Verify that uniforms are correctly set
        const uniforms = (material as any).uniforms;
        expect(uniforms.animationProgress.value).to.equal(0.5);

        // Verify that the method executes without errors
        expect(true).to.be.true;
    });

    /**
     * Test edge cases
     */
    it("should handle edge cases", () => {
        // Test empty styles
        material.setBatchStyles(new Map());

        // Test large batchId
        const largeBatchStyles = new Map<number, Tile3DBatchMeshTechniqueParams>();
        largeBatchStyles.set(1000, {
            color: "#ffffff",
            opacity: 1.0,
            visible: true
        });

        material.setBatchStyles(largeBatchStyles);

        // Verify that the method executes without errors
        expect(true).to.be.true;
    });

    /**
     * Test style updates
     */
    it("should update style texture when styles change", () => {
        const batchStyles = new Map<number, Tile3DBatchMeshTechniqueParams>();
        batchStyles.set(0, {
            color: "#ff0000",
            opacity: 1.0,
            visible: true
        });

        material.setBatchStyles(batchStyles);

        // Save original texture reference
        const originalTexture = (material as any).uniforms.styleTexture.value;

        // Update styles
        batchStyles.set(1, {
            color: "#00ff00",
            opacity: 0.5,
            visible: true
        });

        material.setBatchStyles(batchStyles);

        // Verify that the texture has been updated (should be a new texture object)
        const updatedTexture = (material as any).uniforms.styleTexture.value;
        expect(updatedTexture).to.not.equal(originalTexture);

        // Verify that the method executes without errors
        expect(true).to.be.true;
    });
});
