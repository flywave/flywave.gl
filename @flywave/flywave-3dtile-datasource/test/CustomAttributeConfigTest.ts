/* Copyright (C) 2025 flywave.gl contributors */

import { type StyleSetOptions } from "@flywave/flywave-datasource-protocol/StyleSetEvaluator";

import { BatchStyleProcessor } from "../src/theme/BatchStyleProcessor";

/**
 * Custom attribute configuration test
 * Show how to use different attribute name configurations
 */
export class CustomAttributeConfigTest {
    /**
     * Test using default attribute name (_BATCHID)
     */
    testDefaultAttributeName(): void {
        const styleSetOptions: StyleSetOptions = {
            styleSet: [
                {
                    when: "batchId === 0",
                    technique: "batch-mesh" as any,
                    value: 10,
                    color: "#ff0000",
                    opacity: 0.8,
                    visible: true
                }
            ]
        };

        const processor = new BatchStyleProcessor(styleSetOptions);

        // Create test properties
        const properties = {
            batchId: 0,
            height: 150,
            type: "building"
        };

        // Get batch style
        const batchStyle = processor.getBatchStyle(properties);
        console.log("Default attribute name style:", batchStyle);
    }

    /**
     * Test using custom attribute name (custom_attribute_2)
     */
    testCustomAttributeName(): void {
        const styleSetOptions: StyleSetOptions = {
            styleSet: [
                {
                    when: "height > 100",
                    technique: "batch-mesh" as any,
                    value: 10,
                    color: "#ff0000",
                    opacity: 0.8,
                    visible: true
                }
            ]
        };

        const processor = new BatchStyleProcessor(styleSetOptions);

        // Create test properties (using custom attribute name)
        const properties = {
            custom_attribute_2: 0,
            height: 150,
            type: "building"
        };

        // Get batch style
        const batchStyle = processor.getBatchStyle(properties);
        console.log("Custom attribute name style:", batchStyle);
    }

    /**
     * Test complex attribute mapping
     */
    testComplexAttributeMapping(): void {
        const styleSetOptions: StyleSetOptions = {
            styleSet: [
                {
                    when: "building_height > 100 && building_type === 'skyscraper'",
                    technique: "batch-mesh" as any,
                    value: {
                        from: 10,
                        to: 50
                    },
                    valueAnimation: {
                        easing: "ease-in-out",
                        duration: 2000
                    },
                    color: "#ff5500",
                    opacity: {
                        from: 0.2,
                        to: 0.9
                    },
                    visible: true,
                    offset: {
                        from: 0,
                        to: 10
                    },
                    direction: "up"
                }
            ]
        };

        const processor = new BatchStyleProcessor(styleSetOptions);

        // Create test properties (using mapped attribute names)
        const properties = {
            building_height: 150,
            building_type: "skyscraper",
            id: 123
        };

        // Get batch style
        const batchStyle = processor.getBatchStyle(properties);
        console.log("Complex attribute mapping style:", batchStyle);
    }
}

// Run test
const test = new CustomAttributeConfigTest();
test.testDefaultAttributeName();
test.testCustomAttributeName();
test.testComplexAttributeMapping();
