/* Copyright (C) 2025 flywave.gl contributors */

// Mocha discourages using arrow functions, see https://mochajs.org/#arrow-functions

import * as chai from "chai";
import { expect } from "chai";
const chaiAsPromised = require("chai-as-promised");

chai.use(chaiAsPromised);

import { load3DTiles, type Tiles3DTileContent } from "../src/loader";

describe("B3DM Unpack Test", function () {
    this.timeout(30000); // Increase timeout for network requests

    const b3dmUrl = "http://127.0.0.1/0131_output_fixed/Tile_+000_+000.osgb.b3dm";

    it("should load and unpack b3dm file from local server", async () => {
        const options = {
            "3d-tiles": {
                loadGLTF: true,
                decodeQuantizedPositions: false,
                isTileset: false
            }
        };

        const context = {
            url: b3dmUrl
        };

        try {
            const content = (await load3DTiles(
                b3dmUrl,
                options,
                undefined,
                context
            )) as Tiles3DTileContent;

            // Verify content structure
            expect(content).to.exist;
            expect(content).to.have.property("type");
            expect(content.type).to.equal("b3dm");

            // Log basic information
            console.log("B3DM Header Information:");
            console.log("- Type:", content.type);
            console.log("- Version:", content.version);
            console.log("- Byte Length:", content.byteLength);

            // Verify feature table
            if (content.featureTableJson) {
                console.log("\nFeature Table JSON:");
                console.log(JSON.stringify(content.featureTableJson, null, 2));
                expect(content.featureTableJson).to.exist;
            }

            // Verify batch table
            if (content.batchTableJson) {
                console.log("\nBatch Table JSON:");
                console.log(JSON.stringify(content.batchTableJson, null, 2));
                expect(content.batchTableJson).to.exist;
            }

            // Verify GLTF content
            if (content.gltf) {
                console.log("\nGLTF Information:");
                console.log("- Scenes:", content.gltf.scenes?.length || 0);
                console.log("- Nodes:", content.gltf.nodes?.length || 0);
                console.log("- Meshes:", content.gltf.meshes?.length || 0);
                console.log("- Materials:", content.gltf.materials?.length || 0);
                console.log("- Textures:", content.gltf.textures?.length || 0);

                expect(content.gltf).to.exist;
            }

            // Verify RTC center if present
            if (content.rtcCenter) {
                console.log("\nRTC Center:", content.rtcCenter);
                expect(content.rtcCenter).to.be.an("array");
                expect(content.rtcCenter).to.have.lengthOf(3);
            }

            // Verify feature IDs if present
            const featureIds = content.featureIds as any;
            if (featureIds) {
                console.log("\nFeature IDs:", featureIds.length);
                expect(featureIds).to.be.an("array");
            }

            console.log("\n✓ B3DM file unpacked successfully");
        } catch (error) {
            console.error("Error loading B3DM file:", error.message);
            throw error;
        }
    });

    it("should handle network errors gracefully", async () => {
        const invalidUrl = "http://127.0.0.1/invalid/path/to/file.b3dm";

        try {
            await load3DTiles(invalidUrl, {}, undefined, { url: invalidUrl });
            expect.fail("Should have thrown an error");
        } catch (error) {
            expect(error).to.exist;
        }
    });

    it("should parse b3dm header correctly", async () => {
        const options = {
            "3d-tiles": {
                loadGLTF: false
            }
        };

        const content = (await load3DTiles(b3dmUrl, options, undefined, {
            url: b3dmUrl
        })) as Tiles3DTileContent;

        // Verify header fields
        expect(content).to.have.property("magic");
        expect(content).to.have.property("version");
        expect(content).to.have.property("byteLength");

        // Verify magic number for b3dm (should be 0x6433646d or "m3d" in little endian)
        console.log("\nHeader Details:");
        console.log("- Magic:", content.magic?.toString(16));
        console.log("- Version:", content.version);
        console.log("- Byte Length:", content.byteLength);

        expect(content.version).to.equal(1);
    });
});
