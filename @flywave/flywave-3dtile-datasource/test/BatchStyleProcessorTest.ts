/* Copyright (C) 2025 flywave.gl contributors */

import { type ValueMap } from "@flywave/flywave-datasource-protocol";
import { type StyleSetOptions } from "@flywave/flywave-datasource-protocol/StyleSetEvaluator";
import { expect } from "chai";

import { BatchStyleProcessor } from "../src/theme/BatchStyleProcessor";

describe("BatchStyleProcessor", function () {
    it("should process batch styles with layer and geometryType", function () {
        // Create style set options
        const styleSetOptions: StyleSetOptions = {
            styleSet: [
                {
                    when: "height > 100",
                    technique: "tile3d",
                    color: "#ff0000",
                    opacity: 0.8,
                    visible: true
                }
            ]
        };

        // Create batch style processor
        const processor = new BatchStyleProcessor(styleSetOptions);

        // Create test properties
        const properties: ValueMap = {
            batchId: 1,
            height: 150
        };

        // Get batch style
        const batchStyle = processor.getBatchStyle(properties, "3dtiles", "mesh");

        // Verify results
        expect(batchStyle.color).to.equal("#ff0000");
        expect(batchStyle.opacity).to.equal(0.8);
        expect(batchStyle.visible).to.equal(true);
    });

    it("should use default layer and geometryType when not provided", function () {
        // Create style set options
        const styleSetOptions: StyleSetOptions = {
            styleSet: [
                {
                    when: "batchId === 0",
                    technique: "tile3d",
                    color: "#00ff00",
                    opacity: 0.6,
                    visible: true
                }
            ]
        };

        // Create batch style processor
        const processor = new BatchStyleProcessor(styleSetOptions);

        // Create test properties
        const properties: ValueMap = {
            batchId: 0
        };

        // Get batch style, do not provide layer and geometryType parameters
        const batchStyle = processor.getBatchStyle(properties);

        // Verify results
        expect(batchStyle.color).to.equal("#00ff00");
        expect(batchStyle.opacity).to.equal(0.6);
        expect(batchStyle.visible).to.equal(true);
    });

    it("should handle transition values", function () {
        // Create style set options
        const styleSetOptions: StyleSetOptions = {
            styleSet: [
                {
                    when: "height > 100",
                    technique: "tile3d",
                    opacity: { from: 0.2, to: 0.9 },
                    visible: true
                }
            ]
        };

        // Create batch style processor
        const processor = new BatchStyleProcessor(styleSetOptions);

        // Create test properties
        const properties: ValueMap = {
            batchId: 1,
            height: 150
        };

        // Get batch style
        const batchStyle = processor.getBatchStyle(properties, "3dtiles", "mesh");

        // Verify results
        expect(batchStyle.opacity).to.deep.equal({ from: 0.2, to: 0.9 });
        expect(batchStyle.visible).to.equal(true);
    });
});
